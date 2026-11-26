<!-- 此文件从 content/application/serialization.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T23:03:40.192Z -->
<!-- 源文件: content/application/serialization.md -->
<!-- 源哈希: f9ca386d21b9841b6d640219c9942a16 -->

### 序列化

序列化发生在对象在网络响应中返回之前。这是定义发送给客户端的数据转换和清理规则的正确位置。例如，密码等敏感数据必须始终从响应中排除，并且某些属性可能需要进一步转换，例如只返回实体属性的子集。在每个处理器中手动执行这些转换既繁琐又容易出错，并且难以确保所有情况都已覆盖。

#### 概述

Nest 提供了两个内置的拦截器，以声明式方式应用这些规则：

- `ClassSerializerInterceptor` 使用 [class-transformer](https://github.com/typestack/class-transformer) 包。它接收路由处理器返回的值，并将其应用于 `instanceToPlain()` 函数，该函数尊重实体或 DTO 类上声明的 `class-transformer` 装饰器。本章的第一部分涵盖了这种方法。

- `StandardSchemaSerializerInterceptor` 使用在 [Zod](https://zod.dev/)、[Valibot](https://valibot.dev/)、[ArkType](https://arktype.io/) 或任何其他 [Standard Schema](https://standardschema.dev/) 兼容库中编写的模式来验证和转换响应。参见 [Schema-based serialization](#schema-based-serialization)。

> info **提示** 两个拦截器都不会序列化 [StreamableFile](/techniques/streaming-files) 响应。

在 HTTP 路由上，[streamed response](/http/streaming-responses#interceptors) 是逐个对象进行序列化的：异步生成器、对象模式 `Readable` 或 `ReadableStream` 产生的每个对象在发送为 JSON 行之前都会经过拦截器。字符串和二进制块保持不变发送。

#### 排除属性

假设您希望从每个响应中排除用户实体的 `password` 属性。按如下方式注解实体：

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

现在考虑一个包含返回该类实例的路由处理器的控制器：

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

> warning **警告** 处理器必须返回该类的实例。一个纯 JavaScript 对象，如 `{ user: new UserEntity() }`，不会被正确序列化。要序列化纯对象，请参见 [Transform plain objects](#transform-plain-objects)。

> info **提示** `ClassSerializerInterceptor` 从 `@nestjs/common` 导入。

当请求此端点时，客户端会收到以下响应：

```json
{
  "id": 1,
  "firstName": "John",
  "lastName": "Doe"
}

```

拦截器也可以绑定到整个应用程序（参见 [Binding interceptors](/overview/interceptors#绑定拦截器)）。拦截器和实体类声明结合使用，确保**每个**返回 `UserEntity` 的路由处理器都会省略 `password` 属性，从而在一个地方强制执行此规则。

#### 暴露属性

使用 `@Expose()` 装饰器为属性提供别名，或使用函数（类似于 **getter**）计算属性值，如下所示。

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

要覆盖转换函数的默认行为，请将选项传递给 `@SerializeOptions()` 装饰器。

```typescript
@SerializeOptions({
  excludePrefixes: ['_'],
})
@Get()
findOne(): UserEntity {
  return new UserEntity();
}

```

> info **提示** `@SerializeOptions()` 装饰器从 `@nestjs/common` 导入。

传递给 `@SerializeOptions()` 的选项作为底层 `instanceToPlain()` 函数的第二个参数转发。在此示例中，所有以 `_` 前缀开头的属性都被排除。

#### 转换纯对象

`@SerializeOptions()` 的 `type` 选项会在响应被序列化之前将其转换为指定类的实例，因此即使处理器返回纯对象，类的 `class-transformer` 装饰器也会应用。这消除了在每个处理器中实例化类或调用 `plainToInstance()` 的需要。

在下面的示例中，两个条件分支都返回纯 JavaScript 对象，它们被转换为具有相关装饰器的 `UserEntity` 实例：

```typescript
@UseInterceptors(ClassSerializerInterceptor)
@SerializeOptions({ type: UserEntity })
@Get()
findOne(@Query('id', ParseIntPipe) id: number): UserEntity {
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

> info **提示** 声明处理器的返回类型可以让 TypeScript 检查返回的纯对象是否匹配 DTO 或实体的形状。`plainToInstance()` 函数不提供此类型检查，因此不匹配的对象可能会被忽略。

> warning **警告** 响应的形状由 `type` 类决定，而不是由返回值的类决定。一个不是 `type` 类的实例的值（例如另一个实体的实例）会被像纯对象一样转换：其自身类的装饰器（如 `@Exclude()`）被忽略，并且 `type` 类未声明的属性被原样复制。要仅发送 `type` 类的属性，请用 `@Expose()` 装饰每个属性，并在相同的 `@SerializeOptions()` 装饰器的选项中添加 `excludeExtraneousValues: true`。

#### 基于模式的序列化

`StandardSchemaSerializerInterceptor` 使用模式而不是类装饰器来塑造响应。该模式精确描述了离开 API 的内容：拦截器将路由处理器返回的值通过该模式运行，并将模式的输出发送给客户端。它接受实现 [Standard Schema](https://standardschema.dev/) 规范的任何模式。本节的示例使用 Zod。

由于 `z.object()` 会剥离模式未声明的属性，响应模式也是一个允许列表。以下模式保证用户的 `password` 永远不会被发送，即使服务返回了完整的数据库行：

```typescript title="user-response.schema.ts"
import { z } from 'zod';

export const userResponseSchema = z.object({
  id: z.number(),
  firstName: z.string(),
  lastName: z.string(),
});

export type UserResponse = z.infer<typeof userResponseSchema>;

```

绑定拦截器并使用 `@SerializeOptions()` 装饰器的 `schema` 选项选择模式：

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

服务返回包含 `password` 属性的用户记录，但客户端仅接收声明的属性：

```json
{
  "id": 1,
  "firstName": "John",
  "lastName": "Doe"
}

```

当处理器返回数组时，如 `findAll()` 所做的那样，拦截器会将模式应用于**每个元素**，就像应用于 HTTP 路由上的 [streamed response](/http/streaming-responses#interceptors) 的每个对象一样。传递单个项的模式，而不是数组模式。

`null`、`undefined`、原始值和 `StreamableFile` 响应保持不变发送，没有模式的处理器响应也是如此。

#### 使用模式转换响应

模式转换涵盖了 `@Expose()` 和 `@Transform()` 对类的操作。以下模式添加了一个计算的 `fullName` 属性，并将嵌套的 `role` 对象替换为其名称：

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

对于具有 `admin` 角色的用户，客户端接收到：

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

`@SerializeOptions()` 可以装饰控制器类以及路由处理器。设置在类上的模式应用于其所有处理器，而设置在处理器上的模式具有更高优先级：

```typescript
@Controller('users')
@UseInterceptors(StandardSchemaSerializerInterceptor)
@SerializeOptions({ schema: userResponseSchema })
export class UsersController {}

```

要全局绑定拦截器，请将其传递 `Reflector` 实例，拦截器使用该实例来读取 `@SerializeOptions()` 元数据：

```typescript title="main.ts"
const app = await NestFactory.create(AppModule);
app.useGlobalInterceptors(
  new StandardSchemaSerializerInterceptor(app.get(Reflector)),
);

```

或者，如 [Binding interceptors](/overview/interceptors#绑定拦截器) 中所述，将其注册到 `APP_INTERCEPTOR` 令牌，Nest 会为您注入 `Reflector`。没有模式的处理器不受全局拦截器的影响。

拦截器构造函数还接受默认选项，当处理器或其控制器均未设置模式时应用这些选项：

<table>
  <tr>
    <td><code>schema</code></td>
    <td>当 <code>@SerializeOptions()</code> 未提供时使用的默认模式。</td>
  </tr>
  <tr>
    <td><code>validateOptions</code></td>
    <td>对于支持它们的库，此选项会转发给模式的 <code>~standard.validate()</code> 方法。处理器可以使用 <code>@SerializeOptions()</code> 的 </code>validateOptions<code> 选项覆盖它们。</td>
  </tr>
</table>

#### 序列化错误

响应不符合其模式，例如记录缺少或属性拼写错误，表明服务器端存在错误，而不是请求问题。在这种情况下，拦截器会抛出一个列出模式问题的错误，客户端接收到 `500 Internal Server Error` 响应，而不是部分序列化的数据。包括问题的错误消息由默认异常过滤器记录。

一个使用 Valibot 的工作示例可在 [here](https://github.com/nestjs/nest/tree/master/sample/36-valibot-serializer) 查看。

#### 示例

`ClassSerializerInterceptor` 的工作示例可在 [here](https://github.com/nestjs/nest/tree/master/sample/21-serializer) 查看。

#### WebSockets 和微服务

虽然本章展示了使用 HTTP 应用程序（例如 Express 或 Fastify）的示例，但对于 WebSockets 和微服务，无论传输方式如何，`ClassSerializerInterceptor` 和 `StandardSchemaSerializerInterceptor` 都能以相同的方式工作。例外是流：只有在 HTTP 路由上，它产生的每个对象才会被序列化；而 WebSockets、微服务和 GraphQL 订阅等其他传输方式，会接收到处理器返回的原始流。

#### 了解更多

有关可用装饰器和选项，请阅读 [class-transformer](https://github.com/typestack/class-transformer) 仓库中的更多信息。有关模式库，请参阅 [Zod](https://zod.dev/)、[Valibot](https://valibot.dev/) 和 [ArkType](https://arktype.io/) 文档。