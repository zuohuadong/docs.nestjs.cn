<!-- 此文件从 content/migrating/express.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:34:20.087Z -->
<!-- 源文件: content/migrating/express.md -->
<!-- 源哈希: 4a23d1b8948520f6362dc1d23cdd1967 -->

### 从 Express 迁移

Express 应用程序可以一次迁移一个路由到 Nest，两者都提供请求服务，或者在一个发布中一次性迁移所有路由。本页面涵盖了这两种方式。

#### 选择一种方法

| 问题 | 一次一个路由 | 一次性全部迁移 |
| --- | --- | --- |
| 工作原理？ | Nest 运行在您的 Express 应用上，路由逐个迁移到 Nest | 一个新的 Nest 应用程序在一个发布中替换 Express 应用 |
| 部署什么？ | 每个迁移的路由，单独部署 | 一切，一次性部署 |
| 功能工作如何？ | 继续进行，新端点进入 Nest | 等待，或直到切换前被写两次 |
| 如何回滚？ | 恢复一个路由 | 部署上一个 Express 发布版本 |
| 使用哪个 Express 版本？ | Express 5，因此需要先升级 | 任意版本，因为不修改 Express 应用 |
| 现有中间件如何？ | 继续运行，也服务于 Nest 的路由 | 与其他所有内容一起迁移到 Nest |
| 代码中同时存在两种风格多久？ | 直到最后一个路由迁移完成 | 从不 |

当应用程序较大、多人协作或无法等待时，请一次迁移一个路由。当应用足够小，可以作为一个变更进行审查，并且您可以使用测试来确定其行为时，请一次性全部迁移。这也适用于 [coding agent](/migrating/express#give-it-to-a-coding-agent)，它可以一次性翻译整个应用程序，但无法自行判断哪些内容必须保持不变。

#### 一次一个路由

Express 应用保留其路由、中间件和错误处理器，新的端点在 Nest 中编写，现有端点在您下次修改时迁移过去。两者都在同一个端口上响应，位于相同的中间件之后，因此客户端、会话和认证不会察觉到变化，每一步都可以单独部署。

##### 要求

- **Express 5。** Nest 的 Express 适配器驱动 Express 5 应用程序，而 Express 4 的应用程序在 Nest 启动时就会失败。请先使用 Express 的 [migration guide](https://expressjs.com/en/guide/migrating-5.html) 及其代码转换工具 `npx @expressjs/codemod upgrade` 升级应用。
- **TypeScript。** 本页上的 Nest 代码是 TypeScript。如果 Express 应用是用 JavaScript 编写的，其文件可以保持不变：TypeScript 的 `allowJs` 选项会将其与其余代码一起编译。

CommonJS 应用可以保持 CommonJS。Nest 的包是 ESM，CommonJS 应用程序在 [migration guide](/migration-guide#esm-packages) 中列出的 Node.js 版本上加载它们。

将 Nest 安装在 Express 旁边：

```bash
$ npm i --save @nestjs/core @nestjs/common @nestjs/platform-express reflect-metadata rxjs

```

##### 在 Express 应用上运行 Nest

Nest 通常会创建自己的 Express 应用。请使用您自己的应用。停止 Express 应用监听，并导出构建它的函数，以便测试可以构建自己的实例：

```typescript title="legacy/app.ts"
import express from 'express';
import { authenticate } from './auth.js';
import { errorHandler } from './errors.js';
import { ordersRouter } from './orders.router.js';

export function createLegacyApp() {
  const app = express();
  app.use(express.json());
  app.use(authenticate); // sets req.user
  app.use('/orders', ordersRouter);
  app.use(errorHandler);
  // app.listen(3000); <- Nest listens from now on
  return app;
}

```

然后将其传递给 `ExpressAdapter`，让 Nest 开始监听：

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { createLegacyApp } from './legacy/app.js';

async function bootstrap() {
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(createLegacyApp()),
  );
  await app.listen(process.env.PORT ?? 3000);
}

await bootstrap();

```

Express 按添加的顺序运行其中间件和路由。Express 应用添加的所有内容都最先执行。Nest 在应用程序启动时，在 `listen()` 或 `init()` 中添加其路由，然后添加一个处理未匹配任何路由请求的处理器，该处理器使用 `404`。因此：

- Express 路由按之前的方式响应。
- Nest 的路由响应 Express 路由未响应的请求。
- Nest 的路由可以看到 Express 中间件设置到请求上的内容，例如 `req.user`，以及其解析器读取的请求体。
- 对于任何两个路由都没有匹配的请求，将得到 Nest 的 `404` 响应。

> 警告 **警告** 请从 Express 应用中移除捕获所有 `404` 处理器，例如 `app.use((req, res) => res.status(404).send())`。它在 Nest 路由之前执行，因此也会响应它们的请求，而 Nest 的处理器会代替它响应未知路由。请保留错误处理器：Express 错误处理器只接收在其之前添加的中间件和路由的错误，因此它会继续处理 Express 路由的错误，而 Nest 的 [exception filters](/overview/exception-filters) 会处理 Nest 的错误。

应用程序的哪个部分为哪些路由运行：

| 部分 | Express 路由 | Nest 路由 |
| --- | --- | --- |
| 添加到 Express 应用的中间件（请求体解析器、会话、认证） | 是 | 是 |
| Express 应用的错误处理器 | 是 | 否 |
| 通过 Nest 添加的中间件：[`MiddlewareConsumer`](/overview/middlewares)、`app.use()`、`app.enableCors()` | 否 | 是 |
| [Guards](/overview/guards)、[interceptors](/overview/interceptors)、[pipes](/pipes) 和 [exception filters](/overview/exception-filters) | 否 | 是 |

Express 应用已运行的中间件也位于 Nest 路由之前，因此 [guard](/overview/guards) 可以检查现有认证中间件设置到请求上的用户：

```typescript title="authenticated.guard.ts"
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class AuthenticatedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    return Boolean(request.user);
  }
}

