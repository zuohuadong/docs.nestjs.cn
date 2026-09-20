<!-- 此文件从 content/techniques/cookies.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T08:20:11.680Z -->
<!-- 源文件: content/techniques/cookies.md -->
<!-- 源哈希: 91110f6b6466cd5f2b866c6137fb1beb -->

### Cookie

**HTTP cookie** 是存储在用户浏览器中的一小段数据。Cookie 被设计为网站记住状态信息的可靠机制。当用户再次访问网站时，cookie 会自动随请求发送。

#### 与 Express 一起使用（默认）

首先，安装 [required package](https://github.com/expressjs/cookie-parser)（以及 TypeScript 用户的类型）：

```shell
$ npm i cookie-parser
$ npm i -D @types/cookie-parser

```

安装完成后，将 `cookie-parser` 中间件作为全局中间件应用（例如，在你的 `main.ts` 文件中）。

```typescript
import cookieParser from 'cookie-parser';
// somewhere in your initialization file
app.use(cookieParser());

```

你可以向 `cookieParser` 中间件传递几个选项：

- `secret` 用于签名 cookie 的字符串或数组。这是可选的，如果未指定，将不会解析签名 cookie。如果提供了字符串，则将其用作密钥。如果提供了数组，则将尝试按顺序使用每个密钥来取消签名 cookie。
- `options` 一个对象，作为第二个选项传递给 `cookie.parse`。有关更多信息，请参阅 [cookie](https://www.npmjs.org/package/cookie)。

中间件将解析请求上的 `Cookie` 头，并将 cookie 数据作为属性 `req.cookies` 暴露，如果提供了密钥，则作为属性 `req.signedCookies` 暴露。这些属性是 cookie 名称到 cookie 值的名称值对。

当提供密钥时，此模块将取消签名并验证任何签名的 cookie 值，并将这些名称值对从 `req.cookies` 移动到 `req.signedCookies`。签名 cookie 是值以 `s:` 为前缀的 cookie。签名验证失败的签名 cookie 将具有值 `false`，而不是被篡改的值。

有了这些，你现在可以在路由处理器中读取 cookie，如下所示：

```typescript
@Get()
findAll(@Req() request: Request) {
  console.log(request.cookies); // or "request.cookies['cookieKey']"
  // or console.log(request.signedCookies);
}

```

> info **提示** `@Req()` 装饰器从 `@nestjs/common` 导入，而 `Request` 从 `express` 包导入。

要将 cookie 附加到传出响应，请使用 `Response#cookie()` 方法：

```typescript
@Get()
findAll(@Res({ passthrough: true }) response: Response) {
  response.cookie('key', 'value')
}

```

> warning **警告** 如果你想将响应处理逻辑留给框架，请记得将 `passthrough` 选项设置为 `true`，如上所示。阅读更多 [here](/overview/controllers#库特定方法)。

> info **提示** `@Res()` 装饰器从 `@nestjs/common` 导入，而 `Response` 从 `express` 包导入。

#### 与 Fastify 一起使用

首先，安装所需的包：

```shell
$ npm i @fastify/cookie

```

安装完成后，注册 `@fastify/cookie` 插件：

```typescript
import fastifyCookie from '@fastify/cookie';

// somewhere in your initialization file
const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
await app.register(fastifyCookie, {
  secret: 'my-secret', // for cookies signature
});

```

有了这些，你现在可以在路由处理器中读取 cookie，如下所示：

```typescript
@Get()
findAll(@Req() request: FastifyRequest) {
  console.log(request.cookies); // or "request.cookies['cookieKey']"
}

```

> info **提示** `@Req()` 装饰器从 `@nestjs/common` 导入，而 `FastifyRequest` 从 `fastify` 包导入。

要将 cookie 附加到传出响应，请使用 `FastifyReply#setCookie()` 方法：

```typescript
@Get()
findAll(@Res({ passthrough: true }) response: FastifyReply) {
  response.setCookie('key', 'value')
}

```

要了解有关 `FastifyReply#setCookie()` 方法的更多信息，请查看此 [page](https://github.com/fastify/fastify-cookie#sending)。

> warning **警告** 如果你想将响应处理逻辑留给框架，请记得将 `passthrough` 选项设置为 `true`，如上所示。阅读更多 [here](/overview/controllers#库特定方法)。

> info **提示** `@Res()` 装饰器从 `@nestjs/common` 导入，而 `FastifyReply` 从 `fastify` 包导入。

#### 创建自定义装饰器（跨平台）

为了提供一种方便、声明式的方式来访问传入的 cookie，我们可以创建一个 [custom decorator](/custom-decorators)。

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const Cookies = createParamDecorator((data: string, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return data ? request.cookies?.[data] : request.cookies;
});

```

`@Cookies()` 装饰器将从 `req.cookies` 对象中提取所有 cookie 或命名 cookie，并用该值填充装饰的参数。

有了这些，我们现在可以在路由处理器签名中使用该装饰器，如下所示：

```typescript
@Get()
findAll(@Cookies('name') name: string) {}

```