<!-- 此文件从 content/mcp/migration.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:05:49.959Z -->
<!-- 源文件: content/mcp/migration.md -->
<!-- 源哈希: fcff295f3f39090e030e141da1ec3629 -->

### 迁移

使用社区包 `@rekog/mcp-nest` 构建的 MCP 服务器迁移到 `@nestjs/mcp`，变化大多是机械性的：装饰器保持其名称，工具、资源和提示仍是您类的方法。本页面将其两个 API，即 1.x 版本（`McpModule.forRoot()`）和 2.x 版本（`McpStrategy`）映射到 `@nestjs/mcp`。

#### 包

`@nestjs/mcp` 基于 MCP TypeScript SDK 的 2.0 版本，即 `@modelcontextprotocol/server` 构建。替换这些包：

```bash
$ npm uninstall @rekog/mcp-nest @modelcontextprotocol/sdk
$ npm i --save @nestjs/mcp @modelcontextprotocol/server zod

```

从 2.x 版本开始，还需卸载 `@modelcontextprotocol/core` 和 `@modelcontextprotocol/node`，如果您使用了其授权服务器，请卸载 `@rekog/mcp-nest-auth`，如果应用程序中没有其他部分使用它，请卸载 `@nestjs/microservices`。您从 `@modelcontextprotocol/sdk` 导入的类型，例如 `CallToolResult`，来自 `@modelcontextprotocol/server`。

#### 模块

从 1.x 版本开始，`McpModule.forRoot()` 保持不变，但选项减少了：

```typescript title="app.module.ts"
// Before, with @rekog/mcp-nest 1.x
McpModule.forRoot({
  name: 'cat-store',
  version: '1.0.0',
  transport: [McpTransportType.STREAMABLE_HTTP],
  mcpEndpoint: 'mcp-operations',
  guards: [ApiKeyGuard],
}),

// After
McpModule.forRoot({
  name: 'cat-store',
  version: '1.0.0',
  path: 'mcp-operations',
  decorators: [UseGuards(ApiKeyGuard)],
}),

```

