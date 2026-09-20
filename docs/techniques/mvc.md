<!-- 此文件从 content/techniques/mvc.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T09:03:12.442Z -->
<!-- 源文件: content/techniques/mvc.md -->
<!-- 源哈希: 6719f53813b2d5f33a0232e1df87d260 -->

### 模型-视图-控制器

Nest 默认在底层使用 [Express](https://github.com/expressjs/express) 库。因此，在 Express 中使用 MVC（模型-视图-控制器）模式的每种技术同样适用于 Nest。

首先，让我们使用 [CLI](https://github.com/nestjs/nest-cli) 工具搭建一个简单的 Nest 应用程序：

```bash
$ npm i -g @nestjs/cli
$ nest new project

```

为了创建 MVC 应用程序，我们还需要一个 [template engine](https://expressjs.com/en/guide/using-template-engines.html) 来渲染我们的 HTML 视图：

```bash
$ npm install --save hbs

```

我们使用了 `hbs`（[Handlebars](https://github.com/pillarjs/hbs#readme)）引擎，但你可以使用任何符合你需求的引擎。安装过程完成后，我们需要使用以下代码配置 Express 实例：

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

我们告诉 [Express](https://github.com/expressjs/express)，`public` 目录将用于存储静态资源，`views` 将包含模板，并且应使用 `hbs` 模板引擎来渲染 HTML 输出。

#### 模板渲染

现在，让我们在其中创建一个 `views` 目录和 `index.hbs` 模板。在模板中，我们将打印从控制器传递的 `message`：

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

接下来，打开 `app.controller` 文件，并用以下代码替换 `root()` 方法：

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

在这段代码中，我们在 `@Render()` 装饰器中指定要使用的模板，并将路由处理方法的返回值传递给模板进行渲染。请注意，返回值是一个具有 `message` 属性的对象，与我们之前在模板中创建的 `message` 占位符匹配。

在应用程序运行时，打开浏览器并导航到 `http://localhost:3000`。你应该会看到 `Hello world!` 消息。

#### 添加布局

`hbs` 引擎支持布局——即各个视图渲染到的共享包装模板。要使用布局，请使用 `setLocal()` 方法（Nest 对 Express 的 [app.locals](https://expressjs.com/en/5x/api.html#app.locals) 的封装）设置 `layout` 局部变量。让我们按如下方式修改之前的代码：

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
  );

  app.setLocal('layout', 'layouts/app');
  app.useStaticAssets(join(__dirname, '..', 'public'));
  app.setBaseViewsDir(join(__dirname, '..', 'views'));
  app.setViewEngine('hbs');

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

```

接下来，创建一个 `layouts` 文件夹，并添加一个内容如下的 `app.hbs` 文件：

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

生成的文件结构如下：

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

如果应用程序逻辑必须动态决定要渲染哪个模板，那么我们应该使用 `@Res()` 装饰器，并在路由处理器中提供视图名称，而不是在 `@Render()` 装饰器中提供：

> info **提示** 当 Nest 检测到 `@Res()` 装饰器时，它会注入特定于库的 `response` 对象。我们可以使用此对象动态渲染模板。了解更多关于 `response` 对象 API 的信息，请参阅 [here](https://expressjs.com/en/api.html)。

```typescript title="app.controller.ts"
import { Get, Controller, Res, Render } from '@nestjs/common';
import { Response } from 'express';
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

可用的工作示例见 [here](https://github.com/nestjs/nest/tree/master/sample/15-mvc)。

#### Fastify

如本 [chapter](/techniques/performance) 中所述，我们可以将任何兼容的 HTTP 提供程序与 Nest 一起使用。其中一个这样的库是 [Fastify](https://github.com/fastify/fastify)。要使用 Fastify 创建 MVC 应用程序，请安装以下包：

```bash
$ npm i --save @fastify/static @fastify/view handlebars

```

接下来的步骤几乎与 Express 使用的过程相同，但有一些特定于平台的细微差别。安装过程完成后，打开 `main.ts` 文件并更新其内容：

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

Fastify API 有一些差异，但这些方法调用的最终结果是相同的。一个显著的区别是，使用 Fastify 时，你传递给 `@Render()` 装饰器的模板名称必须包含文件扩展名。

以下是如何进行设置：

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

或者，你可以使用 `@Res()` 装饰器直接注入响应并指定要渲染的视图，如下所示：

```typescript
import { Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';

@Get()
root(@Res() res: FastifyReply) {
  return res.view('index.hbs', { title: 'Hello world!' });
}

```

在应用程序运行时，打开浏览器并导航到 `http://localhost:3000`。你应该会看到 `Hello world!` 消息。

#### 示例

可用的工作示例见 [here](https://github.com/nestjs/nest/tree/master/sample/17-mvc-fastify)。