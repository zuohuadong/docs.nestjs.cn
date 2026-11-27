<!-- 此文件从 content/recipes/async-local-storage.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:36:37.249Z -->
<!-- 源文件: content/recipes/async-local-storage.md -->
<!-- 源哈希: f7628604d0011f8510cc091e286c7d04 -->

### 异步本地存储

`AsyncLocalStorage` 是一个 [Node.js API](https://nodejs.org/api/async_context.html#class-asynclocalstorage)（基于 `async_hooks` API）提供了一种替代方式来在应用程序中传播本地状态，而无需显式地将其作为函数参数传递。它类似于其他语言中的线程本地存储。

异步本地存储的主要思想是，你可以用 `AsyncLocalStorage#run` 调用来_包装_一个函数调用。在包装调用内部调用的所有代码都可以访问同一个 `store`，该 `store` 对每个调用链都是唯一的。

在 NestJS 的上下文中，这意味着如果你在请求生命周期的某个地方找到包装其余请求代码的位置，你可以访问和修改仅对该请求可见的状态。这可以作为 REQUEST-作用域提供者的替代方案，避免其某些限制。

或者，你可以使用 ALS 来传播仅针对系统一部分（例如 _transaction_ 对象）的上下文，而无需在服务之间显式地传递它，这可以提高隔离性和封装性。

如果你的应用程序使用了 [NestJS Observe](/observability/overview)，你已经拥有了一个请求作用域的存储，无需自己构建。请参阅下面的 [NestJS Observe](/recipes/async-local-storage#nestjs-observe) 部分。

#### 自定义实现

NestJS 核心框架没有为 `AsyncLocalStorage` 提供内置抽象，所以让我们了解一下如何为最简单的 HTTP 情况自己实现它，以更好地理解整个概念：

> info **提示** 对于现成的解决方案，请参阅下面的 [`@nestjs/observe`](/recipes/async-local-storage#nestjs-observe) 和 [`nestjs-cls`](/recipes/async-local-storage#nestjs-cls) 部分。

1. 首先，在一个共享的源文件中创建 `AsyncLocalStorage` 的新实例。由于我们使用的是 NestJS，我们还将其变成一个带有自定义提供者的模块。

```ts
@Module({
  providers: [
    {
      provide: AsyncLocalStorage,
      useValue: new AsyncLocalStorage(),
    },
  ],
  exports: [AsyncLocalStorage],
})
export class AlsModule {}

```

> info **提示** `AsyncLocalStorage` 从 `node:async_hooks` 导入。

2. 我们只关注 HTTP，所以我们使用一个中间件来用 `AsyncLocalStorage#run` 包装 `next` 函数。由于中间件是请求首先到达的，这使得 `store` 在所有增强器和系统的其余部分可用。

```ts
@Module({
  imports: [AlsModule],
  providers: [CatsService],
  controllers: [CatsController],
})
export class AppModule implements NestModule {
  constructor(
    // inject the AsyncLocalStorage in the module constructor,
    private readonly als: AsyncLocalStorage
  ) {}

  configure(consumer: MiddlewareConsumer) {
    // bind the middleware,
    consumer
      .apply((req, res, next) => {
        // populate the store with some default values
        // based on the request,
        const store = {
          userId: req.headers['x-user-id'],
        };
        // and pass the "next" function as callback
        // to the "als.run" method together with the store.
        this.als.run(store, () => next());
      })
      .forRoutes('*path');
  }
}

```

3. 现在你可以在请求生命周期的任何地方访问本地存储实例。

```ts
@Injectable()
export class CatsService {
  constructor(
    // We can inject the provided ALS instance.
    private readonly als: AsyncLocalStorage,
    private readonly catsRepository: CatsRepository,
  ) {}

  getCatForUser() {
    // The "getStore" method will always return the
    // store instance associated with the given request.
    const userId = this.als.getStore()["userId"] as number;
    return this.catsRepository.getForUser(userId);
  }
}

```

4. 你现在有一种方法可以在不注入整个 `REQUEST` 对象的情况下共享与请求相关的状态。

> warning **警告** 虽然此技术对许多用例有用，但它本质上会隐藏代码流程（通过创建隐式上下文），因此请负责任地使用，尤其要避免创建上下文性的“[God objects](https://en.wikipedia.org/wiki/God_object)”。

### NestJS Observe

如果你运行 [NestJS Observe](/observability/overview)，`@nestjs/observe` SDK 已经为它所检测的每个请求、任务和消息维护了一个 `AsyncLocalStorage` 存储。该存储将追踪上下文贯穿你的调用堆栈。`TracerService` 暴露了它，因此请求作用域的状态是你读取和写入的，而不是你设置的：没有需要编写的模块，没有需要挂载的中间件，也没有需要针对每个传输器重新连接的内容。

> info **提示** 这是 [Manual instrumentation](/observability/manual-instrumentation) 中记录的相同 `TracerService`。本节仅涵盖其异步本地存储方面；跨度、处理的错误和自定义指标在其中有描述。

#### 设置

除了 [Observability → SDK](/observability/sdk) 中描述的标准 SDK 集成外，无需进行任何设置：安装包，导入 `ObserveModule.forRoot()`，并将 `ObserveInstrument` 传递给 `NestFactory.create()`。

```bash
$ npm i @nestjs/observe

```

`ObserveModule` 导出了 `TracerService`，因此你可以在应用程序的任何地方注入它：

```ts
import { Injectable } from '@nestjs/common';
import { TracerService } from '@nestjs/observe';

@Injectable()
export class CatsService {
  constructor(private readonly tracerService: TracerService) {}
}

```

#### 读取和写入存储

`setAttribute(key, value)` 写入当前上下文存储，而 `getAttribute(key)` 从同一请求的任何下游位置（不同的服务、守卫或拦截器）读取值，而无需将其传递到每个函数签名中：

```ts
@Get()
findAll(@Req() req: Request) {
  this.tracerService.setAttribute('userId', req.headers['x-user-id']);
  return this.catsService.getCatForUser();
}

```

```ts
@Injectable()
export class CatsService {
  constructor(
    private readonly tracerService: TracerService,
    private readonly catsRepository: CatsRepository,
  ) {}

  getCatForUser() {
    const userId = this.tracerService.getAttribute('userId');
    return this.catsRepository.getForUser(userId);
  }
}

```

`getAttribute()` 为从未设置的键返回 `undefined`。两个方法在不在追踪的上下文外部调用时都会抛出，因为没有存储可供读取或写入。如果某个值可能在任何请求存在之前合法地被读取，请相应地保护调用。

#### 存储类型化

将存储的形状作为 `TracerService` 的第一个类型参数传递，以实现键和值的类型检查，包括嵌套路径：

```ts
interface RequestStore {
  userId: number;
  flags: { betaCheckout: boolean };
}

@Injectable()
export class CatsService {
  constructor(private readonly tracerService: TracerService<RequestStore>) {}

  enableBeta() {
    this.tracerService.setAttribute('flags.betaCheckout', true);
  }
}

```

#### 超越 HTTP

由于存储是由仪器化而不是由中间件创建的，它存在于 SDK 追踪操作的任何地方：HTTP 和 GraphQL 请求、gRPC 和 `@nestjs/microservices` 消息，以及后台工作，例如 BullMQ 消费者和定时任务。上述模式在所有这些中都是相同的。这是与仅覆盖 HTTP 的手工编写的、基于中间件的实现之间的实际区别。

存储还保存当前的追踪 ID，因此它可作为日志和下游服务的关联键。`currentTraceId()` 返回它。与 `getAttribute()` 不同，它在非追踪上下文中返回 `null` 而不是抛出：

```ts
const traceId = this.tracerService.currentTraceId();

```

> info **提示** `ObserveModule` 还导出了底层的 `AsyncLocalStorage` 实例。`setAttribute()` 和 `getAttribute()` 是访问存储的受支持方式；仅在你需要它们未暴露的功能时才直接注入实例。

### NestJS CLS

[nestjs-cls](https://github.com/Papooch/nestjs-cls) 包提供了比纯 `AsyncLocalStorage`（`CLS` 是 _continuation-local storage_ 的缩写）更多的开发者体验改进。它将实现抽象化到一个 `ClsModule` 中，该 `ClsModule` 为不同传输器（不仅是 HTTP）提供初始化 `store` 的各种方式，以及强大的类型支持。

然后你可以使用可注入的 `ClsService` 访问存储，或者通过使用 [Proxy Providers](https://www.npmjs.com/package/nestjs-cls#proxy-providers) 完全将其从业务逻辑中抽象出来。

> info **注意** `nestjs-cls` 是第三方包，不受 NestJS 核心团队管理。请在 [nestjs-cls repository](https://github.com/Papooch/nestjs-cls/issues) 中报告任何库问题。

#### 安装

除了对 `@nestjs` 包的对等依赖外，它仅使用内置的 Node.js API。像安装任何其他包一样安装它：

```bash
$ npm i nestjs-cls

```

#### 用法

您可以使用 `nestjs-cls` 实现类似于上述 [custom implementation](/recipes/async-local-storage#自定义实现) 的功能，如下所示：

1. 在根 ⟦Module⟧ 中导入 `ClsModule`。

```ts
@Module({
  imports: [
    // Register the ClsModule,
    ClsModule.forRoot({
      middleware: {
        // automatically mount the
        // ClsMiddleware for all routes
        mount: true,
        // and use the setup method to
        // provide default store values.
        setup: (cls, req) => {
          cls.set('userId', req.headers['x-user-id']);
        },
      },
    }),
  ],
  providers: [CatsService],
  controllers: [CatsController],
})
export class AppModule {}

```

2. 然后使用 `ClsService` 访问存储值。

```ts
@Injectable()
export class CatsService {
  constructor(
    // We can inject the provided ClsService instance,
    private readonly cls: ClsService,
    private readonly catsRepository: CatsRepository,
  ) {}

  getCatForUser() {
    // and use the "get" method to retrieve any stored value.
    const userId = this.cls.get('userId');
    return this.catsRepository.getForUser(userId);
  }
}

```

3. 要获得由 `ClsService` 管理的存储值的强类型（以及字符串键的自动建议），在注入时使用可选类型参数 `ClsService<MyClsStore>`。

```ts
export interface MyClsStore extends ClsStore {
  userId: number;
}

```

> info **提示** 您还可以让该包自动生成请求 ID，然后使用 `cls.getId()` 访问它，或者使用 `cls.get(CLS_REQ)` 获取整个 ⟦Request⟧ 对象。

#### 测试

由于 `ClsService` 只是另一个可注入的 ⟦Provider⟧，因此您可以在单元测试中完全模拟它。

然而，在某些集成测试中，您可能仍然希望使用真实的 `ClsService` 实现。在这种情况下，请使用对 `ClsService#run` 或 `ClsService#runWith` 的调用将上下文感知的代码包裹起来：

```ts
describe('CatsService', () => {
  let service: CatsService
  let cls: ClsService
  const mockCatsRepository = createMock<CatsRepository>()

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      // 设置 up most of the testing module as we normally would.
      providers: [
        CatsService,
        {
          provide: CatsRepository,
          useValue: mockCatsRepository,
        }
      ],
      imports: [
        // 导入 the static version of ClsModule which only provides
        // the ClsService, but does not set up the store in any way.
        ClsModule
      ],
    }).compile()

    service = module.get(CatsService)

    // Also retrieve the ClsService for later use.
    cls = module.get(ClsService)
  })

  describe('getCatForUser', () => {
    it('retrieves cat based on user id', async () => {
      const expectedUserId = 42
      mockCatsRepository.getForUser.mockImplementationOnce(
        (id) => ({ userId: id })
      )

      // Wrap the test call in the `runWith` method
      // in which we can pass hand-crafted store values.
      const cat = await cls.runWith(
        { userId: expectedUserId },
        () => service.getCatForUser()
      )

      expect(cat.userId).toEqual(expectedUserId)
    })
  })
})

```

#### 更多信息

请访问 [nestjs-cls GitHub page](https://github.com/Papooch/nestjs-cls) 查看完整的 API 文档和更多代码示例。