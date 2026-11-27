<!-- 此文件从 content/recipes/swc.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:09:57.530Z -->
<!-- 源文件: content/recipes/swc.md -->
<!-- 源哈希: fe4faac2055c6f948ef3bac72666470e -->

### SWC

[SWC](https://swc.rs/) (Speedy Web Compiler) 是一个可扩展的基于 Rust 的平台，可用于编译和打包。将 SWC 与 Nest CLI 结合使用是显著加速开发过程的简单方法。

> info **提示** SWC 的速度比默认的 TypeScript 编译器快约 **20 倍**。

#### 安装

要开始使用，首先安装一些包：

```bash
$ npm i --save-dev @swc/cli @swc/core

```

#### 入门

安装完成后，您可以使用 Nest CLI 配合 `swc` 构建器，如下所示：

```bash
$ nest start -b swc
# OR nest start --builder swc

```

> info **提示** 如果您的仓库是 **Monorepo**，请参阅 [Monorepo](/recipes/swc#monorepo) 部分。

您无需传递 `-b` 标志，而可以在您的 `nest-cli.json` 文件中将 `compilerOptions.builder` 属性设置为 `"swc"`：

```json
{
  "compilerOptions": {
    "builder": "swc"
  }
}

```

要自定义构建器的行为，请按如下方式传递包含两个属性的对象：`type` (`"swc"`) 和 `options`：

```json
{
  "compilerOptions": {
    "builder": {
      "type": "swc",
      "options": {
        "swcrcPath": "infrastructure/.swcrc",
      }
    }
  }
}

```

例如，要让 SWC 编译 `.jsx` 和 `.tsx` 文件，请使用以下配置：

```json
{
  "compilerOptions": {
    "builder": {
      "type": "swc",
      "options": { "extensions": [".ts", ".tsx", ".js", ".jsx"] }
    },
  }
}

```

要以监听模式运行应用程序，请使用以下命令：

```bash
$ nest start -b swc -w
# OR nest start --builder swc --watch

```

#### 类型检查

与默认的 TypeScript 编译器不同，SWC 本身不执行任何类型检查。要开启类型检查，请使用 `--type-check` 标志：

```bash
$ nest start -b swc --type-check

```

此命令指示 Nest CLI 在 SWC 旁边以 `noEmit` 模式运行 `tsc`，后者异步执行类型检查。您也可以在您的 `nest-cli.json` 文件中将 `compilerOptions.typeCheck` 属性设置为 `true`，而不是传递 `--type-check` 标志：

```json
{
  "compilerOptions": {
    "builder": "swc",
    "typeCheck": true
  }
}

```

#### CLI 插件 (SWC)

`--type-check` 标志会自动执行 **NestJS CLI 插件** 并生成一个序列化的元数据文件，应用程序随后可在运行时加载该文件。

#### SWC 配置

SWC 构建器预配置以匹配 NestJS 应用程序的要求。但是，您可以通过在根目录中创建 `.swcrc` 文件并根据需要调整选项来自定义配置：

```json
{
  "$schema": "https://swc.rs/schema.json",
  "sourceMaps": true,
  "jsc": {
    "parser": {
      "syntax": "typescript",
      "decorators": true,
      "dynamicImport": true
    },
    "baseUrl": "./"
  },
  "minify": false
}

```

> info **提示** SWC 构建器发出的模块格式与 TypeScript 编译器相同：当您的 `package.json` 文件设置 `"type": "module"`（新项目的默认设置）时为 ES 模块，否则为 CommonJS。`.swcrc` 中的 `module` 设置会覆盖此行为。

#### Monorepo

> info **提示** 从 NestJS v12 开始，**Monorepo** 默认使用 Rspack 构建器，Rspack 内置的 `swc-loader` 已经使用 SWC 编译了您的代码。以下设置仅适用于您使用已弃用的 webpack 构建器的情况。

如果您的仓库是 **Monorepo**，那么您需要配置 `webpack` 以使用 `swc-loader`，而不是使用 `swc` 构建器。

首先，安装所需的包：

```bash
$ npm i --save-dev swc-loader

```

安装完成后，在应用程序的根目录中创建一个 `webpack.config.js` 文件，内容如下：

```js
const swcDefaultConfig = require('@nestjs/cli/lib/compiler/defaults/swc-defaults').swcDefaultsFactory().swcOptions;

module.exports = {
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: {
          loader: 'swc-loader',
          options: swcDefaultConfig,
        },
      },
    ],
  },
};

```

#### Monorepo 和 CLI 插件

如果您使用 CLI 插件，`swc-loader` 不会自动加载它们。相反，您需要创建一个单独的文件来手动加载它们。为此，请在 `main.ts` 文件旁边创建一个 `generate-metadata.ts` 文件，内容如下：

```ts
import { PluginMetadataGenerator } from '@nestjs/cli/lib/compiler/plugins/plugin-metadata-generator.js';
import { ReadonlyVisitor } from '@nestjs/swagger/plugin';

const generator = new PluginMetadataGenerator();
generator.generate({
  visitors: [new ReadonlyVisitor({ introspectComments: true, pathToSource: import.meta.dirname })],
  outputDir: import.meta.dirname,
  watch: true,
  tsconfigPath: 'apps/<name>/tsconfig.app.json',
});

```

> info **提示** 此示例使用了 `@nestjs/swagger` 插件，但您可以使用任何选择的插件。

`generate()` 方法接受以下选项：

|                    |                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `watch`            | 是否监听项目变化。                                                                             |
| `tsconfigPath`     | `tsconfig.json` 文件的路径。相对于当前工作目录 (`process.cwd()`)。 |
| `outputDir`        | 元数据文件保存的目录路径。                                                                    |
| `visitors`         | 用于生成元数据的访问者数组。                                                                |
| `filename`         | 元数据文件名。默认为 `metadata.ts`。                                                              |
| `printDiagnostics` | 是否将诊断信息打印到控制台。默认为 `true`。                                                   |

最后，在单独的终端窗口中运行 `generate-metadata` 脚本，使用以下命令：

```bash
$ npx ts-node src/generate-metadata.ts
# OR npx ts-node apps/{YOUR_APP}/src/generate-metadata.ts

```

#### 常见陷阱

如果您的应用程序使用 TypeORM、MikroORM 或任何其他 ORM，您可能会遇到循环导入问题。SWC 对 **循环依赖** 处理不佳，因此请使用以下解决方法：

```typescript
@Entity()
export class User {
  @OneToOne(() => Profile, (profile) => profile.user)
  profile: Relation<Profile>; // <--- see "Relation<>" type here instead of just "Profile"
}

```

> info **提示** `Relation` 类型是从 `typeorm` 包导出的。

这可以防止属性类型保存在转译代码的属性元数据中，从而避免循环依赖问题。

如果您的 ORM 没有提供类似的工作解决方法，您可以自行定义包装器类型：

```typescript
/**
 * Wrapper type used to circumvent ESM modules circular dependency issue
 * caused by reflection metadata saving the type of the property.
 */
export type WrapperType<T> = T; // WrapperType === Relation

```

对于项目中的所有 [circular dependency injections](/fundamentals/circular-dependency)，您还需要使用上述自定义包装器类型：

```typescript
@Injectable()
export class UsersService {
  constructor(
    @Inject(forwardRef(() => ProfileService))
    private readonly profileService: WrapperType<ProfileService>,
  ) {}
}

```

### Jest + SWC

要将 SWC 与 Jest（CommonJS 项目的默认测试运行器）一起使用，请安装以下包：

```bash
$ npm i --save-dev jest @swc/core @swc/jest

```

安装完成后，使用以下内容更新您的 `package.json` 或 `jest.config.js` 文件（取决于您的配置）：

```json
{
  "jest": {
    "transform": {
      "^.+\\.(t|j)s?$": ["@swc/jest"]
    }
  }
}

```

此外，将 `legacyDecorator` 和 `decoratorMetadata` `transform` 属性添加到您的 `.swcrc` 文件中：

```json
{
  "$schema": "https://swc.rs/schema.json",
  "sourceMaps": true,
  "jsc": {
    "parser": {
      "syntax": "typescript",
      "decorators": true,
      "dynamicImport": true
    },
    "transform": {
      "legacyDecorator": true,
      "decoratorMetadata": true
    },
    "baseUrl": "./"
  },
  "minify": false
}

```

如果您的项目中使用了 NestJS CLI 插件，您必须手动运行 `PluginMetadataGenerator`。请参阅 [Monorepo and CLI plugins](/recipes/swc#monorepo-and-cli-plugins) 部分了解更多信息。

### Vitest

[Vitest](https://vitest.dev/) 是一个快速、轻量级的测试运行器，专为与 Vite 配合使用而设计。使用 ES 模块（默认）的新 NestJS 项目已预先配置了 Vitest。本节展示如何配置 Vitest 使用 SWC 构建测试文件。

#### 安装

要开始，首先安装所需的包：

```bash
$ npm i --save-dev vitest unplugin-swc @swc/core @vitest/coverage-v8

```

#### 配置

在应用程序的根目录中创建一个 `vitest.config.ts` 文件，内容如下：

```ts
import { resolve } from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
  },
  plugins: [
    // This is required to build the test files with SWC
    swc.vite({
      // Explicitly set the module type to avoid inheriting this value from a `.swcrc` config file
      module: { type: 'es6' },
    }),
  ],
  resolve: {
    alias: {
      // Ensure Vitest correctly resolves TypeScript path aliases
      'src': resolve(import.meta.dirname, './src'),
    },
  },
});

```

此配置文件设置了 Vitest 环境、根目录和 SWC 插件。您还应为端到端测试创建单独的配置文件（例如 `vitest.config.e2e.ts`），其中包含一个额外的 `include` 字段，用于指定测试文件的 glob 模式：

```ts
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.e2e-spec.ts'],
    globals: true,
    root: './',
  },
  plugins: [swc.vite()],
});

```

此外，您可以设置 `alias` 选项以支持测试中的 TypeScript 路径：

```ts
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.e2e-spec.ts'],
    globals: true,
    alias: {
      '@src': './src',
      '@test': './test',
    },
    root: './',
  },
  resolve: {
    alias: {
      '@src': './src',
      '@test': './test',
    },
  },
  plugins: [swc.vite()],
});

```

### 路径别名

Vitest 不会自动解析 TypeScript 路径别名，例如 `src/`，这可能在测试期间导致依赖解析错误。要修复此问题，请将以下 `resolve.alias` 配置添加到您的 `vitest.config.ts` 文件中：

```ts
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      'src': resolve(import.meta.dirname, './src'),
    },
  },
});

```

这确保了 Vitest 正确解析模块导入，防止与缺失依赖相关的错误。

#### 更新 E2E 测试中的导入

将任何使用 `import * as request from 'supertest'` 的 E2E 测试导入更改为 `import request from 'supertest'`。`supertest` 是一个导出函数的 CommonJS 模块，在像 Vitest 这样的 ES 模块设置中，命名空间导入是不可调用的，因此您需要默认导入。

最后，更新您 `package.json` 文件中的测试脚本：

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:cov": "vitest run --coverage",
    "test:debug": "vitest --inspect-brk --no-file-parallelism",
    "test:e2e": "vitest run --config ./vitest.config.e2e.ts"
  }
}

```

这些脚本用于运行测试、监视更改、生成代码覆盖率报告和启动调试会话。`test:e2e` 脚本使用专用的配置文件运行 E2E 测试。

> info **提示** 可在 [nest-vitest repository](https://github.com/TrilonIO/nest-vitest) 找到一个可工作的示例。