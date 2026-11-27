<!-- 此文件从 content/http/streaming-responses.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:59:38.427Z -->
<!-- 源文件: content/http/streaming-responses.md -->
<!-- 源哈希: 783da72e7e3754b26a1ba161191cc4bb -->

### 流式响应

路由处理程序可以返回一个 Web 标准 `Response`、一个 `ReadableStream` 或一个异步可迭代对象，例如异步生成器。Nest 会在生成时立即发送它，并处理背压，当客户端断开连接时停止它。它在 Express、Fastify 和 Node 适配器上表现相同。

适用于生成时间较长或太大而无法在内存中保存的答案：LLM 的 token、代理到另一个 API 的请求、大型导出文件。

> info **提示** 这需要 `@nestjs/core` 12.4.0 或更高版本。在旧版本中，大多数这些值会以空 JSON 对象和 200 响应。

#### 返回一个流

最简洁的流式传输方式是异步生成器。它产生的每个值都会在客户端可以接收时立即发送：

```typescript
@Get('story')
async *story() {
  for await (const token of this.llm.stream('Tell me a story')) {
    yield token;
  }
}

```

如果已经有了一个 `Response`，则返回它。AI SDK 的 `toTextStreamResponse()` 返回一个，而 `fetch()` 解析为一个，或者一个 Promise 或一个 `Observable` 也可以。要实现在客户端离开时停止模型调用，请参阅 [Client disconnection](/http/streaming-responses#client-disconnection)：

```typescript
@Post('chat')
chat(@Body() { messages }: ChatDto) {
  return streamText({ model, messages }).toTextStreamResponse();
}

@Get('quotes')
quotes() {
  return fetch('https://quotes.example.com/latest');
}

```

一个 `ReadableStream` 提供了最大的控制权，因为它能立即知道客户端是否已离开（参见 [Client disconnection](/http/streaming-responses#client-disconnection)）：

```typescript
@Get('ticker')
ticker() {
  let timer: NodeJS.Timeout;
  return new ReadableStream({
    start(controller) {
      timer = setInterval(() => controller.enqueue(`${Date.now()}\n`), 1000);
    },
    cancel() {
      clearInterval(timer);
    },
  });
}

```

> info **提示** `Response` 和 `ReadableStream` 是 Node.js 的全局对象，因此无需导入。

任何具有 `Symbol.asyncIterator` 方法的其他对象也适用，Node.js `Readable` 就是其中之一。数组、`Set` 和其他同步可迭代对象仍被序列化为 JSON。一个同时具有该方法的 thenable，例如 Mongoose 查询，会像往常一样被 await。

#### 流可以产生的内容

每个块都根据其类型发送：

| 块 | 发送方式 | 默认 `Content-Type` |
| :--- | :--- | :--- |
| String | UTF-8 文本 | `text/plain; charset=utf-8` |
| `Uint8Array`, `Buffer`, 其他二进制数据 | 原始字节 | `application/octet-stream` |
| 任何其他内容 | 一行 JSON ([NDJSON](https://ndjson.org)) | `application/x-ndjson` |

第一个块决定了默认的 `Content-Type`。使用 `@Header()` 设置自己的值，它具有最高优先级：

```typescript
@Get('events')
@Header('Content-Type', 'text/event-stream')
async *events() {
  yield 'data: hello\n\n';
}

```

一个 `undefined` 块不发送任何内容，而一个 `JSON.stringify()` 拒绝的块，例如一个 `BigInt`，将使流失败。

#### 状态和头部

使用生成器或 `ReadableStream` 时，像任何其他路由一样应用 `@HttpCode()` 和 `@Header()`。这包括 `POST` 的默认状态，即 201：如果客户端期望 200，请添加 `@HttpCode(200)`。

一个 `Response` 是整个答案，因此其状态和头部优先于在此之前设置的，无论是由 `@HttpCode()`、`@Header()`、守卫还是中间件设置的。它未设置的头部保持不变，例如 CORS 头部，并且其 `Set-Cookie` 值会添加到已有的值中。一个没有 `Content-Type` 的 `Response` 会作为 `application/octet-stream` 发送，除非有 `@Header()` 或中间件设置了其他值。一个 `Response` 总是有一个状态，除非您设置了，否则是 200，因此 `@HttpCode()` 对其没有影响。

```typescript
@Post('jobs')
createJob() {
  // A 202, not the 201 of POST. CORS headers set earlier are kept.
  return new Response(this.jobs.progress(), {
    status: 202,
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

```

一个带有 `null` 主体的 `Response`，例如 204 或 `Response.redirect()` 生成的，会连同其状态和头部一起发送，但没有主体。

`fetch()` 解码其返回的响应主体，但保持其 `Content-Encoding` 和 `Content-Length` 头部不变，以及描述其连接的头部，例如 `Keep-Alive`。Nest 会从来自 `fetch()` 的 `Response` 中移除这些头部，以便您可以原样返回它。您从其中构建的 `Response`，如使用 `new Response(upstream.body, upstream)`，会带有您提供的头部，因此请自行省略这些头部。

#### 错误

头部会等待第一个块，因为一旦发送，任何异常过滤器都无法响应。因此，在第一个块之前的错误就像路由处理程序中的任何其他错误一样：它会通过 [exception filters](/overview/exception-filters)，客户端会收到一个正确的错误响应。

```typescript
@Get('story')
async *story() {
  // Answered with a 404
  const story = await this.findStory();
  if (!story) {
    throw new NotFoundException();
  }
  yield* story.chapters;
}

```

要提前发送头部（例如，以便客户端知道连接已打开），请先产生一个空字符串。从那时起，错误将无法到达异常过滤器。

一旦头部发送，就会记录错误，并且连接会突然关闭而不是结束，这样截断的答案就不会被误认为是完整的：`fetch()` 在读取主体时拒绝，而 `curl` 报告错误。如果您的客户端需要知道发生了什么错误，请将其作为流的一部分进行流式传输，并在生成器中自行捕获错误。

已经被读取（例如使用 `await response.text()`）或被锁定的主体不能发送，因此它会以 500 失败而不是不发送任何内容。异步生成器无法判断：运行到末尾的只会不发送任何内容。

#### 客户端断开连接

当客户端断开连接，甚至在第一个块之前，Nest 都会停止流，以防止为无人运行付费的 LLM 调用：

- `ReadableStream` 或 `Response` 的主体被取消，这会立即调用其 `cancel()`；
- Node.js `Readable` 被销毁；
- 异步生成器的 `return()` 被调用，它会运行其 `finally` 块。

```typescript
@Get('story')
async *story() {
  const llm = await this.llm.connect();
  try {
    for await (const token of llm.stream('Tell me a story')) {
      yield token;
    }
  } finally {
    await llm.close();
  }
}

```

> warning **警告** JavaScript 会将 `return()` 排队，直到异步生成器的下一个 `yield`，因此在一个 `await` 中等待的生成器仅在该 `await` 稳定后才停止。如果上游可能长时间静默，请使用 `ReadableStream`，其 `cancel()` 会立即运行。

停止流并不总是停止为其提供数据源的进程。例如，取消 AI SDK `toTextStreamResponse()` 的 `Response` 会使模型调用运行到结束并产生费用，除非中止其 `abortSignal`。要实现在客户端离开时停止调用，请从 `cancel()` 中中止它：

```typescript
@Post('chat')
chat(@Body() { messages }: ChatDto) {
  const abort = new AbortController();
  const answer = streamText({ model, messages, abortSignal: abort.signal });
  const reader = answer.textStream.getReader();
  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
    cancel() {
      abort.abort();
    },
  });
}

```

检查库提供的任何 `Response`。

#### 慢速客户端

下一个数据块仅在客户端可以接收时才被读取，因此读取缓慢的客户端会减慢提供者而非填满服务器内存。一个异步生成器会停在其 `yield` 处暂停，并且不会调用 `ReadableStream` 的 `pull()`。

Nest 和客户端之间仍可能保留数据块。[compression](/http/compression) 中间件和 nginx 等代理会缓冲响应：对于 nginx，设置 `X-Accel-Buffering: no` 头部。

#### HEAD 请求

`HEAD` 请求不读取流：生成器甚至不会启动，并且 `ReadableStream` 会被取消。状态和头部像往常一样发送，但由于第一个数据块从未被读取，依赖默认 `Content-Type` 的路由会返回 `application/octet-stream`。如果重要，请使用 `@Header()` 设置它。

#### 拦截器

[interceptor](/overview/interceptors) 将流视为单个值，该值在流开始前到达拦截器。因此，其 `finalize()` 和 `timeout()` 在流完成前就结束了，拦截器看不到数据块。

流不能作为其他事物的组成部分发送。如果拦截器将其放入一个普通对象中，或者像全局拦截器那样将每个结果放在一个 `data` 键下，Nest 会发送它找到的流，而其他路由会保留其包装。Nest 只查找一层深度：嵌套更深或由类实例持有的流会被像任何其他值一样进行 序列化。拦截器还可以：

- 传递它，如 `tap()` 所示；
- 用另一个流替换它，例如读取第一个并修改每个数据块的流；
- 返回任何其他值，例如通知或 `null`，Nest 会发送该值。

一个拦截器将其转换为普通值的流（例如进行 JSON 往返）将作为该值发送：异步生成器为空 JSON 对象或一个 `ReadableStream`。未发送的处理程序流在响应结束后停止，因此拦截器不能在之后继续读取它。

`ClassSerializerInterceptor` 和 `StandardSchemaSerializerInterceptor` 用一个流替换了原始流，该流在产生每个对象时对其进行 [serializes](/application/serialization)，因此 `@Exclude()`、`@Expose()` 组、`@Transform()` 和模式应用于每一行 JSON。字符串和二进制数据块按原样发送，也包括 `Response` 和未处于对象模式的 Node.js `Readable`，并且在没有模式的路由上，`StandardSchemaSerializerInterceptor` 会保持流不变。

在它们外部绑定的拦截器会接收到一个异步可迭代对象，而不是一个 `ReadableStream` 或一个对象模式的 `Readable`。客户端断开连接和 `HEAD` 请求会像没有这些拦截器时一样停止处理程序的流。如果一个对象因为 `@Transform()` 抛出或对象不匹配模式而无法 序列化，它会像任何其他 [error](/http/streaming-responses#errors) 一样使流失败：在第一个数据块之前返回 500，并在之后关闭连接。

#### 使用 @Res() 的处理程序

注入响应并使用 `@Res()` 的处理程序会自行发送响应，因此 Nest 会忽略其返回值，生成器永远不会启动。使用 `@Res()` 的 `passthrough` 选项时，返回的流会像往常一样发送。

#### 选择流式传输方式

- **流**，如此处所述，用于任何随时间产生、任何格式的内容，通过 `fetch()` 读取。
- [**`@Sse()`**](/http/server-sent-events) 用于从 `Observable` 发送到 `EventSource` 的事件，带有事件 ID 和允许的重连。
- [**`StreamableFile`**](/techniques/streaming-files) 用于文件，带有其 `Content-Disposition` 和 `Content-Length`。