<!-- 此文件从 content/microservices/kafka.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T09:47:35.042Z -->
<!-- 源文件: content/microservices/kafka.md -->
<!-- 源哈希: bf52070ca4e252905e0ac1a218184189 -->

### Kafka

[Kafka](https://kafka.apache.org/) 是一个开源的分布式流处理平台，具有三项关键能力：

- 发布和订阅记录流，类似于消息队列或企业消息系统。
- 以容错且持久的方式存储记录流。
- 在记录流产生时对其进行处理。

Kafka 项目旨在提供一个统一、高吞吐量、低延迟的平台，用于处理实时数据流。它与 Apache Storm 和 Spark 集成，以进行实时流数据分析。

#### 安装

要开始构建基于 Kafka 的微服务，首先安装所需的包：

```bash
$ npm i --save kafkajs

```

#### 概述

与其他 Nest 微服务传输层实现一样，你通过传递给 `createMicroservice()` 方法的选项对象的 `transport` 属性来选择 Kafka 传输器，同时还可以使用可选的 `options` 属性，如下所示：

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

> info **提示** `Transport` 枚举是从 `@nestjs/microservices` 包中导入的。

#### 选项

`options` 属性特定于所选的传输器。<strong>Kafka</strong> 传输器暴露以下属性。

<table>
  <tr>
    <td><code>client</code></td>
    <td>客户端配置选项（参见
      <a
        href="https://kafka.js.org/docs/configuration"
        rel="nofollow"
        target="_blank"
        >KafkaJS client configuration</a
      >）</td>
  </tr>
  <tr>
    <td><code>consumer</code></td>
    <td>消费者配置选项（参见
      <a
        href="https://kafka.js.org/docs/consuming#a-name-options-a-options"
        rel="nofollow"
        target="_blank"
        >KafkaJS consumer options</a
      >）</td>
  </tr>
  <tr>
    <td><code>run</code></td>
    <td>传递给消费者 <code>run()</code> 方法的选项（参见
      <a
        href="https://kafka.js.org/docs/consuming"
        rel="nofollow"
        target="_blank"
        >KafkaJS consuming messages</a
      >）</td>
  </tr>
  <tr>
    <td><code>subscribe</code></td>
    <td>传递给消费者 <code>subscribe()</code> 方法的选项，但 <code>topics</code> 除外，它由 Nest 根据注册的模式推导得出（参见
      <a
        href="https://kafka.js.org/docs/consuming#frombeginning"
        rel="nofollow"
        target="_blank"
        >KafkaJS fromBeginning</a
      >）</td>
  </tr>
  <tr>
    <td><code>producer</code></td>
    <td>生产者配置选项（参见
      <a
        href="https://kafka.js.org/docs/producing#选项"
        rel="nofollow"
        target="_blank"
        >KafkaJS producer options</a
      >）</td>
  </tr>
  <tr>
    <td><code>send</code></td>
    <td>传递给生产者 <code>send()</code> 方法的选项，但 <code>topic</code> 和 <code>messages</code> 除外（参见
      <a
        href="https://kafka.js.org/docs/producing#选项"
        rel="nofollow"
        target="_blank"
        >KafkaJS producing messages</a
      >）</td>
  </tr>
  <tr>
    <td><code>parser</code></td>
    <td>用于解码传入消息的解析器选项：<code>keepBinary</code> 将消息值作为缓冲区传递给处理程序，而不是对其进行解码（<code>boolean</code>），而 <code>maxMessageSize</code> 是解压缩后的大小（以字节为单位），超过该大小的消息将被跳过而不解码。默认值为 <code>16777216</code>（16 MiB）（<code>number</code>）</td>
  </tr>
  <tr>
    <td><code>producerOnlyMode</code></td>
    <td>仅客户端。跳过消费者组注册，使客户端仅作为生产者（<code>boolean</code>）</td>
  </tr>
  <tr>
    <td><code>postfixId</code></td>
    <td>追加到 <code>clientId</code> 和 <code>groupId</code> 值的后缀。在服务端默认为 <code>'-server'</code>，在客户端默认为 <code>'-client'</code>（<code>string</code>）</td>
  </tr>
</table>

#### 客户端

Kafka 与其他微服务传输器略有不同：你使用的不是 `ClientProxy` 类型，而是 `ClientKafkaProxy`。

与其他微服务传输器一样，你可以使用 [several options](/microservices/basics#client-producer-class) 来创建 `ClientKafkaProxy` 实例。

一种选择是 `ClientsModule`。导入它并使用其 `register()` 方法传递一个选项对象，该对象具有上面为 `createMicroservice()` 方法展示的相同属性，外加一个用作注入令牌的 `name` 属性。请参阅 [client section of the microservices overview](/microservices/basics#client-producer-class) 以了解有关 `ClientsModule` 的更多信息。

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

你也可以使用 `ClientProxyFactory` 或 `@Client()` 装饰器创建客户端，两者都在 [microservices overview](/microservices/basics#client-producer-class) 中进行了描述。

按如下方式使用 `@Client()` 装饰器：

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

Kafka 微服务消息模式使用两个主题分别用于请求和回复通道。`ClientKafkaProxy.send()` 方法通过将 [correlation id](https://www.enterpriseintegrationpatterns.com/patterns/messaging/CorrelationIdentifier.html)、回复主题和回复分区与请求消息关联，来发送带有 [return address](https://www.enterpriseintegrationpatterns.com/patterns/messaging/ReturnAddress.html) 的消息。这要求 `ClientKafkaProxy` 实例在发送消息之前已订阅回复主题并分配到至少一个分区。

因此，每个正在运行的 Nest 应用程序都需要至少一个回复主题分区。例如，如果你运行 4 个 Nest 应用程序，但回复主题只有 3 个分区，那么其中 1 个 Nest 应用程序在尝试发送消息时会失败。

当新的 `ClientKafkaProxy` 实例启动时，它们会加入消费者组并订阅各自的主题。这会触发对分配给组内消费者的主题分区进行重新平衡。

通常情况下，主题分区使用轮询分配器（round-robin assigner）进行分配，该分配器将主题分区分配给一组消费者，这些消费者按应用程序启动时随机设置的消费者名称排序。然而，当新的消费者加入消费者组时，它可以被放置在该集合中的任意位置。位于新消费者之后的既有消费者随后可能被分配到不同的分区，这些消费者会丢失在重新平衡之前发送的请求的响应消息。

为了防止 `ClientKafkaProxy` 消费者丢失响应消息，Nest 使用内置的自定义分区分配器。在重新平衡期间，它让每个现有消费者保留其之前被分配的回复分区，并将剩余分区分配给其他消费者。

#### 正则表达式模式

KafkaJS 支持通过正则表达式订阅主题。从 NestJS v12 开始，你可以直接将 `RegExp` 传递给 `@MessagePattern()` 或 `@EventPattern()`。Nest 会保留该模式，将其转发给 KafkaJS 的 `subscribe()` 调用，并在为传入主题解析处理器时回退到正则表达式匹配。

```typescript
@EventPattern(/^hero\..+$/)
handleHeroEvents(@Payload() data: any, @Ctx() context: KafkaContext) {
  console.log(`Topic: ${context.getTopic()}`);
}

```

这会将处理器订阅到与该表达式匹配的每个主题（`hero.kill.dragon`、`hero.rescue.villager` 等等），而无需逐个显式注册。使用 `context.getTopic()` 可以查明是哪个主题传递了该消息。

> info **提示** 正则表达式模式是 Kafka 特有的能力；其他传输器仍然按精确值匹配模式。Nest 在匹配前会重置 `lastIndex`，因此全局（`/g`）和粘性（`/y`）表达式不会产生有状态的匹配失败。

#### 消息响应订阅

> warning **注意** 本节仅在你使用 [request-response](/microservices/basics#请求-响应) 消息风格（`@MessagePattern()` 装饰器和 `ClientKafkaProxy.send()` 方法）时才相关。对于 [event-based](/microservices/basics#event-based) 通信（`@EventPattern()` 装饰器和 `ClientKafkaProxy.emit()` 方法），无需订阅响应主题。

`ClientKafkaProxy` 提供了 `subscribeToResponseOf()` 方法，该方法以请求的主题名称作为参数，并将派生出的回复主题名称添加到回复主题集合中。在实现消息模式时，此方法是必需的。

```typescript title="heroes.controller.ts"
onModuleInit() {
  this.client.subscribeToResponseOf('hero.kill.dragon');
}

```

如果 `ClientKafkaProxy` 实例是异步创建的，请在调用 `connect()` 方法之前先调用 `subscribeToResponseOf()` 方法。

```typescript title="heroes.controller.ts"
async onModuleInit() {
  this.client.subscribeToResponseOf('hero.kill.dragon');
  await this.client.connect();
}

```

#### 传入

Nest 将传入的 Kafka 消息接收为带有 `key`、`value` 和 `headers` 属性的对象，这些属性的值类型为 `Buffer`。Nest 通过将缓冲区转换为字符串来解析这些值。如果字符串"类似对象"（即，以花括号或方括号开头），Nest 会尝试将其解析为 JSON，但用于路由回复的 `kafka_correlationId`、`kafka_replyTopic` 和 `kafka_replyPartition` 头除外，它们始终保留为字符串。随后 `value` 会被传递给关联的处理器。

Nest 不会解码解压缩后大于 16 MiB 的消息，计算范围包括其键、其头，以及（除非设置了 `parser.keepBinary`）其值。它会记录并跳过该消息，以便提交其偏移量，而 `ClientKafkaProxy` 会使该回复所应答的请求失败。要更改该限制，请设置 `parser.maxMessageSize` 选项。

#### 传出

Nest 在发布事件或发送消息之前会序列化传出的 Kafka 消息。序列化适用于传递给 `ClientKafkaProxy` `emit()` 和 `send()` 方法的参数，以及从 `@MessagePattern()` 方法返回的值。它通过使用 `JSON.stringify()` 或 `toString()` 原型方法，将非字符串或缓冲区的值"字符串化"。

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

> info **提示** `@Payload()` 是从 `@nestjs/microservices` 包导入的。

你也可以通过传递带有 `key` 和 `value` 属性的对象来为传出消息设置键。为消息设置键对于满足 [co-partitioning requirement](https://docs.confluent.io/current/ksql/docs/developer-guide/partition-data.html#co-partitioning-requirements) 很重要。

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

以这种格式传递的消息还可以包含在 `headers` 属性中设置的自定义头。头的值必须为 `string` 或 `Buffer` 类型，并且一条消息最多可以携带 10,000 个，数组值按每个项计一次。Nest 不会发送超过此数量的消息：`emit()` 和 `send()` 会失败，而 `@MessagePattern()` 回复会被记录并丢弃。

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

虽然请求-响应方法非常适合在服务之间交换消息，但当你的消息风格是基于事件的（这对 Kafka 来说很理想）时，即当你想要**不等待响应**就发布事件时，它就不太适用了。在这种情况下，你不会想要承担请求-响应所要求的维护两个主题的开销。

请参阅 [Overview: Event-based](/microservices/basics#event-based) 和 [Overview: Publishing events](/microservices/basics#publishing-events) 了解更多信息。

#### 上下文

在更复杂的场景中，你可能需要有关传入请求的额外信息。使用 Kafka 传输器时，你可以访问 `KafkaContext` 对象。

```typescript
@MessagePattern('hero.kill.dragon')
killDragon(@Payload() message: KillDragonMessage, @Ctx() context: KafkaContext) {
  console.log(`Topic: ${context.getTopic()}`);
}

```

> info **提示** `@Payload()`、`@Ctx()` 和 `KafkaContext` 是从 `@nestjs/microservices` 包导入的。

要访问原始的 Kafka `IncomingMessage` 对象，请使用 `KafkaContext` 对象的 `getMessage()` 方法，如下所示：

```typescript
@MessagePattern('hero.kill.dragon')
killDragon(@Payload() message: KillDragonMessage, @Ctx() context: KafkaContext) {
  const originalMessage = context.getMessage();
  const partition = context.getPartition();
  const { headers, timestamp } = originalMessage;
}

```

`IncomingMessage` 对象满足以下接口：

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

如果你的处理器处理每条消息需要很长时间，请考虑使用 `heartbeat` 回调。要获取 `heartbeat` 函数，请使用 `KafkaContext` 的 `getHeartbeat()` 方法，如下所示：

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

Kafka 微服务组件会将其角色的描述追加到 `client.clientId` 和 `consumer.groupId` 选项中，以防止 Nest 微服务客户端和服务端组件之间发生冲突。默认情况下，`ClientKafkaProxy` 组件会向这两个选项追加 `-client`，而 `ServerKafka` 组件会追加 `-server`。下面的注释展示了所提供的值是如何被转换的。

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

> info **提示** 要更改追加的后缀，请设置 `postfixId` 选项。要进一步自定义客户端和消费者的命名约定，请在你自己的自定义提供者中扩展 `ClientKafka` 和 `ServerKafka` 类并重写构造函数。

由于 Kafka 微服务的消息模式使用两个主题分别用于请求和回复通道，因此回复模式派生自请求主题。默认情况下，回复主题的名称是请求主题名称加上 `.reply`。

```typescript title="heroes.controller.ts"
onModuleInit() {
  this.client.subscribeToResponseOf('hero.get'); // hero.get.reply
}

```

> info **提示** 要自定义回复主题的命名约定，请在你自己的自定义提供者中扩展 `ClientKafka` 类并重写 `getResponsePatternName()` 方法。

#### 可重试异常

与其他传输器一样，未处理的异常会自动转换为“用户友好”的格式。然而，在某些边缘情况下，你可能希望绕过此机制，改为让 `kafkajs` 驱动消费异常。在处理消息时抛出异常会指示 `kafkajs` **重试**它（重新投递），这意味着即使消息（或事件）处理器已被触发，偏移量也不会提交到 Kafka。

> warning **警告** 对于事件处理器（基于事件的通信），默认情况下所有未处理的异常都被视为**可重试异常**。

对于消息处理器，请使用专用的 `KafkaRetriableException` 类，如下所示：

```typescript
throw new KafkaRetriableException('...');

```

> info **提示** `KafkaRetriableException` 类从 `@nestjs/microservices` 包中导出。

> warning **警告** 只有当消息携带 `ClientKafkaProxy.send()` 添加的 `kafka_correlationId` 和 `kafka_replyTopic` 头时，Nest 才会将其作为请求处理。任何其他消息，例如由非 Nest 的生产者写入的消息，都会被当作事件处理，即使它到达了 `@MessagePattern()` 处理器：其未处理的异常是可重试的，并且只有当处理器返回的流完成后，才会处理该分区的下一条消息。对于其他生产者写入的主题，请确保消息处理器返回会完成的流，并处理它们无法处理的消息而不是抛出异常，除非这些消息应当被重新投递。

#### 自定义异常处理

除了默认的错误处理机制外，你还可以为 Kafka 事件创建自定义异常过滤器来管理重试逻辑。例如，下面的过滤器在可配置的重试次数后跳过有问题的事件：

```typescript
import { Catch, ArgumentsHost, ExceptionFilter, Logger } from '@nestjs/common';
import { KafkaContext } from '@nestjs/microservices';
import { Producer } from 'kafkajs';

@Catch()
export class KafkaMaxRetryExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(KafkaMaxRetryExceptionFilter.name);

  constructor(
    private readonly producer: Producer,
    private readonly maxRetries: number,
    // Optional custom function executed when max retries are exceeded
    private readonly skipHandler?: (message: any) => Promise<void>,
  ) {}

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
      // Rethrow so that KafkaJS retries the message
      throw exception;
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

该过滤器会将 Kafka 事件的处理重试至可配置的次数。当发生异常时，它会将消息重新发布到同一主题，并递增 `retry-count` 头，然后提交当前偏移量。一旦达到最大重试次数，它会调用自定义的 `skipHandler`（如果提供），并提交偏移量，跳过有问题的事件。这样后续事件就可以不受中断地继续处理。

你可以全局注册此过滤器，也可以在控制器级别注册。它需要一个 Kafka 生产者实例：

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

请确保在你的模块中提供 Kafka 生产者：

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

在使用 Kafka 时，提交偏移量至关重要。默认情况下，消息会在特定时间后自动提交（参见 [KafkaJS autocommit documentation](https://kafka.js.org/docs/consuming#autocommit)）。`KafkaContext` 让你可以访问活动的消费者，以便手动提交偏移量。该消费者是 KafkaJS 消费者，其工作方式类似于 [native KafkaJS implementation](https://kafka.js.org/docs/consuming#manual-committing)。

```typescript
@EventPattern('user.created')
async handleUserCreated(@Payload() data: IncomingMessage, @Ctx() context: KafkaContext) {
  // business logic

  const { offset } = context.getMessage();
  const partition = context.getPartition();
  const topic = context.getTopic();
  const consumer = context.getConsumer();
  // Commit the next offset to consume (i.e., current offset + 1)
  await consumer.commitOffsets([
    { topic, partition, offset: (Number(offset) + 1).toString() },
  ]);
}

```

要禁用自动提交，请在 `run` 配置中设置 `autoCommit: false`，如下所示：

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

要获取连接和底层驱动实例状态的实时更新，请订阅 `status` 流。该流提供特定于所选驱动的状态更新。对于 Kafka 驱动，`status` 流会发出 `connected`、`disconnected`、`rebalancing`、`crashed` 和 `stopped` 事件。

```typescript
this.client.status.subscribe((status: KafkaStatus) => {
  console.log(status);
});

```

> info **提示** `KafkaStatus` 类型从 `@nestjs/microservices` 包中导入。

同样，你可以订阅服务端的 `status` 流，以接收有关服务端状态的通知：

```typescript
const server = app.connectMicroservice<MicroserviceOptions>(...);
server.status.subscribe((status: KafkaStatus) => {
  console.log(status);
});

```

#### 底层生产者和消费者

对于更高级的用例，你可能需要访问底层的生产者和消费者实例，例如手动关闭连接或使用特定于驱动的方法。然而，在大多数情况下，你**不应该需要**直接访问驱动。

为此，请使用 `ClientKafkaProxy` 实例暴露的 `producer` 和 `consumer` 属性。

```typescript
const producer = this.client.producer;
const consumer = this.client.consumer;

```