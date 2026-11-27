<!-- 此文件从 content/http/versioning.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:59:48.522Z -->
<!-- 源文件: content/http/versioning.md -->
<!-- 源哈希: 748d44fedffae13cf53074f7c115b858 -->

### 版本控制

> info **提示** 本章仅适用于基于 HTTP 的应用程序。

版本控制允许您在同一应用程序中运行 **不同版本** 的控制器或单个路由。应用程序变化频繁，您通常需要在支持应用程序先前版本的同时引入破坏性变更。

Nest 支持四种版本控制类型：

<table>
  <tr>
    <td><a href='http/versioning#uri-versioning-type'><code>URI 版本控制</code></a></td>
    <td>版本在请求的 URI 中传递（默认）</td>
  </tr>
  <tr>
    <td><a href='http/versioning#header-versioning-type'><code>Header 版本控制</code></a></td>
    <td>自定义请求头指定版本</td>
  </tr>
  <tr>
    <td><a href='http/versioning#media-type-versioning-type'><code>Media Type 版本控制</code></a></td>
    <td>请求的 <code>Accept</code> 头指定版本</td>
  </tr>
  <tr>
    <td><a href='http/versioning#custom-versioning-type'><code>自定义版本控制</code></a></td>
    <td>请求的任何方面都可以指定版本。您提供一个自定义函数来提取版本。</td>
  </tr>
</table>

#### URI 版本控制类型

URI 版本控制使用传递在请求 URI 中的版本，例如 `https://example.com/v1/route` 和 `https://example.com/v2/route`。

> warning **注意** 使用 URI 版本控制时，版本会自动添加到 <a href="faq/global-prefix">全局路径前缀</a>（如果存在）之后，并在任何控制器或路由路径之前。

要为应用程序启用 URI 版本控制，请执行以下操作：

```typescript title="main.ts"
const app = await NestFactory.create(AppModule);
// or "app.enableVersioning()"
app.enableVersioning({
  type: VersioningType.URI,
});
await app.listen(process.env.PORT ?? 3000);

```

> warning **注意** 默认情况下，URI 中的版本会自动加上 `v` 前缀。要更改前缀，请将 `prefix` 键设置为所需值，或设置为 `false` 以禁用它。

> info **提示** `VersioningType` 枚举可用于 `type` 属性，并从 `@nestjs/common` 包导入。

#### Header 版本控制类型

Header 版本控制使用自定义的、用户指定的请求头，其值指定了请求应使用的版本。

要为应用程序启用 **Header 版本控制**，请执行以下操作：

```typescript title="main.ts"
const app = await NestFactory.create(AppModule);
app.enableVersioning({
  type: VersioningType.HEADER,
  header: 'Custom-Header',
});
await app.listen(process.env.PORT ?? 3000);

```

`header` 属性是包含请求版本的头的名称。

> info **提示** `VersioningType` 枚举可用于 `type` 属性，并从 `@nestjs/common` 包导入。

#### Media Type 版本控制类型

Media Type 版本控制使用请求的 `Accept` 头来指定版本。

在 `Accept` 头中，版本与媒体类型用分号（`;`）分隔，后面跟着一个表示请求应使用版本的键值对，例如 `Accept: application/json;v=2`。键被视为版本的前缀，因此 `key` 属性必须包含键和分隔符。

要为应用程序启用 **Media Type 版本控制**，请执行以下操作：

```typescript title="main.ts"
const app = await NestFactory.create(AppModule);
app.enableVersioning({
  type: VersioningType.MEDIA_TYPE,
  key: 'v=',
});
await app.listen(process.env.PORT ?? 3000);

```

`key` 属性是包含版本的键值对的键和分隔符。对于 `Accept: application/json;v=2`，请将 `key` 属性设置为 `v=`。

> info **提示** `VersioningType` 枚举可用于 `type` 属性，并从 `@nestjs/common` 包导入。

#### 自定义版本控制类型

自定义版本控制使用请求的任何方面来指定版本（或多个版本）。Nest 使用一个 `extractor` 函数来分析传入的请求，该函数返回一个字符串或字符串数组。

如果请求者提供了多个版本，提取器函数可以返回一个从最高版本到最低版本的排序字符串数组。版本按从最高到最低的顺序与路由匹配。

