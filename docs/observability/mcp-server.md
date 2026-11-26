<!-- 此文件从 content/observability/mcp-server.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:27:42.492Z -->
<!-- 源文件: content/observability/mcp-server.md -->
<!-- 源哈希: fabe5f4a851aed3884e7a9d860e81f5b -->

### MCP 服务器

NestJS Observe 暴露了一个 [MCP](https://modelcontextprotocol.io/) 服务器，因此 MCP 兼容的客户端（Claude Code、Claude Desktop、Cursor、VS Code 或您自己编写的代理）可以直接查询您的项目，而不是您将仪表板数据复制到提示中。回归信息、每个版本的变更内容、慢操作、错误组、追踪、任务、警报和生产规则均可获取：与仪表板显示的数据完全一致，且作用域限定于您可见的内容。为在代码上工作的代理提供了两个工具：一个在编辑前读取的上下文包，以及一个在部署后读取的发布判定。

MCP 服务器包含在所有付费计划（Pro 及以上）中。它遵循为每个项目付费的计划：在免费账户上的成员如果被邀请到付费团队的项目中，可以在这些项目中使用它。

> info **提示** MCP 是将遥测数据发送到代理的两种方式之一。**复制代理提示** 按钮（参见 [Dashboard](/observability/dashboard#将故障交给编码代理)）将一个页面作为文本打包，以便单次粘贴。MCP 适用于需要持续提问（跟踪一个追踪、检查错误是否仍在触发）而无需您转述每个答案的代理。

该端点在 `POST https://observe-api.nestjs.com/mcp` 使用可流式传输的 HTTP 协议。它是无状态的：没有会话需要打开，没有需要保持活动状态的内容，除了请求本身之外没有其他设置。

#### 连接客户端

只需将 URL 提供给客户端，不要提供其他任何信息。首次调用时，服务器会回复需要凭据以及获取凭据的位置。支持 MCP OAuth 登录的客户端——Claude Code、Claude Desktop 和 claude.ai、Cursor 和 VS Code 均支持——将打开仪表板上的浏览器，您在那里批准连接，然后客户端继续执行，无需复制、粘贴或保存在文件中任何令牌。

**Claude Code**

```bash
$ claude mcp add observe --transport http https://observe-api.nestjs.com/mcp

```

然后在 Claude Code 中运行 `/mcp`，选择 `observe` 并进行认证；您的浏览器将打开批准页面。

**Claude Desktop 和 claude.ai**：在 **设置 → 连接器** 下，添加一个自定义连接器，其 URL 为 `https://observe-api.nestjs.com/mcp`。连接后将打开批准页面。

**Cursor**：将 URL 添加到 `~/.cursor/mcp.json`（每个项目）或 `.cursor/mcp.json`（单个项目），当 Cursor 列出服务器需要时登录：

```json
{
  "mcpServers": {
    "observe": { "url": "https://observe-api.nestjs.com/mcp" }
  }
}

```

**VS Code (Copilot 代理模式)**：在单个工作区的 `.vscode/mcp.json` 中，或在所有工作区的用户 `mcp.json` 中。当服务器首次启动时，VS Code 会要求您登录：

```json
{
  "servers": {
    "observe": {
      "type": "http",
      "url": "https://observe-api.nestjs.com/mcp"
    }
  }
}

```

批准页面会显示客户端的名称（其自身的声明，因此仅批准您刚刚启动的连接），浏览器返回的地址，以及您登录的账户。一个请求持续 10 分钟。批准会创建一个以客户端命名的个人 MCP 令牌，例如 "Cursor (通过 OAuth 连接)"，并直接将其交给客户端；它以您的身份行动，拥有您精确的项目权限，持续到您在 **MCP 令牌** 下撤销它。没有刷新流程：令牌被撤销的客户端将收到一个 `401` 并要求您再次批准。

#### 使用令牌连接

对于无法打开浏览器的任何情况——CI、脚本、您编写的代理、不支持 MCP OAuth 登录的客户端——请自行创建令牌，并将其放在 `Authorization: Bearer <token>` 头部中发送。

##### 获取令牌

个人 MCP 令牌在仪表板的 **MCP 令牌** 下铸造。

- 点击 **创建令牌**，为其命名，并可选地设置过期时间。没有过期时间的令牌永不过期，因为 MCP 客户端没有刷新流程。
- 密钥（`omcp_...`）**仅显示一次**，在创建它的响应中。立即复制它；只存储其哈希值，因此无法再次检索。如果丢失，请撤销令牌并铸造另一个。
- 令牌**充当创建它的用户**，拥有其精确的项目权限。没有作用域需要限定：如果它可以在仪表板中看到，令牌就可以通过 MCP 读取；如果看不到，令牌也看不到。

从同一页面撤销令牌会立即切断其访问。令牌管理本身是故意仅在仪表板上进行的：MCP 令牌不能铸造或撤销 MCP 令牌，因此泄露的凭据无法延长自身生命周期。

##### 使用令牌配置客户端

任何支持可流式传输 HTTP 的客户端都使用 URL 和该单个头部进行连接。客户端之间的区别仅在于配置文件的位置以及其键的名称。

**Claude Code**

```bash
$ claude mcp add observe --transport http https://observe-api.nestjs.com/mcp --header "Authorization: Bearer <token>"

```

**Claude Desktop 和其他 `mcpServers` 客户端**

```json
{
  "mcpServers": {
    "observe": {
      "url": "https://observe-api.nestjs.com/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}

```

**Cursor** 在 `mcpServers` 形状中使用 `~/.cursor/mcp.json`（每个项目）或 `.cursor/mcp.json`（单个项目），并在 `url` 和 `headers` 中扩展 `${env:...}`，这样就可以将令牌保存在您可能提交的文件之外：

```json
{
  "mcpServers": {
    "observe": {
      "url": "https://observe-api.nestjs.com/mcp",
      "headers": { "Authorization": "Bearer ${env:OBSERVE_MCP_TOKEN}" }
    }
  }
}

```

**VS Code (Copilot 代理模式)** 使用 `servers` 而不是 `mcpServers`，需要明确的 `type`，并且可以提示一次并加密存储。在单个工作区的 `.vscode/mcp.json` 中，或在所有工作区的用户 `mcp.json` 中：

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "observe-token",
      "description": "NestJS Observe MCP token",
      "password": true
    }
  ],
  "servers": {
    "observe": {
      "type": "http",
      "url": "https://observe-api.nestjs.com/mcp",
      "headers": { "Authorization": "Bearer ${input:observe-token}" }
    }
  }
}

