<!-- 此文件从 content/techniques/cookies.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-13T08:31:29.909Z -->
<!-- 源文件: content/techniques/cookies.md -->
<!-- 源哈希: 91110f6b6466cd5f2b866c6137fb1beb -->

### Cookie

**HTTP Cookie** 是存储在用户浏览器中的一小段数据。Cookie 被设计为网站记住状态信息的可靠机制。当用户再次访问网站时，Cookie 会自动随请求一起发送。

#### 与 Express 配合使用（默认）

首先，安装所需的包（以及 TypeScript 用户所需的类型定义）：

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

你可以向 `cookieParser` 中间件传递多个选项：

- `secret` 用于签名 Cookie 的字符串或数组。这是可选的，如果未指定，则不会解析签名 Cookie。如果提供了字符串，则将其用作密钥。如果提供了数组，则将依次使用每个密钥尝试对 Cookie 进行反签名。
- `options` 作为第二个选项传递给 `cookie.parse` 的对象。有关更多信息，请参阅 [cookie](https://www.npmjs.org/package/cookie)。

该中间件将解析请求上的 `Cookie` 头，并将 Cookie 数据作为属性 `req.cookies` 暴露出来，如果提供了密钥，则还会作为属性 `req.signedCookies` 暴露。这些属性是 Cookie 名称到 Cookie 值的键值对。

当提供密钥时，此模块将反签名并验证任何已签名的 Cookie 值，并将这些键值对从 `req.cookies` 移动到 `req.signedCookies`。签名 Cookie 是指值以 `s:` 为前缀的 Cookie。签名验证失败的签名 Cookie 将具有值 `false`，而不是被篡改的值。

有了这些设置，你现在可以在路由处理器中读取 Cookie，如下所示：

```typescript
@Get()
findAll(@Req() request: Request) {
  console.log(request.cookies); // or "request.cookies['cookieKey']"
  // or console.log(request.signedCookies);
}

```

> info **提示** `@Req()` 装饰器从 `@nestjs/common` 导入，而 `Request` 从 `express` 包导入。

要将 Cookie 附加到传出响应，请使用 `Response#cookie()` 方法：

```typescript
@Get()
findAll(@Res({ passthrough: true }) response: Response) {
  response.cookie('key', 'value')
}

```

> warning **警告** 如果你希望将响应处理逻辑留给框架处理，请记得将 `passthrough` 选项设置为 `true`，如上所示。了解更多 [here](/overview/controllers#库特定方法)。

> info **提示** `@Res()` 装饰器从 `@nestjs/common` 导入，而 `Response` 从 `express` 包导入。

#### 与 Fastify 配合使用

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

有了这些设置，你现在可以在路由处理器中读取 Cookie，如下所示：

```typescript
@Get()
findAll(@Req() request: FastifyRequest) {
  console.log(request.cookies); // or "request.cookies['cookieKey']"
}

```

> info **提示** `@Req()` 装饰器从 `@nestjs/common` 导入，而 `FastifyRequest` 从 `fastify` 包导入。

要将 Cookie 附加到传出响应，请使用 `FastifyReply#setCookie()` 方法：

```typescript
@Get()
findAll(@Res({ passthrough: true }) response: FastifyReply) {
  response.setCookie('key', 'value')
}

```

要了解更多关于 `FastifyReply#setCookie()` 方法的信息，请查看此 [page](https://github.com/fastify/fastify-cookie#sending)。

> warning **警告** 如果你希望将响应处理逻辑留给框架处理，请记得将 `passthrough` 选项设置为 `true`，如上所示。了解更多 [here](/overview/controllers#库特定方法)。

> info **提示** `@Res()` 装饰器从 `@nestjs/common` 导入，而 `FastifyReply` 从 `fastify` 包导入。

#### 创建自定义装饰器（跨平台）

为了提供一种便捷、声明式的方式来访问传入的 Cookie，我们可以创建一个 [custom decorator](/custom-decorators)。

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const Cookies = createParamDecorator((data: string, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return data ? request.cookies?.[data] : request.cookies;
});

```

`@Cookies()` 装饰器将从 `req.cookies` 对象中提取所有 Cookie，或指定名称的 Cookie，并将该值填充到被装饰的参数中。

有了这些设置，我们现在可以在路由处理器的签名中使用该装饰器，如下所示：

```typescript
@Get()
findAll(@Cookies('name') name: string) {}

```