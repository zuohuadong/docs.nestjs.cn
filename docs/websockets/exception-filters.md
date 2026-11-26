<!-- 此文件从 content/websockets/exception-filters.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:12:48.861Z -->
<!-- 源文件: content/websockets/exception-filters.md -->
<!-- 源哈希: 0e93cc12428f409b525e347410d8b74e -->

### 异常过滤器

WebSocket 异常层的工作方式类似于 HTTP [exception filter](/overview/exception-filters) 层，但有一个区别：不是抛出 `HttpException`，而是抛出 `WsException`。

```typescript
throw new WsException('Invalid credentials.');

```

> info **提示** `WsException` 类是从 `@nestjs/websockets` 包导入的。

当处理程序抛出上述异常时，Nest 会捕获它，并向客户端发出一个 `exception` 消息，结构如下：

```typescript
{
  status: 'error',
  message: 'Invalid credentials.',
  cause: {
    pattern: 'events', // pattern of the message that caused the exception
    data: { name: 'Nest' }, // payload of that message
  },
}

```

`cause` 属性允许客户端将错误与触发它的消息关联起来。如果您向 `WsException` 构造函数传递一个对象（而不是字符串），Nest 将原样发出该对象。任何不是 `WsException` 的异常都会产生相同的结构，其中 `'Internal server error'` 是消息。使用 `ws` 适配器时，因为它没有命名事件，客户端会收到形如 `{ "event": "exception", "data": ... }` 的 JSON 字符串。

#### 过滤器

WebSocket 异常过滤器与 HTTP 异常过滤器行为相同。以下示例使用手动实例化的方法作用域过滤器。与基于 HTTP 的应用程序一样，您也可以使用网关作用域过滤器（即使用 `@UseFilters()` 装饰网关类）。

```typescript
@UseFilters(new WsExceptionFilter())
@SubscribeMessage('events')
onEvent(client, data: any): WsResponse<any> {
  const event = 'events';
  return { event, data };
}

```

> warning **警告** 全局异常过滤器（使用 `app.useGlobalFilters()` 或 `APP_FILTER` 令牌注册）不适用于网关。请使用 `@UseFilters()` 在网关或方法级别绑定 WebSocket 异常过滤器。

#### 继承

通常，您会创建完全定制的异常过滤器，以满足您的应用程序需求。然而，有时您可能希望扩展**核心异常过滤器**并根据某些因素覆盖其行为。

要将异常处理委托给基础过滤器，请扩展 `BaseWsExceptionFilter` 并调用继承的 `catch()` 方法。

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

上述实现只是一个演示方法的骨架。一个真实的扩展异常过滤器将添加您自己的**业务逻辑**（例如，处理各种条件）。

`BaseWsExceptionFilter` 构造函数接受一个选项对象。将 `includeCause` 设置为 `false` 可从错误消息中省略 `cause` 属性，或者传递一个 `causeFactory(pattern, data)` 函数来控制其形状。