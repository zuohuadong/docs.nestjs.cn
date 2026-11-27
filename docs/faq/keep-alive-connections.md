<!-- 此文件从 content/faq/keep-alive-connections.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T23:13:18.318Z -->
<!-- 源文件: content/faq/keep-alive-connections.md -->
<!-- 源哈希: 36e8ba5796c0aeacb284fb87081c7dd4 -->

### 保持活动连接

默认情况下，NestJS HTTP 适配器会等到响应完成才关闭应用程序。有时这种行为是不希望的或出乎意料的：某些请求使用 `Connection: Keep-Alive` 头部，并长时间保持连接开启。

如果您希望应用程序在不等待这些连接结束的情况下始终退出，请在创建 NestJS 应用程序时启用 `forceCloseConnections` 选项。

> info **提示** 大多数用户不需要此选项。您需要此选项的典型症状是应用程序没有按预期退出，通常在启用 `app.enableShutdownHooks()` 时出现，并且最常在使用 `--watch` 运行时进行开发时出现。

#### 用法

在您的 `main.ts` 文件中，创建 NestJS 应用程序时启用该选项：

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    forceCloseConnections: true,
  });
  await app.listen(process.env.PORT ?? 3000);
}

await bootstrap();

```

> info **注意** Express、Fastify 和 Node 适配器都实现了 `forceCloseConnections` 应用程序选项。使用 Fastify 时，这需要 NestJS v12.1 或更高版本。在早期版本中，请将 Fastify 自身的 `forceCloseConnections` 服务器选项传递给 `FastifyAdapter` 构造函数。