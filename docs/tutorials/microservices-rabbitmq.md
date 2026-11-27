<!-- 此文件从 content/tutorials/microservices-rabbitmq.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:56:05.688Z -->
<!-- 源文件: content/tutorials/microservices-rabbitmq.md -->
<!-- 源哈希: f2c515dbb401c5e7a1d92f22daec430d -->

### 使用 RabbitMQ 在 Node.js 中构建微服务

使用 NestJS 和 RabbitMQ 在 Node.js 和 TypeScript 中构建微服务：事件、请求-响应、重试、死信和无消息丢失。

该应用程序是一个小型在线商店，分为两个服务。**orders** 服务是一个 HTTP API，接收订单并将其保存在 PostgreSQL 中。**fulfillment** 服务是一个工作者，拥有自己的数据库：它为每个订单准备一个发货。服务通过 [RabbitMQ](https://www.rabbitmq.com/) 通信，通过 `@nestjs/microservices` 的 RabbitMQ **传输器**。发送一条消息是一个调用。关键在于围绕消息发生的事情：服务在消息处理过程中崩溃、消息每次都失败、消息重复到达、订单提交时 **网关** 宕机，以及服务无响应。

最终，这两个服务将：

- 存在于同一个 [Nest CLI monorepo](/cli/workspaces#monorepo-模式) 中，并从一个 [library](/cli/libraries) 中的 Zod **模式** 作为消息契约共享，由发送方和接收方进行 **验证**。
- 使用 [transactional outbox](/reliability/outbox) 发布一个 `order.placed` **事件** 来宣布每个订单：只有在订单已提交时才宣布，并且在未宣布时绝不提交，即使 RabbitMQ 宕机也是如此。
- 仅在每个 **事件** 被处理后才确认，因此崩溃或抛出异常的工作者不会丢失任何数据。
- 将失败的 **事件** 重试固定次数，然后将其移动到死信队列，同时立即将违反契约的消息移到那里。
- 确保每个 **事件** 只被处理一次，尽管 RabbitMQ 保证至少一次投递。
- 通过一个会超时的 **请求** 向 **fulfillment** 服务询问订单的发货状态，当没有响应时，向 HTTP **请求** 客户端返回 503。
- 在多个工作者实例之间共享 **事件**，并在实例关闭时完成正在处理的 **事件**。
- 在针对真实 RabbitMQ 和 PostgreSQL 的测试中证明所有这些功能。

**orders** 服务没有登录功能，以便本教程专注于服务之间的通信。如需添加此功能，请遵循 [Build a REST API with JWT authentication](/tutorials/rest-api-jwt-authentication#sign-users-in-with-jwts)，该教程的约定（Zod **验证**、启动时检查配置、安全头、**CORS**、OpenAPI、JSON 日志、**健康检查**）被两个服务遵循。

以下是 **orders** 服务的端点，以及添加每个端点的部分：

| 端点 | 部分 |
| --- | --- |
| `POST /orders`, `GET /orders/:id`, `GET /health/live`, `GET /health/ready`, `GET /docs` | [Build the orders API](/tutorials/microservices-rabbitmq#build-the-orders-api) |
| `GET /orders/:id/shipment` | [Ask another service with request-response](/tutorials/microservices-rabbitmq#ask-another-service-with-request-response) |

> info **提示** 完成的应用程序在 GitHub 上是 [nestjs/example-microservices-rabbitmq](https://github.com/nestjs/example-microservices-rabbitmq)，包含其测试和 CI 工作流。

以下是服务之间的消息：

| 消息 | 样式 | 队列 | 部分 |
| --- | --- | --- | --- |
| `order.placed` | **事件**，从 orders 到 fulfillment | `fulfillment.events` | [Publish events with the transactional outbox](/tutorials/microservices-rabbitmq#publish-events-with-the-transactional-outbox) |
| `shipment.find` | 请求-响应，从 orders 到 fulfillment | `fulfillment.requests` | [Ask another service with request-response](/tutorials/microservices-rabbitmq#ask-another-service-with-request-response) |

您需要 Node.js 22 或更高版本，以及 Docker 来运行 RabbitMQ 和 PostgreSQL。

#### 创建 **工作空间**

使用 [Nest CLI](/cli/overview) 创建一个项目，然后向其中添加第二个应用程序和一个 **库**。添加项目会将 **工作空间** 转换为 [monorepo mode](/cli/workspaces#monorepo-模式)：每个应用程序移动到 `apps/`，**库** 移动到 `libs/`，可以从两者中导入，如 `@app/contracts`：

```bash
$ npm i -g @nestjs/cli
$ nest new orders --directory shop
$ cd shop
$ nest generate app fulfillment
$ nest generate library contracts --prefix @app

```

`nest new` 在 **工作空间** 的 `package.json` 中安装 [NestJS Observe SDK](/observability/sdk) 和 `@nestjs/observe`，并将其连接到生成的 **orders** 应用程序。`nest generate app` 保留了依赖，但没有将 SDK 连接到它添加的应用程序。服务自身的以下文件将其连接到两者，每个都有自己的 `serviceId`，因此每个服务都报告其自己的名称。

两个服务都从 **工作空间** 的根目录构建和运行，使用其一个 `package.json` 的依赖。安装 [Node adapter](/techniques/performance#node-adapter) 和 JWT 教程的包，然后使用两个 RabbitMQ **传输器** 所需的包进行 `@nestjs/microservices`，最后执行 `@nestjs/outbox`。CLI 安装的 Express **增强器** 和 supertest 不需要：

```bash
$ npm uninstall @nestjs/platform-express @types/express supertest @types/supertest
$ npm i --save @nestjs/platform-node zod @nestjs/config @nestjs/drizzle drizzle-orm@rc pg @nestjs/swagger @nestjs/terminus
$ npm i --save @nestjs/microservices amqplib amqp-connection-manager @nestjs/outbox
$ npm i --save-dev drizzle-kit@rc @types/pg

```

CLI 在每个项目中生成了一个示例 **控制器**、**服务** 和测试。删除它们；本教程所需的所有文件如下所示：

```bash
$ rm -r apps/orders/src apps/orders/test apps/fulfillment/src apps/fulfillment/test libs/contracts/src

```

使用其管理 UI 运行 RabbitMQ 和 PostgreSQL。每个服务拥有自己的数据，因此每个都有自己的数据库，彼此不读取对方的表：

```bash
$ docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:4-management
$ docker run -d --name shop-db -e POSTGRES_PASSWORD=shop -p 5432:5432 postgres:17
$ docker exec shop-db psql -U postgres -c "CREATE DATABASE orders" -c "CREATE DATABASE fulfillment"

```

管理 UI 位于 `http://localhost:15672`，用户为 `guest`，密码为 `guest`。它显示了队列、队列中的消息以及每个队列的 **消费者**，这是了解后续部分功能的最快方法。

每个服务从自己的 `.env` 文件中读取其配置。**orders** 服务的配置文件是 `apps/orders/.env`：

```bash
DATABASE_URL=postgres://postgres:shop@localhost:5432/orders
RABBITMQ_URL=amqp://guest:guest@localhost:5672

```

**fulfillment** 服务的配置文件是 `apps/fulfillment/.env`，拥有自己的数据库：

```bash
DATABASE_URL=postgres://postgres:shop@localhost:5432/fulfillment
RABBITMQ_URL=amqp://guest:guest@localhost:5672

```

#### 共享消息契约

消息是两个独立部署的服务之间的 API，因此其结构需要像 HTTP 端点一样受到关注。契约存储在 **库** 中，作为 Zod **模式**：**orders** 服务在发送前检查每个 **事件** 是否符合这些 **模式**，而 **fulfillment** 服务检查它接收到的每条消息。

`order.placed` **事件** 和外置（outbox）包裹它的信封：

```typescript title="libs/contracts/src/orders.events.ts"
import { z } from 'zod';

export const ORDER_PLACED = 'order.placed';

const item = z.object({
  sku: z.string().trim().min(1).max(64),
  quantity: z.number().int().min(1).max(100),
});

export const orderPlacedSchema = z.object({
  orderId: z.uuid(),
  customerEmail: z.email(),
  shippingAddress: z.string().trim().min(1).max(500),
  items: z.array(item).min(1).max(50),
  placedAt: z.iso.datetime(),
});
export type OrderPlaced = z.infer<typeof orderPlacedSchema>;

/**
 * What the outbox relay publishes: the message's id, which stays the same
 * when the message is published again, and the event itself as the payload.
 */
export const outboxEnvelope = <T extends z.ZodType>(payload: T) =>
  z.object({
    id: z.string().min(1),
    topic: z.string(),
    key: z.string().nullable(),
    headers: z.record(z.string(), z.string()),
    createdAt: z.number(),
    payload,
  });

export const orderPlacedEnvelopeSchema = outboxEnvelope(orderPlacedSchema);
export type OrderPlacedEnvelope = z.infer<typeof orderPlacedEnvelopeSchema>;

```

发货的 **请求** 及其 **响应**：

```typescript title="libs/contracts/src/fulfillment.requests.ts"
import { z } from 'zod';

export const FIND_SHIPMENT = 'shipment.find';

export const findShipmentSchema = z.object({ orderId: z.uuid() });
export type FindShipment = z.infer<typeof findShipmentSchema>;

export const shipmentSchema = z.object({
  orderId: z.uuid(),
  status: z.enum(['preparing', 'shipped']),
  items: z.array(z.object({ sku: z.string(), quantity: z.number() })),
  createdAt: z.iso.datetime(),
});
export type Shipment = z.infer<typeof shipmentSchema>;

```

队列也是契约的一部分。RabbitMQ **传输器** 在两侧都声明其队列：**消费者** 在开始监听时，每个 **生产者** 在连接时都声明，因此在 **消费者** 运行之前发送的消息仍然有一个可以落入的队列。RabbitMQ 会拒绝选项与现有队列（`PRECONDITION_FAILED`）不同的声明（通道关闭），因此两侧都从此处获取它们：

```typescript title="libs/contracts/src/queues.ts"
import type { RmqOptions } from '@nestjs/microservices';

type QueueOptions = NonNullable<RmqOptions['options']>['queueOptions'];

/** How long the orders service waits for an answer from the fulfillment service. */
export const REQUEST_TIMEOUT_MS = 3_000;

export const FULFILLMENT_EVENTS_QUEUE = 'fulfillment.events';
export const FULFILLMENT_EVENTS_DEAD_LETTER_QUEUE = 'fulfillment.events.dead';

/**
 * The consumer and every producer declare the queue, with the same options:
 * RabbitMQ refuses a declaration that differs from the queue's.
 */
export const fulfillmentEventsQueueOptions: QueueOptions = {
  durable: true,
  arguments: {
    // Replicated across the cluster's nodes, and counts deliveries.
    'x-queue-type': 'quorum',
    // An event whose consumer dies before acknowledging it, 5 times over,
    // is dead-lettered: it's probably what kills the consumer.
    'x-delivery-limit': 5,
  },
  deadLetterExchange: '',
  deadLetterRoutingKey: FULFILLMENT_EVENTS_DEAD_LETTER_QUEUE,
};

export const FULFILLMENT_REQUESTS_QUEUE = 'fulfillment.requests';

export const fulfillmentRequestsQueueOptions: QueueOptions = {
  durable: true,
  // A request nobody took within the caller's timeout is dropped: the caller gave up.
  messageTtl: REQUEST_TIMEOUT_MS,
};

```

- **两个队列。** **事件** 和 **请求** 分别进入各自的队列。如果 **请求** 在 **事件** 队列中，它将等待前面所有 **事件**，并在订单激增后超时。
- **用于 **事件** 的仲裁队列。** 仲裁队列在 RabbitMQ 集群的节点之间复制，并且它们计数投递：在 `x-delivery-limit` 次重投递后，**网关** 会将消息死信化，而不是再次投递。RabbitMQ 4 在 **消费者** 在确认消息之前连接断开时计数投递，而不是在 **消费者** 重新排队消息时计数，因此该限制可以捕获每次都杀死其 **消费者** 的 **事件**。仅失败的 **事件** 的重试由工作者在 [Retry, then dead-letter](/tutorials/microservices-rabbitmq#retry-then-dead-letter) 中计数。
- **死信队列。** `deadLetterExchange: ''` 是默认交换机，按队列名称路由，因此 **网关** 的死信进入 `fulfillment.events.dead`，工作者也将自己的消息移到那里。
- **请求的生存时间。** 在队列中等待时间超过调用方超时限制的 **请求** 将无人响应，因此 **网关** 会将其丢弃。

库的入口文件导出了这三项：

```typescript title="libs/contracts/src/index.ts"
export * from './fulfillment.requests.js';
export * from './orders.events.js';
export * from './queues.js';

```

#### 构建订单 API

订单 **服务** 是类似于 JWT 教程的 HTTP API，在 Node **传输器** 上运行，其配置在启动时进行 **验证**。**网关** 的 URL 与数据库的 URL 连接起来：

```typescript title="apps/orders/src/config.ts"
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.url(),
  RABBITMQ_URL: z.url({ protocol: /^amqps?$/ }),
  // The browser origins allowed to call the API, comma-separated. None by default.
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean))
    .pipe(z.array(z.url())),
});

export type Env = z.infer<typeof envSchema>;

```

订单像事件携带它们一样，将其项目保留为 JSON：

```typescript title="apps/orders/src/database/schema.ts"
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export interface OrderItem {
  sku: string;
  quantity: number;
}

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerEmail: text('customer_email').notNull(),
  shippingAddress: text('shipping_address').notNull(),
  items: jsonb('items').$type<OrderItem[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type Order = typeof orders.$inferSelect;

```

每个 **服务** 都有自己的 `drizzle.config.ts` 和 **迁移** 文件夹。drizzle-kit 从 **工作空间** 的根目录运行，因此配置会加载 **服务** 自身的 `.env`：

```typescript title="apps/orders/drizzle.config.ts"
import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// Locally, the service's .env file; in CI and production, the environment.
if (existsSync('apps/orders/.env')) {
  process.loadEnvFile('apps/orders/.env');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './apps/orders/src/database/schema.ts',
  out: './apps/orders/drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});

```

生成第一个 **迁移** 并应用它（参见 [Migrations](https://docs.nestjs.com/data/drizzle#迁移)）：

```bash
$ npx drizzle-kit generate --config apps/orders/drizzle.config.ts --name=orders
$ npx drizzle-kit migrate --config apps/orders/drizzle.config.ts

```

**请求** 体是事件 **模式** 减去 **服务** 设置的字段，因此 API 不能接受事件会拒绝的订单：

```typescript title="apps/orders/src/orders/orders.schemas.ts"
import { orderPlacedSchema } from '@app/contracts';
import type { z } from 'zod';

// The request body is the event without the fields the service sets.
export const placeOrderSchema = orderPlacedSchema.pick({ customerEmail: true, shippingAddress: true, items: true });
export type PlaceOrderDto = z.infer<typeof placeOrderSchema>;

```

**控制器** 放置和读取订单：

```typescript title="apps/orders/src/orders/orders.controller.ts"
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { placeOrderSchema, type PlaceOrderDto } from './orders.schemas.js';
import { OrdersService } from './orders.service.js';

const orderId = { schema: z.uuid() };

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  place(@Body({ schema: placeOrderSchema }) dto: PlaceOrderDto) {
    return this.ordersService.place(dto);
  }

  @Get(':id')
  findOne(@Param('id', orderId) id: string) {
    return this.ordersService.findOne(id);
  }
}

```

订单 **模块** 将其注册到 **服务** 中，下一节会介绍：

```typescript title="apps/orders/src/orders/orders.module.ts"
import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}

```

**健康检查** 类似于 JWT 教程，但没有 **认证** **装饰器**。就绪检查数据库。它故意不检查 RabbitMQ：当 **网关** 宕机时，**服务** 仍会接收订单，如下节所示，因此将其从负载均衡器中移除只会将延迟发货变成订单失败：

```typescript title="apps/orders/src/health/database.health.ts"
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { HealthIndicatorService } from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @InjectDrizzle() private readonly db: NodePgDatabase,
  ) {}

  isHealthy(key: string) {
    return this.healthIndicatorService
      .check(key)
      .attempt(async () => {
        await this.db.execute(sql`select 1`);
      })
      .withTimeout('1s');
  }
}

```

**控制器** 暴露了存活和就绪状态：

```typescript title="apps/orders/src/health/health.controller.ts"
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './database.health.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
  ) {}

  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  // Not RabbitMQ: the transport reconnects by itself, and while the broker is
  // down, orders still commit, with their events kept in the outbox.
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([() => this.database.isHealthy('database')]);
  }
}

```

**健康检查** **模块** 导入了 Terminus：

```typescript title="apps/orders/src/health/health.module.ts"
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './database.health.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator],
})
export class HealthModule {}

```

`main.ts` 设置安全头，从 `CORS_ORIGINS` 获取 **CORS**，在生产环境中记录 JSON 日志和 OpenAPI 文档，如 JWT 教程所示（参见 [Set security headers and CORS](/tutorials/rest-api-jwt-authentication#set-security-headers-and-cors)）。它在应用选项中传入 `ObserveInstrument`，该选项由 [the next section](/tutorials/microservices-rabbitmq#publish-events-with-the-transactional-outbox) 的根 **模块** 导出，第三个参数带有 **传输器**：

```typescript title="apps/orders/src/main.ts"
import { ConsoleLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NodeAdapter, type NestNodeApplication } from '@nestjs/platform-node';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule, ObserveInstrument } from './app.module.js';
import type { Env } from './config.js';

const app = await NestFactory.create<NestNodeApplication>(AppModule, new NodeAdapter(), {
  instrument: ObserveInstrument,
  // One JSON object per line in production; readable text in development.
  logger: new ConsoleLogger({ json: process.env.NODE_ENV === 'production' }),
});
app.useSecurityHeaders();
// On SIGTERM, the outbox relay finishes its publishes before the RabbitMQ client closes.
app.enableShutdownHooks();

const config = app.get<ConfigService<Env, true>>(ConfigService);
app.enableCors({ origin: config.get('CORS_ORIGINS', { infer: true }) });

const document = new DocumentBuilder().setTitle('Orders API').setVersion('1.0').build();
SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, document));

await app.listen(config.get('PORT', { infer: true }));

```

根 **模块** 带有下一节解释的 **出库**，是订单 **服务** 的最后一个文件。

#### 使用事务性 **出库** 发布事件

当订单提交时，履约 **服务** 必须知道。显而易见的代码是保存订单，然后调用 `client.emit('order.placed', ...)`。这是对两个系统的两次写入，没有事务跨越它们：如果进程死亡或 RabbitMQ 宕机，在这两次写入之间，订单存在但永远不会准备发货。先发射没有更好：如果插入失败，会为不存在的订单准备发货。

[`@nestjs/outbox`](/reliability/outbox) 将事件转换为一行。`outbox.add()` 在与订单**相同的事务**中插入它，因此两者要么都提交，要么都不提交。然后一个中继发布已提交的消息，并重试直到 **网关** 接收到它们。其 `ClientProxyTransport` 通过一个带有 `ClientProxy` 和 `emit()` 的 **消息模式** 发布，这是没有 **出库** 时会进行的相同调用，并且 RabbitMQ 客户端的 `emit()` 仅在 **网关** 确认消息（发布者确认）后才完成，因此“已发布”意味着 RabbitMQ 拥有它。

**服务** 通过相同的 `tx` 插入订单并添加事件：

```typescript title="apps/orders/src/orders/orders.service.ts"
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { Outbox } from '@nestjs/outbox';
import { ORDER_PLACED, orderPlacedSchema } from '@app/contracts';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { orders, type Order } from '../database/schema.js';
import type { PlaceOrderDto } from './orders.schemas.js';

type Transaction = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

@Injectable()
export class OrdersService {
  constructor(
    @InjectDrizzle() private readonly db: NodePgDatabase,
    private readonly outbox: Outbox<Transaction>,
  ) {}

  async place(dto: PlaceOrderDto): Promise<Order> {
    const order = await this.db.transaction(async (tx) => {
      const [order] = await tx.insert(orders).values(dto).returning();
      // Checked against the contract the consumer validates with: a payload it
      // would reject fails this request, and rolls the order back.
      const event = orderPlacedSchema.parse({
        orderId: order.id,
        customerEmail: order.customerEmail,
        shippingAddress: order.shippingAddress,
        items: order.items,
        placedAt: order.createdAt.toISOString(),
      });
      // Through tx: the message commits with the order, or not at all.
      await this.outbox.add(tx, { topic: ORDER_PLACED, key: order.id, payload: event });
      return order;
    });
    this.outbox.notify(); // publish now, instead of at the relay's next poll
    return order;
  }

  async findOne(id: string): Promise<Order> {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, id));
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }
}

```

- **事件在事务中被验证。** `orderPlacedSchema.parse()` 在履约 **服务** 会拒绝的事件上抛出，订单随之回滚。生产者中的错误会使一个 **请求** 以 500 失败，而不是发送一个永远无法处理的消息。
- **关键是订单的 id。** 具有相同键的消息一次发布一个，按其事务提交的顺序发布，因此关于同一订单的后续事件（取消）在到达 **网关** 的途中不会覆盖此事件。
- **提交后 `notify()`** 唤醒中继，因此事件立即发出，而不是在下一次轮询时发出。

根 **模块** 将 **出库** 注册到其存储中，以及它通过的 RabbitMQ 客户端：

```typescript title="apps/orders/src/app.module.ts"
import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DrizzleModule, getDrizzleToken } from '@nestjs/drizzle';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { createObserveModule } from '@nestjs/observe';
import { ClientProxyTransport, OutboxModule, OutboxStorage } from '@nestjs/outbox';
import { fromDrizzle, PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { FULFILLMENT_EVENTS_QUEUE, fulfillmentEventsQueueOptions } from '@app/contracts';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { envSchema, type Env } from './config.js';
import { HealthModule } from './health/health.module.js';
import { OrdersModule } from './orders/orders.module.js';

export const FULFILLMENT_EVENTS = 'FULFILLMENT_EVENTS';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // First, so it shuts down last and still sends what the other modules did.
    ObserveModule.forRoot({
      // Empty until `npx @nestjs/observe link` writes the key pair into .env: the SDK then sends nothing.
      appKey: process.env.OBSERVE_APP_KEY ?? '',
      appSecret: process.env.OBSERVE_APP_SECRET ?? '',
      serviceId: 'orders',
    }),
    ConfigModule.forRoot({ isGlobal: true, envFilePath: 'apps/orders/.env', validationSchema: envSchema }),
    DrizzleModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        drizzle,
        connection: config.get('DATABASE_URL', { infer: true }),
      }),
    }),
    OutboxModule.forRootAsync({
      imports: [
        ClientsModule.registerAsync([
          {
            name: FULFILLMENT_EVENTS,
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>) => ({
              transport: Transport.RMQ,
              options: {
                urls: [config.get('RABBITMQ_URL', { infer: true })],
                queue: FULFILLMENT_EVENTS_QUEUE,
                queueOptions: fulfillmentEventsQueueOptions,
                // Written to disk by the broker, so a broker restart keeps them.
                persistent: true,
              },
            }),
          },
        ]),
      ],
      // Publishes with the client's emit(), which resolves once the broker confirmed the message.
      transports: { fulfillment: ClientProxyTransport(FULFILLMENT_EVENTS) },
      useFactory: () => ({
        relay: { pollInterval: '1s', publishTimeout: '10s' },
        // Retries for 30 to 60 minutes, through a broker outage, before dead-lettering.
        retry: { attempts: 70, backoff: { delay: '1s', maxDelay: '1m' } },
      }),
    }),
    OrdersModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: StandardSchemaValidationPipe },
    {
      // The outbox's messages, in this service's database (schema nest_outbox).
      provide: PostgresOutboxStore,
      inject: [getDrizzleToken(), OutboxStorage],
      useFactory: (db: NodePgDatabase, outboxStorage: OutboxStorage) =>
        new PostgresOutboxStore({ executor: fromDrizzle(db) }, outboxStorage),
    },
  ],
})
export class AppModule {}

```

- **`PostgresOutboxStore`** 将 **出库** 的消息保留在订单数据库中，在一个独立的 **模式** `nest_outbox` 中，该 **模式** 在开发环境中在启动时创建和 **迁移**（参见 [Keep messages in your database](/reliability/outbox#keep-messages-in-your-database)）。你的 **迁移** 不会创建它。
- **客户端获取共享队列及其选项**，因此它声明 `fulfillment.events` 与工作者完全相同。`persistent: true` 要求 **网关** 将每条消息保留在磁盘上：客户端的默认值是 `false`。
- **`ClientsModule` 在 **出库** 的 `imports` 中**，因为 `ClientProxyTransport(FULFILLMENT_EVENTS)` 是 Nest 在 `OutboxModule` 内部实例化的一个类，在那里它通过名称注入客户端。
- **`retry`** 保留消息 30 到 60 分钟的尝试时间，足以应对 **网关** 重启或短暂中断。之后，消息移动到 **出库** 自己的死信队列，其中 `OutboxDeadLetters` 可以重新排队它（参见 [Retries and the dead-letter queue](/reliability/outbox#retries-and-the-dead-letter-queue)）。
- **`ObserveModule` 在 `imports` 中优先**，正如 [SDK's quick start](/observability/sdk#quick-start) 所做的那样：**模块** 按逆序关闭，因此它最后停止，并发送其他 **模块** 记录的内容（参见 [Shutdown](/observability/sdk#shutdown)）。`createObserveModule()` 使用 `ObserveInstrument` 返回它，而 `main.ts` 将其传递给 Nest。
- **键对在链接项目之前是空的。** 没有它，SDK 不发送任何内容，并在启动时报告这一点。`npx @nestjs/observe link` 在 **工作空间** 的根目录中运行，将 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET` 写入根 `.env`，并将 `--env-file .env` 添加到 `nest start` 脚本中，因此在导入 `AppModule` 之前它们就在环境中，当 SDK 读取它们时：`ConfigModule` 延迟加载 `apps/orders/.env`（参见 [Linking from the terminal](/observability/sdk#linking-from-the-terminal)）。键的作用域是项目级别的，因此由同一脚本启动的履约 **服务** 使用相同的键对（参见 [First project](/observability/overview#第一个项目)）。

启动订单 **服务**。它是 **工作空间** 的默认项目，所以使用不带名称的 `nest start` 启动它：

```bash
$ npm run start

```

启动时，出库记录其存储，创建了其 **模式**：

```bash
LOG [OutboxModule] OutboxStorage: PostgresOutboxStore
LOG [OutboxModule] PostgresOutboxStore: migrated schema "nest_outbox" to version 1.

```

下订单。它提交，其事件在 `fulfillment.events` 中等待 **消费者**，下一节会添加（管理 UI 显示该队列中有一个就绪消息）：

```bash
$ curl localhost:3000/orders --json '{"customerEmail":"ada@example.com","shippingAddress":"1 Analytical Way, London","items":[{"sku":"KB-01","quantity":2}]}'
{"id":"0e32101b-33a4-483b-84fc-e2f438df69f9","customerEmail":"ada@example.com","shippingAddress":"1 Analytical Way, London","items":[{"sku":"KB-01","quantity":2}],"createdAt":"2026-11-23T19:41:15.833Z"}

```

#### 在履约 **服务** 中消费事件

履约 **服务** 有其自己的配置，还有一个设置：一个实例同时处理多少个事件。

```typescript title="apps/fulfillment/src/config.ts"
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3001),
  DATABASE_URL: z.url(),
  RABBITMQ_URL: z.url({ protocol: /^amqps?$/ }),
  // How many events one instance handles at the same time.
  PREFETCH_COUNT: z.coerce.number().int().min(1).max(100).default(10),
});

export type Env = z.infer<typeof envSchema>;

```

其表包含每个订单一个发货记录。订单的 id 是主键，这使得对同一事件的第二次投递是无害的，如 [Handle each event once](/tutorials/microservices-rabbitmq#handle-each-event-once) 所示：

```typescript title="apps/fulfillment/src/database/schema.ts"
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const shipments = pgTable('shipments', {
  // One shipment per order: the key that makes a second delivery a no-op.
  orderId: uuid('order_id').primaryKey(),
  status: text('status', { enum: ['preparing', 'shipped'] }).notNull().default('preparing'),
  customerEmail: text('customer_email').notNull(),
  shippingAddress: text('shipping_address').notNull(),
  items: jsonb('items').$type<{ sku: string; quantity: number }[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

```

其 drizzle-kit 配置是订单 **服务** 的，具有自己的路径：

```typescript title="apps/fulfillment/drizzle.config.ts"
import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// Locally, the service's .env file; in CI and production, the environment.
if (existsSync('apps/fulfillment/.env')) {
  process.loadEnvFile('apps/fulfillment/.env');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './apps/fulfillment/src/database/schema.ts',
  out: './apps/fulfillment/drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});

```

生成其 **迁移**，并将其应用于其自身的数据库：

```bash
$ npx drizzle-kit generate --config apps/fulfillment/drizzle.config.ts --name=shipments
$ npx drizzle-kit migrate --config apps/fulfillment/drizzle.config.ts

```

##### 工作完成后确认

默认情况下，RabbitMQ **传输器** 不进行消息确认（`noAck` 是 `true`）：**代理** 一旦将其交给 **消费者**，就会删除该消息。在事件处理过程中崩溃的 **消费者** 会丢失该事件。使用 `noAck: false`，**代理** 会保留每个消息，直到 **消费者** 使用 `channel.ack()` 确认它，如果 **消费者** 的连接先中断，则将其重新投递到该实例或另一个实例（参见 [Message acknowledgement](/microservices/rabbitmq#message-acknowledgement)）。

手动确认有一个陷阱：当处理程序抛出时，Nest 会记录错误而不会做其他操作。该消息保持未确认状态，既不重试也不进入死信队列，会占用实例的预取槽位直到通道关闭，然后它会返回。在 **管道** 中验证失败的消息根本不会到达处理程序的主体，因此在那里的 `try`/`catch` 也无法解决它。[interceptor](/overview/interceptors) 同时看到了这两者，因为 **管道** 和处理程序在它的 `next.handle()` 内部运行：

```typescript title="apps/fulfillment/src/messaging/rmq-ack.interceptor.ts"
import { Injectable, Logger, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { RmqContext } from '@nestjs/microservices';
import { FULFILLMENT_EVENTS_DEAD_LETTER_QUEUE, FULFILLMENT_EVENTS_QUEUE } from '@app/contracts';
import type { ConfirmChannel, Message } from 'amqplib';
import { setTimeout } from 'node:timers/promises';
import { from, lastValueFrom, type Observable } from 'rxjs';
import { InvalidMessageException } from './invalid-message.exception.js';

/** How many times an event is tried before it's dead-lettered. */
const MAX_ATTEMPTS = 5;

/** The wait before each retry: 1, 2, 4, then 8 seconds. */
const backoff = (attempt: number) => Math.min(1_000 * 2 ** (attempt - 1), 16_000);

/**
 * Acknowledges an event once its handler succeeded, and only then. A failed
 * event is retried, after a backoff, up to MAX_ATTEMPTS times, then moved to
 * the dead-letter queue with its error. An invalid message is moved there at once.
 */
@Injectable()
export class RmqAckInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RmqAckInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<void> {
    const rmq = context.switchToRpc().getContext<RmqContext>();
    // The transport's channels confirm publishes (amqp-connection-manager's default).
    const channel = rmq.getChannelRef() as ConfirmChannel;
    const message = rmq.getMessage() as Message;
    const pattern = rmq.getPattern();
    // Counted here, in a header: RabbitMQ 4 doesn't count a nack() with requeue as an attempt.
    const attempt = Number(message.properties.headers?.['x-attempt'] ?? 1);

    /** Publishes a copy to `queue`, waits for the broker to confirm it, then acknowledges the original. */
    const moveTo = async (queue: string, headers: Record<string, unknown>) => {
      channel.sendToQueue(queue, message.content, {
        ...message.properties,
        headers: { ...message.properties.headers, ...headers },
      });
      await channel.waitForConfirms();
      channel.ack(message);
    };

    const settle = async () => {
      try {
        // Runs the pipes and the handler: a failed validation lands below too.
        await lastValueFrom(next.handle(), { defaultValue: undefined });
      } catch (error) {
        if (!(error instanceof InvalidMessageException) && attempt < MAX_ATTEMPTS) {
          const delay = backoff(attempt);
          this.logger.warn(`Attempt ${attempt} of ${pattern} failed, retrying in ${delay} ms: ${error}`);
          await setTimeout(delay);
          return moveTo(FULFILLMENT_EVENTS_QUEUE, { 'x-attempt': attempt + 1 });
        }
        const reason = error instanceof InvalidMessageException ? JSON.stringify(error.getError()) : String(error);
        this.logger.error(`Dead-lettered ${pattern} after ${attempt} attempt(s): ${reason}`);
        return moveTo(FULFILLMENT_EVENTS_DEAD_LETTER_QUEUE, { 'x-attempts': attempt, 'x-error': reason.slice(0, 1_000) });
      }
      channel.ack(message);
    };

    return from(
      settle().catch((error) => {
        // The channel closed meanwhile: the broker gives the event to another consumer.
        this.logger.warn(`Could not settle ${pattern}: ${error}`);
      }),
    );
  }
}

```

- **仅在处理程序解析后**。处理程序写入数据库并在提交后解析，因此已确认的事件总是已提交的发货记录。在 `ack()` 之前崩溃会导致事件留在队列中。
- **重试是一个副本**。发生失败后，**拦截器** 再次发布消息，到队列的末尾，并在 `x-attempt` 头部中包含其尝试次数，等待 **代理** 确认副本，然后才确认原始消息。使用 `nack(message, false, true)` 返回消息会更简洁，但 RabbitMQ 4 不将此类重新排队计入投递限制，并且消息不携带尝试次数：每次都失败的消息将永远循环。在副本和 `ack()` 之间崩溃会导致两个副本，而 [Handle each event once](/tutorials/microservices-rabbitmq#handle-each-event-once) 使其无害。
- **最后一次尝试进入死信队列**，方式相同，错误包含在 `x-error` 头部中，因此读取死信队列的人可以看到失败原因。
- **退避保持消息**。在重试前等待会占用实例的预取槽位之一。当数据库宕机时，这就是你想要的：**消费者** 减速而不是在毫秒内耗尽其尝试次数。延迟队列（具有消息 TTL 并在死信后退回到 `fulfillment.events` 的队列）会释放该槽位，代价是需要声明更多的队列。
- **捕获已关闭的通道**。如果在处理程序运行时连接中断，`ack()` 会抛出，**代理** 已经将消息放回给另一个 **消费者**。

> info **提示** 如果立即将失败的消息进入死信队列就足够了，无需重试，**传输器** 可以为你完成：`@nestjs/microservices` 12.6.1 及更高版本的 `nackOnInternalError` 选项在处理程序因内部错误失败时，会拒绝消息而不重新排队（参见 [Message acknowledgement](/microservices/rabbitmq#message-acknowledgement)）。此 **服务** 首先重试事件，因此它自己解决消息。

验证失败是不同类型的失败：重试破坏其契约的消息是无法修复的。验证 **管道** 会抛出此异常，**拦截器** 会立即将其移动到死信队列：

```typescript title="apps/fulfillment/src/messaging/invalid-message.exception.ts"
import { RpcException } from '@nestjs/microservices';

interface Issue {
  message: string;
  path?: readonly (PropertyKey | { key: PropertyKey })[];
}

/** A message that breaks its contract: no retry will make it valid. */
export class InvalidMessageException extends RpcException {
  constructor(issues: readonly Issue[]) {
    const path = (issue: Issue) =>
      issue.path?.map((segment) => String(typeof segment === 'object' ? segment.key : segment)).join('.');
    super({ message: 'Invalid message', issues: issues.map((issue) => `${path(issue)}: ${issue.message}`) });
  }
}

```

##### 重试，然后进入死信队列

每次都失败的消息（毒丸消息）不应永远循环。**拦截器** 尝试事件 5 次（`MAX_ATTEMPTS`），每次都有 15 秒的退避时间，然后将其移动到 `fulfillment.events.dead`。在 **拦截器** 捕获之前就导致 **消费者** 崩溃的消息（例如内存不足错误），每次 **代理** 看到 **消费者** 连接断开时都会返回。配额队列的投递限制会在 5 次重新投递后将该消息进入死信队列。

**传输器** 只声明它消费的队列，RabbitMQ 会静默丢弃路由到不存在队列的消息，包括死信队列。因此，**消费者** 在消费任何内容之前，在启动时声明死信队列本身：

```typescript title="apps/fulfillment/src/messaging/dead-letter-queue.ts"
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FULFILLMENT_EVENTS_DEAD_LETTER_QUEUE } from '@app/contracts';
import { connect } from 'amqplib';
import type { Env } from '../config.js';

/**
 * The transport declares only the queue it consumes. RabbitMQ drops a dead
 * letter whose queue doesn't exist, so declare it before the first event.
 */
@Injectable()
export class DeadLetterQueue implements OnApplicationBootstrap {
  constructor(private readonly config: ConfigService<Env, true>) {}

  async onApplicationBootstrap() {
    const connection = await connect(this.config.get('RABBITMQ_URL', { infer: true }));
    try {
      const channel = await connection.createChannel();
      await channel.assertQueue(FULFILLMENT_EVENTS_DEAD_LETTER_QUEUE, {
        durable: true,
        arguments: { 'x-queue-type': 'quorum' },
      });
    } finally {
      await connection.close();
    }
  }
}

```

如果 **消费者** 启动时无法连接到 RabbitMQ，则此声明失败，启动也失败：平台会重启 **消费者** 直到 **代理** 响应。一旦 **消费者** 运行，**传输器** 会在连接中断时自动重新连接。

死信队列保留其主体。被 **消费者** 移动到该队列的消息具有 `x-attempts` 和 `x-error` 头部；被 **代理** 在投递限制后移动的消息则具有 `x-death` 头部，其中包含原因 `delivery_limit`。在 `fulfillment.events.dead` 的管理 UI 的 **获取消息** 面板中读取它们，修复原因，然后启用 **插件** 后，使用管理 UI 的 **移动消息** 功能通过 [shovel](https://www.rabbitmq.com/docs/shovel) 将消息移回。

##### 每次只处理一次事件

RabbitMQ 保证至少投递一次。如果一个工作者提交了发货信息但在 `ack()` 之前崩溃，它会再次接收到该事件，出库中转的发布重试也可能丢失确认。**消费者** 必须将第二次投递视为无操作。

在这里，发货信息的**主键**是订单的 id，插入操作是一个在冲突时不做任何操作的语句：

```typescript title="apps/fulfillment/src/shipments/shipments.service.ts"
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { OrderPlaced, Shipment } from '@app/contracts';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { shipments } from '../database/schema.js';

@Injectable()
export class ShipmentsService {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  /** Creates the order's shipment. `false` when it exists: this delivery is a duplicate. */
  async createFor(event: OrderPlaced): Promise<boolean> {
    // One statement: two deliveries of the same event, on two instances at the
    // same moment, can't both insert. A SELECT before the INSERT could let both through.
    const created = await this.db
      .insert(shipments)
      .values({
        orderId: event.orderId,
        customerEmail: event.customerEmail,
        shippingAddress: event.shippingAddress,
        items: event.items,
      })
      .onConflictDoNothing({ target: shipments.orderId })
      .returning({ orderId: shipments.orderId });
    return created.length === 1;
  }

  async find(orderId: string): Promise<Shipment | null> {
    const [shipment] = await this.db.select().from(shipments).where(eq(shipments.orderId, orderId));
    if (!shipment) {
      return null;
    }
    const { status, items, createdAt } = shipment;
    return { orderId, status, items, createdAt: createdAt.toISOString() };
  }
}

```

`createFor()` 回答了这次投递是否创建了发货信息，该信息从 `INSERT` 返回。一个先选择发货信息，然后在不存在时插入它的**服务**，两者之间存在一个间隙：两个事件副本同时运行，在两个实例上或在一个预取计数大于一的实例上，两者都找不到记录，第二次插入因唯一性冲突而失败，然后由**拦截器** 重试。[tests](/tutorials/microservices-rabbitmq#test-it) 精确地捕获了这种情况。

> info **提示** 当事件的效果不是具有自然键的行时，例如电子邮件，请在处理消息的**外包**中，将消息的 `id` 从信封中记录在一个已处理消息的表中，该表具有**主键**，并且与效果在同一事务中。`OutboxInbox` 来自 `@nestjs/outbox` 就是这样一个表，如**外包**章节的 [analytics service](/reliability/outbox#publish-to-the-analytics-microservice) 所示。

**控制器** 处理该事件。**管道** 根据契约验证信封，**拦截器** 确认它：

```typescript title="apps/fulfillment/src/shipments/shipments.controller.ts"
import { Controller, Logger, StandardSchemaValidationPipe, UseInterceptors, UsePipes } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { ORDER_PLACED, orderPlacedEnvelopeSchema, type OrderPlacedEnvelope } from '@app/contracts';
import { InvalidMessageException } from '../messaging/invalid-message.exception.js';
import { RmqAckInterceptor } from '../messaging/rmq-ack.interceptor.js';
import { ShipmentsService } from './shipments.service.js';

@Controller()
@UsePipes(new StandardSchemaValidationPipe({ exceptionFactory: (issues) => new InvalidMessageException(issues) }))
export class ShipmentsController {
  private readonly logger = new Logger(ShipmentsController.name);

  constructor(private readonly shipmentsService: ShipmentsService) {}

  @EventPattern(ORDER_PLACED)
  @UseInterceptors(RmqAckInterceptor)
  async onOrderPlaced(@Payload({ schema: orderPlacedEnvelopeSchema }) envelope: OrderPlacedEnvelope) {
    const created = await this.shipmentsService.createFor(envelope.payload);
    if (created) {
      this.logger.log(`Shipment created for order ${envelope.payload.orderId}`);
    } else {
      this.logger.log(`Skipped duplicate ${envelope.topic} ${envelope.id}`);
    }
  }
}

```

发货**模块**注册了**控制器**和**服务**：

```typescript title="apps/fulfillment/src/shipments/shipments.module.ts"
import { Module } from '@nestjs/common';
import { ShipmentsController } from './shipments.controller.js';
import { ShipmentsService } from './shipments.service.js';

@Module({
  controllers: [ShipmentsController],
  providers: [ShipmentsService],
})
export class ShipmentsModule {}

```

##### 启动工作者

工作者监听两个**队列**：事件（手动确认）和**请求**（[the next section](/tutorials/microservices-rabbitmq#ask-another-service-with-request-response) 使用）。两个**服务**的选项都存在于一个文件中，测试也使用该文件：

```typescript title="apps/fulfillment/src/messaging/transport.ts"
import { Transport, type RmqOptions } from '@nestjs/microservices';
import {
  FULFILLMENT_EVENTS_QUEUE,
  FULFILLMENT_REQUESTS_QUEUE,
  fulfillmentEventsQueueOptions,
  fulfillmentRequestsQueueOptions,
} from '@app/contracts';
import type { Env } from '../config.js';

type Config = Pick<Env, 'RABBITMQ_URL' | 'PREFETCH_COUNT'>;

/** Events: acknowledged once handled, so a crash or an error loses none of them. */
export const eventsServer = (config: Config): RmqOptions => ({
  transport: Transport.RMQ,
  options: {
    urls: [config.RABBITMQ_URL],
    queue: FULFILLMENT_EVENTS_QUEUE,
    queueOptions: fulfillmentEventsQueueOptions,
    noAck: false,
    // At most this many unacknowledged events on this instance at a time.
    prefetchCount: config.PREFETCH_COUNT,
    // On shutdown: stop taking events, then wait for the ones in flight.
    gracefulShutdown: true,
    gracePeriod: 20_000,
  },
});

/** Requests: their own queue, so they never wait behind a backlog of events. */
export const requestsServer = (config: Config): RmqOptions => ({
  transport: Transport.RMQ,
  options: {
    urls: [config.RABBITMQ_URL],
    queue: FULFILLMENT_REQUESTS_QUEUE,
    queueOptions: fulfillmentRequestsQueueOptions,
    gracefulShutdown: true,
    gracePeriod: 5_000,
  },
});

```

- **`prefetchCount`** 是**代理**一次发送给一个实例的未确认事件数量，因此也是它一次处理的数量。**传输器**的默认值是 `0`，无限制：第一个连接的实例将获取**队列**中的所有消息，而其他实例将空闲。
- **`gracefulShutdown`** 使关闭**服务**首先取消其**消费者**，然后等待最多 `gracePeriod` 以处理中的事件，然后再关闭**通道**。参见 [Run several workers](/tutorials/microservices-rabbitmq#run-several-workers)。
- **请求自动确认**（`noAck` 保留其默认值）。因崩溃丢失的**请求**不产生任何成本：调用者超时并可以再次请求。因崩溃丢失的事件是一个永远不会发生的发货信息。

工作者的根**模块**注册了它自己的 `ObserveModule`、数据库和死信**队列**。它的 `health/` 文件夹是订单**服务**的副本，因为两者都检查自己的数据库：

```bash
$ cp -r apps/orders/src/health apps/fulfillment/src/health

```

其根**模块**：

```typescript title="apps/fulfillment/src/app.module.ts"
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DrizzleModule } from '@nestjs/drizzle';
import { createObserveModule } from '@nestjs/observe';
import { drizzle } from 'drizzle-orm/node-postgres';
import { envSchema, type Env } from './config.js';
import { HealthModule } from './health/health.module.js';
import { DeadLetterQueue } from './messaging/dead-letter-queue.js';
import { ShipmentsModule } from './shipments/shipments.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // First, so it shuts down last and still sends what the other modules did.
    ObserveModule.forRoot({
      // Empty until `npx @nestjs/observe link` writes the key pair into .env: the SDK then sends nothing.
      appKey: process.env.OBSERVE_APP_KEY ?? '',
      appSecret: process.env.OBSERVE_APP_SECRET ?? '',
      serviceId: 'fulfillment',
    }),
    ConfigModule.forRoot({ isGlobal: true, envFilePath: 'apps/fulfillment/.env', validationSchema: envSchema }),
    DrizzleModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        drizzle,
        connection: config.get('DATABASE_URL', { infer: true }),
      }),
    }),
    ShipmentsModule,
    HealthModule,
  ],
  providers: [DeadLetterQueue],
})
export class AppModule {}

```

工作者是一个 [hybrid application](/faq/hybrid-application)：平台**健康检查**的 HTTP **服务**，以及两个 RabbitMQ **服务**。`listen()` 在 `startAllMicroservices()` 之前，因此在第一个消息到达之前，每个**模块**都已完成初始化，并且死信**队列**已存在。`instrument` 位于 `NestFactory.create()` 的选项中，即创建应用程序的调用，该调用随后将 RabbitMQ **服务**添加到其中：

```typescript title="apps/fulfillment/src/main.ts"
import { ConsoleLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NodeAdapter, type NestNodeApplication } from '@nestjs/platform-node';
import { AppModule, ObserveInstrument } from './app.module.js';
import type { Env } from './config.js';
import { eventsServer, requestsServer } from './messaging/transport.js';

const app = await NestFactory.create<NestNodeApplication>(AppModule, new NodeAdapter(), {
  instrument: ObserveInstrument,
  logger: new ConsoleLogger({ json: process.env.NODE_ENV === 'production' }),
});
// On SIGTERM: stop consuming, finish the messages in flight, then close the pool.
app.enableShutdownHooks();

const config = app.get<ConfigService<Env, true>>(ConfigService);
const rabbitmq = {
  RABBITMQ_URL: config.get('RABBITMQ_URL', { infer: true }),
  PREFETCH_COUNT: config.get('PREFETCH_COUNT', { infer: true }),
};
app.connectMicroservice(eventsServer(rabbitmq));
app.connectMicroservice(requestsServer(rabbitmq));

// The HTTP server (health checks) first: every module is initialized before a message arrives.
await app.listen(config.get('PORT', { infer: true }));
await app.startAllMicroservices();

```

从另一个终端，在端口 3001 启动工作者：

```bash
$ npm run start -- fulfillment

```

它获取了**队列**中等待的订单：

```bash
LOG [NestApplication] Nest application successfully started
LOG [NestMicroservice] Nest microservice successfully started
LOG [NestMicroservice] Nest microservice successfully started
LOG [ShipmentsController] Shipment created for order 0e32101b-33a4-483b-84fc-e2f438df69f9

```

#### 使用请求-响应询问另一个**服务**

事件是**服务**之间的默认通信方式：订单**服务**不等待履约**服务**，不需要它处于运行状态，也不知道还有谁在监听。然而，有些问题需要立即得到答案，因为有一个 HTTP **客户端**在等待它。`GET /orders/:id/shipment` 使用 `send()` 和 `@MessagePattern()` 通过 RabbitMQ 进行请求-响应，询问履约**服务**订单的发货信息。

工作者从其数据库中回答。将处理程序添加到其**控制器**：

```typescript title="apps/fulfillment/src/shipments/shipments.controller.ts"
import { Controller, Logger, StandardSchemaValidationPipe, UseInterceptors, UsePipes } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import {
  FIND_SHIPMENT,
  ORDER_PLACED,
  findShipmentSchema,
  orderPlacedEnvelopeSchema,
  type FindShipment,
  type OrderPlacedEnvelope,
} from '@app/contracts';
import { InvalidMessageException } from '../messaging/invalid-message.exception.js';
import { RmqAckInterceptor } from '../messaging/rmq-ack.interceptor.js';
import { ShipmentsService } from './shipments.service.js';

@Controller()
@UsePipes(new StandardSchemaValidationPipe({ exceptionFactory: (issues) => new InvalidMessageException(issues) }))
export class ShipmentsController {
  private readonly logger = new Logger(ShipmentsController.name);

  constructor(private readonly shipmentsService: ShipmentsService) {}

  @EventPattern(ORDER_PLACED)
  @UseInterceptors(RmqAckInterceptor)
  async onOrderPlaced(@Payload({ schema: orderPlacedEnvelopeSchema }) envelope: OrderPlacedEnvelope) {
    const created = await this.shipmentsService.createFor(envelope.payload);
    if (created) {
      this.logger.log(`Shipment created for order ${envelope.payload.orderId}`);
    } else {
      this.logger.log(`Skipped duplicate ${envelope.topic} ${envelope.id}`);
    }
  }

  @MessagePattern(FIND_SHIPMENT)
  find(@Payload({ schema: findShipmentSchema }) { orderId }: FindShipment) {
    return this.shipmentsService.find(orderId);
  }
}

```

**请求**由相同的**管道**验证。无效的**请求**会收到错误**响应**而不是死信，因为**请求**不会被确认。

在订单端，一个小型**客户端**发送**请求**，并等待最多 `REQUEST_TIMEOUT_MS` 的答案：

```typescript title="apps/orders/src/orders/fulfillment.client.ts"
import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { FIND_SHIPMENT, REQUEST_TIMEOUT_MS, shipmentSchema, type Shipment } from '@app/contracts';
import { firstValueFrom, timeout } from 'rxjs';

export const FULFILLMENT_REQUESTS = 'FULFILLMENT_REQUESTS';

/** Asks the fulfillment service, and waits for its answer. */
@Injectable()
export class FulfillmentClient {
  private readonly logger = new Logger(FulfillmentClient.name);

  constructor(@Inject(FULFILLMENT_REQUESTS) private readonly client: ClientProxy) {}

  async findShipment(orderId: string): Promise<Shipment | null> {
    let reply: unknown;
    try {
      reply = await firstValueFrom(
        // A request waits in the queue until a worker takes it: no answer is
        // an answer too, after the timeout.
        this.client.send(FIND_SHIPMENT, { orderId }).pipe(timeout(REQUEST_TIMEOUT_MS)),
      );
    } catch (error) {
      this.logger.warn('The fulfillment service did not answer', { orderId, error: String(error) });
      throw new ServiceUnavailableException('The fulfillment service is unavailable, try again later');
    }
    return shipmentSchema.nullable().parse(reply);
  }
}

```

- **需要超时。** 通过 RabbitMQ，当履约**服务**宕机时，`send()` 不会失败：**请求**在 `fulfillment.requests` 中等待**消费者**，而 `send()` 没有自己的超时，因此 HTTP **请求**会挂起。RxJS `timeout()` **操作符**结束等待（参见 [Handling timeouts](/microservices/basics#handling-timeouts)）。
- **无答案即 503。** 未映射时，`TimeoutError` 会作为 500 达到**客户端**，表示订单**服务**已损坏。`503 Service Unavailable` 表示依赖项有问题，并且相同的**请求**稍后可能有效。
- **请求不会比其调用者存活更久。** **队列**的消息 TTL 与相同的超时相同，因此未及时被任何**消费者**接收的**请求**会被丢弃，而不是在工作者恢复时回复给已放弃的**客户端**。
- **答案也会被验证**，使用契约的 `shipmentSchema`，因此更改其答案的履约**服务**会在这里被响亮地失败。
- **切勿在数据库事务内部调用 `send()`。** 它会保持事务及其连接打开，直到另一个**服务**给出答案所需的时间。

**控制器**返回发货信息，或者在工作者尚未准备好时返回 404：

```typescript title="apps/orders/src/orders/orders.controller.ts"
import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { FulfillmentClient } from './fulfillment.client.js';
import { placeOrderSchema, type PlaceOrderDto } from './orders.schemas.js';
import { OrdersService } from './orders.service.js';

const orderId = { schema: z.uuid() };

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly fulfillmentClient: FulfillmentClient,
  ) {}

  @Post()
  place(@Body({ schema: placeOrderSchema }) dto: PlaceOrderDto) {
    return this.ordersService.place(dto);
  }

  @Get(':id')
  findOne(@Param('id', orderId) id: string) {
    return this.ordersService.findOne(id);
  }

  @Get(':id/shipment')
  async findShipment(@Param('id', orderId) id: string) {
    const order = await this.ordersService.findOne(id);
    const shipment = await this.fulfillmentClient.findShipment(order.id);
    if (!shipment) {
      throw new NotFoundException('No shipment yet');
    }
    return shipment;
  }
}

```

订单**模块**在**请求****队列**上注册了**请求****客户端**，并使用其共享选项：

```typescript title="apps/orders/src/orders/orders.module.ts"
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { FULFILLMENT_REQUESTS_QUEUE, fulfillmentRequestsQueueOptions } from '@app/contracts';
import type { Env } from '../config.js';
import { FULFILLMENT_REQUESTS, FulfillmentClient } from './fulfillment.client.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: FULFILLMENT_REQUESTS,
        inject: [ConfigService],
        useFactory: (config: ConfigService<Env, true>) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.get('RABBITMQ_URL', { infer: true })],
            queue: FULFILLMENT_REQUESTS_QUEUE,
            queueOptions: fulfillmentRequestsQueueOptions,
          },
        }),
      },
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, FulfillmentClient],
})
export class OrdersModule {}

