<!-- 此文件从 content/graphql/sharing-models.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:06:56.143Z -->
<!-- 源文件: content/graphql/sharing-models.md -->
<!-- 源哈希: 03b39f5320eb28d936a429b0b5b8d696 -->

### 共享模型

> 警告 **警告** 本章仅适用于代码优先方法。

使用 TypeScript 作为项目后端的最大优势之一是可以通过通用的 TypeScript 包在基于 TypeScript 的前端应用程序中重用相同的模型。

然而，使用代码优先方法创建的模型会大量使用与 GraphQL 相关的装饰器。这些装饰器在前端是无关的，并且会损害其性能。

#### 使用模型垫片 (model shim)

为解决此问题，Nest 提供了一个“垫片”，它用惰性代码替换了原始的装饰器。`@nestjs/graphql` 包通过 `browser` 导出条件暴露了该垫片，因此解析该条件的打包器（例如，使用 `web` 目标的 webpack）会自动拾取它。

如果您的打包器不解析 `browser` 条件，请在 `@nestjs/graphql` 包和垫片之间配置别名。例如，使用 webpack：

```typescript
resolve: { // see: https://webpack.js.org/configuration/resolve/
  alias: {
      "@nestjs/graphql": path.resolve(__dirname, "../node_modules/@nestjs/graphql/dist/extra/graphql-model-shim")
  }
}

```

> 信息 **提示** [TypeORM](/recipes/sql-typeorm) 包提供了一个类似的 [model shim](https://github.com/typeorm/typeorm/blob/master/packages/typeorm/extra/typeorm-model-shim.js)。