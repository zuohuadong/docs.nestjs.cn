<!-- 此文件从 content/cli/overview.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:37:47.680Z -->
<!-- 源文件: content/cli/overview.md -->
<!-- 源哈希: 926a8d176ebc869d503b3ad355b2e0f9 -->

### 概述

[Nest CLI](https://github.com/nestjs/nest-cli) 是一个命令行工具，可帮助您初始化、开发和维护 Nest 应用程序。它可脚手架项目，在开发模式下提供服务，并为生产环境构建和打包。它还体现了最佳实践的架构模式，以鼓励构建结构良好的应用程序。

#### 安装

**注意**：本指南使用 [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) 来安装包，包括 Nest CLI。如果您有偏好，可以使用其他包管理器。npm 提供了几种方式来控制操作系统命令行如何解析 `nest` 二进制文件。在这里，我们使用 `-g` 选项全局安装它。这很方便，也是其余文档所假设的方法。请记住，当您全局安装**任何** npm 包时，您有责任确保运行的是正确的版本。这也意味着所有项目都运行**相同**版本的 CLI。一个合理的替代方案是 npm CLI 内置的 [npx](https://github.com/npm/cli/blob/latest/docs/lib/content/commands/npx.md) 程序（其他包管理器具有类似功能），它确保您运行的是 Nest CLI 的**受管版本**。有关更多信息，请参阅 [npx documentation](https://github.com/npm/cli/blob/latest/docs/lib/content/commands/npx.md) 或您的 DevOps 团队。

使用 `npm install -g` 命令全局安装 CLI（有关全局安装的详细信息，请参阅上面的**注意**）。

```bash
$ npm install -g @nestjs/cli

```

> info **提示** 此外，运行 `npx @nestjs/cli@latest` 可以不全局安装 CLI 即可使用它。

#### 基本工作流程

安装 CLI 后，您可以通过 `nest` 可执行文件从操作系统命令行调用其命令。要列出可用命令，请运行：

```bash
$ nest --help

```

要获取单个命令的详细帮助，请向其传递 `--help`。在下面的示例中，将任何命令（例如 `new` 或 `add`）替换为 `generate`：

```bash
$ nest generate --help

```

要以开发模式创建、构建和运行新的 Nest 项目，请进入应包含新项目的文件夹并运行以下命令：

```bash
$ nest new my-nest-project
$ cd my-nest-project
$ npm run start:dev

```

`new` 命令提示您选择一个模块系统：ESM（默认），使用 Vitest 进行测试，或 CommonJS，使用 Jest。两者都使用 oxlint 进行代码检查。有关其他提示和选项，请参阅 [`nest new`](/cli/usages#nest-new)。

在浏览器中打开 [http://localhost:3000](http://localhost:3000) 查看新应用程序正在运行。每当您更改源文件时，应用程序都会自动重新编译和重新加载。

> info **提示** 为了更快的构建速度，我们推荐使用 [SWC builder](/recipes/swc)，它比默认的 TypeScript 编译器快约 10 倍。

> info **提示** 对于小型项目，`nest new my-nest-project --minimal` 会生成一个代码为单个文件的应用程序，之后您可以逐步扩展。请参阅 [One-file projects](/cli/usages#one-file-projects)。

#### 项目结构

当您运行 `nest new` 时，Nest 会创建一个新文件夹并用一个样板应用程序填充它。您可以继续在此默认结构中工作，并按照本文档描述添加新组件。我们称由 `nest new` 生成的项目结构为**标准模式**。Nest 还支持一种用于管理多个项目和库的替代结构，称为**monorepo 模式**。

这两种模式仅在**构建**过程的工作方式和内置 [library](/cli/libraries) 支持上有所不同（monorepo 模式简化了在 monorepo 风格项目结构中可能出现的构建复杂性）。所有其他 Nest 功能和本文档对两者均适用。您可以随时从标准模式切换到 monorepo 模式，因此在学习 Nest 的过程中可以安全地推迟此决定。

您可以使用任一模式来管理多个项目。下表总结了它们的区别：

| 特性 | 标准模式 | Monorepo 模式 |
| :--- | :--- | :--- |
| 多个项目 | 独立的文件系统结构 | 单一文件系统结构 |
| `node_modules` & `package.json` | 独立的实例 | 跨 monorepo 共享 |
| 默认编译器 | `tsc` | rspack |
| 编译器设置 | 分别指定 | Monorepo 默认设置，可按项目覆盖 |
| 代码检查和格式化配置文件 | 分别指定 | 跨 monorepo 共享 |
| `nest build` 和 `nest start` 命令 | 目标默认自动设置为上下文中的（唯一）项目 | 目标默认设置为 monorepo 中的**默认项目** |
| 库 | 手动管理，通常通过 npm 打包 | 内置支持，包括路径管理和打包 |

请参阅 [Workspaces](/cli/workspaces) 和 [Libraries](/cli/libraries) 以获取更多详细信息，帮助您决定哪种模式最适合您。

<app-banner-courses></app-banner-courses>

#### CLI 命令语法

所有 `nest` 命令遵循相同的格式：

```bash
nest commandOrAlias requiredArg [optionalArg] [options]

```

例如：

```bash
$ nest new my-nest-project --dry-run

```

在此，`new` 是 _commandOrAlias_；其别名是 `n`。`my-nest-project` 是 _requiredArg_。如果您在命令行中不提供 _requiredArg_，`nest` 将提示您提供。`--dry-run` 选项的简写形式是 `-d`。因此，以下命令等同于上面的命令：

```bash
$ nest n my-nest-project -d

```

大多数命令和一些选项都有别名。运行 `nest new --help` 查看它们。

#### 命令概述

运行 `nest <command> --help` 查看以下任何命令的选项。有关每个命令的详细描述，请参阅 [CLI command reference](/cli/usages)。

| 命令    | 别名 | 描述                                                                                    |
| ---------- | ----- | ---------------------------------------------------------------------------------------------- |
| `new`      | `n`   | 使用所有样板文件搭建一个新的 _standard mode_ 应用程序。                                   |
| `generate` | `g`   | 根据模式生成和/或修改文件。                                                              |
| `build`    |       | 将应用程序或工作空间编译到输出文件夹中。                                                   |
| `start`    |       | 编译并运行应用程序（或工作空间中的默认项目）。                                             |
| `add`      |       | 导入已打包为 **nest library** 的库，并运行其安装模式。                                 |
| `upgrade`  | `update` | 将现有项目升级到最新的 NestJS 主版本。                                                    |
| `deploy`   |       | 使用 [Mau](https://mau.nestjs.com/) 将您的应用程序部署到云端。                                                     |
| `info`     | `i`   | 显示已安装的 Nest 包和其他有用的系统信息。                                                 |

#### 要求

CLI 二进制文件本身在 **Node.js v20.11 或更高版本**上运行，但 `nest new`、`nest generate` 和 `nest upgrade`（`@nestjs/schematics`）背后的模式要求 **Node.js v22.22.3+、v24.15+ 或 v26+**。运行 Nest 应用程序的最低要求较低（参见迁移指南中的 [Node.js requirements](/migration-guide#nodejs-requirements)）。如果您在开发机器上生成代码，请使用最新的活跃 LTS 版本。

Nest CLI 还要求使用构建了 [internationalization support](https://nodejs.org/api/intl.html) (ICU) 的 Node.js 二进制文件，例如来自 [Node.js download page](https://nodejs.org/en/download) 的官方二进制文件。如果您遇到与 ICU 相关的错误，请检查您的二进制文件是否满足此要求：

```bash
node -p process.versions.icu

```

如果命令打印 `undefined`，则您的 Node.js 二进制文件没有国际化支持。