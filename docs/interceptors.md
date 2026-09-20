<!-- 此文件从 content/interceptors.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T07:24:57.622Z -->
<!-- 源文件: content/interceptors.md -->
<!-- 源哈希: 0e651aa0035ef7493dbf8def0e4679a6 -->

### 拦截器

拦截器是使用 `@Injectable()` 装饰器注解并实现 `NestInterceptor` 接口的类。

<figure><img class="illustrative-image" src="/assets/Interceptors_1.png" /></figure>

拦截器具有一组有用的能力，这些能力受到 [Aspect Oriented Programming](https://en.wikipedia.org/wiki/Aspect-oriented_programming)（AOP）技术的启发。它们使得以下操作成为可能：

- 在方法执行之前/之后绑定额外逻辑
- 转换函数返回的结果
- 转换函数抛出的异常
- 扩展基本函数行为
- 根据特定条件完全覆盖函数（例如，用于缓存目的）

#### 基础

每个拦截器都实现 `intercept()` 方法，该方法接受两个参数。第一个是 `ExecutionContext` 实例（与 [guards](/overview/guards) 完全相同的对象）。`ExecutionContext` 继承自 `ArgumentsHost`。我们之前在异常过滤器章节中见过 `ArgumentsHost`。在那里，我们看到它是传递给原始处理程序的参数的包装器，并根据应用程序的类型包含不同的参数数组。您可以参考 [exception filters](/overview/exception-filters#参数主机) 以获取更多关于此主题的信息。

#### 执行上下文

通过扩展 `ArgumentsHost`，`ExecutionContext` 还添加了几个新的辅助方法，这些方法提供了有关当前执行过程的额外详细信息。这些详细信息有助于构建更通用的拦截器，这些拦截器可以在广泛的控制器、方法和执行上下文中工作。了解更多关于 `ExecutionContext` [here](/fundamentals/execution-context) 的信息。

#### 调用处理程序

第二个参数是 `CallHandler`。`CallHandler` 接口实现了 `handle()` 方法，您可以使用该方法在拦截器中的某个点调用路由处理程序方法。如果您在 `intercept()` 方法的实现中没有调用 `handle()` 方法，则路由处理程序方法将根本不会执行。

这种方法意味着 `intercept()` 方法有效地**包装**了请求/响应流。因此，您可以在最终路由处理程序执行**之前和之后**实现自定义逻辑。很明显，您可以在 `intercept()` 方法中编写在调用 `handle()` **之前**执行的代码，但是如何影响之后发生的事情呢？由于 `handle()` 方法返回一个 `Observable`，我们可以使用强大的 [RxJS](https://github.com/ReactiveX/rxjs) 运算符来进一步操作响应。使用面向切面编程术语，路由处理程序的调用（即调用 `handle()`）被称为 [Pointcut](https://en.wikipedia.org/wiki/Pointcut)，表明这是我们插入额外逻辑的点。

例如，考虑一个传入的 `POST /cats` 请求。该请求的目标是定义在 `CatsController` 内的 `create()` 处理程序。如果在沿途的任何地方调用了不调用 `handle()` 方法的拦截器，则 `create()` 方法将不会执行。一旦调用了 `handle()`（并且其 `Observable` 已返回），`create()` 处理程序将被触发。一旦通过 `Observable` 接收到响应流，就可以对流执行额外的操作，并将最终结果返回给调用者。

<app-banner-devtools></app-banner-devtools>

#### 切面拦截

我们要看的第一个用例是使用拦截器来记录用户交互（例如，存储用户调用、异步分发事件或计算时间戳）。我们在下面展示一个简单的 `LoggingInterceptor`：

```typescript title="logging.interceptor.ts"
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    console.log('Before...');

    const now = Date.now();
    return next
      .handle()
      .pipe(
        tap(() => console.log(`After... ${Date.now() - now}ms`)),
      );
  }
}

```

> info **提示** `NestInterceptor<T, R>` 是一个泛型接口，其中 `T` 表示 `Observable<T>` 的类型（支持响应流），而 `R` 是由 `Observable<R>` 包装的值的类型。

> warning **注意** 拦截器与控制器、提供者、守卫等一样，可以通过其 `constructor` **注入依赖**。

由于 `handle()` 返回一个 RxJS `Observable`，我们可以使用多种运算符来操作流。在上面的示例中，我们使用了 `tap()` 运算符，它在可观察流正常或异常终止时调用我们的匿名日志函数，但不会干扰响应周期。

#### 绑定拦截器

为了设置拦截器，我们使用从 `@nestjs/common` 包导入的 `@UseInterceptors()` 装饰器。与 [pipes](/pipes) 和 [guards](/overview/guards) 一样，拦截器可以是控制器作用域、方法作用域或全局作用域。

```typescript title="cats.controller.ts"
@UseInterceptors(LoggingInterceptor)
export class CatsController {}

```

> info **提示** `@UseInterceptors()` 装饰器从 `@nestjs/common` 包导入。

使用上述构造，在 `CatsController` 中定义的每个路由处理程序都将使用 `LoggingInterceptor`。当有人调用 `GET /cats` 端点时，您将在标准输出中看到以下输出：

```typescript
Before...
After... 1ms

```

请注意，我们传递了 `LoggingInterceptor` 类（而不是实例），将实例化的责任留给框架并启用依赖注入。与管道、守卫和异常过滤器一样，我们也可以传递一个就地实例：

```typescript title="cats.controller.ts"
@UseInterceptors(new LoggingInterceptor())
export class CatsController {}

```

如前所述，上述构造将拦截器附加到此控制器声明的每个处理程序。如果我们想将拦截器的范围限制为单个方法，我们只需在**方法级别**应用装饰器。

为了设置全局拦截器，我们使用 Nest 应用程序实例的 `useGlobalInterceptors()` 方法：

```typescript
const app = await NestFactory.create(AppModule);
app.useGlobalInterceptors(new LoggingInterceptor());

```

全局拦截器在整个应用程序中使用，适用于每个控制器和每个路由处理程序。在依赖注入方面，从任何模块外部注册的全局拦截器（使用 `useGlobalInterceptors()`，如上面的示例）无法注入依赖，因为这是在模块上下文之外完成的。为了解决这个问题，您可以使用以下构造**直接从任何模块**设置拦截器：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Module({
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}

```

> info **提示** 当使用此方法为拦截器执行依赖注入时，请注意，无论此构造在哪个模块中使用，拦截器实际上都是全局的。这应该在哪里完成？选择定义拦截器（上面的示例中的 `LoggingInterceptor`）的模块。此外，`useClass` 不是处理自定义提供者注册的唯一方式。了解更多 [here](/fundamentals/dependency-injection)。

#### 响应映射

我们已经知道 `handle()` 返回一个 `Observable`。该流包含路由处理程序**返回**的值，因此我们可以使用 RxJS 的 `map()` 操作符轻松地对其进行修改。

> warning **警告** 响应映射功能不适用于库特定的响应策略（禁止直接使用 `@Res()` 对象）。

让我们创建 `TransformInterceptor`，它将以一种简单的方式修改每个响应以演示该过程。它将使用 RxJS 的 `map()` 操作符将响应对象分配给一个新创建对象的 `data` 属性，并将新对象返回给客户端。

```typescript title="transform.interceptor.ts"
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  data: T;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    return next.handle().pipe(map(data => ({ data })));
  }
}

```

> info **提示** Nest 拦截器同时适用于同步和异步的 `intercept()` 方法。如有必要，您可以简单地将方法切换为 `async`。

通过上述构造，当有人调用 `GET /cats` 端点时，响应将如下所示（假设路由处理程序返回一个空数组 `[]`）：

```json
{
  "data": []
}

```

拦截器在创建可复用的解决方案以满足整个应用程序中出现的需求方面具有巨大价值。
例如，假设我们需要将每个 `null` 值转换为空字符串 `''`。我们可以用一行代码完成此操作，并全局绑定拦截器，以便每个注册的处理程序自动使用它。

```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ExcludeNullInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next
      .handle()
      .pipe(map(value => value === null ? '' : value ));
  }
}

