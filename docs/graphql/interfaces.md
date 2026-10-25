<!-- 此文件从 content/graphql/interfaces.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T10:00:17.190Z -->
<!-- 源文件: content/graphql/interfaces.md -->
<!-- 源哈希: 2901f9c166cb918f056b65e674ed6511 -->

### 接口

与许多类型系统一样，GraphQL 支持接口。**接口**是一种抽象类型，它定义了一组字段，类型必须包含这些字段才能实现该接口（参见 GraphQL 文档中的 [interfaces](https://graphql.org/learn/schema/#interfaces)）。

#### 代码优先

在代码优先方法中，你通过创建一个用 `@InterfaceType()` 装饰器标注的抽象类来定义 GraphQL 接口，该装饰器从 `@nestjs/graphql` 包中导出。

```typescript
import { Field, ID, InterfaceType } from '@nestjs/graphql';

@InterfaceType()
export abstract class Character {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;
}

```

> warning **警告** TypeScript 接口不能用于定义 GraphQL 接口。

这会在 SDL 中生成 GraphQL 模式的以下部分：

```graphql
interface Character {
  id: ID!
  name: String!
}

```

要实现 `Character` 接口，请使用 `implements` 键：

```typescript
@ObjectType({
  implements: () => [Character],
})
export class Human implements Character {
  id: string;
  name: string;
}

```

> info **提示** `@ObjectType()` 装饰器从 `@nestjs/graphql` 包中导出。

库生成的默认 `resolveType()` 函数根据解析器方法返回的值来确定类型。这意味着你必须返回类实例，而不是普通的 JavaScript 对象字面量。

要提供自定义的 `resolveType()` 函数，请在 `@InterfaceType()` 装饰器的选项对象中传入 `resolveType` 属性：

```typescript
@InterfaceType({
  resolveType(book) {
    if (book.colors) {
      return ColoringBook;
    }
    return TextBook;
  },
})
export abstract class Book {
  @Field(() => ID)
  id: string;

  @Field()
  title: string;
}

```

#### 接口解析器

到目前为止，接口只允许你与对象共享字段定义。要同时共享字段解析器的实现，请创建一个专用的接口解析器：

```typescript
import { Args, Info, Parent, ResolveField, Resolver } from '@nestjs/graphql';

@Resolver((type) => Character) // Reminder: Character is an interface
export class CharacterInterfaceResolver {
  @ResolveField(() => [Character])
  friends(
    @Parent() character, // Resolved object that implements Character
    @Info() { parentType }, // Type of the object that implements Character
    @Args('search', { type: () => String }) searchTerm: string,
  ) {
    // 获取 character's friends
    return [];
  }
}

```

现在，`friends` 字段解析器会自动为所有实现 `Character` 接口的对象类型注册。

> warning **警告** 这需要在 `GraphQLModule` 配置中将 `inheritResolversFromInterfaces` 属性设置为 `true`。

#### 模式优先

要在模式优先方法中定义接口，请使用 SDL 创建一个 GraphQL 接口：

```graphql
interface Character {
  id: ID!
  name: String!
}

```

然后，你可以使用类型定义生成功能（如 [GraphQL quick start](/graphql/quick-start) 章节所示）来生成相应的 TypeScript 定义：

```typescript
export interface Character {
  id: string;
  name: string;
}

```

接口需要在解析器映射中额外提供一个 `__resolveType` 字段，以确定接口解析为哪种类型。创建一个 `CharactersResolver` 类并定义 `__resolveType` 方法，该方法返回具体类型的名称：

```typescript
@Resolver('Character')
export class CharactersResolver {
  @ResolveField()
  __resolveType(value) {
    if ('age' in value) {
      return 'Person';
    }
    return null;
  }
}

```

> info **提示** 所有装饰器都从 `@nestjs/graphql` 包中导出。