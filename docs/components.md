<!-- 此文件从 content/components.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T07:35:53.666Z -->
<!-- 源文件: content/components.md -->
<!-- 源哈希: 9b99f6fb49ac71bc4125179fa6ebd4ca -->

### 提供者

提供者是 Nest 中的一个核心概念。许多基本的 Nest 类，例如服务、仓储、工厂和辅助类，都可以被视为提供者。提供者背后的主要思想是它可以作为依赖被**注入**，这使得对象之间可以建立关系。Nest 运行时负责"连接"这些对象。

<figure><img class="illustrative-image" src="/assets/Components_1.png" /></figure>

在上一章中，我们构建了一个基本的 `CatsController`。控制器应处理 HTTP 请求，并将更复杂的任务委托给**提供者**。在最简单的形式中，提供者是列在模块的 `providers` 数组中的普通 JavaScript 类。更多细节请参见 [Modules](/modules) 章节。

> info **提示** Nest 允许你以面向对象的方式设计和组织依赖关系，因此遵循 [SOLID principles](https://en.wikipedia.org/wiki/SOLID) 是一个好习惯。

#### 服务

让我们从创建一个 `CatsService` 开始。该服务负责 `CatsController` 的数据存储和检索。由于它封装了应用逻辑，因此它是提供者的天然候选。

```typescript title="cats.service.ts"
import { Injectable } from '@nestjs/common';
import type { Cat } from './interfaces/cat.interface.js';

@Injectable()
export class CatsService {
  private readonly cats: Cat[] = [];

  create(cat: Cat) {
    this.cats.push(cat);
  }

  findAll(): Cat[] {
    return this.cats;
  }
}

```

> info **提示** 要使用 CLI 创建服务，请运行 `$ nest g service cats`。

`CatsService` 是一个包含一个属性和两个方法的基本类。关键的新增内容是 `@Injectable()` 装饰器。它将元数据附加到该类上，声明 `CatsService` 可以由 Nest [IoC](https://en.wikipedia.org/wiki/Inversion_of_control) 容器管理。

该示例还使用了一个 `Cat` 接口：

```typescript title="interfaces/cat.interface.ts"
export interface Cat {
  name: string;
  age: number;
  breed: string;
}

```

现在我们有了一个用于存储和检索猫的服务，让我们在 `CatsController` 中使用它：

```typescript title="cats.controller.ts"
import { Controller, Get, Post, Body } from '@nestjs/common';
import { CreateCatDto } from './dto/create-cat.dto.js';
import { CatsService } from './cats.service.js';
import type { Cat } from './interfaces/cat.interface.js';

@Controller('cats')
export class CatsController {
  constructor(private catsService: CatsService) {}

  @Post()
  async create(@Body() createCatDto: CreateCatDto) {
    this.catsService.create(createCatDto);
  }

  @Get()
  async findAll(): Promise<Cat[]> {
    return this.catsService.findAll();
  }
}

```

`CatsService` 通过类构造函数被**注入**。下一节将解释 Nest 如何解析它。

#### 依赖注入

Nest 是围绕**依赖注入**设计模式构建的。有关该概念的介绍，请参见 [Angular documentation](https://angular.dev/guide/di)。

Nest 根据依赖的类型来解析它们。在下面的示例中，Nest 通过提供 `CatsService` 的实例来解析 `catsService`。在默认（单例）作用域下，Nest 只创建一次实例，并将其共享给每个依赖它的类。然后 Nest 将该实例传递给控制器的构造函数：

```typescript
constructor(private catsService: CatsService) {}

```

这一行代码做了两件事：

- `private` 关键字使 `catsService` 成为一个 TypeScript **参数属性**：它在类上声明一个 `catsService` 成员，并将构造函数参数赋值给它，因此你不必自己编写 `this.catsService = catsService`。
- `CatsService` 类型注解是 Nest 进行解析的依据。在编译时，TypeScript 会将构造函数的参数类型作为元数据发出，容器读取该元数据以确定要提供哪个提供者。

> warning **警告** 由于解析依赖于发出的类型，因此注解必须引用运行时存在的东西，即**类**。接口和类型别名在编译期间会被擦除。如果 `AppConfig` 是一个接口，`constructor(private config: AppConfig)` 会让 Nest 没有可查找的令牌，应用程序会在启动时失败，并报出 "Nest can't resolve dependencies" 错误。当你使用 `import type` 导入一个类时也会发生同样的情况，因为该导入也会被擦除。要注入不是类的东西，请将其注册在一个令牌下，并使用 `@Inject()` 显式注入它，如 [Custom providers](/fundamentals/dependency-injection#interfaces-and-abstract-classes) 中所述。

#### 作用域

默认情况下，提供者的生命周期（"作用域"）与应用程序生命周期一致。当应用程序启动时，Nest 会解析每个依赖，这意味着每个提供者都会被实例化。同样，当应用程序关闭时，每个提供者都会被销毁。你也可以为提供者指定不同的作用域，例如，使其成为**请求作用域**，这样它的生命周期就与单个请求绑定。详情请参见 [Injection scopes](/fundamentals/provider-scopes) 章节。

<app-banner-courses></app-banner-courses>

#### 自定义提供者

Nest 有一个内置的控制反转（IoC）容器，用于管理提供者之间的关系。该容器是依赖注入的基础，并且支持的不只是目前展示的基于类的提供者：你还可以使用普通值、类以及同步或异步工厂来定义提供者。有关示例，请参见 [Custom providers](/fundamentals/dependency-injection) 章节。

#### 可选提供者

有些依赖并非总是必需的。例如，一个类可能依赖于一个**配置对象**，但在未提供时回退到默认值。这样的依赖是可选的，它的缺失不应导致错误。

要将依赖标记为可选，请将 `@Optional()` 装饰器应用于构造函数参数：

```typescript
import { Injectable, Optional, Inject } from '@nestjs/common';

@Injectable()
export class HttpService<T> {
  constructor(@Optional() @Inject('HTTP_OPTIONS') private httpClient: T) {}
}

```

此示例注入了一个自定义提供者，因此它将 `HTTP_OPTIONS` 自定义**令牌**传递给 `@Inject()`。前面的示例使用了基于构造函数的注入，其中每个依赖都通过构造函数签名中的类来标识。有关自定义提供者及其令牌的更多信息，请参见 [Custom providers](/fundamentals/dependency-injection) 章节。

`@Optional()` 只影响提供者_缺失_时发生的情况：如果在 `HTTP_OPTIONS` 下没有注册任何内容，Nest 会注入 `undefined`，而不是在启动时失败。因此，该类负责回退处理，通常是将注入的值（如果有）合并到一组默认值之上。

#### 基于属性的注入

到目前为止的示例都使用基于构造函数的注入，其中提供者通过构造函数注入。在某些情况下，**基于属性的注入**更为方便。例如，如果一个基类依赖于一个或多个提供者，从每个子类通过 `super()` 向上传递它们会变得很繁琐。相反，你可以将 `@Inject()` 装饰器直接应用于属性：

```typescript
import { Injectable, Inject } from '@nestjs/common';

@Injectable()
export class HttpService<T> {
  @Inject('HTTP_OPTIONS')
  private readonly httpClient: T;
}

```

> warning **警告** 如果你的类没有继承另一个类，请优先使用**基于构造函数**的注入。构造函数明确说明了该类需要哪些依赖，这比用 `@Inject()` 注解的属性更易于理解代码。

#### 提供者注册

有了提供者（`CatsService`）和消费者（`CatsController`）之后，你需要将该服务注册到 Nest，以便它能够执行注入。为此，请将该服务添加到模块文件（`app.module.ts`）中 `@Module()` 装饰器的 `providers` 数组中：

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

现在 Nest 可以解析 `CatsController` 类的依赖了。

现在的目录结构如下所示：

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
<div class="item">cats.service.ts</div>
</div>
<div class="item">app.module.ts</div>
<div class="item">main.ts</div>
</div>
</div>

#### 手动实例化

到目前为止，Nest 一直自动解析依赖。在某些情况下，你可能需要跳出依赖注入系统，手动获取或实例化提供者。有两种技术可以应对这些情况：

- 要获取现有实例或动态实例化提供者，请使用 `ModuleRef`，在 [Module reference](/fundamentals/module-reference) 章节中有描述。
- 要在 `bootstrap()` 函数中获取提供者（例如，用于独立应用程序，或在引导过程中使用配置服务），请参阅 [Standalone applications](/standalone-applications)。