### 验证

验证发送到 Web 应用程序的任何数据的正确性是最佳实践。为了自动验证传入的请求，Nest 提供了几个开箱即用的管道：

- `ValidationPipe`
- `ParseIntPipe`
- `ParseBoolPipe`
- `ParseArrayPipe`
- `ParseUUIDPipe`

`ValidationPipe` 使用强大的 [class-validator](https://github.com/typestack/class-validator) 包及其声明式验证装饰器。`ValidationPipe` 提供了一种便捷的方法来对所有传入的客户端负载强制执行验证规则，其中具体的规则在每个模块的本地类/DTO 声明中用简单的注解声明。

#### 概述

在[管道](/pipes)章节中，我们介绍了构建简单管道并将其绑定到控制器、方法或全局应用程序的过程，以演示该过程如何工作。请务必阅读该章节以最好地理解本章的主题。在这里，我们将重点关注 `ValidationPipe` 的各种**实际**用例，并展示如何使用它的一些高级自定义功能。

#### 使用内置的 ValidationPipe

要开始使用它，我们首先安装所需的依赖项。

```bash
$ npm i --save class-validator class-transformer

```

:::info 提示
`ValidationPipe` 从 `@nestjs/common` 包导出。
:::

#### 使用内置的 StandardSchemaValidationPipe

如果您的项目已经使用兼容 Standard Schema 的库定义了请求模式，您可以将它们直接附加到路由装饰器上，并使用 `StandardSchemaValidationPipe` 进行验证。

```typescript
import { z } from 'zod';
import { Body, Controller, Param, Post, Get, StandardSchemaValidationPipe } from '@nestjs/common';

@Controller('users')
export class UsersController {
  @Post()
  create(@Body({ schema: createUserSchema }) body: CreateUserDto) {
    return body;
  }

  @Get(':id')
  findOne(@Param('id', { schema: z.coerce.number().int().positive() }) id: number) {
    return { id };
  }
}
```

全局注册该管道：

```typescript
app.useGlobalPipes(new StandardSchemaValidationPipe());
```

默认情况下，该管道返回由模式产生的值。当您的模式执行强制转换或变换时，这会非常有用。

```typescript
app.useGlobalPipes(
  new StandardSchemaValidationPipe({
    transform: true,
  }),
);
```

如果您还希望它验证通过 `createParamDecorator()` 创建的自定义参数装饰器所产生的值，请启用 `validateCustomDecorators`。

```typescript
app.useGlobalPipes(
  new StandardSchemaValidationPipe({
    validateCustomDecorators: true,
  }),
);
```

当您的模式已经存在于基于类的 DTO 之外时，请使用这种方式。如果您的项目依赖 `class-validator` 装饰器，`ValidationPipe` 仍然是正确的选择。

> info **提示** 相同的模式还可以驱动您的 OpenAPI 文档。参见 OpenAPI 章节中的 [Standard Schema (Zod, Valibot)](/openapi/introduction#standard-schema-zod-valibot)。

因为此管道使用 [`class-validator`](https://github.com/typestack/class-validator) 和 [`class-transformer`](https://github.com/typestack/class-transformer) 库，所以有许多可用的选项。你可以通过传递给管道的配置对象来配置这些设置。以下是内置选项：

```typescript
export interface ValidationPipeOptions extends ValidatorOptions {
  transform?: boolean;
  disableErrorMessages?: boolean;
  exceptionFactory?: (errors: ValidationError[]) => any;
  errorFormat?: 'list' | 'grouped';
}

```

除此之外，所有 `class-validator` 选项（从 `ValidatorOptions` 接口继承）都可用：

<table>
  <tr>
    <th>选项</th>
    <th>类型</th>
    <th>描述</th>
  </tr>
  <tr>
    <td><code>enableDebugMessages</code></td>
    <td><code>boolean</code></td>
    <td>如果设置为 true，验证器将在出现问题时向控制台打印额外的警告消息。</td>
  </tr>
  <tr>
    <td><code>skipUndefinedProperties</code></td>
    <td><code>boolean</code></td>
    <td>如果设置为 true，验证器将跳过验证对象中所有未定义属性的验证。</td>
  </tr>
  <tr>
    <td><code>skipNullProperties</code></td>
    <td><code>boolean</code></td>
    <td>如果设置为 true，验证器将跳过验证对象中所有 null 属性的验证。</td>
  </tr>
  <tr>
    <td><code>skipMissingProperties</code></td>
    <td><code>boolean</code></td>
    <td>如果设置为 true，验证器将跳过验证对象中所有 null 或未定义属性的验证。</td>
  </tr>
  <tr>
    <td><code>whitelist</code></td>
    <td><code>boolean</code></td>
    <td>如果设置为 true，验证器将从验证（返回）对象中剥离任何不使用验证装饰器的属性。</td>
  </tr>
  <tr>
    <td><code>forbidNonWhitelisted</code></td>
    <td><code>boolean</code></td>
    <td>如果设置为 true，验证器将抛出异常，而不是剥离非白名单属性。</td>
  </tr>
  <tr>
    <td><code>forbidUnknownValues</code></td>
    <td><code>boolean</code></td>
    <td>如果设置为 true，尝试验证未知对象会立即失败。</td>
  </tr>
  <tr>
    <td><code>disableErrorMessages</code></td>
    <td><code>boolean</code></td>
    <td>如果设置为 true，验证错误将不会返回给客户端。</td>
  </tr>
  <tr>
    <td><code>errorHttpStatusCode</code></td>
    <td><code>number</code></td>
    <td>此设置允许你指定在出错时使用的异常类型。默认情况下，它抛出 <code>BadRequestException</code>。</td>
  </tr>
  <tr>
    <td><code>exceptionFactory</code></td>
    <td><code>Function</code></td>
    <td>接收验证错误数组并返回要抛出的异常对象。</td>
  </tr>
  <tr>
    <td><code>groups</code></td>
    <td><code>string[]</code></td>
    <td>在验证对象期间使用的组。</td>
  </tr>
  <tr>
    <td><code>always</code></td>
    <td><code>boolean</code></td>
    <td>为装饰器的 <code>always</code> 选项设置默认值。可以在装饰器选项中覆盖默认值。</td>
  </tr>

  <tr>
    <td><code>strictGroups</code></td>
    <td><code>boolean</code></td>
    <td>如果 <code>groups</code> 未给出或为空，则忽略至少有一个组的装饰器。</td>
  </tr>
  <tr>
    <td><code>dismissDefaultMessages</code></td>
    <td><code>boolean</code></td>
    <td>如果设置为 true，验证将不使用默认消息。如果未明确设置，错误消息将始终为 <code>undefined</code>。</td>
  </tr>
  <tr>
    <td><code>validationError.target</code></td>
    <td><code>boolean</code></td>
    <td>指示是否应在 <code>ValidationError</code> 中暴露目标。</td>
  </tr>
  <tr>
    <td><code>validationError.value</code></td>
    <td><code>boolean</code></td>
    <td>指示是否应在 <code>ValidationError</code> 中暴露验证值。</td>
  </tr>
  <tr>
    <td><code>stopAtFirstError</code></td>
    <td><code>boolean</code></td>
    <td>当设置为 true 时，给定属性的验证将在遇到第一个错误后停止。默认为 false。</td>
  </tr>
  <tr>
    <td><code>errorFormat</code></td>
    <td><code>'list' | 'grouped'</code></td>
    <td>指定验证错误消息的格式。<code>'list'</code>（默认）返回错误消息字符串数组。<code>'grouped'</code> 返回一个对象，以属性路径为键、以未修改错误消息数组为值，能够保留自定义验证消息，而不会在前面附加父级路径前缀。</td>
  </tr>
</table>

:::info 注意
在 [class-validator 仓库](https://github.com/typestack/class-validator)中查找有关 `class-validator` 包的更多信息。
:::

#### 自动验证

我们将首先在应用程序级别绑定 `ValidationPipe`，从而确保所有端点都受到保护，不会接收到错误的数据。

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

```

为了测试我们的管道，让我们创建一个基本端点。

```typescript
@Post()
create(@Body() createUserDto: CreateUserDto) {
  return 'This action adds a new user';
}

```

:::info 提示
由于 TypeScript 不存储关于**泛型或接口**的元数据，当你在 DTO 中使用它们时，`ValidationPipe` 可能无法正确验证传入的数据。因此，请考虑在 DTO 中使用具体类。
:::

:::info 提示
在导入 DTO 时，你不能使用仅类型导入，因为这会在运行时被删除，即记住使用 `import { CreateUserDto }` 而不是 `import type { CreateUserDto }`。
:::

现在我们可以在 `CreateUserDto` 中添加一些验证规则。我们使用 `class-validator` 包提供的装饰器来实现这一点，详见[这里](https://github.com/typestack/class-validator#validation-decorators)。通过这种方式，任何使用 `CreateUserDto` 的路由都将自动强制执行这些验证规则。

```typescript
import { IsEmail, IsNotEmpty } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  password: string;
}

```

有了这些规则，如果请求命中我们的端点，且请求正文中包含无效的 `email` 属性，应用程序将自动响应 `400 Bad Request` 代码，以及以下响应正文：

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": ["email must be an email"]
}

```

除了验证请求正文外，`ValidationPipe` 还可以用于其他请求对象属性。想象一下，我们想在端点路径中接受 `:id`。为了确保此请求参数只接受数字，我们可以使用以下构造：

```typescript
@Get(':id')
findOne(@Param() params: FindOneParams) {
  return 'This action returns a user';
}

```

`FindOneParams` 与 DTO 一样，只是一个使用 `class-validator` 定义验证规则的类。它看起来像这样：

```typescript
import { IsNumberString } from 'class-validator';

export class FindOneParams {
  @IsNumberString()
  id: string;
}

```

#### 禁用详细错误

错误消息可以帮助解释请求中的错误内容。然而，某些生产环境更喜欢禁用详细错误。通过向 `ValidationPipe` 传递选项对象来实现这一点：

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    disableErrorMessages: true,
  }),
);

