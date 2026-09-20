<!-- 此文件从 content/microservices/rabbitmq.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:01:26.510Z -->
<!-- 源文件: content/microservices/rabbitmq.md -->
<!-- 源哈希: eb696c88a2fb9a04f039bdbb8ae63dff -->

### RabbitMQ

[RabbitMQ](https://www.rabbitmq.com/) 是一个开源且轻量级的消息代理，支持多种消息协议。它可以部署在分布式和联邦配置中，以满足大规模、高可用性的需求。此外，它是最广泛部署的消息代理，在全球范围内被小型初创企业和大型企业使用。

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

> info **提示** `Transport` 枚举从 `@nestjs/microservices` 包中导入。

#### 选项

`options` 属性特定于所选的传输器。<strong>RabbitMQ</strong> 传输器暴露了以下描述的属性。

<table>
  <tr>
    <td><code>urls</code></td>
    <td>按顺序尝试的连接 URL 数组</td>
  </tr>
  <tr>
    <td><code>queue</code></td>
    <td>您的服务器将监听的队列名称</td>
  </tr>
  <tr>
    <td><code>prefetchCount</code></td>
    <td>设置通道的预取计数</td>
  </tr>
  <tr>
    <td><code>isGlobalPrefetchCount</code></td>
    <td>启用每个通道的预取</td>
  </tr>
  <tr>
    <td><code>noAck</code></td>
    <td>如果 <code>false</code>，则启用手动确认模式</td>
  </tr>
  <tr>
    <td><code>consumerTag</code></td>
    <td>服务器用于区分消费者消息传递的名称；不能已在通道上使用。通常省略此选项更容易，在这种情况下，服务器将创建一个随机名称并在回复中提供。消费者标签标识符（阅读更多 <a href="https://amqp-node.github.io/amqplib/channel_api.html#channel_consume" rel="nofollow" target="_blank">here</a>）</td>
  </tr>
  <tr>
    <td><code>queueOptions</code></td>
    <td>额外的队列选项（阅读更多 <a href="https://amqp-node.github.io/amqplib/channel_api.html#channel_assertQueue" rel="nofollow" target="_blank">here</a>）</td>
  </tr>
  <tr>
    <td><code>socketOptions</code></td>
    <td>额外的套接字选项（阅读更多 <a href="https://amqp-node.github.io/amqplib/channel_api.html#connect" rel="nofollow" target="_blank">here</a>）</td>
  </tr>
  <tr>
    <td><code>headers</code></td>
    <td>随每条消息发送的标头</td>
  </tr>
  <tr>
    <td><code>replyQueue</code></td>
    <td>生产者的回复队列。默认是 <code>amq.rabbitmq.reply-to</code></td>
  </tr>
  <tr>
    <td><code>persistent</code></td>
    <td>如果为真值，消息将在代理重启后保留，前提是它所在的队列也能在重启后保留</td>
  </tr>
  <tr>
    <td><code>noAssert</code></td>
    <td>当为 false 时，消费前不会断言队列</td>
  </tr>
  <tr>
    <td><code>wildcards</code></td>
    <td>仅当您想使用主题交换将消息路由到队列时才设置为 true。启用此选项将允许您使用通配符（*、#）作为消息和事件模式</td>
  </tr>
  <tr>
    <td><code>exchange</code></td>
    <td>交换的名称。当 "wildcards" 设置为 true 时，默认为队列名称</td>
  </tr>
  <tr>
    <td><code>exchangeType</code></td>
    <td>交换的类型。默认是 <code>topic</code>。有效值为 <code>direct</code>、<code>fanout</code>、<code>topic</code> 和 <code>headers</code></td>
  </tr>
  <tr>
    <td><code>routingKey</code></td>
    <td>主题交换的附加路由键</td>
  </tr>
  <tr>
    <td><code>maxConnectionAttempts</code></td>
    <td>最大连接尝试次数。仅适用于消费者配置。-1 === 无限</td>
  </tr>
</table>

#### 客户端

与其他微服务传输器一样，您有 <a href="/microservices/basics#客户端">several options</a> 用于创建 RabbitMQ `ClientProxy` 实例。

创建实例的一种方法是使用 `ClientsModule`。要使用 `ClientsModule` 创建客户端实例，请导入它并使用 `register()` 方法传递一个选项对象，该对象具有上面 `createMicroservice()` 方法中显示的相同属性，以及一个用作注入令牌的 `name` 属性。阅读更多关于 `ClientsModule` <a href="/microservices/basics#客户端">here</a>。

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

其他创建客户端（`ClientProxyFactory` 或 `@Client()`）的选项也可以使用。您可以 <a href="/microservices/basics#客户端">here</a> 阅读关于它们的信息。

#### 上下文

在更复杂的场景中，您可能需要访问有关传入请求的附加信息。使用 RabbitMQ 传输器时，您可以访问 `RmqContext` 对象。

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: RmqContext) {
  console.log(`Pattern: ${context.getPattern()}`);
}