```

> 信息 **提示** 使用 [global prefix](/faq/global-prefix)，Nest 的 `404` 处理器仅响应前缀下的路径。在该前缀之外且没有 Express 路由匹配的路径将得到 Express 的默认 `404` 页面。

##### 迁移一个路由

在 Nest 中编写新端点。要迁移现有端点，请将其编写为 Nest 路由，并将其从 Express 路由器中删除。由于 Express 路由优先，具有相同方法和路径的 Nest 路由在 Express 路由消失之前不会响应，因此在准备切换之前两者都可以存在于代码中：

```typescript title="orders/orders.controller.ts"
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthenticatedGuard } from '../authenticated.guard.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
@UseGuards(AuthenticatedGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }
}

```

```typescript title="legacy/orders.router.ts"
import express from 'express';
import { getOrder, listOrders } from './orders.handlers.js';

export const ordersRouter = express.Router();

ordersRouter.get('/', listOrders);
// ordersRouter.get('/:id', getOrder); <- deleted: Nest answers GET /orders/:id

```

`GET /orders` 仍然由 Express 响应，而 `GET /orders/:id` 会穿过 Express 路由器到达 Nest。

当测试应用程序也基于 Express 应用构建时，[End-to-end tests](/fundamentals/testing#端到端测试) 涵盖了这两种类型的路由。将适配器传递给 `createNestApplication()`，相同的测试可以在路由迁移之前和之后进行：

```typescript title="test/orders.e2e-spec.ts"
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ExpressAdapter } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { createLegacyApp } from '../src/legacy/app.js';

describe('Orders', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication(new ExpressAdapter(createLegacyApp()));
    await app.init();
  });

  it('lists orders (Express)', () => {
    return request(app.getHttpServer()).get('/orders').expect(200);
  });

  it('returns one order (Nest)', () => {
    return request(app.getHttpServer())
      .get('/orders/ord_1001')
      .set('Authorization', 'Bearer test-token')
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });
});

