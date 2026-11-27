<!-- 此文件从 content/reliability/outbox.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:48:36.382Z -->
<!-- 源文件: content/reliability/outbox.md -->
<!-- 源哈希: fd3e8893da3b9c2c2ca2c60666a219b3 -->

### Outbox

`@nestjs/outbox` 可可靠地发布事件和消息：每个消息都会与您的数据在同一个数据库事务中保存，然后会重试地转发。

当客户在在线商店为猫粮和用品下订单时，订单 API 会保存订单并使用 `OrderPlaced` 事件进行宣布。有三件事对该事件做出反应：发送确认邮件、预留库存以及一个独立的分析服务记录销售情况。

保存订单和发布事件是写入两个不同系统的两次写入，没有事务跨越两者：

- **先保存，后发布。** 如果在这两者之间进程崩溃或消息代理宕机，订单存在但 `OrderPlaced` 丢失。客户没有收到邮件，库存未被预留，分析数据被低估。
- **先发布，后保存。** 如果插入失败，客户会收到感谢订单的确认信息，但该订单实际上不存在。
- **错误时重试发布。** 成功发送后的超时看起来像失败，因此重试会再次发送，导致客户收到两封邮件。

这就是双写问题。`ClientProxy.emit()`、`EventEmitter2` 和 CQRS `EventBus` 都从内存发布，因此都存在这个问题。

事务性 Outbox 通过将事件转换为一行记录来消除它。`Outbox.add()` 将消息插入到**与订单在同一数据库事务中的** outbox 表中，因此两者要么都提交，要么都不提交。然后一个中继器发布已提交的消息。它会带退避策略重试失败，并将永远不成功的消息移动到死信表。重试意味着消费者可能会看到同一条消息两次，因此每个消费者会维护一个已处理的消息 ID 的**收件箱**，并跳过重复项。

在本教程中，您将在商店的订单 API 中添加 outbox，使用 PostgreSQL 和 Drizzle：

- `POST /orders` 在一个事务中保存订单及其消息。
- 两个进程内处理器发送确认邮件并预留库存。
- 一个独立的分析微服务（拥有自己的数据库）通过 TCP 接收订单事件，每个订单按顺序接收。
- 失败会重试，一个小的管理 API 列出、重新排队和清除死信。
- 多个 API 实例安全地共享工作。

#### 先决条件

