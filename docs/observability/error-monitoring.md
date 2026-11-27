<!-- 此文件从 content/observability/error-monitoring.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:39:27.837Z -->
<!-- 源文件: content/observability/error-monitoring.md -->
<!-- 源哈希: 4e23a09ef30271452c1affd92124c049 -->

### 错误监控

错误监控包含在每个[NestJS Observe](https://www.observe.nestjs.com/ 'NestJS Observe') 计划中，免费计划也包含，无需任何额外的[SDK](/observability/sdk)。一旦您的应用程序被仪器化，任何逃逸出控制器、解析器或队列消费者的错误都会被捕获，包括导致错误的请求、抛出错误的代码以及它运行的追踪。本页面涵盖了捕获了什么、如何将发生情况分组为缺陷、如何通知您有新缺陷，以及错误如何转化为已验证的修复。

> info **提示** 在安装任何东西之前，请打开[live demo](https://www.observe-demo.nestjs.com/dashboard 'NestJS Observe live demo')。它显示了繁忙服务的错误、分组的缺陷和带有源的堆栈跟踪，无需注册。

#### 捕获了什么

从控制器、解析器、任务或跨度传播出去的错误会自动记录，涵盖 HTTP、GraphQL、gRPC 和`@nestjs/microservices` 传输，以及队列消费者和定时任务。无需注册错误处理器，也无需从您的[exception filters](/overview/exception-filters) 中调用任何内容。过滤器仍然决定客户端看到什么，SDK 在错误到达过程中观察到失败，因此两者并行工作。

错误不是以分离的日志行存储的。单个错误**就是**失败的请求，因此其详情页面是请求自身的页面，首先显示失败信息：错误类、消息、堆栈跟踪和源代码，然后是请求的上下文，接着是追踪瀑布图和该请求期间写入的日志。当 HTTP 请求失败时，SDK 还会记录其少量允许列表的头部信息，以及可选的请求体（参见[Capturing failed and slow requests](/observability/sdk#capturing-failed-and-slow-requests)）。抛出错误的任务运行会被记录为失败运行，包括其失败原因和尝试次数，在**任务**视图中可见。

<figure><img src="https://www.observe.nestjs.com/docs/telemetry/errors.webp" alt="Errors view" /></figure>

并非所有错误都是 Bug。您的代码有意抛出的异常，例如`NotFoundException` 或验证失败，仍然会显示在**错误**视图中，因为它仍然是一个失败的请求，但它不会计为新的缺陷以进行警报。只有未处理的失败才算：请求返回 5xx 的错误，或在没有 HTTP 状态码的入口点（如 RPC 处理器或网关消息）上失败的错误。

#### 源上下文

生产环境的堆栈跟踪通常指向您未检出的编译输出。启用`sourceContext`（默认设置）后，SDK 会读取捕获的错误中每个应用内帧周围的源代码行并将其一并发送，因此仪表板会在堆栈跟踪旁边显示失败的代码：

```typescript title="app.module.ts"
export const { ObserveModule, ObserveInstrument } = createObserveModule({
  sourceContext: {
    linesOfContext: 5,
    maxFrames: 5,
  },
});

```

要查看 TypeScript 而不是编译后的 JavaScript，请使用支持源映射的 Node 运行（`--enable-source-maps` 或 `process.setSourceMapsEnabled(true)`），或者将`sourceContext.sourceMaps: true` 设置为让 SDK 自己解析编译帧。内部的`node_modules` 和 Node 内部代码永远不会被读取。有关每个选项，请参阅[Error source context](/observability/sdk#错误源代码上下文)。

<figure><img src="https://www.observe.nestjs.com/docs/telemetry/error-with-source.webp" alt="Error card with source context" /></figure>

> warning **警告** 源上下文会将应用程序的几行源代码发送到您的仪表板，并与错误一起存储。如果您的代码库不允许发送任何源代码，请设置`sourceContext: false`。

#### 已处理的错误

您捕获并从错误中恢复的错误永远不会传播，因此不会被自动捕获。当您仍希望其可见时，请在`TracerService` 上使用`captureError()` 报告它：

```typescript
try {
  await this.billing.sync(accountId);
} catch (error) {
  await this.tracerService.captureError(error as Error, {
    accountId,
    retryable: 'true',
  });
}

```

该错误附加到当前的追踪上，并附带可选的标签，并获得与任何其他捕获错误相同的源上下文。参见[Capturing handled errors](/observability/manual-instrumentation#capturing-handled-errors)。

#### 将错误分组为缺陷

3,140 个`TypeError` 的激增算作一个 Bug，而不是 3,140 个。在错误页面上的**分组为缺陷**开关会将具有相同异常类和相同规范化堆栈形状的发生情况合并为一个**错误组**，在服务器端指纹化，无论消息措辞如何、行号如何移动或哪个部署产生了它。

<figure><img src="https://www.observe.nestjs.com/docs/telemetry/defects.webp" alt="Errors grouped into defects" /></figure>

一个组携带的是需要进行分类的信息，而不是单个发生情况的详细信息：

| 字段 | 告诉您的信息 |
| :--- | :--- |
| 类和样本消息 | 缺陷是什么，取自其首次发生 |
| 状态 | 已打开、已解决或已忽略 |
| 首次和最后出现时间 | 是否是新出现的、持续的或已消失 |
| 引入时间 | 首次发生时运行的发布版本，以及报告时间 |
| 发生次数 | 在所选窗口内触发的频率，而非全部时间 |
| 问题 | 如果有，被提升到的[issue](/observability/dashboard#问题) |

**引入时间**来自您的应用程序报告的`serviceVersion`（语义版本或提交哈希，传递给[`forRoot()`](/observability/sdk)）。没有它，一个组无法知道它是在哪个部署中出现的。

两个关闭状态是故意不对称的。**已解决**是对代码的声明，因此已解决的组一旦错误再次发生就会重新打开；一个未生效的修复会显示出来，而不是静静地保持绿色。**已忽略**是对噪音的决策，并且保持忽略状态。

#### 获取通知

每个计划（包含免费计划）都自带一个**新错误邮件**，无需设置规则：每个项目会收到一封邮件，列出它以前从未见过的错误，每天最多六封。每个成员可以在**设置 → 新错误邮件**下为自己关闭此功能。免费计划还会持续监控每个应用程序，以检测异常错误率，每 30 天每个账户最多收到一封警报邮件。

在付费计划中，[alert rules](/observability/dashboard#alerts) 更进一步，首先是每个应用程序都拥有的异常错误率规则：

- **新错误组**规则在首次出现缺陷时触发，该缺陷可能影响单个应用程序或整个项目。它通过电子邮件、Slack、Webhook 或应用内通知进行通知，或者通过打开一个问题来通知。
- **错误率**规则监控应用程序中发生服务器错误 (5xx) 的请求比例，或针对单个路由和方法，将其与固定阈值或其自身的近期基线进行比较，并进行异常检测。
- **任务失败率**规则对队列消费者和定时任务执行执行相同的功能。

在更高层级中，可用性 [SLO](/observability/dashboard#slos)（未处理错误完成请求的请求比例）将相同的错误转化为错误预算，并提供燃烧率警报。

#### 从错误到修复

由于每个错误已经携带了其堆栈跟踪、源行、跟踪和日志，其页面上的**复制代理提示**会将所有内容打包成一个自包含的提示，供 Claude Code、Cursor 或任何已打开您代码仓库的编码代理工具使用。连接到 [MCP server](/observability/mcp-server) 的代理可以做得更多：列出带有引入版本的错误组，拉取带有跟踪 ID 的近期发生实例，判断错误是增长还是衰减，并查看受影响的用户。

要跟踪工作，只需单击即可将错误组提升为一个 [issue](/observability/dashboard#问题)；提升一个已存在开放问题的组时，它会链接到现有问题而不是打开第二个问题。在解决它之前，问题上的**发布是否修复了此问题？**会根据生产环境的请求、错误发生的路由以及该错误在此之前发生的频率来判断一个发布。代理使用 `verify_fix` 在 [MCP server](/observability/mcp-server) 上提出相同的问题。当您将问题标记为已解决（可选地命名修复所包含的发布）时，仪表板会监控受影响的操作与其事件前基线进行比较，一旦修复保持有效则关闭问题，否则会用导致其失效的读数重新打开它。

部署后，**发布**视图会将每个 `serviceVersion` 与其之前的版本进行比较，包括错误率，因此回归问题会显示为两个版本之间的差异，而不是在一周图表中某个地方的增幅。每个发布的 [verdict](/observability/dashboard#releases-and-their-verdicts) 还列出了首次在该发布中看到的错误组。