<!-- 此文件从 content/data/caching.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T08:04:44.745Z -->
<!-- 源文件: content/data/caching.md -->
<!-- 源哈希: b91d45f384c22fdb435ec466c2bcc2d3 -->

### 缓存

缓存是一种简单而有效的**技术**，用于提升应用程序的性能。缓存充当一个临时存储层，为频繁使用的数据提供快速访问，这样你就不必反复获取或计算相同的信息。其结果是更快的响应时间和更好的整体效率。

#### 安装

要在 Nest 中开始使用缓存，请安装 `@nestjs/cache-manager` 包以及 `cache-manager` 包：

```bash
$ npm install @nestjs/cache-manager cache-manager

```

默认情况下，所有内容都存储在内存中。由于 `cache-manager` 底层使用 [Keyv](https://keyv.org/docs/)，你可以通过安装相应的包来切换到其他存储方案，例如 Redis。请参阅下方的 [Using alternative Cache stores](/data/caching#using-alternative-cache-stores)。

#### 内存缓存

要在应用程序中启用缓存，请导入 `CacheModule` 并使用 `register()` 方法对其进行配置：

```typescript
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { AppController } from './app.controller.js';

@Module({
  imports: [CacheModule.register()],
  controllers: [AppController],
})
export class AppModule {}

```

此设置使用默认配置初始化内存缓存，因此你可以立即开始缓存数据。

#### 与缓存存储交互

要与缓存管理器实例交互，请使用 `CACHE_MANAGER` 令牌将其注入到你的类中，如下所示：

```typescript
constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

```

> info **提示** `Cache` 类和 `CACHE_MANAGER` 令牌均从 `@nestjs/cache-manager` 包中导入。

使用 `Cache` 实例（来自 `cache-manager` 包）的 `get()` 方法从缓存中检索条目。如果缓存中不存在该条目，`get()` 会返回 `undefined`（`cache-manager` v6 返回的是 `null`）。在迁移时，应将两者都视为缓存未命中。

```typescript
const value = await this.cacheManager.get('key');

```

要向缓存中添加条目，请使用 `set()` 方法：

```typescript
await this.cacheManager.set('key', 'value');

```

> warning **注意** 默认的内存存储是一个 Keyv 实例，它会在存储值之前将其序列化为 JSON（也支持 Buffer）。请只存储可 JSON 序列化的值：类实例返回时会变成普通对象，`Date` 对象返回时会变成字符串，而 symbol 无法被存储。

你可以为特定键指定 TTL（过期时间，以毫秒为单位），如下所示：

```typescript
await this.cacheManager.set('key', 'value', 1000);

```

这里，缓存条目在一秒后过期。

要存储一个永不过期的条目，请传入 `0` 作为 TTL：

```typescript
await this.cacheManager.set('key', 'value', 0);

```

要从缓存中移除条目，请使用 `del()` 方法：

```typescript
await this.cacheManager.del('key');

```

要清空整个缓存，请使用 `clear()` 方法：

```typescript
await this.cacheManager.clear();

```

#### 自动缓存响应

> warning **警告** 在 [GraphQL](/graphql/quick-start) 应用程序中，拦截器会针对每个字段解析器分别执行。因此，`CacheModule`（它使用拦截器来缓存响应）在那里无法正常工作。

要自动缓存响应，请在你想要缓存数据的地方绑定 `CacheInterceptor`：

```typescript
@Controller()
@UseInterceptors(CacheInterceptor)
export class AppController {
  @Get()
  findAll(): string[] {
    return [];
  }
}

```

> warning **警告** 默认情况下，只有 `GET` 端点会被缓存（在路由处理器上显式指定 `@CacheKey()` 会绕过此检查）。此外，注入原生响应对象（`@Res()`）的 HTTP 路由无法使用 `CacheInterceptor`。更多详情请参阅 [response mapping](/overview/interceptors#响应映射)。

为减少样板代码，你可以将 `CacheInterceptor` 全局绑定到所有端点：

```typescript
import { Module } from '@nestjs/common';
import { CacheModule, CacheInterceptor } from '@nestjs/cache-manager';
import { AppController } from './app.controller.js';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Module({
  imports: [CacheModule.register()],
  controllers: [AppController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheInterceptor,
    },
  ],
})
export class AppModule {}

```

#### 生存时间（TTL）

默认情况下，`ttl` 未被设置，因此缓存条目永不过期（等同于将其设置为 `0`）。要指定自定义的 [TTL](https://en.wikipedia.org/wiki/Time_to_live)，请向 `register()` 方法传入 `ttl` 选项：

```typescript
CacheModule.register({
  ttl: 5000, // milliseconds
});

```

#### 全局使用模块

要在其他模块中使用 `CacheModule`，你需要导入它（与任何 Nest 模块一样）。或者，通过将选项对象的 `isGlobal` 属性设置为 `true` 将其声明为 [global module](/modules#全局模块)，如下所示。在这种情况下，一旦 `CacheModule` 在根模块（例如 `AppModule`）中加载，你就不需要在其他模块中导入它了。

```typescript
CacheModule.register({
  isGlobal: true,
});

```

#### 全局缓存覆盖

当 `CacheInterceptor` 被全局绑定时，缓存条目会存储在一个根据请求 URL 自动生成的键下。你可以在每个方法的基础上覆盖某些缓存设置（`@CacheKey()` 和 `@CacheTTL()`），从而为各个控制器方法定制缓存策略。这在使用 [different cache stores](/data/caching#using-alternative-cache-stores) 时最为相关。

你还可以将 `@CacheTTL()` 装饰器应用于控制器，为其所有路由设置 TTL。当同时定义了控制器级别和方法级别的 TTL 设置时，方法级别的设置优先。

```typescript
@Controller()
@CacheTTL(5000)
export class AppController {
  @CacheKey('custom_key')
  @CacheTTL(2000)
  findAll(): string[] {
    return [];
  }
}

```

> info **提示** `@CacheKey()` 和 `@CacheTTL()` 装饰器从 `@nestjs/cache-manager` 包中导入。

你可以使用 `@CacheKey()` 装饰器，无论是否搭配相应的 `@CacheTTL()` 装饰器，反之亦然，从而只覆盖键或只覆盖 TTL。未使用装饰器覆盖的设置将使用模块注册的默认值（请参阅 [Time-to-live (TTL)](/data/caching#time-to-live-ttl)）。

#### WebSocket 和微服务

你还可以将 `CacheInterceptor` 应用于 WebSocket 订阅者和微服务模式（无论使用何种传输器）。

```typescript
@CacheKey('events')
@UseInterceptors(CacheInterceptor)
@SubscribeMessage('events')
handleEvent(client: Client, data: string[]): string[] {
  return [];
}

```

在这些上下文中，`@CacheKey()` 装饰器是必需的：它指定用于存储和检索缓存数据的键。没有它，响应就不会被缓存。另外，请记住你**不应该缓存所有内容**。绝不要缓存那些执行业务操作而不仅仅是查询数据的操作。

你还可以使用 `@CacheTTL()` 装饰器指定缓存过期时间（TTL），它会覆盖默认的 TTL：

```typescript
@CacheKey('events')
@CacheTTL(1000)
@UseInterceptors(CacheInterceptor)
@SubscribeMessage('events')
handleEvent(client: Client, data: string[]): string[] {
  return [];
}

```

> info **提示** 在 HTTP 应用程序中，`@CacheTTL()` 装饰器无论是否搭配相应的 `@CacheKey()` 装饰器都能工作。在 WebSocket 和微服务上下文中，如果没有 `@CacheKey()`，它就没有效果，因为没有键就不会缓存任何内容。

#### 调整跟踪

默认情况下，Nest 使用请求 URL（在 HTTP 应用中）或通过 `@CacheKey()` 装饰器设置的缓存键（在 WebSocket 和微服务应用中）将缓存记录与你的端点关联起来。有时你可能希望基于其他因素来跟踪记录，例如 HTTP 头（比如使用 `Authorization` 来正确识别 `profile` 端点）。

为此，请创建 `CacheInterceptor` 的子类并重写 `trackBy()` 方法：

```typescript
@Injectable()
class HttpCacheInterceptor extends CacheInterceptor {
  trackBy(context: ExecutionContext): string | undefined {
    return 'key';
  }
}

```

#### 使用替代的缓存存储

要切换到不同的缓存存储，首先安装相应的包。例如，要使用 Redis，请安装 `@keyv/redis` 包。下面的示例还使用了 `cacheable` 包中的内存存储：

```bash
$ npm install @keyv/redis cacheable

```

完成这些之后，你就可以像下面这样为 `CacheModule` 注册多个存储：

```typescript
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { AppController } from './app.controller.js';
import { createKeyv } from '@keyv/redis';
import { Keyv } from 'keyv';
import { KeyvCacheableMemory } from 'cacheable';

@Module({
  imports: [
    CacheModule.registerAsync({
      useFactory: async () => {
        return {
          stores: [
            new Keyv({
              store: new KeyvCacheableMemory({ ttl: 60000, lruSize: 5000 }),
            }),
            createKeyv('redis://localhost:6379'),
          ],
        };
      },
    }),
  ],
  controllers: [AppController],
})
export class AppModule {}

```

这个示例注册了两个存储：`CacheableMemory` 和一个 Redis 存储。`CacheableMemory` 是使用 `KeyvCacheableMemory` 存储适配器创建的内存存储，而 Redis 存储则是使用 `@keyv/redis` 中的 `createKeyv()` 辅助函数创建的。`stores` 数组指定了你要使用的存储。数组中的第一个存储是默认存储，其余的是回退存储。

有关可用存储的更多信息，请参阅 [Keyv documentation](https://keyv.org/docs/)。

#### 异步配置

你可能希望以异步方式而不是在编译时静态地传递模块选项。在这种情况下，请使用 `registerAsync()` 方法，它提供了几种处理异步配置的方式。

一种方式是使用工厂函数：

```typescript
CacheModule.registerAsync({
  useFactory: () => ({
    ttl: 5000,
  }),
});

```

该工厂的行为与所有其他异步模块工厂一样：它可以是 `async`，并且可以通过 `inject` 注入依赖。

```typescript
CacheModule.registerAsync({
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    ttl: configService.get('CACHE_TTL'),
  }),
  inject: [ConfigService],
});

```

或者，你可以使用 `useClass` 语法：

```typescript
CacheModule.registerAsync({
  useClass: CacheConfigService,
});

```

这种写法会在 `CacheModule` 内部实例化 `CacheConfigService`，并使用它来获取选项对象。`CacheConfigService` 必须实现 `CacheOptionsFactory` 接口才能提供配置选项：

```typescript
@Injectable()
class CacheConfigService implements CacheOptionsFactory {
  createCacheOptions(): CacheModuleOptions {
    return {
      ttl: 5000,
    };
  }
}

```

要使用从其他模块导入的现有配置提供者，请使用 `useExisting` 语法：

```typescript
CacheModule.registerAsync({
  imports: [ConfigModule],
  useExisting: ConfigService,
});

```

它的工作方式与 `useClass` 相同，但有一个关键区别：`CacheModule` 会查找已导入的模块以复用已经创建的 `ConfigService`，而不是实例化自己的。

> info **提示** `CacheModule#register`、`CacheModule#registerAsync` 和 `CacheOptionsFactory` 接受一个可选的泛型（类型参数），用于收窄特定于存储的配置选项，从而使它们类型安全。

你还可以将 `extraProviders` 传递给 `registerAsync()` 方法。这些提供者会与模块的提供者合并：

```typescript
CacheModule.registerAsync({
  imports: [ConfigModule],
  useClass: ConfigService,
  extraProviders: [MyAdditionalProvider],
});

```

当你想要为工厂函数或类构造函数提供额外的依赖时，这非常有用。

#### 示例

可运行的示例见 [cache sample](https://github.com/nestjs/nest/tree/master/sample/20-cache)。