<!-- 此文件从 content/migration.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:33:54.495Z -->
<!-- 源文件: content/migration.md -->
<!-- 源哈希: 566453b9082bce441577857a362b622e -->

### 迁移指南

本文档将指导您从 NestJS 版本 11 迁移到版本 12。版本 12 侧重于 ESM 包、更新的 CLI 默认设置、对基于 [Standard Schema](https://standardschema.dev/) 的验证和序列化的一流支持，以及原生的 [observability](/observability/overview) 支持。

> info **提示** 如果您的项目版本低于 v11 的主要版本，请参阅 [Version compatibility](/faq/versions)，了解如何先升级到 v11。

#### 升级包

首先升级 Nest CLI 本身，因为下面的升级命令随之提供：

```bash
$ npm i -g @nestjs/cli@latest @nestjs/schematics@latest

```

如果您的项目将 CLI 保留为本地开发依赖，也应在那里更新它，同时更新 TypeScript。`@nestjs/schematics` v12 要求 TypeScript 6 作为对等依赖，因此 npm 会拒绝将其安装在 TypeScript 5 旁边：

```bash
$ npm i -D @nestjs/cli@latest @nestjs/schematics@latest typescript@^6

```

如果 npm 仍然报告对等依赖冲突，您的 lockfile 很可能固定了较旧的 `ts-jest` 或 `typescript-eslint` 版本，这些版本不接受 TypeScript 6。这两个版本都来自 v11 CLI 生成的项目。运行 `npm update ts-jest typescript-eslint` 将它们移动到当前范围内的较新版本，然后再次运行上面的命令。

在安装了最新 CLI 后，从项目的根目录运行 `nest upgrade`：

```bash
$ nest upgrade

```

该命令一次性将每个已识别的 `@nestjs/*` 包移动到其 v12 兼容的主要版本，从而使框架、平台适配器和伴随包保持同步，然后安装它们。它还将 TypeScript 提升到 v6，并应用本指南中描述的机械迁移部分（`nest-cli.json` webpack 选项、GraphQL `playground` 和订阅传输更改、NATS 包替换以及 `@nestjs/config` 验证选项）。最后，它会打印一份更改报告，以及关于它无法为您迁移的行为更改的说明。要查看该报告而不修改文件，请先使用 `--dry-run` 运行该命令。有关完整步骤和选项的列表，请参阅 [nest upgrade](/cli/usages#nest-upgrade)。

> info **提示** `nest upgrade` 取代了先前在此处推荐的手动 [npm-check-updates (ncu)](https://npmjs.com/package/npm-check-updates) 流程。如果您愿意，仍然可以手动升级包；重要的是每个 Nest 包一次性移动到同一主要版本。该命令仅提升您项目内部的 CLI 依赖，这就是您首先升级全局二进制文件的原因。

#### Node.js 要求

Node.js 要求取决于您是**运行**应用程序还是使用 CLI **生成**代码：

| 您正在做什么 | 最低 Node.js |
| --- | --- |
| 运行 Nest 12 应用程序 | **v20.19+**，或 22.x 线的 **v22.12+** |
| `nest new`, `nest generate`, `nest upgrade` (`@nestjs/schematics`) | **v22.22.3+**，**v24.15+**，或 **v26+** |

`@nestjs/core` 本身仍然声明了 `>= 20`，但 v12 包是 ESM 专用的，从 CommonJS 应用程序中消费它们依赖于 `require(esm)`，该特性仅从 Node.js 20.19 和 22.12 开始才未被标记。21.x 线从未获得此特性，因此不受支持。`nest upgrade` 强制执行了这一点，并拒绝在旧版本上运行。

AWS Lambda 默认在其 Node.js 20、22 和 24 运行时禁用 `require(esm)`，即使相应的上游 Node.js 版本启用了它。要在这些 Lambda 运行时上运行 CommonJS Nest 12 应用程序，请通过函数的 `NODE_OPTIONS` 环境变量启用它：

```text
NODE_OPTIONS=--experimental-require-module

```

如果 `NODE_OPTIONS` 已经包含其他标志，请将此标志附加到现有值。有关详细信息和实验性功能的支持限制，请参阅 [AWS Lambda documentation](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html#nodejs-experimental)。

CLI 的 schematics 有其更高的基线：`@nestjs/schematics` 要求 **Node.js v22.22.3+、v24.15+ 或 v26+**，这是从其构建的 Angular devkit 继承的。因此，脚手架和升级需要比运行框架更新的运行时。23.x 和 25.x 线，以及更早的 22.x 和 24.x 版本均被排除在外。

> info **提示** 满足所有要求的最简单方法是运行最新的活跃 LTS 版本。只有在有特定理由保持在该版本时，才选择最低要求。如果您这样做，请记住 Node.js 20.19 足以运行您的应用程序，但不足以使用 CLI 的生成器。

#### ESM 包

所有核心 Nest 包现在都以 ESM 形式提供。对于大多数现有应用程序来说，这比几年前要少得多具有破坏性，因为现代 Node.js 版本支持 `require(esm)`。

> info **提示** 将**您自己的**应用程序迁移到 ESM 是完全可选的，**不**是升级到 v12 的一部分。由于 Nest 的 ESM 包可以通过 `require(esm)` 从 CommonJS 消费，因此 CommonJS 应用程序可以升级到 v12 并保持 CommonJS 格式任意长时间；`nest upgrade` 故意不更改您的模块格式。是否切换取决于个人偏好。如果您决定切换，本指南的最后两个部分 [Switching your project to ESM](#switching-your-project-to-esm) 和 [Moving your own code to ESM](#moving-your-own-code-to-esm) 将指导您完成此过程。

实际上，这意味着：

- 许多现有的 CommonJS 应用程序无需完全重写即可继续工作
- 如果自定义引导脚本、构建工具和测试运行器做出仅依赖 CommonJS 包的假设，请进行审查
- 如果您维护自定义打包器或运行时配置，请确保它与您的项目实际使用的模块格式相匹配

对于新项目，CLI 现在允许您在 CommonJS 和 ESM 项目布局之间进行选择。

#### 新项目默认设置

`nest new` 现在提示您选择生成 CommonJS 还是 ESM 项目。

- ESM 项目默认使用 Vitest（CommonJS 项目使用 Jest）
- 所有生成的项目默认使用 oxlint

这仅改变 CLI 为您搭建的脚手架。现有项目可以保留当前的工具链，并在自己的时间表上进行迁移。

#### 测试栈

Nest 的测试工具保持不变。主要的变化是生成的 ESM 项目以及框架自身的仓库和示例使用的默认栈：Vitest 现在是 ESM 工作流的主要默认选项。

如果您的应用程序已经使用不同的测试运行器，则无需立即迁移。`@nestjs/testing` 仍然是测试运行器无关的。

> warning **警告** 如果您继续使用 Jest，请注意它只能在 Node.js v24.9 或更高版本上加载仅限 ESM 的 v12 包（旧版本会因 `ERR_REQUIRE_ASYNC_MODULE` 而失败）。请在 Node.js v24.9+ 上运行测试套件，或考虑迁移到 Vitest。`nest upgrade` 将 Jest 升级到 v30 并对此发出警告。

当您决定迁移时：

- 更新您的 `test`、`test:watch`、`test:cov` 和 `test:e2e` 脚本
- 审查任何特定于运行器的全局变量，并在需要时替换为 Vitest 等效项
- 如果您的 Vitest 设置期望默认导入，请检查 E2E 测试中的 `supertest` 导入

#### Linting 默认设置

新生成的项目默认使用 oxlint。只有当您希望仓库与新的 CLI 脚手架匹配时才需要迁移。

#### 路由装饰器模式

Nest 为路由参数装饰器（如 `@Body()`、`@Query()`、`@Param()` 和 `@RawBody()`）添加了一个新的 `schema` 选项。该模式元数据专为兼容 [Standard Schema](https://standardschema.dev/) 的库（如 Zod、Valibot 和 ArkType）设计。

例如：

```typescript
@Post()
create(@Body({ schema: createUserSchema }) body: CreateUserDto) {
  return this.usersService.create(body);
}

@Get(':id')
findOne(@Param('id', { schema: z.coerce.number().int().positive() }) id: number) {
  return this.usersService.findOne(id);
}

```

单独来看，该装饰器仅附加模式元数据。要根据其进行验证，请注册内置的 `StandardSchemaValidationPipe`：

```typescript
app.useGlobalPipes(new StandardSchemaValidationPipe());

```

这是传统 `ValidationPipe` 加上 `class-validator` 流程的模式优先替代方案。相同的模式也可以用于 OpenAPI 生成（参见 [Standard Schema (Zod, Valibot)](/openapi/introduction#standard-schema-zod-valibot)）。

现有的基于装饰器的方案仍然完全受支持，并且没有移除该方案的计划。`schema` 选项是偏爱 Zod 等模式优先库的团队的额外选择。

#### 标准模式序列化

Nest 还引入了 `StandardSchemaSerializerInterceptor`，它使用相同的标准模式生态系统来验证和转换传出的响应。

```typescript
@UseInterceptors(StandardSchemaSerializerInterceptor)
@SerializeOptions({ schema: userResponseSchema })
@Get(':id')
findOne(@Param('id') id: string) {
  return this.usersService.findOne(id);
}

```

当您希望使用模式而不是 `class-transformer` 装饰器来驱动响应塑形时，请使用它。

#### GraphQL IDE 配置

GraphiQL 现在是默认的 GraphQL IDE。如果需要自定义，请传递 `graphiql` 选项对象，而不是设置 `graphiql: true`。

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  graphiql: {
    url: '/graphql',
    headers: {
      authorization: 'Bearer <token>',
    },
    shouldPersistHeaders: true,
    isHeadersEditorEnabled: true,
  },
});

```

这在保持 GraphiQL 启用状态的同时，自定义了 IDE 端点和编辑器行为。

#### GraphQL 订阅传输

最新的 `@nestjs/graphql` 版本移除了对 `subscriptions-transport-ws` 的支持。请使用 `graphql-ws` 进行 GraphQL 订阅。

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  subscriptions: {
    'graphql-ws': true,
  },
});

```

如果您的应用程序仍依赖于 `subscriptions-transport-ws`，请将该迁移计划作为 GraphQL 包升级的一部分。

#### NATS v3

微服务包现在针对 NATS v3，其中包含一个破坏性依赖变更。如果您使用 NATS 传输器，请用 `@nats-io/transport-node` 替换旧的 `nats` 包：

```bash
$ npm uninstall nats
$ npm install @nats-io/transport-node

```

如果您的应用程序直接导入 NATS 助手，请同时安装 `@nats-io/nats-core` 并更新这些导入。NATS v3 还移除了 `StringCodec` 和 `JSONCodec` 助手。例如，`headers()` 助手现在来自 `@nats-io/nats-core`：

```typescript
import * as nats from '@nats-io/nats-core';
import { NatsRecordBuilder } from '@nestjs/microservices';

const headers = nats.headers();
headers.set('x-version', '1.0.0');

const record = new NatsRecordBuilder(payload).setHeaders(headers).build();
return this.client.send('record-builder-duplex', record);

```

同时审查任何自定义序列化器或反序列化器。Nest 现在将 NATS 数据包序列化为 JSON 字符串，自定义 NATS 反序列化器接收完整的 NATS 消息对象，而不是原始的 `Uint8Array`。实际上，自定义反序列化器应使用 `msg.json()` 读取有效载荷，而不是手动解码字节。

#### 生命周期钩子排序

生命周期钩子现在按组件层次结构级别调用。当多个提供者或模块相互依赖时，这可能会改变诸如 `onModuleInit`、`onApplicationBootstrap` 等钩子以及关闭钩子的执行顺序。

如果您的应用程序依赖于相关提供者之间特定的钩子顺序，请在升级期间审查该流程，并更新初始化逻辑、清理逻辑或测试中的任何假设。

#### `@Optional()` 不再被重新声明的构造函数继承

Nest 现在从声明构造函数的类读取构造函数参数的可选标记。声明自己构造函数的子类不再继承其父类构造函数的标记，因此 Nest 在 v11 将此类参数解析为 `undefined` 的地方抛出 `UnknownDependenciesException`。

这是故意的：一个确实缺失的依赖过去会静默地解析为 `undefined`。请在子类的构造函数中再次声明该标记：

```typescript
@Injectable()
class Child extends Base {
  constructor(@Optional() options?: Options) {
    super(options);
  }
}

```

从 NestJS v12.1 开始，没有自己构造函数的子类会保留其父类构造函数的可选标记，就像 v11 一样。12.0.x 版本在这种情况下也移除了它们。

#### class-validator 和 class-transformer

现有的基于装饰器的工作流程在 v12 中仍然有效。`ValidationPipe` 和 `ClassSerializerInterceptor` 仍然受支持，对于基于类的 DTO 项目来说仍然是一个好选择。

Version 12 扩展了内置选项，而不是替换现有选项：

- 当您的 DTO 是基于类的并且依赖于 装饰器 时，使用 `ValidationPipe`
- 当您的验证库已暴露与 Standard Schema 兼容的模式时，使用 `StandardSchemaValidationPipe`
- 当您的响应塑形基于 `ClassSerializerInterceptor` 时，使用 `ClassSerializerInterceptor`
- 当您的响应形状应从模式派生时，使用 `StandardSchemaSerializerInterceptor`

#### Config 模块

`@nestjs/config` 从 Joi 特定验证迁移到 [Standard Schema](https://standardschema.dev/)。`validationSchema` 选项现在接受任何与 Standard Schema 兼容的模式，例如 Zod、Valibot 或 ArkType。

```typescript
import { z } from 'zod';

ConfigModule.forRoot({
  validationSchema: z.object({
    NODE_ENV: z
      .enum(['development', 'production', 'test', 'provision'])
      .default('development'),
    PORT: z.coerce.number().default(3000),
  }),
});

```

由于验证不再与单个库绑定，我们现在建议新项目使用 Zod 等现代 Standard Schema 库，并且 [Configuration chapter](/application/configuration#模式验证) 已围绕其重写。

您现有的 Joi 模式仍然有效，但有两个注意事项：

- 您必须升级到 **Joi v18 或更高版本**，该版本实现了 Standard Schema 规范
- 以前直接传递在 `validationOptions` 下的特定于库的设置现在位于 `validationOptions.libraryOptions` 下

```typescript
// Before
validationOptions: {
  allowUnknown: false,
  abortEarly: true,
},

// After
validationOptions: {
  libraryOptions: {
    allowUnknown: false,
    abortEarly: true,
  },
},

```

对于 Joi 模式，`@nestjs/config` 保留了其历史默认值 `allowUnknown: true` 和 `abortEarly: false`，并将其与您传递的任何内容合并。

#### Terminus 模块

已在 v11 中弃用的旧版健康指示器 API 已被移除。如果您的自定义健康指示器仍然扩展 `HealthIndicator` 或抛出 `HealthCheckError`，请迁移到 `HealthIndicatorService`。

**先前方法**

在 v12 之前，自定义健康指示器可以通过抛出 `HealthCheckError` 来报告不健康状态：

```typescript
@Injectable()
export class DogHealthIndicator extends HealthIndicator {
  constructor(private readonly dogService: DogService) {
    super();
  }

  async isHealthy(key: string) {
    const badboys = await this.dogService.getBadboys();
    const isHealthy = badboys.length === 0;
    const result = this.getStatus(key, isHealthy, { badboys: badboys.length });

    if (!isHealthy) {
      throw new HealthCheckError('Dog check failed', result);
    }

    return result;
  }
}

```

**更新后的方法 (NestJS Terminus v12)**

在 v12 中，健康指示器在两种情况下都会返回其结果。抛出不再是报告不健康状态的方式。指示器要么明确返回 `up()` / `down()`，要么将操作交给 `attempt()`，当操作抛出时，该操作会标记指示器为 `'down'`：

```typescript
@Injectable()
export class DogHealthIndicator {
  constructor(
    private readonly dogService: DogService,
    // Inject the `HealthIndicatorService` provided by the `TerminusModule`
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);
    const badboys = await this.dogService.getBadboys();

    if (badboys.length > 0) {
      // Mark the indicator as "down" and add additional info to the response
      return indicator.down({ badboys: badboys.length });
    }

    // Mark the health indicator as "up"
    return indicator.up();
  }
}

```

如果指示器只需要知道操作是否成功（例如，狗服务是否可达），则使用 `attempt()` 是更简洁的形式：

```typescript
isHealthy(key: string) {
  return this.healthIndicatorService
    .check(key)
    .attempt(() => this.dogService.ping())
    .withTimeout(1000);
}

```

内置数据库、微服务和 gRPC 指示器的 `timeout` 选项（例如 `db.pingCheck('database', { timeout: 1500 })`）已弃用。请在返回的 attempt 上链式调用 `.withTimeout(1500)`。有关详细信息，请参阅 [Terminus chapter](/recipes/terminus#configuring-a-check)。

#### CLI 工作流中的 Webpack 弃用

v12 版本还标志着从以 webpack 为中心的 CLI 工作流的转变。Rspack 现在是 Monorepo 的默认打包器，并且 `--webpack` / `--webpackPath` CLI 标志（以及 `nest-cli.json` 中的 `webpack` / `webpackConfigPath` 对应项）已被 `--builder rspack` 取代。如果您的项目生成或构建设置依赖于 webpack，请计划随着时间的推移进行迁移。

CLI 还添加了 `bun` 作为受支持的包管理器，并且 `decorator` 模式现在以 `Reflector.createDecorator()` 的形式生成装饰器。`angular` 模式已被移除。

#### 新的 CLI 命令和标志

CLI 获得了一个 `deploy` 命令，它转发到 [Mau](https://mau.nestjs.com/)，并在首次使用时将 `@nestjs/mau` 安装为开发依赖：

```bash
$ nest deploy

```

`nest build` 和 `nest start` 还支持一些新选项：

- `--rspackPath [path]`：Rspack 配置文件路径，是已弃用的 `--webpackPath` 的对应项
- `--emit-declarations`：使用 SWC 构建器时发出 `.d.ts` 文件（在 `nest-cli.json` 中也可用作 `emitDeclarations`）
- `--no-type-check`：明确禁用 SWC 类型检查
- `--silent`：抑制信息性编译器日志

`nest build` 还支持 `--parallel [concurrency]`，当与 `--all` 结合使用时，它并行构建 Monorepo 项目。此外，`nest-cli.json` 获得了一个 `includeLibraryAssets` 属性，用于将库资源复制到应用程序构建中。

#### 路由冲突诊断

Nest 按照声明顺序注册路由。在 Express 等对顺序敏感的适配器上，这意味着 `@Get(':id')` 可能会静默地遮盖在它之后声明的 `@Get('me')`。v12 向 `NestApplicationOptions` 添加了两个**选择加入**选项来解决此问题：

```typescript
const app = await NestFactory.create(AppModule, {
  routeConflictPolicy: { duplicate: 'error', shadow: 'warn' },
  routeResolutionStrategy: 'specificity',
});

```

两者都默认为先前行为，因此现有应用程序不受影响，除非您设置了它们。有关完整描述，请参阅 [Controllers chapter](/overview/controllers#路由冲突与解析顺序)。

#### 可机器读取的错误代码

`HttpExceptionOptions` 接受一个新的 `errorCode` 属性。它被序列化到响应体中，因此客户端可以基于稳定的标识符进行分支，而不是解析消息字符串：

```typescript
throw new BadRequestException('Password is too weak', {
  errorCode: 'WEAK_PASSWORD',
});

```

有关异常过滤器中的 [Machine-readable error codes](/overview/exception-filters#机器可读的错误代码)，请参阅。

#### 结构化日志参数

`ConsoleLogger` 现在将消息后传递的纯对象视为附加到同一日志条目的结构化参数，而不是将其作为单独的记录发出：

```typescript
logger.log('User created', { userId: 1, email: 'foo@bar.com' });

```

在 JSON 模式下，它们嵌套在 `params` 键下，或者如果启用 `flattenParams`，则分散到根对象中。此行为在 v12 中默认开启；设置 `structuredParams: false` 以恢复先前行为。有关 Logger 章节中的 [Structured logging params](/application/logger#结构化日志参数)，请参阅。

#### 原生可观测性支持

v12 通过官方 [`@nestjs/observe`](/observability/overview) SDK 添加了一流的可观测性支持。SDK 不再将通用的 Node.js APM 代理附加到 HTTP 服务器，而是通过 `instrument` 应用程序选项插入到 Nest 自身的请求生命周期中。因此，请求、任务、错误和跟踪是根据您的控制器、提供者、解析器和队列消费者报告的。

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [ObserveModule.forRoot({ serviceId: 'cats-app' })],
})
export class AppModule {}

```

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';

const app = await NestFactory.create(AppModule, {
  instrument: ObserveInstrument,
});

```

这里没有需要迁移的内容：这是一个新的、选择加入的功能。有关自动插桩涵盖的内容，请参阅 [Observability chapter](/observability/overview)，有关配置选项，请参阅 [SDK reference](/observability/sdk)。

#### 其他值得注意的发布变更

取决于您使用的 Nest 包，您可能还想查看以下变更：

- **Pipe 转换签名** 已得到完善，以增强类型安全，`ArgumentMetadata` 现在接受一个泛型参数。使用手写签名的自定义管道可能需要调整其类型。
- **`ValidationPipe` 错误格式**：新的 `errorFormat` 选项（`'list'` 或 `'grouped'`）控制验证错误响应的形状。
- **gRPC 异常过滤器**：`GrpcExceptionFilter` 加上一系列特定状态的异常，将错误映射到正确的 gRPC 状态码，而不是 `UNKNOWN`。请参阅 [gRPC chapter](/microservices/grpc#异常处理)。
- **Regex Kafka 模式**：`@MessagePattern()` 和 `@EventPattern()` 现在接受 Kafka 传输器上的 `RegExp`。请参阅 [Kafka chapter](/microservices/kafka#正则表达式模式)。
- **请求作用域 WebSocket 网关**：网关现在支持请求作用域的提供者，Socket 可以通过 `REQUEST` 令牌注入。请参阅 [Gateways chapter](/websockets/gateways#请求作用域的网关)。
- **WebSocket 断开连接原因**：`handleDisconnect` 现在可以接收断开连接的原因。
- **微服务预请求钩子**：一个新的钩子在调用消息处理器之前运行。
- **Express 优雅关闭**：Express 适配器在关闭时会耗尽正在进行的请求。
- **HTTP 适配器错误映射** 已在核心、Express 和 Fastify 适配器中重构。

如果您依赖于这些领域中的任何一个，请在升级后使用您的测试套件验证相应的行为。

#### 将您的项目切换到 ESM

> 警告 **可选** 本节和下一节**不**属于升级到 v12 的范畴，因此它们放在最后。CommonJS 应用程序在 v12 上保持不变：`nest upgrade` 不会触及您的模块格式，框架中没有任何内容要求您切换。只有当您*希望*将项目迁移到 ESM 时才继续阅读，无论您选择何种时间表。

切换本身发生在 `package.json`，而不是 `tsconfig.json`。添加一个设置为 `module` 的 `type` 字段：

```json
{
  "name": "my-app",
  "type": "module"
}

```

这个单一的字段告诉 Node.js（并通过 `"module": "nodenext"`，TypeScript）将您的 `.js` 输出视为 ESM。

是否还需要更改 `tsconfig.json` 取决于您的项目有多旧：

- **使用较新 v11 CLI 生成的项目**（`@nestjs/schematics` 11.0.6 或更高版本）已经使用了 `"module": "nodenext"` 和 `"moduleResolution": "nodenext"`。`tsconfig.json` 中无需更改任何内容；只需添加 `"type": "module"` 即可。
- **使用早期版本生成的项目**（v10 或早期 v11）通常仍使用 `"module": "commonjs"` 且没有 `moduleResolution` 条目。在添加 `"type": "module"` 之前更新两者：

```json
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "resolvePackageJsonExports": true,
    "target": "ES2023"
  }
}

```

供参考，这是 `nest new` 生成的 ESM 项目使用的完整 `compilerOptions` 集合：

```json
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "resolvePackageJsonExports": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2023",
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": ".",
    "incremental": true,
    "skipLibCheck": true,
    "strict": true,
    "strictPropertyInitialization": false,
    "types": ["vitest/globals", "node"]
  }
}

```

> 信息 **提示** `nest-cli.json` 和 `tsconfig.build.json` 在 CommonJS 和 ESM 项目变体中是相同的，因此两者都不需要更改。上面的 `types` 条目仅因 ESM 项目默认使用 Vitest 而有所不同；在 Jest 上的 CommonJS 项目使用 `["node", "jest"]`。

> 警告 **警告** `"module": "nodenext"` 从最近的 `package.json` 推导出每个文件的模块格式。因此，添加 `"type": "module"` 会改变项目中**每个** `.ts` 文件的发出方式，TypeScript 开始报告下面描述的缺失导入扩展名。请预期在同一轮中修复它们，而不是增量修复。

#### 将您自己的代码迁移到 ESM

配置到位后，您自己的代码中最常需要关注的两个方面是相对导入和仅限 CommonJS 的全局变量。

相对导入必须带有文件扩展名：

```typescript
// Before
import { AppModule } from './app.module';

// After
import { AppModule } from './app.module.js';

```

扩展名是 `.js`，尽管源文件是 `.ts`，因为规范引用的是已发出的文件。

`__dirname` 和 `__filename` 在 ESM 中不存在。请改用 `import.meta.dirname`（或在旧版 Node.js 上使用 `import.meta.url` 配合 `fileURLToPath`）：

```typescript
// Before
protoPath: join(__dirname, 'hero/hero.proto'),

// After
protoPath: join(import.meta.dirname, 'hero/hero.proto'),

```

同样，`require()` 是不可用的。如果需要它进行互操作，请使用 `node:module` 中的 `createRequire(import.meta.url)` 明确创建它。

> 信息 **提示** 这些文档中的许多代码示例都使用了上述 ESM 约定。如果您的项目仍是 CommonJS，请删除 `.js` 扩展名，保留 `__dirname`，并且在没有 `await` 的情况下调用 `bootstrap()`。