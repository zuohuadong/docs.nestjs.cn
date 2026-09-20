<!-- 此文件从 content/microservices/grpc.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:07:52.779Z -->
<!-- 源文件: content/microservices/grpc.md -->
<!-- 源哈希: 75f1afbeeb543d68422910bacfbb6009 -->

### gRPC

[gRPC](https://github.com/grpc/grpc-node) 是一个现代、开源、高性能的 RPC 框架，可以在任何环境中运行。它能够高效地连接数据中心内部及跨数据中心的各项服务，并支持可插拔的负载均衡、链路追踪、健康检查和认证功能。

与许多 RPC 系统一样，gRPC 基于这样一个概念：以可远程调用的函数（方法）来定义服务。对于每个方法，你需要定义参数和返回类型。服务、参数和返回类型都在 `.proto` 文件中使用 Google 的开源、语言无关的 <a href="https://protobuf.dev">protocol buffers</a> 机制进行定义。

借助 gRPC 传输器，Nest 使用 `.proto` 文件动态绑定客户端和服务器，从而轻松实现远程过程调用，并自动序列化和反序列化结构化数据。

#### 安装

要开始构建基于 gRPC 的微服务，首先安装所需的包：

```bash
$ npm i --save @grpc/grpc-js @grpc/proto-loader

```

#### 概述

与其他 Nest 微服务传输层实现一样，你可以通过传递给 `createMicroservice()` 方法的选项对象中的 `transport` 属性来选择 gRPC 传输器机制。在下面的示例中，我们将设置一个英雄服务。`options` 属性提供了该服务的元数据；其属性在 <a href="microservices/grpc#选项">下方</a> 描述。

```typescript title="main.ts"
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.GRPC,
  options: {
    package: 'hero',
    protoPath: join(import.meta.dirname, 'hero/hero.proto'),
  },
});

```

> 信息 **提示** `join()` 函数从 `path` 包中导入；`Transport` 枚举从 `@nestjs/microservices` 包中导入。

在 `nest-cli.json` 文件中，我们添加了 `assets` 属性，允许我们分发非 TypeScript 文件，以及 `watchAssets` - 用于开启对所有非 TypeScript 资源的监视。在我们的案例中，我们希望将 `.proto` 文件自动复制到 `dist` 文件夹。

```json
{
  "compilerOptions": {
    "assets": ["**/*.proto"],
    "watchAssets": true
  }
}

```

#### 选项

<strong>gRPC</strong> 传输器选项对象暴露了以下描述的属性。

<table>
  <tr>
    <td><code>package</code></td>
    <td>Protobuf 包名（与 <code>.proto</code> 文件中的 <code>package</code> 设置匹配）。必填</td>
  </tr>
  <tr>
    <td><code>protoPath</code></td>
    <td>
      <code>.proto</code> 文件的绝对路径（或相对于根目录的路径）。必填
    </td>
  </tr>
  <tr>
    <td><code>url</code></td>
    <td>连接 URL。格式为 <code>ip 地址/域名:端口</code> 的字符串（例如，对于 Docker 服务器为 <code>'0.0.0.0:50051'</code>），定义传输器建立连接的地址/端口。可选。默认为 <code>'localhost:5000'</code></td>
  </tr>
  <tr>
    <td><code>protoLoader</code></td>
    <td>用于加载 <code>.proto</code> 文件的 NPM 包名。可选。默认为 <code>'@grpc/proto-loader'</code></td>
  </tr>
  <tr>
    <td><code>loader</code></td>
    <td>
      <code>@grpc/proto-loader</code> 选项。这些选项提供了对 <code>.proto</code> 文件行为的详细控制。可选。参见
      <a
        href="https://github.com/grpc/grpc-node/blob/master/packages/proto-loader/README.md"
        rel="nofollow"
        target="_blank"
        >此处</a
      > 了解更多详情
    </td>
  </tr>
  <tr>
    <td><code>credentials</code></td>
    <td>
      服务器凭据。可选。<a
        href="https://grpc.io/grpc/node/grpc.ServerCredentials.html"
        rel="nofollow"
        target="_blank"
        >在此处阅读更多</a
      >
    </td>
  </tr>
</table>

#### 示例 gRPC 服务

让我们定义一个名为 `HeroesService` 的示例 gRPC 服务。在上述 `options` 对象中，`protoPath` 属性设置了 `.proto` 定义文件 `hero.proto` 的路径。`hero.proto` 文件使用 <a href="https://developers.google.com/protocol-buffers">protocol buffers</a> 结构化。其内容如下：

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

我们的 `HeroesService` 暴露了一个 `FindOne()` 方法。该方法期望一个类型为 `HeroById` 的输入参数，并返回一个 `Hero` 消息（protocol buffers 使用 `message` 元素来定义参数类型和返回类型）。

接下来，我们需要实现该服务。为了定义满足此定义的处理器，我们在控制器中使用 `@GrpcMethod()` 装饰器，如下所示。该装饰器提供了将方法声明为 gRPC 服务方法所需的元数据。

> 信息 **提示** 在之前的微服务章节中介绍的 `@MessagePattern()` 装饰器（<a href="microservices/basics#请求-响应">阅读更多</a>）不适用于基于 gRPC 的微服务。对于基于 gRPC 的微服务，`@GrpcMethod()` 装饰器有效地取代了它的位置。

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

> 信息 **提示** `@GrpcMethod()` 装饰器从 `@nestjs/microservices` 包中导入，而 `Metadata` 和 `ServerUnaryCall` 从 `grpc` 包中导入。

上述装饰器接受两个参数。第一个是服务名称（例如 `'HeroesService'`），对应于 `HeroesService` 中的 `hero.proto` 服务定义。第二个（字符串 `'FindOne'`）对应于 `FindOne()` 文件中 `HeroesService` 内定义的 `hero.proto` rpc 方法。

`findOne()` 处理器方法接受三个参数：调用者传递的 `data`、存储 gRPC 请求元数据的 `metadata`，以及用于获取 `GrpcCall` 对象属性（如 `sendMetadata` 用于向客户端发送元数据）的 `call`。

`@GrpcMethod()` 装饰器的两个参数都是可选的。如果省略第二个参数（例如 `'FindOne'`），Nest 将根据将处理器名称转换为大写驼峰式（例如，`findOne` 处理器与 `FindOne` rpc 调用定义关联）来自动将 `.proto` 文件中的 rpc 方法与处理器关联。如下所示。

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

你也可以省略第一个 `@GrpcMethod()` 参数。在这种情况下，Nest 会根据处理器定义的**类**名称，自动将处理器与 proto 定义文件中的服务定义关联。例如，在以下代码中，类 `HeroesService` 根据名称 `'HeroesService'` 的匹配，将其处理器方法与 `hero.proto` 文件中的 `HeroesService` 服务定义关联。

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

Nest 应用程序可以充当 gRPC 客户端，消费在 `.proto` 文件中定义的服务。你可以通过 `ClientGrpc` 对象访问远程服务。你可以通过多种方式获取 `ClientGrpc` 对象。

首选的技术是导入 `ClientsModule`。使用 `register()` 方法将 `.proto` 文件中定义的一组服务绑定到注入令牌，并配置该服务。`name` 属性是注入令牌。对于 gRPC 服务，使用 `transport: Transport.GRPC`。`options` 属性是一个对象，其属性与上文 <a href="microservices/grpc#选项"></a> 中描述的相同。

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

> info **提示** `register()` 方法接受一个对象数组。通过提供逗号分隔的注册对象列表来注册多个包。

注册后，我们可以使用 `@Inject()` 注入配置好的 `ClientGrpc` 对象。然后，我们使用 `ClientGrpc` 对象的 `getService()` 方法来获取服务实例，如下所示。

```typescript
@Injectable()
export class AppService implements OnModuleInit {
  private heroesService: HeroesService;

  constructor(@Inject('HERO_PACKAGE') private client: ClientGrpc) {}

  onModuleInit() {
    this.heroesService = this.client.getService<HeroesService>('HeroesService');
  }

  getHero(): Observable<string> {
    return this.heroesService.findOne({ id: 1 });
  }
}

```

> error **警告** 除非在 proto 加载器配置（微服务传输器配置中的 `options.loader.keepcase`）中将 `keepCase` 选项设置为 `true`，否则 gRPC 客户端不会发送名称中包含下划线 `_` 的字段。

请注意，与其他微服务传输方法中使用的技术相比，这里有一个小差异。我们使用 `ClientGrpc` 类而不是 `ClientProxy` 类，该类提供了 `getService()` 方法。`getService()` 泛型方法接受服务名称作为参数，并返回其实例（如果可用）。

或者，你也可以使用 `@Client()` 装饰器来实例化 `ClientGrpc` 对象，如下所示：

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

  getHero(): Observable<string> {
    return this.heroesService.findOne({ id: 1 });
  }
}

