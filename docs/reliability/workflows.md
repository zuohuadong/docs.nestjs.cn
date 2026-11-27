<!-- 此文件从 content/reliability/workflows.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T01:23:39.374Z -->
<!-- 源文件: content/reliability/workflows.md -->
<!-- 源哈希: 6f1e6d09d80469131934ea1386830c76 -->

### 持久化工作流

`@nestjs/workflows` 运行需要数天才能完成的进程，例如订单履行，作为一个 `async` 方法，其步骤保存在您的数据库中并能存活重启。

一些业务流程需要数天时间并跨越多个系统。在一个猫粮和用品的在线商店中，履行一个订单意味着：

1. 使用支付提供者向客户的卡收费。
2. 在仓库中预留商品。
3. 等待承运商的 `shipment.delivered` webhook，最长等待 3 天。
4. 如果未收到，或者承运商将包裹退回，则退款并释放库存。否则，等待 7 天并请求客户进行评论。

该流程必须能存活部署和崩溃，精确收费一次，在失败时撤销其工作，并告知支持人员每个订单的状态。使用 `@nestjs/workflows`，您可以在可注入的类上将其编写为一个 `async` 方法。每个副作用都在一个已记录的 **步骤** 中运行。重启后，该方法从顶部再次运行，已完成的步骤返回其记录的结果，而不是重复运行。等待和休眠会将实例停放在您自己的数据库中，任何主机上的任何进程在到期时都可以拾取它。没有工作流服务器需要运行。

#### 工作流、队列还是 Saga？

Nest 已经有两个用于稍后执行工作的工具，并且每种工具都适合其特定任务：

- **[BullMQ](/techniques/queues#bullmq-installation)** 每次只运行一个单元的后台工作，例如发送电子邮件或转码视频，具有并发限制、速率限制、优先级以及延迟或可重复的任务。一个具有单个延迟操作（“如果在一小时内未付款则取消订单”）的进程，就是一个延迟任务加上一个状态列。
- **[CQRS sagas](/recipes/cqrs#sagas)** 将事件在单个进程内转换为命令。它们适用于重启时丢失飞行中状态是可以接受的反应场景。在不能接受这种情况时，相同的事件可以启动和信号化工作流：参见 [With CQRS](/reliability/workflows#with-cqrs)。
- **工作流** 适用于具有多个步骤的流程，这些步骤需要等待数小时或数天才能触发定时器或外部事件，必须存活重启和部署，并且在失败或取消时必须撤销已完成的步骤。它们有自己的并发限制、速率限制、优先级和调度，并且一个步骤仍可以将繁重的工作交给 BullMQ 队列。

工作流实例是您应用程序数据库中的一行记录，因此启动一个实例可以作为保存订单事务的一部分：将事务作为 `start()` 的 `transaction` 选项传递。订单及其履行要么一起提交，要么全部不提交。任务队列通过自己的连接（Redis 或 BullMQ 自己的 PostgreSQL 连接池）写入，因此保存订单和排队其任务是两次写入，两者之间崩溃会导致丢失一次。信号也是如此：一个 webhook 可以在一个事务中更新订单并唤醒其工作流。

下面的教程展示了队列和 Saga 的局限性：在持久化等待后继续执行的代码（[Sleep for a week, then ask for a review](/reliability/workflows#sleep-for-a-week-then-ask-for-a-review)）、事件与截止日期的竞争（[Wait for the delivery webhook](/reliability/workflows#wait-for-the-delivery-webhook)）以及能存活崩溃的补偿（[Let customer support cancel an order](/reliability/workflows#let-customer-support-cancel-an-order)）。

#### 安装

要开始使用，请安装所需的依赖项：

```bash
$ npm i --save @nestjs/workflows

```

该教程将其工作流保存在 PostgreSQL 中，使用包自身的存储，并通过 [`@nestjs/drizzle`](https://docs.nestjs.com/data/drizzle) 注册 Drizzle。[Keep workflows in your database](/reliability/workflows#keep-workflows-in-your-database) 还展示了使用 TypeORM 和包的 MySQL 存储。本页面的测试使用 [PGlite](https://pglite.dev)，因此不需要服务器。

订单存储在示例应用程序自己的表 `orders` 中。该教程使用内存中的模拟来代替支付提供者的 SDK（`PaymentProviderClient`）、库存表（`InventoryService`）和邮件提供者（`MailService`）。与真实系统一样，它们通过幂等性键去重请求。订单具有以下结构：

```typescript title="orders/order.ts"
export interface OrderItem {
  productId: string;
  quantity: number;
  /** Unit price in cents. */
  price: number;
}

/** How the carrier ships it. Express orders are fulfilled first. */
export type Shipping = 'standard' | 'express';

export type OrderStatus = 'placed' | 'delivered' | 'returned' | 'cancelled';

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  shipping: Shipping;
  /** In cents. */
  total: number;
  status: OrderStatus;
}

export class PlaceOrderDto {
  userId: string;
  items: OrderItem[];
  /** Default 'standard'. */
  shipping?: Shipping;
}

export interface FulfilmentResult {
  chargeId: string;
  trackingNumber: string;
}

```

##### 注册模块

在根模块中，紧邻 [`DrizzleModule`](https://docs.nestjs.com/data/drizzle)（该模块注册了 `@InjectDrizzle()` 注入的 Drizzle 数据库）导入 `WorkflowsModule` 一次。工作流类是普通的提供者，因此它们放在 `providers` 中，紧邻它们注入的服务。这就是完成的模块：工作流和它列出的控制器在接下来的部分中编写，第一个提供者是包的 PostgreSQL 存储，由 [Keep workflows in your database](/reliability/workflows#keep-workflows-in-your-database) 解释。

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { DrizzleModule, getDrizzleToken } from '@nestjs/drizzle';
import { WorkflowsModule, WorkflowStorage } from '@nestjs/workflows';
import { fromDrizzle, PostgresWorkflowStore } from '@nestjs/workflows/postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Database } from './database/drizzle.js';
import * as schema from './database/schema.js';
import { InventoryService } from './inventory/inventory.service.js';
import { InvoiceBatchWorkflow } from './invoices/invoice-batch.workflow.js';
import { InvoicesController } from './invoices/invoices.controller.js';
import { InvoicesService } from './invoices/invoices.service.js';
import { MailService } from './mail/mail.service.js';
import { OrderFulfilmentWorkflow } from './orders/order-fulfilment.workflow.js';
import { OrdersController } from './orders/orders.controller.js';
import { OrdersService } from './orders/orders.service.js';
import { PaymentProviderClient } from './payments/payment-provider.client.js';
import { PaymentsService } from './payments/payments.service.js';
import { CarrierWebhookController } from './shipping/carrier-webhook.controller.js';

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      // Drizzle on PostgreSQL: a pg pool on DATABASE_URL, closed after the worker handed its instances back
      useFactory: () => ({ drizzle, connection: process.env.DATABASE_URL!, schema }),
    }),
    WorkflowsModule.forRoot({
      worker: {
        concurrency: 10, // instances this process executes at once
        leaseDuration: '30s', // how long a crashed process keeps its instances
        shutdownTimeout: '10s', // how long a deploy waits for running steps
      },
    }),
  ],
  controllers: [OrdersController, CarrierWebhookController, InvoicesController],
  providers: [
    {
      // Instances and journals in your database, in a schema of their own (nest_workflows)
      provide: PostgresWorkflowStore,
      inject: [getDrizzleToken(), WorkflowStorage],
      useFactory: (db: Database, workflowStorage: WorkflowStorage) =>
        new PostgresWorkflowStore({ executor: fromDrizzle(db) }, workflowStorage),
    },
    OrdersService,
    PaymentProviderClient,
    PaymentsService,
    InventoryService,
    MailService,
    InvoicesService,
    OrderFulfilmentWorkflow,
    InvoiceBatchWorkflow,
  ],
})
export class AppModule {}

```

> info **提示** 教程直接读取 `process.env` 以保持简洁。在应用程序中，应通过带有验证模式的 [`@nestjs/config`](/application/configuration) 加载环境变量，这样缺失的 `DATABASE_URL` 会在启动时停止应用程序，并从工厂中的 `ConfigService` 读取它。

每个选项都是可选的：`WorkflowsModule.forRoot()` 保持原样工作。要从 `ConfigService` 读取它们，请使用带有工厂的 `forRootAsync()`，或使用实现 `WorkflowsOptionsFactory` 及其 `createWorkflowsOptions()` 方法的 `useClass` 类。

`worker` 在您的应用程序进程内部运行。它每秒轮询到期的实例，本地 `start()` 或 `signal()` 会立即唤醒它。它在租约下声明到期的实例，并每 `leaseDuration` 的三分之一续订一次租约。如果进程死亡，一旦租约过期，其实例就可以再次被声明。在仅应启动、信号和检查工作流的进程（如 API pod）上设置 `worker: false`。一个步骤默认有 3 次尝试，回退从 1 秒开始，递增至 5 分钟。这里的 `retry` 选项更改了该默认值。

在 `main.ts` 中，启用关闭钩子。在 `SIGTERM` 时，工作进程停止声明，中止正在运行步骤的 `signal`，等待最长 `shutdownTimeout`，并将停止的实例交还给存储。然后另一个进程会立即拾取它们，而不是等待租约。

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // On SIGTERM, stop claiming work and hand running instances back.
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

##### 将工作流保留在数据库中

工作流实例、其日志、等待的信号和发送的信号都存储在**存储**中。在注册存储之前，模块将它们保存在内存中：对于首次运行是可行的，但重启会丢失所有正在运行的订单，并且两个进程无法共享它们。

> warning **警告** 如果使用 `NODE_ENV=production` 且未注册存储，除非设置了 `allowInMemoryStorage: true`，否则启动将失败。

在 PostgreSQL 上，请从 `@nestjs/workflows/postgres` 注册包的存储 `PostgresWorkflowStore`。它通过您的应用程序已有的数据库客户端运行 SQL，因此可以加入您的事务。它是一个普通的提供者，在根模块中注册一次，与 `WorkflowsModule` 并列：两者都是应用范围的。在上面的 `AppModule` 中，它是第一个提供者：一个工厂提供者，注入 Drizzle 数据库和 `WorkflowStorage` 注册表，存储就是向该注册表注册的。

`fromDrizzle(db)` 是存储的**执行器**：它通过您的 Drizzle 数据库运行存储的语句，无论使用哪个驱动，例如 `pg` 或 PGlite。`fromPg(pool)`、`fromTypeOrm(dataSource)`、`fromPrisma(prisma)` 和 `fromKysely(db)` 对 node-postgres 池、TypeORM、Prisma 和 Kysely 执行相同操作。在启动时，模块会记录 `WorkflowStorage: PostgresWorkflowStore`。

**模式。** 工作流没有需要创建的内容：没有表、实体或 Prisma 模型。存储将自己的模式中保留其表，`nest_workflows`（`schema` 选项指定了另一个名称），并自行创建和迁移它。在没有模式的 MySQL 上，它们是连接数据库的表，模式的名称作为其前缀：`nest_workflows_instances` 等等。

| 表 | 存储内容 |
| --- | --- |
| `nest_workflows.instances` | 每个工作流实例：其输入、状态、输出或错误、到期时间及其租约 |
| `nest_workflows.journal` | 每个实例记录的步骤、休眠、等待和补偿，以及其结果 |
| `nest_workflows.waits` | 悬挂实例等待的信号 |
| `nest_workflows.signals` | 发送的信号，直到 `purge()` 删除不再有实例可以接收的信号 |
| `nest_workflows.schedules` | 调度，包括其规范、状态和下一次运行时间 |
| `nest_workflows.rate_limits` | 每个工作流和键的速率限制窗口 |
| `nest_workflows.migrations` | 已应用的存储模式版本 |

它们属于存储：您的迁移不会创建它们，并且您的表不会与它们冲突。

**迁移。** 该包以版本化迁移的形式提供模式，存储自行应用它们。使用 `migrate` 选项时，它会在工作进程运行之前，在一个持有咨询锁的事务中，在启动时应用模式尚未拥有的迁移。在同时启动的多个进程中，一个进行迁移，其他进程发现没有剩余工作。`migrate` 默认为 `true`，但使用 `NODE_ENV=production` 除外。因此，在开发和测试中，存储在首次启动时创建其模式，而您的迁移仅创建您自己的表，参见此处 `orders`。

在生产环境中，请在应用程序的新版本启动之前应用迁移，就像您应用自己的迁移一样，以确保在启动过程中没有进程更改模式：在滚动部署过程中，这将锁定繁忙的表，而且最小权限的数据库用户也无法做到这一点。该包的命令行工具在您的部署步骤中执行此操作，与 `npx drizzle-kit migrate` 并列。它从 `DATABASE_URL` 或 `--url` 读取数据库，并且需要安装 `pg`：

```bash
$ npx @nestjs/workflows status
Schema "nest_workflows" is at version 0; this version of @nestjs/workflows needs version 1.
$ npx @nestjs/workflows migrate
Migrated schema "nest_workflows" to version 1 (applied 1).

```

`status` 在模式落后时以 1 退出，这使其成为 CI 的检查项。如果想使用您自己的迁移工具应用迁移，请从 `npx @nestjs/workflows sql` 或代码中的 `PostgresWorkflowStore.migrationSql()` 获取其 SQL：每个迁移的语句（每段一个），以及记录版本的簿记信息。像 TypeORM 和 Drizzle 的迁移器那样，在一个事务中运行它们。使用 TypeORM 时，这是您自己的迁移，与它为实体生成的迁移并列：

```typescript title="typeorm/migrations/1790801342207-WorkflowStore.ts"
import { PostgresWorkflowStore } from '@nestjs/workflows/postgres';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkflowStore1790801342207 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(PostgresWorkflowStore.migrationSql());
  }

  async down(): Promise<void> {
    throw new Error('The workflow store has no down migrations.');
  }
}

```

使用 drizzle-kit 创建自定义迁移，并用 SQL 填充它创建的文件，语句之间有一个 `--> statement-breakpoint` 行：Drizzle 的迁移器然后逐个运行它们，PGlite 需要这样做。在代码中，`migrationSql()` 配合 `statementBreakpoints: true` 返回相同的结果。

```bash
$ npx drizzle-kit generate --custom --name=workflows
$ npx @nestjs/workflows sql --statement-breakpoints > drizzle/20261103120000_workflows/migration.sql

```

在 MySQL 上，`MySqlWorkflowStore.migrationStatements()` 按字符串逐个返回语句，而 TypeORM 迁移按调用逐个运行：

```typescript title="typeorm/mysql-migrations/1790801342207-WorkflowStore.ts"
for (const statement of MySqlWorkflowStore.migrationStatements()) {
  await queryRunner.query(statement);
}

```

关闭 `migrate` 后，模式落后的存储会以一个命名这三种方式的 `WorkflowSchemaError` 失败启动，并且在模式追上之前会以相同的方式失败每次调用，它会在没有重启的情况下注意到这一点。迁移只添加表、列和索引，因此在滚动部署期间，您应用程序的旧版本仍可在已迁移的模式上运行。没有回滚迁移。

**事务。** `start()` 和 `signal()` 将您的事务作为其 `transaction` 选项：使用 Drizzle，`tx` 传递其回调的 `db.transaction()`，如 [Start it with the order](/reliability/workflows#start-it-with-the-order) 所示。存储在该事务上运行其语句，因此它们与您的写入一起提交或回滚。它拒绝数据库本身，因为其语句会自行提交，并以一个说明要传递什么的 `TypeError` 来拒绝。对于其他执行器，请在 `BEGIN` 之后传递 node-postgres 客户端（而不是连接池）、TypeORM 的 `EntityManager`（来自 `dataSource.transaction()`）、Prisma 的交互式事务客户端或 Kysely 事务。

**隔离性。** 存储依赖于 READ COMMITTED，PostgreSQL 的默认隔离级别：其语句相互竞争，在更严格的级别下会因序列化错误而失败。在启动时，它会检查数据库的 `default_transaction_isolation`，如果更严格则失败。您的事务中的 `signal()` 也需要 READ COMMITTED 事务，否则其唤醒可能会错过在事务快照之后提交的等待：否则会以 `TypeError` 拒绝。

**使用 TypeORM。** `TypeOrmModule` 取代了 `DrizzleModule` 在 `AppModule` 中，存储通过 `fromTypeOrm()` 在它提供的 `DataSource` 上运行：

```typescript title="typeorm/app.module.ts"
{
  // Instances and journals in your database, in a schema of their own (nest_workflows)
  provide: PostgresWorkflowStore,
  inject: [DataSource, WorkflowStorage],
  useFactory: (dataSource: DataSource, workflowStorage: WorkflowStorage) =>
    new PostgresWorkflowStore({ executor: fromTypeOrm(dataSource) }, workflowStorage),
},

```

教程将 Drizzle 的 `tx` 传递给 `start()` 和 `signal()`，传递 `EntityManager`，该回调由 `dataSource.transaction()` 传递。存储拒绝 `dataSource.manager`，因为其写入会自行提交。这是订单服务的 `place()`（来自 [Start it with the order](/reliability/workflows#start-it-with-the-order)），使用 TypeORM：

```typescript title="typeorm/orders.service.ts"
return this.dataSource.transaction(async (manager) => {
  await manager.insert(OrderEntity, order);
  // Same transaction: the fulfilment exists if and only if the order does.
  const fulfilment = await this.workflowClient.start(OrderFulfilmentWorkflow, order, {
    id: fulfilmentId(order.id),
    transaction: manager,
  });
  return { ...order, fulfilment };
});

