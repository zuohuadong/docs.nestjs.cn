<!-- 此文件从 content/cli/usages.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-03-12T13:42:20.320Z -->
<!-- 源文件: content/cli/usages.md -->

### CLI 命令参考

#### nest new

创建一个新的（标准模式）Nest 项目。

```bash
$ nest new <name> [options]
$ nest n <name> [options]

```

##### 描述

创建并初始化一个新的 Nest 项目。提示选择包管理器。

- 创建具有给定 `<name>` 的文件夹
- 用配置文件填充该文件夹
- 为源代码（`/src`）和端到端测试（`/test`）创建子文件夹
- 用应用程序组件和测试的默认文件填充子文件夹

##### 参数

| 参数 | 描述 |
| --- | --- |
| `<name>` | 新项目的名称 |

##### 选项

| 选项 | 描述 |
| --- | --- |
| `--dry-run` | 报告将进行的更改，但不更改文件系统。<br/> 别名：`-d` |
| `--skip-git` | 跳过 git 仓库初始化。<br/> 别名：`-g` |
| `--skip-install` | 跳过包安装。<br/> 别名：`-s` |
| `--package-manager [package-manager]` | 指定包管理器。使用 `npm`、`yarn` 或 `pnpm`。包管理器必须全局安装。<br/> 别名：`-p` |
| `--language [language]` | 指定编程语言（`TS` 或 `JS`）。<br/> 别名：`-l` |
| `--collection [collectionName]` | 指定原理集合。使用包含原理的已安装 npm 包的包名。<br/> 别名：`-c` |
| `--strict` | 启动项目时启用以下 TypeScript 编译器标志：`strictNullChecks`、`noImplicitAny`、`strictBindCallApply`、`forceConsistentCasingInFileNames`、`noFallthroughCasesInSwitch` |

#### nest generate

根据原理生成和/或修改文件

```bash
$ nest generate <schematic> <name> [options]
$ nest g <schematic> <name> [options]

```

##### 参数

| 参数 | 描述 |
| --- | --- |
| `<schematic>` | 要生成的 `schematic` 或 `collection:schematic`。有关可用的原理，请参见下表。 |
| `<name>` | 生成的组件的名称。 |

##### 原理

| 名称 | 别名 | 描述 |
| --- | --- | --- |
| `app` | | 在 monorepo 中生成新应用程序（如果是标准结构，则转换为 monorepo）。 |
| `library` | `lib` | 在 monorepo 中生成新库（如果是标准结构，则转换为 monorepo）。 |
| `class` | `cl` | 生成新类。 |
| `controller` | `co` | 生成控制器声明。 |
| `decorator` | `d` | 生成自定义装饰器。 |
| `filter` | `f` | 生成过滤器声明。 |
| `gateway` | `ga` | 生成网关声明。 |
| `guard` | `gu` | 生成守卫声明。 |
| `interface` | `itf` | 生成接口。 |
| `interceptor` | `itc` | 生成拦截器声明。 |
| `middleware` | `mi` | 生成中间件声明。 |
| `module` | `mo` | 生成模块声明。 |
| `pipe` | `pi` | 生成管道声明。 |
| `provider` | `pr` | 生成提供者声明。 |
| `resolver` | `r` | 生成解析器声明。 |
| `resource` | `res` | 生成新的 CRUD 资源。有关更多详细信息，请参阅 [CRUD（资源）生成器](/recipes/crud-generator)。（仅限 TS） |
| `service` | `s` | 生成服务声明。 |

##### 选项

| 选项 | 描述 |
| --- | --- |
| `--dry-run` | 报告将进行的更改，但不更改文件系统。<br/> 别名：`-d` |
| `--project [project]` | 应添加元素的项目。<br/> 别名：`-p` |
| `--flat` | 不为元素生成文件夹。 |
| `--collection [collectionName]` | 指定原理集合。使用包含原理的已安装 npm 包的包名。<br/> 别名：`-c` |
| `--spec` | 强制生成 spec 文件（默认） |
| `--no-spec` | 禁用 spec 文件生成 |

#### nest build

将应用程序或工作区编译到输出文件夹。

此外，`build` 命令负责：

- 通过 `tsconfig-paths` 映射路径（如果使用路径别名）
- 使用 OpenAPI 装饰器注释 DTO（如果启用了 `@nestjs/swagger` CLI 插件）
- 使用 GraphQL 装饰器注释 DTO（如果启用了 `@nestjs/graphql` CLI 插件）

