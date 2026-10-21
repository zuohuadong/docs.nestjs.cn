<!-- 此文件从 content/application/serialization.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T08:33:07.808Z -->
<!-- 源文件: content/application/serialization.md -->
<!-- 源哈希: b17437df59efa0266c75493debbe6a20 -->

### 序列化

序列化发生在对象作为网络响应返回之前。它是定义用于转换和净化发送给客户端的数据规则的合适位置。例如，像密码这样的敏感数据必须始终从响应中排除，而某些属性可能需要进一步转换，例如只返回实体属性的一个子集。在每个处理程序中手动执行这些转换既繁琐又容易出错，而且很难确保覆盖了所有情况。

#### 概述

Nest 提供了两个内置拦截器，以声明式的方式应用这些规则：

- `ClassSerializerInterceptor` 使用 [class-transformer](https://github.com/typestack/class-transformer) 包。它接收路由处理程序返回的值，并对其应用 `instanceToPlain()` 函数，该函数会遵循在实体或 DTO 类上声明的 `class-transformer` 装饰器。本章的第一部分将介绍这种方法。

- `StandardSchemaSerializerInterceptor` 使用以 [Zod](https://zod.dev/)、[Valibot](https://valibot.dev/)、[ArkType](https://arktype.io/) 或任何其他 [Standard Schema](https://standardschema.dev/) 兼容库编写的模式来验证和转换响应。请参阅 [Schema-based serialization](#schema-based-serialization)。

> info **提示** 这两个拦截器都不会序列化 [StreamableFile](/http/file-upload#streaming-files) 响应。

#### 排除属性

假设你想从每个响应中排除用户实体的 `password` 属性。按如下方式注解该实体：

```typescript
import { Exclude } from 'class-transformer';

export class UserEntity {
  id: number;
  firstName: string;
  lastName: string;

  @Exclude()
  password: string;

  constructor(partial: Partial<UserEntity>) {
    Object.assign(this, partial);
  }
}

```

现在考虑一个控制器，其路由处理程序返回此类的实例：

```typescript
@UseInterceptors(ClassSerializerInterceptor)
@Get()
findOne(): UserEntity {
  return new UserEntity({
    id: 1,
    firstName: 'John',
    lastName: 'Doe',
    password: 'password',
  });
}

```

> warning **警告** 处理程序必须返回该类的实例。像 `{ user: new UserEntity() }` 这样的普通 JavaScript 对象不会被正确序列化。要序列化普通对象，请参阅 [Transform plain objects](#transform-plain-objects)。

> info **提示** `ClassSerializerInterceptor` 是从 `@nestjs/common` 导入的。

当请求此端点时，客户端会收到以下响应：

```json
{
  "id": 1,
  "firstName": "John",
  "lastName": "Doe"
}

```

该拦截器也可以绑定到整个应用程序（请参阅 [Binding interceptors](/overview/interceptors#绑定拦截器)）。拦截器和实体类声明共同确保**每一个**返回 `UserEntity` 的路由处理程序都会省略 `password` 属性，从而在一处强制实施此规则。

#### 暴露属性

使用 `@Expose()` 装饰器为属性提供别名，或使用函数计算属性值（类似于 **getter**），如下所示。

```typescript
@Expose()
get fullName(): string {
  return `${this.firstName} ${this.lastName}`;
}

```

#### 转换

使用 `@Transform()` 装饰器进行额外的数据转换。例如，以下构造返回 `RoleEntity` 的 `name` 属性，而不是整个对象。

```typescript
@Transform(({ value }) => value.name)
role: RoleEntity;

```

#### 传递选项

要覆盖转换函数的默认行为，请向 `@SerializeOptions()` 装饰器传递选项。

```typescript
@SerializeOptions({
  excludePrefixes: ['_'],
})
@Get()
findOne(): UserEntity {
  return new UserEntity();
}

```

> info **提示** `@SerializeOptions()` 装饰器是从 `@nestjs/common` 导入的。

传递给 `@SerializeOptions()` 的选项会作为底层 `instanceToPlain()` 函数的第二个参数转发。在此示例中，所有以 `_` 前缀开头的属性都会被排除。

#### 转换普通对象

`@SerializeOptions()` 的 `type` 选项会在响应被序列化之前将其转换为指定类的实例，因此即使处理程序返回的是普通对象，该类的 `class-transformer` 装饰器也会生效。这消除了在每个处理程序中实例化该类或调用 `plainToInstance()` 的需要。

在下面的示例中，两个条件分支都返回普通 JavaScript 对象，它们会被转换为 `UserEntity` 实例并应用相关的装饰器：

```typescript
@UseInterceptors(ClassSerializerInterceptor)
@SerializeOptions({ type: UserEntity })
@Get()
findOne(@Query() { id }: { id: number }): UserEntity {
  if (id === 1) {
    return {
      id: 1,
      firstName: 'John',
      lastName: 'Doe',
      password: 'password',
    };
  }

  return {
    id: 2,
    firstName: 'Kamil',
    lastName: 'Mysliwiec',
    password: 'password2',
  };
}

```

> info **提示** 声明处理程序的返回类型可以让 TypeScript 检查返回的普通对象是否与 DTO 或实体的结构匹配。`plainToInstance()` 函数不提供这种类型检查，因此不匹配的对象可能会被忽略。

> warning **警告** 响应的结构由 `type` 类决定，而不是由返回值的类决定。不是 `type` 类实例的值（例如另一个实体的实例）会像普通对象一样被转换：其自身类的装饰器（例如 `@Exclude()`）会被忽略，而 `type` 类未声明的属性会被原样复制。要只发送 `type` 类的属性，请为每个属性添加 `@Expose()` 装饰器，并在同一个 `@SerializeOptions()` 装饰器的选项中添加 `excludeExtraneousValues: true`。

#### 基于模式的序列化

`StandardSchemaSerializerInterceptor` 使用模式而不是类装饰器来塑造响应。模式精确地描述了从 API 出去的内容：拦截器将路由处理程序返回的值通过模式运行，并将模式的输出发送给客户端。它接受任何实现了 [Standard Schema](https://standardschema.dev/) 规范的模式。本节中的示例使用 Zod。

由于 `z.object()` 会剥离模式未声明的属性，因此响应模式也是一个允许列表。以下模式保证用户的 `password` 永远不会被发送，即使服务返回完整的数据库行：

```typescript title="user-response.schema.ts"
import { z } from 'zod';

export const userResponseSchema = z.object({
  id: z.number(),
  firstName: z.string(),
  lastName: z.string(),
});

export type UserResponse = z.infer<typeof userResponseSchema>;

```

绑定拦截器，并使用 `@SerializeOptions()` 装饰器的 `schema` 选项选择模式：

```typescript title="users.controller.ts"
import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  SerializeOptions,
  StandardSchemaSerializerInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import { userResponseSchema } from './user-response.schema.js';
import { UsersService } from './users.service.js';

@Controller('users')
@UseInterceptors(StandardSchemaSerializerInterceptor)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  @SerializeOptions({ schema: userResponseSchema })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Get()
  @SerializeOptions({ schema: userResponseSchema })
  findAll() {
    return this.usersService.findAll();
  }
}

```

服务返回包含 `password` 属性的用户记录，但客户端只会收到已声明的属性：

```json
{
  "id": 1,
  "firstName": "John",
  "lastName": "Doe"
}

```

当处理程序返回数组时（如 `findAll()` 所做的那样），拦截器会将模式应用于**每个元素**。请传递单个项的模式，而不是数组模式。

`null`、`undefined`、原始值以及 `StreamableFile` 响应都会原样发送，没有模式的处理程序的响应也是如此。

#### 使用模式转换响应

模式转换涵盖了 `@Expose()` 和 `@Transform()` 对类所做的事情。以下模式添加了一个计算属性 `fullName`，并将嵌套的 `role` 对象替换为其名称：

```typescript title="user-response.schema.ts"
import { z } from 'zod';

export const userResponseSchema = z
  .object({
    id: z.number(),
    firstName: z.string(),
    lastName: z.string(),
    role: z.object({ id: z.number(), name: z.string() }),
  })
  .transform((user) => ({
    id: user.id,
    fullName: `${user.firstName} ${user.lastName}`,
    role: user.role.name,
  }));

```

对于具有 `admin` 角色的用户，客户端会收到：

```json
{
  "id": 1,
  "fullName": "John Doe",
  "role": "admin"
}

```

使用 Valibot 编写的相同模式使用 `v.pipe()` 和 `v.transform()`：

```typescript
import * as v from 'valibot';

export const userResponseSchema = v.pipe(
  v.object({
    id: v.number(),
    firstName: v.string(),
    lastName: v.string(),
    role: v.object({ id: v.number(), name: v.string() }),
  }),
  v.transform((user) => ({
    id: user.id,
    fullName: `${user.firstName} ${user.lastName}`,
    role: user.role.name,
  })),
);

```

#### 绑定模式序列化器

`@SerializeOptions()` 既可以装饰控制器类，也可以装饰路由处理程序。设置在类上的模式会应用于其所有处理程序，而设置在处理程序上的模式优先级更高：

```typescript
@Controller('users')
@UseInterceptors(StandardSchemaSerializerInterceptor)
@SerializeOptions({ schema: userResponseSchema })
export class UsersController {}

```

要将拦截器绑定到整个应用程序，请向它传入 `Reflector` 实例，拦截器使用该实例读取 `@SerializeOptions()` 元数据：

```typescript title="main.ts"
const app = await NestFactory.create(AppModule);
app.useGlobalInterceptors(
  new StandardSchemaSerializerInterceptor(app.get(Reflector)),
);

```

或者，使用 `APP_INTERCEPTOR` 令牌注册它（如 [Binding interceptors](/overview/interceptors#绑定拦截器) 中所述），Nest 会为你注入 `Reflector`。没有模式的处理程序不受全局拦截器影响。

拦截器构造函数还接受默认选项，当处理程序及其控制器都未设置模式时，这些选项会生效：

<table>
  <tr>
    <td><code>schema</code></td>
    <td>当 <code>@SerializeOptions()</code> 未提供模式时使用的默认模式。</td>
  </tr>
  <tr>
    <td><code>validateOptions</code></td>
    <td>转发给模式 <code>~standard.validate()</code> 方法的选项，适用于支持它们的库。处理程序可以使用 <code>@SerializeOptions()</code> 的 <code>validateOptions</code> 选项覆盖它们。</td>
  </tr>
</table>

#### 序列化错误

与模式不匹配的响应（例如缺少属性或属性类型错误的记录）表明服务器存在缺陷，而不是请求有问题。在这种情况下，拦截器会抛出一个列出模式问题的错误，客户端会收到 `500 Internal Server Error` 响应，而不是部分序列化的数据。错误消息（包括这些问题）会由默认异常过滤器记录。

使用 Valibot 的可运行示例可在 [here](https://github.com/nestjs/nest/tree/master/sample/36-valibot-serializer) 中找到。

#### 示例

`ClassSerializerInterceptor` 的可运行示例可在 [here](https://github.com/nestjs/nest/tree/master/sample/21-serializer) 中找到。

#### WebSocket 与微服务

虽然本章展示的示例使用 HTTP 应用程序（例如 Express 或 Fastify），但 `ClassSerializerInterceptor` 和 `StandardSchemaSerializerInterceptor` 在 WebSocket 和微服务中的工作方式相同，与传输方式无关。

#### 了解更多

在 [class-transformer](https://github.com/typestack/class-transformer) 仓库中阅读有关可用装饰器和选项的更多信息。有关模式库，请参阅 [Zod](https://zod.dev/)、[Valibot](https://valibot.dev/) 和 [ArkType](https://arktype.io/) 文档。