```

因此，详细错误消息将不会显示在响应正文中。

#### 剥离属性

我们的 `ValidationPipe` 还可以过滤掉方法处理程序不应接收的属性。在这种情况下，我们可以**白名单**可接受的属性，任何未包含在白名单中的属性都会自动从结果对象中剥离。例如，如果我们的处理程序期望 `email` 和 `password` 属性，但请求还包括 `age` 属性，则此属性可以自动从结果 DTO 中删除。要启用此行为，请将 `whitelist` 设置为 `true`。

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
  }),
);

```

当设置为 true 时，这将自动删除非白名单属性（验证类中没有任何装饰器的属性）。

或者，你可以在存在非白名单属性时停止处理请求，并向用户返回错误响应。要启用此功能，请将 `forbidNonWhitelisted` 选项属性设置为 `true`，并结合将 `whitelist` 设置为 `true`。

<app-banner-courses></app-banner-courses>

#### 转换负载对象

通过网络传入的负载是普通的 JavaScript 对象。`ValidationPipe` 可以自动将负载转换为根据其 DTO 类类型化的对象。要启用自动转换，请将 `transform` 设置为 `true`。这可以在方法级别完成：

```typescript
@Post()
@UsePipes(new ValidationPipe({ transform: true }))
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}

```

要全局启用此行为，请在全局管道上设置选项：

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    transform: true,
  }),
);

