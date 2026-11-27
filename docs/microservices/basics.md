<!-- 此文件从 content/microservices/basics.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:18:55.984Z -->
<!-- 源文件: content/microservices/basics.md -->
<!-- 源哈希: ee02e25fc5bb2b8e4022105795a58a41 -->

### 概述

除了传统的（有时称为单体）应用程序架构外，Nest 原生支持微服务架构风格的开发。文档其他地方讨论的大多数概念，例如依赖注入、装饰器、异常过滤器、管道、守卫和拦截器，同样适用于微服务。在可能的情况下，Nest 抽象了实现细节，使得相同的组件可以在基于 HTTP 的平台、WebSocket 和微服务上运行。本节涵盖了 Nest 中特定于微服务的方面。

在 Nest 中，微服务本质上是使用不同于 HTTP 的**传输器**层的应用程序。

> info **提示** 对于通过 RabbitMQ 通信的两个完整服务，涉及事件、请求-响应、重试、死信队列以及可存活于崩溃中的消息，请参阅 [Build microservices in Node.js with RabbitMQ](/tutorials/microservices-rabbitmq)。

<figure><img class="illustrative-image" src="/assets/Microservices_1.png" /></figure>

Nest 支持几种内置的传输器层实现，称为**传输器**，它们负责在不同的微服务实例之间传输消息。大多数传输器原生支持**请求-响应**和**事件模式**两种消息风格。Nest 在两种风格背后都提供了一个规范的接口来抽象每个传输器的实现细节。这允许您在不更改应用程序代码的情况下，从一个传输层切换到另一个传输层（例如，利用特定传输层的可靠性或性能特性）。

#### 安装

要开始构建微服务，首先安装所需的包：

```bash
$ npm i --save @nestjs/microservices

```

#### 入门

要实例化一个微服务，请使用 `NestFactory` 类的 `createMicroservice()` 方法：

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.TCP,
    },
  );
  await app.listen();
}
await bootstrap();

