<!-- 此文件从 content/graphql/schema-generator.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T10:04:56.007Z -->
<!-- 源文件: content/graphql/schema-generator.md -->
<!-- 源哈希: d2b86171f42c1e22fc0502be077efce4 -->

### 生成 SDL

> warning **警告** 本章仅适用于代码优先（code first）方法。

要手动生成 GraphQL SDL 模式（即不运行应用程序、不连接数据库、不挂接解析器等），请使用 `GraphQLSchemaBuilderModule`：

```typescript
async function generateSchema() {
  const app = await NestFactory.create(GraphQLSchemaBuilderModule);
  await app.init();

  const gqlSchemaFactory = app.get(GraphQLSchemaFactory);
  const schema = await gqlSchemaFactory.create([RecipesResolver]);
  console.log(printSchema(schema));
}

```

> info **提示** `GraphQLSchemaBuilderModule` 和 `GraphQLSchemaFactory` 从 `@nestjs/graphql` 包导入。`printSchema` 函数从 `graphql` 包导入。

#### 用法

`gqlSchemaFactory.create()` 方法接收一个解析器类引用的数组。例如：

```typescript
const schema = await gqlSchemaFactory.create([
  RecipesResolver,
  AuthorsResolver,
  PostsResolver,
]);

```

它还接收一个可选的第二参数，其中包含一个标量类数组：

```typescript
const schema = await gqlSchemaFactory.create(
  [RecipesResolver, AuthorsResolver, PostsResolver],
  [DurationScalar, DateScalar],
);

```

最后，你可以传入一个选项对象（与 `GraphQLModule` 配置的 `buildSchemaOptions` 属性所接受的 `BuildSchemaOptions` 相同）：

```typescript
const schema = await gqlSchemaFactory.create([RecipesResolver], {
  skipCheck: true,
  orphanedTypes: [],
});

```

- `skipCheck`：跳过模式验证；布尔值，默认为 `false`
- `orphanedTypes`：一个类数组，即使它们没有被显式引用（即不属于对象图的一部分）也要生成。通常，一个已声明但在图中任何地方都未被引用的类会被省略。