<!-- 此文件从 content/openapi/types-and-parameters.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:58:27.857Z -->
<!-- 源文件: content/openapi/types-and-parameters.md -->
<!-- 源哈希: bb1a4fd1f720406784c8cb93f93f6d5e -->

### 类型和参数

`SwaggerModule` 在路由处理程序中搜索所有 `@Body()`、`@Query()`、`@Param()` 和 `@Headers()` 装饰器以生成 API 文档。它还使用反射来创建相应的模型定义。考虑以下代码：

```typescript
@Post()
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}

```

> info **提示** 要明确设置 body 定义，请使用 `@ApiBody()` 装饰器（从 `@nestjs/swagger` 包导入）。

基于 `CreateCatDto`，Swagger UI 显示以下模型定义：

<figure><img src="/assets/swagger-dto.png" /></figure>

尽管类声明了几个属性，但定义是空的。要使类属性对 `SwaggerModule` 可见，请使用 `@ApiProperty()` 装饰器进行注解，或使用 [CLI plugin](/openapi/cli-plugin)，它会自动完成此操作：

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class CreateCatDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  age: number;

  @ApiProperty()
  breed: string;
}

```

> info **提示** 与手动注解每个属性相比，考虑使用 [Swagger plugin](/openapi/cli-plugin)，它会为您添加这些注解。

打开浏览器并验证生成的 `CreateCatDto` 模型：

<figure><img src="/assets/swagger-dto2.png" /></figure>

`@ApiProperty()` 装饰器还允许您设置各种 [Schema Object](https://swagger.io/specification/#schemaObject) 属性：

```typescript
@ApiProperty({
  description: 'The age of a cat',
  minimum: 1,
  default: 1,
})
age: number;

```

> info **提示** 与明确指定 `{{"@ApiProperty({ required: false })"}}` 相比，您可以使用 `@ApiPropertyOptional()` 简写装饰器。

要明确设置属性的类型，请使用 `type` 键：

```typescript
@ApiProperty({
  type: Number,
})
age: number;

```

#### 数组

当属性是数组时，必须手动指示数组类型，如下所示：

```typescript
@ApiProperty({ type: [String] })
names: string[];

```

> info **提示** 考虑使用 [Swagger plugin](/openapi/cli-plugin)，它会自动检测数组。

要么将类型作为数组的第一个元素传递（如上所示），要么将 `isArray` 属性设置为 `true`。

<app-banner-enterprise></app-banner-enterprise>

#### 循环依赖

当类之间存在循环依赖时，请使用一个延迟函数为 `SwaggerModule` 提供类型信息：

```typescript
@ApiProperty({ type: () => Node })
node: Node;

```

> info **提示** 考虑使用 [Swagger plugin](/openapi/cli-plugin)，它会自动检测循环依赖。

#### 泛型和接口

TypeScript 不存储关于泛型或接口的元数据，因此当您在 DTO 中使用它们时，运行时 `SwaggerModule` 可能无法正确生成模型定义。例如，Swagger 模块无法正确检查以下代码：

```typescript
createBulk(@Body() usersDto: CreateUserDto[])

```

为克服此限制，请明确设置类型：

```typescript
@ApiBody({ type: [CreateUserDto] })
createBulk(@Body() usersDto: CreateUserDto[])

```

#### 枚举

要识别一个 `enum`，请将 `@ApiProperty()` 的 `enum` 属性设置为值的数组：

```typescript
@ApiProperty({ enum: ['Admin', 'Moderator', 'User']})
role: UserRole;

```

或者，按如下方式定义一个实际的 TypeScript 枚举：

```typescript
export enum UserRole {
  Admin = 'Admin',
  Moderator = 'Moderator',
  User = 'User',
}

```

然后，您可以将枚举直接与 `@Query()` 参数装饰器结合使用，并与 `@ApiQuery()` 装饰器一起使用：

```typescript
@ApiQuery({ name: 'role', enum: UserRole })
async filterByRole(@Query('role') role: UserRole = UserRole.User) {}

```

<figure><img src="/assets/enum_query.gif" /></figure>

当 `isArray` 设置为 `true` 时，可以在 **多选** 中选择 `enum` 值：

<figure><img src="/assets/enum_query_array.gif" /></figure>

#### 枚举模式

默认情况下，`enum` 属性将一个原始 [enum](https://swagger.io/docs/specification/data-models/enums/) 定义添加到 `parameter`：

```yaml
- breed:
    type: 'string'
    enum:
      - Persian
      - Tabby
      - Siamese

```

此规范适用于大多数情况。但是，如果您使用一个将规范作为 **输入** 并生成 **客户端** 代码的工具，生成的代码中可能包含重复的 `enums`。考虑以下代码片段：

```typescript
// generated client-side code
export class CatDetail {
  breed: CatDetailEnum;
}

export class CatInformation {
  breed: CatInformationEnum;
}

export enum CatDetailEnum {
  Persian = 'Persian',
  Tabby = 'Tabby',
  Siamese = 'Siamese',
}

export enum CatInformationEnum {
  Persian = 'Persian',
  Tabby = 'Tabby',
  Siamese = 'Siamese',
}

```

> info **提示** 上述片段是使用名为 [NSwag](https://github.com/RicoSuter/NSwag) 的工具生成的。

结果包含两个相同的 `enums`。为解决此问题，请在装饰器中将 `enumName` 与 `enum` 属性一起传递：

```typescript
export class CatDetail {
  @ApiProperty({ enum: CatBreed, enumName: 'CatBreed' })
  breed: CatBreed;
}

