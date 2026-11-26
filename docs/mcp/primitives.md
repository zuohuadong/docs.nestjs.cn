<!-- 此文件从 content/mcp/primitives.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:06:37.433Z -->
<!-- 源文件: content/mcp/primitives.md -->
<!-- 源哈希: 731ff3f7992cee0e6cbce1eda178ca21 -->

### 原语

MCP 服务器暴露三个原语：**工具**（模型调用的动作）、**资源**（客户端读取的数据）和**提示**（用户选择的模板）。每个原语都是您提供者中的一个方法的装饰器，并像您的路由一样经过相同的守卫、拦截器、管道和异常过滤器。

#### 工具

工具是一个使用 `@Tool()` 装饰的方法。`inputSchema` 描述了其参数：SDK 将其作为 JSON Schema 向客户端广告，并在方法运行前根据其验证每次调用。`.describe()` 文本到达模型，模型读取这些文本以填充参数：

```typescript title="orders/orders.tools.ts"
import { Injectable, NotFoundException } from '@nestjs/common';
import { Tool, type McpContext } from '@nestjs/mcp';
import * as z from 'zod';
import { OrdersService } from './orders.service.js';

@Injectable()
export class OrdersTools {
  constructor(private readonly orders: OrdersService) {}

  @Tool({
    name: 'find-order',
    description:
      'Find an order by its id, or the latest orders of a customer by email',
    inputSchema: z.object({
      orderId: z.string().optional().describe('The order id, such as ord_123'),
      email: z.email().optional().describe("The customer's email address"),
    }),
    annotations: { readOnlyHint: true },
  })
  async find({ orderId, email }: { orderId?: string; email?: string }) {
    const orders = orderId
      ? [await this.orders.findById(orderId)]
      : await this.orders.latestFor(email!);
    if (orders.length === 0 || !orders[0]) {
      throw new NotFoundException('No such order');
    }
    return orders;
  }

  @Tool({
    name: 'change-address',
    description:
      'Change the delivery address of an order that has not shipped yet',
    inputSchema: z.object({ orderId: z.string(), address: z.string().min(10) }),
    outputSchema: z.object({
      orderId: z.string(),
      address: z.string(),
      status: z.string(),
    }),
  })
  async changeAddress(
    { orderId, address }: { orderId: string; address: string },
    ctx: McpContext,
  ) {
    const order = await this.orders.changeAddress(
      orderId,
      address,
      ctx.authInfo?.clientId,
    );
    return { orderId: order.id, address: order.address, status: order.status };
  }
}

```

将类注册为提供者，与其他任何类一样：

```typescript title="orders/orders.module.ts"
@Module({
  providers: [OrdersService, OrdersTools],
})
export class OrdersModule {}

```

