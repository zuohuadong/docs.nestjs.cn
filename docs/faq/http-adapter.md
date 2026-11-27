<!-- 此文件从 content/faq/http-adapter.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T01:03:45.559Z -->
<!-- 源文件: content/faq/http-adapter.md -->
<!-- 源哈希: 87285b1677a5a6694b0cf87b8199455a -->

### HTTP 适配器

偶尔，您可能需要在 Nest 应用上下文内部或外部访问底层的 HTTP 服务器。

每个原生（平台特定）HTTP 服务器或库实例（例如 Express 或 Fastify）都被包装在一个**适配器**中。该适配器被注册为一个全局可用的提供者，因此您可以从应用上下文中检索它或将其注入到其他提供者中。

#### 应用上下文外部策略

要从应用上下文外部获取对 `HttpAdapter` 的引用，请调用 `getHttpAdapter()` 方法：

```typescript
const app = await NestFactory.create(AppModule);
const httpAdapter = app.getHttpAdapter();

```

#### 可注入

要从应用上下文内部获取对 `HttpAdapterHost` 的引用，像注入任何其他提供者一样注入它（例如，使用构造函数注入）：

```typescript
export class CatsService {
  constructor(private adapterHost: HttpAdapterHost) {}
}

```

> info **提示** `HttpAdapterHost` 从 `@nestjs/core` 包中导入。

`HttpAdapterHost` **不是**实际的 `HttpAdapter`。要获取实际的 `HttpAdapter` 实例，请读取其 `httpAdapter` 属性：

```typescript
const adapterHost = app.get(HttpAdapterHost);
const httpAdapter = adapterHost.httpAdapter;

```

`httpAdapter` 是包装底层框架的 HTTP 适配器实例。它是 `ExpressAdapter`、`FastifyAdapter` 或 `NodeAdapter` 的实例（它们都继承自 `AbstractHttpAdapter`）。

适配器对象暴露了多个方法，用于与 HTTP 服务器交互。要直接访问库实例（例如 Express 实例），请调用 `getInstance()` 方法：

```typescript
const instance = httpAdapter.getInstance();

```

#### 监听事件

要在服务器开始监听传入请求时运行代码，请订阅 `listen$` 流：

```typescript
this.httpAdapterHost.listen$.subscribe(() =>
  console.log('HTTP server is listening'),
);

```

`HttpAdapterHost` 还暴露了一个 `listening` 布尔属性，指示服务器当前是否正在监听：

```typescript
if (this.httpAdapterHost.listening) {
  console.log('HTTP server is listening');
}

```