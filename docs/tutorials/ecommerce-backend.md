<!-- 此文件从 content/tutorials/ecommerce-backend.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:56:53.615Z -->
<!-- 源文件: content/tutorials/ecommerce-backend.md -->
<!-- 源哈希: d8e86ce62ed8b8481a19870cd4d1f4b0 -->

### 使用 Node.js 构建一个电子商务后端

使用 NestJS 和 PostgreSQL 在 Node.js 中构建一个电子商务后端：产品目录、购物车和永不超卖库存的结账流程。

该商店有一个由员工管理的**产品**目录，每个客户都有一个购物车，并且结账流程会将购物车转换为**订单**，而绝不会卖出超过库存量。大多数电子商务后端是普通的 CRUD 操作。非普通的部分是金钱和库存的变动发生的地方，因此本教程将重点介绍这些部分：以整数分存储价格、将价格冻结到每个**订单**中、在检查库存的同一**语句**中扣减库存，以及在客户双击或一千个客户争抢最后一个**产品**时安全的结账流程。

到最后，API 将具备以下功能：

- 允许任何人浏览和搜索目录，只有员工可以创建和编辑**产品**，使用 [`@nestjs/authorization`](/security/authorization)，该**装饰器**拒绝任何未声明调用者的路由。
- 为每个客户维护一个购物车，按当日价格定价，并显示当前无法购买的商品行。
- 在一个数据库**事务**中完成结账：获取购物车、扣减库存、记录价格，或完全不更改任何内容。
- 允许客户取消尚未发货的**订单**，从而将库存放回，并允许员工发货。
- 通过针对 PostgreSQL 的测试证明，十个客户争抢最后一个单位时，只会产生一个**订单**。

它从 [Build a REST API with JWT authentication](/tutorials/rest-api-jwt-authentication) 的 API 开始，该 API 使用访问令牌和刷新令牌登录用户，使用 Zod **验证****请求**，并通过 Drizzle 在 PostgreSQL 中保存数据。本教程不再解释这些部分。

以下是**端点**及其添加每个**端点**的**模块**部分：

