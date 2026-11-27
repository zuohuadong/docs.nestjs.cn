<!-- 此文件从 content/reliability/locks.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:47:14.488Z -->
<!-- 源文件: content/reliability/locks.md -->
<!-- 源哈希: 8a784ff19e4d12b33d24a0e017957f52 -->

### 分布式锁

`@nestjs/locks` 在一次上调的定时任务或任何其他代码上，一次只在单个实例上运行，通过所有应用程序实例在共享存储中检查的租约来实现。

一家猫粮和用品的在线商店使用 `@nestjs/schedule` 运行两个定时任务。每天凌晨 02:00，一个导出任务将当天的发票发送到会计系统；每五分钟，一个对账任务向仓库请求完整的库存计数并将其写入产品表。两者只在一个实例上工作。在生产环境中，订单 API 运行在三个实例上，而 `@nestjs/schedule` 每 `@Cron()` 在每个实例上触发：

- 会计系统记录每张发票三次。
- 每五分钟会向仓库请求三次完整的库存计数。一次完整计数会遍历整个目录，在月末会花费超过五分钟，因此下一个时间点会启动第二个计数与第一个并行，然后是第三个。

常规的修复方法都有漏洞。一个 `RUN_JOBS=true` 实例在滚动部署导致有两个实例运行一分钟，或者任务实例是崩溃的那个实例时会失效。Redis 中的一个 `SET NX` 键在任务开始时有效，直到持有者暂停时间超过该键的 TTL，或者在停止世界垃圾回收或网络分区后失效：另一个实例获取该键，而第一个实例醒来后会认为自己仍然持有它并完成运行。再次出现两个写入者，且两者互不知情。`waitForCompletion: true` 在 `@Cron()` 上可以防止任务在单个实例上重叠。

`@nestjs/locks` 将任务变成一个单个实例持有的东西：一个**租约**，持有者在运行期间不断续订，并在所有实例共享的存储中检查。两个装饰器将其应用于定时任务，`@OnOneInstance()` 和 `@WithoutOverlapping()`，遵循 Laravel 的 `onOneServer()` 和 `withoutOverlapping()` 精神。在它们之下是一个分布式锁，您也可以自己实现，它需要锁的两个可信条件：一个在租约丢失时中止的 `AbortSignal`，以及一个随每次获取键而增长的**围栏令牌**，这样暂停超过租约的持有者的写入就可以被拒绝。领导者选举就是类似的租约，保持领导者存活期间有效。

在本教程中，您将使用 Drizzle 在 PostgreSQL 存储中添加它：

- 使用测试证明在三个应用实例上存在重复运行。
- 将锁保存在应用程序数据库的表中。
- 确保每个任务只在一个实例上运行，并在该实例死亡时进行交接。
- 保持长时间的库存计数不重叠。
- 围栏库存写入，以防止暂停的实例覆盖更新的计数。
- 通过管理员端点手动运行导出，绝不与定时运行并行。
- 改用 Redis 存储锁。
- 使用领导者选举在单个实例上持有仓库的警报源。

#### 安装

要开始，安装所需的依赖项：

```bash
$ npm i --save @nestjs/locks

```

#### 查看问题

这是教程之前的应用程序。夜间导出会获取所有尚未发票的已下订单，上传批次，并用批次 ID 标记订单：

```typescript title="invoices/invoice-export.job.step-1.ts"
import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { Cron } from '@nestjs/schedule';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../database/drizzle.js';
import { orders } from '../database/schema.js';
import { AccountingClient } from './accounting.client.js';

@Injectable()
export class InvoiceExportJob {
  private readonly logger = new Logger(InvoiceExportJob.name);

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly accountingClient: AccountingClient,
  ) {}

  @Cron(process.env.INVOICE_EXPORT_CRON ?? '0 2 * * *', { name: 'invoice-export', timeZone: 'Europe/Warsaw' })
  async exportInvoices() {
    // Every placed order without an invoice, not "yesterday's orders": a night
    // the export didn't run is caught up the next night.
    const pending = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.status, 'placed'), isNull(orders.invoicedAt)))
      .orderBy(orders.placedAt);
    if (pending.length === 0) {
      return;
    }

    const batch = await this.accountingClient.uploadInvoices(
      pending.map((order) => ({
        orderId: order.id,
        userId: order.userId,
        total: order.total,
        placedAt: order.placedAt.toISOString(),
      })),
    );
    await this.db
      .update(orders)
      .set({ invoicedAt: new Date(), invoiceBatch: batch.batchId })
      .where(inArray(orders.id, pending.map((order) => order.id)));
    this.logger.log(`Exported ${pending.length} invoices in batch ${batch.batchId}`);
  }
}

```

会计系统记录它收到的每个批次，因此上传两次的批次会被记录两次。对账任务向仓库请求计数并写入：

```typescript title="inventory/stock-reconciliation.job.step-1.ts"
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StockRepository } from './stock.repository.step-1.js';
import { WarehouseClient } from './warehouse.client.js';

@Injectable()
export class StockReconciliationJob {
  private readonly logger = new Logger(StockReconciliationJob.name);

  constructor(
    private readonly warehouseClient: WarehouseClient,
    private readonly stockRepository: StockRepository,
  ) {}

  @Cron(process.env.STOCK_RECONCILIATION_CRON ?? CronExpression.EVERY_5_MINUTES, { name: 'stock-reconciliation' })
  async reconcileStock() {
    const counts = await this.warehouseClient.stockCounts();
    const written = await this.stockRepository.writeStock(counts);
    this.logger.log(`Reconciled stock for ${written} products`);
  }
}

```

