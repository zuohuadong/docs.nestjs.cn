<!-- 此文件从 content/modules.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T07:37:14.010Z -->
<!-- 源文件: content/modules.md -->
<!-- 源哈希: 3e7872001a95099dad8a13927c9954fa -->

### 模块

模块是一个用 `@Module()` 装饰器注解的类。该装饰器提供的元数据被 **Nest** 用来组织和管理应用程序结构。

<figure><img class="illustrative-image" src="/assets/Modules_1.png" /></figure>

每个 Nest 应用程序至少有一个模块，即**根模块**。它是 Nest 构建**应用程序图**的起点，应用程序图是 Nest 用来解析模块与提供者之间关系和依赖的内部结构。一个非常小的应用程序可能只有一个根模块，但大多数应用程序都有多个模块，每个模块封装了一组紧密相关的**能力**。模块是组织组件**推荐**的方式。

`@Module()` 装饰器接收一个对象，其属性用于描述该模块：

|               |                                                                                                                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `providers`   | 将由 Nest 注入器实例化、并且至少可以在该模块内共享的提供者                                                                                          |
| `controllers` | 该模块中定义、必须被实例化的控制器集合                                                                                                                                  |
| `imports`     | 导入的模块列表，这些模块导出了该模块所需的提供者                                                                                                                           |
| `exports`     | 该模块提供的 `providers` 的子集，应当可供其他导入该模块的模块使用。你可以使用提供者本身或其令牌（即 `provide` 值）                |

模块默认会**封装**其提供者：你只能注入属于当前模块的提供者，或由导入的模块显式导出的提供者。模块导出的提供者构成了它的公共接口，即 API。

#### 功能模块

