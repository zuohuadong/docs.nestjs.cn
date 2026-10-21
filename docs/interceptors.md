<!-- 此文件从 content/interceptors.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T07:28:12.296Z -->
<!-- 源文件: content/interceptors.md -->
<!-- 源哈希: a100d0e7ab7ef7330700287a6046d64c -->

### 拦截器

拦截器是一个带有 `@Injectable()` 装饰器注解的类，它实现了 `NestInterceptor` 接口。

<figure><img class="illustrative-image" src="/assets/Interceptors_1.png" /></figure>

拦截器提供了一组受 [Aspect Oriented Programming](https://en.wikipedia.org/wiki/Aspect-oriented_programming)（AOP）技术启发的功能。它们使得以下操作成为可能：

- 在方法执行之前或之后绑定额外的逻辑
- 转换函数返回的结果
- 转换函数抛出的异常
- 扩展基本函数行为
- 根据特定条件完全覆盖函数（例如，用于缓存目的）

#### 基础

每个拦截器都实现了 `intercept()` 方法，该方法接收两个参数。第一个是 `ExecutionContext` 实例（与 [guards](/overview/guards) 完全相同的对象）。`ExecutionContext` 扩展了 `ArgumentsHost`，我们在异常过滤器章节中已经介绍过。在那里，我们看到它是传递给原始处理程序的参数的包装器，并且根据应用程序类型的不同，它包含不同的参数数组。有关此主题的更多信息，请参阅 [exception filters](/overview/exception-filters#参数主机) 章节。

#### 执行上下文

通过扩展 `ArgumentsHost`，`ExecutionContext` 添加了几个辅助方法，这些方法提供了有关当前执行过程的额外细节。这些细节可帮助你构建更通用的拦截器，使其能够在广泛的控制器、方法和执行上下文中工作。要了解有关 `ExecutionContext` 的更多信息，请参阅 [execution context](/fundamentals/execution-context) 章节。

#### 调用处理器

第二个参数是 `CallHandler`。`CallHandler` 接口暴露了一个 `handle()` 方法，你可以使用它在拦截器中的某个时刻调用路由处理程序方法。如果你在 `intercept()` 方法的实现中没有调用 `handle()`，那么路由处理程序方法将根本不会被执行。

这意味着 `intercept()` 方法有效地**包装**了请求/响应流。因此，你可以在最终路由处理程序执行的**之前和之后**实现自定义逻辑。在处理程序**之前**运行代码很简单：将其放在 `handle()` 调用之前。要对之后发生的事情进行操作，请使用 `handle()` 返回的 `Observable`：你可以对其应用 [RxJS](https://github.com/ReactiveX/rxjs) 操作符来进一步操作响应。在面向切面编程的术语中，路由处理程序的调用（即调用 `handle()`）被称为 [Pointcut](https://en.wikipedia.org/wiki/Pointcut)，表明它是插入我们额外逻辑的点。

例如，考虑一个传入的 `POST /cats` 请求。此请求的目标是定义在 `CatsController` 内部的 `create()` 处理程序。如果在途中的任何位置调用了不调用 `handle()` 的拦截器，那么 `create()` 方法将不会被执行。一旦调用了 `handle()` 并且其返回的 `Observable` 被订阅（Nest 会订阅你的 `intercept()` 方法返回的流），`create()` 处理程序就会被触发。当处理程序的结果流经该流时，你可以在最终结果返回给调用者之前对其应用额外的操作。

<app-banner-observe></app-banner-observe>

#### 切面拦截

我们将要看的第一个用例是使用拦截器来记录用户交互（例如，存储用户调用、异步分发事件或计算时间戳）。以下示例展示了一个简单的 `LoggingInterceptor`：

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

> info **提示** `NestInterceptor<T, R>` 是一个泛型接口，其中 `T` 是 `next.handle()` 返回的 `Observable<T>`（响应流）所发出的值的类型，而 `R` 是 `intercept()` 返回的 `Observable<R>` 所发出的值的类型。

> warning **注意** 拦截器与控制器、提供者、守卫等一样，可以通过其 `constructor` **注入依赖**。

由于 `handle()` 返回一个 RxJS `Observable`，你可以从广泛的操作符中进行选择来操作该流。上面的示例使用了 `tap()` 操作符，它在流发出路由处理程序的结果时调用我们的日志记录函数，而不会以其他方式干扰响应周期。请注意，如果路由处理程序抛出异常，则不会调用此函数；要在这种情况下也运行逻辑，请将带有 `error` 回调的观察者对象传递给 `tap()`，或使用 `finalize()` 操作符。

> info **提示** 像上面那样手动为处理程序计时，是 APM 所做工作的最小版本。[NestJS Observe](https://www.observe.nestjs.com/ 'NestJS Observe') 会为每个控制器、提供者和队列消费者记录相同的测量值，无需编写或绑定拦截器。它还会记录每个处理程序自身花费的时间，并减去它所等待的一切。请参阅 [Observability](/observability/overview) 章节。

#### 绑定拦截器

要设置拦截器，请使用 `@UseInterceptors()` 装饰器。与 [pipes](/pipes) 和 [guards](/overview/guards) 一样，拦截器可以是控制器作用域、方法作用域或全局作用域。

```typescript title="cats.controller.ts"
@UseInterceptors(LoggingInterceptor)
export class CatsController {}

```

> info **提示** `@UseInterceptors()` 装饰器是从 `@nestjs/common` 包中导入的。

使用上面的构造，定义在 `CatsController` 中的每个路由处理程序都会使用 `LoggingInterceptor`。当客户端调用 `GET /cats` 端点时，你将在标准输出中看到以下内容：

```typescript
Before...
After... 1ms

```

请注意，我们传递的是 `LoggingInterceptor` 类（而不是实例），将实例化的责任留给框架，并启用依赖注入。与管道、守卫和异常过滤器一样，你也可以传递一个就地实例：

```typescript title="cats.controller.ts"
@UseInterceptors(new LoggingInterceptor())
export class CatsController {}

```

上面的构造将拦截器附加到该控制器声明的每个处理程序上。要将拦截器限制为单个方法，请在**方法级别**应用该装饰器。

要设置全局拦截器，请使用 Nest 应用程序实例的 `useGlobalInterceptors()` 方法：

```typescript
const app = await NestFactory.create(AppModule);
app.useGlobalInterceptors(new LoggingInterceptor());

```

全局拦截器应用于应用程序中的每个控制器和每个路由处理程序。但是，在任何模块之外注册的全局拦截器（使用 `useGlobalInterceptors()`，如上面的示例所示）无法注入依赖项，因为注册发生在任何模块的上下文之外。要解决此问题，请使用以下构造**直接从任何模块**注册拦截器：

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

> info **提示** 当你使用此方法为拦截器执行依赖注入时，无论你在哪个模块中注册它，该拦截器都是全局的。我们建议将其注册在定义拦截器（上面示例中的 `LoggingInterceptor`）的模块中。此外，`useClass` 并不是注册自定义提供者的唯一方式。请参阅 [Custom providers](/fundamentals/dependency-injection) 了解更多信息。

#### 响应映射

`handle()` 返回的流包含从路由处理程序**返回**的值，因此你可以使用 RxJS 的 `map()` 操作符对其进行转换。

> warning **警告** 响应映射不适用于特定于库的响应策略，即当路由处理程序使用 `@Res()` 注入响应对象并自行发送响应时。要结合两者，请启用 `passthrough` 选项（请参阅 [Library-specific approach](/overview/controllers#库特定方法)）。

让我们创建一个 `TransformInterceptor`，以简单的方式修改每个响应来演示该过程。它使用 RxJS 的 `map()` 操作符将响应对象赋值给新创建对象的 `data` 属性，并将新对象返回给客户端。

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

> info **提示** `intercept()` 方法可以是同步的或异步的。如果你需要在返回流之前等待某些内容，请将其声明为 `async`。

绑定此拦截器后，路由处理程序返回空数组 `[]` 的 `GET /cats` 请求将产生以下响应：

```json
{
  "data": []
}

```

拦截器非常适合为跨越整个应用程序的需求构建可重用的解决方案。例如，假设你需要将每个 `null` 响应值替换为空字符串 `''`。你可以用一行代码完成此操作，并全局绑定拦截器，以便每个注册的处理程序自动使用它。

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

另一个用例是使用 RxJS 的 `catchError()` 操作符覆盖抛出的异常：

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

有时你可能希望完全跳过调用处理程序，而是返回不同的值。一个典型的例子是提高响应时间的缓存。让我们看一个简单的**缓存拦截器**，它从缓存返回其响应。实际的实现还需要考虑 TTL、缓存失效和缓存大小等因素，这些超出了本讨论的范围。以下基本示例演示了主要概念。

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

我们的 `CacheInterceptor` 有一个硬编码的 `isCached` 变量和一个硬编码的响应 `[]`。关键点是它返回一个由 RxJS 的 `of()` 函数创建的新流，因此路由处理程序**根本不会被调用**。当有人调用使用 `CacheInterceptor` 的端点时，响应（一个硬编码的空数组）会立即返回。要构建通用解决方案，请将 `Reflector` 与自定义装饰器一起使用，如 [guards](/overview/guards) 章节中所述。

#### 更多操作符

使用 RxJS 操作符操作流开启了许多可能性。考虑另一个常见用例：处理路由请求的**超时**。如果端点在给定时间段内没有返回任何内容，你希望以错误响应终止请求。以下构造可实现此目的：

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
  }
}

```

如果路由处理程序在 5 秒内没有发出结果，`timeout()` 会以 `TimeoutError` 使流失败，拦截器将其映射为 `RequestTimeoutException`。取消订阅处理程序的流不会中止处理程序已经启动的工作（例如挂起的数据库查询），因此如果你需要释放资源，请在抛出 `RequestTimeoutException` 之前添加自定义逻辑。