<!-- 此文件从 content/techniques/queues.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T09:28:02.344Z -->
<!-- 源文件: content/techniques/queues.md -->
<!-- 源哈希: c53c2f8607c60308f6b54958b8999369 -->

### 队列

队列是一种强大的设计模式，可帮助您应对常见的应用程序扩展和性能挑战。队列可以帮助您解决的一些问题示例包括：

- 平滑处理峰值。例如，如果用户可以在任意时间发起资源密集型任务，您可以将这些任务添加到队列中，而不是同步执行。然后，您可以让工作进程以受控方式从队列中拉取任务。随着应用程序的扩展，您可以轻松添加新的队列消费者来扩展后端任务处理。
- 拆分可能阻塞 Node.js 事件循环的单一任务。例如，如果用户请求需要 CPU 密集型工作（如音频转码），您可以将此任务委托给其他进程，从而释放面向用户的进程以保持响应。
- 在各种服务之间提供可靠的通信渠道。例如，您可以在一个进程或服务中排队任务（作业），并在另一个进程或服务中消费它们。您可以从任何进程或服务监听状态事件，在作业生命周期中完成、出错或其他状态变化时收到通知。当队列生产者或消费者失败时，其状态会被保留，节点重启时任务处理可以自动重新开始。

Nest 提供了 `@nestjs/bullmq` 包用于 BullMQ 集成，以及 `@nestjs/bull` 包用于 Bull 集成。这两个包都是各自库之上的抽象/包装，由同一团队开发。Bull 目前处于维护模式，团队专注于修复错误，而 BullMQ 正在积极开发中，具有现代 TypeScript 实现和不同的功能集。如果 Bull 满足您的需求，它仍然是一个可靠且经过实战检验的选择。Nest 包使您能够轻松地将 BullMQ 或 Bull 队列集成到您的 Nest 应用程序中。

BullMQ 和 Bull 都使用 [Redis](https://redis.io/) 来持久化作业数据，因此您需要在系统上安装 Redis。由于它们基于 Redis，您的队列架构可以完全分布式且与平台无关。例如，您可以在一个（或多个）节点上的 Nest 中运行一些队列 <a href="techniques/queues#生产者">producers</a>、<a href="techniques/queues#消费者">consumers</a> 和 <a href="techniques/queues#事件监听器">listeners</a>，并在其他网络节点上的其他 Node.js 平台上运行其他生产者、消费者和监听器。

本章涵盖 `@nestjs/bullmq` 和 `@nestjs/bull` 包。我们还建议阅读 [BullMQ](https://docs.bullmq.io/) 和 [Bull](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md) 文档以获取更多背景和具体实现细节。

#### BullMQ 安装

要开始使用 BullMQ，我们首先安装所需的依赖。

```bash
$ npm install --save @nestjs/bullmq bullmq

```

安装过程完成后，我们可以将 `BullModule` 导入根 `AppModule`。

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: 'localhost',
        port: 6379,
      },
    }),
  ],
})
export class AppModule {}

```

`forRoot()` 方法用于注册一个 `bullmq` 包配置对象，该对象将用于应用程序中注册的所有队列（除非另有指定）。供您参考，以下是配置对象中的一些属性：

- `connection: ConnectionOptions` - 配置 Redis 连接的选项。有关更多信息，请参阅 [Connections](https://docs.bullmq.io/guide/connections)。可选。
- `prefix: string` - 所有队列键的前缀。可选。
- `defaultJobOptions: JobOpts` - 控制新作业默认设置的选项。有关更多信息，请参阅 [JobOpts](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queueadd)。可选。
- `settings: AdvancedSettings` - 高级队列配置设置。通常不应更改这些设置。有关更多信息，请参阅 [AdvancedSettings](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queue)。可选。
- `extraOptions` - 模块初始化的额外选项。请参阅 [Manual Registration](/techniques/queues#manual-registration)

所有选项都是可选的，提供对队列行为的详细控制。这些选项直接传递给 BullMQ `Queue` 构造函数。有关这些选项和其他选项的更多信息，请参阅 [here](https://docs.bullmq.io/api/interfaces/v6.QueueOptions.html)。

要注册队列，请导入 `BullModule.registerQueue()` 动态模块，如下所示：

```typescript
BullModule.registerQueue({
  name: 'audio',
});

```

> info **提示** 通过向 `registerQueue()` 方法传递多个逗号分隔的配置对象来创建多个队列。

`registerQueue()` 方法用于实例化和/或注册队列。队列在连接到同一底层 Redis 数据库且使用相同凭据的模块和进程之间共享。每个队列通过其 name 属性唯一标识。队列名称既用作注入令牌（用于将队列注入控制器/提供者），也用作装饰器的参数，以将消费者类和监听器与队列关联。

您还可以覆盖特定队列的一些预配置选项，如下所示：

```typescript
BullModule.registerQueue({
  name: 'audio',
  connection: {
    port: 6380,
  },
});

```

BullMQ 还支持作业之间的父子关系。此功能允许创建流程，其中作业是任意深度树的节点。要了解更多信息，请查看 [here](https://docs.bullmq.io/guide/flows)。

要添加流程，您可以执行以下操作：

```typescript
BullModule.registerFlowProducer({
  name: 'flowProducerName',
});