```

**客户端**通过 RabbitMQ 的直接回复到（`amq.rabbitmq.reply-to`）回复，其默认值是 `replyQueue`：无需声明或清理回复**队列**。

#### 运行多个工作者

在另一个端口启动第二个工作者实例。RabbitMQ 将每个事件分配给队列的其中一个**消费者**，因此实例共享工作，是**竞争性消费者**，它们之间没有协调：

```bash
$ PORT=3002 npm run start -- fulfillment

```

每个实例最多持有 `PREFETCH_COUNT` 个未确认的事件，因此慢速实例不会囤积空闲实例可以处理的消息。如果处理程序主要等待数据库，请提高此值以提高吞吐量；如果处理程序在写入时持有连接，则将其保持在池大小或以下。

现在可以同时在不同的实例上以任何顺序处理不同订单的事件。这对于 `order.placed` 来说是没问题的，因为它是其订单的唯一事件。一旦订单有更多事件，可以在取消放置之前处理取消：编写每个处理程序，使其不依赖于到达顺序（一个找不到发货记录的取消将其标记为已取消，而放置的 `INSERT ... ON CONFLICT DO NOTHING` 随后会保留该状态），或者将订单的事件分配给一个**消费者**。

##### 不丢失事件地关闭

部署发送 `SIGTERM`。使用 `enableShutdownHooks()`，工作者关闭其**服务**。使用 `gracefulShutdown`，每个**服务**首先取消其**消费者**，因此**传输器**不会再向该实例发送任何内容，然后等待正在处理的**处理程序**，最多 `gracePeriod` 个，然后才关闭其通道。正在处理的事件完成并被确认。一个处理程序耗时超过宽限期的事件在通道关闭时仍未确认，因此**传输器**将其交给另一个实例：它被处理了两次，插入操作使其无害。将平台关闭超时（Kubernetes 的 `terminationGracePeriodSeconds`）设置为大于 `gracePeriod`，以防止进程在等待时被杀死。

订单**服务**也会清空。在 `SIGTERM` 上，出库中继停止声明消息，完成正在处理的发布，并将剩余的事件释放给另一个实例，然后 RabbitMQ **客户端**关闭。一个发布被截断的消息仍保留在出库中，并从下一个实例发出。

#### 试用

在两个**服务**和两个工作者实例运行时，放置一个订单并请求其发货：

```bash
$ curl localhost:3000/orders --json '{"customerEmail":"grace@example.com","shippingAddress":"7 Compiler Street, Arlington","items":[{"sku":"KB-01","quantity":1},{"sku":"MS-02","quantity":1}]}'
{"id":"c384ae0e-0577-42b1-9e88-32f106eb55dc","customerEmail":"grace@example.com","shippingAddress":"7 Compiler Street, Arlington","items":[{"sku":"KB-01","quantity":1},{"sku":"MS-02","quantity":1}],"createdAt":"2026-11-23T19:42:23.739Z"}
$ curl localhost:3000/orders/c384ae0e-0577-42b1-9e88-32f106eb55dc/shipment
{"orderId":"c384ae0e-0577-42b1-9e88-32f106eb55dc","status":"preparing","items":[{"sku":"KB-01","quantity":1},{"sku":"MS-02","quantity":1}],"createdAt":"2026-11-23T19:42:23.768Z"}