该方法会使用经过验证的参数和调用的 [context](/mcp/primitives#the-call-context) 被调用。其返回值成为工具的结果：

| 方法的返回值 | 客户端获得 |
| --- | --- |
| 一个字符串 | 一个文本块 |
| 另一个值，带有 `outputSchema` | 该值作为 `structuredContent`（根据模式验证），以及一个 JSON 文本块 |
| 另一个值，不带 | 一个 JSON 文本块 |
| 一个 `CallToolResult`（`{ content, structuredContent?, isError? }`） | 原样，适用于图像、音频、嵌入资源和链接 |
| `undefined` | 一个空结果 |

名称默认为方法的（`find`）；工具名称长度为 1 到 128 个字符，超出 `A-Z a-z 0-9 _ - .`，并且两个具有相同名称的工具在启动时会失败。`annotations` 是给客户端的提示，例如 `readOnlyHint: true`，允许它在不先询问用户的情况下运行该工具。

要返回除文本以外的内容，例如模型需要查看的图片，请自行返回一个 `CallToolResult`（来自 `@modelcontextprotocol/server`）：

```typescript title="orders/orders.tools.ts"
@Tool({
  name: 'product-photo',
  description:
    'Show the photo of a product, to compare it with what the customer describes',
  inputSchema: z.object({
    sku: z.string().describe('The product SKU, such as SKU-1042'),
  }),
  annotations: { readOnlyHint: true },
})
async photo({ sku }: { sku: string }): Promise<CallToolResult> {
  const photo = await this.catalog.photo(sku);
  return {
    content: [
      {
        type: 'image',
        data: photo.toString('base64'),
        mimeType: 'image/jpeg',
      },
    ],
  };
}

```

> info **提示** 模型通过名称和描述选择工具，并从其 `.describe()` 文本中填充参数，因此请为模型编写这些文本：工具的作用和使用时机、每个参数的含义，以及一个示例值。说明工具何时会改变某些内容。

#### 资源

资源是客户端读取的数据，并显示给用户或提供给模型。`@Resource()` 提供一个固定 URI，`@ResourceTemplate()` 提供匹配 [RFC 6570](https://datatracker.ietf.org/doc/html/rfc6570) 模板的每个 URI，该方法接收模板中的变量：

```typescript title="orders/orders.tools.ts"
@Resource({
  uri: 'catalog://products',
  description: 'Every product and its stock',
  mimeType: 'application/json',
})
catalog() {
  return this.catalog.all();
}

@ResourceTemplate({
  uriTemplate: 'orders://{orderId}',
  description: 'One order',
  mimeType: 'application/json',
})
async order({ orderId }: { orderId: string }) {
  const order = await this.orders.findById(orderId);
  if (!order) {
    throw new NotFoundException();
  }
  return order;
}

```

字符串作为 `mimeType` 的文本发送，`Uint8Array` 或 `Buffer` 作为二进制块，`ReadResourceResult`（`{ contents: [...] }`）原样发送，其他任何内容作为 JSON。对于 `NotFoundException`，将返回规范的资源未找到错误。

资源适用于客户端原样加载到对话中的内容：目录、订单、退货政策。客户端决定何时读取它们，通常是在用户附加文件时。要让模型查找信息并提供参数，请为其提供一个工具。

#### 提示

提示是用户在客户端选择的消息模板。其参数也是一个模式，客户端会向用户询问每个参数：

```typescript title="orders/orders.tools.ts"
@Prompt({
  name: 'draft-reply',
  description: 'Draft a reply to a customer about an order',
  argsSchema: z.object({
    orderId: z.string().describe('The order the customer wrote about'),
    tone: z.enum(['formal', 'friendly']).describe('How the reply sounds'),
  }),
})
async draftReply({
  orderId,
  tone,
}: {
  orderId: string;
  tone: 'formal' | 'friendly';
}) {
  const order = await this.orders.findById(orderId);
  return `Draft a ${tone} reply to the customer of order ${orderId}. The order: ${JSON.stringify(order)}`;
}

```

字符串是一个用户消息；消息数组或 `GetPromptResult`（`{ messages: [...] }`）原样发送。

提示也可以用多条消息开启对话。这一个将订单作为嵌入式资源附加，然后提出问题：

```typescript title="orders/orders.tools.ts"
@Prompt({
  name: 'review-complaint',
  description: 'Review a complaint about an order',
  argsSchema: z.object({
    orderId: z.string().describe('The order the complaint is about'),
  }),
})
async reviewComplaint({
  orderId,
}: {
  orderId: string;
}): Promise<PromptMessage[]> {
  const order = await this.orders.findById(orderId);
  return [
    {
      role: 'user',
      content: {
        type: 'resource',
        resource: {
          uri: `orders://${orderId}`,
          mimeType: 'application/json',
          text: JSON.stringify(order),
        },
      },
    },
    {
      role: 'user',
      content: {
        type: 'text',
        text: 'Is the complaint about this order justified? Answer in two sentences.',
      },
    },
  ];
}

```

`PromptMessage` 是来自 `@modelcontextprotocol/server` 的一个类型。

#### 试用

启动应用程序，端点位于 `http://localhost:3000/mcp`。[MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) 列出了服务器暴露的所有内容并调用它们：

```bash
$ npx @modelcontextprotocol/inspector

```

选择 **Streamable HTTP**，输入 URL，然后 **连接**。连接到远程 MCP 服务器的助手使用相同的 URL。

#### 调用上下文

每个 MCP 方法的第二个参数是一个 `McpContext`：

