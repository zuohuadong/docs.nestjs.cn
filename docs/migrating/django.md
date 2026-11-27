<!-- 此文件从 content/migrating/django.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:15:57.151Z -->
<!-- 源文件: content/migrating/django.md -->
<!-- 源哈希: 6b1787412c41fc2e9fa0bc11a3156fab -->

### 来自 Django

Nest 涵盖了 Django 开发者在后端会使用的绝大多数功能：应用变为 **模块**，视图变为 **控制器**，序列化器变为经过 **验证** 的 **DTO**，而登录、权限、邮件、文件存储、翻译、后台 **任务**、缓存和 **速率限制** 则来自第一方包。变化的是语言 **TypeScript**、运行时 **Node.js**，以及一个习惯：Nest 被拆分成需要安装和导入的包，它不自带 ORM 和管理后台。

本页面将 Django 和 Django REST Framework 的概念映射到其 Nest 等效项，并提供简短的代码并排对比。它以 [what's different](/migrating/django#whats-different) 结束，这比语法更重要。

#### 概览

| Django | Nest | 阅读更多 |
| --- | --- | --- |
| `django-admin startproject`, `manage.py runserver` | `nest new`, `npm run start:dev` | [First steps](/first-steps) |
| 应用和 `INSTALLED_APPS` | **模块** 及其 `imports` | [Modules](/modules) |
| 模型和 `makemigrations` / `migrate` | Drizzle 或 TypeORM **模式** 及其 **迁移** 工具 | [Drizzle](https://docs.nestjs.com/data/drizzle), [TypeORM](/recipes/sql-typeorm) |
| 视图、视图集和 `urls.py` | 使用路由 **装饰器** 的 **控制器** | [Controllers](/overview/controllers) |
| 表单和 DRF 序列化器 | **管道**，使用 class-validator **DTO** 或 Zod 等标准 **模式** | [Validation](/techniques/validation) |
| 使用序列化器塑造 **响应** | 返回一个纯对象，或 `ClassSerializerInterceptor` | [Serialization](/application/serialization) |
| **中间件** | **中间件**、**守卫** 和 **拦截器** | [Middleware](/overview/middlewares) |
| `django.contrib.auth`、**会话**、`login_required` | `@nestjs/authentication` | [Authentication](/security/authentication) |
| 权限、DRF 权限类 | `@nestjs/authorization` 策略 | [Authorization](/security/authorization) |
| `settings.py` 和 **环境变量** | `@nestjs/config` | [Configuration](/application/configuration) |
| `send_mail()`, `EmailMessage` | `@nestjs/mail` | [Mail](/application/mail) |
| `default_storage`, django-storages | `@nestjs/storage` | [File storage](/application/file-storage) |
| `gettext`, `.po` 文件, `LocaleMiddleware` | `@nestjs/i18n` | [Internationalization](/application/i18n) |
| Celery **任务** | `@nestjs/bullmq` | [Queues](/techniques/queues) |
| Celery beat | `@nestjs/schedule`，使用 `@nestjs/locks` | [Task scheduling](/techniques/task-scheduling) |
| 信号 | `@nestjs/event-emitter` | [Events](/application/events) |
| `transaction.on_commit()` | `@nestjs/outbox` | [Outbox](/reliability/outbox) |
| 缓存框架，`cache_page` | `@nestjs/cache-manager` | [Caching](/data/caching) |
| DRF **节流** | `@nestjs/throttler` | [Rate limiting](/security/rate-limiting) |
| `CsrfViewMiddleware` | `app.enableCsrfProtection()` | [CSRF protection](/security/csrf) |
| 模板和 `render()` | 一个视图引擎和 `@Render()` | [Model-View-Controller](/http/mvc) |
| 管理命令、`manage.py shell` | **独立应用程序**、nest-commander、REPL | [Standalone applications](/standalone-applications) |
| `TestCase`, `APIClient` | `@nestjs/testing` 和 Supertest | [Testing](/fundamentals/testing) |
| drf-spectacular | `@nestjs/swagger` | [OpenAPI](/openapi/introduction) |
| Django Channels | **网关** | [Gateways](/websockets/gateways) |
| 管理后台 | 没有等效项 | [The admin](/migrating/django#the-admin) |

#### 启动项目

`django-admin startproject` 创建一个项目，`manage.py startapp` 添加一个应用。Nest CLI 同时完成这两项工作：

```bash
$ npm i -g @nestjs/cli
$ nest new orders-api
$ cd orders-api
$ nest generate resource orders

```

`npm run start:dev` 启动应用程序，并在文件更改时重启，就像 `runserver` 一样。`nest generate resource orders` 创建一个包含 **控制器**、**服务**、**DTO** 和测试文件的 **模块**，这是最接近 `startapp` 加上 DRF 视图集的实现。参见 [CLI usages](/cli/usages)。

Nest 应用程序的入口点是 `main.ts`，它同时扮演了 `manage.py runserver` 和 `wsgi.py` 的角色：

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

#### 应用变为模块

Django 项目在其 `INSTALLED_APPS` 中列出应用，Django 通过约定找到它们的模型、URL 和模板。Nest 应用程序是一个 **模块** 的树，每个 **模块** 都列出了其包含的内容：

```typescript title="orders/orders.module.ts"
import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}

```

根 **模块** 导入功能 **模块**，就像 `INSTALLED_APPS` 列出应用一样：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { OrdersModule } from './orders/orders.module.js';
import { ProductsModule } from './products/products.module.js';

@Module({
  imports: [OrdersModule, ProductsModule],
})
export class AppModule {}

```

不会有自动发现。未在 **模块** 的 `controllers` 中列出的 **控制器** 不会提供任何路由，未列出的 **提供者** 也无法被注入。

**模块** 也是 Django 应用所没有的边界。在 Django 中，任何应用都可以导入任何其他应用的模型。在 Nest 中，除非 **模块** 在 `exports` 中列出它，并且另一个 **模块** 将该 **模块** 添加到其 `imports` 中，否则 **提供者** 仅在其自身的 **模块** 内部可见。参见 [Modules](/modules)。

##### 服务和 **依赖注入**

Django 没有 **依赖注入**：视图导入它需要的模型和函数。Nest 代码存在于使用 `@Injectable()` **装饰器** 装饰的 **提供者** 类中，Nest 会创建它们并将它们传递给请求它们的构造函数：

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

构造函数中的 `private readonly` 一步完成声明和赋值。Django 项目将业务逻辑放在臃肿的模型或 `services.py` 中的代码放在此类 **提供者** 中，测试可以在不打补丁导入的情况下替换其任何依赖项。参见 [Providers](/overview/providers)。

#### 模型和 **迁移**

Nest 没有自己的 ORM。其第一方集成包括 [Drizzle](https://docs.nestjs.com/data/drizzle)，其中 **模式** 是 TypeScript 并且查询看起来像 SQL，以及 [TypeORM](/recipes/sql-typeorm)，其中模型是装饰器类，更接近 Django 的风格。[Prisma](/recipes/prisma)、[MikroORM](/data/mikroorm) 和 [Mongoose](/techniques/mongo) 也可以使用。

一个 Django 模型：

```python
# orders/models.py
class Order(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending"
        PAID = "paid"
        SHIPPED = "shipped"

    customer = models.ForeignKey(Customer, on_delete=models.CASCADE)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.PENDING
    )
    total_cents = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

```

使用 Drizzle 的相同表：

```typescript title="database/schema.ts"
import { integer, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

export const orderStatus = pgEnum('order_status', [
  'pending',
  'paid',
  'shipped',
]);

// `customers` is declared in this file too.
export const orders = pgTable('orders', {
  id: uuid().primaryKey().defaultRandom(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  status: orderStatus().notNull().default('pending'),
  totalCents: integer('total_cents').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type Order = typeof orders.$inferSelect;

```

`makemigrations` 变为 `npx drizzle-kit generate`，后者根据 **模式** 的变更生成 SQL **迁移** 文件，而 `migrate` 变为 `npx drizzle-kit migrate`。使用 TypeORM 时，`migration:generate` 和 `migration:run` 执行相同操作。参见 [Migrations](https://docs.nestjs.com/data/drizzle#迁移)。

在根 **模块** 中仅注册一次数据库：

```typescript title="app.module.ts"
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './database/schema.js';

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      useFactory: () => ({
        drizzle,
        connection: process.env.DATABASE_URL!,
        schema,
      }),
    }),
  ],
})
export class AppModule {}

```

查询通过注入的数据库进行。`Order.objects.filter(customer_id=..., status="pending")` 变为：

```typescript title="orders/orders.repository.ts"
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { orders } from '../database/schema.js';

@Injectable()
export class OrdersRepository {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  findPending(customerId: string) {
    return this.db
      .select()
      .from(orders)
      .where(
        and(eq(orders.customerId, customerId), eq(orders.status, 'pending')),
      )
      .orderBy(desc(orders.createdAt));
  }
}

```

当 `await` 时执行查询。没有模板稍后评估的惰性 `QuerySet`，因此不会意外查询数据库，N+1 问题会出现在您自己的代码中，您可以在其中看到：使用 `join` 或 Drizzle 的关系查询加载相关行，如 `select_related()` 和 `prefetch_related()` 所示。参见 [Relations](https://docs.nestjs.com/data/drizzle#关联关系)。

`transaction.atomic()` 变为一个回调。其查询在解析时提交，在抛出时回滚：

```typescript title="orders/orders.repository.ts"
async place(customerId: string, items: NewOrderItem[]) {
  return this.db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({ customerId, totalCents: sumOf(items) })
      .returning();
    await tx
      .insert(orderItems)
      .values(items.map((item) => ({ ...item, orderId: order.id })));
    return order;
  });
}

