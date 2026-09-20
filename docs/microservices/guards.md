<!-- 此文件从 content/microservices/guards.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:05:55.582Z -->
<!-- 源文件: content/microservices/guards.md -->
<!-- 源哈希: 95324a980eac2465bfc627c4ccb30dd8 -->

### 守卫

微服务守卫与 [regular HTTP application guards](/overview/guards) 之间没有根本区别。唯一的区别是，你应该使用 `RpcException` 而不是抛出 `HttpException`。

> info **提示** `RpcException` 类从 `@nestjs/microservices` 包中暴露。

#### 绑定守卫

以下示例使用方法作用域的守卫。与基于 HTTP 的应用程序一样，你也可以使用控制器作用域的守卫（即，在控制器类前加上 `@UseGuards()` 装饰器）。

```typescript
@UseGuards(AuthGuard)
@MessagePattern({ cmd: 'sum' })
accumulate(data: number[]): number {
  return (data || []).reduce((a, b) => a + b);
}

```