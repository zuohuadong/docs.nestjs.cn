<!-- 此文件从 content/middlewares.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T07:25:11.972Z -->
<!-- 源文件: content/middlewares.md -->
<!-- 源哈希: 38683baf6130a76056bf088d2017341c -->

### 中间件

中间件是一个在路由处理程序**之前**调用的函数。中间件函数可以访问 [request](https://expressjs.com/en/4x/api.html#req) 和 [response](https://expressjs.com/en/4x/api.html#res) 对象，以及应用程序请求-响应周期中的 `next()` 中间件函数。**next** 中间件函数通常由名为 `next` 的变量表示。

<figure><img class="illustrative-image" src="/assets/Middlewares_1.png" /></figure>

默认情况下，Nest 中间件等同于 [Express](https://expressjs.com/en/guide/using-middleware.html) 中间件。官方 Express 文档对中间件能力的描述如下：

<blockquote class="external">
  中间件函数可以执行以下任务：
  <ul>
    <li>执行任意代码。</li>
    <li>对请求和响应对象进行更改。</li>
    <li>结束请求-响应周期。</li>
    <li>调用堆栈中的下一个中间件函数。</li>
    <li>如果当前中间件函数没有结束请求-响应周期，它必须调用 <code>next()</code>
      将控制权传递给下一个中间件函数。否则，请求将被挂起。</li>
  </ul>
</blockquote>

你可以将自定义 Nest 中间件实现为函数，或实现为带有 `@Injectable()` 装饰器的类。类应实现 `NestMiddleware` 接口，而函数则没有特殊要求。让我们从实现一个简单的中间件类开始。

> warning **警告** Express 和 Fastify 处理中间件的方式不同，并提供不同的方法签名。有关详细信息，请参阅 [Performance (Fastify)](/techniques/performance#中间件) 章节。

```typescript title="logger.middleware.ts"
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    console.log('Request...');
    next();
  }
}

```

#### 依赖注入

Nest 中间件完全支持依赖注入。与提供者和控制器一样，中间件类可以**注入依赖项**，这些依赖项在同一模块内可用。像往常一样，依赖项通过 `constructor` 注入。

#### 应用中间件

中间件不在 `@Module()` 装饰器中注册。相反，你在模块类的 `configure()` 方法中进行设置。包含中间件的模块必须实现 `NestModule` 接口。让我们在 `AppModule` 级别设置 `LoggerMiddleware`。

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

在上面的示例中，`LoggerMiddleware` 被应用于 `CatsController` 中定义的 `/cats` 路由处理程序。要将中间件限制为特定的请求方法，请将包含路由 `path` 和请求 `method` 的对象传递给 `forRoutes()` 方法。下面的示例导入 `RequestMethod` 枚举以引用所需的请求方法。

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

> info **提示** `configure()` 方法可以是异步的。使用 `async` 声明它，以 `await` 方法体内异步操作的完成。

> warning **警告** 使用 Express 适配器时，Nest 默认注册 `json` 和 `urlencoded` 正文解析器（`express.json()` 和 `express.urlencoded()`）。要通过 `MiddlewareConsumer` 自定义这些解析器，请在使用 `NestFactory.create()` 创建应用程序时将 `bodyParser` 选项设置为 `false` 以禁用默认值。

#### 路由通配符

中间件还支持基于模式的路由。例如，命名通配符（`*splat`）匹配路由中的任意字符组合。在下面的示例中，中间件对任何以 `abcd/` 开头的路由运行，无论后面有多少个字符。

```typescript
forRoutes({
  path: 'abcd/*splat',
  method: RequestMethod.ALL,
});

```

> info **提示** `splat` 只是通配符参数的名称，没有特殊含义。你可以使用任何名称，例如 `*wildcard`。

`'abcd/*splat'` 路由路径匹配 `abcd/1`、`abcd/123`、`abcd/abc` 等。基于字符串的路径将连字符（`-`）和点（`.`）按字面解释。但是，不带其他字符的 `abcd/` 不匹配。要同时匹配它，请将通配符包裹在花括号中使其成为可选的：

```typescript
forRoutes({
  path: 'abcd/{*splat}',
  method: RequestMethod.ALL,
});

```

#### 中间件消费者

`MiddlewareConsumer` 是一个辅助类，提供多个内置方法来管理中间件。所有这些方法都可以在 [fluent style](https://en.wikipedia.org/wiki/Fluent_interface) 中**链式调用**。`forRoutes()` 方法接受单个字符串、多个字符串、`RouteInfo` 对象、一个控制器类或多个控制器类。在大多数情况下，你将传递一个逗号分隔的**控制器**列表。下面是一个使用单个控制器的示例：

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

要**排除**某些路由不应用中间件，请使用 `exclude()` 方法。它接受单个字符串、多个字符串或标识要排除的路由的 `RouteInfo` 对象：

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

在上面的示例中，`LoggerMiddleware` 绑定到 `CatsController` 内定义的所有路由，**除了**与传递给 `exclude()` 方法的三个条目匹配的路由。

> info **提示** `exclude()` 方法使用 [path-to-regexp](https://github.com/pillarjs/path-to-regexp#parameters) 包支持通配符参数。

#### 函数式中间件

我们一直使用的 `LoggerMiddleware` 类是最小的：它没有成员、没有额外的方法，也没有依赖项。像这样的中间件可以定义为普通函数而不是类。这种类型的中间件称为**函数式中间件**。让我们将 logger 中间件从类转换为函数以说明区别：

```typescript title="logger.middleware.ts"
import { Request, Response, NextFunction } from 'express';

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

> info **提示** 当你的中间件不需要任何依赖项时，请考虑使用**函数式中间件**。

#### 多个中间件

要绑定多个按顺序执行的中间件，请向 `apply()` 方法传递一个以逗号分隔的列表：

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

> info **提示** 使用 `app.use()` 注册的全局中间件无法访问 DI 容器，因此请在那里使用 [functional middleware](/overview/middlewares#函数式中间件)。或者，使用类中间件并在 `AppModule`（或任何其他模块）中通过 `.forRoutes('*')` 绑定它。

#### 错误处理

当中间件抛出异常时，Nest 的 [exceptions layer](/overview/exception-filters) 会捕获它并发送适当的响应，就像它处理从路由处理器抛出的异常一样。推荐的做法是抛出一个 `HttpException`（或诸如 `UnauthorizedException` 之类的内置子类）：

```typescript title="auth.middleware.ts"
import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

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

你也可以将错误传递给 `next()`。这在包装通过回调报告失败的现有 Express 风格中间件时非常有用：

```typescript
use(req: Request, res: Response, next: NextFunction) {
  if (!req.headers.authorization) {
    return next(new UnauthorizedException());
  }
  next();
}

```

> warning **警告** 由于中间件在路由处理器被选中之前运行，只有**全局**异常过滤器（通过 `app.useGlobalFilters()` 或 `APP_FILTER` 令牌注册）才能捕获从中间件抛出的异常。方法作用域和控制器作用域的过滤器不会被调用，并且不支持使用 `@UseFilters()` 将过滤器绑定到中间件类。

> info **提示** 使用 `app.use()` 注册的中间件由底层 HTTP 平台（Express 或 Fastify）处理，而不是由 Nest 的 `MiddlewareModule` 处理。请优先从通过 `MiddlewareConsumer` 绑定的中间件中抛出错误（或调用 `next(err)`），以便异常层能够处理它们。