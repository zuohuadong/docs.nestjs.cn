<!-- 此文件从 content/observability/sdk.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-13T12:06:34.502Z -->
<!-- 源文件: content/observability/sdk.md -->
<!-- 源哈希: 32a2732dcf15807c572ab72298ef4c1f -->

### SDK

`@nestjs/observe` SDK 负责将应用程序的请求、任务、错误、日志和追踪数据送入你的 [NestJS Observe](https://www.observe.nestjs.com/ 'NestJS Observe') 仪表盘。它直接接入 Nest 自身的请求生命周期——控制器、拦截器、解析器、队列消费者——而不是在进程上挂载一个通用的 Node.js 代理，因此仪表盘中显示的大部分内容无需手动进行 span 埋点。

#### 安装

```bash
$ npm i @nestjs/observe

```

> warning **警告** 该 SDK 要求 `@nestjs/core` v11.1.4 或更高版本（它依赖于该版本引入的 `instrument` 应用程序选项），如果您的应用程序使用 GraphQL，则要求 `@nestjs/graphql` v13.4.4 或更高版本。更早的版本缺少 SDK 进行正确插桩所需的钩子。

#### 快速开始

集成只需三步。首先，调用一次 `createObserveModule()`，通常在 `app.module.ts` 或其他根级文件中。它会返回一对匹配项——一个 Nest 模块和一个 `instrument` 钩子——绑定到相同的配置：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY,
      appSecret: process.env.OBSERVE_APP_SECRET,
      serviceId: 'cats-app',
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

```

其次，将 `ObserveModule.forRoot()` 导入到你的根模块中，并至少提供一个 `serviceId`（如上所示）。第三，将 `ObserveInstrument` 传递给 `NestFactory.create()`，以便 SDK 能在应用程序开始处理流量之前附加到应用上：

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

> warning **Fastify** 使用 `FastifyAdapter`（或任何显式适配器）时，适配器占据第二个参数位置，因此应用程序选项——以及其中的 `instrument`——需要移到**第三个**参数：
>
> ```typescript
> const app = await NestFactory.create<NestFastifyApplication>(
>   AppModule,
>   new FastifyAdapter(),
>   { instrument: ObserveInstrument },
> );
> ```

>
> 如果将选项对象作为第二个参数与适配器一起传递，它们会被静默丢弃，SDK 将永远不会附加。

这就是完整的集成。一旦应用程序开始接收流量，请求、错误和追踪数据就会在片刻之内出现在你项目的仪表盘中——无需配置导出器，无需设计模式。`NestFactory.createMicroservice()` 和 `NestFactory.createApplicationContext()` 也接受相同的 `instrument` 选项，因此工作进程和独立应用程序以相同的方式进行插桩。

> info **提示** `createObserveModule()` 本身接受一个选项对象，用于控制追踪 ID 的生成方式以及错误源上下文的捕获方式——请参阅下面的 [Trace correlation](#追踪关联) 和 [Error source context](#错误源代码上下文)。其他所有内容都通过 `ObserveModule.forRoot()` 进行配置。

#### 认证与识别应用程序

```typescript
ObserveModule.forRoot({
  appKey: process.env.OBSERVE_APP_KEY,
  appSecret: process.env.OBSERVE_APP_SECRET,
  serviceId: 'cats-app',
  serviceVersion: process.env.GIT_SHA,
});

```

| 选项           | 类型     | 默认值  | 描述                                                                                                                                                                                                |
| ---------------- | -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `appKey`         | `string` | -        | 从你项目的 **API 密钥** 页面生成——请参阅 [First project](/observability/overview#第一个项目)。请勿将其提交到源代码管理中。                                                              |
| `appSecret`      | `string` | -        | 与 `appKey` 在同一页面签发。请勿将其提交到源代码管理中。                                                                                                                               |
| `serviceId`      | `string` | 必填 | 用于在仪表盘中标识此应用程序。如果你运行同一服务的多个实例，请为每个实例使用唯一标识（主机名、容器 ID），以便它们在性能分析器中可区分。 |
| `serviceVersion` | `string` | -        | 用于标识部署——语义化版本、提交哈希或任何其他标识符。每个请求和任务都会记录服务它的版本，这正是 **发布** 视图的数据来源。              |

传递 `serviceVersion` 是可选的，但强烈建议提供：它让仪表盘能够将应用程序的每个版本与之前的版本进行比较（错误率、延迟、吞吐量并排对比），从而使部署引入的回归问题立即可见，而不是埋没在长达一周的图表中。

<figure><img src="https://www.observe.nestjs.com/docs/sdk/deployments.webp" alt="Releases" /></figure>

#### 异步配置

当凭据来自配置提供者而非直接来自 `process.env` 时，请使用 `forRootAsync()`——它接受与所有其他 Nest 动态模块相同的 `useFactory`/`inject`、`useClass` 和 `useExisting` 形式（一个实现 `ObserveOptionsFactory` 并带有 `createObserveOptions()` 方法的类），此外还支持 `extraProviders` 和 `global`：

```typescript title="app.module.ts"
ObserveModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    appKey: config.getOrThrow('OBSERVE_APP_KEY'),
    appSecret: config.getOrThrow('OBSERVE_APP_SECRET'),
    serviceId: config.get('SERVICE_ID', 'cats-app'),
    serviceVersion: config.get('GIT_SHA'),
  }),
});

