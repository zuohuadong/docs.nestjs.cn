<!-- 此文件从 content/migrating/fastify.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:34:47.266Z -->
<!-- 源文件: content/migrating/fastify.md -->
<!-- 源哈希: ecf515ad89eb09b89ffee5982adda754 -->

### 从 Fastify 迁移

Fastify 应用程序可以迁移到 Nest 并继续使用 Fastify：您的插件保持工作，路由可以一次一个地迁移或一次性全部迁移。

Nest 通过 `FastifyAdapter` 在 Fastify 上运行，因此这不是服务器的更换。路由器、插件、JSON 模式和序列化保持不变，包括路径匹配方式、查询字符串解析方式以及允许的最大请求体大小。您添加的是围绕这些组件的结构：模块、依赖注入，以及在逐个路由注册时替代钩子的守卫和管道。

#### 选择一种方法

| 问题 | 一次一个路由 | 一次性全部 |
| --- | --- | --- |
| 工作原理？ | Nest 在您的 Fastify 实例上运行，路由逐个迁移到它 | 一个新的 Nest 应用程序在一个发布中替换 Fastify 应用 |
| 部署什么？ | 每个已迁移的路由，单独部署 | 一切，一次性部署 |
| 功能工作如何？ | 继续进行，新端点进入 Nest | 等待，或直到切换前被写两次 |
| 如何回滚？ | 恢复一个路由 | 部署上一个 Fastify 发布版本 |
| 使用哪个 Fastify 版本？ | Fastify 5，所以先升级 | 任意，因为 Fastify 应用未被修改 |
| 现有插件如何？ | 继续运行，也适用于 Nest 的路由 | 在 Nest 应用程序上重新注册它们 |
| 代码中两种风格存在多久？ | 直到最后一个路由迁移 | 从不 |

当应用程序较大、多人协作或无法等待时，请一次一个路由地迁移。当应用足够小可以作为一个变更进行审查，并且您可以使用测试来确定其行为时，请一次性全部迁移。这也适用于 [coding agent](/migrating/fastify#give-it-to-a-coding-agent)。

#### 一次一个路由

Fastify 应用保留其路由、插件和错误处理程序，新的端点在 Nest 中编写，现有端点在您下次修改时迁移过去。两者都在同一端口上响应，因此客户端不会察觉，每一步都可以单独部署。

##### 要求

- **Fastify 5。** Nest 的 `FastifyAdapter` 会注册需要它的插件，因此 Fastify 4 实例在 Nest 启动时就会失败。请先升级应用。
- **TypeScript。** 本页上的 Nest 代码是 TypeScript。如果 Fastify 应用是用 JavaScript 编写的，则其文件可以保持不变：TypeScript 的 `allowJs` 选项会将其与其余代码一起编译。

将 Nest 安装在 Fastify 旁边：

```bash
$ npm i --save @nestjs/core @nestjs/common @nestjs/platform-fastify reflect-metadata rxjs

```

##### 在 Fastify 应用上运行 Nest

Nest 通常会创建自己的 Fastify 实例。请提供您自己的实例。停止应用监听，并让一个函数返回该实例。Nest 会设置实例自身的错误和未找到处理程序，因此需要更改两件事：

- 将 `setErrorHandler()` 移动到一个包含您路由的插件中。它会继续处理这些路由的错误，Fastify 不会警告被覆盖。
- 移除 `setNotFoundHandler()`。Nest 不允许使用 `Not found handler already set` 启动，并且它会自行响应未知路由。

```typescript title="legacy/app.ts"
export async function buildLegacyApp() {
  const app = Fastify();
  await app.register(helmet);
  await app.register(auth); // decorates the instance and the request
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.headers['x-request-id'] ?? 'generated');
  });
  await app.register(async (legacy) => {
    legacy.setErrorHandler(errorHandler);
    await legacy.register(ordersRoutes, { prefix: '/api/orders' });
    await legacy.register(miscRoutes, { prefix: '/api' });
  });
  // await app.listen({ port: 3000 }); <- Nest listens from now on
  return app;
}

```

然后将其传递给 `FastifyAdapter`，让 Nest 开始监听：

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { buildLegacyApp } from './legacy/app.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(await buildLegacyApp()),
  );
  await app.listen(process.env.PORT ?? 3000);
}

await bootstrap();

