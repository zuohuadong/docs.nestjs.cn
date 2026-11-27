<!-- 此文件从 content/fundamentals/execution-context.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:34:41.454Z -->
<!-- 源文件: content/fundamentals/execution-context.md -->
<!-- 源哈希: 5f474e09f73d14f94cc14a65dc64b9ea -->

### 执行上下文

Nest 提供了一些实用类，帮助您编写可以在多个应用程序上下文（例如，基于 HTTP 服务器、微服务和 WebSocket 应用程序上下文）中运行的应用程序。这些实用类提供了当前执行上下文的信息，您可以使用这些信息构建通用的 [guards](/overview/guards)、[filters](/overview/exception-filters) 和 [interceptors](/overview/interceptors)，使其能在广泛的控制器、方法和执行上下文中工作。

本章涵盖了两个此类：`ArgumentsHost` 和 `ExecutionContext`。

#### ArgumentsHost 类

`ArgumentsHost` 类提供了检索传递给处理器的参数的方法。它允许您选择适当的上下文（例如，HTTP、RPC（微服务）或 WebSocket）来检索参数。框架在需要访问它的地方提供 `ArgumentsHost` 的实例，通常引用为 `host` 参数。例如，[exception filter](/overview/exception-filters#参数主机) 的 `catch()` 方法会传入一个 `ArgumentsHost` 实例。

`ArgumentsHost` 作为处理器参数的抽象。例如，在 HTTP 服务器应用程序中（当使用 `@nestjs/platform-express` 时），`host` 对象封装了 Express 的 `[request, response, next]` 数组，其中 `request` 是请求对象，`response` 是响应对象，`next` 是控制应用程序请求-响应周期的函数。对于 [GraphQL](/graphql/quick-start) 应用程序，相反，`host` 对象包含 `[root, args, context, info]` 数组。

#### 当前应用程序上下文

当您构建旨在跨多个应用程序上下文运行的通用 [guards](/overview/guards)、[filters](/overview/exception-filters) 和 [interceptors](/overview/interceptors) 时，您需要一种方法来确定您的方法当前运行在何种应用程序类型中。请使用 `ArgumentsHost` 的 `getType()` 方法来实现此目的。它原生返回 `'http'`、`'rpc'` 或 `'ws'`，而诸如 `@nestjs/graphql` 等包会添加自己的类型：

```typescript
if (host.getType() === 'http') {
  // do something that is only important in the context of regular HTTP requests (REST)
} else if (host.getType() === 'rpc') {
  // do something that is only important in the context of microservice requests
} else if (host.getType<GqlContextType>() === 'graphql') {
  // do something that is only important in the context of GraphQL requests
}

```

> info **提示** `GqlContextType` 类型是从 `@nestjs/graphql` 包导入的。

有了应用程序类型，您就可以像下面所示那样编写更通用的组件。

#### 处理器参数

检索传递给处理器的参数数组的一种方法是使用宿主对象的 `getArgs()` 方法：

```typescript
const [req, res, next] = host.getArgs();

```

您可以使用 `getArgByIndex()` 方法通过索引获取特定参数：

```typescript
const request = host.getArgByIndex(0);
const response = host.getArgByIndex(1);

```

这些示例通过索引检索请求和响应对象，这通常不被推荐，因为它将应用程序耦合到特定的执行上下文。相反，您可以使用 `host` 对象的一个实用方法来使代码更健壮和可重用，从而切换到适当的应用程序上下文。上下文切换的实用方法如下所示。

```typescript
/**
 * Switch context to RPC.
 */
switchToRpc(): RpcArgumentsHost;
/**
 * Switch context to HTTP.
 */
switchToHttp(): HttpArgumentsHost;
/**
 * Switch context to WebSockets.
 */
switchToWs(): WsArgumentsHost;

```

让我们使用 `switchToHttp()` 方法重写前面的示例。`host.switchToHttp()` 辅助调用返回一个适用于 HTTP 应用程序上下文的 `HttpArgumentsHost` 对象。`HttpArgumentsHost` 对象有两个有用的方法来提取所需的对象。该示例还作为类型参数传递了 Express 类型，因此方法返回原生类型的 Express 对象：

```typescript
const ctx = host.switchToHttp();
const request = ctx.getRequest<Request>();
const response = ctx.getResponse<Response>();

```

类似地，`WsArgumentsHost` 和 `RpcArgumentsHost` 具有在 WebSocket 和微服务上下文中返回适当对象的​​方法。以下是 `WsArgumentsHost` 的方法：

```typescript
export interface WsArgumentsHost {
  /**
   * Returns the data object.
   */
  getData<T>(): T;
  /**
   * Returns the client object.
   */
  getClient<T>(): T;
}

```

以下是 `RpcArgumentsHost` 的方法：

```typescript
export interface RpcArgumentsHost {
  /**
   * Returns the data object.
   */
  getData<T>(): T;

  /**
   * Returns the context object.
   */
  getContext<T>(): T;
}

```

#### ExecutionContext 类

`ExecutionContext` 继承自 `ArgumentsHost`，提供了有关当前执行过程的附加详细信息。与 `ArgumentsHost` 类似，Nest 在您可能需要的地方提供 `ExecutionContext` 的实例，例如 [guard](/overview/guards#执行上下文) 的 `canActivate()` 方法和 [interceptor](/overview/interceptors#执行上下文) 的 `intercept()` 方法。它提供了以下方法：

```typescript
export interface ExecutionContext extends ArgumentsHost {
  /**
   * Returns the type of the controller class which the current handler belongs to.
   */
  getClass<T>(): Type<T>;
  /**
   * Returns a reference to the handler (method) that will be invoked next in the
   * request pipeline.
   */
  getHandler(): Function;
}

```

`getHandler()` 方法返回即将被调用的处理器的引用。`getClass()` 方法返回此处理器所属的控制器类的类型。例如，在 HTTP 上下文中，如果当前处理的请求是绑定到 `CatsController` 上的 `create()` 方法的 `POST` 请求，`getHandler()` 返回 `create()` 方法的引用，而 `getClass()` 返回 `CatsController` **类**（而不是实例）。

```typescript
const methodKey = ctx.getHandler().name; // "create"
const className = ctx.getClass().name; // "CatsController"

```

访问当前类和处理器方法都提供了极大的灵活性。最重要的是，它允许您在守卫或拦截器内部读取使用 `Reflector#createDecorator` 创建的装饰器或内置 `@SetMetadata()` 装饰器设置的元数据。接下来的部分涵盖了这种用例。

<app-banner-enterprise></app-banner-enterprise>

#### 反射和元数据

Nest 允许您通过使用 `Reflector#createDecorator` 方法创建的装饰器或内置 `@SetMetadata()` 装饰器，将**自定义元数据**附加到路由处理器上。本节比较了这两种方法，并展示了如何在守卫或拦截器内部访问元数据。

使用 `Reflector#createDecorator` 创建强类型装饰器时，请指定类型参数。例如，让我们创建一个接受字符串数组作为参数的 `Roles` 装饰器。

```ts
import { Reflector } from '@nestjs/core';

export const Roles = Reflector.createDecorator<string[]>();

```

这里的 `Roles` 装饰器是一个接受单个 `string[]` 类型参数的函数。

要使用此装饰器，请用它来注解处理器：

```typescript title="cats.controller.ts"
@Post()
@Roles(['admin'])
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}

```

这会将 `Roles` 装饰器元数据附加到 `create()` 方法上，表明只有具有 `admin` 角色的用户才应被允许访问此路由。

要访问路由的角色（自定义元数据），再次使用 `Reflector` 辅助类。`Reflector` 可以以常规方式注入到类中：

```typescript title="roles.guard.ts"
@Injectable()
export class RolesGuard {
  constructor(private reflector: Reflector) {}
}

```

> info **提示** `Reflector` 类是从 `@nestjs/core` 包导入的。

现在，要读取处理器元数据，请使用 `get()` 方法：

```typescript
const roles = this.reflector.get(Roles, context.getHandler());

```

`Reflector#get` 方法接受两个参数：一个装饰器引用和一个用于从其中检索元数据的**上下文**（装饰器目标）。在此示例中，指定的**装饰器**是 `Roles`（参见上面的 `roles.decorator.ts` 文件）。上下文由对 `context.getHandler()` 的调用提供，该调用提取当前处理的路由处理器的元数据。请记住，`getHandler()` 为您提供的是路由处理器函数的**引用**。

或者，您可以在控制器级别应用元数据，使其应用于控制器类中的所有路由。

```typescript title="cats.controller.ts"
@Roles(['admin'])
@Controller('cats')
export class CatsController {}

```

在这种情况下，要提取控制器元数据，请将 `context.getClass()` 作为第二个参数传递（将控制器类作为元数据提取的**执行上下文**），而不是 `context.getHandler()`：

```typescript title="roles.guard.ts"
const roles = this.reflector.get(Roles, context.getClass());

```

由于元数据可以在多个级别提供，您可能需要从多个**执行上下文**中提取并合并元数据。`Reflector` 类为此提供了两个实用方法。它们一次性提取控制器和方法元数据**两者**，并以不同的方式组合它们。

考虑以下场景，您在两个级别都提供了 `Roles` 元数据。

```typescript title="cats.controller.ts"
@Roles(['user'])
@Controller('cats')
export class CatsController {
  @Post()
  @Roles(['admin'])
  async create(@Body() createCatDto: CreateCatDto) {
    this.catsService.create(createCatDto);
  }
}

```

如果您的意图是将 `'user'` 指定为默认**角色**，并为某些方法选择性地覆盖它，请使用 `getAllAndOverride()` 方法。它返回第一个定义的**值**，按您传递的顺序检查目标：

```typescript
const roles = this.reflector.getAllAndOverride(Roles, [context.getHandler(), context.getClass()]);

```

一个带有此代码的**守卫**，在具有上述元数据的 `create()` 方法的**执行上下文**中运行，结果是 `roles` 包含 `['admin']`。

要从两个级别获取元数据并合并它们（此方法合并数组和对象），请使用 `getAllAndMerge()` 方法：

```typescript
const roles = this.reflector.getAllAndMerge(Roles, [context.getHandler(), context.getClass()]);

```

结果是 `roles` 包含 `['admin', 'user']`（**值**按目标顺序连接）。

对于这两个方法，您将装饰器引用（或元数据键）作为第一个参数，将元数据目标**执行上下文**数组（即对 `getHandler()` 和/或 `getClass()` 方法的调用）作为第二个参数。

#### 低级方法

如前所述，您可以使用内置的 `@SetMetadata()` **装饰器**而不是使用 `Reflector#createDecorator` 来将元数据附加到处理器。

```typescript title="cats.controller.ts"
@Post()
@SetMetadata('roles', ['admin'])
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}

```

> info **提示** `@SetMetadata()` **装饰器**是从 `@nestjs/common` 包导入的。

上述构造将 `roles` 元数据（`roles` 是元数据键，`['admin']` 是关联的**值**）附加到 `create()` 方法。虽然这有效，但在路由中直接使用 `@SetMetadata()` 并不是好实践。相反，请像下面所示创建您自己的**装饰器**：

```typescript title="roles.decorator.ts"
import { SetMetadata } from '@nestjs/common';

export const Roles = (...roles: string[]) => SetMetadata('roles', roles);

```

这种方法更清晰、更易读，类似于 `Reflector#createDecorator` 方法。区别在于，使用 `@SetMetadata()` 时，您对元数据键和**值**有更多的控制权，并且可以创建接受多个参数的**装饰器**。

在设置了自定义 `@Roles()` **装饰器**后，您可以使用它来装饰 `create()` 方法。

```typescript title="cats.controller.ts"
@Post()
@Roles('admin')
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}

```

要访问路由的**角色**（自定义元数据），请再次使用 `Reflector` 辅助类：

```typescript title="roles.guard.ts"
@Injectable()
export class RolesGuard {
  constructor(private reflector: Reflector) {}
}

```

> info **提示** `Reflector` 类是从 `@nestjs/core` 包导入的。

现在，要读取处理器元数据，请使用 `get()` 方法。

```typescript
const roles = this.reflector.get<string[]>('roles', context.getHandler());

```

在这里，您将元数据**键**（在本例中为 `'roles'`）作为第一个参数传递，而不是装饰器引用。其他所有内容与 `Reflector#createDecorator` 示例中的相同。