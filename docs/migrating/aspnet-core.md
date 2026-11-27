<!-- 此文件从 content/migrating/aspnet-core.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:35:07.812Z -->
<!-- 源文件: content/migrating/aspnet-core.md -->
<!-- 源哈希: 3b7df75edc44611f18edabbebfe81adb -->

### 来自 ASP.NET Core

Nest 基于 ASP.NET Core 开发者已熟悉的概念构建：带有生命周期的依赖注入容器、构造函数注入、属性路由的控制器、由中间件和过滤器组成的请求管道以及类型化选项。验证、认证、授权、配置、后台任务、健康检查和 OpenAPI 来自第一方包。变化在于语言 TypeScript 和运行时 Node.js。

本页面将 ASP.NET Core 概念映射到其 Nest 等效项，并提供简短的代码并排展示。它以 [what's different](/migrating/aspnet-core#whats-different) 结束，这比语法更重要。

#### 概览

| ASP.NET Core | Nest | 阅读更多 |
| --- | --- | --- |
| `Program.cs`, `WebApplication.CreateBuilder()` | `main.ts`, `NestFactory.create()` | [First steps](/first-steps) |
| `builder.Services.AddScoped<T>()` 和其他注册项 | 模块中列出的 `@Injectable()` 类，位于模块的 `providers` 中 | [Providers](/overview/providers) |
| 服务生命周期：单例、作用域、瞬态 | 注入作用域：`DEFAULT`, `REQUEST`, `TRANSIENT` | [Injection scopes](/fundamentals/provider-scopes) |
| 来自库的 `AddXyz()` 扩展方法 | 动态模块，例如 `ConfigModule.forRoot()` | [Dynamic modules](/fundamentals/dynamic-modules) |
| `[ApiController]`, `[Route]`, `[HttpGet]`, `[FromBody]` | `@Controller()`, `@Get()`, `@Body()` | [Controllers](/overview/controllers) |
| 最小 API | 包含 `nest new --minimal` 的单文件项目 | [One-file projects](/cli/usages#one-file-projects) |
| 模型绑定和验证、数据注解、FluentValidation | 管道，使用 class-validator DTO 或像 Zod 这样的标准模式 | [Validation](/techniques/validation) |
| 中间件 (`app.Use()`) | 中间件 | [Middleware](/overview/middlewares) |
| 授权过滤器、`[Authorize]` | 守卫 | [Guards](/overview/guards) |
| 操作过滤器、结果过滤器、端点过滤器 | 拦截器 | [Interceptors](/overview/interceptors) |
| 异常过滤器、`UseExceptionHandler()`, `IExceptionHandler` | 异常过滤器 | [Exception filters](/overview/exception-filters) |
| 认证处理程序、ASP.NET Core Identity | `@nestjs/authentication` | [Authentication](/security/authentication) |
| 授权策略、`IAuthorizationService` | `@nestjs/authorization` | [Authorization](/security/authorization) |
| `appsettings.json`, `IConfiguration`, `IOptions<T>` | `@nestjs/config` | [Configuration](/application/configuration) |
| Entity Framework Core | `@nestjs/typeorm`, `@nestjs/drizzle` 和其他 ORM | [Data](/data/overview) |
| `IHostedService`, `BackgroundService` | 生命周期钩子，`@nestjs/schedule` 和 `@nestjs/bullmq` | [Task scheduling](/techniques/task-scheduling), [Queues](/techniques/queues) |
| `IHttpClientFactory`, 类型化客户端 | `@nestjs/http-client` | [HTTP client](/application/http-client) |
| Polly | `@nestjs/resilience` | [Resilience](/reliability/resilience) |
| 健康检查 (`AddHealthChecks()`, `MapHealthChecks()`) | `@nestjs/terminus` | [Health checks](/recipes/terminus) |
| Swashbuckle, NSwag, `Microsoft.AspNetCore.OpenApi` | `@nestjs/swagger` | [OpenAPI](/openapi/introduction) |
| `ILogger<T>` | 来自 `@nestjs/common` 的 `Logger` | [Logger](/application/logger) |
| `WebApplicationFactory<T>`, xUnit | `@nestjs/testing`, Supertest 和 Vitest | [Testing](/fundamentals/unit-testing) |
| SignalR | 网关，使用 Socket.IO 或 `ws` | [Gateways](/websockets/gateways) |
| gRPC 服务, MassTransit | `@nestjs/microservices` | [Microservices](/microservices/basics) |

#### 启动项目

`dotnet new webapi` 生成一个包含 `Program.cs` 的项目。Nest CLI 也是如此：

```bash
$ npm i -g @nestjs/cli
$ nest new orders-api

```

在 ASP.NET Core 中，`Program.cs` 注册服务并构建管道：

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();
builder.Services.AddScoped<IOrdersService, OrdersService>();

var app = builder.Build();
app.MapControllers();
app.Run();

```

在 Nest 中，服务在 **模块** 中注册，并且 `main.ts` 从根模块创建应用程序：

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

`npm run start:dev` 启动应用程序并在文件更改时重启，就像 `dotnet watch` 一样。`nest generate`（或 `nest g`）添加一个包含测试文件的模块、控制器或服务，而 `nest g resource orders` 生成整个 CRUD 切片。参见 [CLI usages](/cli/usages)。

#### 注册服务

ASP.NET Core 在 `builder.Services` 上注册服务。Nest 在模块中注册 **提供者**。提供者是使用 `@Injectable()` 装饰器的类，它通过构造函数接收其依赖项，就像 ASP.NET Core 中一样：

```csharp
// OrdersService.cs
public class OrdersService : IOrdersService
{
    private readonly OrdersRepository _ordersRepository;

    public OrdersService(OrdersRepository ordersRepository)
    {
        _ordersRepository = ordersRepository;
    }
}

```

```typescript title="orders/orders.service.ts"
import { Injectable } from '@nestjs/common';
import { OrdersRepository } from './orders.repository.js';

@Injectable()
export class OrdersService {
  constructor(private readonly ordersRepository: OrdersRepository) {}
}

```

构造函数中的 `private readonly` 一步完成声明和字段赋值，类似于 C# 的主构造函数。

```typescript title="orders/orders.module.ts"
import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller.js';
import { OrdersRepository } from './orders.repository.js';
import { OrdersService } from './orders.service.js';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository],
  exports: [OrdersService],
})
export class OrdersModule {}

