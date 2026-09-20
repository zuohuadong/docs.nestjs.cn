<!-- 此文件从 content/recipes/swc.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T09:33:56.980Z -->
<!-- 源文件: content/recipes/swc.md -->
<!-- 源哈希: a0c57e0f4e3faaeb5dc34f5fac234f4b -->

### SWC

[SWC](https://swc.rs/) (Speedy Web Compiler) 是一个基于 Rust 的可扩展平台，可用于编译和打包。将 SWC 与 Nest CLI 一起使用是一种简单且能显著加速开发过程的好方法。

> info **提示** SWC 比默认的 TypeScript 编译器大约快 **x20 倍**。

#### 安装

首先，安装几个包：

```bash
$ npm i --save-dev @swc/cli @swc/core

```

#### 开始使用

安装完成后，您可以按如下方式将 `swc` 构建器与 Nest CLI 一起使用：

```bash
$ nest start -b swc
# OR nest start --builder swc

```

> info **提示** 如果您的仓库是 monorepo，请查看 [this section](/recipes/swc#monorepo)。

除了传递 `-b` 标志，您还可以在 `nest-cli.json` 文件中将 `compilerOptions.builder` 属性设置为 `"swc"`，如下所示：

```json
{
  "compilerOptions": {
    "builder": "swc"
  }
}

```

要自定义构建器的行为，您可以传递一个包含两个属性的对象：`type` (`"swc"`) 和 `options`，如下所示：

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

例如，要让 swc 编译 `.jsx` 和 `.tsx` 文件，请执行：

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

要以监视模式运行应用程序，请使用以下命令：

```bash
$ nest start -b swc -w
# OR nest start --builder swc --watch

```

#### 类型检查

SWC 本身不执行任何类型检查（与默认的 TypeScript 编译器相反），因此要启用它，您需要使用 `--type-check` 标志：

```bash
$ nest start -b swc --type-check

```

此命令将指示 Nest CLI 在 `noEmit` 模式下与 SWC 一起运行 `tsc`，它将异步执行类型检查。同样，除了传递 `--type-check` 标志，您还可以在 `nest-cli.json` 文件中将 `compilerOptions.typeCheck` 属性设置为 `true`，如下所示：

```json
{
  "compilerOptions": {
    "builder": "swc",
    "typeCheck": true
  }
}

```

#### CLI 插件 (SWC)

`--type-check` 标志将自动执行 **NestJS CLI 插件**，并生成一个序列化的元数据文件，该文件随后可在运行时由应用程序加载。

#### SWC 配置

SWC 构建器已预先配置以满足 NestJS 应用程序的要求。但是，您可以通过在根目录中创建 `.swcrc` 文件并根据需要调整选项来自定义配置。

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

#### Monorepo

如果您的仓库是 monorepo，那么您必须配置 `webpack` 以使用 `swc-loader`，而不是使用 `swc` 构建器。

首先，让我们安装所需的包：

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

现在，如果您使用 CLI 插件，`swc-loader` 不会自动加载它们。相反，您必须创建一个单独的文件来手动加载它们。为此，请在 `main.ts` 文件旁边声明一个 `generate-metadata.ts` 文件，内容如下：

```ts
import { PluginMetadataGenerator } from '@nestjs/cli/lib/compiler/plugins/plugin-metadata-generator';
import { ReadonlyVisitor } from '@nestjs/swagger/dist/plugin';

const generator = new PluginMetadataGenerator();
generator.generate({
  visitors: [new ReadonlyVisitor({ introspectComments: true, pathToSource: import.meta.dirname })],
  outputDir: import.meta.dirname,
  watch: true,
  tsconfigPath: 'apps/<name>/tsconfig.app.json',
});

```

> info **提示** 在此示例中，我们使用了 `@nestjs/swagger` 插件，但您可以使用任何您选择的插件。

`generate()` 方法接受以下选项：

|                    |                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `watch`            | 是否监视项目的变化。                                                                                      |
| `tsconfigPath`     | `tsconfig.json` 文件的路径。相对于当前工作目录 (`process.cwd()`)。 |
| `outputDir`        | 元数据文件将保存到的目录路径。                                                                                   |
| `visitors`         | 用于生成元数据的访问器数组。                                                                                   |
| `filename`         | 元数据文件的名称。默认为 `metadata.ts`。                                                                      |
| `printDiagnostics` | 是否将诊断信息打印到控制台。默认为 `true`。                                                               |

最后，您可以在单独的终端窗口中运行 `generate-metadata` 脚本，使用以下命令：

```bash
$ npx ts-node src/generate-metadata.ts
# OR npx ts-node apps/{YOUR_APP}/src/generate-metadata.ts

```

#### 常见陷阱

如果您在应用程序中使用 TypeORM/MikroORM 或任何其他 ORM，您可能会遇到循环导入问题。SWC 不能很好地处理**循环导入**，因此您应该使用以下解决方法：

```typescript
@Entity()
export class User {
  @OneToOne(() => Profile, (profile) => profile.user)
  profile: Relation<Profile>; // <--- see "Relation<>" type here instead of just "Profile"
}

```

> info **提示** `Relation` 类型从 `typeorm` 包中导出。

这样做可以防止属性类型被保存在转译代码的属性元数据中，从而避免循环依赖问题。

如果您的 ORM 没有提供类似的解决方法，您可以自己定义包装类型：

```typescript
/**
 * Wrapper type used to circumvent ESM modules circular dependency issue
 * caused by reflection metadata saving the type of the property.
 */
export type WrapperType<T> = T; // WrapperType === Relation

```

对于项目中的所有 [circular dependency injections](/fundamentals/circular-dependency)，您还需要使用上述自定义包装类型：

```typescript
@Injectable()
export class UsersService {
  constructor(
    @Inject(forwardRef(() => ProfileService))
    private readonly profileService: WrapperType<ProfileService>,
  ) {};
}

```

### Jest + SWC

要将 SWC 与 Jest 一起使用，您需要安装以下包：

```bash
$ npm i --save-dev jest @swc/core @swc/jest

```

安装完成后，使用以下内容更新 `package.json`/`jest.config.js` 文件（取决于您的配置）：

```json
{
  "jest": {
    "transform": {
      "^.+\\.(t|j)s?$": ["@swc/jest"]
    }
  }
}

```

此外，您需要在 `.swcrc` 文件中添加以下 `transform` 属性：`legacyDecorator`、`decoratorMetadata`：

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

如果您在项目中使用 NestJS CLI 插件，您将需要手动运行 `PluginMetadataGenerator`。请导航到 [this section](/recipes/swc#monorepo-and-cli-plugins) 了解更多信息。

### Vitest

[Vitest](https://vitest.dev/) 是一个快速、轻量级的测试运行器，专为与 Vite 配合使用而设计。它提供了一个现代、快速且易于使用的测试解决方案，可以与 NestJS 项目集成。

#### 安装

首先，安装所需的包：

```bash
$ npm i --save-dev vitest unplugin-swc @swc/core @vitest/coverage-v8

```

#### 配置

在应用程序的根目录中创建一个 `vitest.config.ts` 文件，内容如下：

```ts
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

此配置文件设置了 Vitest 环境、根目录和 SWC 插件。您还应为 e2e 测试创建一个单独的配置文件，并添加一个额外的 `include` 字段来指定测试路径正则表达式：

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

此外，您可以设置 `alias` 选项以在测试中支持 TypeScript 路径：

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

与 Jest 不同，Vitest 不会自动解析诸如 `src/` 之类的 TypeScript 路径别名。这可能会导致测试期间出现依赖解析错误。要解决此问题，请在您的 `vitest.config.ts` 文件中添加以下 `resolve.alias` 配置：

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

这确保了 Vitest 能正确解析模块导入，防止与缺失依赖相关的错误。

#### 更新 E2E 测试中的导入

将所有使用 `import * as request from 'supertest'` 的 E2E 测试导入更改为 `import request from 'supertest'`。这是必要的，因为 Vitest 在与 Vite 捆绑时，期望 supertest 使用默认导入。在此特定设置中，使用命名空间导入可能会导致问题。

最后，将 package.json 文件中的测试脚本更新为以下内容：

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:cov": "vitest run --coverage",
    "test:debug": "vitest --inspect-brk --inspect --logHeapUsage --threads=false",
    "test:e2e": "vitest run --config ./vitest.config.e2e.ts"
  }
}

```

这些脚本配置了 Vitest 以运行测试、监视更改、生成代码覆盖率报告和调试。test:e2e 脚本专门用于使用自定义配置文件运行 E2E 测试。

通过此设置，您现在可以在 NestJS 项目中享受使用 Vitest 的好处，包括更快的测试执行和更现代的测试体验。

> info **提示** 您可以在此 [repository](https://github.com/TrilonIO/nest-vitest) 中查看一个可用的示例。