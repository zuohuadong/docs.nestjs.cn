<!-- 此文件从 content/application/task-scheduling.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T01:00:40.959Z -->
<!-- 源文件: content/application/task-scheduling.md -->
<!-- 源哈希: 191941fafa34f803edf46bd8a900e536 -->

### 任务调度

任务调度允许您在固定日期和时间、重复间隔或指定延迟后运行任意代码（方法或函数）。在 Linux 世界中，这通常由像 [cron](https://en.wikipedia.org/wiki/Cron) 这样的 OS 级工具处理。对于 Node.js 应用，有几个包模拟了类似 cron 的功能。Nest 提供了 `@nestjs/schedule` 包，它与流行的 Node.js [cron](https://github.com/kelektiv/node-cron) 包集成。本章介绍 `@nestjs/schedule` 包。

#### 安装

要开始使用它，请安装所需的依赖项。

```bash
$ npm install --save @nestjs/schedule

```

要激活任务调度，请将 `ScheduleModule` 导入到根 `AppModule` 中，并调用 `forRoot()` 静态方法，如下所示：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ScheduleModule.forRoot()
  ],
})
export class AppModule {}

```

`forRoot()` 调用初始化调度器，并注册应用中存在的任何声明式 <a href="application/task-scheduling#声明式-cron-任务">cron jobs</a>、<a href="application/task-scheduling#声明式超时">timeouts</a> 和 <a href="application/task-scheduling#声明式间隔任务">intervals</a>。调度的任务在 `onApplicationBootstrap` 生命周期钩子中启动，这确保了所有模块都已加载并声明了其调度的任务。

> 警告 **Warning** 仅在一个模块中调用 `forRoot()`。每次额外的导入都会再次注册应用中所有的 `@Cron()`、`@Interval()` 和 `@Timeout()` 处理程序，因此在三个模块中导入它会导致每个任务运行三次。

#### 声明式 cron jobs

cron job 调度一个任意函数（方法调用）自动运行。cron job 可以：

- 在指定日期和时间运行一次。
- 定期运行。重复任务可以在指定间隔内的指定瞬间运行（例如，每小时一次、每周一次、每 5 分钟一次）。

通过将 `@Cron()` 装饰器应用于包含要执行代码的方法，声明一个 cron job，如下所示：

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  @Cron('45 * * * * *')
  handleCron() {
    this.logger.debug('Called when the current second is 45');
  }
}

```

在此示例中，每当当前秒是 `45` 时都会调用 `handleCron()` 方法。换句话说，该方法每分钟运行一次，在第 45 秒时运行。

`@Cron()` 装饰器支持以下标准 [cron patterns](http://crontab.org/)：

- 星号（例如，`*`）
- 范围和列表（例如，`1-3,5`）
- 步长（例如，`*/2`）

在上面的示例中，我们向装饰器传递了 `45 * * * * *`。以下键显示了 cron 模式字符串中每个位置的解释方式：

<pre class="language-javascript"><code class="language-javascript">
* * * * * *
| | | | | |
| | | | | 星期几
| | | | 月份
| | 日期
| | 小时
| 分钟
秒（可选）
</code></pre>

一些示例 cron 模式如下：

<table>
  <tbody>
    <tr>
      <td><code>* * * * * *</code></td>
      <td>每秒</td>
    </tr>
    <tr>
      <td><code>45 * * * * *</code></td>
      <td>每分钟的第 45 秒</td>
    </tr>
    <tr>
      <td><code>0 10 * * * *</code></td>
      <td>每小时，在第 10 分钟开始时</td>
    </tr>
    <tr>
      <td><code>0 */30 9-17 * * *</code></td>
      <td>每天上午 9 点到下午 5 点每 30 分钟</td>
    </tr>
   <tr>
      <td><code>0 30 11 * * 1-5</code></td>
      <td>周一至周五上午 11:30</td>
    </tr>
  </tbody>
</table>

`@nestjs/schedule` 包提供了包含常用 cron 模式的 `CronExpression` 枚举。您可以使用此枚举如下：

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  @Cron(CronExpression.EVERY_30_SECONDS)
  handleCron() {
    this.logger.debug('Called every 30 seconds');
  }
}

