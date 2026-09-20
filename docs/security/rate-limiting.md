<!-- 此文件从 content/security/rate-limiting.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T07:49:34.732Z -->
<!-- 源文件: content/security/rate-limiting.md -->
<!-- 源哈希: e586ae24fce5eb22e4e0e54907d275f4 -->

### 速率限制

保护应用程序免受暴力攻击的一种常见技术是**速率限制**。要开始使用，您需要安装 `@nestjs/throttler` 包。

```bash
$ npm i --save @nestjs/throttler

```

安装完成后，可以像其他 Nest 包一样，使用 `forRoot` 或 `forRootAsync` 方法配置 `ThrottlerModule`。

```typescript title="app.module.ts"
@Module({
  imports: [
     ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000,
          limit: 10,
        },
      ],
    }),
  ],
})
export class AppModule {}

```

上述操作将为应用程序中受保护的路线设置 `ttl` 的全局选项、以毫秒为单位的生存时间以及 `limit`（ttl 内的最大请求数）。

导入模块后，您可以选择如何绑定 `ThrottlerGuard`。[guards](/overview/guards) 部分提到的任何绑定方式都可以。例如，如果您想全局绑定守卫，可以通过将此提供者添加到任何模块来实现：

```typescript
{
  provide: APP_GUARD,
  useClass: ThrottlerGuard
}

```

#### 多个节流器定义

有时候您可能希望设置多个节流定义，例如每秒不超过 3 次调用、每 10 秒 20 次调用、每分钟 100 次调用。为此，您可以在数组中设置带有命名选项的定义，稍后可以在 `@SkipThrottle()` 和 `@Throttle()` 装饰器中引用这些选项来再次更改选项。

```typescript title="app.module.ts"
@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 3,
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 20
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 100
      }
    ]),
  ],
})
export class AppModule {}

```

#### 自定义

有时候您可能希望将守卫绑定到控制器或全局，但希望为一个或多个端点禁用速率限制。为此，您可以使用 `@SkipThrottle()` 装饰器来对整个类或单个路由取消除速器。`@SkipThrottle()` 装饰器还可以接受一个字符串键和布尔值的对象，用于当您想排除控制器的大部分但不是每个路由时，并且如果您有多个节流器集，可以按节流器集进行配置。如果不传递对象，默认使用 `{ default: true }`。

```typescript
@SkipThrottle()
@Controller('users')
export class UsersController {}

```

这个 `@SkipThrottle()` 装饰器可用于跳过路由或类，或否定被跳过类中的路由的跳过。

```typescript
@SkipThrottle()
@Controller('users')
export class UsersController {
  // Rate limiting is applied to this route.
  @SkipThrottle({ default: false })
  dontSkip() {
    return 'List users work with Rate limiting.';
  }
  // This route will skip rate limiting.
  doSkip() {
    return 'List users work without Rate limiting.';
  }
}

```

还有 `@Throttle()` 装饰器，可用于覆盖全局模块中设置的 `limit` 和 `ttl`，以提供更严格或更宽松的安全选项。此装饰器也可以用于类或函数。从版本 5 开始，装饰器接受一个对象，其中包含与节流器集名称相关的字符串，以及一个包含 limit 和 ttl 键及整数值的对象，类似于传递给根模块的选项。如果原始选项中没有设置名称，请使用字符串 `default`。您必须这样配置：

```typescript
// Override default configuration for Rate limiting and duration.
@Throttle({ default: { limit: 3, ttl: 60000 } })
@Get()
findAll() {
  return "List users works with custom rate limiting.";
}

```

#### 代理

如果您的应用程序运行在代理服务器后面，配置 HTTP 适配器以信任代理至关重要。您可以参考 [Express](http://expressjs.com/en/guide/behind-proxies.html) 和 [Fastify](https://www.fastify.io/docs/latest/Reference/Server/#trustproxy) 的特定 HTTP 适配器选项来启用 `trust proxy` 设置。

以下示例演示了如何为 Express 适配器启用 `trust proxy`：

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', 'loopback'); // Trust requests from the loopback address
  await app.listen(3000);
}

await bootstrap();

