<!-- 此文件从 content/websockets/guards.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:12:42.849Z -->
<!-- 源文件: content/websockets/guards.md -->
<!-- 源哈希: 0d49b1eda31266da44d4362f45fa216c -->

### 守卫

WebSocket 守卫和 [regular HTTP application guards](/overview/guards) 之间没有根本区别。唯一的区别是，不抛出 `HttpException`，而应该抛出 `WsException`。如果一个守卫返回 `false`，Nest 会抛出一个带有消息 `'Forbidden resource'` 的 `WsException`。

> info **提示** `WsException` 类从 `@nestjs/websockets` 包中暴露。

#### 绑定守卫

以下示例使用了方法作用域的守卫。与基于 HTTP 的应用程序一样，您也可以使用网关作用域的守卫（即使用 `@UseGuards()` 装饰网关类）。使用 `app.useGlobalGuards()` 或 `APP_GUARD` 令牌注册的全局守卫也适用于网关。

```typescript
@UseGuards(AuthGuard)
@SubscribeMessage('events')
handleEvent(client: Client, data: unknown): WsResponse<unknown> {
  const event = 'events';
  return { event, data };
}

```