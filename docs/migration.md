<!-- 此文件从 content/migration.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-03T21:40:00.000Z -->
<!-- 源文件: content/migration.md -->
<!-- 源哈希: 5c9643901fb0edeaa66e1fc310237b62 -->

### 迁移指南

本文介绍如何从 NestJS 版本 11 迁移到版本 12。版本 12 的核心是：支持 ESM 的包、更新的 CLI 默认值、对基于 [Standard Schema](https://standardschema.dev/) 的验证与序列化的一等支持，以及原生的[可观测性](/observability/overview)支持。

#### 升级包

首先升级 Nest CLI 本身，因为下文使用的升级命令随 CLI 一起发布：

```bash
$ npm i -g @nestjs/cli@latest @nestjs/schematics@latest
```

如果您的项目将 CLI 保留为本地开发依赖，也请一并更新：

```bash
$ npm i -D @nestjs/cli@latest @nestjs/schematics@latest
```

装好最新 CLI 后，在项目根目录运行 `nest upgrade`：

```bash
$ nest upgrade
```

该命令会将每个 `@nestjs/*` 包一次性迁移到其 v12 兼容的主版本，确保框架、平台适配器和配套包保持同步，然后安装它们。除此之外，它还会替您完成本指南中描述的迁移的机械化部分——`nest-cli.json` 的 webpack 选项、GraphQL `playground` / 订阅传输层的重命名、NATS 包的替换、`@nestjs/config` 的验证选项——并打印一份报告，列出它更改的所有内容，以及它无法替您迁移的行为变更说明。如果您想在不改动文件的情况下先查看这份报告，请先传入 `--dry-run`。完整的步骤和选项列表请参阅 [nest upgrade](/cli/usages#nest-upgrade)。

> info **提示** `nest upgrade` 取代了此前推荐的 [npm-check-updates (ncu)](https://npmjs.com/package/npm-check-updates) 手动升级流程。您仍然可以手动升级包——关键是所有 Nest 包要一次性升级到同一个主版本。请注意，该命令只会升级项目内的 CLI 依赖，这正是要先升级全局二进制的原因。

#### Node.js 版本要求

Node.js 版本要求取决于您是在**运行**应用程序，还是使用 CLI **生成**代码：

| 您要做的事 | 最低 Node.js 版本 |
| --- | --- |
| 运行 Nest 12 应用程序 | **v20.19+**，或 22.x 线上的 **v22.12+** |
| `nest new`、`nest generate`、`nest upgrade`（`@nestjs/schematics`） | **v22.22.3+**、**v24.15+** 或 **v26+** |

`@nestjs/core` 本身仍声明 `>= 20`，但 v12 的包是纯 ESM 的，从 CommonJS 应用程序中消费它们依赖 `require(esm)`——该特性仅在 Node.js 20.19 和 22.12 及之后版本中无需标志即可使用。21.x 线从未获得该特性，不受支持。`nest upgrade` 会严格执行这一要求，并拒绝在更旧的版本上运行。

CLI 的 schematics 有自己更高的门槛：`@nestjs/schematics` 要求 **Node.js v22.22.3+、v24.15+ 或 v26+**，这是它所依赖的 Angular devkit 决定的。因此，脚手架和升级所需的运行时比单纯运行框架更新——另请注意，23.x 和 25.x 线以及早期的 24.x 版本均不在支持范围内。

> info **提示** 满足所有要求的最简单办法是使用最新的活跃 LTS。只有在有明确理由时才选择最低版本——即便如此也请注意：Node 20.19 足以运行您的应用程序，但不足以使用 CLI 的生成器。

#### ESM 包

所有 Nest 核心包现在都以 ESM 形式发布。对大多数现有应用程序而言，这比几年前要轻松得多，因为现代 Node.js 版本已支持 `require(esm)`。

> info **提示** 将**您自己的**应用程序迁移到 ESM 完全是可选的，也**不是**升级到 v12 的一部分。由于 Nest 的 ESM 包可以通过 `require(esm)` 从 CommonJS 中消费，CommonJS 应用程序可以升级到 v12 并按您的意愿一直保持 CommonJS——`nest upgrade` 会刻意不改动您的模块格式。是否切换纯属偏好。如果您决定切换，本指南的最后两节——[将项目切换到 ESM](#将项目切换到-esm) 和 [将您自己的代码迁移到 ESM](#将您自己的代码迁移到-esm)——会带您完成。

在实践中，这意味着：

- 许多现有的 CommonJS 应用程序无需完全重写即可继续工作
- 如果自定义引导脚本、构建工具和测试运行器对"仅 CommonJS 包"做了假设，应当重新审查
- 如果您维护自定义的打包器或运行时配置，请确保它与项目实际使用的模块格式匹配

如果您要启动新项目，CLI 现在允许您在 CommonJS 和 ESM 项目布局之间选择。

#### 新项目默认值

`nest new` 现在会提示您选择生成 CommonJS 还是 ESM 项目。

- ESM 项目默认使用 Vitest
- 生成的项目默认使用 oxlint

这只改变 CLI 为您脚手架生成的内容。现有项目可以保留当前工具链，按自己的节奏迁移。

#### 测试技术栈

Nest 的测试工具保持不变。主要变化是生成的 ESM 项目以及框架自身仓库和示例所使用的默认技术栈：对于 ESM 工作流，Vitest 现在是首要默认选择。

如果您的应用程序已经在使用其他测试运行器，无需立即迁移。`@nestjs/testing` 依然与具体的测试运行器无关。

当您决定迁移时：

- 更新 `test`、`test:watch`、`test:cov` 和 `test:e2e` 脚本
- 审查所有运行器特定的全局变量，必要时替换为 Vitest 的等价物
- 如果您的 Vitest 配置期望默认导入，请检查 E2E 测试中的 `supertest` 导入方式

#### 代码检查（Lint）默认值

新生成的项目默认使用 oxlint。只有当您希望仓库与新的 CLI 脚手架保持一致时才需要迁移。

#### 路由装饰器模式（Schema）

Nest 为 `@Body()`、`@Query()`、`@Param()` 和 `@RawBody()` 等路由参数装饰器新增了 `schema` 选项。该模式元数据面向兼容 [Standard Schema](https://standardschema.dev/) 的库，例如 Zod、Valibot、ArkType 等。

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

就其本身而言，装饰器只是附加模式元数据。要据此进行验证，请注册内置的 `StandardSchemaValidationPipe`。

```typescript
app.useGlobalPipes(new StandardSchemaValidationPipe());
```

这是传统 `ValidationPipe` 加 `class-validator` 流程之外的一种模式优先（schema-first）替代方案。相同的模式还可以用于驱动 OpenAPI 生成——参见 [Standard Schema (Zod, Valibot)](/openapi/introduction#standard-schema-zod-valibot)。

现有的基于装饰器的方式仍然完全受支持，并且没有移除它的计划。`schema` 属性是为偏好 Zod 这类模式优先库的团队提供的额外选项。

#### Standard Schema 序列化

Nest 还引入了 `StandardSchemaSerializerInterceptor`，让您可以使用同一个 Standard Schema 生态来验证和变换传出响应。

```typescript
@UseInterceptors(StandardSchemaSerializerInterceptor)
@SerializeOptions({ schema: userResponseSchema })
@Get(':id')
findOne(@Param('id') id: string) {
  return this.usersService.findOne(id);
}
```

当您希望响应的塑形由模式而非 `class-transformer` 装饰器驱动时，请使用它。

#### GraphQL IDE 配置

GraphiQL 现在是默认的 GraphQL IDE。如果需要自定义，请传入 `graphiql` 选项对象，而不是设置 `graphiql: true`。

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

这使您可以在保持 GraphiQL 启用的同时，自定义 IDE 端点和编辑器行为。

#### GraphQL 订阅传输层

最新的 `@nestjs/graphql` 版本移除了对 `subscriptions-transport-ws` 的支持。今后进行 GraphQL 订阅请使用 `graphql-ws`。

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  subscriptions: {
    'graphql-ws': true,
  },
});
```

如果您的应用程序仍在依赖 `subscriptions-transport-ws`，请把这项迁移纳入 GraphQL 包升级的计划中。

#### NATS v3

microservices 包现在面向 NATS v3，这次升级包含一个破坏性的依赖变更。如果您使用 NATS 传输器，请将旧的 `nats` 包替换为 `@nats-io/transport-node`。

```bash
$ npm uninstall nats
$ npm install @nats-io/transport-node
```

如果您的应用程序直接导入 NATS 辅助函数，也请更新这些导入。例如，header 辅助函数现在来自新的 NATS 包：

```typescript
import * as nats from '@nats-io/nats-core';
import { NatsRecordBuilder } from '@nestjs/microservices';

const headers = nats.headers();
headers.set('x-version', '1.0.0');

const record = new NatsRecordBuilder(payload).setHeaders(headers).build();
return this.client.send('record-builder-duplex', record);
```

同时请审查所有自定义序列化器或反序列化器。Nest 现在将 NATS 数据包序列化为 JSON 字符串，自定义的 NATS 反序列化器接收到的是完整的 NATS 消息对象，而不是原始的 `Uint8Array`。在实践中，这意味着自定义反序列化器应当从 `msg.json()` 读取负载，而不是手动解码字节。

#### 生命周期钩子顺序

生命周期钩子现在按组件层级依次调用。当多个提供者或模块相互依赖时，这可能改变 `onModuleInit`、`onApplicationBootstrap` 和关闭钩子等钩子的执行顺序。

如果您的应用程序依赖相关提供者之间的特定钩子顺序，请在升级过程中审查该流程，并更新初始化逻辑、销毁逻辑或测试中的所有相关假设。

#### class-validator 与 class-transformer

现有的基于装饰器的工作流在 v12 中依然可用。`ValidationPipe` 和 `ClassSerializerInterceptor` 仍然受支持，对于基于类的 DTO 项目而言仍是合适的选择。

版本 12 是在既有选项之上进行了扩展，而非取代它们：

- 当您的 DTO 基于类并依赖装饰器时，使用 `ValidationPipe`
- 当您的验证库已经暴露兼容 Standard Schema 的模式时，使用 `StandardSchemaValidationPipe`
- 当您的响应塑形基于 `class-transformer` 时，使用 `ClassSerializerInterceptor`
- 当您希望响应形状由模式派生时，使用 `StandardSchemaSerializerInterceptor`

#### Config 模块

`@nestjs/config` 从 Joi 专属的验证方式转向了 [Standard Schema](https://standardschema.dev/)。`validationSchema` 选项现在接受任何兼容 Standard Schema 的模式——Zod、Valibot、ArkType 等等。

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

由于验证不再绑定于单一库，我们现在建议新项目使用 Zod 这样的现代 Standard Schema 库，[配置章节](/techniques/configuration#模式验证)也已围绕它重写。

如果您想保留现有的 Joi 模式，它们仍然可用，但有两个注意事项：

- 您必须升级到 **Joi v18 或更高版本**，它实现了 Standard Schema 规范
- 之前直接传在 `validationOptions` 下的库特定设置，现在要放到 `validationOptions.libraryOptions` 之下

```typescript
// 之前
validationOptions: {
  allowUnknown: false,
  abortEarly: true,
},

// 之后
validationOptions: {
  libraryOptions: {
    allowUnknown: false,
    abortEarly: true,
  },
},
```

对于 Joi 模式，`@nestjs/config` 保留了其历史默认值 `allowUnknown: true` 和 `abortEarly: false`，并将您传入的内容合并到它们之上。

#### CLI 工作流中的 webpack 弃用

v12 版本也标志着 CLI 工作流从以 webpack 为中心的模式转型。Rspack 现在是 monorepo 的默认打包器，`--webpack` / `--webpackPath` CLI 标志（以及 `nest-cli.json` 中对应的 `webpack` / `webpackConfigPath`）已被弃用，取而代之的是 `--builder rspack`。如果您有基于 webpack 的自定义项目生成或构建假设，请规划逐步迁移。

CLI 还新增了 `bun` 作为受支持的包管理器，并且 `decorator` schematic 现在使用首选的 `Reflector.createDecorator()` 形式生成装饰器。`angular` schematic 已被移除。

#### 新的 CLI 命令与标志

CLI 新增了 `deploy` 命令，它转发到 [Mau](https://mau.nestjs.com/)，并在首次使用时安装 `@nestjs/mau` 作为开发依赖：

```bash
$ nest deploy
```

`nest build` 和 `nest start` 也新增了几个选项：

- `--rspackPath [path]` —— Rspack 配置文件的路径，对应已弃用的 `--webpackPath`
- `--emit-declarations` —— 使用 SWC 构建器时生成 `.d.ts` 文件（也可以通过 `nest-cli.json` 中的 `emitDeclarations` 使用）
- `--no-type-check` —— 显式禁用 SWC 类型检查
- `--silent` —— 抑制信息性的编译器日志

`nest build` 还支持 `--parallel [concurrency]`，与 `--all` 结合使用时可并行构建 monorepo 项目。`nest-cli.json` 还新增了 `includeLibraryAssets` 属性，用于将库资产复制到应用程序构建中。

#### 路由冲突诊断

Nest 按声明顺序注册路由，这在 Express 等顺序敏感的适配器上意味着 `@Get(':id')` 可能会静默遮蔽在它之后声明的 `@Get('me')`。v12 在 `NestApplicationOptions` 上新增了两个**可选**选项来暴露这类问题：

```typescript
const app = await NestFactory.create(AppModule, {
  routeConflictPolicy: { duplicate: 'error', shadow: 'warn' },
  routeResolutionStrategy: 'specificity',
});
```

两者默认都保持以往的行为，因此除非您显式设置，现有应用程序不会有任何变化。完整描述请参阅[控制器章节](/controllers#路由冲突与解析顺序)。
