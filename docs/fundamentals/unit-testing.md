<!-- 此文件从 content/fundamentals/unit-testing.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:44:52.351Z -->
<!-- 源文件: content/fundamentals/unit-testing.md -->
<!-- 源哈希: 2eea20e4e75f2ee5003d2beb94066b9d -->

### 测试

自动化测试是任何严肃软件开发工作中的基本部分。自动化使得在开发过程中可以快速重复单个测试或测试套件变得容易，这有助于确保发布满足质量和性能目标。它提高了覆盖率，为开发人员提供了更快的反馈循环，并确保测试在开发生命周期的关键点运行，例如源代码控制签入、功能集成和版本发布。

这些测试涵盖了多种类型，包括单元测试、端到端 (e2e) 测试和集成测试。虽然好处是显而易见的，但设置它们可能很繁琐。Nest 提倡开发最佳实践，包括有效的测试，并包含以下功能来帮助开发人员和团队构建和自动化测试。Nest：

- 自动为组件搭建默认单元测试，为应用程序搭建 e2e 测试
- 提供默认工具（例如构建隔离的模块/应用程序加载器的测试运行器）
- 与 [Vitest](https://vitest.dev/) 和 [Supertest](https://github.com/visionmedia/supertest) 集成，同时对测试工具保持无关性
- 在测试环境中提供 Nest 的依赖注入系统，因此您无需额外设置即可模拟组件

您可以使用任何**测试框架**，因为 Nest 不强制使用任何特定工具。替换您需要的元素（例如测试运行器），您仍然可以受益于 Nest 现成的测试功能。

> info **提示** 新生成的项目默认使用 Vitest。Nest 暴露的测试 API 不依赖于特定的运行器，因此相同的模式也适用于其他工具。

#### 安装

要开始，请安装所需的包：

```bash
$ npm i --save-dev @nestjs/testing

```

#### 单元测试

下面的示例使用 [Vitest](https://vitest.dev/) 测试两个类 `CatsController` 和 `CatsService`。Vitest 作为测试运行器，还提供断言函数和用于模拟、间谍和存根的测试双（test-double）工具。此基本测试手动实例化类，并检查控制器和服务是否满足其 API 合同。

```typescript title="cats.controller.spec.ts"
import { vi } from 'vitest';
import { CatsController } from './cats.controller.js';
import { CatsService } from './cats.service.js';

describe('CatsController', () => {
  let catsController: CatsController;
  let catsService: CatsService;

  beforeEach(() => {
    catsService = new CatsService();
    catsController = new CatsController(catsService);
  });

  describe('findAll', () => {
    it('should return an array of cats', async () => {
      const result = ['test'];
      vi.spyOn(catsService, 'findAll').mockImplementation(() => result);

      expect(await catsController.findAll()).toBe(result);
    });
  });
});

```

> info **提示** 将测试文件保留在它们所测试的类附近。测试文件应具有 `.spec` 或 `.test` 后缀。

由于上述示例很简单，它没有测试任何特定于 Nest 的内容。它甚至没有使用依赖注入（它直接将 `CatsService` 的实例传递给 `catsController`）。这种手动实例化被测类的测试形式通常称为**隔离测试**，因为它独立于框架。接下来的部分介绍了更高级的功能，可帮助您测试更广泛使用 Nest 功能的应用程序。

#### 测试工具

`@nestjs/testing` 包提供了一套用于更健壮测试过程的工具。让我们使用内置的 `Test` 类重写前面的示例：

```typescript title="cats.controller.spec.ts"
import { vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { CatsController } from './cats.controller.js';
import { CatsService } from './cats.service.js';

describe('CatsController', () => {
  let catsController: CatsController;
  let catsService: CatsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
        controllers: [CatsController],
        providers: [CatsService],
      }).compile();

    catsService = moduleRef.get(CatsService);
    catsController = moduleRef.get(CatsController);
  });

  describe('findAll', () => {
    it('should return an array of cats', async () => {
      const result = ['test'];
      vi.spyOn(catsService, 'findAll').mockImplementation(() => result);

      expect(await catsController.findAll()).toBe(result);
    });
  });
});

```

`Test` 类提供了一个应用程序执行上下文，它本质上模拟了完整的 Nest 运行时，但为您提供了管理类实例的钩子，包括模拟和覆盖。其 `createTestingModule()` 方法接受一个模块元数据对象作为参数（您传递给 `@Module()` 装饰器相同的对象），并返回一个 `TestingModuleBuilder` 实例，该实例又提供了一些方法。对于单元测试，重要的一个是 `compile()`。它使用其依赖项引导一个模块（类似于使用 `NestFactory.create()` 在常规 `main.ts` 文件中引导应用程序的方式），并返回一个准备好进行测试的 `TestingModule`。

> info **提示** `compile()` 方法是**异步**的，因此您必须等待它。一旦模块被编译，您可以使用 `get()` 方法检索其声明的任何**静态**实例（控制器和提供者）。

`TestingModule` 暴露了与 [module reference](/fundamentals/module-reference) 类相同的实例解析 API，包括动态解析作用域提供者（瞬态或请求作用域）的能力。为此使用 `resolve()` 方法（`get()` 方法只能检索静态实例）。

```typescript
const moduleRef = await Test.createTestingModule({
  controllers: [CatsController],
  providers: [CatsService],
}).compile();

catsService = await moduleRef.resolve(CatsService);

```

> warning **警告** `resolve()` 方法从其自身的**DI 容器子树**返回提供者的唯一实例。每个子树都有一个唯一的上下文标识符。如果您调用此方法不止一次并比较实例引用，您会发现它们不相等。

> info **提示** 在 [module reference](/fundamentals/module-reference) 章了解有关其功能的更多信息。

您不必使用提供者的生产版本，而是可以使用 [custom provider](/fundamentals/dependency-injection) 在测试目的下覆盖它。例如，您可以模拟数据库服务，而不是连接到实时数据库。覆盖在 [end-to-end testing](/fundamentals/testing#端到端测试) 部分有介绍，但它们也适用于单元测试。

<app-banner-courses></app-banner-courses>

#### 自动模拟

Nest 还允许您定义一个模拟工厂，应用于所有缺失的依赖项。当一个类有大量依赖项，并且模拟所有依赖项需要花费大量时间和设置时，这非常有用。要使用此功能，请将 `useMocker()` 方法链式调用到 `createTestingModule()` 上，并传入一个用于依赖项模拟的工厂。该工厂接收一个可选的令牌（任何对 Nest 提供者有效的令牌），并返回一个模拟实现。下面的示例使用 `vi.fn()` 为 `CatsService` 创建了一个特定的模拟。

```typescript
import { vi } from 'vitest';

describe('CatsController', () => {
  let controller: CatsController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CatsController],
    })
      .useMocker((token) => {
        const results = ['test1', 'test2'];
        if (token === CatsService) {
          return { findAll: vi.fn().mockResolvedValue(results) };
        }
      })
      .compile();

    controller = moduleRef.get(CatsController);
  });
});

```

您可以像获取自定义提供者一样从测试容器中检索这些模拟，例如 `moduleRef.get(CatsService)`。

> info **提示** 当您希望在套件之间共享测试双时，也可以将可重用的模拟工厂助手直接传递给 `useMocker()`。

> info **提示** `REQUEST` 和 `INQUIRER` 提供者不能被自动模拟，因为它们已在上下文中预定义。但是，您可以使用自定义提供者语法或 `overrideProvider()` 方法**覆盖**它们。

#### 端到端测试

与关注单个模块和类的单元测试不同，端到端 (e2e) 测试涵盖了类和模块在更聚合层面的交互，更接近最终用户与生产系统交互的方式。随着应用程序的增长，手动测试每个 API 端点的端到端行为变得困难。自动化端到端测试有助于确保系统的整体行为是正确的，并满足项目要求。e2e 测试使用与**单元测试**中介绍的类似配置。此外，Nest 使使用 [Supertest](https://github.com/visionmedia/supertest) 库来模拟 HTTP 请求变得简单。

```typescript title="cats.e2e-spec.ts"
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { CatsModule } from '../../src/cats/cats.module.js';
import { CatsService } from '../../src/cats/cats.service.js';
import { INestApplication } from '@nestjs/common';

describe('Cats', () => {
  let app: INestApplication;
  let catsService = { findAll: () => ['test'] };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CatsModule],
    })
      .overrideProvider(CatsService)
      .useValue(catsService)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  it(`/GET cats`, () => {
    return request(app.getHttpServer())
      .get('/cats')
      .expect(200)
      .expect({
        data: catsService.findAll(),
      });
  });

  afterAll(async () => {
    await app.close();
  });
});

```

> info **提示** 如果您的应用程序运行在 [Node adapter](/techniques/performance#node-adapter) 上，也请将 `NodeAdapter` 实例传递给 `createNestApplication()`。如果没有适配器，测试模块会创建一个 Express 应用程序，因此测试不会在您的应用程序使用的适配器上运行，并且如果未安装 `@nestjs/platform-express` 包则会失败：
>
> ```ts
> app = moduleRef.createNestApplication<NestNodeApplication>(new NodeAdapter());
> ```

>
> Node 适配器具有与下面所示的 Fastify 适配器相同的 `app.inject()` 方法，因此测试可以在没有监听服务器的情况下发送请求。

> info **提示** 如果您使用 [Fastify](/techniques/performance#fastify-adapter) 作为 HTTP 适配器，它需要略微不同的配置，并且具有内置的测试功能：
>
> ```ts
> let app: NestFastifyApplication;
>
> beforeAll(async () => {
>   app = moduleRef.createNestApplication<NestFastifyApplication>(
>     new FastifyAdapter(),
>   );
>
>   await app.init();
>   await app.getHttpAdapter().getInstance().ready();
> });
>
> it(`/GET cats`, () => {
>   return app
>     .inject({
>       method: 'GET',
>       url: '/cats',
>     })
>     .then((result) => {
>       expect(result.statusCode).toEqual(200);
>       expect(result.payload).toEqual(/* expectedPayload */);
>     });
> });
>
> afterAll(async () => {
>   await app.close();
> });
> ```

此示例建立在前面描述的概念之上。除了 `compile()` 方法外，它还使用 `createNestApplication()` 方法来实例化完整的 Nest 运行时环境。

一个注意事项：当您的应用程序使用 `compile()` 方法编译时，`HttpAdapterHost#httpAdapter` 仍然是未定义的，因为在编译阶段没有创建任何 HTTP 适配器或服务器。如果您的测试需要 `httpAdapter`，请使用 `createNestApplication()` 方法创建应用程序实例，或者重构您的项目以避免在依赖图初始化期间存在此依赖。

我们来分解这个示例。

该测试将运行的应用程序引用保存在 `app` 变量中，以便使用它来模拟 HTTP 请求。

使用 Supertest 中的 `request()` 函数来模拟 HTTP 请求。为了将这些请求路由到正在运行的 Nest 应用程序，测试将 Nest 底层 HTTP 监听器（该监听器可能由 Express 平台提供）的引用传递给 `request()`。因此构造为 `request(app.getHttpServer())`。对 `request()` 的调用返回一个连接到 Nest 应用程序的包装 HTTP 服务器，该服务器暴露了模拟实际 HTTP 请求的方法。例如，`request(...).get('/cats')` 发起一个请求到 Nest 应用程序，该请求与通过网络传入的**实际** `GET /cats` HTTP 请求完全相同。

该示例还提供了一个 `CatsService` 的替代（测试双）实现，该实现返回一个硬编码的值供测试检查。使用 `overrideProvider()` 来提供此类替代实现。类似地，Nest 提供了 `overrideModule()`、`overrideGuard()`、`overrideInterceptor()`、`overrideFilter()` 和 `overridePipe()` 方法，分别用于覆盖模块、守卫、拦截器、过滤器和管道。

每个覆盖方法（除 `overrideModule()` 外）都返回一个包含三个方法的对象，这些方法镜像了对 [custom providers](/fundamentals/dependency-injection) 所描述的方法：

- `useClass`：您提供一个类，该类被实例化以提供覆盖对象的实例（提供者、守卫等）。
- `useValue`：您提供一个覆盖对象的实例。
- `useFactory`：您提供一个具有 `factory` 函数的对象，该函数返回一个覆盖对象的实例，以及一个可选的 `inject` 数组，其中列出了传递给该函数的提供者。

另一方面，`overrideModule()` 返回一个包含 `useModule()` 方法的对象，您使用此方法提供一个覆盖原始模块的模块：

```typescript
const moduleRef = await Test.createTestingModule({
  imports: [AppModule],
})
  .overrideModule(CatsModule)
  .useModule(AlternateCatsModule)
  .compile();

```

模块是按**引用**匹配的，因此在覆盖 [dynamic module](/fundamentals/dynamic-modules) 时，请将代表应用程序中注册的动态模块的相同对象传递给 `overrideModule()`。再次调用模块的工厂方法会产生一个不同的对象，覆盖将静默地没有效果：

```typescript
export const dynamicCatsModule = CatsModule.register({ folder: './cats' });

@Module({
  imports: [dynamicCatsModule],
})
export class AppModule {}

```

```typescript
const moduleRef = await Test.createTestingModule({
  imports: [AppModule],
})
  .overrideModule(dynamicCatsModule)
  .useModule(AlternateCatsModule)
  .compile();

```

这些方法中的每一个都会返回 `TestingModuleBuilder` 实例，因此您可以使用 [fluent style](https://en.wikipedia.org/wiki/Fluent_interface) 中的其他方法将它们链接起来。在链的末尾调用 `compile()` 以使 Nest 实例化和初始化模块。

当测试运行时，您可能希望提供一个自定义日志记录器（例如，在 CI 服务器上）。使用 `setLogger()` 方法并传递一个满足 `LoggerService` 接口的对象，以告知 `TestingModuleBuilder` 在测试期间如何记录（默认情况下，只有“error”日志会写入控制台）。要断言已记录的内容，请使用 [`CapturingLogger`](/fundamentals/testing#asserting-on-logs)。

编译后的模块具有几个有用的方法，如下表所述：

<table>
  <tr>
    <td>
      <code>createNestApplication()</code>
    </td>
    <td>
      根据给定的模块创建并返回一个 Nest 应用程序（<code>INestApplication</code> 实例）。
      请注意，您必须使用 <code>init()</code> 方法手动初始化应用程序。
    </td>
  </tr>
  <tr>
    <td>
      <code>createNestMicroservice()</code>
    </td>
    <td>
      根据给定的模块创建并返回一个 Nest 微服务（<code>INestMicroservice</code> 实例）。
    </td>
  </tr>
  <tr>
    <td>
      <code>get()</code>
    </td>
    <td>
      检索应用程序上下文中可用的控制器或提供者（包括守卫、过滤器等）的静态实例。工作方式与 <a href="/fundamentals/module-reference">module 引用</a> 类上的相同方法相同。
    </td>
  </tr>
  <tr>
     <td>
      <code>resolve()</code>
    </td>
    <td>
      检索应用程序上下文中可用的控制器或提供者（包括守卫、过滤器等）的动态创建的作用域实例（请求或瞬态）。工作方式与 <a href="/fundamentals/module-reference">module 引用</a> 类上的相同方法相同。
    </td>
  </tr>
  <tr>
    <td>
      <code>select()</code>
    </td>
    <td>
      遍历模块的依赖图；可用于从选定的模块检索特定实例（与 <code>get()</code> 方法中的严格模式（<code>strict: true</code>）一起使用）。
    </td>
  </tr>
</table>

> info **提示** 将您的 e2e 测试文件保留在 `test` 目录中。测试文件应具有 `.e2e-spec` 后缀。

#### 断言日志

要检查代码记录了什么，请将一个 `CapturingLogger`（从 `@nestjs/testing` 导出）传递给 `setLogger()`。它会记录来自框架和每个 `Logger` 实例的每次日志调用，作为结构化数据而不是打印出来：

```typescript
import { CapturingLogger, Test } from '@nestjs/testing';

const logger = new CapturingLogger();
const moduleRef = await Test.createTestingModule({
  providers: [PaymentsService],
})
  .setLogger(logger)
  .compile();

await moduleRef.get(PaymentsService).charge(order);

logger.assertLogged({ level: 'warn', context: 'PaymentsService', message: /retrying/ });
logger.assertNotLogged({ level: 'error' });

```

`assertLogged()` 返回第一个匹配的条目，而 `assertNotLogged()` 如果有任何条目匹配则抛出。两者都抛出一个简单的 `Error`，其中列出了条目（捕获的条目用于 `assertLogged()`，匹配的条目用于 `assertNotLogged()`），因此它们可与任何测试运行器配合使用。要自行查询条目，请使用 `entries`、`find()` 和 `filter()`，并调用 `clear()` 在测试之间重置记录器。

匹配器要么是一个谓词函数，要么是一个其所有标准都必须匹配的对象：

- `level`：日志级别。
- `context`：一个字符串与上下文完全匹配，并测试一个 `RegExp`。
- `message`：当消息包含该字符串时匹配，并测试一个 `RegExp`。只有字符串消息才匹配（以消息记录的 `Error` 计数，通过其消息）。
- `params`：当每个列出的键都与传递给记录器的对象中的键深度相等时匹配。

每个条目都有 `level`、`message`、`context`、`params`、调用中传递的 `error`（如果有）、`stack` 和原始 `args`。

记录器会捕获所有级别的日志，无论 `NEST_LOG_LEVEL` 环境变量如何。要捕获更少的日志，请设置 `logLevels` 选项。要在调试测试时同时打印日志，请传递 `print: true`；其他 `ConsoleLogger` 选项（如 `json`）则应用于输出。

> info **提示** 您也可以使用 `app.useLogger(logger)` 安装记录器。在这种情况下，调用之前写入的日志（例如，由 `InstanceLoader` 在 `compile()` 期间写入的）不会被捕获。

#### 覆盖全局注册的增强器

如果您有一个全局注册的 守卫（或 管道、拦截器或过滤器），您需要执行更多步骤来覆盖该增强器。回顾一下，原始注册如下所示：

```typescript
providers: [
  {
    provide: APP_GUARD,
    useClass: JwtAuthGuard,
  },
],

```

这通过 `APP_*` 令牌将守卫注册为“多重”提供者。为了在此处替换 `JwtAuthGuard`，注册需要在此槽位中使用现有提供者：

```typescript
providers: [
  {
    provide: APP_GUARD,
    useExisting: JwtAuthGuard,
    // ^^^^^^^^ notice the use of 'useExisting' instead of 'useClass'
  },
  JwtAuthGuard,
],

```

> info **提示** 将 `useClass` 更改为 `useExisting`，以引用已注册的提供者，而不是让 Nest 在令牌后实例化它。

`JwtAuthGuard` 现在对 Nest 可见，作为一个常规提供者，在创建 `TestingModule` 时可以被覆盖：

```typescript
const moduleRef = await Test.createTestingModule({
  imports: [AppModule],
})
  .overrideProvider(JwtAuthGuard)
  .useClass(MockAuthGuard)
  .compile();

```

现在所有测试在每个请求上都使用 `MockAuthGuard`。

#### 测试请求作用域的实例

[Request-scoped](/fundamentals/provider-scopes) 提供者为每个传入的 **请求** 唯一创建，并且在请求处理完成后实例会被垃圾回收。这造成了一个问题，因为您无法访问专门为被测试请求生成的依赖注入子树。

如上文所述，`resolve()` 方法检索一个动态实例化的类。此外，如 [resolving scoped providers](/fundamentals/module-reference#解析作用域提供者) 所述，您可以传递一个唯一的上下文标识符来控制 DI 容器子树的生命周期。您可以在测试上下文中将两者结合起来。

策略是预先生成一个上下文标识符，并强制 Nest 使用此特定 ID 为所有传入请求创建子树。这样，您就可以检索为被测试请求创建的实例。

为此，请在 `ContextIdFactory` 上使用 `vi.spyOn()`：

```typescript
const contextId = ContextIdFactory.create();
vi
  .spyOn(ContextIdFactory, 'getByRequest')
  .mockImplementation(() => contextId);

```

您现在可以使用 `contextId` 访问任何后续请求的单个生成的 DI 容器子树。

```typescript
catsService = await moduleRef.resolve(CatsService, contextId);

```