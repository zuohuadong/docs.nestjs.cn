<!-- 此文件从 content/fundamentals/provider-scopes.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:31:58.544Z -->
<!-- 源文件: content/fundamentals/provider-scopes.md -->
<!-- 源哈希: d10a2a221290903fd5464d1dfca06b93 -->

### 注入作用域

对于来自不同编程语言背景的人来说，可能会意外地发现在 Nest 中，几乎所有内容都在传入请求之间共享。我们有数据库连接池、具有全局状态的单例服务等。请记住，Node.js 并不遵循请求/响应多线程无状态模型，在该模型中每个请求由单独的线程处理。因此，在我们的应用程序中使用单例实例是完全**安全**的。

然而，在某些边缘情况下，基于请求的生命周期可能是期望的行为，例如 GraphQL 应用程序中的每请求缓存、请求跟踪和多租户。注入作用域提供了一种机制来获得所需的提供者生命周期行为。

#### 提供者作用域

提供者可以具有以下任何作用域：

<table>
  <tr>
    <td><code>DEFAULT</code></td>
    <td>提供者的单个实例在整个应用程序中共享。实例生命周期直接与应用程序生命周期绑定。一旦应用程序引导完成，所有单例提供者都已被实例化。默认使用单例作用域。</td>
  </tr>
  <tr>
    <td><code>REQUEST</code></td>
    <td>为每个传入的<strong>请求</strong>专门创建提供者的新实例。请求处理完成后，该实例将被垃圾回收。</td>
  </tr>
  <tr>
    <td><code>TRANSIENT</code></td>
    <td>瞬态提供者不在消费者之间共享。每个注入瞬态提供者的消费者都将收到一个新的专用实例。</td>
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

> info **提示** 从 `@nestjs/common` 导入 `Scope` 枚举

默认使用单例作用域，无需声明。如果您确实想将提供者声明为单例作用域，请对 `scope` 属性使用 `Scope.DEFAULT` 值。

