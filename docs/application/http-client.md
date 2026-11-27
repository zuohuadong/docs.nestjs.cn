<!-- 此文件从 content/application/http-client.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T01:03:40.858Z -->
<!-- 源文件: content/application/http-client.md -->
<!-- 源哈希: 311e362feaf8445ae2a8c97c92e6a54d -->

### HTTP 客户端

大多数应用程序通过 HTTP 调用其他服务。`@nestjs/http-client` 包为此提供了一个客户端，它基于 Node.js 内置的 `fetch` API 构建。它增加了 `fetch` 所缺少的功能：基础 URL、默认头部、JSON 主体、路径和查询参数、类型化响应、超时、重试、拦截器和命名客户端。您将其配置为一个 Nest 模块，并像注入任何其他提供者一样注入它。

该包除了 `@nestjs/common` 和 `@nestjs/core` 之外没有其他依赖。每个方法都返回一个 Promise，因此您使用 `await` 请求并使用 `try`/`catch` 处理失败。如果更喜欢 Observable，请参阅 [Working with RxJS](/application/http-client#working-with-rxjs)。

> info **提示** 此包替换了 `@nestjs/axios` 中的基于 Axios 的 `HttpModule`，本章之前描述的就是它。`@nestjs/axios` 仍然可用。请参阅 [Migrating from @nestjs/axios](/application/http-client#migrating-from-nestjsaxios) 进行切换。

#### 安装

要开始使用，请安装该包：

```bash
$ npm i --save @nestjs/http-client

```

#### 入门

将 `HttpClientModule` 导入到发起请求的模块中，并使用 `register()` 方法注册一个客户端：

```typescript title="cats.module.ts"
import { Module } from '@nestjs/common';
import { HttpClientModule } from '@nestjs/http-client';
import { CatsService } from './cats.service.js';

@Module({
  imports: [
    HttpClientModule.register({
      baseUrl: 'https://api.example.com/v1',
      timeout: '5s',
    }),
  ],
  providers: [CatsService],
})
export class CatsModule {}

```

然后注入 `HttpClient` 类：

```typescript title="cats.service.ts"
import { Injectable } from '@nestjs/common';
import { HttpClient } from '@nestjs/http-client';
import type { Cat } from './interfaces/cat.interface.js';

@Injectable()
export class CatsService {
  constructor(private readonly http: HttpClient) {}

  async findAll(): Promise<Cat[]> {
    const { data } = await this.http.get<Cat[]>('/cats');
    return data;
  }
}

```

请求发送到 `https://api.example.com/v1/cats`。一个相对 URL 会附加到 `baseUrl`，两者之间恰好有一个 `/`，因此保留了 `/v1` 前缀（与会丢弃它的 `new URL('/cats', base)` 不同）。没有 `baseUrl` 的客户端需要绝对 URL。

与其他 `register()` 方法一样，每次调用都会为导入它的模块创建一个客户端。要使客户端在每个模块中可注入，请设置 `isGlobal: true`。

#### 命名客户端

一个应用程序通常与多个上游服务通信，每个服务都有自己的基础 URL、凭据和超时设置。为每个客户端提供一个 `name`：

```typescript title="repos.module.ts"
@Module({
  imports: [
    HttpClientModule.register({
      name: 'github',
      baseUrl: 'https://api.github.com',
      headers: { accept: 'application/vnd.github+json' },
    }),
  ],
  providers: [ReposService],
})
export class ReposModule {}

```

并使用 `@InjectHttpClient()` 装饰器注入它：

```typescript title="repos.service.ts"
@Injectable()
export class ReposService {
  constructor(@InjectHttpClient('github') private readonly github: HttpClient) {}
}

```

未命名注册的客户端是默认客户端，作为 `HttpClient` 注入。`getHttpClientToken(name)` 函数返回客户端的注入令牌，这在测试和自定义提供者中非常有用。

#### 全局默认值

所有客户端共享的设置，例如 `user-agent` 头部、超时、重试策略或日志记录拦截器，应放入 `HttpClientModule.forRoot()`。在根模块中导入一次即可。它始终是全局的：

```typescript title="app.module.ts"
@Module({
  imports: [
    HttpClientModule.forRoot({
      headers: { 'user-agent': 'cats-service/1.0' },
      timeout: '10s',
    }),
    CatsModule,
    ReposModule,
  ],
})
export class AppModule {}

```

`forRoot()` 本身不注册客户端，也不接受 `baseUrl`。每个客户端的设置会覆盖其默认设置，但有三个例外：头部是合并的（在客户端中设置一个头部为 `null` 以移除默认值），重试设置是逐字段合并的，并且 `forRoot()` 拦截器在客户端自身的拦截器之前运行。

#### 异步配置

要从其他提供者（例如来自 [configuration](/application/configuration#入门) 章的 `ConfigService`）构建客户端的选项，请使用 `registerAsync()`：

```typescript title="repos.module.ts"
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpClientModule, type Duration } from '@nestjs/http-client';
import { ReposService } from './repos.service.js';

@Module({
  imports: [
    HttpClientModule.registerAsync({
      name: 'github',
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        baseUrl: config.getOrThrow<string>('GITHUB_API_URL'),
        headers: { authorization: `Bearer ${config.getOrThrow<string>('GITHUB_TOKEN')}` },
        timeout: config.get<Duration>('GITHUB_TIMEOUT', '5s'),
      }),
    }),
  ],
  providers: [ReposService],
})
export class ReposModule {}

```

该工厂可以是 `async`。它返回与 `register()` 相同的选项，类型为 `HttpClientFactoryOptions`，但缺少 `name`、`isGlobal`、`imports` 和拦截器类：Nest 需要这些才能构建模块，在工厂运行之前，所以它们放在 `useFactory` 旁边。返回其中任何一个的工厂会在启动时停止应用程序。

替代工厂，您可以传入实现 `HttpClientOptionsFactory` 接口的类。Nest 在客户端的模块内部实例化它并调用其 `createHttpClientOptions()` 方法：

```typescript title="github-client.config.ts"
@Injectable()
export class GithubClientConfig implements HttpClientOptionsFactory {
  constructor(private readonly config: ConfigService) {}

  createHttpClientOptions(): HttpClientFactoryOptions {
    return { baseUrl: this.config.getOrThrow<string>('GITHUB_API_URL') };
  }
}

```

```typescript
HttpClientModule.registerAsync({
  name: 'github',
  imports: [ConfigModule],
  useClass: GithubClientConfig,
});

```

要重用已存在的提供者而不是创建私有副本，请传入 `useExisting: GithubClientConfig`，并将导出它的模块放在 `imports` 中。`forRootAsync()` 以相同方式工作。其 `useClass` 或 `useExisting` 类实现了 `HttpClientModuleOptionsFactory`，并有一个 `createHttpClientModuleOptions()` 方法。

#### 发起请求

客户端为每个 HTTP 动词都有一个方法：`get()`、`post()`、`put()`、`patch()`、`delete()`、`head()` 和 `options()`。每个方法都接受一个 URL 和一个可选的选项对象，并解析为一个 `HttpResponse`。`request()` 方法将动词作为 `method` 选项传入。

```typescript title="repos.service.ts"
@Injectable()
export class ReposService {
  constructor(@InjectHttpClient('github') private readonly github: HttpClient) {}

  async findAll(org: string): Promise<Repo[]> {
    const { data } = await this.github.get<Repo[]>('/orgs/:org/repos', {
      params: { org },
      query: { type: 'public', sort: 'updated', topic: ['nest', 'typescript'] },
    });
    return data;
  }

  async createIssue(owner: string, repo: string, issue: CreateIssueDto): Promise<Issue> {
    const { data } = await this.github.post<Issue>('/repos/:owner/:repo/issues', {
      params: { owner, repo },
      json: issue,
    });
    return data;
  }
}

```

选项镜像了 Nest 控制器从 ⟦Request⟧ 中读取的内容：

- `params` 用 URI 编码填充路径的 `:name` 段。如果缺少值，即使省略了 `params` 也会抛出，匹配不到任何段的键，或会导致请求移动到另一个端点的值（空字符串、`.` 或 `..`）也会抛出。
- `query` 是一个对象或一个 `URLSearchParams` 实例，附加到 URL 中已有的任何查询参数。数组会重复键（`topic=nest&topic=typescript`），`Date` 值变为 ISO 字符串，而 `null` 和 `undefined` 值被跳过。上述第一个请求发送到 `https://api.github.com/orgs/nestjs/repos?type=public&sort=updated&topic=nest&topic=typescript`。
- `json` 使用 `JSON.stringify()` 进行序列化，除非您设置了其他值，否则设置 `content-type: application/json` 头部。
- `body` 原样传递给 `fetch`：一个字符串、`Buffer`、`FormData`、`URLSearchParams`、`Blob`、一个 Web 或 Node.js 流，或一个异步可迭代对象。请传入 `json` 或 `body`，而不是两者都传入。带有主体（`GET` 或 `HEAD`）的请求在发送任何内容之前就会抛出。
- `headers` 会合并到客户端的头部中。一个 `null` 值会移除一个头部。
- `timeout`、`retry`、`signal`、`throwOnHttpError`、`redirect` 和 `dispatcher` 会覆盖客户端针对单个请求的设置，并在下面介绍。
- `context` 是一个自由格式对象，[interceptors](/application/http-client#interceptors) 可以读取它。

类型参数，例如 `Repo[]`，描述了 `data`。运行时不会检查它，因此请验证您不控制的 API 的响应。`responseType` 选项控制如何读取主体：

| `responseType` | `data` |
| --- | --- |
| `'auto'` (默认) | 当 `content-type` 是 JSON（包括 `+json` 类型）时解析为 JSON，否则为字符串。当主体为空时为 `undefined`，对于 `204` 和 `205` 响应，以及对于 `HEAD` 请求。默认情况下，一个 `304` 响应像任何非 2xx 一样抛出；使用 `throwOnHttpError: false` 时，其 `data` 为 `undefined`。 |
| `'json'` | 无论内容类型如何，都解析为 JSON。 |
| `'text'` | 一个字符串。 |
| `'arrayBuffer'` | 一个 `ArrayBuffer`。 |
| `'stream'` | 一个 Node.js `Readable`。参见 [Streaming responses](/application/http-client#streaming-responses)。 |
| `'response'` | Web `Response`，其主体未读取。 |

`data` 的类型遵循 `responseType`，因此 `responseType: 'text'` 解析为 `HttpResponse<string>`。一个成功的响应，其主体不是有效的 JSON（尽管预期是），会以 `HttpParseError` 拒绝。响应对象具有以下形状：

```typescript
interface HttpResponse<T> {
  status: number;
  statusText: string;
  ok: boolean;
  headers: Headers; // a web Headers object: headers.get('etag')
  data: T;
  url: string; // the final URL, after redirects
  request: HttpRequest; // the request that was sent, after interceptors ran
}

```

#### 超时和取消

`fetch` 本身没有超时限制，除了 Node.js 内置的 HTTP 客户端 undici 的 5 分钟限制。请在每个客户端上设置一个 `timeout`，可以是毫秒值，也可以是诸如 `'500ms'`、`'5s'` 或 `'2m'` 的持续时间字符串。无效的值会在启动时失败，并附带一个指明该选项的错误。`0` 表示无超时，这是默认值。

超时适用于**每次尝试**，而不是整个调用。它涵盖了尝试的拦截器和读取响应主体。对于 `responseType: 'stream'` 和 `'response'`，一旦接收到头部就会停止，因此不会中断长时间的下载。当超时发生时，尝试会以一个 `HttpTimeoutError` 失败，请求会像任何其他 [transient failure](/application/http-client#retries) 一样重试。

要取消请求，请将一个 `AbortSignal` 作为 `signal` 选项传递。它与超时结合使用。被取消的请求会以信号的 `reason` 拒绝，就像 `fetch` 一样，并且永远不会重试，即使在两次尝试之间的等待期间也是如此。

由于重试机制，一次调用可能需要长达 `attempts × timeout`，再加上尝试之间的等待时间。要限制整个调用的时间，请将截止时间作为信号传递：

```typescript
const { data } = await this.github.get<Repo>('/repos/:owner/:repo', {
  params: { owner, repo },
  signal: AbortSignal.timeout(10_000),
});

```

截止时间会以一个名为 `DOMException` 的 `TimeoutError` 拒绝，该错误会映射到 `504 Gateway Timeout`，就像一个 `HttpTimeoutError` 一样。要将其与另一个信号结合，请使用 `AbortSignal.any([signal, AbortSignal.timeout(10_000)])`。

#### 重试

重试**默认开启**。如果没有任何配置，客户端会对 `GET`、`HEAD`、`OPTIONS`、`PUT` 和 `DELETE`（HTTP 定义的幂等方法）进行最多 3 次尝试。它会在以下情况下重试：

- 连接错误，例如被拒绝或重置的连接（包括在读取主体时被重置），
- 每次尝试的超时，
- `408`、`429`、`500`、`502`、`503` 和 `504` 响应。

在尝试之间，客户端使用指数退避和完全抖动等待：第一次尝试后随机延迟最多 200 毫秒，第二次尝试后最多 400 毫秒，依此类推，上限为 30 秒。一个 `Retry-After` 响应头（以秒或 HTTP 日期表示）会替换退避机制。当请求的等待时间超过上限时，客户端根本不等待，而是立即返回（或抛出）`429` 或 `503` 响应。如果请求主体是流，则永远不会重试，因为第一次尝试已经消耗了它。

`retry` 选项接受一个尝试次数（数字）、一个单次尝试的次数（`false`），或一个对象：

```typescript
HttpClientModule.register({
  name: 'github',
  baseUrl: 'https://api.github.com',
  retry: {
    attempts: 4, // in total, including the first request
    backoff: { delay: '500ms', factor: 2, maxDelay: '5s', jitter: 'full' },
    retryIf: (error, attempt) => !(error instanceof HttpNetworkError),
    methods: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'],
    statusCodes: [408, 429, 500, 502, 503, 504],
  },
}),

```

省略的每个字段都保持其默认值。`backoff` 也可以是一个函数，该函数接收失败的尝试次数及其错误，并返回一个持续时间。`jitter` 可以是 `'full'`、`'equal'`（计算延迟的至少一半），或 `'none'`。`retryIf` 仅针对客户端无论如何都会重试的失败进行查询，因此它可以缩小默认值但不能扩大默认值；为此请使用 `methods` 和 `statusCodes`。它接收失败尝试的 `HttpResponseError`（及其 `body`）、`HttpTimeoutError` 或 `HttpNetworkError`。

重试设置是分层的：`forRoot()`，然后是客户端，然后是请求。每一层只覆盖其设置的字段，后一层可以使早期 `false` 后的重试重新开启。然而，`methods` 和 `statusCodes` 会**替换**默认列表，而不是添加到其中。

`POST` 和 `PATCH` 不会重试，因为重复它们可能会例如向客户收费两次。当上游 API 支持幂等性密钥时，请发送一个密钥并为该请求选择加入：

```typescript
const { data } = await this.payments.post<Charge>('/charges', {
  json: charge,
  headers: { 'idempotency-key': `charge-${order.id}` },
  retry: { methods: ['POST'] },
});

```

该密钥标识了操作，因此每次尝试都发送相同的密钥，上游返回原始结果而不是创建第二次收费。在客户端上设置 `methods: ['POST']` 也会停止 `GET` 重试，因为该列表替换了默认列表。

> 警告 **警告** 重试会在服务链中乘法累积。如果服务 A 调用 B，B 调用 C，并且每个跳点都进行 3 次尝试，那么一个到 C 的失败请求就会变成 9 次对 C 的调用，这些调用恰好在 C 已经吃力的时候到达。只在一个层级上重试，通常是调用外部依赖的服务，并对调用您自己服务的客户端设置 `retry: false`。

#### 错误处理

请求会以以下错误之一拒绝，所有这些错误都继承自 `HttpClientError` 类：

| 错误 | 何时发生 | 字段 |
| --- | --- | --- |
| `HttpResponseError` | 上游返回了非 2xx 状态码。 | `status`, `statusText`, `headers`, `body`（解析的 JSON，否则为文本）, `method`, `url` |
| `HttpTimeoutError` | 在最后一次尝试中 `timeout` 超时。 | `timeoutMs`, `method`, `url` |
| `HttpNetworkError` | 连接失败：DNS、被拒绝或重置的连接、TLS 或客户端拒绝的重定向（到另一个源，或带有 `redirect: 'error'`）。 | `cause`（例如，设置 `cause.code` 为 `ECONNREFUSED`），`method`, `url` |
| `HttpParseError` | 响应成功但不是有效的 JSON，尽管预期是。 | `status`, `statusText`, `headers`, `body`（原始文本）, `method`, `url` |

被取消的请求会以信号的理由拒绝，拦截器抛出的错误保持不变地传播。客户端拒绝发送的请求，例如具有无效 `params` 值的请求，会以 `TypeError` 拒绝。要将非 2xx 响应作为值接收，请在客户端或请求上设置 `throwOnHttpError: false`，并自行检查 `ok` 或 `status`。

如果这些错误中的一个逃逸出路由处理程序，Nest 会以 `500 Internal Server Error` 响应。但是，对于您的 API 的调用者来说，一个失败的上游通常是一个 `502 Bad Gateway`，而一个未及时响应的上游是一个 `504 Gateway Timeout`。`toHttpException()` 函数会相应地映射这些错误：

| 错误 | 变为 |
| --- | --- |
| `HttpResponseError` | `502 Bad Gateway`，或者当状态列在 `forward` 中时，上游状态和主体 |
| `HttpTimeoutError`，或 `AbortSignal.timeout()` 截止时间的 `TimeoutError` | `504 Gateway Timeout` |
| `HttpNetworkError`, `HttpParseError` | `502 Bad Gateway` |
| 任何其他情况，包括 `HttpException` | 不变地返回，因此 Nest 按常规处理 |

```typescript title="repos.service.ts"
async findOne(owner: string, repo: string): Promise<Repo> {
  try {
    const { data } = await this.github.get<Repo>('/repos/:owner/:repo', {
      params: { owner, repo },
    });
    return data;
  } catch (error) {
    if (error instanceof HttpResponseError && error.status === 404) {
      throw new NotFoundException(`Repository ${owner}/${repo} not found`);
    }
    throw toHttpException(error);
  }
}

```

默认情况下，上游主体不会传递给调用者，因为它可能描述了上游的内部细节。要将选定的状态及其主体传递，例如一个 `422`（其主体告诉调用者如何修复），请使用 `toHttpException(error, options)` 并将 `forward` 设置为 `[422]`，或对每个状态设置为 `true`。原始错误作为异常的 `cause` 被保留。

Nest 内置的异常过滤器 [doesn't log](/overview/exception-filters#exceptions-logging) 一个 `HttpException`，因此 `502` 或 `504` 不会留下任何痕迹。因此，`toHttpException()` 会记录它转换为 `5xx` 的每个失败，并附带 `HttpClient` 上下文：

```text
ERROR [HttpClient] GET https://api.github.com/repos/nestjs/nest failed with 503 Service Unavailable; answering 502 Bad Gateway

```

当其他内容（例如您自己的异常过滤器）已经记录上游失败时，请将 `log` 选项设置为 `false`。

与其在每个服务中映射错误，不如让它们不加更改地离开处理程序，然后在 [exception filter](/overview/exception-filters#绑定过滤器) 中进行映射。这使调用点免受 `try`/`catch` 的影响，并且更外层的拦截器仍然能看到原始错误：

```typescript title="http-client-error.filter.ts"
import { ArgumentsHost, Catch } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { HttpClientError, toHttpException } from '@nestjs/http-client';

@Catch(HttpClientError)
export class HttpClientErrorFilter extends BaseExceptionFilter {
  catch(error: HttpClientError, host: ArgumentsHost) {
    super.catch(toHttpException(error), host);
  }
}

```

一个 `AbortSignal.timeout()` 截止时间不是一个 `HttpClientError`，因此如果使用截止时间，请将 `DOMException` 添加到 `@Catch()`。`toHttpException()` 返回一个 `HttpException`，因此在微服务或 WebSocket 处理程序中，请自行将错误转换为 `RpcException` 或 `WsException`。

> 提示 **提示** 错误消息和对象会出现在日志中，因此客户端会从其中排除敏感信息。消息绝不包含响应主体，其中 URL 的查询值会被掩盖，如下所示 `GET https://api.example.com/users?email=***`。`url`、`headers` 和 `body` 字段是非可枚举的：您的代码可以读取它们，但日志记录器和 `JSON.stringify()` 会忽略它们。

#### 拦截器

拦截器会包装客户端发送的每一个请求。它接收请求和一个发送请求的 `next` 函数，并返回结果的 Web `Response`。最简单的形式是一个函数：

```typescript title="api-key.interceptor.ts"
import type { HttpClientInterceptorFn } from '@nestjs/http-client';

export function apiKeyInterceptor(apiKey: string): HttpClientInterceptorFn {
  return (request, next) => {
    request.headers.set('x-api-key', apiKey);
    return next(request);
  };
}

```

`HttpRequest` 对象包含 `method`、`url`（一个 `URL` 实例）、`headers`（一个 `Headers` 实例）、`body`、`signal`、`attempt` 编号以及请求的 `context`。你可以原地修改它，或者将修改后的副本传递给 `next()`。拦截器在状态检查**之前**看到响应，因此 `4xx` 或 `5xx` 响应也会到达它们。拦截器必须返回 `next()` 解析的结果，或其自身的 `Response`。

当拦截器需要其他提供者时，应将其编写为实现 `HttpClientInterceptor` 接口的类：

```typescript title="github-auth.interceptor.ts"
import { Injectable } from '@nestjs/common';
import type { HttpClientInterceptor, HttpHandler, HttpRequest } from '@nestjs/http-client';
import { GithubTokenService } from './github-token.service.js';

@Injectable()
export class GithubAuthInterceptor implements HttpClientInterceptor {
  constructor(private readonly tokens: GithubTokenService) {}

  async intercept(request: HttpRequest, next: HttpHandler): Promise<Response> {
    request.headers.set('authorization', `Bearer ${await this.tokens.getToken()}`);
    return next(request);
  }
}

```

将拦截器传递给 `register()` 或 `forRoot()` 的 `interceptors` 数组，或在异步变体中放在 `useFactory` 旁边：

```typescript title="repos.module.ts"
@Module({
  imports: [
    HttpClientModule.register({
      name: 'github',
      baseUrl: 'https://api.github.com',
      interceptors: [GithubAuthInterceptor],
    }),
  ],
  providers: [GithubTokenService, GithubAuthInterceptor, ReposService],
})
export class ReposModule {}

```

Nest 在应用程序初始化时解析拦截器类，因此拦截器甚至可能依赖于注入相同客户端的服务。如果该类是应用程序中的任何地方的提供者，如上文 `GithubAuthInterceptor` 所示，则使用该实例。否则，Nest 会在客户端自身的 模块内部创建它，该模块可以看到全局提供者以及您在 `register()` 的 `imports` 选项中传递的模块。异步工厂也可以在其选项中返回拦截器，但仅限于函数和实例，例如 `apiKeyInterceptor(config.getOrThrow('API_KEY'))`。

拦截器按列出的顺序运行，第一个最外层，而 `forRoot()` 拦截器在客户端自身的拦截器之前运行。它们**每次尝试运行一次**，因此重试会获得一个新的令牌，而 `request.attempt` 会告知它们当前是第几次尝试。当尝试失败时，`next()` 会以 `HttpNetworkError` 或 `HttpTimeoutError` 拒绝，或以中止原因拒绝。这使得拦截器成为记录上游流量的好地方：

```typescript title="http-logging.interceptor.ts"
import { Injectable, Logger } from '@nestjs/common';
import type { HttpClientInterceptor, HttpHandler, HttpRequest } from '@nestjs/http-client';

@Injectable()
export class HttpLoggingInterceptor implements HttpClientInterceptor {
  private readonly logger = new Logger('HttpClient');

  async intercept(request: HttpRequest, next: HttpHandler): Promise<Response> {
    const target = `${request.method} ${request.url.origin}${request.url.pathname}`;
    const start = performance.now();
    try {
      const response = await next(request);
      const ms = Math.round(performance.now() - start);
      this.logger.log(`${target} ${response.status} ${ms}ms (attempt ${request.attempt})`);
      return response;
    } catch (error) {
      this.logger.warn(`${target} failed: ${(error as Error).name} (attempt ${request.attempt})`);
      throw error;
    }
  }
}

```

注册到 `HttpClientModule.forRoot()` 和 `interceptors: [HttpLoggingInterceptor]`，它会记录每个客户端的请求。它记录路径而不包含查询字符串，查询字符串通常包含个人数据或密钥。

> info **提示** 对于跟踪，您不需要拦截器。[NestJS Observe](/observability/distributed-tracing#http-to-http) 将每个出站 `fetch` 调用记录为单个跨度，并将跟踪 ID 传播到其他 Nest 服务。

#### 流式响应

要通过不将其缓冲在内存中来传递大响应，请设置 `responseType: 'stream'`。`data` 是一个 Node.js `Readable`，您可以在 [`StreamableFile`](/techniques/streaming-files) 中的路由处理程序中返回它：

```typescript title="invoices.controller.ts"
@Get(':id/pdf')
async download(@Param('id') id: string): Promise<StreamableFile> {
  const { data, headers } = await this.billing.get('/invoices/:id/pdf', {
    params: { id },
    responseType: 'stream',
  });
  return new StreamableFile(data, {
    type: headers.get('content-type') ?? 'application/pdf',
  });
}

```

超时在头部到达后停止，而取消 `signal` 仍然会停止下载。非 2xx 响应会被读取并作为 `HttpResponseError` 抛出，如常。不要将上游的 `content-length` 头部作为 `length` 选项传递：`fetch` 会解压缩 gzip 和 brotli 主体，因此流的长度可以长于头部所声明的。对于 Web `ReadableStream`，请使用 `responseType: 'response'` 并读取 `data.body`。

#### 代理、TLS 和重定向

Node.js 的 `fetch` 在 undici 上运行，其默认调度器会维护一个 keep-alive 连接池，因此常见情况无需配置。要更改连接池大小、通过代理路由或使用自定义 TLS 设置（私有 CA 或客户端证书），请将 undici 调度器作为 `dispatcher` 选项传递：

```typescript title="partner.module.ts"
import { readFileSync } from 'node:fs';
import { Agent } from 'undici';

@Module({
  imports: [
    HttpClientModule.register({
      name: 'partner',
      baseUrl: 'https://partner.example.com',
      dispatcher: new Agent({
        connections: 20,
        connect: {
          ca: readFileSync('certs/partner-ca.pem'),
          cert: readFileSync('certs/client.pem'),
          key: readFileSync('certs/client-key.pem'),
        },
      }),
    }),
  ],
})
export class PartnerModule {}

```

对于代理，请传递 `new ProxyAgent('http://proxy.internal:3128')`。Node.js 没有从内置模块中暴露这些类，因此请自行安装 `undici` 包（`@nestjs/http-client` 不依赖于它），最好是与您的 Node.js 版本捆绑的主要版本。一个 Node.js `http.Agent`，Axios 接受为 `httpsAgent`，与 `fetch` 不兼容，并且编译失败。要从 `HTTP_PROXY`、`HTTPS_PROXY` 和 `NO_PROXY` 环境变量中将每个客户端路由到代理，请使用支持它的版本启动 Node.js `--use-env-proxy`（或设置 `NODE_USE_ENV_PROXY=1`）。

`redirect` 选项控制如何处理 `3xx` 响应。一个具有 `baseUrl` 的客户端仅在其原始域上遵循重定向，并且在到另一个主机重定向时会失败 `HttpNetworkError`，因为其头部携带了该上游的凭证（参见 [Security](/application/http-client#security)）。一个没有 `baseUrl` 的客户端允许 `fetch` 在任何地方遵循重定向，在原始域更改时会丢弃 `authorization` 和 `cookie` 头部，但不会丢弃其他头部。

将 `redirect` 设置为 `'follow'` 以在任何地方遵循重定向并带有 `baseUrl`，对于有意重定向到另一个主机的 API，设置为 `'error'` 以在每次重定向时失败，或设置为 `'manual'` 以接收原始的 `3xx` 响应。`3xx` 响应不是成功，因此将 `'manual'` 与 `throwOnHttpError: false` 结合使用以读取其 `location` 头部。

#### 安全性

该客户端防御了几个常见错误：

- **一个具有 `baseUrl` 的客户端只向其原始域发送请求。** 相同域上的绝对 URL，例如分页链接，是有效的，但另一个主机的 URL 会在发送任何内容之前抛出。重定向到另一个主机也会失败，在请求在该主机重复之前。客户端的头部和拦截器携带了该上游的凭证，从用户输入或上游响应中获取的 URL 不应接收这些凭证。使用没有 `baseUrl` 的客户端调用任意主机，或使用 `redirect: 'follow'` 调用有意重定向到另一个主机的 API。
- **路径参数是编码的。** 将请求值放在 `params` 和 `query` 中，而不是使用字符串插值构建路径。它们是 URI 编码的，一个 `params` 值，例如 `..`，会抛出，而不是将请求移动到另一个端点。
- **URL 中的凭证被拒绝。** `baseUrl` 或诸如 `https://user:pass@example.com` 的请求 URL 会抛出。请在 `authorization` 头部中发送凭证。带有换行符的头部值会抛出，而不会在消息中引用该值。
- **错误可以安全地记录**，如 [Handling errors](/application/http-client#错误处理) 所述。

#### 测试

一个存根 `fetch` 是测试调用外部 API 的代码最简单的方法。将其传递给 `HttpClientModule.forRoot()`，所有客户端都会使用它，同时保留其基础 URL、头部、重试策略和拦截器。该存根只需返回一个标准的 `Response`：

```typescript title="repos.service.spec.ts"
import { Test } from '@nestjs/testing';
import { HttpClientModule } from '@nestjs/http-client';
import { vi } from 'vitest';
import { ReposModule } from './repos.module.js';
import { ReposService } from './repos.service.js';

describe('ReposService', () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  let repos: ReposService;

  beforeEach(async () => {
    fetch.mockReset();
    const moduleRef = await Test.createTestingModule({
      imports: [HttpClientModule.forRoot({ fetch }), ReposModule],
    }).compile();
    await moduleRef.init();
    repos = moduleRef.get(ReposService);
  });

  it('lists the public repositories of an organization', async () => {
    fetch.mockResolvedValueOnce(Response.json([{ name: 'nest' }]));

    await expect(repos.findAll('nestjs')).resolves.toEqual([{ name: 'nest' }]);
    const [url] = fetch.mock.calls[0];
    expect(String(url)).toBe(
      'https://api.github.com/orgs/nestjs/repos?type=public&sort=updated&topic=nest&topic=typescript',
    );
  });

  it('retries a 503', async () => {
    fetch
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json([]));

    await expect(repos.findAll('nestjs')).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

```

为每次调用提供自己的 `Response`，就像 `mockResolvedValueOnce()` 上面做的那样：响应体只能读取一次，因此 `mockResolvedValue()` 会将已读取的响应传递给重试。设置自己 `fetch` 选项的客户端会保留它，因为客户端的设置优先于 `forRoot()` 的默认值。没有设置的客户端会在每次请求上调用 `globalThis.fetch`，所以 `vi.stubGlobal('fetch', stub)` 也可以工作。

对于已经调用 `forRoot()` 的应用程序的端到端测试，请覆盖其选项。这会替换所有 `forRoot()` 选项，但直接传递给 `forRoot()` 或紧跟在 `useFactory` 旁边的拦截器会继续运行：

```typescript
const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(HTTP_CLIENT_MODULE_OPTIONS)
  .useValue({ fetch })
  .compile();

```

要完全将 HTTP 从测试中排除，请用 `overrideProvider(getHttpClientToken('github'))` 替换客户端本身。例如在 Nest 外部的脚本中，使用 `new HttpClient(options)` 创建一个客户端。

#### 使用 RxJS

要使用 RxJS 操作符组合请求，请将其包装在一个 Observable 中。`defer()` 在 Observable 被订阅时启动请求，而 `from()` 立即启动它：

```typescript
import { defer } from 'rxjs';

const cats$ = defer(() => this.http.get<Cat[]>('/cats'));

```

两者在取消订阅时都不会取消请求。当需要这样做时，例如使用 `switchMap()`，请将取消订阅连接到一个 `AbortController`：

```typescript
import { Observable } from 'rxjs';

function fromRequest<T>(send: (signal: AbortSignal) => Promise<T>): Observable<T> {
  return new Observable<T>((subscriber) => {
    const controller = new AbortController();
    send(controller.signal).then(
      (value) => {
        subscriber.next(value);
        subscriber.complete();
      },
      (error) => subscriber.error(error),
    );
    return () => controller.abort();
  });
}

const cats$ = fromRequest((signal) => this.http.get<Cat[]>('/cats', { signal }));

```

#### 从 `@nestjs/axios` 迁移

`@nestjs/axios` 包仍然可用，在迁移期间可以并排安装这两个包。下表将其功能映射到 `@nestjs/http-client`：

| `@nestjs/axios` | `@nestjs/http-client` |
| --- | --- |
| 带有 `baseURL` 的 `HttpModule.register()` | 带有 `baseUrl` 的 `HttpClientModule.register()` |
| `HttpModule.registerAsync()` | `HttpClientModule.registerAsync()`，它还接受一个 `name` |
| 带有 `createHttpOptions()` 的 `HttpModuleOptionsFactory` | 带有 `createHttpClientOptions()` 的 `HttpClientOptionsFactory` |
| `registerAsync()` 中的 `extraProviders` | 导出演提供者的模块，在 `imports` 中传入 |
| 每个导入模块一个 `HttpService` | 带有 `@InjectHttpClient(name)` 注入的命名客户端 |
| 返回 Observables 的 `HttpService` 方法 | 返回 Promises 的 `HttpClient` 方法 |
| `firstValueFrom(this.httpService.get(url))` | `await this.http.get(url)` |
| `post(url, data)` | `post(url, options)`，数据在 `json`（或 `body`）中 |
| 请求配置中的 `params` | `query`。数组重复键，Axios 写入 `key[]=`。在 `@nestjs/http-client` 中，`params` 填充 `:name` 路径段，对于不匹配任何键的键会抛出。 |
| `response.headers['etag']` | `response.headers.get('etag')` |
| 带有 `error.response?.status` 的 `AxiosError` | 带有 `error.status` 和 `error.body` 的 `HttpResponseError` |
| `error.code === 'ECONNABORTED'` | `HttpTimeoutError` |
| `validateStatus: () => true` | `throwOnHttpError: false` |
| `axiosRef`（Axios 实例） | 没有底层实例。使用客户端的选项，或将自定义函数作为 `fetch` 传入。 |
| `axiosRef.interceptors.request.use()` 和 `response.use()` | `interceptors`，一个函数同时处理请求和响应 |
| `httpsAgent` 或 `proxy` | `dispatcher`，一个 undici `Agent` 或 `ProxyAgent` |
| `maxRedirects: 0` | `redirect: 'manual'` |
| 默认不重试，除非添加 `axios-retry` | 幂等方法默认重试。`retry: false` 恢复 Axios 行为。 |
| 整个请求的 `timeout` | 每次尝试的 `timeout`，也可以是字符串，例如 `'5s'` |
| `onUploadProgress`, `onDownloadProgress` | 没有等效项。而是计算流的字节数。 |