<!-- 此文件从 content/http/webhooks.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-28T10:08:47.733Z -->
<!-- 源文件: content/http/webhooks.md -->
<!-- 源哈希: b8e22e20cf94167791f3213a4a4964de -->

### Webhooks

`@nestjs/webhooks` 在交易提交后向您的合作伙伴发送签名、重试的 webhook，并验证您收到的原始请求体中的 webhook。

> info **提示** 在完整的商店中，有关支付提供商的 webhook，请遵循 [Accept payments with webhooks in Node.js](/tutorials/payments-webhooks)。

一个销售猫粮和用品的在线商店通过其 API 向猫舍和批量采购的经销商销售。经销商 Northside Pet Supplies 下了一个订单，希望在不轮询的情况下知道何时发货和何时取消：即向其仓库系统发送一个 webhook。商店也会接收 webhook：支付提供商报告付款，承运商报告发货。两个方向看起来都很简单，但都以相同的方式出错：

- **发送。** 在订单提交后，`fetch()` 在过程中死亡时会丢失，并会为随后回滚的交易发送。重试会两次发送相同的事件，但不会告知合作伙伴。每个合作伙伴都会为自制的签名编写自己的验证器。一个宕机一小时的合作伙伴会遭受大量请求轰炸，一个死掉的端点永远不会被关闭，没有人能回答“你发送了吗？”。而合作伙伴输入的 URL 是一个等待发生的服务器端请求伪造：`https://169.254.169.254/` 以云凭证进行响应。
- **接收。** 签名是在框架解析并再次序列化的请求体上检查的（一个多余的空格就会破坏它，被篡改的请求体也可能通过），而不是在常数时间内比较的，没有时间戳窗口，并且重发事件会两次运行处理器：订单被标记为已支付两次，或发货两次。

