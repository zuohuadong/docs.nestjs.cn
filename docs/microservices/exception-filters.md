<!-- 此文件从 content/microservices/exception-filters.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T09:40:00.470Z -->
<!-- 源文件: content/microservices/exception-filters.md -->
<!-- 源哈希: ddb18094cdbbe2a976e2dfc99ecabd43 -->

### 异常过滤器

HTTP [exception filter](/overview/exception-filters) 层与对应的微服务层之间唯一的区别在于，微服务应抛出 `RpcException` 而不是 `HttpException`。

```typescript
throw new RpcException('Invalid credentials.');

```

> info **提示** `RpcException` 类是从 `@nestjs/microservices` 包中导入的。

Nest 会处理抛出的异常，并返回一个具有以下结构的 `error` 对象：

```json
{
  "status": "error",
  "message": "Invalid credentials."
}

```

如果你向 `RpcException` 构造函数传递一个对象而不是字符串，Nest 会按原样返回该对象。

> warning **警告** 事件处理器没有响应流。过滤器为 `@EventPattern()` 处理器重新抛出的错误永远不会到达生产者，因此请在过滤器内部处理该错误。

#### 过滤器

微服务异常过滤器的行为与 HTTP 异常过滤器类似，但有一个区别：`catch()` 方法必须返回一个 `Observable`。

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

> warning **警告** 注册在主 HTTP 应用程序上的全局异常过滤器不会应用于连接到 [hybrid application](/faq/hybrid-application) 的微服务，除非你设置 `inheritAppConfig` 选项。参见 [sharing configuration](/faq/hybrid-application#共享配置)。

以下示例使用手动实例化的方法作用域过滤器。与基于 HTTP 的应用程序一样，你也可以使用控制器作用域的过滤器（即在控制器类前加上 `@UseFilters()` 装饰器）。

```typescript
@UseFilters(new ExceptionFilter())
@MessagePattern({ cmd: 'sum' })
accumulate(data: number[]): number {
  return (data || []).reduce((a, b) => a + b);
}

```

#### 继承

通常，你会创建完全自定义的异常过滤器，以满足应用程序的需求。但在某些情况下，你可能希望扩展**核心异常过滤器**并根据某些因素覆盖其行为。

要将异常处理委托给基础过滤器，请扩展 `BaseRpcExceptionFilter` 并调用继承的 `catch()` 方法。

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

上述实现只是一个演示该方法的骨架。你对扩展异常过滤器的实现将包含你自己的**业务逻辑**（例如，处理各种条件）。