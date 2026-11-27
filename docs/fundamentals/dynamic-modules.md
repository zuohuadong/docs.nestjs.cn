<!-- 此文件从 content/fundamentals/dynamic-modules.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:44:22.827Z -->
<!-- 源文件: content/fundamentals/dynamic-modules.md -->
<!-- 源哈希: dbc572e478f0960aa4d0b47d049abd21 -->

### 动态模块

[Modules chapter](/modules) 涵盖了 Nest 模块的基础知识，并简要介绍了 [dynamic modules](/modules#动态模块)。本章将扩展该主题：什么是动态模块、如何构建它们以及何时使用它们。

#### 简介

文档中**概述**部分的绝大多数代码示例使用常规的，或静态的，模块。模块定义了一组组件的集合，例如 [providers](/overview/providers) 和 [controllers](/overview/controllers)，它们作为一个应用程序的模块化部分组合在一起。它们为这些组件提供一个执行上下文，或作用域。例如，在模块中定义的提供者对模块的其他成员可见，而无需导出。当提供者需要在模块外部可见时，它首先从其宿主模块中导出，然后导入到其消费模块中。

考虑一个熟悉的例子。首先，一个 `UsersModule` 提供并导出了一个 `UsersService`。`UsersModule` 是 `UsersService` 的**宿主**模块。

```typescript
import { Module } from '@nestjs/common';
import { UsersService } from './users.service.js';

@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

```

接下来，一个 `AuthModule` 导入了 `UsersModule`，这使得 `UsersModule` 导出的提供者在 `AuthModule` 内部可用：

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

这些构造允许我们将 `UsersService` 注入到，例如，托管在 `AuthModule` 中的 `AuthService` 中：

```typescript
import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}
  /*
    Implementation that makes use of this.usersService
  */
}

```

我们将此称为**静态**模块绑定。Nest 需要将模块连接起来的所有信息都声明在宿主模块和消费模块中。Nest 通过以下方式在 `AuthModule` 内部提供 `UsersService`：

1. 实例化 `UsersModule`，包括传递性地导入 `UsersModule` 本身所消费的模块，并传递性地解析任何依赖项（参见 [Custom providers](/fundamentals/dependency-injection)）。
2. 实例化 `AuthModule`，并使 `UsersModule` 导出的提供者在 `AuthModule` 的组件中可用（就像它们是在 `AuthModule` 中声明的一样）。
3. 将 `UsersService` 的实例注入到 `AuthService` 中。

#### 动态模块用例

在使用静态模块绑定时，消费模块无法**影响**宿主模块提供者的配置方式。这对于需要为每个消费者表现出不同行为的通用模块很重要，就像一个在使用前需要某些配置的“插件”一样。

例如，考虑一个生成实体公共标识符的模块。以类型前缀开头的标识符，例如用户（`usr_`）和订单（`ord_`），可以让你一目了然地知道它们指的是什么类型的实体。生成逻辑对每个实体都是相同的，只有前缀不同。使用静态绑定，一个 `IdGeneratorModule` 可能只能提供一个生成器，并以一种方式配置给导入它的每个模块。我们需要的却是 `UsersModule` 和 `OrdersModule` 分别导入该模块并带有自己的前缀。

这就是**动态模块**发挥作用的地方。动态模块提供了一个 API，用于将一个模块导入到另一个模块中，并在导入时自定义该模块的属性和行为。

<app-banner-observe></app-banner-observe>

#### 动态模块示例

最好从消费模块的角度来看模块的样子开始，然后反向推导。静态导入没有提供前缀的空间：

```typescript
import { Module } from '@nestjs/common';
import { IdGeneratorModule } from '../id-generator/id-generator.module.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [IdGeneratorModule],
  providers: [UsersService],
})
export class UsersModule {}

```

另一方面，动态导入传递一个选项对象。比较两个示例中的 `imports` 数组：

```typescript
import { Module } from '@nestjs/common';
import { IdGeneratorModule } from '../id-generator/id-generator.module.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [IdGeneratorModule.register({ prefix: 'usr' })],
  providers: [UsersService],
})
export class UsersModule {}

```

让我们看看动态示例中的可变部分：

1. `IdGeneratorModule` 是一个普通类，因此它必须有一个名为 `register()` 的**静态方法**。该方法是静态的，因为它是在类上调用的，而不是在类的**实例**上调用的。该方法可以有任何名称，但根据惯例，它被称为 `register()`、`forRoot()` 或 `forFeature()`（参见 [Community guidelines](#community-guidelines)）。
2. 我们自己定义 `register()` 方法，因此它可以接受我们想要的任何参数。通常，像这里一样，它接受一个选项对象。
3. `register()` 返回的值出现在 `imports` 数组中，与模块类一起，因此它必须是 Nest 可以将其视为模块的东西。

事实上，`register()` 返回一个 `DynamicModule`。动态模块是在运行时创建的模块。它具有与静态模块元数据完全相同的属性，外加一个名为 `module` 的额外属性。下面是一个静态模块声明的示例，供比较：

```typescript
@Module({
  imports: [DogsModule],
  controllers: [CatsController],
  providers: [CatsService],
  exports: [CatsService],
})

```

动态模块是一个具有相同属性的对象，外加 `module` 属性，该属性引用模块类本身。

> info **提示** 对于动态模块，模块选项对象的所有属性都是可选的，**除了** `module`。

因此，静态 `register()` 方法的职责是返回一个实现 `DynamicModule` 接口的对象。调用它向 `imports` 数组提供了一个模块，就像在静态情况下列出模块类一样。区别在于，模块的属性是程序化指定的，而不是像在 `@Module()` 装饰器中固定的。

另外两个细节完善了整个图景：

1. `@Module()` 装饰器的 `imports` 数组不仅接受模块类（例如 `imports: [UsersModule]`），还接受静态方法返回的动态模块（例如 `imports: [IdGeneratorModule.register(...)]`）。
2. 动态模块本身可以导入其他模块。如果它依赖于其他模块的提供者，请像在静态模块的 `@Module()` 装饰器中那样，在可选的 `imports` 属性中列出它们。

考虑到这一点，这是动态 `IdGeneratorModule` 的第一个版本：

```typescript
import { DynamicModule, Module } from '@nestjs/common';
import { IdGenerator } from './id-generator.js';

@Module({})
export class IdGeneratorModule {
  static register(): DynamicModule {
    return {
      module: IdGeneratorModule,
      providers: [IdGenerator],
      exports: [IdGenerator],
    };
  }
}

```

调用 `IdGeneratorModule.register()` 返回一个 `DynamicModule` 对象，其属性基本上与我们迄今为止通过 `@Module()` 装饰器作为元数据提供的属性相同。

> info **提示** 从 `@nestjs/common` 导入 `DynamicModule`。

不过，该 **模块** 尚未可配置。我们接下来解决这个问题。

#### **模块** 配置

消费 **模块** 将选项传递给 `register()`，如上所示。问题是如何将这些选项传递给需要它们的组件。`IdGeneratorModule` 托管并导出一个可注入的 **服务** `IdGenerator`，而它是需要前缀的。目前，该 **服务** 硬编码了它：

```typescript
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

@Injectable()
export class IdGenerator {
  generate(): string {
    const options = { prefix: 'usr' };
    return `${options.prefix}_${randomUUID()}`;
  }
}

```

我们剩下的任务是将 `options` 对象从 `register()` 方法传递到 `IdGenerator`，我们将使用 **依赖注入** 来实现。关键点在于：`IdGeneratorModule` 提供 `IdGenerator`，而 `IdGenerator` 依赖于仅在运行时提供的 `options` 对象。因此，在运行时，我们首先将 `options` 对象绑定到 Nest IoC 容器，然后让 Nest 将其注入到 `IdGenerator` 中。正如 **自定义提供者** 章所述，**提供者** 不仅 **服务**，还可以 [be any value](/fundamentals/dependency-injection#非基于服务的提供者)，所以一个普通的 `options` 对象也可以。

首先，使用接口描述选项，并为其定义一个注入令牌。在一个单独的文件中定义为常量（或一个 `Symbol`）的令牌可以在需要任何地方导入：

```typescript title="id-generator.interfaces.ts"
export interface IdGeneratorModuleOptions {
  prefix: string;
}

export const ID_GENERATOR_OPTIONS = 'ID_GENERATOR_OPTIONS';

```

接下来，在静态 `register()` 方法中将选项对象绑定到 IoC 容器。我们正在动态构建一个 **模块**，而 **模块** 的一个属性是其 **提供者** 列表，因此我们将选项对象定义为一个 **提供者**。请注意 `providers` 数组：

```typescript
import { DynamicModule, Module } from '@nestjs/common';
import { IdGenerator } from './id-generator.js';
import {
  ID_GENERATOR_OPTIONS,
  IdGeneratorModuleOptions,
} from './id-generator.interfaces.js';

@Module({})
export class IdGeneratorModule {
  static register(options: IdGeneratorModuleOptions): DynamicModule {
    return {
      module: IdGeneratorModule,
      providers: [
        {
          provide: ID_GENERATOR_OPTIONS,
          useValue: options,
        },
        IdGenerator,
      ],
      exports: [IdGenerator],
    };
  }
}

```

现在将选项注入到 `IdGenerator` 中。使用非类令牌注册的 **提供者** 会使用 `@Inject()` **装饰器** 进行注入，如 [Non-class-based provider tokens](/fundamentals/dependency-injection#非基于类的提供者令牌) 所述：

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ID_GENERATOR_OPTIONS,
  type IdGeneratorModuleOptions,
} from './id-generator.interfaces.js';

@Injectable()
export class IdGenerator {
  constructor(
    @Inject(ID_GENERATOR_OPTIONS)
    private readonly options: IdGeneratorModuleOptions,
  ) {}

  generate(): string {
    return `${this.options.prefix}_${randomUUID()}`;
  }
}

```

设置完成后，每个消费 **模块** 都会配置自己的生成器：

```typescript
@Module({
  imports: [IdGeneratorModule.register({ prefix: 'usr' })],
  providers: [UsersService],
})
export class UsersModule {}

@Module({
  imports: [IdGeneratorModule.register({ prefix: 'ord' })],
  providers: [OrdersService],
})
export class OrdersModule {}

```

`UsersService` 和 `OrdersService` 都注入 `IdGenerator`，但每个都会接收到自己的实例，由导入它的 **模块** 进行配置：用户标识符以 `usr_` 开头，而顺序标识符以 `ord_` 开头。

GitHub 上的 [dynamic modules sample](https://github.com/nestjs/nest/tree/master/sample/25-dynamic-modules) 有一个可工作的示例。

#### 社区指南

您可能在某些 `@nestjs/` **模块** 包中见过 `forRoot()`、`register()` 和 `forFeature()` 等方法，并想知道它们有何不同。没有硬性规则，但 `@nestjs/` **模块** 包遵循以下指南：

- `register()` 为调用 **模块** 仅使用的动态 **模块** 进行配置，就像我们的 `IdGeneratorModule` 所做的那样。例如，使用 `@nestjs/http-client`，`HttpClientModule.register({ baseUrl: 'someUrl' })` 为调用 **模块** 配置一个 HTTP **客户端**。另一个 **模块** 可以调用 `HttpClientModule.register({ baseUrl: 'somewhere else' })` 以获取配置不同的 **客户端**。您可以按需在任意多个 **模块** 中执行此操作。
- `forRoot()` 一次性配置动态 **模块**，并在多个地方重用该配置（可能在消费者不知情的情况下）。这就是为什么一个应用程序有一个 `GraphQLModule.forRoot()`，一个 `TypeOrmModule.forRoot()` 等。
- `forFeature()` 使用由 `forRoot()` 设置的配置，但会根据调用 **模块** 的需求修改其中部分（例如，**模块** 可以访问哪些 **仓储**，或日志记录器应使用的 **执行上下文**）。

这些通常都有异步对应项：`registerAsync()`、`forRootAsync()` 和 `forFeatureAsync()`，它们含义相同，但通过 Nest 的 **依赖注入** 来解析配置。

#### 可配置的 **模块** 构建器

手动创建高度可配置的动态 **模块** 并且还暴露异步方法（`registerAsync()`、`forRootAsync()` 等）是复杂的，特别是对于新手。为了简化这一点，Nest 提供了 `ConfigurableModuleBuilder` 类，它在几行代码中构建一个 **模块** “蓝图”。

例如，让我们将上面的 `IdGeneratorModule` 转换为使用 `ConfigurableModuleBuilder`。它保留了 `IdGeneratorModuleOptions` 接口，但构建器生成了注入令牌，因此不再需要 `ID_GENERATOR_OPTIONS` 常量。

在 `id-generator.module.ts` 旁边创建一个新文件，命名为 `id-generator.module-definition.ts`，并使用 `ConfigurableModuleBuilder` 来构建 `IdGeneratorModule` 定义：

```typescript title="id-generator.module-definition.ts"
import { ConfigurableModuleBuilder } from '@nestjs/common';
import type { IdGeneratorModuleOptions } from './id-generator.interfaces.js';

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<IdGeneratorModuleOptions>().build();

```

接下来，将 `id-generator.module.ts` 更改为扩展生成的 `ConfigurableModuleClass`：

```typescript
import { Module } from '@nestjs/common';
import { IdGenerator } from './id-generator.js';
import { ConfigurableModuleClass } from './id-generator.module-definition.js';

@Module({
  providers: [IdGenerator],
  exports: [IdGenerator],
})
export class IdGeneratorModule extends ConfigurableModuleClass {}

```

与任何动态 **模块** 一样，生成的方法返回的元数据会扩展 `@Module()` **装饰器** 中的元数据，因此 `IdGenerator` 会与生成的选项 **提供者** 一起提供和导出。

最后，更新 `IdGenerator` 以注入生成的选项 **提供者**，而不是 `ID_GENERATOR_OPTIONS` 令牌：

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { IdGeneratorModuleOptions } from './id-generator.interfaces.js';
import { MODULE_OPTIONS_TOKEN } from './id-generator.module-definition.js';

@Injectable()
export class IdGenerator {
  constructor(
    @Inject(MODULE_OPTIONS_TOKEN)
    private readonly options: IdGeneratorModuleOptions,
  ) {}

  generate(): string {
    return `${this.options.prefix}_${randomUUID()}`;
  }
}

```

扩展 `ConfigurableModuleClass` 使得 `IdGeneratorModule` 不仅拥有 `register()` 方法（如手动实现所做的那样），还拥有 `registerAsync()`，允许消费者异步配置 **模块**。例如，下面的工厂使用 [`@nestjs/config`](/application/configuration) 中的 `ConfigService` 读取前缀：

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IdGeneratorModule } from '../id-generator/id-generator.module.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [
    IdGeneratorModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        prefix: configService.getOrThrow<string>('USER_ID_PREFIX'),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [UsersService],
})
export class UsersModule {}

