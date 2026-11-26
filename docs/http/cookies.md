<!-- 此文件从 content/http/cookies.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T23:01:25.956Z -->
<!-- 源文件: content/http/cookies.md -->
<!-- 源哈希: 58d9bc7d849edf0fdee4c961c8788694 -->

### Cookies

**HTTP cookie** 是用户浏览器存储的一小段数据。Cookie 最初被设计为网站记住有状态信息的可靠机制。当用户再次访问网站时，浏览器会自动将 Cookie 与 **请求** 一起发送。

从 NestJS v12.1 开始，Nest 原生支持 Cookie。相同的 API 适用于所有 HTTP **传输器**（Express、Fastify 或扩展 `AbstractHttpAdapter` 的自定义 **传输器**），无需额外包：

- `@Cookies()` 和 `@SignedCookies()` 参数 **装饰器** 读取 **请求** 中发送的 Cookie
- HTTP **传输器** 的 `setCookie()` 和 `clearCookie()` 方法写入 `Set-Cookie` **响应** 头
- `cookies` 应用选项启用签名 Cookie，并支持密钥轮换

已使用 `cookie-parser` 或 `@fastify/cookie` 的应用程序保持不变地工作。请参阅 [Using cookie-parser or @fastify/cookie](#using-cookie-parser-or-fastifycookie) 了解这两种方法的交互方式。

#### 读取 Cookie

使用 `@Cookies()` **装饰器** 从传入的 **请求** 中提取 Cookie。传入一个 Cookie 名称以提取单个 Cookie，或省略它以获取以 Cookie 名称为键的所有 Cookie 对象。

```typescript
import { Controller, Cookies, Get } from '@nestjs/common';

@Controller('preferences')
export class PreferencesController {
  @Get()
  findAll(@Cookies() cookies: Record<string, string>) {
    return cookies;
  }

  @Get('theme')
  findTheme(@Cookies('theme') theme?: string) {
    return theme ?? 'light';
  }
}

```

> info **提示** 从 `@nestjs/common` 包导入 `@Cookies()` **装饰器**。

未发送的命名 Cookie 将解析为 `undefined`。Nest 仅在参数请求 Cookie 时解析 `Cookie` 头，并且每次 **请求** 最多解析一次。值经过百分号解码，当出现同名 Cookie 多次时，第一个出现的值生效（浏览器会先发送路径最具体的 Cookie）。

与 `@Query()` 或 `@Param()` 一样，您可以在 Cookie 名称后传递 [pipes](/pipes)：

```typescript
@Get('cart')
findCart(@Cookies('cartSize', ParseIntPipe) cartSize: number) {
  return { cartSize };
}

```

在此设置下，一个 `cartSize=abc` Cookie 会产生一个 `400 Bad Request` **响应**，缺少 Cookie 也会如此，除非您启用了 **管道** 的 `optional` 选项。

> info **提示** **管道** 接收 Cookie 参数时，`ArgumentMetadata` 的 `type` 属性被设置为 `'custom'`。因此，全局 `ValidationPipe` 会跳过它们，除非您启用了其 `validateCustomDecorators` 选项。

> warning **警告** `@Cookies()` 不验证签名。其值直接来自客户端，可能已被篡改，因此应使用 `@SignedCookies()` 来信任任何需要的**值**（参见 [Signing cookies](#signing-cookies)）。

#### 设置和清除 Cookie

Cookie 是通过 HTTP **传输器** 写入的，该 **传输器** 为此提供了两个方法：

- `setCookie(response, name, value, options?)` 向 **响应** 追加一个 `Set-Cookie` 头
- `clearCookie(response, name, options?)` 追加一个 `Set-Cookie` 头，立即使 Cookie 过期

两个方法都接受原生 **响应** 对象作为第一个参数。在路由处理程序中，注入 `HttpAdapterHost`（参见 [HTTP adapter](/faq/http-adapter)）并使用 `@Res()` **装饰器** 获取 **响应** 对象，并启用其 `passthrough` 选项：

```typescript
import { Body, Controller, Delete, Put, Res } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Controller('preferences')
export class PreferencesController {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  @Put('theme')
  setTheme(
    @Body('theme') theme: string,
    @Res({ passthrough: true }) res: unknown,
  ) {
    this.adapterHost.httpAdapter.setCookie(res, 'theme', theme, {
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // one year, in seconds
    });
  }

  @Delete('theme')
  resetTheme(@Res({ passthrough: true }) res: unknown) {
    this.adapterHost.httpAdapter.clearCookie(res, 'theme');
  }
}

```

> warning **警告** 要将 **响应** 处理逻辑留给框架，请将 `passthrough` 选项设置为 `true`，如上所示。有关详细信息，请参阅 **控制器** 章的 [library-specific approach](/overview/controllers#库特定方法) 部分。

**控制器** 永远不需要知道 **响应** 对象的类型：`setCookie()` 接受底层平台提供的任何内容（Express `Response`、`FastifyReply` 等），这使得代码与平台无关。每次调用都会追加其自身的 `Set-Cookie` 头，因此在处理 **请求** 期间设置的所有 Cookie 都会在每个平台上发送。由于这些方法只需要 **响应** 对象，您也可以使用 `context.switchToHttp().getResponse()` 从 **守卫** 或 **拦截器** 中调用它们。

> info **提示** `setCookie()` 和 `clearCookie()` 是 `HttpServer` 接口的可选成员。`AbstractHttpAdapter` 在其 `appendHeader()` 方法之上一次性实现它们，因此所有扩展它的 **传输器**（包括 `ExpressAdapter` 和 `FastifyAdapter`）都支持它们。

Cookie **值** 必须是字符串。它总是使用 `encodeURIComponent()` 进行百分号编码（然后由 `@Cookies()` 解码），因此任何字符串都安全存储。请使用 `JSON.stringify()` 等自行转换其他类型。

`options` 参数（从 `@nestjs/common` 导出的 `CookieSerializeOptions` 接口）接受以下属性：

| 选项 | 描述 | 默认值 |
| :--- | :--- | :--- |
| `path` | `Path` 属性。 | `'/'` |
| `domain` | `Domain` 属性。必须是有效的主机名，可选地带有前导点。省略时，Cookie 仅限于主机。 | 未设置 |
| `maxAge` | `Max-Age` 属性，单位为**秒**。必须是整数。 | 未设置 |
| `expires` | `Expires` 属性，作为 `Date`。当两者都设置时，浏览器优先使用 `maxAge`。 | 未设置 |
| `httpOnly` | `HttpOnly` 属性。隐藏 Cookie 不被客户端 JavaScript 访问。 | `false` |
| `secure` | `Secure` 属性。浏览器仅通过 HTTPS 发送 Cookie。 | `false` |
| `sameSite` | `SameSite` 属性：`'strict'`、`'lax'` 或 `'none'`。`'none'` 需要 `secure: true`。 | 未设置 |
| `partitioned` | `Partitioned` 属性 (CHIPS)。需要 `secure: true`。 | `false` |
| `priority` | `Priority` 属性 (非标准，Chromium 支持)：`'low'`、`'medium'` 或 `'high'`。 | 未设置 |
| `signed` | 使用第一个配置的密钥对 **值** 进行签名。参见 [Signing cookies](#signing-cookies)。 | `false` |

除了 `path` 外，没有属性有默认值，包括 `httpOnly`，这与 Express 和 `@fastify/cookie` 的行为一致。对于携带凭证或会话标识符的 Cookie，请明确设置 `httpOnly`、`secure` 和 `sameSite`。

> warning **警告** `maxAge` 以**秒**为单位，与 RFC 6265 和 `@fastify/cookie` 一致。Express 的 `res.cookie()` 方法接受**毫秒**中的 `maxAge`，因此从其不改变地转换过来的值会使 Cookie 生效时间长 1000 倍。对于一天，请传入 `60 * 60 * 24`。

`clearCookie()` 使用 `Max-Age=0` 创建一个空 Cookie，并设置一个在过去的 `Expires` 日期。浏览器仅在 `path` 和 `domain` 与设置时匹配时才会移除 Cookie，因此请将相同的值传递给两个方法。由于 `path` 在两者中都默认为 `/`，所以 `clearCookie(res, 'theme')` 可以清除使用 `setCookie(res, 'theme', value)` 设置的 Cookie。`maxAge`、`expires` 和 `signed` 选项被 `clearCookie()` 忽略。

#### 签名 Cookie

签名的 Cookie 会在其值旁边携带一个 HMAC 签名，这使得服务器能够检测客户端是否篡改了它。要启用签名，请通过 `NestFactory.create()` 方法的 `cookies` 选项传入一个密钥：

```typescript
// main.ts
const app = await NestFactory.create(AppModule, {
  cookies: {
    secret: process.env.COOKIE_SECRET,
  },
});

```

然后，使用 `signed` 选项设置 Cookie，并使用 `@SignedCookies()` 装饰器读取它们：

```typescript
import {
  Body,
  Controller,
  Get,
  Post,
  Res,
  SignedCookies,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly authService: AuthService,
  ) {}

  @Post('login')
  async signIn(
    @Body() signInDto: SignInDto,
    @Res({ passthrough: true }) res: unknown,
  ) {
    const user = await this.authService.signIn(signInDto);
    this.adapterHost.httpAdapter.setCookie(res, 'uid', String(user.id), {
      signed: true,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60, // one hour, in seconds
    });
  }

  @Get('profile')
  getProfile(@SignedCookies('uid') userId?: string) {
    if (!userId) {
      throw new UnauthorizedException();
    }
    return this.authService.findProfile(userId);
  }

  @Post('logout')
  signOut(@Res({ passthrough: true }) res: unknown) {
    this.adapterHost.httpAdapter.clearCookie(res, 'uid');
  }
}

```

> info **提示** 从 `@nestjs/common` 包导入 `@SignedCookies()` 装饰器。

当签名验证成功时，`@SignedCookies('uid')` 解析为原始未签名值。当 Cookie 缺失、未签名、被篡改或使用未配置的密钥签名时，它解析为 `undefined`。不带名称调用时，`@SignedCookies()` 返回一个只包含签名验证成功的 Cookie 的对象。像 `@Cookies()` 一样，它接受 Cookie 名称后的管道。

当未配置密钥时，签名会明确失败：使用 `signed` 选项的 `setCookie()` 会抛出错误，解析 `@SignedCookies()` 参数也会抛出错误（除非 `cookie-parser` 提供签名 Cookie，参见 [below](#using-cookie-parser-or-fastifycookie)），结果是返回一个 `500 Internal Server Error` 响应，而不是每个签名 Cookie 静默地读取为 `undefined`。

> warning **警告** 一个 `secret` 是 `undefined`，例如因为未设置环境变量，这等同于没有密钥。应用程序启动，错误仅在请求设置或读取签名 Cookie 时才出现。请在启动时验证您的配置，例如参见 [Configuration](/application/configuration#模式验证) 章。

> warning **警告** 签名保护的是 Cookie 的完整性，而不是其机密性：值以纯文本形式存储，客户端可以读取它。不要在签名 Cookie 中存储敏感数据。另请注意，与 `cookie-signature` 包一样，Cookie 名称不属于签名数据的一部分，因此为某个 Cookie 签名的值在客户端以另一个名称发送时也会验证成功。

##### 轮换密钥

要替换密钥而不使使用该密钥签名的 Cookie 失效，请传入一个密钥数组。Nest 使用第一个密钥为新 Cookie 签名，并使用所有密钥验证传入的 Cookie：

```typescript
// main.ts
const app = await NestFactory.create(AppModule, {
  cookies: {
    // Signs with the first secret, verifies with all of them.
    secret: ['current-secret', 'previous-secret'],
  },
});

```

要轮换，请将新密钥添加到数组的开头，并在所有使用旧密钥的 Cookie 过期后移除旧密钥。签名是进行恒定时间比较的，并且是针对每个密钥进行的，因此响应时间不会泄露匹配了哪个密钥。

##### 签名格式

Nest 使用 `cookie-signature` 包的格式签名 Cookie，`cookie-parser` 和 `express-session` 也使用此格式：以 `s:` 前缀开头，后跟值、一个点，以及值的 base64 编码的 HMAC-SHA256 摘要（不带填充）。因此：

- 使用 Express（`res.cookie()` 的 `signed` 选项）用相同密钥签名的 Cookie，在迁移到内置 API 后，`cookie-parser` 或 `express-session` 仍能验证，并且 `cookie-parser` 可以验证由 Nest 签名的 Cookie
- 由 `@fastify/cookie` 签名的值，省略了 `s:` 前缀，也能验证。反向不成立：`@fastify/cookie` 的 `unsignCookie()` 方法无法验证由 Nest 签名的 Cookie，因为存在 `s:` 前缀

#### 无效名称和属性

`setCookie()` 和 `clearCookie()` 会拒绝无效输入而不是转义它，因此 Cookie 名称或属性不能通过 `;`、CR 或 LF 字符注入额外的属性或头部。当发生以下情况时，它们会抛出 `TypeError`：

- 名称不是有效的 RFC 7230 token（例如，包含空格、`;`、`=` 或控制字符）
- `path` 包含 `;`，或包含非可打印 ASCII 字符
- `domain` 不是有效的主机名（允许前导点）
- `maxAge` 不是整数，或 `expires` 不是有效的 `Date`
- `sameSite` 或 `priority` 不是允许的值之一
- `sameSite` 是 `'none'`，或 `partitioned` 是 `true`，而 `secure` 不是 `true`。浏览器会静默丢弃此类 Cookie，因此 Nest 会报告错误
- 值不是字符串

值的内容绝不会被拒绝：由于它是百分号编码的，值中的 `;`、CR 或 LF 会变成 `%3B`、`%0D` 或 `%0A`。

这些错误不是 HTTP 异常，因此当它们从路由处理程序中抛出时，客户端会收到一个 `500 Internal Server Error` 响应。如果 Cookie 名称或属性来自用户输入，请在调用 `setCookie()` 之前验证它。

> info **提示** Nest 不强制执行 `__Host-` 和 `__Secure-` Cookie 名称前缀的规则。如果使用它们，请自行设置它们所需的属性：两者都设置 `secure: true`，以及 `path: '/'` 和不设置 `domain` 用于 `__Host-`。

#### 使用 cookie-parser 或 @fastify/cookie

在内置支持可用之前，读取 Cookie 需要 `cookie-parser` 中间件（Express）或 `@fastify/cookie` 插件（Fastify）。使用它们的应用程序仍可正常工作，并且内置装饰器与其协同工作：

- 当中间件或插件填充它时，`@Cookies()` 保持原样返回 `req.cookies`，否则只解析 `Cookie` 头部本身。因此，该包的行为得以保留。例如，当提供密钥时，`cookie-parser` 将签名 Cookie 从 `req.cookies` 移动到 `req.signedCookies`，并将以 `j:` 前缀的 JSON Cookie 转换为对象。
- 当设置 `cookies.secret` 应用程序选项时，`@SignedCookies()` 始终根据 Nest 密钥验证原始 `Cookie` 头部，并忽略 `req.signedCookies`。请配置与您的中间件相同的密钥（或密钥），以便它签名的 Cookie 持续验证。
- 没有 `cookies.secret` 选项时，`@SignedCookies()` 会回退到由 `cookie-parser` 填充的 `req.signedCookies` 对象（当提供密钥时），并将它标记为无效的 Cookie 视为缺失。`@fastify/cookie` 不会填充 `req.signedCookies`，因此在 Fastify 上，`@SignedCookies()` 需要 `cookies.secret` 选项。

Nest 本身绝不会分配 `req.cookies`。如果您移除了 `cookie-parser` 或 `@fastify/cookie`，请将读取 `request.cookies`（或调用 `reply.setCookie()`）的任何代码替换为内置装饰器和适配器方法。同样，如果您的应用程序使用 `createParamDecorator()` 定义了自己的 `@Cookies()` 装饰器，则可以用内置的替换它。当您用 `setCookie()` 替换 `res.cookie()` 调用时，请记住将 `maxAge` 从毫秒转换为秒。

##### Express (cookie-parser)

首先，安装 [cookie-parser](https://github.com/expressjs/cookie-parser) 包（以及 TypeScript 用户的类型）：

```shell
$ npm i cookie-parser
$ npm i -D @types/cookie-parser

```

安装完成后，全局应用 `cookie-parser` 中间件（例如，在您的 `main.ts` 文件中）：

```typescript
import cookieParser from 'cookie-parser';
// somewhere in your initialization file
app.use(cookieParser('my-secret'));

```

第一个参数是一个可选的 secret（或 secret 数组），用于验证签名 Cookie。该中间件解析 `Cookie` 头部，并将 Cookie 作为 `req.cookies` 暴露，如果提供了 secret，则将经过验证的签名 Cookie 作为 `req.signedCookies` 暴露（验证失败的签名 Cookie 的值为 `false`）。有关其他选项，请参阅 [cookie-parser repository](https://github.com/expressjs/cookie-parser)。

设置完成后，您可以使用 `@Cookies()` 和 `@SignedCookies()` 装饰器，或从请求对象读取 Cookie：

```typescript
@Get()
findAll(@Req() request: Request) {
  console.log(request.cookies); // or "request.cookies['cookieKey']"
  // or console.log(request.signedCookies);
}

```

要将 Cookie 附加到传出的响应中，请使用适配器的 `setCookie()` 方法或 `Response#cookie()` 方法：

```typescript
@Get()
findAll(@Res({ passthrough: true }) response: Response) {
  response.cookie('key', 'value');
}

```

> info **提示** 从 `@nestjs/common` 包导入 `@Req()` 和 `@Res()` 装饰器，从 `express` 包导入 `Request` 和 `Response`。

##### Fastify (@fastify/cookie)

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

设置完成后，您可以使用 `@Cookies()` 装饰器，或从请求对象读取 Cookie：

```typescript
@Get()
findAll(@Req() request: FastifyRequest) {
  console.log(request.cookies); // or "request.cookies['cookieKey']"
}

```

要将 Cookie 附加到传出的响应中，请使用适配器的 `setCookie()` 方法或 `FastifyReply#setCookie()` 方法（参见 [@fastify/cookie documentation on sending cookies](https://github.com/fastify/fastify-cookie#sending)）：

```typescript
@Get()
findAll(@Res({ passthrough: true }) response: FastifyReply) {
  response.setCookie('key', 'value');
}

```

> info **提示** 从 `@nestjs/common` 包导入 `@Req()` 和 `@Res()` 装饰器，从 `fastify` 包导入 `FastifyRequest` 和 `FastifyReply`。