```

**您自己的代理。** 使用官方 TypeScript SDK，端点是一个 `StreamableHTTPClientTransport`，令牌放在 `requestInit.headers` 中：

```typescript
const client = new Client({ name: 'my-agent', version: '1.0.0' });

await client.connect(
  new StreamableHTTPClientTransport(new URL('https://observe-api.nestjs.com/mcp'), {
    requestInit: {
      headers: { Authorization: `Bearer ${process.env.OBSERVE_MCP_TOKEN}` },
    },
  }),
);

const { tools } = await client.listTools();

```

在调试客户端配置之前，请确认端点和令牌有效。此命令列出了服务器所宣传的工具：

```bash
$ curl -s https://observe-api.nestjs.com/mcp \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

```

如果返回了工具列表，则凭据有效，任何仍然出现问题都是客户端问题。**401** 表示令牌缺失、过期或被撤销，或者头部格式不正确。**405** 表示客户端发送了 `GET` 或 `DELETE`；对该端点的每个 MCP 请求都必须是 `POST`。

#### 示例调查

这些工具围绕调查而非端点构建，因此每个答案都承载着下一个问题所需的关键信息。假设有一个部署发布了，但似乎出了问题：

1. **“上一次部署后哪些地方退化了？”** - `find_regressions` 比较了每个发布边界两侧的服务器错误率 (5xx) 和延迟（您的 `serviceVersion` 值），并指出了导致情况恶化的发布以及它退化的操作。
2. **“给我看看那个操作。”** - `get_operation_details` 返回了路由的延迟和错误摘要，以及最近的单个请求，每个请求都有一个 `traceId`。
3. **“那个请求实际做了什么？”** - `get_trace` 将追踪 ID 解析为瀑布图：其下所有跨服务的执行，带有跨度树。
4. **“发生时代码说了什么？”** - `get_trace_logs` 按顺序返回了在同一追踪 ID 下发出的每一条日志行。

错误和后台任务遵循相同的模式：`list_error_groups` → `get_error_details` → `get_trace`，以及 `list_jobs` → `get_job_details` → `get_trace`。在每种情况下，都应从 `list_projects` 开始，因为几乎所有诊断工具都需要一个 `projectId`。

#### 编辑前和部署后

一个处理代码本身的代理有两个关键时刻需要提问：

- **编辑前**，`get_context_pack` 返回一个针对代理上下文的简报：热路径及其延迟、不稳定的依赖项、SLO 以及代码必须保持的 [production rules](/observability/production-rules)。`get_method_impact` 说明了一个方法所承载的权重——它运行的频率、自身耗时、错误率以及运行它的应用程序——在更改之前是怎样的。
- **部署后**，`get_release_verdict` 说明了该发布在代码行为上做了哪些更改以及是否退化了。当该发布旨在修复错误时，`verify_fix` 说明了该错误是否在发布自身的请求中停止——这是在 `resolve_issue` 之前引用的证据。然后 `create_production_rule` 确定了该更改必须保持做什么。

服务器在客户端连接时发送的指令中会说明这个顺序，因此连接的代理无需被告知即可使用这些工具。

#### 可用工具

几乎所有工具都是只读的；写入的工具列在 [Setting up a service](/observability/mcp-server#setting-up-a-service) 下。大多数诊断工具共享一个作用域：一个必需的 `projectId`，一个可选的 `applicationId` 用于缩小到单个服务，以及一个可选的 `timeInterval` 回溯窗口（`1h`, `3h`, `12h`, `1d`, `3d`, `7d`, `30d`），默认为 `1d`。

| 工具 | 回答的内容 |
| :--- | :--- |
| `list_projects` | 您所属的每个项目，包括团队和应用数量。从这里开始解析项目 ID。 |
| `get_project` | 按 ID 查看单个项目，包括您的访问级别和订阅状态。 |
| `search` | 对您的项目、应用、告警规则、SLO 和问题进行全文搜索。 |
| `get_context_pack` | 一个项目摘要，在编辑其代码之前加载，约 2,500 个 token：最繁忙的路由和任务、拥有最多时间的方法、失败或缓慢的外部调用和语句、SLO、流量下降的路由以及生产规则在过去一天的表现。以 JSON 和 markdown 格式返回，用于 `AGENTS.md` 或 `CLAUDE.md`。 |
| `get_method_impact` | 在您更改方法之前的权重：每分钟调用次数、每次调用的拥有时间、错误率、过去一天与本周其余时间相比的情况，以及运行该方法的应用。它接受一个方法、一个外部 `METHOD host` 或一个语句，例如 `pg SELECT orders`。 |
| `find_regressions` | 使情况恶化的发布：每次发布边界前后的服务器错误率 (5xx) 和延迟，以及每个发布具体退化的操作。 |
| `get_release_verdict` | 单个发布的结论：代码行为如何变化（添加的外部主机和语句、调用频率的增减、新的错误组、流量下降的路由）以及是否出现回归。 |
| `diff_release` | 跨越一个发布边界的方法调用次数或每次调用的拥有时间发生变化的语句形状、外部调用和 NestJS 方法：新的 N+1、添加或删除的外部调用、代码变慢的方法。 |
| `verify_fix` | 判断一个发布是否修复了错误组，该判断基于该发布自身在失败路由上的请求：已修复、未修复、尚不明确或数据不足。计数来自请求行，请求行永不采样，且不写入任何内容。 |
| `list_slow_operations` | 窗口内最慢的 HTTP 操作，按 p95 排名，同时显示调用量，以便关注慢且热的操作。 |
| `get_operation_details` | 单个路由：延迟和错误摘要，加上最近的单个请求，每个请求都有持续时间、状态和 `traceId`。 |
| `get_trace` | 为其下运行的每个执行解析一个 `traceId`——跨服务、请求和任务——每个都带有其跨度树。 |
| `get_trace_logs` | 在 `traceId` 下发出的每条日志行，按顺序排列。 |
| `list_error_groups` | 按指纹分组的错误，按发生次数排名，包含类别、样本消息和堆栈跟踪、首次/最后出现时间以及引入的发布。 |
| `get_error_details` | 单个错误类别的近期发生情况：每次发生的消息、状态、用户和 `traceId`，以及摘要。 |
| `get_error_trend` | 错误在窗口内是增长还是衰减，已分类为方向。 |
| `get_affected_users` | 单个错误类别的影响范围：哪些最终用户遇到了它以及频率如何。 |
| `list_jobs` | 窗口内后台任务的性能，按任务名称和队列：调用量、持续时间和失败次数。 |
| `get_job_details` | 单个队列上的一个任务名称：持续时间和等待时间摘要，加上最近的单个执行，每个执行都有状态和 `traceId`。 |
| `list_classes`, `get_class_methods` | 按 NestJS 类划分的时间消耗，类似于 **Services** 视图（拥有时间、总时间、调用次数、错误），然后是热类中的哪个方法是热点。 |
| `get_service_map` | 项目中谁调用了谁：其应用、它们处理的队列、它们查询的数据库以及它们调用的外部主机，每个都有调用次数、错误次数和平均持续时间。 |
| `list_issues`, `get_issue` | 您项目中的问题，以及单个问题及其评论和活动。 |
| `get_incident_record` | 问题留下的记录：它是什么、何时开始、它属于哪个发布、影响了谁、哪个发布修复了它以及验证情况，在一个时间线上的所有信息。 |
| `list_slos` | 项目的 SLOs 及其当前状态和错误预算消耗情况。 |
| `list_rule_violations` | 项目的 [production rules](/observability/production-rules)，它们在窗口内的表现，以及导致其失败的跟踪记录。 |
| `list_alert_rules`, `list_alert_events` | 您可见的每个项目的告警规则及其触发历史。 | 除了设置服务、解决问题和固定生产规则外，无法通过 MCP 创建或更改任何内容，包括告警规则、错误组状态和现有生产规则。这些内容保留在仪表板中。工具结果也省略了仪表板端点返回的时间桶图系列，因为数百个桶值会占用上下文，且不如从中得出的摘要有意义。 |

#### 设置服务

这些是写入的工具。每个工具都通过与匹配仪表板按钮相同的服务，因此您在项目中的角色和您计划的限制与仪表板中的限制完全相同，拒绝会作为工具的答案返回。在 MCP 上无法删除、重命名或撤销任何内容。

| 工具 | 功能描述 |
| :--- | :--- |
| `list_applications` | 一个项目的应用。在创建副本之前请检查此项。 |
| `create_project` | 在现有团队中（传入其 id）或以项目名称命名新项目来创建项目。 |
| `create_application` | 在项目中注册一个 NestJS 服务。名称在 MCP 上不可更改，应与您提供给 SDK 的 `serviceId` 匹配。 |
| `create_api_key` | 发出 SDK 用于认证的密钥对。密钥仅返回一次；行为良好的客户端应将其写入 git 忽略的环境文件，且不重复使用。 |
| `resolve_issue` | 在修复发布后标记问题已解决，此时开始针对事件前基线进行验证。 |
| `create_production_rule` | 在单个操作上固定一个 [production rule](/observability/production-rules)：每个请求或任务可以调用什么，以及调用次数限制。需要写入权限和付费计划；编辑和删除规则仍保留在仪表板中。 |

使用这些工具，一个代理可以在一个请求中将仓库从“未 instrument”转变为“报告”：*"为该服务设置 NestJS Observe"* 变为 `list_projects` → `create_application` → `create_api_key`，然后是安装和来自 [SDK guide](/observability/sdk) 的三个代码编辑。