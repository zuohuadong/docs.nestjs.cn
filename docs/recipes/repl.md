<!-- 此文件从 content/recipes/repl.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:36:46.708Z -->
<!-- 源文件: content/recipes/repl.md -->
<!-- 源哈希: 0f0899a862f41363ac280fe1aa2bd8e0 -->

### 读取-求值-打印-循环 (REPL)

REPL 是一个交互式环境，它接收单用户输入，执行它们，并将结果返回给用户。REPL 功能允许您直接从终端检查依赖图并调用提供者（和控制器）上的方法。

#### 用法

要在 REPL 模式下运行您的 NestJS 应用程序，请创建一个新的 `repl.ts` 文件（与现有的 `main.ts` 文件并列），并添加以下代码：

```typescript title="repl.ts"
import { repl } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  await repl(AppModule);
}
await bootstrap();

```

然后使用以下命令从终端启动 REPL：

```bash
$ npm run start -- --entryFile repl

```

> info **提示** `repl()` 函数返回一个 promise，该 promise 解析为一个 [Node.js REPL server](https://nodejs.org/api/repl.html) 对象。您可以将其作为第二个参数传递给 [Node.js REPL options](https://nodejs.org/api/repl.html#replstartoptions)。

一旦它运行起来，您应该在控制台中看到以下消息：

```bash
LOG [NestFactory] Starting Nest application...
LOG [InstanceLoader] AppModule dependencies initialized
LOG REPL initialized

```

现在您可以与依赖图进行交互。例如，您可以检索 `AppService` 实例（此示例使用启动项目）并调用其 `getHello()` 方法：

```typescript
> get(AppService).getHello()
'Hello World!'

```

您可以从终端执行任何 JavaScript 代码。例如，您可以将 `AppController` 实例分配给一个局部变量，并使用 `await` 来调用一个异步方法：

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

要将所有注册的模块及其控制器和提供者作为列表打印出来，请使用 `debug()`：

```typescript
> debug()

AppModule:
 - controllers:
  ◻ AppController
 - providers:
  ◻ AppService

```

这是一个快速演示：

<figure><img src="/assets/repl.gif" alt="REPL example" /></figure>

下一节将更详细地描述内置的原生函数。

#### 原生函数

内置的 NestJS REPL 包含一些原生函数，当您启动 REPL 时它们全局可用。调用 `help()` 来列出它们。

如果您不记得某个函数的签名（即预期的参数和返回类型），请使用 `<function_name>.help`。例如：

```text
> $.help
Retrieves an instance of either injectable or controller, otherwise, throws exception.
Interface: $(token: InjectionToken) => any

```

> info **提示** 这些函数接口是用 [TypeScript function type expression syntax](https://www.typescriptlang.org/docs/handbook/2/functions.html#function-type-expressions) 编写的。

| 函数 | 描述 | 签名 |
| :--- | :--- | :--- |
| `debug` | 将所有注册的模块及其控制器和提供者作为列表打印出来。传入一个模块（例如 `debug(MyModule)`）以仅打印该模块的组件。 | `debug(moduleCls?: ClassRef \| string) => void` |
| `get` 或 `$` | 检索提供者或控制器的实例；如果找不到则抛出异常。 | `get(token: InjectionToken) => any` |
| `help` | 显示所有可用的 REPL 原生函数。 | `help() => void` |
| `methods` | 显示给定提供者或控制器上所有可用的公共方法。 | `methods(token: ClassRef \| string) => void` |
| `resolve` | 解析提供者或控制器的瞬态或请求作用域实例；如果找不到则抛出异常。 | `resolve(token: InjectionToken, contextId: any) => Promise<any>` |
| `select` | 遍历模块树，例如，从选定的模块中提取特定实例。 | `select(token: DynamicModule \| ClassRef) => INestApplicationContext` |

#### 监视模式

在开发过程中，最好以监视模式运行 REPL，以便代码更改自动反映：

```bash
$ npm run start -- --watch --entryFile repl

```

缺点是每次重新加载后 REPL 的命令历史都会被丢弃。要保留历史记录，请按如下方式修改您的 `bootstrap()` 函数：

```typescript
async function bootstrap() {
  const replServer = await repl(AppModule);
  replServer.setupHistory(".nestjs_repl_history", (err) => {
    if (err) {
      console.error(err);
    }
  });
}

```

现在，历史记录在运行和重新加载之间得以保留。