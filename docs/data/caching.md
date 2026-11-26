<!-- 此文件从 content/data/caching.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:33:52.319Z -->
<!-- 源文件: content/data/caching.md -->
<!-- 源哈希: 89e4350888b5881ab83247770d4871f4 -->

### 缓存

缓存是一种简单而有效的**技术**，可提高应用程序的性能。缓存充当一个临时存储层，提供对常用数据的快速访问，因此您无需重复获取或计算相同的信息。结果是更快的响应时间和更好的整体效率。

#### 安装

要在 Nest 中开始使用缓存，请安装 `@nestjs/cache-manager` 包以及 `cache-manager` 包：

```bash
$ npm install @nestjs/cache-manager cache-manager

```

默认情况下，所有内容都存储在内存中。由于 `cache-manager` 在底层使用 [Keyv](https://keyv.org/docs/)，您可以通过安装适当的包来切换到不同的存储解决方案，例如 Redis。请参阅下面的 [Using alternative Cache stores](/data/caching#using-alternative-cache-stores)。

#### 内存缓存

要在应用程序中启用缓存，请导入 `CacheModule` 并使用 `register()` 方法进行配置：

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

此设置使用默认设置初始化内存缓存，因此您可以立即开始缓存数据。

#### 与缓存存储交互

要与缓存管理器实例交互，请使用 `CACHE_MANAGER` 令牌将其注入到您的类中，如下所示：

```typescript
constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

```

> info **提示** `Cache` 类和 `CACHE_MANAGER` 令牌都从 `@nestjs/cache-manager` 包导入。

使用 `Cache` 实例（来自 `cache-manager` 包）的 `get()` 方法从缓存中检索项。如果缓存中不存在该项，`get()` 返回 `undefined`（`cache-manager` v6 返回了 `null`）。迁移时请将两者都视为缓存未命中。

```typescript
const value = await this.cacheManager.get('key');

```

要将项添加到缓存中，请使用 `set()` 方法：

```typescript
await this.cacheManager.set('key', 'value');

```

> warning **注意** 默认的内存存储保留值的引用而不是副本：`get()` 返回传递给 `set()` 的相同对象，因此之后更改该对象也会更改缓存条目。请将缓存值视为只读，或在更改之前复制值。Keyv 在 [Using alternative Cache stores](/data/caching#using-alternative-cache-stores) 中将值序列化为 JSON，因此类实例返回为纯对象，而 `Date` 对象返回为字符串。

您可以为特定键指定 TTL（毫秒级的过期时间），如下所示：

```typescript
await this.cacheManager.set('key', 'value', 1000);

```

这里，缓存项在一秒后过期。

要存储永不过期的项，请传入 TTL 为 `0`：

```typescript
await this.cacheManager.set('key', 'value', 0);

```

要从缓存中移除一个项，请使用 `del()` 方法：

```typescript
await this.cacheManager.del('key');

```

要清除整个缓存，请使用 `clear()` 方法：

```typescript
await this.cacheManager.clear();

```

#### 自动缓存响应

> warning **警告** 在 [GraphQL](/graphql/quick-start) 应用程序中，拦截器为每个字段解析器单独执行。因此，`CacheModule`（使用拦截器缓存响应）在那里无法正常工作。

要自动缓存响应，请在您希望缓存数据的 `CacheInterceptor` 处绑定它：

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

> warning **警告** 默认情况下，只有 `GET` 端点被缓存（路由处理程序上的显式 `@CacheKey()` 会绕过此检查）。此外，注入原生响应对象（`@Res()`）的 HTTP 路由不能使用 `CacheInterceptor`。有关更多详细信息，请参阅 [response mapping](/overview/interceptors#响应映射)。

为了减少样板代码，您可以全局将 `CacheInterceptor` 绑定到所有端点：

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

#### 有效期 (TTL)

默认情况下，未设置 `ttl`，因此缓存条目永不过期（与设置为 `0` 相同）。要指定自定义 [TTL](https://en.wikipedia.org/wiki/Time_to_live)，请将 `ttl` 选项传递给 `register()` 方法：

```typescript
CacheModule.register({
  ttl: 5000, // milliseconds
});

```

#### 全局使用模块

要在其他模块中使用 `CacheModule`，您需要导入它（与任何 Nest 模块一样）。或者，通过将选项对象的 `isGlobal` 属性设置为 `true`，将其声明为 [global module](/modules#全局模块)，如下所示。在这种情况下，一旦 `CacheModule` 在根模块（例如 `AppModule`）中加载，就不需要在其他模块中导入它。

```typescript
CacheModule.register({
  isGlobal: true,
});

```

#### 全局缓存覆盖

当 `CacheInterceptor` 全局绑定时，缓存条目存储在根据请求 URL 自动生成的键下。您可以在每个方法级别上覆盖某些缓存设置（`@CacheKey()` 和 `@CacheTTL()`），以自定义单个控制器方法的缓存策略。当使用 [different cache stores](/data/caching#using-alternative-cache-stores) 时，这一点最为相关。

您还可以将 `@CacheTTL()` 装饰器应用于控制器，为所有路由设置 TTL。当定义了控制器级别和方法级别的 TTL 设置时，方法级别的设置优先。

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

> info **提示** `@CacheKey()` 和 `@CacheTTL()` 装饰器是从 `@nestjs/cache-manager` 包导入的。

您可以使用 `@CacheKey()` 装饰器，无论是否使用相应的 `@CacheTTL()` 装饰器，反之亦然，以仅覆盖键或仅覆盖 TTL。未通过装饰器覆盖的设置使用模块注册的默认值（参见 [Time-to-live (TTL)](/data/caching#time-to-live-ttl)）。

#### WebSocket 和微服务

您也可以将 `CacheInterceptor` 应用于 WebSocket 订阅者和微服务模式（无论使用何种传输器）。

```typescript
@CacheKey('events')
@UseInterceptors(CacheInterceptor)
@SubscribeMessage('events')
handleEvent(client: Client, data: string[]): string[] {
  return [];
}

```

在这些上下文中，需要 `@CacheKey()` 装饰器：它指定用于存储和检索缓存数据的键。没有它，响应不会被缓存。另外，请记住**不应该缓存所有内容**。切勿缓存执行业务操作而不是仅查询数据的操作。

您还可以使用 `@CacheTTL()` 装饰器指定缓存过期时间（TTL），该装饰器会覆盖默认 TTL：

```typescript
@CacheKey('events')
@CacheTTL(1000)
@UseInterceptors(CacheInterceptor)
@SubscribeMessage('events')
handleEvent(client: Client, data: string[]): string[] {
  return [];
}

```

> info **提示** 在 HTTP 应用程序中，`@CacheTTL()` 装饰器可以与相应的 `@CacheKey()` 装饰器一起使用或不使用。在 WebSocket 和微服务上下文中，如果没有 `@CacheKey()`，它没有效果，因为没有键就没有缓存。

#### 调整跟踪

默认情况下，Nest 使用请求 URL（在 HTTP 应用中）或通过 `@CacheKey()` 装饰器设置的缓存键（在 WebSocket 和微服务应用中）将缓存记录与您的端点关联起来。有时您可能希望根据其他因素跟踪记录，例如 HTTP 标头（例如，`Authorization` 以正确识别 `profile` 端点）。

要实现此目的，请创建 `CacheInterceptor` 的子类并重写 `trackBy()` 方法：

```typescript
@Injectable()
class HttpCacheInterceptor extends CacheInterceptor {
  trackBy(context: ExecutionContext): string | undefined {
    return 'key';
  }
}

```

#### 使用替代缓存存储

要切换到不同的缓存存储，首先安装相应的包。例如，要使用 Redis，请安装 `@keyv/redis` 包。下面的示例还使用了 `cacheable` 包中的内存存储：

```bash
$ npm install @keyv/redis cacheable

```

设置好后，您可以像下面所示将 `CacheModule` 注册到多个存储中：

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
        const redisStore = createKeyv('redis://localhost:6379');
        redisStore.on('error', (err) => console.error('Redis error:', err));

        return {
          stores: [
            new Keyv({
              store: new KeyvCacheableMemory({ ttl: 60000, lruSize: 5000 }),
            }),
            redisStore,
          ],
        };
      },
    }),
  ],
  controllers: [AppController],
})
export class AppModule {}

```

此示例注册了两个存储：`CacheableMemory` 和一个 Redis 存储。`CacheableMemory` 是使用 `KeyvCacheableMemory` 存储适配器创建的内存存储，而 Redis 存储是使用 `createKeyv()` 从 `@keyv/redis` 获取的帮助器创建的。`stores` 数组指定了您想要使用的存储。数组中的第一个存储是默认存储，其余的是回退存储。

> warning **警告** 务必像上面所示将 `'error'` 监听器附加到 Redis 存储上。当 Redis 连接中断时，存储会发出 `'error'` 事件，如果没有任何监听该事件，Keyv 将抛出错误，这可能导致应用程序崩溃。

有关可用存储的更多信息，请参阅 [Keyv documentation](https://keyv.org/docs/)。

#### 异步配置

您可能希望异步而不是在编译时静态地传递模块选项。在这种情况下，请使用 `registerAsync()` 方法，它提供了处理异步配置的几种方式。

一种方法是使用工厂函数：

```typescript
CacheModule.registerAsync({
  useFactory: () => ({
    ttl: 5000,
  }),
});

```

该工厂的行为与其他所有异步模块工厂一样：它可以是 `async` 并且可以通过 `inject` 注入依赖项。

```typescript
CacheModule.registerAsync({
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    ttl: configService.get('CACHE_TTL'),
  }),
  inject: [ConfigService],
});

