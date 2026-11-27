<!-- 此文件从 content/reliability/resilience.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:48:55.146Z -->
<!-- 源文件: content/reliability/resilience.md -->
<!-- 源哈希: 6e644269b2b93baf86e4e9643c49ead1 -->

### 弹性

`@nestjs/resilience` 作为装饰器，为控制器、解析器、消息处理器和网关添加了重试、超时、断路器、舱壁和回退功能。

迟早，任何调用其他系统的应用程序都会遇到响应缓慢或宕机的系统。如果没有计划，一个缓慢的依赖会占用您的请求处理器，您的客户端会等待自身的超时触发，并且来自每一层的重试会给本已挣扎的服务增加更多负载。

`@nestjs/resilience` 为您提供了常用的装饰器工具：**retry**、**timeout**、**circuit breaker**、**bulkhead** 和 **fallback**。它们应用于应用程序的**入口点**，即控制器、GraphQL 解析器、微服务消息处理器和 WebSocket 网关。对于服务内部的代码，可以使用策略对象获得相同的设置。单个全局拦截器应用这些装饰器，因此它们在每种传输上表现一致，并且每次失败都会变成该传输的原生错误。例如，在 HTTP 上，超时会返回 `504 Gateway Timeout`，而断路器开启会返回 `503 Service Unavailable`，并带有 `Retry-After` 头部。

在本教程中，我们将增强一个在线猫粮和用品商店的订单 API。结账时会向运输承运商请求报价，而承运商的报价 API 即使在最好的情况下也比较慢，并且偶尔会宕机。到最后，一个缓慢的承运商最多只使结账花费大约三秒。一旦知道承运商宕机，结账将完全停止等待它：客户看到的是固定费率的运费而不是错误，并且一个后台任务会停止调用承运商直到其恢复。

#### 前提条件

本教程假设一个导出 `OrdersService` 的 `OrdersModule`。该服务需要以下方法：`findOne(id)`（对于未知 ID 会抛出 `NotFoundException`）、`findAll()`、`update(id, changes)` 和 `exportCsv()`。订单如下所示：

```typescript title="orders/order.ts"
export interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  total: number;
  status: 'pending' | 'paid' | 'shipped';
}

export function subtotal(order: Order): number {
  return order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

```

安装包：

```bash
$ npm i --save @nestjs/resilience

```

[Retry a POST safely](/reliability/resilience#retry-a-post-safely) 也使用了 `@nestjs/idempotency`（参见 [Idempotency keys](/reliability/idempotency)）。

#### 注册模块

将 `ResilienceModule` 导入到根模块中。配置字段默认值和一个名为 `carrier` 的预设，该预设描述了应用程序应如何处理承运商：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { ResilienceModule } from '@nestjs/resilience';
import { OrdersModule } from './orders/orders.module.js';
import { ShippingModule } from './shipping/shipping.module.js';

@Module({
  imports: [
    ResilienceModule.forRoot({
      defaults: {
        timeout: '5s',
        retry: { attempts: 3, backoff: { delay: '200ms', maxDelay: '2s' } },
      },
      presets: {
        carrier: {
          timeout: '2s',
          retry: { attempts: 2 },
          circuitBreaker: { failureRateThreshold: 50, minimumCalls: 10, openDuration: '30s' },
        },
      },
    }),
    OrdersModule,
    ShippingModule,
  ],
})
export class AppModule {}

```

这两个选项执行不同的任务：

- `defaults` 会填充装饰器或预设启用的任何阶段的字段。默认值本身不会启用任何阶段。在这里，重试首先等待 0 到 200 毫秒之间的随机时间（`delay`），然后每次加倍，最多到 400 毫秒，直到 2 秒（`maxDelay`）。一个裸露的 `@Timeout()` 表示 5 秒。
- `presets` 包含命名阶段集，通常每个依赖一个。`carrier` 预设为每次尝试提供 2 秒，最多尝试 2 次，并添加了一个断路器。该断路器**在名称 `carrier` 下被所有使用该预设的路由、处理器和服务共享**。承运商是一个依赖项，因此它获得一个断路器。

所有时间值选项都接受毫秒或诸如 `'200ms'`、`'2s'` 或 `'30s'` 这样的字符串。

该模块是全局的，因此只需在根模块中导入一次。它注册了一个应用范围的拦截器，除了错误映射外，对没有弹性装饰器的处理器不执行任何操作。它在启动时检查其配置：未知预设名称、无效的持续时间或数字（例如未设置的环境变量的 `NaN`）、缺少回退方法或在两种不同方式中配置的断路器名称都会导致启动失败，而不是第一个请求失败。使用 `ResilienceModule.forRootAsync()` 从配置构建选项。

#### 为报价路由设置时间预算

从承运商的客户端开始。每个方法都接收一个 `AbortSignal` 并将其传递给 `fetch()`：

```typescript title="shipping/carrier.client.ts"
import { Injectable } from '@nestjs/common';
import type { Order } from '../orders/order.js';

export interface ShippingQuote {
  service: string;
  price: number;
  estimatedDays: number;
}

export interface Shipment {
  id: string;
  reference: string;
  trackingNumber: string;
}

export class CarrierError extends Error {
  constructor(readonly status: number) {
    super(`The carrier answered with status ${status}`);
  }
}

@Injectable()
export class CarrierClient {
  private readonly baseUrl = process.env.CARRIER_URL ?? 'https://api.carrier.example.com';

  getQuotes(order: Order, signal: AbortSignal): Promise<ShippingQuote[]> {
    return this.post('/v2/quotes', { reference: order.id, items: order.items }, signal);
  }

  /** The carrier returns the existing shipment when it has seen the reference before. */
  createShipment(order: Order, signal: AbortSignal): Promise<Shipment> {
    return this.post('/v2/shipments', { reference: order.id, items: order.items }, signal);
  }

  private async post<T>(path: string, body: unknown, signal: AbortSignal): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      throw new CarrierError(response.status);
    }
    return (await response.json()) as T;
  }
}

