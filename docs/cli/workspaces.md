<!-- 此文件从 content/cli/workspaces.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T08:14:13.166Z -->
<!-- 源文件: content/cli/workspaces.md -->
<!-- 源哈希: 176b9694cffe25b385bc331aab744f92 -->

### 工作空间

Nest 有两种组织代码的模式：

- **标准模式**：适用于构建独立的、以项目为中心的应用程序，这些应用程序拥有自己的依赖和设置，无需优化模块共享或复杂构建。这是默认模式。
- **Monorepo 模式**：此模式将代码工件视为轻量级 **monorepo** 的一部分，可能更适合开发团队和/或多项目环境。它自动化了构建过程的部分环节，使创建和组合模块化组件变得容易，促进代码重用，使集成测试更容易，使共享项目级工件（如 lint 规则和其他配置策略）变得容易，并且比 Git 子模块等替代方案更易于使用。Monorepo 模式采用 **工作空间** 的概念，在 `nest-cli.json` 文件中表示，用于协调 monorepo 各组件之间的关系。

需要注意的是，Nest 的几乎所有功能都与你的代码组织模式无关。这种选择的**唯一**影响是你的项目如何组合以及构建工件如何生成。所有其他功能，从 CLI 到核心模块再到附加模块，在两种模式下都以相同的方式工作。

此外，你可以随时轻松地从**标准模式**切换到 **monorepo 模式**，因此你可以推迟此决定，直到其中一种方法的好处变得更加清晰。

#### 标准模式

当你运行 `nest new` 时，会使用内置的模式生成器为你创建一个新的**项目**。Nest 会执行以下操作：