```

ASP.NET Core 对整个应用程序有一个服务集合。Nest 模块也是一个边界：除非模块在 `exports` 中列出它，并且另一个模块将其添加到其 `imports` 中，否则提供者只能在其自己的模块内部可见。一个特性的模块是 ASP.NET Core 项目会放置 `AddOrders()` 扩展方法的场所，但未导出的内容保持私有。参见 [Modules](/modules)。

当无法解析依赖项时，应用程序在启动时以一个包含类名、缺失依赖项和模块的错误失败。

##### 接口和键值服务

`AddScoped<IOrdersService, OrdersService>()` 为接口注册一个类。TypeScript 接口在编译时被擦除，因此 Nest 在运行时看不到它们。请改用 **抽象类** 作为契约。它在运行时存在，因此可作为注入令牌工作：

```typescript title="payments/payment-gateway.ts"
export abstract class PaymentGateway {
  abstract charge(orderId: string, amountInCents: number): Promise<void>;
}

```

```typescript title="payments/payments.module.ts"
import { Module } from '@nestjs/common';
import { PaymentGateway } from './payment-gateway.js';
import { StripePaymentGateway } from './stripe-payment-gateway.js';

@Module({
  providers: [{ provide: PaymentGateway, useClass: StripePaymentGateway }],
  exports: [PaymentGateway],
})
export class PaymentsModule {}

```

需要它的类在其构造函数中声明 `private readonly paymentGateway: PaymentGateway`。使用 `AddKeyedSingleton()` 注册和使用 `[FromKeyedServices]` 注入的键值服务，会成为使用 `@Inject()` 注入的字符串或 `Symbol` 令牌。参见 [Interfaces and abstract classes](/fundamentals/dependency-injection#interfaces-and-abstract-classes)。

##### 工厂

一个构建实例本身的注册，例如 `AddSingleton(sp => new S3Client(...))`，成为一个 **工厂提供者**。`inject` 按顺序列出传递给工厂的提供者：

```typescript title="storage/storage.module.ts"
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';

@Module({
  providers: [
    {
      provide: S3Client,
      useFactory: (config: ConfigService) =>
        new S3Client({ region: config.getOrThrow<string>('AWS_REGION') }),
      inject: [ConfigService],
    },
  ],
  exports: [S3Client],
})
export class StorageModule {}

