<!-- 此文件从 content/graphql/subscriptions.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:30:35.037Z -->
<!-- 源文件: content/graphql/subscriptions.md -->
<!-- 源哈希: 7c459cf3cbf1685a308e5737a66673fb -->

### 订阅

除了使用查询获取数据和使用变更修改数据之外，GraphQL 规范还支持第三种操作类型，称为 `subscription`。GraphQL 订阅是一种将数据从服务器推送到选择监听服务器实时消息的客户端的方式。订阅与查询类似，它们指定一组要传递给客户端的字段，但不是立即返回单个答案，而是打开一个通道，每次服务器上发生特定事件时，都会向客户端发送结果。

订阅的一个常见用例是通知客户端特定事件，例如创建新对象、更新字段等（了解更多 [here](https://www.apollographql.com/docs/react/data/subscriptions)）。

#### 使用 Apollo 驱动启用订阅

订阅通过 [graphql-ws](https://github.com/enisdenjo/graphql-ws) 包在 WebSockets 上进行传输，该包未与 `@nestjs/apollo` 捆绑。首先安装它：

```bash
$ npm i --save graphql-ws

```

然后显式启用传输：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  subscriptions: {
    'graphql-ws': true,
  },
}),

```

> warning **警告** 对 `subscriptions-transport-ws` 的支持已在 `@nestjs/graphql` v14 中**移除**。该包不再是依赖项，`'subscriptions-transport-ws'` 键不再被 `subscriptions` 选项对象接受。如果您正在升级，请安装 `graphql-ws`，将该键替换为 `'graphql-ws'`，并更新您的客户端以使用更新的协议 - 两者在线上不兼容，因此仍使用 `subscriptions-transport-ws` 的客户端将无法连接。另请注意，`onConnect` 回调签名在两者之间有所不同：使用 `graphql-ws` 时，它接收连接上下文，额外的上下文值属于其 `extra` 字段（参见下面的 [Authentication over WebSockets](/graphql/subscriptions#websockets-上的身份验证)）。

#### 代码优先

要使用代码优先方法创建订阅，我们使用 `@Subscription()` 装饰器（从 `@nestjs/graphql` 包导出）和来自 `graphql-subscriptions` 包的 `PubSub` 类，该类提供了简单的**发布/订阅 API**。

以下订阅处理器通过调用 `PubSub#asyncIterableIterator` 来处理**订阅**事件。此方法接受一个参数，即 `triggerName`，它对应事件主题名称。

```typescript
const pubSub = new PubSub();

@Resolver(() => Author)
export class AuthorResolver {
  // ...
  @Subscription(() => Comment)
  commentAdded() {
    return pubSub.asyncIterableIterator('commentAdded');
  }
}

```

> info **提示** 所有装饰器都从 `@nestjs/graphql` 包导出，而 `PubSub` 类从 `graphql-subscriptions` 包导出。