```

> info **提示** `@Payload()`、`@Ctx()` 和 `RmqContext` 从 `@nestjs/microservices` 包中导入。

要访问原始 RabbitMQ 消息（带有 `properties`、`fields` 和 `content`），请使用 `RmqContext` 对象的 `getMessage()` 方法，如下所示：

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: RmqContext) {
  console.log(context.getMessage());
}

```

要获取 RabbitMQ [channel](https://www.rabbitmq.com/channels.html) 的引用，请使用 `RmqContext` 对象的 `getChannelRef` 方法，如下所示：

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: RmqContext) {
  console.log(context.getChannelRef());
}

```

#### 消息确认

为了确保消息永远不会丢失，RabbitMQ 支持 [message acknowledgements](https://www.rabbitmq.com/confirms.html)。消费者会发送确认回执，告知 RabbitMQ 特定消息已被接收、处理，并且 RabbitMQ 可以自由删除它。如果消费者在未发送确认的情况下死亡（其通道关闭、连接关闭或 TCP 连接丢失），RabbitMQ 将理解消息未完全处理，并将其重新排队。

要启用手动确认模式，请将 `noAck` 属性设置为 `false`：

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

当启用手动消费者确认时，我们必须从工作进程发送适当的确认，以表明我们已完成某项任务。

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: RmqContext) {
  const channel = context.getChannelRef();
  const originalMsg = context.getMessage();

  channel.ack(originalMsg);
}

```

#### 记录构建器

要配置消息选项，您可以使用 `RmqRecordBuilder` 类（注意：这也适用于基于事件的流程）。例如，要设置 `headers` 和 `priority` 属性，请使用 `setOptions` 方法，如下所示：

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

您也可以通过访问 `RmqContext` 在服务器端读取这些值，如下所示：

```typescript
@MessagePattern('replace-emoji')
replaceEmoji(@Payload() data: string, @Ctx() context: RmqContext): string {
  const { properties: { headers } } = context.getMessage();
  return headers['x-version'] === '1.0.0' ? '🐱' : '🐈';
}

```

#### 实例状态更新

要获取连接和底层驱动实例状态的实时更新，您可以订阅 `status` 流。该流提供特定于所选驱动的状态更新。对于 RMQ 驱动，`status` 流会发出 `connected` 和 `disconnected` 事件。

```typescript
this.client.status.subscribe((status: RmqStatus) => {
  console.log(status);
});

```

> info **提示** `RmqStatus` 类型从 `@nestjs/microservices` 包中导入。

类似地，您可以订阅服务器的 `status` 流，以接收有关服务器状态的通知。

```typescript
const server = app.connectMicroservice<MicroserviceOptions>(...);
server.status.subscribe((status: RmqStatus) => {
  console.log(status);
});

```

#### 监听 RabbitMQ 事件

在某些情况下，您可能希望监听微服务发出的内部事件。例如，您可以监听 `error` 事件，以便在发生错误时触发其他操作。为此，请使用 `on()` 方法，如下所示：

```typescript
this.client.on('error', (err) => {
  console.error(err);
});

```

类似地，您可以监听服务器的内部事件：

```typescript
server.on<RmqEvents>('error', (err) => {
  console.error(err);
});

```

> info **提示** `RmqEvents` 类型从 `@nestjs/microservices` 包中导入。

#### 底层驱动访问

对于更高级的用例，您可能需要访问底层驱动实例。这对于手动关闭连接或使用驱动特定方法等场景非常有用。但是，请记住，在大多数情况下，您**不需要**直接访问驱动。

为此，您可以使用 `unwrap()` 方法，该方法返回底层驱动实例。泛型类型参数应指定您期望的驱动实例类型。

```typescript
const managerRef =
  this.client.unwrap<import('amqp-connection-manager').AmqpConnectionManager>();

```

类似地，您可以访问服务器的底层驱动实例：

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

使用此配置，您可以在订阅事件/消息时在路由键中使用通配符。例如，要监听具有路由键 `cats.#` 的消息，您可以使用以下代码：

```typescript
@MessagePattern('cats.#')
getCats(@Payload() data: { message: string }, @Ctx() context: RmqContext) {
  console.log(`Received message with routing key: ${context.getPattern()}`);

  return {
    message: 'Hello from the cats service!',
  }
}

```

要发送具有特定路由键的消息，您可以使用 `ClientProxy` 实例的 `send()` 方法：

```typescript
this.client.send('cats.meow', { message: 'Meow!' }).subscribe((response) => {
  console.log(response);
});

```