```

`registerAsync()` 方法接受一个具有以下属性的对象：

```typescript
{
  /**
   * Modules whose exported providers the factory, class, or existing
   * provider depends on.
   */
  imports?: ModuleMetadata['imports'];
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
   * Injection token resolving to a class that will be instantiated as a provider.
   * The class must implement the corresponding interface.
   */
  useClass?: Type<
    ConfigurableModuleOptionsFactory<ModuleOptions, FactoryClassMethodKey>
  >;
  /**
   * Injection token resolving to an existing provider. The provider must implement
   * the corresponding interface.
   */
  useExisting?: Type<
    ConfigurableModuleOptionsFactory<ModuleOptions, FactoryClassMethodKey>
  >;
  /**
   * List of parent module's providers that will be filtered to only provide necessary
   * providers for the 'inject' array.
   */
  provideInjectionTokensFrom?: Provider[];
}

```

让我们逐一介绍这些属性：

- `imports` - 要导入到动态 **模块** 中的 **模块**，以便工厂、类或现有 **提供者** 可以注入其导出的 **提供者**。上面的示例导入了 `ConfigModule` 以注入 `ConfigService`。
- `useFactory` - 一个返回选项对象的函数。它可以是同步的或异步的。要将依赖项注入到工厂函数中，请使用 `inject` 属性。上面的示例使用了此变体。
- `inject` - 要注入到工厂函数中的依赖项数组。依赖项的顺序必须与工厂函数参数的顺序匹配。
- `useClass` - 要实例化为 **提供者** 的类。该类必须实现相应的接口，默认情况下意味着提供一个返回选项对象的 `create()` 方法。参见下面的 [Custom options factory class](#custom-options-factory-class)。
- `useExisting` - `useClass` 的一个变体，它重用现有 **提供者** 而不是指示 Nest 创建类的新实例。该 **提供者** 必须实现与 `useClass` 类相同的接口（并且除非如下面的 [Custom options factory class](#custom-options-factory-class) 所述更改方法名称，否则也必须提供 `create()` 方法）。
- `provideInjectionTokensFrom` - 与 `useFactory`（或 `useExisting`）和 `inject` 一起使用：一个 **提供者** 列表，Nest 从中挑选出 `inject` 中列出的 **提供者** 并将它们注册到动态 **模块** 中。当一个 **模块** 将其自身的选项传递给它异步配置的嵌套 **模块** 时，这很有用。

始终只选择 `useFactory`、`useClass` 和 `useExisting` 中的一个，因为它们是互斥的。

#### 自定义方法键

默认情况下，`ConfigurableModuleClass` 提供 `register()` 方法及其 `registerAsync()` 对等方法。要使用不同的方法名称，请使用 `ConfigurableModuleBuilder#setClassMethodName` 方法。例如，如果您的模块旨在为整个应用程序配置一次，[community guidelines](#community-guidelines) 建议使用 `forRoot()`：

