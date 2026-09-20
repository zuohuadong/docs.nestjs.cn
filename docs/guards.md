<!-- 此文件从 content/guards.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T07:38:34.498Z -->
<!-- 源文件: content/guards.md -->
<!-- 源哈希: 60166d7ee50f9ca4c47cfcb7c9a14746 -->

### 守卫

守卫是一个使用 `@Injectable()` 装饰器注解的类，它实现了 `CanActivate` 接口。

<figure><img class="illustrative-image" src="/assets/Guards_1.png" /></figure>

守卫具有**单一职责**。它们根据运行时存在的某些条件（如权限、角色、ACL 等）决定给定的请求是否由路由处理器处理。这通常被称为**授权**。授权（以及它的近亲**认证**，通常与它协作）在传统的 Express 应用中通常由 [middleware](/overview/middlewares) 处理。中间件是认证的不错选择，因为诸如令牌验证和向 `request` 对象附加属性等操作与特定的路由上下文（及其元数据）没有强关联。

但中间件本质上是对上下文无感知的。它不知道调用 `next()` 函数后哪个处理器将被执行。另一方面，**守卫**可以访问 `ExecutionContext` 实例，因此确切地知道接下来将要执行什么。它们的设计类似于异常过滤器、管道和拦截器，允许你在请求/响应周期中恰当地插入处理逻辑，并以声明式的方式实现。这有助于保持代码 DRY 和声明式。

> info **提示** 守卫在**所有中间件之后**执行，但在**任何拦截器或管道之前**执行。

#### 授权守卫

如前所述，**授权**是守卫的一个很好的用例，因为特定路由只有在调用者（通常是特定的已认证用户）具有足够权限时才应可用。我们将构建的 `AuthGuard` 假设有一个已认证的用户（因此，请求头中附加了令牌）。它将提取并验证令牌，并使用提取的信息来确定请求是否可以继续。

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

> info **提示** 如果您正在寻找在应用程序中实现认证机制的真实示例，请访问 [this chapter](/security/authentication)。同样，对于更复杂的授权示例，请查看 [this page](/security/authorization)。

`validateRequest()` 函数内部的逻辑可以根据需要简单或复杂。此示例的主要目的是展示守卫如何融入请求/响应周期。

每个守卫都必须实现一个 `canActivate()` 函数。该函数应返回一个布尔值，指示当前请求是否被允许。它可以同步或异步（通过 `Promise` 或 `Observable`）返回响应。Nest 使用返回值来控制下一步操作：

- 如果返回 `true`，请求将被处理。
- 如果返回 `false`，Nest 将拒绝请求。

<app-banner-enterprise></app-banner-enterprise>

#### 执行上下文

