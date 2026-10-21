<!-- 此文件从 content/application-context.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T07:38:02.074Z -->
<!-- 源文件: content/application-context.md -->
<!-- 源哈希: c0a1f9ecce198b8129a58271b4ced54b -->

### 独立应用程序

有几种方式可以挂载一个 Nest 应用程序。你可以创建一个 Web 应用、一个微服务，或者一个裸的 Nest **独立应用程序**（不包含任何网络监听器）。独立应用程序是 Nest **IoC 容器**的一层封装，该容器持有所有已实例化的类。通过独立应用程序对象，你可以从任何已导入的模块中获取任意现有实例的引用。这让你能够在任何地方利用 Nest 框架，包括脚本化的 **CRON** 任务。你甚至可以在其之上构建一个 **CLI**。

#### 快速上手

要创建一个 Nest 独立应用程序，请使用以下构造方式：

```typescript
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  // your application logic here ...
}
await bootstrap();

```

#### 从静态模块中获取提供者

独立应用程序对象让你能够获取在 Nest 应用程序中注册的任意实例的引用。假设有一个 `TasksService` 提供者位于 `TasksModule` 中，而该模块又被 `AppModule` 导入。该类提供了一组你希望在 CRON 任务中调用的方法。

```typescript
const tasksService = app.get(TasksService);

```

要访问 `TasksService` 实例，请使用 `get()` 方法。它的作用类似于一次**查询**，会在每个已注册的模块中搜索实例，并接受任意提供者的令牌。若要进行严格的上下文检查，请传入一个带有 `strict: true` 属性的选项对象。启用该选项后，你必须导航到特定的模块，才能从所选上下文中获取实例。

```typescript
const tasksService = app.select(TasksModule).get(TasksService, { strict: true });

```

下表总结了可用于从独立应用程序对象中获取实例引用的方法。

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
      在模块图中导航，以提取所选模块的特定实例（与上文所述的严格模式配合使用）。
    </td>
  </tr>
</table>

> info **提示** 在非严格模式下，默认选择根模块。要选择任何其他模块，请手动逐步导航模块图。

独立应用程序没有任何网络监听器，因此与请求处理相关的 Nest 特性（例如中间件、拦截器、管道和守卫）在此上下文中不可用。

例如，即使你在应用程序中注册了一个全局拦截器，然后使用 `app.get()` 方法获取了一个控制器实例，当你调用该控制器的方法时，拦截器也不会被执行。

#### 从动态模块中获取提供者

在使用 [dynamic modules](/fundamentals/dynamic-modules) 时，请向 `app.select()` 传入与应用程序中已注册动态模块相同的对象。例如：

```typescript
export const dynamicConfigModule = ConfigModule.register({ folder: './config' });

@Module({
  imports: [dynamicConfigModule],
})
export class AppModule {}

```

之后你可以再选择该模块：

```typescript
const configService = app.select(dynamicConfigModule).get(ConfigService, { strict: true });

```

#### 终止阶段

如果你希望 Node.js 进程在脚本执行完毕后退出（例如，对于运行 CRON 任务的脚本），请在 `bootstrap()` 函数的末尾调用 `app.close()` 方法：

```typescript
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  // application logic...
  await app.close();
}
await bootstrap();

```

如 [lifecycle events](/fundamentals/lifecycle-events) 章节所述，调用 `app.close()` 会触发关闭生命周期钩子。

#### 示例

GitHub 上的 [standalone application sample](https://github.com/nestjs/nest/tree/master/sample/18-context) 中提供了一个可运行的示例。