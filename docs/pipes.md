<!-- 此文件从 content/pipes.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T07:30:00.994Z -->
<!-- 源文件: content/pipes.md -->
<!-- 源哈希: c32140ae8355a3ef6e7b9f2cefd25990 -->

### 管道

管道是一个使用 `@Injectable()` 装饰器标注的类，它实现了 `PipeTransform` 接口。

<figure>
  <img class="illustrative-image" src="/assets/Pipe_1.png" />
</figure>

管道有两个典型的用例：

- **转换**：将输入数据转换为所需的形式（例如，从字符串转换为整数）
- **验证**：评估输入数据，如果有效，则原样传递；否则，抛出异常

在这两种情况下，管道都作用于 <a href="controllers#路由参数">控制器路由处理程序</a>正在处理的参数。Nest 在方法被调用之前立即插入一个管道；管道接收传递给该方法的参数并对其进行操作。任何转换或验证都在此时进行，之后路由处理程序会使用（可能已转换的）参数被调用。

Nest 自带许多开箱即用的内置管道，你也可以构建自己的管道。本章介绍内置管道，并展示如何将它们绑定到路由处理程序。然后，通过几个自定义管道来展示如何从零开始构建一个管道。

> info **提示** 管道在异常区域内运行。管道抛出的异常由异常层处理（全局异常过滤器和应用于当前上下文的任何 [exception filters](/overview/exception-filters)）。当管道抛出异常时，路由处理程序不会被执行。这使得管道成为在系统边界处验证从外部来源进入应用程序的数据的推荐位置。

#### 内置管道

Nest 开箱即用地提供以下管道，它们都从 `@nestjs/common` 包中导出：

- `ValidationPipe`
- `StandardSchemaValidationPipe`
- `ParseIntPipe`
- `ParseFloatPipe`
- `ParseBoolPipe`
- `ParseArrayPipe`
- `ParseUUIDPipe`
- `ParseEnumPipe`
- `DefaultValuePipe`
- `ParseFilePipe`
- `ParseDatePipe`

让我们从 `ParseIntPipe` 开始。它是 **转换** 用例的一个示例：该管道确保将路由处理程序参数转换为 JavaScript 整数，如果转换失败则抛出异常。在本章后面，我们将构建一个简单的 `ParseIntPipe` 自定义实现。下面的技术也适用于其他内置转换管道（`ParseBoolPipe`、`ParseFloatPipe`、`ParseEnumPipe`、`ParseArrayPipe`、`ParseDatePipe` 和 `ParseUUIDPipe`），本章将它们统称为 `Parse*` 管道。

#### 绑定管道

要使用管道，请将管道类的实例绑定到适当的上下文。在 `ParseIntPipe` 示例中，我们希望将管道与特定的路由处理程序方法关联起来，并确保它在方法被调用之前运行。以下构造可以实现这一点；我们将其称为在方法参数级别绑定管道：

```typescript
@Get(':id')
async findOne(@Param('id', ParseIntPipe) id: number) {
  return this.catsService.findOne(id);
}

```

这保证了两种结果之一：要么 `findOne()` 接收到的参数是一个数字（正如 `this.catsService.findOne()` 所期望的），要么在路由处理程序被调用之前抛出异常。

例如，假设按如下方式调用路由：

```bash
GET localhost:3000/abc

```

Nest 抛出异常，产生以下响应：

```json
{
  "statusCode": 400,
  "message": "Validation failed (numeric string is expected)",
  "error": "Bad Request"
}

```

该异常阻止了 `findOne()` 方法体的执行。

在上面的示例中，我们传递的是一个类（`ParseIntPipe`），而不是实例。这将实例化留给框架处理，并启用了依赖注入。与守卫和异常过滤器一样，你也可以改为传递一个就地实例，当你想要通过传递选项来自定义内置管道的行为时，这很有用：

```typescript
@Get(':id')
async findOne(
  @Param('id', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_ACCEPTABLE }))
  id: number,
) {
  return this.catsService.findOne(id);
}

```

其他转换管道（所有 **Parse\*** 管道）以相同的方式绑定。它们适用于路由参数、查询字符串参数和请求体值。

例如，使用查询字符串参数：

