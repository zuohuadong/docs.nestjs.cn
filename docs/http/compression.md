<!-- 此文件从 content/http/compression.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T23:03:14.932Z -->
<!-- 源文件: content/http/compression.md -->
<!-- 源哈希: 55f5f0aaa3cd409275838f9faea2278c -->

### 压缩

压缩可以显著减小响应体的大小，从而加快 Web 应用的加载速度。

对于生产环境中的**高流量**网站，我们强烈建议将压缩卸载到应用服务器之外，通常是反向代理（例如 Nginx）。在这种情况下，请不要使用压缩中间件。

#### 与 Express (默认) 使用

使用 [compression](https://github.com/expressjs/compression) 中间件包来启用响应压缩。它支持 gzip、deflate 和 Brotli 编码，并根据 `Accept-Encoding` 请求头选择其中一种。

首先，安装所需的包：

```bash
$ npm i --save compression
$ npm i --save-dev @types/compression

```

安装完成后，全局应用压缩中间件：

```typescript
import compression from 'compression';
// somewhere in your initialization file
app.use(compression());

```

#### 与 Fastify 使用

如果您使用 `FastifyAdapter`，请使用 [@fastify/compress](https://github.com/fastify/fastify-compress) 插件：

```bash
$ npm i --save @fastify/compress

```

安装完成后，注册 `@fastify/compress` 插件。默认情况下，它会压缩所有符合条件的响应。

> 警告 **Warning** 确保在创建应用时传入 `NestFastifyApplication` 类型。否则，无法使用 `register()` 方法来应用插件。

```typescript
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import compression from '@fastify/compress';

// inside bootstrap()
const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
await app.register(compression);

```

默认情况下，`@fastify/compress` 使用客户端接受的第一个编码，优先级顺序为：`zstd`（在支持它的 Node.js 版本上），`br` (Brotli)，`gzip` 和 `deflate`。Brotli 实现了高压缩比，但更高质量级别速度较慢。该插件默认将 Brotli 质量（`BROTLI_PARAM_QUALITY`）设置为 4，而不是 zlib 的默认值 11。您可以将其设置为 0（最快）到 11（最小输出）之间的任何值，在压缩时间和响应大小之间进行权衡。请根据您的工作负载调整此值。以下示例明确设置了质量：

```typescript
import { constants } from 'node:zlib';
// somewhere in your initialization file
await app.register(compression, { brotliOptions: { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } } });

```

或者，您可以将 `@fastify/compress` 限制为 gzip 和 deflate。响应可能更大，但压缩速度更快。

要指定编码，请在 `app.register()` 的第二个参数中传入 `encodings` 选项：

```typescript
await app.register(compression, { encodings: ['gzip', 'deflate'] });

```

此配置告诉 `@fastify/compress` 只使用 gzip 和 deflate 编码，当客户端同时支持两者时优先使用 gzip。