```

工厂可以是 `async`，Nest 会等待它之后才会创建依赖于它的提供者。参见 [Factory providers](/fundamentals/dependency-injection#工厂提供者usefactory)。

ASP.NET Core 使用 `AddXyz()` 扩展方法注册的库，在 Nest 中作为 **动态模块** 交付，并在模块中导入和配置：`ConfigModule.forRoot()`, `TypeOrmModule.forRootAsync()`, `ScheduleModule.forRoot()`。

#### 生命周期

| ASP.NET Core | Nest |
| --- | --- |
| `AddSingleton()` | `Scope.DEFAULT`，这是默认的 |
| `AddScoped()` | `Scope.REQUEST` |
| `AddTransient()` | `Scope.TRANSIENT`：为注入它的每个类创建一个新实例 |

在 ASP.NET Core 中，您为每个服务选择一个生命周期，其中作用域是常见的，因为 `DbContext` 是作用域的。在 Nest 中，提供者是 **单例**，除非另有声明，这是几乎所有情况下的正确选择。 ORM 客户端是持有连接池的单例，因此没有请求级别的上下文需要作用域。

请求作用域的提供者也表现不同。ASP.NET Core 的作用域验证（在开发环境中默认开启）会拒绝将作用域服务注入到单例中（一个被捕获的依赖项）。Nest 不会这样做，而是将单例也设置为请求作用域，以及直到控制器之前的所有内容，并为每个请求重新创建整个链。当提供者需要当前请求中的某些内容（例如用户或租户）时，应从 `AsyncLocalStorage` 存储中读取，而不是将其设置为请求作用域。`AsyncLocalStorage` 流经 `await`，就像 .NET 中的 `AsyncLocal<T>` 一样，并充当 `IHttpContextAccessor` 的角色。参见 [Async local storage](/recipes/async-local-storage)。

#### 控制器

一个 ASP.NET Core 控制器：

```csharp
// OrdersController.cs
[ApiController]
[Route("orders")]
public class OrdersController : ControllerBase
{
    private readonly IOrdersService _ordersService;

    public OrdersController(IOrdersService ordersService)
    {
        _ordersService = ordersService;
    }

    [HttpGet]
    public Task<List<Order>> FindAll([FromQuery] int page = 0) => _ordersService.FindAllAsync(page);

    [HttpGet("{id}")]
    public async Task<ActionResult<Order>> FindOne(string id)
    {
        var order = await _ordersService.FindOneAsync(id);
        return order is null ? NotFound() : order;
    }

    [HttpPost]
    public async Task<ActionResult<Order>> Create(CreateOrderRequest request)
    {
        var order = await _ordersService.CreateAsync(request);
        return CreatedAtAction(nameof(FindOne), new { id = order.Id }, order);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Remove(string id)
    {
        await _ordersService.RemoveAsync(id);
        return NoContent();
    }
}

```

Nest 中的相同控制器：

```typescript title="orders/orders.controller.ts"
import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { CreateOrderDto } from './create-order.dto.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll(@Query('page', new ParseIntPipe({ optional: true })) page = 0) {
    return this.ordersService.findAll(page);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const order = await this.ordersService.findOne(id);
    if (!order) {
      throw new NotFoundException();
    }
    return order;
  }

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.ordersService.remove(id);
  }
}

```

区别：

- 路由参数使用 `:id` 编写，而 ASP.NET Core 在名称周围使用花括号包裹。
- 每个参数说明其来源，使用 `@Body()`、`@Query()`、`@Param()` 或 `@Headers()`，与 `[FromBody]` 和 `[FromQuery]` 类似。没有绑定源约定。
- 默认情况下，一个 `POST` 处理程序响应 `201 Created`，而其他所有方法响应 `200 OK`。`@HttpCode()` 可以更改此行为。没有 `CreatedAtAction()`：如果需要，请使用带有 `@Header()` 的 `Location` 头部。
- 没有 `ActionResult<T>`。返回主体，对于错误状态抛出异常，例如 `throw new NotFoundException()`。参见 [Built-in HTTP exceptions](/overview/exception-filters#内置-http-异常)。
- 处理程序返回一个 `Promise`，它是 `Task` 的对应物，Nest 将结果作为 JSON 序列化，使用 camelCase 属性名称，因为这些名称是您 TypeScript 代码中的名称。

控制器列在其 模块的 `controllers` 中，取代了 `AddControllers()` 和 `MapControllers()`。

##### 最小化 API

Nest 没有像 `app.MapGet()` 那样的基于 lambda 的路由注册。最小的 Nest 应用程序仍然是一个控制器和一个模块，`nest new orders-api --minimal` 在单个文件中生成一个，`src/main.ts`。随着您添加模块，它会发展成标准布局。参见 [One-file projects](/cli/usages#one-file-projects)。

#### 验证

使用 `[ApiController]`，无效的模型在操作运行之前响应 `400`。规则是请求类型的数据注解：

```csharp
// CreateOrderRequest.cs
public record CreateOrderRequest(
    [Required] string CustomerId,
    [Required, MinLength(1)] List<OrderItem> Items,
    [MaxLength(500)] string? Note);

