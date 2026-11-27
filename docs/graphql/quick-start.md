<!-- 此文件从 content/graphql/quick-start.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:07:22.424Z -->
<!-- 源文件: content/graphql/quick-start.md -->
<!-- 源哈希: 1309f25453eb84c35d2970f9a4b355dc -->

## 利用 TypeScript & GraphQL 的强大能力

[GraphQL](https://graphql.org/) 是用于 API 的查询语言，也是使用现有数据来满足这些查询的运行时。它解决了 REST API 中通常存在的大量问题。背景信息请参阅此 [comparison of GraphQL and REST](https://www.apollographql.com/blog/graphql-vs-rest)。结合 [TypeScript](https://www.typescriptlang.org/)，GraphQL 为您的查询和端到端类型提供了更好的类型安全。

本章假设您对 GraphQL 有基本了解，重点是使用内置的 `@nestjs/graphql` 模块。`GraphQLModule` 可以配置为使用 [Apollo](https://www.apollographql.com/) 服务器（使用 `@nestjs/apollo` 驱动）或 [Mercurius](https://github.com/mercurius-js/mercurius)（使用 `@nestjs/mercurius` 驱动）。Nest 为这两个包提供了官方集成（另见下文 [third-party integrations](/graphql/quick-start#third-party-integrations)）。

您也可以构建自己的驱动（参见 [Creating a custom driver](/graphql/guards-interceptors#创建自定义驱动)）。

> info **提示** 要分步构建完整的 GraphQL API，包括认证、批处理嵌套字段、按字段授权和订阅，请遵循 [Build a GraphQL API in Node.js](/tutorials/graphql-api)。

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

> warning **警告** `@nestjs/apollo` v14 要求 **Apollo Server v5**（即 `@apollo/server` 包）。如果您是从旧版本的 Apollo Server 升级，请参阅 [Apollo Server migration guide](https://www.apollographql.com/docs/apollo-server/migration/)。

#### 概述

Nest 提供了两种构建 GraphQL 应用程序的方式：**代码优先** 和 **模式优先**。选择最适合您的方式。本 GraphQL 部分的大多数章节分为两部分：一部分介绍**代码优先**方法，另一部分介绍**模式优先**方法。

在**代码优先**方法中，您使用装饰器和 TypeScript 类来生成相应的 GraphQL 模式。如果您偏好完全在 TypeScript 中工作并避免在不同语言语法之间切换，则适合此方法。

在**模式优先**方法中，事实来源是一组 GraphQL SDL（模式定义语言）文件。SDL 是一种语言无关的方式，用于在不同平台之间共享模式文件。Nest 会从 GraphQL 模式生成您的 TypeScript 定义（作为类或接口），因此您无需编写冗余的样板代码。

<app-banner-courses-graphql-cf></app-banner-courses-graphql-cf>

#### 开始使用 GraphQL & TypeScript

> info **提示** 以下章节使用 `@nestjs/apollo` 包。如需使用 Mercurius，请参阅 [Mercurius integration](/graphql/quick-start#mercurius-集成)。

安装包后，导入 `GraphQLModule` 并使用 `forRoot()` 静态方法进行配置。

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

> info **提示** 对于 Mercurius 集成，请使用 `MercuriusDriver` 和 `MercuriusDriverConfig`。两者都从 `@nestjs/mercurius` 包导出。

`forRoot()` 方法接受一个选项对象，该对象会传递给底层驱动实例（有关可用设置，请参阅 [Apollo](https://www.apollographql.com/docs/apollo-server/api/apollo-server) 和 [Mercurius](https://github.com/mercurius-js/mercurius/blob/master/docs/api/options.md#plugin-options)）。例如，要禁用 GraphQL IDE，请传递以下选项：

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

> warning **警告** `graphql-playground` IDE 在 `@nestjs/graphql` v14 中已被移除。`playground` 选项仅作为 **GraphiQL 的已弃用布尔别名**保留：`playground: false` 禁用着陆页，而 `playground: true` 启用 GraphiQL。在新代码中使用 `graphiql`。

使用 Apollo 驱动时，这些选项会被转发到 `ApolloServer` 构造函数。

#### 访问请求和响应对象

`context` 选项是一个工厂，为每个请求构建 GraphQL 执行上下文。使用它将底层请求和响应对象暴露给您的解析器：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  context: ({ req, res }) => ({ req, res }),
}),

```

然后您可以使用 `@Context()` 装饰器在解析器中读取它们：

```typescript
@Query(() => String)
userAgent(@Context('req') req: Request): string {
  return req.headers['user-agent'] ?? '';
}

```

> info **提示** 在 GraphQL 上下文中运行的守卫、拦截器和其他增强器可以通过 `GqlExecutionContext.create(context).getContext()` 访问同一对象（参见 [Other features](/graphql/guards-interceptors)）。

#### GraphQL IDE

[GraphiQL](https://github.com/graphql/graphiql) 是默认的图形化、交互式、浏览器内 GraphQL IDE。它在与 GraphQL 服务器相同的 URL 上提供服务，因此您需要配置并运行一个基本的 GraphQL 服务器才能访问它。要立即尝试，请安装并构建 [code first sample application](https://github.com/nestjs/nest/tree/master/sample/23-graphql-code-first)。如果您跟着这些代码示例操作，一旦完成 [Resolvers chapter](/graphql/resolvers-map) 中的步骤，GraphiQL 就会可用。

应用程序运行后，打开您的浏览器并导航到 `http://localhost:3000/graphql`（主机和端口可能因您的配置而异）。您将看到 GraphiQL，如下所示。

<figure>
  <img src="/assets/playground.png" alt="" />
</figure>

> info **注意** `@nestjs/mercurius` 集成也使用了 [GraphiQL](https://github.com/graphql/graphiql)。

##### 启用和禁用 GraphiQL

自 `@nestjs/graphql` v14 起，GraphiQL 是唯一的内置 GraphQL IDE；旧的 `graphql-playground` 已被移除。使用 Apollo 驱动时，只要 `NODE_ENV` 不是 `production`，GraphiQL 就会自动启用。在开发环境中，它无需任何配置即可工作；在生产环境中，着陆页默认被禁用。

要明确控制它，请使用 `graphiql` 选项：

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

> warning **警告** `playground` 选项仍然存在，但仅作为 `graphiql` 的**已弃用布尔别名**。如果两者都设置，`graphiql` 优先。请将 `playground: false` 迁移到 `graphiql: false`，将 `playground: true` 迁移到 `graphiql: true`。

##### 配置 GraphiQL

要同时启用 GraphiQL 并配置它，请传递一个对象而不是布尔值：

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

可用选项如下：

<table>
  <tr>
    <td><code>url</code></td>
    <td>IDE 发送操作到的端点。默认为驱动的 <code>path</code> 选项，因此仅在 IDE 应针对的 URL 与其提供服务的 URL 不同时才设置。</td>
  </tr>
  <tr>
    <td><code>headers</code></td>
    <td>应用于每次请求的头部，例如在开发过程中预配置的 <code>authorization</code> 头部。如果启用了头部编辑器并且用户设置了相同的头部，则用户的值优先。</td>
  </tr>
  <tr>
    <td><code>shouldPersistHeaders</code></td>
    <td>是否将头部编辑器的内容持久化到浏览器存储中。默认值：<code>true</code>。</td>
  </tr>
  <tr>
    <td><code>isHeadersEditorEnabled</code></td>
    <td>是否在编辑器工具内部显示头部编辑器。设置为 <code>false</code> 可防止用户编辑头部。默认值：<code>true</code>。</td>
  </tr>
  <tr>
    <td><code>inputValueDeprecation</code></td>
    <td>如果 <code>true</code>，模式文档将包含已弃用的输入字段和参数值，并且内省会返回它们。默认值：<code>false</code>。</td>
  </tr>
</table>

> info **提示** 由于 GraphiQL 默认在非生产环境中启用，常见的设置是保持默认值，仅在需要暴露 IDE 的可公开访问的非生产环境中设置 `graphiql: false`。

##### IDE 中的订阅

如果您的应用程序使用 [subscriptions](/graphql/subscriptions)，请使用 `graphql-ws`。对 `subscriptions-transport-ws` 的支持已**移除**：它不再被接受为 `subscriptions` 键，并且该包不再是依赖项。

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  subscriptions: {
    'graphql-ws': true,
  },
}),

```

GraphiQL 随后可以直接对您的服务器执行订阅操作。

#### 代码优先

在**代码优先**方法中，您使用装饰器和 TypeScript 类来生成相应的 GraphQL 模式。

要使用代码优先方法，首先向选项对象添加 `autoSchemaFile` 属性：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
}),

```

`autoSchemaFile` 属性值是自动生成的模式写入的路径。或者，模式可以在内存中即时生成。要做到这一点，请将 `autoSchemaFile` 属性设置为 `true`：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: true,
}),

```

默认情况下，生成的模式中的类型按其在包含的模块中定义的顺序出现。要按字母顺序对模式进行排序，请将 `sortSchema` 属性设置为 `true`：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
  sortSchema: true,
}),

```

#### 示例

NestJS 仓库中提供了一个完全可运行的 [code first sample](https://github.com/nestjs/nest/tree/master/sample/23-graphql-code-first)。

#### 模式优先

要使用模式优先方法，首先向选项对象添加一个 `typePaths` 属性。`typePaths` 属性告诉 `GraphQLModule` 在哪里查找您将编写的 GraphQL SDL 模式定义文件。这些文件在内存中组合，因此您可以将模式分割到多个文件中，并将其保留在其解析器旁边。

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  typePaths: ['./**/*.graphql'],
}),

