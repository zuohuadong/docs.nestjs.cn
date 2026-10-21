<!-- 此文件从 content/microservices/basics.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T09:51:18.440Z -->
<!-- 源文件: content/microservices/basics.md -->
<!-- 源哈希: 5e6a8b81b70ca46c30c33fc151116090 -->

### 概述

除了传统的（有时称为单体式）应用程序架构之外，Nest 原生支持微服务架构风格的开发。本文档其他地方讨论的大多数概念，例如依赖注入、装饰器、异常过滤器、管道、守卫和拦截器，同样适用于微服务。在可能的情况下，Nest 抽象了实现细节，以便相同的组件可以跨基于 HTTP 的平台、WebSockets 和微服务运行。本节涵盖 Nest 中特定于微服务的方面。

在 Nest 中，微服务本质上是一个使用不同于 HTTP 的**传输**层的应用程序。

<figure><img class="illustrative-image" src="/assets/Microservices_1.png" /></figure>

Nest 支持几种内置的传输层实现，称为**传输器**，它们负责在不同微服务实例之间传输消息。大多数传输器原生支持**请求-响应**和**基于事件**的消息风格。Nest 将每种传输器的实现细节抽象在两种风格的规范接口之后。这使你可以从一个传输层切换到另一个传输层（例如，利用特定传输层的可靠性或性能特性），而无需更改应用程序代码。

#### 安装

要开始构建微服务，首先安装所需的包：

```bash
$ npm i --save @nestjs/microservices

```

#### 入门

要实例化微服务，请使用 `NestFactory` 类的 `createMicroservice()` 方法：

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

`createMicroservice()` 方法的第二个参数是一个 `options` 对象，包含两个成员：

<table>
  <tr>
    <td><code>transport</code></td>
    <td>指定传输器（例如 <code>Transport.NATS</code>）</td>
  </tr>
  <tr>
    <td><code>options</code></td>
    <td>一个特定于传输器的选项对象，用于确定传输器的行为</td>
  </tr>
</table>
<p>
  <code>options</code> 对象特定于所选的传输器。<strong>TCP</strong> 传输器公开了下面描述的属性。对于其他传输器（例如 Redis 或 MQTT），请参阅相关章节以了解可用选项的说明。
</p>
<table>
  <tr>
    <td><code>host</code></td>
    <td>连接主机名</td>
  </tr>
  <tr>
    <td><code>port</code></td>
    <td>连接端口</td>
  </tr>
  <tr>
    <td><code>retryAttempts</code></td>
    <td>服务器在意外关闭后尝试再次监听的次数（默认值：<code>0</code>）</td>
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
    <td>用于传入消息的自定义 <a href="https://github.com/nestjs/nest/blob/master/packages/microservices/interfaces/deserializer.interface.ts" target="_blank">deserializer</a></td>
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
    <td>传入消息缓冲区的最大大小，以字符为单位（默认值：<code>(512 * 1024 * 1024) / 4</code>）</td>
  </tr>
  <tr>
    <td><code>incompleteMessageTimeout</code></td>
    <td>对端在数据包中途可以保持静默多长时间（毫秒），超过后连接将被断开。设置为 <code>0</code> 可禁用（默认值：<code>30000</code>）</td>
  </tr>
  <tr>
    <td><code>maxSendBufferSize</code></td>
    <td>对于未读取响应的对端，在连接被断开之前可以排队的最大响应字节数。设置为 <code>0</code> 可禁用（默认值：128MB）</td>
  </tr>
</table>

#### 消息和事件模式

微服务通过**模式**来识别消息和事件。模式是一个普通值，例如字面量对象或字符串。模式会自动序列化，并与消息的数据部分一起通过网络发送。这样，消息发送者和消费者可以协调哪些请求由哪些处理程序消费。

#### 请求-响应

