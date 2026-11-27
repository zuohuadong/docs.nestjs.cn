<!-- 此文件从 content/mcp/transports.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:05:53.264Z -->
<!-- 源文件: content/mcp/transports.md -->
<!-- 源哈希: f781ecd89d9505638604ebc0e99d0ef0 -->

### 传输器

服务器通过两种传输器提供服务：可流式传输的 HTTP，来自您已有的 Nest 应用程序，用于通过网络连接的助手；以及 stdio，来自独立应用程序上下文，用于将服务器作为本地进程启动的助手。两者提供相同的工具、资源和提示。

#### HTTP 端点

该端点是模块添加的一个控制器，位于 `path`（默认 `'mcp'`）：全局前缀、版本控制、中间件、CORS 和 HTTP 守卫适用于它以及任何路由。因此，使用 `app.setGlobalPrefix('api')` 时它位于 `/api/mcp`，而 `app.setGlobalPrefix('api', { exclude: ['mcp'] })` 保持它在 `/mcp`。当启用版本控制时，`endpointVersion` 设置其版本（尽管有 `defaultVersion`，`VERSION_NEUTRAL` 仍保持在 `/mcp`），并且 `decorators` 向其应用类装饰器，例如使用 `[Public()]` 豁免于全局认证守卫，或使用 `[UseGuards(ApiKeyGuard)]`。

仅由您自己的代理调用，而非用户通过助手调用的服务器，可以不需要 OAuth。端点路由上的一个守卫会检查 API 密钥，客户端连接到远程服务器时可以将其作为请求头发送：

```typescript title="api-key.guard.ts"
import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const key = process.env.MCP_API_KEY;
    const given = request.headers['x-api-key'];
    return !!key && typeof given === 'string' && sameSecret(given, key);
  }
}

/** Compares in constant time, so response times don't give the key away. */
function sameSecret(given: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

```

```typescript title="app.module.ts"
McpModule.forRoot({
  name: 'cat-store',
  version: '1.0.0',
  decorators: [UseGuards(ApiKeyGuard)],
}),

```

没有密钥的请求在读取任何 MCP 消息之前就会收到 403 错误。

它以无状态的方式处理每个请求：每个请求都会获得自己的服务器实例，并且请求之间不会保留任何信息。负载均衡器后部署的多个应用程序实例不需要会话亲和性，并且不共享任何内容。2026-07-28 协议修订版和 2025 年版本的客户端都在同一个端点上服务；`http: { legacy: 'reject' }` 使其仅支持 2026-07-28。

2026-07-28 请求以 JSON 主体回答，或者在方法在结果之前发送内容（例如进度通知）时，以服务端推送事件流回答。`http: { responseMode: 'json' }` 从不流式传输，也不发送进度通知；`'sse'` 始终流式传输。

生产环境中需要注意一些设置：

- **来自其他站点的页面。** 端点检查 `Origin` 头部：由用户浏览器发出的来自其他站点的网页请求会收到 403。没有 `Origin` 头的请求会通过，因此不受影响的是不是浏览器、发送无头的助手、CLI 和托管连接器。默认情况下，只允许来自 `localhost`、`127.0.0.1` 和 `[::1]` 的页面通过。要为基于浏览器的客户端提供服务，请列出其主机名，`http: { allowedOrigins: ['support.catstore.example'] }`（该列表替换默认设置），或使用 `allowedOrigins: false` 关闭检查。
- **DNS 重绑定。** 绑定到 `localhost` 的服务器也可以被解析到 `127.0.0.1` 的页面的页面访问：其请求将该域名命名为其 `Host`。将服务器响应的主机名命名为 `http: { allowedHosts: ['localhost', '127.0.0.1', '[::1]'] }`，并且带有另一个 `Host` 头的请求会收到 403。除非设置了 `allowedHosts`，否则不会检查 `Host` 头部。
- **主体大小。** 工具参数在请求体中到达，您的平台的主体解析器首先读取它：Express 的默认限制是 100 KB。使用 `app.useBodyParser('json', { limit: '4mb' })` 提高此限制。
- **CORS。** 另一个源上的基于浏览器的客户端需要在两个地方列出它：在 `allowedOrigins` 中（按主机名），以及在您的 CORS 配置中，该配置还允许 `Authorization`、`Content-Type`、`Mcp-Protocol-Version`、`Mcp-Method` 和 `Mcp-Name` 请求头，并暴露 `WWW-Authenticate`：`app.enableCors({ origin: ['https://support.catstore.example'], exposedHeaders: ['WWW-Authenticate'] })`。

