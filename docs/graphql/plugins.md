<!-- 此文件从 content/graphql/plugins.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T10:01:21.458Z -->
<!-- 源文件: content/graphql/plugins.md -->
<!-- 源哈希: 6127d1e891d1f12c340a14a46d7210c8 -->

### 使用 Apollo 的插件

插件允许你通过响应特定事件执行自定义操作来扩展 Apollo Server 的核心功能。这些事件对应于 GraphQL 请求生命周期的各个阶段，以及 Apollo Server 自身的启动过程（参见 Apollo 文档中的 [plugins](https://www.apollographql.com/docs/apollo-server/integrations/plugins/)）。例如，一个基础的日志插件可以记录发送到 Apollo Server 的每个请求的 GraphQL 查询字符串。

#### 自定义插件

要创建插件，请声明一个使用 `@Plugin()` 装饰器标注的类，该装饰器从 `@nestjs/apollo` 包中导出。为了获得更好的代码自动补全，还应实现来自 `@apollo/server` 包的 `ApolloServerPlugin` 接口。

```typescript
import { ApolloServerPlugin, GraphQLRequestListener } from '@apollo/server';
import { Plugin } from '@nestjs/apollo';

@Plugin()
export class LoggingPlugin implements ApolloServerPlugin {
  async requestDidStart(): Promise<GraphQLRequestListener<any>> {
    console.log('Request started');
    return {
      async willSendResponse() {
        console.log('Will send response');
      },
    };
  }
}

```

完成上述操作后，将 `LoggingPlugin` 注册为提供者：

```typescript
@Module({
  providers: [LoggingPlugin],
})
export class CommonModule {}

```

Nest 会自动实例化该插件并将其应用到 Apollo Server。

#### 使用外部插件

Apollo Server 开箱即用地提供了若干插件。要使用现有插件，请导入它并将其添加到 `plugins` 数组中：

```typescript
import { ApolloServerPluginCacheControl } from '@apollo/server/plugin/cacheControl';

GraphQLModule.forRoot({
  // ...
  plugins: [ApolloServerPluginCacheControl({ defaultMaxAge: 5 })],
}),

```

> info **提示** `ApolloServerPluginCacheControl` 插件从 `@apollo/server` 包的 `@apollo/server/plugin/cacheControl` 入口点导出。

#### 使用 Mercurius 的插件

一些现有的 Mercurius 专用 Fastify 插件必须在插件树中于 Mercurius 插件之后加载（参见 Mercurius 文档中的 [plugins](https://mercurius.dev/#/docs/plugins)）。

> warning **警告** [mercurius-upload](https://github.com/mercurius-js/mercurius-upload) 是一个例外：请在主文件中注册它。

为此，`MercuriusDriver` 暴露了一个可选的 `plugins` 配置选项。它接收一个对象数组，每个对象包含两个属性：`plugin` 及其 `options`。例如，注册 [cache plugin](https://github.com/mercurius-js/cache) 如下所示：

```typescript
GraphQLModule.forRoot({
  driver: MercuriusDriver,
  // ...
  plugins: [
    {
      plugin: cache,
      options: {
        ttl: 10,
        policy: {
          Query: {
            add: true
          }
        }
      },
    }
  ]
}),

```