<!-- 此文件从 content/application/queues.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T23:11:03.598Z -->
<!-- 源文件: content/application/queues.md -->
<!-- 源哈希: c8b46a317617909bc8bb503d0b762504 -->

### 队列

队列是一种设计模式，可帮助您应对常见的应用扩展和性能挑战。队列可以帮助解决的一些问题示例包括：

- 平滑处理峰值。例如，如果用户可以在任意时间发起资源密集型任务，您可以将这些任务添加到队列中，而不是同步执行。工作进程然后以受控的方式从队列中拉取任务。随着应用的增长，您可以添加队列消费者来扩展后端任务处理能力。
- 打破可能阻塞 Node.js 事件循环的单体任务。例如，如果用户请求需要音频转码等 CPU 密集型工作，您可以将此任务委托给其他进程，从而使面向用户的进程保持响应。
- 在服务之间提供可靠的通信通道。例如，您可以在一个进程或服务中排队任务（job），并在另一个进程中消费它们。通过监听状态事件，任何进程或服务都可以被通知任务生命周期中的完成、错误或其他状态更改。当队列生产者或消费者失败时，其状态得以保留，节点重启时任务处理可以自动恢复。

Nest 提供了 `@nestjs/bullmq` 包用于 BullMQ 集成，提供了 `@nestjs/bull` 包用于 Bull 集成。这两个包封装了各自的库，它们由同一团队开发。Bull 处于维护模式（团队仅修复错误），而 BullMQ 正在积极开发，提供现代的 TypeScript 实现和不同的功能集。如果 Bull 满足您的要求，它仍然是一个可靠、经过实战检验的选择。

