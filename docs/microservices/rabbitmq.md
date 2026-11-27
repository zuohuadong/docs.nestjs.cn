<!-- 此文件从 content/microservices/rabbitmq.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:17:20.869Z -->
<!-- 源文件: content/microservices/rabbitmq.md -->
<!-- 源哈希: 8afd92dc5da6afbf206921fd2a807271 -->

### RabbitMQ

[RabbitMQ](https://www.rabbitmq.com/) 是一个开源的轻量级消息代理，支持多种消息协议。它可以部署在分布式和联邦配置中，以满足高规模、高可用性的要求，是应用最广泛的消息代理之一，被小型初创公司和大型企业广泛使用。

> info **提示** 对于通过 RabbitMQ 通信的两个完整服务，涉及事件、请求-响应、重试、死信队列以及可存活于崩溃中的消息，请参考 [Build microservices in Node.js with RabbitMQ](/tutorials/microservices-rabbitmq)。

#### 安装

要开始构建基于 RabbitMQ 的微服务，首先安装所需的包：

```bash
$ npm i --save amqplib amqp-connection-manager

```

#### 概述

要使用 RabbitMQ **传输器**，请将以下选项对象传递给 `createMicroservice()` 方法：

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

> info **提示** `Transport` 枚举是从 `@nestjs/microservices` 包导入的。

#### 选项

`options` 属性特定于所选的 **传输器**。<strong>RabbitMQ</strong> **传输器** 暴露了以下属性。

<table>
  <tr>
    <td><code>urls</code></td>
    <td>按顺序尝试的连接 URL 数组</td>
  </tr>
  <tr>
    <td><code>queue</code></td>
    <td>服务器监听的队列名称</td>
  </tr>
  <tr>
    <td><code>prefetchCount</code></td>
    <td>设置通道的预取计数</td>
  </tr>
  <tr>
    <td><code>isGlobalPrefetchCount</code></td>
    <td>如果 <code>true</code>，则按通道而不是按 **消费者** 应用预取计数</td>
  </tr>
  <tr>
    <td><code>noAck</code></td>
    <td>如果 <code>false</code>，则启用手动确认模式。默认为 <code>true</code></td>
  </tr>
  <tr>
    <td><code>nackOnInternalError</code></td>
    <td>如果 <code>true</code>（且 <code>noAck</code> 为 <code>false</code>），则在其处理程序因内部错误失败时，在不重新排队的情况下负向确认消息，因此死信交换机会接收到它（参见 <a href="/microservices/rabbitmq#message-acknowledgement">消息确认</a>）。默认为 <code>false</code></td>
  </tr>
  <tr>
    <td><code>consumerTag</code></td>
    <td>服务器用于区分 **消费者** 消息投递的名称；它不能在通道上已在使用。通常省略它更简单，在这种情况下服务器会创建一个随机名称并在回复中提供它（参见 amqplib 文档中的 <a href="https://amqp-node.github.io/amqplib/channel_api.html#channel_consume" rel="nofollow" target="_blank"><code>channel.consume()</code>）</td>
  </tr>
  <tr>
    <td><code>queueOptions</code></td>
    <td>附加队列选项（参见 amqplib 文档中的 <a href="https://amqp-node.github.io/amqplib/channel_api.html#channel_assertQueue" rel="nofollow" target="_blank"><code>channel.assertQueue()</code>）</a>
  </tr>
  <tr>
    <td><code>socketOptions</code></td>
    <td>附加套接字选项（参见 amqplib 文档中的 <a href="https://amqp-node.github.io/amqplib/channel_api.html#connect" rel="nofollow" target="_blank"><code>connect()</code>）</a></td>
  </tr>
  <tr>
    <td><code>headers</code></td>
    <td>随每条消息发送的头部。仅适用于 **生产者**（客户端）配置</td>
  </tr>
  <tr>
    <td><code>replyQueue</code></td>
    <td>**生产者** 的回复队列。默认为 <code>amq.rabbitmq.reply-to</code></td>
  </tr>
  <tr>
    <td><code>persistent</code></td>
    <td>如果为真值，消息在 **代理** 重启后仍然存在，前提是它们位于也能够存活于重启的队列中</td>
  </tr>
  <tr>
    <td><code>noAssert</code></td>
    <td>如果 <code>true</code>，则在消费前不断言队列。默认为 <code>false</code></td>
  </tr>
  <tr>
    <td><code>wildcards</code></td>
    <td>仅在您想使用主题交换机将消息路由到队列时设置为 <code>true</code>。启用它允许您在消息和事件模式中使用通配符（<code>*</code>, <code>#</code>）</td>
  </tr>
  <tr>
    <td><code>exchange</code></td>
    <td>交换机的名称。当 <code>wildcards</code> 设置为 <code>true</code></td>时默认为队列名称
  </tr>
  <tr>
    <td><code>exchangeType</code></td>
    <td>交换机类型。默认为 <code>topic</code>。接受标准的 AMQP 类型 <code>direct</code>, <code>fanout</code>, <code>topic</code>, 和 <code>headers</code>，或自定义交换机类型的名称</td>
  </tr>
  <tr>
    <td><code>exchangeArguments</code></td>
    <td>断言交换机时传递的附加参数</td>
  </tr>
  <tr>
    <td><code>routingKey</code></td>
    <td>主题交换机的附加路由键</td>
  </tr>
  <tr>
    <td><code>maxConnectionAttempts</code></td>
    <td>最大连接尝试次数。仅适用于 **消费者** 配置。默认为 <code>-1</code>（无限）</td>
  </tr>
  <tr>
    <td><code>maxMessageSize</code></td>
    <td>消息体最大大小，单位为字节。服务器在不解码的情况下记录并跳过较大的消息（当 <code>noAck</code> 为 <code>false</code> 时，它会被负向确认且不重新排队，请求会收到错误回复），客户端会因回复过大而失败。设置为 <code>Infinity</code> 以解除限制。一个非数字的值，例如 <code>NaN</code>（由 <code>Number()</code> 对未设置的环境变量生成），将获得默认值。默认为 <code>16777216</code>（16 MiB）</td>
  </tr>
  <tr>
    <td><code>gracefulShutdown</code></td>
    <td>启用优雅关闭。启用后，关闭服务器会先取消其 **消费者**，然后等待正在处理的请求和事件后再关闭其通道和连接。仅适用于 **消费者** 配置。默认为 <code>false</code></td>
  </tr>
  <tr>
    <td><code>gracePeriod</code></td>
    <td>当 <code>gracefulShutdown</code> 启用时，等待正在处理的请求和事件的最长时间（毫秒）。在此之前，服务器会更早地关闭。仅适用于 **消费者** 配置。默认为 <code>10000</code></td>
  </tr>
</table>

> info **提示** 返回一个永不完成的流的处理程序仍然正在被处理，因此关闭服务器会导致整个 `gracePeriod` 被中断。当 `noAck` 设置为 `false` 时，**代理** 在通道关闭时会重新排队尚未确认的消息，因此其处理程序比 `gracePeriod` 更长的消息将被再次投递。

#### 客户端

与其他微服务**传输器**一样，您可以使用 [several options](/microservices/basics#client-producer-class) 来创建 RabbitMQ `ClientProxy` 实例。

创建实例的一种方法是使用 `ClientsModule`。导入它并调用其 `register()` 方法，传入一个选项对象，该对象包含与 `createMicroservice()` 方法中显示的相同属性，外加一个用于作为**注入令牌**的 `name` 属性。有关 `ClientsModule` 的更多信息，请参阅 [microservices overview](/microservices/basics#client-producer-class)。

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

您也可以使用 `ClientProxyFactory` 或 `@Client()` 创建客户端，如 [microservices overview](/microservices/basics#client-producer-class) 所述。

#### 上下文

在更复杂的场景中，您可能需要有关传入 **请求** 的附加信息。在使用 RabbitMQ **传输器** 时，您可以访问 `RmqContext` 对象。

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: RmqContext) {
  console.log(`Pattern: ${context.getPattern()}`);
}

```

> info **提示** `@Payload()`、`@Ctx()` 和 `RmqContext` 从 `@nestjs/microservices` 包导入。

要访问原始 RabbitMQ 消息（及其 `properties`、`fields` 和 `content`），请使用 `RmqContext` 对象的 `getMessage()` 方法：

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: RmqContext) {
  console.log(context.getMessage());
}

```

要检索 RabbitMQ [channel](https://www.rabbitmq.com/channels.html) 的引用，请使用 `RmqContext` 对象的 `getChannelRef()` 方法：

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: RmqContext) {
  console.log(context.getChannelRef());
}

```

#### 消息确认

为确保消息永不丢失，RabbitMQ 支持 [message acknowledgements](https://www.rabbitmq.com/confirms.html)。**消费者** 将确认发送回 RabbitMQ，告知特定消息已被接收和处理，RabbitMQ 即可删除它。如果 **消费者** 在未发送确认的情况下死亡（其通道关闭、其连接关闭或 TCP 连接丢失），RabbitMQ 假定消息未完全处理并将其重新排队。

默认情况下，RabbitMQ **传输器** 不期望确认（`noAck` 为 `true`）。要启用手动确认模式，请将 `noAck` 属性设置为 `false`：

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

当开启手动 **消费者** 确认时，您必须从工作进程发送确认以指示任务已完成：

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: RmqContext) {
  const channel = context.getChannelRef();
  const originalMsg = context.getMessage();

  channel.ack(originalMsg);
}

```

当处理程序失败时，服务器会保持消息未确认状态。该消息会占用一个 `prefetchCount` 槽位，直到通道关闭，然后代理会再次投递它，因此一个永远无法处理的负载会在每次重新连接后返回，永远不会到达 [dead letter exchange](https://www.rabbitmq.com/docs/dlx)。要将此类消息死信，请将 `nackOnInternalError` 设置为 `true`（在 `@nestjs/microservices` 12.6.1 及更高版本中可用）：

```typescript
options: {
  urls: ['amqp://localhost:5672'],
  queue: 'orders',
  noAck: false,
  nackOnInternalError: true,
  queueOptions: {
    durable: true,
    arguments: { 'x-dead-letter-exchange': 'orders.dlx' },
  },
},

```

开启此选项后，当事件或 **请求** 处理程序因内部错误失败时，服务器会调用 `nack(message, false, false)`：即除默认**异常过滤器**以“内部服务器错误”响应的 `RpcException` 之外的异常。消息不会被重新排队，因此队列的死信交换机会接收它，或者如果队列没有死信交换机，代理会丢弃它。**请求** 仍然会收到错误回复。该选项保持其他所有内容不变：

- 一个业务错误，例如处理程序返回的“未找到”或**守卫**抛出的“禁止资源”，消息保持未确认状态。
- 成功处理的**服务**会自行确认其消息。
- 已经被处理程序（或**拦截器**）确认或拒绝的消息不会被第二次结算，否则 RabbitMQ 会通过关闭通道来响应。
- 一个以其自身负载响应而不是调用 `super.catch()` 的自定义**异常过滤器**不被视为内部错误。

> info **提示** **验证** **管道** 会抛出 `BadRequestException`，这不是一个 `RpcException`，因此验证失败的负载会被死信：这正是处理“毒丸”消息所期望的行为。如果希望将**验证**失败视为业务错误，请给该**管道**提供一个返回 `RpcException` 的 `exceptionFactory`。

#### 记录构建器

要配置消息选项，请使用 `RmqRecordBuilder` 类（这同样适用于基于事件的流程）。例如，要设置 `headers` 和 `priority` 属性，请使用 `setOptions()` 方法：

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

> info **提示** `RmqRecordBuilder` 类从 `@nestjs/microservices` 包导出。

AMQP 将一些消息属性作为最多 255 字节的短字符串承载：`contentType`、`contentEncoding`、`correlationId`、`replyTo`、`expiration`、`messageId`、`type`、`userId` 和 `appId`。如果客户端的选项设置了更长的 `send()` 或 `emit()`，或者使用 `wildcards` 或 `fanout` 交换机且其模式（成为路由键）长于 255 字节，客户端将失败。服务器不会对 `replyTo` 或 `correlationId` 较长的 **请求** 进行回复，并记录错误。

您也可以通过访问 `RmqContext` 在服务器端读取这些值：

```typescript
@MessagePattern('replace-emoji')
replaceEmoji(@Payload() data: string, @Ctx() context: RmqContext): string {
  const { properties: { headers } } = context.getMessage();
  return headers['x-version'] === '1.0.0' ? '🐱' : '🐈';
}

```

从 NestJS v12.1.3 开始，消息处理程序也可以返回一个记录。Nest 将记录数据作为回复发送，并将记录选项（例如 `headers` 和 `priority` 属性）应用于回复消息：

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

回复始终携带 **请求** 的关联 ID，因此客户端可以将其与 **请求** 匹配。

#### 实例状态更新

要获取连接和底层驱动实例状态的实时更新，请订阅 `status` 流。此流提供特定于所选驱动的状态更新。对于 RMQ 驱动，`status` 流会发出 `connected`、`disconnected`、`blocked` 和 `unblocked` 事件。

```typescript
this.client.status.subscribe((status: RmqStatus) => {
  console.log(status);
});

```

> info **提示** `RmqStatus` 类型从 `@nestjs/microservices` 包导入。

类似地，您可以订阅服务器的 `status` 流，以接收有关服务器状态的通知：

```typescript
const server = app.connectMicroservice<MicroserviceOptions>(...);
server.status.subscribe((status: RmqStatus) => {
  console.log(status);
});

```

#### 监听 RabbitMQ 事件

在某些情况下，您可能希望监听微服务发出的内部事件。例如，您可以监听 `error` 事件，以便在发生错误时触发额外的操作。为此，请使用 `on()` 方法：

```typescript
this.client.on('error', (err) => {
  console.error(err);
});

```

同样，您也可以监听服务器的内部事件：

```typescript
server.on<RmqEvents>('error', (err) => {
  console.error(err);
});

```

> info **提示** `RmqEvents` 类型是从 `@nestjs/microservices` 包导入的。

从 NestJS v12.1.2 开始，使用客户端的 `on()` 方法注册的监听器会一直保持注册状态，直到您调用 `close()` 为止，因此它们也会附加到客户端在下一次 `send()` 或 `emit()` 调用后（在连接尝试失败后）创建的新连接上。注册不会去重，因此请注册每个监听器一次，而不是在失败尝试后再次注册。

#### 底层驱动访问

对于更高级的用例，您可能需要访问底层驱动实例，例如手动关闭连接或使用驱动特定的方法。然而，在大多数情况下，您**不应该**直接访问驱动。

为此，请使用 `unwrap()` 方法，它返回底层驱动实例。使用泛型类型参数来指定您期望的驱动实例类型。

```typescript
const managerRef =
  this.client.unwrap<import('amqp-connection-manager').AmqpConnectionManager>();

```

同样，您可以访问服务器的底层驱动实例：

```typescript
const managerRef =
  server.unwrap<import('amqp-connection-manager').AmqpConnectionManager>();

```

#### 通配符

RabbitMQ 支持在路由键中使用通配符，以实现灵活的消息路由。`#` 通配符匹配零个或多个单词，而 `*` 通配符匹配恰好一个单词。

例如，路由键 `cats.#` 匹配 `cats`、`cats.meow` 和 `cats.meow.purr`。路由键 `cats.*` 匹配 `cats.meow` 但不匹配 `cats.meow.purr`。

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

有了此配置，您在订阅事件和消息时可以在路由键中使用通配符。例如，要监听路由键为 `cats.#` 的消息：

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

路由键最多包含 255 字节，因此模式长度超过 255 个字符的消息不会匹配任何通配符模式。