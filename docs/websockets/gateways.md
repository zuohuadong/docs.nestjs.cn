<!-- 此文件从 content/websockets/gateways.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:13:17.999Z -->
<!-- 源文件: content/websockets/gateways.md -->
<!-- 源哈希: fb2a998bb8a2851e22699db6552df7fe -->

### 网关

文档其他部分讨论的大多数概念，例如依赖注入、装饰器、异常过滤器、管道、守卫和拦截器，同样适用于网关。在可能的情况下，Nest 会抽象实现细节，使得相同的组件可以在基于 HTTP 的平台、WebSocket 和微服务之间运行。本节涵盖了 Nest 中特定于 WebSocket 的方面。

> info **提示** 要实现带有认证套接字、房间和消息历史记录的完整聊天后端，请遵循 [Build a real-time chat backend in Node.js](/tutorials/realtime-chat)。

在 Nest 中，网关是一个用 `@WebSocketGateway()` 装饰器注解的类。网关是平台无关的，因此只要存在相应的适配器，它就能与任何 WebSocket 库一起工作。Nest 原生支持两个 WebSocket 平台：[socket.io](https://github.com/socketio/socket.io) 和 [ws](https://github.com/websockets/ws)。选择最适合您需求的那个。您也可以遵循 [adapters guide](/websockets/adapter) 构建自己的适配器。

<figure><img class="illustrative-image" src="/assets/Gateways_1.png" /></figure>

> info **提示** 网关是 [providers](/overview/providers)：它们可以通过类构造函数注入依赖项，其他类（提供者和控制器）也可以注入它们。

#### 安装

要开始构建基于 WebSocket 的应用程序，首先安装所需的包：

```bash
$ npm i --save @nestjs/websockets @nestjs/platform-socket.io

```

#### 概述

默认情况下，每个网关监听与 **HTTP 服务器** 相同的端口。要使用不同的端口，请将其作为装饰器的第一个参数传递，例如 `@WebSocketGateway(80)`，其中 `80` 是所选的端口号。您还可以设置网关使用的 [namespace](https://socket.io/docs/v4/namespaces/)：

```typescript
@WebSocketGateway(80, { namespace: 'events' })

```

> warning **警告** 网关在它们被现有模块的提供者数组引用之前不会被实例化。

`@WebSocketGateway()` 装饰器的第二个参数将任何支持的 [server option](https://socket.io/docs/v4/server-options/) 传递给套接字服务器构造函数。如果您不需要自定义端口，请将选项对象作为唯一参数传递。

```typescript
@WebSocketGateway(81, { transports: ['websocket'] })

```

网关现在正在监听，但尚未订阅任何传入消息。让我们创建一个订阅 `events` 消息并使用相同的数据向客户端响应的处理程序。

```typescript title="events.gateway.ts"
@SubscribeMessage('events')
handleEvent(@MessageBody() data: string): string {
  return data;
}

```

> info **提示** `@SubscribeMessage()` 和 `@MessageBody()` 装饰器是从 `@nestjs/websockets` 包导入的。

创建网关后，将其注册到模块中。

```typescript title="events.module.ts"
import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway.js';

@Module({
  providers: [EventsGateway]
})
export class EventsModule {}

```

您还可以向 `@MessageBody()` 装饰器传递一个属性键，以从传入消息体中提取该属性：

```typescript title="events.gateway.ts"
@SubscribeMessage('events')
handleEvent(@MessageBody('id') id: number): number {
  // id === messageBody.id
  return id;
}

```

如果您更喜欢不使用装饰器，以下代码在功能上是等效的：

```typescript title="events.gateway.ts"
@SubscribeMessage('events')
handleEvent(client: Socket, data: string): string {
  return data;
}

```

在上面的示例中，`handleEvent()` 方法接受两个参数。第一个是特定于平台的 [socket instance](https://socket.io/docs/v4/server-api/#socket)，第二个是从客户端接收到的数据。这种方法不推荐，因为它需要在每个单元测试中模拟 `socket` 实例。

当收到 `events` 消息时，处理程序会发送一个确认，其中包含通过网络发送的相同数据。您也可以使用库特定的 API 发送消息，例如 `client.emit()` 方法。要访问已连接的套接字实例，请使用 `@ConnectedSocket()` 装饰器。

```typescript title="events.gateway.ts"
@SubscribeMessage('events')
handleEvent(
  @MessageBody() data: string,
  @ConnectedSocket() client: Socket,
): string {
  return data;
}

```

> info **提示** `@ConnectedSocket()` 装饰器是从 `@nestjs/websockets` 包导入的。

然而，您直接通过套接字发出的消息会绕过拦截器，拦截器只看到处理程序的返回值。如果您不希望响应客户端，请省略 `return` 语句（或返回 `null` 或 `undefined`）。其他假值，例如 `false` 或 `0`，仍会作为响应发送。

当客户端按如下方式发出消息时，会执行 `handleEvent()` 方法：

```typescript
socket.emit('events', { name: 'Nest' });

```

要接收处理程序发送的响应，客户端必须附加相应的确认回调：

```typescript
socket.emit('events', { name: 'Nest' }, (data) => console.log(data));

```

从消息处理程序返回一个值会隐式发送确认，但高级场景通常需要对确认回调进行直接控制。

`@Ack()` 参数装饰器将 `ack` 回调函数直接注入到消息处理程序中。当您使用它时，Nest 不会根据返回值发送确认，因此您必须自己调用 `ack()`。如果没有该装饰器，回调将作为方法的第三个参数传递。

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

确认只发送一次，而原生 WebSocket 实现不支持此功能。为解决这些限制，请返回一个包含两个属性的对象：`event`，即已发出事件的名称，以及 `data`，即转发给客户端的有效载荷。

```typescript title="events.gateway.ts"
@SubscribeMessage('events')
handleEvent(@MessageBody() data: unknown): WsResponse<unknown> {
  const event = 'events';
  return { event, data };
}

```

> info **提示** `WsResponse` 接口是从 `@nestjs/websockets` 包导入的。

> warning **警告** 如果您的 `data` 字段依赖于 `ClassSerializerInterceptor`，请返回实现 `WsResponse` 的类实例，因为拦截器会忽略纯 JavaScript 对象响应。

要接收传入的响应，客户端必须添加另一个事件监听器。

```typescript
socket.on('events', (data) => console.log(data));

```

#### 异步响应

消息处理程序可以同步或**异步**响应，因此支持 `async` 方法。消息处理程序还可以返回一个 `Observable`，在这种情况下，直到流完成，每个发出的值都会发送到客户端。

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

在上面的示例中，消息处理程序响应了 **3 次**（数组中每个元素一次）。

#### 生命周期钩子

网关支持三个生命周期钩子。每个钩子都有一个相应的接口，如下表所示：

<table>
  <tr>
    <td>
      <code>OnGatewayInit</code>
    </td>
    <td>
      需要 <code>afterInit()</code> 方法，该方法接收库特定的服务器实例作为参数。
    </td>
  </tr>
  <tr>
    <td>
      <code>OnGatewayConnection</code>
    </td>
    <td>
      需要 <code>handleConnection()</code> 方法，该方法接收库特定的客户端套接字实例作为第一个参数。
    </td>
  </tr>
  <tr>
    <td>
      <code>OnGatewayDisconnect</code>
    </td>
    <td>
      需要 <code>handleDisconnect()</code> 方法，该方法接收库特定的客户端套接字实例作为第一个参数。
    </td>
  </tr>
</table>

> info **提示** 每个生命周期接口都从 `@nestjs/websockets` 包中暴露。

> warning **警告** Nest 在处理客户端消息之前不会等待异步 `handleConnection()` 完成，因此该钩子不是一个网关：在客户端断开连接之前到达的消息仍然会被处理。要检查每条消息，请将 [guards](/websockets/guards) 绑定到消息处理程序。要在处理任何消息之前拒绝客户端，请使用连接级别的中间件：socket.io 的 `server.use()` 在 `afterInit()` 中，或者使用 `WsAdapter`，在 `@WebSocketGateway()` 选项中的 `verifyClient` 函数。

#### 服务器和命名空间

偶尔，您可能需要直接访问原生的、**平台特定的**服务器实例。Nest 将其作为参数传递给 `afterInit()` 方法（`OnGatewayInit` 接口）。或者，使用 `@WebSocketServer()` 装饰器。

```typescript
@WebSocketServer()
server: Server;

```

您还可以检索相应的命名空间：

```typescript
@WebSocketGateway({ namespace: 'my-namespace' })
export class EventsGateway {
  @WebSocketServer()
  namespace: Namespace;
}

```

`@WebSocketServer()` 装饰器根据 `@WebSocketGateway()` 装饰器存储的元数据注入服务器实例。如果您向 `@WebSocketGateway()` 传递 `namespace` 选项，`@WebSocketServer()` 将注入一个 `Namespace` 实例而不是一个 `Server` 实例。

> warning **注意** `@WebSocketServer()` 装饰器是从 `@nestjs/websockets` 包中导入的。

Nest 在服务器实例准备好使用后将其分配给此属性。

<app-banner-enterprise></app-banner-enterprise>

#### 请求作用域网关

从 NestJS v12 开始，网关支持 [request-scoped](/fundamentals/provider-scopes) 提供者。Nest 为每个连接的套接字创建每个请求作用域依赖的新实例。该实例在连接期间存在，因此可以安全地保存每连接的状态。

使用 `REQUEST` 令牌注入套接字本身，方法与将 HTTP 请求注入到请求作用域 HTTP 提供者中相同：

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

  handleConnection(client: Socket) {
    client.emit('connected', this.connectionState.next());
  }

  @SubscribeMessage('state')
  onState() {
    return { event: 'state', data: this.connectionState.next() };
  }
}

```

由于作用域与连接相关而不是与单个消息相关，上述 `sequence` 计数器在该套接字接收到的每条消息上都会递增，而第二个客户端会获得其独立的实例。当套接字断开连接时，Nest 会销毁请求作用域的实例。

> warning **注意** 与 HTTP 一样，请求作用域提供者会增加每连接的实例化开销。除非需要每连接状态，否则请使用默认的单例作用域。

#### 示例

可在一个可用的示例中找到 [02-gateways sample](https://github.com/nestjs/nest/tree/master/sample/02-gateways)。