| **端点** | **模块**部分 |
| --- | --- |
| `POST /auth/sign-up`, `POST /auth/token`, `POST /auth/token/refresh`, `POST /auth/token/revoke`, `GET /me`, `GET /health/live`, `GET /health/ready` | [Start from the JWT API](/tutorials/ecommerce-backend#start-from-the-jwt-api) |
| `GET /products`, `GET /products/:id`, `POST /products`, `PATCH /products/:id` | [Let staff manage the catalog](/tutorials/ecommerce-backend#let-staff-manage-the-catalog) |
| `GET /cart`, `PUT /cart/items/:productId`, `DELETE /cart/items/:productId` | [Keep a cart](/tutorials/ecommerce-backend#keep-a-cart) |
| `POST /orders`, `GET /orders`, `GET /orders/:id` | [Check out without overselling](/tutorials/ecommerce-backend#check-out-without-overselling) |
| `POST /orders/:id/cancel`, `POST /orders/:id/ship` | [Cancel and ship orders](/tutorials/ecommerce-backend#cancel-and-ship-orders) |

> info **提示** 完成的应用在 GitHub 上是 [nestjs/example-ecommerce-backend](https://github.com/nestjs/example-ecommerce-backend)，包含其测试和 CI 工作流。

#### 从 JWT API 开始

创建项目，并安装本教程使用的所有内容。这些是 JWT 教程的包加上 `@nestjs/authorization`。`nest new` 还安装了 [NestJS Observe SDK](/observability/sdk)、`@nestjs/observe`，并将其连接起来；应用程序自身的**文件**包含它：

```bash
$ npm i -g @nestjs/cli
$ nest new shop-api --minimal
$ cd shop-api
$ npm uninstall @nestjs/platform-express @types/express
$ npm i --save @nestjs/platform-node zod @nestjs/config @nestjs/drizzle drizzle-orm@rc pg @nestjs/authentication @nestjs/authorization @nestjs/throttler @nestjs/swagger @nestjs/terminus
$ npm i --save-dev drizzle-kit@rc @types/pg @nestjs/testing vitest vite

```

然后从 [finished JWT tutorial](/tutorials/rest-api-jwt-authentication#sign-users-in-with-jwts) 复制这些**文件**，保持原样：

- `src/config.ts`、`src/main.ts`、`drizzle.config.ts` 和 `vitest.config.e2e.ts`
- `src/auth/`、`src/users/` 和 `src/health/` 下的所有内容
- `test/refresh-token.store.e2e-spec.ts`

忽略 `src/notes/` 和 JWT 教程中的 `drizzle/` 文件夹：本应用程序的第一个**迁移**来自其自身的**模式**，在下一节中。将注释重命名为商店的名称：`JwtAuth` 中的 `realm` 和 `main.ts` 中 OpenAPI 文档的标题。将测试脚本添加到 `package.json`：

```json
"test:e2e": "vitest run --config ./vitest.config.e2e.ts"

```

最后，在 `.env` 中添加数据库 URL 和一个 `JWT_SECRET`，就像 JWT 教程中那样，使用商店自己的数据库：

```bash
$ docker run -d --name shop-db -e POSTGRES_PASSWORD=shop -e POSTGRES_DB=shop -p 5432:5432 postgres:17

```

其 URL 放在 `.env` 中，紧邻签名密钥：

```bash
DATABASE_URL=postgres://postgres:shop@localhost:5432/shop
# Generate with: openssl rand -base64 32
JWT_SECRET=

```

客户和员工使用相同的登录方式，因此用户现在有一个**角色**：

```typescript title="src/users/user.ts"
export type Role = 'customer' | 'staff';

export interface User {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
}

```

`UsersRepository` 会将其与其他列一起返回：

```typescript title="src/users/users.repository.ts"
// ...
const columns = { id: users.id, email: users.email, role: users.role, createdAt: users.createdAt };

```

**角色**不在访问令牌中。`JwtAuth.validate()` 在每次**请求**时加载用户，因此将用户提升为员工或降级时，其生效时间是下一次**请求**，而不是令牌过期时。

#### 设计**模式**

整个**模式**在一个**文件**中。用户和刷新令牌是 JWT 教程的，只是增加了**角色**：

```typescript title="src/database/schema.ts"
import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['customer', 'staff'] }).notNull().default('customer'),
  createdAt: at('created_at').notNull().defaultNow(),
});

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    // Money in integer cents: no floating-point rounding.
    price: integer('price').notNull(),
    stock: integer('stock').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (table) => [
    check('products_price_positive', sql`${table.price} > 0`),
    // The last line of defense against overselling.
    check('products_stock_not_negative', sql`${table.stock} >= 0`),
  ],
);

export const cartItems = pgTable(
  'cart_items',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.productId] })],
);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    status: text('status', { enum: ['placed', 'shipped', 'cancelled'] }).notNull(),
    total: integer('total').notNull(),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (table) => [index('orders_user_id_created_at_idx').on(table.userId, table.createdAt)],
);

// What was bought, at the price it was bought at: later price changes don't rewrite past orders.
export const orderItems = pgTable(
  'order_items',
  {
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    name: text('name').notNull(),
    unitPrice: integer('unit_price').notNull(),
    quantity: integer('quantity').notNull(),
  },
  (table) => [primaryKey({ columns: [table.orderId, table.productId] })],
);

// What @nestjs/authentication keeps for refresh tokens, stored by their SHA-256.
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id').notNull(),
    userId: text('user_id').notNull(),
    createdAt: at('created_at').notNull(),
    expiresAt: at('expires_at').notNull(),
    familyExpiresAt: at('family_expires_at').notNull(),
    usedAt: at('used_at'),
    // A family is revoked when any of its tokens is.
    revoked: boolean('revoked').notNull().default(false),
    claims: jsonb('claims').$type<Record<string, unknown>>(),
  },
  (table) => [
    index('refresh_tokens_family_id_idx').on(table.familyId),
    index('refresh_tokens_user_id_idx').on(table.userId),
    index('refresh_tokens_family_expires_at_idx').on(table.familyExpiresAt),
  ],
);

export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;

```

- **价格是整数，以分为单位。** `19.99` 不能精确存储为浮点数，并且许多累加会产生漂移。`1999` 可以。
- ****订单**项复制**产品**的名称和价格。** 当员工更改价格或重命名**产品**时，过去的**订单**保留了客户支付的价格。
- **购物车**是一个以用户和**产品**为键的表。设置一行数量是一个 upsert 操作，并且同一个**产品**不能出现两次。
- **产品**被停用，而不是被删除。**订单**项仍然引用它们。
- **`stock`** 不能低于零。结账流程从不尝试这样做，但如果未来的更改出错，PostgreSQL 会拒绝写入，而不是存储负库存。

生成**迁移**并应用它（参见 [Migrations](https://docs.nestjs.com/data/drizzle#迁移)）：

```bash
$ npx drizzle-kit generate --name=shop
$ npx drizzle-kit migrate

```

#### 允许员工管理目录

[`@nestjs/authorization`](/security/authorization) 将权限表达为**策略**，即回答“此用户是否可以执行此操作？”的**类**。在 `AuthenticationModule` 之后注册其**模块**：两者都注册了一个全局**守卫**，并且**授权**需要**认证**设置的用户。对于商店的特性**模块**，根**模块**是：

```typescript title="src/app.module.ts"
import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthenticationModule } from '@nestjs/authentication';
import { AuthorizationModule } from '@nestjs/authorization';
import { DrizzleModule } from '@nestjs/drizzle';
import { createObserveModule } from '@nestjs/observe';
import { ThrottlerGuard, ThrottlerModule, minutes, normalizeIp } from '@nestjs/throttler';
import { drizzle } from 'drizzle-orm/node-postgres';
import { accountEmail } from './auth/account-email.js';
import { AuthModule } from './auth/auth.module.js';
import { envSchema, type Env } from './config.js';
import { CartModule } from './cart/cart.module.js';
import { HealthModule } from './health/health.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { ProductsModule } from './products/products.module.js';
import { UsersModule } from './users/users.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // First, so it shuts down last and still sends what the other modules did.
    ObserveModule.forRoot({
      // Empty until `npx @nestjs/observe link` writes the key pair into .env: the SDK then sends nothing.
      appKey: process.env.OBSERVE_APP_KEY ?? '',
      appSecret: process.env.OBSERVE_APP_SECRET ?? '',
      serviceId: 'shop-api',
    }),
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    DrizzleModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        drizzle,
        connection: config.get('DATABASE_URL', { infer: true }),
      }),
    }),
    AuthenticationModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        accessToken: {
          key: config.get('JWT_SECRET', { infer: true }),
          issuer: 'shop-api',
          audience: 'shop-api',
          ttl: '15m',
        },
        refreshToken: { ttl: '30d', absoluteTtl: '90d' },
      }),
    }),
    // After AuthenticationModule: its guard reads the user that authentication sets.
    AuthorizationModule.forRoot(),
    ThrottlerModule.forRoot([
      // Per IP address, on every route.
      { name: 'default', ttl: minutes(1), limit: 100 },
      // Per email and IP address, wherever the request body names an account.
      {
        name: 'account',
        ttl: minutes(15),
        limit: 5,
        skipIf: (context) => !accountEmail(context.switchToHttp().getRequest()),
        getTracker: (req) => `${accountEmail(req)}|${normalizeIp(req.ip)}`,
      },
    ]),
    UsersModule,
    AuthModule,
    ProductsModule,
    CartModule,
    OrdersModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: StandardSchemaValidationPipe },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

```

- **`ObserveModule`** 在 `imports` 中**最先**出现，因为 [SDK's quick start](/observability/sdk#quick-start) 这样做：**模块**按相反顺序关闭，所以它最后停止，并发送其他**模块**记录的内容（参见 [Shutdown](/observability/sdk#shutdown)）。来自 JWT 教程的 `main.ts` 将 `ObserveInstrument` 传递给 Nest。
- **密钥对**在链接项目之前是空的。没有它，SDK 不发送任何内容，并在启动时报告。`npx @nestjs/observe link` 将 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET` 写入 `.env`，并将 `--env-file .env` 添加到 `start` 脚本中，因此在导入 `AppModule` 时（SDK 读取它们时）它们已在**环境变量**中（参见 [Linking from the terminal](/observability/sdk#linking-from-the-terminal)）。

**授权****守卫****默认拒绝**：只有当路由声明了谁可以调用它时，路由才会运行，使用 `@Can()` 进行策略检查，使用 `@Can.Anyone()` 检查**认证**允许通过的任何调用者，或使用 `@Public()`，这相当于 `@Can.Anyone()`。忘记声明的路由是关闭的，而不是打开的，并且**模块**在启动时记录了所有此类路由。来自 JWT 教程的 `/auth` 和 `/health` 下的路由已经是 `@Public()`。`GET /me` 适用于任何已登录用户：

```typescript title="src/users/me.controller.ts"
import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import type { User } from './user.js';

@Can.Anyone()
@Controller('me')
export class MeController {
  @Get()
  me(@CurrentUser() user: User) {
    return user;
  }
}

```

目录的**策略**只有一个能力：管理**产品**。用户参数接受 `null`，一个访客，因此**守卫**可以在任何路由上调用它：

```typescript title="src/products/product.policy.ts"
import { Policy } from '@nestjs/authorization';
import type { User } from '../users/user.js';

@Policy()
export class ProductPolicy {
  // `null` is a guest.
  manage(user: User | null) {
    return user?.role === 'staff';
  }
}

```

**请求****模式**。价格被**验证**为整数分，因此 `19.99` 是 400 而不是一个四舍五入的问题：

```typescript title="src/products/products.schemas.ts"
import { z } from 'zod';

const name = z.string().trim().min(1).max(200);
const description = z.string().max(5_000);
// In cents: 1999 is 19.99.
const price = z.number().int().positive().max(10_000_000);
const stock = z.number().int().min(0);

export const createProductSchema = z.object({ name, description: description.default(''), price, stock });
export type CreateProductDto = z.infer<typeof createProductSchema>;

export const updateProductSchema = z.object({ name, description, price, stock, active: z.boolean() }).partial();
export type UpdateProductDto = z.infer<typeof updateProductSchema>;

export const listProductsQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

```

与 JWT 教程中一样，更新**模式**不是从创建**模式**派生的，而是使用 `partial()`，否则将保留 `description` 默认值并在每次更新时清除描述。

```typescript title="src/products/products.service.ts"
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, eq, ilike } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { products, type Product } from '../database/schema.js';
import type { CreateProductDto, ListProductsQuery, UpdateProductDto } from './products.schemas.js';

@Injectable()
export class ProductsService {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  findAll({ q, limit, offset }: ListProductsQuery): Promise<Product[]> {
    return this.db
      .select()
      .from(products)
      .where(and(eq(products.active, true), q ? ilike(products.name, `%${escapeLike(q)}%`) : undefined))
      .orderBy(asc(products.name), asc(products.id))
      .limit(limit)
      .offset(offset);
  }

  async findOne(id: string): Promise<Product> {
    const [product] = await this.db
      .select()
      .from(products)
      .where(and(eq(products.id, id), eq(products.active, true)));
    return product ?? notFound();
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const [product] = await this.db.insert(products).values(dto).returning();
    return product;
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const [product] = await this.db.update(products).set(dto).where(eq(products.id, id)).returning();
    return product ?? notFound();
  }
}

function notFound(): never {
  throw new NotFoundException('Product not found');
}

/** `%` and `_` in the search are literal characters, not wildcards. */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

```

搜索通过 Drizzle 的 `ilike()` 进行，该方法将模式作为参数发送，因此无法注入 SQL。转义 `%` 和 `_` 确保对 `100%` 的搜索不会匹配所有内容。

读取路由是 `@Public()`，写入路由在处理程序运行前检查**策略**。访客收到 401，要求他们登录，而已登录的客户收到 403，表示登录无济于事：

```typescript title="src/products/products.controller.ts"
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { ApiSecurity } from '@nestjs/swagger';
import { z } from 'zod';
import { ProductPolicy } from './product.policy.js';
import {
  createProductSchema,
  listProductsQuerySchema,
  updateProductSchema,
  type CreateProductDto,
  type ListProductsQuery,
  type UpdateProductDto,
} from './products.schemas.js';
import { ProductsService } from './products.service.js';

const productId = { schema: z.uuid() };

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Public()
  @ApiSecurity({})
  @Get()
  findAll(@Query({ schema: listProductsQuerySchema }) query: ListProductsQuery) {
    return this.productsService.findAll(query);
  }

  @Public()
  @ApiSecurity({})
  @Get(':id')
  findOne(@Param('id', productId) id: string) {
    return this.productsService.findOne(id);
  }

  @Can(ProductPolicy, 'manage')
  @Post()
  create(@Body({ schema: createProductSchema }) dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Can(ProductPolicy, 'manage')
  @Patch(':id')
  update(@Param('id', productId) id: string, @Body({ schema: updateProductSchema }) dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }
}

```

`@Can()` 会针对**策略**进行类型检查，因此拼写错误的**能力**不会编译。将**策略**注册为其**模块**的**提供者**；**授权****模块**在那里找到它：

```typescript title="src/products/products.module.ts"
import { Module } from '@nestjs/common';
import { ProductPolicy } from './product.policy.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ProductPolicy],
})
export class ProductsModule {}

```

注册创建了客户。提升数据库中的第一名员工（此后，您自己的管理员界面可以执行此操作）：

```bash
$ docker exec shop-db psql -U postgres -d shop -c "UPDATE users SET role = 'staff' WHERE email = 'sam@example.com'"

```

#### 保留购物车

购物车行是一个产品和一个数量。设置数量是对表主键的 upsert，因此重复的请求会保留相同的购物车：

```typescript title="src/cart/cart.schemas.ts"
import { z } from 'zod';

export const setQuantitySchema = z.object({
  quantity: z.number().int().min(1).max(100),
});
export type SetQuantityDto = z.infer<typeof setQuantitySchema>;

```

服务读取当日价格的购物车，并使用该 upsert 设置一行：

```typescript title="src/cart/cart.service.ts"
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { cartItems, products } from '../database/schema.js';

export interface CartLine {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  /** Whether checkout can take this line right now. */
  available: boolean;
}

export interface Cart {
  items: CartLine[];
  /** In cents, at today's prices. */
  total: number;
}

@Injectable()
export class CartService {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  async get(userId: string): Promise<Cart> {
    const rows = await this.db
      .select({
        productId: cartItems.productId,
        name: products.name,
        unitPrice: products.price,
        quantity: cartItems.quantity,
        active: products.active,
        stock: products.stock,
      })
      .from(cartItems)
      .innerJoin(products, eq(products.id, cartItems.productId))
      .where(eq(cartItems.userId, userId))
      .orderBy(asc(products.name));
    const items = rows.map(({ active, stock, ...line }) => ({ ...line, available: active && stock >= line.quantity }));
    const total = items.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    return { items, total };
  }

  async setQuantity(userId: string, productId: string, quantity: number): Promise<Cart> {
    const [product] = await this.db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.active, true)));
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    // Stock isn't reserved here: checkout checks it, in the same statement that takes it.
    await this.db
      .insert(cartItems)
      .values({ userId, productId, quantity })
      .onConflictDoUpdate({ target: [cartItems.userId, cartItems.productId], set: { quantity } });
    return this.get(userId);
  }

  async remove(userId: string, productId: string): Promise<Cart> {
    await this.db.delete(cartItems).where(and(eq(cartItems.userId, userId), eq(cartItems.productId, productId)));
    return this.get(userId);
  }
}

```

购物车不预留库存。在客户添加商品时预留库存会导致废弃的购物车占用全部库存；购物车会显示无法立即购买的行的 `available: false`，而实际扣减库存发生在结账时。购物车按当日价格定价，订单按结账时刻的价格定价。

每个已登录用户都有一个购物车，因此控制器声明 `@Can.Anyone()`，并且每个查询都根据令牌作用域到用户：

```typescript title="src/cart/cart.controller.ts"
import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { z } from 'zod';
import { setQuantitySchema, type SetQuantityDto } from './cart.schemas.js';
import { CartService } from './cart.service.js';

const productId = { schema: z.uuid() };

// Every signed-in customer has a cart, and only sees their own.
@Can.Anyone()
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  get(@CurrentUser('id') userId: string) {
    return this.cartService.get(userId);
  }

  @Put('items/:productId')
  setQuantity(
    @CurrentUser('id') userId: string,
    @Param('productId', productId) id: string,
    @Body({ schema: setQuantitySchema }) { quantity }: SetQuantityDto,
  ) {
    return this.cartService.setQuantity(userId, id, quantity);
  }

  @Delete('items/:productId')
  remove(@CurrentUser('id') userId: string, @Param('productId', productId) id: string) {
    return this.cartService.remove(userId, id);
  }
}

```

购物车模块注册了控制器和服务：

```typescript title="src/cart/cart.module.ts"
import { Module } from '@nestjs/common';
import { CartController } from './cart.controller.js';
import { CartService } from './cart.service.js';

@Module({
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}

```

#### 无超卖地结账

结账是电子商务后端通常出错的地方。明显的版本读取产品，检查 `stock` 是否足够高，然后写入新库存。两个在同一时刻结账的客户都读取到库存为 1，都通过了检查，并且都获得了最后一个单元的订单。本教程末尾的测试针对 PostgreSQL 运行了十个这样的客户：该版本在每次运行中都为单个单元接受了多个订单。

下面的结账使用条件语句获取所需的所有内容，在一个事务内：

```typescript title="src/orders/orders.service.ts"
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { cartItems, orderItems, orders, products, type Order, type OrderItem } from '../database/schema.js';

export type OrderWithItems = Order & { items: Omit<OrderItem, 'orderId'>[] };

@Injectable()
export class OrdersService {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  /** Turns the user's cart into an order, or throws without changing anything. */
  checkout(userId: string): Promise<OrderWithItems> {
    return this.db.transaction(async (tx) => {
      // Taking the cart is the first statement. A second checkout of the same
      // cart waits for this transaction, then finds it empty.
      const taken = await tx.delete(cartItems).where(eq(cartItems.userId, userId)).returning();
      if (taken.length === 0) {
        throw new ConflictException('Your cart is empty');
      }
      // Lock products in one order across all checkouts, so two of them never deadlock.
      taken.sort((a, b) => a.productId.localeCompare(b.productId));

      const items: Omit<OrderItem, 'orderId'>[] = [];
      for (const { productId, quantity } of taken) {
        // Checks and takes the stock in one statement: no read-then-write window.
        const [product] = await tx
          .update(products)
          .set({ stock: sql`${products.stock} - ${quantity}` })
          .where(and(eq(products.id, productId), eq(products.active, true), gte(products.stock, quantity)))
          .returning({ name: products.name, price: products.price });
        if (!product) {
          // Rolls back the whole transaction: the cart and the other products are untouched.
          throw new ConflictException(`Not enough stock for product ${productId}`);
        }
        items.push({ productId, name: product.name, unitPrice: product.price, quantity });
      }

      const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      const [order] = await tx.insert(orders).values({ userId, status: 'placed', total }).returning();
      await tx.insert(orderItems).values(items.map((item) => ({ ...item, orderId: order.id })));
      return { ...order, items };
    });
  }

  // findMine(), findOne(), cancel() and ship() follow in the next section.
}

```

- **库存由一个 `UPDATE` 检查并扣除**，其 `WHERE` 子句要求有足够库存。PostgreSQL 在更新行时会锁定该行，因此第二个结账的 `UPDATE` 等待第一个事务，然后看到它留下的库存。当库存不足时，该语句不更改任何行并返回空值，结账抛出异常。
- **抛出异常会回滚所有操作。** 来自 [Drizzle](https://docs.nestjs.com/data/drizzle#drizzle-transactions) 的 `transaction()` 在其回调抛出时会回滚，因此在第三个产品上失败的结账会保持前两个产品的库存和整个购物车不变。Nest 将 `ConflictException` 转换为 409。
- **首先获取购物车，使用 `DELETE ... RETURNING`。** 这使得双击结账是安全的：第二个请求的 `DELETE` 等待第一个事务对相同行的锁，一旦第一个提交，它会发现购物车为空并返回 409。一次点击，一个订单，无需幂等性键来管理。
- **所有结账都按相同的顺序锁定产品。** 两个包含相同两个产品的购物车，按相反的顺序获取，每个都会持有其中一行并等待另一个，PostgreSQL 会将其中一个中止为死锁。按产品 ID 排序排除了这种情况。
- **价格来自 `UPDATE` 的 `RETURNING`**，因此订单记录的是库存被扣除时的价格，而不是购物车先前显示的价格。
- **每个查询都经过 `tx`。** 如果查询注入的数据库而不是使用它，则将在连接池的另一个连接上运行，在事务外部。

#### 取消和发货订单

订单从 `placed` 移动到客户的 `cancelled` 或员工的 `shipped`。两者都是对当前状态的条件更新，因此当客户在员工发货的瞬间取消时，只有一个会获胜，另一个会收到 409。取消也会将库存放回，在同一个事务中。其余部分见 `OrdersService`：

```typescript title="src/orders/orders.service.ts"
  findMine(userId: string): Promise<Order[]> {
    return this.db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt)).limit(100);
  }

  async findOne(userId: string, id: string): Promise<OrderWithItems> {
    const [order] = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.userId, userId)));
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return { ...order, items: await this.items(this.db, order.id) };
  }

  /** The owner cancels an order that hasn't shipped, and its stock goes back. */
  cancel(userId: string, id: string): Promise<Order> {
    return this.db.transaction(async (tx) => {
      // Conditional: of a cancel and a ship racing for the same order, one wins.
      const [order] = await tx
        .update(orders)
        .set({ status: 'cancelled' })
        .where(and(eq(orders.id, id), eq(orders.userId, userId), eq(orders.status, 'placed')))
        .returning();
      if (!order) {
        return this.refuse(tx, id, userId);
      }
      for (const { productId, quantity } of await this.items(tx, order.id)) {
        await tx
          .update(products)
          .set({ stock: sql`${products.stock} + ${quantity}` })
          .where(eq(products.id, productId));
      }
      return order;
    });
  }

  /** Staff mark a placed order as shipped. */
  async ship(id: string): Promise<Order> {
    const [order] = await this.db
      .update(orders)
      .set({ status: 'shipped' })
      .where(and(eq(orders.id, id), eq(orders.status, 'placed')))
      .returning();
    return order ?? this.refuse(this.db, id);
  }

  private items(db: Pick<NodePgDatabase, 'select'>, orderId: string) {
    return db
      .select({
        productId: orderItems.productId,
        name: orderItems.name,
        unitPrice: orderItems.unitPrice,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .orderBy(asc(orderItems.name));
  }

  /** Why a conditional update changed nothing: 404 if the order isn't there (or isn't theirs), 409 otherwise. */
  private async refuse(db: Pick<NodePgDatabase, 'select'>, id: string, userId?: string): Promise<never> {
    const [order] = await db
      .select({ status: orders.status })
      .from(orders)
      .where(and(eq(orders.id, id), userId ? eq(orders.userId, userId) : undefined));
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    throw new ConflictException(`Order is already ${order.status}`);
  }
}

```

另一个客户的订单是 404，就像不存在的订单一样。发货需要第二个策略：

```typescript title="src/orders/order.policy.ts"
import { Policy } from '@nestjs/authorization';
import type { User } from '../users/user.js';

@Policy()
export class OrderPolicy {
  ship(user: User | null) {
    return user?.role === 'staff';
  }
}

```

控制器在发货路由上检查该策略。其他路由是针对任何已登录客户的，它们的查询作用域到他们：

```typescript title="src/orders/orders.controller.ts"
import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { z } from 'zod';
import { OrderPolicy } from './order.policy.js';
import { OrdersService } from './orders.service.js';

const orderId = { schema: z.uuid() };

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // Checkout: the cart becomes an order.
  @Can.Anyone()
  @Post()
  checkout(@CurrentUser('id') userId: string) {
    return this.ordersService.checkout(userId);
  }

  @Can.Anyone()
  @Get()
  findMine(@CurrentUser('id') userId: string) {
    return this.ordersService.findMine(userId);
  }

  @Can.Anyone()
  @Get(':id')
  findOne(@CurrentUser('id') userId: string, @Param('id', orderId) id: string) {
    return this.ordersService.findOne(userId, id);
  }

  @Can.Anyone()
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser('id') userId: string, @Param('id', orderId) id: string) {
    return this.ordersService.cancel(userId, id);
  }

  @Can(OrderPolicy, 'ship')
  @Post(':id/ship')
  @HttpCode(200)
  ship(@Param('id', orderId) id: string) {
    return this.ordersService.ship(id);
  }
}

