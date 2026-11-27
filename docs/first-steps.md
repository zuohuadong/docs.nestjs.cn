<!-- 此文件从 content/first-steps.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:33:25.578Z -->
<!-- 源文件: content/first-steps.md -->
<!-- 源哈希: b4f8dccd429701e492b3bbdba07606aa -->

### 第一步

这组文章涵盖了 Nest 的**核心基础**。为了介绍 Nest 应用程序的基本构建块，我们将构建一个基本的 CRUD 应用程序，其功能在入门级别上涵盖了广泛的知识点。

#### 语言

Nest 使用 [TypeScript](https://www.typescriptlang.org/) 编写，在 [Node.js](https://nodejs.org/en/) 上运行，同时支持 TypeScript 和纯 JavaScript。由于 Nest 依赖于最新的语言特性，使用纯 JavaScript 时需要 [Babel](https://babeljs.io/)。

本文档中的大多数示例使用 TypeScript，但您可以通过代码片段右上角的语言切换器将**任何代码片段**切换到纯 JavaScript 语法。

#### 前提条件

确保您的操作系统上安装了 [Node.js](https://nodejs.org)。运行 Nest 应用程序需要 **v20.19 或更高版本**（或 22.x 系列的 **v22.12+**）。Nest CLI 的生成器（如 `nest new` 和 `nest generate`）需要 **v22.22.3+、v24.15+ 或 v26+**。我们推荐最新的活跃 LTS 版本，它满足这两个要求。

#### 设置

设置新项目的最快方法是使用 [Nest CLI](/cli/overview)。安装了 [npm](https://www.npmjs.com/) 后，在终端中运行以下命令：

```bash
$ npm i -g @nestjs/cli
$ nest new project-name

```

CLI 会询问使用哪种模块系统：ESM（默认）、使用 Vitest 作为测试运行器，还是 CommonJS（使用 Jest）。传递 `--type esm` 或 `--type cjs` 即可选择而不被询问。

它还会询问是否设置 [NestJS Observe](https://www.observe.nestjs.com/ 'NestJS Observe')，Nest 的官方可观测性平台。如果回答是，生成的项目将包含 `@nestjs/observe` SDK，已集成到 `AppModule` 和 `NestFactory.create()` 中。在交互式终端中，提示默认是是；在没有交互式终端的情况下，例如在 CI 或编码代理的 shell 中，此提示将被跳过，并添加 Observe，直到您链接项目之前不会发送任何数据。无论哪种情况，传递 `--observe` 或 `--no-observe` 均可跳过提示。有关 Observe 涵盖内容的详细信息，请参阅 [Observability](/observability/overview) 章。

如果您设置了 Observe，CLI 随后会提供将新项目链接到它的选项，前提是依赖项已安装。接受后，会打印一个代码到 [observe.nestjs.com/link](https://www.observe.nestjs.com/link 'Link a project to NestJS Observe') 以批准（如果没有账户则先注册；免费计划无需付款详细信息），然后 CLI 会将应用密钥和密钥写入 `.env`，并使每个 `nest start` 脚本（`start`、`start:dev` 和 `start:debug`）加载它。请求、后台任务、错误和分布式跟踪将在您下次启动应用程序时开始报告。要稍后链接，或当 CLI 不提供此选项时（没有终端或使用 `--skip-install`），请在项目目录中运行 `npx @nestjs/observe link` - 参见 [Linking from the terminal](/observability/sdk#linking-from-the-terminal)。

它还会询问哪些编码代理应获得官方 NestJS 代理技能（默认全部）。参见 [Coding agents](/first-steps#coding-agents)。

如果想在当前文件夹中创建项目，请从脚本或编码代理的 shell 中运行：

```bash
$ npx @nestjs/cli new . --skip-git --package-manager npm

```

在没有终端的情况下，CLI 不会询问任何内容，并使用上述默认设置：ESM、Observe 以及 Codex、Cursor 和 Claude Code 的代理技能。

> info **提示** 新项目默认启用 TypeScript 的 [strict](https://www.typescriptlang.org/tsconfig#strict) 模式。要选择退出，请在生成的 `tsconfig.json` 中设置 `"strict": false`。

CLI 创建一个 `project-name` 目录，安装依赖项，生成一些样板文件，并用几个核心文件填充 `src/` 目录。

<div class="file-tree">
  <div class="item">src</div>
  <div class="children">
    <div class="item">app.controller.spec.ts</div>
    <div class="item">app.controller.ts</div>
    <div class="item">app.module.ts</div>
    <div class="item">app.service.ts</div>
    <div class="item">main.ts</div>
  </div>
</div>

下表描述了这些核心文件：

|                          |                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| `app.controller.ts`      | 一个带有单个路由的基本控制器。                                                         |
| `app.controller.spec.ts` | 控制器的单元测试。                                                              |
| `app.module.ts`          | 应用程序的根模块。                                                             |
| `app.service.ts`         | 一个带有单个方法的简单服务。                                                           |
| `main.ts`                | 应用程序的入口文件。它使用 `NestFactory` 来创建 Nest 应用程序实例。 |

`main.ts` 文件包含一个异步函数，用于**引导**应用程序：

```typescript title="main.ts"

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

要创建 Nest 应用程序实例，请使用来自 `@nestjs/core` 的 `NestFactory`，它为此目的暴露了几个方法。`create()` 方法返回一个实现了 `INestApplication` 接口的应用程序对象。该对象的**方法**在后续章节中描述。在上面的 `main.ts` 示例中，应用程序启动了一个 HTTP 监听器并等待传入的 HTTP **请求**。

Nest CLI 生成的项目结构鼓励将每个 **模块** 保留在其专用的目录中。

> info **提示** 默认情况下，如果在创建应用程序过程中发生错误，进程将以代码 `1` 退出。要让错误被抛出，请禁用 `abortOnError` 选项（例如 `NestFactory.create(AppModule, { abortOnError: false })`）。

<app-banner-courses></app-banner-courses>

#### 平台

Nest 被设计为平台无关。平台独立性允许您创建可重用的逻辑部分，可用于多种不同类型的应用程序。一旦为其创建了适配器，Nest 就可以与任何 Node.js HTTP 框架配合使用。开箱即用支持三种 HTTP 平台：[Express](https://expressjs.com/)、[Fastify](https://www.fastify.io) 和 Node.js 内置的 [`node:http`](https://nodejs.org/api/http.html) 模块。选择最适合您需求的平台（参见 [HTTP adapters](/techniques/performance)）。

| | |
| :--- | :--- |
| `platform-express` | [Express](https://expressjs.com/) 是 Node.js 上一个知名、极简的 Web 框架。它是一个经过实战检验、可投入生产的库，拥有丰富的社区资源。Nest 默认使用 `@nestjs/platform-express` 包，因此无需设置。 |
| `platform-fastify` | [Fastify](https://www.fastify.io/) 是一个高性能、低开销的框架，专注于效率和速度。要了解如何使用它，请参阅 [Fastify adapter](/techniques/performance#fastify-adapter)。 |
| `platform-node` | `NodeAdapter` 直接在 Node.js 的 `node:http` 模块上运行 Nest，是这三者中最快的。它的请求和响应对象带有 Express 风格的辅助函数，因此大多数 Express 中间件都可以与之配合使用。我们推荐从 v12.3 开始使用，它将在 v13 中成为默认选项。要了解如何使用它，请参阅 [Node adapter](/techniques/performance#node-adapter)。 |

每个平台都暴露了其自己的应用程序接口：分别为 `NestExpressApplication`、`NestFastifyApplication` 和 `NestNodeApplication`。

当您向 `NestFactory.create()` 方法传递一个类型时，如下例所示，`app` 对象会暴露仅在该平台上可用的方法。**除非**您想访问底层平台 API，否则**无需**指定类型。

```typescript
const app = await NestFactory.create<NestExpressApplication>(AppModule);

```

##### 使用 Node 适配器

从 v12.3 开始，我们建议在 Node 适配器上运行新应用程序。它尚未成为默认选项，因此请安装该包：

```bash
$ npm i --save @nestjs/platform-node

```

然后在 `main.ts` 文件中将一个 `NodeAdapter` 实例传递给 `NestFactory.create()`：

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { NestNodeApplication, NodeAdapter } from '@nestjs/platform-node';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestNodeApplication>(
    AppModule,
    new NodeAdapter(),
  );
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

应用程序中的其他内容都不需要更改：控制器、提供者和大多数 Express 中间件都按原样工作。有关它与 Express 不同的少数地方，请参阅 [Node adapter](/techniques/performance#node-adapter)。

CLI 生成的端到端测试（`test/app.e2e-spec.ts`）会创建自己的应用程序，除非您传递适配器，否则它在 Express 上运行。也将其 `new NodeAdapter()` 传递给其 `createNestApplication()` 调用，以便测试在与应用程序相同的适配器上运行。

#### 运行应用程序

安装完成后，运行以下命令启动应用程序并监听传入的 HTTP **请求**：

```bash
$ npm run start

```

> info **提示** 要加快开发构建速度，请通过向 `start` 脚本传递 `-b swc` 标志来使用 [SWC builder](/recipes/swc)：`npm run start -- -b swc`。

此命令在 `src/main.ts` 文件（`3000`，除非设置了 `PORT` **环境变量**）中定义的端口上启动 HTTP 服务器。应用程序运行后，打开您的浏览器并导航到 `http://localhost:3000/`。您应该会看到 `Hello World!` 消息。

要监视文件更改，请使用以下命令启动应用程序：

```bash
$ npm run start:dev

```

此命令会监视您的文件，每当文件更改时，都会重新编译和重启服务器。

#### Linting 和格式化

[Nest CLI](/cli/overview) 旨在构建一个可扩展的可靠开发工作流程。对于快速的默认工作流程，生成的 TypeScript 项目预装了代码 **linter** 和 **formatter**：分别为 [oxlint](https://oxc.rs/docs/guide/usage/linter.html) 和 [Prettier](https://prettier.io/)。

> info **提示** 不确定格式化器和 linter 有何不同？请参阅 Prettier 的 [comparison](https://prettier.io/docs/en/comparison.html)。

对于不涉及 IDE 的无头环境（持续集成、Git hooks 等），项目包含即用型的 `npm` 脚本，它们运行 [`oxlint`](https://www.npmjs.com/package/oxlint) 和 [`prettier`](https://www.npmjs.com/package/prettier)：

```bash
# Lint with oxlint
$ npm run lint

# Format with prettier
$ npm run format

```

#### 编码代理

由 `nest new` 生成的项目已为 Codex、Cursor 和 Claude Code 等编码代理做好设置。它们包含一个 `AGENTS.md` 文件，该文件向代理介绍项目并指向本文档和官方 [NestJS agent skills](https://github.com/nestjs/agent-skills)。这些 [Agent Skills](https://agentskills.io) 涵盖了项目启动、添加功能、**认证** 和 **授权**、数据、测试和生产，包括当前 API 和仍能通过测试的错误。当任务匹配时，代理会自动加载技能。代理也可以将本文档作为 markdown 读取：[llms.txt](/llms.txt) 索引了每个章节。

默认情况下，`nest new` 为 Codex、Cursor 和 Claude Code 将技能添加到 `.agents/skills` 和 `.claude/skills`。要选择代理，请传递 `--skills`（例如 `--skills cursor` 或 `--skills claude,agents`），或者传递 `--skip-skills` 以排除技能。请参阅 [the `new` command's options](/cli/usages#nest-new)。

当代理运行 `nest new` 时，没有人回答提示，因此项目采用默认设置：[NestJS Observe](/observability/overview) 已设置但未链接，并且在链接前不发送任何内容。CLI 的输出和生成的 `AGENTS.md` 会要求代理告诉您运行 `npx @nestjs/observe link`，这会在您在浏览器中批准代码后链接项目。传递 `--no-observe` 以排除 Observe。

要将技能添加到现有项目或更新到最新版本，请运行：

```bash
$ npx @nestjs/skills@latest add

```

这会将技能复制到 `.agents/skills`，Codex 和 Cursor 会读取此位置。传递 `--agent claude` 将它们复制到 `.claude/skills`（用于 Claude Code）、`--agent all`（用于两者），或传递 `--global` 将它们安装到您机器上的每个项目中。在 Claude Code 中，技能也作为一个插件可用：

```bash
$ claude plugin marketplace add nestjs/agent-skills
$ claude plugin install nestjs@nestjs

```