```

> info **提示** 微服务默认使用 **TCP** 传输层。

`createMicroservice()` 方法的第二个参数是一个具有两个成员的 `options` 对象：

<table>
  <tr>
    <td><code>transport</code></td>
    <td>指定传输器（例如，<code>Transport.NATS</code>）</td>
  </tr>
  <tr>
    <td><code>options</code></td>
    <td>一个特定于传输器的选项对象，用于确定传输器行为</td>
  </tr>
</table>
<p>
  <code>options</code> 对象是特定于所选传输器的。<strong>TCP</strong> 传输器暴露了下面描述的属性。对于其他传输器（例如 Redis 或 MQTT），请参阅相关章节了解可用选项的描述。
</p>
<table>
  <tr>
    <td><code>host</code></td>
    <td>连接主机名（默认值：<code>'localhost'</code>）。从 NestJS v12.5 开始，空值（<code>undefined</code>、<code>null</code> 或 <code>''</code>）也表示 <code>'localhost'</code>，因此需要其他主机连接的服务器（例如在容器中运行的服务器）必须设置 <code>'0.0.0.0'</code> 或 <code>'::'</code></td>
  </tr>
  <tr>
    <td><code>port</code></td>
    <td>连接端口（默认值：<code>3000</code>）</td>
  </tr>
  <tr>
    <td><code>retryAttempts</code></td>
    <td>服务器在意外关闭后再次尝试监听的次数（默认值：<code>0</code>）</td>
  </tr>
  <tr>
    <td><code>retryDelay</code></td>
    <td>这些尝试之间的延迟（毫秒）（默认值：<code>0</code>）</td>
  </tr>
  <tr>
    <td><code>serializer</code></td>
    <td>用于传出消息的自定义 <a href="https://github.com/nestjs/nest/blob/master/packages/microservices/interfaces/serializer.interface.ts" target="_blank">serializer</a></td>
  </tr>
  <tr>
    <td><code>deserializer</code></td>
    <td>用于接收消息的自定义 <a href="https://github.com/nestjs/nest/blob/master/packages/microservices/interfaces/deserializer.interface.ts" target="_blank">deserializer</a></td>
  </tr>
  <tr>
    <td><code>socketClass</code></td>
    <td>一个扩展了 <code>TcpSocket</code> 的自定义 Socket（默认值：<code>JsonSocket</code>）</td>
  </tr>
  <tr>
    <td><code>tlsOptions</code></td>
    <td>用于配置 TLS 协议的选项（参见 <a href="/microservices/basics#tls-support">TLS 支持</a>）</td>
  </tr>
  <tr>
    <td><code>maxBufferSize</code></td>
    <td>单个传入数据包的最大长度（字符数）（默认值：<code>16 * 1024 * 1024</code>）。声明长度大于此的数据包在任何数据被缓冲之前即被拒绝，连接将被断开。从 NestJS v12.5 开始，此限制适用于每个数据包，其默认值已从 <code>128 * 1024 * 1024</code> 降低。客户端会为其接收的回复应用其自身的 <code>maxBufferSize</code>
  </tr>
  <tr>
    <td><code>incompleteMessageTimeout</code></td>
    <td>对等方在数据包中间保持静默的最长时间（毫秒），在此期间连接将被断开。设置为 <code>0</code> 可禁用（默认值：<code>30000</code>）</td>
  </tr>
  <tr>
    <td><code>messageReceiveTimeout</code></td>
    <td>对等方从第一个字符到最后一个字符发送单个数据包的最长时间（毫秒），在此期间连接将被断开。与 <code>incompleteMessageTimeout</code> 不同，后续读取不会延长此时间。设置为 <code>0</code> 可禁用（默认值：<code>300000</code>）</td>
  </tr>
  <tr>
    <td><code>maxSendBufferSize</code></td>
    <td>在连接断开之前，可能排队等待读取的对等方响应字节的最大数量。设置为 <code>0</code> 可禁用（默认值：128MB）</td>
  </tr>
  <tr>
    <td><code>drainTimeout</code></td>
    <td>在连接断开之前，为对等方排队的响应在没有被写入的情况下可以持续的最长时间（毫秒）。设置为 <code>0</code> 可禁用（默认值：<code>30000</code>）</td>
  </tr>
  <tr>
    <td><code>maxConcurrentMessages</code></td>
    <td>单个对等方可以同时处理的消息数量。一个消息在它的处理器和返回的流稳定之前都会被计数。后续消息等待，一旦等待的消息超过 <code>maxBufferSize</code> 个字符，则暂停从对等方读取。如果在此之后没有待处理的消息在 <code>drainTimeout</code> 内稳定，则连接将被断开。设置为 <code>0</code> 可禁用（默认值：<code>1000</code>）</td>
  </tr>
  <tr>
    <td><code>gracefulShutdown</code></td>
    <td>启用优雅关闭。启用后，关闭服务器会保持正在处理请求或事件的连接保持打开状态，直到它们完成，并且不再接收来自这些连接的消息。其他连接会立即关闭（默认值：<code>false</code>）</td>
  </tr>
  <tr>
    <td><code>gracePeriod</code></td>
    <td>当启用 <code>gracefulShutdown</code> 时，在每个连接关闭之前的最长时间（毫秒）（默认值：<code>10000</code>）</td>
  </tr>
</table>

任何不是数字的 `maxBufferSize`、`incompleteMessageTimeout`、`messageReceiveTimeout`、`maxSendBufferSize`、`drainTimeout` 或 `maxConcurrentMessages`，例如 `NaN` 对未设置的环境变量所做的，将获得其默认值。

#### 消息和事件模式

微服务通过**模式**识别消息和事件。模式是一个纯值，例如字面量对象或字符串。模式会自动序列化并通过网络发送，同时包含消息的数据部分。这样，消息发送者和消费者就可以协调哪些请求由哪些处理器消费。

Nest 通过键和值将对象模式与其处理器匹配，限制如下：最多 5 层嵌套，每个对象（或数组项）最多 20 个键，键长度最多 256 个字符，字符串值长度最多 4096 个字符，整个模式中最多 100 个键。超出这些限制的部分，或整个模式超过 100 个键的部分，在匹配前会被替换为标记，例如 `[TOO_MANY_KEYS]`，因此请将处理器的模式限制在这些范围内。作为 JSON 文本到达的模式长度超过 1 MiB 的，将作为纯字符串匹配，而不会被解析。

#### 请求-响应

请求-响应消息风格在需要在服务之间**交换**消息时非常有用。它确保服务确实接收到了消息，而无需手动实现确认协议。然而，请求-响应并非总是最佳选择。例如，使用基于日志持久化的流式平台，如 [Kafka](https://docs.confluent.io/3.0.0/streams/) 或 [NATS JetStream](https://docs.nats.io/nats-concepts/jetstream)，是针对不同挑战进行优化的，更符合事件消息范式（有关更多详细信息，请参阅 [event-based messaging](/microservices/basics#event-based)）。

要启用请求-响应消息类型，Nest 会创建两个逻辑通道：一个用于数据传输，另一个用于等待传入的响应。对于某些底层传输器，如 [NATS](https://nats.io/)，这种双通道支持是开箱即用的。对于其他传输器，Nest 通过手动创建单独的通道来补偿，这可能会引入一些开销。如果不需要请求-响应消息风格，请考虑使用基于事件的方法。

要基于请求-响应范式创建消息处理器，请使用从 `@nestjs/microservices` 包导入的 `@MessagePattern()` **装饰器**。仅在 [controller](/overview/controllers) 类中使用此装饰器，因为这些类充当应用程序的入口点。Nest 运行时会忽略它在提供者中的使用。

```typescript title="math.controller.ts"
import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';