```

启用 `trust proxy` 允许您从 `X-Forwarded-For` 标头中检索原始 IP 地址。您还可以通过覆盖 `getTracker()` 方法从该标头提取 IP 地址，而不是依赖 `req.ip`，来自定义应用程序的行为。以下示例演示了如何为 Express 和 Fastify 实现这一点：

```typescript title="throttler-behind-proxy.guard.ts"
import { ThrottlerGuard } from '@nestjs/throttler';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.ips.length ? req.ips[0] : req.ip; // individualize IP extraction to meet your own needs
  }
}

```

> info **提示** 您可以在 [here](https://expressjs.com/en/api.html#req.ips) 中找到 express 的 `req` 请求对象 API，在 [here](https://www.fastify.io/docs/latest/Reference/Request/) 中找到 fastify 的。

#### WebSockets

该模块可以与 WebSockets 一起使用，但需要进行一些类扩展。您可以扩展 `ThrottlerGuard` 并覆盖 `handleRequest` 方法，如下所示：

```typescript
@Injectable()
export class WsThrottlerGuard extends ThrottlerGuard {
  async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const {
      context,
      limit,
      ttl,
      throttler,
      blockDuration,
      getTracker,
      generateKey,
    } = requestProps;

    const client = context.switchToWs().getClient();
    const tracker = client._socket.remoteAddress;
    const key = generateKey(context, tracker, throttler.name);
    const { totalHits, timeToExpire, isBlocked, timeToBlockExpire } =
      await this.storageService.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttler.name,
      );

    const getThrottlerSuffix = (name: string) =>
      name === 'default' ? '' : `-${name}`;

    // Throw an error when the user reached their limit.
    if (isBlocked) {
      await this.throwThrottlingException(context, {
        limit,
        ttl,
        key,
        tracker,
        totalHits,
        timeToExpire,
        isBlocked,
        timeToBlockExpire,
      });
    }

    return true;
  }
}

```

> info **提示** 如果您使用 ws，则必须将 `_socket` 替换为 `conn`

使用 WebSockets 时需要记住以下几点：

- 守卫不能使用 `APP_GUARD` 或 `app.useGlobalGuards()` 注册
- 当达到限制时，Nest 将发出 `exception` 事件，因此请确保有监听器为此做好准备

> info **提示** 如果您使用 `@nestjs/platform-ws` 包，可以使用 `client._socket.remoteAddress` 代替。

> info **提示** 当您配置 [multiple throttler definitions](/security/rate-limiting#多重限流器定义) 时，`handleRequest()` 会为每个节流器集运行一次。在生成存储键和报告 `ThrottlerLimitDetail` 时，使用 `ThrottlerRequest` 中的 `throttler.name`，如上所示，以便每个命名的节流器跟踪自己的限制。

#### GraphQL

`ThrottlerGuard` 也可以用于处理 GraphQL 请求。同样，可以扩展守卫，但这次将覆盖 `getRequestResponse` 方法

```typescript
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  getRequestResponse(context: ExecutionContext) {
    const gqlCtx = GqlExecutionContext.create(context);
    const ctx = gqlCtx.getContext();
    return { req: ctx.req, res: ctx.res };
  }
}