```typescript
@Get()
async findOne(@Query('id', ParseIntPipe) id: number) {
  return this.catsService.findOne(id);
}

```

以下示例使用 `ParseUUIDPipe` 来验证字符串参数是否为 UUID：

```typescript
@Get(':uuid')
async findOne(@Param('uuid', new ParseUUIDPipe()) uuid: string) {
  return this.catsService.findOne(uuid);
}

```

> info **提示** 默认情况下，`ParseUUIDPipe` 接受任何版本的 UUID（版本 1 到 8、Nil 和 Max UUID）。要要求特定版本，请传递 `version` 选项（`'1'`、`'2'`、`'3'`、`'4'`、`'5'`、`'6'`、`'7'` 或 `'8'`）。从 NestJS v12.1.2 开始，`version` 选项也接受这些版本作为数字（例如 `7`），以及 `'all'` 来接受任何版本，与省略 `version` 相同。`UUIDVersion` 类型描述了这些值，并从 `@nestjs/common` 中导出。

绑定验证管道的工作方式略有不同；我们将在本章后面介绍。

> info **提示** 有关验证管道的丰富示例，请参阅 [Validation techniques](/techniques/validation)。

#### 自定义管道

如前所述，你可以构建自己的管道。尽管 Nest 提供了健壮的内置 `ParseIntPipe` 和 `ValidationPipe` 实现，但让我们从零开始构建每个的简单版本，以了解自定义管道是如何构建的。

我们从一个简单的 `ValidationPipe` 开始。最初，它接收一个输入值并原样返回，表现得像一个恒等函数。

```typescript title="validation.pipe.ts"
import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';

@Injectable()
export class ValidationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    return value;
  }
}

```

> info **提示** `PipeTransform<T, R>` 是每个管道都必须实现的泛型接口。`T` 表示输入 `value` 的类型，`R` 表示 `transform()` 方法的返回类型。

每个管道都必须实现 `transform()` 方法，以满足 `PipeTransform` 接口契约。该方法有两个参数：

- `value`
- `metadata`

`value` 参数是当前正在处理的方法参数（在路由处理程序接收它之前），而 `metadata` 是该参数的元数据。元数据对象具有以下属性：

```typescript
export interface ArgumentMetadata {
  type: 'body' | 'query' | 'param' | 'custom';
  metatype?: Type<unknown>;
  data?: string;
  schema?: StandardSchemaV1;
}

```

这些属性描述了正在处理的参数：

<table>
  <tr>
    <td>
      <code>type</code>
    </td>
    <td>表示该参数是 body
      (<code>@Body()</code>)、query
      (<code>@Query()</code>)、param
      (<code>@Param()</code>)，还是自定义参数（参见
      <a routerLink="/custom-decorators">自定义装饰器</a>）。</td>
  </tr>
  <tr>
    <td>
      <code>metatype</code>
    </td>
    <td>
      参数的元类型，例如
      <code>String</code>。如果你在路由处理程序签名中省略了类型声明，或者使用原生 JavaScript，则该值为
      <code>undefined</code>。
    </td>
  </tr>
  <tr>
    <td>
      <code>data</code>
    </td>
    <td>传递给装饰器的字符串，例如
      <code>@Body('string')</code>。如果你没有向装饰器传递字符串，例如 <code>@Body()</code>，则该值为
      <code>undefined</code>。</td>
  </tr>
  <tr>
    <td>
      <code>schema</code>
    </td>
    <td>
      通过参数装饰器选项（例如 <code>@Body({ schema })</code> 或 <code>@Param('id', { schema })</code>）附加的、兼容 Standard Schema 的模式。如果没有附加模式，则该值为 <code>undefined</code>。
    </td>
  </tr>
</table>

> warning **警告** TypeScript 接口在转译过程中会消失。如果方法参数的类型被声明为接口而不是类，那么 `metatype` 的值就是 `Object`。

> info **提示** 内置的 `StandardSchemaValidationPipe` 使用 `schema` 字段，借助任何兼容 Standard Schema 的库来验证参数。没有模式的参数会原样通过。

#### 基于模式的验证

