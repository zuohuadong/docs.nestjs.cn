<!-- 此文件从 content/fundamentals/dynamic-modules.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:29:38.405Z -->
<!-- 源文件: content/fundamentals/dynamic-modules.md -->
<!-- 源哈希: c74853afbfa9751f81dbb9773c2e4c2c -->

### 动态模块

[Modules chapter](/modules) 涵盖了 Nest 模块的基础知识，并简要介绍了 [dynamic modules](/modules#动态模块)。本章将深入探讨动态模块的主题。完成后，您应该对它们是什么以及如何以及何时使用它们有很好的理解。

#### 介绍

文档的 **Overview** 部分中的大多数应用代码示例都使用常规或静态模块。模块定义了一组组件，如 [providers](/overview/providers) 和 [controllers](/overview/controllers)，它们作为一个整体应用的模块化部分组合在一起。它们为这些组件提供了执行上下文或作用域。例如，模块中定义的提供者对该模块的其他成员可见，而无需导出它们。当提供者需要在模块外部可见时，它首先从其宿主模块导出，然后导入到其消费模块中。

让我们来看一个熟悉的例子。

首先，我们将定义一个 `UsersModule` 来提供并导出一个 `UsersService`。`UsersModule` 是 `UsersService` 的 **宿主** 模块。

```typescript
import { Module } from '@nestjs/common';
import { UsersService } from './users.service.js';

@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

```

接下来，我们将定义一个 `AuthModule`，它导入 `UsersModule`，使 `UsersModule` 的导出提供者在 `AuthModule` 内部可用：

```typescript
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [UsersModule],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}

```

这些构造允许我们在例如 `AuthModule` 中托管的 `AuthService` 中注入 `UsersService`：

```typescript
import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class AuthService {
  constructor(private usersService: UsersService) {}
  /*
    Implementation that makes use of this.usersService
  */
}

```

我们将此称为 **静态** 模块绑定。Nest 连接模块所需的所有信息都已在宿主模块和消费模块中声明。让我们来解析这个过程。Nest 通过以下方式使 `UsersService` 在 `AuthModule` 内部可用：

1. 实例化 `UsersModule`，包括传递性导入 `UsersModule` 自身消费的其他模块，并传递性解析任何依赖（参见 [Custom providers](/fundamentals/dependency-injection)）。
2. 实例化 `AuthModule`，并使 `UsersModule` 的导出提供者对 `AuthModule` 中的组件可用（就像它们已在 `AuthModule` 中声明一样）。
3. 在 `AuthService` 中注入 `UsersService` 的实例。

#### 动态模块用例

使用静态模块绑定时，消费模块没有机会 **影响** 宿主模块中提供者的配置方式。这为什么重要？考虑我们有一个通用模块，需要在不同的用例中表现不同的情况。这类似于许多系统中“插件”的概念，通用设施需要一些配置才能被消费者使用。

Nest 的一个很好的例子是 **配置模块**。许多应用发现通过使用配置模块来外部化配置细节非常有用。这样可以轻松地在不同部署中动态更改应用设置：例如，开发人员的开发数据库，暂存/测试环境的暂存数据库等。通过将配置参数的管理委托给配置模块，应用源代码保持独立于配置参数。

挑战在于配置模块本身，由于它是通用的（类似于“插件”），需要由其消费模块进行定制。这就是 _动态模块_ 发挥作用的地方。使用动态模块功能，我们可以使配置模块 **动态**，以便消费模块可以使用 API 来控制配置模块在导入时的定制方式。

换句话说，动态模块提供了一个 API，用于将一个模块导入另一个模块，并在导入时定制该模块的属性和行为，而不是使用我们目前看到的静态绑定。

<app-banner-devtools></app-banner-devtools>

#### 配置模块示例

我们将使用 [configuration chapter](/techniques/configuration#服务) 中的示例代码的基本版本。本章结束时的完整版本可作为可工作的 [example here](https://github.com/nestjs/nest/tree/master/sample/25-dynamic-modules) 使用。

我们的需求是让 `ConfigModule` 接受一个 `options` 对象来定制它。这是我们想要支持的功能。基本示例将 `.env` 文件的位置硬编码为项目根文件夹。假设我们想要使其可配置，以便您可以在您选择的任何文件夹中管理您的 `.env` 文件。例如，想象您想将各种 `.env` 文件存储在项目根目录下名为 `config` 的文件夹中（即 `src` 的兄弟文件夹）。您希望在不同项目中使用 `ConfigModule` 时能够选择不同的文件夹。

动态模块使我们能够将参数传递到被导入的模块中，从而改变其行为。让我们看看这是如何工作的。从消费模块的角度来看最终目标，然后反向推导会很有帮助。首先，让我们快速回顾一下 _静态_ 导入 `ConfigModule` 的示例（即无法影响导入模块行为的方法）。请密切关注 `@Module()` 装饰器中的 `imports` 数组：

```typescript
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ConfigModule } from './config/config.module.js';

@Module({
  imports: [ConfigModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

```

让我们考虑一下 _动态模块_ 导入（我们传入配置对象）可能是什么样子。比较这两个示例中 `imports` 数组的差异：

```typescript
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ConfigModule } from './config/config.module.js';

@Module({
  imports: [ConfigModule.register({ folder: './config' })],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

```

让我们看看上面动态示例中发生了什么。有哪些关键部分？

1. `ConfigModule` 是一个普通类，因此我们可以推断它必须有一个名为 `register()` 的**静态方法**。我们知道它是静态的，因为我们是在 `ConfigModule` 类上调用它，而不是在类的**实例**上调用。注意：这个我们即将创建的方法可以有任何名称，但按照惯例，我们应该将其命名为 `forRoot()` 或 `register()`。
2. `register()` 方法由我们定义，因此我们可以接受任何我们喜欢的输入参数。在这种情况下，我们将接受一个带有适当属性的简单 `options` 对象，这是典型的情况。
3. 我们可以推断 `register()` 方法必须返回类似 `module` 的东西，因为它的返回值出现在熟悉的 `imports` 列表中，到目前为止我们看到该列表包含模块列表。

实际上，我们的 `register()` 方法将返回的是一个 `DynamicModule`。动态模块只不过是在运行时创建的模块，具有与静态模块完全相同的属性，外加一个名为 `module` 的额外属性。让我们快速回顾一个静态模块声明的示例，密切注意传递给装饰器的模块选项：

```typescript
@Module({
  imports: [DogsModule],
  controllers: [CatsController],
  providers: [CatsService],
  exports: [CatsService]
})

```

动态模块必须返回一个具有完全相同接口的对象，外加一个名为 `module` 的额外属性。`module` 属性作为模块的名称，并且应与模块的类名相同，如下例所示。

> info **提示** 对于动态模块，模块选项对象的所有属性都是可选的，**除了** `module`。

那么静态的 `register()` 方法呢？我们现在可以看到它的工作是返回一个具有 `DynamicModule` 接口的对象。当我们调用它时，我们实际上是在向 `imports` 列表提供一个模块，类似于在静态情况下通过列出模块类名来提供模块的方式。换句话说，动态模块 API 只是返回一个模块，但不是在 `@Module` 装饰器中固定属性，而是以编程方式指定它们。

还有几个细节需要补充，以帮助完整理解：

1. 我们现在可以说明，`@Module()` 装饰器的 `imports` 属性不仅可以接受模块类名（例如 `imports: [UsersModule]`），还可以接受一个**返回**动态模块的函数（例如 `imports: [ConfigModule.register(...)]`）。
2. 动态模块本身可以导入其他模块。我们在这个示例中不会这样做，但如果动态模块依赖于其他模块的提供者，您将使用可选的 `imports` 属性导入它们。同样，这与使用 `@Module()` 装饰器为静态模块声明元数据的方式完全类似。

有了这些理解，我们现在可以看看我们的动态 `ConfigModule` 声明必须是什么样子。让我们尝试一下。

```typescript
import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from './config.service.js';

@Module({})
export class ConfigModule {
  static register(): DynamicModule {
    return {
      module: ConfigModule,
      providers: [ConfigService],
      exports: [ConfigService],
    };
  }
}

```

现在应该清楚这些部分是如何联系在一起的。调用 `ConfigModule.register(...)` 返回一个 `DynamicModule` 对象，其属性本质上与到目前为止我们通过 `@Module()` 装饰器提供的元数据相同。

> info **提示** 从 `@nestjs/common` 导入 `DynamicModule`。

然而，我们的动态模块还不是很有趣，因为我们还没有引入任何**配置**它的能力，正如我们所说我们希望这样做。接下来让我们解决这个问题。

#### 模块配置

自定义 `ConfigModule` 行为的明显解决方案是在静态 `register()` 方法中传递一个 `options` 对象，正如我们上面猜测的那样。让我们再次看一下消费模块的 `imports` 属性：

```typescript
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ConfigModule } from './config/config.module.js';

@Module({
  imports: [ConfigModule.register({ folder: './config' })],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

```

这很好地处理了将 `options` 对象传递给我们的动态模块。那么我们如何在 `ConfigModule` 中使用那个 `options` 对象呢？让我们考虑一下。我们知道我们的 `ConfigModule` 基本上是一个提供和导出可注入服务（即 `ConfigService`）以供其他提供者使用的主机。实际上，是我们的 `ConfigService` 需要读取 `options` 对象来定制其行为。让我们暂时假设我们知道如何以某种方式将 `options` 从 `register()` 方法传递到 `ConfigService`。基于这个假设，我们可以对服务进行一些更改，以根据 `options` 对象的属性来定制其行为。（**注意**：目前，由于我们_尚未_实际确定如何传递它，我们将硬编码 `options`。我们稍后会修复这个问题。）

```typescript
import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import dotenv from 'dotenv';
import type { EnvConfig } from './interfaces.js';

@Injectable()
export class ConfigService {
  private readonly envConfig: EnvConfig;

  constructor() {
    const options = { folder: './config' };

    const filePath = `${process.env.NODE_ENV || 'development'}.env`;
    const envFile = path.resolve(import.meta.dirname, '../../', options.folder, filePath);
    this.envConfig = dotenv.parse(fs.readFileSync(envFile));
  }

  get(key: string): string {
    return this.envConfig[key];
  }
}

```

现在我们的 `ConfigService` 知道如何在我们在 `options` 中指定的文件夹中找到 `.env` 文件。

我们剩下的任务是以某种方式将 `options` 步骤中的 `register()` 对象注入到我们的 `ConfigService` 中。当然，我们将使用_依赖注入_来实现。这是一个关键点，所以请确保你理解它。我们的 `ConfigModule` 正在提供 `ConfigService`。`ConfigService` 反过来依赖于仅在运行时提供的 `options` 对象。因此，在运行时，我们需要首先将 `options` 对象绑定到 Nest IoC 容器，然后让 Nest 将其注入到我们的 `ConfigService` 中。记住在**自定义提供者**章节中，提供者可以 [include any value](/fundamentals/dependency-injection#非基于服务的提供者) 不仅仅是服务，所以我们可以使用依赖注入来处理一个简单的 `options` 对象。

让我们先处理将选项对象绑定到 IoC 容器。我们在静态的 `register()` 方法中这样做。记住我们正在动态构建一个模块，模块的属性之一是它的提供者列表。所以我们需要做的是将我们的选项对象定义为一个提供者。这将使其可注入到 `ConfigService` 中，我们将在下一步中利用这一点。在下面的代码中，注意 `providers` 数组：

```typescript
import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from './config.service.js';

@Module({})
export class ConfigModule {
  static register(options: Record<string, any>): DynamicModule {
    return {
      module: ConfigModule,
      providers: [
        {
          provide: 'CONFIG_OPTIONS',
          useValue: options,
        },
        ConfigService,
      ],
      exports: [ConfigService],
    };
  }
}

```

现在我们可以通过将 `'CONFIG_OPTIONS'` 提供者注入到 `ConfigService` 来完成这个过程。回想一下，当我们使用非类令牌定义提供者时，我们需要使用 `@Inject()` 装饰器 [as described here](/fundamentals/dependency-injection#非基于类的提供者令牌)。

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import dotenv from 'dotenv';
import { Injectable, Inject } from '@nestjs/common';
import type { EnvConfig } from './interfaces.js';

@Injectable()
export class ConfigService {
  private readonly envConfig: EnvConfig;

  constructor(@Inject('CONFIG_OPTIONS') private options: Record<string, any>) {
    const filePath = `${process.env.NODE_ENV || 'development'}.env`;
    const envFile = path.resolve(import.meta.dirname, '../../', options.folder, filePath);
    this.envConfig = dotenv.parse(fs.readFileSync(envFile));
  }

  get(key: string): string {
    return this.envConfig[key];
  }
}

```

最后一点：为了简单起见，我们在上面使用了基于字符串的注入令牌（`'CONFIG_OPTIONS'`），但最佳实践是将其定义为单独文件中的常量（或 `Symbol`），并导入该文件。例如：

```typescript
export const CONFIG_OPTIONS = 'CONFIG_OPTIONS';

```

#### 示例

本章代码的完整示例可以在 [here](https://github.com/nestjs/nest/tree/master/sample/25-dynamic-modules) 中找到。

#### 社区指南

你可能已经看到在一些 `@nestjs/` 包中使用了像 `forRoot`、`register` 和 `forFeature` 这样的方法，并且可能想知道这些方法之间的区别。关于这一点没有硬性规定，但 `@nestjs/` 包尝试遵循以下指南：

当使用以下方式创建模块时：

- `register`，你期望配置一个动态模块，使用特定的配置，仅供调用模块使用。例如，使用 Nest 的 `@nestjs/axios`：`HttpModule.register({ baseUrl: 'someUrl' })`。如果在另一个模块中使用 `HttpModule.register({ baseUrl: 'somewhere else' })`，它将具有不同的配置。你可以为任意数量的模块这样做。

- `forRoot`，你期望配置一次动态模块，并在多个地方重用该配置（尽管可能因为抽象而不知道）。这就是为什么你有一个 `GraphQLModule.forRoot()`、一个 `TypeOrmModule.forRoot()` 等。

- `forFeature`，你期望使用动态模块的 `forRoot` 的配置，但需要修改一些特定于调用模块需求的配置（例如，该模块应该访问哪个仓储，或日志器应该使用的上下文）。

所有这些通常也有对应的 `async` 版本，即 `registerAsync`、`forRootAsync` 和 `forFeatureAsync`，它们含义相同，但同样使用 Nest 的依赖注入来配置。

#### 可配置模块构建器

由于手动创建高度可配置、暴露 `async` 方法（`registerAsync`、`forRootAsync` 等）的动态模块相当复杂，尤其是对于新手来说，Nest 提供了 `ConfigurableModuleBuilder` 类来简化这一过程，让你只需几行代码就能构建模块“蓝图”。

例如，让我们采用上面使用的示例（`ConfigModule`）并将其转换为使用 `ConfigurableModuleBuilder`。在开始之前，让我们确保创建一个专门的接口，表示我们的 `ConfigModule` 接受什么选项。

```typescript
export interface ConfigModuleOptions {
  folder: string;
}

```

有了这个，创建一个新的专门文件（与现有的 `config.module.ts` 文件一起）并将其命名为 `config.module-definition.ts`。在这个文件中，让我们利用 `ConfigurableModuleBuilder` 来构建 `ConfigModule` 定义。

```typescript title="config.module-definition.ts"
import { ConfigurableModuleBuilder } from '@nestjs/common';
import type { ConfigModuleOptions } from './interfaces/config-module-options.interface.js';

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<ConfigModuleOptions>().build();

```

现在让我们打开 `config.module.ts` 文件并修改其实现，以利用自动生成的 `ConfigurableModuleClass`：

```typescript
import { Module } from '@nestjs/common';
import { ConfigService } from './config.service.js';
import { ConfigurableModuleClass } from './config.module-definition.js';

@Module({
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule extends ConfigurableModuleClass {}

```

扩展 `ConfigurableModuleClass` 意味着 `ConfigModule` 现在不仅提供 `register` 方法（如之前自定义实现那样），还提供 `registerAsync` 方法，允许消费者异步配置该模块，例如通过提供异步工厂：

```typescript
@Module({
  imports: [
    ConfigModule.register({ folder: './config' }),
    // or alternatively:
    // ConfigModule.registerAsync({
    //   useFactory: () => {
    //     return {
    //       folder: './config',
    //     }
    //   },
    //   inject: [...any extra dependencies...]
    // }),
  ],
})
export class AppModule {}

```

`registerAsync` 方法接受以下对象作为参数：

```typescript
{
  /**
   * Injection token resolving to a class that will be instantiated as a provider.
   * The class must implement the corresponding interface.
   */
  useClass?: Type<
    ConfigurableModuleOptionsFactory<ModuleOptions, FactoryClassMethodKey>
  >;
  /**
   * Function returning options (or a Promise resolving to options) to configure the
   * module.
   */
  useFactory?: (...args: any[]) => Promise<ModuleOptions> | ModuleOptions;
  /**
   * Dependencies that a Factory may inject.
   */
  inject?: FactoryProvider['inject'];
  /**
   * Injection token resolving to an existing provider. The provider must implement
   * the corresponding interface.
   */
  useExisting?: Type<
    ConfigurableModuleOptionsFactory<ModuleOptions, FactoryClassMethodKey>
  >;
}

```

让我们逐一了解上述属性：

- `useFactory` - 一个返回配置对象的函数。它可以是同步的或异步的。要将依赖注入到工厂函数中，请使用 `inject` 属性。我们在上面的示例中使用了这个变体。

- `inject` - 将注入到工厂函数中的依赖数组。依赖的顺序必须与工厂函数中参数的顺序匹配。

- `useClass` - 一个将被实例化为提供者的类。该类必须实现相应的接口。通常，这是一个提供 `create()` 方法并返回配置对象的类。有关更多信息，请参阅下面的 [Custom method key](/fundamentals/dynamic-modules#自定义方法键) 部分。

- `useExisting` - `useClass` 的一个变体，允许你使用现有的提供者，而不是指示 Nest 创建该类的新实例。当你想要使用模块中已注册的提供者时，这很有用。请记住，该类必须实现与 `useClass` 中使用的接口相同的接口（因此它必须提供 `create()` 方法，除非你覆盖默认的方法名称，请参阅下面的 [Custom method key](/fundamentals/dynamic-modules#自定义方法键) 部分）。

始终选择上述选项之一（`useFactory`、`useClass` 或 `useExisting`），因为它们是互斥的。

最后，让我们更新 `ConfigService` 类，以注入生成的模块选项的提供者，而不是我们迄今为止使用的 `'CONFIG_OPTIONS'`。

```typescript
@Injectable()
export class ConfigService {
  constructor(@Inject(MODULE_OPTIONS_TOKEN) private options: ConfigModuleOptions) { ... }
}

```

#### 自定义方法键

`ConfigurableModuleClass` 默认提供 `register` 及其对应的 `registerAsync` 方法。要使用不同的方法名称，请使用 `ConfigurableModuleBuilder#setClassMethodName` 方法，如下所示：

```typescript title="config.module-definition.ts"
export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<ConfigModuleOptions>().setClassMethodName('forRoot').build();

```

这种构造将指示 `ConfigurableModuleBuilder` 生成一个暴露 `forRoot` 和 `forRootAsync` 的类。示例：

```typescript
@Module({
  imports: [
    ConfigModule.forRoot({ folder: './config' }), // <-- note the use of "forRoot" instead of "register"
    // or alternatively:
    // ConfigModule.forRootAsync({
    //   useFactory: () => {
    //     return {
    //       folder: './config',
    //     }
    //   },
    //   inject: [...any extra dependencies...]
    // }),
  ],
})
export class AppModule {}

```

#### 自定义选项工厂类

由于 `registerAsync` 方法（或 `forRootAsync` 或任何其他名称，取决于配置）允许消费者传递一个解析为模块配置的提供者定义，库消费者可能提供一个类来构造配置对象。

```typescript
@Module({
  imports: [
    ConfigModule.registerAsync({
      useClass: ConfigModuleOptionsFactory,
    }),
  ],
})
export class AppModule {}

```

默认情况下，此类必须提供返回模块配置对象的 `create()` 方法。但是，如果你的库遵循不同的命名约定，你可以更改该行为并指示 `ConfigurableModuleBuilder` 期望不同的方法，例如 `createConfigOptions`，使用 `ConfigurableModuleBuilder#setFactoryMethodName` 方法：

```typescript title="config.module-definition.ts"
export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<ConfigModuleOptions>().setFactoryMethodName('createConfigOptions').build();

```

现在，`ConfigModuleOptionsFactory` 类必须暴露 `createConfigOptions` 方法（而不是 `create`）：

```typescript
@Module({
  imports: [
    ConfigModule.registerAsync({
      useClass: ConfigModuleOptionsFactory, // <-- this class must provide the "createConfigOptions" method
    }),
  ],
})
export class AppModule {}

```

#### 额外选项

在某些边界情况下，你的模块可能需要接受额外的选项来决定其行为方式（这类选项的一个很好的例子是 `isGlobal` 标志 - 或者仅仅是 `global`），同时这些选项不应包含在 `MODULE_OPTIONS_TOKEN` 提供者中（因为它们与该模块内注册的服务/提供者无关，例如，`ConfigService` 不需要知道其宿主模块是否注册为全局模块）。

在这种情况下，可以使用 `ConfigurableModuleBuilder#setExtras` 方法。请参见以下示例：

```typescript
export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<ConfigModuleOptions>()
    .setExtras(
      {
        isGlobal: true,
      },
      (definition, extras) => ({
        ...definition,
        global: extras.isGlobal,
      }),
    )
    .build();

```

在上面的示例中，传递给 `setExtras` 方法的第一个参数是一个包含"额外"属性默认值的对象。第二个参数是一个函数，它接收自动生成的模块定义（包含 `provider`、`exports` 等）以及表示额外属性的 `extras` 对象（由消费者指定或使用默认值）。该函数的返回值是修改后的模块定义。在这个具体示例中，我们获取 `extras.isGlobal` 属性并将其赋值给模块定义的 `global` 属性（这反过来决定模块是否为全局模块，更多信息请阅读 [here](/modules#动态模块)）。

现在在消费此模块时，可以传入额外的 `isGlobal` 标志，如下所示：

```typescript
@Module({
  imports: [
    ConfigModule.register({
      isGlobal: true,
      folder: './config',
    }),
  ],
})
export class AppModule {}

```

但是，由于 `isGlobal` 被声明为"额外"属性，它将不会在 `MODULE_OPTIONS_TOKEN` 提供者中可用：

```typescript
@Injectable()
export class ConfigService {
  constructor(
    @Inject(MODULE_OPTIONS_TOKEN) private options: ConfigModuleOptions,
  ) {
    // "options" object will not have the "isGlobal" property
    // ...
  }
}

```

#### 扩展自动生成的方法

如果需要，可以扩展自动生成的静态方法（`register`、`registerAsync` 等），如下所示：

```typescript
import { Module } from '@nestjs/common';
import { ConfigService } from './config.service.js';
import {
  ConfigurableModuleClass,
  ASYNC_OPTIONS_TYPE,
  OPTIONS_TYPE,
} from './config.module-definition.js';

@Module({
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule extends ConfigurableModuleClass {
  static register(options: typeof OPTIONS_TYPE): DynamicModule {
    return {
      // your custom logic here
      ...super.register(options),
    };
  }

  static registerAsync(options: typeof ASYNC_OPTIONS_TYPE): DynamicModule {
    return {
      // your custom logic here
      ...super.registerAsync(options),
    };
  }
}

```

注意使用必须从模块定义文件中导出的 `OPTIONS_TYPE` 和 `ASYNC_OPTIONS_TYPE` 类型：

```typescript
export const {
  ConfigurableModuleClass,
  MODULE_OPTIONS_TOKEN,
  OPTIONS_TYPE,
  ASYNC_OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<ConfigModuleOptions>().build();

```