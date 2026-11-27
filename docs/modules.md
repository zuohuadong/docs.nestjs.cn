<!-- 此文件从 content/modules.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:03:46.752Z -->
<!-- 源文件: content/modules.md -->
<!-- 源哈希: b08dda8ed18bfe10aff124fd88d6274d -->

### 模块

模块是使用 `@Module()` 装饰器注解的类。该装饰器提供 **Nest** 用于组织和管理应用程序结构的元数据。

<figure><img class="illustrative-image" src="/assets/Modules_1.png" /></figure>

每个 Nest 应用程序至少有一个模块，即**根模块**。它是 Nest 构建**应用程序图**的起点，应用程序图是 Nest 用于解析模块和提供者之间关系和依赖的内部结构。一个非常小的应用程序可能只有一个根模块，但大多数应用程序有多个模块，每个模块封装了一组密切相关的**能力**。模块是组织组件的**推荐**方式。

`@Module()` 装饰器接受一个包含描述模块的属性的单个对象：

|               |                                                                                                                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `providers`   | Nest 注入器将实例化并可能至少在此模块中共享的提供者                                                                                                                                                        |
| `controllers` | 在此模块中定义的必须实例化的控制器集合                                                                                                                                                                 |
| `imports`     | 导入的模块列表，这些模块导出了此模块所需的提供者                                                                                                                                                      |
| `exports`     | 此模块提供的 `providers` 子集，其他导入它的模块应可访问。您可以使用提供者本身或其令牌（即 `provide` 值）                                                                                                   |

模块默认**封装**其提供者：您只能注入当前模块的一部分提供者或由导入的模块明确导出的提供者。模块导出的提供者构成其公共接口或 API。

#### 来自元数据的根模块

小型应用程序可以跳过根模块类，直接将其元数据传递给 `NestFactory.create()`：

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { CatsController } from './cats/cats.controller.js';
import { CatsService } from './cats/cats.service.js';

const app = await NestFactory.create({
  controllers: [CatsController],
  providers: [CatsService],
});
await app.listen(process.env.PORT ?? 3000);

```

Nest 会将 `@Module()` 应用于它创建的名为 `AppModule` 的类，因此该对象具有装饰器（包括 `imports`）的相同属性，并且未知属性会在启动时以相同方式失败。`NestFactory.createApplicationContext()` 和 `NestFactory.createMicroservice()` 也接受它。

当根模块需要 [middleware](/overview/middlewares)（其 `configure()` 方法）或自己的 [lifecycle hooks](/fundamentals/lifecycle-events) 时，或者当您想引用它（如 `app.select(AppModule)` 所示），或者当 `nest generate` 应该注册其创建的内容时，请自行编写类。

#### 特性模块

在我们的示例中，`CatsController` 和 `CatsService` 密切相关并服务于相同的应用程序领域，因此将它们分组到一个特性模块中是有意义的。特性模块组织特定功能的代码，保持了清晰的边界。随着应用程序或团队的增长，这一点变得更加重要，并符合 [SOLID](https://en.wikipedia.org/wiki/SOLID) 原则。

接下来，我们将创建一个分组控制器和服务的 `CatsModule`：

```typescript title="cats/cats.module.ts"
import { Module } from '@nestjs/common';
import { CatsController } from './cats.controller.js';
import { CatsService } from './cats.service.js';

@Module({
  controllers: [CatsController],
  providers: [CatsService],
})
export class CatsModule {}

```

> info **提示** 使用 CLI 创建模块，请运行 `$ nest g module cats`。

上面，我们在 `cats.module.ts` 文件中定义了 `CatsModule`，并将所有相关内容移动到 `cats` 目录中。最后一步是将此模块导入到根模块（定义在 `app.module.ts` 文件中的 `AppModule`）：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { CatsModule } from './cats/cats.module.js';

@Module({
  imports: [CatsModule],
})
export class AppModule {}

```

目录结构现在如下所示：

