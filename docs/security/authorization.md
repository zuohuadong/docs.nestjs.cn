<!-- 此文件从 content/security/authorization.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T07:58:58.492Z -->
<!-- 源文件: content/security/authorization.md -->
<!-- 源哈希: 119d3c2b9be988ec9a3b3dd34abd7167 -->

### 授权

**授权**是指确定用户能够做什么的过程。例如，管理员用户可以创建、编辑和删除帖子。非管理员用户仅被授权阅读帖子。

授权与认证是正交且独立的。然而，授权需要认证机制。

处理授权有许多不同的方法和策略。任何项目所采用的方法取决于其特定的应用需求。本章介绍了几种可以适应各种不同需求的授权方法。

#### 基本 RBAC 实现

基于角色的访问控制（**RBAC**）是一种围绕角色和权限定义的政策中立访问控制机制。在本节中，我们将演示如何使用 Nest [guards](/overview/guards) 实现一个非常基本的 RBAC 机制。

首先，让我们创建一个表示系统中角色的 `Role` 枚举：

```typescript title="role.enum.ts"
export enum Role {
  User = 'user',
  Admin = 'admin',
}

```

> info **提示** 在更复杂的系统中，您可以将角色存储在数据库中，或从外部认证提供者获取它们。

有了这个，我们可以创建一个 `@Roles()` 装饰器。此装饰器允许您指定访问特定资源所需的角色。

```typescript title="roles.decorator.ts"
import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum.js';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

```

现在我们有了自定义的 `@Roles()` 装饰器，我们可以使用它来装饰任何路由处理器。

```typescript title="cats.controller.ts"
@Post()
@Roles(Role.Admin)
create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}

```

最后，我们创建一个 `RolesGuard` 类，它将比较分配给当前用户的角色与当前正在处理的路由所需的实际角色。为了访问路由的角色（自定义元数据），我们将使用 `Reflector` 辅助类，该类由框架开箱即用地提供，并从 `@nestjs/core` 包中导出。

```typescript title="roles.guard.ts"
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.some((role) => user.roles?.includes(role));
  }
}

```