```

`POST /orders` 创建订单并返回 201。取消和发货更改现有订单，因此返回 200。

```typescript title="src/orders/orders.module.ts"
import { Module } from '@nestjs/common';
import { OrderPolicy } from './order.policy.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, OrderPolicy],
})
export class OrdersModule {}

```

#### 试用

启动应用程序：

```bash
$ npm run start:dev

```

注册一个客户和一个员工，并像上面那样提升该员工。提升后他们的令牌仍然有效，因为角色在每次请求时读取（令牌和响应主体在此和下缩短）：

```bash
$ curl localhost:3000/auth/sign-up --json '{"email":"ada@example.com","password":"correct horse battery"}'
{"accessToken":"eyJhbGciOiJIUzI1NiIs...","refreshToken":"...","expiresIn":900}
$ ADA="Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
$ SAM="Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."

```

只有员工可以添加产品：

```bash
$ curl localhost:3000/products -H "$ADA" --json '{"name":"Mechanical keyboard","price":12900,"stock":5}'
{"message":"Forbidden","statusCode":403}
$ curl localhost:3000/products -H "$SAM" --json '{"name":"Mechanical keyboard","description":"Hot-swappable switches","price":12900,"stock":5}'
{"id":"afffc03b-9142-4761-be96-84e6da07f8d4","name":"Mechanical keyboard","description":"Hot-swappable switches","price":12900,"stock":5,"active":true,"createdAt":"2026-11-19T20:04:12.673Z"}
$ curl localhost:3000/products -H "$SAM" --json '{"name":"Wrist rest","price":19.99,"stock":1}'
{"message":["price: Invalid input: expected int, received number"],"error":"Bad Request","statusCode":400}

