<!-- 此文件从 content/recipes/supabase.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:37:27.058Z -->
<!-- 源文件: content/recipes/supabase.md -->
<!-- 源哈希: bc194aba689d6864fa27072f622976e5 -->

### Supabase

Supabase 为应用程序提供 Postgres 数据库、登录、文件存储以及浏览器可以直接调用的 API，这涵盖了大量无需后端的功能。它缺失的是需要密钥、重试或时钟的工作：Stripe webhooks、定时任务、队列、管理 API。Nest 在 Supabase 旁边承担这些工作，使用相同的数据库和为相同的用户服务。

| 保留在 Supabase 中 | 移至 Nest 中 |
| --- | --- |
| 注册、登录和密码重置 | 检查调用者身份及其可能执行的操作 |
| Postgres、其迁移和行级安全 | 业务规则和跨多表的查询 |
| 行级安全覆盖的浏览器读写操作 | 任何需要密钥的操作：支付、邮件、其他 API |
| 存储和 Realtime | Stripe webhooks、定时任务、队列和管理 API |

浏览器继续直接调用 Supabase 以处理行级安全覆盖的部分，而其余部分则使用相同的访问令牌调用 Nest。

如果只需要一个或两个简短的函数，[Edge Functions](https://supabase.com/docs/guides/functions) 可能就足够了，无需运行服务器。它们有 [limits on CPU time and duration](https://supabase.com/docs/guides/functions/limits)，但没有运行队列工作者的地方，因此一旦有了任务、队列或共享代码的多个路由，Nest 会更合适。

此配方在本地 Supabase 栈上构建此类应用程序，以便您可以边阅读边运行每个步骤。[The finished module](/recipes/supabase#the-finished-module) 展示了各个组件是如何连接起来的。

#### 创建项目

本地栈需要 Docker。

```bash
$ npx @nestjs/cli new my-api
$ cd my-api
$ npx supabase init
$ npx supabase start

```

`npx supabase status -o env` 打印栈的 URL 和密钥。将 `API_URL`、`PUBLISHABLE_KEY`、`SECRET_KEY` 和 `DB_URL` 放入 `.env`，使用本配方读取的名称：

```bash
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

```

> warning **警告** 密钥绕过了行级安全。它只能存在于服务器上，绝不能出现在任何发送给浏览器或移动应用程序的内容中。

> info **提示** 托管项目在其仪表板中具有相同的密钥。到 2026 年底，Supabase 将使用较旧的 `anon` 和 `service_role` 密钥，因此请使用这两个。

使用 [`@nestjs/config`](/application/configuration) 加载 `.env`：

```bash
$ npm i --save @nestjs/config

```

```typescript
@Module({
  imports: [ConfigModule.forRoot()],
})
export class AppModule {}

```

将其保留在 `imports` 的开头，因为之后添加的 模块会按声明顺序读取 `process.env`。在另一个文件中声明的 模块在文件被导入时会更早读取，因此请使用 `forRootAsync()` 来注册内容。

#### 定义表

模式保留在 Supabase 的迁移中：

```bash
$ npx supabase migration new notes

```

在 `supabase/migrations` 创建的文件中编写该表，并设置一个策略，允许用户仅访问自己的行。`auth.uid()` 是请求访问令牌所属的用户：

```sql
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null
);

alter table public.notes enable row level security;

create policy "Users manage their own notes" on public.notes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

```

将其应用于本地数据库：

```bash
$ npx supabase db reset

```

> warning **警告** Supabase 的 API 将 `public` 模式中的表提供给拥有可发布密钥的任何人，而该密钥存在于您的浏览器代码中。请在您创建的每张表上启用行级安全，包括仅 Nest 使用的表。启用后且没有策略，密钥将读取不到任何内容。

#### 验证 Supabase 令牌

Supabase Auth 为每个已登录用户签发一个访问令牌，并发布用于验证的公钥。[`@nestjs/authentication`](/security/authentication) 可以验证来自其他发行者的令牌，因此 Nest 不需要来自 Supabase 的密钥来知道谁在调用：

```bash
$ npm i --save @nestjs/authentication

```

```typescript title="supabase/supabase-auth.ts"
import { Injectable } from '@nestjs/common';
import { AuthenticationRegistry, JwtBearerProvider, type JwtClaims } from '@nestjs/authentication';

export interface SupabaseUser {
  id: string;
  email?: string;
  role?: string;
}

@Injectable()
export class SupabaseAuth extends JwtBearerProvider<SupabaseUser> {
  constructor(registry: AuthenticationRegistry) {
    super({
      jwks: `${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
      issuer: `${process.env.SUPABASE_URL}/auth/v1`,
      audience: 'authenticated',
    });
    registry.registerProvider(this);
  }

  validate(claims: JwtClaims) {
    if (!claims.sub) {
      return null;
    }
    const { email, app_metadata } = claims as JwtClaims & {
      email?: string;
      app_metadata?: { role?: string };
    };
    return { id: claims.sub, email, role: app_metadata?.role };
  }
}

