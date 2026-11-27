<!-- 此文件从 content/observability/sdk.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:43:15.418Z -->
<!-- 源文件: content/observability/sdk.md -->
<!-- 源哈希: ae28b93b4b28b79d69dde4eca722c25c -->

### SDK

`@nestjs/observe` SDK 会将您应用程序的请求、任务、错误、日志和追踪数据导入到您的 [NestJS Observe](https://www.observe.nestjs.com/ 'NestJS Observe') 仪表板中。它会钩入 Nest 自身的请求生命周期——控制器、拦截器、解析器、队列消费者——而不是将一个通用的 Node.js 代理强行附加到进程上，因此仪表板上显示的大部分内容无需手动配置跨度。

> info **提示** 不确定是否值得设置？[live demo](https://www.observe-demo.nestjs.com/dashboard 'NestJS Observe live demo') 会在不安装任何东西的情况下展示此插桩产生的内容——来自繁忙服务的追踪、瀑布图、错误和任务。

#### 安装

设置 SDK 有两种方法：使用一个命令自动完成，或者手动执行相同的步骤。

**使用一个命令。** 在项目目录中运行以下命令：

```bash
$ npx @nestjs/observe link

```

该命令会打印一个八位字母代码。在 [observe.nestjs.com/link](https://www.observe.nestjs.com/link 'Link a project to NestJS Observe') 输入它（如果没有账户则先注册），然后批准。该命令随后将项目的密钥对写入 `.env` 作为 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET`，将 `.env` 加入 git-ignore，并将 `--env-file .env` 添加到运行 `nest start` 的每个脚本中（在 `nest new` 项目中是 `start`、`start:dev` 和 `start:debug`）。

如果应用程序尚未使用 SDK，该命令还会使用您的包管理器安装 `@nestjs/observe`，并为您执行 [Quick start](#quick-start) 下面的三个编辑操作。在您批准之前，它会通知您。有关具体更改的内容，请参阅 [Linking from the terminal](#linking-from-the-terminal)。

> warning **警告** SDK 要求 `@nestjs/core` v11.1.4 或更高版本（它依赖于该版本中引入的 `instrument` 应用程序选项），如果您的应用程序使用 GraphQL，则要求 `@nestjs/graphql` v13.4.4 或更高版本。早期版本缺少 SDK 所需的钩子。

**手动操作。** 安装 SDK：

```bash
$ npm i @nestjs/observe

```

然后按照 [Quick start](#quick-start) 下面的三个编辑操作进行操作，在您项目的 **API Keys** 页面生成一个 API 密钥（参见 [First project](/observability/overview#第一个项目)），并将密钥对设置为 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET`。当命令没有为您配置连接时，这也是推荐的做法。

#### 快速开始

集成需要三个步骤。首先，调用 `createObserveModule()` 一次，通常在 `app.module.ts` 或其他根级文件中。它返回一个匹配的对——一个 Nest 模块和一个 `instrument` 钩子——绑定到相同的配置：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY!,
      appSecret: process.env.OBSERVE_APP_SECRET!,
      serviceId: 'cats-app',
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

```

其次，将 `ObserveModule.forRoot()` 导入到您的根模块中，至少包含一个 `serviceId`（如上所示）。第三，将 `ObserveInstrument` 传递给 `NestFactory.create()`，以便 SDK 在应用程序开始处理流量之前附加到应用程序上：

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

> warning **Fastify** 使用 `FastifyAdapter`（或任何显式适配器）时，适配器接受第二个参数，因此应用程序选项——以及因此的 `instrument`——移动到**第三个**位置：
>
> ```typescript
> const app = await NestFactory.create<NestFastifyApplication>(
>   AppModule,
>   new FastifyAdapter(),
>   { instrument: ObserveInstrument },
> );
> ```

>
> 将选项对象作为第二个参数与适配器一起传递会静默丢弃它们，SDK 将不会附加。

集成完成。一旦应用程序接收到流量，请求、错误和追踪数据将在几分钟内出现在您项目的仪表板中，无需配置导出器，也无需设计模式。相同的 `instrument` 选项被 `NestFactory.createMicroservice()` 和 `NestFactory.createApplicationContext()` 接受，因此工作进程和独立应用程序以相同的方式进行插桩。

> info **提示** `createObserveModule()` 本身接受一个选项对象，用于控制追踪 ID 的生成方式、错误源上下文的捕获方式以及哪些提供者被插桩——请参阅下文 [Trace correlation](#追踪关联) 和 [Error source context](#错误源代码上下文)。所有其他配置都通过 `ObserveModule.forRoot()` 进行。

#### 配置模块

除了快速开始中的凭据外，这些选项决定了 SDK 如何识别您的应用程序、将记录的内容发送到哪里，以及向您报告自身的信息量。

##### 认证和识别应用程序

```typescript
ObserveModule.forRoot({
  appKey: process.env.OBSERVE_APP_KEY!,
  appSecret: process.env.OBSERVE_APP_SECRET!,
  serviceId: 'cats-app',
});

```

| 选项 | 类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `appKey` | `string` | required | 由 `npx @nestjs/observe link` 写入 `.env` 作为 `OBSERVE_APP_KEY`，或从您项目的 **API Keys** 页面生成——参见 [First project](/observability/overview#第一个项目)。请勿提交到源代码控制。 |
| `appSecret` | `string` | required | 与 `appKey` 一起签发，方式相同，并以 `OBSERVE_APP_SECRET` 形式写入。请勿提交到源代码控制。 |
| `serviceId` | `string` | required | 在您的仪表板中识别此应用程序。如果您运行多个相同服务的实例，请使用每个实例唯一的值（主机名、容器 ID）以便在 Profiler 中区分它们。 |
| `serviceVersion` | `string \| false` | inferred | 识别部署——一个语义版本、一个提交哈希或任何其他标识符，最多 50 个字符。如果未设置，SDK 会在启动时推断（见下文）；`false` 报告无。 |

每个请求和任务都会记录为其服务的发布版本，这支持了 **Releases** 视图：将每个版本与前一个版本进行比较，并提供一个关于变更的 [verdict](/observability/dashboard#releases-and-their-verdicts)。通常您不需要设置 `serviceVersion`。如果未设置，SDK 会在应用程序启动时从以下第一个具有该值的来源推断发布版本：

1. 环境变量中的 **`OBSERVE_SERVICE_VERSION`**，用于希望明确但不修改代码的部署。
2. **您的平台或 CI 在运行时暴露的提交**：Vercel、Render、Railway、Heroku（带 dyno 元数据）、Coolify 和 Dokku，或用于 CI 任务启动应用程序的 GitHub Actions、GitLab CI、Bitbucket Pipelines、CircleCI、Buildkite、Azure Pipelines 和 AWS CodeBuild。`GIT_COMMIT_SHA`、`GIT_COMMIT`、`GIT_SHA`、`COMMIT_SHA` 和 `SOURCE_VERSION` 也会被读取。
3. **进程运行的检出提交**，从仓库的 `.git` 读取。
4. **容器平台为每个部署命名的修订版本**：Cloud Run 的 `K_REVISION`，Azure Container Apps 的 `CONTAINER_APP_REVISION`。

由您自己的管道构建的容器镜像通常不包含这些信息，因为构建排除了 `.git`，并且 CI 变量不会保留到镜像中。在构建时将其传递给它：

```bash
$ docker build --build-arg GIT_SHA=$(git rev-parse HEAD) .

```

在 Dockerfile 中使用 `ARG GIT_SHA` 和 `ENV OBSERVE_SERVICE_VERSION=$GIT_SHA`。您自己传递的 `serviceVersion` 会覆盖以上所有内容。推断的提交会完整报告，因为 `git rev-parse HEAD` 会打印它，而仪表板会缩短显示；这个完整形式也是在解析问题时作为 `fixedInVersion` 应该传递的。

<figure><img src="https://www.observe.nestjs.com/docs/sdk/deployments.webp" alt="Releases" /></figure>

##### 从终端链接

`npx @nestjs/observe link` 在开发人员的机器上放置一个密钥对，而无需将密钥从浏览器复制出来，并在一个尚未使用它的应用程序中设置 SDK。在项目的目录（带有 `package.json` 的目录）中运行它，或使用 `--cwd <dir>` 指向该目录：

1. 它打印一个八位代码，例如 `BCDF-GHJK`，并在您的浏览器中打开 [observe.nestjs.com/link](https://www.observe.nestjs.com/link 'Link a project to NestJS Observe')。使用 `--no-browser`、在 CI 中或没有终端时，它只打印地址。代码在 15 分钟后过期。如果应用程序尚未使用 SDK，该命令还会说明，在代码下方，一旦您批准，它将安装和连接 SDK。
2. 在该页面上输入代码。如果您还没有账户，请先注册；如果已注销，请登录。无论哪种情况，之后都会返回到代码页面。
3. 检查请求：页面会显示机器的主机名以及该命令发送的包名。然后选择密钥的存放位置。页面会建议您的最新项目，在该项目中是按包名命名的应用程序，如果没有则是一个新应用程序。您可以更改两者，包括更改为新项目。
4. 批准。仪表板为该应用程序颁发一个新的 API 密钥，该命令将其写入项目中。

在每个项目中，该命令会更改最多三个文件：

- **`.env`** 接收 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET`，用单引号括起来，替换先前的对，并保持其他所有行不变。会创建一个仅供您阅读的新 `.env`。引号是故意的：密钥或密钥可能包含 `$` 和 `&`，这些内容会被 `dotenv-expand`（或使用 `expandVariables` 的 `ConfigModule`）重写，并且 shell 引用该文件时会停止。
- **`.gitignore`** 会获得一个 `.env` 条目，除非文件已被忽略（如由 `nest new` 生成的项目中那样）。
- **`package.json`**：任何命令以 `nest start` 开头的脚本都会获得 `--env-file .env`：在由 `nest new` 生成的项目中是 `start`、`start:dev` 和 `start:debug`，在 Monorepo 的每个应用程序脚本中也是如此。已经通过 env 文件通过的脚本保持不变，`start:prod`（`node dist/main`）也是如此。启动应用程序的其他脚本（如 `start` 或 `start:dev`）也保持不变，但该命令为其命名，因此您可以自行在其中加载 `.env`（例如，使用 `node --env-file=.env`）。

在尚未使用 SDK 的应用程序中（没有源文件导入 `@nestjs/observe`），该命令也会设置 SDK，方式与 `nest new` 相同：

- **SDK** 安装在命令自身的版本（从 0.3.16 的 `@nestjs/observe@^0.3.16`）上。该命令使用项目锁文件所属的包管理器（pnpm、Yarn、Bun 或 npm），查找到仓库根目录，以便工作空间中的包能找到根锁文件。如果没有锁文件，它使用 `package.json` 中 `packageManager` 字段命名的锁文件，否则使用 npm。如果 `@nestjs/observe` 已安装但版本低于该命令，则以相同方式升级。在这种情况下，请运行 `npx @nestjs/observe@latest link`，因为纯粹的 `npx` 会运行项目中已安装的版本。
- **根模块**，即 `main.ts` 传递给 `NestFactory.create()`（通过跟踪其导入找到）的模块，会获得 `createObserveModule()` 调用，并在其 `imports` 的第一个条目中包含 `ObserveModule.forRoot()`。选项从 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET` 读取密钥对，并将 `serviceId` 设置为您批准的应用程序名称，小写，空格替换为破折号，并删除任何其他标点符号（`Cats API` 变为 `cats-api`）。
- **`main.ts`** 在其选项对象内部或如果没有则作为一个新的选项参数向 `NestFactory.create()` 传递 `instrument: ObserveInstrument`。

编辑遵循每个文件的引号、分号和缩进，并且两个文件要么都更改，要么都不更改。该命令会列出它们，因此您可以使用 `git diff` 进行审查。

在某些项目中，该命令将连接工作留给您并打印原因；[Quick start](#quick-start) 显示需要进行的编辑。它在具有多个应用程序的工作空间中（密钥属于其中一个），在 JavaScript 项目中，以及在无法安全编辑代码的地方执行此操作，例如当 `main.ts` 通过路径别名而不是相对路径导入根模块时，当 `imports` 不是纯数组时，或当已传递 `instrument` 选项时。如果安装失败，该命令会打印安装命令供您自己运行，并将连接工作也留给您。

在要求代码之前，该命令会排除一个需要安装 SDK 但没有 `@nestjs/core` 的项目，或运行低于 11 的 NestJS 版本。

直到密钥到达之前，不会写入任何内容，因此被拒绝、过期或中断的链接不会改变项目。

> 警告 **警告** 只批准您自己启动的代码，并且仅当它与您的终端匹配时。代码是输入而不是通过 URL 携带的，这样就没有人可以发送一个批准他们密钥的链接给您。

密钥会像其他任何密钥一样出现在项目的 **API 密钥** 页面上，命名为 `CLI`，后跟颁发时间，有效期为一年；要获取新密钥，请再次运行该命令。`.env` 保留在运行该命令的机器上，因此每位队友（或每台附加机器）也需要运行 `npx @nestjs/observe link` 并为同一应用程序获取自己的密钥。

##### 从环境变量读取密钥对

当 `appKey` 或 `appSecret` 未设置或为空，或者仍包含 `nest new` 生成的占位符（`'YOUR_APP_KEY'` 和 `'YOUR_APP_SECRET'`）时，`ObserveModule` 会从环境变量中读取 `OBSERVE_APP_KEY` 或 `OBSERVE_APP_SECRET`。这使得使用 Observe 生成的项目能够在不更改 `AppModule` 的情况下报告已链接。您自己提供的值始终优先，相同的后备逻辑也适用于 `forRootAsync()` 解析的选项。

当解析选项时读取这些变量（对于 `forRoot()`，当导入 `AppModule` 文件时），因此它们在该点必须已存在于 `process.env` 中。`--env-file` 标志在任何模块运行之前加载它们。

在生产环境中，请在环境变量（您平台的密钥或环境设置）中设置 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET`，而不是分发 `.env`。由 `nest new` 生成的项目运行 `node dist/main` 以 `start:prod`，它无论如何都不会加载 `.env`，并且 `nest start` 会跳过不存在的 `--env-file`，因此在没有 `.env` 的情况下进行全新克隆或 CI 运行仍然可以启动。请为生产环境设置项目 **API 密钥** 页面上的独立密钥，这样撤销开发密钥永远不会阻止其报告。

> info **提示** `link` 命令和环境变量后备需要 `@nestjs/observe` 0.3.15 或更高版本。将 SDK 安装并集成到尚未使用的应用程序中需要 0.3.16 或更高版本。

##### 在生产环境之外关闭 SDK

为防止环境报告（例如本地开发、CI 运行），请保持 `ObserveModule` 已导入，并使用 `enabled` 关闭它，而不是传递虚假凭证（这些凭证会被发送并被拒绝）：

```typescript
ObserveModule.forRoot({
  enabled: process.env.NODE_ENV === 'production',
  appKey: process.env.OBSERVE_APP_KEY ?? '',
  appSecret: process.env.OBSERVE_APP_SECRET ?? '',
  serviceId: 'cats-app',
});

```

`enabled: false` 不记录也不发送任何内容——没有跟踪、运行时指标或日志，也没有向任何收集器发送请求——并且不需要凭证。该模块保持存在，因此仍可以注入 `TracerService` 并且调用它是无害的。将凭证设置为空也什么都不发送，但会在每次启动时记录警告，因为在生产环境中这通常意味着环境变量从未到达进程。`enabled` 需要 `@nestjs/observe` 0.3.13 或更高版本。

##### 异步配置

当凭证来自配置提供者而不是直接来自 `process.env` 时，请使用 `forRootAsync()`。它接受与所有其他 Nest 动态模块相同的 `useFactory`/`inject`、`useClass` 和 `useExisting` 形状（一个类使用 `createObserveOptions()` 方法实现 `ObserveOptionsFactory`），此外还支持 `extraProviders` 和 `global`：

```typescript title="app.module.ts"
ObserveModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    appKey: config.getOrThrow('OBSERVE_APP_KEY'),
    appSecret: config.getOrThrow('OBSERVE_APP_SECRET'),
    serviceId: config.get('SERVICE_ID', 'cats-app'),
    serviceVersion: config.get('GIT_SHA'),
  }),
});

```

##### 收集器端点

```typescript
ObserveModule.forRoot({
  // ...
  endpoint: 'https://observe-api.nestjs.com',
});

```

`endpoint`（默认 `'https://observe-api.nestjs.com'`）是收集器的基础 URL。遥测和配置文件共享它，因此两者绝不能指向不同的位置。若不修改配置即可覆盖它，请设置 `OBSERVE_ENDPOINT` 环境变量。NestJS Observe 是一个托管服务，`observe-api.nestjs.com` 是它运行的唯一收集器；当您的流量必须通过转发代理离开时，或要将测试环境指向接受批次的存根时，请更改端点。

##### 调试 SDK 本身

```typescript
ObserveModule.forRoot({
  // ...
  debug: true,
});

```

`debug`（默认 `false`）将 SDK 的附加诊断信息记录到控制台。在使仪器工作时使用它，并在生产环境中关闭它。

##### 关闭

当应用程序关闭时——`app.close()`，或调用 `app.enableShutdownHooks()` 后的 `SIGTERM`——SDK 会在停止前发送其仍持有的内容：自上次批次以来完成的请求和任务、它们的错误、在关闭开始前缓冲的日志行以及最后一个运行时样本。它最多等待 `shutdownFlushTimeout`（默认 `2000` ms）以等待收集器，然后允许应用程序退出；`0` 会跳过最终发送。

决定哪些内容被包含的因素有两个：

- **信号。** 只有当应用程序在引导时调用了 `app.enableShutdownHooks()` 时，Nest 才会对 `SIGTERM` 运行关闭钩子。如果没有它，部署或缩减会立即终止进程，导致最后几秒的遥测丢失。
- **模块顺序。** 全局模块按导入的相反顺序关闭。在关闭时仍在运行的任务只有在 `ObserveModule` 在 `BullModule` 之前，并且在根模块的 `imports` 中任何注册队列的模块之前时才会被报告。

在使用真实凭证启动应用程序的测试套件中，设置 `shutdownFlushTimeout: 0`，这样每个 `app.close()` 不会将该测试的请求发送到您的项目或等待测试环境无法到达的收集器。最终发送需要 `@nestjs/observe` 0.3.10 或更高版本。

#### 自动仪器化

本节中的所有内容都无需您编写任何代码即可记录；安装 SDK 就足够了。选项仅用于缩小范围或关闭它。

##### 数据库查询和出站 HTTP

自 `@nestjs/observe` 0.3.0 起，数据库查询和出站请求作为跨度出现，无需配置，嵌套在发起它们的方法之下。慢速的仓储调用会显示它正在等待哪个语句。

<figure><img src="https://www.observe.nestjs.com/docs/telemetry/sql.webp" alt="A query opened in the waterfall" /></figure>

数据库是在驱动程序级别而不是 ORM 级别进行仪器化的：如果您的应用程序已依赖它们，则会检测到 `pg`、`mysql2`、`mssql` 和 `mongodb`，这涵盖了 TypeORM、MikroORM、Drizzle、Mongoose、Knex、Sequelize 和 Prisma 的驱动程序适配器，而无需提及任何名称。SQL Server 是例外：TypeORM 和 Prisma 的 SQL Server 适配器运行在 `mssql` 上，但 Knex、Sequelize 和 MikroORM 是通过 `tedious` 直接与 SQL Server 通信，这尚未覆盖（`mssql/msnodesqlv8` 也是如此）。如果 ORM 捆绑了驱动程序的嵌套副本（MikroORM 和 Mongoose 会这样做，当版本不一致时），也会被处理。驱动程序自身的维护工作（连接握手、认证、ping）不会被记录。查询跨度会标记其动词和表（`SELECT users`），并携带的语句会**移除所有字面量**——字符串、数字、`IN (...)` 列表和注释在跨度离开进程前被替换，并且根本不会读取绑定参数。在单个父级下的重复查询会折叠成一个带有计数的单个节点，因此 N+1 读取显示为 `SELECT order_items ×47` 而不是 47 行。

其他客户端，包括 Redis 和 Kafka，不是在库级别进行仪器化的。Nest 应用程序几乎总是将它们注册为提供者，但是——来自工厂的 `ioredis` 客户端，来自 `ClientsModule` 的 `ClientKafka`——SDK 会记录每个提供者的方法调用：对客户端的每次调用都是发起该调用的方法的子跨度，并且对于返回 Promise 的调用，像 `ioredis` 命令那样，会计时直到其稳定。在依赖注入外部创建和调用的客户端不会被记录。

出站 HTTP 从 Node 自身的诊断通道读取，因此 `fetch`、`undici` 以及基于 `node:http` 的所有内容（axios、got、大多数 SDK）都已覆盖，无需打补丁。该跨度标记为 `GET api.example.com`，并携带带有敏感查询参数被屏蔽的 URL。SDK 还将当前的 trace id 作为 `x-request-id` 发送，这使得 [HTTP-to-HTTP tracing](/observability/distributed-tracing#http-to-http) 自动化。启用 [`openTelemetry`](/observability/opentelemetry#running-beside-opentelemetry) 选项时，它还会发送 W3C `traceparent`：`http.traceContext: false` 保持该标头关闭，而 `propagateTraceId` 决定两个标头去向。

```typescript
ObserveModule.forRoot({
  // ...
  outgoing: {
    database: true,
    http: {
      ignore: (url) => url.startsWith('https://internal-metrics.'),
      // Only forward the trace id to your own services
      propagateTraceId: (url) => url.includes('.svc.cluster.local'),
    },
  },
});

```

设置 `outgoing: false` 以完全关闭所有功能，或单独设置 `database: false` / `http: false`。

> info **提示** 这些跨度**不计费**。它们是您已发送的方法跨度的详细信息，因此不计入您的可观测性事件或速率限制。执行十个查询的请求与以前的成本相同。

##### 模型调用

自 `@nestjs/observe` 0.3.20 起，到模型提供者的 `fetch` 也记录了其出站跨度上使用的信息：提供者响应中声明的模型、输入、输出和缓存的输入令牌，以及对于流，到第一个事件的时间。OpenAI、Azure OpenAI、Anthropic、Google Gemini 和 Vertex AI、Amazon Bedrock、Mistral、Groq、OpenRouter、Together AI、DeepSeek、xAI、Cohere 和 Perplexity 都通过主机被识别，因此官方 SDK、Vercel AI SDK 和 LangChain 均被覆盖，无需单独命名。

- **在响应通过时读取。** SDK 以代码的节奏读取响应，包括流，并保持不变地传递。您的代码取消的流也会在提供者端被取消。
- **永远不发送提示和补全。** 只有模型和令牌计数会离开进程。
- **仅限 `fetch`。** 通过 `node:http` - axios 或 AWS SDK 的 Bedrock 默认客户端发出的调用会保留其普通的出站跨度，不包含模型或令牌信息。

在提供者（LiteLLM、Portkey、您自己的代理）前设置的网关或具有 OpenAI 兼容 API 的自托管模型会通过主机添加，其调用会标记提供者 `custom`。`outgoing: { llm: false }` 会停止读取模型调用，同时保留其纯净的跨度：

```typescript
ObserveModule.forRoot({
  // ...
  outgoing: {
    llm: { hosts: ['llm-gateway.internal:4000'] },
  },
});

```

[production rule](/observability/production-rules) 可以限制一个请求发出的模型调用的数量。

##### WebSocket 网关

由 `@SubscribeMessage()` 处理的消息在任何平台适配器上都会报告为具有 `ws` 协议和操作 ID `GatewayClass:pattern` 的请求。`ws` 选项块与其它传输方式具有相同的 `ignore`、`tags`、`setAttributes` 和 `getUserId` 钩子；每个都会接收到 `{ gateway, pattern, client, data }`。连接和断开连接不是操作，因此不会被报告。

##### 队列

`@nestjs/bullmq` 和原始的 `@nestjs/bull` 都经过了仪器化：每次处理器运行都会报告为一个任务，包括其队列等待时间、尝试次数和结果。从跟踪操作内部添加的任务会继承该操作的 trace id - 参见 [Distributed tracing](/observability/distributed-tracing#queue-jobs-bullmq-and-bull)。

##### 运行时指标和性能分析

```typescript
ObserveModule.forRoot({
  // ...
  runtimeMetrics: true,
  runtimeMetricsInterval: 60000,
});

```

`runtimeMetrics`（默认 `true`）以间隔（`runtimeMetricsInterval`，默认 `60000` ms）对内存、CPU、垃圾回收和事件循环延迟进行采样，并将数据馈送到 **Profiler**。相同的样本也作为应用程序的心跳：当它们停止到达时，会触发 **Telemetry silence** 警报，从而无需外部探针即可获得轻量级的正常运行时间监控。

#### 错误和失败的请求

从控制器、解析器或任务中逃逸的错误会自动捕获。这些选项决定了随之携带的内容：失败帧周围的源代码，以及失败请求的头部和主体。

##### 错误源上下文

从控制器、解析器、任务或跨度传播出的错误会自动捕获。当启用 `sourceContext`（默认设置）时，SDK 还会读取捕获的错误中每个应用内堆栈帧周围的源代码行并附加它们。这使得仪表板能够在您未检出的构建上的生产故障时，也能够将失败代码与堆栈跟踪一起显示出来。

```typescript title="app.module.ts"
export const { ObserveModule, ObserveInstrument } = createObserveModule({
  sourceContext: {
    linesOfContext: 5,
    maxFrames: 5,
    sourceMaps: false,
  },
});

```

这是 `createObserveModule()` 的一个选项，而不是 `forRoot()`。设置 `sourceContext: false` 来禁用它，或者传入一个对象来调整默认值：

| 选项 | 类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `linesOfContext` | `number` | `5` | 帧行两侧读取的行数。 |
| `maxFrames` | `number` | `5` | 从堆栈顶部开始，附带源代码的应用内帧数量。限制深堆栈的负载。 |
| `sourceMaps` | `boolean` | `false` | 在读取源代码之前，通过源代码映射解析编译后的帧。仅在进程运行编译输出且不使用 Node 自身的源代码映射支持（`--enable-source-maps` 或 `process.setSourceMapsEnabled(true)`）时需要；如果启用了该支持，帧已携带原始位置，此选项冗余。首次触及时对每个编译文件产生一次映射解析成本，之后会缓存。 |

> warning **警告** 启用此选项会将应用程序源代码的片段（通常是错误周围的几行）发送到您的仪表板，并在那里与错误一起存储。`node_modules` 和 Node 内部的帧永远不会被读取，只读取应用程序源代码。如果发送任何源代码不被您的代码库接受，请将其关闭。

<figure><img src="https://www.observe.nestjs.com/docs/telemetry/error-with-source.webp" alt="Error card with source context" /></figure>

##### 捕获失败和慢速请求

当一个 HTTP **请求** **失败** 时，SDK 会记录一个小的、固定的白名单其头部信息——`user-agent`, `content-type`, `content-length`, `accept`, `host`, `origin` 和 `referer`。这些信息中没有用于认证或识别调用者。如果您设置了 `slowerThanMs`，运行时间至少达到该时长的请求都会以相同方式被捕获，无论是否失败。普通请求不记录任何信息。**请求** 主体默认是**关闭**的；如果您需要，请明确开启它们：

```typescript
ObserveModule.forRoot({
  // ...
  http: {
    capture: {
      headers: ['user-agent', 'x-tenant-id'],
      body: { maxBytes: 4096 }, // default 2048, at most 16384
      slowerThanMs: 2000,
    },
  },
});

```

所有被捕获的内容在离开进程前都会经过 [`redaction`](/observability/sdk#logs)：敏感密钥（`password`, `token`, `authorization`, ...）会在主体内按名称进行掩码处理，而命名敏感头部会记录 `[REDACTED]` 而不是其值。`capture: false` 不记录任何信息。捕获信息在**请求** 的详情页面显示为一个**请求** 卡片。

#### 日志和追踪关联

每次执行都会获得一个追踪 ID。这些选项决定了您的日志行如何与其关联：转发到仪表板，或者仅用 ID 标记，以便您自己的日志堆栈可以链接到追踪。

##### 日志

```typescript
ObserveModule.forRoot({
  // ...
  forwardLogs: true,
  redaction: {
    enabled: true,
    keys: ['internalToken'],
    patterns: [/acct_[a-z0-9]{16}/gi],
  },
});

```

`forwardLogs` (默认 `false`) 将您应用程序的日志行（通过 Nest 的 `Logger` 写入的任何内容）发送到仪表板，并与写入每行日志时活动的追踪相关联。在执行页面上，每行日志都会放置在追踪的时钟上，紧邻写入时正在运行的跨度。日志转发在 Pro 及以上版本可用。

转发日志会将它们移动到您无法控制的基础设施上，因此默认启用了脱敏。相同的脱敏处理也会清除每个被捕获的错误和任何被捕获的请求数据（无论 `forwardLogs` 是否开启）的消息和堆栈：

| `redaction` 字段 | 类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `enabled` | `boolean` | `true` | 是否进行任何脱敏处理。 |
| `useDefaultPatterns` | `boolean` | `true` | 应用内置模式：bearer token、JWT、AWS key id、PEM 私钥、URL 中的密码（`scheme://user:password@host`）、`key=value` 密钥和 Luhn 有效的卡号。仅在您用自己的 `patterns` 完全替换它们时禁用；没有支持的场景可以不脱敏转发日志。 |
| `patterns` | `RegExp[]` | - | 额外的掩码模式，用于仅您的代码库知道形状的密钥（内部 token 前缀、客户标识符）。始终按全局应用，因此匹配不会限制在一行中的首次出现。 |
| `keys` | `string[]` | - | 额外被完全掩码的密钥（在日志属性、捕获的头部和主体以及 URL 查询字符串中），在内置列表之上。不区分大小写，并忽略 `-`/`_`，因此 `apiKey`, `api_key` 和 `API-KEY` 是一个条目。 |
| `replacement` | `string` | `'[REDACTED]'` | 替换匹配到的任何内容的文本。 |

> info **提示** 即使关闭了 `forwardLogs`，SDK 也会增强 `ConsoleLogger`，使在追踪执行内部写入的每行日志都带有其追踪 ID（`attachTraceIdToLogs`，参见 [Trace correlation](#追踪关联)）。这样您就可以在不向任何地方发送日志内容的情况下，将您自己的日志聚合器与仪表板中的追踪关联起来。

##### 追踪关联

这些也是 `createObserveModule()` 的选项。它们决定了请求如何获得追踪 ID，以及该 ID 如何显示在您自己的日志中：

```typescript title="app.module.ts"
import { randomUUID } from 'node:crypto';

export const { ObserveModule, ObserveInstrument } = createObserveModule({
  traceIdKey: 'traceId',
  traceIdGenerator: (req: any) => req.headers['x-request-id'] ?? randomUUID(),
  attachTraceIdToLogs: true,
});

```

| 选项 | 类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `traceIdKey` | `string` | `'traceId'` | 用于在请求上下文中存储追踪 ID 的键，以便通过 `TracerService` 稍后检索。 |
| `traceIdGenerator` | `(req: unknown) => string` | 如果存在则采用格式良好的 `x-request-id`（HTTP 头部或微服务数据包元数据），否则为 UUID v7 | 为每个请求生成追踪 ID。对于 HTTP 调用时使用请求对象；对于其他协议时接收传输上下文。 |
| `attachTraceIdToLogs` | `boolean` | `true` | 增强 `ConsoleLogger` 以在日志消息中包含追踪 ID，因此即使没有 `forwardLogs` 也可以将日志与追踪关联起来。在默认文本格式中，ID 位于消息之后（`   Trace ID: <id>`）的行尾；使用 [JSON logging](/application/logger#json-logging) 时，它是一个 `traceId` 字段。在追踪执行外部写入的行保持不变。 |

由于默认生成器采用传入的 `x-request-id`，已经共享一个追踪的 HTTP 服务链无需额外配置即可关联。使用 OpenTelemetry 仪器化的服务则在 `traceparent` 中传递追踪信息，`forRoot()` 的 `openTelemetry` 选项会读取并发送它——参见 [Running beside OpenTelemetry](/observability/opentelemetry#running-beside-opentelemetry)。微服务传输也适用：在 `@nestjs/microservices` 12.0.4 或更高版本上的 TCP 和 Redis，以及在 12.3.3 或更高版本上的 NATS、Kafka、RabbitMQ、MQTT 5 和 gRPC。跨早期版本和 GraphQL 传播需要几行代码——参见 [Distributed tracing](/observability/distributed-tracing)。

#### 塑造记录内容

这些选项丰富了 SDK 记录的内容（请求是为谁服务的、涉及什么）并排除不需要的内容。

##### 将用户与遥测关联

`getUserId` 读取传入的 **请求** 并返回您的系统用于表示个人的任何标识符：用户 id、账户 id 或租户作用域 id。设置一次后，**Users** 视图会自动填充：

```typescript
ObserveModule.forRoot({
  // ...
  http: {
    getUserId: (req) => req.user?.id ?? 'anonymous',
  },
});

```

相同的选项存在于 `rpc`（接收传输 id 和 `BaseRpcContext`）、`grpc`（接收调用对象）、`graphql`（接收 GraphQL **请求** 上下文，适用于没有包含 HTTP **请求** 的操作）和 `ws`（接收 **网关** 消息）上，每个都读取传输自身的上下文而不是 HTTP **请求**。报告用户标识符是可选的：没有该标识符的流量在除每个用户视图外的所有地方都会显示。仪表板将该标识符视为不透明字符串，绝不会尝试将其解析为名称或电子邮件，因此请优先使用不透明的内部 id 而非任何个人身份信息。

##### 标签和自定义属性

`http`、`rpc`、`grpc`、`graphql` 和 `jobs` 都接受相同的两个选项，用于将您自己的数据附加到它们所覆盖的每个 **请求**：

| 选项 | 适用范围 | 描述 |
| :--- | :--- | :--- |
| `tags` | 将相同的静态 `Record<string, string>` 发送到每个 **请求** | 发送到 Observe。适用于不随每次调用变化的常量，例如 `project`、`env`、`region`。 |
| `setAttributes` | 一个 **请求**/**调用**/**任务** 的函数，返回键值对 | 保存在您的应用程序中。用于您的代码稍后读取的每次调用上下文，例如租户 id、功能标志。 |

```typescript
ObserveModule.forRoot({
  // ...
  http: {
    tags: { project: 'cats-app', env: process.env.NODE_ENV ?? 'development' },
    setAttributes: (req) => ({ tenantId: req.headers['x-tenant-id'] }),
  },
  jobs: {
    setAttributes: (job) => ({ queueName: job.queueName, jobName: job.name }),
  },
});

```

`tags` 显示为结果 **请求** 或任务上的标签，并且可以在其详情页面中搜索和查看。

`setAttributes` 值**不会发送到 Observe**，也不会出现在仪表板中。每当调用开始时，它们都会写入其 [request-scoped attributes](/observability/manual-instrumentation#request-scoped-attributes)，这与您为每个键调用 `setAttribute()` 相同，因此处理该调用的任何代码都可以使用 `getAttribute()` 读取它们。该函数接收传输拥有的任何内容：对于 `http` 的 **请求**、对于 `rpc` 的传输 id 和 `BaseRpcContext`、对于 `grpc` 的调用对象、对于 `graphql` 的解析信息和 GraphQL 上下文，以及对于 `jobs` 的 `{ queueName, name, id }`。

键名如 `traceIdKey`，或类似 SDK 自身 `#` 前缀的键，将被忽略并发出警告，因此 **请求** 不能选择自己的追踪 id。

要在仪表板中查看每次调用的值，请将其作为标签添加到具有 `TracerService` 的跨度上（参见 [Manual instrumentation](/observability/manual-instrumentation)）：

```typescript
const span = await this.tracerService.activeSpan();
span.addTags({ tenantId: String(this.tracerService.getAttribute('tenantId')) });

```

> info **提示** GraphQL 服务器通常是一个 HTTP 端点，因此其 **请求** 已经受 `http` 选项的约束：`http.ignore` 在 GraphQL 层看到 **请求** 之前将其丢弃，而 `http.getUserId` 为通过 HTTP 的 **查询** 提供用户。`graphql` 块调整了允许通过的 **请求** **内部** 发生什么（按操作而非按解析器），而 `graphql.getUserId` 仅在操作不在 HTTP 追踪内部时才被查询，例如通过 WebSocket 的订阅。

##### 忽略噪音操作

每个传入的传输块（`http`、`rpc`、`grpc`、`graphql` 和 `ws`）都有一个 `ignore` 选项，可以跳过匹配调用的完全仪器化，例如健康检查端点、内部探测或任何不值得追踪的内容：

```typescript
ObserveModule.forRoot({
  // ...
  http: {
    ignore: ['/health', { method: 'GET', path: /^\/internal\// }],
  },
  rpc: {
    ignore: (transportId, ctx) =>
      ctx instanceof TcpContext && ctx.getPattern() === 'ping',
  },
  grpc: {
    ignore: (call) => call.path.endsWith('/Health/Check'),
  },
  graphql: {
    ignore: (info) => info.fieldName === 'healthcheck',
  },
});

```

`http.ignore` 接受一个路径数组、`{ method, path }` 对（`path` 可以是字符串或 `RegExp`）以及纯 `RegExp` 或一个针对 **请求** 的单个谓词函数。`rpc.ignore`、`grpc.ignore` 和 `graphql.ignore` 是针对传输自身上下文的谓词（分别为 `@nestjs/microservices` 传输 id 和 `BaseRpcContext`、gRPC 调用对象和 GraphQL 解析信息）。匹配 GraphQL 字段名会跳过该字段所导出的整个操作，而不仅仅是该字段：操作是端到端衡量的，因此要么被追踪，要么不被追踪。

`ignore` 阻止遥测生成。仪表板的成本控制丢弃过滤器是不同的工具：它们在摄取时丢弃已生成的事件以减少计费量。当您不希望存在追踪时，请使用 `ignore`；当您希望调整 SDK 已经产生的数据的成本时，请使用丢弃过滤器。

`http` 额外接受 `queryParamsObfuscateRegex`，一个 `RegExp`，在发送前屏蔽敏感查询字符串值。它应用于内置的重写之上，内置重写始终屏蔽众所周知的敏感参数（`token`、`password`、`code`、`signature` 等）。

##### 追踪采样和批处理

```typescript
ObserveModule.forRoot({
  // ...
  tracesSampleRate: 0.25,
  maxTracesPerBatch: 1000,
  flushInterval: 5000,
});

```

| 选项 | 类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `tracesSampleRate` | `number \| ((protocol: 'http' \| 'rpc' \| 'grpc' \| 'graphql' \| 'ws', attributes) => boolean)` | `1.0` | 发送追踪的比例，或用于每次追踪决策的谓词。`0` 算作未设置并发送所有内容；传入 `() => false` 发送 none。`1.0` 发送所有内容；`0.1` 发送 10%。 |
| `maxTracesPerBatch` | `number` | `1000` | 限制每个批次发送的追踪数量，以限制高流量应用程序的量。 |
| `flushInterval` | `number` (ms) | `5000` | SDK 批处理和发送收集到的追踪的频率。 |

遥测数据在进程中缓冲，并在刷新间隔而不是与每个请求一起发送。这里的采样决定了 SDK _产生_什么。仪表板的每个项目花费控制（跨度采样、速率限制、丢弃过滤器）作用于已发送的数据，并且可以在不重新部署的情况下更改它们。

#### 在代码中声明目标

`@Objective()` 说明了路由承诺给处理器的内容，而 Observe 将每个承诺转换为一个 [SLO](/observability/dashboard#slos)。该目标与它所覆盖的路由一起，在同一变更中被编写、审查和版本控制：

```typescript
import { Objective } from '@nestjs/observe';

@Controller('orders')
export class OrdersController {
  @Post()
  @Objective({ availability: 99.9, latency: { underMs: 300, target: 99 } })
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }
}

```

| 选项 | 承诺的内容 |
| :--- | :--- |
| `availability` | 这种比例的请求不会因未处理的错误而失败 - 达到三个九（three nines）的 `99.9`。 |
| `latency` | `{ underMs, target }`：`target` 百分比的请求在 `underMs` 毫秒内完成。 |
| `windowDays` | 评估的滚动窗口：7、14、28（默认）或 30 天。 |
| `name` | 仪表板调用的名称，而不是路由和承诺。 |

目标范围从 90 到 99.999，一个处理器最多可以携带十个 `@Objective()`；超出这些范围的任何内容都会在应用程序启动时被记录并忽略。每个承诺成为其自身的 SLO，作用域限定于应用程序和处理程序服务的路由，并且在路由有流量后才会显示。从那时起，代码负责：更改目标、窗口或名称并部署，相同的 SLO 也会移动。仪表板标记的是**代码中**声明的 SLO，不会编辑它，并且在装饰器存在期间，在仪表板中删除它不会生效，因为 SDK 每小时都会重述每个路由的目标。要退役一个 SLO，请移除装饰器，然后删除 SLO。SLO 需要有包含它们的计划（Scale 或 Enterprise）；在任何其他计划上，声明会被发送但被忽略。

#### 完整配置参考

所有选项一览。在 `createObserveModule()` 下列出的选项必须在那里设置；其余所有内容都应放入 `forRoot()`/`forRootAsync()`。

| 位置 | 选项 | 目的 |
| :--- | :--- | :--- |
| `createObserveModule()` | `sourceContext` | 将源行附加到错误堆栈帧 |
| `createObserveModule()` | `traceIdKey` | 存储追踪 ID 的上下文键 |
| `createObserveModule()` | `traceIdGenerator` | 每个请求如何获取其追踪 ID |
| `createObserveModule()` | `attachTraceIdToLogs` | 将追踪 ID 添加到 `ConsoleLogger` 输出中 |
| `createObserveModule()` | `skipInstrumentation` | 排除提供者实例进行插值的谓词 |
| `forRoot()` | `appKey`, `appSecret` | 项目 API 密钥对（或 `OBSERVE_APP_KEY`, `OBSERVE_APP_SECRET`） |
| `forRoot()` | `endpoint` | 收集器基础 URL（或 `OBSERVE_ENDPOINT`） |
| `forRoot()` | `enabled` | `false` 记录并发送无内容，适用于开发和 CI |
| `forRoot()` | `serviceId`, `serviceVersion` | 应用程序和发布身份（未设置时推断发布） |
| `forRoot()` | `http`, `rpc`, `grpc`, `graphql` | 每个传输的 `tags`, `setAttributes`, `getUserId`, `ignore` |
| `forRoot()` | `jobs` | 队列和定时任务的 `tags` 和 `setAttributes` |
| `forRoot()` | `http.queryParamsObfuscateRegex` | 屏蔽敏感查询字符串值 |
| `forRoot()` | `http.capture` | 记录失败和慢速请求的头部（以及可选的请求体） |
| `forRoot()` | `outgoing` | 数据库查询和出站 HTTP 跨度；模型调用的 `outgoing.llm` |
| `forRoot()` | `openTelemetry` | W3C `traceparent` 的进出，旁边是 OpenTelemetry SDK |
| `forRoot()` | `otlp` | 通过 OTLP 将跨度导出到您的 OpenTelemetry 后端 |
| `forRoot()` | `ws` | WebSocket 网关的 `tags`, `setAttributes`, `getUserId`, `ignore` |
| `forRoot()` | `runtimeMetrics`, `runtimeMetricsInterval` | 分析器采样和心跳 |
| `forRoot()` | `forwardLogs`, `redaction` | 日志流式传输和清洗 |
| `forRoot()` | `tracesSampleRate` | 要发送的追踪的比例（或谓词） |
| `forRoot()` | `maxTracesPerBatch`, `flushInterval` | 批处理 |
| `forRoot()` | `spanCollapse` | 压缩重复的兄弟跨度（默认阈值 `20`，保留最慢的 `3`） |
| `forRoot()` | `shutdownFlushTimeout` | 关闭应用程序等待最终发送的时间（默认 `2000` 毫秒） |
| `forRoot()` | `debug` | SDK 诊断 |

#### 下一步去哪里

- [Manual instrumentation](/observability/manual-instrumentation) - 添加自己的跨度，捕获已处理的错误，附加请求作用域的属性，并报告自定义指标。
- [Distributed tracing](/observability/distributed-tracing) - 在 HTTP、gRPC、微服务传输器和 GraphQL 之间保持一个追踪。
- [Dashboard](/observability/dashboard) - SDK 运行时显示的内容，以及视图之间的关系。