```

在此示例中，`handleCron()` 方法每 `30` 秒被调用一次。所有用 `@Cron()` 装饰的 方法都会自动包装在一个 `try-catch` 块中，因此如果发生异常，它将被记录到控制台。

或者，您可以向 `@Cron()` 装饰器提供一个 JavaScript `Date` 对象。这会导致任务在指定日期精确执行一次。

> 信息 **Hint** 使用 JavaScript 日期算术来相对于当前日期调度任务。例如，`@Cron(new Date(Date.now() + 10 * 1000))` 调度一个任务在应用启动后 10 秒运行。

您还可以将附加选项作为 `@Cron()` 装饰器的第二个参数提供。

<table>
  <tbody>
    <tr>
      <td><code>name</code></td>
      <td>
        允许在声明后访问和控制 cron job。
      </td>
    </tr>
    <tr>
      <td><code>timeZone</code></td>
      <td>
        指定执行时区。这会相对于您的时区修改实际时间。如果时区无效，则会抛出错误。您可以在 <a href="http://momentjs.com/timezone/">Moment Timezone</a> 网站上查看所有可用时区。
      </td>
    </tr>
    <tr>
      <td><code>utcOffset</code></td>
      <td>
        指定您的时区偏移量，而不是使用 <code>timeZone</code> 选项。不要将其与 <code>timeZone</code> 组合使用。
      </td>
    </tr>
    <tr>
      <td><code>waitForCompletion</code></td>
      <td>
        如果 <code>true</code>，则在当前的 <code>onTick</code> 回调完成之前，不会运行 cron job 的额外实例。在当前 cron job 运行时发生的任何新的计划执行都将被完全跳过。
      </td>
    </tr>
    <tr>
      <td><code>disabled</code></td>
      <td>
        如果 <code>true</code>，则任务根本不执行（默认为 <code>false</code>）。
      </td>
    </tr>
  </tbody>
</table>

```typescript
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class NotificationService {
  @Cron('* * 0 * * *', {
    name: 'notifications',
    timeZone: 'Europe/Paris',
  })
  triggerNotifications() {}
}

```

使用 <a href="/techniques/task-scheduling#动态调度模块-api">dynamic API</a>，您可以访问和控制已声明的 cron job，或者动态创建 cron job（在运行时定义其 cron 模式）。要通过 API 访问声明式 cron job，您必须通过在选项对象（装饰器的可选第二个参数）中传递 `name` 属性将该任务与名称关联起来。

#### 声明式间隔

要声明一个方法应在指定的（重复）间隔运行，请在方法定义前加上 `@Interval()` 装饰器。将间隔值作为毫秒数传递给装饰器，如下所示：

```typescript
@Interval(10000)
handleInterval() {
  this.logger.debug('Called every 10 seconds');
}

```

> info **提示** 此机制在底层使用 JavaScript `setInterval()` 函数。您也可以使用 cron job 来调度重复任务。

通过 <a href="/techniques/task-scheduling#动态调度模块-api">dynamic API</a> 从声明类外部控制您的声明式间隔，使用以下构造将间隔与名称关联起来：

```typescript
@Interval('notifications', 2500)
handleInterval() {}

```

所有用 `@Interval()` 装饰的**方法**都会自动包装在一个 `try-catch` 块中，因此如果发生异常，它将被记录到控制台。

<a href="application/task-scheduling#动态间隔">dynamic API</a> 还支持**创建**动态间隔，其中间隔的属性在运行时定义，以及**列出和删除**它们。

<app-banner-enterprise></app-banner-enterprise>

#### 声明式超时

要声明一个方法应在指定超时后运行一次，请在方法定义前加上 `@Timeout()` 装饰器。将从应用程序启动开始的时间偏移量（毫秒）传递给装饰器，如下所示：

```typescript
@Timeout(5000)
handleTimeout() {
  this.logger.debug('Called once after 5 seconds');
}

```

> info **提示** 此机制在底层使用 JavaScript `setTimeout()` 函数。

所有用 `@Timeout()` 装饰的**方法**都会自动包装在一个 `try-catch` 块中，因此如果发生异常，它将被记录到控制台。

通过 <a href="/techniques/task-scheduling#动态调度模块-api">dynamic API</a> 从声明类外部控制您的声明式超时，使用以下构造将超时与名称关联起来：

```typescript
@Timeout('notifications', 2500)
handleTimeout() {}

```

<a href="application/task-scheduling#动态超时">dynamic API</a> 还支持**创建**动态超时，其中超时的属性在运行时定义，以及**列出和删除**它们。

#### 动态调度模块 API

`@nestjs/schedule` **模块**提供了一个动态 API，用于管理声明式 <a href="application/task-scheduling#声明式-cron-任务">cron jobs</a>、<a href="application/task-scheduling#声明式超时">timeouts</a> 和 <a href="application/task-scheduling#声明式间隔任务">intervals</a>。该 API 还允许您创建和管理**动态** cron jobs、超时和间隔，其属性在运行时定义。

#### 动态 cron jobs

使用 `SchedulerRegistry` API 从代码的任何位置通过名称获取 `CronJob` 实例的引用。首先，使用标准的构造函数**依赖注入**注入 `SchedulerRegistry`：

```typescript
constructor(private schedulerRegistry: SchedulerRegistry) {}

