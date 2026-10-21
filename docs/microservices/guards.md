<!-- 此文件从 content/microservices/guards.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T09:29:12.253Z -->
<!-- 源文件: content/microservices/guards.md -->
<!-- 源哈希: 43b71691271ece80469c034b57adaa82 -->

### 守卫

微服务守卫的工作方式与 [regular HTTP application guards](/overview/guards) 相同。唯一的区别是它们应该抛出 `RpcException` 而不是 `HttpException`。当守卫返回 `false` 时，Nest 会抛出带有 `Forbidden resource` 消息的 `RpcException`。

> info **提示** `RpcException` 类从 `@nestjs/microservices` 包中导出。

#### 绑定守卫

以下示例使用了方法作用域的守卫。与基于 HTTP 的应用程序一样，你也可以使用控制器作用域的守卫（即，在控制器类前加上 `@UseGuards()` 装饰器）。

```typescript
@UseGuards(AuthGuard)
@MessagePattern({ cmd: 'sum' })
accumulate(data: number[]): number {
  return (data || []).reduce((a, b) => a + b);
}

```

> info **提示** 在主 HTTP 应用程序上注册的全局守卫不会应用于连接到 [hybrid application](/faq/hybrid-application) 的微服务，除非你设置 `inheritAppConfig` 选项。参见 [sharing configuration](/faq/hybrid-application#共享配置)。