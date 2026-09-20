<!-- 此文件从 content/fundamentals/lifecycle-events.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:22:26.449Z -->
<!-- 源文件: content/fundamentals/lifecycle-events.md -->
<!-- 源哈希: fdac3a0300f0b62edbe7dbbb2247f904 -->

### 生命周期事件

Nest 应用程序以及每个应用程序元素都有一个由 Nest 管理的生命周期。Nest 提供了**生命周期钩子**，使您能够了解关键生命周期事件，并在这些事件发生时执行操作（在您的模块、提供者或控制器上运行注册的代码）。

#### 生命周期顺序

下图描绘了从应用程序启动到 Node 进程退出期间的关键应用程序生命周期事件序列。我们可以将整个生命周期分为三个阶段：**初始化**、**运行**和**终止**。利用此生命周期，您可以规划模块和服务的适当初始化，管理活动连接，并在收到终止信号时优雅地关闭应用程序。

<figure><img class="illustrative-image" src="/assets/lifecycle-events.png" /></figure>

#### 生命周期事件

生命周期事件发生在应用程序启动和关闭期间。Nest 在以下每个生命周期事件中调用模块、提供者和控制器上注册的生命周期钩子方法（**关闭钩子**需要先启用，如 [below](/fundamentals/lifecycle-events#application-shutdown) 所述）。如上图所示，Nest 还会调用适当的底层方法来开始监听连接和停止监听连接。

在下表中，`onModuleInit` 和 `onApplicationBootstrap` 仅在您显式调用 `app.init()` 或 `app.listen()` 时触发。

在下表中，`onModuleDestroy`、`beforeApplicationShutdown` 和 `onApplicationShutdown` 仅在您显式调用 `app.close()` 或进程收到特殊系统信号（如 SIGTERM）并且您在应用程序启动时正确调用了 `enableShutdownHooks`（参见下文**应用程序关闭**部分）时触发。

| 生命周期钩子方法 | 触发钩子方法调用的生命周期事件 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onModuleInit()`                | 一旦宿主模块的依赖项被解析后调用。 |
| `onApplicationBootstrap()`      | 一旦所有模块初始化完成后调用，但在监听连接之前。 |
| `onModuleDestroy()`\*           | 在收到终止信号（例如 `SIGTERM`）后调用。 |
| `beforeApplicationShutdown()`\* | 在所有 `onModuleDestroy()` 处理器完成（Promise 已解决或拒绝）后调用；<br />一旦完成（Promise 已解决或拒绝），所有现有连接将被关闭（调用 `app.close()`）。 |
| `onApplicationShutdown()`\*     | 在连接关闭后调用（`app.close()` 解决）。 |

\* 对于这些事件，如果您没有显式调用 `app.close()`，您必须选择启用它们以使其与系统信号（如 `SIGTERM`）配合使用。请参阅下面的 [Application shutdown](fundamentals/lifecycle-events#application-shutdown)。

> warning **警告** 上述生命周期钩子不会为**请求作用域**类触发。请求作用域类与应用程序生命周期无关，其生命周期不可预测。它们仅为每个请求创建，并在响应发送后自动进行垃圾回收。

> info **提示** `onModuleInit()` 和 `onApplicationBootstrap()` 的执行顺序直接取决于模块导入的顺序，并等待前一个钩子完成。

#### 使用

每个生命周期钩子都由一个接口表示。从技术上讲，接口是可选的，因为它们在 TypeScript 编译后不存在。尽管如此，使用它们以受益于强类型和编辑器工具是一种好的做法。要注册生命周期钩子，请实现相应的接口。例如，要在特定类（例如控制器、提供者或模块）的模块初始化期间注册要调用的方法，请通过提供 `onModuleInit()` 方法来实现 `OnModuleInit` 接口，如下所示：

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

`OnModuleInit` 和 `OnApplicationBootstrap` 钩子都允许您延迟应用程序初始化过程（返回 `Promise` 或将方法标记为 `async` 并在方法体中 `await` 异步方法完成）。

```typescript
async onModuleInit(): Promise<void> {
  await this.fetch();
}

```

#### 应用程序关闭

`onModuleDestroy()`、`beforeApplicationShutdown()` 和 `onApplicationShutdown()` 钩子在终止阶段被调用（响应显式调用 `app.close()` 或收到系统信号（如 SIGTERM，如果选择启用））。此功能通常与 [Kubernetes](https://kubernetes.io/) 一起使用来管理容器的生命周期，通过 [Heroku](https://www.heroku.com/) 用于 dynos 或类似服务。

关闭钩子监听器会消耗系统资源，因此默认情况下它们是禁用的。要使用关闭钩子，您**必须通过调用 `enableShutdownHooks()` 启用监听器**：

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

> warning **警告** 由于固有的平台限制，NestJS 在 Windows 上对应用程序关闭钩子的支持有限。您可以预期 `SIGINT` 能够工作，以及 `SIGBREAK` 和在一定程度上 `SIGHUP` - [read more](https://nodejs.org/api/process.html#process_signal_events)。但是 `SIGTERM` 在 Windows 上永远不会工作，因为在任务管理器中杀死进程是无条件的，“即应用程序无法检测或阻止它”。这里有一些来自 libuv 的 [relevant documentation](https://docs.libuv.org/en/v1.x/signal.html)，以了解更多关于 `SIGINT`、`SIGBREAK` 和其他在 Windows 上如何处理的信息。另请参阅 Node.js 文档中的 [Process Signal Events](https://nodejs.org/api/process.html#process_signal_events)

> info **信息** `enableShutdownHooks` 通过启动监听器消耗内存。在单个 Node 进程中运行多个 Nest 应用程序（例如，在并行测试运行期间）的情况下，Node 可能会抱怨监听器进程过多。因此，`enableShutdownHooks` 默认不启用。在单个 Node 进程中运行多个实例时，请注意此情况。

当应用程序收到终止信号时，它将调用任何已注册的 `onModuleDestroy()`、`beforeApplicationShutdown()`，然后调用 `onApplicationShutdown()` 方法（按照上述顺序），并将相应的信号作为第一个参数。如果注册的函数等待异步调用（返回 Promise），Nest 将不会继续执行序列，直到 Promise 被解决或拒绝。

```typescript
@Injectable()
class UsersService implements OnApplicationShutdown {
  onApplicationShutdown(signal: string) {
    console.log(signal); // e.g. "SIGINT"
  }
}

```

> info **信息** 调用 `app.close()` 不会终止 Node 进程，而只会触发 `onModuleDestroy()` 和 `onApplicationShutdown()` 钩子，因此如果存在一些间隔、长时间运行的后台任务等，进程将不会自动终止。