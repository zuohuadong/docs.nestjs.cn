<!-- 此文件从 content/faq/raw-body.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T23:12:50.834Z -->
<!-- 源文件: content/faq/raw-body.md -->
<!-- 源哈希: c9232d2306545c851b8aa406e8a9949e -->

### 原始请求体

访问原始请求体最常见的原因之一是 webhook 签名验证。验证 webhook 签名通常需要未解析的请求体来计算 HMAC 哈希。

> warning **警告** 此功能仅在启用了内置全局请求体解析中间件时有效，即创建应用程序时不得传入 `bodyParser: false`。

#### 与 Express 配合使用

首先，在创建 Nest Express 应用程序时启用此选项：

```typescript
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';

// in the "bootstrap" function
const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  rawBody: true,
});
await app.listen(process.env.PORT ?? 3000);

```

要在控制器中访问原始请求体，请使用带有 `RawBodyRequest` 便利接口的请求类型，该接口暴露了 `rawBody` 字段：

```typescript
import { Controller, Post, type RawBodyRequest, Req } from '@nestjs/common';
import type { Request } from 'express';

@Controller('cats')
class CatsController {
  @Post()
  create(@Req() req: RawBodyRequest<Request>) {
    const raw = req.rawBody; // returns a `Buffer`.
  }
}

```

#### 注册不同的解析器

默认情况下，仅注册了 `json` 和 `urlencoded` 解析器。要使用不同的解析器，请显式注册它。

例如，要注册 `text` 解析器：

```typescript
app.useBodyParser('text');

```

> warning **警告** 确保向 `NestFactory.create()` 调用传入正确的应用程序类型。对于 Express 应用程序，正确类型是 `NestExpressApplication`；否则将找不到 `useBodyParser()` 方法。

#### 请求体解析器大小限制

如果您的应用程序需要解析大于 Express 默认值 `100kb` 的请求体，请提高限制：

```typescript
app.useBodyParser('json', { limit: '10mb' });

```

`useBodyParser()` 方法会尊重应用程序选项中传入的 `rawBody` 选项。

#### 与 Fastify 配合使用

首先，在创建 Nest Fastify 应用程序时启用此选项：

```typescript
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';

// in the "bootstrap" function
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter(),
  {
    rawBody: true,
  },
);
await app.listen(process.env.PORT ?? 3000);

```

要在控制器中访问原始请求体，请使用带有 `RawBodyRequest` 便利接口的请求类型，该接口暴露了 `rawBody` 字段：

```typescript
import { Controller, Post, type RawBodyRequest, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

@Controller('cats')
class CatsController {
  @Post()
  create(@Req() req: RawBodyRequest<FastifyRequest>) {
    const raw = req.rawBody; // returns a `Buffer`.
  }
}

```

#### 注册不同的解析器

默认情况下，仅注册了 `application/json` 和 `application/x-www-form-urlencoded` 解析器。要使用不同的解析器，请显式注册它。

例如，要注册 `text/plain` 解析器：

```typescript
app.useBodyParser('text/plain');

```

> warning **警告** 确保向 `NestFactory.create()` 调用传入正确的应用程序类型。对于 Fastify 应用程序，正确类型是 `NestFastifyApplication`；否则将找不到 `useBodyParser()` 方法。

#### 请求体解析器大小限制

如果您的应用程序需要解析大于 Fastify 默认值 1 MiB 的请求体，请提高限制：

```typescript
const bodyLimit = 10_485_760; // 10MiB
app.useBodyParser('application/json', { bodyLimit });

```

`useBodyParser()` 方法会尊重应用程序选项中传入的 `rawBody` 选项。