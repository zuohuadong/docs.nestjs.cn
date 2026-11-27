<!-- 此文件从 content/reliability/idempotency.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:51:07.051Z -->
<!-- 源文件: content/reliability/idempotency.md -->
<!-- 源哈希: 6ba5b7367d1de8a7adab0aa6f7425c9e -->

### 幂等性键

`@nestjs/idempotency` 使路由、GraphQL 变更和消息处理器安全地重试：每个 `Idempotency-Key` 只运行一次处理器，重试会获得其结果。

一家猫粮和用品网店的客户在火车上的手机上，通过商店的移动应用为鲑鱼颗粒和猫砂付款。应用发送了 `POST /orders/ord_1001/pay`。服务器通过支付提供者收取卡费，但响应从未到达手机。应用无法区分丢失的请求和丢失的响应，因此它会重试。如果没有保护，重试会以两种方式出错：

- 它在第一次请求完成后到达。订单已 `paid`，因此客户会收到支付已完成的错误。
- 它在第一次请求仍在等待支付提供者时到达。两个请求都通过了“订单是否仍待处理？”的检查，卡被重复收费。

**幂等性键**解决了这两者的问题。客户端为每次支付尝试生成一个唯一的键，并在每次重试时将其放在 `Idempotency-Key` 头部中发送。服务器对每个键只运行一次处理器，存储结果，并用该结果回答每次重试。`@nestjs/idempotency` 使用一个装饰器 `@Idempotent()` 为 HTTP 路由、GraphQL 变更和微服务处理器实现了此功能。其 HTTP 行为遵循 IETF [Idempotency-Key header draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)。

在本教程中，您将使支付端点具有幂等性，教移动应用安全重试，将键移动到 PostgreSQL（或 Redis），加密存储的收据，保护 GraphQL 变更，并去重运输服务消费的 `order.paid` 事件。

#### 先决条件

本教程从商店的订单 API 开始，该 API 已经具备：