```

该服务将信号传递下去。它还有一个固定费率列表和一个预订方法，如下文的断路器和重试 POST 使用：

```typescript title="shipping/shipping.service.ts"
import { Injectable } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service.js';
import { CarrierClient, type Shipment, type ShippingQuote } from './carrier.client.js';

@Injectable()
export class ShippingService {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly carrierClient: CarrierClient,
  ) {}

  async getQuotes(orderId: string, signal: AbortSignal): Promise<ShippingQuote[]> {
    const order = await this.ordersService.findOne(orderId);
    return this.carrierClient.getQuotes(order, signal);
  }

  flatRateQuotes(): ShippingQuote[] {
    return [{ service: 'flat-rate', price: 4.99, estimatedDays: 5 }];
  }

  async createShipment(orderId: string, signal: AbortSignal): Promise<Shipment> {
    const order = await this.ordersService.findOne(orderId);
    return this.carrierClient.createShipment(order, signal);
  }
}

```

现在是路由。`@Resilience('carrier')` 应用了预设，而 `@Signal()` 注入了当前尝试的 `AbortSignal`：

```typescript title="shipping/shipping.controller.ts"
import { Controller, Get, Query } from '@nestjs/common';
import { Resilience, Signal, Timeout } from '@nestjs/resilience';
import { ShippingService } from './shipping.service.js';

@Controller('shipping')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Get('quotes')
  @Resilience('carrier')
  @Timeout('1.5s')
  getQuotes(@Query('orderId') orderId: string, @Signal() signal: AbortSignal) {
    return this.shippingService.getQuotes(orderId, signal);
  }
}

```

将 `CarrierClient` 和 `ShippingService` 注册为提供者，将 `ShippingController` 注册为导入了 `OrdersModule` 的 `ShippingModule` 的控制器。

结账不能等待太久，因此 `@Timeout('1.5s')` 为此路由设置了比预设更严格的预算。设置是**逐阶段解析**的：处理器上的装饰器在其自身阶段上优先于预设，但预设仍然提供重试和断路器。一个裸露的 `@Timeout()` 将采用预设的 2 秒，并且仅在没有预设或类级别 `@Timeout()` 设置持续时间的地方回退到 `defaults.timeout`。

当一次尝试超时时，会发生三件事：

1. 尝试以 `ResilienceTimeoutError` 被拒绝。
2. 信号以相同的错误被中止。`fetch()` 会拒绝并关闭连接，因此不会有任何东西持续等待一个无人阅读的答案。取消是协作性的：忽略信号的代码会继续在后台运行，其结果将被丢弃。
3. 由于 `GET` 是一个安全方法，预设的重试会进行第二次尝试。只有管道、内部拦截器和处理器会再次运行。守卫和中间件每次请求只运行一次。

如果第二次尝试也超时，客户端会收到 `504`：

```json
{
  "statusCode": 504,
  "error": "Gateway Timeout",
  "message": "The operation timed out",
  "code": "TIMEOUT"
}

```

超时是**每个尝试**应用的，因此一个挂起的承运商会使此路由花费大约 3.2 秒：两次 1.5 秒的尝试加上最多 200 毫秒的回退时间。状态码是 504 而不是 408 是故意的。408 声称是**客户端**发送请求太慢，一些客户端和代理会自动重复 408，即使对于 `POST` 请求也是如此。

客户端错误不是失败。对未知订单的请求在调用承运商之前就会抛出 `NotFoundException`。它返回 404，既不被重试也不被断路器计数。

> info **提示** 无法将信号作为参数的代码可以注入 `ResilienceContext` 并读取其 `signal` 和 `attempt`。它从 `AsyncLocalStorage` 读取当前尝试，因此它在处理器调用的任何服务、任何传输上都有效。在尝试内部使用的策略对象也会继承其信号，因此路由的超时也会停止该策略的重试。

#### 使用断路器快速失败

预设的断路器记录了每次尝试的结果。当它观察到至少有 `minimumCalls` (10) 次调用，并且其中至少有 `failureRateThreshold` (50%) 失败时，`carrier` 断路器就会打开。默认情况下，它查看最近的 20 次调用。每个错误都算作失败，包括超时，但客户端错误和其他策略的拒绝除外。客户端错误是 4xx `HttpException`，或任何具有 4xx `status` 或 `statusCode` 属性的错误。这涵盖了 `CarrierError`：当承运商对格式错误的请求响应 `422` 时，它不是宕机状态，因此断路器会忽略该错误，重试也不会重复它。承运商返回 `408` 或 `429` 是例外，因为它意味着承运商在抵制，因此它算作 `5xx`。带有这些状态的 `HttpException` 仍然是客户端错误：处理程序将其抛出以响应其自身的调用者，这并不能说明承运商的状况。要更改计数的条件，请在断路器选项中传入一个 `recordIf` 函数。

当断路器处于 **打开** 状态时，调用会立即失败，根本不会调用承运商。客户端会收到一个带有 `503` 响应和 `Retry-After` 头的响应：这是断路器允许探测调用通过的秒数。重试包裹了断路器，因此拒绝永远不会被重试。

在 `openDuration` (30 s) 之后，断路器处于 **半开** 状态。它允许一个探测调用通过（参见 `halfOpenMaxCalls`）。如果探测成功，断路器关闭并以一个空窗口重新开始。如果探测失败，断路器再次打开 30 秒。断路器不使用计时器来实现这一点。它在下一次调用时检查状态。

503 是正确的，但结账可以做得更好。添加一个回退机制，在已知承运商宕机时提供固定费率报价（从 `@nestjs/resilience` 导入 `Fallback` 和 `CircuitOpenError`）：

```typescript title="shipping/shipping.controller.ts"
@Get('quotes')
@Resilience('carrier')
@Timeout('1.5s')
@Fallback('flatRateQuotes', {
  handleIf: (error) => error instanceof CircuitOpenError,
})
getQuotes(@Query('orderId') orderId: string, @Signal() signal: AbortSignal) {
  return this.shippingService.getQuotes(orderId, signal);
}

