<!-- 此文件从 content/tutorials/payments-webhooks.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:53:22.028Z -->
<!-- 源文件: content/tutorials/payments-webhooks.md -->
<!-- 源哈希: 937bf074a2c1158313bcb3cfee56819d -->

### 使用 Webhook 在 Node.js 中接受支付

使用 NestJS 在 Node.js 中接受支付：支付提供者 Webhook，例如 Stripe 的，签名检查、幂等性键、事件恰好执行一次。

它将支付添加到电子商务后端：API 为每个订单在支付提供者创建支付，当提供者的签名 Webhook 表示如此时，订单才被标记为已支付，绝不是因为浏览器从支付页面返回。它继续 [Build an e-commerce backend](/tutorials/ecommerce-backend)。收款是提供者的工作。API 的工作是只请求一次，只相信提供者签名的内容，并且无论事件以何种顺序到达或出现多少次，都恰好执行提供者的每个事件一次。

最终，API 将：

- 通过 [`@nestjs/http-client`](/application/http-client) 上的类型化客户端，为每个订单在提供者处创建一个支付，使用订单 ID 作为提供者的幂等性键，因此重试或第二次点击绝不会创建第二个支付。
- 接收提供者的 Webhook，如 [`@nestjs/webhooks`](/http/webhooks)：在原始主体上验证，按事件 ID 去重，并与它们所做的变更在同一事务中记录。
- 使用一次条件更新，将订单从 `placed` 移动到 `paid`，因此重放的、延迟的或乱序的事件不会改变任何内容，支付绝不会将已取消的订单恢复。
- 当支付失败时，根据电子商务教程中的取消逻辑，取消订单并恢复其库存。
- 仅在支付事务已提交后，通过 [transactional outbox](/reliability/outbox) 宣布 `order.paid`。
- 在针对 PostgreSQL 的测试中证明提供者签名的 Webhook 的方式。

