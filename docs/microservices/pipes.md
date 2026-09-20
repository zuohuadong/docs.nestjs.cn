<!-- 此文件从 content/microservices/pipes.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T09:56:37.599Z -->
<!-- 源文件: content/microservices/pipes.md -->
<!-- 源哈希: 705c977429c4b661c5c002efeefc8564 -->

### 管道

[regular pipes](/pipes) 与微服务管道之间没有根本区别。唯一的区别是，您应该使用 `RpcException` 而不是抛出 `HttpException`。

> info **提示** `RpcException` 类从 `@nestjs/microservices` 包中暴露。

#### 绑定管道

以下示例使用手动实例化的方法作用域管道。与基于 HTTP 的应用程序一样，您也可以使用控制器作用域的管道（即，在控制器类前加上 `@UsePipes()` 装饰器）。

```typescript
@UsePipes(new ValidationPipe({ exceptionFactory: (errors) => new RpcException(errors) }))
@MessagePattern({ cmd: 'sum' })
accumulate(data: number[]): number {
  return (data || []).reduce((a, b) => a + b);
}

```