Cron 表达式来自环境变量，默认值是实际计划，因此测试和 [Try it](/reliability/locks#try-it) 部分可以加速或禁用它们。`AccountingClient` 和 `WarehouseClient` 代表两个外部系统；每个系统都执行了被要求执行的操作。数据库是应用程序的，在 `app.module.ts` 中使用 `DrizzleModule` 注册，并使用 `@InjectDrizzle()` 注入。

> info **提示** 教程直接读取 `process.env` 以保持简洁。在应用程序中，应通过 [`@nestjs/config`](/application/configuration) 加载环境变量并使用验证模式，这样缺失的变量会在启动时而不是在首次请求时停止应用程序，并从 `ConfigService` 读取值。

在更改任何内容之前，先证明问题。该测试在一个进程中启动了三个应用程序实例，使用一个数据库（使用 [PGlite](https://pglite.dev) 的进程内 PostgreSQL，或配置 PostgreSQL 服务器），并通过 `@nestjs/schedule` 自身的注册表触发每个实例的计划，就像 02:00 会做的那样：

```typescript title="test/step-1.duplicate-runs.e2e-spec.ts"
describe.each(targets)('three instances with plain @Cron() jobs, on %s', (_, target) => {
  let database: TestDatabase;
  let accounting: FakeAccounting;
  let warehouse: FakeWarehouse;
  let instances: TestingModule[];
  let logger: CapturingLogger;

  beforeEach(async (context) => {
    if (!target) {
      return context.skip();
    }
    database = await openDatabase(target, 'locks_step_1');
    accounting = new FakeAccounting();
    warehouse = new FakeWarehouse();
    logger = new CapturingLogger();
    instances = [];
    for (let i = 0; i < 3; i++) {
      instances.push(await startInstance({ database, module: StepOneApp, accounting, warehouse, logger }));
    }
  });
  afterEach(async () => {
    for (const app of instances ?? []) {
      await app.close();
    }
    await database?.close();
  });

  /**
   * 02:00: every instance's scheduler fires the job, through @nestjs/schedule's own
   * callback (which doesn't wait for the job to finish).
   */
  const tick = (name: string) =>
    Promise.all(instances.map((app) => app.get(SchedulerRegistry).getCronJob(name).fireOnTick()));

  it('records every invoice three times', async () => {
    await tick('invoice-export');
    await until(() => logger.matching('Exported 3 invoices').length === 3);
    const orders = ['ord_1001', 'ord_1002', 'ord_1004'];
    expect(booked(accounting)).toEqual([orders, orders, orders]);
    // The orders point at whichever batch wrote last; the accounting system has all three.
    const rows = await database.query<{ invoice_batch: string }>(
      "SELECT DISTINCT invoice_batch FROM orders WHERE status = 'placed'",
    );
    expect(rows).toHaveLength(1);
  });

  it('asks the warehouse for three full counts every five minutes', async () => {
    await tick('stock-reconciliation');
    await until(() => logger.matching('Reconciled stock').length === 3);
    expect(warehouse.counts).toBe(3);
  });
});

```

三个批次，每个批次包含相同的三个订单，以及三次完整的计数。之后 `orders` 表看起来没问题，每个订单都有一个批次 ID，这就是为什么直到会计调用时才未被察觉。

#### 将锁保存在数据库中

只要导入 `LocksModule`，它就会在一个内存存储上工作。该存储仅排除单个进程中的调用者：三个实例各自拥有自己的存储，所有三个都会获取“该”锁，而不会有任何变化。锁需要一个所有实例共享的存储，而该包不提供。它定义了契约，即 `LockStore` 接口，您将其在应用程序的提供者中实现，该提供者已拥有数据库。

本节展示了该存储两次：首先是使用 Drizzle 在 PostgreSQL 上，通过 [`@nestjs/drizzle`](https://docs.nestjs.com/data/drizzle) 注册，使用 `pg` 驱动（这是教程的路径），然后在“使用 TypeORM”部分末尾，展示了使用 TypeORM 作为 ORM 的应用程序的相同存储。选择其中一个，或者使用 [the store on Redis](/reliability/locks#the-store-on-redis) 将锁保存在 Redis 中。使用 Drizzle，一个锁对应一个键的行：

```typescript title="database/schema.ts"
// The locks, read and written by DrizzleLockStore: one row per lock key.

export const locks = pgTable('locks', {
  key: text('key').primaryKey(),
  /** The holder's id; null once released. */
  owner: text('owner'),
  fencingToken: bigint('fencing_token', { mode: 'number' }).notNull(),
  /** On the database's clock: every instance agrees on it. */
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

/** Fencing tokens for every key: a sequence never goes back, so they only grow. */
export const locksFencingTokenSeq = pgSequence('locks_fencing_token_seq');

```

drizzle-kit 写入迁移：

```bash
$ npx drizzle-kit generate --name=locks
$ npx drizzle-kit migrate

```

```sql
CREATE SEQUENCE "public"."locks_fencing_token_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "locks" (
	"key" text PRIMARY KEY NOT NULL,
	"owner" text,
	"fencing_token" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);

```

该契约有三个方法，每个方法首先接收锁键和一个 `owner`：该包为每次获取随机生成的 ID。持续时间以整毫秒为单位。

- `acquire(key, owner, ttl)` 如果没有活动锁持有该键，则获取该键，并返回锁的防错令牌，或报告该键已被占用。它必须是原子的：在任何并发调用者中，只有恰好一个可以获胜。
- `renew(key, owner, ttl)` 是心跳。如果 `owner` 仍然持有该键的活动锁，则将过期时间移动到从现在开始的 `ttl`。该包在持有锁期间每 `ttl / 3` 调用一次它。
- `release(key, owner)` 如果 `owner` 仍然持有锁，则释放锁。

“如果 `owner` 仍然持有它”必须在写入的同一语句中检查：先在单独的读取中检查，否则接管可能会在两者之间发生。并且存储使用自己的时钟测量 `ttl`，因此所有实例都就锁何时过期达成一致，而与它们的时钟读数无关。使用 Drizzle，这是一个条件插入和两个条件更新：

```typescript title="database/drizzle-lock.store.ts"
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { LocksStorage, type LockAcquireResult, type LockStore } from '@nestjs/locks';
import { and, eq, gt, sql } from 'drizzle-orm';
import type { Database } from './drizzle.js';
import { locks } from './schema.js';

/** `ttl` from now, on the database's clock. */
const expiresIn = (ttl: number) => sql`clock_timestamp() + ${ttl} * interval '1 millisecond'`;

/** The lock on `key`, if `owner` still holds it: the compare-and-set of renew() and release(). */
const heldBy = (key: string, owner: string) =>
  and(eq(locks.key, key), eq(locks.owner, owner), gt(locks.expiresAt, sql`clock_timestamp()`));

@Injectable()
export class DrizzleLockStore implements LockStore {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    storage: LocksStorage,
  ) {
    storage.registerSource(this);
  }

  async acquire(key: string, owner: string, ttl: number): Promise<LockAcquireResult> {
    // One statement: insert the lock, or take over a released or expired one. Of any number
    // of concurrent callers, one inserts or updates the row; the others find it held.
    const [row] = await this.db
      .insert(locks)
      .values({ key, owner, fencingToken: sql`nextval('locks_fencing_token_seq')`, expiresAt: expiresIn(ttl) })
      .onConflictDoUpdate({
        target: locks.key,
        // nextval() here runs after the row is locked: a later holder always gets a
        // greater token than the one before it. The row's own token is the floor, so a
        // sequence that went back (a restore, a failover) can't hand a key an old token.
        set: {
          owner,
          fencingToken: sql`greatest(nextval('locks_fencing_token_seq'), ${locks.fencingToken} + 1)`,
          expiresAt: expiresIn(ttl),
        },
        setWhere: sql`${locks.owner} is null or ${locks.expiresAt} <= clock_timestamp()`,
      })
      .returning({ fencingToken: locks.fencingToken });
    return row ? { acquired: true, fencingToken: row.fencingToken } : { acquired: false };
  }

  async renew(key: string, owner: string, ttl: number): Promise<boolean> {
    const rows = await this.db
      .update(locks)
      .set({ expiresAt: expiresIn(ttl) })
      .where(heldBy(key, owner))
      .returning({ key: locks.key });
    return rows.length === 1;
  }

  async release(key: string, owner: string): Promise<boolean> {
    // Keep the row, so the next acquire() always takes the update path above, whose token is
    // drawn after the row is locked.
    const rows = await this.db
      .update(locks)
      .set({ owner: null })
      .where(heldBy(key, owner))
      .returning({ key: locks.key });
    return rows.length === 1;
  }
}

```

关于此存储的几点：

- **`acquire()` 是一个语句。** 插入会赢得没有行的键；带有其 `WHERE` 的 `ON CONFLICT DO UPDATE` 会接管已释放或过期的键，并且 PostgreSQL 在锁定该行后会重新检查该 `WHERE`。在多个竞争相同键的调用者中，只有一个会收到一行，其余的什么也得不到。一个 `SELECT` 后面跟着一个 `INSERT` 会允许其中几个进入。
- **防错令牌来自一个序列**，在语句内部，在行锁之后生成。序列永不回退，因此每次获取键都会获得比之前更大的令牌，无论是否释放或过期。它存在间隙，因为输掉竞争的调用者仍然消耗了一个值；这不重要。`greatest()` 使行的自身令牌成为下一个令牌的下限：如果序列真的回退（从备份恢复、到滞后的副本故障转移），该键仍然无法获得它之前拥有的令牌。[Fence the writes](/reliability/locks#fence-the-writes) 显示了令牌的用途。
- **`release()` 保留行**并清除所有者，因此下一次获取总是走更新路径。如果执行删除，一个提前生成令牌的插入可能会在后续持有者已经释放它之后赢得该键，并分配一个较小的令牌。
- **`clock_timestamp()`，而不是 `now()`**：`now()` 是事务的开始时间，锁的过期时间不应依赖于此。
- 为什么是表而不是 `pg_advisory_lock()`：一个建议锁绑定到会话，因此持有者必须从连接池中保持一个连接用于整个关键部分，在不知道该连接何时断开的情况下会丢失锁，无法续期，并且对于暂停的持有者没有过期时间和防错令牌。行具有所有这些，无论使用哪个连接池。

该包将契约作为测试套件提供，因此您可以在依赖它之前验证存储。`lockStoreContract()` 为任何测试运行器返回案例，而 `concurrent: true` 添加了竞争条件：

```typescript title="test/step-2.drizzle-lock-store.e2e-spec.ts"
describe('DrizzleLockStore on PGlite, the LockStore contract', () => {
  const client = new PGlite();
  const db = drizzlePglite({ client }) as unknown as Database;
  beforeAll(() => migratePglite(db as never, { migrationsFolder }));
  afterAll(() => client.close());

  // The concurrency cases run too; with one connection, PGlite runs them one statement at a time.
  const cases = lockStoreContract(() => new DrizzleLockStore(db, new LocksStorage()), { concurrent: true });
  for (const c of cases) {
    it(c.name, c.run);
  }
});

```

该示例在具有 20 个连接池和 32 个竞争调用者的 PostgreSQL 服务器上运行相同的套件，此时语句确实有重叠。在 CI 中以这种方式运行，使用您在生产环境中运行的 PostgreSQL 版本。

现在将模块和存储注册到应用程序的 `DrizzleModule` 旁边。该存储是一个普通提供者；其构造函数会注册它，因此无需配置：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { DrizzleModule } from '@nestjs/drizzle';
import { LocksModule } from '@nestjs/locks';
import { ScheduleModule } from '@nestjs/schedule';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DrizzleLockStore } from './database/drizzle-lock.store.js';
import * as schema from './database/schema.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { InvoicesModule } from './invoices/invoices.module.js';

@Module({
  imports: [
    // A pg pool on DATABASE_URL, closed in onApplicationShutdown(), after running jobs
    // finished and handed their locks back. The jobs and the store inject it with @InjectDrizzle().
    DrizzleModule.forRootAsync({
      useFactory: () => ({ drizzle, connection: process.env.DATABASE_URL!, schema }),
    }),
    ScheduleModule.forRoot(),
    LocksModule.forRoot(),
    InvoicesModule,
    InventoryModule,
  ],
  providers: [DrizzleLockStore],
})
export class AppModule {}

```

`LocksModule.forRoot()` 接受一个 `ttl`（默认为 `'30s'`：在没有续期的情况下锁的存活时间，即崩溃后另一个实例接管的速度），一个 `storeTimeout`（默认为 `'10s'`：在每次存储调用前等待的时间，因此停止响应的存储不能挂起任务、请求或关闭），一个用于测试的 `clock`，以及 `allowInMemoryStorage`。`forRootAsync()` 从工厂获取相同的选项。该模块是全局的，因此 `Locks`、`LocksContext` 和 `LocksStorage` 在任何地方都可用。初始化时，它会记录正在使用的存储：

```bash
[Nest] 1270  - 09/24/2026, 9:44:02 AM     LOG [LocksModule] LocksStorage: DrizzleLockStore

```

如果没有注册任何内容，则行名显示为 `InMemoryLockStore` 及其含义。如果使用 `NODE_ENV=production` 但没有注册任何内容，应用程序不会启动，因为在内存中每个实例都会获取相同的锁并运行相同的任务：

```bash
Error: LocksStorage: no LockStore is registered, and NODE_ENV is "production": in memory, a lock only excludes callers in this process, so every instance of the app would take the same lock and run the same job. Implement LockStore in a provider that injects LocksStorage and calls `storage.registerSource(this)` in its constructor, or set `allowInMemoryStorage: true` in the LocksModule options to run in memory anyway (one instance).

```

**使用 TypeORM。** 针对 ORM 是 TypeORM 的应用程序，使用相同的表和序列的相同存储。Drizzle 保持了教程的路径：使用此存储而不是上面那个，而不是旁边那个。该表是一个实体，每个列都声明了其类型，因此 TypeORM CLI 在不加载装饰器元数据的情况下看到与应用程序相同的模式：

```typescript title="typeorm/lock.entity.ts"
import { Column, Entity, PrimaryColumn } from 'typeorm';

// The locks table, read and written by TypeOrmLockStore: the same table as the Drizzle
// schema in src/database/schema.ts. Every column states its type, so the entity loads the
// same with or without emitted decorator metadata (the TypeORM CLI runs it through tsx,
// which emits none).

@Entity('locks')
export class LockEntity {
  @PrimaryColumn({ type: 'text' })
  key: string;

  /** The holder's id; null once released. */
  @Column({ type: 'text', nullable: true })
  owner: string | null;

  /** Drawn from locks_fencing_token_seq, which the migration creates. `pg` returns a bigint as a string. */
  @Column({ type: 'bigint', name: 'fencing_token' })
  fencingToken: string;

  /** On the database's clock: every instance agrees on it. */
  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;
}

```

TypeORM CLI 和 `TypeOrmModule` 在数据源文件中共享一组选项：

```typescript title="typeorm/data-source.ts"
import { DataSource, type DataSourceOptions } from 'typeorm';
import { LockEntity } from './lock.entity.js';
import { Locks1790321710846 } from './migrations/1790321710846-Locks.js';

/** What the application's TypeOrmModule and the TypeORM CLI share. */
export const dataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [LockEntity],
  migrations: [Locks1790321710846],
} satisfies DataSourceOptions;

// The TypeORM CLI's data source: `migration:generate` compares the entities with this database.
export default new DataSource(dataSourceOptions);

```

从实体生成迁移，针对已应用了先前迁移的数据库。CLI 需要一个用于数据源文件的 TypeScript 加载器；这使用了 `tsx`：

```bash
$ npx tsx ./node_modules/typeorm/cli.js migration:generate src/typeorm/migrations/Locks -d src/typeorm/data-source.ts --pretty
Migration /store/src/typeorm/migrations/1790321710846-Locks.ts has been generated successfully.

```

TypeORM 没有序列的实体，因此它写入的迁移只创建了表。在表之前手动添加序列，并在 `down()` 中删除它：

```typescript title="typeorm/migrations/1790321710846-Locks.ts"
import { MigrationInterface, QueryRunner } from "typeorm";

export class Locks1790321710846 implements MigrationInterface {
    name = 'Locks1790321710846'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Added by hand: TypeORM has no entity for a sequence, so the CLI doesn't generate it.
        await queryRunner.query(`
            CREATE SEQUENCE "locks_fencing_token_seq"
        `);
        await queryRunner.query(`
            CREATE TABLE "locks" (
                "key" text NOT NULL,
                "owner" text,
                "fencing_token" bigint NOT NULL,
                "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_c6e1e10d298aec42ba087dd57e5" PRIMARY KEY ("key")
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP TABLE "locks"
        `);
        await queryRunner.query(`
            DROP SEQUENCE "locks_fencing_token_seq"
        `);
    }

}

```

数据源中的 `migrations` 列出了它。应用它，并检查实体和数据库是否一致。该检查不比较序列，因此您添加的序列不被视为更改：

```bash
$ npx tsx ./node_modules/typeorm/cli.js migration:run -d src/typeorm/data-source.ts
$ npx tsx ./node_modules/typeorm/cli.js migration:generate src/typeorm/migrations/Check -d src/typeorm/data-source.ts --check
No changes in database schema were found

```

现在，存储遵循与 Drizzle 相同的规则：

```typescript title="typeorm/typeorm-lock.store.ts"
import { Injectable } from '@nestjs/common';
import { LocksStorage, type LockAcquireResult, type LockStore } from '@nestjs/locks';
import { DataSource } from 'typeorm';
import { LockEntity } from './lock.entity.js';

/** `ttl` from now, on the database's clock. */
const EXPIRES_IN = "clock_timestamp() + :ttl * interval '1 millisecond'";

/** The lock on `key`, if `owner` still holds it: the compare-and-set of renew() and release(). */
const HELD_BY = 'key = :key AND owner = :owner AND expires_at > clock_timestamp()';

@Injectable()
export class TypeOrmLockStore implements LockStore {
  constructor(
    private readonly dataSource: DataSource,
    storage: LocksStorage,
  ) {
    storage.registerSource(this);
  }

  async acquire(key: string, owner: string, ttl: number): Promise<LockAcquireResult> {
    // One statement: insert the lock, or take over a released or expired one. It is SQL
    // because the takeover draws its token from the locked row, which orUpdate() can't
    // express: it sets each column from EXCLUDED, whose nextval() ran before the row lock.
    const rows: { fencing_token: string }[] = await this.dataSource.query(
      `INSERT INTO locks (key, owner, fencing_token, expires_at)
       VALUES ($1, $2, nextval('locks_fencing_token_seq'), clock_timestamp() + $3 * interval '1 millisecond')
       ON CONFLICT (key) DO UPDATE SET
         owner = EXCLUDED.owner,
         fencing_token = greatest(nextval('locks_fencing_token_seq'), locks.fencing_token + 1),
         expires_at = clock_timestamp() + $3 * interval '1 millisecond'
       WHERE locks.owner IS NULL OR locks.expires_at <= clock_timestamp()
       RETURNING fencing_token`,
      [key, owner, ttl],
    );
    const [row] = rows;
    // `pg` returns a bigint as a string; the package takes the token as a number.
    return row ? { acquired: true, fencingToken: Number(row.fencing_token) } : { acquired: false };
  }

  async renew(key: string, owner: string, ttl: number): Promise<boolean> {
    const { affected } = await this.dataSource
      .createQueryBuilder()
      .update(LockEntity)
      .set({ expiresAt: () => EXPIRES_IN })
      .where(HELD_BY, { key, owner, ttl })
      .execute();
    return affected === 1;
  }

  async release(key: string, owner: string): Promise<boolean> {
    // Keep the row, so the next acquire() always takes the update path above, whose token is
    // drawn after the row is locked.
    const { affected } = await this.dataSource
      .createQueryBuilder()
      .update(LockEntity)
      .set({ owner: null })
      .where(HELD_BY, { key, owner })
      .execute();
    return affected === 1;
  }
}

```

- **`acquire()` 是用 SQL 编写的单个语句**，通过 `dataSource.query()` 实现。插入查询构建器的 `orUpdate()` 会写入一个 `ON CONFLICT DO UPDATE`，在其 `WHERE` 选项中包含 `overwriteCondition`，但它从 `EXCLUDED` 设置了每个列：该令牌将是插入在行被锁定之前获取的，而后续持有该键的人可能已经通过了。SQL 在行锁之后，像 Drizzle 存储那样，在 `SET` 中获取它。
- **`renew()` 和 `release()`** 是带有所有者和过期时间的更新查询构建器，并在 `WHERE` 中，读取 `affected`。绝不先 `save()`，也不先 `findOneBy()`：在写入之前读取会导致接管在两者之间发生。
- **令牌通过 `Number()` 转换**。`pg` 以字符串形式返回一个 `bigint` 列，而该包拒绝字符串令牌。
- **用它**替换 Drizzle 存储：在 `AppModule` 的 `TypeOrmModule.forRoot(dataSourceOptions)` 中，并在其提供者中使用 `TypeOrmLockStore` 而不是 `DrizzleLockStore`。它注入了 `DataSource`，该 `TypeOrmModule` 提供，启动行命名为 `TypeOrmLockStore`。

契约套件在不更改的情况下运行，包括并发情况。TypeORM 通过 `pg` 连接，因此该套件需要一个 PostgreSQL 服务器，否则会被跳过。另外三个案例检查了序列回退后键的令牌持续增长、实体和迁移是否一致（`migration:generate --check` 检查的内容），以及存储在模块中提供时是否注册：

```typescript title="test/typeorm-lock.store.e2e-spec.ts"
/**
 * TypeOrmLockStore against the package's contract suite (`@nestjs/locks/testing`), on
 * PostgreSQL (the server in SQL_TEST_PG_URL, else a throwaway local cluster; see
 * test-support/postgres.ts), with the migration the TypeORM CLI generated. A pool, so the
 * concurrency cases race for real. Skipped, with the reason, without a server.
 */
import { Logger } from '@nestjs/common';
import { LocksModule, LocksStorage } from '@nestjs/locks';
import { lockStoreContract } from '@nestjs/locks/testing';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { startPostgres } from '../../../test-support/postgres.js';
import { dataSourceOptions } from '../src/typeorm/data-source.js';
import { TypeOrmLockStore } from '../src/typeorm/typeorm-lock.store.js';

const { postgres, reason } = await startPostgres();
afterAll(() => postgres?.stop());

describe.skipIf(!postgres)(`TypeOrmLockStore on PostgreSQL${postgres ? '' : ` (skipped: ${reason})`}`, () => {
  let dataSource: DataSource;
  let url: string;

  beforeAll(async () => {
    url = await postgres!.createDatabase('locks_typeorm_store');
    dataSource = await new DataSource({ ...dataSourceOptions, url, poolSize: 20 }).initialize();
    await dataSource.runMigrations();
  });
  afterAll(() => dataSource?.destroy());

  describe('the LockStore contract', () => {
    // The expiry cases wait in real time: the store reads the database's clock.
    const cases = lockStoreContract(() => new TypeOrmLockStore(dataSource, new LocksStorage()), { concurrent: { callers: 32 } });
    for (const c of cases) {
      it(c.name, c.run);
    }
  });

  it("keeps a key's tokens growing after the sequence went back (a restore, a failover to a lagging replica)", async () => {
    const store = new TypeOrmLockStore(dataSource, new LocksStorage());
    const key = `reset-${Date.now()}`;
    await dataSource.query("SELECT setval('locks_fencing_token_seq', 1000)");
    const before = await store.acquire(key, 'a', 5_000);
    expect(before.acquired).toBe(true);
    expect(await store.release(key, 'a')).toBe(true);
    await dataSource.query('ALTER SEQUENCE locks_fencing_token_seq RESTART WITH 1');
    const after = await store.acquire(key, 'b', 5_000);
    expect(after.acquired).toBe(true);
    expect((after as { fencingToken: number }).fencingToken).toBeGreaterThan((before as { fencingToken: number }).fencingToken);
  });

  it('has a migration that matches the entity (what `migration:generate --check` checks)', async () => {
    const { upQueries } = await dataSource.driver.createSchemaBuilder().log();
    expect(upQueries.map((query) => query.query)).toEqual([]);
  });

  it('registers itself when provided in a module', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const app = await Test.createTestingModule({
      imports: [TypeOrmModule.forRoot({ ...dataSourceOptions, url }), LocksModule.forRoot()],
      providers: [TypeOrmLockStore],
    }).compile();
    await app.init();
    try {
      expect(app.get(LocksStorage).source).toBe(app.get(TypeOrmLockStore));
      expect(log).toHaveBeenCalledWith('LocksStorage: TypeOrmLockStore');
    } finally {
      log.mockRestore();
      await app.close();
    }
  });
});