> info **提示** 有关以上下文敏感方式利用 `Reflector` 的更多详细信息，请参阅执行上下文章节的 [Reflection and metadata](/fundamentals/execution-context#reflection-and-metadata) 部分。

> warning **注意** 此示例之所以命名为“**基本**”，是因为我们仅在路由处理器级别检查角色的存在。在真实世界的应用中，您可能有涉及多个操作的端点/处理器，其中每个操作都需要一组特定的权限。在这种情况下，您必须在业务逻辑中的某个位置提供检查角色的机制，这使得维护变得更加困难，因为没有集中的地方将权限与特定操作关联起来。

在此示例中，我们假设 `request.user` 包含用户实例和允许的角色（在 `roles` 属性下）。在您的应用中，您可能会在自定义的**认证守卫**中建立该关联 - 有关更多详细信息，请参阅 [authentication](/security/authentication) 章节。

为确保此示例正常工作，您的 `User` 类必须如下所示：

```typescript
class User {
  // ...other properties
  roles: Role[];
}

```

最后，确保注册 `RolesGuard`，例如在控制器级别或全局注册：

```typescript
providers: [
  {
    provide: APP_GUARD,
    useClass: RolesGuard,
  },
],

```

当权限不足的用户请求端点时，Nest 会自动返回以下响应：

```typescript
{
  "statusCode": 403,
  "message": "Forbidden resource",
  "error": "Forbidden"
}

```

> info **提示** 如果您想返回不同的错误响应，您应该抛出自己的特定异常，而不是返回布尔值。

<app-banner-courses-auth></app-banner-courses-auth>

#### 基于声明的授权

当创建身份时，可能会分配一个或多个由可信方颁发的声明。声明是一个名称-值对，表示主体可以做什么，而不是主体是什么。

要在 Nest 中实现基于声明的授权，您可以按照我们在 [RBAC](/security/authorization#基本-rbac-实现) 部分中展示的相同步骤进行操作，但有一个显著区别：您应该比较**权限**，而不是检查特定角色。每个用户都会被分配一组权限。同样，每个资源/端点都会定义访问它们所需的权限（例如，通过专用的 `@RequirePermissions()` 装饰器）。

```typescript title="cats.controller.ts"
@Post()
@RequirePermissions(Permission.CREATE_CAT)
create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}

```

> info **提示** 在上面的示例中，`Permission`（类似于我们在 RBAC 部分中展示的 `Role`）是一个 TypeScript 枚举，包含系统中所有可用的权限。

#### 集成 CASL

[CASL](https://casl.js.org/) 是一个同构授权库，用于限制给定客户端允许访问的资源。它旨在可增量采用，并且可以轻松地在简单的基于声明和功能齐全的基于主体和属性的授权之间扩展。

首先，安装 `@casl/ability` 包：

```bash
$ npm i @casl/ability

```

> info **提示** 在此示例中，我们选择了 CASL，但您可以根据自己的偏好和项目需求使用任何其他库，例如 `accesscontrol` 或 `acl`。

安装完成后，为了说明 CASL 的机制，我们将定义两个实体类：`User` 和 `Article`。

```typescript
class User {
  id: number;
  isAdmin: boolean;
}

```

`User` 类包含两个属性：`id`（唯一用户标识符）和 `isAdmin`（指示用户是否具有管理员权限）。

```typescript
class Article {
  id: number;
  isPublished: boolean;
  authorId: number;
}

```

`Article` 类有三个属性，分别是 `id`、`isPublished` 和 `authorId`。`id` 是唯一的文章标识符，`isPublished` 指示文章是否已发布，`authorId` 是撰写文章的用户 ID。

现在让我们回顾并完善此示例的需求：

- 管理员可以管理（创建/读取/更新/删除）所有实体
- 用户对所有内容具有只读访问权限
- 用户可以更新自己的文章（`article.authorId === userId`）
- 已发布的文章不能被删除（`article.isPublished === true`）

考虑到这一点，我们可以开始创建一个 `Action` 枚举，表示用户可以对实体执行的所有可能操作：

```typescript
export enum Action {
  Manage = 'manage',
  Create = 'create',
  Read = 'read',
  Update = 'update',
  Delete = 'delete',
}

```

> warning **注意** `manage` 是 CASL 中的一个特殊关键字，表示“任何操作”。

为了封装 CASL 库，现在让我们生成 `CaslModule` 和 `CaslAbilityFactory`。

```bash
$ nest g module casl
$ nest g class casl/casl-ability.factory

```

有了这些，我们可以在 `CaslAbilityFactory` 上定义 `createForUser()` 方法。该方法将为给定用户创建 `Ability` 对象：

```typescript
type Subjects = InferSubjects<typeof Article | typeof User> | 'all';

export type AppAbility = MongoAbility<[Action, Subjects]>;

@Injectable()
export class CaslAbilityFactory {
  createForUser(user: User) {
    const { can, cannot, build } = new AbilityBuilder(createMongoAbility);

    if (user.isAdmin) {
      can(Action.Manage, 'all'); // read-write access to everything
    } else {
      can(Action.Read, 'all'); // read-only access to everything
    }

    can(Action.Update, Article, { authorId: user.id });
    cannot(Action.Delete, Article, { isPublished: true });

    return build({
      // Read https://casl.js.org/v6/en/guide/subject-type-detection#use-classes-as-subject-types for details
      detectSubjectType: (item) =>
        item.constructor as ExtractSubjectType<Subjects>,
    });
  }
}

```

> warning **注意** `all` 是 CASL 中的一个特殊关键字，表示“任何主体”。

> info **提示** 自 CASL v6 起，`MongoAbility` 作为默认的能力类，取代了旧的 `Ability`，以更好地支持使用类似 MongoDB 的语法进行基于条件的权限控制。尽管名称如此，它并不依赖于 MongoDB——它通过将对象与以类似 Mongo 语法编写的条件进行比较，适用于任何类型的数据。

> info **提示** `MongoAbility`、`AbilityBuilder`、`AbilityClass` 和 `ExtractSubjectType` 类从 `@casl/ability` 包中导出。

> info **提示** `detectSubjectType` 选项让 CASL 理解如何从对象中获取主体类型。更多信息，请阅读 [CASL documentation](https://casl.js.org/v6/en/guide/subject-type-detection#use-classes-as-subject-types)。

在上面的示例中，我们使用 `AbilityBuilder` 类创建了 `MongoAbility` 实例。您可能已经猜到，`can` 和 `cannot` 接受相同的参数但含义不同，`can` 允许您对指定主体执行操作，而 `cannot` 则禁止该操作。两者最多可接受 4 个参数。要了解有关这些函数的更多信息，请访问官方 [CASL documentation](https://casl.js.org/v6/en/guide/intro)。

最后，确保将 `CaslAbilityFactory` 添加到 `CaslModule` 模块定义中的 `providers` 和 `exports` 数组中：

```typescript
import { Module } from '@nestjs/common';
import { CaslAbilityFactory } from './casl-ability.factory.js';

@Module({
  providers: [CaslAbilityFactory],
  exports: [CaslAbilityFactory],
})
export class CaslModule {}

```

有了这些，只要在宿主上下文中导入了 `CaslModule`，我们就可以使用标准的构造函数注入将 `CaslAbilityFactory` 注入到任何类中：

```typescript
constructor(private caslAbilityFactory: CaslAbilityFactory) {}

```

然后在类中按如下方式使用它。

```typescript
const ability = this.caslAbilityFactory.createForUser(user);
if (ability.can(Action.Read, 'all')) {
  // "user" has read access to everything
}

```

> info **提示** 在官方 [CASL documentation](https://casl.js.org/v6/en/guide/intro) 中了解更多关于 `MongoAbility` 类的信息。

例如，假设我们有一个不是管理员的用户。在这种情况下，用户应该能够阅读文章，但应禁止创建新文章或删除现有文章。

```typescript
const user = new User();
user.isAdmin = false;

const ability = this.caslAbilityFactory.createForUser(user);
ability.can(Action.Read, Article); // true
ability.can(Action.Delete, Article); // false
ability.can(Action.Create, Article); // false

```

> info **提示** 尽管 `MongoAbility` 和 `AbilityBuilder` 类都提供了 `can` 和 `cannot` 方法，但它们的用途不同，接受的参数也略有不同。

此外，正如我们在需求中指定的，用户应该能够更新自己的文章：

```typescript
const user = new User();
user.id = 1;

const article = new Article();
article.authorId = user.id;

const ability = this.caslAbilityFactory.createForUser(user);
ability.can(Action.Update, article); // true

article.authorId = 2;
ability.can(Action.Update, article); // false

```

如您所见，`MongoAbility` 实例允许我们以相当可读的方式检查权限。同样，`AbilityBuilder` 允许我们以类似的方式定义权限（并指定各种条件）。要查找更多示例，请访问官方文档。

#### 高级：实现一个 `PoliciesGuard`

在本节中，我们将演示如何构建一个更复杂的守卫，该守卫检查用户是否满足特定**授权策略**，这些策略可以在方法级别配置（您也可以扩展它以支持类级别配置的策略）。在此示例中，我们仅出于说明目的使用 CASL 包，但并非必须使用该库。此外，我们将使用上一节中创建的 `CaslAbilityFactory` 提供者。

首先，让我们完善需求。目标是提供一种机制，允许您为每个路由处理器指定策略检查。我们将同时支持对象和函数（用于更简单的检查以及那些更喜欢函数式风格代码的人）。

让我们从定义策略处理器的接口开始：

```typescript
import { AppAbility } from '../casl/casl-ability.factory.js';

interface IPolicyHandler {
  handle(ability: AppAbility): boolean;
}

type PolicyHandlerCallback = (ability: AppAbility) => boolean;

export type PolicyHandler = IPolicyHandler | PolicyHandlerCallback;

```

如上所述，我们提供了两种定义策略处理器的方式：对象（实现 `IPolicyHandler` 接口的类的实例）和函数（满足 `PolicyHandlerCallback` 类型）。

有了这些，我们可以创建一个 `@CheckPolicies()` 装饰器。该装饰器允许您指定访问特定资源必须满足哪些策略。

```typescript
export const CHECK_POLICIES_KEY = 'check_policy';
export const CheckPolicies = (...handlers: PolicyHandler[]) =>
  SetMetadata(CHECK_POLICIES_KEY, handlers);

```

现在让我们创建一个 `PoliciesGuard`，它将提取并执行绑定到路由处理器的所有策略处理器。

```typescript
@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private caslAbilityFactory: CaslAbilityFactory,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policyHandlers =
      this.reflector.get<PolicyHandler[]>(
        CHECK_POLICIES_KEY,
        context.getHandler(),
      ) || [];

    const { user } = context.switchToHttp().getRequest();
    const ability = this.caslAbilityFactory.createForUser(user);

    return policyHandlers.every((handler) =>
      this.execPolicyHandler(handler, ability),
    );
  }

  private execPolicyHandler(handler: PolicyHandler, ability: AppAbility) {
    if (typeof handler === 'function') {
      return handler(ability);
    }
    return handler.handle(ability);
  }
}

```

> info **提示** 在此示例中，我们假设 `request.user` 包含用户实例。在您的应用中，您可能会在自定义**认证守卫**中建立该关联——更多详情请参阅 [authentication](/security/authentication) 章节。

让我们分解这个示例。`policyHandlers` 是通过 `@CheckPolicies()` 装饰器分配给方法的处理器数组。接下来，我们使用 `CaslAbilityFactory#create` 方法构造 `Ability` 对象，从而允许我们验证用户是否有足够的权限执行特定操作。我们将此对象传递给策略处理器，该处理器可以是函数，也可以是实现 `IPolicyHandler` 的类的实例，该接口暴露了返回布尔值的 `handle()` 方法。最后，我们使用 `Array#every` 方法确保每个处理器都返回了 `true` 值。

最后，要测试此守卫，请将其绑定到任何路由处理器，并注册一个内联策略处理器（函数式方法），如下所示：

```typescript
@Get()
@UseGuards(PoliciesGuard)
@CheckPolicies((ability: AppAbility) => ability.can(Action.Read, Article))
findAll() {
  return this.articlesService.findAll();
}

```

或者，我们可以定义一个实现 `IPolicyHandler` 接口的类：

```typescript
export class ReadArticlePolicyHandler implements IPolicyHandler {
  handle(ability: AppAbility) {
    return ability.can(Action.Read, Article);
  }
}

```

并按如下方式使用：

```typescript
@Get()
@UseGuards(PoliciesGuard)
@CheckPolicies(new ReadArticlePolicyHandler())
findAll() {
  return this.articlesService.findAll();
}

```

> warning **注意** 由于我们必须使用 `new` 关键字就地实例化策略处理器，`ReadArticlePolicyHandler` 类无法使用依赖注入。这可以通过 `ModuleRef#get` 方法解决（更多详情请参阅 [here](/fundamentals/module-reference)）。基本上，您必须支持传递 `Type<IPolicyHandler>`，而不是通过 `@CheckPolicies()` 装饰器注册函数和实例。然后，在您的守卫内部，您可以使用类型引用检索实例：`moduleRef.get(YOUR_HANDLER_TYPE)`，甚至可以使用 `ModuleRef#create` 方法动态实例化它。