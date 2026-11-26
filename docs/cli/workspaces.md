<!-- 此文件从 content/cli/workspaces.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:23:31.722Z -->
<!-- 源文件: content/cli/workspaces.md -->
<!-- 源哈希: 72b280040830e5c1ba9f6273a5733d77 -->

### 工作空间

Nest 有两种组织代码的模式：

- **标准模式**：适用于具有自身依赖和设置的独立、项目导向的应用程序，不需要优化模块共享或复杂的构建。这是默认模式。
- **Monorepo 模式**：将代码工件视为轻量级 **Monorepo** 的一部分，可能更适合开发团队和/或多项目环境。它自动化了构建过程的一部分，使其易于创建和组合模块化组件。它促进代码重用，使集成测试更简单，易于共享项目范围的工件，例如 lint 规则和其他配置策略，并且比 Git 子模块等替代方案更易于使用。Monorepo 模式使用 **工作空间** 的概念，该概念在 `nest-cli.json` 文件中表示，用于协调 Monorepo 组件之间的关系。

Nest 的几乎所有功能都独立于您的代码组织模式。此选择的**唯一**影响是项目的组合方式以及构建工件的生成方式。从 CLI 到核心 **模块** 再到附加 **模块** 的所有其他功能在任一模式下都相同。

您也可以随时从**标准模式**切换到**Monorepo 模式**，因此您可以推迟此决策，直到一种方法的优势变得更清晰。

#### 标准模式

当您运行 `nest new` 时，Nest 使用内置的脚手架创建一个新的**项目**。Nest 执行以下操作：