```

您通常还需要与 GraphQL SDL 类型对应的 TypeScript 定义（类和接口）。手动编写它们是多余且繁琐的，并且这使您没有单一的事实来源：对 SDL 的任何更改都强制您更新 TypeScript 定义。为解决此问题，`@nestjs/graphql` 包可以**自动生成** TypeScript 定义（来自抽象语法树 [AST](https://en.wikipedia.org/wiki/Abstract_syntax_tree)）。要启用此功能，在配置 `GraphQLModule` 时添加 `definitions` 属性。

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  typePaths: ['./**/*.graphql'],
  definitions: {
    path: join(process.cwd(), 'src/graphql.ts'),
  },
}),

```

`definitions` 对象的 `path` 属性指定了保存生成的 TypeScript 输出的位置。默认情况下，所有生成的 TypeScript 类型都是接口。要生成类而不是接口，请将 `outputAs` 属性设置为 `'class'`。

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

此方法在应用程序启动时生成 TypeScript 定义。或者，您可以编写一个脚本按需生成它们。例如，创建以下 `generate-typings.ts` 脚本：

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

现在您可以按需运行此脚本：

```bash
$ ts-node generate-typings

```

> info **提示** 您可以预先编译脚本（例如，使用 `tsc`）并使用 `node` 来执行它。