```

Nest 使用 **管道** 进行验证。最接近的匹配是使用带有 [class-validator](https://github.com/typestack/class-validator) 装饰器的 DTO 类的 `ValidationPipe`：

```typescript title="orders/create-order.dto.ts"
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { OrderItemDto } from './order-item.dto.js';

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  customerId: string;

  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @IsOptional()
  @MaxLength(500)
  note?: string;
}

```

为整个应用程序绑定管道一次，这为您提供了每个操作所拥有的 `[ApiController]`：

```typescript title="main.ts"
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

```

`whitelist` 会丢弃 DTO 未声明的属性，而 `transform` 会将主体转换为 DTO 类的实例。

如果使用 FluentValidation 进行验证，规则存在于代码中而不是属性上，最接近的匹配是像 Zod 这样的 [Standard Schema](https://standardschema.dev/) 库，其中参数的类型是从模式推断出来的。全局绑定 `StandardSchemaValidationPipe`，并使用 `@Body()` 的 `schema` 选项传递模式：

```typescript title="orders/create-order.schema.ts"
import { z } from 'zod';

export const createOrderSchema = z.object({
  customerId: z.string().min(1),
  items: z.array(z.object({ productId: z.string(), quantity: z.int().positive() })).min(1),
  note: z.string().max(500).optional(),
});

export type CreateOrderDto = z.infer<typeof createOrderSchema>;

```

```typescript title="orders/orders.controller.ts"
@Post()
create(@Body({ schema: createOrderSchema }) dto: CreateOrderDto) {
  return this.ordersService.create(dto);
}

```

> 警告 **警告** TypeScript 类型在运行时不存在，因此仅有类型注解无法验证任何内容。如果没有验证管道，`@Body() dto: CreateOrderDto` 将接收客户端发送的任何 JSON。像上面那样全局绑定一个管道。

两个管道都会用一个 `400 Bad Request` 来响应无效主体，其主体列出失败的规则作为 `message`，而不是用 `ValidationProblemDetails`。要用问题详情响应，请编写一个异常过滤器，如下所示。参见 [Validation](/techniques/validation)。

#### 请求管道

ASP.NET Core 有中间件，对于 MVC 有五种类型的过滤器。Nest 有中间件和围绕路由处理程序的四种组件，并按此顺序运行它们：

| Nest | 运行时间 | ASP.NET Core 对应物 |
| --- | --- | --- |
| [Middleware](/overview/middlewares) | 路由之前，使用原始请求和响应 | 注册在 `app.Use()` 中的中间件 |
| [Guards](/overview/guards) | 路由之后，决定是否运行处理程序 | 授权过滤器，`[Authorize]` |
| [Interceptors](/overview/interceptors) | 围绕处理程序，可访问其结果 | 操作过滤器、结果过滤器、端点过滤器 |
| [Pipes](/pipes) | 在每个参数上，处理程序之前 | 模型绑定和验证 |
| [Exception filters](/overview/exception-filters) | 任何上层抛出异常时 | 异常过滤器，`IExceptionHandler` |

像过滤器一样，守卫、拦截器、管道和异常过滤器可以绑定到处理程序、控制器或整个应用程序，使用 `@UseGuards()`、`@UseInterceptors()`、`@UsePipes()` 和 `@UseFilters()`，或者作为 `APP_GUARD`、`APP_INTERCEPTOR`、`APP_PIPE` 和 `APP_FILTER` 提供者。有关完整顺序，请参阅 [Request lifecycle](/faq/request-lifecycle)。

一个记录每个请求耗时的拦截器，对应于一个 `IAsyncActionFilter`：

```typescript title="common/timing.interceptor.ts"
import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class TimingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TimingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const started = performance.now();
    const handler = `${context.getClass().name}.${context.getHandler().name}`;
    return next
      .handle()
      .pipe(tap(() => this.logger.log(`${handler} took ${Math.round(performance.now() - started)} ms`)));
  }
}

