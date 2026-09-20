<!-- 此文件从 content/custom-decorators.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-13T07:29:53.391Z -->
<!-- 源文件: content/custom-decorators.md -->
<!-- 源哈希: 2c537c027a1f79bfd37aa2cdb8a6497c -->

### 自定义路由装饰器

Nest 是围绕一种称为**装饰器**的语言特性构建的。装饰器在许多常用编程语言中是一个众所周知的概念，但在 JavaScript 世界中，它们仍然相对较新。为了更好地理解装饰器的工作原理，我们建议阅读 [this article](https://medium.com/google-developers/exploring-es7-decorators-76ecb65fb841)。以下是一个简单的定义：

<blockquote class="external">
  ES2016 装饰器是一个返回函数的表达式，可以接收目标、名称和属性描述符作为参数。
  你可以通过在装饰器前加上 <code>@</code> 字符，并将其放在要装饰的内容的最顶部来应用它。
  装饰器可以定义在类、方法或属性上。
</blockquote>

#### 参数装饰器

Nest 提供了一组有用的**参数装饰器**，你可以将它们与 HTTP 路由处理器一起使用。以下是提供的装饰器及其所代表的普通 Express（或 Fastify）对象的列表：

<table>
  <tbody>
    <tr>
      <td><code>@Request(), @Req()</code></td>
      <td><code>req</code></td>
    </tr>
    <tr>
      <td><code>@Response(), @Res()</code></td>
      <td><code>res</code></td>
    </tr>
    <tr>
      <td><code>@Next()</code></td>
      <td><code>next</code></td>
    </tr>
    <tr>
      <td><code>@Session()</code></td>
      <td><code>req.session</code></td>
    </tr>
    <tr>
      <td><code>@Param(param?: string)</code></td>
      <td><code>req.params</code> / <code>req.params[param]</code></td>
    </tr>
    <tr>
      <td><code>@Body(param?: string)</code></td>
      <td><code>req.body</code> / <code>req.body[param]</code></td>
    </tr>
    <tr>
      <td><code>@Query(param?: string)</code></td>
      <td><code>req.query</code> / <code>req.query[param]</code></td>
    </tr>
    <tr>
      <td><code>@Headers(param?: string)</code></td>
      <td><code>req.headers</code> / <code>req.headers[param]</code></td>
    </tr>
    <tr>
      <td><code>@Ip()</code></td>
      <td><code>req.ip</code></td>
    </tr>
    <tr>
      <td><code>@HostParam()</code></td>
      <td><code>req.hosts</code></td>
    </tr>
  </tbody>
</table>

此外，你还可以创建自己的**自定义装饰器**。这有什么用呢？

在 node.js 世界中，将属性附加到**请求**对象上是一种常见做法。然后，你需要在每个路由处理器中手动提取它们，使用如下代码：

```typescript
const user = req.user;

```

为了使你的代码更具可读性和透明性，你可以创建一个 `@User()` 装饰器，并在所有控制器中复用它。

```typescript title="user.decorator.ts"
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const User = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

```

然后，你可以在任何符合需求的地方简单地使用它。

```typescript
@Get()
async findOne(@User() user: UserEntity) {
  console.log(user);
}

```

#### 传递数据

当你的装饰器的行为取决于某些条件时，你可以使用 `data` 参数向装饰器的工厂函数传递参数。一个用例是自定义装饰器，它按键从请求对象中提取属性。例如，假设我们的<a href="techniques/authentication#实现-passport-策略">认证层</a>验证请求并将用户实体附加到请求对象上。经过认证的请求的用户实体可能如下所示：

```json
{
  "id": 101,
  "firstName": "Alan",
  "lastName": "Turing",
  "email": "alan@email.com",
  "roles": ["admin"]
}

```

让我们定义一个装饰器，它以属性名作为键，如果存在则返回关联值（如果不存在，或者 `user` 对象尚未创建，则返回 undefined）。

```typescript title="user.decorator.ts"
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const User = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    return data ? user?.[data] : user;
  },
);

```

以下是你如何在控制器中通过 `@User()` 装饰器访问特定属性的方法：

```typescript
@Get()
async findOne(@User('firstName') firstName: string) {
  console.log(`Hello ${firstName}`);
}

```

你可以使用相同的装饰器搭配不同的键来访问不同的属性。如果 `user` 对象是深层或复杂的，这可以使请求处理器的实现更简单、更易读。

> info **提示** 对于 TypeScript 用户，请注意 `createParamDecorator<T>()` 是一个泛型。这意味着你可以显式地强制执行类型安全，例如 `createParamDecorator<string>((data, ctx) => ...)`。或者，在工厂函数中指定参数类型，例如 `createParamDecorator((data: string, ctx) => ...)`。如果两者都省略，`data` 的类型将是 `any`。

#### 与管道一起使用

Nest 以与内置装饰器（`@Body()`、`@Param()` 和 `@Query()`）相同的方式处理自定义参数装饰器。这意味着管道也会为自定义注解的参数执行（在我们的示例中，即 `user` 参数）。此外，你可以直接将管道应用于自定义装饰器：

```typescript
@Get()
async findOne(
  @User(new ValidationPipe({ validateCustomDecorators: true }))
  user: UserEntity,
) {
  console.log(user);
}

```

> info **提示** 请注意，`validateCustomDecorators` 选项必须设置为 true。`ValidationPipe` 默认不会验证使用自定义装饰器注解的参数。

同样的规则适用于 `StandardSchemaValidationPipe`。如果你的自定义装饰器附加了应通过 Standard Schema 兼容模式进行验证的数据，请在配置管道时启用 `validateCustomDecorators`。

#### 装饰器组合

Nest 提供了一个辅助方法来组合多个装饰器。例如，假设你想将所有与认证相关的装饰器合并为一个装饰器。可以通过以下构造来实现：

```typescript title="auth.decorator.ts"
import { applyDecorators } from '@nestjs/common';

export function Auth(...roles: Role[]) {
  return applyDecorators(
    SetMetadata('roles', roles),
    UseGuards(AuthGuard, RolesGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  );
}

```

然后你可以像下面这样使用这个自定义的 `@Auth()` 装饰器：

```typescript
@Get('users')
@Auth('admin')
findAllUsers() {}

```

这可以通过单个声明来应用所有四个装饰器。

> warning **警告** `@nestjs/swagger` 包中的 `@ApiHideProperty()` 装饰器不可组合，无法与 `applyDecorators` 函数正常工作。