```

填充购物车并结账（以相同方式添加一个腕托，价格为 1999 分）：

```bash
$ curl -X PUT localhost:3000/cart/items/afffc03b-9142-4761-be96-84e6da07f8d4 -H "$ADA" --json '{"quantity":2}'
{"items":[{"productId":"afffc03b-9142-4761-be96-84e6da07f8d4","name":"Mechanical keyboard","unitPrice":12900,"quantity":2,"available":true}],"total":25800}
$ curl -X POST localhost:3000/orders -H "$ADA"
{"id":"02ebc117-957f-4566-a2bb-e343afb01854","userId":"ed17ba4e-4d43-4aa4-9116-c6eda67ec2a7","status":"placed","total":27799,"createdAt":"2026-11-19T20:04:25.979Z","items":[{"productId":"afffc03b-...","name":"Mechanical keyboard","unitPrice":12900,"quantity":2},{"productId":"dc51c8f1-...","name":"Wrist rest","unitPrice":1999,"quantity":1}]}
$ curl -X POST localhost:3000/orders -H "$ADA"
{"message":"Your cart is empty","error":"Conflict","statusCode":409}

```

还剩下三个键盘。要求四个的购物车无法结账，并保留其行：

```bash
$ curl -X PUT localhost:3000/cart/items/afffc03b-9142-4761-be96-84e6da07f8d4 -H "$ADA" --json '{"quantity":4}'
$ curl -X POST localhost:3000/orders -H "$ADA"
{"message":"Not enough stock for product afffc03b-9142-4761-be96-84e6da07f8d4","error":"Conflict","statusCode":409}
$ curl localhost:3000/cart -H "$ADA"
{"items":[{"productId":"afffc03b-9142-4761-be96-84e6da07f8d4","name":"Mechanical keyboard","unitPrice":12900,"quantity":4,"available":false}],"total":51600}