```

启用自动转换选项后，`ValidationPipe` 还将执行基本类型的转换。在以下示例中，`findOne()` 方法接受一个参数，该参数表示提取的 `id` 路径参数：

```typescript
@Get(':id')
findOne(@Param('id') id: number) {
  console.log(typeof id === 'number'); // true
  return 'This action returns a user';
}

```

默认情况下，每个路径参数和查询参数都作为 `string` 通过网络传入。在上面的示例中，我们将 `id` 类型指定为 `number`（在方法签名中）。因此，`ValidationPipe` 将尝试自动将字符串标识符转换为数字。

#### 显式转换

在上一节中，我们展示了 `ValidationPipe` 如何根据预期类型隐式转换查询和路径参数。但是，此功能需要启用自动转换。

或者（禁用自动转换），你可以使用 `ParseIntPipe` 或 `ParseBoolPipe` 显式转换值（注意不需要 `ParseStringPipe`，因为如前所述，每个路径参数和查询参数默认都作为 `string` 通过网络传入）。

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

:::info 提示
`ParseIntPipe` 和 `ParseBoolPipe` 从 `@nestjs/common` 包导出。
:::

#### 映射类型

在构建 **CRUD**（创建/读取/更新/删除）等功能时，在基础实体类型上构建变体通常很有用。Nest 提供了几个实用函数来执行类型转换，使此任务更加方便。

> **警告** 如果你的应用程序使用 `@nestjs/swagger` 包，请参阅[此章节](/openapi/mapped-types)以获取有关映射类型的更多信息。同样，如果你使用 `@nestjs/graphql` 包，请参阅[此章节](/graphql/mapped-types)。这两个包都严重依赖类型，因此需要使用不同的导入。因此，如果你使用 `@nestjs/mapped-types`（而不是适当的包，根据你的应用程序类型选择 `@nestjs/swagger` 或 `@nestjs/graphql`），你可能会遇到各种未记录的副作用。

在构建输入验证类型（也称为 DTO）时，在同一类型上构建**创建**和**更新**变体通常很有用。例如，**创建**变体可能需要所有字段，而**更新**变体可能使所有字段可选。

Nest 提供了 `PartialType()` 实用函数来简化此任务并最小化样板代码。

`PartialType()` 函数返回一个类型（类），其中输入类型的所有属性都设置为可选。例如，假设我们有一个**创建**类型如下：

```typescript
export class CreateCatDto {
  name: string;
  age: number;
  breed: string;
}