@Controller()
export class MathController {
  @MessagePattern({ cmd: 'sum' })
  accumulate(data: number[]): number {
    return (data || []).reduce((a, b) => a + b);
  }
}

```

在上述代码中，`accumulate()` **消息处理器** 监听匹配 `{ cmd: 'sum' }` 消息模式的消息。消息处理器接收一个参数，即从客户端传递的 `data`。在这种情况下，数据是一个需要累加的数字数组。

#### 异步响应

消息处理器可以同步或**异步**响应，因此支持 `async` 方法。

```typescript
@MessagePattern({ cmd: 'sum' })
async accumulate(data: number[]): Promise<number> {
  return (data || []).reduce((a, b) => a + b);
}

```

消息处理器还可以返回一个 `Observable`，在这种情况下，结果值会持续发出直到流完成。

```typescript
@MessagePattern({ cmd: 'sum' })
accumulate(data: number[]): Observable<number> {
  return from([1, 2, 3]);
}

```

在上面的示例中，消息处理器**响应了三次**，对应数组中的每个项。

#### 基于事件

虽然请求-响应方法适用于服务间交换消息，但它不太适合基于事件的消息传递，在这种模式下，您希望发布**事件**而无需等待响应。在这种情况下，维护请求-响应所需两个通道的开销是不必要的。

例如，如果您想通知另一个服务系统中的特定条件已发生，请使用基于事件的消息风格。

要创建事件处理器，请使用从 `@nestjs/microservices` 包导入的 `@EventPattern()` **装饰器**。

```typescript
@EventPattern('user_created')
async handleUserCreated(data: Record<string, unknown>) {
  // business logic
}

```

> info **提示** 您可以为**单个**事件模式注册多个事件处理器，Nest 会并行触发所有这些处理器。

`handleUserCreated()` **事件处理器** 监听 `'user_created'` 事件。事件处理器接收一个参数，即从客户端传递的 `data`（在这种情况下，通过网络发送的事件负载）。

<app-banner-enterprise></app-banner-enterprise>

#### 附加请求详情

在更高级的场景中，您可能需要有关传入请求的附加详细信息。例如，在使用带有通配符订阅的 NATS 时，您可能希望检索生产者发送消息的原始主题。同样，在使用 Kafka 时，您可能需要访问消息头。为此，请使用下面显示的内置**装饰器**：

```typescript
@MessagePattern('time.us.*')
getDate(@Payload() data: number[], @Ctx() context: NatsContext) {
  console.log(`Subject: ${context.getSubject()}`); // e.g. "time.us.east"
  return new Date().toLocaleTimeString(...);
}

