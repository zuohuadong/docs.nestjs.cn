<!-- 此文件从 content/graphql/mutations.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T09:59:55.481Z -->
<!-- 源文件: content/graphql/mutations.md -->
<!-- 源哈希: a6db8640d3752bfe2de2e4ee1d3d61d8 -->

### 变更

大多数关于 GraphQL 的讨论都聚焦于数据获取，但任何完整的数据平台都需要一种修改服务端数据的方式。在 REST 中，任何请求都可能在服务端产生副作用，但最佳实践是不在 `GET` 请求中修改数据。GraphQL 与之类似：从技术上讲，任何查询都可以被实现为写入数据。然而，与 REST 一样，约定是将任何会导致写入的操作显式地作为变更发送（参见 GraphQL 文档中的 [Mutations](https://graphql.org/learn/queries/#变更)）。

官方 [Apollo documentation](https://www.apollographql.com/docs/graphql-tools/generate-schema.html) 使用了一个 `upvotePost()` 变更示例，它会递增帖子的 `votes` 属性。要在 Nest 中创建等效的变更，请使用 `@Mutation()` 装饰器。

#### 代码优先

向 [Resolvers](/graphql/resolvers-map) 章节中的 `AuthorsResolver` 添加另一个方法。

```typescript
@Mutation(() => Post)
async upvotePost(@Args({ name: 'postId', type: () => Int }) postId: number) {
  return this.postsService.upvoteById({ id: postId });
}

```

> info **提示** 所有装饰器（例如 `@Resolver`、`@ResolveField`、`@Args` 等）都从 `@nestjs/graphql` 包中导出。

这会在 SDL 中生成 GraphQL 模式的以下部分：

```graphql
type Mutation {
  upvotePost(postId: Int!): Post!
}

```

`upvotePost()` 方法接受 `postId`（`Int`）作为参数，并返回更新后的 `Post` 实体。出于 [Resolvers](/graphql/resolvers-map) 章节中解释的原因，你必须显式设置期望的类型。

如果变更需要接受一个对象作为参数，请创建一个**输入类型**。输入类型是一种特殊类型的对象类型，可以作为参数传入（参见 GraphQL 文档中的 [Input types](https://graphql.org/learn/schema/#input-types)）。要声明输入类型，请使用 `@InputType()` 装饰器。

```typescript
import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class UpvotePostInput {
  @Field()
  postId: number;
}

```

> info **提示** `@InputType()` 装饰器接受一个选项对象作为参数，因此你可以例如指定输入类型的描述。由于 TypeScript 元数据反射系统的限制，你必须要么使用 `@Field()` 装饰器来指示类型，要么使用 [CLI plugin](/graphql/cli-plugin)。

然后你可以在解析器类中使用此类型：

```typescript
@Mutation(() => Post)
async upvotePost(
  @Args('upvotePostData') upvotePostData: UpvotePostInput,
) {}

```

#### 模式优先

扩展 [Resolvers](/graphql/resolvers-map) 章节中的 `AuthorsResolver`。

```typescript
@Mutation()
async upvotePost(@Args('postId') postId: number) {
  return this.postsService.upvoteById({ id: postId });
}

```

此示例假设业务逻辑（查询帖子并递增其 `votes` 属性）位于 `PostsService` 中。该逻辑可以根据需要简单或复杂。此示例的重点是展示解析器如何与其他提供者交互。

最后一步是将变更添加到现有的类型定义中。

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

`upvotePost(postId: Int!): Post` 变更现在是应用程序 GraphQL API 的一部分。