| `@rekog/mcp-nest` 1.x | `@nestjs/mcp` |
| --- | --- |
| `name`, `version` | 相同 |
| `transport` | 除非 `path: false`，否则提供可流式传输的 HTTP；由 `McpStdioServer` 通过 stdio 提供（参见 [Transports](/mcp/transports#over-stdio)） |
| `mcpEndpoint`, `apiPrefix` | `path`，在应用程序的全局前缀下 |
| `guards` | `decorators: [UseGuards(...)]` |
| `streamableHttp` | 无需设置：每个请求独立服务，且 `http.responseMode` 塑造 2026-07-28 请求的答案 |
| `forRootAsync()` | `forRootAsync()`，在其顶层有 `path`、`decorators` 和 `imports` |
| `forFeature()` | 每个应用程序一个 MCP 服务器 |

从 2.x 版本开始，策略及其引导代码被移除。`McpModule.forRoot()` 接收策略的 `name` 和 `version`，端点是应用程序的路由，由 `app.listen()` 服务：

```typescript title="main.ts"
// Before, with @rekog/mcp-nest 2.x
const app = await NestFactory.create(AppModule);
mcp.setHttpAdapter(app.getHttpAdapter());
app.connectMicroservice({ strategy: mcp });
await app.startAllMicroservices();
await app.listen(3000);

// After
const app = await NestFactory.create(AppModule);
await app.listen(3000);

```

`@McpController()` 类成为普通的 `@Injectable()` 提供者，列在模块的 `providers` 而非其 `controllers` 中，并且移除了 `MCP_STRATEGY` 提供者。由 `NestFactory.createMicroservice()` 启动的 stdio 服务器现在从具有 `McpStdioServer` 的应用程序上下文提供服务，如 [Transports](/mcp/transports#over-stdio) 所示。

#### 工具、资源和提示

装饰器保持其名称和大部分选项。方法的参数发生了变化：

```typescript title="greeting.tool.ts"
// Before, with @rekog/mcp-nest 1.x
@Tool({
  name: 'greeting-tool',
  description: 'Returns a greeting with progress updates',
  parameters: z.object({ name: z.string().default('World') }),
})
async sayHello({ name }, context: Context, request: Request) {
  await context.reportProgress({ progress: 50, total: 100 });
  return `Hello, ${name}, from ${request.headers['user-agent']}!`;
}

// After
@Tool({
  name: 'greeting-tool',
  description: 'Returns a greeting with progress updates',
  inputSchema: z.object({ name: z.string().default('World') }),
})
async sayHello({ name }: { name: string }, ctx: McpContext<Request>) {
  await ctx.reportProgress(50, 100);
  return `Hello, ${name}, from ${ctx.request?.headers['user-agent']}!`;
}

```

| `@rekog/mcp-nest` | `@nestjs/mcp` |
| --- | --- |
| `parameters` | 在工具上是 `inputSchema`，在提示上是 `argsSchema` |
| `outputSchema`, `annotations` | 相同 |
| 1.x 中的 `(args, context, request)`，2.x 中的 `@Payload()` 和 `@Ctx()` | `(input, ctx)`：请求是 `ctx.request`，已验证的令牌是 `ctx.authInfo` |
| `context.reportProgress({ progress, total })` | `ctx.reportProgress(progress, total)` |
| `context.mcpServer.server.elicitInput()` | 返回 `inputRequired()`：参见 [asking the user](/mcp/primitives#the-call-context) |
| 资源的 `({ uri })` | `ctx.uri`。资源模板的方法接收其变量作为输入 |
| `{ content }`, `{ contents }` 和 `{ messages }` 的结果 | 按原样返回，或者返回值本身，让模块构建结果 |
| `@Injectable({ scope: Scope.REQUEST })` | 单例提供者：从 `ctx` 读取调用所属的内容 |
| `McpRegistryService.registerTool()`, `strategy.registerTool()` | 不支持：使用装饰器声明工具 |

例如，一个资源模板：

```typescript title="greeting.resource.ts"
// Before, with @rekog/mcp-nest 1.x
@ResourceTemplate({
  name: 'user-language',
  description: "Get a specific user's preferred language",
  mimeType: 'application/json',
  uriTemplate: 'mcp://users/{name}',
})
getUserLanguage({ uri, name }) {
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({ name, language: this.languages.of(name) }),
      },
    ],
  };
}

// After
@ResourceTemplate({
  name: 'user-language',
  description: "Get a specific user's preferred language",
  mimeType: 'application/json',
  uriTemplate: 'mcp://users/{name}',
})
getUserLanguage({ name }: { name: string }) {
  return { name, language: this.languages.of(name) };
}

```

请求作用域的提供者在启动时因 `@nestjs/mcp` 而失败：每个请求都由相同的单例实例服务，调用之间不同的内容（请求、令牌和客户端）在 `ctx` 中。

#### 守卫和错误

守卫、拦截器、管道和过滤器继续工作，使用 `McpExecutionContext.create(context)` 代替 `context.switchToRpc().getContext<McpContext>()`。上下文的类型是 `'mcp'`，而不是 `'rpc'`。

工具的错误仍然作为工具结果到达模型。一个 `HttpException` 将其消息传递给客户端，在 2.x 中需要一个 `RpcException`；任何其他错误都以 `Internal server error` 回答。

```typescript
// Before, with @rekog/mcp-nest 2.x
throw new RpcException('The address has no postcode');

// After
throw new BadRequestException('The address has no postcode');

```

#### 授权

`@nestjs/mcp` 是一个资源服务器，符合 MCP 规范对服务器的要求：令牌来自身份提供者，模块验证它们（参见 [Authorization](/mcp/primitives#authorization)）。

| `@rekog/mcp-nest` | `@nestjs/mcp` |
| --- | --- |
| `McpAuthModule`，内置授权服务器 | 一个身份提供者（Auth0、Keycloak、Entra ID、WorkOS、您自己的）负责颁发令牌，以及指向它的 `auth` |
| `McpAuthJwtGuard` 在 `guards` 中 | `auth.verifier` |
| `@ToolScopes(['orders:write'])` | 装饰器上的 `scopes: ['orders:write']`。作用域工具仍列出给每个客户端 |
| `@ToolRoles(['admin'])` | 一个守卫，或带有 `@nestjs/authorization` 的 `@Can()` 策略 |
| `@PublicTool()`, `allowUnauthenticatedAccess` | 不支持：使用 `auth`，每个请求都需要令牌 |
| 2.x 中的 `ctx.getUser()` | `ctx.authInfo`，或带有 `@nestjs/authentication` 的 `@CurrentUser()` |

#### 不包含的内容

- 2024-11-05 协议修订的 **HTTP+SSE 传输** 不提供服务。客户端通过 Streamable HTTP 连接，这是当前客户端使用的传输方式。
- **会话** 不被保留：每个 HTTP 请求都是独立服务的，这使得服务器可以在多个实例上运行。2025 客户端不能在调用中途通过 HTTP 请求输入；调用以工具错误结束。
- 本版本不支持**运行时注册工具**、**一个应用程序中的多个 MCP 服务器**和**请求作用域的提供者**。