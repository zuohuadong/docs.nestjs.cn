<!-- 此文件从 content/security/helmet.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:39:06.941Z -->
<!-- 源文件: content/security/helmet.md -->
<!-- 源哈希: f8bccae807ae292e268c55ea6bc0a633 -->

### 安全头信息

像 [Helmet](https://github.com/helmetjs/helmet) 设置的安全头信息会告诉浏览器开启对跨站脚本和点击劫持等已知网络攻击的防护。示例包括 `Content-Security-Policy`、`Strict-Transport-Security` 和 `X-Frame-Options`。

从 NestJS v12.1 开始，Nest 可以使用 `app.useSecurityHeaders()` 为您设置这些头信息。它使用与 Helmet 8 相同的默认值，在 Express、Fastify 和 [Node adapter](/techniques/performance#node-adapter) 上以相同方式工作，无需额外包。

#### 入门

要启用这些头信息，请在 Nest 应用程序对象上调用 `useSecurityHeaders()` 方法：

```typescript
// main.ts
const app = await NestFactory.create(AppModule);
app.useSecurityHeaders();
await app.listen(process.env.PORT ?? 3000);

```

这些头信息会设置在每个响应上：路由响应、`404` 响应、错误响应、被 [CSRF protection](/security/csrf) 拒绝的响应以及 Server-Sent Events 流。`X-Powered-By` 头信息会被移除。适用以下规则：

- 在调用 `app.init()` 或 `app.listen()` 之前调用 `useSecurityHeaders()`。之后调用或调用两次会抛出错误。
- 选项在调用方法时进行验证，因此错误的配置会在启动时失败（参见 [Configuring headers](/security/helmet#configuring-headers)）。
- 这些头信息由框架级别的中间件（Express 和 Node 适配器）或 `onRequest` 钩子（Fastify）写入，在调用该方法时注册。使用 `app.use()` 在该调用之前注册的中间件会先运行，并且此类中间件发送的响应本身不携带这些头信息，因此请在 `NestFactory.create()` 之后立即调用 `useSecurityHeaders()`。
- `app.enableCsrfProtection()` 共享相同的请求钩子。您可以按任意顺序调用这两个方法：头信息始终在 CSRF 检查运行之前写入。

#### 默认头信息

不带选项时，`useSecurityHeaders()` 会发送以下头信息，其值与 Helmet 8 相同：

| 头信息 | 默认值 | 选项 |
| :--- | :--- | :--- |
| `Content-Security-Policy` | 参见 [Content Security Policy](/security/helmet#content-security-policy) | `contentSecurityPolicy` |
| `Cross-Origin-Embedder-Policy` | 不发送 | `crossOriginEmbedderPolicy` |
| `Cross-Origin-Opener-Policy` | `same-origin` | `crossOriginOpenerPolicy` |
| `Cross-Origin-Resource-Policy` | `same-origin` | `crossOriginResourcePolicy` |
| `Origin-Agent-Cluster` | `?1` | `originAgentCluster` |
| `Referrer-Policy` | `no-referrer` | `referrerPolicy` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | `strictTransportSecurity` |
| `X-Content-Type-Options` | `nosniff` | `xContentTypeOptions` |
| `X-DNS-Prefetch-Control` | `off` | `xDnsPrefetchControl` |
| `X-Download-Options` | `noopen` | `xDownloadOptions` |
| `X-Frame-Options` | `SAMEORIGIN` | `xFrameOptions` |
| `X-Permitted-Cross-Domain-Policies` | `none` | `xPermittedCrossDomainPolicies` |
| `X-XSS-Protection` | `0` | `xXssProtection` |
| `X-Powered-By` | 移除 | `xPoweredBy` |

> info **提示** 浏览器在纯 HTTP 上忽略 `Strict-Transport-Security`，而 `X-XSS-Protection: 0` 会关闭旧浏览器中的 XSS 审计器，后者本身就是一个漏洞来源。

#### 配置头信息

每个选项控制一个头信息。传入 `false` 以排除该头信息，传入 `true` 以发送其默认值，或传入一个对象进行配置：

```typescript
app.useSecurityHeaders({
  xFrameOptions: false,
  strictTransportSecurity: { maxAge: 63072000, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

```

接受对象的选项具有以下属性：

| 选项 | 属性 |
| :--- | :--- |
| `contentSecurityPolicy` | `directives`、`useDefaults`（默认 `true`）和 `reportOnly`（默认 `false`）。参见 [Content Security Policy](/security/helmet#content-security-policy)。 |
| `crossOriginEmbedderPolicy` | `policy`：`'require-corp'`（用于 `true`）、`'credentialless'` 或 `'unsafe-none'`。 |
| `crossOriginOpenerPolicy` | `policy`：`'same-origin'`（默认）、`'same-origin-allow-popups'`、`'noopener-allow-popups'` 或 `'unsafe-none'`。 |
| `crossOriginResourcePolicy` | `policy`：`'same-origin'`（默认）、`'same-site'` 或 `'cross-origin'`。 |
| `referrerPolicy` | `policy`：一个引用策略，例如 `'strict-origin-when-cross-origin'`（默认 `'no-referrer'`），或一个策略列表，浏览器将其读取为后备链。 |
| `strictTransportSecurity` | `maxAge` 秒（默认 `31536000`，即 365 天）、`includeSubDomains`（默认 `true`）和 `preload`（默认 `false`）。 |
| `xDnsPrefetchControl` | `allow`（默认 `false`）。`true` 发送 `on`。 |
| `xFrameOptions` | `action`：`'sameorigin'`（默认）或 `'deny'`。 |
| `xPermittedCrossDomainPolicies` | `permittedPolicies`：`'none'`（默认）、`'master-only'`、`'by-content-type'` 或 `'all'`。 |

其余选项 `originAgentCluster`、`xContentTypeOptions`、`xDownloadOptions`、`xPoweredBy` 和 `xXssProtection` 只接受布尔值。例如，`xPoweredBy: false` 会保留 `X-Powered-By` 头信息。

当调用 `useSecurityHeaders()` 时，未知选项、未知属性和无效值会抛出错误。Helmet 的遗留选项名称会以提示当前名称的方式被拒绝，例如 `Invalid security headers configuration: unknown option "hsts" (helmet's legacy name, use "strictTransportSecurity").`

路由仍可以使用 [`@Header()`](/overview/controllers#response-headers) 装饰器覆盖头信息，例如允许其他站点加载图片：

```typescript
@Get('avatars/:id')
@Header('Cross-Origin-Resource-Policy', 'cross-origin')
findAvatar(@Param('id') id: string) {}

```

> info **提示** 在 Fastify 上，`reply.header()` 也会覆盖头信息，但 `reply.removeHeader()` 不能移除由 `useSecurityHeaders()` 设置的头信息。

#### 内容安全策略

默认的 `Content-Security-Policy` 与 Helmet 8 相同。它在一行中发送，分号后没有空格：

```text
default-src 'self';
base-uri 'self';
font-src 'self' https: data:;
form-action 'self';
frame-ancestors 'self';
img-src 'self' data:;
object-src 'none';
script-src 'self';
script-src-attr 'none';
style-src 'self' https: 'unsafe-inline';
upgrade-insecure-requests

```

使用 `directives` 属性进行更改：

```typescript
app.useSecurityHeaders({
  contentSecurityPolicy: {
    directives: {
      scriptSrc: ["'self'", 'https://cdn.example.com'],
      connectSrc: ["'self'", 'wss://realtime.example.com'],
      upgradeInsecureRequests: null,
    },
  },
});

```

指令的工作方式如下：

- 名称使用 camelCase (`scriptSrc`) 或 kebab-case (`'script-src'`) 编写。
- 您设置的指令会**替换**同名的默认指令，因此如果想保留默认指令，请包含 `'self'`。其他指令会被添加到策略中。
- 值是一个字符串或字符串列表。`true` 或空列表发送一个没有值的指令，而 `null` 或 `false` 则移除一个指令，包括默认指令。
- 关键字、nonce 和 hash 必须使用单引号，如 `"'self'"` 所示。未加引号的 `self` 会被拒绝，因为浏览器会将其读取为主机名。
- 值只能包含可打印的 ASCII 字符，不能包含 `;` 或 `,`，因此值不能添加指令或策略。

要仅发送您自己的指令，请将 `useDefaults` 设置为 `false`。然后策略需要一个 `defaultSrc` 指令，除非您将 `defaultSrc: null` 设置为故意省略它。

要尝试一个不破坏页面的策略，请将 `reportOnly` 设置为 `true`。Nest 随后发送 `Content-Security-Policy-Report-Only`，浏览器报告违规而不是阻止它们。添加一个 `report-to` 或 `report-uri` 指令以接收报告。

```typescript
app.useSecurityHeaders({
  contentSecurityPolicy: { reportOnly: true },
});

```

要完全省略该头部，请将 `contentSecurityPolicy` 设置为 `false`。

#### Swagger UI 和 GraphQL IDEs

该策略适用于所有响应，包括 API 工具的 HTML 页面。

由 `@nestjs/swagger` 提供的 [Swagger UI](/openapi/introduction) 从您的应用程序加载其脚本和样式表，因此它与默认策略兼容。如果您使用 `customJs` 选项添加脚本，请将它们的 hosts 添加到 `scriptSrc`。来自 `customJsStr` 选项的内联代码需要 `'unsafe-inline'`。默认的 `upgrade-insecure-requests` 指令会使浏览器通过 HTTPS 加载脚本和样式表，因此，例如在本地开发之外的暂存服务器上通过 IP 地址提供 Swagger UI 时，它们将无法加载。请通过 HTTPS 提供 Swagger UI，或使用 `upgradeInsecureRequests: null` 移除该指令。

由 Apollo 驱动提供的 [GraphiQL](/graphql/quick-start#graphql-ide) 从 `unpkg.com` 加载 React 和 GraphiQL，并以内联脚本启动。默认情况下，只有当 `NODE_ENV` 不是 `production` 时才启用 GraphiQL，因此仅在那里放宽策略：

```typescript
const isProduction = process.env.NODE_ENV === 'production';

app.useSecurityHeaders({
  contentSecurityPolicy: isProduction
    ? true
    : {
        directives: {
          scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
        },
      },
});

```

使用 `ApolloServerPluginLandingPageLocalDefault()` 启用的 [Apollo Sandbox](/graphql/quick-start#apollo-sandbox) 从 Apollo 的 CDN 加载其脚本、图像和清单，并将 Sandbox 嵌入到框架中：

```typescript
app.useSecurityHeaders({
  contentSecurityPolicy: {
    directives: {
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        'https://embeddable-sandbox.cdn.apollographql.com',
      ],
      imgSrc: [
        "'self'",
        'data:',
        'https://apollo-server-landing-page.cdn.apollographql.com',
      ],
      manifestSrc: [
        "'self'",
        'https://apollo-server-landing-page.cdn.apollographql.com',
      ],
      frameSrc: ["'self'", 'https://sandbox.embed.apollographql.com'],
    },
  },
});

```

> warning **警告** `'unsafe-inline'` 在 `script-src` 中会放弃 CSP 对跨站脚本攻击提供的大部分保护，针对您的应用程序提供的每个页面。在生产环境中应避免使用。

#### 直接使用 Helmet

已经使用 Helmet 的应用程序可以继续使用它。由于 `useSecurityHeaders()` 的选项名称与 Helmet 相同，切换时通常会保留 Helmet 配置，但有两个例外：

- CSP 指令值必须是字符串、字符串列表、布尔值或 `null`。Helmet 接受的用于生成每次请求 nonce 的函数不受支持。
- Helmet 的遗留选项名称被拒绝：

| 遗留 Helmet 名称 | 选项 |
| :--- | :--- |
| `dnsPrefetchControl` | `xDnsPrefetchControl` |
| `frameguard` | `xFrameOptions` |
| `hidePoweredBy` | `xPoweredBy` |
| `hsts` | `strictTransportSecurity` |
| `ieNoOpen` | `xDownloadOptions` |
| `noSniff` | `xContentTypeOptions` |
| `permittedCrossDomainPolicies` | `xPermittedCrossDomainPolicies` |
| `xssFilter` | `xXssProtection` |

要使用 Helmet 本身，请为您的平台安装该包，并在对 `app.use()` 的其他调用或可能调用 `app.use()` 的设置函数之前注册它。底层平台按注册顺序应用中间件，因此在路由之后注册的 Helmet 不适用于该路由。上述 CSP 指令也与 Helmet 的 `contentSecurityPolicy` 选项一起工作。

##### Express

```bash
$ npm i helmet

```

```typescript
// main.ts
import helmet from 'helmet';

app.use(helmet());

```

##### Fastify

使用 `FastifyAdapter`，请使用 [@fastify/helmet](https://github.com/fastify/fastify-helmet) 包。它是一个 [Fastify plugin](https://fastify.dev/docs/latest/Reference/Plugins/)，而不是中间件，因此请使用 `app.register()` 注册它：

```bash
$ npm i @fastify/helmet

```

```typescript
// main.ts
import helmet from '@fastify/helmet';

await app.register(helmet);

```