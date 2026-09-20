<!-- 此文件从 content/techniques/sessions.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T08:37:47.782Z -->
<!-- 源文件: content/techniques/sessions.md -->
<!-- 源哈希: cb8fa733a9a5c48e243d71743608ff50 -->

### 会话

**HTTP 会话**提供了一种在多个请求之间存储用户信息的方式，这对于 [MVC](/techniques/mvc) 应用尤其有用。

#### 与 Express 一起使用（默认）

首先，安装 [required package](https://github.com/expressjs/session)（以及 TypeScript 用户的类型）：

```shell
$ npm i express-session
$ npm i -D @types/express-session

```

安装完成后，将 `express-session` 中间件作为全局中间件应用（例如，在你的 `main.ts` 文件中）。

```typescript
import session from 'express-session';
// somewhere in your initialization file
app.use(
  session({
    secret: 'my-secret',
    resave: false,
    saveUninitialized: false,
  }),
);

```

> warning **注意** 默认的服务器端会话存储并非为生产环境设计。在大多数情况下它会泄漏内存，无法扩展到单个进程之外，仅用于调试和开发。更多信息请参阅 [official repository](https://github.com/expressjs/session)。

`secret` 用于对会话 ID Cookie 进行签名。这可以是单个密钥的字符串，也可以是多个密钥的数组。如果提供了密钥数组，则仅使用第一个元素对会话 ID Cookie 进行签名，而在验证请求中的签名时会考虑所有元素。密钥本身不应容易被人类解析，最好是一组随机字符。

启用 `resave` 选项会强制将会话保存回会话存储，即使请求期间从未修改过会话。默认值为 `true`，但使用默认值已被弃用，因为默认值将来会更改。

同样，启用 `saveUninitialized` 选项会强制将“未初始化”的会话保存到存储中。当会话是新的但未修改时，它就是未初始化的。选择 `false` 对于实现登录会话、减少服务器存储使用或遵守要求在设置 Cookie 之前获得许可的法律非常有用。选择 `false` 还有助于处理客户端在没有会话的情况下发出多个并行请求的竞争条件（[source](https://github.com/expressjs/session#saveuninitialized)）。

你可以向 `session` 中间件传递其他几个选项，更多信息请参阅 [API documentation](https://github.com/expressjs/session#选项)。

> info **提示** 请注意，`secure: true` 是推荐选项。但是，它需要启用 HTTPS 的网站，即安全 Cookie 需要 HTTPS。如果设置了 secure，并且你通过 HTTP 访问站点，则不会设置 Cookie。如果你的 node.js 位于代理后面并使用 `secure: true`，则需要在 express 中设置 `"trust proxy"`。

完成此设置后，你现在可以在路由处理程序中设置和读取会话值，如下所示：

```typescript
@Get()
findAll(@Req() request: Request) {
  request.session.visits = request.session.visits ? request.session.visits + 1 : 1;
}

```

> info **提示** `@Req()` 装饰器从 `@nestjs/common` 导入，而 `Request` 从 `express` 包导入。

或者，你可以使用 `@Session()` 装饰器从请求中提取会话对象，如下所示：

```typescript
@Get()
findAll(@Session() session: Record<string, any>) {
  session.visits = session.visits ? session.visits + 1 : 1;
}

```

> info **提示** `@Session()` 装饰器从 `@nestjs/common` 包导入。

#### 与 Fastify 一起使用

首先，安装所需的包：

```shell
$ npm i @fastify/secure-session

```

安装完成后，注册 `fastify-secure-session` 插件：

```typescript
import secureSession from '@fastify/secure-session';

// somewhere in your initialization file
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter(),
);
await app.register(secureSession, {
  secret: 'averylogphrasebiggerthanthirtytwochars',
  salt: 'mq9hDxBVDbspDR6n',
});

```

> info **提示** 你也可以预生成密钥（[see instructions](https://github.com/fastify/fastify-secure-session)）或使用 [keys rotation](https://github.com/fastify/fastify-secure-session#using-keys-with-key-rotation)。

有关可用选项的更多信息，请参阅 [official repository](https://github.com/fastify/fastify-secure-session)。

完成此设置后，你现在可以在路由处理程序中设置和读取会话值，如下所示：

```typescript
@Get()
findAll(@Req() request: FastifyRequest) {
  const visits = request.session.get('visits');
  request.session.set('visits', visits ? visits + 1 : 1);
}

```

或者，你可以使用 `@Session()` 装饰器从请求中提取会话对象，如下所示：

```typescript
@Get()
findAll(@Session() session: secureSession.Session) {
  const visits = session.get('visits');
  session.set('visits', visits ? visits + 1 : 1);
}

```

> info **提示** `@Session()` 装饰器从 `@nestjs/common` 导入，而 `secureSession.Session` 从 `@fastify/secure-session` 包导入（导入语句：`import * as secureSession from '@fastify/secure-session'`）。