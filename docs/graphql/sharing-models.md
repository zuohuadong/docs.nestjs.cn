<!-- 此文件从 content/graphql/sharing-models.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T10:00:42.700Z -->
<!-- 源文件: content/graphql/sharing-models.md -->
<!-- 源哈希: 29a83dc0a8e4b916ff05ee6e3d49a705 -->

### 共享模型

> warning **警告** 本章仅适用于代码优先（code first）方法。

在项目后端使用 TypeScript 的最大优势之一，是能够通过一个公共的 TypeScript 包，在基于 TypeScript 的前端应用中复用相同的模型。

然而，使用代码优先方法创建的模型会被大量标注与 GraphQL 相关的装饰器。这些装饰器在前端毫无用处，并且会损害其性能。

#### 使用模型 shim

为了解决这个问题，Nest 提供了一个 "shim"，用惰性代码替换原有的装饰器。`@nestjs/graphql` 包通过 `browser` 导出条件暴露该 shim，因此为浏览器构建解析该条件的打包器（例如以 `web` 为目标的 webpack）会自动采用它。

如果你的打包器不解析 `browser` 条件，请在 `@nestjs/graphql` 包与该 shim 之间配置一个别名。例如，使用 webpack：

```typescript
resolve: { // see: https://webpack.js.org/configuration/resolve/
  alias: {
      "@nestjs/graphql": path.resolve(__dirname, "../node_modules/@nestjs/graphql/dist/extra/graphql-model-shim")
  }
}

```

> info **提示** [TypeORM](/data/typeorm) 包提供了类似的 [model shim](https://github.com/typeorm/typeorm/blob/master/extra/typeorm-model-shim.js)。