<!-- 此文件从 content/application/configuration.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T09:00:41.897Z -->
<!-- 源文件: content/application/configuration.md -->
<!-- 源哈希: c67c3a1090b2af5b85cb5c081152a889 -->

### 配置

应用程序通常运行在不同的**环境**中，而每个环境都需要各自的配置设置。例如，本地环境通常依赖于仅对本地数据库实例有效的数据库凭据，而生产环境则使用另一组凭据。由于配置变量会随环境变化，最佳实践是将它们[store configuration variables](https://12factor.net/config)在环境中。

外部定义的环境变量在 Node.js 内部可以通过 `process.env` 全局对象访问。你可以通过在各个环境中分别设置环境变量来处理多环境。但这种方式很快就会变得难以管理，尤其是在开发和测试环境中，因为这些值需要易于模拟或修改。

在 Node.js 应用程序中，通常用一个保存键值对的 `.env` 文件来表示每个环境。这样，要在不同的环境中运行应用，只需替换为正确的 `.env` 文件即可。

在 Nest 中应用这一技术的一个好方法是创建一个 `ConfigModule`，它暴露一个 `ConfigService`，用于加载相应的 `.env` 文件。你可以自己编写这样的模块，但为了方便，Nest 提供了 `@nestjs/config` 包。本章将介绍该包。

#### 安装

首先，安装所需的依赖：

```bash
$ npm i --save @nestjs/config

```

> info **提示** `@nestjs/config` 包内部使用了 [dotenv](https://github.com/motdotla/dotenv)。

> warning **注意** `@nestjs/config` 需要 TypeScript 4.1 或更高版本。

#### 快速上手

安装完成后，导入 `ConfigModule`。通常你会将它导入到根 `AppModule` 中，并通过 `.forRoot()` 静态方法控制其行为。在这一步中，环境变量的键/值对会被解析和解析。稍后，你将看到在其他功能模块中访问 `ConfigModule` 的 `ConfigService` 类的几种方式。

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot()],
})
export class AppModule {}

```

这段代码从默认位置（进程启动时所在的目录，通常是项目根目录）加载并解析 `.env` 文件，将 `.env` 文件中的键/值对与赋值给 `process.env` 的环境变量合并，并将结果存储在一个私有结构中，你可以通过 `ConfigService` 访问它。`forRoot()` 方法会注册 `ConfigService` 提供者，该提供者提供一个 `get()` 方法，用于读取这些已解析并合并的配置变量。由于 `@nestjs/config` 依赖于 [dotenv](https://github.com/motdotla/dotenv)，因此它使用该包的规则来解决环境变量名称冲突。当某个键同时存在于运行时环境（例如通过 shell 导出设置的 `export DATABASE_USER=test`）和 `.env` 文件中时，运行时环境变量优先。若要让 `.env` 文件中的值优先，请将 `override` 选项设置为 `true`。

一个示例 `.env` 文件如下所示：

```json
DATABASE_USER=test
DATABASE_PASSWORD=test

```

如果你需要在加载 `ConfigModule` 并引导 Nest 应用程序之前就使用某些环境变量（例如，将微服务配置传递给 `NestFactory#createMicroservice()` 方法），请使用 Nest CLI 的 `--env-file` 选项。它指定了在应用程序启动前要加载的 `.env` 文件的路径。CLI 会将该文件传递给 Node.js 的 `--env-file` 标志；详情请参阅 [Node.js documentation](https://nodejs.org/dist/v20.18.1/docs/api/cli.html#--env-fileconfig)。

```bash
$ nest start --env-file .env

```

#### 自定义 env 文件路径

默认情况下，该包会在当前工作目录（通常是应用程序的根目录）中查找 `.env` 文件。若要为 `.env` 文件指定其他路径，请设置传递给 `forRoot()` 的可选选项对象的 `envFilePath` 属性，如下所示：

```typescript
ConfigModule.forRoot({
  envFilePath: '.development.env',
});

```

你也可以为 `.env` 文件指定多个路径：

```typescript
ConfigModule.forRoot({
  envFilePath: ['.env.development.local', '.env.development'],
});

```

如果某个变量在多个文件中都存在，则以第一个为准。

#### 禁用环境变量加载

如果你不想加载 `.env` 文件，而只想访问运行时环境中的环境变量（例如通过 shell 导出设置的 `export DATABASE_USER=test`），请将选项对象的 `ignoreEnvFile` 属性设置为 `true`：

