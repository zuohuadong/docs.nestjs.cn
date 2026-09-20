<!-- 此文件从 content/graphql/quick-start.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:48:02.054Z -->
<!-- 源文件: content/graphql/quick-start.md -->
<!-- 源哈希: 41985411703f1f4d502890a44c923b11 -->

## 利用 TypeScript 与 GraphQL 的强大功能

[GraphQL](https://graphql.org/) 是一种强大的 API 查询语言，也是一种使用现有数据来满足这些查询的运行时。它是一种优雅的方法，解决了 REST API 中常见的许多问题。作为背景知识，我们建议阅读这篇关于 GraphQL 与 REST 之间区别的[comparison](https://www.apollographql.com/blog/graphql-vs-rest)。GraphQL 与 [TypeScript](https://www.typescriptlang.org/) 结合使用，可以帮助你在 GraphQL 查询中获得更好的类型安全性，为你提供端到端的类型支持。

在本章中，我们假设你对 GraphQL 有基本的了解，并专注于如何使用内置的 `@nestjs/graphql` 模块。`GraphQLModule` 可以配置为使用 [Apollo](https://www.apollographql.com/) 服务器（使用 `@nestjs/apollo` 驱动）和 [Mercurius](https://github.com/mercurius-js/mercurius)（使用 `@nestjs/mercurius`）。我们为这些经过验证的 GraphQL 包提供了官方集成，以提供一种使用 Nest 与 GraphQL 的简单方式（查看更多集成[here](/graphql/quick-start#third-party-integrations)）。

你也可以构建自己的专用驱动（更多信息请阅读[here](/graphql/guards-interceptors#创建自定义驱动)）。

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

> warning **警告** `@nestjs/graphql@>=9` 和 `@nestjs/apollo^10` 包与 **Apollo v3** 兼容（查看 Apollo Server 3 [migration guide](https://www.apollographql.com/docs/apollo-server/migration/) 了解更多详情），而 `@nestjs/graphql@^8` 仅支持 **Apollo v2**（例如，`apollo-server-express@2.x.x` 包）。

#### 概述

Nest 提供了两种构建 GraphQL 应用程序的方式：**代码优先** 和 **模式优先** 方法。你应该选择最适合你的方式。本 GraphQL 部分的大多数章节分为两个主要部分：如果你采用 **代码优先**，则遵循一个部分；如果你采用 **模式优先**，则使用另一个部分。

在 **代码优先** 方法中，你使用装饰器和 TypeScript 类来生成相应的 GraphQL 模式。如果你更喜欢专门使用 TypeScript 并避免在不同语言语法之间切换上下文，这种方法非常有用。

在 **模式优先** 方法中，事实来源是 GraphQL SDL（模式定义语言）文件。SDL 是一种与语言无关的方式，可以在不同平台之间共享模式文件。Nest 会根据 GraphQL 模式自动生成你的 TypeScript 定义（使用类或接口），以减少编写冗余样板代码的需要。

<app-banner-courses-graphql-cf></app-banner-courses-graphql-cf>

#### GraphQL 与 TypeScript 入门

> info **提示** 在接下来的章节中，我们将集成 `@nestjs/apollo` 包。如果你想使用 `mercurius` 包，请导航到[this section](/graphql/quick-start#mercurius-集成)。

安装包后，我们可以导入 `GraphQLModule` 并使用 `forRoot()` 静态方法进行配置。

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

> info **提示** 对于 `mercurius` 集成，你应该使用 `MercuriusDriver` 和 `MercuriusDriverConfig` 代替。两者都从 `@nestjs/mercurius` 包中导出。

`forRoot()` 方法接受一个选项对象作为参数。这些选项会传递给底层驱动实例（在此处阅读可用设置的更多信息：[Apollo](https://www.apollographql.com/docs/apollo-server/api/apollo-server) 和 [Mercurius](https://github.com/mercurius-js/mercurius/blob/master/docs/api/options.md#plugin-options)）。例如，如果你想禁用 GraphQL IDE，请传递以下选项：

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

> warning **警告** `graphql-playground` IDE 已在 `@nestjs/graphql` v14 中移除。`playground` 选项仍然存在，作为 **GraphiQL 的已弃用布尔别名** - `playground: false` 禁用登录页面，`playground: true` 启用 GraphiQL - 但新代码应使用 `graphiql` 代替。

在这种情况下，这些选项将转发给 `ApolloServer` 构造函数。

#### 访问请求和响应对象

一个值得提出的驱动选项是 `context`，它是一个为每个请求构建 GraphQL 执行上下文的工厂。使用它将底层请求和响应对象暴露给你的解析器：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  context: ({ req, res }) => ({ req, res }),
}),

```

有了这个设置，你可以通过 `@Context()` 装饰器在解析器中读取它们：

```typescript
@Query(() => String)
userAgent(@Context('req') req: Request): string {
  return req.headers['user-agent'] ?? '';
}

```

> info **提示** 在 GraphQL 上下文中运行的守卫、拦截器和其他增强器可以通过 `GqlExecutionContext.create(context).getContext()` 访问同一对象（参见[Other features](/graphql/guards-interceptors)）。

#### GraphQL IDE

[GraphiQL](https://github.com/graphql/graphiql) 是默认的图形化、交互式、浏览器内的 GraphQL IDE，与 GraphQL 服务器本身在相同的 URL 上提供。要访问它，你需要配置并运行一个基本的 GraphQL 服务器。要立即查看，你可以安装并构建[working example here](https://github.com/nestjs/nest/tree/master/sample/23-graphql-code-first)。或者，如果你正在跟随这些代码示例，一旦你完成了[Resolvers chapter](/graphql/resolvers-map)的步骤，你就可以访问 GraphiQL。

有了这些设置，并且你的应用程序在后台运行，你可以打开你的 Web 浏览器并导航到 `http://localhost:3000/graphql`（主机和端口可能因你的配置而异）。然后你将看到 GraphiQL，如下所示。

<figure>
  <img src="/assets/playground.png" alt="" />
</figure>

> info **注意** `@nestjs/mercurius` 集成也使用 [GraphiQL](https://github.com/graphql/graphiql)。

##### 启用和禁用 GraphiQL

从 `@nestjs/graphql` v14 开始，GraphiQL **就是** GraphQL IDE - 旧的 `graphql-playground` 已被完全移除。每当 `NODE_ENV` 不是 `production` 时，GraphiQL 会自动启用，因此在开发环境中你无需配置任何内容即可获得它，而在生产环境中登录页面默认关闭。

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

> warning **警告** `playground` 选项仍然存在，但仅作为 `graphiql` 的 **已弃用布尔别名**。如果两者都设置，`graphiql` 优先。将 `playground: false` 迁移到 `graphiql: false`，将 `playground: true` 迁移到 `graphiql: true`。

##### 配置 GraphiQL

传递一个对象而不是布尔值来启用 GraphiQL 并同时进行配置：

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

可用的选项如下：

<table>
  <tr>
    <td><code>url</code></td>
    <td>IDE 发送操作所指向的端点。默认为驱动器的 <code>path</code> 选项，因此仅当 IDE 应指向与提供服务的 URL 不同的 URL 时才需要设置此项。</td>
  </tr>
  <tr>
    <td><code>headers</code></td>
    <td>应用于每个请求的标头。在开发期间预配置 <code>authorization</code> 标头时很有用。如果启用了标头编辑器并且用户设置了相同的标头，则用户的值优先。</td>
  </tr>
  <tr>
    <td><code>shouldPersistHeaders</code></td>
    <td>是否将标头编辑器的内容持久化到浏览器存储中。默认值：<code>true</code>。</td>
  </tr>
  <tr>
    <td><code>isHeadersEditorEnabled</code></td>
    <td>是否在编辑器工具中显示标头编辑器。设置为 <code>false</code> 可防止用户编辑标头。默认值：<code>true</code>。</td>
  </tr>
  <tr>
    <td><code>inputValueDeprecation</code></td>
    <td>如果为 <code>true</code>，则模式文档包含已弃用的输入字段和参数值，并且 introspection 会返回它们。默认值：<code>false</code>。</td>
  </tr>
</table>

> info **提示** 由于 GraphiQL 在生产环境之外默认开启，常见的设置是在开发环境中保持默认，仅在需要隐藏非生产环境（可公开访问）中的模式时才设置 `graphiql: false`。

##### IDE 中的订阅

如果您的应用程序使用 [subscriptions](/graphql/subscriptions)，请使用 `graphql-ws`。对 `subscriptions-transport-ws` 的支持已被**移除** - 它不再被接受为 `subscriptions` 键，并且该包不再是依赖项：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  subscriptions: {
    'graphql-ws': true,
  },
}),

```

有了这些，GraphiQL 就可以直接对您的服务器执行订阅操作。

#### 代码优先

在**代码优先**方法中，您使用装饰器和 TypeScript 类来生成相应的 GraphQL 模式。

要使用代码优先方法，首先将 `autoSchemaFile` 属性添加到选项对象中：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
}),

```

`autoSchemaFile` 属性值是自动生成模式的保存路径。或者，模式可以在内存中即时生成。要启用此功能，请将 `autoSchemaFile` 属性设置为 `true`：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: true,
}),

```

默认情况下，生成的模式中的类型将按照在包含的模块中定义的顺序排列。要按字典顺序对模式进行排序，请将 `sortSchema` 属性设置为 `true`：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
  sortSchema: true,
}),

```

#### 示例

一个完整可用的代码优先示例可在 [here](https://github.com/nestjs/nest/tree/master/sample/23-graphql-code-first) 中找到。

#### 模式优先

要使用模式优先方法，首先将 `typePaths` 属性添加到选项对象中。`typePaths` 属性指示 `GraphQLModule` 应查找您将要编写的 GraphQL SDL 模式定义文件的位置。这些文件将在内存中合并；这允许您将模式拆分为多个文件，并将它们放在解析器附近。

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  typePaths: ['./**/*.graphql'],
}),