**模拟的内容。** 这里没有真实的支付提供者，本页面上没有任何卡片会收费。提供者是虚构的：其 API 的形状类似于 Stripe（一个带有 bearer 密钥和 `Idempotency-Key` 头的 `POST`），并且其 Webhook 遵循 [Standard Webhooks](https://www.standardwebhooks.com)，这是许多提供者使用的方案。当您尝试 API 时，一个小型脚本代替提供者，并且测试本身会签署提供者的请求。[Switch to a real provider](/tutorials/payments-webhooks#switch-to-a-real-provider) 列出了一个的变更。

这些是端点，以及添加每个端点的部分：

| 端点 | 部分 |
| --- | --- |
| 电子商务教程中的：`/auth/*`, `/me`, `/health/*`, `/products`, `/cart` 和 `/orders` | [Start from the e-commerce backend](/tutorials/payments-webhooks#start-from-the-e-commerce-backend) |
| `POST /orders/:id/payment` | [Create the payment](/tutorials/payments-webhooks#create-the-payment) |
| `POST /webhooks/payments` | [Receive the provider's webhooks](/tutorials/payments-webhooks#receive-the-providers-webhooks) |

> info **提示** 完成的应用在 GitHub 上是 [nestjs/example-payments-webhooks](https://github.com/nestjs/example-payments-webhooks)，包含其测试和 CI 工作流。

#### 从电子商务后端开始

从 [Build an e-commerce backend](/tutorials/ecommerce-backend) 的完成应用开始，全部包括：`src/`、`test/`、带有迁移的 `drizzle/` 文件夹及其数据库。本教程更改了其中的一些文件并添加了第二个迁移。安装它添加的三个包：

```bash
$ npm i --save @nestjs/webhooks @nestjs/outbox @nestjs/http-client

```

- `@nestjs/webhooks` 验证提供者的 Webhook 并跳过已处理的 Webhook。
- `@nestjs/outbox` 将已处理的 Webhook 列表（其**收件箱**）保存在数据库中，并在提交后发送 `order.paid`。`@nestjs/webhooks` 即使在不发送 Webhook 的应用中也需要它来维护收件箱。
- `@nestjs/http-client` 调用提供者的 API。

提供者为您提供三样东西：其 API 的 URL、一个 API 密钥和一个 Webhook 签名密钥，Standard Webhooks 将其写入 `whsec_`，然后是 base64 编码。 [Try it](/tutorials/payments-webhooks#try-it) 的模拟提供者接受任何密钥和您生成的密钥。将它们添加到 `.env`：

```bash
PAYMENTS_API_URL=http://localhost:4000
PAYMENTS_API_KEY=sk_test_anything
# From the provider's dashboard. For the fake provider: echo "whsec_$(openssl rand -base64 32)"
PAYMENTS_WEBHOOK_SECRET=

```

配置模式在启动时检查它们，因此缺少密钥会停止应用程序，而不是使每个 Webhook 失败：

```typescript title="src/config.ts"
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.url(),
  // Signs the access tokens: at least 32 bytes.
  JWT_SECRET: z.string().min(32),
  // The browser origins allowed to call the API, comma-separated. None by default.
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean))
    .pipe(z.array(z.url())),
  // The payment provider's API, and the key it gave you.
  PAYMENTS_API_URL: z.url(),
  PAYMENTS_API_KEY: z.string().min(1),
  // Verifies the provider's webhooks: whsec_ and base64, from the provider's dashboard.
  PAYMENTS_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
  // "off" in tests, which run the outbox relay themselves.
  OUTBOX_RELAY: z.enum(['on', 'off']).default('on'),
});

export type Env = z.infer<typeof envSchema>;

```

`OUTBOX_RELAY` 允许测试自行运行出件箱的中继，就像 [Test it](/tutorials/payments-webhooks#test-it) 所做的那样。

#### 在订单上记录支付

订单获得一个状态 `paid`，该状态位于 `placed` 和 `shipped` 之间，以及支付的提供者 ID。在 `src/database/schema.ts` 中，`orders` 表变为：

```typescript title="src/database/schema.ts"
// ...
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    // placed, then paid and shipped, or cancelled.
    status: text('status', { enum: ['placed', 'paid', 'shipped', 'cancelled'] }).notNull(),
    total: integer('total').notNull(),
    // The provider's id for the payment, set when it succeeds.
    paymentId: text('payment_id'),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (table) => [index('orders_user_id_created_at_idx').on(table.userId, table.createdAt)],
);
// ...

```

该状态是一个 `text` 列，其值由 Drizzle 类型化，因此新状态不需要在数据库中进行更改。生成添加 `payment_id` 列的迁移并应用它：

```bash
$ npx drizzle-kit generate --name=payments
$ npx drizzle-kit migrate

```

下面的服务之间相互传递 Drizzle 的事务，因此为其类型命名：

```typescript title="src/database/drizzle.ts"
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/** What `db.transaction()` hands its callback. */
export type Transaction = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

```

#### 创建支付

提供者的 API 有一个此商店需要的调用：为金额创建支付，该调用返回支付 ID 和提供者的支付页面，客户在此输入卡片信息。商店永远看不到卡片。提供者在其 API 响应和 Webhook 中发送内容的类型如下：

```typescript title="src/payments/payment.ts"
/** A payment, as the provider's API returns it. */
export interface Payment {
  id: string;
  /** In cents. */
  amount: number;
  currency: string;
  /** What the payment is for: the order's id. */
  reference: string;
  status: 'requires_payment' | 'succeeded' | 'failed';
  /** The provider's payment page, where the customer pays. */
  checkoutUrl: string;
}

/** The provider's webhook body: Standard Webhooks' `type`, `timestamp` and `data`. */
export interface PaymentEvent {
  type: 'payment.succeeded' | 'payment.failed';
  timestamp: string;
  data: Payment;
}

```

客户端是一个围绕其自身的 [`HttpClient`](/application/http-client) 的小型类，名为 `payments`：

```typescript title="src/payments/payments.client.ts"
import { Injectable } from '@nestjs/common';
import { HttpClient, InjectHttpClient, toHttpException } from '@nestjs/http-client';
import type { Order } from '../database/schema.js';
import type { Payment } from './payment.js';

/** The payment provider's API: the one call this shop makes. */
@Injectable()
export class PaymentsClient {
  constructor(@InjectHttpClient('payments') private readonly http: HttpClient) {}

  /** The order's payment. Called again for the same order, it returns the same payment. */
  async createPayment(order: Pick<Order, 'id' | 'total'>): Promise<Payment> {
    try {
      const { data } = await this.http.post<Payment>('/v1/payments', {
        json: { amount: order.total, currency: 'usd', reference: order.id },
        // One key per order: a retry, or a second click, can't create a second payment.
        headers: { 'idempotency-key': order.id },
        // POST isn't retried by default; with the key, retrying is safe.
        retry: { methods: ['POST'] },
      });
      return data;
    } catch (error) {
      // 502 when the provider fails, 504 when it doesn't answer in time.
      throw toHttpException(error);
    }
  }
}

```

- **幂等性键是订单 ID。** 提供者创建支付后的超时看起来像失败，因此客户端会重试，客户可能会点击“支付”两次。使用相同的键，提供者会返回它已创建的支付而不是创建另一个。一个订单，一个支付。
- **重试 `POST`。** HTTP 客户端默认不重试 `POST`，因为重复操作可能会导致双重收费（参见 [Retries](/application/http-client#retries)）。该键使其安全，因此此请求选择启用。
- **错误变为 502 或 504。** `toHttpException()` 将失败的提供者转换为一个 `502 Bad Gateway`，将缓慢的提供者转换为一个 `504 Gateway Timeout`，并记录下来，而不是一个 `500`（参见 [Handling errors](/application/http-client#错误处理)）。
- **不验证 `data`。** 类型参数描述了响应；运行时没有内容进行检查。对于您使用自己的密钥调用的提供者文档化 API 来说，这是可以接受的。

服务会检查订单是否属于该客户并且仍然 `placed`，然后向提供者请求：

```typescript title="src/payments/payments.service.ts"
import { ConflictException, Injectable } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service.js';
import { PaymentsClient } from './payments.client.js';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly paymentsClient: PaymentsClient,
  ) {}

  /** Starts paying for the user's order: where to send the customer to pay. */
  async start(userId: string, orderId: string) {
    const order = await this.ordersService.findOne(userId, orderId);
    if (order.status !== 'placed') {
      throw new ConflictException(`Order is ${order.status}`);
    }
    // Outside any transaction: no database connection waits on the provider.
    const payment = await this.paymentsClient.createPayment(order);
    return { paymentId: payment.id, checkoutUrl: payment.checkoutUrl };
  }
}

```

调用提供者时发生在任何数据库事务之外。一个等待另一个公司 API 的事务会一直持有连接池的连接及其行锁，直到提供者完成。读取和调用不是原子的：客户可以在两者之间取消订单。在这里这没有害处，因为付款只能通过 Webhook 更改订单，该 Webhook 会在更改状态的声明中再次检查状态。

```typescript title="src/payments/payments.controller.ts"
import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { z } from 'zod';
import { PaymentsService } from './payments.service.js';

const orderId = { schema: z.uuid() };

@Controller('orders')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // The same order always gets the same payment, so this answers 200, new or not.
  @Can.Anyone()
  @Post(':id/payment')
  @HttpCode(200)
  start(@CurrentUser('id') userId: string, @Param('id', orderId) id: string) {
    return this.paymentsService.start(userId, id);
  }
}

```

付款模块注册客户端，包含 API 的 URL、作为 bearer token 的密钥以及每次尝试的超时时间。它导入 `OrdersModule`，因此请将 `exports: [OrdersService]` 添加到该模块中（其最终版本在 [Announce paid orders after the commit](/tutorials/payments-webhooks#announce-paid-orders-after-the-commit)）：

```typescript title="src/payments/payments.module.ts"
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClientModule } from '@nestjs/http-client';
import type { Env } from '../config.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PaymentWebhooksController } from './payment-webhooks.controller.js';
import { PaymentsClient } from './payments.client.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [
    OrdersModule,
    HttpClientModule.registerAsync({
      name: 'payments',
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        baseUrl: config.get('PAYMENTS_API_URL', { infer: true }),
        headers: { authorization: `Bearer ${config.get('PAYMENTS_API_KEY', { infer: true })}` },
        timeout: '10s',
      }),
    }),
  ],
  controllers: [PaymentsController, PaymentWebhooksController],
  providers: [PaymentsClient, PaymentsService],
})
export class PaymentsModule {}

```

提供者的密钥使其重试安全。您自己的 `POST /orders/:id/payment` 也安全重试，因为第二次调用会返回相同的付款。一个第二次调用会执行操作的路由（例如直接收取已保存的卡片）需要客户端发送的幂等性密钥：[`@nestjs/idempotency`](/reliability/idempotency) 每次针对 `Idempotency-Key` 运行处理程序，并用存储的响应回答重试。它发送的是存储的契约，而不是存储本身，因此在生产环境中，您像 [Store keys in PostgreSQL](/reliability/idempotency#store-keys-in-postgresql) 所示的，将其写入您的数据库。

#### 接收提供者的 Webhook

当客户付款或卡被拒绝时，提供者会发送一个 Webhook：一个带有签名的 `POST`，发送到您在其仪表板中注册的 URL，此处为 `https://<your API>/webhooks/payments`。签名是使用共享密钥对事件 ID、时间戳和正文的 HMAC。检查签名需要正文与签名时完全一致，而不是正文解析器创建的对象，因此请使用 `rawBody: true` 创建应用程序（参见 [Raw body](/faq/raw-body)）：

```typescript title="src/main.ts"
// ...
const app = await NestFactory.create<NestNodeApplication>(AppModule, new NodeAdapter(), {
  instrument: ObserveInstrument,
  // Webhooks are verified on the bytes the provider signed, not on a re-serialized body.
  rawBody: true,
  logger: new ConsoleLogger({
    // ...
  }),
});
// ...

```

根模块将 outbox、其存储和 webhooks 模块作为**接收者**与提供者注册：

```typescript title="src/app.module.ts"
import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthenticationModule } from '@nestjs/authentication';
import { AuthorizationModule } from '@nestjs/authorization';
import { DrizzleModule, getDrizzleToken } from '@nestjs/drizzle';
import { createObserveModule } from '@nestjs/observe';
import { OutboxModule, OutboxStorage } from '@nestjs/outbox';
import { fromDrizzle, PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { WebhooksModule } from '@nestjs/webhooks';
import { ThrottlerGuard, ThrottlerModule, minutes, normalizeIp } from '@nestjs/throttler';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { accountEmail } from './auth/account-email.js';
import { AuthModule } from './auth/auth.module.js';
import { envSchema, type Env } from './config.js';
import { CartModule } from './cart/cart.module.js';
import { HealthModule } from './health/health.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { ProductsModule } from './products/products.module.js';
import { UsersModule } from './users/users.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // First, so it shuts down last and still sends what the other modules did.
    ObserveModule.forRoot({
      // Empty until `npx @nestjs/observe link` writes the key pair into .env: the SDK then sends nothing.
      appKey: process.env.OBSERVE_APP_KEY ?? '',
      appSecret: process.env.OBSERVE_APP_SECRET ?? '',
      serviceId: 'shop-api',
    }),
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    DrizzleModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        drizzle,
        connection: config.get('DATABASE_URL', { infer: true }),
      }),
    }),
    AuthenticationModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        accessToken: {
          key: config.get('JWT_SECRET', { infer: true }),
          issuer: 'shop-api',
          audience: 'shop-api',
          ttl: '15m',
        },
        refreshToken: { ttl: '30d', absoluteTtl: '90d' },
      }),
    }),
    // After AuthenticationModule: its guard reads the user that authentication sets.
    AuthorizationModule.forRoot(),
    ThrottlerModule.forRoot([
      // Per IP address, on every route.
      { name: 'default', ttl: minutes(1), limit: 100 },
      // Per email and IP address, wherever the request body names an account.
      {
        name: 'account',
        ttl: minutes(15),
        limit: 5,
        skipIf: (context) => !accountEmail(context.switchToHttp().getRequest()),
        getTracker: (req) => `${accountEmail(req)}|${normalizeIp(req.ip)}`,
      },
    ]),
    // Runs order.paid after the commit, and keeps the inbox that deduplicates webhooks.
    OutboxModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        relay: { enabled: config.get('OUTBOX_RELAY', { infer: true }) === 'on', pollInterval: '1s' },
      }),
    }),
    // Receives webhooks only: this shop sends none, so it needs no webhook store.
    WebhooksModule.forRootAsync({
      outgoing: false,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        receivers: {
          // The provider follows Standard Webhooks: webhook-id, webhook-timestamp, webhook-signature.
          payments: { scheme: 'standard', secret: config.get('PAYMENTS_WEBHOOK_SECRET', { infer: true }) },
        },
      }),
    }),
    UsersModule,
    AuthModule,
    ProductsModule,
    CartModule,
    OrdersModule,
    PaymentsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: StandardSchemaValidationPipe },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    {
      // Outbox messages and the inbox, in the shop's database, in a schema of their own (nest_outbox).
      provide: PostgresOutboxStore,
      inject: [getDrizzleToken(), OutboxStorage],
      useFactory: (db: NodePgDatabase, outboxStorage: OutboxStorage) =>
        new PostgresOutboxStore({ executor: fromDrizzle(db) }, outboxStorage),
    },
  ],
})
export class AppModule {}

```

- **`outgoing: false`**。`@nestjs/webhooks` 也发送 Webhook，带有端点、投递和存储。此商店仅接收它们，因此不需要这些。
- **接收者的名称** `payments` 是路由装饰器命名的。`scheme: 'standard'` 检查三个 `webhook-` 标头，以恒定时间检查签名，并确保签名的时间戳在当前时间五分钟内，这可以防止捕获的请求被稍后重放。
- **`PostgresOutboxStore`** 将收件箱和 outbox 的消息保存在商店的数据库中，在一个独立的模式 `nest_outbox` 中，该模式在开发和测试中应用程序启动时由其创建和迁移。您的迁移不会创建其表（参见 [Keep messages in your database](/reliability/outbox#keep-messages-in-your-database)）。

控制器：

```typescript title="src/payments/payment-webhooks.controller.ts"
import { Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import { InjectDrizzle } from '@nestjs/drizzle';
import { ApiSecurity } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { IncomingWebhook, VerifyWebhook } from '@nestjs/webhooks';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { z } from 'zod';
import { OrdersService } from '../orders/orders.service.js';
import type { PaymentEvent } from './payment.js';

const orderId = z.uuid();

// The signature authenticates the provider, not a token. And a provider
// delivers in bursts, from a few addresses: the per-IP limit would refuse them.
@Public()
@ApiSecurity({})
@SkipThrottle()
@Controller('webhooks/payments')
export class PaymentWebhooksController {
  private readonly logger = new Logger(PaymentWebhooksController.name);

  constructor(
    @InjectDrizzle() private readonly db: NodePgDatabase,
    private readonly ordersService: OrdersService,
  ) {}

  @Post()
  @HttpCode(200)
  @VerifyWebhook('payments')
  async receive(@IncomingWebhook() webhook: IncomingWebhook<PaymentEvent>) {
    const { type, data: payment } = webhook.payload;
    if (!orderId.safeParse(payment.reference).success) {
      // Not a payment this shop created: answered 200, so the provider doesn't retry it.
      this.logger.warn(`Ignoring ${type} for ${payment.id}: its reference isn't an order id`);
      return;
    }
    // The event's id is recorded in the inbox in the same transaction as the order's
    // new status: a redelivery, even one racing this request, changes nothing.
    await this.db.transaction(async (tx) =>
      webhook.processInTransaction(tx, () => {
        switch (type) {
          case 'payment.succeeded':
            return this.ordersService.markPaid(tx, payment);
          case 'payment.failed':
            return this.ordersService.cancelUnpaid(tx, payment.reference);
          default:
            // Other types are recorded, and change nothing.
            return undefined;
        }
      }),
    );
  }
}

```

- **`@VerifyWebhook('payments')`** 在处理程序之前运行。签名不匹配密钥的请求将收到一个 `401`，处理程序永远不会运行。响应不说明错误是什么：伪造者从中一无所知。
- **`@Public()` 和 `@SkipThrottle()`**。JWT 教程的全局守卫会向提供者请求令牌，其按 IP 的限制会拒绝突发投递。签名即是认证。
- **`processInTransaction()`** 是按事件 ID 的去重。它通过 `tx` 在收件箱中记录 Webhook 的 ID，然后仅在 ID 为新时才运行回调。记录和订单的更改一起提交或一起回滚。重投递，即使在第一个实例仍在运行时到达另一个实例，也会找到 ID 且不更改任何内容；控制器仍然回答 `200`，因此提供者停止重试。
- **`@HttpCode(200)`** 提供者会重试除 `2xx` 之外的任何内容，持续数天。抛出异常的处理程序会回滚事务、记录，并且提供者的重试会获得另一次机会。
- **非订单相关的事件也会被响应**。付款的 `reference` 不是订单 ID（例如同一提供者账户上的另一个应用程序）时，会被记录并回答 `200`；如果传递下去，它将与 `500` 的 `uuid` 比较失败，并重试数天。开关不认识的事件类型会被记录，且不更改任何内容。

#### 精确一次标记订单已付款

收件箱会捕获同一事件的重投递。它无法捕获关于同一订单的两个不同事件：在客户取消后到达的 `payment.succeeded`、在成功后到达的早期尝试的 `payment.failed`，以及提供者对同一付款发送的第二个事件。因此，订单的更改也是一个条件更新，就像电子商务教程中的每个状态更改一样。在 `OrdersService` 中，`cancel()` 和 `ship()` 发生更改，`markPaid()`、`cancelUnpaid()`、`cancelPlaced()` 和 `explainUnpaid()` 是新的，而 `refuse()` 的 409 现在命名任何状态，如 `Order is placed` 所示；`checkout()`、`findMine()`、`findOne()` 和 `items()` 保持不变：

```typescript title="src/orders/orders.service.ts"
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { Outbox } from '@nestjs/outbox';
import { and, asc, desc, eq, gte, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Transaction } from '../database/drizzle.js';
import { cartItems, orderItems, orders, products, type Order, type OrderItem } from '../database/schema.js';
import type { Payment } from '../payments/payment.js';

export type OrderWithItems = Order & { items: Omit<OrderItem, 'orderId'>[] };

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectDrizzle() private readonly db: NodePgDatabase,
    private readonly outbox: Outbox<Transaction>,
  ) {}

  // ...

  /** The owner cancels an order that isn't paid yet, and its stock goes back. */
  cancel(userId: string, id: string): Promise<Order> {
    return this.db.transaction(async (tx) => {
      const order = await this.cancelPlaced(tx, and(eq(orders.id, id), eq(orders.userId, userId)));
      return order ?? this.refuse(tx, id, userId);
    });
  }

  /** The provider confirmed the payment. Runs in the webhook's transaction. */
  async markPaid(tx: Transaction, payment: Payment): Promise<Order | undefined> {
    // Conditional: only a placed order, for the amount it totals, becomes paid.
    // A replayed event, or one for a cancelled order, changes nothing.
    const [order] = await tx
      .update(orders)
      .set({ status: 'paid', paymentId: payment.id })
      .where(and(eq(orders.id, payment.reference), eq(orders.status, 'placed'), eq(orders.total, payment.amount)))
      .returning();
    if (!order) {
      await this.explainUnpaid(tx, payment);
      return undefined;
    }
    // Commits with the new status, or not at all: nothing hears of a payment that rolled back.
    await this.outbox.add(tx, {
      topic: 'order.paid',
      key: order.id,
      payload: { orderId: order.id, userId: order.userId, total: order.total, paymentId: payment.id },
    });
    return order;
  }

  /** The provider says the payment failed: the order is cancelled and its stock goes back. */
  cancelUnpaid(tx: Transaction, orderId: string): Promise<Order | undefined> {
    return this.cancelPlaced(tx, eq(orders.id, orderId));
  }

  /** Staff ship a paid order. */
  async ship(id: string): Promise<Order> {
    const [order] = await this.db
      .update(orders)
      .set({ status: 'shipped' })
      .where(and(eq(orders.id, id), eq(orders.status, 'paid')))
      .returning();
    return order ?? this.refuse(this.db, id);
  }

  /** Cancels the order if it's still placed, and puts its stock back, in the caller's transaction. */
  private async cancelPlaced(tx: Transaction, where: SQL | undefined): Promise<Order | undefined> {
    // Conditional: of a cancel and a payment racing for the same order, one wins.
    const [order] = await tx
      .update(orders)
      .set({ status: 'cancelled' })
      .where(and(where, eq(orders.status, 'placed')))
      .returning();
    if (!order) {
      return undefined;
    }
    for (const { productId, quantity } of await this.items(tx, order.id)) {
      await tx
        .update(products)
        .set({ stock: sql`${products.stock} + ${quantity}` })
        .where(eq(products.id, productId));
    }
    return order;
  }

  /** Logs why a payment changed nothing, unless it's a second event for the same payment. */
  private async explainUnpaid(tx: Transaction, payment: Payment): Promise<void> {
    const [order] = await tx
      .select({ status: orders.status, total: orders.total, paymentId: orders.paymentId })
      .from(orders)
      .where(eq(orders.id, payment.reference));
    if (order?.paymentId === payment.id) {
      return;
    }
    // A payment for a cancelled order, or for the wrong amount: the money has to go back.
    this.logger.warn(
      `Payment ${payment.id} of ${payment.amount} for order ${payment.reference} changed nothing ` +
        `(order ${order ? `${order.status}, total ${order.total}` : 'not found'}): refund it`,
    );
  }

  // ...

  /** Why a conditional update changed nothing: 404 if the order isn't there (or isn't theirs), 409 otherwise. */
  private async refuse(db: Pick<NodePgDatabase, 'select'>, id: string, userId?: string): Promise<never> {
    const [order] = await db
      .select({ status: orders.status })
      .from(orders)
      .where(and(eq(orders.id, id), userId ? eq(orders.userId, userId) : undefined));
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    throw new ConflictException(`Order is ${order.status}`);
  }
}

```

- **`markPaid()` 是一个 `UPDATE`**，其 `WHERE` 子句要求订单处于 `placed` 状态且付款金额为其总额。已取消的订单保持取消状态，已付款的订单保持已付款状态，错误的金额付款不产生任何效果。在它之前没有读取操作，因此在检查和写入之间没有窗口允许取消插入。
- **客户的取消和提供者的付款在同一行上竞争**，两者都以 `placed` 为条件。PostgreSQL 为第一个 `UPDATE` 锁定该行；第二个等待，然后发现订单不再处于 `placed` 状态，不更改任何内容。只有一个获胜，并且只有在取消发生时库存才会恢复。
- **不更改任何内容的付款不是错误**。处理程序正常返回，事件被记录，提供者收到其 `200`。一个 `409` 会导致提供者重试一个永远不会适用的事件数天。不过资金确实移动了：`explainUnpaid()` 记录警告以退款，除非该订单已通过本次付款支付。
- **`payment.failed` 使用电子商务教程的取消逻辑取消订单**，该逻辑现位于 `cancelPlaced()`，客户取消和 Webhook 都在其自己的事务中运行：只有在订单处于 `placed` 时才取消，并且其库存在同一事务中恢复。自结账以来客户的购物车已消失，因此他们再次结账以重试。
- **客户只取消未付款的订单**。取消已付款的订单意味着通过提供者进行退款，本教程未涉及。此外，工作人员现在只发货 `paid` 订单：发货 `placed` 订单是 409，`Order is placed`。

#### 提交后宣布已付款订单

商店的其他部分会响应付款：确认电子邮件、仓库、会计。从 Webhook 的处理程序发送这些消息存在 [outbox chapter](/reliability/outbox) 所描述的问题：在提交前发送，它们宣布的付款其事务可能仍会回滚；在提交后发送，在进程中断时会丢失。`markPaid()` 通过 `tx` 向出库中添加了 `order.paid` 消息，因此该消息与订单的新状态一起提交，并且中继在提交后，带有重试，交付它。其处理程序，确认电子邮件的替代品：

```typescript title="src/orders/order-paid.handler.ts"
import { Injectable, Logger } from '@nestjs/common';
import { OnOutboxMessage } from '@nestjs/outbox';

export interface OrderPaid {
  orderId: string;
  userId: string;
  total: number;
  paymentId: string;
}

/** Runs after the payment's transaction commits: a stand-in for the confirmation email. */
@Injectable()
export class OrderPaidHandler {
  private readonly logger = new Logger(OrderPaidHandler.name);

  // The consumer's inbox skips a message it has already handled.
  @OnOutboxMessage('order.paid', { consumer: 'order-paid-confirmation' })
  confirm({ orderId, total }: OrderPaid) {
    this.logger.log(`Order ${orderId} paid (${total} cents): sending the confirmation`);
  }
}

```

其 `consumer` 有自己的收件箱，因此中继两次交付的消息只被处理一次（参见 [Handle order.placed in-process](/reliability/outbox#handle-orderplaced-in-process)）。处理程序在提供者上发现，所以 `OrdersModule` 注册它，并为 payments 模块导出 `OrdersService`：

```typescript title="src/orders/orders.module.ts"
import { Module } from '@nestjs/common';
import { OrderPaidHandler } from './order-paid.handler.js';
import { OrderPolicy } from './order.policy.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, OrderPolicy, OrderPaidHandler],
  exports: [OrdersService],
})
export class OrdersModule {}

```

#### 试用

假的提供者是一个脚本，`scripts/fake-payments-provider.ts`。它按幂等性键创建付款，将它们保存在内存中，并播放提供者的付款页面：向付款的 `checkoutUrl` 发送一个 `POST` 是客户付款，而 `?outcome=failed` 是卡被拒绝。然后它以 Standard Webhooks 指定的方式签署事件，使用相同的密钥，并将其发布到商店。它还可以再次交付一个事件，使用相同的 id，就像提供者在未及时收到 `2xx` 时所做的那样：

```typescript title="scripts/fake-payments-provider.ts"
/**
 * A stand-in for the payment provider, for trying the shop on your machine. It is not a
 * provider: it charges nothing, and it keeps its payments in memory.
 *
 *   POST /v1/payments                          creates a payment, once per Idempotency-Key
 *   POST /checkout/:paymentId?outcome=failed   the customer pays (or the card is declined)
 *   POST /events/:eventId/resend               delivers an event again, with the same id
 *
 * Its webhooks are signed the way Standard Webhooks specifies, with PAYMENTS_WEBHOOK_SECRET,
 * and posted to WEBHOOK_URL (default http://localhost:3000/webhooks/payments).
 */
import { createHmac, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

const port = Number(process.env.PROVIDER_PORT ?? 4000);
const webhookUrl = process.env.WEBHOOK_URL ?? 'http://localhost:3000/webhooks/payments';
const secret = process.env.PAYMENTS_WEBHOOK_SECRET ?? '';
if (!secret.startsWith('whsec_')) {
  throw new Error('Set PAYMENTS_WEBHOOK_SECRET to the secret the shop was started with');
}
// The key is the base64 after the whsec_ prefix.
const key = Buffer.from(secret.slice('whsec_'.length), 'base64');

const payments = new Map<string, Record<string, unknown>>(); // by idempotency key
const events = new Map<string, string>(); // event id to body

/** Signs and posts an event, as the provider would: HMAC-SHA256 of `id.timestamp.body`. */
async function deliver(id: string, body: string): Promise<number> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'webhook-id': id,
      'webhook-timestamp': String(timestamp),
      'webhook-signature': `v1,${signature}`,
    },
    body,
  });
  return response.status;
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<[number, unknown]> {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  const [, first, id, action] = url.pathname.split('/');

  if (req.method === 'POST' && url.pathname === '/v1/payments') {
    const idempotencyKey = req.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || !req.headers.authorization?.startsWith('Bearer ')) {
      return [400, { error: 'An API key and an Idempotency-Key are required' }];
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    // The same key returns the payment it created the first time.
    if (!payments.has(idempotencyKey)) {
      const paymentId = `pay_${randomUUID().slice(0, 8)}`;
      const checkoutUrl = `http://localhost:${port}/checkout/${paymentId}`;
      payments.set(idempotencyKey, { id: paymentId, ...JSON.parse(body), status: 'requires_payment', checkoutUrl });
    }
    return [200, payments.get(idempotencyKey)];
  }

  if (req.method === 'POST' && first === 'checkout') {
    const payment = [...payments.values()].find((p) => p.id === id);
    if (!payment) {
      return [404, { error: 'No such payment' }];
    }
    payment.status = url.searchParams.get('outcome') === 'failed' ? 'failed' : 'succeeded';
    const eventId = `evt_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
    const body = JSON.stringify({ type: `payment.${payment.status}`, timestamp: new Date().toISOString(), data: payment });
    events.set(eventId, body);
    return [200, { event: eventId, type: `payment.${payment.status}`, delivered: await deliver(eventId, body) }];
  }

  if (req.method === 'POST' && first === 'events' && action === 'resend') {
    const body = events.get(id);
    return body ? [200, { event: id, delivered: await deliver(id, body) }] : [404, { error: 'No such event' }];
  }
  return [404, { error: 'Not found' }];
}

createServer((req, res) => {
  handle(req, res).then(
    ([status, body]) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body)),
    (error) => res.writeHead(500).end(String(error)),
  );
}).listen(port, () => console.log(`Fake payment provider on http://localhost:${port}`));

```

Node.js 直接运行 TypeScript 文件（22.18 或更高版本）。`--env-file` 向其提供商店的密钥。该脚本位于 `src/` 之外，所以 `nest build` 将其排除在外：

```bash
$ node --env-file=.env scripts/fake-payments-provider.ts
Fake payment provider on http://localhost:4000

```

在另一个终端中启动商店，使用 `npm run start`。在启动时，出库的存储创建其模式：

```bash
LOG [OutboxModule] OutboxStorage: PostgresOutboxStore
LOG [OutboxModule] PostgresOutboxStore: migrated schema "nest_outbox" to version 1.

```

与电子商务教程中一样，以 Ada 和 Sam（Sam 是工作人员）的身份登录，将键盘添加到目录，然后结账两个（此处和下方缩短了令牌和主体）：

```bash
$ curl localhost:3000/auth/sign-up --json '{"email":"ada@example.com","password":"correct horse battery"}'
{"accessToken":"eyJhbGciOiJIUzI1NiIs...","refreshToken":"...","expiresIn":900}
$ ADA="Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
$ SAM="Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
$ curl localhost:3000/products -H "$SAM" --json '{"name":"Mechanical keyboard","description":"Hot-swappable switches","price":12900,"stock":5}'
{"id":"dd947855-c8cd-4321-bec7-eb66d8f5f9c2","name":"Mechanical keyboard",...,"stock":5,...}
$ curl -X PUT localhost:3000/cart/items/dd947855-c8cd-4321-bec7-eb66d8f5f9c2 -H "$ADA" --json '{"quantity":2}'
$ curl -X POST localhost:3000/orders -H "$ADA"
{"id":"2145ea60-1156-47f1-b304-ffaa33582c34","userId":"884ebd52-aec8-4eec-b7db-6a3bb7623f36","status":"placed","total":25800,"paymentId":null,"createdAt":"2026-11-19T22:38:15.908Z","items":[...]}

```

请求付款。第二次调用，例如超时后的重试，会获得相同的付款，因为提供者获得了相同的幂等性键。由于尚未付款，工作人员尚不能发货：

```bash
$ curl -X POST localhost:3000/orders/2145ea60-1156-47f1-b304-ffaa33582c34/payment -H "$ADA"
{"paymentId":"pay_27a152e7","checkoutUrl":"http://localhost:4000/checkout/pay_27a152e7"}
$ curl -X POST localhost:3000/orders/2145ea60-1156-47f1-b304-ffaa33582c34/payment -H "$ADA"
{"paymentId":"pay_27a152e7","checkoutUrl":"http://localhost:4000/checkout/pay_27a152e7"}
$ curl -X POST localhost:3000/orders/2145ea60-1156-47f1-b304-ffaa33582c34/ship -H "$SAM"
{"message":"Order is placed","error":"Conflict","statusCode":409}

```

客户在提供者的页面上付款。假的提供者以它发送的事件和商店回复的状态进行回答。订单已付款，因此工作人员可以发货，并且确认在提交后发出：

```bash
$ curl -X POST localhost:4000/checkout/pay_27a152e7
{"event":"evt_a194bac0079a448a","type":"payment.succeeded","delivered":200}
$ curl localhost:3000/orders/2145ea60-1156-47f1-b304-ffaa33582c34 -H "$ADA"
{"id":"2145ea60-1156-47f1-b304-ffaa33582c34",...,"status":"paid","total":25800,"paymentId":"pay_27a152e7",...}
$ curl -X POST localhost:3000/orders/2145ea60-1156-47f1-b304-ffaa33582c34/ship -H "$SAM"
{"id":"2145ea60-1156-47f1-b304-ffaa33582c34",...,"status":"shipped","total":25800,"paymentId":"pay_27a152e7",...}

```

应用程序的日志显示确认已发出：

```bash
LOG [OrderPaidHandler] Order 2145ea60-1156-47f1-b304-ffaa33582c34 paid (25800 cents): sending the confirmation

```

提供者再次交付事件：商店回复 `200`，没有变化。使用任何非密钥签名的请求都是一个 `401`：

```bash
$ curl -X POST localhost:4000/events/evt_a194bac0079a448a/resend
{"event":"evt_a194bac0079a448a","delivered":200}
$ curl localhost:3000/orders/2145ea60-1156-47f1-b304-ffaa33582c34 -H "$ADA"
{"id":"2145ea60-1156-47f1-b304-ffaa33582c34",...,"status":"shipped",...}
$ curl -i localhost:3000/webhooks/payments -H 'webhook-id: evt_forged' -H "webhook-timestamp: $(date +%s)" -H 'webhook-signature: v1,Zm9yZ2Vk' \
    --json '{"type":"payment.succeeded","timestamp":"2026-11-19T22:30:00.000Z","data":{"id":"pay_forged","amount":25800,...}}'
HTTP/1.1 401 Unauthorized
{"message":"Webhook signature verification failed","error":"Unauthorized","statusCode":401}

```

被拒绝的卡取消了订单并恢复了库存：第一个订单后剩下三个键盘，第二个订单使用了一个，拒绝操作将其返回。如果客户随后在提供者的页面上再次尝试并且付款成功，延迟的 `payment.succeeded` 不会将订单恢复，商店会记录其应退的退款：

```bash
$ curl -X PUT localhost:3000/cart/items/dd947855-c8cd-4321-bec7-eb66d8f5f9c2 -H "$ADA" --json '{"quantity":1}'
$ curl -X POST localhost:3000/orders -H "$ADA"
{"id":"20b90e94-af9e-4d41-8bca-e3449dc13deb",...,"status":"placed","total":12900,...}
$ curl -X POST localhost:3000/orders/20b90e94-af9e-4d41-8bca-e3449dc13deb/payment -H "$ADA"
{"paymentId":"pay_07c5a5e9","checkoutUrl":"http://localhost:4000/checkout/pay_07c5a5e9"}
$ curl -X POST "localhost:4000/checkout/pay_07c5a5e9?outcome=failed"
{"event":"evt_464c1af968bd4fc8","type":"payment.failed","delivered":200}
$ curl localhost:3000/orders/20b90e94-af9e-4d41-8bca-e3449dc13deb -H "$ADA"
{"id":"20b90e94-af9e-4d41-8bca-e3449dc13deb",...,"status":"cancelled","total":12900,"paymentId":null,...}
$ curl localhost:3000/products/dd947855-c8cd-4321-bec7-eb66d8f5f9c2
{"id":"dd947855-c8cd-4321-bec7-eb66d8f5f9c2","name":"Mechanical keyboard",...,"stock":3,...}
$ curl -X POST localhost:4000/checkout/pay_07c5a5e9
{"event":"evt_95f96f70f1e1419c","type":"payment.succeeded","delivered":200}
$ curl localhost:3000/orders/20b90e94-af9e-4d41-8bca-e3449dc13deb -H "$ADA"
{"id":"20b90e94-af9e-4d41-8bca-e3449dc13deb",...,"status":"cancelled","total":12900,"paymentId":null,...}

```

日志标记了延迟成功以进行退款，订单保持已取消：

```bash
WARN [OrdersService] Payment pay_07c5a5e9 of 12900 for order 20b90e94-af9e-4d41-8bca-e3449dc13deb changed nothing (order cancelled, total 12900): refund it

```

停止假的提供者，当客户端的三次尝试失败后，请求付款会获得一个 `502`，原因在日志中，而不是在响应中：

```bash
$ curl -X PUT localhost:3000/cart/items/dd947855-c8cd-4321-bec7-eb66d8f5f9c2 -H "$ADA" --json '{"quantity":1}'
$ curl -X POST localhost:3000/orders -H "$ADA"
{"id":"f43ba16e-fd3e-4f4e-ba12-bcff19c3c3bb",...,"status":"placed","total":12900,...}
$ curl -X POST localhost:3000/orders/f43ba16e-fd3e-4f4e-ba12-bcff19c3c3bb/payment -H "$ADA"
{"message":"Bad Gateway","statusCode":502}

```

日志中有客户端放弃的原因：

```bash
ERROR [HttpClient] POST http://localhost:4000/v1/payments failed: ECONNREFUSED; answering 502 Bad Gateway

```

#### 测试它

测试模拟提供者：它们使用 `@nestjs/webhooks/testing` 中的 `signWebhook()` 对每个 Webhook 进行签名，这会产生 Standard Webhooks 发送者会产生的主体和标头，使用应用程序拥有的密钥。提供者的 API 是一个存根 `fetch`，因此测试检查商店发送给它的内容，并且商店永远不会到达网络。与电子商务教程中一样，它们通过连接池针对真实的 PostgreSQL 服务器运行，因为事件的两个副本和客户的取消只在那里真正竞争。将 payments 设置添加到测试运行的环境中：

```typescript title="vitest.config.e2e.ts"
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    env: {
      DATABASE_URL: 'postgres://unused-in-tests',
      JWT_SECRET: 'test-only-jwt-secret-of-at-least-32-bytes',
      // Never called: the tests stub fetch.
      PAYMENTS_API_URL: 'https://payments.invalid',
      PAYMENTS_API_KEY: 'test-only-key',
      PAYMENTS_WEBHOOK_SECRET: 'whsec_dGVzdC1vbmx5LXdlYmhvb2stc2VjcmV0LTMyLWJ5dGVz',
      // The tests run the outbox relay themselves.
      OUTBOX_RELAY: 'off',
    },
  },
});

```

测试涵盖了幂等性键、提供者宕机、签名和伪造的 Webhook、两个实例上的重复、错误的金额以及付款与取消的竞争：

```typescript title="test/payments.e2e-spec.ts"
import { fileURLToPath } from 'node:url';
import { PasswordHasher } from '@nestjs/authentication';
import { getDrizzleToken } from '@nestjs/drizzle';
import { OutboxRelay } from '@nestjs/outbox';
import { NodeAdapter, type NestNodeApplication } from '@nestjs/platform-node';
import { Test } from '@nestjs/testing';
import { signWebhook } from '@nestjs/webhooks/testing';
import { eq, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module.js';
import { orders, products, users } from '../src/database/schema.js';
import { OrderPaidHandler } from '../src/orders/order-paid.handler.js';
import { OrdersService } from '../src/orders/orders.service.js';
import type { PaymentEvent } from '../src/payments/payment.js';

// A real PostgreSQL with a pool, so a redelivery and a cancel really race.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('Payments (e2e)', () => {
  const db = drizzle({ client: new Pool({ connectionString: url, max: 20 }) });
  // The provider's API: every call the shop makes to it lands here.
  const fetch = vi.fn<typeof globalThis.fetch>();
  let app: NestNodeApplication;
  let other: NestNodeApplication; // a second instance of the API, on a pool of its own
  let relay: OutboxRelay;

  async function createApp(database: NodePgDatabase) {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDrizzleToken())
      .useValue(database) // the outbox's store runs on it too
      .overrideProvider(PasswordHasher)
      .useValue(new PasswordHasher({ logN: 10 }))
      .compile();
    return moduleRef.createNestApplication<NestNodeApplication>(new NodeAdapter(), { rawBody: true }).init();
  }

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
    await db.execute(sql`TRUNCATE users, products, refresh_tokens CASCADE`);
    vi.stubGlobal('fetch', fetch);
    app = await createApp(db);
    other = await createApp(drizzle({ client: new Pool({ connectionString: url, max: 10 }) }));
    relay = app.get(OutboxRelay);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await other.close();
    await app.close(); // closes the pools too
  });

  let clients = 0;

  async function signUp(email: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email, password: 'correct horse battery' },
      remoteAddress: `10.0.1.${++clients}`,
    });
    return { authorization: `Bearer ${res.json<{ accessToken: string }>().accessToken}` };
  }

  /** A placed order for 2 of a product with 5 in stock. */
  async function placeOrder() {
    const [product] = await db.insert(products).values({ name: 'Keycaps', description: '', price: 9900, stock: 5 }).returning();
    const headers = await signUp(`buyer-${crypto.randomUUID()}@example.com`);
    await app.inject({ method: 'PUT', url: `/cart/items/${product.id}`, headers, payload: { quantity: 2 } });
    const order = (await app.inject({ method: 'POST', url: '/orders', headers })).json<{ id: string; total: number }>();
    return { ...order, productId: product.id, headers };
  }

  /** The request the provider sends: Standard Webhooks, signed with the shared secret. */
  function event(type: PaymentEvent['type'], order: { id: string; total: number }, secret = process.env.PAYMENTS_WEBHOOK_SECRET!) {
    const data = {
      id: `pay_${order.id.slice(0, 8)}`,
      amount: order.total,
      currency: 'usd',
      reference: order.id,
      status: type === 'payment.succeeded' ? 'succeeded' : 'failed',
      checkoutUrl: 'https://payments.invalid/checkout',
    };
    return signWebhook({ scheme: 'standard', secret, payload: { type, timestamp: new Date().toISOString(), data } });
  }

  const deliver = ({ headers, body }: { headers: Record<string, string>; body: string }, to = app) =>
    to.inject({ method: 'POST', url: '/webhooks/payments', headers, payload: body });

  const statusOf = async (id: string) =>
    (await db.select({ status: orders.status }).from(orders).where(eq(orders.id, id)))[0].status;
  const stockOf = async (id: string) =>
    (await db.select({ stock: products.stock }).from(products).where(eq(products.id, id)))[0].stock;

  it('creates the payment with the order id as the idempotency key, retries included', async () => {
    const order = await placeOrder();
    const payment = { id: 'pay_1', checkoutUrl: 'https://payments.invalid/checkout/pay_1' };
    fetch
      .mockReset()
      .mockResolvedValueOnce(new Response(null, { status: 503 })) // the provider hiccups: retried
      .mockResolvedValueOnce(Response.json(payment))
      .mockResolvedValueOnce(Response.json(payment));

    const first = await app.inject({ method: 'POST', url: `/orders/${order.id}/payment`, headers: order.headers });
    const second = await app.inject({ method: 'POST', url: `/orders/${order.id}/payment`, headers: order.headers });

    expect(first.json()).toEqual({ paymentId: 'pay_1', checkoutUrl: payment.checkoutUrl });
    expect(second.json()).toEqual(first.json());
    expect(fetch).toHaveBeenCalledTimes(3);
    for (const [input, init] of fetch.mock.calls) {
      expect(String(input)).toBe('https://payments.invalid/v1/payments');
      expect(new Headers(init?.headers).get('idempotency-key')).toBe(order.id);
      expect(JSON.parse(String(init?.body))).toEqual({ amount: order.total, currency: 'usd', reference: order.id });
    }
  });

  it('answers 502 when the provider is down', async () => {
    const order = await placeOrder();
    fetch.mockReset().mockRejectedValue(new TypeError('fetch failed'));

    const res = await app.inject({ method: 'POST', url: `/orders/${order.id}/payment`, headers: order.headers });

    expect(res.statusCode).toBe(502);
  });

  it('marks the order paid when a signed payment.succeeded arrives', async () => {
    const order = await placeOrder();
    const confirm = vi.spyOn(app.get(OrderPaidHandler), 'confirm');

    const res = await deliver(event('payment.succeeded', order));

    expect(res.statusCode).toBe(200);
    expect(await statusOf(order.id)).toBe('paid');
    await relay.runOnce(); // order.paid goes out after the commit
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ orderId: order.id }), expect.anything());
  });

  it('rejects a webhook that the provider did not sign', async () => {
    const order = await placeOrder();

    const res = await deliver(event('payment.succeeded', order, 'whsec_c29tZW9uZS1lbHNlcy1zZWNyZXQtb2YtMzItYnl0ZXM='));

    expect(res.statusCode).toBe(401);
    expect(await statusOf(order.id)).toBe('placed');
  });

  it('processes an event once, even when two instances receive it at the same time', async () => {
    const order = await placeOrder();
    const confirm = vi.spyOn(app.get(OrderPaidHandler), 'confirm').mockClear();
    const markPaid = [app, other].map((instance) => vi.spyOn(instance.get(OrdersService), 'markPaid'));
    const paid = event('payment.succeeded', order);

    const results = await Promise.all([deliver(paid, app), deliver(paid, other)]);

    expect(results.map((res) => res.statusCode)).toEqual([200, 200]);
    expect(await statusOf(order.id)).toBe('paid');
    // The inbox record, in the order's transaction, stopped the other copy.
    expect(markPaid[0].mock.calls.length + markPaid[1].mock.calls.length).toBe(1);
    await relay.runOnce();
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('pays nothing for the wrong amount, or for a payment that is not for an order', async () => {
    const order = await placeOrder();

    const wrongAmount = await deliver(event('payment.succeeded', { ...order, total: order.total - 1 }));
    const notAnOrder = await deliver(event('payment.succeeded', { ...order, id: 'invoice-2041' }));

    expect([wrongAmount.statusCode, notAnOrder.statusCode]).toEqual([200, 200]);
    expect(await statusOf(order.id)).toBe('placed');
  });

  it('never brings a cancelled order back', async () => {
    const order = await placeOrder();
    await app.inject({ method: 'POST', url: `/orders/${order.id}/cancel`, headers: order.headers });

    const res = await deliver(event('payment.succeeded', order));

    expect(res.statusCode).toBe(200); // a retry couldn't change anything: no point in one
    expect(await statusOf(order.id)).toBe('cancelled');
    expect(await stockOf(order.productId)).toBe(5);
  });

  it('cancels the order and puts its stock back when the payment fails', async () => {
    const order = await placeOrder();
    expect(await stockOf(order.productId)).toBe(3);

    await deliver(event('payment.failed', order));

    expect(await statusOf(order.id)).toBe('cancelled');
    expect(await stockOf(order.productId)).toBe(5);
  });

  it('lets a payment or a cancel win, never both', async () => {
    const order = await placeOrder();

    await Promise.all([
      deliver(event('payment.succeeded', order)),
      app.inject({ method: 'POST', url: `/orders/${order.id}/cancel`, headers: order.headers }),
    ]);

    const status = await statusOf(order.id);
    expect(['paid', 'cancelled']).toContain(status);
    expect(await stockOf(order.productId)).toBe(status === 'paid' ? 3 : 5);
  });
});