flatRateQuotes() {
  return this.shippingService.flatRateQuotes();
}

```

`@Fallback()` 接受同一类上的方法名称或一个函数。TypeScript 会检查该类是否具有该名称的方法。回退机制会传入错误和 `ExecutionContext` 调用，它返回的内容将成为响应。它可以是一个值、一个 `Promise` 或一个 `Observable`。回退是最外层的阶段，因此它也会看到断路器的拒绝。

默认情况下，回退机制会替换所有错误，但客户端错误除外。`handleIf` 选项可以缩小范围。固定费率对存储来说在处理重型包裹（如垃圾袋）时会产生费用，因此这里它们是最后的手段：只有当断路器指示承运商宕机时才会提供，即使单个缓慢的响应也会返回 504。

> info **提示** 要从自己的代码中查看断路器，请注入 `ResilienceService` 并调用 `circuitBreaker('carrier')`。断路器暴露了 `state` 和 `stats`，您可以使用 `trip()` 和 `reset()` 强制其打开或关闭。

#### 使用舱壁限制并发 CSV 导出

后台办公室将所有订单下载为 CSV 文件。构建文件会读取每个订单，对数据库和 CPU 都是沉重的操作。同时进行两次导出是没问题的，但二十次会拖慢所有人的结账速度。舱壁限制了同时运行的数量：

```typescript title="orders/orders.controller.ts"
import { Controller, Get, Header } from '@nestjs/common';
import { Bulkhead } from '@nestjs/resilience';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('export')
  @Header('Content-Type', 'text/csv')
  @Bulkhead({ maxConcurrent: 2, maxQueue: 3, queueTimeout: '10s' })
  export() {
    return this.ordersService.exportCsv();
  }
}

```

同时运行两次导出。最多有另外三次等待一个槽位，每次最长等待 10 秒。第六个请求会立即收到 `503`，等待的请求在 10 秒后也会收到：

```json
{
  "statusCode": 503,
  "error": "Service Unavailable",
  "message": "Server is at capacity",
  "code": "BULKHEAD_FULL"
}

```

这个 503 没有 `Retry-After` 头部，因为没有人知道何时会释放一个槽位。状态是 503 而不是 429，因为 429 会责怪客户端的请求速率，而完整的舱壁意味着服务器对所有人来说都已达到容量。

一个槽位会一直被占用，直到处理程序完成，或者直到路由的超时放弃该尝试。忽略其信号的处理程序将继续在后台运行，超出舱壁计数范围，这是将信号传递给每次调用的另一个原因。没有名称的舱壁属于其处理程序，并以处理程序名称注册。要读取其负载，请注入 `ResilienceService` 并查看 `bulkhead('OrdersController.export')`，其中包含 `active` 和 `queued` 计数。给舱壁设置一个 `name`，以便在多个处理程序之间共享一个槽位池。

#### 安全地重试 POST 请求

到目前为止，重试只发生在 `GET` 上。这是故意的。在 HTTP 中，重试仅适用于安全方法 `GET`、`HEAD` 和 `OPTIONS`，在 GraphQL 中仅适用于查询。两次运行 `POST` 可能会创建两个发货单，而包裹无法知道这是否无害。因此，预设的重试在 `POST` 上被简单跳过。直接放置在 `POST` 处理程序上的 `@Retry()` 装饰器也会被跳过，并且引导程序会发出警告：

```bash
WARN [ResilienceModule] @Retry() on ShippingController.createShipment() is inactive: it only re-runs safe operations (GET, HEAD, OPTIONS, GraphQL queries). If the handler is safe to repeat, use @Retry({ idempotent: true }).

```

预订发货单是安全重复的，因为承运商通过 `reference`（即订单 ID）来去重发货单。这也对另一个原因很重要：一个超时预订在承运商端可能仍然已通过，因此重试无论如何都必须是安全的。在 `@Retry()` 上设置 `idempotent: true` 是表明在单个请求内运行处理程序两次是没问题的做法：

```typescript title="shipping/shipping.controller.ts"
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Idempotent } from '@nestjs/idempotency';
import { CircuitOpenError, Fallback, Resilience, Retry, Signal, Timeout } from '@nestjs/resilience';
import { ShippingService } from './shipping.service.js';

@Controller('shipping')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Get('quotes')
  @Resilience('carrier')
  @Timeout('1.5s')
  @Fallback('flatRateQuotes', {
    handleIf: (error) => error instanceof CircuitOpenError,
  })
  getQuotes(@Query('orderId') orderId: string, @Signal() signal: AbortSignal) {
    return this.shippingService.getQuotes(orderId, signal);
  }

  flatRateQuotes() {
    return this.shippingService.flatRateQuotes();
  }

  @Post('shipments')
  @Idempotent()
  @Resilience('carrier')
  @Retry({ idempotent: true })
  createShipment(@Body('orderId') orderId: string, @Signal() signal: AbortSignal) {
    return this.shippingService.createShipment(orderId, signal);
  }
}

