<!-- 此文件从 content/microservices/custom-transport.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T09:45:27.866Z -->
<!-- 源文件: content/microservices/custom-transport.md -->
<!-- 源哈希: a91e92bea9682b63c530c05a6e9a791e -->

### 自定义传输器

Nest 开箱即用地提供了多种**传输器**，以及用于构建自定义传输策略的 API。传输器让你能够使用可插拔的通信层和简单的应用级消息协议，通过网络连接各个组件（参见 [full article](https://dev.to/nestjs/integrate-nestjs-with-external-services-using-microservice-transporters-part-1-p3)）。

> info **提示** 使用 Nest 构建微服务并不一定意味着你必须使用 `@nestjs/microservices` 包。例如，如果你想与外部服务（例如，用不同语言编写的其他微服务）通信，你可能并不需要 `@nestjs/microservices` 库提供的所有功能。
> 如果你不需要那些让你以声明式方式定义订阅者的装饰器（`@EventPattern` 或 `@MessagePattern`），那么运行一个 [standalone application](/application-context) 并手动管理连接和通道订阅，对大多数用例来说已经足够，并且能给你带来更大的灵活性。

借助自定义传输器，你可以集成任何消息系统或协议（包括 Google Cloud Pub/Sub、Amazon Kinesis 等），或者为现有的传输器扩展额外功能（例如，为 MQTT 添加 [QoS](https://github.com/mqttjs/MQTT.js/blob/master/README.md#qos)）。

> info **提示** 为了更好地理解 Nest 微服务的工作原理以及如何扩展现有传输器的能力，我们建议阅读 [NestJS Microservices in Action](https://dev.to/johnbiundo/series/4724) 和 [Advanced NestJS Microservices](https://dev.to/nestjs/part-1-introduction-and-setup-1a2l) 系列文章。

#### 创建策略

首先，让我们定义一个表示自定义传输器的类：

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

> warning **警告** 本章并未实现一个功能完备的 Google Cloud Pub/Sub 服务器，因为那需要深入探讨传输器特有的技术细节。

在上面的示例中，我们声明了 `GoogleCloudPubSubServer` 类，并提供了 `CustomTransportStrategy` 接口所要求的 `listen()` 和 `close()` 方法。
我们的类还继承了 `@nestjs/microservices` 包中的 `Server` 类，该类提供了若干有用的方法，例如 Nest 运行时用于注册消息处理程序的方法。或者，要扩展现有传输策略的能力，你可以继承相应的服务器类，例如 `ServerRedis`。
按照惯例，我们在类名后添加了 `"Server"` 后缀，因为该类负责订阅消息和事件（并在必要时对它们作出响应）。

完成这些之后，我们就可以使用自定义策略来替代内置传输器：

```typescript
const app = await NestFactory.createMicroservice<MicroserviceOptions>(
  AppModule,
  {
    strategy: new GoogleCloudPubSubServer(),
  },
);

```

我们没有传入通常带有 `transport` 和 `options` 属性的传输器选项对象，而是传入单个属性 `strategy`，其值是我们自定义传输器类的实例。

回到 `GoogleCloudPubSubServer` 类。在真实应用中，`listen()` 方法会建立与消息代理或外部服务的连接，并注册订阅者或监听特定通道（而 `close()` 清理方法则会移除订阅并关闭连接）。
由于这需要充分理解 Nest 微服务之间如何通信，我们建议阅读 [Advanced NestJS Microservices article series](https://dev.to/nestjs/part-1-introduction-and-setup-1a2l)。
本章则侧重于 `Server` 类所提供的能力，以及如何使用它们来构建自定义策略。

例如，假设我们的应用中某处定义了以下消息处理程序：

```typescript
@MessagePattern('echo')
echo(@Payload() data: object) {
  return data;
}

```

Nest 运行时会自动注册此消息处理程序。借助 `Server` 类，你可以查看已注册了哪些消息模式，并访问和执行分配给它们的方法。
为了验证这一点，让我们在 `listen()` 方法内部、调用 `callback` 函数之前添加一个 `console.log` 调用：

```typescript
listen(callback: () => void) {
  console.log(this.messageHandlers);
  callback();
}

```

应用程序重启后，你将在终端中看到以下日志：

```text
Map(1) {
  'echo' => [AsyncFunction (anonymous)] { isEventHandler: false, extras: {} }
}

```

> info **提示** 使用 `@EventPattern` 装饰器时，你会看到相同的输出，但 `isEventHandler` 属性会被设置为 `true`。

`messageHandlers` 属性是一个 `Map`，包含所有消息（和事件）处理程序，以模式为键。
你可以使用某个键（例如 `"echo"`）来获取对消息处理程序的引用：

```typescript
async listen(callback: () => void) {
  const echoHandler = this.messageHandlers.get('echo');
  console.log(await echoHandler('Hello world!'));
  callback();
}

```

当我们以任意字符串作为参数（这里是 `"Hello world!"`）执行 `echoHandler` 时，我们应该会在控制台中看到它：

```text
Hello world!

```

这意味着我们的处理程序方法被正确执行了。

当你将 `CustomTransportStrategy` 与 [interceptors](/overview/interceptors) 一起使用时，处理程序会被包装在 RxJS 流中。这意味着你需要订阅它们，才能执行流底层的逻辑（例如，在拦截器运行后继续进入控制器逻辑）。

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

#### 上报事件处理程序错误

事件处理程序没有响应流，因此在其内部抛出的错误无处可去。Nest 会改为记录该错误，但只会在你的异常过滤器运行之后。如果你的某个过滤器匹配该异常，那么该过滤器就是唯一的上报者。

某些传输器会自行等待事件流，并将失败交给它们的客户端库，由客户端库进行上报。`ServerKafka` 就是这样做的：`kafkajs` 会记录该拒绝，因此来自 Nest 的第二次上报会造成重复。在这种情况下，请将 `propagatesEventHandlerErrors` 设置为 `true`：

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

默认值是 `false`，它适用于使用继承而来的 `handleEvent` 的传输器。在那里没有任何东西订阅事件流，因此 Nest 是唯一能够上报该失败的一方。

#### 客户端代理

如第一节所述，创建微服务并不一定需要 `@nestjs/microservices` 包。但是，如果你使用它并且需要集成自定义策略，那么你还需要提供一个"客户端"类。

> info **提示** 实现一个与所有 `@nestjs/microservices` 功能（例如流式传输）兼容的功能完备的客户端类，需要充分理解框架所使用的通信技术。要了解更多信息，请参阅 [basic client component article](https://dev.to/nestjs/part-4-basic-client-component-16f9)。

要与外部服务通信并发布消息（或发出事件），你可以使用特定于库的 SDK 包，或者实现一个继承自 `ClientProxy` 的自定义客户端类：

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

> warning **警告** 本章并未实现一个功能完备的 Google Cloud Pub/Sub 客户端，因为那需要深入研究特定于传输器的技术细节。

`ClientProxy` 类要求你实现用于建立和关闭连接，以及发布消息（`publish()`）和事件（`dispatchEvent()`）的方法。
如果你不需要支持请求-响应通信风格，可以将 `publish()` 方法留空。同样，如果你不需要支持基于事件的通信，请将 `dispatchEvent()` 方法留空。

为了观察这些方法中哪些会运行，以及何时运行，让我们添加几个 `console.log` 调用：

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

完成这些之后，让我们创建 `GoogleCloudPubSubClient` 类的实例并调用 `send()` 方法（你可能在前面的章节中见过它），订阅返回的 Observable 流：

```typescript
const googlePubSubClient = new GoogleCloudPubSubClient();
googlePubSubClient
  .send('pattern', 'Hello world!')
  .subscribe((response) => console.log(response));

```

你应该会在终端中看到以下输出：

```typescript
connect
message: { pattern: 'pattern', data: 'Hello world!' }
Hello world! // <-- after 5 seconds

```

为了测试拆卸函数（由我们的 `publish()` 方法返回）是否会运行，让我们将 `timeout` 操作符应用到该流上，设置为 2 秒，以便它在我们 `setTimeout` 调用 `callback` 函数之前抛出错误：

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

> info **提示** `timeout` 操作符是从 `rxjs/operators` 包中导入的。

应用 `timeout` 操作符后，你的终端输出应如下所示：

```typescript
connect
message: { pattern: 'pattern', data: 'Hello world!' }
teardown // <-- teardown
Timeout has occurred

```

要派发事件（而不是发送消息），请使用 `emit()` 方法：

```typescript
googlePubSubClient.emit('event', 'Hello world!');

```

你应该会在控制台中看到以下内容：

```typescript
connect
event to dispatch:  { pattern: 'event', data: 'Hello world!' }

```

#### 消息序列化

要在客户端侧围绕响应的序列化添加自定义逻辑，请使用一个继承自 `ClientProxy` 类或其子类之一的自定义类。要修改成功的响应，请重写 `serializeResponse()` 方法；要修改经过此客户端的任何错误，请重写 `serializeError()` 方法。要使用此自定义类，请通过 `customClass` 属性将类本身传递给 `ClientsModule.register()` 方法。下面是一个自定义 `ClientProxy` 的示例，它将每个错误序列化为一个 `RpcException`。

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

> info **提示** 你传递给 `customClass` 的是类本身，而不是类的实例。Nest 会为你创建实例，并将 `options` 属性中给出的任何选项传递给新的 `ClientProxy`。