```

员工提高价格。订单保留了下单时的价格。取消会将其库存放回，并且只能取消一次：

```bash
$ curl -X PATCH localhost:3000/products/afffc03b-9142-4761-be96-84e6da07f8d4 -H "$SAM" --json '{"price":14900}'
$ curl localhost:3000/orders/02ebc117-957f-4566-a2bb-e343afb01854 -H "$ADA"
{"id":"02ebc117-...","status":"placed","total":27799,...,"items":[{"productId":"afffc03b-...","name":"Mechanical keyboard","unitPrice":12900,"quantity":2},...]}
$ curl -X POST localhost:3000/orders/02ebc117-957f-4566-a2bb-e343afb01854/cancel -H "$ADA"
{"id":"02ebc117-957f-4566-a2bb-e343afb01854","userId":"ed17ba4e-4d43-4aa4-9116-c6eda67ec2a7","status":"cancelled","total":27799,"createdAt":"2026-11-19T20:04:25.979Z"}
$ curl -X POST localhost:3000/orders/02ebc117-957f-4566-a2bb-e343afb01854/cancel -H "$ADA"
{"message":"Order is already cancelled","error":"Conflict","statusCode":409}

```

客户不能发货订单（403），员工不能发货已取消的订单（409），另一个客户会收到 404。

#### 测试

这里重要的保证是关于并发的，像 PGlite 这样的进程内数据库只有一个连接，请求永远不会真正竞争。因此，这些测试是针对真实的 PostgreSQL 服务器运行的，通过连接池，使用 `app.inject()` 发送同时运行的请求。创建他们自己的数据库，因为测试会截断表：

```typescript title="test/checkout.e2e-spec.ts"
import { fileURLToPath } from 'node:url';
import { PasswordHasher } from '@nestjs/authentication';
import { getDrizzleToken } from '@nestjs/drizzle';
import { NodeAdapter, type NestNodeApplication } from '@nestjs/platform-node';
import { Test } from '@nestjs/testing';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module.js';
import { products, users } from '../src/database/schema.js';
import type { Role } from '../src/users/user.js';

