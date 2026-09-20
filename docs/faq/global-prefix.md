<!-- 此文件从 content/faq/global-prefix.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T07:42:54.412Z -->
<!-- 源文件: content/faq/global-prefix.md -->
<!-- 源哈希: d0bce55b55c148a6429881b116d937e3 -->

### 全局前缀

要为 HTTP 应用程序中注册的**每个路由**设置前缀，请使用 `INestApplication` 实例的 `setGlobalPrefix()` 方法。

```typescript
const app = await NestFactory.create(AppModule);
app.setGlobalPrefix('v1');

```

您可以使用以下构造从全局前缀中排除路由：

```typescript
app.setGlobalPrefix('v1', {
  exclude: [{ path: 'health', method: RequestMethod.GET }],
});

```

或者，您可以将路由指定为字符串（它将应用于每个请求方法）：

```typescript
app.setGlobalPrefix('v1', { exclude: ['cats'] });

```

> info **提示** `path` 属性支持使用 [path-to-regexp](https://github.com/pillarjs/path-to-regexp#parameters) 包的通配符参数。注意：这不接受通配符星号 `*`。相反，您必须使用参数（`:param`）或命名通配符（`*splat`）。