```bash
$ nest build <name> [options]

```

##### 参数

| 参数 | 描述 |
| --- | --- |
| `<name>` | 要构建的项目名称。 |

##### 选项

| 选项 | 描述 |
| --- | --- |
| `--path [path]` | `tsconfig` 文件的路径。<br/>别名 `-p` |
| `--config [path]` | `nest-cli` 配置文件的路径。<br/>别名 `-c` |
| `--watch` | 在监视模式下运行（实时重新加载）。<br /> 如果你使用 `tsc` 进行编译，可以输入 `rs` 重新启动应用程序（当 `manualRestart` 选项设置为 `true` 时）。<br/>别名 `-w` |
| `--builder [name]` | 指定用于编译的构建器（`tsc`、`swc` 或 `webpack`）。<br/>别名 `-b` |
| `--webpack` | 使用 webpack 进行编译（已弃用：改用 `--builder webpack`）。 |
| `--webpackPath` | webpack 配置的路径。 |
| `--tsc` | 强制使用 `tsc` 进行编译。 |
| `--watchAssets` | 监视非 TS 文件（如 `.graphql` 等资产）。有关更多详细信息，请参阅[资产](/cli/workspaces#资产)。 |
| `--type-check` | 启用类型检查（当使用 SWC 时）。 |
| `--all` | 构建 monorepo 中的所有项目。 |
| `--preserveWatchOutput` | 在监视模式下保留过时的控制台输出，而不是清屏。（仅限 `tsc` 监视模式） |

#### nest start

编译并运行应用程序（或工作区中的默认项目）。

```bash
$ nest start <name> [options]

```

##### 参数

| 参数 | 描述 |
| --- | --- |
| `<name>` | 要运行的项目名称。 |

##### 选项

| 选项 | 描述 |
| --- | --- |
| `--path [path]` | `tsconfig` 文件的路径。<br/>别名 `-p` |
| `--config [path]` | `nest-cli` 配置文件的路径。<br/>别名 `-c` |
| `--watch` | 在监视模式下运行（实时重新加载）<br/>别名 `-w` |
| `--builder [name]` | 指定用于编译的构建器（`tsc`、`swc` 或 `webpack`）。<br/>别名 `-b` |
| `--preserveWatchOutput` | 在监视模式下保留过时的控制台输出，而不是清屏。（仅限 `tsc` 监视模式） |
| `--watchAssets` | 在监视模式下运行（实时重新加载），监视非 TS 文件（资产）。有关更多详细信息，请参阅[资产](/cli/workspaces#资产)。 |
| `--debug [hostport]` | 在调试模式下运行（使用 --inspect 标志）<br/>别名 `-d` |
| `--webpack` | 使用 webpack 进行编译。（已弃用：改用 `--builder webpack`） |
| `--webpackPath` | webpack 配置的路径。 |
| `--tsc` | 强制使用 `tsc` 进行编译。 |
| `--exec [binary]` | 要运行的二进制文件（默认：`node`）。<br/>别名 `-e` |
| `--no-shell` | 不在 shell 中生成子进程（参见 node 的 `child_process.spawn()` 方法文档）。 |
| `--env-file` | 从相对于当前目录的文件加载环境变量，使它们在 `process.env` 上对应用程序可用。 |
| `-- [key=value]` | 可以用 `process.argv` 引用的命令行参数。 |

#### nest add

导入已打包为 **nest 库**的库，运行其安装原理。

```bash
$ nest add <name> [options]

```

##### 参数

| 参数 | 描述 |
| --- | --- |
| `<name>` | 要导入的库名称。 |

##### 选项

| 选项                  | 描述                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `--dry-run`           | 报告将做出的更改，但不改变文件系统。<br/> 别名：`-d`                                        |
| `--skip-install`      | 跳过包安装。<br/> 别名：`-s`                                                               |
| `--project [project]` | 库应添加到的项目。<br/> 别名：`-p`                                                          |

#### nest upgrade

将现有项目升级到最新的 NestJS 主版本。

```bash
$ nest upgrade [options]
$ nest update [options]
```

##### 描述

在 NestJS v11 项目的根目录下运行 `nest upgrade`，它会将您的依赖项更新到 v12，并替您完成迁移中的机械化部分：

- 将所有可识别的 `@nestjs/*` 包升级到其 v12 兼容的主版本（`@nestjs/graphql`、`@nestjs/apollo` 和 `@nestjs/mercurius` 升级到 v14），并报告它不认识的其他 `@nestjs/*` 包，供您自行审查
- 将 `nest-cli.json` 从已弃用的 `webpack` / `webpackConfigPath` 选项迁移到 `--builder rspack`，并同步更新 `package.json` 中相应的脚本
- 将 GraphQL 的 `playground` 选项重命名为 `graphiql`，把订阅从 `subscriptions-transport-ws` 切换到 `graphql-ws`，并相应替换相关包
- 用 `@nats-io/transport-node` / `@nats-io/nats-core` 替换已过时的 `nats` 包，并重写 `nats` 的导入
- 将库特定的 `@nestjs/config` 设置移到 `validationOptions.libraryOptions` 之下，并将 Joi 升级到 v18（首个实现 Standard Schema 的版本）
- 在存在 Jest（以及 `@types/jest` / `ts-jest`）的地方进行升级，并在您的 Node.js 版本过旧、无法 `require()` 仅支持 ESM 的 v12 包时发出警告
- 可选地安装并接好 [`@nestjs/observe`](/observability/overview) —— 它会给出提示，除非您传入 `--observe` 或 `--no-observe`
- 扫描您的源代码并打印关于行为已变化但无法自动迁移之处的说明，例如生命周期钩子的顺序、更严格的管道签名以及结构化日志参数

该命令最后会安装更新后的依赖项（除非传入 `--skip-install`），并打印一份报告，列出它更改、警告和保留原样的所有内容。

> warning **警告** `nest upgrade` 只会升级**本地**的 `@nestjs/cli` 依赖。全局安装的 CLI 请自行更新：`npm i -g @nestjs/cli@latest` —— 并且要在运行升级**之前**进行，因为该命令本身随 CLI 一起发布。

> info **提示** 该原理（schematic）刻意不会将您的项目迁移到 ESM、Vitest 或 oxlint。这些是新生成的 v12 项目的默认配置，但现有项目可以按自己的节奏采用它们。完整情况请参阅[迁移指南](/migration-guide)。

##### 选项

| 选项                            | 描述                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `--dry-run`                     | 报告将做出的更改，但不改变文件系统。<br/> 别名：`-d`                                                                  |
| `--skip-install`                | 跳过包安装。<br/> 别名：`-s`                                                                                         |
| `--observe` / `--no-observe`    | 设置 `@nestjs/observe`，或完全跳过设置。两者都不传则会给出提示。                                                        |
| `--tag [tag]`                   | 使用 npm dist-tag（例如 `next`）而不是默认的版本范围。<br/> 别名：`-t`                                                |
| `--collection [collectionName]` | 指定 schematics 集合。使用包含 schematic 的已安装 npm 包的包名。<br/> 别名：`-c`                                       |

#### nest deploy

将您的应用程序部署到云端，由 [Mau](https://mau.nestjs.com/) 提供支持。

```bash
$ nest deploy [mau-options]
```

##### 描述

`nest deploy` 是 Mau CLI 的一个轻量封装。它会定位 Mau 的可执行文件，并将您传递的每个参数直接转发给 `mau deploy`，因此 Mau 支持的任何选项在这里都可以原样使用。

如果您的项目中尚未安装 Mau，该命令会提示将 `@nestjs/mau` 添加为开发依赖，然后继续。在非交互式环境（例如 CI）中，该命令会直接失败而不是给出提示，因此请先显式安装：

```bash
$ npm install --save-dev @nestjs/mau
```

由于 Mau 一旦启动就会接管终端，它的输出和显示的任何提示都会直接传递给您。Mau 的功能介绍和配置方法请参阅[部署章节](/deployment#easy-deployment-with-mau)。

#### nest info

显示有关已安装的 nest 包和其他有用的系统信息。例如：

```bash
$ nest info

```

```bash
 _   _             _      ___  _____  _____  _     _____
| \ | |           | |    |_  |/  ___|/  __ \| |   |_   _|
|  \| |  ___  ___ | |_     | |\ `--. | /  \/| |     | |
| . ` | / _ \/ __|| __|    | | `--. \| |    | |     | |
| |\  ||  __/\__ \| |_ /\__/ //\__/ /| \__/\| |_____| |_
\_| \_/ \___||___/ \__|\____/ \____/  \____/\_____/\___/

[System Information]
OS Version : macOS High Sierra
NodeJS Version : v20.18.0
[Nest Information]
microservices version : 10.0.0
websockets version : 10.0.0
testing version : 10.0.0
common version : 10.0.0
core version : 10.0.0

```