// A real PostgreSQL with a pool, so concurrent checkouts really race.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('Shop API (e2e)', () => {
  const db = drizzle({ client: new Pool({ connectionString: url, max: 20 }) });
  let app: NestNodeApplication;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
    await db.execute(sql`TRUNCATE users, products, refresh_tokens CASCADE`);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDrizzleToken())
      .useValue(db)
      // scrypt at the default cost takes 128 MiB and a few hundred ms per hash.
      .overrideProvider(PasswordHasher)
      .useValue(new PasswordHasher({ logN: 10 }))
      .compile();
    app = moduleRef.createNestApplication<NestNodeApplication>(new NodeAdapter());
    await app.init();
  });

  afterAll(() => app.close()); // closes the pool too

  let clients = 0;

  /** Signs a user up, and returns the headers that authenticate as them. */
  async function signUp(email: string, role: Role = 'customer') {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email, password: 'correct horse battery' },
      // Each user signs up from an address of their own, as they would in
      // production: sign-up is rate-limited per IP address.
      remoteAddress: `10.0.0.${++clients}`,
    });
    await db.update(users).set({ role }).where(eq(users.email, email));
    return { authorization: `Bearer ${res.json<{ accessToken: string }>().accessToken}` };
  }

  async function createProduct(stock: number) {
    const res = await app.inject({
      method: 'POST',
      url: '/products',
      headers: await signUp(`staff-${crypto.randomUUID()}@example.com`, 'staff'),
      payload: { name: 'Limited edition keycaps', price: 9900, stock },
    });
    expect(res.statusCode).toBe(201);
    return res.json<{ id: string }>().id;
  }

  it('lets only staff edit the catalog', async () => {
    const payload = { name: 'Desk mat', price: 2500, stock: 10 };
    const customer = await signUp('customer@example.com');
    expect((await app.inject({ method: 'POST', url: '/products', payload })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/products', headers: customer, payload })).statusCode).toBe(403);
  });

  it('sells the last unit exactly once', async () => {
    const productId = await createProduct(1);
    const buyers = await Promise.all(Array.from({ length: 10 }, (_, i) => signUp(`buyer${i}@example.com`)));
    for (const headers of buyers) {
      await app.inject({ method: 'PUT', url: `/cart/items/${productId}`, headers, payload: { quantity: 1 } });
    }

    const results = await Promise.all(buyers.map((headers) => app.inject({ method: 'POST', url: '/orders', headers })));

    expect(results.map((res) => res.statusCode).sort()).toEqual([201, ...Array(9).fill(409)]);
    const [{ stock }] = await db.select({ stock: products.stock }).from(products).where(eq(products.id, productId));
    expect(stock).toBe(0);
  });

  it('places one order when the same cart is checked out twice at once', async () => {
    const productId = await createProduct(10);
    const headers = await signUp('double-click@example.com');
    await app.inject({ method: 'PUT', url: `/cart/items/${productId}`, headers, payload: { quantity: 2 } });

    const results = await Promise.all([1, 2].map(() => app.inject({ method: 'POST', url: '/orders', headers })));

    expect(results.map((res) => res.statusCode).sort()).toEqual([201, 409]);
    const orders = await app.inject({ method: 'GET', url: '/orders', headers });
    expect(orders.json()).toHaveLength(1);
  });

  it('puts the stock back when an order is cancelled', async () => {
    const productId = await createProduct(3);
    const headers = await signUp('cancel@example.com');
    await app.inject({ method: 'PUT', url: `/cart/items/${productId}`, headers, payload: { quantity: 3 } });
    const order = (await app.inject({ method: 'POST', url: '/orders', headers })).json<{ id: string }>();

    const cancelled = await app.inject({ method: 'POST', url: `/orders/${order.id}/cancel`, headers });
    expect(cancelled.json()).toMatchObject({ status: 'cancelled' });
    const product = await app.inject({ method: 'GET', url: `/products/${productId}` });
    expect(product.json()).toMatchObject({ stock: 3 });
    expect((await app.inject({ method: 'POST', url: `/orders/${order.id}/cancel`, headers })).statusCode).toBe(409);
  });
});

