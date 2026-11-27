<!-- 此文件从 content/graphql/schema-generator.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:07:02.048Z -->
<!-- 源文件: content/graphql/schema-generator.md -->
<!-- 源哈希: 59300d40ce92df2f1993655def9500a0 -->

### 生成 SDL

> 警告 **警告** 本章仅适用于代码优先方法。

要手动生成 GraphQL SDL 模式（即不运行应用程序、不连接数据库、不挂载解析器等），请使用 `GraphQLSchemaBuilderModule`：

```typescript
async function generateSchema() {
  const app = await NestFactory.create(GraphQLSchemaBuilderModule);
  await app.init();

  const gqlSchemaFactory = app.get(GraphQLSchemaFactory);
  const schema = await gqlSchemaFactory.create([RecipesResolver]);
  console.log(printSchema(schema));
}

```

> 信息 **提示** `GraphQLSchemaBuilderModule` 和 `GraphQLSchemaFactory` 从 `@nestjs/graphql` 包导入。`printSchema` 函数从 `graphql` 包导入。

#### 用法

`gqlSchemaFactory.create()` 方法接受一个解析器类引用的数组。例如：

```typescript
const schema = await gqlSchemaFactory.create([
  RecipesResolver,
  AuthorsResolver,
  PostsResolver,
]);

```

它还接受一个可选的第二个参数，该参数是一个标量类数组：

```typescript
const schema = await gqlSchemaFactory.create(
  [RecipesResolver, AuthorsResolver, PostsResolver],
  [DurationScalar, DateScalar],
);

```

最后，您可以传递一个选项对象（与 `GraphQLModule` 配置的 `buildSchemaOptions` 属性接受的相同）：

```typescript
const schema = await gqlSchemaFactory.create([RecipesResolver], {
  skipCheck: true,
  orphanedTypes: [],
});

```

- `skipCheck`：跳过模式验证；布尔值，默认为 `false`
- `orphanedTypes`：一个需要生成但未明确引用的类数组（即不属于对象图）。通常，声明但图中未引用的类会被省略。

#### 联邦

`GraphQLSchemaFactory` 构建一个纯粹的 GraphQL 模式：它不了解 Apollo Federation。要获取代码优先 [federated](/graphql/federation) 子图的 SDL（例如，将其传递给 `rover subgraph check` 或 `rover supergraph compose`），请使用 `printSubgraphSchema` 从 `@apollo/subgraph` 打印，而不是使用 `printSchema`，这样才能保留诸如 `@key`、`@shareable` 或 `@external` 等指令：

```typescript
import { printSubgraphSchema } from '@apollo/subgraph';

async function generateSchema() {
  const app = await NestFactory.create(GraphQLSchemaBuilderModule);
  await app.init();

  const gqlSchemaFactory = app.get(GraphQLSchemaFactory);
  const schema = await gqlSchemaFactory.create([UsersResolver], {
    orphanedTypes: [User],
  });
  console.log(printSubgraphSchema(schema));
}

```

对于 Federation 2，打印的 SDL 还必须链接联邦规范，否则它将被视为 Federation 1 子图。请自行添加 `@link`，导入您的类型使用的每个联邦指令：

```typescript
const sdl = `extend schema @link(url: "https://specs.apollo.dev/federation/v2.14", import: ["@key", "@shareable", "@external"])

${printSubgraphSchema(schema)}`;

```

> 信息 **提示** 仅通过 `_entities` 引用的实体类型（例如，使用 `@ResolveReference()` 解析的 `@extends` 存根）无法从根类型到达，因此请将它们包含在 `orphanedTypes` 中。否则，模式将不包含它们生成。