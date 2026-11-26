<!-- 此文件从 content/openapi/mapped-types.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:58:34.990Z -->
<!-- 源文件: content/openapi/mapped-types.md -->
<!-- 源哈希: f05dcc2d42ac64571213a6791a8d2d83 -->

### 映射类型

在构建 **CRUD** (创建/读取/更新/删除) 等功能时，通常需要构建基础实体类型的变体。Nest 提供了几个执行类型转换的实用函数，使此任务更加便捷。

#### Partial

在构建输入 **验证** 类型（也称为 **DTO**）时，通常需要在同一类型上构建 **创建** 和 **更新** 变体。例如，**创建** 变体可能需要所有字段，而 **更新** 变体可能使所有字段可选。

Nest 提供了 `PartialType()` 实用函数，使此任务更容易，并最大限度地减少样板代码。

`PartialType()` 函数返回一个类型（类），其中输入类型的全部属性都被设置为可选。例如，假设您有一个如下的 **创建** 类型：

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

默认情况下，所有这些字段都是必需的。要创建一个具有相同字段但每个字段都可选的类型，请使用 `PartialType()` 并将类引用（`CreateCatDto`）作为参数传递：

```typescript
export class UpdateCatDto extends PartialType(CreateCatDto) {}

```

> info **提示** `PartialType()` 函数是从 `@nestjs/swagger` 包导入的。

#### Pick

`PickType()` 函数通过从输入类型中选取一组属性来构建一个新的类型（类）。例如，假设您从如下类型开始：

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

您可以使用 `PickType()` 实用函数从该类中选取一组属性：

```typescript
export class UpdateCatAgeDto extends PickType(CreateCatDto, ['age'] as const) {}

```

> info **提示** `PickType()` 函数是从 `@nestjs/swagger` 包导入的。

#### Omit

`OmitType()` 函数通过选取输入类型的全部属性，然后移除特定集合的键来构建一个类型。例如，假设您从如下类型开始：

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

您可以看到，可以生成一个包含除 `name` 之外所有属性的派生类型。在此构造中，`OmitType()` 的第二个参数是一个属性名称数组。

```typescript
export class UpdateCatDto extends OmitType(CreateCatDto, ['name'] as const) {}

```

> info **提示** `OmitType()` 函数是从 `@nestjs/swagger` 包导入的。

#### Intersection

`IntersectionType()` 函数将两个或多个类型组合成一个新的类型（类）。例如，假设您从如下两个类型开始：

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class CreateCatDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  breed: string;
}

export class AdditionalCatInfo {
  @ApiProperty()
  color: string;
}

```

您可以生成一个结合了两个类型所有属性的新类型：

```typescript
export class UpdateCatDto extends IntersectionType(
  CreateCatDto,
  AdditionalCatInfo,
) {}

```

> info **提示** `IntersectionType()` 函数是从 `@nestjs/swagger` 包导入的。

#### 组合

类型映射实用函数是可组合的。例如，以下代码产生一个类型（类），该类型包含 `CreateCatDto` 类型的全部属性，但排除了 `name`，并且这些属性被设置为可选：

```typescript
export class UpdateCatDto extends PartialType(
  OmitType(CreateCatDto, ['name'] as const),
) {}

```