```

角色来自 `app_metadata`，只有您的服务器可以更改。已登录用户可以使用 `supabase.auth.updateUser()` 更改自己的 `user_metadata`，因此切勿基于此做出决策。

注册 模块 和 提供者：

```typescript
@Module({
  imports: [AuthenticationModule.forRoot({})],
  providers: [SupabaseAuth],
})
export class AppModule {}

```

该 模块 注册了一个全局 守卫，因此现在每个路由都会在没有有效令牌的情况下回答 `401 Unauthorized`，包括签名错误、其他发行者或受众、或已过期的令牌。使用 `@Public()` 标记一个保持开放的路由，并使用 `@CurrentUser()` 读取用户：

```typescript title="me/me.controller.ts"
import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import type { SupabaseUser } from '../supabase/supabase-auth.js';

@Controller('me')
export class MeController {
  @Get()
  me(@CurrentUser() user: SupabaseUser) {
    return user;
  }
}

```

> info **提示** 仍使用旧版 JWT 密钥的项目会用其签名令牌且不发布任何密钥。在您 [migrate to signing keys](https://supabase.com/docs/guides/auth/signing-keys) 之前，请使用 `key: process.env.SUPABASE_JWT_SECRET` 代替 `jwks`。

#### 从浏览器调用 Nest

浏览器发送 Supabase 提供的访问令牌。`getSession()` 在令牌过期时刷新令牌：

```typescript
const { data: { session } } = await supabase.auth.getSession();

const response = await fetch(`${API_URL}/me`, {
  headers: { Authorization: `Bearer ${session.access_token}` },
});

```

如果浏览器在另一个源上调用 Nest，请在应用程序启动时使用 [allow that origin](/security/cors)：

```typescript title="main.ts"
app.enableCors({ origin: process.env.WEB_ORIGIN });

```

#### 作为用户或作为服务器进行查询

`@supabase/supabase-js` 是您数据库 REST API 的客户端。从您的模式生成类型，这样对不存在的表或列的查询将编译失败，并在每次迁移后再次运行此操作：

```bash
$ npm i --save @supabase/supabase-js
$ npx supabase gen types typescript --local > src/supabase/database.types.ts

```

为服务器创建一个客户端，为每个请求为用户创建一个客户端。客户端不持有数据库连接，所以成本很低：

```typescript title="supabase/supabase.service.ts"
import { Injectable } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types.js';

const options = { auth: { persistSession: false, autoRefreshToken: false } };

@Injectable()
export class SupabaseService {
  /** Bypasses row level security. Only for what the server does on its own. */
  readonly admin = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    options,
  );

  /** Queries as the user who sent the token, so row level security applies. */
  forUser(token: string) {
    return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      ...options,
      accessToken: async () => token,
    });
  }
}

```

一个小的 装饰器 读取守卫已验证的令牌：

```typescript title="supabase/access-token.decorator.ts"
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export const AccessToken = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const { authorization } = context.switchToHttp().getRequest().headers;
  return authorization?.replace(/^Bearer /i, '');
});

