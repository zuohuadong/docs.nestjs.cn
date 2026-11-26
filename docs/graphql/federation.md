<!-- 此文件从 content/graphql/federation.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:06:28.933Z -->
<!-- 源文件: content/graphql/federation.md -->
<!-- 源哈希: c744c69a28aab719b41eac56a8790e82 -->

### 联邦 (Federation)

联邦允许您将单体 GraphQL 服务器拆分为独立的微服务。它由两个组件组成：一个网关和一个或多个联邦微服务。每个微服务包含部分模式，网关将这些模式合并成单个模式供客户端使用。

如 [Apollo's introduction to federation](https://blog.apollographql.com/apollo-federation-f260cf525d21) 所述，联邦围绕以下核心原则设计：

- 构建图谱应该是**声明式**的。使用联邦，您是从模式内部声明式地组合图谱，而不是编写命令式的模式拼接代码。
- 代码应按**关注点**分离，而不是按类型分离。通常没有单个团队控制 User 或 Product 等重要类型的每一个方面，因此这些类型的定义应该分散在各个团队和代码库中，而不是集中化。
- 图谱对客户端来说应该简单易用。联邦服务共同构成一个完整、以产品为中心的图谱，准确反映了客户端的消费方式。
- 它仅仅是**GraphQL**，仅使用语言中符合规范的特性。任何语言，而不仅仅是 JavaScript，都可以实现联邦。

> info **提示** 使用 `ApolloFederationDriver` 或 `MercuriusFederationDriver` 构建的子图支持订阅（对于 Apollo 使用 `subscriptions` 选项，对于 Mercurius 使用 `subscription: true`）。Apollo Gateway (`ApolloGatewayDriver`) 不会将订阅转发到子图，因此要通过单个联邦端点暴露它们，请使用支持联邦订阅的路由器，例如 Apollo Router，或使用 Mercurius 网关（在网关上设置 `subscription: true`，在每个服务上设置 `wsUrl`）。

在接下来的部分中，我们将设置一个演示应用程序，该应用程序由一个网关和两个联邦端点组成：一个 Users 服务和一个 Posts 服务。

#### 使用 Apollo 进行联邦

首先安装所需的依赖项：

```bash
$ npm install --save @apollo/subgraph

```

#### 模式优先 (Schema first)

Users 服务提供了一个简单的模式。`@key` 装饰器告诉 Apollo 查询规划器，特定实例的 `User` 可以通过其 `id` 来获取。请注意，该模式扩展了 `Query` 类型。

```graphql
type User @key(fields: "id") {
  id: ID!
  name: String!
}

extend type Query {
  getUser(id: ID!): User
}

```

解析器提供了一个名为 `resolveReference()` 的附加方法。每当相关资源需要一个 `User` 实例时，Apollo 网关就会调用此方法。稍后您将在 Posts 服务中看到此示例。该方法必须用 `@ResolveReference()` 装饰器进行注解。

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

最后，在配置对象中将 `GraphQLModule` 注册到 `ApolloFederationDriver` 驱动程序，完成连接：

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

#### 代码优先 (Code first)

首先，向 `User` 实体添加一些额外的装饰器：

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

解析器提供了一个名为 `resolveReference()` 的附加方法。每当相关资源需要一个 `User` 实例时，Apollo 网关就会调用此方法。稍后您将在 Posts 服务中看到此示例。该方法必须用 `@ResolveReference()` 装饰器进行注解。

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

最后，在配置对象中将 `GraphQLModule` 注册到 `ApolloFederationDriver` 驱动程序，完成连接：

```typescript
import {
  ApolloFederationDriver,
  ApolloFederationDriverConfig,
} from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
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

可用的工作示例有 [code first](https://github.com/nestjs/nest/tree/master/sample/31-graphql-federation-code-first/users-application) 和 [schema first](https://github.com/nestjs/nest/tree/master/sample/32-graphql-federation-schema-first/users-application) 两种方法。

#### 联邦示例：Posts

Posts 服务通过 `getPosts` 查询提供聚合的帖子，并使用 `user.posts` 字段扩展了 `User` 类型。

#### 模式优先 (Schema first)

Posts 服务通过使用 `extend` 关键字标记来引用其模式中的 `User` 类型。它还在 `User` 类型上声明了一个附加字段（`posts`）。请注意 `@key` 装饰器，用于匹配 `User` 实例，以及 `@external` 装饰器，它指示 `id` 字段由其他地方管理。

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

在以下示例中，`PostsResolver` 提供了一个 `getUser()` 方法，该方法返回一个包含 `__typename` 以及您的应用程序为解析该引用所需的任何附加属性的引用，在本例中是 `id`。网关使用 `__typename` 来精确定位负责 `User` 类型的微服务并检索相应的实例。为了解析该引用，网关向上述 Users 服务发送一个请求，该服务执行其 `resolveReference()` 方法。

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

最后，像 Users 服务一样注册 `GraphQLModule`。

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

#### 代码优先 (Code first)

首先，声明一个表示 `User` 实体的类。尽管实体本身存在于另一个服务中，但此服务使用它（并扩展其定义）。请注意 `@extends` 和 `@external` 装饰器。

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

接下来，为 `User` 实体的扩展创建解析器：

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

然后定义 `Post` 实体类：

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

以及其解析器：

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

最后，在一个模块中将所有内容连接起来。请注意模式构建选项，其中指定 `User` 是一个孤立（外部）类型。

```ts
import {
  ApolloFederationDriver,
  ApolloFederationDriverConfig,
} from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { User } from './user.entity.js';
import { PostsResolver } from './posts.resolver.js';
import { UsersResolver } from './users.resolver.js';
import { PostsService } from './posts.service.js'; // Not included in this example

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

可用的工作示例有 [code first](https://github.com/nestjs/nest/tree/master/sample/31-graphql-federation-code-first/posts-application) 和 [schema first](https://github.com/nestjs/nest/tree/master/sample/32-graphql-federation-schema-first/posts-application) 两种方法。

#### 联邦示例：网关

首先安装所需的依赖项：

```bash
$ npm install --save @apollo/gateway

```

网关需要一个端点列表，并且它会自动发现相应的模式。因此，代码优先和模式优先两种方法的网关实现是相同的。

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
        // ... Apollo Server options
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

可用的工作示例有 [code first](https://github.com/nestjs/nest/tree/master/sample/31-graphql-federation-code-first/gateway) 和 [schema first](https://github.com/nestjs/nest/tree/master/sample/32-graphql-federation-schema-first/gateway) 两种方法。

#### 使用 Mercurius 进行联邦

首先安装所需的依赖项：

```bash
$ npm install --save @apollo/subgraph @nestjs/mercurius

```

> info **注意** 需要 `@apollo/subgraph` 包来构建子图模式（`buildSubgraphSchema` 和 `printSubgraphSchema` 函数）。

#### 模式优先

Users 服务提供了一个简单的模式。`@key` 指令告诉 Mercurius 查询规划器，特定实例的 `User` 可以通过其 `id` 来获取。请注意，该模式扩展了 `Query` 类型。

```graphql
type User @key(fields: "id") {
  id: ID!
  name: String!
}

extend type Query {
  getUser(id: ID!): User
}

```

解析器提供了一个名为 `resolveReference()` 的附加方法。每当相关资源需要一个 `User` 实例时，Mercurius 网关就会调用此方法。稍后在 Posts 服务中可以看到此示例。该方法必须用 `@ResolveReference()` 装饰器进行注解。

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

最后，在配置对象中将 `GraphQLModule` 注册到 `MercuriusFederationDriver` 驱动程序，完成连接：

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
    }),
  ],
  providers: [UsersResolver],
})
export class AppModule {}

