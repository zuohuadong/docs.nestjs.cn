<!-- 此文件从 content/microservices/kafka.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:11:46.391Z -->
<!-- 源文件: content/microservices/kafka.md -->
<!-- 源哈希: dbadac9913316ff1d67dd82f2b534c98 -->

### Kafka

[Kafka](https://kafka.apache.org/) 是一个开源的分布式流处理平台，具有三个关键能力：

- 发布和订阅记录流，类似于消息队列或企业消息系统。
- 以容错持久的方式存储记录流。
- 实时处理记录流。

Kafka 项目旨在提供一个统一、高吞吐量、低延迟的平台，用于处理实时数据流。它与 Apache Storm 和 Spark 集成良好，用于实时流数据分析。

#### 安装

要开始构建基于 Kafka 的微服务，首先安装所需的包：

```bash
$ npm i --save kafkajs

```

#### 概述

与其他 Nest 微服务传输层实现一样，您可以通过传递给 `createMicroservice()` 方法的选项对象的 `transport` 属性来选择 Kafka 传输器机制，并附带可选的 `options` 属性，如下所示：

```typescript title="main.ts"
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.KAFKA,
  options: {
    client: {
      brokers: ['localhost:9092'],
    }
  }
});

```

> 信息 **提示** `Transport` 枚举从 `@nestjs/microservices` 包中导入。

#### 选项

`options` 属性特定于所选的传输器。<strong>Kafka</strong> 传输器公开了以下描述的属性。

<table>
  <tr>
    <td><code>client</code></td>
    <td>客户端配置选项（阅读更多
      <a
        href="https://kafka.js.org/docs/configuration"
        rel="nofollow"
        target="blank"
        >此处</a
      >）</td>
  </tr>
  <tr>
    <td><code>consumer</code></td>
    <td>消费者配置选项（阅读更多
      <a
        href="https://kafka.js.org/docs/consuming#a-name-options-a-options"
        rel="nofollow"
        target="blank"
        >此处</a
      >）</td>
  </tr>
  <tr>
    <td><code>run</code></td>
    <td>运行配置选项（阅读更多
      <a
        href="https://kafka.js.org/docs/consuming"
        rel="nofollow"
        target="blank"
        >此处</a
      >）</td>
  </tr>
  <tr>
    <td><code>subscribe</code></td>
    <td>订阅配置选项（阅读更多
      <a
        href="https://kafka.js.org/docs/consuming#frombeginning"
        rel="nofollow"
        target="blank"
        >此处</a
      >）</td>
  </tr>
  <tr>
    <td><code>producer</code></td>
    <td>生产者配置选项（阅读更多
      <a
        href="https://kafka.js.org/docs/producing#选项"
        rel="nofollow"
        target="blank"
        >此处</a
      >）</td>
  </tr>
  <tr>
    <td><code>send</code></td>
    <td>发送配置选项（阅读更多
      <a
        href="https://kafka.js.org/docs/producing#选项"
        rel="nofollow"
        target="blank"
        >此处</a
      >）</td>
  </tr>
  <tr>
    <td><code>producerOnlyMode</code></td>
    <td>跳过消费者组注册并仅作为生产者运行的功能标志（<code>布尔值</code>）</td>
  </tr>
  <tr>
    <td><code>postfixId</code></td>
    <td>更改 clientId 值的后缀（<code>字符串</code>）</td>
  </tr>
</table>

#### 客户端

与其他微服务传输器相比，Kafka 有一个小差异。我们使用 `ClientKafkaProxy` 类而不是 `ClientProxy` 类。

与其他微服务传输器一样，您有 <a href="/microservices/basics#客户端">多种选项</a> 来创建 `ClientKafkaProxy` 实例。

创建实例的一种方法是使用 `ClientsModule`。要使用 `ClientsModule` 创建客户端实例，请导入它并使用 `register()` 方法传递一个选项对象，该对象包含上述 `createMicroservice()` 方法中显示的相同属性，以及一个用作注入令牌的 `name` 属性。阅读更多关于 `ClientsModule` <a href="/microservices/basics#客户端">此处</a>。

```typescript
@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'HERO_SERVICE',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'hero',
            brokers: ['localhost:9092'],
          },
          consumer: {
            groupId: 'hero-consumer'
          }
        }
      },
    ]),
  ]
  ...
})

```

也可以使用其他创建客户端（`ClientProxyFactory` 或 `@Client()`）的选项。您可以 <a href="/microservices/basics#客户端">在此处</a> 阅读它们。

使用 `@Client()` 装饰器如下：

```typescript
@Client({
  transport: Transport.KAFKA,
  options: {
    client: {
      clientId: 'hero',
      brokers: ['localhost:9092'],
    },
    consumer: {
      groupId: 'hero-consumer'
    }
  }
})
client: ClientKafkaProxy;

```

#### 消息模式

Kafka 微服务消息模式利用两个主题用于请求和回复通道。`ClientKafkaProxy.send()` 方法通过将 [correlation id](https://www.enterpriseintegrationpatterns.com/patterns/messaging/CorrelationIdentifier.html)、回复主题和回复分区与请求消息关联来发送带有 [return address](https://www.enterpriseintegrationpatterns.com/patterns/messaging/ReturnAddress.html) 的消息。这要求 `ClientKafkaProxy` 实例在发送消息之前订阅回复主题并至少分配到一个分区。

随后，您需要为每个正在运行的 Nest 应用程序至少拥有一个回复主题分区。例如，如果您运行 4 个 Nest 应用程序，但回复主题只有 3 个分区，那么其中一个 Nest 应用程序在尝试发送消息时会出错。

当新的 `ClientKafkaProxy` 实例启动时，它们加入消费者组并订阅各自的主题。此过程会触发消费者组中分配给消费者的主题分区的重新平衡。

通常，主题分区使用轮询分区器分配，该分区器将主题分区分配给按消费者名称排序的消费者集合，这些名称在应用程序启动时随机设置。然而，当新消费者加入消费者组时，新消费者可以位于消费者集合中的任何位置。这会导致当已有消费者位于新消费者之后时，已有消费者可能被分配到不同的分区。因此，被分配到不同分区的消费者将丢失在重新平衡之前发送的请求的响应消息。

为了防止 `ClientKafkaProxy` 消费者丢失响应消息，使用了 Nest 特有的内置自定义分区器。该自定义分区器将分区分配给按高分辨率时间戳（`process.hrtime()`）排序的消费者集合，这些时间戳在应用程序启动时设置。

#### 正则表达式模式

KafkaJS 支持通过正则表达式订阅主题，从 NestJS v12 开始，您可以直接将 `RegExp` 传递给 `@MessagePattern()` 或 `@EventPattern()`。Nest 会保留该模式，将其转发给 KafkaJS 的 `subscribe()` 调用，并在解析传入主题的处理器时回退到正则表达式匹配。

```typescript
@EventPattern(/^hero\..+$/)
handleHeroEvents(@Payload() data: any, @Ctx() context: KafkaContext) {
  console.log(`Topic: ${context.getTopic()}`);
}

```

这将使处理器订阅所有匹配该表达式的主题 - `hero.kill.dragon`、`hero.rescue.villager` 等 - 而无需显式注册每个主题。使用 `context.getTopic()` 来找出实际传递消息的主题。

> info **提示** 正则表达式模式是 Kafka 特有的功能；其他传输器仍然按精确值匹配模式。Nest 在匹配之前会重置 `lastIndex`，因此全局（`/g`）和粘性（`/y`）表达式不会产生有状态的遗漏。

#### 消息响应订阅

> warning **注意** 本节仅适用于您使用 [request-response](/microservices/basics#请求-响应) 消息风格（使用 `@MessagePattern` 装饰器和 `ClientKafkaProxy.send` 方法）的情况。对于 [event-based](/microservices/basics#event-based) 通信（`@EventPattern` 装饰器和 `ClientKafkaProxy.emit` 方法），无需订阅响应主题。

`ClientKafkaProxy` 类提供了 `subscribeToResponseOf()` 方法。`subscribeToResponseOf()` 方法将请求的主题名称作为参数，并将派生的回复主题名称添加到回复主题集合中。在实现消息模式时，此方法是必需的。

```typescript title="heroes.controller.ts"
onModuleInit() {
  this.client.subscribeToResponseOf('hero.kill.dragon');
}

```

如果 `ClientKafkaProxy` 实例是异步创建的，则必须在调用 `connect()` 方法之前调用 `subscribeToResponseOf()` 方法。

```typescript title="heroes.controller.ts"
async onModuleInit() {
  this.client.subscribeToResponseOf('hero.kill.dragon');
  await this.client.connect();
}

```

#### 传入消息

Nest 将传入的 Kafka 消息接收为具有 `key`、`value` 和 `headers` 属性的对象，这些属性的值类型为 `Buffer`。然后，Nest 通过将缓冲区转换为字符串来解析这些值。如果字符串"看起来像对象"，Nest 会尝试将该字符串解析为 `JSON`。然后，`value` 被传递给其关联的处理器。

#### 传出消息

Nest 在发布事件或发送消息时，会经过序列化过程后发送传出的 Kafka 消息。这发生在传递给 `ClientKafkaProxy` `emit()` 和 `send()` 方法的参数上，或从 `@MessagePattern` 方法返回的值上。此序列化通过使用 `JSON.stringify()` 或 `toString()` 原型方法将非字符串或缓冲区的对象"字符串化"。

```typescript title="heroes.controller.ts"
@Controller()
export class HeroesController {
  @MessagePattern('hero.kill.dragon')
  killDragon(@Payload() message: KillDragonMessage): any {
    const dragonId = message.dragonId;
    const items = [
      { id: 1, name: 'Mythical Sword' },
      { id: 2, name: 'Key to Dungeon' },
    ];
    return items;
  }
}

```

> info **提示** `@Payload()` 从 `@nestjs/microservices` 包中导入。

传出消息也可以通过传递具有 `key` 和 `value` 属性的对象来添加键。为消息添加键对于满足 [co-partitioning requirement](https://docs.confluent.io/current/ksql/docs/developer-guide/partition-data.html#co-partitioning-requirements) 非常重要。

```typescript title="heroes.controller.ts"
@Controller()
export class HeroesController {
  @MessagePattern('hero.kill.dragon')
  killDragon(@Payload() message: KillDragonMessage): any {
    const realm = 'Nest';
    const heroId = message.heroId;
    const dragonId = message.dragonId;

    const items = [
      { id: 1, name: 'Mythical Sword' },
      { id: 2, name: 'Key to Dungeon' },
    ];

    return {
      headers: {
        realm
      },
      key: heroId,
      value: items
    }
  }
}

```

此外，以这种格式传递的消息还可以包含在 `headers` 哈希属性中设置的自定义标头。标头哈希属性的值必须是 `string` 类型或 `Buffer` 类型。

```typescript title="heroes.controller.ts"
@Controller()
export class HeroesController {
  @MessagePattern('hero.kill.dragon')
  killDragon(@Payload() message: KillDragonMessage): any {
    const realm = 'Nest';
    const heroId = message.heroId;
    const dragonId = message.dragonId;

    const items = [
      { id: 1, name: 'Mythical Sword' },
      { id: 2, name: 'Key to Dungeon' },
    ];

    return {
      headers: {
        kafka_nestRealm: realm
      },
      key: heroId,
      value: items
    }
  }
}

```

#### 基于事件

虽然请求-响应方法非常适合在服务之间交换消息，但当您的消息风格是基于事件的时候（这反过来非常适合 Kafka）- 当您只想发布事件**而不等待响应**时，它就不太适用了。在这种情况下，您不希望请求-响应为维护两个主题而产生的开销。

请查看以下两个部分以了解更多信息：[Overview: Event-based](/microservices/basics#event-based) 和 [Overview: Publishing events](/microservices/basics#publishing-events)。

#### 上下文

在更复杂的场景中，您可能需要访问有关传入请求的附加信息。使用 Kafka 传输器时，您可以访问 `KafkaContext` 对象。

```typescript
@MessagePattern('hero.kill.dragon')
killDragon(@Payload() message: KillDragonMessage, @Ctx() context: KafkaContext) {
  console.log(`Topic: ${context.getTopic()}`);
}

```

> info **提示** `@Payload()`、`@Ctx()` 和 `KafkaContext` 从 `@nestjs/microservices` 包中导入。

要访问原始的 Kafka `IncomingMessage` 对象，请使用 `KafkaContext` 对象的 `getMessage()` 方法，如下所示：

```typescript
@MessagePattern('hero.kill.dragon')
killDragon(@Payload() message: KillDragonMessage, @Ctx() context: KafkaContext) {
  const originalMessage = context.getMessage();
  const partition = context.getPartition();
  const { headers, timestamp } = originalMessage;
}

```

其中 `IncomingMessage` 满足以下接口：

```typescript
interface IncomingMessage {
  topic: string;
  partition: number;
  timestamp: string;
  size: number;
  attributes: number;
  offset: string;
  key: any;
  value: any;
  headers: Record<string, any>;
}

```

如果您的处理器对每个接收到的消息需要较长的处理时间，您应该考虑使用 `heartbeat` 回调。要获取 `heartbeat` 函数，请使用 `KafkaContext` 的 `getHeartbeat()` 方法，如下所示：

```typescript
@MessagePattern('hero.kill.dragon')
async killDragon(@Payload() message: KillDragonMessage, @Ctx() context: KafkaContext) {
  const heartbeat = context.getHeartbeat();

  // Do some slow processing
  await doWorkPart1();

  // Send heartbeat to not exceed the sessionTimeout
  await heartbeat();

  // Do some slow processing again
  await doWorkPart2();
}

```

#### 命名约定

Kafka 微服务组件会将各自角色的描述附加到 `client.clientId` 和 `consumer.groupId` 选项上，以防止 Nest 微服务客户端和服务器组件之间的冲突。默认情况下，`ClientKafkaProxy` 组件将 `-client` 附加到这两个选项上，`ServerKafka` 组件将 `-server` 附加到这两个选项上。请注意下面提供的值是如何以这种方式转换的（如注释中所示）。

```typescript title="main.ts"
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.KAFKA,
  options: {
    client: {
      clientId: 'hero', // hero-server
      brokers: ['localhost:9092'],
    },
    consumer: {
      groupId: 'hero-consumer' // hero-consumer-server
    },
  }
});

```

对于客户端：

```typescript title="heroes.controller.ts"
@Client({
  transport: Transport.KAFKA,
  options: {
    client: {
      clientId: 'hero', // hero-client
      brokers: ['localhost:9092'],
    },
    consumer: {
      groupId: 'hero-consumer' // hero-consumer-client
    }
  }
})
client: ClientKafkaProxy;

```

> info **提示** 可以通过在您自己的自定义提供者中扩展 `ClientKafkaProxy` 和 `KafkaServer` 并覆盖构造函数来自定义 Kafka 客户端和消费者的命名约定。

由于 Kafka 微服务消息模式利用两个主题分别用于请求和回复通道，因此应从请求主题派生回复模式。默认情况下，回复主题的名称是请求主题名称与 `.reply` 的组合。

```typescript title="heroes.controller.ts"
onModuleInit() {
  this.client.subscribeToResponseOf('hero.get'); // hero.get.reply
}

```

> info **提示** 可以通过在您自己的自定义提供者中扩展 `ClientKafkaProxy` 并覆盖 `getResponsePatternName` 方法来定制 Kafka 回复主题的命名约定。

#### 可重试异常

与其他传输器类似，所有未处理的异常都会自动包装为 `RpcException` 并转换为"用户友好"格式。但是，在某些边缘情况下，您可能希望绕过此机制，让异常由 `kafkajs` 驱动程序处理。在处理消息时抛出异常会指示 `kafkajs` **重试**（重新投递）该消息，这意味着即使消息（或事件）处理器被触发，偏移量也不会提交到 Kafka。

> warning **警告** 对于事件处理器（基于事件的通信），默认情况下所有未处理的异常都被视为**可重试异常**。

为此，您可以使用一个名为 `KafkaRetriableException` 的专用类，如下所示：

```typescript
throw new KafkaRetriableException('...');

```

> info **提示** `KafkaRetriableException` 类从 `@nestjs/microservices` 包中导出。

### 自定义异常处理

除了默认的错误处理机制外，您可以为 Kafka 事件创建自定义异常过滤器来管理重试逻辑。例如，下面的示例演示了如何在可配置的重试次数后跳过有问题的消息：

```typescript
import { Catch, ArgumentsHost, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { KafkaContext } from '@nestjs/microservices';
import { Producer } from 'kafkajs';

@Catch()
export class KafkaMaxRetryExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(KafkaMaxRetryExceptionFilter.name);

  constructor(
    private readonly producer: Producer,
    private readonly maxRetries: number,
    // Optional custom function executed when max retries are exceeded
    private readonly skipHandler?: (message: any) => Promise<void>,
  ) {
    super();
  }

  async catch(exception: unknown, host: ArgumentsHost) {
    const kafkaContext = host.switchToRpc().getContext<KafkaContext>();
    const message = kafkaContext.getMessage();
    const currentRetryCount = this.getRetryCountFromContext(kafkaContext);

    if (currentRetryCount >= this.maxRetries) {
      this.logger.warn(
        `Max retries (${
          this.maxRetries
        }) exceeded for message: ${JSON.stringify(message)}`,
      );

      if (this.skipHandler) {
        try {
          await this.skipHandler(message);
        } catch (err) {
          this.logger.error('Error in skipHandler:', err);
        }
      }

      try {
        await this.commitOffset(kafkaContext);
      } catch (commitError) {
        this.logger.error('Failed to commit offset:', commitError);
      }
      return; // Stop propagating the exception
    }

    // Republish the message to the same topic with incremented retry count
    try {
      await this.republishWithRetry(kafkaContext, currentRetryCount + 1);
      await this.commitOffset(kafkaContext);
    } catch (republishError) {
      this.logger.error(
        'Failed to republish message for retry:',
        republishError,
      );
      // Fall back to default exception handling
      super.catch(exception, host);
    }
  }

  private getRetryCountFromContext(context: KafkaContext): number {
    const headers = context.getMessage().headers || {};
    const retryHeader = headers['retry-count'];
    if (!retryHeader) {
      return 0;
    }
    // Header values are Buffers, so convert to string first
    const value = Buffer.isBuffer(retryHeader)
      ? retryHeader.toString()
      : String(retryHeader);
    return parseInt(value, 10) || 0;
  }

  private async republishWithRetry(
    context: KafkaContext,
    retryCount: number,
  ): Promise<void> {
    const topic = context.getTopic();
    const message = context.getMessage();

    await this.producer.send({
      topic,
      messages: [
        {
          key: message.key,
          value: message.value,
          headers: {
            ...message.headers,
            'retry-count': retryCount.toString(),
          },
        },
      ],
    });
  }

  private async commitOffset(context: KafkaContext): Promise<void> {
    const consumer = context.getConsumer();
    if (!consumer) {
      throw new Error('Consumer instance is not available from KafkaContext.');
    }

    const topic = context.getTopic();
    const partition = context.getPartition();
    const message = context.getMessage();
    const offset = message.offset;

    if (!topic || partition === undefined || offset === undefined) {
      throw new Error(
        'Incomplete Kafka message context for committing offset.',
      );
    }

    await consumer.commitOffsets([
      {
        topic,
        partition,
        // When committing an offset, commit the next number (i.e., current offset + 1)
        offset: (Number(offset) + 1).toString(),
      },
    ]);
  }
}

```

该过滤器提供了一种在可配置次数内重试处理 Kafka 事件的方法。当发生异常时，它会将消息重新发布到同一主题，并附带递增的 `retry-count` 头部，然后提交当前偏移量。一旦达到最大重试次数，它会触发自定义的 `skipHandler`（如果提供了的话）并提交偏移量，从而有效地跳过有问题的消息。这使得后续事件可以不受干扰地继续处理。

您可以通过全局注册或在控制器级别注册来集成此过滤器。请注意，您需要提供一个 Kafka 生产者实例：

```typescript title="kafka-retry.filter.ts"
import { Inject, Injectable } from '@nestjs/common';
import { Producer } from 'kafkajs';

@Injectable()
export class AppKafkaRetryFilter extends KafkaMaxRetryExceptionFilter {
  constructor(@Inject('KAFKA_PRODUCER') producer: Producer) {
    super(producer, 5); // maxRetries = 5
  }
}

```

```typescript title="my-event.handler.ts"
@Controller()
@UseFilters(AppKafkaRetryFilter)
export class MyEventHandler {
  @EventPattern('your-topic')
  async handleEvent(@Payload() data: any, @Ctx() context: KafkaContext) {
    // Your event processing logic...
  }
}

```

确保在您的模块中提供 Kafka 生产者：

```typescript title="app.module.ts"
import { Kafka } from 'kafkajs';

@Module({
  providers: [
    AppKafkaRetryFilter,
    {
      provide: 'KAFKA_PRODUCER',
      useFactory: async () => {
        const kafka = new Kafka({ brokers: ['localhost:9092'] });
        const producer = kafka.producer();
        await producer.connect();
        return producer;
      },
    },
  ],
})
export class AppModule {}

```

#### 提交偏移量

在使用 Kafka 时，提交偏移量是至关重要的。默认情况下，消息会在特定时间后自动提交。有关更多信息，请访问 [KafkaJS docs](https://kafka.js.org/docs/consuming#autocommit)。`KafkaContext` 提供了一种访问活动消费者以手动提交偏移量的方式。该消费者是 KafkaJS 消费者，其工作方式与 [native KafkaJS implementation](https://kafka.js.org/docs/consuming#manual-committing) 相同。

```typescript
@EventPattern('user.created')
async handleUserCreated(@Payload() data: IncomingMessage, @Ctx() context: KafkaContext) {
  // business logic

  const { offset } = context.getMessage();
  const partition = context.getPartition();
  const topic = context.getTopic();
  const consumer = context.getConsumer();
  await consumer.commitOffsets([{ topic, partition, offset }])
}

```

要禁用消息的自动提交，请在 `run` 配置中设置 `autoCommit: false`，如下所示：

```typescript title="main.ts"
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.KAFKA,
  options: {
    client: {
      brokers: ['localhost:9092'],
    },
    run: {
      autoCommit: false
    }
  }
});

```

#### 实例状态更新

要获取底层驱动实例的连接和状态的实时更新，您可以订阅 `status` 流。该流提供特定于所选驱动程序的状态更新。对于 Kafka 驱动程序，`status` 流会发出 `connected`、`disconnected`、`rebalancing`、`crashed` 和 `stopped` 事件。

```typescript
this.client.status.subscribe((status: KafkaStatus) => {
  console.log(status);
});

```

> info **提示** `KafkaStatus` 类型从 `@nestjs/microservices` 包中导入。

类似地，您可以订阅服务器的 `status` 流以接收有关服务器状态的通知。

```typescript
const server = app.connectMicroservice<MicroserviceOptions>(...);
server.status.subscribe((status: KafkaStatus) => {
  console.log(status);
});

```

#### 底层生产者和消费者

对于更高级的用例，您可能需要访问底层的生产者和消费者实例。这对于手动关闭连接或使用驱动程序特定方法等场景非常有用。但是，请记住，在大多数情况下，您**不需要**直接访问驱动程序。

为此，您可以使用 `ClientKafkaProxy` 实例公开的 `producer` 和 `consumer` 获取器。

```typescript
const producer = this.client.producer;
const consumer = this.client.consumer;

```