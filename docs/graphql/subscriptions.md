<!-- 此文件从 content/graphql/subscriptions.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:33:37.090Z -->
<!-- 源文件: content/graphql/subscriptions.md -->
<!-- 源哈希: fa1d5a8c81518f6804b231d2a3438ede -->

### 订阅

除了使用查询获取数据和使用变更修改数据之外，GraphQL 规范还支持第三种操作类型，称为`subscription`。GraphQL 订阅将数据从服务器推送给选择监听实时消息的客户端。与查询一样，订阅指定要发送给客户端的字段集。然而，它们不是立即返回单个结果，而是打开一个通道，每当发生特定事件时，服务器就会向客户端发送一个结果。

订阅的常见用例是通知客户端特定事件，例如新对象的创建或字段的更新（参见 Apollo 文档中的 [Subscriptions](https://www.apollographql.com/docs/react/data/subscriptions)）。

#### 使用 Apollo driver 启用订阅

订阅通过 [graphql-ws](https://github.com/enisdenjo/graphql-ws) 包在 WebSocket 上传输。`@nestjs/graphql` 已经依赖它，但如果您直接从中导入（例如，[Authentication over WebSockets](/graphql/subscriptions#websockets-上的身份验证) 中使用的 `Context` 类型），也请将其安装到您的项目中：

```bash
$ npm i --save graphql-ws

```

然后启用传输：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  subscriptions: {
    'graphql-ws': true,
  },
}),

```

> 警告 **警告** 对 `subscriptions-transport-ws` 的支持已在 `@nestjs/graphql` v14 中**移除**。该包不再是依赖项，并且 `'subscriptions-transport-ws'` 键不再被接受在 `subscriptions` 选项对象中。如果您正在升级，请将该键替换为 `'graphql-ws'`，并更新您的客户端以使用新协议。这两个协议在网络上不兼容，因此仍使用 `subscriptions-transport-ws` 的客户端将无法连接。`onConnect` 回调签名也不同：使用 `graphql-ws` 时，它接收连接上下文，额外的上下文值应放在其 `extra` 字段中（参见下文 [Authentication over WebSockets](/graphql/subscriptions#websockets-上的身份验证)）。

#### 代码优先

要使用代码优先的方法创建订阅，请使用 `@Subscription()` 装饰器（从 `@nestjs/graphql` 包导出）和 `PubSub` 类（来自 `graphql-subscriptions` 包），它提供了一个简单的 **发布/订阅 API**。

以下订阅处理器通过调用 `PubSub#asyncIterableIterator` **订阅**一个事件。此方法接受单个参数，即 `triggerName`，它对应于事件主题名称。

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

> 信息 **提示** 所有装饰器都从 `@nestjs/graphql` 包导出，而 `PubSub` 类则从 `graphql-subscriptions` 包导出（`npm i graphql-subscriptions`）。