| 属性 | 含义 |
| --- | --- |
| `kind`, `name`, `uri` | `'tool'`, `'resource'` 或 `'prompt'`；工具或提示的名称，或资源的名称；正在读取的 URI |
| `authInfo` | 已验证的访问令牌，带有 [authorization](/mcp/primitives#authorization)：`clientId`, `scopes`, `expiresAt`, `extra` |
| `request` | HTTP 平台的请求（Express, Fastify, Node 适配器），带有其头部和设置的任何中间件；对于内存测试客户端，是一个纯 `{ method, url, headers }` 对象；通过 stdio 的 `undefined` |
| `requestInfo` | SDK 提供的 Web 标准 `Request` |
| `transport`, `era` | `'http'` 或 `'stdio'`；`'modern'`（协议修订版 2026-07-28）或 `'legacy'`（2025 年修订版） |
| `signal` | 一个 `AbortSignal`，当客户端取消调用或断开连接时中止：将其传递给 `fetch()` 和您的数据库 |
| `reportProgress(progress, total?, message?)` | 当客户端请求时发送进度通知 |
| `server` | SDK 自身的请求上下文，用于其余部分（`mcpReq.envelope`, `mcpReq.inputResponses`） |

```typescript
@Tool({
  name: 'export-orders',
  description: 'Export a month of orders as CSV',
})
async export(_input: unknown, ctx: McpContext) {
  const pages = await this.orders.pages();
  for (let page = 0; page < pages; page++) {
    ctx.signal.throwIfAborted();
    await this.orders.exportPage(page, { signal: ctx.signal });
    await ctx.reportProgress(page + 1, pages);
  }
  return 'Exported';
}

```

**询问用户。** 需要用户确认或缺少值的工具将从 `@modelcontextprotocol/server` 返回 `inputRequired()`：客户端询问用户，然后使用答案再次调用该工具，该答案由 `acceptedContent()` 读取和验证：

```typescript
@Tool({
  name: 'cancel-order',
  description: 'Cancel an order',
  inputSchema: z.object({ orderId: z.string() }),
})
cancel({ orderId }: { orderId: string }, ctx: McpContext) {
  const Confirmation = z.object({ confirm: z.boolean() });
  const answer = acceptedContent(
    ctx.server.mcpReq.inputResponses,
    'confirm',
    Confirmation,
  );
  if (!answer) {
    return inputRequired({
      inputRequests: {
        confirm: inputRequired.elicit({
          message: `Cancel order ${orderId}?`,
          requestedSchema: Confirmation,
        }),
      },
    });
  }
  return answer.confirm ? this.orders.cancel(orderId) : 'Kept the order';
}

```

> warning **警告** 通过 HTTP，这与 2026-07-28 修订版的客户端兼容。2025 年修订版的客户端通过服务器的请求被询问，这需要一个会话，而端点不保留会话：调用以工具错误结束。通过 stdio，两者都有效。

#### 守卫、拦截器、管道和过滤器

每个调用都经过 Nest 的增强器，这些增强器可以绑定到类、方法或全局，就像路由一样。执行上下文的类型是 `'mcp'`，而 `McpExecutionContext` 读取调用，就像 GraphQL 解析器中的 `GqlExecutionContext` 一样。只有支持团队可以更改顺序：

```typescript title="orders/support-team.guard.ts"
import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { McpExecutionContext } from '@nestjs/mcp';

@Injectable()
export class SupportTeamGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const mcp = McpExecutionContext.create(context);
    return mcp.getAuthInfo()?.extra?.team === 'support';
  }
}

```

```typescript title="orders/orders.tools.ts"
@Tool({ name: 'change-address', ... })
@UseGuards(SupportTeamGuard)
async changeAddress(...) {}

```

`McpExecutionContext.create(context)` 具有 `getInput()`（参数）、`getContext()`（`McpContext`）、`getKind()`、`getName()`、`getRequest()` 和 `getAuthInfo()`。拦截器在方法返回值成为结果之前看到它，可以对其进行计时、记录或转换。管道看到输入是调用的 `body`，因此全局 `ValidationPipe({ transform: true })` 会验证您用以输入的数据传输对象类，就像对路由所做的那样。使用 `createParamDecorator()` 创建的自定义参数装饰器在输入和上下文之后工作，就像 GraphQL 解析器中一样：`add(input, ctx, @CurrentUser() user)`。

拦截器以相同的方式工作。这个拦截器记录了每次调用的耗时、类型和名称：

```typescript title="orders/call-logging.interceptor.ts"
import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { McpExecutionContext } from '@nestjs/mcp';
import { tap, type Observable } from 'rxjs';

@Injectable()
export class CallLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('MCP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const mcp = McpExecutionContext.create(context);
    const started = performance.now();
    return next
      .handle()
      .pipe(
        tap(() =>
          this.logger.log(
            `${mcp.getKind()} ${mcp.getName()} took ${Math.round(performance.now() - started)} ms`,
          ),
        ),
      );
  }
}

```

`@UseInterceptors(CallLoggingInterceptor)` 在 `OrdersTools` 类上记录了该类的每个工具、资源和提示。

> 警告 **警告** 全局守卫、拦截器和过滤器（`app.useGlobalGuards()`、`APP_GUARD`）也会在 MCP 调用上运行，就像在 GraphQL 解析器和承载它们的 HTTP 请求上一样。为 HTTP 路由编写的增强器读取 `context.switchToHttp().getRequest()` 时，应首先检查 `context.getType() === 'http'`。

#### 错误

工具抛出的内容会成为带有 `isError: true` 的结果，模型可以读取并从中恢复：一个 `HttpException`（一个 `BadRequestException('The address has no postcode')`）的消息，以及任何其他错误的 `Internal server error`，Nest 的异常处理器会记录该错误，且其消息永远不会到达客户端。资源和提示以 JSON-RPC 错误的形式回答：资源未找到时是 `NotFoundException`，参数无效时是 `BadRequestException`，内部错误时是另一个 `HttpException`，其中包含其消息和状态。异常过滤器可以代替回答：它返回的结果是结果，而它抛出的 `ProtocolError`（来自 `@modelcontextprotocol/server`）是 JSON-RPC 错误。

```typescript
@Catch(PaymentProviderError)
export class PaymentProviderFilter implements ExceptionFilter {
  catch(exception: PaymentProviderError, host: ArgumentsHost) {
    if (host.getType<McpContextType>() !== 'mcp') {
      throw exception;
    }
    return {
      content: [
        {
          type: 'text',
          text: 'Payments are down; try again in a few minutes.',
        },
      ],
      isError: true,
    };
  }
}

```

#### 授权

订单 API 的 MCP 服务器回答有关客户的问题，因此需要已登录用户。在 MCP 中，服务器是一个 OAuth 2.1 **资源服务器**：客户端从存储的身份提供者（Auth0、Keycloak、Entra ID、WorkOS、您自己的）获取访问令牌，并随每次请求发送。服务器验证它，绝不颁发令牌。配置 `auth`：

```typescript title="app.module.ts"
McpModule.forRoot({
  name: 'cat-store',
  version: '1.0.0',
  auth: {
    verifier: IdentityProviderTokenVerifier,
    resource: 'https://api.catstore.example/mcp',
    authorizationServers: ['https://auth.catstore.example'],
    scopesSupported: ['orders:read'],
  },
}),

```

- `resource` 是 MCP 服务器的规范 URL。客户端向身份提供者请求该服务器的令牌，服务器只接受为其颁发的令牌（其受众），如规范要求。
- `authorizationServers` 是它接受的颁发者。该模块提供它们，使用 `scopesSupported` 作为 [protected resource metadata](https://datatracker.ietf.org/doc/html/rfc9728)（RFC 9728）在 `/.well-known/oauth-protected-resource/mcp`，客户端在此发现如何登录。
- 没有有效令牌的请求将收到 401 响应，其中包含指向元数据的 `WWW-Authenticate: Bearer` 挑战。该挑战启动了客户端的登录过程。

**验证器**决定哪些令牌有效。它是您拥有的一个类，包含 `verifyAccessToken(token)`，返回令牌的 `AuthInfo`，或返回 `null` 以拒绝它。Nest 实例化它，因此它注入所需的依赖。对于 JWT 访问令牌，`JwtVerifier` 来自 `@nestjs/authentication` 会根据身份提供者的密钥、颁发者、受众和有效期检查签名：

```typescript title="auth/identity-provider-token.verifier.ts"
import { Injectable } from '@nestjs/common';
import { JwtVerifier } from '@nestjs/authentication';
import type { McpTokenVerifier } from '@nestjs/mcp';
import type { AuthInfo } from '@modelcontextprotocol/server';

const RESOURCE = 'https://api.catstore.example/mcp';

@Injectable()
export class IdentityProviderTokenVerifier implements McpTokenVerifier {
  private readonly jwt = new JwtVerifier({
    jwks: 'https://auth.catstore.example/.well-known/jwks.json',
    issuer: 'https://auth.catstore.example',
    audience: RESOURCE,
    type: 'at+jwt',
  });

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    // A bad signature, an expired token or another audience throws a JwtError: answered with 401.
    const claims = await this.jwt.verify(token);
    return {
      token,
      clientId: String(claims.client_id ?? claims.sub),
      scopes: typeof claims.scope === 'string' ? claims.scope.split(' ') : [],
      expiresAt: claims.exp,
      resource: new URL(RESOURCE),
      extra: { team: claims.team },
    };
  }
}

```

带有 `status: 401`（`JwtError`、`UnauthorizedException`）的错误拒绝令牌；任何其他错误（无法获取密钥）将以 500 响应。不透明令牌则通过身份提供者的自省端点处理，方法相同。

对于不透明令牌，验证器会向身份提供者的自省端点（[RFC 7662](https://datatracker.ietf.org/doc/html/rfc7662)）查询：

```typescript title="auth/introspection-token.verifier.ts"
import { Injectable } from '@nestjs/common';
import type { McpTokenVerifier } from '@nestjs/mcp';
import type { AuthInfo } from '@modelcontextprotocol/server';

const RESOURCE = 'https://api.catstore.example/mcp';

@Injectable()
export class IntrospectionTokenVerifier implements McpTokenVerifier {
  async verifyAccessToken(token: string): Promise<AuthInfo | null> {
    const credentials = btoa(
      `${process.env.INTROSPECTION_CLIENT_ID}:${process.env.INTROSPECTION_CLIENT_SECRET}`,
    );
    const response = await fetch(
      'https://auth.catstore.example/oauth/introspect',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: `Basic ${credentials}`,
        },
        body: new URLSearchParams({ token }),
      },
    );
    if (!response.ok) {
      // No verdict on the token: answered with 500.
      throw new Error(`Token introspection failed with ${response.status}`);
    }
    const claims = (await response.json()) as {
      active: boolean;
      aud?: string | string[];
      client_id: string;
      scope?: string;
      exp: number;
    };
    if (!claims.active || ![claims.aud].flat().includes(RESOURCE)) {
      return null; // Answered with 401.
    }
    return {
      token,
      clientId: claims.client_id,
      scopes: claims.scope ? claims.scope.split(' ') : [],
      expiresAt: claims.exp,
      resource: new URL(RESOURCE),
    };
  }
}

```

无论您编写哪个验证器，该模块都会检查其返回的两个内容：`resource` 必须是 `auth.resource` URL，并且 `expiresAt` 必须设置且在未来。任何不满足其中一项的令牌都将以 401 拒绝。

**作用域。** 工具、资源或提示上的 `scopes` 指定令牌必须携带的内容。没有这些作用域的调用在方法运行前会以 403 响应，并在挑战中包含缺失的作用域，客户端会要求用户授予它们（提升授权）。`requiredScopes` 在 `auth` 中要求每次请求都包含作用域：

```typescript
@Tool({ name: 'change-address', ..., scopes: ['orders:write'] })

```

在没有 `auth` 的情况下声明 `scopes` 会在启动时失败，因为没有任何东西会检查它们。令牌在方法中是 `ctx.authInfo`，在守卫中是 `McpExecutionContext.create(context).getAuthInfo()`，因为决策作用域不表达这些。

**使用 `@nestjs/authentication` 和 `@nestjs/authorization`。** 它们的全局守卫会在每次 MCP 调用上运行。认证守卫会使用您提供的提供者对来自 HTTP 请求的调用进行认证：一个接受身份提供者令牌的 `JwtBearerProvider` 会接受 MCP 客户端的令牌。然后 `@CurrentUser()` 和 `AuthenticationContext` 在工具中工作，而 `@Can()` 策略决定每次调用：

```typescript title="orders/orders.tools.ts"
@Tool({
  name: 'refund',
  description: 'Refund an order',
  inputSchema: z.object({ orderId: z.string() }),
})
@Can(OrderPolicy, 'refund')
refund(
  { orderId }: { orderId: string },
  ctx: McpContext,
  @CurrentUser() agent: Agent,
) {
  return this.orders.refund(orderId, agent);
}

```

使用 `decorators: [Public()]` 将端点路由从认证守卫中排除，并让 `auth` 回答其未认证的请求：守卫自身的挑战不会将 MCP 客户端指向元数据。对调用的拒绝是工具错误，`Unauthorized` 或 `Forbidden`，没有声明任何 `@Can()` 的工具将被拒绝，就像路由一样。在 stdio 上没有请求，因此除非您自己的提供者从环境中进行认证，否则调用是匿名的。

> 信息 **提示** 这需要 `@nestjs/authentication` 0.1.3 和 `@nestjs/authorization` 0.1.1 或更高版本，这些是了解 MCP 调用的第一个版本（上下文类型 `'mcp'`）。使用早期版本时，全局守卫在调用上找不到凭据：标记您工具的提供者为 `@Public()`。

#### 每次请求可见性

`scopes` 会列出工具并挑战调用，这适合可以向用户请求更多信息的客户端。有时工具根本不应该存在于某个请求中：它受功能标志保护，属于另一个租户，或者客户端永远不会被授予其作用域。存储首先向少数支持代理发布 `refund`。`filter` 在其服务器注册之前选择每个请求提供的原始数据：

```typescript title="app.module.ts"
McpModule.forRootAsync({
  imports: [FlagsModule],
  inject: [FlagsService],
  useFactory: (flags: FlagsService) => ({
    name: 'cat-store',
    version: '1.0.0',
    filter: async ({ tools }, { authInfo }) => {
      const refunds = await flags.isEnabled('refunds', authInfo?.clientId);
      return {
        tools: tools.filter((tool) => tool.name !== 'refund' || refunds),
      };
    },
  }),
}),

```

- 它接收应用程序声明的每个原始数据，作为 `tools`、`resources`、`resourceTemplates` 和 `prompts`，并返回其中的一个子集。它排除的列表保留了该类中的所有项。第二个参数是服务器构建的目标：`transport`、`era`、`authInfo`（带 `auth`）和 HTTP 平台的请求 `request`。
- 被排除的原始数据既不列出也不可调用：调用它会先于任何守卫运行，获得 SDK 的未知工具错误。
- 当没有工具被排除时，服务器停止宣传工具，并且 `tools/list` 会回答“未找到方法”而不是空列表。资源和提示以相同方式工作。
- 它对每个 HTTP 请求运行一次。在 stdio 上，它对每个连接运行一次，当客户端使用 `server/discover` 探针打开然后回退到 2025 握手时运行一次：在一个连接上两次，使用不同的 `era`。
- 如果它抛出异常，或返回了未提供的原始数据，则请求失败。它绝不会返回所有原始数据。

> 信息 **提示** 客户端保留了它获取的列表，因此 `filter` 返回内容的变化（一个标志被打开）仅在它再次列出工具时才会显示。

#### 装饰器

| 装饰器 | 选项 | 方法接收的参数 |
| --- | --- | --- |
| `@Tool()` | `name`, `title`, `description`, `inputSchema`, `outputSchema`, `annotations`, `icons`, `_meta`, `scopes` | 已验证的参数，上下文 |
| `@Resource()` | `uri`, `name`, `title`, `description`, `mimeType`, `size`, `annotations`, `icons`, `_meta`, `cacheHint`, `scopes` | `{}`，上下文 (`ctx.uri`) |
| `@ResourceTemplate()` | `uriTemplate`，以及相同的内容 | 模板的变量，上下文 |
| `@Prompt()` | `name`, `title`, `description`, `argsSchema`, `icons`, `_meta`, `scopes` | 已验证的参数，上下文 |