<!-- 此文件从 content/microservices/mqtt.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T09:52:25.480Z -->
<!-- 源文件: content/microservices/mqtt.md -->
<!-- 源哈希: 6dfe83a07e331953f68120f0fc662133 -->

### MQTT

[MQTT](https://mqtt.org/)（消息队列遥测传输）是一种开源、轻量级的消息传递协议，针对低延迟进行了优化。该协议提供了一种可扩展且经济高效的方式，通过**发布/订阅**模型连接设备。基于 MQTT 构建的通信系统由发布服务器、代理和一个或多个客户端组成。它专为受限设备以及低带宽、高延迟或不可靠的网络而设计。

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

> info **提示** `Transport` 枚举从 `@nestjs/microservices` 包导入。

#### 选项

`options` 对象特定于所选的传输器。<strong>MQTT</strong> 传输器公开了 [here](https://github.com/mqttjs/MQTT.js/#mqttclientstreambuilder-options) 中描述的属性。

#### 客户端

与其他微服务传输器一样，您有<a href="/microservices/basics#客户端">多种选项</a>来创建 MQTT `ClientProxy` 实例。

创建实例的一种方法是使用 `ClientsModule`。要使用 `ClientsModule` 创建客户端实例，请导入它并使用 `register()` 方法传递一个选项对象，该对象具有与上述 `createMicroservice()` 方法中相同的属性，以及一个用作注入令牌的 `name` 属性。有关 `ClientsModule` 的更多信息，请参阅<a href="/microservices/basics#客户端">此处</a>。

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

也可以使用其他创建客户端（`ClientProxyFactory` 或 `@Client()`）的选项。您可以在<a href="/microservices/basics#客户端">此处</a>阅读相关内容。

#### 上下文

在更复杂的场景中，您可能需要访问有关传入请求的其他信息。使用 MQTT 传输器时，您可以访问 `MqttContext` 对象。

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: MqttContext) {
  console.log(`Topic: ${context.getTopic()}`);
}

```

> info **提示** `@Payload()`、`@Ctx()` 和 `MqttContext` 从 `@nestjs/microservices` 包导入。

要访问原始的 mqtt [packet](https://github.com/mqttjs/mqtt-packet)，请使用 `MqttContext` 对象的 `getPacket()` 方法，如下所示：

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: MqttContext) {
  console.log(context.getPacket());
}

```

#### 通配符

订阅可以是明确的主题，也可以包含通配符。有两个通配符可用：`+` 和 `#`。`+` 是单级通配符，而 `#` 是多级通配符，涵盖多个主题级别。

```typescript
@MessagePattern('sensors/+/temperature/+')
getTemperature(@Ctx() context: MqttContext) {
  console.log(`Topic: ${context.getTopic()}`);
}

```

#### 服务质量（QoS）

使用 `@MessagePattern` 或 `@EventPattern` 装饰器创建的任何订阅都将以 QoS 0 订阅。如果需要更高的 QoS，可以在建立连接时使用 `subscribeOptions` 块全局设置，如下所示：

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

#### 按模式 QoS

您可以通过在模式装饰器的 `extras` 字段中提供 `qos` 来按模式覆盖 MQTT 订阅 QoS。如果未指定，则使用全局 `subscribeOptions.qos` 作为默认值。

```typescript
@EventPattern('critical-events', { extras: { qos: 2 } })
handleCriticalEvent(@Payload() data: any) {
  // This subscription uses QoS 2
}

@EventPattern('metrics', { extras: { qos: 0 } })
handleMetrics(@Payload() data: any) {
  // This subscription uses QoS 0
}

```

> info **提示** 按模式 QoS 配置不影响现有行为。当未指定 `extras.qos` 时，订阅使用全局 `subscribeOptions.qos` 值。

#### 记录构建器

要配置消息选项（调整 QoS 级别、设置 Retain 或 DUP 标志，或向负载添加其他属性），您可以使用 `MqttRecordBuilder` 类。例如，要将 `QoS` 设置为 `2`，请使用 `setQoS` 方法，如下所示：

```typescript
const userProperties = { 'x-version': '1.0.0' };
const record = new MqttRecordBuilder(':cat:')
  .setProperties({ userProperties })
  .setQoS(1)
  .build();
client.send('replace-emoji', record).subscribe(...);

```

> info **提示** `MqttRecordBuilder` 类从 `@nestjs/microservices` 包导出。

您也可以通过访问 `MqttContext` 在服务器端读取这些选项。

```typescript
@MessagePattern('replace-emoji')
replaceEmoji(@Payload() data: string, @Ctx() context: MqttContext): string {
  const { properties: { userProperties } } = context.getPacket();
  return userProperties['x-version'] === '1.0.0' ? '🐱' : '🐈';
}

```

在某些情况下，您可能希望为多个请求配置用户属性，您可以将这些选项传递给 `ClientProxyFactory`。

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
            url: 'mqtt://localhost:1833',
            userProperties: { 'x-version': '1.0.0' },
          },
        }),
    },
  ],
})
export class ApiModule {}

```

#### 实例状态更新

要获取连接和底层驱动实例状态的实时更新，您可以订阅 `status` 流。该流提供特定于所选驱动的状态更新。对于 MQTT 驱动，`status` 流会发出 `connected`、`disconnected`、`reconnecting` 和 `closed` 事件。

```typescript
this.client.status.subscribe((status: MqttStatus) => {
  console.log(status);
});

```

> info **提示** `MqttStatus` 类型从 `@nestjs/microservices` 包导入。

类似地，您可以订阅服务器的 `status` 流以接收有关服务器状态的通知。

```typescript
const server = app.connectMicroservice<MicroserviceOptions>(...);
server.status.subscribe((status: MqttStatus) => {
  console.log(status);
});

```

#### 监听 MQTT 事件

在某些情况下，您可能希望监听微服务发出的内部事件。例如，您可以监听 `error` 事件以在发生错误时触发其他操作。为此，请使用 `on()` 方法，如下所示：

```typescript
this.client.on('error', (err) => {
  console.error(err);
});

```

类似地，您可以监听服务器的内部事件：

```typescript
server.on<MqttEvents>('error', (err) => {
  console.error(err);
});

```

> info **提示** `MqttEvents` 类型从 `@nestjs/microservices` 包导入。

#### 底层驱动访问

对于更高级的用例，您可能需要访问底层驱动实例。这对于手动关闭连接或使用驱动特定方法等场景非常有用。但请记住，在大多数情况下，您**不需要**直接访问驱动。

为此，您可以使用 `unwrap()` 方法，该方法返回底层驱动实例。泛型类型参数应指定您期望的驱动实例类型。

```typescript
const mqttClient = this.client.unwrap<import('mqtt').MqttClient>();

```

类似地，您可以访问服务器的底层驱动实例：

```typescript
const mqttClient = server.unwrap<import('mqtt').MqttClient>();

```