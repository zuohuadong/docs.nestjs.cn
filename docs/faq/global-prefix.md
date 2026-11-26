<!-- 此文件从 content/faq/global-prefix.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T23:13:25.056Z -->
<!-- 源文件: content/faq/global-prefix.md -->
<!-- 源哈希: f48a90148455df06ccf022ff4dbc7147 -->

### 全局前缀

要为 HTTP 应用程序中注册的**每个路由**设置前缀，请在 `INestApplication` 实例上调用 `setGlobalPrefix()` 方法。

```typescript
const app = await NestFactory.create(AppModule);
app.setGlobalPrefix('v1');

```

要将路由排除在全局前缀之外，请使用 `exclude` 选项：

```typescript
app.setGlobalPrefix('v1', {
  exclude: [{ path: 'health', method: RequestMethod.GET }],
});

```

或者，您可以将路由指定为字符串，这将使其排除在每个请求方法之外：

```typescript
app.setGlobalPrefix('v1', { exclude: ['cats'] });

```

> info **提示** `path` 属性通过 [path-to-regexp](https://github.com/pillarjs/path-to-regexp#parameters) 包支持通配符参数。裸通配符星号 (`*`) 已弃用；请改用参数 (`:param`) 或命名通配符 (`*splat`)。命名通配符至少需要一个额外的段，因此 `health/*splat` 排除 `/health/status` 但不排除 `/health` 本身。要排除两者，请用花括号包裹通配符：`health/{*splat&#125;`。

#### 被排除的路由和不匹配的请求

被排除的路由在前缀外部注册，但 Nest 仍然会处理不匹配处理器的请求。例如，使用 `exclude: ['health']` 并且只有一个 `GET /health` 处理程序时，一个 `POST /health` 请求会经过您的异常过滤器并获得 Nest 的标准 `404` 响应。

使用 Express 适配器时，发往既不在前缀下也不被排除的路径的请求永远不会到达 Nest：Express 会用其默认 `404` 页面来响应。Fastify 适配器会将每个不匹配的请求传递给 Nest。

> info **提示** 启用 [URI versioning](/http/versioning) 后，排除匹配在不带版本段的情况下进行，而被排除的路由会保留版本段。例如，`exclude: ['health']` 配合 `defaultVersion: '1'` 在 `/v1/health` 上提供该路由。