```

由于作业持久化在 Redis 中，每次实例化特定命名的队列时（例如，当应用程序启动/重启时），它都会尝试处理可能来自先前未完成会话的任何旧作业。

每个队列可以有一个或多个生产者、消费者和监听器。消费者按特定顺序从队列中检索作业：FIFO（默认）、LIFO 或按优先级。控制队列处理顺序在 <a href="techniques/queues#消费者">here</a> 讨论。

<app-banner-enterprise></app-banner-enterprise>

#### 命名配置

如果您的队列连接到多个不同的 Redis 实例，您可以使用一种称为**命名配置**的技术。此功能允许您在指定的键下注册多个配置，然后您可以在队列选项中引用这些配置。

例如，假设您有一个额外的 Redis 实例（除了默认实例之外），被应用程序中注册的几个队列使用，您可以按如下方式注册其配置：

```typescript
BullModule.forRoot('alternative-config', {
  connection: {
    port: 6381,
  },
});

```

在上面的示例中，`'alternative-config'` 只是一个配置键（它可以是任意字符串）。

有了这个，您现在可以在 `registerQueue()` 选项对象中指向此配置：

```typescript
BullModule.registerQueue({
  configKey: 'alternative-config',
  name: 'video',
});

```

#### 生产者

作业生产者将作业添加到队列中。生产者通常是应用程序服务（Nest [providers](/overview/providers)）。要将作业添加到队列，首先将队列注入到服务中，如下所示：

```typescript
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';

@Injectable()
export class AudioService {
  constructor(@InjectQueue('audio') private audioQueue: Queue) {}
}

```

> info **提示** `@InjectQueue()` 装饰器通过其名称来标识队列，该名称在 `registerQueue()` 方法调用中提供（例如，`'audio'`）。

现在，通过调用队列的 `add()` 方法并传递用户定义的作业对象来添加作业。作业表示为可序列化的 JavaScript 对象（因为这是它们在 Redis 数据库中的存储方式）。您传递的作业的形状是任意的；用它来表示作业对象的语义。您还需要给它一个名称。这允许您创建专门的<a href="techniques/queues#消费者">消费者</a>，它们将只处理具有给定名称的作业。

```typescript
const job = await this.audioQueue.add('transcode', {
  foo: 'bar',
});

```

#### 作业选项

作业可以具有与之关联的附加选项。在 `Queue.add()` 方法中的 `job` 参数之后传递一个选项对象。作业选项的一些属性是：

- `priority`: `number` - 可选的优先级值。范围从 1（最高优先级）到 MAX_INT（最低优先级）。请注意，使用优先级会对性能产生轻微影响，因此请谨慎使用。
- `delay`: `number` - 等待此作业可被处理的时间量（毫秒）。请注意，为了准确的延迟，服务器和客户端都应同步其时钟。
- `attempts`: `number` - 尝试作业直到完成的总尝试次数。
- `repeat`: `RepeatOpts` - 根据 cron 规范重复作业。参见 [RepeatOpts](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queueadd)。
- `backoff`: `number | BackoffOpts` - 如果作业失败，自动重试的回退设置。参见 [BackoffOpts](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queueadd)。
- `lifo`: `boolean` - 如果为 true，则将作业添加到队列的右端而不是左端（默认为 false）。
- `jobId`: `number` | `string` - 覆盖作业 ID - 默认情况下，作业 ID 是一个唯一的整数，但您可以使用此设置来覆盖它。如果您使用此选项，则需要您确保 jobId 是唯一的。如果您尝试添加一个 ID 已存在的作业，它将不会被添加。
- `removeOnComplete`: `boolean | number` - 如果为 true，则在作业成功完成时将其移除。数字指定要保留的作业数量。默认行为是将作业保留在已完成集合中。
- `removeOnFail`: `boolean | number` - 如果为 true，则在所有尝试后失败时移除作业。数字指定要保留的作业数量。默认行为是将作业保留在失败集合中。
- `stackTraceLimit`: `number` - 限制将记录在堆栈跟踪中的堆栈跟踪行数。

以下是一些使用作业选项自定义作业的示例。

要延迟作业的开始，请使用 `delay` 配置属性。

```typescript
const job = await this.audioQueue.add(
  'transcode',
  {
    foo: 'bar',
  },
  { delay: 3000 }, // 3 seconds delayed
);

```

要将作业添加到队列的右端（将作业作为 **LIFO**（后进先出）处理），请将配置对象的 `lifo` 属性设置为 `true`。

```typescript
const job = await this.audioQueue.add(
  'transcode',
  {
    foo: 'bar',
  },
  { lifo: true },
);

```

要优先处理作业，请使用 `priority` 属性。

```typescript
const job = await this.audioQueue.add(
  'transcode',
  {
    foo: 'bar',
  },
  { priority: 2 },
);

```

有关选项的完整列表，请查看 API 文档 [here](https://docs.bullmq.io/api/types/v6.JobsOptions.html) 和 [here](https://docs.bullmq.io/api/interfaces/v6.BaseJobOptions.html)。

#### 消费者

消费者是一个**类**，定义处理添加到队列中的作业、监听队列上的事件或两者兼有的方法。使用 `@Processor()` 装饰器声明一个消费者类，如下所示：

```typescript
import { Processor } from '@nestjs/bullmq';

@Processor('audio')
export class AudioConsumer {}

