<!-- 此文件从 content/components.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T07:23:28.231Z -->
<!-- 源文件: content/components.md -->
<!-- 源哈希: eabd8ffca84d4d57fedc1db9b28b3b54 -->

### 提供者

提供者是 Nest 中的核心概念。许多基础的 Nest 类，如服务、仓储、工厂和辅助工具，都可以被视为提供者。提供者的关键思想在于它可以作为依赖被**注入**，从而使对象之间能够形成各种关系。这些对象的“装配”工作主要由 Nest 运行时系统负责。

<figure><img class="illustrative-image" src="/assets/Components_1.png" /></figure>

在上一章中，我们创建了一个简单的 `CatsController`。控制器应处理 HTTP 请求，并将更复杂的任务委托给**提供者**。提供者是在 NestJS 模块中声明为 `providers` 的普通 JavaScript 类。更多细节请参阅“模块”章节。

> info **提示** 由于 Nest 使您能够以面向对象的方式设计和组织依赖，我们强烈建议遵循 [SOLID principles](https://en.wikipedia.org/wiki/SOLID)。

#### 服务

让我们从创建一个简单的 `CatsService` 开始。该服务将处理数据存储和检索，并会被 `CatsController` 使用。由于它在管理应用程序逻辑方面的作用，它是被定义为提供者的理想候选者。

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

> info **提示** 要使用 CLI 创建服务，只需执行 `$ nest g service cats` 命令。

我们的 `CatsService` 是一个具有一个属性和两个方法的基本类。这里的关键新增是 `@Injectable()` 装饰器。该装饰器将元数据附加到类上，表明 `CatsService` 是一个可以由 Nest [IoC](https://en.wikipedia.org/wiki/Inversion_of_control) 容器管理的类。

此外，此示例使用了一个 `Cat` 接口，如下所示：

```typescript title="interfaces/cat.interface.ts"
export interface Cat {
  name: string;
  age: number;
  breed: string;
}

```

现在我们有了一个用于检索猫的服务类，让我们在 `CatsController` 中使用它：

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

`CatsService` 通过类构造函数**注入**。注意 `private` 关键字：它是 TypeScript 的简写，用于在同一行中声明并初始化 `catsService` 成员。下一节将介绍 Nest 如何处理该声明。

#### 依赖注入

Nest 是围绕强大的设计模式**依赖注入**构建的。我们强烈建议阅读官方 [Angular documentation](https://angular.dev/guide/di) 中关于此概念的优秀文章。

在 Nest 中，得益于 TypeScript 的能力，管理依赖变得简单直接，因为它们是基于类型解析的。在下面的示例中，Nest 将通过创建并返回 `CatsService` 的实例来解析 `catsService`（或者，在单例的情况下，如果其他地方已经请求过，则返回现有实例）。然后该依赖会被注入到控制器的构造函数中（或赋值给指定的属性）：

```typescript
constructor(private catsService: CatsService) {}

```

这一行发生了两件事。`private` 关键字是 TypeScript 的**参数属性**：它在类上声明一个 `catsService` 成员并将构造函数参数赋值给它，因此您无需自己编写 `this.catsService = catsService`。类型注解 `CatsService` 是 Nest 实际解析的依据——在编译时，TypeScript 会将构造函数的参数类型作为元数据发出，容器读取该元数据以确定要提供哪个提供者。

> warning **警告** 由于解析由发出的类型驱动，注解必须是运行时仍然存在的东西——即**类**。接口或类型别名在编译期间会被擦除，因此 `constructor(private config: AppConfig)` 其中 `AppConfig` 是接口时，Nest 将无法查找，启动时会看到 *“Nest 无法解析依赖”* 错误。当您需要注入非类的东西时，请为其提供令牌并使用 `@Inject()` 显式注入——参见 [Custom providers](/fundamentals/dependency-injection)。

#### 作用域

提供者通常具有与应用程序生命周期一致的生命周期（“作用域”）。当应用程序启动时，每个依赖都必须被解析，这意味着每个提供者都会被实例化。同样，当应用程序关闭时，所有提供者都会被销毁。然而，也可以使提供者成为**请求作用域**，这意味着其生命周期与特定请求绑定，而不是应用程序生命周期。您可以在 [Injection Scopes](/fundamentals/provider-scopes) 章节中了解更多相关技术。

<app-banner-courses></app-banner-courses>

#### 自定义提供者

Nest 自带内置的控制反转（“IoC”）容器，用于管理提供者之间的关系。该功能是依赖注入的基础，但实际上它比我们目前所介绍的强大得多。定义提供者有多种方式：您可以使用普通值、类以及异步或同步工厂。有关定义提供者的更多示例，请参阅 [Dependency Injection](/fundamentals/dependency-injection) 章节。

#### 可选提供者

有时，您可能有一些不总是需要解析的依赖。例如，您的类可能依赖于**配置对象**，但如果没有提供，则应使用默认值。在这种情况下，依赖被视为可选的，缺少配置提供者不应导致错误。

要将提供者标记为可选，请在构造函数的签名中使用 `@Optional()` 装饰器。

```typescript
import { Injectable, Optional, Inject } from '@nestjs/common';

@Injectable()
export class HttpService<T> {
  constructor(@Optional() @Inject('HTTP_OPTIONS') private httpClient: T) {}
}

```

在上面的示例中，我们使用了自定义提供者，这就是为什么我们包含 `HTTP_OPTIONS` 自定义**令牌**。之前的示例演示了基于构造函数的注入，其中依赖通过构造函数中的类来指示。有关自定义提供者及其关联令牌如何工作的更多详细信息，请参阅 [Custom Providers](/fundamentals/dependency-injection) 章节。

请注意，`@Optional()` 改变的是提供者*缺失*时发生的情况，而不是存在时您收到什么：如果 `HTTP_OPTIONS` 下没有注册任何内容，Nest 会注入 `undefined` 而不是启动失败。这意味着类负责回退——通常是通过将给定的内容与一组默认值合并，而不是假设值存在。

#### 基于属性的注入

到目前为止，我们使用的技术被称为基于构造函数的注入，即提供者通过构造函数方法进行注入。在某些特定情况下，**基于属性的注入**会非常有用。例如，如果您的顶层类依赖一个或多个提供者，将它们一路通过子类中的 `super()` 传递可能会变得很繁琐。为了避免这种情况，您可以在属性级别直接使用 `@Inject()` 装饰器。

```typescript
import { Injectable, Inject } from '@nestjs/common';

@Injectable()
export class HttpService<T> {
  @Inject('HTTP_OPTIONS')
  private readonly httpClient: T;
}

```

> warning **警告** 如果您的类没有继承其他类，通常最好使用**基于构造函数**的注入。构造函数明确指定了需要哪些依赖，与使用 `@Inject` 注解的类属性相比，提供了更好的可见性，使代码更易于理解。

#### 提供者注册

现在我们已经定义了一个提供者（`CatsService`）和一个消费者（`CatsController`），我们需要在 Nest 中注册该服务，以便它能够处理注入。这通过编辑模块文件（`app.module.ts`）并将服务添加到 `@Module()` 装饰器中的 `providers` 数组来完成。

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

现在 Nest 将能够解析 `CatsController` 类的依赖关系。

此时，我们的目录结构应该如下所示：

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

到目前为止，我们已经介绍了 Nest 如何自动处理依赖解析的大部分细节。然而，在某些情况下，您可能需要跳出内置的依赖注入系统，手动检索或实例化提供者。下面简要讨论两种此类技术。

- 要检索现有实例或动态实例化提供者，您可以使用 [Module reference](/fundamentals/module-reference)。
- 要在 `bootstrap()` 函数中获取提供者（例如，用于独立应用程序或在引导过程中使用配置服务），请查看 [Standalone applications](/standalone-applications)。