<!-- 此文件从 content/cli/libraries.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T08:18:26.120Z -->
<!-- 源文件: content/cli/libraries.md -->
<!-- 源哈希: e69d3086be0fb3108ee01d22b48ffea5 -->

### 库

许多应用程序需要解决相同的通用问题，或在多个不同的上下文中重用模块化组件。Nest 有几种方式来解决这个问题，但每种方式都在不同的层面工作，以帮助满足不同的架构和组织目标。

Nest [modules](/modules) 可用于提供执行上下文，使组件能够在单个应用程序内共享。模块也可以与 [npm](https://npmjs.com) 一起打包，以创建可安装在不同项目中的可重用库。这是分发可配置、可重用库的有效方式，这些库可供不同、松散关联或无关联的组织使用（例如，通过分发/安装第三方库）。

对于在紧密组织的团队内共享代码（例如，在公司/项目边界内），采用更轻量级的方法来共享组件会很有用。Monorepo 作为一种结构应运而生，在 monorepo 中，**库**提供了一种以简单、轻量级方式共享代码的途径。在 Nest monorepo 中，使用库可以轻松组装共享组件的应用程序。实际上，这鼓励将单体应用程序和开发流程分解，专注于构建和组合模块化组件。

#### Nest 库

Nest 库是一种 Nest 项目，与应用程序的不同之处在于它不能独立运行。库必须导入到包含它的应用程序中才能执行其代码。本节描述的内置库支持仅适用于 **monorepo**（标准模式项目可以使用 npm 包实现类似功能）。

例如，一个组织可能开发一个 `AuthModule` 来管理认证，通过实施管理所有内部应用程序的公司策略。与其为每个应用程序单独构建该模块，或使用 npm 物理打包代码并要求每个项目安装它，monorepo 可以将此模块定义为库。以这种方式组织时，库模块的所有使用者都可以在提交时看到 `AuthModule` 的最新版本。这对于协调组件开发和组装以及简化端到端测试具有显著好处。

#### 创建库

任何适合重用的功能都可以作为库来管理。决定什么应该是库，什么应该是应用程序的一部分，是一个架构设计决策。创建库不仅仅是简单地将代码从现有应用程序复制到新库中。当打包为库时，库代码必须与应用程序解耦。这可能需要**更多**的前期时间，并迫使你做出一些在更紧密耦合的代码中可能不会面临的设计决策。但当库可以用于加速多个应用程序的组装时，这些额外的努力是值得的。

要开始创建库，请运行以下命令：

```bash
$ nest g library my-library

```

运行该命令时，`library` 示意图会提示你为库提供前缀（也称为别名）：

```bash
What prefix would you like to use for the library (default: @app)?

```

这会在你的工作空间中创建一个名为 `my-library` 的新项目。库类型项目与应用程序类型项目一样，使用示意图生成到命名文件夹中。库在 monorepo 根目录的 `libs` 文件夹下管理。Nest 在首次创建库时创建 `libs` 文件夹。

为库生成的文件与为应用程序生成的文件略有不同。以下是执行上述命令后 `libs` 文件夹的内容：

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

`nest-cli.json` 文件将在 `"projects"` 键下为库添加一个新条目：

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

库和应用程序之间的 `nest-cli.json` 元数据有两个区别：

- `"type"` 属性设置为 `"library"` 而不是 `"application"`
- `"entryFile"` 属性设置为 `"index"` 而不是 `"main"`

这些差异使构建过程能够适当地处理库。例如，库通过 `index.js` 文件导出其函数。

与应用程序类型项目一样，每个库都有自己的 `tsconfig.lib.json` 文件，该文件扩展了根（monorepo 范围）`tsconfig.json` 文件。如有必要，你可以修改此文件以提供特定于库的编译器选项。

你可以使用 CLI 命令构建库：

```bash
$ nest build my-library

```

#### 使用库

有了自动生成的配置文件，使用库就很简单了。我们如何将 `MyLibraryService` 从 `my-library` 库导入到 `my-project` 应用程序中？

首先，请注意使用库模块与使用任何其他 Nest 模块相同。Monorepo 所做的是以透明的方式管理路径，使导入库和生成构建变得透明。要使用 `MyLibraryService`，我们需要导入其声明模块。我们可以按如下方式修改 `my-project/src/app.module.ts` 以导入 `MyLibraryModule`。

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

注意上面我们在 ES 模块 `import` 行中使用了路径别名 `@app`，这是我们在上面的 `nest g library` 命令中提供的 `prefix`。在底层，Nest 通过 tsconfig 路径映射来处理这个问题。添加库时，Nest 会像这样更新全局（monorepo）`tsconfig.json` 文件的 `"paths"` 键：

```javascript
"paths": {
    "@app/my-library": [
        "libs/my-library/src"
    ],
    "@app/my-library/*": [
        "libs/my-library/src/*"
    ]
}

```

> warning **警告** `paths` 映射仅被 TypeScript 编译器理解。测试运行器自行解析模块——如果你使用 Jest 运行端到端测试，请在 e2e Jest 配置的 `moduleNameMapper` 选项中镜像每个别名，例如：`"moduleNameMapper": { "^@app/my-library(|/.*)$": "<rootDir>/../../libs/my-library/src/$1" }`。否则，即使项目可以编译，通过别名的导入也会在测试运行时失败。

所以，简而言之，Monorepo 和库功能的结合使得将库模块包含到应用程序中变得简单直观。

同样的机制允许你构建和部署组合库的应用程序。一旦你导入了 `MyLibraryModule`，运行 `nest build` 会自动处理所有模块解析，并将应用程序与所有库依赖一起打包，以便部署。Monorepo 的默认编译器是 **Rspack**，因此生成的发布文件是一个单一文件，将所有转译后的 JavaScript 文件打包到一个文件中。你也可以按照<a href="/cli/monorepo#global-compiler-options">此处</a>的描述切换到 `tsc`。