```

> info **提示** 消费者必须注册为 `providers`，以便 `@nestjs/bullmq` 包能够拾取它们。

其中装饰器的字符串参数（例如，`'audio'`）是要与类方法关联的队列名称。

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('audio')
export class AudioConsumer extends WorkerHost {
  async process(job: Job<any, any, string>): Promise<any> {
    let progress = 0;
    for (let i = 0; i < 100; i++) {
      await doSomething(job.data);
      progress += 1;
      await job.updateProgress(progress);
    }
    return {};
  }
}

```

每当工作进程空闲且队列中有要处理的作业时，就会调用 process 方法。此处理程序方法接收 `job` 对象作为其唯一参数。处理程序方法返回的值存储在作业对象中，以后可以访问，例如在完成事件的监听器中。

`Job` 对象具有多种方法，允许您与其状态进行交互。例如，上面的代码使用 `updateProgress()` 方法来更新作业的进度。有关完整的 `Job` 对象 API 参考，请参阅 [here](https://docs.bullmq.io/api/classes/v6.Job.html)。

在旧版本 Bull 中，您可以通过将特定的 `name` 传递给 `@Process()` 装饰器来指定作业处理程序方法将**仅**处理某种类型的作业（具有特定 `name` 的作业），如下所示。

> warning **警告** 这不适用于 BullMQ，请继续阅读。

```typescript
@Process('transcode')
async transcode(job: Job<unknown>) { ... }

```

这种行为在 BullMQ 中不受支持，因为它会产生混淆。相反，您需要使用 switch 分支来为每个任务名称调用不同的服务或逻辑：

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('audio')
export class AudioConsumer extends WorkerHost {
  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'transcode': {
        let progress = 0;
        for (i = 0; i < 100; i++) {
          await doSomething(job.data);
          progress += 1;
          await job.progress(progress);
        }
        return {};
      }
      case 'concatenate': {
        await doSomeLogic2();
        break;
      }
    }
  }
}

```

这在 BullMQ 文档的 [named processor](https://docs.bullmq.io/patterns/named-processor) 部分中有所介绍。

#### 请求作用域的消费者

当消费者被标记为请求作用域时（了解更多关于注入作用域的信息 [here](/fundamentals/provider-scopes#提供者作用域)），将为每个任务专门创建一个新的类实例。该实例将在任务完成后被垃圾回收。

```typescript
@Processor({
  name: 'audio',
  scope: Scope.REQUEST,
})

```

由于请求作用域的消费者类是动态实例化的，并且作用域限定于单个任务，您可以通过构造函数使用标准方法注入 `JOB_REF`。

```typescript
constructor(@Inject(JOB_REF) jobRef: Job) {
  console.log(jobRef);
}

