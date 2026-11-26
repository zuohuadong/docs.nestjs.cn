<!-- 此文件从 content/faq/serverless.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T23:13:19.263Z -->
<!-- 源文件: content/faq/serverless.md -->
<!-- 源哈希: 025c8f244575a64f3c4b2b2336935d00 -->

### Serverless

Serverless 计算是一种云计算执行模型，其中云提供者根据需求分配机器资源，并代表其客户管理服务器。当应用程序未使用时，不会为其分配任何计算资源。定价基于应用程序实际消耗的资源量（[source](https://en.wikipedia.org/wiki/Serverless_computing)）。

使用**serverless 架构**时，您专注于应用程序代码中的单个函数。AWS Lambda、Google Cloud Functions 和 Microsoft Azure Functions 等服务负责管理物理硬件、虚拟机操作系统和 Web 服务器软件。

> info **提示** 本章不涵盖 serverless 函数的优缺点，也不深入探讨任何云提供者的具体细节。

#### 冷启动

冷启动是指您的代码在一段时间后首次运行时发生的情况。根据您的云提供者，这可能涉及多个操作，从下载代码和引导运行时到运行您的代码。
这个过程会带来**显著的延迟**，具体取决于语言和应用程序所需的包数量等多个因素。

其中一些因素超出了您的控制范围，但您仍然可以在自身方面做很多事情来尽可能缩短冷启动时间。

虽然 Nest 是一个专为复杂企业应用程序设计的成熟框架，但它也**适用于“更简单”的应用程序**（或脚本）。例如，使用 [standalone applications](/standalone-applications) 功能，您可以在简单的工作进程、CRON 任务、CLI 或 serverless 函数中使用 Nest 的依赖注入系统。

#### 基准测试

为了更好地了解在 serverless 函数中使用 Nest 或其他知名库（如 `express`）的成本，让我们比较 Node.js 运行时运行以下脚本所需的时间：

```typescript
// #1 Express
import express from 'express';

async function bootstrap() {
  const app = express();
  app.get('/', (req, res) => res.send('Hello world!'));
  await new Promise<void>((resolve) => app.listen(3000, resolve));
}
await bootstrap();

// #2 Nest (with @nestjs/platform-express)
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

// #3 Nest as a Standalone application (no HTTP server)
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AppService } from './app.service.js';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  console.log(app.get(AppService).getHello());
}
await bootstrap();

// #4 Raw Node.js script
async function bootstrap() {
  console.log('Hello world!');
}
await bootstrap();

```

对于所有这些脚本，我们使用了 `tsc` (TypeScript) 编译器，因此代码保持未打包（未使用 `webpack`）。

| | |
| :--- | :--- |
| Express | 0.0079s (7.9ms) |
| Nest with `@nestjs/platform-express` | 0.1974s (197.4ms) |
| Nest (独立应用程序) | 0.1117s (111.7ms) |
| 原生 Node.js 脚本 | 0.0071s (7.1ms) |

> info **注意** 机器：MacBook Pro Mid 2014，2.5 GHz 四核 Intel Core i7，16 GB 1600 MHz DDR3，SSD。

现在，我们重复所有基准测试，这次使用 `webpack` 将应用程序打包成单个可执行 JavaScript 文件（如果您安装了 [Nest CLI](/cli/overview)，请运行 `nest build --webpack`）。
我们不使用 Nest CLI 附带的默认 `webpack` 配置，而是将所有依赖项（`node_modules`）一起打包，如下所示：

```javascript
module.exports = (options, webpack) => {
  const lazyImports = [
    '@nestjs/microservices',
    '@nestjs/microservices/microservices-module',
    '@nestjs/microservices/microservices-module.js',
    '@nestjs/websockets/socket-module',
    '@nestjs/websockets/socket-module.js',
    'class-validator',
    'class-transformer',
    'class-transformer/storage',
  ];

  return {
    ...options,
    externals: [],
    plugins: [
      ...options.plugins,
      new webpack.IgnorePlugin({
        checkResource(resource) {
          if (lazyImports.includes(resource)) {
            try {
              require.resolve(resource);
            } catch (err) {
              return true;
            }
          }
          return false;
        },
      }),
    ],
  };
};

```

> info **提示** 要使 Nest CLI 使用此配置，请在项目的根目录中创建一个 `webpack.config.js` 文件。

使用此配置，我们得到了以下结果：

| | |
| :--- | :--- |
| Express | 0.0068s (6.8ms) |
| Nest with `@nestjs/platform-express` | 0.0815s (81.5ms) |
| Nest (独立应用程序) | 0.0319s (31.9ms) |
| 原生 Node.js 脚本 | 0.0066s (6.6ms) |

> info **注意** 机器：MacBook Pro Mid 2014，2.5 GHz 四核 Intel Core i7，16 GB 1600 MHz DDR3，SSD。

> info **提示** 您还可以使用额外的代码最小化和优化技术（例如使用 `webpack` 插件）进行进一步优化。

您编译代码的方式（以及是否打包）对整体启动时间有显著影响。使用 `webpack`，您可以将独立 Nest 应用程序（一个包含一个模块、一个控制器和服务的基础项目）的引导时间平均缩短到约 32ms，对于常规基于 Express 的 NestJS 应用程序，缩短到约 81.5ms。

对于更复杂的 Nest 应用程序，例如使用 `$ nest g resource` 模式生成的包含 10 个资源的应用程序（10 个模块、10 个控制器、10 个服务、20 个 DTO 类和 50 个 HTTP 端点，外加 `AppModule`），在同一台机器上的整体启动时间约为 0.1298s (129.8ms)。无论如何，将单体应用程序作为 serverless 函数运行通常没有意义，因此将此基准测试视为应用程序增长时引导时间可能增加的一个示例。

#### 运行时优化

到目前为止，我们讨论了编译时优化。这些与您在应用程序中定义提供者和加载 Nest 模块的方式无关，而后者在应用程序增长时起着至关重要的作用。

例如，想象一个定义为 [asynchronous provider](/fundamentals/async-components) 的数据库连接。异步提供者旨在延迟应用程序启动，直到一个或多个异步任务完成。
如果您的 serverless 函数在引导时平均需要 2s 连接到数据库，那么在冷启动时，您的端点至少需要额外两秒才能发送响应，因为它必须等待连接建立。

在**无服务器环境**中，引导时间很重要，因此您会以略有不同的方式构建您的提供者。
例如，如果仅在特定场景中使用 Redis 进行缓存，那么您可能不应该将 Redis 连接定义为异步提供者：即使不需要它的函数调用也会减慢引导速度。

您还可以使用 `LazyModuleLoader` 类延迟加载整个 **模块**，如 [lazy-loading modules](/fundamentals/lazy-loading-modules) 章所述。缓存也是一个很好的例子。
想象一下您的应用程序有一个连接到 Redis 的 `CacheModule`，并导出一个用于与 Redis 存储交互的 `CacheService`。如果并非所有函数调用都需要它，
您可以按需、延迟加载它。这样，所有不需要缓存的调用在冷启动时都能获得更快的启动时间。

```typescript
if (request.method === RequestMethod[RequestMethod.GET]) {
  const { CacheModule } = await import('./cache.module.js');
  const moduleRef = await this.lazyModuleLoader.load(() => CacheModule);

  const { CacheService } = await import('./cache.service.js');
  const cacheService = moduleRef.get(CacheService);

  return cacheService.get(ENDPOINT_KEY);
}

```

另一个例子是 Webhook 或工作者，它们根据特定条件（例如输入参数）执行不同的操作。
在这种情况下，您可以在路由处理程序内部添加一个条件，为特定的函数调用延迟加载适当的 **模块**，同时将所有其他 **模块** 也延迟加载。

```typescript
if (workerType === WorkerType.A) {
  const { WorkerAModule } = await import('./worker-a.module.js');
  const moduleRef = await this.lazyModuleLoader.load(() => WorkerAModule);
  // ...
} else if (workerType === WorkerType.B) {
  const { WorkerBModule } = await import('./worker-b.module.js');
  const moduleRef = await this.lazyModuleLoader.load(() => WorkerBModule);
  // ...
}

```

#### 示例集成

您的应用程序入口文件（通常是 `main.ts`）应该是什么样的**取决于几个因素**，因此**没有适用于每种场景的单一模板**。
例如，用于启动无服务器函数的初始化文件因云提供者（AWS、Azure、GCP 等）而异。
此外，根据您是想运行具有多个路由/端点的典型 HTTP 应用程序，还是提供单个路由（或执行特定代码部分），您的应用程序代码看起来也不同。
例如，对于“每个函数一个端点”的方法，您可以使用 `NestFactory.createApplicationContext()` 而不是启动 HTTP 服务器、设置 **中间件** 等。

为了说明目的，我们将 Nest（使用 `@nestjs/platform-express`，因此启动整个、功能齐全的 HTTP 路由器）
与 [Serverless](https://www.serverless.com/) 框架集成（在这种情况下，目标是 AWS Lambda）。如前所述，您的代码将因选择的云提供者以及许多其他因素而异。

首先，安装所需的包：

```bash
$ npm i @codegenie/serverless-express
$ npm i -D @types/aws-lambda serverless-offline

```

> info **提示** 为了加快开发周期，我们安装 `serverless-offline` **插件**，它在本地模拟 AWS Lambda 和 API Gateway。

安装完成后，创建 `serverless.yml` 文件来配置 Serverless 框架：

```yaml
service: serverless-example

plugins:
  - serverless-offline

provider:
  name: aws
  runtime: nodejs22.x

functions:
  main:
    handler: dist/main.handler
    events:
      - http:
          method: ANY
          path: /
      - http:
          method: ANY
          path: '{proxy+}'

```

> info **提示** 有关 Serverless 框架的更多信息，请访问 [official documentation](https://www.serverless.com/framework/docs/)。

设置好后，打开 `main.ts` 文件，使用所需的样板代码更新引导代码：

```typescript
import { NestFactory } from '@nestjs/core';
import { configure } from '@codegenie/serverless-express';
import type { Callback, Context, Handler } from 'aws-lambda';
import { AppModule } from './app.module.js';

let server: Handler;

async function bootstrap(): Promise<Handler> {
  const app = await NestFactory.create(AppModule);
  await app.init();

  const expressApp = app.getHttpAdapter().getInstance();
  return configure({ app: expressApp });
}

export const handler: Handler = async (
  event: any,
  context: Context,
  callback: Callback,
) => {
  server = server ?? (await bootstrap());
  return server(event, context, callback);
};

```

> info **提示** 要创建共享通用 **模块** 的多个无服务器函数，我们建议使用 [CLI monorepo mode](/cli/workspaces#monorepo-模式)。

> warning **警告** 如果您使用 `@nestjs/swagger` 包，从无服务器函数提供 Swagger UI 需要额外的一步。在 API Gateway 之后，**请求** 的 `originalUrl` 可能缺少 Swagger UI 所期望的尾部斜杠，这会导致无限重定向循环。在调用 `SwaggerModule.setup()` **之前** 注册一个恢复它的 **中间件**：
>
> ```typescript
> app.use((req, res, next) => {
>   if (req.originalUrl === '/swagger') {
>     req.originalUrl = '/swagger/';
>   }
>   next();
> });
> ```

接下来，请确保在 `tsconfig.json` 文件中启用了 `esModuleInterop` 选项，以便 `@codegenie/serverless-express` 包正确加载（使用 `nest new` 生成的项目默认启用此选项）。

```json
{
  "compilerOptions": {
    ...
    "esModuleInterop": true
  }
}

```

现在构建应用程序（使用 `nest build` 或 `tsc`），并使用 `serverless` **CLI** 在本地启动 Lambda 函数：

```bash
$ npm run build
$ npx serverless offline

```

应用程序运行后，打开浏览器并导航到 `http://localhost:3000/dev/[ANY_ROUTE]`，其中 `[ANY_ROUTE]` 是您的应用程序中注册的任何端点。

上述部分表明，使用 `webpack` 打包您的应用程序会对整体引导时间产生重大影响。
为了使此示例工作，捆绑包必须暴露导出的 `handler` 函数。从 `@nestjs/cli` v12.0.8 开始，默认的 `webpack` 配置通过将 `output.library.type` 设置为 `commonjs2` 来实现这一点，前提是您的 `webpack.config.js` 在覆盖 `output` 时保持 `...options.output`。
对于较旧的 **CLI** 版本或不扩展 `options.output` 的配置，请在 `webpack.config.js` 文件中添加更多设置。特别是，将 `output.libraryTarget` 属性设置为 `commonjs2`。

```javascript
return {
  ...options,
  externals: [],
  output: {
    ...options.output,
    libraryTarget: 'commonjs2',
  },
  // ... the rest of the configuration
};

```

设置好后，运行 `$ nest build --webpack` 来编译函数代码（然后运行 `$ npx serverless offline` 进行测试）。

我们还建议（但**不是必需的**，因为它会减慢构建速度）安装 `terser-webpack-plugin` 包并覆盖其配置，以在最小化生产构建时保持类名不变。否则，`class-validator` 在您的应用程序中可能表现不正确。

```javascript
const TerserPlugin = require('terser-webpack-plugin');

return {
  ...options,
  externals: [],
  optimization: {
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          keep_classnames: true,
        },
      }),
    ],
  },
  output: {
    ...options.output,
    libraryTarget: 'commonjs2',
  },
  // ... the rest of the configuration
};

```

#### 使用独立应用程序功能

或者，如果您希望保持函数轻量级，并且不需要任何与 HTTP 相关的功能（路由，也包括 **守卫**、**拦截器**、**管道** 等），
请使用 `NestFactory.createApplicationContext()`（如前所述），而不是运行整个 HTTP 服务器（底层是 `express`）：

```typescript title="main.ts"
import { HttpStatus } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Callback, Context, Handler } from 'aws-lambda';
import { AppModule } from './app.module.js';
import { AppService } from './app.service.js';

export const handler: Handler = async (
  event: any,
  context: Context,
  callback: Callback,
) => {
  const appContext = await NestFactory.createApplicationContext(AppModule);
  const appService = appContext.get(AppService);

  return {
    body: appService.getHello(),
    statusCode: HttpStatus.OK,
  };
};

```

> info **提示** `NestFactory.createApplicationContext()` 不会用 **增强器**（**守卫**、**拦截器** 等）包装 **控制器** 方法。如果需要 **增强器**，请使用 `NestFactory.create()` 方法。

您也可以将 `event` 对象传递给一个 **提供者**，例如一个 `EventsService`，该 **提供者** 处理它并返回相应的 **值**（取决于输入和您的业务逻辑）。

```typescript
export const handler: Handler = async (
  event: any,
  context: Context,
  callback: Callback,
) => {
  const appContext = await NestFactory.createApplicationContext(AppModule);
  const eventsService = appContext.get(EventsService);
  return eventsService.process(event);
};

```