```

> info **提示** `@Payload()`、`@Ctx()` 和 `NatsContext` 从 `@nestjs/microservices` 导入。

> info **提示** 您还可以向 `@Payload()` **装饰器** 传递一个属性键，以从传入的负载对象中提取特定属性，例如 `@Payload('id')`。要根据**模式**验证负载，请参阅 [microservice pipes](/microservices/pipes)。

#### 客户端（生产者类）

客户端 Nest 应用程序可以使用 `ClientProxy` 类与 Nest 微服务交换消息或发布事件。该类提供了与远程微服务通信的多个方法，例如 `send()`（用于请求-响应消息）和 `emit()`（用于事件驱动消息）。可以通过以下方式获取此类的实例。

一种方法是导入 `ClientsModule`，它暴露了静态 `register()` 方法。此方法接受一个表示微服务**传输器**的对象的数组。每个对象必须包含一个 `name` 属性，可以包含一个 `transport` 属性（如果省略，Nest 使用 `Transport.TCP`）和一个 `options` 属性。

`name` 属性充当一个**注入令牌**，您可以使用它在任何需要的地方注入 `ClientProxy` 的实例。其值可以是任何字符串或 JavaScript 符号，如 [non-class-based provider tokens](/fundamentals/dependency-injection#非基于类的提供者令牌) 所述。

`options` 属性是一个对象，具有我们在 `createMicroservice()` 方法中看到的相同属性。

```typescript
@Module({
  imports: [
    ClientsModule.register([
      { name: 'MATH_SERVICE', transport: Transport.TCP },
    ]),
  ],
})

```

或者，如果需要在设置期间提供配置或执行其他异步过程，请使用 `registerAsync()` 方法。

```typescript
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        imports: [ConfigModule],
        name: 'MATH_SERVICE',
        useFactory: async (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get('HOST'),
            port: configService.get('PORT'),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
})

```

导入**模块**后，使用 `@Inject()` **装饰器**注入为 `'MATH_SERVICE'` **传输器**配置的 `ClientProxy` 实例。

```typescript
constructor(
  @Inject('MATH_SERVICE') private client: ClientProxy,
) {}

```

> info **提示** `ClientsModule` 和 `ClientProxy` 类从 `@nestjs/microservices` 包导入。

有时，您可能需要从另一个服务（例如 `ConfigService`）获取**传输器**配置，而不是在客户端应用程序中硬编码。为此，请使用 `ClientProxyFactory` 类注册一个 [custom provider](/fundamentals/dependency-injection)。该类提供了一个静态 `create()` 方法，接受一个**传输器**选项对象并返回一个定制的 `ClientProxy` 实例。

```typescript
@Module({
  providers: [
    {
      provide: 'MATH_SERVICE',
      useFactory: (configService: ConfigService) => {
        const mathSvcOptions = configService.getMathSvcOptions();
        return ClientProxyFactory.create(mathSvcOptions);
      },
      inject: [ConfigService],
    }
  ]
  ...
})

```

> info **提示** `ClientProxyFactory` 类从 `@nestjs/microservices` 包导入。

另一种选择是使用 `@Client()` 属性**装饰器**。

```typescript
@Client({ transport: Transport.TCP })
client: ClientProxy;

```

> info **提示** `@Client()` **装饰器**从 `@nestjs/microservices` 包导入。

`@Client()` **装饰器**不是首选技术，因为这样创建的客户端更难测试也更难共享。

`ClientProxy` 是**延迟加载**的。它不会立即建立连接。相反，在第一次微服务调用之前建立连接，并为后续每次调用重用该连接。如果您想延迟应用程序引导过程直到建立连接，请在 `onApplicationBootstrap()` **生命周期钩子**内部使用 `ClientProxy` 对象的 `connect()` 方法手动建立连接。

```typescript
async onApplicationBootstrap() {
  await this.client.connect();
}

