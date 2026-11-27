<!-- 此文件从 content/application/configuration.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T01:01:46.441Z -->
<!-- 源文件: content/application/configuration.md -->
<!-- 源哈希: dffe6ab8e09b0a8230802e71a2477ea1 -->

### 配置

应用程序通常在不同的**环境**中运行，每个环境都需要其自己的配置设置。例如，本地环境通常依赖于仅对本地数据库实例有效的数据库凭证，而生产环境则使用一套独立的凭证。由于配置变量在不同环境之间变化，最佳实践是在环境中[store configuration variables](https://12factor.net/config)。

外部定义的**环境变量**可以通过`process.env`全局在 Node.js 内部可见。您可以通过在每个环境中分别设置**环境变量**来处理多个环境。这很快会变得难以管理，尤其是在开发和测试环境中，这些值需要易于模拟或更改。

在 Node.js 应用程序中，通常使用一个`.env`文件来表示每个环境，该文件包含键值对。然后在不同环境中运行应用程序就变成了切换正确的`.env`文件的问题。

在 Nest 中应用此技术的良好方法是创建一个`ConfigModule`来暴露一个`ConfigService`，该`ConfigService`加载适当的`.env`文件。您可以自己编写这样一个**模块**，但为了方便，Nest 提供了`@nestjs/config`包。本章介绍该包。

#### 安装

要开始，安装所需的依赖项：

```bash
$ npm i --save @nestjs/config

```

> info **提示** `@nestjs/config`包内部使用[dotenv](https://github.com/motdotla/dotenv)。

> warning **注意** `@nestjs/config`需要 TypeScript 4.1 或更高版本。

#### 开始使用

安装完成后，导入`ConfigModule`。通常，您将其导入到根`AppModule`中，并使用`.forRoot()`静态方法控制其行为。在此步骤中，**环境变量**键/值对被解析和解析。之后，您将在其他功能**模块**中看到访问`ConfigService`类的`ConfigModule`的几种选项。

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot()],
})
export class AppModule {}

```

此代码从默认位置（进程启动的目录，通常是项目根目录）加载并解析一个`.env`文件，将来自`.env`文件的键/值对与分配给`process.env`的**环境变量**合并，并将结果存储在一个私有结构中，您可以通过`ConfigService`访问它。`forRoot()`方法注册了`ConfigService`**提供者**，该**提供者**提供了一个`get()`方法来读取这些已解析和合并的配置变量。由于`@nestjs/config`依赖于[dotenv](https://github.com/motdotla/dotenv)，它使用该包的规则来解析**环境变量**名称中的冲突。当一个键同时存在于运行时环境（例如，通过 shell 导出如`export DATABASE_USER=test`设置）和`.env`文件中时，运行时**环境变量**优先。要让来自`.env`文件的值获胜，请将`override`选项设置为`true`。

一个示例`.env`文件如下所示：

```json
DATABASE_USER=test
DATABASE_PASSWORD=test

```

如果您需要在`ConfigModule`加载和 Nest 应用程序启动之前（例如，将微服务配置传递给`NestFactory#createMicroservice()`方法）使某些**环境变量**可用，请使用 Nest CLI 的`--env-file`选项。它指定了在应用程序启动前加载的`.env`文件的路径。CLI 将文件传递给 Node.js `--env-file`标志；有关详细信息，请参阅[Node.js documentation](https://nodejs.org/dist/v20.18.1/docs/api/cli.html#--env-fileconfig)。

```bash
$ nest start --env-file .env

```

#### 自定义 env 文件路径

默认情况下，该包在当前工作目录（通常是应用程序的根目录）中查找`.env`文件。要为`.env`文件指定另一个路径，请像下面这样设置传递给`forRoot()`的可选选项对象的`envFilePath`属性：

```typescript
ConfigModule.forRoot({
  envFilePath: '.development.env',
});

```

您也可以为`.env`文件指定多个路径：

```typescript
ConfigModule.forRoot({
  envFilePath: ['.env.development.local', '.env.development'],
});

```

