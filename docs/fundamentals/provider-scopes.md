<!-- 此文件从 content/fundamentals/provider-scopes.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:35:54.644Z -->
<!-- 源文件: content/fundamentals/provider-scopes.md -->
<!-- 源哈希: 7ced6a015c11dc218fb8a4320e473e78 -->

### 注入作用域

如果您来自不同的编程语言背景，可能会惊讶地发现，在 Nest 中，几乎所有内容都会在传入的请求之间共享：数据库的连接池、具有全局状态的单例服务等等。Node.js 不遵循多线程无状态的请求/响应模型，即每个请求由一个独立的线程处理。因此，在 Nest 应用程序中使用单例实例是完全**安全**的。

然而，在某些边缘情况下，基于请求的生命周期是期望的行为，例如 GraphQL 应用程序中的每请求缓存、请求跟踪和多租户。注入作用域允许您获取所需的提供者生命周期。

#### 提供者作用域

一个提供者可以具有以下任何作用域：

<table>
  <tr>
    <td><code>DEFAULT</code></td>
    <td>提供者的单个实例在整个应用程序中共享。实例生命周期直接与应用程序生命周期绑定。应用程序启动后，所有单例提供者都已实例化。单例作用域是默认的。</td>
  </tr>
  <tr>
    <td><code>REQUEST</code></td>
    <td>每个传入的<strong>请求</strong>都会为提供者创建一个新的实例。请求处理后，该实例会被垃圾回收。</td>
  </tr>
  <tr>
    <td><code>TRANSIENT</code></td>
    <td>瞬态提供者在消费者之间不共享。注入瞬态提供者的每个消费者都会收到一个新的、专用的实例。</td>
  </tr>
</table>

> info **提示** 对于大多数用例，**推荐**使用单例作用域。在消费者和请求之间共享提供者意味着实例可以被缓存，并且其初始化仅在应用程序启动期间发生一次。

#### 用法

通过将 `scope` 属性传递给 `@Injectable()` 装饰器选项对象来指定注入作用域：

```typescript
import { Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.REQUEST })
export class CatsService {}

```

类似地，对于 [custom providers](/fundamentals/dependency-injection)，在提供者注册的长格式中设置 `scope` 属性：

```typescript
{
  provide: 'CACHE_MANAGER',
  useClass: CacheManager,
  scope: Scope.TRANSIENT,
}

```

> info **提示** 从 `@nestjs/common` 导入 `Scope` 枚举。

单例作用域是默认的，无需声明。如果您想明确将提供者声明为单例作用域，请使用 `Scope.DEFAULT` 值作为 `scope` 属性的值。