```

属于事务的查询通过 `tx` 而不是通过注入的数据库运行。参见 [Drizzle transactions](https://docs.nestjs.com/data/drizzle#drizzle-transactions)。

#### 视图和 URL 变为控制器

一个 Django REST Framework viewset 及其路由：

```python
# orders/views.py
class OrderViewSet(viewsets.ModelViewSet):
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Order.objects.filter(customer=self.request.user.customer)

# urls.py
router = DefaultRouter()
router.register("orders", OrderViewSet, basename="order")
urlpatterns = [path("api/", include(router.urls))]

```

在 Nest 中，**控制器** 使用装饰器声明其路由，因此没有 `urls.py`：

```typescript title="orders/orders.controller.ts"
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import type { User } from '../users/user.js';
import { CreateOrderDto } from './create-order.dto.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.ordersService.findForCustomer(user.id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findOne(user, id);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateOrderDto) {
    return this.ordersService.place(user, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  cancel(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.cancel(user, id);
  }
}

```

区别如下：

- `@Controller('orders')` 是 URL 前缀，每个方法装饰器添加一个路径。路由参数使用 `:id` 编写，而 Django 使用角括号中的路径转换器。全局前缀如 `api` 使用 `app.setGlobalPrefix('api')` 一次设置。
- 路由和查询参数作为字符串到达。像 `ParseUUIDPipe` 或 `ParseIntPipe` 这样的 **管道** 会转换和检查其中一个，类似于路径转换器。
- `POST` 处理程序默认响应 `201 Created`，而其他所有方法都响应 `200 OK`。`@HttpCode()` 会改变这一点。
- 处理程序返回主体，Nest 将其序列化为 JSON。处理程序可以是 `async`。没有用于构建的 `Response` 对象：使用 `@Header()` 设置头部，并为错误状态抛出异常。
- `get_object_or_404()` 在 **服务** 中变为 `throw new NotFoundException()`。`HttpException` 及其子类，如 `ConflictException` 和 `ForbiddenException`，会带有状态的 JSON 错误响应。任何其他异常都成为一个 `500`。参见 [Exception filters](/overview/exception-filters)。
- 使用 `@nestjs/authentication`，除非标记为 `@Public()`，否则每个路由都需要已登录用户，因此 `IsAuthenticated` 是默认设置而不是配置。参见 [Users, sign-in and permissions](/migrating/django#users-sign-in-and-permissions)。

没有通用的 viewsets：上述五个方法就是一个 `ModelViewSet` 的全部，是写出来的。`nest generate resource` 为您编写了这些样板代码。分页和过滤是您读取并传递给查询的参数。

#### 序列化器变为 DTO 和管道

DRF 序列化器用于验证输入和塑形输出。在 Nest 中，这是两个独立的工作。

输入由**管道**进行验证。使用 Zod 等 [Standard Schema](https://standardschema.dev/) 库描述主体，参数的类型从模式中推断出来：

```python
# orders/serializers.py
class OrderItemSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1, max_value=20)

