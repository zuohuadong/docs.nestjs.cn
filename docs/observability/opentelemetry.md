<!-- 此文件从 content/observability/opentelemetry.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:42:03.172Z -->
<!-- 源文件: content/observability/opentelemetry.md -->
<!-- 源哈希: 8a739331da039f2c5c5dcbe88145af35 -->

### OpenTelemetry

[OpenTelemetry](https://opentelemetry.io/ 'OpenTelemetry') 是用于追踪、指标和日志的厂商中立标准。您只需对应用程序进行一次仪器化，将数据发送到任何兼容的后端——Jaeger、Grafana Tempo 或接受 OpenTelemetry 协议 (OTLP) 的众多厂商之一——之后无需修改应用程序代码即可更改后端。

对于您系统中的 Nest **服务**，无论它是整个后端还是其中一部分，您都不必在它和 [NestJS Observe](/observability/overview) 之间做出选择：Observe 可以独立运行，也可以与您已有的 OpenTelemetry 并存，并且用其他语言编写的 **服务** 也可以通过 OpenTelemetry 共享其追踪信息。本页面展示了每个记录了 Nest 应用程序的什么内容、如何 [run the two together](#running-beside-opentelemetry) 以及如何将两者整合到一起。

#### NestJS Observe 增加的内容

OpenTelemetry 从外部对 Node.js 应用程序进行仪器化：它在 HTTP **服务器**、**路由器** 和数据库 **驱动** 加载时对其进行打补丁。它无法看到 Nest 内部构建的结构，因此追踪记录的是库的词汇。在 OpenTelemetry 后端中一个缓慢的 `POST /orders` 在 NestJS 11 上大致如下所示（在 NestJS 12 上，两个 Nest **跨度** 也缺失了）：

```bash
POST /orders                          1,812 ms
  OrdersController.create             1,806 ms
    create                            1,806 ms
      pg.query SELECT customers          11 ms
      POST api.stripe.com             1,747 ms

```

NestJS Observe 从内部对框架进行仪器化。Nest 通过 `instrument` 选项将它创建的每个 **提供者** 传递给它，因此 **控制器**、**服务**、**仓储**、**守卫**、**拦截器** 或 **管道** 上的每次方法调用都会成为一个以您命名的 **跨度**。Observe 中的相同 **请求**：

```bash
POST /orders                          1,812 ms
  AuthGuard.canActivate                   3 ms
  OrdersController.create             1,806 ms   self 1 ms
    OrdersService.create              1,805 ms   self 6 ms
      CustomersService.findById          12 ms
        SELECT customers                 11 ms
      PricingService.quote               38 ms
      PaymentsService.charge          1,749 ms
        POST api.stripe.com           1,747 ms

```

没有人为 `PricingService.quote` 编写了 **跨度**，也没有人需要预先猜测这是否重要。因为树是完整的，Observe 可以计算每个方法独立花费的时间（自时间），而不是将其留给猜测。使用 OpenTelemetry，获得相同的树意味着需要手动为每个您关心的方法添加一个 **跨度**——这段代码必须编写、保持更新，并且只涵盖某人已经怀疑的内容（参见 [Adding your own spans](#adding-your-own-spans)）。

区别延续到 **请求** 之外：

- **无需运行任何东西。** OpenTelemetry 流水线是一个 SDK、一个导出器、通常是一个收集器和一个用于存储、查询和警报数据的后端。Observe 是一个命令 `npx @nestjs/observe link`，它安装 SDK，将其连接到您的应用程序，并将 API 密钥写入 `.env`。没有收集器，也没有需要操作的后端。
- **Nest 的构建块，按其本来的样子记录。** **队列** **消费者**、`@Cron()` **处理程序**、GraphQL **解析器**、**微服务** **处理程序** 和 WebSocket **网关** 都是作为其自身类型的操作记录的，而 BullMQ 或 Bull **任务** 会与排队的 **请求** 共享一个追踪。
- **与框架保持同步。** Observe 由 Nest 团队与 Nest 本身一起构建和维护。相比之下，OpenTelemetry 的 Nest 仪器化尚未支持 NestJS 12（参见 [What gets recorded for Nest](#what-gets-recorded-for-nest)）。
- **不止是追踪。** 带有源上下文的错误监控、**队列** 等待时间和重试、每类的耗时细分、运行时性能分析和发布，都包含在同一 SDK 中，所有套餐均提供，包括免费层。

OpenTelemetry 覆盖了 Observe 刻意不覆盖的领域：

- 它仅在 Node.js 上对 NestJS 进行仪器化。用其他语言编写的 **服务** 通过 OpenTelemetry 共享其追踪信息：使用 [`openTelemetry` option](#running-beside-opentelemetry)，Nest **服务** 会加入它们在 `traceparent` **请求** 头中传播的 W3C 追踪，使用 [OTLP export](#exporting-spans-over-otlp) 它们的 **跨度** 会落入持有这些追踪的后端。如果没有此选项，**服务** 是通过 `x-request-id` **请求** 头关联的（参见 [Distributed tracing](/observability/distributed-tracing)）。
- 它是一个托管 **服务**，并且不摄取 OTLP：来自 OpenTelemetry SDK 的 **跨度** 不会出现在 Observe 中。它可以将自己的 **跨度** 通过 OTLP 导出到您的 OpenTelemetry 后端，与发送到 Observe 的内容并存（参见 [Exporting spans over OTLP](#exporting-spans-over-otlp)）。
- 它的库仪器化记录的是任何被调用的客户端。Observe 以这种方式仪器化数据库 **驱动** 和 HTTP 客户端，并将其他客户端作为 **提供者**：一个注册为 Redis 或 Kafka 客户端的 **提供者**（在 Nest 应用程序中几乎总是如此）会为每次调用获得一个 **跨度**，但未在 **依赖注入** 外部创建的客户端不会被记录。

因此两者可以结合使用。当需要厂商中立性、将遥测保留在自有基础设施上，或将每个 **服务** 的 **跨度** 集中在一个后端时，OpenTelemetry 是基础。NestJS Observe 为您的 Nest **服务** 提供了框架级别的视图：独立地，或 [beside OpenTelemetry](#running-beside-opentelemetry)，与您系统的其余部分在相同的追踪中。

有关完整推理，请参阅 [NestJS and OpenTelemetry: why we instrument the framework itself](https://dev.to/nestjs/nestjs-and-opentelemetry-why-we-instrument-the-framework-instead-50i6)。

#### 与 OpenTelemetry 并行运行

NestJS Observe 可以覆盖一个原本运行 OpenTelemetry 的系统中的 Nest **服务**，并且可以在 Nest 应用程序中与 OpenTelemetry SDK 并行运行。对于任一情况，请开启 `openTelemetry` 选项：

```typescript
ObserveModule.forRoot({
  // ...
  openTelemetry: true,
});

```

开启后：

- **W3C 追踪中的请求保留该追踪的 ID。** 当一个带有 `traceparent` **请求** 头（来自使用 OpenTelemetry 仪器化的任何语言的 **服务**，或来自具有追踪的网格或负载均衡器）的 **请求** 到达时，Observe 会在该追踪 ID 下报告它，因此它拥有 OpenTelemetry 后端中其余追踪所拥有的 ID。只有当 `x-request-id` 头命名相同的追踪时才会被保留，这正是另一个运行 Observe 的 **服务** 发送的。不相关的 ID，例如 Envoy 和 Istio 在每个 **请求** 上打上的 ID，会被忽略。
- **服务发出的调用会携带追踪信息。** 每次出站调用都会携带 `traceparent` 旁边的 `x-request-id`，调用自身的 **跨度** 作为父级，并传递调用者的 `tracestate` 和采样决策，因此下一个 **服务** 的 **跨度** 会嵌套在该调用下。这涵盖了所有支持的 Node.js 版本上的 `fetch` 和 `undici`，以及在 Node.js 22.12 及更高版本上基于 `node:http` 构建的客户端。
- **同一进程中的 OpenTelemetry SDK 设置追踪。** Observe 在每个 **请求** 下报告其追踪 ID，该 ID 来自 SDK 为其打开的 **跨度**，包括启动追踪的 **请求**，并且在出站调用上为 SDK 留下 `traceparent`。因此，一个 **请求** 在两个工具中都有一个追踪 ID，并且每次调用都携带恰好一个 `traceparent`。SDK 继续记录其 **跨度**，而 Observe 添加 **提供者** 级别的 **跨度**。如果 SDK 传播 B3 而不是 W3C Trace Context，Observe 仍然遵循其追踪，并在该追踪中旁边的 B3 头中添加一个 `traceparent`。
- ****队列** **任务** 和 **微服务** **消息** 在两个工具中都保留在 **请求** 的追踪中。从 `@nestjs/observe` 0.3.23 开始，在处理 **请求** 期间添加的 BullMQ 或 Bull **任务**，以及通过注册了 `ClientsModule` 的客户端通过携带追踪 ID 的 **传输器**（TCP 和 Redis 在 `@nestjs/microservices` 12.0.4 或更高版本；NATS、Kafka、RabbitMQ、MQTT 5 和 gRPC 在 12.3.3 或更高版本）发送的消息，都会携带 **请求** 的 W3C 追踪上下文。使用 OpenTelemetry 仪器化的任何语言的 **消费者** 会从其继续追踪。在运行 OpenTelemetry SDK 的 Nest **服务** 中，Observe 将上下文传递给 SDK，而 SDK 对 BullMQ 或 Nest 的 TCP 和 Redis **传输器** 没有仪器化：**任务** 或 **处理程序** 中的 SDK **跨度** 以及它们发出的调用上的 `traceparent` 都属于 **请求** 的追踪，就像在 Observe 中 **任务** 和 **处理程序** 那样。在仪器化确实携带追踪的情况下——BullMQ 自身的 [`bullmq-otel`](https://www.npmjs.com/package/bullmq-otel) 附加组件或 SDK 的 gRPC 仪器化——**任务** 或 **处理程序** 的 **跨度** 会嵌套在其为其打开的 **跨度** 下（使用 `bullmq-otel`，来自 `@nestjs/observe` 0.3.24）。

追踪 ID 是共享的。开启 [OTLP export](#exporting-spans-over-otlp) 后，Nest **服务** 的 **跨度** 也是如此：您的 OpenTelemetry 后端显示完整的追踪，而 Observe 显示 Nest **服务** 的部分。没有它，后端显示其他 **服务** 追踪的一部分，而 Observe 显示 Nest **服务** 的部分。Observe 将 W3C 追踪 ID 写入 UUID 格式，无论是来自 Jaeger 还是 Tempo 的 `4bf92f3577b34da6a3ce929d0e0e4736` 形式都可以在 Observe 中找到相同的追踪，如 `4bf92f35-77b3-4da6-a3ce-929d0e0e4736` 所示。

没有此选项，Observe 只读取和发送 `x-request-id`，而将任何 OpenTelemetry SDK 留在进程中独立运行。**任务** 和消息仍然保留在 Observe 的追踪中：在处理 **请求** 时添加的 BullMQ 或 Bull **任务** 会在该 **请求** 的追踪 ID 下运行，无论其 **工作者** 是在同一进程中运行还是在另一个 **服务** 中运行，通过携带追踪 ID 的 **微服务** **传输器** 发送的消息也是如此（[Distributed tracing](/observability/distributed-tracing) 显示了哪些 **传输器** 支持，以及从哪个 **版本** 开始）。

> info **提示** 此选项与报告给 NestJS Observe 并行工作。从 `@nestjs/observe` 0.3.24 开始，它在应用程序启动时即开启，因此新实例的首次 **请求** 会保留在其周围的追踪中；在 0.3.24 之前，它在收集器接受的第一批数据时开启。它在收集器发生故障和**速率限制**期间保持开启，因此 Observe 的故障不会分割流经其他 **服务** 的追踪。它仅在收集器拒绝应用程序的凭据或 SDK 的 **工作者** 宕机时暂停，并在日志中显示一行信息。在此期间处理的 **请求** 像选项关闭时一样被追踪。使用 `enabled: false` 或没有凭据时，它永远不会开启。

> warning **警告** NestJS Observe 和 OpenTelemetry SDK 都挂钩了数据库驱动程序。该组合已使用 `pg` 进行测试；在生产环境之前，请在预生产环境中尝试使用您使用的驱动程序。

#### 通过 OTLP 导出 **跨度**

从 `@nestjs/observe` 0.3.23 开始，开启 `openTelemetry` 选项后，Observe 还可以通过 OTLP/HTTP 将其记录的 **跨度** 导出到您的 OpenTelemetry 后端——可以是 OpenTelemetry Collector、Jaeger、Grafana Tempo 或接受 OTLP 的任何供应商。Nest **服务** 追踪的部分，直到 **提供者** 方法，都位于其周围 **服务** 的同一瀑布图中。将 `otlp` 选项指向后端的 OTLP/HTTP 端点：

```typescript
ObserveModule.forRoot({
  // ...
  openTelemetry: true,
  otlp: {
    endpoint: 'http://localhost:4318',
  },
});

```

`otlp: true` 从标准的 `OTEL_EXPORTER_OTLP_*`、`OTEL_SERVICE_NAME` 和 `OTEL_RESOURCE_ATTRIBUTES` 变量中读取端点、**请求** 头部、协议和 **服务** 名称；这些变量本身不会开启导出。默认编码是 `http/protobuf`，而 `protocol: 'http/json'` 切换到 JSON。不支持 gRPC，因此请将端点指向后端的 HTTP 端口，约定为 4318。

每个 **请求** 成为一个 **服务器** **跨度**，在到达追踪时的调用者 **跨度** 下；每个队列 **任务** 成为一个 **消费者** **跨度**。其下的 **控制器**、**提供者** 和手动 **跨度** 成为内部 **跨度**，数据库 **查询** 和出站调用成为客户端 **跨度**；出站调用的 **跨度** 是下一个 **服务** 导出的父级。错误被记录为 **跨度** 的状态和一个 `exception` 事件，像在 Observe 中一样被脱敏。调用者采样了其追踪的 **请求** 不会被导出。

导出与报告给 NestJS Observe 并行进行，绝不替代它，并且每个计划都包含此功能：

- **付费计划** 导出 SDK 记录的每个追踪，无论 Observe 自身保留了什么副本。
- **免费** 导出 Observe 保留的内容。一旦您的应用程序在一个 UTC 日内发送 30,000 个事件，或使用完月度配额，大多数瀑布图将被暂停，并且其后的 **请求** 和 **任务** 会在不包含其下 **跨度** 的情况下被导出。**服务器** 错误、失败的 **任务** 和任何超过 1 s 的事件都会保留完整的追踪。当无法到达收集器时，无法得知 Observe 保留了什么，因此免费版的导出会在故障发生几分钟后暂停，并在收集器接受下一批数据时恢复。

> info **提示** 导出从收集器接受的第一批数据开始，其回复会说明应用程序的计划包含什么，日志会说明何时开启。当 `openTelemetry` 选项暂停时，它也会暂停。没有 `openTelemetry` 选项或没有凭据时，不会导出任何内容，SDK 会在启动时说明原因。

#### 零代码设置

> info **提示** OpenTelemetry 的 Node.js 文档中有很大一部分假设编译后的应用程序作为 CommonJS 运行。在 Nest 12 上使用 `nest new` 生成的应用程序是 ES **模块**，需要额外的加载器标志。下面展示了这两种变体。在 Nest 12 上，CommonJS 构建也需要该标志，因为 `@nestjs/*` 包是 ES **模块**，并且导入了 Express 本身。没有它，Express 不会被仪器化，HTTP **跨度** 的名称也不会包含其路由。

从 Nest 应用程序中获取追踪最快的方法是 OpenTelemetry 的零代码仪器化。安装 API 和自动仪器化包：

```bash
$ npm i --save @opentelemetry/api @opentelemetry/auto-instrumentations-node

```

仪器化必须在 Nest 和它打补丁的 **库** 之前加载，因此它应放在 `node` 命令行上，而不是放入 `main.ts`。对于 CommonJS 构建：

```bash
$ OTEL_SERVICE_NAME=orders-api \
  OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
  node --require @opentelemetry/auto-instrumentations-node/register dist/main.js

```

对于 ES **模块** 构建，还需要 OpenTelemetry 的加载器钩子：

```bash
$ OTEL_SERVICE_NAME=orders-api \
  OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
  node --experimental-loader=@opentelemetry/instrumentation/hook.mjs \
  --import @opentelemetry/auto-instrumentations-node/register dist/main.js

```

如果您的平台为您启动进程并且您无法更改命令，请将相同的标志放入 `NODE_OPTIONS` **环境变量** 中。

Spans 通过 OTLP 发送到您配置的端点。要本地查看它们，Jaeger 在单个容器中运行，并在 4318 端口接受 OTLP：

```bash
$ docker run --rm -p 16686:16686 -p 4318:4318 jaegertracing/jaeger

```

打开 `http://localhost:16686`，向您的应用程序发送一个请求，跟踪将显示在您设置的服务名称下。

#### 在代码中配置 SDK

要自行选择导出器、采样器或仪器化，请从您自己的文件启动 SDK，而不是使用 `register` 入口点：

```bash
$ npm i --save @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http

```

```typescript title="instrumentation.ts"
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

export const otelSdk = new NodeSDK({
  serviceName: 'orders-api',
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [getNodeAutoInstrumentations()],
});

otelSdk.start();

```

`OTLPTraceExporter` 从 `OTEL_EXPORTER_OTLP_ENDPOINT` 读取其端点，并默认为 `http://localhost:4318`。像零代码入口点一样，在任何其他代码之前加载此文件：

```bash
# CommonJS
$ node --require ./dist/instrumentation.js dist/main.js

# ES modules
$ node --experimental-loader=@opentelemetry/instrumentation/hook.mjs \
  --import ./dist/instrumentation.js dist/main.js

```

在 CommonJS 构建中，您可以在 `main.ts` 的第一行导入该文件，在 `@nestjs/core` 和您的 `AppModule` 之前。在 ES 模块构建中，以及在 Nest 12 的 Express 中，这还不够，因为必须在命令行上注册加载器钩子。

SDK 以批次导出 spans。要在应用程序停止时发送最后一个批次，请在 Nest 完成关闭后调用 `otelSdk.shutdown()`，例如从启用了 [shutdown hooks](/fundamentals/lifecycle-events#application-shutdown) 的 `onApplicationShutdown()` 钩子中调用。

#### Nest 记录的内容

自动仪器化包记录传入和传出的 HTTP 请求（包括 `fetch`）、Express 以及常见的数据库驱动程序，如 `pg`、`mysql2`、`mongodb` 和 Mongoose。基于这些驱动程序的 ORM，如 TypeORM、MikroORM 和 Drizzle，会通过它们运行的查询显示出来。

Nest 本身由 `@opentelemetry/instrumentation-nestjs-core` 覆盖，它是包的一部分。它发出三种类型的 span：

| Span name | Type | 覆盖内容 |
| :--- | :--- | :--- |
| `Create Nest App` | `app_creation` | 启动时的 `NestFactory.create()` 调用 |
| `<ControllerName>.<memberName>` | `request_context` | 从 Nest 角度看，整个请求 |
| `<memberName>` | `handler` | 处理请求的控制器方法 |

> warning **警告** 撰写本文时，`@opentelemetry/instrumentation-nestjs-core` 支持低于 12 的 `@nestjs/core` 版本。在 NestJS 12 中，上述三个 span 不会被记录，跟踪只包含 HTTP 和数据库 span。请检查您安装的版本的包支持版本。

span 在控制器处停止。它调用的提供者——服务、仓储，以及围绕它的守卫、拦截器和管道——不会被自动跟踪，因此在您自己的代码中花费的时间显示为一个未分割的 span。在 Fastify 适配器上，路由级别的 span 来自由 Fastify 团队维护的 `@fastify/otel`，它不属于自动仪器化包。

#### 添加您自己的 spans

要查看您的提供者内部，请使用 OpenTelemetry API 创建 spans。`startActiveSpan()` 会使新 span 成为回调内部运行的所有内容的父级，包括数据库和 HTTP span：

```typescript title="pricing.service.ts"
import { Injectable } from '@nestjs/common';
import { SpanStatusCode, trace } from '@opentelemetry/api';

const tracer = trace.getTracer('orders-api');

@Injectable()
export class PricingService {
  async quote(cart: Cart) {
    return tracer.startActiveSpan('PricingService.quote', async (span) => {
      try {
        span.setAttribute('cart.items', cart.items.length);
        return await this.calculate(cart);
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    });
  }
}

```

您启动的每个 span 都必须结束，即使工作失败也是如此，这就是 `finally` 块的作用。即使没有运行 SDK，导入 API 包也是安全的：没有 SDK 时，调用不会执行任何操作。

这就是 NestJS Observe 为您做的事情：安装了其 SDK 后，每个提供者方法本身就是一个 span，而手动 API 仅用于非提供者方法的代码。