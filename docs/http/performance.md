<!-- 此文件从 content/http/performance.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T01:00:27.801Z -->
<!-- 源文件: content/http/performance.md -->
<!-- 源哈希: e22105ff4543bd3a541cfa19e0302e5c -->

### HTTP 适配器

Nest 不直接与 HTTP 服务器通信。它通过一个**HTTP 适配器**进行通信，其主要工作是将中间件和处理器代理到适当的库特定实现。这使得 Nest 框架独立：您的**控制器**、**提供者**、**守卫**、**管道**和**过滤器**在以下每个适配器上都能保持不变运行，并且您可以从一个迁移到另一个。

| 适配器 | 包 | 基于 |
| :--- | :--- | :--- |
| `ExpressAdapter` | `@nestjs/platform-express` | [Express](https://expressjs.com/)（默认） |
| `FastifyAdapter` | `@nestjs/platform-fastify` | [Fastify](https://fastify.dev/) |
| `NodeAdapter` | `@nestjs/platform-node` | Node.js 的 [`node:http`](https://nodejs.org/api/http.html) 模块 |

> info **提示** 框架适配器只能为提供类似于 Express 的请求/响应管道处理的库实现。

#### 选择适配器

从 NestJS v12.3 开始，我们推荐使用 `NodeAdapter`。它是这三个中最快的（参见 [Performance](/techniques/performance#性能)），并且其**请求**和**响应**对象带有 Express 风格的辅助函数，因此大多数 Express 中间件以及为 Express 适配器编写的大部分代码可以保持不变地与之工作。当您不传递适配器时，Nest 仍然使用 Express，因此您需要选择启用，如 [Node adapter](/techniques/performance#node-adapter) 所示。在 NestJS v13 中，`NodeAdapter` 将成为默认选项。

选择 `FastifyAdapter` 以使用 Fastify 插件和功能，例如 [route constraints](/techniques/performance#路由约束)。如果您的应用程序依赖于 Node 适配器未实现的 Express API（参见 [Express compatibility](/techniques/performance#express-compatibility)）或仅支持 Express 的包，请继续使用 `ExpressAdapter`。

#### 性能

在我们的基准测试中（在 Node.js 24 上使用 100 个连接，对比一个纯粹的 `GET` 路由、一个带有参数的 `GET` 路由以及一个带有 JSON 主体的 `POST` 路由），Nest 在 `NodeAdapter` 上的每秒请求量比在 `ExpressAdapter` 上高出约 50%，比在 `FastifyAdapter` 上高出约 5%。要在您的机器上运行相同的基准测试，请遵循 [nestjs/nest#18063](https://github.com/nestjs/nest/pull/18063#reproducing-the-benchmark) 中的步骤。

请记住，适配器只处理每个**请求**的一小部分。查询数据库或调用其他服务的路由大部分时间都花在等待它们上，因此适配器的选择对于高请求速率下的轻量级路由最为重要。

要查看切换适配器对您自己的应用程序而非基准测试产生什么变化，请使用安装了 [NestJS Observe](https://www.observe.nestjs.com/?ref=docs-http-adapters 'NestJS Observe') 的独立发布进行部署。以相同的方式观察所有三个适配器上的记录**请求**，每个发布都会提供一个判决，比较了路由前后每条路由的延迟和错误率，这样既变快的轻量级路由和没有变化的重量级路由都会显示出来（参见 [Releases and their verdicts](/observability/dashboard#releases-and-their-verdicts)）。

#### Node 适配器

`NodeAdapter` 直接在 `node:http` 模块上运行 Nest，中间没有其他框架。首先，安装所需的包：

```bash
$ npm i --save @nestjs/platform-node

```

然后将 `NodeAdapter` 实例传递给 `NestFactory.create()`：

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { NestNodeApplication, NodeAdapter } from '@nestjs/platform-node';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestNodeApplication>(
    AppModule,
    new NodeAdapter(),
  );
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

`NestNodeApplication` 类型为您提供应用程序对象的平台特定方法：`useBodyParser()`、`useStaticAssets()`、`setViewEngine()`、`setBaseViewsDir()`、`setLocal()` 和 `inject()`。

在端到端测试中也应将 `NodeAdapter` 实例传递给 `createNestApplication()`。如果没有它，测试模块会创建一个 Express 应用程序，因此测试不是在您的应用程序使用的适配器上运行的，并且如果未安装 `@nestjs/platform-express` 包则会失败：

```typescript
app = moduleRef.createNestApplication<NestNodeApplication>(new NodeAdapter());

```

与 Fastify 适配器一样，`app.inject()` 向应用程序发送一个伪造的**请求**，使用 [light-my-request](https://github.com/fastify/light-my-request)，因此测试不需要一个监听服务器，只需要 `app.init()`：

```typescript
const result = await app.inject({ method: 'GET', url: '/cats' });
expect(result.statusCode).toEqual(200);

```

##### Express 兼容性

**请求**和**响应**是 `@nestjs/platform-node` 导出的 `NodeRequest` 和 `NodeResponse` 的实例。它们通过 Express 风格的属性和方法扩展了 Node 的 `IncomingMessage` 和 `ServerResponse`，这些属性和方法通常由中间件、**异常过滤器**和 `@Res()` 处理器依赖，例如 `req.get()`、`req.is()`、`req.route`、`req.ip`、`req.ips`、`req.hostname`、`res.status()`、`res.send()`、`res.json()`、`res.set()`、`res.type()`、`res.cookie()`、`res.redirect()`、`res.sendFile()` 和 `res.locals`。中间件在 Express 风格的堆栈中运行，并使用相同的 `(req, res, next)` 签名。

流行的 Express 中间件包，如 `helmet`、`compression`、`cookie-parser`、`express-session`、`express-rate-limit`、`csrf-csrf`、`morgan` 和 `passport`（以及 `@nestjs/passport` **守卫**），可以像在 Express 适配器中一样工作。当本文档的某个章节为 Express 和 Fastify 提供单独的说明时（例如 [Compression](/http/compression) 或 [Session](/http/session)），请遵循 Express 的说明。

Node 适配器在某些地方故意与 Express 不同：

- 路由是按特异性匹配的，与 Fastify 一样，而不是按注册顺序匹配。
- 路径对路由、中间件和 `exclude()` 都是区分大小写的匹配，与 Fastify 一样。
- 从路由处理器返回的字符串被发送为 `text/plain`，而不是 `text/html`。
- `req.path` 是路由器匹配的已解码路径，因此检查它的中间件会看到与路由相同的路径。
- 适配器不添加 `ETag` 头部，并且条件**请求**（`If-None-Match`、`If-Modified-Since`）会获得完整的**响应**，而不是像 Fastify 那样获得 `304 Not Modified`，即使处理器本身设置了 `ETag` 或 `Last-Modified`。`res.sendFile()` 和 `useStaticAssets()` 仍然发送 `ETag` 并以 `304` 回答。
- 超过 100 个字符的路由参数不匹配（参见 [Node adapter options](/techniques/performance#node-adapter-options)）。
- 带有 `__proto__` 或 `constructor.prototype` 键的 JSON 主体将被拒绝（参见 [Body parsers](/techniques/performance#body-parsers)）。

某些 Express API 不可用：`res.render()`（请使用 [`@Render()`](/http/mvc) **装饰器**代替）、`res.download()`、`res.format()`、`res.attachment()`、`res.contentType()`（请使用 `res.type()` 代替）、`res.jsonp()`、`res.links()`、`res.location()`（请使用 `res.set('Location', url)` 代替）、`res.vary()`、`req.accepts()` 及其变体、`req.fresh` 和 `req.stale`、`req.host`、`req.range()`、`req.subdomains`、`req.xhr`、使用 `app.use()` 挂载 Express 应用程序，以及适配器使用 [options](/techniques/performance#node-adapter-options) 而不是 Express 设置的 Express 设置（例如，对于 `trust proxy` 设置使用 `trustProxy`）。

##### Node 适配器选项

与 Fastify 一样，路由参数的长度限制为 100 个字符。如果请求的参数更长，它将落入另一个匹配的路由（例如通配符路由），否则会返回一个 `414 URI Too Long` 响应。要更改限制，请将 `maxParamLength` 选项传递给 `NodeAdapter` 构造函数：

```typescript
new NodeAdapter({ maxParamLength: 500 });

```

在反向代理或负载均衡器之后，连接来自代理，因此 `req.ip` 是代理的地址，当代理终止 TLS 时，`req.protocol` 是 `'http'`。要从受信任的代理设置的 `X-Forwarded-For`、`X-Forwarded-Proto` 和 `X-Forwarded-Host` 头部读取客户端的地址、协议和主机，请传递 `trustProxy` 选项。与 Fastify 一样，它接受 `true` 来信任每个代理，代理的地址或子网（例如 `'loopback'` 或 `'10.0.0.0/8'`，逗号分隔或数组形式），或者一个函数，该函数接收一个地址及其跳数并返回是否信任它：

```typescript
new NodeAdapter({ trustProxy: 'loopback' });

```

`req.ip`、`req.ips`、`req.protocol`、`req.secure` 和 `req.hostname` 的工作方式与 Express 相同，[sub-domain routing](/overview/controllers#sub-domain-routing) 也是如此。与 Express 设置不同，该选项不接受跳数：与 Fastify 一样，数字不信任任何代理，因为它无法区分代理和发送其自身 `X-Forwarded-For` 头的客户端。

> 警告 **警告** 只信任应用前面的代理。可以直接访问应用的客户端可以发送任何 `X-Forwarded-*` 头部。

默认情况下，查询字符串被解析为扁平键，与 Express 和 Fastify 一样：`?filter[where][name]=John` 会得到一个 `filter[where][name]` 键。要解析嵌套对象和数组，请像 Fastify 一样传递 `querystringParser` 选项。它使用查询字符串调用，不带前导 `?`（如果 URL 中没有则使用空字符串）：

```typescript
import qs from 'qs';

new NodeAdapter({ querystringParser: (str) => qs.parse(str) });

```

##### Body 解析器

Node 适配器自带了其自己的 `json`、`urlencoded`、`text` 和 `raw` body 解析器，因此它不依赖于 `body-parser` 包。它们接受与它们的 `body-parser` 对应项相同的选项，例如 `limit`、`inflate`、`strict` 和 `type`。与 Express 一样，Nest 默认注册 `json` 和 `urlencoded` 解析器，`rawBody` 选项和 `useBodyParser()` 方法的工作方式如 [Raw body](/faq/raw-body) 所述。

默认的 body 大小限制为 `100kb`，与 Express 一样，而 Fastify 适配器继承了 Fastify 的默认值 1 MiB。较大的 body 将返回 `413 Payload Too Large` 响应而被拒绝。要提高限制，请参阅 [Body parser size limit](/faq/raw-body#body-parser-size-limit)。

与 Fastify 一样，`json` 解析器会拒绝尝试注入原型属性的 body：带有 `__proto__` 或 `constructor.prototype` 键的 body 会返回 `400 Bad Request` 响应。要转而丢弃这些键，或保留它们（`body-parser` 行为），请将 `onProtoPoisoning` 和 `onConstructorPoisoning` 选项设置为 `'remove'` 或 `'ignore'`。`urlencoded` 解析器采用相同的选项。

```typescript
app.useBodyParser('json', { onProtoPoisoning: 'remove' });

```

##### 服务器超时

与 Express 一样，适配器保留 Node 的 `http.Server` 默认设置：空闲的 keep-alive 连接在 5 秒后（`keepAliveTimeout`）关闭，请求必须在 300 秒内完全到达（`requestTimeout`）。Fastify 将这些设置为 72 秒和无限制。在负载均衡器或反向代理之后，请将 keep `keepAliveTimeout` 设置得比代理的空闲超时时间更长，否则代理可能会重用服务器正在关闭的连接并返回 `502 Bad Gateway`。在调用 `listen()` 之前在服务器上设置超时：

```typescript
const server = app.getHttpServer();
server.keepAliveTimeout = 72_000;

```

##### 静态资源和视图

`useStaticAssets()` 使用 [serve-static](https://www.npmjs.com/package/serve-static) 包提供目录服务。它接受该包的选项，外加一个 `prefix`，与 Express 一样。`setViewEngine()` 接受引擎名称（与 Express 一样，参见 [Model-View-Controller](/http/mvc)）或 `@fastify/view` 的选项对象，其中包含引擎和 `templates` 目录。

##### 其他包

- **文件上传：** 导入 `FileInterceptor()`、其他上传拦截器和来自 `@nestjs/platform-node` 的 `MulterModule`，而不是 `@nestjs/platform-express`。它们是相同的基于 Multer 的拦截器，因此 [File upload](/techniques/file-upload) 章的其余部分保持不变。
- **提供单页应用程序：** `@nestjs/serve-static` 包（v12.1.1 或更高版本）通过适配器提供文件，因此不需要 `express` 包。其客户端路径的后备路由需要 `@nestjs/platform-node` v12.3.1 或更高版本。
- **GraphQL：** 使用 `@nestjs/apollo` 驱动（v14.1.1 或更高版本），与 Express 一样。`@nestjs/mercurius` 驱动需要 Fastify 适配器。

#### Fastify 适配器

[Fastify](https://github.com/fastify/fastify) 是 Nest 的一个良好替代框架，因为它以与 Express 类似的方式解决了设计问题。它自带一套插件生态系统。要使用 Fastify，请选择内置的 `FastifyAdapter`，如下所示。

##### 安装

首先，安装所需的包：

```bash
$ npm i --save @nestjs/platform-fastify

```

##### 适配器

安装 Fastify 平台后，您可以使用 `FastifyAdapter`。

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter()
  );
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

默认情况下，Fastify 仅监听 `localhost` 接口（参见 [Fastify getting started guide](https://fastify.dev/docs/latest/Guides/Getting-Started/#your-first-server)）。要接受其他主机的连接，请在 `listen()` 调用中指定 `'0.0.0.0'`：

```typescript
async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  await app.listen(3000, '0.0.0.0');
}

```

##### 特定于平台的包

当您使用 `FastifyAdapter` 时，Nest 将 Fastify 用作 **HTTP 提供者**。这意味着依赖于 Express 的配方可能无法工作。请改用 Fastify 等效的包。

##### 重定向响应

Fastify 处理重定向响应的方式与 Express 略有不同。要使用 Fastify 进行重定向，请使用 `status()` 设置状态码，然后使用 URL 调用 `redirect()`：

```typescript
@Get()
index(@Res() res) {
  res.status(302).redirect('/login');
}

```

##### Fastify 选项

您可以通过 `FastifyAdapter` 构造函数向 Fastify 实例传递选项。例如：

```typescript
new FastifyAdapter({ logger: true });

```

##### 中间件

中间件函数接收原始的 `req` 和 `res` 对象，而不是 Fastify 的包装器。这是 Nest 在底层使用的 `@fastify/middie` 包的工作方式。有关更多信息，请参阅 [Fastify middleware documentation](https://fastify.dev/docs/latest/Reference/Middleware/)。

```typescript title="logger.middleware.ts"
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: FastifyRequest['raw'], res: FastifyReply['raw'], next: () => void) {
    console.log('Request...');
    next();
  }
}

```

这与 Express 有几点不同，在移植中间件时很重要：

- 原始的 `res` 没有诸如 `res.status()` 或 `res.json()` 的 Express 辅助函数，因此调用它们会抛出 `TypeError`，请求会以 `500` 响应失败。要拒绝请求，请抛出异常（例如 `throw new UnauthorizedException()`），然后 [exceptions layer](/overview/exception-filters) 会将其转换为匹配的响应。
- 中间件在 Fastify 解析请求体之前运行，原始的 `req` 不包含路由参数，因此 `req.body` 和 `req.params` 是其中的 `undefined`。依赖于它们的检查，例如验证签名体，应放在 [guard](/overview/guards) 中，该 [guard](/overview/guards) 在两者都可用之后运行。

> info **提示** 守卫、拦截器和异常过滤器从 `switchToHttp()` 获取 Fastify 的 `FastifyRequest` 和 `FastifyReply` 包装器，而不是中间件接收的原始对象。请在其中使用 `reply.status()` 和 `reply.send()`，或者使用 `reply.raw` 获取底层的 Node.js 响应。

##### 路由配置

使用 `@RouteConfig()` 装饰器应用 Fastify 的 [route config](https://fastify.dev/docs/latest/Reference/Routes/#config) 功能。

```typescript
@RouteConfig({ output: 'hello world' })
@Get()
index(@Req() req) {
  return req.routeConfig.output;
}

```

##### 路由约束

使用 `@RouteConstraints()` 装饰器应用 Fastify 的 [route constraints](https://fastify.dev/docs/latest/Reference/Routes/#constraints) 功能。

```typescript
@RouteConstraints({ version: '1.2.x' })
newFeature() {
  return 'This works only for version >= 1.2.x';
}

```

> info **提示** `@RouteConfig()` 和 `@RouteConstraints()` 从 `@nestjs/platform-fastify` 导入。

##### 示例

可用的工作示例在 [nestjs/nest repository](https://github.com/nestjs/nest/tree/master/sample/10-fastify) 中。

#### Express 适配器

[Express](https://expressjs.com/) 被广泛使用、众所周知，并且具有庞大的兼容中间件集。当您不向 `NestFactory.create()` 传递适配器时，Nest 使用 `@nestjs/platform-express` 包中的 `ExpressAdapter`，因此无需设置。要访问应用程序对象的 Express 特定方法，请传递 `NestExpressApplication` 类型：

```typescript
const app = await NestFactory.create<NestExpressApplication>(AppModule);

```

为了在 `NodeAdapter` 成为默认设置后仍保持应用程序在 Express 上运行，请明确传递一个 `ExpressAdapter` 实例：

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import {
  ExpressAdapter,
  NestExpressApplication,
} from '@nestjs/platform-express';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(),
  );
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```