```

> info **提示** 从 `@nestjs/schedule` 包导入 `SchedulerRegistry`。

然后在类中使用它。假设使用以下声明创建了一个 cron job：

```typescript
@Cron('* * 8 * * *', {
  name: 'notifications',
})
triggerNotifications() {}

```

使用以下方式访问此 job：

```typescript
const job = this.schedulerRegistry.getCronJob('notifications');

job.stop();
console.log(job.lastDate());

```

`getCronJob()` 方法返回命名的 cron job。返回的 `CronJob` 对象具有以下方法：

- `stop()` - 停止一个已计划运行的 job。
- `start()` - 重新启动一个已停止的 job。
- `setTime(time: CronTime)` - 停止一个 job，为其设置新时间，然后启动它。
- `lastDate()` - 返回一个 JavaScript `Date`，表示 job 的最后一次执行，如果尚未运行则返回 `null`。
- `nextDate()` - 返回一个 `DateTime` 表示的日期，表示 job 下一次执行的计划日期。
- `nextDates(count: number)` - 返回一个数组（大小为 `count`），其中包含 `DateTime` 表示的未来触发 job 执行的日期集合。`count` 默认为 0，返回一个空数组。

> info **提示** 在 `DateTime` 对象（一个 [Luxon](https://moment.github.io/luxon/) 类型）上调用 `toJSDate()` 以将其转换为等效的 JavaScript `Date`。

使用 `SchedulerRegistry#addCronJob` 方法**动态创建**一个新的 cron job，如下所示：

```typescript
addCronJob(name: string, seconds: string) {
  const job = new CronJob(`${seconds} * * * * *`, () => {
    this.logger.warn(`time (${seconds}) for job ${name} to run!`);
  });

  this.schedulerRegistry.addCronJob(name, job);
  job.start();

  this.logger.warn(
    `job ${name} added for each minute at ${seconds} seconds!`,
  );
}

```

此代码使用 `cron` 包中的 `CronJob` **类**来创建 cron job。`CronJob` 构造函数接受一个 cron 模式（如 `@Cron()` <a href="application/task-scheduling#声明式-cron-任务">装饰器</a>）作为第一个参数，以及一个在 cron 定时器触发时执行的回调作为第二个参数。`SchedulerRegistry#addCronJob` 方法接受两个参数：一个用于 `CronJob` 的名称，以及 `CronJob` 对象本身。

> warning **警告** 记住在访问它之前注入 `SchedulerRegistry`。从 `cron` 包导入 `CronJob`。

使用 `SchedulerRegistry#deleteCronJob` 方法**删除**一个命名的 cron job，如下所示：

```typescript
deleteCron(name: string) {
  this.schedulerRegistry.deleteCronJob(name);
  this.logger.warn(`job ${name} deleted!`);
}

```

使用 `SchedulerRegistry#getCronJobs` 方法**列出**所有 cron jobs，如下所示：

```typescript
getCrons() {
  const jobs = this.schedulerRegistry.getCronJobs();
  jobs.forEach((value, key, map) => {
    let next;
    try {
      next = value.nextDate().toJSDate();
    } catch (e) {
      next = 'error: next fire date is in the past!';
    }
    this.logger.log(`job: ${key} -> next: ${next}`);
  });
}

```

`getCronJobs()` 方法返回一个 `Map`。此代码遍历映射并调用每个 `CronJob` 的 `nextDate()` 方法。在 `CronJob` API 中，如果一个 job 已经触发且没有未来的触发日期，则会抛出异常 `nextDate()`。

#### 动态间隔

使用 `SchedulerRegistry#getInterval` 方法获取一个间隔的引用。如上所述，使用标准的构造函数**依赖注入**注入 `SchedulerRegistry`：

```typescript
constructor(private schedulerRegistry: SchedulerRegistry) {}

```

然后按如下方式使用它：

```typescript
const interval = this.schedulerRegistry.getInterval('notifications');
clearInterval(interval);

```

使用 `SchedulerRegistry#addInterval` 方法**动态创建**一个新的间隔，如下所示：

```typescript
addInterval(name: string, milliseconds: number) {
  const callback = () => {
    this.logger.warn(`Interval ${name} executing at time (${milliseconds})!`);
  };

  const interval = setInterval(callback, milliseconds);
  this.schedulerRegistry.addInterval(name, interval);
}

```

此代码创建了一个标准的 JavaScript 间隔，然后将其传递给 `SchedulerRegistry#addInterval` 方法。该方法接受两个参数：间隔的名称和间隔本身。

使用 `SchedulerRegistry#deleteInterval` 方法**删除**一个命名的间隔，如下所示：

```typescript
deleteInterval(name: string) {
  this.schedulerRegistry.deleteInterval(name);
  this.logger.warn(`Interval ${name} deleted!`);
}

```

使用 `SchedulerRegistry#getIntervals` 方法**列出**所有间隔的名称，如下所示：