`canActivate()` 函数接受一个参数，即 `ExecutionContext` 实例。`ExecutionContext` 继承自 `ArgumentsHost`。我们之前在异常过滤器章节中见过 `ArgumentsHost`。在上面的示例中，我们使用了与之前相同的定义在 `ArgumentsHost` 上的辅助方法，以获取对 `Request` 对象的引用。您可以参考 [exception filters](/overview/exception-filters#参数主机) 章节中的 **参数宿主** 部分以了解更多信息。

通过扩展 `ArgumentsHost`，`ExecutionContext` 还添加了几个新的辅助方法，提供有关当前执行过程的额外细节。这些细节有助于构建更通用的守卫，使其能够跨广泛的控制器、方法和执行上下文工作。了解更多关于 `ExecutionContext` [here](/fundamentals/execution-context) 的信息。

#### 基于角色的认证

让我们构建一个更具功能性的守卫，仅允许具有特定角色的用户访问。我们将从基本的守卫模板开始，并在接下来的部分中逐步构建。目前，它允许所有请求继续：

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

与管道和异常过滤器一样，守卫可以是**控制器作用域**、方法作用域或全局作用域。下面，我们使用 `@UseGuards()` 装饰器设置一个控制器作用域的守卫。此装饰器可以接受单个参数或逗号分隔的参数列表。这使您可以轻松地通过一个声明应用适当的守卫集合。

```typescript
@Controller('cats')
@UseGuards(RolesGuard)
export class CatsController {}

```

> info **提示** `@UseGuards()` 装饰器从 `@nestjs/common` 包中导入。

上面，我们传递了 `RolesGuard` 类（而不是实例），将实例化的责任留给框架，并启用依赖注入。与管道和异常过滤器一样，我们也可以传递一个就地实例：

```typescript
@Controller('cats')
@UseGuards(new RolesGuard())
export class CatsController {}

```

上面的构造将守卫附加到此控制器声明的每个处理器。如果我们希望守卫仅应用于单个方法，我们在**方法级别**应用 `@UseGuards()` 装饰器。

为了设置全局守卫，请使用 Nest 应用实例的 `useGlobalGuards()` 方法：

```typescript
const app = await NestFactory.create(AppModule);
app.useGlobalGuards(new RolesGuard());

```

> warning **注意** 在混合应用程序的情况下，`useGlobalGuards()` 方法默认不会为网关和微服务设置守卫（有关如何更改此行为的信息，请参阅 [Hybrid application](/faq/hybrid-application)）。对于“标准”（非混合）微服务应用，`useGlobalGuards()` 确实会全局挂载守卫。

全局守卫用于整个应用程序，每个控制器和每个路由处理器。在依赖注入方面，从任何模块外部注册的全局守卫（如上面的 `useGlobalGuards()` 示例）无法注入依赖，因为这是在模块上下文之外完成的。为了解决这个问题，您可以使用以下构造从任何模块直接设置守卫：

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

> info **提示** 使用此方法为守卫执行依赖注入时，请注意无论此构造在哪个模块中使用，守卫实际上是全局的。应该在哪里执行？选择定义守卫（上面的 `RolesGuard`）的模块。此外，`useClass` 并不是处理自定义提供者注册的唯一方式。了解更多 [here](/fundamentals/dependency-injection)。

> info **提示** 您可以多次注册 `APP_GUARD` 令牌（在相同或不同的模块中）- 每个注册的守卫都会按注册顺序为每个请求运行。还要注意，`APP_GUARD`（与其他 `APP_*` 令牌一样）是框架在引导期间消费的伪提供者：以后无法使用 `app.get()` 检索或注入到其他地方。

#### 为每个处理器设置角色

我们的 `RolesGuard` 已经可以工作了，但还不够智能。我们还没有利用最重要的守卫特性——[execution context](/fundamentals/execution-context)。它还不知道角色，也不知道每个处理器允许哪些角色。例如，`CatsController` 可能对不同路由有不同的权限方案。有些可能只对管理员用户开放，而其他可能对所有人开放。我们如何以灵活且可重用的方式将角色与路由匹配？

这就是**自定义元数据**发挥作用的地方（了解更多 [here](/fundamentals/execution-context#reflection-and-metadata)）。Nest 提供了通过 `Reflector.createDecorator` 静态方法创建的装饰器或内置的 `@SetMetadata()` 装饰器将自定义**元数据**附加到路由处理器的能力。

例如，让我们使用 `Reflector.createDecorator` 方法创建一个 `@Roles()` 装饰器，将元数据附加到处理器上。`Reflector` 由框架开箱即用提供，并从 `@nestjs/core` 包中导出。

```ts
import { Reflector } from '@nestjs/core';

export const Roles = Reflector.createDecorator<string[]>();

```

这里的 `Roles` 装饰器是一个函数，它接受一个类型为 `string[]` 的参数。

现在，要使用这个装饰器，我们只需用它来注解处理器：

```typescript title="cats.controller.ts"
@Post()
@Roles(['admin'])
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}

```

这里我们将 `Roles` 装饰器元数据附加到了 `create()` 方法上，表明只有具有 `admin` 角色的用户才应被允许访问此路由。

或者，除了使用 `Reflector.createDecorator` 方法，我们也可以使用内置的 `@SetMetadata()` 装饰器。了解更多关于 [here](/fundamentals/execution-context#low-level-approach) 的信息。

#### 整合在一起

现在让我们回到并把它与我们的 `RolesGuard` 结合起来。目前，它在所有情况下都简单地返回 `true`，允许每个请求继续。我们希望根据**分配给当前用户的角色**与当前处理路由所需的实际角色进行比较，使返回值有条件。为了访问路由的角色（自定义元数据），我们将再次使用 `Reflector` 辅助类，如下所示：

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

> info **提示** 在 node.js 世界中，通常将授权用户附加到 `request` 对象上。因此，在上面的示例代码中，我们假设 `request.user` 包含用户实例和允许的角色。在您的应用中，您可能会在自定义**认证守卫**（或中间件）中建立这种关联。查看 [this chapter](/security/authentication) 了解更多关于此主题的信息。

> warning **警告** `matchRoles()` 函数内部的逻辑可以根据需要简单或复杂。本示例的主要目的是展示守卫如何融入请求/响应周期。

有关以上下文敏感方式利用 `Reflector` 的更多详细信息，请参阅**执行上下文**章节中的 <a href="/fundamentals/execution-context#reflection-and-metadata">反射和元数据</a>部分。

当权限不足的用户请求端点时，Nest 会自动返回以下响应：

```typescript
{
  "statusCode": 403,
  "message": "Forbidden resource",
  "error": "Forbidden"
}

```

请注意，在幕后，当守卫返回 `false` 时，框架会抛出 `ForbiddenException`。如果您想返回不同的错误响应，您应该抛出自己的特定异常。例如：

```typescript
throw new UnauthorizedException();

```

守卫抛出的任何异常都将由 [exceptions layer](/overview/exception-filters)（全局异常过滤器和应用于当前上下文的任何异常过滤器）处理。

> info **提示** 如果您正在寻找如何实现授权的实际示例，请查看 [this chapter](/security/authorization)。