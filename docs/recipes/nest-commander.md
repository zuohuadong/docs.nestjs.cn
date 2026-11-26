<!-- 此文件从 content/recipes/nest-commander.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:10:18.282Z -->
<!-- 源文件: content/recipes/nest-commander.md -->
<!-- 源哈希: 31129c502db60a4fe68473824be178c6 -->

### Nest Commander

扩展了 [standalone applications](/standalone-applications) 章节，[nest-commander](https://nest-commander.jaymcdoniel.dev) 包允许您以类似于典型 Nest 应用程序的结构编写命令行应用程序。

> info **注意** `nest-commander` 是第三方包，不由 NestJS 核心团队管理。请在 [nest-commander repository](https://github.com/jmcdo29/nest-commander/issues/new/choose) 中报告任何库问题。

#### 安装

首先，安装该包：

```bash
$ npm i nest-commander

```

#### 命令文件

`nest-commander` 允许您使用 [decorators](https://www.typescriptlang.org/docs/handbook/decorators.html) 编写命令行应用程序：用于类的 `@Command()` 装饰器和用于这些类方法的 `@Option()` 装饰器。每个命令类都应该扩展 `CommandRunner` 抽象类并用 `@Command()` 装饰器进行装饰。

Nest 将每个命令视为一个 `@Injectable()`，因此依赖注入按惯例工作。`CommandRunner` 抽象类确保每个命令都有一个返回 `Promise<void>` 并接受参数 `string[], Record<string, any>` 的 `run()` 方法。`run()` 方法是命令逻辑的起点。它的第一个参数是所有未匹配选项标志的参数数组，以防您需要处理多个参数。在第二个参数（选项对象）中，属性名称与提供给 `@Option()` 装饰器的 `name` 属性匹配，其值是相应选项处理程序的返回值。为了更好的类型安全，您还可以为选项创建接口。

#### 运行命令

在 NestJS 应用程序中，您使用 `NestFactory` 创建服务器并使用 `listen()` 运行它。类似地，`nest-commander` 包提供了一个 API 来运行您的命令行应用程序：导入 `CommandFactory`，调用其静态 `run()` 方法，并将应用程序的根模块作为参数传入：

```ts
import { CommandFactory } from 'nest-commander';
import { AppModule } from './app.module.js';

async function bootstrap() {
  await CommandFactory.run(AppModule);
}

await bootstrap();

```

默认情况下，在使用 `CommandFactory` 时，Nest 的日志记录器是禁用的。要启用它，请将日志记录器作为第二个参数传递给 `run()` 方法。您可以提供自定义的 NestJS 日志记录器或您希望保留的日志级别数组。例如，传递 `['error']` 以仅打印 Nest 的错误日志。

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

在底层，`CommandFactory` 为您调用 `NestFactory`，并在命令完成后调用 `app.close()`，因此您无需担心内存泄漏。要添加错误处理，请将 `run()` 调用包装在 `try/catch` 块中，或将 `.catch()` 调用链式调用到 `bootstrap()` 调用上。

#### 测试

`nest-commander` 提供与 NestJS 生态系统其余部分兼容的测试工具。不要使用 `CommandFactory` 在测试模式下构建命令，而是使用 `nest-commander-testing` 包中的 `CommandTestFactory` 并传入您的模块元数据，类似于 `@nestjs/testing` 中的 `Test.createTestingModule()` 的工作方式。事实上，它在底层使用了 `@nestjs/testing`。您仍然可以在调用 `compile()` 之前链式调用 `overrideProvider()` 调用来在测试中替换提供者。

#### 组合起来

以下类定义了一个 CLI 命令，它可以接受子命令 `basic` 或直接调用。它支持 `-n`、`-s` 和 `-b` 标志（以及它们的长形式），每个选项都有自定义解析器。也支持 `--help` 标志，这符合 commander 的惯例。

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
    super();
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

确保将命令类添加到模块中：

```ts
@Module({
  providers: [LogService, BasicCommand],
})
export class AppModule {}

```

然后，要运行 CLI，请将以下内容添加到您的 `main.ts` 文件中：

```ts
async function bootstrap() {
  await CommandFactory.run(AppModule);
}

await bootstrap();

```

您现在拥有了一个命令行应用程序。

#### 更多信息

请访问 [nest-commander docs site](https://nest-commander.jaymcdoniel.dev) 获取更多信息、示例和 API 文档。