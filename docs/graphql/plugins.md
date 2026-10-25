<!-- 此文件从 content/graphql/plugins.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-03T11:02:16.906Z -->
<!-- 源文件: content/graphql/plugins.md -->

### 使用 Apollo 的插件

插件使您能够通过响应特定事件执行自定义操作来扩展 Apollo Server 的核心功能。目前，这些事件对应于 GraphQL 请求生命周期的各个阶段，以及 Apollo Server 本身的启动（了解更多 [here](https://www.apollographql.com/docs/apollo-server/integrations/plugins/)）。例如，一个基本的日志记录插件可能会记录发送到 Apollo Server 的每个请求关联的 GraphQL 查询字符串。

#### 自定义插件

要创建插件，请声明一个使用从 `@nestjs/apollo` 包导出的 `@Plugin` 装饰器注释的类。此外，为了更好的代码自动补全，请实现来自 `@apollo/server` 包的 `ApolloServerPlugin` 接口。

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

有了这个，我们可以将 `LoggingPlugin` 注册为提供者。

```typescript
@Module({
  providers: [LoggingPlugin],
})
export class CommonModule {}

```

Nest 将自动实例化插件并将其应用到 Apollo Server。

#### 使用外部插件

有几个开箱即用的插件。要使用现有的插件，只需导入它并将其添加到 `plugins` 数组中：

```typescript
GraphQLModule.forRoot({
  // ...
  plugins: [ApolloServerOperationRegistry({ /* options */})]
}),

```

> info **提示** `ApolloServerOperationRegistry` 插件从 `@apollo/server-plugin-operation-registry` 包导出。

#### 使用 Mercurius 的插件

一些现有的 mercurius 特定的 Fastify 插件必须在插件树上的 mercurius 插件之后加载（了解更多 [here](https://mercurius.dev/#/docs/plugins)）。

> warning **警告** [mercurius-upload](https://github.com/mercurius-js/mercurius-upload) 是一个例外，应在主文件中注册。

为此，`MercuriusDriver` 暴露了一个可选的 `plugins` 配置选项。它表示一个对象数组，每个对象包含两个属性：`plugin` 及其 `options`。因此，注册 [cache plugin](https://github.com/mercurius-js/cache) 将如下所示：

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