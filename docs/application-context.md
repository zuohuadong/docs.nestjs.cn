<!-- 此文件从 content/application-context.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T07:17:02.081Z -->
<!-- 源文件: content/application-context.md -->
<!-- 源哈希: 15f284bdd07a7ef27f9e6498709568f4 -->

### 独立应用程序

挂载 Nest 应用程序有几种方式。你可以创建 Web 应用、微服务，或者仅仅是一个纯粹的 Nest **独立应用程序**（没有任何网络监听器）。Nest 独立应用程序是 Nest **IoC 容器**的包装器，它持有所有已实例化的类。我们可以通过独立应用程序对象，直接从任何导入的模块中获取任何现有实例的引用。因此，你可以在任何地方利用 Nest 框架，例如，包括脚本化的 **CRON** 任务。你甚至可以在其之上构建 **CLI**。

#### 入门

要创建 Nest 独立应用程序，请使用以下构造：

```typescript
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  // your application logic here ...
}
await bootstrap();

```

#### 从静态模块中检索提供者

独立应用程序对象允许你获取 Nest 应用程序中注册的任何实例的引用。假设我们在 `TasksModule` 模块中有一个 `TasksService` 提供者，该模块被我们的 `AppModule` 模块导入。这个类提供了一组我们想要从 CRON 任务中调用的方法。

```typescript
const tasksService = app.get(TasksService);

```

要访问 `TasksService` 实例，我们使用 `get()` 方法。`get()` 方法就像一个**查询**，在每个已注册的模块中搜索实例。你可以向它传递任何提供者的令牌。或者，为了进行严格的上下文检查，可以传递一个带有 `strict: true` 属性的选项对象。当此选项生效时，你需要遍历特定的模块，才能从所选上下文中获取特定的实例。

```typescript
const tasksService = app.select(TasksModule).get(TasksService, { strict: true });

```

以下是可用于从独立应用程序对象获取实例引用的方法摘要。

<table>
  <tr>
    <td>
      <code>get()</code>
    </td>
    <td>
      获取应用程序上下文中可用的控制器或提供者（包括守卫、过滤器等）的实例。
    </td>
  </tr>
  <tr>
    <td>
      <code>select()</code>
    </td>
    <td>
      遍历模块图以提取所选模块的特定实例（与上述严格模式一起使用）。
    </td>
  </tr>
</table>

> info **提示** 在非严格模式下，默认选择根模块。要选择任何其他模块，你需要手动逐步遍历模块图。

请记住，独立应用程序没有任何网络监听器，因此与 HTTP 相关的任何 Nest 功能（例如，中间件、拦截器、管道、守卫等）在此上下文中不可用。

例如，即使你在应用程序中注册了全局拦截器，然后使用 `app.get()` 方法获取控制器的实例，拦截器也不会被执行。

#### 从动态模块中检索提供者

在处理 [dynamic modules](/fundamentals/dynamic-modules) 时，我们应该将表示应用程序中已注册动态模块的相同对象提供给 `app.select`。例如：

```typescript
export const dynamicConfigModule = ConfigModule.register({ folder: './config' });

@Module({
  imports: [dynamicConfigModule],
})
export class AppModule {}

```

然后你可以稍后选择该模块：

```typescript
const configService = app.select(dynamicConfigModule).get(ConfigService, { strict: true });

```

#### 终止阶段

如果你希望 Node 应用程序在脚本完成后关闭（例如，对于运行 CRON 任务的脚本），你必须在 `bootstrap` 函数的末尾调用 `app.close()` 方法，如下所示：

```typescript
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  // application logic...
  await app.close();
}
await bootstrap();

```

正如 [Lifecycle events](/fundamentals/lifecycle-events) 章节中提到的，这将触发生命周期钩子。

#### 示例

一个可用的工作示例位于 [here](https://github.com/nestjs/nest/tree/master/sample/18-context)。