```

`next.handle()` 扮演 `await next()` 的角色。它返回处理程序结果的 RxJS `Observable`，拦截器可以在其到达客户端之前对其进行转换。参见 [Interceptors](/overview/interceptors)。

##### 异常过滤器和问题详情

一个将领域异常转换为问题详情的 `IExceptionHandler`：

```csharp
// OrderNotFoundHandler.cs
public class OrderNotFoundHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken ct)
    {
        if (exception is not OrderNotFoundException) return false;
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        await context.Response.WriteAsJsonAsync(
            new ProblemDetails { Status = 404, Title = "Not Found", Detail = exception.Message }, ct);
        return true;
    }
}

```

在 Nest 中，这是一个 **异常过滤器**。`@Catch()` 指定它处理的异常类，因此无需编写类型检查：

```typescript title="common/order-not-found.filter.ts"
import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { OrderNotFoundError } from '../orders/order-not-found.error.js';

@Catch(OrderNotFoundError)
export class OrderNotFoundFilter implements ExceptionFilter {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: OrderNotFoundError, host: ArgumentsHost) {
    const { httpAdapter } = this.httpAdapterHost;
    const response = host.switchToHttp().getResponse();
    httpAdapter.setHeader(response, 'Content-Type', 'application/problem+json');
    httpAdapter.reply(
      response,
      { type: 'about:blank', title: 'Not Found', status: 404, detail: exception.message },
      404,
    );
  }
}

```

将其作为根模块中的 `APP_FILTER` 提供者注册到整个应用程序，这允许它注入其他提供者：

```typescript title="app.module.ts"
providers: [{ provide: APP_FILTER, useClass: OrderNotFoundFilter }],

```

`HttpException` 及其子类，如 `NotFoundException` 和 `ConflictException`，是 Nest 会自行转换为带有状态的响应的异常。任何其他异常都成为一个 `500`。参见 [Exception filters](/overview/exception-filters)。

#### 认证和授权

使用 `@nestjs/authentication`，从模块注册的那一刻起，每个路由都需要一个已登录的用户，类似于需要已认证用户的回退策略。一个凭证提供者（认证处理程序的对应物）读取会话 Cookie、Bearer 令牌或 API 密钥并加载用户。`@Public()` 打开一个路由，如 `[AllowAnonymous]`，并且 `@CurrentUser()` 注入用户，而控制器会读取 `User`：

```csharp
// MeController.cs
[ApiController]
[Authorize]
[Route("me")]
public class MeController : ControllerBase
{
    [HttpGet]
    public IActionResult Me() => Ok(new { Id = User.FindFirstValue(ClaimTypes.NameIdentifier) });
}

```

```typescript title="users/me.controller.ts"
import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import type { User } from './user.js';

@Controller('me')
export class MeController {
  @Get()
  me(@CurrentUser() user: User) {
    return user;
  }
}

```

用户是您自己的对象，由您的代码加载，而不是一个 `ClaimsPrincipal`。该包还涵盖了 ASP.NET Core Identity 及其端点的许多功能：使用哈希密码的注册和登录、服务器端会话、电子邮件验证和密码重置链接、TOTP 双因素认证、OpenID Connect 登录、访问和刷新令牌以及 API 密钥。它通过您写入文档化接口的存储在数据库中保持状态，而不是通过 Entity Framework 模式。参见 [Authentication](/security/authentication)。

`@nestjs/authorization` 用 **策略** 替换了授权策略和要求处理程序：类的方法决定用户是否可以执行某项操作，并根据使用它们的路由进行类型检查。其守卫默认拒绝，因此未声明任何检查的路由是关闭的：

```csharp
// ProductsController.cs
[HttpPost]
[Authorize(Policy = "Staff")]
public Task<Product> Create(CreateProductRequest request) => _productsService.CreateAsync(request);

```

```typescript title="products/product.policy.ts"
import { Policy } from '@nestjs/authorization';
import type { User } from '../users/user.js';

@Policy()
export class ProductPolicy {
  create(user: User | null) {
    return !!user?.roles.includes('staff');
  }
}

```

```typescript title="products/products.controller.ts"
@Post()
@Can(ProductPolicy, 'create')
create(@Body() dto: CreateProductDto) {
  return this.productsService.create(dto);
}

```

基于资源的授权，ASP.NET Core 使用 `IAuthorizationService.AuthorizeAsync(User, resource, policy)` 实现，也是相同的方式：注入 `AuthorizationService` 并使用策略、能力、用户和记录调用 `authorize()`。参见 [Authorization](/security/authorization)。

#### 配置和选项

ASP.NET Core 读取 `appsettings.json`，一个每个环境的文件，例如 `appsettings.Production.json`，以及环境变量。`@nestjs/config` 读取 `.env` 文件和环境变量，其中环境的优先级高于文件，并在启动时验证它们，如下所示：

```json
{
  "Orders": {
    "PageSize": 20,
    "PaymentsUrl": "https://payments.example.com"
  }
}