class CreateOrderSerializer(serializers.Serializer):
    items = OrderItemSerializer(many=True, allow_empty=False)
    note = serializers.CharField(max_length=500, required=False)

```

与 Zod 模式相同的规则，这也提供了 DTO 的类型：

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

export type CreateOrderDto = z.infer<typeof createOrderSchema>;

```

为整个应用程序绑定 `StandardSchemaValidationPipe` 一次，并使用 `@Body()` 的 `schema` 选项传递模式：

```typescript title="orders/orders.controller.ts"
@Post()
create(
  @CurrentUser() user: User,
  @Body({ schema: createOrderSchema }) dto: CreateOrderDto,
) {
  return this.ordersService.place(user, dto);
}

```

无效的主体会得到一个 `400 Bad Request`，其中列出了每个失败的规则，就像 `serializer.is_valid(raise_exception=True)` 所做的那样。或者，使用带有 [class-validator](https://github.com/typestack/class-validator) 装饰器的类来编写 DTO，并绑定 `ValidationPipe`。这更接近声明式的序列化器类。有关管道，请参阅 [Validation](/techniques/validation)。

> 警告 **警告** TypeScript 类型在运行时不存在，因此仅有类型注解无法验证任何内容。如果没有验证 **管道**，`@Body() dto: CreateOrderDto` 将接收客户端发送的任何 JSON。全局绑定其中一个 **管道**。

输出不需要序列化器。处理程序返回一个纯对象，其 JSON 即为响应。要排除一个字段，例如密码哈希，不要选择它，或返回不包含它的对象。如果您的处理程序返回类实例，`ClassSerializerInterceptor` 应用来自 class-transformer 的 `@Exclude()` 和 `@Expose()`，这是最接近序列化器 `fields` 的东西。参见 [Serialization](/application/serialization)。

#### 中间件、守卫和拦截器

Django **中间件** 包装整个 **请求**。Nest 将该角色分解为按此顺序运行的组件：

| Nest | 运行时间 | Django 对应项 |
| --- | --- | --- |
| [Middleware](/overview/middlewares) | 路由前，带有原始 **请求** 和 **响应** | **中间件** 的 `process_request` |
| [Guards](/overview/guards) | 路由后，决定是否运行处理程序 | `login_required`，DRF 权限类 |
| [Interceptors](/overview/interceptors) | 围绕处理程序，可访问其结果 | 包装 `get_response` 的 **中间件**，视图上的装饰器 |
| [Pipes](/pipes) | 在每个参数上，处理程序之前 | 表单和序列化器验证 |
| [Exception filters](/overview/exception-filters) | 当上述任何内容抛出时 | **中间件** 的 `process_exception`，DRF 的异常处理程序 |

**守卫** 和 **拦截器** 知道将运行哪个 **控制器** 和方法，而 Django **中间件** 不知道，因此它们可以读取处理程序上的装饰器，例如 `@Public()`。

#### 用户、登录和权限

`django.contrib.auth` 为项目提供了一个 `User` **实体** 模型、密码哈希、**会话** 和权限表。`@nestjs/authentication` 提供登录部分，将用户留给您。

- **用户是您的表**。该包从不读取它。它通过 id 从您的代码请求用户，您的用户是您的应用程序定义的任何类型。没有可扩展的 `AbstractUser` 也没有可替换的 `AUTH_USER_MODEL`。
- **密码** 使用 `PasswordHasher` 进行哈希，使用 OWASP 的 scrypt 参数，具有 `make_password()` 和 `check_password()` 的角色。`verify()` 对未知电子邮件花费的时间与错误密码相同，而 `needsRehash()` 会告诉您何时升级旧哈希，就像 Django 在登录时所做的那样。
- **会话** 是服务器端的，存储在安全的 `HttpOnly` **Cookie** 中，类似于带有数据库后端的 `django.contrib.sessions`。`SignInService.signIn()` 是 `login()` 的对应项。该包通过您针对其接口实现的存储在您的数据库中维护 **会话**，而 Django 会为您创建表。
- **每个路由在模块注册时就关闭**。`@Public()` 打开一个，这反转了 `login_required`。`@CurrentUser()` 注入用户，就像 `request.user` 一样。
- **Django 留给 django-allauth 的流程** 已随该包提供：电子邮件验证、密码重置链接、TOTP 双因素认证、魔术链接、使用 Google 和其他 OpenID Connect **提供者** 登录、访问和刷新令牌以及 API 密钥。

[Authentication](/security/authentication) 中的教程逐步构建了注册和登录。

权限是代码，而不是行。Django 为每个模型存储 `add_order`、`change_order` 等，将它们分配给组，并使用 `has_perm()` 进行检查。`@nestjs/authorization` 取代了这些，以及 DRF 的权限类，使用**策略**：其方法决定用户是否可以执行某项操作的类。

```python
# orders/permissions.py
class IsOrderOwnerOrStaff(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        user = request.user
        return user.is_staff or obj.customer_id == user.customer.id

```

与策略相同的检查，旁边有一个仅限员工的退款：

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

只需要用户的检查在带有`@Can(OrderPolicy, 'refund')`的路由上。需要记录的检查，即`has_object_permission()`的对应项，在加载记录后在服务中执行：

```typescript title="orders/orders.service.ts"
async findOne(user: User, id: string) {
  const order = await this.ordersRepository.findById(id);
  if (!order) {
    throw new NotFoundException();
  }
  await this.authorizationService.authorize(OrderPolicy, 'view', user, order);
  return order;
}

```

当策略拒绝时，`authorize()` 抛出，这回答了`403`，或者对访客回答了`401`。与认证**守卫**一样，授权**守卫**默认拒绝，因此声明没有检查的路由是关闭的。角色和组是用户字段的一部分，存储方式由您的应用程序决定。参见[Authorization](/security/authorization)，以及关于组织、成员和角色的[multi-tenant SaaS tutorial](/tutorials/multi-tenant-saas)。

#### 设置变为配置

`settings.py` 是在启动时运行的 Python 代码，通常读取`os.environ`。`@nestjs/config` 读取`.env` 文件和**环境变量**，其中**环境变量**优先于文件，并在应用程序启动前验证它们：

```typescript title="app.module.ts"
import { ConfigModule } from '@nestjs/config';
import { z } from 'zod';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: z.object({
        DATABASE_URL: z.url(),
        SMTP_URL: z.url(),
        DEBUG: z.stringbool().default(false),
      }),
    }),
  ],
})
export class AppModule {}

```

使用`ConfigService.get()` 读取设置，或使用`getOrThrow()` 读取必需的设置，其中 Django 代码导入`settings`。没有全局设置对象：需要配置的每个**模块**注入`ConfigService` 或使用`registerAs()` 创建的类型化**配置命名空间**。参见[Configuration](/application/configuration)。

#### 邮件

`send_mail()` 和 `EmailMessage` 成为来自`@nestjs/mail` 的`Mailer`。邮件是一个渲染主题和模板的类，是`render_to_string()` 后面跟着`send_mail()` 的对应项：

```python
# orders/emails.py
def send_order_confirmation(order):
    html = render_to_string("emails/order_confirmation.html", {"order": order})
    send_mail(
        f"Your order #{order.number}",
        strip_tags(html),
        None,
        [order.customer.email],
        html_message=html,
    )

```

在 Nest 中，邮件类返回主题、模板名称以及模板读取的值：

```typescript title="notifications/order-confirmation.mail.ts"
import { Injectable } from '@nestjs/common';
import type { Mailable } from '@nestjs/mail';
import type { Order } from '../orders/order.js';

@Injectable()
export class OrderConfirmationMail implements Mailable<{ order: Order }> {
  render({ order }: { order: Order }) {
    return {
      subject: `Your order #${order.number}`,
      template: 'order-confirmation',
      context: { order },
    };
  }
}