```

在充当用户的路由中，优先使用 `forUser()`。您的策略会持续应用，因此忘记了过滤器的查询仍然只返回该用户的行，而对其他人的插入请求将被拒绝：

```typescript title="notes/notes.controller.ts"
import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { AccessToken } from '../supabase/access-token.decorator.js';
import type { SupabaseUser } from '../supabase/supabase-auth.js';
import { SupabaseService } from '../supabase/supabase.service.js';

@Controller('notes')
export class NotesController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get()
  async findAll(@AccessToken() token: string) {
    const { data, error } = await this.supabase.forUser(token).from('notes').select('body');
    if (error) {
      throw error;
    }
    return data;
  }

  @Post()
  async create(
    @AccessToken() token: string,
    @CurrentUser() user: SupabaseUser,
    @Body('body') body: string,
  ) {
    const { error } = await this.supabase.forUser(token).from('notes').insert({ user_id: user.id, body });
    if (error) {
      throw error;
    }
  }
}

```

对于服务器代表自身执行的操作（例如任务或 webhook），不涉及用户，请使用 `admin`。

#### 直接查询 Postgres

对于事务和 REST API 无法表达的查询，请使用 [`@nestjs/drizzle`](https://docs.nestjs.com/data/drizzle) 或另一个 [database integration](/data/overview) 连接到数据库。下面的 webhook 和任务也使用此连接：

```bash
$ npm i --save @nestjs/drizzle drizzle-orm pg

```

```typescript
DrizzleModule.forRoot({ drizzle, connection: process.env.DATABASE_URL! }),

```

在本地，`DATABASE_URL` 是栈的 `DB_URL`。在托管项目中，Nest 是一个持久的后端，因此请使用 [direct connection string](https://supabase.com/docs/guides/database/connecting-to-postgres)，或者如果您的主机仅有 IPv4，则使用会话模式下的共享池化器。池化器的事务模式不支持预编译语句，也不支持 BullMQ 的 PostgreSQL 后端使用的 `LISTEN`。

Supabase 的迁移保持事实来源，因此 Drizzle 模式仅描述要查询的表：

```typescript title="database/schema.ts"
import { pgTable, text, uuid } from 'drizzle-orm/pg-core';

export const notes = pgTable('notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  body: text('body').notNull(),
});

```

> 警告 **警告** 行级安全不保护这些查询。`postgres` 角色会绕过它，因此没有过滤条件的查询会返回每个用户的行，并且每个查询都必须检查所有者本身。

要让策略作用于直接查询，请以 `authenticated` 角色在事务中运行，并使用声明 `auth.uid()` 读取：

```typescript title="database/row-level-security.ts"
import { Injectable } from '@nestjs/common';
import type { JwtClaims } from '@nestjs/authentication';
import { InjectDrizzle } from '@nestjs/drizzle';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

type Transaction = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

@Injectable()
export class RowLevelSecurity {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  asUser<T>(claims: JwtClaims, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`
        select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true),
               set_config('role', 'authenticated', true)
      `);
      return work(tx);
    });
  }
}

```

这两个设置都以事务结束，因此它们永远不会到达该连接上的下一个查询。以下是每种方式的并排比较，其中 `@CurrentSession()` 向路由提供经过验证的声明：

```typescript title="notes/notes.repository.ts"
import { Injectable } from '@nestjs/common';
import type { JwtClaims } from '@nestjs/authentication';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { RowLevelSecurity } from '../database/row-level-security.js';
import { notes } from '../database/schema.js';
import type { SupabaseUser } from '../supabase/supabase-auth.js';

@Injectable()
export class NotesRepository {
  constructor(
    @InjectDrizzle() private readonly db: NodePgDatabase,
    private readonly rls: RowLevelSecurity,
  ) {}

  /** Checks the owner itself. */
  findAll(user: SupabaseUser) {
    return this.db.select({ body: notes.body }).from(notes).where(eq(notes.userId, user.id));
  }