```

- **每个事件都有一个新的 id。** `signWebhook()` 为每次调用生成一个。收件箱存储在 `nest_outbox` 中，该存储 `TRUNCATE` 商店的表不会清空，因此固定 id 在第一次运行时会通过，但在后续每次运行时都会被跳过为重复项。
- **401 来自签名检查。** 使用正确密钥的相同请求在测试中会获得一个 `200`，因此路由不是因为缺少令牌而被拒绝的。
- **当测试指示时中继运行。** 使用 `OUTBOX_RELAY=off`，`relay.runOnce()` 交付已提交的 `order.paid` 消息，并且间谍会计算处理程序的调用次数。
- **API 的两个实例** 在同一时刻接收到相同的签名请求，每个都在自己的连接池上，就像负载均衡器后两个 Pod 一样。一个记录 id 并支付订单；另一个的收件箱插入等待该事务，然后找到 id，并且在所有情况下只运行一次 `markPaid()`。
- **提供者的 API 仅一次返回 503。** 客户端重试 `POST`，使用相同的幂等性键，客户获得付款：两次请求对提供者的三次调用，每次都使用订单的 id 作为其键。

使用电商教程中的，一个接一个地运行，因为它们会截断相同的表：

```bash
$ TEST_DATABASE_URL=postgres://postgres:shop@localhost:5432/shop_test npm run test:e2e -- --no-file-parallelism

 Test Files  3 passed (3)
      Tests  18 passed (18)

