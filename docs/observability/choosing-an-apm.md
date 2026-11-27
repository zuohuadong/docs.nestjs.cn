<!-- 此文件从 content/observability/choosing-an-apm.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:25:04.151Z -->
<!-- 源文件: content/observability/choosing-an-apm.md -->
<!-- 源哈希: 6f7aefc0b4b9aef2273f16c43d02d471 -->

### 选择 APM

没有一个适用于所有 NestJS 应用程序的最佳 APM：正确的选择取决于您的系统中 Nest 的程度、您已运行的现有系统以及除了应用程序本身之外还需要查看哪些信息。本章将人们常用的工具并列展示——[NestJS Observe](/observability/overview), OpenTelemetry, Sentry, Datadog, New Relic 和 Elastic APM——介绍它们在 Nest 应用程序中的设置、它们在 Nest 中能看到什么，以及何时选择哪一个最合适。

#### 简短回答

- **NestJS Observe** 适用于您系统中的 NestJS 服务，无论它是整个后端还是其中的一部分：使用您自己的术语（`OrdersService.create`，而非 `express.middleware`）进行追踪，无需运行任何东西即可获得每次部署的评估，并且开销以微秒计，通过 OpenTelemetry 与用其他语言编写的服务追踪连接。
- **OpenTelemetry** 适用于非 Nest 服务，或者如果您希望在所有服务中（包括 Nest 服务）采用一个厂商中立的标准。
- **Sentry** 如果跨 Web 或移动前端和后端的错误是主要关注点。
- **Datadog 或 New Relic** 如果您希望为多种语言和真实基础设施使用一个平台，并且有人员来运行它。
- **Elastic APM** 如果您已经运行 Elastic Stack，或者数据必须保留在您控制的基础设施上。

