<!-- 此文件从 content/techniques/caching.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T09:03:44.680Z -->
<!-- 源文件: content/techniques/caching.md -->
<!-- 源哈希: 9985581542b35bde53ae4a4edfebf84f -->

### 缓存

缓存是一种强大且简单的**技术**，用于提升应用程序的性能。通过充当临时存储层，它可以更快地访问频繁使用的数据，减少重复获取或计算相同信息的需要。这带来了更快的响应时间和更高的整体效率。

#### 安装

要在 Nest 中开始使用缓存，你需要安装 `@nestjs/cache-manager` 包以及 `cache-manager` 包。

```bash
$ npm install @nestjs/cache-manager cache-manager

```

默认情况下，所有内容都存储在内存中；由于 `cache-manager` 底层使用 [Keyv](https://keyv.org/docs/)，你可以通过安装相应的包轻松切换到更高级的存储解决方案，例如 Redis。我们稍后将更详细地介绍这一点。

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

此设置使用默认配置初始化内存缓存，使你能够立即开始缓存数据。

#### 与缓存存储交互

要与缓存管理器实例交互，请使用 `CACHE_MANAGER` 令牌将其注入到你的类中，如下所示：

```typescript
constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

```

> info **提示** `Cache` 类和 `CACHE_MANAGER` 令牌均从 `@nestjs/cache-manager` 包中导入。

`Cache` 实例（来自 `cache-manager` 包）上的 `get` 方法用于从缓存中检索项目。如果缓存中不存在该项目，则返回 `undefined`（在 `cache-manager` v6 及更早版本中，返回的是 `null`）。迁移时将两者都视为假值。

```typescript
const value = await this.cacheManager.get('key');

```

要向缓存添加项目，请使用 `set` 方法：

```typescript
await this.cacheManager.set('key', 'value');

```

> warning **注意** 内存缓存存储只能存储 [the structured clone algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm#javascript_types) 支持类型的值。

你可以为此特定键手动指定 TTL（以毫秒为单位的过期时间），如下所示：

```typescript
await this.cacheManager.set('key', 'value', 1000);

```

其中 `1000` 是以毫秒为单位的 TTL——在这种情况下，缓存项将在一秒后过期。

要禁用缓存过期，请将 `ttl` 配置属性设置为 `0`：

```typescript
await this.cacheManager.set('key', 'value', 0);

```

要从缓存中移除项目，请使用 `del` 方法：

```typescript
await this.cacheManager.del('key');

```

要清除整个缓存，请使用 `clear` 方法：

```typescript
await this.cacheManager.clear();

```

#### 自动缓存响应

> warning **警告** 在 [GraphQL](/graphql/quick-start) 应用程序中，拦截器会为每个字段解析器单独执行。因此，`CacheModule`（使用拦截器缓存响应）将无法正常工作。

要启用自动缓存响应，只需在你想要缓存数据的位置绑定 `CacheInterceptor`。

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

> warning **警告** 只有 `GET` 端点会被缓存。此外，注入原生响应对象（`@Res()`）的 HTTP 服务器路由不能使用缓存拦截器。有关更多详细信息，请参阅
> <a href="/interceptors#响应映射">响应映射</a>。

为了减少所需的样板代码量，你可以将 `CacheInterceptor` 全局绑定到所有端点：

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

`ttl` 的默认值是 `0`，这意味着缓存永不过期。要指定自定义的 [TTL](https://en.wikipedia.org/wiki/Time_to_live)，你可以在 `register()` 方法中提供 `ttl` 选项，如下所示：

```typescript
CacheModule.register({
  ttl: 5000, // milliseconds
});

```

#### 全局使用模块

当你想在其他模块中使用 `CacheModule` 时，你需要导入它（这与任何 Nest 模块的标准做法一致）。或者，通过将选项对象的 `isGlobal` 属性设置为 `true` 来将其声明为 [global module](/modules#全局模块)，如下所示。在这种情况下，一旦它在根模块（例如 `AppModule`）中被加载，你就不需要在其他模块中导入 `CacheModule`。

```typescript
CacheModule.register({
  isGlobal: true,
});

```

#### 全局缓存覆盖

当全局缓存启用时，缓存条目存储在一个基于路由路径自动生成的 `CacheKey` 下。你可以按方法覆盖某些缓存设置（`@CacheKey()` 和 `@CacheTTL()`），从而为各个控制器方法定制缓存策略。这在使用 [different cache stores.](/techniques/caching#使用其他缓存存储方案) 时可能最为相关。

你可以按控制器应用 `@CacheTTL()` 装饰器来为整个控制器设置缓存 TTL。在同时定义了控制器级别和方法级别缓存 TTL 设置的情况下，方法级别指定的缓存 TTL 设置将优先于控制器级别设置的缓存 TTL 设置。

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

`@CacheKey()` 装饰器可以带或不带相应的 `@CacheTTL()` 装饰器使用，反之亦然。你可以选择只覆盖 `@CacheKey()` 或只覆盖 `@CacheTTL()`。未通过装饰器覆盖的设置将使用全局注册的默认值（参见 [Customize caching](/techniques/caching#自定义缓存)）。

#### WebSockets 和微服务

你也可以将 `CacheInterceptor` 应用于 WebSocket 订阅者以及微服务的模式（无论使用何种传输方法）。

```typescript
@CacheKey('events')
@UseInterceptors(CacheInterceptor)
@SubscribeMessage('events')
handleEvent(client: Client, data: string[]): Observable<string[]> {
  return [];
}

```

但是，需要额外的 `@CacheKey()` 装饰器来指定一个键，用于随后存储和检索缓存数据。另外，请注意你**不应缓存所有内容**。执行某些业务操作而不仅仅是查询数据的操作绝不应被缓存。

此外，你可以通过使用 `@CacheTTL()` 装饰器来指定缓存过期时间（TTL），这将覆盖全局默认的 TTL 值。

```typescript
@CacheTTL(1000)
@UseInterceptors(CacheInterceptor)
@SubscribeMessage('events')
handleEvent(client: Client, data: string[]): Observable<string[]> {
  return [];
}

```

> info **提示** `@CacheTTL()` 装饰器可以带或不带相应的 `@CacheKey()` 装饰器使用。

#### 调整追踪

默认情况下，Nest 使用请求 URL（在 HTTP 应用中）或缓存键（在 WebSockets 和微服务应用中，通过 `@CacheKey()` 装饰器设置）来将缓存记录与端点关联。然而，有时你可能希望基于不同因素来设置追踪，例如使用 HTTP 请求头（例如 `Authorization` 来正确识别 `profile` 端点）。

为了实现这一点，创建 `CacheInterceptor` 的子类并重写 `trackBy()` 方法。

```typescript
@Injectable()
class HttpCacheInterceptor extends CacheInterceptor {
  trackBy(context: ExecutionContext): string | undefined {
    return 'key';
  }
}

```

#### 使用替代缓存存储

切换到不同的缓存存储非常简单。首先，安装相应的包。例如，要使用 Redis，请安装 `@keyv/redis` 包：

```bash
$ npm install @keyv/redis

```

完成此操作后，你可以像下面这样注册带有多个存储的 `CacheModule`：

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

在此示例中，我们注册了两个存储：`CacheableMemory` 和一个 Redis 存储。`CacheableMemory` 存储是一个简单的内存存储，通过 `KeyvCacheableMemory` 存储适配器创建，而 Redis 存储通过 `@keyv/redis` 中的 `createKeyv` 辅助函数创建。`stores` 数组用于指定你要使用的存储。数组中的第一个存储是默认存储，其余的是后备存储。

查看 [Keyv documentation](https://keyv.org/docs/) 以获取有关可用存储的更多信息。

#### 异步配置

你可能希望异步传入模块选项，而不是在编译时静态传递它们。在这种情况下，使用 `registerAsync()` 方法，它提供了多种处理异步配置的方式。

一种方法是使用工厂函数：

```typescript
CacheModule.registerAsync({
  useFactory: () => ({
    ttl: 5000,
  }),
});

```

我们的工厂函数与其他异步模块工厂函数的行为相同（它可以是 `async`，并且能够通过 `inject` 注入依赖）。

```typescript
CacheModule.registerAsync({
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    ttl: configService.get('CACHE_TTL'),
  }),
  inject: [ConfigService],
});

```

或者，你可以使用 `useClass` 方法：

```typescript
CacheModule.registerAsync({
  useClass: CacheConfigService,
});

```

上述构造将在 `CacheModule` 内部实例化 `CacheConfigService`，并使用它来获取选项对象。`CacheConfigService` 必须实现 `CacheOptionsFactory` 接口才能提供配置选项：

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

如果你希望使用从其他模块导入的现有配置提供者，请使用 `useExisting` 语法：

```typescript
CacheModule.registerAsync({
  imports: [ConfigModule],
  useExisting: ConfigService,
});

```

这与 `useClass` 的工作方式相同，但有一个关键区别 - `CacheModule` 将查找导入的模块以重用任何已创建的 `ConfigService`，而不是实例化自己的。

> info **提示** `CacheModule#register`、`CacheModule#registerAsync` 和 `CacheOptionsFactory` 有一个可选的泛型（类型参数）来缩小特定于存储的配置选项，使其类型安全。

你还可以将所谓的 `extraProviders` 传递给 `registerAsync()` 方法。这些提供者将与模块提供者合并。

```typescript
CacheModule.registerAsync({
  imports: [ConfigModule],
  useClass: ConfigService,
  extraProviders: [MyAdditionalProvider],
});

```

当你希望向工厂函数或类构造函数提供额外依赖时，这非常有用。

#### 示例

可用的工作示例位于 [here](https://github.com/nestjs/nest/tree/master/sample/20-cache)。