`@nestjs/webhooks` 使两个方向的配置统一化。传出 webhook 通过 [outbox](/reliability/outbox) 传输：`webhooks.dispatch()` 在与订单相同的事务中添加消息，提交后，一个工作进程将其分发到合作伙伴的端点，按照 [Standard Webhooks](https://www.standardwebhooks.com) 指定的方式对每个请求进行签名，带有指数退避策略重试约两天，保留每次尝试的日志，并可按请求重放。传入 webhook 是一个装饰器 `@VerifyWebhook()`，它在原始请求体上检查签名并跳过重发。

在本教程中，您将在使用 Drizzle 和 PostgreSQL 的商店订单 API 中添加 webhook：

- 合作伙伴通过 API 订阅 `order.shipped` 和 `order.cancelled`，并仅查看一次其密钥。
- API 在提交后发送签名后的 webhook，并在合作伙伴宕机时重试。
- 合作伙伴读取其交付日志，并请求重放。
- API 接收支付提供商的付款 webhook（标准 webhook）和承运商的发货 webhook（Stripe 方案），在原始请求体上验证并精确处理一次。
- 密钥无间隙轮换，并且会拒绝指向商店内部网络的 URL。

#### 安装

要开始，请安装所需的依赖：

```bash
$ npm i --save @nestjs/webhooks

```

本教程在 PostgreSQL 上运行，通过 [Drizzle ORM](https://orm.drizzle.team) 和 [`@nestjs/drizzle`](https://docs.nestjs.com/data/drizzle) 使用 `pg` 驱动：端点和交付日志存储在与订单相同的数据库中，该数据库运行在比任何应用程序实例都更持久的数据库服务器上。使用 TypeORM 还是 MySQL？请遵循教程，并查看 [Keep webhooks in your database](/http/webhooks#keep-webhooks-in-your-database) 中的“使用 TypeORM”和“使用 MySQL”了解变化。

传出 webhook 是出库消息，传入 webhook 则与出库的收件箱进行去重，因此应用程序也运行出库（`@nestjs/outbox`，已在 [the outbox tutorial](/reliability/outbox) 中安装和设置）。

示例应用程序（在线商店的订单 API）在其自己的三个表中保留其目录、调用它的合作伙伴及其订单，后续部分会读取和写入这些表。它们是示例的数据，而不是 webhook 所需的：webhook 和出库的表属于它们创建的商店，如 [Keep webhooks in your database](/http/webhooks#keep-webhooks-in-your-database) 所示。

`products` 是目录：

| 列 | 类型 | 备注 |
| --- | --- | --- |
| `id` | `text` | 主键，例如 `salmon-kibble-2kg` |
| `name` | `text` | 显示名称，例如 `Salmon kibble, 2 kg` |
| `price` | `integer` | 以分计 |

`partners` 存储通过 API 批量采购并接收 webhook 的猫舍和经销商：

| 列 | 类型 | 备注 |
| --- | --- | --- |
| `id` | `text` | 主键，例如 `northside` |
| `name` | `text` | 显示名称，例如 `Northside Pet Supplies` |
| `api_key_hash` | `text` | 合作伙伴 API 密钥的 SHA-256，十六进制表示。唯一 |

`orders` 存储合作伙伴的订单，其 `status` 的状态从 `placed` 到 `paid` 和 `shipped`，或到 `cancelled`：

| 列 | 类型 | 备注 |
| --- | --- | --- |
| `id` | `text` | 主键 |
| `partner_id` | `text` | 引用 `partners.id` |
| `items` | `jsonb` | 订单行，作为 JSON 数组：每行的 `productId`、`quantity` 和单位 `price`（以分计） |
| `total` | `integer` | 以分计 |
| `status` | `text` | `placed`、`paid`、`shipped` 或 `cancelled` |
| `payment_id` | `text` | 可空：订单支付时设置 |
| `tracking_number` | `text` | 可空：订单发货时设置 |

其他列不可为空。

目录中有两个产品，`salmon-kibble-2kg` 价格为 2499 分，`clumping-litter-10l` 价格为 1599 分，两个合作伙伴有示例 API 密钥（请从合作伙伴入职中获取真实密钥）：

| 合作伙伴 | `id` | API 密钥 |
| --- | --- | --- |
| Northside Pet Supplies，经销商 | `northside` | `partner_northside_7c1d2e` |
| Riverside Cat Shelter | `riverside` | `partner_riverside_91ab44` |

#### 将 webhook 保存在数据库中

对于 webhook 或它们经过的 outbox，没有需要创建的实体，没有表、实体或 Prisma 模型。注册它们的两个存储，每个存储都会创建自己的 **模式**，`nest_webhooks` 和 `nest_outbox`，并在启动时（开发和测试中）以及在生产环境中（使用 `npx @nestjs/webhooks migrate` 和 `npx @nestjs/outbox migrate`，或使用您自己的 **迁移** 中的 `migrationSql()`）进行 **迁移**。

该包将端点、其密钥、已分发的消息、其投递以及每次尝试的日志保存在一个 **存储** 中，它通过两个契约 `WebhookEndpointStore` 和 `WebhookDeliveryStore` 读取。在注册一个存储之前，该 **模块** 将它们保存在内存中：首次运行时没问题，但重启会丢失所有待处理的投递，并且两个实例不会共享它们。

> 警告 **警告** 如果使用 `NODE_ENV=production` 且未注册存储，启动将失败，除非设置了 `allowInMemoryStorage: true`。

在 PostgreSQL 上，从 `@nestjs/webhooks/postgres` 注册该包的存储 `PostgresWebhookStore`。outbox 也需要一个，用于将已分发的 webhook 从事务中取出，以及用于去重传入 webhook 的 inbox：从 `@nestjs/outbox/postgres` 注册 `PostgresOutboxStore`，如 [the outbox tutorial](/reliability/outbox#keep-messages-in-your-database) 所示。两者都通过您的应用程序已有的数据库客户端运行 SQL，并将它们的表保存在各自的 **模式** 中。它们是普通的 **提供者**，在根 **模块** 中注册一次，与 `WebhooksModule` 和 `OutboxModule` 并列：这四个都是应用范围的。`AppModule` 使用一个 **工厂提供者** 为每个存储创建，该 **工厂提供者** 注入 Drizzle 数据库及其包的存储注册表，存储会向其注册自己：

```typescript title="app.module.ts"
{
  // Outbox messages and the inbox, in your database, in a schema of their own (nest_outbox)
  provide: PostgresOutboxStore,
  inject: [getDrizzleToken(), OutboxStorage],
  useFactory: (db: Database, outboxStorage: OutboxStorage) =>
    new PostgresOutboxStore({ executor: fromDrizzle(db) }, outboxStorage),
},
{
  // Endpoints, deliveries and their log, in your database, in a schema of their own (nest_webhooks)
  provide: PostgresWebhookStore,
  inject: [getDrizzleToken(), WebhooksStorage],
  useFactory: (db: Database, webhooksStorage: WebhooksStorage) =>
    new PostgresWebhookStore({ executor: fromDrizzle(db) }, webhooksStorage),
},

```

`fromDrizzle(db)` 是存储的 **执行器**：它通过您的 Drizzle 数据库运行它们的语句，无论使用哪个驱动程序，例如 `pg` 或 PGlite。`fromPg(pool)`、`fromTypeOrm(dataSource)`、`fromPrisma(prisma)` 和 `fromKysely(db)` 对 node-postgres 连接池、TypeORM、Prisma 和 Kysely 执行相同操作。`@nestjs/webhooks/postgres` 和 `@nestjs/outbox/postgres` 都导出它们，因此 `AppModule` 仅导入 `fromDrizzle` 一次，用于两个存储。在启动时，每个 **模块** 都会记录它使用的存储。

**模式**。webhook 存储将其表保存在自己的 **模式** 中，`nest_webhooks`（`schema` 选项指定了另一个）。在没有 **模式** 的 MySQL 上，它们是连接数据库的表，**模式** 名称作为它们的前缀：`nest_webhooks_endpoints` 等。

| 表 | 存储内容 |
| --- | --- |
| `nest_webhooks.endpoints` | 合作伙伴的端点：URL、事件类型、租户和密钥 |
| `nest_webhooks.messages` | 按字节分发的内容 |
| `nest_webhooks.deliveries` | 每个消息和端点的一个记录，包含其状态、尝试次数和租约 |
| `nest_webhooks.delivery_attempts` | 日志：每次尝试，包含状态码、响应和耗时 |
| `nest_webhooks.migrations` | 应用的存储 **模式** 版本 |

outbox 的存储将其消息、死信和 inbox 保存在 `nest_outbox`（MySQL 上为 `nest_outbox_messages` 等），如 [the outbox tutorial](/reliability/outbox#keep-messages-in-your-database) 所示。它们属于存储：您的 **迁移** 不会创建它们，并且您自己的表不会与它们冲突。其中的一些选择对该包很重要：

- 端点的密钥是一个 JSON 数组，最新在前：在轮换期间，旧密钥会保留以覆盖，并有过期时间。配置了 `encryption`（参见 [Register the modules](/http/webhooks#register-the-modules)）后，存储的内容是密封的。
- 消息的 `body` 是 `text`，而不是 `jsonb`。它是被签名和发送的确切 JSON，而 `jsonb` 会重新格式化它：存储请求及其签名的合作伙伴将无法验证重放。
- 每次投递是针对特定消息和端点的唯一。创建投递的扇出在提交后、在 outbox 内部运行，因此可以运行两次；唯一键使得第二次运行不插入任何内容。
- 投递到其端点的外键：已删除的端点的日志会保留。尝试与它们的投递一起保留。
- 时间是纪元毫秒（`bigint`），来自包的时钟，而不是数据库的时钟。

**迁移**。该包以版本化 **迁移** 的形式提供其 **模式**，存储自行应用它们。使用 `migrate` 选项时，每个存储在启动时应用其尚未应用的 **迁移**，在中继和工作者运行之前，在一个持有咨询锁的事务中：在同时启动的多个实例中，一个进行 **迁移**，其他实例发现没有剩余工作。`migrate` 默认为 `true`，除非使用 `NODE_ENV=production`。因此，在开发和测试中，存储在首次启动时创建其 **模式**，而您的 **迁移** 只创建您自己的表。

在生产环境中，请在应用程序的新版本启动之前应用 **迁移**，就像您应用自己的 **迁移** 一样，这样在启动时就不会有任何实例更改 **模式**：在滚动部署过程中，这将锁定繁忙的表，而且最小权限的数据库用户也无法做到这一点。该包的命令行工具在您的部署步骤中执行此操作，与 `npx drizzle-kit migrate` 并列。它们从 `DATABASE_URL` 或 `--url` 读取数据库，并且需要安装 `pg`：

```bash
$ npx @nestjs/webhooks status
Schema "nest_webhooks" is at version 0; this version of @nestjs/webhooks needs version 1.
$ npx @nestjs/webhooks migrate
Migrated schema "nest_webhooks" to version 1 (applied 1).
$ npx @nestjs/outbox migrate
Migrated schema "nest_outbox" to version 1 (applied 1).

```

如果 **模式** 落后，`status` 以 1 退出，这使其成为 CI 的检查项。如果想使用您自己的 **迁移** 工具应用 **迁移**，请从 `npx @nestjs/webhooks sql` 和 `npx @nestjs/outbox sql` 或代码中的 `PostgresWebhookStore.migrationSql()` 和 `PostgresOutboxStore.migrationSql()` 获取它们的 SQL：每个 **迁移** 的语句，以及记录版本的簿记。像 TypeORM 和 Drizzle 的 **迁移** 工具那样，将每个语句在一个事务中运行。使用 TypeORM 时，这是您自己的 **迁移**，与它为您的 **实体** 生成的 **迁移** 并列：

```typescript title="typeorm/migrations/1790801311590-WebhookStores.ts"
import { PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { PostgresWebhookStore } from '@nestjs/webhooks/postgres';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class WebhookStores1790801311590 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(PostgresOutboxStore.migrationSql());
    await queryRunner.query(PostgresWebhookStore.migrationSql());
  }

  async down(): Promise<void> {
    throw new Error('The webhook and outbox stores have no down migrations.');
  }
}

```

使用 drizzle-kit，为每个存储创建自定义 **迁移**，并用其 SQL 填充文件，语句之间有一个 `--> statement-breakpoint` 行：Drizzle 的 **迁移** 工具然后逐个运行它们，PGlite 需要此操作。在代码中，`migrationSql()` 配合 `statementBreakpoints: true` 返回相同的结果。

```bash
$ npx drizzle-kit generate --custom --name=outbox
$ npx @nestjs/outbox sql --statement-breakpoints > drizzle/20261103120000_outbox/migration.sql
$ npx drizzle-kit generate --custom --name=webhooks
$ npx @nestjs/webhooks sql --statement-breakpoints > drizzle/20261103120100_webhooks/migration.sql

```

在 MySQL 上，存储的 `migrationStatements()` 以每行一个字符串的形式返回语句，而 TypeORM **迁移** 以每次调用一个语句运行：

```typescript title="typeorm/mysql-migrations/1790801311590-WebhookStores.ts"
for (const statement of [...MySqlOutboxStore.migrationStatements(), ...MySqlWebhookStore.migrationStatements()]) {
  await queryRunner.query(statement);
}

```

如果 `migrate` 关闭，其 **模式** 落后的存储将以 `WebhookSchemaError` 失败启动（outbox 的存储，带有 `OutboxSchemaError`），该错误以这三种方式命名，并且在 **模式** 赶上之前每次调用都以相同方式失败，它会在没有重启的情况下注意到这一点。在滚动部署期间，您应用程序的旧版本会继续在新版本已 **迁移** 的 **模式** 上运行。没有回滚 **迁移**。

**事务**。webhook 存储的任何方法都不会接收您的事务。`webhooks.dispatch(tx, ...)` 通过 outbox 的存储将消息添加到 outbox 中，并且 `webhook.processInTransaction(tx, ...)` 以相同方式在 outbox 的 inbox 中记录传入的 webhook；提交后的扇出、工作者和所有其他组件都在存储自己的连接上运行。使用 Drizzle，`tx` 是 `db.transaction()` 传递给其回调的内容，如后续部分所示。outbox 的存储拒绝数据库本身，因为其语句会自行提交，而是使用一个 `OutboxTransactionRequiredError` 来指定要传递的内容。对于其他 **执行器**，请在 `BEGIN` 之后传递一个 node-postgres 客户端（而不是连接池），TypeORM 的 `EntityManager`（来自 `dataSource.transaction()`），Prisma 的交互式事务客户端，或一个 Kysely 事务。

**隔离**。存储依赖于 READ COMMITTED，PostgreSQL 的默认隔离级别：它们的语句相互竞争，在更严格的级别下会因序列化错误而失败。在启动时，每个存储都会检查数据库的 `default_transaction_isolation`，如果更严格则失败。您自己的事务可以在任何级别运行。但在 REPEATABLE READ 或 SERIALIZABLE 下，一个在您的事务中由 `processInTransaction()` 处理的传入 webhook 的副本，与第一个提交竞争，将因 PostgreSQL 的序列化错误而失败，而不是被跳过作为重复项：发送方会收到错误，其重试会发现已记录了该 webhook。

**使用 TypeORM**。`TypeOrmModule` 取代了 `DrizzleModule` 在 `AppModule` 中，两个存储都运行在它提供的 `DataSource` 上，通过 `fromTypeOrm()`：

```typescript title="typeorm/app.module.ts"
{
  // Outbox messages and the inbox, in your database, in a schema of their own (nest_outbox)
  provide: PostgresOutboxStore,
  inject: [DataSource, OutboxStorage],
  useFactory: (dataSource: DataSource, outboxStorage: OutboxStorage) =>
    new PostgresOutboxStore({ executor: fromTypeOrm(dataSource) }, outboxStorage),
},
{
  // Endpoints, deliveries and their log, in your database, in a schema of their own (nest_webhooks)
  provide: PostgresWebhookStore,
  inject: [DataSource, WebhooksStorage],
  useFactory: (dataSource: DataSource, webhooksStorage: WebhooksStorage) =>
    new PostgresWebhookStore({ executor: fromTypeOrm(dataSource) }, webhooksStorage),
},

```

当教程将 Drizzle 的 `tx` 传递给 `dispatch()` 和 `processInTransaction()` 时，请传递 `EntityManager`，该 `dataSource.transaction()` 负责回调，并注入 `Webhooks<EntityManager>`。出库的存储拒绝 `dataSource.manager`，因为其写入会自行提交。这是订单服务的 `cancelOrder()`，来自 [Send order.shipped and order.cancelled after the commit](/http/webhooks#send-ordershipped-and-ordercancelled-after-the-commit)，使用 TypeORM：

```typescript title="typeorm/orders.service.ts"
const order = await this.dataSource.transaction(async (manager) => {
  const row = await manager.findOne(OrderEntity, { where: { id, partnerId: partner.id }, lock: { mode: 'pessimistic_write' } });
  if (!row) {
    throw new NotFoundException(`Order ${id} not found`);
  }
  if (row.status === 'shipped' || row.status === 'cancelled') {
    throw new ConflictException(`Order ${id} is ${row.status}`);
  }
  await manager.update(OrderEntity, id, { status: 'cancelled' });

  // The transaction's EntityManager: the webhook is sent only if the cancellation commits.
  const data: OrderCancelled = { orderId: id, reason };
  await this.webhooks.dispatch(manager, { type: 'order.cancelled', tenant: row.partnerId, data });
  return { ...row, status: 'cancelled' as const };
});

```

您的实体及其迁移保持不变：`migration:generate` 仅比较您的实体和数据库，而不更改存储的模式。

**使用 MySQL。** 在 MySQL 8.4 或 9.x 上，请从 `@nestjs/outbox/mysql` 和 `@nestjs/webhooks/mysql` 导入存储和执行器。提供者相同，使用 `MySqlOutboxStore` 和 `MySqlWebhookStore`，在一个 Drizzle 数据库 `drizzle-orm/mysql2` 上：

```typescript title="mysql/app.module.ts"
import { MySqlOutboxStore } from '@nestjs/outbox/mysql';
import { fromDrizzle, MySqlWebhookStore } from '@nestjs/webhooks/mysql';
import { drizzle } from 'drizzle-orm/mysql2';
// ...
DrizzleModule.forRootAsync({
  // Drizzle on MySQL: a mysql2 pool on DATABASE_URL (mysql://), whose database holds the stores' tables too
  useFactory: () => ({ drizzle, connection: process.env.DATABASE_URL! }),
}),
// ...
{
  // Outbox messages and the inbox, in your database, in tables of their own (nest_outbox_*)
  provide: MySqlOutboxStore,
  inject: [getDrizzleToken(), OutboxStorage],
  useFactory: (db: Database, outboxStorage: OutboxStorage) =>
    new MySqlOutboxStore({ executor: fromDrizzle(db) }, outboxStorage),
},
{
  // Endpoints, deliveries and their log, in your database, in tables of their own (nest_webhooks_*)
  provide: MySqlWebhookStore,
  inject: [getDrizzleToken(), WebhooksStorage],
  useFactory: (db: Database, webhooksStorage: WebhooksStorage) =>
    new MySqlWebhookStore({ executor: fromDrizzle(db) }, webhooksStorage),
},

```

对于其他客户端，执行器是 `fromMysql2(pool)` 用于 `mysql2/promise` 池，`fromTypeOrm(dataSource)` 用于类型为 `DataSource` 的 `mysql`，`fromPrisma(prisma)` 用于通过 `@prisma/adapter-mariadb` 的 Prisma，或 `fromKysely(db)` 用于 Kysely 的 `MysqlDialect`。与 PostgreSQL 的不同之处：

- **表，而非模式。** MySQL 在数据库内没有模式，因此存储将它们的表保留在连接的数据库中，即 URL 路径中的数据库，与您的数据库相邻，并且 `schema` 成为它们的前缀：`nest_webhooks_endpoints`、`nest_webhooks_deliveries` 等，以及用于出库的 `nest_outbox_messages`。它接受小写字母、数字和下划线，最多 40 个字符。
- **您的事务。** `dispatch()` 和 `processInTransaction()` 在 REPEATABLE READ（MySQL 的默认设置）下按 READ COMMITTED 工作：无需配置，存储也不会检查数据库的默认设置。当 MySQL 在您的事务中发生死锁时（错误 1213），它会回滚整个事务，客户端的错误会到达您的代码：重新运行事务。存储会自行再次运行其事务。使用 `processInTransaction()` 时，当一个 webhook 的副本同时到达时，可能会发生这种情况，第一个事务回滚：发送方收到错误，其重试会成功。
- **键是有界的。** ID 和租户是索引列：最多 255 个字符，租户最多 256 个字符，包自身的 ID 及其对 `tenant` 的限制都在范围内。传入 webhook 的 ID 会进入收件箱的键中，最多 255 个字符，并且验证器在处理程序运行之前，会对每个数据库拒绝更长的 ID，返回 401。
- **迁移不是一个事务。** MySQL 会单独提交每个 DDL 语句，因此 `migrate` 每次只应用一个语句，在锁（`GET_LOCK()`）下进行，失败的运行会从停止的语句处恢复。您的工具也必须每次调用发送一个语句，就像上面 **Migrations** 中的 TypeORM 迁移一样。命令行接受一个 `mysql://` URL，而 `sql --dialect mysql` 打印 MySQL 的 SQL：添加 `--statement-breakpoints` 用于 drizzle-kit 自定义迁移，因为其 MySQL 迁移器每次断点只发送一个语句。
- **服务器。** 存储在启动时检查它，并拒绝 MariaDB（没有数据库的连接）和不严格的 `sql_mode`（MySQL 的默认设置）。也请将 `NO_BACKSLASH_ESCAPES` 排除在外。

对于另一个数据库，编写您自己的存储：[The store contract](/http/webhooks#the-store-contract) 说明了必须做什么。

#### 注册模块

在根模块中注册 `OutboxModule` 和 `WebhooksModule`，紧邻注册 Drizzle 数据库的 `DrizzleModule`，并将两个存储放在其 `providers` 中。功能模块在接下来的部分构建：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { DrizzleModule, getDrizzleToken } from '@nestjs/drizzle';
import { OutboxModule, OutboxStorage } from '@nestjs/outbox';
import { PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { WebhooksModule, WebhooksStorage } from '@nestjs/webhooks';
import { fromDrizzle, PostgresWebhookStore } from '@nestjs/webhooks/postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Database } from './database/drizzle.js';
import * as schema from './database/schema.js';
import { OrdersModule } from './orders/orders.module.js';
import { PartnerWebhooksModule } from './partner-webhooks/partner-webhooks.module.js';

@Module({
  imports: [
    // A pg pool on DATABASE_URL, closed in onApplicationShutdown(), after the relay and the
    // worker drained. The services inject it with @InjectDrizzle(), the stores' factories too.
    DrizzleModule.forRootAsync({
      useFactory: () => ({ drizzle, connection: process.env.DATABASE_URL!, schema }),
    }),
    // Outgoing webhooks travel through the outbox: dispatched in the order's transaction,
    // handed to the webhooks worker after the commit.
    OutboxModule.forRootAsync({
      useFactory: () => ({
        relay: { enabled: process.env.OUTBOX_RELAY !== 'off', pollInterval: '1s' },
      }),
    }),
    WebhooksModule.forRootAsync({
      useFactory: () => ({
        // The types partners may subscribe to; dispatch() refuses any other.
        eventTypes: ['order.shipped', 'order.cancelled'],
        // Ten attempts: 5s, 20s, 80s, ... capped at a day, about two days in all.
        retry: { attempts: 10, backoff: { delay: '5s', factor: 4, maxDelay: '1d' } },
        // An endpoint that fails every attempt for five days is switched off.
        disableEndpointAfter: '5d',
        delivery: {
          timeout: '15s',
          // Development only: deliver over http:// and to this machine. Without it, only
          // public https:// endpoints are accepted.
          allowHttp: process.env.WEBHOOKS_ALLOW_LOCAL === '1',
          allowPrivateNetworks: process.env.WEBHOOKS_ALLOW_LOCAL === '1',
        },
        worker: { enabled: process.env.WEBHOOKS_WORKER !== 'off', pollInterval: '1s' },
        // Endpoint secrets at rest: the first key encrypts, every key decrypts.
        encryption: process.env.WEBHOOKS_ENCRYPTION_KEYS
          ? { keys: process.env.WEBHOOKS_ENCRYPTION_KEYS.split(',').map((key) => key.trim()) }
          : undefined,
      }),
    }),
    OrdersModule,
    PartnerWebhooksModule,
  ],
  providers: [
    {
      // Outbox messages and the inbox, in your database, in a schema of their own (nest_outbox)
      provide: PostgresOutboxStore,
      inject: [getDrizzleToken(), OutboxStorage],
      useFactory: (db: Database, outboxStorage: OutboxStorage) =>
        new PostgresOutboxStore({ executor: fromDrizzle(db) }, outboxStorage),
    },
    {
      // Endpoints, deliveries and their log, in your database, in a schema of their own (nest_webhooks)
      provide: PostgresWebhookStore,
      inject: [getDrizzleToken(), WebhooksStorage],
      useFactory: (db: Database, webhooksStorage: WebhooksStorage) =>
        new PostgresWebhookStore({ executor: fromDrizzle(db) }, webhooksStorage),
    },
  ],
})
export class AppModule {}

```

`WebhooksModule` 需要出库：`dispatch()` 是一个 `Outbox.add()`，而将已提交的消息转换为交付的扇出是一个出库处理器。没有 `OutboxModule`，启动就会失败并报告此错误。出库的 `relay` 将已提交的消息交给扇出，每秒轮询一次，而 `OUTBOX_RELAY=off` 会关闭它。其余选项在应用程序启动时解析：

- `eventTypes`：此应用程序发送的消息类型。`dispatch()` 拒绝任何其他类型，尝试订阅其中一种的端点也会拒绝，因为消息中包含已知的类型。
- `retry`：与出库、HTTP 客户端和弹性共享的词汇表。十次尝试，回退从 5 秒开始，四倍增长，上限为一天，带有抖动：符合标准 Webhooks 规范的“跨越数天的重试计划”。
- `disableEndpointAfter`：一个在五天内所有尝试都未成功而失败的端点将被关闭，并通知其所有者（参见 [Retries, the delivery log and replay](/http/webhooks#retries-the-delivery-log-and-replay)）。
- `delivery`：一次尝试有 15 秒用于 DNS、连接、TLS、请求和响应。`allowHttp` 和 `allowPrivateNetworks` 默认关闭：只接受公共 `https://` 端点。`WEBHOOKS_ALLOW_LOCAL=1` 在开发环境中开启它们，在该环境中合作伙伴的接收器在该机器上运行。即使如此，云元数据地址仍被阻止。
- `worker`：后台交付器，每个进程一个。`WEBHOOKS_WORKER=off` 在仅提供 API 的实例中将其关闭。
- `encryption`：端点密钥在静态存储中密封，具有家族形状：第一个密钥加密，每个密钥解密。可选，来自 `WEBHOOKS_ENCRYPTION_KEYS`。

> info **提示** 教程直接读取 `process.env` 以保持简洁。在应用程序中，通过 [`@nestjs/config`](/application/configuration) 使用验证模式加载环境变量，这样缺失的变量会在启动时而不是在第一个请求时停止应用程序，并从 `ConfigService`（在工厂中是 `inject: [ConfigService]`）读取值。

持续时间以毫秒或诸如 `'15s'` 和 `'5d'` 的字符串表示。两个模块都是全局的：`Webhooks`、`WebhookEndpoints`、`WebhookDeliveries`、`WebhooksEvents` 和 `WebhooksStorage` 可以在任何地方注入。`main.ts` 绑定了合作伙伴 API DTO 的验证管道（参见下一节），并启用了关闭钩子，因此部署允许中继和工作进程完成正在进行的工作：

```typescript title="main.ts"
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // The partner API's DTOs; whitelist: properties without a decorator are dropped.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  // On SIGTERM the outbox relay and the webhook worker finish what they started.
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

启动时，两个模块都会记录它们使用的存储，首次启动时，存储会记录它们创建的模式：

```bash
[Nest] 55905  - 09/30/2026, 6:52:36 PM     LOG [OutboxModule] OutboxStorage: PostgresOutboxStore
[Nest] 55905  - 09/30/2026, 6:52:36 PM     LOG [WebhooksModule] WebhooksStorage: PostgresWebhookStore
[Nest] 55905  - 09/30/2026, 6:52:36 PM     LOG [OutboxModule] PostgresOutboxStore: migrated schema "nest_outbox" to version 1.
[Nest] 55905  - 09/30/2026, 6:52:36 PM     LOG [WebhooksModule] PostgresWebhookStore: migrated schema "nest_webhooks" to version 1.

```

#### 允许合作伙伴订阅

零售商和经销商使用 API 密钥调用合作伙伴 API：示例中的两个合作伙伴，Northside Pet Supplies（经销商）和 Riverside Cat Shelter，在 [Installation](/http/webhooks#安装) 中有样本密钥。`PartnerGuard` 查找密钥的哈希值并将合作伙伴设置到请求上，而 `@CurrentPartner()` 读取它：

```typescript title="partners/partner.guard.ts"
import {
  createParamDecorator,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { Database } from '../database/drizzle.js';
import { partners } from '../database/schema.js';

export interface Partner {
  id: string;
  name: string;
}

/** Authenticates a partner by its API key: `Authorization: Bearer <key>`. */
@Injectable()
export class PartnerGuard implements CanActivate {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string>; partner?: Partner }>();
    const key = /^Bearer (\S+)$/.exec(request.headers.authorization ?? '')?.[1];
    if (!key) {
      throw new UnauthorizedException();
    }
    const hash = createHash('sha256').update(key).digest('hex');
    const [partner] = await this.db
      .select({ id: partners.id, name: partners.name })
      .from(partners)
      .where(eq(partners.apiKeyHash, hash));
    if (!partner) {
      throw new UnauthorizedException();
    }
    request.partner = partner;
    return true;
  }
}

/** The partner `PartnerGuard` authenticated. */
export const CurrentPartner = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => context.switchToHttp().getRequest<{ partner: Partner }>().partner,
);

```

订阅是一个 URL、要接收的事件类型和描述；更新只发送变更的内容。DTO 检查形状，将 URL 和类型留给包，该包知道它接受什么。请求体使用应用程序已有的任何方式进行验证：本页面上的每个 DTO 都出现两次，一次是带有 `class-validator` 装饰器的类，一次是 Zod 模式，因此选择您已有的风格并跳过另一个列表：

```typescript title="partner-webhooks/webhook-endpoints.dto.ts"
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

/** Body of `POST /partner/webhook-endpoints`. The package checks the URL and the types themselves. */
export class CreateEndpointDto {
  @IsString()
  url: string;

  /** `order.shipped`, `order.cancelled`, or `*` for both. */
  @IsArray()
  @IsString({ each: true })
  eventTypes: string[];

  @IsOptional()
  @IsString()
  description?: string;
}

/** Body of `PATCH /partner/webhook-endpoints/:id`: only what is sent changes. */
export class UpdateEndpointDto {
  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eventTypes?: string[];

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

```

与 Zod 模式相同规则，其推断的类型会替换类。Nest 12.1 通过 `StandardSchemaValidationPipe` 验证任何来自 Zod、Valibot 或 ArkType 的 [Standard Schema](https://standardschema.dev/) 对象：

```typescript title="partner-webhooks/webhook-endpoints.schemas.ts"
import { z } from 'zod';

/** Body of `POST /partner/webhook-endpoints`. The package checks the URL and the types themselves. */
export const createEndpointSchema = z.object({
  url: z.string(),
  /** `order.shipped`, `order.cancelled`, or `*` for both. */
  eventTypes: z.array(z.string()),
  description: z.string().optional(),
});
export type CreateEndpointDto = z.infer<typeof createEndpointSchema>;

/** Body of `PATCH /partner/webhook-endpoints/:id`: only what is sent changes. */
export const updateEndpointSchema = z.object({
  url: z.string().optional(),
  eventTypes: z.array(z.string()).optional(),
  description: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
});
export type UpdateEndpointDto = z.infer<typeof updateEndpointSchema>;

```

订阅 API 是一个基于 `WebhookEndpoints` 的控制器。每次调用都将合作伙伴的 id 作为 **tenant** 传递：为该租户创建了一个端点，列出了该租户的端点，而另一个合作伙伴的端点 id 表现得好像不存在一样：

```typescript title="partner-webhooks/webhook-endpoints.controller.ts"
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { WebhookEndpoints } from '@nestjs/webhooks';
import { CurrentPartner, PartnerGuard, type Partner } from '../partners/partner.guard.js';
import { CreateEndpointDto, UpdateEndpointDto } from './webhook-endpoints.dto.js';

/** A partner's subscriptions. Every call is scoped to the partner: another partner's endpoint is a 404. */
@Controller('partner/webhook-endpoints')
@UseGuards(PartnerGuard)
export class WebhookEndpointsController {
  constructor(private readonly webhookEndpoints: WebhookEndpoints) {}

  /** Returns the endpoint and its secret. The secret is shown this once. */
  @Post()
  create(@CurrentPartner() partner: Partner, @Body() dto: CreateEndpointDto) {
    return this.webhookEndpoints.create({
      url: dto.url,
      eventTypes: dto.eventTypes,
      description: dto.description ?? null,
      tenant: partner.id,
    });
  }

  @Get()
  list(@CurrentPartner() partner: Partner) {
    return this.webhookEndpoints.list({ tenant: partner.id });
  }

  @Get(':id')
  async get(@CurrentPartner() partner: Partner, @Param('id') id: string) {
    const endpoint = await this.webhookEndpoints.get(id, { tenant: partner.id });
    if (!endpoint) {
      throw new NotFoundException(`Webhook endpoint ${id} not found`);
    }
    return endpoint;
  }

  @Patch(':id')
  update(@CurrentPartner() partner: Partner, @Param('id') id: string, @Body() dto: UpdateEndpointDto) {
    return this.webhookEndpoints.update(id, dto, { tenant: partner.id });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentPartner() partner: Partner, @Param('id') id: string) {
    await this.webhookEndpoints.delete(id, { tenant: partner.id });
  }

  /** A new secret. The old one keeps signing for 24 hours, so the partner can switch without a gap. */
  @Post(':id/rotate-secret')
  @HttpCode(HttpStatus.OK)
  async rotateSecret(@CurrentPartner() partner: Partner, @Param('id') id: string) {
    return { secret: await this.webhookEndpoints.rotateSecret(id, { tenant: partner.id }) };
  }
}

```

使用 Zod 模式时，请求体参数声明其模式而不是类：

```typescript title="partner-webhooks/webhook-endpoints.controller.ts"
import { createEndpointSchema, updateEndpointSchema, type CreateEndpointDto, type UpdateEndpointDto } from './webhook-endpoints.schemas.js';
// ...
@Post()
create(@CurrentPartner() partner: Partner, @Body({ schema: createEndpointSchema }) dto: CreateEndpointDto) {
  // ...
}

@Patch(':id')
update(@CurrentPartner() partner: Partner, @Param('id') id: string, @Body({ schema: updateEndpointSchema }) dto: UpdateEndpointDto) {
  // ...
}

```

> info **提示** DTO 仅由验证管道强制执行：全局绑定 `ValidationPipe`，在 `main.ts` 中使用 `useGlobalPipes()`，就像 [Register the modules](/http/webhooks#register-the-modules) 所做的那样（`whitelist` 会丢弃没有装饰器的属性），或者作为一个 `APP_PIPE` 提供者。使用 Zod 模式时，以相同方式绑定 `StandardSchemaValidationPipe`：应用程序使用其中一个。[validation](/techniques/validation) 页面提供了每种选项。

`create()` 返回带有其 `secret` 的端点，一个 32 字节的标准 Webhooks `whsec_…`，在此生成。此 API 只显示一次：`list()` 和 `get()` 从不包含它，丢失它的合作伙伴会轮换。该包保留密钥，在设置 `encryption` 时密封，因为它使用它进行签名，而 `getSecret()` 读取当前密钥，以便在您的 API 提供时，通过新的登录后的“显示”按钮进行验证。从 Svix 或其他标准 Webhooks 发送器迁移的端点保留其密钥：迁移脚本将合作伙伴现有的 `whsec_…` 作为 `secret` 传递给 `create()`，因此合作伙伴的验证器继续工作，并且 `rotateSecret()` 以相同方式处理给定的 `secret`。该包检查合作伙伴提交的内容并以 400 状态码抛出 `InvalidWebhookEndpointError`：URL 不是 `https://`（或带有 `allowHttp` 的 `http://`），携带凭据，或其主机是受阻止的地址，例如 `https://169.254.169.254/latest/meta-data/` 或 `https://localhost/`；事件类型不在 `eventTypes` 中。合作伙伴的错误返回 400，另一个合作伙伴的 id 返回 404，通过一个过滤器：

```typescript title="partner-webhooks/webhooks-error.filter.ts"
import { Catch, HttpException, type ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { WebhooksError } from '@nestjs/webhooks';

/**
 * The package's errors carry an HTTP status (400 for an endpoint it refuses, 404 for another
 * partner's endpoint or delivery); this answers with it and the error's message.
 */
@Catch(WebhooksError)
export class WebhooksErrorFilter extends BaseExceptionFilter {
  override catch(error: WebhooksError, host: ArgumentsHost) {
    const status = (error as { status?: number }).status;
    super.catch(status ? new HttpException(error.message, status, { cause: error }) : error, host);
  }
}

```

```typescript title="partner-webhooks/partner-webhooks.module.ts"
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { WebhookDeliveriesController } from './webhook-deliveries.controller.js';
import { WebhookEndpointsController } from './webhook-endpoints.controller.js';
import { WebhooksErrorFilter } from './webhooks-error.filter.js';

@Module({
  controllers: [WebhookEndpointsController, WebhookDeliveriesController],
  // Turns the package's errors (a refused URL, another partner's endpoint) into 4xx responses.
  providers: [{ provide: APP_FILTER, useClass: WebhooksErrorFilter }],
})
export class PartnerWebhooksModule {}

```

添加到此模块 [later](/http/webhooks#retries-the-delivery-log-and-replay) 的交付日志的控制器，向合作伙伴提供另一半信息：发送到其端点的内容。

#### 在提交后发送 order.shipped 和 order.cancelled

`Webhooks.dispatch()` 首先接收您的事务句柄，如下所示 `Outbox.add()`：使用 Drizzle，`tx` 传递其回调，该回调的类型由服务提供 `Webhooks<Transaction>`。取消订单会更新它并在同一 `tx` 上分派 `order.cancelled`；发货（由承运商触发，在 [Receive the carrier's Stripe-like webhooks](/http/webhooks#receive-the-carriers-stripe-like-webhooks) 中）会更新它并分派 `order.shipped`。`tenant` 是下订单的合作伙伴，因此只有该合作伙伴的端点会接收到它：

```typescript title="orders/orders.service.ts"
@Injectable()
export class OrdersService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly webhooks: Webhooks<Transaction>,
  ) {}

  // ...

  /** Cancels an order that hasn't shipped, and tells the partner in the same transaction. */
  async cancelOrder(partner: Partner, id: string, reason: string): Promise<Order> {
    const order = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.id, id), eq(orders.partnerId, partner.id)))
        .for('update');
      if (!row) {
        throw new NotFoundException(`Order ${id} not found`);
      }
      if (row.status === 'shipped' || row.status === 'cancelled') {
        throw new ConflictException(`Order ${id} is ${row.status}`);
      }
      await tx.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, id));

      // Drizzle's tx: the webhook is sent only if the cancellation commits, and only to the
      // partner's own endpoints (the tenant).
      const data: OrderCancelled = { orderId: id, reason };
      await this.webhooks.dispatch(tx, { type: 'order.cancelled', tenant: row.partnerId, data });
      return { ...row, status: 'cancelled' as const };
    });

    this.webhooks.notify(); // deliver now instead of at the next poll
    return order;
  }

  // ...

  /** The carrier picked the order up: marks it shipped and tells the partner, in one transaction (the carrier's webhook). */
  async markShipped(tx: Transaction, orderId: string, trackingNumber: string): Promise<Order> {
    const [row] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!row) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    if (row.status !== 'paid') {
      throw new ConflictException(`Order ${orderId} is ${row.status}, not paid`);
    }
    await tx.update(orders).set({ status: 'shipped', trackingNumber }).where(eq(orders.id, orderId));

    const data: OrderShipped = { orderId, trackingNumber };
    await this.webhooks.dispatch(tx, { type: 'order.shipped', tenant: row.partnerId, data });
    return { ...row, status: 'shipped', trackingNumber };
  }
}

```

事务内部没有内容离开进程。如果回滚，消息从未存在。如果提交，出库中继会拾取消息（`notify()` 要求它现在而不是在下一次轮询时执行）并将其交给包的扇出，该扇出为订阅了该类型的租户的每个已启用端点创建一次交付。然后工作进程对每个交付进行签名和发送。这是 Northside 服务器在每次交付尝试时收到的内容，带有相同的 `webhook-id` 和在 `dispatch()` 序列化的确切主体：

```http
POST /store/webhooks HTTP/1.1
content-type: application/json
user-agent: NestJS-Webhooks/1.0
webhook-id: msg_01a0f33b898e7341950339801ec3319a
webhook-timestamp: 1790787160
webhook-signature: v1,<base64 HMAC-SHA256 of "msg_01a0f33b898e7341950339801ec3319a.1790787160.{the body}">

{"type":"order.shipped","timestamp":"2026-09-30T16:52:40.462Z","data":{"orderId":"1067d04c-0617-44ac-9a29-67297867329e","trackingNumber":"TRK-4471-0001"}}

```

签名使用端点的密钥，因此合作伙伴可以使用任何标准 Webhooks 库进行验证。或者使用此包：Northside 的接收器是其自己的 Nest 应用程序，具有自己的根模块，它仅在其路由上接收 `outgoing: false` 和 `@VerifyWebhook('store')`。`STORE_WEBHOOK_SECRET` 接收一个逗号分隔的列表，因为存储的 [rotation](/http/webhooks#rotate-secrets) 为一天使用两个密钥进行签名：

```typescript title="partner-service/app.module.ts"
import { Module } from '@nestjs/common';
import { OutboxModule } from '@nestjs/outbox';
import { WebhooksModule } from '@nestjs/webhooks';
import { StoreWebhooksController } from './store-webhooks.controller.js';

/**
 * Northside's side: a service that only receives. `outgoing: false` leaves out the
 * endpoints, deliveries and worker. The outbox's inbox deduplicates redeliveries by
 * webhook-id; in memory here, on the partner's own database in production (the outbox's
 * store, as in the outbox tutorial's analytics service).
 */
@Module({
  imports: [
    OutboxModule.forRoot({ relay: { enabled: false } }),
    WebhooksModule.forRootAsync({
      outgoing: false,
      useFactory: () => {
        const secrets = process.env.STORE_WEBHOOK_SECRET;
        if (!secrets) {
          throw new Error('Set STORE_WEBHOOK_SECRET to the secret the store gave this endpoint');
        }
        return {
          receivers: {
            // Every listed secret is tried: keep the old one next to the new one while the store rotates.
            store: { scheme: 'standard', secret: secrets.split(',') },
          },
        };
      },
    }),
  ],
  controllers: [StoreWebhooksController],
})
export class AppModule {}

```

```typescript title="partner-service/store-webhooks.controller.ts"
import { Controller, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import { IncomingWebhook, VerifyWebhook } from '@nestjs/webhooks';

/** What the store sends: the Standard Webhooks payload, `type`, `timestamp` and `data`. */
export type StoreEvent =
  | { type: 'order.shipped'; timestamp: string; data: { orderId: string; trackingNumber: string } }
  | { type: 'order.cancelled'; timestamp: string; data: { orderId: string; reason: string } };

@Controller('store')
export class StoreWebhooksController {
  private readonly logger = new Logger(StoreWebhooksController.name);

  @Post('webhooks')
  @HttpCode(HttpStatus.NO_CONTENT)
  @VerifyWebhook('store')
  receive(@IncomingWebhook() webhook: IncomingWebhook<StoreEvent>) {
    const event = webhook.payload;
    if (event.type === 'order.shipped') {
      this.logger.log(`Order ${event.data.orderId} shipped, tracking ${event.data.trackingNumber} (${webhook.id})`);
    } else {
      this.logger.log(`Order ${event.data.orderId} cancelled: ${event.data.reason} (${webhook.id})`);
    }
  }
}

```

```typescript title="partner-service/main.ts"
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  // rawBody: the signature is checked on the bytes the store signed, not on a re-serialized body.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 4100);
}
await bootstrap();

```

合作伙伴的 `OutboxModule` 提供了一个由 `@VerifyWebhook()` 去重收件箱。它在此内存中运行；真实的合作伙伴在其自己的数据库上注册出库的存储，在 PostgreSQL 上是 `PostgresOutboxStore`，就像分析服务在 [the outbox tutorial](/reliability/outbox#publish-to-the-analytics-microservice) 中所做的那样。

#### 重试、交付日志和重放

来自合作伙伴的 2xx 表示成功。任何其他情况都表示尝试失败：5xx、4xx、3xx（重定向永不跟随）、超时、连接被拒绝。工作进程在退避后重试，遵守秒级或 HTTP 日期的 `Retry-After` 标头（不超过退避上限，即一天；任何其他值均被忽略），对于 429、502、503 或 504，它会暂停该端点直到那时，即没有标头的五秒钟：其他交付会等待而不尝试，因此请求喘息的合作伙伴会得到一次探测，而不是每个批次一次，而其他合作伙伴的交付会继续进行。三个答案会提前结束交付：410 Gone，这也禁用了端点（`gone`）；传输拒绝的目的地（订阅会检查，在每次发送时重新运行，因为 DNS 会更改）；以及 `retry.retryIf` 表示否决。在最后一次尝试后，交付变为 `failed`，原因为 `exhausted`。

对于 `disableEndpointAfter` 每次尝试都失败的端点，会禁用，原因为 `failing`，并且 `WebhooksEvents` 发出 `endpoint-disabled`：通知合作伙伴。任何时间点的成功都会重置计时器。被禁用（无论是被工作进程还是被合作伙伴（订阅 `update()` 中的 `enabled: false`））的端点在禁用期间不会收到任何分派的消息：扇出会跳过它，之后不会创建这些交付。重放也不会，因为它会重新发送已存在的交付。存在的是在端点被禁用时正在等待的交付：当轮到它们时，它们会以原因 `endpoint-disabled` 失败，并在重新启用后，合作伙伴可以再次请求这些失败的交付，因为它们是失败的交付。重新启用会忘记失败，从那时起端点会接收到分派的消息。

每次尝试都会被记录：状态码、持续时间、响应体的前 4 KB、错误。合作伙伴读取自己的日志，并请求重新发送一次交付，或者自中断开始以来所有失败的交付。批量重试接受一个端点和中断的开始时间，两者可选：

```typescript title="partner-webhooks/webhook-deliveries.dto.ts"
import { IsISO8601, IsOptional, IsString } from 'class-validator';

/** Body of `POST /partner/webhook-deliveries/retry`: every failed delivery since an outage began. */
export class RetryDeliveriesDto {
  /** One endpoint's, or every endpoint's. */
  @IsOptional()
  @IsString()
  endpointId?: string;

  /** Deliveries created at or after this time (ISO 8601): the start of the outage. */
  @IsOptional()
  @IsISO8601()
  since?: string;
}

```

```typescript title="partner-webhooks/webhook-deliveries.schemas.ts"
import { z } from 'zod';

/** Body of `POST /partner/webhook-deliveries/retry`: every failed delivery since an outage began. */
export const retryDeliveriesSchema = z.object({
  /** One endpoint's, or every endpoint's. */
  endpointId: z.string().optional(),
  /** Deliveries created at or after this time (ISO 8601): the start of the outage. */
  since: z.iso.datetime().optional(),
});
export type RetryDeliveriesDto = z.infer<typeof retryDeliveriesSchema>;

```

```typescript title="partner-webhooks/webhook-deliveries.controller.ts"
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { WebhookDeliveries, type WebhookDeliveryStatus } from '@nestjs/webhooks';
import { CurrentPartner, PartnerGuard, type Partner } from '../partners/partner.guard.js';
import { RetryDeliveriesDto } from './webhook-deliveries.dto.js';

/** A partner's delivery log: what was sent, how each attempt went, and a way to ask for it again. */
@Controller('partner/webhook-deliveries')
@UseGuards(PartnerGuard)
export class WebhookDeliveriesController {
  constructor(private readonly webhookDeliveries: WebhookDeliveries) {}

  /** Newest first. */
  @Get()
  list(
    @CurrentPartner() partner: Partner,
    @Query('endpointId') endpointId?: string,
    @Query('status') status?: WebhookDeliveryStatus,
    @Query('type') type?: string,
  ) {
    return this.webhookDeliveries.list({ tenant: partner.id, endpointId, status, type });
  }

  /** The delivery, the message that was sent, and every attempt: status code, duration, the start of the response. */
  @Get(':id')
  async get(@CurrentPartner() partner: Partner, @Param('id') id: string) {
    const delivery = await this.webhookDeliveries.get(id, { tenant: partner.id });
    if (!delivery) {
      throw new NotFoundException(`Webhook delivery ${id} not found`);
    }
    return delivery;
  }

  /** Sends one delivery again, now, with the same webhook-id: a replay of a lost webhook, or a retry of a failed one. */
  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  async retry(@CurrentPartner() partner: Partner, @Param('id') id: string) {
    return { retried: await this.webhookDeliveries.retry(id, { tenant: partner.id }) };
  }

  /** Retries every failed delivery, of one endpoint or all, since an outage began. */
  @Post('retry')
  @HttpCode(HttpStatus.OK)
  async retryFailed(@CurrentPartner() partner: Partner, @Body() dto: RetryDeliveriesDto) {
    const since = dto.since === undefined ? undefined : new Date(dto.since);
    const retried = await this.webhookDeliveries.retry(
      { endpointId: dto.endpointId, status: 'failed', since },
      { tenant: partner.id },
    );
    return { retried };
  }
}

```

使用 Zod 模式：

```typescript title="partner-webhooks/webhook-deliveries.controller.ts"
import { retryDeliveriesSchema, type RetryDeliveriesDto } from './webhook-deliveries.schemas.js';
// ...
@Post('retry')
@HttpCode(HttpStatus.OK)
async retryFailed(@CurrentPartner() partner: Partner, @Body({ schema: retryDeliveriesSchema }) dto: RetryDeliveriesDto) {
  // ...
}

```

重试启动了一个新轮次：`attempts` 重置到 0，现在发送，使用相同的 `webhook-id` 和相同的 body。早期轮次的日志保持不变。因为 id 相同，其收件箱保留了该 id 的合作伙伴在不运行其处理器的情况下响应 2xx，因此对于已投递的 webhook 来说，重放是安全的：Northside 在丢失自己的数据库后可以再次请求过去一小时的数据，并且只会收到尚未处理的数据。

操作员可以通过不带租户的 `WebhookDeliveries` 获得相同的信息：`stats()`（待处理、到期、已租用和失败计数，以及 `lagMs`，最逾期交付等待的时间，需要警报的数字），跨租户的 `retry()`，以及 `prune('30d')`，无需任何调用。`WebhooksEvents.events$` 发射 `delivered`、`retry-scheduled`、`delivery-failed` 和 `endpoint-disabled`，每个事件都在名为 `nestjs:webhooks:<event>` 的 `node:diagnostics_channel` 通道上。

#### 接收支付提供者的 webhook

支付提供者通过 Standard Webhooks 請求告知商店支付已完成。验证它需要与提供者签名时完全相同的 body，因此应用程序使用 `rawBody: true` 创建。这在 Express 和 Fastify 上都有效：

```typescript title="main.ts"
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  // rawBody: incoming webhooks are verified on the bytes that were signed, not on a re-serialized body.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  // The partner API's DTOs; whitelist: properties without a decorator are dropped.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  // On SIGTERM the outbox relay and the webhook worker finish what they started.
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

发送者进入模块的 `receivers`，名称即路由将使用的名称。支付提供者的密钥是其在仪表板中显示的密钥：

```typescript title="app.module.ts"
// The senders whose webhooks this API accepts, by the name @VerifyWebhook() uses.
receivers: {
  // The payment provider follows Standard Webhooks: webhook-id, webhook-timestamp, webhook-signature.
  payments: { scheme: 'standard', secret: process.env.PAYMENTS_WEBHOOK_SECRET! },
  // The carrier copied Stripe's scheme under its own header: Carrier-Signature: t=...,v1=...
  carrier: { scheme: 'stripe', header: 'Carrier-Signature', secret: process.env.CARRIER_WEBHOOK_SECRET! },
},

```

路由上的 `@VerifyWebhook('payments')` 在处理器运行前验证请求，而 `@IncomingWebhook()` 提供了验证的内容：发送者的 webhook `id`、签名的 `timestamp`、从签名字节中解析出的 `payload`，以及 `processInTransaction()`：

```typescript title="provider-webhooks/payment-provider-webhooks.controller.ts"
import { Controller, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { IncomingWebhook, VerifyWebhook } from '@nestjs/webhooks';
import type { Database } from '../database/drizzle.js';
import { OrdersService } from '../orders/orders.service.js';

/** The payment provider's payload: the Standard Webhooks shape, `type`, `timestamp` and `data`. */
export interface PaymentProviderEvent {
  type: 'payment.succeeded' | 'payment.failed';
  timestamp: string;
  data: { paymentId: string; orderId: string; amount: number };
}

@Controller('webhooks/payments')
export class PaymentProviderWebhooksController {
  private readonly logger = new Logger(PaymentProviderWebhooksController.name);

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly ordersService: OrdersService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @VerifyWebhook('payments')
  async receive(@IncomingWebhook() webhook: IncomingWebhook<PaymentProviderEvent>) {
    const { type, data } = webhook.payload;
    if (type !== 'payment.succeeded') {
      this.logger.log(`Ignoring ${type} for order ${data.orderId}`);
      return;
    }
    // Exactly once: the webhook's id is recorded in the same transaction as the order's new
    // status, so a redelivery, even one racing this request on another instance, changes nothing.
    const result = await this.db.transaction(async (tx) =>
      webhook.processInTransaction(tx, () => this.ordersService.markPaid(tx, data.orderId, data.paymentId, data.amount)),
    );
    if (!result.duplicate) {
      this.logger.log(`Order ${data.orderId} paid: ${data.paymentId}, ${data.amount} cents`);
    }
  }
}

```

```typescript title="orders/orders.service.ts"
/** The payment provider confirmed the payment. Runs inside the receiver's transaction. */
async markPaid(tx: Transaction, orderId: string, paymentId: string, amount: number): Promise<Order> {
  const [row] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
  if (!row) {
    throw new NotFoundException(`Order ${orderId} not found`);
  }
  if (row.status !== 'placed') {
    throw new ConflictException(`Order ${orderId} is ${row.status}`);
  }
  if (amount !== row.total) {
    throw new ConflictException(`Payment ${paymentId} is for ${amount}, and order ${orderId} totals ${row.total}`);
  }
  await tx.update(orders).set({ status: 'paid', paymentId }).where(eq(orders.id, orderId));
  return { ...row, status: 'paid', paymentId };
}

```

```typescript title="provider-webhooks/provider-webhooks.module.ts"
import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module.js';
import { CarrierWebhooksController } from './carrier-webhooks.controller.js';
import { PaymentProviderWebhooksController } from './payment-provider-webhooks.controller.js';

/** The webhooks the store receives: the payment provider's payments and the carrier's shipments. */
@Module({
  imports: [OrdersModule],
  controllers: [PaymentProviderWebhooksController, CarrierWebhooksController],
})
export class ProviderWebhooksModule {}

```

装饰器按顺序检查的内容是：三个 `webhook-` 头部存在且格式正确，其中 `webhook-id` 最多为 255 个字符（按代码点计算）；在 `webhook-signature` 中有一个 `v1,` 签名与使用配置的密钥之一对 `id.timestamp.body` 的 HMAC 匹配（以恒定时间比较；当支付提供者轮换密钥时可以列出多个密钥）；签名的时间戳在当前时间前后 5 分钟内；body 是 JSON。失败的请求会收到 401 错误和通用消息。原因绝不会发送给发送者；它会发送到 `verification-failed` 事件，并包含接收者的名称。未是 JSON 的签名 body 会在装饰器看到它之前被框架的 body 解析器返回 400，因此不会发出事件。对于超过 body 解析器大小限制（Express 默认 100 kB，Fastify 默认 1 MiB）的 body，它会在装饰器运行前返回 413，也不会发出事件。如果支付提供者发送更大的 body，请使用 `useBodyParser()` 提高限制，如 [Raw body](/faq/raw-body#body-parser-size-limit) 所述。

接着是去重。支付提供者会重试直到收到 2xx 响应，因此在处理器成功后超时会导致它再次发送相同的 `webhook-id`。接收者会维护一个已处理 id 的收件箱（出库的收件箱，消费者 `webhooks:payments`）：已知的 id 会以空的 200 响应而无需运行处理器，并且只有在处理器成功后才会记录 id，因此如果处理器抛出异常，将在支付提供者的重试中再次运行。同一实例同时接收到两个副本会运行处理器一次；同一时刻接收到它们的两个实例都可能运行它，这正是下一段要解决的问题。

`markPaid()` 移动与金钱相关的状态，因此控制器通过 `processInTransaction()` 进一步操作：webhook 的 id 是*通过订单的事务*记录的，并且只有在它是新的情况下才会运行 `markPaid()`。记录和新状态一起提交。在处理器和收件箱写入之间崩溃后的重新投递，或另一个实例上与此请求竞争的请求，会找到 id 且不改变任何内容；它以 `duplicate` 设置的响应解决，控制器使用此状态仅记录一次。当 `markPaid()` 抛出异常时（例如，金额错误），事务会回滚，记录也会回滚，发送者收到 409 错误，并且在订单修复后其重试获得另一次机会。

对于开发，一个小型脚本会以支付提供者（以及下一节中的承运商）的方式签名请求，使用来自 `@nestjs/webhooks/testing` 的 `signWebhook()`：

```typescript title="scripts/send-webhook.ts"
/**
 * Sends the signed request the payment provider or the carrier would send, for trying the API by hand:
 *
 *   npx tsx scripts/send-webhook.ts payments payment.succeeded '{"paymentId":"pay_1","orderId":"...","amount":4998}'
 *   npx tsx scripts/send-webhook.ts carrier shipment.shipped '{"orderId":"...","trackingNumber":"TRK-0001"}'
 *
 * Signs with PAYMENTS_WEBHOOK_SECRET or CARRIER_WEBHOOK_SECRET, the secrets the API was
 * started with, and posts to API_URL (default http://localhost:3000). WEBHOOK_ID sends a
 * redelivery with a given id; TAMPER=1 changes a byte of the body after signing it.
 */
import { signWebhook } from '@nestjs/webhooks/testing';
import { randomUUID } from 'node:crypto';

const [sender, type, json = '{}'] = process.argv.slice(2);
if (sender !== 'payments' && sender !== 'carrier') {
  console.error('usage: send-webhook.ts <payments|carrier> <type> <data as JSON>');
  process.exit(2);
}
const data: unknown = JSON.parse(json);
const id = process.env.WEBHOOK_ID;

function secret(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name}`);
  }
  return value;
}

const signed =
  sender === 'payments'
    ? signWebhook({
        scheme: 'standard',
        secret: secret('PAYMENTS_WEBHOOK_SECRET'),
        id,
        payload: { type, timestamp: new Date().toISOString(), data },
      })
    : signWebhook({
        scheme: 'stripe',
        header: 'Carrier-Signature',
        secret: secret('CARRIER_WEBHOOK_SECRET'),
        payload: { id: id ?? `evt_${randomUUID().replaceAll('-', '')}`, type, data },
      });

const body = process.env.TAMPER ? `${signed.body.slice(0, -1)} }` : signed.body;
const response = await fetch(`${process.env.API_URL ?? 'http://localhost:3000'}/webhooks/${sender}`, {
  method: 'POST',
  headers: signed.headers,
  body,
});
console.log(`${response.status} ${await response.text()}`);

```

#### 接收承运商的 Stripe 风格 webhook

承运商复制了 Stripe 的方案：一个 `Carrier-Signature: t=…,v1=…` 头部，对 `t.body` 使用密钥文本的十六进制 HMAC-SHA256，以及事件 id 包含在负载中。[`receivers` option](/http/webhooks#receive-the-payment-providers-webhooks) 中的接收者说明了这一点：使用 `header` 名称的 `scheme: 'stripe'`。Stripe 自己的 webhook 是没有 `header` 的相同接收者。GitHub 的以及拥有自己方案的发送者在 [Other senders](/http/webhooks#other-senders) 中。

处理器是有趣的部分。标记订单已发货并通知合作伙伴在一个事务中发生：订单的新状态、合作伙伴的 `order.shipped` 消息（通过出库）和此 webhook 的收件箱记录一起提交，否则都不提交：

```typescript title="provider-webhooks/carrier-webhooks.controller.ts"
import { Controller, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { IncomingWebhook, VerifyWebhook, Webhooks } from '@nestjs/webhooks';
import type { Database } from '../database/drizzle.js';
import { OrdersService } from '../orders/orders.service.js';

/** The carrier's payload, Stripe-like: the event's `id` is in the body, which is what the signature covers. */
export interface CarrierEvent {
  id: string;
  type: 'shipment.shipped' | 'shipment.delivered';
  data: { orderId: string; trackingNumber: string };
}

@Controller('webhooks/carrier')
export class CarrierWebhooksController {
  private readonly logger = new Logger(CarrierWebhooksController.name);

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly ordersService: OrdersService,
    private readonly webhooks: Webhooks,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @VerifyWebhook('carrier')
  async receive(@IncomingWebhook() webhook: IncomingWebhook<CarrierEvent>) {
    const { type, data } = webhook.payload;
    if (type !== 'shipment.shipped') {
      this.logger.log(`Ignoring ${type} for order ${data.orderId}`);
      return;
    }
    // One transaction: the order's status, the partner's order.shipped webhook (through the
    // outbox) and this webhook's inbox record commit together, or not at all.
    const result = await this.db.transaction(async (tx) =>
      webhook.processInTransaction(tx, () => this.ordersService.markShipped(tx, data.orderId, data.trackingNumber)),
    );
    if (result.duplicate) {
      return;
    }
    this.webhooks.notify(); // deliver order.shipped now instead of at the next poll
    this.logger.log(`Order ${data.orderId} shipped, tracking ${data.trackingNumber}`);
  }
}

```

`markShipped()` 是来自 [Send order.shipped and order.cancelled after the commit](/http/webhooks#send-ordershipped-and-ordercancelled-after-the-commit) 的方法。去重 id 是签名负载中的事件 `id`，而不是头部，因为这是 Stripe 方案所签名的内容。对于尚未付款的订单的 `shipment.shipped` 事件会返回 409 拒绝，并且不会记录任何内容：当承运商在付款到达后重试时，相同的事件 id 会被处理。

#### 其他发送者

GitHub 的 webhook 接收 `scheme: 'github'`：`X-Hub-Signature-256`，即使用密钥文本的 HMAC-SHA256 散列值。在 GitHub 中将 hook 的 **Content type** 设置为 `application/json`：其默认值 `application/x-www-form-urlencoded` 将有效载荷作为表单字段发送，而接收者对每次投递都返回 400，因为主体不是 JSON。

> 警告 **警告** GitHub 不对时间戳或 ID 进行签名。捕获的请求永远有效，默认情况下，去重键基于 `X-GitHub-Delivery` 头部，该头部未签名：使用该头部的新值重放相同的请求会再次运行处理器。

转而基于签名主体进行去重，使用接收者的 `id` 选项。有效载荷是从被签名的字节中解析的，因此重放的请求具有与原始请求相同的 ID，收件箱会跳过它：

```typescript
receivers: {
  github: {
    scheme: 'github',
    secret: process.env.GITHUB_WEBHOOK_SECRET!,
    // The signed body, not the unsigned X-GitHub-Delivery header: a replayed request has a known id.
    id: (payload) => createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
  },
},

```

收件箱会记住一个 ID 直到 `OutboxInbox.prune()` 将其移除，因此对于 GitHub 来说，其窗口期也是捕获重放的时长：保持较长。在此之后重放的请求将验证并通过运行；仅接受来自其发布地址（`hooks` 在 `https://api.github.com/meta` 中）的 GitHub webhook 可以缩小发送者的范围。

具有自身方案的发送者是扩展了 `WebhookSignatureScheme` 的类。假设商店也通过市场销售，市场会签名它发布的 URL 加上主体，并将事件的 ID 放在主体中：

```typescript title="provider-webhooks/marketplace.scheme.ts"
import { WebhookSignatureScheme, type WebhookSignatureCheck, type WebhookSignedRequest } from '@nestjs/webhooks';
import { createHmac } from 'node:crypto';

/**
 * The marketplace's scheme: `X-Marketplace-Signature` is the base64 HMAC-SHA256 of the URL it
 * posts to followed by the body, keyed with the secret's text, and the event's id is in the body.
 * A scheme sees the request's headers and raw body, so the URL comes in through the constructor:
 * the one registered in the marketplace's dashboard.
 */
export class MarketplaceScheme extends WebhookSignatureScheme {
  constructor(private readonly url: string) {
    super();
  }

  verify({ headers, rawBody }: WebhookSignedRequest, keys: readonly Buffer[]): WebhookSignatureCheck {
    const signature = headers['x-marketplace-signature'];
    if (signature === undefined) {
      return { valid: false, reason: 'missing-header', detail: 'no x-marketplace-signature header' };
    }
    if (typeof signature !== 'string') {
      return { valid: false, reason: 'malformed-header', detail: 'x-marketplace-signature is repeated' };
    }

    const candidates = [Buffer.from(signature, 'base64')];
    for (const key of keys) {
      const expected = createHmac('sha256', key).update(this.url).update(rawBody).digest();
      // In constant time, never with ===.
      if (WebhookSignatureScheme.matches(expected, candidates)) {
        return { valid: true };
      }
    }
    return { valid: false, reason: 'invalid-signature', detail: 'no signature matches a configured secret' };
  }

  /** The deduplication id: the event's, from the signed body. */
  override idFromPayload(payload: unknown): string | undefined {
    const id = (payload as { eventId?: unknown } | null)?.eventId;
    return typeof id === 'string' ? id : undefined;
  }
}

```

- `verify(request, keys)` 获取请求的 `headers`（小写名称）和其接收到的 `rawBody`，以及每个配置密钥的一个键。它返回 `valid: true`，如果头部携带发送者的 `id`，则返回该值；如果方案签名，则返回以纪元秒表示的签名 `timestamp`（然后应用接收者的 `tolerance`），或者返回 `valid: false`，其中包含针对 `verification-failed` 事件的 `reason` 和一个 `detail`。它同步运行，在主体被解析为 JSON 之前。
- `WebhookSignatureScheme.matches(expected, candidates)` 以常数时间进行比较。切勿使用 `===` 比较签名。
- `idFromPayload(payload, headers)` 在没有头部携带去重 ID 时，从解析后的主体中提供去重 ID，就像内置的 Stripe 方案对事件的 `id` 所做的那样。来自任一来源的长度超过 255 个字符的 ID 将以 `malformed-header` 拒绝。
- `key(secret)` 在启动时将每个配置密钥转换为 `verify()` 接收的键，如果密钥格式错误，则会停止应用程序。默认值使用密钥文本，拒绝空值或包含周围空白值的密钥。对于编码的密钥，请覆盖它，就像 `standard` 方案对 `whsec_…` 所做的那样。

接收者接收一个实例：

```typescript
receivers: {
  marketplace: {
    scheme: new MarketplaceScheme('https://api.store.example.com/webhooks/marketplace'),
    secret: process.env.MARKETPLACE_WEBHOOK_SECRET!,
  },
},

```

#### 轮换密钥

密钥泄露了，或者合作伙伴的策略规定一年足够了。`POST /partner/webhook-endpoints/:id/rotate-secret`（参见 [Let partners subscribe](/http/webhooks#let-partners-subscribe)）返回一个新的密钥，旧密钥会紧随其后继续签名 `secretRotationOverlap`，即 24 小时：每次投递都携带两个 `v1,` 签名，而 Standard Webhooks 验证器接受任何匹配的签名。合作伙伴在其列表中添加新密钥，部署，然后根据自己的时间表移除旧密钥。重叠期过后，只有新密钥签名。`rotateSecret()` 使用 `overlap: 0` 立即淘汰旧密钥，适用于泄露的密钥。

设置 `WEBHOOKS_ENCRYPTION_KEYS` 以对静态密钥进行密封，为每个密钥设置 `openssl rand -base64 32`，按最新到旧的顺序。在此之前创建的端点仍可读取（其密钥是明文），并在下一次轮换时进行密封。

#### 试用

创建数据库，并将其迁移应用到数据库上，这将从 [Installation](/http/webhooks#安装) 创建订单 API 的表和行：

```bash
$ psql postgres://localhost:5432/postgres -c 'CREATE DATABASE store'

```

导出支付提供商和承运商与商店共享的密钥（此处虚构），允许投递到此机器，并在端口 3000 上启动 API：

```bash
$ export PAYMENTS_WEBHOOK_SECRET=whsec_$(openssl rand -base64 32)
$ export CARRIER_WEBHOOK_SECRET=carrier_test_$(openssl rand -hex 6)
$ export WEBHOOKS_ALLOW_LOCAL=1

```

```bash
[Nest] 55905  - 09/30/2026, 6:52:36 PM     LOG [OutboxModule] OutboxStorage: PostgresOutboxStore
[Nest] 55905  - 09/30/2026, 6:52:36 PM     LOG [WebhooksModule] WebhooksStorage: PostgresWebhookStore
[Nest] 55905  - 09/30/2026, 6:52:36 PM     LOG [OutboxModule] PostgresOutboxStore: migrated schema "nest_outbox" to version 1.
[Nest] 55905  - 09/30/2026, 6:52:36 PM     LOG [WebhooksModule] PostgresWebhookStore: migrated schema "nest_webhooks" to version 1.
[Nest] 55905  - 09/30/2026, 6:52:36 PM     LOG [NestApplication] Nest application successfully started +2ms

```

您的迁移创建了订单 API 的表，商店创建了它们的模式，紧邻它们。Northside 使用其 API 密钥订阅两个事件，在一个将在端口 4100 上运行的接收者中。响应携带密钥，仅此一次：

```bash
$ curl -s -X POST localhost:3000/partner/webhook-endpoints \
    -H 'Authorization: Bearer partner_northside_7c1d2e' \
    --json '{"url":"http://127.0.0.1:4100/store/webhooks","eventTypes":["order.shipped","order.cancelled"],"description":"Warehouse system"}'
{"id":"ep_01a0f33b79e27154b8fd089a10f3e48e","tenant":"northside","url":"http://127.0.0.1:4100/store/webhooks","eventTypes":["order.shipped","order.cancelled"],"description":"Warehouse system","enabled":true,"disabledReason":null,"failingSince":null,"createdAt":1790787156450,"updatedAt":1790787156450,"secret":"whsec_yKaIEKkc0ZpOWofM8Fx1Wc5yxdffKSsP1jolLCynqug="}
$ curl -s localhost:3000/partner/webhook-endpoints -H 'Authorization: Bearer partner_northside_7c1d2e'
[{"id":"ep_01a0f33b79e27154b8fd089a10f3e48e","tenant":"northside","url":"http://127.0.0.1:4100/store/webhooks","eventTypes":["order.shipped","order.cancelled"],"description":"Warehouse system","enabled":true,"disabledReason":null,"failingSince":null,"createdAt":1790787156450,"updatedAt":1790787156450}]

```

> 信息 **提示** `--json` 需要 curl 7.82 或更高版本。

云元数据服务的 URL 在存储任何内容之前就会被拒绝，API 不发送的事件类型也会被拒绝。另一个合作伙伴 Riverside Cat Shelter 会收到 Northside 端点的 404 错误：

```bash
$ curl -s -X POST localhost:3000/partner/webhook-endpoints \
    -H 'Authorization: Bearer partner_northside_7c1d2e' \
    --json '{"url":"https://169.254.169.254/latest/meta-data/","eventTypes":["*"]}'
{"statusCode":400,"message":"Invalid webhook URL: 169.254.169.254 is link-local (cloud metadata)"}
$ curl -s -X POST localhost:3000/partner/webhook-endpoints \
    -H 'Authorization: Bearer partner_northside_7c1d2e' \
    --json '{"url":"https://hooks.northside.example.com/store","eventTypes":["order.paid"]}'
{"statusCode":400,"message":"Unknown message type \"order.paid\". Known: order.shipped, order.cancelled"}
$ curl -s -o /dev/null -w '%{http_code}' localhost:3000/partner/webhook-endpoints/ep_01a0f33b79e27154b8fd089a10f3e48e \
    -H 'Authorization: Bearer partner_riverside_91ab44'
404

```

在端口 4100 上启动 Northside 的接收者 `partner-service/main.ts`，使用其在环境变量中获得的密钥：

```bash
STORE_WEBHOOK_SECRET=whsec_yKaIEKkc0ZpOWofM8Fx1Wc5yxdffKSsP1jolLCynqug=

```

现在下订单，让支付提供商支付，让承运商发货。脚本使用上述导出的密钥签名它们将发送的请求：

```bash
$ curl -s -X POST localhost:3000/orders \
    -H 'Authorization: Bearer partner_northside_7c1d2e' \
    --json '{"items":[{"productId":"salmon-kibble-2kg","quantity":2}]}'
{"id":"1067d04c-0617-44ac-9a29-67297867329e","partnerId":"northside","items":[{"productId":"salmon-kibble-2kg","quantity":2,"price":2499}],"total":4998,"status":"placed","paymentId":null,"trackingNumber":null}
$ npx tsx scripts/send-webhook.ts payments payment.succeeded \
    '{"paymentId":"pay_8f21c","orderId":"1067d04c-0617-44ac-9a29-67297867329e","amount":4998}'
200
$ npx tsx scripts/send-webhook.ts carrier shipment.shipped \
    '{"orderId":"1067d04c-0617-44ac-9a29-67297867329e","trackingNumber":"TRK-4471-0001"}'
200
$ curl -s localhost:3000/orders/1067d04c-0617-44ac-9a29-67297867329e -H 'Authorization: Bearer partner_northside_7c1d2e'
{"id":"1067d04c-0617-44ac-9a29-67297867329e","partnerId":"northside","items":[{"price":2499,"quantity":2,"productId":"salmon-kibble-2kg"}],"total":4998,"status":"shipped","paymentId":"pay_8f21c","trackingNumber":"TRK-4471-0001"}

```

API 的日志显示两个 webhook 都已处理，Northside 的日志显示 `order.shipped` 在承运商之后到达，带有其 `webhook-id`：

```bash
[Nest] 55905  - 09/30/2026, 6:52:39 PM     LOG [PaymentProviderWebhooksController] Order 1067d04c-0617-44ac-9a29-67297867329e paid: pay_8f21c, 4998 cents
[Nest] 55905  - 09/30/2026, 6:52:40 PM     LOG [CarrierWebhooksController] Order 1067d04c-0617-44ac-9a29-67297867329e shipped, tracking TRK-4471-0001

```

```bash
[Nest] 56040  - 09/30/2026, 6:52:40 PM     LOG [StoreWebhooksController] Order 1067d04c-0617-44ac-9a29-67297867329e shipped, tracking TRK-4471-0001 (msg_01a0f33b898e7341950339801ec3319a)

```

Northside 的投递日志中有投递记录，其详细信息包含消息和一次尝试，以及合作伙伴的状态码和耗时：

```bash
$ curl -s localhost:3000/partner/webhook-deliveries -H 'Authorization: Bearer partner_northside_7c1d2e'
[{"id":"dlv_01a0f33b89ac720aa76e2c3da97f3c14","messageId":"msg_01a0f33b898e7341950339801ec3319a","endpointId":"ep_01a0f33b79e27154b8fd089a10f3e48e","tenant":"northside","type":"order.shipped","status":"succeeded","attempts":1,"nextAttemptAt":null,"lastAttemptAt":1790787160533,"lastStatusCode":204,"lastError":null,"failureReason":null,"createdAt":1790787160462,"completedAt":1790787160544}]
$ curl -s localhost:3000/partner/webhook-deliveries/dlv_01a0f33b89ac720aa76e2c3da97f3c14 -H 'Authorization: Bearer partner_northside_7c1d2e'

```

```json
{
  "id": "dlv_01a0f33b89ac720aa76e2c3da97f3c14",
  "messageId": "msg_01a0f33b898e7341950339801ec3319a",
  "endpointId": "ep_01a0f33b79e27154b8fd089a10f3e48e",
  "tenant": "northside",
  "type": "order.shipped",
  "status": "succeeded",
  "attempts": 1,
  "nextAttemptAt": null,
  "lastAttemptAt": 1790787160533,
  "lastStatusCode": 204,
  "lastError": null,
  "failureReason": null,
  "createdAt": 1790787160462,
  "completedAt": 1790787160544,
  "message": {
    "id": "msg_01a0f33b898e7341950339801ec3319a",
    "type": "order.shipped",
    "tenant": "northside",
    "body": "{\"type\":\"order.shipped\",\"timestamp\":\"2026-09-30T16:52:40.462Z\",\"data\":{\"orderId\":\"1067d04c-0617-44ac-9a29-67297867329e\",\"trackingNumber\":\"TRK-4471-0001\"}}",
    "createdAt": 1790787160462
  },
  "history": [
    { "deliveryId": "dlv_01a0f33b89ac720aa76e2c3da97f3c14", "attempt": 1, "at": 1790787160533, "durationMs": 11, "statusCode": 204, "response": "", "error": null }
  ]
}

```

使用 `Ctrl+C` 停止 Northside 的接收者，然后下订单并取消。投递连接失败，API 记录了等待下一次尝试的时间，合作伙伴的日志显示投递待处理及其错误：

```bash
$ curl -s -X POST localhost:3000/orders \
    -H 'Authorization: Bearer partner_northside_7c1d2e' \
    --json '{"items":[{"productId":"clumping-litter-10l","quantity":1}]}'
{"id":"d6a36832-6b83-40f6-960b-0c6aa905ae18","partnerId":"northside","items":[{"productId":"clumping-litter-10l","quantity":1,"price":1599}],"total":1599,"status":"placed","paymentId":null,"trackingNumber":null}
$ curl -s -X POST localhost:3000/orders/d6a36832-6b83-40f6-960b-0c6aa905ae18/cancel \
    -H 'Authorization: Bearer partner_northside_7c1d2e' \
    --json '{"reason":"out of stock"}'
{"id":"d6a36832-6b83-40f6-960b-0c6aa905ae18","partnerId":"northside","items":[{"price":1599,"quantity":1,"productId":"clumping-litter-10l"}],"total":1599,"status":"cancelled","paymentId":null,"trackingNumber":null}
$ curl -s 'localhost:3000/partner/webhook-deliveries?status=pending' -H 'Authorization: Bearer partner_northside_7c1d2e'
[{"id":"dlv_01a0f33b8f51724da606406a85418fab","messageId":"msg_01a0f33b8f367090b44d3de36eed8f13","endpointId":"ep_01a0f33b79e27154b8fd089a10f3e48e","tenant":"northside","type":"order.cancelled","status":"pending","attempts":1,"nextAttemptAt":1790787164580,"lastAttemptAt":1790787161969,"lastStatusCode":null,"lastError":"Error: connect ECONNREFUSED 127.0.0.1:4100","failureReason":null,"createdAt":1790787161910,"completedAt":null}]

```

```bash
[Nest] 55905  - 09/30/2026, 6:52:42 PM    WARN [WebhookWorker] Retrying webhook delivery dlv_01a0f33b8f51724da606406a85418fab (order.cancelled) in 2609ms (attempt 1 of 10 failed): Error: connect ECONNREFUSED 127.0.0.1:4100

```

重新启动接收者。重试成功，日志记录了两次尝试：

```bash
[Nest] 56304  - 09/30/2026, 6:52:45 PM     LOG [StoreWebhooksController] Order d6a36832-6b83-40f6-960b-0c6aa905ae18 cancelled: out of stock (msg_01a0f33b8f367090b44d3de36eed8f13)

```

```bash
$ curl -s localhost:3000/partner/webhook-deliveries/dlv_01a0f33b8f51724da606406a85418fab -H 'Authorization: Bearer partner_northside_7c1d2e'

```

```json
{
  "id": "dlv_01a0f33b8f51724da606406a85418fab",
  "type": "order.cancelled",
  "status": "succeeded",
  "attempts": 2,
  "lastStatusCode": 204,
  "history": [
    { "attempt": 1, "at": 1790787161969, "durationMs": 2, "statusCode": null, "response": null, "error": "Error: connect ECONNREFUSED 127.0.0.1:4100" },
    { "attempt": 2, "at": 1790787165060, "durationMs": 11, "statusCode": 204, "response": "", "error": null }
  ]
}

```

Northside 再次请求该投递。它使用相同的 `webhook-id` 发送，接收者的收件箱识别它并返回 204，而没有运行处理器（其日志中没有新内容），投递日志显示了一个新轮次：

```bash
$ curl -s -X POST localhost:3000/partner/webhook-deliveries/dlv_01a0f33b8f51724da606406a85418fab/retry \
    -H 'Authorization: Bearer partner_northside_7c1d2e'
{"retried":1}
$ curl -s localhost:3000/partner/webhook-deliveries/dlv_01a0f33b8f51724da606406a85418fab -H 'Authorization: Bearer partner_northside_7c1d2e'

```

```json
{
  "status": "succeeded",
  "attempts": 1,
  "history": [
    { "attempt": 1, "at": 1790787161969, "statusCode": null, "error": "Error: connect ECONNREFUSED 127.0.0.1:4100" },
    { "attempt": 2, "at": 1790787165060, "statusCode": 204, "error": null },
    { "attempt": 1, "at": 1790787166185, "statusCode": 204, "error": null }
  ]
}

```

现在是支付提供商的侧面。使用相同的 `webhook-id` 的重新投递（丢失的 200，因此提供商重试）得到了响应但没有再次处理：API 记录了一笔付款。篡改的主体和错误的密钥被拒绝，没有提供原因：

```bash
$ curl -s -X POST localhost:3000/orders \
    -H 'Authorization: Bearer partner_northside_7c1d2e' \
    --json '{"items":[{"productId":"salmon-kibble-2kg","quantity":1}]}'
{"id":"d7dbe1ab-c408-4688-9e9e-2925ed2025a3","partnerId":"northside","items":[{"productId":"salmon-kibble-2kg","quantity":1,"price":2499}],"total":2499,"status":"placed","paymentId":null,"trackingNumber":null}
$ WEBHOOK_ID=msg_2c9e4f1a npx tsx scripts/send-webhook.ts payments payment.succeeded \
    '{"paymentId":"pay_9d0a2","orderId":"d7dbe1ab-c408-4688-9e9e-2925ed2025a3","amount":2499}'
200
$ WEBHOOK_ID=msg_2c9e4f1a npx tsx scripts/send-webhook.ts payments payment.succeeded \
    '{"paymentId":"pay_9d0a2","orderId":"d7dbe1ab-c408-4688-9e9e-2925ed2025a3","amount":2499}'
200
$ TAMPER=1 npx tsx scripts/send-webhook.ts payments payment.succeeded \
    '{"paymentId":"pay_9d0a2","orderId":"d7dbe1ab-c408-4688-9e9e-2925ed2025a3","amount":2499}'
401 {"message":"Webhook signature verification failed","error":"Unauthorized","statusCode":401}
$ PAYMENTS_WEBHOOK_SECRET=whsec_$(openssl rand -base64 32) npx tsx scripts/send-webhook.ts payments payment.succeeded \
    '{"paymentId":"pay_9d0a2","orderId":"d7dbe1ab-c408-4688-9e9e-2925ed2025a3","amount":2499}'
401 {"message":"Webhook signature verification failed","error":"Unauthorized","statusCode":401}

```

```bash
[Nest] 55905  - 09/30/2026, 6:52:48 PM     LOG [PaymentProviderWebhooksController] Order d7dbe1ab-c408-4688-9e9e-2925ed2025a3 paid: pay_9d0a2, 2499 cents

```

最后，旋转端点的密钥。接收者仍使用旧密钥运行，但下一次投递仍会验证：它携带了两个签名。然后使用新密钥在前、旧密钥在后的顺序重启接收者，就像合作伙伴部署的那样，并放置和取消另一个订单：该投递也验证成功：

```bash
$ curl -s -X POST localhost:3000/partner/webhook-endpoints/ep_01a0f33b79e27154b8fd089a10f3e48e/rotate-secret \
    -H 'Authorization: Bearer partner_northside_7c1d2e'
{"secret":"whsec_BUPv/LlKhv9qDH7udP3gsGPquuj4WaopeP8fxyouWOk="}
$ curl -s -X POST localhost:3000/orders/d7dbe1ab-c408-4688-9e9e-2925ed2025a3/cancel \
    -H 'Authorization: Bearer partner_northside_7c1d2e' \
    --json '{"reason":"customer changed their mind"}'
{"id":"d7dbe1ab-c408-4688-9e9e-2925ed2025a3","partnerId":"northside","items":[{"price":2499,"quantity":1,"productId":"salmon-kibble-2kg"}],"total":2499,"status":"cancelled","paymentId":"pay_9d0a2","trackingNumber":null}

```

```bash
[Nest] 56304  - 09/30/2026, 6:52:50 PM     LOG [StoreWebhooksController] Order d7dbe1ab-c408-4688-9e9e-2925ed2025a3 cancelled: customer changed their mind (msg_01a0f33bb022712e8e440b7adef8208f)

```

```bash
STORE_WEBHOOK_SECRET=whsec_BUPv/LlKhv9qDH7udP3gsGPquuj4WaopeP8fxyouWOk=,whsec_yKaIEKkc0ZpOWofM8Fx1Wc5yxdffKSsP1jolLCynqug=

```

```bash
$ curl -s -X POST localhost:3000/orders \
    -H 'Authorization: Bearer partner_northside_7c1d2e' \
    --json '{"items":[{"productId":"clumping-litter-10l","quantity":2}]}'
{"id":"d203fd6f-7396-489b-9d20-775cd8a6ca4e","partnerId":"northside","items":[{"productId":"clumping-litter-10l","quantity":2,"price":1599}],"total":3198,"status":"placed","paymentId":null,"trackingNumber":null}
$ curl -s -X POST localhost:3000/orders/d203fd6f-7396-489b-9d20-775cd8a6ca4e/cancel \
    -H 'Authorization: Bearer partner_northside_7c1d2e' \
    --json '{"reason":"ordered twice"}'
{"id":"d203fd6f-7396-489b-9d20-775cd8a6ca4e","partnerId":"northside","items":[{"price":1599,"quantity":2,"productId":"clumping-litter-10l"}],"total":3198,"status":"cancelled","paymentId":null,"trackingNumber":null}

```

```bash
[Nest] 56624  - 09/30/2026, 6:52:52 PM     LOG [StoreWebhooksController] Order d203fd6f-7396-489b-9d20-775cd8a6ca4e cancelled: ordered twice (msg_01a0f33bb8ad7249a0fa069361100c49)

```

投递是您数据库中的行，在商店的模式中：

```bash
$ psql "$DATABASE_URL" -c "SELECT type, status, attempts, last_status_code FROM nest_webhooks.deliveries ORDER BY created_at"
      type       |  status   | attempts | last_status_code
-----------------+-----------+----------+------------------
 order.shipped   | succeeded |        1 |              204
 order.cancelled | succeeded |        1 |              204
 order.cancelled | succeeded |        1 |              204
 order.cancelled | succeeded |        1 |              204
(4 rows)

```

#### 测试

在 e2e 测试中，使用 [PGlite](https://pglite.dev) 在进程内运行 PostgreSQL 和您的真实迁移，关闭中继和工作者，用记录请求的传输器替换传输器，并使用 `signWebhook()` 对提供者的请求进行签名。用一个在 PGlite 上的数据库 `DrizzleModule` 注册表（`getDrizzleToken()` 返回其令牌）覆盖，商店会跟随，因为它们的工厂注入它，并在应用程序启动时在那里创建它们的模式：

```typescript title="test/webhooks.e2e-spec.ts"
import { PGlite } from '@electric-sql/pglite';
import type { INestApplication } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import { OutboxRelay } from '@nestjs/outbox';
import { Test } from '@nestjs/testing';
import { InMemoryWebhookTransport, WebhookEndpoints, WebhookTransport, WebhookWorker } from '@nestjs/webhooks';
import { signWebhook } from '@nestjs/webhooks/testing';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import * as schema from '../src/database/schema.js';
import { OrdersService } from '../src/orders/orders.service.js';

const PAYMENTS_SECRET = `whsec_${Buffer.alloc(32, 1).toString('base64')}`;
const CARRIER_SECRET = 'carrier_test_secret';

describe('Order webhooks', () => {
  const client = new PGlite(); // PostgreSQL, in-process
  const db = drizzle({ client });
  const transport = new InMemoryWebhookTransport(); // records requests instead of sending them
  const partner = { id: 'northside', name: 'Northside Pet Supplies' };
  let app: INestApplication;
  let relay: OutboxRelay;
  let worker: WebhookWorker;
  let endpoint: { id: string; secret: string };

  beforeAll(async () => {
    // The real migrations: the order tables. The stores create their schemas when the app starts.
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
    process.env.PAYMENTS_WEBHOOK_SECRET = PAYMENTS_SECRET;
    process.env.CARRIER_WEBHOOK_SECRET = CARRIER_SECRET;
    process.env.OUTBOX_RELAY = 'off'; // no poll loops: the test drives the relay and the worker
    process.env.WEBHOOKS_WORKER = 'off';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDrizzleToken())
      .useValue(db) // the stores' factories inject it too
      .overrideProvider(WebhookTransport)
      .useValue(transport)
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
    relay = app.get(OutboxRelay);
    worker = app.get(WebhookWorker);
    endpoint = await app.get(WebhookEndpoints).create({ url: 'https://hooks.northside.example.com/store', eventTypes: ['*'], tenant: partner.id });
  });

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  /** Publishes committed messages (the fan-out), then runs one worker batch. */
  const deliver = async () => {
    await relay.runOnce();
    return worker.runOnce();
  };
  const shipment = (orderId: string, id = 'evt_1') =>
    signWebhook({
      scheme: 'stripe',
      header: 'Carrier-Signature',
      secret: CARRIER_SECRET,
      payload: { id, type: 'shipment.shipped', data: { orderId, trackingNumber: 'TRK-1' } },
    });

  it("sends order.shipped to the partner once the carrier's webhook commits", async () => {
    const order = await app.get(OrdersService).placeOrder(partner, { items: [{ productId: 'salmon-kibble-2kg', quantity: 1 }] });
    const paid = signWebhook({
      scheme: 'standard',
      secret: PAYMENTS_SECRET,
      payload: { type: 'payment.succeeded', data: { paymentId: 'pay_1', orderId: order.id, amount: order.total } },
    });
    await request(app.getHttpServer()).post('/webhooks/payments').set(paid.headers).send(paid.body).expect(200);
    const shipped = shipment(order.id);
    await request(app.getHttpServer()).post('/webhooks/carrier').set(shipped.headers).send(shipped.body).expect(200);
    expect(transport.sent).toEqual([]); // nothing until the outbox relays the commit

    expect(await deliver()).toMatchObject({ delivered: 1 });

    const sent = transport.single({ type: 'order.shipped', endpointId: endpoint.id });
    expect(sent.data).toEqual({ orderId: order.id, trackingNumber: 'TRK-1' });
    expect(sent.isSignedWith(endpoint.secret)).toBe(true);
  });

  it('processes a redelivered shipment webhook once', async () => {
    const [order] = await db.select().from(schema.orders);
    const shipped = shipment(order!.id);
    await request(app.getHttpServer()).post('/webhooks/carrier').set(shipped.headers).send(shipped.body).expect(200, '');
    expect(await deliver()).toMatchObject({ claimed: 0 });
    expect(transport.sent).toHaveLength(1);
  });

  it('refuses a webhook whose body was altered', async () => {
    const shipped = shipment('order-x', 'evt_2');
    await request(app.getHttpServer())
      .post('/webhooks/carrier')
      .set(shipped.headers)
      .send(shipped.body.replace('TRK-1', 'TRK-2'))
      .expect(401);
    expect(await deliver()).toMatchObject({ claimed: 0 });
  });
});

```

- Outbox、两个商店、迁移、扇出、签名和验证都是真实的。只替换了网络：`InMemoryWebhookTransport` 回复 200 并保留每个请求，而 `respondWith(503)` 或一个函数模拟一个宕机、缓慢或挑剔的合作伙伴。
- `deliver()` 是提交后的整个管道：`relay.runOnce()` 发布已提交的消息（扇出创建了投递），`worker.runOnce()` 领取一个批次并发送它。
- `SentWebhook.isSignedWith(secret)` 使用端点的密钥验证 `v1` 签名，而 `data` 是主体中的 `data`，因此测试断言于合作伙伴将验证和读取的内容。
- `signWebhook()` 生成支付提供者（Stripe 或 GitHub）将发送的主体和头部。重用其 `id` 进行重新投递，移动 `timestamp` 以测试容忍度，修改主体的一个字节以进行篡改请求。
- 对于依赖时间的行为，例如退避、租约和轮换重叠，将 `Date.now()` 提前到 `vi.spyOn(Date, 'now')`。工作者和商店从其中获取时间，而真实计时器对 Socket 持续运行。
- 示例中的 `tutorial.e2e-spec.ts` 在真实 HTTP、PGlite 和 PostgreSQL 服务器上运行此页面的每个部分：API 通过默认传输器向合作伙伴的接收者投递，包括中断、重放、重新投递和轮换。其 `zod.e2e-spec.ts` 使用 DTO 的 Zod 变体和 `StandardSchemaValidationPipe` 启动相同的应用程序。其商店测试通过 PGlite、PostgreSQL 和 MySQL 上的 Drizzle，以及 PostgreSQL 上的 TypeORM 运行：合同套件、与订单一起提交和回滚的调度，以及生产中的模式。

有关测试设置的更多信息，请参阅 [End-to-end testing](/fundamentals/testing#端到端测试)。

#### 投递保证

传出的 Webhook **至少投递一次**；接收者通过 `webhook-id` 去重。

| 情况 | 结果 |
| --- | --- |
| 订单的事务回滚 | 消息从未存在，不发送任何内容 |
| 订单的事务提交 | 每个订阅的租户端点投递一次，最终投递或带有尝试日志失败 |
| Outbox 重新投递消息（扇出后中继崩溃） | 扇出是幂等的：每个消息和端点投递一次 |
| 端点在消息之后创建或被禁用 | 不接收，重放不会将其恢复 |
| 工作者在领取后死亡 | 在租约过期后由另一个工作者发送（`worker.lease`，1 分钟） |
| 工作者在发送后、记录前死亡 | **发送两次**，使用相同的 `webhook-id`，在租约过期后 |
| 两个工作者，相同投递 | 领取是租约的独占，后续的每次写入都由其围栏保护 |
| 合作伙伴回答 2xx | 已投递 |
| 回答其他任何内容或无响应 | 带有退避重试，遵守 `Retry-After`；429、502、503 和 504 控制端点速率 |
| 回答 410 Gone | 失败（`rejected`），并且端点被禁用（`gone`） |
| `disableEndpointAfter` 次尝试均失败 | 端点被禁用（`failing`），仅一次 |
| 合作伙伴请求重放 | 使用相同的 `webhook-id` 进行新一轮，因此其收件箱会跳过它 |

投递**没有顺序**。一个工作者一次发送一个端点的投递，最逾期的优先，但失败的尝试会等待其退避时间，而后续消息会发出；多个工作者同时向同一端点发送；重放现在发送一条旧消息。一个订单的两次更新可能以任意顺序到达合作伙伴。接收者像处理重复项一样处理：主体中的 `timestamp` 是消息被分派的时间（`webhook-timestamp` 是本次尝试被签名的时间），因此处理程序可以忽略早于其已持有状态的事件，或将 Webhook 视为信号并从 API 读取当前状态。

在常见情况下，使用默认收件箱时，传入的 Webhook **每个 Webhook ID 和接收者只运行一次**（在处理程序和收件箱写入之间崩溃，或两个实例竞争两个副本时也是如此），并且它们的 `processInTransaction()` **恰好运行一次**。

#### 生产检查清单

- 将端点和交付物保留在应用程序的数据库中，在数据库服务器上：注册 `PostgresWebhookStore` 或 `MySqlWebhookStore`，并将外置箱的存储放在旁边（[Keep webhooks in your database](/http/webhooks#keep-webhooks-in-your-database)）。生产守卫拒绝在内存中启动；`allowInMemoryStorage` 适用于您可以承受丢失待处理交付物的进程。
- 在新版本启动前，使用 `npx @nestjs/webhooks migrate` 和 `npx @nestjs/outbox migrate` 或您的迁移工具应用两个存储的迁移，并在 CI 中使用 `status` 检查它们。使用 `NODE_ENV=production` 时，存储不会在启动时迁移：落后的模式会失败。
- 在 PostgreSQL 上，将数据库的默认隔离级别保持在 READ COMMITTED：存储拒绝更严格的级别。在 MySQL 上，当 MySQL 发生死锁（错误 1213）时，重新运行事务：它已回滚，连同它分发的消息和记录的 Webhook 一起。
- 移除 `delivery.allowHttp` 和 `delivery.allowPrivateNetworks`。合作伙伴的 URL 是不受信任的输入，传输器自行解析它并固定了它检查的地址。使用 `allowedAddresses` 来指定您真正交付的那个私有范围，并对 `destination-blocked` 事件发出警报：客户将 Webhook 指向您的元数据服务值得关注。
- 在几个实例中运行工作者（`WEBHOOKS_WORKER`），而不是在每个 API pod 中运行：每个声明都是一个短事务，租约防止它们重复发送相同的交付物。
- 从 `deliveries.stats()` 警报 `lagMs` 和 `failed`，以及 `endpoint-disabled`：通过电子邮件告知合作伙伴其端点已关闭以及原因。
- 对有效载荷进行版本控制。合作伙伴可能会保留其处理程序多年，而 `retry()` 会重新发送分发时的原始主体。向类型的 `data` 添加字段，绝不重命名或删除。对于破坏性变更，添加一个新类型，在 `eventTypes` 中使用 `order.shipped.v2`，并在同一事务中分发两者（`dispatch()` 接受一个数组），同时合作伙伴迁移其订阅；订阅了 `*` 的端点会收到两者。然后停止分发旧类型。旧消息的重放会保留旧的形状，直到日志被修剪。
- 向合作伙伴提供交付日志和重放。这在他们打开工单之前就能回答“是否发送了？”
- 带有重叠地轮换密钥，绝不使用 `overlap: 0`，除非密钥泄露，并使用 `WEBHOOKS_ENCRYPTION_KEYS` 在静态存储中密封它们。将密钥保存在密钥管理器中。
- 修剪日志。从 [cron job](/techniques/task-scheduling#声明式-cron-任务) 中使用 `deliveries.prune('30d')`；没有东西会为您调度它。
- 对于传入的 Webhook，保留 `rawBody: true`，并将接收者的密钥保存在环境变量中。在提供者轮换期间列出旧密钥和新密钥。
- 保持提供者处理程序简短且自身是幂等的（事务内的状态检查），即使有 `processInTransaction()`：收件箱防止重复交付，检查防止提供者为同一事实发送两个不同事件。
- 使用 `OutboxInbox.prune()` 在比任何提供者重试计划更长的窗口上修剪收件箱（Stripe 重试三天，GitHub 完全不重试）。对于 GitHub，该窗口也是捕获重放请求的时间，去重基于主体（[Other senders](/http/webhooks#other-senders)）。
- 调用 `app.enableShutdownHooks()`，以便部署可以完成正在进行的尝试并释放其余部分。
- 对于您自己的存储，在 CI 中使用 `concurrent: true` 运行契约套件，针对您在生产中运行的数据库版本。

#### 存储契约

`PostgresWebhookStore` 和 `MySqlWebhookStore` 实现了该包的两个契约，`WebhookEndpointStore` 和 `WebhookDeliveryStore`。对于其他数据库，在您自己的提供者中实现它们。两个接口中每个方法的 JSDoc 都会说明其规则以及它防止的竞态条件。

**注册。** 存储是一个普通的单例提供者，在其构造函数中调用可注入的 `WebhooksStorage` 上的 `registerSource()`，命名其实现的契约：`endpoints`、`deliveries` 或两者都来自一个类。注册表会一次性检查形状，除非通过 `replace: true`，否则拒绝第二次注册，并在 `WebhooksModule` 初始化时锁定，记录正在使用的存储。如果没有注册任何内容，模块使用 `InMemoryWebhookStore`，它在重启时会丢失端点和待处理交付物，并且无法在实例之间共享它们。使用 `NODE_ENV=production` 时，启动会失败，除非 `allowInMemoryStorage: true` 接受这一点。

**无事务句柄。** 与外置箱的 `add()` 不同，此处没有方法会接收您的事务：外置箱将消息带出您的事务，而 Webhook 存储在自己的连接上运行。

**方法。** 标记为原子的方法是一个条件语句或一个带有行锁的事务，绝不是先读取后写入；它们是契约套件进行竞态检查的对象。

| 方法 | 功能 | 原子性 |
| --- | --- | --- |
| `createEndpoint`, `getEndpoint`, `listEndpoints`, `updateEndpoint`, `deleteEndpoint` | 端点的生命周期；`list` 按租户最新优先 | 否 |
| `findSubscribedEndpoints(tenant, type)` | 订阅了该类型的完全启用端点（或 `*`）：扇出查询 | 否，但套件检查它绝不会返回另一个租户的 |
| `addEndpointSecret(id, secret, expireOthersAt, now)` | 轮换：新密钥优先，其他密钥过期 | 是：行被锁定，因此两次轮换都会落地 |
| `recordEndpointFailure(id, failure)` | 首次失败时设置 `failingSince`；一旦端点失败足够长的时间就禁用它，并报告一次 | 是：行被锁定 |
| `recordEndpointSuccess(id)` | 清除 `failingSince` | 否 |
| `createDeliveries(message, deliveries)` | 扇出：消息如果不存在则添加，每个交付物如果其 `(messageId, endpointId)` 不存在则添加 | 是：对该对的唯一键，例如 PostgreSQL 上的 `ON CONFLICT DO NOTHING` |
| `claimDeliveries(request)` | 租用逾期交付物，最逾期优先，附带其消息 | 是：`FOR UPDATE SKIP LOCKED`，然后是租约 |
| `recordDeliveryAttempt(id, owner, update)` | 尝试的结果和日志行，如果 `owner` 仍持有租约 | 是：由租约所有者围栏保护 |
| `releaseDeliveries(ids, owner, nextAttemptAt)` | 释放租约，按请求推迟 | 是：被围栏保护 |
| `getDelivery`, `getMessage`, `listDeliveries`, `listDeliveryAttempts`, `deliveryStats` | 读取；`list` 按租户、端点、消息、状态和类型最新优先 | 否 |
| `retryDeliveries(filter, now)` | 对于未被租用的匹配项的新一轮 | 是：一个带有租约的 `UPDATE` 在其 `WHERE` 中 |
| `pruneDeliveries(before)` | 超过 `before` 的已完成交付物、其日志以及未交付的消息 | 否，但绝不会有待处理的交付物 |

使用 `webhookEndpointStoreContract()` 和 `webhookDeliveryStoreContract()` 从 `@nestjs/webhooks/testing` 进行测试。每个案例都使用您传入的函数从空表中获取一个存储。教程中的测试针对 `PostgresWebhookStore` 及 Drizzle 运行两个套件，就像您针对自己的存储一样：

```typescript title="test/drizzle-webhook.store.e2e-spec.ts"
/** A store on emptied tables, built the way Nest builds it: with the database and a registry. */
async function freshStore(db: Database) {
  await db.execute(sql.raw(`TRUNCATE ${STORE_TABLES.join(', ')} RESTART IDENTITY`));
  return { store: new PostgresWebhookStore({ executor: fromDrizzle(db) }, new WebhooksStorage()) };
}

// ...

// The concurrency cases run too; with one connection, PGlite runs them one statement at a time.
describe('the endpoint contract', () => {
  for (const c of webhookEndpointStoreContract(() => freshStore(db), { concurrent: true })) {
    it(c.name, c.run);
  }
});
describe('the delivery contract', () => {
  for (const c of webhookDeliveryStoreContract(() => freshStore(db), { concurrent: true })) {
    it(c.name, c.run);
  }
});

```

使用 `concurrent: true`，套件会竞态检查一个端点的轮换和失败，工作者并排声明，一个消息的扇出，一个陈旧的工作者对抗接管，以及一个声明的重试。在 PGlite 上，使用一个连接，它们以序列化的方式通过；在服务器上，通过多个连接的连接池运行它们，没有正确锁的存储会使它们失败。该包自身的测试针对手写的 Drizzle 存储运行套件，这是证明针对接口编写的存储通过测试的证明。

#### 参考

##### 模块选项

`WebhooksModule.forRoot()` 接受这些选项。`forRootAsync()` 在顶层接受 `outgoing`、`transport` (作为类)、`imports` 和 `isGlobal`，紧邻 `useFactory`、`useClass` 或 `useExisting`，工厂返回其余部分。参见 [Register the modules](/http/webhooks#register-the-modules)。

| 选项 | 默认值 | 描述 |
| --- | --- | --- |
| `eventTypes` | any type | 此应用程序发送的消息类型。`dispatch()` 和新的端点仅接受这些类型（端点也接受 `*`）。 |
| `retry` | 10 attempts | `attempts`（包括第一次）、`backoff` 和 `retryIf(error, attempt, delivery)`。一个数字设置 `attempts`，而 `false` 表示单次尝试。 |
| `retry.backoff` | 参见描述 | `delay`（`'5s'`）、`factor` (4)、`maxDelay`（`'1d'`，也是 `Retry-After` 的上限）、`jitter`：`'equal'`、`'full'` 或 `'none'`（`'equal'`）。或者一个返回持续时间的尝试、错误和递送的函数。 |
| `disableEndpointAfter` | `'5d'` | 禁用在任何尝试中均未成功且持续了该时间长度的端点。`false` 从不禁用端点。 |
| `secretRotationOverlap` | `'24h'` | 轮换出密钥在旁边继续签名的时长。 |
| `delivery.timeout` | `'15s'` | 单次尝试：DNS、连接、TLS、请求和响应。短于 `worker.lease`。 |
| `delivery.allowHttp` | `false` | 接受 `http://` 端点 URL。用于开发。 |
| `delivery.allowPrivateNetworks` | `false` | 递送到环回、私有、共享地址和唯一本地范围。用于开发。链路本地和云元数据地址保持阻止。 |
| `delivery.allowedAddresses` | none | CIDR 范围，例如 `10.20.0.0/16`，尽管会被阻止也会递送。 |
| `delivery.maxResponseSize` | 4096 | 读取并保留在日志中的响应体字节数。 |
| `delivery.userAgent` | `NestJS-Webhooks/1.0` | `User-Agent` 头部。 |
| `worker.enabled` | `true` | 在此进程中递送。在仅分派的实例中为 `false`。 |
| `worker.pollInterval` | `'1s'` | 空闲时的轮询等待时间。`notify()` 一次性轮询。 |
| `worker.batchSize` | 50 | 每个轮询声明的递送次数。 |
| `worker.concurrency` | 10 | 并行递送到端点的数量。一个端点的递送一次一个。 |
| `worker.lease` | `'1m'` | 声明的独占时长。长于 `delivery.timeout`。 |
| `encryption` | off | 在静止状态下密封端点密钥。`keys` 列出 32 字节的 `Buffer` 或至少 32 个字符的字符串，按最新到旧排序：第一个密钥加密，每个密钥解密。 |
| `receivers` | none | 此应用程序接受的发送者的 Webhook，由名称 `@VerifyWebhook()` 使用（参见下表）。 |
| `transport` | `HttpWebhookTransport` | 顶层的 `WebhookTransport` 类，或来自异步工厂的实例。 |
| `allowInMemoryStorage` | `false` | 允许生产应用程序在没有注册存储的情况下启动。 |
| `outgoing` | `true` | 仅顶层。在仅接收 Webhook 的服务中为 `false`：没有端点、递送、工作者或存储。 |
| `imports` | none | 仅顶层。传输类注入的模块的导出。 |
| `isGlobal` | `true` | 仅顶层。全局注册模块。 |

持续时间以毫秒或诸如 `'15s'`、`'24h'` 或 `'5d'` 的字符串表示。选项的注入令牌是 `WEBHOOKS_MODULE_OPTIONS`。

`receivers` 的每个条目接受这些选项（参见 [Receive the payment provider's webhooks](/http/webhooks#receive-the-payment-providers-webhooks) 和 [Receive the carrier's Stripe-like webhooks](/http/webhooks#receive-the-carriers-stripe-like-webhooks)）：

| 选项 | 适用对象 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `scheme` | all | required | `'standard'`、`'stripe'`、`'github'` 或继承自 `WebhookSignatureScheme` 的类的实例 |
| `secret` | all | required | 一个密钥，或在发送者轮换期间的数组。尝试每一个。 |
| `tolerance` | `standard`, `stripe`, custom | `'5m'` | 签名时间戳与当前时间之间允许的最大距离，任一方向 |
| `header` | `stripe` | `'stripe-signature'` | 签名头部，用于复制 Stripe 方案的发送者 |
| `id` | `stripe`, `github` | 负载的 `id`；未签名的 `X-GitHub-Delivery` 头部（参见 [Other senders](/http/webhooks#other-senders)） | 一个返回去重 ID 的负载和头部的函数，最多 255 个字符 |
| `dedupe` | all | `true` | 跳过此接收者已处理的 Webhook ID |
| `consumer` | all | `webhooks:<name>` | 收件箱消费者名称。保持稳定。最多 255 个字符，默认包含：更长的会因 `TypeError` 而导致启动失败 |

##### PostgreSQL 和 MySQL 存储

`new PostgresWebhookStore(options, webhooksStorage)`（来自 `@nestjs/webhooks/postgres`）和 `new MySqlWebhookStore(options, webhooksStorage)`（来自 `@nestjs/webhooks/mysql`）接受这些选项。出件箱的 `PostgresOutboxStore` 和 `MySqlOutboxStore` 采用相同设置，默认 `schema` 为 `'nest_outbox'`：

| 选项 | 默认值 | 含义 |
| --- | --- | --- |
| `executor` | Required | 存储如何连接到数据库：PostgreSQL 上的 `fromDrizzle(db)`、`fromTypeOrm(dataSource)`、`fromPrisma(prisma, options)`、`fromKysely(db)` 和 `fromPg(pool)`，或 MySQL 上的 `fromMysql2(pool)`，从存储自身的子路径导入：其他方言的执行器不编译 |
| `schema` | `'nest_webhooks'` | 在 PostgreSQL 上，其表的模式，由其第一个 `nest_webhooks_endpoints` 创建：字母、数字和下划线，不以数字开头，最多 63 个字符。在 MySQL 上，连接数据库中的表前缀（`nest_webhooks_endpoints`...）：小写字母、数字和下划线，不以数字开头，最多 40 个字符 |
| `migrate` | `true`，但不是 `NODE_ENV=production` | 在应用程序启动时应用待处理的 `false`。使用 `false` 时，如果模式落后，启动将因 `WebhookSchemaError` 而失败 |

每个执行器接受您的数据库客户端以及其自身的事务对象，然后由 `dispatch()` 和 `processInTransaction()` 接收：

| 执行器 | 接收 | 事务对象 |
| --- | --- | --- |
| `fromDrizzle(db)` | 一个 Drizzle 数据库：在 PostgreSQL 上，使用其驱动；在 MySQL 上，使用 `drizzle-orm/mysql2` 的 | `tx`，由 `db.transaction()` 传递其回调 |
| `fromTypeOrm(dataSource)` | 一个类型为 `postgres` 或 `mysql` 的 `DataSource` | `EntityManager`，由 `dataSource.transaction()` 传递其回调，或在 `startTransaction()` 之后的一个 `QueryRunner` |
| `fromPg(pool)` | PostgreSQL 上的一个 node-postgres `Pool` | 在 `BEGIN` 之后，来自 `pool.connect()` 的客户端 |
| `fromMysql2(pool)` | MySQL 上的一个 `mysql2/promise` 池 | 在 `beginTransaction()` 之后，来自 `pool.getConnection()` 的连接 |
| `fromPrisma(prisma, options)` | 通过驱动适配器（如 `@prisma/adapter-pg`）的 Prisma 客户端，或 MySQL 上的 `@prisma/adapter-mariadb`。`maxWait`（默认 `'10s'`）和 `timeout`（默认 `'1m'`）限制了存储自身的事务 | `prisma.$transaction()` 传递其回调的事务客户端 |
| `fromKysely(db)` | 一个具有 PostgreSQL 或 MySQL 方言的 `Kysely` 实例 | `db.transaction().execute()` 传递其回调的事务 |

存储的 `migrate()` 方法会一次性应用待处理的 `migrate` 选项所指示的迁移，并以已应用的版本解析。`PostgresWebhookStore.migrationSql()` 和 `MySqlWebhookStore.migrationSql()` 返回它们的 SQL，带有簿记信息。它们的选项是 `schema`、要迁移的版本 `from`（默认 `0`，新数据库）和 `to`（默认：包所需的那个），以及 `statementBreakpoints`，它将 drizzle-kit 的 `--> statement-breakpoint` 放在语句之间。在 PostgreSQL 上，从版本 0 开始，SQL 以 `CREATE SCHEMA IF NOT EXISTS` 开始，需要数据库的 CREATE 权限：如果有人为您创建了模式，则省略它。`MySqlWebhookStore.migrationStatements()` 以每行一个字符串的形式返回 MySQL 语句，按顺序，每次执行。`schemaVersion` 是包所需的版本。模式自身的版本是在其 `migrations` 表中应用的最大版本。

命令行 `npx @nestjs/webhooks` 接受 `--url`（默认 `DATABASE_URL`），其方案选择存储：对于 `PostgresWebhookStore` 的模式是 `postgres://` 或 `postgresql://`，对于 `MySqlWebhookStore` 的表是 `mysql://`。它还接受 `--schema`（默认 `nest_webhooks`）。`npx @nestjs/outbox` 对出件箱的存储执行相同操作：

| 命令 | 功能描述 |
| --- | --- |
| `migrate` | 应用待定迁移，类似于启动时的行为。需要安装 `pg` 或 `mysql2` |
| `status` | 打印模式的版本和包所需的版本，如果模式落后则以 1 退出 |
| `sql` | 在没有数据库的情况下打印 `migrationSql()` 的 SQL，从 `--from` 到 `--to`：PostgreSQL 的，或带有 `--dialect mysql` 的 MySQL。`--statement-breakpoints` 为 drizzle-kit 分离语句 |

##### 服务和装饰器

- `Webhooks`: `dispatch(tx, message)` 接收一个消息或一个数组，包含 `type`、`data`、`tenant` 和一个可选的 `id`，对于未知类型、不可 JSON 序列化的数据或无效 ID 会抛出 `TypeError`。`notify()` 立即运行中继。
- `WebhookEndpoints`: `create(input)`、`list(query)`、`get(id, scope)`、`update(id, changes, scope)`、`delete(id, scope)`、`getSecret(id, scope)` 和 `rotateSecret(id, options)`，其中 `options` 接收 `tenant`、`overlap` 和 `secret`。`create()` 也接收一个 `secret`，一个现有的 `whsec_…` 代替生成的。参见 [Let partners subscribe](/http/webhooks#let-partners-subscribe)。
- `WebhookDeliveries`: `list(query)`、`get(id, scope)`、`retry(idOrFilter, scope)`、`stats()` 和 `prune(olderThan)`。参见 [Retries, the delivery log and replay](/http/webhooks#retries-the-delivery-log-and-replay)。
- `WebhookWorker`: 交付者，在应用程序启动时启动，除非 `worker.enabled` 是 `false`。`start()`；`stop()`，停止声明，等待正在进行的尝试并释放尚未开始的交付；`running`；`notify()`，现在轮询而不是在下一个滴答；`runOnce()`，声明一个批次并交付它，解析它 `claimed`、`delivered`、`retried`、`failed` 和 `released` 的数量，以及丢失租约的数量（`leaseLost`），并与停止的工作者协同工作，因为测试驱动了它；`stats()`，与 `WebhookDeliveries.stats()` 相同。
- `WEBHOOKS_OUTBOX_TOPIC`: 消息分发所在的出件箱主题，`'nestjs.webhooks.message'`，到包的 `@OnOutboxMessage()` 处理程序，即扇出。其 `route` 从多个传输器中选择一个的出件箱将此主题发送到 `local`。
- `WebhookVerifier`: `verify(receiver, request)` 从其 `headers` 和 `rawBody` 检查未通过 HTTP 路由到达的请求，例如存储在队列中的请求。
- `@VerifyWebhook(receiver)` 在方法或控制器上进行验证和去重。`@IncomingWebhook()` 注入经过验证的 webhook：`receiver`、`id`、`timestamp`、`payload`、`rawBody` 和 `processInTransaction()`。`@WebhookPayload()` 仅注入有效载荷，并接受像 `@Body()` 这样的管道。

##### 传输器

工作者通过 `WebhookTransport` 提供者发送。默认的 `HttpWebhookTransport` 是从 `delivery` 选项构建的：每个尝试一个 `POST` 超过 `node:http` 和 `node:https`，主机只解析一次，它解析到的每个地址都会被检查，套接字固定在已检查的地址上，不跟随重定向，没有环境代理。其构造函数接收两个 `delivery` 不接收的选项：

- `ca`: 除了 Node 自身的，需要信任的证书颁发机构，用于私有 CA 后端的端点。它们被添加到 Node 的信任存储中，因此公共端点会继续验证。
- `lookup`: 将主机名解析为其拥有的每个地址，每个地址都是一个 `address` 及其 `family`（4 或 6），替代系统解析器。它返回的每个地址仍然被检查，连接到第一个。

要使用它们，将实例作为 `transport` 传递，具有与 `delivery` 相同的 `allowHttp`、`allowPrivateNetworks` 和 `allowedAddresses`：`delivery` 仍然决定 `WebhookEndpoints` 接受哪些 URL，以及传输器连接到哪里。

```typescript
WebhooksModule.forRoot({
  delivery: { allowedAddresses: ['10.20.0.0/16'] },
  transport: new HttpWebhookTransport({
    allowedAddresses: ['10.20.0.0/16'],
    ca: readFileSync('/etc/ssl/partners-ca.pem'),
  }),
}),

```

您自己的传输器继承自 `WebhookTransport` 并实现 `send(request, options)`，其中 `options` 包含尝试的 `signal` 和其 `attempt` 编号。请求携带 `url`、签名的 `headers` 和 `body`，以及其端点、交付和消息的 ID。使用响应的 `statusCode`、`headers` 和其 `body` 的开始进行解析，无论状态如何，仅在没有响应时抛出；在 `signal` 中断后，在 `delivery.timeout` 后停止。`NonRetryableWebhookError` 和 `WebhookDestinationBlockedError` 在不重试的情况下失败交付；任何其他错误都会重试。将类作为 `transport` 传递给 `forRoot()` 或 `forRootAsync()` 的顶层，Nest 会实例化它（从其注入的模块中获取 `imports`），或者传递一个实例。它用自身执行的操作替换 SSRF 守卫：通过强制执行此类（例如 Smokescreen）的出站代理发送是编写一个守卫的原因；包装 `HttpWebhookTransport` 会保留守卫。

对于测试，`InMemoryWebhookTransport` 记录而不是发送，不进行网络或地址检查（参见 [Testing](/http/webhooks#测试)）：

- `sent`: 每个请求，按最旧的优先，作为 `SentWebhook`。`clear()` 清空它。
- `respondWith(answer)`: 从现在开始端点如何回答，直到那时都是 200。一个状态（`503`），一个响应（`statusCode`，`headers`，例如 `retry-after`、`body`），或者一个返回两者之一并抛出以模拟无响应的请求和尝试次数的函数。
- `filter(query)` 和 `single(query)`: 匹配 `type`、`url`（一个字符串或一个 `RegExp`）、`endpointId` 和 `messageId` 的请求，或 `SentWebhook` 的函数。除非恰好有一个匹配，否则 `single()` 抛出，列出已发送的内容。

一个 `SentWebhook` 具有其轮次内的 `request`，其 `attempt` 编号，`sentAt`，请求的 `url`、`type`、`messageId`、`endpointId`、`deliveryId`、`headers` 和 `body`，`data`（已解析的体中的 `data`），以及 `isSignedWith(secret)`，它将一个 `v1` 签名与端点的密钥进行检查。

##### 事件

`WebhooksEvents.events$` 发射每个事件，每个事件也会在诊断通道 `nestjs:webhooks:<type>` 上发布。

| 类型 | 有效载荷类型 | 除 `type` 外的字段 |
| --- | --- | --- |
| `delivered` | `WebhooksDeliveredEvent` | `delivery`、`statusCode`、`attempt`、`durationMs` |
| `retry-scheduled` | `WebhooksRetryScheduledEvent` | `delivery`、`error`、`statusCode`（无响应的 `null`）、`attempt`、`delayMs` |
| `delivery-failed` | `WebhooksDeliveryFailedEvent` | `delivery`、`error`、`statusCode`、`attempt`、`reason` |
| `endpoint-disabled` | `WebhooksEndpointDisabledEvent` | `endpointId`、`tenant`、`reason`（`'failing'` 或 `'gone'`） |
| `destination-blocked` | `WebhooksDestinationBlockedEvent` | `endpointId`、`tenant`、`reason`、`address` |
| `verification-failed` | `WebhooksVerificationFailedEvent` | `receiver`、`reason` |

失败交付的 `reason` 是 `exhausted`，`rejected`（410 Gone，被阻止的目的地，`NonRetryableWebhookError` 或 `retryIf`），`endpoint-disabled` 或 `endpoint-deleted`。验证失败的 `reason` 是 `missing-header`、`malformed-header`（webhook ID 超过 255 个字符），`invalid-signature`、`timestamp-out-of-tolerance` 或 `invalid-payload`。`WebhooksEvent` 是所有有效载荷类型的联合。

##### 错误

除 `NonRetryableWebhookError` 之外的所有错误都继承自 `WebhooksError`。带有 `status` 的错误是为合作伙伴 API 的异常过滤器准备的，如 [Let partners subscribe](/http/webhooks#let-partners-subscribe) 所示。

| 错误 | 状态 | 抛出条件 |
| --- | --- | --- |
| `InvalidWebhookEndpointError` | 400 | 端点 URL、事件类型或密钥被拒绝。`field` 指明了是哪一个。 |
| `WebhookEndpointNotFoundError` | 404 | 端点不存在，或属于另一个租户 |
| `WebhookDeliveryNotFoundError` | 404 | 交付不存在，或属于另一个租户 |
| `WebhookVerificationError` | 401，或 `invalid-payload` 的 400 | `WebhookVerifier.verify()` 拒绝了请求。它具有 `receiver` 和 `reason`。 |
| `WebhookDestinationBlockedError` | 无 | 端点的 URL 是或解析到被阻止的地址。交付在不重试的情况下失败。 |
| `WebhookResponseError` | 无 | 端点响应不在 2xx 范围内。它具有 `statusCode`，以及来自 `retryAfterMs` 头的 `Retry-After`。 |
| `WebhookDeliveryTimeoutError` | 无 | 在 `delivery.timeout` 内无响应 |
| `NonRetryableWebhookError` | 无 | 自定义传输器抛出此错误，以不重试地失败交付 |
| `WebhookSchemaError` | 无 | 存储的 ⟦Schema⟧ 落后于包的 ⟦Migration⟧，同时 `migrate` 关闭，或应用 ⟦Migration⟧ 失败（`cause`）：直到修复，启动和每次调用都会失败。它具有 `schema`，其 `version` 和 `requiredVersion`。来自 `@nestjs/webhooks/postgres` 和 `@nestjs/webhooks/mysql`。 |

`@VerifyWebhook()` 以 401（对于非 JSON 的签名主体为 400）和通用消息来回答被拒绝的请求，原因发送到 `verification-failed` 事件。如果请求体未保持原始状态，则如果它不是 JSON 或表单则返回 415，否则返回 500 并记录缺失的 `rawBody: true`。