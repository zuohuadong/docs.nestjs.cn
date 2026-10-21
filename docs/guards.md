<!-- 此文件从 content/guards.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T07:27:16.533Z -->
<!-- 源文件: content/guards.md -->
<!-- 源哈希: 792915130203f82878dab27a263a7d16 -->

### 守卫

守卫是一个使用 `@Injectable()` 装饰器标注的类，它实现了 `CanActivate` 接口。

<figure><img class="illustrative-image" src="/assets/Guards_1.png" /></figure>

守卫具有**单一职责**：它们根据运行时存在的条件（例如权限、角色或 ACL）来决定给定的请求是否会被路由处理器处理。这通常被称为**授权**。在传统的 Express 应用程序中，授权（以及它密切相关的**认证**，通常与之协作）通常由 [middleware](/overview/middlewares) 处理。中间件非常适合认证，因为诸如验证令牌以及将属性附加到 `request` 对象等任务并不绑定到特定的路由上下文（及其元数据）。

然而，中间件本质上是上下文盲的：它不知道在调用 `next()` 之后将执行哪个处理器。另一方面，**守卫**可以访问 `ExecutionContext` 实例，因此它们确切地知道接下来将执行什么。与异常过滤器、管道和拦截器一样，守卫让你可以在请求/响应周期中恰到好处的点上插入处理逻辑，并且以声明式的方式做到这一点。这有助于保持代码 DRY。

> info **提示** 守卫在所有中间件**之后**执行，但在任何拦截器或管道**之前**执行。

#### 授权守卫

如前所述，**授权**是守卫的一个常见用例，因为特定路由应仅在调用者（通常是特定的已认证用户）具有足够权限时才可用。我们现在要构建的 `AuthGuard` 假设用户已认证，因此请求头中附加了一个令牌。它提取并验证令牌，并使用提取的信息来确定请求是否可以继续。

```typescript title="auth.guard.ts"
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    return validateRequest(request);
  }
}

```

> info **提示** 有关认证机制的真实示例，请参阅 [authentication](/security/authentication) 章节。有关更复杂的授权示例，请参阅 [authorization](/security/authorization) 章节。

`validateRequest()` 函数内部的逻辑可以根据需要简单或复杂。这个示例的重点是展示守卫如何融入请求/响应周期。

每个守卫都必须实现一个 `canActivate()` 方法。它返回一个布尔值，指示当前请求是否被允许，可以同步或异步（通过 `Promise` 或 `Observable`）返回。Nest 使用返回值来决定接下来发生什么：

- 如果返回 `true`，则处理该请求。
- 如果返回 `false`，则 Nest 拒绝该请求。

<app-banner-enterprise></app-banner-enterprise>

#### 执行上下文

`canActivate()` 方法接受单个参数，即 `ExecutionContext` 实例。`ExecutionContext` 扩展了 `ArgumentsHost`，我们在异常过滤器章节中介绍过它。上面的示例使用了定义在 `ArgumentsHost` 上的相同辅助方法来获取对 `Request` 对象的引用。有关此主题的更多信息，请参阅 [exception filters](/overview/exception-filters#参数主机) 章节的 **Arguments host** 部分。

通过扩展 `ArgumentsHost`，`ExecutionContext` 添加了几个辅助方法，提供有关当前执行过程的额外细节。这些细节帮助你构建更通用的守卫，可跨广泛的控制器、方法和执行上下文工作。请参阅 [execution context](/fundamentals/execution-context) 章节以了解有关 `ExecutionContext` 的更多信息。

#### 基于角色的认证

让我们构建一个更实用的守卫，仅允许具有特定角色的用户访问。我们将从一个基本的守卫模板开始，并在后续章节中基于它进行构建。目前，它允许所有请求继续：

```typescript title="roles.guard.ts"
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    return true;
  }
}

```

#### 绑定守卫

与管道和异常过滤器一样，守卫可以是控制器作用域、方法作用域或全局作用域的。下面，我们使用 `@UseGuards()` 装饰器设置一个控制器作用域的守卫。该装饰器接受单个守卫或以逗号分隔的守卫列表，因此你可以通过一次声明应用一整套守卫。

```typescript
@Controller('cats')
@UseGuards(RolesGuard)
export class CatsController {}

```

> info **提示** `@UseGuards()` 装饰器从 `@nestjs/common` 包中导入。

上面，我们传递了 `RolesGuard` 类（而不是实例），将实例化的责任留给框架，并启用了依赖注入。与管道和异常过滤器一样，你也可以传递一个就地实例：

```typescript
@Controller('cats')
@UseGuards(new RolesGuard())
export class CatsController {}

```

上面的构造将守卫附加到该控制器声明的每个处理器。要仅将守卫应用于单个方法，请在**方法级别**使用 `@UseGuards()` 装饰器。

要设置全局守卫，请使用 Nest 应用程序实例的 `useGlobalGuards()` 方法：

```typescript
const app = await NestFactory.create(AppModule);
app.useGlobalGuards(new RolesGuard());

```

> warning **注意** 在混合应用程序中，`useGlobalGuards()` 默认不会为连接的微服务设置守卫（请参阅 [Hybrid application](/faq/hybrid-application) 以更改此行为）。在标准（非混合）微服务应用程序中，`useGlobalGuards()` 确实会全局挂载守卫。

全局守卫应用于应用程序中的每个控制器和每个路由处理器。然而，在任何模块之外注册的全局守卫（使用 `useGlobalGuards()`，如上面的示例）无法注入依赖，因为注册发生在任何模块的上下文之外。要解决此问题，请使用以下构造直接从任何模块注册守卫：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}