  /** Leaves the owner to the table's policy. */
  findAllAsUser(claims: JwtClaims) {
    return this.rls.asUser(claims, (tx) => tx.select({ body: notes.body }).from(notes));
  }
}

```

#### 保护管理员 API

管理员 API 是浏览器本身无法完成的，因为它需要密钥。将用户的角色保留在 `app_metadata` 中，该 `SupabaseAuth` 已读取，并从服务器设置它：

```typescript
await supabase.admin.auth.admin.updateUserById(userId, {
  app_metadata: { role: 'admin' },
});

```

该角色在用户的下一个令牌中，因此已登录的用户在其令牌刷新时（默认一小时内）会获得它。

使用 [`@nestjs/authorization`](/security/authorization) 检查它：

```bash
$ npm i --save @nestjs/authorization

```

```typescript title="admin/admin.policy.ts"
import { Policy } from '@nestjs/authorization';
import type { SupabaseUser } from '../supabase/supabase-auth.js';

@Policy()
export class AdminPolicy {
  manage(user: SupabaseUser | null) {
    return user?.role === 'admin';
  }
}

```

```typescript title="admin/admin-users.controller.ts"
import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthorizationGuard, Can } from '@nestjs/authorization';
import { SupabaseService } from '../supabase/supabase.service.js';
import { AdminPolicy } from './admin.policy.js';

@UseGuards(AuthorizationGuard)
@Can(AdminPolicy, 'manage')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get()
  async findAll() {
    const { data, error } = await this.supabase.admin.auth.admin.listUsers();
    if (error) {
      throw error;
    }
    return data.users.map(({ id, email }) => ({ id, email }));
  }
}

```

使用 `AuthorizationModule.forRoot({ globalGuard: false })` 注册该 模块，并在 `providers` 中使用 `AdminPolicy`。其全局守卫默认开启，拒绝所有没有 `@Can()` 的路由，这也将关闭上述路由。访客获得 `401`，没有该角色的用户获得 `403`。

#### 接收 Stripe Webhook

[`@nestjs/webhooks`](/http/webhooks) 验证 Webhook 的签名并记住已处理的事件。它通过 `@nestjs/outbox` 将其状态保存在您的数据库中，在自己的模式中。Supabase 的 API 不提供这些模式，因此它们保持私有：

```bash
$ npm i --save @nestjs/webhooks @nestjs/outbox

```

签名覆盖了 Stripe 发送的确切字节，因此使用 `rawBody` 创建应用程序：

```typescript title="main.ts"
const app = await NestFactory.create(AppModule, { rawBody: true });

```

在模块的 `receivers` 中命名发送者，使用来自 Stripe 仪表板或 `stripe listen` 的签名密钥。此应用程序仅接收 Webhook，因此不需要后台工作进程：

```typescript
OutboxModule.forRoot({ relay: { enabled: false } }),
WebhooksModule.forRoot({
  worker: { enabled: false },
  receivers: {
    stripe: { scheme: 'stripe', secret: process.env.STRIPE_WEBHOOK_SECRET! },
  },
}),

```

在 `providers` 中注册两个存储。`migrate: true` 在启动时创建它们的模式，这适合开发（有关生产环境请参阅 [Deployment](/recipes/supabase#deployment)）：

```typescript
{
  provide: PostgresOutboxStore,
  inject: [getDrizzleToken(), OutboxStorage],
  useFactory: (db: NodePgDatabase, storage: OutboxStorage) =>
    new PostgresOutboxStore({ executor: fromDrizzle(db), migrate: true }, storage),
},
{
  provide: PostgresWebhookStore,
  inject: [getDrizzleToken(), WebhooksStorage],
  useFactory: (db: NodePgDatabase, storage: WebhooksStorage) =>
    new PostgresWebhookStore({ executor: fromDrizzle(db), migrate: true }, storage),
},