```

一个**服务**使用`mailer.send()` 发送它，而`data` 的类型来自邮件类：

```typescript title="orders/orders.service.ts"
await this.mailer.send(OrderConfirmationMail, {
  to: { name: customer.name, address: customer.email },
  data: { order },
});

```

模板会转义每个值，就像 Django 一样。`FileMailTransport` 在开发环境中将每封邮件写入文件，例如邮件后端文件，而在生产环境中，SMTP 和 Resend **传输器**发送它。在测试中，`InMemoryMailTransport` 保留每封邮件，例如`django.core.mail.outbox`。参见[Mail](/application/mail)。

#### 文件

`default_storage` 和 django-storages 成为来自`@nestjs/storage` 的**磁盘**：一个本地文件夹、S3 或一个 S3 兼容的存储，如 R2，通过一个 API 提供。`default_storage.save()` 成为`put()`，`.url()` 保持 `url()`，签名的 S3 链接是`signedUrl()`：

```typescript title="invoices/invoices.service.ts"
import { Injectable } from '@nestjs/common';
import { InjectDisk, StorageDisk } from '@nestjs/storage';

@Injectable()
export class InvoicesService {
  constructor(@InjectDisk('private') private readonly files: StorageDisk) {}

  async store(orderId: string, pdf: Buffer) {
    const key = `invoices/${orderId}.pdf`;
    await this.files.put(key, pdf, { contentType: 'application/pdf' });
    return this.files.signedUrl(key, { expiresIn: '15m' });
  }
}

