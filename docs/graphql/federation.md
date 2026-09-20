<!-- 此文件从 content/graphql/federation.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:41:50.544Z -->
<!-- 源文件: content/graphql/federation.md -->
<!-- 源哈希: 10544a2413452430cc4a406e8f6d3f98 -->

### 联邦

联邦提供了一种将单体 GraphQL 服务器拆分为独立微服务的方式。它由两个组件组成：一个网关和一个或多个联邦微服务。每个微服务持有部分模式，网关将这些模式合并为单个模式，供客户端消费。

引用 [Apollo docs](https://blog.apollographql.com/apollo-federation-f260cf525d21)，联邦的设计遵循以下核心原则：

- 构建图应该是**声明式的。** 使用联邦，你可以从模式内部声明式地组合图，而不是编写命令式的模式拼接代码。
- 代码应按**关注点**分离，而不是按类型分离。通常没有单个团队能控制像 User 或 Product 这样的重要类型的每个方面，因此这些类型的定义应分布在团队和代码库之间，而不是集中管理。
- 图应该易于客户端消费。联邦服务共同形成一个完整的、以产品为中心的图，准确反映客户端的使用方式。
- 它只是 **GraphQL**，仅使用语言中符合规范的特性。任何语言（不仅仅是 JavaScript）都可以实现联邦。

> warning **警告** 联邦目前不支持订阅。

在接下来的章节中，我们将设置一个演示应用程序，包含一个网关和两个联邦端点：Users 服务和 Posts 服务。

#### 使用 Apollo 实现联邦

首先安装所需的依赖：

```bash
$ npm install --save @apollo/subgraph

```

#### Schema first

"User service" 提供了一个简单的模式。注意 `@key` 指令：它指示 Apollo 查询规划器，如果你指定了 `id`，则可以获取 `User` 的特定实例。另外，注意我们 `extend` 了 `Query` 类型。

```graphql
type User @key(fields: "id") {
  id: ID!
  name: String!
}

extend type Query {
  getUser(id: ID!): User
}

```

解析器提供了一个额外的方法，名为 `resolveReference()`。每当相关资源需要 User 实例时，Apollo Gateway 会触发此方法。我们稍后会在 Posts 服务中看到一个示例。请注意，该方法必须使用 `@ResolveReference()` 装饰器进行注解。

```typescript
import { Args, Query, Resolver, ResolveReference } from '@nestjs/graphql';
import { UsersService } from './users.service.js';

@Resolver('User')
export class UsersResolver {
  constructor(private usersService: UsersService) {}

  @Query()
  getUser(@Args('id') id: string) {
    return this.usersService.findById(id);
  }

  @ResolveReference()
  resolveReference(reference: { __typename: string; id: string }) {
    return this.usersService.findById(reference.id);
  }
}

```

最后，我们通过在配置对象中注册 `GraphQLModule` 并传入 `ApolloFederationDriver` 驱动程序来将所有内容连接起来：

```typescript
import {
  ApolloFederationDriver,
  ApolloFederationDriverConfig,
} from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { UsersResolver } from './users.resolver.js';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      typePaths: ['**/*.graphql'],
    }),
  ],
  providers: [UsersResolver],
})
export class AppModule {}

```

#### Code first

首先，向 `User` 实体添加一些额外的装饰器。

```ts
import { Directive, Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
@Directive('@key(fields: "id")')
export class User {
  @Field(() => ID)
  id: number;

  @Field()
  name: string;
}

```

解析器提供了一个额外的方法，名为 `resolveReference()`。每当相关资源需要 User 实例时，Apollo Gateway 会触发此方法。我们稍后会在 Posts 服务中看到一个示例。请注意，该方法必须使用 `@ResolveReference()` 装饰器进行注解。

```ts
import { Args, Query, Resolver, ResolveReference } from '@nestjs/graphql';
import { User } from './user.entity.js';
import { UsersService } from './users.service.js';

@Resolver(() => User)
export class UsersResolver {
  constructor(private usersService: UsersService) {}

  @Query(() => User)
  getUser(@Args('id') id: number): User {
    return this.usersService.findById(id);
  }

  @ResolveReference()
  resolveReference(reference: { __typename: string; id: number }): User {
    return this.usersService.findById(reference.id);
  }
}

```

最后，我们通过在配置对象中注册 `GraphQLModule` 并传入 `ApolloFederationDriver` 驱动程序来将所有内容连接起来：

```typescript
import {
  ApolloFederationDriver,
  ApolloFederationDriverConfig,
} from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { UsersResolver } from './users.resolver.js';
import { UsersService } from './users.service.js'; // Not included in this example

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      autoSchemaFile: true,
    }),
  ],
  providers: [UsersResolver, UsersService],
})
export class AppModule {}

```

一个可用的示例可在 [here](https://github.com/nestjs/nest/tree/master/sample/31-graphql-federation-code-first/users-application)（code first 模式）和 [here](https://github.com/nestjs/nest/tree/master/sample/32-graphql-federation-schema-first/users-application)（schema first 模式）中找到。

#### 联邦示例：Posts

Post 服务旨在通过 `getPosts` 查询提供聚合的帖子，同时使用 `user.posts` 字段扩展我们的 `User` 类型。

#### Schema first

"Posts service" 通过使用 `extend` 关键字在其模式中引用 `User` 类型。它还在 `User` 类型上声明了一个额外的属性（`posts`）。注意用于匹配 User 实例的 `@key` 指令，以及指示 `id` 字段在其他地方管理的 `@external` 指令。

```graphql
type Post @key(fields: "id") {
  id: ID!
  title: String!
  body: String!
  user: User
}

extend type User @key(fields: "id") {
  id: ID! @external
  posts: [Post]
}

extend type Query {
  getPosts: [Post]
}

```

在以下示例中，`PostsResolver` 提供了 `getUser()` 方法，该方法返回一个包含 `__typename` 以及应用程序解析引用可能需要的其他属性（在本例中为 `id`）的引用。`__typename` 被 GraphQL Gateway 用于定位负责 User 类型的微服务并检索相应的实例。在执行 `resolveReference()` 方法时，将请求上述的 "Users service"。

```typescript
import { Query, Resolver, Parent, ResolveField } from '@nestjs/graphql';
import { PostsService } from './posts.service.js';
import type { Post } from './posts.interfaces.js';

@Resolver('Post')
export class PostsResolver {
  constructor(private postsService: PostsService) {}

  @Query('getPosts')
  getPosts() {
    return this.postsService.findAll();
  }

  @ResolveField('user')
  getUser(@Parent() post: Post) {
    return { __typename: 'User', id: post.userId };
  }
}

```

最后，我们必须注册 `GraphQLModule`，与我们在 "Users service" 部分所做的类似。

```typescript
import {
  ApolloFederationDriver,
  ApolloFederationDriverConfig,
} from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { PostsResolver } from './posts.resolver.js';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      typePaths: ['**/*.graphql'],
    }),
  ],
  providers: [PostsResolver],
})
export class AppModule {}

```

#### Code first

首先，我们需要声明一个表示 `User` 实体的类。尽管该实体本身位于另一个服务中，但我们将在此处使用它（扩展其定义）。注意 `@extends` 和 `@external` 指令。

```ts
import { Directive, ObjectType, Field, ID } from '@nestjs/graphql';
import { Post } from './post.entity.js';

@ObjectType()
@Directive('@extends')
@Directive('@key(fields: "id")')
export class User {
  @Field(() => ID)
  @Directive('@external')
  id: number;

  @Field(() => [Post])
  posts?: Post[];
}

```

现在，让我们为 `User` 实体的扩展创建相应的解析器，如下所示：

```ts
import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { PostsService } from './posts.service.js';
import { Post } from './post.entity.js';
import { User } from './user.entity.js';

@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly postsService: PostsService) {}

  @ResolveField(() => [Post])
  public posts(@Parent() user: User): Post[] {
    return this.postsService.forAuthor(user.id);
  }
}

```

我们还需要定义 `Post` 实体类：

```ts
import { Directive, Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { User } from './user.entity.js';

@ObjectType()
@Directive('@key(fields: "id")')
export class Post {
  @Field(() => ID)
  id: number;

  @Field()
  title: string;

  @Field(() => Int)
  authorId: number;

  @Field(() => User)
  user?: User;
}

```

以及它的解析器：

```ts
import { Query, Args, ResolveField, Resolver, Parent } from '@nestjs/graphql';
import { PostsService } from './posts.service.js';
import { Post } from './post.entity.js';
import { User } from './user.entity.js';

@Resolver(() => Post)
export class PostsResolver {
  constructor(private readonly postsService: PostsService) {}

  @Query(() => Post)
  findPost(@Args('id') id: number): Post {
    return this.postsService.findOne(id);
  }

  @Query(() => [Post])
  getPosts(): Post[] {
    return this.postsService.all();
  }

  @ResolveField(() => User)
  user(@Parent() post: Post): any {
    return { __typename: 'User', id: post.authorId };
  }
}

```

最后，将其整合到一个模块中。注意模式构建选项，我们在其中指定 `User` 是一个孤立的（外部）类型。

```ts
import {
  ApolloFederationDriver,
  ApolloFederationDriverConfig,
} from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { User } from './user.entity.js';
import { PostsResolver } from './posts.resolvers.js';
import { UsersResolver } from './users.resolvers.js';
import { PostsService } from './posts.service.js'; // Not included in example

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      autoSchemaFile: true,
      buildSchemaOptions: {
        orphanedTypes: [User],
      },
    }),
  ],
  providers: [PostsResolver, UsersResolver, PostsService],
})
export class AppModule {}

```

一个可用的示例可在 [here](https://github.com/nestjs/nest/tree/master/sample/31-graphql-federation-code-first/posts-application)（code first 模式）和 [here](https://github.com/nestjs/nest/tree/master/sample/32-graphql-federation-schema-first/posts-application)（schema first 模式）中找到。

#### 联邦示例：Gateway

首先安装所需的依赖：

```bash
$ npm install --save @apollo/gateway

```

网关需要指定端点列表，它将自动发现相应的模式。因此，网关服务的实现对于 code first 和 schema first 方法都是相同的。

```typescript
import { IntrospectAndCompose } from '@apollo/gateway';
import { ApolloGatewayDriver, ApolloGatewayDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloGatewayDriverConfig>({
      driver: ApolloGatewayDriver,
      server: {
        // ... Apollo server options
        cors: true,
      },
      gateway: {
        supergraphSdl: new IntrospectAndCompose({
          subgraphs: [
            { name: 'users', url: 'http://user-service/graphql' },
            { name: 'posts', url: 'http://post-service/graphql' },
          ],
        }),
      },
    }),
  ],
})
export class AppModule {}

```

一个可用的示例可在 [here](https://github.com/nestjs/nest/tree/master/sample/31-graphql-federation-code-first/gateway)（code first 模式）和 [here](https://github.com/nestjs/nest/tree/master/sample/32-graphql-federation-schema-first/gateway)（schema first 模式）中找到。

#### 使用 Mercurius 实现联邦

首先安装所需的依赖：

```bash
$ npm install --save @apollo/subgraph @nestjs/mercurius

```

> info **注意** 需要 `@apollo/subgraph` 包来构建子图模式（`buildSubgraphSchema`、`printSubgraphSchema` 函数）。

#### Schema 优先

“User 服务”提供了一个简单的模式。注意 `@key` 指令：它指示 Mercurius 查询规划器，如果指定了 `User` 的 `id`，则可以获取该特定实例。另外，请注意我们 `extend` 了 `Query` 类型。

```graphql
type User @key(fields: "id") {
  id: ID!
  name: String!
}

extend type Query {
  getUser(id: ID!): User
}

```

解析器提供了一个额外的方法，名为 `resolveReference()`。每当相关资源需要 User 实例时，Mercurius Gateway 就会触发此方法。我们稍后会在 Posts 服务中看到示例。请注意，该方法必须使用 `@ResolveReference()` 装饰器进行注解。

```typescript
import { Args, Query, Resolver, ResolveReference } from '@nestjs/graphql';
import { UsersService } from './users.service.js';

@Resolver('User')
export class UsersResolver {
  constructor(private usersService: UsersService) {}

  @Query()
  getUser(@Args('id') id: string) {
    return this.usersService.findById(id);
  }

  @ResolveReference()
  resolveReference(reference: { __typename: string; id: string }) {
    return this.usersService.findById(reference.id);
  }
}

```

最后，我们通过注册 `GraphQLModule` 并在配置对象中传递 `MercuriusFederationDriver` 驱动程序来将所有内容连接起来：

```typescript
import {
  MercuriusFederationDriver,
  MercuriusFederationDriverConfig,
} from '@nestjs/mercurius';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { UsersResolver } from './users.resolver.js';

@Module({
  imports: [
    GraphQLModule.forRoot<MercuriusFederationDriverConfig>({
      driver: MercuriusFederationDriver,
      typePaths: ['**/*.graphql'],
      federationMetadata: true,
    }),
  ],
  providers: [UsersResolver],
})
export class AppModule {}

```

#### 代码优先

首先向 `User` 实体添加一些额外的装饰器。

```ts
import { Directive, Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
@Directive('@key(fields: "id")')
export class User {
  @Field(() => ID)
  id: number;

  @Field()
  name: string;
}

```

解析器提供了一个额外的方法，名为 `resolveReference()`。每当相关资源需要 User 实例时，Mercurius Gateway 就会触发此方法。我们稍后会在 Posts 服务中看到示例。请注意，该方法必须使用 `@ResolveReference()` 装饰器进行注解。

```ts
import { Args, Query, Resolver, ResolveReference } from '@nestjs/graphql';
import { User } from './user.entity.js';
import { UsersService } from './users.service.js';

@Resolver(() => User)
export class UsersResolver {
  constructor(private usersService: UsersService) {}

  @Query(() => User)
  getUser(@Args('id') id: number): User {
    return this.usersService.findById(id);
  }

  @ResolveReference()
  resolveReference(reference: { __typename: string; id: number }): User {
    return this.usersService.findById(reference.id);
  }
}

```

最后，我们通过注册 `GraphQLModule` 并在配置对象中传递 `MercuriusFederationDriver` 驱动程序来将所有内容连接起来：

```typescript
import {
  MercuriusFederationDriver,
  MercuriusFederationDriverConfig,
} from '@nestjs/mercurius';
import { Module } from '@nestjs/common';
import { UsersResolver } from './users.resolver.js';
import { UsersService } from './users.service.js'; // Not included in this example

@Module({
  imports: [
    GraphQLModule.forRoot<MercuriusFederationDriverConfig>({
      driver: MercuriusFederationDriver,
      autoSchemaFile: true,
      federationMetadata: true,
    }),
  ],
  providers: [UsersResolver, UsersService],
})
export class AppModule {}

```

#### 联邦示例：Posts

Post 服务应该通过 `getPosts` 查询提供聚合的帖子，但也要用 `user.posts` 字段扩展我们的 `User` 类型。

#### Schema 优先

“Posts 服务”通过使用 `extend` 关键字标记其模式中的 `User` 类型来引用它。它还在 `User` 类型上声明了一个额外的属性（`posts`）。注意用于匹配 User 实例的 `@key` 指令，以及指示 `id` 字段在其他地方管理的 `@external` 指令。

```graphql
type Post @key(fields: "id") {
  id: ID!
  title: String!
  body: String!
  user: User
}

extend type User @key(fields: "id") {
  id: ID! @external
  posts: [Post]
}

extend type Query {
  getPosts: [Post]
}

```

在以下示例中，`PostsResolver` 提供了 `getUser()` 方法，该方法返回一个包含 `__typename` 以及应用程序解析引用可能需要的其他属性的引用，在本例中为 `id`。GraphQL Gateway 使用 `__typename` 来定位负责 User 类型的微服务并检索相应的实例。执行 `resolveReference()` 方法时，将请求上述的“Users 服务”。

```typescript
import { Query, Resolver, Parent, ResolveField } from '@nestjs/graphql';
import { PostsService } from './posts.service.js';
import type { Post } from './posts.interfaces.js';

@Resolver('Post')
export class PostsResolver {
  constructor(private postsService: PostsService) {}

  @Query('getPosts')
  getPosts() {
    return this.postsService.findAll();
  }

  @ResolveField('user')
  getUser(@Parent() post: Post) {
    return { __typename: 'User', id: post.userId };
  }
}

```

最后，我们必须注册 `GraphQLModule`，类似于我们在“Users 服务”部分所做的操作。

```typescript
import {
  MercuriusFederationDriver,
  MercuriusFederationDriverConfig,
} from '@nestjs/mercurius';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { PostsResolver } from './posts.resolver.js';

@Module({
  imports: [
    GraphQLModule.forRoot<MercuriusFederationDriverConfig>({
      driver: MercuriusFederationDriver,
      federationMetadata: true,
      typePaths: ['**/*.graphql'],
    }),
  ],
  providers: [PostsResolver],
})
export class AppModule {}

```

#### 代码优先

首先，我们必须声明一个表示 `User` 实体的类。尽管实体本身位于另一个服务中，但我们将在此处使用它（扩展其定义）。注意 `@extends` 和 `@external` 指令。

```ts
import { Directive, ObjectType, Field, ID } from '@nestjs/graphql';
import { Post } from './post.entity.js';

@ObjectType()
@Directive('@extends')
@Directive('@key(fields: "id")')
export class User {
  @Field(() => ID)
  @Directive('@external')
  id: number;

  @Field(() => [Post])
  posts?: Post[];
}

```

现在让我们为 `User` 实体上的扩展创建相应的解析器，如下所示：

```ts
import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { PostsService } from './posts.service.js';
import { Post } from './post.entity.js';
import { User } from './user.entity.js';

@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly postsService: PostsService) {}

  @ResolveField(() => [Post])
  public posts(@Parent() user: User): Post[] {
    return this.postsService.forAuthor(user.id);
  }
}

```

我们还必须定义 `Post` 实体类：

```ts
import { Directive, Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { User } from './user.entity.js';

@ObjectType()
@Directive('@key(fields: "id")')
export class Post {
  @Field(() => ID)
  id: number;

  @Field()
  title: string;

  @Field(() => Int)
  authorId: number;

  @Field(() => User)
  user?: User;
}

```

及其解析器：

```ts
import { Query, Args, ResolveField, Resolver, Parent } from '@nestjs/graphql';
import { PostsService } from './posts.service.js';
import { Post } from './post.entity.js';
import { User } from './user.entity.js';

@Resolver(() => Post)
export class PostsResolver {
  constructor(private readonly postsService: PostsService) {}

  @Query(() => Post)
  findPost(@Args('id') id: number): Post {
    return this.postsService.findOne(id);
  }

  @Query(() => [Post])
  getPosts(): Post[] {
    return this.postsService.all();
  }

  @ResolveField(() => User)
  user(@Parent() post: Post): any {
    return { __typename: 'User', id: post.authorId };
  }
}

```

最后，将其绑定在一个模块中。注意模式构建选项，我们在其中指定 `User` 是一个孤立的（外部）类型。

```ts
import {
  MercuriusFederationDriver,
  MercuriusFederationDriverConfig,
} from '@nestjs/mercurius';
import { Module } from '@nestjs/common';
import { User } from './user.entity.js';
import { PostsResolver } from './posts.resolvers.js';
import { UsersResolver } from './users.resolvers.js';
import { PostsService } from './posts.service.js'; // Not included in example

@Module({
  imports: [
    GraphQLModule.forRoot<MercuriusFederationDriverConfig>({
      driver: MercuriusFederationDriver,
      autoSchemaFile: true,
      federationMetadata: true,
      buildSchemaOptions: {
        orphanedTypes: [User],
      },
    }),
  ],
  providers: [PostsResolver, UsersResolver, PostsService],
})
export class AppModule {}

```

#### 联邦示例：Gateway

网关需要指定端点列表，它将自动发现相应的模式。因此，网关服务的实现对于代码优先和 Schema 优先方法都将保持不变。

```typescript
import {
  MercuriusGatewayDriver,
  MercuriusGatewayDriverConfig,
} from '@nestjs/mercurius';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';

@Module({
  imports: [
    GraphQLModule.forRoot<MercuriusGatewayDriverConfig>({
      driver: MercuriusGatewayDriver,
      gateway: {
        services: [
          { name: 'users', url: 'http://user-service/graphql' },
          { name: 'posts', url: 'http://post-service/graphql' },
        ],
      },
    }),
  ],
})
export class AppModule {}

```

### Federation 2

引用 [Apollo docs](https://www.apollographql.com/docs/federation/federation-2/new-in-federation-2) 的话，Federation 2 改善了原始 Apollo Federation（本文档中称为 Federation 1）的开发者体验，它与大多数原始 supergraph 向后兼容。

> warning **警告** Mercurius 不完全支持 Federation 2。您可以查看支持 Federation 2 的库列表 [here](https://www.apollographql.com/docs/federation/supported-subgraphs#javascript--typescript)。

在以下部分中，我们将把之前的示例升级到 Federation 2。

#### 联邦示例：Users

Federation 2 的一个变化是实体没有原始子图，因此我们不再需要扩展 `Query`。更多详情请参阅 Apollo Federation 2 文档中的 [the entities topic](https://www.apollographql.com/docs/federation/federation-2/new-in-federation-2#entities)。

#### Schema 优先

我们可以简单地从模式中移除 `extend` 关键字。

```graphql
type User @key(fields: "id") {
  id: ID!
  name: String!
}

type Query {
  getUser(id: ID!): User
}

```

#### 代码优先

要使用 Federation 2，我们需要在 `autoSchemaFile` 选项中指定 federation 版本。

```ts
import {
  ApolloFederationDriver,
  ApolloFederationDriverConfig,
} from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { UsersResolver } from './users.resolver.js';
import { UsersService } from './users.service.js'; // Not included in this example

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      autoSchemaFile: {
        federation: 2,
      },
    }),
  ],
  providers: [UsersResolver, UsersService],
})
export class AppModule {}

```

#### 联邦示例：Posts

由于与上述相同的原因，我们不再需要扩展 `User` 和 `Query`。

#### Schema 优先

我们可以简单地从模式中移除 `extend` 和 `external` 指令

```graphql
type Post @key(fields: "id") {
  id: ID!
  title: String!
  body: String!
  user: User
}

type User @key(fields: "id") {
  id: ID!
  posts: [Post]
}

type Query {
  getPosts: [Post]
}

```

#### 代码优先

由于我们不再扩展 `User` 实体，我们可以简单地从 `User` 中移除 `extends` 和 `external` 指令。

```ts
import { Directive, ObjectType, Field, ID } from '@nestjs/graphql';
import { Post } from './post.entity.js';

@ObjectType()
@Directive('@key(fields: "id")')
export class User {
  @Field(() => ID)
  id: number;

  @Field(() => [Post])
  posts?: Post[];
}

```

另外，与 User 服务类似，我们需要在 `GraphQLModule` 中指定使用 Federation 2。

```ts
import {
  ApolloFederationDriver,
  ApolloFederationDriverConfig,
} from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { User } from './user.entity.js';
import { PostsResolver } from './posts.resolvers.js';
import { UsersResolver } from './users.resolvers.js';
import { PostsService } from './posts.service.js'; // Not included in example

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      autoSchemaFile: {
        federation: 2,
      },
      buildSchemaOptions: {
        orphanedTypes: [User],
      },
    }),
  ],
  providers: [PostsResolver, UsersResolver, PostsService],
})
export class AppModule {}

```