```typescript
ConfigModule.forRoot({
  ignoreEnvFile: true,
});

```

#### 全局使用模块

要在其他模块中使用 `ConfigModule`，你需要导入它（与任何 Nest 模块一样）。或者，通过将选项对象的 `isGlobal` 属性设置为 `true`，将其声明为 [global module](/modules#全局模块)，如下所示。在这种情况下，一旦在根模块（例如 `AppModule`）中加载了 `ConfigModule`，你就不需要在其他模块中导入它了。

```typescript
ConfigModule.forRoot({
  isGlobal: true,
});

```

#### 自定义配置文件

对于更复杂的项目，你可以使用返回嵌套配置对象的自定义配置文件。这样，你就可以按功能对相关的配置设置进行分组（例如，与数据库相关的设置），并将它们存储在单独的文件中，从而可以独立管理它们。

自定义配置文件导出一个返回配置对象的工厂函数。配置对象可以是任意嵌套的普通 JavaScript 对象。在工厂函数内部，`process.env` 对象包含完全解析后的环境变量键/值对（其中 `.env` 文件和外部定义的变量已按 [Getting started](/application/configuration#入门) 中所述进行解析和合并）。由于返回的配置对象由你控制，你可以添加任何所需的逻辑来将值转换为适当的类型、设置默认值等等。例如：

```typescript title="config/configuration.ts"
export default () => ({
  port: parseInt(process.env.PORT ?? '', 10) || 3000,
  database: {
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT ?? '', 10) || 5432
  }
});

```

通过传递给 `ConfigModule.forRoot()` 方法的选项对象的 `load` 属性来加载该文件：

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

> info **提示** 赋值给 `load` 属性的值是一个数组，因此你可以加载多个配置文件（例如 `load: [databaseConfig, authConfig]`）。

自定义配置文件还允许你从其他格式加载配置，例如 YAML。下面是一个 YAML 格式配置的示例：

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

要读取和解析 YAML 文件，你可以使用 `js-yaml` 包：

```bash
$ npm i js-yaml
$ npm i -D @types/js-yaml

```

安装该包后，使用 `yaml#load` 函数来加载上面创建的 YAML 文件：

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

> warning **注意** Nest CLI 在构建过程中不会自动将你的 "assets"（非 TS 文件）复制到 `dist` 文件夹。为了确保你的 YAML 文件被复制，请在 `nest-cli.json` 文件的 `compilerOptions#资源` 对象中指定它们。例如，如果 `config` 文件夹与 `src` 文件夹处于同一层级，则添加 `compilerOptions#资源`，其值为 `"assets": [{"include": "../config/*.yaml", "outDir": "./dist/config"}]`。详情请参阅 [Assets](/cli/workspaces#资源)。

配置文件不会自动进行验证，即使你使用了 `ConfigModule` 的 `validationSchema` 选项（它仅适用于环境变量）。如果你需要验证或想要应用转换，请在工厂函数中处理，在那里你可以完全控制配置对象。

例如，要确保端口处于某个范围内，请在工厂函数中添加一个验证步骤：

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

<app-banner-observe></app-banner-observe>

#### 使用 `ConfigService`

要访问配置值，首先注入 `ConfigService`。与任何提供者一样，你需要将包含它的模块（即 `ConfigModule`）导入到使用它的模块中（除非你将传递给 `ConfigModule.forRoot()` 的选项对象的 `isGlobal` 属性设置为 `true`）。如下所示，将其导入到功能模块中：

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

> info **提示** 从 `@nestjs/config` 包中导入 `ConfigService`。

然后在你的类中使用它：

```typescript
// get an environment variable
const dbUser = this.configService.get<string>('DATABASE_USER');

// get a custom configuration value
const dbHost = this.configService.get<string>('database.host');

```

如上所示，使用 `configService.get()` 方法，通过传入变量名来获取一个简单的环境变量。你可以传入一个类型参数作为 TypeScript 类型提示（例如 `get<string>(...)`）。`get()` 方法还可以遍历嵌套的自定义配置对象（使用 [custom configuration file](/application/configuration#自定义配置文件) 创建），如第二个示例所示。

你还可以使用接口作为类型提示来获取整个嵌套的自定义配置对象：

```typescript
interface DatabaseConfig {
  host: string;
  port: number;
}

const dbConfig = this.configService.get<DatabaseConfig>('database');

// you can now use `dbConfig.port` and `dbConfig.host`
const port = dbConfig.port;

```

`get()` 方法还接受一个可选的第二个参数，用于定义默认值，当键不存在时返回该值：

```typescript
// use "localhost" when "database.host" is not defined
const dbHost = this.configService.get<string>('database.host', 'localhost');

```

如果某个值是必需的，请改用 `getOrThrow()` 方法。它接受与 `get()` 相同的参数，但如果解析出的值为 `undefined`，则会抛出错误，并且其返回类型排除了 `undefined`：

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

将 `infer` 属性设置为 `true` 后，`ConfigService#get` 方法会从接口推断属性类型。例如，`port` 的类型为 `number`，因为 `PORT` 在 `EnvironmentVariables` 接口中具有 `number` 类型（在启用 `strictNullChecks` 编译器选项的情况下，类型为 `number | undefined`）。

借助 `infer` 特性，你还可以推断嵌套自定义配置对象属性的类型，即使使用点表示法也可以：

```typescript
constructor(private configService: ConfigService<{ database: { host: string } }>) {
  const dbHost = this.configService.get('database.host', { infer: true })!;
  // typeof dbHost === "string"                                          |
  //                                                                     +--> non-null assertion operator
}

```

第二个泛型依赖于第一个泛型。它充当类型断言，用于移除当启用 `strictNullChecks` 时 `ConfigService` 方法可能返回的 `undefined` 类型。例如：

```typescript
// ...
constructor(private configService: ConfigService<{ PORT: number }, true>) {
  //                                                               ^^^^
  const port = this.configService.get('PORT', { infer: true });
  //    ^^^ The type of port is 'number', so you don't need TS type assertions
}

```

> info **提示** 要让 `ConfigService#get` 方法忽略 `process.env` 变量，仅从自定义配置文件（以及经过验证的环境变量，如果你使用了验证）中检索值，请在传递给 `ConfigModule.forRoot()` 的选项对象中将 `skipProcessEnv` 选项设置为 `true`。

#### 配置命名空间

`ConfigModule` 允许你定义并加载多个自定义配置文件，如上面的 [Custom configuration files](/application/configuration#自定义配置文件) 所示。你可以使用嵌套的配置对象来管理复杂的配置层次结构，如该节所示。或者，你可以使用 `registerAs()` 函数返回一个 "命名空间化" 的配置对象，如下所示：

```typescript title="config/database.config.ts"
export default registerAs('database', () => ({
  host: process.env.DATABASE_HOST,
  port: process.env.DATABASE_PORT || 5432
}));

```

与自定义配置文件一样，在你的 `registerAs()` 工厂函数内部，`process.env` 对象包含完全解析后的环境变量键/值对（其中 `.env` 文件和外部定义的变量已按 [Getting started](/application/configuration#入门) 中所述进行解析和合并）。

> info **提示** `registerAs()` 函数从 `@nestjs/config` 包中导出。

使用 `forRoot()` 方法选项对象的 `load` 属性来加载命名空间配置，其方式与你加载自定义配置文件相同：

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

要从 `database` 命名空间中获取 `host` 值，请使用点表示法。使用 `'database'` 作为属性名的前缀。它对应于命名空间的名称（作为第一个参数传递给 `registerAs()` 函数）：

```typescript
const dbHost = this.configService.get<string>('database.host');

```

或者，你可以直接注入 `database` 命名空间，这样可以获得强类型：

```typescript
constructor(
  @Inject(databaseConfig.KEY)
  private dbConfig: ConfigType<typeof databaseConfig>,
) {}

```

> info **提示** `ConfigType` 类型从 `@nestjs/config` 包中导出。

#### 模块中的命名空间配置

要将命名空间配置用作应用程序中另一个模块的配置对象，请使用配置对象的 `.asProvider()` 方法。该方法会将你的命名空间配置转换为一个提供者定义，你可以将其传递给要配置的模块的 `forRootAsync()` 方法（或等效方法）：

```typescript
import databaseConfig from './config/database.config.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync(databaseConfig.asProvider()),
  ],
})

```

要理解 `.asProvider()` 方法的工作原理，请查看其返回值：

```typescript
// Return value of the .asProvider() method
{
  imports: [ConfigModule.forFeature(databaseConfig)],
  useFactory: (configuration: ConfigType<typeof databaseConfig>) => configuration,
  inject: [databaseConfig.KEY]
}

```

这种结构让你可以将命名空间配置插入到其他模块中，而无需编写重复的样板代码，从而使应用程序保持组织良好且模块化。

#### 缓存环境变量

访问 `process.env` 可能会很慢。为了提升 `ConfigService#get` 方法对存储在 `process.env` 中的变量的性能，请设置传递给 `ConfigModule.forRoot()` 的选项对象的 `cache` 属性：

```typescript
ConfigModule.forRoot({
  cache: true,
});

```

#### 部分注册

到目前为止，我们都是在根模块（例如 `AppModule`）中使用 `forRoot()` 方法来处理配置文件的。在更复杂的项目结构中，你可能会有位于多个不同目录中的、针对特定功能的配置文件。与其在根模块中加载所有这些文件，你可以使用 `@nestjs/config` 包中一个名为**部分注册**的特性，它只引用与各个功能模块相关联的配置文件。在功能模块中使用 `forFeature()` 静态方法来执行部分注册，如下所示：

```typescript
import databaseConfig from './config/database.config.js';

@Module({
  imports: [ConfigModule.forFeature(databaseConfig)],
})
export class DatabaseModule {}

```

> warning **警告** 在某些情况下，你可能需要在 `onModuleInit()` 钩子中而不是在构造函数中访问通过部分注册加载的属性。这是因为 `forFeature()` 方法在模块初始化期间运行，而模块初始化的顺序是不确定的。如果你在构造函数中访问由另一个模块以这种方式加载的值，那么该配置所依赖的模块可能尚未初始化。`onModuleInit()` 方法仅在其依赖的所有模块都已初始化之后才会运行，因此这种技术是安全的。

#### 模式验证

如果必需的环境变量未提供或不符合某些验证规则，在应用程序启动期间抛出异常是一种标准做法。`@nestjs/config` 包支持两种方式来实现这一点：

- 通过 `validationSchema` 选项传入的、兼容 [Standard Schema](https://standardschema.dev/) 的模式。任何实现了该规范的库都可以使用，例如 [Zod](https://zod.dev/)、[Valibot](https://valibot.dev/) 和 [ArkType](https://arktype.io/)。
- 一个自定义的 `validate()` 函数，它接收环境变量作为输入。

安装你选择的验证库。本示例使用 Zod：

```bash
$ npm install --save zod

```

现在定义一个验证模式，并通过传递给 `forRoot()` 的选项对象的 `validationSchema` 属性传入它，如下所示：

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

该模式为 `NODE_ENV` 和 `PORT` 设置了默认值，如果你没有在环境（`.env` 文件或进程环境）中提供这些变量，就会使用这些默认值。若要改为要求某个变量必须提供，则不要为它设置默认值。这样，如果该变量缺失，验证步骤会在启动引导期间抛出异常。

环境变量总是以字符串形式传入，这就是 `PORT` 使用 `z.coerce.number()` 的原因。`ConfigService` 提供模式返回的值，因此模式中声明的强制转换和变换会应用于你的应用程序所读取的配置。模式未声明的变量仍然可以通过 `ConfigService` 获取。

默认情况下，未知的环境变量（`process.env` 总是携带的许多不相关的条目，例如 `PATH` 和 `HOME`）不会触发验证异常，并且会报告每一个验证失败的变量，而不仅仅是第一个。每个验证错误都被格式化为 `PATH: message`，错误之间以换行符连接。

你可以通过 `validationOptions` 键转发特定于库的选项。由于该选项是根据 Standard Schema 规范进行类型定义的，因此特定于库的设置放在 `libraryOptions` 下：

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

> info **提示** 仍然支持 Joi，但它需要 **Joi v18 或更高版本**，该版本实现了 Standard Schema 规范。像以前一样将 `Joi.object({ ... &#125;)` 传递给 `validationSchema`，并将诸如 `allowUnknown` 和 `abortEarly` 之类的 Joi 设置放在 `validationOptions.libraryOptions` 下。对于 Joi 模式，`@nestjs/config` 保留其历史默认值 `allowUnknown: true` 和 `abortEarly: false`，并在其之上合并你传入的选项。对于新项目，我们建议改用现代的 Standard Schema 库，例如 Zod。

> info **提示** 要禁用对预定义环境变量的验证，请在传递给 `forRoot()` 的选项对象中将 `validatePredefined` 属性设置为 `false`。预定义环境变量是在模块被导入之前就已设置的进程变量（`process.env` 变量）。例如，如果你使用 `PORT=3000 node main.js` 启动应用程序，那么 `PORT` 就是一个预定义环境变量。

#### 自定义 validate 函数

或者，你可以指定一个**同步的** `validate` 函数。它接收一个包含环境变量（来自 `.env` 文件和进程）的对象，并返回一个包含经过验证的环境变量的对象，因此你可以在需要时转换或修改它们。如果该函数抛出错误，应用程序将不会启动引导。

本示例使用 `class-transformer` 和 `class-validator` 包。首先，定义：

- 一个带有验证约束的类，
- 一个使用了 `plainToInstance` 和 `validateSync` 函数的 validate 函数。

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

完成这些之后，将 `validate` 函数作为 `ConfigModule` 的配置选项传入：

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

`ConfigService` 定义了一个通用的 `get()` 方法，用于按键检索配置值。你还可以添加 getter 函数，以获得更自然的编码风格：

```typescript title="api-config.service.ts"
@Injectable()
export class ApiConfigService {
  constructor(private configService: ConfigService) {}

  get isAuthEnabled(): boolean {
    return this.configService.get('AUTH_ENABLED') === 'true';
  }
}

```

> info **提示** 本示例假定 `AUTH_ENABLED` 是字符串。如果你的验证模式将其转换为布尔值，`get()` 会返回转换后的值，因此请直接返回 `this.configService.get<boolean>('AUTH_ENABLED')`，而不要将其与 `'true'` 进行比较。

现在你可以按如下方式使用 getter 函数：

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

如果某个模块配置依赖于从 `.env` 文件加载的环境变量，请使用 `ConfigModule.envVariablesLoaded` 钩子，以确保在读取 `process.env` 对象之前该文件已经加载完成：

```typescript
export async function getStorageModule() {
  await ConfigModule.envVariablesLoaded;
  return process.env.STORAGE === 'S3' ? S3StorageModule : DefaultStorageModule;
}

```

这种写法可以保证，一旦 `ConfigModule.envVariablesLoaded` promise 解析完成，所有配置变量都已加载。

#### 条件模块配置

有时你可能希望有条件地加载某个模块，并在环境变量中指定该条件。`@nestjs/config` 包为此提供了一个 `ConditionalModule`。

```typescript
@Module({
  imports: [
    ConfigModule.forRoot(),
    ConditionalModule.registerWhen(FooModule, 'USE_FOO'),
  ],
})
export class AppModule {}

```

除非将 `USE_FOO` 环境变量设置为 `false`（不区分大小写），否则该模块会加载 `FooModule`。如果该变量未定义，则加载 `FooModule`。你还可以传入自定义条件：一个接收 `process.env` 引用并返回布尔值的函数：

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

当你使用 `ConditionalModule` 时，请确保应用中同时加载了 `ConfigModule`，以便 `ConfigModule.envVariablesLoaded` 钩子能够解析。如果该钩子在 5 秒内（或通过 `registerWhen()` 方法的第三个 `options` 参数的 `timeout` 属性设置的超时毫秒数内）未能解析，`ConditionalModule` 会抛出错误，Nest 将中止启动应用。

#### 可展开变量

`@nestjs/config` 包支持环境变量展开。借助这项技术，你可以创建嵌套的环境变量，即在一个变量的定义中引用另一个变量。例如：

```json
APP_URL=mywebsite.com
SUPPORT_EMAIL=support@${APP_URL}

```

使用这种写法，变量 `SUPPORT_EMAIL` 会解析为 `'support@mywebsite.com'`。`${...}` 语法会在 `SUPPORT_EMAIL` 的定义中触发对变量 `APP_URL` 值的解析。

> info **提示** 对于此功能，`@nestjs/config` 包内部使用了 [dotenv-expand](https://github.com/motdotla/dotenv-expand)。

通过传递给 `ConfigModule.forRoot()` 的选项对象的 `expandVariables` 属性来启用环境变量展开，如下所示。除了 `true`，你也可以传入一个包含 `dotenv-expand` 选项的对象。

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

尽管配置存储在服务中，你仍然可以在 `main.ts` 文件中使用它，例如读取应用端口或 CORS 主机等变量。

要访问它，请使用 `app.get()` 方法并传入服务类：

```typescript
const configService = app.get(ConfigService);

```

然后你就可以像往常一样，通过传入配置键调用 `get()` 方法来使用它：

```typescript
const port = configService.get('PORT');

```