<!-- 此文件从 content/graphql/subscriptions.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T09:59:43.098Z -->
<!-- 源文件: content/graphql/subscriptions.md -->
<!-- 源哈希: b9cea10e49e17afd3eea193fb73ec85a -->

### 订阅

除了使用查询获取数据和使用变更修改数据之外，GraphQL 规范还支持第三种操作类型，称为 `subscription`。GraphQL 订阅将数据从服务器推送给那些选择监听实时消息的客户端。与查询类似，订阅会指定一组要传递给客户端的字段。然而，订阅不会立即返回单个结果，而是打开一个通道，每当特定事件发生时，服务器就会向客户端发送一个结果。

订阅的一个常见用例是通知客户端特定的事件，例如创建新对象或更新字段（参见 Apollo 文档中的 [Subscriptions](https://www.apollographql.com/docs/react/data/subscriptions)）。

#### 使用 Apollo 驱动启用订阅

订阅通过 [graphql-ws](https://github.com/enisdenjo/graphql-ws) 包经由 WebSocket 传输。`@nestjs/graphql` 已经依赖它，但如果你直接从中导入（例如 [Authentication over WebSockets](/graphql/subscriptions#websockets-上的身份验证) 中使用的 `Context` 类型），也请在你的项目中安装它：

```bash
$ npm i --save graphql-ws

```

然后启用该传输方式：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  subscriptions: {
    'graphql-ws': true,
  },
}),

```

> warning **警告** 对 `subscriptions-transport-ws` 的支持已在 `@nestjs/graphql` v14 中**移除**。该包不再是依赖项，`subscriptions` 选项对象中也不再接受 `'subscriptions-transport-ws'` 键。如果你正在升级，请将该键替换为 `'graphql-ws'`，并将你的客户端更新到更新的协议。这两种协议在传输层不兼容，因此仍在使用 `subscriptions-transport-ws` 的客户端将无法连接。`onConnect` 回调签名也有所不同：使用 `graphql-ws` 时，它接收连接上下文，额外的上下文值应放在其 `extra` 字段中（参见下方的 [Authentication over WebSockets](/graphql/subscriptions#websockets-上的身份验证)）。

#### 代码优先

要使用代码优先方法创建订阅，请使用 `@Subscription()` 装饰器（从 `@nestjs/graphql` 包导出）以及来自 `graphql-subscriptions` 包的 `PubSub` 类，它提供了一个简单的**发布/订阅 API**。

下面的订阅处理程序通过调用 `PubSub#asyncIterableIterator` 来**订阅**某个事件。该方法接受单个参数，即 `triggerName`，它对应于事件主题名称。

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

> info **提示** 所有装饰器都从 `@nestjs/graphql` 包导出，而 `PubSub` 类则从 `graphql-subscriptions` 包导出（`npm i graphql-subscriptions`）。