```

添加一个表来记录 Webhook 的变更。只有 Nest 读取它，并且无策略的行级安全将其从浏览器中保护起来。将其添加到新的迁移中：

```sql
create table public.subscriptions (
  stripe_customer text primary key,
  active boolean not null,
  expires_at timestamptz
);

alter table public.subscriptions enable row level security;

```

```typescript title="database/schema.ts"
import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const subscriptions = pgTable('subscriptions', {
  stripeCustomer: text('stripe_customer').primaryKey(),
  active: boolean('active').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});

```

该路由是 `@Public()`，因为签名是其认证依据，无效签名将获得 `401`。`processInTransaction()` 在与您的变更相同的事务中记录事件 ID，因此重新投递不会改变任何内容：

```typescript title="billing/stripe-webhooks.controller.ts"
import { Controller, HttpCode, Post } from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import { InjectDrizzle } from '@nestjs/drizzle';
import { IncomingWebhook, VerifyWebhook } from '@nestjs/webhooks';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { subscriptions } from '../database/schema.js';

interface StripeEvent {
  id: string;
  type: string;
  data: { object: { customer: string; status: string; cancel_at: number | null } };
}

@Public()
@Controller('webhooks/stripe')
export class StripeWebhooksController {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  @Post()
  @HttpCode(200)
  @VerifyWebhook('stripe')
  async receive(@IncomingWebhook() webhook: IncomingWebhook<StripeEvent>) {
    const { type, data } = webhook.payload;
    if (type !== 'customer.subscription.updated') {
      return;
    }
    const { customer, status, cancel_at } = data.object;
    const values = {
      active: status === 'active',
      expiresAt: cancel_at ? new Date(cancel_at * 1000) : null,
    };
    await this.db.transaction(async (tx) =>
      webhook.processInTransaction(tx, async () => {
        await tx
          .insert(subscriptions)
          .values({ stripeCustomer: customer, ...values })
          .onConflictDoUpdate({ target: subscriptions.stripeCustomer, set: values });
      }),
    );
  }
}

```

要尝试它，使用 [Stripe CLI](https://docs.stripe.com/stripe-cli) 将事件转发到您的应用程序，该工具会打印签名密钥以放入 `STRIPE_WEBHOOK_SECRET`：

```bash
$ stripe listen --forward-to localhost:3000/webhooks/stripe
$ stripe trigger customer.subscription.updated

```

#### 运行定时任务

在 Nest 中运行任务有两种方式。两种方式都适用于任意数量的实例，每次运行发生在其中一个实例上：

| | 使用 `@nestjs/schedule` 和 `@nestjs/locks` | BullMQ |
| :--- | :--- | :--- |
| **运行位置** | 持有租约的实例中 | 拾取它的工作进程中 |
| **运行失败时** | 等待下一个滴答 | 重试，带退避 |
| **所有实例都宕机时** | 错过滴答 | 任务在队列中等待 |
| **对 Postgres 的影响** | 一个表 | 自己的模式 |
| **其他操作** | 没有其他操作 | 从您的代码中排队的任务、优先级和流程 |
| **适用场景** | 安全跳过的任务，因为下一个滴答会追上 | 不应丢失或运行时间长的任务 |

两者都可以调用相同的代码：

```typescript title="billing/subscriptions.service.ts"
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, lt } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { subscriptions } from '../database/schema.js';

@Injectable()
export class SubscriptionsService {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  /** Catches a subscription whose cancellation event never arrived. */
  async expireOverdue() {
    await this.db
      .update(subscriptions)
      .set({ active: false })
      .where(and(eq(subscriptions.active, true), lt(subscriptions.expiresAt, new Date())));
  }
}

```

> 信息 **提示** [Supabase Cron](https://supabase.com/docs/guides/cron) 在 Postgres 内部调度 SQL，不涉及应用程序。它非常适合仅是 SQL 的任务，例如删除旧行。

##### 使用 `@nestjs/schedule` 和 `@nestjs/locks`

[`@nestjs/schedule`](/techniques/task-scheduling) 在应用程序内部运行任务，紧邻调用的代码。单独使用时，它在每个实例上运行任务。[`@nestjs/locks`](/reliability/locks) 添加了 `@OnOneInstance()`：第一个触发的实例获取租约，在运行期间每次滴答都运行，而其他实例跳过。当它停止时，另一个接管，在干净关闭后约一秒内，并在崩溃后 30 秒内：

```bash
$ npm i --save @nestjs/schedule @nestjs/locks

