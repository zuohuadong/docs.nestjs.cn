<!-- 此文件从 content/techniques/logger.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T08:53:41.134Z -->
<!-- 源文件: content/techniques/logger.md -->
<!-- 源哈希: 9720f2edc3bc953e9f16401a4009fe39 -->

### Logger

Nest 自带一个基于文本的内置日志记录器，用于应用程序启动以及显示捕获的异常（即系统日志）等其他情况。此功能通过 `Logger` 包中的 `@nestjs/common` 类提供。您可以完全控制日志系统的行为，包括以下任何一项：

- 完全禁用日志记录
- 指定日志详细级别（例如，显示错误、警告、调试信息等）
- 配置日志消息的格式（原始、JSON、彩色等）
- 覆盖默认日志记录器中的时间戳（例如，使用 ISO8601 标准作为日期格式）
- 完全覆盖默认日志记录器
- 通过扩展默认日志记录器来自定义它
- 利用依赖注入来简化应用程序的组装和测试

您还可以使用内置日志记录器，或创建自己的自定义实现，来记录您自己的应用程序级事件和消息。

如果您的应用程序需要与外部日志系统集成、自动基于文件的日志记录或将日志转发到集中式日志服务，您可以使用 Node.js 日志库实现完全自定义的日志解决方案。一个流行的选择是 [Pino](https://github.com/pinojs/pino)，以其高性能和灵活性而闻名。

#### 基本自定义

要禁用日志记录，请将（可选的）Nest 应用程序选项对象中的 `logger` 属性设置为 `false`，该对象作为第二个参数传递给 `NestFactory.create()` 方法。

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

> info **提示** Nest 中的日志级别是级联（继承）的。这意味着提供特定的日志级别（如 `'log'`）将自动包含所有更高严重性的级别（例如，`'warn'`、`'error'` 和 `'fatal'`）。

要禁用彩色输出，请将 `ConsoleLogger` 对象（其 `colors` 属性设置为 `false`）作为 `logger` 属性的值传递。

```typescript
const app = await NestFactory.create(AppModule, {
  logger: new ConsoleLogger({
    colors: false,
  }),
});

```

要为每条日志消息配置前缀，请传递设置了 `prefix` 属性的 `ConsoleLogger` 对象：

```typescript
const app = await NestFactory.create(AppModule, {
  logger: new ConsoleLogger({
    prefix: 'MyApp', // Default is "Nest"
  }),
});

```

以下是所有可用选项，列于下表中：

| 选项 | 描述 | 默认值 |
| --- | --- | --- |
| `logLevels` | 启用的日志级别。 | `['log', 'fatal', 'error', 'warn', 'debug', 'verbose']` |
| `timestamp` | 如果启用，将打印当前日志消息与上一条日志消息之间的时间戳（时间差）。注意：当启用 `json` 时，此选项不会被使用。 | `false` |
| `prefix` | 用于每条日志消息的前缀。注意：当启用 `json` 时，此选项不会被使用。 | `Nest` |
| `json` | 如果启用，将以 JSON 格式打印日志消息。 | `false` |
| `colors` | 如果启用，将以彩色打印日志消息。如果 json 被禁用，默认为 true，否则为 false。 | `true` |
| `context` | 日志器的上下文。 | `undefined` |
| `compact` | 如果启用，将以单行打印日志消息，即使它是具有多个属性的对象。如果设置为数字，只要所有属性都适合 breakLength，最多 n 个内部元素将合并为单行。短数组元素也会被分组在一起。 | `true` |
| `maxArrayLength` | 指定格式化时要包含的 Array、TypedArray、Map、Set、WeakMap 和 WeakSet 元素的最大数量。设置为 null 或 Infinity 以显示所有元素。设置为 0 或负数以不显示任何元素。当启用 `json`、禁用颜色且 `compact` 设置为 true 时忽略，因为它会产生可解析的 JSON 输出。 | `100` |
| `maxStringLength` | 指定格式化时要包含的最大字符数。设置为 null 或 Infinity 以显示所有元素。设置为 0 或负数以不显示任何字符。当启用 `json`、禁用颜色且 `compact` 设置为 true 时忽略，因为它会产生可解析的 JSON 输出。 | `10000` |
| `sorted` | 如果启用，将在格式化对象时对键进行排序。也可以是自定义排序函数。当启用 `json`、禁用颜色且 `compact` 设置为 true 时忽略，因为它会产生可解析的 JSON 输出。 | `false` |
| `depth` | 指定格式化对象时要递归的次数。这对于检查大型对象很有用。要递归到最大调用栈大小，请传递 Infinity 或 null。当启用 `json`、禁用颜色且 `compact` 设置为 true 时忽略，因为它会产生可解析的 JSON 输出。 | `5` |
| `showHidden` | 如果为 true，则对象的不可枚举符号和属性将包含在格式化结果中。WeakMap 和 WeakSet 条目以及用户定义的原型属性也会被包含。 | `false` |
| `breakLength` | 输入值被拆分为多行的长度。设置为 Infinity 以将输入格式化为单行（与 "compact" 设置为 true 结合使用）。当 "compact" 为 true 时默认为 Infinity，否则为 80。当启用 `json`、禁用颜色且 `compact` 设置为 true 时忽略，因为它会产生可解析的 JSON 输出。 | `Infinity` |

#### JSON 日志记录

JSON 日志记录对于现代应用程序的可观测性以及与日志管理系统的集成至关重要。要在 NestJS 应用程序中启用 JSON 日志记录，请配置 `ConsoleLogger` 对象，将其 `json` 属性设置为 `true`。然后，在创建应用程序实例时，将此日志器配置作为 `logger` 属性的值提供。

```typescript
const app = await NestFactory.create(AppModule, {
  logger: new ConsoleLogger({
    json: true,
  }),
});

```

此配置以结构化的 JSON 格式输出日志，使其更容易与外部系统（如日志聚合器和云平台）集成。例如，**AWS ECS**（弹性容器服务）等平台原生支持 JSON 日志，从而启用高级功能，例如：

- **日志过滤**：根据日志级别、时间戳或自定义元数据等字段轻松缩小日志范围。
- **搜索与分析**：使用查询工具分析和跟踪应用程序行为的趋势。

此外，如果您使用 [NestJS Mau](https://mau.nestjs.com)，JSON 日志记录简化了以组织良好、结构化的格式查看日志的过程，这对于调试和性能监控尤其有用。

> info **提示** 当 `json` 设置为 `true` 时，`ConsoleLogger` 会自动通过将 `colors` 属性设置为 `false` 来禁用文本着色。这确保了输出保持有效的 JSON，不包含格式伪影。但是，出于开发目的，您可以通过显式将 `colors` 设置为 `true` 来覆盖此行为。这会添加彩色 JSON 日志，使日志条目在本地调试期间更易于阅读。

启用 JSON 日志记录后，日志输出将如下所示（单行）：

```json
{
  "level": "log",
  "pid": 19096,
  "timestamp": 1607370779834,
  "message": "Starting Nest application...",
  "context": "NestFactory"
}

```

您可以在此 [Pull Request](https://github.com/nestjs/nest/pull/14121) 中看到不同的变体。

#### 结构化日志参数

日志消息通常需要携带元数据——用户 ID、请求持续时间、关联 ID。从 NestJS v12 开始，在第一个消息参数**之后**传递的普通对象被视为结构化参数，并附加到同一条日志条目中，而不是作为单独的日志记录输出。

```typescript
const logger = new Logger('UserService');
logger.log('User created', { userId: 1, email: 'foo@bar.com' });

```

在文本模式下，参数会内联附加到同一格式化行：

```plaintext
[Nest] 3785  - 02/26/2026, 10:04:41 AM     LOG [UserService] User created { userId: 1, email: 'foo@bar.com' }

```

当传递多个普通对象时，它们会合并为一组参数：

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
  "params": { "userId": 1 }
}

```

如果您希望将它们展开到 JSON 对象的根级别——某些日志聚合器更倾向于这种方式——请启用 `flattenParams`：

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
  "userId": 1
}

```

相关的 `ConsoleLogger` 选项如下：

| 选项             | 描述                                                                                                   | 默认值 |
| ------------------ | ------------------------------------------------------------------------------------------------------------- | ------- |
| `structuredParams` | 如果启用，消息后记录的普通对象将作为参数附加到同一条目。                  | `true`  |
| `flattenParams`    | 如果启用，参数将展开到 JSON 记录的根级别，而不是嵌套在 `params` 下。仅限 JSON 模式。 | `false` |

> info **提示** 只有**普通对象**被视为参数。数组、字符串、数字、类实例和 `null` 仍作为单独的消息记录，而作为*第一个*参数传递的普通对象仍被视为消息本身。设置 `structuredParams: false` 以恢复 v12 之前的行为。

#### 使用日志器进行应用程序日志记录

我们可以结合上述几种技术，在 Nest 系统日志和我们自己的应用程序事件/消息日志之间提供一致的行为和格式。

一个好的实践是在每个服务中实例化来自 `@nestjs/common` 的 `Logger` 类。我们可以将服务名称作为 `Logger` 构造函数中的 `context` 参数提供，如下所示：

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

在默认日志器实现中，`context` 打印在方括号中，如下例中的 `NestFactory`：

```bash
[Nest] 19096   - 12/08/2019, 7:12:59 AM   [NestFactory] Starting Nest application...

```

如果我们通过 `app.useLogger()` 提供自定义日志器，Nest 内部实际上会使用它。这意味着我们的代码保持实现无关，同时我们可以通过调用 `app.useLogger()` 轻松地将默认日志器替换为我们自定义的日志器。

这样，如果我们按照上一节的步骤调用 `app.useLogger(app.get(MyLogger))`，则来自 `MyService` 的以下 `this.logger.log()` 调用将导致调用来自 `MyLogger` 实例的方法 `log`。

这应该适用于大多数情况。但如果您需要更多自定义（例如添加和调用自定义方法），请转到下一节。

#### 带时间戳的日志

要为每条记录的日志消息启用时间戳记录，您可以在创建日志器实例时使用可选的 `timestamp: true` 设置。

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
[Nest] 19096   - 04/19/2024, 7:12:59 AM   [MyService] Doing something with timestamp here +5ms

```

请注意行尾的 `+5ms`。对于每条日志语句，会计算与上一条消息的时间差并显示在行尾。

#### 自定义实现

您可以通过将 `logger` 属性的值设置为满足 `LoggerService` 接口的对象，来提供自定义日志器实现供 Nest 用于系统日志记录。例如，您可以告诉 Nest 使用内置的全局 JavaScript `console` 对象（它实现了 `LoggerService` 接口），如下所示：

```typescript
const app = await NestFactory.create(AppModule, {
  logger: console,
});
await app.listen(process.env.PORT ?? 3000);

```

实现您自己的自定义日志器很简单。只需实现 `LoggerService` 接口的每个方法，如下所示。

```typescript
import { LoggerService, Injectable } from '@nestjs/common';

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
}

```

然后，您可以通过 Nest 应用程序选项对象的 `logger` 属性提供 `MyLogger` 的实例。

```typescript
const app = await NestFactory.create(AppModule, {
  logger: new MyLogger(),
});
await app.listen(process.env.PORT ?? 3000);

```

这种技术虽然简单，但没有为 `MyLogger` 类利用依赖注入。这可能会带来一些挑战，特别是对于测试，并限制 `MyLogger` 的可重用性。要获得更好的解决方案，请参阅下面的 <a href="techniques/logger#依赖注入">依赖注入</a> 部分。

#### 扩展内置日志器

与其从头编写日志器，您可以通过扩展内置的 `ConsoleLogger` 类并覆盖默认实现的某些行为来满足您的需求。

```typescript
import { ConsoleLogger } from '@nestjs/common';

export class MyLogger extends ConsoleLogger {
  error(message: any, stack?: string, context?: string) {
    // add your tailored logic here
    super.error(...arguments);
  }
}

```

您可以按照下文 <a href="techniques/logger#将记录器用于应用程序日志记录">使用日志器进行应用程序日志记录</a> 部分所述，在您的功能模块中使用这种扩展日志器。

您可以通过应用程序选项对象的 `logger` 属性传递其实例（如上文 <a href="techniques/logger#custom-logger-implementation">自定义实现</a> 部分所示），或使用下文 <a href="techniques/logger#依赖注入">依赖注入</a> 部分所示的技术，来告诉 Nest 使用您的扩展日志器进行系统日志记录。如果这样做，您应注意调用 `super`（如上面的示例代码所示），以将特定的日志方法调用委托给父类（内置类），以便 Nest 能够依赖其期望的内置功能。

<app-banner-courses></app-banner-courses>

#### 依赖注入

对于更高级的日志功能，您需要利用依赖注入。例如，您可能希望将 `ConfigService` 注入到日志器中以对其进行自定义，然后将您的自定义日志器注入到其他控制器和/或提供者中。要为您的自定义日志器启用依赖注入，请创建一个实现 `LoggerService` 的类，并将该类作为提供者注册到某个模块中。例如，您可以：

1. 定义一个 `MyLogger` 类，该类扩展内置的 `ConsoleLogger` 或完全覆盖它，如前面部分所示。请务必实现 `LoggerService` 接口。
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

通过这种构造，您现在可以为任何其他模块提供您的自定义日志器。由于您的 `MyLogger` 类是模块的一部分，因此它可以使用依赖注入（例如，注入 `ConfigService`）。还需要一种技术来提供此自定义日志器供 Nest 用于系统日志记录（例如，用于引导和错误处理）。

由于应用程序实例化（`NestFactory.create()`）发生在任何模块的上下文之外，因此它不参与正常的初始化依赖注入阶段。所以我们必须确保至少有一个应用程序模块导入 `LoggerModule`，以触发 Nest 实例化我们的 `MyLogger` 类的单例实例。

然后，我们可以通过以下构造告诉 Nest 使用 `MyLogger` 的同一个单例实例：

```typescript
const app = await NestFactory.create(AppModule, {
  bufferLogs: true,
});
app.useLogger(app.get(MyLogger));
await app.listen(process.env.PORT ?? 3000);

```

> info **注意** 在上面的示例中，我们将 `bufferLogs` 设置为 `true`，以确保所有日志都会被缓冲，直到附加了自定义日志器（本例中为 `MyLogger`）并且应用程序初始化过程完成或失败。如果初始化过程失败，Nest 将回退到原始的 `ConsoleLogger` 来打印任何报告的错误消息。此外，您可以将 `autoFlushLogs` 设置为 `false`（默认 `true`）以手动刷新日志（使用 `Logger.flush()` 方法）。

这里我们在 `NestApplication` 实例上使用 `get()` 方法来检索 `MyLogger` 对象的单例实例。这种技术本质上是一种为 Nest 使用而"注入"日志器实例的方式。`app.get()` 调用检索 `MyLogger` 的单例实例，并且依赖于该实例首先在另一个模块中被注入，如上所述。

您还可以在功能类中注入此 `MyLogger` 提供者，从而确保 Nest 系统日志记录和应用程序日志记录之间的一致日志行为。有关更多信息，请参阅下面的 <a href="techniques/logger#将记录器用于应用程序日志记录">使用日志器进行应用程序日志记录</a> 和 <a href="techniques/logger#注入自定义日志记录器">注入自定义日志器</a>。

#### 注入自定义日志器

首先，使用如下代码扩展内置日志器。我们为 `ConsoleLogger` 类提供 `scope` 选项作为配置元数据，指定 [transient](/fundamentals/provider-scopes) 作用域，以便每个功能模块都有自己的日志器实例。这很重要，因为每个模块通过 `setContext()` 在其日志器上设置唯一的上下文——如果是单例，该调用将覆盖整个应用程序的上下文。在此示例中，我们没有扩展各个 `ConsoleLogger` 方法（如 `log()`、`warn()` 等），但您可以选择这样做。

```typescript
import { Injectable, Scope, ConsoleLogger } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class MyLogger extends ConsoleLogger {
  customLog() {
    this.log('Please feed the cat!');
  }
}

```

接下来，使用如下构造创建一个 `LoggerModule`：

```typescript
import { Module } from '@nestjs/common';
import { MyLogger } from './my-logger.service.js';

@Module({
  providers: [MyLogger],
  exports: [MyLogger],
})
export class LoggerModule {}

```

接下来，将 `LoggerModule` 导入到您的功能模块中。由于我们扩展了默认的 `Logger`，因此我们可以方便地使用 `setContext` 方法。所以我们可以开始使用具有上下文感知的自定义日志器，如下所示：

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

最后，如下所示，在您的 `main.ts` 文件中指示 Nest 使用自定义日志器的实例。当然，在此示例中，我们实际上并未自定义日志器行为（通过扩展 `Logger` 方法如 `log()`、`warn()` 等），因此此步骤实际上并不需要。但如果您向这些方法添加了自定义逻辑并希望 Nest 使用相同的实现，那么它**将**是必需的。

```typescript
const app = await NestFactory.create(AppModule, {
  bufferLogs: true,
});
app.useLogger(new MyLogger());
await app.listen(process.env.PORT ?? 3000);

```

> info **提示** 或者，您可以使用 `logger: false` 指令临时禁用日志器，而不是将 `bufferLogs` 设置为 `true`。请注意，如果您将 `logger: false` 提供给 `NestFactory.create`，在您调用 `useLogger` 之前不会记录任何内容，因此您可能会错过一些重要的初始化错误。如果您不介意一些初始消息将使用默认日志器记录，您可以省略 `logger: false` 选项。

#### 将日志与请求关联

集中化日志解决的是存储问题，而非排查问题。当每个实例都将日志发送到同一位置后，难点就变成了从数千条交错的行中重建*单个*请求——这就是为什么大量生产环境调试实际上是在发明一个关联 ID，将其贯穿到每次日志调用中，并希望路径上的任何环节都没有忘记传递它。

[NestJS Observe](https://www.observe.nestjs.com/ 'NestJS Observe') 消除了这种簿记工作。启用 `forwardLogs` 后，通过 Nest 的 `Logger` 写入的每一行日志都会在写入时自动附带其所属的追踪信息：

```typescript
ObserveModule.forRoot({
  serviceId: 'orders-api',
  forwardLogs: true,
});

```

您仍然像以前一样使用 `orderId` 参数调用 `this.logger.log()` —— 无需生成关联 ID，也无需在服务层中传递上下文对象。在执行页面上，该请求的日志会按照追踪自身的时间线排列，每一行都紧挨着写入时正在进行的跨度（span），因此，"重试警告在超时*之前*触发，而非之后"这样的判断，您可以直接看到，而无需从三个日志流的时间戳中推断。

结构化日志参数也会一并保留，因此 `orderId` 仍然是一个可查询的字段，而不会被扁平化到消息文本中。日志行本身也可以独立设置告警 —— "当 `payment declined` 在 15 分钟内出现超过 10 次时通知我"。

如果您希望将日志内容保留在自己的聚合器中，则无需转发任何内容：关闭 `forwardLogs` 后，SDK 仍会增强 `ConsoleLogger`，使每一行都携带其追踪 ID，这足以让您从现有日志栈中的某一行直接跳转到仪表板中的完整追踪。有关这两种选项及其脱敏设置，请参阅 [SDK reference](/observability/sdk)。

#### 使用外部日志器

生产环境应用程序通常有特定的日志记录需求，包括高级过滤、格式化和集中式日志记录。Nest 的内置日志器用于监控 Nest 系统行为，在开发阶段也可以用于功能模块中的基本格式化文本日志记录，但生产环境应用程序通常会利用像 [Winston](https://github.com/winstonjs/winston) 这样的专用日志模块。与任何标准的 Node.js 应用程序一样，您可以在 Nest 中充分利用此类模块。