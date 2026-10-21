<!-- 此文件从 content/microservices/nats.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T09:50:08.587Z -->
<!-- 源文件: content/microservices/nats.md -->
<!-- 源哈希: 0121fed66bb2bdf693a421306b3de07d -->

### NATS

[NATS](https://nats.io) 是一个简单、安全且高性能的开源消息系统，适用于云原生应用、IoT 消息传递和微服务架构。NATS 服务器使用 Go 编写，并为数十种主流编程语言提供了客户端库。NATS 同时支持 **至多一次** 和 **至少一次** 投递。它可以在任何地方运行，从大型服务器和云实例到边缘网关和物联网设备。

#### 安装

要开始构建基于 NATS 的微服务，首先安装所需的包：

```bash
$ npm i --save @nats-io/transport-node

```

> warning **警告** 从 NestJS v12 开始，NATS 传输器面向 **NATS v3**，并使用 `@nats-io/transport-node` 驱动。如果你是从较早版本升级，请卸载旧的 `nats` 包（`npm uninstall nats`），改为安装 `@nats-io/transport-node`。详情请参阅 [migration guide](/migration-guide#nats-v3)。

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

> info **提示** `Transport` 枚举从 `@nestjs/microservices` 包导入。

#### 选项

`options` 对象特定于所选的传输器。<strong>NATS</strong> 传输器暴露了 [NATS connection options](https://github.com/nats-io/nats.js/blob/main/core/README.md#connecting-to-a-nats-server)，以及以下属性：

<table>
  <tr>
    <td><code>queue</code></td>
    <td>你的服务器订阅时使用的队列组（留空 <code>undefined</code> 以忽略此设置）。在 <a href="/microservices/nats#queue-groups">下方</a>阅读更多关于 NATS 队列组的内容。</td>
  </tr>
  <tr>
    <td><code>gracefulShutdown</code></td>
    <td>启用优雅关闭。启用后，服务器首先从所有主题取消订阅，然后等待 <code>gracePeriod</code> 后再关闭连接。默认为 <code>false</code>。</td>
  </tr>
  <tr>
    <td><code>gracePeriod</code></td>
    <td>当启用 <code>gracefulShutdown</code> 时，从所有主题取消订阅后等待的时间（毫秒）。默认为 <code>10000</code> 毫秒。</td>
  </tr>
  <tr>
    <td><code>headers</code></td>
    <td>添加到客户端发送的每条消息的头部（参见 <a href="/microservices/nats#record-builders">记录构建器</a>）。</td>
  </tr>
</table>

#### 客户端

与其他微服务传输器一样，你有 <a href="/microservices/basics#client-producer-class">多种选项</a> 来创建 NATS `ClientProxy` 实例。

创建实例的一种方式是使用 `ClientsModule`。导入它并使用其 `register()` 方法，传入一个选项对象，其属性与上面为 `createMicroservice()` 方法展示的相同，另外再加一个 `name` 属性用作注入令牌。在概述的 <a href="/microservices/basics#client-producer-class">客户端部分</a> 中阅读更多关于 `ClientsModule` 的内容。

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

你也可以使用 `ClientProxyFactory` 或 `@Client()` 装饰器创建客户端。两者都在概述的 <a href="/microservices/basics#client-producer-class">客户端部分</a> 中进行了描述。

#### 请求-响应

对于 [request-response](/microservices/basics#请求-响应) 消息风格，NATS 传输器不使用内置的 NATS [Request-Reply](https://docs.nats.io/nats-concepts/reqreply) API。相反，客户端使用 `publish()` 方法和一个唯一的回复主题名称，在给定主题上发布一个 "request"。响应者监听该主题并将响应发送到回复主题。回复主题会动态路由回请求者，无论双方位于何处。

#### 基于事件

对于 [event-based](/microservices/basics#event-based) 消息风格，NATS 传输器使用内置的 NATS [Publish-Subscribe](https://docs.nats.io/nats-concepts/pubsub) 机制。发布者在某个主题上发送消息，所有监听该主题的活动订阅者都会收到该消息。订阅者还可以注册对 [wildcard](#通配符) 主题的兴趣。这种一对多模式有时被称为扇出（fan-out）。

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

在更复杂的场景中，你可能需要关于传入请求的额外信息。使用 NATS 传输器，你可以访问 `NatsContext` 对象。

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: NatsContext) {
  console.log(`Subject: ${context.getSubject()}`);
}

```

> info **提示** `@Payload()`、`@Ctx()` 和 `NatsContext` 从 `@nestjs/microservices` 包导入。

#### 通配符

订阅可以针对一个明确的主题，也可以包含通配符。

```typescript
@MessagePattern('time.us.*')
getDate(@Payload() data: number[], @Ctx() context: NatsContext) {
  console.log(`Subject: ${context.getSubject()}`); // e.g. "time.us.east"
  return new Date().toLocaleTimeString(...);
}

```

#### 记录构建器

要配置消息选项，请使用 `NatsRecordBuilder` 类。它同时适用于请求-响应和基于事件的流程。例如，要添加一个 `x-version` 头部，请使用 `setHeaders()` 方法：

```typescript
import * as nats from '@nats-io/nats-core';

// somewhere in your code
const headers = nats.headers();
headers.set('x-version', '1.0.0');

const record = new NatsRecordBuilder(':cat:').setHeaders(headers).build();
this.client.send('replace-emoji', record).subscribe(...);

```

> info **提示** `NatsRecordBuilder` 类从 `@nestjs/microservices` 包导出。

在服务器端，你可以通过 `NatsContext` 读取这些头部：

```typescript
@MessagePattern('replace-emoji')
replaceEmoji(@Payload() data: string, @Ctx() context: NatsContext): string {
  const headers = context.getHeaders();
  return headers?.get('x-version') === '1.0.0' ? '🐱' : '🐈';
}

```

要为客户端发送的所有请求配置头部，请将它们作为选项传递给 `ClientProxyFactory`：

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

在记录上设置的头部优先于客户端级别的 `headers` 选项。

从 NestJS v12.1.3 开始，消息处理器也可以返回一个记录。Nest 将记录数据作为回复发送，并将记录头部作为回复消息的头部：

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

从 NestJS v12 开始，Nest 将 NATS 数据包序列化为 JSON 字符串，自定义 NATS 反序列化器接收完整的 NATS 消息对象，而不是原始的 `Uint8Array`。如果你编写了自定义反序列化器，请通过 `msg.json()` 读取负载，而不是手动解码字节：

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

要获取连接和底层驱动实例状态的实时更新，请订阅 `status` 流。此流提供所选驱动特定的状态更新。对于 NATS 驱动，`status` 流会发出 `connected`、`disconnected` 和 `reconnecting` 事件。

```typescript
this.client.status.subscribe((status: NatsStatus) => {
  console.log(status);
});

```

> info **提示** `NatsStatus` 类型从 `@nestjs/microservices` 包中导入。

同样，你可以订阅服务器的 `status` 流以接收有关服务器状态的通知。

```typescript
const server = app.connectMicroservice<MicroserviceOptions>(...);
server.status.subscribe((status: NatsStatus) => {
  console.log(status);
});

```

#### 监听 NATS 事件

在某些情况下，你可能希望监听微服务发出的内部事件。NATS 传输器会发出 `disconnect`、`reconnect` 和 `update`（集群服务器添加或移除）事件。例如，你可以监听 `disconnect` 事件，以便在连接丢失时触发额外的操作。为此，请使用 `on()` 方法，如下所示：

```typescript
this.client.on('disconnect', (serverUrl) => {
  console.error(`Disconnected from ${serverUrl}`);
});

```

同样，你可以监听服务器的内部事件：

```typescript
server.on<NatsEvents>('disconnect', (serverUrl) => {
  console.error(`Disconnected from ${serverUrl}`);
});

```

> info **提示** `NatsEvents` 类型从 `@nestjs/microservices` 包中导入。

#### 访问底层驱动

对于更高级的用例，你可能需要访问底层驱动实例，例如手动关闭连接或使用驱动特定的方法。然而，在大多数情况下，你**不应该需要**直接访问驱动。

为此，请使用 `unwrap()` 方法，它会返回底层驱动实例。泛型类型参数指定你期望的驱动实例类型。

```typescript
const natsConnection =
  this.client.unwrap<import('@nats-io/transport-node').NatsConnection>();

```

同样，你可以访问服务器的底层驱动实例：

```typescript
const natsConnection =
  server.unwrap<import('@nats-io/transport-node').NatsConnection>();

```