<div class="file-tree">
  <div class="item">src</div>
  <div class="children">
    <div class="item">cats</div>
    <div class="children">
      <div class="item">dto</div>
      <div class="children">
        <div class="item">create-cat.dto.ts</div>
      </div>
      <div class="item">interfaces</div>
      <div class="children">
        <div class="item">cat.interface.ts</div>
      </div>
      <div class="item">cats.controller.ts</div>
      <div class="item">cats.module.ts</div>
      <div class="item">cats.service.ts</div>
    </div>
    <div class="item">app.module.ts</div>
    <div class="item">main.ts</div>
  </div>
</div>

#### 共享模块

在 Nest 中，模块默认是**单例**的，因此您可以让多个模块之间共享任何提供者的相同实例。

<figure><img class="illustrative-image" src="/assets/Shared_Module_1.png" /></figure>

每个模块都是**共享模块**：创建后，任何其他模块都可以重用它。假设您想在几个其他模块之间共享 `CatsService` 的实例。为此，首先通过将其添加到模块的 `exports` 数组中来**导出** `CatsService` 提供者：

```typescript title="cats.module.ts"
import { Module } from '@nestjs/common';
import { CatsController } from './cats.controller.js';
import { CatsService } from './cats.service.js';

@Module({
  controllers: [CatsController],
  providers: [CatsService],
  exports: [CatsService],
})
export class CatsModule {}

```

任何导入 `CatsModule` 的模块现在都可以访问 `CatsService`，并与所有导入它的其他模块共享相同的实例。

直接在每个需要的模块中注册 `CatsService` 也可以工作，但每个模块将获得该服务的独立实例。多个实例会增加内存使用量，并可能导致意外行为，例如如果服务持有内部状态，则状态不一致。

将 `CatsService` 封装在 `CatsModule` 等模块中并导出它，确保了导入 `CatsModule` 的每个模块都重用相同的实例。这减少了内存消耗，并使行为更可预测，因为共享状态和资源在一个地方得到管理。在整个应用程序中高效地共享服务是模块化和依赖注入的关键优势之一。

<app-banner-observe></app-banner-observe>

#### 模块重新导出

如上所示，模块可以导出其内部的提供者。它们也可以重新导出导入的模块。在下面的示例中，`CommonModule` 同时被导入到 **和** 从 `CoreModule` 导出，使其可供导入 `CoreModule` 的任何模块使用。

```typescript
@Module({
  imports: [CommonModule],
  exports: [CommonModule],
})
export class CoreModule {}

```

#### 依赖注入

模块类也可以**注入**提供者（例如用于配置目的）：

```typescript title="cats.module.ts"
import { Module } from '@nestjs/common';
import { CatsController } from './cats.controller.js';
import { CatsService } from './cats.service.js';

@Module({
  controllers: [CatsController],
  providers: [CatsService],
})
export class CatsModule {
  constructor(private catsService: CatsService) {}
}

```

但是，模块类本身不能作为提供者被注入，因为 [circular dependencies](/fundamentals/circular-dependency)。

#### 全局模块