- PostgreSQL，使用 [Drizzle ORM](https://orm.drizzle.team) 在 `pg` 驱动上，通过 [`@nestjs/drizzle`](https://docs.nestjs.com/data/drizzle) 注册。outbox 的消息会与您的行一起提交，因此它们存在于存储订单的数据库中，在一个比任何应用程序实例都更持久的数据库服务器上。使用 TypeORM、Prisma 还是 MySQL？请遵循教程了解应用程序做了什么：[Keep messages in your database](/reliability/outbox#keep-messages-in-your-database) 展示了使用每种技术的商店。
- `@nestjs/microservices`，用于 [Publish to the analytics microservice](/reliability/outbox#publish-to-the-analytics-microservice) 中到分析服务的 TCP 连接。

安装包：

```bash
$ npm i --save @nestjs/outbox

```

示例应用程序（在线商店的订单 API）将其产品和订单保存在自己的两个表中，后续章节会读取和写入这些表。它们是示例的数据，而不是 outbox 所需的：outbox 的表属于其商店，该商店创建了它们，如 [Keep messages in your database](/reliability/outbox#keep-messages-in-your-database) 所示。

`products` 是目录，为订单预留库存是从其 `in_stock` 移动到其 `reserved`：

| 列 | 类型 | 备注 |
| --- | --- | --- |
| `id` | `text` | 主键，例如 `salmon-kibble-2kg` |
| `name` | `text` | 显示名称，例如 `Salmon kibble, 2 kg` |
| `price` | `integer` | 以分为单位 |
| `in_stock` | `integer` | 可供订购的单位 |
| `reserved` | `integer` | 为已下订单保留的单位。默认为 `0` |

`orders` 存储 `POST /orders` 保存的订单：

| 列 | 类型 | 备注 |
| --- | --- | --- |
| `id` | `text` | 主键 |
| `user_id` | `text` | 下订单的客户 |
| `items` | `jsonb` | 订单行，作为 JSON 数组：每行的 `productId`、`quantity` 和单位 `price`（以分计） |
| `total` | `integer` | 以分计 |
| `status` | `text` | `placed` 或 `cancelled` |

任一表中的列均不允许为空。

目录中有两个产品：`salmon-kibble-2kg`，价格为 2499 分，库存 10；`clumping-litter-10l`，价格为 1599 分，库存 1。

#### 将消息保留在您的数据库中

outbox 不需要创建任何东西：没有表、实体或 Prisma 模型。注册其商店，商店会创建自己的模式 `nest_outbox` 并进行迁移：在开发和测试的启动时，以及在生产环境中通过 `npx @nestjs/outbox migrate` 或在您自己的迁移中使用 `migrationSql()`。

outbox 将其消息、死信和消费者的收件箱保留在与您自己的表相同的数据库中，因为它们必须与您的行一起提交。在您为它们注册商店之前，outbox 将它们保留在内存中：首次运行时没问题，但重启会丢失所有尚未发布的消息，两个实例不会共享它们，并且它们不会加入您的事务。

> 警告 **警告** 如果使用 `NODE_ENV=production` 且未注册商店，除非设置了 `allowInMemoryStorage: true`，否则启动将失败。

在 PostgreSQL 上，从 `@nestjs/outbox/postgres` 注册包的商店 `PostgresOutboxStore`。它通过您的应用程序已有的数据库客户端运行 SQL，因此可以加入您的事务，并且它将自己的表保存在自己的模式中。它是一个普通的提供者，在根模块中注册一次，与 `OutboxModule` 并列：两者都是应用程序范围的，任何模块中的每个 `outbox.add()` 都会经过它。根模块使用一个工厂创建它，该工厂注入 Drizzle 数据库和 `OutboxStorage` 注册表，商店会向该注册表注册自身：

```typescript title="app.module.ts"
{
  // Messages and inbox records in your database, in a schema of their own (nest_outbox)
  provide: PostgresOutboxStore,
  inject: [getDrizzleToken(), OutboxStorage],
  useFactory: (db: Database, outboxStorage: OutboxStorage) =>
    new PostgresOutboxStore({ executor: fromDrizzle(db) }, outboxStorage),
},

```

`fromDrizzle(db)` 是商店的**执行器**：它通过您的 Drizzle 数据库运行商店的语句，无论它使用哪个驱动，例如 `pg` 或 PGlite。`fromPg(pool)`、`fromTypeOrm(dataSource)`、`fromPrisma(prisma)` 和 `fromKysely(db)` 对 node-postgres pool、TypeORM、Prisma 和 Kysely 执行相同操作。在启动时，模块会记录 `OutboxStorage: PostgresOutboxStore`。

**模式。** 商店将其表保存在自己的模式中，`nest_outbox`（`schema` 选项指定了另一个）。在没有模式的 MySQL 上，它们是连接数据库的表，模式名称作为前缀：`nest_outbox_messages` 等。

| 表 | 存储内容 |
| --- | --- |
| `nest_outbox.messages` | 从 `add()` 的每条消息，直到发布或进入死信，包括其尝试次数和租约 |
| `nest_outbox.dead_letters` | 失败的消息，包括每次尝试的原因和错误 |
| `nest_outbox.inbox` | 每个消费者已处理的消息 ID |
| `nest_outbox.migrations` | 应用的商店模式版本 |

它们属于商店：您的迁移不会创建它们，您的 ORM 的模式不会声明它们，并且您自己的表不会与它们冲突。drizzle-kit 和 Prisma Migrate 在未被告知的情况下对 `public` 模式工作，TypeORM 对其实体的表工作，因此它们的工具会忽略 `nest_outbox`。

**迁移。** 该包以版本化迁移的形式提供模式，商店自己应用它们。使用 `migrate` 选项时，在应用程序启动时，在中继器运行之前，它会应用模式尚未拥有的迁移，在一个持有咨询锁的事务中：在同时启动的多个实例中，一个进行迁移，其他实例发现没有剩余工作。`migrate` 默认为 `true`，但使用 `NODE_ENV=production` 时除外。因此，在开发和测试中，商店在首次启动时创建其模式，而您的迁移只创建您自己的表，这里是 `products` 和 `orders`。

在生产环境中，请在应用程序的新版本启动之前应用迁移，就像您应用自己的迁移一样，以确保在启动过程中没有实例更改模式：在滚动部署过程中，这将锁定繁忙的表，而且最小权限的数据库用户也无法做到这一点。该包的命令行从您的部署步骤执行此操作，与 `npx drizzle-kit migrate` 并列。它从 `DATABASE_URL` 或从 `--url` 读取数据库，并且需要安装 `pg`：

```bash
$ npx @nestjs/outbox status
Schema "nest_outbox" is at version 0; this version of @nestjs/outbox needs version 1.
$ npx @nestjs/outbox migrate
Migrated schema "nest_outbox" to version 1 (applied 1).

```

`status` 在模式落后时以 1 退出，这使其成为 CI 的检查项。如果想使用自己的迁移工具应用迁移，请从 `npx @nestjs/outbox sql` 或代码中的 `PostgresOutboxStore.migrationSql()` 获取其 SQL：每个迁移的语句单独占一个段落，并包含记录版本的账本。像 TypeORM 和 Drizzle 的迁移器那样，在一个事务中运行它们。使用 TypeORM 时，这是您自己的迁移，与它为实体生成的迁移并列：

```typescript title="typeorm/migrations/1790801276314-OutboxStore.ts"
import { PostgresOutboxStore } from '@nestjs/outbox/postgres';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class OutboxStore1790801276314 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(PostgresOutboxStore.migrationSql());
  }

  // The store's migrations only ever add tables, columns and indexes: it has no down migrations.
  async down(): Promise<void> {}
}

```

使用 drizzle-kit 创建自定义迁移，并用 SQL 填充它创建的文件，语句之间用一个 `--> statement-breakpoint` 行分隔：Drizzle 的迁移器然后逐个运行它们，这符合 PGlite 的要求。在代码中，`migrationSql()` 配合 `statementBreakpoints: true` 返回相同的结果。

```bash
$ npx drizzle-kit generate --custom --name=outbox
$ npx @nestjs/outbox sql --statement-breakpoints > drizzle/20261103120000_outbox/migration.sql

```

在 MySQL 上，`MySqlOutboxStore.migrationStatements()` 按字符串逐个返回语句，而 TypeORM 迁移按调用逐个运行：

```typescript title="typeorm/mysql-migrations/1790801276314-OutboxStore.ts"
for (const statement of MySqlOutboxStore.migrationStatements()) {
  await queryRunner.query(statement);
}

```

关闭 `migrate` 后，模式落后的存储在启动时因一个 `OutboxSchemaError` 而失败，并且在模式追上之前会以相同的方式失败所有调用，它会在不重启的情况下注意到这一点。迁移只添加表、列和索引，因此在滚动部署期间，应用程序的旧版本仍能在已迁移的模式上运行。没有回滚迁移。

**事务。** `outbox.add()` 接受您的事务，如 [Save the order and its messages in one transaction](/reliability/outbox#save-the-order-and-its-messages-in-one-transaction) 所示，处理器的 `processInTransaction()` 也是如此：使用 Drizzle，`tx` 传递其回调。存储在该事务上运行其语句，因此它们与您的写入一起提交或回滚。它拒绝数据库本身，因为其语句会自行提交，并返回一个 `OutboxTransactionRequiredError` 说明应传递什么。对于其他执行器，在 `BEGIN` 之后传递一个 node-postgres 客户端（而不是连接池）、TypeORM 的 `EntityManager`（来自 `dataSource.transaction()`）、Prisma 的交互式事务客户端或一个 Kysely 事务。

**隔离性。** 存储自身的事务（声明、死信移动、重排队）依赖于 READ COMMITTED，PostgreSQL 的默认隔离级别：在启动时，存储会检查数据库的 `default_transaction_isolation`，如果更严格则失败。您的事务可以在任何级别运行。`add()` 首先对您的事务中的每个键获取一个锁，因此具有相同键的消息的事务轮流执行，并且某个键的消息按其事务提交的顺序编号。在 REPEATABLE READ 或 SERIALIZABLE 下，两个竞速到 `processInTransaction()` 的同一消息的两次投递可能会因序列化错误而失败第二次，而不是像重复项那样跳过：其处理器失败，而中继的重试会找到记录。

**使用 TypeORM。** `TypeOrmModule` 取代根模块中的 `DrizzleModule`，存储在它提供的 `DataSource` 上运行，通过 `fromTypeOrm()`：

```typescript title="typeorm/app.module.ts"
{
  // Messages and inbox records in your database, in a schema of their own (nest_outbox)
  provide: PostgresOutboxStore,
  inject: [DataSource, OutboxStorage],
  useFactory: (dataSource: DataSource, outboxStorage: OutboxStorage) =>
    new PostgresOutboxStore({ executor: fromTypeOrm(dataSource) }, outboxStorage),
},

```

教程将 Drizzle 的 `tx` 传递给 `outbox.add()`，传递 `EntityManager`（它传递其回调），并使用它来类型化出库。存储拒绝 `dataSource.manager`，因为其写入会自行提交。这是使用 TypeORM 的订单服务：

```typescript title="typeorm/orders.service.ts"
@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly outbox: Outbox<EntityManager>,
  ) {}

  async placeOrder({ userId, items }: PlaceOrderDto): Promise<Order> {
    if (!items?.length) {
      throw new BadRequestException('An order needs at least one item');
    }

    const order = await this.dataSource.transaction(async (manager) => {
      // ... price the items through manager (an unknown product throws) and build the order
      await manager.insert(OrderEntity, order);

      // The transaction's EntityManager: the message commits or rolls back with the order.
      await this.outbox.add(manager, { topic: 'order.placed', payload: order });
      return order;
    });

    this.outbox.notify(); // publish now instead of at the next poll
    return order;
  }
}

```

**使用 Prisma。** 将您的 `PrismaService` 传递给工厂中的 `fromPrisma()`，并将事务客户端传递给 `outbox.add()`（它传递其回调）。只有该交互式形式有一个可传递的：数组形式，`prisma.$transaction([query1, query2])` 不能包含一个 `outbox.add()`。存储拒绝客户端本身，因为其语句会自行提交。其自身事务最多等待 10 秒以建立连接，运行时间最长可达一分钟，比 Prisma 的默认值长：`fromPrisma()` 的第二个参数可以更改这一点，使用 `maxWait` 和 `timeout`。

**使用 MySQL。** 对于 MySQL 8.4 LTS 和 9.x，`@nestjs/outbox/mysql` 具有 `MySqlOutboxStore`。从那里导入存储及其执行器：提供者相同，选项和执行器的名称也相同。这是使用 Drizzle 在 `mysql2` 驱动上的 MySQL 订单 API：

```typescript title="mysql/app.module.ts"
import { Module } from '@nestjs/common';
import { DrizzleModule, getDrizzleToken } from '@nestjs/drizzle';
import { OutboxModule, OutboxStorage } from '@nestjs/outbox';
import { fromDrizzle, MySqlOutboxStore } from '@nestjs/outbox/mysql';
import { drizzle } from 'drizzle-orm/mysql2';
import { NotificationsModule } from '../notifications/notifications.module.js';
import type { Database } from './drizzle.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      // A mysql2 pool on DATABASE_URL (mysql://...), whose path names the database
      useFactory: () => ({ drizzle, connection: { uri: process.env.DATABASE_URL! } }),
    }),
    OutboxModule.forRoot({ relay: { pollInterval: '1s' } }),
    NotificationsModule,
  ],
  providers: [
    {
      // Messages and inbox records in your database, in tables of their own (nest_outbox_*)
      provide: MySqlOutboxStore,
      inject: [getDrizzleToken(), OutboxStorage],
      useFactory: (db: Database, outboxStorage: OutboxStorage) =>
        new MySqlOutboxStore({ executor: fromDrizzle(db) }, outboxStorage),
    },
    OrdersService,
  ],
})
export class AppModule {}

```

`fromMysql2(pool)`，对于类型为 `mysql` 的数据源，使用 `fromPrisma(prisma)` 和 `@prisma/adapter-mariadb` 驱动适配器（提供 MySQL 的那个），并使用 `fromKysely(db)` 服务其他客户端。与 PostgreSQL 的不同之处在于：

- **表，而非模式。** MySQL 数据库没有模式，因此存储将其表保留在连接的数据库中，即 URL 路径命名的数据库，并且 `schema` 选项是它们的前缀：`nest_outbox_messages`、`nest_outbox_dead_letters` 和 `nest_outbox_inbox`，位于 `nest_outbox_migrations` 和 `nest_outbox_locks` 旁边。它接受小写字母、数字和下划线，最多 40 个字符。没有数据库的连接会使启动失败。
- **有界键。** ID、主题、键和消费者名称是最多 255 个字符的索引列，按字节比较：`order-1` 和 `Order-1` 是两个键。更长的键会因 `RangeError` 而被拒绝，在任何语句之前：由 `add()`，并在接收器运行处理器之前由收件箱拒绝。
- **您的隔离级别。** 您的事务可以在 REPEATABLE READ（MySQL 的默认值）或 READ COMMITTED 下运行。一个竞速另一个到 `processInTransaction()` 的投递会等待它，然后作为重复项跳过处理器，无论在哪个级别。
- **死锁会到达您的事务。** `add()` 在您的事务中按键锁定一行，这是键共享的 16,384 个锁中的一个，存储在启动时创建：两个共享同一行的两个键的生产者轮流执行，就像一个键的生产者一样，这很少会减慢不相关的生产者。当 MySQL 在您的事务中打破死锁时（错误 1213），它会回滚整个事务，存储无法再次运行您的工作：该错误作为客户端错误到达您的代码，因此请重新运行事务。在这些行到位的情况下，仍可能有两件事导致死锁：一个消息的三个投递竞速到 `processInTransaction()` 而第一个回滚，以及您以不同顺序获取相同锁的事务。存储自身的事务会自行重试死锁。
- **非事务性的迁移。** MySQL 会单独提交每个 DDL 语句，因此 `migrate` 和 `npx @nestjs/outbox migrate --url mysql://...` 在锁下逐个应用语句，并且中断的运行可以从停止的地方恢复。您自己的工具也必须按调用发送一个语句，就像上面**迁移**中的 TypeORM 迁移那样，而 drizzle-kit 自定义迁移需要 `npx @nestjs/outbox sql --dialect mysql --statement-breakpoints`，因为其 MySQL 迁移器按断点发送一个语句。

#### 注册出库

在根 **模块** 中注册 `OutboxModule`，紧邻注册 Drizzle 数据库的 `DrizzleModule`，并与来自 [Keep messages in your database](/reliability/outbox#keep-messages-in-your-database) 的存储一起注册。它导入的特性 **模块** 在接下来的步骤中构建：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { DrizzleModule, getDrizzleToken } from '@nestjs/drizzle';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ClientProxyTransport, OutboxModule, OutboxStorage } from '@nestjs/outbox';
import { fromDrizzle, PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Database } from './database/drizzle.js';
import * as schema from './database/schema.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { OutboxAdminModule } from './outbox-admin/outbox-admin.module.js';

export const ANALYTICS_SERVICE = 'ANALYTICS_SERVICE';

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      // A pg pool on DATABASE_URL, closed in onApplicationShutdown(), after the relay drained.
      useFactory: () => ({ drizzle, connection: process.env.DATABASE_URL!, schema }),
    }),
    OutboxModule.forRootAsync({
      imports: [
        ClientsModule.registerAsync([
          {
            name: ANALYTICS_SERVICE,
            useFactory: () => ({
              transport: Transport.TCP,
              options: {
                host: process.env.ANALYTICS_HOST ?? '127.0.0.1',
                port: Number(process.env.ANALYTICS_PORT ?? 4001),
              },
            }),
          },
        ]),
      ],
      transports: { analytics: ClientProxyTransport(ANALYTICS_SERVICE) },
      useFactory: () => ({
        // Each message goes to exactly one transport; `local` runs @OnOutboxMessage() handlers.
        route: (message) => (message.topic.startsWith('analytics.') ? 'analytics' : 'local'),
        relay: {
          enabled: process.env.OUTBOX_RELAY !== 'off',
          pollInterval: '1s',
          lease: '30s',
          publishTimeout: '10s',
        },
        retry: {
          attempts: 10,
          backoff: { delay: '1s', maxDelay: '1m' },
        },
      }),
    }),
    OrdersModule,
    NotificationsModule,
    InventoryModule,
    OutboxAdminModule,
  ],
  providers: [
    {
      // Messages and inbox records in your database, in a schema of their own (nest_outbox)
      provide: PostgresOutboxStore,
      inject: [getDrizzleToken(), OutboxStorage],
      useFactory: (db: Database, outboxStorage: OutboxStorage) =>
        new PostgresOutboxStore({ executor: fromDrizzle(db) }, outboxStorage),
    },
  ],
})
export class AppModule {}