如果 `extractor` 返回空字符串或空数组，则不匹配任何版本化路由，因此对其中一个请求会收到 `404` 响应状态。[`VERSION_NEUTRAL`](/http/versioning#version-neutral) 路由仍然匹配，当未设置任何 [global default version](/http/versioning#global-default-version) 时，未指定版本的路由也会匹配。

例如，如果传入请求指定支持版本 `1`、`2` 和 `3`，则 `extractor` **必须** 返回 `['3', '2', '1']`。这确保了首先选择最高可能的路由版本。

如果提取了版本 `['3', '2', '1']`，但路由仅存在于版本 `2` 和 `1`，则选择匹配版本 `2` 的路由（忽略版本 `3`）。

> warning **注意** 使用 Express 适配器时，请使您的 `extractor` 返回单个版本（一个字符串或包含一个元素的数组）。由于适配器的设计限制，从多元素数组中选择最高匹配版本**不可靠**。如果需要此行为，请使用支持单版本和最高匹配版本选择的 Fastify 适配器。

要为应用程序启用 **自定义版本控制**，请创建一个 `extractor` 函数并将其传递给 `enableVersioning()`：

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

#### 用法

版本控制允许您对控制器和单个路由进行版本控制，还允许某些资源选择不进行版本控制。无论应用程序使用哪种版本控制类型，用法都是相同的。

> warning **注意** 如果应用程序启用了版本控制，但控制器或路由未指定版本（且未设置任何 [global default version](/http/versioning#global-default-version)），则该控制器或路由表现得像一个 [`VERSION_NEUTRAL`](/http/versioning#version-neutral) 路由。在使用 URI 版本控制时，它仅在其路径上（不带版本）提供服务（`/cats`，而 `/v1/cats` 收到 `404` 响应状态）。在使用其他版本控制类型时，它提供请求中包含的任何版本，或不提供。包含没有对应控制器或路由的版本请求会收到 `404` 响应状态，当仅匹配版本化控制器或路由的路径时，没有版本的请求也会如此。

#### 控制器版本

可以为控制器应用版本，为该控制器内的所有路由设置版本。

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

可以为单个路由应用版本。此版本会覆盖任何影响该路由的其他版本，例如控制器版本。

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

可以为控制器或路由应用多个版本。要使用多个版本，请将版本设置为一个数组：

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

#### “中性”版本

某些控制器或路由无论版本如何表现都相同。为适应这种情况，请将版本设置为 `VERSION_NEUTRAL` 符号。

无论请求指定了什么版本，传入的 ⟦Request⟧ 都会被映射到 `VERSION_NEUTRAL` 控制器或路由，即使请求完全不包含版本。

> warning **注意** 使用 URI 版本控制时，`VERSION_NEUTRAL` 资源在其 URI 中不包含版本。

要添加一个版本中立的控制器或路由，请执行以下操作：

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

> warning **注意** 在任何指定了版本的控制器或路由之后注册版本中立的控制器或路由，或者在没有设置 [global default version](/http/versioning#global-default-version) 时不指定版本的控制器或路由：将其放在模块的 `controllers` 数组的后面、在同一控制器中在它们下面声明，或放在注册在该模块之后的模块中。模块自身的控制器在它导入的模块之前注册，导入模块的顺序遵循 `imports` 数组。在使用 Express 适配器和除 URI 版本控制外的任何版本控制类型时，共享路径的路由会按注册顺序尝试，因此首先注册的版本中立路由也会接收本应发送给有版本路由的请求。

#### 全局默认版本

如果您不希望为每个控制器或单个路由提供版本，或者您希望特定版本作为未指定版本的每个控制器或路由的默认值，请按如下方式设置 `defaultVersion`：

```typescript title="main.ts"
app.enableVersioning({
  // ...
  defaultVersion: '1',
  // or: defaultVersion: ['1', '2'],
  // or: defaultVersion: VERSION_NEUTRAL,
});

```

#### 中间件版本控制

[Middleware](/overview/middlewares) 也可以使用版本元数据来针对特定的路由版本。为此，请在传递给 `MiddlewareConsumer.forRoutes()` 方法的路由对象中设置 `version` 属性：

```typescript title="app.module.ts"
import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
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

在使用 URI 版本控制时，上述代码仅将 `LoggerMiddleware` 应用于 `/cats` 端点的版本 `'2'`，因为每个版本都在其自己的路径上提供服务。

> warning **注意** 使用 Header、Media Type 或自定义版本控制时，端点的所有版本共享一个路径，因此中间件会为所有版本的 `/cats` 的请求运行。要使用这些版本控制类型为单个版本运行代码，请在该版本的控制器或路由处理程序上使用守卫或拦截器。