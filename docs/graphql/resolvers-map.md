<!-- 此文件从 content/graphql/resolvers-map.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T10:04:15.612Z -->
<!-- 源文件: content/graphql/resolvers-map.md -->
<!-- 源哈希: 45c212ddf7dc5b14e92ddb90cb61cc57 -->

### 解析器

解析器提供了将 [GraphQL](https://graphql.org/) 操作（查询、变更或订阅）转换为数据的指令。它们以模式中指定的形状返回数据，可以是同步的，也可以是一个解析为该形状结果的 promise。通常，你需要手动创建**解析器映射**。而 `@nestjs/graphql` 包则不同，它会根据你用来注解类的装饰器所提供的元数据自动生成解析器映射。为了演示如何使用该包创建 GraphQL API，我们将构建一个简单的作者 API。

#### 代码优先

在代码优先方法中，你不需要手写 SDL 形式的 GraphQL 模式。相反，你使用 TypeScript 装饰器从 TypeScript 类定义生成 SDL。`@nestjs/graphql` 包会读取通过装饰器定义的元数据，并为你生成模式。

#### 对象类型

GraphQL 模式中的大多数定义都是**对象类型**。你定义的每个对象类型都应表示应用程序客户端可能需要与之交互的领域对象。例如，我们的示例 API 需要获取作者列表及其文章，因此我们定义一个 `Author` 类型和一个 `Post` 类型。

在模式优先方法中，你会像这样在 SDL 中定义 `Author` 类型：

```graphql
type Author {
  id: Int!
  firstName: String
  lastName: String
  posts: [Post!]!
}

```

在代码优先方法中，你使用 TypeScript 类定义模式，并用 TypeScript 装饰器注解其字段。上述 SDL 在代码优先方法中的等价形式是：

```typescript title="authors/models/author.model.ts"
import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Post } from '../../posts/models/post.model.js';

@ObjectType()
export class Author {
  @Field(type => Int)
  id: number;

  @Field({ nullable: true })
  firstName?: string;

  @Field({ nullable: true })
  lastName?: string;

  @Field(type => [Post])
  posts: Post[];
}

```

> info **提示** TypeScript 的元数据反射系统有一些限制。例如，它无法确定一个类由哪些属性组成，也无法确定某个给定属性是可选的还是必需的。由于这些限制，你必须在模式定义类中使用 `@Field()` 装饰器来提供每个字段的 GraphQL 类型和可选性元数据，或者使用 [CLI plugin](/graphql/cli-plugin) 为你生成这些元数据。

`Author` 对象类型和任何类一样，由一组字段组成，每个字段都声明一个类型。字段的类型对应于一个 [GraphQL type](https://graphql.org/learn/schema/)，它可以是另一个对象类型或标量类型。GraphQL 标量类型是一种解析为单个值的原始类型（如 `ID`、`String`、`Boolean` 或 `Int`）。

> info **提示** 除了 GraphQL 内置的标量类型之外，你还可以定义 [custom scalar types](/graphql/scalars)。

上面的 `Author` 对象类型定义会让 Nest **生成**前面展示的 SDL：

```graphql
type Author {
  id: Int!
  firstName: String
  lastName: String
  posts: [Post!]!
}

```

`@Field()` 装饰器接受一个可选的类型函数（例如 `type => Int`），以及一个可选的选项对象。

当 TypeScript 类型系统与 GraphQL 类型系统之间的映射存在歧义时，类型函数是必需的。具体来说，对于 `string` 和 `boolean` 类型它**不是**必需的，但对于 `number` 它**是**必需的，因为 `number` 可以映射到 GraphQL 的 `Int` 或 `Float`（在没有类型函数的情况下，`number` 默认映射到 `Float`）。类型函数返回所需的 GraphQL 类型，如本章各处的示例所示。

选项对象可以包含以下任意键/值对：

- `nullable`：字段是否可为空（在 `@nestjs/graphql` 中，每个字段默认都是非空的）；`boolean`
- `description`：字段描述；`string`
- `deprecationReason`：将字段标记为已弃用；`string`

例如：

```typescript
@Field({ description: `Book title`, deprecationReason: 'Not useful in v2 schema' })
title: string;

```

> info **提示** 你也可以为整个对象类型添加描述或将其弃用：`@ObjectType({ description: 'Author model' })`。同样，如果你的应用程序提供 [multiple GraphQL endpoints](/graphql/quick-start#多个端点)，你可以将类型限定到特定模块：`@ObjectType({ registerIn: () => AuthorsModule })`。

当字段是数组时，你必须在 `@Field()` 装饰器的类型函数中指明数组类型，如下所示：

```typescript
@Field(type => [Post])
posts: Post[];

```

> info **提示** 数组方括号表示法（`[ ]`）表示数组的深度。例如，`[[Int]]` 表示一个整数矩阵。

要声明数组的项（而不是数组本身）可为空，请将 `nullable` 属性设置为 `'items'`，如下所示：

```typescript
@Field(type => [Post], { nullable: 'items' })
posts: Post[];

```

> info **提示** 如果数组及其项都可为空，请改为将 `nullable` 设置为 `'itemsAndList'`。

有了 `Author` 对象类型之后，让我们定义 `Post` 对象类型。

```typescript title="posts/models/post.model.ts"
import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class Post {
  @Field(type => Int)
  id: number;

  @Field()
  title: string;

  @Field(type => Int, { nullable: true })
  votes?: number;
}

```

`Post` 对象类型会生成 GraphQL 模式中以下 SDL 部分：

```graphql
type Post {
  id: Int!
  title: String!
  votes: Int
}

```

#### 代码优先解析器

此时，我们已经定义了数据图中可以存在的对象（类型定义），但客户端还没有与它们交互的方式。为了解决这个问题，我们需要一个解析器类。在代码优先方法中，解析器类既定义解析器函数，**也**生成 **Query 类型**。下面的示例展示了如何做到这一点：

```typescript title="authors/authors.resolver.ts"
@Resolver(() => Author)
export class AuthorsResolver {
  constructor(
    private authorsService: AuthorsService,
    private postsService: PostsService,
  ) {}

  @Query(() => Author)
  async author(@Args('id', { type: () => Int }) id: number) {
    return this.authorsService.findOneById(id);
  }

  @ResolveField()
  async posts(@Parent() author: Author) {
    const { id } = author;
    return this.postsService.findAll({ authorId: id });
  }
}

```

> info **提示** 所有装饰器（例如 `@Resolver`、`@ResolveField`、`@Args` 等）都从 `@nestjs/graphql` 包中导出。

你可以定义多个解析器类，Nest 会在运行时将它们组合起来。有关代码组织的更多内容，请参阅下面的 [Module](/graphql/resolvers-map#模块) 部分。

> warning **注意** `AuthorsService` 和 `PostsService` 类内部的逻辑可以根据需要简单或复杂。本示例的重点是展示如何构造解析器以及它们如何与其他提供者交互。

上面的 `AuthorsResolver` 定义了一个查询解析器函数和一个字段解析器函数。要创建解析器，请创建一个以解析器函数作为方法的类，并使用 `@Resolver()` 装饰器注解该类。

`author()` 方法是一个查询处理器，它返回请求中发送的 `id` 对应的作者对象。要将某个方法标记为查询处理器，请使用 `@Query()` 装饰器。

传递给 `@Resolver()` 装饰器的参数是可选的，但当你的图变得复杂时它就会派上用场：它提供字段解析器函数在遍历对象图时使用的父对象。

因为这个类包含一个**字段解析器**函数（用于 `Author` 对象类型的 `posts` 属性），所以你**必须**向 `@Resolver()` 装饰器传递一个值，以指示该类中定义的所有字段解析器的父类型（即对应的 `ObjectType` 类）。字段解析器需要访问父对象（正在解析的字段所属的对象）。在这里，字段解析器通过使用作者的 `id` 调用服务来填充作者的 `posts` 数组，这就是为什么必须在 `@Resolver()` 装饰器中标识父对象。然后，`@Parent()` 方法参数装饰器会在字段解析器中提取对该父对象的引用。

你可以定义多个 `@Query()` 解析器函数（既可以在该类中，也可以在其他解析器类中）。它们会被聚合到生成的 SDL 中的单个 **Query 类型**定义中，并在解析器映射中生成相应的条目。这让你可以在使用它们的模型和服务附近定义查询，并在模块中保持它们良好的组织。

> info **提示** Nest CLI 提供了一个生成器（schematic），可以为你生成**所有样板代码**。有关详细信息，请参阅 [CRUD generator](/recipes/crud-generator) 配方。

#### 查询类型名称

在上面的示例中，`@Query()` 装饰器从方法名派生 GraphQL 查询名称。例如，考虑上面示例中的以下构造：

```typescript
@Query(() => Author)
async author(@Args('id', { type: () => Int }) id: number) {
  return this.authorsService.findOneById(id);
}

```

这会在模式中为 author 查询生成以下条目（查询使用与方法相同的名称）：

```graphql
type Query {
  author(id: Int!): Author!
}

```

> info **提示** 了解更多关于 [GraphQL queries](https://graphql.org/learn/queries/) 的信息。

按照惯例，这些名称是解耦的。例如，你可以将查询处理方法命名为 `getAuthor()`，但仍然将查询暴露为 `author`。字段解析器也是如此。为此，将映射名称作为参数传递给 `@Query()` 和 `@ResolveField()` 装饰器，如下所示：

```typescript title="authors/authors.resolver.ts"
@Resolver(() => Author)
export class AuthorsResolver {
  constructor(
    private authorsService: AuthorsService,
    private postsService: PostsService,
  ) {}

  @Query(() => Author, { name: 'author' })
  async getAuthor(@Args('id', { type: () => Int }) id: number) {
    return this.authorsService.findOneById(id);
  }

  @ResolveField('posts', () => [Post])
  async getPosts(@Parent() author: Author) {
    const { id } = author;
    return this.postsService.findAll({ authorId: id });
  }
}

```

上面的 `getAuthor()` 处理方法会在 SDL 中生成 GraphQL 模式的以下部分：

```graphql
type Query {
  author(id: Int!): Author!
}

```

#### 查询装饰器选项

`@Query()` 装饰器的选项对象（我们在上面传递 `{name: 'author'}` 的地方）接受多个键/值对：

- `name`：查询的名称；一个 `string`
- `description`：用于生成 GraphQL 模式文档的描述（例如在 GraphiQL 中）；一个 `string`
- `deprecationReason`：在模式元数据中将查询标记为已弃用（例如在 GraphiQL 中显示）；一个 `string`
- `nullable`：查询是否可以返回 null 数据响应；`boolean`、`'items'` 或 `'itemsAndList'`（有关 `'items'` 和 `'itemsAndList'` 的详细信息，请参见上文）

#### Args 装饰器选项

使用 `@Args()` 装饰器从请求中提取参数，以便在处理方法中使用。其工作方式与 [REST route parameter extraction](/overview/controllers#路由参数) 非常相似。

通常，`@Args()` 装饰器不需要选项对象。例如，如果标识符是字符串，以下构造就足够了：它从入站 GraphQL 请求中提取指定名称的字段，用作方法参数。

```typescript
@Args('id') id: string

```

`getAuthor()` 方法使用 `number` 类型，这带来了一个挑战：TypeScript 的 `number` 类型没有携带足够的信息来说明预期的 GraphQL 表示形式（例如 `Int` 与 `Float`）。因此，你必须**显式地**传递类型引用，将其放在作为第二个参数传递给 `@Args()` 装饰器的选项对象中：

```typescript
@Query(() => Author, { name: 'author' })
async getAuthor(@Args('id', { type: () => Int }) id: number) {
  return this.authorsService.findOneById(id);
}

```

选项对象接受以下可选的键/值对：

- `type`：返回 GraphQL 类型的函数
- `defaultValue`：默认值；`any`
- `description`：描述元数据；`string`
- `deprecationReason`：弃用字段并提供描述原因的元数据；`string`
- `nullable`：字段是否可为 null

查询处理方法可以接受多个参数。例如，要通过 `firstName` 和 `lastName` 获取作者，请调用 `@Args()` 两次：

```typescript
getAuthor(
  @Args('firstName', { nullable: true }) firstName?: string,
  @Args('lastName', { defaultValue: '' }) lastName?: string,
) {}

```

> info **提示** 对于像 `firstName` 这样的 GraphQL 可空字段，你不需要在字段的 TypeScript 类型中添加 `null` 或 `undefined`。但请注意，可空字段会让这些值传递到你的解析器，因此你需要在解析器中防范它们。

#### 专用参数类

使用内联 `@Args()` 调用时，像上面示例这样的代码会很快变得臃肿。相反，你可以创建一个专用的 `GetAuthorArgs` 参数类，并在处理方法中按如下方式访问它：

```typescript
@Args() args: GetAuthorArgs

```

使用 `@ArgsType()` 创建 `GetAuthorArgs` 类，如下所示：

```typescript title="authors/dto/get-author.args.ts"
import { MinLength } from 'class-validator';
import { Field, ArgsType } from '@nestjs/graphql';

@ArgsType()
export class GetAuthorArgs {
  @Field({ nullable: true })
  firstName?: string;

  @Field({ defaultValue: '' })
  @MinLength(3)
  lastName: string;
}

```

> info **提示** 同样，由于 TypeScript 元数据反射系统的限制，你必须使用 `@Field()` 装饰器来指示类型和可选性，或者使用 [CLI plugin](/graphql/cli-plugin)。和之前一样，你不需要在可空的 `firstName` 字段类型中添加 `null` 或 `undefined`，但你确实需要在解析器中防范这些值。

这会在 SDL 中生成 GraphQL 模式的以下部分：

```graphql
type Query {
  author(firstName: String, lastName: String! = ""): Author!
}

```

> info **提示** 像 `GetAuthorArgs` 这样的参数类与 `ValidationPipe` 配合良好（参见 [Validation](/application/validation)）。

#### 类继承

你可以使用标准的 TypeScript 类继承来创建具有通用实用功能（字段和字段属性、验证等）的可扩展基类。例如，你可能有一组与分页相关的参数，它们始终包含标准的 `offset` 和 `limit` 字段，以及其他特定类型的索引字段。你可以按如下所示设置类层次结构。

基础 `@ArgsType()` 类：

```typescript
@ArgsType()
class PaginationArgs {
  @Field(() => Int)
  offset: number = 0;

  @Field(() => Int)
  limit: number = 10;
}

```

基础 `@ArgsType()` 类的特定类型子类：

```typescript
@ArgsType()
class GetAuthorArgs extends PaginationArgs {
  @Field({ nullable: true })
  firstName?: string;

  @Field({ defaultValue: '' })
  @MinLength(3)
  lastName: string;
}

```

同样的方法也可以用于 `@ObjectType()` 对象。在基类上定义通用属性：

```typescript
@ObjectType()
class Character {
  @Field(() => Int)
  id: number;

  @Field()
  name: string;
}

```

在子类上添加特定类型的属性：

```typescript
@ObjectType()
class Warrior extends Character {
  @Field()
  level: number;
}

```

你也可以在解析器中使用继承，并将其与 TypeScript 泛型结合以保持类型安全。例如，要创建一个带有泛型 `findAll` 查询的基类，请使用如下构造：

```typescript
function BaseResolver<T extends Type<unknown>>(classRef: T): any {
  @Resolver({ isAbstract: true })
  abstract class BaseResolverHost {
    @Query(() => [classRef], { name: `findAll${classRef.name}` })
    async findAll(): Promise<T[]> {
      return [];
    }
  }
  return BaseResolverHost;
}

```

请注意以下几点：

- 需要显式的返回类型（上面的 `any`）；否则，TypeScript 会抱怨使用了私有类定义。我们建议定义接口，而不是使用 `any`。
- `Type` 从 `@nestjs/common` 包导入。
- `isAbstract: true` 属性表示不应为此类生成 SDL（模式定义语言语句）。你也可以在其他类型上设置此属性以抑制 SDL 生成。

以下是如何创建 `BaseResolver` 的具体子类：

```typescript
@Resolver(() => Recipe)
export class RecipesResolver extends BaseResolver(Recipe) {
  constructor(private recipesService: RecipesService) {
    super();
  }
}

```

此构造将生成以下 SDL：

```graphql
type Query {
  findAllRecipe: [Recipe!]!
}

```

#### 泛型

我们在上面看到了泛型的一种用法。泛型让你能够构建可复用的抽象。例如，下面是一个基于 [GraphQL pagination guide](https://graphql.org/learn/pagination/#pagination-and-edges) 的游标分页实现：

```typescript
import { Field, ObjectType, Int } from '@nestjs/graphql';
import { Type } from '@nestjs/common';

interface IEdgeType<T> {
  cursor: string;
  node: T;
}

export interface IPaginatedType<T> {
  edges: IEdgeType<T>[];
  nodes: T[];
  totalCount: number;
  hasNextPage: boolean;
}

export function Paginated<T>(classRef: Type<T>): Type<IPaginatedType<T>> {
  @ObjectType(`${classRef.name}Edge`)
  abstract class EdgeType {
    @Field(() => String)
    cursor: string;

    @Field(() => classRef)
    node: T;
  }

  @ObjectType({ isAbstract: true })
  abstract class PaginatedType implements IPaginatedType<T> {
    @Field(() => [EdgeType], { nullable: true })
    edges: EdgeType[];

    @Field(() => [classRef], { nullable: true })
    nodes: T[];

    @Field(() => Int)
    totalCount: number;

    @Field()
    hasNextPage: boolean;
  }
  return PaginatedType as Type<IPaginatedType<T>>;
}

```

定义好这个基类之后，你就可以创建继承其行为的专用类型。例如：

```typescript
@ObjectType()
class PaginatedAuthor extends Paginated(Author) {}

```

#### 模式优先

正如 [Quick start](/graphql/quick-start) 章节中提到的，在模式优先方法中，你首先要手动在 SDL 中定义模式类型（参见 [GraphQL type language](https://graphql.org/learn/schema/#type-language)）。考虑以下 SDL 类型定义。

> info **提示** 为方便起见，本章将所有 SDL 集中在一个位置（例如下面展示的一个 `.graphql` 文件）。在实践中，你可能更倾向于模块化的组织方式。例如，你可以为每个领域实体创建单独的 SDL 文件来存放其类型定义，并将它们与该实体相关的服务、解析器代码以及 Nest 模块类一起放在该实体的专用目录中。Nest 会在运行时聚合所有单独的模式类型定义。

```graphql
type Author {
  id: Int!
  firstName: String
  lastName: String
  posts: [Post]
}

type Post {
  id: Int!
  title: String!
  votes: Int
}

type Query {
  author(id: Int!): Author
}

```

#### 模式优先解析器

上面的模式暴露了单个查询：`author(id: Int!): Author`。

> info **提示** 了解更多关于 [GraphQL queries](https://graphql.org/learn/queries/) 的信息。

现在创建一个 `AuthorsResolver` 类来解析 author 查询：

```typescript title="authors/authors.resolver.ts"
@Resolver('Author')
export class AuthorsResolver {
  constructor(
    private authorsService: AuthorsService,
    private postsService: PostsService,
  ) {}

  @Query()
  async author(@Args('id') id: number) {
    return this.authorsService.findOneById(id);
  }

  @ResolveField()
  async posts(@Parent() author) {
    const { id } = author;
    return this.postsService.findAll({ authorId: id });
  }
}

```

> info **提示** 所有装饰器（例如 `@Resolver`、`@ResolveField`、`@Args` 等）都从 `@nestjs/graphql` 包中导出。

> warning **注意** `AuthorsService` 和 `PostsService` 类内部的逻辑可以根据需要简单或复杂。本示例的重点是展示如何构建解析器以及它们如何与其他提供者交互。

`@Resolver()` 装饰器是必需的。它接受一个可选的字符串参数，表示某个类型的名称。只要类中包含 `@ResolveField()` 装饰器，就必须提供该名称，以告知 Nest 被装饰的方法关联的是哪个父类型（在本例中为 `Author` 类型）。或者，你也可以不将 `@Resolver()` 应用于类，而是将其应用于每个方法：

```typescript
@Resolver('Author')
@ResolveField()
async posts(@Parent() author) {
  const { id } = author;
  return this.postsService.findAll({ authorId: id });
}

```

在这种情况下（在方法级别使用 `@Resolver()`），如果一个类有多个 `@ResolveField()` 方法，你必须为每个方法都添加 `@Resolver()`。这不算是最佳实践，因为它会增加额外开销。

> info **提示** 传递给 `@Resolver()` 的任何类名参数**不会**影响查询（`@Query()` 装饰器）或变更（`@Mutation()` 装饰器）。

> warning **警告** 在**代码优先**方法中，不支持在方法级别使用 `@Resolver` 装饰器。

在上面的示例中，`@Query()` 和 `@ResolveField()` 装饰器会根据方法名与 GraphQL 模式字段相关联。例如，考虑上面示例中的以下构造：

```typescript
@Query()
async author(@Args('id') id: number) {
  return this.authorsService.findOneById(id);
}

```

这会在模式中为 author 查询生成以下条目（该查询使用与方法相同的名称）：

```graphql
type Query {
  author(id: Int!): Author
}

```

按照惯例，这些名称是解耦的，解析器方法通常使用诸如 `getAuthor()` 或 `getPosts()` 这样的名称。为此，请将映射名称作为参数传递给装饰器，如下所示：

```typescript title="authors/authors.resolver.ts"
@Resolver('Author')
export class AuthorsResolver {
  constructor(
    private authorsService: AuthorsService,
    private postsService: PostsService,
  ) {}

  @Query('author')
  async getAuthor(@Args('id') id: number) {
    return this.authorsService.findOneById(id);
  }

  @ResolveField('posts')
  async getPosts(@Parent() author) {
    const { id } = author;
    return this.postsService.findAll({ authorId: id });
  }
}

```

> info **提示** Nest CLI 提供了一个生成器（原理图），可以为你生成**所有样板代码**。详情请参阅 [CRUD generator](/recipes/crud-generator) 章节。

#### 生成类型

如果你使用模式优先方法并启用了类型生成（通过 `outputAs: 'class'`，如 [Quick start](/graphql/quick-start) 章节所示），运行应用程序会在 `GraphQLModule.forRoot()` 方法中指定的位置生成以下文件，例如 `src/graphql.ts`：

```typescript title="graphql.ts"
export class Author {
  id: number;
  firstName?: string;
  lastName?: string;
  posts?: Post[];
}
export class Post {
  id: number;
  title: string;
  votes?: number;
}

export abstract class IQuery {
  abstract author(id: number): Author | Promise<Author>;
}

```

生成类（而不是默认的接口）让你能够将声明式验证**装饰器**与模式优先方法结合使用（参见 [Validation](/application/validation)）。例如，你可以向生成的 `CreatePostInput` 类添加 `class-validator` 装饰器，如下所示，以强制 `title` 字段的字符串最小和最大长度：

```typescript
import { MinLength, MaxLength } from 'class-validator';

export class CreatePostInput {
  @MinLength(3)
  @MaxLength(50)
  title: string;
}

```

> warning **注意** 要启用对输入（及参数）的自动验证，请使用 `ValidationPipe`。更多信息请参阅 [Validation](/application/validation) 和 [Pipes](/pipes) 章节。

但是，直接添加到生成文件中的装饰器会在每次重新生成文件时被**覆盖**。因此，应创建一个单独的文件并扩展生成的类。

```typescript
import { MinLength, MaxLength } from 'class-validator';
import { Post } from '../../graphql.js';

export class CreatePostInput extends Post {
  @MinLength(3)
  @MaxLength(50)
  title: string;
}

```

#### GraphQL 参数装饰器

你可以使用专用装饰器访问标准的 GraphQL 解析器参数。下表将 Nest 装饰器映射到它们所代表的普通 Apollo 参数。

<table>
  <tbody>
    <tr>
      <td><code>@Root()</code> 和 <code>@Parent()</code></td>
      <td><code>root</code>/<code>parent</code></td>
    </tr>
    <tr>
      <td><code>@Context(param?: string)</code></td>
      <td><code>context</code> / <code>context[param]</code></td>
    </tr>
    <tr>
      <td><code>@Info(param?: string)</code></td>
      <td><code>info</code> / <code>info[param]</code></td>
    </tr>
    <tr>
      <td><code>@Args(param?: string)</code></td>
      <td><code>args</code> / <code>args[param]</code></td>
    </tr>
  </tbody>
</table>

这些参数具有以下含义：

- `root`：一个对象，包含父字段上解析器返回的结果；或者，对于顶层 `Query` 字段，它包含从服务器配置传入的 `rootValue`。
- `context`：一个由特定查询中所有解析器共享的对象；通常用于存放每个请求的状态。
- `info`：一个包含查询执行状态信息的对象。
- `args`：一个包含查询中传入该字段的参数的对象。

<app-banner-observe></app-banner-observe>

#### 模块

通过上述步骤，我们已经以声明式的方式指定了 `GraphQLModule` 生成解析器映射所需的全部信息。`GraphQLModule` 使用反射来内省通过装饰器提供的元数据，并自动将这些类转换为正确的解析器映射。

你唯一需要做的另一件事就是**提供**解析器类（`AuthorsResolver`），即，将其列为某个模块中的提供者，并在某处导入该模块（`AuthorsModule`），以便 Nest 能够使用它。

例如，你可以在一个 `AuthorsModule` 中这样做，它还可以提供此上下文中需要的其他服务。请确保在某处导入 `AuthorsModule`（例如，在根模块中，或者在根模块导入的另一个模块中）。

```typescript title="authors/authors.module.ts"
@Module({
  imports: [PostsModule],
  providers: [AuthorsService, AuthorsResolver],
})
export class AuthorsModule {}

```

> info **提示** 按**领域模型**来组织代码会很有帮助（类似于你在 REST API 中组织入口点的方式）。在这种方式下，将你的模型（`ObjectType` 类）、解析器和服务放在一起，置于一个代表该领域模型的 Nest 模块中，每个模块一个文件夹。当你这样做并使用 [Nest CLI](/cli/overview) 生成每个元素时，CLI 会为你把这些部分连接起来（将文件放入适当的文件夹、向 `providers` 和 `imports` 数组添加条目等）。