```

> info **提示** `JOB_REF` 令牌从 `@nestjs/bullmq` 包中导入。

#### 事件监听器

当队列和/或任务状态发生变化时，BullMQ 会生成一组有用的事件。这些事件可以在 Worker 级别使用 `@OnWorkerEvent(event)` 装饰器订阅，也可以在队列级别使用专用的监听器类和 `@OnQueueEvent(event)` 装饰器订阅。

Worker 事件必须在 <a href="techniques/queues#消费者">消费者</a> 类中声明（即在使用 `@Processor()` 装饰器装饰的类中）。要监听事件，请使用 `@OnWorkerEvent(event)` 装饰器并指定要处理的事件。例如，要监听任务进入 `audio` 队列中活动状态时发出的事件，请使用以下结构：

```typescript
import { Processor, Process, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('audio')
export class AudioConsumer {
  @OnWorkerEvent('active')
  onActive(job: Job) {
    console.log(
      `Processing job ${job.id} of type ${job.name} with data ${job.data}...`,
    );
  }

  // ...
}

```

您可以在 WorkerListener [here](https://docs.bullmq.io/api/interfaces/v6.WorkerListener.html) 中查看完整的事件列表及其参数。

QueueEvent 监听器必须使用 `@QueueEventsListener(queue)` 装饰器，并继承 `@nestjs/bullmq` 提供的 `QueueEventsHost` 类。要监听事件，请使用 `@OnQueueEvent(event)` 装饰器并指定要处理的事件。例如，要监听任务进入 `audio` 队列中活动状态时发出的事件，请使用以下结构：

```typescript
import {
  QueueEventsHost,
  QueueEventsListener,
  OnQueueEvent,
} from '@nestjs/bullmq';

@QueueEventsListener('audio')
export class AudioEventsListener extends QueueEventsHost {
  @OnQueueEvent('active')
  onActive(job: { jobId: string; prev?: string }) {
    console.log(`Processing job ${job.jobId}...`);
  }

  // ...
}

```

> info **提示** QueueEvent 监听器必须注册为 `providers`，以便 `@nestjs/bullmq` 包能够识别它们。

您可以在 QueueEventsListener [here](https://docs.bullmq.io/api/interfaces/v6.QueueEventsListener.html) 中查看完整的事件列表及其参数。

#### 队列管理

队列具有一个 API，允许您执行管理功能，如暂停和恢复、检索各种状态下的任务数量等。您可以在 [here](https://docs.bullmq.io/api/classes/v6.Queue.html) 中找到完整的队列 API。直接对 `Queue` 对象调用这些方法中的任何一个，如下面的暂停/恢复示例所示。

使用 `pause()` 方法调用来暂停队列。暂停的队列在恢复之前不会处理新任务，但当前正在处理的任务将继续执行直至完成。

```typescript
await audioQueue.pause();

```

要恢复暂停的队列，请使用 `resume()` 方法，如下所示：

```typescript
await audioQueue.resume();

```

#### 在生产环境中观察队列

队列的失败方式与 HTTP 端点不同。任务不会向焦急的用户返回状态码——它会安静地重试三次，带有退避，唯一的症状是下游的某些事情从未发生。因此，重要的两个问题是*"这个队列跟得上吗？"*和*"那个任务到底运行了吗？"*，而这两个问题都无法从消费者自己的日志中得到答案。

[NestJS Observe](https://www.observe.nestjs.com/ 'NestJS Observe') 会自动对队列消费者进行插桩，就像它对控制器进行插桩一样——`@Processor` 类及其处理程序被识别为任务，因此无需手动进行 span 连接：

- **队列等待时间与执行时间分开测量。** 一个运行需要 200 毫秒但在队列中等待了四分钟的任务是容量问题，而不是处理程序缓慢，这两个数字并排报告，以便您判断属于哪种情况。
- **每次运行都会记录尝试次数和失败原因。** 您可以看到任务在第 3 次尝试时成功，而不是只看到成功，这通常是"一切正常"和"悄然降级"之间的区别。
- **静默可告警。** 当命名任务在超过您选择的容差时间内未报告时，*任务静默*规则会触发——这样您就能在夜间计费消费者停止运行的当晚发现它，而不是等到月底。

失败的任务携带与失败请求相同的错误卡片：带有源代码行的已解析堆栈跟踪、运行期间写入的日志，以及任务抛出异常之前所执行操作的瀑布流。有关设置，请参阅 [Observability](/observability/overview) 章节。

#### 独立进程

任务处理程序也可以在单独的（分叉的）进程中运行（[source](https://docs.bullmq.io/guide/workers/sandboxed-processors)）。这有几个优点：

- 该进程是沙盒化的，因此如果它崩溃，不会影响 Worker。
- 您可以运行阻塞代码而不影响队列（任务不会停滞）。
- 更好地利用多核 CPU。
- 更少的 Redis 连接。

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { join } from 'node:path';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'audio',
      processors: [join(import.meta.dirname, 'processor.js')],
    }),
  ],
})
export class AppModule {}

```

> warning **警告** 请注意，由于您的函数在分叉进程中执行，依赖注入（和 IoC 容器）将不可用。这意味着您的处理器函数需要包含（或创建）它所需的所有外部依赖实例。

#### 异步配置

您可能希望异步传递 `bullmq` 选项，而不是静态传递。在这种情况下，请使用 `forRootAsync()` 方法，它提供了多种处理异步配置的方式。同样，如果您想异步传递队列选项，请使用 `registerQueueAsync()` 方法。

一种方法是使用工厂函数：

```typescript
BullModule.forRootAsync({
  useFactory: () => ({
    connection: {
      host: 'localhost',
      port: 6379,
    },
  }),
});

```

我们的工厂行为与任何其他 [asynchronous provider](/fundamentals/async-components) 相同（例如，它可以 `async`，并且能够通过 `inject` 注入依赖）。

```typescript
BullModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    connection: {
      host: configService.get('QUEUE_HOST'),
      port: configService.get('QUEUE_PORT'),
    },
  }),
  inject: [ConfigService],
});

```

或者，您可以使用 `useClass` 语法：

```typescript
BullModule.forRootAsync({
  useClass: BullConfigService,
});

```

上述构造将在 `BullModule` 内部实例化 `BullConfigService`，并通过调用 `createSharedConfiguration()` 来提供选项对象。请注意，这意味着 `BullConfigService` 必须实现 `SharedBullConfigurationFactory` 接口，如下所示：

```typescript
@Injectable()
class BullConfigService implements SharedBullConfigurationFactory {
  createSharedConfiguration(): BullModuleOptions {
    return {
      connection: {
        host: 'localhost',
        port: 6379,
      },
    };
  }
}

```

为了防止在 `BullModule` 内部创建 `BullConfigService`，并使用从其他模块导入的提供者，您可以使用 `useExisting` 语法。

```typescript
BullModule.forRootAsync({
  imports: [ConfigModule],
  useExisting: ConfigService,
});

```

此构造与 `useClass` 的工作方式相同，但有一个关键区别 - `BullModule` 将查找导入的模块以重用现有的 `ConfigService`，而不是实例化新的。

同样，如果您想异步传递队列选项，请使用 `registerQueueAsync()` 方法，只需记住在工厂函数外部指定 `name` 属性。

```typescript
BullModule.registerQueueAsync({
  name: 'audio',
  useFactory: () => ({
    redis: {
      host: 'localhost',
      port: 6379,
    },
  }),
});

```

#### 手动注册

默认情况下，`BullModule` 会在 `onModuleInit` 生命周期函数中自动注册 BullMQ 组件（队列、处理器和事件监听服务）。然而，在某些情况下，这种行为可能并不理想。要阻止自动注册，请在 `BullModule` 中启用 `manualRegistration`，如下所示：

```typescript
BullModule.forRoot({
  extraOptions: {
    manualRegistration: true,
  },
});

```

要手动注册这些组件，请注入 `BullRegistrar` 并调用 `register` 函数，最好在 `OnModuleInit` 或 `OnApplicationBootstrap` 中调用。

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { BullRegistrar } from '@nestjs/bullmq';

@Injectable()
export class AudioService implements OnModuleInit {
  constructor(private bullRegistrar: BullRegistrar) {}

  onModuleInit() {
    if (yourConditionHere) {
      this.bullRegistrar.register();
    }
  }
}

```

除非您调用 `BullRegistrar#register` 函数，否则任何 BullMQ 组件都不会工作——这意味着不会处理任何任务。

#### Bull 安装

> warning **注意** 如果您决定使用 BullMQ，请跳过本节及后续章节。

要开始使用 Bull，我们首先安装所需的依赖。

```bash
$ npm install --save @nestjs/bull bull

```

安装过程完成后，我们可以将 `BullModule` 导入到根 `AppModule` 中。

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    BullModule.forRoot({
      redis: {
        host: 'localhost',
        port: 6379,
      },
    }),
  ],
})
export class AppModule {}