```

##### 在两者之间共享代码

Express 应用已经包含 Nest 代码所需的对象，例如数据库连接池、仓储或邮件发送器。将它们注册为 [value providers](/fundamentals/dependency-injection#value-providers-usevalue)，这样 Nest 就可以注入 Express 代码使用的相同实例：

```typescript title="legacy/legacy.module.ts"
import { Global, Module } from '@nestjs/common';
import { OrdersRepository, ordersRepository } from './orders.repository.js';

@Global()
@Module({
  providers: [{ provide: OrdersRepository, useValue: ordersRepository }],
  exports: [OrdersRepository],
})
export class LegacyModule {}

```

在 `AppModule` 中导入 `LegacyModule` 一次，任何提供者都可以通过其类注入 `OrdersRepository`。

反向操作也是如此。一旦 `NestFactory.create()` 返回，`app.get()` 会返回任何提供者，因此保留在 Express 中的路由可以调用已迁移到 Nest 服务中的逻辑。在 `listen()` 之前添加该路由，它将位于 Express 应用其余部分之前，在 Nest 路由之前：

```typescript title="main.ts"
const legacyApp = createLegacyApp();
const app = await NestFactory.create(AppModule, new ExpressAdapter(legacyApp));
legacyApp.use('/reports', reportsRouter(app.get(ReportsService)));
await app.listen(process.env.PORT ?? 3000);

```

##### 完成迁移

当 Express 路由为空时，将 Express 应用中剩余的部分迁移到 Nest：将中间件迁移到 [Nest middleware](/overview/middlewares) 或 `app.use()`，将错误处理器迁移到 [exception filter](/overview/exception-filters)。然后删除 `legacy` 文件夹，并创建一个不带适配器参数的应用程序：

```typescript
const app = await NestFactory.create(AppModule);

```

#### 一次性完成

一个新的 Nest 应用程序在一个发布中取代 Express 应用。在此之前，Express 应用保持原样，无论它运行在哪个版本的 Express 上，它作为新应用程序必须遵循的参考。

大部分风险不在于翻译，因为错误的翻译通常会明确报错。风险在于那些没有报错但发生了变化的地方：状态码、错误响应的形状、查询字符串的解析方式。因此，迁移应从能检测到这些变化的测试开始。

##### 使用测试固定 API

编写只知道 URL 的测试，这样相同的测试就可以针对两个应用程序运行。遍历每个路由和 `app.use()` 调用，覆盖每个路由的状态码、正文和重要头部，包括失败和成功情况：

```typescript
import assert from 'node:assert/strict';
import { test } from 'node:test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

test('creating an order answers 200', async () => {
  const res = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ total: 10 }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, 'pending');
});

test('errors keep their shape', async () => {
  const res = await fetch(`${BASE}/api/orders/nope`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), {
    error: { code: 'ORDER_NOT_FOUND', message: 'Order nope not found' },
  });
});

```

在编写任何 Nest 代码之前，先针对 Express 应用运行这些测试，直到它们全部通过：

```bash
$ BASE_URL=http://localhost:3000 node --test test/contract.test.mjs