> warning **注意** `PubSub` 是一个暴露简单 `publish` 和 `subscribe API` 的类。了解更多 [here](https://www.apollographql.com/docs/graphql-subscriptions/setup.html)。请注意，Apollo 文档警告默认实现不适合生产环境（了解更多 [here](https://github.com/apollographql/graphql-subscriptions#getting-started-with-your-first-subscription)）。生产应用应使用由外部存储支持的 `PubSub` 实现（了解更多 [here](https://github.com/apollographql/graphql-subscriptions#pubsub-implementations)）。

这将导致在 SDL 中生成以下 GraphQL 模式部分：

```graphql
type Subscription {
  commentAdded(): Comment!
}

```

请注意，订阅按定义返回一个对象，该对象具有单个顶级属性，其键是订阅的名称。此名称要么继承自订阅处理器方法的名称（即上面的 `commentAdded`），要么通过将带有键 `name` 的选项作为第二个参数传递给 `@Subscription()` 装饰器来显式提供，如下所示。

```typescript
@Subscription(() => Comment, {
  name: 'commentAdded',
})
subscribeToCommentAdded() {
  return pubSub.asyncIterableIterator('commentAdded');
}

```

此构造产生与之前代码示例相同的 SDL，但允许我们将方法名称与订阅解耦。

#### 发布

现在，要发布事件，我们使用 `PubSub#publish` 方法。这通常在变更中使用，以在对象图的一部分发生变化时触发客户端更新。例如：

```typescript title="posts/posts.resolver.ts"
@Mutation(() => Comment)
async addComment(
  @Args('postId', { type: () => Int }) postId: number,
  @Args('comment', { type: () => Comment }) comment: CommentInput,
) {
  const newComment = this.commentsService.addComment({ id: postId, comment });
  pubSub.publish('commentAdded', { commentAdded: newComment });
  return newComment;
}

```

`PubSub#publish` 方法将 `triggerName`（再次，将其视为事件主题名称）作为第一个参数，将事件负载作为第二个参数。如前所述，订阅按定义返回一个值，并且该值具有形状。再次查看我们 `commentAdded` 订阅的生成 SDL：

```graphql
type Subscription {
  commentAdded(): Comment!
}

```

这告诉我们订阅必须返回一个对象，其顶级属性名称为 `commentAdded`，其值为 `Comment` 对象。需要注意的重要一点是，`PubSub#publish` 方法发出的事件负载的形状必须与订阅预期返回的值的形状相对应。因此，在上面的示例中，`pubSub.publish('commentAdded', { commentAdded: newComment })` 语句发布了具有适当形状负载的 `commentAdded` 事件。如果这些形状不匹配，您的订阅将在 GraphQL 验证阶段失败。

#### 过滤订阅

要过滤掉特定事件，请将 `filter` 属性设置为过滤器函数。此函数类似于传递给数组 `filter` 的函数。它接受两个参数：包含事件负载（由事件发布者发送）的 `payload`，以及接受订阅请求期间传递的任何参数的 `variables`。它返回一个布尔值，确定是否应将此事件发布给客户端监听器。

```typescript
@Subscription(() => Comment, {
  filter: (payload, variables) =>
    payload.commentAdded.title === variables.title,
})
commentAdded(@Args('title') title: string) {
  return pubSub.asyncIterableIterator('commentAdded');
}

```

#### 变更订阅负载

要变更已发布的事件负载，请将 `resolve` 属性设置为函数。该函数接收事件负载（由事件发布者发送）并返回适当的值。

```typescript
@Subscription(() => Comment, {
  resolve: value => value,
})
commentAdded() {
  return pubSub.asyncIterableIterator('commentAdded');
}

```

> warning **注意** 如果您使用 `resolve` 选项，则应返回未包装的负载（例如，在我们的示例中，直接返回 `newComment` 对象，而不是 `{ commentAdded: newComment }` 对象）。

如果需要访问注入的提供者（例如，使用外部服务来验证数据），请使用以下构造。

```typescript
@Subscription(() => Comment, {
  resolve(this: AuthorResolver, value) {
    // "this" refers to an instance of "AuthorResolver"
    return value;
  }
})
commentAdded() {
  return pubSub.asyncIterableIterator('commentAdded');
}

```

相同的构造也适用于过滤器：

```typescript
@Subscription(() => Comment, {
  filter(this: AuthorResolver, payload, variables) {
    // "this" refers to an instance of "AuthorResolver"
    return payload.commentAdded.title === variables.title;
  }
})
commentAdded() {
  return pubSub.asyncIterableIterator('commentAdded');
}

```

#### Schema first

要在 Nest 中创建等效的订阅，我们将使用 `@Subscription()` 装饰器。

```typescript
const pubSub = new PubSub();

@Resolver('Author')
export class AuthorResolver {
  // ...
  @Subscription()
  commentAdded() {
    return pubSub.asyncIterableIterator('commentAdded');
  }
}

```

要根据上下文和参数过滤特定事件，请设置 `filter` 属性。

```typescript
@Subscription('commentAdded', {
  filter: (payload, variables) =>
    payload.commentAdded.title === variables.title,
})
commentAdded() {
  return pubSub.asyncIterableIterator('commentAdded');
}

```

要变更已发布的事件负载，我们可以使用 `resolve` 函数。

```typescript
@Subscription('commentAdded', {
  resolve: value => value,
})
commentAdded() {
  return pubSub.asyncIterableIterator('commentAdded');
}

```

如果需要访问注入的提供者（例如，使用外部服务来验证数据），请使用以下构造：

```typescript
@Subscription('commentAdded', {
  resolve(this: AuthorResolver, value) {
    // "this" refers to an instance of "AuthorResolver"
    return value;
  }
})
commentAdded() {
  return pubSub.asyncIterableIterator('commentAdded');
}

```

相同的构造也适用于过滤器：

```typescript
@Subscription('commentAdded', {
  filter(this: AuthorResolver, payload, variables) {
    // "this" refers to an instance of "AuthorResolver"
    return payload.commentAdded.title === variables.title;
  }
})
commentAdded() {
  return pubSub.asyncIterableIterator('commentAdded');
}

```

最后一步是更新类型定义文件。

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

type Comment {
  id: String
  content: String
}

type Subscription {
  commentAdded(title: String!): Comment
}

```

至此，我们已经创建了一个单独的 `commentAdded(title: String!): Comment` 订阅。您可以在 [here](https://github.com/nestjs/nest/blob/master/sample/12-graphql-schema-first) 找到完整的示例实现。

#### PubSub

我们在上面实例化了一个本地的 `PubSub` 实例。推荐的做法是将 `PubSub` 定义为 [provider](/fundamentals/dependency-injection)，并通过构造函数（使用 `@Inject()` 装饰器）注入它。这使我们能够在整个应用程序中重用该实例。例如，按如下方式定义一个提供者，然后在需要的地方注入 `'PUB_SUB'`。

```typescript
{
  provide: 'PUB_SUB',
  useValue: new PubSub(),
}

```

#### 自定义订阅服务器

要自定义订阅服务器（例如，更改路径），请使用带有 `graphql-ws` 的 `subscriptions` 选项属性：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  subscriptions: {
    'graphql-ws': {
      path: '/graphql',
    },
  },
});

```

#### 通过 WebSocket 进行认证

可以在 `subscriptions` 选项中指定的 `onConnect` 回调函数中检查用户是否已认证。

使用 `graphql-ws` 时，`onConnect` 回调接收连接上下文，包括 `connectionParams`。

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  subscriptions: {
    'graphql-ws': {
      onConnect: (context: Context<any>) => {
        const { connectionParams, extra } = context;
        const authToken = connectionParams.authToken;
        if (!isValid(authToken)) {
          throw new Error('Token is not valid');
        }
        // when using graphql-ws, additional context values should be stored in the extra field
        extra.user = { user: {} };
      },
    },
  },
  context: ({ extra }) => {
    // you can now access your additional context value through the extra field
  },
});

