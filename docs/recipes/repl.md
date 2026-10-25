### 读取-求值-输出循环（REPL）

REPL 是一种简单的交互式环境，能够接收用户输入的单条命令，执行后立即返回结果。通过 REPL 功能，您可以直接在终端检查依赖关系图，并对提供者（及控制器）调用方法。

#### 使用方法

要在 REPL 模式下运行 NestJS 应用，请新建 `repl.ts` 文件（与现有的 `main.ts` 文件同级），并在其中添加以下代码：

 ```typescript title="repl.ts"
import { repl } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  await repl(AppModule);
}
bootstrap();

```

现在在终端中，使用以下命令启动 REPL：

```bash
$ npm run start -- --entryFile repl

```

:::info 提示
`repl` 返回一个 [Node.js REPL 服务器](https://nodejs.org/api/repl.html)对象。
:::

当它启动并运行后，你将在控制台中看到以下消息：

```bash
LOG [NestFactory] Starting Nest application...
LOG [InstanceLoader] AppModule dependencies initialized
LOG REPL initialized

```

现在你可以开始与依赖关系图进行交互。例如，你可以获取一个 `AppService`（这里我们以启动项目为例）并调用 `getHello()` 方法：

```typescript
> get(AppService).getHello()
'Hello World!'

```

你可以在终端内执行任何 JavaScript 代码，例如将 `AppController` 的实例赋值给局部变量，并使用 `await` 调用异步方法：

```typescript
> appController = get(AppController)
AppController { appService: AppService {} }
> await appController.getHello()
'Hello World!'

```

要显示给定提供者或控制器上所有可用的公共方法，请使用 `methods()` 函数，如下所示：

```typescript
> methods(AppController)

Methods:
 ◻ getHello

```

要打印所有已注册模块及其控制器和提供者的列表，请使用 `debug()`。

```typescript
> debug()

AppModule:
 - controllers:
  ◻ AppController
 - providers:
  ◻ AppService

```

快速演示：

<figure><img src="/assets/repl.gif" alt="REPL example" /></figure>

您可以在下方章节中找到有关现有预定义原生方法的更多信息。

#### 原生函数

内置的 NestJS REPL 附带了一些原生函数，这些函数在启动 REPL 时全局可用。你可以调用 `help()` 来列出它们。

如果你不记得某个函数的签名（即预期参数和返回类型），可以调用 `<function_name>.help`。例如：

```text
> $.help
Retrieves an instance of either injectable or controller, otherwise, throws exception.
Interface: $(token: InjectionToken) => any

```

:::info 提示
这些函数接口是用 [TypeScript 函数类型表达式语法](https://www.typescriptlang.org/docs/handbook/2/functions.html#function-type-expressions)编写的。
:::

| 功能     | 描述                                                         | 签名                                                            |
| -------- | ------------------------------------------------------------ | --------------------------------------------------------------- |
| `debug`  | 以列表形式打印所有已注册模块及其控制器和提供程序。           | `debug(moduleCls?: ClassRef \| string) => void`                |
| `get` 或 `$` | 获取可注入对象或控制器的实例，否则抛出异常。                 | `get(token: InjectionToken) => any`                            |
| `help`    | 显示所有可用的 REPL 原生函数。                               | `help() => void`                                                |
| `methods` | 显示给定提供者或控制器上所有可用的公共方法。                 | `methods(token: ClassRef \| string) => void`                   |
| `resolve` | 解析可注入对象或控制器的临时或请求作用域实例，否则抛出异常。 | `resolve(token: InjectionToken, contextId: any) => Promise<any>` |
| `select` | 允许在模块树中进行导航，例如从选定的模块中提取特定实例。     | `select(token: DynamicModule \| ClassRef) => INestApplicationContext` |

#### 监视模式

在开发过程中，以监视模式运行 REPL 非常有用，它能自动反映所有代码变更：

```bash
$ npm run start -- --watch --entryFile repl

```

这种方式存在一个缺陷：每次重新加载后 REPL 的命令历史记录都会被丢弃，这可能带来不便。幸运的是，有个非常简单的解决方案。像这样修改你的 `bootstrap` 函数：

```typescript
async function bootstrap() {
  const replServer = await repl(AppModule);
  replServer.setupHistory('.nestjs_repl_history', (err) => {
    if (err) {
      console.error(err);
    }
  });
}

```

现在运行/重新加载之间的历史记录都能保留了。
