<!-- 此文件从 content/graphql/quick-start.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T10:21:09.100Z -->
<!-- 源文件: content/graphql/quick-start.md -->
<!-- 源哈希: dccf8d77d98367e3327e40dda49a1a06 -->

## 驾驭 TypeScript 与 GraphQL 的强大能力

[GraphQL](https://graphql.org/) 是一种用于 API 的查询语言，也是一个用于使用现有数据完成这些查询的运行时。它解决了 REST API 中常见的许多问题。如需了解背景知识，请参阅 [comparison of GraphQL and REST](https://www.apollographql.com/blog/graphql-vs-rest)。结合 [TypeScript](https://www.typescriptlang.org/)，GraphQL 能为你的查询提供更好的类型安全性和端到端类型化。

本章假设你已对 GraphQL 有基本了解，并聚焦于使用内置的 `@nestjs/graphql` 模块。`GraphQLModule` 可以配置为使用 [Apollo](https://www.apollographql.com/) Server（配合 `@nestjs/apollo` 驱动）或 [Mercurius](https://github.com/mercurius-js/mercurius)（配合 `@nestjs/mercurius` 驱动）。Nest 为这两个包都提供了官方集成（另请参阅下方的 [third-party integrations](/graphql/quick-start#third-party-integrations)）。

你也可以构建自己的驱动（参见 [Creating a custom driver](/graphql/guards-interceptors#创建自定义驱动)）。

#### 安装

首先安装所需的包：

```bash
# For Express and Apollo (default)
$ npm i @nestjs/graphql @nestjs/apollo @apollo/server @as-integrations/express5 graphql

# For Fastify and Apollo
# npm i @nestjs/graphql @nestjs/apollo @apollo/server @as-integrations/fastify graphql

# For Fastify and Mercurius
# npm i @nestjs/graphql @nestjs/mercurius graphql mercurius

```

> warning **警告** `@nestjs/apollo` v14 需要 **Apollo Server v5**（即 `@apollo/server` 包）。如果你是从较旧的 Apollo Server 版本升级，请参阅 [Apollo Server migration guide](https://www.apollographql.com/docs/apollo-server/migration/)。

#### 概述

Nest 提供了两种构建 GraphQL 应用程序的方式：**代码优先（code first）** 和 **模式优先（schema first）**。选择最适合你的那一种。本 GraphQL 章节中的大多数章节都分为两部分：一部分针对 **代码优先** 方式，另一部分针对 **模式优先** 方式。

在 **代码优先** 方式中，你使用装饰器和 TypeScript 类来生成相应的 GraphQL 模式。如果你偏好完全使用 TypeScript 工作，避免在多种语言语法之间切换，这种方式很适合你。

在 **模式优先** 方式中，事实来源是一组 GraphQL SDL（Schema Definition Language，模式定义语言）文件。SDL 是一种与语言无关的方式，用于在不同平台之间共享模式文件。Nest 会根据 GraphQL 模式生成你的 TypeScript 定义（以类或接口的形式），因此你不必编写冗余的样板代码。

<app-banner-courses-graphql-cf></app-banner-courses-graphql-cf>

#### GraphQL 与 TypeScript 入门

> info **提示** 以下章节使用 `@nestjs/apollo` 包。若要改用 Mercurius，请参阅 [Mercurius integration](/graphql/quick-start#mercurius-集成)。

包安装完成后，导入 `GraphQLModule` 并使用 `forRoot()` 静态方法对其进行配置。

```typescript
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
    }),
  ],
})
export class AppModule {}

```

> info **提示** 对于 Mercurius 集成，请改用 `MercuriusDriver` 和 `MercuriusDriverConfig`。两者都从 `@nestjs/mercurius` 包中导出。

`forRoot()` 方法接收一个选项对象，该对象会被传递给底层驱动实例（参见 [Apollo](https://www.apollographql.com/docs/apollo-server/api/apollo-server) 和 [Mercurius](https://github.com/mercurius-js/mercurius/blob/master/docs/api/options.md#plugin-options) 的可用设置）。例如，要禁用 GraphQL IDE，请传入以下选项：

```typescript
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      graphiql: false,
    }),
  ],
})
export class AppModule {}

```

> warning **警告** `graphql-playground` IDE 已在 `@nestjs/graphql` v14 中移除。`playground` 选项仅作为 **GraphiQL 的已弃用布尔别名** 保留：`playground: false` 禁用落地页，`playground: true` 启用 GraphiQL。在新代码中请使用 `graphiql`。

使用 Apollo 驱动时，这些选项会被转发给 `ApolloServer` 构造函数。

#### 访问请求和响应对象

`context` 选项是一个工厂，用于为每个请求构建 GraphQL 执行上下文。使用它可以将底层的请求和响应对象暴露给你的解析器：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  context: ({ req, res }) => ({ req, res }),
}),

```

然后你可以在解析器中使用 `@Context()` 装饰器读取它们：

```typescript
@Query(() => String)
userAgent(@Context('req') req: Request): string {
  return req.headers['user-agent'] ?? '';
}

```

> info **提示** 在 GraphQL 上下文中运行的守卫、拦截器和其他增强器可以通过 `GqlExecutionContext.create(context).getContext()` 访问同一个对象（参见 [Other features](/graphql/guards-interceptors)）。

#### GraphQL IDE

[GraphiQL](https://github.com/graphql/graphiql) 是默认的图形化、交互式、浏览器内的 GraphQL IDE。它与 GraphQL 服务器本身在同一 URL 上提供服务，因此你需要配置并运行一个基本的 GraphQL 服务器才能访问它。要立即试用，请安装并构建 [code first sample application](https://github.com/nestjs/nest/tree/master/sample/23-graphql-code-first)。如果你正在跟随这些代码示例操作，那么在你完成 [Resolvers chapter](/graphql/resolvers-map) 中的步骤后，GraphiQL 就可用。

应用程序运行后，打开浏览器并导航到 `http://localhost:3000/graphql`（主机和端口可能因你的配置而异）。你将看到 GraphiQL，如下所示。

<figure>
  <img src="/assets/playground.png" alt="" />
</figure>

> info **注意** `@nestjs/mercurius` 集成同样使用 [GraphiQL](https://github.com/graphql/graphiql)。

##### 启用和禁用 GraphiQL

从 `@nestjs/graphql` v14 开始，GraphiQL 是唯一内置的 GraphQL IDE；较旧的 `graphql-playground` 已被移除。使用 Apollo 驱动时，只要 `NODE_ENV` 不为 `production`，GraphiQL 就会自动启用。在开发环境中，它无需任何配置即可工作；在生产环境中，落地页默认被禁用。

要显式控制它，请使用 `graphiql` 选项：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  graphiql: true, // force it on, including in production
}),

```

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  graphiql: false, // disable the landing page entirely
}),

```

> warning **警告** `playground` 选项仍然存在，但仅作为 `graphiql` 的 **已弃用布尔别名**。如果两者都设置了，`graphiql` 优先。请将 `playground: false` 迁移到 `graphiql: false`，将 `playground: true` 迁移到 `graphiql: true`。

##### 配置 GraphiQL

要同时启用并配置 GraphiQL，请传入一个对象而不是布尔值：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  graphiql: {
    url: '/graphql',
    headers: {
      authorization: 'Bearer <token>',
    },
    shouldPersistHeaders: true,
    isHeadersEditorEnabled: true,
    inputValueDeprecation: false,
  },
}),

```

可用的选项有：

<table>
  <tr>
    <td><code>url</code></td>
    <td>IDE 发送操作的目标端点。默认为驱动的 <code>path</code> 选项，因此仅当 IDE 应指向与其自身提供服务不同的 URL 时才设置它。</td>
  </tr>
  <tr>
    <td><code>headers</code></td>
    <td>应用于每个请求的请求头，例如在开发期间预配置的 <code>authorization</code> 请求头。如果启用了请求头编辑器且用户设置了相同的请求头，则以用户的值优先。</td>
  </tr>
  <tr>
    <td><code>shouldPersistHeaders</code></td>
    <td>请求头编辑器的内容是否持久化到浏览器存储中。默认值：<code>true</code>。</td>
  </tr>
  <tr>
    <td><code>isHeadersEditorEnabled</code></td>
    <td>是否在编辑器工具中显示请求头编辑器。设置为 <code>false</code> 可阻止用户编辑请求头。默认值：<code>true</code>。</td>
  </tr>
  <tr>
    <td><code>inputValueDeprecation</code></td>
    <td>如果为 <code>true</code>，模式文档会包含已弃用的输入字段和参数值，内省也会返回它们。默认值：<code>false</code>。</td>
  </tr>
</table>

> info **提示** 由于 GraphiQL 在生产环境之外默认启用，一种常见的做法是保留默认设置，仅对不应暴露 IDE 的可公开访问的非生产环境设置 `graphiql: false`。

##### IDE 中的订阅

如果你的应用程序使用 [subscriptions](/graphql/subscriptions)，请使用 `graphql-ws`。对 `subscriptions-transport-ws` 的支持已被**移除**：它不再被接受为 `subscriptions` 的键，并且该包也不再是依赖项。

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  subscriptions: {
    'graphql-ws': true,
  },
}),

```

然后 GraphiQL 就可以直接针对你的服务器执行订阅操作。

#### 代码优先

在**代码优先**方法中，你使用装饰器和 TypeScript 类来生成相应的 GraphQL 模式。

要使用代码优先方法，首先向选项对象添加 `autoSchemaFile` 属性：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
}),

