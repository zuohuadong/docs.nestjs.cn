<!-- 此文件从 content/microservices/interceptors.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T09:26:02.945Z -->
<!-- 源文件: content/microservices/interceptors.md -->
<!-- 源哈希: 1f77db86bba9c7a8407cf995c8a33ebb -->

### 拦截器

微服务拦截器的工作方式与 [regular interceptors](/overview/interceptors) 相同。以下示例使用手动实例化的方法作用域拦截器。与基于 HTTP 的应用程序一样，你也可以使用控制器作用域的拦截器（即，在控制器类前加上 `@UseInterceptors()` 装饰器）。

```typescript
@UseInterceptors(new TransformInterceptor())
@MessagePattern({ cmd: 'sum' })
accumulate(data: number[]): number {
  return (data || []).reduce((a, b) => a + b);
}

```

> info **提示** 在主 HTTP 应用程序上注册的全局拦截器不会应用于连接到 [hybrid application](/faq/hybrid-application) 的微服务，除非你设置 `inheritAppConfig` 选项。请参阅 [sharing configuration](/faq/hybrid-application#共享配置)。