```

默认情况下，所有这些字段都是必需的。要创建一个具有相同字段但每个字段都是可选的类型，请使用 `PartialType()` 传递类引用（`CreateCatDto`）作为参数：

```typescript
export class UpdateCatDto extends PartialType(CreateCatDto) {}

```

:::info 提示
`PartialType()` 函数从 `@nestjs/mapped-types` 包导入。
:::

`PickType()` 函数通过从输入类型中选择一组属性来构造新类型（类）。例如，假设我们从一个类型开始：

```typescript
export class CreateCatDto {
  name: string;
  age: number;
  breed: string;
}

```

我们可以使用 `PickType()` 实用函数从此类中选择一组属性：

```typescript
export class UpdateCatAgeDto extends PickType(CreateCatDto, ['age'] as const) {}

```

:::info 提示
`PickType()` 函数从 `@nestjs/mapped-types` 包导入。
:::

`OmitType()` 函数通过从输入类型中选择所有属性然后删除特定键集来构造类型。例如，假设我们从一个类型开始：

```typescript
export class CreateCatDto {
  name: string;
  age: number;
  breed: string;
}

```

我们可以生成一个派生类型，该类型具有除 `name` 之外的所有属性，如下所示。在此构造中，`OmitType` 的第二个参数是属性名称数组。

```typescript
export class UpdateCatDto extends OmitType(CreateCatDto, ['name'] as const) {}

```

:::info 提示
`OmitType()` 函数从 `@nestjs/mapped-types` 包导入。
:::

`IntersectionType()` 函数将两种类型组合成一种新类型（类）。例如，假设我们从两种类型开始：

```typescript
export class CreateCatDto {
  name: string;
  breed: string;
}

export class AdditionalCatInfo {
  color: string;
}

```

我们可以生成一个新类型，该类型组合了两种类型中的所有属性。

```typescript
export class UpdateCatDto extends IntersectionType(
  CreateCatDto,
  AdditionalCatInfo,
) {}

```

:::info 提示
`IntersectionType()` 函数从 `@nestjs/mapped-types` 包导入。
:::

类型映射实用函数是可组合的。例如，以下代码将生成一个类型（类），该类型具有 `CreateCatDto` 类型的所有属性（除了 `name`），并且这些属性将设置为可选：

```typescript
export class UpdateCatDto extends PartialType(
  OmitType(CreateCatDto, ['name'] as const),
) {}

```

#### 解析和验证数组

TypeScript 不存储关于泛型或接口的元数据，因此当你在 DTO 中使用它们时，`ValidationPipe` 可能无法正确验证传入的数据。例如，在以下代码中，`createUserDtos` 将无法正确验证：

```typescript
@Post()
createBulk(@Body() createUserDtos: CreateUserDto[]) {
  return 'This action adds new users';
}

```

要验证数组，请创建一个包含包装数组的属性的专用类，或使用 `ParseArrayPipe`。

```typescript
@Post()
createBulk(
  @Body(new ParseArrayPipe({ items: CreateUserDto }))
  createUserDtos: CreateUserDto[],
) {
  return 'This action adds new users';
}

```

此外，`ParseArrayPipe` 在解析查询参数时可能很有用。让我们考虑一个 `findByIds()` 方法，该方法根据作为查询参数传递的标识符返回用户。

```typescript
@Get()
findByIds(
  @Query('ids', new ParseArrayPipe({ items: Number, separator: ',' }))
  ids: number[],
) {
  return 'This action returns users by ids';
}

```

此构造验证来自 HTTP `GET` 请求的传入查询参数，如下所示：

```bash
GET /?ids=1,2,3

```

#### WebSockets 和微服务

虽然本章展示了使用 HTTP 样式应用程序（例如 Express 或 Fastify）的示例，但 `ValidationPipe` 对 WebSockets 和微服务的工作方式相同，无论使用哪种传输方法。

#### 了解更多

在[这里](https://github.com/typestack/class-validator)阅读有关 `class-validator` 包提供的自定义验证器、错误消息和可用装饰器的更多信息。