```

或者，您可以使用 `useClass` 语法：

```typescript
CacheModule.registerAsync({
  useClass: CacheConfigService,
});

```

此构造在 `CacheModule` 内部实例化 `CacheConfigService` 并使用它来获取选项对象。`CacheConfigService` 必须实现 `CacheOptionsFactory` 接口以提供配置选项：

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

要使用从不同模块导入的现有配置提供者，请使用 `useExisting` 语法：

```typescript
CacheModule.registerAsync({
  imports: [ConfigModule],
  useExisting: ConfigService,
});

```

这与 `useClass` 相同，但有一个关键区别：`CacheModule` 会查找导入的模块以重用已创建的 `ConfigService`，而不是实例化自己的。

> info **提示** `CacheModule#register`、`CacheModule#registerAsync` 和 `CacheOptionsFactory` 接受一个可选的泛型（类型参数），可以缩小特定存储的配置选项范围，使其类型安全。

您也可以将 `extraProviders` 传递给 `registerAsync()` 方法。这些提供者会与模块的提供者合并：

```typescript
CacheModule.registerAsync({
  imports: [ConfigModule],
  useClass: ConfigService,
  extraProviders: [MyAdditionalProvider],
});

```

当您希望向工厂函数或类构造函数提供额外的依赖项时，这非常有用。

#### 示例

可用的工作示例在 [cache sample](https://github.com/nestjs/nest/tree/master/sample/20-cache) 中。