```

```typescript title="billing/expire-subscriptions.job.ts"
import { Injectable } from '@nestjs/common';
import { OnOneInstance } from '@nestjs/locks';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionsService } from './subscriptions.service.js';

@Injectable()
export class ExpireSubscriptionsJob {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Cron(CronExpression.EVERY_HOUR)
  @OnOneInstance({ key: 'subscriptions:expire' })
  async run() {
    await this.subscriptions.expireOverdue();
  }
}

```

```typescript
ScheduleModule.forRoot(),
LocksModule.forRoot(),

```

租约必须存在于所有实例共享的地方，在生产环境中，应用程序拒绝仅使用默认内存存储启动。将其保存在数据库中，在一个新迁移的表中：

```sql
create table public.locks (
  key text primary key,
  owner text,
  fencing_token bigint not null,
  expires_at timestamptz not null
);

alter table public.locks enable row level security;

create sequence public.locks_fencing_token_seq;

```

然后复制 Drizzle 表和 `DrizzleLockStore` 来自 [Keep locks in your database](/reliability/locks#keep-locks-in-your-database)，并将存储添加到 `providers`。

##### 使用 BullMQ

[BullMQ](/techniques/queues) 将任务保存在队列中，带有重试和退避。它通常在 Redis 上运行，也具有 PostgreSQL 后端，因此在 Supabase 上可以使用您已有的数据库：

```bash
$ npm i --save @nestjs/bullmq bullmq

```

```typescript
BullModule.forRoot({
  backendFactory: createPostgresBackend,
  connection: { connectionString: process.env.DATABASE_URL!, migrate: true },
}),
BullModule.registerQueue({ name: 'billing' }),

```

`migrate: true` 在启动时创建 `bullmq` 模式，Supabase 的 API 不提供。迁移会获取一个建议锁，因此多个同时启动的实例只应用一次。

> 信息 **提示** 要使用 Redis，请安装 `ioredis` 并用 `connection: { host, port }` 替换这些选项。其他内容都不变。

任务调度器在每次滴答时创建任务。ID 使其成为一个调度，无论声明了多少实例：

```typescript title="billing/billing.scheduler.ts"
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';

@Injectable()
export class BillingScheduler implements OnApplicationBootstrap {
  constructor(@InjectQueue('billing') private readonly billing: Queue) {}

  async onApplicationBootstrap() {
    await this.billing.upsertJobScheduler(
      'expire-subscriptions',
      { pattern: '0 * * * *' },
      {
        name: 'expire-subscriptions',
        opts: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
      },
    );
  }
}

```

处理器在空闲的任何实例上运行它：

```typescript title="billing/billing.processor.ts"
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { SubscriptionsService } from './subscriptions.service.js';

@Processor('billing')
export class BillingProcessor extends WorkerHost {
  constructor(private readonly subscriptions: SubscriptionsService) {
    super();
  }

  async process(job: Job) {
    if (job.name === 'expire-subscriptions') {
      await this.subscriptions.expireOverdue();
    }
  }
}

```

相同的队列从您自己的代码中获取任务，例如不应等待电子邮件的路由。使用 `@InjectQueue('billing')` 注入它，并向处理器添加一个任务情况：

```typescript
await this.billing.add('send-invoice', { customer }, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
});

```

#### 文件上传

浏览器可以直接上传到 Supabase Storage，受 `storage.objects` 表策略控制。当决策需要在服务器上做出时，例如配额或付费计划，请保持存储桶私有，并让 Nest 为每次上传签名。在迁移中创建存储桶：

```sql
insert into storage.buckets (id, name, public) values ('uploads', 'uploads', false);