```

如果无法创建连接，`connect()` 方法将以相应的错误对象拒绝。

#### 发送消息

`ClientProxy` 暴露了一个 `send()` 方法，该方法调用微服务并返回带有其响应的 `Observable`。

```typescript
accumulate(): Observable<number> {
  const pattern = { cmd: 'sum' };
  const payload = [1, 2, 3];
  return this.client.send<number>(pattern, payload);
}

```

`send()` 方法接受两个参数，`pattern` 和 `payload`。`pattern` 应匹配 `@MessagePattern()` 装饰器中定义的一个。`payload` 是要传输到远程微服务的消息。此方法返回一个**冷 `Observable`**，这意味着在发送消息之前必须显式地订阅它。

#### 发布事件

要发送事件，请使用 `ClientProxy` 对象的 `emit()` 方法。此方法将事件发布到消息代理。

```typescript
async publish() {
  this.client.emit<number>('user_created', new UserCreatedEvent());
}

```

`emit()` 方法接受两个参数，`pattern` 和 `payload`。`pattern` 应匹配 `@EventPattern()` 装饰器中定义的一个，而 `payload` 是要传输到远程微服务的事件数据。此方法返回一个**热 `Observable`**（与 `send()` 返回的冷 `Observable` 不同），这意味着代理会立即尝试投递事件，无论您是否订阅该 Observable。

<app-banner-observe></app-banner-observe>

#### 请求作用域

如果您来自不同的编程语言背景，可能会惊讶于在 Nest 中，大多数内容会在传入的请求之间共享。这包括数据库连接池、具有全局状态的单例服务等。Node.js 不遵循请求/响应多线程无状态模型，即每个请求由一个单独的线程处理。因此，使用单例实例对您的应用程序是**安全**的。

然而，在某些边缘情况下，可能需要处理程序的基于请求的生命周期，例如 GraphQL 应用程序中的每次请求缓存、请求跟踪或多租户。请在 [injection scopes](/fundamentals/provider-scopes) 章了解如何控制作用域。

请求作用域的处理程序和提供者可以使用 `@Inject()` 装饰器结合 `CONTEXT` 令牌注入 `RequestContext`：

```typescript
import { Injectable, Scope, Inject } from '@nestjs/common';
import { CONTEXT, type RequestContext } from '@nestjs/microservices';

@Injectable({ scope: Scope.REQUEST })
export class CatsService {
  constructor(@Inject(CONTEXT) private ctx: RequestContext) {}
}

```

这提供了对 `RequestContext` 对象的访问，其形状如下：

```typescript
export interface RequestContext<TData = any, TContext extends BaseRpcContext = any> {
  pattern: string | Record<string, any>;
  data: TData;
  context?: TContext;
  getData(): TData;
  getPattern(): string | Record<string, any>;
  getContext(): TContext;
}

```

`data` 属性是消息生产者发送的消息负载。`pattern` 属性是用于识别传入消息处理程序的模式。`context` 属性包含传输器特定的上下文对象（例如 `NatsContext`），即 `@Ctx()` 装饰器注入的相同对象。

#### 实例状态更新

要获取连接和底层驱动实例状态的实时更新，请订阅 `status` 流。此流提供特定于所选驱动的状态更新。例如，对于 TCP 传输器（默认），`status` 流会发出 `connected` 和 `disconnected` 事件。

```typescript
this.client.status.subscribe((status: TcpStatus) => {
  console.log(status);
});

```

> info **提示** `TcpStatus` 类型是从 `@nestjs/microservices` 包导入的。

类似地，您可以订阅服务器的 `status` 流以接收有关服务器状态的通知。

```typescript
const server = app.connectMicroservice<MicroserviceOptions>(...);
server.status.subscribe((status: TcpStatus) => {
  console.log(status);
});

```

#### 监听内部事件

在某些情况下，您可能希望监听微服务发出的内部事件。例如，您可以监听 `error` 事件，以便在发生错误时触发附加操作。为此，请使用 `on()` 方法：

```typescript
this.client.on('error', (err) => {
  console.error(err);
});

