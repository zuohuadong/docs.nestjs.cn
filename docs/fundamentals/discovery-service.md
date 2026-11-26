<!-- 此文件从 content/fundamentals/discovery-service.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:33:51.638Z -->
<!-- 源文件: content/fundamentals/discovery-service.md -->
<!-- 源哈希: 95301dffea03ce00a0cb19095172e067 -->

### 发现服务

由 `@nestjs/core` 包提供的 `DiscoveryService` 允许您在 NestJS 应用程序中动态检查和检索提供者、控制器及其元数据。当构建依赖于运行时内省的插件、装饰器或高级功能时，这特别有用，它使您能够构建具有自动化、动态行为的更灵活、模块化的架构。

#### 入门

在使用 `DiscoveryService` 之前，请将 `DiscoveryModule` 导入到您打算使用的模块中。这使得该服务可用于依赖注入：

```typescript
import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ExampleService } from './example.service.js';

@Module({
  imports: [DiscoveryModule],
  providers: [ExampleService],
})
export class ExampleModule {}

```

设置好模块后，您可以将 `DiscoveryService` 注入到任何需要动态发现的提供者中：

```typescript title="example.service.ts"
@Injectable()
export class ExampleService {
  constructor(private readonly discoveryService: DiscoveryService) {}
}

```

#### 发现提供者和控制器

`DiscoveryService` 的一个关键能力是检索应用程序中所有已注册的提供者，这对于根据特定条件动态处理提供者非常有用。以下代码片段检索所有提供者：

```typescript
const providers = this.discoveryService.getProviders();
console.log(providers);

```

每个返回的对象都是一个 `InstanceWrapper`，其中包含提供者的实例、令牌和类（`metatype`）等信息。类似地，要检索应用程序中所有已注册的控制器，请使用：

```typescript
const controllers = this.discoveryService.getControllers();
console.log(controllers);

```

当控制器需要动态处理时（例如，用于分析跟踪或自动注册机制），这非常有用。

两个方法都接受一个可选的选项对象。传递一个包含模块类的 `include` 数组，以将发现限制在这些模块：

```typescript
const providers = this.discoveryService.getProviders({
  include: [CatsModule],
});

```

#### 提取元数据

除了发现提供者和控制器之外，`DiscoveryService` 还检索附加到这些组件的元数据。当处理存储运行时元数据的自定义装饰器时，这特别有价值。

例如，考虑一个用于使用特定元数据标记提供者的自定义装饰器：

```typescript
import { DiscoveryService } from '@nestjs/core';

export const FeatureFlag = DiscoveryService.createDecorator();

```

将此装饰器应用于服务会存储可供后续查询的元数据：

```typescript
import { Injectable } from '@nestjs/common';
import { FeatureFlag } from './custom-metadata.decorator.js';

@Injectable()
@FeatureFlag('experimental')
export class CustomService {}

```

一旦以这种方式将元数据附加到提供者上，您可以使用 `DiscoveryService` 根据分配的元数据过滤提供者。以下代码片段检索一个带有特定元数据值的提供者：

```typescript
const providers = this.discoveryService.getProviders();

const [provider] = providers.filter(
  (item) =>
    this.discoveryService.getMetadataByDecorator(FeatureFlag, item) ===
    'experimental',
);

console.log(
  'Providers with the "experimental" feature flag metadata:',
  provider,
);

```

使用 `DiscoveryService.createDecorator()` 创建的装饰器还会注册其装饰的类，因此您可以通过将装饰器的 `KEY` 作为 `metadataKey` 选项传递来检索仅这些类，而不是自己过滤所有提供者：

```typescript
const providers = this.discoveryService.getProviders({
  metadataKey: FeatureFlag.KEY,
});

```

相同的装饰器也可以应用于方法。要读取方法级别的元数据，请将方法名称作为 `getMetadataByDecorator()` 的第三个参数传递。

#### 结论

`DiscoveryService` 实现了 NestJS 应用程序的运行时内省。通过动态发现提供者、控制器及其元数据，它成为可扩展框架、插件和自动化驱动功能的构建块，无论您是需要扫描和处理提供者、提取元数据以供进一步处理，还是构建模块化架构。