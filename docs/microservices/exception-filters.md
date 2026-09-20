<!-- 此文件从 content/microservices/exception-filters.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:08:54.735Z -->
<!-- 源文件: content/microservices/exception-filters.md -->
<!-- 源哈希: 3d165b3b8be1411dfcbc4d6f945faf76 -->

### 异常过滤器

HTTP [exception filter](/overview/exception-filters) 层与对应的微服务层之间的唯一区别是，您应该使用 `RpcException` 而不是抛出 `HttpException`。

```typescript
throw new RpcException('Invalid credentials.');

```

> info **提示** `RpcException` 类从 `@nestjs/microservices` 包导入。

使用上面的示例，Nest 将处理抛出的异常并返回具有以下结构的 `error` 对象：

```json
{
  "status": "error",
  "message": "Invalid credentials."
}

```

#### 过滤器

微服务异常过滤器的行为与 HTTP 异常过滤器类似，但有一个小区别。`catch()` 方法必须返回一个 `Observable`。

```typescript title="rpc-exception.filter.ts"
import { Catch, RpcExceptionFilter, ArgumentsHost } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';

@Catch(RpcException)
export class ExceptionFilter implements RpcExceptionFilter<RpcException> {
  catch(exception: RpcException, host: ArgumentsHost): Observable<any> {
    return throwError(() => exception.getError());
  }
}

```

> warning **警告** 使用 [hybrid application](/faq/hybrid-application) 时，默认不会启用全局微服务异常过滤器。

以下示例使用手动实例化的方法作用域过滤器。与基于 HTTP 的应用程序一样，您也可以使用控制器作用域的过滤器（即，在控制器类前加上 `@UseFilters()` 装饰器）。

```typescript
@UseFilters(new ExceptionFilter())
@MessagePattern({ cmd: 'sum' })
accumulate(data: number[]): number {
  return (data || []).reduce((a, b) => a + b);
}

```

#### 继承

通常，您会创建完全自定义的异常过滤器以满足应用程序需求。然而，在某些用例中，您可能希望简单地扩展**核心异常过滤器**，并根据某些因素覆盖其行为。

为了将异常处理委托给基础过滤器，您需要扩展 `BaseExceptionFilter` 并调用继承的 `catch()` 方法。

```typescript
import { Catch, ArgumentsHost } from '@nestjs/common';
import { BaseRpcExceptionFilter } from '@nestjs/microservices';

@Catch()
export class AllExceptionsFilter extends BaseRpcExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    return super.catch(exception, host);
  }
}

```

上述实现只是一个演示该方法的框架。您的扩展异常过滤器实现将包含您量身定制的**业务逻辑**（例如，处理各种条件）。