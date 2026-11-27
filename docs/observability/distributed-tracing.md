<!-- 此文件从 content/observability/distributed-tracing.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:40:43.309Z -->
<!-- 源文件: content/observability/distributed-tracing.md -->
<!-- 源哈希: a56f6a190c4b3565e52ac7d360a2b2a2 -->

### 分布式追踪

**追踪** 是您的应用程序在单个追踪 ID 下记录的所有内容：启动它的请求或任务，以及其下的每一个跨度。在单个服务内部，这是自动的。SDK 在工作开始时生成追踪 ID，所有子跨度，包括您使用 [`TracerService`](/observability/manual-instrumentation) 手动添加的跨度，都会继承它。

跨服务时，这取决于通道。HTTP 调用和队列任务会在自身上携带追踪 ID，最近的 `@nestjs/microservices`（TCP 和 Redis 为 12.0.4，NATS、Kafka、RabbitMQ、MQTT 5 和 gRPC 为 12.3.3）内置微服务传输器也会这样做。在较早的版本中，需要转发追踪 ID。一个触及多个服务的单个用户操作（一个扇出到 gRPC 服务的 API 调用，或通过微服务传输器发送到另一个应用程序的消息）只有在所有涉及的服务都使用相同的追踪 ID 时，才会显示在您的仪表板中为**一个追踪**。否则，每个服务都会通过 `traceIdGenerator` 生成自己的 ID，该操作将显示为多个不相关的追踪，每个服务一个。

<figure><img src="https://www.observe.nestjs.com/docs/telemetry/service-flow.webp" alt="Trace correlation across services" /></figure>

当需要转发时，这是应用程序代码，而不是仪表板设置，模式始终相同：调用方将其当前追踪 ID 放在协议支持的任何通道上，而被调用方的 `traceIdGenerator` 将其读回。本页面展示了针对每种传输方式的实现方法。

#### 读取当前追踪 ID

要将追踪 ID 转发到下游，服务首先读取其当前运行的追踪 ID。`TracerService.currentTraceId()` 返回它：

```typescript title="orders.service.ts"
import { Injectable } from '@nestjs/common';
import { TracerService } from '@nestjs/observe';

@Injectable()
export class OrdersService {
  constructor(private readonly tracerService: TracerService) {}

  async report(orderId: string) {
    const traceId = this.tracerService.currentTraceId();
    // ...forward traceId to the next service
  }
}

```

它从与 `getAttribute()`/`setAttribute()` 相同的上下文存储中读取，并在未追踪的上下文外部返回 `null`。如果您的代码可以在没有追踪的情况下运行，例如启动钩子，请在设置头部之前检查 `null`。

#### HTTP 到 HTTP

HTTP 传播是双向自动的。在进入时，默认的 `traceIdGenerator` 会采用格式良好的 `x-request-id` 头部，否则会生成一个时间有序的 UUID (v7)。在传出时，SDK 会将当前追踪 ID 作为 `x-request-id` 添加到不携带追踪 ID 的出站请求中，因此一个从一个被 instrument 的服务到另一个服务的调用，无需应用程序代码即可落入同一个追踪中。

