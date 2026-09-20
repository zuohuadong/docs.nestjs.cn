<!-- 此文件从 content/fundamentals/discovery-service.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:11:58.919Z -->
<!-- 源文件: content/fundamentals/discovery-service.md -->
<!-- 源哈希: 99b0d8252ef457f6ef66b3fe70c83518 -->

### 发现服务

`DiscoveryService` 包提供的 `@nestjs/core` 是一个强大的工具，允许开发者动态检查和检索 NestJS 应用程序中的提供者、控制器和其他元数据。这在构建依赖运行时内省的插件、装饰器或高级功能时特别有用。通过利用 `DiscoveryService`，开发者可以创建更灵活和模块化的架构，在应用程序中实现自动化和动态行为。

#### 入门

在使用 `DiscoveryService` 之前，您需要在打算使用它的模块中导入 `DiscoveryModule`。这确保了该服务可用于依赖注入。以下是如何在 NestJS 模块中配置它的示例：

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

模块设置完成后，`DiscoveryService` 可以被注入到任何需要动态发现的提供者或服务中。

```typescript title="example.service.ts"
@Injectable()
export class ExampleService {
  constructor(private readonly discoveryService: DiscoveryService) {}
}

```

#### 发现提供者和控制器

`DiscoveryService` 的关键能力之一是检索应用程序中所有已注册的提供者。这对于根据特定条件动态处理提供者非常有用。以下代码片段演示了如何访问所有提供者：

```typescript
const providers = this.discoveryService.getProviders();
console.log(providers);

```

每个提供者对象包含诸如其实例、令牌和元数据等信息。类似地，如果您需要检索应用程序中所有已注册的控制器，可以使用以下方式：

```typescript
const controllers = this.discoveryService.getControllers();
console.log(controllers);

```

此功能对于需要动态处理控制器的场景特别有益，例如分析跟踪或自动注册机制。

#### 提取元数据

除了发现提供者和控制器之外，`DiscoveryService` 还支持检索附加到这些组件上的元数据。在使用自定义装饰器在运行时存储元数据时，这尤其有价值。

例如，考虑一个使用自定义装饰器为提供者标记特定元数据的场景：

```typescript
import { DiscoveryService } from '@nestjs/core';

export const FeatureFlag = DiscoveryService.createDecorator();

```

将此装饰器应用于服务，使其能够存储稍后可查询的元数据：

```typescript
import { Injectable } from '@nestjs/common';
import { FeatureFlag } from './custom-metadata.decorator.js';

@Injectable()
@FeatureFlag('experimental')
export class CustomService {}

```

一旦以这种方式将元数据附加到提供者上，`DiscoveryService` 就可以轻松地根据分配的元数据过滤提供者。以下代码片段演示了如何检索已使用特定元数据值标记的提供者：

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

#### 结论

`DiscoveryService` 是一个多功能且强大的工具，可在 NestJS 应用程序中实现运行时内省。通过允许动态发现提供者、控制器和元数据，它在构建可扩展框架、插件和自动化驱动的功能方面发挥着至关重要的作用。无论您需要扫描和处理提供者、提取元数据以进行高级处理，还是创建模块化和可扩展的架构，`DiscoveryService` 都提供了一种高效且结构化的方法来实现这些目标。