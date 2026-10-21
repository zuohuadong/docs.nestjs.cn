<!-- 此文件从 content/application/logger.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T08:36:39.393Z -->
<!-- 源文件: content/application/logger.md -->
<!-- 源哈希: c4441dc7029bbf8cb08f75c6ae358ae4 -->

### 日志记录器（Logger）

Nest 自带一个内置的日志记录器，它在应用程序引导期间以及其他若干场景中使用，例如显示捕获到的异常（即系统日志记录）。此功能由 `@nestjs/common` 包中的 `Logger` 类提供。你可以完全控制日志系统的行为，包括以下任意一项：

- 完全禁用日志记录
- 指定详细程度（例如，显示错误、警告、调试信息等）
- 配置日志消息的格式（原始、JSON、彩色等）
- 覆盖默认日志记录器中的时间戳（例如，使用 ISO 8601 标准作为日期格式）
- 完全覆盖默认日志记录器
- 通过扩展默认日志记录器来自定义它
- 使用依赖注入来简化应用程序的组合与测试

你也可以使用内置日志记录器，或创建自己的自定义实现，来记录你自己的应用级事件和消息。

内置日志记录器不仅仅是一个开发便利工具。结合 [JSON output](#json-logging)、[structured logging params](#结构化日志参数)，以及 [NestJS Observe](#correlating-logs-with-requests) 在请求期间写入的每一行所附带的 trace id，它涵盖了大多数生产应用程序对日志记录器的需求：stdout 上每行一条机器可读的记录、可查询的字段、日志级别，以及将每一行关联回写入它的请求的方式。容器平台和日志聚合器（CloudWatch、Cloud Logging、Datadog、Loki、Elasticsearch 等）会按原样摄取该输出，你的应用程序中无需额外依赖。下面的 [Logging in production](#logging-in-production) 部分展示了完整的设置。

当你需要内置日志记录器有意省略的功能时，可以求助于专门的库，例如 [Pino](https://github.com/pinojs/pino) 或 [Winston](https://github.com/winstonjs/winston)：从进程内部写入文件或其他传输目标、字段脱敏，或在日志量极大的服务上榨取最后一点吞吐量。参见 [Use external logger](#使用外部记录器)。

#### 基本自定义

要禁用日志记录，请在（可选的）Nest 应用程序选项对象中将 `logger` 属性设置为 `false`，该对象作为 `NestFactory.create()` 方法的第二个参数传入。

```typescript
const app = await NestFactory.create(AppModule, {
  logger: false,
});
await app.listen(process.env.PORT ?? 3000);

```

要启用特定的日志级别，请将 `logger` 属性设置为一个字符串数组，指定要显示的日志级别，如下所示：

```typescript
const app = await NestFactory.create(AppModule, {
  logger: ['error', 'warn'],
});
await app.listen(process.env.PORT ?? 3000);

```

数组中的值可以是 `'log'`、`'fatal'`、`'error'`、`'warn'`、`'debug'` 和 `'verbose'` 的任意组合。

> info **提示** 日志级别从数组中最严重的级别开始级联：所有至少与该级别同等严重的级别也会被启用。因此 `['log']` 也会启用 `'warn'`、`'error'` 和 `'fatal'`。严重程度较低的级别只有在被列出时才会启用，因此 `['debug', 'error']` 会启用 `'debug'`、`'error'` 和 `'fatal'`，但不会启用 `'log'` 或 `'warn'`。

要启用某个级别以及比它更严重的所有级别，请使用 `filterLogLevels()` 来构建数组，而不是手动列出各个级别。它接收一个字符串，这使它非常适合用于环境变量：

```typescript
import { filterLogLevels } from '@nestjs/common';

const app = await NestFactory.create(AppModule, {
  logger: filterLogLevels(process.env.LOG_LEVEL ?? '>=warn'), // ['warn', 'error', 'fatal']
});

```

除了 `'>=warn'` 之外，它还接受 `'>warn'`（仅比 `warn` 更严重）、诸如 `'log,error'` 这样的逗号分隔列表，或单个级别。空字符串或无法识别的字符串会返回所有级别，而在 `>` 或 `>=` 之后出现未知级别则会抛出异常。

要在应用程序创建之后更改级别（例如，在你的配置加载完成后），请向 `app.useLogger()` 传入一个级别数组。Nest 会将其交给当前日志记录器的 `setLogLevels()` 方法：

```typescript
app.useLogger(['error', 'warn']);

```

要禁用彩色输出，请传入一个 `ConsoleLogger` 实例，并将 `colors` 属性设置为 `false`，作为 `logger` 属性的值：

```typescript
const app = await NestFactory.create(AppModule, {
  logger: new ConsoleLogger({
    colors: false,
  }),
});

```

当 `NO_COLOR` 环境变量被设置为任意非空值时，颜色默认也是关闭的。

要为每条日志消息配置前缀，请传入一个 `ConsoleLogger` 实例并设置 `prefix` 属性：

```typescript
const app = await NestFactory.create(AppModule, {
  logger: new ConsoleLogger({
    prefix: 'MyApp', // Default is "Nest"
  }),
});

```

下表列出了所有可用选项：

| 选项            | 描述                                                                                                                                                                                                                                                                                                                                          | 默认值                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `logLevels`       | 启用的日志级别。 | `['log', 'fatal', 'error', 'warn', 'debug', 'verbose']` |
| `timestamp`       | 如果启用，将打印当前日志消息与上一条日志消息之间的时间戳（时间差）。注意：当启用 `json` 时，此选项不会被使用。 | `false`                                        |
| `prefix`          | 用于每条日志消息的前缀。注意：当启用 `json` 时，此选项不会被使用。 | `Nest`                                         |
| `json`            | 如果启用，将以 JSON 格式打印日志消息。 | `false`                                        |
| `colors`          | 如果启用，将以彩色打印日志消息。 | `true`（如果启用了 `json` 或设置了 `NO_COLOR`，则为 `false`） |
| `context`         | 日志记录器的上下文。 | `undefined`                                    |
| `forceConsole`    | 如果启用，将使用 `console.log`/`console.error` 而不是 `process.stdout.write`/`process.stderr.write`。在诸如 Jest 这类会缓冲控制台调用的测试环境中很有用。 | `false`                                        |
| `compact`         | 如果启用，即使日志消息是包含多个属性的对象，也会将其打印在单行中。如果设置为数字，只要所有属性都能放入 breakLength，最多 n 个内部元素会被合并到单行中。短数组元素也会被分组在一起。 | `false`（如果启用了 `json`，则为 `true`）          |
| `maxArrayLength`  | 指定格式化时要包含的 Array、TypedArray、Map、Set、WeakMap 和 WeakSet 元素的最大数量。设置为 null 或 Infinity 可显示所有元素。设置为 0 或负数则不显示任何元素。当启用 `json`、禁用颜色且 `compact` 设置为 true 时会被忽略，因为此时会生成可解析的 JSON 输出。 | `100`                                          |
| `maxStringLength` | 指定格式化时要包含的最大字符数。设置为 null 或 Infinity 可显示所有元素。设置为 0 或负数则不显示任何字符。当启用 `json`、禁用颜色且 `compact` 设置为 true 时会被忽略，因为此时会生成可解析的 JSON 输出。 | `10000`                                        |
| `sorted`          | 如果启用，将在格式化对象时对键进行排序。也可以是一个自定义排序函数。当启用 `json`、禁用颜色且 `compact` 设置为 true 时会被忽略，因为此时会生成可解析的 JSON 输出。 | `false`                                        |
| `depth`           | 指定格式化对象时的递归次数。这对于检查大型对象很有用。要递归到最大调用栈大小，请传入 Infinity 或 null。当启用 `json`、禁用颜色且 `compact` 设置为 true 时会被忽略，因为此时会生成可解析的 JSON 输出。 | `5`                                            |
| `showHidden`      | 如果为 true，对象的不可枚举符号和属性也会包含在格式化结果中。WeakMap 和 WeakSet 条目以及用户定义的原型属性也会被包含在内                                                                                                                                                             | `false`                                        |
| `breakLength`     | 输入值被拆分为多行的长度阈值。设置为 Infinity 可将输入格式化为单行（与设置为 true 的 "compact" 结合使用）。当启用 `json`、禁用颜色且 `compact` 设置为 true 时会被忽略，因为此时会生成可解析的 JSON 输出。 | 当启用 `compact` 时，或者当颜色关闭且 `compact` 未显式设置为 `false` 时为 `Infinity`；否则为 `80` | #### JSON 日志

JSON 日志对于应用程序的可观测性以及与日志管理系统的集成至关重要。要启用它，请创建一个 `ConsoleLogger` 实例，将其 `json` 属性设置为 `true`，并在创建应用程序实例时将其作为 `logger` 属性的值传入：

```typescript
const app = await NestFactory.create(AppModule, {
  logger: new ConsoleLogger({
    json: true,
  }),
});

```

此配置以结构化的 JSON 格式输出日志，这使得与日志聚合器和云平台等外部系统集成更加容易。例如，**AWS ECS**（Elastic Container Service）等平台原生支持 JSON 日志，从而支持以下功能：

- **日志过滤**：根据日志级别、时间戳或自定义元数据等字段缩小日志范围。
- **搜索与分析**：使用查询工具来分析并追踪应用程序行为的趋势。

如果你使用 [NestJS Mau](https://mau.nestjs.com)，JSON 日志还能让你以组织良好、结构化的格式查看日志，这对于调试和性能监控尤其有用。

> info **注意** 当 `json` 设置为 `true` 时，`ConsoleLogger` 默认将 `colors` 设为 `false`，将 `compact` 设为 `true`。使用这两个值时，每条记录都会通过 `JSON.stringify()` 进行序列化，因此输出是有效的 JSON，不包含任何格式化痕迹。在开发环境中，你可以显式地将 `colors` 设置为 `true`（或将 `compact` 设置为 `false`）。此时记录会使用 Node 的 `util.inspect()` 进行渲染，这在本地调试时更易读，但不再是严格的 JSON。

启用 JSON 日志后，日志输出如下所示（单行）：

```json
{
  "level": "log",
  "pid": 19096,
  "timestamp": 1607370779834,
  "message": "Starting Nest application...",
  "context": "NestFactory"
}

```

每条记录包含以下字段：

- `level`：日志级别。
- `pid`：进程 id。
- `timestamp`：记录写入的时间，以自 Unix 纪元以来的毫秒数表示。`timestamp` 和 `prefix` 选项以及 [custom timestamp format](#extend-built-in-logger) 仅适用于文本输出。
- `message`：传递给日志记录器的消息。
- `context`：日志记录器上下文（如果有）。
- `stack`：传递给 `error()` 的堆栈跟踪（如果有）。
- `params`：[structured logging params](#结构化日志参数)（如果传入了任何参数）。

与文本模式一样，`error` 级别的记录会写入 stderr，而所有其他级别则写入 stdout。

#### 结构化日志参数

日志消息通常需要携带元数据：用户 id、请求耗时、关联 id。从 NestJS v12 开始，在第一个消息参数**之后**传入的普通对象会被视为结构化参数，并附加到同一条日志记录中，而不再作为单独的日志记录输出。

```typescript
const logger = new Logger('UserService');
logger.log('User created', { userId: 1, email: 'foo@bar.com' });

```

在文本模式下，这些参数会以内联方式追加到同一条格式化行中：

```plaintext
[Nest] 3785  - 02/26/2026, 10:04:41 AM     LOG [UserService] User created { userId: 1, email: 'foo@bar.com' }

```

当传入多个普通对象时，它们会被合并为一组参数：

```typescript
logger.log('Request handled', { method: 'GET' }, { path: '/api', duration: 42 });

```

```plaintext
[Nest] 3785  - 02/26/2026, 10:04:41 AM     LOG [UserService] Request handled { method: 'GET', path: '/api', duration: 42 }

```

在 JSON 模式下，参数默认嵌套在 `params` 键下：

```json
{
  "level": "log",
  "pid": 3785,
  "timestamp": 1772089691769,
  "message": "User created",
  "context": "UserService",
  "params": { "userId": 1, "email": "foo@bar.com" }
}

```

若要将它们展开到 JSON 对象的根层级（某些日志聚合器更偏好这种方式），请启用 `flattenParams`：

```typescript
new ConsoleLogger({ json: true, flattenParams: true });

```

```json
{
  "level": "log",
  "pid": 3785,
  "timestamp": 1772089691769,
  "message": "User created",
  "context": "UserService",
  "userId": 1,
  "email": "foo@bar.com"
}

```

相关的 `ConsoleLogger` 选项如下：

| 选项             | 描述                                                                                                   | 默认值 |
| ------------------ | ------------------------------------------------------------------------------------------------------------- | ------- |
| `structuredParams` | 如果启用，则在消息之后记录的普通对象会作为参数附加到同一条记录中。                  | `true`  |
| `flattenParams`    | 如果启用，参数会被展开到 JSON 记录的根层级，而不是嵌套在 `params` 下。如果某个参数的键已被该记录使用（例如 `message` 或 `level`），则该参数会被丢弃。仅适用于 JSON 模式；需要 `structuredParams`。 | `false` |

> info **提示** 只有**普通对象**会被视为参数。数组、字符串、数字、类实例以及 `null` 仍会作为单独的消息记录（作为*最后一个*参数传入的字符串仍会被视为上下文），而作为*第一个*参数传入的普通对象仍会被视为消息本身。将 `structuredParams: false` 设置为该值可恢复 v12 之前的行为。

#### 生产环境中的日志记录

综合起来，仅凭内置日志记录器，JSON 输出和结构化参数就能为你提供生产级日志：

```typescript
// main.ts
const app = await NestFactory.create(AppModule, {
  logger: new ConsoleLogger({
    json: true,
    logLevels: ['log', 'warn', 'error', 'fatal'],
  }),
});

```

```typescript
// orders.service.ts
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  async capture(order: Order) {
    // ...
    this.logger.log('Payment captured', { orderId: order.id, amount: order.total });
  }
}

```

安装 [NestJS Observe](#correlating-logs-with-requests) 后，请求期间写入的每一行日志还会携带该请求的 trace id，而无需更改任何一次日志调用：

```json
{"level":"log","pid":66803,"timestamp":1789978166281,"message":"Payment captured","context":"OrdersService","params":{"orderId":"ord_8f2a","amount":4200},"traceId":"0199a3f2-7c1e-7b40-9d2a-5e8f1c3b7a64"}

```

这一行日志可以按级别和上下文进行过滤，可以按 `orderId` 进行查询，并且可以与来自同一请求的所有其他行进行关联——这正是大多数团队安装第三方日志记录器所要完成的工作。像这样将日志写入 stdout，让平台（Docker、Kubernetes、ECS、Cloud Run 等）来收集和传输它们。这样就能将轮转、缓冲和投递从你的应用程序进程中剥离出去。

> info **提示** 如果你的聚合器只索引顶层字段，请设置 `flattenParams: true`，这样 `orderId` 就会成为根层级字段，而不是 `params.orderId`。

#### 使用日志记录器进行应用程序日志记录

你可以结合上述多种技术，在 Nest 系统日志和你自己的应用程序事件/消息日志中提供一致的行为和格式。

一个好的做法是在每个服务中实例化来自 `@nestjs/common` 的 `Logger` 类，并将服务名称作为 `Logger` 构造函数的 `context` 参数传入：

```typescript
import { Logger, Injectable } from '@nestjs/common';

@Injectable()
class MyService {
  private readonly logger = new Logger(MyService.name);

  doSomething() {
    this.logger.log('Doing something...');
  }
}

```

在默认的日志记录器实现中，`context` 会以方括号形式打印，如下例中的 `NestFactory`：

```bash
[Nest] 19096  - 12/08/2019, 7:12:59 AM     LOG [NestFactory] Starting Nest application...

```

如果构建一条消息的代价很高，可以改为传入一个返回该消息的函数。在默认的文本格式中，内置的 `ConsoleLogger` 仅在该级别启用时才会调用该函数，因此一条被禁用的 `debug` 日志不会产生任何开销：

```typescript
this.logger.debug(() => `Cache state: ${JSON.stringify(this.cache.dump())}`);

```

如果你通过 `app.useLogger()` 提供自定义日志记录器，Nest 会在内部使用它，而通过 `Logger` 实例进行的调用会被委托给它。你的代码保持与具体实现无关，并且你可以通过调用 `app.useLogger()` 用自己的日志记录器替换默认日志记录器。

例如，如果你按照下面 <a href="application/logger#依赖注入">依赖注入</a> 一节中的步骤操作并调用 `app.useLogger(app.get(MyLogger))`，那么后续从 `MyService` 对 `this.logger.log()` 的调用将导致调用 `MyLogger` 实例的 `log()` 方法。

这适用于大多数情况。如果你需要更多自定义（例如添加并调用自定义方法），请参阅 <a href="application/logger#注入自定义日志记录器">注入自定义日志记录器</a> 一节。

#### 带时间戳的日志

要为每条记录的日志消息打印时间戳差值，请在创建日志记录器实例时传入可选的 `timestamp: true` 设置：

```typescript
import { Logger, Injectable } from '@nestjs/common';

@Injectable()
class MyService {
  private readonly logger = new Logger(MyService.name, { timestamp: true });

  doSomething() {
    this.logger.log('Doing something with timestamp here ->');
  }
}

```

这将产生以下格式的输出：

```bash
[Nest] 19096  - 04/19/2024, 7:12:59 AM     LOG [MyService] Doing something with timestamp here -> +5ms

```

请注意行尾的 `+5ms`。它是自进程中任意 `ConsoleLogger`（而不仅仅是此日志记录器）写入上一行以来所经过的时间。

#### 自定义实现

你可以通过将 `logger` 属性设置为一个满足 `LoggerService` 接口的对象，为 Nest 提供一个用于系统日志记录的自定义日志记录器实现。例如，你可以让 Nest 使用全局 JavaScript `console` 对象（它实现了 `LoggerService` 接口），如下所示：

```typescript
const app = await NestFactory.create(AppModule, {
  logger: console,
});
await app.listen(process.env.PORT ?? 3000);

```

要实现你自己的自定义日志记录器，请实现 `LoggerService` 接口的每个方法，如下所示：

```typescript
import { LoggerService, LogLevel, Injectable } from '@nestjs/common';

@Injectable()
export class MyLogger implements LoggerService {
  /**
   * Write a 'log' level log.
   */
  log(message: any, ...optionalParams: any[]) {}

  /**
   * Write a 'fatal' level log.
   */
  fatal(message: any, ...optionalParams: any[]) {}

  /**
   * Write an 'error' level log.
   */
  error(message: any, ...optionalParams: any[]) {}

  /**
   * Write a 'warn' level log.
   */
  warn(message: any, ...optionalParams: any[]) {}

  /**
   * Write a 'debug' level log.
   */
  debug?(message: any, ...optionalParams: any[]) {}

  /**
   * Write a 'verbose' level log.
   */
  verbose?(message: any, ...optionalParams: any[]) {}

  /**
   * Set the enabled log levels. Called by `app.useLogger()`
   * when it's given an array of levels.
   */
  setLogLevels?(levels: LogLevel[]) {}
}

```

然后，你可以通过 Nest 应用程序选项对象的 `logger` 属性提供一个 `MyLogger` 实例：

```typescript
const app = await NestFactory.create(AppModule, {
  logger: new MyLogger(),
});
await app.listen(process.env.PORT ?? 3000);

```

这种技术虽然简单，但没有为 `MyLogger` 类使用依赖注入。这可能会带来挑战，尤其是在测试方面，并且限制了 `MyLogger` 的可复用性。如需更好的解决方案，请参阅下面的 <a href="application/logger#依赖注入">依赖注入</a> 一节。

#### 扩展内置日志记录器

与其从头编写日志记录器，你或许可以通过扩展内置的 `ConsoleLogger` 类并重写默认实现的选定行为来满足需求：

```typescript
import { ConsoleLogger } from '@nestjs/common';

export class MyLogger extends ConsoleLogger {
  error(message: any, stack?: string, context?: string) {
    // add your tailored logic here
    super.error(...arguments);
  }
}

```

同样的方法也可以更改时间戳格式。例如，要打印 ISO 8601 时间戳而不是本地化格式的日期，请重写受保护的 `getTimestamp()` 方法：

```typescript
import { ConsoleLogger } from '@nestjs/common';

export class IsoTimestampLogger extends ConsoleLogger {
  protected getTimestamp() {
    return new Date().toISOString();
  }
}

```

```bash
[Nest] 19096  - 2026-09-28T06:46:17.869Z     LOG [NestFactory] Starting Nest application...

```

这仅适用于文本输出。使用 [JSON logging](#json-logging) 时，`timestamp` 字段始终是自 Unix 纪元以来的毫秒数。

你可以如上面的 <a href="application/logger#将记录器用于应用程序日志记录">将日志记录器用于应用程序日志记录</a> 一节所述，在功能模块中使用这样的扩展日志记录器。

你可以通过应用程序选项对象的 `logger` 属性传入扩展日志记录器的实例（如上面的 <a href="application/logger#自定义实现">自定义实现</a> 一节所示），或使用下面的 <a href="application/logger#依赖注入">依赖注入</a> 一节中展示的技术，让 Nest 使用你的扩展日志记录器进行系统日志记录。如果这样做，请如上面的示例代码所示调用 `super`，将 log 方法调用委托给父（内置）类，以便 Nest 能够依赖它所期望的内置功能。

<app-banner-courses></app-banner-courses>

#### 依赖注入

如需更高级的日志记录功能，请利用依赖注入。例如，你可能想向日志记录器中注入一个 `ConfigService` 以对其进行自定义，进而将你的自定义日志记录器注入到其他控制器和/或提供者中。要为你的自定义日志记录器启用依赖注入，请创建一个实现 `LoggerService` 的类，并将该类作为提供者注册到模块中。例如，你可以：

1. 定义一个 `MyLogger` 类，它要么扩展内置的 `ConsoleLogger`，要么完全重写它，如前面几节所示。请务必实现 `LoggerService` 接口。
2. 如下所示创建一个 `LoggerModule`，并从该模块提供 `MyLogger`。

```typescript
import { Module } from '@nestjs/common';
import { MyLogger } from './my-logger.service.js';

@Module({
  providers: [MyLogger],
  exports: [MyLogger],
})
export class LoggerModule {}

```

通过这种构造，你的自定义日志记录器可供任何其他模块使用。由于你的 `MyLogger` 类是一个模块的一部分，它可以使用依赖注入（例如注入一个 `ConfigService`）。还需要一步，Nest 才能将此自定义日志记录器用于系统日志记录（例如用于引导和错误处理）。

由于应用程序实例化（`NestFactory.create()`）发生在任何模块的上下文之外，它不参与正常的初始化依赖注入阶段。因此，你必须确保至少有一个应用程序模块导入了 `LoggerModule`，这会触发 Nest 实例化 `MyLogger` 类的单例实例。

然后，你可以使用以下构造指示 Nest 使用 `MyLogger` 的同一个单例实例：

```typescript
const app = await NestFactory.create(AppModule, {
  bufferLogs: true,
});
app.useLogger(app.get(MyLogger));
await app.listen(process.env.PORT ?? 3000);

```

> info **注意** 在上面的示例中，`bufferLogs` 被设置为 `true`，以便所有日志都保存在缓冲区中，直到附加了自定义日志记录器（此处为 `MyLogger`）。启用 `autoFlushLogs`（默认值）时，Nest 会自行刷新缓冲区：HTTP 应用程序（或微服务）在 `app.listen()` 中开始监听时会刷新它，而独立的 [application context](/standalone-applications) 在你调用 `app.useLogger()` 时会刷新它。如果初始化失败，Nest 会立即刷新它。当 Nest 无法创建提供者时（例如因为其工厂抛出异常），它会回退到原始的 `ConsoleLogger` 来打印缓冲区和错误。当诸如 `onModuleInit()` 之类的生命周期钩子被拒绝时，Nest 会通过你附加的日志记录器（如果尚未附加任何日志记录器，则通过原始的日志记录器）打印缓冲区，但不会记录该错误：启动初始化的调用（例如 `app.listen()`）会以该错误被拒绝。将 `autoFlushLogs` 设置为 `false`，以便你自己使用 `app.flushLogs()`（或静态的 `Logger.flush()`）刷新缓冲区。

这里，`NestApplication` 实例的 `get()` 方法会检索 `MyLogger` 的单例实例。这种技术本质上是一种为 Nest 使用而“注入”日志记录器实例的方式。`app.get()` 调用依赖于该实例首先通过模块导入被实例化，如上所述。

你还可以将此 `MyLogger` 提供者注入到你的功能类中，从而确保 Nest 系统日志记录和应用程序日志记录之间的日志记录行为一致。有关更多信息，请参阅下面的 <a href="application/logger#将记录器用于应用程序日志记录">将日志记录器用于应用程序日志记录</a> 和 <a href="application/logger#注入自定义日志记录器">注入自定义日志记录器</a>。

> warning **警告** 如果提供者工厂或生命周期钩子自身调用了 `process.exit()`（例如在连接检查失败之后），或者某个启动步骤永远不会结束（例如不断重试的连接），则缓冲区中的任何内容都不会被打印，即使你使用 `Ctrl+C` 停止进程也是如此。请改为抛出错误，以便初始化失败并且 Nest 刷新缓冲区。

当启动日志必须始终可见时（即使进程退出或停滞），不要缓冲它们：如 [Custom implementation](#自定义实现) 所示，将日志记录器实例作为 `NestFactory.create()` 的 `logger` 选项传入，以便 Nest 在记录每一行时立即将其交给它。该实例是在依赖注入系统之外创建的，因此它无法注入诸如 `ConfigService` 之类的提供者。

#### 注入自定义日志记录器

首先，使用如下代码扩展内置日志记录器。`scope` 选项作为 `ConsoleLogger` 子类的配置元数据提供，它指定了 [transient](/fundamentals/provider-scopes) 作用域，以便每个消费者都获得自己的日志记录器实例。这一点很重要，因为每个模块都通过 `setContext()` 在其日志记录器上设置唯一的上下文——如果使用单例，该调用会覆盖整个应用程序中的上下文。在本示例中，我们不会扩展各个 `ConsoleLogger` 方法（例如 `log()`、`warn()` 等），不过你可以选择这样做。

```typescript
import { Injectable, Scope, ConsoleLogger } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class MyLogger extends ConsoleLogger {
  customLog() {
    this.log('Please feed the cat!');
  }
}

```

接下来，像这样创建一个 `LoggerModule`：

```typescript
import { Module } from '@nestjs/common';
import { MyLogger } from './my-logger.service.js';

@Module({
  providers: [MyLogger],
  exports: [MyLogger],
})
export class LoggerModule {}

```

接下来，将 `LoggerModule` 导入到你的功能模块中。由于 `MyLogger` 扩展了 `ConsoleLogger`，你可以使用它的 `setContext()` 方法，并开始使用具备上下文感知能力的自定义日志记录器，如下所示：

```typescript
import { Injectable } from '@nestjs/common';
import { MyLogger } from './my-logger.service.js';

@Injectable()
export class CatsService {
  private readonly cats: Cat[] = [];

  constructor(private myLogger: MyLogger) {
    // Due to transient scope, CatsService has its own unique instance of MyLogger,
    // so setting context here will not affect other instances in other services
    this.myLogger.setContext('CatsService');
  }

  findAll(): Cat[] {
    // You can call all the default methods
    this.myLogger.warn('About to return cats!');
    // And your custom methods
    this.myLogger.customLog();
    return this.cats;
  }
}

```

`MyLogger` 还继承了 `ConsoleLogger` API 的其余部分：`resetContext()` 恢复传递给构造函数的上下文，而 `isLevelEnabled('debug')` 告诉你某个级别当前是否启用，这样你就可以跳过为将被丢弃的日志行准备数据。

最后，在你的 `main.ts` 文件中指示 Nest 使用自定义日志记录器的实例，如下所示。本示例没有自定义日志记录器行为（通过重写 `ConsoleLogger` 方法，如 `log()`、`warn()` 等），因此这一步在这里并非严格必需。如果你向这些方法添加了自定义逻辑，并希望 Nest 使用相同的实现，那么它**确实**是必需的。

```typescript
const app = await NestFactory.create(AppModule, {
  bufferLogs: true,
});
app.useLogger(new MyLogger());
await app.listen(process.env.PORT ?? 3000);

```

> info **提示** 或者，除了将 `bufferLogs` 设置为 `true` 之外，你还可以使用 `logger: false` 选项临时禁用日志记录器。请注意，如果你将 `logger: false` 传递给 `NestFactory.create()`，在你调用 `useLogger()` 之前不会记录任何内容，因此你可能会错过重要的初始化错误。如果你不介意一些初始消息使用默认日志记录器记录，可以省略 `logger: false` 选项。

#### 将日志与请求关联起来

集中式日志解决的是存储问题，而不是排查问题。一旦每个实例都将日志发送到同一个地方，困难的部分就变成了从数千行交错的日志中重建*单个*请求。这就是为什么如此多的生产环境调试工作实际上是在发明一个关联 id，将其贯穿到每一次日志调用中，并祈祷路径上没有任何环节忘记传递它。

[NestJS Observe](https://www.observe.nestjs.com/ 'NestJS Observe') 消除了这种簿记工作。开启 `forwardLogs` 后，通过 Nest 的 `Logger` 写入的每一行日志都会被捕获，并已附带其写入时所处的 trace：

```typescript
ObserveModule.forRoot({
  serviceId: 'orders-api',
  forwardLogs: true,
});

```

你仍然像以前一样使用 `orderId` 参数调用 `this.logger.log()`：无需生成关联 id，也无需将上下文对象贯穿到你的服务层。在执行页面上，该单个请求的日志随后会被放置在 trace 自己的时间轴上，每一行都紧挨着它被写入时正在进行的 span，因此“重试警告是在超时*之前*触发的，而不是之后”这件事你可以直接看到，而不必从三个日志流的时间戳中推断。

结构化日志参数也会被保留下来，因此 `orderId` 仍然是一个可查询的字段，而不会被扁平化到消息文本中。日志行本身也可以设置告警，例如：“当 `payment declined` 在 15 分钟内出现超过 10 次时告诉我”。

如果你更愿意将日志内容保留在你自己的聚合器中，则不必转发任何内容。即使关闭 `forwardLogs`，SDK 也会增强 `ConsoleLogger`，使请求期间写入的每一行都携带该请求的 trace id：在默认格式中位于行尾（`   Trace ID: <id>`，在消息之后），而在启用 [JSON logging](#json-logging) 时则作为 `traceId` 字段：

```json
{"level":"log","pid":66803,"timestamp":1789978166281,"message":"Payment captured","context":"OrdersService","traceId":"0199a3f2-7c1e-7b40-9d2a-5e8f1c3b7a64"}

```

有了这个 id，就足以从你现有技术栈中的某一行跳转到仪表板中的完整 trace。它默认开启，并由 `attachTraceIdToLogs` 选项控制（参见 [Trace correlation](/observability/sdk#追踪关联)）。在请求之外写入的行（例如在启动引导期间）保持原样。该增强仅适用于 Nest 内置的 `ConsoleLogger`，因此如果你用 [external logger](#使用外部记录器) 替换它，请使用 `TracerService.currentTraceId()` 自行读取该 id。有关转发及其脱敏设置，请参阅 [SDK reference](/observability/sdk#logs)。

trace id 并不是唯一在请求持续期间存在的东西。SDK 会为它插桩的每个请求、任务和消息维护一个 `AsyncLocalStorage` 存储，而 `TracerService` 通过 `setAttribute()` 和 `getAttribute()` 将其暴露出来。这是存放请求所代表的用户或租户的自然位置，可以从下游任何地方读取，而无需将其贯穿到每一次调用中。请参阅 [Request-scoped attributes](/observability/manual-instrumentation#request-scoped-attributes)，以及 [Async local storage](/recipes/async-local-storage) 配方，了解它与你自己设置的存储相比如何。

#### 使用外部日志记录器

正如 [Logging in production](#logging-in-production) 所示，内置日志记录器已经为大多数应用程序提供了结构化、集中式日志记录。但某些需求仍然需要专门的库，例如 [Pino](https://github.com/pinojs/pino) 或 [Winston](https://github.com/winstonjs/winston)：多个进程内传输方式（文件、syslog、HTTP）、敏感字段脱敏、自定义序列化器，或者在高日志量服务上尽可能低的开销。与任何标准 Node.js 应用程序一样，你可以在 Nest 中充分利用这类模块：按照 [Custom implementation](#自定义实现) 中所述实现 `LoggerService` 接口，或使用社区集成。