```

`autoSchemaFile` 属性的值是自动生成的模式所写入的路径。或者，模式也可以在内存中即时生成。为此，请将 `autoSchemaFile` 属性设置为 `true`：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: true,
}),

```

默认情况下，生成的模式中的类型按照它们在所包含模块中定义的顺序出现。要按字典序对模式排序，请将 `sortSchema` 属性设置为 `true`：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
  sortSchema: true,
}),

```

#### 示例

NestJS 仓库中提供了一个完整可运行的 [code first sample](https://github.com/nestjs/nest/tree/master/sample/23-graphql-code-first)。

#### 模式优先

要使用模式优先方法，首先向选项对象添加 `typePaths` 属性。`typePaths` 属性告诉 `GraphQLModule` 在哪里查找你将编写的 GraphQL SDL 模式定义文件。这些文件在内存中合并，因此你可以将模式拆分为多个文件，并将它们放在各自的解析器旁边。

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  typePaths: ['./**/*.graphql'],
}),

```

通常你还需要与 GraphQL SDL 类型对应的 TypeScript 定义（类和接口）。手工编写它们既冗余又繁琐，而且会让你失去单一数据源：SDL 的每一次更改都会迫使你也更新 TypeScript 定义。为了解决这个问题，`@nestjs/graphql` 包可以从抽象语法树（[AST](https://en.wikipedia.org/wiki/Abstract_syntax_tree)）**自动生成** TypeScript 定义。要启用此功能，请在配置 `GraphQLModule` 时添加 `definitions` 属性。

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  typePaths: ['./**/*.graphql'],
  definitions: {
    path: join(process.cwd(), 'src/graphql.ts'),
  },
}),