```

```typescript title="uploads/uploads.controller.ts"
import { randomUUID } from 'node:crypto';
import { Controller, Post } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import type { SupabaseUser } from '../supabase/supabase-auth.js';
import { SupabaseService } from '../supabase/supabase.service.js';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly supabase: SupabaseService) {}

  @Post()
  async create(@CurrentUser() user: SupabaseUser) {
    const path = `${user.id}/${randomUUID()}`;
    const { data, error } = await this.supabase.admin.storage.from('uploads').createSignedUploadUrl(path);
    if (error) {
      throw error;
    }
    return { path: data.path, token: data.token };
  }
}

```

然后浏览器直接上传到 Supabase，文件绝不会经过您的应用程序：

```typescript
await supabase.storage.from('uploads').uploadToSignedUrl(path, token, file);

```

要返回文件，管理员客户端上的 `createSignedUrl(path, 60)` 会生成一个有效期为 60 秒的链接。

#### 针对本地栈进行测试

端到端测试可以使用真实的令牌和您的真实策略，因为该栈为您提供了两者。将其放在 `test/` 中，并在其之前运行 `npx supabase start` 和 `npx supabase db reset`：

```typescript title="notes.e2e-spec.ts"
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { SupabaseService } from '../src/supabase/supabase.service.js';

describe('Notes', () => {
  let app: INestApplication;

  const signUp = async () => {
    const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signUp({
      email: `${randomUUID()}@example.test`,
      password: randomUUID(),
    });
    if (error) {
      throw error;
    }
    return { id: data.user!.id, token: data.session!.access_token };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('shows a user only their own notes', async () => {
    const [alice, bob] = [await signUp(), await signUp()];
    await app.get(SupabaseService).admin.from('notes').insert([
      { user_id: alice.id, body: 'from alice' },
      { user_id: bob.id, body: 'from bob' },
    ]);

    const { body } = await request(app.getHttpServer())
      .get('/notes')
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);

    expect(body).toEqual([{ body: 'from alice' }]);
  });
});

