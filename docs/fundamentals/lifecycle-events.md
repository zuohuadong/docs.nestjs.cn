<!-- 此文件从 content/fundamentals/lifecycle-events.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:34:00.290Z -->
<!-- 源文件: content/fundamentals/lifecycle-events.md -->
<!-- 源哈希: a74d8e51965b01d89a2488185e713068 -->

### 生命周期事件

Nest 应用程序以及每个应用程序元素都有由 Nest 管理的生命周期。Nest 提供了**生命周期钩子**，使您了解关键的生命周期事件，并在它们发生时采取行动（在模块、提供者或控制器上运行已注册的代码）。

#### 生命周期顺序

下图描绘了关键应用程序生命周期事件的顺序，从应用程序启动到 Node.js 进程退出。整体生命周期分为三个阶段：**初始化**、**运行**和**终止**。了解此生命周期，您可以规划模块和服务适当的初始化，管理活动连接，并在接收到终止信号时优雅地关闭应用程序。

<figure><img class="illustrative-image" src="/assets/lifecycle-events.png" /></figure>

#### 生命周期事件

生命周期事件发生在应用程序启动和关闭期间。在以下每个生命周期事件中，Nest 会在模块、提供者和控制器上调用已注册的生命周期钩子方法（必须先启用**关闭钩子**，如 [Application shutdown](/fundamentals/lifecycle-events#application-shutdown) 所述）。如上图所示，Nest 还会调用适当的底层方法来开始和停止监听连接。

在下表中，`onModuleInit()` 和 `onApplicationBootstrap()` 仅在应用程序初始化时触发：当您显式调用 `app.init()` 或 `app.listen()` 时，或者当您使用 `NestFactory.createApplicationContext()` 创建独立应用程序时（它会自动为您初始化）。

`onModuleDestroy()`、`beforeApplicationShutdown()` 和 `onApplicationShutdown()` 钩子仅在您显式调用 `app.close()` 时，或者当进程接收到系统信号（例如 `SIGTERM`）并且您在应用程序启动时调用了 `enableShutdownHooks()` 时触发（参见下文 [Application shutdown](/fundamentals/lifecycle-events#application-shutdown)）。

| 生命周期钩子方法 | 触发钩子方法调用的生命周期事件 |
| :--- | :--- |
| `onModuleInit()` | 主模块的依赖项解析完成后调用一次。 |
| `onApplicationBootstrap()` | 所有模块初始化完成后，但在监听连接之前调用。 |
| `onModuleDestroy()`\* | 接收到终止信号（例如 `SIGTERM`）后调用。 |
| `beforeApplicationShutdown()`\* | 所有 `onModuleDestroy()` 处理程序完成后调用（Promise 已解析或拒绝）；<br />完成后（Promise 已解析或拒绝），所有现有连接将被关闭（调用 `app.close()`）。 |
| `onApplicationShutdown()`\* | 连接关闭后调用，作为 `app.close()` 的最后一步。 |

\* 对于这些事件，如果您没有显式调用 `app.close()`，则必须选择加入才能使其与系统信号（如 `SIGTERM`）一起工作。参见下文 [Application shutdown](/fundamentals/lifecycle-events#application-shutdown)。

> info **提示** 具有 `gracefulShutdown` 选项的微服务传输器（参见 [TCP](/microservices/basics#入门)、[Redis](/microservices/redis#选项)、[NATS](/microservices/nats#选项)、[MQTT](/microservices/mqtt#选项)、[RabbitMQ](/microservices/rabbitmq#选项) 和 [gRPC](/microservices/grpc#选项)）允许正在处理的请求和事件在调用 `onApplicationShutdown()` 之前完成。

> warning **警告** 上述生命周期钩子不会为**请求作用域**类触发。请求作用域类不与应用程序生命周期绑定，其生命周期是不可预测的。它们仅为每个请求创建，并在响应发送后被垃圾回收。

> info **提示** Nest 按照每个模块在导入图中的距离根模块的顺序（从最深层导入的模块（和全局模块）到根模块）逐个模块调用 `onModuleInit()` 和 `onApplicationBootstrap()`：最深层导入的模块（和全局模块）先执行，根模块后执行。在 Nest 移动到下一个模块之前，会等待每个模块的钩子完成。关闭钩子按相反的顺序运行。

#### 用法

每个生命周期钩子都由一个接口表示。从技术上讲，接口是可选的，因为它们在 TypeScript 编译后不存在。尽管如此，使用它们是良好实践，可以受益于强类型和编辑器工具。要注册生命周期钩子，请实现相应的接口。例如，要注册一个在特定类（例如控制器、提供者或模块）的模块初始化期间调用的方法，请通过提供一个 `onModuleInit()` 方法来实现 `OnModuleInit` 接口：

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';

@Injectable()
export class UsersService implements OnModuleInit {
  onModuleInit() {
    console.log(`The module has been initialized.`);
  }
}

```

#### 异步初始化

`OnModuleInit` 和 `OnApplicationBootstrap` 钩子都允许您延迟应用程序初始化过程。返回一个 `Promise`，或者将方法标记为 `async`，并在方法体中 `await` 异步操作的完成。

```typescript
async onModuleInit(): Promise<void> {
  await this.fetch();
}

```

#### 应用关闭

`onModuleDestroy()`、`beforeApplicationShutdown()` 和 `onApplicationShutdown()` 钩子在终止阶段被调用，响应对 `app.close()` 的显式调用，或者在选择启用时，在接收到诸如 `SIGTERM` 等系统信号时被调用。此功能常与 [Kubernetes](https://kubernetes.io/)、[Heroku](https://www.heroku.com/) dynos 以及类似服务一起使用，用于管理容器生命周期。

关闭钩子监听器会消耗系统资源，因此默认禁用。要使用关闭钩子，**必须通过调用 `enableShutdownHooks()` 启用监听器**：

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Starts listening for shutdown hooks
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

> warning **警告** 由于固有的平台限制，NestJS 在 Windows 上对应用关闭钩子的支持有限。您可以预期 `SIGINT` 可用，以及 `SIGBREAK` 和在一定程度上 `SIGHUP`。然而，`SIGTERM` 在 Windows 上永远无效，因为在任务管理器中终止进程是无条件的（应用程序无法检测或阻止它）。要了解在 Windows 上如何处理 `SIGINT`、`SIGBREAK` 和其他信号，请参阅 [libuv signal handling documentation](https://docs.libuv.org/en/v1.x/signal.html) 和 Node.js 上的 [signal events](https://nodejs.org/api/process.html#process_signal_events) 文档。

> info **提示** `enableShutdownHooks()` 通过启动监听器会消耗内存。当在单个 Node.js 进程中运行多个 Nest 应用时（例如在并行测试运行时），Node.js 可能会警告监听器过多。因此，关闭钩子默认未启用。在单个 Node.js 进程中运行多个实例时请注意这一点。

当应用接收到终止信号时，它会按顺序调用任何已注册的 `onModuleDestroy()`、`beforeApplicationShutdown()` 和 `onApplicationShutdown()` 方法。`beforeApplicationShutdown()` 和 `onApplicationShutdown()` 将接收相应的信号作为第一个参数（`onModuleDestroy()` 不接受参数）。如果已注册的方法返回一个 promise，Nest 不会在 promise 解析或被拒绝之前继续序列。

```typescript
@Injectable()
class UsersService implements OnApplicationShutdown {
  onApplicationShutdown(signal: string) {
    console.log(signal); // e.g., "SIGINT"
  }
}

```

> info **提示** 调用 `app.close()` 不会终止 Node.js 进程。它只会运行关闭序列（`onModuleDestroy()`、`beforeApplicationShutdown()` 和 `onApplicationShutdown()` 钩子，以及关闭底层服务器）。如果存在活动的间隔、长时间运行的后台任务等，进程不会自行退出。