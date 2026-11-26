<!-- 此文件从 content/websockets/interceptors.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:12:51.608Z -->
<!-- 源文件: content/websockets/interceptors.md -->
<!-- 源哈希: 237c38237d28e64848b9d0eefe3efea7 -->

### 拦截器

[regular interceptors](/overview/interceptors) 和 WebSocket 拦截器之间没有区别。以下示例使用手动实例化的方法作用域拦截器。与基于 HTTP 的应用程序一样，您也可以使用网关作用域拦截器（即使用 `@UseInterceptors()` 装饰网关类）。使用 `app.useGlobalInterceptors()` 或 `APP_INTERCEPTOR` 令牌注册的全局拦截器也适用于网关。

```typescript
@UseInterceptors(new TransformInterceptor())
@SubscribeMessage('events')
handleEvent(client: Client, data: unknown): WsResponse<unknown> {
  const event = 'events';
  return { event, data };
}

```