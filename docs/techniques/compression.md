<!-- 此文件从 content/techniques/compression.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T08:24:30.396Z -->
<!-- 源文件: content/techniques/compression.md -->
<!-- 源哈希: 28b1832b9a7f9788a191dea3f2a4dc6f -->

### 压缩

压缩可以大幅减小响应体的大小，从而提高 Web 应用的速度。

对于生产环境中的**高流量**网站，强烈建议将压缩从应用服务器卸载——通常在反向代理（如 Nginx）中进行。在这种情况下，不应使用压缩中间件。

#### 与 Express 一起使用（默认）

使用 [compression](https://github.com/expressjs/compression) 中间件包来启用 gzip 压缩。

首先，安装所需的包：

```bash
$ npm i --save compression
$ npm i --save-dev @types/compression

```

安装完成后，将压缩中间件作为全局中间件应用。

```typescript
import compression from 'compression';
// somewhere in your initialization file
app.use(compression());

```

#### 与 Fastify 一起使用

如果使用 `FastifyAdapter`，您需要使用 [fastify-compress](https://github.com/fastify/fastify-compress)：

```bash
$ npm i --save @fastify/compress

```

安装完成后，将 `@fastify/compress` 中间件作为全局中间件应用。

> warning **警告** 请确保在创建应用程序时使用类型 `NestFastifyApplication`。否则，您无法使用 `register` 来应用压缩中间件。

```typescript
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import compression from '@fastify/compress';

// inside bootstrap()
const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
await app.register(compression);

```

默认情况下，当浏览器指示支持该编码时，`@fastify/compress` 将使用 Brotli 压缩（在 Node >= 11.7.0 上）。虽然 Brotli 在压缩比方面非常高效，但它也可能相当慢。默认情况下，Brotli 设置最大压缩质量为 11，但可以通过将 `BROTLI_PARAM_QUALITY` 调整为最小 0 到最大 11 之间的值来减少压缩时间以换取压缩质量。这需要微调以优化空间/时间性能。质量设置为 4 的示例：

```typescript
import { constants } from 'node:zlib';
// somewhere in your initialization file
await app.register(compression, { brotliOptions: { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } } });

```

为简化起见，您可能希望告诉 `fastify-compress` 仅使用 deflate 和 gzip 来压缩响应；最终可能会得到更大的响应，但它们的传输速度会快得多。

要指定编码，请向 `app.register` 提供第二个参数：

```typescript
await app.register(compression, { encodings: ['gzip', 'deflate'] });

```

上述配置告诉 `fastify-compress` 仅使用 gzip 和 deflate 编码，如果客户端同时支持两者，则优先使用 gzip。