```

您通常还需要具有与 GraphQL SDL 类型对应的 TypeScript 定义（类和接口）。手动创建相应的 TypeScript 定义是冗余且乏味的。这使我们失去了单一事实来源——SDL 中的每次更改都迫使我们同时调整 TypeScript 定义。为了解决这个问题，`@nestjs/graphql` 包可以从抽象语法树（[AST](https://en.wikipedia.org/wiki/Abstract_syntax_tree)）**自动生成** TypeScript 定义。要启用此功能，请在配置 `GraphQLModule` 时添加 `definitions` 选项属性。

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  typePaths: ['./**/*.graphql'],
  definitions: {
    path: join(process.cwd(), 'src/graphql.ts'),
  },
}),

```

`definitions` 对象的 path 属性指示保存生成的 TypeScript 输出的位置。默认情况下，所有生成的 TypeScript 类型都作为接口创建。要生成类，请将 `outputAs` 属性设置为 `'class'`。

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

上述方法在每次应用程序启动时动态生成 TypeScript 定义。或者，可能更倾向于构建一个简单的脚本按需生成这些定义。例如，假设我们创建以下脚本作为 `generate-typings.ts`：

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

> info **提示** 您可以预先编译脚本（例如使用 `tsc`）并使用 `node` 来执行它。