出站传播覆盖了 `fetch` 和 `undici`，包括 [HTTP client](/application/http-client)，在所有支持的 Node 版本上都有效；对于基于 `node:http`（axios、got、`@nestjs/axios`）的客户端，在 Node 22.12 及更高版本上有效，这是允许在请求对象创建后添加头部的第一个版本。要限制接收该头部的主机，或禁用它，请参阅 [`outgoing.http.propagateTraceId`](/observability/sdk#database-queries-and-outbound-http)。

在较旧的 Node 版本上使用基于 axios 的客户端时，只需注册一个请求拦截器即可自行转发 ID：

```typescript title="orders.module.ts"
@Module({
  imports: [HttpModule],
})
export class OrdersModule implements OnModuleInit {
  constructor(
    private readonly httpService: HttpService,
    private readonly tracerService: TracerService,
  ) {}

  onModuleInit() {
    this.httpService.axiosRef.interceptors.request.use((config) => {
      config.headers['x-request-id'] = this.tracerService.currentTraceId();
      return config;
    });
  }
}

```

> info **提示** 许多反向代理和负载均衡器（nginx、Envoy、AWS ALB）可以在每个入站请求上设置 `x-request-id`。当它们这样做时，您仪表板中的追踪 ID 与您代理的访问日志中的请求 ID 匹配。启用 [`openTelemetry`](/observability/opentelemetry#running-beside-opentelemetry) 选项后，W3C `traceparent` 优先于命名不同追踪的 `x-request-id`。

#### OpenTelemetry 和 W3C Trace Context

使用 OpenTelemetry instrument 的服务通过 W3C `traceparent` 头部而不是 `x-request-id` 传递追踪。启用 `openTelemetry` 选项后，SDK 在进入时读取 `traceparent`，它命名的追踪 ID 成为请求的追踪 ID。在传出时，它发送 `traceparent` 旁边是 `x-request-id`。然后，一个 Nest 服务会加入其周围服务共享的追踪，无论它们是用什么语言编写的。参见 [Running beside OpenTelemetry](/observability/opentelemetry#running-beside-opentelemetry)。

#### gRPC

gRPC 没有头部，只有元数据。在 `@nestjs/microservices` 12.3.3 或更高版本上，追踪 ID 会独立地在其中传输：SDK 会将当前追踪 ID 作为 `x-request-id` 元数据添加到通过注册为提供者（例如使用 `ClientsModule`）的 `ClientGrpc` 发出的每个调用中，gRPC 服务的默认 `traceIdGenerator` 会采用它，因此无需应用程序代码。您自己传递给调用的元数据会获胜：其中包含的 `x-request-id` 是服务采用的。启用 [`openTelemetry`](/observability/opentelemetry#running-beside-opentelemetry) 选项后，元数据还携带 W3C `traceparent`，因此使用 OpenTelemetry instrument 的任何语言的 gRPC 服务器都会继续追踪。

在较早的版本中，调用方将追踪 ID 作为元数据附加，gRPC 服务会覆盖 `traceIdGenerator` 以将其读回，因为默认生成器不会在那里读取 gRPC 元数据：

```typescript title="caller.ts"
import { Metadata } from '@grpc/grpc-js';

const metadata = new Metadata();
const traceId = this.tracerService.currentTraceId();
if (traceId) {
  metadata.set('x-request-id', traceId);
}
this.heroesService.findOne({ id: 1 }, metadata);

```

```typescript title="app.module.ts"
import { randomUUID } from 'node:crypto';

// gRPC service - passed to createObserveModule(), not forRoot()
export const { ObserveModule, ObserveInstrument } = createObserveModule({
  traceIdGenerator: (call: any) => {
    const inbound = call.metadata?.get?.('x-request-id')?.[0];
    return typeof inbound === 'string' && inbound.length > 0
      ? inbound
      : randomUUID(); // no id was propagated - this call started its own trace
  },
});

```

有关调用两侧如何读取和写入元数据的，请参阅 [gRPC](/microservices/grpc) 章。

#### TCP、Redis、NATS 和其他微服务传输器

一旦两个服务都运行了足够新的 `@nestjs/microservices`，并且 `@nestjs/observe` 0.3.0 或更高版本，每个内置微服务传输器都会独立携带追踪 ID：

| 传输器 | 来自 `@nestjs/microservices` | 追踪 ID 的传输方式 |
| :--- | :--- | :--- |
| TCP, Redis | 12.0.4 | 包含在数据包内 |
| NATS | 12.3.3 | 作为消息头部 |
| Kafka | 12.3.3 | 作为记录头部 |
| RabbitMQ | 12.3.3 | 在消息的 `headers` 属性中 |
| MQTT | 12.3.3，通过 MQTT 5 (`protocolVersion: 5`) | 作为用户属性 |
| gRPC | 12.3.3 | 作为调用元数据（参见 [gRPC](#grpc)） |

SDK 将当前追踪 ID 作为 `x-request-id` 附加到通过注册为提供者（例如使用 `ClientsModule`）的 `ClientProxy` 发送的每个数据包中，接收端的默认 `traceIdGenerator` 会采用它，因此无需应用程序代码。在将其作为头部的传输器上，您的代码设置的同名头部（在记录构建器或客户端的 `headers` 或 `userProperties` 选项中）会覆盖 SDK 的设置。由于 ID 在那里是一个纯 `x-request-id` 头部，未用 Nest 编写的服务可以读取它，或向 Nest 服务发送一个。启用 [`openTelemetry`](/observability/opentelemetry#running-beside-opentelemetry) 选项后，W3C `traceparent` 会以相同的方式随之传输，因此使用 OpenTelemetry instrument 的任何语言的服务都会继续追踪。

在较早的 `@nestjs/microservices` 和 MQTT 3.1.1 上，后者没有用户属性，追踪 ID 不会独立传输，每个服务都会启动自己的追踪。如果无法升级，请在传输器携带的头部中转发 ID（`NatsRecordBuilder#setHeaders()`、`RmqRecordBuilder#setOptions({ headers })`，Kafka 消息的 `headers`），并覆盖 `traceIdGenerator` 从传输器提供的上下文中将其读回：

```typescript title="app.module.ts"
import { randomUUID } from 'node:crypto';

// receiving service, over NATS
export const { ObserveModule, ObserveInstrument } = createObserveModule({
  traceIdGenerator: (ctx: any) =>
    ctx.getHeaders?.()?.get('x-request-id') || randomUUID(),
});

```

生成器接收传输器的上下文对象，因此相同的代码适用于请求-响应（`send()`）和基于事件（`emit()`）消息。自定义传输器在客户端随数据包的 `metadata` 一起发送时携带 ID，并且其上下文从 `getMetadata()` 方法中返回该值：默认生成器从中采用 `x-request-id`。

> warning **警告** 相同的 `traceIdGenerator` 会同时用于 HTTP 请求和 RPC 上下文。在一个同时提供 HTTP 和微服务传输器的 [hybrid application](/faq/hybrid-application) 中，请防御性地编写生成器：首先检查 `headers`，然后回退到传输器的上下文。

#### GraphQL

当 GraphQL 服务器位于同一服务的 HTTP 层之后时，无需额外配置。它会加入 HTTP 代理为该请求已打开的任何跟踪，该跟踪本身可能如上所述通过 `x-request-id` 传播。只有没有包含 HTTP 跟踪的操作（例如，基于原始 WebSocket 的订阅）需要单独处理，目前没有内置的传播钩子来处理这种情况。

#### 队列任务 (BullMQ 和 Bull)

队列传播是自动的。当一个任务从受跟踪操作（请求处理器、RPC 处理器、另一个任务）内部添加时，SDK 会将当前的跟踪 ID 标记到任务的选项中，而拾取该任务的处理器则在该 ID 下运行，而不是生成自己的 ID。请求和它排队的每个任务都渲染为一个跟踪，无需应用代码参与：

```typescript title="orders.controller.ts"
@Post()
async create(@Body() dto: CreateOrderDto) {
  const order = await this.ordersService.create(dto);
  // The job inherits this request's trace id
  await this.ordersQueue.add('send-confirmation', { orderId: order.id });
  return order;
}

```

对于 `@nestjs/bullmq` 和 `@nestjs/bull`、`add()` 和 `addBulk()` 也是如此，无论工作进程是与生产者在同一进程中运行还是在单独的服务中运行：ID 通过 Redis 与任务一起传输。一个重试的任务会保留其排队时的 ID，因此每次尝试都落入同一个跟踪中。

有两个情况会故意启动自己的跟踪：

- **可重复任务和 `@nestjs/schedule` 处理器。** 调度会比注册它的操作存活更久，因此每次触发都是自己的跟踪，而不是附加到设置调度的任何请求的不断增长的跟踪的一部分。
- **在任何受跟踪操作之外添加的任务**，例如从引导钩子或普通脚本中添加。没有可继承的跟踪。

> info **提示** 跟踪 ID 存储在 `observeTraceId` 任务选项下。要将任务附加到 SDK 未看到的跟踪（例如由非 Nest 生产者排队的任务），请在添加任务时自行设置该选项。

开启 [`openTelemetry`](/observability/opentelemetry#running-beside-opentelemetry) 选项后，从 `@nestjs/observe` 0.3.23 开始，任务还会携带其添加时的 W3C 跟踪上下文，存储在 `observeTraceparent` 任务选项下，处理器在该上下文下运行。进程中的 OpenTelemetry SDK 随后继续请求的跟踪：任务在 OpenTelemetry 后端中的跨度以及任务调用的服务都属于与请求相同的跟踪，因为任务处于 Observe 状态。如果队列和工作进程上开启了 BullMQ 自己的 OpenTelemetry 附加组件 [`bullmq-otel`](https://www.npmjs.com/package/bullmq-otel)，处理器将在附加组件打开的消费者跨度中运行，该跨度属于同一跟踪，并且从 `@nestjs/observe` 0.3.24 开始，任务的跨度嵌套在该跨度之下。

> warning **警告** 任务的跟踪继承要求**同时**在添加任务的服务和处理任务的服务上使用 `@nestjs/observe` 0.3.0 或更高版本。如果生产者版本较旧，任务不携带 ID，每次运行都会打开自己的跟踪，如之前所述。

#### 仪表板中跟踪的显示方式

一旦服务就跟踪 ID 达成一致，跟踪详情页面就会渲染所有在该 ID 下运行的执行情况，跨越服务、请求和任务，作为一个瀑布图：嵌套深度表示缩进，持续时间表示条形长度，水平位置表示跨度运行的时间。阅读时请记住以下几点：

- **自耗时间** 是重要的数字。一个跨度的持续时间减去其子跨度所占的时间，就是该跨度在其自身代码中花费的时间。按总持续时间排序总是将控制器放在顶部（它包含所有内容）；按自耗时间排序则显示实际消耗时间的仓储调用。每个执行页面都带有按此方式排序的跨度表。
- **重叠的子跨度会被标记**。当一个跨度的子跨度总和超过该跨度自身的持续时间时，它们是并发运行的（`Promise.all`，并行扇出），行中会说明这一点。
- **失败的跨度会被标记**，执行页面首先显示一个错误卡片，显示抛出的第一个跨度的类、消息、带有抛出帧标记的修剪后的堆栈跟踪，以及开启 [`sourceContext`](/observability/sdk#错误源代码上下文) 时的周围源行。
- **日志位于跟踪的时钟上**。开启 `forwardLogs` 后，每行都会放置在其相对于跟踪开始的偏移量处，并标记了写入时正在运行的跨度；悬停在某一行会标记瀑布图上的那个瞬间。

<figure><img src="https://www.observe.nestjs.com/docs/telemetry/traces.webp" alt="Trace waterfall" /></figure>

从任何失败或异常缓慢的执行中，**复制代理提示** 按钮会将整个页面（上下文、错误、带有源的堆栈跟踪、按自耗时间排序的顶部跨度和日志）打包成一个自包含的 markdown 提示，供编码代理使用。参见 [Dashboard](/observability/dashboard#将故障交给编码代理)。