```

#### 将用户与遥测数据关联

`getUserId` 读取传入的请求并返回你的系统用于标识个人的任何标识符——用户 ID、账户 ID、租户作用域 ID。只需设置一次，**用户** 视图便会自动填充：

```typescript
ObserveModule.forRoot({
  // ...
  http: {
    getUserId: (req) => req.user?.id ?? 'anonymous',
  },
});

```

相同的选项也存在于 `rpc`（接收传输器 ID 和 `BaseRpcContext`）、`grpc`（接收调用对象）和 `graphql`（接收 GraphQL 上下文，用于没有外层 HTTP 请求的操作）上，它们读取的是传输器自身的上下文而非 HTTP 请求。报告用户标识符完全是可选的——没有用户标识符的流量仍然会出现在除按用户视图之外的所有地方。仪表盘将标识符视为不透明字符串，绝不会尝试将其解析为姓名或电子邮件，因此请优先使用不透明的内部 ID，而不是任何个人身份信息。

#### 运行时指标与性能分析

```typescript
ObserveModule.forRoot({
  // ...
  runtimeMetrics: true,
  runtimeMetricsInterval: 60000,
});

```

`runtimeMetrics`（默认 `true`）按时间间隔（`runtimeMetricsInterval`，默认 `60000` 毫秒）对内存、CPU、垃圾回收和事件循环延迟进行采样，并将数据提供给 **性能分析器**。相同的采样数据还兼作应用程序的心跳：当它们停止到达时，会触发 **遥测静默** 警报，这为你提供了轻量级的运行时间监控，无需外部探针。

#### 日志

```typescript
ObserveModule.forRoot({
  // ...
  forwardLogs: true,
  redaction: {
    enabled: true,
    keys: ['internalToken'],
    patterns: [/acct_[a-z0-9]{16}/gi],
  },
});

```

`forwardLogs`（默认 `false`）将应用程序的日志行——所有通过 Nest 的 `Logger` 写入的内容——发送到仪表盘，并与每条日志写入时处于活动状态的追踪相关联。在执行页面上，每一行都被放置在追踪的时间线上，紧邻写入时正在进行的跨度。日志转发在 Pro 及以上版本可用。

开启 `forwardLogs` 会将日志行移动到您无法控制的基础设施上，因此一旦开启，脱敏功能默认即处于启用状态：

| `redaction` 字段 | 类型 | 默认值 | 描述 |
| -------------------- | ---------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled` | `boolean` | `true` | 是否对日志行进行脱敏处理。 |
| `useDefaultPatterns` | `boolean` | `true` | 应用内置模式：bearer 令牌、JWT、AWS 密钥 ID、PEM 私钥、`key=value` 机密以及通过 Luhn 校验的卡号。仅当您完全用自己的 `patterns` 替换它们时才禁用——不支持未经脱敏转发日志的场景。 |
| `patterns` | `RegExp[]` | - | 额外的掩码模式，用于处理只有您的代码库才知道形状的机密——内部令牌前缀、客户标识符。始终全局应用，因此匹配不会仅限于一行中的首次出现。 |
| `keys` | `string[]` | - | 在内置列表之外，额外属性键的值将被直接掩码。比较时忽略大小写以及 `-`/`_`，因此 `apiKey`、`api_key` 和 `API-KEY` 属于同一条目。 |
| `replacement` | `string` | `'[REDACTED]'` | 替换所有匹配内容的文本。 |

