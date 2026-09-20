<!-- 此文件从 content/graphql/schema-generator.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:32:50.325Z -->
<!-- 源文件: content/graphql/schema-generator.md -->
<!-- 源哈希: 5c4db6f0ea11d3eace061dd8d6d0265a -->

### 生成 SDL

> warning **警告** 本章仅适用于代码优先方法。

要手动生成 GraphQL SDL 模式（即无需运行应用程序、连接数据库、挂接解析器等），请使用 `GraphQLSchemaBuilderModule`。

```typescript
async function generateSchema() {
  const app = await NestFactory.create(GraphQLSchemaBuilderModule);
  await app.init();

  const gqlSchemaFactory = app.get(GraphQLSchemaFactory);
  const schema = await gqlSchemaFactory.create([RecipesResolver]);
  console.log(printSchema(schema));
}

```

> info **提示** `GraphQLSchemaBuilderModule` 和 `GraphQLSchemaFactory` 从 `@nestjs/graphql` 包中导入。`printSchema` 函数从 `graphql` 包中导入。

#### 用法

`gqlSchemaFactory.create()` 方法接受一个解析器类引用数组。例如：

```typescript
const schema = await gqlSchemaFactory.create([
  RecipesResolver,
  AuthorsResolver,
  PostsResolver,
]);

```

它还接受第二个可选参数，该参数是一个标量类数组：

```typescript
const schema = await gqlSchemaFactory.create(
  [RecipesResolver, AuthorsResolver, PostsResolver],
  [DurationScalar, DateScalar],
);

```

最后，您可以传递一个选项对象：

```typescript
const schema = await gqlSchemaFactory.create([RecipesResolver], {
  skipCheck: true,
  orphanedTypes: [],
});

```

- `skipCheck`：忽略模式验证；布尔值，默认为 `false`
- `orphanedTypes`：要生成的未显式引用（不属于对象图）的类列表。通常，如果声明了一个类但在图中未被引用，则会被省略。该属性值是一个类引用数组。