<!-- 此文件从 content/reliability/terminus.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:45:22.000Z -->
<!-- 源文件: content/reliability/terminus.md -->
<!-- 源哈希: 51e5f0ea3e2b4a18801c513aca118023 -->

### 健康检查

Terminus 集成提供**就绪性/活性**健康检查。健康检查在复杂的后端设置中至关重要。在 Web 开发中，健康检查通常由一个专用的地址组成，例如 `https://my-website.com/health/readiness`。
基础设施中的一个服务或组件（例如 [Kubernetes](https://kubernetes.io/)）会持续检查此地址。根据对该地址的 `GET` 请求返回的 HTTP 状态码，当服务收到“不健康”的响应时会采取行动。
由于“健康”或“不健康”的定义取决于您提供的服务类型，**Terminus** 集成提供了一组**健康指标**。

例如，如果您的 Web 服务器使用 MongoDB 存储数据，MongoDB 是否仍在运行是至关重要的信息。
在这种情况下，您可以使用 `MongooseHealthIndicator`。配置后（如下所述），您的健康检查地址将根据 MongoDB 是否正在运行返回健康的或不健康的 HTTP 状态码。

#### 入门

要开始使用 `@nestjs/terminus`，请安装所需的依赖项：

```bash
$ npm install --save @nestjs/terminus

```

#### 设置健康检查

健康检查代表**健康指标**的摘要。健康指标检查服务是否处于健康或不健康状态。如果所有分配的健康指标都正在运行，则健康检查为正面。

要开始我们的第一个健康检查，让我们创建 `HealthModule` 并将其 `TerminusModule` 添加到其 `imports` 数组中。

> info **提示** 使用 [Nest CLI](/cli/overview) 创建模块，请运行 `$ nest g module health` 命令。

```typescript title="health.module.ts"
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

@Module({
  imports: [TerminusModule]
})
export class HealthModule {}

```

健康检查由一个 [controller](/overview/controllers) 执行，您可以使用 [Nest CLI](/cli/overview) 生成它。

```bash
$ nest g controller health

```

> info **提示** 我们强烈建议在应用程序中启用关闭钩子。启用后，Terminus 集成使用此生命周期事件来报告 `'shutting_down'` 状态并应用 [graceful shutdown timeout](#graceful-shutdown-timeout)。更多信息请参阅 [application shutdown](/fundamentals/lifecycle-events#application-shutdown) 部分。

#### 活性和就绪性

安装了 `@nestjs/terminus`、导入了 `TerminusModule` 并创建了新的控制器后，您就可以创建健康检查了。

Kubernetes 等编排器会提出两个不同的问题，因此大多数应用程序有两个健康检查：

- **活性 (Liveness)**：进程是否损坏？如果此检查失败，编排器将重启容器。不要在这里检查依赖项。重启并不能修复宕机的数据库。
- **就绪性 (Readiness)**：应用程序现在是否可以提供请求？如果此检查失败，编排器将停止发送流量，直到检查再次通过。检查应用程序不能没有的依赖项。

```typescript title="health.controller.ts"
import { Controller, Get } from '@nestjs/common';
import { HealthCheckService, FetchHealthIndicator, DiskHealthIndicator, HealthCheck } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: FetchHealthIndicator,
    private disk: DiskHealthIndicator,
  ) {}

  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.http.pingCheck('payments', 'https://payments.example.com/health'),
      () => this.disk.checkStorage('storage', { path: '/', thresholdPercent: 0.9 }),
    ]);
  }
}

```

活性检查没有指标：一个答案表明进程是存活的。您仍然可以添加仅检查进程本身的指标，例如 [memory health indicator](#memory-health-indicator)。

如果支付 API 响应正常且磁盘使用率低于 90%，则 `http://localhost:3000/health/ready` 路由返回以下对象，状态码为 `200`：

```json
{
  "status": "ok",
  "info": {
    "payments": { "status": "up", "responseTime": 87 },
    "storage": { "status": "up", "responseTime": 1 }
  },
  "error": {},
  "details": {
    "payments": { "status": "up", "responseTime": 87 },
    "storage": { "status": "up", "responseTime": 1 }
  }
}

```

`@nestjs/terminus` 包将此响应对象的类型导出为 `HealthCheckResult`。

|           |                                                                                                                                                                                             |                                      |
|-----------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------|
| `status`  | 如果任何健康指标失败，状态为 `'error'`。如果没有指标失败但至少有一个是 `'degraded'`，状态为 `'degraded'`。如果 Nest 应用程序正在关闭但仍接受 HTTP 请求，状态为 `'shutting_down'`。 | `'error' \| 'ok' \| 'degraded' \| 'shutting_down'` |
| `info`    | 包含有关每个健康指标信息的对象，其状态为 `'up'` 或 `'degraded'`，换言之，“仍在提供服务”。                                                                              | `object`                             |
| `error`   | 包含有关每个健康指标信息的对象，其状态为 `'down'`，换言之，“不健康”。                                                                          | `object`                             |
| `details` | 包含有关每个健康指标信息的对象。                                                                                                                                | `object`                             |

健康检查的状态由其指标决定：

| 指标 | `status` | HTTP 状态码 |
|---|---|---|
| 所有 `'up'` | `'ok'` | `200` |
| 至少一个 `'degraded'`，没有 `'down'` | `'degraded'` | `200` |
| 至少一个 `'down'` | `'error'` | `503` |

#### 内置健康指标

由于许多应用程序需要相似的健康指标，[`@nestjs/terminus`](https://github.com/nestjs/terminus) 提供了一组预定义的指标：

| 指标 | 检查内容 | 所需包 |
|---|---|---|
| [`FetchHealthIndicator`](#http-health-check) (替换已弃用的 `HttpHealthIndicator`) | HTTP 端点是否响应 | 无 |
| [`TypeOrmHealthIndicator`](#typeorm-health-indicator) | 数据库是否响应查询 | `@nestjs/typeorm`, `typeorm` |
| [`MongooseHealthIndicator`](#other-database-indicators) | 数据库是否响应 ping | `@nestjs/mongoose`, `mongoose` |
| [`SequelizeHealthIndicator`](#other-database-indicators) | 数据库是否响应查询 | `@nestjs/sequelize`, `sequelize` |
| [`MikroOrmHealthIndicator`](#other-database-indicators) | 数据库是否响应查询 | `@mikro-orm/nestjs`, `@mikro-orm/core` |
| [`PrismaHealthIndicator`](#other-database-indicators) | 数据库是否响应查询 | `@prisma/client` |
| [`MicroserviceHealthIndicator`](#microservice-health-indicator) | 微服务传输是否连接 | `@nestjs/microservices` |
| [`GRPCHealthIndicator`](#grpc-health-indicator) | gRPC 服务是否报告 `SERVING` | `@nestjs/microservices`, `@grpc/grpc-js`, `@grpc/proto-loader` |
| [`MemoryHealthIndicator`](#memory-health-indicator) | 进程内存是否低于限制 | 无 |
| [`DiskHealthIndicator`](#disk-health-indicator) | 磁盘使用率是否低于限制 | 无 |

Terminus 只加载你注入的指标的包。

#### HTTP 健康检查

`FetchHealthIndicator` 使用原生的 `fetch()` 函数检查 HTTP 端点：

```typescript title="health.controller.ts"
// Within the `HealthController`-class

@Get()
@HealthCheck()
check() {
  return this.health.check([
    () => this.http.pingCheck('nestjs-docs', './'),
  ]);
}

```

如果地址在一秒内以 `2xx` 状态码响应，则该指标是 `'up'`。

##### 检查特定的 HTTP 响应码

在某些情况下，你可能希望检查特定的标准并验证响应。例如，假设
`https://my-external-service.com` 返回 `204` 响应码。使用 `verify` 选项，你可以
专门检查该响应码，并将所有其他代码视为不健康。

`verify` 是一个函数（同步或异步），它接收响应并返回一个布尔值，指示它是否被认为是健康的（`true`）或不健康的（`false`）。

```typescript title="health.controller.ts"
// Within the `HealthController`-class

@Get()
@HealthCheck()
check() {
  return this.health.check([
    () =>
      this.http.pingCheck('my-external-service', 'https://my-external-service.com', {
        verify: (res) => res.status === 204,
      }),
  ]);
}

```

如果服务返回不健康的响应，该响应的 `statusCode` 和 `statusText` 会被添加到结果中。

##### 使用另一个 HTTP 客户端

默认情况下，请求使用原生的 `fetch()` 函数发送。要使用自己的 HTTP 客户端，请在 `fetch` 选项中传入一个函数。

使用 [`@nestjs/http-client`](/application/http-client)，传入 `request()` 方法：

```typescript
this.http.pingCheck('billing', 'https://billing.example.com/health', {
  fetch: this.httpClient.request,
});

```

客户端在 `4xx` 或 `5xx` 响应时抛出错误，并且默认会在检查超时时间内重试其中一些，例如 `503`。要使用 `verify` 检查此类响应，请将 `throwOnHttpError` 和 `retry` 设置为 `false`：

```typescript
this.http.pingCheck('billing', 'https://billing.example.com/health', {
  fetch: (url, init) => this.httpClient.request(url, { ...init, throwOnHttpError: false, retry: false }),
  verify: (res) => res.status === 503,
});

```

使用 `@nestjs/axios`，将 Observable 转换为 Promise：

```typescript
this.http.pingCheck('billing', 'https://billing.example.com/health', {
  fetch: (url, init) => lastValueFrom(this.httpService.request({ url, ...init })),
});

```

> warning **警告** `HttpHealthIndicator` 需要 `@nestjs/axios` 包，现已弃用。请改用 `FetchHealthIndicator`。

#### TypeOrm 健康指标

Terminus 允许你向健康检查中添加数据库检查。在使用此健康指标之前，请阅读
[database](/recipes/sql-typeorm) 章节，并确保应用程序的数据库连接已建立。

> info **提示** 在幕后，`TypeOrmHealthIndicator` 执行一个 `SELECT 1` SQL 命令，该命令通常用于验证数据库是否仍然存活。对于 Oracle 数据库，它使用 `SELECT 1 FROM DUAL`；对于 SAP HANA，使用 `SELECT now() FROM dummy`。

将 `TypeOrmHealthIndicator` 注入到你的 `HealthController` 中并将其添加到健康检查：

```typescript title="health.controller.ts"
// Within the `HealthController`-class

@Get()
@HealthCheck()
check() {
  return this.health.check([
    () => this.db.pingCheck('database').withTimeout('1s'),
  ]);
}

```

如果数据库可达，向 `http://localhost:3000/health` 发出的 `GET` 请求将返回以下 JSON 结果：

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up", "responseTime": 12 }
  },
  "error": {},
  "details": {
    "database": { "status": "up", "responseTime": 12 }
  }
}

```

如果你的应用程序使用 [multiple databases](/recipes/sql-typeorm#多个数据库)，请将每个数据源注入到你的 `HealthController` 中。然后，使用 `connection` 选项将数据源引用传递给 `TypeOrmHealthIndicator`。

```typescript title="health.controller.ts"
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    @InjectDataSource('albumsConnection')
    private albumsConnection: DataSource,
    @InjectDataSource()
    private defaultConnection: DataSource,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('albums-database', { connection: this.albumsConnection }).withTimeout('1s'),
      () => this.db.pingCheck('database', { connection: this.defaultConnection }).withTimeout('1s'),
    ]);
  }
}

```

#### 其他数据库指标

其他数据库指标的工作方式类似于 `TypeOrmHealthIndicator`。注入指标并添加其检查：

```typescript
this.mongoose.pingCheck('mongodb');
this.sequelize.pingCheck('database');
this.mikroOrm.pingCheck('database');
this.prisma.pingCheck('database', this.prismaClient);

```

#### 磁盘健康指标

`DiskHealthIndicator` 检查使用的存储量。要开始，请将 `DiskHealthIndicator` 注入到你的 `HealthController` 中。以下示例检查路径 `/`（在 Windows 上使用 `C:\\`）使用的存储空间。如果总存储空间的占用超过 50%，健康检查将报告不健康状态。

```typescript title="health.controller.ts"
// Within the `HealthController`-class

@Get()
@HealthCheck()
check() {
  return this.health.check([
    () => this.disk.checkStorage('storage', { path: '/', thresholdPercent: 0.5 }),
  ]);
}

```

`DiskHealthIndicator.checkStorage()` 方法还可以根据固定空间量进行检查。
如果路径 `/` 使用的存储空间超过 250GB，则以下示例不健康。

```typescript title="health.controller.ts"
// Within the `HealthController`-class

@Get()
@HealthCheck()
check() {
  return this.health.check([
    () => this.disk.checkStorage('storage', { path: '/', threshold: '250gb' })
  ]);
}

```

#### 内存健康指标

使用 `MemoryHealthIndicator` 确保你的进程不超过特定的内存限制。
以下示例检查进程的堆内存。

> info **提示** 堆是动态分配的内存所在的内存部分。`checkHeap()` 将 `process.memoryUsage()`（当前使用的 V8 堆内存）报告的 `heapUsed` 值与给定阈值进行比较：一个字节数或一个字符串，例如 `'512kb'`、`'150mb'` 或 `'2gb'`。

```typescript title="health.controller.ts"
// Within the `HealthController`-class

@Get()
@HealthCheck()
check() {
  return this.health.check([
    () => this.memory.checkHeap('memory_heap', '150mb'),
  ]);
}

```

你也可以使用 `MemoryHealthIndicator.checkRSS()` 验证进程的 RSS。以下示例如果进程分配超过 150MB，则返回不健康的响应码。

> info **提示** RSS（常驻集大小）显示分配给进程并保留在 RAM 中的内存量。
> 它不包括被交换出去的内存。它包括来自共享库的内存，前提是来自这些库的页面确实在内存中，以及所有堆栈和堆内存。

```typescript title="health.controller.ts"
// Within the `HealthController`-class

@Get()
@HealthCheck()
check() {
  return this.health.check([
    () => this.memory.checkRSS('memory_rss', '150mb'),
  ]);
}

```

#### 微服务健康指标

`MicroserviceHealthIndicator` 检查你的应用程序是否可以连接到 [microservice transport](/microservices/basics)，例如 Redis、NATS 或 TCP。它需要 `@nestjs/microservices` 包和传输的包。

传入你为该传输客户端使用的相同 `transport` 和 `options`。以下示例检查 Redis 服务器：

```typescript title="health.controller.ts"
// Within the `HealthController`-class

@Get()
@HealthCheck()
check() {
  return this.health.check([
    () =>
      this.microservice.pingCheck<RedisOptions>('redis', {
        transport: Transport.REDIS,
        options: { host: 'localhost', port: 6379 },
      }),
  ]);
}

```

如果在一秒内未建立连接，则该指标是 `'down'`。

#### gRPC 健康指标

`GRPCHealthIndicator` 检查实现标准 [gRPC health checking protocol](https://github.com/grpc/grpc/blob/master/doc/health-checking.md) 的 [gRPC](/microservices/grpc) 服务。它需要 `@nestjs/microservices`、`@grpc/grpc-js` 和 `@grpc/proto-loader` 包。

第二个参数是需要查询的服务名称。如果服务在一秒内报告 `SERVING`，则该指标是 `'up'`。

```typescript title="health.controller.ts"
// Within the `HealthController`-class

@Get()
@HealthCheck()
check() {
  return this.health.check([
    () =>
      this.grpc.checkService<GrpcOptions>('hero_service', 'hero.health.v1', {
        url: 'localhost:5000',
      }),
  ]);
}

```

#### 自定义健康指标

在某些情况下，由 `@nestjs/terminus` 提供的预定义健康指标无法满足所有健康检查要求。在这种情况下，你可以创建一个自定义健康指标。

大多数健康指标遵循相同的模式：执行一个操作，如果成功则将指标标记为 `'up'`，如果失败则标记为 `'down'`。`HealthIndicatorService` 使用 `attempt()` 实现了此模式。为了展示指标的结构，我们将创建一个示例 `QueueHealthIndicator`。只要 `emails` [queue](/techniques/queues) 在一秒内响应，它就处于 `'up'` 状态。

```typescript title="queue.health.ts"
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { Queue } from 'bullmq';

@Injectable()
export class QueueHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @InjectQueue('emails') private readonly queue: Queue,
  ) {}

  isHealthy(key: string) {
    return this.healthIndicatorService
      .check(key)
      .attempt(() => this.queue.getWaitingCount())
      .withSuccessData((waiting) => ({ waiting }))
      .withTimeout('1s');
  }
}

```

`attempt()` 接受一个同步或异步函数，一旦解析就将指标标记为 `'up'`。`withSuccessData()` 接收函数返回的值，并选择添加到结果中的数据（参见 [Additional data](#additional-data)）。如果函数抛出错误，则指标被标记为 `'down'`，并将错误消息添加到结果中。在这两种情况下，函数的耗时都会报告为 `responseTime`。`withTimeout()` 限制了尝试可以花费的时间（参见 [Configuring a check](#configuring-a-check)）。

接下来，将健康指标注册为提供者：

```typescript title="health.module.ts"
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller.js';
import { QueueHealthIndicator } from './queue.health.js';

@Module({
  controllers: [HealthController],
  imports: [TerminusModule, BullModule.registerQueue({ name: 'emails' })],
  providers: [QueueHealthIndicator],
})
export class HealthModule {}

```

最后一步是将新的健康指标添加到健康检查端点：

```typescript title="health.controller.ts"
import { HealthCheckService, HealthCheck } from '@nestjs/terminus';
import { Controller, Get } from '@nestjs/common';
import { QueueHealthIndicator } from './queue.health.js';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private queueHealthIndicator: QueueHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  healthCheck() {
    return this.health.check([
      () => this.queueHealthIndicator.isHealthy('queue'),
    ]);
  }
}

```

如果队列及时响应，健康检查返回以下结果：

```json
{
  "status": "ok",
  "info": {
    "queue": { "status": "up", "waiting": 3, "responseTime": 4 }
  },
  "error": {},
  "details": {
    "queue": { "status": "up", "waiting": 3, "responseTime": 4 }
  }
}

```

> info **提示** Terminus 会自行执行尝试，因此您可以直接将尝试传递给 `health.check([...])`（`this.queueHealthIndicator.isHealthy('queue')`），或像上面示例中那样将其包装在一个函数中。

##### 使用 up() 和 down() 进行显式控制

有时“健康”意味着“操作没有抛出异常”之外的更多含义。要自行决定状态，请直接返回 `up()` 或 `down()`，而不是使用 `attempt()`。下面的指标仅在缓存连接时才算健康。

```typescript title="cache.health.ts"
@Injectable()
export class CacheHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly cache: CacheService,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);
    const isConnected = await this.cache.isConnected();

    if (!isConnected) {
      return indicator.down('cache unreachable');
    }

    return indicator.up();
  }
}

```

`up()` 和 `down()` 都接受一个包含附加数据的对象（该对象会附加到结果中），或一个字符串（该字符串作为 `message` 属性添加）。

##### 降级状态

并非所有问题都要求将应用程序移出轮换。例如，不可达的缓存会减慢应用程序速度，但不会使其崩溃。对于这种情况，指标可以返回 `degraded()`。降级指标不会使健康检查失败：它会列在 `info` 下，总体状态变为 `'degraded'`，HTTP 状态码保持 `200`。编排器会继续路由流量，同时状态在监控中可见。

```typescript title="cache.health.ts"
// Within the `CacheHealthIndicator`-class
if (!isConnected) {
  return indicator.degraded('cache unreachable, serving without cache');
}

```

```json
{
  "status": "degraded",
  "info": {
    "cache": { "status": "degraded", "message": "cache unreachable, serving without cache" }
  },
  "error": {},
  "details": {
    "cache": { "status": "degraded", "message": "cache unreachable, serving without cache" }
  }
}

```

与 `up()` 和 `down()` 类似，`degraded()` 接受一个包含附加数据的对象或一个消息字符串。一旦任何指标处于 `'down'` 状态，无论降级指标如何，总体状态都为 `'error'`。

> warning **警告** 使用 `up()`、`down()` 和 `degraded()` 构建的健康指标通过返回其中一个来报告其状态。此类指标抛出的错误被视为 Bug，而不是不健康状态：它会中止整个健康检查，导致 `500` 响应而不是 `503`。如果您的指标包装了一个可能抛出错误的**操作**，请使用 `attempt()`，它会将抛出的错误转换为 `'down'` 状态。

#### 配置检查

使用 `attempt()` 构建的每个检查都会返回一个 `HealthCheckAttempt`。这包括您的自定义指标以及内置指标，但不包括已弃用的 `HttpHealthIndicator`。在执行尝试之前，您可以通过链式调用以下方法进行配置。链式调用的顺序不重要。

每次值都是毫秒数或字符串，例如 `'200ms'`、`'2s'` 或 `'15m'`。

##### 超时

`withTimeout()` 限制了尝试可以花费的时间。时间到期后，指标被标记为 `'down'`，并且您的函数接收到的作为其参数属性的 `signal` 会被中止。请将该 `signal` 传递给底层**操作**，例如传递给 `fetch()`，以便它也被取消，而不是在后台挂起。

```typescript title="health.controller.ts"
// Within the `HealthController`-class
@Get()
@HealthCheck()
check() {
  return this.health.check([
    () => this.db.pingCheck('database').withTimeout('1.5s'),
    () => this.queueHealthIndicator.isHealthy('queue'),
  ]);
}

```

如果自定义指标的队列在一秒内没有响应，健康检查将返回以下结果：

```json
{
  "status": "error",
  "info": {
    "database": { "status": "up", "responseTime": 12 }
  },
  "error": {
    "queue": { "status": "down", "message": "timeout of 1000ms exceeded", "responseTime": 1001 }
  },
  "details": {
    "database": { "status": "up", "responseTime": 12 },
    "queue": { "status": "down", "message": "timeout of 1000ms exceeded", "responseTime": 1001 }
  }
}

```

> warning **警告** 内置数据库、微服务和 gRPC 指标（例如 `this.db.pingCheck('database', { timeout: 1500 })`）的 `timeout` 选项已弃用。请在返回的尝试上链式调用 `.withTimeout()`。

##### 缓存

编排器通常每隔几秒轮询健康检查，而有些检查在每次**请求**上运行的成本太高。`cacheFor()` 为给定时间缓存了尝试的结果。只要存在新鲜结果，函数就不会再次执行，并且并发健康检查共享单个进行中的执行。缓存跨**请求**共享，并以指标键为键。

```typescript title="health.controller.ts"
// Within the `HealthController`-class
@Get()
@HealthCheck()
check() {
  return this.health.check([
    () => this.db.pingCheck('database').withTimeout('1.5s').cacheFor('5s'),
  ]);
}

```

从缓存中提供的结果被标记为 `cachedResponse: true`：

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up", "responseTime": 12, "cachedResponse": true }
  },
  "error": {},
  "details": {
    "database": { "status": "up", "responseTime": 12, "cachedResponse": true }
  }
}

```

##### 慢速检查

仍然响应但缓慢的依赖项不被视为 `'down'`。如果尝试成功但花费了给定时间或更长时间，`degradedAfter()` 会将其标记为 `'degraded'` 而不是 `'up'`。将其与 `withTimeout()` 结合使用，以决定何时慢速变为 `'down'`。

```typescript title="health.controller.ts"
// Within the `HealthController`-class
@Get()
@HealthCheck()
check() {
  return this.health.check([
    // < 200ms: up, 200-1000ms: degraded, > 1000ms: down
    () => this.db.pingCheck('database').degradedAfter('200ms').withTimeout('1s'),
  ]);
}

```

如果数据库在 800 毫秒后响应，健康检查仍然返回状态码 `200`，但报告 `'degraded'` 状态（参见 [Degraded state](#degraded-state)）：

```json
{
  "status": "degraded",
  "info": {
    "database": { "status": "degraded", "responseTime": 800 }
  },
  "error": {},
  "details": {
    "database": { "status": "degraded", "responseTime": 800 }
  }
}

```

##### 非关键检查

有些依赖项不需要提供**请求**。例如，如果 `emails` 队列不可达，电子邮件稍后发送，但应用程序仍然可以工作。您希望在健康检查中看到问题，但编排器不应将应用程序移出轮换。`degradedOnFailure()` 会将失败的尝试标记为 `'degraded'` 而不是 `'down'`。这适用于抛出的错误和超时。错误消息保留在结果中。

```typescript title="health.controller.ts"
// Within the `HealthController`-class
@Get()
@HealthCheck()
check() {
  return this.health.check([
    () => this.db.pingCheck('database').withTimeout('1.5s'),
    () => this.queueHealthIndicator.isHealthy('queue').degradedOnFailure(),
  ]);
}

```

如果队列未及时响应，健康检查将返回状态码 `200` 和以下结果：

```json
{
  "status": "degraded",
  "info": {
    "database": { "status": "up", "responseTime": 12 },
    "queue": { "status": "degraded", "message": "timeout of 1000ms exceeded", "responseTime": 1001 }
  },
  "error": {},
  "details": {
    "database": { "status": "up", "responseTime": 12 },
    "queue": { "status": "degraded", "message": "timeout of 1000ms exceeded", "responseTime": 1001 }
  }
}

```

您可以在同一个尝试上组合这两种方法。慢速尝试和失败尝试都将是 `'degraded'`；只有失败的尝试具有 `message`。

##### 附加数据

有三种方法将您自己的数据添加到检查结果中：

- `withData()` 向每个结果添加静态数据，例如拥有某个依赖项的团队。
- `withSuccessData()` 在检查成功时，从尝试函数返回的值中提取数据。
- `withFailureData()` 在检查失败时，从错误中提取数据。

```typescript
this.healthIndicatorService
  .check('payments')
  .attempt(() => this.payments.ping())
  .withData({ owner: 'team-billing' })
  .withSuccessData((result) => ({ region: result.region }))
  .withFailureData((error) => ({ code: (error as PaymentError).code }));

```

如果支付服务拒绝连接，结果如下所示：

```json
{
  "status": "error",
  "info": {},
  "error": {
    "payments": { "status": "down", "message": "connect ECONNREFUSED 10.0.0.7:443", "owner": "team-billing", "code": "ECONNREFUSED", "responseTime": 4 }
  },
  "details": {
    "payments": { "status": "down", "message": "connect ECONNREFUSED 10.0.0.7:443", "owner": "team-billing", "code": "ECONNREFUSED", "responseTime": 4 }
  }
}

```

`withSuccessData()` 和 `withFailureData()` 接受同步或异步函数，或一个对象。这些方法也适用于内置指示器，例如 `this.db.pingCheck('database').withData({ owner: 'team-billing' })`。

添加数据时请记住以下几点：

- 对同一方法的调用会被合并，最后一个调用生效。
- 键 `status`、`responseTime` 和 `cachedResponse` 由 Terminus 保留。在您的数据中，它们会被忽略，并且每个指示器只会记录一次警告。

#### 日志记录

默认情况下，当健康检查失败时，Terminus 会记录错误。当配置了优雅关闭超时时，它还会记录关闭的进度。`TerminusModule.forRoot()` 方法为您提供了更精细的错误日志记录控制，并允许您完全接管日志记录。

本节将指导您创建自定义日志记录器，`TerminusLogger`。该日志记录器扩展了内置的 `ConsoleLogger`，因此您可以选择覆盖日志记录器的哪些部分。

> info **提示** 有关 Nest 中自定义日志记录器的更多信息，请参阅 [injecting a custom logger](/application/logger#注入自定义日志记录器)。

```typescript title="terminus-logger.service.ts"
import { Injectable, Scope, ConsoleLogger } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class TerminusLogger extends ConsoleLogger {
  error(message: any, stack?: string, context?: string): void;
  error(message: any, ...optionalParams: any[]): void;
  error(
    message: unknown,
    stack?: unknown,
    context?: unknown,
    ...rest: unknown[]
  ): void {
    // Override how error messages are logged here
  }
}

```

创建自定义日志记录器后，将其传递给 `TerminusModule.forRoot()`：

```typescript title="health.module.ts"
@Module({
imports: [
  TerminusModule.forRoot({
    logger: TerminusLogger,
  }),
],
})
export class HealthModule {}

```

要抑制 Terminus 的所有日志消息，包括错误消息，请将 `logger` 选项设置为 `false`：

```typescript title="health.module.ts"
@Module({
imports: [
  TerminusModule.forRoot({
    logger: false,
  }),
],
})
export class HealthModule {}

```

您还可以配置健康检查错误在日志中显示的样式。

| 错误日志样式 | 描述 | 示例 |
|:---|:---|:---|
| `json` (默认) | 当检查失败时，以 JSON 对象的形式打印健康检查结果摘要 | <figure><img src="/assets/Terminus_Error_Log_Json.png" /></figure> |
| `pretty` | 当检查失败时，以格式化的框打印健康检查结果摘要，突出显示成功和失败的结果 | <figure><img src="/assets/Terminus_Error_Log_Pretty.png" /></figure> |

要更改日志样式，请使用 `errorLogStyle` 配置选项：

```typescript title="health.module.ts"
@Module({
  imports: [
    TerminusModule.forRoot({
      errorLogStyle: 'pretty',
    }),
  ]
})
export class HealthModule {}

```

#### 优雅关闭超时

如果您的应用程序需要延迟关闭，Terminus 可以使用 `gracefulShutdownTimeoutMs` 选项（毫秒，默认 `0`）为您处理。
此设置与 Kubernetes 等编排器特别有用。
通过设置略长于就绪检查间隔的延迟，您可以在关闭容器时实现零停机时间：一旦收到终止信号，健康检查将报告 `'shutting_down'`，状态码为 `503`，因此编排器在应用程序在延迟期间完成正在进行的请求时停止路由新流量。

```typescript title="health.module.ts"
@Module({
  imports: [
    TerminusModule.forRoot({
      gracefulShutdownTimeoutMs: 1000,
    }),
  ]
})
export class HealthModule {}

```

> warning **警告** 延迟仅应用于 `SIGTERM`，这是 Kubernetes 等编排器在停止容器时发送的信号。其他信号（例如来自 `Ctrl+C` 的 `SIGINT`）仍会将健康检查切换到 `'shutting_down'`，但会立即关闭应用程序。请确保启用了 [shutdown hooks](/fundamentals/lifecycle-events#application-shutdown)；否则，Terminus 永远不会收到该信号。

#### Swagger 文档

如果安装了 `@nestjs/swagger` 包，`@HealthCheck()` 装饰器会为您记录端点。它描述了 `200` 和 `503` 响应，并注册了所有健康检查端点共享的两个模式：`TerminusHealthCheckResult` 和 `TerminusHealthIndicatorResult`。

要关闭某个端点的文档，请将 `swaggerDocumentation` 选项设置为 `false`：

```typescript title="health.controller.ts"
// Within the `HealthController`-class
@Get()
@HealthCheck({ swaggerDocumentation: false })
check() {
  return this.health.check([]);
}

```

#### 打包

Terminus 使用 `import()` 加载其可选的对等依赖项（例如 `@nestjs/typeorm` 或 `@nestjs/mongoose`），以便打包器可以包含它们。如果您的构建保持 `node_modules` 为外部（这是 Nest CLI 的默认设置），则无需进行任何操作。

如果您将应用程序与其依赖项一起打包，打包器也会查找您未安装的可选对等依赖项，从而导致构建失败。请将这些包标记为外部。例如，使用 esbuild：

```typescript
await build({
  entryPoints: ['dist/main.js'],
  bundle: true,
  platform: 'node',
  external: ['@nestjs/mongoose', '@nestjs/sequelize', '@mikro-orm/core'],
});

```

使用 webpack 或 Rspack 时，请使用 `externals` 选项或 `IgnorePlugin`。Rollup、Rolldown 和 Vite 默认将无法解析的包保留为外部。

`@nestjs/swagger` 包是例外：Terminus 使用 `require()` 加载它，只有 webpack 遵循此设置。对于其他打包器，请保持 `@nestjs/swagger` 为外部，否则 [Swagger documentation](#swagger-documentation) 中的健康检查端点将缺失。在 esbuild 的默认输出 `platform: 'node'` 构建的 CommonJS 包中也会缺失，因为 Terminus 无法在那里加载该包。

#### 测试

要测试您的应用程序如何报告依赖项失败，请在 [end-to-end test](/fundamentals/testing#端到端测试) 中替换指示器：

```typescript
const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(QueueHealthIndicator)
  .useValue({
    isHealthy: () => ({ queue: { status: 'down', message: 'queue unreachable' } }),
  })
  .compile();

const app = moduleRef.createNestApplication();
await app.init();

await request(app.getHttpServer()).get('/health').expect(503);

```

> info **提示** `@nestjs/terminus` 以 ES 模块形式发布。如果您的测试在 Jest 上运行，请参阅 [migration guide](/migration-guide#testing-stack)。

#### 可观测性

健康检查回答了编排器的一个问题：此实例是否应该接收流量？它不会告诉您上次部署后哪个路由变慢了，或者哪个实例因就绪探针失败而处于忙碌状态。[NestJS Observe](https://www.observe.nestjs.com/?ref=docs-terminus 'NestJS Observe')，我们的官方可观测性平台，记录了其余部分——请求、任务、错误、查询和跟踪，以及从每个实例内部采样的 CPU、内存和事件循环延迟——其中两个设置与本章中的检查协同工作。

探针每隔几秒调用一次健康端点，如果保留它们，它们会淹没请求指标中的真实流量。请使用 SDK 的 `http.ignore` 选项将其排除（参见 [Ignoring noisy operations](/observability/sdk#忽略嘈杂操作)）：

```typescript title="app.module.ts"
ObserveModule.forRoot({
  // ...
  http: { ignore: ['/health'] },
});

```

通过的存活检查也不意味着正在提供任何服务。对于全天候运行的应用程序，内置警报会在其静默或错误率异常时通过电子邮件通知您，所有计划（包括免费套餐）均支持此功能。请参阅 [Observability](/observability/overview) 章。

#### 更多示例

[kitchen sink sample](https://github.com/nestjs/terminus/tree/master/sample/000-kitchen-sink-app) 是一个小型应用程序，结合了本章的大部分内容：一个存活检查和一个就绪检查、内置和自定义健康指标、`'degraded'` 状态和测试。它不需要数据库。

每个内置健康指标的一个更多工作示例可在 [Terminus samples directory](https://github.com/nestjs/terminus/tree/master/sample) 中找到。