```

`ClientProxyTransport(ANALYTICS_SERVICE)` 是 Nest 在 `OutboxModule` 内部实例化的一个 **类提供者**，因此 `transports` 位于 **类提供者** 所在的 `useFactory` 旁边。**工厂提供者** 在应用程序启动时运行，并返回其余的选项：

- `transports` 和 `route`：每个消息发布的位置。`local` **传输器** 在此进程中构建并运行 `@OnOutboxMessage()` **处理器**（[Handle order.placed in-process](/reliability/outbox#handle-orderplaced-in-process)）。`ClientProxyTransport(ANALYTICS_SERVICE)` 通过 `ClientsModule` 在该名称下注册的 TCP **客户端代理** 进行发布，这就是该 **模块** 位于 `imports`（[Publish to the analytics microservice](/reliability/outbox#publish-to-the-analytics-microservice)）的原因。`route` 为每个消息选择恰好一个 **传输器**。
- `relay`：后台 **生产者**。它每隔 `pollInterval` 进行轮询，为 `lease` 预定其声明的资源，并在 `publishTimeout` 后放弃单次发布。设置 `OUTBOX_RELAY=off` 会在仅 API 的实例中将其关闭（[Run several instances](/reliability/outbox#run-several-instances)）。
- `retry`：10 次尝试，具有从 1 秒开始并限制在 1 分钟的指数退避。

> info **提示** 本教程直接读取 `process.env` 以保持简短。在应用程序中，通过 [`@nestjs/config`](/application/configuration) 使用 **验证** **模式** 加载 **环境变量**，这样缺失的 `DATABASE_URL` 会在启动时停止应用程序，并从 **工厂提供者** 中读取值 `ConfigService`。

持续时间以毫秒或诸如 `'30s'` 和 `'1m'` 的字符串表示。`OutboxModule` 是全局的：`Outbox`、`OutboxStorage`、`OutboxRelay`、`OutboxEvents`、`OutboxDeadLetters` 和 `OutboxInbox` 可以在应用程序的任何地方注入。

#### 在一个事务中保存订单及其消息

这是订单 **实体** **模式**：

```typescript title="orders/order.ts"
export interface OrderItem {
  productId: string;
  quantity: number;
  /** Unit price in cents, copied from the catalog when the order is placed. */
  price: number;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  /** In cents. */
  total: number;
  status: 'placed' | 'cancelled';
}

export class PlaceOrderDto {
  userId: string;
  items: { productId: string; quantity: number }[];
}

```

`OrdersService.placeOrder()` 打开一个 Drizzle 事务，对商品进行定价，插入订单并添加消息，所有操作都通过同一个 `tx` 完成：

```typescript title="orders/orders.service.ts"
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { Outbox } from '@nestjs/outbox';
import type { Database, Transaction } from '../database/drizzle.js';
import { orders, products } from '../database/schema.js';
import type { Order, PlaceOrderDto } from './order.js';

@Injectable()
export class OrdersService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly outbox: Outbox<Transaction>,
  ) {}

  async placeOrder({ userId, items }: PlaceOrderDto): Promise<Order> {
    if (!items?.length) {
      throw new BadRequestException('An order needs at least one item');
    }

    const order = await this.db.transaction(async (tx) => {
      // ... price the items through tx (an unknown product throws) and build the order
      await tx.insert(orders).values(order);

      // Drizzle's tx: the messages commit or roll back with the order.
      await this.outbox.add(tx, [
        { topic: 'order.placed', payload: order },
        { topic: 'analytics.order.placed', key: order.id, payload: order },
      ]);
      return order;
    });

    this.outbox.notify(); // publish now instead of at the next poll
    return order;
  }
}

```

`outbox.add()` 首先获取事务句柄，然后是消息或消息数组。在使用 Drizzle 时，句柄是 `tx`，它将回调传递给 `db.transaction()`，该回调的类型由 **服务** 提供给出库：`Outbox<Transaction>`。存储通过该 `tx` 插入它们，因此消息与订单一起提交或一起回滚。存储是异步的，因此像任何其他 **查询** 一样 `await` `add()`。包中所有连接到事务的 API 都将其作为第一个参数接收句柄。

一些细节：

- **每个目标一个消息。** 每个消息只发送到一个 **传输器**。相同的事件会发送到进程内 **处理器** 和分析 **服务**，因此 **服务** 在同一个事务中添加两个消息：`order.placed` 和 `analytics.order.placed`。
- **载荷是快照。** `add()` 立即对载荷进行 **序列化**，因此对 `order` 对象的后续更改不会被发布。
- **ID。** 每个消息都会获得一个时间有序的 UUIDv7 `id`。**消费者** 通过它进行去重。
- **`notify()`。** 事务内部不发布任何内容。提交后，`notify()` 唤醒中继。如果没有它，消息将在下一次轮询时发出，最晚在 `pollInterval` 后发出。

如果事务内部有任何内容抛出，订单及其消息将一起回滚，中继永远不会看到它们。这包括未知产品、插入失败以及在 `add()` 之后发生的任何失败。[Testing](/reliability/outbox#测试) 部分通过在消息写入后使事务失败来证明这一点。

传递事务，绝不传递数据库：`outbox.add(this.db, message)` 会自行以自动提交模式写入消息，这正是你正在移除的双写。存储会用 `OutboxTransactionRequiredError` 拒绝它，当它完全没有句柄时，`add()` 本身也会拒绝。

通过 HTTP 暴露 **服务**：

```typescript title="orders/orders.controller.ts"
import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { PlaceOrderDto } from './order.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  place(@Body() dto: PlaceOrderDto) {
    return this.ordersService.placeOrder(dto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string) {
    return this.ordersService.cancelOrder(id);
  }
}

```

#### 处理 order.placed 进程内

确认电子邮件是 `order.placed` 的一个 **处理器**。邮件器是您电子邮件提供商 SDK 的替代品：

```typescript title="notifications/mailer.service.ts"
import { Injectable, Logger } from '@nestjs/common';
import type { Order } from '../orders/order.js';

/** Stand-in for your email provider's SDK. */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  async sendOrderConfirmation(order: Order): Promise<void> {
    this.logger.log(`Order confirmation for ${order.id} sent to ${order.userId}`);
  }
}

```

```typescript title="notifications/order-emails.handler.ts"
import { Injectable } from '@nestjs/common';
import { OnOutboxMessage } from '@nestjs/outbox';
import type { Order } from '../orders/order.js';
import { MailerService } from './mailer.service.js';

@Injectable()
export class OrderEmailsHandler {
  constructor(private readonly mailerService: MailerService) {}

  // The consumer's inbox skips messages it has already handled.
  @OnOutboxMessage('order.placed', { consumer: 'order-confirmation-email' })
  async sendConfirmation(order: Order) {
    await this.mailerService.sendOrderConfirmation(order);
  }
}

```

`@OnOutboxMessage()` **处理器** 在 **提供者** 上被发现，因此将 `MailerService` 和 `OrderEmailsHandler` 注册为 `NotificationsModule` 的 **提供者**。它们必须是单例：在 **请求作用域** **提供者** 上运行的 **处理器** 会在启动时失败。**处理器** 接收载荷（这里是订单）以及一个 **执行上下文** 作为第二个参数。上下文的 `message` 包含消息的 `id`、`topic`、`key` 和 `headers`。

每个 **处理器** 都有一个收件箱，名称由 `consumer` 定义。在调用 **处理器** 之前，本地 **传输器** 会检查 `order-confirmation-email` **消费者** 是否已经处理过此消息 ID。**处理器** 成功后，它会记录该 ID。需要 `consumer`，并且它必须保持稳定：新名称会导致所有过去的消息看起来都是新的。

收件箱存在一个间隙：如果进程在发送电子邮件后但在记录 ID 之前死亡，电子邮件将在重新投递时再次发送。这对电子邮件是可接受的。但对于存储预订来说不是，因为存储预订与收件箱在同一数据库中。预订 **处理器** 通过在其自身的事务中记录 ID 来弥补这个间隙：

```typescript title="inventory/stock-reservation.handler.ts"
import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { NonRetryableMessageError, OnOutboxMessage, type OutboxHandlerContext } from '@nestjs/outbox';
import { and, eq, gte, sql } from 'drizzle-orm';
import type { Database, Transaction } from '../database/drizzle.js';
import { products } from '../database/schema.js';
import type { Order } from '../orders/order.js';

@Injectable()
export class StockReservationHandler {
  private readonly logger = new Logger(StockReservationHandler.name);

  constructor(@InjectDrizzle() private readonly db: Database) {}

  @OnOutboxMessage('order.placed', { consumer: 'stock-reservation' })
  async reserve(order: Order, ctx: OutboxHandlerContext<Transaction>) {
    await this.db.transaction(async (tx) => {
      // Records the message id through tx, then runs the callback only if this consumer
      // hasn't processed it yet. Await it: the record commits with the reservation.
      await ctx.processInTransaction(tx, async () => {
        for (const { productId, quantity } of order.items) {
          const reserved = await tx
            .update(products)
            .set({ inStock: sql`${products.inStock} - ${quantity}`, reserved: sql`${products.reserved} + ${quantity}` })
            .where(and(eq(products.id, productId), gte(products.inStock, quantity)))
            .returning({ id: products.id });
          if (reserved.length === 0) {
            // Retrying won't create stock: dead-letter it now and let a human decide.
            throw new NonRetryableMessageError(`Not enough stock for "${productId}" (order ${order.id})`);
          }
        }
        this.logger.log(`Reserved stock for order ${order.id}`);
      });
    });
  }
}

```

`ctx.processInTransaction(tx, work)` 通过 **处理器** 的事务插入收件箱记录，然后仅当此 **消费者** 尚未处理该消息时才调用 `work`。否则它跳过 `work` 并返回一个其 `duplicate` 标志为 `true` 的结果。记录和库存更新一起提交，因此预订恰好发生一次：重新投递找到记录并跳过 **处理器**，如果 `work` 抛出，两者都回滚，重试从干净的状态开始。在事务回调内部 `await` 它，这样记录在 `COMMIT` 之前写入；重复检查在调用内部发生，因此缺失的 `await` 无法使其通过。在 `InventoryModule` 中注册 **处理器**。

| **处理器** | 行为 | 保证 |
| --- | --- | --- |
| 默认 | 如果其收件箱中有该 ID 则跳过 **处理器**，在 **处理器** 成功后记录 ID | 一次，除非进程在 **处理器** 完成和记录之间死亡，或另一个实例同时投递相同消息 |
| 调用 `ctx.processInTransaction(tx, work)` | 在 **处理器** 自身的事务中记录 ID，包含其写入操作 | 对写入同一数据库的写入操作恰好一次 |
| `inbox: false` | 每次投递都运行 **处理器** | 至少一次 |

对于每个 `order.placed` 消息，两个 **处理器** 并发运行。如果其中一个失败，发布失败，整个消息将被重试。在重试时，已经成功的每个 **处理器** 都会被其收件箱跳过。

中继向 **处理器** 提供 `publishTimeout`（此处为 10 秒）。如果它们花费更长时间，则尝试计为失败，上下文的 `signal` 将中止：将 `ctx.signal` 传递给 **处理器** 发出的调用，例如 `fetch()` 的 `signal` 选项，以便它们也停止。忽略此选项的 **处理器** 将继续运行，如果重试到达同一进程，收件箱会等待它而不是第二次运行 **处理器**。

#### 发布到分析微服务

API 端已连接。在 `AppModule` 中，`ClientProxyTransport(ANALYTICS_SERVICE)` 通过 `ClientProxy` 发布，该 `ClientsModule` 在该名称下注册，并且 `route` 将每个 `analytics.*` 主题发送给它。传输调用 `client.emit(topic, envelope)`，与没有出库时相同的调用。信封包含消息的 `id`、`topic`、`key`、`headers`、`createdAt` 和 `payload`。

取消订单会为同一订单生成第二个分析事件。向 `OrdersService` 添加一个 `cancelOrder()` 方法，并从 `@nestjs/common` 导入 `NotFoundException` 和 `ConflictException`：

```typescript title="orders/orders.service.ts"
async cancelOrder(id: string): Promise<Order> {
  const order = await this.db.transaction(async (tx) => {
    const [row] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
    if (!row) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    if (row.status !== 'placed') {
      throw new ConflictException(`Order ${id} is ${row.status}`);
    }

    await tx.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, id));
    const order: Order = { ...row, status: 'cancelled' };
    await this.outbox.add(tx, { topic: 'analytics.order.cancelled', key: order.id, payload: order });
    return order;
  });

  this.outbox.notify();
  return order;
}

