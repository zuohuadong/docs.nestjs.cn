<!-- 此文件从 content/custom-decorators.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T07:31:55.802Z -->
<!-- 源文件: content/custom-decorators.md -->
<!-- 源哈希: 03863fb8f5351c6c6f8bf5c25174a728 -->

### 自定义路由装饰器

Nest 是围绕一种称为**装饰器**的语言特性构建的。装饰器在许多编程语言中已经非常成熟，但在 JavaScript 中仍然相对较新。要深入了解装饰器的工作原理，请参阅 [this article](https://medium.com/google-developers/exploring-es7-decorators-76ecb65fb841)。以下是一个简单的定义：

<blockquote class="external">
  ES2016 装饰器是一个返回函数的表达式，它可以接受 target、name 和 property descriptor 作为参数。
  你通过在装饰器前加上 <code>@</code> 字符，并将其放在你要装饰的内容的最顶部来应用它。
  装饰器可以为类、方法或属性定义。
</blockquote>

#### 参数装饰器

Nest 提供了一组**参数装饰器**，你可以在 HTTP 路由处理程序中使用它们。下表列出了它们以及它们所代表的普通 Express（或 Fastify）对象：

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
      <td><code>@HostParam(param?: string)</code></td>
      <td><code>req.hosts</code> / <code>req.hosts[param]</code></td>
    </tr>
  </tbody>
</table>

你也可以创建自己的**自定义装饰器**。为了了解这为什么有用，考虑 Node.js 应用程序中一个常见的模式：属性被附加到**请求**对象上，然后在每个路由处理程序中手动提取，代码如下所示：

```typescript
const user = req.user;

```

为了让你的代码更具可读性和透明性，你可以创建一个 `@User()` 装饰器，并在所有控制器中复用它：

```typescript title="user.decorator.ts"
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const User = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

```

然后你可以在任何需要的地方使用它：

```typescript
@Get()
async findOne(@User() user: UserEntity) {
  console.log(user);
}

```

#### 传递数据

当你的装饰器的行为取决于某个条件时，使用 `data` 参数向装饰器的工厂函数传递参数。一个用例是通过键从请求对象中提取属性的自定义装饰器。例如，假设你的 [authentication layer](/security/authentication#read-the-current-user) 验证请求并将用户实体附加到请求对象上。经过认证的请求的用户实体可能如下所示：

```json
{
  "id": 101,
  "firstName": "Alan",
  "lastName": "Turing",
  "email": "alan@email.com",
  "roles": ["admin"]
}

```

让我们定义一个装饰器，它接受一个属性名作为键，并在该值存在时返回关联的值（如果不存在，或者 `user` 对象尚未创建，则返回 `undefined`）：

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

然后你可以在控制器中通过 `@User()` 装饰器访问特定的属性：

```typescript
@Get()
async findOne(@User('firstName') firstName: string) {
  console.log(`Hello ${firstName}`);
}

```

你可以使用同一个装饰器搭配不同的键来访问不同的属性。如果 `user` 对象很深或很复杂，这可以让路由处理程序的实现更简单、更易读。

> info **提示** `createParamDecorator<T>()` 是泛型的，因此你可以显式地强制类型安全，例如 `createParamDecorator<string>((data, ctx) => ...)`。或者，在工厂函数中指定参数类型，例如 `createParamDecorator((data: string, ctx) => ...)`。如果两者都省略，`data` 的类型为 `any`。

#### 与管道一起使用

Nest 对待自定义参数装饰器的方式与内置装饰器（`@Body()`、`@Param()` 和 `@Query()`）相同。这意味着管道也会对使用自定义装饰器标注的参数运行（在我们的示例中，是 `user` 参数）。你也可以直接将管道应用于自定义装饰器：

```typescript
@Get()
async findOne(
  @User(new ValidationPipe({ validateCustomDecorators: true }))
  user: UserEntity,
) {
  console.log(user);
}

```

> info **提示** 默认情况下，`ValidationPipe` 不会验证使用自定义装饰器标注的参数。这就是为什么上面的示例将 `validateCustomDecorators` 选项设置为 `true`。

自定义装饰器也接受内置参数装饰器的 `schema` 选项。传入一个与 [Standard Schema](https://standardschema.dev/) 兼容的模式，例如 Zod 模式，启用了 `validateCustomDecorators` 选项的 `StandardSchemaValidationPipe` 会根据它验证装饰器的值：

```typescript
@Get()
async findOne(@User('email', { schema: z.email() }) email: string) {
  console.log(email);
}

```

详情请参阅 [Validating custom decorators](/application/validation#validating-custom-decorators)。

#### 装饰器组合

Nest 提供了 `applyDecorators()` 辅助函数来组合多个装饰器。例如，假设你想将所有与认证相关的装饰器组合成一个装饰器：

```typescript title="auth.decorator.ts"
import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';

export function Auth(...roles: Role[]) {
  return applyDecorators(
    SetMetadata('roles', roles),
    UseGuards(AuthGuard, RolesGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  );
}

```

然后你可以按如下方式使用这个自定义的 `@Auth()` 装饰器：

```typescript
@Get('users')
@Auth('admin')
findAllUsers() {}

```

这会通过单个声明应用所有四个装饰器。

> warning **警告** 来自 `@nestjs/swagger` 包的 `@ApiHideProperty()` 装饰器不可组合，并且无法与 `applyDecorators()` 函数正确配合使用。