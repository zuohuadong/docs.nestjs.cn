<!-- 此文件从 content/fundamentals/async-components.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:35:20.158Z -->
<!-- 源文件: content/fundamentals/async-components.md -->
<!-- 源哈希: b173f26e19b57a1fade8eef13e1ffb8e -->

### 异步提供者

有时，应用程序的启动应延迟，直到一个或多个**异步任务**完成。例如，在数据库连接建立之前，您可能不希望开始接受请求。异步提供者允许您实现这一点。

要创建一个异步提供者，请使用 `async/await` 和 `useFactory` 语法。工厂返回一个 `Promise`，并且工厂函数可以 `await` 异步任务。Nest 在实例化依赖于（注入）此类提供者的任何类之前，会等待 Promise 的解析。

```typescript
{
  provide: 'ASYNC_CONNECTION',
  useFactory: async () => {
    const connection = await createConnection(options);
    return connection;
  },
}

```

> info **提示** 在 [custom providers](/fundamentals/dependency-injection) 章了解有关自定义提供者语法的更多信息。

#### 注入

异步提供者通过其令牌注入到其他组件中，就像任何其他提供者一样。在上面的示例中，您将使用 `@Inject('ASYNC_CONNECTION')`。