```

订单控制器已将其路由到 `POST /orders/:id/cancel`。`SELECT ... FOR UPDATE` 锁定订单的行，因此对同一订单的两次取消是轮流进行的，第二次取消会看到 `cancelled` 并回答 `409`。两个分析消息都使用订单 ID 作为它们的 `key`。具有相同键的消息一次发布，顺序是其事务提交的顺序。在 `analytics.order.placed` 正在重试时，`analytics.order.cancelled` 在其后面等待，因此分析不会在取消订单之前看到取消事件。具有其他键的消息继续流动。但是，一个键只等待重试持续的时间：一旦消息被死信化（参见下一节），其后面的消息就会发出。

用于进程内处理者的 `order.placed` 消息没有键，这是故意的。键由携带它的每条消息共享，无论主题或传输如何。如果电子邮件消息也使用订单 ID，邮件中断将阻止该订单的分析事件。

分析服务是一个独立的 Nest 应用程序，像任何服务一样，它拥有自己的数据：一个 PostgreSQL 数据库，拥有自己的 模式 和 迁移。它从不读取订单 API 的表。它在其自己的表中记录每个订单事件，再次是示例中的数据：

`order_events` 每个订单事件有一行，收入是其 `amount` 列的总和：

| 列 | 类型 | 备注 |
| --- | --- | --- |
| `seq` | `bigint`，生成身份 | 主键，按到达顺序 |
| `order_id` | `text` | 已索引 |
| `event` | `text` | `placed` 或 `cancelled` |
| `amount` | `integer` | 收入的变更，以分计算：订单放置时的总额减去取消时的总额 |
| `recorded_at` | `timestamptz` | 默认为 `now()` |

作为一个独立的应用程序，它有自己的根 模块，`AppModule`，它像订单 API 那样只注册 `OutboxModule` 和存储一次。该服务只消费，因此关闭了中继，存储在服务自己的数据库上。`OutboxInbox` 将服务的收件箱保留在那里，紧邻 `order_events`，因此事件和其已处理的记录一起提交。消息的存储表保持为空，并且中继关闭，没有东西会轮询它们：

```typescript title="analytics-service/app.module.ts"
import { Module } from '@nestjs/common';
import { DrizzleModule, getDrizzleToken } from '@nestjs/drizzle';
import { OutboxModule, OutboxStorage } from '@nestjs/outbox';
import { fromDrizzle, PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import { AnalyticsController } from './analytics.controller.js';
import type { Database } from './database/drizzle.js';
import * as schema from './database/schema.js';
import { OrderStatsService } from './order-stats.service.js';

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      // This service's own database, not the order API's.
      useFactory: () => ({ drizzle, connection: process.env.DATABASE_URL!, schema }),
    }),
    // Consumer only: no relay runs.
    OutboxModule.forRoot({ relay: { enabled: false } }),
  ],
  controllers: [AnalyticsController],
  providers: [
    {
      // This service's inbox, in its own database (the store's tables for messages stay empty)
      provide: PostgresOutboxStore,
      inject: [getDrizzleToken(), OutboxStorage],
      useFactory: (db: Database, outboxStorage: OutboxStorage) =>
        new PostgresOutboxStore({ executor: fromDrizzle(db) }, outboxStorage),
    },
    OrderStatsService,
  ],
})
export class AppModule {}

```

`OrderStatsService` 记录一个事件并返回迄今为止的收入。它打开一个事务并调用 `inbox.processInTransaction(tx, 'analytics', messageId, work)`：收件箱记录和 `order_events` 行一起提交，因此即使服务在中间崩溃，重投递的事件也不会改变任何内容：

```typescript title="analytics-service/order-stats.service.ts"
import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { OutboxInbox } from '@nestjs/outbox';
import type { Database, Transaction } from './database/drizzle.js';
import { orderEvents } from './database/schema.js';

/** The fields of the order API's `Order` that this service reads. */
export interface OrderSnapshot {
  id: string;
  total: number;
}

export type OrderEvent = 'placed' | 'cancelled';

@Injectable()
export class OrderStatsService {
  private readonly logger = new Logger(OrderStatsService.name);

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly outboxInbox: OutboxInbox,
  ) {}

  /**
   * Records an order event once per message id. The inbox record and the event commit in
   * one transaction, so a redelivered message changes nothing. `false` for a duplicate.
   */
  async record(messageId: string, event: OrderEvent, order: OrderSnapshot): Promise<boolean> {
    const outcome = await this.db.transaction(async (tx) =>
      // Records the message id through tx, then runs the callback only if it is new here.
      this.outboxInbox.processInTransaction(tx, 'analytics', messageId, async () => {
        const amount = event === 'placed' ? order.total : -order.total;
        await tx.insert(orderEvents).values({ orderId: order.id, event, amount });
        return this.revenue(tx);
      }),
    );
    if (outcome.duplicate) {
      return false;
    }
    this.logger.log(`Order ${order.id} ${event}, revenue is now ${outcome.result}`);
    return true;
  }

  /** Total revenue in cents. */
  async revenue(db: Database | Transaction = this.db): Promise<number> {
    // ... the sum of amount in order_events, read through db
  }

  // ...
}

```

```typescript title="analytics-service/analytics.controller.ts"
import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import type { OutboxEnvelope } from '@nestjs/outbox';
import { OrderStatsService, type OrderEvent, type OrderSnapshot } from './order-stats.service.js';

@Controller()
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);
  /** The last event handled for each key: one order's events run one at a time. */
  private readonly queues = new Map<string, Promise<void>>();

  constructor(private readonly orderStatsService: OrderStatsService) {}

  @EventPattern('analytics.order.placed')
  onPlaced(@Payload() envelope: OutboxEnvelope<OrderSnapshot>) {
    return this.apply('placed', envelope);
  }

  @EventPattern('analytics.order.cancelled')
  onCancelled(@Payload() envelope: OutboxEnvelope<OrderSnapshot>) {
    return this.apply('cancelled', envelope);
  }

  private apply(event: OrderEvent, envelope: OutboxEnvelope<OrderSnapshot>) {
    // Events arrive in the order the relay published them, but handlers are asynchronous:
    // without a queue, a cancellation could commit before the placement it follows.
    return this.inOrder(envelope.key ?? envelope.id, async () => {
      // The envelope id is the outbox message id: stable across redeliveries.
      const recorded = await this.orderStatsService.record(envelope.id, event, envelope.payload);
      if (!recorded) {
        this.logger.warn(`Skipped duplicate ${envelope.topic} ${envelope.id}`);
      }
    });
  }

  private inOrder(key: string, work: () => Promise<void>): Promise<void> {
    const next = (this.queues.get(key) ?? Promise.resolve()).then(work, work);
    this.queues.set(key, next);
    const forget = () => {
      if (this.queues.get(key) === next) {
        this.queues.delete(key);
      }
    };
    next.then(forget, forget);
    return next;
  }
}

```

订单的事件按中继发布的顺序到达，但处理程序是异步的：它们可以同时运行两个，取消可能在它所遵循的放置之前提交。控制器按单个键的事件按到达顺序一次处理，不同订单并行处理。

```typescript title="analytics-service/main.ts"
import { NestFactory } from '@nestjs/core';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.TCP,
    options: { host: '127.0.0.1', port: Number(process.env.PORT ?? 4001) },
  });
  app.enableShutdownHooks();
  await app.listen();
}
await bootstrap();

```

`inbox.processInTransaction()` 是 `@OnOutboxMessage()` 处理程序使用 `ctx.processInTransaction()` 获得的：对消费者自己的数据库的写入是恰好一次。当消费者副作用在其数据库之外时，例如电子邮件，请使用 `inbox.process(consumer, id, work)` 代替：如果消费者已看到此 ID，它会跳过 `work`，并在 `work` 成功后记录它。

> 警告 **警告** 通过 TCP，“发布”仅意味着字节离开了订单 API。如果分析服务在接收事件后但在处理前崩溃，则事件丢失。对于不能丢失的事件，请使用其代理确认接收的传输：Kafka、带有发布者确认的 RabbitMQ 或 NATS JetStream。`ClientProxyTransport` 接受一个 `toPacket` 选项，将消息映射到该传输的记录，具有自己的键和头部。

#### 重试和死信队列

当发布失败（因为处理程序抛出、TCP 连接被拒绝或发布时间超过 `publishTimeout`）时，中继会重新调度消息：

- 每次重试等待时间更长：1 秒、2 秒、4 秒，依此类推，上限为 `maxDelay`（此处为 1 分钟）。每次等待时间在半倍和完整值之间随机化，因此重试不会同步到达。
- 每次失败都记录为警告，包括尝试次数和下一次等待时间。
- 经过 `retry.attempts` 次失败（此处为 10 次）后，消息会移动到死信表，附带原因 `exhausted` 和每次尝试的错误。
- `NonRetryableMessageError` 跳过重试。消息立即被死信化，原因为 `rejected`。对于可选的 `retry.retryIf(error, attempt, message)` 函数返回 `false` 的任何错误也是如此。当多个处理程序失败时，只有当它们全部抛出 `NonRetryableMessageError` 时消息才被拒绝。否则它会被重试，已成功的处理程序会被跳过，并且只有永久性失败存在时才被拒绝一次。
- 没有 `@OnOutboxMessage()` 处理程序的 模块 不会被重试，而是被死信化。在滚动部署期间，旧实例的中继可能会看到仅新版本处理的主题。
- 被死信化的消息不再阻止其键：具有该键的后续消息将在没有它的情况下发布。大小为 `retry`，以防预期的中断耗尽它。

库存处理程序在库存不足时抛出 `NonRetryableMessageError`。重试不会创建库存，因此消息直接进入死信表，由人员决定如何处理。

`OutboxDeadLetters` 列出、检查、重新排队和清除死信。该包不挂载任何 HTTP 路由，因此请在您自己的守卫后暴露它。相同的控制器提供出库的统计信息，来自下一节中构建的 `OutboxMetrics` 服务：

```typescript title="outbox-admin/outbox-admin.controller.ts"
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OutboxDeadLetters } from '@nestjs/outbox';
import { AdminGuard } from './admin.guard.js';
import { OutboxMetrics } from './outbox-metrics.service.js';

@Controller('admin/outbox')
@UseGuards(AdminGuard)
export class OutboxAdminController {
  constructor(
    private readonly outboxDeadLetters: OutboxDeadLetters,
    private readonly outboxMetrics: OutboxMetrics,
  ) {}

  @Get('dead-letters')
  list(@Query('topic') topic?: string) {
    return this.outboxDeadLetters.list({ topic });
  }

  @Post('dead-letters/:id/requeue')
  @HttpCode(HttpStatus.OK)
  async requeue(@Param('id') id: string) {
    return { requeued: await this.outboxDeadLetters.requeue(id) };
  }

  @Delete('dead-letters/:id')
  async purge(@Param('id') id: string) {
    return { purged: await this.outboxDeadLetters.purge(id) };
  }