```

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { z } from 'zod';
import ordersConfig from './orders/orders.config.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env'],
      validationSchema: z.object({
        ORDERS_PAGE_SIZE: z.coerce.number().int().positive().default(20),
        PAYMENTS_URL: z.url(),
      }),
      load: [ordersConfig],
    }),
  ],
})
export class AppModule {}

```

在 `envFilePath` 中有多个文件时，定义变量的第一个文件获胜，因此 `.env.production` 覆盖 `.env`，因为 `appsettings.Production.json` 覆盖 `appsettings.json`。`NODE_ENV` 充当 `ASPNETCORE_ENVIRONMENT` 的角色。将密钥排除在已提交的文件之外，就像处理用户密钥一样。

`IConfiguration["Orders:PageSize"]` 变为 `ConfigService.get()`，或者对于必需的值是 `getOrThrow()`。对于一组类型的设置，与 `IOptions<OrdersOptions>` 对应的 `registerAs()` 声明一个配置命名空间，并在注入时使用 `ConfigType` 来对其进行类型化：

```typescript title="orders/orders.config.ts"
import { registerAs } from '@nestjs/config';

export default registerAs('orders', () => ({
  pageSize: Number(process.env.ORDERS_PAGE_SIZE ?? 20),
  paymentsUrl: process.env.PAYMENTS_URL!,
}));

```

```typescript title="orders/orders.service.ts"
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import ordersConfig from './orders.config.js';

@Injectable()
export class OrdersService {
  constructor(
    @Inject(ordersConfig.KEY)
    private readonly config: ConfigType<typeof ordersConfig>,
  ) {}
}

```

参见 [Configuration](/application/configuration)。

#### 数据访问

Entity Framework Core 的实体通过 `@nestjs/typeorm` 最直接地映射到 TypeORM。实体是一个被装饰器的类，并且模块为其注册一个仓储：

```csharp
// Order.cs
public class Order
{
    public Guid Id { get; set; }
    public required string CustomerId { get; set; }
    public OrderStatus Status { get; set; }
}

```

```typescript title="orders/order.entity.ts"
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  customerId: string;

  @Column({ type: 'varchar', default: 'pending' })
  status: 'pending' | 'paid' | 'shipped';
}

```

```typescript title="orders/orders.module.ts"
@Module({
  imports: [TypeOrmModule.forFeature([Order])],
  providers: [OrdersService],
  controllers: [OrdersController],
})
export class OrdersModule {}

```

```typescript title="orders/orders.service.ts"
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './order.entity.js';

@Injectable()
export class OrdersService {
  constructor(@InjectRepository(Order) private readonly orders: Repository<Order>) {}

  findPending(customerId: string) {
    return this.orders.findBy({ customerId, status: 'pending' });
  }
}

```

没有 `DbContext` 也没有 LINQ。每个实体的仓储取代了 `DbSet<T>`，查询使用条件对象或通过查询构建器进行，并且没有会刷新已跟踪更改的 `SaveChanges()`：`save()`、`insert()` 和 `update()` 在调用时写入。`@InjectRepository(Order)` 根据实体命名，因为泛型类型参数在运行时不存在，所以 Nest 无法仅通过类型区分 `Repository<Order>` 和 `Repository<Customer>`。

事务在回调内部运行查询，当回调解析时提交，当回调抛出时回滚，就像使用 `using var transaction = ...` 块和 `CommitAsync()` 那样：

```typescript title="orders/orders.service.ts"
// constructor(private readonly dataSource: DataSource) {}, from 'typeorm'
async place(dto: CreateOrderDto) {
  return this.dataSource.transaction(async (manager) => {
    const order = await manager.save(Order, { customerId: dto.customerId });
    await manager.insert(OrderItem, dto.items.map((item) => ({ ...item, orderId: order.id })));
    return order;
  });
}

```

