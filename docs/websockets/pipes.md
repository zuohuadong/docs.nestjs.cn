<!-- 此文件从 content/websockets/pipes.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:12:53.651Z -->
<!-- 源文件: content/websockets/pipes.md -->
<!-- 源哈希: 3d92a237825b1d1ad733872d95558641 -->

### 管道

[regular pipes](/pipes) 和 WebSocket 管道之间没有根本区别。唯一的区别是，您不应该抛出 `HttpException`，而应该抛出 `WsException`。只有 `WsException` 会带着自己的消息到达客户端。其他任何异常，包括内置验证管道默认抛出的 `BadRequestException`，都会作为 `'Internal server error'` 报告给客户端。

> info **提示** `WsException` 类从 `@nestjs/websockets` 包中暴露。

#### 绑定管道

下面的示例使用了手动实例化的方法作用域管道。与基于 HTTP 的应用程序一样，您也可以使用网关作用域管道（即使用 `@UsePipes()` 装饰网关类）。使用 `app.useGlobalPipes()` 或 `APP_PIPE` 注册的全局管道也适用于网关。

```typescript
@UsePipes(new ValidationPipe({ exceptionFactory: (errors) => new WsException(errors) }))
@SubscribeMessage('events')
handleEvent(client: Client, data: unknown): WsResponse<unknown> {
  const event = 'events';
  return { event, data };
}

```

方法作用域、网关作用域和全局作用域的管道会为消息处理程序的每个参数运行。如果只想转换或验证消息负载，请在参数级别绑定管道，例如 `@MessageBody(new ParseIntPipe())` 或 `@MessageBody('id', ParseIntPipe)`。

#### 基于模式的验证

与 HTTP 参数装饰器一样，`@MessageBody()` 接受一个包含 `schema` 属性的选项对象。模式可以来自任何兼容 [Standard Schema](https://standardschema.dev/) 的库，例如 Zod、Valibot 或 ArkType。内置的 `StandardSchemaValidationPipe` 根据该模式验证负载，并且不带模式的参数保持不变。有关详细信息，请参阅 [Schema-based validation](/techniques/validation#基于模式的验证)。

```typescript
@UsePipes(
  new StandardSchemaValidationPipe({
    exceptionFactory: (issues) => new WsException(issues),
  }),
)
@SubscribeMessage('events')
handleEvent(@MessageBody({ schema: createEventSchema }) data: CreateEventDto) {
  return data;
}

```

要提取单个属性并验证它，请首先传递属性键：`@MessageBody('id', { schema: z.number() })`。