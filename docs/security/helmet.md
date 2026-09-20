<!-- 此文件从 content/security/helmet.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T07:46:07.991Z -->
<!-- 源文件: content/security/helmet.md -->
<!-- 源哈希: b83bd6268445d166f3f6c8fb5ae3ff97 -->

### Helmet

[Helmet](https://github.com/helmetjs/helmet) 可以通过适当设置 HTTP 头来帮助保护您的应用免受一些众所周知的 Web 漏洞的影响。通常，Helmet 只是一组设置安全相关 HTTP 头的较小中间件函数的集合（阅读 [more](https://github.com/helmetjs/helmet#how-it-works)）。

> info **提示** 请注意，将 `helmet` 作为全局应用或注册它必须在对 `app.use()` 的其他调用或可能调用 `app.use()` 的设置函数之前进行。这是因为底层平台（即 Express 或 Fastify）的工作方式，中间件/路由的定义顺序很重要。如果您在定义路由后使用像 `helmet` 或 `cors` 这样的中间件，那么该中间件将不会应用于该路由，它只会应用于中间件之后定义的路由。

#### 与 Express 一起使用（默认）

首先安装所需的包。

```bash
$ npm i --save helmet

```

安装完成后，将其作为全局中间件应用。

```typescript
import helmet from 'helmet';
// somewhere in your initialization file
app.use(helmet());

```

> warning **警告** 当使用 `helmet`、`@apollo/server`（4.x）和 [Apollo Sandbox](/graphql/quick-start#apollo-sandbox) 时，Apollo Sandbox 上的 [CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP) 可能存在问题。要解决此问题，请按如下所示配置 CSP：
>
> ```typescript
> app.use(helmet({
>   crossOriginEmbedderPolicy: false,
>   contentSecurityPolicy: {
>     directives: {
>       imgSrc: [`'self'`, 'data:', 'apollo-server-landing-page.cdn.apollographql.com'],
>       scriptSrc: [`'self'`, `https: 'unsafe-inline'`],
>       manifestSrc: [`'self'`, 'apollo-server-landing-page.cdn.apollographql.com'],
>       frameSrc: [`'self'`, 'sandbox.embed.apollographql.com'],
>     },
>   },
> }));
> ```

#### 与 Fastify 一起使用

如果您使用 `FastifyAdapter`，请安装 [@fastify/helmet](https://github.com/fastify/fastify-helmet) 包：

```bash
$ npm i --save @fastify/helmet

```

[fastify-helmet](https://github.com/fastify/fastify-helmet) 不应作为中间件使用，而应作为 [Fastify plugin](https://www.fastify.io/docs/latest/Reference/Plugins/)，即通过使用 `app.register()`：

```typescript
import helmet from '@fastify/helmet'
// somewhere in your initialization file
await app.register(helmet)

```

> warning **警告** 当使用 `apollo-server-fastify` 和 `@fastify/helmet` 时，GraphQL playground 上的 [CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP) 可能存在问题，要解决此冲突，请按如下所示配置 CSP：
>
> ```typescript
> await app.register(fastifyHelmet, {
>    contentSecurityPolicy: {
>      directives: {
>        defaultSrc: [`'self'`, 'unpkg.com'],
>        styleSrc: [
>          `'self'`,
>          `'unsafe-inline'`,
>          'cdn.jsdelivr.net',
>          'fonts.googleapis.com',
>          'unpkg.com',
>        ],
>        fontSrc: [`'self'`, 'fonts.gstatic.com', 'data:'],
>        imgSrc: [`'self'`, 'data:', 'cdn.jsdelivr.net'],
>        scriptSrc: [
>          `'self'`,
>          `https: 'unsafe-inline'`,
>          `cdn.jsdelivr.net`,
>          `'unsafe-eval'`,
>        ],
>      },
>    },
>  });
>
> // If you are not going to use CSP at all, you can use this:
> await app.register(fastifyHelmet, {
>   contentSecurityPolicy: false,
> });
> ```