```

`definitions` 对象的 `path` 属性指定保存生成的 TypeScript 输出的位置。默认情况下，所有生成的 TypeScript 类型都是接口。要改为生成类，请将 `outputAs` 属性设置为 `'class'`。

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  typePaths: ['./**/*.graphql'],
  definitions: {
    path: join(process.cwd(), 'src/graphql.ts'),
    outputAs: 'class',
  },
}),

```

这种方法会在应用程序每次启动时生成 TypeScript 定义。或者，你可以编写一个按需生成它们的脚本。例如，创建以下 `generate-typings.ts` 脚本：

```typescript
import { GraphQLDefinitionsFactory } from '@nestjs/graphql';
import { join } from 'node:path';

const definitionsFactory = new GraphQLDefinitionsFactory();
definitionsFactory.generate({
  typePaths: ['./src/**/*.graphql'],
  path: join(process.cwd(), 'src/graphql.ts'),
  outputAs: 'class',
});

```

现在你可以按需运行此脚本：

```bash
$ ts-node generate-typings

```

> info **提示** 你可以预先编译该脚本（例如使用 `tsc`），并使用 `node` 来执行它。

要为该脚本启用监听模式（每当 `.graphql` 文件发生变化时重新生成类型定义），请将 `watch` 选项传递给 `generate()` 方法。