```

#### 异常映射

另一个有趣的用例是利用 RxJS 的 `catchError()` 操作符来覆盖抛出的异常：

```typescript title="errors.interceptor.ts"
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  BadGatewayException,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable()
export class ErrorsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next
      .handle()
      .pipe(
        catchError(err => throwError(() => new BadGatewayException())),
      );
  }
}

```

#### 流覆盖

有时我们可能想要完全阻止调用处理程序并返回不同的值，这有几个原因。一个明显的例子是实现缓存以提高响应时间。让我们看一个简单的**缓存拦截器**，它从缓存中返回其响应。在现实示例中，我们需要考虑其他因素，如 TTL、缓存失效、缓存大小等，但这超出了本讨论的范围。这里我们将提供一个演示主要概念的基本示例。

```typescript title="cache.interceptor.ts"
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, of } from 'rxjs';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const isCached = true;
    if (isCached) {
      return of([]);
    }
    return next.handle();
  }
}

```

我们的 `CacheInterceptor` 有一个硬编码的 `isCached` 变量和一个硬编码的响应 `[]`。需要注意的关键点是，我们在这里返回一个新的流，由 RxJS 的 `of()` 操作符创建，因此路由处理程序**根本不会被调用**。当有人调用使用 `CacheInterceptor` 的端点时，响应（一个硬编码的空数组）将立即返回。为了创建通用解决方案，您可以利用 `Reflector` 并创建自定义装饰器。`Reflector` 在 [guards](/overview/guards) 章节中有详细描述。

#### 更多操作符

使用 RxJS 操作符操作流的可能性为我们提供了许多能力。让我们考虑另一个常见用例。假设您想要处理路由请求的**超时**。当您的端点在一段时间后没有返回任何内容时，您希望以错误响应终止。以下构造可以实现这一点：

```typescript title="timeout.interceptor.ts"
import { Injectable, NestInterceptor, ExecutionContext, CallHandler, RequestTimeoutException } from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      timeout(5000),
      catchError(err => {
        if (err instanceof TimeoutError) {
          return throwError(() => new RequestTimeoutException());
        }
        return throwError(() => err);
      }),
    );
  };
};

```

5 秒后，请求处理将被取消。您还可以在抛出 `RequestTimeoutException` 之前添加自定义逻辑（例如释放资源）。