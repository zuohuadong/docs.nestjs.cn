<!-- 此文件从 content/tutorials/booking-system.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:54:23.313Z -->
<!-- 源文件: content/tutorials/booking-system.md -->
<!-- 源哈希: 4c906c8d8c309ec794a6de79c2b3e0ae -->

### 在 Node.js 中构建无重复预定的预订系统

使用 NestJS 和 PostgreSQL 在 Node.js 中构建一个永不出现重复预定的预订和预约系统，支持空闲时段、时区和取消功能。

该系统包含会议室等资源，由工作人员管理；每日空闲时段列表；以及用户创建和取消的预订。系统保证任何一个资源不会出现两个预订时间重叠的情况。这种保证并非来自于应用程序代码在插入前查找冲突（因为两个同时到达的请求都会通过检查）。而是来自于 PostgreSQL：一个排除约束会拒绝两个重叠预订中的第二个，无论它们何时到达，而 API 将该拒绝转换为一个 `409 Conflict`。

到最后，API 将具备以下功能：

- 允许任何人列出资源及其某一天的空闲时段，只有工作人员可以创建和编辑资源，并遵循 [`@nestjs/authorization`](/security/authorization)。
- 接受 ISO 8601 格式带偏移量的字符串作为时间，将其存储为 UTC 中的瞬时，并以 UTC 返回。
- 拒绝与另一个预订重叠的预订，该拒绝由 PostgreSQL 排除约束保证，不受应用程序操作的影响，并返回 409 状态码。
- 允许用户在预订开始前 24 小时内取消预订，通过一次条件更新实现。
- 在针对 PostgreSQL 的测试中证明，十个用户同时争抢一个时段，最终只产生一个预订。

系统从 [Build a REST API with JWT authentication](/tutorials/rest-api-jwt-authentication) 的 API 开始，该 API 使用访问令牌和刷新令牌为用户登录，使用 Zod 验证请求，并通过 Drizzle 在 PostgreSQL 中存储数据。本教程不再解释这些部分。

以下是端点及其添加每个端点的部分：

