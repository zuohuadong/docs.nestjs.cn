<!-- 此文件从 content/microservices/mqtt.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:17:21.032Z -->
<!-- 源文件: content/microservices/mqtt.md -->
<!-- 源哈希: 11aaebdc26bc1d86e9f117600e9dfdce -->

### MQTT

[MQTT](https://mqtt.org/) (Message Queuing Telemetry Transport) 是一个开源的轻量级消息协议，针对低延迟进行了优化。它提供了一种可扩展且成本效益高的连接设备的方式，采用**发布/订阅**模型。基于 MQTT 构建的通信系统包括发布服务器、一个代理（broker）和一个或多个客户端。该协议专为受限设备以及低带宽、高延迟或不可靠的网络设计。

#### 安装

要开始构建基于 MQTT 的微服务，首先安装所需的包：

```bash
$ npm i --save mqtt

```

#### 概述

要使用 MQTT 传输器，请将以下选项对象传递给 `createMicroservice()` 方法：

```typescript title="main.ts"
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.MQTT,
  options: {
    url: 'mqtt://localhost:1883',
  },
});

```

> info **提示** `Transport` 枚举是从 `@nestjs/microservices` 包导入的。

#### 选项

`options` 对象取决于所选的传输器。<strong>MQTT</strong> 传输器暴露了 [MQTT.js client options](https://github.com/mqttjs/MQTT.js/#mqttclientstreambuilder-options)，以及 `url`、`subscribeOptions`（参见 [Quality of Service](#quality-of-service-qos)）和 `userProperties`（参见 [record builders](#record-builders)）属性。在服务器端，`maxConnectionAttempts` 属性限制了建立初始连接的尝试次数（默认值：`-1`，即无限次）。此限制不适用于服务器已连接后的重连。

在服务器端，`gracefulShutdown` 选项启用优雅关闭：当服务器关闭时，它首先从其主题中取消订阅，然后等待正在处理的请求和事件后再终止连接（默认值：`false`）。`gracePeriod` 选项设置了等待的最长时间，单位为毫秒（默认值：`10000`）。对于持久会话（`clean: false`，以及 MQTT 5 上的 `sessionExpiryInterval`），取消订阅会从会话中移除订阅，因此在实例重启期间发布到非共享订阅的 QoS 1 和 2 消息不会被队列化。

> info **提示** 返回一个永不完成的流的处理程序仍处于处理中，因此关闭服务器将等待整个 `gracePeriod`。

#### 客户端

与其他微服务传输器一样，您有 <a href="/microservices/basics#client-producer-class">多个选项</a>来创建 MQTT `ClientProxy` 实例。

创建实例的一种方法是使用 `ClientsModule`。导入它并使用其 `register()` 方法，传入一个选项对象，该对象具有上述 `createMicroservice()` 方法中显示的相同属性，外加一个 `name` 属性作为注入令牌。有关 `ClientsModule` 的更多信息，请参阅概述的 <a href="/microservices/basics#client-producer-class">客户端部分</a>。

```typescript
@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'MATH_SERVICE',
        transport: Transport.MQTT,
        options: {
          url: 'mqtt://localhost:1883',
        }
      },
    ]),
  ]
  ...
})

```

您也可以使用 `ClientProxyFactory` 或 `@Client()` 装饰器创建客户端。两者都在概述的 <a href="/microservices/basics#client-producer-class">客户端部分</a>中进行了描述。

#### 上下文

在更复杂的场景中，您可能需要有关传入请求的附加信息。使用 MQTT 传输器，您可以访问 `MqttContext` 对象。

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: MqttContext) {
  console.log(`Topic: ${context.getTopic()}`);
}

```

> info **提示** `@Payload()`、`@Ctx()` 和 `MqttContext` 是从 `@nestjs/microservices` 包导入的。

要访问原始 MQTT [packet](https://github.com/mqttjs/mqtt-packet)，请使用 `MqttContext` 对象的 `getPacket()` 方法：

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: MqttContext) {
  console.log(context.getPacket());
}

```

#### 通配符

订阅可以针对明确的主题，也可以包含通配符。有两种通配符可用：`+` 匹配单个主题级别，而 `#` 匹配多个主题级别。

```typescript
@MessagePattern('sensors/+/temperature/+')
getTemperature(@Ctx() context: MqttContext) {
  console.log(`Topic: ${context.getTopic()}`);
}

```

#### 服务质量 (QoS)

默认情况下，使用 `@MessagePattern()` 和 `@EventPattern()` 装饰器创建的订阅使用 QoS 0。如果需要更高的 QoS，请在建立连接时使用 `subscribeOptions` 块全局设置：

```typescript title="main.ts"
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.MQTT,
  options: {
    url: 'mqtt://localhost:1883',
    subscribeOptions: {
      qos: 2
    },
  },
});

```

#### 每模式 QoS

您可以通过在 extras 对象中传递 `qos` 属性，在 `@MessagePattern()` 或 `@EventPattern()` 装饰器的第二个参数中，为单个模式覆盖订阅 QoS。没有自己 `qos` 的模式使用全局 `subscribeOptions.qos` 值。

```typescript
@EventPattern('critical-events', { qos: 2 })
handleCriticalEvent(@Payload() data: any) {
  // This subscription uses QoS 2
}

@EventPattern('metrics', { qos: 0 })
handleMetrics(@Payload() data: any) {
  // This subscription uses QoS 0
}

```

#### 记录构建器

要配置消息选项（调整 QoS 级别、设置 Retain 或 DUP 标志或向有效载荷添加属性），请使用 `MqttRecordBuilder` 类。例如，下面的记录使用 `setQoS()` 方法将 QoS 设置为 `1`，并使用 `setProperties()` 方法添加了一个用户属性：

```typescript
const userProperties = { 'x-version': '1.0.0' };
const record = new MqttRecordBuilder(':cat:')
  .setProperties({ userProperties })
  .setQoS(1)
  .build();
client.send('replace-emoji', record).subscribe(...);

```

> info **提示** `MqttRecordBuilder` 类是从 `@nestjs/microservices` 包导出的。

在服务器端，您可以通过 `MqttContext` 读取这些选项：

```typescript
@MessagePattern('replace-emoji')
replaceEmoji(@Payload() data: string, @Ctx() context: MqttContext): string {
  const { properties: { userProperties } } = context.getPacket();
  return userProperties['x-version'] === '1.0.0' ? '🐱' : '🐈';
}

```

要配置客户端发送的所有请求的用户属性，请将它们作为选项传递给 `ClientProxyFactory`：

```typescript
import { Module } from '@nestjs/common';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';

@Module({
  providers: [
    {
      provide: 'API_v1',
      useFactory: () =>
        ClientProxyFactory.create({
          transport: Transport.MQTT,
          options: {
            url: 'mqtt://localhost:1883',
            userProperties: { 'x-version': '1.0.0' },
          },
        }),
    },
  ],
})
export class ApiModule {}

```

从 NestJS v12.1.3 开始，消息处理程序也可以返回一个记录。Nest 将记录数据作为回复发送，并将记录选项（例如 QoS 级别和属性）应用于回复消息：

```typescript
@MessagePattern('replace-emoji')
replaceEmoji() {
  return new MqttRecordBuilder(':cat:')
    .setProperties({ userProperties: { 'x-version': '1.0.0' } })
    .setQoS(1)
    .build();
}

```

#### 实例状态更新

要获取连接和底层驱动实例状态的实时更新，请订阅 `status` 流。此流提供特定于所选驱动的状态更新。对于 MQTT 驱动，`status` 流会发出 `connected`、`disconnected`、`reconnecting` 和 `closed` 事件。

```typescript
this.client.status.subscribe((status: MqttStatus) => {
  console.log(status);
});

```

> info **提示** `MqttStatus` 类型是从 `@nestjs/microservices` 包导入的。

类似地，您可以订阅服务器的 `status` 流以接收有关服务器状态的通知。

```typescript
const server = app.connectMicroservice<MicroserviceOptions>(...);
server.status.subscribe((status: MqttStatus) => {
  console.log(status);
});

```

#### 监听 MQTT 事件

在某些情况下，您可能希望监听微服务发出的内部事件。例如，您可以在发生错误时监听 `error` 事件以触发附加操作。为此，请使用 `on()` 方法，如下所示：

```typescript
this.client.on('error', (err) => {
  console.error(err);
});

```

同样，您可以监听服务器的内部事件：

```typescript
server.on<MqttEvents>('error', (err) => {
  console.error(err);
});

```

> info **提示** `MqttEvents` 类型是从 `@nestjs/microservices` 包导入的。

从 NestJS v12.1.2 开始，使用客户端的 `on()` 方法注册的监听器会一直保持注册状态，直到您调用 `close()` 为止，因此它们也会附加到在上一个调用在不重新连接的情况下关闭后的下一个 `send()` 或 `emit()` 调用中创建的新 MQTT 客户端上（例如，当 `reconnectPeriod` 为 `0` 时）。注册不会去重，因此请只注册一次每个监听器，而不是从其回调或每次重新连接后再次注册。

#### 底层驱动访问

对于更高级的用例，您可能需要访问底层驱动实例，例如手动关闭连接或使用特定于驱动的方法。然而，在大多数情况下，您**不应该**直接访问驱动。

为此，请使用 `unwrap()` 方法，它返回底层驱动实例。泛型类型参数指定了您期望的驱动实例类型。

```typescript
const mqttClient = this.client.unwrap<import('mqtt').MqttClient>();

```

同样，您可以访问服务器的底层驱动实例：

```typescript
const mqttClient = server.unwrap<import('mqtt').MqttClient>();

```