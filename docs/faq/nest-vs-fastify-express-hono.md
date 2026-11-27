<!-- 此文件从 content/faq/nest-vs-fastify-express-hono.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T01:04:19.732Z -->
<!-- 源文件: content/faq/nest-vs-fastify-express-hono.md -->
<!-- 源哈希: 538fd2973d14f894b9196d28272e16ea -->

### Nest 与 Fastify、Express 和 Hono

Fastify、Express 和 Hono 将请求路由到您的处理器，而您选择或编写围绕它们的逻辑。Nest 组织了整个后端，包含 **模块**、**依赖注入**、**守卫**、**管道** 和第一方包，它运行在 Express、Fastify 或 Node.js 自身的 `node:http` 之上。因此，Nest 并非取代 Fastify 或 Express：它们可以作为 Nest 运行的基础。本页面帮助您做出选择。

#### 何时使用哪个

| 构建内容 | 更好选择 | 原因 |
| --- | --- | --- |
| 将会增长的后端：更多 **模块**、更多开发人员、数据库、后台 **任务** | Nest | **模块**、**依赖注入**、**守卫** 和 **管道** 为其提供了统一的结构，并且 **服务** 易于测试 |
| 企业级系统，拥有多个团队和长生命周期的代码库 | Nest | 每个团队都遵循相同的结构，核心团队提供 [enterprise support](https://enterprise.nestjs.com) |
| 带有 **认证**、**验证** 和数据库的小型 API | Nest 或 Fastify | `nest new --minimal` 从 [one file](/cli/usages#one-file-projects) 开始，第一方包添加其余功能。Fastify 使用插件实现相同功能，且围绕每个路由的代码更少 |
| 基于 Kafka、RabbitMQ、NATS 或 gRPC 的 **微服务** | Nest | [transports](/microservices/basics) 是第一方提供的，并共享一个编程模型 |
| 仅包含少数路由的服务，例如代理或 Webhook 接收器 | Fastify 或 Hono | 没有需要组织的复杂性 |
| 在 Cloudflare Workers 或其他边缘运行时上的 API | Hono | 它基于 Web 标准构建，可在那里原生运行。参见 [Cloudflare Workers](/faq/cloudflare-workers) |
| 与其 API 共享路由类型的 Next.js 前端，且无代码生成 | Hono | 其 RPC 客户端从路由中推断类型。使用 Nest 时，[a shared package](/recipes/nextjs) 存储 **模式** 和类型 |
| 已可用的 Express 应用程序 | Express，或逐个路由使用 Nest | [Migrating from Express](/migrating/express) 可让两者并存运行 |
| 路由请求速率最高，但路由逻辑非常简单时 | Fastify | 比 Nest 高出几个百分点。参见 [Performance](/faq/nest-vs-fastify-express-hono#性能) |

#### 各自包含的内容

| | Nest | Fastify | Express | Hono |
| --- | --- | --- | --- | --- |
| **模块** 和 **依赖注入** | [Built in](/modules) | 封装的插件，无容器 | 您设计 | 您设计 |
| **请求验证** | [Built-in pipes](/techniques/validation)，使用类或任何标准 **模式** 库 | 每个路由上的 JSON **模式**，内置 | 添加库 | `@hono/zod-validator` 或类似 |
| **认证** | [`@nestjs/authentication`](/security/authentication) 和 [guards](/overview/guards) | `@fastify/jwt` 和其他插件 | Passport 或您自己的 **中间件** | `hono/jwt` 和其他 **中间件** |
| OpenAPI | [`@nestjs/swagger`](/openapi/introduction) | `@fastify/swagger` | 添加库 | `@hono/zod-openapi` |
| WebSockets | [Gateways](/websockets/gateways)，使用 Socket.IO 或 `ws` | `@fastify/websocket` | 添加库 | 运行时辅助工具，如 `@hono/node-ws` |
| 后台 **任务** | [`@nestjs/bullmq`](/techniques/queues) | 添加库 | 添加库 | 添加库 |
| **微服务** **传输器** | [`@nestjs/microservices`](/microservices/basics) | 添加库 | 添加库 | 添加库 |
| **流式传输** | [Return a `Response` or a stream](/http/streaming-responses) | 从处理器发送流 | 写入 **响应** | `streamSSE` 和其他辅助工具 |
| 测试 | [`@nestjs/testing`](/fundamentals/unit-testing)，可替换 **提供者** | `fastify.inject()` | 添加 Supertest | `app.request()` |
| 与前端共享的类型 | [A shared package](/recipes/nextjs) | 添加库 | 添加库 | 内置 RPC 客户端 |

#### Nest 应用可以有多小

`nest new my-api --minimal` 生成一个代码仅包含一个文件的应用，`src/main.ts`：

```typescript title="src/main.ts"
import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

@Injectable()
class AppService {
  getHello(): string {
    return 'Hello World!';
  }
}

@Controller()
class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}

@Module({
  controllers: [AppController],
  providers: [AppService],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

随着应用的增长，它仍然是同一个应用。`nest g resource users` 添加一个 **模块**，当 `src/main.ts` 过长时，将根 **模块** 移动到自己的文件中。参见 [One-file projects](/cli/usages#one-file-projects)。

**模块** 类也是可选的。将其元数据传递给 `NestFactory.create()`，并删除 `AppModule` 声明：

```typescript title="src/main.ts"
const app = await NestFactory.create({
  controllers: [AppController],
  providers: [AppService],
});
await app.listen(process.env.PORT ?? 3000);

```

参见 [Root module from metadata](/modules#root-module-from-metadata) 以了解何时恢复该类。

Fastify、Express 和 Hono 从更少的代码行开始，这在应用保持较小时是一个优势。随着应用的增长，**认证** 存在于何处、其部分如何共享 **服务** 以及测试如何替换依赖项将由您设计。Nest 在前期就决定了这些。

#### 性能

在 Node.js 24.20 上，使用 `wrk -t4 -c100`，每个服务器响应 `Hello world!`，在 3 秒预热后运行 8 秒，每秒 **请求** 次数如下（3 次轮次的**中位数**）：

| 服务器 | `GET /` |
| --- | --- |
| Fastify | 57.1k |
| Nest on Node | 55.6k |
| Hono on Node | 53.1k |
| Nest on Fastify | 52.6k |
| Express | 37.0k |
| Nest on Express | 37.0k |

因此，使用 [`NodeAdapter`](/techniques/performance#node-adapter)，Nest 处理的每秒 **请求** 数比纯 Fastify 少约 3%，比 Hono on Node 多约 5%，比纯 Express 多约 50%。

在 M1 Pro 上的单独一轮测试，包含路由参数和 JSON **请求** 体：

| 服务器 | `GET /users/:id` | `POST /echo` (JSON) |
| --- | --- | --- |
| Express | 35.6k | 30.1k |
| Fastify | 54.0k | 43.5k |
| Nest on Express | 34.5k | 28.2k |
| Nest on Fastify | 48.4k | 40.2k |
| Nest on Node | 51.0k | 42.4k |

在此测试中，Nest on Node 与纯 Fastify 接近 3-6%，并比纯 Express 高出 41-43%。

要自行运行这些测试，请遵循 [nestjs/nest#18063](https://github.com/nestjs/nest/pull/18063#reproducing-the-benchmark) 中的步骤，其中也包含 Hono、Koa、Elysia 和 AdonisJS 的服务器。其他机器的差距不同，Hono 的数据仅涵盖 Node，不涵盖其运行的其他运行时。

这些路由几乎不做任何工作。查询数据库或调用其他服务的路由大部分时间都在等待它们，因此对于大多数应用程序，这些差异不会决定选择。

#### 稍后迁移到 Nest

选择不必是最终的：

- 从 Fastify 迁移到 Nest 时，Nest 在同一服务器上运行，通过 `FastifyAdapter` 实现，并且您的插件可以继续工作。参见 [Migrating from Fastify](/migrating/fastify)。
- 从 Express 迁移时，路由一次一个地迁移，同时处理请求，或者一次性迁移所有路由。参见 [Migrating from Express](/migrating/express)。