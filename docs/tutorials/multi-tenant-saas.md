<!-- 此文件从 content/tutorials/multi-tenant-saas.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:52:58.815Z -->
<!-- 源文件: content/tutorials/multi-tenant-saas.md -->
<!-- 源哈希: 758c8cbf418c8bff1e86e8ca191d6b3e -->

### 在 Node.js 中构建多租户 SaaS 后端

使用 NestJS 和 PostgreSQL 在 Node.js 中构建多租户 SaaS 后端：组织、角色、电子邮件邀请，以及所有查询都限定在其租户范围内。

该应用程序包含用户创建和加入的组织、拥有 owner、admin 和 member 角色的成员，以及属于一个组织且组织外部任何人无法看到的项目。多租户后端是普通的 CRUD 操作，但有一个绝不能打破的规则：一个 **请求** 永远只接触其自身的租户数据。本教程的重点就在于这条规则，以及在正确实现它需要比一个 `WHERE` 子句更多的少数地方：邀请、角色变更和组织的最后所有者。

到最后，API 将：

- 从路由中获取组织，如 `/orgs/:orgId/projects` 所示，并在每个 **请求** 中通过一个 **守卫** 检查调用者的成员资格，该 **守卫** 对任何非成员返回 404。
- 将组织的 id 放入每个查询的 `WHERE` 子句中，因此来自另一个租户的 id 不会找到任何数据。
- 通过 [`@nestjs/mail`](/application/mail) 以电子邮件邀请人员，通过一次性链接，并且仅对发送到的地址有效。
- 使用条件语句更改角色和移除成员，确保即使两个所有者同时交出所有权，组织也不会丢失其最后所有者。
- 将对组织成员和邀请的每一次变更，以及每一个被删除的项目，记录到审计日志中，并在与变更相同的事务中完成。
- 在每个组织中构建项目的 **服务**，在一个持久的 **依赖注入** 子树中，并在创建时固定组织的 id。
- 使用针对 PostgreSQL 的测试来证明租户边界和最后所有者规则。

它从 [Build a REST API with JWT authentication](/tutorials/rest-api-jwt-authentication) 的 API 开始，该 API 使用访问和刷新令牌登录用户，使用 Zod 验证 **请求**，并通过 Drizzle 在 PostgreSQL 中保存数据。本教程不再解释这些部分。

这些是端点，以及添加每个端点的部分：