> info **提示** 以下各节将从零开始构建验证管道，以展示管道的工作方式。在生产环境中进行基于模式的验证时，请改用内置的 `StandardSchemaValidationPipe`。它可与 Zod、Valibot、ArkType 以及任何其他兼容 [Standard Schema](https://standardschema.dev/) 的库配合使用，并会读取你通过参数装饰器（例如 `@Body()` 和 `@Param()`）的 `schema` 选项附加的模式。详情请参见 [Schema-based validation](/techniques/validation#使用内置的-standardschemavalidationpipe)。

让我们把验证管道做得更有用一些。考虑 `CatsController` 的 `create()` 方法：我们希望在运行服务方法之前，确保 POST body 对象是有效的。

```typescript
@Post()
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}

```

`createCatDto` body 参数的类型为 `CreateCatDto`：

```typescript title="create-cat.dto.ts"
export class CreateCatDto {
  name: string;
  age: number;
  breed: string;
}

```

对 `create()` 方法的每个请求都必须包含有效的 body，因此我们需要验证 `createCatDto` 对象的三个成员。我们可以在路由处理程序内部完成这项工作，但这会违反**单一职责原则**（SRP）。

另一种方法是创建一个**验证器类**，并将任务委托给它。其缺点是我们必须在每个方法的开头记得调用该验证器。

那验证中间件呢？这或许可行，但无法创建可在整个应用程序的每个上下文中使用的**通用中间件**。中间件并不知道**执行上下文**，包括将要调用的处理程序及其参数。

管道正是为此用例而设计的，因此我们将改进我们的验证管道。

<app-banner-courses></app-banner-courses>

#### 对象模式验证

有几种方法可以以简洁、[DRY](https://en.wikipedia.org/wiki/Don%27t_repeat_yourself) 的方式验证对象。这里我们采用一种常见的方法——**基于模式**的验证。

[Zod](https://zod.dev/) 库允许你使用可读性强的 API 来定义模式。让我们构建一个使用 Zod 模式的验证管道。

首先安装所需的包：

```bash
$ npm install --save zod

```

下面的类将模式作为构造函数参数接收，并调用 `schema.parse()`，它会根据该模式验证传入的参数。

如前所述，**验证管道**要么返回该值，要么抛出异常。该管道返回模式解析后的值，如果验证失败则抛出 `BadRequestException`。

下一节将展示如何使用 `@UsePipes()` 装饰器为给定的路由处理程序提供合适的模式。这使得验证管道可以跨上下文复用，这正是我们想要实现的目标。

```typescript
import { PipeTransform, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { ZodType } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodType) {}

  transform(value: unknown, metadata: ArgumentMetadata) {
    try {
      const parsedValue = this.schema.parse(value);
      return parsedValue;
    } catch (error) {
      throw new BadRequestException('Validation failed');
    }
  }
}

```

#### 绑定验证管道

前面我们看到了如何绑定转换管道（例如 `ParseIntPipe` 以及 `Parse*` 管道中的其余管道）。绑定验证管道同样简单直接。

在本例中，我们希望在方法级别绑定该管道。要在我们的示例中使用 `ZodValidationPipe`，我们需要：

1. 创建 `ZodValidationPipe` 的实例
2. 将特定上下文的 Zod 模式传递给该管道的构造函数
3. 将该管道绑定到方法上

下面是一个 Zod 模式示例：

```typescript
import { z } from 'zod';

export const createCatSchema = z.object({
  name: z.string(),
  age: z.number(),
  breed: z.string(),
});

export type CreateCatDto = z.infer<typeof createCatSchema>;

```

使用 `@UsePipes()` 装饰器绑定该管道：

```typescript title="cats.controller.ts"
@Post()
@UsePipes(new ZodValidationPipe(createCatSchema))
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}

```

> info **提示** `@UsePipes()` 装饰器是从 `@nestjs/common` 包中导入的。

你也可以将 `ZodValidationPipe` 与内置管道一起绑定到特定参数上。下面的示例使用 `ParseIntPipe` 验证 `id` 路由参数，并使用 `ZodValidationPipe` 验证请求体：

```typescript
@Put('/:id')
async update(
  @Param('id', ParseIntPipe) id: number,
  @Body(new ZodValidationPipe(createCatSchema)) body: CreateCatDto
): Promise<void> {
  this.catsService.update(id, body);
}

```

> warning **警告** `zod` 库要求在你的 `tsconfig.json` 文件中启用 `strictNullChecks` 编译器选项。

#### 类验证器

> warning **警告** 本节中的技术需要 TypeScript，如果你的应用是用原生 JavaScript 编写的，则无法使用这些技术。

本节介绍验证技术的另一种实现方式。

Nest 与 [class-validator](https://github.com/typestack/class-validator) 库配合良好，该库提供了基于装饰器的验证。基于装饰器的验证与 Nest 的**管道**能力非常契合，因为管道可以访问被处理参数的 `metatype`。在开始之前，请安装所需的包：

```bash
$ npm i --save class-validator class-transformer

```

安装完成后，向 `CreateCatDto` 类添加一些装饰器。这体现了该技术的一个显著优势：`CreateCatDto` 类仍然是 POST 请求体对象的唯一数据源，因此你不需要单独创建一个验证类。

```typescript title="create-cat.dto.ts"
import { IsString, IsInt } from 'class-validator';

export class CreateCatDto {
  @IsString()
  name: string;

  @IsInt()
  age: number;

  @IsString()
  breed: string;
}

```

> info **提示** 在 [class-validator documentation](https://github.com/typestack/class-validator#用法) 中阅读更多关于 class-validator 装饰器的内容。

现在我们可以创建一个使用这些装饰器的 `ValidationPipe` 类。

```typescript title="validation.pipe.ts"
import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class ValidationPipe implements PipeTransform<any> {
  async transform(value: any, { metatype }: ArgumentMetadata) {
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }
    const object = plainToInstance(metatype, value);
    const errors = await validate(object);
    if (errors.length > 0) {
      throw new BadRequestException('Validation failed');
    }
    return value;
  }

  private toValidate(metatype: Function): boolean {
    const types: Function[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }
}

```

> info **提示** 这个管道是刻意保持简单的。你不必自己构建一个通用的验证管道：Nest 开箱即用地提供了一个功能更强大的 `ValidationPipe`，本节末尾会对此进行介绍。

> warning **注意** 上面的代码使用了 [class-transformer](https://github.com/typestack/class-transformer) 库，该库由 **class-validator** 库的同一作者开发，因此两者配合得很好。

让我们逐步分析这段代码。首先，`transform()` 方法被标记为 `async`。这是可行的，因为 Nest 同时支持同步和**异步**管道。我们将该方法设为 `async`，因为某些 class-validator 验证 [can be async](https://github.com/typestack/class-validator#custom-validation-classes)（它们返回 promise）。

接下来，我们使用解构从 `ArgumentMetadata` 对象中提取 `metatype` 字段。这是接收完整的 `ArgumentMetadata` 然后在单独的语句中赋值给 `metatype` 变量的简写形式。

辅助方法 `toValidate()` 在被处理的参数是原生 JavaScript 类型时跳过验证。原生类型无法附加验证装饰器，因此没有理由对它们进行验证。

接下来，我们使用 class-transformer 函数 `plainToInstance()` 将普通的 JavaScript 参数对象转换为有类型的对象，以便我们可以应用验证。这是必要的，因为传入的 POST 请求体在从网络请求反序列化时**不包含任何类型信息**（底层平台，例如 Express，就是这样工作的）。由于 class-validator 依赖于之前定义在 DTO 上的验证装饰器，我们将传入的请求体转换为被装饰类的实例，而不是验证一个普通对象。

最后，由于这是一个**验证管道**，它要么原样返回值，要么抛出异常。

最后一步是绑定 `ValidationPipe`。管道可以是参数作用域、方法作用域、控制器作用域或全局作用域的。前面，我们使用 `@UsePipes()` 在方法级别绑定了基于 Zod 的验证管道。在下面的示例中，我们将管道实例绑定到路由处理器的 `@Body()` 装饰器上，以便该管道验证 POST 请求体。

```typescript title="cats.controller.ts"
@Post()
async create(
  @Body(new ValidationPipe()) createCatDto: CreateCatDto,
) {
  this.catsService.create(createCatDto);
}

```

当验证逻辑只涉及一个参数时，参数作用域的管道非常有用。

#### 全局作用域管道

由于 `ValidationPipe` 被设计得尽可能通用，它作为**全局作用域**管道最为有用，可应用于整个应用程序中的每个路由处理器。

```typescript title="main.ts"
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

> warning **注意** 在混合应用程序中，`useGlobalPipes()` 默认不会为已连接的微服务设置管道（参见 [Hybrid application](/faq/hybrid-application) 以更改此行为）。在标准（非混合）微服务应用程序中，`useGlobalPipes()` 确实会全局挂载管道。

在任何模块之外注册的全局管道（使用 `useGlobalPipes()`，如上面的示例所示）无法注入依赖，因为绑定发生在任何模块的上下文之外。要解决这个问题，你可以使用以下构造**直接从任何模块**注册全局管道：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';

@Module({
  providers: [
    {
      provide: APP_PIPE,
      useClass: ValidationPipe,
    },
  ],
})
export class AppModule {}

```

> info **提示** 当你使用这种方法为管道执行依赖注入时，无论你在哪个模块中注册它，该管道都是全局的。请将它注册在定义该管道（上面示例中的 `ValidationPipe`）的模块中。`useClass` 并不是注册自定义提供者的唯一方式；在 [Custom providers](/fundamentals/dependency-injection) 中了解更多。

#### 内置的 ValidationPipe

你不必自己构建一个通用的验证管道：Nest 开箱即用地提供了 `ValidationPipe`。内置的 `ValidationPipe` 提供了比本章构建的示例更多的选项，本章的示例保持简单是为了说明自定义管道的机制。对于基于模式的验证，Nest 还提供了内置的 `StandardSchemaValidationPipe`。有关完整细节和大量示例，请参见 [Validation techniques](/techniques/validation)。

#### 转换用例

验证并不是自定义管道的唯一用例。如本章开头所述，管道还可以将输入数据**转换**为所需的格式。这是可行的，因为从 `transform()` 方法返回的值会替换参数的先前值。

这在什么时候有用？有时从客户端传递过来的数据需要在路由处理器能够处理它之前进行更改（例如，从字符串转换为整数）。一些必需的字段也可能缺失，而你可能希望应用默认值。**转换管道**通过在客户端请求和路由处理器之间插入一个处理函数来执行这些功能。

下面是一个简单的 `ParseIntPipe`，它将字符串解析为整数。（如上所述，Nest 有一个更复杂的内置 `ParseIntPipe`；这是一个自定义转换管道的简单示例。）

```typescript title="parse-int.pipe.ts"
import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';

@Injectable()
export class ParseIntPipe implements PipeTransform<string, number> {
  transform(value: string, metadata: ArgumentMetadata): number {
    const val = parseInt(value, 10);
    if (isNaN(val)) {
      throw new BadRequestException('Validation failed');
    }
    return val;
  }
}

```

然后我们可以将这个管道绑定到选定的参数上：

```typescript
@Get(':id')
async findOne(@Param('id', new ParseIntPipe()) id) {
  return this.catsService.findOne(id);
}

```

另一个有用的转换是使用请求中提供的 ID 在数据库中查找**已存在的用户**实体：

```typescript
@Get(':id')
findOne(@Param('id', UserByIdPipe) userEntity: UserEntity) {
  return userEntity;
}

```

我们将这个管道的实现留给读者。与所有其他转换管道一样，它接收一个输入值（一个 `id`）并返回一个输出值（一个 `UserEntity` 对象）。通过将样板代码从路由处理器中移出并放入可复用的管道中，这使你的代码更具声明性且 [DRY](https://en.wikipedia.org/wiki/Don%27t_repeat_yourself)。

#### 提供默认值

默认情况下，`Parse*` 管道期望参数的值是已定义的，当它们接收到 `null` 或 `undefined` 时会抛出异常（除非你将其 `optional` 选项设置为 `true`）。为了让端点能够处理缺失的查询字符串参数，请提供一个默认值，该默认值会在 `Parse*` 管道对其进行操作之前应用。`DefaultValuePipe` 正是为此目的而设计的。如下所示，在相关的 `Parse*` 管道之前，在 `@Query()` 装饰器中实例化一个 `DefaultValuePipe`：

```typescript
@Get()
async findAll(
  @Query('activeOnly', new DefaultValuePipe(false), ParseBoolPipe) activeOnly: boolean,
  @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
) {
  return this.catsService.findAll({ activeOnly, page });
}

```