```

其中一个工作者记录了它。再放置几个，两个工作者的日志中显示了其中一些：

```bash
LOG [ShipmentsController] Shipment created for order c384ae0e-0577-42b1-9e88-32f106eb55dc

```

停止 RabbitMQ，然后放置一个订单。订单**服务**仍在几毫秒内接受它：订单及其事件一起提交，中继继续尝试：

```bash
$ docker stop rabbitmq
$ curl -i localhost:3000/orders --json '{"customerEmail":"ada@example.com","shippingAddress":"1 Analytical Way, London","items":[{"sku":"KB-01","quantity":1}]}'
HTTP/1.1 201 Created
...
{"id":"4b41b558-e7d9-42dc-bfa8-6b2932396d13","customerEmail":"ada@example.com","shippingAddress":"1 Analytical Way, London","items":[{"sku":"KB-01","quantity":1}],"createdAt":"2026-11-23T19:42:39.505Z"}

```

订单**服务**记录了每次尝试，等待时间逐渐增加：

```bash
ERROR [ClientProxy] Disconnected from RMQ. Trying to reconnect.
WARN [OutboxRelay] Retrying order.placed 01a209ee-9195-7167-9b4f-2048f3cc3e6e in 885ms (attempt 1 of 70 failed): Error: Connection lost. Trying to reconnect...
WARN [OutboxRelay] Retrying order.placed 01a209ee-9195-7167-9b4f-2048f3cc3e6e in 1572ms (attempt 2 of 70 failed): Error: Connection lost. Trying to reconnect...
WARN [OutboxRelay] Retrying order.placed 01a209ee-9195-7167-9b4f-2048f3cc3e6e in 3403ms (attempt 3 of 70 failed): Error: Connection lost. Trying to reconnect...
WARN [OutboxRelay] Retrying order.placed 01a209ee-9195-7167-9b4f-2048f3cc3e6e in 5309ms (attempt 4 of 70 failed): Error: Connection lost. Trying to reconnect...
WARN [OutboxRelay] Retrying order.placed 01a209ee-9195-7167-9b4f-2048f3cc3e6e in 15601ms (attempt 5 of 70 failed): Error: Connection lost. Trying to reconnect...
WARN [OutboxRelay] Retrying order.placed 01a209ee-9195-7167-9b4f-2048f3cc3e6e in 19064ms (attempt 6 of 70 failed): Error: Connection lost. Trying to reconnect...

