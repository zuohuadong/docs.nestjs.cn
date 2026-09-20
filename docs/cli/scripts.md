<!-- 此文件从 content/cli/scripts.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-13T08:25:19.094Z -->
<!-- 源文件: content/cli/scripts.md -->
<!-- 源哈希: fc1007893049fc1f41bccd0b7acd2d5b -->

### Nest CLI 与脚本

本节提供关于 `nest` 命令如何与编译器和脚本交互的额外背景信息，以帮助 DevOps 人员管理开发环境。

Nest 应用程序是一个**标准**的 TypeScript 应用程序，需要先编译为 JavaScript 才能执行。有多种方式可以完成编译步骤，开发者/团队可以自由选择最适合他们的方式。基于此，Nest 提供了一套开箱即用的工具，旨在实现以下目标：

- 提供标准的构建/执行流程，可通过命令行使用，并具有合理的默认配置，能够"直接运行"。
- 确保构建/执行流程是**开放的**，使开发者能够直接访问底层工具，利用其原生特性和选项进行自定义。
- 保持为完全标准的 TypeScript/Node.js 框架，以便整个编译/部署/执行流水线可以由开发团队选择的任何外部工具进行管理。

这一目标通过 `nest` 命令、本地安装的 TypeScript 编译器以及 `package.json` 脚本的组合来实现。下面我们将描述这些技术如何协同工作。这应该有助于您理解构建/执行过程中每一步所发生的事情，以及如何在必要时自定义该行为。

#### nest 二进制文件

`nest` 命令是一个操作系统级别的二进制文件（即，从操作系统命令行运行）。该命令实际上包含 3 个不同的领域，如下所述。我们建议您通过项目脚手架搭建时自动提供的 `package.json` 脚本来运行构建（`nest build`）和执行（`nest start`）子命令（如果您希望从克隆仓库开始，而不是运行 `nest new`，请参阅 [typescript starter](https://github.com/nestjs/typescript-starter)）。

#### 构建

`nest build` 是标准 `tsc` 编译器或 `swc` 编译器（用于 [standard projects](/cli/overview#项目结构)）或 Rspack 打包器（用于 [monorepos](/cli/overview#项目结构)）的封装。除了开箱即用地处理 `tsconfig-paths` 之外，它不添加任何其他编译特性或步骤。它存在的原因是大多数开发者，尤其是刚开始使用 Nest 时，不需要调整编译器选项（例如，`tsconfig.json` 文件），这些选项有时可能比较棘手。

有关更多详细信息，请参阅 [nest build](/cli/usages#nest-build) 文档。

#### 执行

`nest start` 只是确保项目已构建（与 `nest build` 相同），然后以可移植、简单的方式调用 `node` 命令来执行编译后的应用程序。与构建一样，您可以根据需要自由自定义此过程，可以使用 `nest start` 命令及其选项，也可以完全替换它。整个过程是一个标准的 TypeScript 应用程序构建和执行流水线，您可以自由地以这种方式管理该过程。

有关更多详细信息，请参阅 [nest start](/cli/usages#nest-start) 文档。

#### 生成

顾名思义，`nest generate` 命令用于生成新的 Nest 项目或其中的组件。

#### 包脚本

在操作系统命令行级别运行 `nest` 命令需要全局安装 `nest` 二进制文件。这是 npm 的标准功能，不在 Nest 的直接控制范围内。这样做的一个后果是，全局安装的 `nest` 二进制文件**不**作为项目依赖项在 `package.json` 中进行管理。例如，两个不同的开发者可能运行着两个不同版本的 `nest` 二进制文件。标准的解决方案是使用包脚本，这样您就可以将构建和执行步骤中使用的工具视为开发依赖项。

当您运行 `nest new` 或克隆 [typescript starter](https://github.com/nestjs/typescript-starter) 时，Nest 会使用诸如 `build` 和 `start` 之类的命令填充新项目的 `package.json` 脚本。它还会将底层编译器工具（如 `typescript`）安装为**开发依赖项**。

您可以使用如下命令运行构建和执行脚本：

```bash
$ npm run build

```

以及

```bash
$ npm run start

```

这些命令使用 npm 的脚本运行功能，通过**本地安装**的 `nest` 二进制文件来执行 `nest build` 或 `nest start`。通过使用这些内置的包脚本，您可以对 Nest CLI 命令进行完整的依赖管理\*。这意味着，通过遵循这种**推荐**用法，您组织中的所有成员都可以确保运行相同版本的命令。

\*这适用于 `build` 和 `start` 命令。`nest new` 和 `nest generate` 命令不属于构建/执行流水线的一部分，因此它们在不同的上下文中运行，并且不附带内置的 `package.json` 脚本。

对于大多数开发者/团队，建议使用包脚本来构建和执行他们的 Nest 项目。您可以通过其选项完全自定义这些脚本的行为，和/或根据需要自定义 `tsc`、`swc` 或 Rspack 编译器选项文件（例如，`tsconfig.json`）。您也可以自由地运行完全自定义的构建过程来编译 TypeScript（甚至可以使用 `ts-node` 直接执行 TypeScript）。

#### 向后兼容性

由于 Nest 应用程序是纯 TypeScript 应用程序，以前版本的 Nest 构建/执行脚本将继续运行。您不需要升级它们。您可以在准备好时选择利用新的 `nest build` 和 `nest start` 命令，或者继续运行以前的或自定义的脚本。

#### 迁移

虽然您不需要进行任何更改，但您可能希望迁移到使用新的 CLI 命令，而不是使用诸如 `tsc-watch` 或 `ts-node` 之类的工具。在这种情况下，只需在全局和本地安装最新版本的 `@nestjs/cli`：

```bash
$ npm install -g @nestjs/cli
$ cd  /some/project/root/folder
$ npm install -D @nestjs/cli

```

然后，您可以将 `package.json` 中定义的 `scripts` 替换为以下内容：

```typescript
"build": "nest build",
"start": "nest start",
"start:dev": "nest start --watch",
"start:debug": "nest start --debug --watch",

```