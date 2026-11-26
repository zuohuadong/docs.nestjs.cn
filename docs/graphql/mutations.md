<!-- 此文件从 content/graphql/mutations.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:06:37.434Z -->
<!-- 源文件: content/graphql/mutations.md -->
<!-- 源哈希: a34413bfd44762725dbfed6c8a3809d9 -->

### 变更 (Mutations)

大多数关于 GraphQL 的讨论都集中在数据获取上，但任何完整的数据平台都需要一种修改服务器端数据的能力。在 REST 中，任何请求都可能对服务器产生副作用，但最佳实践是不在 `GET` 请求中修改数据。GraphQL 类似：从技术上讲，任何查询都可以实现数据写入。然而，与 REST 一样，惯例是将任何导致写入的操作明确地作为变更（参见 GraphQL 文档中的 [Mutations](https://graphql.org/learn/queries/#变更)）发送。

官方的 [Apollo documentation](https://www.apollographql.com/docs/graphql-tools/generate-schema.html) 使用了一个 `upvotePost()` 变更示例，该示例递增了帖子的 `votes` 属性。要在 Nest 中创建等效的变更，请使用 `@Mutation()` 装饰器。

#### 代码优先 (Code first)

在 [Resolvers](/graphql/resolvers-map) 章的 `AuthorsResolver` 中添加另一个方法。

```typescript
@Mutation(() => Post)
async upvotePost(@Args({ name: 'postId', type: () => Int }) postId: number) {
  return this.postsService.upvoteById({ id: postId });
}

```

> info **提示** 所有装饰器（例如 `@Resolver`、`@ResolveField`、`@Args` 等）都从 `@nestjs/graphql` 包导出。

这在 SDL 中生成了以下 GraphQL 模式部分：

```graphql
type Mutation {
  upvotePost(postId: Int!): Post!
}

```

`upvotePost()` 方法接收 `postId`（`Int`）作为参数，并返回更新后的 `Post` 实体。出于 [Resolvers](/graphql/resolvers-map) 章中解释的原因，您必须明确设置预期的类型。

如果变更需要接收一个对象作为参数，请创建一个**输入类型**。输入类型是一种特殊的对象类型，可以作为参数传入（参见 GraphQL 文档中的 [Input types](https://graphql.org/learn/schema/#input-types)）。要声明输入类型，请使用 `@InputType()` 装饰器。

```typescript
import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class UpvotePostInput {
  @Field()
  postId: number;
}

```

> info **提示** `@InputType()` 装饰器接收一个选项对象作为参数，因此您可以例如指定输入类型的描述。由于 TypeScript 元数据反射系统的限制，您必须使用 `@Field()` 装饰器来指示类型，或者使用 [CLI plugin](/graphql/cli-plugin)。

然后您可以在解析器类中使用此类型：

```typescript
@Mutation(() => Post)
async upvotePost(
  @Args('upvotePostData') upvotePostData: UpvotePostInput,
) {}

```

#### 变更负载查询 (Mutation payload query)

变更负载可以暴露根 `Query` 类型，这样客户端可以在单次往返中在变更后重新获取任何数据。在代码优先方法中，通过名称引用生成的根类型：

```typescript
@ObjectType()
export class AddTodoPayload {
  @Field(() => Todo)
  todo: Todo;

  @Field(() => 'Query')
  query: object;
}

@Mutation(() => AddTodoPayload)
addTodo(@Args('title') title: string) {
  const todo = this.todosService.create(title);
  return { todo, query: {} };
}

```

任何值都可以作为 `query` 值（一个空对象就足够了），因为根查询解析器不依赖于其父级。在模式优先方法中，在 SDL 中为负载类型声明 `query: Query!`。

#### 模式优先 (Schema first)

扩展 [Resolvers](/graphql/resolvers-map) 章中的 `AuthorsResolver`。

```typescript
@Mutation()
async upvotePost(@Args('postId') postId: number) {
  return this.postsService.upvoteById({ id: postId });
}

```

此示例假设业务逻辑（查询帖子并递增其 `votes` 属性）存在于 `PostsService` 中。该逻辑可以像需要的那样简单或复杂。此示例的重点是展示解析器如何与其他提供者交互。

最后一步是将变更添加到现有类型定义中。

```graphql
type Author {
  id: Int!
  firstName: String
  lastName: String
  posts: [Post]
}

type Post {
  id: Int!
  title: String
  votes: Int
}

type Query {
  author(id: Int!): Author
}

type Mutation {
  upvotePost(postId: Int!): Post
}

```

`upvotePost(postId: Int!): Post` 变更现已成为应用程序 GraphQL API 的一部分。