```

> info **提示** 使用 Prisma 时，将客户端传递给 `fromPrisma()`，并将事务客户端作为 `transaction` 传递，该回调由 `prisma.$transaction()` 传递。存储自身的事务最多等待 10 秒以获取连接，运行时间最长可达一分钟，长于 Prisma 的默认值：`fromPrisma()` 的第二个参数可以更改此行为，使用 `maxWait` 和 `timeout`。如果您的应用程序信号是突发性的，也应给其自身的事务更长的 `maxWait`，因为信号会相互排队。

**使用 MySQL。** 该包还为 MySQL 8.4 LTS 和 9.x 提供了存储，从 `@nestjs/workflows/mysql` 的 `MySqlWorkflowStore` 开始，具有同名的执行器。MariaDB 尚不支持：存储在启动时拒绝它。提供者相同，使用 MySQL 存储的类和执行器。这是使用 mysql2 池的 Drizzle 的 `AppModule`，其中 `mode: 'default'` 是 Drizzle 在 MySQL 上的模式设置：

```typescript title="mysql/app.module.ts"
import { fromDrizzle, MySqlWorkflowStore } from '@nestjs/workflows/mysql';
import { drizzle } from 'drizzle-orm/mysql2';

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      // Drizzle on MySQL: a mysql2 pool on DATABASE_URL (mysql://...), whose path names the database
      useFactory: () => ({ drizzle, connection: process.env.DATABASE_URL!, schema, mode: 'default' as const }),
    }),
    // ...
  ],
  providers: [
    {
      // Instances and journals in your database, in tables of their own (nest_workflows_*)
      provide: MySqlWorkflowStore,
      inject: [getDrizzleToken(), WorkflowStorage],
      useFactory: (db: Database, workflowStorage: WorkflowStorage) =>
        new MySqlWorkflowStore({ executor: fromDrizzle(db) }, workflowStorage),
    },
    // ...
  ],
})
export class AppModule {}

```

`fromMysql2(pool)`、`fromTypeOrm(dataSource)`、`fromPrisma(prisma)` 和 `fromKysely(db)` 对 mysql2 池、TypeORM、Prisma（通过 `@prisma/adapter-mariadb`）和 Kysely 执行相同操作。`start()` 和 `signal()` 采用与 PostgreSQL 相同的事务对象，以及使用 mysql2 后的连接。与 PostgreSQL 的不同之处在于：

- **表。** MySQL 在数据库内没有模式，因此存储将表保存在连接的数据库中，即 URL 路径命名的数据库，`schema` 选项是这些名称的前缀：`nest_workflows_instances`、`nest_workflows_signals` 等，紧邻 `nest_workflows_migrations` 和 `nest_workflows_locks`，后者保存其版本和锁。
- **有界键。** ID、名称和键是有限长度的索引列。实例 ID、工作流或信号名称、信号的 `key` 和 `id`、并发或速率限制键长度为 255 个字符，调度 ID 为 230，步骤、睡眠或等待名称为 512。`start()` 和 `signal()` 在写入任何内容之前会拒绝更长的键，使用 `RangeError` 进行检查。键仍然精确比较，与 PostgreSQL 一致。
- **您的事务。** `start()` 和 `signal()` 使用 `transaction` 选项在 REPEATABLE READ（MySQL 的默认设置）和 READ COMMITTED 下工作：唤醒时会使用锁定读取来读取等待，该读取也会看到您的事务快照之后提交的更改。应避免 SERIALIZABLE，因为 MySQL 会将普通读取转换为锁定读取：在这种事务中，一个 `start()` 会一直持有所有信号直到事务结束。
- **死锁。** MySQL 通过回滚其中一个事务来打破死锁，错误代码为 1213（`ER_LOCK_DEADLOCK`）。存储会重新运行其自身的事务。在您的代码中，回滚也会包含您的写入，因此错误会到达您的代码：重新运行事务。一个先写入订单再发出信号的事务，与另一个先发出信号再写入同一订单的事务会以这种方式死锁。
- **迁移。** MySQL 会单独提交每个 DDL 语句，因此迁移不能在一个事务中运行。存储和 `npx @nestjs/workflows migrate` 逐个语句在锁（`GET_LOCK()`）下应用它们，因此同时启动的进程仍然只迁移一次，并且中断的运行可以从停止的地方恢复。命令行接收一个 `mysql://` URL，然后需要 `mysql2`，而 `npx @nestjs/workflows sql --dialect mysql` 打印 SQL。使用您自己的工具时，按顺序、每次调用一次地应用语句，就像上面的 TypeORM 迁移一样：对于 drizzle-kit，其 MySQL 迁移器每次断点发送一个语句，请添加 `--statement-breakpoints`。

