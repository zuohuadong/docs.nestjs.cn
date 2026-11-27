<!-- 此文件从 content/migrating/spring-boot.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:16:59.655Z -->
<!-- 源文件: content/migrating/spring-boot.md -->
<!-- 源哈希: 2f0cbcbea6f19a93a776c122b57378a1 -->

### 来自 Spring Boot

Nest 基于 Spring Boot 开发者已熟悉的概念构建：依赖注入容器、构造函数注入、控制器和服务、配置类以及类似注解的装饰器。配置、验证、安全、调度、健康检查和 OpenAPI 来自第一方包。变化在于语言 TypeScript 和运行时 Node.js。

本页面将 Spring Boot 概念映射到其 Nest 等价物，并提供简短的代码并列展示。它以 [what's different](/migrating/spring-boot#whats-different) 结束，这比语法更重要。

#### 概览

| Spring Boot | Nest | 阅读更多 |
| --- | --- | --- |
| `@SpringBootApplication`, `SpringApplication.run()` | 一个根 模块 和 `NestFactory.create()` | [First steps](/first-steps) |
| `@Component`, `@Service`, `@Repository` | `@Injectable()` 类，列在 模块 的 `providers` 中 | [Providers](/overview/providers) |
| `@Configuration` 和 `@Bean` | 模块和工厂提供者 (`useFactory`) | [Custom providers](/fundamentals/dependency-injection) |
| 自动配置和启动器 | 动态模块，例如 `ConfigModule.forRoot()` | [Dynamic modules](/fundamentals/dynamic-modules) |
| Bean 作用域：单例、原型、请求 | 注入作用域：`DEFAULT`, `TRANSIENT`, `REQUEST` | [Injection scopes](/fundamentals/provider-scopes) |
| `@PostConstruct`, `@PreDestroy`, `ApplicationRunner` | `onModuleInit()`, `onApplicationShutdown()`, `onApplicationBootstrap()` | [Lifecycle events](/fundamentals/lifecycle-events) |
| `@RestController`, `@GetMapping`, `@PathVariable` | `@Controller()`, `@Get()`, `@Param()` | [Controllers](/overview/controllers) |
| Bean 验证 (`@Valid`, `@NotBlank`) | 管道，使用 class-validator DTO 或像 Zod 这样的标准 模式 | [Validation](/techniques/validation) |
| `@ControllerAdvice`, `@ExceptionHandler` | 异常过滤器 | [Exception filters](/overview/exception-filters) |
| Servlet 过滤器 | 中间件 | [Middleware](/overview/middlewares) |
| `HandlerInterceptor`, `@Around` 建议 | 拦截器和守卫 | [Interceptors](/overview/interceptors), [Guards](/overview/guards) |
| Spring Security | `@nestjs/authentication` 和 `@nestjs/authorization` | [Authentication](/security/authentication), [Authorization](/security/authorization) |
| `application.yml`, `@Value`, `@ConfigurationProperties`, profile | `@nestjs/config` | [Configuration](/application/configuration) |
| Spring Data JPA | `@nestjs/typeorm`, `@nestjs/drizzle` 和其他 ORM | [Data](/data/overview) |
| `@Scheduled` | `@nestjs/schedule` | [Task scheduling](/techniques/task-scheduling) |
| ShedLock | `@nestjs/locks` | [Distributed locks](/reliability/locks) |
| `ApplicationEventPublisher`, `@EventListener` | `@nestjs/event-emitter` | [Events](/application/events) |
| `RestClient`, `WebClient` | `@nestjs/http-client` | [HTTP client](/application/http-client) |
| Resilience4j | `@nestjs/resilience` | [Resilience](/reliability/resilience) |
| Actuator 健康检查端点 | `@nestjs/terminus` | [Health checks](/recipes/terminus) |
| springdoc-openapi | `@nestjs/swagger` | [OpenAPI](/openapi/introduction) |
| SLF4J 和 Logback | `Logger` 来自 `@nestjs/common` | [Logger](/application/logger) |
| `@SpringBootTest`, `@WebMvcTest`, MockMvc, `@MockitoBean` | `@nestjs/testing` 和 Supertest | [Testing](/fundamentals/testing) |
| Spring WebSocket | 网关 | [Gateways](/websockets/gateways) |
| Spring for Apache Kafka, Spring AMQP | `@nestjs/microservices` | [Microservices](/microservices/basics) |

#### 启动项目

Spring Initializr 生成一个带有主类的项目。Nest CLI 执行相同操作：

```bash
$ npm i -g @nestjs/cli
$ nest new orders-api

```

Spring Boot 应用程序的入口点：

```java
// OrdersApplication.java
@SpringBootApplication
public class OrdersApplication {
  public static void main(String[] args) {
    SpringApplication.run(OrdersApplication.class, args);
  }
}

```

Nest 应用程序的入口点：

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

`npm run start:dev` 启动应用程序并在文件更改时重启它，类似于 Spring Boot DevTools。`nest generate`（或 `nest g`）添加一个包含测试文件的 模块、控制器或服务，而 `nest g resource orders` 生成完整的 CRUD 切片。参见 [CLI usages](/cli/usages)。

#### Bean 变为提供者

Spring bean 是容器创建并注入的类。在 Nest 中，它是 **提供者**：一个使用 `@Injectable()` 装饰器的类。构造函数注入方式相同，不需要 `@Autowired`：

```java
// OrdersService.java
@Service
public class OrdersService {
  private final OrdersRepository ordersRepository;

  public OrdersService(OrdersRepository ordersRepository) {
    this.ordersRepository = ordersRepository;
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

构造函数中的 `private readonly` 一步完成声明和赋值，因此类体保持为空。

没有组件扫描。Spring 在类路径上查找 `@Service` 类；Nest 只创建模块列出的提供者。每个提供者都属于一个 **模块**：

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

模块也是 Spring 应用上下文所没有的边界。除非模块在 `exports` 中列出它，并且另一个模块将其添加到其 `imports` 中，否则提供者只能在其自身的模块内部可见。Spring 中的 `@Import` 将配置合并到一个上下文中；Nest 中的 `imports` 使另一个模块的导出提供者可用，仅此而已。参见 [Modules](/modules)。

当无法解析依赖项时，应用程序会在启动时以一个包含类名、缺失依赖项和模块的错误失败，这与 Spring 在未满足依赖项时失败的方式相似。

##### 接口和限定符

在 Spring 中，构造函数可以请求一个接口，容器会找到实现它的 bean。TypeScript 接口在编译时会被擦除，因此 Nest 在运行时看不到它们。请使用 **抽象类** 作为契约。它在运行时存在，因此可作为注入令牌工作：

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

需要它的类在其构造函数中声明 `private readonly paymentGateway: PaymentGateway`，与其他任何提供者一样。在 Spring 使用 `@Qualifier` 从多个相同类型的 bean 中选择一个时，Nest 使用字符串或 `Symbol` 令牌和 `@Inject()` 装饰器。参见 [Interfaces and abstract classes](/fundamentals/dependency-injection#interfaces-and-abstract-classes)。

#### `@Configuration` 和 `@Bean` 变为工厂提供者

一个 `@Bean` 方法构建一个不是你拥有的类，或者需要设置的对象：

```java
// StorageConfig.java
@Configuration
public class StorageConfig {
  @Bean
  public S3Client s3Client(StorageProperties properties) {
    return S3Client.builder().region(Region.of(properties.region())).build();
  }
}

```

在 Nest 中，它是 **工厂提供者**。`inject` 按顺序列出传递给工厂的提供者：

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

工厂可以是 `async`，Nest 会等待它之后才创建依赖于它的提供者。参见 [Factory providers](/fundamentals/dependency-injection#工厂提供者usefactory) 和 [Asynchronous providers](/fundamentals/async-components)。

Spring Boot 启动器从类路径和属性中进行自我配置。Nest 包提供 **动态模块**，你需要明确导入和配置它们：`ConfigModule.forRoot()`, `TypeOrmModule.forRootAsync()`, `ScheduleModule.forRoot()`。安装本身不会进行任何配置。

#### 作用域和生命周期

| Spring | Nest |
| --- | --- |
| 单例 (默认) | `Scope.DEFAULT` (默认) |
| `@Scope("prototype")` | `Scope.TRANSIENT`：为注入它的每个类创建新实例 |
| `@RequestScope` | `Scope.REQUEST` |
| `@PostConstruct` | `onModuleInit()` |
| `ApplicationRunner`, `ApplicationReadyEvent` | `onApplicationBootstrap()` |
| `@PreDestroy` | `onModuleDestroy()`, `onApplicationShutdown()` |

Spring 中的请求作用域 bean 是通过代理注入到单例中的。Nest 没有代理：注入请求作用域提供者的提供者本身也会成为请求作用域，直到控制器，并且每次请求都会重新创建整个链。保持提供者为单例。当提供者需要当前请求中的某些内容（例如用户或租户）时，应从 `AsyncLocalStorage` 存储中读取，该存储充当 `ThreadLocal` 的角色。参见 [Async local storage](/recipes/async-local-storage)。

Spring Boot 注册一个 JVM 关闭钩子，因此 `@PreDestroy` 方法在没有设置的情况下在 `SIGTERM` 上运行。Nest 在你在 `main.ts` 中调用 `app.enableShutdownHooks()` 后，仅在收到信号时才运行 `onModuleDestroy()` 和 `onApplicationShutdown()`。参见 [Application shutdown](/fundamentals/lifecycle-events#application-shutdown)。

#### 控制器

一个 Spring 控制器：

```java
// OrdersController.java
@RestController
@RequestMapping("/orders")
public class OrdersController {
  private final OrdersService ordersService;

  public OrdersController(OrdersService ordersService) {
    this.ordersService = ordersService;
  }

  @GetMapping
  public List<Order> findAll(@RequestParam(defaultValue = "0") int page) {
    return ordersService.findAll(page);
  }

  @GetMapping("/{id}")
  public Order findOne(@PathVariable String id) {
    return ordersService.findOne(id);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public Order create(@Valid @RequestBody CreateOrderRequest request) {
    return ordersService.create(request);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void remove(@PathVariable String id) {
    ordersService.remove(id);
  }
}

```

Nest 中的相同控制器：

```typescript title="orders/orders.controller.ts"
import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
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
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
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

- 路由参数使用 `:id` 编写，Spring 会用花括号包裹名称。
- 默认的 `POST` 处理程序响应 `201 Created`，而其他所有方法都 `200 OK`。`@HttpCode()` 会更改它。
- 处理程序可以是 `async` 并返回一个 `Promise`。Nest 会等待它并将结果作为 JSON 进行序列化，就像 Spring 使用 Jackson 一样。
- 查询和路由参数作为字符串到达。`ParseIntPipe` 进行转换和验证其中一个，就像 Spring 的类型转换一样。
- 没有 `ResponseEntity`。返回主体，使用 `@Header()` 设置头部，并为错误状态抛出异常，例如 `throw new NotFoundException()`。参见 [Built-in HTTP exceptions](/overview/exception-filters#内置-http-异常)。

控制器列在其 模块 的 `controllers` 中，而不是被发现。

#### 验证

Spring 使用 Bean Validation 注解验证 `@Valid` 请求体：

```java
// CreateOrderRequest.java
public record CreateOrderRequest(
  @NotBlank String customerId,
  @NotEmpty List<@Valid OrderItem> items,
  @Size(max = 500) String note
) {}

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

为整个应用程序绑定管道一次，相当于每个主体上的 `@Valid`：

```typescript title="main.ts"
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

```

`whitelist` 会丢弃 DTO 未声明的属性，而 `transform` 会将主体转换为 DTO 类的实例。无效的主体会得到一个 `400 Bad Request`，其中列出了所有失败的规则。

或者，使用 Zod 等 [Standard Schema](https://standardschema.dev/) 库描述主体，参数的类型是从模式中推断出来的。全局绑定 `StandardSchemaValidationPipe`，并使用 `@Body()` 的 `schema` 选项传递模式：

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

> 警告 **警告** TypeScript 类型在运行时不存在，因此仅有类型注解无法验证任何内容。如果没有验证管道，`@Body() dto: CreateOrderDto` 将接收客户端发送的任何 JSON。像上面那样全局绑定其中一个管道。

有关这两个管道，请参阅 [Validation](/techniques/validation)。

#### 异常处理

一个 `@RestControllerAdvice` 将异常映射到响应：

```java
// ApiExceptionHandler.java
@RestControllerAdvice
public class ApiExceptionHandler {
  @ExceptionHandler(OrderNotFoundException.class)
  public ProblemDetail handle(OrderNotFoundException exception) {
    return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, exception.getMessage());
  }
}

```

在 Nest 中，这是一个 **异常过滤器**。`@Catch()` 指定它处理的异常类：

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

将其注册为根模块中的一个 `APP_FILTER` 提供者，用于整个应用程序，这允许它注入其他提供者：

```typescript title="app.module.ts"
providers: [{ provide: APP_FILTER, useClass: OrderNotFoundFilter }],

```

`HttpException` 及其子类，如 `NotFoundException` 和 `ConflictException`，充当 `ResponseStatusException` 的角色：在任何地方抛出一个，内置过滤器就会将其转换为带有状态的 JSON 响应。任何其他异常都成为一个 `500`。参见 [Exception filters](/overview/exception-filters)。

#### 过滤器、拦截器和方面

Spring 有 servlet 过滤器、`HandlerInterceptor` 和 AOP 建议。Nest 在路由处理程序周围有四种类型的组件，并按此顺序运行它们：

| Nest | 运行时间 | Spring 对应物 |
| --- | --- | --- |
| [Middleware](/overview/middlewares) | 路由前，使用原始请求和响应 | Servlet `Filter`, `OncePerRequestFilter` |
| [Guards](/overview/guards) | 路由后，决定是否运行处理程序 | 安全过滤器链的授权部分，`HandlerInterceptor.preHandle()` 返回 `false` |
| [Interceptors](/overview/interceptors) | 围绕处理程序，可访问其结果 | 控制器上的 `HandlerInterceptor`, `@Around` 建议 |
| [Pipes](/pipes) | 在每个参数上，处理程序之前 | 类型转换和验证 |
| [Exception filters](/overview/exception-filters) | 任何上层抛出异常时 | `@ControllerAdvice` |

一个记录每个请求耗时的拦截器：

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

拦截器包装路由处理程序（以及微服务和网关中的消息和事件处理程序），而不是任意方法。没有通用的 AOP：没有任何 Bean 方法上的 `@Transactional`、`@Cacheable` 或 `@Retryable`。Nest 的包涵盖了路由处理程序上的这些情况，例如 [Caching](/data/caching) 中的 `CacheInterceptor` 和 [Resilience](/reliability/resilience) 中的 `@Retry()`，以及服务内部明确的 API，例如下文 Resilience 的策略对象和事务回调。

#### 安全性

使用 `@nestjs/authentication`，从模块注册的那一刻起，每个路由都需要一个已登录的用户，就像 Spring Security 的 `anyRequest().authenticated()` 一样。一个凭证提供者，相当于一个 `AuthenticationProvider`，读取会话 Cookie、Bearer 令牌或 API 密钥并加载用户。`@Public()` 打开一个路由，如 `permitAll()`，而 `@CurrentUser()` 注入用户，如 `@AuthenticationPrincipal`：

```java
// MeController.java
@RestController
public class MeController {
  @GetMapping("/me")
  public User me(@AuthenticationPrincipal User user) {
    return user;
  }
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

除了服务器端会话、密码哈希和 OpenID Connect 登录之外，该包还提供了 Spring 应用程序通常需要自己编写的流程，例如注册、电子邮件验证和密码重置链接、TOTP 双因素认证、轮换刷新令牌以及用户创建和撤销的 API 密钥。参见 [Authentication](/security/authentication)。

对于方法安全，`@nestjs/authorization` 用 **策略** 替换了 `@PreAuthorize` 表达式：这些类的方法决定用户是否可以执行某些操作，并根据使用它们的路由进行类型检查。像认证守卫一样，它的守卫默认拒绝，因此声明没有检查的路由是关闭的：

```java
// ProductsController.java
@PostMapping
@PreAuthorize("hasRole('STAFF')")
public Product create(@Valid @RequestBody CreateProductRequest request) {
  return productsService.create(request);
}

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

依赖于记录的检查，例如“客户只能看到自己的订单”，应在服务中使用 `AuthorizationService.authorize()`，类似于 `@PostAuthorize`。参见 [Authorization](/security/authorization)。

#### 配置和配置文件

Spring Boot 读取 `application.yml`、特定于配置文件的文件和环境变量。`@nestjs/config` 读取 `.env` 文件和环境变量，其中环境变量优先于文件，并在启动时验证它们：

```yaml
# application.yml
orders:
  page-size: 20
  payments-url: https://payments.example.com

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

在 `envFilePath` 中有多个文件时，第一个定义变量的文件获胜，因此 `.env.production` 覆盖 `.env`，因为 `application-prod.yml` 覆盖 `application.yml`。Nest 没有自己的配置文件；`NODE_ENV` 是常规的开关。

`@Value` 变为 `ConfigService.get()`，或者对于必需的值是 `getOrThrow()`。对于一组类型的设置，相当于 `@ConfigurationProperties` 类的 `registerAs()`，声明一个配置命名空间，并在注入时使用 `ConfigType` 进行类型化：

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

`@ConditionalOnProperty` 在 `ConditionalModule.registerWhen()` 中有对应物，后者仅在环境变量允许时才导入一个 模块。参见 [Configuration](/application/configuration)。

#### 数据访问

Spring Data JPA 的实体和仓储与 TypeORM 映射最为直接，通过 `@nestjs/typeorm` 实现。实体是一个被装饰的类，模块为其注册一个仓储：

```java
// Order.java
@Entity
@Table(name = "orders")
public class Order {
  @Id @GeneratedValue(strategy = GenerationType.UUID)
  private String id;

  @Column(nullable = false)
  private String customerId;

  @Enumerated(EnumType.STRING)
  private OrderStatus status;
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

没有派生查询方法：`findByCustomerIdAndStatus()` 变为带有条件对象的 `findBy()`，更复杂的查询通过 TypeORM 的查询构建器实现。由于运行时不存在泛型类型参数，`@InjectRepository(Order)` 需要通过实体名称来命名，因此 Nest 无法仅凭类型区分 `Repository<Order>` 和 `Repository<Customer>`。

也没有 `@Transactional`。在回调中运行事务查询，它们在解析时提交，在抛出异常时回滚：

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

如果更倾向于编写类型化的 SQL 而不是映射实体，[Drizzle](https://docs.nestjs.com/data/drizzle) 是另一个首选选项，比 JPA 更接近 jOOQ。[Prisma](/recipes/prisma)、[MikroORM](/data/mikroorm) 的工作单元最接近 JPA 持久化上下文，而 [Mongoose](/techniques/mongo) 也可以使用。Flyway 和 Liquibase 迁移成为 ORM 自身的迁移工具。参见 [Data](/data/overview)。

#### 调度、事件和后台工作

`@Scheduled` 变为 `@Cron()`、`@Interval()` 或 `@Timeout()`，来自 `@nestjs/schedule`。两者都使用以秒开头的六字段 cron 表达式，尽管在 Nest 中秒字段是可选的：

```java
// InvoiceJobs.java
@Scheduled(cron = "0 0 2 * * *")
public void exportInvoices() { ... }

```

```typescript title="invoices/invoice.jobs.ts"
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class InvoiceJobs {
  @Cron('0 0 2 * * *')
  async exportInvoices() {
    // ...
  }
}

```

定时任务在应用程序的每个实例上运行，就像 `@Scheduled` 一样。在 Spring 应用程序使用 ShedLock 的地方，添加来自 `@nestjs/locks` 的 `@OnOneInstance()`。参见 [Task scheduling](/techniques/task-scheduling) 和 [Distributed locks](/reliability/locks)。

`ApplicationEventPublisher` 和 `@EventListener` 变为来自 `@nestjs/event-emitter` 的 `EventEmitter2.emit()` 和 `@OnEvent()`。`@Async` 没有对应物，因为 Node.js 中的 I/O 本身就是异步的：一个等待数据库或 HTTP 调用的 `async` 方法在等待时不会阻塞线程。应该完全离开请求的工作，例如发送电子邮件或生成报告，会发送到带有 `@nestjs/bullmq` 的队列中。参见 [Events](/application/events) 和 [Queues](/techniques/queues)。

#### 调用其他服务

`RestClient` 和 `WebClient` 变为来自 `@nestjs/http-client` 的 `HttpClient`，该实现基于 Node 的 `fetch`，具有基础 URL、超时、重试和命名客户端。Resilience4j 的超时、重试、断路器和舱壁变为来自 `@nestjs/resilience` 的装饰器。参见 [HTTP client](/application/http-client) 和 [Resilience](/reliability/resilience)。

#### 健康检查和可观测性

Actuator 的健康端点变为一个使用 `@nestjs/terminus` 的控制器，包含数据库、HTTP 依赖、磁盘和内存的指示器：

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

只有在使用 `@nestjs/authentication` 时才需要 `@Public()`，后者默认关闭所有路由。参见 [Health checks](/recipes/terminus)。对于正在运行的应用程序的跟踪、错误和指标，Micrometer 和 APM 代理在 Spring 中的作用，参见 [NestJS Observe](/observability/overview)。

#### OpenAPI

springdoc-openapi 变为 `@nestjs/swagger`，它从控制器和 DTO 构建文档并提供 Swagger UI：

```typescript title="main.ts"
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const config = new DocumentBuilder().setTitle('Orders API').setVersion('1.0').build();
SwaggerModule.setup('api', app, () => SwaggerModule.createDocument(app, config));

```

Swagger UI 位于 `/api`。[CLI plugin](/openapi/cli-plugin) 在构建时从 TypeScript 源代码读取属性类型和可选性，因此 DTO 不需要每个字段上的 `@ApiProperty()`。Zod 和其他标准 ⟦Schema⟧ 也描述了文档。参见 [OpenAPI](/openapi/introduction)。

#### 测试

一个包含 [Supertest](https://github.com/ladjs/supertest) 的测试模块取代了 MockMvc。与 `@WebMvcTest` 类似，下面的测试只创建控制器，用一个假的 ⟦Service⟧ 替换真实的 ⟦Service⟧：

```java
// OrdersControllerTest.java
@WebMvcTest(OrdersController.class)
class OrdersControllerTest {
  @Autowired MockMvc mvc;
  @MockitoBean OrdersService ordersService;

  @Test
  void returnsAnOrder() throws Exception {
    when(ordersService.findOne("42")).thenReturn(new Order("42", "c-1", OrderStatus.PENDING));
    mvc.perform(get("/orders/42")).andExpect(status().isOk()).andExpect(jsonPath("$.id").value("42"));
  }
}

```

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

对于 `@SpringBootTest` 的对应物，请导入 `AppModule`，并将提供者替换为 `overrideProvider()`，就像 `@MockitoBean` 所做的那样。新项目使用 [Vitest](https://vitest.dev/) 作为测试运行器，取代 JUnit 和 Mockito。单元测试也可以使用 `new` 创建被测类并将其假对象传递给构造函数，因为提供者是一个普通类。参见 [Testing](/fundamentals/testing)。

#### 有何不同

上述映射适用于结构。以下是改变您编写代码的差异。

**一个线程，一个事件循环，没有线程池。** Spring MVC 应用程序为每个请求分配一个线程，一个阻塞的线程只阻塞其自身的请求。Node.js 在一个线程上运行您的代码，当一个请求等待数据库时，其他请求仍在运行。这使得 I/O 成本低廉：数千个并发请求不需要线程池调优，类似于 WebFlux 或虚拟线程。但在处理程序中进行 CPU 密集型工作，例如哈希大文件或长时间的同步循环，会阻塞进程中的所有其他请求。将其移动到 [queue](/techniques/queues) 或工作线程中，并运行多个进程或容器以利用多个核心。数据库驱动程序和 HTTP 客户端是异步的，因此 I/O 代码是 `await` 而不是阻塞的。

**没有 `ThreadLocal`。** 请求共享一个线程，因此每个请求的状态存在于 `AsyncLocalStorage` 中，它沿着 `await` 跟踪请求。参见 [Async local storage](/recipes/async-local-storage)。

**依赖注入在装饰器元数据上运行。** TypeScript 编译器记录了被装饰类的构造函数参数类型（`emitDecoratorMetadata`），Nest 在应用程序启动时读取它们。没有类路径扫描，没有字节码生成，也没有代理。接口和泛型类型参数在编译后不会保留，这就是注入使用类、抽象类或令牌的原因。没有代理的优点是不会出现自调用陷阱：一个方法调用同一类的另一个方法表现得像任何方法调用一样。

**类型是编译时检查。** Jackson 创建了处理程序声明的类，Bean Validation 检查它。在 Nest 中，请求体是纯 JSON，只有 [validation pipe](/techniques/validation) 检查和转换它。同样适用于跨进程边界的任何内容：数据库行、队列消息、另一个服务的响应。

**装饰器是函数。** Java 注解是框架通过反射读取的被动元数据。TypeScript 装饰器是一个在类定义时运行的函数，Nest 的装饰器使用它来记录稍后读取的元数据。Nest 使用 TypeScript 的 `experimentalDecorators`，您可以在生成的项目中启用它。

**数字是双精度浮点数。** JavaScript 的 `number` 是 64 位浮点数，没有 `BigDecimal`。将货币存储为整数分，或者使用十进制库和数据库的 `numeric` 类型（大多数驱动程序将其返回为字符串）。

**ES 模块和 npm。** Nest 12 包是 ES 模块，生成的 ESM 项目导入本地文件时使用 `.js` 扩展名，即使是从 `.ts` 文件中导入，因为这是编译后文件的名称。npm 和 `package.json` 取代了 Maven 或 Gradle，`tsc` 或 [SWC](/recipes/swc) 取代了 `javac`，构建输出是纯 JavaScript，在 Node.js 上运行，没有 JVM 需要调优。参见 [ESM packages](/migration-guide#esm-packages)。

classpath 不会为你做出更多决策。安装一个包不会进行任何配置。你使用的每个 **模块** 都在代码中导入和配置，因此应用程序在启动时做什么可以从其 **模块** 中读取出来。