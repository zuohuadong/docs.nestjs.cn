<!-- 此文件从 content/microservices/nats.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:17:36.979Z -->
<!-- 源文件: content/microservices/nats.md -->
<!-- 源哈希: 4f7b6e7a00b21c553770f225bacfc53f -->

### NATS

[NATS](https://nats.io) 是一个简单、安全、高性能的开源消息系统，适用于云原生应用、物联网消息和微服务架构。NATS 服务器使用 Go 编写，并提供数十种主流编程语言的客户端库。NATS 支持 **至多一次** 和 **至少一次** 投递。它可以在任何地方运行，从大型服务器和云实例到边缘网关和物联网设备。

#### 安装

要开始构建基于 NATS 的微服务，首先安装所需的包：

```bash
$ npm i --save @nats-io/transport-node

```

> warning **警告** 从 NestJS v12 开始，NATS 传输器针对 **NATS v3** 并使用 `@nats-io/transport-node` 驱动。如果您是从早期版本升级，请卸载旧的 `nats` 包（`npm uninstall nats`），并安装 `@nats-io/transport-node`。详情请参阅 [migration guide](/migration-guide#nats-v3)。

#### 概述

要使用 NATS 传输器，请将以下选项对象传递给 `createMicroservice()` 方法：

```typescript title="main.ts"
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.NATS,
  options: {
    servers: ['nats://localhost:4222'],
  },
});

```

> info **提示** `Transport` 枚举是从 `@nestjs/microservices` 包导入的。

#### 选项

`options` 对象特定于所选的传输器。<strong>NATS</strong> 传输器暴露了 [NATS connection options](https://github.com/nats-io/nats.js/blob/main/core/README.md#connecting-to-a-nats-server)，以及以下属性：

<table>
  <tr>
    <td><code>queue</code></td>
    <td>您的服务器订阅的队列组（留空 <code>undefined</code> 以忽略此设置）。有关 NATS 队列组的更多信息请参阅 <a href="/microservices/nats#queue-groups">下方</a>。</td>
  </tr>
  <tr>
    <td><code>gracefulShutdown</code></td>
    <td>启用优雅关闭。启用后，服务器首先从所有主题取消订阅，然后等待正在处理的请求和事件后再关闭连接。默认为 <code>false</code>。</td>
  </tr>
  <tr>
    <td><code>gracePeriod</code></td>
    <td>当启用 <code>gracefulShutdown</code> 时，等待正在处理的请求和事件的最长时间（毫秒）。在此时间之前完成的，服务器会更早关闭。默认为 <code>10000</code> ms。</td>
  </tr>
  <tr>
    <td><code>headers</code></td>
    <td>添加到客户端发送的每个消息的头部（参见 <a href="/microservices/nats#record-builders">记录构建器</a>）。</td>
  </tr>
</table>

> info **提示** 返回一个永不完成的流的处理程序仍在被处理，因此关闭服务器将导致整个 `gracePeriod` 被阻塞。

#### 客户端

与其他微服务传输器一样，您有 <a href="/microservices/basics#client-producer-class">几种选项</a>来创建 NATS `ClientProxy` 实例。

创建实例的一种方法是使用 `ClientsModule`。导入它并使用其 `register()` 方法，传入一个选项对象，该对象具有上述相同的属性用于 `createMicroservice()` 方法，外加一个 `name` 属性用作注入令牌。有关 `ClientsModule` 的更多信息，请参阅概述的 <a href="/microservices/basics#client-producer-class">客户端部分</a>。

```typescript
@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'MATH_SERVICE',
        transport: Transport.NATS,
        options: {
          servers: ['nats://localhost:4222'],
        }
      },
    ]),
  ]
  ...
})

```

您也可以使用 `ClientProxyFactory` 或 `@Client()` 装饰器创建客户端。两者都在概述的 <a href="/microservices/basics#client-producer-class">客户端部分</a>中进行了描述。

#### 请求-响应

对于 [request-response](/microservices/basics#请求-响应) 消息风格，NATS 传输器不使用内置的 NATS [Request-Reply](https://docs.nats.io/nats-concepts/reqreply) API。相反，客户端使用 `publish()` 方法在一个给定主题上发布一个“请求”，并提供一个唯一的回复主题名称。响应者监听该主题，并将响应发送到回复主题。回复主题会动态路由回请求方，而与任一方的位置无关。

#### 基于事件

对于 [event-based](/microservices/basics#event-based) 消息风格，NATS 传输器使用内置的 NATS [Publish-Subscribe](https://docs.nats.io/nats-concepts/pubsub) 机制。发布者在一个主题上发送消息，所有监听该主题的活动订阅者都会收到该消息。订阅者还可以注册对 [wildcard](#通配符) 主题的兴趣。这种一对多的模式有时称为扇出（fan-out）。

#### 队列组

NATS 提供了一个名为 [distributed queues](https://docs.nats.io/nats-concepts/queue) 的内置负载均衡功能。要创建队列订阅，请按如下方式使用 `queue` 属性：

```typescript title="main.ts"
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.NATS,
  options: {
    servers: ['nats://localhost:4222'],
    queue: 'cats_queue',
  },
});

```

#### 上下文

在更复杂的场景中，您可能需要有关传入请求的附加信息。使用 NATS 传输器，您可以访问 `NatsContext` 对象。

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: NatsContext) {
  console.log(`Subject: ${context.getSubject()}`);
}

```

> info **提示** `@Payload()`、`@Ctx()` 和 `NatsContext` 是从 `@nestjs/microservices` 包导入的。

#### 通配符

订阅可以针对明确的主题，也可以包含通配符。

```typescript
@MessagePattern('time.us.*')
getDate(@Payload() data: number[], @Ctx() context: NatsContext) {
  console.log(`Subject: ${context.getSubject()}`); // e.g. "time.us.east"
  return new Date().toLocaleTimeString(...);
}

```

#### 记录构建器

要配置消息选项，请使用 `NatsRecordBuilder` 类。它适用于请求-响应和基于事件的流程。例如，要添加一个 `x-version` 头部，请使用 `setHeaders()` 方法：

```typescript
import * as nats from '@nats-io/nats-core';

// somewhere in your code
const headers = nats.headers();
headers.set('x-version', '1.0.0');

const record = new NatsRecordBuilder(':cat:').setHeaders(headers).build();
this.client.send('replace-emoji', record).subscribe(...);

```

> info **提示** `NatsRecordBuilder` 类是从 `@nestjs/microservices` 包导出的。

在服务器端，您可以通过 `NatsContext` 读取这些头部：

```typescript
@MessagePattern('replace-emoji')
replaceEmoji(@Payload() data: string, @Ctx() context: NatsContext): string {
  const headers = context.getHeaders();
  return headers?.get('x-version') === '1.0.0' ? '🐱' : '🐈';
}

```

要配置客户端发送的所有请求的头部，请将它们作为选项传递给 `ClientProxyFactory`：

```typescript
import { Module } from '@nestjs/common';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';

@Module({
  providers: [
    {
      provide: 'API_v1',
      useFactory: () =>
        ClientProxyFactory.create({
          transport: Transport.NATS,
          options: {
            servers: ['nats://localhost:4222'],
            headers: { 'x-version': '1.0.0' },
          },
        }),
    },
  ],
})
export class ApiModule {}

```

记录上设置的头部优先于客户端级别的 `headers` 选项。

从 NestJS v12.1.3 开始，消息处理程序也可以返回一个记录。Nest 将记录数据作为回复发送，并将记录头部作为回复消息的头部：

```typescript
import * as nats from '@nats-io/nats-core';

@MessagePattern('replace-emoji')
replaceEmoji() {
  const headers = nats.headers();
  headers.set('x-version', '1.0.0');

  return new NatsRecordBuilder(':cat:').setHeaders(headers).build();
}

```

#### 自定义序列化器和反序列化器

从 NestJS v12 开始，Nest 将 NATS 数据包序列化为 JSON 字符串，而自定义 NATS 反序列化器接收完整的 NATS 消息对象，而不是原始 `Uint8Array`。如果您编写了自定义反序列化器，请通过 `msg.json()` 读取有效载荷，而不是手动解码字节：

```typescript
import { Deserializer, IncomingRequest } from '@nestjs/microservices';

export class CustomNatsDeserializer implements Deserializer {
  deserialize(msg: any): IncomingRequest {
    // Previously: JSON.parse(new TextDecoder().decode(msg));
    return msg.json();
  }
}

```

#### 实例状态更新

要获取连接和底层驱动实例的实时更新，请订阅 `status` 流。此流提供特定于所选驱动的状态更新。对于 NATS 驱动，`status` 流会发出 `connected`、`disconnected` 和 `reconnecting` 事件。

```typescript
this.client.status.subscribe((status: NatsStatus) => {
  console.log(status);
});

```

> info **提示** `NatsStatus` 类型是从 `@nestjs/microservices` 包导入的。

类似地，您也可以订阅服务器的 `status` 流，以接收有关服务器状态的通知。

```typescript
const server = app.connectMicroservice<MicroserviceOptions>(...);
server.status.subscribe((status: NatsStatus) => {
  console.log(status);
});

```

#### 监听 NATS 事件

在某些情况下，您可能希望监听微服务发出的内部事件。NATS 传输器会发出 `disconnect`、`reconnect` 和 `update`（集群服务器添加或移除）事件。例如，您可以监听 `disconnect` 事件，以便在连接丢失时触发额外的操作。为此，请使用 `on()` 方法，如下所示：

```typescript
this.client.on('disconnect', (serverUrl) => {
  console.error(`Disconnected from ${serverUrl}`);
});

```

同样，您可以监听服务器的内部事件：

```typescript
server.on<NatsEvents>('disconnect', (serverUrl) => {
  console.error(`Disconnected from ${serverUrl}`);
});

```

> info **提示** `NatsEvents` 类型是从 `@nestjs/microservices` 包导入的。

#### 底层驱动访问

对于更高级的用例，您可能需要访问底层驱动实例，例如手动关闭连接或使用特定于驱动的方法。然而，在大多数情况下，您**不应该**直接访问驱动。

为此，请使用 `unwrap()` 方法，它返回底层驱动实例。泛型类型参数指定了您期望的驱动实例类型。

```typescript
const natsConnection =
  this.client.unwrap<import('@nats-io/transport-node').NatsConnection>();

```

类似地，您可以访问服务器的底层驱动实例：

```typescript
const natsConnection =
  server.unwrap<import('@nats-io/transport-node').NatsConnection>();

```