要为脚本启用监视模式（每当 `.graphql` 文件更改时重新生成类型定义），请将 `watch` 选项传递给 `generate()` 方法。

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

要生成不带参数的纯字段形式的解析器（查询、变更、订阅），请启用 `skipResolverArgs` 选项：

```typescript
definitionsFactory.generate({
  // ...
  skipResolverArgs: true,
});

```

要将枚举生成为 TypeScript 联合类型而不是常规 TypeScript 枚举，请将 `enumsAsTypes` 选项设置为 `true`：

```typescript
definitionsFactory.generate({
  // ...
  enumsAsTypes: true,
});

```

#### Apollo Sandbox

要使用 [Apollo Sandbox](https://www.apollographql.com/blog/announcement/platform/apollo-sandbox-an-open-graphql-ide-for-local-development/) 而不是 GraphiQL 作为本地开发的 GraphQL IDE，请使用以下配置：

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

NestJS 仓库中提供了一个完全可运行的 [schema first sample](https://github.com/nestjs/nest/tree/master/sample/12-graphql-schema-first)。

#### 访问生成的模式

在某些情况下，您可能需要生成的模式对象的引用。例如，在端到端测试中，您可以使用 `graphql` 包直接运行查询，而无需任何 HTTP 监听器。

您可以使用 `GraphQLSchemaHost` 类访问生成的模式（无论采用代码优先还是模式优先方法）：

```typescript
const { schema } = app.get(GraphQLSchemaHost);

```

> info **提示** 在应用程序初始化后（在 `app.listen()` 或 `app.init()` 方法触发 `onModuleInit` 钩子之后）必须调用 `GraphQLSchemaHost#schema` getter。

#### 异步配置

当您需要异步而不是静态地传递模块选项时，请使用 `forRootAsync()` 方法。与大多数动态模块一样，Nest 提供了几种异步配置技术。

一种技术是使用工厂函数：

```typescript
GraphQLModule.forRootAsync<ApolloDriverConfig>({
  driver: ApolloDriver,
  useFactory: () => ({
    typePaths: ['./**/*.graphql'],
  }),
}),

```

像其他 [factory providers](/fundamentals/dependency-injection#工厂提供者usefactory) 一样，工厂函数可以是异步的，并且可以通过 `inject` 注入依赖项。

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

或者，您可以像下面所示，使用类而不是工厂来配置 `GraphQLModule`：

```typescript
GraphQLModule.forRootAsync<ApolloDriverConfig>({
  driver: ApolloDriver,
  useClass: GqlConfigService,
}),

```

上述构造在 `GraphQLModule` 内部实例化了 `GqlConfigService`，并使用它来创建选项对象。`GqlConfigService` 必须实现 `GqlOptionsFactory` 接口，如下所示。`GraphQLModule` 调用所提供类实例上的 `createGqlOptions()` 方法。

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

要重用现有的选项提供者而不是在 `GraphQLModule` 内部创建私有副本，请使用 `useExisting` 语法。

```typescript
GraphQLModule.forRootAsync<ApolloDriverConfig>({
  driver: ApolloDriver,
  imports: [ConfigModule],
  useExisting: ConfigService,
}),

```

#### Mercurius 集成

与 Apollo 不同，[Fastify](/techniques/performance#fastify-adapter) 用户可以使用 `@nestjs/mercurius` 驱动程序。

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

> info **提示** 应用程序运行后，打开您的浏览器并导航到 `http://localhost:3000/graphiql` 查看 [GraphiQL IDE](https://github.com/graphql/graphiql)。

`forRoot()` 方法接受一个选项对象，该对象被传递给底层驱动程序实例。有关可用设置，请参阅 [Mercurius plugin options](https://github.com/mercurius-js/mercurius/blob/master/docs/api/options.md#plugin-options)。

#### 多个端点

`@nestjs/graphql` 模块也可以同时提供多个端点，您可以决定哪些模块包含在哪个端点中。默认情况下，`GraphQLModule` 会在整个应用程序中搜索解析器。要将此扫描限制在模块子集，请使用 `include` 属性。

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  include: [CatsModule],
}),

```

在 **代码优先** 方法中，`include` 选项仅决定扫描哪些模块以查找解析器。使用 `@ObjectType()`、`@InputType()`、`@InterfaceType()`、`@ArgsType()` 装饰的类型，或通过 `registerEnumType()` / `createUnionType()` 注册的类型，仍会包含在每个生成的 `registerIn` 中。要将类型作用域限定到特定模块，请使用 `registerIn` 选项：

```typescript
@ObjectType({ registerIn: () => CatsModule })
export class Cat {
  @Field()
  name: string;
}

```

当使用 `include: [CatsModule]` 构建 `CatsModule` 时，只有分配给 `CatsModule` 的类型才成为其一部分，而分配给其他模块的类型则被排除在外。没有 `registerIn` 的类型保持默认行为，并且在引用它们的每个 `CatsModule` 中都可用。

`registerIn` 选项可在 `@InputType()`、`@InterfaceType()` 和 `@ArgsType()` 上使用，也可在 `registerEnumType()` 和 `createUnionType()` 上使用：

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

> info **提示** 您可以传递模块类本身或返回该类的工厂函数。当类型和模块相互引用时，优先使用工厂形式（`() => CatsModule`）：它推迟模块解析并避免由循环导入引起的错误。

#### 第三方集成

- [GraphQL Yoga](https://github.com/dotansimha/graphql-yoga)

#### 示例

NestJS 仓库中有一个可运行的 [Mercurius sample](https://github.com/nestjs/nest/tree/master/sample/33-graphql-mercurius)。