| 端点 | 部分 |
| --- | --- |
| `POST /auth/sign-up`, `POST /auth/token`, `POST /auth/token/refresh`, `POST /auth/token/revoke`, `GET /me`, `GET /health/live`, `GET /health/ready` | [Start from the JWT API](/tutorials/multi-tenant-saas#start-from-the-jwt-api) |
| `POST /orgs`, `GET /orgs`, `GET /orgs/:orgId/audit-events` | [Create organizations](/tutorials/multi-tenant-saas#create-organizations) |
| `GET /orgs/:orgId/projects`, `POST /orgs/:orgId/projects`, `GET /orgs/:orgId/projects/:projectId`, `DELETE /orgs/:orgId/projects/:projectId` | [Scope every query to the organization](/tutorials/multi-tenant-saas#scope-every-query-to-the-organization) |
| `GET /orgs/:orgId/members`, `PATCH /orgs/:orgId/members/:userId`, `DELETE /orgs/:orgId/members/:userId` | [Never lose the last owner](/tutorials/multi-tenant-saas#never-lose-the-last-owner) |
| `POST /orgs/:orgId/invitations`, `POST /invitations/accept` | [Invite members by email](/tutorials/multi-tenant-saas#invite-members-by-email) |

> info **提示** 完成的应用程序在 GitHub 上是 [nestjs/example-multi-tenant-saas](https://github.com/nestjs/example-multi-tenant-saas)，其中包含其测试和 CI 工作流。

#### 从 JWT API 开始

创建项目，并安装本教程使用的所有内容。这些是 JWT 教程的包加上 `@nestjs/mail`：

```bash
$ npm i -g @nestjs/cli
$ nest new saas-api --minimal
$ cd saas-api
$ npm uninstall @nestjs/platform-express @types/express
$ npm i --save @nestjs/platform-node zod @nestjs/config @nestjs/drizzle drizzle-orm@rc pg @nestjs/authentication @nestjs/mail @nestjs/throttler @nestjs/swagger @nestjs/terminus
$ npm i --save-dev drizzle-kit@rc @types/pg @nestjs/testing vitest vite

```

然后从 [finished JWT tutorial](/tutorials/rest-api-jwt-authentication#sign-users-in-with-jwts) 复制这些文件，保持原样：

- `src/main.ts`, `drizzle.config.ts` 和 `vitest.config.e2e.ts`
- `src/auth/`, `src/users/` 和 `src/health/` 下的所有内容
- `test/refresh-token.store.e2e-spec.ts`

排除 `src/notes/` 和 JWT 教程的 `drizzle/` 文件夹：本应用程序的第一个 **迁移** 来自其自身的 **模式**，在下一部分。将笔记重命名以匹配新应用程序中的名称：`JwtAuth` 中的 `realm` 和 `main.ts` 中 OpenAPI 文档的标题。将测试脚本添加到 `package.json`：

```json
"test:e2e": "vitest run --config ./vitest.config.e2e.ts"

```

使用应用程序自身的数据库启动一个 PostgreSQL **服务**：

```bash
$ docker run -d --name saas-db -e POSTGRES_PASSWORD=saas -e POSTGRES_DB=saas -p 5432:5432 postgres:17

```

在其 URL 和一个 `JWT_SECRET` 中添加其信息，如 JWT 教程所示：

```bash
DATABASE_URL=postgres://postgres:saas@localhost:5432/saas
# Generate with: openssl rand -base64 32
JWT_SECRET=

```

邀请电子邮件链接到您的前端，因此配置获得了其地址：

```typescript title="src/config.ts"
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.url(),
  // Signs the access tokens: at least 32 bytes.
  JWT_SECRET: z.string().min(32),
  // The browser origins allowed to call the API, comma-separated. None by default.
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean))
    .pipe(z.array(z.url())),
  // Where the frontend lives: invitation links point there.
  APP_URL: z.url().default('http://localhost:5173'),
});

export type Env = z.infer<typeof envSchema>;

```

根 **模块** 是 JWT 教程的，包含本教程的特性 **模块**、邮件 **模块**（由 [Invite members by email](/tutorials/multi-tenant-saas#invite-members-by-email) 解释）以及持久 **提供者** 的策略（由 [Give each organization its own DI sub-tree](/tutorials/multi-tenant-saas#give-each-organization-its-own-di-sub-tree) 解释）：

```typescript title="src/app.module.ts"
import { Module, StandardSchemaValidationPipe, type OnModuleInit } from '@nestjs/common';
import { APP_GUARD, APP_PIPE, ContextIdFactory } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthenticationModule } from '@nestjs/authentication';
import { DrizzleModule } from '@nestjs/drizzle';
import { LogMailTransport, MailModule } from '@nestjs/mail';
import { createObserveModule } from '@nestjs/observe';
import { ThrottlerGuard, ThrottlerModule, minutes, normalizeIp } from '@nestjs/throttler';
import { drizzle } from 'drizzle-orm/node-postgres';
import { accountEmail } from './auth/account-email.js';
import { AuthModule } from './auth/auth.module.js';
import { envSchema, type Env } from './config.js';
import { HealthModule } from './health/health.module.js';
import { InvitationsModule } from './invitations/invitations.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { OrganizationContextIdStrategy } from './tenancy/organization-context-id.strategy.js';
import { UsersModule } from './users/users.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // First, so it shuts down last and still sends what the other modules did.
    ObserveModule.forRoot({
      // Empty until `npx @nestjs/observe link` writes the key pair into .env: the SDK then sends nothing.
      appKey: process.env.OBSERVE_APP_KEY ?? '',
      appSecret: process.env.OBSERVE_APP_SECRET ?? '',
      serviceId: 'saas-api',
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
          issuer: 'saas-api',
          audience: 'saas-api',
          ttl: '15m',
        },
        refreshToken: { ttl: '30d', absoluteTtl: '90d' },
      }),
    }),
    MailModule.forRoot({
      // Development: logs each mail, its links included, instead of sending it.
      transport: new LogMailTransport(),
      from: 'SaaS API <no-reply@example.com>',
    }),
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
    OrganizationsModule,
    ProjectsModule,
    InvitationsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: StandardSchemaValidationPipe },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements OnModuleInit {
  onModuleInit() {
    // Before the first request: one DI sub-tree per organization, for durable providers.
    ContextIdFactory.apply(new OrganizationContextIdStrategy());
  }
}

```

#### 设计模式

整个 **模式** 都在一个文件中。用户和刷新令牌是 JWT 教程的：

```typescript title="src/database/schema.ts"
import { boolean, index, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: at('created_at').notNull().defaultNow(),
});

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: at('created_at').notNull().defaultNow(),
});

// Who belongs to which organization, and as what.
export const memberships = pgTable(
  'memberships',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'admin', 'member'] }).notNull(),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (table) => [
    // What the guard looks up on every request.
    primaryKey({ columns: [table.orgId, table.userId] }),
    // "My organizations".
    index('memberships_user_id_idx').on(table.userId),
  ],
);

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role', { enum: ['admin', 'member'] }).notNull(),
    // The SHA-256 of the token in the link: a copy of this table invites nobody.
    tokenHash: text('token_hash').notNull().unique(),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: at('expires_at').notNull(),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  // One open invitation per address and organization: inviting again replaces it.
  (table) => [unique('invitations_org_id_email_key').on(table.orgId, table.email)],
);

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull(),
    createdAt: at('created_at').notNull().defaultNow(),
    updatedAt: at('updated_at').notNull().defaultNow(),
  },
  (table) => [index('projects_org_id_created_at_idx').on(table.orgId, table.createdAt)],
);

// Who changed what, written in the same transaction as the change.
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (table) => [index('audit_events_org_id_created_at_idx').on(table.orgId, table.createdAt)],
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

export type Role = (typeof memberships.$inferSelect)['role'];
export type Project = typeof projects.$inferSelect;

```

- **成员资格以组织和用户为键。** 下一部分的 **守卫** 在每个 **请求** 上查找一次，这是一个主键读取。用户不能属于一个组织两次。
- **每个租户拥有的表都有一个 `org_id`，并且其索引以它开头。** 这些表的每个 **查询** 都基于它进行过滤，因此每个 **查询** 都可以使用该索引。
- **邀请存储其令牌的哈希值**，与 JWT 教程的刷新令牌一样。读取该表或其备份的人无法使用其中找到的内容接受邀请。
- **审计日志是一个像其他表一样的表**，由记录其变更的相同事务写入。
- **删除一个组织会级联** 到其成员资格、项目、邀请和审计事件。本教程中没有删除任何一个，但当您添加它时，租户中不会留下任何残留数据。

生成 **迁移** 并应用它（参见 [Migrations](https://docs.nestjs.com/data/drizzle#迁移)）：

```bash
$ npx drizzle-kit generate --name=saas
$ npx drizzle-kit migrate

```

#### 从路由解析组织

属于某个组织的每个路由在其路径中都有其 id：`/orgs/:orgId/projects`, `/orgs/:orgId/members`。在任何路由运行之前，必须回答两个问题：已登录用户是否是该组织的成员？以及他们的角色是否足以访问此路由？一个 [guard](/overview/guards) 回答了这两个问题，仅用一个 **查询**，并将答案留在 **请求** 上供处理程序使用。

成员资格的类型，以及两个与 **守卫** 配合使用的 **装饰器**。`@MinRole()` 声明了路由接受的最低角色，如 [Setting roles per handler](/overview/guards#为每个处理程序设置角色) 所述，而 `@CurrentMembership()` 是一个 [param decorator](/custom-decorators#参数装饰器)，用于注入 **守卫** 加载的内容：

```typescript title="src/organizations/membership.ts"
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../database/schema.js';

export type { Role };

/** The signed-in user's membership in the organization of the route. */
export interface Membership {
  orgId: string;
  userId: string;
  role: Role;
}

/** The lowest role a route accepts: `@MinRole('admin')` lets admins and owners in. */
export const MinRole = Reflector.createDecorator<Role>();

/** The membership that `OrganizationGuard` loaded for this request. */
export const CurrentMembership = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Membership => context.switchToHttp().getRequest().membership,
);

```

**守卫** 查找路由的 `:orgId` 的成员资格，检查路由要求的角色，并将成员资格留在 **请求** 上：

```typescript title="src/organizations/organization.guard.ts"
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { z } from 'zod';
import { memberships } from '../database/schema.js';
import type { User } from '../users/user.js';
import { MinRole, type Membership, type Role } from './membership.js';

const rank: Record<Role, number> = { member: 1, admin: 2, owner: 3 };
const uuid = z.uuid();

/** Resolves `:orgId` to the signed-in user's membership, once per request. */
@Injectable()
export class OrganizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectDrizzle() private readonly db: NodePgDatabase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ params: { orgId?: string }; user: User; membership?: Membership }>();
    const orgId = request.params.orgId;
    // Guards run before pipes, so the id isn't validated yet.
    if (!uuid.safeParse(orgId).success) {
      throw notFound();
    }
    const [membership] = await this.db
      .select({ orgId: memberships.orgId, userId: memberships.userId, role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.orgId, orgId!), eq(memberships.userId, request.user.id)));
    // Not a member: the organization might as well not exist.
    if (!membership) {
      throw notFound();
    }
    const required = this.reflector.getAllAndOverride(MinRole, [context.getHandler(), context.getClass()]) ?? 'member';
    if (rank[membership.role] < rank[required]) {
      throw new ForbiddenException(`Requires the ${required} role`);
    }
    request.membership = membership;
    return true;
  }
}

const notFound = () => new NotFoundException('Organization not found');

```

- **守卫在 **认证** 之后运行。** Nest 首先运行全局 **守卫**，因此当 **控制器** 的 `@UseGuards()` 运行时，`@nestjs/authentication` 已经验证了令牌并设置了 `request.user`。
- **id 在 **守卫** 中被验证。** **守卫** 在 **管道** 之前运行，因此 `@Param()` 的 `schema` 选项尚未检查 `orgId`。如果没有检查，`/orgs/not-a-uuid/projects` 将到达 PostgreSQL，该数据库会拒绝字符串用于一个 `uuid` 列，客户端将收到 500 错误。
- **非成员收到 404**，与不存在的组织收到的答案相同，如 JWT 教程中其他用户的说明。403 会确认该 id 属于某人。
- **角色过低的成员收到 403。** 他们知道组织存在；状态告诉他们问题在于他们的角色，而不是他们的登录状态。
- **`getAllAndOverride()` 首先读取方法的 `@MinRole()`，然后是类的。** **控制器** 可以为其路由设置默认值，而路由可以提高该值。如果没有两者之一，任何成员都可以进入。

下面的每个 **控制器** 都使用 `@UseGuards(OrganizationGuard)` 应用了该 **守卫**。Nest 在 **控制器** 的 **模块** 中实例化它并在那里注入其 **依赖注入**，因此不需要 **提供者** 条目。

> info **提示** 为什么使用 **守卫** 而不是 [`@nestjs/authorization`](/security/authorization) 的策略？该包的全局 **守卫** 在 **控制器** 的 **守卫** 之前运行，因此 `@Can()` 检查无法使用该 **守卫** 加载的成员资格，并且它以 403 拒绝，而非成员应该收到 404。一旦权限超出角色阶梯，请从 **服务** 中调用策略，并将成员资格作为参数传递，如 [Check orders record by record](/security/authorization#check-orders-record-by-record) 对顺序所做的那样。

#### 创建组织

关于谁属于哪个组织以及以何种身份属于该组织的变化，以及已删除的项目，都会记录在审计日志中。每个条目都由该变更自身的事务写入：如果变更回滚，则其条目也回滚；每个已提交的变更都有一个条目。一个辅助方法在每次调用时显示此规则：

```typescript title="src/audit/audit.ts"
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { auditEvents } from '../database/schema.js';

export type AuditEntry = Pick<typeof auditEvents.$inferInsert, 'orgId' | 'actorId' | 'action' | 'data'>;

/** Records a change. Pass the change's transaction: the entry commits, or rolls back, with it. */
export async function audit(tx: Pick<NodePgDatabase, 'insert'>, entry: AuditEntry): Promise<void> {
  await tx.insert(auditEvents).values(entry);
}

```

创建组织需要一个名称，更改成员角色需要新的角色：

```typescript title="src/organizations/organizations.schemas.ts"
import { z } from 'zod';

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type CreateOrganizationDto = z.infer<typeof createOrganizationSchema>;

export const changeRoleSchema = z.object({
  role: z.enum(['owner', 'admin', 'member']),
});
export type ChangeRoleDto = z.infer<typeof changeRoleSchema>;

```

该 **服务** 创建组织、列出已登录用户的组织，并读取组织的审计日志：

```typescript title="src/organizations/organizations.service.ts"
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { asc, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { audit } from '../audit/audit.js';
import { auditEvents, memberships, organizations } from '../database/schema.js';

const columns = {
  id: organizations.id,
  name: organizations.name,
  createdAt: organizations.createdAt,
  role: memberships.role,
};

@Injectable()
export class OrganizationsService {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  /** Creates an organization, with its creator as the first owner. */
  create(userId: string, name: string) {
    return this.db.transaction(async (tx) => {
      const [organization] = await tx.insert(organizations).values({ name }).returning();
      await tx.insert(memberships).values({ orgId: organization.id, userId, role: 'owner' });
      await audit(tx, { orgId: organization.id, actorId: userId, action: 'organization.created', data: { name } });
      return { ...organization, role: 'owner' as const };
    });
  }

  /** The organizations the user belongs to, with their role in each. */
  findMine(userId: string) {
    return this.db
      .select(columns)
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .where(eq(memberships.userId, userId))
      .orderBy(asc(organizations.name));
  }

  auditLog(orgId: string) {
    return this.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.orgId, orgId))
      .orderBy(desc(auditEvents.createdAt))
      .limit(100);
  }
}

```

- **创建组织是一个事务**：包括组织本身、其第一个所有者和审计条目。没有所有者的组织不能在中间失败时被遗弃。
- **`GET /orgs` 从用户的成员资格开始**，因此它列出用户所属的组织，不包含其他任何信息，且没有 **守卫**。

```typescript title="src/organizations/organizations.controller.ts"
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { CurrentMembership, MinRole, type Membership } from './membership.js';
import { OrganizationGuard } from './organization.guard.js';
import { createOrganizationSchema, type CreateOrganizationDto } from './organizations.schemas.js';
import { OrganizationsService } from './organizations.service.js';

@Controller('orgs')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  create(@CurrentUser('id') userId: string, @Body({ schema: createOrganizationSchema }) dto: CreateOrganizationDto) {
    return this.organizationsService.create(userId, dto.name);
  }

  @Get()
  findMine(@CurrentUser('id') userId: string) {
    return this.organizationsService.findMine(userId);
  }

  @UseGuards(OrganizationGuard)
  @MinRole('admin')
  @Get(':orgId/audit-events')
  auditLog(@CurrentMembership() { orgId }: Membership) {
    return this.organizationsService.auditLog(orgId);
  }
}

```

`POST /orgs` 和 `GET /orgs` 没有 `:orgId`，因此它们不使用 **守卫**：任何已登录用户都可以创建组织。审计日志的路由则需要，并且仅供管理员和所有者使用。

#### 将每个 **查询** 作用域限定到组织

项目属于一个组织。新项目需要一个名称和一个可选的描述：

```typescript title="src/projects/projects.schemas.ts"
import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5_000).default(''),
});
export type CreateProjectDto = z.infer<typeof createProjectSchema>;

```

**服务** 中的每个 **查询** 都接收组织的 id，并将其放入紧邻项目 id 的 `WHERE` 子句中：

```typescript title="src/projects/projects.service.ts"
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { audit } from '../audit/audit.js';
import { projects, type Project } from '../database/schema.js';
import type { Membership } from '../organizations/membership.js';
import type { CreateProjectDto } from './projects.schemas.js';

@Injectable()
export class ProjectsService {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  findAll(orgId: string): Promise<Project[]> {
    return this.db
      .select()
      .from(projects)
      .where(eq(projects.orgId, orgId))
      .orderBy(desc(projects.createdAt), desc(projects.id))
      .limit(100);
  }

  async findOne(orgId: string, id: string): Promise<Project> {
    const [project] = await this.db.select().from(projects).where(this.inOrg(orgId, id));
    return project ?? notFound();
  }

  async create(orgId: string, dto: CreateProjectDto): Promise<Project> {
    const [project] = await this.db
      .insert(projects)
      .values({ ...dto, orgId })
      .returning();
    return project;
  }

  remove({ orgId, userId }: Membership, id: string): Promise<void> {
    return this.db.transaction(async (tx) => {
      const [project] = await tx.delete(projects).where(this.inOrg(orgId, id)).returning();
      if (!project) {
        notFound();
      }
      await audit(tx, {
        orgId,
        actorId: userId,
        action: 'project.deleted',
        data: { projectId: id, name: project.name },
      });
    });
  }

  /** The project, if it belongs to the organization: another tenant's project is as missing as one that doesn't exist. */
  private inOrg(orgId: string, id: string) {
    return and(eq(projects.id, id), eq(projects.orgId, orgId));
  }
}

function notFound(): never {
  throw new NotFoundException('Project not found');
}

```

**控制器** 从 **守卫** 加载的成员资格中获取组织的 id：

```typescript title="src/projects/projects.controller.ts"
import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentMembership, MinRole, type Membership } from '../organizations/membership.js';
import { OrganizationGuard } from '../organizations/organization.guard.js';
import { createProjectSchema, type CreateProjectDto } from './projects.schemas.js';
import { ProjectsService } from './projects.service.js';

const projectId = { schema: z.uuid() };

// Every member reads and creates projects; only admins and owners delete them.
@UseGuards(OrganizationGuard)
@Controller('orgs/:orgId/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  findAll(@CurrentMembership() { orgId }: Membership) {
    return this.projectsService.findAll(orgId);
  }

  @Get(':projectId')
  findOne(@CurrentMembership() { orgId }: Membership, @Param('projectId', projectId) id: string) {
    return this.projectsService.findOne(orgId, id);
  }

  @Post()
  create(@CurrentMembership() { orgId }: Membership, @Body({ schema: createProjectSchema }) dto: CreateProjectDto) {
    return this.projectsService.create(orgId, dto);
  }

  @MinRole('admin')
  @Delete(':projectId')
  @HttpCode(204)
  remove(@CurrentMembership() membership: Membership, @Param('projectId', projectId) id: string) {
    return this.projectsService.remove(membership, id);
  }
}

```

在项目 **模块** 中注册 **控制器** 和 **服务**：

```typescript title="src/projects/projects.module.ts"
import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}

```

这两个检查保护不同的事物，并且彼此需要：

- **守卫** 检查用户是否属于 URL 中的组织。
- **`WHERE` 子句** 检查项目是否属于该组织。如果没有它，Acme 的成员可以通过 `/orgs/<Acme's id>/projects/<Globex's project id>` 读取 Globex 的项目：**守卫** 会放行他们，因为他们属于 Acme，而 **查询** 只通过其 id 找到项目。

组织的 id 来自 **守卫** 加载的成员资格，而不是来自 URL，因此处理程序不能使用 **守卫** 未检查的 id。下一节将 id 移入 **服务** 本身。另一个租户的项目会返回 404，就像不存在的项目一样。删除项目需要管理员权限，并且会在与 `DELETE` 相同的事务中写入审计条目。

#### 为每个组织提供独立的 **依赖注入** 子树

`ProjectsService` 是单例，并且其每个方法都接收组织的 id。Nest 还可以为单个组织构建一个 **提供者**，在创建时固定其 id：一个 [durable provider](/fundamentals/provider-scopes#持久提供者)。**请求作用域** 的 **提供者** 为每次 **请求** 重新构建。一个**持久提供者**为一组 **请求** 构建一次，在这里是为每个组织构建一次，并重用于该组的后续 **请求**。一个**上下文 id 策略** 告诉 Nest 一个 **请求** 属于哪个组：

```typescript title="src/tenancy/organization-context-id.strategy.ts"
import { ContextIdFactory, type ContextId, type ContextIdResolver, type ContextIdStrategy } from '@nestjs/core';
import { z } from 'zod';

/** What durable providers get as `REQUEST`: only what the strategy puts here. */
export interface OrganizationPayload {
  orgId: string | null;
}

const uuid = z.uuid();

/** One DI sub-tree per organization, for the requests of `/orgs/:orgId/...`. */
export class OrganizationContextIdStrategy implements ContextIdStrategy {
  // Least recently used first.
  private readonly trees = new Map<string, { contextId: ContextId; payload: OrganizationPayload }>();

  constructor(private readonly maxTrees = 1_000) {}

  attach(contextId: ContextId, request: { params?: { orgId?: string } }): ContextIdResolver {
    // Runs before every guard, authentication included: this is still the client's input.
    const orgId = request.params?.orgId?.toLowerCase();
    if (!orgId || !uuid.safeParse(orgId).success) {
      // No organization: this request's own sub-tree, durable providers included.
      return { resolve: () => contextId, payload: { orgId: null } };
    }
    let tree = this.trees.get(orgId);
    if (tree) {
      this.trees.delete(orgId); // set again below, as the most recently used
    } else {
      tree = { contextId: ContextIdFactory.create(), payload: { orgId } };
    }
    this.trees.set(orgId, tree);
    if (this.trees.size > this.maxTrees) {
      // Forget the least recently used organization: its instances can be garbage-collected.
      this.trees.delete(this.trees.keys().next().value!);
    }
    const durable = tree.contextId;
    return { resolve: (info) => (info.isTreeDurable ? durable : contextId), payload: tree.payload };
  }
}

```

- **`attach()` 读取 `request.params.orgId`**。在 Node **传输器** 上，当路由运行时，路由的参数已经设置好了：从 `attach()` 记录的 `request.params` 显示了每个 `/orgs/:orgId/projects` **请求** 的 `orgId`。
- **它在每个 **守卫** 之前运行，包括 **认证****，因此 id 仍然是客户端的输入。只有 UUID 会拥有自己的子树。其他任何内容都获得 **请求** 自身的上下文 id，因此没有持久化的内容会被共享或保留。
- **子树的数量是有限制的**。本章的示例保留了一个 `Map`，随着每个新 id 的增加而增长，任何用户，无论是否登录，都可以发送虚构的 UUID。在过去的 `maxTrees` 中，该策略会忘记使用频率最低的组织。Nest 将 **提供者** 的实例存储在以上下文 id 对象（`InstanceWrapper` 在 `@nestjs/core` 中）为键的 `WeakMap` 中，因此一旦组织最后一次 **请求** 完成，其被遗忘的组织的实例就可以被垃圾回收。在使用 `--expose-gc` 且限制为两个的运行时，被驱逐的组织的实例被收集，其下一次 **请求** 构建了一个新的实例。
- **负载是持久 **提供者** 获得的 `REQUEST`**，它只包含策略放入的内容：组织的 id。已登录用户不在其中，**请求** 的其他内容也不在其中。
- **只有到达 **请求作用域** **控制器** 的 **请求** 才会调用 `attach()`**。在 `/auth`、`/me` 和 `/orgs` 下的路由（没有 id）由单例提供服务，绝不会是 **请求作用域** 的。

在第一个 **请求** 之前注册该策略一次。`AppModule` 在 `onModuleInit()` 中执行此操作，因此不运行 `main.ts` 的端到端测试也会获得它：

```typescript title="src/app.module.ts"
import { Module, StandardSchemaValidationPipe, type OnModuleInit } from '@nestjs/common';
import { APP_GUARD, APP_PIPE, ContextIdFactory } from '@nestjs/core';
import { OrganizationContextIdStrategy } from './tenancy/organization-context-id.strategy.js';
// ...

@Module({
  // ...
})
export class AppModule implements OnModuleInit {
  onModuleInit() {
    // Before the first request: one DI sub-tree per organization, for durable providers.
    ContextIdFactory.apply(new OrganizationContextIdStrategy());
  }
}

```

`ProjectsService` 变为持久化的。它注入 `REQUEST`，在构造函数中从其中获取组织的 id，并将其添加到每个 **查询** 中：

```typescript title="src/projects/projects.service.ts"
import { Inject, Injectable, Logger, NotFoundException, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { audit } from '../audit/audit.js';
import { projects, type Project } from '../database/schema.js';
import type { OrganizationPayload } from '../tenancy/organization-context-id.strategy.js';
import type { CreateProjectDto } from './projects.schemas.js';

/** One instance per organization, built with its id: no caller can pass another one. */
@Injectable({ scope: Scope.REQUEST, durable: true })
export class ProjectsService {
  private readonly orgId: string;

  constructor(
    // The strategy's payload, not the HTTP request: this instance serves every request of the organization.
    @Inject(REQUEST) { orgId }: OrganizationPayload,
    @InjectDrizzle() private readonly db: NodePgDatabase,
  ) {
    // Not a valid organization id: built for this request alone, which the guard would refuse anyway.
    if (!orgId) {
      throw new NotFoundException('Organization not found');
    }
    this.orgId = orgId;
    new Logger(ProjectsService.name).log(`Created for organization ${orgId}`);
  }

  findAll(): Promise<Project[]> {
    return this.db
      .select()
      .from(projects)
      .where(eq(projects.orgId, this.orgId))
      .orderBy(desc(projects.createdAt), desc(projects.id))
      .limit(100);
  }

  async findOne(id: string): Promise<Project> {
    const [project] = await this.db.select().from(projects).where(this.inOrg(id));
    return project ?? notFound();
  }

  async create(dto: CreateProjectDto): Promise<Project> {
    const [project] = await this.db
      .insert(projects)
      .values({ ...dto, orgId: this.orgId })
      .returning();
    return project;
  }

  remove(actorId: string, id: string): Promise<void> {
    return this.db.transaction(async (tx) => {
      const [project] = await tx.delete(projects).where(this.inOrg(id)).returning();
      if (!project) {
        notFound();
      }
      await audit(tx, {
        orgId: this.orgId,
        actorId,
        action: 'project.deleted',
        data: { projectId: id, name: project.name },
      });
    });
  }

  private inOrg(id: string) {
    return and(eq(projects.id, id), eq(projects.orgId, this.orgId));
  }
}

function notFound(): never {
  throw new NotFoundException('Project not found');
}

```

其方法不再接收 id，因此 **控制器** 不再传递它：

```typescript title="src/projects/projects.controller.ts"
import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { z } from 'zod';
import { MinRole } from '../organizations/membership.js';
import { OrganizationGuard } from '../organizations/organization.guard.js';
import { createProjectSchema, type CreateProjectDto } from './projects.schemas.js';
import { ProjectsService } from './projects.service.js';

const projectId = { schema: z.uuid() };

// Durable too, through ProjectsService: one instance per organization.
// Every member reads and creates projects; only admins and owners delete them.
@UseGuards(OrganizationGuard)
@Controller('orgs/:orgId/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  findAll() {
    return this.projectsService.findAll();
  }

  @Get(':projectId')
  findOne(@Param('projectId', projectId) id: string) {
    return this.projectsService.findOne(id);
  }

  @Post()
  create(@Body({ schema: createProjectSchema }) dto: CreateProjectDto) {
    return this.projectsService.create(dto);
  }

  @MinRole('admin')
  @Delete(':projectId')
  @HttpCode(204)
  remove(@CurrentUser('id') userId: string, @Param('projectId', projectId) id: string) {
    return this.projectsService.remove(userId, id);
  }
}

```

重启应用程序，并以两个组织的成员身份，交错地六次列出这两个组织的项目。`BOB`、`ACME` 和 `GLOBEX` 变量的设置与 [Try it](/tutorials/multi-tenant-saas#try-it) 中相同：

```bash
$ for org in $ACME $ACME $GLOBEX $ACME $GLOBEX $GLOBEX; do curl -s -o /dev/null -w '%{http_code} ' localhost:3000/orgs/$org/projects -H "$BOB"; done
200 200 200 200 200 200

```

应用程序日志中每行对应一个组织，来自每个 **服务** 在组织首次 **请求** 时的构造函数：

```bash
LOG [ProjectsService] Created for organization dcf74914-8aff-4ea0-938f-8054466e6e4b
LOG [ProjectsService] Created for organization a679e0ce-fb7c-449e-89d9-644c25f82783

```

- **持久性向上冒泡**。`ProjectsController` 依赖于一个持久 **提供者** 和其他任何非 **请求作用域** 的内容，因此它也是持久化的：每个组织一个实例，在组织首次 **请求** 时与 **服务** 一起构建，如 [Durable providers](/fundamentals/provider-scopes#持久提供者) 中的提示所述。其他 **控制器** 和 **服务** 保持单例。一个注入了非持久 **请求作用域** **提供者** 的 **提供者** 会使所有依赖于它的内容都变为 **请求作用域**，为每次 **请求** 构建一次。
- **成本**。现在对项目路由的每次 **请求** 都运行 `attach()` 和一次 `Map` 查找，并且每个组织的首次 **请求** 会构建其 **控制器** 和 **服务**。**请求作用域** **服务** 会为每次 **请求** 构建两者（参见 [Performance](/fundamentals/provider-scopes#性能)）。本教程没有测量差异。
- **构造函数在 **守卫** 之前运行**。Nest 在运行任何 **守卫** 之前构建 **请求作用域** **控制器** 及其依赖项。对于非 UUID 的 id，构造函数会抛出 **守卫** 会响应的 404。对于不存在的组织格式正确的 id，或没有令牌的 **请求**，子树会被构建，然后 **守卫** 拒绝该 **请求**。限制了此类子树的数量。
- **子树是一个缓存，而不是授权边界**。`OrganizationGuard` 仍然根据策略读取的同一路由参数来决定调用者是否可以使用该组织。它们必须读取同一个参数：如果使用将每个组织放在一个子树中的策略，本教程末尾的租户测试就会失败，因为 Bob 通过 Globex 的 URL 读取了 Acme 的项目，而他属于 Globex 的成员资格允许他这样做。
- **任何属于用户或 **请求** 的内容都不会进入持久 **提供者****。组织的每次 **请求** 共享同一个实例，因此一个 **请求** 设置的字段会被下一个 **请求** 读取，无论谁发送它。将用户作为参数，因为 `remove()` 从 `@CurrentUser()` 获取了行为者的 id，后者读取正在处理的 **请求**，即使在持久 **控制器** 中也是如此。在一个非持久 **请求作用域** **提供者** 中，`REQUEST` 是 HTTP **请求** 本身，其负载的字段被分配给它，但其构造函数也在 **守卫** 之前运行：`request.user` 在那里仍然是空的，直到处理程序调用方法时才设置。

使用一个数据库，像前一节中那样传递 id，可以保持查询的作用域不变，并且每个提供者都是单例。当每个组织都需要一个值得构建一次的独立对象时，例如创建在同一构造函数中的连接池到组织自己的数据库，持久提供者就派上用场了。

#### 绝不丢失最后一个所有者

所有者和管理员管理成员。规则如下：

- 管理员更改成员和管理员的角色并移除他们。只有所有者才能创建所有者，只有所有者才能更改或移除所有者。
- 一个组织始终至少有一个所有者。

第二条规则是难的。显而易见的版本是计算所有者数量，只有当数量达到两个或更多时才降级。两个同时退出的所有者都算作两个所有者，两个降级都发生，组织就没有任何所有者了。使用在其 `WHERE` 子句中包含计数的条件 `UPDATE` 也没有帮助：这两个语句更新不同的行，因此没有一个等待另一个，每个计数仍然看到两个所有者。本教程末尾的 [test](/tutorials/multi-tenant-saas#test-it) 运行了十次这样的竞争：如果没有下面的锁，在每次运行中，十个组织中有九个或十个最终没有所有者。

修复方法是在触及其成员资格之前获取组织的行锁。然后，对一个组织成员资格的更改一次一个地运行，每个更改都能看到前一个提交的内容：

```typescript title="src/organizations/members.service.ts"
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, eq, exists, ne, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { alias } from 'drizzle-orm/pg-core';
import { audit } from '../audit/audit.js';
import { memberships, organizations, users } from '../database/schema.js';
import type { Membership, Role } from './membership.js';

const others = alias(memberships, 'others');

@Injectable()
export class MembersService {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  findAll(orgId: string) {
    return this.db
      .select({ userId: users.id, email: users.email, role: memberships.role, joinedAt: memberships.createdAt })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.orgId, orgId))
      .orderBy(asc(users.email));
  }

  changeRole(actor: Membership, userId: string, role: Role) {
    return this.db.transaction(async (tx) => {
      const manager = await this.lock(tx, actor);
      if (role === 'owner' && manager.role !== 'owner') {
        throw new ForbiddenException('Only owners can make owners');
      }
      const [member] = await tx
        .update(memberships)
        .set({ role })
        .where(
          and(
            this.manageable(manager, userId),
            // Demoting an owner needs another owner to stay.
            role === 'owner' ? undefined : this.leavesAnOwner(tx),
          ),
        )
        .returning();
      if (!member) {
        return this.refuse(tx, manager, userId);
      }
      await audit(tx, {
        orgId: actor.orgId,
        actorId: actor.userId,
        action: 'member.role_changed',
        data: { userId, role },
      });
      return member;
    });
  }

  remove(actor: Membership, userId: string) {
    return this.db.transaction(async (tx) => {
      const manager = await this.lock(tx, actor);
      const [member] = await tx
        .delete(memberships)
        .where(and(this.manageable(manager, userId), this.leavesAnOwner(tx)))
        .returning();
      if (!member) {
        return this.refuse(tx, manager, userId);
      }
      await audit(tx, { orgId: actor.orgId, actorId: actor.userId, action: 'member.removed', data: { userId } });
    });
  }

  /**
   * Locks the organization's row until the transaction ends, so changes to its
   * memberships run one at a time, each seeing the one before it. Returns the
   * actor's membership as it is now: the guard read it before the lock.
   */
  private async lock(tx: Pick<NodePgDatabase, 'select'>, actor: Membership): Promise<Membership> {
    await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, actor.orgId))
      .for('update');
    // A statement of its own, so it sees what committed while it waited for the lock.
    const [current] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.orgId, actor.orgId), eq(memberships.userId, actor.userId)));
    if (!current) {
      throw new NotFoundException('Organization not found');
    }
    if (current.role === 'member') {
      throw new ForbiddenException('Requires the admin role');
    }
    return { ...actor, role: current.role };
  }

  /** The member's row, if the actor may change it: admins change admins and members, owners anyone. */
  private manageable(actor: Membership, userId: string) {
    return and(
      eq(memberships.orgId, actor.orgId),
      eq(memberships.userId, userId),
      actor.role === 'owner' ? undefined : ne(memberships.role, 'owner'),
    );
  }

  /** True unless the row is the organization's last owner. */
  private leavesAnOwner(tx: Pick<NodePgDatabase, 'select'>) {
    return or(
      ne(memberships.role, 'owner'),
      exists(
        tx
          .select({ one: sql`1` })
          .from(others)
          .where(
            and(eq(others.orgId, memberships.orgId), eq(others.role, 'owner'), ne(others.userId, memberships.userId)),
          ),
      ),
    );
  }

  /** Why a change matched no row: 404, 403 or 409. */
  private async refuse(tx: Pick<NodePgDatabase, 'select'>, actor: Membership, userId: string): Promise<never> {
    const [member] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.orgId, actor.orgId), eq(memberships.userId, userId)));
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    if (member.role === 'owner' && actor.role !== 'owner') {
      throw new ForbiddenException('Only owners can change owners');
    }
    throw new ConflictException('An organization needs at least one owner');
  }
}

```

- **`lock()` 在每次成员资格更改中首先运行。** 对组织行的 `SELECT ... FOR UPDATE` 使对同一组织的第二次更改等待第一个更改提交。只有成员资格更改会获取锁，并且仅针对其自己的组织：读取、项目写入和其他组织不会等待。
- **在锁的保护下再次读取行为者的角色。** 守卫在请求开始时读取了它，但自那时起，另一个更改可能已经降级或移除了该行为者。使用守卫的副本，在一个有三个所有者的组织中，Ada 可以在 Bob 降级 Ada 的同时移除 Bob，两者都会成功，尽管两种顺序都不允许。在 PostgreSQL 的默认隔离级别下，每个语句都看到它开始之前已提交的数据，因此在锁之后读取会看到持有锁的更改。不再是管理员或所有者的行为者会收到 403，不再是成员的行为者会收到 404。
- **关于目标规则在语句的 `WHERE` 子句中**：其当前角色以及是否仍有其他所有者。`UPDATE` 也在获得锁后开始，因此当两个所有者同时退出时，第二个所有者的子查询会看到第一个所有者的降级，第二个降级不会更改任何行。
- **没有行更改：`refuse()` 说明了原因**，在同一锁下读取：用户不是成员时为 404，管理员触及所有者时为 403，当更改将导致没有所有者时为 409。
- **只有在行发生更改时才写入审计条目**，在同一事务中。被拒绝的更改不记录任何内容，如果写入条目失败，更改也会回滚。

```typescript title="src/organizations/members.controller.ts"
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentMembership, MinRole, type Membership } from './membership.js';
import { MembersService } from './members.service.js';
import { OrganizationGuard } from './organization.guard.js';
import { changeRoleSchema, type ChangeRoleDto } from './organizations.schemas.js';

const userId = { schema: z.uuid() };

@UseGuards(OrganizationGuard)
@Controller('orgs/:orgId/members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  findAll(@CurrentMembership() { orgId }: Membership) {
    return this.membersService.findAll(orgId);
  }

  @MinRole('admin')
  @Patch(':userId')
  changeRole(
    @CurrentMembership() actor: Membership,
    @Param('userId', userId) id: string,
    @Body({ schema: changeRoleSchema }) { role }: ChangeRoleDto,
  ) {
    return this.membersService.changeRole(actor, id, role);
  }

  @MinRole('admin')
  @Delete(':userId')
  @HttpCode(204)
  remove(@CurrentMembership() actor: Membership, @Param('userId', userId) id: string) {
    return this.membersService.remove(actor, id);
  }
}

```

在 organizations 模块中注册两个控制器和两个服务：

```typescript title="src/organizations/organizations.module.ts"
import { Module } from '@nestjs/common';
import { MembersController } from './members.controller.js';
import { MembersService } from './members.service.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

@Module({
  controllers: [OrganizationsController, MembersController],
  providers: [OrganizationsService, MembersService],
})
export class OrganizationsModule {}

```

#### 通过电子邮件邀请成员

管理员通过电子邮件地址邀请某人。邀请邮件包含一个带有令牌的链接，点击该链接会将已登录用户添加到组织中。[`@nestjs/mail`](/application/mail) 发送它。根模块使用 `MailModule` 注册了 `LogMailTransport`，后者记录了每封邮件（包括链接），而不是发送它。在生产环境中，切换到 SMTP 或电子邮件 API，如 [Send in production](/application/mail#send-in-production) 所示；当 `NODE_ENV` 为 `production` 且传输方式是开发用时，模块会在启动时发出警告。

一个邮件类渲染邀请。它足够小，可以与带有 `html` 标签的内联模板一起编写，该模板会转义其插入的每个值，因此一个名为 `<b>Acme</b>` 的组织会作为文本而不是标记出现：

```typescript title="src/invitations/invitation.mail.ts"
import { Injectable } from '@nestjs/common';
import { html, type Mailable } from '@nestjs/mail';

export interface InvitationMailData {
  organization: string;
  invitedBy: string;
  url: string;
}

@Injectable()
export class InvitationMail implements Mailable<InvitationMailData> {
  render({ organization, invitedBy, url }: InvitationMailData) {
    return {
      subject: `Join ${organization}`,
      // `html` escapes every value: an organization named <script> stays text.
      html: html`
        <p>${invitedBy} invited you to join ${organization}.</p>
        <p><a href="${url}">Accept the invitation</a></p>
        <p>The link works once, within 7 days.</p>
      `,
    };
  }
}

```

邀请指定一个地址和一个角色，接受邀请则从链接中获取令牌：

```typescript title="src/invitations/invitations.schemas.ts"
import { z } from 'zod';

export const createInvitationSchema = z.object({
  // Stored as users.email is, so the accepting user's address matches it.
  email: z.email().transform((email) => email.normalize('NFC').toLowerCase()),
  // Owners are made, not invited: see PATCH /orgs/:orgId/members/:userId.
  role: z.enum(['admin', 'member']).default('member'),
});
export type CreateInvitationDto = z.infer<typeof createInvitationSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().min(1).max(100),
});
export type AcceptInvitationDto = z.infer<typeof acceptInvitationSchema>;

```

服务创建邀请并发送邮件，当有人接受时消耗令牌：

```typescript title="src/invitations/invitations.service.ts"
import { createHash, randomBytes } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDrizzle } from '@nestjs/drizzle';
import { Mailer } from '@nestjs/mail';
import { and, eq, gt } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { audit } from '../audit/audit.js';
import type { Env } from '../config.js';
import { invitations, memberships, organizations } from '../database/schema.js';
import type { Membership } from '../organizations/membership.js';
import type { User } from '../users/user.js';
import { InvitationMail } from './invitation.mail.js';
import type { CreateInvitationDto } from './invitations.schemas.js';

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const columns = {
  id: invitations.id,
  email: invitations.email,
  role: invitations.role,
  expiresAt: invitations.expiresAt,
  createdAt: invitations.createdAt,
};

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class InvitationsService {
  constructor(
    @InjectDrizzle() private readonly db: NodePgDatabase,
    private readonly mailer: Mailer,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async invite(actor: Membership, inviter: User, { email, role }: CreateInvitationDto) {
    const token = randomBytes(32).toString('base64url');
    const values = { role, tokenHash: hash(token), invitedBy: actor.userId, expiresAt: new Date(Date.now() + TTL_MS) };

    const { invitation, organization } = await this.db.transaction(async (tx) => {
      // Inviting the same address again replaces the token: the earlier link stops working.
      const [invitation] = await tx
        .insert(invitations)
        .values({ ...values, orgId: actor.orgId, email })
        .onConflictDoUpdate({
          target: [invitations.orgId, invitations.email],
          set: { ...values, createdAt: new Date() },
        })
        .returning(columns);
      const [organization] = await tx
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, actor.orgId));
      await audit(tx, { orgId: actor.orgId, actorId: actor.userId, action: 'invitation.sent', data: { email, role } });
      return { invitation, organization };
    });

    // After the commit, never inside the transaction: it would hold its connection
    // and locks for as long as the mail server takes to answer.
    const url = new URL('/invitations/accept', this.config.get('APP_URL', { infer: true }));
    url.searchParams.set('token', token);
    await this.mailer.send(InvitationMail, {
      to: email,
      data: { organization: organization.name, invitedBy: inviter.email, url: url.href },
    });
    return invitation;
  }

  /** Spends the token: the signed-in user joins the organization it was sent for. */
  accept(user: User, token: string) {
    return this.db.transaction(async (tx) => {
      // Taking the invitation is the first statement: of two requests with the same
      // token, one deletes the row and the other finds nothing.
      const [invitation] = await tx
        .delete(invitations)
        .where(
          and(
            eq(invitations.tokenHash, hash(token)),
            // Only for the address it was sent to, so a forwarded link is useless.
            eq(invitations.email, user.email),
            gt(invitations.expiresAt, new Date()),
          ),
        )
        .returning();
      if (!invitation) {
        throw new NotFoundException('Invitation not found or expired');
      }
      // Already a member: keep the role they have.
      const [joined] = await tx
        .insert(memberships)
        .values({ orgId: invitation.orgId, userId: user.id, role: invitation.role })
        .onConflictDoNothing()
        .returning();
      if (joined) {
        await audit(tx, {
          orgId: invitation.orgId,
          actorId: user.id,
          action: 'member.joined',
          data: { invitationId: invitation.id, role: invitation.role },
        });
      }
      const [membership] = await tx
        .select({ orgId: memberships.orgId, userId: memberships.userId, role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.orgId, invitation.orgId), eq(memberships.userId, user.id)));
      return membership;
    });
  }
}

```

- **令牌是 32 个随机字节，并且只存储其 SHA-256。** 令牌本身存在于邮件中，其他地方不存在。
- **再次邀请同一地址会替换邀请**，在组织和地址上执行 upsert。早期的链接失效，因为其哈希已丢失。
- **邮件在事务提交后发送。** 在事务内部发送会保持事务打开，持有其连接和锁，直到邮件服务器响应所需的时间。如果发送失败，客户端会收到错误，并且邀请仍然存在，因此再次邀请会发送一个新链接。当邮件绝不能丢失时，应通过出件箱发送，如 [Send after the order commits](/application/mail#send-after-the-order-commits) 所示。
- **接受操作作为其第一个语句使用 `DELETE ... RETURNING` 接受邀请。** 两个使用相同令牌的请求不能同时获取该行：第二个请求等待第一个请求的事务，然后发现没有内容。令牌只被使用一次，没有标记为已使用的内容。
- **邀请仅针对发送到的地址有效。** `DELETE` 也匹配已登录用户的电子邮件，因此转发的链接不会让其他人加入，也不会消耗邀请。过期的邀请不匹配任何内容。
- **在已经是成员时接受邀请会保留其角色。** `onConflictDoNothing()` 会保持现有成员资格不变，而不是将所有者变为成员。

邀请需要管理员。接受则需要任何已登录用户，因此其路由在 `/orgs/:orgId` 之外：

```typescript title="src/invitations/invitations.controller.ts"
import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { CurrentMembership, MinRole, type Membership } from '../organizations/membership.js';
import { OrganizationGuard } from '../organizations/organization.guard.js';
import type { User } from '../users/user.js';
import {
  acceptInvitationSchema,
  createInvitationSchema,
  type AcceptInvitationDto,
  type CreateInvitationDto,
} from './invitations.schemas.js';
import { InvitationsService } from './invitations.service.js';

@Controller()
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @UseGuards(OrganizationGuard)
  @MinRole('admin')
  @Post('orgs/:orgId/invitations')
  invite(
    @CurrentMembership() actor: Membership,
    @CurrentUser() user: User,
    @Body({ schema: createInvitationSchema }) dto: CreateInvitationDto,
  ) {
    return this.invitationsService.invite(actor, user, dto);
  }

  // No :orgId and no guard: the user isn't a member yet. The token says which organization.
  @Post('invitations/accept')
  @HttpCode(200)
  accept(@CurrentUser() user: User, @Body({ schema: acceptInvitationSchema }) { token }: AcceptInvitationDto) {
    return this.invitationsService.accept(user, token);
  }
}

```

在 invitations **模块** 中注册 **控制器**、**服务** 和 mail **类**：

```typescript title="src/invitations/invitations.module.ts"
import { Module } from '@nestjs/common';
import { InvitationMail } from './invitation.mail.js';
import { InvitationsController } from './invitations.controller.js';
import { InvitationsService } from './invitations.service.js';

@Module({
  controllers: [InvitationsController],
  providers: [InvitationsService, InvitationMail],
})
export class InvitationsModule {}

```

`POST /orgs/:orgId/invitations` 的 **请求** 体指定了一个电子邮件，因此 JWT 教程的 `account` **节流** 是按邀请地址和 IP 地址计算的：管理员可以在 15 分钟内邀请一个地址五次，这也是一个合理的限制，限制了您的邮件收件箱能收到多少邮件。

#### 试用

启动应用程序：

```bash
$ npm run start

```

像 JWT 教程中那样注册 Ada、Bob 和 Carol，并保留它们的访问令牌（此处和下方缩短）：

```bash
$ curl localhost:3000/auth/sign-up --json '{"email":"ada@example.com","password":"correct horse battery"}'
{"accessToken":"eyJhbGciOiJIUzI1NiIs...","refreshToken":"...","expiresIn":900}
$ ADA="Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
$ BOB="Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
$ CAROL="Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."

```

Ada 创建 Acme，Bob 创建 Globex。他们各自是创建的组织的所有者：

```bash
$ curl localhost:3000/orgs -H "$ADA" --json '{"name":"Acme"}'
{"id":"1a01c225-98f1-405b-8603-91b4598b2862","name":"Acme","createdAt":"2026-11-19T22:02:34.959Z","role":"owner"}
$ curl localhost:3000/orgs -H "$BOB" --json '{"name":"Globex"}'
{"id":"3bde374d-da6b-496b-8ddc-5accb192b6ec","name":"Globex","createdAt":"2026-11-19T22:02:34.999Z","role":"owner"}
$ ACME=1a01c225-98f1-405b-8603-91b4598b2862
$ GLOBEX=3bde374d-da6b-496b-8ddc-5accb192b6ec

```

Ada 向 Acme 添加一个项目。对于 Bob 来说，Acme 不存在，从 Globex 的路由来看，Acme 的项目也不存在：

```bash
$ curl localhost:3000/orgs/$ACME/projects -H "$ADA" --json '{"name":"Website redesign"}'
{"id":"49b827a9-2fca-403b-bb6e-d31a461fa796","orgId":"1a01c225-98f1-405b-8603-91b4598b2862","name":"Website redesign","description":"","createdAt":"2026-11-19T22:02:35.036Z","updatedAt":"2026-11-19T22:02:35.036Z"}
$ PROJECT=49b827a9-2fca-403b-bb6e-d31a461fa796
$ curl -i localhost:3000/orgs/$ACME/projects -H "$BOB"
HTTP/1.1 404 Not Found
{"message":"Organization not found","error":"Not Found","statusCode":404}
$ curl localhost:3000/orgs/$GLOBEX/projects/$PROJECT -H "$BOB"
{"message":"Project not found","error":"Not Found","statusCode":404}
$ curl localhost:3000/orgs/not-a-uuid/projects -H "$BOB"
{"message":"Organization not found","error":"Not Found","statusCode":404}

```

Ada 将 Bob 邀请为管理员，将 Carol 邀请为成员。**响应** 中不包含令牌；只有邮件包含：

```bash
$ curl localhost:3000/orgs/$ACME/invitations -H "$ADA" --json '{"email":"bob@example.com","role":"admin"}'
{"id":"7645d709-4b9d-4165-b0d3-f0ebfdd46451","email":"bob@example.com","role":"admin","expiresAt":"2026-11-26T22:02:35.113Z","createdAt":"2026-11-19T22:02:35.114Z"}
$ curl localhost:3000/orgs/$ACME/invitations -H "$ADA" --json '{"email":"carol@example.com"}'
{"id":"ccf6b16b-419d-43ca-b4c0-ddf073b89ffe","email":"carol@example.com","role":"member","expiresAt":"2026-11-26T22:02:35.138Z","createdAt":"2026-11-19T22:02:35.139Z"}

```

应用程序的日志显示每封邮件，其文本部分在 `debug` 级别：

```bash
LOG [LogMailTransport] "Join Acme" to bob@example.com
DEBUG [LogMailTransport] ada@example.com invited you to join Acme.

Accept the invitation (http://localhost:5173/invitations/accept?token=CqkmdRyycidnm9PMyB9nxIDoepD3rn0E-b7YctKK6u4)

The link works once, within 7 days.

```

Carol 不能使用 Bob 的链接。Bob 可以，一次：

```bash
$ curl localhost:3000/invitations/accept -H "$CAROL" --json '{"token":"CqkmdRyycidnm9PMyB9nxIDoepD3rn0E-b7YctKK6u4"}'
{"message":"Invitation not found or expired","error":"Not Found","statusCode":404}
$ curl localhost:3000/invitations/accept -H "$BOB" --json '{"token":"CqkmdRyycidnm9PMyB9nxIDoepD3rn0E-b7YctKK6u4"}'
{"orgId":"1a01c225-98f1-405b-8603-91b4598b2862","userId":"da02b285-ec5c-419e-a6e4-9efaa8e3d87f","role":"admin"}
$ curl localhost:3000/invitations/accept -H "$BOB" --json '{"token":"CqkmdRyycidnm9PMyB9nxIDoepD3rn0E-b7YctKK6u4"}'
{"message":"Invitation not found or expired","error":"Not Found","statusCode":404}
$ curl localhost:3000/orgs -H "$BOB"
[{"id":"1a01c225-98f1-405b-8603-91b4598b2862","name":"Acme","createdAt":"2026-11-19T22:02:34.959Z","role":"admin"},{"id":"3bde374d-da6b-496b-8ddc-5accb192b6ec","name":"Globex","createdAt":"2026-11-19T22:02:34.999Z","role":"owner"}]

```

Carol 以相同方式接受她的邀请。作为成员，她可以看到成员列表，但不能邀请任何人：

```bash
$ curl localhost:3000/orgs/$ACME/members -H "$CAROL"
[{"userId":"e506ea03-5119-42d3-ad94-8c07e4a9f7c5","email":"ada@example.com","role":"owner","joinedAt":"2026-11-19T22:02:34.959Z"},{"userId":"da02b285-ec5c-419e-a6e4-9efaa8e3d87f","email":"bob@example.com","role":"admin","joinedAt":"2026-11-19T22:02:36.215Z"},{"userId":"b25e382d-62c2-47c5-8f58-3680c6af6dc1","email":"carol@example.com","role":"member","joinedAt":"2026-11-19T22:02:36.266Z"}]
$ curl localhost:3000/orgs/$ACME/invitations -H "$CAROL" --json '{"email":"dave@example.com"}'
{"message":"Requires the admin role","error":"Forbidden","statusCode":403}
$ ADA_ID=e506ea03-5119-42d3-ad94-8c07e4a9f7c5
$ BOB_ID=da02b285-ec5c-419e-a6e4-9efaa8e3d87f
$ CAROL_ID=b25e382d-62c2-47c5-8f58-3680c6af6dc1

```

Bob 是管理员，不能成为所有者或修改所有者。Ada 是唯一的所有者，在有其他所有者之前不能交出所有权：

```bash
$ curl -X PATCH localhost:3000/orgs/$ACME/members/$CAROL_ID -H "$BOB" --json '{"role":"owner"}'
{"message":"Only owners can make owners","error":"Forbidden","statusCode":403}
$ curl -X PATCH localhost:3000/orgs/$ACME/members/$ADA_ID -H "$BOB" --json '{"role":"member"}'
{"message":"Only owners can change owners","error":"Forbidden","statusCode":403}
$ curl -X PATCH localhost:3000/orgs/$ACME/members/$ADA_ID -H "$ADA" --json '{"role":"admin"}'
{"message":"An organization needs at least one owner","error":"Conflict","statusCode":409}
$ curl -X PATCH localhost:3000/orgs/$ACME/members/$BOB_ID -H "$ADA" --json '{"role":"owner"}'
{"orgId":"1a01c225-98f1-405b-8603-91b4598b2862","userId":"da02b285-ec5c-419e-a6e4-9efaa8e3d87f","role":"owner","createdAt":"2026-11-19T22:02:36.215Z"}
$ curl -X PATCH localhost:3000/orgs/$ACME/members/$ADA_ID -H "$ADA" --json '{"role":"admin"}'
{"orgId":"1a01c225-98f1-405b-8603-91b4598b2862","userId":"e506ea03-5119-42d3-ad94-8c07e4a9f7c5","role":"admin","createdAt":"2026-11-19T22:02:34.959Z"}
$ curl -X PATCH localhost:3000/orgs/$ACME/members/$BOB_ID -H "$BOB" --json '{"role":"admin"}'
{"message":"An organization needs at least one owner","error":"Conflict","statusCode":409}

```

Bob 现在是所有者，移除了 Carol，Ada 是管理员，删除了该项目（两者都返回 `204 No Content`）。审计日志包含每一次变更，按最新排序，对于被拒绝的 **请求** 没有记录：

```bash
$ curl -X DELETE localhost:3000/orgs/$ACME/members/$CAROL_ID -H "$BOB"
$ curl -X DELETE localhost:3000/orgs/$ACME/projects/$PROJECT -H "$ADA"
$ curl -s localhost:3000/orgs/$ACME/audit-events -H "$BOB" | jq -c '.[] | {action, data}'
{"action":"project.deleted","data":{"name":"Website redesign","projectId":"49b827a9-2fca-403b-bb6e-d31a461fa796"}}
{"action":"member.removed","data":{"userId":"b25e382d-62c2-47c5-8f58-3680c6af6dc1"}}
{"action":"member.role_changed","data":{"role":"admin","userId":"e506ea03-5119-42d3-ad94-8c07e4a9f7c5"}}
{"action":"member.role_changed","data":{"role":"owner","userId":"da02b285-ec5c-419e-a6e4-9efaa8e3d87f"}}
{"action":"member.joined","data":{"role":"member","invitationId":"ccf6b16b-419d-43ca-b4c0-ddf073b89ffe"}}
{"action":"member.joined","data":{"role":"admin","invitationId":"7645d709-4b9d-4165-b0d3-f0ebfdd46451"}}
{"action":"invitation.sent","data":{"role":"member","email":"carol@example.com"}}
{"action":"invitation.sent","data":{"role":"admin","email":"bob@example.com"}}
{"action":"organization.created","data":{"name":"Acme"}}

```

每条记录还包含其 `id`、`orgId`、谁进行变更的 `actorId` 以及 `createdAt`。

#### 测试

这里重要的保证是关于租户和竞态条件：一个组织中的成员不会获得另一个组织的任何内容；一个邀请只使用一次；两个所有者不能交出所有权到一个没有所有者的组织。像 PGlite 这样的进程内数据库只有一个连接，**请求** 永远不会真正竞态，因此这些测试是针对真实的 PostgreSQL 服务器，通过连接池运行，使用 `app.inject()` 发送同时运行的 **请求**。邮件传输被 `InMemoryMailTransport` 替换，它会保留收到的邮件，因此测试可以跟踪邀请中的链接（参见邮件章节中的 [Testing](/application/mail#测试)）：

```typescript title="test/organizations.e2e-spec.ts"
import { fileURLToPath } from 'node:url';
import { Logger } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import { getDrizzleToken } from '@nestjs/drizzle';
import { InMemoryMailTransport, MailTransport } from '@nestjs/mail';
import { NodeAdapter, type NestNodeApplication } from '@nestjs/platform-node';
import { Test } from '@nestjs/testing';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module.js';
import { auditEvents, memberships } from '../src/database/schema.js';

// A real PostgreSQL with a pool, so concurrent requests really race.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('SaaS API (e2e)', () => {
  const db = drizzle({ client: new Pool({ connectionString: url, max: 20 }) });
  const mailbox = new InMemoryMailTransport();
  let app: NestNodeApplication;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
    await db.execute(sql`TRUNCATE users, organizations, refresh_tokens CASCADE`);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDrizzleToken())
      .useValue(db)
      // scrypt at the default cost takes 128 MiB and a few hundred ms per hash.
      .overrideProvider(PasswordHasher)
      .useValue(new PasswordHasher({ logN: 10 }))
      // Keeps the mails, so the test can follow the invitation link.
      .overrideProvider(MailTransport)
      .useValue(mailbox)
      .compile();
    app = moduleRef.createNestApplication<NestNodeApplication>(new NodeAdapter());
    await app.init();
  });

  afterAll(() => app.close()); // closes the pool too

  let clients = 0;

  /** Signs a user up, and returns their id and a function that sends requests as them. */
  async function signUp(name: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email: `${name}@example.com`, password: 'correct horse battery' },
      // Sign-up is rate-limited per IP address: each user gets one of their own.
      remoteAddress: `10.0.0.${++clients}`,
    });
    const headers = { authorization: `Bearer ${res.json<{ accessToken: string }>().accessToken}` };
    const me = await app.inject({ method: 'GET', url: '/me', headers });
    const send = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
      app.inject({ method, url, headers, payload });
    return { id: me.json<{ id: string }>().id, send };
  }

  async function createOrganization(owner: Awaited<ReturnType<typeof signUp>>, name: string) {
    const res = await owner.send('POST', '/orgs', { name });
    expect(res.statusCode).toBe(201);
    return res.json<{ id: string }>().id;
  }

  it("keeps each organization's data to its members", async () => {
    const ada = await signUp('ada');
    const bob = await signUp('bob');
    const acme = await createOrganization(ada, 'Acme');
    const globex = await createOrganization(bob, 'Globex');
    const project = (await ada.send('POST', `/orgs/${acme}/projects`, { name: 'Roadmap' })).json<{ id: string }>();

    // Through Acme's routes: Bob isn't a member, so Acme doesn't exist for him.
    for (const path of ['/members', '/projects', `/projects/${project.id}`, '/audit-events']) {
      expect((await bob.send('GET', `/orgs/${acme}${path}`)).statusCode).toBe(404);
    }
    // Through his own organization's routes: the WHERE clause doesn't find Acme's project.
    expect((await bob.send('GET', `/orgs/${globex}/projects/${project.id}`)).statusCode).toBe(404);
    expect((await bob.send('DELETE', `/orgs/${globex}/projects/${project.id}`)).statusCode).toBe(404);
    expect((await bob.send('GET', '/orgs/not-a-uuid/projects')).statusCode).toBe(404);

    expect((await ada.send('GET', `/orgs/${acme}/projects/${project.id}`)).json()).toMatchObject({ name: 'Roadmap' });
  });

  /** The organizations a ProjectsService was created for, while `run` ran. */
  async function projectsServicesCreated(run: () => Promise<unknown>) {
    const log = vi.spyOn(Logger.prototype, 'log');
    try {
      await run();
      return log.mock.calls.map(([message]) => String(message)).filter((m) => m.startsWith('Created for organization'));
    } finally {
      log.mockRestore();
    }
  }

  it('builds one ProjectsService per organization, and reuses it', async () => {
    const ada = await signUp('ada-durable');
    const initech = await createOrganization(ada, 'Initech');

    const created = await projectsServicesCreated(() =>
      Promise.all(Array.from({ length: 5 }, () => ada.send('GET', `/orgs/${initech}/projects`))),
    );

    expect(created).toEqual([`Created for organization ${initech}`]);
  });

  it("never serves one organization's requests from another's instance", async () => {
    const ada = await signUp('ada-two-orgs');
    const [hooli, piedPiper] = await Promise.all([
      createOrganization(ada, 'Hooli'),
      createOrganization(ada, 'Pied Piper'),
    ]);

    // Interleaved, at the same time: five projects in each organization.
    const created = await projectsServicesCreated(() =>
      Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          ada.send('POST', `/orgs/${i % 2 ? piedPiper : hooli}/projects`, { name: `Project ${i}` }),
        ),
      ),
    );

    expect(created.sort()).toEqual([hooli, piedPiper].sort().map((id) => `Created for organization ${id}`));
    for (const orgId of [hooli, piedPiper]) {
      const list = (await ada.send('GET', `/orgs/${orgId}/projects`)).json<{ orgId: string }[]>();
      expect(list).toHaveLength(5);
      expect(list.every((project) => project.orgId === orgId)).toBe(true);
    }
  });

  it('invites by email, with a link that works once, for its recipient only', async () => {
    const ada = await signUp('ada-inviter');
    const carol = await signUp('carol');
    const dave = await signUp('dave');
    const acme = await createOrganization(ada, 'Acme');

    expect((await ada.send('POST', `/orgs/${acme}/invitations`, { email: 'carol@example.com' })).statusCode).toBe(201);
    const mail = mailbox.assertSent({ to: 'carol@example.com', subject: 'Join Acme' });
    const token = mail.link('/invitations/accept').searchParams.get('token');

    // Someone the link was forwarded to can't use it.
    expect((await dave.send('POST', '/invitations/accept', { token })).statusCode).toBe(404);
    // Accepted twice at once: one request spends the token.
    const results = await Promise.all([1, 2].map(() => carol.send('POST', '/invitations/accept', { token })));
    expect(results.map((res) => res.statusCode).sort()).toEqual([200, 404]);

    expect((await carol.send('GET', `/orgs/${acme}/projects`)).statusCode).toBe(200);
    // A member doesn't invite, delete projects or change roles.
    expect((await carol.send('POST', `/orgs/${acme}/invitations`, { email: 'eve@example.com' })).statusCode).toBe(403);
    expect((await carol.send('PATCH', `/orgs/${acme}/members/${carol.id}`, { role: 'admin' })).statusCode).toBe(403);
  });

  it('never leaves an organization without an owner', async () => {
    const ada = await signUp('ada-owner');
    const bob = await signUp('bob-owner');
    // Ten organizations, each with two owners who step down at the same moment.
    const orgs = await Promise.all(Array.from({ length: 10 }, (_, i) => createOrganization(ada, `Org ${i}`)));
    await db.insert(memberships).values(orgs.map((orgId) => ({ orgId, userId: bob.id, role: 'owner' as const })));

    const results = await Promise.all(
      orgs.flatMap((orgId) => [
        ada.send('PATCH', `/orgs/${orgId}/members/${ada.id}`, { role: 'admin' }),
        bob.send('PATCH', `/orgs/${orgId}/members/${bob.id}`, { role: 'admin' }),
      ]),
    );

    for (const [i, orgId] of orgs.entries()) {
      expect([results[2 * i].statusCode, results[2 * i + 1].statusCode].sort()).toEqual([200, 409]);
      const owners = await db
        .select()
        .from(memberships)
        .where(and(eq(memberships.orgId, orgId), eq(memberships.role, 'owner')));
      expect(owners).toHaveLength(1);
      // The refused demotion wrote nothing to the audit log.
      const changes = await db
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.orgId, orgId), eq(auditEvents.action, 'member.role_changed')));
      expect(changes).toHaveLength(1);
    }
  });
  it('lets only current owners change owners', async () => {
    const ada = await signUp('ada-third');
    const bob = await signUp('bob-third');
    const carol = await signUp('carol-third');
    // Ten organizations with three owners each. Ada removes Bob while Bob demotes Ada.
    const orgs = await Promise.all(Array.from({ length: 10 }, (_, i) => createOrganization(ada, `Trio ${i}`)));
    await db
      .insert(memberships)
      .values(orgs.flatMap((orgId) => [bob.id, carol.id].map((userId) => ({ orgId, userId, role: 'owner' as const }))));

    const results = await Promise.all(
      orgs.flatMap((orgId) => [
        ada.send('DELETE', `/orgs/${orgId}/members/${bob.id}`),
        bob.send('PATCH', `/orgs/${orgId}/members/${ada.id}`, { role: 'member' }),
      ]),
    );

    // Whichever ran second was no longer allowed to: Bob had been removed, or Ada demoted.
    for (const [i] of orgs.entries()) {
      const statuses = [results[2 * i].statusCode, results[2 * i + 1].statusCode];
      expect(statuses.filter((status) => status < 300)).toHaveLength(1);
    }
  });
});

```

- **租户测试尝试两种方式进入**。通过 Acme 的 URL，**守卫** 阻止了 Bob。通过他自己组织的 URL，**守卫** 允许他进入，只有 `WHERE` 子句阻止了他访问 Acme 的项目。
- **持久化** **提供者** **测试** 计数了创建的 **服务**，通过监视 `Logger`：一个组织有五个 **请求** 创建一个 **服务**，两个组织有十个交错的 **请求** 创建各自的一个 **服务**，同时每个组织的项目保持独立。使 `ProjectsService` **请求作用域** 但非持久化，两者都失败，每个 **请求** 一个 **服务**。
- **竞态测试** 同时运行十个竞态，每个组织两个 **请求**。在第一个中，两个所有者交出所有权；然后测试检查数据库：每个组织中都剩下一个所有者，并且只有一个降级事件的审计条目。在第二个中，Ada 移除 Bob，而 Bob 降级 Ada，Carol 是第三个所有者，因此只有重新读取 **执行上下文** 中的角色才能阻止第二个 **请求**。
- **额外的所有者成员资格是直接插入的**，以便在一个语句中设置竞态条件。测试检查的所有内容都经过 API。

创建自己的数据库，因为测试会截断表，然后运行它们。JWT 教程的 [refresh-token store test](/tutorials/rest-api-jwt-authentication#test-it) 在此处保持不变适用，并且两个文件截断的是同一数据库的表，所以按顺序运行它们：

```bash
$ docker exec saas-db psql -U postgres -c "CREATE DATABASE saas_test"
$ TEST_DATABASE_URL=postgres://postgres:saas@localhost:5432/saas_test npm run test:e2e -- --no-file-parallelism

 Test Files  2 passed (2)
      Tests  11 passed (11)

```

从 `lock()` 中移除 `FOR UPDATE`，两个竞态测试都失败了：两个所有者交出所有权，十个组织中有九个或十个没有所有者。保留锁，但使用 **守卫** 的角色而不是 `lock()` 读取的角色，第二个测试失败：Bob 被移除，但 Ada 仍然被他降级。

#### 生产检查清单

JWT 教程的 [checklist](/tutorials/rest-api-jwt-authentication#production-checklist) 中的所有内容都适用。特别是对于多租户后端：

- **将每个租户拥有的 **查询** 放在组织 ID 之后。** 本教程中的规则是 ID 来自 **守卫** 加载的成员资格，或者来自为 **守卫** 检查的路由参数构建的持久化 **提供者**，并进入每个语句的 `WHERE` 子句。审查新 **查询** 以确保这一点，并为每个新资源保留像上述租户测试这样的测试。
- **考虑行级安全作为第二道防线。** PostgreSQL 甚至可以拒绝其他租户的行，即使 **查询** 忘记了其 `WHERE` 子句，只要在 `org_id` 上有策略来读取您的代码在每个事务中设置的设置（`set_config('app.org_id', ..., true)`）。超级用户会绕过它，表的拥有者也会绕过它，除非表强制要求，因此应用程序会以自己的角色连接。参见 [Row security policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)。
- **在成员资格检查之后，而不是之前，按租户进行 **速率限制**。** **节流器** 的 **守卫** 是全局的，因此它在 `OrganizationGuard` 之前，在 **认证** 之前运行。一个以 URL 的 `:orgId` 为键的 **节流器** 跟踪器将允许任何人（无论是否是成员）消耗一个组织的预算。按已知成员资格的组织计数：在 **守卫** 中，或在 **服务** 中，使用所有实例共享的存储。
- **使用真实传输器发送邀请，并且在它们不能丢失时通过出件箱发送。** `LogMailTransport` 将邀请链接写入日志；日志会被传输和保留，因此仅用于开发。参见 [Send in production](/application/mail#send-in-production) 和 [Send after the order commits](/application/mail#send-after-the-order-commits)。
- **删除过期的邀请。** 接受会忽略它们，但它们仍然保留在表中。一个使用 [`@nestjs/schedule`](/techniques/task-scheduling) 并在超过 `expires_at` 的行上删除的每日 **任务** 就足够了。
- **保持审计日志追加式。** 应用程序中没有内容会更新或删除审计事件。仅授予应用程序的数据库角色对 `audit_events` 的 `INSERT` 和 `SELECT` 权限，这样错误或被盗连接也无法重写历史记录。
- **保持成员资格事务简短。** 它们会持有组织的锁直到提交。它们中没有内容等待除数据库之外的任何其他事物，并且邀请邮件在提交后发送；保持这种方式。
- **为生产环境提供自己的 Observe 密钥对**，来自项目的 **API Keys** 页面，作为平台环境中的 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET`：`start:prod` 不加载 `.env`。然后 [NestJS Observe](/observability/overview) 记录了每个 **请求**，包括其跨度跟踪、SQL 语句。要查看受影响的用户和租户，其 `getUserId` 选项会用每个用户的活动填充 **用户** 视图（参见 [Associating users with telemetry](/observability/sdk#associating-users-with-telemetry)），而添加到 **请求** 跨度上的标签（使用 `TracerService` 添加）使组织 ID 在仪表板中可见（参见 [Tags and custom attributes](/observability/sdk#标签和自定义属性)）。

#### 下一步

- 为角色提供更精细的权限，按记录级别：[Authorization](/security/authorization)。
- 从队列发送邀请，带有重试机制，在 **请求** 外部执行：[Mail](/application/mail) 和 [Queues](/techniques/queues)。
- 允许成员使用 Google 或其公司 Microsoft 目录登录：[Authentication](/security/authentication#add-sign-in-with-google)。
- 在生产环境中查看每个租户的活动、慢路由和错误：[Observability](/observability/overview)。
- 在相同的基础之上构建电子商务后端：[Build an e-commerce backend](/tutorials/ecommerce-backend)。