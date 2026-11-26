<!-- 此文件从 content/graphql/mapped-types.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:06:30.803Z -->
<!-- 源文件: content/graphql/mapped-types.md -->
<!-- 源哈希: a88a6712c0a88a96d7ccedbaf46f7ad5 -->

### 映射类型

> 警告 **警告** 本章仅适用于代码优先的方法。

在构建 CRUD（创建/读取/更新/删除）等功能时，通常需要构建基础实体类型的变体。Nest 提供了几个实用函数，用于执行类型转换，使此任务更加方便。

#### Partial

在构建输入验证类型（也称为数据传输对象或 DTO）时，通常需要在同一类型上构建**创建**和**更新**变体。例如，**创建**变体可能需要所有字段，而**更新**变体可能使所有字段可选。

Nest 提供了 `PartialType()` 实用函数，使此任务更轻松并最大限度地减少样板代码。

`PartialType()` 函数返回一个类型（类），其中输入类型的全部属性都被设置为可选。例如，假设我们有一个如下的**创建**类型：

```typescript
@InputType()
class CreateUserInput {
  @Field()
  email: string;

  @Field()
  password: string;

  @Field()
  firstName: string;
}

```

默认情况下，所有这些字段都是必需的。要创建一个具有相同字段但每个字段都可选的类型，请使用 `PartialType()`，并将类引用（`CreateUserInput`）作为参数传递：

```typescript
@InputType()
export class UpdateUserInput extends PartialType(CreateUserInput) {}

```

> 信息 **提示** `PartialType()` 函数是从 `@nestjs/graphql` 包导入的。

`PartialType()` 函数接受一个可选的第二个参数：一个装饰器工厂的引用。使用它来更改应用于结果（子）类的装饰器。如果不指定它，子类实际上使用与**父**类（第一个参数中引用的类）相同的装饰器。在上面的示例中，我们扩展了 `CreateUserInput`，它被 `@InputType()` 装饰器注解。由于我们希望 `UpdateUserInput` 被视为也带有 `@InputType()` 装饰器，因此我们不需要将 `InputType` 作为第二个参数传递。如果父类型和子类型不同（例如，父类型被 `@ObjectType()` 装饰），请将 `InputType` 作为第二个参数传递：

```typescript
@InputType()
export class UpdateUserInput extends PartialType(User, InputType) {}

```

除了装饰器工厂外，您也可以将一个选项对象作为第二个参数传递。它接受 `decorator` 属性、`omitDefaultValues`（设置为 `true` 以丢弃从父字段继承的默认值）和 `skipNullProperties`（默认为 `true`；将其设置为 `false` 以仅跳过 `undefined` 值的验证，同时仍验证 `null`）。

#### Pick

`PickType()` 函数通过从输入类型中选取一组属性来构建一个新的类型（类）。例如，假设我们从如下类型开始：

```typescript
@InputType()
class CreateUserInput {
  @Field()
  email: string;

  @Field()
  password: string;

  @Field()
  firstName: string;
}

```

您可以使用 `PickType()` 实用函数从该类中选取一组属性：

```typescript
@InputType()
export class UpdateEmailInput extends PickType(CreateUserInput, [
  'email',
] as const) {}

```

> 信息 **提示** `PickType()` 函数是从 `@nestjs/graphql` 包导入的。

#### Omit

`OmitType()` 函数通过从输入类型中选取所有属性，然后移除特定集合的键来构建一个类型。例如，假设我们从如下类型开始：

```typescript
@InputType()
class CreateUserInput {
  @Field()
  email: string;

  @Field()
  password: string;

  @Field()
  firstName: string;
}

```

如下图所示，您可以生成一个包含**除** `email` **之外**所有属性的派生类型。在这里，`OmitType()` 的第二个参数是一个属性名称数组。

```typescript
@InputType()
export class UpdateUserInput extends OmitType(CreateUserInput, [
  'email',
] as const) {}

```

> 信息 **提示** `OmitType()` 函数是从 `@nestjs/graphql` 包导入的。

#### Intersection

`IntersectionType()` 函数将两个类型组合成一个新的类型（类）。例如，假设我们从如下两个类型开始：

```typescript
@InputType()
class CreateUserInput {
  @Field()
  email: string;

  @Field()
  password: string;
}

@ObjectType()
export class AdditionalUserInfo {
  @Field()
  firstName: string;

  @Field()
  lastName: string;
}

```

您可以生成一个结合了两个类型所有属性的新类型：

```typescript
@InputType()
export class UpdateUserInput extends IntersectionType(
  CreateUserInput,
  AdditionalUserInfo,
) {}

```

> 信息 **提示** `IntersectionType()` 函数是从 `@nestjs/graphql` 包导入的。

#### Composition

类型映射实用函数是可组合的。例如，以下代码产生一个具有 `CreateUserInput` 类型所有属性但缺少 `email` 的类型（类），并且每个属性都设置为可选：

```typescript
@InputType()
export class UpdateUserInput extends PartialType(
  OmitType(CreateUserInput, ['email'] as const),
) {}

```

#### 构建您自己的

内置的映射类型基于 `getFieldsAndDecoratorForType()` 函数构建，您可以使用它来编写自己的。它返回一个被 `@ObjectType()`、`@InputType()`、`@InterfaceType()` 或 `@ArgsType()`（包括继承的字段）注解的类的字段，以及匹配其类型的类装饰器。例如，以下辅助函数将类型的每个字段转换为可选列表，这对于过滤器输入非常有用：

```typescript
import { Type } from '@nestjs/common';
import { Field, getFieldsAndDecoratorForType, InputType } from '@nestjs/graphql';

export function FilterType<T>(classRef: Type<T>) {
  const { fields } = getFieldsAndDecoratorForType(classRef);

  @InputType({ isAbstract: true })
  abstract class FilterInput {}

  for (const field of fields) {
    const type = field.typeFn();
    Field(() => [type], { nullable: true })(FilterInput.prototype, field.name);
  }
  return FilterInput as Type<{ [K in keyof T]?: T[K][] }>;
}

@InputType()
export class RecipeFilter extends FilterType(Recipe) {}

```

> 警告 **警告** 返回的字段元数据与模式构建器共享。请将其视为只读，并将选项的副本（例如，`{ ...field.options }`）传递给 `@Field()`。没有 GraphQL 类型装饰器的类将使 `getFieldsAndDecoratorForType()` 抛出 `UnableToFindFieldsError`。