```

`forRoot()` 方法用于注册一个 `bull` 包配置对象，该对象将被应用程序中注册的所有队列使用（除非另有指定）。配置对象包含以下属性：

- `limiter: RateLimiter` - 用于控制队列任务处理速率的选项。有关更多信息，请参阅 [RateLimiter](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queue)。可选。
- `redis: RedisOpts` - 用于配置 Redis 连接的选项。有关更多信息，请参阅 [RedisOpts](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queue)。可选。
- `prefix: string` - 所有队列键的前缀。可选。
- `defaultJobOptions: JobOpts` - 用于控制新任务默认设置的选项。有关更多信息，请参阅 [JobOpts](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queueadd)。可选。**注意：如果您通过 FlowProducer 调度任务，这些设置不会生效。请参阅 [bullmq#1034](https://github.com/taskforcesh/bullmq/issues/1034) 了解说明。**
- `settings: AdvancedSettings` - 高级队列配置设置。这些通常不应更改。有关更多信息，请参阅 [AdvancedSettings](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queue)。可选。

所有选项都是可选的，提供对队列行为的详细控制。这些选项直接传递给 Bull `Queue` 构造函数。有关这些选项的更多信息，请参阅 [here](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queue)。

要注册队列，请导入 `BullModule.registerQueue()` 动态模块，如下所示：

```typescript
BullModule.registerQueue({
  name: 'audio',
});

```

> info **提示** 通过向 `registerQueue()` 方法传递多个逗号分隔的配置对象来创建多个队列。

`registerQueue()` 方法用于实例化和/或注册队列。队列在连接到相同底层 Redis 数据库且具有相同凭据的模块和进程之间共享。每个队列通过其名称属性唯一标识。队列名称既用作注入令牌（用于将队列注入控制器/提供者），也用作装饰器的参数，以将消费者类和监听器与队列关联。

您还可以覆盖特定队列的一些预配置选项，如下所示：

```typescript
BullModule.registerQueue({
  name: 'audio',
  redis: {
    port: 6380,
  },
});

```

由于任务持久化在 Redis 中，每次实例化特定命名的队列时（例如，当应用程序启动/重启时），它都会尝试处理可能来自上一个未完成会话的任何旧任务。

每个队列可以有一个或多个生产者、消费者和监听器。消费者按特定顺序从队列中检索任务：FIFO（默认）、LIFO 或按优先级。控制队列处理顺序在 <a href="techniques/queues#消费者">此处</a> 讨论。

<app-banner-enterprise></app-banner-enterprise>

#### 命名配置

如果您的队列连接到多个 Redis 实例，您可以使用一种称为**命名配置**的技术。此功能允许您在指定的键下注册多个配置，然后您可以在队列选项中引用这些配置。

例如，假设您有一个额外的 Redis 实例（除了默认实例之外）被应用程序中注册的几个队列使用，您可以如下注册其配置：

```typescript
BullModule.forRoot('alternative-config', {
  redis: {
    port: 6381,
  },
});

```

在上面的示例中，`'alternative-config'` 只是一个配置键（可以是任意字符串）。

有了这个，您现在可以在 `registerQueue()` 选项对象中指向此配置：

```typescript
BullModule.registerQueue({
  configKey: 'alternative-config',
  name: 'video',
});

```

#### 生产者

任务生产者将任务添加到队列中。生产者通常是应用程序服务（Nest [providers](/overview/providers)）。要将任务添加到队列，首先将队列注入到服务中，如下所示：

```typescript
import { Injectable } from '@nestjs/common';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';

@Injectable()
export class AudioService {
  constructor(@InjectQueue('audio') private audioQueue: Queue) {}
}

```

> info **提示** `@InjectQueue()` 装饰器通过其名称标识队列，该名称在 `registerQueue()` 方法调用中提供（例如，`'audio'`）。

现在，通过调用队列的 `add()` 方法并传递用户定义的任务对象来添加任务。任务表示为可序列化的 JavaScript 对象（因为这是它们在 Redis 数据库中的存储方式）。您传递的任务形状是任意的；使用它来表示任务对象的语义。

```typescript
const job = await this.audioQueue.add({
  foo: 'bar',
});

