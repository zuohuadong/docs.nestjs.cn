<!-- 此文件从 content/microservices/nats.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:08:54.335Z -->
<!-- 源文件: content/microservices/nats.md -->
<!-- 源哈希: 4c54290d5e8ab0c4ac90f9643f293f30 -->

### NATS

[NATS](https://nats.io) 是一个简单、安全且高性能的开源消息系统，适用于云原生应用、物联网消息传递和微服务架构。NATS 服务器使用 Go 编程语言编写，但提供了数十种主流编程语言的客户端库来与服务器交互。NATS 支持**至多一次**和**至少一次**投递。它可以运行在任何地方，从大型服务器和云实例，到边缘网关，甚至物联网设备。

#### 安装

要开始构建基于 NATS 的微服务，首先安装所需的包：

```bash
$ npm i --save @nats-io/transport-node

```

> warning **警告** 从 NestJS v12 开始，NATS 传输器针对 **NATS v3**，并使用 `@nats-io/transport-node` 驱动程序。如果您从早期版本升级，请卸载旧的 `nats` 包（`npm uninstall nats`），并安装 `@nats-io/transport-node` 替代。详见 [migration guide](/migration-guide)。

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

`options` 对象特定于所选的传输器。<strong>NATS</strong> 传输器暴露了 [here](https://github.com/nats-io/nats.js/blob/main/core/README.md#connecting-to-a-nats-server) 中描述的属性以及以下属性：

<table>
  <tr>
    <td><code>queue</code></td>
    <td>您的服务器应订阅的队列（留空 undefined 以忽略此设置）。阅读更多关于 NATS 队列组的信息，请参见下文。
    </td> 
  </tr>
  <tr>
    <td><code>gracefulShutdown</code></td>
    <td>启用优雅关闭。启用后，服务器在关闭连接之前会先从所有频道取消订阅。默认值为 false。
  </tr>
  <tr>
    <td><code>gracePeriod</code></td>
    <td>取消订阅所有频道后等待服务器的时间（毫秒）。默认值为 10000 毫秒。
  </tr>
</table>

#### 客户端

与其他微服务传输器一样，您有<a href="/microservices/basics#客户端">多种选项</a>来创建 NATS `ClientProxy` 实例。

创建实例的一种方法是使用 `ClientsModule`。要使用 `ClientsModule` 创建客户端实例，请导入它并使用 `register()` 方法传递一个选项对象，该对象包含与上述 `createMicroservice()` 方法中相同的属性，以及一个用作注入令牌的 `name` 属性。阅读更多关于 `ClientsModule` 的信息，请参见<a href="/microservices/basics#客户端">此处</a>。

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

也可以使用其他创建客户端（`ClientProxyFactory` 或 `@Client()`）的选项。您可以<a href="/microservices/basics#客户端">在此</a>阅读关于它们的信息。

#### 请求-响应

对于**请求-响应**消息风格（[read more](/microservices/basics#请求-响应)），NATS 传输器不使用 NATS 内置的 [Request-Reply](https://docs.nats.io/nats-concepts/reqreply) 机制。相反，使用 `publish()` 方法在给定主题上发布“请求”，并带有唯一的回复主题名称，响应者监听该主题并将响应发送到回复主题。回复主题会动态地定向回请求者，无论双方位于何处。

#### 基于事件

对于**基于事件**的消息风格（[read more](/microservices/basics#event-based)），NATS 传输器使用 NATS 内置的 [Publish-Subscribe](https://docs.nats.io/nats-concepts/pubsub) 机制。发布者在主题上发送消息，任何监听该主题的活动订阅者都会收到消息。订阅者还可以注册对通配符主题的兴趣，这些主题的工作方式有点像正则表达式。这种一对多模式有时称为扇出。

#### 队列组

NATS 提供了一个内置的负载均衡功能，称为 [distributed queues](https://docs.nats.io/nats-concepts/queue)。要创建队列订阅，请使用 `queue` 属性，如下所示：

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

在更复杂的场景中，您可能需要访问有关传入请求的附加信息。使用 NATS 传输器时，您可以访问 `NatsContext` 对象。

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: NatsContext) {
  console.log(`Subject: ${context.getSubject()}`);
}

```

> info **提示** `@Payload()`、`@Ctx()` 和 `NatsContext` 从 `@nestjs/microservices` 包导入。

#### 通配符

订阅可以是显式主题，也可以包含通配符。

```typescript
@MessagePattern('time.us.*')
getDate(@Payload() data: number[], @Ctx() context: NatsContext) {
  console.log(`Subject: ${context.getSubject()}`); // e.g. "time.us.east"
  return new Date().toLocaleTimeString(...);
}

```

#### 记录构建器

要配置消息选项，您可以使用 `NatsRecordBuilder` 类（注意：这也适用于基于事件的流程）。例如，要添加 `x-version` 头，请使用 `setHeaders` 方法，如下所示：

```typescript
import * as nats from '@nats-io/nats-core';

// somewhere in your code
const headers = nats.headers();
headers.set('x-version', '1.0.0');

const record = new NatsRecordBuilder(':cat:').setHeaders(headers).build();
this.client.send('replace-emoji', record).subscribe(...);

```

> info **提示** `NatsRecordBuilder` 类从 `@nestjs/microservices` 包导出。

#### 自定义序列化器和反序列化器

从 NestJS v12 开始，Nest 将 NATS 数据包序列化为 JSON 字符串，自定义 NATS 反序列化器接收完整的 NATS 消息对象，而不是原始的 `Uint8Array`。如果您编写了自定义反序列化器，请通过 `msg.json()` 读取有效负载，而不是手动解码字节：

```typescript
import { Deserializer, IncomingRequest } from '@nestjs/microservices';

export class CustomNatsDeserializer implements Deserializer {
  deserialize(msg: any): IncomingRequest {
    // Previously: JSON.parse(new TextDecoder().decode(msg));
    return msg.json();
  }
}

```

您也可以在服务器端读取这些头，通过访问 `NatsContext`，如下所示：

```typescript
@MessagePattern('replace-emoji')
replaceEmoji(@Payload() data: string, @Ctx() context: NatsContext): string {
  const headers = context.getHeaders();
  return headers['x-version'] === '1.0.0' ? '🐱' : '🐈';
}

```

在某些情况下，您可能希望为多个请求配置头，您可以将这些作为选项传递给 `ClientProxyFactory`：

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

#### 实例状态更新

要获取连接和底层驱动程序实例状态的实时更新，您可以订阅 `status` 流。此流提供特定于所选驱动程序的状态更新。对于 NATS 驱动程序，`status` 流会发出 `connected`、`disconnected` 和 `reconnecting` 事件。

```typescript
this.client.status.subscribe((status: NatsStatus) => {
  console.log(status);
});

```

> info **提示** `NatsStatus` 类型从 `@nestjs/microservices` 包导入。

类似地，您可以订阅服务器的 `status` 流以接收有关服务器状态的通知。

```typescript
const server = app.connectMicroservice<MicroserviceOptions>(...);
server.status.subscribe((status: NatsStatus) => {
  console.log(status);
});

```

#### 监听 Nats 事件

在某些情况下，您可能希望监听微服务发出的内部事件。例如，您可以监听 `error` 事件，以便在发生错误时触发额外的操作。为此，请使用 `on()` 方法，如下所示：

```typescript
this.client.on('error', (err) => {
  console.error(err);
});

```

类似地，您可以监听服务器的内部事件：

```typescript
server.on<NatsEvents>('error', (err) => {
  console.error(err);
});

```

> info **提示** `NatsEvents` 类型从 `@nestjs/microservices` 包导入。

#### 底层驱动程序访问

对于更高级的用例，您可能需要访问底层驱动程序实例。这对于手动关闭连接或使用驱动程序特定方法等场景非常有用。但是，请记住，在大多数情况下，您**不需要**直接访问驱动程序。

为此，您可以使用 `unwrap()` 方法，该方法返回底层驱动程序实例。泛型类型参数应指定您期望的驱动程序实例类型。

```typescript
const natsConnection =
  this.client.unwrap<import('@nats-io/transport-node').NatsConnection>();

```

类似地，您可以访问服务器的底层驱动程序实例：

```typescript
const natsConnection =
  server.unwrap<import('@nats-io/transport-node').NatsConnection>();

```