当你需要在服务之间**交换**消息时，请求-响应消息风格很有用。它确保服务确实收到了消息，而无需你手动实现确认协议。然而，请求-响应并不总是最合适的。例如，使用基于日志持久化的流式平台，如 [Kafka](https://docs.confluent.io/3.0.0/streams/) 或 [NATS JetStream](https://docs.nats.io/nats-concepts/jetstream)，针对一组不同的挑战进行了优化，更符合事件消息传递范式（有关更多详细信息，请参见 [event-based messaging](/microservices/basics#event-based)）。

要启用请求-响应消息类型，Nest 会创建两个逻辑通道：一个用于传输数据，另一个用于等待传入的响应。对于某些底层传输器，如 [NATS](https://nats.io/)，这种双通道支持是开箱即用的。对于其他传输器，Nest 通过手动创建单独的通道来弥补，这可能会引入一些开销。如果你不需要请求-响应消息风格，请考虑改用基于事件的方法。

要基于请求-响应范式创建消息处理程序，请使用 `@MessagePattern()` 装饰器，它从 `@nestjs/microservices` 包中导入。仅在 [controller](/overview/controllers) 类中使用此装饰器，因为它们充当应用程序的入口点。Nest 运行时会在提供者中忽略它。

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

在上面的代码中，`accumulate()` **消息处理程序**监听与 `{ cmd: 'sum' }` 消息模式匹配的消息。消息处理程序接受一个参数，即从客户端传递的 `data`。在这种情况下，数据是一个要累加的数字数组。

#### 异步响应

消息处理程序可以同步或**异步**响应，因此支持 `async` 方法。

```typescript
@MessagePattern({ cmd: 'sum' })
async accumulate(data: number[]): Promise<number> {
  return (data || []).reduce((a, b) => a + b);
}

```

消息处理程序也可以返回一个 `Observable`，在这种情况下，结果值会被发出，直到流完成。

```typescript
@MessagePattern({ cmd: 'sum' })
accumulate(data: number[]): Observable<number> {
  return from([1, 2, 3]);
}

```

在上面的示例中，消息处理程序响应了**三次**，数组中的每一项响应一次。

#### 基于事件

虽然请求-响应方法非常适合在服务之间交换消息，但它不太适合基于事件的消息传递，在这种场景下，你希望发布**事件**而无需等待响应。在这种情况下，为请求-响应维护两个通道的开销是不必要的。

例如，如果你想通知另一个服务，系统的这一部分发生了某个特定条件，请使用基于事件的消息风格。

要创建事件处理程序，请使用 `@EventPattern()` 装饰器，它从 `@nestjs/microservices` 包中导入。

```typescript
@EventPattern('user_created')
async handleUserCreated(data: Record<string, unknown>) {
  // business logic
}

```

> info **提示** 你可以为**单个**事件模式注册多个事件处理程序，Nest 会并行触发它们全部。

`handleUserCreated()` **事件处理程序**监听 `'user_created'` 事件。事件处理程序接受一个参数，即从客户端传递的 `data`（在这种情况下，是通过网络发送的事件负载）。

<app-banner-enterprise></app-banner-enterprise>

#### 额外的请求详情

在更高级的场景中，你可能需要有关传入请求的额外详情。例如，当使用 NATS 的通配符订阅时，你可能希望检索生产者发送消息的原始主题。类似地，使用 Kafka 时，你可能需要访问消息头。为此，请使用如下所示的内置装饰器：

```typescript
@MessagePattern('time.us.*')
getDate(@Payload() data: number[], @Ctx() context: NatsContext) {
  console.log(`Subject: ${context.getSubject()}`); // e.g. "time.us.east"
  return new Date().toLocaleTimeString(...);
}

```

> info **提示** `@Payload()`、`@Ctx()` 和 `NatsContext` 从 `@nestjs/microservices` 导入。

> info **提示** 你还可以向 `@Payload()` 装饰器传递一个属性键，以从传入的负载对象中提取特定属性，例如 `@Payload('id')`。要根据模式验证负载，请参阅 [microservice pipes](/microservices/pipes)。

#### 客户端（生产者类）

客户端 Nest 应用程序可以使用 `ClientProxy` 类与 Nest 微服务交换消息，或向 Nest 微服务发布事件。该类提供了多个与远程微服务通信的方法，例如 `send()`（用于请求-响应消息传递）和 `emit()`（用于事件驱动的消息传递）。你可以通过以下方式获取该类的实例。

一种方式是导入 `ClientsModule`，它暴露了静态的 `register()` 方法。该方法接受一个表示微服务传输器的对象数组。每个对象必须包含一个 `name` 属性，并且可以包含一个 `transport` 属性（如果省略，Nest 使用 `Transport.TCP`）和一个 `options` 属性。

`name` 属性充当**注入令牌**，你可以使用它在任何需要的地方注入 `ClientProxy` 的实例。它的值可以是任何字符串或 JavaScript symbol，如 [non-class-based provider tokens](/fundamentals/dependency-injection#非基于类的提供者令牌) 中所述。

`options` 属性是一个对象，其属性与前面在 `createMicroservice()` 方法中看到的相同。

```typescript
@Module({
  imports: [
    ClientsModule.register([
      { name: 'MATH_SERVICE', transport: Transport.TCP },
    ]),
  ],
})

```

或者，如果你需要在设置期间提供配置或执行其他异步过程，请使用 `registerAsync()` 方法。

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

一旦导入了模块，请使用 `@Inject()` 装饰器注入为 `'MATH_SERVICE'` 传输器配置的 `ClientProxy` 实例。

```typescript
constructor(
  @Inject('MATH_SERVICE') private client: ClientProxy,
) {}

```

> info **提示** `ClientsModule` 和 `ClientProxy` 类从 `@nestjs/microservices` 包中导入。

有时，你可能需要从另一个服务（例如 `ConfigService`）获取传输器配置，而不是在客户端应用程序中硬编码它。为此，请使用 `ClientProxyFactory` 类注册一个 [custom provider](/fundamentals/dependency-injection)。该类提供了一个静态的 `create()` 方法，它接受一个传输器选项对象并返回一个自定义的 `ClientProxy` 实例。

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

> info **提示** `ClientProxyFactory` 类从 `@nestjs/microservices` 包中导入。

另一种选择是使用 `@Client()` 属性装饰器。

```typescript
@Client({ transport: Transport.TCP })
client: ClientProxy;

```

> info **提示** `@Client()` 装饰器从 `@nestjs/microservices` 包中导入。

`@Client()` 装饰器不是首选技术，因为以这种方式创建的客户端更难测试，也更难共享。

`ClientProxy` 是**惰性的**。它不会立即发起连接。相反，连接会在第一次微服务调用之前建立，并在每次后续调用中重用。如果你希望延迟应用程序的引导过程，直到连接建立，请在 `onApplicationBootstrap()` 生命周期钩子内使用 `ClientProxy` 对象的 `connect()` 方法手动发起连接。

```typescript
async onApplicationBootstrap() {
  await this.client.connect();
}

```

如果无法创建连接，`connect()` 方法会以相应的错误对象拒绝。

#### 发送消息

`ClientProxy` 暴露了一个 `send()` 方法，它调用微服务并返回一个带有其响应的 `Observable`。

```typescript
accumulate(): Observable<number> {
  const pattern = { cmd: 'sum' };
  const payload = [1, 2, 3];
  return this.client.send<number>(pattern, payload);
}

```

`send()` 方法接受两个参数，`pattern` 和 `payload`。`pattern` 应与 `@MessagePattern()` 装饰器中定义的一个匹配。`payload` 是要传输到远程微服务的消息。该方法返回一个**冷 `Observable`**，这意味着你必须在发送消息之前显式订阅它。

#### 发布事件

要发送事件，请使用 `ClientProxy` 对象的 `emit()` 方法。该方法会向消息代理发布一个事件。

```typescript
async publish() {
  this.client.emit<number>('user_created', new UserCreatedEvent());
}

```

`emit()` 方法接受两个参数，`pattern` 和 `payload`。`pattern` 应与 `@EventPattern()` 装饰器中定义的一个匹配，而 `payload` 是要传输到远程微服务的事件数据。该方法返回一个**热 `Observable`**（与 `send()` 返回的冷 `Observable` 相对），这意味着无论你是否订阅该 Observable，代理都会立即尝试投递该事件。

<app-banner-observe></app-banner-observe>

#### 请求作用域

如果你来自其他编程语言背景，可能会对 Nest 中大多数内容在传入请求之间共享感到惊讶。这包括数据库连接池、带有全局状态的单例服务等等。Node.js 并不遵循请求/响应的多线程无状态模型，在该模型中每个请求由单独的线程处理。因此，使用单例实例对你的应用程序来说是**安全的**。

然而，在某些边缘情况下，处理程序基于请求的生命周期可能是可取的，例如 GraphQL 应用程序中的按请求缓存、请求追踪或多租户。请学习如何在 [injection scopes](/fundamentals/provider-scopes) 章节中控制作用域。

请求作用域的处理程序和提供者可以结合 `CONTEXT` 令牌使用 `@Inject()` 装饰器来注入 `RequestContext`：

```typescript
import { Injectable, Scope, Inject } from '@nestjs/common';
import { CONTEXT, RequestContext } from '@nestjs/microservices';

@Injectable({ scope: Scope.REQUEST })
export class CatsService {
  constructor(@Inject(CONTEXT) private ctx: RequestContext) {}
}

```

这提供了对 `RequestContext` 对象的访问，该对象具有以下结构：

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

`data` 属性是消息生产者发送的消息负载。`pattern` 属性是用于标识传入消息处理程序的模式。`context` 属性保存了传输器特定的上下文对象（例如 `NatsContext`），与 `@Ctx()` 装饰器注入的对象相同。

#### 实例状态更新

要获取连接以及底层驱动实例状态的实时更新，请订阅 `status` 流。该流提供所选驱动特定的状态更新。例如，对于 TCP 传输器（默认），`status` 流会发出 `connected` 和 `disconnected` 事件。

```typescript
this.client.status.subscribe((status: TcpStatus) => {
  console.log(status);
});

```

> info **Hint** `TcpStatus` 类型从 `@nestjs/microservices` 包导入。

同样，你可以订阅服务器的 `status` 流以接收有关服务器状态的通知。

```typescript
const server = app.connectMicroservice<MicroserviceOptions>(...);
server.status.subscribe((status: TcpStatus) => {
  console.log(status);
});

```

#### 监听内部事件

在某些情况下，你可能希望监听微服务发出的内部事件。例如，你可以监听 `error` 事件，以便在发生错误时触发其他操作。为此，请使用 `on()` 方法：

```typescript
this.client.on('error', (err) => {
  console.error(err);
});

```

同样，你可以监听服务器的内部事件：

```typescript
server.on<TcpEvents>('error', (err) => {
  console.error(err);
});

```

> info **Hint** `TcpEvents` 类型从 `@nestjs/microservices` 包导入。

对于 TCP 传输器，从 NestJS v12.1.1 开始，通过客户端的 `on()` 方法注册的监听器会一直保持注册状态，直到你调用 `close()`，因此它们也会附加到客户端在连接关闭后下一次 `send()` 或 `emit()` 调用时打开的新套接字上。注册不会去重，因此每个监听器只注册一次，而不要在其回调中或每次重连后再次注册。

#### 访问底层驱动

对于更高级的用例，你可能需要访问底层驱动实例，例如手动关闭连接或使用驱动特定的方法。然而，在大多数情况下，你**不应该需要**直接访问驱动。

为此，请使用 `unwrap()` 方法，它返回底层驱动实例。泛型类型参数指定你期望的驱动实例类型。

```typescript
const netServer = this.client.unwrap<Server>();

```

这里，`Server` 是从 `net` 模块导入的类型。

同样，你可以访问服务器的底层驱动实例：

```typescript
const netServer = server.unwrap<Server>();

```

#### 处理超时

在分布式系统中，微服务有时会宕机或不可用。为了避免无限期等待，请使用 [RxJS](https://rxjs.dev) `timeout` 操作符为你的微服务调用应用超时。如果微服务在指定时间内没有响应，则会抛出错误，你可以捕获并妥善处理。

在管道中应用 `timeout` 操作符：

```typescript
this.client
  .send<TResult, TInput>(pattern, data)
  .pipe(timeout(5000));

```

> info **Hint** `timeout` 操作符从 `rxjs/operators` 包导入。

如果微服务在 5 秒内没有响应，`Observable` 会以 `TimeoutError` 报错。

#### 跨服务追踪请求

超时告诉你某个调用未能及时返回。它们不会告诉你时间*花在了哪里*，而在一个由五个服务通过 TCP、NATS 和 Kafka 通信的系统中，这才是关键问题。一个耗时 3 秒的网关请求，可能有 2.9 秒花在了一个没人怀疑的下游服务中，而每个服务自己的日志却显示一切正常。

通常的解决办法是手动通过每个传输器传播一个关联 ID，然后在事后将时间线拼接起来。[NestJS Observe](https://www.observe.nestjs.com/ 'NestJS Observe') 会为你完成这种拼接。使用 `@nestjs/observe` SDK 对每个服务进行插桩，并在传输器已有的任何通道上（Kafka 头、NATS 头或 TCP 负载上的某个字段）转发追踪 ID，仪表盘就会重新组装出一条跨越所有参与服务的瀑布图：

<figure><img src="https://www.observe.nestjs.com/docs/telemetry/service-flow.webp" alt="Trace correlation across services" /></figure>

从那里开始，超时不再是一个谜。你可以看到网关的 `send()` 在等待、消费者接收消息（以及消息在接收前等待了多久）、处理程序内部运行过久的查询，以及它最终抛出的错误及其源代码行，全部显示在同一个时钟上。消息和事件处理程序会自动插桩，因此 `@MessagePattern()` 和 `@EventPattern()` 处理程序会作为操作出现，无需任何手动 span 接线。

转发追踪 ID 是唯一需要应用程序代码的部分，因为只有你知道你的传输器留出了哪个通道。请参阅 [Distributed tracing](/observability/distributed-tracing) 了解每种传输器的模式，并参阅 [Observability](/observability/overview) 章节进行设置。

#### TLS 支持

在私有网络之外进行通信时，请加密流量。TCP 传输器内置了对 TLS 的支持，它基于 Node 的 [TLS](https://nodejs.org/api/tls.html) 模块，让你可以加密微服务与其客户端之间的通信。

要为 TCP 服务器启用 TLS，你需要一个私钥和一个 PEM 格式的证书。使用 `tlsOptions` 属性将它们添加到服务器的选项中：

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

为了让客户端通过 TLS 安全通信，还需要定义 `tlsOptions` 对象，这次要带上 CA 证书，即签署服务器证书的机构的证书。这确保客户端信任服务器的证书，并能够建立安全连接。

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

`ca` 属性接受一个数组，因此如果你的设置涉及多个受信任的机构，可以列出多个 CA。

一切设置完成后，像往常一样使用 `@Inject()` 装饰器注入 `ClientProxy`。这样你的微服务之间的通信就被加密了，加密细节由 Node 的 TLS 模块处理。

更多信息，请参阅 Node 的 [TLS documentation](https://nodejs.org/api/tls.html)。

#### 动态配置

微服务的传输选项会在任何提供者（例如来自 `@nestjs/config` 包的 `ConfigService`）被注入之前传递给 `createMicroservice()`。要使用注入的提供者来配置微服务，请改为传递 `AsyncMicroserviceOptions`：Nest 会解析 `inject` 中列出的提供者，并将它们传递给 `useFactory` 函数，该函数返回传输选项。

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