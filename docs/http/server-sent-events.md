<!-- 此文件从 content/http/server-sent-events.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T23:02:09.922Z -->
<!-- 源文件: content/http/server-sent-events.md -->
<!-- 源哈希: a2f40a95d06c5d79d3d326886d694e05 -->

### 服务端推送事件

服务端推送事件 (SSE) 是一种服务器推送技术，允许客户端通过 HTTP 连接从服务器接收自动更新。每个通知都作为一个以两个换行符结束的文本块发送（有关更多信息，请参阅 [Server-sent events on MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)）。

> info **提示** 在完整应用程序中使用服务端推送事件，仅向每个用户推送其项目更新，请遵循 [Build a project-management API in Node.js](/tutorials/project-management-api)。

#### 用法

要在路由（在**控制器**类中注册的路由）上启用服务端推送事件，请使用 `@Sse()` 装饰器注解路由处理程序。

```typescript
@Sse('sse')
sse(): Observable<MessageEvent> {
  return interval(1000).pipe(map((_) => ({ data: { hello: 'world' } })));
}

```

> info **提示** `@Sse()` 装饰器和 `MessageEvent` 接口从 `@nestjs/common` 包导入，而 `Observable`、`interval` 和 `map` 从 `rxjs` 包导入。

> warning **警告** 服务端推送事件路由必须返回一个 `Observable` 流（或解析为流的 `Promise`，如 [below](/http/server-sent-events#client-disconnection) 所示）。要从异步生成器、`ReadableStream` 或 Web `Response` 流式传输，请从常规路由返回它：参见 [Streaming responses](/http/streaming-responses)。

在上面的示例中，我们定义了一个名为 `sse` 的路由，用于传播实时更新。客户端可以使用 [EventSource API](https://developer.mozilla.org/en-US/docs/Web/API/EventSource) 监听这些事件。

`sse()` 方法返回一个 `Observable`，它会发出多个 `MessageEvent` 对象（在此示例中，每秒一个新的 `MessageEvent`）。每个 `MessageEvent` 对象应遵守以下接口以匹配规范：

```typescript
export interface MessageEvent {
  data?: string | object;
  id?: string;
  type?: string;
  retry?: number;
  comment?: string;
}

```

对象 `data` 被序列化为 JSON。`type` 属性作为 SSE `event` 字段发送，而 `comment` 作为注释行发送，客户端会忽略该注释行（例如，可用于保持活动状态）。如果未设置 `id`，Nest 会为每个事件分配一个递增的 ID。

有了这些设置，您可以在客户端应用程序中创建 `EventSource` 类的实例，并将 `/sse` 路由（匹配上述 `@Sse()` 装饰器传递的路径）作为构造函数参数传递。

一个 `EventSource` 实例会打开到 HTTP 服务器的持久连接，该服务器以 `text/event-stream` 格式发送事件。连接保持打开状态，直到调用 `EventSource.close()` 关闭它。

一旦连接打开，来自服务器的传入消息将以事件的形式传递到您的代码中。如果传入消息具有 `event` 字段，则触发的事件名称与该字段值相同。如果不存在 `event` 字段，则会触发一个通用的 `message` 事件（参见 [EventSource documentation on MDN](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)）。

```javascript
const eventSource = new EventSource('/sse');
eventSource.onmessage = ({ data }) => {
  console.log('New message', JSON.parse(data));
};

```

#### 状态码和头部

一个 `@Sse()` 路由会发送使用 `@Header()` 装饰器设置的头部。从 NestJS v12.1.3 开始，它还会发送其处理程序或拦截器在流开始前设置的响应状态码，在 Fastify 上，它还会发送它们设置的头部（Express 已经发送了这些）。要在处理程序中设置它们，请使用 `@Res()` 装饰器注入响应，并启用其 `passthrough` 选项：

```typescript
@Sse('sse')
sse(@Res({ passthrough: true }) res: Response): Observable<MessageEvent> {
  res.status(202);
  res.header('x-version', '1.0.0');
  return interval(1000).pipe(map((_) => ({ data: { hello: 'world' } })));
}

```

> info **提示** `Res` 从 `@nestjs/common` 包导入，而 `Response` 类型从 `express` 包导入。在 Fastify 上，请使用 `FastifyReply` 类型从 `fastify` 包导入。

#### 客户端断开连接

当客户端关闭 SSE 连接时（例如，使用 `eventSource.close()`），Nest 会自动从返回的 `Observable` 中取消订阅。这会停止事件流并清理任何相关资源，包括上述示例中的间隔计时器。

要在客户端断开连接时运行自定义清理逻辑，请使用 `finalize` 操作符：

```typescript
@Sse('sse')
sse(): Observable<MessageEvent> {
  return interval(1000).pipe(
    map((_) => ({ data: { hello: 'world' } })),
    finalize(() => console.log('Client disconnected')),
  );
}

```

> info **提示** `finalize` 操作符（从 `rxjs` 导入）在 `Observable` 终止时执行其回调：无论是完成、错误还是取消订阅（包括客户端断开连接）。这使其成为释放与流相关的外部资源（例如数据库游标或文件句柄）的正确位置。

`@Sse()` 处理程序可以是异步的，返回一个 `Promise<Observable>` 而不是直接返回一个 `Observable`。当流需要在产生第一个事件之前进行昂贵的设置时，这种情况很常见，例如打开数据库游标、获取模型会话或针对下游服务进行授权。

```typescript
@Sse('stream')
async stream(): Promise<Observable<MessageEvent>> {
  const session = await createSession();

  return new Observable(subscriber => {
    // ...produce events from `session`
  });
}

```

这就留下了一个空白。如果客户端在**Promise 仍在解析时**断开连接，Nest 永远不会订阅返回的 `Observable`，因为它不会启动一个其消费者已经离开的生产者。这是流的正确行为，但意味着 `Observable` 的清理逻辑永远不会运行，在设置期间分配的任何资源（如上文的 `session`）都会泄漏。

为了弥补这个空白，请使用 `@SseSignal()` 装饰器注入请求的 `AbortSignal`：

```typescript
import { MessageEvent, Sse, SseSignal } from '@nestjs/common';
import { EMPTY, Observable } from 'rxjs';

@Sse('stream')
async stream(@SseSignal() signal: AbortSignal): Promise<Observable<MessageEvent>> {
  const session = await createSession();

  if (signal.aborted) {
    // The client disconnected during setup. The Observable below will never be
    // subscribed, so release the resource here.
    await session.close();
    return EMPTY;
  }

  return new Observable(subscriber => {
    const stream = session.start();
    stream.on('data', data => subscriber.next({ data }));

    return () => {
      stream.stop();
      session.close();
    };
  });
}

```

#### 信号生命周期

信号代表**SSE 响应**的生命周期，而不仅仅是连接。一旦流因任何原因终止，它就会被中止：

- 客户端断开连接；
- `Observable` 完成；
- `Observable` 发生错误。

这使得该信号成为整个请求的单一清理钩子。与其在 `abort` 监听器和 `Observable` 自身的清理函数中重复清理，不如将资源一次性连接到信号，并在每个退出路径上释放它们：

```typescript
@Sse('stream')
async stream(@SseSignal() signal: AbortSignal): Promise<Observable<MessageEvent>> {
  // The signal aborts when the response ends, so the fetch is canceled whether
  // the client disconnected or the stream simply finished.
  const upstream = await fetch(UPSTREAM_URL, { signal });

  return new Observable(subscriber => {
    // ...
  });
}

```

由于信号在正常完成时也会中止，因此 `signal.aborted` 仅在**设置期间**有意义，即在返回 `Observable` 之前，用于检查“客户端是否已离开？”。此时，流尚未完成，因此中止的信号明确表示客户端已断开连接。

> warning **注意** 连接到 `abort` 事件的清理可能与 `Observable` 的清理函数同时运行，因此请使其幂等。

在生产者中，您也可以使用信号在客户端离开时结束流：

```typescript
return new Observable<MessageEvent>(subscriber => {
  const timer = setInterval(() => subscriber.next({ data: 'tick' }), 1000);
  const onAbort = () => subscriber.complete();

  signal.addEventListener('abort', onAbort, { once: true });

  return () => {
    clearInterval(timer);
    signal.removeEventListener('abort', onAbort);
  };
});

```

> info **提示** `@SseSignal()` 仅在 `@Sse()` 路由上填充；在任何其他路由处理程序上，它解析为 `undefined`。在 Express 和 Fastify 平台上工作方式相同。

#### 慢速客户端

`Observable` 无法暂停，因此事件会存储在内存中，等待未读取它们的客户端。一旦等待客户端的事件数据超过 400 万个字符，Nest 就会记录警告并断开连接，就像客户端已断开连接一样，这也将从 `Observable` 中取消订阅。然后 `EventSource` 重新连接，发送其接收到的最后一个事件的 ID。一个事件的计数取决于其 `data`、`comment`、`type` 和 `id` 的长度，以及它携带的至少 16 个字符。

对于以比客户端读取速度更快速度流式传输批量数据的路由，请使用 `maxPendingDataLength` 选项提高限制，或者将其设置为 `0` 或 `Infinity` 以解除限制：

```typescript
@Sse('logs', { maxPendingDataLength: 64 * 1024 * 1024 })
logs(): Observable<MessageEvent> {
  // ...
}

```

非数字的值，例如 `NaN` 对未设置的环境变量所做的处理，将获得默认值。

#### 示例

可在 [28-sse sample](https://github.com/nestjs/nest/tree/master/sample/28-sse) 找到一个可工作的示例。