<!-- 此文件从 content/techniques/task-scheduling.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-13T08:41:32.347Z -->
<!-- 源文件: content/techniques/task-scheduling.md -->
<!-- 源哈希: a2836ab29b6421497b40d8edc1b4ca06 -->

### 任务调度

任务调度允许你安排任意代码（方法/函数）在固定的日期/时间、以重复的间隔、或在指定间隔后执行一次。在 Linux 世界中，这通常由操作系统级别的包（如 [cron](https://en.wikipedia.org/wiki/Cron)）处理。对于 Node.js 应用，有几个包可以模拟类似 cron 的功能。Nest 提供了 `@nestjs/schedule` 包，它与流行的 Node.js [cron](https://github.com/kelektiv/node-cron) 包集成。我们将在本章中介绍这个包。

#### 安装

要开始使用它，我们首先安装所需的依赖。

```bash
$ npm install --save @nestjs/schedule

```

要激活任务调度，请将 `ScheduleModule` 导入到根 `AppModule` 中，并运行 `forRoot()` 静态方法，如下所示：

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

`.forRoot()` 调用会初始化调度器，并注册应用中存在的所有声明式 <a href="techniques/task-scheduling#声明式-cron-任务">定时任务</a>、<a href="techniques/task-scheduling#声明式超时">超时任务</a> 和 <a href="techniques/task-scheduling#声明式间隔任务">间隔任务</a>。注册发生在 `onApplicationBootstrap` 生命周期钩子触发时，确保所有模块都已加载并声明了任何计划任务。

#### 声明式定时任务

定时任务安排任意函数（方法调用）自动运行。定时任务可以：

- 在指定的日期/时间运行一次。
- 定期运行；定期任务可以在指定间隔内的指定时刻运行（例如，每小时一次、每周一次、每 5 分钟一次）

使用 `@Cron()` 装饰器在包含要执行代码的方法定义之前声明定时任务，如下所示：

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

在此示例中，每当当前秒数为 `45` 时，将调用 `handleCron()` 方法。换句话说，该方法将在每分钟的第 45 秒运行一次。

`@Cron()` 装饰器支持以下标准 [cron patterns](http://crontab.org/)：

- 星号（例如 `*`）
- 范围（例如 `1-3,5`）
- 步长（例如 `*/2`）

在上面的示例中，我们向装饰器传递了 `45 * * * * *`。以下键显示了 cron 模式字符串中每个位置的解释方式：

<pre class="language-javascript"><code class="language-javascript">
* * * * * *
| | | | | |
| | | | | 星期几
| | | | 月份
| | | 月份中的日期
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
      <td>每小时的第 10 分钟开始时</td>
    </tr>
    <tr>
      <td><code>0 */30 9-17 * * *</code></td>
      <td>上午 9 点到下午 5 点之间每 30 分钟</td>
    </tr>
   <tr>
      <td><code>0 30 11 * * 1-5</code></td>
      <td>周一至周五上午 11:30</td>
    </tr>
  </tbody>
</table>

`@nestjs/schedule` 包提供了一个方便的枚举，包含常用的 cron 模式。你可以按如下方式使用此枚举：

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

在此示例中，`handleCron()` 方法将每 `30` 秒调用一次。如果发生异常，它将被记录到控制台，因为每个使用 `@Cron()` 注解的方法都会自动包装在 `try-catch` 块中。

或者，你可以向 `@Cron()` 装饰器提供 JavaScript `Date` 对象。这样做会导致任务在指定日期恰好执行一次。

> info **提示** 使用 JavaScript 日期运算来安排相对于当前日期的任务。例如，`@Cron(new Date(Date.now() + 10 * 1000))` 用于安排应用启动后 10 秒运行的任务。

此外，你可以将附加选项作为第二个参数提供给 `@Cron()` 装饰器。

<table>
  <tbody>
    <tr>
      <td><code>name</code></td>
      <td>
        用于在声明后访问和控制定时任务。
      </td>
    </tr>
    <tr>
      <td><code>timeZone</code></td>
      <td>
        指定执行的时区。这将修改相对于你所在时区的实际时间。如果时区无效，则会抛出错误。你可以在 <a href="http://momentjs.com/timezone/">Moment Timezone</a> 网站上查看所有可用的时区。
      </td>
    </tr>
    <tr>
      <td><code>utcOffset</code></td>
      <td>
        这允许你指定时区的偏移量，而不是使用 <code>timeZone</code> 参数。
      </td>
    </tr>
    <tr>
      <td><code>waitForCompletion</code></td>
      <td>
        如果为 <code>true</code>，则在当前 onTick 回调完成之前，不会运行该定时任务的额外实例。当前定时任务运行期间发生的任何新的计划执行都将被完全跳过。
      </td>
    </tr>
    <tr>
      <td><code>disabled</code></td>
      <td>
        这表示任务是否会被执行。
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

你可以在声明后访问和控制定时任务，或者使用 <a href="/techniques/task-scheduling#动态调度模块-api">动态 API</a> 动态创建定时任务（其 cron 模式在运行时定义）。要通过 API 访问声明式定时任务，你必须通过在可选选项对象中传递 `name` 属性（作为装饰器的第二个参数）来将任务与名称关联。

#### 声明式间隔

要声明一个方法应以（重复的）指定间隔运行，请在方法定义前加上 `@Interval()` 装饰器。将间隔值（以毫秒为单位的数字）传递给装饰器，如下所示：

```typescript
@Interval(10000)
handleInterval() {
  this.logger.debug('Called every 10 seconds');
}

```

> info **提示** 该机制在底层使用 JavaScript 的 `setInterval()` 函数。你也可以使用定时任务来调度重复任务。

如果你想通过 <a href="/techniques/task-scheduling#动态调度模块-api">动态 API</a> 从声明类外部控制你的声明式间隔，请使用以下构造将间隔与名称关联：

```typescript
@Interval('notifications', 2500)
handleInterval() {}

```

如果发生异常，它将被记录到控制台，因为每个带有 `@Interval()` 注解的方法都会自动被包裹在 `try-catch` 块中。

<a href="techniques/task-scheduling#动态间隔">动态 API</a> 还支持**创建**动态间隔（其属性在运行时定义），以及**列出和删除**它们。

#### 声明式超时

要声明一个方法应在指定的超时时间（一次性）运行，请在方法定义前加上 `@Timeout()` 装饰器。将相对于应用程序启动的时间偏移量（以毫秒为单位）传递给装饰器，如下所示：

```typescript
@Timeout(5000)
handleTimeout() {
  this.logger.debug('Called once after 5 seconds');
}

```

> info **提示** 该机制在底层使用 JavaScript 的 `setTimeout()` 函数。

如果发生异常，它将被记录到控制台，因为每个带有 `@Timeout()` 注解的方法都会自动被包裹在 `try-catch` 块中。

如果你想通过 <a href="/techniques/task-scheduling#动态调度模块-api">动态 API</a> 从声明类外部控制你的声明式超时，请使用以下构造将超时与名称关联：

```typescript
@Timeout('notifications', 2500)
handleTimeout() {}

```

<a href="techniques/task-scheduling#动态超时">动态 API</a> 还支持**创建**动态超时（其属性在运行时定义），以及**列出和删除**它们。

#### 动态调度模块 API

`@nestjs/schedule` 模块提供了一个动态 API，允许你管理声明式 <a href="techniques/task-scheduling#声明式-cron-任务">定时任务</a>、<a href="techniques/task-scheduling#声明式超时">超时</a>和<a href="techniques/task-scheduling#声明式间隔任务">间隔</a>。该 API 还允许你创建和管理**动态**定时任务、超时和间隔，其属性在运行时定义。

#### 动态定时任务

使用 `SchedulerRegistry` API 从代码中的任何位置按名称获取 `CronJob` 实例的引用。首先，使用标准构造函数注入注入 `SchedulerRegistry`：

```typescript
constructor(private schedulerRegistry: SchedulerRegistry) {}

```

> info **提示** 从 `@nestjs/schedule` 包中导入 `SchedulerRegistry`。

然后在类中如下使用它。假设使用以下声明创建了一个定时任务：

```typescript
@Cron('* * 8 * * *', {
  name: 'notifications',
})
triggerNotifications() {}

```

使用以下方式访问此任务：

```typescript
const job = this.schedulerRegistry.getCronJob('notifications');

job.stop();
console.log(job.lastDate());

```

`getCronJob()` 方法返回指定的定时任务。返回的 `CronJob` 对象具有以下方法：

- `stop()` - 停止计划运行的任务。
- `start()` - 重新启动已停止的任务。
- `setTime(time: CronTime)` - 停止任务，为其设置新时间，然后启动它
- `lastDate()` - 返回任务上次执行日期的 `DateTime` 表示。
- `nextDate()` - 返回任务下次计划执行日期的 `DateTime` 表示。
- `nextDates(count: number)` - 提供一组将触发任务执行的未来日期的 `DateTime` 表示数组（大小为 `count`）。`count` 默认为 0，返回空数组。

> info **提示** 在 `DateTime` 对象上使用 `toJSDate()` 将它们渲染为与此 DateTime 等效的 JavaScript Date。

**创建** 使用 `SchedulerRegistry#addCronJob` 方法动态创建新的定时任务，如下所示：

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

在这段代码中，我们使用来自 `cron` 包的 `CronJob` 对象来创建定时任务。`CronJob` 构造函数将 cron 模式（就像 `@Cron()` <a href="techniques/task-scheduling#声明式-cron-任务">装饰器</a>）作为第一个参数，将 cron 定时器触发时执行的回调作为第二个参数。`SchedulerRegistry#addCronJob` 方法接受两个参数：`CronJob` 的名称和 `CronJob` 对象本身。

> warning **警告** 在访问 `SchedulerRegistry` 之前记得注入它。从 `cron` 包中导入 `CronJob`。

**删除** 使用 `SchedulerRegistry#deleteCronJob` 方法删除指定的定时任务，如下所示：

```typescript
deleteCron(name: string) {
  this.schedulerRegistry.deleteCronJob(name);
  this.logger.warn(`job ${name} deleted!`);
}

```

**列出** 使用 `SchedulerRegistry#getCronJobs` 方法列出所有定时任务，如下所示：

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

`getCronJobs()` 方法返回一个 `map`。在这段代码中，我们遍历该映射并尝试访问每个 `CronJob` 的 `nextDate()` 方法。在 `CronJob` API 中，如果任务已经触发且没有未来的触发日期，它会抛出异常。

#### 动态间隔

使用 `SchedulerRegistry#getInterval` 方法获取间隔的引用。如上所述，使用标准构造函数注入注入 `SchedulerRegistry`：

```typescript
constructor(private schedulerRegistry: SchedulerRegistry) {}

```

并按如下方式使用它：

```typescript
const interval = this.schedulerRegistry.getInterval('notifications');
clearInterval(interval);

```

**创建** 使用 `SchedulerRegistry#addInterval` 方法动态创建新的间隔，如下所示：

```typescript
addInterval(name: string, milliseconds: number) {
  const callback = () => {
    this.logger.warn(`Interval ${name} executing at time (${milliseconds})!`);
  };

  const interval = setInterval(callback, milliseconds);
  this.schedulerRegistry.addInterval(name, interval);
}

```

在这段代码中，我们创建一个标准的 JavaScript 间隔，然后将其传递给 `SchedulerRegistry#addInterval` 方法。该方法接受两个参数：间隔的名称和间隔本身。

**删除** 使用 `SchedulerRegistry#deleteInterval` 方法删除指定的间隔，如下所示：

```typescript
deleteInterval(name: string) {
  this.schedulerRegistry.deleteInterval(name);
  this.logger.warn(`Interval ${name} deleted!`);
}

```

**列出** 使用 `SchedulerRegistry#getIntervals` 方法列出所有间隔，如下所示：

```typescript
getIntervals() {
  const intervals = this.schedulerRegistry.getIntervals();
  intervals.forEach(key => this.logger.log(`Interval: ${key}`));
}

```

#### 动态超时

使用 `SchedulerRegistry#getTimeout` 方法获取超时的引用。如上所述，使用标准构造函数注入注入 `SchedulerRegistry`：

```typescript
constructor(private readonly schedulerRegistry: SchedulerRegistry) {}

```

并按如下方式使用它：

```typescript
const timeout = this.schedulerRegistry.getTimeout('notifications');
clearTimeout(timeout);

```

**创建** 使用 `SchedulerRegistry#addTimeout` 方法动态创建新的超时，如下所示：

```typescript
addTimeout(name: string, milliseconds: number) {
  const callback = () => {
    this.logger.warn(`Timeout ${name} executing after (${milliseconds})!`);
  };

  const timeout = setTimeout(callback, milliseconds);
  this.schedulerRegistry.addTimeout(name, timeout);
}

```

在这段代码中，我们创建一个标准的 JavaScript 超时，然后将其传递给 `SchedulerRegistry#addTimeout` 方法。该方法接受两个参数：超时的名称和超时本身。

**删除** 使用 `SchedulerRegistry#deleteTimeout` 方法删除指定的超时，如下所示：

```typescript
deleteTimeout(name: string) {
  this.schedulerRegistry.deleteTimeout(name);
  this.logger.warn(`Timeout ${name} deleted!`);
}

```

**列出** 使用 `SchedulerRegistry#getTimeouts` 方法列出所有超时，如下所示：

```typescript
getTimeouts() {
  const timeouts = this.schedulerRegistry.getTimeouts();
  timeouts.forEach(key => this.logger.log(`Timeout: ${key}`));
}

```

#### 了解定时任务是否实际运行

一个抛出异常的定时任务是一个你会听到的问题。一个静默*停止被调度*的定时任务——进程崩溃、容器被取消调度、部署时 `@Cron()` 表达式出现拼写错误——是一个直到它生成的报告缺失时才会被注意到的问题。

这就是定时任务监控存在的失败模式，[NestJS Observe](https://www.observe.nestjs.com/ 'NestJS Observe') 无需第三方 ping 服务或任务在退出时 curl 的心跳 URL 即可覆盖此场景。计划运行会作为**任务**报告，与队列消费者一起——每个都包含其持续时间、结果和失败原因——当指定的任务在您设置的容差范围内（从 2 分钟到 7 天）未报告时，**任务静默**告警规则会触发——*"如果 `daily-invoices` 在过去 26 小时内未报告，请提醒我"*。

两个细节使其实用而非嘈杂。从未报告过任何内容的作用域不会触发，因此您可以在任务发布之前添加规则，而不会因尚未集成的内容而被呼叫。并且规则带有循环静默计划，因此一个合法地在周末不运行的任务不会在周六唤醒任何人。

需要报告自身进度的处理器可以注入 `TracerService` 并从运行内部记录跨度或自定义指标——特别是指标不绑定到追踪，因此它们可以同样从定时任务和生命周期钩子中报告。有关内容请参阅 [Manual instrumentation](/observability/manual-instrumentation)，设置请参阅 [Observability](/observability/overview) 章节。

#### 示例

可用的工作示例位于 [here](https://github.com/nestjs/nest/tree/master/sample/27-scheduling)。