BullMQ 和 Bull 都使用 [Redis](https://redis.io/) 来持久化任务数据，因此需要一个正在运行的 Redis 实例。由于它们是基于 Redis 的，您的队列架构可以完全分布式和平台无关。例如，您可以在一个或多个节点上的 Nest 中运行一些队列 <a href="application/queues#生产者">生产者</a>、<a href="application/queues#消费者">消费者</a>和 <a href="application/queues#事件监听器">监听器</a>，而在其他网络节点的其他 Node.js 平台上运行其他生产者、消费者和监听器。

> info **提示** 要在完整的应用中查看队列发送电子邮件，包括重试和无重复发送，请遵循 [Send emails and run background jobs in Node.js](/tutorials/background-jobs)。

本章涵盖 `@nestjs/bullmq` 和 `@nestjs/bull` 包。有关更多背景和实现细节，请参阅 [BullMQ documentation](https://docs.bullmq.io/) 和 [Bull reference](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md)。

#### BullMQ 安装

要开始使用 BullMQ，请安装所需的依赖项。

```bash
$ npm install --save @nestjs/bullmq bullmq ioredis

```

安装过程完成后，将 `BullModule` 导入到根 `AppModule` 中。

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

`forRoot()` 方法注册一个 `bullmq` 配置对象，所有在应用中注册的队列都使用此配置（除非另有指定）。以下是配置属性的几个示例：

- `connection: ConnectionOptions` - 用于配置 Redis 连接的选项。更多信息请参阅 [Connections](https://docs.bullmq.io/guide/connections)。
- `backendFactory: BullMQBackendFactory` - 可插拔后端（例如 PostgreSQL）的工厂函数。更多信息请参阅 [Pluggable backends](/techniques/queues#pluggable-backends)。
- `prefix: string` - 所有队列键的前缀（默认为 `bull`）。
- `defaultJobOptions: DefaultJobOptions` - 新任务的默认设置。更多信息请参阅 [DefaultJobOptions](https://docs.bullmq.io/api/interfaces/v6.DefaultJobOptions.html)。这些设置不适用于通过 `FlowProducer` 添加的任务；有关解释，请参阅 [bullmq#1034](https://github.com/taskforcesh/bullmq/issues/1034)。
- `settings: AdvancedRepeatOptions` - 可重复任务的高级设置。通常不应更改。更多信息请参阅 [AdvancedRepeatOptions](https://docs.bullmq.io/api/interfaces/v6.AdvancedRepeatOptions.html)。
- `extraOptions` - 模块初始化的额外选项。请参阅 [Manual registration](/techniques/queues#manual-registration)。

所有选项都是可选的。除了 `extraOptions` 外，它们直接传递给 BullMQ `Queue` 构造函数。完整列表请参阅 [QueueOptions API reference](https://docs.bullmq.io/api/interfaces/v6.QueueOptions.html)。

要注册一个队列，请按如下方式导入 `BullModule.registerQueue()` 动态模块：

```typescript
BullModule.registerQueue({
  name: 'audio',
});

```

> info **提示** 通过向 `registerQueue()` 方法传递多个配置对象（作为单独的参数）来创建多个队列。

`registerQueue()` 方法实例化和/或注册队列。连接到相同底层 Redis 数据库且凭据相同的模块和进程共享队列。每个队列都由其 `name` 属性标识。队列名称既用作注入令牌（用于将队列注入到控制器和提供者中），也用作关联消费者类和监听器到队列的装饰器参数。

您还可以按如下方式覆盖特定队列的一些预配置选项：

```typescript
BullModule.registerQueue({
  name: 'audio',
  connection: {
    port: 6380,
  },
});

```

BullMQ 还支持任务之间的父子关系。这使得流程成为可能，其中任务是任意深度的树的节点。有关更多信息，请参阅 BullMQ 文档中的 [Flows](https://docs.bullmq.io/guide/flows)。

要注册一个流程生产者，请使用 `registerFlowProducer()` 方法：

```typescript
BullModule.registerFlowProducer({
  name: 'flowProducerName',
});

```

由于任务存储在 Redis 中，每当实例化一个命名队列时（例如，应用启动或重启时），它都会尝试处理先前未完成会话遗留的任何旧任务。

每个队列可以有一个或多个生产者、消费者和监听器。消费者会按照特定顺序从队列中检索任务：FIFO（默认）、LIFO 或根据优先级。<a href="application/queues#job-options">任务选项</a> 部分解释了如何控制处理顺序。

<app-banner-enterprise></app-banner-enterprise>

#### 命名配置

如果您的队列连接到多个 Redis 实例，您可以使用**命名配置**技术。此功能允许您在指定的键下注册多个配置，然后在队列选项中引用它们。

例如，假设您的应用程序中有一个额外的 Redis 实例（除了默认实例）供少数队列使用，您可以按如下方式注册其配置：

```typescript
BullModule.forRoot('alternative-config', {
  connection: {
    port: 6381,
  },
});

```

在上面的示例中，`'alternative-config'` 是一个配置键（可以是任何字符串）。

您现在可以在 `registerQueue()` 选项对象中指向此配置：

```typescript
BullModule.registerQueue({
  configKey: 'alternative-config',
  name: 'video',
});

```

#### 可插拔后端（PostgreSQL）

BullMQ 通过自定义后端工厂支持可插拔的存储后端（如 PostgreSQL）。PostgreSQL 后端需要 `pg` 包（`npm install --save pg`），而不是 `ioredis`。您可以在 `BullModule.forRoot()` 全局配置 `backendFactory`，或在 `BullModule.registerQueue()` 中按队列配置。

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { createPostgresBackend } from 'bullmq';

@Module({
  imports: [
    BullModule.forRoot({
      backendFactory: createPostgresBackend,
      connection: {
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'password',
        database: 'mydb',
        migrate: true,
      },
    }),
  ],
})
export class AppModule {}

```

`migrate: true` 在启动时创建 BullMQ 的表，在一个独立的 `bullmq` 模式中。如果没有它，应用程序在数据库尚未包含这些表时会失败。

配置的 `backendFactory` 会自动传播到所有底层 BullMQ 组件（`Queue`、`Worker`、`QueueEvents` 和 `FlowProducer`），包括 `@Processor()` 和 `@QueueEventsListener()` 工作节点。

#### 生产者

任务生产者将任务添加到队列中。生产者通常是应用程序 [providers](/overview/providers)（Nest）服务。要向队列添加任务，首先将队列注入到服务中：

```typescript
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';

@Injectable()
export class AudioService {
  constructor(@InjectQueue('audio') private audioQueue: Queue) {}
}

```

> info **提示** `@InjectQueue()` 装饰器通过 `registerQueue()` 方法调用中提供的名称来识别队列（例如，`'audio'`）。

现在，通过调用队列的 `add()` 方法来添加任务，传入一个任务名称和一个用户定义的数据对象。任务数据必须是可序列化的，因为任务存储在 Redis 中。数据的形状是任意的；使用它来表示您任务的语义。名称允许 <a href="application/queues#消费者"> 消费者 </a> 区分不同类型的任务。

```typescript
const job = await this.audioQueue.add('transcode', {
  foo: 'bar',
});

```

#### 任务选项

任务可以关联额外的选项。将选项对象作为 `Queue.add()` 方法的第三个参数（在任务数据之后）传入。一些任务选项包括：

- `priority`: `number` - 优先级值，范围从 0 到 2,097,151。`0`（默认）表示没有明确的优先级；没有优先级的任务在优先任务之前处理，在优先任务中，数字越小越先处理。使用优先级会对性能产生轻微影响，因此仅在需要时使用。
- `delay`: `number` - 等待此任务可以处理的时间（毫秒）。为实现准确的延迟，工作节点和生产者应同步时钟。
- `attempts`: `number` - 尝试完成任务的总次数（默认为 1）。
- `backoff`: `number | BackoffOptions` - 如果任务失败时的自动重试的回退设置。参见 [BackoffOptions](https://docs.bullmq.io/api/interfaces/v6.BackoffOptions.html)。
- `lifo`: `boolean` - 如果设置为 `true`，则将任务添加到队列的右端而不是左端（默认 `false`）。
- `jobId`: `string` - 覆盖任务 ID。默认情况下，任务 ID 是一个唯一的整数。如果使用此选项，您需要确保 ID 是唯一的。已存在的 ID 的任务不会被添加。
- `removeOnComplete`: `boolean | number | KeepJobs` - 如果设置为 `true`，则在任务成功完成后移除该任务。一个数字指定要保留的任务数量，一个 `KeepJobs` 对象指定最大年龄和/或计数。默认情况下，任务保留在已完成集合中。
- `removeOnFail`: `boolean | number | KeepJobs` - 如果设置为 `true`，则在所有尝试失败后移除该任务。一个数字或 `KeepJobs` 对象与 `removeOnComplete` 类似。默认情况下，任务保留在失败集合中。
- `stackTraceLimit`: `number` - 限制记录失败任务的堆栈跟踪行数。

> info **提示** BullMQ 不再接受 `repeat` 选项在 `Queue.add()` 中。要重复运行任务（例如，按 cron 模式），请使用 `Queue#upsertJobScheduler()` 方法创建一个任务调度器。请参阅 BullMQ 文档中的 [Job Schedulers](https://docs.bullmq.io/guide/job-schedulers)。

以下是使用任务选项自定义任务的几个示例。

要延迟任务的开始，请使用 `delay` 属性。

```typescript
const job = await this.audioQueue.add(
  'transcode',
  {
    foo: 'bar',
  },
  { delay: 3000 }, // 3 seconds delayed
);

```

要将任务添加到队列的右端（即按 **LIFO**，后进先出处理），请将 `lifo` 属性设置为 `true`。

```typescript
const job = await this.audioQueue.add(
  'transcode',
  {
    foo: 'bar',
  },
  { lifo: true },
);

```

要为任务设置优先级，请使用 `priority` 属性。

```typescript
const job = await this.audioQueue.add(
  'transcode',
  {
    foo: 'bar',
  },
  { priority: 2 },
);

```

有关完整选项列表，请参阅 [JobsOptions](https://docs.bullmq.io/api/types/v6.JobsOptions.html) 和 [BaseJobOptions](https://docs.bullmq.io/api/interfaces/v6.BaseJobOptions.html) API 参考。

#### 消费者

消费者是一个**类**，定义了处理添加到队列中的任务、监听队列事件或两者都执行的方法。使用 `@Processor()` 装饰器声明消费者类如下：

```typescript
import { Processor } from '@nestjs/bullmq';

@Processor('audio')
export class AudioConsumer {}

```

> info **提示** 消费者必须注册为 `providers`，以便 `@nestjs/bullmq` 包可以拾取它们。

装饰器的字符串参数（例如，`'audio'`）是与该类关联的队列名称。消费者类必须继承 `WorkerHost` 并实现其 `process()` 方法：

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

当工作节点空闲且队列中有任务需要处理时，会调用 `process()` 方法。它接收 `job` 对象作为唯一参数。它返回的值存储在任务对象中，之后可以访问，例如在 `completed` 事件的监听器中。

`Job` 对象具有多个方法，允许您与其状态交互。例如，上面的代码使用 `updateProgress()` 方法来更新任务进度。有关完整列表，请参阅 [Job API reference](https://docs.bullmq.io/api/classes/v6.Job.html)。

在 Bull 中，您可以通过将该 `name` 传递给 `@Process()` 装饰器，指定一个任务处理方法**仅**处理特定类型的任务（具有特定 `name` 的任务），如下所示。

> warning **警告** 这不适用于 BullMQ。请阅读关于 BullMQ 的方法。

```typescript
@Process('transcode')
async transcode(job: Job<unknown>) { ... }

```

BullMQ 不支持此行为，因为它会造成混淆。相反，请在 job 名称上使用 `switch` 语句，为每种类型的任务调用不同的服务或逻辑，如下所示：

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('audio')
export class AudioConsumer extends WorkerHost {
  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'transcode': {
        let progress = 0;
        for (let i = 0; i < 100; i++) {
          await doSomething(job.data);
          progress += 1;
          await job.updateProgress(progress);
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

这在 BullMQ 文档的 [named processor](https://docs.bullmq.io/patterns/named-processor) 部分有介绍。

#### 请求作用域的消费者

当消费者被标记为请求作用域（参见 [injection scopes](/fundamentals/provider-scopes#提供者作用域)）时，会为每个任务创建一个新的类实例。该实例在任务完成后会被垃圾回收。

```typescript
@Processor({
  name: 'audio',
  scope: Scope.REQUEST,
})

```

由于请求作用域的消费者类是动态实例化并作用于单个任务的，您可以使用 `JOB_REF` 令牌通过构造函数注入当前任务。

```typescript
constructor(@Inject(JOB_REF) jobRef: Job) {
  console.log(jobRef);
}

```

> info **提示** `JOB_REF` 令牌是从 `@nestjs/bullmq` 包导入的。

#### 事件监听器

当队列和/或任务状态发生变化时，BullMQ 会发出一组事件。您可以使用 `@OnWorkerEvent(event)` 装饰器在工作节点级别订阅这些事件，或者使用专用的监听器类和 `@OnQueueEvent(event)` 装饰器在队列级别订阅。

工作节点事件必须在 <a href="application/queues#消费者">consumer</a> 类（即使用 `@Processor()` 装饰器装饰的类）内部声明。要监听事件，请使用 `@OnWorkerEvent(event)` 装饰器指定要处理的事件。例如，要监听任务进入 `audio` 队列的 active 状态时发出的事件，请使用以下结构：

```typescript
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('audio')
export class AudioConsumer extends WorkerHost {
  @OnWorkerEvent('active')
  onActive(job: Job) {
    console.log(
      `Processing job ${job.id} of type ${job.name} with data ${job.data}...`,
    );
  }

  // ...
}

```

工作节点事件及其参数的完整列表可在 [WorkerListener](https://docs.bullmq.io/api/interfaces/v6.WorkerListener.html) 接口的属性中获取。

队列事件监听器必须使用 `@QueueEventsListener(queue)` 装饰器，并扩展由 `@nestjs/bullmq` 提供的 `QueueEventsHost` 类。要监听事件，请使用 `@OnQueueEvent(event)` 装饰器指定要处理的事件。例如，要监听任务进入 `audio` 队列的 active 状态时发出的事件，请使用以下结构：

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

> info **提示** 队列事件监听器必须注册为 `providers`，以便 `@nestjs/bullmq` 包可以拾取它们。

队列事件及其参数的完整列表可在 [QueueEventsListener](https://docs.bullmq.io/api/interfaces/v6.QueueEventsListener.html) 接口的属性中获取。

#### 队列管理

队列提供了一个用于管理功能的 API，例如暂停和恢复，以及检索各种状态下任务的数量。有关完整 API，请参阅 [Queue API reference](https://docs.bullmq.io/api/classes/v6.Queue.html)。请直接在 `Queue` 对象上调用这些方法，如下面的暂停和恢复示例所示。

使用 `pause()` 方法暂停队列。暂停的队列在恢复之前不会处理新任务，但正在处理的任务会继续直到完成。

```typescript
await audioQueue.pause();

```

要恢复暂停的队列，请使用 `resume()` 方法，如下所示：

```typescript
await audioQueue.resume();

```

#### 在生产环境中观察队列

队列的失败方式与 HTTP 端点不同。任务不会向不耐烦的用户返回状态码。它会静默地重试三次，带有退避策略，唯一的症状是下游的某个操作从未发生。因此，需要关注的两个问题是“此队列是否跟得上？”和“该任务是否运行了？”，而消费者自身的日志无法回答其中任何一个问题。

[NestJS Observe](https://www.observe.nestjs.com/ 'NestJS Observe') 自动对队列消费者进行度量，方式与对控制器进行度量相同：`@Processor()` 类及其处理器被识别为任务，因此无需手动配置 Span：

- **队列等待时间和执行时间是分开衡量的。** 一个运行时间为 200 ms 但在队列中等待了四分钟的任务是一个容量问题，而不是处理程序慢的问题。这两个数字并排报告，因此您可以判断是哪方面存在问题。
- **每次运行都会记录尝试次数和失败原因。** 您可以看到任务在第 3 次尝试时成功，而不是只看到成功，这通常是“正常”和“静默退化”之间的区别。
- **静默状态是可告警的。** 当一个命名任务超过您选择的容忍时间没有报告时，会触发 *任务静默* 规则。这样您就能发现夜间计费消费者在停止运行的那个晚上停止了，而不是在月底才发现。

失败的任务会携带与失败请求相同的错误卡片：带有源行信息的解析堆栈跟踪、运行期间写入的日志，以及任务在抛出异常前所执行操作的瀑布图。有关设置，请参阅 [Observability](/observability/overview) 章。

#### 独立进程

任务处理器也可以在单独（派生）进程中运行（参见 BullMQ 文档中的 [Sandboxed processors](https://docs.bullmq.io/guide/workers/sandboxed-processors)）。这有几个优点：

- 进程是沙盒化的，因此如果它崩溃，工作节点不会受到影响。
- 您可以在不影响队列的情况下运行阻塞代码（任务不会停滞）。
- 更有效地利用多核 CPU。
- 与 Redis 的连接更少。

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

> warning **警告** 由于您的函数在派生进程中运行，因此无法使用依赖注入（和 IoC 容器）。您的处理器函数必须包含（或创建）它需要的外部依赖的所有实例。

#### 异步配置

您可能希望异步而不是静态地传递 `bullmq` 选项。在这种情况下，请使用 `forRootAsync()` 方法，它提供了处理异步配置的多种方式。同样，要异步传递队列选项，请使用 `registerQueueAsync()` 方法。

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

该工厂行为类似于任何其他 [asynchronous provider](/fundamentals/async-components)（例如，它可以是 `async` 并且可以通过 `inject` 注入依赖）。

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

上述构造在 `BullModule` 内部实例化了 `BullConfigService`，并通过调用 `createSharedConfiguration()` 来提供一个选项对象。这意味着 `BullConfigService` 必须实现 `SharedBullConfigurationFactory` 接口，如下所示：

```typescript
@Injectable()
class BullConfigService implements SharedBullConfigurationFactory {
  createSharedConfiguration(): BullRootModuleOptions {
    return {
      connection: {
        host: 'localhost',
        port: 6379,
      },
    };
  }
}

```

要重用从不同模块导入的提供者，而不是在 `BullModule` 内部创建 `BullConfigService`，请使用 `useExisting` 语法。

```typescript
BullModule.forRootAsync({
  imports: [ConfigModule],
  useExisting: ConfigService,
});

```

此构造与 `useClass` 相同，但有一个关键区别：`BullModule` 会查找导入的模块以重用现有的 `ConfigService`，而不是实例化一个新的。

同样，要异步传递队列选项，请使用 `registerQueueAsync()` 方法。在工厂函数外部指定 `name` 属性。

```typescript
BullModule.registerQueueAsync({
  name: 'audio',
  useFactory: () => ({
    connection: {
      host: 'localhost',
      port: 6379,
    },
  }),
});

```

#### 手动注册

默认情况下，`BullModule` 会在 `onModuleInit` 生命周期钩子中自动注册 BullMQ 组件（队列、处理器和事件监听器服务）。在某些情况下，这不是您想要的行为。要防止自动注册，请在 `BullModule` 中启用 `manualRegistration`：

```typescript
BullModule.forRoot({
  extraOptions: {
    manualRegistration: true,
  },
});

```

要手动注册这些组件，请注入 `BullRegistrar` 并调用其 `register()` 方法，理想情况下是在 `onModuleInit()` 或 `onApplicationBootstrap()` 生命周期钩子中。

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

在调用 `BullRegistrar#register()` 之前，没有 BullMQ 组件工作，这意味着没有任务被处理。

#### Bull 安装

> info **注意** 如果您使用 BullMQ，请跳过本节及后续章节。

要开始使用 Bull，请安装所需的依赖项。

```bash
$ npm install --save @nestjs/bull bull

```

安装过程完成后，将 `BullModule` 导入到根 `AppModule` 中。

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

`forRoot()` 方法注册一个 `bull` 配置对象，所有在应用程序中注册的队列都使用此配置对象（除非另有指定）。配置对象包含以下属性（全部可选）：

- `limiter: RateLimiter` - 控制队列任务处理速率的选项。有关更多信息，请参阅 [RateLimiter](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queue)。
- `redis: RedisOpts` - 配置 Redis 连接的选项。有关更多信息，请参阅 [RedisOpts](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queue)。
- `prefix: string` - 所有队列键的前缀。
- `defaultJobOptions: JobOpts` - 控制新任务默认设置的选项。有关更多信息，请参阅 [JobOpts](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queueadd)。
- `settings: AdvancedSettings` - 高级队列配置设置。通常不应更改。有关更多信息，请参阅 [AdvancedSettings](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queue)。

这些选项直接传递给 Bull `Queue` 构造函数。有关详细信息，请参阅 [Queue section of the Bull reference](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queue)。

要注册一个队列，请按如下方式导入 `BullModule.registerQueue()` 动态模块：

```typescript
BullModule.registerQueue({
  name: 'audio',
});

```

> info **提示** 通过向 `registerQueue()` 方法传递多个配置对象（作为单独的参数）来创建多个队列。

`registerQueue()` 方法实例化和/或注册队列。队列在连接到具有相同凭据的相同底层 Redis 数据库的模块和进程之间共享。每个队列由其 `name` 属性标识。队列名称既用作注入令牌（用于将队列注入到控制器和提供者中），也是关联消费者类和监听器的装饰器参数。

您还可以按如下方式覆盖特定队列的一些预配置选项：

```typescript
BullModule.registerQueue({
  name: 'audio',
  redis: {
    port: 6380,
  },
});

```

由于任务存储在 Redis 中，每当实例化一个命名队列时（例如，应用程序启动或重启时），它都会尝试处理来自先前未完成会话遗留的任何旧任务。

每个队列可以有一个或多个生产者、消费者和监听器。消费者按特定顺序从队列中检索任务：FIFO（默认）、LIFO 或按优先级。<a href="application/queues#job-options">job 选项</a> 部分解释了如何控制处理顺序。

<app-banner-enterprise></app-banner-enterprise>

#### 命名配置

如果您的队列连接到多个 Redis 实例，您可以使用**命名配置**技术。此功能允许您在指定的键下注册多个配置，然后可以在队列选项中引用它们。

例如，假设您的应用程序中使用的（除了默认的之外）还有一个额外的 Redis 实例，您可以按如下方式注册其配置：

```typescript
BullModule.forRoot('alternative-config', {
  redis: {
    port: 6381,
  },
});

```

在上面的示例中，`'alternative-config'` 是一个配置键（可以是任何字符串）。

您现在可以在 `registerQueue()` 选项对象中指向此配置：

```typescript
BullModule.registerQueue({
  configKey: 'alternative-config',
  name: 'video',
});

```

#### 生产者

任务生产者将任务添加到队列中。生产者通常是应用程序服务（Nest [providers](/overview/providers)）。要向队列添加任务，首先将队列注入到服务中：

```typescript
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';

@Injectable()
export class AudioService {
  constructor(@InjectQueue('audio') private audioQueue: Queue) {}
}

```

> info **提示** `@InjectQueue()` 装饰器通过 `registerQueue()` 方法调用中提供的名称来识别队列（例如，`'audio'`）。

现在，通过调用队列的 `add()` 方法来添加任务，并传入一个用户定义的数据对象。任务数据必须是可序列化的，因为任务存储在 Redis 中。数据的形状是任意的；请使用它来表示您任务的语义。

```typescript
const job = await this.audioQueue.add({
  foo: 'bar',
});

```

#### 命名任务

任务可以有名称。这允许您创建专门的 <a href="application/queues#消费者">消费者</a>，它们只处理具有给定名称的任务。

```typescript
const job = await this.audioQueue.add('transcode', {
  foo: 'bar',
});

```

> warning **警告** 当使用命名任务时，您必须为添加到队列的每个唯一名称创建一个处理器，否则队列会报告缺少给定任务的处理器。有关消费命名任务的更多信息，请参阅 <a href="application/queues#消费者">消费者</a>。

#### 任务选项

任务可以关联额外的选项。在 `Queue.add()` 方法中，在任务数据之后传入一个选项对象。任务选项包括：

- `priority`: `number` - 可选的优先级值。范围从 1（最高优先级）到 MAX_INT（最低优先级）。使用优先级会对性能产生轻微影响，因此请谨慎使用。
- `delay`: `number` - 等待此任务可被处理的时间（毫秒）。为实现准确的延迟，服务器和客户端的时钟都应同步。
- `attempts`: `number` - 尝试处理此任务的总次数。
- `repeat`: `RepeatOpts` - 根据 cron 规范重复任务。参见 [RepeatOpts](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queueadd)。
- `backoff`: `number | BackoffOpts` - 如果任务失败时的自动重试的退避设置。参见 [BackoffOpts](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queueadd)。
- `lifo`: `boolean` - 如果设置为此值，则将任务添加到队列的右端而不是左端（默认是 `false`）。
- `timeout`: `number` - 任务在超过此毫秒数后以超时错误失败。
- `jobId`: `number | string` - 覆盖任务 ID。默认情况下，任务 ID 是一个唯一的整数。如果使用此选项，您需要确保 ID 是唯一的。已存在的 ID 的任务不会被添加。
- `removeOnComplete`: `boolean | number` - 如果设置为此值，则任务成功完成后从队列中移除。一个数字指定要保留多少个任务。默认情况下，任务保留在已完成集合中。
- `removeOnFail`: `boolean | number` - 如果设置为此值，则任务在所有尝试失败后从队列中移除。一个数字指定要保留多少个任务。默认情况下，任务保留在失败集合中。
- `stackTraceLimit`: `number` - 限制记录失败任务的堆栈跟踪行数。

以下是使用任务选项自定义任务的示例。

要延迟任务的开始，请使用 `delay` 属性。

```typescript
const job = await this.audioQueue.add(
  {
    foo: 'bar',
  },
  { delay: 3000 }, // 3 seconds delayed
);

```

要将任务添加到队列的右端（即按 **LIFO**，后进先出处理），请将 `lifo` 属性设置为 `true`。

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

消费者是一个 **类**，定义了处理添加到队列中的任务、监听队列事件或两者的方法。使用 `@Processor()` 装饰器声明消费者类如下：

```typescript
import { Processor } from '@nestjs/bull';

@Processor('audio')
export class AudioConsumer {}

```

> info **提示** 消费者必须注册为 `providers`，以便 `@nestjs/bull` 包可以拾取它们。

装饰器的字符串参数（例如 `'audio'`）是与类方法关联的队列名称。

在消费者类内部，通过使用 `@Process()` 装饰器装饰处理方法来声明任务处理器。

```typescript
import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';

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

被装饰的方法（例如 `transcode()`）在工作进程空闲且队列中有任务时被调用。它接收 `job` 对象作为其唯一参数。它返回的值存储在任务对象中，之后可以访问，例如在监听 `completed` 事件时。

`Job` 对象具有多个方法，允许您与其状态交互。例如，上面的代码使用 `progress()` 方法来更新任务进度。有关完整的 `Job` API，请参阅 [Job section of the Bull reference](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#job)。

您可以通过将该 `name` 传递给 `@Process()` 装饰器，指定一个任务处理器方法**仅**处理特定类型的任务（具有特定 `name` 的任务），如下所示。一个消费者类可以有多个 `@Process()` 处理器，每个任务类型（`name`）对应一个。当使用命名任务时，请确保为每个名称都有一个处理器。

```typescript
@Process('transcode')
async transcode(job: Job<unknown>) { ... }

```

> warning **警告** 当您为同一队列定义多个消费者时，`@Process({ concurrency: 1 })` 中的 `concurrency` 选项不会生效。最小 `concurrency` 匹配定义的消费者数量。即使 `@Process()` 处理器使用不同的名称来处理命名任务，这也适用。

#### 请求作用域消费者

当消费者被标记为请求作用域时（参见 [injection scopes](/fundamentals/provider-scopes#提供者作用域)），会为每个任务创建一个新的类实例。该实例在任务完成后被垃圾回收。

```typescript
@Processor({
  name: 'audio',
  scope: Scope.REQUEST,
})

```

由于请求作用域的消费者类是动态实例化并作用于单个任务的，您可以使用 `JOB_REF` 令牌通过构造函数注入当前任务。

```typescript
constructor(@Inject(JOB_REF) jobRef: Job) {
  console.log(jobRef);
}

```

> info **提示** `JOB_REF` 令牌是从 `@nestjs/bull` 包导入的。

#### 事件监听器

当队列和/或任务状态发生变化时，Bull 会发出一组事件。`@nestjs/bull` 包导出了一个装饰器集合，允许您订阅核心标准事件集。

事件监听器必须在 <a href="application/queues#消费者">消费者</a> 类中声明（即在用 `@Processor()` 装饰器装饰的类中）。要监听事件，请使用下表中的一个装饰器来声明事件处理器。例如，要监听任务进入 `audio` 队列的活动状态时发出的事件，请使用以下结构：

```typescript
import { Processor, Process, OnQueueActive } from '@nestjs/bull';
import type { Job } from 'bull';

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

由于 Bull 在分布式（多节点）环境中运行，它定义了事件局部性的概念。事件可能完全在单个进程内触发，也可能在不同进程的共享队列上触发。当动作或状态变更在本地进程的队列上触发时，会产生一个**本地**事件。换句话说，当您的事件生产者和消费者局限于单个进程时，队列上发生的所有事件都是本地的。

当队列跨多个进程共享时，**全局**事件就会发挥作用。为了让一个进程中的监听器接收到由另一个进程触发的事件通知，它必须注册一个全局事件。

每当其对应的事件被发射时，事件处理器就会被调用。每个处理器都以下表所示的签名被调用，该签名提供了与事件相关的信息访问权限。本地和全局事件处理器签名之间的一个关键区别在下表下方讨论。

<table>
  <tr>
    <th>本地事件监听器</th>
    <th>全局事件监听器</th>
    <th>处理器方法签名 / 触发时机</th>
  </tr>
  <tr>
    <td><code>@OnQueueError()</code></td><td><code>@OnGlobalQueueError()</code></td><td><code>handler(error: Error)</code> - 发生了一个错误。 <code>error</code> 包含触发的错误。</td>
  </tr>
  <tr>
    <td><code>@OnQueueWaiting()</code></td><td><code>@OnGlobalQueueWaiting()</code></td><td><code>handler(jobId: number | string)</code> - 任务正在等待处理，一旦工作节点空闲就会处理。 <code>jobId</code> 包含进入此状态的任务的 ID。</td>
  </tr>
  <tr>
    <td><code>@OnQueueActive()</code></td><td><code>@OnGlobalQueueActive()</code></td><td><code>handler(job: Job)</code> - 任务 <code>job</code> 已启动。</td>
  </tr>
  <tr>
    <td><code>@OnQueueStalled()</code></td><td><code>@OnGlobalQueueStalled()</code></td><td><code>handler(job: Job)</code> - 任务 <code>job</code> 已被标记为停滞。这对于调试崩溃或暂停事件循环的任务工作节点非常有用。</td>
  </tr>
  <tr>
    <td><code>@OnQueueProgress()</code></td><td><code>@OnGlobalQueueProgress()</code></td><td><code>handler(job: Job, progress: number)</code> - 任务 <code>job</code> 的进度已更新为值 <code>progress</code>。</td>
  </tr>
  <tr>
    <td><code>@OnQueueCompleted()</code></td><td><code>@OnGlobalQueueCompleted()</code></td><td><code>handler(job: Job, result: any)</code> - 任务 <code>job</code> 已成功完成，结果为 <code>result</code>。</td>
  </tr>
  <tr>
    <td><code>@OnQueueFailed()</code></td><td><code>@OnGlobalQueueFailed()</code></td><td><code>handler(job: Job, err: Error)</code> - 任务 <code>job</code> 因原因 <code>err</code> 而失败。</td>
  </tr>
  <tr>
    <td><code>@OnQueuePaused()</code></td><td><code>@OnGlobalQueuePaused()</code></td><td><code>handler()</code> - 队列已暂停。</td>
  </tr>
  <tr>
    <td><code>@OnQueueResumed()</code></td><td><code>@OnGlobalQueueResumed()</code></td><td><code>handler()</code> - 队列已恢复。</td>
  </tr>
  <tr>
    <td><code>@OnQueueCleaned()</code></td><td><code>@OnGlobalQueueCleaned()</code></td><td><code>handler(jobs: Job[], type: string)</code> - 旧任务已从队列中清理。 <code>jobs</code> 是已清理任务的数组，<code>type</code> 是被清理任务的类型。</td>
  </tr>
  <tr>
    <td><code>@OnQueueDrained()</code></td><td><code>@OnGlobalQueueDrained()</code></td><td><code>handler()</code> - 每当队列处理完所有等待任务时（即使某些延迟任务尚未处理）都会发射此事件。</td>
  </tr>
  <tr>
    <td><code>@OnQueueRemoved()</code></td><td><code>@OnGlobalQueueRemoved()</code></td><td><code>handler(job: Job)</code> - 任务 <code>job</code> 已成功移除。</td>
  </tr>
</table>

当监听全局事件时，方法签名可能与本地对应项略有不同。具体来说，任何在本地版本中接收 `job` 对象的处理器，在全局版本中接收到的是 `jobId`（`number | string`）。要在这种情况下获取实际的 `job` 对象引用，请使用 `Queue#getJob()` 方法。此调用返回一个 promise，因此请声明处理器为 `async` 并等待它。例如：

```typescript
@OnGlobalQueueCompleted()
async onGlobalCompleted(jobId: number, result: any) {
  const job = await this.immediateQueue.getJob(jobId);
  console.log('(Global) on completed: job ', job.id, ' -> result: ', result);
}

```

> info **提示** 要访问 `Queue` 对象（以进行 `getJob()` 调用），您必须注入它。队列也必须在您注入它的模块中注册。

除了特定的事件监听器装饰器外，您还可以将通用的 `@OnQueueEvent()` 装饰器与 `BullQueueEvents` 或 `BullQueueGlobalEvents` 枚举结合使用。请参阅 [Events section of the Bull reference](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#事件) 了解有关事件的更多信息。

#### 队列管理

队列提供了一个用于管理功能（如暂停和恢复）的 API，以及检索各种状态下任务数量的接口。有关完整 API，请参阅 [Queue section of the Bull reference](https://github.com/OptimalBits/bull/blob/master/REFERENCE.md#queue)。像下面暂停和恢复示例所示，直接在 `Queue` 对象上调用这些方法。

使用 `pause()` 方法暂停队列。暂停的队列在恢复之前不会处理新任务，但正在处理的任务会继续直到完成。

```typescript
await audioQueue.pause();

```

要恢复暂停的队列，请使用 `resume()` 方法，如下所示：

```typescript
await audioQueue.resume();

```

#### 独立进程

任务处理器也可以在独立的（派生）进程中运行（请参阅 Bull 文档中的 [Separate processes](https://github.com/OptimalBits/bull#独立进程)）。这有几个优点：

- 进程是沙盒化的，因此如果它崩溃，工作进程不会受到影响。
- 您可以在不影响队列的情况下运行阻塞代码（任务不会停滞）。
- 更有效地利用多核 CPU。
- 与 Redis 的连接更少。

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

由于您的函数在派生进程中运行，因此不可用依赖注入（和 IoC 容器）。您的处理器函数必须包含（或创建）它需要的外部依赖的所有实例。

```ts
import { Job, DoneCallback } from 'bull';

export default function (job: Job, cb: DoneCallback) {
  console.log(`[${process.pid}] ${JSON.stringify(job.data)}`);
  cb(null, 'It works');
}

```

#### 异步配置

您可能希望异步而不是静态地传递 `bull` 选项。在这种情况下，请使用 `forRootAsync()` 方法，它提供了处理异步配置的几种方式。

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

该工厂的行为与其他任何 [asynchronous provider](/fundamentals/async-components) 相同（例如，它可以是 `async` 并且可以通过 `inject` 注入依赖）。

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

上述构造在 `BullModule` 内部实例化 `BullConfigService`，并调用 `createSharedConfiguration()` 来提供选项对象。这意味着 `BullConfigService` 必须实现 `SharedBullConfigurationFactory` 接口，如下所示：

```typescript
@Injectable()
class BullConfigService implements SharedBullConfigurationFactory {
  createSharedConfiguration(): BullRootModuleOptions {
    return {
      redis: {
        host: 'localhost',
        port: 6379,
      },
    };
  }
}

```

要重用从不同模块导入的提供者而不是在 `BullModule` 内部创建 `BullConfigService`，请使用 `useExisting` 语法。

```typescript
BullModule.forRootAsync({
  imports: [ConfigModule],
  useExisting: ConfigService,
});

```

此构造与 `useClass` 相同，但有一个关键区别：`BullModule` 会查找导入的模块以重用现有的 `ConfigService`，而不是实例化一个新的。

同样，要异步传递队列选项，请使用 `registerQueueAsync()` 方法。在工厂函数外部指定 `name` 属性。

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

可在 [26-queues sample](https://github.com/nestjs/nest/tree/master/sample/26-queues) 找到一个可工作的示例。