```

#### 配置

以下选项对于传递给 `ThrottlerModule` 选项数组的对象有效：

<table>
  <tr>
    <td><code>name</code></td>
    <td>用于内部跟踪正在使用的节流器集的名称。如果未传递，默认为 `default`</td>
  </tr>
  <tr>
    <td><code>ttl</code></td>
    <td>每个请求在存储中持续存在的毫秒数</td>
  </tr>
  <tr>
    <td><code>limit</code></td>
    <td>TTL 限制内的最大请求数</td>
  </tr>
  <tr>
    <td><code>blockDuration</code></td>
    <td>请求将被阻止的毫秒数</td>
  </tr>
  <tr>
    <td><code>ignoreUserAgents</code></td>
    <td>在节流请求时要忽略的用户代理正则表达式数组</td>
  </tr>
  <tr>
    <td><code>skipIf</code></td>
    <td>一个接受 `ExecutionContext` 并返回 `boolean` 以短路节流器逻辑的函数。类似于 `@SkipThrottle()`，但基于请求</td>
  </tr>
</table>

如果您需要设置存储，或者希望以更全局的方式使用上述某些选项，应用于每个节流器集，您可以通过 `throttlers` 选项键传递上述选项，并使用下表

<table>
  <tr>
    <td><code>storage</code></td>
    <td>一个自定义存储服务，用于跟踪节流状态。<a href="/security/rate-limiting#存储">参见此处。</a></td>
  </tr>
  <tr>
    <td><code>ignoreUserAgents</code></td>
    <td>在节流请求时要忽略的用户代理正则表达式数组</td>
  </tr>
  <tr>
    <td><code>skipIf</code></td>
    <td>一个接受 <code>ExecutionContext</code> 并返回 <code>boolean</code> 以短路节流器逻辑的函数。类似于 <code>@SkipThrottle()</code>，但基于请求</td>
  </tr>
  <tr>
    <td><code>throttlers</code></td>
    <td>一个节流器集合的数组，使用上表定义</td>
  </tr>
  <tr>
    <td><code>errorMessage</code></td>
    <td>一个 <code>string</code> 或一个接受 <code>ExecutionContext</code> 和 <code>ThrottlerLimitDetail</code> 并返回 <code>string</code> 的函数，用于覆盖默认的节流器错误消息</td>
  </tr>
  <tr>
    <td><code>getTracker</code></td>
    <td>一个接受 <code>Request</code> 并返回 <code>string</code> 的函数，用于覆盖 <code>getTracker</code> 方法的默认逻辑</td>
  </tr>
  <tr>
    <td><code>generateKey</code></td>
    <td>一个接受 <code>ExecutionContext</code>、跟踪器 <code>string</code> 和节流器名称（作为 <code>string</code>）并返回 <code>string</code> 的函数，用于覆盖最终用于存储速率限制值的键。这会覆盖 <code>generateKey</code> 方法的默认逻辑</td>
  </tr>

#### 异步配置

您可能希望异步获取速率限制配置，而不是同步获取。您可以使用 `forRootAsync()` 方法，该方法支持依赖注入和 `async` 方法。

一种方法是使用工厂函数：

```typescript
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get('THROTTLE_TTL'),
          limit: config.get('THROTTLE_LIMIT'),
        },
      ],
    }),
  ],
})
export class AppModule {}

```

您也可以使用 `useClass` 语法：

```typescript
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useClass: ThrottlerConfigService,
    }),
  ],
})
export class AppModule {}

```

只要 `ThrottlerConfigService` 实现了接口 `ThrottlerOptionsFactory`，就可以这样做。

#### 存储

内置存储是一个内存缓存，用于跟踪请求，直到它们超过全局选项设置的 TTL。您可以将自己的存储选项放入 `ThrottlerModule` 的 `storage` 选项中，只要该类实现了 `ThrottlerStorage` 接口。

对于分布式服务器，您可以使用社区存储提供者（如 [Redis](https://github.com/jmcdo29/nest-lab/tree/main/packages/throttler-storage-redis)）来拥有单一数据源。

> info **注意** `ThrottlerStorage` 可以从 `@nestjs/throttler` 导入。

#### 时间辅助方法

如果您更喜欢使用辅助方法而不是直接定义，有几个辅助方法可以使时间更易读。`@nestjs/throttler` 导出了五个不同的辅助方法：`seconds`、`minutes`、`hours`、`days` 和 `weeks`。要使用它们，只需调用 `seconds(5)` 或任何其他辅助方法，将返回正确的毫秒数。

#### 迁移指南

对于大多数人来说，将选项包装在数组中就足够了。

如果您使用自定义存储，应将 `ttl` 和 `limit` 包装在数组中，并将其分配给选项对象的 `throttlers` 属性。

任何 `@SkipThrottle()` 装饰器都可以用于绕过特定路由或方法的节流。它接受一个可选的布尔参数，默认为 `true`。当您想跳过特定端点的速率限制时，这很有用。

任何 `@Throttle()` 装饰器现在也应接受一个具有字符串键的对象，这些键与节流器上下文的名称相关（同样，如果没有名称则为 `'default'`），值为具有 `limit` 和 `ttl` 键的对象。

> Warning **重要** `ttl` 现在以**毫秒**为单位。如果您希望将 ttl 保持为秒以便阅读，请使用此包中的 `seconds` 辅助方法。它只是将 ttl 乘以 1000 以转换为毫秒。

有关更多信息，请参阅 [Changelog](https://github.com/nestjs/throttler/blob/master/CHANGELOG.md#500)。