- 一个 `OrdersModule`，包含一个 `OrdersService` 和一个 `OrdersController`。一个 `Order` 包含一个 `id`、一个 `userId`、`items`，一个以分计算的 `total`，以及一个 `status`，类型为 `'pending'`、`'paid'`、`'shipped'` 或 `'refunded'`。
- 一个 `PaymentProviderClient`，包装了支付提供者的 SDK。当卡被拒绝时，它抛出 402 `HttpException`，当提供者宕机时抛出 `ServiceUnavailableException` (503)。
- 一个 `AuthGuard`，验证 bearer token 并设置 `req.user`（参见 [Authentication](/security/authentication#issue-tokens-to-the-mobile-app)），以及一个读取它的 `@CurrentUser()` 参数装饰器。
- 一个全局 `ValidationPipe`，以及一个用于运输服务的 TCP 客户端，注册为 `SHIPPING_SERVICE`。
- 其数据存储在 PostgreSQL 中，通过 Drizzle，数据库由 `@nestjs/drizzle` 注册（参见 [Drizzle](https://docs.nestjs.com/data/drizzle)）。使用 TypeORM？请参阅 [Store keys in PostgreSQL](/reliability/idempotency#store-keys-in-postgresql) 了解 TypeORM 的商店。

需要保护的方法是：

```typescript title="orders/orders.service.ts"
async pay(orderId: string, user: User, dto: PayOrderDto): Promise<PaymentReceipt> {
  const order = this.ordersRepository.findOwned(orderId, user.id);
  if (order.status !== 'pending') {
    throw new ConflictException(`Order ${order.id} is already ${order.status}`);
  }
  const charge = await this.paymentProviderClient.charge({
    amount: order.total,
    paymentMethod: dto.paymentMethod,
    reference: order.id,
  });
  this.ordersRepository.markPaid(order.id);
  this.shipping.emit('order.paid', {
    eventId: `order-paid:${order.id}`,
    orderId: order.id,
  });

  return {
    orderId: order.id,
    receiptId: charge.id,
    amount: charge.amount,
    cardLast4: charge.cardLast4,
    paidAt: charge.createdAt,
  };
}

```

状态检查本身无法阻止重复收费：两个同时到达的请求在任何一个到达 `markPaid()` 之前都看到 `pending`。

安装包：

```bash
$ npm i --save @nestjs/idempotency

```

#### 使支付端点具有幂等性

在根 模块中注册 `IdempotencyModule` 一次：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { IdempotencyModule } from '@nestjs/idempotency';
import type { User } from './orders/order.js';
import { OrdersModule } from './orders/orders.module.js';

@Module({
  imports: [
    IdempotencyModule.forRoot({
      // Runs after guards, so req.user is set. Keys never collide across users.
      scope: (req: { user?: User }) => req.user?.id,
    }),
    OrdersModule,
  ],
})
export class AppModule {}

```

该模块是全局的。它注册了一个全应用拦截器，对于未用 `@Idempotent()` 标记的处理器不执行任何操作，因此没有其他路由的行为发生变化。

`scope` 为每个用户的键提供自己的命名空间。如果没有它，所有客户端共享一个命名空间，一个用户选择的键可能会重放另一个用户的收据。有了它，Alice 和 Bob 都可以发送 `Idempotency-Key: 1` 而不会看到彼此的结果。因为守卫在拦截器之前运行，当 `scope` 运行时，`req.user` 已经设置好，未认证的请求在消耗键之前就被拒绝了。如果一个已登录用户调用一个没有 `scope` 的 `@Idempotent()` 处理器，模块会记录一个警告，每个处理器记录一次。当共享命名空间是故意的（例如，由提供者事件 ID 键控的 Webhook）时，请设置 `scope: false`。

现在标记处理器：

```typescript title="orders/orders.controller.ts"
import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Idempotent } from '@nestjs/idempotency';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { PayOrderDto } from './dto/pay-order.dto.js';
import type { User } from './order.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
@UseGuards(AuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post(':id/pay')
  @Idempotent({ required: true })
  pay(
    @Param('id') id: string,
    @Body() dto: PayOrderDto,
    @CurrentUser() user: User,
  ) {
    return this.ordersService.pay(id, user, dto);
  }
}

```

`required: true` 在处理器运行之前，如果缺少键，将以 400 `IDEMPOTENCY_KEY_REQUIRED` 错误拒绝请求。没有键的支付无法安全重试，因此拒绝它比不加保护地收费要好。

携带键的请求会发生什么：

1. 拦截器计算请求的**指纹**：对作用域、方法、URL（包含订单 ID）和主体进行 SHA-256 哈希，并对对象键进行排序。
2. 它原子性地对**记录键** `<scope>:<key>`（例如 `usr_alice:5e0f6d0e-…`）加锁。如果记录已存在，则不运行处理器（参见下表）。在处理器运行时，拦截器会持续续订锁，因此慢速处理器永远不会因重试而丢失锁。
3. 处理器运行。完成后，锁变成一个已完成的记录，其中包含响应：状态码、主体以及来自短白名单（`Location`、`Content-Type`、`Content-Language`、`Content-Location`、`ETag` 和 `Last-Modified`）的头部（如果处理器或中间件设置了它们）。它们描述了存储的主体，因此使用另一个 `Accept-Language` 发送的重试仍然会获得存储主体的 `Content-Language`。Cookie、CORS 和速率限制头部属于原始请求，绝不会重放。

后续使用相同键的每个请求都会获得以下答案之一：

| 情况 | 响应 |
| :--- | :--- |
| 第一次请求仍在运行 | 409 `IDEMPOTENCY_KEY_IN_USE`，带有 `Retry-After` 头部 |
| 第一次请求已完成 | 存储的状态和主体，加上 `Idempotent-Replayed: true`。处理器不运行。 |
| 相同键，但主体或 URL 不同 | 422 `IDEMPOTENCY_KEY_REUSED` |

错误也可以被存储。[Tune TTLs and failure handling](/reliability/idempotency#tune-ttls-and-failure-handling) 涵盖了哪些错误。

由于拦截器是全局的，它在控制器和处理器的拦截器之外运行。存储的主体是客户端接收到的确切内容，在序列化器和其他拦截器运行之后，重放会跳过所有这些。管道在其中运行，因此一个 `ValidationPipe` 400 会像任何其他客户端错误一样被存储。其他全局拦截器是不同的问题，如生产检查清单所述。

在您 [store keys in PostgreSQL](/reliability/idempotency#store-keys-in-postgresql) 之前，记录存储在内存中，在默认 `InMemoryIdempotencyStore` 中。这对于开发中的单个实例是足够的，但 API 的每个实例都有自己的记录，并且在重启时会丢失。当 `NODE_ENV` 是 `production` 时，应用会以错误提示如何注册存储的方式拒绝启动。

#### 从移动应用发送密钥

服务器只能对客户端一致发送的内容进行去重。应用遵循两条规则：

- 当客户点击**支付**时创建密钥，而不是每次请求都创建一次。即使应用被杀死并重启，每次重试该支付时发送的都是相同的密钥，因此该密钥会与待处理的支付一起保存。
- 仅在客户做出新的决策时（例如在被拒绝后选择另一张卡）才创建新密钥。使用旧密钥但主体不同是 422 错误。

```typescript title="mobile/pay-order.ts"
export interface Receipt {
  orderId: string;
  receiptId: string;
  amount: number;
  cardLast4: string;
  paidAt: string;
}

export interface PendingPayment {
  orderId: string;
  paymentMethod: string;
  idempotencyKey: string;
}

export class PaymentError extends Error {
  constructor(
    readonly status: number,
    readonly body: { code?: string; message?: string },
  ) {
    super(body.message ?? `Payment failed with status ${status}`);
  }
}

// Call when the customer taps "Pay", and save the result with the order
// (for example in AsyncStorage). Retries, even after an app restart, reuse it.
export function startPayment(orderId: string, paymentMethod: string): PendingPayment {
  return { orderId, paymentMethod, idempotencyKey: crypto.randomUUID() };
}

export async function payOrder(
  apiUrl: string,
  token: string,
  payment: PendingPayment,
  maxAttempts = 5,
): Promise<Receipt> {
  for (let attempt = 1; ; attempt++) {
    const backoff = 250 * 2 ** (attempt - 1);
    let res: Response;
    try {
      res = await fetch(`${apiUrl}/orders/${payment.orderId}/pay`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': payment.idempotencyKey,
        },
        body: JSON.stringify({ paymentMethod: payment.paymentMethod }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      // No response: the card may or may not have been charged. Same key, try again.
      if (attempt >= maxAttempts) {
        throw err;
      }
      await sleep(backoff);
      continue;
    }
    if (res.ok) {
      return res.json(); // the first result, even if Idempotent-Replayed: true
    }
    const body = await res.json().catch(() => ({})); // a proxy's 502 page isn't JSON
    const retryable =
      res.status >= 500 || // the server released the key
      res.status === 429 ||
      body.code === 'IDEMPOTENCY_KEY_IN_USE'; // the first attempt is still running
    if (!retryable || attempt >= maxAttempts) {
      throw new PaymentError(res.status, body);
    }
    const retryAfter = Number(res.headers.get('Retry-After'));
    await sleep(retryAfter > 0 ? retryAfter * 1000 : backoff);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

```

`crypto.randomUUID()` 在浏览器和 Node.js 中可用。在 React Native 中，请使用 UUID 库，例如来自 `randomUUID()` 的 `expo-crypto`。

应用可能获得的响应及其对重试的含义如下：

| 响应 | 含义 | 是否使用相同密钥重试？ |
| :--- | :--- | :--- |
| 无响应（网络错误、超时） | 卡可能已或未被收费 | 是 |
| 2xx | 完成。使用 `Idempotent-Replayed: true`，这是首次尝试的结果 | 否，显示收据 |
| 409 且代码为 `IDEMPOTENCY_KEY_IN_USE` | 首次尝试仍在运行 | 是，在 `Retry-After` 秒后 |
| 5xx | 尝试失败，服务器已释放密钥 | 是，带退避策略 |
| 429 | 在处理程序运行前达到速率限制 | 是，在 `Retry-After` 秒后 |
| 422 `IDEMPOTENCY_KEY_REUSED` | 错误：密钥被用于不同的请求 | 否 |
| 任何其他 4xx：400、402（已拒绝）、404、409（已支付） | 最终结果。使用此密钥的任何重试都会得到相同答案 | 否。显示错误；新尝试会获得新密钥 |

检查 `code`，而不仅仅是状态。409 也可能意味着订单已支付，这是最终结果。

#### 在 PostgreSQL 中存储密钥

在生产环境中，内存存储是不够的。当进程停止、每次部署或容器替换时，其记录都会消失，因此之后到达的重试会再次执行支付。一旦 API 运行在多个实例上，落到另一个实例上的重试将找不到记录，两个实例都可能获取锁。记录需要一个可以原子性地“创建除非存在”的共享存储。

`@nestjs/idempotency` 没有提供此类存储。它定义了契约，即 `IdempotencyStore` 接口，您需要在应用的提供者中实现它，使用现有的数据库或 Redis 客户端。该接口有四个方法。每个方法首先接收记录密钥和所有者，时长以整数毫秒传入：

- `acquire(key, owner, fingerprint, lockTtl)` 创建锁，或返回现有记录：处于进行中状态，或已完成并带有其响应。它必须是原子的：对于请求自由密钥的任何并发调用，只能有一个获胜。
- `complete(key, owner, response, ttl)` 如果 `owner` 仍然持有锁，则将锁转换为已完成记录。
- `release(key, owner)` 如果 `owner` 仍然持有锁，则删除锁，以便重试可以再次运行处理程序。
- `extend(key, owner, lockTtl)` 如果 `owner` 仍然持有锁，则将锁的过期时间重置为从现在起的 `lockTtl`。拦截器在处理程序运行时，并且其结果正在被存储时，每隔 `lockTtl / 3` 调用它。

`owner` 是每次尝试的随机 ID，称为围栏令牌。如果一次尝试停止续订其锁（例如实例崩溃），并且在 `lockTtl` 后重试接管，则旧尝试的 `extend()`、`complete()` 或 `release()` 不会覆盖重试的记录，而是不执行任何操作。因此，“如果 `owner` 仍然持有它”必须在写入的同一原子操作中进行检查：如果先单独读取检查，接管操作可能会在两者之间发生。

本节展示了两次存储：首先使用 Drizzle（教程的路径），然后在本节末尾的“使用 TypeORM”下，是针对 ORM 为 TypeORM 的应用的相同存储。选择其中一个。

该存储使用 Drizzle 将数据保存在 PostgreSQL 中，因此记录在其 Drizzle 模式中获得一个表：

```typescript title="database/schema.ts"
import type { IdempotencyStoredPayload } from '@nestjs/idempotency';
import { bigint, index, json, pgTable, text } from 'drizzle-orm/pg-core';

/** One row per idempotency record: an in-flight lock, or a completed response. */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    // SHA-256 of the record key: keys can be longer than an index entry allows.
    keyHash: text('key_hash').primaryKey(),
    key: text('key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    // The attempt holding the lock; null once the record is completed.
    owner: text('owner'),
    // null while in flight. json, not jsonb: jsonb rejects "\u0000" in strings.
    response: json('response').$type<IdempotencyStoredPayload>(),
    // Epoch milliseconds.
    expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  },
  (table) => [index('idempotency_keys_expires_at_idx').on(table.expiresAt)],
);

```

主键是记录密钥的 SHA-256 哈希，因为记录密钥（一个作用域、客户端的密钥以及 GraphQL 的字段路径）可能比 PostgreSQL 在索引条目中允许的更长。响应是 `json` 而不是 `jsonb`，因为 `jsonb` 会拒绝字符串内部的 `\u0000`，而响应体可能包含它。使用 drizzle-kit 生成迁移，并像往常一样使用 `npx drizzle-kit migrate` 应用：

```bash
$ npx drizzle-kit generate --name=idempotency

```

```sql
CREATE TABLE "idempotency_keys" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"owner" text,
	"response" json,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys" USING btree ("expires_at");

```

该存储使用 Drizzle 的查询构建器实现每个方法。它使用来自 `@nestjs/drizzle` 的 `@InjectDrizzle()` 注入数据库，构造函数使用 `IdempotencyStorage` 注册存储，该注册表由 `IdempotencyModule` 导出：

```typescript title="idempotency/drizzle-idempotency.store.ts"
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import {
  IdempotencyStorage,
  type IdempotencyAcquireResult,
  type IdempotencyStore,
  type IdempotencyStoredPayload,
} from '@nestjs/idempotency';
import { and, eq, gt, inArray, lte } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createHash } from 'node:crypto';
import { idempotencyKeys } from '../database/schema.js';

export type Database = NodePgDatabase;

const { keyHash, owner: ownerColumn, expiresAt } = idempotencyKeys;

@Injectable()
export class DrizzleIdempotencyStore implements IdempotencyStore {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    storage: IdempotencyStorage,
  ) {
    storage.registerSource(this);
  }

  async acquire(
    key: string,
    owner: string,
    fingerprint: string,
    lockTtl: number,
  ): Promise<IdempotencyAcquireResult> {
    const hash = hashOf(key);
    // A second round only happens when the row was released or expired
    // between the two statements below.
    for (let attempt = 0; attempt < 5; attempt++) {
      const now = Date.now();
      const lock = { fingerprint, owner, response: null, expiresAt: now + lockTtl };
      // Insert the lock, or take over an expired row. Of many concurrent
      // callers, PostgreSQL lets one write, and re-checks `setWhere` for the
      // others against the winner's row: they get no row back.
      const taken = await this.db
        .insert(idempotencyKeys)
        .values({ keyHash: hash, key, ...lock })
        .onConflictDoUpdate({
          target: keyHash,
          set: lock,
          setWhere: lte(expiresAt, now),
        })
        .returning({ keyHash });
      if (taken.length) {
        return { state: 'acquired' };
      }

      // Someone else holds the key: report their lock or record.
      const [row] = await this.db
        .select()
        .from(idempotencyKeys)
        .where(eq(keyHash, hash));
      if (row && row.expiresAt > now) {
        return row.response === null
          ? { state: 'in-flight', fingerprint: row.fingerprint }
          : { state: 'completed', fingerprint: row.fingerprint, response: row.response };
      }
    }
    throw new Error(`The idempotency record for "${key}" kept changing; try again`);
  }

  async complete(
    key: string,
    owner: string,
    response: IdempotencyStoredPayload,
    ttl: number,
  ): Promise<boolean> {
    const now = Date.now();
    const done = await this.db
      .update(idempotencyKeys)
      .set({ owner: null, response, expiresAt: now + ttl })
      .where(this.ownedBy(key, owner, now))
      .returning({ keyHash });
    return done.length === 1;
  }

  async release(key: string, owner: string): Promise<boolean> {
    const released = await this.db
      .delete(idempotencyKeys)
      .where(this.ownedBy(key, owner, Date.now()))
      .returning({ keyHash });
    return released.length === 1;
  }

  async extend(key: string, owner: string, lockTtl: number): Promise<boolean> {
    const now = Date.now();
    const extended = await this.db
      .update(idempotencyKeys)
      .set({ expiresAt: now + lockTtl })
      .where(this.ownedBy(key, owner, now))
      .returning({ keyHash });
    return extended.length === 1;
  }

  /**
   * Deletes up to `limit` expired rows, for a scheduled job. Expired rows are
   * already ignored, and reused by the next request with the same key.
   */
  async prune(limit = 1000): Promise<number> {
    const now = Date.now();
    const expired = this.db
      .select({ keyHash })
      .from(idempotencyKeys)
      .where(lte(expiresAt, now))
      .limit(limit);
    const deleted = await this.db
      .delete(idempotencyKeys)
      // Checks the expiry again: a row taken over since the subquery read it stays.
      .where(and(inArray(keyHash, expired), lte(expiresAt, now)))
      .returning({ keyHash });
    return deleted.length;
  }

  /** The caller's lock, if it still holds it and it hasn't expired. */
  private ownedBy(key: string, owner: string, now: number) {
    return and(eq(keyHash, hashOf(key)), eq(ownerColumn, owner), gt(expiresAt, now));
  }
}

function hashOf(key: string) {
  return createHash('sha256').update(key).digest('hex');
}

```

数据库被类型化为 `NodePgDatabase`，下面的测试将其 PGlite 数据库转换为该类型，因为该存储仅使用两个驱动程序共享的查询构建器。每个方法都是 PostgreSQL 原子执行的单个语句，无需事务：

- `acquire()` 插入锁，或接管已过期的行，使用一个 `INSERT ... ON CONFLICT DO UPDATE ... WHERE expires_at <= now`。当多个调用者竞争密钥时，PostgreSQL 允许其中一个写入，并再次检查其他调用者相对于获胜者行的 `WHERE`，因此它们不会收到行，而是读取获胜者的锁。如果该行在此期间消失（释放或过期），则会再次执行 `acquire()`。
- `complete()`、`extend()` 和 `release()` 在写入语句的 `WHERE` 中检查所有者以及锁是否未过期。它们计算 `returning()` 返回的行数，这在每个 Drizzle 驱动程序上都有效。
- 过期的行会立即被忽略，使用相同密钥的下一个请求会重用其行。要删除其余的行，请从计划任务中调用 `prune()`，例如使用来自 `@nestjs/schedule` 的 `@Interval()`。它在 `DELETE` 本身再次检查过期时间，因此在此期间被重试接管的行会保留。

过期时间来自每个实例的时钟（`Date.now()`），因此请保持时钟同步，如 NTP 所做的那样。每个幂等请求都会向连接池添加一个或两个语句，以及在处理程序运行时每隔 `lockTtl / 3` 的一个 `UPDATE`。

该存储是一个普通的提供者。使用 `DrizzleModule`（参见 [Drizzle](https://docs.nestjs.com/data/drizzle)）注册数据库，并将该存储添加到 `AppModule` 的提供者中：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { DrizzleModule } from '@nestjs/drizzle';
import { IdempotencyModule } from '@nestjs/idempotency';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DrizzleIdempotencyStore } from './idempotency/drizzle-idempotency.store.js';
import type { User } from './orders/order.js';
import { OrdersModule } from './orders/orders.module.js';

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      useFactory: () => ({ drizzle, connection: process.env.DATABASE_URL! }),
    }),
    IdempotencyModule.forRoot({
      scope: (req: { user?: User }) => req.user?.id,
    }),
    OrdersModule,
  ],
  // Registers itself with IdempotencyStorage when Nest creates it.
  providers: [DrizzleIdempotencyStore],
})
export class AppModule {}

```

> info **提示** 应用读取 `DATABASE_URL`，并且在收据加密后，从 `process.env` 读取 `IDEMPOTENCY_KEYS`。应用程序通过 `@nestjs/config` 加载其环境变量，该验证模式会在变量缺失时停止启动，并注入 `ConfigService` 到这些工厂中。

在启动时，模块会记录它使用的存储 `IdempotencyStorage: DrizzleIdempotencyStore`，然后停止接受注册：

- 应用有一个存储。第二个 `registerSource()` 调用抛出，命名了两个类。
- 从单例提供者的构造函数中注册。当 `IdempotencyModule` 初始化时，注册表会锁定，因此稍后注册的存储（来自生命周期钩子、每个请求或延迟加载模块）会抛出，而不是被静默忽略。
- 没有注册的存储，模块会在内存中保留记录。在生产环境（`NODE_ENV=production`）中，除非设置了 `allowInMemoryStorage: true`，否则它拒绝以这种方式启动，后者接受每次重启或部署都会忘记记录的事实。

每个存储都使用相同的契约套件进行测试，该套件将测试用例导出为任何测试运行器所需的纯测试用例。它涵盖了每个方法、所有者检查、过期，以及使用 `concurrent` 时，读取然后写入的存储可能出现的竞态条件。示例项目在 PGlite 上针对此存储运行，并在通过 `pg` 连接池的 PostgreSQL 上运行，其中 32 个调用者在最多 16 个连接上争夺每个键：

```typescript title="test/step-3.drizzle-store.spec.ts"
import { PGlite } from '@electric-sql/pglite';
import { IdempotencyStorage } from '@nestjs/idempotency';
import { idempotencyStoreContract } from '@nestjs/idempotency/testing';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { DrizzleIdempotencyStore, type Database } from '../src/idempotency/drizzle-idempotency.store.js';

const migrationsFolder = new URL('../drizzle', import.meta.url).pathname;
// ...
describe('DrizzleIdempotencyStore on PGlite', () => {
  let pglite: PGlite;
  let store: DrizzleIdempotencyStore;

  beforeAll(async () => {
    pglite = new PGlite();
    const db = drizzlePglite({ client: pglite });
    await migratePglite(db, { migrationsFolder }); // npx drizzle-kit migrate
    store = new DrizzleIdempotencyStore(db as unknown as Database, new IdempotencyStorage());
  });
  afterAll(() => pglite.close());

  describe('the IdempotencyStore contract', () => {
    // The store reads Date.now(): fake Date alone, so the driver keeps its timers.
    beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
    afterEach(() => vi.useRealTimers());

    // One store and one table for every case: each case uses keys of its own.
    const cases = idempotencyStoreContract(() => store, {
      advanceTime: (ms) => vi.setSystemTime(Date.now() + ms),
      concurrent: true,
    });
    for (const c of cases) {
      it(c.name, c.run);
    }
  });
  // ...
});

```

**使用 TypeORM。** 针对 ORM 是 TypeORM 的应用的相同存储，在同一张表上。Drizzle 保持教程的路径：使用此存储而不是上面那个，而不是旁边那个。该表是一个 实体，每个列都声明了其类型，因此 TypeORM CLI 在不使用装饰器元数据加载它时，看到与应用相同的 模式：

```typescript title="typeorm/idempotency-key.entity.ts"
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

// The idempotency_keys table of the Drizzle schema in src/database/schema.ts, as an entity.
// Every column states its type, so the entity loads the same with or without emitted
// decorator metadata (the TypeORM CLI runs it through tsx, which emits none).

/** Reads a `bigint` column as a number: TypeORM returns it as a string. */
const epochMs = {
  to: (value: number) => value,
  from: (value: string) => Number(value),
};

/** One row per idempotency record: an in-flight lock, or a completed response. */
@Entity('idempotency_keys')
@Index('idempotency_keys_expires_at_idx', ['expiresAt'])
export class IdempotencyKeyEntity {
  // SHA-256 of the record key: keys can be longer than an index entry allows.
  @PrimaryColumn({ type: 'text', name: 'key_hash' })
  keyHash: string;

  @Column({ type: 'text' })
  key: string;

  @Column({ type: 'text' })
  fingerprint: string;

  // The attempt holding the lock; null once the record is completed.
  @Column({ type: 'text', nullable: true })
  owner: string | null;

  // null while in flight. json, not jsonb: jsonb rejects "\u0000" in strings. An
  // IdempotencyStoredPayload, typed `object`: its `unknown` body doesn't fit TypeORM's insert types.
  @Column({ type: 'json', nullable: true })
  response: object | null;

  // Epoch milliseconds.
  @Column({ type: 'bigint', name: 'expires_at', transformer: epochMs })
  expiresAt: number;
}

```

TypeORM 将一个 `bigint` 列作为字符串返回，因此转换器将 `expiresAt` 读回为数字。响应列被类型化为 `object` 而不是 `IdempotencyStoredPayload`，因为有效载荷的 `unknown` 主体不符合 TypeORM 的插入类型；存储在读取记录时进行类型转换。TypeORM CLI 和 `TypeOrmModule` 在数据源文件中共享一组选项：

```typescript title="typeorm/data-source.ts"
import { DataSource, type DataSourceOptions } from 'typeorm';
import { IdempotencyKeyEntity } from './idempotency-key.entity.js';
import { Idempotency1790321611502 } from './migrations/1790321611502-Idempotency.js';

/** What the application's TypeOrmModule and the TypeORM CLI share. */
export const dataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [IdempotencyKeyEntity],
  migrations: [Idempotency1790321611502],
} satisfies DataSourceOptions;

// The TypeORM CLI's data source: `migration:generate` compares the entities with this database.
export default new DataSource(dataSourceOptions);

```

从实体生成迁移，应用它，并检查实体和数据库是否一致。CLI 需要一个用于数据源文件的 TypeScript 加载器；这使用了 `tsx`：

```bash
$ npx tsx ./node_modules/typeorm/cli.js migration:generate src/typeorm/migrations/Idempotency -d src/typeorm/data-source.ts --pretty
Migration /store/src/typeorm/migrations/1790321611502-Idempotency.ts has been generated successfully.
$ npx tsx ./node_modules/typeorm/cli.js migration:run -d src/typeorm/data-source.ts
$ npx tsx ./node_modules/typeorm/cli.js migration:generate src/typeorm/migrations/Check -d src/typeorm/data-source.ts --check
No changes in database schema were found

```

它编写的迁移 `1790321611502-Idempotency.ts` 是 Drizzle 迁移的 `CREATE TABLE` 和 `CREATE INDEX` 语句，并且 `migrations` 在数据源中列出了它。现在，该存储遵循与 Drizzle 相同的规则：

```typescript title="typeorm/typeorm-idempotency.store.ts"
import { Injectable } from '@nestjs/common';
import {
  IdempotencyStorage,
  type IdempotencyAcquireResult,
  type IdempotencyStore,
  type IdempotencyStoredPayload,
} from '@nestjs/idempotency';
import { createHash } from 'node:crypto';
import { DataSource, MoreThan } from 'typeorm';
import { IdempotencyKeyEntity } from './idempotency-key.entity.js';

/**
 * Keeps idempotency records in PostgreSQL, through TypeORM: the Drizzle
 * store, on the same table. Each method is a single statement, so the
 * guarantees hold with any number of API instances.
 */
@Injectable()
export class TypeOrmIdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly dataSource: DataSource,
    storage: IdempotencyStorage,
  ) {
    storage.registerSource(this);
  }

  async acquire(
    key: string,
    owner: string,
    fingerprint: string,
    lockTtl: number,
  ): Promise<IdempotencyAcquireResult> {
    const hash = hashOf(key);
    // A second round only happens when the row was released or expired
    // between the two statements below.
    for (let attempt = 0; attempt < 5; attempt++) {
      const now = Date.now();
      // Insert the lock, or take over an expired row. Of many concurrent
      // callers, PostgreSQL lets one write, and re-checks the overwrite
      // condition for the others against the winner's row: they get no row back.
      const { raw } = await this.dataSource
        .createQueryBuilder()
        .insert()
        .into(IdempotencyKeyEntity)
        .values({ keyHash: hash, key, fingerprint, owner, response: null, expiresAt: now + lockTtl })
        .orUpdate(['fingerprint', 'owner', 'response', 'expires_at'], ['key_hash'], {
          overwriteCondition: { where: 'idempotency_keys.expires_at <= :now', parameters: { now } },
        })
        .returning(['keyHash'])
        .updateEntity(false)
        .execute();
      if ((raw as unknown[]).length === 1) {
        return { state: 'acquired' };
      }

      // Someone else holds the key: report their lock or record.
      const row = await this.dataSource.manager.findOneBy(IdempotencyKeyEntity, { keyHash: hash });
      if (row && row.expiresAt > now) {
        return row.response === null
          ? { state: 'in-flight', fingerprint: row.fingerprint }
          : { state: 'completed', fingerprint: row.fingerprint, response: row.response as IdempotencyStoredPayload };
      }
    }
    throw new Error(`The idempotency record for "${key}" kept changing; try again`);
  }

  async complete(
    key: string,
    owner: string,
    response: IdempotencyStoredPayload,
    ttl: number,
  ): Promise<boolean> {
    const now = Date.now();
    const { affected } = await this.dataSource.manager.update(IdempotencyKeyEntity, ownedBy(key, owner, now), {
      owner: null,
      response,
      expiresAt: now + ttl,
    });
    return affected === 1;
  }

  async release(key: string, owner: string): Promise<boolean> {
    const { affected } = await this.dataSource.manager.delete(IdempotencyKeyEntity, ownedBy(key, owner, Date.now()));
    return affected === 1;
  }

  async extend(key: string, owner: string, lockTtl: number): Promise<boolean> {
    const now = Date.now();
    const { affected } = await this.dataSource.manager.update(IdempotencyKeyEntity, ownedBy(key, owner, now), {
      expiresAt: now + lockTtl,
    });
    return affected === 1;
  }

  /**
   * Deletes up to `limit` expired rows, for a scheduled job. Expired rows are
   * already ignored, and reused by the next request with the same key.
   */
  async prune(limit = 1000): Promise<number> {
    const expired = this.dataSource.manager
      .createQueryBuilder(IdempotencyKeyEntity, 'expired')
      .select('expired.keyHash')
      .where('expired.expiresAt <= :now')
      .limit(limit);
    const { affected } = await this.dataSource
      .createQueryBuilder()
      .delete()
      .from(IdempotencyKeyEntity)
      .where(`key_hash IN (${expired.getQuery()})`)
      // Checks the expiry again: a row taken over since the subquery read it stays.
      .andWhere('expires_at <= :now', { now: Date.now() })
      .execute();
    return affected ?? 0;
  }
}

/** The caller's lock, if it still holds it and it hasn't expired. */
function ownedBy(key: string, owner: string, now: number) {
  return { keyHash: hashOf(key), owner, expiresAt: MoreThan(now) };
}

function hashOf(key: string) {
  return createHash('sha256').update(key).digest('hex');
}

```

- **`acquire()`** 是通过插入查询构建器相同的 `INSERT ... ON CONFLICT DO UPDATE ... WHERE expires_at <= now`：`orUpdate()` 列出了被接管覆盖的列，其 `overwriteCondition` 选项是 `WHERE`，并且 `returning()` 只向写入的调用者返回一行。
- **`complete()`、`extend()` 和 `release()`** 是实体管理器上的 `update()` 和 `delete()`，其标准中包含所有者和 `MoreThan(now)`，并且它们读取 `affected`。绝不要 `save()`：它先读取行，因此接管可能会在两者之间插入。
- **`prune()`** 使用选择查询构建器构建子查询，以选择已过期的行，并将其 SQL 放入 `WHERE` 中，位于过期检查旁边，在 `DELETE` 中。

该存储注入由 `TypeOrmModule` 提供的 `DataSource`。用数据源的选项替换 `DrizzleModule`，用存储替换 `DrizzleIdempotencyStore`，然后注册模块：

```typescript title="typeorm/app.module.ts"
import { Module } from '@nestjs/common';
import { IdempotencyModule } from '@nestjs/idempotency';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { User } from '../orders/order.js';
import { OrdersModule } from '../orders/orders.module.js';
import { dataSourceOptions } from './data-source.js';
import { TypeOrmIdempotencyStore } from './typeorm-idempotency.store.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      // The entity and migration the CLI uses; migrations run on deploy (`migration:run`).
      useFactory: () => ({ ...dataSourceOptions, url: process.env.DATABASE_URL }),
    }),
    IdempotencyModule.forRoot({
      scope: (req: { user?: User }) => req.user?.id,
    }),
    OrdersModule,
  ],
  // Registers itself with IdempotencyStorage when Nest creates it.
  providers: [TypeOrmIdempotencyStore],
})
export class AppModule {}

```

契约套件在不更改的情况下运行。TypeORM 通过 `pg` 连接，因此套件需要一个 PostgreSQL 服务器，否则会被跳过。另一个案例检查实体和迁移是否一致，这就是 `migration:generate --check` 所检查的：

```typescript title="test/typeorm-idempotency.store.spec.ts"
import { IdempotencyStorage } from '@nestjs/idempotency';
import { idempotencyStoreContract } from '@nestjs/idempotency/testing';
import { DataSource } from 'typeorm';
import { startPostgres } from '../../../test-support/postgres.js';
import { dataSourceOptions } from '../src/typeorm/data-source.js';
import { TypeOrmIdempotencyStore } from '../src/typeorm/typeorm-idempotency.store.js';
// ...
const { postgres, reason } = await startPostgres();
afterAll(() => postgres?.stop());

describe.skipIf(!postgres)(`TypeOrmIdempotencyStore on PostgreSQL${postgres ? '' : ` (skipped: ${reason})`}`, () => {
  let dataSource: DataSource;
  let url: string;
  let store: TypeOrmIdempotencyStore;

  beforeAll(async () => {
    url = await postgres!.createDatabase('idempotency_typeorm_store');
    dataSource = await new DataSource({ ...dataSourceOptions, url, poolSize: 16 }).initialize();
    await dataSource.runMigrations(); // npx typeorm migration:run
    store = new TypeOrmIdempotencyStore(dataSource, new IdempotencyStorage());
  });
  afterAll(() => dataSource?.destroy());

  describe('the IdempotencyStore contract', () => {
    // The store reads Date.now(): fake Date alone, so the driver keeps its timers.
    beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
    afterEach(() => vi.useRealTimers());

    // One store and one table for every case: each case uses keys of its own.
    // 32 callers per race, on up to 16 connections.
    const cases = idempotencyStoreContract(() => store, {
      advanceTime: (ms) => vi.setSystemTime(Date.now() + ms),
      concurrent: { callers: 32 },
    });
    for (const c of cases) {
      it(c.name, c.run);
    }
  });

  it('has a migration that matches the entity (what `migration:generate --check` checks)', async () => {
    const { upQueries } = await dataSource.driver.createSchemaBuilder().log();
    expect(upQueries.map((query) => query.query)).toEqual([]);
  });
  // ...
});

```

`startPostgres()` 是一个测试辅助函数，它在 PostgreSQL 服务器上创建一个临时数据库，或者如果没有服务器则跳过套件。示例还在一个数据库上运行两个 TypeORM `AppModule` 实例，一个充电而另一个返回 409。

> info **提示** 使用 Prisma？[The store contract](/reliability/idempotency#the-store-contract)，教程之后展示了 Prisma 如何表达这些语句。使用相同的套件检查您的存储。

#### 在 Redis 中使用存储键

如果您的 API 已经运行 Redis，它可以将记录保存在那里而不是 PostgreSQL 中。Redis 非常适合此存储：记录是一个小的哈希，Redis 会自动过期它，因此没有清理任务，像客户端每秒重试一次支付这样的热键，成本是到内存的一次往返，而不是主数据库中的行锁。代价是需要运行、保护和备份第二个存储，并且必须配置 Redis 永不驱逐记录（参见生产检查清单）。

每个方法是一个 Lua 脚本，Redis 原子地运行它：

```typescript title="idempotency/redis-idempotency.store.ts"
import { Inject, Injectable } from '@nestjs/common';
import {
  IdempotencyStorage,
  type IdempotencyAcquireResult,
  type IdempotencyStore,
  type IdempotencyStoredPayload,
} from '@nestjs/idempotency';
import { REDIS } from '../redis/redis.module.js';

/** The one ioredis method this store needs. */
export interface RedisClient {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

// Creates the lock if no record exists. Otherwise returns the record, in the
// same round trip.
const ACQUIRE = `
if redis.call('EXISTS', KEYS[1]) == 0 then
  redis.call('HSET', KEYS[1], 'state', 'in-flight', 'fp', ARGV[1], 'owner', ARGV[2])
  redis.call('PEXPIRE', KEYS[1], ARGV[3])
  return {1}
end
local r = redis.call('HMGET', KEYS[1], 'state', 'fp', 'resp')
return {0, r[1], r[2], r[3]}
`;

// Turns our lock into a completed record, unless another attempt took it over.
const COMPLETE = `
if redis.call('HGET', KEYS[1], 'owner') ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[1], 'state', 'completed', 'resp', ARGV[2])
redis.call('HDEL', KEYS[1], 'owner')
redis.call('PEXPIRE', KEYS[1], ARGV[3])
return 1
`;

// Deletes the lock, but only if it is still ours.
const RELEASE = `
if redis.call('HGET', KEYS[1], 'owner') == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

// Renews our lock while the handler runs, but only if it is still ours.
const EXTEND = `
if redis.call('HGET', KEYS[1], 'owner') ~= ARGV[1] then return 0 end
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 1
`;

type AcquireReply =
  | [1]
  | [0, 'in-flight' | 'completed', string, string | null];

@Injectable()
export class RedisIdempotencyStore implements IdempotencyStore {
  constructor(
    @Inject(REDIS) private readonly redis: RedisClient,
    storage: IdempotencyStorage,
  ) {
    storage.registerSource(this);
  }

  async acquire(
    key: string,
    owner: string,
    fingerprint: string,
    lockTtl: number,
  ): Promise<IdempotencyAcquireResult> {
    const reply = (await this.redis.eval(
      ACQUIRE, 1, this.key(key), fingerprint, owner, lockTtl,
    )) as AcquireReply;
    if (reply[0] === 1) {
      return { state: 'acquired' };
    }
    const [, state, storedFingerprint, response] = reply;
    return state === 'completed'
      ? { state, fingerprint: storedFingerprint, response: JSON.parse(response!) }
      : { state, fingerprint: storedFingerprint };
  }

  async complete(
    key: string,
    owner: string,
    response: IdempotencyStoredPayload,
    ttl: number,
  ): Promise<boolean> {
    const done = await this.redis.eval(
      COMPLETE, 1, this.key(key), owner, JSON.stringify(response), ttl,
    );
    return done === 1;
  }

  async release(key: string, owner: string): Promise<boolean> {
    const released = await this.redis.eval(RELEASE, 1, this.key(key), owner);
    return released === 1;
  }

  async extend(key: string, owner: string, lockTtl: number): Promise<boolean> {
    const extended = await this.redis.eval(EXTEND, 1, this.key(key), owner, lockTtl);
    return extended === 1;
  }

  private key(key: string) {
    return `idem:${key}`;
  }
}

```

每个记录都是 `idem:<scope>:<key>` 中的一个哈希，字段包括 `state`、`fp`（指纹）、`owner` 和 `resp`（存储的 JSON 响应）。该哈希会自动过期：在飞行中最后一次续订后 `lockTtl`，在完成后 `ttl`，因此不需要清理任务。每个脚本只触及一个键，因此该存储也适用于 Redis Cluster。Redis 原子地运行脚本，但当后续命令失败时，它不会撤销脚本的写入。例如，`PEXPIRE` 需要一个微秒的延迟，如果在 `HSET` 之后失败，它将留下一个永不过期的锁。这就是拦截器将整个毫秒传递给存储的原因。

Nest 注入 Redis 客户端，构造函数注册存储，就像 PostgreSQL 存储一样。一个应用有一个存储，所以 `RedisIdempotencyStore` 取代了 `AppModule` 中的另一个：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { IdempotencyModule } from '@nestjs/idempotency';
import { RedisIdempotencyStore } from './idempotency/redis-idempotency.store.js';
import type { User } from './orders/order.js';
import { OrdersModule } from './orders/orders.module.js';
import { RedisModule } from './redis/redis.module.js';

@Module({
  imports: [
    RedisModule,
    IdempotencyModule.forRoot({
      scope: (req: { user?: User }) => req.user?.id,
    }),
    OrdersModule,
  ],
  providers: [RedisIdempotencyStore],
})
export class AppModule {}

```

`RedisModule` 代表您的应用 Redis 模块：一个全局模块，在 `REDIS` 令牌下提供 ioredis 客户端，例如使用 `useFactory: () => new Redis(process.env.REDIS_URL!)`，并在其 `onApplicationShutdown()` 中使用 `quit()` 关闭它，直到包完成飞行中的请求。`RedisClient` 只要求 `eval()`，而 ioredis `Redis` 实例就是这样提供的。在启动时，日志行显示 `IdempotencyStorage: RedisIdempotencyStore`，并且注册表的规则遵循 PostgreSQL 存储的规则：一个存储，从构造函数注册。

示例项目也针对此存储运行合同套件：

```typescript title="test/step-4.redis-store.spec.ts"
import { idempotencyStoreContract } from '@nestjs/idempotency/testing';
// ...
describe('RedisIdempotencyStore, the IdempotencyStore contract (on FakeRedis)', () => {
  let redis: FakeRedis;
  const cases = idempotencyStoreContract(
    () => {
      redis = new FakeRedis();
      return new RedisIdempotencyStore(redis, new IdempotencyStorage());
    },
    // Redis expires keys on its own clock: the fake's.
    { advanceTime: (ms) => redis.advance(ms), concurrent: true },
  );
  for (const c of cases) {
    it(c.name, c.run);
  }
});

```

> info **提示** 本教程的示例项目没有 Redis 服务器，因此其测试针对一个在进程内的假实现运行存储，该假实现使用 JavaScript 实现相同的四个脚本。这涵盖了存储的逻辑以及它读取回复的方式，但没有涵盖 Lua 本身。在依赖此存储之前，请在真实 Redis（例如在容器中）上运行合同套件。如果没有 `advanceTime`，套件会等待真实的过期时间，这大约需要十秒。

剩余的步骤在其模块列表中显示 `DrizzleIdempotencyStore`。使用 Redis 时，请用 `RedisIdempotencyStore` 替换它：加密、发货服务和调优选项工作方式相同，并且开启加密后，`resp` 字段存储密封的信封，而不是 `response` 列。

#### 加密存储的收据

存储的响应是完整的收据：支付提供者的收据 id、金额和卡片的后四位数字。它们以纯文本形式存储在 `idempotency_keys` 中，在数据库的每个备份和每个转储中都是如此，因此请对静态记录进行加密。

加密密钥是应用程序启动时应读取的秘密，而不是在导入 `app.module.ts` 时读取，因此请切换到 `forRootAsync()`。存储保持不变，它是一个注册自身的 `AppModule`，并且工厂返回选项：

```typescript title="app.module.ts"
IdempotencyModule.forRootAsync({
  useFactory: () => ({
    scope: (req: { user?: User }) => req.user?.id,
    encryption: {
      // Newest first: seal with the first key, open with any of them.
      keys: process.env.IDEMPOTENCY_KEYS!.split(','),
    },
  }),
}),

```

使用 `openssl rand -base64 32` 生成一个密钥，并将其存储在秘密管理器中作为 `IDEMPOTENCY_KEYS`。开启加密后，`response` 列包含密封的信封 `v1.<keyId>.<iv>.<ciphertext>.<tag>`，而不是收据：

- 记录使用 AES-256-GCM 加密，每个记录使用随机 IV。
- 指纹保持纯文本。存储必须比较它，而且它本身就是一个哈希。
- 记录密钥与数据一起经过认证，因此使用另一个用户密钥复制的记录会失败打开，而不是在那里重放。
- 在加密开启时，纯文本记录将被拒绝，因此任何对表具有写入权限的人都无法植入响应。
- 字符串密钥必须至少为 32 个字符，并使用 HKDF-SHA256 扩展。这对于像上面那样的随机密钥是足够的，但它不是密码哈希，所以不要使用个人选择的密码。较短的密钥或带有空格的密钥（`IDEMPOTENCY_KEYS=new, old` 分割成以空格开头的第二个密钥）会在启动时以错误命名停止应用程序。

在端点存储其第一条记录之前开启加密。它会双向更改记录格式：在切换前存储的纯文本记录（类似于加密关闭后的密封记录）在过期前无法打开，并且其重放会得到下面描述的 500 错误。

在不中断重放的情况下轮换密钥：

1. 生成新密钥并部署 `IDEMPOTENCY_KEYS=old-key,new-key`。实例仍然使用旧密钥密封记录，但它们可以打开使用新密钥密封的记录。
2. 一旦每个实例运行了该配置，就部署 `IDEMPOTENCY_KEYS=new-key,old-key`。新记录使用新密钥密封，旧记录仍然可以打开。在滚动部署期间，尚未重启的实例可以得益于第一步来打开新记录。
3. 当 `ttl` 过去（48 小时，参见 [Tune TTLs and failure handling](/reliability/idempotency#tune-ttls-and-failure-handling)）后，所有使用旧密钥密封的记录都已过期。部署 `IDEMPOTENCY_KEYS=new-key`。

如果过早移除密钥，使用该密钥密封的记录的重放将**关闭失败**。客户端会收到 500 `IDEMPOTENCY_RECORD_UNREADABLE` 错误，失败会被记录，并且处理程序不会再次运行：该记录证明卡已被收费，因此运行处理程序可能会重复收费。当记录过期时，错误停止。

#### 通过 GraphQL 支付

存储的网站通过 GraphQL 变更进行支付。在 `AppModule` 中注册 `GraphQLModule`：

```typescript title="app.module.ts"
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: true,
}),

```

然后在订单解析器中，在其查询旁边添加该变更。在 GraphQL 中，密钥可以来自 `Idempotency-Key` 标头（与 REST 一样），也可以来自参数。参数将密钥放入模式中，代码生成器和审阅者可以看到它。它也适用于 GraphQL 客户端，这些客户端通常是每个连接设置一次标头，而不是每个操作。`@Idempotent()` 在有参数时读取变更的 `idempotencyKey` 参数，否则读取标头，因此解析器只需要声明参数：

```typescript title="orders/orders.resolver.ts"
@Mutation(() => PaymentReceipt)
@Idempotent({ required: true })
payOrder(
  @Args('orderId', { type: () => ID }) orderId: string,
  @Args('input') input: PayOrderDto,
  @Args('idempotencyKey') _idempotencyKey: string,
  @CurrentUser() user: User,
) {
  return this.ordersService.pay(orderId, user, input);
}

```

`PayOrderDto` 是 REST 端点使用的类，添加了 `@InputType()` 和 `@Field()`，而 `PaymentReceipt` 是带有收据字段的 `@ObjectType()`。解析器使用相同的 `AuthGuard`，它从 GraphQL 上下文读取请求。模块的 `scope` 接收到相同的请求，因此这里的密钥也是按用户划分的。该参数是一个非空 `String`，因此 GraphQL 验证会拒绝没有它的操作：

```graphql
mutation PayOrder($orderId: ID!, $paymentMethod: String!, $key: String!) {
  payOrder(orderId: $orderId, input: { paymentMethod: $paymentMethod }, idempotencyKey: $key) {
    receiptId
    amount
    cardLast4
    paidAt
  }
}

```

使用相同变量重试会返回存储的 `payOrder` 结果，具有解析器返回的相同类型，因此一个 `Date` 字段重放为一个 `Date`。记录密钥会附加字段的路径，如 `usr_alice:<key>:payOrder` 所示，因为一个操作可以包含多个变更。每个字段都单独存储和重放，别名是路径的一部分，因此重试必须发送相同的文档。

拒绝是该字段上的错误，而不是 HTTP 状态。响应仍然是 200，因为同一操作中的其他字段可能已成功，状态和重试延迟在 `extensions`（省略 `locations`）中：

```json
{
  "errors": [
    {
      "message": "A request with this idempotency key is still being processed.",
      "path": ["payOrder"],
      "extensions": {
        "code": "IDEMPOTENCY_KEY_IN_USE",
        "httpStatus": 409,
        "retryAfter": 2
      }
    }
  ],
  "data": null
}

```

出于同样的原因，GraphQL 重放不会设置 `Idempotent-Replayed` 标头。

#### 去重 order.paid 事件

支付后，`OrdersService` 发射一个 `order.paid` 事件，然后配送服务安排快递员。实际上，事件至少会被投递一次。在超时后重试的发布者，或重新投递未确认消息的代理（RabbitMQ、Kafka、NATS JetStream）可能会两次投递相同的事件，导致客户收到两个包裹。

去重事件需要一个在每次事件投递中都相同的 id，因此它应从数据中派生而不是在每次发送时生成。一个订单只支付一次，所以 `OrdersService` 使用 `order-paid:` 加上订单 id。使用 `@Idempotent()` 标记 [event handler](/microservices/basics#event-based)，并将 `keyFrom` 指向该 id：

```typescript title="shipping/shipping.controller.ts"
import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { Idempotent } from '@nestjs/idempotency';
import { ShipmentsService } from './shipments.service.js';

export interface OrderPaidEvent {
  eventId: string;
  orderId: string;
}

@Controller()
export class ShippingController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @EventPattern('order.paid')
  @Idempotent({ required: true, keyFrom: { payload: 'eventId' } })
  async onOrderPaid(@Payload() event: OrderPaidEvent) {
    await this.shipmentsService.createFor(event.orderId);
  }
}

```

默认情况下，微服务处理程序从 payload 的 `idempotencyKey` 属性读取键，然后从名为 `header` 选项的传输头中读取。在这里，`keyFrom` 读取 `eventId`，而 `required: true` 会拒绝没有该属性的事件。

配送服务是一个独立的应用，拥有自己的数据库和自己的 `IdempotencyModule`，并且它注册了相同的仓储类：

```typescript title="shipping/shipping.module.ts"
import { Module } from '@nestjs/common';
import { DrizzleModule } from '@nestjs/drizzle';
import { IdempotencyModule } from '@nestjs/idempotency';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DrizzleIdempotencyStore } from '../idempotency/drizzle-idempotency.store.js';
import { ShipmentsService } from './shipments.service.js';
import { ShippingController } from './shipping.controller.js';

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      useFactory: () => ({ drizzle, connection: process.env.DATABASE_URL! }),
    }),
    IdempotencyModule.forRoot({
      ttl: '7d', // brokers can redeliver long after the first delivery
    }),
  ],
  controllers: [ShippingController],
  providers: [ShipmentsService, DrizzleIdempotencyStore],
})
export class ShippingModule {}

```

```typescript title="shipping/main.ts"
import { NestFactory } from '@nestjs/core';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { ShippingModule } from './shipping.module.js';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(ShippingModule, {
    transport: Transport.TCP,
    options: { host: '0.0.0.0', port: 4001 },
  });
  await app.listen();
}
bootstrap();

```

与 API 相比，有几点不同：

- 没有 `scope`，因为事件 id 在整个系统中是唯一的。
- `ttl` 是 7 天，因为消息可能在首次处理后很久才从死信队列返回。
- 记录属于一个处理程序：记录键以处理程序的类和方法结尾，如 `order-paid%3Aord_1001:ShippingController.onOrderPaid` 所示。Nest 会运行注册给某个事件的每个处理程序，因此第二个处理程序（例如发送跟踪号码邮件的）会保留自己的记录，并且仍然处理每个事件一次。

重复事件的处理方式有两种：

- 如果第一次投递已完成，则跳过重复事件。存储的结果被“重放”，由于事件没有回复，所以不会发生任何事情。
- 如果第一次投递仍在运行，则使用 `IDEMPOTENCY_KEY_IN_USE` 拒绝重复事件，Nest 会记录错误。对于会确认消息的传输器，如 RabbitMQ 或 Kafka，不要将该投递标记为已处理。让传输器稍后重新投递，届时它将被跳过。

无论哪种方式，快递员只被预订一次。HTTP 支付的重试本身就不会产生重复事件，因为重放的请求永远不会到达 `OrdersService`。

#### 调整 TTL 和故障处理

默认值是一个起点。这是 API 的最终配置：

```typescript title="app.module.ts"
IdempotencyModule.forRootAsync({
  useFactory: () => ({
    scope: (req: { user?: User }) => req.user?.id,
    encryption: {
      // Newest first: seal with the first key, open with any of them.
      keys: process.env.IDEMPOTENCY_KEYS!.split(','),
    },
    // Longer than the app keeps retrying a queued payment (24 hours).
    ttl: '48h',
    // A crashed instance blocks a key for at most 45 seconds. While a
    // charge runs, its lock is renewed every 15 seconds.
    lockTtl: '45s',
    // How long a client waits after a 409 before it asks again.
    retryAfter: '2s',
  }),
}),

```

每个持续时间都以毫秒为单位，或是一个字符串，例如 `'45s'`、`'48h'` 或 `'7d'`。无法解析的值会在启动时停止应用，并附带一个指明选项名称的错误。

- **`ttl`**（默认值: `'24h'`）是已完成的结果可以重放的时长。它必须长于客户端持续重试的最长时间。该应用将离线支付排队最多一天，因此这里是 48 小时。超过 `ttl` 后，键将被遗忘，重试将再次运行处理程序。在此应用中，这会以 409 “已支付”错误而不是第二次收费结束，但客户不会收到收据。
- **`lockTtl`**（默认值: `'60s'`）是实例崩溃后，正在进行的锁存活的时长。在处理程序运行时，拦截器每 `lockTtl / 3` 刷新一次锁，这里是每 15 秒，因此耗时超过 45 秒的收费仍然保持锁，重试会得到 409。一旦刷新停止，锁到期，重试将接管该键。较短的 `lockTtl` 会在崩溃后更快释放键，但刷新更频繁。如果无法到达仓储以刷新锁，拦截器会记录一个警告，表明锁已丢失。
- **`maxLockHold`**（默认值: `'1h'`）是正在运行的处理程序保持锁刷新的时长。如果处理程序在此之后挂起，则停止刷新，因此其锁将在 `lockTtl` 后到期，重试可能会第二次运行处理程序。如果处理程序完成，其结果仅在没有重试接管该键时才被存储。
- **`retryAfter`**（默认值: `'1s'`）是 409 响应中 `Retry-After` 头的取值，以完整秒为单位。卡片收费通常需要一两秒，因此 API 要求客户端等待 2 秒，而不是在一秒后检查。

`@Idempotent()` 接受 `required`、`ttl`、`lockTtl`、`maxLockHold`、`retryAfter`、`keyFrom`、`scope`、`fingerprint` 和 `storeIf`，这些值会覆盖模块中针对该处理程序的选项。`fingerprint` 选择重试必须重复的内容，例如不包含客户端时间戳的 body；方法和 URL 总是计入。装饰器也适用于控制器或解析器类，其中它涵盖了改变状态的处理程序：GET 路由和 GraphQL 查询除非有自己的 `@Idempotent()`，否则会被跳过。处理程序自身的 `@Idempotent()` 会与类的选项合并，因此类级别的 `required: true` 仍然适用于仅设置 `lockTtl` 的处理程序。

一个 `scope` 函数会为每种类型的处理程序运行，它接收的内容取决于处理程序：HTTP 和 GraphQL 的请求，但微服务处理程序的消息 payload。在一个同时从一个 `IdempotencyModule` 提供服务的应用中，请将 `scope` 传递一个对象，在 `http`、`graphql` 和 `rpc` 键下为每个上下文提供一个函数。每个函数都根据其上下文传入的内容进行类型定义，没有上下文的上下文不会被作用域化。

并非所有结果都会被存储。默认情况下，低于 500 的任何结果如下：

| 结果 | 默认行为 | 原因 |
| :--- | :--- | :--- |
| 2xx | 存储并重放 | 支付成功 |
| 4xx `HttpException` (验证 400, 拒绝 402, 404, 409 已支付) | 存储，并在每次重放时再次抛出 | 它是确定性的：相同的请求会得到相同的答案 |
| 带有 4xx 的其他错误 `status` (`AuthorizationError`, 403) | 存储为 Nest 的该状态异常，并重放 | 它的包将其转换为该状态 |
| 5xx 或未知错误 (支付提供者 503, 数据库宕机) | 不存储。键被释放，因此会再次运行重试 | 大多数故障发生在副作用之前 |
| `StreamableFile`, 流, 没有 `passthrough` 的 `@Res()` | 不存储。键被释放，并记录警告 | 它们无法被重放 |

重放的错误被重建为一个带有存储状态和正文的纯 `HttpException`，并再次通过您的异常过滤器。检查 `instanceof` 与自定义异常类的过滤器会在重放时看到基类。

`storeIf` 选项更改了此规则。它接收状态和处理程序抛出时的错误。例如，`storeIf: () => true` 也存储 5xx 错误，就像 Stripe 一样。这对于默认设置遗漏的那个间隙很重要：发生在副作用**之后**的 5xx。如果支付提供者向卡收费，然后 `markPaid()` 失败，则释放键，重试会再次收费。有三种方法来弥补这个间隙：

- 将从用户 ID 和幂等性键派生的键传递给支付提供者。大多数支付提供者接受自己的幂等性键，因此提供者也会去重收费。仅凭幂等性键是不够的，因为两个用户可能会发送相同的键。
- 使用 `storeIf` 为此处理程序存储 5xx 错误，并在发生 5xx 后让应用程序启动新的尝试。要仅存储发生在收费之后的失败，请在那里抛出专用异常并检查它：`storeIf: (status, error) => status < 500 || error instanceof ChargeCapturedError`。
- 在一个事务中写入支付和事件，使用 [transactional outbox](/reliability/outbox#prerequisites)。

#### 试用

启动运输服务，以及配置了 `DATABASE_URL`（已应用迁移）、`IDEMPOTENCY_KEYS` 和支付提供者沙箱的 API。沙箱响应大约需要半秒。下面的输出已裁剪到相关标头。

没有键的支付被拒绝：

```bash
$ curl -i localhost:3000/orders/ord_1001/pay \
    -H 'Authorization: Bearer alice-token' \
    --json '{"paymentMethod":"pm_card_visa"}'
HTTP/1.1 400 Bad Request

{"statusCode":400,"error":"Bad Request","code":"IDEMPOTENCY_KEY_REQUIRED","message":"An idempotency key is required for this operation."}

```

带有键的第一次调用收费卡：

```bash
$ KEY=$(uuidgen)
$ curl -i localhost:3000/orders/ord_1001/pay \
    -H 'Authorization: Bearer alice-token' \
    -H "Idempotency-Key: $KEY" \
    --json '{"paymentMethod":"pm_card_visa"}'
HTTP/1.1 201 Created
Content-Type: application/json; charset=utf-8

{"orderId":"ord_1001","receiptId":"ch_0001","amount":4098,"cardLast4":"4242","paidAt":"2026-09-22T11:09:25.813Z"}

```

使用相同键的重试获得相同的收据，直到 `paidAt`，并且没有调用支付提供者：

```bash
$ curl -i localhost:3000/orders/ord_1001/pay \
    -H 'Authorization: Bearer alice-token' \
    -H "Idempotency-Key: $KEY" \
    --json '{"paymentMethod":"pm_card_visa"}'
HTTP/1.1 201 Created
Idempotent-Replayed: true
Content-Type: application/json; charset=utf-8

{"orderId":"ord_1001","receiptId":"ch_0001","amount":4098,"cardLast4":"4242","paidAt":"2026-09-22T11:09:25.813Z"}

```

使用不同卡的相同键是客户端错误：

```bash
$ curl -i localhost:3000/orders/ord_1001/pay \
    -H 'Authorization: Bearer alice-token' \
    -H "Idempotency-Key: $KEY" \
    --json '{"paymentMethod":"pm_card_mastercard"}'
HTTP/1.1 422 Unprocessable Entity

{"statusCode":422,"error":"Unprocessable Entity","code":"IDEMPOTENCY_KEY_REUSED","message":"This idempotency key was already used for a different request."}

```

最后，同时发送两个带有新键的请求，用于另一个订单。其中一个被收费，另一个在支付提供者仍在工作时收到带有 `Retry-After: 2` 的 409 错误：

```bash
$ KEY=$(uuidgen)
$ for i in 1 2; do
  curl -s -o /dev/null -w '%{http_code} %header{retry-after}\n' \
    localhost:3000/orders/ord_1002/pay \
    -H 'Authorization: Bearer alice-token' \
    -H "Idempotency-Key: $KEY" \
    --json '{"paymentMethod":"pm_card_visa"}' &
done; wait
409 2
201

```

> info **提示** `--json` 需要 curl 7.82 或更高版本，而 `%header` 在 `-w` 中需要 curl 7.84 或更高版本。

#### 测试

在端到端测试中，保留应用程序的真实配置，但用一个纯 `InMemoryIdempotencyStore` 覆盖 `DrizzleIdempotencyStore` 提供者。纯实例不会注册自身，因此模块会回退到其内存存储，由于 Nest 从不创建 `DrizzleIdempotencyStore`，因此没有查询数据库（node-postgres 池在第一次查询时连接，所以 `DrizzleModule` 也不会打开连接）。加密密钥仍然来自 `IDEMPOTENCY_KEYS`，因此在测试环境中设置它，例如在 `vitest.config.mts` 中使用 `test.env`。

使用小的延迟模拟支付提供者，以便同时发送的两个请求重叠：

```typescript title="test/pay-order.e2e-spec.ts"
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { InMemoryIdempotencyStore } from '@nestjs/idempotency';
import { Test } from '@nestjs/testing';
import { setTimeout } from 'node:timers/promises';
import { EMPTY } from 'rxjs';
import request from 'supertest';
import type { MockInstance } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { DrizzleIdempotencyStore } from '../src/idempotency/drizzle-idempotency.store.js';
import { SHIPPING_SERVICE } from '../src/orders/orders.service.js';
import { PaymentProviderClient } from '../src/payments/payment-provider.client.js';

describe('POST /orders/:id/pay', () => {
  let app: INestApplication;
  let charge: MockInstance<PaymentProviderClient['charge']>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DrizzleIdempotencyStore)
      .useValue(new InMemoryIdempotencyStore())
      .overrideProvider(SHIPPING_SERVICE)
      .useValue({ emit: () => EMPTY })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.listen(0, '127.0.0.1');

    charge = vi.spyOn(app.get(PaymentProviderClient), 'charge').mockImplementation(async (input) => {
      await setTimeout(100); // slow enough for duplicates to overlap
      return {
        id: 'ch_test',
        amount: input.amount,
        cardLast4: '4242',
        reference: input.reference,
        createdAt: new Date().toISOString(),
      };
    });
  });

  afterEach(() => app.close());

  const pay = (key: string) =>
    request(app.getHttpServer())
      .post('/orders/ord_1001/pay')
      .set('Authorization', 'Bearer alice-token')
      .set('Idempotency-Key', key)
      .send({ paymentMethod: 'pm_card_visa' });

  it('charges once when the app retries', async () => {
    const first = await pay('key-1').expect(201);
    const retry = await pay('key-1').expect(201).expect('Idempotent-Replayed', 'true');

    expect(retry.body).toEqual(first.body);
    expect(charge).toHaveBeenCalledTimes(1);
  });

  it('rejects a duplicate that arrives while the first is in flight', async () => {
    const [a, b] = await Promise.all([pay('key-2'), pay('key-2')]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(charge).toHaveBeenCalledTimes(1);
  });
});

```

应用程序初始化后，`app.get(IdempotencyStorage).source` 返回正在使用的存储，这里是内存中的存储。其 `peek(key)` 方法在记录键（如 `usr_alice:key-1` (`state`, `fingerprint` 和 `response`)）下返回原始记录，可用于断言，例如“已存储被拒绝的支付”。单独使用来自 [Store keys in PostgreSQL](/reliability/idempotency#store-keys-in-postgresql) 的契约套件测试您自己的存储，针对真实服务器。如果想在端到端测试中保留 Drizzle 存储，请用 `overrideProvider(getDrizzleToken()).useValue(db)`（`getDrizzleToken` 来自 `@nestjs/drizzle`）替换 `DrizzleModule` 注册的数据库，其中 `db` 是使用您的迁移在 PGlite 上的 Drizzle 数据库。示例项目以这种方式测试加密、GraphQL、事件和调优。

有关测试设置的更多信息，请参阅 [End-to-end testing](/fundamentals/testing#端到端测试)。

#### 生产检查清单

- 注册一个共享存储（您的数据库或 Redis），即使只有一个实例也是如此：内存记录在每次重启或部署时都会丢失，并且重试后会再次运行处理程序。使用 `concurrent` 开启后，使用契约套件对其进行测试。在生产环境中，除非设置了 `allowInMemoryStorage`，否则应用程序拒绝启动。使用 Redis 时，请配置 `maxmemory-policy noeviction`。过早驱逐的记录是潜在的双重收费，由于每个幂等性记录都有 TTL，`volatile-*` 策略也会驱逐它们。
- 在每个移动资金或创建客户可能注意到两次的实体上设置 `required: true`。
- 对每个面向客户端的端点设置 `scope`。如果没有它，一个用户的密钥可能会重放另一个用户的响应。当已登录用户调用没有此保护的处理程序时，模块会记录一个警告。
- 将幂等性拦截器放在其他全局拦截器之外。全局拦截器按注册顺序运行，`APP_INTERCEPTOR` 的提供者在它导入的模块的提供者之前注册，因此它们在外部运行并看到每次重放。模块在启动时会发出警告。当其中一个被 `ClassSerializerInterceptor` 时，它会拒绝启动，因为重放会向其提供一个纯对象，并发送 `@Exclude()` 隐藏的字段。请使用 `app.useGlobalInterceptors()` 在 `main.ts` 或在导入在 `IdempotencyModule` 之后的模块中注册此类拦截器。
- 使用数据库存储时，通过迁移创建其表，为语句设置连接池大小，保持实例时钟同步，并按计划调用 `prune()`。
- 保持 `ttl` 高于客户端的重试窗口。`lockTtl` 只需要覆盖崩溃，因为在处理程序运行时会续订锁。
- 观察事件。`IdempotencyEvents` 是可注入的，其 `events$` 流报告每次重放、每次带有其 `code` 的拒绝以及每次丢失的锁。相同的事件也会在 `nestjs:idempotency:replayed`、`nestjs:idempotency:rejected` 和 `nestjs:idempotency:lock-lost` 诊断通道上发布，供跟踪工具使用。对 `lock-lost` 进行警报：这意味着尝试的结果不在存储中，因为续订失败（存储不可达或事件循环阻塞时间超过 `lockTtl`），或者因为写入结果时存储失败，重试可能会再次运行处理程序。
- 在响应包含个人或支付数据时，在端点存储其第一条记录之前，开启 `encryption`。将密钥保存在密钥管理服务中，按照上述三个步骤轮换它们，并且在 `ttl` 过去之前绝不删除密钥。
- 将派发密钥（由用户 ID 和幂等性密钥派生）传递给支付提供者，以覆盖收费后的失败。
- 当多个服务共享一个 Redis 时，为每个服务设置自己的密钥前缀（存储中的 `idem:`）或自己的数据库。记录密钥仅在单个服务内是唯一的：两个服务可以都有同名的处理程序类，客户端可以向两者发送同一个密钥。
- 将状态检查保留在服务中，理想情况下作为条件数据库更新。幂等性密钥去重了单次尝试的重试，但创建两个密钥的两次点击是两次尝试。
- 让浏览器发送头部。对于跨域客户端，将 `Idempotency-Key` 添加到 CORS `allowedHeaders`，并将 `Idempotent-Replayed` 和 `Retry-After` 添加到 `exposedHeaders`。
- 保持幂等响应小巧。整个响应体都会被存储，并且该包目前没有大小限制。

#### 存储契约

教程使用 Drizzle、TypeORM 和 Redis 编写了存储。本节总结了任何 `IdempotencyStore` 必须执行的操作，以便使用其他 ORM 编写存储。包 README 中的“实现存储”详细介绍了每个方法。

**注册。** 存储是一个普通的单例提供者，它在构造函数中调用可注入的 `IdempotencyStorage` 上的 `registerSource(this)`。注册表会一次性检查形状，除非通过 `replace: true`，否则拒绝第二次注册，并在 `IdempotencyModule` 初始化时锁定，记录存储正在使用中。如果没有注册任何内容，模块使用 `InMemoryIdempotencyStore`，一个实例不能与另一个共享，并且在重启时会丢失其记录。使用 `NODE_ENV=production` 时，除非设置了 `allowInMemoryStorage: true`（接受每次重启或部署丢失记录），否则启动会失败。

**方法。** 所有四个方法都是原子的：每个方法决定了谁持有密钥，而读取后紧接着的单独写入允许两个请求都运行处理程序，这就是该包旨在防止的双重收费。没有一个方法会接管您的事务：幂等性记录是独立写入的，绝不是作为您的业务事务的一部分。

| 方法 | 功能 | 如何保持原子性 |
| --- | --- | --- |
| `acquire(key, owner, fingerprint, lockTtl)` | 抢占空闲或已过期的密钥的锁，或返回找到的记录 | 单个插入操作接管同一语句中的过期行，因此在许多并发调用者中只有一个获胜；其他调用者读取获胜者的记录 |
| `complete(key, owner, response, ttl)` | 将所有者的活动锁转换为已完成的记录 | 比较并设置：所有者和过期检查都在写入语句的 `WHERE` 中 |
| `release(key, owner)` | 删除所有者的活动锁，以便重试可以运行处理程序 | 比较并设置，如 `complete()` |
| `extend(key, owner, lockTtl)` | 续订所有者的活动锁 | 比较并设置，如 `complete()` |

**使用 Prisma。** Drizzle 和 TypeORM 存储是模型，具有相同的表：

- **`acquire()`** 是一个 `INSERT ... ON CONFLICT (key_hash) DO UPDATE ... WHERE expires_at <= now RETURNING`。Prisma 的 `upsert()` 没有更新条件，因此请使用 `$queryRaw`。当没有行返回时，像其他存储一样读取记录。
- **`complete()`、`release()` 和 `extend()`** 将所有者和过期时间放入 `WHERE` 并计数行：使用 `updateMany()` 或 `deleteMany()` 配合 `keyHash`、`owner`，并在 `where` 中对 `expiresAt` 应用 `gt: now` 过滤器，以及 `count === 1`。不是在 `findUnique()` 之后执行 `update()`：它先读取。
- **响应列** 是 `json` 而不是 `jsonb`，在任何 ORM 中：`jsonb` 会拒绝字符串内部的 `\u0000`，但响应体可以包含它。

**进行测试**，使用来自 `@nestjs/idempotency/testing` 的套件，就像 Drizzle、TypeORM 和 Redis 存储所做的那样。`idempotencyStoreContract()` 为任何测试运行器返回案例。`concurrent: true` 对每个键进行 16 个调用竞争；在具有连接池的 PostgreSQL 上运行它，这样调用才会真正重叠。`advanceTime` 移动存储的时钟以处理过期情况，没有它它们会实时等待。

#### 参考

##### 模块选项

`IdempotencyModule.forRoot()` 接受这些选项。`forRootAsync()` 在顶层接受 `isGlobal` 和 `imports`，紧邻 `useFactory`、`useClass` 或 `useExisting`，而工厂返回其余部分。除 `header`、`replayHeaders`、`storeTimeout`、`encryption`、`allowInMemoryStorage` 和 `isGlobal` 外，所有选项也可以在 `@Idempotent()` 的每个类或处理程序中设置，在那里它会按字段与模块的设置合并。

| 选项 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `required` | `boolean` | `false` | 如果没有键则拒绝调用，使用 `IDEMPOTENCY_KEY_REQUIRED`。 参见 [Make the payment endpoint idempotent](/reliability/idempotency#make-the-payment-endpoint-idempotent)。 |
| `scope` | function, object 或 `false` | none | 键命名空间，例如用户 ID。对象在每个上下文中有一个函数，在 `http`、`graphql` 和 `rpc` 下。 `false` 有意共享一个命名空间。 |
| `ttl` | `Duration` | `'24h'` | 已完成结果重放的时长。 参见 [Tune TTLs and failure handling](/reliability/idempotency#tune-ttls-and-failure-handling)。 |
| `lockTtl` | `Duration` | `'60s'` | 续订停止后，正在进行的锁存活的时长。锁每 `lockTtl / 3` 续订一次。 |
| `maxLockHold` | `Duration` | `'1h'` | 正在运行的处理程序保持锁续订的时长。 参见 [Tune TTLs and failure handling](/reliability/idempotency#tune-ttls-and-failure-handling)。 |
| `retryAfter` | `Duration` | `'1s'` | 随 `IDEMPOTENCY_KEY_IN_USE` 发送的等待时间，以完整秒为单位，向上取整。 |
| `keyFrom` | source, 或每个上下文的一个 source | 参见下方 | 键的来源：`header`、`arg` (GraphQL)、`payload` (微服务) 或 `ExecutionContext` 的函数。 |
| `fingerprint` | `(payload, context) => unknown` | the whole payload | 重试必须重复的内容。方法和 URL、GraphQL 字段或消息模式以及作用域始终计算在内。 |
| `storeIf` | `(status, error) => boolean` | `status < 500` | 存储和重放哪些结果。其他结果释放键。 |
| `header` | `string` | `'Idempotency-Key'` | HTTP 标头，GraphQL 也读取它，以及微服务的传输标头名称。 |
| `replayHeaders` | `string[]` | none | 除了 `Location`、`Content-Type`、`Content-Language`、`Content-Location`、`ETag` 和 `Last-Modified` 外重放的响应标头。在启动时拒绝 `Set-Cookie` 和平台为每个响应写入的标头。 |
| `storeTimeout` | `Duration` | `'10s'` | 每个存储调用（`acquire()`、`complete()`、`release()` 和 `extend()`）可能花费的时长。 参见 [Errors](/reliability/idempotency#errors)。 |
| `encryption` | 包含 `keys` 的对象 | off | 存储记录的 AES-256-GCM 加密。`keys` 列出 32 字节的 `Buffer` 或至少 32 个字符的字符串，最新的在前。 参见 [Encrypt stored receipts](/reliability/idempotency#encrypt-stored-receipts)。 |
| `allowInMemoryStorage` | `boolean` | `false` | 允许生产应用程序在没有注册存储的情况下启动。 |
| `isGlobal` | `boolean` | `true` | 全局注册模块。 |

每个持续时间以毫秒或诸如 `'45s'`、`'48h'` 或 `'7d'` 的字符串表示。

默认情况下，键来自以下来源：

| 上下文 | 默认来源 |
| --- | --- |
| HTTP | `Idempotency-Key` 标头（`header` 选项） |
| GraphQL | 突变（mutation）的 `idempotencyKey` 参数，然后是标头 |
| 微服务 | 负载的 `idempotencyKey` 属性，然后是由 `header` 指定的传输标头 |

键是 1 到 255 个可打印 ASCII 字符。负载中的数字按其位数计算。

##### 事件

`IdempotencyEvents.events$` 发射每个事件，每个事件也会发布到诊断通道。每个负载都有 `type`、`context`（`'http'`、`'graphql'` 或 `'rpc'`）、`handler`（例如 `OrdersController.pay`）、`key`，以及如果有的话，还有 `scope`。

| 类型 | 通道 | 负载类型 | 其他字段 | 何时 |
| --- | --- | --- | --- | --- |
| `replayed` | `nestjs:idempotency:replayed` | `IdempotencyReplayedEvent` | `status` | 重试获取了存储的结果，或跳过了一个重复事件 |
| `rejected` | `nestjs:idempotency:rejected` | `IdempotencyRejectedEvent` | `code`, `status` | 在处理程序运行前调用被拒绝。没有 `key` 用于 `IDEMPOTENCY_KEY_REQUIRED` 和 `IDEMPOTENCY_KEY_INVALID`。 |
| `lock-lost` | `nestjs:idempotency:lock-lost` | `IdempotencyLockLostEvent` | `phase`（`'extend'`、`'complete'` 或 `'release'`） | 尝试的结果不在存储中，因此重试可能会再次运行处理程序 |

`IdempotencyEvent` 是这三种负载类型的联合。

##### 错误

拒绝携带以下代码之一，类型为 `IdempotencyErrorCode`。通过 HTTP，代码在响应体中。在 GraphQL 中，它在字段错误的 `extensions` 中，带有 `httpStatus`，对于 409 错误，带有 `retryAfter`。在微服务中，`RpcException` 负载包含 `status`、`code`、`statusCode`、`message`，对于 409 错误，包含 `retryAfter`。

| 代码 | 状态 | 消息 | 原因 |
| --- | --- | --- | --- |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | 此操作需要幂等性键。 | 没有键，使用 `required: true` |
| `IDEMPOTENCY_KEY_INVALID` | 400 | 幂等性键必须是 1 到 255 个可打印 ASCII 字符。 | 键太长、包含其他字符，或不是字符串或数字 |
| `IDEMPOTENCY_KEY_IN_USE` | 409，带有 `Retry-After` | 使用此幂等性键的请求仍在处理中。 | 使用该键的首次调用仍在运行 |
| `IDEMPOTENCY_KEY_REUSED` | 422 | 此幂等性键已用于不同的请求。 | 具有不同指纹的相同键 |
| `IDEMPOTENCY_RECORD_UNREADABLE` | 500 | 无法读取此幂等性键的存储结果。 | 存储记录无法解密，例如因为其密钥已被移除 |

耗时超过 `storeTimeout` 的存储调用将失败。超时 `acquire()` 会以 `IdempotencyStoreTimeoutError` 失败请求，该错误从 `@nestjs/idempotency` 导出。超时 `complete()` 或 `release()` 被报告为锁丢失，结果仍发送给调用者。