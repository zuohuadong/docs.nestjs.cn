<!-- 此文件从 content/mcp/overview.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:06:16.411Z -->
<!-- 源文件: content/mcp/overview.md -->
<!-- 源哈希: b2206cdbff5bd033631ac27a73267172 -->

### 模型上下文协议 (MCP)

`@nestjs/mcp` 将 Nest 应用程序转变为模型上下文协议 (MCP) 服务器，其工具、资源和提示是您提供者的方法。

一个猫粮和用品的在线商店会收到很多邮件：“我的订单在哪里？”、“我可以更改送货地址吗？”、“三文鱼猫粮还有库存吗？”。支持团队在一个 AI 助手（Claude、ChatGPT，他们帮助台中的一个代理）中工作，该助手只有在能看到订单 API 能看到的内容时才能回答。

[Model Context Protocol](https://modelcontextprotocol.io) (MCP) 是助手访问应用程序的方式。应用程序运行一个 **MCP 服务器**，并向助手暴露三类事物，即 **MCP 客户端**：

- **工具**，模型带参数调用的操作：查询订单、更改其地址。
- **资源**，客户端通过 URI 读取的数据：目录、单个订单。
- **提示**，用户选择的模板：“起草关于此订单的回复”。

`@nestjs/mcp` 使用装饰器将您提供者的方法转换为工具、资源和提示。它们会经过您的路由使用的守卫、拦截器、管道和异常过滤器，并且服务器来自您已有的 Nest 应用程序：对于远程助手，通过 Streamable HTTP；对于作为本地进程启动的助手，通过 stdio。

在此教程中，您将为商店的订单 API 提供一个 MCP 服务器：

- [Tools](/mcp/primitives) 用于查找订单和更改其送货地址，带有模型可见且服务器验证的模式。
- 目录作为一个 [resource](/mcp/primitives#resources)，每个订单作为一个资源模板。
- 一个 [prompt](/mcp/primitives#prompts) 用于起草回复。
- 一个 [guard](/mcp/primitives#guards-interceptors-pipes-and-filters) 仅允许支持团队更改订单，以及一个记录每次调用的拦截器。
- [OAuth 2.1](/mcp/primitives#authorization) 在 HTTP 端点上，带有商店的身份提供者和更改订单的作用域。
- 相同的服务器通过 [stdio](/mcp/transports#over-stdio)，以及 [tests](/mcp/testing) 在内存中调用它。

> info **提示** 要逐步构建完整的 MCP 服务器，从空项目到带有 OAuth 访问令牌、每团队数据和 stdio 入口点的测试代码，请遵循 [Build an MCP server in Node.js](/tutorials/mcp-server)。

#### 安装

安装包、它构建的 MCP TypeScript SDK 以及用于模式的 Zod：

```bash
$ npm i --save @nestjs/mcp @modelcontextprotocol/server zod

```

> info **提示** 模式可以来自任何生成 JSON Schema 的 [Standard Schema](https://standardschema.dev) 库：Zod 4.2 或更高版本和 ArkType 保持原样，通过 `toStandardJsonSchema()` 从 `@valibot/to-json-schema` 使用 Valibot，以及您已有的 JSON Schema 文档通过 `fromJsonSchema()` 从 `@modelcontextprotocol/server`。Zod 3 模式在启动时被拒绝：SDK 无法将其转换为 JSON Schema。

#### 注册模块

在根模块中导入 `McpModule`。`name` 和 `version` 标识服务器给客户端；`instructions` 告诉模型如何使用它：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { McpModule } from '@nestjs/mcp';
import { OrdersModule } from './orders/orders.module.js';

@Module({
  imports: [
    McpModule.forRoot({
      name: 'cat-store',
      version: '1.0.0',
      instructions: 'Look orders up with find-order before changing them.',
    }),
    OrdersModule,
  ],
})
export class AppModule {}

```

该模块在启动时查找应用程序中每个提供者的工具、资源和提示。`include: [OrdersModule]` 将搜索限制为您列出的模块。

像往常一样启动应用程序：

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();

```

MCP 端点在 `http://localhost:3000/mcp` 提供，与应用程序自身的路由相邻。相同的模块也可以通过 stdio 提供，供启动应用程序作为本地进程的助手使用：参见 [Transports](/mcp/transports)。

#### 调用如何提供服务

当应用程序启动时，该模块会遍历其提供者，查找使用 `@Tool()`、`@Resource()`、`@ResourceTemplate()` 和 `@Prompt()` 装饰的方法。它只将每个模式转换为 JSON Schema 一次，并在启动时失败于本应稍后才出错的情况：两个同名工具、不符合 MCP 命名规则的工具名称、一个请求作用域的提供者、缺少 `auth` 的 `scopes`。

然后，对端点的每次 HTTP 请求都会单独提供服务。模块会根据启动时找到的内容（全部或 `filter` 为请求选择的内容）为其构建一个 MCP 服务器，[MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) 遵循协议，调用会经过以下步骤：

1. 使用 `auth` 验证访问令牌，并检查调用的作用域。
2. SDK 根据模式验证参数。它拒绝的参数永远不会到达您的方法：模型被告知错误所在，并可以重试。
3. 您的守卫运行，然后是您的拦截器和管道，类似于路由处理程序周围。
4. 方法运行，带有参数和调用的上下文。
5. 返回的内容成为 MCP 结果。抛出的内容会经过您的异常过滤器，成为客户端可理解的错误。

请求之间不保留任何状态，因此服务器可以运行任意数量的实例，在任何负载均衡器后。通过 stdio，一个服务器会持续服务进程存活期间的连接。

#### 异步配置

`forRootAsync()` 从工厂、`useClass` 或 `useExisting` 提供者获取选项。`path`、`endpointVersion`、`decorators` 和 `imports` 保持在顶层，因为模块的路由在定义时是已知的；来自工厂的验证器是一个实例：

```typescript
McpModule.forRootAsync({
  imports: [ConfigModule, AuthModule],
  inject: [ConfigService, IdentityProviderTokenVerifier],
  useFactory: (config: ConfigService, verifier: IdentityProviderTokenVerifier) => ({
    name: 'cat-store',
    version: config.get('VERSION'),
    auth: {
      verifier,
      resource: config.get('MCP_RESOURCE'),
      authorizationServers: [config.get('IDENTITY_PROVIDER_URL')],
    },
  }),
}),

```

#### 模块选项

| 选项 | 默认值 | 描述 |
| --- | --- | --- |
| `name`, `version` | | 必需。发送给客户端的服务器身份 |
| `title`, `description`, `websiteUrl`, `icons` | | 更多信息，供客户端显示 |
| `instructions` | | 模型应如何使用服务器 |
| `include` | every module | 搜索工具、资源和提示的模块 |
| `filter` | every primitive | 选择每个请求或连接提供的原始类型。参见 [Per-request visibility](/mcp/primitives#per-request-visibility) |
| `path` | `'mcp'` | HTTP 端点的路由。无时为 `false`。`forRootAsync()` 的顶层 |
| `endpointVersion` | | 启用了版本控制的端点版本。`forRootAsync()` 的顶层 |
| `decorators` | `[]` | 应用于端点控制器的类装饰器。`forRootAsync()` 的顶层 |
| `imports` | `[]` | 注入 `verifier` 类所依赖的模块的导出。`forRootAsync()` 的顶层 |
| `http.legacy` | `'stateless'` | `'reject'` 仅提供 2026-07-28 修订版 |
| `http.responseMode` | `'auto'` | `'json'` 或 `'sse'` 固定 2026-07-28 请求的响应形状 |
| `http.allowedOrigins` | `localhost`, `127.0.0.1`, `[::1]` | 请求的 `Origin` 头部可能命名的主机名；没有该头部的请求通过。列表替换默认值，`false` 关闭检查 |
| `http.allowedHosts` | not checked | `Host` 头部必须命名的主机名 |
| `http.maxRequestBodySize` | 4 MiB | 平台未解析的请求体大小限制 |
| `auth.verifier` | | 带有 `verifyAccessToken(token)` 的类或实例 |
| `auth.resource` | | 服务器的规范 URL 及其令牌的受众 |
| `auth.authorizationServers` | | 被接受的签发者 |
| `auth.scopesSupported`, `auth.requiredScopes` | | 声明的作用域和每个请求所需的范围 |
| `auth.resourceName`, `auth.resourceDocumentation` | | 更多受保护的资源元数据 |
| `stdio.legacy` | `'serve'` | `'reject'` 拒绝使用 2025 握手打开的连接 |

#### 示例

可用的工作示例在 [here](https://github.com/nestjs/mcp/tree/master/sample)。