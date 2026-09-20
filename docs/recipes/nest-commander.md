<!-- 此文件从 content/recipes/nest-commander.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-13T10:01:40.851Z -->
<!-- 源文件: content/recipes/nest-commander.md -->
<!-- 源哈希: efba59fef38fa6a3330d2792d2822028 -->

### Nest Commander

在[standalone application](/standalone-applications)文档的基础上，还有[nest-commander](https://jmcdo29.github.io/nest-commander)包，用于以类似于典型 Nest 应用程序的结构编写命令行应用程序。

> info **信息** `nest-commander` 是第三方包，不由 NestJS 核心团队整体管理。请在[appropriate repository](https://github.com/jmcdo29/nest-commander/issues/new/choose)中报告使用该库时发现的任何问题。

#### 安装

与其他任何包一样，你需要先安装它才能使用。

```bash
$ npm i nest-commander

```

#### 命令文件

`nest-commander` 通过用于类的 `@Command()` 装饰器和用于该类方法的 `@Option()` 装饰器，使得使用 [decorators](https://www.typescriptlang.org/docs/handbook/decorators.html) 编写新的命令行应用程序变得容易。每个命令文件都应实现 `CommandRunner` 抽象类，并使用 `@Command()` 装饰器进行装饰。

每个命令都被 Nest 视为一个 `@Injectable()`，因此你的常规依赖注入仍然按预期工作。唯一需要注意的是抽象类 `CommandRunner`，每个命令都应实现它。`CommandRunner` 抽象类确保所有命令都有一个 `run` 方法，该方法返回一个 `Promise<void>` 并接收参数 `string[], Record<string, any>`。`run` 命令是你启动所有逻辑的地方，它将接收所有未匹配选项标志的参数，并将它们作为数组传入，以防你确实需要处理多个参数。至于选项，`Record<string, any>`，这些属性的名称与赋予 `@Option()` 装饰器的 `name` 属性匹配，而它们的值与选项处理器的返回值匹配。如果你想要更好的类型安全性，也欢迎为你的选项创建接口。

#### 运行命令

类似于在 NestJS 应用程序中，我们可以使用 `NestFactory` 为我们创建服务器，并使用 `listen` 运行它，`nest-commander` 包提供了一个简单易用的 API 来运行你的服务器。导入 `CommandFactory` 并使用 `static` 方法 `run`，传入应用程序的根模块。这大概如下所示：

```ts
import { CommandFactory } from 'nest-commander';
import { AppModule } from './app.module.js';

async function bootstrap() {
  await CommandFactory.run(AppModule);
}

await bootstrap();

```

默认情况下，使用 `CommandFactory` 时会禁用 Nest 的日志记录器。不过，你可以将其作为 `run` 函数的第二个参数提供。你可以提供自定义的 NestJS 日志记录器，或者提供你想要保留的日志级别数组——如果你只想打印 Nest 的错误日志，至少在这里提供 `['error']` 可能会很有用。

```ts
import { CommandFactory } from 'nest-commander';
import { AppModule } from './app.module.js';
import { LogService } from './log.service.js';

async function bootstrap() {
  await CommandFactory.run(AppModule, new LogService());

  // or, if you only want to print Nest's warnings and errors
  await CommandFactory.run(AppModule, ['warn', 'error']);
}

await bootstrap();

```

就是这样。在底层，`CommandFactory` 会负责为你调用 `NestFactory`，并在必要时调用 `app.close()`，因此你无需担心内存泄漏问题。如果你需要添加一些错误处理，总有 `try/catch` 包裹 `run` 命令，或者你可以在 `bootstrap()` 调用上链式调用一些 `.catch()` 方法。

#### 测试

如果不能轻松测试，那么编写一个超棒的命令行脚本又有什么用呢，对吧？幸运的是，`nest-commander` 提供了一些工具，你可以使用它们与 NestJS 生态系统完美配合，任何 Nest 开发者都会感到得心应手。与其使用 `CommandFactory` 在测试模式下构建命令，你可以使用 `CommandTestFactory` 并传入元数据，这与 `@nestjs/testing` 中的 `Test.createTestingModule` 的工作方式非常相似。事实上，它在底层使用了这个包。你仍然可以在调用 `compile()` 之前链式调用 `overrideProvider` 方法，以便在测试中替换依赖注入的部分。

#### 综合运用

以下类等同于拥有一个 CLI 命令，该命令可以接收子命令 `basic` 或直接调用，支持 `-n`、`-s` 和 `-b`（以及它们的长标志），并为每个选项提供自定义解析器。与 commander 的惯例一样，也支持 `--help` 标志。

```ts
import { Command, CommandRunner, Option } from 'nest-commander';
import { LogService } from './log.service.js';

interface BasicCommandOptions {
  string?: string;
  boolean?: boolean;
  number?: number;
}

@Command({ name: 'basic', description: 'A parameter parse' })
export class BasicCommand extends CommandRunner {
  constructor(private readonly logService: LogService) {
    super()
  }

  async run(
    passedParam: string[],
    options?: BasicCommandOptions,
  ): Promise<void> {
    if (options?.boolean !== undefined && options?.boolean !== null) {
      this.runWithBoolean(passedParam, options.boolean);
    } else if (options?.number) {
      this.runWithNumber(passedParam, options.number);
    } else if (options?.string) {
      this.runWithString(passedParam, options.string);
    } else {
      this.runWithNone(passedParam);
    }
  }

  @Option({
    flags: '-n, --number [number]',
    description: 'A basic number parser',
  })
  parseNumber(val: string): number {
    return Number(val);
  }

  @Option({
    flags: '-s, --string [string]',
    description: 'A string return',
  })
  parseString(val: string): string {
    return val;
  }

  @Option({
    flags: '-b, --boolean [boolean]',
    description: 'A boolean parser',
  })
  parseBoolean(val: string): boolean {
    return JSON.parse(val);
  }

  runWithString(param: string[], option: string): void {
    this.logService.log({ param, string: option });
  }

  runWithNumber(param: string[], option: number): void {
    this.logService.log({ param, number: option });
  }

  runWithBoolean(param: string[], option: boolean): void {
    this.logService.log({ param, boolean: option });
  }

  runWithNone(param: string[]): void {
    this.logService.log({ param });
  }
}

```

确保命令类已添加到模块中：

```ts
@Module({
  providers: [LogService, BasicCommand],
})
export class AppModule {}

```

现在，为了能够在 main.ts 中运行 CLI，你可以执行以下操作：

```ts
async function bootstrap() {
  await CommandFactory.run(AppModule);
}

await bootstrap();

```

就这样，你就拥有了一个命令行应用程序。

#### 更多信息

访问 [nest-commander docs site](https://jmcdo29.github.io/nest-commander) 获取更多信息、示例和 API 文档。