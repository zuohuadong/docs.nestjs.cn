<!-- 此文件从 content/migrating/fastapi.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:34:36.249Z -->
<!-- 源文件: content/migrating/fastapi.md -->
<!-- 源哈希: fc4e00cc2cae8d521d00b32faa61ef09 -->

### 来自 FastAPI

Nest 会比大多数 Node.js 框架更接近 FastAPI：路由使用装饰器声明，请求体根据模式进行验证，依赖项被注入，API 从头到尾都是异步的，并且 OpenAPI 文档是从代码生成的。变化在于语言 TypeScript 以及代码的结构。FastAPI 是一组将依赖项作为参数声明的函数；Nest 是一组分组到 **模块** 中的 **类**，它们在构造函数中接收依赖项。登录、权限、配置、后台任务等都来自第一方包。

本页面将 FastAPI 概念映射到其 Nest 等效项，并提供简短的代码并列展示。它以 [what's different](/migrating/fastapi#whats-different) 结束，这比语法更重要。

#### 概览

| FastAPI | Nest | 阅读更多 |
| --- | --- | --- |
| `uvicorn main:app --reload` | `npm run start:dev` | [First steps](/first-steps) |
| `APIRouter` 和 `include_router()` | 分组到 **模块** 中的 **控制器** | [Controllers](/overview/controllers), [Modules](/modules) |
| 路径操作：`@router.get()`, `@router.post()` | 路由装饰器：`@Get()`, `@Post()` | [Controllers](/overview/controllers) |
| Pydantic 请求模型 | 在 `@Body()` 上的模式，使用 Zod 或其他标准模式库 | [Validation](/techniques/validation) |
| `response_model` | `StandardSchemaSerializerInterceptor` | [Serialization](/application/serialization) |
| `Depends()` | 注入到构造函数中的 **提供者** | [Providers](/overview/providers) |
| 读取 **请求** 的依赖项 | **守卫**、**管道** 和参数装饰器 | [Guards](/overview/guards), [Custom decorators](/custom-decorators) |
| 带有 `yield` 的依赖项 | 生命周期钩子，或请求作用域的 **提供者** | [Lifecycle events](/fundamentals/lifecycle-events) |
| `app.dependency_overrides` | 在测试 **模块** 中的 `overrideProvider()` | [Testing](/fundamentals/testing) |
| `HTTPException`, `@app.exception_handler()` | `HttpException`，**异常过滤器** | [Exception filters](/overview/exception-filters) |
| **中间件**，`CORSMiddleware` | **中间件**，`app.enableCors()` | [Middleware](/overview/middlewares), [CORS](/security/cors) |
| `OAuth2PasswordBearer`, `Security()` 带有作用域 | `@nestjs/authentication` 和 `@nestjs/authorization` | [Authentication](/security/authentication), [Authorization](/security/authorization) |
| pydantic-settings `BaseSettings` | `@nestjs/config` | [Configuration](/application/configuration) |
| SQLAlchemy 或 SQLModel，以及 Alembic | Drizzle 或 TypeORM，及其 **迁移** 工具 | [Drizzle](https://docs.nestjs.com/data/drizzle), [TypeORM](/recipes/sql-typeorm) |
| `BackgroundTasks`, Celery, ARQ | `@nestjs/bullmq` | [Queues](/techniques/queues) |
| `lifespan` | `onModuleInit()`, `onApplicationShutdown()` | [Lifecycle events](/fundamentals/lifecycle-events) |
| `StreamingResponse`，服务端推送事件 | 异步生成器，`@Sse()` | [Streaming responses](/http/streaming-responses), [Server-Sent Events](/http/server-sent-events) |
| `@app.websocket()` | **网关** | [Gateways](/websockets/gateways) |
| `/docs` 和 `/openapi.json` | `@nestjs/swagger` | [OpenAPI](/openapi/introduction) |
| `TestClient` | `@nestjs/testing` 和 Supertest | [Testing](/fundamentals/testing) |

#### 启动项目

FastAPI 项目通常从一个 `main.py` 开始。Nest CLI 会生成一个包含根 **模块**、一个 **控制器**、一个 **服务** 和测试的项目：

```bash
$ npm i -g @nestjs/cli
$ nest new orders-api
$ cd orders-api
$ npm run start:dev

```

`npm run start:dev` 在文件更改时重启应用程序，类似于 `uvicorn --reload`。`nest generate resource orders` 添加了一个包含 **控制器**、**服务**、**DTO** 和测试文件的 **模块**。参见 [CLI usages](/cli/usages)。

入口点是 `main.ts`，它将应用程序、`app = FastAPI()` 的工作和 `uvicorn` 命令结合起来：

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

#### 路由变为控制器和模块

FastAPI 路由在一个前缀下分组路径操作，应用程序包含它：

```python
# orders/router.py
router = APIRouter(prefix="/orders", tags=["orders"])

@router.get("/{order_id}", response_model=OrderOut)
async def get_order(
    order_id: UUID,
    user: User = Depends(get_current_user),
    orders: OrdersService = Depends(get_orders_service),
):
    order = await orders.find_one(user, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order

@router.post("", status_code=201, response_model=OrderOut)
async def create_order(
    body: CreateOrder,
    user: User = Depends(get_current_user),
    orders: OrdersService = Depends(get_orders_service),
):
    return await orders.place(user, body)

# main.py
app.include_router(orders.router)

```

在 Nest 中，路由是一个 **控制器** 类。前缀应用在 `@Controller()` 上，每个方法是一个路径操作，而每个操作所需的依赖项一次性注入到构造函数中：

```typescript title="orders/orders.controller.ts"
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import type { User } from '../users/user.js';
import { createOrderSchema, type CreateOrder } from './create-order.schema.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get(':id')
  findOne(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findOne(user, id);
  }

  @Post()
  create(
    @CurrentUser() user: User,
    @Body({ schema: createOrderSchema }) body: CreateOrder,
  ) {
    return this.ordersService.place(user, body);
  }
}

```

**控制器** 列在 **模块** 中，以及它使用的 **提供者**。根 **模块** 导入功能 **模块**，因为 `include_router()` 添加了路由：

```typescript title="orders/orders.module.ts"
import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}

```

区别在于：

- 路由参数使用 `:id` 编写，FastAPI 在花括号中放置名称。参数的类型注解不会转换它：路由和查询参数作为字符串到达，而像 `ParseUUIDPipe` 或 `ParseIntPipe` 这样的 **管道** 会转换和检查其中一个。
- `POST` 处理程序默认响应 `201 Created`，而其他所有方法响应 `200 OK`。`@HttpCode()` 改变了这一点，就像 `status_code` 一样。
- `raise HTTPException(404)` 变为 `throw new NotFoundException()`，通常在 **服务** 中。参见 [Exceptions](/migrating/fastapi#exceptions)。
- `@CurrentUser()` 来自 `@nestjs/authentication`，后者默认也阻止了对匿名请求的所有路由访问。参见 [Security](/migrating/fastapi#security)。
- 要像 `include_router(prefix=...)` 那样为 **模块** 的每个路由添加前缀，请使用 [`RouterModule`](/recipes/router-module)，或对整个应用程序使用 `app.setGlobalPrefix('api')`。

#### Pydantic 模型变为模式

FastAPI 根据函数签名中的 Pydantic 模型验证请求体：

```python
# orders/schemas.py
class OrderItem(BaseModel):
    product_id: UUID
    quantity: int = Field(ge=1, le=20)

class CreateOrder(BaseModel):
    items: list[OrderItem] = Field(min_length=1)
    note: str | None = Field(default=None, max_length=500)

```

Nest 中最接近的匹配是 Zod 等 [Standard Schema](https://standardschema.dev/) 库。模式在运行时验证，TypeScript 类型是从模式推断出来的，因为 Pydantic 模型同时是两者：

```typescript title="orders/create-order.schema.ts"
import { z } from 'zod';

export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.uuid(),
        quantity: z.int().min(1).max(20),
      }),
    )
    .min(1),
  note: z.string().max(500).optional(),
});

export type CreateOrder = z.infer<typeof createOrderSchema>;

```

上面的 **控制器** 使用 `@Body()` 的 `schema` 选项传递模式。为整个应用程序绑定 `StandardSchemaValidationPipe` 一次，则所有带有模式的参数都将被验证：

```typescript title="main.ts"
app.useGlobalPipes(new StandardSchemaValidationPipe());

```

无效的请求体会得到一个 `400 Bad Request`，列出所有失败的规则，而 FastAPI 响应 `422`。Valibot 和 ArkType 的工作方式相同。如果偏好使用类，则使用带有 [class-validator](https://github.com/typestack/class-validator) 装饰器和 `ValidationPipe` 的 **DTO** 是替代方案。参见 [Validation](/techniques/validation)。

> 警告 **警告** 这是 FastAPI 开发者的最大变化。FastAPI 因为类型注解而进行验证。在 TypeScript 中，类型注解仅存在于编译时：`@Body() body: CreateOrder` 没有模式会接收客户端发送的任何 JSON，未经检查。验证仅在您传递模式（或使用带有 `ValidationPipe` 的 **DTO** 类）时发生。

##### 响应模型

`response_model` 过滤路径操作返回的内容，因此密码哈希等字段永远不会离开 API。Nest 使用 `StandardSchemaSerializerInterceptor` 做同样的事情。响应模式是一个白名单：`z.object()` 会丢弃它未声明的每个属性：

```typescript title="orders/orders.controller.ts"
import {
  SerializeOptions,
  StandardSchemaSerializerInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import { orderResponseSchema } from './order-response.schema.js';

@Controller('orders')
@UseInterceptors(StandardSchemaSerializerInterceptor)
export class OrdersController {
  // constructor as above

  @Get(':id')
  @SerializeOptions({ schema: orderResponseSchema })
  findOne(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findOne(user, id);
  }
}

```

当处理程序返回一个数组时，模式应用于每个元素。如果没有 **拦截器**，处理程序的返回值会原样作为 JSON 发送。参见 [Schema-based serialization](/application/serialization#schema-based-serialization)。

#### Depends 变为依赖注入

`Depends()` 是 FastAPI 的依赖注入。一个函数声明它需要的参数，FastAPI 在每次请求时调用依赖函数。在 Nest 中，依赖是**提供者**：标记了`@Injectable()`的类，在应用程序启动时创建一次，并传递给请求它们的构造函数。

```python
# orders/service.py
class OrdersService:
    def __init__(self, db: AsyncSession, mailer: Mailer):
        self.db = db
        self.mailer = mailer

def get_orders_service(
    db: AsyncSession = Depends(get_db),
    mailer: Mailer = Depends(get_mailer),
) -> OrdersService:
    return OrdersService(db, mailer)

```

在 Nest 中，类在其构造函数中声明其依赖项，无需其他任何东西：

```typescript title="orders/orders.service.ts"
import { Injectable } from '@nestjs/common';
import { Mailer } from '@nestjs/mail';
import { OrdersRepository } from './orders.repository.js';

@Injectable()
export class OrdersService {
  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly mailer: Mailer,
  ) {}
}

```

Nest 读取构造函数的参数类型，并为每个类型找到一个提供者。提供者在其自己的**模块**中可见，在其他**模块**中，当其**模块**在`exports`中列出它，并且另一个**模块**将其添加到其`imports`中时可见。参见 [Providers](/overview/providers) 和 [Modules](/modules)。

由于提供者只创建一次，它们是 FastAPI 保存在模块级全局变量或`app.state`中的地方：数据库连接池、HTTP 客户端、模型客户端。依赖于**请求**的逻辑放在其他地方：

| 一个 FastAPI 依赖项... | 在 Nest 中 |
| --- | --- |
| 构建一个**服务**或客户端 | 一个提供者，注入到构造函数中 |
| 从令牌或 **Cookie** 读取当前用户 | `@nestjs/authentication`，使用`@CurrentUser()` |
| 拒绝**请求**，例如权限检查 | 一个[guard](/overview/guards)，或带有`@Can()`的策略 |
| 解析或检查一个参数 | 一个[pipe](/pipes) |
| 从 **请求** 中提取一个值 | 一个[custom parameter decorator](/custom-decorators) |
| 每次**请求**打开和关闭某物，使用`yield` | 一个[interceptor](/overview/interceptors)，或一个[request-scoped provider](/fundamentals/provider-scopes) |
| 为应用程序的生命周期打开和关闭某物 | 一个带有`onModuleInit()`和`onApplicationShutdown()`的提供者 |

经典的`get_db()`配合`yield`通常不需要对应物。一个数据库**模块**，例如`DrizzleModule`，持有应用程序生命周期的连接池，每次**查询**都从其中获取连接并返回。存在**请求作用域**的提供者，但 Nest 会创建它，并且所有注入它的组件也是每次**请求**创建的，因此仅在需要时保留它。参见 [Injection scopes](/fundamentals/provider-scopes)。

#### 异常

`HTTPException` 变为`HttpException` 及其子类，例如`NotFoundException`、`ConflictException` 和 `ForbiddenException`。在**控制器**或**服务**的深处抛出其中任何一个，Nest 都会将其转换为带有状态的 JSON **响应**。任何其他异常都成为一个`500`。

`@app.exception_handler()` 变为一个**异常过滤器**。`@Catch()` 指定它处理的异常类：

```typescript title="common/order-not-found.filter.ts"
import {
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { OrderNotFoundError } from '../orders/order-not-found.error.js';

@Catch(OrderNotFoundError)
export class OrderNotFoundFilter implements ExceptionFilter {
  catch(exception: OrderNotFoundError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    response.status(404).json({ detail: exception.message });
  }
}

```

使用`app.useGlobalFilters()` 注册它，或者在它注入其他提供者时作为一个`APP_FILTER`提供者。参见 [Exception filters](/overview/exception-filters)。

#### 中间件和 CORS

`@app.middleware("http")` 变为 Nest **中间件**，它在路由之前接收**请求**和**响应**。在处理程序周围，Nest 有更具体的执行位置，按此顺序运行：[guards](/overview/guards) 决定是否运行处理程序，[interceptors](/overview/interceptors) 包装它并查看其结果，以及[pipes](/pipes) 检查每个参数。参见 [Request lifecycle](/faq/request-lifecycle)。

`CORSMiddleware` 变为`main.ts` 中的一个调用：

```typescript title="main.ts"
app.enableCors({ origin: ['https://shop.example.com'], credentials: true });

```

参见 [CORS](/security/cors)。

#### 安全性

FastAPI 为您提供了构建块：`OAuth2PasswordBearer` 读取一个 bearer token，您编写的`get_current_user`依赖项负责解码它并加载用户。密码哈希、令牌颁发和**会话**存储留给您选择的库。`@nestjs/authentication` 提供了这些部分：

- **从模块注册之始，每个路由都是受保护的**。`@Public()` 打开一个。FastAPI 的方式相反：路由在依赖于`get_current_user`之前是公开的。
- **`@CurrentUser()`** 注入用户，就像`Depends(get_current_user)` 所做的那样。
- **凭证提供者**读取 bearer token、**Cookie** **会话**或 API 密钥，并通过您的代码加载用户。用户是您自己的表：该包按 id 请求用户。
- **`TokenService`** 颁发短期访问令牌和轮换刷新令牌，而 **`PasswordHasher`** 使用 scrypt 哈希密码：这是 FastAPI 应用交给 PyJWT 和 passlib 等库的任务。
- 它还包含服务器端**会话**、电子邮件验证、密码重置链接、TOTP 双因素**认证**、魔术链接、OpenID Connect 和 API 密钥。

参见 [Authentication](/security/authentication)。

`Security()` 上的 OAuth2 范围检查令牌允许什么。`@nestjs/authorization` 检查用户可以使用**策略**做什么：这些类的方法根据用户（通常是记录）来决定：

```typescript title="orders/order.policy.ts"
import { Policy } from '@nestjs/authorization';
import type { User } from '../users/user.js';
import type { Order } from './order.js';

@Policy()
export class OrderPolicy {
  view(user: User | null, order: Order) {
    if (!user) {
      return false;
    }
    return user.roles.includes('staff') || order.customerId === user.id;
  }

  refund(user: User | null) {
    return !!user?.roles.includes('staff');
  }
}

```

仅需要用户检查放在路由上，使用`@Can(OrderPolicy, 'refund')`。需要记录的检查在**服务**中，在加载记录后，使用`AuthorizationService.authorize(OrderPolicy, 'view', user, order)`，当策略拒绝时抛出异常。**授权****守卫**拒绝声明了无检查的路由。参见 [Authorization](/security/authorization)。

#### 设置变为配置

一个 pydantic-settings 类读取**环境变量**并验证它：

```python
# settings.py
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")
    database_url: PostgresDsn
    openai_api_key: SecretStr
    debug: bool = False

```

`@nestjs/config` 使用**模式**执行相同操作，并在启动时停止应用程序，如果变量缺失或无效：

```typescript title="app.module.ts"
import { ConfigModule } from '@nestjs/config';
import { z } from 'zod';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: z.object({
        DATABASE_URL: z.url(),
        OPENAI_API_KEY: z.string().min(1),
        DEBUG: z.stringbool().default(false),
      }),
    }),
  ],
})
export class AppModule {}

```

FastAPI 代码调用`Depends(get_settings)` 的地方，Nest 提供者注入`ConfigService` 并调用`get()`，或对于必需的值调用`getOrThrow()`。参见 [Configuration](/application/configuration)。

#### 数据库和迁移

Nest 没有自己的 ORM。[Drizzle](https://docs.nestjs.com/data/drizzle)，其**模式**是 TypeScript 且**查询**看起来像 SQL，与 SQLAlchemy Core 及其表达式语言最接近。[TypeORM](/recipes/sql-typeorm)，带有装饰的**实体**类，更接近 SQLModel。Alembic 的`revision --autogenerate` 变为`npx drizzle-kit generate`，它根据**模式**的变更写入 SQL **迁移**，而`upgrade head` 变为`npx drizzle-kit migrate`。

数据库只注册一次，并在需要的地方注入：

```typescript title="orders/orders.repository.ts"
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { orders } from '../database/schema.js';

@Injectable()
export class OrdersRepository {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  async findForCustomer(id: string, customerId: string) {
    const [order] = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.customerId, customerId)));
    return order;
  }
}

```

Node.js 中的每个数据库驱动都是异步的，因此没有像 SQLAlchemy 那样的同步和异步选择。事务是一个回调，`this.db.transaction(async (tx) => ...)`，在解析时提交，在抛出时回滚。参见 [Drizzle transactions](https://docs.nestjs.com/data/drizzle#drizzle-transactions)。

#### 后台工作和生命周期

`BackgroundTasks` 在响应发送后在同一进程中运行一个函数。在 Node.js 中，你可以通过不等待 promise 来实现相同的功能，但如果进程停止，工作就会丢失，并且错误无处可去。请将其发送到队列中。`@nestjs/bullmq` 在 Redis 上运行任务，带有重试机制，同时也充当 Celery 或 ARQ 的角色：

```typescript title="invoices/invoice.processor.ts"
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

@Processor('invoices')
export class InvoiceProcessor extends WorkerHost {
  async process(job: Job<{ orderId: string }>) {
    // ...
  }
}

```

一个 **服务** 向它注入的队列添加一个 **任务**，FastAPI 代码调用 `background_tasks.add_task()`：

```typescript title="orders/orders.service.ts"
// constructor(@InjectQueue('invoices') private readonly invoices: Queue) {}
await this.invoices.add('generate', { orderId: order.id });

```

参见 [Queues](/techniques/queues)。定时 **任务** 使用来自 `@nestjs/schedule` 的 `@Cron()`。参见 [Task scheduling](/techniques/task-scheduling)。

`lifespan` **生命周期钩子** 成为任何 **提供者** 上的生命周期钩子：`onModuleInit()` 在启动时运行，在应用程序监听之前；`onApplicationShutdown()` 在关闭时运行，当在 `main.ts` 中调用 `app.enableShutdownHooks()` 时。参见 [Lifecycle events](/fundamentals/lifecycle-events)。

#### 流式传输和服务端推送事件

`StreamingResponse` 配合异步生成器成为一个异步生成器的处理程序。它产生的每个值都会在客户端可以接收时立即发送：

```typescript title="chat/chat.controller.ts"
@Get('story')
async *story() {
  for await (const token of this.llm.stream('Tell me a story')) {
    yield token;
  }
}

```

一个处理程序也可以返回一个 `ReadableStream`，或一个 Web `Response`，例如 AI SDK 的 `toTextStreamResponse()` 返回的。对于服务端推送事件，`@Sse()` 将一个 `Observable` 的每个值作为一个事件发送。参见 [Streaming responses](/http/streaming-responses) 和 [Server-Sent Events](/http/server-sent-events)。

#### WebSockets

`@app.websocket()` 成为一个 **网关**：一个其方法处理消息的类，使用 Socket.IO 或 `ws` 库。**网关** 是 **提供者**，因此它们注入 **服务**，**守卫**、**管道** 和 **拦截器** 在它们上工作，就像在路由上一样。参见 [Gateways](/websockets/gateways)。

#### AI 后端

许多 FastAPI 应用程序提供语言模型。在 Nest 中，`@nestjs/ai` 按名称注册模型并注入 `AiService`，带有重试、超时、回退模型，并且答案由 **模式** 验证，基于 AI SDK，因此 Claude、GPT、Gemini 和其他 **提供者** 都可以工作。标记为 `@AgentFunction()` 的 **提供者** 方法成为模型调用的工具，通过与路由相同的 **守卫** 和 **管道**。`@nestjs/mcp` 提供与 MCP 服务器相同的 **方法**。参见 [AI](/ai/overview)、[MCP](/mcp/overview) 和 [AI chat backend tutorial](/tutorials/ai-chat-backend)。

#### OpenAPI

FastAPI 无需设置即可提供 `/docs` 和 `/openapi.json`。在 Nest 中，文档来自 `@nestjs/swagger`，您在 `main.ts` 中设置它：

```typescript title="main.ts"
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const config = new DocumentBuilder().setTitle('Orders API').build();
SwaggerModule.setup('docs', app, () =>
  SwaggerModule.createDocument(app, config),
);

```

Swagger UI 位于 `/docs`。传递给 `@Body()`、`@Query()` 和 `@Param()` 的 Zod **模式** 成为文档的 **请求** 体和参数，并且 [CLI plugin](/openapi/cli-plugin) 从 TypeScript 源代码读取 **DTO** 类和返回类型，因此大多数路由不需要额外的 **装饰器**。使用 `@ApiResponse()` 及其简写来记录 **响应**，在插件无法推断时使用。参见 [OpenAPI](/openapi/introduction)。

#### 测试

`TestClient` 配合 `app.dependency_overrides` 成为一个包含 `overrideProvider()` 的测试 **模块**，请求使用 [Supertest](https://github.com/ladjs/supertest)：

```typescript title="test/orders.e2e-spec.ts"
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { OrdersRepository } from '../src/orders/orders.repository.js';

describe('Orders', () => {
  let app: INestApplication;
  const ordersRepository = { findForCustomer: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OrdersRepository)
      .useValue(ordersRepository)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('answers 404 for an unknown order', async () => {
    ordersRepository.findForCustomer.mockResolvedValue(undefined);
    await request(app.getHttpServer())
      .get('/orders/7c9e6679-7425-40de-944b-e07fc1f90ae7')
      .expect(404);
  });
});

```

`overrideProvider()` 在所有注入它的地方替换一个 **提供者**，就像 `dependency_overrides` 中的条目替换一个依赖项一样。新项目使用 [Vitest](https://vitest.dev/) 作为测试运行器，替代 pytest。参见 [Testing](/fundamentals/testing)。

#### 有何不同

上述映射适用于结构。以下是改变您编写代码的方式的差异。

**类型不进行验证。** FastAPI 和 Pydantic 在运行时读取类型注解，因此参数的类型即是其验证。TypeScript 的类型在代码编译时被擦除。它们检查您的代码，而不是数据：**请求** 体、**查询** 参数、数据库行或队列消息都是发送时的样子，直到 **模式** 检查它。

**依赖项只解析一次，而不是每次 **请求**。** FastAPI 调用每次 **请求** 的依赖函数。Nest 在应用程序启动时创建其 **提供者**，并将相同的实例传递给每次 **请求**。这样更便宜，这意味着 **提供者** 的字段不应保留每次 **请求** 的状态。每次 **请求** 的值来自处理程序的参数、来自 `@CurrentUser()` 或来自 `AsyncLocalStorage`。参见 [Async local storage](/recipes/async-local-storage)。

**类和 **模块**，而不是函数。** FastAPI 应用程序可以保持扁平的函数集合。Nest 期望 **控制器** 和 **提供者** 作为类，分组到 **模块** 中，**模块** 列出其包含和导出的内容。这更早地建立结构，这也是保持大型应用程序可导航性的关键。

**同步代码没有线程池。** FastAPI 在线程池中运行一个 `def` 路径操作，因此阻塞代码不会阻塞事件循环。Node.js 没有这样的逃逸方式：您的所有代码都在事件循环上运行，CPU 密集型工作，例如调整图像大小或长时间循环，会阻塞进程中的每个 **请求**。将其移至 [queue](/techniques/queues) 或工作线程。等待 I/O 不会阻塞任何内容，因为每个驱动都是异步的。

**每个核心一个进程。** `uvicorn --workers 4` 启动了四个进程。Node.js 进程也为您的代码使用一个核心，因此请在负载均衡器后运行多个进程或容器。

**数字是双精度浮点数。** JavaScript 的 `number` 是 64 位浮点数，没有 `Decimal`。将金钱保留为整数分，或使用十进制库和数据库的 `numeric` 类型，大多数驱动程序将其返回为字符串。

**ES **模块** 和 npm。** Nest** 12 包是 ES **模块**，生成的 ESM 项目导入本地文件时使用 `.js` 扩展名，即使来自 `.ts` 文件，因为这是编译文件的名称。npm 和 `package.json` 取代了 pip 或 uv 和 `pyproject.toml`，而 `tsc` 或 [SWC](/recipes/swc) 在运行前编译代码。参见 [ESM packages](/migration-guide#esm-packages)。