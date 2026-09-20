<!-- 此文件从 content/techniques/configuration.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T08:30:08.189Z -->
<!-- 源文件: content/techniques/configuration.md -->
<!-- 源哈希: 99f324787587cf3f1fb142ce279a1603 -->

### 配置

应用程序通常在不同的**环境**中运行。根据环境的不同，应使用不同的配置设置。例如，通常本地环境依赖于特定的数据库凭据，这些凭据仅对本地数据库实例有效。生产环境将使用一组单独的数据库凭据。由于配置变量会发生变化，最佳实践是将配置变量存储在环境中。

外部定义的环境变量在 Node.js 内部通过 `process.env` 全局对象可见。我们可以尝试通过在每个环境中分别设置环境变量来解决多环境的问题。但这很快就会变得难以管理，尤其是在开发和测试环境中，这些值需要易于模拟和/或更改。

在 Node.js 应用程序中，通常使用 `.env` 文件来表示每个环境，这些文件保存键值对，其中每个键代表一个特定的值。在不同环境中运行应用程序只需替换正确的 `.env` 文件即可。

在 Nest 中使用此技术的一个好方法是创建一个 `ConfigModule`，它暴露一个 `ConfigService`，用于加载适当的 `.env` 文件。虽然您可以选择自己编写这样的模块，但为了方便起见，Nest 提供了 `@nestjs/config` 包。我们将在本章中介绍这个包。

#### 安装

要开始使用它，我们首先安装所需的依赖。

```bash
$ npm i --save @nestjs/config

```

> 信息 **提示** `@nestjs/config` 包内部使用了 `dotenv`。

> 警告 **注意** `@nestjs/config` 需要 TypeScript 4.1 或更高版本。

#### 开始使用

安装过程完成后，我们可以导入 `ConfigModule`。通常，我们会将其导入到根 `AppModule` 中，并使用 `forRoot()` 静态方法控制其行为。在此步骤中，环境变量键值对会被解析和解析。稍后，我们将看到在我们的其他功能模块中访问 `ConfigService` 类的 `ConfigModule` 的几种选项。

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot()],
})
export class AppModule {}

```

上面的代码将从默认位置（项目根目录）加载并解析 `.env` 文件，将 `.env` 文件中的键值对与分配给 `process.env` 的环境变量合并，并将结果存储在您可以通过 `ConfigService` 访问的私有结构中。`forRoot()` 方法注册了 `ConfigService` 提供者，它提供了一个 `get()` 方法来读取这些解析/合并后的配置变量。由于 `@nestjs/config` 依赖于 `dotenv`，它使用该包的规则来解决环境变量名称的冲突。当一个键同时存在于运行时环境中作为环境变量（例如，通过 OS shell 导出，如 `export DATABASE_USER=...`）和 `.env` 文件中时，运行时环境变量优先。

一个示例 `.env` 文件看起来像这样：

```typescript
DATABASE_USER=test
DATABASE_PASSWORD=test

```

如果您需要在 `ConfigModule` 加载和 Nest 应用程序引导之前就使某些环境变量可用（例如，将微服务配置传递给 `createMicroservice()` 方法），您可以使用 Nest CLI 的 `--env-file` 选项。此选项允许您指定应在应用程序启动前加载的 `.env` 文件的路径。`--env-file` 标志支持自 Node v20 引入，有关更多详细信息，请参阅 [Node.js 文档](https://nodejs.org/api/cli.html#--env-fileconfig)。

```bash
$ nest start --env-file=.env

```

#### 自定义 env 文件路径

默认情况下，包会在应用程序的根目录中查找 `.env` 文件。要为 `.env` 文件指定其他路径，请设置传递给 `forRoot()` 的（可选）选项对象的 `envFilePath` 属性，如下所示：

```typescript
ConfigModule.forRoot({
  envFilePath: '.development.env',
});

```

您也可以像这样为 `.env` 文件指定多个路径：

```typescript
ConfigModule.forRoot({
  envFilePath: ['.env.development.local', '.env.development'],
});

```

如果在多个文件中找到一个变量，则第一个文件优先。

#### 禁用环境变量加载

如果您不想加载 `.env` 文件，而只想从运行时环境访问环境变量（例如，通过 OS shell 导出，如 `export DATABASE_USER=...`），请将选项对象的 `ignoreEnvFile` 属性设置为 `true`，如下所示：

```typescript
ConfigModule.forRoot({
  ignoreEnvFile: true,
});

