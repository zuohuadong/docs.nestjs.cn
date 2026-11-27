<!-- 此文件从 content/security/rate-limiting.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:21:33.069Z -->
<!-- 源文件: content/security/rate-limiting.md -->
<!-- 源哈希: 1776eb7182572e91e5269eaaa7b7218d -->

### 速率限制

保护应用程序免受暴力破解攻击的常用技术是**速率限制**。要开始使用，请安装 `@nestjs/throttler` 包。

```bash
$ npm i --save @nestjs/throttler

```

安装完成后，像配置任何其他 Nest 包一样配置 `ThrottlerModule`，使用 `forRoot()` 或 `forRootAsync()` 方法。

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

这为应用程序受保护的路由设置全局选项：`ttl`（生存时间，单位为毫秒）和 `limit`（在 `ttl` 内的最大请求数）。

导入模块后，选择如何绑定 `ThrottlerGuard`。 [guards](/overview/guards#绑定守卫) 章中描述的任何绑定方式都有效。例如，要全局绑定守卫，请将此提供者添加到任何模块中：

```typescript
{
  provide: APP_GUARD,
  useClass: ThrottlerGuard
}

```

#### 多个节流器定义

有时您需要多个节流定义，例如每秒不超过 3 次调用、每 10 秒不超过 20 次调用和每分钟不超过 100 次调用。为此，请在带有命名选项的数组中定义它们。稍后可以在 `@SkipThrottle()` 和 `@Throttle()` 装饰器中引用这些名称，以便为每个路由或控制器更改选项。

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

您可能希望将守卫绑定到控制器或全局，但为一个或多个端点禁用速率限制。为此，使用 `@SkipThrottle()` 装饰器为整个类或单个路由禁用节流器。 `@SkipThrottle()` 装饰器也接受一个具有字符串键（节流器名称）和布尔值的对象。当您想排除控制器的大部分路由，而不是每个路由时，这很有用，并且如果有一个以上的节流器集，可以为每个节流器集配置跳过。如果未传递对象，默认为 `{ default: true }`。

```typescript
@SkipThrottle()
@Controller('users')
export class UsersController {}

```

`@SkipThrottle()` 装饰器可以跳过一个路由或一个类，或者否定跳过一个被跳过的类中的路由。

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

`@Throttle()` 装饰器会覆盖根模块中设置的 `limit` 和 `ttl`，以提供更严格或更宽松的安全选项。您可以将其应用于类或方法。从版本 5 开始，该装饰器接受一个对象，其键是节流器集名称，其值是具有 `limit` 和 `ttl` 键（以及可选的 `blockDuration`）的对象，类似于传递给根模块的选项。如果根选项中未设置名称，请使用键 `default`：

```typescript
// Override default configuration for Rate limiting and duration.
@Throttle({ default: { limit: 3, ttl: 60000 } })
@Get()
findAll() {
  return "List users works with custom rate limiting.";
}

```

#### 代理

如果您的应用程序在代理服务器后运行，请配置 HTTP 适配器以信任代理。 参见 [Express](http://expressjs.com/en/guide/behind-proxies.html)、[Fastify](https://www.fastify.io/docs/latest/Reference/Server/#trustproxy) 和 [Node adapter](/techniques/performance#node-adapter-options) 的 `trust proxy` 选项。

以下示例为 Express 适配器启用 `trust proxy`：

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

对于 Fastify 适配器，请传递 `trustProxy` 选项：

```typescript title="main.ts"
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({ trustProxy: 'loopback' }), // Trust requests from the loopback address
);

```

> warning **警告** 在 Fastify v5.12.1 及更高版本中，`request.ip` v12 安装的，作为 `trustProxy`（如 `1` 这样的跳数）传递的数字会使 Fastify 完全不信任任何代理。 `request.ip` 随后是代理的地址，并且节流器将把代理后方的每个客户端都算作一个。请像上面示例中那样，传递代理的地址或范围。

对于 Node 适配器，请传递其 `trustProxy` 选项，它接受与 Fastify 相同的值（数字在此处也不信任任何代理）：

```typescript title="main.ts"
const app = await NestFactory.create<NestNodeApplication>(
  AppModule,
  new NodeAdapter({ trustProxy: 'loopback' }), // Trust requests from the loopback address
);

```

启用 `trust proxy` 允许您从 `X-Forwarded-For` 头部检索原始 IP 地址。您还可以重写 `getTracker()` 方法，从该头部提取 IP 地址，而不是依赖 `req.ip`。以下示例适用于 Express 和 Node 适配器，它们以相同顺序排列 `req.ips`：

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

> info **提示** 在 Fastify 上，`request.ips` 的顺序是从最近的地址到最远的，因此其第一个条目是代理的地址，此守卫将把代理后方的每个客户端都算作一个。保留默认跟踪器，它使用 `request.ip`。 参见 [Express](https://expressjs.com/en/api.html#req.ips) 和 [Fastify](https://www.fastify.io/docs/latest/Reference/Request/) 的请求对象 API。

#### WebSockets

此模块支持 WebSockets，但需要扩展 `ThrottlerGuard` 类并重写其 `handleRequest()` 方法，如下所示：

```typescript
@Injectable()
export class WsThrottlerGuard extends ThrottlerGuard {
  async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context, limit, ttl, throttler, blockDuration, generateKey } =
      requestProps;

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

> info **提示** 上述示例从 `client._socket` 读取客户端地址，该方法与 `@nestjs/platform-ws` 包一起工作。如果您使用 `@nestjs/platform-socket.io`，请将 `client._socket` 替换为 `client.conn`。

在使用 WebSockets 时请记住以下几点：

- 不要将此守卫注册到 `APP_GUARD` 或 `app.useGlobalGuards()`。全局守卫也会对 HTTP 路由运行，而此守卫仅处理 WebSocket 上下文。
- 当达到限制时，Nest 会发射一个 `exception` 事件，因此请确保已准备好监听器。

> info **提示** 当您配置 [multiple throttler definitions](/security/rate-limiting#多重限流器定义) 时，`handleRequest()` 对每个节流器集运行一次。在生成存储键和调用 `storageService.increment()` 时，请从 `ThrottlerRequest` 传递 `throttler.name`，如上所示，以便每个命名节流器跟踪其自身的限制。

#### GraphQL

`ThrottlerGuard` 也适用于 GraphQL 请求。同样，扩展守卫，但这次重写 `getRequestResponse()` 方法：

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

以下选项对于传递给 `ThrottlerModule` 的数组中的每个对象都是有效的：

<table>
  <tr>
    <td><code>name</code></td>
    <td>用于内部跟踪使用哪个节流器集的名称。如果未提供，则默认为 <code>default</code>。对于命名节流器，该名称还会附加到速率限制响应头（例如 <code>X-RateLimit-Remaining-long</code>）</td>
  </tr>
  <tr>
    <td><code>ttl</code></td>
    <td>每个请求在存储中保留的毫秒数</td>
  </tr>
  <tr>
    <td><code>limit</code></td>
    <td>在 TTL 内的最大请求数</td>
  </tr>
  <tr>
    <td><code>blockDuration</code></td>
    <td>达到限制后请求被阻止的毫秒数。默认为 <code>ttl</code>值</td>
  </tr>
  <tr>
    <td><code>ignoreUserAgents</code></td>
    <td>一个匹配用户代理的正则表达式数组，用于在节流请求时忽略</td>
  </tr>
  <tr>
    <td><code>skipIf</code></td>
    <td>一个接收 <code>ExecutionContext</code> 并返回 <code>boolean</code> 以短路节流器逻辑的函数。类似于 <code>@SkipThrottle()</code>，但基于请求</td>
  </tr>
  <tr>
    <td><code>getTracker</code></td>
    <td>一个覆盖此节流器集默认跟踪器逻辑的函数（参见下表）</td>
  </tr>
  <tr>
    <td><code>generateKey</code></td>
    <td>一个覆盖此节流器集默认键生成逻辑的函数（参见下表）</td>
  </tr>
  <tr>
    <td><code>setHeaders</code></td>
    <td>是否将速率限制头添加到响应中。默认为 <code>true</code></td>
  </tr>
</table>

要设置自定义存储，或将上述选项中的部分全局应用于每个节流器集，请传递一个选项对象而不是数组。在其中定义节流器集，并使用下表中的选项：

<table>
  <tr>
    <td><code>storage</code></td>
    <td>一个跟踪节流的自定义存储服务。参见 <a href="/security/rate-limiting#存储">Storages</a></td>
  </tr>
  <tr>
    <td><code>ignoreUserAgents</code></td>
    <td>一个正则表达式数组，用于匹配用户代理，在节流请求时忽略 </td>
  </tr>
  <tr>
    <td><code>skipIf</code></td>
    <td>一个函数，接收 <code>ExecutionContext</code> 并返回一个 <code>boolean</code> 以短路节流器逻辑。类似于 <code>@SkipThrottle()</code>，但基于请求 </td>
  </tr>
  <tr>
    <td><code>throttlers</code></td>
    <td>一个节流器集合的数组，使用上表定义 </td>
  </tr>
  <tr>
    <td><code>errorMessage</code></td>
    <td>一个 <code>string</code>，或一个接收 <code>ExecutionContext</code> 和 <code>ThrottlerLimitDetail</code> 并返回一个 <code>string</code> 的函数，用于覆盖默认的节流器错误消息 </td>
  </tr>
  <tr>
    <td><code>getTracker</code></td>
    <td>一个函数，接收请求和 <code>ExecutionContext</code> 并返回一个 <code>string</code>（或其 <code>Promise</code>），覆盖 <code>getTracker()</code> 方法的默认逻辑 </td>
  </tr>
  <tr>
    <td><code>generateKey</code></td>
    <td>一个函数，接收 <code>ExecutionContext</code>、跟踪器 <code>string</code> 和节流器名称（作为 <code>string</code>），并返回用于速率限制值的存储键 <code>string</code>。这覆盖了 <code>generateKey()</code> 方法的默认逻辑 </td>
  </tr>
  <tr>
    <td><code>setHeaders</code></td>
    <td>是否将速率限制头添加到响应中。默认为 <code>true</code></td>
  </tr>
  <tr>
    <td><code>ipv6SubnetPrefix</code></td>
    <td>用于将 IPv6 地址分组到单个跟踪器的前缀长度，这样客户端就不能通过轮换其子网地址来规避限制。仅适用于内置跟踪器（不适用于自定义 <code>getTracker</code>）。默认为 <code>64</code></td>
  </tr>
</table>

#### 异步配置

您可能希望异步加载速率限制配置。使用 `forRootAsync()` 方法，它支持依赖注入和 `async` 方法。

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

只要 `ThrottlerConfigService` 实现 `ThrottlerOptionsFactory` 接口即可正常工作。

#### 存储

内置存储是一个内存缓存，它会跟踪请求，直到其 TTL 过期。只要类实现了 `ThrottlerStorage` 接口，您就可以将自己的存储传递给 `ThrottlerModule` 的 `storage` 选项。

对于分布式服务器，您可以使用社区存储提供者用于 [Redis](https://github.com/jmcdo29/nest-lab/tree/main/packages/throttler-storage-redis)，以实现单一事实来源。

> info **注意** `ThrottlerStorage` 可从 `@nestjs/throttler` 导入。

#### 时间辅助函数

`@nestjs/throttler` 导出了五个辅助函数，使时间更具可读性，而不是原始毫秒值：`seconds`、`minutes`、`hours`、`days` 和 `weeks`。每个函数都返回等效的毫秒数。例如，`seconds(5)` 返回 `5000`。

#### 迁移指南

迁移到版本 5 或更高版本时，将选项包装在数组中对于大多数应用程序就足够了。

如果您使用自定义存储，请将您的 `ttl` 和 `limit` 包装在数组中，并将其分配给选项对象的 `throttlers` 属性。

`@SkipThrottle()` 装饰器现在接受一个具有字符串键（节流器名称）和布尔值的可选对象，默认为 `{ default: true }`。

`@Throttle()` 装饰器现在接受一个具有字符串键的对象，即节流器集合的名称（如果未设置名称，则为 `'default'`），以及值为具有 `limit` 和 `ttl` 键的对象。

> warning **警告** `ttl` 现在是**毫秒**。要保持您的 `ttl` 以秒为单位以提高可读性，请使用此包中的 `seconds` 辅助函数，它将值乘以 1000。

有关更多信息，请参阅 [5.0 changelog entry](https://github.com/nestjs/throttler/blob/master/CHANGELOG.md#501)。