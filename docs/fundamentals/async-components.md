<!-- 此文件从 content/fundamentals/async-components.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:13:52.506Z -->
<!-- 源文件: content/fundamentals/async-components.md -->
<!-- 源哈希: 2b0d03af49d50f9aa2db345fc4dc7727 -->

### 异步提供者

有时，应用程序的启动应延迟到一个或多个**异步任务**完成之后。例如，在数据库连接建立之前，您可能不希望开始接受请求。您可以使用异步提供者来实现这一点。

其语法是使用 `async/await` 配合 `useFactory` 语法。工厂返回一个 `Promise`，工厂函数可以 `await` 异步任务。Nest 会在实例化任何依赖（注入）此类提供者的类之前，等待 promise 解析完成。

```typescript
{
  provide: 'ASYNC_CONNECTION',
  useFactory: async () => {
    const connection = await createConnection(options);
    return connection;
  },
}

```

> info **提示** 了解更多关于自定义提供者语法的信息 [here](/fundamentals/dependency-injection)。

#### 注入

异步提供者与其他提供者一样，通过其令牌注入到其他组件中。在上面的示例中，您将使用构造 `@Inject('ASYNC_CONNECTION')`。