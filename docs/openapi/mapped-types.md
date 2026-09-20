<!-- 此文件从 content/openapi/mapped-types.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-13T08:14:06.849Z -->
<!-- 源文件: content/openapi/mapped-types.md -->
<!-- 源哈希: 011822da3c0a9999c4b34ab41b67ca90 -->

### 映射类型

在构建诸如 **CRUD**（创建/读取/更新/删除）等功能时，通常需要基于基础实体类型构造变体。Nest 提供了多个执行类型转换的实用函数，使这一任务更加便捷。

#### Partial

在构建输入验证类型（也称为 DTO）时，通常需要在同一类型上构建 **创建** 和 **更新** 变体。例如，**创建** 变体可能需要所有字段，而 **更新** 变体可能将所有字段设为可选。

Nest 提供了 `PartialType()` 实用函数来简化此任务并减少样板代码。

`PartialType()` 函数返回一个类型（类），其输入类型的所有属性均设为可选。例如，假设我们有一个 **创建** 类型如下：

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

默认情况下，所有这些字段都是必填的。要创建具有相同字段但每个字段都可选的类型，请使用 `PartialType()` 并将类引用（`CreateCatDto`）作为参数传入：

```typescript
export class UpdateCatDto extends PartialType(CreateCatDto) {}

```

> info **提示** `PartialType()` 函数从 `@nestjs/swagger` 包中导入。

#### Pick

`PickType()` 函数通过从输入类型中选取一组属性来构造一个新类型（类）。例如，假设我们从如下类型开始：

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

我们可以使用 `PickType()` 实用函数从该类中选取一组属性：

```typescript
export class UpdateCatAgeDto extends PickType(CreateCatDto, ['age'] as const) {}

```

> info **提示** `PickType()` 函数从 `@nestjs/swagger` 包中导入。

#### Omit

`OmitType()` 函数通过从输入类型中选取所有属性，然后移除特定的一组键来构造一个类型。例如，假设我们从如下类型开始：

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

我们可以生成一个派生类型，该类型具有除 `name` 之外的所有属性，如下所示。在此构造中，`OmitType` 的第二个参数是属性名称数组。

```typescript
export class UpdateCatDto extends OmitType(CreateCatDto, ['name'] as const) {}

```

> info **提示** `OmitType()` 函数从 `@nestjs/swagger` 包中导入。

#### Intersection

`IntersectionType()` 函数将两个类型合并为一个新类型（类）。例如，假设我们从如下两个类型开始：

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

我们可以生成一个包含两个类型中所有属性的新类型。

```typescript
export class UpdateCatDto extends IntersectionType(
  CreateCatDto,
  AdditionalCatInfo,
) {}

```

> info **提示** `IntersectionType()` 函数从 `@nestjs/swagger` 包中导入。

#### Composition

类型映射实用函数是可组合的。例如，以下代码将生成一个类型（类），该类型具有 `CreateCatDto` 类型的所有属性（除了 `name`），并且这些属性将被设为可选：

```typescript
export class UpdateCatDto extends PartialType(
  OmitType(CreateCatDto, ['name'] as const),
) {}

```