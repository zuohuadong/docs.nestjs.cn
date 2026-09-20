<!-- 此文件从 content/observability/mcp-server.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T11:01:27.796Z -->
<!-- 源文件: content/observability/mcp-server.md -->
<!-- 源哈希: 108c972660ca131a10e75aca5af85d1d -->

### MCP 服务器

NestJS Observe 暴露了一个只读的 [MCP](https://modelcontextprotocol.io/) 服务器，因此兼容 MCP 的客户端——Claude Code、Claude Desktop、Cursor、VS Code，或你自己编写的代理——可以直接询问有关你项目的问题，而无需你将仪表板数据复制到提示词中。回归、慢操作、错误组、追踪、任务、告警：与仪表板显示的数据相同，且精确限定在你可见的范围内。

> info **提示** MCP 是将遥测数据传递给代理的两种方式之一。**复制代理提示词**按钮（参见 [Dashboard](/observability/dashboard#将故障交给编码代理)）将一页内容打包为文本以便一次性粘贴；MCP 适用于需要持续提问的代理——追踪一条链路，检查错误是否仍在触发——而无需你逐条转述每个答案。

该端点通过 `POST https://<api-host>/mcp` 提供 Streamable HTTP 协议。它是无状态的——没有需要打开的会话，没有需要保持的活动状态，除了请求本身之外无需任何设置。确切的主机地址显示在仪表板中你的令牌旁边。

#### 获取令牌

个人 MCP 令牌在仪表板的 **MCP 令牌** 下创建。

- 点击 **创建令牌**，为其命名，并可选择设置过期时间。没有过期时间的令牌永不过期——MCP 客户端没有刷新流程。
- 密钥（`omcp_...`）仅在创建时的响应中显示**一次**。请立即复制；只存储其哈希值，因此无法再次检索。丢失了？撤销该令牌并重新创建一个。
- 令牌**以创建它的用户身份**运行，并具有其确切的项目权限。无需额外配置作用域：如果你能在仪表板中看到它，令牌就能通过 MCP 读取它——如果你看不到，令牌也无法读取。

从同一页面撤销令牌会立即将其切断。令牌管理本身仅限仪表板操作，这是有意为之：MCP 令牌无法创建或撤销 MCP 令牌，因此泄露的凭据无法延长自身的生命周期。

#### 连接客户端

任何支持 Streamable HTTP 的客户端都可以连接：只有一个 URL 和一个请求头，无需 OAuth 流程。客户端之间的区别仅在于配置文件的位置以及其键的名称。

**Claude Code**

```bash
$ claude mcp add observe --transport http https://<api-host>/mcp --header "Authorization: Bearer <token>"

```

**Claude Desktop 及其他 `mcpServers` 客户端**

```json
{
  "mcpServers": {
    "observe": {
      "url": "https://<api-host>/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}

```

**Cursor** 在 `~/.cursor/mcp.json`（每个项目）或 `.cursor/mcp.json`（单个项目）中使用相同的 `mcpServers` 格式，并在 `url` 和 `headers` 内展开 `${env:...}`，这样你就可以将令牌保留在可能提交的文件之外：

```json
{
  "mcpServers": {
    "observe": {
      "url": "https://<api-host>/mcp",
      "headers": { "Authorization": "Bearer ${env:OBSERVE_MCP_TOKEN}" }
    }
  }
}

```

**VS Code（Copilot 代理模式）** 使用 `servers` 而非 `mcpServers`，需要显式的 `type`，并且可以提示输入一次令牌并加密存储。在 `.vscode/mcp.json` 中用于单个工作空间，或在你的用户 `mcp.json` 中用于所有工作空间：

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
      "url": "https://<api-host>/mcp",
      "headers": { "Authorization": "Bearer ${input:observe-token}" }
    }
  }
}

```

**你自己的代理。** 使用官方 TypeScript SDK，该端点是 `StreamableHTTPClientTransport`，令牌位于 `requestInit.headers` 中：

```typescript
const client = new Client({ name: 'my-agent', version: '1.0.0' });

await client.connect(
  new StreamableHTTPClientTransport(new URL('https://<api-host>/mcp'), {
    requestInit: {
      headers: { Authorization: `Bearer ${process.env.OBSERVE_MCP_TOKEN}` },
    },
  }),
);

const { tools } = await client.listTools();