> 警告 **注意** `PubSub` 是一个暴露简单 `publish` 和 `subscribe` API 的类。更多信息请参阅 [graphql-subscriptions setup guide](https://www.apollographql.com/docs/graphql-subscriptions/setup.html)。Apollo 文档警告说 [default implementation](https://github.com/apollographql/graphql-subscriptions#getting-started-with-your-first-subscription) 不适合生产环境。生产应用程序应使用由外部存储支持的 `PubSub` 实现（参见 [PubSub implementations](https://github.com/apollographql/graphql-subscriptions#pubsub-implementations) 列表）。

这在 SDL 中生成以下 GraphQL 模式部分：

```graphql
type Subscription {
  commentAdded: Comment!
}

```

根据定义，订阅返回一个具有单个顶层属性的对象，该属性的键是订阅的名称。该名称要么继承自订阅处理器方法的名称（即上面的 `commentAdded`），要么通过 `@Subscription()` 装饰器第二个参数中的 `name` 选项明确提供，如下所示。

```typescript
@Subscription(() => Comment, {
  name: 'commentAdded',
})
subscribeToCommentAdded() {
  return pubSub.asyncIterableIterator('commentAdded');
}

```

此结构生成与前一个代码示例相同的 SDL，但将方法名称与订阅名称解耦。

#### 发布

要发布事件，请使用 `PubSub#publish` 方法。它通常在变更对象图的一部分时触发客户端更新的变更中被调用。例如：

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

`PubSub#publish` 方法接受一个 `triggerName`（再次，将其视为事件主题名称）作为第一个参数，以及一个事件负载作为第二个参数。如前所述，订阅根据定义返回一个值，该值具有形状。再次查看 `commentAdded` 订阅生成的 SDL：

```graphql
type Subscription {
  commentAdded: Comment!
}

```

这告诉我们，订阅必须返回一个具有名为 `commentAdded` 的顶层属性的对象，其值为一个 `Comment` 对象。由 `PubSub#publish` 方法发出的事件负载的形状必须与订阅预期返回值的形状匹配。在上面的示例中，`pubSub.publish('commentAdded', { commentAdded: newComment })` 语句发布了一个具有适当形状负载的 `commentAdded` 事件。如果形状不匹配，当事件被解析时，订阅将失败。

#### 过滤订阅

要过滤掉特定事件，请将 `filter` 属性设置为一个过滤函数。此函数类似于传递给数组的 `filter()` 方法的回调。它接受两个参数：包含事件负载（由事件发布者发送）的 `payload`，以及包含订阅请求中传递的任何参数的 `variables`。它返回一个布尔值，以确定事件是否应发布给客户端监听器。

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

要转换发布的事件负载，请将 `resolve` 属性设置为一个函数。该函数接收事件负载（由事件发布者发送），并返回适当的值。

```typescript
@Subscription(() => Comment, {
  resolve: value => value,
})
commentAdded() {
  return pubSub.asyncIterableIterator('commentAdded');
}

```

> 警告 **注意** 如果您使用 `resolve` 选项，请返回未包装的负载（在我们的示例中，直接返回 `newComment` 对象，而不是 `{ commentAdded: newComment }` 对象）。

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

相同的构造适用于过滤器：

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

要转换发布的负载，请使用 `resolve` 函数。

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

相同的构造适用于过滤器：

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

通过此，我们创建了一个单一的 `commentAdded(title: String!): Comment` 订阅。完整的 [schema first sample](https://github.com/nestjs/nest/blob/master/sample/12-graphql-schema-first) 可在 NestJS 仓库中找到。

#### PubSub

上面的示例实例化了一个本地 `PubSub` 实例。首选方法是将 `PubSub` 定义为 [provider](/fundamentals/dependency-injection)，并通过构造函数注入（使用 `@Inject()` 装饰器），以便在整个应用程序中重用相同的实例。例如，按如下方式定义一个提供者，然后在需要的地方注入 `'PUB_SUB'`。

```typescript
{
  provide: 'PUB_SUB',
  useValue: new PubSub(),
}

```

#### 自定义订阅服务器

要自定义订阅服务器（例如，更改其路径，默认为 GraphQL 端点路径），请在 `subscriptions` 属性中传递一个选项对象用于 `graphql-ws`：

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

要自行配置底层 WebSocket 服务器（例如，启用 `perMessageDeflate`、限制 `maxPayload` 或添加 `verifyClient` 检查），请创建一个 [`ws`](https://github.com/websockets/ws) `WebSocketServer` 并将其作为 `server` 传递：

```typescript
import { WebSocketServer } from 'ws';

GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  subscriptions: {
    'graphql-ws': {
      server: new WebSocketServer({
        noServer: true,
        path: '/subscriptions',
        maxPayload: 1024 * 1024,
      }),
    },
  },
});

```

- 服务器必须使用 `noServer: true` 创建：Nest 将 HTTP 升级请求路由到它，否则抛出异常。
- 如果服务器具有 `path`，它优先于 `graphql-ws.path` 和 GraphQL 端点路径。
- 服务器被交给 `graphql-ws`，它替换其 `handleProtocols` 选项，并在应用程序关闭时关闭它并移除所有监听器。
- 为每个 `GraphQLModule` 使用单独的服务器；模块之间不能共享一个实例。

当另一个 `upgrade` 监听器共享 HTTP 服务器时（例如，使用 [`WsAdapter`](/websockets/adapter#ws-库) 的网关），Nest 会将其他路径的升级请求留给它，如果一秒内没有监听器响应握手，则关闭连接。如果另一个监听器延迟响应，例如在认证请求后，请使用 `unclaimedUpgradeTimeout`（毫秒）提高延迟，或设置为 `0`，将此类连接留给其他监听器：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  subscriptions: {
    'graphql-ws': {
      unclaimedUpgradeTimeout: 5000,
    },
  },
});

```

> info **提示** 仅支持 `ws` 实现。`graphql-ws` 的 Fastify 和 uWebSockets 适配器不能以这种方式插入。

#### WebSocket 上的认证

要检查用户是否已认证，请使用 `onConnect` 回调函数，您可以在 `subscriptions` 选项中指定它。

使用 `graphql-ws` 时，`onConnect` 回调会接收连接上下文，包括 `connectionParams`。

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

> info **提示** 您还可以传递一个选项对象来设置自定义发射器、验证传入连接等。请参阅 [Mercurius plugin options](https://github.com/mercurius-js/mercurius/blob/master/docs/api/options.md#plugin-options) 中的 `subscription` 选项。

#### 代码优先

要使用代码优先的方法创建订阅，请使用 `@Subscription()` 装饰器（从 `@nestjs/graphql` 包导出）和来自 `mercurius` 包的 `PubSub` 类，它提供了一个简单的 **发布/订阅 API**。

以下订阅处理器通过调用 `PubSub#subscribe` **订阅** 一个事件。此方法将主题名称作为其参数。

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

> info **提示** 上述示例中使用的所有装饰器都从 `@nestjs/graphql` 包导出，而 `PubSub` 类从 `mercurius` 包导出。

> warning **注意** `PubSub` 是一个暴露简单 `publish` 和 `subscribe` API 的类。要注册自定义 `PubSub` 类，请参阅 Mercurius 文档中的 [Subscriptions with custom PubSub](https://github.com/mercurius-js/mercurius/blob/master/docs/subscriptions.md#subscriptions-with-custom-pubsub)。

这在 SDL 中生成了以下 GraphQL 模式部分：

```graphql
type Subscription {
  commentAdded: Comment!
}

```

订阅根据定义返回一个具有单个顶级属性的对象，其键是订阅的名称。该名称要么继承自订阅处理器方法的名称（即上面的 `commentAdded`），要么通过 `@Subscription()` 装饰器第二个参数中的 `name` 选项明确提供，如下所示。

```typescript
@Subscription(() => Comment, {
  name: 'commentAdded',
})
subscribeToCommentAdded(@Context('pubsub') pubSub: PubSub) {
  return pubSub.subscribe('commentAdded');
}

```

此构造生成与前一个代码示例相同的 SDL，但将方法名称与订阅名称解耦。

#### 发布

要发布事件，请使用 `PubSub#publish` 方法。它通常在变更对象图的一部分时触发客户端更新的变更中被调用。例如：

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

如前所述，订阅根据定义返回一个值，该值具有形状。再次查看 `commentAdded` 订阅生成的 SDL：

```graphql
type Subscription {
  commentAdded: Comment!
}

```

这告诉我们，订阅必须返回一个具有名为 `commentAdded` 的顶级属性的对象，其值为一个 `Comment` 对象。由 `PubSub#publish` 方法发出的事件负载的形状必须与订阅预期返回的值的形状匹配。在上面的示例中，`pubSub.publish({ topic: 'commentAdded', payload: { commentAdded: newComment } })` 语句发布了一个具有适当形状负载的 `commentAdded` 事件。如果形状不匹配，当事件解析时订阅将失败。

#### 过滤订阅

要过滤掉特定事件，请将 `filter` 属性设置为一个过滤函数。此函数类似于传递给数组的 `filter()` 方法的回调。它接受两个参数：包含事件负载（由事件发布者发送）的 `payload`，以及包含订阅请求中传递的任何参数的 `variables`。它返回一个布尔值，以确定事件是否应发布到客户端监听器。

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

这样，我们就创建了一个单一的 `commentAdded(title: String!): Comment` 订阅。

#### PubSub

上面的示例使用了默认的 `PubSub` 发射器（[mqemitter](https://github.com/mcollina/mqemitter)）。在生产环境中，首选的方法是使用 `mqemitter-redis`。或者，您可以提供自定义 `PubSub` 实现（参见 Mercurius 文档中的 [Subscriptions](https://github.com/mercurius-js/mercurius/blob/master/docs/subscriptions.md)）。

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

#### WebSockets 上的认证

要检查用户是否已认证，请使用 `verifyClient` 回调函数，您可以在 `subscription` 选项中指定它。

`verifyClient` 回调接收 `info` 对象作为第一个参数，您可以使用它来读取请求的头部。

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