如果您更喜欢使用推断结果类型的类型化 SQL，[Drizzle](https://docs.nestjs.com/data/drizzle) 是另一个第一方选项。[Prisma](/recipes/prisma)、[MikroORM](/data/mikroorm) 的工作单元和身份映射最接近 EF Core 的更改跟踪，而 [Mongoose](/techniques/mongo) 也可以工作。`dotnet ef migrations` 成为 ORM 自己的迁移工具。参见 [Data](/data/overview)。

#### 后台工作

一个 `BackgroundService` 与 Web 服务器并行运行。Nest 使用三个工具来覆盖其用途：

- **在启动和关闭时工作。** 一个提供者实现 `onApplicationBootstrap()` 和 `onApplicationShutdown()`，它们是 `StartAsync()` 和 `StopAsync()` 的对应项。Nest 仅在您在 `main.ts` 中调用 `app.enableShutdownHooks()` 后才在 `SIGTERM` 上运行关闭钩子，因为 .NET 主机默认停止托管服务。参见 [Lifecycle events](/fundamentals/lifecycle-events)。
- **定时工作。** 来自 `@nestjs/schedule` 的 `@Cron()`、`@Interval()` 和 `@Timeout()` 用 `PeriodicTimer` 替换了循环，也取代了 Hangfire 或 Quartz.NET 的定期任务。
- **由请求委托的工作。** `@nestjs/bullmq` 将任务放入队列供工作进程消费，带有重试和延迟，就像 Hangfire 的后台任务一样。

```csharp
// InvoiceExportService.cs
public class InvoiceExportService : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromHours(1));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            // ...
        }
    }
}

```

```typescript title="invoices/invoice.jobs.ts"
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class InvoiceJobs {
  @Cron(CronExpression.EVERY_HOUR)
  async exportInvoices() {
    // ...
  }
}

```

一个定时任务在应用程序的每个实例上运行。要仅在一个实例上运行它，请添加来自 `@nestjs/locks` 的 `@OnOneInstance()`。参见 [Task scheduling](/techniques/task-scheduling)、[Queues](/techniques/queues) 和 [Distributed locks](/reliability/locks)。

进程内事件，MediatR 通知通常扮演的角色，来自 `@nestjs/event-emitter`，带有 `EventEmitter2.emit()` 和 `@OnEvent()`。有关 MediatR 风格的命令和查询，请参见 [CQRS](/recipes/cqrs)。

#### 调用其他服务

`IHttpClientFactory` 和类型化客户端变为来自 `@nestjs/http-client` 的 `HttpClient`，基于 Node 的 `fetch`，带有基础 URL、超时、重试和每个模块注册的命名客户端。Polly 的超时、重试、断路器和舱壁变为来自 `@nestjs/resilience` 的装饰器。参见 [HTTP client](/application/http-client) 和 [Resilience](/reliability/resilience)。

#### 健康检查和可观测性

`AddHealthChecks()` 和 `MapHealthChecks()` 变为一个使用 `@nestjs/terminus` 的控制器，提供数据库、HTTP 依赖项、磁盘和内存的指示器：

```typescript title="health/health.controller.ts"
import { Controller, Get } from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([() => this.db.pingCheck('database')]);
  }
}

```

只有在使用 `@nestjs/authentication` 时才需要 `@Public()`，后者默认关闭所有路由。参见 [Health checks](/recipes/terminus)。

`ILogger<OrdersService>` 变为 `new Logger(OrdersService.name)`，并且带有 `json` 选项的 `ConsoleLogger` 会写入结构化 JSON 日志。参见 [Logger](/application/logger)。对于正在运行的应用程序的跟踪、错误和指标，Application Insights 对许多 ASP.NET Core 应用程序扮演的角色，参见 [NestJS Observe](/observability/overview)。

#### OpenAPI

Swashbuckle、NSwag 和 `Microsoft.AspNetCore.OpenApi` 变为 `@nestjs/swagger`，它从控制器和 DTO 构建文档并提供 Swagger UI：

```typescript title="main.ts"
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const config = new DocumentBuilder().setTitle('Orders API').setVersion('1.0').build();
SwaggerModule.setup('api', app, () => SwaggerModule.createDocument(app, config));

```

Swagger UI 位于 `/api`。[CLI plugin](/openapi/cli-plugin) 在构建时从 TypeScript 源代码读取属性类型和可选性，因为 C# 编译器通过反射将类型提供给 Swashbuckle，所以 DTO 不需要每个字段上的 `@ApiProperty()`。Zod 和其他 Schema 描述文档。参见 [OpenAPI](/openapi/introduction)。

#### 测试

`WebApplicationFactory<Program>` 变为一个测试模块，它创建的 `HttpClient` 变为 [Supertest](https://github.com/ladjs/supertest)。导入 `AppModule` 的测试模块会启动整个应用程序，而 `overrideProvider()` 用其中的提供者进行替换，就像 `ConfigureTestServices()` 所做的那样：

```csharp
// OrdersTests.cs
public class OrdersTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact]
    public async Task ReturnsAnOrder()
    {
        var client = factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
            services.AddSingleton<IOrdersService>(new FakeOrdersService()))).CreateClient();

        var order = await client.GetFromJsonAsync<Order>("/orders/42");
        Assert.Equal("42", order!.Id);
    }
}

```

```typescript
const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(OrdersService)
  .useValue(new FakeOrdersService())
  .compile();

```

测试模块也可以只包含测试所需的部分。下面的测试只创建了控制器，用一个假的服务替换了真实的服务，因此不需要数据库：

```typescript title="src/orders/orders.controller.spec.ts"
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { vi } from 'vitest';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

describe('OrdersController', () => {
  let app: INestApplication;
  const ordersService = { findOne: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: ordersService }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('returns an order', async () => {
    ordersService.findOne.mockResolvedValue({ id: '42', customerId: 'c-1', status: 'pending' });
    const response = await request(app.getHttpServer()).get('/orders/42').expect(200);
    expect(response.body.id).toBe('42');
  });
});

```

新项目使用 [Vitest](https://vitest.dev/) 作为测试运行器，取代 xUnit 和 Moq。单元测试也可以使用 `new` 创建被测类并将其假对象传递给构造函数，因为提供者是一个纯类。参见 [Testing](/fundamentals/unit-testing)。

#### 有何不同

上述映射适用于结构。以下是改变您编写代码方式的差异。

**一个线程，一个事件循环，没有线程池。** `async` 和 `await` 在 TypeScript 和 C# 中看起来相同，I/O 的工作方式也相同：当一个请求等待数据库时，其他请求会运行。不同之处在于运行代码的是什么。ASP.NET Core 在线程池上调度延续，因此一个请求中的 CPU 密集型工作占用一个线程。Node.js 在一个线程上运行所有 JavaScript，因此处理程序中的 CPU 密集型工作，例如哈希大文件或长时间的同步循环，会阻塞进程中的所有其他请求。没有 `Task.Run()` 将其推到其他地方：将其移动到 [queue](/techniques/queues) 或工作线程，并运行多个进程或容器以使用多个核心。也没有需要考虑的 `SynchronizationContext` 和 `ConfigureAwait(false)`。

**默认没有 `CancellationToken`。** ASP.NET Core 将 `HttpContext.RequestAborted` 绑定到 `CancellationToken` 参数。除非请求它，否则 Nest 处理程序不会收到取消信号。JavaScript 的对应项是一个 `AbortSignal`：来自 [`@nestjs/resilience`](/reliability/resilience) 的 `@Signal()` 注入一个在路由时间预算用尽时中止的信号，`@SseSignal()` 注入一个用于 [Server-Sent Events](/http/server-sent-events) 流的信号，而 [HTTP client](/application/http-client) 和 `fetch()` 接受它。

**依赖注入在装饰器元数据上运行。** TypeScript 编译器记录了被装饰类的构造函数参数类型（`emitDecoratorMetadata`），Nest 在应用程序启动时读取它们。接口和泛型类型参数不会在编译后保留，这就是注入使用类、抽象类或令牌的原因，也是仓储通过 `@InjectRepository(Order)` 而不是通过其泛型类型进行注入的原因。

**类型是编译时检查。** System.Text.Json 创建了动作声明的类型，模型绑定验证它。在 Nest 中，请求体是纯 JSON，只有 [validation pipe](/techniques/validation) 检查和转换它。同样适用于跨进程边界的任何内容：数据库行、队列消息、另一个服务的响应。

**装饰器是函数。** C# 属性是框架通过反射读取的被动元数据。TypeScript 装饰器是一个在类定义时运行的函数，Nest 的装饰器使用它来记录稍后读取的元数据。Nest 使用 TypeScript 的 `experimentalDecorators`，您已启用生成项目即可使用。

**数字是双精度浮点数。** JavaScript 的 `number` 是一个 64 位浮点数，没有 `decimal`。将金钱保留为整数分，或者使用十进制库和数据库的 `numeric` 类型，大多数驱动程序将其返回为字符串。

**ES 模块和 npm。** Nest 12 包是 ES 模块，使用 ESM 生成的项目会使用 `.js` 扩展名导入本地文件，即使是从 `.ts` 文件导入，因为这是编译后文件的名称。npm 和 `package.json` 取代了 NuGet 和 C# 编译器（`.csproj`、`tsc` 或 [SWC](/recipes/swc)），构建输出是可在 Node.js 上运行的纯 JavaScript。参见 [ESM packages](/migration-guide#esm-packages)。