```typescript title="id-generator.module-definition.ts"
export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<IdGeneratorModuleOptions>()
    .setClassMethodName('forRoot')
    .build();

```

这指示 `ConfigurableModuleBuilder` 生成一个类，该类暴露 `forRoot()` 和 `forRootAsync()`：

```typescript
@Module({
  imports: [
    IdGeneratorModule.forRoot({ prefix: 'id' }), // <-- note "forRoot" instead of "register"
    // or alternatively:
    // IdGeneratorModule.forRootAsync({
    //   useFactory: () => ({ prefix: 'id' }),
    //   inject: [...any extra dependencies...],
    // }),
  ],
})
export class AppModule {}

```

#### 自定义选项工厂类

由于 `registerAsync()` 方法（或 `forRootAsync()`，或根据配置的任何其他名称）允许消费者传递解析为模块选项的提供者定义，因此消费者也可以提供一个构建选项对象的类：

```typescript
@Module({
  imports: [
    IdGeneratorModule.registerAsync({
      useClass: IdGeneratorConfigService,
    }),
  ],
})
export class UsersModule {}

```

默认情况下，此类必须提供一个返回模块选项的 `create()` 方法。从 `@nestjs/common` 导出的 `ConfigurableModuleOptionsFactory` 接口描述了此契约：