```

现在两者都从一个 Fastify 实例提供请求：

- Fastify 路由按先前的方式响应，其错误会到达其自身的错误处理程序。
- 注册在根实例上的插件和钩子也适用于 Nest 的路由，因此 `helmet` 和上面的 `onRequest` 钩子会为其运行，并且 `request.jwtVerify()` 在 Nest 守卫内部工作。
- 封装插件内部注册的钩子保持在内部，就像一直以来一样，因此它们不会为 Nest 的路由运行。
- Nest 路由中的错误会通过其 [exception filters](/overview/exception-filters) 处理，对于既没有的路由请求，会得到 Nest 的 `404` 响应。

##### 迁移一个路由

在 Nest 中编写路由，并在同一变更中将其从 Fastify 中删除。Fastify 的路由器拒绝重复项，因此如果两者都在代码中，应用会在启动时因 `Method 'GET' already declared for route` 而停止。您已使用的插件可以支持 [guard](/overview/guards)，并且 `@RouteSchema()` 会采用该路由已有的 JSON 模式：

```typescript title="authenticated.guard.ts"
@Injectable()
export class AuthenticatedGuard implements CanActivate {
  constructor(private readonly users: UsersRepository) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    try {
      const { sub } = await request.jwtVerify();
      request.user = await this.users.find(sub);
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}

```

```typescript title="me.controller.ts"
@Controller('api')
export class MeController {
  @Get('me')
  @UseGuards(AuthenticatedGuard)
  @RouteSchema({
    response: {
      200: {
        type: 'object',
        properties: { id: { type: 'string' }, email: { type: 'string' } },
      },
    },
  })
  me(@Req() request: { user: User }) {
    return request.user;
  }
}

```

在进行过程中阅读 [Keep what would change without an error](/migrating/fastify#keep-what-would-change-without-an-error)。它适用于每个迁移的路由，上面的响应模式正是因为它存在的。

##### 完成迁移

当 Fastify 路由消失后，使用 `app.register()` 在 Nest 应用程序上注册插件，将错误处理程序转换为 [exception filter](/overview/exception-filters)，删除 `legacy` 文件夹，并使用 `new FastifyAdapter()` 创建应用程序。

#### 一次性全部

一个新的 Nest 应用程序在一个发布中替换 Fastify 应用。在此之前，Fastify 应用保持不变，它是新应用程序必须遵循的参考。请坚持使用 `FastifyAdapter` 进行迁移，即使您计划稍后更改适配器：这保持了路由器、查询解析、请求体限制和路径语法的不变，因此一次性需要更改的更少。

##### 使用测试锁定 API

编写只知道 URL 的测试，这样相同的测试就可以针对两个应用程序运行。遍历每个插件和路由，覆盖每个路由的状态码、主体和重要标头，包括失败和成功情况。检查响应模式中移除的字段是否确实被移除：

```typescript
import assert from 'node:assert/strict';
import { test } from 'node:test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

test('the response schema hides internal fields', async () => {
  const res = await fetch(`${BASE}/api/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.deepEqual(await res.json(), { id: 'u2', email: 'bob@example.com' });
});

test('authentication comes before validation', async () => {
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ total: -1 }),
  });
  assert.equal(res.status, 401);
});

```

在编写任何 Nest 代码之前，先针对 Fastify 应用运行这些测试，直到它们全部通过：

```bash
$ BASE_URL=http://localhost:3000 node --test test/contract.test.mjs

```

##### 翻译应用程序

使用 `nest new` 在 Fastify 旁创建 Nest 应用程序，使用 [switch it to the `FastifyAdapter`](/techniques/performance#fastify-adapter)，并将每个路由插件移动到一个控制器中：

| Fastify | Nest |
| --- | --- |
| `app.register(routes, { prefix })` | 一个 [controller](/overview/controllers)，`@Controller('api/orders')`，位于一个 [module](/modules) 中 |
| `app.get('/:id', handler)` | 方法上的 `@Get(':id')` |
| `request.params`, `request.query`, `request.body` | `@Param()`, `@Query()`, `@Body()` |
| `schema: { querystring, body, response }` | 来自 `@nestjs/platform-fastify` 的 `@RouteSchema()`，使用相同的 JSON 模式 |
| `onRequest: app.authenticate` | 一个 [guard](/overview/guards) |
| `preHandler: app.requireRole('admin')` | 路由上的元数据，由守卫读取 |
| 像 `request.jwtVerify()` 这样的装饰器 | 在 `@Req()` 上执行相同的调用，并注册插件 |
| `reply.code(201).send(x)` | `return x`，当状态不是默认值时使用 `@HttpCode()` |
| `reply.code(204).send()` | `@HttpCode(204)`，并且不返回任何内容 |
| `reply.redirect(url, 301)` | `@Redirect(url, 301)` |
| `reply.setCookie()` | `@Res({ passthrough: true }) reply`，然后像往常一样执行 `reply.setCookie()` 和 `return` |
| `reply.type('application/json')` | `@Header('content-type', 'application/json')` |
| `reply.send(stream)` | `new StreamableFile(stream, { type })` |
| `await request.file()` | 在 `@Req()` 上执行相同的调用，并注册 `@fastify/multipart` |
| `app.register(plugin, options)` | `app.register(plugin, options)` |
| `app.addHook('onRequest', fn)` | `app.getHttpAdapter().getInstance().addHook('onRequest', fn)` |
| `setErrorHandler()` 和 `setNotFoundHandler()` | 一个全局 [exception filter](/overview/exception-filters) |
| 一个用数据库连接池装饰实例的插件 | 一个 [provider](/fundamentals/dependency-injection#value-providers-usevalue) |

路由路径保持不变，因为相同的路由器读取它们：`search/:term?`, `items/:id(^\\d+$)` 和 `assets/*`，使用 `@Param('*')`。

##### 保持不报错的更改

其中两个在没有任何错误的情况下暴露数据，所以请先检查它们：

| 在 Fastify 中 | 在 Nest 应用程序中 | 保持旧行为 |
| --- | --- | --- |
| 响应模式会移除所有未列出的字段，因此处理程序可以返回完整的记录 | 没有模式时，会发送所有字段，包括 `passwordHash` | 对每个有模式的路由执行 `@RouteSchema({ response })` |
| 一个 `POST` 回答 `200`，并且 `response: { 200: schema }` 生效 | 一个 `POST` 回答 `201`，因此基于 `200` 的模式不再适用，字段也会返回 | 执行 `@HttpCode(200)`，或者将模式键入 `201` |
| `onRequest` 中的认证在验证之前运行，因此没有令牌的无效请求会得到一个 `401` | `@RouteSchema({ body })` 在任何守卫之前验证，因此该请求会得到验证错误 | 使用 [pipe](/techniques/validation#基于模式的验证)、`@Body({ schema })` 进行验证，它在守卫之后运行，在需要的地方进行 |
| 错误具有处理程序给出的形状 | `{ statusCode, message, error }` | 一个全局异常过滤器 |
| 验证错误以 `err.validation` 的形式到达您的处理程序 | 它以相同的方式到达过滤器，带有 `exception.validation` | 相同的过滤器 |
| 未知路由会得到您的未找到处理程序 | `NotFoundException`，带有 Nest 的 body | 相同的过滤器 |

对于所有错误，包括 Nest 和 Fastify 本身抛出的错误，过滤器必须保持您的错误形状。诸如格式错误的 JSON 和超出限制的 body 等 body 错误会作为 `HttpException` 到达：

```typescript title="common/api-exception.filter.ts"
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const send = (status: number, code: string, message: string) =>
      reply.code(status).send({ error: { code, message } });

    if (exception instanceof ApiError) {
      return send(exception.status, exception.code, exception.message);
    }
    if (exception instanceof NotFoundException) {
      return send(404, 'NOT_FOUND', `No route for ${request.method} ${request.url}`);
    }
    if (exception?.validation) {
      return send(422, 'INVALID_INPUT', exception.message);
    }
    const status =
      exception instanceof HttpException ? exception.getStatus() : exception?.statusCode;
    if (status === 400) {
      return send(400, 'BAD_REQUEST', 'Malformed request');
    }
    if (status && status < 500) {
      return send(status, exception.code ?? 'ERROR', exception.message);
    }
    return send(500, 'INTERNAL', 'Something went wrong');
  }
}

```

```typescript title="main.ts"
async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  await app.register(helmet);
  await app.register(cors, { origin: 'https://shop.example.com', credentials: true });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 1024 * 1024 } });
  await app.register(fastifyStatic, {
    root: join(import.meta.dirname, '..', 'public'),
    prefix: '/static/',
  });
  await app.register(jwt, { secret: process.env.JWT_SECRET });
  app.getHttpAdapter().getInstance().addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('x-request-id', request.headers['x-request-id'] ?? 'generated');
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(process.env.PORT ?? 3000);
}

await bootstrap();

```

##### 切换过去

针对 Nest 应用程序运行相同的测试，并修复应用程序而不是测试：

```bash
$ BASE_URL=http://localhost:3001 node --test test/contract.test.mjs

```

当它们通过后，将其部署替换 Fastify 应用，并在新应用提供真实流量之前保留上一个 Fastify 版本的可部署性。

#### 提供给编码代理

这两种方法都可以与编码代理一起工作，当应用程序足够小可以在一次更改中审查时，一次性完成是更好的选择。将代理指向此页面并将其与测试绑定，这样它就不能对仅仅编译的代码宣布成功：

```bash
Migrate this Fastify application to NestJS all at once, on the FastifyAdapter,
following /migrating/fastify.md.

1. Before changing anything, write black-box HTTP tests that cover every
   route: status codes, bodies and important headers, failures included.
   Assert that fields a response schema removes stay removed.
   Run them against the Fastify app until they all pass.
2. Build the Nest application next to it, using the page's translation table.
3. Check every row of "Keep what would change without an error".
4. Run the same tests against the Nest application. Don't edit a test to
   make it pass. If behavior has to change, stop and tell me.

```