> info **提示** 从 NestJS v12 开始，WebSocket 网关支持请求作用域的提供者。作用域与 socket 连接绑定，而不是与单个消息绑定。参见 [Request-scoped gateways](/websockets/gateways#请求作用域的网关)。

> warning **注意** 有些提供者必须充当单例，不应使用请求作用域的提供者，例如 [_Passport strategies_](/recipes/passport#请求作用域策略) 或 _Cron 控制器_。

#### 控制器作用域

控制器也可以有作用域，这适用于该控制器中声明的所有路由处理器。与提供者作用域一样，控制器的作用域定义了其生命周期。对于请求作用域的控制器，每个传入请求都会创建一个新实例，并在请求处理后被垃圾回收。

使用 `scope` 属性来声明 `ControllerOptions` 对象的控制器作用域：

```typescript
@Controller({
  path: 'cats',
  scope: Scope.REQUEST,
})
export class CatsController {}

```

#### 作用域层次结构

`REQUEST` 作用域会向上冒泡到注入链。依赖于请求作用域提供者的控制器本身也是请求作用域的。

考虑以下依赖图：`CatsController <- CatsService <- CatsRepository`。如果 `CatsService` 是请求作用域的（而其他都是默认单例），则 `CatsController` 变为请求作用域，因为它依赖于注入的服务。不依赖于 `CatsService` 的 `CatsRepository` 保持单例作用域。

瞬态作用域的依赖项不遵循此模式。如果一个单例作用域的 `DogsService` 注入一个瞬态 `LoggerService` 提供者，它会收到该提供者的一个新实例。然而，`DogsService` 保持单例作用域，因此在任何地方注入它**不会**解析为 `DogsService` 的新实例。如果需要这种行为，也明确将 `DogsService` 标记为 `TRANSIENT`。

<app-banner-courses></app-banner-courses>

#### 请求提供者

在基于 HTTP 服务器的应用程序中（例如使用 `@nestjs/platform-express` 或 `@nestjs/platform-fastify`），当使用请求作用域的提供者时，您可能需要访问原始请求对象的引用。为此，请注入 `REQUEST` 对象。

`REQUEST` 提供者本质上是请求作用域的，因此在使用它时不需要明确指定 `REQUEST` 作用域（如果指定了，则会被忽略）。任何依赖于请求作用域提供者的提供者都会自动采用请求作用域，此行为不可更改。

```typescript
import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';

@Injectable({ scope: Scope.REQUEST })
export class CatsService {
  constructor(@Inject(REQUEST) private request: Request) {}
}

```

由于底层平台和协议的差异，在微服务或 GraphQL 应用程序中访问传入请求的方式略有不同。在 [GraphQL](/graphql/quick-start) 应用程序中，请注入 `CONTEXT` 而不是 `REQUEST`：

```typescript
import { Injectable, Scope, Inject } from '@nestjs/common';
import { CONTEXT } from '@nestjs/graphql';

@Injectable({ scope: Scope.REQUEST })
export class CatsService {
  constructor(@Inject(CONTEXT) private context) {}
}

```

然后配置您的 `context` 值（在 `GraphQLModule`）以包含 `request` 作为属性。

#### Inquirer 提供者

要获取提供者被构造的类，例如在日志记录或指标提供者中，请注入 `INQUIRER` 令牌：

```typescript
import { Inject, Injectable, Scope } from '@nestjs/common';
import { INQUIRER } from '@nestjs/core';

@Injectable({ scope: Scope.TRANSIENT })
export class HelloService {
  constructor(@Inject(INQUIRER) private parentClass: object) {}

  sayHello(message: string) {
    console.log(`${this.parentClass?.constructor?.name}: ${message}`);
  }
}

```

然后按如下方式使用它：

```typescript
import { Injectable } from '@nestjs/common';
import { HelloService } from './hello.service.js';

@Injectable()
export class AppService {
  constructor(private helloService: HelloService) {}

  getRoot(): string {
    this.helloService.sayHello('My name is getRoot');

    return 'Hello world!';
  }
}

```

在上面的示例中，当调用 `AppService#getRoot` 时，会将 `"AppService: My name is getRoot"` 记录到控制台。

#### 性能

请求作用域的提供者会影响应用程序性能。尽管 Nest 会缓存尽可能多的元数据，但它仍然需要在每次请求上创建您类的实例，这会减慢您的平均响应时间和整体基准测试结果。除非提供者必须是请求作用域的，否则我们强烈建议使用默认的单例作用域。

> info **提示** 使用请求作用域提供者的设计良好的应用程序不应看到延迟增加超过 ~5%。

许多提供者仅用于读取属于当前请求的值：已认证用户、租户或区域设置。为此，基于 `AsyncLocalStorage` 的每请求存储可使每个提供者保持单例，并且在 HTTP 处理器、微服务消息处理器和队列任务中以相同方式工作。如果您的应用程序使用 [NestJS Observe](/observability/overview)，它已经为它所检测到的每个请求、消息和任务维护了此类存储：使用 `TracerService.setAttribute()` 写入，并从下游的任何地方使用 `getAttribute()` 读取，无需更改作用域，也无需维护自己的存储。有关详细信息和替代方案，请参阅 [Async local storage](/recipes/async-local-storage#nestjs-observe)。

#### 持久提供者

如前一节所述，请求作用域的提供者可能会增加延迟，因为至少有一个请求作用域的提供者（注入到控制器实例中，或更深地注入到其提供者之一中）也会使控制器成为请求作用域的。然后，控制器必须为每个单独的请求重新创建（实例化）并在之后进行垃圾回收。例如，在并行处理 30k 个请求时，将有 30k 个临时的控制器实例（及其请求作用域的提供者）。

如果大多数提供者依赖的通用提供者（例如数据库连接或日志服务）是请求作用域的，那么所有这些提供者也会自动成为请求作用域的。这在**多租户应用程序**中可能构成挑战，特别是那些具有中央请求作用域“数据源”提供者，该提供者从请求对象中读取标头或令牌，并根据其值检索该租户对应的数据库连接或模式的应用程序。

例如，假设您的应用程序被 10 个不同的客户使用。每个客户都有**专用的数据源**，您希望确保客户 A 永远无法访问客户 B 的数据库。实现此的一种方法是声明一个请求作用域的“数据源”提供者，该提供者从请求对象中确定“当前客户”并检索相应的数据库。这种方法可以在几分钟内将您的应用程序转变为多租户应用程序。其主要缺点是应用程序的大部分组件可能依赖于“数据源”提供者，因此它们隐式地成为请求作用域的，从而降低了应用程序的性能。

对于只有 10 个客户的情况，您反而可以为每个客户设置 10 个独立的 [DI sub-trees](/fundamentals/module-reference#解析作用域提供者)，而不是为每个请求重新创建整个树。如果您的提供者不依赖于任何真正对每个请求唯一的属性（例如请求 UUID），而是依赖于可用于聚合（分类）请求的特定属性，那么就没有理由在每次传入请求时**重新创建 DI 子树**。

这就是**持久提供者**发挥作用的地方。

在将提供者标记为持久之前，您必须注册一个**策略**，告诉 Nest 哪些是这些“通用请求属性”，并提供分组请求的逻辑，即将其与相应的 DI 子树关联起来。

```typescript
import {
  HostComponentInfo,
  ContextId,
  ContextIdFactory,
  ContextIdStrategy,
} from '@nestjs/core';
import type { Request } from 'express';

const tenants = new Map<string, ContextId>();

export class AggregateByTenantContextIdStrategy implements ContextIdStrategy {
  attach(contextId: ContextId, request: Request) {
    const tenantId = request.headers['x-tenant-id'] as string;
    let tenantSubTreeId: ContextId;

    if (tenants.has(tenantId)) {
      tenantSubTreeId = tenants.get(tenantId);
    } else {
      tenantSubTreeId = ContextIdFactory.create();
      tenants.set(tenantId, tenantSubTreeId);
    }

    // If tree is not durable, return the original "contextId" object
    return (info: HostComponentInfo) =>
      info.isTreeDurable ? tenantSubTreeId : contextId;
  }
}

```

> info **提示** 与请求作用域一样，持久性会向上冒泡注入链。如果 A 依赖于 B，而 B 被标记为 `durable`，则 A 隐式地也成为持久的，前提是 A 的所有其他请求作用域依赖项也是持久的（除非 A 明确使用 `Scope.REQUEST` 和 `durable: false` 声明）。

> warning **警告** 此策略不适用于拥有大量租户的应用程序。

从 `attach` 方法返回的值告诉 Nest 为给定主机使用哪个上下文标识符。在这种情况下，我们指定当主机组件（例如请求作用域的控制器）被标记为持久时，应使用 `tenantSubTreeId` 而不是原始的、自动生成的 `contextId` 对象（您将在下面学习如何将提供者标记为持久）。此外，在上面的示例中，**未注册任何负载**（负载是代表“根”的 `REQUEST`/`CONTEXT` 提供者，即子树的父级）。

要为持久树注册负载，请使用以下构造代替：

```typescript
// The return of `AggregateByTenantContextIdStrategy#attach` method:
return {
  resolve: (info: HostComponentInfo) =>
    info.isTreeDurable ? tenantSubTreeId : contextId,
  payload: { tenantId },
};

```

现在，无论何时使用 `REQUEST` 提供者（或 GraphQL 应用程序中的 `CONTEXT`）并传入 `@Inject(REQUEST)`/`@Inject(CONTEXT)`，都会注入 `payload` 对象（在这种情况下包含单个属性 `tenantId`）。

设置好此策略后，请在代码的任何地方注册它（全局适用），例如在 `main.ts` 文件中：

```typescript
ContextIdFactory.apply(new AggregateByTenantContextIdStrategy());

```

> info **提示** `ContextIdFactory` 类是从 `@nestjs/core` 包导入的。

只要注册发生在任何请求到达您的应用程序之前，一切就会按预期工作。

最后，要将常规提供者转换为持久提供者，请将 `durable` 标志设置为 `true` 并将其作用域更改为 `Scope.REQUEST`。Nest 仅在明确使用 `Scope.REQUEST` 声明的提供者上读取 `durable` 标志；仅通过其依赖项隐式是请求作用域的提供者，其持久性源于这些依赖项，如上述提示所述。

```typescript
import { Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class CatsService {}

```

类似地，对于 [custom providers](/fundamentals/dependency-injection)，请在提供者注册的长格式中设置 `durable` 属性：

```typescript
{
  provide: 'foobar',
  useFactory: () => { ... },
  scope: Scope.REQUEST,
  durable: true,
}

```

> info **提示** 对于完整的多租户应用程序中的持久提供者，如果子树数量有限，请遵循 [Build a multi-tenant SaaS backend in Node.js](/tutorials/multi-tenant-saas#give-each-organization-its-own-di-sub-tree)。