```

> info **提示** 使用 Prisma？ [The store contract](/reliability/locks#the-store-contract)，教程之后列出了存储必须保证的内容以及 Prisma 如何表达原子方法。使用相同的案例测试您的存储。

#### 在单个实例上运行每个任务

将 `@OnOneInstance()` 添加到两个任务中，紧邻 `@Cron()`：

```typescript title="invoices/invoice-export.job.step-3.ts"
import { OnOneInstance } from '@nestjs/locks';
import { Cron } from '@nestjs/schedule';

```

```typescript title="invoices/invoice-export.job.step-3.ts"
@Cron(process.env.INVOICE_EXPORT_CRON ?? '0 2 * * *', { name: 'invoice-export', timeZone: 'Europe/Warsaw' })
@OnOneInstance({ key: 'invoices:nightly-export' })
async exportInvoices() {

```

```typescript title="inventory/stock-reconciliation.job.step-3.ts"
@Cron(process.env.STOCK_RECONCILIATION_CRON ?? CronExpression.EVERY_5_MINUTES, { name: 'stock-reconciliation' })
@OnOneInstance({ key: 'inventory:stock-reconciliation' })
async reconcileStock() {

```

这就是全部更改。它做了什么：

- **第一个触发任务的调度器的实例获取任务的租约**，一个以键命名的锁，带有 `:owner` 后缀，并持续每 `ttl / 3` 续订，直到它停止。它运行此刻以及之后的所有刻。
- **在其他实例上，该刻被跳过**：调用在不运行方法的情况下解析，调试行说明了原因，并且 `LocksEvents.jobSkips$` 报告了它（[Events](/reliability/locks#事件)）。没有内容被排队；任务的调度就是调度。
- **当所有者死亡时**，它停止续订，租约在 `ttl`（30 秒）后过期，第一个在之后到达刻的实例接管任务。当所有者干净地关闭时，它完成正在进行的运行，释放租约，然后任何地方的下一个刻都会接管。
- **装饰器包装了方法**。`@nestjs/schedule` 没有被打补丁，并且它不知道装饰器存在：其探查器在包装器上找到 `@Cron()` 元数据，无论装饰器顺序如何，并调用包装器，包装器询问 `LocksModule` 此调用是否可以运行。`@Interval()` 和 `@Timeout()` 任务以相同方式工作，调用方法本身也是如此。
- **键** 默认为 `ClassName.methodName`。将其设置在绝不能运行两次的任务上：重命名类或方法会更改默认值，在滚动部署期间，旧实例和新实例都会运行该任务一次。具有相同默认键的两个任务在启动时失败，一个键是另一个任务的租约（`<key>:owner`）或选举的键的任务也会失败：它们会静默地相互排除。

所有权是故意的粘性。每个刻的竞争会更简单，但一个刻不是即时的：实例的时钟相差数十毫秒，因此每个刻的锁必须比偏差的运行时间更长，而快速任务需要一个“已运行于”记录，以防止滞后的实例再次运行该刻。在刻之间持有的租约没有这些，代价是一个实例运行了整个任务的刻，而计划任务很少介意这一点。

那么没人运行的刻呢？在所有者宕机期间，最多跳过 `ttl` 个刻，夜间导出可能落在这个三十秒内。**错过的刻不会补齐**：没有记录任务上次运行的时间。编写执行所有应做事情的任务，而不是“昨天的”。导出会获取所有没有发票的订单，因此如果某晚没有运行，会在第二天补齐；协调写入当前的计数，因此错过一个刻的代价是五分钟的陈旧。一个每个刻执行不同操作的任务在其自己的表中保留了该记录。

来自 [See the problem](/reliability/locks#see-the-problem) 的测试，使用新任务和存储，现在每次只记录一次发票，并且停止实例续订的测试（其时钟静止，就像进程已死亡一样）显示了交接：

```typescript title="test/step-3.one-instance.e2e-spec.ts"
it('records every invoice once, and counts the stock once per tick', async () => {
  const apps = [await start(), await start(), await start()];
  await tick(apps, 'export');
  expect(booked(accounting)).toEqual([['ord_1001', 'ord_1002', 'ord_1004']]);
  await tick(apps, 'reconcile');
  await tick(apps, 'reconcile');
  expect(warehouse.counts).toBe(2);
  expect(logger.matching(/runs on this instance \(lease "inventory:stock-reconciliation:owner"/)).toHaveLength(1);
  expect(logger.matching('Skipped StockReconciliationJob.reconcileStock: it runs on another instance')).toHaveLength(4);
});

```

```typescript title="test/step-3.one-instance.e2e-spec.ts"
it('moves the job to another instance when its owner dies, after ttl', async () => {
  // A's clock stands still: it stops renewing, as if its process died.
  const crashed = await start({ clock: new ManualLockClock(), ttl: '1s' });
  const survivor = await start({ ttl: '1s' });
  await tick([crashed, survivor], 'export');
  expect(booked(accounting)).toHaveLength(1);

  await database.query("INSERT INTO orders (id, user_id, items, total, status, placed_at) VALUES ('ord_1005', 'usr_dave', '[]', 999, 'placed', now())");
  expect(await survivor.get(InvoiceExportJob).exportInvoices()).toBeUndefined(); // the lease is still A's
  await sleep(1_200); // the database's clock passes A's lease
  await survivor.get(InvoiceExportJob).exportInvoices();
  expect(booked(accounting)).toEqual([['ord_1001', 'ord_1002', 'ord_1004'], ['ord_1005']]);
});

```

`ManualLockClock` 是测试的包时钟：只有在被告知时才会移动。在该时钟上的实例永远不会续订，因此数据库在其自身时钟上在 `ttl` 后过期实例的锁。

#### 不要让长时间运行的实例相互重叠

`@OnOneInstance()` 将协调放在一个实例上。它不会阻止该实例在上次运行仍在进行时启动下一次计数，普通的 `@Cron()` 也不会。在月底，计数时间超过五分钟，因此仓库会得到第二次完整的计数，然后是第三次。添加 `@WithoutOverlapping()`：

```typescript title="inventory/stock-reconciliation.job.step-4.ts"
@Cron(process.env.STOCK_RECONCILIATION_CRON ?? CronExpression.EVERY_5_MINUTES, { name: 'stock-reconciliation' })
@OnOneInstance({ key: 'inventory:stock-reconciliation' })
@WithoutOverlapping()
async reconcileStock() {

```

现在一次运行会获取第二个锁，该锁以相同的键命名（一个方法上的两个装饰器共享它），在整个运行期间持有它，并续订它，并在运行结束时释放它。发现锁被持有的刻将被跳过，在该实例或任何其他实例上：长时间计数的刻被丢弃，然后运行第一个后续刻。如果运行崩溃，锁在 `ttl` 后过期，然后运行下一个刻。单独使用 `@WithoutOverlapping()`，不使用 `@OnOneInstance()`，意味着“任何实例，一次运行”。

该测试在单个 `ManualLockClock` 上驱动两个实例，保持计数开启，并通过三个刻推进时钟：

```typescript title="test/step-4.without-overlapping.e2e-spec.ts"
it('with @WithoutOverlapping(), every tick during the run is skipped, then the next one runs', async () => {
  const [owner, other] = [await start(StepFourJob), await start(StepFourJob)];
  const slow = warehouse.pauseNext();
  const first = owner!.reconcileStock();
  await until(() => warehouse.counts === 1);
  for (let tick = 0; tick < 3; tick++) {
    await clock.advance('5m'); // the run goes on, its locks renewed
    await Promise.all([owner!.reconcileStock(), other!.reconcileStock()]);
  }
  expect(warehouse.counts).toBe(1);
  expect(logger.matching('Skipped StockReconciliationJob.reconcileStock: a run is still in progress')).toHaveLength(3);
  expect(logger.matching('Skipped StockReconciliationJob.reconcileStock: it runs on another instance')).toHaveLength(3);
  slow.resume();
  await first;
  await clock.advance('5m');
  await Promise.all([owner!.reconcileStock(), other!.reconcileStock()]);
  expect(warehouse.counts).toBe(2);
});

```

`clock.advance('5m')` 按照顺序触发所有到期的续订，并等待每个续订到达存储，因此长时间运行的十五分钟只花费了一瞬间，在此期间运行的锁一直得到续订。

#### 围栏写入

租约无法阻止已暂停的持有者。在实例 A 上进行协调：它从仓储读取计数（鲑鱼饲料：12），然后 A 停顿，在停止世界的垃圾回收、交换、VM 迁移、调试器中。它停止续订。三十秒后，数据库过期其锁，B 在其下一个滴答时接管任务：它读取更新的计数（自那时以来已售出并发货三包：鲑鱼饲料：9）并写入它们。然后 A 恢复并完成其运行，使用暂停前读取的计数。鲑鱼饲料恢复到 12，而商店销售了它没有的三包。

A 的信号在下一次续订时中止，此时数据库拒绝它，但已在途的写入会通过。注意租约做了什么和没有做什么的承诺。持有者计算自己的截止时间，`ttl` 从它发送最后一次存储确认的续订时刻开始，而该确认是在存储处理它之前发生的：正在运行的持有者不会晚于存储的过期时间放弃，因此其信号在任何其他实例可以获取密钥之前中止。该窗口仅存在于未运行的持有者（暂停、停止、事件循环被阻塞）：从存储过期到它再次运行时，它仍然认为自己持有锁。阻止其写入的是**围栏令牌**：每次获取密钥都会获得一个大于该密钥之前所有令牌的令牌，被写入的资源会保留其看到的最高令牌，并拒绝较低的令牌。A 的令牌低于 B 的，因此 A 的延迟写入不会更新任何内容。

产品表为此添加了一列：

```typescript title="database/schema.ts"
export const products = pgTable('products', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** In cents. */
  price: integer('price').notNull(),
  inStock: integer('in_stock').notNull(),
  /** The fencing token of the stock reconciliation run that last wrote `inStock`. */
  stockFencingToken: bigint('stock_fencing_token', { mode: 'number' }).notNull().default(0),
});

```

```bash
$ npx drizzle-kit generate --name=stock_fencing_token
$ npx drizzle-kit migrate

```

```sql
ALTER TABLE "products" ADD COLUMN "stock_fencing_token" bigint DEFAULT 0 NOT NULL;

```

仓储仅在没有具有更高令牌的运行写入该产品时才写入计数，并在同一语句中记录其写入的令牌：

```typescript title="inventory/stock.repository.ts"
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, lte } from 'drizzle-orm';
import type { Database } from '../database/drizzle.js';
import { products } from '../database/schema.js';
import type { StockCount } from './warehouse.client.js';

@Injectable()
export class StockRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /**
   * Writes the counts a reconciliation run read, fenced by the run's token: a product that a
   * newer run (a greater token) already wrote is left alone.
   */
  async writeStock(counts: StockCount[], fencingToken: number): Promise<{ written: number; stale: number }> {
    let written = 0;
    for (const { productId, count } of counts) {
      const rows = await this.db
        .update(products)
        .set({ inStock: count, stockFencingToken: fencingToken })
        .where(and(eq(products.id, productId), lte(products.stockFencingToken, fencingToken)))
        .returning({ id: products.id });
      written += rows.length;
    }
    return { written, stale: counts.length - written };
  }
}

```

该任务从 `LocksContext` 获取其令牌和信号。`@nestjs/schedule` 调用无参数方法，因此上下文通过 `AsyncLocalStorage` 传递给任务调用的每个服务：

```typescript title="inventory/stock-reconciliation.job.ts"
import { Injectable, Logger } from '@nestjs/common';
import { LocksContext, OnOneInstance, WithoutOverlapping } from '@nestjs/locks';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StockRepository } from './stock.repository.js';
import { WarehouseClient } from './warehouse.client.js';