```

#### 代码优先

首先向 `User` 实体添加一些额外的装饰器：

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

解析器提供了一个名为 `resolveReference()` 的附加方法。每当相关资源需要一个 `User` 实例时，Mercurius 网关就会调用此方法。稍后在 Posts 服务中可以看到此示例。该方法必须用 `@ResolveReference()` 装饰器进行注解。

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

最后，在配置对象中将 `GraphQLModule` 注册到 `MercuriusFederationDriver` 驱动程序，完成连接：

```typescript
import {
  MercuriusFederationDriver,
  MercuriusFederationDriverConfig,
} from '@nestjs/mercurius';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { UsersResolver } from './users.resolver.js';
import { UsersService } from './users.service.js'; // Not included in this example

@Module({
  imports: [
    GraphQLModule.forRoot<MercuriusFederationDriverConfig>({
      driver: MercuriusFederationDriver,
      autoSchemaFile: true,
    }),
  ],
  providers: [UsersResolver, UsersService],
})
export class AppModule {}

```

#### 联邦示例：Posts

Posts 服务通过 `getPosts` 查询提供聚合后的帖子，并使用 `user.posts` 字段扩展了 `User` 类型。

#### 模式优先

Posts 服务通过使用 `extend` 关键字标记其模式中的 `User` 类型来引用它。它还在 `User` 类型上声明了一个附加字段（`posts`）。请注意用于匹配 `User` 实例的 `@key` 指令，以及指示 `id` 字段在其他地方管理的 `@external` 指令。

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

在下面的示例中，`PostsResolver` 提供了一个 `getUser()` 方法，该方法返回一个包含 `__typename` 以及您的应用程序为解析该引用所需的任何附加属性的引用。网关使用 `__typename` 来精确定位负责 `User` 类型的微服务并检索相应的实例。为了解析该引用，网关向上述 Users 服务发送一个请求，该服务执行其 `resolveReference()` 方法。

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

最后，像 Users 服务中一样注册 `GraphQLModule`。

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
      typePaths: ['**/*.graphql'],
    }),
  ],
  providers: [PostsResolver],
})
export class AppModule {}

```

