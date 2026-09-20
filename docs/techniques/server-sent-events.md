<!-- 此文件从 content/techniques/server-sent-events.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T08:29:35.576Z -->
<!-- 源文件: content/techniques/server-sent-events.md -->
<!-- 源哈希: 9e7cb9bdbd8a315ee71cccc0efe3c497 -->

### 服务器推送事件（SSE）

服务器推送事件（SSE）是一种服务器推送技术，使客户端能够通过 HTTP 连接自动接收来自服务器的更新。每个通知都以一段文本的形式发送，并以一对换行符结尾（了解更多 [here](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)）。

#### 使用

要在路由（在**控制器类**中注册的路由）上启用服务器推送事件，请使用 `@Sse()` 装饰器注解方法处理器。

```typescript
@Sse('sse')
sse(): Observable<MessageEvent> {
  return interval(1000).pipe(map((_) => ({ data: { hello: 'world' } })));
}

```

> info **提示** `@Sse()` 装饰器和 `MessageEvent` 接口从 `@nestjs/common` 导入，而 `Observable`、`interval` 和 `map` 从 `rxjs` 包导入。

> warning **警告** 服务器推送事件路由必须返回 `Observable` 流。

在上面的示例中，我们定义了一个名为 `sse` 的路由，它允许我们传播实时更新。这些事件可以使用 [EventSource API](https://developer.mozilla.org/en-US/docs/Web/API/EventSource) 进行监听。

`sse` 方法返回一个 `Observable`，它发出多个 `MessageEvent`（在此示例中，每秒发出一个新的 `MessageEvent`）。`MessageEvent` 对象应遵循以下接口以符合规范：

```typescript
export interface MessageEvent {
  data: string | object;
  id?: string;
  type?: string;
  retry?: number;
}

```

有了这些，我们现在可以在客户端应用程序中创建 `EventSource` 类的实例，将 `/sse` 路由（与上面传递给 `@Sse()` 装饰器的端点匹配）作为构造函数参数传入。

`EventSource` 实例打开到 HTTP 服务器的持久连接，服务器以 `text/event-stream` 格式发送事件。连接保持打开状态，直到通过调用 `EventSource.close()` 关闭。

一旦连接打开，来自服务器的传入消息将以事件的形式传递给您的代码。如果传入消息中有事件字段，则触发的事件与事件字段值相同。如果没有事件字段，则触发一个通用的 `message` 事件（[source](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)）。

```javascript
const eventSource = new EventSource('/sse');
eventSource.onmessage = ({ data }) => {
  console.log('New message', JSON.parse(data));
};

```

#### 客户端断开连接

当客户端关闭 SSE 连接（例如 `eventSource.close()`）时，NestJS 会自动取消订阅返回的 Observable，从而停止事件流并清理所有相关资源——包括上面示例中的间隔定时器。

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

> info **提示** `finalize` 操作符（从 `rxjs` 导入）在 Observable 终止时执行其回调——通过完成、错误或取消订阅（包括客户端断开连接）。这使得它成为释放与流相关的外部资源（如数据库游标或文件句柄）的正确位置。

`@Sse()` 处理器可以是异步的——返回 `Promise<Observable>` 而不是直接返回 `Observable`。这在流需要昂贵的设置才能产生第一个事件时很常见：打开数据库游标、获取模型会话或对下游服务进行授权。

```typescript
@Sse('stream')
async stream(): Promise<Observable<MessageEvent>> {
  const session = await createSession();

  return new Observable(subscriber => {
    // ...produce events from `session`
  });
}

```

这里有一个缺口。如果客户端在 **Promise 仍在解析时**断开连接，则返回的 `Observable` 永远不会被订阅——Nest 不会启动一个消费者已经离开的生产者。这对于流来说是正确行为，但意味着 `Observable` 的清理逻辑永远不会运行，并且在设置期间分配的任何内容（上面的 `session`）都会泄漏。

为了弥补这个缺口，请使用 `@SseSignal()` 装饰器注入请求的 `AbortSignal`：

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

信号表示 **SSE 响应**的生命周期，而不仅仅是连接。一旦流因任何原因终止，它就会被中止：

- 客户端断开连接；
- `Observable` 完成；
- `Observable` 出错。

这使得信号成为整个请求的单一清理钩子。与其在 `abort` 监听器和 `Observable` 自身的清理函数之间重复清理逻辑，不如将资源连接到信号一次，并在每个退出路径上释放它们：

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

由于信号在正常完成时也会中止，因此 `signal.aborted` 仅在 **设置期间** 作为“客户端是否离开？”的检查才有意义——在返回 `Observable` 之前。此时流尚未完成，因此中止的信号明确表示客户端已断开连接。

> warning **注意** 连接到 `abort` 事件的清理可能与 `Observable` 的清理函数同时运行，因此请使其幂等。

在生产者内部，信号也是客户端离开时结束流的便捷方式：

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

> info **提示** `@SseSignal()` 仅在 `@Sse()` 路由上填充；在任何其他处理器上，它解析为 `undefined`。它在 Express 和 Fastify 平台上的工作方式相同。

#### 示例

可运行的示例可在 [here](https://github.com/nestjs/nest/tree/master/sample/28-sse) 获取。