在所有地方导入同一组模块会变得繁琐。在 [Angular](https://angular.dev) 中，`providers` 在全局作用域中注册，一旦定义，即可在任何地方使用。相比之下，Nest 将提供者封装在模块作用域内：如果不先导入封装它们的模块，就不能在其他地方使用该模块的提供者。

要使一组提供者开箱即用地在任何地方可用（例如辅助函数或数据库连接），请使用 `@Global()` 装饰器将模块设为**全局**：

```typescript
import { Module, Global } from '@nestjs/common';
import { CatsController } from './cats.controller.js';
import { CatsService } from './cats.service.js';

@Global()
@Module({
  controllers: [CatsController],
  providers: [CatsService],
  exports: [CatsService],
})
export class CatsModule {}

```

`@Global()` 装饰器使模块具有全局作用域。**仅注册一次**全局模块，通常在根或核心模块中。在上面的示例中，`CatsService` 提供者在任何地方都可用，并且注入它的模块无需将其添加到其 `imports` 数组中。

> info **提示** 将所有内容设为全局不是推荐的设计实践。全局模块减少了样板代码，但 `imports` 数组以受控、明确的方式使模块的 API 可用给其他模块。这保持了应用程序结构的易维护性，只共享模块所需的部分，并避免了应用程序不相关部分之间的不必要耦合。

#### 动态模块

动态模块允许您创建在运行时配置的模块。当模块的提供者依赖于导入它的模块提供的选项时，它们非常有用。例如，下面的 `FeatureFlagsModule` 通过其静态 `forRoot()` 方法接收应用程序的特性标志：

```typescript title="feature-flags.module.ts"
import { DynamicModule, Module } from '@nestjs/common';
import { FEATURE_FLAGS } from './feature-flags.constants.js';
import { FeatureFlagsService } from './feature-flags.service.js';

@Module({
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {
  static forRoot(flags: Record<string, boolean>): DynamicModule {
    return {
      module: FeatureFlagsModule,
      providers: [{ provide: FEATURE_FLAGS, useValue: flags }],
    };
  }
}

```

`FEATURE_FLAGS` 注入令牌是一个普通常量（`export const FEATURE_FLAGS = 'FEATURE_FLAGS';`），如 [Non-class-based provider tokens](/fundamentals/dependency-injection#非基于类的提供者令牌) 所述。

> info **提示** `forRoot()` 方法可能同步或异步地返回一个动态模块（即通过 `Promise`）。

`forRoot()` 返回的属性会**扩展**（而不是覆盖）在 `@Module()` 装饰器中定义的元数据。因此，生成的模块同时具有静态声明的 `FeatureFlagsService` 和动态注册的 `FEATURE_FLAGS` 提供者。因为它们属于同一个模块，所以服务可以注入这些标志：

```typescript title="feature-flags.service.ts"
import { Inject, Injectable } from '@nestjs/common';
import { FEATURE_FLAGS } from './feature-flags.constants.js';

@Injectable()
export class FeatureFlagsService {
  constructor(
    @Inject(FEATURE_FLAGS) private readonly flags: Record<string, boolean>,
  ) {}

  isEnabled(flag: string): boolean {
    return this.flags[flag] ?? false;
  }
}

```

该模块只导出 `FeatureFlagsService`，因此标志本身保持在模块的实现细节中。

按如下方式导入和配置 `FeatureFlagsModule`：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module.js';

@Module({
  imports: [
    FeatureFlagsModule.forRoot({
      newCheckout: true,
      betaDashboard: false,
    }),
  ],
})
export class AppModule {}

```

只有导入 `FeatureFlagsModule.forRoot()` 的模块才能注入 `FeatureFlagsService`。在另一个模块中再次调用 `forRoot()` 将会创建一个第二个、单独配置的实例。要共享单个实例，请配置模块一次并重新导出它。要重新导出动态模块，请在 `exports` 数组中列出模块类，而无需再次调用 `forRoot()`：

```typescript title="core.module.ts"
import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module.js';

@Module({
  imports: [
    FeatureFlagsModule.forRoot({
      newCheckout: true,
      betaDashboard: false,
    }),
  ],
  exports: [FeatureFlagsModule],
})
export class CoreModule {}

```

现在导入 `CoreModule` 的每个模块都可以注入 `FeatureFlagsService`，并且它们都共享相同的标志。

或者，要将动态模块注册到全局作用域，请在 `forRoot()` 返回的对象中将 `global` 属性设置为 `true`。然后 `FeatureFlagsService` 就可以在任何地方注入，而无需导入任何模块：

```typescript
return {
  global: true,
  module: FeatureFlagsModule,
  providers: [{ provide: FEATURE_FLAGS, useValue: flags }],
};

```

> warning **警告** 如上所述，将所有内容设为全局**不是一个好的设计决策**。

仅在运行时才知的选项，例如由 `ConfigService` 读取的值，需要 `forRoot()` 的异步变体。[Dynamic modules](/fundamentals/dynamic-modules) 章节涵盖了这一点及更多内容。

> info **提示** 要了解如何使用 `ConfigurableModuleBuilder` 构建高度可定制的动态模块，请参阅 [Configurable module builder](/fundamentals/dynamic-modules#configurable-module-builder) 部分。