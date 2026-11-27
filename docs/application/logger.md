<!-- 此文件从 content/application/logger.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T23:06:51.089Z -->
<!-- 源文件: content/application/logger.md -->
<!-- 源哈希: 9c2f29ff4b4dd63f160a0ab659efd771 -->

### Logger

Nest 内置了一个日志记录器，该日志记录器在应用程序引导期间以及在其他几种情况下使用，例如显示捕获的异常（即系统日志）。此功能由 `Logger` 类在 `@nestjs/common` 包中提供。您可以完全控制日志记录系统的行为，包括以下任何一项：

- 完全禁用日志记录
- 指定详细程度级别（例如，显示错误、警告、调试信息等）
- 配置日志消息的格式（原始、JSON、彩色等）
- 覆盖默认日志记录器的时间戳（例如，使用 ISO 8601 标准作为日期格式）
- 完全覆盖默认日志记录器
- 通过扩展来自定义默认日志记录器
- 使用依赖注入来简化应用程序的组合和测试

您也可以使用内置日志记录器，或者创建自己的自定义实现，来记录您自己的应用程序级别事件和消息。

内置日志记录器不仅仅是一个开发便利功能。结合 [JSON output](#json-logging)、[structured logging params](#结构化日志参数) 以及 [NestJS Observe](#correlating-logs-with-requests) 在请求期间写入的每一行上附加的跟踪 ID，它涵盖了大多数生产应用程序对日志记录器的需求：stdout 上每行一个机器可读的记录、可查询的字段、日志级别以及将每一行追溯到写入它的请求的方式。容器平台和日志聚合器（CloudWatch、Cloud Logging、Datadog、Loki、Elasticsearch 等）会原样摄取该输出，而无需在您的应用程序中添加额外依赖。下面的 [Logging in production](#logging-in-production) 部分展示了完整的设置。

当您需要内置日志记录器故意不提供的功能时，例如在进程内部写入文件或其他传输器、自定义序列化器或在日志量很大的服务上的最后一点吞吐量，请使用专门的库，如 [Pino](https://github.com/pinojs/pino) 或 [Winston](https://github.com/winstonjs/winston)。参见 [Use external logger](#使用外部记录器)。

#### 基本自定义

要禁用日志记录，请在传递给 `NestFactory.create()` 方法的（可选）Nest 应用程序选项对象中，将 `logger` 属性设置为 `false`。

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

数组中的值可以是 `'log'`、`'fatal'`、`'error'`、`'warn'`、`'debug'` 和 `'verbose'` 的任何组合。

> info **提示** 日志级别从数组中最严重的级别级联：至少和该级别一样严重的任何级别都会被启用。因此，`['log']` 也启用 `'warn'`、`'error'` 和 `'fatal'`。只有列出的较不严重的级别才会被启用，因此 `['debug', 'error']` 启用 `'debug'`、`'error'` 和 `'fatal'`，但不启用 `'log'` 或 `'warn'`。

要启用一个级别及其所有更严重的级别，请使用 `filterLogLevels()` 而不是手动列出级别来构建数组。它接受一个字符串，这使其非常适合环境变量：

```typescript
import { filterLogLevels } from '@nestjs/common';

const app = await NestFactory.create(AppModule, {
  logger: filterLogLevels(process.env.LOG_LEVEL ?? '>=warn'), // ['warn', 'error', 'fatal']
});

```

除了 `'>=warn'`，它还接受 `'>warn'`（仅比 `warn` 更严重）、一个逗号分隔的列表，例如 `'log,error'`，或单个级别。空或未识别的字符串返回所有级别，而 `>` 或 `>=` 后的未知级别会抛出错误。

您不需要自己配置以从环境变量读取级别：当未传递任何级别时，内置的 `ConsoleLogger` 会读取 `NEST_LOG_LEVEL` 环境变量，格式相同：

```bash
NEST_LOG_LEVEL='>=warn' node dist/main.js

```

该变量在日志记录器首次检查级别时读取，而不是在导入 `@nestjs/common` 时读取，因此稍后从 `.env` 文件加载的值仍然会被拾取。代码中传递的级别（通过 `logger` 选项、`logLevels` 选项或 `app.useLogger()`）优先于它。无效的值会记录一个警告并启用所有级别。

在应用程序创建后更改级别（例如，配置加载后），请将级别的数组传递给 `app.useLogger()`。Nest 会将其传递给当前日志记录器的 `setLogLevels()` 方法：

```typescript
app.useLogger(['error', 'warn']);

```

要禁用彩色输出，请将一个实例传递给 `ConsoleLogger`，并设置 `colors` 属性为 `false` 作为 `logger` 属性的值：

```typescript
const app = await NestFactory.create(AppModule, {
  logger: new ConsoleLogger({
    colors: false,
  }),
});

```

当 `NO_COLOR` 环境变量设置为任何非空值时，默认情况下颜色也是关闭的。

要为每条日志消息配置前缀，请传递一个实例给 `ConsoleLogger`，并设置 `prefix` 属性：

```typescript
const app = await NestFactory.create(AppModule, {
  logger: new ConsoleLogger({
    prefix: 'MyApp', // Default is "Nest"
  }),
});

```

下表列出了所有可用选项：

| 选项 | 描述 | 默认值 |
| :--- | :--- | :--- |
| `logLevels` | 启用的日志级别。未设置时，从 `NEST_LOG_LEVEL` 环境变量读取。 | `['log', 'fatal', 'error', 'warn', 'debug', 'verbose']` |
| `timestamp` | 如果启用，将打印当前和上一个日志消息之间的时间戳（时间差）。注意：当启用 `json` 时，此选项不使用。 | `false` |
| `prefix` | 用于每个日志消息的前缀。注意：当启用 `json` 时，此选项不使用。 | `Nest` |
| `json` | 如果启用，将以 JSON 格式打印日志消息。 | `false` |
| `colors` | 如果启用，将以彩色打印日志消息。 | `true` (如果启用 `json` 或设置了 `NO_COLOR` 时为 `false`) |
| `context` | 日志记录器的上下文。 | `undefined` |
| `forceConsole` | 如果启用，将使用 `console.log`/`console.error` 而不是 `process.stdout.write`/`process.stderr.write`。在 Jest 等缓冲控制台调用的测试环境中很有用。 | `false` |
| `compact` | 如果启用，即使是具有多个属性的对象，也会以单行打印日志消息。如果设置为数字，则将最多 n 个内部元素合并到单行，前提是所有属性都适应 breakLength。短数组元素也会被分组。 | `false` (如果启用 `json` 时为 `true`) |
| `maxArrayLength` | 指定格式化时包含的数组、TypedArray、Map、Set、WeakMap 和 WeakSet 元素的最大数量。设置为 null 或 Infinity 以显示所有元素。设置为 0 或负数以不显示任何元素。当启用 `json`、禁用颜色且 `compact` 设置为 true 时忽略，因为它会产生可解析的 JSON 输出。 | `100` |
| `maxStringLength` | 指定格式化时包含的最大字符数。设置为 null 或 Infinity 以显示所有元素。设置为 0 或负数以不显示任何字符。当启用 `json`、禁用颜色且 `compact` 设置为 true 时忽略，因为它会产生可解析的 JSON 输出。 | `10000` |
| `sorted` | 如果启用，则在格式化对象时排序键。也可以是自定义排序函数。当启用 `json`、禁用颜色且 `compact` 设置为 true 时忽略，因为它会产生可解析的 JSON 输出。 | `false` |
| `depth` | 指定格式化对象时的递归次数。这对于检查大型对象很有用。要递归到最大调用堆栈大小，请传入 Infinity 或 null。当启用 `json`、禁用颜色且 `compact` 设置为 true 时忽略，因为它会产生可解析的 JSON 输出。 | `5` |
| `showHidden` | 如果为 true，则包含对象的不可枚举符号和属性在格式化结果中。WeakMap 和 WeakSet 条目以及用户定义的原型属性也包含在内。 | `false` |
| `redact` | 要在日志值中屏蔽的属性，可以是键名（`'password'`）或点路径（`'user.password'`）。参见 [Redacting sensitive values](#redacting-sensitive-values)。 | `undefined` |
| `breakLength` | 输入值分割到多行的长度。设置为 Infinity 以将输入格式化为单行（与 "compact" 设置为 true 结合使用）。当启用 `json`、禁用颜色且 `compact` 设置为 true 时忽略，因为它会产生可解析的 JSON 输出。 | 如果启用 `compact` 时为 `Infinity`，或者当颜色关闭且 `compact` 不是明确的 `false` 时；否则为 `80` | #### JSON 日志记录

JSON 日志记录对于应用程序可观测性和与日志管理系统的集成至关重要。要启用它，请创建一个具有 `json` 属性设置为 `true` 的 `ConsoleLogger` 实例，并在创建应用程序实例时将其作为 `logger` 属性的值传递：

```typescript
const app = await NestFactory.create(AppModule, {
  logger: new ConsoleLogger({
    json: true,
  }),
});

```

此配置以结构化 JSON 格式输出日志，使其更容易与日志聚合器和云平台等外部系统集成。例如，像 **AWS ECS** (Elastic Container Service) 这样的平台原生支持 JSON 日志，从而支持以下功能：

- **日志过滤**：根据日志级别、时间戳或自定义元数据等字段缩小日志范围。
- **搜索和分析**：使用查询工具分析和跟踪应用程序行为的趋势。

如果您使用 [NestJS Mau](https://mau.nestjs.com)，JSON 日志还允许您以组织良好、结构化的格式查看日志，这对于调试和性能监控特别有用。

> info **注意** 当 `json` 设置为 `true` 时，`ConsoleLogger` 默认将 `colors` 设置为 `false`，将 `compact` 设置为 `true`。有了这两个值，每个条目都使用 `JSON.stringify()` 进行序列化，因此输出是有效的 JSON，没有格式化伪影。对于开发，您可以显式地将 `colors` 设置为 `true`（或将 `compact` 设置为 `false`）。然后使用 Node 的 `util.inspect()` 渲染条目，这在本地调试时更容易阅读，但不再是严格的 JSON。

当启用 JSON 日志时，日志输出如下所示（单行）：

```json
{
  "level": "log",
  "pid": 19096,
  "timestamp": 1607370779834,
  "message": "Starting Nest application...",
  "context": "NestFactory"
}

```

每个条目具有以下字段：

- `level`：日志级别。
- `pid`：进程 ID。
- `timestamp`：条目写入的时间，自 Unix 纪元以来的毫秒数。`timestamp` 和 `prefix` 选项以及 [custom timestamp format](#extend-built-in-logger) 仅适用于文本输出。
- `message`：传递给日志记录器的消息。
- `context`：日志记录器上下文，如果存在。
- `stack`：传递给 `error()` 的堆栈跟踪，如果存在。
- `params`：传递的 [structured logging params](#结构化日志参数)，如果传递了任何内容。

与文本模式一样，`error` 条目写入 stderr，所有其他级别写入 stdout。

#### 结构化日志参数

日志消息通常需要携带元数据：用户 ID、请求持续时间、关联 ID。从 NestJS v12 开始，传递**在**第一个消息参数**之后**的纯对象被视为结构化参数，并附加到同一日志条目上，而不是作为单独的日志记录发出。

```typescript
const logger = new Logger('UserService');
logger.log('User created', { userId: 1, email: 'foo@bar.com' });

```

在文本模式下，参数会内联附加到同一格式化行：

```plaintext
[Nest] 3785  - 02/26/2026, 10:04:41 AM     LOG [UserService] User created { userId: 1, email: 'foo@bar.com' }

```

当传递多个纯对象时，它们会被合并到一个参数集中：

```typescript
logger.log('Request handled', { method: 'GET' }, { path: '/api', duration: 42 });

```

```plaintext
[Nest] 3785  - 02/26/2026, 10:04:41 AM     LOG [UserService] Request handled { method: 'GET', path: '/api', duration: 42 }

```

在 JSON 模式下，默认情况下参数嵌套在 `params` 键下：

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

要将它们展开到 JSON 对象的根部（一些日志聚合器更喜欢这样做），请启用 `flattenParams`：

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

| 选项 | 描述 | 默认值 |
| :--- | :--- | :--- |
| `structuredParams` | 如果启用，在消息后记录的纯对象将作为参数附加到同一条目上。 | `true` |
| `flattenParams` | 如果启用，参数将展开到 JSON 记录的根部，而不是嵌套在 `params` 下。如果参数的键记录已使用（例如 `message` 或 `level`），则会被丢弃。仅限 JSON 模式；需要 `structuredParams`。 | `false` |

> info **提示** 只有**纯对象**被视为参数。数组、字符串、数字、类实例和 `null` 仍作为单独的消息记录，（作为*最后一个*参数传递的字符串仍被视为上下文），而作为*第一个*参数传递的纯对象仍被视为消息本身。设置 `structuredParams: false` 以恢复 v12 之前的行为。

#### 隐藏敏感值

传递给日志记录器的 HTTP 客户端的头部、请求体和错误通常包含密钥。为防止它们出现在输出中，请在 `redact` 选项中列出要屏蔽的属性：

```typescript
const app = await NestFactory.create(AppModule, {
  logger: new ConsoleLogger({
    json: true,
    redact: ['password', 'authorization', 'user.token'],
  }),
});

```

```typescript
logger.log('User signed in', {
  userId: 1,
  password: 'secret',
  headers: { authorization: 'Bearer abc' },
});
// {"level":"log",...,"message":"User signed in","params":{"userId":1,"password":"[REDACTED]","headers":{"authorization":"[REDACTED]"}}}

```

不带点的名称（`password`）匹配任何深度的具有该名称的属性。带点的路径（`user.token`）匹配当通往属性的最后一个键是这些键时，无论深度如何。会跳过数组索引，因此 `users.token` 也匹配 `{ users: [{ token }] }`。键是大小写不敏感的。要使用除 `"[REDACTED]"` 以外的替换，请传递一个对象：`redact: { paths: ['password'], censor: '***' }`。

屏蔽应用于结构化参数以及非字符串消息（对象、数组和错误，包括它们的 `cause`），无论文本模式还是 JSON 模式。字符串消息、错误消息和堆栈跟踪按原样打印，因此不要在其中插值密钥。您记录的值永远不会被修改：只有通往被屏蔽属性的对象的路径上的对象会被复制。

#### 在生产环境中记录日志

综上所述，JSON 输出和结构化参数仅使用内置日志记录器即可提供生产级别的日志：

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

安装了 [NestJS Observe](#correlating-logs-with-requests) 后，在请求期间写入的每一行都带有该请求的跟踪 ID，而无需更改任何日志调用：

```json
{"level":"log","pid":66803,"timestamp":1789978166281,"message":"Payment captured","context":"OrdersService","params":{"orderId":"ord_8f2a","amount":4200},"traceId":"0199a3f2-7c1e-7b40-9d2a-5e8f1c3b7a64"}

```

该单行日志可按级别和上下文过滤，可按 `orderId` 查询，并且可以与同一请求的所有其他行关联，这正是大多数团队安装第三方日志记录器所做的工作。像这样将日志写入 stdout，然后让平台（Docker、Kubernetes、ECS、Cloud Run 等）收集和传输它们。这样可以将轮转、缓冲和交付工作从您的应用程序进程中分离出来。

> info **提示** 如果您的聚合器仅索引顶级字段，请设置 `flattenParams: true`，这样 `orderId` 就会成为根级别字段，而不是 `params.orderId`。

#### 使用日志记录器进行应用日志记录

您可以结合上述几种技术，实现在 Nest 系统日志和您自己的应用事件/消息日志中保持一致的行为和格式。

一个好的实践是在每个 **服务** 中实例化来自 `@nestjs/common` 的 `Logger` 类，并将服务名称作为 `Logger` **构造器** 的 `context` 参数提供：

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

在默认日志实现中，`context` 以方括号形式打印，如下例所示：

```bash
[Nest] 19096  - 12/08/2019, 7:12:59 AM     LOG [NestFactory] Starting Nest application...

```

如果构建一条消息成本较高，请传递一个返回该消息的函数。在默认文本格式中，内置的 `ConsoleLogger` 仅在级别启用时调用该函数，因此禁用的 `debug` 行不产生任何开销：

```typescript
this.logger.debug(() => `Cache state: ${JSON.stringify(this.cache.dump())}`);

```

如果您通过 `app.useLogger()` 提供自定义日志记录器，Nest 会在内部使用它，并通过 `Logger` 实例发出的调用将被委托给它。您的代码保持了实现无关性，可以通过调用 `app.useLogger()` 将默认日志记录器替换为您自己的实现。

例如，如果您遵循下面 <a href="application/logger#依赖注入">**依赖注入**</a> 部分的步骤并调用 `app.useLogger(app.get(MyLogger))`，则从 `MyService` 对 `this.logger.log()` 的后续调用将导致对 `MyLogger` 实例的 `log()` 方法的调用。

这适用于大多数情况。如果您需要更多的自定义（例如添加和调用自定义方法），请参阅 <a href="application/logger#注入自定义日志记录器">注入自定义日志记录器</a> 部分。

#### 带时间戳的日志

要为每条记录的消息打印时间戳差，请在创建日志记录器实例时传递可选的 `timestamp: true` 设置：

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

注意行末的 `+5ms`。它是自进程中任何 `ConsoleLogger` 写入上一行以来经过的时间，而不仅仅是此日志记录器。

#### 自定义实现

您可以通过将 `logger` 属性设置为实现 `LoggerService` 接口的对象，为 Nest 提供自定义日志记录器实现，供其用于系统日志记录。例如，您可以告诉 Nest 使用全局 JavaScript `console` 对象（它实现了 `LoggerService` 接口），如下所示：

```typescript
const app = await NestFactory.create(AppModule, {
  logger: console,
});
await app.listen(process.env.PORT ?? 3000);

```

要实现自己的自定义日志记录器，请实现 `LoggerService` 接口的每个方法，如下所示：

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

Nest 将调用的参数直接传递给您的日志记录器，因此在 `error()` 中，堆栈跟踪和上下文可以出现在相同的位置。使用上下文创建的 `Logger` 实例将其附加为最后一个参数，当仅使用消息调用 `error()` 时，它将 `undefined` 放在第一个堆栈位置：

| 调用 | `error()` 接收到的参数 |
| :--- | :--- |
| `Logger.error('Failed', err.stack)` | `[err.stack]` |
| `Logger.error('Failed', 'MyService')` | `['MyService']` |
| `new Logger('MyService').error('Failed')` | `[undefined, 'MyService']` |
| `new Logger('MyService').error('Failed', err.stack)` | `[err.stack, 'MyService']` |
| `new Logger('MyService').error(err)` | `[undefined, 'MyService']` |

只有一个参数时，它可以是其中之一。内置的 `ConsoleLogger` 在包含堆栈帧（如第一行后的缩进行 `at bootstrap (main.ts:8:9)`）时接收字符串作为堆栈跟踪，否则接收上下文。有两个参数时，顺序是堆栈跟踪（或 `undefined`）和上下文。当消息是错误时，如最后一行所示，其堆栈跟踪在错误本身上（`message.stack`）。Nest 的 **异常过滤器** 以这种方式记录未处理的异常，带有 `'ExceptionsHandler'` 上下文。

然后，您可以通过 Nest 应用选项对象的 `logger` 属性提供 `MyLogger` 实例：

```typescript
const app = await NestFactory.create(AppModule, {
  logger: new MyLogger(),
});
await app.listen(process.env.PORT ?? 3000);

```

这种技术虽然简单，但没有使用 **依赖注入** 来处理 `MyLogger` 类。这可能会带来挑战，特别是在测试方面，并限制了 `MyLogger` 的可重用性。要获得更好的解决方案，请参阅下面 <a href="application/logger#依赖注入">**依赖注入**</a> 部分。

#### 扩展内置日志记录器

与其从头编写日志记录器，不如通过扩展内置的 `ConsoleLogger` 类并重写默认实现的选定行为来满足您的需求：

```typescript
import { ConsoleLogger } from '@nestjs/common';

export class MyLogger extends ConsoleLogger {
  error(message: any, ...optionalParams: any[]) {
    // add your tailored logic here
    super.error(message, ...optionalParams);
  }
}

```

堆栈跟踪和上下文到达 `optionalParams`，如 <a href="application/logger#自定义实现">**自定义实现**</a> 部分所述。

相同的方法也改变了时间戳格式。例如，要打印 ISO 8601 时间戳而不是本地格式的日期，请重写受保护的 `getTimestamp()` 方法：

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

您可以在特征 **模块** 中使用这样一个扩展的日志记录器，如上文 <a href="application/logger#将记录器用于应用程序日志记录">使用日志记录器进行应用日志记录</a> 部分所述。

您可以通过将实例通过应用选项对象的 `logger` 属性传递给它（如上文 <a href="application/logger#自定义实现">**自定义实现**</a> 部分所示），或者使用下面 <a href="application/logger#依赖注入">**依赖注入**</a> 部分所示的技术，告诉 Nest 使用您的扩展日志记录器进行系统日志记录。如果这样做，请调用 `super`，如上述示例代码所示，将日志方法调用委托给父（内置）类，以便 Nest 可以依赖其期望的内置功能。

<app-banner-courses></app-banner-courses>

#### 依赖注入

对于更高级的日志记录功能，请利用依赖注入。例如，您可能希望将一个 `ConfigService` 注入到您的日志记录器中进行自定义，进而将您的自定义日志记录器注入到其他控制器和/或提供者中。要为您的自定义日志记录器启用依赖注入，请创建一个实现 `LoggerService` 的类，并在一个 模块 中将该类注册为提供者。例如，您可以：

1. 定义一个 `MyLogger` 类，该类要么扩展内置的 `ConsoleLogger` 要么完全覆盖它，如前几节所示。请确保实现 `LoggerService` 接口。
2. 像下面所示创建 `LoggerModule`，并从该 模块 中提供 `MyLogger`。

```typescript
import { Module } from '@nestjs/common';
import { MyLogger } from './my-logger.service.js';

@Module({
  providers: [MyLogger],
  exports: [MyLogger],
})
export class LoggerModule {}

```

通过这种构造，您的自定义日志记录器可供任何其他 模块 使用。由于您的 `MyLogger` 类是模块的一部分，它可以使用依赖注入（例如，注入一个 `ConfigService`）。还需要一个步骤，使 Nest 使用此自定义日志记录器进行系统日志记录（例如，用于引导和错误处理）。

由于应用程序实例化（`NestFactory.create()`）发生在任何模块的上下文之外，因此它不参与初始化过程中的正常依赖注入阶段。因此，您必须确保至少一个应用程序 模块 导入 `LoggerModule`，这会触发 Nest 实例化 `MyLogger` 类的单例实例。

然后，您可以使用以下构造指示 Nest 使用 `MyLogger` 的相同单例实例：

```typescript
const app = await NestFactory.create(AppModule, {
  bufferLogs: true,
});
app.useLogger(app.get(MyLogger));
await app.listen(process.env.PORT ?? 3000);

```

> info **注意** 在上面的示例中，`bufferLogs` 设置为 `true`，以便所有日志都缓存在缓冲区中，直到附加自定义日志记录器（在本例中是 `MyLogger`）。当启用 `autoFlushLogs`（默认设置）时，Nest 会自行刷新缓冲区：HTTP 应用程序（或微服务）在 `app.listen()` 开始监听时刷新它，而独立应用程序在您调用 `app.useLogger()` 时刷新它。如果初始化失败，Nest 会立即刷新它。当 Nest 无法创建提供者时（例如，因为其工厂抛出异常），它会回退到原始的 `ConsoleLogger` 来打印缓冲区和错误。当诸如 `onModuleInit()` 这样的生命周期钩子拒绝时，Nest 会通过您附加的日志记录器（或如果尚未附加则通过原始日志记录器）打印缓冲区，但不会记录错误：启动初始化（例如 `app.listen()`）的调用会随之拒绝。将 `autoFlushLogs` 设置为 `false`，您可以使用 `app.flushLogs()`（或静态 `Logger.flush()`）自行刷新缓冲区。

在这里，`NestApplication` 实例的 `get()` 方法检索 `MyLogger` 的单例实例。这种技术本质上是“注入”一个日志记录器实例供 Nest 使用的方法。`app.get()` 调用依赖于该实例首先通过模块导入被实例化，如上所述。

您还可以将此 `MyLogger` 提供者注入到您的特征类中，确保 Nest 系统日志和应用程序日志之间具有一致的日志记录行为。有关更多信息，请参阅 <a href="application/logger#将记录器用于应用程序日志记录">使用日志记录器进行应用程序日志记录</a> 和 <a href="application/logger#注入自定义日志记录器">注入自定义日志记录器</a>。

> warning **警告** 如果提供者工厂或生命周期钩子调用 `process.exit()` 本身（例如，在连接检查失败后），或者启动步骤永不确定（例如，持续重试的连接），缓冲区中的任何内容都不会打印，即使您使用 `Ctrl+C` 停止进程也是如此。请抛出错误，使初始化失败，Nest 从而刷新缓冲区。

当启动日志必须始终可见时，即使进程退出或停滞，也不要缓冲它们：像 [Custom implementation](#自定义实现) 所示，将日志记录器实例作为 `NestFactory.create()` 的 `logger` 选项传递，以便 Nest 一旦记录每一行就将其交给它。该实例是在依赖注入系统外部创建的，因此它不能注入提供者，例如 `ConfigService`。

#### 注入自定义日志记录器

首先，使用如下代码扩展内置日志记录器。作为 `ConsoleLogger` 子类的配置元数据提供的 `scope` 选项，指定了一个 [transient](/fundamentals/provider-scopes) 作用域，以便每个消费者获得自己的日志记录器实例。这很重要，因为每个模块都通过 `setContext()` 在其日志记录器上设置了唯一的上下文——如果使用单例，该调用将覆盖整个应用程序的上下文。在此示例中，我们不扩展单个 `ConsoleLogger` 方法（如 `log()`、`warn()` 等），尽管您可以选择这样做。

```typescript
import { Injectable, Scope, ConsoleLogger } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class MyLogger extends ConsoleLogger {
  customLog() {
    this.log('Please feed the cat!');
  }
}

```

接下来，创建一个具有如下构造的 `LoggerModule`：

```typescript
import { Module } from '@nestjs/common';
import { MyLogger } from './my-logger.service.js';

@Module({
  providers: [MyLogger],
  exports: [MyLogger],
})
export class LoggerModule {}

```

接下来，将 `LoggerModule` 导入到您的特征模块中。由于 `MyLogger` 扩展了 `ConsoleLogger`，您可以使用其 `setContext()` 方法并开始使用上下文感知的自定义日志记录器，如下所示：

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

`MyLogger` 也继承了 `ConsoleLogger` API 的其余部分：`resetContext()` 恢复传递给构造函数的上下文，而 `isLevelEnabled('debug')` 会告诉您当前是否启用某个级别，因此您可以跳过为将被丢弃的行准备数据。

最后，在您的 `main.ts` 文件中指示 Nest 使用自定义日志记录器的实例，如下所示。此示例不自定义日志记录器行为（不覆盖 `ConsoleLogger` 方法，如 `log()`、`warn()` 等），因此此步骤在此处并非严格必需。如果您向这些方法添加自定义逻辑并希望 Nest 使用相同的实现，则**是**必需的。

```typescript
const app = await NestFactory.create(AppModule, {
  bufferLogs: true,
});
app.useLogger(new MyLogger());
await app.listen(process.env.PORT ?? 3000);

```

> info **提示** 或者，不是将 `bufferLogs` 设置为 `true`，您可以使用 `logger: false` 选项暂时禁用日志记录器。请注意，如果您将 `logger: false` 传递给 `NestFactory.create()`，直到您调用 `useLogger()` 为止，都不会记录任何内容，因此您可能会错过重要的初始化错误。如果您不介意一些初始消息使用默认日志记录器记录，请省略 `logger: false` 选项。

#### 使用请求关联日志

集中化日志解决了存储问题，但没有解决调查问题。一旦每个实例都发送到同一位置，困难的部分就变成了从数千行交错的日志中重构*单个*请求。这就是为什么大量的生产调试实际上是发明一个关联 ID、将其穿过每一次日志调用，并希望路径上的任何部分都没有忘记传递它的工作。

[NestJS Observe](https://www.observe.nestjs.com/ 'NestJS Observe') 消除了这种簿记工作。开启 `forwardLogs`，通过 Nest 的 `Logger` 写入的每一行都会捕获其写入时的追踪信息：

```typescript
ObserveModule.forRoot({
  serviceId: 'orders-api',
  forwardLogs: true,
});

```

您像以前一样调用 `this.logger.log()` 并传入 `orderId` 参数：无需生成关联 ID，无需将上下文对象穿过您的服务层。在执行页面上，该单个请求的日志会放置在追踪自身的时钟上，每一行都紧邻写入时正在执行的跨度，因此您可以看到“重试警告在超时*之前*触发，而不是之后”，而不是从三个日志流的时间戳中推断出来。

结构化日志参数也会传递，因此 `orderId` 仍然是一个可查询的字段，而不是被扁平化到消息文本中。日志行本身也可以被告警，例如：“告诉我 `payment declined` 在 15 分钟内出现超过 10 次时通知我”。

如果您更希望将日志内容保留在您自己的聚合器中，则无需转发任何内容。即使关闭了 `forwardLogs`，SDK 也会增强 `ConsoleLogger`，使得在请求期间写入的每一行都带有该请求的追踪 ID：在默认格式（`   Trace ID: <id>`，消息之后）的行末，以及在启用 [JSON logging](#json-logging) 时的 `traceId` 字段中：

```json
{"level":"log","pid":66803,"timestamp":1789978166281,"message":"Payment captured","context":"OrdersService","traceId":"0199a3f2-7c1e-7b40-9d2a-5e8f1c3b7a64"}

```

该 ID 足以从现有堆栈中的一行跳转到仪表板中的完整追踪。它默认开启，并通过 `attachTraceIdToLogs` 选项控制（参见 [Trace correlation](/observability/sdk#追踪关联)）。在请求外部写入的行（例如在引导期间）保持不变。该增强仅适用于 Nest 的内置 `ConsoleLogger`，因此如果您用 [external logger](#使用外部记录器) 替换它，请使用 `TracerService.currentTraceId()` 手动读取 ID。有关转发及其脱敏设置，请参阅 [SDK reference](/observability/sdk#logs)。

追踪 ID 不是唯一在请求生命周期内存在的。SDK 为它所插桩的每个请求、任务和消息维护一个 `AsyncLocalStorage` 存储，并且 `TracerService` 通过 `setAttribute()` 和 `getAttribute()` 暴露它。这是用户或租户请求所操作的自然位置，可以在下游的任何地方读取，而无需将其穿过每次调用。请参阅 [Request-scoped attributes](/observability/manual-instrumentation#request-scoped-attributes)，以及 [Async local storage](/recipes/async-local-storage) 教程，了解它与您自己设置的存储的比较。

#### 使用外部日志记录器

如 [Logging in production](#logging-in-production) 所示，内置日志记录器已涵盖了大多数应用程序的结构化、集中式日志记录。仍有一些需求需要专用的库，例如 [Pino](https://github.com/pinojs/pino) 或 [Winston](https://github.com/winstonjs/winston)：多个进程内传输器（文件、syslog、HTTP）、自定义序列化器，或在日志量非常大的服务上实现最低的开销。与任何标准的 Node.js 应用程序一样，您可以在 Nest 中充分利用此类模块：实现 `LoggerService` 接口（如 [Custom implementation](#自定义实现) 所述），或使用社区集成。