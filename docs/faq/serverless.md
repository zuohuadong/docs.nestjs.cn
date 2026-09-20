<!-- 此文件从 content/faq/serverless.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T07:38:34.412Z -->
<!-- 源文件: content/faq/serverless.md -->
<!-- 源哈希: 042a0e25503b9603624b4b3ac956c825 -->

### 无服务器（Serverless）

无服务器计算是一种云计算执行模型，其中云提供商按需分配机器资源，代表其客户管理服务器。当应用未被使用时，不会为该应用分配计算资源。定价基于应用程序实际消耗的资源量（[source](https://en.wikipedia.org/wiki/Serverless_computing)）。

采用**无服务器架构**时，您只需专注于应用程序代码中的各个函数。AWS Lambda、Google Cloud Functions 和 Microsoft Azure Functions 等服务负责管理所有物理硬件、虚拟机操作系统和 Web 服务器软件。

> 信息 **提示** 本章不讨论无服务器函数的优缺点，也不深入探讨任何云提供商的具体细节。

#### 冷启动

冷启动是指您的代码在一段时间后首次被执行。根据您使用的云提供商不同，它可能涉及多个不同的操作，从下载代码和引导运行时到最终运行您的代码。
此过程会带来**显著的延迟**，具体取决于多种因素，如语言、应用程序所需的包数量等。

冷启动非常重要，虽然有些事情超出了我们的控制范围，但我们仍然可以在自己的层面上做很多事情来尽可能缩短冷启动时间。

虽然您可以将 Nest 视为一个专为复杂企业级应用设计的全功能框架，但它同样**适用于更"简单"的应用**（或脚本）。例如，利用 [Standalone applications](/standalone-applications) 功能，您可以在简单的 worker、CRON 任务、CLI 或无服务器函数中利用 Nest 的依赖注入系统。

#### 基准测试

为了更好地理解在无服务器函数场景下使用 Nest 或其他知名库（如 `express`）的成本，让我们比较一下 Node 运行时运行以下脚本所需的时间：

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

对于所有这些脚本，我们使用了 `tsc`（TypeScript）编译器，因此代码保持未打包状态（未使用 `webpack`）。

|                                      |                   |
| ------------------------------------ | ----------------- |
| Express                              | 0.0079s (7.9ms)   |
| 使用 `@nestjs/platform-express` 的 Nest | 0.1974s (197.4ms) |
| Nest（独立应用程序）        | 0.1117s (111.7ms) |
| 原生 Node.js 脚本                   | 0.0071s (7.1ms)   |

> 信息 **注意** 机器：MacBook Pro Mid 2014，2.5 GHz 四核 Intel Core i7，16 GB 1600 MHz DDR3，SSD。

现在，让我们重复所有基准测试，但这次使用 `webpack`（如果您已安装 [Nest CLI](/cli/overview)，可以运行 `nest build --webpack`）将我们的应用程序打包为单个可执行的 JavaScript 文件。
但是，我们将不使用 Nest CLI 自带的默认 `webpack` 配置，而是确保将所有依赖（`node_modules`）一起打包，如下所示：

```javascript
module.exports = (options, webpack) => {
  const lazyImports = [
    '@nestjs/microservices/microservices-module',
    '@nestjs/websockets/socket-module',
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

> 信息 **提示** 要指示 Nest CLI 使用此配置，请在项目的根目录中创建一个新的 `webpack.config.js` 文件。

使用此配置，我们得到了以下结果：

|                                      |                  |
| ------------------------------------ | ---------------- |
| Express                              | 0.0068s (6.8ms)  |
| 使用 `@nestjs/platform-express` 的 Nest | 0.0815s (81.5ms) |
| Nest（独立应用程序）        | 0.0319s (31.9ms) |
| 原生 Node.js 脚本                   | 0.0066s (6.6ms)  |

> 信息 **注意** 机器：MacBook Pro Mid 2014，2.5 GHz 四核 Intel Core i7，16 GB 1600 MHz DDR3，SSD。

> 信息 **提示** 您可以通过应用额外的代码压缩和优化技术（使用 `webpack` 插件等）进一步优化。

如您所见，编译方式（以及是否打包代码）至关重要，并且对整体启动时间有显著影响。使用 `webpack`，您可以将独立 Nest 应用程序（包含一个模块、控制器和服务的入门项目）的引导时间平均降至约 32ms，对于常规的基于 Express 的 HTTP NestJS 应用，则可降至约 81.5ms。

对于更复杂的 Nest 应用程序，例如具有 10 个资源（通过 `$ nest g resource` schematic 生成 = 10 个模块、10 个控制器、10 个服务、20 个 DTO 类、50 个 HTTP 端点 + `AppModule`），在 MacBook Pro Mid 2014，2.5 GHz 四核 Intel Core i7，16 GB 1600 MHz DDR3，SSD 上的整体启动时间约为 0.1298s（129.8ms）。无论如何，将单体应用程序作为无服务器函数运行通常没有太大意义，因此请将此基准测试更多地视为一个示例，说明随着应用程序的增长，引导时间可能会如何增加。

#### 运行时优化

到目前为止，我们涵盖了编译时优化。这些与您在应用程序中定义提供者和加载 Nest 模块的方式无关，而后者随着应用程序规模的增大起着至关重要的作用。

例如，假设有一个定义为 [asynchronous provider](/fundamentals/async-components) 的数据库连接。异步提供者旨在延迟应用程序启动，直到一个或多个异步任务完成。
这意味着，如果您的无服务器函数平均需要 2 秒来连接数据库（在引导时），那么您的端点将至少需要额外的两秒（因为它必须等待连接建立）才能发送响应（当它是冷启动且您的应用程序尚未运行时）。

如您所见，在**无服务器环境**中，提供者的组织方式有所不同，因为引导时间至关重要。

另一个很好的例子是，如果您使用 Redis 进行缓存，但仅在特定场景下使用。在这种情况下，您不应将 Redis 连接定义为异步提供者，因为即使特定函数调用不需要它，它也会拖慢引导时间。

此外，有时您可以使用 `LazyModuleLoader` 类来延迟加载整个模块，如 [this chapter](/fundamentals/lazy-loading-modules) 中所述。缓存也是一个很好的例子。假设您的应用程序有一个 `CacheModule`，它内部连接到 Redis，并导出 `CacheService` 来与 Redis 存储交互。如果您不需要它为所有可能的函数调用提供服务，您可以按需延迟加载它。这样，对于所有不需要缓存的调用，您将获得更快的启动时间（当发生冷启动时）。

```typescript
if (request.method === RequestMethod[RequestMethod.GET]) {
  const { CacheModule } = await import('./cache.module');
  const moduleRef = await this.lazyModuleLoader.load(() => CacheModule);

  const { CacheService } = await import('./cache.service');
  const cacheService = moduleRef.get(CacheService);

  return cacheService.get(ENDPOINT_KEY);
}

```

另一个很好的例子是 webhook 或 worker，它们根据特定条件（例如输入参数）可能执行不同的操作。在这种情况下，您可以在路由处理器内部指定一个条件，为特定的函数调用延迟加载相应的模块，并延迟加载所有其他模块。

```typescript
if (workerType === WorkerType.A) {
  const { WorkerAModule } = await import('./worker-a.module');
  const moduleRef = await this.lazyModuleLoader.load(() => WorkerAModule);
  // ...
} else if (workerType === WorkerType.B) {
  const { WorkerBModule } = await import('./worker-b.module');
  const moduleRef = await this.lazyModuleLoader.load(() => WorkerBModule);
  // ...
}

```

#### 示例集成

您的应用程序入口文件（通常是 `main.ts` 文件）的外观**取决于多个因素**，因此**没有单一的模板**适用于所有场景。例如，启动无服务器函数所需的初始化文件因云提供商（AWS、Azure、GCP 等）而异。此外，根据您是希望运行具有多个路由/端点的典型 HTTP 应用程序，还是仅提供单个路由（或执行特定代码段），您的应用程序代码会有所不同（例如，对于每个函数一个端点的方法，您可以使用 `NestFactory.createApplicationContext` 而不是启动 HTTP 服务器、设置中间件等）。

仅为说明目的，我们将把 Nest（使用 `@nestjs/platform-express` 并启动完整、功能齐全的 HTTP 路由器）与 [Serverless](https://www.serverless.com/) 框架（本例中针对 AWS Lambda）集成。如前所述，您的代码将根据您选择的云提供商和许多其他因素而有所不同。

首先，让我们安装所需的软件包：

```bash
$ npm i @codegenie/serverless-express aws-lambda
$ npm i -D @types/aws-lambda serverless-offline

```

> info **提示** 为了加快开发周期，我们安装了 `serverless-offline` 插件，它模拟 AWS λ 和 API Gateway。

安装过程完成后，让我们创建 `serverless.yml` 文件来配置 Serverless 框架：

```yaml
service: serverless-example

plugins:
  - serverless-offline

provider:
  name: aws
  runtime: nodejs14.x

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

> info **提示** 要了解有关 Serverless 框架的更多信息，请访问 [official documentation](https://www.serverless.com/framework/docs/)。

完成此操作后，我们现在可以导航到 `main.ts` 文件并使用所需的样板代码更新我们的引导代码：

```typescript
import { NestFactory } from '@nestjs/core';
import serverlessExpress from '@codegenie/serverless-express';
import { Callback, Context, Handler } from 'aws-lambda';
import { AppModule } from './app.module.js';

let server: Handler;

async function bootstrap(): Promise<Handler> {
  const app = await NestFactory.create(AppModule);
  await app.init();

  const expressApp = app.getHttpAdapter().getInstance();
  return serverlessExpress({ app: expressApp });
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

> info **提示** 要创建多个无服务器函数并在它们之间共享公共模块，我们建议使用 [CLI Monorepo mode](/cli/workspaces#monorepo-模式)。

> warning **警告** 如果您使用 `@nestjs/swagger` 包，从无服务器函数提供 Swagger UI 需要额外一步。在 API Gateway 后面，请求的 `originalUrl` 可能缺少 Swagger UI 期望的尾部斜杠，这会导致无限重定向循环。在调用 `SwaggerModule.setup()` **之前**注册一个中间件来恢复它：
>
> ```typescript
> app.use((req, res, next) => {
>   if (req.originalUrl === '/swagger') {
>     req.originalUrl = '/swagger/';
>   }
>   next();
> });
> ```

接下来，打开 `tsconfig.json` 文件，确保启用 `esModuleInterop` 选项，以便 `@codegenie/serverless-express` 包正确加载。

```json
{
  "compilerOptions": {
    ...
    "esModuleInterop": true
  }
}

```

现在我们可以构建我们的应用程序（使用 `nest build` 或 `tsc`），并使用 `serverless` CLI 在本地启动我们的 lambda 函数：

```bash
$ npm run build
$ npx serverless offline

```

应用程序运行后，打开浏览器并导航到 `http://localhost:3000/dev/[ANY_ROUTE]`（其中 `[ANY_ROUTE]` 是您应用程序中注册的任何端点）。

在上面的章节中，我们展示了使用 `webpack` 和打包您的应用程序可以对整体引导时间产生显著影响。然而，要使其与我们的示例配合使用，您必须在 `webpack.config.js` 文件中添加一些额外的配置。通常，为了确保我们的 `handler` 函数被识别，我们必须将 `output.libraryTarget` 属性更改为 `commonjs2`。

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

完成此操作后，您现在可以使用 `$ nest build --webpack` 编译您的函数代码（然后使用 `$ npx serverless offline` 进行测试）。

还建议（但**非必需**，因为它会减慢您的构建过程）安装 `terser-webpack-plugin` 包并覆盖其配置，以便在压缩生产构建时保持类名完整。如果不这样做，在应用程序中使用 `class-validator` 时可能会导致不正确的行为。

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

或者，如果您希望保持函数非常轻量级，并且不需要任何与 HTTP 相关的功能（路由，以及守卫、拦截器、管道等），您可以像下面这样使用 `NestFactory.createApplicationContext`（如前所述），而不是运行整个 HTTP 服务器（以及底层的 `express`）：

```typescript title="main.ts"
import { HttpStatus } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Callback, Context, Handler } from 'aws-lambda';
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

> info **提示** 请注意，`NestFactory.createApplicationContext` 不会用增强器（守卫、拦截器等）包装控制器方法。为此，您必须使用 `NestFactory.create` 方法。

您还可以将 `event` 对象传递给，比如说，`EventsService` 提供者，它可以处理该对象并返回相应的值（取决于输入值和您的业务逻辑）。

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