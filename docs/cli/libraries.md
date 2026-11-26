<!-- 此文件从 content/cli/libraries.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:21:52.457Z -->
<!-- 源文件: content/cli/libraries.md -->
<!-- 源哈希: 449cda9d6e82f2cacb0fa80e8a219887 -->

### 库

许多应用程序需要解决相同的一般问题，或在多个上下文中重用模块化组件。Nest 提供了几种方法来解决这个问题。每种方法在不同层面工作，有助于满足不同的架构和组织目标。

Nest [modules](/modules) 提供了一个执行上下文，允许组件在单个应用程序内共享。您还可以使用 [npm](https://npmjs.com) 将模块打包，创建可重用的库，供不同项目安装。这是向松散连接或不隶属的组织分发可配置、可重用库的有效方式（例如，分发和安装第三方库）。

对于在紧密组织的组内（例如，在公司或项目边界内）共享代码，更轻量级的方法可能很有用。Monorepo 应运而生，以实现这一点，在 monorepo 中，**库** 提供了一种轻量级的方式来共享代码。在 Nest monorepo 中，库使得组装共享组件的应用程序变得简单。这也鼓励您分解单体应用程序，并将开发重点放在构建和组合模块化组件上。

#### Nest 库

Nest 库是一个 Nest 项目，与应用程序不同，它不能独立运行。库必须被导入到包含的应用程序中，其代码才能执行。本节描述的内置库支持仅适用于 **monorepo**（标准模式项目可以使用 npm 包实现类似功能）。

例如，一个组织可能会开发一个 `AuthModule`，通过实现管理所有内部应用程序的公司策略来管理认证。与其为每个应用程序单独构建该模块，或将代码打包到 npm 并要求每个项目安装它，不如在 monorepo 中将该模块定义为库。以这种方式组织，所有库模块的消费者都能在提交后立即看到 `AuthModule` 的最新版本。这可以显著帮助协调组件的开发和组装，并简化端到端测试。

#### 创建库

任何适合重用的功能都是库的候选者。决定什么应该是库，什么应该作为应用程序的一部分，是一个架构设计决策。创建库不仅仅是从现有应用程序复制代码到其中：库代码必须与应用程序解耦。这可能前期需要**更多**时间，并强制做出您在耦合度更高的代码中不会面临的设计决策。当库能让您更快地组装多个应用程序时，这些努力就会得到回报。

要创建库，运行以下命令：

```bash
$ nest g library my-library

```

运行该命令时，`library` 模式提示您为库提供一个前缀（也称为别名）：

```bash
What prefix would you like to use for the library (default: @app or 'defaultLibraryPrefix' setting value)?

```

默认前缀是 `@app`，除非您的 `nest-cli.json` 文件设置了 `defaultLibraryPrefix` 属性。

该命令在您的工作空间中创建一个名为 `my-library` 的新项目。与应用程序类型的项目一样，库类型的项目由模式生成到一个命名的文件夹中。库位于 monorepo 根目录的 `libs` 文件夹中。当您创建第一个库时，Nest 会创建 `libs` 文件夹。

为库生成的文件与为应用程序生成的文件的略有不同。以下是在运行上述命令后 `libs` 文件夹的内容：

<div class="file-tree">
  <div class="item">libs</div>
  <div class="children">
    <div class="item">my-library</div>
    <div class="children">
      <div class="item">src</div>
      <div class="children">
        <div class="item">index.ts</div>
        <div class="item">my-library.module.ts</div>
        <div class="item">my-library.service.ts</div>
      </div>
      <div class="item">tsconfig.lib.json</div>
    </div>
  </div>
</div>

`nest-cli.json` 文件现在在 `"projects"` 键下为库添加了一个新条目：

```javascript
...
{
    "my-library": {
      "type": "library",
      "root": "libs/my-library",
      "entryFile": "index",
      "sourceRoot": "libs/my-library/src",
      "compilerOptions": {
        "tsConfigPath": "libs/my-library/tsconfig.lib.json"
      }
}
...

```

`nest-cli.json` 元数据在库和应用程序之间存在两个区别：

- `"type"` 属性被设置为 `"library"` 而不是 `"application"`
- `"entryFile"` 属性被设置为 `"index"` 而不是 `"main"`

这些区别告诉构建过程如何适当处理库。例如，库通过 `index.js` 文件导出其功能。

与应用程序类型的项目一样，每个库都有自己的 `tsconfig.lib.json` 文件，该文件扩展了根（monorepo 范围的）`tsconfig.json` 文件。您可以修改此文件以提供库特定的编译器选项。

要构建库，运行：

```bash
$ nest build my-library

```

#### 使用库

在配置文件到位后，使用库非常简单。假设您想在 `my-project` 应用程序中使用 `MyLibraryService` 来自 `my-library` 库。

使用库模块的方式与使用任何其他 Nest 模块相同。monorepo 管理路径，因此导入库和生成构建是透明的。要使用 `MyLibraryService`，请导入其声明的模块。按如下方式修改 `my-project/src/app.module.ts` 以导入 `MyLibraryModule`：

```typescript
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { MyLibraryModule } from '@app/my-library';

@Module({
  imports: [MyLibraryModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

```

上面的 `import` 语句使用了 `@app` 路径别名，这是我们提供给 `nest g library` 命令的 `prefix`。Nest 通过 tsconfig 路径映射来实现这一点。当您添加一个库时，Nest 会像这样更新全局（monorepo）`tsconfig.json` 文件的 `"paths"` 键：

```javascript
"paths": {
    "@app/my-library": [
        "./libs/my-library/src"
    ],
    "@app/my-library/*": [
        "./libs/my-library/src/*"
    ]
}

```

在 ESM 项目中，第一个条目指向库的入口文件（`./libs/my-library/src/index.ts`）。

> warning **警告** `paths` 映射仅被 TypeScript 编译器理解。测试运行器会自行解析模块。如果您使用 Jest 运行应用程序的端到端测试，请在应用程序的 e2e Jest 配置 `moduleNameMapper` 选项中镜像每个别名，例如：`"moduleNameMapper": { "^@app/my-library(|/.*)$": "<rootDir>/../../libs/my-library/src/$1" }`。否则，即使项目编译成功，通过别名的导入在测试运行时也会失败。

Monorepo 和 library 功能结合使用，使得将库模块包含到应用程序中变得简单。

相同的机制允许您构建和部署组合了库的应用程序。一旦导入了 `MyLibraryModule`，`nest build` 会自动处理模块解析，并将应用程序以及任何库依赖项打包以供部署。monorepo 的默认编译器是 **Rspack**，因此输出是一个打包了所有转译 JavaScript 的单个文件。您可以按照 [Global compiler options](/cli/workspaces#global-compiler-options) 中的描述切换到 `tsc`。