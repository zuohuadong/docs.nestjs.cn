<!-- 此文件从 content/microservices/pipes.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T09:25:25.897Z -->
<!-- 源文件: content/microservices/pipes.md -->
<!-- 源哈希: 44c78fe7b0dd9061b6245b5f1a7908c0 -->

### 管道

微服务管道的工作方式与 [regular pipes](/pipes) 相同。唯一的区别是它们应该抛出 `RpcException` 而不是 `HttpException`。除非自定义异常过滤器处理它，否则在消息处理期间抛出的 `HttpException` 会作为通用的 `Internal server error` 消息到达客户端。

> info **提示** `RpcException` 类从 `@nestjs/microservices` 包中导出。

#### 绑定管道

以下示例使用手动实例化的方法作用域管道。`exceptionFactory` 选项使 `ValidationPipe` 抛出 `RpcException` 而不是其默认的 `BadRequestException`。与基于 HTTP 的应用程序一样，你也可以使用控制器作用域管道（即，在控制器类前加上 `@UsePipes()` 装饰器）。

```typescript
@UsePipes(new ValidationPipe({ exceptionFactory: (errors) => new RpcException(errors) }))
@MessagePattern({ cmd: 'sum' })
accumulate(data: number[]): number {
  return (data || []).reduce((a, b) => a + b);
}

```

`@Payload()` 装饰器还接受一个 `schema` 选项，它允许 `StandardSchemaValidationPipe`（从 `@nestjs/common` 导出）根据 [Standard Schema](/techniques/validation#使用内置的-standardschemavalidationpipe)（例如，Zod 模式）验证负载。以相同的方式配置其 `exceptionFactory` 选项，以便验证错误作为 `RpcException` 抛出：

```typescript
@UsePipes(new StandardSchemaValidationPipe({ exceptionFactory: (issues) => new RpcException(issues) }))
@MessagePattern({ cmd: 'sum' })
accumulate(@Payload({ schema: z.array(z.number()) }) data: number[]): number {
  return data.reduce((a, b) => a + b, 0);
}

```

> info **提示** 在主 HTTP 应用程序上注册的全局管道不会应用于连接到 [hybrid application](/faq/hybrid-application) 的微服务，除非你设置 `inheritAppConfig` 选项。参见 [sharing configuration](/faq/hybrid-application#共享配置)。