```

重新启动 RabbitMQ。**客户端**重新连接，中继的下一次尝试发布事件，工作者准备发货：

```bash
$ docker start rabbitmq
LOG [ClientProxy] Successfully connected to RMQ broker
LOG [ShipmentsController] Shipment created for order 4b41b558-e7d9-42dc-bfa8-6b2932396d13

```

现在停止两个工作者，然后请求发货。**请求**在队列中等待直到超时，三秒后**客户端**收到 503：

```bash
$ curl -i localhost:3000/orders/4b41b558-e7d9-42dc-bfa8-6b2932396d13/shipment
HTTP/1.1 503 Service Unavailable
...
{"message":"The fulfillment service is unavailable, try again later","error":"Service Unavailable","statusCode":503}

```

最后，再次启动一个工作者，并发布一个违反契约的消息，就像一个有缺陷的**生产者**会做的那样。管理 API 将其发布到默认交换机，该交换机将其路由到 `fulfillment.events`：

```bash
$ curl -u guest:guest localhost:15672/api/exchanges/%2F/amq.default/publish --json '{"routing_key":"fulfillment.events","properties":{},"payload":"{\"pattern\":\"order.placed\",\"data\":{\"id\":\"x\",\"payload\":{\"orderId\":\"not-a-uuid\"}}}","payload_encoding":"string"}'
{"routed":true}