如果一个变量在多个文件中找到，则第一个文件优先。

#### 禁用 env 变量加载

如果您不希望加载`.env`文件，而只希望从运行时环境（例如，通过 shell 导出如`export DATABASE_USER=test`设置）访问**环境变量**，请将选项对象的`ignoreEnvFile`属性设置为`true`：

```typescript
ConfigModule.forRoot({
  ignoreEnvFile: true,
});

```

#### 原生`.env`支持

Node.js 可以仅使用`--env-file`标志（上面显示的`nest start --env-file`选项依赖于它）或使用`process.loadEnvFile()`方法来加载`.env`文件。要让 Node.js 加载文件并继续对其他所有内容使用`ConfigModule`，请像上面所示将`ignoreEnvFile`设置为`true`，这样**模块**只读取`process.env`：

```bash
$ node --env-file=.env dist/main.js

```

由于变量在`forRoot()`运行时已在`process.env`中，**验证**、`ConfigService#get()`和`registerAs()`工厂按预期工作。然而，`ConfigModule`将这些变量视为预定义，因此它们仅在`validatePredefined`保持其默认值`true`时才进行**验证**。已在运行时环境中设置的变量始终优先于文件（没有`override`选项的等效项），并且使用多个`--env-file`标志时，最后一个文件优先，这与`envFilePath`相反。

`process.loadEnvFile()`必须在导入`AppModule`之前运行，因为`forRoot()`在评估`app.module`文件时会读取`process.env`。`main.ts`主体中的调用太晚了，所以将其放在单独的文件中并先导入该文件：

```typescript title="main.ts"
import './load-env.js'; // contains only process.loadEnvFile()
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

```

或者，让`ConfigModule`负责加载文件（`envFilePath`、`override`等），并通过`parser`选项仅替换解析器。解析器接收每个文件的内容作为一个`Buffer`，并返回键/值对（默认为`dotenv.parse`）。由于`util.parseEnv()`只接受字符串，请先转换缓冲区：

```typescript
import { parseEnv } from 'node:util';

ConfigModule.forRoot({
  parser: (buf) => parseEnv(buf.toString()),
});

```

