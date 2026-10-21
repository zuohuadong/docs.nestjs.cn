<!-- 此文件从 content/microservices/rabbitmq.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T09:47:17.160Z -->
<!-- 源文件: content/microservices/rabbitmq.md -->
<!-- 源哈希: 1ed884e312005bc754e7c8b52ed3572f -->

### RabbitMQ

[RabbitMQ](https://www.rabbitmq.com/) 是一个开源、轻量级的消息代理，支持多种消息协议。它可以部署在分布式和联邦配置中，以满足大规模、高可用性的需求，并且它是最广泛部署的消息代理之一，被小型初创公司和大型企业所使用。

#### 安装

要开始构建基于 RabbitMQ 的微服务，首先安装所需的包：

```bash
$ npm i --save amqplib amqp-connection-manager

```

#### 概述

要使用 RabbitMQ 传输器，请将以下选项对象传递给 `createMicroservice()` 方法：

```typescript title="main.ts"
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.RMQ,
  options: {
    urls: ['amqp://localhost:5672'],
    queue: 'cats_queue',
    queueOptions: {
      durable: false
    },
  },
});

```

> info **提示** `Transport` 枚举是从 `@nestjs/microservices` 包中导入的。

#### 选项

`options` 属性特定于所选的传输器。<strong>RabbitMQ</strong> 传输器暴露以下属性。

<table>
  <tr>
    <td><code>urls</code></td>
    <td>按顺序尝试的连接 URL 数组</td>
  </tr>
  <tr>
    <td><code>queue</code></td>
    <td>你的服务器监听的队列名称</td>
  </tr>
  <tr>
    <td><code>prefetchCount</code></td>
    <td>设置通道的预取计数</td>
  </tr>
  <tr>
    <td><code>isGlobalPrefetchCount</code></td>
    <td>如果为 <code>true</code>，则按通道而非按消费者应用预取计数</td>
  </tr>
  <tr>
    <td><code>noAck</code></td>
    <td>如果为 <code>false</code>，则启用手动确认模式。默认为 <code>true</code></td>
  </tr>
  <tr>
    <td><code>consumerTag</code></td>
    <td>服务器用来区分消费者消息投递的名称；它不能已在通道上使用。通常省略它更容易，在这种情况下，服务器会创建一个随机名称并在回复中提供它（参见 amqplib 文档中的 <a href="https://amqp-node.github.io/amqplib/channel_api.html#channel_consume" rel="nofollow" target="_blank"><code>channel.consume()</code></a>）</td>
  </tr>
  <tr>
    <td><code>queueOptions</code></td>
    <td>额外的队列选项（参见 amqplib 文档中的 <a href="https://amqp-node.github.io/amqplib/channel_api.html#channel_assertQueue" rel="nofollow" target="_blank"><code>channel.assertQueue()</code></a>）</td>
  </tr>
  <tr>
    <td><code>socketOptions</code></td>
    <td>额外的套接字选项（参见 amqplib 文档中的 <a href="https://amqp-node.github.io/amqplib/channel_api.html#connect" rel="nofollow" target="_blank"><code>connect()</code></a>）</td>
  </tr>
  <tr>
    <td><code>headers</code></td>
    <td>随每条消息发送的标头。仅适用于生产者（客户端）配置</td>
  </tr>
  <tr>
    <td><code>replyQueue</code></td>
    <td>生产者的回复队列。默认为 <code>amq.rabbitmq.reply-to</code></td>
  </tr>
  <tr>
    <td><code>persistent</code></td>
    <td>如果为真值，则消息在代理重启后仍然存在，前提是它们位于同样能在重启后存活的队列中</td>
  </tr>
  <tr>
    <td><code>noAssert</code></td>
    <td>如果为 <code>true</code>，则在消费前不断言队列。默认为 <code>false</code></td>
  </tr>
  <tr>
    <td><code>wildcards</code></td>
    <td>仅当你想要使用主题交换机将消息路由到队列时，才设置为 <code>true</code>。启用它可让你在消息和事件模式中使用通配符（<code>*</code>、<code>#</code>）</td>
  </tr>
  <tr>
    <td><code>exchange</code></td>
    <td>交换机的名称。当 <code>wildcards</code> 设置为 <code>true</code> 时，默认为队列名称</td>
  </tr>
  <tr>
    <td><code>exchangeType</code></td>
    <td>交换机的类型。默认为 <code>topic</code>。接受标准 AMQP 类型 <code>direct</code>、<code>fanout</code>、<code>topic</code> 和 <code>headers</code>，或自定义交换机类型的名称</td>
  </tr>
  <tr>
    <td><code>exchangeArguments</code></td>
    <td>断言交换机时传递的额外参数</td>
  </tr>
  <tr>
    <td><code>routingKey</code></td>
    <td>主题交换机的额外路由键</td>
  </tr>
  <tr>
    <td><code>maxConnectionAttempts</code></td>
    <td>最大连接尝试次数。仅适用于消费者配置。默认为 <code>-1</code>（无限）</td>
  </tr>
</table>

#### 客户端

与其他微服务传输器一样，你可以使用 [several options](/microservices/basics#client-producer-class) 来创建 RabbitMQ `ClientProxy` 实例。

创建实例的一种方法是使用 `ClientsModule`。导入它并调用其 `register()` 方法，传递一个选项对象，该对象具有与上面为 `createMicroservice()` 方法所示相同的属性，外加一个用作注入令牌的 `name` 属性。在 [microservices overview](/microservices/basics#client-producer-class) 中阅读更多关于 `ClientsModule` 的内容。

```typescript
@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'MATH_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: ['amqp://localhost:5672'],
          queue: 'cats_queue',
          queueOptions: {
            durable: false
          },
        },
      },
    ]),
  ]
  ...
})

```

你也可以使用 `ClientProxyFactory` 或 `@Client()` 创建客户端，如 [microservices overview](/microservices/basics#client-producer-class) 中所述。

#### 上下文

在更复杂的场景中，你可能需要有关传入请求的额外信息。使用 RabbitMQ 传输器时，你可以访问 `RmqContext` 对象。

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: RmqContext) {
  console.log(`Pattern: ${context.getPattern()}`);
}

```

> info **提示** `@Payload()`、`@Ctx()` 和 `RmqContext` 是从 `@nestjs/microservices` 包中导入的。

要访问原始 RabbitMQ 消息（包含其 `properties`、`fields` 和 `content`），请使用 `RmqContext` 对象的 `getMessage()` 方法：

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: RmqContext) {
  console.log(context.getMessage());
}

```

要获取对 RabbitMQ [channel](https://www.rabbitmq.com/channels.html) 的引用，请使用 `RmqContext` 对象的 `getChannelRef()` 方法：

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: RmqContext) {
  console.log(context.getChannelRef());
}

```

#### 消息确认

为了确保消息永不丢失，RabbitMQ 支持 [message acknowledgements](https://www.rabbitmq.com/confirms.html)。消费者发送确认回执，告知 RabbitMQ 某条特定消息已被接收并处理，RabbitMQ 可以自由删除它。如果消费者在未发送确认的情况下死亡（其通道关闭、连接关闭或 TCP 连接丢失），RabbitMQ 会认为该消息未被完全处理，并将其重新入队。

默认情况下，RabbitMQ 传输器不期望确认（`noAck` 为 `true`）。要启用手动确认模式，请将 `noAck` 属性设置为 `false`：

```typescript
options: {
  urls: ['amqp://localhost:5672'],
  queue: 'cats_queue',
  noAck: false,
  queueOptions: {
    durable: false
  },
},

```

当开启手动消费者确认时，你必须从工作进程发送确认，以表明它已完成任务：

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: RmqContext) {
  const channel = context.getChannelRef();
  const originalMsg = context.getMessage();

  channel.ack(originalMsg);
}

```

#### 记录构建器

要配置消息选项，请使用 `RmqRecordBuilder` 类（这也适用于基于事件的流程）。例如，要设置 `headers` 和 `priority` 属性，请使用 `setOptions()` 方法：

```typescript
const message = ':cat:';
const record = new RmqRecordBuilder(message)
  .setOptions({
    headers: {
      ['x-version']: '1.0.0',
    },
    priority: 3,
  })
  .build();

this.client.send('replace-emoji', record).subscribe(...);

```

> info **提示** `RmqRecordBuilder` 类从 `@nestjs/microservices` 包中导出。

你也可以在服务端通过访问 `RmqContext` 来读取这些值：

```typescript
@MessagePattern('replace-emoji')
replaceEmoji(@Payload() data: string, @Ctx() context: RmqContext): string {
  const { properties: { headers } } = context.getMessage();
  return headers['x-version'] === '1.0.0' ? '🐱' : '🐈';
}

```

从 NestJS v12.1.3 开始，消息处理器也可以返回一条记录。Nest 将记录数据作为回复发送，并将记录选项（例如 `headers` 和 `priority` 属性）应用于回复消息：

```typescript
@MessagePattern('replace-emoji')
replaceEmoji() {
  return new RmqRecordBuilder(':cat:')
    .setOptions({
      headers: {
        ['x-version']: '1.0.0',
      },
      priority: 3,
    })
    .build();
}

```

回复始终携带请求的关联 ID，因此客户端可以将其与请求进行匹配。

#### 实例状态更新

要获取连接和底层驱动实例状态的实时更新，请订阅 `status` 流。该流提供特定于所选驱动的状态更新。对于 RMQ 驱动，`status` 流会发出 `connected`、`disconnected`、`blocked` 和 `unblocked` 事件。

```typescript
this.client.status.subscribe((status: RmqStatus) => {
  console.log(status);
});

```

> info **提示** `RmqStatus` 类型从 `@nestjs/microservices` 包中导入。

同样，你可以订阅服务器的 `status` 流，以接收有关服务器状态的通知：

```typescript
const server = app.connectMicroservice<MicroserviceOptions>(...);
server.status.subscribe((status: RmqStatus) => {
  console.log(status);
});

```

#### 监听 RabbitMQ 事件

在某些情况下，你可能希望监听微服务发出的内部事件。例如，你可以监听 `error` 事件，以便在发生错误时触发额外的操作。为此，请使用 `on()` 方法：

```typescript
this.client.on('error', (err) => {
  console.error(err);
});

```

同样，你可以监听服务器的内部事件：

```typescript
server.on<RmqEvents>('error', (err) => {
  console.error(err);
});

```

> info **提示** `RmqEvents` 类型从 `@nestjs/microservices` 包中导入。

从 NestJS v12.1.2 开始，通过客户端的 `on()` 方法注册的监听器会一直保持注册状态，直到你调用 `close()`，因此在连接尝试失败后，它们也会附加到客户端在下一次 `send()` 或 `emit()` 调用时创建的新连接上。注册不会去重，因此每个监听器只需注册一次，而不要在尝试失败后再次注册。

#### 底层驱动访问

对于更高级的用例，你可能需要访问底层驱动实例，例如手动关闭连接或使用特定于驱动的方法。然而，在大多数情况下，你**不应该需要**直接访问驱动。

为此，请使用 `unwrap()` 方法，它返回底层驱动实例。使用泛型类型参数来指定你期望的驱动实例类型。

```typescript
const managerRef =
  this.client.unwrap<import('amqp-connection-manager').AmqpConnectionManager>();

```

同样，你可以访问服务器的底层驱动实例：

```typescript
const managerRef =
  server.unwrap<import('amqp-connection-manager').AmqpConnectionManager>();

```

#### 通配符

RabbitMQ 支持在路由键中使用通配符，以实现灵活的消息路由。`#` 通配符匹配零个或多个单词，而 `*` 通配符恰好匹配一个单词。

例如，路由键 `cats.#` 匹配 `cats`、`cats.meow` 和 `cats.meow.purr`。路由键 `cats.*` 匹配 `cats.meow`，但不匹配 `cats.meow.purr`。

要在 RabbitMQ 微服务中启用通配符支持，请在选项对象中将 `wildcards` 配置选项设置为 `true`：

```typescript
const app = await NestFactory.createMicroservice<MicroserviceOptions>(
  AppModule,
  {
    transport: Transport.RMQ,
    options: {
      urls: ['amqp://localhost:5672'],
      queue: 'cats_queue',
      wildcards: true,
    },
  },
);

```

使用此配置，你在订阅事件和消息时可以在路由键中使用通配符。例如，要监听路由键为 `cats.#` 的消息：

```typescript
@MessagePattern('cats.#')
getCats(@Payload() data: { message: string }, @Ctx() context: RmqContext) {
  console.log(`Received message with routing key: ${context.getPattern()}`);

  return {
    message: 'Hello from the cats service!',
  }
}

```

要发送具有特定路由键的消息，请使用 `ClientProxy` 实例的 `send()` 方法：

```typescript
this.client.send('cats.meow', { message: 'Meow!' }).subscribe((response) => {
  console.log(response);
});

```