```

上传直接通过`uploadToDisk()` 流式传输到磁盘，而不是像`FileField` 上传那样通过内存传递。参见[File storage](/application/file-storage)。

#### 翻译

`gettext` 和 `.po` 文件成为`@nestjs/i18n`，每个区域设置和**模块**都有一个 JSON 目录。`_("Order not found")` 成为一个类型化键，因此拼写错误的键会编译失败：

```typescript title="orders/orders.service.ts"
throw new NotFoundException(this.i18n.t('orders.notFound', { args: { id } }));

```

复数遵循每种语言的规则，如`ngettext()`。区域设置来自`Accept-Language` 头部、查询参数、**Cookie**或用户的保存语言，这是`LocaleMiddleware` 的工作，验证消息和异常也会被翻译。参见[Internationalization](/application/i18n)。

#### 后台任务、调度和信号

Celery 任务成为 BullMQ **队列**上的一个 **Job**，该 **Job** 在 Redis 上运行：

```python
# orders/tasks.py
@shared_task
def generate_invoice(order_id):
    ...

generate_invoice.delay(order.id)

```

在 Nest 中，一个处理器类接收 **队列** 的 **Job**：

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

一个**服务**将 **Job** 添加到它注入的 **队列** 中，就像 Celery 中的`delay()` 所做的那样：

```typescript title="orders/orders.service.ts"
// constructor(@InjectQueue('invoices') private readonly invoices: Queue) {}
await this.invoices.add('generate', { orderId: order.id });

