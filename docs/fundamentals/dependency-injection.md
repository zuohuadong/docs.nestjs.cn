<!-- 此文件从 content/fundamentals/dependency-injection.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:35:17.857Z -->
<!-- 源文件: content/fundamentals/dependency-injection.md -->
<!-- 源哈希: ccfe195d09b258abd30c44f78ecc49f1 -->

### 自定义提供者

前面的章节讨论了**依赖注入 (DI)** 的各个方面以及 Nest 如何使用它。一个例子是[constructor-based](/overview/providers#依赖注入) 依赖注入，它将实例（通常是**服务**提供者）注入到类中。依赖注入在 Nest 核心的根本层级中内置。到目前为止，我们只探索了一个主要模式。随着应用程序变得更加复杂，您可能需要 DI 系统的完整功能集，因此本章将更详细地探讨它。

#### DI 基础

依赖注入是一种[inversion of control (IoC)](https://en.wikipedia.org/wiki/Inversion_of_control) 技术，您将依赖项的实例化委托给 IoC 容器（在我们的情况下是 NestJS 运行时系统），而不是在您自己的代码中命令式地实例化它们。让我们考察[Providers](/overview/providers) 章节中的这个示例发生了什么。

首先，我们定义一个**提供者**。`@Injectable()` **装饰器**将`CatsService` 类标记为**提供者**。

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

然后我们请求 Nest 将该**提供者**注入到我们的**控制器**类中：

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

最后，我们将**提供者**注册到 Nest IoC 容器中：

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

这三个关键步骤使其工作：

1. 在`cats.service.ts`中，`@Injectable()` **装饰器**声明`CatsService` 是 Nest IoC 容器可以管理的类。
2. 在`cats.controller.ts`中，`CatsController` 使用构造函数注入声明对`CatsService` **注入令牌**的依赖：

```typescript
  constructor(private catsService: CatsService)

```

3. 在`app.module.ts`中，我们将令牌`CatsService` 与来自`cats.service.ts` 文件的类`CatsService` 相关联。下面的<a href="/fundamentals/dependency-injection#标准提供者">标准**提供者**</a> 部分展示了这种关联（也称为_注册_）的确切方式。

当 Nest IoC 容器实例化一个`CatsController` 时，它首先查找任何依赖项\*。当它找到`CatsService` 依赖项时，它会查找`CatsService` **注入令牌**，该令牌返回`CatsService` 类，遵循注册步骤（上文 #3）。假设`SINGLETON` **作用域**（默认），Nest 随后要么创建`CatsService` 的实例并缓存它然后返回，要么如果实例已缓存，则返回现有实例。

\*此解释已简化以说明要点。在现实中，分析依赖项的代码是一个复杂的进程，发生在应用程序引导期间。一个关键属性是依赖分析（或“创建依赖图”）是**传递性**的：在上面的示例中，如果`CatsService` 本身有依赖项，这些也会被解析。依赖图确保依赖项按正确顺序解析，本质上是“自底向上”的。该机制免除了您自己管理复杂依赖图的需要。

<app-banner-courses></app-banner-courses>

#### 标准提供者

让我们仔细看看`@Module()` **装饰器**。在`app.module`中，我们声明：

```typescript
@Module({
  controllers: [CatsController],
  providers: [CatsService],
})

```

`providers` 属性接受一个**提供者**数组。到目前为止，我们已将这些**提供者**作为类名称列表提供。事实上，语法`providers: [CatsService]` 是更完整语法的简写：

```typescript
providers: [
  {
    provide: CatsService,
    useClass: CatsService,
  },
];

```

这种显式构造展示了注册过程：它将令牌`CatsService` 与类`CatsService` 相关联。简写表示法是为最常见用例提供的便利，即使用名称相同的类实例来请求实例。

#### 自定义提供者

有时您的需求超出了_标准**提供者**_所能提供的范围。例如：

- 您想创建一个自定义实例，而不是让 Nest 实例化（或返回缓存的类实例）。
- 您想在第二个依赖项中重用现有类。
- 您想用模拟版本覆盖类以进行测试。

Nest 允许您定义自定义**提供者**来处理这些情况，并提供了几种定义它们的方法。以下部分将逐一介绍每种方法。

> info **提示** 如果遇到依赖解析问题，请设置`NEST_DEBUG` **环境变量**以在启动期间获取额外的依赖解析日志。

#### 值**提供者**：`useValue`

`useValue` 语法可用于注入常量值、将外部**库**放入 Nest 容器，或用模拟对象替换真实实现。例如，假设您希望 Nest 在测试目的中使用一个模拟`CatsService`：

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

在这个示例中，`CatsService` 令牌解析为`mockCatsService` 模拟对象。`useValue` 需要一个值，在这种情况下是一个具有与它所替换的`CatsService` 类相同接口的字面量对象。由于 TypeScript 的[structural typing](https://www.typescriptlang.org/docs/handbook/type-compatibility.html)，您可以使用具有兼容接口的任何对象，包括字面量对象或使用`new` 创建的类实例。

#### 非类基础**提供者**令牌

到目前为止，我们使用类名称作为**提供者**令牌（在`providers` 数组中列出的**提供者**的`provide` 属性的值）。这与使用[constructor-based injection](/overview/providers#依赖注入) 的标准模式相匹配，其中令牌也是一个类名称。（有关令牌的刷新，请参阅<a href="/fundamentals/dependency-injection#di-fundamentals">DI 基础</a>。）有时您需要使用字符串或符号作为 DI 令牌的灵活性。例如：

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

在这个示例中，我们将一个字符串值令牌（`'CONNECTION'`）与从外部文件导入的预先存在的`connection` 对象相关联。

> warning **注意** 除了字符串，您还可以使用 JavaScript [symbols](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol) 或 TypeScript [enums](https://www.typescriptlang.org/docs/handbook/enums.html) 作为令牌值。

标准的[constructor-based injection](/overview/providers#依赖注入) 模式**要求**依赖项使用类名称声明。然而，`'CONNECTION'` 自定义**提供者**使用字符串值令牌。要注入此类**提供者**，请使用`@Inject()` **装饰器**，它接受一个参数：令牌。

```typescript
@Injectable()
export class CatsRepository {
  constructor(@Inject('CONNECTION') connection: Connection) {}
}

```

> info **提示** `@Inject()` **装饰器**是从`@nestjs/common` 包导入的。

`@Inject()` 不仅限于构造函数参数：您也可以将其应用于类属性。有关何时有用，请参阅[property-based injection](/overview/providers#基于属性的注入)。

上面的示例直接使用字符串`'CONNECTION'` 进行说明。为了代码的清晰组织，请在单独的文件中定义令牌，例如`constants.ts`，并在需要时导入它们，就像使用符号或枚举一样。

#### 接口和抽象类

TypeScript 类型和接口在编译时会被擦除，因此 Nest 无法在运行时引用它们。接口可以描述依赖项的形状，但它本身不能作为依赖注入（DI）令牌。

由于 Nest 通过运行时令牌解析提供者，因此在注册接口的提供者时，请使用字符串或 `Symbol` 令牌：

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

抽象类与接口不同，它们在运行时存在。您可以使用抽象类作为 TypeScript 合约和 DI 令牌：

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

使用抽象类令牌时，基于构造函数的注入直接使用抽象类类型，无需 `@Inject()`：

```typescript
@Injectable()
export class CatsService {
  constructor(private readonly logger: LoggerService) {}
}

```

当运行时 DI 令牌应与类解耦时，请使用字符串或 `Symbol` 令牌。`Symbol` 令牌对于库和大型应用程序尤其有用：每个符号都有唯一的运行时身份，这避免了不相关的提供者使用相同字符串令牌时可能发生的意外冲突。在使用符号令牌时，请将其从共享文件导出，并在注册和注入提供者时重用相同的符号实例。当一个制品应同时充当合约和运行时令牌，并且您偏好更简单的构造函数注入时，请使用抽象类。当类型仅用于编译时检查且不需要 DI 令牌时，一个普通接口仍然是很好的选择。

#### 类提供者：`useClass`

`useClass` 语法允许您动态确定令牌解析到的类。例如，假设我们有一个抽象（或默认）`ConfigService` 类，我们希望 Nest 根据当前环境提供配置服务的不同实现。以下代码实现了此策略：

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

此示例中有两个细节值得注意。首先，我们将 `configServiceProvider` 定义为一个字面量对象，然后将其传递给模块装饰器中的 `providers` 属性。这仅是代码组织；在功能上等同于本章迄今为止使用的示例。

其次，我们使用 `ConfigService` 类名作为令牌。对于依赖于 `ConfigService` 的任何类，Nest 都会注入所提供类的实例（`DevelopmentConfigService` 或 `ProductionConfigService`），覆盖可能在其他地方声明的任何默认实现（例如，使用 `@Injectable()` 装饰器声明的 `ConfigService`）。

#### 工厂提供者：`useFactory`

`useFactory` 语法允许您**动态**创建提供者。提供者的值是工厂函数返回的内容。工厂函数可以像需要的那样简单或复杂。一个简单的工厂可能不依赖于任何其他提供者。一个更复杂的工厂可以注入它需要以计算结果的提供者。对于后一种情况，工厂提供者语法具有一对相关的机制：

1. 工厂函数可以接受（可选）参数。
2. （可选的）`inject` 属性接受一个提供者数组，Nest 会解析该数组并将其作为参数传递给工厂函数进行实例化。这些提供者也可以被标记为可选。这两个列表是相关的：Nest 会按相同顺序将 `inject` 列表中的实例作为参数传递给工厂函数。下面的示例演示了这一点。

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

`useExisting` 语法允许您为现有提供者创建别名，这为您提供了访问同一提供者的两种方式。在下面的示例中，（基于字符串的）令牌 `'AliasedLoggerService'` 是（基于类的）令牌 `LoggerService` 的别名。假设我们有两个不同的依赖项，一个依赖于 `'AliasedLoggerService'`，另一个依赖于 `LoggerService`。如果两个依赖项都指定了 `SINGLETON` 作用域，它们都解析到同一个实例。

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

#### 非服务型提供者

提供者通常提供服务，但并非仅限于此。提供者可以提供**任何**值。例如，提供者可以根据当前环境提供一个配置对象：

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

与任何提供者一样，自定义提供者的作用域与其声明的模块相关联。要使其对其他模块可见，您必须导出它，使用其令牌或完整的提供者对象。

以下示例通过其令牌导出提供者：

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

或者，导出完整的提供者对象：

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