<!-- 此文件从 content/microservices/custom-transport.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-13T10:46:53.264Z -->
<!-- 源文件: content/microservices/custom-transport.md -->
<!-- 源哈希: 5aef0d1353c92ccd04a392ea8f4f3ada -->

### 自定义传输器

Nest 提供了多种开箱即用的**传输器**，以及允许开发者构建新的自定义传输策略的 API。传输器使您能够通过可插拔的通信层和非常简单的应用级消息协议（阅读完整的 [article](https://dev.to/nestjs/integrate-nestjs-with-external-services-using-microservice-transporters-part-1-p3)）在网络上连接组件。

> info **提示** 使用 Nest 构建微服务并不一定意味着您必须使用 `@nestjs/microservices` 包。例如，如果您想与外部服务（比如用其他语言编写的微服务）通信，您可能不需要 `@nestjs/microservice` 库提供的所有功能。
> 事实上，如果您不需要装饰器（`@EventPattern` 或 `@MessagePattern`）来声明式地定义订阅者，那么运行一个 [Standalone Application](/application-context) 并手动维护连接/订阅频道对于大多数用例来说应该足够了，并且会提供更大的灵活性。

使用自定义传输器，您可以集成任何消息系统/协议（包括 Google Cloud Pub/Sub、Amazon Kinesis 等），或者扩展现有的传输器，在其上添加额外功能（例如，用于 MQTT 的 [QoS](https://github.com/mqttjs/MQTT.js/blob/master/README.md#qos)）。

> info **提示** 为了更好地理解 Nest 微服务的工作原理以及如何扩展现有传输器的功能，我们建议阅读 [NestJS Microservices in Action](https://dev.to/johnbiundo/series/4724) 和 [Advanced NestJS Microservices](https://dev.to/nestjs/part-1-introduction-and-setup-1a2l) 系列文章。

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

> warning **警告** 请注意，本章不会实现一个功能完整的 Google Cloud Pub/Sub 服务器，因为这需要深入探讨传输器特定的技术细节。

在上面的示例中，我们声明了 `GoogleCloudPubSubServer` 类，并提供了由 `CustomTransportStrategy` 接口强制要求的 `listen()` 和 `close()` 方法。此外，我们的类继承了从 `@nestjs/microservices` 包导入的 `Server` 类，该类提供了一些有用的方法，例如 Nest 运行时用于注册消息处理器的方法。或者，如果您想扩展现有传输策略的功能，您可以继承相应的服务器类，例如 `ServerRedis`。按照惯例，我们给类添加了 `"Server"` 后缀，因为它将负责订阅消息/事件（并在必要时响应它们）。

有了这些，我们现在可以使用自定义策略来代替内置传输器，如下所示：

```typescript
const app = await NestFactory.createMicroservice<MicroserviceOptions>(
  AppModule,
  {
    strategy: new GoogleCloudPubSubServer(),
  },
);

```

基本上，我们不再传递带有 `transport` 和 `options` 属性的普通传输器选项对象，而是传递一个单独的属性 `strategy`，其值是自定义传输器类的实例。

回到我们的 `GoogleCloudPubSubServer` 类，在真实应用中，我们会在 `listen()` 方法中建立与消息代理/外部服务的连接，并注册订阅者/监听特定频道（然后在 `close()` 清理方法中移除订阅并关闭连接），但由于这需要深入理解 Nest 微服务之间的通信方式，我们建议阅读 [article series](https://dev.to/nestjs/part-1-introduction-and-setup-1a2l)。在本章中，我们将重点介绍 `Server` 类提供的功能，以及如何利用这些功能来构建自定义策略。

例如，假设在我们的应用程序中的某个地方定义了以下消息处理器：

```typescript
@MessagePattern('echo')
echo(@Payload() data: object) {
  return data;
}

```

该消息处理器将由 Nest 运行时自动注册。通过 `Server` 类，您可以查看已注册的消息模式，并访问和执行分配给它们的实际方法。为了测试这一点，让我们在调用 `callback` 函数之前，在 `listen()` 方法中添加一个简单的 `console.log`：

```typescript
listen(callback: () => void) {
  console.log(this.messageHandlers);
  callback();
}

```

应用程序重启后，您将在终端中看到以下日志：

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

一旦我们执行 `echoHandler` 并传入一个任意字符串作为参数（这里是 `"Hello world!"`），我们应该能在控制台中看到它：

```json
Hello world!

```

这意味着我们的方法处理器被正确执行了。

当使用带有 [Interceptors](/overview/interceptors) 的 `CustomTransportStrategy` 时，处理器会被包装成 RxJS 流。这意味着您需要订阅它们才能执行流的基础逻辑（例如，在拦截器执行后继续进入控制器逻辑）。下面可以看到一个示例：

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

> info **提示** 同样，实现一个与所有 `@nestjs/microservices` 功能（例如流式传输）兼容的功能完整的客户端类，需要深入理解框架使用的通信技术。要了解更多信息，请查看 [article](https://dev.to/nestjs/part-4-basic-client-component-16f9)。

要与外部服务通信/发送和发布消息（或事件），您可以使用特定于库的 SDK 包，或者实现一个继承自 `ClientProxy` 的自定义客户端类，如下所示：

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

> warning **警告** 请注意，在本章中我们不会实现一个功能完整的 Google Cloud Pub/Sub 客户端，因为这需要深入探讨传输器特定的技术细节。

如您所见，`ClientProxy` 类要求我们提供几个方法，用于建立和关闭连接以及发布消息（`publish`）和事件（`dispatchEvent`）。
请注意，如果您不需要请求-响应通信风格的支持，可以将 `publish()` 方法留空。同样，如果您不需要支持基于事件的通信，可以跳过 `dispatchEvent()` 方法。

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

有了这些之后，让我们创建 `GoogleCloudPubSubClient` 类的一个实例，并运行 `send()` 方法（您可能在之前的章节中见过），订阅返回的 Observable 流。

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

为了测试我们的 "teardown" 方法（由我们的 `publish()` 方法返回）是否正确执行，让我们对流应用一个超时操作符，将其设置为 2 秒，以确保它在我们的 `setTimeout` 调用 `callback` 函数之前抛出异常。

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

应用了 `timeout` 操作符后，您的终端输出应该如下所示：

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

这就是您应该在控制台中看到的内容：

```typescript
connect
event to dispatch:  { pattern: 'event', data: 'Hello world!' }

```

#### 消息序列化

如果您需要在客户端对响应序列化添加一些自定义逻辑，可以使用一个继承自 `ClientProxy` 类或其子类的自定义类。要修改成功的请求，您可以覆盖 `serializeResponse` 方法；要修改通过此客户端的任何错误，您可以覆盖 `serializeError` 方法。要使用此自定义类，您可以使用 `customClass` 属性将类本身传递给 `ClientsModule.register()` 方法。下面是一个自定义 `ClientProxy` 的示例，它将每个错误序列化为 `RpcException`。

```typescript title="error-handling.proxy.ts"
import { ClientTCP, RpcException } from '@nestjs/microservices';

class ErrorHandlingProxy extends ClientTCP {
  serializeError(err: Error) {
    return new RpcException(err);
  }
}

```

然后在 `ClientsModule` 中像这样使用它：

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

> info **提示** 这是传递给 `customClass` 的类本身，而不是类的实例。Nest 会在底层为您创建实例，并将提供给 `options` 属性的任何选项传递给新的 `ClientProxy`。