@Injectable()
export class StockReconciliationJob {
  private readonly logger = new Logger(StockReconciliationJob.name);

  constructor(
    private readonly warehouseClient: WarehouseClient,
    private readonly stockRepository: StockRepository,
    private readonly locksContext: LocksContext,
  ) {}

  @Cron(process.env.STOCK_RECONCILIATION_CRON ?? CronExpression.EVERY_5_MINUTES, { name: 'stock-reconciliation' })
  @OnOneInstance({ key: 'inventory:stock-reconciliation' })
  @WithoutOverlapping()
  async reconcileStock() {
    const { fencingToken, signal } = this.locksContext;
    // Aborts the count if this run loses its lock...
    const counts = await this.warehouseClient.stockCounts({ signal });
    // ...and the token stops a write that slips through anyway.
    const { written, stale } = await this.stockRepository.writeStock(counts, fencingToken!);
    if (stale > 0) {
      this.logger.warn(`Skipped ${stale} stale stock writes: a newer run (token > ${fencingToken}) wrote those products`);
    }
    this.logger.log(`Reconciled stock for ${written} products (fencing token ${fencingToken})`);
  }
}

```

该令牌是运行锁的，每次运行都有一个新且更高的令牌。当运行锁或实例的租约丢失时，信号中止，其原因是一个 `LockLostError`，说明了如何检测到丢失：存储拒绝了续订，或者 `ttl` 在未到达存储的情况下通过。将信号传递给任务调用的 `fetch`，即数据库驱动程序、HTTP 客户端；忽略它的任务会继续运行，就像任何进程中一样。没有进程被杀死。

该测试针对 PostgreSQL 重现了暂停。实例 A 在一个 `ManualLockClock` 上运行，因此它停止续订；仓储客户端在 A 读取后保持 A 的计数打开；货架发生变化；B 在 1.2 秒后接管（测试的 `ttl` 是一秒）并写入鲑鱼饲料：9。然后 A 的计数恢复：

```typescript title="test/step-5.fencing.e2e-spec.ts"
it('without fencing, the paused instance overwrites the fresh count with its stale one', async () => {
  const { stale, resume } = await pauseAWhileBTakesOver(UnfencedJob);
  resume(); // A wakes up and writes what it read before the pause
  expect(await stale).toBeUndefined();
  expect(await kibble()).toBe(12); // three bags the store doesn't have
});

