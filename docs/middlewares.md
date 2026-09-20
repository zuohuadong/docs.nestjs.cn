<!-- 此文件从 content/middlewares.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T07:30:22.738Z -->
<!-- 源文件: content/middlewares.md -->
<!-- 源哈希: 664f32af53e92bedfe1433e29e66502f -->

### 中间件

中间件是在**路由处理器**之前被调用的函数。中间件函数可以访问 [request](https://expressjs.com/en/4x/api.html#req) 和 [response](https://expressjs.com/en/4x/api.html#res) 对象，以及应用程序请求-响应周期中的 `next()` 中间件函数。**下一个**中间件函数通常由一个名为 `next` 的变量表示。

<figure><img class="illustrative-image" src="/assets/Middlewares_1.png" /></figure>

默认情况下，Nest 中间件与 [express](https://expressjs.com/en/guide/using-middleware.html) 中间件等价。以下来自官方 express 文档的描述说明了中间件的功能：

<blockquote class="external">
  中间件函数可以执行以下任务：
  <ul>
    <li>执行任何代码。</li>
    <li>对请求和响应对象进行修改。</li>
    <li>结束请求-响应周期。</li>
    <li>调用堆栈中的下一个中间件函数。</li>
    <li>如果当前中间件函数没有结束请求-响应周期，则必须调用 <code>next()</code> 将控制权传递给下一个中间件函数。否则，请求将一直挂起。</li>
  </ul>
</blockquote>

您可以在函数中或带有 `@Injectable()` 装饰器的类中实现自定义 Nest 中间件。该类应实现 `NestMiddleware` 接口，而函数则没有特殊要求。让我们从使用类方法实现一个简单的中间件功能开始。

> warning **警告** `Express` 和 `fastify` 对中间件的处理方式不同，并提供不同的方法签名，更多信息请阅读 [here](/techniques/performance#middleware)。

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

Nest 中间件完全支持依赖注入。与提供者和控制器一样，它们能够**注入**同一模块内可用的**依赖**。通常，这是通过 `constructor` 完成的。

#### 应用中间件

`@Module()` 装饰器中没有中间件的位置。相反，我们使用模块类的 `configure()` 方法来设置它们。包含中间件的模块必须实现 `NestModule` 接口。让我们在 `AppModule` 级别设置 `LoggerMiddleware`。

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

在上面的示例中，我们为之前在 `CatsController` 内部定义的 `/cats` 路由处理器设置了 `LoggerMiddleware`。我们还可以通过传递一个包含路由 `path` 和请求 `method` 的对象给 `forRoutes()` 方法（在配置中间件时），将中间件进一步限制到特定的请求方法。在下面的示例中，请注意我们导入了 `RequestMethod` 枚举来引用所需的请求方法类型。

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

> info **提示** `configure()` 方法可以使用 `async/await` 使其异步化（例如，您可以在 `configure()` 方法体内 `await` 异步操作的完成）。

> warning **警告** 当使用 `express` 适配器时，NestJS 应用将默认从 `body-parser` 包注册 `json` 和 `urlencoded`。这意味着如果您想通过 `MiddlewareConsumer` 自定义该中间件，您需要在创建应用时使用 `NestFactory.create()` 并将 `bodyParser` 标志设置为 `false` 来关闭全局中间件。

#### 路由通配符

NestJS 中间件也支持基于模式的路由。例如，命名通配符（`*splat`）可以用作通配符来匹配路由中的任意字符组合。在以下示例中，中间件将对任何以 `abcd/` 开头的路由执行，无论后面跟有多少个字符。

```typescript
forRoutes({
  path: 'abcd/*splat',
  method: RequestMethod.ALL,
});

```

> info **提示** `splat` 只是通配符参数的名称，没有特殊含义。您可以随意命名，例如 `*wildcard`。

`'abcd/*splat'` 路由路径将匹配 `abcd/1`、`abcd/123`、`abcd/abc` 等。连字符（`-`）和点（`.`）在基于字符串的路径中被按字面意义解释。但是，没有额外字符的 `abcd/` 将不匹配该路由。为此，您需要将通配符用花括号包裹起来使其成为可选的：

```typescript
forRoutes({
  path: 'abcd/{*splat}',
  method: RequestMethod.ALL,
});

```

#### 中间件消费者

`MiddlewareConsumer` 是一个辅助类。它提供了几个内置方法来管理中间件。所有这些方法都可以在 [fluent style](https://en.wikipedia.org/wiki/Fluent_interface) 中**链式**调用。`forRoutes()` 方法可以接受单个字符串、多个字符串、一个 `RouteInfo` 对象、一个控制器类甚至多个控制器类。在大多数情况下，您可能只会传递一个用逗号分隔的**控制器**列表。下面是一个使用单个控制器的示例：

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

> info **提示** `apply()` 方法可以接受单个中间件，或多个参数来指定 <a href="/middleware#多个中间件">多个中间件</a>。

#### 排除路由

有时，我们可能希望**排除**某些路由不应用中间件。为此，请使用 `exclude()` 方法。`exclude()` 方法接受单个字符串、多个字符串或一个 `RouteInfo` 对象来标识要排除的路由。

以下是如何使用它的示例：

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

> info **提示** `exclude()` 方法支持使用 [path-to-regexp](https://github.com/pillarjs/path-to-regexp#parameters) 包的通配符参数。

使用上面的示例，`LoggerMiddleware` 将绑定到 `CatsController` 内部定义的所有路由，**除了**传递给 `exclude()` 方法的三个路由。

这种方法提供了根据特定路由或路由模式应用或排除中间件的灵活性。

#### 函数式中间件

我们一直在使用的 `LoggerMiddleware` 类非常简单。它没有成员、没有额外的方法、也没有依赖。为什么我们不能用一个简单的函数来定义它，而不是用类呢？事实上，我们可以。这种类型的中间件被称为**函数式中间件**。让我们将 logger 中间件从基于类的形式转换为函数式中间件，以说明两者的区别：

```typescript title="logger.middleware.ts"
import { Request, Response, NextFunction } from 'express';

export function logger(req: Request, res: Response, next: NextFunction) {
  console.log(`Request...`);
  next();
};

```

并在 `AppModule` 中使用它：

```typescript title="app.module.ts"
consumer
  .apply(logger)
  .forRoutes(CatsController);

```

> info **提示** 当你的中间件不需要任何依赖时，考虑使用更简单的**函数式中间件**替代方案。

#### 多个中间件

如上所述，为了绑定多个按顺序执行的中间件，只需在 `apply()` 方法中提供一个逗号分隔的列表：

```typescript
consumer.apply(cors(), helmet(), logger).forRoutes(CatsController);

```

#### 全局中间件

如果我们想将中间件一次性绑定到所有已注册的路由，可以使用 `INestApplication` 实例提供的 `use()` 方法：

```typescript title="main.ts"
const app = await NestFactory.create(AppModule);
app.use(logger);
await app.listen(process.env.PORT ?? 3000);

```

> info **提示** 在全局中间件中无法访问 DI 容器。使用 `app.use()` 时，你可以改用 [functional middleware](/overview/middlewares#函数式中间件)。或者，你可以使用类中间件，并在 `AppModule`（或任何其他模块）中通过 `.forRoutes('*')` 使用它。

#### 错误处理

当中间件抛出异常时，Nest 的 [exceptions layer](/overview/exception-filters) 会捕获它并发送适当的响应，就像处理路由处理器抛出的异常一样。推荐的做法是抛出 `HttpException`（或内置子类，如 `UnauthorizedException`）：

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

如果中间件是异步的，请将 `use()` 声明为 `async`（或返回 `Promise`），以便被拒绝的 promise 被转发到异常层：

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

> warning **警告** 由于中间件在路由处理器被选中之前运行，因此只有**全局**异常过滤器（使用 `app.useGlobalFilters()` 或 `APP_FILTER` 令牌注册）才能捕获从中间件抛出的异常。方法作用域和控制器作用域的过滤器不会被调用，对中间件类应用 `@UseFilters()` 也没有效果。

> info **提示** 使用 `app.use()` 注册的中间件由底层 HTTP 平台（Express 或 Fastify）处理，而不是由 Nest 的 `MiddlewareModule` 处理。建议从使用 `MiddlewareConsumer` 绑定的中间件中抛出异常（或调用 `next(err)`），以便异常层能够处理该错误。