```

在调试客户端的配置之前，先确认端点和令牌是否正常工作——以下命令会列出服务器将通告的工具：

```bash
$ curl -s https://<api-host>/mcp \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

```

返回工具列表意味着凭据有效，任何仍然无法工作的问题都是客户端的问题。**401** 表示令牌缺失、过期、被撤销或请求头格式错误；**405** 表示客户端发送了 `GET` 或 `DELETE`——对此端点的每个 MCP 请求都是 `POST`。

#### 一个示例调查

工具围绕调查而非端点来设计，因此每个答案都携带下一个问题所需的键。一次部署上线后感觉有些不对劲：

1. **"上次部署后发生了什么回归？"** - `find_regressions` 比较每个发布边界（你的 `serviceVersion` 值）两侧的错误率和延迟，并指出导致情况恶化的发布版本，以及它降级的操作。
2. **"显示该操作。"** - `get_operation_details` 返回路由的延迟和错误摘要，以及最近的单个请求，每个请求都带有 `traceId`。
3. **"该请求实际做了什么？"** - `get_trace` 将追踪 ID 解析为瀑布图：其下的每次执行，跨服务，包含跨度树。
4. **"代码在发生时说了什么？"** - `get_trace_logs` 按顺序返回在同一追踪 ID 下发出的每一行日志。

错误和后台任务遵循相同的结构：`list_error_groups` → `get_error_details` → `get_trace`，以及 `list_jobs` → `get_job_details` → `get_trace`。在任何情况下都从 `list_projects` 开始——几乎每个诊断工具都需要 `projectId`。

#### 可用工具

每个工具都是只读的。大多数诊断工具共享一个作用域：必需的 `projectId`，可选的 `applicationId` 用于缩小到单个服务，以及可选的 `timeInterval` 回溯窗口（`1h`、`3h`、`12h`、`1d`、`3d`、`7d`、`30d`），默认为 `1d`。

| 工具 | 功能说明 |
| --- | --- |
| `list_projects` | 你所属的每个项目，包含团队和应用数量。从这里开始解析项目 ID。 |
| `get_project` | 按 ID 查询单个项目，包含你的访问级别和订阅状态。 |
| `search` | 对你的项目、应用、告警规则、SLO 和问题进行全面搜索。 |
| `find_regressions` | 导致情况恶化的发布：每个发布边界前后的错误率和延迟对比，以及每个发布所影响的具体操作。 |
| `list_slow_operations` | 窗口内最慢的 HTTP 操作，按 p95 排序，并附带请求量——这样精力就能投入到既慢又热门的操作上。 |
| `get_operation_details` | 单个路由：延迟和错误摘要，加上最近的单个请求，每个请求包含持续时间、状态和 `traceId`。 |
| `get_trace` | 将 `traceId` 解析为其下运行的每次执行——跨服务、请求和任务——每次执行都带有其 span 树。 |
| `get_trace_logs` | 在 `traceId` 下发出的每一行日志，按顺序排列。 |
| `list_error_groups` | 按指纹分组的错误，按出现次数排序，包含类别、示例消息和堆栈跟踪、首次/最后出现时间，以及引入该错误的发布。 |
| `get_error_details` | 单个错误类别的最近出现记录：每次出现的消息、状态、用户和 `traceId`，以及摘要。 |
| `get_error_trend` | 错误在窗口内是增长还是衰减，已分类为方向。 |
| `get_affected_users` | 单个错误类别的影响范围：哪些最终用户遇到了该错误以及频率如何。 |
| `list_jobs` | 窗口内后台任务性能，按任务名称和队列划分：数量、持续时间和失败次数。 |
| `get_job_details` | 单个队列上的单个任务名称：持续时间和等待时间摘要，加上最近的单次执行，每次执行包含状态和 `traceId`。 |
| `list_issues`、`get_issue` | 跨项目的问题，以及单个问题及其评论和活动。 |
| `list_slos` | 项目的 SLO，包含当前状态和错误预算消耗。 |
| `list_alert_rules`、`list_alert_events` | 你能看到的所有项目的告警规则及其触发历史。 |

目前无法通过 MCP 创建、解决或修改任何内容——无论是问题、告警规则还是错误组状态。这些操作仍需在仪表板中完成。工具结果也会丢弃仪表板端点返回的按时间分桶的图表序列，因为数百个桶值会消耗上下文，而且其信息量不如从中得出的摘要。