```

#### 命名任务

任务可以具有唯一名称。这允许您创建专门的<a href="techniques/queues#消费者">消费者</a>，它们将仅处理具有给定名称的任务。

```typescript
const job = await this.audioQueue.add('transcode', {
  foo: 'bar',
});

```

> 警告 **警告** 使用命名任务时，您必须为添加到队列中的每个唯一名称创建处理器，否则队列将提示您缺少给定任务的处理器。有关使用命名任务的更多信息，请参阅<a href="techniques/queues#消费者">此处</a>。

#### 任务选项

任务可以具有与之关联的附加选项。在`Queue.add()`方法中的`job`参数之后传递一个选项对象。任务选项属性如下：

- `priority`: `number` - 可选的优先级值。范围从 1（最高优先级）到 MAX_INT（最低优先级）。请注意，使用优先级会对性能产生轻微影响，因此请谨慎使用。
- `delay`: `number` - 等待此任务可被处理的时间量（毫秒）。请注意，为了获得准确的延迟，服务器和客户端应同步其时钟。
- `attempts`: `number` - 尝试完成任务直到完成的总尝试次数。
- `repeat`: `RepeatOpts` - 根据 cron 规范重复任务。参见 [RepeatOpts](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queueadd)。
- `backoff`: `number | BackoffOpts` - 任务失败时自动重试的回退设置。参见 [BackoffOpts](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queueadd)。
- `lifo`: `boolean` - 如果为 true，则将任务添加到队列的右端而不是左端（默认为 false）。
- `timeout`: `number` - 任务应在多少毫秒后因超时错误而失败。
- `jobId`: `number` | `string` - 覆盖任务 ID - 默认情况下，任务 ID 是唯一的整数，但您可以使用此设置来覆盖它。如果使用此选项，您需要自行确保 jobId 是唯一的。如果您尝试添加一个已存在 ID 的任务，则不会添加。
- `removeOnComplete`: `boolean | number` - 如果为 true，则在任务成功完成时将其移除。数字指定要保留的任务数量。默认行为是将任务保留在已完成集合中。
- `removeOnFail`: `boolean | number` - 如果为 true，则在所有尝试后任务失败时将其移除。数字指定要保留的任务数量。默认行为是将任务保留在失败集合中。
- `stackTraceLimit`: `number` - 限制将在堆栈跟踪中记录的堆栈跟踪行数。

以下是使用任务选项自定义任务的一些示例。

要延迟任务的开始，请使用 `delay` 配置属性。

```typescript
const job = await this.audioQueue.add(
  {
    foo: 'bar',
  },
  { delay: 3000 }, // 3 seconds delayed
);

```

要将任务添加到队列的右端（以**LIFO**（后进先出）方式处理任务），请将配置对象的 `lifo` 属性设置为 `true`。

```typescript
const job = await this.audioQueue.add(
  {
    foo: 'bar',
  },
  { lifo: true },
);

```

要优先处理任务，请使用 `priority` 属性。

```typescript
const job = await this.audioQueue.add(
  {
    foo: 'bar',
  },
  { priority: 2 },
);

```

#### 消费者

消费者是一个**类**，定义处理添加到队列中的任务或监听队列上的事件（或两者兼有）的方法。使用 `@Processor()` 装饰器声明消费者类，如下所示：

```typescript
import { Processor } from '@nestjs/bull';

@Processor('audio')
export class AudioConsumer {}

```

> 信息 **提示** 消费者必须注册为 `providers`，以便 `@nestjs/bull` 包能够拾取它们。

其中装饰器的字符串参数（例如 `'audio'`）是要与类方法关联的队列名称。

在消费者类中，通过使用 `@Process()` 装饰器装饰处理方法，来声明任务处理器。

```typescript
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';

@Processor('audio')
export class AudioConsumer {
  @Process()
  async transcode(job: Job<unknown>) {
    let progress = 0;
    for (let i = 0; i < 100; i++) {
      await doSomething(job.data);
      progress += 1;
      await job.progress(progress);
    }
    return {};
  }
}

```

每当工作进程空闲且队列中有任务要处理时，就会调用被装饰的方法（例如 `transcode()`）。此处理方法接收 `job` 对象作为其唯一参数。处理方法返回的值存储在任务对象中，以后可以访问，例如在已完成事件的监听器中。

`Job` 对象具有多种方法，允许您与其状态进行交互。例如，上述代码使用 `progress()` 方法来更新任务的进度。有关完整的 `Job` 对象 API 参考，请参见 [here](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#job)。

您可以通过将特定的 `name` 传递给 `@Process()` 装饰器，来指定任务处理方法将**仅**处理某种类型的任务（具有特定 `name` 的任务），如下所示。您可以在给定的消费者类中拥有多个 `@Process()` 处理器，对应于每种任务类型（`name`）。使用命名任务时，请确保每个名称都有对应的处理器。

```typescript
@Process('transcode')
async transcode(job: Job<unknown>) { ... }

```

> 警告 **警告** 为同一队列定义多个消费者时，`@Process({ concurrency: 1 })` 中的 `concurrency` 选项将不会生效。最小 `concurrency` 将与定义的消费者数量匹配。即使 `@Process()` 处理器使用不同的 `name` 来处理命名任务，这也适用。

#### 请求作用域的消费者

当消费者被标记为请求作用域时（了解有关注入作用域的更多信息，请参阅 [here](/fundamentals/provider-scopes#提供者作用域)），将为每个任务专门创建该类的新实例。任务完成后，该实例将被垃圾回收。

```typescript
@Processor({
  name: 'audio',
  scope: Scope.REQUEST,
})