```

#### 使用 Mercurius 驱动启用订阅

要启用订阅，请将 `subscription` 属性设置为 `true`。

```typescript
GraphQLModule.forRoot<MercuriusDriverConfig>({
  driver: MercuriusDriver,
  subscription: true,
}),

```

> info **提示** 您还可以传递选项对象来设置自定义事件发射器、验证传入连接等。在 [here](https://github.com/mercurius-js/mercurius/blob/master/docs/api/options.md#plugin-options) 中了解更多信息（参见 `subscription`）。

#### Code first

要使用 code first 方法创建订阅，我们使用 `@Subscription()` 装饰器（从 `@nestjs/graphql` 包中导出）以及从 `mercurius` 包中导出的 `PubSub` 类，该类提供了简单的**发布/订阅 API**。

以下订阅处理器通过调用 `PubSub#asyncIterableIterator` 来**订阅**事件。此方法接受一个参数，即 `triggerName`，它对应事件主题名称。

```typescript
@Resolver(() => Author)
export class AuthorResolver {
  // ...
  @Subscription(() => Comment)
  commentAdded(@Context('pubsub') pubSub: PubSub) {
    return pubSub.subscribe('commentAdded');
  }
}

```

> info **提示** 上面示例中使用的所有装饰器均从 `@nestjs/graphql` 包中导出，而 `PubSub` 类从 `mercurius` 包中导出。