```

先创建测试数据库一次，然后运行套件：

```bash
$ docker exec shop-db psql -U postgres -c "CREATE DATABASE shop_test"
$ TEST_DATABASE_URL=postgres://postgres:shop@localhost:5432/shop_test npm run test:e2e

 Test Files  1 passed (1)
      Tests  4 passed (4)

```

将 `checkout()` 中的库存 `UPDATE` 替换为读取、JavaScript 中的检查和写入，"恰好一次售出最后一个单元" 将失败：十个客户中有好几个会获得订单。

JWT 教程中的 [refresh-token store test](/tutorials/rest-api-jwt-authentication#test-it) 在此处保持不变。两个测试文件都截断了同一数据库的表，因此请按顺序运行它们，使用 `npm run test:e2e -- --no-file-parallelism`。

#### 生产环境检查清单

JWT 教程中的 [checklist](/tutorials/rest-api-jwt-authentication#production-checklist) 所有内容都适用。特别是对于商店而言：

- **为结账设置连接池大小。** 每个结账会占用一个连接直到其事务结束，热门产品的结账会排队等待行锁。保持事务简短：`checkout()` 中的任何内容都不等待数据库以外的任何东西，并且应该保持如此。在事务之前或之后调用支付提供者，绝不在事务内部调用。
- **使用幂等性键进行支付。** 由于购物车在第一次结账后消失，因此结账可以安全重试。支付则不然：重试的收费会重复收费。提供者的 API 需要一个键；发送订单的 id。要使自己的支付端点可以安全重试，请参阅 [Idempotency keys](/reliability/idempotency)。
- **绝不信任来自客户端的价格。** 订单的价格是在结账时从 `products` 表中获取的。根据设计，发送价格或总额的客户端将被忽略；在添加折扣时保持这种做法。
- **保持停用产品而不是删除它们。** 订单项引用它们。
- **为生产环境提供独立的 Observe 密钥对**，从项目的 **API Keys** 页面获取，并在平台的环境中作为 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET` 配置：`start:prod` 不加载 `.env`。然后观察结账过程：锁等待热门产品出现时显示为缓慢结账，而不是错误。[NestJS Observe](/observability/overview) 记录每个请求，包括其跨度跟踪、SQL 语句和每个路由的 p95 延迟，因此在促销期间变慢的结账在客户抱怨之前就能被发现。
- **为员工账户提供第二重验证。** 员工令牌可以重写目录的价格。请参阅 [Add two-factor authentication](/security/authentication#add-two-factor-authentication)，并在员工路由上使用 `@Authenticate()` 要求它。

#### 下一步

- 从提供者的 Webhook 标记订单已支付，并进行支付：[Accept payments with webhooks](/tutorials/payments-webhooks)。
- 在请求外部发送订单确认：[Mail](/application/mail) 和 [Queues](/techniques/queues)。要确保仅在订单事务已提交后才发送事件，请使用 [transactional outbox](/reliability/outbox)。
- 让客户看到每笔订单的权限，或为员工提供更精细的角色：[Authorization](/security/authorization)。
- 按请求查看生产环境中的缓慢结账和锁等待情况：[Observability](/observability/overview)。