1. 创建一个新文件夹，对应于你提供给 `nest new` 的 `name` 参数
2. 使用与最小基础 Nest 应用程序对应的默认文件填充该文件夹。你可以在 [typescript-starter](https://github.com/nestjs/typescript-starter) 仓库中查看这些文件。
3. 提供其他文件，如 `nest-cli.json`、`package.json` 和 `tsconfig.json`，用于配置和启用编译、测试和服务应用程序的各种工具。

从那里，你可以修改起始文件、添加新组件、添加依赖项（例如 `npm install`），并按照本文档其余部分所述开发你的应用程序。

#### Monorepo 模式

要启用 monorepo 模式，你从_标准模式_结构开始，然后添加**项目**。项目可以是完整的**应用程序**（你可以使用命令 `nest generate app` 将其添加到工作空间）或**库**（你可以使用命令 `nest generate library` 将其添加到工作空间）。我们将在下面讨论这些特定类型的项目组件的细节。现在需要记住的关键点是，**向现有标准模式结构添加项目**的行为**将其转换**为 monorepo 模式。让我们看一个例子。

如果我们运行：

```bash
$ nest new my-project

```

我们构建了一个_标准模式_结构，文件夹结构如下：

<div class="file-tree">
  <div class="item">node_modules</div>
  <div class="item">src</div>
  <div class="children">
    <div class="item">app.controller.ts</div>
    <div class="item">app.module.ts</div>
    <div class="item">app.service.ts</div>
    <div class="item">main.ts</div>
  </div>
  <div class="item">nest-cli.json</div>
  <div class="item">package.json</div>
  <div class="item">tsconfig.json</div>
  <div class="item">lint 配置</div>
</div>

我们可以按如下方式将其转换为 monorepo 模式结构：

```bash
$ cd my-project
$ nest generate app my-app

```

此时，`nest` 将现有结构转换为 **monorepo 模式**结构。这会导致一些重要的变化。文件夹结构现在如下所示：

<div class="file-tree">
  <div class="item">apps</div>
    <div class="children">
      <div class="item">my-app</div>
      <div class="children">
        <div class="item">src</div>
        <div class="children">
          <div class="item">app.controller.ts</div>
          <div class="item">app.module.ts</div>
          <div class="item">app.service.ts</div>
          <div class="item">main.ts</div>
        </div>
        <div class="item">tsconfig.app.json</div>
      </div>
      <div class="item">my-project</div>
      <div class="children">
        <div class="item">src</div>
        <div class="children">
          <div class="item">app.controller.ts</div>
          <div class="item">app.module.ts</div>
          <div class="item">app.service.ts</div>
          <div class="item">main.ts</div>
        </div>
        <div class="item">tsconfig.app.json</div>
      </div>
    </div>
  <div class="item">nest-cli.json</div>
  <div class="item">package.json</div>
  <div class="item">tsconfig.json</div>
  <div class="item">lint 配置</div>
</div>

`generate app` 模式生成器已重新组织代码 - 将每个**应用程序**项目移动到 `apps` 文件夹下，并在每个项目的根文件夹中添加项目特定的 `tsconfig.app.json` 文件。我们原始的 `my-project` 应用程序已成为 monorepo 的**默认项目**，现在与刚添加的 `my-app` 成为同级，位于 `apps` 文件夹下。我们将在下面介绍默认项目。

> 错误 **警告** 将标准模式结构转换为 monorepo 仅适用于遵循规范 Nest 项目结构的项目。具体来说，在转换过程中，模式生成器尝试将项目文件夹中的 `src` 和 `test` 文件夹重新定位到根目录中 `apps` 文件夹下。如果项目未使用此结构，转换将失败或产生不可靠的结果。

#### 工作空间项目

Monorepo 使用工作空间的概念来管理其成员实体。工作空间由**项目**组成。项目可以是以下两种类型之一：

- **应用程序**：一个完整的 Nest 应用程序，包含用于引导应用程序的 `main.ts` 文件。除了编译和构建方面的考虑外，工作空间中的应用程序类型项目在功能上与_标准模式_结构中的应用程序完全相同。
- **库**：库是一种打包通用功能集（模块、提供者、控制器等）的方式，可在其他项目中使用。库不能独立运行，也没有 `main.ts` 文件。有关库的更多信息，请参阅 [here](/cli/libraries)。

所有工作空间都有一个**默认项目**（应为应用程序类型项目）。这由 `nest-cli.json` 文件中的顶层 `"root"` 属性定义，该属性指向默认项目的根目录（有关更多详细信息，请参阅下面的 [CLI properties](/cli/workspaces#cli-properties)）。通常，这是您最初使用的**标准模式**应用程序，后来使用 `nest generate app` 转换为 monorepo。当您按照这些步骤操作时，此属性会自动填充。

当未提供项目名称时，`nest` 命令（如 `nest build` 和 `nest start`）会使用默认项目。

例如，在上述 monorepo 结构中，运行

```bash
$ nest start

```

将启动 `my-project` 应用程序。要启动 `my-app`，我们需要使用：

```bash
$ nest start my-app

```

#### 应用程序

应用程序类型项目，或者我们非正式地简称为"应用程序"，是您可以运行和部署的完整 Nest 应用程序。您可以使用 `nest generate app` 生成应用程序类型项目。

此命令会自动生成项目骨架，包括来自 [typescript starter](https://github.com/nestjs/typescript-starter) 的标准 `src` 和 `test` 文件夹。与标准模式不同，monorepo 中的应用程序项目没有任何包依赖（`package.json`）或其他项目配置工件，如 `.prettierrc` 和工作空间 lint 配置文件。相反，使用 monorepo 级别的依赖项和配置文件。

但是，模式生成器确实会在项目的根文件夹中生成项目特定的 `tsconfig.app.json` 文件。此配置文件会自动设置适当的构建选项，包括正确设置编译输出文件夹。该文件扩展了顶层（monorepo）`tsconfig.json` 文件，因此您可以在 monorepo 级别管理全局设置，但如有需要，也可以在项目级别覆盖它们。

#### 库

如前所述，库类型项目，或简称为"库"，是需要组合到应用程序中才能运行的 Nest 组件包。您可以使用 `nest generate library` 生成库类型项目。决定什么内容属于库是一个架构设计决策。我们将在 [libraries](/cli/libraries) 章节中深入讨论库。

#### CLI 属性

Nest 将组织和构建及部署标准和 monorepo 结构项目所需的元数据保存在 `nest-cli.json` 文件中。当您添加项目时，Nest 会自动添加和更新此文件，因此您通常不必考虑它或编辑其内容。但是，有些设置您可能希望手动更改，因此对该文件有一个概览性的了解会很有帮助。

运行上述步骤创建 monorepo 后，我们的 `nest-cli.json` 文件如下所示：

```javascript
{
  "collection": "@nestjs/schematics",
  "sourceRoot": "apps/my-project/src",
  "monorepo": true,
  "root": "apps/my-project",
  "compilerOptions": {
    "builder": "rspack",
    "tsConfigPath": "apps/my-project/tsconfig.app.json"
  },
  "projects": {
    "my-project": {
      "type": "application",
      "root": "apps/my-project",
      "entryFile": "main",
      "sourceRoot": "apps/my-project/src",
      "compilerOptions": {
        "tsConfigPath": "apps/my-project/tsconfig.app.json"
      }
    },
    "my-app": {
      "type": "application",
      "root": "apps/my-app",
      "entryFile": "main",
      "sourceRoot": "apps/my-app/src",
      "compilerOptions": {
        "tsConfigPath": "apps/my-app/tsconfig.app.json"
      }
    }
  }
}

```

该文件分为以下几个部分：

- 一个全局部分，包含控制标准和 monorepo 级别设置的顶层属性
- 一个顶层属性（`"projects"`），包含有关每个项目的元数据。此部分仅存在于 monorepo 模式结构中。

顶层属性如下：

- `"collection"`：指向用于生成组件的模式集合；您通常不应更改此值
- `"sourceRoot"`：指向标准模式结构中单个项目的源代码根目录，或 monorepo 模式结构中的_默认项目_
- `"compilerOptions"`：一个映射，键指定编译器选项，值指定选项设置；详见下文
- `"generateOptions"`：一个映射，键指定全局生成选项，值指定选项设置；详见下文
- `"monorepo"`：（仅限 monorepo）对于 monorepo 模式结构，此值始终为 `true`
- `"root"`：（仅限 monorepo）指向_默认项目_的项目根目录

#### 全局编译器选项

这些属性指定要使用的编译器以及影响**任何**编译步骤的各种选项，无论是作为 `nest build` 还是 `nest start` 的一部分，也不管编译器是 `tsc`、`swc` 还是 Rspack。

| 属性名 | 属性值类型 | 描述 |
| --- | --- | --- |
| `webpack` | boolean | 已弃用的旧版标志，用于基于 webpack 的编译。请优先使用 `builder`。 |
| `tsConfigPath` | string | （仅限 monorepo）指向包含 `tsconfig.json` 设置的文件，当调用 `nest build` 或 `nest start` 时未提供 `project` 选项（例如，构建或启动默认项目时）将使用该文件。 |
| `webpackConfigPath` | string | 已弃用的旧版 webpack 选项路径。请优先使用当前设置支持的构建器特定配置。 |
| `deleteOutDir` | boolean | 如果为 `true`，则每当调用编译器时，它都会首先删除编译输出目录（如 `tsconfig.json` 中所配置，默认值为 `./dist`）。 |
| `assets` | array | 允许在编译步骤开始时自动分发非 TypeScript 资产（在 `--watch` 模式下，增量编译时**不会**进行资产分发）。详见下文。 |
| `watchAssets` | boolean | 如果为 `true`，则以监视模式运行，监视**所有**非 TypeScript 资产。（如需更精细地控制要监视的资产，请参阅下文 [Assets](/cli/workspaces#资源) 部分）。 |
| `manualRestart` | boolean | 如果为 `true`，则启用快捷键 `rs` 手动重启服务器。默认值为 `false`。 |
| `builder` | string/object | 指示 CLI 使用哪个 `builder` 来编译项目（`tsc`、`swc` 或 `rspack`）。要自定义构建器的行为，可以传递一个包含两个属性的对象：`type`（`tsc`、`swc` 或 `rspack`）和 `options`。 |
| `typeCheck` | boolean | 如果为 `true`，则为 SWC 驱动的项目启用类型检查（当 `builder` 为 `swc` 时）。默认值为 `false`。 |
| `emitDeclarations` | boolean | 如果为 `true`，则在使用 SWC 构建器时生成声明文件（`.d.ts`）。默认值为 `false`。 |
| `includeLibraryAssets` | array | （仅限 monorepo）库项目名称列表，构建此应用程序时也应复制这些项目的资产。 |

#### 全局生成选项

这些属性指定 `nest generate` 命令要使用的默认生成选项。

| 属性名 | 属性值类型 | 描述 |
| --- | --- | --- |
| `spec` | boolean _或_ object | 如果值为布尔值，则 `true` 默认启用 `spec` 生成，`false` 则禁用。在 CLI 命令行中传递的标志会覆盖此设置，项目特定的 `generateOptions` 设置也是如此（详见下文）。如果值为对象，则每个键代表一个示意图名称，布尔值决定该特定示意图的默认规范生成是否启用/禁用。 |
| `flat` | boolean | 如果为 true，所有生成命令将生成扁平结构。 |

以下示例使用布尔值指定默认对所有项目禁用 spec 文件生成：

```javascript
{
  "generateOptions": {
    "spec": false
  },
  ...
}

```

以下示例使用布尔值指定扁平文件生成应作为所有项目的默认设置：

```javascript
{
  "generateOptions": {
    "flat": true
  },
  ...
}

```

在以下示例中，仅对 `spec` 示意图禁用 `service` 文件生成（例如 `nest generate service...`）：

```javascript
{
  "generateOptions": {
    "spec": {
      "service": false
    }
  },
  ...
}

```

> warning **警告** 当将 `spec` 指定为对象时，生成示意图的键目前不支持自动别名处理。这意味着，例如将键指定为 `service: false` 并尝试通过别名 `s` 生成服务时，spec 文件仍会被生成。为确保正常示意图名称和别名都能按预期工作，请同时指定正常命令名称和别名，如下所示。
>
> ```javascript
> {
>   "generateOptions": {
>     "spec": {
>       "service": false,
>       "s": false
>     }
>   },
>   ...
> }
> ```

#### 项目特定的生成选项

除了提供全局生成选项外，您还可以指定项目特定的生成选项。项目特定的生成选项遵循与全局生成选项完全相同的格式，但直接在每个项目上指定。

项目特定的生成选项会覆盖全局生成选项。

```javascript
{
  "projects": {
    "cats-project": {
      "generateOptions": {
        "spec": {
          "service": false
        }
      },
      ...
    }
  },
  ...
}

```

> warning **警告** 生成选项的优先级顺序如下。在 CLI 命令行上指定的选项优先于项目特定的选项。项目特定的选项覆盖全局选项。

#### 指定的编译器

使用不同默认编译器的原因是，对于较大的项目（例如在 monorepo 中更常见），Rspack 在构建时间和生成将所有项目组件打包在一起的单个文件方面具有显著优势。如果您希望生成单独的文件，请将构建器设置为 `tsc` 或 `swc`。

#### 资源

TypeScript 编译会自动将编译器输出（`.js` 和 `.d.ts` 文件）分发到指定的输出目录。分发非 TypeScript 文件（例如 `.graphql` 文件、`images`、`.html` 文件和其他资源）也很方便。这使您可以将 `nest build`（以及任何初始编译步骤）视为轻量级的**开发构建**步骤，在此过程中您可以编辑非 TypeScript 文件并迭代编译和测试。

资源应位于 `src` 文件夹中，否则它们将不会被复制。

`assets` 键的值应是一个元素数组，用于指定要分发的文件。元素可以是带有 `glob` 风格文件规范的简单字符串，例如：

```typescript
"assets": ["**/*.graphql"],
"watchAssets": true,

```

为了更精细的控制，元素可以是具有以下键的对象：

- `"include"`：要分发的资源的 `glob` 风格文件规范
- `"exclude"`：要从 `include` 列表中**排除**的资源的 `glob` 风格文件规范
- `"outDir"`：指定资源分发路径（相对于根文件夹）的字符串。默认为为编译器输出配置的同一输出目录。
- `"watchAssets"`：布尔值；如果为 `true`，则以监视模式运行，监视指定的资源

例如：

```typescript
"assets": [
  { "include": "**/*.graphql", "exclude": "**/omitted.graphql", "watchAssets": true },
]

```

> warning **警告** 在顶层 `compilerOptions` 属性中设置 `watchAssets` 会覆盖 `assets` 属性中的任何 `watchAssets` 设置。

#### 项目属性

此元素仅存在于 monorepo 模式结构中。您通常不应编辑这些属性，因为 Nest 使用它们来定位 monorepo 中的项目及其配置选项。