  @Get('stats')
  stats() {
    return this.outboxMetrics.snapshot();
  }
}

```

```typescript title="outbox-admin/admin.guard.ts"
import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';

type HttpRequest = { headers: Record<string, string | string[] | undefined> };

/** Placeholder: protect these routes with your application's real authorization. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<HttpRequest>();
    const token = process.env.ADMIN_TOKEN;
    const given = request.headers['x-admin-token'];
    return !!token && typeof given === 'string' && sameSecret(given, token);
  }
}

/** Compares in constant time, so response times don't give the token away. */
function sameSecret(given: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

```

> 信息 **提示** `AdminGuard` 是一个占位符。死信包含完整的负载，包括客户数据，因此请使用您应用程序的真实 [authorization](/security/authorization) 来保护这些路由。

`requeue()` 将死信移回出库，并带有一个新的重试预算和**相同的 ID**。已经处理它的消费者会通过其收件箱跳过它。因此，在您补货后，重新排队缺货订单可以在不发送第二次确认电子邮件的情况下保留库存。`requeue()` 和 `purge()` 也接受 ID 数组，或按 `topic`、`key` 或 `failedBefore` 过滤。它们拒绝空过滤器；传递 `all: true` 以针对每个死信。

#### 运行多个实例

订单 API 的每个实例都在相同的表上运行其中继，可以在任意数量的主机上运行。数据库决定谁获得什么：

- **声明 (Claims)。** 一个中继通过在它们上写入租约（持续 `lease` (30 s)）并附带一个随机令牌来声明一批消息。声明在存储的声明锁下轮流进行，`SKIP LOCKED` 会跳过另一个中继正在写入的行，因此两个中继永远不会获得相同的消息。它们并行发布批次。
- **围栏 (Fencing)。** 针对消息的任何后续写入（发布、重新调度、死信）都必须提供租约令牌，这样在租约过期后停滞的中继就不能覆盖接管的中继的工作。
- **跨实例排序。** 键的消息会按照其事务提交的顺序发出，无论哪个实例添加的：`add()` 使添加相同键的事务轮流执行。保持添加带键消息的事务简短。
- **恰好一次的预留。** 在同一时间、不同实例上运行的同一消息的两次投递在收件箱的主键处相遇：第二次等待第一次事务，然后如果已提交则跳过处理程序。
- **崩溃。** 如果一个实例在持有租约时死亡，租约过期后另一个实例会发布其消息。如果它在发布后但在记录之前死亡，则消息会第二次发布，而消费者的收件箱会丢弃重复项。实例上没有数据丢失，因为实例上没有数据：消息是数据库中的行。
- **租约预算。** 中继永远不会以剩余租约少于 `publishTimeout` (10 s) 的状态开始发布。它会释放剩余的批次。将 `publishTimeout` 保持远低于 `lease`。
- **时钟。** 租约使用中继的时钟，因此请使用 NTP 同步主机时钟，确保在 `lease` 范围内。
- **仅 API 实例。** 使用 `OUTBOX_RELAY=off` 启动一个实例，使其在不发布消息的情况下生成消息。`notify()` 只唤醒添加消息的实例的中继，因此中继实例在一个 `pollInterval` 内拾取消息。
- **仅中继工作进程。** 反之亦然：使用 `NestFactory.createApplicationContext(AppModule)` 启动一个工作进程且没有 HTTP 服务器，它会发布 API 实例添加的内容。中继的轮询定时器会保持该进程存活，直到关闭钩子停止它。

优雅关闭需要关闭钩子：

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // On SIGTERM the relay stops claiming, finishes in-flight publishes and releases its leases.
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

在 `SIGTERM` 时，中继停止声明并等待正在进行的发布完成，每次最长为 `publishTimeout`。然后它释放已声明但尚未开始处理的消息的租约，以便另一个实例可以立即接管它们，而不是等待租约过期。这发生在 `onModuleDestroy()`，在 `ClientsModule` 在 `onApplicationShutdown()` 中关闭 TCP 客户端之前。

要监控出库，订阅 `OutboxEvents` 并读取 `relay.stats()`：

```typescript title="outbox-admin/outbox-metrics.service.ts"
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { OutboxEvents, OutboxRelay } from '@nestjs/outbox';

@Injectable()
export class OutboxMetrics implements OnModuleInit {
  readonly counters = { published: 0, retried: 0, deadLettered: 0, leaseLost: 0 };
  /** Time from add() to a successful publish, for the latest message. */
  lastPublishLagMs = 0;

  constructor(
    private readonly outboxEvents: OutboxEvents,
    private readonly outboxRelay: OutboxRelay,
  ) {}

  onModuleInit() {
    this.outboxEvents.events$.subscribe((event) => {
      switch (event.type) {
        case 'published':
          this.counters.published++;
          this.lastPublishLagMs = Date.now() - event.message.createdAt;
          break;
        case 'retry-scheduled':
          this.counters.retried++;
          break;
        case 'dead-lettered':
          this.counters.deadLettered++;
          break;
        case 'lease-lost':
          this.counters.leaseLost++;
          break;
      }
    });
  }

  async snapshot() {
    // pending, ready, leased, deadLetters, lagMs (how long the longest-waiting message has waited)...
    const stats = await this.outboxRelay.stats();
    return { ...stats, ...this.counters, lastPublishLagMs: this.lastPublishLagMs };
  }
}

```

`relay.stats()` 报告 `lagMs`，即最长等待的消息等待了多长时间。当下游服务宕机时，该值会增长，因此它与 `deadLetters` 一起是需要警报的指标。使用 `delay` 调度的消息直到到期才计数。`published` 事件携带消息，因此 `Date.now() - message.createdAt` 是端到端发布延迟。`OutboxEvents` 发出 `switch` 计数中的四个事件。`lease-lost` 表示另一个中继在当前中继发布消息时接管了该消息，因此该消息可能会被其消费者接收两次。在 `OutboxAdminModule` 中注册 `OutboxAdminController`、`AdminGuard` 和 `OutboxMetrics`。

每个事件也发布在 [`node:diagnostics_channel`](https://nodejs.org/api/diagnostics_channel.html) 通道上，`nestjs:outbox:published` 等。跟踪和指标库可以在没有任何 Nest 代码的情况下订阅这些事件，并且它们可以看到进程中的每个 Nest 应用程序。

在订阅者内部捕获错误。RxJS 和 `diagnostics_channel` 都会将订阅者的错误重新抛出为未捕获的异常，从而停止进程。到那时，中继已经保存了消息的结果，因此消息本身是安全的。

示例应用程序针对 PostgreSQL 服务器运行此部分：两个共享 20 个订单的中继，三个实例（其中一个仅 API 实例）发布一次并按顺序处理 12 个订单的创建和取消，一个事务等待另一个实例在同一键上的锁，一个持有租约的实例崩溃，以及一个优雅关闭。

#### 尝试

创建两个数据库，一个用于订单 API（`store`），一个用于分析服务（`analytics`），并应用每个服务的独立迁移：订单 API 从 [Prerequisites](/reliability/outbox#prerequisites) 创建其表和产品，而分析服务创建 `order_events`。

在 `analytics` 上启动分析服务（TCP 端口 4001），在 `store` 上启动订单 API（端口 3000），并在 API 的环境中设置 `ADMIN_TOKEN=s3cret`。每个服务都会记录其注册的存储，存储在首次启动时创建其模式：

```bash
[Nest] 52654  - 09/30/2026, 6:45:43 PM     LOG [OutboxModule] OutboxStorage: PostgresOutboxStore
[Nest] 52654  - 09/30/2026, 6:45:43 PM     LOG [OutboxModule] PostgresOutboxStore: migrated schema "nest_outbox" to version 1.
[Nest] 52743  - 09/30/2026, 6:45:59 PM     LOG [OutboxModule] OutboxStorage: PostgresOutboxStore
[Nest] 52743  - 09/30/2026, 6:46:00 PM     LOG [OutboxModule] PostgresOutboxStore: migrated schema "nest_outbox" to version 1.

```

放置一个订单：

```bash
$ curl -X POST localhost:3000/orders \
    -H 'Content-Type: application/json' \
    -d '{"userId":"user-42","items":[{"productId":"salmon-kibble-2kg","quantity":2}]}'
{"id":"07fafff6-9892-4298-aeef-dc2c3d5d6bf5","userId":"user-42","items":[{"productId":"salmon-kibble-2kg","quantity":2,"price":2499}],"total":4998,"status":"placed"}

```

API 的日志显示了两个进程内处理程序：

```bash
[Nest] 52743  - 09/30/2026, 6:46:07 PM     LOG [MailerService] Order confirmation for 07fafff6-9892-4298-aeef-dc2c3d5d6bf5 sent to user-42
[Nest] 52743  - 09/30/2026, 6:46:07 PM     LOG [StockReservationHandler] Reserved stock for order 07fafff6-9892-4298-aeef-dc2c3d5d6bf5

```

分析服务的日志显示了 TCP 消费者：

```bash
[Nest] 52654  - 09/30/2026, 6:46:07 PM     LOG [OrderStatsService] Order 07fafff6-9892-4298-aeef-dc2c3d5d6bf5 placed, revenue is now 4998

```

一个未知产品的订单在事务内部失败验证。响应是一个 `400`，没有内容到达出库：

```bash
$ curl -X POST localhost:3000/orders \
    -H 'Content-Type: application/json' \
    -d '{"userId":"user-42","items":[{"productId":"catnip-mouse","quantity":1}]}'
{"message":"Unknown product \"catnip-mouse\"","error":"Bad Request","statusCode":400}

```

现在订购两袋结团猫砂（`clumping-litter-10l`），库存有一袋。API 接受该订单，因为库存是异步预留的。确认电子邮件发出，预留在首次尝试时被死信：

```bash
$ curl -X POST localhost:3000/orders \
    -H 'Content-Type: application/json' \
    -d '{"userId":"user-7","items":[{"productId":"clumping-litter-10l","quantity":2}]}'
{"id":"bf4b8bb3-fd47-4c03-9650-ee991cce3dbe","userId":"user-7","items":[{"productId":"clumping-litter-10l","quantity":2,"price":1599}],"total":3198,"status":"placed"}

```

```bash
[Nest] 52743  - 09/30/2026, 6:46:15 PM     LOG [MailerService] Order confirmation for bf4b8bb3-fd47-4c03-9650-ee991cce3dbe sent to user-7
[Nest] 52743  - 09/30/2026, 6:46:15 PM    WARN [OutboxRelay] Dead-lettered order.placed 01a0f335-aae8-7027-b795-ca9dab21e44d after 1 attempt(s) (rejected): NonRetryableMessageError: Not enough stock for "clumping-litter-10l" (order bf4b8bb3-fd47-4c03-9650-ee991cce3dbe)

```

检查死信队列。没有 `x-admin-token` 头部，守卫返回 `403`：

```bash
$ curl localhost:3000/admin/outbox/dead-letters -H 'x-admin-token: s3cret'

```

```json
[
  {
    "id": "01a0f335-aae8-7027-b795-ca9dab21e44d",
    "topic": "order.placed",
    "payload": {
      "id": "bf4b8bb3-fd47-4c03-9650-ee991cce3dbe",
      "items": [{ "price": 1599, "quantity": 2, "productId": "clumping-litter-10l" }],
      "total": 3198,
      "status": "placed",
      "userId": "user-7"
    },
    "headers": {},
    "key": null,
    "createdAt": 1790786775784,
    "attempts": 1,
    "lastError": "NonRetryableMessageError: Not enough stock for \"clumping-litter-10l\" (order bf4b8bb3-fd47-4c03-9650-ee991cce3dbe)",
    "history": [
      {
        "at": 1790786775809,
        "error": "NonRetryableMessageError: Not enough stock for \"clumping-litter-10l\" (order bf4b8bb3-fd47-4c03-9650-ee991cce3dbe)",
        "attempt": 1,
        "transport": "local"
      }
    ],
    "reason": "rejected",
    "failedAt": 1790786775809
  }
]

```

有效载荷被存储为 `jsonb`，它保持自己的键顺序，因此它返回的键顺序与添加时的顺序不同。

用其 id 重新排队，然后补货：

```bash
$ psql postgres://localhost:5432/store -c "UPDATE products SET in_stock = in_stock + 5 WHERE id = 'clumping-litter-10l'"
UPDATE 1
$ curl -X POST localhost:3000/admin/outbox/dead-letters/01a0f335-aae8-7027-b795-ca9dab21e44d/requeue \
    -H 'x-admin-token: s3cret'
{"requeued":1}

```

预留成功。邮件处理者的收件箱中已存在此消息 id，因此不会发送第二封邮件：

```bash
[Nest] 52743  - 09/30/2026, 6:46:24 PM     LOG [StockReservationHandler] Reserved stock for order bf4b8bb3-fd47-4c03-9650-ee991cce3dbe

```

最后，使用 `Ctrl+C` 停止分析服务，然后下订单并取消订单：

```bash
$ curl -X POST localhost:3000/orders \
    -H 'Content-Type: application/json' \
    -d '{"userId":"user-42","items":[{"productId":"salmon-kibble-2kg","quantity":1}]}'
{"id":"908139a7-2bab-4dd8-988a-bdde8c087074","userId":"user-42","items":[{"productId":"salmon-kibble-2kg","quantity":1,"price":2499}],"total":2499,"status":"placed"}
$ curl -X POST localhost:3000/orders/908139a7-2bab-4dd8-988a-bdde8c087074/cancel
{"id":"908139a7-2bab-4dd8-988a-bdde8c087074","userId":"user-42","items":[{"price":2499,"quantity":1,"productId":"salmon-kibble-2kg"}],"total":2499,"status":"cancelled"}
$ curl localhost:3000/admin/outbox/stats -H 'x-admin-token: s3cret'
{"pending":2,"ready":0,"leased":0,"deadLetters":0,"oldestDueAt":1790786821554,"lagMs":3351,"inFlight":0,"published":5,"retried":3,"deadLettered":1,"leaseLost":0,"lastPublishLagMs":62}

```

两个分析消息都处于待处理状态。在中断期间，`lagMs` 增长，而 `retried` 计数失败的尝试。`ready` 为 0：下订单正在等待下一次重试，而取消订单已到期但排在后面，因为它们共享一个键。API 会记录每次失败的尝试：

```bash
[Nest] 52743  - 09/30/2026, 6:47:01 PM    WARN [OutboxRelay] Retrying analytics.order.placed 01a0f336-5db2-72ad-80c8-17c07908dfa1 in 546ms (attempt 1 of 10 failed): Error: connect ECONNREFUSED 127.0.0.1:4001
[Nest] 52743  - 09/30/2026, 6:47:02 PM    WARN [OutboxRelay] Retrying analytics.order.placed 01a0f336-5db2-72ad-80c8-17c07908dfa1 in 1617ms (attempt 2 of 10 failed): Error: connect ECONNREFUSED 127.0.0.1:4001
[Nest] 52743  - 09/30/2026, 6:47:04 PM    WARN [OutboxRelay] Retrying analytics.order.placed 01a0f336-5db2-72ad-80c8-17c07908dfa1 in 2084ms (attempt 3 of 10 failed): Error: connect ECONNREFUSED 127.0.0.1:4001

```

再次启动分析服务。在下一次重试时，中继发布下订单，然后是取消订单。收入从中断点恢复，因为它存储在服务的数据库中，而不是内存中：

```bash
[Nest] 53368  - 09/30/2026, 6:47:29 PM     LOG [OrderStatsService] Order 908139a7-2bab-4dd8-988a-bdde8c087074 placed, revenue is now 10695
[Nest] 53368  - 09/30/2026, 6:47:29 PM     LOG [OrderStatsService] Order 908139a7-2bab-4dd8-988a-bdde8c087074 cancelled, revenue is now 8196

```

#### 测试

在 e2e 测试中，使用 [PGlite](https://pglite.dev) 在进程内运行 PostgreSQL 和您的真实迁移，关闭轮询循环，并自行驱动中继。`relay.runOnce()` 声明并处理一个批次，并在批次完成后解析：

```typescript title="test/orders.e2e-spec.ts"
import { PGlite } from '@electric-sql/pglite';
import { getDrizzleToken } from '@nestjs/drizzle';
import { Outbox, OutboxRelay } from '@nestjs/outbox';
import { Test, type TestingModule } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import { of } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ANALYTICS_SERVICE, AppModule } from '../src/app.module.js';
import { MailerService } from '../src/notifications/mailer.service.js';
import { OrdersService } from '../src/orders/orders.service.js';

