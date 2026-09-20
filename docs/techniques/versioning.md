<!-- 此文件从 content/techniques/versioning.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T08:58:41.975Z -->
<!-- 源文件: content/techniques/versioning.md -->
<!-- 源哈希: 2ae527b5a0653b9a9fe0c645a04febaf -->

### 版本控制

> info **提示** 本章仅适用于基于 HTTP 的应用程序。

版本控制允许你在同一个应用程序中运行**不同版本**的控制器或单个路由。应用程序经常变更，在仍需要支持旧版本应用的同时引入破坏性变更并不罕见。

支持 4 种类型的版本控制：

<table>
  <tr>
    <td><a href='techniques/versioning#uri-versioning-type'><code>URI 版本控制</code></a></td>
    <td>版本将作为请求 URI 的一部分传递（默认）</td>
  </tr>
  <tr>
    <td><a href='techniques/versioning#header-versioning-type'><code>请求头版本控制</code></a></td>
    <td>自定义请求头将指定版本</td>
  </tr>
  <tr>
    <td><a href='techniques/versioning#media-type-versioning-type'><code>媒体类型版本控制</code></a></td>
    <td>请求的 <code>Accept</code> 请求头将指定版本</td>
  </tr>
  <tr>
    <td><a href='techniques/versioning#custom-versioning-type'><code>自定义版本控制</code></a></td>
    <td>请求的任何方面都可以用来指定版本。提供一个自定义函数来提取所述版本。</td>
  </tr>
</table>

#### URI 版本控制类型

URI 版本控制使用请求 URI 中传递的版本，例如 `https://example.com/v1/route` 和 `https://example.com/v2/route`。

> warning **注意** 使用 URI 版本控制时，版本将自动添加到 <a href="faq/global-prefix">全局前缀</a>（如果存在）之后、任何控制器或路由路径之前。

要为你的应用程序启用 URI 版本控制，请执行以下操作：

```typescript title="main.ts"
const app = await NestFactory.create(AppModule);
// or "app.enableVersioning()"
app.enableVersioning({
  type: VersioningType.URI,
});
await app.listen(process.env.PORT ?? 3000);

```

> warning **注意** URI 中的版本默认会自动添加 `v` 前缀，但可以通过将 `prefix` 键设置为所需前缀来配置前缀值，如果希望禁用前缀，则设置为 `false`。

> info **提示** `VersioningType` 枚举可用于 `type` 属性，并从 `@nestjs/common` 包中导入。

#### 请求头版本控制类型

请求头版本控制使用自定义的用户指定请求头，其值指定请求要使用的版本。

请求头版本控制的示例 HTTP 请求：

要为你的应用程序启用**请求头版本控制**，请执行以下操作：

```typescript title="main.ts"
const app = await NestFactory.create(AppModule);
app.enableVersioning({
  type: VersioningType.HEADER,
  header: 'Custom-Header',
});
await app.listen(process.env.PORT ?? 3000);

```

`header` 属性应为包含请求版本的请求头名称。

> info **提示** `VersioningType` 枚举可用于 `type` 属性，并从 `@nestjs/common` 包中导入。

#### 媒体类型版本控制类型

媒体类型版本控制使用请求的 `Accept` 请求头来指定版本。

在 `Accept` 请求头中，版本将使用分号 `;` 与媒体类型分隔。然后应包含一个表示请求版本的键值对，例如 `Accept: application/json;v=2`。该键被视为版本的前缀，因此必须配置 `key` 属性以包含键和分隔符。

要为你的应用程序启用**媒体类型版本控制**，请执行以下操作：

```typescript title="main.ts"
const app = await NestFactory.create(AppModule);
app.enableVersioning({
  type: VersioningType.MEDIA_TYPE,
  key: 'v=',
});
await app.listen(process.env.PORT ?? 3000);

```

`key` 属性应为包含版本的键值对的键和分隔符。对于示例 `Accept: application/json;v=2`，`key` 属性将设置为 `v=`。

> info **提示** `VersioningType` 枚举可用于 `type` 属性，并从 `@nestjs/common` 包中导入。

#### 自定义版本控制类型

自定义版本控制使用请求的任何方面来指定版本。传入的请求使用 `extractor` 函数进行分析，该函数返回字符串或字符串数组。

如果请求者提供了多个版本，提取函数可以返回字符串数组，按从最高/最大版本到最小/最低版本的顺序排序。版本按从高到低的顺序与路由匹配。

如果 `extractor` 返回空字符串或空数组，则不会匹配任何路由，并返回 404。

例如，如果传入的请求指定它支持版本 `1`、`2` 和 `3`，则 `extractor` **必须**返回 `[3, 2, 1]`。这确保了首先选择最高可能的路由版本。

如果提取了版本 `[3, 2, 1]`，但路由仅存在于版本 `2` 和 `1`，则选择匹配版本 `2` 的路由（版本 `3` 被自动忽略）。