#### 代码优先

首先，声明一个表示 `User` 实体的类。尽管实体本身存在于另一个服务中，但此服务使用它（并扩展其定义）。请注意 `@extends` 和 `@external` 指令。

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

接下来，创建 `User` 实体扩展的解析器：

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

然后定义 `Post` 实体类：

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

最后，在一个模块中将所有内容连接起来。请注意模式构建选项，其中指定 `User` 是一个孤立（外部）类型。

```ts
import {
  MercuriusFederationDriver,
  MercuriusFederationDriverConfig,
} from '@nestjs/mercurius';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { User } from './user.entity.js';
import { PostsResolver } from './posts.resolver.js';
import { UsersResolver } from './users.resolver.js';
import { PostsService } from './posts.service.js'; // Not included in this example

@Module({
  imports: [
    GraphQLModule.forRoot<MercuriusFederationDriverConfig>({
      driver: MercuriusFederationDriver,
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

#### 联邦示例：网关

首先安装所需的依赖项：

```bash
$ npm install --save @mercuriusjs/gateway

```

网关需要一个端点列表，并且它会自动发现相应的模式。因此，对于代码优先和模式优先两种方法，网关的实现是相同的。

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

### 联邦 2

根据 [Apollo docs](https://www.apollographql.com/docs/federation/federation-2/new-in-federation-2)，联邦 2 改进了原始 Apollo Federation（在本节中称为联邦 1）的开发者体验，并且与大多数原始超图向后兼容。

> warning **警告** Mercurius 不完全支持联邦 2。请参阅 Apollo 的 [subgraph libraries that support Federation 2](https://www.apollographql.com/docs/federation/supported-subgraphs#javascript--typescript) 列表。

在接下来的部分中，我们将把前面的示例升级到联邦 2。

#### 联邦示例：Users

在联邦 2 中，实体没有起源子图，因此不再需要扩展 `Query`。有关更多详细信息，请参阅 Apollo Federation 2 文档中的 [entities topic](https://www.apollographql.com/docs/federation/federation-2/new-in-federation-2#entities)。

#### 模式优先

从模式中移除 `extend` 关键字。要选择使用联邦 2，模式还必须使用 `@link` 指令导入其使用的联邦指令：

```graphql
extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

type User @key(fields: "id") {
  id: ID!
  name: String!
}

type Query {
  getUser(id: ID!): User
}

```

#### 代码优先

要使用联邦 2，请在 `autoSchemaFile` 选项中指定联邦版本。Nest 会为您向生成的模式添加 `@link` 指令。

```ts
import {
  ApolloFederationDriver,
  ApolloFederationDriverConfig,
} from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
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

出于相同的原因，不再需要扩展 `User` 和 `Query`。

#### 模式优先

从模式中移除 `extend` 关键字和 `@external` 指令，并添加 `@link` 指令：

```graphql
extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

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

由于 `User` 实体不再被扩展，请从 `User` 中移除 `@extends` 和 `@external` 指令：

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

与 Users 服务一样，配置 `GraphQLModule` 以使用联邦 2：

```ts
import {
  ApolloFederationDriver,
  ApolloFederationDriverConfig,
} from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { User } from './user.entity.js';
import { PostsResolver } from './posts.resolver.js';
import { UsersResolver } from './users.resolver.js';
import { PostsService } from './posts.service.js'; // Not included in this example

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

#### 从超图中隐藏操作

要在子图仍然提供某个查询、变更或字段的同时将其排除在公共超图 API 之外，请使用联邦 2 的 `@inaccessible` 指令进行标记。使用代码优先方法时，请使用 `@Directive()` 装饰器：

```typescript
@Query(() => Int)
@Directive('@inaccessible')
internalStats() {
  return this.statsService.count();
}

```

该操作在子图上仍然可执行，并列在其 `_service { sdl }` 中，但组合时将其排除在客户端看到的超图模式之外。