```

#### 全局使用模块

当您想在其他模块中使用 `ConfigModule` 时，您需要导入它（这与任何 Nest 模块的标准做法相同）。或者，通过将选项对象的 `isGlobal` 属性设置为 `true`，将其声明为全局模块，如下所示。在这种情况下，一旦在根模块（例如，`AppModule`）中加载了 `ConfigModule`，您就不需要再在其他模块中导入它。

```typescript
ConfigModule.forRoot({
  isGlobal: true,
});

```

#### 自定义配置文件

对于更复杂的项目，您可以使用自定义配置文件来返回嵌套的配置对象。这允许您按功能对相关的配置设置进行分组（例如，与数据库相关的设置），并将相关设置存储在单独的文件中以帮助独立管理它们。

自定义配置文件导出一个工厂函数，该函数返回一个配置对象。配置对象可以是任意嵌套的普通 JavaScript 对象。`process.env` 对象将包含完全解析的环境变量键值对（`.env` 文件和外部定义的变量已按照上述方式解析和合并）。由于您控制返回的配置对象，您可以添加任何所需的逻辑来将值转换为适当的类型、设置默认值等。例如：

```typescript
// config/configuration.ts
export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  database: {
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT, 10) || 5432,
  },
});

```

我们使用传递给 `forRoot()` 方法的选项对象的 `load` 属性来加载此文件：

```typescript
// app.module.ts
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
    }),
  ],
})
export class AppModule {}

```

> 信息 **注意** 分配给 `load` 属性的值是一个数组，允许您加载多个配置文件（例如，`load: [databaseConfig, authConfig]`）。

使用自定义配置文件，我们还可以管理自定义文件，例如 YAML 文件。以下是一个使用 YAML 格式的配置示例：

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

要读取和解析 YAML 文件，我们可以利用 `js-yaml` 包。

```bash
$ npm i js-yaml
$ npm i -D @types/js-yaml

```

安装该包后，我们使用 `yaml#load` 函数来加载我们刚刚创建的 YAML 文件。

```typescript title="config/configuration.ts"
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

const YAML_CONFIG_FILENAME = 'config.yaml';

export default () => {
  return yaml.load(
    readFileSync(join(import.meta.dirname, YAML_CONFIG_FILENAME), 'utf8'),
  ) as Record<string, any>;
};

```