要为脚本启用监视模式（每当任何 `.graphql` 文件更改时自动生成类型），请将 `watch` 选项传递给 `generate()` 方法。

```typescript
definitionsFactory.generate({
  typePaths: ['./src/**/*.graphql'],
  path: join(process.cwd(), 'src/graphql.ts'),
  outputAs: 'class',
  watch: true,
});

```

要为每个对象类型自动生成额外的 `__typename` 字段，请启用 `emitTypenameField` 选项：

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

要将枚举生成为 TypeScript 联合类型而不是常规 TypeScript 枚举，请将 `enumsAsTypes` 选项设置为 `true`：

```typescript
definitionsFactory.generate({
  // ...
  enumsAsTypes: true,
});

```

#### Apollo Sandbox

要使用 [Apollo Sandbox](https://www.apollographql.com/blog/announcement/platform/apollo-sandbox-an-open-graphql-ide-for-local-development/) 代替 GraphiQL 作为本地开发的 GraphQL IDE，请使用以下配置：

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

一个完整可用的 schema first 示例可在 [here](https://github.com/nestjs/nest/tree/master/sample/12-graphql-schema-first) 获取。

#### 访问生成的 schema

在某些情况下（例如端到端测试），您可能希望获取生成的 schema 对象的引用。在端到端测试中，您可以使用 `graphql` 对象运行查询，而无需使用任何 HTTP 监听器。

您可以使用 `GraphQLSchemaHost` 类访问生成的 schema（无论是 code first 还是 schema first 方式）：

```typescript
const { schema } = app.get(GraphQLSchemaHost);

```

> info **提示** 您必须在应用程序初始化之后（即 `app.listen()` 或 `app.init()` 方法触发了 `onModuleInit` 钩子之后）调用 `GraphQLSchemaHost#schema` getter。

#### 异步配置

当您需要异步而非静态地传递模块选项时，请使用 `forRootAsync()` 方法。与大多数动态模块一样，Nest 提供了多种技术来处理异步配置。

一种技术是使用工厂函数：

```typescript
 GraphQLModule.forRootAsync<ApolloDriverConfig>({
  driver: ApolloDriver,
  useFactory: () => ({
    typePaths: ['./**/*.graphql'],
  }),
}),

```

与其他工厂提供者一样，我们的工厂函数可以是 <a href="/fundamentals/custom-providers#工厂提供者usefactory">async</a> 的，并且可以通过 `inject` 注入依赖。

```typescript
GraphQLModule.forRootAsync<ApolloDriverConfig>({
  driver: ApolloDriver,
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    typePaths: configService.get<string>('GRAPHQL_TYPE_PATHS'),
  }),
  inject: [ConfigService],
}),

```

或者，您可以使用类而不是工厂来配置 `GraphQLModule`，如下所示：

```typescript
GraphQLModule.forRootAsync<ApolloDriverConfig>({
  driver: ApolloDriver,
  useClass: GqlConfigService,
}),

```

上述构造在 `GraphQLModule` 内部实例化了 `GqlConfigService`，并使用它来创建选项对象。请注意，在此示例中，`GqlConfigService` 必须实现 `GqlOptionsFactory` 接口，如下所示。`GraphQLModule` 将在所提供类的实例化对象上调用 `createGqlOptions()` 方法。

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

如果您想重用现有的选项提供者，而不是在 `GraphQLModule` 内部创建私有副本，请使用 `useExisting` 语法。

```typescript
GraphQLModule.forRootAsync<ApolloDriverConfig>({
  imports: [ConfigModule],
  useExisting: ConfigService,
}),

```

#### Mercurius 集成

Fastify 用户（了解更多 [here](/techniques/performance)）可以改用 `@nestjs/mercurius` 驱动程序，而不是使用 Apollo。

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

> info **提示** 应用程序运行后，打开浏览器并导航到 `http://localhost:3000/graphiql`。您应该会看到 [GraphQL IDE](https://github.com/graphql/graphiql)。

`forRoot()` 方法接受一个选项对象作为参数。这些选项会传递给底层驱动程序实例。有关可用设置的更多信息，请参阅 [here](https://github.com/mercurius-js/mercurius/blob/master/docs/api/options.md#plugin-options)。

#### 多个端点

`@nestjs/graphql` 模块的另一个有用功能是能够同时提供多个端点。这使您可以决定哪些模块应包含在哪个端点中。默认情况下，`GraphQL` 会在整个应用程序中搜索解析器。要将此扫描限制为仅部分模块，请使用 `include` 属性。

```typescript
GraphQLModule.forRoot({
  include: [CatsModule],
}),

```

在 **code first** 方式中，`include` 选项仅决定扫描哪些模块以查找解析器。使用 `@ObjectType()`、`@InputType()`、`@InterfaceType()`、`@ArgsType()` 装饰的类型，或通过 `registerEnumType()` / `createUnionType()` 注册的类型，仍然会出现在每个生成的 schema 中。要将类型限定到特定模块，请使用 `registerIn` 选项：

```typescript
@ObjectType({ registerIn: () => CatsModule })
export class Cat {
  @Field()
  name: string;
}

```

现在，当使用 `include: [CatsModule]` 构建 schema 时，只有分配给 `CatsModule` 的类型才会成为其一部分，而分配给其他模块的类型将被排除。没有 `registerIn` 的类型保持默认行为，并且可用于引用它们的每个 schema。

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

> info **提示** 您可以传递模块类本身或返回该类的工厂函数。当类型和模块相互引用时，请优先使用工厂形式（`() => CatsModule`），因为它会延迟模块解析，从而避免由循环导入引起的错误。

> warning **警告** 如果您在单个应用程序中将 `@apollo/server` 与 `@as-integrations/fastify` 包一起使用并配置多个 GraphQL 端点，请确保在 `GraphQLModule` 配置中启用 `disableHealthCheck` 设置。

#### 第三方集成

- [GraphQL Yoga](https://github.com/dotansimha/graphql-yoga)

#### 示例

一个可用的示例可在 [here](https://github.com/nestjs/nest/tree/master/sample/33-graphql-mercurius) 获取。