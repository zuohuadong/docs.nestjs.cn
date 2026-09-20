<!-- 此文件从 content/websockets/exception-filters.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T09:47:42.910Z -->
<!-- 源文件: content/websockets/exception-filters.md -->
<!-- 源哈希: b4bb7c4fceffc8ffe16bb76577684056 -->

### 异常过滤器

HTTP [exception filter](/overview/exception-filters) 层与相应的 WebSocket 层之间唯一的区别是，您应该使用 `WsException` 而不是抛出 `HttpException`。

```typescript
throw new WsException('Invalid credentials.');

```

> info **提示** `WsException` 类是从 `@nestjs/websockets` 包中导入的。

使用上面的示例，Nest 将处理抛出的异常，并以以下结构发出 `exception` 消息：

```typescript
{
  status: 'error',
  message: 'Invalid credentials.'
}

```

#### 过滤器

WebSocket 异常过滤器的行为与 HTTP 异常过滤器相同。以下示例使用手动实例化的方法作用域过滤器。与基于 HTTP 的应用程序一样，您也可以使用网关作用域过滤器（即，在网关类前面加上 `@UseFilters()` 装饰器）。

```typescript
@UseFilters(new WsExceptionFilter())
@SubscribeMessage('events')
onEvent(client, data: any): WsResponse<any> {
  const event = 'events';
  return { event, data };
}

```

#### 继承

通常，您会创建完全自定义的异常过滤器，以满足应用程序的需求。但是，在某些用例中，您可能希望简单地扩展**核心异常过滤器**，并根据某些因素覆盖其行为。

为了将异常处理委托给基础过滤器，您需要扩展 `BaseWsExceptionFilter` 并调用继承的 `catch()` 方法。

```typescript
import { Catch, ArgumentsHost } from '@nestjs/common';
import { BaseWsExceptionFilter } from '@nestjs/websockets';

@Catch()
export class AllExceptionsFilter extends BaseWsExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    super.catch(exception, host);
  }
}

```

上述实现只是一个演示该方法的框架。您的扩展异常过滤器实现将包含您定制的**业务逻辑**（例如，处理各种条件）。