```

类似地，您可以监听服务器的内部事件：

```typescript
server.on<TcpEvents>('error', (err) => {
  console.error(err);
});

```

> info **提示** `TcpEvents` 类型是从 `@nestjs/microservices` 包导入的。

对于 TCP 传输器，从 NestJS v12.1.1 开始，使用客户端的 `on()` 方法注册的监听器会一直注册，直到您调用 `close()`，因此它们也会附加到客户端在连接关闭后下一次 `send()` 或 `emit()` 调用中打开的新套接字上。注册不会去重，因此请只注册一次每个监听器，而不是从其回调或每次重新连接后再次注册。

#### 底层驱动访问

对于更高级的用例，您可能需要访问底层驱动实例，例如手动关闭连接或使用驱动特定的方法。然而，在大多数情况下，您**不应该**直接访问驱动。

为此，请使用 `unwrap()` 方法，它返回底层驱动实例。泛型类型参数指定了您期望的驱动实例类型。

```typescript
const netSocket = this.client.unwrap<Socket>();

```

在这里，`Socket` 是从 `net` 模块导入的类型。

类似地，您可以访问服务器的底层驱动实例：

```typescript
const netServer = server.unwrap<Server>();

```

#### 处理超时

在分布式系统中，微服务有时会宕机或不可用。为避免无限期等待，请使用 [RxJS](https://rxjs.dev) `timeout` 运算符为微服务调用应用超时。如果微服务在指定时间内没有响应，则会抛出错误，您可以捕获并适当处理该错误。

在管道内应用 `timeout` 运算符：

```typescript
this.client
  .send<TResult, TInput>(pattern, data)
  .pipe(timeout(5000));

```

> info **提示** `timeout` 运算符是从 `rxjs/operators` 包导入的。

如果微服务在 5 秒内没有响应，则会以 `TimeoutError` 错误，错误代码为 `Observable`。

#### 随每条消息发送元数据

要将非负载部分的值（关联 ID、租户、区域设置）附加到每个传出的请求和事件上，请使用 `setOnDispatchHook()` 在客户端注册一个钩子。该钩子在每个数据包发送到传输器之前接收它，并可能分配 `packet.metadata`，一个字符串值记录：

```typescript
client.setOnDispatchHook((packet) => {
  packet.metadata = { 'x-correlation-id': getCorrelationId() };
});

```

不要替换钩子中的 `pattern` 或 `data`。在接收端，使用传输上下文的 `getMetadata()` 读取值（`TcpContext`、`RedisContext`、`NatsContext`、`RmqContext`、`MqttContext` 或 `KafkaContext`）：

```typescript
@MessagePattern('orders.create')
create(@Payload() data: CreateOrderDto, @Ctx() context: NatsContext) {
  const correlationId = context.getMetadata()?.['x-correlation-id'];
}

