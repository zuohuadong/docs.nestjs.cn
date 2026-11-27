<!-- 此文件从 content/http/sessions.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:59:08.090Z -->
<!-- 源文件: content/http/sessions.md -->
<!-- 源哈希: 9e61f2557123ec461b9345dc2e904b04 -->

### 会话

**HTTP 会话**在多个请求中存储有关用户的**信息**，这对于[MVC](/http/mvc)**混合应用程序**特别有用。

#### 与 Express (默认) 的使用

首先，安装[express-session](https://github.com/expressjs/session)包（以及 TypeScript 用户的类型）：

```shell
$ npm i express-session
$ npm i -D @types/express-session

```

安装完成后，将`express-session`**中间件**作为全局**中间件**应用（例如，在您的`main.ts`文件中）：

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

> 警告 **注意** 默认的服务器端会话存储故意不适用于生产环境。在大多数情况下它会泄漏内存，无法扩展到单个进程之外，仅用于调试和开发。更多信息请参阅[express-session repository](https://github.com/expressjs/session)。

`secret`用于签名会话 ID **Cookie**。它可以是字符串（单个密钥）或密钥数组。如果提供数组，只有第一个元素用于签名会话 ID **Cookie**，而在请求中验证签名时会考虑所有元素。密钥不应容易猜测；随机字符集效果最佳。

启用`resave`选项会强制将会话保存回会话存储，即使在请求期间会话未被修改。默认值为`true`，但依赖默认值已弃用，因为默认值将来会更改。

同样，启用`saveUninitialized`选项会强制将“未初始化”的会话保存到存储中。当会话是新的但未被修改时，它就是未初始化的。选择`false`对于实现登录会话、减少服务器存储使用量或遵守在设置 **Cookie** 前需要许可的法律非常有用。选择`false`也有助于解决客户端在没有会话的情况下发出多个并行请求时的竞态条件（参见[`saveUninitialized` documentation](https://github.com/expressjs/session#saveuninitialized)）。

`session`**中间件**接受其他几个选项。更多信息请参阅[express-session API documentation](https://github.com/expressjs/session#选项)。

> 信息 **提示** 推荐使用`cookie.secure: true`选项。但是，它需要启用 HTTPS 的网站，因为安全 **Cookie** 仅通过 HTTPS 发送。如果设置了`secure`，并且您通过 HTTP 访问您的网站，则不会设置 **Cookie**。如果您的 Node.js 服务器在代理后运行并且您使用了`secure: true`，则需要在 Express 中设置`"trust proxy"`。

设置好后，您可以在路由处理程序内部设置和读取会话值，如下所示：

```typescript
@Get()
findAll(@Req() request: Request) {
  request.session.visits = request.session.visits ? request.session.visits + 1 : 1;
}

```

> 信息 **提示** `@Req()` **装饰器**是从`@nestjs/common`包导入的，而`Request`是从`express`包导入的。

或者，您可以使用`@Session()`**装饰器**从 **请求** 中提取会话对象，如下所示：

```typescript
@Get()
findAll(@Session() session: Record<string, any>) {
  session.visits = session.visits ? session.visits + 1 : 1;
}

```

> 信息 **提示** `@Session()` **装饰器**是从`@nestjs/common`包导入的。

#### 与 Fastify 的使用

首先，安装所需的包：

```shell
$ npm i @fastify/secure-session

```

安装完成后，注册`@fastify/secure-session`**插件**：

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

> 信息 **提示** 您也可以[pregenerate a key](https://github.com/fastify/fastify-secure-session)或使用[key rotation](https://github.com/fastify/fastify-secure-session#using-keys-with-key-rotation)。

有关可用选项的更多信息请参阅[@fastify/secure-session repository](https://github.com/fastify/fastify-secure-session)。

设置好后，您可以在路由处理程序内部设置和读取会话值，如下所示：

```typescript
@Get()
findAll(@Req() request: FastifyRequest) {
  const visits = request.session.get('visits');
  request.session.set('visits', visits ? visits + 1 : 1);
}

```

或者，您可以使用`@Session()`**装饰器**从 **请求** 中提取会话对象，如下所示：

```typescript
@Get()
findAll(@Session() session: secureSession.Session) {
  const visits = session.get('visits');
  session.set('visits', visits ? visits + 1 : 1);
}

```

> 信息 **提示** `@Session()` **装饰器**是从`@nestjs/common`包导入的，而`secureSession.Session`来自`@fastify/secure-session`包（导入语句：`import * as secureSession from '@fastify/secure-session'`）。