> warning **注意** `PubSub` 是一个暴露了简单 `publish` 和 `subscribe` API 的类。查看 [this section](https://github.com/mercurius-js/mercurius/blob/master/docs/subscriptions.md#subscriptions-with-custom-pubsub) 了解如何注册自定义的 `PubSub` 类。

这将生成以下 GraphQL 模式的 SDL 部分：

```graphql
type Subscription {
  commentAdded(): Comment!
}

```

请注意，订阅根据定义返回一个对象，该对象具有一个顶级属性，其键为订阅的名称。此名称要么继承自订阅处理器方法的名称（即上面的 `commentAdded`），要么通过将带有键 `name` 的选项作为第二个参数传递给 `@Subscription()` 装饰器来显式提供，如下所示。

```typescript
@Subscription(() => Comment, {
  name: 'commentAdded',
})
subscribeToCommentAdded(@Context('pubsub') pubSub: PubSub) {
  return pubSub.subscribe('commentAdded');
}

```

此构造生成与之前代码示例相同的 SDL，但允许我们将方法名称与订阅解耦。

#### 发布

现在，要发布事件，我们使用 `PubSub#publish` 方法。这通常用于在对象图的某部分发生更改时，在变更操作中触发客户端更新。例如：

```typescript title="posts/posts.resolver.ts"
@Mutation(() => Comment)
async addComment(
  @Args('postId', { type: () => Int }) postId: number,
  @Args('comment', { type: () => Comment }) comment: CommentInput,
  @Context('pubsub') pubSub: PubSub,
) {
  const newComment = this.commentsService.addComment({ id: postId, comment });
  await pubSub.publish({
    topic: 'commentAdded',
    payload: {
      commentAdded: newComment
    }
  });
  return newComment;
}

```

如前所述，订阅根据定义返回一个值，并且该值具有特定的形状。再次查看我们为 `commentAdded` 订阅生成的 SDL：

```graphql
type Subscription {
  commentAdded(): Comment!
}

```

这告诉我们，订阅必须返回一个对象，其顶级属性名称为 `commentAdded`，该属性的值是一个 `Comment` 对象。需要重点注意的是，由 `PubSub#publish` 方法发出的事件负载的形状必须与订阅预期返回的值的形状相对应。因此，在上面的示例中，`pubSub.publish({ topic: 'commentAdded', payload: { commentAdded: newComment } })` 语句发布了一个具有适当形状负载的 `commentAdded` 事件。如果这些形状不匹配，您的订阅将在 GraphQL 验证阶段失败。

#### 过滤订阅

要过滤特定事件，请将 `filter` 属性设置为过滤器函数。此函数类似于传递给数组 `filter` 的函数。它接受两个参数：包含事件负载（由事件发布者发送）的 `payload`，以及接受订阅请求期间传递的任何参数的 `variables`。它返回一个布尔值，确定是否应将此事件发布给客户端监听器。

```typescript
@Subscription(() => Comment, {
  filter: (payload, variables) =>
    payload.commentAdded.title === variables.title,
})
commentAdded(@Args('title') title: string, @Context('pubsub') pubSub: PubSub) {
  return pubSub.subscribe('commentAdded');
}

```

如果需要访问注入的提供者（例如，使用外部服务来验证数据），请使用以下构造。

```typescript
@Subscription(() => Comment, {
  filter(this: AuthorResolver, payload, variables) {
    // "this" refers to an instance of "AuthorResolver"
    return payload.commentAdded.title === variables.title;
  }
})
commentAdded(@Args('title') title: string, @Context('pubsub') pubSub: PubSub) {
  return pubSub.subscribe('commentAdded');
}

```

#### Schema first

要在 Nest 中创建等效的订阅，我们将使用 `@Subscription()` 装饰器。

```typescript
const pubSub = new PubSub();

@Resolver('Author')
export class AuthorResolver {
  // ...
  @Subscription()
  commentAdded(@Context('pubsub') pubSub: PubSub) {
    return pubSub.subscribe('commentAdded');
  }
}

```

要根据上下文和参数过滤特定事件，请设置 `filter` 属性。

```typescript
@Subscription('commentAdded', {
  filter: (payload, variables) =>
    payload.commentAdded.title === variables.title,
})
commentAdded(@Context('pubsub') pubSub: PubSub) {
  return pubSub.subscribe('commentAdded');
}

```

如果需要访问注入的提供者（例如，使用外部服务来验证数据），请使用以下构造：

```typescript
@Subscription('commentAdded', {
  filter(this: AuthorResolver, payload, variables) {
    // "this" refers to an instance of "AuthorResolver"
    return payload.commentAdded.title === variables.title;
  }
})
commentAdded(@Context('pubsub') pubSub: PubSub) {
  return pubSub.subscribe('commentAdded');
}

```

最后一步是更新类型定义文件。

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

type Comment {
  id: String
  content: String
}

type Subscription {
  commentAdded(title: String!): Comment
}

```

这样，我们就创建了一个 `commentAdded(title: String!): Comment` 订阅。

#### PubSub

在上面的示例中，我们使用了默认的 `PubSub` 发射器（[mqemitter](https://github.com/mcollina/mqemitter)）。首选方法（用于生产环境）是使用 `mqemitter-redis`。或者，可以提供自定义的 `PubSub` 实现（了解更多 [here](https://github.com/mercurius-js/mercurius/blob/master/docs/subscriptions.md)）。

```typescript
GraphQLModule.forRoot<MercuriusDriverConfig>({
  driver: MercuriusDriver,
  subscription: {
    emitter: require('mqemitter-redis')({
      port: 6579,
      host: '127.0.0.1',
    }),
  },
});

```

#### 基于 WebSocket 的认证

可以在 `subscription` 选项中指定的 `verifyClient` 回调函数内部检查用户是否已认证。

`verifyClient` 将接收 `info` 对象作为第一个参数，您可以使用它来检索请求的请求头。

```typescript
GraphQLModule.forRoot<MercuriusDriverConfig>({
  driver: MercuriusDriver,
  subscription: {
    verifyClient: (info, next) => {
      const authorization = info.req.headers?.authorization as string;
      if (!authorization?.startsWith('Bearer ')) {
        return next(false);
      }
      next(true);
    },
  }
}),

```