```

工作者立即将其移动到死信队列，不重试：

```bash
ERROR [RmqAckInterceptor] Dead-lettered order.placed after 1 attempt(s): {"message":"Invalid message","issues":["topic: Invalid input: expected string, received undefined",...,"payload.orderId: Invalid UUID",...]}

```

`fulfillment.events.dead` 现在持有它，带有 `x-attempts: 1` 和 `x-error` 中的**验证**问题。

#### 测试

本页上的保证是关于崩溃、重新投递、超时和停机时间的，模拟**传输器**无法重现这些情况。测试针对真实的 RabbitMQ 和 PostgreSQL 运行，使用自己的虚拟主机和两个数据库，因为它们会清除队列并截断表。它们在测试进程中启动**服务**，并使用 `app.inject()` 发送 HTTP **请求**，这是 Node **增强器**提供的。

将测试设置添加到 **CLI** 生成的 `vitest.config.e2e.ts` 中。测试使用 `TEST_*` 变量中的**传输器**和数据库：

```typescript title="vitest.config.e2e.ts"
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // The test files share one broker and its queues.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 30_000,
    env: {
      DATABASE_URL: 'postgres://unused-in-tests',
      RABBITMQ_URL: process.env.TEST_RABBITMQ_URL ?? 'amqp://unused-in-tests',
    },
  },
});

