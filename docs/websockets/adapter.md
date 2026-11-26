<!-- 此文件从 content/websockets/adapter.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:13:16.856Z -->
<!-- 源文件: content/websockets/adapter.md -->
<!-- 源哈希: 95d16662a0234d324c3dca340dc2ba11 -->

### 适配器

WebSockets 模块是平台无关的，因此您可以通过实现 `WebSocketAdapter` 接口来引入您自己的库（甚至原生实现）。该接口要求实现下表中的方法：

<table>
  <tr>
    <td><code>create</code></td>
    <td>根据传入的参数创建一个 socket 服务器实例</td>
  </tr>
  <tr>
    <td><code>bindClientConnect</code></td>
    <td>绑定客户端连接事件</td>
  </tr>
  <tr>
    <td><code>bindClientDisconnect</code></td>
    <td>绑定客户端断开连接事件（可选）</td>
  </tr>
  <tr>
    <td><code>bindMessageHandlers</code></td>
    <td>将传入消息绑定到相应的消息处理程序</td>
  </tr>
  <tr>
    <td><code>close</code></td>
    <td>终止服务器实例</td>
  </tr>
</table>

#### 扩展 socket.io

[socket.io](https://github.com/socketio/socket.io) 包被包装在一个 `IoAdapter` 类中。您可以扩展此类以增强适配器的基本功能。例如，假设您的应用程序需要在多个负载均衡的 Web 服务实例之间广播事件。为此，请扩展 `IoAdapter` 并重写负责实例化新 socket.io 服务器的单个方法。首先，安装所需的包。

> warning **警告** 要使用多个负载均衡实例的 socket.io，您必须在客户端的 socket.io 配置中设置 `transports: ['websocket']` 来禁用轮询，或在负载均衡器中启用基于 Cookie 的路由（粘性会话）。仅使用 Redis 是不够的。有关更多信息，请参阅 socket.io 文档中的 [Enabling sticky session](https://socket.io/docs/v4/using-multiple-nodes/#enabling-sticky-session)。

```bash
$ npm i --save redis socket.io @socket.io/redis-adapter

```

安装包后，创建一个 `RedisIoAdapter` 类。

```typescript
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;

  async connectToRedis(): Promise<void> {
    const pubClient = createClient({ url: `redis://localhost:6379` });
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}

```

然后切换到新创建的 Redis 适配器。

```typescript
const app = await NestFactory.create(AppModule);
const redisIoAdapter = new RedisIoAdapter(app);
await redisIoAdapter.connectToRedis();

app.useWebSocketAdapter(redisIoAdapter);

```

#### Ws 库

另一个可用的适配器是 `WsAdapter`，它充当框架与快速、经过充分测试的 [ws](https://github.com/websockets/ws) 库之间的代理。此适配器与原生浏览器 WebSockets 完全兼容，并且比 socket.io 包更快。然而，它开箱即用的功能要少得多，这对于许多应用程序来说不是问题。

> info **提示** `ws` 库不支持命名空间（由 `socket.io` 普及的通信通道），并且如果设置了 `namespace` 选项，`WsAdapter` 会抛出错误。要模拟此功能，请在不同路径上挂载多个 `ws` 服务器（例如 `@WebSocketGateway({ path: '/users' })`）。

要使用 `ws`，首先安装所需的包：

```bash
$ npm i --save @nestjs/platform-ws

```

安装包后，切换适配器：

```typescript
const app = await NestFactory.create(AppModule);
app.useWebSocketAdapter(new WsAdapter(app));

```

> info **提示** `WsAdapter` 从 `@nestjs/platform-ws` 导入。

`WsAdapter` 处理 `{ event: string, data: any }` 格式的消息。要接收和处理不同格式的消息，请配置一个消息解析器将其转换为此格式。

```typescript
const wsAdapter = new WsAdapter(app, {
  // To handle messages in the [event, data] format
  messageParser: (data) => {
    const [event, payload] = JSON.parse(data.toString());
    return { event, data: payload };
  },
});

```

或者，您可以在创建适配器后使用 `setMessageParser()` 方法设置消息解析器。

当网关共享应用程序的 HTTP 服务器时，其他 `upgrade` 监听器可以在该服务器上提供自己的路径，例如 [GraphQL subscriptions](/graphql/subscriptions)。`WsAdapter` 会为其网关未服务的路径留下升级请求，如果在一秒内没有网关响应握手，则关闭连接。当它是唯一的 `upgrade` 监听器时，会立即关闭此类请求。如果另一个监听器延迟响应，例如在认证请求后，请使用 `unclaimedUpgradeTimeout` 选项（毫秒）增加延迟，或设置为 `0` 将此类连接留给其他监听器。非数字值，例如 `NaN`（由 `Number()` 对未设置的环境变量产生的）将使用默认值。要等待五秒：

```typescript
const wsAdapter = new WsAdapter(app, {
  unclaimedUpgradeTimeout: 5000,
});

```

当应用程序关闭时（`app.close()`，或启用 [shutdown hooks](/fundamentals/lifecycle-events#application-shutdown) 后的系统信号），`WsAdapter` 会一次性断开所有客户端，因此仍在处理中的消息回复会丢失。

使用 `gracefulShutdown` 选项，它会先让该工作完成。它停止接受新连接（到应用程序 HTTP 服务器的网关的升级请求会收到 `503` 响应）和来自已连接客户端的新消息。一旦客户端发送的消息得到处理并发送了回复，它会使用关闭代码 `1001` ("Going Away") 关闭客户端连接。`gracePeriod` 选项设置了最长可能花费的时间（毫秒）（默认值：`10000`）；在此之后仍连接的客户端将被断开连接，并记录警告。返回一个永不完成的流的处理程序仍在处理中，因此其客户端只有在此时才会被断开连接。

```typescript
app.useWebSocketAdapter(
  new WsAdapter(app, {
    gracefulShutdown: true,
    gracePeriod: 30000,
  }),
);

```

> info **提示** 在使用 `NestFactory.create()` 创建的应用程序中，网关在运行了 `onModuleDestroy()` 和 `beforeApplicationShutdown()` 钩子之后、调用 `onApplicationShutdown()` 之前关闭。请在 `onApplicationShutdown()` 中释放消息处理程序使用的资源，例如数据库连接。

#### 限制

内置适配器都限制同一时间处理的客户端消息数量，默认为 1000：`IoAdapter` 分别计数每个事件，`WsAdapter` 将一个客户端的所有消息一起计数。后续消息会等待轮到。使用 `maxConcurrentMessages` 选项更改限制，或设置为 `Infinity` 以解除限制（使用 `0`，不处理任何消息）。

`IoAdapter` 还限制等待的消息数量：如果一个客户端等待的某个事件消息超过 10000 条，则会断开连接并记录警告。使用 `maxWaitingMessages` 选项更改此设置，或设置为 `Infinity` 以解除限制。

```typescript
app.useWebSocketAdapter(
  new IoAdapter(app, {
    maxConcurrentMessages: 100,
    maxWaitingMessages: 1000,
  }),
);

```

`WsAdapter` 还会设置另外两个限制：

- `maxPayload`：客户端可发送的最大消息大小（字节）（默认值：1 MiB；在 NestJS v12.5 之前，应用了 100 MiB 的 `ws` 默认值）。发送更大消息的客户端将使用关闭代码 `1009` 被断开连接。网关的 `maxPayload` 选项优先。将其设置为 `0` 以解除限制。
- `maxSendBufferSize`：对于在发送消息前未读取消息的客户端，可以排队的字节数（默认值：128 MiB）。将其设置为 `0` 以解除限制。

```typescript
app.useWebSocketAdapter(
  new WsAdapter(app, {
    maxPayload: 10 * 1024 * 1024,
  }),
);

```

非数字值，例如 `NaN`（由 `Number()` 对未设置的环境变量产生的），将使用其默认值。

`IoAdapter` 以及继承它的任何类，如果消息引用了相同的二进制值（一个 `Buffer`、一个 `ArrayBuffer` 或其视图，或一个 `Blob`）超过一次，也会断开客户端连接并记录警告。Socket.IO 客户端不会发送此类消息。

#### 高级（自定义适配器）

为了演示目的，我们将手动集成 [ws](https://github.com/websockets/ws) 库。如前所述，该库已存在适配器：从 `@nestjs/platform-ws` 包中导出的 `WsAdapter` 类。一个简化的实现可能如下所示：

```typescript title="ws-adapter.ts"
import WebSocket, { WebSocketServer } from 'ws';
import { WebSocketAdapter, INestApplicationContext } from '@nestjs/common';
import { MessageMappingProperties } from '@nestjs/websockets';
import { Observable, fromEvent, EMPTY } from 'rxjs';
import { mergeMap, filter } from 'rxjs/operators';

export class WsAdapter implements WebSocketAdapter {
  constructor(private app: INestApplicationContext) {}

  create(port: number, options: any = {}): any {
    return new WebSocketServer({ port, ...options });
  }

  bindClientConnect(server: WebSocketServer, callback: (...args: any[]) => void) {
    server.on('connection', callback);
  }

  bindMessageHandlers(
    client: WebSocket,
    handlers: MessageMappingProperties[],
    process: (data: any) => Observable<any>,
  ) {
    fromEvent(client, 'message')
      .pipe(
        mergeMap(data => this.bindMessageHandler(data, handlers, process)),
        filter(result => result),
      )
      .subscribe(response => client.send(JSON.stringify(response)));
  }

  bindMessageHandler(
    buffer: any,
    handlers: MessageMappingProperties[],
    process: (data: any) => Observable<any>,
  ): Observable<any> {
    const message = JSON.parse(buffer.data);
    const messageHandler = handlers.find(
      handler => handler.message === message.event,
    );
    if (!messageHandler) {
      return EMPTY;
    }
    return process(messageHandler.callback(message.data));
  }

  close(server: WebSocketServer) {
    server.close();
  }
}

```

> info **提示** 要使用 [ws](https://github.com/websockets/ws) 库，请使用内置的 `WsAdapter`，而不是创建自己的适配器。

然后使用 `useWebSocketAdapter()` 方法设置自定义适配器：

```typescript title="main.ts"
const app = await NestFactory.create(AppModule);
app.useWebSocketAdapter(new WsAdapter(app));

```

#### 示例

一个使用 `WsAdapter` 的工作示例可在 [16-gateways-ws sample](https://github.com/nestjs/nest/tree/master/sample/16-gateways-ws) 中找到。