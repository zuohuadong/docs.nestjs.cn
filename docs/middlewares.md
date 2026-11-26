<!-- 此文件从 content/middlewares.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:03:44.226Z -->
<!-- 源文件: content/middlewares.md -->
<!-- 源哈希: 7eb4055e29cee9c443041554573bb99d -->

### 中间件

中间件是一个在路由处理程序**之前**调用的函数。中间件函数可以访问 [request](https://expressjs.com/en/4x/api.html#req) 和 [response](https://expressjs.com/en/4x/api.html#res) 对象，以及应用程序请求-响应周期中的 `next()` 中间件函数。**next** 中间件函数通常由名为 `next` 的变量表示。

<figure><img class="illustrative-image" src="/assets/Middlewares_1.png" /></figure>

默认情况下，Nest 中间件等同于 [Express](https://expressjs.com/en/guide/using-middleware.html) 中间件。官方 Express 文档描述了中间件的能力如下：

<blockquote class="external">
  中间件函数可以执行以下任务：
  <ul>
    <li>执行任何代码。</li>
    <li>对请求和响应对象进行更改。</li>
    <li>结束请求-响应周期。</li>
    <li>调用堆栈中的下一个中间件函数。</li>
    <li>如果当前中间件函数不结束请求-响应周期，则必须调用 <code>next()</code> 将控制权传递给下一个中间件函数。否则，请求将悬挂。</li>
  </ul>
</blockquote>

您可以通过函数或使用 `@Injectable()` 装饰器的类来实现自定义 Nest 中间件。类应实现 `NestMiddleware` 接口，而函数没有特殊要求。让我们从实现一个简单的中间件类开始。

> warning **警告** Express 和 Fastify 处理中间件的方式不同，提供的方法签名也不同，而 Node 适配器使用 Express 签名。有关详细信息，请参阅 [HTTP adapters](/techniques/performance#中间件) 章。

```typescript title="logger.middleware.ts"
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    console.log('Request...');
    next();
  }
}

```

#### 依赖注入

Nest 中间件完全支持依赖注入。与提供者和控制器一样，中间件类可以**注入依赖项**，这些依赖项在同一模块内可用。像往常一样，依赖项是通过 `constructor` 注入的。

#### 应用中间件

中间件不是在 `@Module()` 装饰器中注册的。相反，您在模块类的 `configure()` 方法中设置它。包含中间件的模块必须实现 `NestModule` 接口。让我们在 `AppModule` 级别设置 `LoggerMiddleware`。

```typescript title="app.module.ts"
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { LoggerMiddleware } from './common/middleware/logger.middleware.js';
import { CatsModule } from './cats/cats.module.js';

@Module({
  imports: [CatsModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes('cats');
  }
}

```

在上面的示例中，`LoggerMiddleware` 应用于 `CatsController` 中定义的 `/cats` 路由处理程序。要将中间件限制在特定的请求方法上，请将包含路由 `path` 和请求 `method` 的对象传递给 `forRoutes()` 方法。下面的示例导入 `RequestMethod` 枚举以引用所需的请求方法。

```typescript title="app.module.ts"
import { Module, NestModule, RequestMethod, MiddlewareConsumer } from '@nestjs/common';
import { LoggerMiddleware } from './common/middleware/logger.middleware.js';
import { CatsModule } from './cats/cats.module.js';

@Module({
  imports: [CatsModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes({ path: 'cats', method: RequestMethod.GET });
  }
}

```

> info **提示** `configure()` 方法可以是异步的。使用 `async` 来 `await` 方法体内部异步操作的完成。

> warning **警告** 使用 Express 适配器时，Nest 默认注册 `json` 和 `urlencoded` 正文解析器（`express.json()` 和 `express.urlencoded()`）。要通过 `MiddlewareConsumer` 自定义这些解析器，请在使用 `NestFactory.create()` 创建应用程序时，将 `bodyParser` 选项设置为 `false` 来禁用默认设置。

#### 路由通配符

中间件也支持基于模式的路由。例如，命名通配符（`*splat`）匹配路由中的任何字符组合。在下面的示例中，对于任何以 `abcd/` 开头的路由，无论后面跟多少字符，中间件都会运行。

```typescript
forRoutes({
  path: 'abcd/*splat',
  method: RequestMethod.ALL,
});

```

> info **提示** `splat` 只是通配符参数的名称，没有特殊含义。您可以使用任何名称，例如 `*wildcard`。

`'abcd/*splat'` 路由路径匹配 `abcd/1`、`abcd/123`、`abcd/abc` 等。基于字符串的路径将连字符（`-`）和点（`.`）视为字面量。然而，没有附加字符的 `abcd/` 不匹配。要使其也匹配，请用花括号将通配符包裹起来使其可选：

```typescript
forRoutes({
  path: 'abcd/{*splat}',
  method: RequestMethod.ALL,
});

```

> warning **警告** 纯字符串路径在不同适配器上的匹配子路径的方式不同。在使用 Express 和 Node 适配器时，`forRoutes('cats')` 也会为像 `/cats/breed` 这样的子路径运行中间件。在使用 Fastify 时，它只匹配 `/cats`。要在所有适配器上匹配 `/cats` 及其子路径，请将斜杠放在可选通配符内部：`forRoutes('cats{/*splat&#125;')`。

#### 中间件消费者

`MiddlewareConsumer` 是一个辅助类，提供多个内置方法来管理中间件。它们都可以**链式调用**在 [fluent style](https://en.wikipedia.org/wiki/Fluent_interface) 中。`forRoutes()` 方法接受单个字符串、多个字符串、`RouteInfo` 对象、控制器类或多个控制器类。在大多数情况下，您会传递一个逗号分隔的**控制器**列表。下面是一个使用单个控制器的示例：

```typescript title="app.module.ts"
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { LoggerMiddleware } from './common/middleware/logger.middleware.js';
import { CatsModule } from './cats/cats.module.js';
import { CatsController } from './cats/cats.controller.js';

@Module({
  imports: [CatsModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes(CatsController);
  }
}

```

> info **提示** `apply()` 方法接受单个中间件或多个参数来指定 <a href="/overview/middlewares#多个中间件">多个中间件</a>。

#### 排除路由

要**排除**某些路由不应用中间件，请使用 `exclude()` 方法。它接受单个字符串、多个字符串或一个 `RouteInfo` 对象来识别要排除的路由：

```typescript
consumer
  .apply(LoggerMiddleware)
  .exclude(
    { path: 'cats', method: RequestMethod.GET },
    { path: 'cats', method: RequestMethod.POST },
    'cats/{*splat}',
  )
  .forRoutes(CatsController);

```

在上面的示例中，`LoggerMiddleware` 绑定到 `CatsController` 内部定义的所有路由，**除了**传递给 `exclude()` 方法的三个条目匹配的路由。

> info **提示** `exclude()` 方法支持使用 [path-to-regexp](https://github.com/pillarjs/path-to-regexp#parameters) 包中的通配符参数。

传递给 `exclude()` 的路径在声明时没有 [global prefix](/faq/global-prefix)，除非路由被排除在外，否则 Nest 会添加它。如果一个排除项匹配一个被全局前缀排除且没有参数或通配符的路径，则该路径的中间件也会被跳过，该路径将不带前缀被服务。此匹配遵循路由器的区分大小写。

```typescript
// main.ts
app.setGlobalPrefix('api', { exclude: ['health', 'health/ready'] });

// app.module.ts
consumer
  .apply(LoggerMiddleware)
  .exclude('health', 'health/*splat')
  .forRoutes('*splat');

```

在这里，`health/*splat` 也跳过了 `/health/ready` 的中间件。它本身不匹配 `/health`，因此 `health` 也被列出。

#### 函数式中间件

我们一直在使用的 `LoggerMiddleware` 类非常简单：它没有成员，没有额外的方法，也没有依赖。像这样的中间件可以定义为普通函数，而不是类。这种类型的中间件称为**函数式中间件**。让我们将日志中间件从类转换为函数以说明区别：

```typescript title="logger.middleware.ts"
import type { Request, Response, NextFunction } from 'express';

export function logger(req: Request, res: Response, next: NextFunction) {
  console.log('Request...');
  next();
}

```

然后在 `AppModule` 中使用它：

```typescript title="app.module.ts"
consumer
  .apply(logger)
  .forRoutes(CatsController);

```

> info **提示** 当您的中间件不需要任何依赖时，请考虑使用**函数式中间件**。

#### 多个中间件

要绑定按顺序执行的多个中间件，请将逗号分隔的列表传递给 `apply()` 方法：

```typescript
consumer.apply(cors(), helmet(), logger).forRoutes(CatsController);

```

#### 全局中间件

要一次性将中间件绑定到所有已注册的路由，请使用 `INestApplication` 实例的 `use()` 方法：

```typescript title="main.ts"
const app = await NestFactory.create(AppModule);
app.use(logger);
await app.listen(process.env.PORT ?? 3000);

```

> info **提示** 使用 `app.use()` 注册的全局中间件无法访问 DI 容器，因此请在那里使用 [functional middleware](/overview/middlewares#函数式中间件)。或者，使用类中间件，并在 `AppModule`（或任何其他 模块）中使用 `.forRoutes('*')` 绑定它。

#### 错误处理

当中间件抛出异常时，Nest 的 [exceptions layer](/overview/exception-filters) 会捕获它并发送适当的响应，这与从路由处理程序抛出的异常的处理方式相同。推荐的方法是抛出一个 `HttpException`（或内置子类，如 `UnauthorizedException`）：

```typescript title="auth.middleware.ts"
import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (!req.headers.authorization) {
      throw new UnauthorizedException();
    }
    next();
  }
}

```

如果中间件是异步的，请将 `use()` 声明为 `async`（或返回一个 `Promise`），以便被拒绝的 promise 被转发到异常层：

```typescript title="auth.middleware.ts"
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly authService: AuthService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const user = await this.authService.verify(req.headers.authorization);
    if (!user) {
      throw new UnauthorizedException();
    }
    req['user'] = user;
    next();
  }
}

```

您也可以将错误传递给 `next()`。当包装通过回调报告错误的现有 Express 风格中间件时，这非常有用：

```typescript
use(req: Request, res: Response, next: NextFunction) {
  if (!req.headers.authorization) {
    return next(new UnauthorizedException());
  }
  next();
}

```

> warning **警告** 由于中间件在选择路由处理程序之前运行，只有**全局**异常过滤器（使用 `app.useGlobalFilters()` 或 `APP_FILTER` 令牌注册的）才会捕获从中间件抛出的异常。方法作用域和控制器作用域的过滤器不会被调用，并且不支持使用 `@UseFilters()` 将过滤器绑定到中间件类。

> info **提示** 使用 `app.use()` 注册的中间件由底层 HTTP 平台（Express 或 Fastify）处理，而不是由 Nest 的 `MiddlewareModule` 处理。最好使用使用 `MiddlewareConsumer` 绑定的中间件抛出错误（或调用 `next(err)`），以便异常层可以处理它们。