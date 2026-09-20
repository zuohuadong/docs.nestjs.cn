<!-- 此文件从 content/microservices/interceptors.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:05:25.520Z -->
<!-- 源文件: content/microservices/interceptors.md -->
<!-- 源哈希: a12ccc9da50ca5157375179dedba7a7f -->

### 拦截器

[regular interceptors](/overview/interceptors) 与微服务拦截器之间没有区别。以下示例使用了一个手动实例化的方法作用域拦截器。与基于 HTTP 的应用程序一样，您也可以使用控制器作用域的拦截器（即，在控制器类前加上 `@UseInterceptors()` 装饰器）。

```typescript
@UseInterceptors(new TransformInterceptor())
@MessagePattern({ cmd: 'sum' })
accumulate(data: number[]): number {
  return (data || []).reduce((a, b) => a + b);
}

```