```

TCP 和 Redis 将元数据包含在数据包内部。NATS、Kafka、RabbitMQ、MQTT 5 和 gRPC 将其作为消息头（gRPC：调用元数据）在钩子中指定名称下携带，绝不包含在负载中。设置在记录本身上的头部，例如使用 `NatsRecordBuilder`、`RmqRecordBuilder` 或 `MqttRecordBuilder`，会覆盖同名元数据条目。MQTT 3 没有头部通道，因此元数据不会通过它传输。

> info **提示** 在 NATS、Kafka 和 RabbitMQ 上，`getMetadata()` 只返回具有单个字符串值的头部，在 MQTT 上只返回具有单个值的用户属性。使用 `getHeaders()` (NATS)、`getMessage()` (Kafka, RabbitMQ) 或 `getPacket()` (MQTT) 读取其他值。

#### 跨服务追踪请求

超时表示调用未及时返回。它没有说明时间花费在了*哪里*，在一个由五个服务通过 TCP、NATS 和 Kafka 通信的系统中，这就是关键问题。一个耗时 3 秒的网关请求，可能其中 2.9 秒花费在了任何人都未曾怀疑的下游服务中，而每个服务的日志都显示一切正常。

通常的修复方法是手动通过每种传输方式传播一个关联 ID，然后事后将时间线重新拼接起来。[NestJS Observe](https://www.observe.nestjs.com/ 'NestJS Observe') 为您完成了这种拼接。使用 `@nestjs/observe` SDK 增强每个服务，并在传输方式已有的任何通道（Kafka 头部、NATS 头部或 TCP 有效载荷上的字段）上转发追踪 ID，仪表板就会重新组装一个跨所有参与服务的瀑布图：

<figure><img src="https://www.observe.nestjs.com/docs/telemetry/service-flow.webp" alt="Trace correlation across services" /></figure>

从那时起，超时就不再是谜团了。您可以看到网关的 `send()` 等待、消费者接收消息（以及消息等待了多长时间），处理程序内部运行时间过长的查询，以及它最终抛出的带有源行的错误，所有这些都在同一时间轴上。消息和事件处理程序会自动增强，因此 `@MessagePattern()` 和 `@EventPattern()` 处理程序显示为操作，无需手动连接跨度。

转发追踪 ID 是唯一需要应用代码的部分，因为只有您知道您的传输方式释放了哪个通道。有关每种传输方式的模式，请参阅 [Distributed tracing](/observability/distributed-tracing)，有关设置指南，请参阅 [Observability](/observability/overview) 章节。

#### TLS 支持

在私有网络外部通信时，请加密流量。TCP 传输器内置了基于 Node.js [TLS](https://nodejs.org/api/tls.html) 模块的 TLS 支持，允许您加密微服务与其客户端之间的通信。

要为 TCP 服务器启用 TLS，您需要 PEM 格式的私钥和证书。使用 `tlsOptions` 属性将它们添加到服务器的选项中：

```typescript
import * as fs from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const key = fs.readFileSync('<pathToKeyFile>', 'utf8').toString();
  const cert = fs.readFileSync('<pathToCertFile>', 'utf8').toString();

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.TCP,
      options: {
        tlsOptions: {
          key,
          cert,
        },
      },
    },
  );

  await app.listen();
}
await bootstrap();

```

为了使客户端能够通过 TLS 安全通信，还需要定义 `tlsOptions` 对象，这次使用 CA 证书，即签署服务器证书的授权的证书。这确保了客户端信任服务器的证书并可以建立安全连接。

```typescript
import * as fs from 'node:fs';
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'MATH_SERVICE',
        transport: Transport.TCP,
        options: {
          tlsOptions: {
            ca: [fs.readFileSync('<pathToCaFile>', 'utf-8').toString()],
          },
        },
      },
    ]),
  ],
})
export class AppModule {}

```

`ca` 属性接受一个数组，因此如果您的设置涉及多个受信任的授权，您可以列出多个 CA。

设置完成后，像往常一样使用 `@Inject()` 装饰器注入 `ClientProxy`。然后，您的微服务之间的通信就被加密了，Node.js 的 TLS 模块负责处理加密细节。

有关更多信息，请参阅 Node.js [TLS documentation](https://nodejs.org/api/tls.html)。

#### 动态配置

微服务的传输选项在任何提供者（例如来自 `@nestjs/config` 包的 `ConfigService`）可以被注入之前传递给 `createMicroservice()`。要使用注入的提供者配置微服务，请传递 `AsyncMicroserviceOptions`：Nest 会解析 `inject` 中列出的提供者，并将它们传递给 `useFactory` 函数，该函数返回传输选项。

```typescript
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AsyncMicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<AsyncMicroserviceOptions>(
    AppModule,
    {
      useFactory: (configService: ConfigService) => ({
        transport: Transport.TCP,
        options: {
          host: configService.get<string>('HOST'),
          port: configService.get<number>('PORT'),
        },
      }),
      inject: [ConfigService],
    },
  );

  await app.listen();
}
await bootstrap();