```

辅助程序启动工作者实例，读取死信队列，并在**传输器**前运行 TCP **客户端代理**。关闭**客户端代理**会切断所有通过它的连接，就像崩溃或网络中断一样，而不会停止**传输器**对其他连接的服务：

```typescript title="apps/fulfillment/test/support.ts"
import { createServer, connect as connectTcp, type Server, type Socket } from 'node:net';
import { fileURLToPath } from 'node:url';
import { getDrizzleToken } from '@nestjs/drizzle';
import { NodeAdapter, type NestNodeApplication } from '@nestjs/platform-node';
import { Test } from '@nestjs/testing';
import {
  FULFILLMENT_EVENTS_DEAD_LETTER_QUEUE,
  FULFILLMENT_EVENTS_QUEUE,
  FULFILLMENT_REQUESTS_QUEUE,
  fulfillmentEventsQueueOptions,
  fulfillmentRequestsQueueOptions,
} from '@app/contracts';
import { connect } from 'amqplib';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module.js';
import { eventsServer, requestsServer } from '../src/messaging/transport.js';

export const rabbitmqUrl = process.env.TEST_RABBITMQ_URL!;
export const fulfillmentDatabaseUrl = process.env.TEST_FULFILLMENT_DATABASE_URL!;

/** The fulfillment database, migrated. */
export async function fulfillmentDatabase() {
  const db = drizzle({ client: new Pool({ connectionString: fulfillmentDatabaseUrl }) });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
  return db;
}

/** Empties the fulfillment queues, so a test sees only its own messages. */
export async function purgeQueues() {
  const connection = await connect(rabbitmqUrl);
  const channel = await connection.createChannel();
  const queues = [
    [FULFILLMENT_EVENTS_QUEUE, fulfillmentEventsQueueOptions],
    [FULFILLMENT_EVENTS_DEAD_LETTER_QUEUE, { durable: true, arguments: { 'x-queue-type': 'quorum' } }],
    [FULFILLMENT_REQUESTS_QUEUE, fulfillmentRequestsQueueOptions],
  ] as const;
  for (const [queue, options] of queues) {
    await channel.assertQueue(queue, options);
    await channel.purgeQueue(queue);
  }
  await connection.close();
}

