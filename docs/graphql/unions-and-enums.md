<!-- 此文件从 content/graphql/unions-and-enums.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T10:00:18.181Z -->
<!-- 源文件: content/graphql/unions-and-enums.md -->
<!-- 源哈希: a5189975864623010031eb7e79e1264f -->

### 联合类型

联合类型与接口类似，但它们不指定类型之间的任何公共字段（参见 GraphQL 文档中的 [union types](https://graphql.org/learn/schema/#union-types)）。联合类型对于从单个字段返回不相交的数据类型非常有用。

#### 代码优先

要定义 GraphQL 联合类型，首先定义组成该联合类型的类。按照 Apollo 文档中的 [union type example](https://www.apollographql.com/docs/apollo-server/schema/unions-interfaces/#联合类型)，我们将创建两个类。首先是 `Book`：

```typescript
import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class Book {
  @Field()
  title: string;
}

```

然后是 `Author`：

```typescript
import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class Author {
  @Field()
  name: string;
}

```

完成这些之后，使用从 `@nestjs/graphql` 包中导出的 `createUnionType` 函数注册 `ResultUnion` 联合类型：

```typescript
export const ResultUnion = createUnionType({
  name: 'ResultUnion',
  types: () => [Author, Book] as const,
});

```

> warning **警告** 为 `createUnionType` 函数的 `types` 属性返回的数组添加 const 断言（`as const`）。如果没有它，TypeScript 会在编译时生成不正确的声明文件，并且从另一个项目中使用该联合类型时会失败并报错。

现在你可以在查询中引用 `ResultUnion`：

```typescript
@Query(() => [ResultUnion])
search(): Array<typeof ResultUnion> {
  return [new Author(), new Book()];
}

```

这会在 SDL 中生成以下部分的 GraphQL 模式：

```graphql
type Author {
  name: String!
}

type Book {
  title: String!
}

union ResultUnion = Author | Book

type Query {
  search: [ResultUnion!]!
}

```

该库生成的默认 `resolveType()` 函数会根据解析器方法返回的值来确定类型。这意味着你必须返回类实例，而不是普通的 JavaScript 对象字面量。

要提供自定义的 `resolveType()` 函数，请在 `createUnionType()` 函数的选项对象中传入 `resolveType` 属性：

```typescript
export const ResultUnion = createUnionType({
  name: 'ResultUnion',
  types: () => [Author, Book] as const,
  resolveType(value) {
    if (value.name) {
      return Author;
    }
    if (value.title) {
      return Book;
    }
    return null;
  },
});

```

#### 模式优先

要在模式优先方法中定义联合类型，请使用 SDL 创建一个 GraphQL 联合类型：

```graphql
type Author {
  name: String!
}

type Book {
  title: String!
}

union ResultUnion = Author | Book

```

然后，你可以使用类型生成功能（如 [GraphQL quick start](/graphql/quick-start) 章节所示）来生成相应的 TypeScript 定义：

```typescript
export class Author {
  name: string;
}

export class Book {
  title: string;
}

export type ResultUnion = Author | Book;

```

联合类型需要在解析器映射中额外提供一个 `__resolveType` 字段，以确定该联合类型解析为哪种类型。创建一个 `ResultUnionResolver` 类并定义 `__resolveType` 方法，该方法返回具体类型的名称。记得在模块中将 `ResultUnionResolver` 注册为提供者。

```typescript
@Resolver('ResultUnion')
export class ResultUnionResolver {
  @ResolveField()
  __resolveType(value) {
    if (value.name) {
      return 'Author';
    }
    if (value.title) {
      return 'Book';
    }
    return null;
  }
}

```

> info **提示** 所有装饰器都从 `@nestjs/graphql` 包中导出。

### 枚举

枚举类型是一种特殊的标量类型，被限制为一组特定的允许值（参见 GraphQL 文档中的 [enumeration types](https://graphql.org/learn/schema/#enumeration-types)）。它们允许你：

- 验证此类型的任何参数都是允许值之一
- 通过类型系统表明某个字段始终是有限值集合中的一个

#### 代码优先

在代码优先方法中，你通过创建 TypeScript 枚举来定义 GraphQL 枚举类型：

```typescript
export enum AllowedColor {
  RED,
  GREEN,
  BLUE,
}

```

完成这些之后，使用从 `@nestjs/graphql` 包中导出的 `registerEnumType` 函数注册 `AllowedColor` 枚举：

```typescript
registerEnumType(AllowedColor, {
  name: 'AllowedColor',
});

```

现在你可以在类型中引用 `AllowedColor`：

```typescript
@Field(type => AllowedColor)
favoriteColor: AllowedColor;

```

这会在 SDL 中生成以下部分的 GraphQL 模式：

```graphql
enum AllowedColor {
  RED
  GREEN
  BLUE
}

```

要为枚举提供描述，请将 `description` 属性传给 `registerEnumType()` 函数：

```typescript
registerEnumType(AllowedColor, {
  name: 'AllowedColor',
  description: 'The supported colors.',
});

```

要为枚举值提供描述，或将某个值标记为已弃用，请传入 `valuesMap` 属性：

```typescript
registerEnumType(AllowedColor, {
  name: 'AllowedColor',
  description: 'The supported colors.',
  valuesMap: {
    RED: {
      description: 'The default color.',
    },
    BLUE: {
      deprecationReason: 'Too blue.',
    },
  },
});

```

这会在 SDL 中生成以下 GraphQL 模式：

```graphql
"""
The supported colors.
"""
enum AllowedColor {
  """
  The default color.
  """
  RED
  GREEN
  BLUE @deprecated(reason: "Too blue.")
}

```

#### 模式优先

要在模式优先方法中定义枚举，请使用 SDL 创建一个 GraphQL 枚举：

```graphql
enum AllowedColor {
  RED
  GREEN
  BLUE
}

```

然后你可以使用类型生成功能（如 [GraphQL quick start](/graphql/quick-start) 章节所示）来生成相应的 TypeScript 定义：

```typescript
export enum AllowedColor {
  RED = "RED",
  GREEN = "GREEN",
  BLUE = "BLUE"
}

```

有时后端为枚举使用的内部值与公共 API 中暴露的值不同。在此示例中，API 包含 `RED`，但解析器改用 `#f00`（参见 Apollo 文档中的 [internal values](https://www.apollographql.com/docs/apollo-server/schema/scalars-enums/#internal-values)）。为此，请为 `AllowedColor` 枚举声明一个解析器对象：

```typescript
export const allowedColorResolver: Partial<Record<keyof typeof AllowedColor, any>> = {
  RED: '#f00',
};

```

> info **提示** 所有装饰器都从 `@nestjs/graphql` 包中导出。

然后将此解析器对象传入 `GraphQLModule#forRoot()` 方法的 `resolvers` 属性中：

```typescript
GraphQLModule.forRoot({
  resolvers: {
    AllowedColor: allowedColorResolver,
  },
});

```