```

处理器是一个**提供者**，因此它像任何其他类一样注入**服务**。工作进程在应用程序进程中运行，或在启动相同**模块**的单独进程中运行。参见[Queues](/techniques/queues)。

Celery beat 成为来自`@nestjs/schedule` 的`@Cron()`，在任何**提供者**的方法上。一个计划方法在应用程序的每个实例上运行，因此从`@nestjs/locks` 添加`@OnOneInstance()`，其中只有一个实例应该运行它。参见[Task scheduling](/techniques/task-scheduling) 和 [Distributed locks](/reliability/locks)。

信号变为事件：来自`@nestjs/event-emitter` 的`EventEmitter2.emit()` 和 `@OnEvent()`。没有像`post_save` 这样的模型信号，因为没有模型层来发送它们。从保存行的**服务**中发出一个事件。参见[Events](/application/events)。

`transaction.on_commit()` 是在订单保存后发送邮件或排队 **Job** 的常规方式。`@nestjs/outbox` 更进一步：它在与订单相同的事务中写入消息，并在提交后交付，直到发送完成，即使过程中进程停止也会重试。参见[Outbox](/reliability/outbox)。

#### 缓存、速率限制和 CSRF

- **缓存**：`@nestjs/cache-manager` 提供一个带有`get()`、`set()` 和 `del()` 的可注入缓存，类似于`django.core.cache`，并且`CacheInterceptor` 缓存**响应**，类似于`cache_page`。参见[Caching](/data/caching)。
- **速率限制**：`@nestjs/throttler` 限制每个客户端和时间窗口的 **请求**，类似于 DRF 的节流类，每个路由都有`@Throttle()` 和 `@SkipThrottle()`。参见[Rate limiting](/security/rate-limiting)。
- **CSRF**：`app.enableCsrfProtection()` 拒绝来自其他源的状态更改 **请求**，通过`Sec-Fetch-Site` 和 `Origin` 头部判断，因此表单和 API 客户端不需要令牌。参见[CSRF protection](/security/csrf)。

#### 模板

大多数 Nest 应用程序是 API，页面由前端渲染。要像 Django 视图那样在服务器上渲染 HTML，请设置一个视图引擎，例如 Handlebars，并从装饰有`@Render()`的处理器返回模板的上下文：

```typescript title="products/products.controller.ts"
@Get(':slug')
@Render('products/detail')
findOne(@Param('slug') slug: string) {
  return this.productsService.findBySlug(slug);
}