/** The messages in the dead-letter queue, taken out of it. */
export async function takeDeadLetters() {
  const connection = await connect(rabbitmqUrl);
  const channel = await connection.createChannel();
  const letters = [];
  for (let message; (message = await channel.get(FULFILLMENT_EVENTS_DEAD_LETTER_QUEUE, { noAck: true })); ) {
    letters.push({ body: JSON.parse(message.content.toString()), headers: message.properties.headers ?? {} });
  }
  await connection.close();
  return letters;
}

/** Starts an instance of the fulfillment worker, with a pool of its own. */
export async function startWorker(options: { rabbitmqUrl?: string; prefetchCount?: number; gracePeriod?: number } = {}) {
  const db = drizzle({ client: new Pool({ connectionString: fulfillmentDatabaseUrl }) });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(getDrizzleToken())
    .useValue(db)
    .compile();
  const app = moduleRef.createNestApplication<NestNodeApplication>(new NodeAdapter(), { logger: process.env.TEST_LOGS ? undefined : false });
  const config = { RABBITMQ_URL: options.rabbitmqUrl ?? rabbitmqUrl, PREFETCH_COUNT: options.prefetchCount ?? 10 };
  const events = eventsServer(config);
  if (options.gracePeriod !== undefined) {
    events.options!.gracePeriod = options.gracePeriod;
  }
  app.connectMicroservice(events);
  app.connectMicroservice(requestsServer(config));
  await app.init();
  await app.startAllMicroservices();
  return app;
}

/** A TCP proxy to the broker: closing it cuts every connection through it, as a crash or an outage would. */
export async function brokerProxy() {
  const target = new URL(rabbitmqUrl);
  const sockets = new Set<Socket>();
  let server: Server | undefined;
  let port = 0;
  const open = async () => {
    server = createServer((client) => {
      const upstream = connectTcp(Number(target.port || 5672), target.hostname);
      for (const socket of [client, upstream]) {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        socket.on('error', () => {
          client.destroy();
          upstream.destroy();
        });
      }
      client.pipe(upstream).pipe(client);
    });
    await new Promise<void>((resolve) => server!.listen(port, '127.0.0.1', resolve));
    port = (server.address() as { port: number }).port;
  };
  await open();
  const url = new URL(rabbitmqUrl);
  url.hostname = '127.0.0.1';
  url.port = String(port);
  return {
    url: url.toString(),
    open,
    close: async () => {
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise((resolve) => server?.close(resolve));
    },
  };
}

/** Polls `check` until it returns a truthy value. */
export async function eventually<T>(check: () => Promise<T>, timeout = 20_000): Promise<NonNullable<T>> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await check();
    if (value) {
      return value;
    }
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for the condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

```

工作者测试以订单**服务**的方式发布事件，并覆盖**消费者**的保证。`vi.mock()` 缩短了**拦截器**的退避时间，因此五次尝试仅需几毫秒：

```typescript title="apps/fulfillment/test/shipments.e2e-spec.ts"
import { randomUUID } from 'node:crypto';
import type { NestNodeApplication } from '@nestjs/platform-node';
import { ClientProxyFactory, Transport, type ClientProxy } from '@nestjs/microservices';
import {
  FULFILLMENT_EVENTS_QUEUE,
  ORDER_PLACED,
  fulfillmentEventsQueueOptions,
  type OrderPlacedEnvelope,
} from '@app/contracts';
import { eq, sql } from 'drizzle-orm';
import { lastValueFrom } from 'rxjs';
import { shipments } from '../src/database/schema.js';
import { ShipmentsService } from '../src/shipments/shipments.service.js';
import {
  brokerProxy,
  eventually,
  fulfillmentDatabase,
  fulfillmentDatabaseUrl,
  purgeQueues,
  rabbitmqUrl,
  startWorker,
  takeDeadLetters,
} from './support.js';

// The retry backoff, shortened: the broker's delivery limit is what's under test.
vi.mock('node:timers/promises', async (importOriginal) => {
  const timers = await importOriginal<typeof import('node:timers/promises')>();
  return { ...timers, setTimeout: (ms: number) => timers.setTimeout(Math.min(ms, 20)) };
});

