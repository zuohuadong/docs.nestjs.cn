<!-- 此文件从 content/techniques/performance.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T09:02:57.572Z -->
<!-- 源文件: content/techniques/performance.md -->
<!-- 源哈希: 95169cad6aa1de044f83a85c2b8a9ee9 -->

### 性能（Fastify）

默认情况下，Nest 使用 [Express](https://expressjs.com/) 框架。如前所述，Nest 还提供了与其他库（如 [Fastify](https://github.com/fastify/fastify)）的兼容性。Nest 通过实现一个框架适配器来实现这种框架无关性，该适配器的主要功能是将中间件和处理程序代理到相应的库特定实现中。

> info **提示** 请注意，要实现框架适配器，目标库必须提供与 Express 中类似的请求/响应管道处理。

[Fastify](https://github.com/fastify/fastify) 为 Nest 提供了一个很好的替代框架，因为它以与 Express 类似的方式解决了设计问题。然而，Fastify 比 Express **快得多**，基准测试结果几乎翻倍。那么一个合理的问题是，为什么 Nest 使用 Express 作为默认的 HTTP 提供者。原因是 Express 被广泛使用、广为人知，并且拥有大量兼容的中间件，这些中间件开箱即用，可供 Nest 用户使用。

但由于 Nest 提供了框架无关性，您可以轻松地在两者之间迁移。当原始速度是优先考虑的因素时，Fastify 可能是更好的选择。要使用 Fastify，只需选择本章中介绍的内置 `FastifyAdapter` 即可。

#### 安装

首先，我们需要安装所需的包：

```bash
$ npm i --save @nestjs/platform-fastify

```

#### 适配器

安装 Fastify 平台后，我们可以使用 `FastifyAdapter`。

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

默认情况下，Fastify 仅监听 `localhost 127.0.0.1` 接口（[read more](https://fastify.dev/docs/latest/Guides/Getting-Started/#your-first-server)）。如果您想接受其他主机上的连接，应在 `listen()` 调用中指定 `'0.0.0.0'`：

```typescript
async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  await app.listen(3000, '0.0.0.0');
}

```

#### 平台特定包

请记住，当您使用 `FastifyAdapter` 时，Nest 使用 Fastify 作为 **HTTP 提供者**。这意味着每个依赖 Express 的配方可能不再有效。您应该改用与 Fastify 等效的包。

#### 重定向响应

Fastify 处理重定向响应的方式与 Express 略有不同。要使用 Fastify 进行正确的重定向，请同时返回状态码和 URL，如下所示：

```typescript
@Get()
index(@Res() res) {
  res.status(302).redirect('/login');
}

```

#### Fastify 选项

您可以通过 `FastifyAdapter` 构造函数将选项传递给 Fastify 构造函数。例如：

```typescript
new FastifyAdapter({ logger: true });

```

#### 中间件

中间件函数获取原始的 `req` 和 `res` 对象，而不是 Fastify 的包装器。这正是 Fastify 底层使用的 `middie` 包的工作方式 - 请查看此 [page](https://fastify.dev/docs/latest/Reference/Middleware/) 以获取更多信息。

```typescript title="logger.middleware.ts"
import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: FastifyRequest['raw'], res: FastifyReply['raw'], next: () => void) {
    console.log('Request...');
    next();
  }
}

```

#### 路由配置

您可以将 Fastify 的 [route config](https://fastify.dev/docs/latest/Reference/Routes/#config) 功能与 `@RouteConfig()` 装饰器一起使用。

```typescript
@RouteConfig({ output: 'hello world' })
@Get()
index(@Req() req) {
  return req.routeConfig.output;
}

```

#### 路由约束

自 v10.3.0 起，`@nestjs/platform-fastify` 支持 Fastify 的 [route constraints](https://fastify.dev/docs/latest/Reference/Routes/#constraints) 功能，可与 `@RouteConstraints` 装饰器一起使用。

```typescript
@RouteConstraints({ version: '1.2.x' })
newFeature() {
  return 'This works only for version >= 1.2.x';
}

```

> info **提示** `@RouteConfig()` 和 `@RouteConstraints` 从 `@nestjs/platform-fastify` 导入。

#### 示例

可用的工作示例位于 [here](https://github.com/nestjs/nest/tree/master/sample/10-fastify)。