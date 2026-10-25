<!-- 此文件从 content/graphql/interfaces.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-03T11:06:32.928Z -->
<!-- 源文件: content/graphql/interfaces.md -->

### 接口

与许多类型系统一样，GraphQL 支持接口。**接口**是一种抽象类型，包含类型必须包含的一组字段才能实现该接口（了解更多 [here](https://graphql.org/learn/schema/#interfaces)）。

#### 代码优先

使用代码优先方法时，您可以通过创建带有从 `@nestjs/graphql` 导出的 `@InterfaceType()` 装饰器的抽象类来定义 GraphQL 接口。

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

这将导致在 SDL 中生成以下 GraphQL 模式部分：

```graphql
interface Character {
  id: ID!
  name: String!
}

```

现在，要实现 `Character` 接口，请使用 `implements` 键：

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

库生成的默认 `resolveType()` 函数根据解析器方法返回的值提取类型。这意味着您必须返回类实例（不能返回字面量 JavaScript 对象）。

要提供自定义的 `resolveType()` 函数，请将 `resolveType` 属性传递给传入 `@InterfaceType()` 装饰器的选项对象，如下所示：

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

到目前为止，使用接口，您只能与对象共享字段定义。如果您还想共享实际的字段解析器实现，可以创建一个专用的接口解析器，如下所示：

```typescript
import { Resolver, ResolveField, Parent, Info } from '@nestjs/graphql';

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

现在，`friends` 字段解析器会自动注册到所有实现 `Character` 接口的对象类型中。

> warning **警告** 这需要在 `GraphQLModule` 配置中将 `inheritResolversFromInterfaces` 属性设置为 true。

#### 模式优先

要在模式优先方法中定义接口，只需使用 SDL 创建 GraphQL 接口。

```graphql
interface Character {
  id: ID!
  name: String!
}

```

然后，您可以使用类型生成功能（如 [quick start](/graphql/quick-start) 章节所示）生成相应的 TypeScript 定义：

```typescript
export interface Character {
  id: string;
  name: string;
}

```

接口需要在解析器映射中有一个额外的 `__resolveType` 字段来确定接口应解析为哪种类型。让我们创建一个 `CharactersResolver` 类并定义 `__resolveType` 方法：

```typescript
@Resolver('Character')
export class CharactersResolver {
  @ResolveField()
  __resolveType(value) {
    if ('age' in value) {
      return Person;
    }
    return null;
  }
}

```

> info **提示** 所有装饰器都从 `@nestjs/graphql` 包中导出。