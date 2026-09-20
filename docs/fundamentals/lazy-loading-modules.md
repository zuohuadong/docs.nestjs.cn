<!-- 此文件从 content/fundamentals/lazy-loading-modules.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-13T11:05:51.083Z -->
<!-- 源文件: content/fundamentals/lazy-loading-modules.md -->
<!-- 源哈希: 97dda00cc66c7df48b744964748cb5da -->

### 延迟加载模块

默认情况下，模块是急切加载的，这意味着一旦应用程序加载，所有模块也会随之加载，无论它们是否立即需要。虽然这对大多数应用程序来说没有问题，但对于在**无服务器环境**中运行的应用程序/工作进程来说，这可能成为瓶颈，因为启动延迟（"冷启动"）至关重要。

延迟加载可以通过仅加载特定无服务器函数调用所需的模块来帮助减少启动时间。此外，一旦无服务器函数"预热"，您还可以异步加载其他模块，以进一步加快后续调用的启动时间（延迟模块注册）。

> info **提示** 如果您熟悉 **[Angular](https://angular.dev/)** 框架，您可能之前见过"[lazy-loading modules](https://angular.dev/guide/ngmodules/lazy-loading#lazy-loading-basics)"这个术语。请注意，此技术在 Nest 中**功能上有所不同**，因此请将其视为一个共享相似命名约定的完全不同的功能。

> warning **警告** 请注意，[lifecycle hooks methods](/fundamentals/lifecycle-events) 不会在延迟加载的模块和服务中被调用。

#### 入门

为了按需加载模块，Nest 提供了 `LazyModuleLoader` 类，可以以常规方式注入到类中：

```typescript title="cats.service.ts"
@Injectable()
export class CatsService {
  constructor(private lazyModuleLoader: LazyModuleLoader) {}
}

```

> info **提示** `LazyModuleLoader` 类从 `@nestjs/core` 包中导入。

或者，您可以从应用程序引导文件（`main.ts`）中获取 `LazyModuleLoader` 提供者的引用，如下所示：

```typescript
// "app" represents a Nest application instance
const lazyModuleLoader = app.get(LazyModuleLoader);

```

有了这个，您现在可以使用以下结构加载任何模块：

```typescript
const { LazyModule } = await import('./lazy.module');
const moduleRef = await this.lazyModuleLoader.load(() => LazyModule);

```

> info **提示** "延迟加载"的模块在首次调用 `LazyModuleLoader#load` 方法时会被**缓存**。这意味着，每次后续尝试加载 `LazyModule` 都会**非常快**，并返回缓存的实例，而不是重新加载模块。
>
> ```bash
> Load "LazyModule" attempt: 1
> time: 2.379ms
> Load "LazyModule" attempt: 2
> time: 0.294ms
> Load "LazyModule" attempt: 3
> time: 0.303ms
> ```

>
> 此外，"延迟加载"的模块与应用程序引导时急切加载的模块以及稍后在应用程序中注册的任何其他延迟模块共享相同的模块图。

其中 `lazy.module.ts` 是一个导出**常规 Nest 模块**的 TypeScript 文件（无需额外更改）。

`LazyModuleLoader#load` 方法返回 `LazyModule` 的 [module reference](/fundamentals/module-reference)，它允许您浏览内部提供者列表，并使用其注入令牌作为查找键来获取任何提供者的引用。

例如，假设我们有一个具有以下定义的 `LazyModule`：

```typescript
@Module({
  providers: [LazyService],
  exports: [LazyService],
})
export class LazyModule {}

```

> info **提示** 延迟加载的模块不能注册为**全局模块**，因为这根本没有意义（因为它们是按需延迟注册的，此时所有静态注册的模块已经被实例化）。同样，注册的**全局增强器**（守卫/拦截器等）也**无法正常工作**。

有了这个，我们可以获取 `LazyService` 提供者的引用，如下所示：

```typescript
const { LazyModule } = await import('./lazy.module');
const moduleRef = await this.lazyModuleLoader.load(() => LazyModule);

const { LazyService } = await import('./lazy.service');
const lazyService = moduleRef.get(LazyService);

```

> warning **警告** 如果您使用 **Webpack**，请确保更新您的 `tsconfig.json` 文件 - 将 `compilerOptions.module` 设置为 `"esnext"`，并添加 `compilerOptions.moduleResolution` 属性，其值为 `"node"`：
>
> ```json
> {
>   "compilerOptions": {
>     "module": "esnext",
>     "moduleResolution": "node",
>     ...
>   }
> }
> ```

>
> 设置好这些选项后，您将能够利用 [code splitting](https://webpack.js.org/guides/code-splitting/) 功能。

#### 延迟加载控制器、网关和解析器

由于 Nest 中的控制器（或 GraphQL 应用程序中的解析器）代表路由/路径/主题（或查询/变更）的集合，因此您**无法使用** `LazyModuleLoader` 类来**延迟加载它们**。

> error **警告** 在延迟加载模块中注册的控制器、[resolvers](/graphql/resolvers-map) 和 [gateways](/websockets/gateways) 将无法按预期工作。同样，您也无法按需注册中间件函数（通过实现 `MiddlewareConsumer` 接口）。

例如，假设您正在构建一个底层使用 Fastify 驱动的 REST API（HTTP 应用程序）（使用 `@nestjs/platform-fastify` 包）。Fastify 不允许您在应用程序就绪/成功监听消息后注册路由。这意味着即使我们分析了模块控制器中注册的路由映射，所有延迟加载的路由也无法访问，因为没有办法在运行时注册它们。

同样，我们在 `@nestjs/microservices` 包中提供的一些传输策略（包括 Kafka、gRPC 或 RabbitMQ）要求在建立连接之前订阅/监听特定的主题/通道。一旦您的应用程序开始监听消息，框架将无法订阅/监听新的主题。

最后，`@nestjs/graphql` 包在启用代码优先方法时会根据元数据自动即时生成 GraphQL 模式。这意味着它需要事先加载所有类。否则，将无法创建适当且有效的模式。

#### 常见用例

最常见的情况是，当您的工作进程/定时任务/lambda 和无服务器函数/webhook 必须根据输入参数（路由路径/日期/查询参数等）触发不同的服务（不同的逻辑）时，您会看到延迟加载模块。另一方面，对于启动时间不太重要的单体应用程序，延迟加载模块可能没有太大意义。