```

处理程序级别的 `@Retry()` 会按字段合并到预设的重试中。您设置的字段优先，其余的来自预设，然后来自 `defaults.retry`。因此，此路由保留了预设的 2 次尝试，并仅添加了 `idempotent: true`。预设的 2 秒超时和断路器仍然适用。只有装饰器可以声明 `idempotent: true`：预设无法声明所有使用它的处理程序是安全的。

`idempotent: true` 和 `@Idempotent()` 解决了两个不同的问题：

- `idempotent: true` 允许**服务器**在单个请求内重新运行处理程序。
- `@Idempotent()` 去重**客户端**对整个请求的重试。当客户端使用相同的 `Idempotency-Key` 头部重复请求时，它会收到存储的响应，处理程序不会再次运行。

在 `ResilienceModule` **之前**注册 `IdempotencyModule`：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { IdempotencyModule } from '@nestjs/idempotency';
import { ResilienceModule } from '@nestjs/resilience';
import { OrdersModule } from './orders/orders.module.js';
import { ShippingModule } from './shipping/shipping.module.js';

@Module({
  imports: [
    // Import order matters: the first global interceptor runs outermost.
    IdempotencyModule.forRoot({}),
    ResilienceModule.forRoot({
      defaults: {
        timeout: '5s',
        retry: { attempts: 3, backoff: { delay: '200ms', maxDelay: '2s' } },
      },
      presets: {
        carrier: {
          timeout: '2s',
          retry: { attempts: 2 },
          circuitBreaker: { failureRateThreshold: 50, minimumCalls: 10, openDuration: '30s' },
        },
      },
    }),
    OrdersModule,
    ShippingModule,
  ],
})
export class AppModule {}

```

两个 **模块** 都注册了一个全局 **拦截器**，导入顺序靠前的 **模块** 运行最外层。使用此顺序：

- 重放或对于仍在进行中的键的 `409`，在任何重试、断路器或超时运行之前得到响应。一个已成功的预订即使在断路器打开时也会重放。
- 一个 **请求** 的所有重试都在单个声明的键下发生。
- 存储的 **响应** 是最终结果，在重试和任何回退之后。
- `503` 或 `504` 是一个 5xx **响应**，因此键被释放，客户端可以稍后使用相同的键再次尝试。

在 `504` 上释放键有一个陷阱。键在超时响应时立即释放，但超时运行可能仍在进行中，或者可能已经到达 **传输器**，因此使用相同键的重试可能会与它重叠。这就是为什么副作用必须在下游安全重复，因为 **传输器** 使用 `reference` 来执行它。像 `createShipment()` 那样传递信号可以更早地停止本地工作。

#### 在 **服务** 内部使用相同的策略

待处理的订单在其 `total` 中包含运输估算。每 15 分钟，一个后台 **任务** 都会重新报价它们。该 **任务** 不是入口点，因此它使用一个**策略对象**，您从 `ResilienceService` 获取：

```typescript title="shipping/repricing.service.ts"
import { Injectable, Logger } from '@nestjs/common';
import { CircuitOpenError, ResilienceService, type ResiliencePolicy } from '@nestjs/resilience';
import { subtotal } from '../orders/order.js';
import { OrdersService } from '../orders/orders.service.js';
import { CarrierClient } from './carrier.client.js';

@Injectable()
export class RepricingService {
  private readonly logger = new Logger(RepricingService.name);
  private readonly resiliencePolicy: ResiliencePolicy;

  constructor(
    resilience: ResilienceService,
    private readonly ordersService: OrdersService,
    private readonly carrierClient: CarrierClient,
  ) {
    this.resiliencePolicy = resilience.preset('carrier');
  }

  /** Refreshes the shipping part of every pending order's total. */
  async repricePendingOrders(): Promise<number> {
    const pending = (await this.ordersService.findAll()).filter((order) => order.status === 'pending');
    let repriced = 0;
    for (const order of pending) {
      try {
        const quotes = await this.resiliencePolicy.execute(
          ({ signal }) => this.carrierClient.getQuotes(order, signal),
          { source: 'RepricingService.repricePendingOrders' },
        );
        const shipping = Math.min(...quotes.map((quote) => quote.price));
        await this.ordersService.update(order.id, { total: subtotal(order) + shipping });
        repriced++;
      } catch (error) {
        if (error instanceof CircuitOpenError) {
          this.logger.warn(`The carrier is unavailable, stopping after ${repriced} of ${pending.length} orders`);
          break;
        }
        this.logger.error(`Could not reprice order ${order.id}`, (error as Error).stack);
      }
    }
    return repriced;
  }
}

```