describe('OrdersService (outbox)', () => {
  const client = new PGlite(); // PostgreSQL, in-process
  const db = drizzle({ client });
  const mailer = { sendOrderConfirmation: vi.fn() };
  const analytics = { emit: vi.fn(() => of(undefined)) };
  let moduleRef: TestingModule;
  let orders: OrdersService;
  let relay: OutboxRelay;

  beforeAll(async () => {
    // Your migrations: the order tables. The outbox's store creates its schema in init().
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
    process.env.OUTBOX_RELAY = 'off'; // no poll loop: the test drives the relay
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDrizzleToken())
      .useValue(db) // the outbox's store runs on it too
      .overrideProvider(MailerService)
      .useValue(mailer)
      .overrideProvider(ANALYTICS_SERVICE)
      .useValue(analytics)
      .compile();
    await moduleRef.init();
    orders = moduleRef.get(OrdersService);
    relay = moduleRef.get(OutboxRelay);
  });

  afterAll(async () => {
    await moduleRef.close();
    await client.close();
  });

  it('publishes order events only after the order commits', async () => {
    const order = await orders.placeOrder({ userId: 'user-42', items: [{ productId: 'salmon-kibble-2kg', quantity: 1 }] });
    expect(mailer.sendOrderConfirmation).not.toHaveBeenCalled();

    await relay.runOnce(); // claim and publish one batch

    expect(mailer.sendOrderConfirmation).toHaveBeenCalledWith(order);
    expect(analytics.emit).toHaveBeenCalledWith(
      'analytics.order.placed',
      expect.objectContaining({ key: order.id, payload: order }),
    );
    expect(await relay.stats()).toMatchObject({ pending: 0, deadLetters: 0 });
  });

  it('publishes nothing when the transaction rolls back', async () => {
    const outbox = moduleRef.get(Outbox);
    const add = outbox.add.bind(outbox);
    vi.spyOn(outbox, 'add').mockImplementationOnce(async (tx, messages) => {
      await add(tx, messages); // the messages are written...
      throw new Error('Connection terminated unexpectedly'); // ...then the transaction fails
    });

    await expect(
      orders.placeOrder({ userId: 'user-42', items: [{ productId: 'salmon-kibble-2kg', quantity: 1 }] }),
    ).rejects.toThrow('Connection terminated unexpectedly');

    expect(await relay.stats()).toMatchObject({ pending: 0 });
    expect(await relay.runOnce()).toMatchObject({ claimed: 0 });
  });
});