```

##### 翻译应用程序

在 Express 应用旁边创建 Nest 应用程序，并将每个路由移动到一个控制器：

| Express | Nest |
| --- | --- |
| 资源 `express.Router()` | [controller](/overview/controllers) 在 [module](/modules) 中（`nest generate resource`） |
| `router.get('/:id', handler)` | 方法上的 `@Get(':id')` |
| `req.params`, `req.query`, `req.body` | `@Param()`, `@Query()`, `@Body()` |
| 手动验证 `req.body` | [schema or a DTO](/techniques/validation)，或者如果测试固定了其状态和消息，则保留检查 |
| 设置 `req.user` 的认证中间件 | 设置它的 [guard](/overview/guards)，以及读取它的 [custom decorator](/custom-decorators) |
| `requireRole('admin')` | 路由上的元数据，由守卫读取 |
| `router.param('id', load)` | 一个 [pipe](/pipes)：`@Param('id', OrderByIdPipe)`。守卫在管道之前运行，因此认证仍然最先执行 |
| `res.json(x)` | `return x`，当状态不是默认值时使用 `@HttpCode()` |
| `res.status(204).end()` | `@HttpCode(204)`，不返回任何内容 |
| `res.redirect(301, url)` | `@Redirect(url, 301)` |
| `res.cookie()` | `@Res({ passthrough: true }) res`，然后像往常一样使用 `res.cookie()` 和 `return` |
| `res.type()`, `res.attachment()` | `@Header()` |
| `res.write()` | `@Res() res`，然后像在 Express 中那样写入它 |
| `next(err)` | `throw err`，由一个 [exception filter](/overview/exception-filters) 处理 |
| 错误处理器和捕获所有 `404` | 一个全局异常过滤器 |
| `app.use(helmet())` | `app.use(helmet())` |
| `app.use(cors(options))` | `app.enableCors(options)` |
| `express.static(dir)` | `app.useStaticAssets(dir, { prefix })` |
| `multer(options).single('file')` | `@UseInterceptors(FileInterceptor('file', options))` 和 `@UploadedFile()` |
| 包含数据库连接池或邮件发送器的模块 | 首先是 [Value providers](/fundamentals/dependency-injection#value-providers-usevalue)，然后是服务 |

一个带有认证、角色检查和参数处理器的路由变为：

```typescript title="orders/orders.controller.ts"
@Controller('api/orders')
@UseGuards(AuthGuard, RoleGuard)
export class OrdersController {
  @Post()
  @HttpCode(200) // Express answered 200, and a client depends on it
  create(@CurrentUser() user: User, @Body() body?: CreateOrderBody) {
    const { total, tags } = body ?? {};
    if (typeof total !== 'number' || total <= 0) {
      throw new ApiError(422, 'INVALID_TOTAL', 'total must be a positive number');
    }
    return createOrder(user.id, total, tags);
  }

  @Get('summary') // Declared before ':orderId', which would match it too
  @Role('admin')
  summary() {
    return { total: orders.size };
  }

  @Get(':orderId')
  findOne(@CurrentUser() user: User, @Param('orderId', OrderByIdPipe) order: Order) {
    if (user.role !== 'admin' && order.userId !== user.id) {
      throw new ApiError(403, 'FORBIDDEN', 'Not your order');
    }
    return order;
  }
}