```

参见[Model-View-Controller](/http/mvc)。

#### 管理命令和 Shell

一个管理命令成为一个启动应用程序**模块**但不启动 HTTP 服务器的脚本，即一个**独立应用程序**：

```typescript title="scripts/close-stale-carts.ts"
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { CartsService } from '../carts/carts.service.js';

const app = await NestFactory.createApplicationContext(AppModule);
await app.get(CartsService).closeStale();
await app.close();

```

对于带有参数、选项和帮助文本的命令，如`BaseCommand` 所示，请使用[nest-commander](/recipes/nest-commander)。`manage.py shell` 成为[REPL](/recipes/repl)，其中应用程序的每个**提供者**都可用：`await get(OrdersService).findOne(...)`。参见[Standalone applications](/standalone-applications)。

#### 管理员

Nest 没有管理员界面。这是 Django 电池中没有对应部分的组件，也是运行后端管理系统的团队最大的不同点。通常的选项有：

- 第三方管理面板。[AdminJS](https://adminjs.co/) 有 Nest 集成。
- 数据库 GUI，供只浏览和修复行的用户使用。
- 前端中的内部页面，使用与应用程序其余部分相同的 API 和策略，保持一个权限模型。

#### 测试

Django 的`TestCase` 和 `APIClient` 变成了一个测试**模块**和[Supertest](https://github.com/ladjs/supertest)。此测试仅创建**控制器**，并使用一个模拟的**服务**：

```typescript title="orders/orders.controller.spec.ts"
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { vi } from 'vitest';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

describe('OrdersController', () => {
  let app: INestApplication;
  const ordersService = { findForCustomer: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: ordersService }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('lists orders', async () => {
    ordersService.findForCustomer.mockResolvedValue([]);
    await request(app.getHttpServer()).get('/orders').expect(200, []);
  });
});

