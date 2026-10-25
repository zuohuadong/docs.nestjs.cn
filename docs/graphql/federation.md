<!-- 此文件从 content/graphql/federation.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T10:19:58.054Z -->
<!-- 源文件: content/graphql/federation.md -->
<!-- 源哈希: 98c6a3a23872bc6fecf370cebe17d907 -->

### 联邦

联邦允许你将一个单体 GraphQL 服务器拆分为独立的微服务。它由两个组件组成：一个网关和一个或多个联邦微服务。每个微服务持有模式的一部分，网关将这些模式合并为一个客户端使用的单一模式。

如 [Apollo's introduction to federation](https://blog.apollographql.com/apollo-federation-f260cf525d21) 中所述，联邦围绕以下核心原则进行设计：

- 构建图应当是**声明式的。** 使用联邦，你可以在模式内部以声明方式组合图，而不是编写命令式的模式拼接代码。
- 代码应当按**关注点**分离，而不是按类型分离。通常没有单个团队控制像 User 或 Product 这样重要类型的所有方面，因此这些类型的定义应当分布在各个团队和代码库中，而不是集中管理。
- 图应当便于客户端使用。联邦服务可以共同构成一个完整的、以产品为中心的图，准确反映它在客户端上被使用的方式。
- 它只是 **GraphQL**，仅使用该语言符合规范的功能。任何语言，而不仅仅是 JavaScript，都可以实现联邦。

> warning **警告** 联邦目前不支持订阅。

在接下来的章节中，我们将搭建一个演示应用程序，它由一个网关和两个联邦端点组成：一个 Users 服务和一个 Posts 服务。

#### 使用 Apollo 实现联邦

首先安装所需的依赖项：

```bash
$ npm install --save @apollo/subgraph

```

#### 模式优先

Users 服务提供了一个简单的模式。`@key` 指令告诉 Apollo 查询规划器，可以通过 `id` 获取 `User` 的特定实例。另请注意，该模式扩展了 `Query` 类型。

```graphql
type User @key(fields: "id") {
  id: ID!
  name: String!
}

extend type Query {
  getUser(id: ID!): User
}

```

解析器提供了一个名为 `resolveReference()` 的额外方法。每当相关资源需要 `User` 实例时，Apollo 网关就会调用此方法。稍后你将在 Posts 服务中看到一个示例。该方法必须使用 `@ResolveReference()` 装饰器进行标注。

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

最后，通过在配置对象中使用 `ApolloFederationDriver` 驱动程序注册 `GraphQLModule` 来将所有内容连接起来：

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

解析器提供了一个名为 `resolveReference()` 的额外方法。每当相关资源需要 `User` 实例时，Apollo 网关就会调用此方法。稍后你将在 Posts 服务中看到一个示例。该方法必须使用 `@ResolveReference()` 装饰器进行标注。

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

最后，通过在配置对象中使用 `ApolloFederationDriver` 驱动程序注册 `GraphQLModule` 来将所有内容连接起来：

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

[code first](https://github.com/nestjs/nest/tree/master/sample/31-graphql-federation-code-first/users-application) 和 [schema first](https://github.com/nestjs/nest/tree/master/sample/32-graphql-federation-schema-first/users-application) 两种方法都有可用的工作示例。

#### 联邦示例：Posts

Posts 服务通过 `getPosts` 查询提供聚合的帖子，并且还使用 `user.posts` 字段扩展了 `User` 类型。

#### 模式优先

Posts 服务通过使用 `extend` 关键字标记 `User` 类型，从而在其模式中引用该类型。它还在 `User` 类型上声明了一个额外的字段（`posts`）。请注意 `@key` 指令，用于匹配 `User` 实例，以及 `@external` 指令，它表示 `id` 字段在其他地方管理。

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

在以下示例中，`PostsResolver` 提供了一个 `getUser()` 方法，该方法返回一个包含 `__typename` 以及你的应用程序解析该引用所需的任何额外属性的引用，在本例中为 `id`。网关使用 `__typename` 来定位负责 `User` 类型的微服务，并检索相应的实例。为了解析该引用，网关会向上面描述的 Users 服务发送请求，该服务会执行其 `resolveReference()` 方法。

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

最后，像在 Users 服务中一样注册 `GraphQLModule`。

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

#### 代码优先

首先，声明一个表示 `User` 实体的类。尽管该实体本身位于另一个服务中，但此服务会使用它（并扩展其定义）。请注意 `@extends` 和 `@external` 指令。

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

最后，在模块中将所有内容连接起来。请注意模式构建选项，其中指定 `User` 是一个孤立的（外部的）类型。

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

[code first](https://github.com/nestjs/nest/tree/master/sample/31-graphql-federation-code-first/posts-application) 和 [schema first](https://github.com/nestjs/nest/tree/master/sample/32-graphql-federation-schema-first/posts-application) 两种方法都有可用的工作示例。

#### 联邦示例：网关

首先安装所需的依赖项：

```bash
$ npm install --save @apollo/gateway

```

网关需要一个端点列表，并且它会自动发现相应的模式。因此，对于代码优先和模式优先两种方法，网关的实现是相同的。

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

[code first](https://github.com/nestjs/nest/tree/master/sample/31-graphql-federation-code-first/gateway) 和 [schema first](https://github.com/nestjs/nest/tree/master/sample/32-graphql-federation-schema-first/gateway) 两种方法都有可用的工作示例。

#### 使用 Mercurius 实现联邦

首先安装所需的依赖项：

```bash
$ npm install --save @apollo/subgraph @nestjs/mercurius

```

> info **注意** 构建子图模式（`buildSubgraphSchema` 和 `printSubgraphSchema` 函数）需要 `@apollo/subgraph` 包。

#### 模式优先

Users 服务提供了一个简单的模式。`@key` 指令告诉 Mercurius 查询规划器，可以通过 `id` 获取 `User` 的特定实例。另请注意，该模式扩展了 `Query` 类型。

```graphql
type User @key(fields: "id") {
  id: ID!
  name: String!
}

extend type Query {
  getUser(id: ID!): User
}

```

解析器提供了一个名为 `resolveReference()` 的额外方法。每当相关资源需要 `User` 实例时，Mercurius 网关就会调用此方法。稍后你将在 Posts 服务中看到一个示例。该方法必须使用 `@ResolveReference()` 装饰器进行标注。

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

最后，通过在配置对象中使用 `MercuriusFederationDriver` 驱动程序注册 `GraphQLModule` 来将所有内容连接起来：

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

解析器提供了一个名为 `resolveReference()` 的额外方法。每当相关资源需要 `User` 实例时，Mercurius 网关就会调用此方法。稍后你将在 Posts 服务中看到一个示例。该方法必须使用 `@ResolveReference()` 装饰器进行标注。

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

最后，通过在配置对象中使用 `MercuriusFederationDriver` 驱动程序注册 `GraphQLModule` 来将所有内容连接起来：

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

Posts 服务通过 `getPosts` 查询提供聚合的 posts，并使用 `user.posts` 字段扩展 `User` 类型。

#### 模式优先

Posts 服务通过使用 `extend` 关键字标记 `User` 类型，在其模式中引用该类型。它还在 `User` 类型上声明了一个额外的字段（`posts`）。请注意 `@key` 指令（用于匹配 `User` 实例）和 `@external` 指令（表示 `id` 字段在其他地方管理）。

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

在以下示例中，`PostsResolver` 提供了一个 `getUser()` 方法，该方法返回一个引用，其中包含 `__typename` 以及你的应用程序解析该引用所需的任何其他属性，在本例中为 `id`。网关使用 `__typename` 来定位负责 `User` 类型的微服务，并检索相应的实例。为了解析该引用，网关向上述 Users 服务发送请求，该服务执行其 `resolveReference()` 方法。

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

最后，像在 Users 服务中一样注册 `GraphQLModule`。

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

首先，声明一个表示 `User` 实体的类。尽管该实体本身位于另一个服务中，但此服务会使用它（并扩展其定义）。请注意 `@extends` 和 `@external` 指令。

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

最后，在模块中将所有内容整合在一起。请注意模式构建选项，其中指定 `User` 是一个孤立的（外部）类型。

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

网关需要一组端点列表，并会自动发现相应的模式。因此，对于代码优先和模式优先两种方法，网关的实现是相同的。

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

根据 [Apollo docs](https://www.apollographql.com/docs/federation/federation-2/new-in-federation-2)，联邦 2 改进了原始 Apollo Federation（本节中称为联邦 1）的开发体验，并且与大多数原始超级图向后兼容。

> warning **警告** Mercurius 并不完全支持联邦 2。请参阅 Apollo 的 [subgraph libraries that support Federation 2](https://www.apollographql.com/docs/federation/supported-subgraphs#javascript--typescript) 列表。

在以下各节中，我们将把前面的示例升级到联邦 2。

#### 联邦示例：Users

在联邦 2 中，实体没有原始子图，因此你不再需要扩展 `Query`。有关更多详细信息，请参阅 Apollo Federation 2 文档中的 [entities topic](https://www.apollographql.com/docs/federation/federation-2/new-in-federation-2#entities)。

#### 模式优先

从模式中移除 `extend` 关键字。要选择使用联邦 2，模式还必须使用 `@link` 指令导入它所使用的联邦指令：

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

要使用联邦 2，请在 `autoSchemaFile` 选项中指定联邦版本。然后 Nest 会为你将 `@link` 指令添加到生成的模式中。

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

出于同样的原因，你不再需要扩展 `User` 和 `Query`。

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

由于不再扩展 `User` 实体，请从 `User` 中移除 `@extends` 和 `@external` 指令：

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

与 Users 服务一样，将 `GraphQLModule` 配置为使用联邦 2：

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