```typescript
getIntervals() {
  const intervals = this.schedulerRegistry.getIntervals();
  intervals.forEach(key => this.logger.log(`Interval: ${key}`));
}

```

#### 动态超时

使用 `SchedulerRegistry#getTimeout` 方法获取一个超时的引用。如上所述，使用标准的构造函数**依赖注入**注入 `SchedulerRegistry`：

```typescript
constructor(private readonly schedulerRegistry: SchedulerRegistry) {}

```

然后按如下方式使用它：

```typescript
const timeout = this.schedulerRegistry.getTimeout('notifications');
clearTimeout(timeout);

```

使用 `SchedulerRegistry#addTimeout` 方法**动态创建**一个新的超时，如下所示：

```typescript
addTimeout(name: string, milliseconds: number) {
  const callback = () => {
    this.logger.warn(`Timeout ${name} executing after (${milliseconds})!`);
  };

  const timeout = setTimeout(callback, milliseconds);
  this.schedulerRegistry.addTimeout(name, timeout);
}

```

此代码创建了一个标准的 JavaScript 超时，然后将其传递给 `SchedulerRegistry#addTimeout` 方法。该方法接受两个参数：超时的名称和超时本身。

使用 `SchedulerRegistry#deleteTimeout` 方法**删除**一个命名的超时，如下所示：

```typescript
deleteTimeout(name: string) {
  this.schedulerRegistry.deleteTimeout(name);
  this.logger.warn(`Timeout ${name} deleted!`);
}

```

使用 `SchedulerRegistry#getTimeouts` 方法**列出**所有超时的名称，如下所示：

```typescript
getTimeouts() {
  const timeouts = this.schedulerRegistry.getTimeouts();
  timeouts.forEach(key => this.logger.log(`Timeout: ${key}`));
}

```

#### 在多个实例上运行

调度器会在应用程序的每个进程中运行每个任务。在负载均衡器后有三个实例的情况下，使用 `@Cron('0 2 * * *')` 调度的任务每晚运行三次：三次发票导出，三次提醒邮件批次。

要使每个时间点只在一个实例上运行任务，请在其 `@Cron()`、`@Interval()` 或 `@Timeout()` 装饰器旁边添加来自 [`@nestjs/locks`](/reliability/locks) 的 `@OnOneInstance()`：

```typescript
import { Injectable } from '@nestjs/common';
import { OnOneInstance } from '@nestjs/locks';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class InvoicesJob {
  @Cron('0 2 * * *')
  @OnOneInstance({ key: 'invoices:nightly-export' })
  async exportInvoices() {
    // ...
  }
}

```

这些实例通过它们共享的锁存储（例如 PostgreSQL 数据库或 Redis）进行协调。第一个触发任务的实例会获取其租约，并在运行时持续续订，而其他实例则跳过其时间点而不是将任务排队。如果所有者停止，另一个实例将在其下一个时间点接管该任务。一个运行时间可能超过其间隔的任务也会获得 `@WithoutOverlapping()`，这会在前一次运行仍在进行时跳过一个时间点。[Distributed locks](/reliability/locks) 展示了如何注册模块和存储。

#### 了解 cron 任务是否实际运行

抛出异常的定时任务是一个你会听到的问题。静默地*停止调度*的定时任务（进程崩溃、容器未调度、部署推送了包含拼写错误的 `@Cron()` 表达式）是一个没人会注意到的问题，直到它生成的报告丢失。

这就是 cron 监控存在的故障模式，而 [NestJS Observe](https://www.observe.nestjs.com/ 'NestJS Observe') 在没有第三方 ping 服务或任务在退出时调用的心跳 URL 的情况下解决了这个问题。调度的运行被报告为**任务**，与队列消费者一起，每个任务都有其持续时间、结果和失败原因。当一个命名任务在您设置的容忍期内没有报告时，会触发**任务静默**警报规则，容忍期范围从 2 分钟到 7 天不等：“如果 `daily-invoices` 在过去 26 小时内没有报告，则提醒我”。

两个细节使其实用而非产生噪音。从未报告过任何内容的作用域不会触发，因此您可以在任务发送前添加规则，而不会因为尚未集成的功能而收到警报。并且规则带有重复的静音计划，因此周末合法不运行的任务不会在周六唤醒任何人。

需要报告自身进度的处理程序可以注入 `TracerService`，并在运行内部记录跨度或自定义指标。特别是指标不与跟踪相关联，因此可以从 cron 任务和生命周期钩子中报告。有关此信息，请参阅 [Manual instrumentation](/observability/manual-instrumentation)，有关设置请参阅 [Observability](/observability/overview) 章。

#### 示例

可在 [27-scheduling sample](https://github.com/nestjs/nest/tree/master/sample/27-scheduling) 查看一个可工作的示例。