it("with the run's fencing token, the database refuses the stale write", async () => {
  const { stale, resume } = await pauseAWhileBTakesOver(StockReconciliationJob);
  resume(); // A wakes up before it noticed it lost its locks, and writes
  expect(await stale).toBeUndefined();
  expect(await kibble()).toBe(9);
  expect(logger.matching(/WARN Skipped 3 stale stock writes: a newer run \(token > \d+\) wrote those products/)).toHaveLength(1);
  const tokens = await database.query<{ stock_fencing_token: string }>('SELECT DISTINCT stock_fencing_token FROM products');
  expect(tokens).toHaveLength(1); // every product carries B's token
});

it('a run that notices it lost its lock stops at its signal, before writing', async () => {
  const { stale, resume } = await pauseAWhileBTakesOver(StockReconciliationJob);
  await clockA.advance('1s'); // A's clock moves: its next renewal is refused
  expect(await stale).toBeInstanceOf(LockLostError);
  resume();
  expect(await kibble()).toBe(9);
  expect(logger.matching(/WARN Lost the lock "inventory:stock-reconciliation(:owner)?"/).length).toBeGreaterThan(0);
});

```

使用前一节中的任务，陈旧的写入会通过，鲑鱼饲料恢复到 12。使用令牌时，数据库拒绝它，任务记录了它跳过了三次陈旧写入。一个在写入前到达下一次续订的运行会在信号处停止，带有 `LockLostError`，不写入任何内容。包为每个丢失的锁记录一个警告并发出一个 `lock-lost` 事件，因为丢失的锁意味着另一个实例可能当前处于同一临界区：只有令牌将两者隔开。

#### 手动运行导出

会计有时要求在 02:00 之前导出。一个管理员端点运行它，并且它绝不能与计划运行同时在任何实例上运行。计划运行持有由其密钥命名的锁；端点使用 `Locks.withLock()` 相同的锁，等待最多两秒以完成即将结束的运行：

```typescript title="invoices/invoice-exports.controller.ts"
import { ConflictException, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { LockNotAcquiredError, Locks } from '@nestjs/locks';
import { AdminGuard } from '../admin/admin.guard.js';
import { INVOICE_EXPORT_LOCK, InvoiceExportJob } from './invoice-export.job.js';

@Controller('admin/invoice-exports')
@UseGuards(AdminGuard)
export class InvoiceExportsController {
  constructor(
    private readonly locks: Locks,
    private readonly invoiceExportJob: InvoiceExportJob,
  ) {}

  /** Runs the export now, unless a run (scheduled or not) holds its lock. */
  @Post()
  @HttpCode(200)
  async exportNow() {
    try {
      return await this.locks.withLock(INVOICE_EXPORT_LOCK, () => this.invoiceExportJob.export(), { wait: '2s' });
    } catch (error) {
      if (error instanceof LockNotAcquiredError) {
        throw new ConflictException('An invoice export is already running. Try again when it has finished.');
      }
      throw error;
    }
  }
}

```

该任务将密钥作为常量导出，也获取了 `@WithoutOverlapping()`，并将工作从计划方法中拆分出来，以便端点可以调用它并返回其结果：

```typescript title="invoices/invoice-export.job.ts"
/** The export's lock: held by a run, scheduled or started by hand. */
export const INVOICE_EXPORT_LOCK = 'invoices:nightly-export';

export interface InvoiceExportResult {
  exported: number;
  batchId?: string;
}

```

```typescript title="invoices/invoice-export.job.ts"
@Cron(process.env.INVOICE_EXPORT_CRON ?? '0 2 * * *', { name: 'invoice-export', timeZone: 'Europe/Warsaw' })
@OnOneInstance({ key: INVOICE_EXPORT_LOCK })
@WithoutOverlapping()
async exportInvoices() {
  await this.export();
}

/** Call it under the INVOICE_EXPORT_LOCK lock. */
async export(): Promise<InvoiceExportResult> {

```

`withLock(key, fn, options)` 在锁下运行 `fn`，无论 `fn` 解析还是抛出，都会释放它。`wait` 是尝试的持续时间，带有退避，在此之前它会用一个 `LockNotAcquiredError` 放弃；默认是尝试一次。`acquire(key, options)` 没有回调时也是如此：它解析一个 `Lock`，或者在获取密钥时解析一个 `null`，您自己释放它，或者使用 `await using`。一个 `Lock` 具有 `fencingToken` 和 `signal`，在 `withLock()` 内部也具有，与任务完全相同。

两者还各自获取了一个 `signal`，例如请求，这会停止等待。它也会停止等待存储：仍在等待存储答案的调用会以信号的原因拒绝，`fn` 不会运行，存储之后授予的锁会返回给它。`wait` 不会截断已在途的存储调用；模块的 `storeTimeout` 会，因此调用最多需要 `wait` 加上 `storeTimeout`。在 `storeTimeout` 内未响应的存储会用一个 `LockStoreTimeoutError` 失败调用。

`LockNotAcquiredError` 和 `LockStoreTimeoutError` 都不携带 HTTP 状态：竞争和停滞的存储都不是调用者的错误，因此由处理器决定。在这里，被占用的锁是一个 `409`，其他任何内容都会重新抛出。当导出手动运行时，任何实例上的计划滴答都会发现锁被持有并跳过。

> info **提示** `AdminGuard` 是一个占位符。使用应用程序的真实 [authorization](/security/authorization) 来保护路由。

#### Redis 上的存储

存储是一个契约，因此它可以存在于您的实例已满足的任何位置。如果它是 Redis，则每个方法都是一个 Lua 脚本，Redis 会原子的执行它：

```typescript title="redis/redis-lock.store.ts"
import { Inject, Injectable } from '@nestjs/common';
import { LocksStorage, type LockAcquireResult, type LockStore } from '@nestjs/locks';
import { REDIS } from './redis.module.js';

/** The one ioredis method this store needs. */
export interface RedisEval {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

// Takes the lock if nobody holds it, expiring on Redis's clock, and draws a fencing token
// from a counter that never goes back. Returns the token, or 0.
const ACQUIRE = `
if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[2]) then
  return redis.call('INCR', KEYS[2])
end
return 0
`;

// Renews the lock, if it is still ours.
const RENEW = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`;

// Deletes the lock, if it is still ours.
const RELEASE = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

/** Where the fencing counter lives; no lock key can be named like it. */
const FENCING_COUNTER = 'locks:fencing-token';

@Injectable()
export class RedisLockStore implements LockStore {
  constructor(
    @Inject(REDIS) private readonly redis: RedisEval,
    storage: LocksStorage,
  ) {
    storage.registerSource(this);
  }

  async acquire(key: string, owner: string, ttl: number): Promise<LockAcquireResult> {
    const token = Number(await this.redis.eval(ACQUIRE, 2, this.key(key), FENCING_COUNTER, owner, ttl));
    return token > 0 ? { acquired: true, fencingToken: token } : { acquired: false };
  }

  async renew(key: string, owner: string, ttl: number): Promise<boolean> {
    return (await this.redis.eval(RENEW, 1, this.key(key), owner, ttl)) === 1;
  }

  async release(key: string, owner: string): Promise<boolean> {
    return (await this.redis.eval(RELEASE, 1, this.key(key), owner)) === 1;
  }

  private key(key: string) {
    return `locks:key:${key}`;
  }
}

```

`SET NX PX` 仅在键空闲时获取该键，在 Redis 的毫秒时钟上过期，并且同一脚本中的 `INCR` 会从每个键的一个计数器中抽取令牌。围栏的持久性仅取决于该计数器。它永不过期，且绝不能回退：请为 Redis 提供持久性（AOF 或短间隔的 RDB），以及 `maxmemory-policy noeviction`，因为一个从 1 重新启动的计数器（没有持久性的重启，一个 `FLUSHALL`）会发放持有者已有的令牌，而内存压力下被驱逐的锁是丢失的锁。故障转移到异步副本也可能丢失最后写入：刚被获取的锁（即令牌覆盖的暂停持有者情况）以及计数器的最后增量都可能丢失，之后下一个持有者可能会抽取前一个持有者已有的令牌，从而无法区分它们。当围栏必须跨故障转移保持时，请将锁保留在数据库中，其序列与行在同一 WAL 中，或者同步复制 Redis。

在 Redis Cluster 上，如代码所示，`ACQUIRE` 会以 `CROSSSLOT` 错误失败：集群仅在所有键哈希到同一槽时才运行脚本，而锁的键和计数器没有。将两者放在同一个哈希标签下命名，`{locks}:key:<key>` 和 `{locks}:fencing-token`：集群随后仅哈希 `locks`，因此计数器和每个锁共享一个槽，在一个分片上。使用新名称或在新集群上的计数器会从 1 重新开始，这是它绝不能做的重启。在第一次获取之前，停止使用旧键的实例，并将新计数器设置为旧值（`SET {locks}:fencing-token <value>`），以便下一个令牌高于已发放的任何令牌。

`redis.module` 在 `REDIS` 令牌下为客户端提供；示例使用 ioredis 的 `eval()` 签名的最小客户端，以避免依赖，在您的应用程序中它是 `new Redis(process.env.REDIS_URL)`：

```typescript title="redis/redis.module.ts"
import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { RedisClient } from './redis.client.js';

export const REDIS = Symbol('REDIS');

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      // With ioredis: new Redis(process.env.REDIS_URL)
      useFactory: () => new RedisClient(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379'),
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: RedisClient) {}

  // After onModuleDestroy(), where running jobs finish and hand their locks back.
  async onApplicationShutdown() {
    await this.redis.quit();
  }
}

```

交换应用程序模块中的提供者，其他内容都不变：

```typescript title="app.module.step-7.ts"
@Module({
  imports: [
    DrizzleModule.forRootAsync({
      useFactory: () => ({ drizzle, connection: process.env.DATABASE_URL!, schema }),
    }),
    RedisModule,
    ScheduleModule.forRoot(),
    LocksModule.forRoot(),
    InvoicesModule,
    InventoryModule,
  ],
  providers: [RedisLockStore],
})
export class AppModule {}

```

示例在真实的 `redis-server` 上运行契约套件，使用八个连接以使调用重叠，然后在上面运行三个应用程序实例：

```typescript title="test/step-7.redis-lock-store.e2e-spec.ts"
describe('the LockStore contract', () => {
  // Several connections, so calls really overlap; expiry is Redis's own clock (real time).
  const pool = Array.from({ length: 8 }, () => new RedisLockStore(connect(), new LocksStorage()));
  let next = 0;
  const cases = lockStoreContract(() => pool[next++ % pool.length]!, { concurrent: true });
  for (const c of cases) {
    it(c.name, c.run);
  }
});

```

在 `onApplicationShutdown()` 中关闭 Redis 客户端，与模块一样；`@nestjs/drizzle` 在同一阶段关闭数据库连接池。Nest 在下一个阶段之前对整个应用程序运行每个关闭阶段：该包在 `onModuleDestroy()` 中返回租约，并释放 `beforeApplicationShutdown()` 中仍持有的所有其他锁，因此当任何模块的 `onApplicationShutdown()` 运行时，该包的任何部分都不需要连接，无论导入顺序如何。在关闭开始时仍等待存储的滴答或选举会停止等待：滴答被跳过，存储在此之后授予的锁会返回给它，因此停滞的存储不会延迟部署。

#### 在一个实例上保持仓库的推送流

仓库通过一个允许每个商店一个连接的流推送低库存警报。这不是一个定时任务；它是一个实例应该在其存活期间持有的连接，当它宕机时另一个实例应该接管。这就是领导者选举，它与任务的所有权相同的租约，是故意持有的：

```typescript title="inventory/warehouse-feed.ts"
import { Injectable, Logger } from '@nestjs/common';
import { LeaderElection, type Lock, type OnLeadershipAcquired, type OnLeadershipLost } from '@nestjs/locks';
import { WarehouseClient } from './warehouse.client.js';

/**
 * The warehouse's alert feed allows one connection per shop, so one instance of the app
 * holds it: the leader. When the leader goes down, another instance connects within the
 * lease's `ttl`.
 */
@Injectable()
@LeaderElection('inventory:warehouse-feed')
export class WarehouseFeed implements OnLeadershipAcquired, OnLeadershipLost {
  private readonly logger = new Logger(WarehouseFeed.name);

  constructor(private readonly warehouseClient: WarehouseClient) {}

  onLeadershipAcquired(lock: Lock) {
    this.logger.log(`Connected to the warehouse feed (fencing token ${lock.fencingToken})`);
    // The connection ends with the leadership: `lock.signal` aborts when the lease is lost
    // or this instance steps down.
    this.warehouseClient.subscribe(
      (alert) => this.logger.warn(`Low stock: ${alert.count} left of ${alert.productId}`),
      { signal: lock.signal },
    );
  }

  onLeadershipLost() {
    this.logger.log('Disconnected from the warehouse feed');
  }
}

```

```typescript title="inventory/inventory.module.ts"
import { Module } from '@nestjs/common';
import { StockReconciliationJob } from './stock-reconciliation.job.js';
import { StockRepository } from './stock.repository.js';
import { WarehouseClient } from './warehouse.client.js';
import { WarehouseFeed } from './warehouse-feed.js';

@Module({
  providers: [StockReconciliationJob, StockRepository, WarehouseClient, WarehouseFeed],
})
export class InventoryModule {}

```

`@LeaderElection(key)` 放在一个单例提供者上。从 `onApplicationBootstrap` 开始，每个实例都尝试获取键的租约，并每 `ttl / 3` 持续尝试；持有者会续订它。当此实例成为领导者时运行 `onLeadershipAcquired(lock)`，带有租约的 `signal` 和 `fencingToken`；当它停止领导时运行 `onLeadershipLost(lock)`，因为租约丢失或它下台了，在关闭时或在 `onLeadershipAcquired()` 抛出后。`ttl` 选项设置租约的；默认是模块的 30 秒，因此崩溃的领导者在半分钟内被替换，而干净关闭的领导者在其他实例的下一次尝试时被替换。

测试启动了三个实例，显示了一个连接、一次关闭时的交接以及暂停的领导者的盲点：

```typescript title="test/step-8.leader-election.e2e-spec.ts"
await until(() => connected().length === 2, 10_000); // the lease expired in the database
warehouse.notify({ productId: 'salmon-kibble-2kg', count: 2 });
// Both receive it: the paused leader hasn't noticed yet. Anything it writes on the feed's
// behalf needs its fencing token, which is lower than the new leader's.
expect(logger.matching('WARN Low stock: 2 left of salmon-kibble-2kg')).toHaveLength(2);
// The old leader wakes up: its renewal is refused, and it learns it lost the lease.
await clock.advance('3s');
expect(leading.get(crashed)).toBe(false);
expect(disconnected()).toHaveLength(1);

```

暂停的领导者仍保持连接，直到其下一次续订失败，并在期间接收流发送的内容。这与 [Fence the writes](/reliability/locks#fence-the-writes) 中的盲点相同，答案也相同：领导者代表群体所做的事情携带了租约的令牌。

#### 试用

创建数据库并应用迁移：

```bash
$ psql postgres://localhost:5432/postgres -c 'CREATE DATABASE store'
$ DATABASE_URL=postgres://localhost:5432/store npx drizzle-kit migrate

```

在端口 3001、3002 和 3003 上启动三个实例，使用 `ADMIN_TOKEN=s3cret`，并将库存对账设置为每十秒而不是五分钟，以便有东西可观察：`STOCK_RECONCILIATION_CRON='*/10 * * * * *'`。每个实例记录其注册的锁存储。第一个启动的实例领导仓库推送流，并在其他两个启动之前在第一个滴答时执行对账：

```bash
[Nest] 48817  - 09/25/2026, 8:59:26 AM     LOG [LocksModule] LocksStorage: DrizzleLockStore
[Nest] 48817  - 09/25/2026, 8:59:26 AM     LOG [NestApplication] Nest application successfully started +9ms
[Nest] 48817  - 09/25/2026, 8:59:26 AM     LOG [Locks] Leading "inventory:warehouse-feed" (fencing token 1)
[Nest] 48817  - 09/25/2026, 8:59:26 AM     LOG [WarehouseFeed] Connected to the warehouse feed (fencing token 1)
[Nest] 48817  - 09/25/2026, 8:59:30 AM     LOG [Locks] StockReconciliationJob.reconcileStock runs on this instance (lease "inventory:stock-reconciliation:owner", fencing token 2)
[Nest] 48817  - 09/25/2026, 8:59:30 AM     LOG [WarehouseClient] Counted 3 products
[Nest] 48817  - 09/25/2026, 8:59:30 AM     LOG [StockReconciliationJob] Reconciled stock for 3 products (fencing token 3)
[Nest] 48817  - 09/25/2026, 8:59:40 AM     LOG [WarehouseClient] Counted 3 products
[Nest] 48817  - 09/25/2026, 8:59:40 AM     LOG [StockReconciliationJob] Reconciled stock for 3 products (fencing token 9)

```

其他两个实例在调试级别跳过每个滴答：

```bash
[Nest] 48849  - 09/25/2026, 8:59:40 AM   DEBUG [Locks] Skipped StockReconciliationJob.reconcileStock: it runs on another instance
[Nest] 48849  - 09/25/2026, 8:59:50 AM   DEBUG [Locks] Skipped StockReconciliationJob.reconcileStock: it runs on another instance

```

锁表显示租约、运行锁（已释放，因此所有者为 null，并且其令牌随每次运行增长）和流的租约。每个锁在其最后续订后 30 秒在数据库时钟上过期：

```bash
$ psql postgres://localhost:5432/store -c "SELECT key, owner, fencing_token, expires_at - clock_timestamp() AS expires_in FROM locks ORDER BY key"
                 key                  |                owner                 | fencing_token |   expires_in
--------------------------------------+--------------------------------------+---------------+-----------------
 inventory:stock-reconciliation       |                                      |             9 | 00:00:26.026727
 inventory:stock-reconciliation:owner | 1feff401-d3c9-41b1-a559-d7b458e2905f |             2 | 00:00:26.054034
 inventory:warehouse-feed             | a4980740-ae27-4d95-af0b-0935d65fffb9 |             1 | 00:00:22.784351
(3 rows)

```

围栏令牌存在间隙：拒绝获取仍然从序列中消耗了一个值。手动运行导出。没有管理员令牌时，守卫返回 `403`；然后同时向两个不同实例发送两个请求：

```bash
$ curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3002/admin/invoice-exports
403
$ for port in 3002 3003; do (curl -s -X POST localhost:$port/admin/invoice-exports -H 'x-admin-token: s3cret'; echo) & done; wait
{"exported":3,"batchId":"acc_447817af"}
{"exported":0}

```

一个请求获取了锁并导出了三个待处理的订单。另一个等待它，在释放时获取了锁，发现没有剩余。等待时间超过两秒的请求会收到 `409`。运行导出的实例记录了批次：

```bash
[Nest] 48849  - 09/25/2026, 8:59:44 AM     LOG [AccountingClient] Booked batch acc_447817af: ord_1001, ord_1002, ord_1004
[Nest] 48849  - 09/25/2026, 8:59:44 AM     LOG [InvoiceExportJob] Exported 3 invoices in batch acc_447817af

```

现在杀死第一个实例，该实例负责对账并主导数据流，不给它清理的机会：

```bash
$ kill -9 48817

```

一段时间内没有发生任何事情：其他两个实例继续跳过，因为租约仍在表中。每个租约在其最后续订后 30 秒在数据库时钟上过期。数据流的租约最先过期，因为它按自己的时间表续订的，下一个滴答接管了任务：

```bash
[Nest] 48849  - 09/25/2026, 9:00:11 AM     LOG [Locks] Leading "inventory:warehouse-feed" (fencing token 28)
[Nest] 48849  - 09/25/2026, 9:00:11 AM     LOG [WarehouseFeed] Connected to the warehouse feed (fencing token 28)
[Nest] 48849  - 09/25/2026, 9:00:20 AM     LOG [Locks] StockReconciliationJob.reconcileStock runs on this instance (lease "inventory:stock-reconciliation:owner", fencing token 32)
[Nest] 48849  - 09/25/2026, 9:00:20 AM     LOG [WarehouseClient] Counted 3 products
[Nest] 48849  - 09/25/2026, 9:00:20 AM     LOG [StockReconciliationJob] Reconciled stock for 3 products (fencing token 34)

```

改用 `Ctrl+C` 停止新的所有者。其关闭钩子会将两个租约都返回（`main.ts` 调用 `app.enableShutdownHooks()`）：

```bash
[Nest] 48849  - 09/25/2026, 9:00:35 AM     LOG [Locks] Stepped down from "inventory:warehouse-feed"
[Nest] 48849  - 09/25/2026, 9:00:35 AM     LOG [WarehouseFeed] Disconnected from the warehouse feed

```

最后一个实例在下一个滴答接管任务，数据流在下一个周期接管，而不是三十秒后：

```bash
[Nest] 48859  - 09/25/2026, 9:00:40 AM     LOG [Locks] StockReconciliationJob.reconcileStock runs on this instance (lease "inventory:stock-reconciliation:owner", fencing token 41)
[Nest] 48859  - 09/25/2026, 9:00:40 AM     LOG [WarehouseClient] Counted 3 products
[Nest] 48859  - 09/25/2026, 9:00:40 AM     LOG [StockReconciliationJob] Reconciled stock for 3 products (fencing token 43)
[Nest] 48859  - 09/25/2026, 9:00:41 AM     LOG [Locks] Leading "inventory:warehouse-feed" (fencing token 45)
[Nest] 48859  - 09/25/2026, 9:00:41 AM     LOG [WarehouseFeed] Connected to the warehouse feed (fencing token 45)

```

最后用 `Ctrl+C` 停止最后一个实例。它在关闭前从数据流中下线：

```bash
[Nest] 48859  - 09/25/2026, 9:00:50 AM     LOG [Locks] Stepped down from "inventory:warehouse-feed"
[Nest] 48859  - 09/25/2026, 9:00:50 AM     LOG [WarehouseFeed] Disconnected from the warehouse feed

```

#### 测试

导入 `LocksModule` 且未注册存储的应用将在内存存储上运行，因此一个实例的端到端测试无需任何配置：每个滴答都运行一次。要将 Drizzle 存储排除在测试之外，请用一个纯 `InMemoryLockStore` 覆盖其提供者；纯实例不会注册自身，因此应用内存默认值适用。

要测试该包的用途，在一个进程中运行多个实例。一个实例是一个 Nest 应用；一个应用的实例共享一个存储。示例的辅助函数在一个共享数据库上启动一个实例，使用模拟和测试的 `LocksModule` 选项：

```typescript title="test/helpers.ts"
export async function startInstance(options: InstanceOptions): Promise<TestingModule> {
  if (options.database.url) {
    process.env.DATABASE_URL = options.database.url;
  }
  let builder = Test.createTestingModule({ imports: [options.module] })
    .overrideProvider(AccountingClient)
    .useValue(options.accounting)
    .overrideProvider(WarehouseClient)
    .useValue(options.warehouse);
  if (options.database.pglite) {
    builder = builder.overrideProvider(getDrizzleToken()).useValue(options.database.pglite);
  }
  if (options.locks) {
    builder = builder.overrideProvider(LOCKS_MODULE_OPTIONS).useValue(options.locks);
  }
  const app = await builder.compile();
  app.useLogger(options.logger);
  options.onCompiled?.(app);
  await app.init();
  return app;
}

```

- **共享数据库。** 在 PGlite 上，通过覆盖 `DrizzleModule` 注册的 Drizzle 数据库（`getDrizzleToken()`），所有实例都获得相同的 Drizzle 数据库，并应用真实的迁移；`DrizzleLockStore` 使用 `@InjectDrizzle()` 注入它，因此实例共享锁表，就像在生产环境中一样。针对 PostgreSQL 服务器，每个实例都从数据库 URL 打开自己的连接池。没有数据库时，通过在每个实例中注册 `InMemoryLockStore` 并使用其 `LocksStorage.registerSource()` 和 `replace` 选项在 `init()` 之前，在实例之间共享一个。
- **自行触发任务。** 在每个实例上调用方法（`await job.exportInvoices()`），或通过 `@nestjs/schedule` 使用 `schedulerRegistry.getCronJob(name).fireOnTick()`。两者都到达包装器。将真实的调度指向一个永远不会到来的日期：示例的 `vitest.config.mts` 将两个 cron 变量设置为 2 月 29 日凌晨 3 点。
- **控制时间。** 用 `ManualLockClock` 覆盖 `LOCKS_MODULE_OPTIONS`，在每次续订、截止日期和该实例中的 `wait` 中，移动仅在测试推进时钟时才会移动：`await clock.advance('5m')` 按顺序触发到期的，并等待每次续订到达存储。其时钟未推进的实例是一个暂停的进程。针对 PGlite 或服务器，存储的时钟是真实时间，因此一个短暂的 `ttl`（`'1s'`）和一个 `sleep` 会使暂停实例的锁过期；对于内存存储，给予它相同的 `ManualLockClock`，过期随之移动。
- **断言日志** 或 `LocksEvents`：哪个实例运行了任务，每个跳过的滴答（`jobSkips$`），每个丢失的锁和每次领导权变更（`events$`）。事件也发布在 `nestjs:locks:job-skipped`、`nestjs:locks:lock-lost`、`nestjs:locks:leadership-acquired` 和 `nestjs:locks:leadership-lost` 诊断通道上。
- **使用契约套件测试您的存储**，就像 Drizzle、TypeORM 和 Redis 存储所做的那样，针对您在生产环境中运行的服务器。

有关测试设置的更多信息，请参阅 [End-to-end testing](/fundamentals/testing#端到端测试)。

#### 生产检查清单

- 注册一个共享存储，在您的数据库或 Redis 上，并在 CI 中使用 `concurrent` 开启，针对您在生产环境中运行的版本运行契约套件。在生产环境中，除非设置了 `allowInMemoryStorage`，否则应用程序拒绝启动，这仅适用于单个实例。
- 在每个绝不能运行两次的任务上设置 `key`，这样重命名或压缩器在滚动部署期间就无法更改它。
- 选择一个远高于存储往返时间和您可接受的最长事件循环停顿的 `ttl`，同时足够短，以防崩溃不跳过太多滴答。续订每 `ttl / 3` 发出；30 秒适用于大多数任务。长任务的运行锁以相同的速度续订，因此其 `ttl` 不需要覆盖运行时间。
- 确保 `storeTimeout` 远高于存储最慢的健康响应时间：运行时间超过该值的存储调用将失败，因此滴答不会运行，并且 `acquire()` 以 `LockStoreTimeoutError` 拒绝。默认值 10 秒也限制了停顿的存储（耗尽的连接池、故障转移、Redis 客户端在离线时排队命令）会延迟任务、请求或续订多长时间。
- 编写执行到期任务的代码，而不是执行滴答预期的任务。错过的滴答不会被追赶：一个崩溃的所有者最多会损失 `ttl` 个滴答，并且长时间运行期间的滴答会被跳过。
- 将 `LocksContext.signal` 传递给任务调用的内容，并使用 `LocksContext.fencingToken` 锁定不可撤销的写入，在写入的同一语句中执行。在 `LocksEvents` 或诊断通道中警报 `lock-lost`：这意味着续订失败的时间超过 `ttl`，因为存储不可达或事件循环被阻塞，并且另一个实例可能正在运行相同的关键部分。
- 调用 `app.enableShutdownHooks()`，以便部署一次性地移交租约，而不是让它们过期。在 `onApplicationShutdown()` 关闭 Redis 客户端，在 `@nestjs/drizzle` 关闭数据库连接池的阶段：该包在 `onModuleDestroy()` 中返回租约，并在 `beforeApplicationShutdown()` 中释放所有其他锁，Nest 首先完成整个应用程序的阶段。一个任务开始时间不到一秒的租约将在该秒的剩余时间被保留，而不是被移交，这样触发相同滴答的实例就会跳过它而不是第二次运行它。
- 对于 Redis 存储，提供 Redis 持久性和 `maxmemory-policy noeviction`。围栏计数器绝不能回退，锁绝不能被驱逐。
- 对于数据库存储，通过您的迁移创建表和序列，并为每个续订、每个持有锁的短语句加上每个实例的每个滴答，来设置连接池大小。
- 无论如何保持实例时钟与 NTP 同步。过期是在存储的时钟上衡量的，但持有者计算自己的截止日期，而 `@nestjs/schedule` 是在实例的时钟上触发的。
- 日志级别：跳过的滴答在 `debug` 级别记录。在发布后一段时间内保持该级别开启，以观察任务在一个实例上稳定下来。要长期监控，请计算 `LocksEvents.jobSkips$` 除以 `job` 和 `reason`，而不是解析日志。

#### 存储契约

教程使用 Drizzle、TypeORM 和 Redis 编写了存储。本节总结了任何 `LockStore` 必须遵守的规范，以便使用其他数据库或 ORM 编写存储。[`LockStore` interface](https://github.com/nestjs/locks/blob/master/lib/interfaces/lock-store.interface.ts) 记录了完整的契约以及每条规则所防止的竞态条件。

**注册。** 存储是一个普通的单例提供者，在其构造函数中调用可注入的 `LocksStorage` 上的 `registerSource(this)`。注册表会一次性检查形状，除非通过 `replace: true`，否则拒绝第二次注册，并在 `LocksModule` 初始化时锁定，记录存储正在使用中。如果没有注册任何内容，模块使用 `InMemoryLockStore`，该选项仅排除单个进程中的调用者。如果设置了 `NODE_ENV=production`，则启动会失败，除非设置了 `allowInMemoryStorage: true`。

**方法。** 三者都是原子的：每个决定谁持有键，而一次读取后紧接着一次单独的写入允许两个调用者进入临界区，这正是该包旨在防止的重复运行。

| 方法 | 功能 | 如何保持原子性 |
| --- | --- | --- |
| `acquire(key, owner, ttl)` | 如果没有活动锁持有它（无、已释放或已过期），则获取该键，且围栏令牌大于该键之前拥有的所有令牌 | 在同一语句中插入并接管已释放或已过期的行，在写入时重新检查过期时间，因此在许多并发调用者中恰好有一个获胜；令牌在检查后生成 |
| `renew(key, owner, ttl)` | 将所有者活动锁的过期时间从当前时间移动到 `ttl` | 比较并设置：所有者和过期时间在写入语句的 `WHERE` 中 |
| `release(key, owner)` | 释放所有者的活动锁（删除它或标记为已释放），以便下一个调用者立即获取。永不重置键的令牌 | 比较并设置，如 `renew()` |

**存储还必须正确处理的其他事项**，所有这些都由测试套件检查：过期的锁不存在，对于每个方法，无论是否已删除（在每个条件下有 `expires_at > now`，或让服务器过期它）；`ttl` 以毫秒为单位在存储的时钟上测量，可以达到数周（超过 32 位整数：`bigint`，`PEXPIRE`）；键是最多 500 个字符的字符串，任何 Unicode 字符均可，保持精确分离；令牌是返回为数字的正安全整数。PostgreSQL 除非 ORM 转换，否则返回一个 `bigint` 类型的列字符串；该包会立即拒绝此类令牌，并附带一个说明修复方法的消息，而不是让围栏静默失效。

**使用 Prisma。** Drizzle 存储是模型，具有相同的表和序列；[Keep locks in your database](/reliability/locks#keep-locks-in-your-database) 也展示了使用 TypeORM 的情况。`acquire()` 是一个 `INSERT ... ON CONFLICT (key) DO UPDATE ... WHERE owner IS NULL OR expires_at <= clock_timestamp() RETURNING fencing_token`，令牌在行锁后的 `SET` 中生成。Prisma 的 `upsert()` 对更新没有条件，因此请使用 `$queryRaw`。`renew()` 和 `release()` 将所有者和过期时间放在 `WHERE` 的 `updateMany()` 中并检查 `count === 1`。不是在 `findUnique()` 后的 `update()`：它是先读取。

**使用** `@nestjs/locks/testing` 中的测试套件进行测试。`lockStoreContract()` 为任何测试运行器返回案例。`concurrent: true` 对每个键进行 16 个调用者的竞态测试，其 `callers` 选项会提高此数量；在具有连接池的服务器上运行它，使调用真正重叠。`advanceTime` 移动了过期情况下的存储时钟；如果没有它，它们将实时等待，总共约二十五秒，等待 `ttl` 的锁（默认 2.5 秒，在中间检查是否仍持有并超过后释放：提高此值以适应往返时间较慢的存储）。

#### 参考

##### 模块选项

`LocksModule.forRoot()` 接受这些选项；`forRootAsync()` 从 `useFactory`、`useClass` 或 `useExisting`（实现 `LocksOptionsFactory` 的类）中获取它们。存储不是一个选项：请使用 `LocksStorage` 注册它，如 [Keep locks in your database](/reliability/locks#keep-locks-in-your-database) 所示。

| 选项 | 默认值 | 含义 |
| --- | --- | --- |
| `ttl` | `'30s'` | 锁在未续订的情况下存活的时长，即崩溃后另一个实例何时接管。每个锁、租约和选举的默认值。一个持续时间：毫秒，或如 `'15s'` 或 `'2m'` 的字符串 |
| `storeTimeout` | `'10s'` | 等待每次存储调用的时长（`acquire()`、`renew()`、`release()`）。超过此时间，调用以 `LockStoreTimeoutError` 失败：`acquire()` 拒绝，一个滴答不运行，在下一个节拍时再次尝试续订，之后存储授予的锁会返回给它 |
| `clock` | 系统时钟 | 一个 `LockClock`。测试通过 `ManualLockClock`（[Testing](/reliability/locks#测试)） |
| `allowInMemoryStorage` | `false` | 使用 `NODE_ENV=production` 且未注册存储时，启动失败；无论如何都会在内存存储（一个实例）上运行 `true` |
| `isGlobal` | `true` | 全局注册模块。`forRoot()` 和 `forRootAsync()` 的顶层 |

##### 装饰器和方法

| API | 选项 | 备注 |
| --- | --- | --- |
| `@OnOneInstance()` | `key`, `ttl` | 在持有 `<key>:owner` 租约的实例上运行任务；其他实例跳过滴答。[Run each job on one instance](/reliability/locks#run-each-job-on-one-instance) |
| `@WithoutOverlapping()` | `key`, `ttl` | 在任何实例上，当一个运行持有 `<key>` 锁时跳过滴答。[Don't let a long run overlap itself](/reliability/locks#dont-let-a-long-run-overlap-itself) |
| `@LeaderElection(key)` | `ttl` | 在实现 `OnLeadershipAcquired`、`OnLeadershipLost` 或两者之一的单例提供者上。[Hold the warehouse feed on one instance](/reliability/locks#hold-the-warehouse-feed-on-one-instance) |
| `Locks.acquire(key, options)` | `ttl`, `wait`, `signal` | 解析一个 `Lock`，或在键被占用时解析 `null`。[Run the export by hand](/reliability/locks#run-the-export-by-hand) |
| `Locks.withLock(key, fn, options)` | `ttl`, `wait`, `signal` | 在锁下运行 `fn(lock)` 并释放它；当键被占用时以 `LockNotAcquiredError` 拒绝 |

- `key` 默认为 `ClassName.methodName`，并且一个方法上的两个任务装饰器共享它。`ttl` 默认为模块的。
- `wait` 默认为 `0`（尝试一次）；更长的等待会带退避重试。`signal` 停止等待，也适用于正在进行的存储调用。`wait` 和 `ttl` 均不限制存储调用：模块的 `storeTimeout` 会。
- 一个 `Lock` 具有 `key`、`owner`、`fencingToken`、`signal`、`held`、`release()` 和 `[Symbol.asyncDispose]`，因此 `await using` 释放它。
- `LocksContext` 在任务、`lock` 回调或 `fencingToken` 中具有 `signal`，或在 `withLock()` 或 `run(lock, fn)` 之外，它们是 `undefined`。[Fence the writes](/reliability/locks#fence-the-writes)

##### 事件

`LocksEvents.events$` 发射每个事件，并将其发布到其 `node:diagnostics_channel` 通道。每个负载都包含 `type`、`key` 和 `fencingToken`。

| 事件 | 通道 | 其他字段 | 何时 |
| --- | --- | --- | --- |
| `lock-lost` | `nestjs:locks:lock-lost` | `detectedBy`: `'renewal'` 或 `'deadline'` | 持有者丢失了正在使用的锁。对此发出警报 |
| `leadership-acquired` | `nestjs:locks:leadership-acquired` | 无 | 此实例成为 `key` 的领导者 |
| `leadership-lost` | `nestjs:locks:leadership-lost` | `reason`: `'lost'` 或 `'released'` | 此实例停止领导：租约丢失，或它降级了 |

`LocksEvents.jobSkips$` 为每次调用未在 `onApplicationShutdown()` 前运行的 `@OnOneInstance()` 或 `@WithoutOverlapping()` 任务发出 `job-skipped` 事件，并将其发布到 `nestjs:locks:job-skipped`。它不同于 `events$`：除所有者外的每个实例都会跳过每次滴答，因此这些事件用于计数，而不是警报。负载包含 `type`、`job` (`ClassName.methodName`)、`key` (任务的键，而不是其 `<key>:owner` 租约) 和 `reason`：

| `reason` | 何时 |
| --- | --- |
| `ownership-unavailable` | 未授予 `<key>:owner` 租约：另一个实例持有它，或存储授予得太晚无法使用 |
| `run-lock-unavailable` | 未授予 `<key>` 运行锁：正在进行运行，或存储授予得太晚无法使用 |
| `shutdown` | 应用程序正在关闭 |

```typescript title="metrics/job-skip-metrics.ts"
@Injectable()
export class JobSkipMetrics implements OnModuleInit {
  constructor(private readonly events: LocksEvents) {}

  onModuleInit() {
    // skippedTicks: a counter from your metrics library
    this.events.jobSkips$.subscribe(({ job, reason }) => skippedTicks.add(1, { job, reason }));
  }
}

```

这些事件是该实例所看到的，正如它所看到的：它们不记录任务的最后运行，也不计算调度器从未触发的滴答。存储错误不是跳过：调用会拒绝，如之前所述。

> 警告 **警告** 订阅 `events$`、`jobSkips$` 或 `nestjs:locks:*` 通道的订阅者不得抛出：rxjs 和 Node 会将其错误作为 `uncaughtException` 重新抛出。跳过订阅者在每次滴答上运行，因此一个错误会在一个滴答内显示出来。

##### 错误

它们都没有携带 HTTP 状态：竞争不是调用者的错误，因此处理程序选择响应（[Run the export by hand](/reliability/locks#run-the-export-by-hand) 回答 `409`）。

| 错误 | 属性 | 何时抛出 |
| --- | --- | --- |
| `LocksError` | 无 | 下述三个类的基类 |
| `LockNotAcquiredError` | `key`, `waitMs` | `withLock()` 未能在 `wait` 内获取锁 |
| `LockLostError` | `key`, `fencingToken`, `detectedBy` | 丢失锁的 `signal` 因以下原因中止：存储拒绝续订（`'renewal'`），或未确认的 `ttl` 传入（`'deadline'`） |
| `LockStoreTimeoutError` | `key`, `method`, `timeoutMs` | 存储调用（`method`: `'acquire'`, `'renew'` 或 `'release'`）未在 `storeTimeout` 内响应 |