| Endpoint | Section |
| --- | --- |
| `POST /auth/sign-up`, `POST /auth/token`, `POST /auth/token/refresh`, `POST /auth/token/revoke`, `GET /me`, `GET /health/live`, `GET /health/ready` | [Start from the JWT API](/tutorials/booking-system#start-from-the-jwt-api) |
| `GET /resources`, `GET /resources/:id`, `POST /resources`, `PATCH /resources/:id` | [Let staff manage resources](/tutorials/booking-system#let-staff-manage-resources) |
| `POST /bookings`, `GET /bookings`, `GET /bookings/:id` | [Book without double bookings](/tutorials/booking-system#book-without-double-bookings) |
| `GET /resources/:id/availability` | [List the free slots of a day](/tutorials/booking-system#list-the-free-slots-of-a-day) |
| `POST /bookings/:id/cancel` | [Cancel before the cutoff](/tutorials/booking-system#cancel-before-the-cutoff) |

> info **提示** 完成的应用托管在 GitHub 上的 [nestjs/example-booking-system](https://github.com/nestjs/example-booking-system)，包含其测试和 CI 工作流。

#### 从 JWT API 开始

创建项目，并安装本教程使用的所有依赖。这些是 JWT 教程的包加上 `@nestjs/authorization`：

```bash
$ npm i -g @nestjs/cli
$ nest new booking-api --minimal
$ cd booking-api
$ npm uninstall @nestjs/platform-express @types/express
$ npm i --save @nestjs/platform-node zod @nestjs/config @nestjs/drizzle drizzle-orm@rc pg @nestjs/authentication @nestjs/authorization @nestjs/throttler @nestjs/swagger @nestjs/terminus
$ npm i --save-dev drizzle-kit@rc @types/pg @nestjs/testing vitest vite

```

然后从 [finished JWT tutorial](/tutorials/rest-api-jwt-authentication#sign-users-in-with-jwts) 复制以下文件，保持原样：

- `src/config.ts`, `src/main.ts`, `drizzle.config.ts` 和 `vitest.config.e2e.ts`
- `src/auth/`, `src/users/` 和 `src/health/` 下的所有内容
- `test/refresh-token.store.e2e-spec.ts`

忽略 `src/notes/` 和 JWT 教程中的 `drizzle/` 文件夹：本应用的第一个迁移来自其自身的模式，见下一节。将笔记重命名为预订系统中的名称：`JwtAuth` 中的 `realm` 和 `main.ts` 中 OpenAPI 文档的标题。将测试脚本添加到 `package.json`：

```json
"test:e2e": "vitest run --config ./vitest.config.e2e.ts"

```

最后，像 JWT 教程中那样，在 `.env` 中添加数据库 URL 和一个 `JWT_SECRET`，使用预订系统自己的数据库：

```bash
$ docker run -d --name booking-db -e POSTGRES_PASSWORD=booking -e POSTGRES_DB=booking -p 5432:5432 postgres:17

```

其 URL 放在 `.env` 中，紧邻签名密钥：

```bash
DATABASE_URL=postgres://postgres:booking@localhost:5432/booking
# Generate with: openssl rand -base64 32
JWT_SECRET=

```

工作人员和预订人员使用相同的登录方式，因此用户现在拥有一个角色：

```typescript title="src/users/user.ts"
export type Role = 'customer' | 'staff';

export interface User {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
}

```

`UsersRepository` 会连同其他列一起返回该角色：

```typescript title="src/users/users.repository.ts"
// ...
const columns = { id: users.id, email: users.email, role: users.role, createdAt: users.createdAt };

```

角色不在访问令牌中。`JwtAuth.validate()` 在每次请求时加载用户，因此将用户提升为工作人员或降级，将在其下一次请求中生效。

#### 设计模式

整个模式在一个文件中。用户和刷新令牌沿用 JWT 教程的，但增加了角色：

```typescript title="src/database/schema.ts"
import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, text, time, timestamp, uuid } from 'drizzle-orm/pg-core';

// timestamptz: an instant, stored in UTC, whatever offset the client sent.
const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['customer', 'staff'] }).notNull().default('customer'),
  createdAt: at('created_at').notNull().defaultNow(),
});

export const resources = pgTable(
  'resources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    // The IANA time zone of the opening hours, such as Europe/Warsaw.
    timeZone: text('time_zone').notNull(),
    // Local times of day, in `timeZone`.
    opensAt: time('opens_at').notNull(),
    closesAt: time('closes_at').notNull(),
    // The length of the slots that availability lists.
    slotMinutes: integer('slot_minutes').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (table) => [check('resources_opens_before_closes', sql`${table.opensAt} < ${table.closesAt}`)],
);

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resources.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // The booking is the half-open range [startsAt, endsAt).
    startsAt: at('starts_at').notNull(),
    endsAt: at('ends_at').notNull(),
    status: text('status', { enum: ['confirmed', 'cancelled'] }).notNull().default('confirmed'),
    createdAt: at('created_at').notNull().defaultNow(),
    cancelledAt: at('cancelled_at'),
  },
  (table) => [
    check('bookings_ends_after_starts', sql`${table.endsAt} > ${table.startsAt}`),
    index('bookings_user_id_starts_at_idx').on(table.userId, table.startsAt),
    // The exclusion constraint that prevents double bookings is in a custom migration.
  ],
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

export type Resource = typeof resources.$inferSelect;
export type Booking = typeof bookings.$inferSelect;

```

- **时间是 `timestamptz` 列。** 尽管名称如此，`timestamp with time zone` 不存储时区：它存储一个 UTC 中的瞬时，并转换客户端发送的任何偏移量。一个普通的 `timestamp` 会存储 `10:00` 而不说明位置，不同时区的两个客户端将因此产生不同的瞬时。
- **预订是从 `startsAt` 到 `endsAt` 的半开区间**：包含开始时间，不包含结束时间。从 10:00 到 11:00 的预订和从 11:00 到 12:00 的预订不重叠，这符合人们所说的紧接相连。
- **资源保留其开放时间为本地时间，并包含其所在的时区。** 华沙的一间会议室全年都于华沙时间 09:00 开放，这在冬季是 UTC 时间 08:00，在夏季是 UTC 时间 07:00。存储 `08:00 UTC` 在一年中的一半时间是错误的。
- **已取消的预订保留在表中**，带有状态。历史记录得以保留，下一节的约束会忽略它们。
- **`ends_at` 必须在 `starts_at` 之后。** PostgreSQL 会拒绝结束时间早于开始时间的范围，零长度的预订不与任何内容重叠。

生成并应用迁移（参见 [Migrations](https://docs.nestjs.com/data/drizzle#迁移)）：

```bash
$ npx drizzle-kit generate --name=booking
$ npx drizzle-kit migrate

```

#### 使重复预订不可能发生

防止重复预订的明显方法是在服务中实现：查找资源上是否存在与新预订重叠的已确认预订，只有在不存在时才插入。两个同时到达的相同时段的请求都会查找，都会发现没有，然后都会插入。本教程末尾的测试针对 PostgreSQL 运行了十个此类请求：在五次运行中的每一次，该版本接受了该时段的五到十个预订。

PostgreSQL 可以通过**排除约束**来强制执行该规则。唯一约束表示没有两条记录具有相同的值；排除约束将其推广到任何运算符：一个资源的任意两条记录的时间范围不能重叠。PostgreSQL 会在每次插入和更新时检查它，无论由什么代码发送，包括并发的请求，并会失败破坏该约束的语句。

Drizzle 的模式语言没有排除约束，因此 `drizzle-kit generate` 无法生成此约束。请手动在自定义**迁移**中编写。`--custom` 创建一个空**迁移**，它会与生成的**迁移**按顺序运行：

```bash
$ npx drizzle-kit generate --custom --name=no_double_bookings

```

将新的 `drizzle/<timestamp>_no_double_bookings/migration.sql` 的内容替换为：

```sql
-- btree_gist lets a GiST index compare uuid columns with =.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
-- No two confirmed bookings of one resource may overlap. tstzrange() builds
-- half-open ranges, [starts_at, ends_at), so back-to-back bookings don't.
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (resource_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status = 'confirmed');

```

- **`resource_id WITH =, tstzrange(starts_at, ends_at) WITH &&`** 读取：当资源相等且时间范围重叠时，两条记录冲突（`&&`）。不同资源的预订永远不会冲突。
- **`tstzrange(starts_at, ends_at)`** 从两个列构建范围，因此表和代码仍使用纯时间戳工作。其默认边界是 `[)`，即半开区间：允许连续预订。
- **`WHERE (status = 'confirmed')`** 将约束限制在已确认的预订上。已取消的预订不再占用其时段，新预订可以重叠它。
- **`btree_gist`** 是必需的，因为约束由 GiST 索引强制执行，而 GiST 在没有它的情况下无法比较 `uuid` 值和 `=`。该扩展随 PostgreSQL 一起提供。该约束的索引也服务于后续部分的可用性**查询**。
- **`statement-breakpoint` 注释**将两个语句分开，就像 `drizzle-kit` 生成的**迁移**中一样。

应用它。`drizzle-kit` 不读取自定义**迁移**，因此它不知道该约束，也不会生成删除它的**迁移**：

```bash
$ npx drizzle-kit migrate
$ npx drizzle-kit generate
No schema changes, nothing to migrate

```

#### 让员工管理资源

[`@nestjs/authorization`](/security/authorization) 将权限表达为**策略**，这些类的方法回答“此用户是否可以执行此操作？”。在 `AuthenticationModule` 之后注册其**模块**：两者都注册了一个全局**守卫**，并且授权需要**认证**设置的用户。对于预订系统的功能**模块**，根**模块**是：

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
import { BookingsModule } from './bookings/bookings.module.js';
import { envSchema, type Env } from './config.js';
import { HealthModule } from './health/health.module.js';
import { ResourcesModule } from './resources/resources.module.js';
import { UsersModule } from './users/users.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // First, so it shuts down last and still sends what the other modules did.
    ObserveModule.forRoot({
      // Empty until `npx @nestjs/observe link` writes the key pair into .env: the SDK then sends nothing.
      appKey: process.env.OBSERVE_APP_KEY ?? '',
      appSecret: process.env.OBSERVE_APP_SECRET ?? '',
      serviceId: 'booking-api',
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
          issuer: 'booking-api',
          audience: 'booking-api',
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
    ResourcesModule,
    BookingsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: StandardSchemaValidationPipe },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

```

授权**守卫****默认拒绝**：只有声明了谁可以调用它的路由才会运行，使用 `@Can()` 进行策略检查，使用 `@Can.Anyone()` 检查**认证**允许通过的任何调用者，或使用 `@Public()`，这算作 `@Can.Anyone()`。来自 JWT 教程中 `/auth` 和 `/health` 的路由已经是 `@Public()` 了。`GET /me` 适用于任何已登录用户：

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

资源的策略有一个能力，即管理它们。用户参数接受 `null`，即访客，因此**守卫**可以在任何路由上调用它：

```typescript title="src/resources/resource.policy.ts"
import { Policy } from '@nestjs/authorization';
import type { User } from '../users/user.js';

@Policy()
export class ResourcePolicy {
  // `null` is a guest.
  manage(user: User | null) {
    return user?.role === 'staff';
  }
}

```

**请求**模式，包括后续部分添加的可用性路由的查询字符串：

```typescript title="src/resources/resources.schemas.ts"
import { z } from 'zod';

const name = z.string().trim().min(1).max(200);
// Any IANA time zone the runtime knows, such as Europe/Warsaw.
const timeZone = z.string().refine(isTimeZone, 'Unknown time zone');
// A local time of day, HH:MM.
const timeOfDay = z.iso.time({ precision: -1 });
const slotMinutes = z.number().int().min(5).max(480);

export const createResourceSchema = z
  .object({ name, timeZone, opensAt: timeOfDay, closesAt: timeOfDay, slotMinutes })
  .refine((r) => r.opensAt < r.closesAt, { message: 'Must be after opensAt', path: ['closesAt'] });
export type CreateResourceDto = z.infer<typeof createResourceSchema>;

// The time zone and opening hours stay as created: changing them would leave
// existing bookings outside the hours.
export const updateResourceSchema = z.object({ name, slotMinutes, active: z.boolean() }).partial();
export type UpdateResourceDto = z.infer<typeof updateResourceSchema>;

export const availabilityQuerySchema = z.object({
  // A day in the resource's time zone.
  date: z.iso.date(),
});
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

function isTimeZone(value: string): boolean {
  // Names only: PostgreSQL reads an offset such as +01:00 the POSIX way, with the sign flipped.
  if (/^[+-]/.test(value)) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

```

`isTimeZone()` 向运行时的时间区域数据库查询，该数据库接受 IANA 名称、其别名和 `UTC`。`Intl.supportedValuesOf('timeZone')` 看起来是应该检查的明显列表，但它只包含规范名称，并排除了 `UTC`。运行时还接受一个偏移量，例如 `+01:00`，PostgreSQL 的 `AT TIME ZONE` 将其读取为 POSIX 偏移量，东西颠倒：使用 `+01:00` 创建的房间将提前两个小时开放，而不会报错，因此拒绝偏移量。

```typescript title="src/resources/resources.service.ts"
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { resources, type Resource } from '../database/schema.js';
import type { CreateResourceDto, UpdateResourceDto } from './resources.schemas.js';

@Injectable()
export class ResourcesService {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  findAll(): Promise<Resource[]> {
    return this.db.select().from(resources).where(eq(resources.active, true)).orderBy(asc(resources.name)).limit(100);
  }

  async findOne(id: string): Promise<Resource> {
    const [resource] = await this.db
      .select()
      .from(resources)
      .where(and(eq(resources.id, id), eq(resources.active, true)));
    return resource ?? notFound();
  }

  async create(dto: CreateResourceDto): Promise<Resource> {
    const [resource] = await this.db.insert(resources).values(dto).returning();
    return resource;
  }

  async update(id: string, dto: UpdateResourceDto): Promise<Resource> {
    const [resource] = await this.db.update(resources).set(dto).where(eq(resources.id, id)).returning();
    return resource ?? notFound();
  }
}

function notFound(): never {
  throw new NotFoundException('Resource not found');
}

```

资源被停用而不是删除，因为预订引用它们。读取路由是 `@Public()`，写入路由在处理程序运行前检查策略。访客会收到 401，要求他们登录，而未是员工的已登录用户会收到 403，表示登录无济于事：

```typescript title="src/resources/resources.controller.ts"
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { ApiSecurity } from '@nestjs/swagger';
import { z } from 'zod';
import { ResourcePolicy } from './resource.policy.js';
import {
  createResourceSchema,
  updateResourceSchema,
  type CreateResourceDto,
  type UpdateResourceDto,
} from './resources.schemas.js';
import { ResourcesService } from './resources.service.js';

const resourceId = { schema: z.uuid() };

@Controller('resources')
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Public()
  @ApiSecurity({})
  @Get()
  findAll() {
    return this.resourcesService.findAll();
  }

  @Public()
  @ApiSecurity({})
  @Get(':id')
  findOne(@Param('id', resourceId) id: string) {
    return this.resourcesService.findOne(id);
  }

  @Can(ResourcePolicy, 'manage')
  @Post()
  create(@Body({ schema: createResourceSchema }) dto: CreateResourceDto) {
    return this.resourcesService.create(dto);
  }

  @Can(ResourcePolicy, 'manage')
  @Patch(':id')
  update(@Param('id', resourceId) id: string, @Body({ schema: updateResourceSchema }) dto: UpdateResourceDto) {
    return this.resourcesService.update(id, dto);
  }
}

```

将策略注册为其**模块**的**提供者**；授权**模块**在那里找到它：

```typescript title="src/resources/resources.module.ts"
import { Module } from '@nestjs/common';
import { ResourcePolicy } from './resource.policy.js';
import { ResourcesController } from './resources.controller.js';
import { ResourcesService } from './resources.service.js';

@Module({
  controllers: [ResourcesController],
  providers: [ResourcesService, ResourcePolicy],
})
export class ResourcesModule {}

```

注册用户创建客户。在数据库中提升第一名员工（此后，您自己的管理员屏幕可以执行此操作）：

```bash
$ docker exec booking-db psql -U postgres -d booking -c "UPDATE users SET role = 'staff' WHERE email = 'sam@example.com'"

```

#### 无重复预订地预订

预订**请求**指定了资源和两个时间点。每个时间点必须携带一个偏移量，UTC 为 `Z` 或类似 `+01:00`。没有偏移量的时间，例如 `2026-12-01T10:00:00`，意味着每个时区的不同时间点，因此返回 400 而不是猜测：

```typescript title="src/bookings/bookings.schemas.ts"
import { z } from 'zod';

// An instant with an explicit offset, such as 2026-12-01T10:00:00+01:00 or ...Z.
// A local time without one ("10:00 where?") is a 400.
const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

export const createBookingSchema = z
  .object({ resourceId: z.uuid(), startsAt: instant, endsAt: instant })
  .refine((b) => b.endsAt > b.startsAt, { message: 'Must be after startsAt', path: ['endsAt'] });
export type CreateBookingDto = z.infer<typeof createBookingSchema>;

```

处理程序接收 `Date` 对象，即模式的输出。OpenAPI 文档描述了输入，字符串格式为 `date-time`。

当插入破坏约束时，PostgreSQL 会使用 SQLSTATE `23P01`、`exclusion_violation` 失败，并命名该约束。Drizzle 将驱动程序的错误包装在 `DrizzleQueryError` 中，其消息是失败的**查询**，并将驱动程序的 `DatabaseError` 作为其 `cause`：

```typescript title="src/database/errors.ts"
import { DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';

/** Whether a query failed because it would have violated the named exclusion constraint. */
export function isExclusionViolation(error: unknown, constraint: string): boolean {
  // Drizzle wraps the driver's error: the PostgreSQL error is its `cause`.
  const cause = error instanceof DrizzleQueryError ? error.cause : error;
  // 23P01 is exclusion_violation.
  return cause instanceof DatabaseError && cause.code === '23P01' && cause.constraint === constraint;
}

```

**服务**插入预订，并将该单个错误转换为 409：

```typescript title="src/bookings/bookings.service.ts"
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { isExclusionViolation } from '../database/errors.js';
import { bookings, resources, type Booking } from '../database/schema.js';
import type { CreateBookingDto } from './bookings.schemas.js';

@Injectable()
export class BookingsService {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  async create(userId: string, { resourceId, startsAt, endsAt }: CreateBookingDto): Promise<Booking> {
    // A time of day in the resource's time zone.
    const local = (instant: Date) => sql`(${instant}::timestamptz AT TIME ZONE ${resources.timeZone})`;
    try {
      // One statement: inserts the booking only if the resource is active and the
      // booking fits its opening hours. The exclusion constraint does the rest.
      const [booking] = await this.db
        .insert(bookings)
        .select((qb) =>
          qb
            .select({
              resourceId: resources.id,
              userId: sql`${userId}::uuid`.as('user_id'),
              startsAt: sql`${startsAt}::timestamptz`.as('starts_at'),
              endsAt: sql`${endsAt}::timestamptz`.as('ends_at'),
            })
            .from(resources)
            .where(
              and(
                eq(resources.id, resourceId),
                eq(resources.active, true),
                sql`${startsAt}::timestamptz > now()`,
                sql`${local(startsAt)}::date = ${local(endsAt)}::date`,
                sql`${local(startsAt)}::time >= ${resources.opensAt}`,
                sql`${local(endsAt)}::time <= ${resources.closesAt}`,
              ),
            )
            // Locks the resource's row: bookings of one resource take turns.
            .for('no key update'),
        )
        .returning();
      return booking ?? (await this.refuseBooking(resourceId));
    } catch (error) {
      if (isExclusionViolation(error, 'bookings_no_overlap')) {
        throw new ConflictException('The resource is already booked at that time');
      }
      throw error;
    }
  }

  findUpcoming(userId: string): Promise<Booking[]> {
    return this.db
      .select()
      .from(bookings)
      .where(and(eq(bookings.userId, userId), gt(bookings.endsAt, sql`now()`)))
      .orderBy(asc(bookings.startsAt))
      .limit(100);
  }

  async findOne(userId: string, id: string): Promise<Booking> {
    const [booking] = await this.db.select().from(bookings).where(this.owned(userId, id));
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    return booking;
  }

  private owned(userId: string, id: string) {
    return and(eq(bookings.id, id), eq(bookings.userId, userId));
  }

  /** Why the insert added no row: 404 for an unknown resource, 422 for times that don't fit. */
  private async refuseBooking(resourceId: string): Promise<never> {
    const [resource] = await this.db
      .select({ id: resources.id })
      .from(resources)
      .where(and(eq(resources.id, resourceId), eq(resources.active, true)));
    if (!resource) {
      throw new NotFoundException('Resource not found');
    }
    throw new UnprocessableEntityException('A booking must start in the future, within the opening hours of one day');
  }
}

```

- **代码中没有检查重叠预订。** 插入要么提交，要么在约束上失败，而 `catch` 将该失败转换为 409，告知客户端该时段已被占用，但可能仍有其他时段可用。任何其他数据库错误都保持 500。
- **插入是来自资源行的 `INSERT ... SELECT`。** 它仅在资源处于活动状态、预订开始于未来，并且符合某一个本地日期的开放时间时才插入预订，因此在写入之前没有读取操作。`AT TIME ZONE` 将每个时间点转换为资源所在日期的本地时间，使用该日期的有效偏移量，因此夏季和冬季的小时数含义相同。
- **`SELECT` 锁定资源行**（`FOR NO KEY UPDATE`），因此一个资源的预订是轮流进行的；不同资源的预订不会互相等待。仅约束就能保持数据正确，但同时在运行的两个插入操作可能会互相等待对方的检查，PostgreSQL 会在死锁超时后（默认为一秒）通过中止其中一个（`40P01`、`deadlock detected`）来解决。没有锁时，在十用户测试的 100 次运行中有 4 次以 500 错误发生。有了锁，第二个预订会等待第一个提交，然后立即在约束上失败。锁仅持有一个语句的时间。
- **没有插入的行意味着 404 或 422。** `refuseBooking()` 会告知未知或非活动资源（404）或不符合时间限制（422，服务器无法执行的有效**请求**）。

每个已登录用户都可以预订，并且只能看到自己的预订：

```typescript title="src/bookings/bookings.controller.ts"
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { z } from 'zod';
import { createBookingSchema, type CreateBookingDto } from './bookings.schemas.js';
import { BookingsService } from './bookings.service.js';

const bookingId = { schema: z.uuid() };

// Any signed-in user books, and sees only their own bookings.
@Can.Anyone()
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  create(@CurrentUser('id') userId: string, @Body({ schema: createBookingSchema }) dto: CreateBookingDto) {
    return this.bookingsService.create(userId, dto);
  }

  @Get()
  findUpcoming(@CurrentUser('id') userId: string) {
    return this.bookingsService.findUpcoming(userId);
  }

  @Get(':id')
  findOne(@CurrentUser('id') userId: string, @Param('id', bookingId) id: string) {
    return this.bookingsService.findOne(userId, id);
  }
}

```

预订**模块**注册了**控制器**和**服务**：

```typescript title="src/bookings/bookings.module.ts"
import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';

@Module({
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}

```

#### 列出某天的空闲时段

在预订之前，用户想查看哪些时段是空闲的。一个资源的某天的时段是其开放时间被切分成 `slotMinutes` 的片段，当没有已确认的预订与之重叠时，该时段即为空闲。PostgreSQL 在一个**查询**中计算出完整的列表：`generate_series()` 生成时段，而 `NOT EXISTS` 剔除与预订重叠的时段，重叠测试与约束中的相同。将该方法添加到 `ResourcesService`：

```typescript title="src/resources/resources.service.ts"
import { and, asc, eq, sql } from 'drizzle-orm';
import { bookings, resources, type Resource } from '../database/schema.js';
// ...

export interface Slot {
  startsAt: Date;
  endsAt: Date;
}

@Injectable()
export class ResourcesService {
  // ...

  /** The free slots of one day, in the resource's time zone, that haven't started yet. */
  async availability(id: string, date: string): Promise<Slot[]> {
    const { timeZone, opensAt, closesAt, slotMinutes } = await this.findOne(id);
    const length = sql`make_interval(mins => ${slotMinutes})`;
    // The day's opening and closing times, as instants. AT TIME ZONE applies the
    // offset that is valid on that date, so a day with a DST change is right too.
    const opens = sql`(${date}::date + ${opensAt}::time) AT TIME ZONE ${timeZone}`;
    const closes = sql`(${date}::date + ${closesAt}::time) AT TIME ZONE ${timeZone}`;
    const slot = sql`slot`;

    return this.db
      .select({
        startsAt: sql`${slot}`.mapWith(bookings.startsAt),
        endsAt: sql`${slot} + ${length}`.mapWith(bookings.endsAt),
      })
      .from(sql`generate_series(${opens}, ${closes} - ${length}, ${length}) AS slot`)
      .where(
        and(
          sql`${slot} > now()`,
          // The same rule as the exclusion constraint: confirmed bookings, half-open ranges.
          sql`NOT EXISTS (
            SELECT 1 FROM ${bookings}
            WHERE ${bookings.resourceId} = ${id}
              AND ${bookings.status} = 'confirmed'
              AND tstzrange(${bookings.startsAt}, ${bookings.endsAt}) && tstzrange(${slot}, ${slot} + ${length})
          )`,
        ),
      )
      .orderBy(slot);
  }
}

```

- **日期是资源所在时区的日期。** `2026-12-01` 加上 `09:00`，在 `Europe/Warsaw` 时，是 08:00 UTC；在七月，相同的表达式给出 07:00 UTC。在时钟变更的当天，该系列仍从开门时间运行到闭店时间。
- **`mapWith(bookings.startsAt)`** 以 Drizzle 解码 `timestamptz` 列的方式解码计算出的列，因此时段是像 API 返回的其他时间一样是 `Date` 对象。
- **该**查询**可以使用约束的索引。** 它过滤的资源、状态和范围表达式与 `bookings_no_overlap` 相同，因此 PostgreSQL 可以在该索引中查找预订。
- **空闲时段是一个提示，而不是预订。** 在列出和预订之间，其他人可能会抢占该时段，此时预订会返回 409。这就是约束发挥作用；客户端会再次列出时段。

该路由是公开的，与目录的其余部分一样：

```typescript title="src/resources/resources.controller.ts"
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
// ...
import {
  availabilityQuerySchema,
  createResourceSchema,
  updateResourceSchema,
  type AvailabilityQuery,
  type CreateResourceDto,
  type UpdateResourceDto,
} from './resources.schemas.js';
// ...

  @Public()
  @ApiSecurity({})
  @Get(':id/availability')
  async availability(
    @Param('id', resourceId) id: string,
    @Query({ schema: availabilityQuerySchema }) { date }: AvailabilityQuery,
  ) {
    return { date, slots: await this.resourcesService.availability(id, date) };
  }

```

#### 在截止时间前取消

用户可以在预订开始前最多 24 小时取消预订。与此应用程序中的所有状态变更一样，取消是一个条件 `UPDATE`：仅当预订属于该用户、仍处于已确认状态，并且开始时间比当前时间（按数据库时钟测量）晚于 24 小时时，才会更改预订。添加到 `BookingsService`：

```typescript title="src/bookings/bookings.service.ts"
// ...

/** How long before its start a booking can still be cancelled. */
const CANCELLATION_CUTOFF = '24 hours';

@Injectable()
export class BookingsService {
  // ...

  /** The owner cancels a confirmed booking, up to the cutoff before it starts. */
  async cancel(userId: string, id: string): Promise<Booking> {
    // Conditional, and on the database's clock: of two cancellations, or one at
    // the moment of the cutoff, the WHERE clause decides.
    const [booking] = await this.db
      .update(bookings)
      .set({ status: 'cancelled', cancelledAt: sql`now()` })
      .where(
        and(
          this.owned(userId, id),
          eq(bookings.status, 'confirmed'),
          sql`${bookings.startsAt} > now() + ${CANCELLATION_CUTOFF}::interval`,
        ),
      )
      .returning();
    return booking ?? (await this.refuseCancel(userId, id));
  }

  // ...

  /** Why the cancellation changed nothing: 404 if the booking isn't theirs, 409 otherwise. */
  private async refuseCancel(userId: string, id: string): Promise<never> {
    const { status } = await this.findOne(userId, id);
    if (status === 'cancelled') {
      throw new ConflictException('Booking is already cancelled');
    }
    throw new ConflictException(`Bookings can't be cancelled less than ${CANCELLATION_CUTOFF} before they start`);
  }
}

```

一个读取预订、检查其状态和开始时间的 **服务** 在 JavaScript 中，然后保存它的过程，会在检查和写入之间存在一个时间差。在这里，`WHERE` 子句就是检查。一旦状态变为 `cancelled`，约束就不再计算该预订，因此在同一瞬间，该时段对其他人是空闲的。

取消更改现有预订，因此返回 200，而不是 201：

```typescript title="src/bookings/bookings.controller.ts"
import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
// ...

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser('id') userId: string, @Param('id', bookingId) id: string) {
    return this.bookingsService.cancel(userId, id);
  }

```

#### 试用

启动应用程序：

```bash
$ npm run start:dev

```

下面的日期是在记录此会话时未来的；请使用今天之后和明天之后的日期进行最后一次示例。注册一个用户和一个员工，并像上面所示提升该员工的权限。由于角色在每次**请求**时读取（令牌和**响应**主体在此和下缩短）：

```bash
$ curl localhost:3000/auth/sign-up --json '{"email":"ada@example.com","password":"correct horse battery"}'
{"accessToken":"eyJhbGciOiJIUzI1NiIs...","refreshToken":"...","expiresIn":900}
$ ADA="Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
$ SAM="Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."

```

只有员工可以添加资源。这个房间在华沙，当地时间 09:00 到 17:00 开放，时段为一小时：

```bash
$ curl localhost:3000/resources -H "$ADA" --json '{"name":"Room A","timeZone":"Europe/Warsaw","opensAt":"09:00","closesAt":"17:00","slotMinutes":60}'
{"message":"Forbidden","statusCode":403}
$ curl localhost:3000/resources -H "$SAM" --json '{"name":"Room A","timeZone":"Europe/Warsaw","opensAt":"09:00","closesAt":"17:00","slotMinutes":60}'
{"id":"8bc932f4-1aa4-4ba1-a16d-0dca819ef5c8","name":"Room A","timeZone":"Europe/Warsaw","opensAt":"09:00:00","closesAt":"17:00:00","slotMinutes":60,"active":true,"createdAt":"2026-11-19T22:06:06.275Z"}

```

12 月 1 日是华沙的冬季日期，比 UTC 快一小时，因此该房间的八个时段从 08:00 UTC 到 16:00 UTC：

```bash
$ curl "localhost:3000/resources/8bc932f4-1aa4-4ba1-a16d-0dca819ef5c8/availability?date=2026-12-01"
{"date":"2026-12-01","slots":[{"startsAt":"2026-12-01T08:00:00.000Z","endsAt":"2026-12-01T09:00:00.000Z"},{"startsAt":"2026-12-01T09:00:00.000Z","endsAt":"2026-12-01T10:00:00.000Z"},...,{"startsAt":"2026-12-01T15:00:00.000Z","endsAt":"2026-12-01T16:00:00.000Z"}]}

```

Ada 预订了华沙时间的 10:00 到 11:00，带有偏移量。**响应**具有相同的瞬间，以 UTC 表示：

```bash
$ curl localhost:3000/bookings -H "$ADA" --json '{"resourceId":"8bc932f4-1aa4-4ba1-a16d-0dca819ef5c8","startsAt":"2026-12-01T10:00:00+01:00","endsAt":"2026-12-01T11:00:00+01:00"}'
{"id":"f30a70ac-eec9-4f60-920d-2bd86f603e31","resourceId":"8bc932f4-1aa4-4ba1-a16d-0dca819ef5c8","userId":"d0276247-b9ac-4830-a774-fdb5f452f03c","startsAt":"2026-12-01T09:00:00.000Z","endsAt":"2026-12-01T10:00:00.000Z","status":"confirmed","createdAt":"2026-11-19T22:06:46.343Z","cancelledAt":null}

```

Sam 不能预订其中的半小时，但可以预订下一个小时，该小时从 Ada 结束的地方开始。没有偏移量的时段返回 400，预订开始时间早于房间开放时间返回 422：

```bash
$ curl localhost:3000/bookings -H "$SAM" --json '{"resourceId":"8bc932f4-1aa4-4ba1-a16d-0dca819ef5c8","startsAt":"2026-12-01T09:30:00Z","endsAt":"2026-12-01T10:30:00Z"}'
{"message":"The resource is already booked at that time","error":"Conflict","statusCode":409}
$ curl localhost:3000/bookings -H "$SAM" --json '{"resourceId":"8bc932f4-1aa4-4ba1-a16d-0dca819ef5c8","startsAt":"2026-12-01T10:00:00Z","endsAt":"2026-12-01T11:00:00Z"}'
{"id":"db5a86fc-3015-4f22-8106-33b0f013dfce",...,"startsAt":"2026-12-01T10:00:00.000Z","endsAt":"2026-12-01T11:00:00.000Z","status":"confirmed",...}
$ curl localhost:3000/bookings -H "$SAM" --json '{"resourceId":"8bc932f4-1aa4-4ba1-a16d-0dca819ef5c8","startsAt":"2026-12-01T12:00:00","endsAt":"2026-12-01T13:00:00"}'
{"message":["startsAt: Invalid ISO datetime","endsAt: Invalid ISO datetime"],"error":"Bad Request","statusCode":400}
$ curl localhost:3000/bookings -H "$SAM" --json '{"resourceId":"8bc932f4-1aa4-4ba1-a16d-0dca819ef5c8","startsAt":"2026-12-01T07:00:00Z","endsAt":"2026-12-01T09:00:00Z"}'
{"message":"A booking must start in the future, within the opening hours of one day","error":"Unprocessable Entity","statusCode":422}

```

两个已预订的小时段从空闲时段中移除。在 2027 年 3 月 28 日，波兰提前时钟，同一房间的开放时间变为 07:00 UTC：

```bash
$ curl "localhost:3000/resources/8bc932f4-1aa4-4ba1-a16d-0dca819ef5c8/availability?date=2026-12-01"
{"date":"2026-12-01","slots":[{"startsAt":"2026-12-01T08:00:00.000Z","endsAt":"2026-12-01T09:00:00.000Z"},{"startsAt":"2026-12-01T11:00:00.000Z","endsAt":"2026-12-01T12:00:00.000Z"},...]}
$ curl "localhost:3000/resources/8bc932f4-1aa4-4ba1-a16d-0dca819ef5c8/availability?date=2027-03-28"
{"date":"2027-03-28","slots":[{"startsAt":"2027-03-28T07:00:00.000Z","endsAt":"2027-03-28T08:00:00.000Z"},...,{"startsAt":"2027-03-28T14:00:00.000Z","endsAt":"2027-03-28T15:00:00.000Z"}]}

```

Ada 取消了她的预订。Sam 对其返回 404，因为它不存在的预订，并且只能取消一次。其时段立即再次空闲：

```bash
$ curl -X POST localhost:3000/bookings/f30a70ac-eec9-4f60-920d-2bd86f603e31/cancel -H "$SAM"
{"message":"Booking not found","error":"Not Found","statusCode":404}
$ curl -X POST localhost:3000/bookings/f30a70ac-eec9-4f60-920d-2bd86f603e31/cancel -H "$ADA"
{"id":"f30a70ac-eec9-4f60-920d-2bd86f603e31",...,"status":"cancelled","createdAt":"2026-11-19T22:06:46.343Z","cancelledAt":"2026-11-19T22:07:12.645Z"}
$ curl -X POST localhost:3000/bookings/f30a70ac-eec9-4f60-920d-2bd86f603e31/cancel -H "$ADA"
{"message":"Booking is already cancelled","error":"Conflict","statusCode":409}
$ curl localhost:3000/bookings -H "$SAM" --json '{"resourceId":"8bc932f4-1aa4-4ba1-a16d-0dca819ef5c8","startsAt":"2026-12-01T09:30:00Z","endsAt":"2026-12-01T10:00:00Z"}'
{"id":"32d1c620-05b3-4239-82b5-e0b4cbf45b99",...,"startsAt":"2026-12-01T09:30:00.000Z","endsAt":"2026-12-01T10:00:00.000Z","status":"confirmed",...}

```

预订明早的预订在创建时就超过了截止时间：

```bash
$ curl localhost:3000/bookings -H "$ADA" --json '{"resourceId":"8bc932f4-1aa4-4ba1-a16d-0dca819ef5c8","startsAt":"2026-11-20T10:00:00+01:00","endsAt":"2026-11-20T11:00:00+01:00"}'
{"id":"dc96c803-b64d-4c17-acf2-385b4c860a9c",...,"startsAt":"2026-11-20T09:00:00.000Z","endsAt":"2026-11-20T10:00:00.000Z","status":"confirmed",...}
$ curl -X POST localhost:3000/bookings/dc96c803-b64d-4c17-acf2-385b4c860a9c/cancel -H "$ADA"
{"message":"Bookings can't be cancelled less than 24 hours before they start","error":"Conflict","statusCode":409}

```

#### 测试

这里重要的保证是关于并发的，像 PGlite 这样的进程内数据库只有一个连接，**请求**永远不会真正竞争。因此，这些测试是针对真实的 PostgreSQL 服务器运行的，通过连接池，使用 `app.inject()` 发送同时运行的**请求**。**迁移**（包括自定义的）设置了数据库：

```typescript title="test/bookings.e2e-spec.ts"
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
import { bookings, users } from '../src/database/schema.js';
import type { Role } from '../src/users/user.js';

// A real PostgreSQL with a pool, so concurrent bookings really race.
const url = process.env.TEST_DATABASE_URL;

// Three days from now, in UTC: in the future, and past the cancellation cutoff.
const day = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const at = (time: string) => `${day}T${time}:00Z`;

describe.skipIf(!url)('Booking API (e2e)', () => {
  const db = drizzle({ client: new Pool({ connectionString: url, max: 20 }) });
  let app: NestNodeApplication;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
    await db.execute(sql`TRUNCATE users, resources, bookings, refresh_tokens CASCADE`);
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

  /** A room open 08:00 to 18:00 UTC, with one-hour slots. */
  async function createRoom() {
    const res = await app.inject({
      method: 'POST',
      url: '/resources',
      headers: await signUp(`staff-${crypto.randomUUID()}@example.com`, 'staff'),
      payload: { name: 'Room', timeZone: 'UTC', opensAt: '08:00', closesAt: '18:00', slotMinutes: 60 },
    });
    expect(res.statusCode).toBe(201);
    return res.json<{ id: string }>().id;
  }

  function book(headers: Record<string, string>, resourceId: string, startsAt: string, endsAt: string) {
    return app.inject({ method: 'POST', url: '/bookings', headers, payload: { resourceId, startsAt, endsAt } });
  }

  function cancel(headers: Record<string, string>, bookingId: string) {
    return app.inject({ method: 'POST', url: `/bookings/${bookingId}/cancel`, headers });
  }

  it('lets only staff create resources', async () => {
    const payload = { name: 'Room', timeZone: 'UTC', opensAt: '08:00', closesAt: '18:00', slotMinutes: 60 };
    const customer = await signUp('customer@example.com');
    expect((await app.inject({ method: 'POST', url: '/resources', payload })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/resources', headers: customer, payload })).statusCode).toBe(403);
  });

  it('books a slot exactly once when ten users race for it', async () => {
    const roomId = await createRoom();
    const racers = await Promise.all(Array.from({ length: 10 }, (_, i) => signUp(`racer${i}@example.com`)));

    const results = await Promise.all(racers.map((headers) => book(headers, roomId, at('10:00'), at('11:00'))));

    expect(results.map((res) => res.statusCode).sort()).toEqual([201, ...Array(9).fill(409)]);
    const rows = await db.select().from(bookings).where(eq(bookings.resourceId, roomId));
    expect(rows).toHaveLength(1);
  });

  it('accepts back-to-back bookings, and refuses overlapping ones', async () => {
    const roomId = await createRoom();
    const headers = await signUp('back-to-back@example.com');

    expect((await book(headers, roomId, at('10:00'), at('11:00'))).statusCode).toBe(201);
    // Ends exactly when the next one starts: the ranges are half-open.
    expect((await book(headers, roomId, at('11:00'), at('12:00'))).statusCode).toBe(201);
    expect((await book(headers, roomId, at('09:00'), at('10:00'))).statusCode).toBe(201);
    // Any overlap, even one minute, is refused.
    expect((await book(headers, roomId, at('11:59'), at('13:00'))).statusCode).toBe(409);

    const availability = await app.inject({ method: 'GET', url: `/resources/${roomId}/availability?date=${day}` });
    const { slots } = availability.json<{ slots: { startsAt: string }[] }>();
    const starts = slots.map((slot) => slot.startsAt.slice(11, 16));
    expect(starts).toEqual(['08:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']);
  });

  it('frees the slot when a booking is cancelled', async () => {
    const roomId = await createRoom();
    const ada = await signUp('ada@example.com');
    const bob = await signUp('bob@example.com');
    const booking = (await book(ada, roomId, at('14:00'), at('15:00'))).json<{ id: string }>();

    // Someone else's booking is a 404, as if it didn't exist.
    expect((await cancel(bob, booking.id)).statusCode).toBe(404);
    expect((await cancel(ada, booking.id)).json()).toMatchObject({ status: 'cancelled' });
    expect((await cancel(ada, booking.id)).statusCode).toBe(409);

    // The cancelled booking still overlaps, but the constraint only counts confirmed ones.
    expect((await book(bob, roomId, at('14:30'), at('15:30'))).statusCode).toBe(201);
  });

  it('refuses to cancel a booking that starts within the cutoff', async () => {
    const roomId = await createRoom();
    const headers = await signUp('late@example.com');
    const [{ id: userId }] = await db.select({ id: users.id }).from(users).where(eq(users.email, 'late@example.com'));
    // Inserted directly: it starts in an hour, whatever the room's opening hours.
    const [booking] = await db
      .insert(bookings)
      .values({
        resourceId: roomId,
        userId,
        startsAt: new Date(Date.now() + 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      })
      .returning();

    expect((await cancel(headers, booking.id)).statusCode).toBe(409);
    const [row] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(row.status).toBe('confirmed');
  });
});

```

- **“恰好一次预订一个时段”** 同时发送了来自十个用户的相同一小时的十个预订。一个返回 201，九个返回 409，表中只保留了一个预订。
- **“连续”** 预订 10:00 到 11:00，然后 11:00 到 12:00 和 09:00 到 10:00，它们接触但没有重叠，然后一个重叠一分钟的预订。剩余的空闲时段是预订留下的。
- **“释放时段”** 检查了约束的 `WHERE` 子句是否有效：一旦预订被取消，重叠的预订就会成功。
- **“在截止时间内”** 直接将一个开始时间在当前小时的预订插入到表中，因为 API 是否接受它取决于测试运行的当天时间，并且未能取消它。

创建自己的数据库，因为测试会截断表，然后运行它们：

```bash
$ docker exec booking-db psql -U postgres -c "CREATE DATABASE booking_test"
$ TEST_DATABASE_URL=postgres://postgres:booking@localhost:5432/booking_test npm run test:e2e -- --no-file-parallelism

 Test Files  2 passed (2)
      Tests  10 passed (10)

```

JWT 教程的刷新令牌存储测试也会运行。两个测试文件截断同一数据库的表，所以 `--no-file-parallelism` 依次运行它们。

从测试数据库中删除约束（`ALTER TABLE bookings DROP CONSTRAINT bookings_no_overlap`）然后再次运行测试：所有十个竞争用户都获得 201，并且连续测试中重叠的预订也被接受。

#### 生产检查清单

JWT 教程中的 [checklist](/tutorials/rest-api-jwt-authentication#production-checklist) 全部适用。特别是对于预订：

- **像其他任何一样发布自定义迁移。** `drizzle-kit migrate` 按顺序执行它，作为发布步骤。它的第一个语句创建了 `btree_gist`；如果运行迁移的角色不能在数据库上创建扩展，请由管理员创建一次。
- **在向现有表添加约束之前清理重叠。** 如果已确认的预订存在重叠，`ALTER TABLE ... ADD CONSTRAINT` 会失败并命名冲突的两个行。
- **端到端保持时间为 UTC。** 存储 `timestamptz`，使用 `Z` 返回 ISO 8601，仅在客户端显示时转换为本地时间。将时区保留为 IANA 名称，切勿使用固定偏移量，如 `+01:00`，因为这在一年中的一半时间是错误的。
- **仅将您的约束违规映射到 409。** 其他所有数据库错误都是缺陷，应保持 500，因此会被报告为 500。
- **为生产环境提供独立的 Observe 密钥对，并了解 409 在其中的含义。** 在项目的 **API Keys** 页面创建该对，并在平台的环境中将其设置为 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET`：`start:prod` 不会加载 `.env`。然后 [NestJS Observe](https://docs.nestjs.com/observability/error-monitoring) 在其错误视图中列出每个失败的请求，但您的代码故意抛出的异常，例如此 `ConflictException`，不计为新缺陷，并且 4xx 响应不计入错误率。许多用户尝试预订的繁忙时段显示为 409，而不是警报。未映射的 `23P01` 或 `40P01` 死锁是 500，并且会触发警报。
- **观察负载下的锁。** 一个流行资源的预订会在其行上互相等待，等待一个 `INSERT` 的时长。Observe 记录了每个路由的平均和 p95 延迟，因此 `POST /bookings` 在高峰期减速是可见的。

#### 后续步骤

- 在用户付款期间保持时段：一个具有 `held` 状态和 `expires_at` 的预订。约束的 `WHERE` 子句不能与 `now()` 比较，因为索引谓词每次都必须给出相同的结果，因此过期的保持会阻塞其时段，直到一个语句释放它。在预订自身的语句或事务中，或从 [scheduled job](/techniques/task-scheduling) 中释放同一资源的过期保持。
- 在每次预订之前，在请求外部发送确认和提醒：[Mail](/application/mail) 和 [Queues](/techniques/queues)。
- 为工作人员提供资源所有预订的视图，并允许他们取消其中任何一个，使用另一个 [policy](/security/authorization)。
- 按请求查看生产环境中的慢速预订及其 SQL：[Observability](/observability/overview)。