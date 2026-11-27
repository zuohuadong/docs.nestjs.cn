<!-- 此文件从 content/cli/usages.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:38:32.224Z -->
<!-- 源文件: content/cli/usages.md -->
<!-- 源哈希: b8d0c17ff29ff11e3015e97405d2cfe2 -->

### CLI 命令参考

#### nest new

创建一个新的（标准模式）Nest 项目，或带有 `--minimal` 的 [one-file project](/cli/usages#one-file-projects)。

```bash
$ nest new <name> [options]
$ nest n <name> [options]

```

##### 描述

创建并初始化一个新的 Nest 项目。该命令会提示任何未作为选项传入的信息：项目名称、包管理器、模块系统（ESM 或 CommonJS）、是否设置 [NestJS Observe](/observability/overview)，以及哪些编码代理将获得 [NestJS agent skills](/first-steps#coding-agents)。每个问题都有一个答案选项。

> info **提示** 当 stdin 或 stdout 不是终端、设置了 `CI` 环境变量或您传入了 `--no-interactive`（对于看起来交互式但无人回答的终端，例如编码代理）时，该命令不会提示。然后它对您未用选项回答的每个问题使用默认值：名称 `nest-app`、运行 CLI 的包管理器（或 npm）、ESM、Observe 设置（直到您链接项目前不发送任何内容）以及 Codex、Cursor 和 Claude Code 的代理技能。它会打印它使用的每个默认值，例如 `Not prompting, so @nestjs/observe is set up (it sends nothing until you run npx @nestjs/observe link). Pass --no-observe to skip it.`

> info **提示** 选择 **ESM** 会搭建一个 ESM 优先的项目，使用 Vitest 进行测试。选择 **CommonJS** 会搭建传统的布局，使用 Jest。两种变体都使用 oxlint 进行代码检查。

该命令：

- 在给定 `<name>` 创建一个文件夹，或使用当前文件夹（通过 `nest new .`）。在已存在文件的文件夹中，项目不包含的文件保持不变，现有的 `README.md` 和 `.gitignore` 会被保留，如果任何其他文件将被覆盖，命令会列出它们并在写入任何内容之前停止。现有的 git 仓库保持不变。
- 用配置文件填充该文件夹
- 为源代码（`/src`）和端到端测试（`/test`，除非您传入 `--skip-tests` 或 `--minimal`）创建子文件夹
- 用应用程序组件和测试的默认文件填充子文件夹
- 如果设置了 Observe，在安装依赖项后提供将项目链接到它的选项（仅在交互式终端中）。接受后会运行 `npx @nestjs/observe link`，将应用密钥和密钥写入 `.env` - 参见 [Linking from the terminal](/observability/sdk#linking-from-the-terminal)。在没有终端的情况下，它会打印该命令，并附带一行提示编码代理运行它

##### 参数

| 参数 | 描述 |
| -------- | --------------------------- |
| `<name>` | 新项目的名称 |

##### 选项

| 选项 | 描述 |
| :--- | :--- |
| `--directory [directory]` | 目标目录。 |
| `--dry-run` | 报告将要进行的变更，而不更改文件系统。<br/> 别名: `-d` |
| `--skip-git` | 跳过 git 仓库初始化。<br/> 别名: `-g` |
| `--skip-install` | 跳过包安装。<br/> 别名: `-s` |
| `--skip-tests` | 创建不带测试的项目：没有 spec 或 e2e 文件，没有 Vitest 或 Jest 配置，没有测试脚本或测试依赖。与 `--minimal` 不同，保留模块、控制器和服务文件。<br/> 别名: `-t` |
| `--package-manager [package-manager]` | 要使用的包管理器：`npm`、`yarn`、`pnpm` 或 `bun`。包管理器必须全局安装。<br/> 别名: `-p` |
| `--language [language]` | 编程语言：`TS`（默认）或 `JS`。值不区分大小写，也接受 `typescript` / `javascript`。<br/> 别名: `-l` |
| `--type [type]` | 模块系统：`esm`（默认，使用 Vitest 测试）或 `cjs`（使用 Jest 测试）。`--minimal` 仅限 ESM，因此拒绝 `--minimal --type cjs`。 |
| `--collection [collectionName]` | 要使用的 Schematics 集合。传入包含该 schematic 的已安装 npm 包的包名。<br/> 别名: `-c` |
| `--strict` | 在生成的 `tsconfig.json` 中启用 TypeScript 的 `strict` 模式（禁用 `strictPropertyInitialization`）。默认启用，没有禁用它的标志：要选择退出，请在生成项目后在 `tsconfig.json` 中设置 `"strict": false`。 |
| `--format` | 使用 Prettier 格式化生成的文件。 |
| `--observe` / `--no-observe` | 在不提示的情况下设置 `@nestjs/observe` SDK，或跳过它。同时省略两者将在交互式终端中提示（提示默认为 yes）。当 `nest new` 不提示时（没有终端、设置了 `CI` 或 `--no-interactive`），会设置 Observe，直到您链接项目才会发送任何内容；传入 `--no-observe` 以跳过它。 |
| `--skills <agents>` | 添加这些编码代理的官方 [NestJS agent skills](https://github.com/nestjs/agent-skills)，用逗号分隔：`all`（`.agents/skills` 和 `.claude/skills`，用于 Codex、Cursor 和 Claude Code）、`agents`（`.agents/skills`）、`claude`（`.claude/skills`）、`cursor`（`.cursor/skills`）或 `none`。省略它将在交互式终端中提示（提示默认为 `all`）。当 `nest new` 不提示时（没有终端、设置了 `CI` 或 `--no-interactive`），使用 `all`。使用 `--skip-install` 时，技能不会被安装，并且会打印安装它们的命令。 |
| `--skip-skills` | 不添加 NestJS 代理技能。与 `--skills none` 相同。 |
| `--no-interactive` | 永不提示：回答所有没有标志可以回答的问题（名称 `nest-app`、运行 CLI 的包管理器或否则为 npm、ESM、Observe 设置以及 `all` 的代理技能），并打印它使用的默认值。当没有 stdin 和 stdout 终端，或设置了 `CI` 时，CLI 也不会提示；对于看起来交互式但没有人回答的终端（例如编码代理），请使用此标志。 |
| `--minimal` | 生成一个代码为单个文件、没有测试、linter 或格式化的应用程序，即 `src/main.ts`。参见 [One-file projects](/cli/usages#one-file-projects)。仅限 TypeScript 和 ESM。 | ##### 单文件项目 |

`nest new <name> --minimal` 为小型项目或第一个版本生成一个真实的 Nest 应用程序，不包含周围的布局：

```bash
src/main.ts      # a service, a controller, a module and the bootstrap call
package.json     # build, start, start:dev and start:prod scripts
tsconfig.json
.gitignore
AGENTS.md

```

```typescript
import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

@Injectable()
class AppService {
  getHello(): string {
    return 'Hello World!';
  }
}

@Controller()
class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}

@Module({
  controllers: [AppController],
  providers: [AppService],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

使用 `npm run start:dev` 运行它。它会像任何其他 Nest 项目一样经过 CLI，因为 TypeScript 编译器必须发出装饰器元数据，以便通过类型进行注入工作。在不发出它的工具（例如 `tsx`）下，上述 `appService` 是 `undefined`。

没有 `nest-cli.json`，因为 CLI 的默认值已经描述了这种布局，也没有测试、linter、格式化器或 README。需要时添加其中任何一个。

`nest generate` 在这里和任何其他地方一样工作。由于没有 `*.module.ts` 文件来注册内容，它使用 `src/main.ts` 中的模块：

```bash
$ nest g resource users

```

这写入 `src/users/` 并将 `UsersModule` 添加到 `src/main.ts` 的导入中。Spec 文件被省略，而 `package.json` 没有列出 `@nestjs/testing`：安装它或传入 `--spec` 以获取它们。当 `src/main.ts` 变长时，将模块移动到 `src/app.module.ts` 并导出它，然后 `nest generate` 在那里注册内容。

`nest generate` 查找一个 `@Module()` 类。如果您用传递给 `NestFactory.create()` 的元数据替换了 `AppModule`（参见 [Root module from metadata](/modules#root-module-from-metadata)），它仍然会写入文件，但会警告未找到模块且未注册任何内容。

其他适用于 `nest new` 的选项，但有以下区别：

- 拒绝 `--language js`。JavaScript 需要 Babel 及其自己的入口文件才能运行装饰器，因此项目不会保持为单个文件。
- 项目始终是 ESM，并且您不会被提示模块系统。对于 CommonJS，生成一个标准项目。
- `--observe` 将 SDK 连接到 `src/main.ts`。然后 `npx @nestjs/observe link` 像往常一样写入密钥对。如果没有 `--observe`，稍后添加 SDK 会使用 [three edits in its quick start](https://observe.nestjs.com/documentation/sdk#quick-start)，因为 `link` 在 `main.ts` 导入的文件中查找根模块。
- `--skip-tests` 没有可以跳过的内容。

#### nest generate

根据模式生成和/或修改文件。

```bash
$ nest generate <schematic> <name> [options]
$ nest g <schematic> <name> [options]

```

##### 参数

| 参数 | 描述 |
| :--- | :--- |
| `<schematic>` | 要生成的 `schematic` 或 `collection:schematic`。有关可用模式，请参阅下表。 |
| `<name>` | 生成组件的名称。如果省略，模式会提示输入。当 CLI 不提示时（参见 `--no-interactive`），则需要提供名称。|

##### 模式

| 名称 | 别名 | 描述 |
| :--- | :--- | :--- |
| `app` | | 在 monorepo 中生成新应用程序（将标准模式结构转换为 monorepo）。 |
| `library` | `lib` | 在 monorepo 中生成新库（将标准模式结构转换为 monorepo）。 |
| `class` | `cl` | 生成新类。 |
| `controller` | `co` | 生成控制器声明。 |
| `decorator` | `d` | 生成自定义装饰器。从 v12 开始，生成的装饰器使用 `Reflector.createDecorator()` 形式。 |
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
| `resource` | `res` | 生成新的 CRUD 资源（仅限 TypeScript）。参见 [CRUD (resource) generator](/recipes/crud-generator)。 |
| `service` | `s` | 生成服务声明。 |

##### 选项

| 选项 | 描述 |
| :--- | :--- |
| `--dry-run` | 报告将进行的更改，而不更改文件系统。<br/> 别名: `-d` |
| `--project [project]` | 元素应添加到哪个项目。在 monorepo 中，当 CLI 不提示时，使用默认项目。<br/> 别名: `-p`|
| `--flat` | 不为元素生成文件夹。 |
| `--no-flat` | 为元素生成文件夹。 |
| `--collection [collectionName]` | 要使用的模式集合。传入包含该模式的已安装 npm 包的包名。<br/> 别名: `-c` |
| `--spec` | 生成规范文件（默认，除非 `package.json` 不列出 `@nestjs/testing`）。 |
| `--no-spec` | 跳过生成规范文件。 |
| `--spec-file-suffix [suffix]` | 为规范文件使用自定义后缀。 |
| `--skip-import` | 跳过将生成的元素导入到其最近的模块中。 |
| `--format` | 使用 Prettier 格式化生成的文件。 |
| `--type <type>` | (仅 `resource`) 传输层：`rest`、`graphql-code-first`、`graphql-schema-first`、`microservice` 或 `ws`。 |
| `--crud [value]` | (仅 `resource`) 是否生成 CRUD 入口点（`true` 或 `false`）。 |
| `--no-crud` | (仅 `resource`) 在没有 CRUD 入口点的情况下生成资源。与 `--crud false` 相同。 |
| `--prefix <prefix>` | (仅 `library`) 库的导入路径前缀（默认: `@app`，或在 `nest-cli.json` 中为 `defaultLibraryPrefix`）。|
| `--no-interactive` | 永不提示：对于未通过选项回答的每个问题使用默认值，并打印使用的默认值（例如，`Not prompting, so using the defaults: --type rest, --crud.`）。缺少 `<name>` 是一个错误。当 stdin 或 stdout 不是终端时，或者设置了 `CI` 时，CLI 也不会提示。该选项会传递给模式，因此也不会询问其自身的问题（例如 `resource` 的问题）。|

#### nest build

将应用程序或工作空间编译到输出文件夹。

`build` 命令还负责：

- 通过 `tsconfig-paths` 映射路径（如果使用路径别名）
- 使用 OpenAPI 装饰器注释 DTO（如果启用了 `@nestjs/swagger` CLI 插件）
- 使用 GraphQL 装饰器注释 DTO（如果启用了 `@nestjs/graphql` CLI 插件）

```bash
$ nest build [name...] [options]

```

##### 参数

| 参数    | 描述                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------- |
| `[name...]` | 要构建的项目名称。传递多个名称以构建多个项目。如果省略，则构建默认项目。 |

##### 选项

| 选项                  | 描述                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--path [path]`         | `tsconfig` 文件的路径。<br/>别名 `-p`                                                                                                                                                   |
| `--config [path]`       | `nest-cli` 配置文件路径。<br/>别名 `-c`                                                                                                                                     |
| `--watch`               | 在监视模式下运行（实时重载）。<br /> 使用 `tsc` 编译器，您可以通过输入 `rs` 重新启动应用程序（当 `manualRestart` 选项设置为 `true` 时）。 <br/>别名 `-w` |
| `--builder [name]`      | 用于编译的构建器（`tsc`、`swc` 或 `rspack`）。 <br/>别名 `-b`                                                                                                                |
| `--webpack`             | 基于 webpack 编译的已弃用旧标志。请使用 `--builder rspack` 或其他明确的构建器。                                                                                                        |
| `--webpackPath [path]`  | webpack 配置文件路径的已弃用旧路径。请使用所选构建器支持的配置。                                                                                                                               |
| `--rspackPath [path]`   | Rspack 配置文件路径。                                                                                                                                                      |
| `--tsc`                 | 强制使用 `tsc` 进行编译。                                                                                                                                                    |
| `--watchAssets`         | 监视非 TS 文件（如 `.graphql` 文件等资产）。更多详情请参阅 [Assets](/cli/workspaces#资源)。                                                                                 |
| `--type-check`          | 启用类型检查（当使用 SWC 时）。                                                                                                                                                   |
| `--no-type-check`       | 禁用类型检查（当使用 SWC 时）。                                                                                                                                                  |
| `--bundle-dependencies` | 将 `node_modules` 打包到输出中（当使用 Rspack 时）。覆盖 `compilerOptions.bundleDependencies`，但保留其 `exclude` 列表。 |
| `--no-bundle-dependencies` | 将 `node_modules` 排除在输出之外（当使用 Rspack 时）。覆盖 `compilerOptions.bundleDependencies`。 |
| `--emit-declarations`   | 使用 SWC 构建器时，发出声明文件（`.d.ts`）。                                                                                                                               |
| `--all`                 | 构建 monorepo 中的所有项目。                                                                                                                                                          |
| `--parallel [concurrency]` | 并行构建项目（与 `--all` 一起使用）。传递一个正整数以限制并发性，或省略值以实现无限并发性。                                                |
| `--silent`              | 抑制信息性编译器日志。                                                                                                                                                      |
| `--preserveWatchOutput` | 在监视模式下保留过时的控制台输出，而不是清除屏幕。（仅限 `tsc` 监视模式）                                                                                         |

#### nest start

编译并运行应用程序（或工作空间中的默认项目）。

```bash
$ nest start [name] [options]

```

##### 参数

| 参数 | 描述                                                          |
| -------- | -------------------------------------------------------------------- |
| `[name]` | 要运行的项目名称。如果省略，则运行默认项目。 |

##### 选项

| 选项 | 描述 |
| :--- | :--- |
| `--path [path]` | `tsconfig` 文件的路径。<br/>别名 `-p` |
| `--config [path]` | `nest-cli` 配置文件路径。<br/>别名 `-c` |
| `--watch` | 在监视模式下运行（热重载）。<br/>别名 `-w` |
| `--builder [name]` | 用于编译的构建器（`tsc`、`swc` 或 `rspack`）。<br/>别名 `-b` |
| `--preserveWatchOutput` | 在监视模式下保留过时的控制台输出，而不是清除屏幕。（仅在 `tsc` 监视模式下） |
| `--watchAssets` | 在监视模式下运行（热重载），监视非 TS 文件（资源）。更多详情请参阅 [Assets](/cli/workspaces#资源)。 |
| `--debug [hostport]` | 在调试模式下运行（使用 `--inspect` 标志）。<br/>别名 `-d` |
| `--webpack` | 基于 webpack 编译的已弃用旧标志。请使用 `--builder rspack` 或其他明确的构建器。 |
| `--webpackPath [path]` | webpack 配置文件路径的已弃用旧路径。请使用所选构建器支持的配置。 |
| `--rspackPath [path]` | Rspack 配置文件路径。 |
| `--tsc` | 强制使用 `tsc` 进行编译。 |
| `--type-check` | 启用类型检查（当使用 SWC 时）。 |
| `--no-type-check` | 禁用类型检查（当使用 SWC 时）。 |
| `--bundle-dependencies` | 将 `node_modules` 打包到输出中（当使用 Rspack 时）。覆盖 `compilerOptions.bundleDependencies`，但保留其 `exclude` 列表。 |
| `--no-bundle-dependencies` | 将 `node_modules` 排除在输出之外（当使用 Rspack 时）。覆盖 `compilerOptions.bundleDependencies`。 |
| `--emit-declarations` | 使用 SWC 构建器时，发出声明文件（`.d.ts`）。 |
| `--silent` | 抑制信息性编译器日志。 |
| `--sourceRoot [sourceRoot]` | 源代码根目录（覆盖 `nest-cli.json` 中的 `sourceRoot` 设置）。 |
| `--entryFile [entryFile]` | 要运行的入口文件（覆盖 `nest-cli.json` 中的 `entryFile` 设置）。 |
| `--exec [binary]` | 要运行的二进制文件（默认: `node`）。<br/>别名 `-e` |
| `--no-shell` | 在 shell 内不启动子进程（参见 Node.js `child_process.spawn()` 文档）。 |
| `--env-file [path]` | 从相对于当前目录的文件加载环境变量，并在 `process.env` 上将它们暴露给应用程序。重复该选项以加载多个文件。不存在的文件将被跳过，并发出通知。 |
| `-- [key=value]` | 应用程序可以从 `process.argv` 读取的命令行参数。 |

#### nest add

导入已打包为 **nest 库** 的库，并运行其安装脚手架。

```bash
$ nest add <name> [options]

```

##### 参数

| 参数 | 描述 |
| :--- | :--- |
| `<name>` | 要导入的库的名称。 |

##### 选项

| 选项 | 描述 |
| :--- | :--- |
| `--dry-run` | 报告将要进行的更改，而不会更改文件系统。<br/> 别名: `-d` |
| `--skip-install` | 跳过包安装。<br/> 别名: `-s` |
| `--project [project]` | 库应添加到哪个项目。<br/> 别名: `-p` |

#### nest upgrade

将现有项目升级到最新的 NestJS 主版本。

```bash
$ nest upgrade [options]
$ nest update [options]

```

##### 描述

从 NestJS v11 项目的根目录运行，`nest upgrade` 将您的依赖项更新到 v12 并应用迁移的机械部分：

- 拒绝在缺少 `require(esm)` 的 Node.js 版本上运行（任何早于 v20.19 或早于 v22.12 的 v22.x）。
- 将每个已识别的 `@nestjs/*` 包提升到其 v12 兼容的主版本（`@nestjs/graphql`、`@nestjs/apollo` 和 `@nestjs/mercurius` 升级到 v14），并报告任何未识别的 `@nestjs/*` 包，以便您可以自行审查。
- 将 TypeScript 提升到 v6（v12 CLI 和脚手架要求），如果它声明了较低的基线，则将 `engines.node` 在 `package.json` 中提升到 `>=20.19.0`。
- 将 `nest-cli.json` 从已弃用的 `webpack` / `webpackConfigPath` 选项迁移到 `--builder rspack`，并更新匹配的 `package.json` 脚本。
- 将 GraphQL `playground` 选项重命名为 `graphiql`，将订阅从 `subscriptions-transport-ws` 切换到 `graphql-ws`，并相应地交换包。
- 用 `@nats-io/transport-node` / `@nats-io/nats-core` 替换旧的 `nats` 包，并重写 `nats` 导入。
- 将库特定的 `@nestjs/config` 设置移至 `validationOptions.libraryOptions` 下，并将 Joi 提升到 v18（第一个实现标准模式的发布版本）。
- 在存在的情况下，将 Jest 提升到 v30（以及 `@types/jest` / `ts-jest` 提升到匹配的发布版本），并警告 Jest 仅在 Node.js v24.9+ 上可以 `require()` ESM 专用的 v12 包。
- 可选地安装和配置 [`@nestjs/observe`](/observability/overview)。除非您传递 `--observe` 或 `--no-observe`，否则它会提示。
- 检查 `tsconfig.json` 和 `tsconfig.build.json` 中 TypeScript 6 或 ESM 专用包不再支持的设置，例如旧的 `moduleResolution` 或缺失的 `rootDir`。
- 扫描您的源代码，并打印有关已更改但无法自动迁移的行为的说明，例如生命周期钩子顺序、精炼的管道签名和结构化日志参数。

命令最后通过安装更新的依赖项（除非传递了 `--skip-install`）并打印一份关于其更改、警告和为您保留内容的报告来完成。

> 警告 **警告** `nest upgrade` 仅提升**本地** `@nestjs/cli` 依赖项。请使用 `npm i -g @nestjs/cli@latest` 自行更新全局安装的 CLI，并且**在**运行升级**之前**进行，因为该命令本身随 CLI 一起提供。

> 信息 **提示** 该命令故意不将您的项目迁移到 ESM、Vitest 或 oxlint。这些是新生成的 v12 项目的默认设置，但现有项目可以根据自己的时间表采用它们。有关完整情况，请参阅 [migration guide](/migration-guide)。

##### 选项

| 选项 | 描述 |
| :--- | :--- |
| `--dry-run` | 报告将要进行的更改，但不更改文件系统。<br/> 别名: `-d` |
| `--skip-install` | 跳过包安装。<br/> 别名: `-s` |
| `--observe` / `--no-observe` | 设置 `@nestjs/observe`，或跳过设置，而无需提示。省略两者将在交互式终端中进行提示（提示默认为否）。在没有终端或设置了 `CI` 时，Observe 不会设置。 |
| `--tag [tag]` | 使用 npm dist-tag（例如 `next`）而不是默认的版本范围。<br/> 别名: `-t` |
| `--collection [collectionName]` | 要使用的 Schematics 集合。传入包含该 schematic 的已安装 npm 包的包名。<br/> 别名: `-c` |

#### nest deploy

使用 [Mau](https://mau.nestjs.com/) 驱动，将您的应用程序部署到云端。

```bash
$ nest deploy [mau-options]

```

##### 描述

`nest deploy` 是 Mau CLI 的一个薄封装。它定位 Mau 二进制文件，并将您传递给 `mau deploy` 的每个参数转发过去，因此 Mau 支持的任何选项都可在此处保持不变地使用。

如果您的项目中未安装 Mau，该命令会提议将 `@nestjs/mau` 作为开发依赖项添加，然后继续。在非交互式环境（例如 CI）中，该命令会失败而不是提示，因此请先显式安装 Mau：

```bash
$ npm install --save-dev @nestjs/mau

```

一旦 Mau 启动，它就控制了终端，因此其输出和提示会直接到达您。请参阅 [Deployment chapter](/deployment#easy-deployment-with-mau) 了解 Mau 的作用以及如何配置它。

#### nest info

显示已安装的 Nest 包和其他有用的系统信息。例如：

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
OS Version     : macOS Sequoia 24.6.0
NodeJS Version : v22.12.0
NPM Version    : 10.9.0

[Nest CLI]
Nest CLI Version : 12.0.3

[Nest Platform Information]
platform-express version : 12.0.4
schematics version       : 12.0.4
testing version          : 12.0.4
common version           : 12.0.4
core version             : 12.0.4
cli version              : 12.0.3

```