```

从 `markPaid()` 中移除 `eq(orders.status, 'placed')`，并且“绝不恢复已取消的订单”和“支付或取消获胜，绝不两者都获胜”的失败情况得以解决：延迟支付会复活已取消的订单，并且其库存仍被返回。直接调用 `markPaid()` 而不是通过 `processInTransaction()`，两个实例的测试失败：两个实例都会运行它。

#### 切换到真实提供者

本教程模拟的内容与真实提供者所做的更改：

- **API。** 将 `PaymentsClient.createPayment()` 替换为您提供者的创建支付调用（或其 SDK），并将订单的 id 作为其幂等性键。提供者会保留密钥一段时间，有些会拒绝使用不同参数重复使用的密钥：请检查您提供者的行为。在使用实时密钥之前，先在提供者的测试模式下使用其测试密钥运行。
- **Webhook。** 对于遵循标准 Webhook 的提供者，接收器保持不变：只有密钥、有效载荷类型及其事件名称发生变化。Stripe 使用其自己的方案进行签名，该模块使用 `scheme: 'stripe'` 验证，没有 `header`；然后事件的 id 就是有效载荷的 `id`（参见 [Receive the carrier's Stripe-like webhooks](/http/webhooks#receive-the-carriers-stripe-like-webhooks)）。在控制器中将提供者的事件映射到 `markPaid()` 和 `cancelUnpaid()`。
- **URL。** 在提供者的仪表板中注册 `https://<your API>/webhooks/payments`。在您的机器上，提供者的命令行工具或隧道会将其 Webhook 转发到 `localhost`。

