<!-- 此文件从 content/http/mvc.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:59:35.593Z -->
<!-- 源文件: content/http/mvc.md -->
<!-- 源哈希: 156cd799f80a0339976e05bc9bcc0a76 -->

### 模型-视图-控制器

默认情况下，Nest 在底层使用 [Express](https://github.com/expressjs/express) 库。因此，所有在 Express 中使用 MVC（模型-视图-控制器）模式的技术也适用于 Nest。

首先，使用 [CLI](https://github.com/nestjs/nest-cli) 工具搭建一个新的 Nest 应用程序：

```bash
$ npm i -g @nestjs/cli
$ nest new project

```

要创建 MVC 应用，您还需要一个 [template engine](https://expressjs.com/en/guide/using-template-engines.html) 来渲染 HTML 视图：

```bash
$ npm install --save hbs

```

此示例使用 `hbs`（[Handlebars](https://github.com/pillarjs/hbs#readme)）引擎，但您可以使用任何符合您需求的引擎。安装过程完成后，使用以下代码配置 Express 实例：

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
  );

  app.useStaticAssets(join(import.meta.dirname, '..', 'public'));
  app.setBaseViewsDir(join(import.meta.dirname, '..', 'views'));
  app.setViewEngine('hbs');

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

这告诉 Express `public` 目录存储静态资源，`views` 目录包含模板，并且 `hbs` 模板引擎渲染 HTML 输出。

> info **提示** 相同的调用也适用于 `NodeAdapter`：使用 `new NodeAdapter()` 和 `NestNodeApplication` 类型创建应用程序（参见 [Node adapter](/techniques/performance#node-adapter)）。Node 适配器支持 `@Render()` 装饰器，但不支持 [Dynamic template rendering](/http/mvc#动态模板渲染) 中使用的 `res.render()` 方法。

#### 模板渲染

现在，创建一个包含 `index.hbs` 模板的 `views` 目录。该模板会打印从控制器传递的 `message`：

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>App</title>
  </head>
  <body>
    {{ "{{ message }\}" }}
  </body>
</html>

```

接下来，打开 `app.controller` 文件，并用以下代码替换其内容：

```typescript title="app.controller.ts"
import { Get, Controller, Render } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  @Render('index')
  root() {
    return { message: 'Hello world!' };
  }
}

```

此代码在 `@Render()` 装饰器中指定要使用的模板，并且路由处理方法的返回值被传递给模板进行渲染。返回值是一个具有 `message` 属性的对象，与模板中的 `message` 占位符匹配。

应用程序运行时，打开浏览器并导航到 `http://localhost:3000`。您应该会看到 `Hello world!` 消息。

#### 添加布局

`hbs` 引擎支持布局：单个视图渲染到共享的包装模板中。要使用布局，请使用 `setLocal()` 方法设置 `layout` 本地变量（Nest 对 Express [app.locals](https://expressjs.com/en/5x/api.html#app.locals) 的封装）。按如下方式修改前面的代码：

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
  );

  app.setLocal('layout', 'layouts/app');
  app.useStaticAssets(join(import.meta.dirname, '..', 'public'));
  app.setBaseViewsDir(join(import.meta.dirname, '..', 'views'));
  app.setViewEngine('hbs');

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

接下来，在 `views` 内部创建一个 `layouts` 文件夹，并添加一个包含以下内容的 `app.hbs` 文件：

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>App</title>
  </head>
  <body>
    {{{body}}}
  </body>
</html>

```

然后，将 `index.hbs` 文件更新为：

```html
{{ "{{ message }\}" }}

```

最终的文件结构如下所示：

<div class="file-tree">
  <div class="item">views</div>
  <div class="children">
    <div class="item">layouts</div>
    <div class="children">
      <div class="item">app.hbs</div>
    </div>
    <div class="item">index.hbs</div>
  </div>
</div>

#### 动态模板渲染

如果应用程序逻辑必须动态决定渲染哪个模板，请使用 `@Res()` 装饰器，并在路由处理程序中提供视图名称，而不是在 `@Render()` 装饰器中提供：

> info **提示** 当 Nest 检测到 `@Res()` 装饰器时，它会注入库特定的 `response` 对象，您可以使用它来动态渲染模板。请参阅 [Express API reference](https://expressjs.com/en/api.html) 了解有关 `response` 对象的更多信息。

```typescript title="app.controller.ts"
import { Get, Controller, Res, Render } from '@nestjs/common';
import type { Response } from 'express';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private appService: AppService) {}

  @Get()
  root(@Res() res: Response) {
    return res.render(
      this.appService.getViewName(),
      { message: 'Hello world!' },
    );
  }
}

```

#### 示例

可在 [15-mvc sample](https://github.com/nestjs/nest/tree/master/sample/15-mvc) 找到一个可运行的示例。

#### Fastify

如 [HTTP adapters](/techniques/performance) 章所述，您可以使用任何兼容的 HTTP 提供者与 Nest 配合使用。其中一个库是 [Fastify](https://github.com/fastify/fastify)。要使用 Fastify 创建 MVC 应用程序，请安装以下包：

```bash
$ npm i --save @fastify/static @fastify/view handlebars

```

接下来的步骤与 Express 的过程几乎相同，仅有细微的平台特定差异。安装过程完成后，打开 `main.ts` 文件并更新其内容：

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { NestFastifyApplication, FastifyAdapter } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { join } from 'node:path';
import Handlebars from 'handlebars';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  app.useStaticAssets({
    root: join(import.meta.dirname, '..', 'public'),
    prefix: '/public/',
  });
  app.setViewEngine({
    engine: {
      handlebars: Handlebars,
    },
    templates: join(import.meta.dirname, '..', 'views'),
  });
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

Fastify API 有一些不同，但这些方法调用的最终结果是相同的。一个显著的区别是，在使用 Fastify 时，传递给 `@Render()` 装饰器的模板名称必须包含文件扩展名：

```typescript title="app.controller.ts"
import { Get, Controller, Render } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  @Render('index.hbs')
  root() {
    return { message: 'Hello world!' };
  }
}

```

或者，您可以使用 `@Res()` 装饰器直接注入响应，并指定要渲染的视图，如下所示：

```typescript
import { Get, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

@Get()
root(@Res() res: FastifyReply) {
  return res.view('index.hbs', { message: 'Hello world!' });
}

```

应用程序运行时，打开浏览器并导航到 `http://localhost:3000`。您应该会看到 `Hello world!` 消息。

#### 示例

可在 [17-mvc-fastify sample](https://github.com/nestjs/nest/tree/master/sample/17-mvc-fastify) 找到一个可运行的示例。