```

> info **提示** 当你使用此方法为守卫执行依赖注入时，无论你在哪个模块中注册它，该守卫都是全局的。我们建议将其注册在定义守卫（上面示例中的 `RolesGuard`）的模块中。此外，`useClass` 并不是注册自定义提供者的唯一方式。请参阅 [Custom providers](/fundamentals/dependency-injection) 以了解更多信息。

> info **提示** 你可以多次注册 `APP_GUARD` 令牌（在相同或不同的模块中）；每个注册的守卫都会按注册顺序为每个请求运行。`APP_GUARD`（与其他 `APP_*` 令牌一样）是一个伪提供者，框架在引导期间会消费它：它无法在之后通过 `app.get()` 检索，也无法在其他地方注入。

#### 为每个处理程序设置角色

我们的 `RolesGuard` 可以工作，但还不够智能：它没有利用守卫最重要的特性——[execution context](/fundamentals/execution-context)。它不了解角色，也不知道每个处理程序允许哪些角色。例如，`CatsController` 可能针对不同的路由有不同的权限方案。有些路由可能仅对管理员用户可用，而另一些则对所有人开放。我们如何以灵活且可复用的方式将角色与路由匹配起来？

这正是**自定义元数据**发挥作用的地方（参见 [Reflection and metadata](/fundamentals/execution-context#reflection-and-metadata)）。Nest 允许你将自定义**元数据**附加到路由处理程序上，既可以通过使用静态 `Reflector.createDecorator()` 方法创建的装饰器，也可以通过内置的 `@SetMetadata()` 装饰器。

例如，让我们使用 `Reflector.createDecorator()` 方法创建一个 `@Roles()` 装饰器，将元数据附加到处理程序上。`Reflector` 由框架开箱即用地提供，并从 `@nestjs/core` 包中导出。

```ts
import { Reflector } from '@nestjs/core';

export const Roles = Reflector.createDecorator<string[]>();

```

`Roles` 装饰器是一个函数，接受一个类型为 `string[]` 的单一参数。

要使用此装饰器，请用它标注处理程序：

```typescript title="cats.controller.ts"
@Post()
@Roles(['admin'])
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}

```

这里我们将 `Roles` 装饰器元数据附加到了 `create()` 方法上，表示只有具有 `admin` 角色的用户才被允许访问此路由。

或者，你也可以使用内置的 `@SetMetadata()` 装饰器，而不使用 `Reflector.createDecorator()` 方法。请参阅 [low-level approach](/fundamentals/execution-context#low-level-approach) 了解更多信息。

#### 整合起来

现在让我们将其与我们的 `RolesGuard` 结合起来。目前，它在所有情况下都返回 `true`，允许每个请求继续执行。我们希望使返回值变为有条件的，基于将**分配给当前用户的角色**与正在处理的路由所需的角色进行比较。要访问路由的角色（自定义元数据），我们再次使用 `Reflector` 类，如下所示：

```typescript title="roles.guard.ts"
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Roles } from './roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.get(Roles, context.getHandler());
    if (!roles) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    return matchRoles(roles, user.roles);
  }
}

```

> info **提示** 在 Node.js 应用程序中，通常的做法是将已授权的用户附加到 `request` 对象上。因此，上面的示例假设 `request.user` 包含用户实例及其角色。在你的应用中，你可能会在自定义的**认证守卫**（或中间件）中进行这种关联。有关此主题的更多信息，请参阅 [authentication](/security/authentication) 章节。

> warning **警告** `matchRoles()` 函数并非由 Nest 提供。其逻辑可以根据你的应用需求简单或复杂；本示例的重点是展示守卫如何融入请求/响应周期。

有关以上下文敏感的方式使用 `Reflector` 的更多详细信息，请参阅**执行上下文**章节的 [Reflection and metadata](/fundamentals/execution-context#reflection-and-metadata) 部分。

当权限不足的用户请求某个端点时，Nest 会自动返回以下响应：

```json
{
  "statusCode": 403,
  "message": "Forbidden resource",
  "error": "Forbidden"
}

```

在幕后，当守卫返回 `false` 时，框架会抛出 `ForbiddenException`。要返回不同的错误响应，请改为抛出你自己的异常。例如：

```typescript
throw new UnauthorizedException();

```

守卫抛出的任何异常都由 [exceptions layer](/overview/exception-filters) 处理（全局异常过滤器以及应用于当前上下文的任何异常过滤器）。

> info **提示** 有关如何实现授权的真实示例，请参阅 [authorization](/security/authorization) 章节。