> warning **注意** WebSocket 网关不应使用请求作用域的提供者，因为它们必须作为单例运行。每个网关封装一个真实的套接字，不能多次实例化。该限制也适用于其他一些提供者，例如 [_Passport strategies_](/security/authentication#请求作用域策略) 或 _Cron 控制器_。

#### 控制器作用域

控制器也可以具有作用域，该作用域适用于该控制器中声明的所有请求方法处理程序。与提供者作用域一样，控制器的作用域声明了其生命周期。对于请求作用域的控制器，会为每个入站请求创建一个新实例，并在请求处理完成后进行垃圾回收。

使用 `ControllerOptions` 对象的 `scope` 属性声明控制器作用域：

```typescript
@Controller({
  path: 'cats',
  scope: Scope.REQUEST,
})
export class CatsController {}

```

#### 作用域层次结构

`REQUEST` 作用域会沿着注入链向上冒泡。依赖于请求作用域提供者的控制器本身也将是请求作用域的。

想象以下依赖图：`CatsController <- CatsService <- CatsRepository`。如果 `CatsService` 是请求作用域的（而其他是默认单例），那么 `CatsController` 将变为请求作用域，因为它依赖于注入的服务。不依赖的 `CatsRepository` 将保持单例作用域。

瞬态作用域的依赖不遵循该模式。如果单例作用域的 `DogsService` 注入了瞬态的 `LoggerService` 提供者，它将收到该提供者的一个新实例。然而，`DogsService` 将保持单例作用域，因此将其注入到任何地方都不会解析为 `DogsService` 的新实例。如果这是期望的行为，`DogsService` 也必须显式标记为 `TRANSIENT`。

<app-banner-courses></app-banner-courses>

#### 请求提供者

在基于 HTTP 服务器的应用程序中（例如使用 `@nestjs/platform-express` 或 `@nestjs/platform-fastify`），您可能希望在使用请求作用域的提供者时访问原始请求对象的引用。您可以通过注入 `REQUEST` 对象来实现这一点。

`REQUEST` 提供者本质上是请求作用域的，这意味着在使用它时您不需要显式指定 `REQUEST` 作用域。此外，即使您尝试这样做，它也会被忽略。任何依赖请求作用域提供者的提供者都会自动采用请求作用域，并且此行为无法更改。

```typescript
import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';

@Injectable({ scope: Scope.REQUEST })
export class CatsService {
  constructor(@Inject(REQUEST) private request: Request) {}
}

```

由于底层平台/协议的差异，对于微服务或 GraphQL 应用程序，您访问入站请求的方式略有不同。在 [GraphQL](/graphql/quick-start) 应用程序中，您注入 `CONTEXT` 而不是 `REQUEST`：

```typescript
import { Injectable, Scope, Inject } from '@nestjs/common';
import { CONTEXT } from '@nestjs/graphql';

@Injectable({ scope: Scope.REQUEST })
export class CatsService {
  constructor(@Inject(CONTEXT) private context) {}
}

```

然后您配置您的 `context` 值（在 `GraphQLModule` 中）以包含 `request` 作为其属性。

#### 查询者提供者

如果您想获取提供者被构造的类，例如在日志或指标提供者中，您可以注入 `INQUIRER` 令牌。

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

在上面的示例中，当调用 `AppService#getRoot` 时，`"AppService: My name is getRoot"` 将被记录到控制台。

#### 性能

使用请求作用域的提供者会对应用程序性能产生影响。虽然 Nest 会尽可能多地缓存元数据，但它仍然需要在每个请求上创建您的类的一个实例。因此，它会减慢您的平均响应时间和整体基准测试结果。除非提供者必须是请求作用域的，否则强烈建议您使用默认的单例作用域。

> info **提示** 尽管这一切听起来相当令人生畏，但一个设计得当、利用请求作用域提供者的应用程序在延迟方面不应减慢超过约 5%。

#### 持久提供者

如上节所述，请求作用域的提供者可能会导致延迟增加，因为至少有一个请求作用域的提供者（注入到控制器实例中，或更深层地注入到其某个提供者中）也会使控制器成为请求作用域。这意味着它必须为每个单独的请求重新创建（实例化）（并在之后被垃圾回收）。这也意味着，例如，对于 30k 个并行请求，将会有 30k 个控制器的临时实例（及其请求作用域的提供者）。

拥有一个大多数提供者都依赖的公共提供者（想想数据库连接或日志记录服务），会自动将所有那些提供者转换为请求作用域的提供者。这在**多租户应用程序**中可能会带来挑战，特别是对于那些拥有一个中央请求作用域的"数据源"提供者，该提供者从请求对象中获取标头/令牌，并根据其值检索相应的数据库连接/模式（特定于该租户）的应用程序。

例如，假设您有一个由 10 个不同客户交替使用的应用程序。每个客户都有其**自己的专用数据源**，您希望确保客户 A 永远无法访问客户 B 的数据库。实现这一点的一种方法是声明一个请求作用域的"数据源"提供者，该提供者基于请求对象确定"当前客户"并检索其对应的数据库。使用这种方法，您可以在几分钟内将您的应用程序转变为多租户应用程序。但是，这种方法的一个主要缺点是，由于您的应用程序的很大一部分组件很可能依赖于"数据源"提供者，它们将隐式地变为"请求作用域"，因此您无疑会看到应用程序性能受到影响。

但是如果我们有一个更好的解决方案呢？既然我们只有 10 个客户，难道我们不能为每个客户拥有 10 个独立的 [DI sub-trees](/fundamentals/module-reference#解析作用域提供者)（而不是在每个请求时重新创建每个树）吗？如果您的提供者不依赖于每个连续请求真正唯一的任何属性（例如，请求 UUID），而是有一些特定的属性让我们能够聚合（分类）它们，那么就没有理由在每个传入请求上_重新创建依赖注入子树_。

这正是**持久提供者**派上用场的时候。

在我们开始将提供者标记为持久之前，我们必须首先注册一个**策略**，该策略指示 Nest 哪些是那些"公共请求属性"，提供将请求分组（将它们与相应的依赖注入子树关联）的逻辑。

```typescript
import {
  HostComponentInfo,
  ContextId,
  ContextIdFactory,
  ContextIdStrategy,
} from '@nestjs/core';
import { Request } from 'express';

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

> info **提示** 与请求作用域类似，持久性会沿着注入链向上冒泡。这意味着如果 A 依赖于被标记为 `durable` 的 B，那么 A 也会隐式地变为持久（除非为 A 提供者显式地将 `durable` 设置为 `false`）。

> warning **警告** 请注意，此策略不适用于运营大量租户的应用程序。

从 `attach` 方法返回的值指示 Nest 应为给定主机使用什么上下文标识符。在这种情况下，我们指定当主机组件（例如，请求作用域的控制器）被标记为持久时，应使用 `tenantSubTreeId` 而不是原始的、自动生成的 `contextId` 对象（您可以在下面了解如何将提供者标记为持久）。此外，在上面的示例中，**不会注册任何有效负载**（其中有效负载 = 表示"根"（子树的父级）的 `REQUEST`/`CONTEXT` 提供者）。

如果您想为持久树注册有效负载，请改用以下构造：

```typescript
// The return of `AggregateByTenantContextIdStrategy#attach` method:
return {
  resolve: (info: HostComponentInfo) =>
    info.isTreeDurable ? tenantSubTreeId : contextId,
  payload: { tenantId },
};

```

现在，每当您使用 `@Inject(REQUEST)`/`@Inject(CONTEXT)` 注入 `REQUEST` 提供者（或对于 GraphQL 应用程序使用 `CONTEXT`）时，将注入 `payload` 对象（在这种情况下由单个属性 - `tenantId` 组成）。

好了，有了这个策略，您可以在代码中的某个位置注册它（因为它无论如何都是全局应用的），例如，您可以将其放在 `main.ts` 文件中：

```typescript
ContextIdFactory.apply(new AggregateByTenantContextIdStrategy());

```

> info **提示** `ContextIdFactory` 类是从 `@nestjs/core` 包中导入的。

只要注册发生在任何请求到达您的应用程序之前，一切都会按预期工作。

最后，要将常规提供者转换为持久提供者，只需将 `durable` 标志设置为 `true` 并将其作用域更改为 `Scope.REQUEST`（如果请求作用域已经在注入链中，则不需要）：

```typescript
import { Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class CatsService {}

```

类似地，对于 [custom providers](/fundamentals/dependency-injection)，在提供者注册的长格式中设置 `durable` 属性：

```typescript
{
  provide: 'foobar',
  useFactory: () => { ... },
  scope: Scope.REQUEST,
  durable: true,
}

```