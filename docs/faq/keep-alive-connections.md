<!-- 此文件从 content/faq/keep-alive-connections.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T07:43:13.428Z -->
<!-- 源文件: content/faq/keep-alive-connections.md -->
<!-- 源哈希: 85635dbc061b9f10541242fb9108b270 -->

### 保持活动连接

默认情况下，NestJS 的 HTTP 适配器会等待响应完成后再关闭应用程序。但有时，这种行为并非所愿，或出乎意料。可能存在一些使用 `Connection: Keep-Alive` 标头的请求，它们会持续很长时间。

对于这些你总是希望应用程序退出而不等待请求结束的场景，你可以在创建 NestJS 应用程序时启用 `forceCloseConnections` 选项。

> 警告 **提示** 大多数用户不需要启用此选项。但需要此选项的症状是，你的应用程序不会在你期望的时候退出。通常当 `app.enableShutdownHooks()` 被启用时，你会注意到应用程序没有重启/退出。很可能是在使用 `--watch` 进行开发时运行 NestJS 应用程序。

#### 用法

在你的 `main.ts` 文件中，创建 NestJS 应用程序时启用该选项：

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