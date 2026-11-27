<!-- 此文件从 content/microservices/grpc.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:38:12.918Z -->
<!-- 源文件: content/microservices/grpc.md -->
<!-- 源哈希: d5e6c700bfdd11cd05c6a2b293fd6ebb -->

### gRPC

[gRPC](https://github.com/grpc/grpc-node) 是一个现代的、开源的、高性能的 RPC 框架，可在任何环境中运行。它连接数据中心内和跨数据中心的服务，并提供可插拔的负载均衡、追踪、健康检查和认证支持。

与许多 RPC 系统一样，gRPC 基于用函数（方法）来定义服务，这些函数可以被远程调用。对于每个方法，您定义参数和返回类型。服务、参数和返回类型是使用 Google 开源的、语言中立的 <a href="https://protobuf.dev">protocol buffers</a> 机制在 `.proto` 文件中定义的。

使用 gRPC 传输器，Nest 使用 `.proto` 文件来动态绑定客户端和服务端，这使得远程过程调用易于实现，并自动进行结构化数据的序列化和反序列化。

#### 安装

要开始构建基于 gRPC 的微服务，首先安装所需的包：

```bash
$ npm i --save @grpc/grpc-js @grpc/proto-loader

```

#### 概述

与其他 Nest 微服务传输层实现一样，您使用传递给 `createMicroservice()` 方法的选项对象的 `transport` 属性来选择 gRPC 传输器。在以下示例中，我们将设置一个英雄服务。`options` 属性提供了有关该服务的元数据；其属性在下文 [Options](/microservices/grpc#选项) 中描述。

```typescript title="main.ts"
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.GRPC,
  options: {
    package: 'hero',
    protoPath: join(import.meta.dirname, 'hero/hero.proto'),
  },
});

```

> info **提示** `join()` 函数是从 `path` 包导入的，而 `Transport` 枚举是从 `@nestjs/microservices` 包导入的。

在 `nest-cli.json` 文件中，添加 `assets` 属性以分发非 TypeScript 文件，并添加 `watchAssets` 以监视所有非 TypeScript 资源。在这种情况下，我们希望将 `.proto` 文件自动复制到 `dist` 文件夹。

```json
{
  "compilerOptions": {
    "assets": ["**/*.proto"],
    "watchAssets": true
  }
}

```

#### 选项

<strong>gRPC</strong> 传输器选项对象暴露了以下属性。

<table>
  <tr>
    <td><code>package</code></td>
    <td>Protobuf 包名称（匹配 <code>.proto</code> 文件中的 <code>package</code> 设置）。也接受包名称数组。必需</td>
  </tr>
  <tr>
    <td><code>protoPath</code></td>
    <td>
      指向 <code>.proto</code> 文件的绝对路径（或相对于当前工作目录的路径），或路径数组。除非传入预加载的 <code>packageDefinition</code>，否则必需
    </td>
  </tr>
  <tr>
    <td><code>url</code></td>
    <td>连接 URL。格式为 <code>ip 地址/dns 名称:端口</code> 的字符串（例如，用于 Docker 服务器的 <code>'0.0.0.0:50051'</code>），定义了传输器建立连接的地址和端口。可选。默认为 <code>'localhost:5000'</code></td>
  </tr>
  <tr>
    <td><code>protoLoader</code></td>
    <td>用于加载 <code>.proto</code> 文件的 NPM 包名称。可选。默认为 <code>'@grpc/proto-loader'</code></td>
  </tr>
  <tr>
    <td><code>loader</code></td>
    <td>
      <code>@grpc/proto-loader</code> 选项，控制如何加载 <code>.proto</code> 文件。可选。有关详细信息，请参阅 <a
        href="https://github.com/grpc/grpc-node/blob/master/packages/proto-loader/README.md"
        rel="nofollow"
        target="_blank"
        >proto-loader README</a
      >
    </td>
  </tr>
  <tr>
    <td><code>credentials</code></td>
    <td>
      服务器凭证（客户端使用时的通道凭证）。可选。默认为不安全凭证。有关详细信息，请参阅 <a
        href="https://grpc.io/grpc/node/grpc.ServerCredentials.html"
        rel="nofollow"
        target="_blank"
        ><code>ServerCredentials</code> 参考</a
      >
    </td>
  </tr>
  <tr>
    <td><code>maxPendingResponses</code></td>
    <td>流式调用的最大响应数，可能等待未读取它们的客户端。一旦有更多响应等待，调用将以 <code>RESOURCE_EXHAUSTED</code> 失败，并且处理程序的 <code>Observable</code> 将被取消订阅。处理程序在客户端跟上时一次性发出的响应（例如，使用 <code>from(rows)</code> 返回的结果）不计入。仅适用于服务器。可选。设置为 <code>0</code> 可禁用。非数字值（例如 <code>NaN</code>，由 <code>Number()</code> 对未设置的环境变量生成）将获得默认值。默认为 <code>1000</code></td>
  </tr>
  <tr>
    <td><code>gracefulShutdown</code></td>
    <td>启用优雅关闭。启用时，关闭服务器会阻止它接受新调用，并等待进行中的调用完成，最长等待时间为 <code>gracePeriod</code>，之后取消仍在运行的调用。禁用时，关闭服务器会立即取消进行中的调用。仅适用于服务器。可选。默认为 <code>false</code></td>
  </tr>
  <tr>
    <td><code>gracePeriod</code></td>
    <td>当启用 <code>gracefulShutdown</code> 时，等待进行中的调用最长的时间（毫秒）。在此之前，服务器会更早地关闭。设置为 <code>0</code> 可立即取消调用。仅适用于服务器。可选。默认为 <code>10000</code></td>
  </tr>
</table>

> info **提示** 一个永不结束的流式调用仍然在进行中，因此使用 `gracefulShutdown` 关闭服务器会等待整个 `gracePeriod`，然后才取消调用。

#### 示例 gRPC 服务

让我们定义一个名为 `HeroesService` 的示例 gRPC 服务。在上面的 `options` 对象中，`protoPath` 属性设置了指向 `hero.proto` 定义文件的路径。`hero.proto` 文件是使用 <a href="https://developers.google.com/protocol-buffers">protocol buffers</a> 结构化的：

```typescript
// hero/hero.proto
syntax = "proto3";

package hero;

service HeroesService {
  rpc FindOne (HeroById) returns (Hero) {}
}

message HeroById {
  int32 id = 1;
}

message Hero {
  int32 id = 1;
  string name = 2;
}

```

`HeroesService` 暴露了一个 `FindOne()` 方法。该方法期望一个类型为 `HeroById` 的输入参数，并返回一个 `Hero` 消息（protocol buffers 使用 `message` 元素来定义参数类型和返回类型）。

接下来，实现该服务。要定义一个满足此定义的处理器，请在控制器中使用 `@GrpcMethod()` 装饰器，如下所示。此装饰器提供了声明方法为 gRPC 服务方法的元数据。

> info **提示** 在之前的微服务章节中引入的 `@MessagePattern()` 装饰器（参见 [request-response](/microservices/basics#请求-响应)）不用于基于 gRPC 的微服务。`@GrpcMethod()` 装饰器取代了它。

```typescript title="heroes.controller.ts"
@Controller()
export class HeroesController {
  @GrpcMethod('HeroesService', 'FindOne')
  findOne(data: HeroById, metadata: Metadata, call: ServerUnaryCall<any, any>): Hero {
    const items = [
      { id: 1, name: 'John' },
      { id: 2, name: 'Doe' },
    ];
    return items.find(({ id }) => id === data.id);
  }
}

```

> info **提示** `@GrpcMethod()` 装饰器从 `@nestjs/microservices` 包导入，而 `Metadata` 和 `ServerUnaryCall` 从 `@grpc/grpc-js` 包导入。

该装饰器接受两个参数。第一个是服务名称（例如 `'HeroesService'`），对应于 `hero.proto` 中的 `HeroesService` 服务定义。第二个（字符串 `'FindOne'`）对应于 `hero.proto` 中 `HeroesService` 定义的 `FindOne()` rpc 方法。

`findOne()` 处理器方法接受三个参数：从调用者传递的 `data`、存储 gRPC 请求元数据的 `metadata`，以及一个 `call` 对象，该对象暴露了诸如 `sendMetadata()` 等成员以向客户端发送元数据。

两个 `@GrpcMethod()` 装饰器参数都是可选的。如果您省略第二个参数（例如 `'FindOne'`），Nest 会将处理器与名称匹配且首字母大写的 `findOne` 方法关联到 `.proto` rpc 方法（例如，`findOne` 处理器与 `FindOne` rpc 定义相关联），如下所示。

```typescript title="heroes.controller.ts"
@Controller()
export class HeroesController {
  @GrpcMethod('HeroesService')
  findOne(data: HeroById, metadata: Metadata, call: ServerUnaryCall<any, any>): Hero {
    const items = [
      { id: 1, name: 'John' },
      { id: 2, name: 'Doe' },
    ];
    return items.find(({ id }) => id === data.id);
  }
}

```

您也可以省略第一个 `@GrpcMethod()` 参数。在这种情况下，Nest 会根据定义处理器的**类**的名称，将处理器与 `.proto` 文件中的服务定义关联起来。例如，在以下代码中，`HeroesService` 类将其处理器方法与 `hero.proto` 中的 `HeroesService` 服务定义关联起来，因为名称匹配。

```typescript title="heroes.controller.ts"
@Controller()
export class HeroesService {
  @GrpcMethod()
  findOne(data: HeroById, metadata: Metadata, call: ServerUnaryCall<any, any>): Hero {
    const items = [
      { id: 1, name: 'John' },
      { id: 2, name: 'Doe' },
    ];
    return items.find(({ id }) => id === data.id);
  }
}

```

#### 客户端

Nest 应用程序可以充当 gRPC 客户端，消费在 `.proto` 文件中定义的服务。您通过一个 `ClientGrpc` 对象访问远程服务，该对象可以通过多种方式获取。

首选技术是导入 `ClientsModule`。使用其 `register()` 方法将定义在 `.proto` 文件中的服务包绑定到一个注入令牌，并配置服务。`name` 属性是注入令牌。对于 gRPC 服务，请使用 `transport: Transport.GRPC`。`options` 属性是一个具有与上面 [Options](/microservices/grpc#选项) 中描述的相同属性的对象。

```typescript
imports: [
  ClientsModule.register([
    {
      name: 'HERO_PACKAGE',
      transport: Transport.GRPC,
      options: {
        package: 'hero',
        protoPath: join(import.meta.dirname, 'hero/hero.proto'),
      },
    },
  ]),
];

```

> info **提示** `register()` 方法接受一个对象数组。要注册多个包，请提供逗号分隔的注册对象列表。

注册后，使用 `@Inject()` 注入配置好的 `ClientGrpc` 对象。然后使用 `ClientGrpc` 对象的 `getService()` 方法检索服务实例，如下所示。

```typescript
@Injectable()
export class AppService implements OnModuleInit {
  private heroesService: HeroesService;

  constructor(@Inject('HERO_PACKAGE') private client: ClientGrpc) {}

  onModuleInit() {
    this.heroesService = this.client.getService<HeroesService>('HeroesService');
  }

  getHero(): Observable<Hero> {
    return this.heroesService.findOne({ id: 1 });
  }
}

```

> error **警告** gRPC 客户端不会发送名称中包含下划线（`_`）的字段，除非在 proto 加载器配置（微服务传输器配置中的 `options.loader.keepCase`）中将 `keepCase` 选项设置为 `true`。

这与使用其他微服务传输器时采用的技术略有不同。您不使用 `ClientProxy` 类，而是使用提供 `getService()` 方法的 `ClientGrpc` 类。通用的 `getService()` 方法接受服务名称作为参数并返回其实例（如果可用）。

或者，您可以使用 `@Client()` 装饰器来实例化一个 `ClientGrpc` 对象，如下所示：

```typescript
@Injectable()
export class AppService implements OnModuleInit {
  @Client({
    transport: Transport.GRPC,
    options: {
      package: 'hero',
      protoPath: join(import.meta.dirname, 'hero/hero.proto'),
    },
  })
  client: ClientGrpc;

  private heroesService: HeroesService;

  onModuleInit() {
    this.heroesService = this.client.getService<HeroesService>('HeroesService');
  }

  getHero(): Observable<Hero> {
    return this.heroesService.findOne({ id: 1 });
  }
}

```

最后，对于更复杂的场景，您可以使用 `ClientProxyFactory` 类注入动态配置的客户端，如 [client section of the microservices overview](/microservices/basics#client-producer-class) 所述。

在每种情况下，您最终都会获得对 `HeroesService` 代理对象的引用，该对象暴露了 `.proto` 文件中定义的相同方法集。当您调用此代理对象（即 `heroesService`）时，gRPC 会序列化请求，转发到远程系统，返回响应，并反序列化响应。由于 gRPC 使您免于了解这些网络通信细节，`heroesService` 看起来和行为就像一个本地提供者。

所有服务方法都是**小驼峰命名法**，遵循语言的自然约定。例如，虽然 `.proto` 文件中的 `FindOne()` 定义包含 `HeroesService` 函数，但 `heroesService` 实例提供了 `findOne()` 方法。

```typescript
interface Hero {
  id: number;
  name: string;
}

interface HeroesService {
  findOne(data: { id: number }): Observable<Hero>;
}

```

处理器也可以返回一个 `Observable`，在这种情况下，结果值会持续发出直到流完成。

```typescript title="heroes.controller.ts"
@Get()
call(): Observable<Hero> {
  return this.heroesService.findOne({ id: 1 });
}

```

要将 gRPC 元数据与请求一起发送，请按如下方式传递第二个参数：

```typescript
call(): Observable<Hero> {
  const metadata = new Metadata();
  metadata.add('Set-Cookie', 'yummy_cookie=choco');

  return this.heroesService.findOne({ id: 1 }, metadata);
}

```

> info **提示** `Metadata` 类从 `@grpc/grpc-js` 包导入。

这需要更新前面定义的 `HeroesService` 接口以接受第二个参数。

#### 异常处理

gRPC 处理器可以抛出 `RpcException`，但普通的 `RpcException` 不携带 gRPC 状态码，因此客户端会收到每次失败的 `UNKNOWN`。从 NestJS v12 开始，`@nestjs/microservices` 包提供了专用的 gRPC 异常和一个 `GrpcExceptionFilter`，将其映射到正确的 gRPC 错误对象。

抛出处理程序中特定状态的异常之一：

```typescript title="heroes.controller.ts"
import { GrpcAlreadyExistsException } from '@nestjs/microservices';

@GrpcMethod('HeroesService')
create(data: Hero): Hero {
  if (this.heroes.has(data.id)) {
    throw new GrpcAlreadyExistsException('Hero already exists');
  }
  return this.heroes.add(data);
}

```

然后注册过滤器，以便将这些异常序列化为 gRPC 错误：

```typescript title="main.ts"
import { GrpcExceptionFilter } from '@nestjs/microservices';

const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.GRPC,
  options: {
    package: 'hero',
    protoPath: join(import.meta.dirname, 'hero/hero.proto'),
  },
});
app.useGlobalFilters(new GrpcExceptionFilter());

```

有了过滤器，客户端会收到 `ALREADY_EXISTS` 而不是 `UNKNOWN`。

您也可以使用通用的 `GrpcException` 并显式传递状态：

```typescript
import { GrpcException, GrpcStatus } from '@nestjs/microservices';

throw new GrpcException('Rate limit exceeded', GrpcStatus.RESOURCE_EXHAUSTED);

```

以下是可用的状态特定异常类。每个类对应于 `GrpcStatus` 枚举的成员：

<table>
  <tr>
    <td><code>GrpcCancelledException</code></td>
    <td><code>GrpcUnknownException</code></td>
    <td><code>GrpcInvalidArgumentException</code></td>
    <td><code>GrpcDeadlineExceededException</code></td>
  </tr>
  <tr>
    <td><code>GrpcNotFoundException</code></td>
    <td><code>GrpcAlreadyExistsException</code></td>
    <td><code>GrpcPermissionDeniedException</code></td>
    <td><code>GrpcResourceExhaustedException</code></td>
  </tr>
  <tr>
    <td><code>GrpcFailedPreconditionException</code></td>
    <td><code>GrpcAbortedException</code></td>
    <td><code>GrpcOutOfRangeException</code></td>
    <td><code>GrpcUnimplementedException</code></td>
  </tr>
  <tr>
    <td><code>GrpcInternalException</code></td>
    <td><code>GrpcUnavailableException</code></td>
    <td><code>GrpcDataLossException</code></td>
    <td><code>GrpcUnauthenticatedException</code></td>
  </tr>
</table>

> info **提示** `GrpcExceptionFilter` 也处理 `RpcException`。如果传递给 `RpcException` 构造函数的错误对象包含一个数字 `code` 或 `status` 属性，则使用该值作为 gRPC 状态；否则，错误报告为 `UNKNOWN`。任何其他异常都报告为带有通用消息的 `UNKNOWN`。

#### 示例

一个可工作的示例可在 NestJS 仓库的 [gRPC sample](https://github.com/nestjs/nest/tree/master/sample/04-grpc) 中找到。

#### gRPC 反射

[gRPC Server Reflection Specification](https://grpc.io/docs/guides/reflection/#概述) 是一个标准，允许 gRPC 客户端请求有关服务器暴露的 API 的详细信息，类似于为 REST API 暴露 OpenAPI 文档。这使得使用 grpc-ui 或 Postman 等调试工具更加容易。

要向您的服务器添加 gRPC 反射支持，首先安装实现包：

```bash
$ npm i --save @grpc/reflection

```

然后使用 gRPC 服务器选项中的 `onLoadPackageDefinition` 钩子将其集成到 gRPC 服务器中，如下所示：

```typescript title="main.ts"
import { ReflectionService } from '@grpc/reflection';

const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.GRPC,
  options: {
    package: 'hero',
    protoPath: join(import.meta.dirname, 'hero/hero.proto'),
    onLoadPackageDefinition: (pkg, server) => {
      new ReflectionService(pkg).addToServer(server);
    },
  },
});

```

您的服务器现在响应 API 详细信息的反射请求。

#### gRPC 流式传输

gRPC 支持长期连接，通常称为 `streams`。流对于聊天、观察或分块数据传输等情况非常有用。有关详细信息，请参阅 [gRPC core concepts guide](https://grpc.io/docs/guides/concepts/)。

Nest 以两种方式支持 gRPC 流处理程序：

- RxJS `Subject` + `Observable` 处理程序：适用于在控制器方法内部直接编写响应，或将其传递给 `Subject`/`Observable` 消费者
- 纯 gRPC 调用流处理程序：适用于将调用传递给一个执行器，该执行器处理标准 Node.js `Duplex` 流的其余分派

<app-banner-enterprise></app-banner-enterprise>

#### 流式传输示例

我们定义一个新的示例 gRPC 服务，称为 `HelloService`。`hello.proto` 文件使用 <a href="https://developers.google.com/protocol-buffers">protocol buffers</a> 结构化：

```typescript
// hello/hello.proto
syntax = "proto3";

package hello;

service HelloService {
  rpc BidiHello(stream HelloRequest) returns (stream HelloResponse);
  rpc LotsOfGreetings(stream HelloRequest) returns (HelloResponse);
}

message HelloRequest {
  string greeting = 1;
}

message HelloResponse {
  string reply = 1;
}

```

> info **提示** `LotsOfGreetings` 流请求但返回单个响应。由于其请求是流式的，因此不能使用 `@GrpcMethod()` 实现；请使用 `@GrpcStreamMethod()`（返回的 `Observable` 发出的最后一个值作为响应发送）或 `@GrpcStreamCall()`（通过回调响应），两者如下所示。

基于此 `.proto` 文件，定义 `HelloService` 接口：

```typescript
interface HelloService {
  bidiHello(upstream: Observable<HelloRequest>): Observable<HelloResponse>;
  lotsOfGreetings(
    upstream: Observable<HelloRequest>,
  ): Observable<HelloResponse>;
}

interface HelloRequest {
  greeting: string;
}

interface HelloResponse {
  reply: string;
}

```

> info **提示** proto 接口可以通过 [ts-proto](https://github.com/stephenh/ts-proto) 包自动生成。请参阅 [ts-proto NestJS guide](https://github.com/stephenh/ts-proto/blob/main/NESTJS.markdown) 了解更多信息。

#### Subject 策略

`@GrpcStreamMethod()` 装饰器将函数参数作为 RxJS `Observable` 提供，因此处理程序可以接收和处理多个消息。

```typescript
@GrpcStreamMethod()
bidiHello(messages: Observable<any>, metadata: Metadata, call: ServerDuplexStream<any, any>): Observable<any> {
  const subject = new Subject();

  const onNext = message => {
    console.log(message);
    subject.next({
      reply: 'Hello, world!'
    });
  };
  const onComplete = () => subject.complete();
  messages.subscribe({
    next: onNext,
    complete: onComplete,
  });

  return subject.asObservable();
}

```

> warning **警告** 要支持与 `@GrpcStreamMethod()` 装饰器的全双工交互，控制器方法必须返回一个 RxJS `Observable`。

> info **提示** `Metadata` 类和 `ServerDuplexStream` 接口是从 `@grpc/grpc-js` 包导入的。

根据 `.proto` 文件中的服务定义，`BidiHello` 方法将请求流式传输到服务。要从客户端向流发送多个异步消息，请使用 RxJS `ReplaySubject`。

```typescript
const helloService = this.client.getService<HelloService>('HelloService');
const helloRequest$ = new ReplaySubject<HelloRequest>();

helloRequest$.next({ greeting: 'Hello (1)!' });
helloRequest$.next({ greeting: 'Hello (2)!' });
helloRequest$.complete();

return helloService.bidiHello(helloRequest$);

```

在上面的示例中，我们向流写入了两个消息（`next()` 调用）并通知服务我们已完成发送数据（`complete()` 调用）。

#### 调用流处理程序

当方法的响应定义为 `stream` 时，`@GrpcStreamCall()` 装饰器将函数参数作为 `grpc.ServerDuplexStream` 提供，支持标准方法，例如 `.on('data', callback)`、`.write(message)` 和 `.end()`。有关方法的完整列表，请参阅 [gRPC Node.js API reference](https://grpc.github.io/grpc/node/grpc-ClientDuplexStream.html)。

当方法的响应不是 `stream` 时，`@GrpcStreamCall()` 装饰器提供两个函数参数：一个 `grpc.ServerReadableStream`（参见 [`ServerReadableStream` reference](https://grpc.github.io/grpc/node/grpc-ServerReadableStream.html)）和一个 `callback`。

我们从实现 `BidiHello` 开始，它支持全双工交互。

```typescript
@GrpcStreamCall()
bidiHello(requestStream: any) {
  requestStream.on('data', message => {
    console.log(message);
    requestStream.write({
      reply: 'Hello, world!'
    });
  });
}

```

> info **提示** 此装饰器不需要处理程序返回任何内容。像处理任何其他标准流一样处理流。

在上面的示例中，我们使用 `write()` 方法将对象写入响应流。传递给 `.on()` 方法的第二个参数回调会在服务接收到新数据块时每次被调用。

接下来，实现 `LotsOfGreetings` 方法。

```typescript
@GrpcStreamCall()
lotsOfGreetings(requestStream: any, callback: (err: unknown, value: HelloResponse) => void) {
  requestStream.on('data', message => {
    console.log(message);
  });
  requestStream.on('end', () => callback(null, { reply: 'Hello, world!' }));
}

```

在这里，`callback` 函数在 `requestStream` 完全处理后发送响应。

#### 健康检查

当您在 Kubernetes 等编排器中运行 gRPC 应用程序时，编排器需要知道应用程序是否正在运行且健康。[gRPC Health Check specification](https://grpc.io/docs/guides/health-checking/) 是一个标准，允许 gRPC 服务器暴露其健康状态，以便编排器可以相应地采取行动。

要添加 gRPC 健康检查支持，首先安装 [grpc-health-check](https://github.com/grpc/grpc-node/tree/master/packages/grpc-health-check) 包：

```bash
$ npm i --save grpc-health-check

```

然后使用 gRPC 服务器选项中的 `onLoadPackageDefinition` 钩子将其集成到 gRPC 服务中，如下所示。`protoPath` 必须包含健康检查和 hero `.proto` 文件。

```typescript title="main.ts"
import { HealthImplementation, protoPath as healthCheckProtoPath } from 'grpc-health-check';

const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.GRPC,
  options: {
    package: 'hero',
    protoPath: [
      healthCheckProtoPath,
      join(import.meta.dirname, 'hero/hero.proto'),
    ],
    onLoadPackageDefinition: (pkg, server) => {
      const healthImpl = new HealthImplementation({
        '': 'UNKNOWN',
      });

      healthImpl.addToServer(server);
      healthImpl.setStatus('', 'SERVING');
    },
  },
});

```

> info **提示** [gRPC health probe](https://github.com/grpc-ecosystem/grpc-health-probe) 是一个用于在容器化环境中测试 gRPC 健康检查的 CLI。

#### gRPC 元数据

元数据是特定 RPC 调用信息的集合，以键值对列表的形式存在，其中键是字符串，值通常是字符串，但也可能是二进制数据。元数据对 gRPC 本身是不可见的：它允许客户端向服务器提供与调用相关的信息，反之亦然。元数据可以包括认证令牌、请求标识符和用于监控的标签，以及数据集记录数等数据信息。

要在 `@GrpcMethod()` 处理程序中读取元数据，请使用第二个参数（`metadata`），其类型为 `Metadata`（从 `@grpc/grpc-js` 包导入）。

要从处理程序向后发送元数据，请使用 `ServerUnaryCall#sendMetadata()` 方法（在第三个处理程序参数上）。

```typescript title="heroes.controller.ts"
@Controller()
export class HeroesService {
  @GrpcMethod()
  findOne(data: HeroById, metadata: Metadata, call: ServerUnaryCall<any, any>): Hero {
    const serverMetadata = new Metadata();
    const items = [
      { id: 1, name: 'John' },
      { id: 2, name: 'Doe' },
    ];

    serverMetadata.add('Set-Cookie', 'yummy_cookie=choco');
    call.sendMetadata(serverMetadata);

    return items.find(({ id }) => id === data.id);
  }
}

```

同样，要在使用 `@GrpcStreamMethod()` 装饰器注解的处理程序中读取元数据（参见 [Subject strategy](/microservices/grpc#主题策略)），请使用第二个参数（`metadata`），其类型为 `Metadata`（从 `@grpc/grpc-js` 包导入）。

要从处理程序向后发送元数据，请使用 `ServerDuplexStream#sendMetadata()` 方法（在第三个处理程序参数上）。

要在 [call stream handlers](/microservices/grpc#调用流处理程序) 内部读取元数据（使用 `@GrpcStreamCall()` 装饰器注解的处理程序），请监听 `requestStream` 引用上的 `metadata` 事件，如下所示：

```typescript
requestStream.on('metadata', (metadata: Metadata) => {
  const meta = metadata.get('X-Meta');
});

```