describe.skipIf(!rabbitmqUrl || !fulfillmentDatabaseUrl)('Fulfillment worker (e2e)', () => {
  let db: Awaited<ReturnType<typeof fulfillmentDatabase>>;
  let producer: ClientProxy;
  const workers: NestNodeApplication[] = [];

  beforeAll(async () => {
    db = await fulfillmentDatabase();
    // Publishes the way the orders service does: to the events queue, persistent, confirmed.
    producer = ClientProxyFactory.create({
      transport: Transport.RMQ,
      options: {
        urls: [rabbitmqUrl],
        queue: FULFILLMENT_EVENTS_QUEUE,
        queueOptions: fulfillmentEventsQueueOptions,
        persistent: true,
      },
    });
  });

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE shipments`);
    await purgeQueues();
  });

  afterEach(async () => {
    await Promise.all(workers.splice(0).map((worker) => worker.close()));
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await producer.close();
    await db.$client.end();
  });

  async function worker(options?: Parameters<typeof startWorker>[0]) {
    const app = await startWorker(options);
    workers.push(app);
    return { app, createFor: vi.spyOn(app.get(ShipmentsService), 'createFor') };
  }

  function orderPlaced(): OrderPlacedEnvelope {
    const orderId = randomUUID();
    return {
      id: randomUUID(),
      topic: ORDER_PLACED,
      key: orderId,
      headers: {},
      createdAt: Date.now(),
      payload: {
        orderId,
        customerEmail: 'ada@example.com',
        shippingAddress: '1 Analytical Way, London',
        items: [{ sku: 'KB-01', quantity: 1 }],
        placedAt: new Date().toISOString(),
      },
    };
  }

  const publish = (data: unknown) => lastValueFrom(producer.emit(ORDER_PLACED, data), { defaultValue: undefined });
  const shipmentCount = async () => (await db.select({ orderId: shipments.orderId }).from(shipments)).length;

  it('creates one shipment per order, and acknowledges a redelivered copy as a duplicate', async () => {
    const { app, createFor } = await worker();
    const service = app.get(ShipmentsService);
    // Both copies reach the database at the same time, as they can on two instances.
    let release!: () => void;
    const bothArrived = new Promise<void>((resolve) => (release = resolve));
    createFor.mockImplementation(async (event) => {
      if (createFor.mock.calls.length === 2) {
        release();
      }
      await bothArrived;
      return ShipmentsService.prototype.createFor.call(service, event);
    });
    const event = orderPlaced();

    await publish(event);
    await publish(event); // the outbox republishes a message whose confirmation it missed

    await eventually(async () => createFor.mock.calls.length === 2);
    const created = await Promise.all(createFor.mock.results.map((result) => result.value));
    expect(created.sort()).toEqual([false, true]); // one of them created the shipment
    expect(await shipmentCount()).toBe(1);
    expect(await takeDeadLetters()).toEqual([]);
  });

  it('dead-letters a message that breaks the contract, without retrying it', async () => {
    const { createFor } = await worker();

    await publish({ id: randomUUID(), payload: { orderId: 'not-a-uuid' } });

    const letter = await eventually(async () => (await takeDeadLetters()).at(0));
    expect(letter.body.data.payload).toEqual({ orderId: 'not-a-uuid' });
    expect(letter.headers).toMatchObject({ 'x-attempts': 1, 'x-error': expect.stringContaining('Invalid UUID') });
    expect(createFor).not.toHaveBeenCalled();
  });

  it('retries a failed event, and creates the shipment once it succeeds', async () => {
    const { createFor } = await worker();
    createFor.mockRejectedValueOnce(new Error('Connection terminated unexpectedly'));
    const event = orderPlaced();

    await publish(event);

    await eventually(async () => (await shipmentCount()) === 1);
    expect(createFor).toHaveBeenCalledTimes(2);
  });

  it('dead-letters an event that keeps failing, with its error, after its last attempt', async () => {
    const { createFor } = await worker();
    createFor.mockRejectedValue(new Error('Bug: column "items" does not exist'));
    const event = orderPlaced();

    await publish(event);

    const letter = await eventually(async () => (await takeDeadLetters()).at(0));
    expect(letter.body.data.id).toBe(event.id);
    expect(letter.headers).toMatchObject({ 'x-attempts': 5, 'x-error': 'Error: Bug: column "items" does not exist' });
    expect(createFor).toHaveBeenCalledTimes(5); // MAX_ATTEMPTS
  });

  it('delivers an event again when the worker handling it crashes before acknowledging it', async () => {
    const proxy = await brokerProxy();
    const crashing = await worker({ rabbitmqUrl: proxy.url, gracePeriod: 200 });
    crashing.createFor.mockReturnValue(new Promise(() => {})); // never finishes
    const event = orderPlaced();

    await publish(event);
    await eventually(async () => crashing.createFor.mock.calls.length === 1);
    const survivor = await worker();
    await proxy.close(); // the crashing worker's connection drops, with the event unacknowledged

    await eventually(async () => (await shipmentCount()) === 1);
    expect(survivor.createFor).toHaveBeenCalledTimes(1);
  });

  it('shares events between workers, each handled once', async () => {
    const first = await worker({ prefetchCount: 1 });
    const second = await worker({ prefetchCount: 1 });
    const events = Array.from({ length: 20 }, orderPlaced);

    await Promise.all(events.map(publish));

    await eventually(async () => (await shipmentCount()) === 20);
    expect(first.createFor.mock.calls.length).toBeGreaterThan(0);
    expect(second.createFor.mock.calls.length).toBeGreaterThan(0);
    expect(first.createFor.mock.calls.length + second.createFor.mock.calls.length).toBe(20);
  });

  it('finishes the event in flight when it shuts down', async () => {
    const stopping = await worker();
    const service = stopping.app.get(ShipmentsService);
    stopping.createFor.mockImplementation(async (event) => {
      await new Promise((resolve) => setTimeout(resolve, 1_000)); // a slow handler
      return ShipmentsService.prototype.createFor.call(service, event);
    });
    const event = orderPlaced();

    await publish(event);
    await eventually(async () => stopping.createFor.mock.calls.length === 1);
    await stopping.app.close(); // waits for the handler, which commits and acknowledges
    workers.splice(workers.indexOf(stopping.app), 1);

    const [shipment] = await db.select().from(shipments).where(eq(shipments.orderId, event.payload.orderId));
    expect(shipment).toBeDefined();
    const next = await worker();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(next.createFor).not.toHaveBeenCalled(); // nothing was requeued
  });

  it('requeues the event in flight when the grace period runs out', async () => {
    const stopping = await worker({ gracePeriod: 200 });
    stopping.createFor.mockReturnValue(new Promise(() => {})); // outlives the grace period
    const event = orderPlaced();

    await publish(event);
    await eventually(async () => stopping.createFor.mock.calls.length === 1);
    await stopping.app.close();
    workers.splice(workers.indexOf(stopping.app), 1);
    const next = await worker();

    await eventually(async () => (await shipmentCount()) === 1);
    expect(next.createFor).toHaveBeenCalledTimes(1);
  });
});

```

- **崩溃测试**阻塞了第一个工作者的**处理程序**，因此事件处于正在处理且未确认的状态，然后切断其连接。**传输器**将事件交给第二个工作者，后者创建了发货。
- **关闭测试**以正在处理事件的方式关闭一个工作者：在宽限期内，**处理程序**完成且没有重新投递；超过宽限期后，事件会发送到下一个工作者。

端到端测试运行两个**服务**。订单**服务**通过**客户端代理**到达**传输器**，因此测试可以单独移除 RabbitMQ：

```typescript title="apps/orders/test/orders.e2e-spec.ts"
import { fileURLToPath } from 'node:url';
import { getDrizzleToken } from '@nestjs/drizzle';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import { Outbox, OutboxRelay } from '@nestjs/outbox';
import { NodeAdapter, type NestNodeApplication } from '@nestjs/platform-node';
import { Test } from '@nestjs/testing';
import { FULFILLMENT_EVENTS_QUEUE, fulfillmentEventsQueueOptions } from '@app/contracts';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { shipments } from '../../fulfillment/src/database/schema.js';
import {
  brokerProxy,
  eventually,
  fulfillmentDatabase,
  purgeQueues,
  rabbitmqUrl,
  startWorker,
} from '../../fulfillment/test/support.js';
import { AppModule, FULFILLMENT_EVENTS } from '../src/app.module.js';
import { orders } from '../src/database/schema.js';

const ordersDatabaseUrl = process.env.TEST_ORDERS_DATABASE_URL;

describe.skipIf(!rabbitmqUrl || !ordersDatabaseUrl)('Orders to fulfillment (e2e)', () => {
  const ordersDb = drizzle({ client: new Pool({ connectionString: ordersDatabaseUrl }) });
  let fulfillmentDb: Awaited<ReturnType<typeof fulfillmentDatabase>>;
  let proxy: Awaited<ReturnType<typeof brokerProxy>>;
  let app: NestNodeApplication;
  let worker: NestNodeApplication | undefined;

  beforeAll(async () => {
    await migrate(ordersDb, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
    fulfillmentDb = await fulfillmentDatabase();
    await purgeQueues();
    await ordersDb.execute(sql`TRUNCATE orders`);
    await fulfillmentDb.execute(sql`TRUNCATE shipments`);
    // The orders service reaches the broker through a proxy the tests can cut.
    proxy = await brokerProxy();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDrizzleToken())
      .useValue(ordersDb) // the outbox's store runs on it too
      .overrideProvider(FULFILLMENT_EVENTS)
      .useValue(
        ClientProxyFactory.create({
          transport: Transport.RMQ,
          options: {
            urls: [proxy.url],
            queue: FULFILLMENT_EVENTS_QUEUE,
            queueOptions: fulfillmentEventsQueueOptions,
            persistent: true,
          },
        }),
      )
      .compile();
    app = moduleRef.createNestApplication<NestNodeApplication>(new NodeAdapter(), { logger: process.env.TEST_LOGS ? undefined : false });
    await app.init();
    worker = await startWorker();
  });

  afterAll(async () => {
    await worker?.close();
    await app.close(); // closes the orders pool too
    await proxy.close();
    await fulfillmentDb.$client.end();
  });

  const placeOrder = () =>
    app.inject({
      method: 'POST',
      url: '/orders',
      payload: {
        customerEmail: 'ada@example.com',
        shippingAddress: '1 Analytical Way, London',
        items: [{ sku: 'KB-01', quantity: 2 }],
      },
    });
  const shipmentCount = async () => (await fulfillmentDb.select({ orderId: shipments.orderId }).from(shipments)).length;

  it('places an order, and the fulfillment service ships it', async () => {
    const placed = await placeOrder();
    expect(placed.statusCode).toBe(201);
    const { id } = placed.json<{ id: string }>();

    const shipment = await eventually(async () => {
      const res = await app.inject({ method: 'GET', url: `/orders/${id}/shipment` });
      return res.statusCode === 200 && res.json();
    });
    expect(shipment).toMatchObject({ orderId: id, status: 'preparing', items: [{ sku: 'KB-01', quantity: 2 }] });
  });

  it('publishes nothing when the order rolls back', async () => {
    const before = await shipmentCount();
    const outbox = app.get(Outbox);
    const add = outbox.add.bind(outbox);
    vi.spyOn(outbox, 'add').mockImplementationOnce(async (tx, messages) => {
      await add(tx, messages); // the message is written...
      throw new Error('Connection terminated unexpectedly'); // ...then the transaction fails
    });

    expect((await placeOrder()).statusCode).toBe(500);
    expect(await app.get(OutboxRelay).stats()).toMatchObject({ pending: 0 });

    // The next order goes out alone: the rolled-back one never existed.
    expect((await placeOrder()).statusCode).toBe(201);
    await eventually(async () => (await shipmentCount()) === before + 1);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    expect(await shipmentCount()).toBe(before + 1);
    expect(await ordersDb.$count(orders)).toBe(before + 1);
  });

  it('accepts orders while the broker is down, and publishes them once it is back', async () => {
    const before = await shipmentCount();
    await proxy.close();

    const placed = await placeOrder();
    expect(placed.statusCode).toBe(201);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    expect(await shipmentCount()).toBe(before);
    expect(await app.get(OutboxRelay).stats()).toMatchObject({ pending: 1 });

    await proxy.open();
    await eventually(async () => (await shipmentCount()) === before + 1, 40_000);
    expect(await app.get(OutboxRelay).stats()).toMatchObject({ pending: 0, deadLetters: 0 });
  });

  it('answers 503 when the fulfillment service does not answer in time', async () => {
    const { id } = (await placeOrder()).json<{ id: string }>();
    await worker!.close();
    worker = undefined;

    const started = Date.now();
    const res = await app.inject({ method: 'GET', url: `/orders/${id}/shipment` });

    expect(res.statusCode).toBe(503);
    expect(Date.now() - started).toBeGreaterThanOrEqual(2_900); // the request's timeout
  });
});

```

回滚测试允许 `outbox.add()` 写入事件，然后失败事务，就像丢失数据库连接时会发生的那样：订单及其事件一起消失，下一个订单是唯一发货的。停机测试放置一个**传输器**不可达的订单，检查在事件在出库中等待期间没有发货，并且在**传输器**恢复后发货。

创建测试数据库和虚拟主机一次，然后运行这两个文件：

```bash
$ docker exec shop-db psql -U postgres -c "CREATE DATABASE orders_test" -c "CREATE DATABASE fulfillment_test"
$ docker exec rabbitmq rabbitmqctl add_vhost test
$ docker exec rabbitmq rabbitmqctl set_permissions -p test guest ".*" ".*" ".*"
$ export TEST_RABBITMQ_URL=amqp://guest:guest@localhost:5672/test
$ export TEST_ORDERS_DATABASE_URL=postgres://postgres:shop@localhost:5432/orders_test
$ export TEST_FULFILLMENT_DATABASE_URL=postgres://postgres:shop@localhost:5432/fulfillment_test
$ npm run test:e2e

 Test Files  2 passed (2)
      Tests  12 passed (12)

```

将 `createFor()` 中的插入替换为 `SELECT` 接着是 `INSERT`，第一个测试失败：它会保留事件的两个副本直到两个都到达，因为两个实例会运行它们，第二个插入会触发主键冲突。移除 `@UseInterceptors(RmqAckInterceptor)`，无效消息永远不会进入死信队列：它会一直未确认地保留在工作者中，直到工作者停止。

#### 生产检查清单

JWT 教程中的 [checklist](/tutorials/rest-api-jwt-authentication#production-checklist) 适用于订单**服务**。对于**服务**和消息代理：

- **将**迁移**作为发布步骤运行**，针对每个**服务**在其自己的数据库上，以及订单**服务**中的 outbox 配合 `npx @nestjs/outbox migrate`：由于 `NODE_ENV=production`，outbox 存储在启动时不会迁移。
- **将 RabbitMQ 作为一个包含三个节点的集群运行**。一个法定人数队列将其消息复制到多数节点，并在一个节点宕机时保持工作。在 `urls` 中为**服务**提供每个节点的 URL，以便在某个节点不可用时连接到另一个节点。
- **为每个**服务**设置一个独立的代理用户**。镜像中的 `guest` 用户拥有所有人都知道的密码。为每个**服务**创建一个用户，仅授予其使用的队列的权限，并通过网络连接 `amqps://`。
- **监控死信队列**。`fulfillment.events.dead` 中的消息是一个没有发货的订单。监控其长度，读取 `x-error` 和 `x-death` 头部，并在问题修复后将消息移回。
- **监控队列深度和 outbox 延迟**。不断增长的 `fulfillment.events` 意味着工作者跟不上：增加实例。来自 `OutboxRelay.stats()` 的不断增长的 `lagMs` 意味着订单**服务**无法发布（参见 [Run several instances](/reliability/outbox#run-several-instances)）。
- **版本化契约**。在滚动部署期间，新旧版本的两个**服务**会交换消息。将字段添加为可选，仅在没有**生产者**发送它们时移除，并为破坏性变更提供新主题，例如 `order.placed.v2`。
- **将 `gracePeriod` 的大小低于平台的关闭超时**，并确保处理程序远低于该超时。
- **为生产环境设置独立的 Observe 密钥对**，从项目的**API Keys** 页面获取，并在平台上的每个**服务**的环境变量中设置 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET`：`start:prod` 不会加载 `.env`。在两个**服务**中使用 [NestJS Observe](/observability/overview) 时，RabbitMQ **传输器**会在每条消息的头部携带跟踪 ID，因此 `GET /orders/:id/shipment` 和履约**服务**的响应显示为单个跟踪（参见 [Distributed tracing](/observability/distributed-tracing#tcp-redis-nats-and-other-microservice-transports)）。

#### 下一步

- 添加登录功能，仅向客户显示他们自己的订单：[Build a REST API with JWT authentication](/tutorials/rest-api-jwt-authentication#sign-users-in-with-jwts)。
- 在订单**服务**中处理库存和支付：[Build an e-commerce backend](/tutorials/ecommerce-backend) 和 [Accept payments with webhooks](/tutorials/payments-webhooks)。
- 使用交换机和 `wildcards` 将事件路由到多个**服务**，或使用 `RmqRecordBuilder` 设置消息选项：[RabbitMQ](/microservices/rabbitmq)。
- 也在进程中处理事件，在自己的数据库中进行重试和死信处理：[Outbox](/reliability/outbox#handle-orderplaced-in-process)。
- 在**微服务**中验证负载、保护处理程序并映射错误：[Pipes](/microservices/pipes)、[Guards](/microservices/guards) 和 [Exception filters](/microservices/exception-filters)。