它们并非互斥：NestJS Observe 可以独立工作，也可以与您已有的 OpenTelemetry 或平台 APM 并存（参见 [Using more than one](#using-more-than-one)）。

> info **提示** 在您自己的应用程序上尝试 NestJS Observe 大约需要一分钟：在项目中运行 `npx @nestjs/observe link` 并批准它打印的代码。免费套餐无需付款信息，并且 [live demo](https://www.observe-demo.nestjs.com/dashboard?ref=docs-choosing-an-apm 'NestJS Observe live demo') 展示了繁忙服务数据的仪表板，无需注册即可查看。

#### 每个 APM 需要从 Nest 应用程序获取的信息

大多数 APM 代理的工作原理是在库加载时打补丁：HTTP 服务器、路由器、数据库驱动。因此，代理必须在您的应用程序导入任何这些库之前启动，在 Nest 应用程序中这意味着在 `@nestjs/core` 之前和在您的 `AppModule` 之前。

有两种实现方式：在 `node` 命令上使用预加载标志（CommonJS 使用 `--require`，ES 模块使用 `--import` 加上加载器钩子），或者在 `main.ts` 的第一行导入一个插桩文件。从 Nest 模块内部启动代理是脆弱的：到那时，Nest 和代理打补丁的一些库可能已经加载，而先加载的任何内容都将未被记录。所有下述的厂商在其文档中都说同样的话：先启动它。

模块格式比以往更重要。直到 Nest 11，`nest new` 生成的是 CommonJS 项目。Nest 12 的 `nest new` 生成 ES 模块，对于大多数代理来说，ES 模块意味着需要额外的加载器标志，有时插桩的库更少。下文提供了厂商文档中给出的两个命令行。

#### NestJS Observe

NestJS Observe 是由 NestJS 团队专为 Nest 构建的可观测性平台。只需在一个命令中在您的项目中运行即可设置：

```bash
$ npx @nestjs/observe link

```

它会打印一段代码供您在仪表板中批准（如果需要则先注册），然后安装 `@nestjs/observe`，在根模块中注册 `ObserveModule`，将 `instrument` 选项传递给 `NestFactory.create()`，并将 API 密钥写入 `.env`。手动操作也是相同的三个编辑——参见 [Linking from the terminal](/observability/sdk#linking-from-the-terminal) 和 [Quick start](/observability/sdk#quick-start)。没有预加载标志：Nest 通过 `instrument` 钩子将它创建的每个提供者交给 SDK，因此您自己的类不依赖于加载顺序，CommonJS 和 ES 模块的设置是相同的。

**它能看到 Nest 的什么：** 每个提供者。在请求、任务或消息期间，控制器、服务、仓储、守卫、拦截器或管道上的每次方法调用都会成为一个以您命名的跨度，因此 `PricingService.quote` 会在追踪中，而无需任何人添加。队列消费者、`@Cron()` 处理器、GraphQL 解析器和 WebSocket 网关被记录为它们本身的样子，而 BullMQ 或 Bull 任务会与排队的请求共享一个追踪。通过 `pg`、`mysql2`、`mssql` 和 `mongodb`（因此 TypeORM、Drizzle、MikroORM、Mongoose 和 Prisma 的 `pg` 以及 SQL Server 适配器）的查询和出站 HTTP 调用会显示在发起它们的那个方法下。

**它如何处理这些信息：** 每方法的遥测数据是仪表板其余部分读取的内容，因此除了 SDK 外，不需要进行任何设置：

- **每次部署的评估**，针对每个计划：服务器错误是否增加，以及在发布中首次看到的错误组、静默的路由，以及新增、移除或调用频率增加的查询、出站调用和方法。新的 N+1 会被报告为每个请求中发生 44 倍以上的陈述，通常在 p95 移动之前很久就发生了。参见 [Releases and their verdicts](/observability/dashboard#releases-and-their-verdicts)。
- **“发布修复了这个问题吗？”** 对于成为问题的错误，根据该发布在出错路由上的请求进行判断，一旦有足够流量可判断，就会给出 **已修复** 或 **未修复** 的答案。参见 [Issues](/observability/dashboard#问题)。
- **提交给编码代理的失败**：一键将失败的请求或慢任务转换为一个自包含的提示，在付费计划中，[MCP server](/observability/mcp-server) 允许代理查询您的遥测数据并判断其自身的部署。
- **无需配置的警报**：当 Observe 从未见过的错误出现时会收到电子邮件，对于全天候运行的应用程序，当其错误率变得不寻常或静默时，所有计划（包括免费版）都会收到警报。
- **开销很小**：在典型端点的中位延迟上约为十分之一毫秒。根据第三方基准测试衡量其他代理的方式计算，在一个单次调用的端点上是 7 µs/请求，在一个九次调用的端点上是 20 µs，而 Sentry 为 45 µs，Datadog 为 130 µs，New Relic 为 200 µs，OpenTelemetry 为 31-77 µs（参见 [Performance overhead](/observability/overview#performance-overhead) 获取来源和注意事项）。

<figure><img src="https://www.observe.nestjs.com/docs/telemetry/traces.webp" alt="A trace in NestJS Observe, with every provider method as a span" /></figure>

**它比其他工具更受限制的地方：** 它仅在 Node.js 上对 NestJS 进行插桩。其他语言的服务通过 OpenTelemetry 共享其追踪（参见 [Using more than one](#using-more-than-one)），但它们的跨度保留在您的 OpenTelemetry 后端，因为 Observe 不摄取 OTLP。它仅托管，并且不监控超出每个 Node.js 进程自身运行时的基础设施。驱动级别的查询详细信息涵盖 `pg`、`mysql2`、`mssql` 和 `mongodb`；当 Redis 和 Kafka 客户端注册为 Nest 提供者（常规设置）时，它们会显示为跨度，而云 SDK 调用则显示为它们发出的 HTTP 请求。它需要 `@nestjs/core` 11.1.4 或更高版本和 Node.js 20.19 或更高版本，在 Express、Fastify 或（在 Nest 12 中）Node 适配器上运行。

当您一直在问哪个自己的类很慢，或者上一个部署改变了什么时，选择它来监控您的 NestJS 服务，无论您的后端是全部还是部分。[Start on the Free plan](https://www.observe.nestjs.com/?ref=docs-choosing-an-apm 'NestJS Observe') 无需付款信息，或者打开 [live demo](https://www.observe-demo.nestjs.com/dashboard?ref=docs-choosing-an-apm 'NestJS Observe live demo') 查看繁忙服务数据的仪表板，无需注册。

#### OpenTelemetry

[OpenTelemetry](https://opentelemetry.io/ 'OpenTelemetry') 是厂商中立标准：您只需一次性进行仪器化，然后将追踪、指标和日志发送到任何接受 OTLP 的后端——Jaeger、Grafana Tempo 或其他许多摄取它的厂商，例如 Datadog、New Relic 和 Elastic。在 Nest 应用程序中设置它在 [OpenTelemetry → Zero-code setup](/observability/opentelemetry#zero-code-setup) 中有介绍。

**它能看到 Nest 的什么：** 通过 Node.js 自动仪器化，它能看到 HTTP 服务器、路由器、出站调用和各种驱动程序。其 Nest 仪器化 `@opentelemetry/instrumentation-nestjs-core` 在 NestJS 11 及更早版本中添加了三种类型的 span——应用程序创建、名为 `Controller.method` 的请求上下文和路由处理程序——但对底层的提供者则没有。其当前版本 (0.71.0) 支持 `@nestjs/core` 以下版本，因此在 NestJS 12 上它完全不添加 Nest span。

选择它用于非 Nest 的服务，当您希望自己选择（和更改）后端时，或者当数据必须保留在您运行的基础设施上时。在一个同时包含两者（NestJS Observe 和其他系统）的系统中，NestJS Observe 会合并其追踪，并将 Nest 服务的 span 导出到同一个后端。

#### Sentry

Sentry 首先是一个错误追踪器，内置了性能追踪。它有一个官方的 Nest SDK：

```typescript title="instrument.ts"
import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
});

```

```typescript title="main.ts"
// This import comes before everything else
import './instrument.js';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

```

然后从 `@sentry/nestjs/setup` 添加 `SentryModule.forRoot()` 到根模块的导入中，如果还没有捕获所有异常的异常过滤器，请将 `SentryGlobalFilter` 注册为在任何其他过滤器之前的 `APP_FILTER`。

**它能看到 Nest 的什么：** 比任何通用代理都多。Sentry 的 SDK 会为 Nest 的请求管道创建 span——包括中间件、守卫、管道、拦截器、过滤器和路由处理程序，只要它们是 `@Injectable()`——即在 HTTP 和常见的数据库驱动程序之上。您的服务层仍由您自己进行仪器化。

当错误是主要关注点时选择它，尤其是在 Web 或移动前端和后端之间。Sentry 也可以自托管。

#### Datadog

Datadog 的追踪器 `dd-trace` 将追踪发送到您部署在应用程序旁边的 Datadog Agent，该 Agent 会转发它们：

```bash
$ npm i dd-trace
$ DD_SERVICE=orders-api DD_ENV=production node --require dd-trace/init dist/main.js

```

对于 Node.js 20.6 及更高版本的 ES 模块，有一个单标志的简写：

```bash
$ node --import dd-trace/initialize.mjs dist/main.js

```

**它能看到 Nest 的什么：** NestJS 不在 Datadog 的 Node.js 追踪器列出的 Web 框架中；其文档将其列为一个具有自定义入口点的框架，这与仪器化无关，而与加载顺序有关。您会获得 Express 或 Fastify、出站调用、各种驱动程序以及支持的库 BullMQ (5.66 及以上)。一个社区包 `nestjs-ddtrace` 可以将您的控制器和提供者包装在 Datadog span 中。

当您有多种语言并且有实际的基础设施需要监控在应用程序旁边时选择它。

#### New Relic

New Relic 的 Node.js 代理直接报告给 New Relic，无需运行收集器进行 APM：

```bash
$ npm i newrelic
$ NEW_RELIC_APP_NAME=orders-api NEW_RELIC_LICENSE_KEY=... node -r newrelic dist/main.js

```

对于 ES 模块，New Relic 在预加载之外记录了一个加载器，并且一个 `newrelic.js` 配置文件必须变为 `newrelic.cjs`：

```bash
$ node --import newrelic/esm-loader.mjs -r newrelic dist/main.js

```

**它能看到 Nest 的什么：** `@nestjs/core` 在 New Relic 的仪器化模块列表中（版本 10 及以上），该列表按您的 Nest 路由命名事务。低于此版本，您会获得 Express 或 Fastify、出站 HTTP 和包括 `pg`、`mysql2`、`mongodb`、`ioredis` 和 Prisma (`@prisma/client` 5 及以上) 在内的驱动程序。BullMQ 和 Bull 不在列表中，除非您添加它们，否则您自己的提供者不会是 span。当前代理需要 Node.js 22.16 或更高版本。

当您想要一个完整的平台——APM、基础设施、日志、浏览器——并且 Node.js 是多种语言之一时选择它。

#### Elastic APM

Elastic APM Node.js 代理将追踪发送到 APM 服务器，再发送到 Elasticsearch，Kibana 在其中显示它们：

```bash
$ npm i elastic-apm-node
$ ELASTIC_APM_SERVICE_NAME=orders-api \
  ELASTIC_APM_SERVER_URL=https://apm.example.com:8200 \
  ELASTIC_APM_SECRET_TOKEN=... \
  node -r elastic-apm-node/start.js dist/main.js

```

对于 ES 模块，代理的支持在其自己的文档中描述为不完整和实验性的：您添加一个加载器，仍然单独启动代理，并且只有一部分模块（`http`、Express、Fastify、`pg`、`ioredis` 和其他少数几个）被仪器化：

```bash
$ node -r elastic-apm-node/start.js --experimental-loader=elastic-apm-node/loader.mjs dist/main.js

```

**它能看到 Nest 的什么：** NestJS 不在代理支持的框架列表中。它仪器化底层的服务器，因此事务按路由命名，并通过 `pg`、`mysql2`、`mongodb` 和 `ioredis` 记录查询。除非您使用代理的 API 添加，否则您的控制器、服务和仓储不会是 span，BullMQ 和 Bull 也不在其中列表。Elastic 自己的文档现在还建议 EDOT，它是用于 Node.js 的 OpenTelemetry 分发版，它大致能看到 [OpenTelemetry](#opentelemetry) 所做的事情。

当您已经运行 Elastic Stack，或者当数据必须保留在您控制的基础设施上时选择它。

#### Side by side

| | NestJS Observe | Sentry | Datadog | New Relic | Elastic APM |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 设置 | `npx @nestjs/observe link`，或一个模块和一个选项 | 首先导入仪器化文件，模块，过滤器 | `--require dd-trace/init`，加上 Datadog Agent | `-r newrelic` 和一个许可证密钥 | `-r elastic-apm-node/start.js`，加上 APM Server 和 Elasticsearch |
| ES 模块 (Nest 12 的默认) | 相同的设置 | 参见 Sentry 的文档 | `--import dd-trace/initialize.mjs` | `--import newrelic/esm-loader.mjs -r newrelic` | 实验性加载器，模块子集 |
| 识别 Nest 本身 | 为其构建 | 管道跨度（守卫、管道、拦截器、过滤器、处理器） | 未列出 | `@nestjs/core` 列出 10+ | 未列出 |
| 自己的提供者作为跨度，自动 | 是 | 否 | 社区包（`nestjs-ddtrace`） | 否 | 否 |
| BullMQ 任务 | 是，链接到排队请求 | 检查您的设置 | 支持 (5.66+) | 未列出 | 未列出 |
| 除了应用之外运行的组件 | 无 | 无（或自托管） | Datadog Agent | 无 | APM Server、Elasticsearch、Kibana（或 Elastic Cloud） |
| 可自托管 | 否 | 是 | 否 | 否 | 是 |
| 语言 | NestJS；其他语言通过 OpenTelemetry 共享其跟踪 | 许多 | 许多 | 许多 | 许多 |
| 基础设施监控 | 否 | 否 | 是 | 是 | 是 |
| 每个请求的开销（第三方方法） | 7-20 µs | 45 µs | 130 µs | 200 µs | 未在那里测量 |

本章不引用价格：按主机、按席位、按 GB 和按事件的模型不能清晰转换，并且它们会变化。在决定之前，请在每个平台上对您的流量进行定价。NestJS Observe 的计划列于 [Subscribing](/observability/overview#subscribing)。开销行是根据近空端点在不同机器上的第三方基准计算得出的，因此请将其视为一个方向而非排名（参见 [Performance overhead](/observability/overview#performance-overhead)）。

#### 如何选择

- **是否已为其他服务运行 Elastic、Datadog 或 New Relic？** 将 Nest 应用添加到其中，请注意您将看到路由器和驱动程序，而不是您的提供者。如果这还不够，NestJS Observe 可以并排运行以处理应用层。
- **主要担心错误，特别是前端的错误吗？** Sentry。
- **请求路径中有多种语言需要共享一个跟踪吗？** 在非 Nest 服务上使用 OpenTelemetry，在 Nest 服务上使用 NestJS Observe：通过 `openTelemetry` 和 `otlp`，Nest 服务加入相同的跟踪并导出它们的跨度，直到每个提供者方法，到您的 OpenTelemetry 后端，从而显示完整的跟踪。平台 APM 在一个产品中覆盖了每个服务，但它看到的是 Nest 服务的路由器和驱动程序，而不是它们的提供者。
- **数据必须保留在您自己的基础设施上吗？** Elastic、自托管 Sentry 或带有您运行的后端的 OpenTelemetry。
- **一个 NestJS 后端，今天没有跟踪，而且还没有时间设置吗？** 这正是 NestJS Observe 构建的场景：上述设置就是全部设置，免费计划足以看到您首次部署的结果。[Start here](https://www.observe.nestjs.com/?ref=docs-choosing-an-apm 'NestJS Observe')。

#### 使用多个

- **NestJS Observe 与 OpenTelemetry 并存：** 使用 SDK 的 `openTelemetry` 选项，Nest 服务读取并发送 W3C `traceparent`，并加入其他服务共享的跟踪，同时使用 `otlp` 将其跨度——直到每个提供者方法——导出到您的 OpenTelemetry 后端。参见 [Running beside OpenTelemetry](/observability/opentelemetry#running-beside-opentelemetry)。
- **NestJS Observe 与 Datadog 或 New Relic 并存：** 保留平台用于基础设施和您的其他服务，开启 `openTelemetry`，并将 `otlp` 指向平台的 OTLP 端点，这样 Nest 服务的提供者跨度也会包含在其中跟踪中。
- **NestJS Observe 与 Sentry 并存：** 在前端保留 Sentry，并在 Nest 后端添加 NestJS Observe。