<!-- 此文件从 content/observability/overview.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:29:15.078Z -->
<!-- 源文件: content/observability/overview.md -->
<!-- 源哈希: f9f12b77631a2b2fc54bc08eb9ac3393 -->

### 概述

[NestJS Observe](https://www.observe.nestjs.com/ 'NestJS Observe') 是 NestJS 应用程序的官方、自动插桩的应用程序性能监控 (APM) 和可观测性平台。安装 SDK，添加 API 密钥，您的应用程序就会开始将请求、后台任务、错误、日志和追踪流式传输到您的仪表板——无需手动连接 Span，无需运行收集器，无需设计模式，无需手动构建仪表板。

> info **提示** 本章介绍如何使用 `@nestjs/observe` SDK 对 NestJS 应用程序进行插桩，以及这种插桩能提供什么。如果您正在寻找仪表板本身，请参阅 [observe.nestjs.com](https://www.observe.nestjs.com/ 'NestJS Observe')，或者打开 [live demo](https://www.observe-demo.nestjs.com/dashboard 'NestJS Observe live demo')——一个无需注册、无需安装的繁忙服务数据的完整仪表板。

#### 与通用 Node.js APM 的区别

通用 Node.js APM 代理会附加到 HTTP 服务器和数据库驱动程序，而忽略中间的所有内容，将其视为黑盒。NestJS Observe 是围绕 Nest 自身的请求生命周期构建的——控制器、守卫、拦截器、管道、解析器、队列消费者——因此遥测信息使用您编写代码的词汇来表达：`OrdersService.recalculate`，而不是 `POST /orders`。这也是它不仅能按路由，还能按 NestJS **类和方法** 显示花费时间的原因，也是为什么未修改的应用程序的追踪瀑布图看起来就像调用图一样的原因。

SDK 通过 `NestFactory.create()` 的 `instrument` 应用程序选项（自 `@nestjs/core` v11.1.4 起可用）附加到框架，因此它会像 Nest 编排的那样看到每一个控制器、提供者、解析器和队列消费者——没有进程范围的打补丁，并且在其余代码之前无需导入任何内容。

它不是 OpenTelemetry 的替代品：Observe 独立地或与您已有的 OpenTelemetry 并行地覆盖了您系统中的 Nest 服务（无论是全部后端还是其中一部分），而用其他语言编写的服务则通过 OpenTelemetry 共享其追踪信息。请参阅 [OpenTelemetry](/observability/opentelemetry#running-beside-opentelemetry)。

#### 它提供什么

一旦 SDK 运行，每个套餐（包括免费套餐）都提供：

- **请求监控**：针对 HTTP、GraphQL、gRPC 和 `@nestjs/microservices` 传输的吞吐量、延迟（平均值和 p95）、每个操作的失败率，以及每个执行的详细信息页面。
- **分布式追踪**：包含请求运行的每个 Span 的瀑布图、自时间排名以找出时间实际花费在哪里，以及在传播追踪 ID 后跨服务进行关联（参见 [Distributed tracing](/observability/distributed-tracing)）。
- **错误监控**：包含堆栈跟踪、失败帧周围的源行，以及将发生次数分组为缺陷的服务器端分组。
- **任务**：队列消费者和定时任务（例如 BullMQ）与请求获得相同的处理，外加队列等待时间和重试尝试次数。
- **服务**：按类、按方法的自身时间与应用程序总时间的细分。
- **运行时分析**：CPU、内存、事件循环延迟和利用率以及垃圾回收，从进程内部采样并按实例比较。
- **发布**：每个请求和任务都会记录提供它的版本，每个发布都会得到一个裁决：部署是否使情况恶化，以及自那时以来哪些查询、出站调用和方法表现不同（参见 [Releases and their verdicts](/observability/dashboard#releases-and-their-verdicts)）。
- **自定义指标**：从您自己的代码中报告的计数器、仪表和摘要。
- **用户**：按用户活动分组，按他们实际执行的操作分组，前提是您的应用程序报告了用户标识符。
- **问题**：项目范围的跟踪，用于发现的遥测工作，包含事件记录，检查发布是否修复了错误，以及在解决问题后与事件前基线的验证。
- **内置警报**：当 Observe 从未见过的错误出现时发送电子邮件，对于全天候运行的应用程序，当其错误率变得异常或静默时发出警报。
- **复制代理提示**：一键将失败的请求、缓慢的任务或失败的追踪转换为用于编码代理的自包含提示。

付费套餐增加了**日志流式传输**（与追踪相关联，默认进行脱敏）、**警报规则**（阈值、异常检测、缺失检测、Slack/webhook/电子邮件通道，以及每个应用程序的入门集）、针对每个保留追踪的 **[production rules](/observability/production-rules)**、公共 **[status pages](/observability/dashboard#status-pages)**、带有审计日志的团队管理，以及一个 **MCP 服务器**，以便 MCP 兼容的代理可以查询您的遥测、判断自己的部署并设置新服务（参见 [MCP server](/observability/mcp-server)）。更高层级增加了带有错误预算和燃尽率警报的 **SSO** 和 **SLO**。

#### 组织结构

NestJS Observe 将您的遥测组织在三个层次上：

- **团队** 是用户集合。每个项目只属于一个团队，团队成员资格是您授予某人同时访问多个项目的方式。订阅是按团队管理的。
- **项目** 是一起部署的应用程序集合，通常每个产品或环境一个（例如 `storefront-production`、`storefront-staging`）。项目是警报、问题、SLO 和 API 密钥的作用域。
- **应用程序** 是单个 NestJS 服务——一个 REST API、一个工作进程、一个微服务——使用 SDK 进行插桩并报告给一个项目。一个项目通常有多个应用程序（例如 Web API 和其背后的队列工作进程），因此您可以将它们视为一个系统，同时仍可过滤到其中任何一个。

<figure><img src="https://www.observe.nestjs.com/docs/overview/projects.webp" alt="Projects overview" /></figure>

每个项目成员拥有三种访问级别之一——**读取**、**写入** 或 **管理员**——控制他们是否可以查看遥测数据、创建警报规则、应用程序和 API 密钥，或管理成员和支出控制。

#### 订阅

在 [observe.nestjs.com](https://www.observe.nestjs.com/ 'NestJS Observe') 注册。**免费** 计划无需支付详细信息，已包含错误监控、分布式跟踪和自动插桩，因此您可以在决定是否需要更多功能之前，先插桩一个应用程序并查看实际的跟踪数据。

使用量以**可观测性事件 (OEs)** 计量——每个 **请求**、后台 **任务** 运行、错误、日志条目或您的应用程序报告的跟踪跨度计为一个事件。事件是累加而不是合并的：一个经过您自己三个方法的 **请求**、写入两条日志行并引发一个错误的事件，计为七个事件。代理自身的数据库 **查询** 和出站 **HTTP** 跨度不计入，因为它们是已计入的方法跨度的详细信息。您的计划设置了每月包含事件的限额、保留窗口以及解锁的功能：

| 计划 | 每月包含事件数 | 保留时间 | 日志和警报 | SSO 和 SLO |
| :--- | :---: | :---: | :---: | :---: |
| Free | 300k | 3 天 | ✗ | ✗ |
| Pro | 25M | 30 天 | ✓ | ✗ |
| Scale | 200M | 90 天 | ✓ | ✓ |
| Enterprise | 协商确定 | 协商确定 | ✓ | ✓ |

Free 在超出限额后仍会记录 **请求**、**任务** 和错误，但会分阶段减少详细信息：

- **限速日**。一旦您的应用程序在一个 UTC 日内发送了 30,000 个事件（每月限额的十分之一），大多数跟踪瀑布图将暂停直到 00:00 UTC，因此一个高噪声的日期不会消耗整个月的配额。被暂缓的跨度不计入限额。
- **超过 300k 事件后减少摄取**。图表保持实时，但大多数跟踪到达时缺少其跨度。
- **拒绝，达到 600k 事件**。达到两倍限额时，收集器会使用 `429` 回复新的遥测数据，直到下一个周期。它被丢弃，而不是排队。

在限速日或减少摄取期间，服务器错误、失败的 **任务** 和任何慢于 1 秒的事件都会保留完整的跟踪信息。Pro 和 Scale 允许超额使用而不是硬性停止，按每额外一百万事件计费，因此繁忙的月份不会意味着丢失遥测数据。

对于保留数据超过 7 天的计划，快速且成功的 **执行上下文**（少于 1 秒，无 5xx，无失败 **任务**）的跨度树在 7 天后被丢弃；慢速和失败的 **执行上下文** 会保留完整的保留窗口的瀑布图。**执行上下文** 本身、每个百分位数、错误率和 SLO 都会保留整个窗口。年度计费将抵扣月度价格。有关当前价格、席位数量和超额费率，请参阅 [pricing page](https://www.observe.nestjs.com/ 'NestJS Observe')。

要升级，请打开团队的 **账单** → **管理订阅**。在同一区域，**使用情况** 页面会根据项目细分，跟踪您的可观测性事件与限额的匹配情况，并允许您设置**配额通知**（最多五个阈值，例如 50%、80%、100%），以便在使用量超过某个阈值时收到电子邮件。

> info **提示** 可以通过每个项目的**支出控制**来控制摄取量，而无需重新部署：跟踪一致的跨度采样、每分钟速率上限以及针对已知高噪声流量（如 `/health*`）的丢弃过滤器。采样始终保留服务器错误和慢速跟踪。速率上限是失控流量的上限：超过该上限拒绝的批次将作为一个整体丢失，包括错误。您也可以在 SDK 侧完全停止生成遥测数据——请参阅 [Ignoring noisy operations](/observability/sdk#忽略嘈杂操作)。

在 Pro 和 Scale 计划中，**账单** → **支出控制** 还限制了超额使用的成本。**峰值保护**（Pro 默认开启，Scale 在第一个月开启）会在使用量激增时暂停超额使用，如果本月的超额使用按今天的速度计算将达到 $50 或更高。**月度超额预算** 会在当月超额使用达到您设定的金额时暂停它；$0 的预算不会收集超出包含事件的任何数据。在超额使用暂停期间，服务器错误、失败的 **任务** 以及运行时和自定义指标会持续流入，不计费；除包含事件外的所有其他数据在第 1 日之前或直到您恢复、更改预算或升级之前都会被丢弃，而不是计费。SDK 0.3.13 及更高版本切换为在暂停期间只发送能保留的数据。

#### 第一个项目

最快获得第一个项目的方法是从您的终端开始。在项目目录中运行 `npx @nestjs/observe link`，并在 [observe.nestjs.com/link](https://www.observe.nestjs.com/link 'Link a project to NestJS Observe') 批准其打印的代码，如果还没有账户，请先注册。批准会创建项目和应用程序（如果尚未创建），并生成一个 API 密钥，该命令会将密钥写入项目的 `.env`。如果应用程序尚未使用 [SDK](/observability/sdk)，该命令还会安装它并进行连接——请参阅 [Linking from the terminal](/observability/sdk#linking-from-the-terminal)。由 `nest new` 生成的项目，在安装后立即提供此步骤。

从仪表板开始，新账户会获得一份简短的**设置指南**，该指南会引导用户浏览实际页面——它会突出显示*创建项目*，然后将您带入新项目以添加应用程序和 API 密钥，最后在等待第一个事件的横幅上结束。手动执行相同的步骤：

1. **创建项目**并为其命名。
2. 在其中**添加应用程序**。应用程序只需要一个名称——它所服务的路由、处理的任务和报告的指标都从 SDK 发送的遥测数据中发现。
3. 从项目的**API 密钥**页面**生成 API 密钥**。每个密钥都有一个名称（一个用于本地开发，一个用于 CI，一个用于生产）和一个可选的过期日期。密钥对（`appKey` 和 `appSecret`）只在创建时显示一次，因此请立即将其复制到您的密钥存储中。密钥是针对项目的：所有遥测数据应落入该项目的应用程序都使用相同的密钥。
4. 遵循 [SDK](/observability/sdk) 章**配置您的应用程序**。应用程序接收到流量后几分钟内，遥测数据就会开始出现。

> info **提示** 如果您使用编码代理进行设置，请在显示新密钥密钥的对话框中使用**复制设置提示**按钮。它将安装命令、三个代码编辑和凭据组合成一个提示。连接到 [MCP server](/observability/mcp-server#setting-up-a-service) 的代理可以创建应用程序和密钥本身。

<figure><img src="https://www.observe.nestjs.com/docs/applications/api-keys.webp" alt="API keys" /></figure>

> warning **警告** 将 `appKey` 和 `appSecret` 视为任何其他凭据：从环境变量或密钥管理器中读取它们，切勿提交到源代码控制。您可以在同一页面随时撤销密钥；仍在使用的应用程序将无法再发送遥测数据。

#### 性能开销

SDK 对请求的增加非常小：对于典型端点的中位延迟增加大约十分之一毫秒，每个追踪调用的 CPU 增加几个微秒。跨度记录在服务请求的线程上；每个 `flushInterval` 线程将批次序列化，然后由工作线程进行压缩和发送。在 2026 年 10 月，针对不使用 SDK 的相同 Nest 12 应用程序（在 Express、Node 24 和 Apple M1 Pro 上）进行测量：

| 带有端点 | 1 次追踪调用 | 9 次追踪调用 | 102 次追踪调用 |
| :--- | :--- | :--- | :--- |
| 150 请求/秒时的中位延迟增加 | +0.10 ms | +0.09 ms | +0.45 ms |
| 每个请求的 CPU 增加（进程完全繁忙） | +9 µs | +29 µs | +115 µs |
| 150 请求/秒时的 CPU 增加 | +3.5% 的一个核心 | +4% 的一个核心 | +10% 的一个核心 |

这九次调用包括一个守卫、一个拦截器、一个管道、一个控制器、一个服务和两个仓储；102 次调用是一个服务在一个循环中调用另一个提供者。经验法则是，CPU 成本约为每个请求 8 µs 加上每个追踪调用 1-2.5 µs，在轻负载下，一个需要 10 ms 的请求速度会慢约 1%。内存在启动时增长约 11 MB，在负载下增长 32-64 MB，空闲进程在 SDK 上花费 0.3-0.6% 的一个核心，几乎全部花费在工作线程上。

在规模化方面，其他 Node.js 代理在接近空端点的第三方基准测试中损失的吞吐量相当于 Sentry 的 45 µs/请求、Datadog 的 130 µs/请求和 New Relic 的 200 µs/请求（[NodeSource](https://benchmark.nodesource.com/ 'NodeSource Node.js benchmarks')），以及 OpenTelemetry 的 31-77 µs/请求（[Platformatic](https://blog.platformatic.dev/the-hidden-cost-of-context 'The hidden cost of context')）。以相同方式计算，SDK 在单次调用端点上增加 7 µs，在九次调用端点上增加 20 µs。机器和每个代理记录的内容不同，因此请将此视为一个方向而非排名。

> info **提示** 基准测试及其完整结果在 [SDK repository](https://github.com/nestjs/observe/blob/master/bench/README.md 'NestJS Observe SDK benchmark') 中。在克隆中运行 `npm run bench`，您可以在大约 8 分钟内在自己的硬件上重现它们。

#### 下一步去哪里

- [SDK](/observability/sdk) - 安装、三行快速启动和所有配置选项。
- [Manual instrumentation](/observability/manual-instrumentation) - 自定义跨度、已处理的错误、请求作用域属性和自定义指标。
- [Distributed tracing](/observability/distributed-tracing) - 在 HTTP、gRPC、微服务传输和 GraphQL 之间传播追踪 ID。
- [Error monitoring](https://docs.nestjs.com/observability/error-monitoring) - 捕获了什么、源上下文、将错误分组为缺陷，以及从错误到已验证修复的过程。
- [Dashboard](/observability/dashboard) - 一旦遥测数据流式传输，每个视图显示的内容以及警报、SLO 和问题的构建方式。
- [Production rules](/observability/production-rules) - 记录请求或任务可能执行的操作，并在每个保留的追踪上进行检查。
- [MCP server](/observability/mcp-server) - 从 Claude Code、Cursor、VS Code 或您自己的代理查询您的遥测数据。