> 警告 **注意** 在构建过程中，Nest CLI 不会自动将您的"资源文件"（非 TS 文件）移动到 `dist` 文件夹。为了确保您的 YAML 文件被复制，您必须在 `nest-cli.json` 文件的 `compilerOptions#资源` 对象中指定这一点。例如，如果 `config` 文件夹与 `src` 文件夹在同一级别，请添加值为 `"assets": [{"include": "../config/*.yaml", "outDir": "./dist/config"}]` 的 `compilerOptions#资源`。了解更多 [here](/cli/workspaces#资源)。

需要提醒的是，即使您在 NestJS 的 `ConfigModule` 中使用了 `validationSchema` 选项，配置文件也不会自动进行验证。如果您需要验证或想要应用任何转换，您必须在工厂函数中处理，因为在那里您可以完全控制配置对象。这允许您根据需要实现任何自定义验证逻辑。

例如，如果您想确保端口在特定范围内，可以在工厂函数中添加验证步骤：

```typescript title="config/configuration.ts"
export default () => {
  const config = yaml.load(
    readFileSync(join(import.meta.dirname, YAML_CONFIG_FILENAME), 'utf8'),
  ) as Record<string, any>;

  if (config.http.port < 1024 || config.http.port > 49151) {
    throw new Error('HTTP port must be between 1024 and 49151');
  }

  return config;
};

```

现在，如果端口超出指定范围，应用程序将在启动期间抛出错误。

<app-banner-devtools></app-banner-devtools>

#### 使用 `ConfigService`

要从我们的 `ConfigService` 中访问配置值，我们首先需要注入 `ConfigService`。与任何提供者一样，我们需要将其包含的模块——即 `ConfigModule`——导入到将要使用它的模块中（除非您在传递给 `ConfigModule.forRoot()` 方法的选项对象中设置了 `isGlobal` 属性为 `true`）。如下所示将其导入到功能模块中。

```typescript title="feature.module.ts"
@Module({
  imports: [ConfigModule],
  // ...
})

```

然后我们可以使用标准的构造函数注入来注入它：

```typescript
constructor(private configService: ConfigService) {}

```

> 信息 **提示** `ConfigService` 从 `@nestjs/config` 包中导入。

并在我们的类中使用它：

```typescript
// get an environment variable
const dbUser = this.configService.get<string>('DATABASE_USER');

// get a custom configuration value
const dbHost = this.configService.get<string>('database.host');

```

如上所示，使用 `configService.get()` 方法通过传递变量名来获取简单的环境变量。您可以通过传递类型来进行 TypeScript 类型提示，如上所示（例如，`get<string>(...)`）。`get()` 方法还可以遍历嵌套的自定义配置对象（通过 <a href="techniques/configuration#自定义配置文件">自定义配置文件</a> 创建），如上面的第二个示例所示。

您还可以使用接口作为类型提示来获取整个嵌套的自定义配置对象：

```typescript
interface DatabaseConfig {
  host: string;
  port: number;
}

const dbConfig = this.configService.get<DatabaseConfig>('database');

// you can now use `dbConfig.port` and `dbConfig.host`
const port = dbConfig.port;

```

`get()` 方法还接受一个可选的第二个参数来定义默认值，当键不存在时将返回该默认值，如下所示：

```typescript
// use "localhost" when "database.host" is not defined
const dbHost = this.configService.get<string>('database.host', 'localhost');

```

`ConfigService` 有两个可选的泛型（类型参数）。第一个用于帮助防止访问不存在的配置属性。如下所示使用它：

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

当 `infer` 属性设置为 `true` 时，`ConfigService#get` 方法将根据接口自动推断属性类型，因此例如，`typeof port === "number"`（如果您没有使用 TypeScript 的 `strictNullChecks` 标志），因为 `PORT` 在 `EnvironmentVariables` 接口中具有 `number` 类型。

此外，借助 `infer` 功能，即使使用点表示法，您也可以推断嵌套自定义配置对象属性的类型，如下所示：

```typescript
constructor(private configService: ConfigService<{ database: { host: string } }>) {
  const dbHost = this.configService.get('database.host', { infer: true })!;
  // typeof dbHost === "string"                                          |
  //                                                                     +--> non-null assertion operator
}

```

第二个泛型依赖于第一个泛型，充当类型断言，以消除当 `strictNullChecks` 开启时 `ConfigService` 的方法可能返回的所有 `undefined` 类型。例如：

```typescript
// ...
constructor(private configService: ConfigService<{ PORT: number }, true>) {
  //                                                               ^^^^
  const port = this.configService.get('PORT', { infer: true });
  //    ^^^ The type of port will be 'number' thus you don't need TS type assertions anymore
}

```

> 信息 **提示** 为了确保 `ConfigService#get` 方法仅从自定义配置文件中检索值并忽略 `process.env` 变量，请在 `ConfigModule` 的 `forRoot()` 方法的选项对象中将 `skipProcessEnv` 选项设置为 `true`。

#### 配置命名空间

`ConfigModule` 允许您定义和加载多个自定义配置文件，如上面的 <a href="techniques/configuration#自定义配置文件">自定义配置文件</a> 所示。您可以使用该部分中所示的嵌套配置对象来管理复杂的配置对象层次结构。或者，您可以使用 `registerAs()` 函数返回一个"命名空间化的"配置对象，如下所示：

```typescript title="config/database.config.ts"
export default registerAs('database', () => ({
  host: process.env.DATABASE_HOST,
  port: process.env.DATABASE_PORT || 5432
}));

```

与自定义配置文件一样，在您的 `registerAs()` 工厂函数内部，`process.env` 对象将包含完全解析的环境变量键/值对（其中 `.env` 文件和外部定义的变量已按照 <a href="techniques/configuration#入门">上述</a> 描述的方式解析和合并）。

> 信息 **提示** `registerAs` 函数从 `@nestjs/config` 包中导出。

使用 `forRoot()` 方法的选项对象的 `load` 属性加载命名空间配置，方式与加载自定义配置文件相同：

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

现在，要从 `database` 命名空间获取 `host` 值，请使用点表示法。使用 `'database'` 作为属性名称的前缀，对应于命名空间的名称（作为第一个参数传递给 `registerAs()` 函数）：

```typescript
const dbHost = this.configService.get<string>('database.host');

```

一个合理的替代方案是直接注入 `database` 命名空间。这使我们能够受益于强类型：

```typescript
constructor(
  @Inject(databaseConfig.KEY)
  private dbConfig: ConfigType<typeof databaseConfig>,
) {}

```

> 信息 **提示** `ConfigType` 从 `@nestjs/config` 包中导出。

#### 模块中的命名空间配置

要将命名空间配置用作应用程序中另一个模块的配置对象，您可以利用配置对象的 `.asProvider()` 方法。此方法将您的命名空间配置转换为提供者，然后可以将其传递给您要使用的模块的 `forRootAsync()`（或任何等效方法）。

```typescript
import databaseConfig from './config/database.config.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync(databaseConfig.asProvider()),
  ],
})

```

为了理解 `.asProvider()` 方法的功能，让我们检查其返回值：

```typescript
// Return value of the .asProvider() method
{
  imports: [ConfigModule.forFeature(databaseConfig)],
  useFactory: (configuration: ConfigType<typeof databaseConfig>) => configuration,
  inject: [databaseConfig.KEY]
}

```

这种结构允许您将命名空间配置无缝集成到模块中，确保应用程序保持组织化和模块化，而无需编写样板式、重复的代码。

#### 缓存环境变量

由于访问 `process.env` 可能较慢，您可以设置传递给 `ConfigModule.forRoot()` 的选项对象的 `cache` 属性，以提高 `ConfigService#get` 方法在访问存储在 `process.env` 中的变量时的性能。

```typescript
ConfigModule.forRoot({
  cache: true,
});

```

#### 部分注册

到目前为止，我们已经在根模块（例如 `AppModule`）中使用 `forRoot()` 方法处理配置文件。也许您有更复杂的项目结构，特定功能的配置文件位于多个不同的目录中。与其在根模块中加载所有这些文件，`@nestjs/config` 包提供了一个称为 **部分注册** 的功能，它仅引用与每个功能模块关联的配置文件。在功能模块中使用 `forFeature()` 静态方法执行此部分注册，如下所示：

```typescript
import databaseConfig from './config/database.config.js';

@Module({
  imports: [ConfigModule.forFeature(databaseConfig)],
})
export class DatabaseModule {}

```

> warning **警告** 在某些情况下，您可能需要使用 `onModuleInit()` 钩子而不是在构造函数中访问通过部分注册加载的属性。这是因为 `forFeature()` 方法在模块初始化期间运行，而模块初始化的顺序是不确定的。如果您在构造函数中访问由另一个模块以这种方式加载的值，则配置所依赖的模块可能尚未初始化。`onModuleInit()` 方法仅在所有其依赖的模块初始化之后运行，因此这种技术是安全的。

#### 模式验证

如果必需的环境变量未提供或不符合某些验证规则，则在应用程序启动期间抛出异常是标准做法。`@nestjs/config` 包提供了两种不同的方式来实现这一点：

- 通过 `validationSchema` 选项传递的 [Standard Schema](https://standardschema.dev/) 兼容模式。任何实现该规范的库都可以使用 - [Zod](https://zod.dev/)、[Valibot](https://valibot.dev/)、[ArkType](https://arktype.io/) 等。
- 一个自定义的 `validate()` 函数，以环境变量作为输入。

安装您选择的验证库。这里我们将使用 Zod：

```bash
$ npm install --save zod

```

现在我们可以定义一个验证模式，并通过 `forRoot()` 方法的选项对象的 `validationSchema` 属性传递它，如下所示：

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

在这里，我们为 `NODE_ENV` 和 `PORT` 设置默认值，如果我们在环境（`.env` 文件或进程环境）中未提供这些变量，将使用这些默认值。若要改为必需变量，则不要设置默认值 - 如果缺失，验证步骤将在引导期间抛出异常。

请注意，环境变量始终以字符串形式到达，这就是为什么上面的 `PORT` 使用 `z.coerce.number()`。模式返回的值就是 `ConfigService` 最终提供的值，因此模式中声明的强制转换和转换将应用于应用程序读取的配置。

默认情况下，未知的环境变量 - `process.env` 始终携带的许多无关条目，例如 `PATH` 和 `HOME` - 不会触发验证异常，并且每个失败的变量都会被报告，而不仅仅是第一个。验证错误格式化为 `PATH: message` 并用换行符连接。

您可以通过 `validationOptions` 键转发特定于库的选项。由于该选项是根据 Standard Schema 规范进行类型化的，因此特定于库的设置位于 `libraryOptions` 下：

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

> info **提示** 使用 Joi？它仍然受支持，但您必须使用 **Joi v18 或更高版本**，该版本实现了 Standard Schema 规范。像以前一样将 `Joi.object({ ... &#125;)` 传递给 `validationSchema`，并将 Joi 设置（如 `allowUnknown` 和 `abortEarly`）放在 `validationOptions.libraryOptions` 下。对于 Joi 模式，`@nestjs/config` 保持其历史默认值 `allowUnknown: true` 和 `abortEarly: false`，并将您传递的任何内容合并到它们之上。对于新项目，我们建议使用现代的 Standard Schema 库，例如 Zod。

> info **提示** 要禁用对预定义环境变量的验证，请在 `forRoot()` 方法的选项对象中将 `validatePredefined` 属性设置为 `false`。预定义环境变量是在导入模块之前设置的进程变量（`process.env` 变量）。例如，如果您使用 `PORT=3000 node main.js` 启动应用程序，则 `PORT` 是一个预定义的环境变量。

#### 自定义验证函数

或者，您可以指定一个 **同步** 的 `validate` 函数，该函数接受包含环境变量（来自 env 文件和进程）的对象，并返回包含已验证环境变量的对象，以便您可以根据需要转换/修改它们。如果该函数抛出错误，它将阻止应用程序引导。

在此示例中，我们将使用 `class-transformer` 和 `class-validator` 包。首先，我们必须定义：

- 一个带有验证约束的类，
- 一个使用 `plainToInstance` 和 `validateSync` 函数的验证函数。

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

有了这些，使用 `validate` 函数作为 `ConfigModule` 的配置选项，如下所示：

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

#### 自定义 getter 函数

`ConfigService` 定义了一个通用的 `get()` 方法来按键检索配置值。我们还可以添加 `getter` 函数，以实现更自然的编码风格：

```typescript
@Injectable()
export class ApiConfigService {
  constructor(private configService: ConfigService) {}

  get isAuthEnabled(): boolean {
    return this.configService.get('AUTH_ENABLED') === 'true';
  }
}

```

现在我们可以如下使用 getter 函数：

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

如果模块配置依赖于环境变量，并且这些变量是从 `.env` 文件加载的，您可以使用 `ConfigModule.envVariablesLoaded` 钩子来确保在与 `process.env` 对象交互之前文件已加载，请参见以下示例：

```typescript
export async function getStorageModule() {
  await ConfigModule.envVariablesLoaded;
  return process.env.STORAGE === 'S3' ? S3StorageModule : DefaultStorageModule;
}

```

这种构造保证了在 `ConfigModule.envVariablesLoaded` Promise 解析后，所有配置变量都已加载。

#### 条件模块配置

有时您可能希望有条件地加载模块并在环境变量中指定条件。幸运的是，`@nestjs/config` 提供了一个 `ConditionalModule`，允许您做到这一点。

```typescript
@Module({
  imports: [
    ConfigModule.forRoot(),
    ConditionalModule.registerWhen(FooModule, 'USE_FOO'),
  ],
})
export class AppModule {}

```

上述模块只有在 `.env` 文件中没有为环境变量 `USE_FOO` 设置 `false` 值时，才会在 `FooModule` 中加载。您也可以自己传递自定义条件，一个接收 `process.env` 引用的函数，该函数应为 `ConditionalModule` 返回一个布尔值以处理：

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

重要的是要确保在使用 `ConditionalModule` 时，应用程序中也加载了 `ConfigModule`，以便正确引用和利用 `ConfigModule.envVariablesLoaded` 钩子。如果钩子在 5 秒内未翻转为 true，或者用户在第 `registerWhen` 方法的第三个选项参数中设置的超时时间（以毫秒为单位）内未翻转为 true，那么 `ConditionalModule` 将抛出错误，Nest 将中止启动应用程序。

#### 可扩展变量

`@nestjs/config` 包支持环境变量扩展。使用此技术，您可以创建嵌套的环境变量，其中一个变量在另一个变量的定义中被引用。例如：

```json
APP_URL=mywebsite.com
SUPPORT_EMAIL=support@${APP_URL}

```

使用这种构造，变量 `SUPPORT_EMAIL` 解析为 `'support@mywebsite.com'`。请注意使用 `${...}` 语法来触发在 `SUPPORT_EMAIL` 的定义中解析变量 `APP_URL` 的值。

> info **提示** 对于此功能，`@nestjs/config` 包内部使用 [dotenv-expand](https://github.com/motdotla/dotenv-expand)。

使用传递给 `ConfigModule` 的 `forRoot()` 方法的选项对象中的 `expandVariables` 属性来启用环境变量扩展，如下所示：

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

虽然我们的配置存储在服务中，但它仍然可以在 `main.ts` 文件中使用。这样，您可以使用它来存储诸如应用程序端口或 CORS 主机之类的变量。

要访问它，您必须使用 `app.get()` 方法，后跟服务引用：

```typescript
const configService = app.get(ConfigService);

```

然后您可以像往常一样使用它，通过调用带有配置键的 `get` 方法：

```typescript
const port = configService.get('PORT');

```