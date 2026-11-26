<!-- 此文件从 content/fundamentals/lazy-loading-modules.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:34:06.000Z -->
<!-- 源文件: content/fundamentals/lazy-loading-modules.md -->
<!-- 源哈希: 6fdc5d31e27a88bf3e0da5718ea6af88 -->

### 延迟加载模块

默认情况下，模块是急切加载的：应用程序加载时，无论是否立即需要，所有模块都会被加载。这对于大多数应用程序是足够的，但对于在**无服务器环境**中运行的应用程序和工作进程来说，这可能成为瓶颈，因为启动延迟（“冷启动”）至关重要。

延迟加载可以通过仅加载特定无服务器函数调用所需的模块来减少引导时间。您还可以在无服务器函数“预热”后异步加载其他模块，以进一步加快后续调用的引导时间（延迟模块注册）。

> info **提示** 如果您熟悉 **[Angular](https://angular.dev/)** 框架，您可能以前见过“[lazy-loading modules](https://angular.dev/guide/ngmodules/lazy-loading#lazy-loading-basics)”这个术语。在 Nest 中，这种技术在**功能上是不同的**，所以请将其视为一个碰巧同名但完全不同的特性。

> warning **警告** [Lifecycle hook methods](/fundamentals/lifecycle-events) 不会在延迟加载的模块和服务中被调用。

#### 入门

要按需加载模块，Nest 提供了 `LazyModuleLoader` 类，您可以像注入任何其他依赖项一样将其注入到类中：

```typescript title="cats.service.ts"
@Injectable()
export class CatsService {
  constructor(private lazyModuleLoader: LazyModuleLoader) {}
}

```

> info **提示** `LazyModuleLoader` 类是从 `@nestjs/core` 包导入的。

或者，您可以在应用程序引导文件（`main.ts`）内部获取对 `LazyModuleLoader` 提供者的引用：

```typescript
// "app" represents a Nest application instance
const lazyModuleLoader = app.get(LazyModuleLoader);

```

有了这个设置，您可以使用以下构造加载任何模块：

```typescript
const { LazyModule } = await import('./lazy.module.js');
const moduleRef = await this.lazyModuleLoader.load(() => LazyModule);

```

> info **提示** 延迟加载的模块在第一次调用 `LazyModuleLoader#load` 方法时会被**缓存**。因此，后续尝试加载 `LazyModule` 时**非常快**，它返回缓存的实例而不是重新加载模块。
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
> 此外，延迟加载的模块与应用程序引导时急切加载的模块以及应用程序中稍后注册的任何其他延迟模块具有相同的模块图。

在这里，`lazy.module.ts` 是一个导出**常规 Nest 模块**的 TypeScript 文件（无需额外更改）。

`LazyModuleLoader#load` 方法返回 [module reference](/fundamentals/module-reference)（来自 `LazyModule`），这允许您使用其注入令牌作为查找键来遍历内部提供者列表并获取任何提供者的引用。

> info **提示** `load()` 方法接受一个可选的第二个参数，即一个选项对象。将其 `logger` 属性设置为 `false` 可抑制 Nest 在加载模块时生成的日志。

例如，假设我们有一个具有以下定义的 `LazyModule`：

```typescript
@Module({
  providers: [LazyService],
  exports: [LazyService],
})
export class LazyModule {}

```

> info **提示** 延迟加载的模块不能注册为**全局模块**，因为它们是在所有静态注册的模块实例化之后，按需延迟注册的。同样，注册的**全局增强器**（守卫、拦截器等）**也不会**正常工作。

有了这个，我们可以获取对 `LazyService` 提供者的引用：

```typescript
const { LazyModule } = await import('./lazy.module.js');
const moduleRef = await this.lazyModuleLoader.load(() => LazyModule);

const { LazyService } = await import('./lazy.service.js');
const lazyService = moduleRef.get(LazyService);

```

> warning **警告** 如果您使用 **webpack**，请更新您的 `tsconfig.json` 文件：将 `compilerOptions.module` 设置为 `"esnext"`，并添加 `compilerOptions.moduleResolution` 属性，其值为 `"node"`：
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
> 设置了这些选项后，您可以使用 webpack 的 [code splitting](https://webpack.js.org/guides/code-splitting/) 功能。

#### 延迟加载控制器、网关和解析器

因为 Nest 中的控制器（或 GraphQL 应用程序中的解析器）代表一组路由、路径或主题（或查询和变更），所以您**不能使用** `LazyModuleLoader` 类来延迟加载它们。

> error **警告** 延迟加载模块内部注册的控制器、[resolvers](/graphql/resolvers-map) 和 [gateways](/websockets/gateways) 不会按预期工作。类似地，您不能按需注册中间件（通过使用 `NestModule` 接口的 `configure()` 方法并传入 `MiddlewareConsumer`）。

例如，假设您正在使用 Fastify 作为底层（使用 `@nestjs/platform-fastify` 包）构建一个 REST API（HTTP 应用程序）。Fastify 不允许在应用程序准备就绪并正在监听后注册路由。因此，即使 Nest 分析了模块控制器中注册的路由映射，延迟加载的路由也无法访问，因为没有运行时注册它们的方法。

同样，`@nestjs/microservices` 包提供的某些传输策略（包括 Kafka、gRPC 和 RabbitMQ）在建立连接之前必须订阅特定的主题或通道。一旦您的应用程序开始监听消息，框架就无法订阅新主题。

最后，`@nestjs/graphql` 包在启用代码优先方法时，会根据元数据即时生成 GraphQL 模式。这要求所有类都预先加载；否则，它无法创建有效的模式。

#### 常见用例

当工作进程、定时任务、lambda 或其他无服务器函数需要根据其输入参数（路由路径、日期、查询参数等）触发不同的服务（不同逻辑）时，延迟加载模块最为常见。对于启动时间基本不重要的单体应用程序来说，延迟加载模块的意义不大。