1. 创建一个以您传递给 `nest new` 的 `name` 参数命名的新文件夹。
2. 使用最小 Nest 应用程序的默认文件填充该文件夹。您可以在 [typescript-starter](https://github.com/nestjs/typescript-starter) 仓库中检查这些文件。
3. 添加诸如 `nest-cli.json`、`package.json` 和 `tsconfig.json` 等文件，用于配置编译、测试和提供应用程序的工具。

从那里，您可以修改启动文件，添加新组件和依赖项（例如 `npm install`），并按照本文档其余部分所述开发您的应用程序。

#### Monorepo 模式

要启用 Monorepo 模式，请从 _标准模式_ 结构开始并添加**项目**。一个项目可以是完整的**应用程序**（您使用 `nest generate app` 将其添加到工作空间）或一个**库**（您使用 `nest generate library` 添加）。我们将在下面讨论这些项目类型。目前关键点是，**向现有标准模式结构添加项目**这一**行为**会将其**转换为** Monorepo 模式。让我们看一个例子。

如果我们运行：

```bash
$ nest new my-project

```

我们得到一个具有以下文件夹和文件的 _标准模式_ 结构：

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
  <div class="item">lint config</div>
</div>

我们可以按如下方式将其转换为 Monorepo 模式结构：

```bash
$ cd my-project
$ nest generate app my-app

```

此时，`nest` 将现有结构转换为**Monorepo 模式**结构，这带来了几个重要的变化。文件夹结构现在如下所示：

<div class="file-tree">
  <div class="item">apps</div>
    <div class="children">
      <div class="item">my-app</div>
      <div class="children">
        <div class="item">src</div>
        <div class="children">
          <div class="item">my-app.controller.ts</div>
          <div class="item">my-app.module.ts</div>
          <div class="item">my-app.service.ts</div>
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
  <div class="item">lint config</div>
</div>

`generate app` 脚手架已重组代码：它将每个**应用程序**项目移动到 `apps` 文件夹下，并向每个项目的根文件夹添加了项目特定的 `tsconfig.app.json` 文件。我们最初的 `my-project` app 已成为 Monorepo 的**默认项目**，现在是新添加的 `my-app` 的同级，位于 `apps` 文件夹下。我们将在下面介绍默认项目。

> 错误 **警告** 将标准模式结构转换为 Monorepo 仅适用于遵循规范 Nest 项目结构的项目。在转换过程中，脚手架会将项目的 `src` 和 `test` 文件夹移动到根 `apps` 文件夹下的项目文件夹中。如果项目不使用此结构，转换将失败或产生不可靠的结果。

#### 工作空间项目

Monorepo 使用工作空间的概念来管理其成员。工作空间由**项目**组成。一个项目要么是：

- **应用程序**：一个完整的 Nest 应用程序，包括一个用于引导它的 `main.ts` 文件。除了编译和构建的考虑外，工作空间内的应用程序类型项目在功能上与 _标准模式_ 结构中的应用程序完全相同。
- **库**：一个可供其他项目使用的通用功能包（**模块**、**提供者**、**控制器**等）。库不能独立运行，也没有 `main.ts` 文件。有关详细信息，请参阅 [Libraries](/cli/libraries)。

每个工作空间都有一个**默认项目**，它应该是一个应用程序类型的项目。它由 `nest-cli.json` 文件中的顶层 `"root"` 属性定义，该属性指向默认项目的根（见下文 [CLI properties](/cli/workspaces#cli-properties)）。通常，这是您最初启动并随后使用 `nest generate app` 转换为 Monorepo 的**标准模式**应用程序。在这种情况下，该属性会自动填充。

`nest` 等命令（如 `nest build` 和 `nest start`）在您未提供项目名称时会使用默认项目。

例如，在上述 monorepo 结构中，运行

```bash
$ nest start

```

启动 `my-project` 应用。要启动 `my-app`，请运行：

```bash
$ nest start my-app

```

#### 应用

应用类型的项目，非正式地称为“应用”，是完整的 Nest 应用，可以运行和部署。您使用 `nest generate app` 生成此类项目。

此命令生成项目骨架，包括来自 [typescript starter](https://github.com/nestjs/typescript-starter) 的标准 `src` 和 `test` 文件夹。与标准模式不同，monorepo 中的应用项目没有包依赖文件（`package.json`）以及其他项目配置工件，例如 `.prettierrc` 或 lint 配置文件。相反，它使用 monorepo 范围的依赖和配置文件。

然而，该脚手架会在项目根文件夹中生成项目特定的 `tsconfig.app.json` 文件。此文件设置了适当的构建选项，包括编译输出文件夹。它扩展了顶层（monorepo）`tsconfig.json` 文件，因此您可以对整个 monorepo 管理全局设置，并在需要时在项目级别覆盖它们。

#### 库

库类型的项目，或简单地称为“库”，是必须组合到应用中才能运行的 Nest 组件包。您使用 `nest generate library` 生成此类项目。决定什么属于库是一个架构设计决策。我们在 [Libraries](/cli/libraries) 章中深入讨论了库。

#### CLI 属性

Nest 将组织、构建和部署标准和 monorepo 项目所需的元数据保留在 `nest-cli.json` 文件中。当您添加项目时，Nest 会自动更新此文件，因此通常无需手动编辑。但是，您可能希望手动更改某些设置，因此了解该文件的结构会有所帮助。

完成上述步骤后，`nest-cli.json` 文件如下所示：

```javascript
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "apps/my-project/src",
  "compilerOptions": {
    "deleteOutDir": true,
    "builder": "rspack",
    "tsConfigPath": "apps/my-project/tsconfig.app.json"
  },
  "monorepo": true,
  "root": "apps/my-project",
  "projects": {
    "my-app": {
      "type": "application",
      "root": "apps/my-app",
      "entryFile": "main",
      "sourceRoot": "apps/my-app/src",
      "compilerOptions": {
        "tsConfigPath": "apps/my-app/tsconfig.app.json"
      }
    },
    "my-project": {
      "type": "application",
      "root": "apps/my-project",
      "entryFile": "main",
      "sourceRoot": "apps/my-project/src",
      "compilerOptions": {
        "tsConfigPath": "apps/my-project/tsconfig.app.json"
      }
    }
  }
}

```

该文件分为几个部分：

- 一个全局部分，包含控制标准和 monorepo 范围设置的顶层属性
- 一个顶层属性（`"projects"`），包含每个项目的元数据。此部分仅存在于 monorepo 模式结构中。

顶层属性如下：

- `"collection"`：指向用于生成组件的脚手架集合；通常不应更改此值
- `"sourceRoot"`：指向标准模式结构中单个项目的源代码根目录，或 monorepo 模式结构中的 _default project_
- `"compilerOptions"`：一个映射，键指定编译器选项，值指定选项设置；详见下文
- `"generateOptions"`：一个映射，键指定全局生成选项，值指定选项设置；详见下文
- `"monorepo"`：(仅 monorepo) 对于 monorepo 模式结构始终为 `true`
- `"root"`：(仅 monorepo) 指向 _default project_ 的项目根目录

#### 全局编译器选项

这些属性指定要使用的编译器，以及影响**任何**编译步骤的选项，无论它作为 `nest build` 的一部分运行还是作为 `nest start` 的一部分运行，以及您使用哪个编译器（`tsc`、`swc` 或 Rspack）。

| 属性名称 | 属性值类型 | 描述 |
| :--- | :--- | :--- |
| `webpack` | boolean | 基于 webpack 的编译的已弃用遗留标志。请使用 `builder` 代替。 |
| `tsConfigPath` | string | (**仅 monorepo**) 指向包含 `tsconfig.json` 设置的文件，当在不带 `project` 选项的情况下调用 `nest build` 或 `nest start` 时将使用这些设置（例如，当构建或启动默认项目时）。 |
| `webpackConfigPath` | string | webpack 选项的已弃用遗留路径。请使用 `builder.options.configPath` 代替。 |
| `deleteOutDir` | boolean | 如果为真，编译器在每次调用时首先删除编译输出目录（按 `tsconfig.json` 配置；默认为 `./dist`）。 |
| `assets` | array | 在编译步骤开始时启用非 TypeScript 资产的自动分发（在 `--watch` 模式下的增量编译中**不**分发资产）。详情见下文。 |
| `watchAssets` | boolean | 如果为真，以监视模式运行，监视**所有**非 TypeScript 资产。（有关监视哪些资产的更精细控制，请参阅下文 [Assets](/cli/workspaces#资源) 部分。） |
| `manualRestart` | boolean | 如果为真，启用 `rs` 快捷方式以手动重启服务器。默认为 `false`。 |
| `builder` | string/object | CLI 用于编译项目的构建器（`tsc`、`swc` 或 `rspack`）。要自定义构建器的行为，请传递一个包含两个属性的对象：`type`（`tsc`、`swc` 或 `rspack`）和 `options`。 |
| `typeCheck` | boolean | 如果为真，为由 SWC 驱动的项目启用类型检查（当 `builder` 为 `swc` 时）。默认为 `false`。 |
| `emitDeclarations` | boolean | 如果为真，使用 SWC 构建器时发出声明文件（`.d.ts`）。默认为 `false`。 |
| `bundleDependencies` | boolean/object | 如果为真，Rspack 构建器将从 `node_modules` 中捆绑依赖项到输出中，但不包括 Node.js 内置模块、带有原生附加组件的包和 `swagger-ui-dist`（其文件在运行时从磁盘读取）。这些保持外部，并被固定在紧邻捆绑包中发出的 `package.json` 中，因此在输出目录中运行 `npm install --omit=dev` 只会安装它们。要保持更多包为外部，请传递一个对象：`{ "exclude": ["typeorm"] }`。与其他构建器无关。默认为 `false`。 |
| `includeLibraryAssets` | array | (**仅 monorepo**) 应用程序构建时应复制其资产的库项目名称列表。 |

> 警告 **警告** 在 monorepo 模式下，项目的 `compilerOptions` 不会与顶层的 `compilerOptions` 合并。例如，项目级别的 `assets` 数组会替换顶层的 `assets` 数组，而不是将其添加到其中。要在使用应用构建时也复制库的资产，请在 `includeLibraryAssets` 中列出该库。

#### 全局生成选项

这些属性指定了 `nest generate` 命令的默认选项。

| 属性名称 | 属性值类型 | 描述 |
| ------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spec`        | boolean _or_ object | 如果值为布尔值，`true` 默认启用 `spec` 生成，而 `false` 禁用它。命令行传递的标志会覆盖此设置，项目特定的 `generateOptions` 设置也会覆盖它（见下文）。如果值为对象，每个键都是一个脚手架名称，其布尔值启用或禁用该脚手架的默认规范生成。 |
| `flat`        | boolean             | 如果为 `true`，所有 generate 命令都生成扁平结构。 |

以下示例使用布尔值禁用所有项目的规范文件生成：

```javascript
{
  "generateOptions": {
    "spec": false
  },
  ...
}

```

以下示例使用布尔值使扁平文件生成成为所有项目的默认设置：

```javascript
{
  "generateOptions": {
    "flat": true
  },
  ...
}

```

在以下示例中，仅禁用 `service` 脚手架（例如 `nest generate service...`）的 `spec` 文件生成：

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

> 警告 **警告** 当您将 `spec` 指定为对象时，脚手架键不支持别名。例如，如果您设置了 `service: false`，然后通过其别名 `s` 生成一个服务，规范文件仍然会被生成。要同时覆盖脚手架名称及其别名，请像下面所示同时指定两者。
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

#### 项目特定生成选项

除了全局生成选项外，您还可以指定项目特定的生成选项。它们使用与全局选项相同的格式，但您直接在每个项目上设置它们。

项目特定生成选项会覆盖全局生成选项。

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

> 警告 **警告** 生成选项的优先级顺序如下：命令行传递的选项优先于项目特定选项，项目特定选项再覆盖全局选项。

#### 指定编译器

标准模式和 Monorepo 模式使用不同的默认编译器，因为对于较大的项目（在 Monorepo 中更常见），Rspack 可以显著减少构建时间，并生成一个打包了所有项目组件的单个文件。要生成独立文件而不是单个文件，请将构建器设置为 `tsc` 或 `swc`。

#### 资产

TypeScript 编译会自动将编译器输出（`.js` 和 `.d.ts` 文件）分发到指定的输出目录。分发非 TypeScript 文件，例如 `.graphql` 文件、图像、`.html` 文件和其他资产也会很方便。这使您可以将 `nest build`（以及任何初始编译步骤）视为一个轻量级的**开发构建**步骤，在此过程中您可以编辑非 TypeScript 文件并进行迭代编译和测试。
资产必须位于 `src` 文件夹中；否则它们不会被复制。

`assets` 键的值是一个指定要分发的文件元素的数组。这些元素可以是带有 `glob` 风格文件规范的简单字符串，例如：

```typescript
"assets": ["**/*.graphql"],
"watchAssets": true,

```

为了更精细的控制，元素可以是具有以下键的对象：

- `"include"`: 要分发的资产的 `glob` 风格文件规范
- `"exclude"`: 要从 `include` 列表中**排除**的资产的 `glob` 风格文件规范
- `"outDir"`: 分发资产的路径（相对于根文件夹）。默认为编译器输出配置的输出目录。
- `"watchAssets"`: 布尔值；如果为 `true`，则以监视模式运行，监视指定的资产

例如：

```typescript
"assets": [
  { "include": "**/*.graphql", "exclude": "**/omitted.graphql", "watchAssets": true },
]

```

> 警告 **警告** 在顶层 `compilerOptions` 属性中设置 `watchAssets` 会覆盖 `assets` 属性内的任何 `watchAssets` 设置。

#### 项目属性

此元素仅存在于 monorepo 模式结构中。通常不应编辑这些属性，因为 Nest 使用它们在 monorepo 中定位项目及其配置选项。