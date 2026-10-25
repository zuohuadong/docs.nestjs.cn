<!-- 此文件从 content/graphql/mapped-types.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T10:07:21.680Z -->
<!-- 源文件: content/graphql/mapped-types.md -->
<!-- 源哈希: b55ce211e0deffdf9eb945b0206e2a96 -->

### 映射类型

> warning **警告** 本章仅适用于代码优先方法。

在构建 CRUD（创建/读取/更新/删除）等功能时，通常需要构造基础实体类型的变体。Nest 提供了若干执行类型转换的工具函数，使这项任务更加方便。

#### Partial

在构建输入验证类型（也称为数据传输对象或 DTO）时，通常需要在同一类型上构建 **create** 和 **update** 变体。例如，**create** 变体可能要求所有字段，而 **update** 变体可能使所有字段可选。

Nest 提供了 `PartialType()` 工具函数，使这项任务更简单并尽量减少样板代码。

`PartialType()` 函数返回一个类型（类），其中输入类型的所有属性都被设置为可选。例如，假设我们有一个如下所示的 **create** 类型：

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

默认情况下，所有这些字段都是必填的。要创建一个具有相同字段但每个字段都可选的类型，请使用 `PartialType()`，并将类引用（`CreateUserInput`）作为参数传入：

```typescript
@InputType()
export class UpdateUserInput extends PartialType(CreateUserInput) {}

```

> info **提示** `PartialType()` 函数从 `@nestjs/graphql` 包导入。

`PartialType()` 函数接受一个可选的第二个参数：装饰器工厂的引用。使用它来更改应用于生成的（子）类的装饰器。如果未指定它，子类实际上使用与 **父** 类（第一个参数中引用的类）相同的装饰器。在上面的示例中，我们扩展了 `CreateUserInput`，它使用 `@InputType()` 装饰器进行了注解。由于我们希望 `UpdateUserInput` 被视为也使用 `@InputType()` 装饰，因此不需要将 `InputType` 作为第二个参数传入。如果父类型和子类型不同（例如，父类型使用 `@ObjectType()` 装饰），请将 `InputType` 作为第二个参数传入：

```typescript
@InputType()
export class UpdateUserInput extends PartialType(User, InputType) {}

```

除了装饰器工厂之外，你也可以将选项对象作为第二个参数传入。它接受 `decorator` 属性、`omitDefaultValues`（设置为 `true` 以丢弃从父字段继承的默认值），以及 `skipNullProperties`（默认为 `true`；将其设置为 `false` 以仅跳过对 `undefined` 值的验证，并仍然验证 `null`）。

#### Pick

`PickType()` 函数通过从输入类型中选取一组属性来构造一个新类型（类）。例如，假设我们从一个如下类型开始：

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

你可以使用 `PickType()` 工具函数从该类中选取一组属性：

```typescript
@InputType()
export class UpdateEmailInput extends PickType(CreateUserInput, [
  'email',
] as const) {}

```

> info **提示** `PickType()` 函数从 `@nestjs/graphql` 包导入。

#### Omit

`OmitType()` 函数通过从输入类型中选取所有属性，然后移除一组特定的键来构造一个类型。例如，假设我们从一个如下类型开始：

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

你可以生成一个派生类型，该类型具有**除** `email` 之外的每个属性，如下所示。这里，`OmitType()` 的第二个参数是属性名称数组。

```typescript
@InputType()
export class UpdateUserInput extends OmitType(CreateUserInput, [
  'email',
] as const) {}

```

> info **提示** `OmitType()` 函数从 `@nestjs/graphql` 包导入。

#### Intersection

`IntersectionType()` 函数将两个类型合并为一个新类型（类）。例如，假设我们从如下两个类型开始：

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

你可以生成一个新类型，它组合了两个类型的所有属性：

```typescript
@InputType()
export class UpdateUserInput extends IntersectionType(
  CreateUserInput,
  AdditionalUserInfo,
) {}

```

> info **提示** `IntersectionType()` 函数从 `@nestjs/graphql` 包导入。

#### Composition

类型映射工具函数是可组合的。例如，以下代码生成一个类型（类），该类型具有 `CreateUserInput` 类型除 `email` 之外的所有属性，并且每个属性都设置为可选：

```typescript
@InputType()
export class UpdateUserInput extends PartialType(
  OmitType(CreateUserInput, ['email'] as const),
) {}

```