```

#### 与非 Nest 服务器通信

大多数微服务设置会与至少一个不了解 Nest 的系统通信：一个已在生产环境中的网关、一个用其他语言编写的工作进程、一个其他服务也消费的队列。在 TCP 和 Redis 传输器上传输的数据包具有固定形状，因此该系统可以在不使用 `@nestjs/microservices` 包的情况下调用处理程序并响应客户端。

一个请求有三个字段。`pattern` 选择处理程序（在 Redis 上，由通道决定，如下所述），`data` 是处理程序接收到的内容，而 `id` 将回复与其请求关联起来。`id` 是一个数字或最多 256 个字符的字符串：带有任何其他 `id` 的请求将没有回复，服务器会记录错误。

```json
{ "pattern": "sum", "data": [1, 2], "id": "b7e1c0" }

```

回复会重复 `id`，并携带一个 `response` 或一个 `err`。成功的回复还会设置 `isDisposed`，这告诉 Nest 客户端请求已完成：

```json
{ "id": "b7e1c0", "response": 3, "isDisposed": true }

```

没有 `isDisposed`，值仍然到达调用者，但 `send()` 永远不会完成：`lastValueFrom()` 和任何等待 Observable 关闭的内容都会挂起。当处理程序返回一个流时，Nest 服务器会为它发出的每个值发送一个回复，并在最后一个值发送后或流在发送完最后一个值后完成时，在单独的回复中设置 `isDisposed`，该回复不包含 `response`。

失败的请求会收到一个 `err`，无论 `isDisposed` 是否设置，都会结束请求：

```json
{ "id": "b7e1c0", "err": { "message": "Division by zero", "status": "error" } }

```

从回复中省略任何其他字段。Nest 客户端会接收一个包含其不期望的字段的数据包，对于非 Nest 回复的有效载荷，整个数据包就成为响应。

没有 `id` 的数据包被作为事件分派：处理程序运行，但没有内容返回。这就是 `emit()` 发送的形状：

```json
{ "pattern": "user_created", "data": { "id": 42 } }

```

到达的回复带有不同的 `id` 或没有 `id`，都不匹配任何请求，调用者会继续等待。`send()` 没有默认超时：除非调用者通过 `timeout()` 运算符（参见 [Handling timeouts](/microservices/basics#handling-timeouts)）管道传输，否则它会等待连接关闭，然后以 `Connection closed` 错误失败。`pattern` 也可以是对象而不是字符串，Nest 通过其键和值进行匹配，限制如 [message and event patterns](/microservices/basics#message-and-event-patterns) 所列。在 TCP 上，Nest 客户端将此类模式作为请求中的对象发送，但作为字符串发送，其路由在事件中，此时 `{ cmd: 'sum' }` 作为 `{"cmd":"sum"}` 到达。非 Nest 服务器应该接受这两种形式。

TCP 传输器不会将任何数据包作为纯 JSON 写入。服务器和客户端共享的套接字 `JsonSocket` 首先放置 JSON 文本的长度，然后是 `#`，最后是文本本身：

```typescript
import { connect } from 'node:net';

const packet = JSON.stringify({ pattern: 'sum', data: [1, 2], id: 'b7e1c0' });
const socket = connect({ host: 'localhost', port: 3000 }, () => {
  socket.write(`${packet.length}#${packet}`);
});

```

该长度计算的是 JSON 文本的 UTF-16 字符单元数，这是 JavaScript 中 `String#length` 返回的，而不是其字节数。写入字节数的对等方在包含非 ASCII 字符（如带音调的字母）的任何有效载荷上都会不同步，而计算 Unicode 码点的对等方（如 Python 中的 `len()`）在基本平面之外的字符（如表情符号）上会不同步。

Redis 传输器将数据包发布为纯 JSON 文本，在那里，数据包发布到的通道决定了处理程序，而不是其 `pattern` 字段。针对 `sum` 模式的请求或事件发布在 `sum` 通道上，而对请求的回复在 `sum.reply` 通道上。对象模式使用其路由作为通道名称，例如 `{"cmd":"sum"}`。

在 TCP 和 Redis 上，客户端使用 `setOnDispatchHook()` 附加的元数据在数据包的 `metadata` 字段中传输，这是一个字符串值的记录。其他传输方式将其作为头部携带，如 [sending metadata with every message](/microservices/basics#sending-metadata-with-every-message) 所述。