> info **提示** 即使关闭 `forwardLogs`，SDK 也会增强 `ConsoleLogger`，使每一行都携带当前的追踪 ID（`attachTraceIdToLogs`，参见 [Trace correlation](#追踪关联)）。这样您就可以将自己的日志聚合器与仪表盘中的追踪关联起来，而无需将日志内容发送到任何地方。

#### 错误源码上下文

从控制器、解析器、任务或跨度中传播出来的错误会被自动捕获。当 `sourceContext` 启用时（默认启用），SDK 还会读取捕获错误中每个应用内栈帧周围的源码行并将其附加，这使得仪表盘能够在堆栈跟踪旁边显示出错的代码——即使该故障发生在生产环境中、且构建版本您可能尚未检出。

```typescript title="app.module.ts"
export const { ObserveModule, ObserveInstrument } = createObserveModule({
  sourceContext: {
    linesOfContext: 5,
    maxFrames: 5,
    sourceMaps: false,
  },
});

```

请注意，这是 `createObserveModule()` 的一个选项，而非 `forRoot()`。设置 `sourceContext: false` 可完全禁用它，或传入对象来调整默认值：

| 选项 | 类型 | 默认值 | 描述 |
| ---------------- | --------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `linesOfContext` | `number` | `5` | 在帧所在行的两侧读取的行数。 |
| `maxFrames` | `number` | `5` | 从堆栈顶部开始计算，有多少个应用内帧会附加源码——限制深层堆栈上的载荷大小。 |
| `sourceMaps` | `boolean` | `false` | 在读取源码之前，通过源码映射将编译后的帧解析回原始位置。仅当进程在没有 Node 自身源码映射支持（`--enable-source-maps` 或 `process.setSourceMapsEnabled(true)`）的情况下运行编译输出时才需要；启用该支持后，帧已携带原始位置，此选项即为冗余。首次访问每个编译文件时会产生一次映射解析开销，之后会缓存。 |

> warning **警告** 启用此选项会将应用程序源码的片段（通常只是错误周围的几行）发送到仪表盘，并与错误一起存储。`node_modules` 内部和 Node 内部的帧永远不会被读取——仅读取应用程序源码——但如果您的代码库不允许发送任何源码，请将其关闭。

<figure><img src="https://www.observe.nestjs.com/docs/telemetry/error-with-source.webp" alt="Error card with source context" /></figure>

#### 追踪关联

这些也是 `createObserveModule()` 的选项——它们决定了请求如何获取追踪 ID，以及该 ID 如何出现在您自己的日志中：

```typescript title="app.module.ts"
import { randomUUID } from 'node:crypto';

export const { ObserveModule, ObserveInstrument } = createObserveModule({
  traceIdKey: 'traceId',
  traceIdGenerator: (req) => req.headers['x-request-id'] ?? randomUUID(),
  attachTraceIdToLogs: true,
});

```

| 选项                | 类型                       | 默认值                                                       | 描述                                                                                                                         |
| --------------------- | -------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `traceIdKey`          | `string`                   | `'traceId'`                                                   | 用于在请求上下文中存储追踪 ID 的键，便于后续通过 `TracerService` 检索。                                                            |
| `traceIdGenerator`    | `(req: unknown) => string` | 使用 `x-request-id` 请求头（如果存在），否则使用随机 UUID | 为每个请求生成追踪 ID。对于 HTTP，使用请求对象调用；对于其他协议，则接收传输上下文。 |
| `attachTraceIdToLogs` | `boolean`                  | `true`                                                        | 增强 `ConsoleLogger`，将追踪 ID 包含在日志消息中，这样即使没有 `forwardLogs`，日志也能与追踪关联。 |

由于默认生成器会采用传入的 `x-request-id`，因此 HTTP 服务链无需额外配置即可共享同一条追踪。跨 gRPC、`@nestjs/microservices` 传输和 GraphQL 传播只需几行代码——参见 [Distributed tracing](/observability/distributed-tracing)。

#### 标签和自定义属性

`http`、`rpc`、`grpc`、`graphql` 和 `jobs` 各自接受相同的两个选项，用于将您自己的数据附加到它们覆盖的每个请求上：

| 选项          | 适用范围                                                       | 描述                                                                         |
| --------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `tags`          | 为每个请求附加相同的静态 `Record<string, string>`     | 适用于不随调用变化的常量——`project`、`env`、`region`。           |
| `setAttributes` | 请求/调用/任务的函数，返回键值对 | 适用于随调用变化的内容——功能开关、租户 ID、队列名称。 |

```typescript
ObserveModule.forRoot({
  // ...
  http: {
    tags: { project: 'cats-app', env: process.env.NODE_ENV ?? 'development' },
    setAttributes: (req) => ({
      'user-agent': req.headers['user-agent'],
      'client-ip': req.ip,
    }),
  },
  jobs: {
    setAttributes: (job) => ({ queueName: job.queueName, jobName: job.name }),
  },
});

```

两者都会作为标签出现在生成的请求、任务或跨度上，并且可以在其详情页面上搜索和查看。该函数接收传输层提供的任何内容：`http` 的请求、`rpc` 的传输 ID 和 `BaseRpcContext`、`grpc` 的调用对象、`graphql` 的解析信息和 GraphQL 上下文，以及 `jobs` 的 `{ queueName, name, id }`。要从代码内部标记单个跨度而不是每个请求，请使用 `TracerService`——参见 [Manual instrumentation](/observability/manual-instrumentation)。

> info **提示** GraphQL 服务器通常是一个 HTTP 端点，因此其请求已经受 `http` 选项的约束——`http.ignore` 会在 GraphQL 层看到请求之前丢弃请求，而 `http.getUserId` 为通过 HTTP 的查询提供用户。`graphql` 块调整的是被放行的请求_内部_发生的情况，按操作而非按解析器进行，而 `graphql.getUserId` 仅用于尚未处于 HTTP 追踪中的操作——特别是通过 WebSocket 的订阅。

#### 忽略嘈杂的操作

每个传输块都有一个 `ignore` 选项，用于完全跳过匹配调用的插桩——健康检查端点、内部探针，任何不值得追踪的内容：

```typescript
ObserveModule.forRoot({
  // ...
  http: {
    ignore: ['/health', { method: 'GET', path: /^\/internal\// }],
  },
  rpc: {
    ignore: (transportId, ctx) =>
      ctx instanceof TcpContext && ctx.getPattern() === 'ping',
  },
  grpc: {
    ignore: (call) => call.getPath().endsWith('/Health/Check'),
  },
  graphql: {
    ignore: (info) => info.fieldName === 'healthcheck',
  },
});

```

`http.ignore` 接受路径数组、`{ method, path }` 对（`path` 可以是字符串或 `RegExp`）以及普通 `RegExp`——或者接受一个针对请求的谓词函数。`rpc.ignore`、`grpc.ignore` 和 `graphql.ignore` 是针对传输层自身上下文的谓词（分别是 `@nestjs/microservices` 传输 ID 和 `BaseRpcContext`、gRPC 调用对象和 GraphQL 解析信息）。匹配 GraphQL 字段名会跳过该字段所引导的整个操作，而不仅仅是该字段——操作是端到端衡量的，因此要么被追踪，要么不被追踪。

这会完全停止生成遥测数据，这与仪表盘的成本控制丢弃过滤器是不同的工具——后者在摄取时丢弃已生成的事件以节省计费量。当您不希望追踪存在时，`ignore` 是正确的选择；当您想调整 SDK 已生成数据的成本时，丢弃过滤器是正确的选择。

`http` 额外接受 `queryParamsObfuscateRegex`，这是一个 `RegExp`，用于在发送前屏蔽敏感的查询字符串值。它是在内置脱敏之上应用的，内置脱敏始终会屏蔽已知的敏感参数（`token`、`password`、`code`、`signature` 等），无论是否设置此项。

#### 追踪采样和批处理

```typescript
ObserveModule.forRoot({
  // ...
  tracesSampleRate: 0.25,
  maxTracesPerBatch: 1000,
  flushInterval: 5000,
});

```

| 选项              | 类型                                                                       | 默认值 | 描述                                                                                               |
| ------------------- | -------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------- |
| `tracesSampleRate`  | `number \| ((protocol: 'http' \| 'rpc' \| 'grpc' \| 'graphql', attributes) => boolean)` | `1.0`   | 发送的追踪比例，或用于逐追踪决策的谓词。`1.0` 发送所有内容；`0.1` 发送 10%。 |
| `maxTracesPerBatch` | `number`                                                                   | `1000`  | 限制每批发送的追踪数量，以限制高流量应用的体积。                      |
| `flushInterval`     | `number`（毫秒）                                                              | `5000`  | SDK 批处理和发送收集到的追踪的频率。                                                                                     |

遥测数据在进程中进行缓冲，并按照刷新间隔进行发送，而不是随每个请求内联发送。此处的采样决定了 SDK _生成_ 的内容；仪表盘上的按项目支出控制（跨度采样、速率上限、丢弃过滤器）作用于已发送的数据，并且可以在不重新部署的情况下进行更改。

#### 收集器端点

```typescript
ObserveModule.forRoot({ endpoint: 'https://observe-api.nestjs.com' });

```

`endpoint`（默认值 `'https://observe-api.nestjs.com'`）是收集器的基本 URL，同时用于遥测和性能分析，因此两者永远不会指向不同的位置。设置 `OBSERVE_ENDPOINT` 环境变量即可在不修改配置的情况下覆盖它——这通常是指向本地或自托管收集器的方式。

#### 调试 SDK 本身

```typescript
ObserveModule.forRoot({ debug: true });

```

`debug`（默认值 `false`）将 SDK 的额外诊断信息记录到控制台——在调试插桩时很有用，但不适合在生产环境中保持开启。

#### 完整配置参考

所有配置一目了然。`createObserveModule()` 下的选项必须在该处设置；其他所有选项则放在 `forRoot()`/`forRootAsync()` 中。

| 位置                   | 选项                                | 用途                                                                   |
| ----------------------- | ------------------------------------- | ------------------------------------------------------------------------- |
| `createObserveModule()` | `sourceContext`                       | 将源代码行附加到错误堆栈帧                                 |
| `createObserveModule()` | `traceIdKey`                          | 存储跟踪 ID 的上下文键                                  |
| `createObserveModule()` | `traceIdGenerator`                    | 每个请求如何获取其跟踪 ID                                     |
| `createObserveModule()` | `attachTraceIdToLogs`                 | 为 `ConsoleLogger` 输出添加跟踪 ID 前缀                           |
| `forRoot()`             | `appKey`, `appSecret`                 | 项目 API 密钥对                                                      |
| `forRoot()`             | `endpoint`                            | 收集器基本 URL（或 `OBSERVE_ENDPOINT`）                                |
| `forRoot()`             | `serviceId`, `serviceVersion`         | 应用程序和发布标识                                          |
| `forRoot()`             | `http`, `rpc`, `grpc`, `graphql`, `jobs` | 按传输方式设置 `tags`、`setAttributes`、`getUserId`、`ignore`           |
| `forRoot()`             | `http.queryParamsObfuscateRegex`      | 屏蔽敏感的查询字符串值                                        |
| `forRoot()`             | `runtimeMetrics`, `runtimeMetricsInterval` | 性能分析器采样和心跳                                       |
| `forRoot()`             | `forwardLogs`, `redaction`            | 日志流式传输和清洗                                              |
| `forRoot()`             | `tracesSampleRate`                    | 要发送的跟踪比例（或谓词）                                 |
| `forRoot()`             | `maxTracesPerBatch`, `flushInterval`  | 批处理                                                                  |
| `forRoot()`             | `debug`                               | SDK 诊断                                                           |

#### 下一步

- [Manual instrumentation](/observability/manual-instrumentation) - 添加自定义跨度、捕获已处理的错误、附加请求作用域属性，并报告自定义指标。
- [Distributed tracing](/observability/distributed-tracing) - 在 HTTP、gRPC、微服务传输和 GraphQL 之间保持单一跟踪。
- [Dashboard](/observability/dashboard) - SDK 运行后会显示什么，以及各个视图之间的关系。