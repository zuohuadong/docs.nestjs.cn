<!-- 此文件从 content/techniques/logger.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-03-12T13:42:20.337Z -->
<!-- 源文件: content/techniques/logger.md -->

### 日志记录器

Nest 附带一个内置的基于文本的日志记录器，在应用程序引导期间和其他几种情况下（如显示捕获的异常（即系统日志记录））使用。此功能通过 `@nestjs/common` 包中的 `Logger` 类提供。您可以完全控制日志记录系统的行为，包括以下任何内容：

- 完全禁用日志记录
- 指定日志详细级别（例如，显示错误、警告、调试信息等）
- 配置日志消息的格式（原始、json、彩色等）
- 覆盖默认日志记录器中的时间戳（例如，使用 ISO8601 标准作为日期格式）
- 完全覆盖默认日志记录器
- 通过扩展自定义默认日志记录器
- 利用依赖注入简化应用程序的组合和测试

您还可以使用内置日志记录器或创建自己的自定义实现来记录自己的应用程序级事件和消息。

如果您的应用程序需要与外部日志系统集成、自动基于文件的日志记录或将日志转发到集中式日志服务，您可以使用 Node.js 日志库实现完全自定义的日志解决方案。一个流行的选择是 [Pino](https://github.com/pinojs/pino)，以其高性能和灵活性而闻名。

#### 基本自定义

要禁用日志记录，请在作为第二个参数传递给 `NestFactory.create()` 方法的（可选）Nest 应用程序选项对象中将 `logger` 属性设置为 `false`。

```typescript
const app = await NestFactory.create(AppModule, {
  logger: false,
});
await app.listen(process.env.PORT ?? 3000);

```

要启用特定的日志级别，请将 `logger` 属性设置为指定要显示的日志级别的字符串数组，如下所示：

```typescript
const app = await NestFactory.create(AppModule, {
  logger: ['error', 'warn'],
});
await app.listen(process.env.PORT ?? 3000);

```

数组中的值可以是 `'log'`、`'fatal'`、`'error'`、`'warn'`、`'debug'` 和 `'verbose'` 的任意组合。

:::info 提示
Nest 中的日志级别是级联的（继承的）。这意味着提供特定的日志级别（如 `'log'`）将自动包括所有更高严重性的级别（例如 `'warn'`、`'error'` 和 `'fatal'`）。
:::

要禁用彩色输出，请传递 `ConsoleLogger` 对象，并将 `colors` 属性设置为 `false` 作为 `logger` 属性的值。

```typescript
const app = await NestFactory.create(AppModule, {
  logger: new ConsoleLogger({
    colors: false,
  }),
});

```

要为每个日志消息配置前缀，请传递 `ConsoleLogger` 对象，并设置 `prefix` 属性：

```typescript
const app = await NestFactory.create(AppModule, {
  logger: new ConsoleLogger({
    prefix: 'MyApp', // 默认为 "Nest"
  }),
});

```

下表列出了所有可用选项：

| 选项               | 描述                                                                                                                                                                                                                                                                         | 默认值                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `logLevels`       | 启用的日志级别。                                                                                                                                                                                                                                                                   | `['log', 'fatal', 'error', 'warn', 'debug', 'verbose']` |
| `timestamp`       | 如果启用，将打印当前和前一条日志消息之间的时间戳（时间差）。注意：当 `json` 启用时，此选项不使用。                                                                                                                                                                                                                     | `false`                                        |
| `prefix`          | 用于每个日志消息的前缀。注意：当 `json` 启用时，此选项不使用。                                                                                                                                                                                                                                        | `Nest`                                         |
| `json`            | 如果启用，将以 JSON 格式打印日志消息。                                                                                                                                                                                                                                                      | `false`                                        |
| `colors`          | 如果启用，将以彩色打印日志消息。默认情况下，如果禁用 json，则为 true，否则为 false。                                                                                                                                                                                                                          | `true`                                         |
| `context`         | 日志记录器的上下文。                                                                                                                                                                                                                                                                 | `undefined`                                    |
| `compact`         | 如果启用，将在一行中打印日志消息，即使它是具有多个属性的对象。如果设置为数字，最多 n 个内部元素将在一行上联合，只要所有属性都适合 breakLength。短数组元素也会被分组在一起。                                                                                                                                                                             | `true`                                         |
| `maxArrayLength`  | 指定格式化时要包含的 Array、TypedArray、Map、Set、WeakMap 和 WeakSet 元素的最大数量。设置为 null 或 Infinity 以显示所有元素。设置为 0 或负数以不显示元素。当 `json` 启用、颜色禁用且 `compact` 设置为 true 时被忽略，因为它会产生可解析的 JSON 输出。                                                                                                       | `100`                                          |
| `maxStringLength` | 指定格式化时要包含的最大字符数。设置为 null 或 Infinity 以显示所有元素。设置为 0 或负数以不显示字符。当 `json` 启用、颜色禁用且 `compact` 设置为 true 时被忽略，因为它会产生可解析的 JSON 输出。                                                                                                                                                       | `10000`                                        |
| `sorted`          | 如果启用，将在格式化对象时对键进行排序。也可以是自定义排序函数。当 `json` 启用、颜色禁用且 `compact` 设置为 true 时被忽略，因为它会产生可解析的 JSON 输出。                                                                                                                                                                                | `false`                                        |
| `depth`           | 指定格式化对象时递归的次数。这对于检查大型对象很有用。要递归到最大调用堆栈大小，请传递 Infinity 或 null。当 `json` 启用、颜色禁用且 `compact` 设置为 true 时被忽略，因为它会产生可解析的 JSON 输出。                                                                                                                                                 | `5`                                            |
| `showHidden`      | 如果为 true，则对象的不可枚举符号和属性会包含在格式化结果中。WeakMap 和 WeakSet 条目以及用户定义的原型属性也会包含在内                                                                                                                                                                                                                   | `false`                                        |
| `breakLength`     | 输入值跨多行分割的长度。设置为 Infinity 以将输入格式化为单行（与 "compact" 设置为 true 结合使用）。当 "compact" 为 true 时默认为 Infinity，否则为 80。当 `json` 启用、颜色禁用且 `compact` 设置为 true 时被忽略，因为它会产生可解析的 JSON 输出。                                                                                                     | `Infinity`                                     |

#### JSON 日志记录

JSON 日志记录对于现代应用程序可观测性和与日志管理系统的集成至关重要。要在 NestJS 应用程序中启用 JSON 日志记录，请配置 `ConsoleLogger` 对象，将其 `json` 属性设置为 `true`。然后，在创建应用程序实例时，将此日志记录器配置作为 `logger` 属性的值提供。

```typescript
const app = await NestFactory.create(AppModule, {
  logger: new ConsoleLogger({
    json: true,
  }),
});

```

此配置以结构化 JSON 格式输出日志，使其更易于与外部系统（如日志聚合器和云平台）集成。例如，像 **AWS ECS**（弹性容器服务）这样的平台原生支持 JSON 日志，启用了高级功能，如：

- **日志过滤**：根据日志级别、时间戳或自定义元数据等字段轻松缩小日志范围。
- **搜索和分析**：使用查询工具分析和跟踪应用程序行为的趋势。

此外，如果您使用 [NestJS Mau](https://mau.nestjs.com)，JSON 日志记录简化了以组织良好的结构化格式查看日志的过程，这对于调试和性能监控特别有用。

:::info 注意
当 `json` 设置为 `true` 时，`ConsoleLogger` 会通过将 `colors` 属性设置为 `false` 自动禁用文本颜色化。这确保输出保持有效的 JSON，没有格式伪影。但是，出于开发目的，您可以通过显式将 `colors` 设置为 `true` 来覆盖此行为。这会添加彩色 JSON 日志，这可以使本地调试期间的日志条目更易读。
:::

启用 JSON 日志记录时，日志输出将如下所示（在单行中）：

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

日志消息经常需要携带元数据——用户 ID、请求耗时、关联 ID。从 NestJS v12 开始，传递在首个消息参数**之后**的普通对象会被视为结构化参数，并附加到同一条日志条目上，而不是作为单独的日志记录输出。

```typescript
const logger = new Logger('UserService');
logger.log('User created', { userId: 1, email: 'foo@bar.com' });

```

在文本模式下，参数会内联追加到同一行格式化输出中：

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

在 JSON 模式下，参数默认嵌套在 `params` 键之下：

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

如果您更希望把它们展开到 JSON 对象的根部——某些日志聚合器更喜欢这样——请启用 `flattenParams`：

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

| 选项               | 描述                                                                                     | 默认值  |
| ------------------ | ------------------------------------------------------------------------------------------------------------- | ------- |
| `structuredParams` | 启用后，消息之后记录的普通对象会作为参数附加到同一条目上。                     | `true`  |
| `flattenParams`    | 启用后，参数会展开到 JSON 记录的根部，而不是嵌套在 `params` 之下。仅 JSON 模式。 | `false` |

> info **提示** 只有**普通对象**会被视为参数。数组、字符串、数字、类实例和 `null` 仍会作为单独的消息记录，而作为*第一个*参数传入的普通对象仍被视为消息本身。设置 `structuredParams: false` 可恢复 v12 之前的行为。

#### 将日志记录器用于应用程序日志记录

我们可以结合上述几种技术，在 Nest 系统日志记录和我们自己的应用程序事件/消息日志记录之间提供一致的行为和格式。

一个好习惯是在我们的每个服务中实例化来自 `@nestjs/common` 的 `Logger` 类。我们可以在 `Logger` 构造函数中提供我们的服务名称作为 `context` 参数，如下所示：

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

在默认的日志记录器实现中，`context` 打印在方括号中，如下例中的 `NestFactory`：

```bash
[Nest] 19096   - 12/08/2019, 7:12:59 AM   [NestFactory] Starting Nest application...

```

如果我们通过 `app.useLogger()` 提供自定义日志记录器，它实际上会被 Nest 内部使用。这意味着我们的代码保持实现不可知，而我们可以通过调用 `app.useLogger()` 轻松地将默认日志记录器替换为我们的自定义日志记录器。

这样，如果我们按照上一节中的步骤调用 `app.useLogger(app.get(MyLogger))`，那么 `MyService` 中的 `this.logger.log()` 调用将导致调用 `MyLogger` 实例的 `log` 方法。

这应该适用于大多数情况。但是，如果您需要更多自定义（如添加和调用自定义方法），请转到下一节。

#### 带有时间戳的日志

要为每条记录的消息启用时间戳日志记录，您可以在创建日志记录器实例时使用可选的 `timestamp: true` 设置。

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

注意行尾的 `+5ms`。对于每条日志语句，会计算与前一条消息的时间差并显示在行尾。

#### 自定义实现

您可以通过将 `logger` 属性的值设置为一个满足 `LoggerService` 接口的对象，来提供一个自定义的日志记录器实现，供 Nest 用于系统日志记录。例如，您可以告诉 Nest 使用内置的全局 JavaScript `console` 对象（它实现了 `LoggerService` 接口），如下所示：

```typescript
const app = await NestFactory.create(AppModule, {
  logger: console,
});
await app.listen(process.env.PORT ?? 3000);

```

实现自己的自定义日志记录器很简单。只需实现 `LoggerService` 接口的每个方法，如下所示。

```typescript
import { LoggerService, Injectable } from '@nestjs/common';

@Injectable()
export class MyLogger implements LoggerService {
  /**
   * 写入 'log' 级别的日志。
   */
  log(message: any, ...optionalParams: any[]) {}

  /**
   * 写入 'fatal' 级别的日志。
   */
  fatal(message: any, ...optionalParams: any[]) {}

  /**
   * 写入 'error' 级别的日志。
   */
  error(message: any, ...optionalParams: any[]) {}

  /**
   * 写入 'warn' 级别的日志。
   */
  warn(message: any, ...optionalParams: any[]) {}

  /**
   * 写入 'debug' 级别的日志。
   */
  debug?(message: any, ...optionalParams: any[]) {}

  /**
   * 写入 'verbose' 级别的日志。
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

这种技术虽然简单，但不利用 `MyLogger` 类的依赖注入。这可能会带来一些挑战，特别是对于测试，并限制 `MyLogger` 的可重用性。有关更好的解决方案，请参见下面的 <a href="/techniques/logger#依赖注入">依赖注入</a> 部分。

#### 扩展内置日志记录器

与其从头开始编写日志记录器，您可以通过扩展内置的 `ConsoleLogger` 类并覆盖默认实现的选定行为来满足您的需求。

```typescript
import { ConsoleLogger } from '@nestjs/common';

export class MyLogger extends ConsoleLogger {
  error(message: any, stack?: string, context?: string) {
    // 在这里添加您的定制逻辑
    super.error(...arguments);
  }
}

```

您可以在功能模块中使用这样的扩展日志记录器，如下面的 <a href="/techniques/logger#将记录器用于应用程序日志记录">将记录器用于应用程序日志记录</a> 部分所述。

您可以通过应用程序选项对象的 `logger` 属性传递其实例（如上面的 <a href="/techniques/logger#自定义实现">自定义实现</a> 部分所示），或使用下面的 <a href="/techniques/logger#依赖注入">依赖注入</a> 部分所示的技术，告诉 Nest 使用您的扩展日志记录器进行系统日志记录。如果这样做，您应该注意调用 `super`，如上面的示例代码所示，将特定的日志方法调用委托给父（内置）类，以便 Nest 可以依赖它期望的内置功能。

<app-banner-courses></app-banner-courses>

#### 依赖注入

对于更高级的日志记录功能，您会希望利用依赖注入。例如，您可能希望将 `ConfigService` 注入到您的日志记录器中来自定义它，然后将您的自定义日志记录器注入到其他控制器和/或提供者中。要为您的自定义日志记录器启用依赖注入，请创建一个实现 `LoggerService` 的类，并在某个模块中将该类注册为提供者。例如，您可以

1. 定义一个 `MyLogger` 类，该类要么扩展内置的 `ConsoleLogger`，要么完全覆盖它，如前几节所示。确保实现 `LoggerService` 接口。
2. 创建一个 `LoggerModule`，如下所示，并从该模块提供 `MyLogger`。

```typescript
import { Module } from '@nestjs/common';
import { MyLogger } from './my-logger.service';

@Module({
  providers: [MyLogger],
  exports: [MyLogger],
})
export class LoggerModule {}

```

通过这种构造，您现在正在提供您的自定义日志记录器，供任何其他模块使用。因为您的 `MyLogger` 类是模块的一部分，它可以使用依赖注入（例如，注入 `ConfigService`）。还需要一种技术来提供此自定义日志记录器，供 Nest 用于系统日志记录（例如，用于引导和错误处理）。

因为应用程序实例化（`NestFactory.create()`）发生在任何模块的上下文之外，它不参与初始化的正常依赖注入阶段。因此，我们必须确保至少有一个应用程序模块导入 `LoggerModule`，以触发 Nest 实例化 `MyLogger` 类的单例实例。

然后，我们可以指示 Nest 使用 `MyLogger` 的同一个单例实例，方法如下：

```typescript
const app = await NestFactory.create(AppModule, {
  bufferLogs: true,
});
app.useLogger(app.get(MyLogger));
await app.listen(process.env.PORT ?? 3000);

```

:::info 注意
在上面的示例中，我们将 `bufferLogs` 设置为 `true`，以确保所有日志都将被缓冲，直到附加了自定义日志记录器（在这种情况下是 `MyLogger`），并且应用程序初始化过程要么完成要么失败。如果初始化过程失败，Nest 将回退到原始的 `ConsoleLogger` 来打印任何报告的错误消息。此外，您可以将 `autoFlushLogs` 设置为 `false`（默认 `true`）以手动刷新日志（使用 `Logger.flush()` 方法）。
:::

在这里，我们使用 `NestApplication` 实例上的 `get()` 方法来检索 `MyLogger` 对象的单例实例。这种技术本质上是一种为 Nest 使用的日志记录器实例"注入"的方法。`app.get()` 调用检索 `MyLogger` 的单例实例，并依赖于该实例首先在另一个模块中注入，如上所述。

您还可以在功能类中注入此 `MyLogger` 提供者，从而确保 Nest 系统日志记录和应用程序日志记录之间的一致日志记录行为。有关更多信息，请参见下面的 <a href="/techniques/logger#将记录器用于应用程序日志记录">将记录器用于应用程序日志记录</a> 和 <a href="/techniques/logger#注入自定义日志记录器">注入自定义日志记录器</a>。

#### 注入自定义日志记录器

首先，使用如下代码扩展内置日志记录器。我们提供 `scope` 选项作为 `ConsoleLogger` 类的配置元数据，指定一个 [瞬态](/fundamentals/provider-scopes) 作用域，以确保我们在每个功能模块中都有 `MyLogger` 的唯一实例。在这个例子中，我们没有扩展各个 `ConsoleLogger` 方法（如 `log()`、`warn()` 等），尽管您可以选择这样做。

```typescript
import { Injectable, Scope, ConsoleLogger } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class MyLogger extends ConsoleLogger {
  customLog() {
    this.log('Please feed the cat!');
  }
}

```

接下来，创建一个 `LoggerModule`，如下所示：

```typescript
import { Module } from '@nestjs/common';
import { MyLogger } from './my-logger.service';

@Module({
  providers: [MyLogger],
  exports: [MyLogger],
})
export class LoggerModule {}

```

接下来，将 `LoggerModule` 导入到您的功能模块中。由于我们扩展了默认的 `Logger`，我们可以使用 `setContext` 方法。所以我们可以开始使用上下文感知的自定义日志记录器，如下所示：

```typescript
import { Injectable } from '@nestjs/common';
import { MyLogger } from './my-logger.service';

@Injectable()
export class CatsService {
  private readonly cats: Cat[] = [];

  constructor(private myLogger: MyLogger) {
    // 由于瞬态作用域，CatsService 有自己的 MyLogger 唯一实例，
    // 所以在这里设置上下文不会影响其他服务中的其他实例
    this.myLogger.setContext('CatsService');
  }

  findAll(): Cat[] {
    // 您可以调用所有默认方法
    this.myLogger.warn('About to return cats!');
    // 以及您的自定义方法
    this.myLogger.customLog();
    return this.cats;
  }
}

```

最后，指示 Nest 在您的 `main.ts` 文件中使用自定义日志记录器的实例，如下所示。当然，在这个例子中，我们实际上没有自定义日志记录器行为（通过扩展 `Logger` 方法，如 `log()`、`warn()` 等），所以这一步实际上不是必需的。但如果您向这些方法添加了自定义逻辑，并希望 Nest 使用相同的实现，那么这一步 **将** 是必需的。

```typescript
const app = await NestFactory.create(AppModule, {
  bufferLogs: true,
});
app.useLogger(new MyLogger());
await app.listen(process.env.PORT ?? 3000);

```

:::info 提示
或者，您可以暂时使用 `logger: false` 指令禁用日志记录，而不是将 `bufferLogs` 设置为 `true`。请注意，如果您向 `NestFactory.create` 提供 `logger: false`，在调用 `useLogger` 之前不会记录任何内容，因此您可能会错过一些重要的初始化错误。如果您不介意一些初始消息将使用默认日志记录器记录，您可以简单地省略 `logger: false` 选项。
:::

#### 将日志与请求关联

集中式日志解决的是存储问题，而不是调查问题。当每个实例的日志都汇聚到同一处之后，困难的部分变成了从数千行交错的日志中重建*单个*请求——这正是为什么如此多的生产环境调试，实际上都是在发明关联 ID、把它穿透到每一次日志调用中，并祈祷路径上没有哪个环节忘记传递它。

[NestJS Observe](https://www.observe.nestjs.com/ 'NestJS Observe') 免除了这些簿记工作。打开 `forwardLogs`，通过 Nest 的 `Logger` 写入的每一行都会被捕获，并自动附带它所在 trace：

```typescript
ObserveModule.forRoot({
  serviceId: 'orders-api',
  forwardLogs: true,
});

```

您依然可以像以前一样带着 `orderId` 参数调用 `this.logger.log()`——无需生成关联 ID，也无需在服务层层层传递上下文对象。在执行页面上，该请求的日志会被放置在 trace 自身的时间线上，每一行都紧邻写入时正在进行的跨度，因此"重试警告是在超时*之前*而不是之后触发的"是您能直接看到的东西，而不用跨三个日志流从时间戳去推断。

结构化日志参数同样会被保留，因此 `orderId` 仍是一个可查询的字段，而不会被摊平进消息文本。日志行本身也可以设置告警——"当 `payment declined` 在 15 分钟内出现超过 10 次时告诉我"。

如果您更愿意把日志内容保留在自己的聚合器中，也完全不必转发任何内容：关闭 `forwardLogs` 时，SDK 仍会增强 `ConsoleLogger`，让每一行都携带其 trace id，这足以让您从现有堆栈中的一行日志跳转到仪表盘中的完整 trace。两种方式及其脱敏设置请参阅 [SDK 参考](/observability/sdk)。

#### 使用外部日志记录器

生产应用程序通常有特定的日志记录要求，包括高级过滤、格式化和集中式日志记录。Nest 的内置日志记录器用于监控 Nest 系统行为，在开发时也可用于功能模块中的基本格式化文本日志记录，但生产应用程序通常利用专用的日志记录模块，如 [Winston](https://github.com/winstonjs/winston)。与任何标准 Node.js 应用程序一样，您可以在 Nest 中充分利用这些模块。