将 `RepricingService` 添加到 `ShippingModule` 的 **提供者** 中，并从计划 **任务** 中调用 `repricePendingOrders()`（参见 [Task scheduling](/techniques/task-scheduling#声明式-cron-任务)）。

`resilience.preset('carrier')` 以一个策略的形式返回预设。其断路器是路由使用的**相同实例**，因此 **任务** 和结账在两个方向上共享它们关于 **传输器** 的了解：

- 当断路器打开时，**任务** 立即获得一个 `CircuitOpenError` 并停止，而不是对每个订单花费超时时间。
- 如果 **任务** 是第一个发现 **传输器** 失败的，它的失败会打开断路器，结账在不等待超时的情况下提供固定费率。

有几点与入口点不同：

- `execute()` 将尝试的 `signal` 和 `attempt` **请求** 传递给您的函数。`source` 选项标记此调用发出的事件。
- 一个正常返回但结果不佳的调用，例如一个使用 503 `Response` 解析的 `fetch()`，不是一个错误，因此 `retryIf` 永远不会看到它。在 `create()` 的 `retry` 选项中或在预设中设置 `retryOnResult(result, attempt)` 以重试它。入口点忽略它，而 `@Retry()` 没有此选项。
- 策略对象没有 `GET` 或 `POST` 可查看，因此预设的重试**始终**适用。仅包装安全的重复调用（报价是安全的）。
- 路由的 `@Timeout('1.5s')` 属于该路由。**任务** 获得预设的 2 秒。
- 仅创建一次策略，例如在构造函数中，而不是在每次调用时。对于不是预设的选项，请使用 `resilience.create(options, name)`。

为什么不将 `@Retry()` 放在 `repricePendingOrders()` 上？弹性 **装饰器** 是全局 **拦截器** 读取的元数据，而 **拦截器** 只围绕入口点运行。在 **提供者** 方法上，**装饰器** 不会做任何事情，因此引导会发出警告：

```bash
WARN [ResilienceModule] Resilience decorators on RepricingService.repricePendingOrders() have no effect: RepricingService is not a controller, resolver or gateway. They apply to entrypoints only. Inside services, use a policy object (ResilienceService.preset() or create(), or new RetryPolicy() etc.).

```

这是一个故意的选择，原因有三：

- 包装任意 **提供者** 方法将遗漏引导后 **Nest** 创建的请求作用域和瞬态实例。
- 隐藏在 **服务** 内部深处的重试会成倍增加。一个尝试 3 次的路由，调用一个尝试 3 次的 **服务**，调用一个尝试 3 次的 SDK，会向一个本已挣扎的依赖发送多达 27 个 **请求**。
- 策略对象在调用站点可见，您可以看到它做了什么。

> info **提示** 没有 **装饰器** 的入口点仍然映射弹性错误。如果一个 **服务** 在普通路由中抛出 `CircuitOpenError`，客户端将获得一个带有 `Retry-After` 的 `503`。在 **模块** 选项中设置 `mapErrors: false` 以关闭此功能。

#### 其他 **传输器**

相同的 **装饰器** 也适用于 **微服务** 处理程序。当仓库 **服务** 重新打包订单时，它通过 TCP 请求报价：

```typescript title="shipping/shipping.handlers.ts"
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Resilience, Retry, Signal } from '@nestjs/resilience';
import { ShippingService } from './shipping.service.js';

@Controller()
export class ShippingHandlers {
  constructor(private readonly shippingService: ShippingService) {}

  @MessagePattern('shipping.quotes')
  @Resilience('carrier')
  @Retry({ attempts: 3 })
  getQuotes(@Payload() data: { orderId: string }, @Signal() signal: AbortSignal) {
    return this.shippingService.getQuotes(data.orderId, signal);
  }
}

```

将 `ShippingHandlers` 添加到 `controllers` 的 `ShippingModule` 中。

一个消息没有 `GET` 或 `POST` 来指示是否安全重复，因此在消息、事件和 WebSocket 处理程序中，只有处理程序本身的 `@Retry()` 才会开启重试。预设的重试，或没有 `idempotent: true` 的类级别 `@Retry()`，本身不适用，因此不能使用 `carrier` 预设来静默地重新运行具有副作用的处理程序。在这里，处理程序的 `@Retry()` 启用，并且其 `attempts: 3` 将预设的 2 次尝试增加到 3 次。仅在安全运行两次的处理程序上使用它。错误作为带有结构化有效载荷的 `RpcException` 传给调用者：

```json
{ "status": "error", "code": "CIRCUIT_OPEN", "statusCode": 503, "message": "Service temporarily unavailable", "retryAfter": 30 }

```

超时具有 `"code": "TIMEOUT"` 和 `"statusCode": 504`，但没有 `retryAfter`。在**混合应用程序**中，使用 `inheritAppConfig: true` 连接 **微服务**，否则全局 **拦截器** 无法到达其处理程序（参见 [Hybrid application](/faq/hybrid-application#共享配置)）：

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.connectMicroservice<MicroserviceOptions>(
    { transport: Transport.TCP, options: { port: 3001 } },
    { inheritAppConfig: true },
  );
  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

GraphQL **解析器** 也是如此。如果您的应用程序提供 GraphQL，请将 **解析器** 添加到 `ShippingModule` 的 **提供者** 中：

```typescript title="shipping/shipping.resolver.ts"
import { Args, Field, Float, Int, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { Resilience, Signal, Timeout } from '@nestjs/resilience';
import { ShippingService } from './shipping.service.js';

@ObjectType('ShippingQuote')
export class ShippingQuoteModel {
  @Field() service: string;
  @Field(() => Float) price: number;
  @Field(() => Int) estimatedDays: number;
}

@Resolver(() => ShippingQuoteModel)
export class ShippingResolver {
  constructor(private readonly shippingService: ShippingService) {}

  @Query(() => [ShippingQuoteModel], { nullable: true })
  @Resilience('carrier')
  @Timeout('1.5s')
  shippingQuotes(@Args('orderId') orderId: string, @Signal() signal: AbortSignal) {
    return this.shippingService.getQuotes(orderId, signal);
  }
}

```

**查询** 会被重试，而 **变更** 需要 `idempotent: true`，就像 `POST` **请求** 一样。失败只失败其自身的字段。**响应** 仍然是状态 200，并且错误在 `extensions` 中携带代码：

```graphql
{ shippingQuotes(orderId: "1001") { service price } }

```

```json
{
  "errors": [
    {
      "message": "The operation timed out",
      "locations": [{ "line": 1, "column": 3 }],
      "path": ["shippingQuotes"],
      "extensions": { "code": "TIMEOUT", "httpStatus": 504 }
    }
  ],
  "data": { "shippingQuotes": null }
}

```

打开的断路器在秒内报告 `"code": "CIRCUIT_OPEN"`、`"httpStatus": 503` 和 `"retryAfter"`。该包设置了 `httpStatus` 而不是 Apollo 的 `extensions.http`，因为 Apollo 会将 `extensions.http` 应用于整个 **响应**，尽管只有一个字段失败。

#### 观察断路器转换

每个策略都会发出类型化事件：`retry`、`timeout`、`circuit-open`、`circuit-half-open`、`circuit-closed`、`circuit-rejected`、`bulkhead-rejected`、`rate-limited` 和 `fallback`。每个事件携带 `policy` 名称，以及如果存在的话，其 `source`：入口点（例如 `ShippingController.getQuotes`）或传递给 `execute()` 的标签。注入 `ResilienceEvents` 以获取它们：其 `events$` 是来自此应用程序策略的每个事件的 RxJS 流。记录人们应该看到的事件：

```typescript title="resilience.logger.ts"
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ResilienceEvents } from '@nestjs/resilience';

@Injectable()
export class ResilienceLogger implements OnModuleInit {
  private readonly logger = new Logger('Resilience');

  constructor(private readonly resilienceEvents: ResilienceEvents) {}

  onModuleInit() {
    this.resilienceEvents.events$.subscribe((event) => {
      switch (event.type) {
        case 'circuit-open':
        case 'circuit-half-open':
        case 'circuit-closed':
          this.logger.warn(`Circuit "${event.policy}" went from ${event.from} to ${event.to}`);
          break;
        case 'bulkhead-rejected':
          this.logger.warn(`${event.source} is at capacity (${event.active} running, ${event.queued} queued)`);
          break;
        case 'fallback':
          this.logger.log(`${event.source} answered with its fallback`);
          break;
      }
    });
  }
}

```

将 `ResilienceLogger` 添加到 `AppModule` 的 `providers` 数组中。

每个策略还会在其自身的 [diagnostics channel](https://nodejs.org/api/diagnostics_channel.html) 上发布每个事件，例如 `nestjs:resilience:timeout` 或 `nestjs:resilience:circuit-open`，即使在没有使用模块的情况下创建的策略也是如此。度量和追踪工具可以订阅而无需依赖此包。`ResilienceTimeoutEvent` 是一个通道消息的类型，而 `ResilienceEvent` 是它们的联合类型：

```typescript
import { subscribe } from 'node:diagnostics_channel';
import type { ResilienceTimeoutEvent } from '@nestjs/resilience';

const timeouts = new Map<string, number>();

subscribe('nestjs:resilience:timeout', (message) => {
  const { policy } = message as ResilienceTimeoutEvent;
  timeouts.set(policy, (timeouts.get(policy) ?? 0) + 1);
});

```

[NestJS Observe](/observability/overview#what-it-offers) 已经从 Node 的诊断通道读取出站 HTTP（参见 [Database queries and outbound HTTP](/observability/sdk#database-queries-and-outbound-http)）。它尚未订阅 `nestjs:resilience` 通道。一旦订阅，它就可以将重试和超时附加到请求的 span、按名称记录断路器状态，并在舱壁拒绝时发出警报，而两个依赖包中都没有包含相互依赖的代码。

#### 试用

使用指向您控制的传输器存根（例如模拟服务器或几行 `node:http`）的 `CARRIER_URL` 启动应用程序。当传输器响应时，结账会获得实时报价：

```bash
$ curl "localhost:3000/shipping/quotes?orderId=1001"
[{"service":"ground","price":6.9,"estimatedDays":4},{"service":"express","price":14.5,"estimatedDays":1}]

```

现在让存根挂起。相同的请求在大约 3 秒后响应 `504`，并且存根看到它的两个请求都被取消了：

```bash
$ curl "localhost:3000/shipping/quotes?orderId=1001"
{"statusCode":504,"error":"Gateway Timeout","message":"The operation timed out","code":"TIMEOUT"}

```

继续发送。每个请求记录了两次失败的尝试。在第五个慢速请求中，断路器在其窗口中有 10 个调用，其中 9 个失败了。断路器打开，请求的第二次尝试被拒绝，并且回退响应。应用程序记录：

```bash
WARN [Resilience] Circuit "carrier" went from closed to open
LOG [Resilience] ShippingController.getQuotes answered with its fallback

```

从现在起，预订货物会快速失败，而不会调用传输器：

```bash
$ curl -i -X POST localhost:3000/shipping/shipments \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: 5f1c2a9e-shipment-1001" \
    -d '{"orderId":"1001"}'
HTTP/1.1 503 Service Unavailable
Retry-After: 30

{"statusCode":503,"error":"Service Unavailable","message":"Service temporarily unavailable","code":"CIRCUIT_OPEN"}

```

同时，报价立即以固定费率响应：

```bash
$ curl "localhost:3000/shipping/quotes?orderId=1002"
[{"service":"flat-rate","price":4.99,"estimatedDays":5}]

```

让存根再次响应并等待 30 秒。下一个报价请求是探测。它成功了，因此断路器关闭，结账再次显示实时报价：

```bash
WARN [Resilience] Circuit "carrier" went from open to half-open
WARN [Resilience] Circuit "carrier" went from half-open to closed

```

使用相同的 `Idempotency-Key` 再次预订现在创建了货物并返回 `201`。早先的 503 释放了密钥。

#### 测试

弹性行为值得测试，但不是通过等待 30 秒来测试断路器。将 `CarrierClient` 替换为假的，并使用 Vitest 的假定时器来控制时钟。只假定 `setTimeout`、`clearTimeout` 和 `Date`，以便 HTTP 服务器和 supertest 仍能使用真实的 I/O 工作：

```typescript title="test/shipping.e2e-spec.ts"
import type { INestApplication } from '@nestjs/common';
import { ResilienceService } from '@nestjs/resilience';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CarrierClient } from '../src/shipping/carrier.client.js';

const liveQuotes = [{ service: 'ground', price: 6.9, estimatedDays: 4 }];

/** A carrier call that only ends when its signal aborts. */
const hang = (_order: unknown, signal: AbortSignal) =>
  new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));

describe('Shipping quotes', () => {
  let app: INestApplication;
  const carrier = { getQuotes: vi.fn(), createShipment: vi.fn() };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CarrierClient)
      .useValue(carrier)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    // Fake only timers and Date: the HTTP server and supertest keep real I/O.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.resetAllMocks();
    await app.close();
  });

  it('answers 504 and cancels the carrier call when the carrier hangs', async () => {
    carrier.getQuotes.mockImplementation(hang);

    // .then() sends the request now; the clock only moves when we advance it.
    const response = request(app.getHttpServer())
      .get('/shipping/quotes?orderId=1001')
      .then((res) => res);
    await vi.waitFor(() => expect(carrier.getQuotes).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(5_000); // two attempts of 1.5 s, plus backoff

    expect((await response).status).toBe(504);
    expect(carrier.getQuotes).toHaveBeenCalledTimes(2);
    const [, signal] = carrier.getQuotes.mock.calls[0];
    expect(signal.aborted).toBe(true);
  });

  it('serves flat rates while the breaker is open, then recovers', async () => {
    carrier.getQuotes.mockResolvedValue(liveQuotes);
    const breaker = app.get(ResilienceService).circuitBreaker('carrier');
    breaker.trip();

    const fallback = await request(app.getHttpServer()).get('/shipping/quotes?orderId=1001');
    expect(fallback.body).toEqual([
      { service: 'flat-rate', price: 4.99, estimatedDays: 5 },
    ]);
    expect(carrier.getQuotes).not.toHaveBeenCalled();

    vi.advanceTimersByTime(30_000); // openDuration: the next call is a probe
    const live = await request(app.getHttpServer()).get('/shipping/quotes?orderId=1001');
    expect(live.body).toEqual(liveQuotes);
    expect(breaker.state).toBe('closed');
  });
});

```

有几点使得这得以实现：

- `vi.waitFor()` 等待请求实际到达传输器。只有那时才有可推进的定时器。启用假定时器后，`vi.waitFor()` 也会按其轮询间隔（50 ms）移动时钟，这远在 1.5 秒的预算内。
- `vi.advanceTimersByTimeAsync()` 按顺序触发超时和退避，并允许中间的 promise 稳定下来。
- `trip()` 直接打开断路器，因此您不需要产生十次失败来测试打开状态。由于断路器在下一次调用时检查 `openDuration` 与 `Date`，向前移动假时钟就足以使该调用成为探测。
- 断路器、舱壁和出站速率限制属于创建它们的应用程序，因此每个测试应用程序都从新鲜的状态开始。
- 要使用不同的设置进行测试，例如更短的 `openDuration`，请使用 `overrideProvider(RESILIENCE_MODULE_OPTIONS)` 覆盖模块的选项。

有关测试基础知识，请参阅 [End-to-end testing](/fundamentals/unit-testing)。

#### 生产检查清单

- **端到端预算时间。** 每次尝试的时间乘以尝试次数，加上退避时间，必须符合客户端超时和负载均衡器的要求。对于报价路由，大约是 3.2 秒。
- **仅重试安全的操作。** 仅在同一请求内的第二次运行是无害时才设置 `idempotent: true`。将其与 `@Idempotent()` 配对以处理客户端重试。
- **将信号传递给每个 I/O 调用。** 没有它，超时工作会继续在后台运行，被接受它的舱壁看不到。
- **在单个层级重试。** 在入口点或服务策略中重试，而不是两者都重试，并在底层的 SDK 和 HTTP 客户端中关闭重试。
- **根据其依赖项调整每个断路器。** 使 `minimumCalls` 足够高，以防止夜间两次错误导致其打开；将 `openDuration` 设置得接近依赖项通常恢复所需的时间；使用 `recordIf` 来排除非中断的错误。
- **为每个断路器设置超时。** 断路器仅从完成的调用中学习。挂起的调用永远不会被计数，而挂起的探测会使半开断路器拒绝所有其他请求。
- **记住状态是每个进程的。** 拥有多个实例时，每个实例都有自己的断路器、舱壁和出站速率限制，重启会使它们恢复到初始状态。每个断路器独立打开，舱壁限制按实例应用，出站速率限制允许每个实例进行 `limit` 次调用。
- **保持回退机制廉价且独立。** 回退机制绝不能调用它所替代的依赖项。
- **在转换时发出警报。** 断路器打开和舱壁拒绝请求是需要告警的信号。
- **注册幂等性存储。** 没有它，`@Idempotent()` 会将其记录保存在每个进程的内存中，在每次重启或部署时丢失，生产环境将拒绝启动。请参阅幂等性教程中的 [Store keys in PostgreSQL](/reliability/idempotency#store-keys-in-postgresql)。
- **正确连接模块。** 在根模块中仅导入 `ResilienceModule` 一次，并在其之前导入 `IdempotencyModule`。对于混合应用程序，使用 `inheritAppConfig: true`。
- **遵守客户端的 Retry-After。** 它告诉客户端何时重试可能成功。

#### 参考

##### 模块选项

`ResilienceModule.forRoot()` 接受这些选项。`forRootAsync()` 从工厂、实现 `ResilienceOptionsFactory` 的类或现有提供者构建相同的对象。

| 选项 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `defaults` | `ResilienceDefaults` | none | `retry`、`timeout`、`circuitBreaker` 和 `bulkhead` 的字段默认值。它们填充装饰器或预设开启的阶段，但绝不会开启任何阶段。参见 [Register the module](/reliability/resilience#register-the-module)。 |
| `presets` | `Record<string, ResiliencePreset>` | none | 阶段的命名集合：`retry`、`timeout`、`circuitBreaker`、`bulkhead`、`outboundRateLimit` 和 `fallback`。预设的断路器、舱壁和出站速率限制在预设名称下共享。 |
| `mapErrors` | `boolean` | `true` | 将任何处理程序（有无装饰器）抛出的弹性错误转换为下方 Errors 中列出的传输器错误。 |
| `isGlobal` | `boolean` | `true` | 全局注册该模块。在根模块中仅注册一次。 |

每次时间值的选项都接受毫秒或诸如 `'200ms'`、`'2s'` 或 `'15m'` 的字符串。选项的注入令牌是 `RESILIENCE_MODULE_OPTIONS`。

##### 装饰器

每个装饰器作用于一个处理程序或一个类，但 `@Signal()` 是一个参数装饰器。

| 装饰器 | 选项 (默认) |
| --- | --- |
| `@Retry(options)` | `attempts` (3 个，包括第一个；`Infinity` 直到信号中止才重试)，`backoff`，`retryIf(error, attempt)` (除客户端错误外的所有错误)，`idempotent` (参见 [Retry a POST safely](/reliability/resilience#retry-a-post-safely))。`@Retry(5)` 设置 `attempts`，`@Retry(false)` 关闭继承的重试。 |
| `backoff` (of `@Retry()`) | `delay` (`'200ms'`)，`factor` (2)，`maxDelay` (`'30s'`)，`jitter`: `'full'`、`'equal'` 或 `'none'` (`'full'`，或当 `factor` 为 1 时为 `'none'`)。或者一个失败尝试及其错误的函数，返回一个持续时间。 |
| `@Timeout(duration)` | 每次尝试的预算。不带参数时，使用预设或类的超时，然后是 `defaults.timeout`。 |
| `@CircuitBreaker(options)` | `name`、`failureRateThreshold` (50，百分比)，`minimumCalls` (10)，`slidingWindow` (最后 20 次调用：`type` 是 `'count'` 或 `'time'`，带 `size`)，`openDuration` (`'30s'`)，`halfOpenMaxCalls` (1)，`recordIf(error)` (除客户端错误外的所有错误)。字符串是一个断路器名称。参见 [Fail fast with a circuit breaker](/reliability/resilience#fail-fast-with-a-circuit-breaker)。 |
| `@Bulkhead(options)` | `name`、`maxConcurrent` (10)，`maxQueue` (0)，`queueTimeout` (无限制)。字符串是一个舱壁名称。参见 [Cap concurrent CSV exports with a bulkhead](/reliability/resilience#cap-concurrent-csv-exports-with-a-bulkhead)。 |
| `@Fallback(method, options)` | 同一类上的方法名或函数，使用错误和 `ExecutionContext` 调用。`handleIf(error)` (除客户端错误外的所有错误)。 |
| `@Resilience(preset)` | 逐阶段应用来自 `presets` 的预设。 |
| `@Signal()` | 当前尝试的 `AbortSignal`。 |

预设的 `outboundRateLimit` 接受 `limit` (每 `interval` 次调用)、`interval` 和 `maxWait` (0: 立即拒绝)。

`ResilienceService` 提供 `preset(name)`、`create(options, name)`、`circuitBreaker(name)`、`bulkhead(name)`、`circuitBreakers()` 和 `bulkheads()`。参见 [Use the same policies inside services](/reliability/resilience#use-the-same-policies-inside-services)。

##### 事件

每个事件都发布在 `ResilienceEvents.events$` 和诊断通道 `nestjs:resilience:<type>` 上。每个负载都有 `type`、`policy`，以及存在时有 `source` (参见 [Observe breaker transitions](/reliability/resilience#observe-breaker-transitions))。

| 类型 | 负载类型 | 其他字段 |
| --- | --- | --- |
| `retry` | `ResilienceRetryEvent` | `attempt` (失败的那个，基于 1 的计数)，`delayMs` (下一次等待时间)，`error` |
| `timeout` | `ResilienceTimeoutEvent` | `timeoutMs` |
| `circuit-open` | `ResilienceCircuitOpenEvent` | `from`、`to` |
| `circuit-half-open` | `ResilienceCircuitHalfOpenEvent` | `from`、`to` |
| `circuit-closed` | `ResilienceCircuitClosedEvent` | `from`、`to` |
| `circuit-rejected` | `ResilienceCircuitRejectedEvent` | `retryAfterMs` |
| `bulkhead-rejected` | `ResilienceBulkheadRejectedEvent` | `reason` (`'full'` 或 `'queue-timeout'`)，`active`、`queued` |
| `rate-limited` | `ResilienceRateLimitedEvent` | `retryAfterMs` |
| `fallback` | `ResilienceFallbackEvent` | `error` |

断路器的状态 (`from` 和 `to`) 是 `'closed'`、`'open'` 或 `'half-open'`。`ResilienceEvent` 是所有负载类型的并集。

##### 错误

所有错误都继承自 `ResilienceError`，它有一个 `code` 和 `policy` 名称。

| 错误 | 代码 | HTTP | 发送给客户端的消息 | 字段 |
| --- | --- | --- | --- | --- |
| `ResilienceTimeoutError` | `TIMEOUT` | 504 | 操作超时 | `timeoutMs` |
| `CircuitOpenError` | `CIRCUIT_OPEN` | 503，带 `Retry-After` | 服务暂时不可用 | `retryAfterMs` |
| `BulkheadFullError` | `BULKHEAD_FULL` | 503 | 服务器已满负荷 | `reason` |
| `OutboundRateLimitError` | `RATE_LIMITED` | 503，带 `Retry-After` | 依赖项的速率限制超出 | `retryAfterMs` |

在微服务和 WebSocket 处理程序中，错误是一个 `RpcException` 或 `WsException`，其负载包含 `status`、`code`、`statusCode`、`message`，以及对于知晓的拒绝情况，包含秒级的 `retryAfter`。在 GraphQL 中，字段的错误包含 `code`、`httpStatus` 和 `retryAfter`，在 `extensions` 中 (参见 [Other transports](/reliability/resilience#other-transports))。