```

最后，对于更复杂的场景，我们可以使用 `ClientProxyFactory` 类注入动态配置的客户端，如 <a href="/microservices/basics#客户端">此处</a> 所述。

无论哪种方式，我们最终都会获得对 `HeroesService` 代理对象的引用，该对象暴露了 `.proto` 文件中定义的相同方法集。现在，当我们访问这个代理对象（即 `heroesService`）时，gRPC 系统会自动序列化请求，将其转发到远程系统，返回响应，并反序列化响应。由于 gRPC 为我们屏蔽了这些网络通信细节，`heroesService` 看起来和用起来都像一个本地提供者。

请注意，所有服务方法都使用**小驼峰命名**（以遵循语言的自然约定）。因此，例如，虽然我们的 `.proto` 文件中的 `HeroesService` 定义包含 `FindOne()` 函数，但 `heroesService` 实例将提供 `findOne()` 方法。

```typescript
interface HeroesService {
  findOne(data: { id: number }): Observable<any>;
}

```

消息处理器也可以返回 `Observable`，在这种情况下，结果值将一直被发出，直到流完成。

```typescript title="heroes.controller.ts"
@Get()
call(): Observable<any> {
  return this.heroesService.findOne({ id: 1 });
}

```

要发送 gRPC 元数据（随请求一起），你可以传递第二个参数，如下所示：

```typescript
call(): Observable<any> {
  const metadata = new Metadata();
  metadata.add('Set-Cookie', 'yummy_cookie=choco');

  return this.heroesService.findOne({ id: 1 }, metadata);
}

