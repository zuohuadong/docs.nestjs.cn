<!-- 此文件从 content/graphql/sharing-models.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-03T11:07:04.562Z -->
<!-- 源文件: content/graphql/sharing-models.md -->

### 共享模型

> warning **警告** 本章仅适用于代码优先方法。

在项目后端使用 TypeScript 的最大优势之一，就是能够通过使用一个公共的 TypeScript 包，在基于 TypeScript 的前端应用程序中复用相同的模型。

但有一个问题：使用代码优先方法创建的模型大量使用了与 GraphQL 相关的装饰器。这些装饰器在前端无关紧要，会对性能产生负面影响。

#### 使用模型 shim

为了解决这个问题，NestJS 提供了一个“shim”，它允许你通过使用 `webpack`（或类似的）配置，将原始装饰器替换为惰性代码。
要使用这个 shim，请在 `@nestjs/graphql` 包和 shim 之间配置一个别名。

例如，对于 webpack，可以通过以下方式解决：

```typescript
resolve: { // see: https://webpack.js.org/configuration/resolve/
  alias: {
      "@nestjs/graphql": path.resolve(__dirname, "../node_modules/@nestjs/graphql/dist/extra/graphql-model-shim")
  }
}

```

> info **提示** [TypeORM](/techniques/sql) 包有一个类似的 shim，可以在 [here](https://github.com/typeorm/typeorm/blob/master/extra/typeorm-model-shim.js) 找到。