对于在 `https://support.catstore.example` 的支持仪表板从浏览器调用服务器，且工具参数大于 Express 默认允许的：

```typescript title="app.module.ts"
McpModule.forRoot({
  name: 'cat-store',
  version: '1.0.0',
  http: { allowedOrigins: ['support.catstore.example'] },
}),

```

```typescript title="main.ts"
const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.useBodyParser('json', { limit: '4mb' });
app.enableCors({
  origin: ['https://support.catstore.example'],
  allowedHeaders: [
    'Authorization',
    'Content-Type',
    'Mcp-Protocol-Version',
    'Mcp-Method',
    'Mcp-Name',
  ],
  exposedHeaders: ['WWW-Authenticate'],
});
await app.listen(3000);

```

#### 通过 stdio

用户机器上的助手（Claude Desktop、Claude Code、IDE）可以将其作为本地进程启动，并通过其 stdin 和 stdout 与其通信。从独立应用程序上下文提供相同的模块：

```typescript title="stdio.ts"
import { NestFactory } from '@nestjs/core';
import { McpStdioLogger, McpStdioServer } from '@nestjs/mcp';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: new McpStdioLogger(),
  });
  await app.get(McpStdioServer).listen();
  await app.close();
}
bootstrap();

```

stdout 携带协议，Nest 的默认日志记录器写入其中：`McpStdioLogger` 将所有级别写入 stderr，客户端将其显示为服务器日志。`listen()` 在客户端关闭 stdin 时解析，然后 `app.close()` 允许进程退出。通过 stdio，规范从环境变量获取凭证，而不是从 OAuth 获取，因此在那里不检查 `scopes`；守卫仍然运行。在仅提供 stdio 的应用程序中设置 `path: false`。

客户端从命令启动进程。桌面助手和 IDE 采用如下配置，此处使用环境变量指定服务器：

```json
{
  "mcpServers": {
    "cat-store": {
      "command": "node",
      "args": ["/path/to/cat-store/dist/stdio.js"],
      "env": { "CAT_STORE_API_KEY": "..." }
    }
  }
}

```

该进程属于一个用户，在其机器上，只要客户端运行它就持续存在。那里没有 OAuth：服务器需要的，例如 API 密钥，来自客户端传递的环境，并且您的提供者从 `process.env` 读取它。服务于两个协议时代的客户端；`stdio: { legacy: 'reject' }` 会拒绝使用 2025 握手打开的连接。

一个构建可以提供这两种传输器：`main.ts` 启动 HTTP 应用程序，而启动服务器的客户端运行 `stdio.ts`。

#### NestJS Observe

在应用程序中使用 [NestJS Observe](https://observe.nestjs.com)（`@nestjs/observe`）时，每个 MCP 调用都会命名其操作，`tools/call find-order` 或 `resources/read orders://{orderId}`，而不是全部是 `POST /mcp`。无需配置。

#### 生产检查清单

- 在可从网络访问的服务器上配置 `auth`，其公共 URL 为 `resource`。
- 在绑定到 `localhost` 的服务器上配置 `allowedHosts`。
- 调用服务器的基于浏览器的客户端（如果有）在 `allowedOrigins` 和您的 CORS 源中：默认情况下，只有 localhost 上的页面才能通过。
- 主体解析器的限制高于您最大的工具参数。
- 为模型编写的工具描述和 `.describe()` 文本：它们是模型了解您工具的全部信息。
- 在不改变任何内容的工具上配置 `annotations.readOnlyHint`，这样客户端在每次调用前就不会询问用户。
- 在 stdio 入口点中设置 `McpStdioLogger`：写入 stdout 的任何其他内容都会破坏协议。