在我们的示例中，`CatsController` 和 `CatsService` 紧密相关，服务于同一个应用程序领域，因此将它们归入一个功能模块是合理的。功能模块为特定功能组织代码，从而保持边界清晰。随着应用程序或团队的增长，这一点会变得更加重要，并且它与 [SOLID](https://en.wikipedia.org/wiki/SOLID) 原则相一致。

接下来，我们将创建一个 `CatsModule`，用于将控制器和服务组合在一起：

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

> info **提示** 要使用 CLI 创建模块，请运行 `$ nest g module cats`。

在上面的代码中，我们在 `cats.module.ts` 文件中定义了 `CatsModule`，并将与之相关的所有内容移入 `cats` 目录。最后一步是将该模块导入到根模块（`AppModule`，定义在 `app.module.ts` 文件中）：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { CatsModule } from './cats/cats.module.js';

@Module({
  imports: [CatsModule],
})
export class AppModule {}

```

现在的目录结构如下：

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

在 Nest 中，模块默认是**单例**的，因此你可以在多个模块之间共享任意提供者的同一个实例。

<figure><img class="illustrative-image" src="/assets/Shared_Module_1.png" /></figure>

每个模块自动就是一个**共享模块**：一旦创建，它就可以被任何其他模块复用。假设你想在多个其他模块之间共享 `CatsService` 的一个实例。为此，首先通过将 `CatsService` 提供者添加到模块的 `exports` 数组中来**导出**它：

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

任何导入了 `CatsModule` 的模块现在都可以访问 `CatsService`，并与所有其他导入了它的模块共享同一个实例。

在每个需要它的模块中直接注册 `CatsService` 也可以工作，但这样每个模块都会得到该服务各自独立的实例。多个实例会增加内存占用，并可能导致意外行为，例如当服务持有内部状态时出现状态不一致。

将 `CatsService` 封装在诸如 `CatsModule` 这样的模块中并导出它，可以确保每个导入 `CatsModule` 的模块都复用同一个实例。这减少了内存消耗，并使行为更加可预测，因为共享状态和资源集中在一处管理。在应用程序中高效地共享服务，是模块化和依赖注入的关键优势之一。

<app-banner-observe></app-banner-observe>

#### 模块再导出

如上所示，模块可以导出其内部提供者。它们也可以再导出自己所导入的模块。在下面的示例中，`CommonModule` 既被导入到 `CoreModule` 中，**又**从 `CoreModule` 中导出，这使得任何导入 `CoreModule` 的模块都可以使用它。

```typescript
@Module({
  imports: [CommonModule],
  exports: [CommonModule],
})
export class CoreModule {}

```

#### 依赖注入

模块类也可以**注入**提供者（例如，用于配置目的）：

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

然而，由于 [circular dependencies](/fundamentals/circular-dependency)，模块类本身不能作为提供者被注入。

#### 全局模块

在每个地方都导入同一组模块会变得很繁琐。在 [Angular](https://angular.dev) 中，`providers` 被注册到全局作用域中，一旦定义，就可以在任何地方使用。相比之下，Nest 将提供者封装在模块作用域内：如果不先导入封装它们的模块，就无法在其他地方使用该模块的提供者。

为了让一组提供者开箱即用地在任何地方可用（例如辅助函数或数据库连接），可以使用 `@Global()` 装饰器将该模块设为**全局**：

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

`@Global()` 装饰器使模块成为全局作用域。全局模块**只需注册一次**，通常是在根模块或核心模块中。在上面的示例中，`CatsService` 提供者在任何地方都可用，注入它的模块无需将 `CatsModule` 添加到它们的 `imports` 数组中。

> info **提示** 将所有内容都设为全局并不是推荐的设计实践。全局模块可以减少样板代码，但 `imports` 数组以受控且显式的方式将模块的 API 提供给其他模块。这样可以保持应用程序结构可维护，只共享模块中其他部分所需的部分，并避免应用程序中不相关部分之间不必要的耦合。

#### 动态模块

动态模块允许你创建在运行时配置的模块。当模块的提供者依赖于导入它的模块所提供的选项时，它们非常有用。例如，下面的 `FeatureFlagsModule` 通过其静态 `forRoot()` 方法接收应用程序的功能标志：

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

`FEATURE_FLAGS` 注入令牌是一个普通常量（`export const FEATURE_FLAGS = 'FEATURE_FLAGS';`），如 [Non-class-based provider tokens](/fundamentals/dependency-injection#非基于类的提供者令牌) 中所述。

> info **提示** `forRoot()` 方法可以同步或异步地返回动态模块（即通过 `Promise`）。

`forRoot()` 返回的属性会**扩展**（而不是覆盖）`@Module()` 装饰器中定义的元数据。因此，生成的模块既有静态声明的 `FeatureFlagsService`，也有动态注册的 `FEATURE_FLAGS` 提供者。由于它们属于同一个模块，服务可以注入这些标志：

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

该模块只导出 `FeatureFlagsService`，因此标志本身仍然是模块的实现细节。

按如下方式导入并配置 `FeatureFlagsModule`：

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

只有导入 `FeatureFlagsModule.forRoot()` 的模块才能注入 `FeatureFlagsService`。在另一个模块中再次调用 `forRoot()` 会创建一个单独配置的第二个实例。要共享单个实例，请配置一次该模块并重新导出它。要重新导出动态模块，请在 `exports` 数组中列出该模块类，而无需再次调用 `forRoot()`：

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

现在，每个导入 `CoreModule` 的模块都可以注入 `FeatureFlagsService`，并且它们都共享相同的标志。

或者，要在全局作用域中注册动态模块，请在 `forRoot()` 返回的对象中将 `global` 属性设置为 `true`。这样 `FeatureFlagsService` 就可以在任何地方注入，而无需导入任何模块：

```typescript
return {
  global: true,
  module: FeatureFlagsModule,
  providers: [{ provide: FEATURE_FLAGS, useValue: flags }],
};

```

> warning **警告** 如上所述，将所有内容都设为全局**不是一个好的设计决策**。

只有在运行时才知道的选项，例如由 `ConfigService` 读取的值，需要使用 `forRoot()` 的异步变体。[Dynamic modules](/fundamentals/dynamic-modules) 章节涵盖了这一点以及更多内容。

> info **提示** 要了解如何使用 `ConfigurableModuleBuilder` 构建高度可定制的动态模块，请参阅 [Configurable module builder](/fundamentals/dynamic-modules#configurable-module-builder) 部分。