<!-- 此文件从 content/graphql/mapped-types.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:50:32.941Z -->
<!-- 源文件: content/graphql/mapped-types.md -->
<!-- 源哈希: a1ec7a6444db342aef205e3541536820 -->

### 映射类型

> warning **警告** 本章仅适用于代码优先方法。

在构建 CRUD（创建/读取/更新/删除）等功能时，通常需要在基础实体类型上构造变体。Nest 提供了几个执行类型转换的实用函数，使这一任务更加方便。

#### Partial

在构建输入验证类型（也称为数据传输对象或 DTO）时，通常需要在同一类型上构建 **create** 和 **update** 变体。例如，**create** 变体可能需要所有字段，而 **update** 变体可能使所有字段变为可选。

Nest 提供了 `PartialType()` 实用函数，以简化此任务并减少样板代码。

`PartialType()` 函数返回一个类型（类），其中输入类型的所有属性都设置为可选。例如，假设我们有一个如下的 **create** 类型：

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

默认情况下，所有这些字段都是必填的。要创建具有相同字段但每个字段都可选的类型，请使用 `PartialType()`，并将类引用（`CreateUserInput`）作为参数传递：

```typescript
@InputType()
export class UpdateUserInput extends PartialType(CreateUserInput) {}

```

> info **提示** `PartialType()` 函数从 `@nestjs/graphql` 包中导入。

`PartialType()` 函数接受一个可选的第二个参数，该参数是对装饰器工厂的引用。此参数可用于更改应用于生成的（子）类的装饰器函数。如果未指定，子类实际上使用与 **父** 类（第一个参数中引用的类）相同的装饰器。在上面的示例中，我们扩展了 `CreateUserInput`，它带有 `@InputType()` 装饰器。由于我们希望 `UpdateUserInput` 也被视为带有 `@InputType()` 装饰器，因此我们不需要将 `InputType` 作为第二个参数传递。如果父类和子类类型不同（例如，父类带有 `@ObjectType` 装饰器），我们将传递 `InputType` 作为第二个参数。例如：

```typescript
@InputType()
export class UpdateUserInput extends PartialType(User, InputType) {}

```

#### Pick

`PickType()` 函数通过从输入类型中选取一组属性来构造一个新类型（类）。例如，假设我们从如下类型开始：

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

我们可以使用 `PickType()` 实用函数从该类中选取一组属性：

```typescript
@InputType()
export class UpdateEmailInput extends PickType(CreateUserInput, [
  'email',
] as const) {}

```

> info **提示** `PickType()` 函数从 `@nestjs/graphql` 包中导入。

#### Omit

`OmitType()` 函数通过从输入类型中选取所有属性，然后移除一组特定的键来构造一个类型。例如，假设我们从如下类型开始：

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

我们可以生成一个派生类型，该类型具有除 `email` 之外的所有属性，如下所示。在此构造中，`OmitType` 的第二个参数是属性名称的数组。

```typescript
@InputType()
export class UpdateUserInput extends OmitType(CreateUserInput, [
  'email',
] as const) {}

```

> info **提示** `OmitType()` 函数从 `@nestjs/graphql` 包中导入。

#### Intersection

`IntersectionType()` 函数将两个类型合并为一个新类型（类）。例如，假设我们从两个类型开始：

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

我们可以生成一个包含两个类型中所有属性的新类型。

```typescript
@InputType()
export class UpdateUserInput extends IntersectionType(
  CreateUserInput,
  AdditionalUserInfo,
) {}

```

> info **提示** `IntersectionType()` 函数从 `@nestjs/graphql` 包中导入。

#### Composition

类型映射实用函数是可组合的。例如，以下代码将生成一个类型（类），该类型具有 `CreateUserInput` 类型的所有属性，但 `email` 除外，并且这些属性将被设置为可选：

```typescript
@InputType()
export class UpdateUserInput extends PartialType(
  OmitType(CreateUserInput, ['email'] as const),
) {}

```