> warning **注意** 使用 Express 适配器时，请让你的 `extractor` 返回单个版本（字符串或包含一个元素的数组）。由于适配器的设计限制，在 Express 中从多元素数组中选择最高匹配版本**不可靠**——如果你需要该行为，请使用 Fastify 适配器，它支持单版本和最高匹配版本选择。

要为你的应用程序启用**自定义版本控制**，请创建一个 `extractor` 函数并将其传入你的应用程序，如下所示：

```typescript title="main.ts"
// Example extractor that pulls out a list of versions from a custom header and turns it into a sorted array.
// This example uses Fastify, but Express requests can be processed in a similar way.
const extractor = (request: FastifyRequest): string | string[] =>
  [request.headers['custom-versioning-field'] ?? '']
     .flatMap(v => v.split(','))
     .filter(v => !!v)
     .sort()
     .reverse()

const app = await NestFactory.create(AppModule);
app.enableVersioning({
  type: VersioningType.CUSTOM,
  extractor,
});
await app.listen(process.env.PORT ?? 3000);

```

#### 使用

版本控制允许你对控制器、单个路由进行版本控制，并且还提供了一种让某些资源选择退出版本控制的方式。无论你的应用程序使用哪种版本控制类型，版本控制的用法都是相同的。

> warning **注意** 如果应用程序启用了版本控制，但控制器或路由未指定版本，则对该控制器/路由的任何请求都将收到 `404` 响应状态。同样，如果收到的请求包含的版本没有对应的控制器或路由，它也将收到 `404` 响应状态。

#### 控制器版本

版本可以应用于控制器，为控制器内的所有路由设置版本。

要为控制器添加版本，请执行以下操作：

```typescript title="cats.controller.ts"
@Controller({
  version: '1',
})
export class CatsControllerV1 {
  @Get('cats')
  findAll(): string {
    return 'This action returns all cats for version 1';
  }
}

```

#### 路由版本

版本可以应用于单个路由。此版本将覆盖任何其他会影响该路由的版本，例如控制器版本。

要为单个路由添加版本，请执行以下操作：

```typescript title="cats.controller.ts"
import { Controller, Get, Version } from '@nestjs/common';

@Controller()
export class CatsController {
  @Version('1')
  @Get('cats')
  findAllV1(): string {
    return 'This action returns all cats for version 1';
  }

  @Version('2')
  @Get('cats')
  findAllV2(): string {
    return 'This action returns all cats for version 2';
  }
}

```

#### 多个版本

可以将多个版本应用于控制器或路由。要使用多个版本，请将版本设置为数组。

要添加多个版本，请执行以下操作：

```typescript title="cats.controller.ts"
@Controller({
  version: ['1', '2'],
})
export class CatsController {
  @Get('cats')
  findAll(): string {
    return 'This action returns all cats for version 1 or 2';
  }
}

```

#### 版本“中性”

某些控制器或路由可能不关心版本，无论版本如何，它们的功能都是相同的。为了适应这种情况，可以将版本设置为 `VERSION_NEUTRAL` 符号。

无论指定了什么版本，包括请求根本不包含版本时，传入的请求都将映射到 `VERSION_NEUTRAL` 控制器或路由。

> warning **注意** 对于 URI 版本控制，`VERSION_NEUTRAL` 资源的 URI 中不会出现版本。

要添加版本中性的控制器或路由，请执行以下操作：

```typescript title="cats.controller.ts"
import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';

@Controller({
  version: VERSION_NEUTRAL,
})
export class CatsController {
  @Get('cats')
  findAll(): string {
    return 'This action returns all cats regardless of version';
  }
}

```

#### 全局默认版本

如果你不想为每个控制器或单个路由提供版本，或者希望某个特定版本作为未指定版本的每个控制器/路由的默认版本，你可以按如下方式设置 `defaultVersion`：

```typescript title="main.ts"
app.enableVersioning({
  // ...
  defaultVersion: '1'
  // or
  defaultVersion: ['1', '2']
  // or
  defaultVersion: VERSION_NEUTRAL
});

```

#### 中间件版本控制

[Middleware](/overview/middlewares) 还可以使用版本控制元数据来为特定路由版本配置中间件。为此，请将版本号作为 `MiddlewareConsumer.forRoutes()` 方法的参数之一提供：

```typescript title="app.module.ts"
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { LoggerMiddleware } from './common/middleware/logger.middleware.js';
import { CatsModule } from './cats/cats.module.js';
import { CatsController } from './cats/cats.controller.js';

@Module({
  imports: [CatsModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes({ path: 'cats', method: RequestMethod.GET, version: '2' });
  }
}

```

使用上述代码，`LoggerMiddleware` 将仅应用于 `/cats` 端点的版本 `'2'`。

> info **注意** 中间件适用于本节中描述的任何版本控制类型：`URI`、`Header`、`Media Type` 或 `Custom`。