```

#### 将 Edge Function 迁移到 Nest

大多数函数都有直接的对应项，您可以逐个迁移，因为两者都使用相同的令牌和数据库：

| 在 Edge Function 中 | 在 Nest 中 |
| --- | --- |
| 读取 `Authorization` 头部并调用 `supabase.auth.getUser()` | `SupabaseAuth` 和 `@CurrentUser()` |
| 使用调用者头创建的客户端 | `SupabaseService.forUser()` |
| 使用密钥创建的客户端 | `SupabaseService.admin` |
| 手动验证 Stripe 签名 | `@VerifyWebhook('stripe')` |
| `pg_cron` 通过 HTTP 调用函数 | `@Cron()` 或 BullMQ 任务调度器 |
| `supabase secrets set` | 您的主机环境变量 |
| 浏览器中的 `supabase.functions.invoke('name')` | 使用访问令牌的 `fetch()` |

#### 完成的模块

这是将以上所有内容连接起来的示例，有两种运行任务的方式，您只需保留其中一种：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { AuthenticationModule } from '@nestjs/authentication';
import { AuthorizationModule } from '@nestjs/authorization';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { DrizzleModule, getDrizzleToken } from '@nestjs/drizzle';
import { LocksModule } from '@nestjs/locks';
import { OutboxModule, OutboxStorage } from '@nestjs/outbox';
import { PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { ScheduleModule } from '@nestjs/schedule';
import { WebhooksModule, WebhooksStorage } from '@nestjs/webhooks';
import { fromDrizzle, PostgresWebhookStore } from '@nestjs/webhooks/postgres';
import { createPostgresBackend } from 'bullmq';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { AdminUsersController } from './admin/admin-users.controller.js';
import { AdminPolicy } from './admin/admin.policy.js';
import { BillingProcessor } from './billing/billing.processor.js';
import { BillingScheduler } from './billing/billing.scheduler.js';
import { ExpireSubscriptionsJob } from './billing/expire-subscriptions.job.js';
import { StripeWebhooksController } from './billing/stripe-webhooks.controller.js';
import { SubscriptionsService } from './billing/subscriptions.service.js';
import { DrizzleLockStore } from './database/drizzle-lock.store.js';
import { RowLevelSecurity } from './database/row-level-security.js';
import { MeController } from './me/me.controller.js';
import { NotesController } from './notes/notes.controller.js';
import { NotesRepository } from './notes/notes.repository.js';
import { SupabaseAuth } from './supabase/supabase-auth.js';
import { SupabaseService } from './supabase/supabase.service.js';
import { UploadsController } from './uploads/uploads.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot(), // first, as the lines below read process.env
    AuthenticationModule.forRoot({}),
    AuthorizationModule.forRoot({ globalGuard: false }),
    DrizzleModule.forRoot({ drizzle, connection: process.env.DATABASE_URL! }),
    OutboxModule.forRoot({ relay: { enabled: false } }),
    WebhooksModule.forRoot({
      worker: { enabled: false },
      receivers: {
        stripe: { scheme: 'stripe', secret: process.env.STRIPE_WEBHOOK_SECRET! },
      },
    }),
    // Jobs with @nestjs/schedule and @nestjs/locks
    ScheduleModule.forRoot(),
    LocksModule.forRoot(),
    // Jobs with BullMQ
    BullModule.forRoot({
      backendFactory: createPostgresBackend,
      connection: { connectionString: process.env.DATABASE_URL!, migrate: true },
    }),
    BullModule.registerQueue({ name: 'billing' }),
  ],
  controllers: [
    MeController,
    NotesController,
    AdminUsersController,
    StripeWebhooksController,
    UploadsController,
  ],
  providers: [
    SupabaseAuth,
    SupabaseService,
    RowLevelSecurity,
    NotesRepository,
    AdminPolicy,
    SubscriptionsService,
    {
      provide: PostgresOutboxStore,
      inject: [getDrizzleToken(), OutboxStorage],
      useFactory: (db: NodePgDatabase, storage: OutboxStorage) =>
        new PostgresOutboxStore({ executor: fromDrizzle(db), migrate: true }, storage),
    },
    {
      provide: PostgresWebhookStore,
      inject: [getDrizzleToken(), WebhooksStorage],
      useFactory: (db: NodePgDatabase, storage: WebhooksStorage) =>
        new PostgresWebhookStore({ executor: fromDrizzle(db), migrate: true }, storage),
    },
    // Jobs with @nestjs/schedule and @nestjs/locks
    ExpireSubscriptionsJob,
    DrizzleLockStore,
    // Jobs with BullMQ
    BillingScheduler,
    BillingProcessor,
  ],
})
export class AppModule {}

```

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors({ origin: process.env.WEB_ORIGIN });
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

`enableShutdownHooks()` 允许正在运行的任务完成，并在部署停止实例时传递其租约。

#### 部署

Nest 与 Supabase 分别部署，在任何运行 Node.js 的环境中（参见 [Deployment](/deployment)）。将其托管在靠近数据库区域的地方，因为每次查询都会跨越该距离。

将您的迁移应用到托管项目：

```bash
$ npx supabase link --project-ref your-project-ref
$ npx supabase db push

```

在您的主机上设置相同的环境变量，使用托管项目的值和来自 [Query Postgres directly](/recipes/supabase#query-postgres-directly) 的连接字符串。每个实例都会打开自己的连接，分别用于 Drizzle 和 BullMQ，因此请将其计入您项目的 [connection limit](https://supabase.com/docs/guides/database/connection-management)。

在滚动部署过程中，Webhook 存储不应在新的版本启动时更改模式。请从这两个中移除 `migrate: true`，并在新版本启动之前作为步骤应用它们的迁移，同时设置 `DATABASE_URL`。BullMQ 的可以保留，因为它在咨询锁下在一个事务中运行：

```bash
$ npx @nestjs/webhooks migrate
$ npx @nestjs/outbox migrate

```