#### 生产检查清单

电商教程中的 [checklist](/tutorials/ecommerce-backend#production-checklist) 中的所有内容都适用。特别是对于支付：

- **仅信任 Webhook。** 从提供者页面返回的浏览器证明了任何事情：任何人都可以打开该 URL。订单在签名的 `payment.succeeded` 到达时被支付，成功页面会读取订单状态。
- **保留 `rawBody: true`，并将密钥保存在您平台的密钥存储中。** 当提供者轮换密钥时，请将两者都提供给接收器，作为其 `secret` 选项中的数组：会尝试每一个。
- **退还未改变的。** 已取消订单的支付会使用 `refund it` 进行记录。对该警告进行警报，或者通过提供者的 API 从处理程序中退款，并以支付的 id 作为键。
- **过期未支付的订单。** 已下订单会保留其库存，直到支付或取消。从一个运行 `cancelUnpaid()` 的 [cron job](/techniques/task-scheduling#声明式-cron-任务) 中取消未支付的订单，每个订单运行一次，并在 [lock](/reliability/locks) 下运行，以确保只有一个实例运行。
- **在部署前应用 outbox 的迁移**，使用 `npx @nestjs/outbox migrate`，紧邻 `npx drizzle-kit migrate`。使用 `NODE_ENV=production`，存储在启动时不会迁移。
- **使用 cron 任务通过 `OutboxInbox.prune()` 清理收件箱**，时间窗口应长于提供者的重试计划（Stripe 重试三天）。在其 id 被清理后到达的重新投递会再次运行处理程序，只有条件更新会阻止它。
- **保持处理程序简短。** 提供者会等待答案并超时。任何缓慢的操作都应放在提交之后，outbox 处理程序中。
- **为生产环境提供独立的 Observe 密钥对**，从项目的 **API Keys** 页面获取，作为平台环境变量中的 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET`：`start:prod` 不会加载 `.env`。然后在您的跟踪中查看提供者：[NestJS Observe](/observability/overview) 记录每个请求及其跨度的跟踪，调用提供者 API 会显示为由发起调用的方法下的出站请求，因此缓慢的提供者会显示在 `POST /orders/:id/payment` 的跟踪中（参见 [Queries, outbound calls, and captured requests](/observability/dashboard#queries-outbound-calls-and-captured-requests)）。

#### 后续步骤

- 退还已支付的订单，并使用退款取消它们：在 `PaymentsClient` 中进行另一个调用，使用支付的 id 作为其幂等性键，并在控制器中有一个 `payment.refunded` 事件。
- 真正发送确认电子邮件，来自 `order.paid` 处理程序：[Mail](/application/mail)。
- 使用您自己的签名 Webhook 告知合作伙伴订单已支付：[Webhooks](/http/webhooks#send-ordershipped-and-ordercancelled-after-the-commit)。
- 使其他端点可以安全地使用幂等性键重试：[Idempotency keys](/reliability/idempotency)。
- 逐个请求监控生产环境中的支付流程：[Observability](/observability/overview)。