```typescript
import { ConfigurableModuleOptionsFactory, Injectable } from '@nestjs/common';
import type { IdGeneratorModuleOptions } from '../id-generator/id-generator.interfaces.js';

@Injectable()
export class IdGeneratorConfigService
  implements ConfigurableModuleOptionsFactory<IdGeneratorModuleOptions, 'create'>
{
  create(): IdGeneratorModuleOptions {
    return { prefix: 'usr' };
  }
}

```

如果您的库遵循不同的命名约定，请指示 `ConfigurableModuleBuilder` 期望不同的方法，例如使用 `createIdGeneratorOptions` 方法：

```typescript title="id-generator.module-definition.ts"
export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<IdGeneratorModuleOptions>()
    .setFactoryMethodName('createIdGeneratorOptions')
    .build();

```

现在，`IdGeneratorConfigService` 类必须暴露 `createIdGeneratorOptions()` 方法而不是 `create()`：

```typescript
@Module({
  imports: [
    IdGeneratorModule.registerAsync({
      useClass: IdGeneratorConfigService, // <-- this class must provide the "createIdGeneratorOptions" method
    }),
  ],
})
export class UsersModule {}

```

#### 额外选项

在某些情况下，模块需要额外的选项来确定其行为，但这些不应包含在 `MODULE_OPTIONS_TOKEN` 提供者中，因为它们与模块内部注册的提供者无关。一个很好的例子是 `isGlobal` 标志：`IdGenerator` 不需要知道其宿主模块是否注册为全局模块。