```

要测试整个应用程序，导入`AppModule` 并用`overrideProvider()` 替换**提供者**。Nest 不像 Django 的测试运行器那样为你创建测试数据库：将`DATABASE_URL` 指向测试数据库，在测试运行前应用**迁移**，并在测试之间清空表。新项目使用[Vitest](https://vitest.dev/) 作为测试运行器。参见[Testing](/fundamentals/testing)。

#### OpenAPI 和健康检查

drf-spectacular 变为`@nestjs/swagger`，它从**控制器**、**DTO** 和 Zod **模式**构建文档，并提供 Swagger UI，这是 DRF 可浏览 API 的对应部分。参见[OpenAPI](/openapi/introduction)。

健康端点来自`@nestjs/terminus`，提供数据库、HTTP 依赖、磁盘和内存的指示器。参见[Health checks](/recipes/terminus)。有关正在运行应用程序的跟踪、错误和指标，参见[NestJS Observe](/observability/overview)。

#### 有何不同

上述映射适用于结构。以下是改变你编写代码的方式的差异。

**一个进程同时服务多个** **请求**。Django 部署在 Gunicorn 或 uWSGI 下运行多个工作进程或线程，每个进程一次只处理一个**请求**。Node.js 在一个线程上运行你的代码，当一个**请求**等待数据库时，其他**请求**会运行。数据库驱动程序和 HTTP 客户端是异步的，因此 I/O 是被**增强器**的，就像 Django 的异步视图一样，但无处不在。忘记的`await` 不会阻塞：它允许代码在查询完成之前继续执行。处理程序中的 CPU 密集型工作，例如调整图像大小，会阻塞进程中的其他所有**请求**，因此将其移至[queue](/techniques/queues) 或工作线程，并运行多个进程或容器以利用多个核心。

**无线程本地** **请求**。除处理程序外的代码无法通过全局变量访问**请求**。将用户传递给**服务**，或从`AsyncLocalStorage` 读取每个**请求**的状态，该状态会通过`await` 跟踪**请求**。参见[Async local storage](/recipes/async-local-storage)。

**一切都明确连接**。Django 通过约定查找模型、管理类、管理命令和模板，应用一旦在`INSTALLED_APPS` 中运行即可工作。在 Nest 中，安装包不会配置任何内容，文件存在也不会运行任何内容：每个**模块**都会被导入，并且会列出每个**控制器**和**提供者**。应用程序在启动时做什么可以从其**模块**中读取。

**电池是独立包**。Django 是一个整体包，作为一个整体发布。Nest 的核心和每个第一方包都使用 npm 分别安装，因此项目只携带它使用的部分。将它们一起升级，因为它们是为同一主要版本的 Nest 发布的。

**类型是编译时检查**。类型注解描述了你期望的形状，编译器会根据它检查你的代码。它不会在运行时检查任何内容：**请求**体、原始查询的数据库行或**队列**消息就是发送的内容。只有[validation pipe](/techniques/validation) 或**模式**会在边界处检查数据。

**装饰器是函数**。`@Controller()` 和 `@Injectable()` 看起来像 Python **装饰器**，它们也是函数，但它们不包装类：它们记录了 Nest 在应用程序启动时读取的元数据。**依赖注入**读取 TypeScript 编译器记录的构造函数参数类型（`emitDecoratorMetadata`），这是生成项目为你启用的。

**数字是双精度浮点数**。JavaScript 的`number` 是 64 位浮点数，没有`Decimal`。将金钱存储为整数分，或使用十进制库和数据库的`numeric` 类型，大多数驱动程序将其返回为字符串。

**ES 模块和 npm**。Nest 12 包是 ES 模块，生成的 ESM 项目会使用`.js` 扩展名导入本地文件，即使是从`.ts` 文件导入，因为这是编译后文件的名称。npm 和`package.json` 取代了 pip 和`requirements.txt` 或 `pyproject.toml`，而`tsc` 或[SWC](/recipes/swc) 在代码运行前编译代码。参见[ESM packages](/migration-guide#esm-packages)。