> warning **注意** `PubSub` 是一个暴露简单 `publish` 和 `subscribe` API 的类。可在 [graphql-subscriptions setup guide](https://www.apollographql.com/docs/graphql-subscriptions/setup.html) 中了解更多。Apollo 文档警告说 [default implementation](https://github.com/apollographql/graphql-subscriptions#getting-started-with-your-first-subscription) 不适合用于生产环境。生产应用应使用由外部存储支持的 `PubSub` 实现（参见 [PubSub implementations](https://github.com/apollographql/graphql-subscriptions#pubsub-implementations) 列表）。

这会在 SDL 中生成以下部分的 GraphQL 模式：

```graphql
type Subscription {
  commentAdded: Comment!
}

```

根据定义，订阅返回一个对象，该对象具有一个单一的顶层属性，其键即为订阅的名称。该名称要么继承自订阅处理程序方法的名称（即上面的 `commentAdded`），要么通过 `@Subscription()` 装饰器第二个参数中的 `name` 选项显式提供，如下所示。

```typescript
@Subscription(() => Comment, {
  name: 'commentAdded',
})
subscribeToCommentAdded() {
  return pubSub.asyncIterableIterator('commentAdded');
}

```

此构造生成的 SDL 与前面的代码示例相同，但将方法名与订阅名解耦。

#### 发布

要发布事件，请使用 `PubSub#publish` 方法。它通常在变更中调用，以便在对象图的某部分发生变化时触发客户端更新。例如：

```typescript title="posts/posts.resolver.ts"
@Mutation(() => Comment)
async addComment(
  @Args('postId', { type: () => Int }) postId: number,
  @Args('comment', { type: () => CommentInput }) comment: CommentInput,
) {
  const newComment = this.commentsService.addComment({ id: postId, comment });
  pubSub.publish('commentAdded', { commentAdded: newComment });
  return newComment;
}

```

`PubSub#publish` 方法将 `triggerName`（同样，可以将其视为事件主题名称）作为第一个参数，并将事件负载作为第二个参数。如前所述，根据定义，订阅会返回一个值，而该值具有某种形状。再次查看为 `commentAdded` 订阅生成的 SDL：

```graphql
type Subscription {
  commentAdded: Comment!
}

```

这告诉我们，订阅必须返回一个对象，该对象具有一个名为 `commentAdded` 的顶层属性，其值为一个 `Comment` 对象。由 `PubSub#publish` 方法发出的事件负载的形状必须与订阅预期返回的值的形状相匹配。在上面的示例中，`pubSub.publish('commentAdded', { commentAdded: newComment })` 语句发布了一个 `commentAdded` 事件，其负载形状是合适的。如果形状不匹配，订阅在解析事件时就会失败。

#### 过滤订阅

要过滤掉特定事件，请将 `filter` 属性设置为一个过滤函数。该函数的工作方式类似于传递给数组 `filter()` 方法的回调。它接受两个参数：`payload`，包含事件负载（由事件发布者发送）；以及 `variables`，包含随订阅请求传入的任何参数。它返回一个布尔值，用于决定该事件是否应发布给客户端监听者。

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

要转换已发布的事件负载，请将 `resolve` 属性设置为一个函数。该函数接收事件负载（由事件发布者发送）并返回适当的值。

```typescript
@Subscription(() => Comment, {
  resolve: value => value,
})
commentAdded() {
  return pubSub.asyncIterableIterator('commentAdded');
}

```

> warning **注意** 如果你使用 `resolve` 选项，请返回未包装的负载（在我们的示例中，直接返回 `newComment` 对象，而不是 `{ commentAdded: newComment }` 对象）。

要访问注入的提供者（例如，使用外部服务验证数据），请使用以下构造。

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

同样的构造也适用于过滤器：

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

#### 模式优先

要在 Nest 中创建等效的订阅，请使用 `@Subscription()` 装饰器。

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

要根据上下文和参数过滤掉特定事件，请设置 `filter` 属性。

```typescript
@Subscription('commentAdded', {
  filter: (payload, variables) =>
    payload.commentAdded.title === variables.title,
})
commentAdded() {
  return pubSub.asyncIterableIterator('commentAdded');
}

```

要转换已发布的负载，请使用 `resolve` 函数。

```typescript
@Subscription('commentAdded', {
  resolve: value => value,
})
commentAdded() {
  return pubSub.asyncIterableIterator('commentAdded');
}

```

要访问注入的提供者（例如，使用外部服务验证数据），请使用以下构造：

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

同样的构造也适用于过滤器：

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

至此，我们创建了一个 `commentAdded(title: String!): Comment` 订阅。完整的 [schema first sample](https://github.com/nestjs/nest/blob/master/sample/12-graphql-schema-first) 可在 NestJS 仓库中找到。

#### PubSub

上面的示例实例化了一个本地的 `PubSub` 实例。更推荐的做法是将 `PubSub` 定义为一个 [provider](/fundamentals/dependency-injection)，并通过构造函数注入它（使用 `@Inject()` 装饰器），这样同一个实例就能在整个应用程序中复用。例如，按如下方式定义一个提供者，然后在需要的地方注入 `'PUB_SUB'`。

```typescript
{
  provide: 'PUB_SUB',
  useValue: new PubSub(),
}

```

#### 自定义订阅服务器

要自定义订阅服务器（例如，更改其路径，该路径默认为 GraphQL 端点路径），请在 `subscriptions` 属性中为 `graphql-ws` 传入一个选项对象：

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

#### 基于 WebSocket 的认证

要检查用户是否已认证，请使用 `onConnect` 回调函数，你可以在 `subscriptions` 选项中指定它。

使用 `graphql-ws` 时，`onConnect` 回调会接收连接上下文，其中包含 `connectionParams`。

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

> info **提示** 你也可以传入一个选项对象来设置自定义发射器、验证传入连接等。请参阅 [Mercurius plugin options](https://github.com/mercurius-js/mercurius/blob/master/docs/api/options.md#plugin-options) 中的 `subscription` 选项。

#### 代码优先

要使用代码优先的方式创建订阅，请使用 `@Subscription()` 装饰器（从 `@nestjs/graphql` 包中导出）以及 `mercurius` 包中的 `PubSub` 类，它提供了一个简单的 **发布/订阅 API**。

下面的订阅处理程序通过调用 `PubSub#subscribe` 来**订阅**一个事件。该方法以主题名称作为其参数。

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

> info **提示** 上面示例中使用的所有装饰器都从 `@nestjs/graphql` 包中导出，而 `PubSub` 类则从 `mercurius` 包中导出。

> warning **注意** `PubSub` 是一个类，它暴露了一个简单的 `publish` 和 `subscribe` API。要注册自定义的 `PubSub` 类，请参阅 Mercurius 文档中的 [Subscriptions with custom PubSub](https://github.com/mercurius-js/mercurius/blob/master/docs/subscriptions.md#subscriptions-with-custom-pubsub)。

这会在 SDL 中生成 GraphQL 模式的以下部分：

```graphql
type Subscription {
  commentAdded: Comment!
}

```

根据定义，订阅会返回一个对象，该对象带有一个顶层属性，其键即为订阅的名称。这个名称要么继承自订阅处理程序方法的名称（即上面的 `commentAdded`），要么通过 `@Subscription()` 装饰器第二个参数中的 `name` 选项显式提供，如下所示。

```typescript
@Subscription(() => Comment, {
  name: 'commentAdded',
})
subscribeToCommentAdded(@Context('pubsub') pubSub: PubSub) {
  return pubSub.subscribe('commentAdded');
}

```

这种构造生成的 SDL 与前面的代码示例相同，但将方法名与订阅名解耦了。

#### 发布

要发布事件，请使用 `PubSub#publish` 方法。它通常在变更（mutation）中调用，以便在对象图的某一部分发生变化时触发客户端更新。例如：

```typescript title="posts/posts.resolver.ts"
@Mutation(() => Comment)
async addComment(
  @Args('postId', { type: () => Int }) postId: number,
  @Args('comment', { type: () => CommentInput }) comment: CommentInput,
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

如前所述，根据定义，订阅会返回一个值，而该值具有某种形状。再次查看为 `commentAdded` 订阅生成的 SDL：

```graphql
type Subscription {
  commentAdded: Comment!
}

```

这告诉我们，订阅必须返回一个对象，该对象带有一个名为 `commentAdded` 的顶层属性，其值为一个 `Comment` 对象。由 `PubSub#publish` 方法发出的事件负载的形状必须与订阅预期返回的值的形状相匹配。在上面的示例中，`pubSub.publish({ topic: 'commentAdded', payload: { commentAdded: newComment } })` 语句发布了一个 `commentAdded` 事件，其负载形状是匹配的。如果形状不匹配，订阅在解析事件时就会失败。

#### 过滤订阅

要过滤掉特定事件，请将 `filter` 属性设置为一个过滤函数。该函数的工作方式类似于传递给数组 `filter()` 方法的回调。它接收两个参数：`payload`，包含事件负载（由事件发布者发送）；以及 `variables`，包含随订阅请求传入的任何参数。它返回一个布尔值，用于决定该事件是否应发布给客户端监听者。

```typescript
@Subscription(() => Comment, {
  filter: (payload, variables) =>
    payload.commentAdded.title === variables.title,
})
commentAdded(@Args('title') title: string, @Context('pubsub') pubSub: PubSub) {
  return pubSub.subscribe('commentAdded');
}

```

要访问注入的提供者（例如，使用外部服务验证数据），请使用以下构造。

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

#### 模式优先

要在 Nest 中创建等效的订阅，请使用 `@Subscription()` 装饰器。

```typescript
@Resolver('Author')
export class AuthorResolver {
  // ...
  @Subscription()
  commentAdded(@Context('pubsub') pubSub: PubSub) {
    return pubSub.subscribe('commentAdded');
  }
}

```

要根据上下文和参数过滤掉特定事件，请设置 `filter` 属性。

```typescript
@Subscription('commentAdded', {
  filter: (payload, variables) =>
    payload.commentAdded.title === variables.title,
})
commentAdded(@Context('pubsub') pubSub: PubSub) {
  return pubSub.subscribe('commentAdded');
}

```

要访问注入的提供者（例如，使用外部服务验证数据），请使用以下构造：

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

至此，我们创建了一个 `commentAdded(title: String!): Comment` 订阅。

#### PubSub

上面的示例使用了默认的 `PubSub` 发射器（[mqemitter](https://github.com/mcollina/mqemitter)）。在生产环境中，更推荐的做法是使用 `mqemitter-redis`。或者，你也可以提供一个自定义的 `PubSub` 实现（请参阅 Mercurius 文档中的 [Subscriptions](https://github.com/mercurius-js/mercurius/blob/master/docs/subscriptions.md)）。

```typescript
import mqemitterRedis from 'mqemitter-redis';

GraphQLModule.forRoot<MercuriusDriverConfig>({
  driver: MercuriusDriver,
  subscription: {
    emitter: mqemitterRedis({
      port: 6579,
      host: '127.0.0.1',
    }),
  },
});

```

#### 基于 WebSocket 的认证

要检查用户是否已认证，请使用 `verifyClient` 回调函数，你可以在 `subscription` 选项中指定它。

`verifyClient` 回调会将 `info` 对象作为其第一个参数接收，你可以用它来读取请求的头部。

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