```

`enumName` 属性使 `@nestjs/swagger` 将 `CatBreed` 转换为其自身的 `schema`，从而使 `CatBreed` 枚举可重用。规范如下所示：

```yaml
CatDetail:
  type: 'object'
  properties:
    ...
    - breed:
        schema:
          $ref: '#/components/schemas/CatBreed'
CatBreed:
  type: string
  enum:
    - Persian
    - Tabby
    - Siamese

```

> info **提示** `@ApiQuery()` 和 `@ApiParam()` 装饰器还接受 `enumName` 与 `enum` 一起。

#### 属性值示例

要为属性设置单个示例，请使用 `example` 键：

```typescript
@ApiProperty({
  example: 'persian',
})
breed: string;

```

要提供多个示例，请使用 `examples` 键，并传递一个结构如下的对象：

```typescript
@ApiProperty({
  examples: {
    Persian: { value: 'persian' },
    Tabby: { value: 'tabby' },
    Siamese: { value: 'siamese' },
    'Scottish Fold': { value: 'scottish_fold' },
  },
})
breed: string;

```

#### 原始定义

在某些情况下，例如深度嵌套的数组或矩阵，您可能需要手动定义类型：

```typescript
@ApiProperty({
  type: 'array',
  items: {
    type: 'array',
    items: {
      type: 'number',
    },
  },
})
coords: number[][];

```

您也可以指定原始对象模式：

```typescript
@ApiProperty({
  type: 'object',
  properties: {
    name: {
      type: 'string',
      example: 'Error'
    },
    status: {
      type: 'number',
      example: 400
    }
  },
  required: ['name', 'status']
})
rawDefinition: Record<string, any>;

```

要在控制器类中手动定义输入/输出内容，请使用 `schema` 属性：

```typescript
@ApiBody({
  schema: {
    type: 'array',
    items: {
      type: 'array',
      items: {
        type: 'number',
      },
    },
  },
})
async create(@Body() coords: number[][]) {}

```

#### 额外模型

要定义控制器不直接引用但 Swagger 模块应检查的附加模型，请使用 `@ApiExtraModels()` 装饰器：

```typescript
@ApiExtraModels(ExtraModel)
export class CreateCatDto {}

```

> info **提示** 对于特定模型类，只需使用 `@ApiExtraModels()` 一次即可。

或者，将包含 `extraModels` 属性的选项对象传递给 `SwaggerModule.createDocument()` 方法：

```typescript
const documentFactory = () =>
  SwaggerModule.createDocument(app, options, {
    extraModels: [ExtraModel],
  });

```

要获取模型引用（`$ref`），请使用 `getSchemaPath(ExtraModel)` 函数：

```typescript
'application/vnd.api+json': {
   schema: { $ref: getSchemaPath(ExtraModel) },
},

```

#### oneOf, anyOf, allOf

要组合模式，请使用 `oneOf`、`anyOf` 或 `allOf` 关键字（参见 Swagger 文档中的 [oneOf, anyOf, allOf, not](https://swagger.io/docs/specification/data-models/oneof-anyof-allof-not/)）：

```typescript
@ApiProperty({
  oneOf: [
    { $ref: getSchemaPath(Cat) },
    { $ref: getSchemaPath(Dog) },
  ],
})
pet: Cat | Dog;

```

要定义一个多态数组（即成员跨越多个模式的数组），请使用原始定义（参见上文）手动定义您的类型：

```typescript
type Pet = Cat | Dog;

@ApiProperty({
  type: 'array',
  items: {
    oneOf: [
      { $ref: getSchemaPath(Cat) },
      { $ref: getSchemaPath(Dog) },
    ],
  },
})
pets: Pet[];

```

> info **提示** `getSchemaPath()` 函数是从 `@nestjs/swagger` 导入的。

`Cat` 和 `Dog` 都必须作为带有 `@ApiExtraModels()` 装饰器（在类级别）的额外模型定义。

#### 模式名称和描述

生成的模式名称基于原始模型类的名称（例如，`CreateCatDto` 模型生成一个 `CreateCatDto` 模式）。要更改模式名称，请使用 `@ApiSchema()` 装饰器：

```typescript
@ApiSchema({ name: 'CreateCatRequest' })
class CreateCatDto {}

```

上述模型被翻译成 `CreateCatRequest` 模式。

默认情况下，生成的模式没有描述。要添加描述，请使用 `description` 属性：

```typescript
@ApiSchema({ description: 'Description of the CreateCatDto schema' })
class CreateCatDto {}

```

描述随后包含在 模式 中：

```yaml
schemas:
  CreateCatDto:
    type: object
    description: Description of the CreateCatDto schema

```

`@ApiSchema()` 还接受适用于整个 模式 的关键字（在 `@nestjs/swagger` 12.1.3 及更高版本中）：`title`, `deprecated`, `example`, `examples`, `externalDocs`, `xml`, `discriminator`, `readOnly`, `writeOnly`, `nullable`, `additionalProperties`, `patternProperties`, `minProperties` 和 `maxProperties`。它们会原样复制到生成的 模式 中。例如，要将模型标记为已弃用，并说明它不接受声明之外的任何属性：

```typescript
@ApiSchema({ deprecated: true, additionalProperties: false })
class LegacyCatDto {
  @ApiProperty()
  name: string;
}

```

生成的 模式 随后包含这两个关键字：

```yaml
schemas:
  LegacyCatDto:
    type: object
    properties:
      name:
        type: string
    deprecated: true
    additionalProperties: false
    required:
      - name

```