> warning **警告** 这些 API 背后的 Node.js 解析器与 dotenv 不完全兼容。例如，UTF-8 BOM 会出现在第一个键名中，引号内的引号会结束值（`'it's here'` 变为 `it`），仅由空格组成的**值**会吞噬下一行，因此那里定义的变量会丢失。其行为在 Node.js 20.x 和 22.x 次要版本之间也发生了变化。Node.js 不扩展变量，并且`parseEnv()`返回按名称排序的键，因此不要将`parser`选项与[`expandVariables`](/application/configuration#expandable-variables)结合使用：对名称排序靠后的变量的引用将表现得好像该变量未设置一样。

#### 全局使用模块

要在其他模块中使用 `ConfigModule`，需要导入它（与任何 Nest 模块一样）。或者，通过将选项对象的 `isGlobal` 属性设置为 `true` 来声明它为 [global module](/modules#全局模块)，如下所示。在这种情况下，一旦 `ConfigModule` 在根模块（例如 `AppModule`）中加载，就不需要在其他模块中导入它。

```typescript
ConfigModule.forRoot({
  isGlobal: true,
});

```

#### 自定义配置文件

对于更复杂的项目，您可以使用返回嵌套配置对象的自定义配置文件。这允许您按功能（例如数据库相关设置）对相关的配置设置进行分组，并将它们存储在单独的文件中，从而可以独立管理它们。

自定义配置文件导出一个工厂函数，该函数返回一个配置对象。该配置对象可以是任何任意嵌套的纯 JavaScript 对象。在工厂内部，`process.env` 对象包含完全解析的环境变量键/值对（已解析和合并 `.env` 文件和外部定义变量，如 [Getting started](/application/configuration#入门) 所述）。由于您控制返回的配置对象，您可以添加任何所需的逻辑，例如将值转换为适当的类型、设置默认值等。例如：

```typescript title="config/configuration.ts"
export default () => ({
  port: parseInt(process.env.PORT ?? '', 10) || 3000,
  database: {
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT ?? '', 10) || 5432
  }
});

```

使用传递给 `ConfigModule.forRoot()` 方法的选项对象的 `load` 属性加载此文件：

```typescript
import configuration from './config/configuration.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
    }),
  ],
})
export class AppModule {}

```

> info **提示** 赋给 `load` 属性的值是一个数组，因此您可以加载多个配置文件（例如 `load: [databaseConfig, authConfig]`）。

自定义配置文件还允许您从其他格式加载配置，例如 YAML。以下是 YAML 格式配置的示例：

```yaml
http:
  host: 'localhost'
  port: 8080

db:
  postgres:
    url: 'localhost'
    port: 5432
    database: 'yaml-db'

  sqlite:
    database: 'sqlite.db'

```

要读取和解析 YAML 文件，您可以使用 `js-yaml` 包：

```bash
$ npm i js-yaml

```

安装该包后，使用其 `load()` 函数读取上面创建的 YAML 文件：

```typescript title="config/configuration.ts"
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';

const YAML_CONFIG_FILENAME = 'config.yaml';

export default () => {
  return load(
    readFileSync(join(import.meta.dirname, YAML_CONFIG_FILENAME), 'utf8'),
  ) as Record<string, any>;
};

```

> warning **注意** Nest CLI 在构建过程中不会自动将您的 "assets"（非 TS 文件）复制到 `dist` 文件夹。为确保您的 YAML 文件被复制，请在 `nest-cli.json` 文件中的 `compilerOptions#资源` 对象中指定它们。例如，如果 `config` 文件夹与 `src` 文件夹在同一级别，请添加 `compilerOptions#资源` 并设置值为 `"assets": [{"include": "../config/*.yaml", "outDir": "./dist/config"}]`。详情请参阅 [Assets](/cli/workspaces#资源)。

即使您使用了 `ConfigModule` 的 `validationSchema` 选项（它仅适用于环境变量），配置文件也不会自动验证。如果您需要验证或想应用转换，请在工厂函数中处理，因为您对配置对象拥有完全的控制权。

例如，为确保端口在特定范围内，请向工厂函数添加验证步骤：

```typescript title="config/configuration.ts"
export default () => {
  const config = load(
    readFileSync(join(import.meta.dirname, YAML_CONFIG_FILENAME), 'utf8'),
  ) as Record<string, any>;

  if (config.http.port < 1024 || config.http.port > 49151) {
    throw new Error('HTTP port must be between 1024 and 49151');
  }

  return config;
};

```

现在，如果端口超出指定范围，应用程序在启动期间会抛出错误。

<app-banner-observe></app-banner-observe>

#### 使用 `ConfigService`

要访问配置值，首先注入 `ConfigService`。与任何提供者一样，您需要将包含它的模块，即 `ConfigModule`，导入到使用它的模块中（除非您将传递给 `ConfigModule.forRoot()` 的选项对象的 `isGlobal` 属性设置为 `true`）。如下所示，将其导入到功能模块中：

```typescript title="feature.module.ts"
@Module({
  imports: [ConfigModule],
  // ...
})

```

然后通过构造函数注入它：

```typescript
constructor(private configService: ConfigService) {}

```

> info **提示** 从 `@nestjs/config` 包导入 `ConfigService`。

然后在您的类中使用它：

```typescript
// get an environment variable
const dbUser = this.configService.get<string>('DATABASE_USER');

// get a custom configuration value
const dbHost = this.configService.get<string>('database.host');

```

如上所示，通过传递变量名使用 `configService.get()` 方法来获取简单的环境变量。您可以作为 TypeScript 类型提示传递类型参数（例如 `get<string>(...)`）。`get()` 方法还可以遍历嵌套的自定义配置对象（使用 [custom configuration file](/application/configuration#自定义配置文件) 创建），如第二个示例所示。

您也可以使用接口作为类型提示来获取整个嵌套的自定义配置对象：

```typescript
interface DatabaseConfig {
  host: string;
  port: number;
}

const dbConfig = this.configService.get<DatabaseConfig>('database');

// you can now use `dbConfig.port` and `dbConfig.host`
const port = dbConfig.port;

```

`get()` 方法还接受一个可选的第二个参数，用于定义默认值，当键不存在时返回该默认值：

```typescript
// use "localhost" when "database.host" is not defined
const dbHost = this.configService.get<string>('database.host', 'localhost');

```

如果需要一个值，请改用 `getOrThrow()` 方法。它接受与 `get()` 相同的参数，但如果解析出的值是 `undefined`，则抛出错误，并且其返回类型不包含 `undefined`：

```typescript
// throws if "DATABASE_USER" is not defined
const dbUser = this.configService.getOrThrow<string>('DATABASE_USER');

```

`ConfigService` 有两个可选的泛型（类型参数）。第一个有助于防止访问不存在的配置属性：

```typescript
interface EnvironmentVariables {
  PORT: number;
  TIMEOUT: string;
}

// somewhere in the code
constructor(private configService: ConfigService<EnvironmentVariables>) {
  const port = this.configService.get('PORT', { infer: true });

  // TypeScript Error: this is invalid as the URL property is not defined in EnvironmentVariables
  const url = this.configService.get('URL', { infer: true });
}

```

当 `infer` 属性设置为 `true` 时，`ConfigService#get` 方法会从接口推断属性类型。例如，由于 `PORT` 在 `EnvironmentVariables` 接口中具有 `number` 类型（启用 `strictNullChecks` 编译器选项时，类型为 `number | undefined`），所以 `port` 被类型化为 `number`。

使用 `infer` 功能，即使在使用点表示法时，您也可以推断出嵌套自定义配置对象属性的类型：

```typescript
constructor(private configService: ConfigService<{ database: { host: string } }>) {
  const dbHost = this.configService.get('database.host', { infer: true })!;
  // typeof dbHost === "string"                                          |
  //                                                                     +--> non-null assertion operator
}

```

第二个泛型依赖于第一个泛型。它充当一个类型断言，用于移除当启用 `strictNullChecks` 时 `ConfigService` 方法可能返回的 `undefined` 类型。例如：

```typescript
// ...
constructor(private configService: ConfigService<{ PORT: number }, true>) {
  //                                                               ^^^^
  const port = this.configService.get('PORT', { infer: true });
  //    ^^^ The type of port is 'number', so you don't need TS type assertions
}

```

> info **提示** 要使 `ConfigService#get` 方法忽略 `process.env` 变量，仅从自定义配置文件（以及如果使用验证，则从已验证的环境变量）检索值，请在传递给 `ConfigModule.forRoot()` 的选项对象中将 `skipProcessEnv` 选项设置为 `true`。

#### 配置命名空间

`ConfigModule` 允许您定义和加载多个自定义配置文件，如上文 [Custom configuration files](/application/configuration#自定义配置文件) 所示。您可以使用嵌套的配置对象来管理复杂的配置层次结构，如该部分所示。或者，您可以使用 `registerAs()` 函数返回一个“命名空间化”的配置对象，如下所示：

```typescript title="config/database.config.ts"
export default registerAs('database', () => ({
  host: process.env.DATABASE_HOST,
  port: process.env.DATABASE_PORT || 5432
}));

```

与自定义配置文件一样，在您的 `registerAs()` 工厂函数内部，`process.env` 对象包含完全解析的环境变量键/值对（已解析和合并了 `.env` 文件和外部定义的变量，如 [Getting started](/application/configuration#入门) 所述）。

> info **提示** `registerAs()` 函数从 `@nestjs/config` 包导出。

像加载自定义配置文件一样，通过 `forRoot()` 方法选项对象的 `load` 属性加载命名空间化配置：

```typescript
import databaseConfig from './config/database.config.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [databaseConfig],
    }),
  ],
})
export class AppModule {}

```

要从 `database` 命名空间获取 `host` 值，请使用点表示法。使用 `'database'` 作为属性名称的前缀。它对应于命名空间名称（作为 `registerAs()` 函数的第一个参数传入）：

```typescript
const dbHost = this.configService.get<string>('database.host');

```

或者，您可以直接注入 `database` 命名空间，这为您提供了强类型：

```typescript
constructor(
  @Inject(databaseConfig.KEY)
  private dbConfig: ConfigType<typeof databaseConfig>,
) {}

```

> info **提示** `ConfigType` 类型从 `@nestjs/config` 包导出。

#### 模块中的命名空间化配置

要在应用程序中的另一个模块中使用命名空间化配置作为配置对象，请使用配置对象的 `.asProvider()` 方法。此方法将您的命名空间化配置转换为一个提供者定义，您可以将其传递给您想要配置的模块的 `forRootAsync()` 方法（或等效方法）：

```typescript
import databaseConfig from './config/database.config.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync(databaseConfig.asProvider()),
  ],
})

```

要了解 `.asProvider()` 方法的工作原理，请查看其返回值：

```typescript
// Return value of the .asProvider() method
{
  imports: [ConfigModule.forFeature(databaseConfig)],
  useFactory: (configuration: ConfigType<typeof databaseConfig>) => configuration,
  inject: [databaseConfig.KEY]
}

```

这种结构允许您将命名空间化配置插入到其他模块中，而无需编写重复的样板代码，从而保持应用程序的组织性和模块化。

#### 缓存环境变量

访问 `process.env` 可能很慢。为了提高存储在 `process.env` 中的变量的 `ConfigService#get` 方法的性能，请设置传递给 `ConfigModule.forRoot()` 的选项对象的 `cache` 属性：

```typescript
ConfigModule.forRoot({
  cache: true,
});

```

#### 部分注册

到目前为止，我们已使用 `forRoot()` 方法在根模块（例如 `AppModule`）中处理配置文件。在更复杂的项目结构中，您可能有特定于功能的配置文件位于多个不同目录中。与其在根模块中加载所有这些文件，不如使用 `@nestjs/config` 包中的一个功能——**部分注册**，它仅引用与每个功能模块相关的配置文件。在功能模块内部使用 `forFeature()` 静态方法执行部分注册，如下所示：

```typescript
import databaseConfig from './config/database.config.js';

@Module({
  imports: [ConfigModule.forFeature(databaseConfig)],
})
export class DatabaseModule {}

```

> warning **警告** 在某些情况下，您可能需要在 `onModuleInit()` 钩子中而不是在构造函数中访问通过部分注册加载的属性。这是因为 `forFeature()` 方法在模块初始化期间运行，而模块初始化的顺序是不确定的。如果您在另一个模块的构造函数中访问以这种方式加载的值，则配置所依赖的模块可能尚未初始化。`onModuleInit()` 方法仅在所有依赖的模块都已初始化后运行，因此此技术是安全的。

#### 模式验证

标准做法是在应用程序启动期间抛出异常，如果未提供所需的环境变量或它们不满足某些验证规则。`@nestjs/config` 包支持两种方式实现此操作：

- 通过 `validationSchema` 选项传递一个 [Standard Schema](https://standardschema.dev/) 兼容的模式。任何实现该规范的库都有效，例如 [Zod](https://zod.dev/)、[Valibot](https://valibot.dev/) 和 [ArkType](https://arktype.io/)。
- 一个自定义的 `validate()` 函数，该函数接收环境变量作为输入。

安装您选择的验证库。此示例使用 Zod：

```bash
$ npm install --save zod

```

现在定义一个验证模式，并通过传递给 `forRoot()` 的选项对象的 `validationSchema` 属性传递它，如下所示：

```typescript title="app.module.ts"
import { z } from 'zod';

@Module({
  imports: [
    ConfigModule.forRoot({
      validationSchema: z.object({
        NODE_ENV: z
          .enum(['development', 'production', 'test', 'provision'])
          .default('development'),
        PORT: z.coerce.number().default(3000),
      }),
    }),
  ],
})
export class AppModule {}

```

此模式为 `NODE_ENV` 和 `PORT` 设置了默认值，如果未在环境中提供这些变量（`.env` 文件或进程环境）则使用这些默认值。如果需要强制要求一个变量，则不设置默认值。验证步骤随后在引导期间抛出异常，如果变量缺失。

环境变量始终以字符串形式到达，这就是 `PORT` 使用 `z.coerce.number()` 的原因。`ConfigService` 提供模式返回的值，因此模式中声明的强制转换和转换应用于您的应用程序读取的配置。模式未声明的变量仍然可以通过 `ConfigService` 访问。

默认情况下，未知的环境变量（`process.env` 始终携带的许多不相关的条目，例如 `PATH` 和 `HOME`）不会触发验证异常，并且会报告每个失败的变量，而不是仅报告第一个。每个验证错误都格式化为 `PATH: message`，并且错误之间用换行符连接。

您可以通过 `validationOptions` 键转发特定于库的选项。由于该选项是针对标准模式规范进行类型化的，特定于库的设置位于 `libraryOptions` 下：

```typescript title="app.module.ts"
import { z } from 'zod';

@Module({
  imports: [
    ConfigModule.forRoot({
      validationSchema: z.object({
        NODE_ENV: z
          .enum(['development', 'production', 'test', 'provision'])
          .default('development'),
        PORT: z.coerce.number().default(3000),
      }),
      validationOptions: {
        libraryOptions: {
          // options specific to your validation library
        },
      },
    }),
  ],
})
export class AppModule {}

```

> info **提示** Joi 仍然受支持，但它需要 **Joi v18 或更高版本**，该版本实现了标准模式规范。像以前一样将 `Joi.object({ ... &#125;)` 传递给 `validationSchema`，并将 Joi 设置（如 `allowUnknown` 和 `abortEarly`）放在 `validationOptions.libraryOptions` 下。对于 Joi 模式，`@nestjs/config` 保留了其历史默认值 `allowUnknown: true` 和 `abortEarly: false`，并在此基础上合并您传入的选项。对于新项目，我们推荐使用 Zod 等现代标准模式库。

> info **提示** 要禁用对预定义环境变量的验证，请在传递给 `forRoot()` 的选项对象中将 `validatePredefined` 属性设置为 `false`。预定义环境变量是模块导入之前设置的进程变量（`process.env` 变量）。例如，如果您使用 `PORT=3000 node main.js` 启动应用程序，则 `PORT` 是一个预定义环境变量。

#### 自定义验证函数

或者，您可以指定一个**同步** `validate` 函数。它接收一个包含环境变量（来自 `.env` 文件和进程）的对象，并返回一个包含已验证环境变量的对象，这样您就可以根据需要转换或修改它们。如果函数抛出错误，应用程序不会启动。

此示例使用了 `class-transformer` 和 `class-validator` 包。首先，定义：

- 一个带有验证约束的类，
- 一个利用 `plainToInstance` 和 `validateSync` 函数的验证函数。

```typescript title="env.validation.ts"
import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNumber, Max, Min, validateSync } from 'class-validator';

enum Environment {
  Development = "development",
  Production = "production",
  Test = "test",
  Provision = "provision",
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsNumber()
  @Min(0)
  @Max(65535)
  PORT: number;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(
    EnvironmentVariables,
    config,
    { enableImplicitConversion: true },
  );
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}

```

设置好后，将 `validate` 函数作为 `ConfigModule` 的配置选项传递：

```typescript title="app.module.ts"
import { validate } from './env.validation.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      validate,
    }),
  ],
})
export class AppModule {}

```

#### 自定义获取器函数

`ConfigService` 定义了一个通用的 `get()` 方法，通过键检索配置值。您也可以添加获取器函数以实现更自然的编码风格：

```typescript title="api-config.service.ts"
@Injectable()
export class ApiConfigService {
  constructor(private configService: ConfigService) {}

  get isAuthEnabled(): boolean {
    return this.configService.get('AUTH_ENABLED') === 'true';
  }
}

```

> info **提示** 此示例假设 `AUTH_ENABLED` 是一个字符串。如果您的验证模式将其转换为布尔值，`get()` 将返回转换后的值，因此请直接返回 `this.configService.get<boolean>('AUTH_ENABLED')` 而不是将其与 `'true'` 进行比较。

现在您可以按如下方式使用获取器函数：

```typescript title="app.service.ts"
@Injectable()
export class AppService {
  constructor(apiConfigService: ApiConfigService) {
    if (apiConfigService.isAuthEnabled) {
      // Authentication is enabled
    }
  }
}

```

#### 环境变量加载钩子

如果模块配置依赖于从 `.env` 文件加载的环境变量，请使用 `ConfigModule.envVariablesLoaded` 钩子，以确保在读取 `process.env` 对象之前文件已加载：

```typescript
export async function getStorageModule() {
  await ConfigModule.envVariablesLoaded;
  return process.env.STORAGE === 'S3' ? S3StorageModule : DefaultStorageModule;
}

```

此构造保证了在 `ConfigModule.envVariablesLoaded` 承诺解析后，所有配置变量都已加载。

#### 条件模块配置

有时您可能希望有条件地加载一个模块，并将条件指定在环境变量中。`@nestjs/config` 包为此提供了 `ConditionalModule`。

```typescript
@Module({
  imports: [
    ConfigModule.forRoot(),
    ConditionalModule.registerWhen(FooModule, 'USE_FOO'),
  ],
})
export class AppModule {}

```

除非 `USE_FOO` 环境变量设置为 `false`（不区分大小写），否则此模块将加载 `FooModule`。如果未定义该变量，则加载 `FooModule`。您也可以传递一个自定义条件：一个接收 `process.env` 引用并返回布尔值的函数：

```typescript
@Module({
  imports: [
    ConfigModule.forRoot(),
    ConditionalModule.registerWhen(
      FooBarModule,
      (env: NodeJS.ProcessEnv) => !!env['foo'] && !!env['bar'],
    ),
  ],
})
export class AppModule {}

```

当您使用 `ConditionalModule` 时，请确保 `ConfigModule` 也已在应用程序中加载，以便 `ConfigModule.envVariablesLoaded` 钩子解析。如果钩子在 5 秒内（或在通过 `registerWhen()` 方法的第三个 `options` 参数的 `timeout` 属性设置的毫秒级超时内）未解析，则 `ConditionalModule` 会抛出错误，Nest 将中止应用程序启动。

#### 可扩展变量

`@nestjs/config` 包支持环境变量扩展。通过此技术，您可以创建嵌套的环境变量，其中一个变量在另一个的定义中被引用。例如：

```json
APP_URL=mywebsite.com
SUPPORT_EMAIL=support@${APP_URL}

```

在此构造中，变量 `SUPPORT_EMAIL` 解析为 `'support@mywebsite.com'`。`${...}` 语法触发在 `SUPPORT_EMAIL` 定义内部解析变量 `APP_URL` 的值。

> info **提示** 对于此功能，`@nestjs/config` 包内部使用 [dotenv-expand](https://github.com/motdotla/dotenv-expand)。

如以下所示，通过传递给 `ConfigModule.forRoot()` 的选项对象的 `expandVariables` 属性启用环境变量扩展。您不使用 `true`，也可以传递一个包含 `dotenv-expand` 选项的对象。

```typescript title="app.module.ts"
@Module({
  imports: [
    ConfigModule.forRoot({
      // ...
      expandVariables: true,
    }),
  ],
})
export class AppModule {}

```

#### 在 `main.ts` 中使用

尽管配置存储在服务中，但您仍然可以在 `main.ts` 文件中使用它，例如读取应用程序端口或 CORS 主机等变量。

要访问它，请使用服务类和 `app.get()` 方法：

```typescript
const configService = app.get(ConfigService);

```

然后您可以像往常一样使用它，通过配置键调用 `get()` 方法：

```typescript
const port = configService.get('PORT');

```