```

- 出库、其存储、迁移和进程内分派都是真实的。只有邮件发送器和分析客户端是存根的。
- 使用 PGlite 覆盖数据库 `DrizzleModule` 注册，其令牌由 `getDrizzleToken()` 返回。存储的工厂注入相同的令牌，因此订单和出库共享数据库，因为它们在生产环境中共享连接池，并且存储在模块初始化时在那里创建其模式。该模块仍然打开其 `pg` 连接池，但从未连接。
- 回滚测试允许 `outbox.add()` 写入消息，然后使事务失败。订单及其消息一起消失，`runOnce()` 没有找到可声明的内容。
- 对于依赖时间的行为，例如退避和租约到期，使用 `vi.spyOn(Date, 'now')` 将 `Date.now()` 提前。中继从其中获取时间，用于自身和存储，而真实计时器继续为套接字和 HTTP 运行。
- PGlite 只有一个连接，因此它一次处理一个事务。测试实例之间针对与生产相同的次要版本的 PostgreSQL 服务器的竞争条件，如 [several instances](/reliability/outbox#run-several-instances) 所示。
- 要将出库排除在测试之外，请替换存储：`overrideProvider(PostgresOutboxStore).useValue(new InMemoryOutboxStore())`。一个纯实例不会注册自身，因此出库回退到其内存存储，并且不会创建存储的模式。但是它不能加入您的 Drizzle 事务：已回滚的消息仍然被发布，并且存储在第一次接收到您的事务时记录警告。

#### 交付保证

总体保证是**至少一次**，消费者收件箱会吸收重复项。

| 情况 | 结果 |
| --- | --- |
| 订单事务回滚 | 消息从未存在且永不发布 |
| 订单事务提交 | 最终发布，或带有错误历史记录被死信 |
| 中继在声明后死亡 | 租约到期后由另一个实例发布 |
| 中继在发布后、记录前死亡 | 发布两次。收件箱会丢弃重复项 |
| 发布或处理程序失败 | 带有退避重试，然后被死信（`exhausted`） |
| 发布或处理程序超出 `publishTimeout` | 计为失败尝试，并且 `ctx.signal` 中止。忽略它的处理程序继续运行；同一进程中的重试等待它 |
| `NonRetryableMessageError`，或 `retryIf` 返回 `false` | 立即被死信（`rejected`） |
| 消息共享一个 `key` | 按添加顺序发布。重试的消息会阻塞其键的其余部分 |
| 消息被死信 | 其键被解锁，因此具有该键的后续消息会超越它 |
| TCP、Redis 或核心 NATS 传输 | “发布”意味着写入已离开进程。在此之后消费者崩溃会丢失消息 |

键内的顺序是存储编号消息的顺序，而不是它们的 id：id 来自其实例的时钟，而时钟是不同的。PostgreSQL 并发运行事务，因此存储使具有相同键的消息的事务轮流执行，编号遵循提交顺序（参见 [Keep messages in your database](/reliability/outbox#keep-messages-in-your-database)）。

#### 生产检查清单

- 在应用程序的数据库上注册一个存储，在数据库服务器上：`PostgresOutboxStore`、`MySqlOutboxStore` 或您自己的（[The store contract](/reliability/outbox#the-store-contract)）。切勿将出库保留在实例本身，无论是内存中还是在文件数据库（如 SQLite 磁盘上的）中：容器的文件系统在任务被替换时会消失，所有未发布的消息也会随之消失。生产守卫在没有存储的情况下拒绝启动；仅为您可以承受丢失消息的进程设置 `allowInMemoryStorage`。
- 在新版本启动前应用存储的迁移，使用 `npx @nestjs/outbox migrate` 或您的迁移工具，并在 CI 中使用 `npx @nestjs/outbox status` 检查它们。使用 `NODE_ENV=production`，存储不会在启动时迁移：落后的模式会使其失败。
- 在 PostgreSQL 上，将数据库的默认隔离级别保持在 READ COMMITTED，即默认值：存储在启动时拒绝更严格的级别。
- 监控来自 `relay.stats()` 的 `lagMs` 和 `deadLetters`，以及来自 `OutboxEvents` 或 `nestjs:outbox:dead-lettered` 诊断通道的 `dead-lettered` 事件。
- 将 `retry` 的大小设置为下游服务可能中断的时长。包的默认值是 20 次尝试，总共约 30 到 60 分钟。本教程中限制为 1 分钟的 10 次尝试在 2 到 4 分钟后放弃，然后某个键的后续消息会超越被死信的消息。
- 保持 `consumer` 名称稳定。收件箱条目以它们为键，因此重命名的消费者会将每条过去的记录视为新的。
- 清理收件箱。没有东西会为您调用 `OutboxInbox.prune()`。例如，从 [cron job](/techniques/task-scheduling#声明式-cron-任务) 运行它，使用比任何重新投递（包括重新排队）更长的窗口，例如 `inbox.prune('30d')`。
- 保持处理程序少于 `publishTimeout`，并将 `ctx.signal` 传递给它们调用的方法。较慢的处理程序计为失败尝试；租约不会延长。
- 调用 `app.enableShutdownHooks()`，以便部署会耗尽中继而不是使消息处于租约状态。之后 `DrizzleModule` 在 `onApplicationShutdown()` 中结束连接池。
- 保护死信路由。它们暴露完整的有效载荷。
- 对有效载荷进行版本控制。前一个版本添加的消息在部署后仍可能被投递。
- 为每个有序流分配自己的键，并且不要为不同传输的消息共享一个键。
- 保持调用 `outbox.add()` 的事务简短。每个键的锁使具有相同键的消息的事务轮流执行。Prisma 的交互式事务默认在 5 秒后超时（客户端上的 `transactionOptions` 或每次调用）。
- 在 MySQL 上，当它因死锁（错误 1213）失败时，再次运行调用 `outbox.add()` 的事务：MySQL 将全部回滚。
- 为您的请求和中继的连接池设置大小：每次声明都会占用一个短暂的事务连接。
- 在 CI 中使用 `concurrent: true` 对您自己的存储、连接池、针对您在生产中运行的数据库引擎和主要版本进行合同套件测试。

#### 存储合约

`PostgresOutboxStore` 和 `MySqlOutboxStore` 实现了该包的两个存储接口：`OutboxStore` 用于消息和死信，`OutboxInboxStore` 用于消费者的收件箱。对于其他数据库，请在您自己的提供者中实现它们。这些接口上每个方法的 JSDoc 说明了必须做什么，以及该规则防止了哪种竞态条件。

**注册。** 存储是一个普通的单例提供者，在其构造函数中通过名称调用可注入的 `OutboxStorage` 上的 `registerSource()`，以实现其实现的合约：`messages` 和 `inbox`。仅消费的 ⟦Service⟧ 可以单独注册收件箱存储。注册表会一次性检查形状（每个方法都是一个函数），除非通过 `replace: true`，否则拒绝第二次注册，并在 `OutboxModule` 初始化时锁定，记录正在使用的存储。请求作用域的提供者、延迟加载模块中的提供者或生命周期钩子注册得太晚，会抛出错误。

如果没有注册任何内容，出库将运行在内存存储上，并在启动时报告：

```bash
[Nest] 19039  - 09/23/2026, 11:28:45 AM     LOG [OutboxModule] OutboxStorage: InMemoryOutboxStore (the default: state is lost on restart and not shared between instances)

```

这不仅仅是一个重启时丢失的快捷方式。内存存储无法加入您的事务，因此它一次性应用 `add()`，并在首次接收到事务句柄时发出警告。在此运行中，订单的事务添加了消息然后失败，确认邮件仍然发送了：

```bash
[Nest] 19039  - 09/23/2026, 11:28:45 AM    WARN [OutboxModule] InMemoryOutboxStore.add() received your transaction handle, and can't join it: the write applies at once, so a rolled-back transaction won't undo it. Register a store for your database with OutboxStorage.registerSource(). (Logged once.)
[Nest] 19039  - 09/23/2026, 11:28:46 AM     LOG [MailerService] Order confirmation for 7435d418-5d9a-48a0-b186-6cfd2e34b9f4 sent to user-7

```

使用 `NODE_ENV=production` 时，相同的应用程序不会启动：

```bash
Error: OutboxStorage: no store is registered for `messages` (OutboxStore) and `inbox` (OutboxInboxStore), and NODE_ENV is "production": in memory, messages and inbox records would be lost on restart and not shared between instances. Register a store on your database: PostgresOutboxStore (@nestjs/outbox/postgres), MySqlOutboxStore (@nestjs/outbox/mysql), or your own OutboxStore and OutboxInboxStore in a provider that injects OutboxStorage and calls `storage.registerSource({ messages: this, inbox: this })` in its constructor. Or set `allowInMemoryStorage: true` in the OutboxModule options to run in memory anyway.

```

模块选项中的 `allowInMemoryStorage: true` 是一个故意的退出方式，适用于可能丢失状态的单个实例。

**原子性。** 生产者、中继和投递在存储中相互竞争。`add()` 必须按事务提交的顺序对键的消息进行编号，`claim()` 绝不能将消息租给两个中继或超前于其键的较旧消息，中继的后续写入仅在其租约有效期间应用，并且一个消息的两次投递必须在 `recordInbox()` 处汇合。因此，任何改变状态的方法都是一个条件语句，或一个带有正确锁的事务，绝不是先读取后写入。`add()` 和 `recordInbox()` 接收未被修改的事务对象：它们必须通过它写入，并拒绝任何不是它的东西，例如数据库本身，使用 `OutboxTransactionRequiredError`。

使用来自 `@nestjs/outbox/testing` 的套件进行**测试**。`outboxStoreContract()` 和 `outboxInboxStoreContract()` 将合约作为任何测试运行器的测试用例返回：每个用例都是一个 `name` 和一个 `run()` 函数，在失败时抛出错误。教程中的测试使用 Drizzle 通过 `PostgresOutboxStore` 运行它们，就像您对自己的实现那样，使用一个在表清空时返回存储的函数、打开您事务的方式以及存储必须拒绝的句柄 `notATransaction`：

```typescript title="test/drizzle-outbox.store.e2e-spec.ts"
/** A store on emptied tables, built the way Nest builds it: with the database and a registry. */
async function freshStore(db: Database): Promise<OutboxStoreHarness<Transaction> & { store: PostgresOutboxStore }> {
  await db.execute(sql`TRUNCATE nest_outbox.messages, nest_outbox.dead_letters, nest_outbox.inbox RESTART IDENTITY`);
  return {
    store: new PostgresOutboxStore({ executor: fromDrizzle(db) }, new OutboxStorage()),
    transaction: (work) => db.transaction(work),
    notATransaction: db,
  };
}

describe('PostgresOutboxStore through fromDrizzle on PGlite: the store contract', () => {
  // ...
  // The concurrency cases run too; with one connection, PGlite runs them one transaction at a time.
  for (const c of outboxStoreContract(() => freshStore(db), { concurrent: true })) {
    it(c.name, c.run);
  }
  describe('the inbox contract', () => {
    for (const c of outboxInboxStoreContract(() => freshStore(db), { concurrent: true })) {
      it(c.name, c.run);
    }
  });
});

