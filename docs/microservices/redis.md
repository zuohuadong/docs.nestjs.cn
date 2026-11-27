<!-- 此文件从 content/microservices/redis.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:18:02.652Z -->
<!-- 源文件: content/microservices/redis.md -->
<!-- 源哈希: eefa37abf27ee4c06ebbf2807b1ba27c -->

### Redis

[Redis](https://redis.io/) 传输器实现了发布/订阅消息范式，并使用了 Redis 的 [Pub/Sub](https://redis.io/topics/pubsub) 功能。发布的消息被分类到通道中，发布者不知道哪些订阅者（如果有）会接收到它们。每个微服务可以订阅任意数量的通道，单个消息可以被多个订阅者接收。通过通道交换的消息是**即发即忘**的：如果发布了消息但没有订阅者感兴趣，该消息将被移除且无法恢复。因此，不保证至少有一个服务处理了消息或事件。

<figure><img class="illustrative-image" src="/assets/Redis_1.png" /></figure>

#### 安装

要开始构建基于 Redis 的微服务，首先安装所需的包：

```bash
$ npm i --save ioredis

```

#### 概述

要使用 Redis 传输器，请将以下选项对象传递给 `createMicroservice()` 方法：

```typescript title="main.ts"
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.REDIS,
  options: {
    host: 'localhost',
    port: 6379,
  },
});

```

> info **提示** `Transport` 枚举是从 `@nestjs/microservices` 包导入的。

#### 选项

`options` 属性特定于所选的传输器。<strong>Redis</strong> 传输器暴露了下面描述的属性。

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
    <td>重试连接的次数（默认为 <code>0</code>，即不重试）</td>
  </tr>
  <tr>
    <td><code>retryDelay</code></td>
    <td>连接重试尝试之间的延迟（毫秒）（默认为 <code>5000</code>）</td>
  </tr>
  <tr>
    <td><code>wildcards</code></td>
    <td>启用 Redis 通配符订阅，指示传输器在底层使用 <code>psubscribe</code>/<code>pmessage</code>（默认为 <code>false</code>）</td>
  </tr>
  <tr>
    <td><code>maxWildcardChannelLength</code></td>
    <td>在使用 <code>wildcards</code> 时，由通配符模式匹配的通道的最大长度（字符数）。更长通道上的请求不会被响应，并且会记录错误。非数字的值，例如 <code>NaN</code>（由 <code>Number()</code> 对未设置的环境变量产生的），将使用默认值。设置为 <code>0</code> 可禁用（默认为 <code>1024</code>）</td>
  </tr>
  <tr>
    <td><code>gracefulShutdown</code></td>
    <td>启用优雅关闭。启用时，服务器首先取消订阅其通道，然后等待正在处理的请求和事件后再关闭连接（默认为 <code>false</code>）</td>
  </tr>
  <tr>
    <td><code>gracePeriod</code></td>
    <td>启用 <code>gracefulShutdown</code> 时，等待正在处理的请求和事件的最长时间（毫秒）（默认为 <code>10000</code>）</td>
  </tr>
</table>

该传输器还支持官方 [ioredis](https://redis.github.io/ioredis/index.html#RedisOptions) 客户端的所有属性。

> info **提示** 返回一个永不完成的流的处理程序仍然正在被处理，因此关闭服务器将导致整个 `gracePeriod` 失败。

#### 客户端

与其他微服务传输器一样，您有 <a href="/microservices/basics#client-producer-class"> 几种 </a> 选项来创建 Redis `ClientProxy` 实例。

创建实例的一种方法是使用 `ClientsModule`。导入它并使用其 `register()` 方法，传入一个选项对象，该对象具有上述相同的属性用于 `createMicroservice()` 方法，外加一个 `name` 属性作为注入令牌。有关 `ClientsModule` 的更多信息，请参阅概述中的 <a href="/microservices/basics#client-producer-class"> 客户端部分</a>。

```typescript
@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'MATH_SERVICE',
        transport: Transport.REDIS,
        options: {
          host: 'localhost',
          port: 6379,
        }
      },
    ]),
  ]
  ...
})

```

您也可以使用 `ClientProxyFactory` 或 `@Client()` 装饰器创建客户端。两者都在概述的 <a href="/microservices/basics#client-producer-class"> 客户端部分</a> 中进行了描述。

#### 上下文

在更复杂的场景中，您可能需要有关传入请求的附加信息。使用 Redis 传输器，您可以访问 `RedisContext` 对象。

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: RedisContext) {
  console.log(`Channel: ${context.getChannel()}`);
}

```

> info **提示** `@Payload()`、`@Ctx()` 和 `RedisContext` 是从 `@nestjs/microservices` 包导入的。

#### 通配符

要启用通配符支持，请将 `wildcards` 选项设置为 `true`。这指示传输器在底层使用 `psubscribe` 和 `pmessage`。

```typescript
const app = await NestFactory.createMicroservice(AppModule, {
  transport: Transport.REDIS,
  options: {
    // Other options
    wildcards: true,
  },
});

```

在创建客户端实例时也传入 `wildcards` 选项。

启用此选项后，您可以在消息和事件模式中使用通配符。例如，要订阅所有以 `notifications.` 开头的通道，请使用以下模式：

```typescript
@EventPattern('notifications.*')

```

#### 实例状态更新

要获取连接和底层驱动实例状态的实时更新，请订阅 `status` 流。此流提供特定于所选驱动的状态更新。对于 Redis 驱动，`status` 流会发出 `connected`、`disconnected` 和 `reconnecting` 事件。

```typescript
this.client.status.subscribe((status: RedisStatus) => {
  console.log(status);
});

```

> info **提示** `RedisStatus` 类型是从 `@nestjs/microservices` 包导入的。

类似地，您可以订阅服务器的 `status` 流以接收有关服务器状态的通知。

```typescript
const server = app.connectMicroservice<MicroserviceOptions>(...);
server.status.subscribe((status: RedisStatus) => {
  console.log(status);
});

```

#### 监听 Redis 事件

在某些情况下，您可能希望监听微服务发出的内部事件。例如，您可以通过监听 `error` 事件，在发生错误时触发额外的操作。为此，请使用 `on()` 方法。由于 Redis 传输器使用两个连接（参见 [underlying driver access](#underlying-driver-access)），回调函数将接收发出事件的连接（`'pub'` 或 `'sub'`）作为第一个参数：

```typescript
this.client.on('error', (client, err) => {
  console.error(client, err);
});

```

同样，您也可以监听服务器的内部事件：

```typescript
server.on<RedisEvents>('error', (client, err) => {
  console.error(client, err);
});

```

> info **提示** `RedisEvents` 类型是从 `@nestjs/microservices` 包导入的。

从 NestJS v12.1 开始，使用客户端的 `on()` 方法注册的监听器会一直保持注册状态，直到您调用 `close()`，因此它们也会附加到客户端在连接结束后（一旦所有配置的 `retryAttempts` 都耗尽）下一次 `send()` 或 `emit()` 调用时创建的新 `pub` 和 `sub` 连接上。注册不会去重，因此请只注册一次每个监听器，而不是从其回调中或每次重新连接后再次注册。

#### 底层驱动访问

对于更高级的用例，您可能需要访问底层驱动实例，例如手动关闭连接或使用特定于驱动的方法。然而，在大多数情况下，您**不应该**直接访问驱动。

为此，请使用 `unwrap()` 方法，它返回底层驱动实例。泛型类型参数指定了您期望的驱动实例类型。

```typescript
const [pub, sub] =
  this.client.unwrap<[import('ioredis').Redis, import('ioredis').Redis]>();

```

同样，您也可以访问服务器的底层驱动实例：

```typescript
const [pub, sub] =
  server.unwrap<[import('ioredis').Redis, import('ioredis').Redis]>();

```

与其他传输器不同，Redis 传输器返回一个包含两个 `ioredis` 实例的元组：第一个实例发布消息，第二个实例订阅消息。