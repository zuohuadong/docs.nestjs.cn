<!-- 此文件从 content/observability/manual-instrumentation.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:40:51.512Z -->
<!-- 源文件: content/observability/manual-instrumentation.md -->
<!-- 源哈希: 7d8b0bf25bebaa27f7d9f657d05b99c5 -->

### 手动插桩

SDK 的大部分是自动插桩：你配置一次，它就决定记录什么。`TracerService` 是手动部分。将其注入到应用程序的任何位置，即可在已追踪的请求内部添加跨度，将上下文附加到该请求，捕获你自己处理的错误，并报告你自己的指标。

```typescript title="cats.service.ts"
import { Injectable } from '@nestjs/common';
import { TracerService } from '@nestjs/observe';

@Injectable()
export class CatsService {
  constructor(private readonly tracerService: TracerService) {}
}

```

`ObserveModule.forRoot()` 注册一个全局模块，该模块导出了 `TracerService`，因此你可以在任何模块中注入它，而无需再次导入 `ObserveModule`。（`forRootAsync()` 也是全局的，除非你传入 `global: false`。）每个方法都从环境异步上下文读取追踪信息。在请求、任务或其他已插桩操作之外，没有可附加的追踪信息，因此不记录任何内容：`createSpan()` 以未追踪的方式运行其回调，`activeSpan()` 解析为一个不记录任何内容的跨度，`setAttribute()` 不执行任何操作，`getAttribute()` 返回 `undefined`，`captureError()` 不记录任何内容并仅记录一次警告，而 `currentTraceId()` 返回 `null`。在 SDK 0.3.27 之前，这些调用会抛出错误。[Custom metrics](#自定义指标) 与追踪信息无关，可以在任何地方工作。

#### 创建跨度

`createSpan(name, callback)` 在当前活动跨度下嵌套一个新的跨度内部运行回调，并返回回调返回值的 promise。跨度的持续时间即为回调的持续时间，因此你可以测量任何你想要衡量的东西：

```typescript title="cats.service.ts"
async findOne(id: string, activeUser: ActiveUserData) {
  return this.tracerService.createSpan('cats.findOne', async (span) => {
    span.addTags({ userId: activeUser.sub, catId: id });
    return this.catsRepository.findOne(id);
  });
}

```

跨度按调用堆栈嵌套：一个在另一个 `createSpan()` 回调内部的 `createSpan()` 将成为其子跨度，这会在追踪详情页面生成瀑布图。回调可以是同步的也可以是异步的。自动插桩的跨度（控制器方法、提供者、数据库调用）和你的自定义跨度共享同一个树，因此一个手动命名的跨度会精确地出现在相对于其他所有内容运行的位置。

`span` 参数是一个 `TraceSpanDelegate`。其 `addTags(tags)` 方法（或对于单个条目使用 `setTag(key, value)`）仅将键值对附加到该跨度上。与 [SDK → Tags and custom attributes](/observability/sdk#标签和自定义属性) 中描述的 `tags` 选项类似，它们是可搜索的，并且会显示在追踪视图中的跨度上。区别在于作用域：该选项覆盖每个请求，而这些标签覆盖单个跨度。

`activeSpan()` 解析出当前活动跨度的 `TraceSpanDelegate`，而不会创建新跨度。使用它来标记未创建它的代码中包含的外部跨度：

```typescript
const span = await this.tracerService.activeSpan();
span.addTags({ cacheHit: 'false' });

```

如果没有任何跨度处于活动状态，它将解析为一个不记录任何内容的跨度，因此添加到其中的标签会被丢弃。

<figure><img src="https://www.observe.nestjs.com/docs/sdk/spans.webp" alt="Spans" /></figure>

> info **提示** **跨度** 分析视图按跨度名称聚合，跨越调用它们的每个路由。选择描述工作（`orders.recalculate`, `cache.lookup`）而不是调用者的名称，这样仪表板才能告诉你某事物是处处缓慢还是仅来自一个端点。

#### 捕获已处理的错误

从控制器、任务或跨度传播出去的错误会自动记录。`captureError()` 是针对那些没有自动记录的错误：任何你捕获和处理但仍希望在仪表板中可见的错误：

```typescript
try {
  await this.billing.sync(accountId);
} catch (error) {
  await this.tracerService.captureError(error as Error, {
    accountId,
    retryable: 'true',
  });
}

```

该错误会附加到当前追踪上，并附带可选的标签，如果启用 [`sourceContext`](/observability/sdk#错误源代码上下文)，它将获得与任何其他捕获的错误相同的源上下文处理。

#### 请求作用域属性

`setAttribute(key, value)` 和 `getAttribute(key)` 读写追踪自身的上下文存储。其值在请求期间有效，并且可以在下游的任何地方读取，而无需将它们传递到每个函数签名中：

```typescript
this.tracerService.setAttribute('tenantId', tenant.id);
// ...later, in a different service on the same request
const tenantId = this.tracerService.getAttribute('tenantId');

```

`getAttribute()` 为从未设置的键返回 `undefined`，在未追踪的上下文中，`setAttribute()` 不执行任何操作。在守卫、拦截器或任何其他已追踪的调用中设置的属性会保留到请求的其余部分。

追踪 ID 存储在同一个存储中，因此 `getAttribute(traceIdKey)` 可以检索当前的追踪 ID，例如与外部系统关联或用于 [propagate it to another service](/observability/distributed-tracing)。`currentTraceId()` 是该查找的简写，在未追踪的上下文中返回 `null`。

要为存储进行类型定义，请将其形状作为 `TracerService` 的第一个类型参数传递。然后会根据它检查键和值，包括嵌套路径：

```typescript
interface RequestStore {
  tenantId: string;
  flags: { betaCheckout: boolean };
}

@Injectable()
export class CheckoutService {
  constructor(private readonly tracerService: TracerService<RequestStore>) {}

  enableBeta() {
    this.tracerService.setAttribute('flags.betaCheckout', true);
  }
}

```

> info **提示** `ObserveModule` 还导出了持有追踪上下文的 `AsyncLocalStorage` 实例，位于 `AsyncLocalStorage` 类下。每个操作的存储都是一个你可以直接读写的东西；`setAttribute()`/`getAttribute()` 是类型安全的方式。如果你已经使用了 [Async local storage](/recipes/async-local-storage) 配方中描述的模式，此存储可以替换你手动实现的存储：将值保留在其 `Map` 中，并让 SDK 打开存储，因为使用你自己的存储的 `run()` 或 `enterWith()` 会替换操作的存储。如果你也保留了自己的存储，请使用你自己的令牌而不是 `AsyncLocalStorage` 类来提供它。

#### 自定义指标

提供三种指标类型，每种类型都按名称创建（或如果名称已存在则检索）。它们报告到仪表板的 **Custom** 部分，你可以像警报任何内置指标一样对它们设置警报。

与上述方法不同，指标不与追踪相关联，因此你可以从任何地方报告它们，包括启动和关闭代码、`onModuleInit()` 钩子和定时任务。

| 方法    | 用于                                                                        | 报告方法 |
| --------- | -------------------------------------------------------------------------- | ---------------- |
| `counter` | 只增加的值 - 已服务的请求、已完成的订单、尝试的重试次数 | `increment()`    |
| `gauge`   | 增减的值 - 队列深度、活动连接、缓存比率  | `increment()`, `decrement()`, `setValue(value)` |
| `summary` | 你希望计算分位数的分布 - 延迟、有效载荷大小              | `observe(value)` |

```typescript title="cats.service.ts"
this.tracerService
  .counter('cats.lookups', { description: 'Number of cat lookups' })
  .increment();

this.tracerService
  .gauge('cats.active.sessions', {
    kind: 'ratio',
    initialValue: 0,
    description: 'Number of active sessions',
  })
  .increment();

const latency = this.tracerService.summary('cats.lookup.duration', {
  description: 'Duration of cat lookups in milliseconds',
});
const startedAt = performance.now();
try {
  return await this.catsRepository.findOne(id);
} finally {
  // Observed in a finally so a failed lookup still lands in the distribution -
  // dropping the slow failures is how a latency summary ends up flattering itself.
  latency.observe(performance.now() - startedAt);
}

```

调用 `counter('orders.placed')` 两次返回相同的实例，因此你不需要在字段中持有引用，尽管这样做在热路径上更省资源。在后续调用中传递属性会原地更新现有指标的描述和标签。

| 属性      | 适用于              | 描述                                                                                                                           |
| -------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `description`  | counter, gauge, summary | 显示在仪表板中的指标旁边。值得设置：一个纯粹的指标名称很少能向未来的读者解释其含义。             |
| `labels`       | counter, gauge, summary | 指标按此维度细分，因此图表可以被分割，而不是显示一个聚合线。                            |
| `initialValue` | counter, gauge          | 初始值。仅在指标仍处于 `0` 时应用，因此重启时的声明不会覆盖已计数的现有值。 |
| `kind`         | gauge                   | 报告实例独立的值的 `'ratio'`（默认），或跨报告实例求和的值的 `'additive'`。           |
| `sampleSize`   | summary                 | 保留多少个每个标签的观测值以计算分位数，这限制了指标在负载下的内存占用。                 |

<figure><img src="https://www.observe.nestjs.com/docs/sdk/custom-metrics.webp" alt="Custom metrics" /></figure>

已声明但从未报告的指标在仪表板中显示为“未知”，而不是 `0`。这是一个真实状态，而不是缺失数据：“我们从未收到此指标的报告”和“此指标当前为零”是不同的事实，将后者代替前者会隐藏一个部署故障。

#### API 摘要

| 方法 | 需要跟踪 | 描述 |
| :--- | :---: | :--- |
| `createSpan(name, callback)` | ✓ | 在新的子 span 内部运行 `callback`；返回其结果 |
| `activeSpan()` | ✓ | 解析到正在进行的 span 的 `TraceSpanDelegate` |
| `captureError(error, tags?)` | ✓ | 在当前跟踪上记录已处理的错误 |
| `setAttribute(key, value)` | ✓ | 写入请求作用域的上下文存储 |
| `getAttribute(key)` | ✓ | 从请求作用域的上下文存储读取 |
| `currentTraceId()` | ✗ | 活动跟踪 ID，或在跟踪外部的 `null` |
| `counter(name, attributes?)` | ✗ | 获取或创建单调递增的指标 |
| `gauge(name, attributes?)` | ✗ | 获取或创建可以上升和下降的指标 |
| `summary(name, attributes?)` | ✗ | 获取或创建带有分位数的分布指标 |

#### 下一步去哪里

- [Distributed tracing](/observability/distributed-tracing) - 使用 `currentTraceId()` 在服务边界之间保持一个跟踪。
- [Dashboard](/observability/dashboard) - 查看 span、捕获的错误和自定义指标。