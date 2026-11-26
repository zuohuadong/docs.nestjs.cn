<!-- 此文件从 content/security/cors.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:19:23.334Z -->
<!-- 源文件: content/security/cors.md -->
<!-- 源哈希: d780f0b62c0fcbadb28cd33b987f8631 -->

### CORS

跨域资源共享 (CORS) 是一种允许从另一个域请求资源的机制。在底层，Nest 根据底层平台使用 Express [cors](https://github.com/expressjs/cors) 包或 Fastify [@fastify/cors](https://github.com/fastify/fastify-cors) 包。这些包提供了各种选项，您可以根据需求进行自定义。

#### 入门

要启用 CORS，请在 Nest 应用程序对象上调用 `enableCors()` 方法。

```typescript
const app = await NestFactory.create(AppModule);
app.enableCors();
await app.listen(process.env.PORT ?? 3000);

```

`enableCors()` 方法接受一个可选的配置对象。其可用属性在官方 [CORS configuration options](https://github.com/expressjs/cors#configuration-options) 文档中有描述。或者，您可以传递一个 [callback function](https://github.com/expressjs/cors#customizing-cors-settings-dynamically-per-request)，该 [callback function](https://github.com/expressjs/cors#customizing-cors-settings-dynamically-per-request) 会为每个请求计算配置对象。

您也可以通过 `create()` 方法的选项对象来启用 CORS。将 `cors` 属性设置为 `true` 以使用默认设置启用 CORS，或者将 [CORS configuration object](https://github.com/expressjs/cors#configuration-options) 或 [callback function](https://github.com/expressjs/cors#customizing-cors-settings-dynamically-per-request) 作为 `cors` 属性值传递以自定义其行为。

```typescript
const app = await NestFactory.create(AppModule, { cors: true });
await app.listen(process.env.PORT ?? 3000);

```

#### 默认允许的源

如果没有 `origin` 选项，就像 `enableCors()` 或 `cors: true` 一样，每个适配器都以 `Access-Control-Allow-Origin: *` 响应来自任何源的请求。任何网站随后都可以从访问者的浏览器调用您的 API 并读取响应。浏览器不会共享带有 Cookie 或 HTTP 认证的请求的响应，但请求来自访问者的网络，因此信任其网络位置的 API（例如内部网服务或位于 IP 白名单后）可以从任何站点读取。

要仅接受来自您自己的前端的请求，请列出它们的源：

```typescript
app.enableCors({
  origin: ['https://app.example.com', 'https://admin.example.com'],
});

```

> warning **警告** 不要将 `origin: true` 与 `credentials: true` 结合使用。`origin: true` 会回显请求的 `Origin` 头部，因此任何网站都可以代表已登录用户发送经过认证的请求并读取响应。

#### 默认允许的方法

这两个包的默认设置不相同，因此在没有选项的情况下使用 `enableCors()` 不会在两个平台上宣传相同的 `Access-Control-Allow-Methods`。Express [cors](https://github.com/expressjs/cors) 包响应 `GET,HEAD,PUT,PATCH,POST,DELETE`，而 [@fastify/cors](https://github.com/fastify/fastify-cors) 只响应 [CORS-safelisted methods](https://fetch.spec.whatwg.org/#methods)：`GET,HEAD,POST`。

> warning **警告** 在 Fastify 上，除非您自己列出方法，否则跨域 `PUT`、`PATCH` 或 `DELETE` 会在预检阶段被拒绝。相同的应用程序代码在 Express 上也有效。

两个包都读取相同的 `methods` 选项，因此，当您的 API 从另一个源调用且方法不在安全列表中时，请明确定义它。它同时被 `enableCors()` 和 `create()` 选项对象的 `cors` 属性所接受。

```typescript
app.enableCors({
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
});

```