```

`concurrent: true` 添加了朴素存储会失败的竞态条件：事务重叠的键的生产者、并排声明的中继、生产者和中继的竞争、陈旧中继的写入与接管的竞争，以及一个消息的两次投递。在 PGlite 上，它们一次处理一个事务，因此也应在具有事务真正重叠的具有连接池的服务器上运行它们，在您生产中运行的数据库引擎和主要版本上。教程通过其每个客户端运行这两个套件：PGlite 上的 Drizzle 和 PostgreSQL 上的 Drizzle，PostgreSQL 上的 TypeORM 和 Prisma，以及 MySQL 上的 Drizzle，针对 `MySqlOutboxStore`。该包自身的测试也使用 Drizzle、TypeORM 和 Prisma 手动编写的存储运行它们，作为编写了符合接口的存储通过测试的证明。

其他包的存储可以存在于其他地方：幂等性存储适合 Redis。出库的存储不行，因为其消息必须与您的行一起提交到您的数据库中。

#### 在 Postgres 上使用 BullMQ 而不是

BullMQ 6 有一个 PostgreSQL 后端，所以可以问它的任务表是否可以作为出库。该包对 BullMQ 6.3.x 的研究（通过阅读其发布的代码，而不是实时运行）表明：今天不行。

- `Queue.add()` 始终在 BullMQ 自己的连接池上运行，处于自动提交模式。后端接口故意不暴露任何连接或事务类型，因此 `add()` 无法加入插入订单的事务。
- 投递本身是一个 SQL 函数，`bullmq.add_job(...)`。在您自己的事务上调用它将是原子的，但该函数是内部的，其签名会随着 BullMQ 的模式迁移而更改，并且调用它的每个事务都会在提交时获取 Postgres 的全局 NOTIFY 锁。
- `@nestjs/bullmq` 12.0.0 不能为单个队列选择 Postgres 后端。唯一的方法是 BullMQ 的进程级 `setDefaultBackendFactory()`。

需要的是一个上游选项，以便在调用者提供的客户端上运行 `add()`（以便任务与订单一起提交），以及 `@nestjs/bullmq` 中的一个后端选项。有了两者，任务表将成为出库，并且 BullMQ 的工作进程将提供声明、重试和失败集，中间没有中继。在此之前，请使用此出库，并从一个调用 `queue.add(topic, payload)` 且使用出库消息 `id` 作为 `jobId` 的 `OutboxTransport` 发布到 BullMQ，这样重新发布的消息就会被忽略，而任务仍然存在。

#### 示例

可在 [37-outbox sample](https://github.com/nestjs/nest/tree/master/sample/37-outbox) 中找到一个可工作的示例：使用 Drizzle 的 PostgreSQL 上的订单 API、其进程内处理程序、具有自己数据库的分析微服务、死信管理 API 和测试。

#### 参考

##### 模块选项

`OutboxModule.forRoot()` 接受这些选项。`forRootAsync()` 在顶层接受 `transports` 类、`imports` 和 `isGlobal`，其余的从 `useFactory`、`useClass` 或 `useExisting`（实现 `OutboxOptionsFactory` 的类）中获取，如 [Register the outbox](/reliability/outbox#register-the-outbox) 所示。选项令牌是 `OUTBOX_MODULE_OPTIONS`。存储不是一个选项：像 [Keep messages in your database](/reliability/outbox#keep-messages-in-your-database) 中那样将其注册为提供者。持续时间以毫秒为单位，或像 `'30s'` 和 `'1m'` 这样的字符串。

| 选项 | 默认值 | 含义 |
| --- | --- | --- |
| `transports` | None | 命名 `OutboxTransport` 类或实例。`local`，即 `@OnOutboxMessage()` 处理器，内置且保留 |
| `imports` | None | 传输类注入其导出的模块 |
| `route` | 唯一的目的地 | `(message) => name`：消息发送到的唯一传输器。与处理器和传输器一起使用时，或多个传输器时需要 |
| `relay.enabled` | `true` | 仅生产或仅消费实例中的 `false` |
| `relay.pollInterval` | `'1s'` | 空闲时的轮询等待时间 |
| `relay.batchSize` | `100` | 每个声明的消息数 |
| `relay.lease` | `'30s'` | 一个声明的独占时间长度 |
| `relay.concurrency` | `10` | 在批次内并行发布的键组 |
| `relay.publishTimeout` | `lease` 的三分之一 | 较慢的发布被计为失败尝试，并且其 `signal` 会中止 |
| `retry.attempts` | `20` | 消息被死信之前（包括第一次）的总尝试次数。`retry: 5` 表示 5 次尝试；`retry: false` 表示单次尝试 |
| `retry.backoff` | 递增加倍直到 `'5m'`，等抖动 | 一个具有 `delay`、`factor`、`maxDelay` 和 `jitter`（`'equal'`、`'full'` 或 `'none'`）的对象，或一个函数 `(attempt, error, message) => duration` |
| `retry.retryIf` | 每个错误 | `(error, attempt, message) => boolean`：立即将消息死信 |
| `allowInMemoryStorage` | `false` | 带有 `NODE_ENV=production` 且未注册存储时，启动失败；无论如何都会在内存存储上运行 |
| `isGlobal` | `true` | 全局注册该模块 |

##### 存储

`new PostgresOutboxStore(options, outboxStorage)`（来自 `@nestjs/outbox/postgres`）和 `new MySqlOutboxStore(options, outboxStorage)`（来自 `@nestjs/outbox/mysql`）接受这些选项。如果没有 `outboxStorage`，存储不会注册到任何地方，这适用于脚本或测试。

| 选项 | 默认值 | 含义 |
| --- | --- | --- |
| `executor` | Required | 存储如何连接到数据库：以下执行器之一，来自与存储相同的入口点。其他方言不编译 |
| `schema` | `'nest_outbox'` | 在 PostgreSQL 上，其表的 `schema`，其首次迁移创建的：字母、数字和下划线，不能以数字开头，最多 63 个字符。在 MySQL 上，连接数据库中的表前缀：小写字母、数字和下划线，不能以数字开头，最多 40 个字符 |
| `migrate` | `true`，但有 `NODE_ENV=production` 时除外 | 在应用程序启动时应用待处理的迁移。使用 `false` 时，如果模式落后，启动将以 `OutboxSchemaError` 失败 |

每个执行器接受您的数据库客户端以及其自身的事务对象，然后由 `outbox.add()` 和 `processInTransaction()` 使用：

| 执行器 | 接受 | 事务对象 |
| --- | --- | --- |
| `fromDrizzle(db)` | 一个 Drizzle 数据库：在 PostgreSQL 上，使用其驱动；在 MySQL 上，使用 `mysql2` | `tx`，由 `db.transaction()` 传递其回调 |
| `fromTypeOrm(dataSource)` | 一个类型为 `postgres` 或 `mysql` 的 `DataSource` | `EntityManager`，由 `dataSource.transaction()` 传递其回调，或在 `startTransaction()` 后由 `QueryRunner` 提供 |
| `fromPrisma(prisma, options)` | 一个 Prisma 客户端，通过驱动适配器，例如 `@prisma/adapter-pg`，或 MySQL 的 `@prisma/adapter-mariadb`。`maxWait`（默认 `'10s'`）和 `timeout`（默认 `'1m'`）限制存储自身的事务 | 由 `prisma.$transaction()` 传递其回调的事务客户端 |
| `fromKysely(db)` | 一个具有 PostgreSQL 或 MySQL 方言的 `Kysely` 实例 | 由 `db.transaction().execute()` 传递的事务 |
| `fromPg(pool)` | PostgreSQL：一个 node-postgres `Pool`，或一个连接的 `Client` | 一个客户端，例如来自 `pool.connect()` 的，在 `BEGIN` 后 |
| `fromMysql2(pool)` | MySQL：一个 `mysql2/promise` 池，或一个连接 | 一个连接，例如来自 `pool.getConnection()` 的，在 `beginTransaction()` 后 |

存储的 `migrate()` 方法会一次性应用待处理的迁移，无论 `migrate` 选项如何设置，并以已应用的版本解析。静态 `migrationSql()` 返回它们的 SQL，包含簿记信息，而 `MySqlOutboxStore.migrationStatements()` 返回相同的语句，每个语句占一个字符串。它们接受 `schema`、要升级到的版本 `from`（默认 `0`，新数据库）和 `to`（默认：包所需的那个），`migrationSql()` 也接受 `statementBreakpoints`。在 PostgreSQL 上从版本 0 开始，SQL 以 `CREATE SCHEMA IF NOT EXISTS` 开始，这需要数据库上的 CREATE 权限：如果有人为您创建了模式，则省略它。静态 `schemaVersion` 是包所需的版本。

命令行 `npx @nestjs/outbox` 接受 `--url`（默认 `DATABASE_URL`）和 `--schema`（默认 `nest_outbox`）。一个 `mysql://` URL 会选择 `MySqlOutboxStore` 的迁移，并且需要安装 `mysql2`：

| 命令 | 功能 |
| --- | --- |
| `migrate` | 应用待处理的迁移，类似于 `migrate: true` 在启动时的行为 |
| `status` | 打印模式的版本和包所需的版本，如果模式落后则以 1 退出 |
| `sql` | 不使用数据库时，打印 `migrationSql()` 的 SQL，从 `--from` 到 `--to`：PostgreSQL 的，或带有 `--dialect mysql` 的 MySQL。`--statement-breakpoints` 为 drizzle-kit 自定义迁移分隔语句 |

在 MySQL 上，存储需要 MySQL 8.4 LTS 或 9.x 配合严格的 `sql_mode`、MySQL 的默认设置：宽松的 `sql_mode`，或 MariaDB，否则启动会失败。

##### 消息和处理器

传递给 `outbox.add(tx, message)` ([Save the order and its messages in one transaction](/reliability/outbox#save-the-order-and-its-messages-in-one-transaction)) 的消息具有以下字段：

| 字段 | 是否必需 | 含义 |
| --- | --- | --- |
| `topic` | 是 | `route` 和处理器匹配的条件 |
| `payload` | 是 | 在 `add()` 运行时序列化为 JSON |
| `key` | 否 | 排序键：共享此键的消息按提交顺序一次发布 |
| `headers` | 否 | 字符串头部，传递给传输器 |
| `id` | 否 | 您自己的唯一 id。默认为 UUIDv7；消费者通过它进行去重 |
| `delay` 或 `availableAt` | 否 | 不早于当前时间后的此时间长度发布，或不早于此时间点。两者选一 |

- `@OnOutboxMessage(topic, options)` 接受 `consumer`（必需：处理器收件箱的名称）和 `inbox`（默认 `true`；`false` 在每次投递时运行）。 [Handle order.placed in-process](/reliability/outbox#handle-orderplaced-in-process)
- 处理器的上下文包含 `message`、`consumer`、`attempt`、`signal` 和 `processInTransaction(tx, work)`。
- `ClientProxyTransport(token, options)` 发射带有 `id`、`topic`、`key`、`headers`、`createdAt` 和 `payload`（`OutboxEnvelope`）信封的主题。其 `toPacket(message, envelope)` 选项返回您自己的 `pattern` 和 `data`。 [Publish to the analytics microservice](/reliability/outbox#publish-to-the-analytics-microservice)

##### 服务

| 服务 | 方法 |
| --- | --- |
| `Outbox` | `add(tx, messages)`, `notify()` |
| `OutboxRelay` | `stats()`: `pending`, `ready`, `leased`, `deadLetters`, `oldestDueAt`, `lagMs`, `inFlight`。 `runOnce()`: `claimed`, `published`, `retried`, `deadLettered`, `released`, `leaseLost`。 还有 `notify()`, `start()` 和 `stop()` |
| `OutboxDeadLetters` | `list(query)`（按 `topic`, `key`, `limit`, `offset`；最新的优先）, `get(id)`, `requeue(target)`, `purge(target)`。 目标是一个 id、一个 id 数组，或按 `ids`, `topic`, `key`, `failedBefore` 或 `all: true` 进行的过滤器。 [Retries and the dead-letter queue](/reliability/outbox#retries-and-the-dead-letter-queue) |
| `OutboxInbox` | `process(consumer, id, work)`, `processInTransaction(tx, consumer, id, work)`, `prune(olderThan)`。 `process` 方法都解析 `duplicate`，并在 `work` 运行时解析 `result` |

##### 事件

`OutboxEvents.events$` 发射每个事件，并将其发布到其 `node:diagnostics_channel` 通道上。每个有效载荷都有 `type` 和 `message`。 [Run several instances](/reliability/outbox#run-several-instances) 统计它们。在订阅者内部捕获错误：RxJS 和 `diagnostics_channel` 都会将订阅者的错误作为未捕获的异常重新抛出。

| 事件 | 通道 | 其他字段 | 何时 |
| --- | --- | --- | --- |
| `published` | `nestjs:outbox:published` | `transport`, `durationMs` | 传输器接受了消息 |
| `retry-scheduled` | `nestjs:outbox:retry-scheduled` | `transport`, `error`, `attempt`, `delayMs` | 发布失败并将重试 |
| `dead-lettered` | `nestjs:outbox:dead-lettered` | `transport`, `error`, `attempt`, `reason` | 消息已移至死信队列。请为此设置警报 |
| `lease-lost` | `nestjs:outbox:lease-lost` | 无 | 在发布过程中有另一个中继接管了消息，因此可能会发布两次 |

死信的 `reason` 是 `exhausted`（重试用尽）或 `rejected`（发生 `NonRetryableMessageError`，或 `retryIf` 返回了 `false`）。

##### 错误

它们都没有携带 HTTP 状态。`OutboxError` 是该包抛出的四个错误的基类。

| 错误 | 发生时 |
| --- | --- |
| `OutboxTransactionRequiredError` | `add()` 或 `processInTransaction()` 未获得事务句柄，或存储拒绝了一个非事务的句柄 |
| `OutboxPublishTimeoutError` | 发布超出了 `relay.publishTimeout`（`timeoutMs`）。计为失败尝试 |
| `OutboxNoHandlerError` | 在此进程中没有针对该主题的 `@OnOutboxMessage()` 处理器（`topic`）。已重试 |
| `OutboxSchemaError` | 在 `migrate` 关闭时，存储的模式落后于包的迁移，或应用迁移失败（`cause`）：直到修复，启动和每次调用都会失败。使用 `schema` 时，其 `version` 和 `requiredVersion`。来自 `@nestjs/outbox/postgres` 和 `@nestjs/outbox/mysql` |
| `NonRetryableMessageError` | 您从处理器或传输器抛出错误，以不重试的方式将消息发送到死信队列 |