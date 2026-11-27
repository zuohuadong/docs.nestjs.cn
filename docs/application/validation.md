<!-- 此文件从 content/application/validation.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T01:02:14.383Z -->
<!-- 源文件: content/application/validation.md -->
<!-- 源哈希: 66dc2cc167b3004d4acd9bedd478368e -->

### 验证

在对 Web 应用程序接收到的每一份数据采取操作之前，都应进行验证。Nest 提供了几个管道，可自动验证传入的请求：

- `ValidationPipe` 验证使用 [class-validator](https://github.com/typestack/class-validator) 规则装饰的类。
- `StandardSchemaValidationPipe` 验证使用 [Zod](https://zod.dev/)、[Valibot](https://valibot.dev/)、[ArkType](https://arktype.io/) 或任何其他 [Standard Schema](https://standardschema.dev/) 兼容库编写的模式。
- `ParseIntPipe`、`ParseBoolPipe`、`ParseArrayPipe` 和 `ParseUUIDPipe` 验证和转换单个值。

#### 概述

[Pipes](/pipes) 章节解释了管道的工作原理以及如何将它们绑定到参数、路由处理器、控制器或整个应用程序。本章在此基础上，涵盖了两种验证管道的实际应用。

这些管道的区别在于验证规则的存放位置：

- 使用 `ValidationPipe` 时，规则是 **DTO 类**上的装饰器，且该类也是参数的 TypeScript 类型。此方法与 [mapped types](#mapped-types) 工具和 Swagger CLI 插件集成。
- 使用 `StandardSchemaValidationPipe` 时，规则是一个 **模式对象**，且参数的 TypeScript 类型是从模式中推断出来的。模式与其库的方法组合，不涉及类或反射元数据。

两个管道可以同时注册。`ValidationPipe` 仅验证使用类的参数，而 `StandardSchemaValidationPipe` 仅验证声明了模式的参数，因此您可以在现有应用程序中逐步采用模式。

#### 使用内置的 ValidationPipe

要开始使用它，首先安装所需的依赖项。

```bash
$ npm i --save class-validator class-transformer

```

> info **提示** `ValidationPipe` 从 `@nestjs/common` 包中导出。

由于此管道使用了 [`class-validator`](https://github.com/typestack/class-validator) 和 [`class-transformer`](https://github.com/typestack/class-transformer) 库，因此支持许多选项。将它们作为配置对象传递给管道的构造函数。管道自身的选项如下：

```typescript
export interface ValidationPipeOptions extends ValidatorOptions {
  transform?: boolean;
  disableErrorMessages?: boolean;
  exceptionFactory?: (errors: ValidationError[]) => any;
  errorFormat?: 'list' | 'grouped';
  maxErrorMessagesLength?: number;
}

```

除此之外，所有 `class-validator` 选项（继承自 `ValidatorOptions` 接口）均可用：

<table>
  <tr>
    <th>Option</th>
    <th>Type</th>
    <th>Description</th>
  </tr>
  <tr>
    <td><code>enableDebugMessages</code></td>
    <td><code>boolean</code></td>
    <td>如果设置为 true，验证器将在出现问题时向控制台打印额外的警告消息。</td>
  </tr>
  <tr>
    <td><code>skipUndefinedProperties</code></td>
    <td><code>boolean</code></td>
    <td>如果设置为 true，验证器将跳过验证验证对象中所有未定义的属性。</td>
  </tr>
  <tr>
    <td><code>skipNullProperties</code></td>
    <td><code>boolean</code></td>
    <td>如果设置为 true，验证器将跳过验证验证对象中所有为 null 的属性。</td>
  </tr>
  <tr>
    <td><code>skipMissingProperties</code></td>
    <td><code>boolean</code></td>
    <td>如果设置为 true，验证器将跳过验证验证对象中所有为 null 或未定义的属性。</td>
  </tr>
  <tr>
    <td><code>whitelist</code></td>
    <td><code>boolean</code></td>
    <td>如果设置为 true，验证器将从已验证（返回）对象中移除任何未使用任何验证装饰器的属性。</td>
  </tr>
  <tr>
    <td><code>forbidNonWhitelisted</code></td>
    <td><code>boolean</code></td>
    <td>如果设置为 true，验证器将抛出异常，而不是移除非白名单属性。</td>
  </tr>
  <tr>
    <td><code>forbidUnknownValues</code></td>
    <td><code>boolean</code></td>
    <td>如果设置为 true，尝试验证未知对象将立即失败。</td>
  </tr>
  <tr>
    <td><code>disableErrorMessages</code></td>
    <td><code>boolean</code></td>
    <td>如果设置为 true，验证错误将不会返回给客户端。</td>
  </tr>
  <tr>
    <td><code>errorHttpStatusCode</code></td>
    <td><code>number</code></td>
    <td>此设置允许您指定在发生错误时使用的异常类型。默认情况下它抛出 <code>BadRequestException</code>。</td>
  </tr>
  <tr>
    <td><code>exceptionFactory</code></td>
    <td><code>Function</code></td>
    <td>接收一个验证错误数组并返回一个要抛出的异常对象。</td>
  </tr>
  <tr>
    <td><code>groups</code></td>
    <td><code>string[]</code></td>
    <td>用于对象验证的组。</td>
  </tr>
  <tr>
    <td><code>always</code></td>
    <td><code>boolean</code></td>
    <td>为装饰器的 <code>always</code> 选项设置默认值。可以在装饰器选项中覆盖默认值。</td>
  </tr>

  <tr>
    <td><code>strictGroups</code></td>
    <td><code>boolean</code></td>
    <td>如果未提供或为空 <code>groups</code>，则忽略至少有一个组的装饰器。</td>
  </tr>
  <tr>
    <td><code>dismissDefaultMessages</code></td>
    <td><code>boolean</code></td>
    <td>如果设置为 true，验证将不使用默认消息。除非明确设置，否则错误消息始终为 <code>undefined</code>。</td>
  </tr>
  <tr>
    <td><code>validationError.target</code></td>
    <td><code>boolean</code></td>
    <td>指示目标是否应在 <code>ValidationError</code> 中暴露。<code>ValidationPipe</code> 默认将其设置为 <code>false</code>，因此读取 <code>error.target</code> 的 <code>exceptionFactory</code> 将得到 <code>undefined</code>，除非将其设置为 <code>true</code>。</td>
  </tr>
  <tr>
    <td><code>validationError.value</code></td>
    <td><code>boolean</code></td>
    <td>指示验证后的值是否应在 <code>ValidationError</code> 中暴露。</td>
  </tr>
  <tr>
    <td><code>stopAtFirstError</code></td>
    <td><code>boolean</code></td>
    <td>设置为 true 时，给定属性的验证将在遇到第一个错误后停止。默认为 false。</td>
  </tr>
  <tr>
    <td><code>errorFormat</code></td>
    <td><code>'list' | 'grouped'</code></td>
    <td>指定验证错误消息的格式。<code>'list'</code>（默认）返回一个错误消息字符串数组。<code>'grouped'</code>返回一个对象，其中属性路径作为键，未修改的错误消息数组作为值，保留自定义验证消息而不添加父路径前缀。</td>
  </tr>
  <tr>
    <td><code>maxErrorMessagesLength</code></td>
    <td><code>number</code></td>
    <td>内置异常工厂错误响应中消息的最大总长度（字符数）。超过此限制的错误将被省略，并有一个最后的消息说明情况。设置为 <code>Infinity</code> 以解除限制。一个不是数字的值，例如 <code>NaN</code>（由 <code>Number()</code> 对未设置的环境变量产生的），将获得默认值。默认为 <code>1000000</code>。</td>
  </tr>
</table>

> info **注意** 在其 [repository](https://github.com/typestack/class-validator) 中查找有关 `class-validator` 包的更多信息。

#### 自动验证

首先在应用级别绑定`ValidationPipe`，这样每个端点都可防止接收到无效数据。

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

要测试管道，创建一个基本端点：

```typescript
@Post()
create(@Body() createUserDto: CreateUserDto) {
  return 'This action adds a new user';
}

```

> info **提示** TypeScript 不为**泛型或接口**发出元数据，因此`ValidationPipe` 无法验证使用它们的 DTO。请为 DTO 使用具体类。

> info **提示** 不要使用类型独有导入导入 DTO，因为类型独有导入在运行时会被擦除。请写 `import { CreateUserDto }` 而不是 `import type { CreateUserDto }`。

接下来，使用 `class-validator` 包提供的装饰器，在`CreateUserDto`中添加验证规则（参见 [full list](https://github.com/typestack/class-validator#validation-decorators)）。任何使用`CreateUserDto`的路由都会强制执行这些规则。

```typescript
import { IsEmail, IsNotEmpty } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  password: string;
}

```

有了这些规则，其主体包含无效`email`属性的请求将收到一个包含以下主体的`400 Bad Request`响应：

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": ["email must be an email"]
}

```

`ValidationPipe` 也会验证请求的其他部分。例如，要只接受`:id`路径参数的数字值，请使用以下结构：

```typescript
@Get(':id')
findOne(@Param() params: FindOneParams) {
  return 'This action returns a user';
}

```

像 DTO 一样，`FindOneParams` 是一个使用`class-validator`定义验证规则的类：

```typescript
import { IsNumberString } from 'class-validator';

export class FindOneParams {
  @IsNumberString()
  id: string;
}

```

> warning **警告** `@IsOptional()` 在其值是`null`时会跳过该属性的其他验证器，而不仅仅是在它是`undefined`时。像`{"title": null}`这样的主体会通过验证，并且`null` 可以到达您的数据库。对于可能被省略但不得是`null`的属性，请使用`@ValidateIf((_, value) => value !== undefined)`替换`@IsOptional()`，并将其与该属性的其他验证器一起使用。

#### 禁用详细错误

错误消息解释了请求哪里出了问题，但某些生产环境不希望暴露这些信息。要禁用详细错误，请将一个选项对象传递给`ValidationPipe`：

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    disableErrorMessages: true,
  }),
);

```

结果，响应主体不再包含详细的错误消息。

#### 剥离属性

`ValidationPipe` 还可以过滤掉路由处理器不应接收的属性。当您**白名单**可接受的属性时，任何未包含在白名单中的属性都将从结果对象中剥离。例如，如果处理器期望`email`和`password`，但请求还包含一个`age`属性，则`age` 会从结果 DTO 中移除。要启用此行为，请将`whitelist`设置为`true`。

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
  }),
);

```

启用此选项后，验证类中没有任何装饰器的属性将被移除。

或者，您可以拒绝包含非白名单属性的请求并返回错误响应。为此，除了`whitelist`外，还需将`forbidNonWhitelisted`设置为`true`。

<app-banner-courses></app-banner-courses>

#### 转换载荷对象

载荷通过网络以纯 JavaScript 对象形式到达。`ValidationPipe` 可以将其转换为其 DTO 类的实例。要启用自动转换，请将`transform`设置为`true`。您可以在方法级别做到这一点：

```typescript title="cats.controller.ts"
@Post()
@UsePipes(new ValidationPipe({ transform: true }))
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}

```

要全局启用此行为，请在全局管道上设置该选项：

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    transform: true,
  }),
);

```

启用自动转换后，`ValidationPipe` 还会转换原始类型。在以下示例中，`findOne()` 方法将`id` 路径参数作为参数：

```typescript
@Get(':id')
findOne(@Param('id') id: number) {
  console.log(typeof id === 'number'); // true
  return 'This action returns a user';
}

```

路径参数和查询参数总是以字符串形式到达。因为方法签名将`id` 声明为`number`，所以`ValidationPipe` 会将字符串标识符转换为数字。

#### 显式转换

前一节展示了如何根据声明的类型隐式转换查询和路径参数。该转换需要启用自动转换。

在禁用自动转换的情况下，您可以使用`ParseIntPipe`或`ParseBoolPipe`显式转换值。没有`ParseStringPipe`，因为路径和查询参数已经是字符串。

```typescript
@Get(':id')
findOne(
  @Param('id', ParseIntPipe) id: number,
  @Query('sort', ParseBoolPipe) sort: boolean,
) {
  console.log(typeof id === 'number'); // true
  console.log(typeof sort === 'boolean'); // true
  return 'This action returns a user';
}

```

> info **提示** `ParseIntPipe` 和 `ParseBoolPipe` 从 `@nestjs/common` 包导出。

#### 映射类型

**CRUD**（创建/读取/更新/删除）等功能通常需要基础类型的多个变体。Nest 提供了执行这些类型转换的实用函数。

> warning **警告** 如果您的应用程序使用`@nestjs/swagger`包，请参阅 [this chapter](/openapi/mapped-types) 了解有关映射类型的更多信息。同样，如果您使用`@nestjs/graphql`包，请参阅 [this chapter](/graphql/mapped-types)。这两个包都严重依赖类型元数据，因此它们导出了自己版本的这些实用函数。从 `@nestjs/mapped-types` 而不是 `@nestjs/swagger` 或 `@nestjs/graphql` 导入它们可能会导致未记录的副作用。

输入验证类型（DTO）通常有同一类型的**创建**和**更新**变体：**创建**变体需要所有字段，而**更新**变体使其可选。映射类型实用函数在不重复属性声明或其验证装饰器的情况下派生出此类变体。考虑以下**创建**类型：

```typescript
export class CreateCatDto {
  name: string;
  age: number;
  breed: string;
}

```

> info **提示** `PartialType()`、`PickType()`、`OmitType()` 和 `IntersectionType()` 从 `@nestjs/mapped-types` 包导入。

`PartialType()` 函数返回一个类型（类），其中输入类型的**所有**属性都被设置为可选：

```typescript
export class UpdateCatDto extends PartialType(CreateCatDto) {}

```

> info **提示** 与`@IsOptional()`一样，`PartialType()` 也跳过`null` 和 `undefined` 的验证。要验证`null`并仅跳过`undefined`，请将`{ skipNullProperties: false }` 作为第二个参数传递。

`PickType()` 函数从输入类型的子集属性构建一个类型：

```typescript
export class UpdateCatAgeDto extends PickType(CreateCatDto, ['age'] as const) {}

```

`OmitType()` 函数构建一个类型，其中包含输入类型的**除**所列属性外的所有属性。第二个参数是一个属性名称数组：

```typescript
export class UpdateCatDto extends OmitType(CreateCatDto, ['name'] as const) {}

```

`IntersectionType()` 函数将两个类型的属性组合成一个新的类型（类）。例如，给定一个附加类型：

```typescript
export class AdditionalCatInfo {
  color: string;
}

```

该类型包含两者的属性：

```typescript
export class UpdateCatDto extends IntersectionType(
  CreateCatDto,
  AdditionalCatInfo,
) {}

```

类型映射工具函数是可组合的。例如，以下类型包含 `CreateCatDto` 的所有属性，但排除了 `name`，且所有属性均设置为可选：

```typescript
export class UpdateCatDto extends PartialType(
  OmitType(CreateCatDto, ['name'] as const),
) {}

```

#### 解析和验证数组

TypeScript 不为数组等泛型类型发出元数据，因此 `ValidationPipe` 无法验证数组参数的元素。在以下代码中，`createUserDtos` 的元素未被验证：

```typescript
@Post()
createBulk(@Body() createUserDtos: CreateUserDto[]) {
  return 'This action adds new users';
}

```

要验证数组，请创建一个包含包装数组属性的专用类，或者使用 `ParseArrayPipe`：

```typescript
@Post()
createBulk(
  @Body(new ParseArrayPipe({ items: CreateUserDto }))
  createUserDtos: CreateUserDto[],
) {
  return 'This action adds new users';
}

```

`ParseArrayPipe` 也可用于解析查询参数。考虑一个基于查询字符串中传递的标识符返回用户的 `findByIds()` 方法：

```typescript
@Get()
findByIds(
  @Query('ids', new ParseArrayPipe({ items: Number, separator: ',' }))
  ids: number[],
) {
  return 'This action returns users by ids';
}

```

此构造解析和验证了如下请求的查询参数：

```bash
GET /?ids=1,2,3

```

默认情况下，`ParseArrayPipe` 在遇到第一个无效项时拒绝整个数组。当设置 `stopAtFirstError` 选项为 `false` 时，它会验证每个项，并报告所有无效项的错误，每个错误都以其项的索引开头，例如 `[2] email must be an email`。`maxErrorMessagesLength` 选项，它像 `ValidationPipe` 一样接受 `ParseArrayPipe`，然后应用于所有项的消息：一旦到达该选项，下一个无效项将终止验证，其后的项不会被验证，并且最后一条消息会说明遗漏了错误。使用自定义 `exceptionFactory` 时，此限制不适用。

#### 基于模式的验证

`StandardSchemaValidationPipe` 验证值是否符合模式，而不是装饰的类。它接受任何实现 [Standard Schema](https://standardschema.dev/) 规范的模式，包括 [Zod](https://zod.dev/)、[Valibot](https://valibot.dev/) 和 [ArkType](https://arktype.io/)。模式是有效载荷的单一事实来源：它在运行时验证值，其推断类型是处理程序的参数的 TypeScript 类型。本节中的示例使用 Zod。

```bash
$ npm i --save zod

```

定义一个模式并从中推断 DTO 类型：

```typescript title="create-user.dto.ts"
import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  displayName: z.string().max(50).optional(),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;

```

接下来，在应用级别绑定管道：

```typescript title="main.ts"
import { StandardSchemaValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

然后使用参数装饰器的 `schema` 选项将模式附加到参数上：

```typescript title="users.controller.ts"
@Post()
create(@Body({ schema: createUserSchema }) createUserDto: CreateUserDto) {
  return this.usersService.create(createUserDto);
}

```

该管道仅验证声明了模式的参数，并将所有其他值原样传递，因此全局绑定是安全的。如果请求体不匹配模式，应用程序将返回 `400 Bad Request`。每个消息都以无效属性的路径开头：

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": [
    "email: Invalid email address",
    "password: Too small: expected string to have >=8 characters"
  ]
}

```

`schema` 选项受 `@Body()`、`@Query()` 和 `@Param()` 支持，也受 [gateways](/websockets/gateways) 中的 `@MessageBody()` 和 [microservices](/microservices/basics) 中的 `@Payload()` 支持。将其作为唯一参数传递以验证整个对象，或在属性名称后传递以验证单个值：

```typescript
@Post('invitations')
invite(@Body('email', { schema: z.email() }) email: string) {
  return this.usersService.invite(email);
}

```

#### 强制转换和转换

路径参数和查询参数始终以字符串形式到达。强制转换模式，如 `z.coerce.number()`，在验证之前将其转换为：

```typescript
@Get(':id')
findOne(@Param('id', { schema: z.coerce.number().int().positive() }) id: number) {
  return this.usersService.findOne(id);
}

```

模式也可以应用默认值和转换。以下模式描述了一个分页列表的查询字符串：

```typescript title="list-users-query.dto.ts"
import { z } from 'zod';

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

```

```typescript
@Get()
findAll(@Query({ schema: listUsersQuerySchema }) query: ListUsersQuery) {
  return this.usersService.findAll(query);
}

```

对于请求 `GET /users?page=2&search=%20kamil%20`，处理程序接收到 `page` 为数字 `2`，`limit` 为默认值 `20`，以及 `search` 为修剪后的字符串 `'kamil'`。

默认情况下，管道将模式的**输出**传递给处理程序，因此强制转换、默认值和转换生效。要验证值但将原始输入原样传递，请将 `transform` 设置为 `false`。在这种情况下，使用模式的输入类型（Zod 中的 `z.input<typeof schema>`）对参数进行类型定义。

#### 未知属性

模式如何处理其未声明的属性由模式本身决定，而不是由管道决定。在 Zod 中：

- `z.object()` 剥离未知属性，例如 `ValidationPipe` 的 `whitelist` 选项。
- `z.strictObject()` 拒绝它们，例如 `forbidNonWhitelisted` 选项。错误消息是 `Unrecognized key: "age"`。
- `z.looseObject()` 保留它们。

#### 派生模式

[mapped types](#mapped-types) 工具从现有 DTO 类派生新的 DTO 类。使用模式时，库自身的方法起着相同的作用：

```typescript title="update-user.dto.ts"
import { z } from 'zod';
import { createUserSchema } from './create-user.dto.js';

// All properties optional, like PartialType()
export const updateUserSchema = createUserSchema.partial();

// Only the listed properties, like PickType()
export const changeEmailSchema = createUserSchema.pick({ email: true });

// Every property except the listed ones, like OmitType()
export const publicProfileSchema = createUserSchema.omit({ password: true });

// Additional properties, like IntersectionType()
export const createAdminSchema = createUserSchema.extend({
  role: z.enum(['admin', 'editor']),
});

export type UpdateUserDto = z.infer<typeof updateUserSchema>;

```

数组也不需要特殊处理。将项模式包装在 `z.array()` 中，每个元素都会被验证：

```typescript
@Post('bulk')
createBulk(
  @Body({ schema: z.array(createUserSchema) }) createUserDtos: CreateUserDto[],
) {
  return this.usersService.createMany(createUserDtos);
}

```

无效元素的错误消息会以其索引开头，例如 `1.email: Invalid email address`。

#### 验证自定义装饰器

使用 [`createParamDecorator()`](/custom-decorators) 创建的参数装饰器也接受 `schema` 选项。例如，以下装饰器从请求头中提取租户标识符：

```typescript title="tenant-id.decorator.ts"
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const TenantId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest().headers['x-tenant-id'],
);

```

```typescript
@Get()
findAll(@TenantId({ schema: z.uuid() }) tenantId: string) {
  return this.projectsService.findAll(tenantId);
}

```

除非启用 `validateCustomDecorators` 选项，否则管道会跳过自定义装饰器：

```typescript
app.useGlobalPipes(
  new StandardSchemaValidationPipe({
    validateCustomDecorators: true,
  }),
);

```

#### 模式验证选项

`StandardSchemaValidationPipe` 构造函数接受以下选项：

<table>
  <tr>
    <th>Option</th>
    <th>Type</th>
    <th>Description</th>
  </tr>
  <tr>
    <td><code>transform</code></td>
    <td><code>boolean</code></td>
    <td>如果 <code>true</code>，则处理程序接收模式产生的值。如果 <code>false</code>，则接收成功验证后的原始输入。默认值：<code>true</code>。</td>
  </tr>
  <tr>
    <td><code>validateCustomDecorators</code></td>
    <td><code>boolean</code></td>
    <td>如果 <code>true</code>，则使用 <code>createParamDecorator()</code> 创建的自定义装饰器的参数也会被验证。默认值：<code>false</code>。</td>
  </tr>
  <tr>
    <td><code>validateOptions</code></td>
    <td><code>Record&lt;string, unknown&gt;</code></td>
    <td>将选项转发到模式的 <code>~standard.validate()</code> 方法，适用于支持它们的库。</td>
  </tr>
  <tr>
    <td><code>errorHttpStatusCode</code></td>
    <td><code>number</code></td>
    <td>验证失败时抛出的异常的 HTTP 状态码。默认值：<code>400</code>。</td>
  </tr>
  <tr>
    <td><code>exceptionFactory</code></td>
    <td><code>Function</code></td>
    <td>接收验证问题数组并返回要抛出的异常。</td>
  </tr>
  <tr>
    <td><code>maxErrorMessagesLength</code></td>
    <td><code>number</code></td>
    <td>内置异常工厂的错误响应中消息的最大总长度（以字符为单位），计算每个消息附带的路径。超过此限制的问题将被忽略，最后一条消息会说明情况。自定义 <code>exceptionFactory</code> 会接收每个问题。设置为 <code>Infinity</code> 以解除限制。非数字值（例如 <code>NaN</code>，由 <code>Number()</code> 对未设置的环境变量生成）将获得默认值。默认值：<code>1000000</code>。</td>
  </tr>
</table>

使用 `exceptionFactory` 来更改错误响应的形状。每个问题都有一个 `message`，对于嵌套值，有一个 `path`，其片段是属性键或具有 `key` 属性的对象：

```typescript
app.useGlobalPipes(
  new StandardSchemaValidationPipe({
    exceptionFactory: (issues) =>
      new UnprocessableEntityException({
        message: 'Validation failed',
        errors: issues.map((issue) => ({
          path: issue.path
            ?.map((segment) => (typeof segment === 'object' ? segment.key : segment))
            .join('.'),
          message: issue.message,
        })),
      }),
  }),
);

```

使用此工厂，无效请求会产生 `422 Unprocessable Entity` 响应：

```json
{
  "message": "Validation failed",
  "errors": [
    { "path": "email", "message": "Invalid email address" },
    { "path": "password", "message": "Too small: expected string to have >=8 characters" }
  ]
}

```

#### 其他模式库

管道中没有任何内容是特定于 Zod 的。相同的 `schema` 选项也接受 Valibot 模式：

```typescript
import * as v from 'valibot';

export const createUserSchema = v.object({
  email: v.pipe(v.string(), v.email()),
  password: v.pipe(v.string(), v.minLength(8)),
});

export type CreateUserDto = v.InferOutput<typeof createUserSchema>;

```

或者 ArkType 模式：

```typescript
import { type } from 'arktype';

export const createUserSchema = type({
  email: 'string.email',
  password: 'string >= 8',
});

export type CreateUserDto = typeof createUserSchema.infer;

```

错误消息来自库，因此它们在不同库之间措辞不同。

> info **提示** 相同的模式可以在 OpenAPI 文档中描述您的 API。请参阅 OpenAPI 章中的 [Standard Schema (Zod, Valibot)](/openapi/introduction#standard-schema-zod-valibot)。

可用的工作示例请参阅 [here](https://github.com/nestjs/nest/tree/master/sample/35-zod-validation)。

#### WebSockets 和微服务

虽然本章展示了使用 HTTP 应用程序（例如 Express 或 Fastify）的示例，但无论传输方式如何，`ValidationPipe` 和 `StandardSchemaValidationPipe` 在 WebSockets 和微服务中都以相同的方式工作。默认情况下，当验证失败时，两者都会抛出 HTTP 异常。要以传输方式能理解的方式报告错误，请从 `exceptionFactory` 选项返回一个 `WsException` 或一个 `RpcException`：

```typescript
new StandardSchemaValidationPipe({
  exceptionFactory: (issues) =>
    new WsException(issues.map((issue) => issue.message)),
});

```

#### 了解更多

有关自定义验证器、错误消息和可用装饰器的更多信息，请阅读 [class-validator](https://github.com/typestack/class-validator) 仓库。有关模式库，请参阅 [Zod](https://zod.dev/)、[Valibot](https://valibot.dev/) 和 [ArkType](https://arktype.io/) 文档以及 [Standard Schema compatible libraries](https://standardschema.dev/schema#what-schema-libraries-implement-the-spec) 列表。