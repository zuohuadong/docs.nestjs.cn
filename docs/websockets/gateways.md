<!-- 此文件从 content/websockets/gateways.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T09:50:09.633Z -->
<!-- 源文件: content/websockets/gateways.md -->
<!-- 源哈希: 20cd530167445625ca2543ebb71397a8 -->

### 网关

本文档其他部分讨论的大多数概念，例如依赖注入、装饰器、异常过滤器、管道、守卫和拦截器，同样适用于网关。在可能的情况下，Nest 抽象了实现细节，以便相同的组件可以在基于 HTTP 的平台、WebSockets 和微服务上运行。本节介绍 Nest 中特定于 WebSockets 的方面。

在 Nest 中，网关只是一个使用 `@WebSocketGateway()` 装饰器注解的类。从技术上讲，网关是与平台无关的，这使得它们一旦创建了适配器，就能与任何 WebSockets 库兼容。开箱即用地支持两个 WS 平台：[socket.io](https://github.com/socketio/socket.io) 和 [ws](https://github.com/websockets/ws)。您可以选择最适合您需求的平台。此外，您还可以按照此 [guide](/websockets/adapter) 构建自己的适配器。

<figure><img class="illustrative-image" src="/assets/Gateways_1.png" /></figure>

> info **提示** 网关可以被视为 [providers](/overview/providers)；这意味着它们可以通过类构造函数注入依赖项。此外，网关也可以被其他类（提供者和控制器）注入。

#### 安装

要开始构建基于 WebSockets 的应用程序，首先安装所需的包：

```bash
$ npm i --save @nestjs/websockets @nestjs/platform-socket.io

```

#### 概述

通常，每个网关都监听与 **HTTP 服务器** 相同的端口，除非您的应用不是 Web 应用程序，或者您手动更改了端口。可以通过向 `@WebSocketGateway(80)` 装饰器传递参数来修改此默认行为，其中 `80` 是所选的端口号。您还可以使用以下构造设置网关使用的 [namespace](https://socket.io/docs/v4/namespaces/)：

```typescript
@WebSocketGateway(80, { namespace: 'events' })

```

> warning **警告** 网关只有在现有模块的提供者数组中被引用时才会被实例化。

您可以向 `@WebSocketGateway()` 装饰器的第二个参数传递任何受支持的 [option](https://socket.io/docs/v4/server-options/) 给 socket 构造函数，如下所示：

```typescript
@WebSocketGateway(81, { transports: ['websocket'] })

```

网关现在正在监听，但我们尚未订阅任何传入消息。让我们创建一个处理程序，它将订阅 `events` 消息，并用完全相同的数据响应用户。

```typescript title="events.gateway.ts"
@SubscribeMessage('events')
handleEvent(@MessageBody() data: string): string {
  return data;
}

```

> info **提示** `@SubscribeMessage()` 和 `@MessageBody()` 装饰器从 `@nestjs/websockets` 包中导入。

创建网关后，我们可以将其注册到我们的模块中。

```typescript
import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway.js';

@Module({
  providers: [EventsGateway]
})
export class EventsModule {}

```

您还可以向装饰器传递一个属性键，以从传入的消息体中提取它：

```typescript title="events.gateway.ts"
@SubscribeMessage('events')
handleEvent(@MessageBody('id') id: number): number {
  // id === messageBody.id
  return id;
}

```

如果您更倾向于不使用装饰器，以下代码在功能上是等效的：

```typescript title="events.gateway.ts"
@SubscribeMessage('events')
handleEvent(client: Socket, data: string): string {
  return data;
}

```

在上面的示例中，`handleEvent()` 函数接受两个参数。第一个是特定于平台的 [socket instance](https://socket.io/docs/v4/server-api/#socket)，第二个是从客户端接收的数据。不过，不建议使用这种方法，因为它需要在每个单元测试中模拟 `socket` 实例。

一旦收到 `events` 消息，处理程序就会发送一个确认，其中包含通过网络发送的相同数据。此外，还可以使用特定于库的方法来发送消息，例如，使用 `client.emit()` 方法。为了访问已连接的 socket 实例，请使用 `@ConnectedSocket()` 装饰器。

```typescript title="events.gateway.ts"
@SubscribeMessage('events')
handleEvent(
  @MessageBody() data: string,
  @ConnectedSocket() client: Socket,
): string {
  return data;
}

```

> info **提示** `@ConnectedSocket()` 装饰器从 `@nestjs/websockets` 包中导入。

但是，在这种情况下，您将无法利用拦截器。如果您不想响应用户，可以简单地跳过 `return` 语句（或显式返回一个“假值”，例如 `undefined`）。

现在，当客户端发出如下消息时：

```typescript
socket.emit('events', { name: 'Nest' });

```

`handleEvent()` 方法将被执行。为了监听从上述处理程序内部发出的消息，客户端必须附加一个相应的确认监听器：

```typescript
socket.emit('events', { name: 'Nest' }, (data) => console.log(data));

```

虽然从消息处理程序返回值会隐式地发送确认，但高级场景通常需要直接控制确认回调。

`@Ack()` 参数装饰器允许您将 `ack` 回调函数直接注入到消息处理程序中。
如果不使用该装饰器，此回调将作为方法的第三个参数传递。

```typescript title="events.gateway.ts"
@SubscribeMessage('events')
handleEvent(
  @MessageBody() data: string,
  @Ack() ack: (response: { status: string; data: string }) => void,
) {
  ack({ status: 'received', data });
}

```

#### 多次响应

确认只发送一次。此外，原生 WebSockets 实现不支持它。为了解决这个限制，您可以返回一个包含两个属性的对象。`event` 是发出的事件的名称，`data` 是必须转发给客户端的内容。

```typescript title="events.gateway.ts"
@SubscribeMessage('events')
handleEvent(@MessageBody() data: unknown): WsResponse<unknown> {
  const event = 'events';
  return { event, data };
}

```

> info **提示** `WsResponse` 接口从 `@nestjs/websockets` 包中导入。

> warning **警告** 如果您的 `data` 字段依赖于 `ClassSerializerInterceptor`，您应该返回一个实现 `WsResponse` 的类实例，因为它会忽略普通的 JavaScript 对象响应。

为了监听传入的响应，客户端必须应用另一个事件监听器。

```typescript
socket.on('events', (data) => console.log(data));

```

#### 异步响应

消息处理程序可以同步或**异步**响应。因此，支持 `async` 方法。消息处理程序还可以返回一个 `Observable`，在这种情况下，结果值将一直被发出，直到流完成。

```typescript title="events.gateway.ts"
@SubscribeMessage('events')
onEvent(@MessageBody() data: unknown): Observable<WsResponse<number>> {
  const event = 'events';
  const response = [1, 2, 3];

  return from(response).pipe(
    map(data => ({ event, data })),
  );
}

```

在上面的示例中，消息处理程序将响应 **3 次**（使用数组中的每个项）。

#### 生命周期钩子

有 3 个可用的生命周期钩子。它们都有对应的接口，并在下表中描述：

<table>
  <tr>
    <td>
      <code>OnGatewayInit</code>
    </td>
    <td>
      强制实现 <code>afterInit()</code> 方法。以库特定的服务器实例作为参数（如果需要，展开其余参数）。
    </td>
  </tr>
  <tr>
    <td>
      <code>OnGatewayConnection</code>
    </td>
    <td>
      强制实现 <code>handleConnection()</code> 方法。以库特定的客户端套接字实例作为参数。
    </td>
  </tr>
  <tr>
    <td>
      <code>OnGatewayDisconnect</code>
    </td>
    <td>
      强制实现 <code>handleDisconnect()</code> 方法。以库特定的客户端套接字实例作为参数。
    </td>
  </tr>
</table>

> info **提示** 每个生命周期接口都从 `@nestjs/websockets` 包中导出。

#### 服务器与命名空间

有时，您可能希望直接访问原生的、**平台特定的**服务器实例。该对象的引用作为参数传递给 `afterInit()` 方法（`OnGatewayInit` 接口）。另一种选择是使用 `@WebSocketServer()` 装饰器。

```typescript
@WebSocketServer()
server: Server;

```

此外，您可以使用 `namespace` 属性检索相应的命名空间，如下所示：

```typescript
@WebSocketGateway({ namespace: 'my-namespace' })
export class EventsGateway {
  @WebSocketServer()
  namespace: Namespace;
}

```

`@WebSocketServer()` 装饰器通过引用 `@WebSocketGateway()` 装饰器存储的元数据来注入服务器实例。如果您向 `@WebSocketGateway()` 装饰器提供命名空间选项，`@WebSocketServer()` 装饰器将返回 `Namespace` 实例而不是 `Server` 实例。

> warning **注意** `@WebSocketServer()` 装饰器从 `@nestjs/websockets` 包中导入。

一旦服务器实例准备好使用，Nest 将自动将其分配给此属性。

<app-banner-enterprise></app-banner-enterprise>

#### 请求作用域的网关

从 NestJS v12 开始，网关支持 [request-scoped](/fundamentals/provider-scopes) 提供者。每个请求作用域的依赖都会为每个连接的套接字创建一个新实例，该实例的生命周期与连接相同——因此它可以安全地保存每个连接的状态。

使用 `REQUEST` 令牌注入套接字本身，就像在请求作用域的 HTTP 提供者中注入 HTTP 请求一样：

```typescript title="connection-state.service.ts"
import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Socket } from 'socket.io';

@Injectable({ scope: Scope.REQUEST })
export class ConnectionStateService {
  private sequence = 0;

  constructor(@Inject(REQUEST) private readonly client: Socket) {}

  next() {
    return { clientId: this.client.id, sequence: ++this.sequence };
  }
}

```

然后网关像注入任何其他提供者一样注入它：

```typescript title="events.gateway.ts"
@WebSocketGateway()
export class EventsGateway {
  constructor(private readonly connectionState: ConnectionStateService) {}

  handleConnection(@ConnectedSocket() client: Socket) {
    client.emit('connected', this.connectionState.next());
  }

  @SubscribeMessage('state')
  onState() {
    return { event: 'state', data: this.connectionState.next() };
  }
}

```

由于作用域与连接绑定而不是与单个消息绑定，上面的 `sequence` 计数器会在该套接字上收到的每条消息中递增，而第二个客户端会获得自己的独立实例。当套接字断开连接时，Nest 会销毁请求作用域的实例。

> warning **注意** 与 HTTP 一样，请求作用域的提供者会增加每个连接的实例化开销。除非您确实需要每个连接的状态，否则请使用默认的单例作用域。

#### 示例

一个可用的示例位于 [here](https://github.com/nestjs/nest/tree/master/sample/02-gateways)。