```typescript
definitionsFactory.generate({
  typePaths: ['./src/**/*.graphql'],
  path: join(process.cwd(), 'src/graphql.ts'),
  outputAs: 'class',
  watch: true,
});

```

要为每个对象类型生成额外的 `__typename` 字段，请启用 `emitTypenameField` 选项：

```typescript
definitionsFactory.generate({
  // ...
  emitTypenameField: true,
});

```

要将解析器（查询、变更、订阅）生成为不带参数的普通字段，请启用 `skipResolverArgs` 选项：

```typescript
definitionsFactory.generate({
  // ...
  skipResolverArgs: true,
});

```

要将枚举生成为 TypeScript 联合类型而不是常规的 TypeScript 枚举，请将 `enumsAsTypes` 选项设置为 `true`：

```typescript
definitionsFactory.generate({
  // ...
  enumsAsTypes: true,
});

```

#### Apollo Sandbox

要在本地开发中使用 [Apollo Sandbox](https://www.apollographql.com/blog/announcement/platform/apollo-sandbox-an-open-graphql-ide-for-local-development/) 而不是 GraphiQL 作为 GraphQL IDE，请使用以下配置：

```typescript
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      graphiql: false,
      plugins: [ApolloServerPluginLandingPageLocalDefault()],
    }),
  ],
})
export class AppModule {}

```

#### 示例

NestJS 仓库中提供了一个完整可运行的 [schema first sample](https://github.com/nestjs/nest/tree/master/sample/12-graphql-schema-first)。

#### 访问生成的模式

在某些情况下，你可能需要引用生成的模式对象。例如，在端到端测试中，你可以直接使用 `graphql` 包运行查询，而无需任何 HTTP 监听器。

你可以使用 `GraphQLSchemaHost` 类访问生成的模式（无论是代码优先还是模式优先方法）：

```typescript
const { schema } = app.get(GraphQLSchemaHost);

```

> info **提示** 你必须在应用程序初始化之后（即在 `app.listen()` 或 `app.init()` 方法触发 `onModuleInit` 钩子之后）调用 `GraphQLSchemaHost#schema` getter。

#### 异步配置

当你需要以异步方式而不是静态方式传递模块选项时，请使用 `forRootAsync()` 方法。与大多数动态模块一样，Nest 提供了多种异步配置技术。

一种技术是使用工厂函数：

```typescript
GraphQLModule.forRootAsync<ApolloDriverConfig>({
  driver: ApolloDriver,
  useFactory: () => ({
    typePaths: ['./**/*.graphql'],
  }),
}),

```

与其他 [factory providers](/fundamentals/dependency-injection#工厂提供者usefactory) 一样，工厂函数可以是异步的，并且可以通过 `inject` 注入依赖项。

```typescript
GraphQLModule.forRootAsync<ApolloDriverConfig>({
  driver: ApolloDriver,
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    typePaths: configService.get<string[]>('GRAPHQL_TYPE_PATHS'),
  }),
  inject: [ConfigService],
}),

```

或者，你可以使用类而不是工厂来配置 `GraphQLModule`，如下所示：

```typescript
GraphQLModule.forRootAsync<ApolloDriverConfig>({
  driver: ApolloDriver,
  useClass: GqlConfigService,
}),

```

上面的构造在 `GraphQLModule` 内部实例化 `GqlConfigService`，并使用它来创建选项对象。`GqlConfigService` 必须实现 `GqlOptionsFactory` 接口，如下所示。`GraphQLModule` 会在所提供类的实例化对象上调用 `createGqlOptions()` 方法。

```typescript
@Injectable()
class GqlConfigService implements GqlOptionsFactory {
  createGqlOptions(): ApolloDriverConfig {
    return {
      typePaths: ['./**/*.graphql'],
    };
  }
}

```

要重用现有的选项提供者，而不是在 `GraphQLModule` 内部创建私有副本，请使用 `useExisting` 语法。

```typescript
GraphQLModule.forRootAsync<ApolloDriverConfig>({
  driver: ApolloDriver,
  imports: [ConfigModule],
  useExisting: ConfigService,
}),

```

#### Mercurius 集成

除了 Apollo，[Fastify](/http/performance) 用户还可以使用 `@nestjs/mercurius` 驱动。

```typescript
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { MercuriusDriver, MercuriusDriverConfig } from '@nestjs/mercurius';

@Module({
  imports: [
    GraphQLModule.forRoot<MercuriusDriverConfig>({
      driver: MercuriusDriver,
      graphiql: true,
    }),
  ],
})
export class AppModule {}

```

> info **提示** 应用程序运行后，打开浏览器并导航到 `http://localhost:3000/graphiql` 以查看 [GraphiQL IDE](https://github.com/graphql/graphiql)。

`forRoot()` 方法接收一个选项对象，该对象会被传递给底层驱动实例。有关可用设置，请参阅 [Mercurius plugin options](https://github.com/mercurius-js/mercurius/blob/master/docs/api/options.md#plugin-options)。

#### 多个端点

`@nestjs/graphql` 模块也可以同时服务多个端点，由你决定哪些模块包含在哪个端点中。默认情况下，`GraphQLModule` 会在整个应用程序中搜索解析器。要将此扫描限制为模块的子集，请使用 `include` 属性。

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  include: [CatsModule],
}),

```

在 **代码优先** 方法中，`include` 选项仅决定扫描哪些模块以查找解析器。使用 `@ObjectType()`、`@InputType()`、`@InterfaceType()`、`@ArgsType()` 装饰的类型，或通过 `registerEnumType()` / `createUnionType()` 注册的类型，仍会出现在每个生成的模式中。要将类型限定到特定模块，请使用 `registerIn` 选项：

```typescript
@ObjectType({ registerIn: () => CatsModule })
export class Cat {
  @Field()
  name: string;
}

```

当使用 `include: [CatsModule]` 构建模式时，只有分配给 `CatsModule` 的类型才会成为其一部分，而分配给其他模块的类型则会被排除在外。没有 `registerIn` 的类型保持默认行为，并可在引用它们的每个模式中使用。

`registerIn` 选项可用于 `@InputType()`、`@InterfaceType()` 和 `@ArgsType()`，以及 `registerEnumType()` 和 `createUnionType()`：

```typescript
@InputType({ registerIn: () => CatsModule })
export class CreateCatInput {
  @Field()
  name: string;
}

registerEnumType(CatBreed, {
  name: 'CatBreed',
  registerIn: () => CatsModule,
});

export const CatsUnion = createUnionType({
  name: 'CatsUnion',
  types: () => [Lion, Tiger] as const,
  registerIn: () => CatsModule,
});

```

> info **提示** 你可以传入模块类本身，也可以传入返回它的工厂函数。当类型和模块相互引用时，优先使用工厂形式（`() => CatsModule`）：它会延迟模块解析，并避免循环导入导致的错误。

> warning **警告** 如果你将 `@apollo/server` 与 `@as-integrations/fastify` 包一起使用，并在单个应用程序中服务多个 GraphQL 端点，请在 `GraphQLModule` 配置中启用 `disableHealthCheck` 设置。

#### 第三方集成

- [GraphQL Yoga](https://github.com/dotansimha/graphql-yoga)

#### 示例

NestJS 仓库中提供了一个可运行的 [Mercurius sample](https://github.com/nestjs/nest/tree/master/sample/33-graphql-mercurius)。