对于此类选项，请使用 `ConfigurableModuleBuilder#setExtras` 方法：

```typescript
export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<IdGeneratorModuleOptions>()
    .setExtras(
      {
        isGlobal: false,
      },
      (definition, extras) => ({
        ...definition,
        global: extras.isGlobal,
      }),
    )
    .build();

```

传递给 `setExtras` 方法的第一个参数是一个包含额外属性默认值的对象。第二个参数是一个函数，它接收自动生成的模块定义（带有 `providers`、`exports` 等）和 `extras` 对象，该对象包含额外属性（由消费者指定或默认值）。该函数返回修改后的模块定义。在此示例中，`extras.isGlobal` 属性被分配到模块定义的 `global` 属性上，这决定了模块是否为全局模块（参见模块章节中的 [Dynamic modules](/modules#动态模块)）。

现在，导入此模块时，消费者可以传递附加的 `isGlobal` 标志。例如，使用一个前缀标识符的所有应用程序可以全局注册一次模块：

```typescript
@Module({
  imports: [
    IdGeneratorModule.register({
      isGlobal: true,
      prefix: 'id',
    }),
  ],
})
export class AppModule {}

```

然而，由于 `isGlobal` 被声明为额外属性，它不属于 `MODULE_OPTIONS_TOKEN` 提供的选项对象的一部分：

```typescript
@Injectable()
export class IdGenerator {
  constructor(
    @Inject(MODULE_OPTIONS_TOKEN)
    private readonly options: IdGeneratorModuleOptions,
  ) {
    // "options" object will not have the "isGlobal" property
    // ...
  }
}

```

#### 扩展自动生成的方法

如果需要，可以扩展自动生成的静态方法（`register()`、`registerAsync()` 等），如下所示：

```typescript
import { DynamicModule, Module } from '@nestjs/common';
import { IdGenerator } from './id-generator.js';
import {
  ASYNC_OPTIONS_TYPE,
  ConfigurableModuleClass,
  OPTIONS_TYPE,
} from './id-generator.module-definition.js';

@Module({
  providers: [IdGenerator],
  exports: [IdGenerator],
})
export class IdGeneratorModule extends ConfigurableModuleClass {
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

请注意 `OPTIONS_TYPE` 和 `ASYNC_OPTIONS_TYPE` 类型，它们必须从模块定义文件中导出：

```typescript
export const {
  ConfigurableModuleClass,
  MODULE_OPTIONS_TOKEN,
  OPTIONS_TYPE,
  ASYNC_OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<IdGeneratorModuleOptions>().build();

```