```

> info **提示** `Metadata` 类从 `grpc` 包中导入。

请注意，这需要更新我们之前几步定义的 `HeroesService` 接口。

#### 异常处理

gRPC 处理器可以抛出 `RpcException`，但普通的 `RpcException` 不携带 gRPC 状态码，因此客户端每次失败都会收到 `UNKNOWN`。从 NestJS v12 开始，微服务包提供了专用的 gRPC 异常和一个 `GrpcExceptionFilter`，用于将它们映射为正确的 gRPC 错误对象。

从你的处理器中抛出特定于状态的异常之一：

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

有了过滤器，客户端将收到 `ALREADY_EXISTS` 而不是 `UNKNOWN`。

你也可以使用通用的 `GrpcException` 并显式传递状态码：

```typescript
import { GrpcException, GrpcStatus } from '@nestjs/microservices';

throw new GrpcException('Rate limit exceeded', GrpcStatus.RESOURCE_EXHAUSTED);

```

以下特定于状态的异常类可用，每个都对应于 `GrpcStatus` 枚举的一个成员：

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

> info **提示** `GrpcExceptionFilter` 也处理 `RpcException`。如果你传递给它的错误对象带有数字类型的 `code` 或 `status` 属性，则该值将用作 gRPC 状态码；否则，错误将报告为 `UNKNOWN`。

#### 示例

[here](https://github.com/nestjs/nest/tree/master/sample/04-grpc) 提供了一个可用的示例。

#### gRPC 反射

[gRPC Server Reflection Specification](https://grpc.io/docs/guides/reflection/#概述) 是一种标准，允许 gRPC 客户端请求有关服务器暴露的 API 的详细信息，类似于为 REST API 暴露 OpenAPI 文档。这可以显著简化使用 grpc-ui 或 postman 等开发人员调试工具的工作。

要为你的服务器添加 gRPC 反射支持，首先安装所需的实现包：

```bash
$ npm i --save @grpc/reflection

