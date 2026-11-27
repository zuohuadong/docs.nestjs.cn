<!-- 此文件从 content/microservices/custom-transport.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:16:18.544Z -->
<!-- 源文件: content/microservices/custom-transport.md -->
<!-- 源哈希: 4e08870fc27695ea8fdf28f4a9dbcbc2 -->

### 自定义传输器

Nest 原生提供多种**传输器**，同时也提供了构建自定义传输策略的 API。
传输器允许您使用可插拔的通信层和简单的应用级消息协议通过网络连接组件（参见 [full article](https://dev.to/nestjs/integrate-nestjs-with-external-services-using-microservice-transporters-part-1-p3)）。

> info **提示** 使用 Nest 构建微服务不一定意味着必须使用 `@nestjs/microservices` 包。例如，如果您想与外部服务（例如使用不同语言编写的其他微服务）通信，可能不需要 `@nestjs/microservices` 库提供的所有功能。
> 如果您不需要用于声明式定义订阅者的装饰器（`@EventPattern` 或 `@MessagePattern`），运行 [standalone application](/standalone-applications) 并手动管理连接和通道订阅足以满足大多数用例，并为您提供更大的灵活性。

使用自定义传输器，您可以集成任何消息系统或协议（包括 Google Cloud Pub/Sub、Amazon Kinesis 等），或者通过额外功能扩展现有传输器（例如，MQTT 的 [QoS](https://github.com/mqttjs/MQTT.js/blob/master/README.md#qos)）。

> info **提示** 要更好地理解 Nest 微服务的工作原理以及如何扩展现有传输器的能力，我们建议阅读 [NestJS Microservices in Action](https://dev.to/johnbiundo/series/4724) 和 [Advanced NestJS Microservices](https://dev.to/nestjs/part-1-introduction-and-setup-1a2l) 系列文章。

#### 创建策略

首先，我们定义一个表示自定义传输器的类：

```typescript
import { CustomTransportStrategy, Server } from '@nestjs/microservices';

class GoogleCloudPubSubServer
  extends Server
  implements CustomTransportStrategy
{
  /**
   * Triggered when you run "app.listen()".
   */
  listen(callback: () => void) {
    callback();
  }

  /**
   * Triggered on application shutdown.
   */
  close() {}

  /**
   * You can ignore this method if you don't want transporter users
   * to be able to register event listeners. Most custom implementations
   * will not need this.
   */
  on(event: string, callback: Function) {
    throw new Error('Method not implemented.');
  }

  /**
   * You can ignore this method if you don't want transporter users
   * to be able to retrieve the underlying native server. Most custom implementations
   * will not need this.
   */
  unwrap<T = never>(): T {
    throw new Error('Method not implemented.');
  }
}

```

> warning **警告** 本章没有实现功能齐全的 Google Cloud Pub/Sub 服务器，因为那需要深入研究特定于传输器的技术细节。

在上面的示例中，我们声明了 `GoogleCloudPubSubServer` 类，并提供了由 `CustomTransportStrategy` 接口强制要求的 `listen()` 和 `close()` 方法。
我们的类还扩展了来自 `@nestjs/microservices` 包的 `Server` 类，该类提供了几个有用的方法，例如 Nest 运行时用于注册消息处理程序的方法。或者，要扩展现有传输策略的能力，您可以扩展相应的服务器类，例如 `ServerRedis`。
按照惯例，我们在类名后添加了 `"Server"` 后缀，因为该类负责订阅消息和事件（并在必要时响应它们）。

有了这个设置，我们就可以使用自定义策略而不是内置传输器：

```typescript
const app = await NestFactory.createMicroservice<MicroserviceOptions>(
  AppModule,
  {
    strategy: new GoogleCloudPubSubServer(),
  },
);

```

我们不是传递带有 `transport` 和 `options` 属性的常规传输器选项对象，而是传递一个单一的属性 `strategy`，其值为我们自定义传输器类的实例。

回到 `GoogleCloudPubSubServer` 类。在实际应用中，`listen()` 方法将建立到消息代理或外部服务的连接，并注册订阅者或监听特定通道（而 `close()` 销毁方法将移除订阅并关闭连接）。
由于这需要对 Nest 微服务如何相互通信有很好的理解，我们建议阅读 [Advanced NestJS Microservices article series](https://dev.to/nestjs/part-1-introduction-and-setup-1a2l)。
本章侧重于 `Server` 类提供的能力，以及如何使用它们来构建自定义策略。

例如，假设以下消息处理程序在我们的应用程序的某个地方定义：

```typescript
@MessagePattern('echo')
echo(@Payload() data: object) {
  return data;
}

```

Nest 运行时会自动注册此消息处理程序。使用 `Server` 类，您可以查看已注册了哪些消息模式，并访问和执行分配给它们的方法。
为了测试，我们在 `listen()` 方法内部添加一个 `console.log` 调用，在调用 `callback` 函数之前：

```typescript
listen(callback: () => void) {
  console.log(this.messageHandlers);
  callback();
}

```

应用程序重启后，您将在终端看到以下日志：

```text
Map(1) {
  'echo' => [AsyncFunction (anonymous)] { isEventHandler: false, extras: {} }
}

```

> info **提示** 使用 `@EventPattern` 装饰器，您会看到相同输出，但 `isEventHandler` 属性被设置为 `true`。

`messageHandlers` 属性是所有消息（和事件）处理程序的一个 `Map`，按模式键存储。
您可以使用一个键（例如 `"echo"`）来获取消息处理程序的引用：

```typescript
async listen(callback: () => void) {
  const echoHandler = this.messageHandlers.get('echo');
  console.log(await echoHandler('Hello world!'));
  callback();
}

```

当我们使用一个任意字符串作为参数执行 `echoHandler`（此处为 `"Hello world!"`）时，我们应该在控制台中看到它：

```text
Hello world!

```

这意味着我们的处理程序方法已正确执行。

当您使用 `CustomTransportStrategy` 配合 [interceptors](/overview/interceptors) 时，处理程序被包装在 RxJS 流中。这意味着您需要订阅它们才能执行流的底层逻辑（例如，在拦截器运行后继续执行控制器逻辑）。

例如：

```typescript
async listen(callback: () => void) {
  const echoHandler = this.messageHandlers.get('echo');
  const streamOrResult = await echoHandler('Hello World');
  if (isObservable(streamOrResult)) {
    streamOrResult.subscribe();
  }
  callback();
}

```

#### 报告事件处理程序错误

事件处理程序没有响应流，因此在其中抛出的错误无处可去。Nest 会记录它，但这仅在您的异常过滤器运行之后。如果您的某个过滤器匹配该异常，则该过滤器是唯一的报告。

某些传输器会等待事件流本身，并将失败交给其客户端库报告。`ServerKafka` 这样做：`kafkajs` 记录拒绝，因此来自 Nest 的第二次报告会重复它。在这种情况下，将 `propagatesEventHandlerErrors` 设置为 `true`：

```typescript
class GoogleCloudPubSubServer
  extends Server
  implements CustomTransportStrategy
{
  /**
   * The client library reports an event handler failure, so Nest must not
   * log it a second time.
   */
  public override readonly propagatesEventHandlerErrors = true;
}

```

默认值是 `false`，适用于使用继承的 `handleEvent` 的传输器。那里没有订阅事件流，因此只有 Nest 可以报告失败。

#### 客户端代理

如第一部分所述，您不一定需要 `@nestjs/microservices` 包来创建微服务。但是，如果您使用它并需要集成自定义策略，您还需要提供一个“客户端”类。

> info **提示** 实现与所有 `@nestjs/microservices` 功能（例如流式传输）兼容的完整功能客户端类，需要对框架使用的通信技术有很好的理解。要了解更多信息，请参阅 [basic client component article](https://dev.to/nestjs/part-4-basic-client-component-16f9)。

要与外部服务通信并发布消息（或发出事件），您可以使用库特定的 SDK 包，或者实现一个扩展 `ClientProxy` 的自定义客户端类：

```typescript
import { ClientProxy, ReadPacket, WritePacket } from '@nestjs/microservices';

class GoogleCloudPubSubClient extends ClientProxy {
  async connect(): Promise<any> {}
  async close() {}
  async dispatchEvent(packet: ReadPacket<any>): Promise<any> {}
  publish(
    packet: ReadPacket<any>,
    callback: (packet: WritePacket<any>) => void,
  ): () => void {}
  unwrap<T = never>(): T {
    throw new Error('Method not implemented.');
  }
}

```

> warning **警告** 本章没有实现功能齐全的 Google Cloud Pub/Sub 客户端，因为那需要深入研究传输器特定的技术细节。

`ClientProxy` 类要求您实现建立和关闭连接、发布消息（`publish()`）和事件（`dispatchEvent()`）的方法。
如果您不需要支持请求-响应通信风格，可以留空 `publish()` 方法。同样，如果您不需要支持基于事件的通信，请留空 `dispatchEvent()` 方法。

要观察哪些方法运行以及何时运行，我们添加几个 `console.log` 调用：

```typescript
class GoogleCloudPubSubClient extends ClientProxy {
  async connect(): Promise<any> {
    console.log('connect');
  }

  async close() {
    console.log('close');
  }

  async dispatchEvent(packet: ReadPacket<any>): Promise<any> {
    return console.log('event to dispatch: ', packet);
  }

  publish(
    packet: ReadPacket<any>,
    callback: (packet: WritePacket<any>) => void,
  ): () => void {
    console.log('message:', packet);

    // In a real-world application, the "callback" function should be executed
    // with the payload sent back from the responder. Here, we simulate a response
    // (after a 5-second delay) by passing back the same "data" we originally sent.
    //
    // The "isDisposed" flag on the WritePacket signals that no further data is
    // expected. If it's omitted or false, the data is emitted to the Observable.
    setTimeout(() => callback({ 
      response: packet.data,
      isDisposed: true,
    }), 5000);

    return () => console.log('teardown');
  }

  unwrap<T = never>(): T {
    throw new Error('Method not implemented.');
  }
}

```

设置好后，我们创建一个 `GoogleCloudPubSubClient` 类的实例并调用 `send()` 方法（您可能在前面的章节中见过），订阅返回的 observable 流：

```typescript
const googlePubSubClient = new GoogleCloudPubSubClient();
googlePubSubClient
  .send('pattern', 'Hello world!')
  .subscribe((response) => console.log(response));

```

您应该在终端中看到以下输出：

```typescript
connect
message: { pattern: 'pattern', data: 'Hello world!' }
Hello world! // <-- after 5 seconds

```

为了测试清理函数（由我们的 `publish()` 方法返回）是否运行，我们对流应用 `timeout` 操作符，设置为 2 秒，以便在我们的 `setTimeout` 调用 `callback` 函数之前抛出：

```typescript
const googlePubSubClient = new GoogleCloudPubSubClient();
googlePubSubClient
  .send('pattern', 'Hello world!')
  .pipe(timeout(2000))
  .subscribe({
    next: (response) => console.log(response),
    error: (error) => console.error(error.message),
  });

```

> info **提示** `timeout` 操作符是从 `rxjs/operators` 包导入的。

应用了 `timeout` 操作符后，您的终端输出应如下所示：

```typescript
connect
message: { pattern: 'pattern', data: 'Hello world!' }
teardown // <-- teardown
Timeout has occurred

```

要分发事件（而不是发送消息），请使用 `emit()` 方法：

```typescript
googlePubSubClient.emit('event', 'Hello world!');

```

您应该在控制台中看到以下内容：

```typescript
connect
event to dispatch:  { pattern: 'event', data: 'Hello world!' }

```

#### 消息序列化

要在客户端侧的响应序列化周围添加自定义逻辑，请使用继承自 `ClientProxy` 类或其子类的自定义类。要修改成功响应，请重写 `serializeResponse()` 方法；要修改通过此客户端的任何错误，请重写 `serializeError()` 方法。要使用此自定义类，请使用 `customClass` 属性将类本身传递给 `ClientsModule.register()` 方法。下面是一个将每个错误序列化为 `RpcException` 的自定义 `ClientProxy` 示例。

```typescript title="error-handling.proxy.ts"
import { ClientTCP, RpcException } from '@nestjs/microservices';

class ErrorHandlingProxy extends ClientTCP {
  serializeError(err: Error) {
    return new RpcException(err);
  }
}

```

然后在 `ClientsModule` 中使用它：

```typescript title="app.module.ts"
@Module({
  imports: [
    ClientsModule.register([{
      name: 'CustomProxy',
      customClass: ErrorHandlingProxy,
    }]),
  ]
})
export class AppModule {}

```

> info **提示** 您将类本身传递给 `customClass`，而不是类的实例。Nest 会为您创建实例，并将 `options` 属性中提供的任何选项传递给新的 `ClientProxy`。