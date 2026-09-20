<!-- 此文件从 content/microservices/redis.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:08:45.407Z -->
<!-- 源文件: content/microservices/redis.md -->
<!-- 源哈希: 075456a84f01df31c8de72f960eb8dc4 -->

### Redis

[Redis](https://redis.io/) 传输器实现了发布/订阅消息传递范式，并利用了 Redis 的 [Pub/Sub](https://redis.io/topics/pubsub) 特性。发布的消息按频道分类，而无需知道哪些订阅者（如果有）最终会接收消息。每个微服务可以订阅任意数量的频道。此外，可以同时订阅多个频道。通过频道交换的消息是**即发即忘**的，这意味着如果消息发布时没有订阅者感兴趣，该消息将被移除且无法恢复。因此，您无法保证消息或事件至少会被一个服务处理。单个消息可以被多个订阅者订阅（并接收）。

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

> info **提示** `Transport` 枚举从 `@nestjs/microservices` 包中导入。

#### 选项

`options` 属性特定于所选的传输器。<strong>Redis</strong> 传输器暴露了以下描述的属性。

<table>
  <tr>
    <td><code>host</code></td>
    <td>连接 URL</td>
  </tr>
  <tr>
    <td><code>port</code></td>
    <td>连接端口</td>
  </tr>
  <tr>
    <td><code>retryAttempts</code></td>
    <td>消息重试次数（默认：<code>0</code>）</td>
  </tr>
  <tr>
    <td><code>retryDelay</code></td>
    <td>消息重试尝试之间的延迟（毫秒）（默认：<code>0</code>）</td>
  </tr>
   <tr>
    <td><code>wildcards</code></td>
    <td>启用 Redis 通配符订阅，指示传输器在底层使用 <code>psubscribe</code>/<code>pmessage</code>。（默认：<code>false</code>）</td>
  </tr>
</table>

官方 [ioredis](https://redis.github.io/ioredis/index.html#RedisOptions) 客户端支持的所有属性也受此传输器支持。

#### 客户端

与其他微服务传输器一样，您有<a href="/microservices/basics#客户端">多种选项</a>来创建 Redis `ClientProxy` 实例。

创建实例的一种方法是使用 `ClientsModule`。要使用 `ClientsModule` 创建客户端实例，请导入它并使用 `register()` 方法传递一个选项对象，该对象包含上述 `createMicroservice()` 方法中显示的相同属性，以及一个用作注入令牌的 `name` 属性。了解更多关于 `ClientsModule` <a href="/microservices/basics#客户端">此处</a>。

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

其他创建客户端（`ClientProxyFactory` 或 `@Client()`）的选项也可以使用。您可以在<a href="/microservices/basics#客户端">此处</a>阅读相关内容。

#### 上下文

在更复杂的场景中，您可能需要访问有关传入请求的附加信息。使用 Redis 传输器时，您可以访问 `RedisContext` 对象。

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: RedisContext) {
  console.log(`Channel: ${context.getChannel()}`);
}

```

> info **提示** `@Payload()`、`@Ctx()` 和 `RedisContext` 从 `@nestjs/microservices` 包中导入。

#### 通配符

要启用通配符支持，请将 `wildcards` 选项设置为 `true`。这会指示传输器在底层使用 `psubscribe` 和 `pmessage`。

```typescript
const app = await NestFactory.createMicroservice(AppModule, {
  transport: Transport.REDIS,
  options: {
    // Other options
    wildcards: true,
  },
});

```

确保在创建客户端实例时也传递 `wildcards` 选项。

启用此选项后，您可以在消息和事件模式中使用通配符。例如，要订阅所有以 `notifications` 开头的频道，可以使用以下模式：

```typescript
@EventPattern('notifications.*')

```

#### 实例状态更新

要获取连接和底层驱动程序实例状态的实时更新，您可以订阅 `status` 流。此流提供特定于所选驱动程序的状态更新。对于 Redis 驱动程序，`status` 流会发出 `connected`、`disconnected` 和 `reconnecting` 事件。

```typescript
this.client.status.subscribe((status: RedisStatus) => {
  console.log(status);
});

```

> info **提示** `RedisStatus` 类型从 `@nestjs/microservices` 包中导入。

类似地，您可以订阅服务器的 `status` 流以接收有关服务器状态的通知。

```typescript
const server = app.connectMicroservice<MicroserviceOptions>(...);
server.status.subscribe((status: RedisStatus) => {
  console.log(status);
});

```

#### 监听 Redis 事件

在某些情况下，您可能希望监听微服务发出的内部事件。例如，您可以监听 `error` 事件以在发生错误时触发附加操作。为此，请使用 `on()` 方法，如下所示：

```typescript
this.client.on('error', (err) => {
  console.error(err);
});

```

类似地，您可以监听服务器的内部事件：

```typescript
server.on<RedisEvents>('error', (err) => {
  console.error(err);
});

```

> info **提示** `RedisEvents` 类型从 `@nestjs/microservices` 包中导入。

#### 底层驱动程序访问

对于更高级的用例，您可能需要访问底层驱动程序实例。这对于手动关闭连接或使用驱动程序特定方法等场景非常有用。但是，请记住，在大多数情况下，您**不需要**直接访问驱动程序。

为此，您可以使用 `unwrap()` 方法，该方法返回底层驱动程序实例。泛型类型参数应指定您期望的驱动程序实例类型。

```typescript
const [pub, sub] =
  this.client.unwrap<[import('ioredis').Redis, import('ioredis').Redis]>();

```

类似地，您可以访问服务器的底层驱动程序实例：

```typescript
const [pub, sub] =
  server.unwrap<[import('ioredis').Redis, import('ioredis').Redis]>();

```

请注意，与其他传输器不同，Redis 传输器返回一个包含两个 `ioredis` 实例的元组：第一个用于发布消息，第二个用于订阅消息。