```

然后可以通过在 gRPC 服务器选项中使用 `onLoadPackageDefinition` 钩子将其接入 gRPC 服务器，如下所示：

```typescript title="main.ts"
import { ReflectionService } from '@grpc/reflection';

const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  options: {
    onLoadPackageDefinition: (pkg, server) => {
      new ReflectionService(pkg).addToServer(server);
    },
  },
});

```

现在，你的服务器将使用反射规范响应请求 API 详细信息的消息。

#### gRPC 流式传输

gRPC 本身支持长期实时连接，通常称为 `streams`。流对于聊天、观测或分块数据传输等场景非常有用。更多详情请参阅官方文档 [here](https://grpc.io/docs/guides/concepts/)。

Nest 支持两种方式的 GRPC 流处理器：

- RxJS `Subject` + `Observable` 处理器：可用于直接在控制器方法内写入响应，或传递给 `Subject`/`Observable` 消费者
- 纯 GRPC 调用流处理器：可用于传递给某个执行器，该执行器将处理 Node 标准 `Duplex` 流处理器的其余调度。

<app-banner-enterprise></app-banner-enterprise>

#### 流式传输示例

让我们定义一个名为 `HelloService` 的新示例 gRPC 服务。`hello.proto` 文件使用 <a href="https://developers.google.com/protocol-buffers">protocol buffers</a> 结构化。如下所示：

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

> info **提示** `LotsOfGreetings` 方法可以使用 `@GrpcMethod` 装饰器简单实现（如上面的示例），因为返回的流可以发出多个值。

基于此 `.proto` 文件，让我们定义 `HelloService` 接口：

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

> info **提示** proto 接口可以由 [ts-proto](https://github.com/stephenh/ts-proto) 包自动生成，了解更多 [here](https://github.com/stephenh/ts-proto/blob/main/NESTJS.markdown)。

#### Subject 策略

`@GrpcStreamMethod()` 装饰器将函数参数作为 RxJS `Observable` 提供。因此，我们可以接收和处理多条消息。

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

> warning **警告** 为了支持与 `@GrpcStreamMethod()` 装饰器的全双工交互，控制器方法必须返回一个 RxJS `Observable`。

> info **提示** `Metadata` 和 `ServerUnaryCall` 类/接口从 `grpc` 包导入。

根据服务定义（在 `.proto` 文件中），`BidiHello` 方法应将请求流式传输到服务。要从客户端向流发送多条异步消息，我们利用 RxJS `ReplaySubject` 类。

```typescript
const helloService = this.client.getService<HelloService>('HelloService');
const helloRequest$ = new ReplaySubject<HelloRequest>();

helloRequest$.next({ greeting: 'Hello (1)!' });
helloRequest$.next({ greeting: 'Hello (2)!' });
helloRequest$.complete();

return helloService.bidiHello(helloRequest$);

