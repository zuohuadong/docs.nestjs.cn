<!-- 此文件从 content/fundamentals/execution-context.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:29:47.649Z -->
<!-- 源文件: content/fundamentals/execution-context.md -->
<!-- 源哈希: ad16061d1af21bbf047c31c08b918efd -->

### 执行上下文

Nest 提供了几个工具类，帮助您轻松编写可在多种应用上下文（例如，基于 Nest HTTP 服务器、微服务和 WebSockets 应用上下文）中运行的应用程序。这些工具提供有关当前执行上下文的信息，可用于构建通用的 [guards](/overview/guards)、[filters](/overview/exception-filters) 和 [interceptors](/overview/interceptors)，它们能够跨广泛的控制器、方法和执行上下文工作。

本章我们将介绍两个这样的类：`ArgumentsHost` 和 `ExecutionContext`。

#### ArgumentsHost 类

`ArgumentsHost` 类提供了检索传递给处理程序的参数的方法。它允许您选择合适的上下文（例如，HTTP、RPC（微服务）或 WebSockets）来检索参数。框架在您可能希望访问它的地方提供 `ArgumentsHost` 的实例，通常作为 `host` 参数引用。例如，[exception filter](/overview/exception-filters#参数主机) 的 `catch()` 方法会以 `ArgumentsHost` 实例作为参数被调用。

`ArgumentsHost` 只是处理程序参数的抽象。例如，对于 HTTP 服务器应用程序（当使用 `@nestjs/platform-express` 时），`host` 对象封装了 Express 的 `[request, response, next]` 数组，其中 `request` 是请求对象，`response` 是响应对象，`next` 是控制应用程序请求-响应周期的函数。另一方面，对于 [GraphQL](/graphql/quick-start) 应用程序，`host` 对象包含 `[root, args, context, info]` 数组。

#### 当前应用上下文

在构建旨在跨多个应用上下文运行的通用 [guards](/overview/guards)、[filters](/overview/exception-filters) 和 [interceptors](/overview/interceptors) 时，我们需要一种方法来确定我们的方法当前运行在哪种类型的应用程序中。使用 `ArgumentsHost` 的 `getType()` 方法即可实现：

```typescript
if (host.getType() === 'http') {
  // do something that is only important in the context of regular HTTP requests (REST)
} else if (host.getType() === 'rpc') {
  // do something that is only important in the context of Microservice requests
} else if (host.getType<GqlContextType>() === 'graphql') {
  // do something that is only important in the context of GraphQL requests
}

```

> info **提示** `GqlContextType` 从 `@nestjs/graphql` 包中导入。

有了应用程序类型，我们就可以编写更通用的组件，如下所示。

#### 宿主处理程序参数

要检索传递给处理程序的参数数组，一种方法是使用宿主对象的 `getArgs()` 方法。

```typescript
const [req, res, next] = host.getArgs();

```

您可以使用 `getArgByIndex()` 方法按索引提取特定参数：

```typescript
const request = host.getArgByIndex(0);
const response = host.getArgByIndex(1);

```

在这些示例中，我们按索引检索了请求和响应对象，但这通常不推荐，因为它将应用程序耦合到特定的执行上下文。相反，您可以通过使用 `host` 对象的实用方法之一来切换到适合您应用程序的上下文，从而使代码更健壮、更可重用。上下文切换的实用方法如下所示。

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

让我们使用 `switchToHttp()` 方法重写前面的示例。`host.switchToHttp()` 辅助调用返回一个适合 HTTP 应用上下文的 `HttpArgumentsHost` 对象。`HttpArgumentsHost` 对象有两个有用的方法，我们可以用来提取所需的对象。在这种情况下，我们还使用 Express 类型断言来返回原生 Express 类型化的对象：

```typescript
const ctx = host.switchToHttp();
const request = ctx.getRequest<Request>();
const response = ctx.getResponse<Response>();

```

类似地，`WsArgumentsHost` 和 `RpcArgumentsHost` 具有在微服务和 WebSockets 上下文中返回适当对象的方法。以下是 `WsArgumentsHost` 的方法：

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

`ExecutionContext` 扩展了 `ArgumentsHost`，提供了有关当前执行过程的更多细节。与 `ArgumentsHost` 一样，Nest 在您可能需要它的地方提供 `ExecutionContext` 的实例，例如在 [guard](/overview/guards#执行上下文) 的 `canActivate()` 方法和 [interceptor](/overview/interceptors#执行上下文) 的 `intercept()` 方法中。它提供了以下方法：

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

`getHandler()` 方法返回即将被调用的处理程序的引用。`getClass()` 方法返回此特定处理程序所属的 `Controller` 类的类型。例如，在 HTTP 上下文中，如果当前处理的请求是 `POST` 请求，绑定到 `CatsController` 上的 `create()` 方法，则 `getHandler()` 返回对 `create()` 方法的引用，`getClass()` 返回 `CatsController` **类**（不是实例）。

```typescript
const methodKey = ctx.getHandler().name; // "create"
const className = ctx.getClass().name; // "CatsController"

```

能够访问当前类和处理程序方法的引用提供了极大的灵活性。最重要的是，它使我们有机会从守卫或拦截器内部访问通过 `Reflector#createDecorator` 创建的装饰器或内置的 `@SetMetadata()` 装饰器设置的元数据。我们将在下面介绍这个用例。

<app-banner-enterprise></app-banner-enterprise>

#### 反射与元数据

Nest 提供了通过 `Reflector#createDecorator` 方法创建的装饰器和内置的 `@SetMetadata()` 装饰器将**自定义元数据**附加到路由处理程序的能力。在本节中，让我们比较这两种方法，并了解如何从守卫或拦截器内部访问元数据。

要使用 `Reflector#createDecorator` 创建强类型装饰器，我们需要指定类型参数。例如，让我们创建一个 `Roles` 装饰器，它接受一个字符串数组作为参数。

```ts
import { Reflector } from '@nestjs/core';

export const Roles = Reflector.createDecorator<string[]>();

```

这里的 `Roles` 装饰器是一个函数，它接受一个类型为 `string[]` 的参数。

现在，要使用这个装饰器，我们只需用它来注解处理程序：

```typescript title="cats.controller.ts"
@Post()
@Roles(['admin'])
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}

```

在这里，我们将 `Roles` 装饰器元数据附加到 `create()` 方法上，表明只有具有 `admin` 角色的用户才应被允许访问此路由。

要访问路由的角色（自定义元数据），我们将再次使用 `Reflector` 辅助类。`Reflector` 可以以正常方式注入到类中：

```typescript title="roles.guard.ts"
@Injectable()
export class RolesGuard {
  constructor(private reflector: Reflector) {}
}

```

> info **提示** `Reflector` 类从 `@nestjs/core` 包中导入。

现在，要读取处理程序元数据，请使用 `get()` 方法：

```typescript
const roles = this.reflector.get(Roles, context.getHandler());

```

`Reflector#get` 方法允许我们通过传递两个参数轻松访问元数据：装饰器引用和**上下文**（装饰器目标）以从中检索元数据。在此示例中，指定的**装饰器**是 `Roles`（请参阅上面的 `roles.decorator.ts` 文件）。上下文由对 `context.getHandler()` 的调用提供，该调用会提取当前处理的路由处理程序的元数据。请记住，`getHandler()` 为我们提供了路由处理程序函数的**引用**。

或者，我们可以在控制器级别应用元数据来组织我们的控制器，将其应用于控制器类中的所有路由。

```typescript title="cats.controller.ts"
@Roles(['admin'])
@Controller('cats')
export class CatsController {}

```

在这种情况下，要提取控制器元数据，我们传递 `context.getClass()` 作为第二个参数（以提供控制器类作为元数据提取的上下文），而不是 `context.getHandler()`：

```typescript title="roles.guard.ts"
const roles = this.reflector.get(Roles, context.getClass());

```

鉴于可以在多个级别提供元数据，您可能需要从多个上下文中提取和合并元数据。`Reflector` 类提供了两个实用方法来帮助实现这一点。这些方法同时提取**控制器**和方法元数据，并以不同的方式组合它们。

考虑以下场景，您已在两个级别提供了 `Roles` 元数据。

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

如果您的意图是将 `'user'` 指定为默认角色，并针对某些方法有选择地覆盖它，您可能会使用 `getAllAndOverride()` 方法。

```typescript
const roles = this.reflector.getAllAndOverride(Roles, [context.getHandler(), context.getClass()]);

```

带有此代码的守卫，在上述元数据的 `create()` 方法上下文中运行，将导致 `roles` 包含 `['admin']`。

要获取两者的元数据并合并它（此方法合并数组和对象），请使用 `getAllAndMerge()` 方法：

```typescript
const roles = this.reflector.getAllAndMerge(Roles, [context.getHandler(), context.getClass()]);

```

这将导致 `roles` 包含 `['user', 'admin']`。

对于这两种合并方法，您将元数据键作为第一个参数传递，将元数据目标上下文数组（即对 `getHandler()` 和/或 `getClass()` 方法的调用）作为第二个参数传递。

#### 底层方法

如前所述，除了使用 `Reflector#createDecorator` 之外，您还可以使用内置的 `@SetMetadata()` 装饰器将元数据附加到处理程序。

```typescript title="cats.controller.ts"
@Post()
@SetMetadata('roles', ['admin'])
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}

```

> info **提示** `@SetMetadata()` 装饰器从 `@nestjs/common` 包中导入。

通过上述构造，我们将 `roles` 元数据（`roles` 是元数据键，`['admin']` 是关联值）附加到 `create()` 方法。虽然这可行，但在路由中直接使用 `@SetMetadata()` 并不是好的做法。相反，您可以创建自己的装饰器，如下所示：

```typescript title="roles.decorator.ts"
import { SetMetadata } from '@nestjs/common';

export const Roles = (...roles: string[]) => SetMetadata('roles', roles);

```

这种方法更简洁、更易读，并且有些类似于 `Reflector#createDecorator` 方法。区别在于使用 `@SetMetadata` 您可以更好地控制元数据键和值，还可以创建接受多个参数的装饰器。

现在我们有了自定义的 `@Roles()` 装饰器，我们可以使用它来装饰 `create()` 方法。

```typescript title="cats.controller.ts"
@Post()
@Roles('admin')
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}

```

要访问路由的角色（自定义元数据），我们将再次使用 `Reflector` 辅助类：

```typescript title="roles.guard.ts"
@Injectable()
export class RolesGuard {
  constructor(private reflector: Reflector) {}
}

```

> info **提示** `Reflector` 类从 `@nestjs/core` 包中导入。

现在，要读取处理程序元数据，请使用 `get()` 方法。

```typescript
const roles = this.reflector.get<string[]>('roles', context.getHandler());

```

这里我们不传递装饰器引用，而是将元数据**键**作为第一个参数传递（在我们的例子中是 `'roles'`）。其他所有内容与 `Reflector#createDecorator` 示例保持一致。