<!-- 此文件从 content/fundamentals/dependency-injection.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:17:40.812Z -->
<!-- 源文件: content/fundamentals/dependency-injection.md -->
<!-- 源哈希: ecf864e1509ceefe6486b0b931e1ed49 -->

### 自定义提供者

在前面的章节中，我们涉及了**依赖注入（DI）**的各个方面以及它在 Nest 中的使用方式。其中一个例子是 [constructor based](/overview/providers#依赖注入) 依赖注入，用于将实例（通常是服务提供者）注入到类中。你可能会惊讶地发现，依赖注入是 Nest 核心的基础组成部分。到目前为止，我们只探索了一种主要模式。随着你的应用程序变得越来越复杂，你可能需要利用 DI 系统的全部功能，因此让我们更详细地探讨它们。

#### DI 基础

依赖注入是一种 [inversion of control (IoC)](https://en.wikipedia.org/wiki/Inversion_of_control) 技术，其中你将依赖的实例化委托给 IoC 容器（在我们的案例中是 NestJS 运行时系统），而不是在自己的代码中命令式地完成。让我们检查一下 [Providers chapter](/overview/providers) 中这个示例发生了什么。

首先，我们定义一个提供者。`@Injectable()` 装饰器将 `CatsService` 类标记为提供者。

```typescript title="cats.service.ts"
import { Injectable } from '@nestjs/common';
import type { Cat } from './interfaces/cat.interface.js';

@Injectable()
export class CatsService {
  private readonly cats: Cat[] = [];

  findAll(): Cat[] {
    return this.cats;
  }
}

```

然后我们请求 Nest 将提供者注入到我们的控制器类中：

```typescript title="cats.controller.ts"
import { Controller, Get } from '@nestjs/common';
import { CatsService } from './cats.service.js';
import type { Cat } from './interfaces/cat.interface.js';

@Controller('cats')
export class CatsController {
  constructor(private catsService: CatsService) {}

  @Get()
  async findAll(): Promise<Cat[]> {
    return this.catsService.findAll();
  }
}

```

最后，我们将提供者注册到 Nest IoC 容器中：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { CatsController } from './cats/cats.controller.js';
import { CatsService } from './cats/cats.service.js';

@Module({
  controllers: [CatsController],
  providers: [CatsService],
})
export class AppModule {}

```

在底层究竟发生了什么才能使其工作？该过程有三个关键步骤：

1. 在 `cats.service.ts` 中，`@Injectable()` 装饰器声明 `CatsService` 类为可由 Nest IoC 容器管理的类。
2. 在 `cats.controller.ts` 中，`CatsController` 通过构造函数注入声明了对 `CatsService` 令牌的依赖：

```typescript
  constructor(private catsService: CatsService)

```

3. 在 `app.module.ts` 中，我们将令牌 `CatsService` 与 `cats.service.ts` 文件中的 `CatsService` 类关联起来。我们将在 <a href="/fundamentals/custom-providers#标准提供者">下面</a> 看到这种关联（也称为 _注册_）究竟是如何发生的。

当 Nest IoC 容器实例化一个 `CatsController` 时，它首先查找任何依赖项\*。当它找到 `CatsService` 依赖时，它会根据注册步骤（上面的 #3）对 `CatsService` 令牌执行查找，该查找返回 `CatsService` 类。假设 `SINGLETON` 作用域（默认行为），Nest 将创建 `CatsService` 的实例、缓存并返回它，或者如果已经缓存，则返回现有实例。

\*此解释为了说明问题而有所简化。我们略过的一个重要方面是，分析代码依赖的过程非常复杂，并且在应用程序引导期间发生。一个关键特性是依赖分析（或“创建依赖图”）是**传递性的**。在上面的示例中，如果 `CatsService` 本身有依赖项，这些依赖项也会被解析。依赖图确保依赖项以正确的顺序（本质上是“自下而上”）被解析。这种机制使开发人员无需管理如此复杂的依赖图。

<app-banner-courses></app-banner-courses>

#### 标准提供者

让我们更仔细地看看 `@Module()` 装饰器。在 `app.module` 中，我们声明：

```typescript
@Module({
  controllers: [CatsController],
  providers: [CatsService],
})

```

`providers` 属性接受一个 `providers` 数组。到目前为止，我们通过类名列表提供了这些提供者。实际上，语法 `providers: [CatsService]` 是更完整语法的简写：

```typescript
providers: [
  {
    provide: CatsService,
    useClass: CatsService,
  },
];

```

现在我们看到了这种显式构造，我们可以理解注册过程。在这里，我们明确地将令牌 `CatsService` 与类 `CatsService` 关联起来。简写符号只是为了简化最常见的用例，即令牌用于请求同名类的实例。

#### 自定义提供者

当你的需求超出 _标准提供者_ 提供的范围时会发生什么？以下是一些示例：

- 你想要创建自定义实例，而不是让 Nest 实例化（或返回缓存的实例）一个类
- 你想要在第二个依赖中重用现有的类
- 你想要用模拟版本覆盖一个类以进行测试

Nest 允许你定义自定义提供者来处理这些情况。它提供了几种定义自定义提供者的方式。让我们逐一介绍。

> 信息 **提示** 如果你在依赖解析方面遇到问题，可以设置 `NEST_DEBUG` 环境变量，在启动期间获取额外的依赖解析日志。

#### 值提供者：`useValue`

`useValue` 语法对于注入常量值、将外部库放入 Nest 容器或使用模拟对象替换真实实现非常有用。假设你想强制 Nest 使用模拟的 `CatsService` 进行测试。

```typescript
import { CatsService } from './cats.service.js';

const mockCatsService = {
  /* mock implementation
  ...
  */
};

@Module({
  imports: [CatsModule],
  providers: [
    {
      provide: CatsService,
      useValue: mockCatsService,
    },
  ],
})
export class AppModule {}

```

在此示例中，`CatsService` 令牌将解析为 `mockCatsService` 模拟对象。`useValue` 需要一个值——在这种情况下，是一个与它替换的 `CatsService` 类具有相同接口的字面量对象。由于 TypeScript 的 [structural typing](https://www.typescriptlang.org/docs/handbook/type-compatibility.html)，你可以使用任何具有兼容接口的对象，包括字面量对象或使用 `new` 实例化的类实例。

#### 非基于类的提供者令牌

到目前为止，我们使用类名作为提供者令牌（`providers` 数组中列出的提供者的 `provide` 属性的值）。这与 [constructor based injection](/overview/providers#依赖注入) 使用的标准模式匹配，其中令牌也是类名。（如果这个概念不完全清楚，请参考 <a href="/fundamentals/custom-providers#di-fundamentals">DI 基础</a> 以复习令牌）。有时，我们可能希望灵活地使用字符串或符号作为 DI 令牌。例如：

```typescript
import { connection } from './connection.js';

@Module({
  providers: [
    {
      provide: 'CONNECTION',
      useValue: connection,
    },
  ],
})
export class AppModule {}

```

在此示例中，我们将字符串值令牌（`'CONNECTION'`）与我们从外部文件导入的预先存在的 `connection` 对象关联起来。

> 警告 **注意** 除了使用字符串作为令牌值，你还可以使用 JavaScript [symbols](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol) 或 TypeScript [enums](https://www.typescriptlang.org/docs/handbook/enums.html)。

我们之前已经看到了如何使用标准的 [constructor based injection](/overview/providers#依赖注入) 模式注入提供者。这种模式**要求**依赖项使用类名声明。`'CONNECTION'` 自定义提供者使用字符串值令牌。让我们看看如何注入这样的提供者。为此，我们使用 `@Inject()` 装饰器。这个装饰器接受一个参数——令牌。

```typescript
@Injectable()
export class CatsRepository {
  constructor(@Inject('CONNECTION') connection: Connection) {}
}

```

> 信息 **提示** `@Inject()` 装饰器从 `@nestjs/common` 包中导入。

虽然我们在上述示例中直接使用字符串 `'CONNECTION'` 进行说明，但为了保持代码整洁，最佳实践是在单独的文件中定义令牌，例如 `constants.ts`。将它们视为在各自文件中定义并在需要时导入的符号或枚举。

#### 接口与抽象类

TypeScript 的类型/接口在编译时会被擦除，因此 Nest 在运行时无法引用它们。这意味着接口可以描述依赖的形状，但它本身不能用作 DI 令牌。

由于 Nest 通过运行时令牌解析提供者，因此在为接口注册提供者时，请使用字符串或 `Symbol` 令牌：

```typescript
export interface LoggerService {
  log(message: string): void;
}

export const LOGGER_SERVICE = Symbol('LOGGER_SERVICE');

@Injectable()
export class PinoLoggerService implements LoggerService {
  log(message: string) {
    // implementation details
  }
}

@Module({
  providers: [
    {
      provide: LOGGER_SERVICE,
      useClass: PinoLoggerService,
    },
  ],
})
export class AppModule {}

```

要注入此提供者，请将该令牌传递给 `@Inject()` 装饰器：

```typescript
@Injectable()
export class CatsService {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: LoggerService,
  ) {}
}

```

与接口不同，抽象类在运行时存在。您可以将抽象类同时用作 TypeScript 契约和 DI 令牌：

```typescript
export abstract class LoggerService {
  abstract log(message: string): void;
}

@Injectable()
export class PinoLoggerService implements LoggerService {
  log(message: string) {
    // implementation details
  }
}

@Module({
  providers: [
    {
      provide: LoggerService,
      useClass: PinoLoggerService,
    },
  ],
})
export class AppModule {}

```

使用抽象类令牌时，基于构造函数的注入可以直接使用抽象类类型，而无需 `@Inject()`：

```typescript
@Injectable()
export class CatsService {
  constructor(private readonly logger: LoggerService) {}
}

```

当运行时 DI 令牌需要与类工件解耦时，请使用字符串或 `Symbol` 令牌。`Symbol` 令牌对于库和大型应用尤其有用，因为每个符号都具有唯一的运行时标识，这有助于避免不相关的提供者使用相同字符串令牌时可能发生的意外冲突。使用符号令牌时，请从共享文件中导出它，并在注册和注入提供者的任何地方重用相同的符号实例。当一个工件应同时充当契约和运行时令牌，并且您更喜欢更简单的构造函数注入时，请使用抽象类。当类型仅用于编译时检查且不需要 DI 令牌时，普通接口仍然是不错的选择。

#### 类提供者：`useClass`

`useClass` 语法允许您动态确定令牌应解析到的类。例如，假设我们有一个抽象（或默认）的 `ConfigService` 类。根据当前环境，我们希望 Nest 提供配置服务的不同实现。以下代码实现了这种策略。

```typescript
const configServiceProvider = {
  provide: ConfigService,
  useClass:
    process.env.NODE_ENV === 'development'
      ? DevelopmentConfigService
      : ProductionConfigService,
};

@Module({
  providers: [configServiceProvider],
})
export class AppModule {}

```

让我们看一下这个代码示例中的一些细节。您会注意到，我们首先使用字面量对象定义 `configServiceProvider`，然后将其传递给模块装饰器的 `providers` 属性。这只是一点代码组织，但在功能上等同于我们本章迄今为止使用的示例。

此外，我们使用了 `ConfigService` 类名作为我们的令牌。对于任何依赖 `ConfigService` 的类，Nest 将注入所提供类（`DevelopmentConfigService` 或 `ProductionConfigService`）的实例，覆盖可能在其他地方声明的任何默认实现（例如，使用 `@Injectable()` 装饰器声明的 `ConfigService`）。

#### 工厂提供者：`useFactory`

`useFactory` 语法允许您**动态**创建提供者。实际的提供者将由工厂函数返回的值提供。工厂函数可以根据需要简单或复杂。简单的工厂可能不依赖任何其他提供者。更复杂的工厂可以自行注入计算其结果所需的其他提供者。对于后一种情况，工厂提供者语法有一对相关机制：

1. 工厂函数可以接受（可选的）参数。
2. （可选的）`inject` 属性接受一个提供者数组，Nest 将在实例化过程中解析这些提供者并将其作为参数传递给工厂函数。此外，这些提供者可以标记为可选。这两个列表应该相关联：Nest 将按相同顺序将 `inject` 列表中的实例作为参数传递给工厂函数。下面的示例演示了这一点。

```typescript
const connectionProvider = {
  provide: 'CONNECTION',
  useFactory: (optionsProvider: MyOptionsProvider, optionalProvider?: string) => {
    const options = optionsProvider.get();
    return new DatabaseConnection(options);
  },
  inject: [MyOptionsProvider, { token: 'SomeOptionalProvider', optional: true }],
  //       \______________/             \__________________/
  //        This provider                The provider with this token
  //        is mandatory.                can resolve to `undefined`.
};

@Module({
  providers: [
    connectionProvider,
    MyOptionsProvider, // class-based provider
    // { provide: 'SomeOptionalProvider', useValue: 'anything' },
  ],
})
export class AppModule {}

```

#### 别名提供者：`useExisting`

`useExisting` 语法允许您为现有提供者创建别名。这创建了两种访问同一提供者的方式。在下面的示例中，（基于字符串的）令牌 `'AliasedLoggerService'` 是（基于类的）令牌 `LoggerService` 的别名。假设我们有两个不同的依赖项，一个用于 `'AliasedLoggerService'`，另一个用于 `LoggerService`。如果两个依赖项都指定了 `SINGLETON` 作用域，它们都将解析为同一个实例。

```typescript
@Injectable()
class LoggerService {
  /* implementation details */
}

const loggerAliasProvider = {
  provide: 'AliasedLoggerService',
  useExisting: LoggerService,
};

@Module({
  providers: [LoggerService, loggerAliasProvider],
})
export class AppModule {}

```

#### 非基于服务的提供者

虽然提供者通常提供服务，但它们不仅限于此用途。提供者可以提供**任何**值。例如，提供者可以根据当前环境提供配置对象数组，如下所示：

```typescript
const configFactory = {
  provide: 'CONFIG',
  useFactory: () => {
    return process.env.NODE_ENV === 'development' ? devConfig : prodConfig;
  },
};

@Module({
  providers: [configFactory],
})
export class AppModule {}

```

#### 导出自定义提供者

与任何提供者一样，自定义提供者限定在其声明模块内。要使其对其他模块可见，必须将其导出。要导出自定义提供者，我们可以使用其令牌或完整的提供者对象。

以下示例展示了使用令牌导出：

```typescript
const connectionFactory = {
  provide: 'CONNECTION',
  useFactory: (optionsProvider: OptionsProvider) => {
    const options = optionsProvider.get();
    return new DatabaseConnection(options);
  },
  inject: [OptionsProvider],
};

@Module({
  providers: [connectionFactory],
  exports: ['CONNECTION'],
})
export class AppModule {}

```

或者，使用完整的提供者对象导出：

```typescript
const connectionFactory = {
  provide: 'CONNECTION',
  useFactory: (optionsProvider: OptionsProvider) => {
    const options = optionsProvider.get();
    return new DatabaseConnection(options);
  },
  inject: [OptionsProvider],
};

@Module({
  providers: [connectionFactory],
  exports: [connectionFactory],
})
export class AppModule {}

```