<!-- 此文件从 content/cli/scripts.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:22:06.615Z -->
<!-- 源文件: content/cli/scripts.md -->
<!-- 源哈希: 1ecebf7f5363e5cbf09fb893f4f7905d -->

### Nest CLI 和脚本

本节解释了 `nest` 命令如何与编译器和脚本交互，以帮助 DevOps 人员管理开发环境。

Nest 应用程序是一个**标准** TypeScript 应用程序，在运行之前必须编译成 JavaScript。处理编译步骤有多种方法，开发人员和团队可以自由选择最适合自己的方式。考虑到这一点，Nest 提供了开箱即用的工具集，旨在：

- 提供一个标准的构建/执行流程，可在命令行中访问，并具有合理的默认设置。
- 保持构建/执行流程**开放**，以便开发人员可以直接访问底层工具，并使用其原生功能和选项进行自定义。
- 保持一个完全标准的 TypeScript/Node.js 框架，因此团队选择的任何外部工具都可以管理整个编译/部署/执行流程。

Nest 通过结合 `nest` 命令、本地安装的 TypeScript 编译器和 `package.json` 脚本来实现这一点。下文描述了这些部分如何协同工作、构建/执行流程的每一步会发生什么，以及如何自定义该行为。

#### nest 二进制文件

`nest` 命令是一个操作系统级别的二进制文件（即它从 OS 命令行运行）。它涵盖了以下三个不同领域，如下所述。我们建议通过项目脚手架生成时产生的 `package.json` 脚本来运行构建（`nest build`）和执行（`nest start`）子命令（如果偏好先克隆仓库而不是运行 `nest new`，请参阅 [typescript starter](https://github.com/nestjs/typescript-starter)）。

#### 构建

`nest build` 是对标准 `tsc` 或 `swc` 编译器（用于 [standard projects](/cli/overview#项目结构)）或 Rspack 打包器（用于 [monorepos](/cli/overview#项目结构)）的封装。除了处理 `tsconfig-paths` 和运行任何启用的 CLI 插件外，它本身不添加任何编译功能或步骤。它的存在是因为大多数开发人员，尤其是在刚开始使用 Nest 时，不需要调整编译器选项（例如在 `tsconfig.json` 文件中），而这可能很棘手。

有关更多详细信息，请参阅 [nest build](/cli/usages#nest-build) 文档。

#### 执行

`nest start` 确保项目已构建（与 `nest build` 相同），然后以可移植的方式调用 `node` 命令来执行编译后的应用程序。与构建一样，您可以通过 `nest start` 命令及其选项来自定义此过程，或者完全替换它。整个过程是一个标准的 TypeScript 构建和执行流程，您可以像这样管理它。

有关更多详细信息，请参阅 [nest start](/cli/usages#nest-start) 文档。

#### 生成

`nest generate` 命令在工作空间内生成新的组件、新的应用程序和库。（要创建新项目，请使用 `nest new`。）

#### 包脚本

在 OS 命令行级别运行 `nest` 命令需要全局安装 `nest` 二进制文件。这是标准的 npm 功能，不直接受 Nest 控制。一个后果是，全局安装的 `nest` 二进制文件**不**作为 `package.json` 中的项目依赖项进行管理，因此两个开发人员可以运行两个不同版本的它。标准的解决方案是使用包脚本，这样您可以将构建和执行步骤中使用的工具视为开发依赖项。

当您运行 `nest new` 或克隆 [typescript starter](https://github.com/nestjs/typescript-starter) 时，Nest 会使用诸如 `build` 和 `start` 这样的命令填充新项目的 `package.json` 脚本。它还会将底层编译器工具（如 `typescript`）作为**开发依赖项**安装。

您使用诸如以下命令来运行构建和执行脚本：

```bash
$ npm run build

```

和

```bash
$ npm run start

```

这些命令使用 npm 的脚本运行器来使用**本地安装的** `nest` 二进制文件执行 `nest build` 或 `nest start`。通过使用这些内置的包脚本，您可以完全管理 Nest CLI 命令的依赖项\*。通过遵循此**推荐**用法，您组织的所有成员运行相同版本的命令。

\*这适用于 `build` 和 `start` 命令。`nest new` 和 `nest generate` 命令不属于构建/执行流程的一部分，因此它们在不同的上下文中操作，不带有内置的 `package.json` 脚本。

我们建议大多数开发人员和团队使用包脚本来构建和运行他们的 Nest 项目。您可以根据需要通过脚本的选项来自定义这些脚本的行为，并自定义 `tsc`、`swc` 或 Rspack 配置文件（例如 `tsconfig.json`）。您也可以自由地运行一个完全自定义的构建过程来编译 TypeScript（甚至直接使用 `ts-node` 执行 TypeScript）。

#### 向后兼容性

由于 Nest 应用程序是纯 TypeScript 应用程序，先前版本的 Nest 构建/执行脚本仍然有效。您不需要升级它们。当您准备好时，可以采用 `nest build` 和 `nest start` 命令，或者继续运行您以前的或自定义的脚本。

#### 迁移

您不需要进行任何更改，但您可能希望切换到 CLI 命令，而不是像 `tsc-watch` 或 `ts-node` 这样的工具。为此，请全局和本地安装 `@nestjs/cli` 的最新版本：

```bash
$ npm install -g @nestjs/cli
$ cd /some/project/root/folder
$ npm install -D @nestjs/cli

```

然后用以下内容替换 `package.json` 中定义的 `scripts`：

```typescript
"build": "nest build",
"start": "nest start",
"start:dev": "nest start --watch",
"start:debug": "nest start --debug --watch",

```