```

由于请求作用域的消费者类是动态实例化的，并且作用域限定为单个任务，因此您可以使用标准方法通过构造函数注入 `JOB_REF`。

```typescript
constructor(@Inject(JOB_REF) jobRef: Job) {
  console.log(jobRef);
}

```

> 信息 **提示** `JOB_REF` 令牌从 `@nestjs/bull` 包中导入。

#### 事件监听器

Bull 在队列和/或任务状态发生变化时生成一组有用的事件。Nest 提供了一组装饰器，允许您订阅一组核心的标准事件。这些事件从 `@nestjs/bull` 包中导出。

事件监听器必须在 <a href="techniques/queues#消费者">消费者</a> 类内声明（即在使用 `@Processor()` 装饰器装饰的类内）。要监听事件，请使用下表中的一个装饰器来声明事件的处理程序。例如，要监听 `audio` 队列中任务进入活动状态时发出的事件，请使用以下构造：

```typescript
import { Processor, Process, OnQueueActive } from '@nestjs/bull';
import { Job } from 'bull';

@Processor('audio')
export class AudioConsumer {

  @OnQueueActive()
  onActive(job: Job) {
    console.log(
      `Processing job ${job.id} of type ${job.name} with data ${job.data}...`,
    );
  }
  ...

```

由于 Bull 在分布式（多节点）环境中运行，它定义了事件局部性的概念。这个概念认识到事件可能完全在单个进程内触发，也可能在来自不同进程的共享队列上触发。**本地**事件是指在本地进程中的队列上触发操作或状态更改时产生的事件。换句话说，当您的事件生产者和消费者位于单个进程内时，队列上发生的所有事件都是本地的。

当队列在多个进程之间共享时，我们可能会遇到**全局**事件。为了让一个进程中的监听器接收由另一个进程触发的事件通知，它必须注册全局事件。

每当发出相应事件时，都会调用事件处理程序。处理程序使用下表所示的签名调用，提供对事件相关信息的访问。下面我们讨论本地和全局事件处理程序签名之间的一个关键区别。

<table>
  <tr>
    <th>本地事件监听器</th>
    <th>全局事件监听器</th>
    <th>处理程序方法签名 / 触发时机</th>
  </tr>
  <tr>
    <td><code>@OnQueueError()</code></td><td><code>@OnGlobalQueueError()</code></td><td><code>handler(error: Error)</code> - 发生错误。<code>error</code> 包含触发错误。</td>
  </tr>
  <tr>
    <td><code>@OnQueueWaiting()</code></td><td><code>@OnGlobalQueueWaiting()</code></td><td><code>handler(jobId: number | string)</code> - 一个任务正在等待，一旦工作进程空闲即可处理。<code>jobId</code> 包含进入此状态的任务的 id。</td>
  </tr>
  <tr>
    <td><code>@OnQueueActive()</code></td><td><code>@OnGlobalQueueActive()</code></td><td><code>handler(job: Job)</code> - 任务 <code>job</code> 已开始。</td>
  </tr>
  <tr>
    <td><code>@OnQueueStalled()</code></td><td><code>@OnGlobalQueueStalled()</code></td><td><code>handler(job: Job)</code> - 任务 <code>job</code> 已被标记为停滞。这对于调试崩溃或暂停事件循环的任务工作进程非常有用。</td>
  </tr>
  <tr>
    <td><code>@OnQueueProgress()</code></td><td><code>@OnGlobalQueueProgress()</code></td><td><code>handler(job: Job, progress: number)</code> - 任务 <code>job</code> 的进度已更新为值 <code>progress</code>。</td>
  </tr>
  <tr>
    <td><code>@OnQueueCompleted()</code></td><td><code>@OnGlobalQueueCompleted()</code></td><td><code>handler(job: Job, result: any)</code> 任务 <code>job</code> 成功完成，结果为 <code>result</code>。</td>
  </tr>
  <tr>
    <td><code>@OnQueueFailed()</code></td><td><code>@OnGlobalQueueFailed()</code></td><td><code>handler(job: Job, err: Error)</code> 任务 <code>job</code> 因原因 <code>err</code> 失败。</td>
  </tr>
  <tr>
    <td><code>@OnQueuePaused()</code></td><td><code>@OnGlobalQueuePaused()</code></td><td><code>handler()</code> 队列已暂停。</td>
  </tr>
  <tr>
    <td><code>@OnQueueResumed()</code></td><td><code>@OnGlobalQueueResumed()</code></td><td><code>handler(job: Job)</code> 队列已恢复。</td>
  </tr>
  <tr>
    <td><code>@OnQueueCleaned()</code></td><td><code>@OnGlobalQueueCleaned()</code></td><td><code>handler(jobs: Job[], type: string)</code> 旧任务已从队列中清理。<code>jobs</code> 是已清理任务的数组，<code>type</code> 是已清理任务的类型。</td>
  </tr>
  <tr>
    <td><code>@OnQueueDrained()</code></td><td><code>@OnGlobalQueueDrained()</code></td><td><code>handler()</code> 每当队列处理完所有等待的任务时发出（即使可能还有一些延迟任务尚未处理）。</td>
  </tr>
  <tr>
    <td><code>@OnQueueRemoved()</code></td><td><code>@OnGlobalQueueRemoved()</code></td><td><code>handler(job: Job)</code> 任务 <code>job</code> 已成功移除。</td>
  </tr>
</table>

当监听全局事件时，方法签名可能与本地对应项略有不同。具体来说，任何在本地版本中接收 `job` 对象的方法签名，在全局版本中改为接收 `jobId`（`number`）。在这种情况下，要获取实际 `job` 对象的引用，请使用 `Queue#getJob` 方法。此调用应被等待，因此处理程序应声明为 `async`。例如：

```typescript
@OnGlobalQueueCompleted()
async onGlobalCompleted(jobId: number, result: any) {
  const job = await this.immediateQueue.getJob(jobId);
  console.log('(Global) on completed: job ', job.id, ' -> result: ', result);
}

```

> 信息 **提示** 要访问 `Queue` 对象（以进行 `getJob()` 调用），您当然必须注入它。此外，Queue 必须在您注入它的模块中注册。

除了特定的事件监听器装饰器之外，您还可以使用通用的 `@OnQueueEvent()` 装饰器，结合 `BullQueueEvents` 或 `BullQueueGlobalEvents` 枚举。在此处阅读有关事件的更多信息 [here](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#事件)。

#### 队列管理

队列拥有一个 API，允许您执行管理功能，如暂停和恢复、检索各种状态下的任务数量等。您可以在 [here](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queue) 找到完整的队列 API。直接在 `Queue` 对象上调用这些方法中的任何一个，如下面的暂停/恢复示例所示。

使用 `pause()` 方法调用来暂停队列。暂停的队列在恢复之前不会处理新任务，但当前正在处理的任务将继续执行直到完成。

```typescript
await audioQueue.pause();

```

要恢复暂停的队列，请使用 `resume()` 方法，如下所示：

```typescript
await audioQueue.resume();

```

#### 独立进程

任务处理器也可以在独立的（分叉的）进程中运行（[source](https://github.com/OptimalBits/bull#独立进程)）。这有几个优点：

- 该进程是沙箱化的，因此如果它崩溃，不会影响工作进程。
- 您可以运行阻塞代码而不影响队列（任务不会停滞）。
- 更好地利用多核 CPU。
- 更少的 Redis 连接。

```ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { join } from 'node:path';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'audio',
      processors: [join(import.meta.dirname, 'processor.js')],
    }),
  ],
})
export class AppModule {}

```

请注意，由于您的函数在分叉进程中执行，依赖注入（以及 IoC 容器）将不可用。这意味着您的处理器函数需要包含（或创建）它所需的所有外部依赖实例。

```ts
import { Job, DoneCallback } from 'bull';

export default function (job: Job, cb: DoneCallback) {
  console.log(`[${process.pid}] ${JSON.stringify(job.data)}`);
  cb(null, 'It works');
}

```

#### 异步配置

您可能希望异步传递 `bull` 选项，而不是静态传递。在这种情况下，请使用 `forRootAsync()` 方法，它提供了几种处理异步配置的方式。

一种方法是使用工厂函数：

```typescript
BullModule.forRootAsync({
  useFactory: () => ({
    redis: {
      host: 'localhost',
      port: 6379,
    },
  }),
});

```

我们的工厂函数与其他任何 [asynchronous provider](/fundamentals/async-components) 行为相同（例如，它可以是 `async`，并且能够通过 `inject` 注入依赖）。

```typescript
BullModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    redis: {
      host: configService.get('QUEUE_HOST'),
      port: configService.get('QUEUE_PORT'),
    },
  }),
  inject: [ConfigService],
});

```

或者，您可以使用 `useClass` 语法：

```typescript
BullModule.forRootAsync({
  useClass: BullConfigService,
});

```

上述构造将在 `BullModule` 内部实例化 `BullConfigService`，并通过调用 `createSharedConfiguration()` 来提供选项对象。请注意，这意味着 `BullConfigService` 必须实现 `SharedBullConfigurationFactory` 接口，如下所示：

```typescript
@Injectable()
class BullConfigService implements SharedBullConfigurationFactory {
  createSharedConfiguration(): BullModuleOptions {
    return {
      redis: {
        host: 'localhost',
        port: 6379,
      },
    };
  }
}

```

为了防止在 `BullModule` 内部创建 `BullConfigService` 并使用从其他模块导入的提供者，您可以使用 `useExisting` 语法。

```typescript
BullModule.forRootAsync({
  imports: [ConfigModule],
  useExisting: ConfigService,
});

```

此构造与 `useClass` 的工作方式相同，但有一个关键区别 - `BullModule` 将查找导入的模块以重用现有的 `ConfigService`，而不是实例化新的。

同样，如果您想异步传递队列选项，请使用 `registerQueueAsync()` 方法，只需记住在工厂函数外部指定 `name` 属性。

```typescript
BullModule.registerQueueAsync({
  name: 'audio',
  useFactory: () => ({
    redis: {
      host: 'localhost',
      port: 6379,
    },
  }),
});

```

#### 示例

可用的工作示例位于 [here](https://github.com/nestjs/nest/tree/master/sample/26-queues)。