```

##### 保留那些不会报错变化的差异

这些是编译、启动和看起来正确，但你的测试必须捕获的差异：

| 在 Express 中 | 在 Nest 应用程序中 | 为保持旧行为 |
| --- | --- | --- |
| `res.json()` 在 `200` 上，在 `POST` 上也是如此 | 一个 `POST` 处理器响应 `201` | `@HttpCode(200)` |
| 错误具有处理器给出的形状 | `{ statusCode, message, error }` | 一个全局异常过滤器 |
| 未知路由得到你的 `404` | `NotFoundException`，带有 Nest 的正文 | 相同的过滤器 |
| 格式错误的 JSON 作为 `entity.parse.failed` 到达你的处理器 | `BadRequestException`，像 `/orders/%FF` 这样的格式错误的 URL 也会引发 | 相同的过滤器 |
| 大于 100 kB 的 JSON 正文作为 `entity.too.large` 到达你的处理器 | 一个状态为 `413` 的 `HttpException` | 相同的过滤器 |
| 一个 multer 错误作为 `MulterError` 到达你的处理器 | `FileInterceptor` 为大小错误引发 `PayloadTooLargeException`，为大多数其他错误引发 `400` | 相同的过滤器，或者自己运行 multer |
| 只读取你添加了解析器的正文格式 | 同时读取 JSON 和 URL-encoded 正文 | 在 `NestFactory.create()` 中使用 `bodyParser: false`，然后 `app.use(express.json())` |
| `router.use(authenticate)` 也响应没有子路由的路径 | 守卫只在存在的路由上运行，因此这些路径得到一个 `404` | 如果客户端可以判断，则保留为中间件，使用 `consumer.apply(authenticate).forRoutes('api/orders/{*path}')` |
| `router.param()` 在路由自身的中间件之前运行，因此缺失记录对任何人来说都是一个 `404` | 每个守卫在任何管道之前运行，因此 `requireRole` 首先响应，带有 `403` | 如果客户端可以判断，则在管道之后在处理器中检查角色 |
| 在 Express 4 上，`?min[total]=10` 是 `{ min: { total: '10' } }` | Express 5 的解析器给出 `{ 'min[total]': '10' }` | `app.set('query parser', 'extended')` |
| 在 Express 4 上，没有正文的请求具有 `req.body` 作为 `{}` | `@Body()` 是 `undefined`，因此解构它会抛出错误 | `body ?? {}` |
| `res.json('1.2.3')` 发送一个 JSON 字符串 | 返回一个字符串会发送 `text/html` | `@Res() res`，然后 `res.json('1.2.3')` |

路由路径也必须更改，但这些会明确报错：`/search/:term?` 会在启动时停止应用程序，需要 `search{/:term}`。通配符需要一个名称，`assets/*path`，并且 `@Param('path')` 将其片段作为数组返回。`assets/*path` 不匹配后面没有内容的 `/assets/`，因此如果 Express 4 响应了该路径，请使用 `assets/{*path}`。

从 Express 4 迁移还带来了 Express 5 自身的一些小变化，精确字节比较的测试会发现：静态文件显示 `UTF-8` 而不是 `charset=utf-8`，以及重定向时不同的正文。不应有客户端依赖这些，因此应接受它们，而不是将旧版本的 Express 库固定下来以重现它们。

过滤器和 `main.ts` 包含了大部分内容。它们必须为每个错误保持你的错误形状，包括 Nest 本身抛出的错误，因此请检查你的测试期望哪一个。例如，此过滤器将任何 `BadRequestException` 报告为格式错误的 JSON：

```typescript title="common/api-exception.filter.ts"
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const send = (status: number, code: string, message: string) =>
      response.status(status).json({ error: { code, message } });

    if (exception instanceof ApiError) {
      return send(exception.status, exception.code, exception.message);
    }
    if (exception instanceof NotFoundException) {
      return send(404, 'NOT_FOUND', `No route for ${request.method} ${request.path}`);
    }
    if (exception instanceof BadRequestException) {
      return send(400, 'BAD_JSON', 'Malformed JSON');
    }
    if (exception instanceof PayloadTooLargeException) {
      return send(413, 'FILE_TOO_LARGE', 'File too large');
    }
    if (exception instanceof HttpException) {
      return send(exception.getStatus(), 'ERROR', exception.message);
    }
    console.error(exception);
    return send(500, 'INTERNAL', 'Something went wrong');
  }
}

```

```typescript title="main.ts"
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('query parser', 'extended');
  app.use(helmet());
  app.enableCors({ origin: 'https://shop.example.com', credentials: true });
  app.useStaticAssets(join(import.meta.dirname, '..', 'public'), { prefix: '/static' });
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(process.env.PORT ?? 3000);
}

await bootstrap();

```

##### 切换

对 Nest 应用程序运行相同的测试，而不是修改测试：

```bash
$ BASE_URL=http://localhost:3001 node --test test/contract.test.mjs

```

当测试通过后，将其部署替换 Express 应用，并保留上一个 Express 版本可部署，直到新版本处理真实流量。

#### 交给编码代理

这两种方法都适用于编码代理，当应用程序足够小可以在一次变更中审查时，一次性完成是更好的选择。将代理指向此页面并将其与测试关联，这样它就不能对仅编译成功的代码宣布成功：

```bash
Migrate this Express application to NestJS all at once, following
/migrating/express.md.

1. Before changing anything, write black-box HTTP tests that cover every
   route: status codes, bodies and important headers, failures included.
   Run them against the Express app until they all pass.
2. Build the Nest application next to it, using the page's translation table.
3. Check every row of "Keep what would change without an error".
4. Run the same tests against the Nest application. Don't edit a test to
   make it pass. If behavior has to change, stop and tell me.

```