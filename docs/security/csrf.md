<!-- 此文件从 content/security/csrf.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:38:23.457Z -->
<!-- 源文件: content/security/csrf.md -->
<!-- 源哈希: 8a1f17833288e8228819f239792ebb98 -->

### CSRF 保护

跨站请求伪造（CSRF 或 XSRF）是一种攻击，恶意网站会诱导用户的浏览器向您的应用程序发送不需要的状态变更请求。由于浏览器会将用户的 Cookie 附加到这些请求上，应用程序会将其视为用户有意发送的请求。

从 NestJS v12.1 开始，Nest 内置了 CSRF 保护。它在 Express、Fastify 和 [Node adapter](/techniques/performance#node-adapter) 上以相同方式工作，无需额外的包、Cookie、会话或更改客户端代码。

#### 工作原理

现代浏览器会告知服务器每个请求来自哪里。它们会发送一个 [`Sec-Fetch-Site`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Sec-Fetch-Site) 头部（Fetch Metadata 的一部分），当请求由您自己的页面发起时，它是 `same-origin`；当由其他站点发起时，它是 `same-site` 或 `cross-site`。对于跨域请求，它们还会发送一个 `Origin` 头部。内置保护会拒绝浏览器报告为跨域的状态变更请求，遵循 Go 1.25 的 [`CrossOriginProtection`](https://pkg.go.dev/net/http#CrossOriginProtection) 算法。

详细来说，每个请求按如下方式检查：

1. `GET`、`HEAD` 和 `OPTIONS` 请求始终允许。
2. 如果请求具有 `Sec-Fetch-Site` 头部，则允许值 `same-origin` 和 `none`（用户发起的导航，例如打开书签）。任何其他值，包括 `same-site`，都将被拒绝。
3. 如果请求既没有 `Sec-Fetch-Site` 也没有 `Origin` 头部，则允许，因为它不是来自浏览器。
4. 否则，`Origin` 头部的主机必须与请求的 `Host` 头部匹配（HTTP/2 上的 `:authority`）。比较是大小写不敏感的，并且忽略方案的默认端口，因此 `https://example.com` 匹配 `example.com:443`。`X-Forwarded-Host` 头部被忽略。

如果请求将被拒绝，但它匹配 [excluded route](/security/csrf#排除路由)，或者其 `Origin` 是 [trusted origins](/security/csrf#trusted-origins) 中的一个，则仍被允许。

#### 入门

要启用保护，请在 Nest 应用程序对象上调用 `enableCsrfProtection()` 方法：

```typescript
// main.ts
const app = await NestFactory.create(AppModule);
app.enableCsrfProtection();
await app.listen(process.env.PORT ?? 3000);

```

此检查在每个请求上运行，包括不存在的路由请求，并且在 Nest 中间件、正文解析器、守卫、拦截器和路由处理程序之前运行。适用以下规则：

- 在 `app.init()` 或 `app.listen()` 之前调用 `enableCsrfProtection()`。之后调用或调用两次都会抛出错误。
- 选项在调用方法时进行验证，因此错误的配置会在启动时失败。例如，拼写错误的选项会抛出 `Invalid CSRF protection options: unknown option "trustedOrigin" (expected "trustedOrigins", "exclude").`
- 该检查在调用方法时注册为框架级别的中间件（Express 和 Node 适配器）或 `onRequest` 钩子（Fastify）。在调用方法时，使用 `app.use()` 注册的中间件会先运行，因此请在 `NestFactory.create()` 之后立即调用 `enableCsrfProtection()`。
- `app.useSecurityHeaders()`（参见 [Security headers](/security/helmet)）共享相同的请求钩子。您可以按任意顺序调用这两个方法：头部总是在 CSRF 检查运行之前写入的，因此被拒绝的请求也会携带这些头部。
- `setGlobalPrefix()` 和 `enableVersioning()` 可以调用在 `enableCsrfProtection()` 之前或之后，因为排除项在应用程序初始化时解析。

#### 被拒绝的请求

被拒绝的请求会变成一个 `ForbiddenException`，它会像任何其他异常一样通过您的全局 [exception filters](/overview/exception-filters)。如果没有自定义过滤器，客户端会收到如下 `403` 响应：

```json
{
  "message": "Cross-origin request detected from Sec-Fetch-Site header",
  "error": "Forbidden",
  "statusCode": 403
}

```

当请求没有 `Sec-Fetch-Site` 头部且其 `Origin` 不匹配 `Host` 时，消息是 `Cross-origin request detected, and/or browser is out of date: Sec-Fetch-Site is missing, and Origin does not match Host`。

由于检查在路由之前运行，因此对于被拒绝的请求，控制器作用域的过滤器、守卫和拦截器不会运行。

#### 选项

`enableCsrfProtection()` 方法接受一个可选的选项对象：

```typescript
app.enableCsrfProtection({
  trustedOrigins: ['https://admin.example.com'],
  exclude: [{ path: 'webhooks/stripe', method: RequestMethod.POST }],
});

```

| 选项 | 类型 | 描述 |
| :--- | :--- | :--- |
| `trustedOrigins` | `string[]` | 可能发送跨域状态变更请求的源。默认为无。 |
| `exclude` | 路径和 `RouteInfo` 对象的数组，或一个函数 | 跳过检查的请求。仅针对本应被拒绝的请求进行查询。 |

任何其他选项在调用方法时都会被拒绝。

#### 受信任的源

从另一个源（例如兄弟子域上的管理面板）提供的前端会发送跨域请求。浏览器将其报告为 `same-site` 或 `cross-site`，因此除非您在 `trustedOrigins` 中列出前端的源，否则它们将被拒绝：

```typescript
app.enableCsrfProtection({
  trustedOrigins: ['https://admin.example.com', 'http://localhost:4200'],
});

```

每个条目必须是 `scheme://host[:port]` 格式的序列化源：

- 不允许路径（即使有尾随 `/`）、查询字符串、片段、凭据和通配符。请单独列出每个源。
- 条目按浏览器序列化 `Origin` 头部的方式进行规范化：小写，不带默认端口。`https://Example.com:443` 变为 `https://example.com`。
- 当请求的 `Origin` 头部恰好等于其中一个条目时，请求被豁免。

无效的条目会在启动时抛出，例如 `Invalid trusted origin "https://example.com/": expected "scheme://host[:port]", without a path, query string or fragment.`

> 警告 **警告** [CORS](/security/cors) 允许的源不会自动被信任。如果跨域前端使用凭据发送状态变更请求，也请在 `trustedOrigins` 中列出其源。

#### 排除路由

服务器到服务器的请求通常不携带 `Sec-Fetch-Site` 也不携带 `Origin`，因此它们在没有配置的情况下通过检查。当必须接受来自外部源的请求时，请排除某个路由，例如来自设置了 `Origin` 头的 Webhook 发送者，或来自使用跨站表单 `POST`（SAML 或 OAuth 的 `form_post` 响应模式）将用户重定向到您应用程序的身份提供者。

排除项的声明方式类似于 `MiddlewareConsumer.exclude()`（参见 [Middleware](/overview/middlewares)）：作为路径，匹配所有请求方法；或作为一个包含 `path`、一个 `method` 和一个可选的 `version` 的 `RouteInfo` 对象。路径不使用全局前缀声明：

```typescript
// main.ts
import { RequestMethod } from '@nestjs/common';

app.setGlobalPrefix('api');
app.enableCsrfProtection({
  exclude: [
    // POST /api/webhooks/stripe
    { path: 'webhooks/stripe', method: RequestMethod.POST },
    // POST /api/auth/saml/callback
    { path: 'auth/saml/callback', method: RequestMethod.POST },
  ],
});

```

排除项在应用程序初始化时解析：

- 添加 [global prefix](/faq/global-prefix)，除非该路由被排除在其中。如果一个排除项匹配一个被排除在前缀之外的路径，并且该路径没有参数或通配符，则该排除项也适用于该路径，该路径在不使用前缀的情况下被服务。此匹配始终区分大小写。例如，如果使用 `webhooks/stripe` 从前缀中排除，则 `webhooks/*path` 同时排除 `/api/webhooks/github` 和 `/webhooks/stripe`。
- 使用 [URI versioning](/http/versioning) 时，会添加 `version` 属性的版本段。不应用默认版本，因此请在版本化路由的排除项上设置 `version`。
- 路由参数和通配符的行为与路由路径相同，例如 `webhooks/:provider` 或 `webhooks/*path`。

与 `MiddlewareConsumer.exclude()` 不同，匹配是精确的，因为宽松匹配可能会允许请求到达未被排除的路由：

- 匹配区分大小写，尾随斜杠不匹配。查询字符串被忽略。
- 非规范的请求路径永远不会匹配：包含 `//`、`.` 或 `..` 段、`;`、`#`、`\` 或百分号编码的 `.`、`/` 或 `\` 的路径都不会匹配。此类请求像其他请求一样通过检查，因此保护失败为关闭状态。
- 在 Fastify 上，排除项在 `rewriteUrl` 运行之前，像 `MiddlewareConsumer.exclude()` 一样，与 URL 进行匹配。

如果您的 Fastify 应用程序启用了 `ignoreTrailingSlash` 或 `caseSensitive: false` 路由器选项，则排除路径的变体仍然到达路由但未被排除，因此它们被拒绝。如果客户端需要此类变体，请明确列出它们。由于排除路径会剥离尾随斜杠，请使用可选组来匹配它：

```typescript
app.enableCsrfProtection({
  exclude: [
    // matches /webhooks/stripe and /webhooks/stripe/
    { path: 'webhooks/stripe{/}', method: RequestMethod.POST },
    // a variant accepted with caseSensitive: false
    { path: 'webhooks/Stripe', method: RequestMethod.POST },
  ],
});

```

除了列表外，`exclude` 还接受一个谓词，该谓词接收平台请求对象（一个 Express `Request`、一个 `FastifyRequest` 或一个 `NodeRequest`）并返回 `true` 以跳过检查。它仅对本应被拒绝的请求调用。

> 警告 **警告** 谓词接收原始请求，因此上述任何匹配规则都不适用于它。例如，一个测试 `request.url` 是否以 `/public/` 开头的谓词也会跳过对 `/public/../account` 的检查，而该路由或代理可能解析为 `/account`。如果可能，请优先使用路由列表。

#### 限制

- 此保护不是令牌方案。它依赖于浏览器的 `Sec-Fetch-Site` 头，浏览器仅向安全源（HTTPS 或 `localhost`）发送此头，或依赖于 `Origin` 头。
- `GET`、`HEAD` 和 `OPTIONS` 请求永远不会被检查，因此这些方法的处理程序不应改变状态。
- `Origin`/`Host` 备用机制不知道协议。对于不发送 `Sec-Fetch-Site` 的浏览器，来自 `http://example.com` 到 `https://example.com` 的请求是允许的（失败为开放），类似于 Go。[HSTS](/security/helmet#default-headers) 默认发送 `app.useSecurityHeaders()`，可减轻此问题。
- `X-Forwarded-Host` 被忽略。在重写 `Host` 头的代理后面，不发送 `Sec-Fetch-Site` 的浏览器会触发备用机制并收到 `403`。配置代理以保留 `Host`，或将您的公共源添加到 `trustedOrigins`。
- `403` 响应在 CORS 在保护之后注册时不会携带 CORS 头，这是使用 `NestFactory.create()` 的 `cors` 选项时的情况。
- 在 `enableCsrfProtection()` 运行之前使用 `app.use()` 注册的中间件会先于检查运行，此类中间件响应的请求不会被检查。
- WebSocket 升级请求不被检查。如果您的 [gateways](/websockets/gateways) 使用 Cookie 认证连接，请自行验证握手中的 `Origin` 头。

#### 何时需要基于令牌的方法

CSRF 利用浏览器自动附加到请求上的凭据，因此移动应用、CLI 工具和其他服务器等非浏览器客户端不需要 CSRF 保护。它们的请求既不携带 `Sec-Fetch-Site` 也不携带 `Origin`，因此是允许的。

自 2023 年以来，每个主流浏览器都已发送了 `Sec-Fetch-Site`。发送了任一头的非常旧的浏览器看起来像非浏览器客户端，因此它们的请求也是允许的。如果必须保护此类浏览器的用户，请按照以下描述添加基于令牌的方案。

#### 基于令牌的保护

基于令牌的方案将一个密钥存储在 Cookie 或会话中，并要求客户端在每次改变状态的请求中发送匹配的令牌。它们需要对客户端代码进行更改，并依赖于底层平台的一个包。

##### Express

安装 [csrf-csrf](https://github.com/Psifi-Solutions/csrf-csrf) 包：

```bash
$ npm i csrf-csrf

```

然后将其中间件注册为全局中间件。`doubleCsrf()` 函数需要 `getSecret` 和 `getSessionIdentifier` 选项；其他选项有默认值：

```typescript
// main.ts
import { doubleCsrf } from 'csrf-csrf';

const { doubleCsrfProtection } = doubleCsrf(doubleCsrfOptions);
app.use(doubleCsrfProtection);

```

> 警告 **警告** 如 [csrf-csrf documentation](https://github.com/Psifi-Solutions/csrf-csrf?tab=readme-ov-file#入门) 所述，此中间件要求预先初始化会话中间件或 `cookie-parser`。`doubleCsrf()` 还返回一个生成您的路由提供给客户端的令牌的函数。请参阅文档了解更多详细信息。

##### Fastify

安装 [@fastify/csrf-protection](https://github.com/fastify/csrf-protection) 包：

```bash
$ npm i @fastify/csrf-protection

```

然后将其注册为 Fastify 插件：

```typescript
// main.ts
import fastifyCsrf from '@fastify/csrf-protection';

// after registering a storage plugin
await app.register(fastifyCsrf);

```

> 警告 **警告** 如 [@fastify/csrf-protection documentation](https://github.com/fastify/csrf-protection#用法) 所述，此插件要求首先注册存储插件（`@fastify/cookie`、`@fastify/session` 或 `@fastify/secure-session`）。