```

在上面的示例中，我们向流写入了两条消息（`next()` 调用），并通知服务我们已完成数据发送（`complete()` 调用）。

#### 调用流处理器

当方法返回值定义为 `stream` 时，`@GrpcStreamCall()` 装饰器将函数参数作为 `grpc.ServerDuplexStream` 提供，其支持标准方法，如 `.on('data', callback)`、`.write(message)` 或 `.cancel()`。有关可用方法的完整文档，请参阅 [here](https://grpc.github.io/grpc/node/grpc-ClientDuplexStream.html)。

或者，当方法返回值不是 `stream` 时，`@GrpcStreamCall()` 装饰器提供两个函数参数，分别为 `grpc.ServerReadableStream`（了解更多 [here](https://grpc.github.io/grpc/node/grpc-ServerReadableStream.html)）和 `callback`。

让我们从实现 `BidiHello` 开始，它应支持全双工交互。

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

> info **提示** 此装饰器不需要提供任何特定的返回参数。预期流将像任何其他标准流类型一样被处理。

在上面的示例中，我们使用 `write()` 方法将对象写入响应流。每次我们的服务接收到新的数据块时，作为第二个参数传递给 `.on()` 方法的回调都会被调用。

让我们实现 `LotsOfGreetings` 方法。

```typescript
@GrpcStreamCall()
lotsOfGreetings(requestStream: any, callback: (err: unknown, value: HelloResponse) => void) {
  requestStream.on('data', message => {
    console.log(message);
  });
  requestStream.on('end', () => callback(null, { reply: 'Hello, world!' }));
}

```

这里我们使用 `callback` 函数在 `requestStream` 处理完成后发送响应。

#### 健康检查

在 Kubernetes 等编排器中运行 gRPC 应用程序时，你可能需要知道它是否正在运行且处于健康状态。[gRPC Health Check specification](https://grpc.io/docs/guides/health-checking/) 是一种标准，允许 gRPC 客户端暴露其健康状态，以便编排器相应地采取行动。

要添加 gRPC 健康检查支持，首先安装 [grpc-node](https://github.com/grpc/grpc-node/tree/master/packages/grpc-health-check) 包：

```bash
$ npm i --save grpc-health-check

```

然后可以通过在 gRPC 服务器选项中使用 `onLoadPackageDefinition` 钩子将其接入 gRPC 服务，如下所示。请注意，`protoPath` 需要同时包含健康检查和 hero 包。

```typescript title="main.ts"
import { HealthImplementation, protoPath as healthCheckProtoPath } from 'grpc-health-check';

const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  options: {
    protoPath: [
      healthCheckProtoPath,
      protoPath: join(import.meta.dirname, 'hero/hero.proto'),
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

> info **提示** [gRPC health probe](https://github.com/grpc-ecosystem/grpc-health-probe) 是一个有用的 CLI，用于在容器化环境中测试 gRPC 健康检查。

#### gRPC 元数据

元数据是关于特定 RPC 调用的信息，以键值对列表的形式存在，其中键是字符串，值通常是字符串，但也可以是二进制数据。元数据对 gRPC 本身是不透明的——它允许客户端向服务器提供与调用相关的信息，反之亦然。元数据可能包括认证令牌、请求标识符和用于监控目的的标签，以及数据集中的记录数等数据信息。

要在 `@GrpcMethod()` 处理器中读取元数据，请使用第二个参数（metadata），其类型为 `Metadata`（从 `grpc` 包导入）。

要从处理器发送回元数据，请使用 `ServerUnaryCall#sendMetadata()` 方法（处理器的第三个参数）。

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

同样，要在使用 `@GrpcStreamMethod()` 处理器（[subject strategy](microservices/grpc#主题策略)）注解的处理器中读取元数据，请使用第二个参数（metadata），其类型为 `Metadata`（从 `grpc` 包导入）。

要从处理器发送回元数据，请使用 `ServerDuplexStream#sendMetadata()` 方法（处理器的第三个参数）。

要从 [call stream handlers](microservices/grpc#调用流处理程序)（使用 `@GrpcStreamCall()` 装饰器注解的处理器）中读取元数据，请监听 `requestStream` 引用上的 `metadata` 事件，如下所示：

```typescript
requestStream.on('metadata', (metadata: Metadata) => {
  const meta = metadata.get('X-Meta');
});

```