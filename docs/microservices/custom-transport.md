<!-- 此文件从 content/microservices/custom-transport.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:04:36.821Z -->
<!-- 源文件: content/microservices/custom-transport.md -->
<!-- 源哈希: 5aef0d1353c92ccd04a392ea8f4f3ada -->

### 自定义传输器

Nest 提供了多种开箱即用的**传输器**，以及一个允许开发者构建新的自定义传输策略的 API。传输器使您能够通过可插拔的通信层和非常简单的应用级消息协议（阅读完整 [article](https://dev.to/nestjs/integrate-nestjs-with-external-services-using-microservice-transporters-part-1-p3)）在网络中连接组件。

> info **提示** 使用 Nest 构建微服务并不一定意味着您必须使用 `@nestjs/microservices` 包。例如，如果您想与外部服务（比如用其他语言编写的其他微服务）通信，您可能不需要 `@nestjs/microservice` 库提供的所有功能。实际上，如果您不需要允许您以声明方式定义订阅者的装饰器（`@EventPattern` 或 `@MessagePattern`），那么运行 [Standalone Application](/application-context) 并手动维护连接/订阅通道对于大多数用例来说应该足够了，并且会为您提供更大的灵活性。

使用自定义传输器，您可以集成任何消息系统/协议（包括 Google Cloud Pub/Sub、Amazon Kinesis 等），或扩展现有系统，在其上添加额外功能（例如，用于 MQTT 的 [QoS](https://github.com/mqttjs/MQTT.js/blob/master/README.md#qos)）。

> info **提示** 为了更好地理解 Nest 微服务的工作原理以及如何扩展现有传输器的功能，我们建议阅读 [NestJS Microservices in Action](https://dev.to/johnbiundo/series/4724) 和 [Advanced NestJS Microservices](https://dev.to/nestjs/part-1-introduction-and-setup-1a2l) 文章系列。

#### 创建策略

首先，让我们定义一个表示自定义传输器的类。

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

> warning **警告** 请注意，在本章中我们不会实现一个功能完整的 Google Cloud Pub/Sub 服务器，因为这需要深入探讨传输器特定的技术细节。

在上面的示例中，我们声明了 `GoogleCloudPubSubServer` 类，并提供了由 `CustomTransportStrategy` 接口强制要求的 `listen()` 和 `close()` 方法。此外，我们的类扩展了从 `@nestjs/microservices` 包导入的 `Server` 类，该类提供了一些有用的方法，例如 Nest 运行时用于注册消息处理器的方法。或者，如果您想扩展现有传输策略的功能，您可以扩展相应的服务器类，例如 `ServerRedis`。按照惯例，我们为类添加了 `"Server"` 后缀，因为它将负责订阅消息/事件（并在必要时响应它们）。

有了这些，我们现在可以使用自定义策略而不是内置传输器，如下所示：

```typescript
const app = await NestFactory.createMicroservice<MicroserviceOptions>(
  AppModule,
  {
    strategy: new GoogleCloudPubSubServer(),
  },
);

```

基本上，我们不再传递带有 `transport` 和 `options` 属性的普通传输器选项对象，而是传递一个单独的属性 `strategy`，其值是自定义传输器类的实例。

回到我们的 `GoogleCloudPubSubServer` 类，在真实世界的应用中，我们会在 `listen()` 方法中建立与消息代理/外部服务的连接，并注册订阅者/监听特定通道（然后在 `close()` 清理方法中移除订阅并关闭连接），但由于这需要深入理解 Nest 微服务之间的通信方式，我们建议阅读 [article series](https://dev.to/nestjs/part-1-introduction-and-setup-1a2l)。在本章中，我们将重点介绍 `Server` 类提供的功能，以及如何利用它们来构建自定义策略。

例如，假设在我们的应用程序中的某个地方定义了以下消息处理器：

```typescript
@MessagePattern('echo')
echo(@Payload() data: object) {
  return data;
}

```

该消息处理器将由 Nest 运行时自动注册。使用 `Server` 类，您可以查看已注册的消息模式，并访问和执行分配给它们的实际方法。为了测试这一点，让我们在调用 `callback` 函数之前，在 `listen()` 方法内添加一个简单的 `console.log`：

```typescript
listen(callback: () => void) {
  console.log(this.messageHandlers);
  callback();
}

```

在您的应用程序重新启动后，您将在终端中看到以下日志：

```typescript
Map { 'echo' => [AsyncFunction] { isEventHandler: false } }

```

> info **提示** 如果我们使用了 `@EventPattern` 装饰器，您会看到相同的输出，但 `isEventHandler` 属性会被设置为 `true`。

如您所见，`messageHandlers` 属性是所有消息（和事件）处理器的 `Map` 集合，其中模式被用作键。现在，您可以使用一个键（例如 `"echo"`）来获取消息处理器的引用：

```typescript
async listen(callback: () => void) {
  const echoHandler = this.messageHandlers.get('echo');
  console.log(await echoHandler('Hello world!'));
  callback();
}

```

一旦我们执行 `echoHandler` 并传递一个任意字符串作为参数（此处为 `"Hello world!"`），我们应该在控制台中看到它：

```json
Hello world!

```

这意味着我们的方法处理器已被正确执行。

当使用带有 [Interceptors](/overview/interceptors) 的 `CustomTransportStrategy` 时，处理器会被包装到 RxJS 流中。这意味着您需要订阅它们才能执行流的基础逻辑（例如，在拦截器执行后继续进入控制器逻辑）。

下面可以看到一个示例：

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

#### 客户端代理

正如我们在第一部分提到的，您不一定需要使用 `@nestjs/microservices` 包来创建微服务，但如果您决定这样做并且需要集成自定义策略，您还需要提供一个“客户端”类。

> info **提示** 同样，实现一个兼容所有 `@nestjs/microservices` 功能（例如流式传输）的完整客户端类需要深入理解框架使用的通信技术。要了解更多信息，请查看 [article](https://dev.to/nestjs/part-4-basic-client-component-16f9)。

要与外部服务通信/发出和发布消息（或事件），您可以使用库特定的 SDK 包，或者实现一个扩展 `ClientProxy` 的自定义客户端类，如下所示：

```typescript
import { ClientProxy, ReadPacket, WritePacket } from '@nestjs/microservices';

class GoogleCloudPubSubClient extends ClientProxy {
  async connect(): Promise<any> {}
  async close() {}
  async dispatchEvent(packet: ReadPacket<any>): Promise<any> {}
  publish(
    packet: ReadPacket<any>,
    callback: (packet: WritePacket<any>) => void,
  ): Function {}
  unwrap<T = never>(): T {
    throw new Error('Method not implemented.');
  }
}

```

> warning **警告** 请注意，本章不会实现一个功能完整的 Google Cloud Pub/Sub 客户端，因为这需要深入探讨传输器特定的技术细节。

正如您所看到的，`ClientProxy` 类要求我们提供多个方法，用于建立和关闭连接以及发布消息（`publish`）和事件（`dispatchEvent`）。
请注意，如果您不需要支持请求-响应通信风格，可以将 `publish()` 方法留空。同样，如果您不需要支持基于事件的通信，请跳过 `dispatchEvent()` 方法。

为了观察这些方法何时以及如何被执行，让我们添加多个 `console.log` 调用，如下所示：

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
  ): Function {
    console.log('message:', packet);

    // In a real-world application, the "callback" function should be executed
    // with payload sent back from the responder. Here, we'll simply simulate (5 seconds delay)
    // that response came through by passing the same "data" as we've originally passed in.
    //
    // The "isDisposed" bool on the WritePacket tells the response that no further data is
    // expected. If not sent or is false, this will simply emit data to the Observable.
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

完成此操作后，让我们创建一个 `GoogleCloudPubSubClient` 类的实例，并运行 `send()` 方法（您可能在前面的章节中见过），订阅返回的 observable 流。

```typescript
const googlePubSubClient = new GoogleCloudPubSubClient();
googlePubSubClient
  .send('pattern', 'Hello world!')
  .subscribe((response) => console.log(response));

```

现在，您应该在终端中看到以下输出：

```typescript
connect
message: { pattern: 'pattern', data: 'Hello world!' }
Hello world! // <-- after 5 seconds

```

为了测试我们的"teardown"方法（即我们的 `publish()` 方法返回的函数）是否正确执行，让我们对流应用一个 timeout 操作符，将其设置为 2 秒，以确保它在我们的 `setTimeout` 调用 `callback` 函数之前抛出异常。

```typescript
const googlePubSubClient = new GoogleCloudPubSubClient();
googlePubSubClient
  .send('pattern', 'Hello world!')
  .pipe(timeout(2000))
  .subscribe(
    (response) => console.log(response),
    (error) => console.error(error.message),
  );

```

> info **提示** `timeout` 操作符从 `rxjs/operators` 包中导入。

应用 `timeout` 操作符后，您的终端输出应如下所示：

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

这就是您在控制台中应该看到的内容：

```typescript
connect
event to dispatch:  { pattern: 'event', data: 'Hello world!' }

```

#### 消息序列化

如果您需要在客户端添加一些自定义的响应序列化逻辑，可以使用一个扩展 `ClientProxy` 类或其子类的自定义类。要修改成功的请求，您可以覆盖 `serializeResponse` 方法；要修改通过此客户端传递的任何错误，您可以覆盖 `serializeError` 方法。要使用此自定义类，您可以使用 `customClass` 属性将该类本身传递给 `ClientsModule.register()` 方法。下面是一个自定义 `ClientProxy` 的示例，它将每个错误序列化为一个 `RpcException`。

```typescript title="error-handling.proxy.ts"
import { ClientTCP, RpcException } from '@nestjs/microservices';

class ErrorHandlingProxy extends ClientTCP {
  serializeError(err: Error) {
    return new RpcException(err);
  }
}

```

然后在 `ClientsModule` 中使用它，如下所示：

```typescript title="app.module.ts"
@Module({
  imports: [
    ClientsModule.register([{
      name: 'CustomProxy',
      customClass: ErrorHandlingProxy,
    }]),
  ]
})
export class AppModule

```

> info **提示** 这是将类本身传递给 `customClass`，而不是类的实例。Nest 会在底层为您创建实例，并将传递给 `options` 属性的任何选项传递给新的 `ClientProxy`。