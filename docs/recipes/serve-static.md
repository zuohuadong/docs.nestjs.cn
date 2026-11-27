<!-- 此文件从 content/recipes/serve-static.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:36:50.846Z -->
<!-- 源文件: content/recipes/serve-static.md -->
<!-- 源哈希: 3086a4e37e3a6523bc53047640103317 -->

### 提供静态资源

要提供静态内容，例如单页应用程序 (SPA)，请使用 `ServeStaticModule` 来自 [`@nestjs/serve-static`](https://www.npmjs.com/package/@nestjs/serve-static) 包。

#### 安装

首先，安装所需的包：

```bash
$ npm install --save @nestjs/serve-static

```

#### 引导

安装完成后，将 `ServeStaticModule` 导入到根 `AppModule` 中，并通过向 `forRoot()` 方法传递配置对象进行配置：

```typescript
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'node:path';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(import.meta.dirname, '..', 'client'),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

```

设置完成后，构建静态网站并将其内容放置在由 `rootPath` 属性指定的路径下。

#### 配置

[`ServeStaticModule`](https://github.com/nestjs/serve-static) 接受多种选项来定制其行为。例如，您可以设置静态应用渲染的路径、排除特定路径，或启用或禁用 `Cache-Control` 响应头。有关所有选项的完整列表，请参阅 [`ServeStaticModuleOptions` interface](https://github.com/nestjs/serve-static/blob/master/lib/interfaces/serve-static-options.interface.ts)。

> 警告 **注意** 默认情况下，`renderPath` 匹配所有路径，并且模块会响应 `index.html` 文件。这为您的 SPA 启用了客户端路由，同时控制器中声明的路由仍由服务器处理。您可以通过将 `serveRoot` 和 `renderPath` 选项与其他选项组合来更改此行为。使用 Fastify 适配器时，将 `serveStaticOptions.fallthrough` 设置为 `true` 以模拟 Express 的回退行为，即对于不存在的路由发送 `index.html` 而不是 404 错误。

#### 示例

一个可工作的示例可在 GitHub 上的 [serve-static sample](https://github.com/nestjs/nest/tree/master/sample/24-serve-static) 找到。