对于其他数据库，编写您自己的存储：[The store contract](/reliability/workflows#the-store-contract) 说明了必须做什么。

#### 编写工作流

每个副作用都需要一个幂等性键。一个步骤会**至少运行一次**：如果流程在支付提供者已向卡收费但结果尚未到达日志之前死亡，则该步骤会再次运行。引擎为每个步骤提供一个在尝试和进程间保持不变的 `idempotencyKey`（`<instance id>:<step name>`）。将其传递给您调用的系统，该副作用只发生一次：

```typescript title="payments/payments.service.ts"
import { Injectable } from '@nestjs/common';
import { NonRetryableStepError } from '@nestjs/workflows';
import type { Order } from '../orders/order.js';
import { PaymentProviderClient } from './payment-provider.client.js';

export interface Charge {
  chargeId: string;
  amount: number;
}

@Injectable()
export class PaymentsService {
  constructor(private readonly paymentProviderClient: PaymentProviderClient) {}

  async charge(order: Order, idempotencyKey: string): Promise<Charge> {
    // The payment provider answers a repeated Idempotency-Key with the first response,
    // so a retried step never charges the card twice.
    const charge = await this.paymentProviderClient.createCharge(
      { amount: order.total, currency: 'USD', reference: order.id },
      { idempotencyKey },
    );
    if (charge.status === 'declined') {
      // Retrying won't help. Fail the step now.
      throw new NonRetryableStepError(`The payment provider declined the card for order ${order.id}.`);
    }
    return { chargeId: charge.id, amount: charge.amount };
  }

  async refund(chargeId: string, idempotencyKey: string): Promise<void> {
    await this.paymentProviderClient.createRefund({ chargeId }, { idempotencyKey });
  }
}

```

`InventoryService.reserve()` 在没有外部 API 的情况下遵循相同的思想：它使用该键作为预留的主键，因此重试会找到它已经创建的预留。当产品缺货时，它抛出 `NonRetryableStepError`。`MailService` 将该键作为消息 ID 传递给邮件提供者。

现在是工作流。使用 `@Workflow()` 装饰一个类，为其命名，并实现 `run()`：

```typescript title="orders/order-fulfilment.workflow.ts"
import { Workflow, type WorkflowContext, type WorkflowRunner } from '@nestjs/workflows';
import { InventoryService } from '../inventory/inventory.service.js';
import { MailService } from '../mail/mail.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { shipmentDelivered } from '../shipping/carrier-event.js';
import type { FulfilmentResult, Order } from './order.js';

/** One fulfilment per order: the order id is the workflow instance id. */
export const fulfilmentId = (orderId: string) => `order-${orderId}`;

@Workflow('order-fulfilment')
export class OrderFulfilmentWorkflow implements WorkflowRunner<Order, FulfilmentResult> {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly inventoryService: InventoryService,
    private readonly mailService: MailService,
  ) {}

  async run(ctx: WorkflowContext, order: Order): Promise<FulfilmentResult> {
    const charge = await ctx.step(
      'charge-payment',
      ({ idempotencyKey }) => this.paymentsService.charge(order, idempotencyKey),
      {
        retry: { attempts: 5, backoff: { delay: '2s' } },
        compensate: (charge, { idempotencyKey }) => this.paymentsService.refund(charge.chargeId, idempotencyKey),
      },
    );

    await ctx.step(
      'reserve-stock',
      ({ idempotencyKey }) => this.inventoryService.reserve(order.items, idempotencyKey),
      { compensate: ({ reservationId }) => this.inventoryService.release(reservationId) },
    );

    // ...the delivery wait and the review request continue here
  }
}

```

`ctx.step()` 运行函数一次并将结果写入日志。每当实例再次运行时（在等待、睡眠或崩溃后），`run()` 从顶部开始，并且 `charge-payment` 返回已记录的收费，而无需调用支付提供者。结果必须是 JSON 可序列化的，并且它们以 JSON 形式返回，即使在第一次运行时也是如此：一个 `Date` 是一个字符串。返回类型说明了这一点（`Journaled<Charge>`），因此 TypeScript 会标记将已记录值视为实时对象的代码。

- **`retry`**：`attempts` 也计算第一次尝试，并且 `backoff` 在每次重试前设置等待时间：一个 `delay`、一个增长 `factor`、一个 `maxDelay` 上限和可选的 `jitter`。一个数字是尝试次数的简写，而 `false` 表示单次尝试。一次失败的尝试会暂停实例，直到退避时间过去，因此重试也能存活重启。一个 `NonRetryableStepError`，例如被拒绝的卡，会立即使步骤失败。
- **`compensate`**：在步骤完成时注册。如果工作流稍后失败或被取消，已完成步骤的补偿将按相反顺序运行。每个补偿都会被记录并像步骤一样重试，拥有自己的幂等性键。如果 `reserve-stock` 因为缺货而失败，则会退还费用。[Sleep for a week, then ask for a review](/reliability/workflows#sleep-for-a-week-then-ask-for-a-review) 展示了订单交付后如何结束此流程。

步骤也可以并行运行。要单独预留每个项目，为每个项目启动一个步骤并等待它们一起完成。每个步骤都有自己的名称，其中包含项目的索引，因此也有自己的幂等性键和补偿：

```typescript title="orders/order-fulfilment.workflow.ts"
// One step per item, all at once: each reserves its item under its own key, and
// releases it if the order is undone.
await Promise.all(
  order.items.map((item, i) =>
    ctx.step(
      `reserve-item-${i}`,
      ({ idempotencyKey }) => this.inventoryService.reserve([item], idempotencyKey),
      { compensate: ({ reservationId }) => this.inventoryService.release(reservationId) },
    ),
  ),
);

```

如果一个项目缺货，其步骤失败，其他步骤完成，并且已完成步骤的补偿会运行：预留被释放，然后退还费用。补偿按 `ctx.step()` 调用的相反顺序运行，无论哪个步骤最先完成。教程的其余部分保留了单个 `reserve-stock` 步骤。

该类是每个正在运行的订单共享的单例，构造函数注入按惯例工作。将每订单状态保存在局部变量中，绝不要保存在 `this` 上。

#### 启动工作流

##### 使用订单启动

订单及其履行属于一起：一个没有被任何东西履行的订单，和一笔为从未保存的订单收费的履行一样糟糕。因此 `OrdersService` 在一个 Drizzle 事务中保存订单并启动工作流。`WorkflowClient` 启动实例；将事务的 `tx` 传递给它：

```typescript title="orders/orders.service.ts"
import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { WorkflowClient } from '@nestjs/workflows';
import { eq } from 'drizzle-orm';
import type { Database } from '../database/drizzle.js';
import { orders } from '../database/schema.js';
import { fulfilmentId, OrderFulfilmentWorkflow } from './order-fulfilment.workflow.js';
import type { Order, PlaceOrderDto } from './order.js';

@Injectable()
export class OrdersService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly workflowClient: WorkflowClient,
  ) {}

  async place(dto: PlaceOrderDto) {
    const total = dto.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const order: Order = {
      id: randomUUID().slice(0, 8),
      userId: dto.userId,
      items: dto.items,
      shipping: dto.shipping ?? 'standard',
      total,
      status: 'placed',
    };

    return this.db.transaction(async (tx) => {
      await tx.insert(orders).values(order);
      // Same transaction: the fulfilment exists if and only if the order does.
      const fulfilment = await this.workflowClient.start(OrderFulfilmentWorkflow, order, {
        id: fulfilmentId(order.id),
        transaction: tx,
      });
      return { ...order, fulfilment };
    });
  }

  async findOne(id: string): Promise<Order> {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, id));
    if (!order) {
      throw new NotFoundException(`Order ${id} not found.`);
    }
    return order;
  }

  // ...markDelivered() is added in the next section
}

```

使用 `transaction`，存储通过您的 ORM 传递给回调的事务创建实例，因此它与订单一起提交，如果回调中任何后续内容失败，则与订单一起回滚。工作进程只看到已提交的实例：它在提交后的下一次轮询中拾取此实例。传递事务，而不是数据库，因为存储拒绝这样做：`start()` 在没有该选项的情况下自行写入，这就是该选项移除的双写。使用 TypeORM 时，传递事务的 `EntityManager`；使用 Prisma 时，如 [Keep workflows in your database](/reliability/workflows#keep-workflows-in-your-database) 所示，传递事务客户端。

实例 ID 来自订单 ID，这使得 `start()` 具有幂等性。使用相同的 ID 和相同的输入启动时，会返回现有实例（`created: false`），而不同的输入则抛出 `WorkflowIdConflictError`。一个协调任务可以再次调用它，而不会重复收费。

##### 报告其状态

控制器放置订单并报告其履行状态：

```typescript title="orders/orders.controller.ts"
import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { WorkflowClient } from '@nestjs/workflows';
import { fulfilmentId } from './order-fulfilment.workflow.js';
import { PlaceOrderDto } from './order.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly workflowClient: WorkflowClient,
  ) {}

  @Post()
  place(@Body() dto: PlaceOrderDto) {
    return this.ordersService.place(dto);
  }

  @Get(':id/fulfilment')
  async fulfilment(@Param('id') id: string) {
    const instance = await this.workflowClient.getStatus(fulfilmentId(id), { journal: true });
    if (!instance) {
      throw new NotFoundException(`Order ${id} not found.`);
    }
    return {
      status: instance.status,
      stage: instance.customStatus,
      waitingFor: instance.waits.map((wait) => wait.signal),
      wakeAt: instance.wakeAt === null ? null : new Date(instance.wakeAt).toISOString(),
      steps: Object.fromEntries(instance.journal.map((entry) => [entry.name, entry.status])),
      error: instance.error?.message ?? null,
    };
  }

  // ...cancel() is added for customer support, below
}

```

`getStatus()` 返回实例：其 `status`、`wakeAt`、它 `waits` 的信号、其 `error` 或 `output`，以及在有 `journal` 选项时，每一步。状态包括 `pending`、`running`、`suspended`、`compensating`、`completed`、`failed`、`cancelled` 和 `compensation_failed`；[What each status means](/reliability/workflows#what-each-status-means) 解释了每个状态的含义以及应如何处理。该端点将实例映射到一个小的视图。不要向客户返回原始实例，因为它包含输入和租赁详情。

`stage` 来自工作流。`ctx.setStatus()` 设置实例的**自定义状态**，这是一个最多 16 KiB 的 JSON 值，由 `getStatus()` 和 `list()` 作为 `customStatus` 返回：这里是关于订单状态的描述。在订单推进时在 `run()` 中设置它，在承运商交付后在 `delivered` 中设置（在 [Sleep for a week, then ask for a review](/reliability/workflows#sleep-for-a-week-then-ask-for-a-review) 中）：

```typescript title="orders/order-fulfilment.workflow.ts"
const charge = await ctx.step(
  'charge-payment',
  // ...the charge, as above
);
ctx.setStatus('paid');

await ctx.step(
  'reserve-stock',
  // ...the reservation, as above
);
ctx.setStatus('awaiting-delivery');

```

状态不会被记录到日志中。每次执行都会重放 `run()`，以及其中的 `setStatus()` 调用，因此每次执行在过程中都会再次设置状态，循环中设置的状态不会增加日志。工作流从不回读它，因此它做出的任何决定都不依赖于它。它与实例的下一次写入一起写入：当下一步开始时、当实例停靠时或当它结束时。因此，端点显示 `paid`，而 `reserve-stock` 等待重试，实例停靠后显示 `awaiting-delivery`。工作流不再更改的状态会保持，例如已取消订单上的 `awaiting-delivery`：`status` 说明了发生了什么。非 JSON 值或 JSON 大于 16 KiB 的值会用 `TypeError` 失败实例，而 `undefined` 会清除状态。每次写入的变更都会作为一个 `custom-status` 事件发出。

#### 等待信号和定时器

##### 等待交付 Webhook

接下来，工作流等待承运商。Webhook 和工作流共享一个信号：一个名称及其有效载荷的类型，只定义一次，这样任何一方都不能拼错名称或发送错误的形状：

```typescript title="shipping/carrier-event.ts"
import { WorkflowSignal } from '@nestjs/workflows';

/** The body the carrier POSTs to our webhook. */
export interface CarrierEvent {
  type: 'shipment.in_transit' | 'shipment.delivered' | 'shipment.returned';
  /** The store's order id. */
  reference: string;
  trackingNumber: string;
  occurredAt: string;
}

/** Sent by the webhook, awaited by the fulfilment workflow. The order id is its key. */
export const shipmentDelivered = new WorkflowSignal<CarrierEvent>('shipment.delivered');

```

在 `reserve-stock` 之后将此添加到 `run()`：

```typescript title="orders/order-fulfilment.workflow.ts"
const delivery = await ctx.waitForSignal('await-delivery', shipmentDelivered, {
  key: order.id,
  timeout: '3d',
});
if (!delivery) {
  ctx.fail(`Order ${order.id} was not delivered within 3 days.`);
}

```

`waitForSignal()` 记录等待并停靠实例：其状态变为 `suspended`，而 `wakeAt` 是截止日期。对于这 3 天，不保留任何内存、定时器或工作进程。它使用信号的有效载荷解析，类型为 `CarrierEvent`，或者在超时后使用 `null`。然后 `ctx.fail()` 失败实例，补偿操作反向运行：释放库存，然后退还费用。一个 `match` 选项根据有效载荷进一步过滤信号，例如 `match: (event) => event.trackingNumber !== ''`；它在每次重放时都运行，因此它必须是有效载荷的纯函数。

Webhook 将订单标记为已交付并发送信号。这两件事在一个新的 `OrdersService.markDelivered()` 方法中，在一个事务中，因此订单状态和信号一起提交。添加它以及信号的导入：

```typescript title="orders/orders.service.ts"
import { shipmentDelivered, type CarrierEvent } from '../shipping/carrier-event.js';

async markDelivered(event: CarrierEvent): Promise<void> {
  await this.db.transaction(async (tx) => {
    const updated = await tx
      .update(orders)
      .set({ status: 'delivered' })
      .where(eq(orders.id, event.reference))
      .returning({ id: orders.id });
    if (updated.length === 0) {
      throw new NotFoundException(`Order ${event.reference} not found.`);
    }
    // The order's new status and the signal commit together.
    await this.workflowClient.signal(shipmentDelivered, event, { key: event.reference, transaction: tx });
  });
}

```

控制器验证回调并将其移交：

```typescript title="shipping/carrier-webhook.controller.ts"
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service.js';
import type { CarrierEvent } from './carrier-event.js';

@Controller('webhooks/carrier')
export class CarrierWebhookController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @HttpCode(200)
  async handle(@Body() event: CarrierEvent) {
    // Verify the carrier's signature header before trusting the body.
    if (event.type === 'shipment.delivered') {
      await this.ordersService.markDelivered(event);
    }
    return { received: true };
  }
}

```

`signal()` 存储信号，带有关联 `key`，并唤醒等待该信号和键的实例。键完全匹配，因此订单 ID 保持一个订单的交付不会唤醒另一个订单，没有键的等待只接收没有键发送的信号。信号是持久的。在工作流到达等待之前到达的 Webhook 仍然有效，并且每个实例最多只消费一次信号，因此承运商的重试是无害的。除非您传递了 `id`，例如跟踪号码，否则它们仍然分别存储一个信号：具有相同名称和 `id` 的信号只存储一次，重复的返回第一个的 `signalId` 带有 `created: false`。在截止日期后记录的交付会输给超时，即使在截止日期过去时没有工作进程运行。

控制器仅在事务提交后才回答 `200`。对于商店不知道的订单的交付会与 `404` 一起回滚，不留下任何信号，如果数据库失败，承运商会收到错误并再次交付 Webhook。在事务中发送的信号会依次排队直到结束，因此请保持此类事务简短。在 PostgreSQL 上，事务必须使用默认的 READ COMMITTED 隔离级别；商店拒绝更严格的级别，因为这可能会错过在它运行时注册的等待。在 MySQL 上，默认的 REPEATABLE READ 也可以正常工作。

##### 等待先到达的那个

承运商不总是交付。当它无法交付时，会将包裹退回仓库并报告 `shipment.returned`。声明第二个信号，紧随第一个之后：

```typescript title="shipping/carrier-event.ts"
/** Sent by the webhook when the carrier brings the parcel back to the warehouse. The order id is its key. */
export const shipmentReturned = new WorkflowSignal<CarrierEvent>('shipment.returned');

```

Webhook 在发送交付时也发送它。一个新的 `OrdersService.markReturned()` 将订单状态设置为 `returned` 并在一个事务中发送信号，如 `markDelivered()`：

```typescript title="shipping/carrier-webhook.controller.ts"
if (event.type === 'shipment.returned') {
  await this.ordersService.markReturned(event);
}

```

工作流现在等待交付、退回或 3 天中先到达的那个。用 `ctx.waitForAny()` 替换 `waitForSignal()` 调用：

```typescript title="orders/order-fulfilment.workflow.ts"
const outcome = await ctx.waitForAny('await-delivery', {
  delivered: ctx.signalWait(shipmentDelivered, { key: order.id }),
  returned: ctx.signalWait(shipmentReturned, { key: order.id }),
  timedOut: ctx.timer('3d'),
});
if (outcome.key === 'returned') {
  ctx.fail(`The carrier returned order ${order.id} to the warehouse.`);
}
if (outcome.key === 'timedOut') {
  ctx.fail(`Order ${order.id} was not delivered within 3 days.`);
}
const delivery = outcome.value;

```

`ctx.signalWait()` 和 `ctx.timer()` 仅描述一个条件，而 `waitForAny()` 等待它们一起发生。它只停靠一次实例，等待的每个信号和最早的截止日期，并使用先发生的条件的 `key` 和其 `value` 解析：一个信号的有效载荷，或定时器的 `null`。检查 `key` 缩小了 `value`，因此在两次检查后 `delivery` 是一个 `CarrierEvent`。退回的包裹会失败实例，补偿操作释放库存（库存已返回仓库）并退还费用。状态端点的 `waitingFor` 列出了实例等待期间的两个信号。

结果作为等待名称下的一个条目被记录到日志中，因此每次后续执行都会得到相同的获胜者。当多个条件同时准备好时，首先记录的信号获胜，无论它匹配了哪个条件。在定时器截止日期后发送的信号不计入，如 `waitForSignal()` 的 `timeout` 所示，并且定时器从首次到达等待时开始计时。只采纳获胜的信号：在交付后报告的退回将保留到同一实例的后续等待。如果想等待多个信号中的所有信号，请使用带有 `Promise.all()` 的多个 `waitForSignal()` 调用：每个信号都单独记录到日志中，实例为此所有信号只停靠一次。子工作流也可以是一个条件，如 [Start child workflows](/reliability/workflows#start-child-workflows) 所示。

##### 睡眠一周后请求审核

使用不可逆点、持久化定时器和最后一步完成 `run()`：

```typescript title="orders/order-fulfilment.workflow.ts"
// Point of no return: the parcel arrived, so nothing from here on refunds
// the charge or releases the stock, not a failure and not a cancel.
ctx.commit('delivered');
ctx.setStatus('delivered');

await ctx.sleep('before-review-request', '7d');
await ctx.step('send-review-request', ({ idempotencyKey }) =>
  this.mailService.sendReviewRequest(order, idempotencyKey),
);

return { chargeId: charge.chargeId, trackingNumber: delivery.trackingNumber };

```

`ctx.sleep()` 存储唤醒时间并挂起实例，类似于等待。7 天后，任何工作者都会恢复它：绝不会提前，通常在截止日期的轮询间隔内。恢复时，`run()` 从顶部重放：`charge-payment` 和 `await-delivery` 返回其已记录的值，因此 `charge` 和 `delivery` 在一周后处于作用域内。延迟任务无法提供这种连续性。如果想睡眠到特定时间点，请传递一个包含 `until`、一个 `Date` 或从 `ctx.now()` 等已记录值计算出的纪元毫秒的对象。

`ctx.commit()` 标记了不可逆点。一旦包裹交付，退款费用就是错误的，无论接下来发生什么。`commit()` 丢弃了迄今为止注册的补偿。如果审核邮件随后永久失败，实例将以带有步骤错误的 `failed` 结束，不会退款或释放任何内容。在此点之后取消也不会撤销任何操作。只有在 `commit()` 之后的步骤才会注册仍可运行的补偿。提交点会根据其名称进行记录，因此它像一个步骤一样重放，状态端点将其列为 `delivered`。

##### 超时整个工作流

等待的 `timeout` 限制一个等待，步骤的 `timeout` 限制一次尝试。要限制整个实例，请为工作流设置运行超时：

```typescript
@Workflow('order-fulfilment', { timeout: '30d' })

```

截止日期是实例开始时间加上超时时间，作为实例的 `deadline` 存储在实例中，因此它在重启和部署中保持有效，即使其睡眠或等待会更晚结束，挂起的实例也会为此唤醒。一旦超过，实例将在其下一个 `ctx` 调用处停止（正在运行的步骤会先完成），其补偿运行，并以带有 `WorkflowTimeoutError` 的 `failed` 结束。补偿不受截止日期限制。这里等待在 3 天后放弃，睡眠需要 7 天，所以 30 天是一个安全网。`start()` 也接受一个 `timeout` 选项，该选项会覆盖该实例的装饰器设置。

#### 取消和操作工作流

##### 允许客户支持取消订单

向 `OrdersController` 添加一个 `cancel()` 路由，并将其 `ConflictException` 和 `HttpCode` 添加到其 `@nestjs/common` 导入中。`OrdersService.markCancelled()` 设置订单状态：

```typescript title="orders/orders.controller.ts"
// Customer support only: protect it with your staff guard.
@Post(':id/cancel')
@HttpCode(202)
async cancel(@Param('id') id: string, @Body('reason') reason: string) {
  const order = await this.ordersService.findOne(id);
  if (order.status === 'delivered') {
    throw new ConflictException(`Order ${id} was delivered. Start a return instead.`);
  }
  // accepted is false if the fulfilment already ended or was already cancelled.
  const { accepted } = await this.workflowClient.cancel(fulfilmentId(id), reason);
  if (accepted) {
    await this.ordersService.markCancelled(id);
  }
  return { accepted };
}

```

`cancel()` 设置一个标志。挂起的实例会立即唤醒。正在运行的实例会允许其当前步骤完成，并在其下一个 `ctx` 调用处停止。（另一个进程中正在运行的实例会在其下一次租约续订时在 `leaseDuration` 的三分之一内注意到该标志。）无论哪种情况，已完成步骤的补偿都会反向运行，实例将以带有原因作为其错误消息的 `cancelled` 结束。`cancel()` 返回带有 `accepted` 标志的实例。当实例已经完成或失败时、正在补偿失败时，或已请求取消或终止时，它就是 `false`。第二次取消不会改变任何内容，并保留第一个原因。

一旦承运商报告了交付，该路由会回答 `409`，因为支持部门应该开始退货而不是取消。工作流不依赖于该检查。在到达 `ctx.commit('delivered')` 之后的取消会停止审核请求且不退款。在消耗交付事件之前看到的取消仍会退款，因为它尚未达到不可逆点。

##### 每个状态的含义

实例的 `status` 说明了它正在做什么以及是否需要您：

| 状态 | 含义 | 操作 |
| --- | --- | --- |
| `pending` | 已启动，尚未被工作者认领。保持 `pending` 的实例会等待并发槽位或速率限制窗口中的空间，或者属于未被任何运行工作者注册的版本 | 限制生效期间不操作。否则，部署具有该版本的工作者，或删除实例 |
| `running` | 工作者持有租约并执行它 | 不操作。`cancel()` 在其下一个 `ctx` 调用处停止它，`terminate()` 不进行补偿 |
| `suspended` | 挂起在睡眠、等待或重试退避期间，直到 `wakeAt` 或信号 | 不操作。信号或 `cancel()` 会唤醒它 |
| `compensating` | 在失败或取消后撤销已完成的步骤 | 不操作：它以 `failed`、`cancelled` 或 `compensation_failed` 结束。`terminate()` 停止撤销 |
| `completed` | 完成，结果为 `run()` 的 `output` | 不操作，直到保留策略清除它 |
| `cancelled` | 已取消，在补偿运行后，或未运行补偿终止（`error.name` 是 `WorkflowTerminatedError`）。`error.message` 是原因 | 不操作，直到保留策略清除它 |
| `failed` | 步骤放弃，调用了 `ctx.fail()`，运行超时已过或日志达到限制，然后运行了其补偿。或者定义错误，例如破坏重放的部署，未进行补偿而失败 | 如果未运行补偿，请修复原因并重试。否则已完成：其已完成的步骤已被撤销 |
| `compensation_failed` | 撤销在中间放弃。`error` 是原始失败，补偿自身的错误为 `error.compensation` | 修复原因，例如停机仓库 API，并重试。或者手动完成撤销并删除实例 |

##### 重试、删除或终止

`WorkflowClient` 对表的最后一列有操作。从仅限员工的路由或脚本调用它们：

```typescript
await this.workflowClient.retry(fulfilmentId(orderId));
await this.workflowClient.delete(fulfilmentId(orderId));
await this.workflowClient.terminate(fulfilmentId(orderId), 'Refunded by hand after a chargeback.');

```

- **`retry()`** 从其日志再次运行一个 `failed` 实例：已完成的步骤返回其结果，放弃的步骤恢复其尝试次数，然后休眠等待遗留的实例重新开始。部署中断重放的部署在修复的代码运行后重试一次。它拒绝了已运行补偿的实例，因为恢复将建立在已撤销的工作之上：而是启动一个新实例。超过运行超时的实例需要一个新的实例，使用 `timeout` 选项（从现在开始计数），或使用 `false` 表示无。一个 `compensation_failed` 实例会再次运行未完成的补偿，每次都恢复其尝试次数，并以其本应完成的方式结束：`failed` 或 `cancelled`。
- **`delete()`** 移除一个已完成的实例及其日志。未完成的实例需要 `force` 选项，并且不会运行其补偿：适用于任何工作进程无法再运行的实例，例如不再部署的某个版本的实例。
- **`cancel()`** 如上所述，停止一个仍在运行的实例，并运行其补偿。
- **`terminate()`** 停止一个不运行其补偿的实例，适用于其撤销不应或不能运行的实例，例如订单支持已手动退款的订单。一个停放的实例立即停止，一个正在运行的实例在下一次 `ctx` 调用时停止，一个正在补偿的实例在它正在运行的补偿后停止。它以 `cancelled` 结束，带有一个 `WorkflowTerminatedError`，其消息是原因（没有原因时是 `Terminated.`）。它在 `cancel()` 后被接受，然后被替换，在 `cancel()` 后被拒绝。其子实例获得其 `parentClose`，如同任何结束一样。

`retry()` 和 `delete()` 抛出一个 `WorkflowStateError`，其 `status` 是 `409`，用于它们没有意义的状态，并且当另一个对实例的变更与它们竞争时。重试被记录为 `$retry:1`、`$retry:2` 等，记录了重试的状态和错误，并且两个操作都被发出，作为 `workflow-retried` 和 `workflow-deleted`。

##### 清理已完成的实例

已完成的实例及其日志会保留，直到您清除它们。`purge()` 根据其 `olderThan` 选项删除比该选项设定的时间更早完成的实例，每次删除一批，并且信号表示任何实例都不能再接收。一个实例只接收启动后发送的信号，因此一旦每个未完成的实例在信号后启动，并且该信号早于 `olderThan`，它就会被删除；最新的信号始终保留。`compensation_failed` 实例等待人员，因此仅在您在 `status` 选项中列出它们时才被清除。每天在应用程序的一个实例上运行它，使用 `@Cron()` 从 `@nestjs/schedule` 和 `@OnOneInstance()` 从 [`@nestjs/locks`](/reliability/locks)：

```typescript
@Injectable()
export class WorkflowRetentionJob {
  constructor(private readonly workflowClient: WorkflowClient) {}

  @Cron('30 3 * * *')
  @OnOneInstance({ key: 'workflows:purge' })
  async purge() {
    return this.workflowClient.purge({ olderThan: '30d' });
  }
}

```

`purge()` 返回删除的 `instances` 和 `signals` 数量，以及结束的速率限制窗口（`rateLimits`）。信号的 `id` 在信号存储期间有效，因此应将 `olderThan` 设置得比任何发送者的重传窗口更长，例如您的承运商的 Webhook 重试。

#### 限制、子实例和批量工作

##### 限制同时运行的数量

一个工作进程会运行其有空间的每一个应运行的实例。三个选项决定了跨每个工作进程运行什么以及运行的顺序：并发限制、速率限制和优先级。实现设置了前两个在 `@Workflow()` 中：

```typescript title="orders/order-fulfilment.workflow.ts"
@Workflow('order-fulfilment', {
  // One execution per customer at a time, so two of their orders never charge their card at once.
  concurrency: { limit: 1, key: (order: Order) => order.userId },
  // Each execution sends the payment provider one request at most: a charge, or a refund.
  rateLimit: { max: 10, duration: '1s' },
})

```

**并发性。** `concurrency` 限制同时运行的实例数量：工作流的 `limit`，或每个键的 `limit`，使用一个 `key` 函数，此处是客户的 id。一个数组包含其中一个。一个实例仅在执行运行时（包括补偿）占用一个槽位，而不是在休眠或等待时：限制保护了步骤调用的内容，而停放了数天的订单不会阻碍任何人。一个崩溃的过程在其租约过期后释放其槽位。超过限制的实例保持应运行状态并等待槽位，最超时的优先，并且会跳过一个完整的键，因此一个繁忙的客户永远不会阻碍另一个的订单。键在实例启动时从输入计算得出，而 `start()` 的 `concurrencyKey` 选项为具有键的工作流设置了另一个。

**速率限制。** `rateLimit` 限制每个窗口开始的执行次数：工作流的每个 `max` 窗口，或每个键，使用一个 `duration` 函数，该函数由 `key` 的 `start()` 选项覆盖。每次执行都会计数，包括第一次执行以及每次休眠、信号、重试退避或取消后的恢复，因为每次都可能调用受限制保护的内容。实现最多向支付提供者发送一次请求/执行，因此这限制了其请求，也限制了不发送请求的执行。一个窗口在上一个执行结束后开始，直到关闭，允许 `max` 次执行，因此两个连续的窗口可以在一个 `duration` 内允许两次 `max`。假设支付提供者每秒允许 20 个请求：允许 10 个。

**优先级。** `start()` 的 `priority` 选项决定了首先被获取的是什么：最低优先级，然后是最超时的。它是一个从 1 到 2,097,151 的整数，没有优先级的实例在所有有优先级的实例之前运行。特快订单优先：

```typescript title="orders/orders.service.ts"
const fulfilment = await this.workflowClient.start(OrderFulfilmentWorkflow, order, {
  id: fulfilmentId(order.id),
  transaction: tx,
  // Lower runs first: express orders before standard ones.
  priority: order.shipping === 'express' ? 1 : 2,
});

```

由于没有优先级的实例优先运行，一旦订单有优先级，其他工作就需要优先级才能在它们之后运行：发票批次的调度为其分配了 10，如 [Run workflows on a schedule](/reliability/workflows#run-workflows-on-a-schedule) 所示。一个实例在每次执行中保持其优先级，子实例继承其父实例的优先级。优先级是严格的：持续的特快订单流会阻碍标准订单。`@StartOn()` 采用相同的选项，如 [With CQRS](/reliability/workflows#with-cqrs) 所示。

限制来自工作流的最高注册版本，并应用于其所有版本，每个进程应用其运行代码的限制，因此应在所有地方部署更改。声明永远不会接受超过限制允许的，但可能会暂时接受更少：同时轮询的工作进程可以花费几次轮询来填满一个短窗口，并且同时具有并发键和速率限制键时，一个被一个键跳过的候选实例会等待下一个声明。声明还按优先级对应运行的实例进行排序，而 `wake_at` 上的索引不会提供此排序：当有少量实例应运行时成本较低，当积压量大时更明显。`drain()` 在没有剩余可启动的实例时停止。

##### 启动子工作流

发货流程：预订承运商的取件，如果订单取消则取消预订，然后等待交付或退回。这是一个独立的过程，有自己的步骤、重试和状态，因此应为其设置独立的工作流，并将其作为履约流程的**子**来运行：

```typescript title="shipping/shipment.workflow.ts"
import { Workflow, type WorkflowContext, type WorkflowRunner } from '@nestjs/workflows';
import type { Order } from '../orders/order.js';
import { shipmentDelivered, shipmentReturned, type CarrierEvent } from './carrier-event.js';
import { CarrierClient } from './carrier.client.js';

/** Books the carrier's pickup, and waits for the delivery: a child of the order's fulfilment. */
@Workflow('shipment')
export class ShipmentWorkflow implements WorkflowRunner<Order, CarrierEvent> {
  constructor(private readonly carrierClient: CarrierClient) {}

  async run(ctx: WorkflowContext, order: Order): Promise<CarrierEvent> {
    await ctx.step(
      'book-pickup',
      ({ idempotencyKey }) => this.carrierClient.bookPickup(order, idempotencyKey),
      { compensate: ({ pickupId }) => this.carrierClient.cancelPickup(pickupId) },
    );

    const outcome = await ctx.waitForAny('await-delivery', {
      delivered: ctx.signalWait(shipmentDelivered, { key: order.id }),
      returned: ctx.signalWait(shipmentReturned, { key: order.id }),
      timedOut: ctx.timer('3d'),
    });
    if (outcome.key === 'returned') {
      ctx.fail(`The carrier returned order ${order.id} to the warehouse.`);
    }
    if (outcome.key === 'timedOut') {
      ctx.fail(`Order ${order.id} was not delivered within 3 days.`);
    }
    return outcome.value;
  }
}

```

`CarrierClient` 是承运商预订 API 的替代项，与支付提供者一样，对重复的幂等性键响应第一次预订。在履约流程中，子流程替代了等待步骤：

```typescript title="orders/order-fulfilment.workflow.ts"
// Starts the shipment, and waits for it to end: its delivery, or a ChildWorkflowFailedError.
const delivery = await ctx.executeChild(ShipmentWorkflow, order);

```

将 `ShipmentWorkflow` 和 `CarrierClient` 注册为履约流程旁边的提供者。承运商的 Webhook 不变：它会指示订单 ID，此时发货成为等待该 ID 的实例。

- **`ctx.executeChild()`** 启动子流程并等待其结束。两者都被记录，如 `$child:<id>` 和 `$result:<id>`，因此重放会返回相同的子流程而不是启动另一个，同时履约流程暂停。`ctx.startChild()` 只启动它，并返回一个句柄：其 `result()` 等待子流程，而该句柄是 `waitForAny()` 的一个条件，用于将子流程与定时器或信号进行竞争。
- **ID。** 子流程的 ID 默认为其父流程的 ID、工作流的名称以及本次运行中该工作流的子流程计数，例如 `order-71e1973d/shipment#1`。为从并行分支启动的子流程提供一个源自您数据的 `id` 选项，以便重放（可能以不同顺序到达它们）能够找到每一个子流程。
- **失败。** 如果子流程失败、被取消或终止，`executeChild()` 会抛出一个 `ChildWorkflowFailedError`，其中包含其 `status` 和错误作为 `cause`。如果不捕获，它会像任何其他错误一样使履约流程失败：退回的包裹会使发货失败，发货的补偿会取消其预订，然后履约流程的补偿会退款并释放库存。捕获它以尝试其他操作，例如使用另一个承运商。
- **`parentClose`** 决定当其父流程结束或开始补偿时，仍在运行的子流程如何处理：`'cancel'`（默认）取消它，并运行其补偿；`'terminate'` 在不运行补偿的情况下停止它；`'abandon'` 保持其运行。当支持取消订单时，发货也会被取消，取件也会随发货被取消。
- 子流程继承其父流程的优先级，除非 `startChild()` 提供了优先级，并且像 `start()` 一样，接收 `concurrencyKey` 和 `rateLimitKey` 选项。`getStatus()` 带有 `children` 选项列出实例的子流程，每个子流程都有其 `parentId`，并且 `list()` 通过 `parentId` 进行分页。

##### 长运行步骤

一个步骤可以运行数小时。在运行期间，工作进程会在后台持续续订租约。对于长时间的批处理工作，请检查点进度，以防止崩溃从零重新启动任务。这里，一个月度的批处理会逐页渲染发票：

```typescript title="invoices/invoice-batch.workflow.ts"
import { Workflow, type WorkflowContext, type WorkflowRunner, type WorkflowStepContext } from '@nestjs/workflows';
import { InvoicesService } from './invoices.service.js';

interface Checkpoint {
  cursor: number | null;
  rendered: number;
}

@Workflow('invoice-batch')
export class InvoiceBatchWorkflow implements WorkflowRunner<{ month: string }, { rendered: number }> {
  constructor(private readonly invoicesService: InvoicesService) {}

  async run(ctx: WorkflowContext, { month }: { month: string }) {
    return ctx.step(
      'render-invoices',
      async ({ progress, heartbeat, signal }: WorkflowStepContext<Checkpoint>) => {
        // After a crash, the next attempt starts from the last checkpoint.
        let { cursor, rendered } = progress ?? { cursor: 0, rendered: 0 };
        while (cursor !== null) {
          const page = await this.invoicesService.renderPage(month, cursor, signal);
          cursor = page.nextCursor;
          rendered += page.rendered;
          await heartbeat({ cursor, rendered });
        }
        return { rendered };
      },
      { heartbeatTimeout: '2m' },
    );
  }
}

```

- `heartbeat(progress)` 将检查点写入日志。如果尝试失败，下一次尝试会将其作为 `progress` 接收。将参数标注为 `WorkflowStepContext<Checkpoint>` 会同时指定两者。正在处理的页面会再次渲染，因此 `renderPage()` 必须覆盖而不是追加。
- `heartbeatTimeout` 会失败一个停止调用 `heartbeat()` 的尝试，例如卡在挂起套接字的尝试，同时进程仍然存活。一个 `timeout` 选项限制了尝试的总持续时间。
- `signal` 在关闭、租约丢失和超时时被中止。将其传递给您的 I/O。

下方的调度会每月启动一次批处理。当工作属于独立的进程（例如 PDF 渲染器池）时，将其从步骤传递给一个 [BullMQ](/techniques/queues) 队列，并等待任务返回信号。任务 ID 是步骤的 `idempotencyKey`，因此重试的步骤不会将其排队两次：

```typescript
await ctx.step('enqueue-render', async ({ idempotencyKey }) => {
  await this.invoicesQueue.add('render', { month }, { jobId: idempotencyKey });
});
const rendered = await ctx.waitForSignal('await-render', invoicesRendered, { key: month, timeout: '6h' });

```

队列的处理器在任务完成后返回：

```typescript
await this.workflowClient.signal(invoicesRendered, result, { key: job.data.month, id: job.id });

```

`id` 在 BullMQ 再次运行任务时只存储一次信号，因为信号是持久的，所以在工作流到达等待之前完成的任务仍然被计数。

##### 按计划运行工作流

发票的到期日是每月的 1 日。与其使用启动批处理的 cron 任务，不如在工作流上声明一个调度：

```typescript title="invoices/invoice-batch.workflow.ts"
import { Workflow, type WorkflowContext, type WorkflowRunner, type WorkflowStepContext } from '@nestjs/workflows';

/** The month before the one `at` falls in, in UTC ('2026-09' in October 2026): 02:00 on the 1st in New York is the 1st in UTC too. */
const lastMonth = (at: number) => new Date(new Date(at).setUTCDate(0)).toISOString().slice(0, 7);

@Workflow('invoice-batch', {
  schedules: [
    {
      id: 'monthly-invoices',
      // At 02:00 on the 1st of every month, in the store's time zone: last month's invoices.
      cron: '0 2 1 * *',
      tz: 'America/New_York',
      // A deploy or an outage at 02:00 delays the batch instead of skipping a month.
      missed: 'once',
      // After the orders (express 1, standard 2): without a priority, it would go before them.
      priority: 10,
      input: ({ at }) => ({ month: lastMonth(at) }),
    },
  ],
})
export class InvoiceBatchWorkflow implements WorkflowRunner<{ month: string }, { rendered: number }> {
  // ...as before
}

```

声明了该调度的每个工作进程都会启动其实例，无论有多少个工作进程：其 ID 是调度的 ID 和实例发生的时间，例如 `monthly-invoices@2026-10-01T06:00:00.000Z`。`input` 函数接收该实例发生、其调度的 `id` 和其时间 `at`，实例也是如此，如 `ctx.schedule`，这对于以其他方式启动的实例是 `null`。

- **何时。** `cron` 接受 5 个字段，或接受 6 个字段（先是秒），`every` 一个固定间隔，以及 `rrule` 一个 RFC 5545 重复规则。时间是 `tz` 的墙上时钟时间，默认是 UTC，因此批处理在时钟变化前后于纽约时间 02:00 开始。当时钟倒退时，一个出现两次的本地时间只运行一次，即第一次；因此，每小时的调度会跳过重复小时的第二次通过。当时钟前进时，一个不存在的时间仍然运行，延迟到时钟跳跃后的时间：02:30 在 03:30 运行。`every` 不接受 `tz`：无论时区如何，它都会重复一个固定间隔。`startAt`、`endAt` 和 `limit` 限制了一个调度。
- **`missed`** 说明在部署或停机期间，没有工作进程启动的实例发生如何处理。`'skip'`（默认）仅在工作进程在时间的一分钟内找到它时启动；`'once'` 启动最新的那个；`'all'` 启动每一个，最多 100 个，并且需要 `overlap: 'allow'`。它跳过的实例发生会在 `schedule-skipped` 事件中报告。
- **`overlap`** 说明在调度启动的实例尚未完成时，一个实例发生如何处理：`'skip'`（默认）跳过它，并发出 `schedule-skipped` 事件；`'allow'` 无论如何启动它；`'cancel-previous'` 取消正在运行的实例；`'buffer-one'` 在正在运行的实例结束后启动它。

声明的调度属于代码，即使在滚动部署运行时，旧代码和新代码也会并排运行。每个进程在启动时保存其工作流声明的调度，并在其工作进程运行时每分钟确认它们。如果其自身代码未声明某个调度或新版本的流程声明了不同的内容，则一个进程会保留该调度，而另一个进程进行确认。当没有进程在五分钟内确认某个调度后，一个进程会删除其代码未声明的调度，无论它是否运行该调度的工作流，并用自己的声明替换另一个声明。因此，在滚动部署中途重启的旧 pod 会保留新代码添加或新版本更改的调度；部署丢弃的调度在大约在旧代码的最后一个进程停止后五分钟左右被删除，同时部署移除其工作流时也会发生；回滚会将旧声明恢复。

在同一数据库上的其他代码进程，例如其他工作流的工作进程，也会在没有声明了该调度的工作进程运行五分钟后删除该调度，例如当这些工作进程缩减到零时。下一个声明了该调度的代码进程在启动时再次保存它，调度重新开始：从下一次未暂停的发生开始，其运行计数从零开始。

`WorkflowClient.schedules`，也可作为 `WorkflowSchedules` 注入，在运行时处理调度。`trigger('monthly-invoices')` 立即启动一个发生，无论 `overlap` 如何声明，即使调度处于暂停状态，其时间也是 `at`。`pause()` 停止发生直到 `resume()`，之后从第一个发生开始重新启动。`preview()` 返回下一个发生的时间（以 epoch 毫秒为单位），而 `get()` 和 `list()` 读取调度。代码中不存在的调度，例如每个客户的调度，会使用 `upsert()` 保存，而 `remove()` 会删除它，但会保留其已启动的实例：

```typescript
await this.workflowClient.schedules.upsert(`reorder-reminder-${user.id}`, {
  workflow: ReorderReminderWorkflow,
  // Every 4 weeks, on Saturdays at 09:00 in the customer's time zone
  rrule: 'FREQ=WEEKLY;INTERVAL=4;BYDAY=SA;BYHOUR=9;BYMINUTE=0',
  tz: user.timeZone,
  input: { userId: user.id },
});

```

`upsert()` 和 `remove()` 会拒绝代码中更改的声明调度。

##### 等待结果

大多数调用者启动一个工作流然后继续执行。有些需要其结果：一个需要当月发票的会计人员，在调度渲染发票之前，调用一个渲染发票的路由并以计数返回结果。`startAndWait()` 启动实例并等待其结束：

```typescript title="invoices/invoices.controller.ts"
import { Controller, HttpCode, Param, Post, Res } from '@nestjs/common';
import { WorkflowClient, WorkflowResultTimeoutError } from '@nestjs/workflows';
import type { Response } from 'express';
import { InvoiceBatchWorkflow } from './invoice-batch.workflow.js';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly workflowClient: WorkflowClient) {}

  // Accounting only: protect it with your staff guard.
  @Post(':month')
  @HttpCode(200)
  async render(@Param('month') month: string, @Res({ passthrough: true }) response: Response) {
    try {
      // One batch per month: calling again, while it runs or after it ended, waits for the same one.
      return await this.workflowClient.startAndWait(InvoiceBatchWorkflow, { month }, { id: `invoices-${month}` }, { timeout: '30s' });
    } catch (error) {
      if (!(error instanceof WorkflowResultTimeoutError)) {
        throw error;
      }
      // The batch keeps running: answer now, and let the accountant call again later.
      response.status(202);
      return { rendering: true };
    }
  }
}

```

- `startAndWait()` 是 `start()`，然后是 `result()`，它等待实例结束并返回其输出。对于已存在实例的 id，它会等待该实例，因此会计人员在批处理运行时或结束后再次调用该路由，会获得相同的批处理结果。等待的选项是第四个参数：第三个参数的 `timeout` 保持实例的运行超时时间。
- 超过等待的 `timeout`，而不是模块的时钟，它会以 `WorkflowResultTimeoutError` 拒绝，实例会继续运行：路由返回 `202`。一个 `signal` 选项在调用者离开时停止等待。
- 在关闭时，等待会持续直到工作进程完成其正在运行的步骤，最长为 `shutdownTimeout`，因此在此期间结束的实例仍会返回其结果。然后等待会以 `Error` 拒绝，在 Nest 关闭 HTTP 服务器之前，路由会立即返回，这里是 `500`，而不是等到等待的 `timeout` 才关闭。
- 失败、取消或终止的实例会以 `WorkflowFailedError` 拒绝，其 `status` 说明了结束方式，其 `cause` 是错误。这里是 `500`。
- `result()` 会根据其 id 等待一个实例，例如 `trigger()` 启动的实例，无论哪个进程运行它。`startAndWait()` 拒绝 `transaction` 选项，因为实例仅在事务提交后才存在：在事务中调用 `start()`，在提交后调用 `result()`。

#### 安全地部署更改

日志以名称为键，因此步骤、睡眠和等待的名称是与所有仍在运行的实例的契约。名称也是幂等性键的一部分。

假设您将 `charge-payment` 重命名为 `charge-card` 并部署。一个正在等待承运商的订单会恢复，在其日志中找不到 `charge-card` 条目，并且将再次向卡收费，使用的键是支付提供商从未见过的。在执行的第一个新步骤运行之前，引擎会检查代码是否到达了日志中的每个步骤。这里没有，因此实例在不收费的情况下失败：

```text
Instance "order-6d0f8c06" of workflow "order-fulfilment@1" does not match its journal:
"charge-payment", "reserve-stock", "await-delivery" were recorded by an earlier run but not
reached before the new step "charge-card". A deployed change renamed, removed or reordered steps.
Ship such changes as a new version (@Workflow(name, { version })) and keep the old class
registered until its instances finish.

```

其补偿也不会运行，因为它们是由不再匹配的代码定义的。该实例留给人员处理。检查不会看到名称相同但主体现在执行不同操作的步骤。

有些更改不需要新版本：

- 在不改变其含义的情况下更改步骤主体，
- 在任何正在运行的实例已到达的最后一个步骤、睡眠或等待之后添加步骤，
- 更改重试选项和超时。

其他任何更改都会作为新版本发布。例如，市场部希望在付款后立即获得订单确认。在 `reserve-stock` 之前插入一个步骤会改变重放看到的内容，因此复制类并增加其版本：

```typescript title="orders/order-fulfilment-v2.workflow.ts"
@Workflow('order-fulfilment', {
  version: 2,
  // The limits of the highest registered version apply to every version: keep them.
  concurrency: { limit: 1, key: (order: Order) => order.userId },
  rateLimit: { max: 10, duration: '1s' },
})
export class OrderFulfilmentWorkflowV2 implements WorkflowRunner<Order, FulfilmentResult> {
  // ...same constructor as version 1

  async run(ctx: WorkflowContext, order: Order): Promise<FulfilmentResult> {
    const charge = await ctx.step(
      'charge-payment',
      // ...unchanged
    );
    ctx.setStatus('paid');

    await ctx.step('send-order-confirmation', ({ idempotencyKey }) =>
      this.mailService.sendOrderConfirmation(order, idempotencyKey),
    );

    // ...the rest is unchanged from version 1
  }
}

```

注册两个类。一个实例保留其启动时的版本，而工作进程只声明已注册的版本，因此在滚动部署期间旧 pod 和新 pod 可以并排运行。新实例从最高已注册版本开始启动，即使控制器仍传递 `OrderFulfilmentWorkflow`，因为类仅标识工作流的名称。要固定版本，请将 `version: 1` 添加到 `start()` 选项中。当带有工作流名称的 `list()`、`version: 1` 和未完成的状态（`pending`、`running`、`suspended` 和 `compensating`）为空时，移除版本 1。

##### 工作流代码规则

`run()` 每次实例恢复时都会从顶部重新执行。步骤之间的代码在每次执行时都会运行，因此它每次都必须做出相同的决策：

- 将任何接触或读取外部世界的内容放入一个步骤中：HTTP 调用、数据库读写、功能标志。
- 在步骤外部，请使用 `ctx.now()`、`ctx.random()` 和 `ctx.uuid()` 而不是 `Date.now()`、`Math.random()` 和 `randomUUID()`。它们会被记录。
- 在 `run()` 中，只进行 `await` `ctx` 操作和纯计算。绝不要等待真实的计时器。
- 步骤、睡眠和等待名称在一次运行中必须是唯一的。在循环中，将索引添加到名称中，例如 `remind-1` 和 `remind-2`。为从并行分支开始的子任务提供一个 `id`。
- 不要在步骤的函数内部调用 `ctx` 方法。该函数只运行一次，重放时只能看到其结果，因此当步骤调用 `ctx` 时，引擎会使实例失败。请从步骤中抛出 `NonRetryableStepError`，而不是在其中调用 `ctx.fail()`。
- 如果在 `run()` 中捕获错误，请重新抛出未处理的错误。`isWorkflowInterrupt()` 标识了引擎的控制流。引擎不依赖于它：吞噬中断后不会运行任何步骤，`commit()` 再次抛出，取消操作仍然会取消。但是 `finally` 在每次挂起时都会阻塞运行，因此请将副作用排除在外。
- `Promise.all()` 覆盖步骤是允许的，并且在与睡眠或等待在同一 `Promise.all()` 中的步骤会在其之后开始。`Promise.race()` 和 `Promise.any()` 不是重放安全的。
- 输入、步骤结果和信号负载必须是 JSON 可序列化的。`Date` 作为字符串返回，在第一次运行和每次重放时都是如此，而 `Journaled` 类型的结果和负载也说明了这一点。
- 不要在 `this` 上保留每次运行的状态：一个类实例服务于每个订单。

#### 试用和测试

##### 试用

创建数据库，应用迁移，并使用指向数据库的 `DATABASE_URL` 启动应用程序：

```bash
$ npm run start:dev
...
[Nest] 33662  - 09/30/2026, 1:28:30 PM     LOG [WorkflowsModule] WorkflowStorage: PostgresWorkflowStore
[Nest] 33662  - 09/30/2026, 1:28:30 PM     LOG [WorkflowsModule] PostgresWorkflowStore: migrated schema "nest_workflows" to version 1.
[Nest] 33662  - 09/30/2026, 1:28:30 PM     LOG [NestApplication] Nest application successfully started +8ms

```

日志会标明使用的存储，而不是内存默认存储，并说明存储创建了其模式：您的迁移创建了 `orders`，存储创建了自己的表。下达一个订单，然后询问其位置：

```bash
$ curl -X POST http://localhost:3000/orders -H "Content-Type: application/json" \
    -d '{"userId": "u_42", "items": [{"productId": "salmon-kibble-2kg", "quantity": 1, "price": 2499}]}'
{"id":"f7e1e1eb","userId":"u_42","items":[{"productId":"salmon-kibble-2kg","quantity":1,"price":2499}],"shipping":"standard","total":2499,"status":"placed","fulfilment":{"id":"order-f7e1e1eb","workflow":"order-fulfilment","version":1,"created":true,"status":"pending"}}

$ curl http://localhost:3000/orders/f7e1e1eb/fulfilment
{"status":"suspended","stage":"awaiting-delivery","waitingFor":["shipment.delivered","shipment.returned"],"wakeAt":"2026-10-03T11:28:42.251Z","steps":{"charge-payment":"completed","reserve-stock":"completed","await-delivery":"pending"},"error":null}

```

订单及其履行是作为一个整体提交的，工作进程拾取了实例，卡被收费，干粮被预留，实例被停放，直到承运商报告交付或退回，或在 `wakeAt` 中超过 3 天的截止日期。

现在模拟承运商并报告交付：

```bash
$ curl -X POST http://localhost:3000/webhooks/carrier -H "Content-Type: application/json" \
    -d '{"type": "shipment.delivered", "reference": "f7e1e1eb", "trackingNumber": "TRK123456789", "occurredAt": "2026-09-30T14:05:00Z"}'
{"received":true}

$ curl http://localhost:3000/orders/f7e1e1eb/fulfilment
{"status":"suspended","stage":"delivered","waitingFor":[],"wakeAt":"2026-10-07T11:28:58.885Z","steps":{"charge-payment":"completed","reserve-stock":"completed","await-delivery":"completed","delivered":"completed","before-review-request":"pending"},"error":null}

```

实例通过了不可逆转的点，并处于睡眠状态，直到审查请求在 7 天后到期。支持人员无法再取消订单，并且对于存储不了解的订单的交付被拒绝：

```bash
$ curl -X POST http://localhost:3000/orders/f7e1e1eb/cancel -H "Content-Type: application/json" -d '{"reason": "Changed my mind."}'
{"message":"Order f7e1e1eb was delivered. Start a return instead.","error":"Conflict","statusCode":409}

$ curl -X POST http://localhost:3000/webhooks/carrier -H "Content-Type: application/json" \
    -d '{"type": "shipment.delivered", "reference": "nope", "trackingNumber": "TRK1", "occurredAt": "2026-09-30T14:05:00Z"}'
{"message":"Order nope not found.","error":"Not Found","statusCode":404}

```

下达第二个订单（在此处获得 id `58b424f5`）并在它等待承运商时取消它：

```bash
$ curl -X POST http://localhost:3000/orders/58b424f5/cancel -H "Content-Type: application/json" \
    -d '{"reason": "Customer ordered the wrong size."}'
{"accepted":true}

$ curl http://localhost:3000/orders/58b424f5/fulfilment
{"status":"cancelled","stage":"awaiting-delivery","waitingFor":[],"wakeAt":null,"steps":{"charge-payment":"completed","reserve-stock":"completed","await-delivery":"cancelled","$compensate:reserve-stock":"completed","$compensate:charge-payment":"completed"},"error":"Customer ordered the wrong size."}

```

日志显示了两个补偿：库存首先被释放，然后费用被退款。等待从未完成，因此被标记为 `cancelled`，并且阶段停留在工作流最后设置的位置。

实例是您数据库中的行，位于存储的模式中，紧邻订单：

```bash
$ psql "$DATABASE_URL" -c "SELECT o.id, o.status, w.status AS fulfilment, w.runs FROM orders o JOIN nest_workflows.instances w ON w.id = 'order-' || o.id ORDER BY w.created_at"
    id    |  status   | fulfilment | runs
----------+-----------+------------+------
 f7e1e1eb | delivered | suspended  |    2
 58b424f5 | cancelled | cancelled  |    2
(2 rows)

```

最后，重启应用程序并再次查询第一个订单。其状态没有改变，存储未找到任何需要迁移的内容。在另一个端口上针对同一数据库启动第二个进程，两者共享工作：每个实例一次在其中一个上运行。要查看 3 天超时而无需等待 3 天，请使用测试时钟，如下面的测试所示。

##### 使用手动时钟测试

两件事使工作流测试快速且确定：

- 引擎使用的每个时间戳（截止日期、重试时间、租约到期和 `ctx.now()`）都来自模块的 `clock`。一个 `ManualWorkflowClock` 仅在您调用 `advance()` 时才会移动。
- 在禁用工作进程时，后台没有运行任何内容。`WorkflowWorker.drain()` 会运行每个到期的实例，直到没有可以启动的实例为止，并启动时钟已过期的调度的发生。时钟从 2026 年 1 月 1 日 00:00 UTC 开始，因此移动日期的测试也会启动发票批次的第一次发生，时间是 07:00 UTC。

在 PGlite 上使用您的真实迁移运行测试。用一个 PGlite 上的注册数据库覆盖数据库 `DrizzleModule`（`getDrizzleToken()` 返回其令牌）：工作流存储会跟随，因为它的工厂注入了它，并在应用程序启动时在那里创建其模式。用一个 `ManualWorkflowClock` 和一个禁用工作进程覆盖 `WORKFLOWS_MODULE_OPTIONS`。在应用程序之间共享数据库和外部 API 的替代项，因为它们比进程更长久：

```typescript title="test/support.ts"
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { Test } from '@nestjs/testing';
import { ManualWorkflowClock, WORKFLOWS_MODULE_OPTIONS, WorkflowClient, WorkflowWorker } from '@nestjs/workflows';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
// ...AppModule, getDrizzleToken and the stand-in services

/**
 * PostgreSQL in-process (PGlite), with the app's migrations applied: the orders
 * table. The workflow store creates its own tables when the application starts.
 */
export async function createDatabase() {
  const client = new PGlite();
  const db = drizzle({ client });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
  return { db, close: () => client.close() };
}

/** Your database and the external APIs. They outlive a process, so every "process" in a test shares them. */
export async function createWorld() {
  const database = await createDatabase();
  return {
    db: database.db,
    paymentProvider: new PaymentProviderClient(),
    inventory: new InventoryService(),
    mail: new MailService(),
    invoices: new InvoicesService(database.db as unknown as Database),
    close: database.close,
  };
}

export type World = Awaited<ReturnType<typeof createWorld>>;

export async function bootApp(clock: ManualWorkflowClock, world: World) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(getDrizzleToken())
    .useValue(world.db)
    .overrideProvider(WORKFLOWS_MODULE_OPTIONS)
    .useValue({ clock, worker: { enabled: false, shutdownTimeout: 50 } })
    .overrideProvider(PaymentProviderClient)
    .useValue(world.paymentProvider)
    .overrideProvider(InventoryService)
    .useValue(world.inventory)
    .overrideProvider(MailService)
    .useValue(world.mail)
    .overrideProvider(InvoicesService)
    .useValue(world.invoices)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.listen(0, '127.0.0.1');
  return {
    app,
    url: await app.getUrl(),
    orders: app.get(OrdersService),
    workflows: app.get(WorkflowClient),
    worker: app.get(WorkflowWorker),
    close: () => app.close(),
  };
}

export type App = Awaited<ReturnType<typeof bootApp>>;

```

使用手动时钟，3 天超时仅需要一次 `advance()` 调用：

```typescript title="test/order-fulfilment.spec.ts"
describe('order fulfilment', () => {
  let clock: ManualWorkflowClock;
  let world: World;
  let node: App;

  beforeEach(async () => {
    clock = new ManualWorkflowClock();
    world = await createWorld();
    node = await bootApp(clock, world);
  });

  afterEach(async () => {
    await node.close();
    await world.close();
  });

  // ...

  it('refunds and releases the stock when the carrier never confirms delivery', async () => {
    const order = await node.orders.place({ userId: 'u_42', items: [{ productId: KIBBLE, quantity: 1, price: 2499 }] });
    await node.worker.drain(); // charge, reserve, then park for up to 3 days

    clock.advance('3d');
    await node.worker.drain(); // the wait times out and the compensations run

    const fulfilment = await node.workflows.getStatus(fulfilmentId(order.id), { journal: true });
    expect(fulfilment).toMatchObject({
      status: 'failed',
      error: { message: `Order ${order.id} was not delivered within 3 days.` },
    });
    // Compensations run in reverse: release the stock, then refund.
    expect(fulfilment!.journal.filter((entry) => entry.kind === 'compensation').map((entry) => entry.name)).toEqual([
      '$compensate:reserve-stock',
      '$compensate:charge-payment',
    ]);
    expect(world.paymentProvider.refunds).toHaveLength(1);
    expect(world.inventory.stock.get(KIBBLE)).toBe(25);
  });

  // ...

  it('saves the order and starts its fulfilment together, or neither', async () => {
    // The transaction fails after start(): say, the next statement hits a constraint.
    const original = node.workflows.start.bind(node.workflows);
    vi.spyOn(node.workflows, 'start').mockImplementationOnce(async (...args) => {
      await original(...args); // the instance is created in the transaction...
      throw new Error('insert or update on table "order_lines" violates foreign key constraint');
    });
    await expect(place()).rejects.toThrow('violates foreign key constraint');

    // ...and rolled back with it: no order, no fulfilment for the worker to charge.
    expect(await world.db.select().from(orders)).toEqual([]);
    expect(await node.workflows.list()).toEqual([]);
    expect(await node.worker.drain()).toBe(0);
    expect(world.paymentProvider.requests).toBe(0);
  });
});

```

##### 测试崩溃恢复

`createWorld()` 为每个测试创建一个新的数据库。崩溃安全需要两个应用程序在同一数据库上运行。在步骤挂起时关闭应用程序模拟崩溃：关闭超时到期，并且死进程的租约会保留在数据库中直到过期。第二个应用程序在此之后接管：

```typescript title="test/crash-recovery.spec.ts"
it('survives a crash in the middle of an order', async () => {
  const first = await bootApp(clock, world);
  const order = await first.orders.place({ userId: 'u_42', items: [{ productId: KIBBLE, quantity: 1, price: 2499 }] });

  // The process dies while reserving stock, after the payment provider charged the card.
  const reserve = vi.spyOn(world.inventory, 'reserve').mockImplementationOnce(() => new Promise<never>(() => {}));
  void first.worker.drain();
  await vi.waitFor(() => expect(reserve).toHaveBeenCalled());
  await first.close();

  // Another process on the same database takes over once the dead one's lease expires.
  const second = await bootApp(clock, world);
  clock.advance('31s');
  await second.worker.drain();

  expect(await second.workflows.getStatus(fulfilmentId(order.id))).toMatchObject({
    status: 'suspended',
    waits: [
      { signal: 'shipment.delivered', key: order.id },
      { signal: 'shipment.returned', key: order.id },
    ],
  });
  expect(world.paymentProvider.charges).toHaveLength(1); // journaled: not charged again
  expect(reserve.mock.calls.map(([, key]) => key)).toEqual([
    `order-${order.id}:reserve-stock`, // the attempt that died
    `order-${order.id}:reserve-stock`, // the retry, with the same key
  ]);
  await second.close();
});

```

相同的设置涵盖了补偿过程中的崩溃：下一个进程重放日志以重建补偿列表，跳过已完成的补偿，并继续处理其余的。PGlite 是单连接的，因此无法显示两个工作进程竞争同一实例；教程中对存储的测试是在 PostgreSQL 服务器上运行合约的竞争，同时有三个应用程序共享 30 个订单。

要在不覆盖提供者的情况下为测试提供自己的存储，请在 `init()` 之前对 `moduleRef.get(WorkflowStorage)` 调用 `registerSource()`，使用 `replace: true`：如果没有它，第二次注册会抛出错误。`clock` 选项接受任何 `WorkflowClock`，一个其 `now()` 返回纪元毫秒的对象，这样测试就可以从已有的时钟驱动引擎。

#### 使用 CQRS

如果您的应用程序遵循 [CQRS recipe](/recipes/cqrs)，命令处理器发布事件，事件处理器和 Saga 响应这些事件。它们在内存中响应：在进程停止前刚刚发布的事件永远不会到达它们，而等待第二个事件的 Saga 在重启时会忘记第一个事件。`@nestjs/workflows/cqrs` 入口点允许事件本身持久地启动并发出工作流信号，同时您的代码继续执行命令和发布事件。它与 `@nestjs/cqrs` 11 及更高版本一起工作，如配方中所示，使用 `CqrsModule.forRoot()` 注册。

##### 将事件映射到工作流

在这里，当订单被放置时开始履约，当承运商报告交付时唤醒，与之前一样，但工作流客户端调用已从应用程序代码中移除。导入 `WorkflowsCqrsModule` 旁边的 `CqrsModule` 和 `WorkflowsModule`：

```typescript title="app.module.ts"
import { CqrsModule } from '@nestjs/cqrs';
import { WorkflowsModule, WorkflowStorage } from '@nestjs/workflows';
import { WorkflowsCqrsModule } from '@nestjs/workflows/cqrs';

@Module({
  imports: [
    // ...DrizzleModule, as before
    CqrsModule.forRoot(),
    WorkflowsModule.forRoot(),
    WorkflowsCqrsModule, // mapped events start and signal workflows
  ],
  controllers: [OrdersController, CarrierWebhookController],
  providers: [
    // ...the store and the services, as before
    PlaceOrderHandler,
    MarkDeliveredHandler,
    ChargePaymentHandler,
    OrderFulfilmentWorkflow,
  ],
})
export class AppModule {}

```

然后在工作流类上映射事件。`@StartOn()` 在发布事件时启动工作流，而 `@SignalOn()` 发送其信号之一：

```typescript title="orders/order-fulfilment.workflow.ts"
import { SignalOn, StartOn } from '@nestjs/workflows/cqrs';
import { OrderDeliveredEvent } from './order-delivered.event.js';
import { OrderPlacedEvent } from './order-placed.event.js';

@Workflow('order-fulfilment')
@StartOn(OrderPlacedEvent, {
  id: (event) => fulfilmentId(event.order.id),
  input: (event) => event.order,
  // Lower runs first: express orders before standard ones.
  priority: (event) => (event.order.shipping === 'express' ? 1 : 2),
})
@SignalOn(OrderDeliveredEvent, {
  signal: shipmentDelivered,
  key: (event) => event.delivery.reference,
  id: (event) => event.delivery.trackingNumber,
  payload: (event) => event.delivery,
})
export class OrderFulfilmentWorkflow implements WorkflowRunner<Order, FulfilmentResult> {
  // ...the constructor, which now injects CommandBus too, and run()
}

```

需要 `@StartOn()` 的 `id`。它从业务键派生实例 ID，就像 `start()` 所做的那样，因此两次发布的事件会找到第一个启动的实例。它还接受 `start()` 的 `priority`、`concurrencyKey` 和 `rateLimitKey`，每个都是事件的值或函数：在这里，先处理订单，与之前一样。`@SignalOn()` 的 `id` 是可选的，成为信号的 `id`：再次发布的交付事件，例如承运商重试的 Webhook，不会存储第二个信号。`input` 默认为事件本身，信号的 `payload` 也是如此。TypeScript 将输入与 `run()` 进行检查，将有效载荷与信号的类型进行检查。事件是纯类，例如 `OrderPlacedEvent`，具有 `readonly order: Order` 构造函数参数。

命令处理器在一个事务中保存订单并发布事件：

```typescript title="orders/place-order.handler.ts"
import { randomUUID } from 'node:crypto';
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { Database } from '../database/drizzle.js';
import { orders } from '../database/schema.js';
import type { Order } from './order.js';
import { OrderPlacedEvent } from './order-placed.event.js';
import { PlaceOrderCommand } from './place-order.command.js';

@CommandHandler(PlaceOrderCommand)
export class PlaceOrderHandler implements ICommandHandler<PlaceOrderCommand> {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly eventBus: EventBus,
  ) {}

  async execute({ dto }: PlaceOrderCommand): Promise<Order> {
    const total = dto.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const order: Order = {
      id: randomUUID().slice(0, 8),
      userId: dto.userId,
      items: dto.items,
      shipping: dto.shipping ?? 'standard',
      total,
      status: 'placed',
    };

    return this.db.transaction(async (tx) => {
      await tx.insert(orders).values(order);
      // The transaction rides along as the dispatcher context: the fulfilment
      // this event starts commits with the order, or rolls back with it.
      await this.eventBus.publish(new OrderPlacedEvent(order), { transaction: tx });
      return order;
    });
  }
}

```

`publish()` 和 `publishAll()` 的第二个参数是 CQRS 的调度器上下文。`WorkflowsCqrsModule` 读取其 `transaction` 属性并将其传递给 `start()` 和 `signal()`，因此实例是通过您的事务创建的，与 `transaction` 选项完全相同。对于 TypeORM，调度器上下文携带了 `EntityManager`，该 `dataSource.transaction()` 将其回调交给它，在相同的 `transaction` 属性下。`publish()` 在工作流启动和发出信号后解析，然后事件才到达您的事件处理器和 Saga。没有工作流映射的事件直接通过，未更改。控制器执行命令：`POST /orders` 执行 `PlaceOrderCommand`，承运商的 Webhook 执行 `MarkDeliveredCommand`，其 `MarkDeliveredHandler` 对交付执行相同操作：它在一个事务中更新订单状态并发布 `OrderDeliveredEvent`，因此状态和信号一起提交。

该模块包装了事件总线拥有的任何发布者，因此您使用 `CqrsModule.forRoot()` 的 `eventPublisher` 选项设置的发布者（例如消息代理）仍然会在工作流之后接收到每条事件。在启动后替换 `EventBus.publisher` 将绕过工作流，因此如果发生这种情况，启动将失败。当工作流映射事件但未导入 `WorkflowsCqrsModule`、一个类两次映射同一事件，或 `@StartOn()` 为工作流提供一个没有每个键限制的键时，它也会失败。当注册了两个版本的某个工作流时，最高版本的 `@StartOn()` 决定启动哪个，并且信号会发送给每个版本的等待实例，只发送一次，因此它们的 `@SignalOn()` 声明必须就其有效载荷和 `id` 达成一致：`publish()` 在它们不一致时拒绝。

映射存在于工作流类上，因此发布映射事件的每个进程都会注册它们，包括不运行任何工作流的进程，例如仅放置订单的 API。像往常一样在那里注册类和存储，并将 `worker: false` 传递给 `WorkflowsModule.forRoot()`：进程启动并发出工作流信号，工作进程执行它们。导入 `WorkflowsCqrsModule` 但未注册映射事件的工作流的进程会启动但不发出任何信号，并在启动时记录警告。

##### 从步骤执行命令

一个步骤可以执行命令。将步骤的幂等性键与命令一起传递，并让处理器将其传递给它调用的系统：

```typescript title="orders/order-fulfilment.workflow.ts"
const charge = await ctx.step(
  'charge-payment',
  ({ idempotencyKey }) => this.commandBus.execute(new ChargePaymentCommand(order, idempotencyKey)),
  {
    retry: { attempts: 5, backoff: { delay: '2s' } },
    compensate: (charge, { idempotencyKey }) => this.paymentsService.refund(charge.chargeId, idempotencyKey),
  },
);

```

`ChargePaymentHandler` 使用该键调用 `PaymentsService.charge()`，因此重试的步骤永远不会重复收费，并且命令的结果像任何步骤一样被记录。一个步骤也可以发布事件和发送信号。它至少运行一次，因此从步骤发布的事件可能会再次被发布。一个映射的启动会找到其实例，一个没有步骤中 `id` 的 `start()` 也会找到：它获得一个从步骤的 `idempotencyKey`、工作流的名称以及它在该工作流启动中的位置派生的 ID，重复调用会返回首次启动的实例，包括输入。从步骤内部发送的信号，无论是直接的还是通过映射事件，只存储一次：如果没有自己的 `id`，它将获得一个从步骤的 `idempotencyKey` 和其在具有相同名称和键的步骤信号中的位置派生的 ID。按固定顺序发送这些信号。一个并发发送多个具有相同名称和键的步骤应为每个步骤提供自己的 `id`。

##### 每种发布方式的保证

保证取决于事件的发布方式和时间：

| 事件的发布方式 | 工作流的启动或信号 | 如果进程死亡或写入失败 |
| --- | --- | --- |
| 在您的事务中，事务在调度器上下文中 | 与您的写入一起提交，或完全不提交 | 没有半途而废。失败的启动或信号会拒绝 `publish()`，您的事务回滚 |
| 聚合的事件，来自 `commit()` 且事务在调度器上下文中（`@nestjs/cqrs` 12.1 或更高版本），或在您的事务中来自 `publishAll()`，如下所示 | 与您的写入一起提交，或完全不提交 | 同上：失败的启动或信号拒绝 `commit()` 或 `publishAll()`，您的事务回滚 |
| 在您的事务提交后 | 在 `publish()` 解析之前写入 | 在您的提交和发布之间崩溃会导致丢失。从协调任务中重新发布：启动的 `id` 使其安全，信号的也一样，如果 `@SignalOn()` 设置了则如此 |
| 来自 `commit()` 且没有事务，来自与 `EventPublisher` 合并的聚合 | 在您的事务外部写入，在后台执行，除非您等待 `commit()`（12.1 或更高版本） | 在没有等待它的情况下崩溃时丢失，在您的事务回滚时被遗弃。失败会发送到 `UnhandledExceptionBus` 和日志，模块对每个事件类记录一次警告 |
| 来自 `commit()` 且没有事务，来自 `@Publishable()` 聚合 | 在您的事务外部写入，在后台执行，除非您等待 `commit()`（12.1 或更高版本） | 在没有等待它的情况下崩溃时丢失，在您的事务回滚时被遗弃。未等待时，失败是一个未处理的 promise 拒绝，默认会停止 Node.js。它无法将其与普通的 `publish()` 区分开来，因此没有警告 |
| 来自工作流步骤 | 仅一次，无论步骤运行多少次 | 重试的步骤不会启动任何新的内容，也不会存储第二个信号 |

与 `EventPublisher.mergeObjectContext()` 或 `mergeClassContext()` 合并的聚合，或使用 `@Publishable()` 装饰的聚合，从 `commit()` 发布其事件。在 `@nestjs/cqrs` 12.1 或更高版本中，`commit()` 会获取调度器上下文，就像 `publish()` 一样，并返回事件总线返回的内容。将您的事务传递给它，并在命令处理程序的事务中等待它：聚合的事件然后在该事务中启动和信号工作流，当启动或信号失败时，`commit()` 会拒绝，从而回滚事务：

```typescript
await order.commit({ transaction: tx });

```

`commit()` 在将事件交给工作流写入之前清除聚合的事件，因此在失败后，使用新加载的聚合再次运行命令。

没有调度器上下文时，`commit()` 在您的事务外部发布：工作流仍然启动，但回滚会使它们被遗弃，在写入前崩溃会导致丢失。不要让它发布启动或信号工作流的事件。在 `@nestjs/cqrs` 12.0 或更早版本中，`commit()` 不获取任何上下文且不返回任何内容以等待，因此请在命令处理程序的事务中自行发布聚合的事件，然后清除它们：

```typescript
await this.eventBus.publishAll(order.getUncommittedEvents(), { transaction: tx });
order.uncommit();

```

当从合并聚合的 `commit()` 接收到映射事件时，模块会告诉您没有事务：第一次时，它会记录一个命名事件类的警告。`@Publishable()` 聚合的事件像普通的 `publish()` 调用一样，没有任何调度器上下文到达，因此不会收到警告。

您的事件处理程序和 saga 仍然在工作流之后在内存中接收每个事件。在事务内部，它们在提交前运行，就像以前一样，因此它们可以响应其事务随后回滚的事件。将一个事件转换为一个命令的 saga 可以保持为 saga。一个记住事件的 saga，例如等待订单后的付款一小时后放弃的 saga，实际上是一个伪装的工作流：从第一个事件启动工作流，将其他事件映射到信号，并让 `waitForSignal()` 使用 `timeout` 来持久地等待。

#### 为生产环境做准备

##### 保持日志简短

每次执行都会加载实例的整个日志并从顶部重放 `run()`。具有固定步骤数量的进程会保持其日志较小，但每轮都有一个步骤或一个睡眠的循环会添加条目，直到它运行结束，每次执行都会变慢。当日志达到 1,000 条记录或 1 MB 时，模块会发出警告：每个实例，当它跨越界限时，在日志中以及作为一个 `journal-large` 事件。当它包含 10,000 条记录或 10 MB 时，实例在记录另一个之前失败：其补偿运行，这可能仍然记录自己的日志，并以 `failed` 结束，带有 `WorkflowJournalLimitError`。模块的 `journal` 选项移动这两条限制。将它们设置为最长的常规工作流加上额外的空间，并设置一个限制到 `Infinity` 以禁用它：

```typescript
WorkflowsModule.forRoot({
  journal: { warnEntries: 500, maxEntries: 5_000 },
});

```

一个持续进行的进程，例如每月的宠物垫订阅，将继续在一个新实例中。一年交付后，其最后一个步骤启动下一年的实例，当前实例完成：

```typescript
async run(ctx: WorkflowContext, subscription: Subscription) {
  for (let month = 1; month <= 12; month++) {
    await ctx.step(`ship-${month}`, ({ idempotencyKey }) => this.subscriptionsService.ship(subscription, idempotencyKey));
    await ctx.sleep(`wait-${month}`, '30d');
  }

  const next = { ...subscription, year: subscription.year + 1 };
  return ctx.step('continue', async () => {
    const { id } = await this.workflowClient.start(LitterSubscriptionWorkflow, next, {
      id: `subscription-${subscription.id}-${next.year}`,
    });
    return id;
  });
}

```

步骤仅启动一次新实例：重试的步骤会找到它启动的实例。新实例有一个新的日志和自己的 id，因此完成的年份会一直可读，直到保留策略清除它。在同一 id 下继续需要每个存储在原地替换日志，在工作进程的租约下；新的 id 不需要存储中的任何新内容。当每一轮都是独立的时，调度会更简单：它为每次发生启动一个实例，每个实例都有自己的日志，如 [Run workflows on a schedule](/reliability/workflows#run-workflows-on-a-schedule) 所示。

##### 加密工作流存储的内容

存储保留了您的工作流处理的内容：订单、费用、交付。为防止任何读取数据库或其备份的人员可读这些内容，请为该 **模块** 提供一个 **payload codec**。`AesGcmPayloadCodec` 使用 AES-256-GCM 加密，密钥来自您的密钥管理器。在 **模块** 的 **工厂提供者** 中创建它，该提供者在启动时运行：

```typescript title="app.module.ts"
import { AesGcmPayloadCodec, WorkflowsModule, WorkflowStorage } from '@nestjs/workflows';

WorkflowsModule.forRootAsync({
  useFactory: () => ({
    worker: {
      // ...as before
    },
    // Encrypts what the store keeps. The key comes from your secret manager, through the environment.
    codec: new AesGcmPayloadCodec({
      keys: { '2026-09': process.env.WORKFLOWS_KEY_2026_09! },
      current: '2026-09',
    }),
  }),
}),

```

密钥是 base64 编码的 32 个随机字节（`openssl rand -base64 32`），并使用您选择的 ID。如果缺少密钥（未设置的 **环境变量**）、不是 base64 格式或不是 32 字节，则启动失败，并会报告错误名称。

- **加密内容**：所有存储您数据的内容。输入和输出、步骤结果和检查点、信号 **负载**、自定义状态、取消原因、计划的输入以及错误的消息和堆栈。每个 **负载** 都使用为其派生的密钥加密，并将其存储位置作为认证数据，因此如果 **负载** 被更改、移动到另一个实例或字段，它将无法解密而不是被读取。1 KiB 或更大的 **负载** 会先进行压缩。如果 **负载** 将密钥与数据混合，攻击者可以选择，并且攻击者可以看到存储的大小，请使用 `compress: false` 关闭此功能。
- **保持可读的内容**：因为存储依赖于匹配、过滤、排序或计数这些内容：ID、工作流名称和版本、状态、信号名称和键、并发和速率限制键、优先级、到父级和计划的链接、日志条目名称以及所有时间。错误保留其名称，例如 `StepFailedError`。因此，请选择不包含任何敏感信息的 ID 和键：`order-71e1973d`，而不是电子邮件地址。这里的并发键是客户的 ID，可在 `concurrency_key` 中读取。
- **存储形式**：`$wf1:aes-256-gcm:2026-09.` 后面跟着密文，字符串位于相同的 JSON 列中，因此存储无需更改。

**轮换密钥**。添加一个密钥，并将其设置为 `current`。**负载** 使用加密它的密钥进行解密，从那时起写入的所有内容都使用当前密钥。不会批量重新加密任何内容：**负载** 在实例进展过程中被重写，旧的 **负载** 会随清理而被移除。因此，请保留一个已列出的密钥，因为它加密的内容可能仍可被读取：未完成的实例、尚未清除的信号以及保存于该密钥下的计划。已声明计划的输入在启动时和每分钟都会使用当前密钥再次保存，但已更新计划仅在下一个 `upsert()` 时保存：`pause()` 和 `resume()` 保持其存储状态。

```typescript
codec: new AesGcmPayloadCodec({
  keys: {
    '2027-03': process.env.WORKFLOWS_KEY_2027_03!,
    '2026-09': process.env.WORKFLOWS_KEY_2026_09!,
  },
  current: '2027-03',
}),

```

需要未在列表中列出的密钥的实例无法被读取：`getStatus()` 会抛出一个包含密钥名称的错误，`list()` 会在不包含 **负载** 的情况下显示实例，工作进程会忽略它，直到密钥恢复，然后运行它。

添加 **codec** 不会破坏任何正在运行的实例：在此之前存储的 **负载** 按原样读取，新的写入会被加密。保护在此结束。任何可以写入数据库的人都可以用纯文本替换加密的 **负载** 并使其被读取：**codec** 保护的是它编码的内容免受读取和篡改，而不是保护数据库免受写入者的侵害。

您自己的 **codec** 实现 `WorkflowPayloadCodec`：一个与每个 **负载** 一起存储的 `id`，以及接收值和存储位置的 `encode()` 和 `decode()`。将其 **类** 传递给 `codec`，让 **Nest** 使用全局 **模块** 中的依赖（例如 KMS 客户端）来创建它。要替换 **codec**，请先列出新 **codec**，后列出旧 **codec**：第一个进行编码，每个 **负载** 都由其携带的 ID 对应的 **codec** 进行解码。

##### 生产检查清单

- 将 `idempotencyKey` 传递给每个副作用，包括补偿。步骤至少运行一次。
- 当发送者可能运行两次时（例如发送者重试的 webhook 或消息消费者），给信号一个 `id`。从步骤发送的信号会自动获得一个。
- 调用 `enableShutdownHooks()`，并将 `shutdownTimeout` 保持在您平台宽限期（Kubernetes 默认 30 秒）之下。
- 有意选择 `leaseDuration`。这是崩溃进程实例等待另一个进程接管的时间长度，如果进程的事件循环卡住时间更长，则会丢失其实例。租约过期比较不同主机写入的时间戳，因此请保持它们的时间同步（NTP），并将 `leaseDuration` 设置在它们之间任何偏差之上。
- 在您的数据库上注册一个存储：`PostgresWorkflowStore`、`MySqlWorkflowStore` 或您自己的。在内存中或在容器磁盘上的文件中，状态随实例死亡：内存默认值在重启时会丢失所有运行的订单，并且生产环境会拒绝它。在 CI 中针对您自己的存储运行契约套件，在其数据库上，使用 `concurrent: true`。
- 在新版本启动前应用存储的迁移，使用 `npx @nestjs/workflows migrate` 或您的迁移工具，并在 CI 中使用 `npx @nestjs/workflows status` 检查它们。使用 `NODE_ENV=production` 时，存储不会在启动时迁移：落后的模式会使其失败，而不是迁移。
- 运行任意数量的工作进程，在任意数量的主机上。为它们设置连接池大小：每个运行实例都会续订其租约并通过池写入其日志，每次轮询都会为其声明占用一个连接。
- 在写入业务行的事务中启动工作流（`transaction: tx`，或使用 TypeORM 的 `EntityManager`），这样在两者之间崩溃就不会留下未被满足的订单。传递事务，绝不传递根数据库。使用 CQRS 时，在事务内部发布事件，并将事务放在调度器上下文中。
- 保持发送信号的事务简短：信号和注册等待的挂起在其后面排队。在 PostgreSQL 上，保持 READ COMMITTED，数据库的默认隔离级别也是如此：存储会拒绝更严格的级别。在 MySQL 上，保持 REPEATABLE READ 或 READ COMMITTED，并在发生死锁（错误 1213）时重新运行事务。
- 验证 webhook 签名，并且仅在带有信号的事务已提交后才返回 `2xx`。
- 对需要人工干预的实例发出警报。`compensation_failed` 表示撤销中途放弃，而带有 `failed` 实例和 `WorkflowNonDeterminismError` 表示部署破坏了重放。`WorkflowClient.list()` 找到它们，而 [What each status means](/reliability/workflows#what-each-status-means) 说明了对每个实例的操作：修复原因后执行 `retry()`，或执行 `delete()`。对于日志和指标，订阅 `WorkflowEvents.events$`，或订阅 `nestjs:workflows:*` 诊断通道，这些通道被不使用 Nest 的追踪工具读取；[Events](/reliability/workflows#事件) 将它们映射到追踪中。
- 使用 `ctx.commit()` 标记您的不可逆转点。在此之前，每次失败和取消都会撤销已完成的步骤。
- 每天使用 `purge()` 在应用程序的一个实例上清除已完成的实例，如 [Purge finished instances](/reliability/workflows#purge-finished-instances) 所示。保持其 `olderThan` 时间长于任何发送者的重试窗口：信号的 `id` 去重仅在信号存储期间有效。
- 保持日志简短：有界循环，并将永不结束的循环在新实例中继续（[Keep journals short](/reliability/workflows#keep-journals-short)）。为必须在某个点放弃的进程设置运行超时（[Time out the whole workflow](/reliability/workflows#time-out-the-whole-workflow)）。
- 根据步骤调用的并发度和速率限制进行调整，并将更改部署到每个进程：每个进程都应用其运行代码的限制。一旦某些实例具有优先级，也为其余实例设置优先级，因为没有优先级的实例会优先执行。
- 将声明的调度部署到注册了工作流的每个进程：只有其代码声明了该调度的工作进程才会启动其实例。部署丢弃的调度或其移除的工作流将继续在旧代码的进程上启动，并在最后停止后约五分钟后继续。对于在没有工作进程时不应跳过的任务，设置 `missed`。如果其他代码的进程共享数据库，不要让没有声明该调度的工作进程的调度持续五分钟：它们会删除该调度，一旦有实例启动，它将重新开始。
- 使用代码库中的密钥（[Encrypt what workflows store](/reliability/workflows#encrypt-what-workflows-store)）使用编解码器加密存储中的内容。在任何加密的内容仍可被读取时，保留旧密钥列表，并选择不包含敏感信息的 ID 和密钥：它们将保持可读。

#### 参考

##### 模块选项

`WorkflowsModule.forRoot()` 接受这些选项；`forRootAsync()` 从 `useFactory`、`useClass` 或 `useExisting`（实现 `WorkflowsOptionsFactory` 的类）中获取它们。选项令牌是 `WORKFLOWS_MODULE_OPTIONS`。存储不是一个选项：使用 `WorkflowStorage` 注册它，如 [Keep workflows in your database](/reliability/workflows#keep-workflows-in-your-database) 所示。

| 选项 | 默认值 | 含义 |
| --- | --- | --- |
| `worker.enabled` | `true` | 运行轮询循环。`worker: false` 是 `enabled: false` 的简写：进程启动，检查信号和工作流，并根据需求运行实例 |
| `worker.id` | `hostname:pid:random` | 工作进程的名称，显示为实例的 `leaseOwner` |
| `worker.concurrency` | `10` | 此进程一次执行的实例数量 |
| `worker.pollInterval` | `'1s'` | 检查待执行实例的频率。本地 `start()` 或 `signal()` 会立即唤醒循环 |
| `worker.leaseDuration` | `'30s'` | 声明在没有续订的情况下一个声明的有效时间，即崩溃进程保持实例的时间长度 |
| `worker.heartbeatInterval` | `leaseDuration` 的三分之一 | 运行实例续订租约的频率 |
| `worker.shutdownTimeout` | `'10s'` | 关闭等待运行执行后再返回的时间长度 |
| `retry` | 3 次尝试，递增至 `'1s'`，最大至 `'5m'`，无抖动 | 每个步骤的默认值。参见下方的重试字段 |
| `journal.warnEntries`, `journal.warnBytes` | `1000`, `1000000` | 在任一达到时，记录警告并发出 `journal-large`，每个实例一次（[Keep journals short](/reliability/workflows#keep-journals-short)） |
| `journal.maxEntries`, `journal.maxBytes` | `10000`, `10000000` | 在任一达到时，在记录另一个条目之前使用 `WorkflowJournalLimitError` 使实例失败。`Infinity` 关闭检查 |
| `clock` | 系统时钟 | 一个 `WorkflowClock`。测试通过一个 `ManualWorkflowClock`（[Test with a manual clock](/reliability/workflows#test-with-a-manual-clock)） |
| `allowInMemoryStorage` | `false` | 使用 `NODE_ENV=production` 且未注册存储时，启动失败；无论如何都会在内存存储上运行 `true` |
| `codec` | 无 | 一个 `WorkflowPayloadCodec`、其类或一个列表：第一个进行编码，每个都解码其编码的负载（[Encrypt what workflows store](/reliability/workflows#encrypt-what-workflows-store)） |
| `isGlobal` | `true` | 全局注册模块。`forRoot()` 和 `forRootAsync()` 的顶层 |

一个 `retry` 选项（模块的、步骤的 `retry` 或其 `compensateRetry`）是一个尝试次数，`false` 表示单次尝试，或包含这些字段的对象。步骤的 `retry` 会按字段合并模块的字段。

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `attempts` | `3` | 包括第一次在内的总尝试次数 |
| `backoff.delay` | `'1s'` | 第一次重试前的等待时间 |
| `backoff.factor` | `2` | 每次重试的增长量；`1` 保持等待时间恒定 |
| `backoff.maxDelay` | `'5m'` | 单次等待的上限 |
| `backoff.jitter` | `'none'` | `'full'`（等待时间的零到值），`'equal'`（一半到全部）或 `'none'` |
| `retryIf` | 每次错误 | `(error, attempt) => boolean`：立即使用 `false` 使步骤失败 |

`backoff` 也可以是一个函数，`(attempt, error) => duration`。一个 `NonRetryableStepError` 从不重试。

##### PostgreSQL 存储

`new PostgresWorkflowStore(options, workflowStorage)`，来自 `@nestjs/workflows/postgres`，接受以下选项：

| 选项 | 默认值 | 含义 |
| --- | --- | --- |
| `executor` | 必需 | 存储如何连接到数据库：`fromDrizzle(db)`、`fromTypeOrm(dataSource)`、`fromPg(pool)`、`fromPrisma(prisma, options)` 或 `fromKysely(db)` |
| `schema` | `'nest_workflows'` | 其表的模式，由其首次迁移创建。字母、数字和下划线，不能以数字开头，最多 63 个字符 |
| `migrate` | `true`，但不能使用 `NODE_ENV=production` | 在应用程序启动时应用待处理的迁移。使用 `false` 时，如果模式落后，启动将以 `WorkflowSchemaError` 失败 |

每个执行器接收您的数据库客户端和其自身的事务对象，然后 `start()` 和 `signal()` 将其作为 `transaction` 使用：

| 执行器 | 接收 | 事务对象 |
| --- | --- | --- |
| `fromDrizzle(db)` | 一个 Drizzle PostgreSQL 数据库，无论其驱动如何 | `tx`，由 `db.transaction()` 传递其回调 |
| `fromTypeOrm(dataSource)` | 一个类型为 `postgres` 的 `DataSource`，或其 `manager` | `EntityManager`，由 `dataSource.transaction()` 传递其回调，或在 `startTransaction()` 后由 `QueryRunner` 提供 |
| `fromPg(pool)` | 一个 node-postgres `Pool`，或一个已连接的 `Client` | 一个客户端，例如来自 `pool.connect()` 的，在 `BEGIN` 后 |
| `fromPrisma(prisma, options)` | 一个在 PostgreSQL 上的 Prisma 客户端，通过诸如 `@prisma/adapter-pg` 或 Prisma 引擎的驱动适配器。`maxWait`（默认 `'10s'`）和 `timeout`（默认 `'1m'`）限制了存储自身的事务 | `prisma.$transaction()` 传递其回调的事务客户端 |
| `fromKysely(db)` | 一个具有 PostgreSQL 方言的 `Kysely` 实例。存储的语句会跳过其插件 | `db.transaction().execute()` 传递其回调的事务，或一个受控事务 |

存储的 `migrate()` 方法会一次性应用待处理的迁移，无论 `migrate` 选项如何设置，并以已应用的版本解析。`PostgresWorkflowStore.migrationSql()` 返回它们的 SQL，包含簿记信息。其选项是 `schema`、要升级到的版本 `from`（默认 `0`，新数据库）和 `to`（默认：包所需的），以及 `statementBreakpoints`，它使用 drizzle-kit 的 `--> statement-breakpoint` 行分隔语句。从版本 0 开始，它使用 `CREATE SCHEMA IF NOT EXISTS`，该操作需要数据库上的 CREATE 权限：如果有人为您创建了模式，则省略它。`PostgresWorkflowStore.schemaVersion` 是包所需的版本。一个模式自身的版本是其 `migrations` 表中的最高版本。

##### MySQL 存储

`new MySqlWorkflowStore(options, workflowStorage)`，来自 `@nestjs/workflows/mysql`，在 MySQL 8.4 LTS 和 9.x 上运行，接受以下选项：

| 选项 | 默认值 | 含义 |
| --- | --- | --- |
| `executor` | 必需 | 存储如何连接到数据库：`fromDrizzle(db)`、`fromTypeOrm(dataSource)`、`fromMysql2(pool)`、`fromPrisma(prisma, options)` 或 `fromKysely(db)`，来自 `@nestjs/workflows/mysql` |
| `schema` | `'nest_workflows'` | 其表名称的起始部分（`nest_workflows_instances`...），在连接的数据库中。小写字母、数字和下划线，不能以数字开头，最多 40 个字符 |
| `migrate` | `true`，但不能使用 `NODE_ENV=production` | 在应用程序启动时逐条应用待处理的迁移。使用 `false` 时，如果表落后，启动将以 `WorkflowSchemaError` 失败 |

| 执行器 | 接收 | 事务对象 |
| --- | --- | --- |
| `fromDrizzle(db)` | 一个 Drizzle MySQL 数据库（`drizzle-orm/mysql2`） | `db.transaction()` 传递其回调的 `tx` |
| `fromTypeOrm(dataSource)` | 一个类型为 `mysql` 的 `DataSource`，或其 `manager` | `dataSource.transaction()` 传递其回调的 `EntityManager`，或在 `startTransaction()` 后由 `QueryRunner` 提供 |
| `fromMysql2(pool)` | 一个 mysql2 连接池或一个连接 | 一个连接，例如来自 `pool.getConnection()` 的，在 `beginTransaction()` 后 |
| `fromPrisma(prisma, options)` | 一个在 MySQL 上的 Prisma 客户端，通过 `@prisma/adapter-mariadb`。`maxWait`（默认 `'10s'`）和 `timeout`（默认 `'1m'`）限制了存储自身的事务，包括 `migrate()`：对它抛出 `timeout`，或从命令行迁移 | `prisma.$transaction()` 传递其回调的事务客户端 |
| `fromKysely(db)` | 一个具有 `MysqlDialect` 的 `Kysely` 实例。存储的语句会跳过其插件 | `db.transaction().execute()` 传递其回调的事务，或一个受控事务 |

在启动时，存储会检查服务器和连接：MySQL，而不是 MariaDB；一个严格的 `sql_mode`（`STRICT_TRANS_TABLES`，MySQL 的默认设置），没有它 MySQL 会截断超出其列长度的值；以及一个其表将要所在的数据库。它会计算更新匹配的行数，因此请保留 mysql2 的 `FOUND_ROWS` 标志，该标志默认开启（Prisma 的适配器将其称为 `foundRows`），并将 `NO_BACKSLASH_ESCAPES` SQL 模式关闭。

其 id、名称和键是有界长度的索引列，以字符为单位：

| 键 | 最多 |
| --- | --- |
| 一个实例 id，包括子实例（默认 `<parent id>/<workflow>#<n>`）和调度开始的实例 id（`<schedule id>@<time>`） | 255 |
| 一个调度 id | 230 |
| 一个工作流的名称、一个信号的名称、`key` 和 `id`、一个并发键、一个速率限制键 | 255 |
| 一个日志条目的名称：一个步骤的、一个睡眠的或一个等待的，以及引擎添加的，例如 `$compensate:<step>` 和 `$child:<child id>` | 512 |

更长的名称会在任何 SQL 之前以 `RangeError` 失败并命名它。`migrate()` 和 `MySqlWorkflowStore.schemaVersion` 是 PostgreSQL 存储的。`MySqlWorkflowStore.migrationSql()` 接受相同的选项，并按顺序返回要应用的语句，每个语句一次，而 `MySqlWorkflowStore.migrationStatements()` 接收 `schema`、`from` 和 `to`，并为每次调用只返回一个字符串，适用于每次调用执行一个语句的工具。一个模式自身的版本是其 `<schema>_migrations` 表中应用到的最高版本。

##### 命令行

`npx @nestjs/workflows` 应用部署步骤的存储迁移，或在 CI 中检查它们。它接受 `--url`（默认 `DATABASE_URL`）和 `--schema`（默认 `nest_workflows`）。URL 选择存储：PostgreSQL 使用 `postgres://` 或 `postgresql://`，需要安装 `pg`；MySQL 使用 `mysql://`，需要 `mysql2`。

| 命令 | 功能描述 |
| --- | --- |
| `migrate` | 应用待处理的迁移，与 `migrate: true` 在启动时执行的操作相同 |
| `status` | 打印模式的版本和包所需的版本，如果模式落后则以 1 退出 |
| `sql` | 在没有数据库的情况下打印 `migrationSql()` 的 SQL，从 `--from` 到 `--to`，PostgreSQL 的或使用 `--dialect mysql` 的 MySQL。`--statement-breakpoints` 为 drizzle-kit 分隔语句 |

##### 存储契约

`PostgresWorkflowStore` 和 `MySqlWorkflowStore` 实现 `WorkflowStore` 接口。对于其他数据库，请在您自己的提供者中实现它。`WorkflowStore` 上每个方法的 JSDoc 说明了该方法必须做什么，以及该规则防止了哪种竞态条件。

**注册。** 存储是一个普通的单例提供者，在其构造函数中调用可注入的 `WorkflowStorage` 上的 `registerSource(this)`。注册表会一次性检查形状，除非通过 `replace: true`，否则拒绝第二次注册，并在 `WorkflowsModule` 初始化时锁定，记录正在使用的存储。请求作用域的提供者、延迟加载模块中的提供者或生命周期钩子注册得太晚，会抛出错误。如果没有注册任何内容，模块使用 `InMemoryWorkflowStore`：重启会丢失所有运行实例，并且两个进程不能共享它们。它也不能加入您的事务，因此 `start()` 和 `signal()` 与 `transaction` 一起一次性写入，并且第一次会记录一个警告。使用 `NODE_ENV=production`，启动会失败，并附带一个错误，该错误会命名包的存储和需要实现的接口，除非您在模块选项中设置了 `allowInMemoryStorage: true`。

**原子性。** 工作进程、信号、取消、重试、清除和调度在存储中相互竞争。`claim()` 绝不能将一个实例租给两个工作进程，`write()` 必须仅在工作进程的租约有效时写入，`signal()` 不能跳过一个正在挂起的实例。因此，任何改变状态的方法都是一个条件语句，或一个带有正确锁的事务，绝不是先读取后写入。有两个可选方法：`createInTransaction()` 和 `signalInTransaction()`，它们使用您的事务对象调用 `start()` 和 `signal()`，且该对象未被修改。它们必须通过该事务写入，并拒绝根句柄，因为根句柄的写入是自动提交的。在 PostgreSQL 上，`signalInTransaction()` 还拒绝非 READ COMMITTED 的事务，因为其唤醒可能会错过在其快照之后提交的等待。

使用 `@nestjs/workflows/testing` 中的套件进行**测试**。`workflowStoreContract()` 为任何测试运行器返回包含竞态条件的契约作为测试用例。教程中的测试使用 Drizzle 对 `PostgresWorkflowStore` 进行测试，并对 MySQL 上的 `MySqlWorkflowStore` 进行测试，就像您对自己的存储那样，使用一个在清空表后返回存储的函数：

```typescript title="test/drizzle-workflow.store.spec.ts"
// The concurrency cases run too; with one connection, PGlite runs them one statement at a time.
const cases = workflowStoreContract(() => freshStore(db), { concurrent: true, transaction: (work) => db.transaction(work) });
for (const c of cases) {
  it(c.name, c.run);
}

```

使用 `concurrent: true`，该套件会相互竞争声明（在限制下）、信号、挂起、子进程的最终写入、取消和终止、重试、清除和调度声明：例如 60 个信号对抗 60 个挂起。在具有连接池的数据库服务器上运行它，在没有正确锁的存储上它会失败。使用 `transaction`，一个打开您事务的函数，两个可选方法的用例也会运行。包自身的测试使用手写的 Drizzle 存储运行该套件，证明了根据接口编写的存储能够通过测试。

基于该引擎构建的包，例如作业队列，从 `@nestjs/workflows/core` 提取其与存储无关的部分（时钟、重试、有效载荷编解码器、限制、租用的工作进程循环和调度）；应用程序不需要它。

##### 调用选项

| 调用 | 选项 | 解释于 |
| --- | --- | --- |
| `@Workflow(name, options)` | `version`（默认 `1`），`timeout`（运行超时；默认无），`concurrency`（`limit`，以及一个针对每个键的 `key` 函数；数组中各一个），`rateLimit`（`max`，`duration`，以及一个 `key` 函数；数组中各一个），`schedules`（参见下方的调度选项） | [Deploy changes safely](/reliability/workflows#deploy-changes-safely), [Time out the whole workflow](/reliability/workflows#time-out-the-whole-workflow), [Limit how many run at once](/reliability/workflows#limit-how-many-run-at-once), [Run workflows on a schedule](/reliability/workflows#run-workflows-on-a-schedule) |
| `ctx.step(name, fn, options)` | `retry`, `timeout`, `heartbeatTimeout`, `compensate`, `compensateRetry` | [Write the workflow](/reliability/workflows#write-the-workflow), [Long-running steps](/reliability/workflows#long-running-steps) |
| `ctx.waitForSignal(name, signal, options)` | `key`, `timeout`（在通过时解析 `null`）, `match`（对有效载荷的纯过滤器） | [Wait for the delivery webhook](/reliability/workflows#wait-for-the-delivery-webhook) |
| `ctx.sleep(name, duration)` | 一个持续时间，或一个包含 `until`（一个 `Date` 或纪元毫秒）的对象 | [Sleep for a week, then ask for a review](/reliability/workflows#sleep-for-a-week-then-ask-for-a-review) |
| `ctx.waitForAny(name, conditions)` | 一个条件对象：`ctx.signalWait(signal, options)`（`key`，`match`），`ctx.timer(duration)`（一个持续时间，或包含 `until` 的对象），或一个子句柄。解析出获胜者的 `key` 和 `value` | [Wait for whichever comes first](/reliability/workflows#wait-for-whichever-comes-first) |
| `ctx.startChild(workflow, input, options)`, `ctx.executeChild(workflow, input, options)` | `id`（默认父 ID、工作流名称和一个计数，例如 `order-71e1973d/shipment#1`），`version`, `timeout`, `parentClose`（`'cancel'`, `'terminate'` 或 `'abandon'`；默认 `'cancel'`），`priority`（默认父级的），`concurrencyKey`, `rateLimitKey` | [Start child workflows](/reliability/workflows#start-child-workflows) |
| `ctx.setStatus(status)` | 一个最多 16 KiB 的 JSON 值，或 `undefined` 清除它 | [Report its status](/reliability/workflows#report-its-status) |
| `ctx.schedule` | 不是一个调用：调度的 `id` 和启动实例的发生时间 `at`，或 `null` | [Run workflows on a schedule](/reliability/workflows#run-workflows-on-a-schedule) |
| `WorkflowClient.start(workflow, input, options)` | `id`（默认一个随机 UUID，或来自步骤的步骤内），`version`（默认最高注册的），`timeout`（默认装饰器的），`transaction`, `priority`（1 到 2,097,151，先低后高；默认无，排在所有之前），`concurrencyKey`, `rateLimitKey`（替代限制计算的键） | [Start it with the order](/reliability/workflows#start-it-with-the-order), [Limit how many run at once](/reliability/workflows#limit-how-many-run-at-once) |
| `WorkflowClient.signal(signal, payload, options)` | `key`, `id`（只存储同名同 ID 的信号一次；来自步骤内的步骤），`transaction` | [Wait for the delivery webhook](/reliability/workflows#wait-for-the-delivery-webhook), [With CQRS](/reliability/workflows#with-cqrs) |
| `WorkflowClient.startAndWait(workflow, input, options, wait)` | `start()` 的选项，但不包括 `transaction`，以及 `result()` 的选项作为 `wait` | [Wait for a result](/reliability/workflows#wait-for-a-result) |
| `WorkflowClient.result(id, options)` | `timeout`（挂钟时间；默认无），`signal`（中止时停止等待） | [Wait for a result](/reliability/workflows#wait-for-a-result) |
| `WorkflowClient.getStatus(id, options)` | `journal`, `children` | [Report its status](/reliability/workflows#report-its-status), [Start child workflows](/reliability/workflows#start-child-workflows) |
| `WorkflowClient.cancel(id, reason)`, `terminate(id, reason)` | 无 | [Let customer support cancel an order](/reliability/workflows#let-customer-support-cancel-an-order), [Retry, delete or terminate](/reliability/workflows#retry-delete-or-terminate) |
| `WorkflowClient.list(filter)` | `status`（一个或一个列表），`workflow`, `version`, `parentId`, `scheduleId`, `limit`（默认 `100`），`offset` | [Deploy changes safely](/reliability/workflows#deploy-changes-safely) |
| `WorkflowClient.retry(id, options)` | `timeout`（从现在开始一个新的运行超时，或 `false` 表示无；默认实例的） | [Retry, delete or terminate](/reliability/workflows#retry-delete-or-terminate) |
| `WorkflowClient.delete(id, options)` | `force`（也删除未完成的实例；默认 `false`） | [Retry, delete or terminate](/reliability/workflows#retry-delete-or-terminate) |
| `WorkflowClient.purge(options)` | `olderThan`（必需），`status`（默认 `completed`, `failed` 和 `cancelled`），`batchSize`（默认 `500`） | [Purge finished instances](/reliability/workflows#purge-finished-instances) |
| `WorkflowClient.schedules`，或可注入的 `WorkflowSchedules` | `upsert(id, options)`（调度选项，包含 `workflow`，以及可选的 `version` 和一个 JSON `input`），`get(id)`, `list(filter)`（`workflow`, `limit`, `offset`），`remove(id)`, `pause(id)` 和 `resume(id)`（两者都不重新加密存储的输入），`trigger(id)`（在注册工作流的进程中，除非调度固定了一个 `version`），以及 `preview(schedule, options)`（调度的 ID 或时间；`from`，以及 `count`，默认 `10`） | [Run workflows on a schedule](/reliability/workflows#run-workflows-on-a-schedule) |
| `@StartOn(event, options)` | `id`（必需），`input`（默认事件），`priority`, `concurrencyKey`, `rateLimitKey`（像 `start()` 那样：一个值，或事件的函数，其中 `undefined` 保持默认值） | [With CQRS](/reliability/workflows#with-cqrs) |
| `@SignalOn(event, options)` | `signal`, `key`, `id`, `payload`（默认事件） | [With CQRS](/reliability/workflows#with-cqrs) |
| `EventBus.publish(event, context)`, `publishAll(events, context)`, 一个聚合的 `commit(context)`（`@nestjs/cqrs` 12.1 或更高版本） | `transaction`，从调度器上下文中读取一次 `WorkflowsCqrsModule` 被导入时 | [With CQRS](/reliability/workflows#with-cqrs) |

一个步骤的函数接收 `idempotencyKey`, `attempt`, `signal`, `progress` 和 `heartbeat()`；一个补偿函数接收相同的内容，外加工作流被撤销的原因。

在 `@Workflow()` 中声明或使用 `upsert()` 保存的调度器接受以下选项：

| 选项 | 默认值 | 含义 |
| --- | --- | --- |
| `id` | `@Workflow()` 中必需 | 在整个应用程序中唯一：字母、数字、`.`、`:`、`_` 和 `-`。`upsert()` 将其作为第一个参数 |
| `cron`, `every`, `rrule` | 三者中必需一个 | 一个 5 个字段的 cron 表达式，或 6 个字段且秒在前；一个至少一秒的间隔，从 `startAt` 开始计数；或一个 RFC 5545 重复规则 |
| `tz` | `'UTC'` | `cron` 和 `rrule` 的 IANA 时区。不使用 `every` |
| `startAt`, `endAt` | 无 | 在 `startAt` 之前或在 `endAt` 之后没有发生 |
| `limit` | 无 | 从开始到结束的发生次数 |
| `missed` | `'skip'` | 尚未有工作进程启动的发生次数：`'skip'`、`'once'` 或 `'all'` |
| `overlap` | `'skip'` | 在实例启动期间发生的发生次数：`'skip'`、`'allow'`、`'cancel-previous'` 或 `'buffer-one'` |
| `priority` | 无 | 实例的优先级 |
| `input` | 无 | 实例的输入：一个 JSON 值，或在 `@Workflow()` 中一个发生函数的返回值 |

##### 事件

`WorkflowEvents.events$` 发射每个事件，并将其发布到 `nestjs:workflows:<type>` 诊断通道，例如 `nestjs:workflows:step-failed`。每个负载都包含 `type`, `id`（实例）, `workflow`, `version` 和 `at`（引擎时间，毫秒）。

| 事件 | 其他字段 | 何时 |
| --- | --- | --- |
| `workflow-started` | 无 | 实例的首次执行开始 |
| `workflow-resumed` | `run` | 后续执行开始：等待、休眠、重试或崩溃后 |
| `workflow-suspended` | `wakeAt`, `waits` | 执行暂停了实例 |
| `step-completed` | `step`, `attempt`, `durationMs` | 步骤尝试成功 |
| `step-failed` | `step`, `attempt`, `error`, `retryAt` | 步骤尝试失败；当步骤放弃时，`retryAt` 为 `null` |
| `signal-received` | `wait`, `signal`, `signalId` | 等待接收到信号 |
| `signal-timed-out` | `wait`, `signal` | 等待的截止时间未收到匹配的信号 |
| `workflow-compensating` | `error` | 实例失败或被取消，并开始撤销 |
| `step-compensated` | `step`, `attempt` | 步骤的补偿完成 |
| `workflow-completed` | `output` | 实例完成 |
| `workflow-failed` | `error` | 实例失败，在补偿运行后 |
| `workflow-cancelled` | `error` | 实例被取消，在补偿运行后；`error.message` 是原因 |
| `workflow-compensation-failed` | `error` | 补偿在中间放弃。需要人工干预 |
| `journal-large` | `entries`, `bytes` | 日志达到 `journal.warnEntries` 或 `journal.warnBytes`；每个实例一次 |
| `workflow-retried` | `from`, `error` | `retry()` 重新打开了一个 `failed` 或 `compensation_failed` 实例；`error` 是它拥有的那个 |
| `workflow-deleted` | `status` | `delete()` 移除了一个实例；`status` 是它拥有的那个 |
| `custom-status` | `status` | 写入更改了实例的自定义状态 |
| `child-started` | `child`, `childWorkflow`, `childVersion` | 实例启动了一个子实例 |
| `schedule-skipped` | `reason` (`'missed'` 或 `'overlap'`), `from`, `to` | 调度器跳过了发生次数。其 `id` 是调度的 |

一个实例映射到一个跟踪上，无论哪些处理程序在其天或周上运行，因此按实例 `id` 键控跟踪。实例是根跨度，从 `workflow-started` 到其最终事件（`workflow-completed`, `workflow-failed`, `workflow-cancelled` 或 `workflow-compensation-failed`）。每个执行都是一个子跨度，从 `workflow-started` 或 `workflow-resumed` 到 `workflow-suspended` 或最终事件。每个步骤尝试都是其中的一个跨度，在 `step-completed` 结束，其 `durationMs` 提供其开始，或在 `step-failed` 结束。其他事件是执行跨度上的事件。跟踪工具订阅诊断通道，因此您的应用程序无需代码。

##### 错误

包的错误扩展自 `WorkflowError`，除了两个控制流错误或您需要抛出的错误。在失败的实例上找到的错误按名称存在于其 `error` 中。

| 错误 | HTTP 状态 | 发生时 |
| --- | --- | --- |
| `WorkflowIdConflictError` | `409` | 使用现有 id 但工作流或输入不同的 `start()`，使用另一个键对相同信号已使用的 `signal()`，或使用另一个工作流、父级或输入的 id 的 `startChild()` |
| `WorkflowNotFoundError` | `404` | 未知 id 的 `cancel()`, `terminate()`, `retry()`, `delete()` 或 `result()`，具有未知调度 id 的调度方法，或无法解析的工作流的调度 `start()` 或调度 `trigger()` |
| `WorkflowStateError` | `409` | 不是 `failed` 或 `compensation_failed` 的实例的 `retry()`，或其补偿已运行；没有 `force` 的未完成实例的 `delete()`；与实例发生其他变更竞争；声明的调度的 `upsert()` 或 `remove()` |
| `NonRetryableStepError` | 无 | 您从步骤中抛出以不重试地使步骤失败 |
| `StepFailedError` | 无 | 在 `run()` 内部，步骤放弃；`step`, `attempts` 以及原始错误的名称和消息作为 `cause` |
| `StepTimeoutError` | 无 | 步骤尝试运行超过其 `timeout` 或 `heartbeatTimeout`。已重试 |
| `WorkflowFailedError` | 无 | `ctx.fail()` 使实例失败。还包括对于未完成的实例，`result()` 和 `startAndWait()` 拒绝的内容，以及其 `instanceId`、其 `status` 和其错误作为 `cause` |
| `ChildWorkflowFailedError` | 无 | 子实例失败、被取消或终止：父级抛出什么 `ctx.executeChild()` 和子实例的 `result()`，以及子实例的 `workflow`, `instanceId`, `status` 和错误作为 `cause`。扩展自 `WorkflowFailedError` |
| `WorkflowResultTimeoutError` | 无 | `result()` 或 `startAndWait()` 等待超过其 `timeout`，带有 `instanceId` 和 `timeoutMs`。实例继续运行 |
| `WorkflowDefinitionError` | 无 | 单次运行中两次使用相同的名称，或步骤内部的 `ctx` 调用。实例在没有补偿的情况下失败 |
| `WorkflowNonDeterminismError` | 无 | 部署重命名、移除或重新排序了正在运行实例记录的步骤。扩展自 `WorkflowDefinitionError`。[Deploy changes safely](/reliability/workflows#deploy-changes-safely) |
| `WorkflowInterrupt` | 无 | 引擎的控制流（暂停、取消）。重新抛出它；`isWorkflowInterrupt()` 标识它 |
| `WorkflowTimeoutError` | 无 | 仅按名称，在运行超过运行超时实例上：它进行了补偿并失败 |
| `WorkflowCancelledError` | 无 | 仅按名称，在被取消的实例上：其消息是原因 |
| `WorkflowTerminatedError` | 无 | 仅按名称，在终止的实例上，该实例以 `cancelled` 结束：其消息是原因 |
| `WorkflowDeletedError` | 无 | 仅按名称，作为父级 `ChildWorkflowFailedError` 的原因，当 `delete()` 使用 `force` 在子实例结束前将其移除时 |
| `WorkflowJournalLimitError` | 无 | 仅按名称，在日志达到 `journal.maxEntries` 或 `journal.maxBytes` 的实例上：它进行了补偿并失败 |
| `WorkflowSchemaError` | 无 | `PostgresWorkflowStore` 或 `MySqlWorkflowStore` 的模式落后于包的迁移，同时 `migrate` 关闭，或应用它们失败（`cause`；在 MySQL 上，消息指明了下一个运行恢复的语句）：直到修复前，启动和每次调用都失败。使用 `schema`，其 `version` 和 `requiredVersion`。从 `@nestjs/workflows/postgres` 和 `@nestjs/workflows/mysql` |

`MySqlWorkflowStore` 还拒绝长度超过其列的 id、名称或键，带有 `RangeError`，在任何 SQL 执行之前（[MySQL store](/reliability/workflows#mysql-store)）。事务中的死锁以 MySQL 的错误 1213 形式到达您，存储不重试，因为它也回滚了您的写入。