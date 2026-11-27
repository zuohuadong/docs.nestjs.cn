<!-- 此文件从 content/tutorials/project-management-api.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:51:32.473Z -->
<!-- 源文件: content/tutorials/project-management-api.md -->
<!-- 源哈希: 57c19f01ae667d1fcd5a520d0b08025a -->

### 构建一个 Node.js 项目管理 API

使用 NestJS 在 Node.js 中构建一个项目管理 API：包含项目、任务和评论、每记录权限、基于 SSE 的实时更新和到期日提醒。

该 API 为团队提供项目管理工具：包含成员的项目、具有状态、指派人和到期日的任务、评论、浏览器中的实时更新以及任务到期前的提醒。大部分是 CRUD 操作。非 CRUD 的部分是多人同时操作同一记录，因此本教程将重点介绍这些部分：针对每条记录的权限检查、不可相互覆盖的状态更改、在变化时能正确分页的任务列表，以及只携带用户自己项目的流。

到最后，该 API 将实现：

- 针对其触及的每条记录进行请求检查，遵循 [`@nestjs/authorization`](/security/authorization) 策略：项目成员可读、指派人或项目管理员可更改任务，只有作者可编辑评论。项目外部的用户对其中的所有内容返回 404。
- 使用条件更新，在 `todo`、`in_progress` 和 `done` 之间移动任务，确保同时移动同一卡片的两名用户不会同时成功。
- 按状态、指派人和到期日过滤项目任务列表，使用键集分页（keyset pagination）并为列表读取的每种方式建立索引。
- 通过 [Server-Sent Events](/http/server-sent-events) 将每项更改推送给项目成员，数据由 [`@nestjs/event-emitter`](/application/events) 提供。
- 从一个实例上运行的定时任务中，提醒到期在一天的任务的指派人，该任务使用 [`@nestjs/locks`](/reliability/locks) 实现。
- 使用针对 PostgreSQL 的测试来验证竞态条件、流和提醒功能。

它从 [Build a REST API with JWT authentication](/tutorials/rest-api-jwt-authentication) 的 API 开始，该 API 使用访问令牌和刷新令牌进行用户登录，使用 Zod 验证请求，并通过 Drizzle 在 PostgreSQL 中存储数据。本教程不再解释这些部分。

以下是端点及其添加每个端点的部分：

| 端点 | 部分 |
| --- | --- |
| `POST /auth/sign-up`, `POST /auth/token`, `POST /auth/token/refresh`, `POST /auth/token/revoke`, `GET /me`, `GET /health/live`, `GET /health/ready` | [Start from the JWT API](/tutorials/project-management-api#start-from-the-jwt-api) |
| `POST /projects`, `GET /projects`, `GET /projects/:projectId/members`, `POST /projects/:projectId/members` | [Share projects with their members](/tutorials/project-management-api#share-projects-with-their-members) |
| `POST /projects/:projectId/tasks`, `GET /projects/:projectId/tasks`, `GET /tasks/:id`, `PATCH /tasks/:id`, `POST /tasks/:id/status` | [Add tasks](/tutorials/project-management-api#add-tasks) |
| `GET /tasks/:taskId/comments`, `POST /tasks/:taskId/comments`, `PATCH /comments/:id` | [Comment on tasks](/tutorials/project-management-api#comment-on-tasks) |
| `GET /projects/:projectId/events` | [Stream changes with server-sent events](/tutorials/project-management-api#stream-changes-with-server-sent-events) |

> info **提示** 完成的应用在 GitHub 上是 [nestjs/example-project-management-api](https://github.com/nestjs/example-project-management-api)，包含其测试和 CI 工作流。

#### 从 JWT API 开始

创建项目，并安装本教程使用的所有内容。这些是 JWT 教程的包，外加 `@nestjs/authorization`、`@nestjs/event-emitter`、`@nestjs/schedule` 和 `@nestjs/locks`：

```bash
$ npm i -g @nestjs/cli
$ nest new projects-api --minimal
$ cd projects-api
$ npm uninstall @nestjs/platform-express @types/express
$ npm i --save @nestjs/platform-node zod @nestjs/config @nestjs/drizzle drizzle-orm@rc pg @nestjs/authentication @nestjs/authorization @nestjs/event-emitter @nestjs/schedule @nestjs/locks @nestjs/throttler @nestjs/swagger @nestjs/terminus
$ npm i --save-dev drizzle-kit@rc @types/pg @nestjs/testing vitest vite

```

然后从 [finished JWT tutorial](/tutorials/rest-api-jwt-authentication#sign-users-in-with-jwts) 复制这些文件，保持原样：

- `src/config.ts`、`src/main.ts`、`drizzle.config.ts` 和 `vitest.config.e2e.ts`
- `src/auth/`、`src/users/` 和 `src/health/` 下的所有内容
- `test/refresh-token.store.e2e-spec.ts`

忽略 `src/notes/` 和 JWT 教程的 `drizzle/` 文件夹：该应用程序的第一个迁移来自其自身的模式，见下一节。将笔记重命名为项目名称：将 `realm` 在 `JwtAuth` 中重命名，并将 `main.ts` 中的 OpenAPI 文档标题进行修改。将测试脚本添加到 `package.json`：

```json
"test:e2e": "vitest run --config ./vitest.config.e2e.ts"

```

最后，在 `.env` 中添加数据库 URL 和一个 `JWT_SECRET`，与 JWT 教程中一样，使用应用程序自己的数据库：

```bash
$ docker run -d --name projects-db -e POSTGRES_PASSWORD=projects -e POSTGRES_DB=projects -p 5432:5432 postgres:17

```

其 URL 放在 `.env` 中，紧邻签名密钥：

```bash
DATABASE_URL=postgres://postgres:projects@localhost:5432/projects
# Generate with: openssl rand -base64 32
JWT_SECRET=

```

向项目添加成员是通过电子邮件进行的，因此 `UsersRepository` 获得一个通过地址查找用户的方法：

```typescript title="src/users/users.repository.ts"
// ...
  async findByEmail(email: string): Promise<User | null> {
    const [user] = await this.db.select(columns).from(users).where(eq(users.email, normalize(email)));
    return user ?? null;
  }

```

#### 设计模式

整个模式在一个文件中。用户和刷新令牌是 JWT 教程的：

```typescript title="src/database/schema.ts"
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  foreignKey,
  index,
  jsonb,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const ms = (name: string) => timestamp(name, { withTimezone: true, mode: 'date', precision: 3 });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: at('created_at').notNull().defaultNow(),
});

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: at('created_at').notNull().defaultNow(),
});

export const projectMembers = pgTable(
  'project_members',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['admin', 'member'] }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    // "My projects" looks memberships up by user.
    index('project_members_user_id_idx').on(table.userId),
  ],
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    status: text('status', { enum: ['todo', 'in_progress', 'done'] }).notNull().default('todo'),
    assigneeId: uuid('assignee_id'),
    dueAt: at('due_at'),
    remindedAt: at('reminded_at'),
    // To the millisecond, like a JavaScript Date, so a page cursor round-trips exactly.
    createdAt: ms('created_at').notNull().defaultNow(),
    updatedAt: ms('updated_at').notNull().defaultNow(),
  },
  (table) => [
    // The assignee is a member of the task's project, whatever the application does.
    foreignKey({
      name: 'tasks_assignee_is_member_fk',
      columns: [table.projectId, table.assigneeId],
      foreignColumns: [projectMembers.projectId, projectMembers.userId],
    }),
    // One index per way the list is read: all tasks, by status, by assignee.
    index('tasks_project_id_created_at_idx').on(table.projectId, table.createdAt, table.id),
    index('tasks_project_id_status_created_at_idx').on(table.projectId, table.status, table.createdAt, table.id),
    index('tasks_project_id_assignee_id_created_at_idx').on(
      table.projectId,
      table.assigneeId,
      table.createdAt,
      table.id,
    ),
    // The reminder job's scan: open tasks that haven't been reminded yet.
    index('tasks_due_at_unreminded_idx')
      .on(table.dueAt)
      .where(sql`${table.remindedAt} is null and ${table.status} <> 'done'`),
  ],
);

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: at('created_at').notNull().defaultNow(),
    updatedAt: at('updated_at').notNull().defaultNow(),
  },
  (table) => [index('comments_task_id_created_at_idx').on(table.taskId, table.createdAt)],
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

// What @nestjs/locks keeps, through DrizzleLockStore: one row per lock key.
export const locks = pgTable('locks', {
  key: text('key').primaryKey(),
  /** The holder's id; null once released. */
  owner: text('owner'),
  fencingToken: bigint('fencing_token', { mode: 'number' }).notNull(),
  /** On the database's clock: every instance agrees on it. */
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

/** Fencing tokens for every key: a sequence never goes back, so they only grow. */
export const locksFencingTokenSeq = pgSequence('locks_fencing_token_seq');

export type Project = typeof projects.$inferSelect;
export type Membership = typeof projectMembers.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Comment = typeof comments.$inferSelect;

```

- **会员资格是 `project_members` 的一行**，以项目和用户为键，其中包含用户在该项目中的角色：`admin` 或 `member`。角色属于会员资格，不属于用户，因此 Ada 可以运行一个项目，同时是另一个项目的成员。
- **指派人是一个成员，通过外键实现。** `tasks_assignee_is_member_fk` 指向 `(project_id, assignee_id)` 中的 `project_members`，因此 PostgreSQL 会拒绝将任务指派给其项目外部的人，无论代码如何操作。当 `assignee_id` 为 null 时，不会检查该键，任务即为未指派。
- **任务的 `created_at` 以毫秒为单位存储。** 列表的页面游标携带它，而 JavaScript 的 `Date` 存储毫秒，而 PostgreSQL 的默认值是微秒。丢弃微秒的游标将跳过在同一毫秒内创建的任务；[Page through the list](/tutorials/project-management-api#page-through-the-list) 进行了解释。
- **任务列表的每种读取方式都有一个索引**：项目的所有任务、具有状态的任务以及指派人的任务，都按照列表分页的顺序排列。提醒任务有一个部分索引，只包含尚未提醒的开放任务，因此无论完成多少任务，它都保持较小。
- **`locks` 及其序列用于 `@nestjs/locks`**，后者将其租约保存在应用程序的数据库中。它们是 [Keep locks in your database](/reliability/locks#keep-locks-in-your-database) 中的表。

生成迁移并应用它（参见 [Migrations](https://docs.nestjs.com/data/drizzle#迁移)）：

```bash
$ npx drizzle-kit generate --name=projects
$ npx drizzle-kit migrate

```

#### 与其成员共享项目

在根模块中注册本教程添加的模块，以及后续部分中的功能模块：

```typescript title="src/app.module.ts"
import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthenticationModule } from '@nestjs/authentication';
import { AuthorizationModule } from '@nestjs/authorization';
import { DrizzleModule } from '@nestjs/drizzle';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LocksModule } from '@nestjs/locks';
import { createObserveModule } from '@nestjs/observe';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule, minutes, normalizeIp } from '@nestjs/throttler';
import { drizzle } from 'drizzle-orm/node-postgres';
import { ActivityModule } from './activity/activity.module.js';
import { accountEmail } from './auth/account-email.js';
import { AuthModule } from './auth/auth.module.js';
import { envSchema, type Env } from './config.js';
import { DrizzleLockStore } from './database/drizzle-lock.store.js';
import { HealthModule } from './health/health.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { TasksModule } from './tasks/tasks.module.js';
import { UsersModule } from './users/users.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // First, so it shuts down last and still sends what the other modules did.
    ObserveModule.forRoot({
      // Empty until `npx @nestjs/observe link` writes the key pair into .env: the SDK then sends nothing.
      appKey: process.env.OBSERVE_APP_KEY ?? '',
      appSecret: process.env.OBSERVE_APP_SECRET ?? '',
      serviceId: 'projects-api',
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
          issuer: 'projects-api',
          audience: 'projects-api',
          ttl: '15m',
        },
        refreshToken: { ttl: '30d', absoluteTtl: '90d' },
      }),
    }),
    // After AuthenticationModule: its guard reads the user that authentication sets.
    AuthorizationModule.forRoot(),
    // `task.*` and `comment.*` listeners need wildcards.
    EventEmitterModule.forRoot({ wildcard: true }),
    ScheduleModule.forRoot(),
    LocksModule.forRoot(),
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
    ProjectsModule,
    TasksModule,
    ActivityModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: StandardSchemaValidationPipe },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    DrizzleLockStore,
  ],
})
export class AppModule {}

```

- `AuthorizationModule` 紧随 `AuthenticationModule` 之后。两者都注册了一个全局守卫，而授权需要认证设置的用户。其守卫**默认拒绝**：一个路由只有在声明了谁可以调用它时才运行，使用 `@Can()`、`@Can.Anyone()` 或 `@Public()`。JWT 教程中 `/auth` 和 `/health` 下的路由已经是 `@Public()`。
- `EventEmitterModule` 开启了通配符，用于流的监听器。`ScheduleModule` 和 `LocksModule` 运行提醒任务，而 `DrizzleLockStore` 将任务的租约保存在 PostgreSQL 中。它们将在下面的各自部分中介绍。

`GET /me` 适用于任何已登录用户：

```typescript title="src/users/me.controller.ts"
import { Can } from '@nestjs/authorization';
// ...

@Can.Anyone()
@Controller('me')
export class MeController {
  // ...
}

```

##### 成员资格策略

项目中的谁可以做什么取决于用户在该项目中的成员资格，因此项目策略将成员资格作为其记录：

```typescript title="src/projects/project.policy.ts"
import { Policy } from '@nestjs/authorization';
import type { Membership } from '../database/schema.js';
import type { User } from '../users/user.js';

/** `membership` is the user's membership of the project, or `null` if they have none. */
@Policy()
export class ProjectPolicy {
  // Members see the project, its tasks and their comments.
  view(user: User, membership: Membership | null) {
    return membership?.userId === user.id;
  }

  // Admins add members.
  manage(user: User, membership: Membership | null) {
    return membership?.userId === user.id && membership.role === 'admin';
  }
}

```

能力使用 `User`，而不是 `User | null`：此 API 的每个路由都需要已登录用户。服务在加载成员资格后调用它们，就像授权章节使用 [orders record by record](/security/authorization#check-orders-record-by-record) 那样。对于项目内部工作的每个服务，`MembershipsService` 会加载用户的成员资格并进行检查：

```typescript title="src/projects/memberships.service.ts"
import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthorizationService } from '@nestjs/authorization';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { projectMembers, type Membership } from '../database/schema.js';
import type { User } from '../users/user.js';
import { ProjectPolicy } from './project.policy.js';

@Injectable()
export class MembershipsService {
  constructor(
    @InjectDrizzle() private readonly db: NodePgDatabase,
    private readonly authorizationService: AuthorizationService,
  ) {}

  /** The user's membership of the project. A project they may not see is a 404, as if it didn't exist. */
  async access(user: User, projectId: string): Promise<Membership | null> {
    const [membership = null] = await this.db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, user.id)));
    await this.check(user, membership, 'Project not found');
    return membership;
  }

  /** Throws a 404 with `message` unless `membership` lets the user see its project. */
  async check(user: User, membership: Membership | null, message: string): Promise<void> {
    if (!(await this.authorizationService.can(ProjectPolicy, 'view', user, membership))) {
      throw new NotFoundException(message);
    }
  }
}

```

未成为项目成员的用户会收到 404 错误，与不存在的项目返回的答案相同；403 错误则确认项目存在。`can()` 在拒绝时解析为 `false` 而不是抛出，因此服务本身抛出 404。不允许执行某些操作的成员会从 `authorize()` 收到 403 错误，而 [the authorization module turns into a `ForbiddenException`](/security/authorization#tell-guests-from-forbidden-users-and-expose-permissions) 说明：他们知道项目存在，再次登录也无济于事。

##### 项目和成员

一个项目有一个名称，成员通过电子邮件添加，可以是管理员或普通成员：

```typescript title="src/projects/projects.schemas.ts"
import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
});
export type CreateProjectDto = z.infer<typeof createProjectSchema>;

export const addMemberSchema = z.object({
  email: z.email(),
  role: z.enum(['admin', 'member']).default('member'),
});
export type AddMemberDto = z.infer<typeof addMemberSchema>;

```

服务创建项目并列出其成员，并在添加成员前检查项目的策略：

```typescript title="src/projects/projects.service.ts"
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthorizationService } from '@nestjs/authorization';
import { InjectDrizzle } from '@nestjs/drizzle';
import { asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { projectMembers, projects, users } from '../database/schema.js';
import type { User } from '../users/user.js';
import { UsersRepository } from '../users/users.repository.js';
import { MembershipsService } from './memberships.service.js';
import { ProjectPolicy } from './project.policy.js';
import type { AddMemberDto, CreateProjectDto } from './projects.schemas.js';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectDrizzle() private readonly db: NodePgDatabase,
    private readonly memberships: MembershipsService,
    private readonly authorizationService: AuthorizationService,
    private readonly usersRepository: UsersRepository,
  ) {}

  /** Creates the project with its creator as its first admin, or neither. */
  create(user: User, dto: CreateProjectDto) {
    return this.db.transaction(async (tx) => {
      const [project] = await tx.insert(projects).values(dto).returning();
      await tx.insert(projectMembers).values({ projectId: project.id, userId: user.id, role: 'admin' });
      return { ...project, role: 'admin' as const };
    });
  }

  /** The projects the user is a member of, with their role in each. */
  findMine(user: User) {
    return this.db
      .select({ id: projects.id, name: projects.name, createdAt: projects.createdAt, role: projectMembers.role })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(eq(projectMembers.userId, user.id))
      .orderBy(asc(projects.name));
  }

  async members(user: User, projectId: string) {
    await this.memberships.access(user, projectId);
    return this.db
      .select({ userId: users.id, email: users.email, role: projectMembers.role })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, projectId))
      .orderBy(asc(users.email));
  }

  async addMember(user: User, projectId: string, { email, role }: AddMemberDto) {
    const membership = await this.memberships.access(user, projectId);
    await this.authorizationService.authorize(ProjectPolicy, 'manage', user, membership);
    const member = await this.usersRepository.findByEmail(email);
    if (!member) {
      throw new NotFoundException('No user with this email');
    }
    const [added] = await this.db
      .insert(projectMembers)
      .values({ projectId, userId: member.id, role })
      .onConflictDoNothing()
      .returning();
    if (!added) {
      throw new ConflictException('Already a member');
    }
    return { userId: member.id, email: member.email, role: added.role };
  }
}

```

- **项目及其第一个管理员在一个事务中创建。** 没有成员的项目对任何人不可见，也无法添加成员。
- **`addMember()` 将 `manage` 与调用者自身的成员资格进行检查**：它使用 `access()` 加载该成员资格，该操作也会对非成员返回 404，然后询问策略该成员资格是否为管理员。
- **重复添加某人是 409 错误**，来自成员资格的主键上的 `onConflictDoNothing()`：两个管理员同时添加同一用户时，一个成功添加，另一个得知该用户已存在。角色更改不在本教程中，因为它引入了自己的规则：项目必须始终保留一名管理员。

每个路由都在服务中检查权限，因此控制器声明 `@Can.Anyone()`。如果没有它，授权守卫将拒绝所有请求：

```typescript title="src/projects/projects.controller.ts"
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { z } from 'zod';
import type { User } from '../users/user.js';
import { addMemberSchema, createProjectSchema, type AddMemberDto, type CreateProjectDto } from './projects.schemas.js';
import { ProjectsService } from './projects.service.js';

const projectId = { schema: z.uuid() };

// Every route checks the caller's membership in the service.
@Can.Anyone()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  create(@CurrentUser() user: User, @Body({ schema: createProjectSchema }) dto: CreateProjectDto) {
    return this.projectsService.create(user, dto);
  }

  @Get()
  findMine(@CurrentUser() user: User) {
    return this.projectsService.findMine(user);
  }

  @Get(':projectId/members')
  members(@CurrentUser() user: User, @Param('projectId', projectId) id: string) {
    return this.projectsService.members(user, id);
  }

  @Post(':projectId/members')
  addMember(
    @CurrentUser() user: User,
    @Param('projectId', projectId) id: string,
    @Body({ schema: addMemberSchema }) dto: AddMemberDto,
  ) {
    return this.projectsService.addMember(user, id, dto);
  }
}

```

项目模块注册控制器、服务和策略，并为其他模块导出成员资格：

```typescript title="src/projects/projects.module.ts"
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { MembershipsService } from './memberships.service.js';
import { ProjectPolicy } from './project.policy.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

@Module({
  imports: [UsersModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, MembershipsService, ProjectPolicy],
  exports: [MembershipsService],
})
export class ProjectsModule {}

```

`ProjectsModule` 导出 `MembershipsService`，用于任务、评论和流。

#### 添加任务

请求模式：

```typescript title="src/tasks/tasks.schemas.ts"
import { z } from 'zod';

const title = z.string().trim().min(1).max(200);
const description = z.string().max(10_000);
const status = z.enum(['todo', 'in_progress', 'done']);
// An instant with its offset, such as 2026-12-01T17:00:00Z.
const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

export const createTaskSchema = z.object({
  title,
  description: description.default(''),
  assigneeId: z.uuid().optional(),
  dueAt: instant.optional(),
});
export type CreateTaskDto = z.infer<typeof createTaskSchema>;

// `null` unassigns a task or clears its due date. Strict: a `status` here is a 400, not ignored.
export const updateTaskSchema = z
  .strictObject({ title, description, assigneeId: z.uuid().nullable(), dueAt: instant.nullable() })
  .partial();
export type UpdateTaskDto = z.infer<typeof updateTaskSchema>;

export const commentSchema = z.object({
  body: z.string().trim().min(1).max(5_000),
});
export type CommentDto = z.infer<typeof commentSchema>;

// The client says which status it moves the task from: the status it showed the user.
export const moveTaskSchema = z
  .object({ from: status, to: status })
  .refine(({ from, to }) => from !== to, { message: 'from and to must differ', path: ['to'] });
export type MoveTaskDto = z.infer<typeof moveTaskSchema>;

export interface TaskCursor {
  createdAt: string;
  id: string;
}

const cursorSchema = z.tuple([z.iso.datetime(), z.uuid()]);

/** The position after the last task of a page, opaque to the client. */
export const encodeCursor = ({ createdAt, id }: { createdAt: Date; id: string }) =>
  Buffer.from(JSON.stringify([createdAt.toISOString(), id])).toString('base64url');

const cursor = z.string().max(200).transform((value, ctx): TaskCursor => {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value, 'base64url').toString());
  } catch {}
  const parsed = cursorSchema.safeParse(decoded);
  if (!parsed.success) {
    ctx.addIssue({ code: 'custom', message: 'Invalid cursor' });
    return z.NEVER;
  }
  const [createdAt, id] = parsed.data;
  return { createdAt, id };
});

export const listTasksQuerySchema = z.object({
  status: status.optional(),
  assigneeId: z.uuid().optional(),
  dueBefore: instant.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  after: cursor.optional(),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

```

- **`assigneeId` 和 `dueAt` 在更新中接收 `null`**，这会取消分配任务或清除其到期日期。其他字段不能为空：一个 `null` 标题如果缺失则返回 400。
- **更新模式是严格的。** `z.strictObject()` 会拒绝它不认识的键，因此一个包含 `status` 的 `PATCH` 会返回 400（指明键），而不是静默忽略它的 200。状态更改有自己的端点。
- **瞬态携带其偏移量。** `z.iso.datetime()` 带有 `offset` 选项接受 `2026-12-01T17:00:00+01:00` 和 `2026-12-01T16:00:00Z`，并拒绝没有时间的日期，因为时区将是猜测。
- **游标对客户端是不可见的**，一个 base64url 字符串，并像任何其他输入一样进行验证：无法解码为时间戳和 ID 的输入会返回 400。

##### 谁可以更改任务

任何成员都可以添加任务和评论。更改任务的权限属于其被指派人和项目管理员，这取决于任务以及用户在该项目中的成员资格，因此能力同时考虑了两者：

```typescript title="src/tasks/task.policy.ts"
import { Policy } from '@nestjs/authorization';
import type { Membership, Task } from '../database/schema.js';
import type { User } from '../users/user.js';

@Policy()
export class TaskPolicy {
  // The assignee or a project admin changes a task. `membership` is the user's, in the task's project.
  update(user: User, task: Task, membership: Membership | null) {
    if (membership?.userId !== user.id || membership.projectId !== task.projectId) {
      return false;
    }
    return membership.role === 'admin' || task.assigneeId === user.id;
  }
}

```

服务在一个查询中加载每个任务以及用户在该项目中的成员资格，并根据加载的内容检查策略：

```typescript title="src/tasks/tasks.service.ts"
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthorizationService } from '@nestjs/authorization';
import { InjectDrizzle } from '@nestjs/drizzle';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DatabaseError } from 'pg';
import type { ProjectActivity } from '../activity/project-activity.js';
import { projectMembers, tasks, type Task } from '../database/schema.js';
import { MembershipsService } from '../projects/memberships.service.js';
import type { User } from '../users/user.js';
import { TaskPolicy } from './task.policy.js';
import {
  encodeCursor,
  type CreateTaskDto,
  type ListTasksQuery,
  type MoveTaskDto,
  type UpdateTaskDto,
} from './tasks.schemas.js';

@Injectable()
export class TasksService {
  constructor(
    @InjectDrizzle() private readonly db: NodePgDatabase,
    private readonly memberships: MembershipsService,
    private readonly authorizationService: AuthorizationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Any member adds a task to the project. */
  async create(user: User, projectId: string, dto: CreateTaskDto): Promise<Task> {
    await this.memberships.access(user, projectId);
    const [task] = await this.db
      .insert(tasks)
      .values({ ...dto, projectId })
      .returning()
      .catch(assigneeNotMember);
    this.emit({ type: 'task.created', projectId, data: task });
    return task;
  }

  /** A page of the project's tasks, newest first. */
  async list(user: User, projectId: string, { status, assigneeId, dueBefore, limit, after }: ListTasksQuery) {
    await this.memberships.access(user, projectId);
    const rows = await this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.projectId, projectId),
          status ? eq(tasks.status, status) : undefined,
          assigneeId ? eq(tasks.assigneeId, assigneeId) : undefined,
          dueBefore ? lt(tasks.dueAt, dueBefore) : undefined,
          // Keyset pagination: the tasks after the cursor's, in the index's order.
          after
            ? sql`(${tasks.createdAt}, ${tasks.id}) < (${after.createdAt}::timestamptz, ${after.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(tasks.createdAt), desc(tasks.id))
      .limit(limit + 1);
    const items = rows.slice(0, limit);
    return { items, nextCursor: rows.length > limit ? encodeCursor(items[items.length - 1]) : null };
  }

  async findOne(user: User, id: string): Promise<Task> {
    return (await this.load(user, id)).task;
  }

  /** The assignee or an admin changes the task's fields. */
  async update(user: User, id: string, dto: UpdateTaskDto): Promise<Task> {
    const { task, membership } = await this.load(user, id);
    await this.authorizationService.authorize(TaskPolicy, 'update', user, task, membership);
    const [updated] = await this.db
      .update(tasks)
      // A new due date gets a new reminder.
      .set({ ...dto, remindedAt: dto.dueAt === undefined ? undefined : null, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning()
      .catch(assigneeNotMember);
    if (!updated) {
      throw new NotFoundException('Task not found');
    }
    this.emit({ type: 'task.updated', projectId: updated.projectId, data: updated });
    return updated;
  }

  /** Moves the task from the status the client saw to another, or answers 409 if it has moved since. */
  async move(user: User, id: string, { from, to }: MoveTaskDto): Promise<Task> {
    const { task, membership } = await this.load(user, id);
    await this.authorizationService.authorize(TaskPolicy, 'update', user, task, membership);
    // Conditional: of two moves from the same status, one wins.
    const [moved] = await this.db
      .update(tasks)
      .set({ status: to, updatedAt: new Date() })
      .where(and(eq(tasks.id, id), eq(tasks.status, from)))
      .returning();
    if (!moved) {
      throw new ConflictException(`Task is no longer ${from}`);
    }
    this.emit({ type: 'task.updated', projectId: moved.projectId, data: moved });
    return moved;
  }

  /** The task with the user's membership of its project, in one query. */
  async load(user: User, id: string) {
    const [row] = await this.db
      .select({ task: tasks, membership: projectMembers })
      .from(tasks)
      .leftJoin(projectMembers, and(eq(projectMembers.projectId, tasks.projectId), eq(projectMembers.userId, user.id)))
      .where(eq(tasks.id, id));
    if (!row) {
      throw new NotFoundException('Task not found');
    }
    // A task in a project the user isn't in is as missing as one that doesn't exist.
    await this.memberships.check(user, row.membership, 'Task not found');
    return row;
  }

  private emit(activity: ProjectActivity) {
    this.eventEmitter.emit(activity.type, activity);
  }
}

/** The assignee foreign key's violation as a 400, rather than a 500. */
function assigneeNotMember(error: unknown): never {
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause instanceof DatabaseError && cause.constraint === 'tasks_assignee_is_member_fk') {
    throw new BadRequestException('The assignee is not a member of this project');
  }
  throw error;
}

```

- **`load()` 是一个查询**：任务与调用者的 `project_members` 行进行左连接。缺少任务和任务在其他人的项目中的情况返回相同的 404。
- **在写入返回后调用发射器**，因此数据库拒绝的变更不会有任何通知。监听的流在 [its own section](/tutorials/project-management-api#stream-changes-with-server-sent-events) 中进入。
- **项目外部的被指派人返回 400**。外键拒绝写入，而 `assigneeNotMember()` 将该约束的违规转换为 `BadRequestException`。Drizzle 包装了驱动程序的错误，因此约束的名称在其 `cause` 中。任何其他数据库错误仍会作为 500 错误到达客户端，这是正确的。
- **新的到期日期会清除 `reminded_at`**，因此被指派人也会收到新日期的提醒。

##### 在不丢失变更的情况下移动任务

两个人查看同一个看板。Bob 将一个任务从 `todo` 拖动到 `in_progress`，同时 Ada 将其从 `todo` 拖动到 `done`。使用一个仅设置状态的 `UPDATE`，两个请求都成功了，最后一个获胜，而其中一人在不知情的情况下查看了一个错误的状态。

因此，客户端会说明它将任务从哪个状态移动：它向用户展示的状态。`move()` 将其作为其 `UPDATE` 的条件，如果任务在此期间已离开该状态，则该语句不改变任何内容，客户端收到 409 错误，提示它重新加载任务并让用户再次决定。状态是在写入语句中检查的，而不是在策略的早期读取中检查：PostgreSQL 为更新锁定行，因此在同时从 `todo` 移动的十个操作中，恰好有一个发现任务仍处于 `todo` 状态。末尾的 [test](/tutorials/project-management-api#test-it) 执行这十个操作。

##### 遍历列表

`list()` 读取项目任务的一个页面，按最新排序，并支持任何过滤器。它使用**游标**而不是偏移量进行分页。使用 `offset=20` 时，当用户读取第一页时创建的任务会使每个任务向下移动一个，因此第二页会重复一个；而且 PostgreSQL 必须读取并丢弃偏移量之前的所有行，因此深度页面会变慢。游标代替地命名页面上的最后一个任务，通过其 `created_at` 和其 id，下一页是排序在该任务之后的任务：

```sql
(created_at, id) < ($1, $2)  -- ORDER BY created_at DESC, id DESC

```

id 包含在游标中，因为仅有 `created_at` 不够唯一：由单个语句插入的任务共享它。并且游标的 `created_at` 必须与存储的完全一致，这就是该列存储到毫秒的原因。使用 PostgreSQL 的默认精度，在 `21:54:53.387412` 创建的任务将获得 `21:54:53.387` 的游标，并且该毫秒之后排序的任务永远不会出现在页面上。

查询的 `WHERE` 和 `ORDER BY` 匹配一个索引，因此 PostgreSQL 无论页面多深，都读取一个索引条目页面，索引条件中包含游标。在 50 个项目中有 100,000 个任务的情况下，`EXPLAIN` 显示每个列表读取其自己的索引，反向：看板的 `todo` 列使用 `tasks_project_id_status_created_at_idx`，被指派人的任务使用 `tasks_project_id_assignee_id_created_at_idx`，以及整个列表的后续页面使用 `tasks_project_id_created_at_idx`。提醒任务的扫描使用 `tasks_due_at_unreminded_idx`。

`dueBefore` 过滤每个索引返回的行，而不是拥有自己的索引：它缩小了一个列表，但按到期日期排序的列表需要一个可以在可空列上的游标。按到期日期分页的列表使用 `(due_at, id)` 相同的技术，以及一个匹配的索引。

```typescript title="src/tasks/tasks.controller.ts"
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { z } from 'zod';
import type { User } from '../users/user.js';
import {
  createTaskSchema,
  listTasksQuerySchema,
  moveTaskSchema,
  updateTaskSchema,
  type CreateTaskDto,
  type ListTasksQuery,
  type MoveTaskDto,
  type UpdateTaskDto,
} from './tasks.schemas.js';
import { TasksService } from './tasks.service.js';

const uuid = { schema: z.uuid() };

// Every route checks the caller's permissions in the service, against the task.
@Can.Anyone()
@Controller()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post('projects/:projectId/tasks')
  create(
    @CurrentUser() user: User,
    @Param('projectId', uuid) projectId: string,
    @Body({ schema: createTaskSchema }) dto: CreateTaskDto,
  ) {
    return this.tasksService.create(user, projectId, dto);
  }

  @Get('projects/:projectId/tasks')
  list(
    @CurrentUser() user: User,
    @Param('projectId', uuid) projectId: string,
    @Query({ schema: listTasksQuerySchema }) query: ListTasksQuery,
  ) {
    return this.tasksService.list(user, projectId, query);
  }

  @Get('tasks/:id')
  findOne(@CurrentUser() user: User, @Param('id', uuid) id: string) {
    return this.tasksService.findOne(user, id);
  }

  @Patch('tasks/:id')
  update(@CurrentUser() user: User, @Param('id', uuid) id: string, @Body({ schema: updateTaskSchema }) dto: UpdateTaskDto) {
    return this.tasksService.update(user, id, dto);
  }

  @Post('tasks/:id/status')
  @HttpCode(200)
  move(@CurrentUser() user: User, @Param('id', uuid) id: string, @Body({ schema: moveTaskSchema }) dto: MoveTaskDto) {
    return this.tasksService.move(user, id, dto);
  }
}

```

`POST /tasks/:id/status` 修改现有任务，因此返回 200 而不是 201。

#### 关于任务的评论

只有作者可以编辑评论。记录本身就足够了，所以该能力只需要评论：

```typescript title="src/tasks/comment.policy.ts"
import { Policy } from '@nestjs/authorization';
import type { Comment } from '../database/schema.js';
import type { User } from '../users/user.js';

@Policy()
export class CommentPolicy {
  // Only its author edits a comment: an admin can't edit someone else's either.
  edit(user: User, comment: Comment) {
    return comment.authorId === user.id;
  }
}

```

其主体模式 `commentSchema` 在上文 `tasks.schemas.ts` 中。该服务：

```typescript title="src/tasks/comments.service.ts"
import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthorizationService } from '@nestjs/authorization';
import { InjectDrizzle } from '@nestjs/drizzle';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { ProjectActivity } from '../activity/project-activity.js';
import { comments, projectMembers, tasks, type Comment } from '../database/schema.js';
import { MembershipsService } from '../projects/memberships.service.js';
import type { User } from '../users/user.js';
import { CommentPolicy } from './comment.policy.js';
import type { CommentDto } from './tasks.schemas.js';
import { TasksService } from './tasks.service.js';

@Injectable()
export class CommentsService {
  constructor(
    @InjectDrizzle() private readonly db: NodePgDatabase,
    private readonly tasksService: TasksService,
    private readonly memberships: MembershipsService,
    private readonly authorizationService: AuthorizationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** The task's comments, oldest first, for members of its project. */
  async list(user: User, taskId: string): Promise<Comment[]> {
    await this.tasksService.load(user, taskId);
    return this.db.select().from(comments).where(eq(comments.taskId, taskId)).orderBy(asc(comments.createdAt)).limit(200);
  }

  /** Any member comments on a task. */
  async create(user: User, taskId: string, { body }: CommentDto): Promise<Comment> {
    const { task } = await this.tasksService.load(user, taskId);
    const [comment] = await this.db.insert(comments).values({ taskId, authorId: user.id, body }).returning();
    this.emit({ type: 'comment.created', projectId: task.projectId, data: comment });
    return comment;
  }

  /** Only the author edits a comment. */
  async update(user: User, id: string, { body }: CommentDto): Promise<Comment> {
    const [row] = await this.db
      .select({ comment: comments, projectId: tasks.projectId, membership: projectMembers })
      .from(comments)
      .innerJoin(tasks, eq(tasks.id, comments.taskId))
      .leftJoin(projectMembers, and(eq(projectMembers.projectId, tasks.projectId), eq(projectMembers.userId, user.id)))
      .where(eq(comments.id, id));
    if (!row) {
      throw new NotFoundException('Comment not found');
    }
    await this.memberships.check(user, row.membership, 'Comment not found');
    await this.authorizationService.authorize(CommentPolicy, 'edit', user, row.comment);
    const [updated] = await this.db
      .update(comments)
      .set({ body, updatedAt: new Date() })
      .where(and(eq(comments.id, id), eq(comments.authorId, user.id)))
      .returning();
    if (!updated) {
      throw new NotFoundException('Comment not found');
    }
    this.emit({ type: 'comment.updated', projectId: row.projectId, data: updated });
    return updated;
  }

  private emit(activity: ProjectActivity) {
    this.eventEmitter.emit(activity.type, activity);
  }
}

```

`update()` 中检查的顺序决定了状态码：项目外部的用户会收到 404，而项目中的每个记录和非作者的成员会收到 403。作者也在 `UPDATE` 的 `WHERE` 子句中，因此无论之前发生什么，该陈述都不能更改其他人的评论。

```typescript title="src/tasks/comments.controller.ts"
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { z } from 'zod';
import type { User } from '../users/user.js';
import { commentSchema, type CommentDto } from './tasks.schemas.js';
import { CommentsService } from './comments.service.js';

const uuid = { schema: z.uuid() };

@Can.Anyone()
@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get('tasks/:taskId/comments')
  list(@CurrentUser() user: User, @Param('taskId', uuid) taskId: string) {
    return this.commentsService.list(user, taskId);
  }

  @Post('tasks/:taskId/comments')
  create(@CurrentUser() user: User, @Param('taskId', uuid) taskId: string, @Body({ schema: commentSchema }) dto: CommentDto) {
    return this.commentsService.create(user, taskId, dto);
  }

  @Patch('comments/:id')
  update(@CurrentUser() user: User, @Param('id', uuid) id: string, @Body({ schema: commentSchema }) dto: CommentDto) {
    return this.commentsService.update(user, id, dto);
  }
}

```

`TasksModule` 注册任务、评论、其策略以及后续部分的提醒任务：

```typescript title="src/tasks/tasks.module.ts"
import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { CommentPolicy } from './comment.policy.js';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';
import { RemindersJob } from './reminders.job.js';
import { TaskPolicy } from './task.policy.js';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

@Module({
  imports: [ProjectsModule],
  controllers: [TasksController, CommentsController],
  providers: [TasksService, CommentsService, TaskPolicy, CommentPolicy, RemindersJob],
})
export class TasksModule {}

```

#### 使用服务端推送事件流式传输更改

一个不自动更新的看板只在重新加载时显示更改。[Server-Sent Events](/http/server-sent-events) 通过推送实现：浏览器保持一个 HTTP 响应打开，服务器为每次更改向其写入一个事件。服务已经通过 `EventEmitter2` 为每次更改发出事件；流监听这些事件。

一个事件说明了什么更改了、在哪个项目中，并携带了数据库返回的记录：

```typescript title="src/activity/project-activity.ts"
import type { Comment, Task } from '../database/schema.js';

/** Something that changed in a project, emitted after the change was written. */
export type ProjectActivity =
  | { type: 'task.created' | 'task.updated'; projectId: string; data: Task }
  | { type: 'comment.created' | 'comment.updated'; projectId: string; data: Comment };

```

活动服务监听这些事件，并为每个项目的流只提供其自身的流：

```typescript title="src/activity/activity.service.ts"
import { Injectable, type MessageEvent } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { filter, interval, map, merge, of, Subject, type Observable } from 'rxjs';
import type { ProjectActivity } from './project-activity.js';

@Injectable()
export class ActivityService {
  // One listener for the whole application; each stream filters it.
  private readonly activity$ = new Subject<ProjectActivity>();

  @OnEvent('task.*')
  onTask(activity: ProjectActivity) {
    this.activity$.next(activity);
  }

  @OnEvent('comment.*')
  onComment(activity: ProjectActivity) {
    this.activity$.next(activity);
  }

  /** The project's activity as server-sent events. */
  stream(projectId: string): Observable<MessageEvent> {
    return merge(
      // Tells the client the stream is open: changes from here on reach it.
      of({ comment: 'connected' }),
      this.activity$.pipe(
        filter((activity) => activity.projectId === projectId),
        map(({ type, data }) => ({ type, data })),
      ),
      // Proxies close connections that stay silent; a comment every 20 seconds keeps it open.
      interval(20_000).pipe(map(() => ({ comment: 'keep-alive' }))),
    );
  }
}

```

- **整个应用程序只有一个监听器。** `@OnEvent()` 在启动时只注册 `onTask()` 和 `onComment()`，并将每个事件推送到一个 `Subject`；每个打开的流都订阅它并保留其自己的项目事件。如果为每个连接向发射器添加监听器，将超过默认的 `maxListeners`，在第十一个浏览器标签页时，EventEmitter2 将警告内存泄漏。
- **`type` 成为事件的名称**，因此浏览器使用 `addEventListener('task.updated', ...)` 监听，并以 JSON 形式发送 `data`（参见 [Usage](/http/server-sent-events#用法)）。
- **第一个消息是评论，`: connected`。** 它告知客户端以及末尾的测试，流已订阅：从那时起发生的更改会到达它。评论会被 `EventSource` 忽略。
- **每 20 秒的评论会通过关闭静默响应的代理保持连接打开。** 当客户端离开时，Nest 会从 `Observable` 取消订阅，这会停止间隔和对 `Subject` 的订阅（[Client disconnection](/http/server-sent-events#client-disconnection)）。

该流仅供项目成员使用。显然，检查的位置是在处理程序中，就像其他控制器一样，但一个 `@Sse()` 路由在处理程序被调用时就发送了其头部：当一个异步处理程序抛出 `NotFoundException` 时，客户端会收到 `200` 和一个唯一事件为 `event: error` 且包含 `data: Project not found` 的流。一个守卫在此之前运行，因此其异常是一个真实的 404：

```typescript title="src/activity/project-member.guard.ts"
import { Injectable, NotFoundException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { z } from 'zod';
import { MembershipsService } from '../projects/memberships.service.js';
import type { User } from '../users/user.js';

/**
 * Checks that the user is a member of the route's project before the handler runs.
 * An `@Sse()` route sends its headers before an async handler settles, so a 404
 * thrown there would reach the client as an `error` event on a 200 stream.
 */
@Injectable()
export class ProjectMemberGuard implements CanActivate {
  constructor(private readonly memberships: MembershipsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user, params } = context.switchToHttp().getRequest<{ user: User; params: { projectId: string } }>();
    // Guards run before pipes, so the id isn't validated yet.
    if (!z.uuid().safeParse(params.projectId).success) {
      throw new NotFoundException('Project not found');
    }
    await this.memberships.access(user, params.projectId);
    return true;
  }
}

```

控制器将该守卫放在流的前面：

```typescript title="src/activity/activity.controller.ts"
import { Controller, Param, Sse, UseGuards, type MessageEvent } from '@nestjs/common';
import { Can } from '@nestjs/authorization';
import type { Observable } from 'rxjs';
import { ActivityService } from './activity.service.js';
import { ProjectMemberGuard } from './project-member.guard.js';

@Can.Anyone()
@UseGuards(ProjectMemberGuard)
@Controller('projects/:projectId/events')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  // Only members get here: ProjectMemberGuard checked the project before the stream started.
  @Sse()
  stream(@Param('projectId') projectId: string): Observable<MessageEvent> {
    return this.activityService.stream(projectId);
  }
}

```

活动模块注册了控制器和服务，并导入了项目模块以进行守卫的成员检查：

```typescript title="src/activity/activity.module.ts"
import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { ActivityController } from './activity.controller.js';
import { ActivityService } from './activity.service.js';

@Module({
  imports: [ProjectsModule],
  controllers: [ActivityController],
  providers: [ActivityService],
})
export class ActivityModule {}

```

`ProjectMemberGuard` 在全局守卫之后运行，因此此时用户已登录，它重用了 `MembershipsService.access()`，所以流和其余 API 对非成员也作出相同的响应。处理程序本身只返回 `Observable`。

> info **提示** 浏览器的 `EventSource` 无法发送 `Authorization` 头部，而此 API 从该头部获取其访问令牌。在浏览器中，使用 `fetch()` 读取流，它发送该头部并将主体作为流返回，就像末尾的测试所做的那样，或者使用包装它的库。

#### 在任务到期前提醒被指派人

每分钟，一个任务提醒作业会提醒每个在一天内到期的未完成任务的被指派人。[`@nestjs/schedule`](/techniques/task-scheduling) 运行它，并且在多个 API 实例的情况下，它会在每个实例上运行：[`@OnOneInstance()`](/techniques/task-scheduling#running-on-several-instances) 来自 `@nestjs/locks` 将其限制在一个实例上。这些实例通过它们共享的锁存储就哪个实例达成一致，该包定义了存储的契约，并将存储留给应用程序。取自 [Keep locks in your database](/reliability/locks#keep-locks-in-your-database) 的 `DrizzleLockStore`（Drizzle 版本），并将其保存为 `src/database/drizzle-lock.store.ts`。它在上述模式的 `locks` 表和序列上工作。进行一个更改：该章节的应用程序有自己的 `Database` 类型，来自 `./drizzle.js`，因此在其位置导入 `NodePgDatabase`，并使用它来类型化构造函数的 `db` 参数。

存储的每个方法都是一个条件语句，因此无论有多少实例竞争锁，恰好只有一个会获得它；章节解释了每一种情况。存储从其构造函数中注册自身，而 `AppModule` 将其列为一个提供者。在启动时，锁模块会记录它使用的存储：

```bash
LOG [LocksModule] LocksStorage: DrizzleLockStore

```

该作业：

```typescript title="src/tasks/reminders.job.ts"
import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { OnOneInstance } from '@nestjs/locks';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, isNull, lte, ne, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { tasks, users } from '../database/schema.js';

@Injectable()
export class RemindersJob {
  private readonly logger = new Logger(RemindersJob.name);

  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  /** Reminds assignees of open tasks due within a day, once per task. Returns how many it sent. */
  @Cron(CronExpression.EVERY_MINUTE, { name: 'task-reminders' })
  @OnOneInstance({ key: 'tasks:due-reminders' })
  async sendReminders(): Promise<number> {
    // Claims the tasks in the statement that finds them: of two runs at once, each task goes to one.
    const due = await this.db
      .update(tasks)
      .set({ remindedAt: new Date() })
      .from(users)
      .where(
        and(
          eq(users.id, tasks.assigneeId),
          isNull(tasks.remindedAt),
          ne(tasks.status, 'done'),
          lte(tasks.dueAt, sql`now() + interval '1 day'`),
        ),
      )
      .returning({ id: tasks.id, title: tasks.title, dueAt: tasks.dueAt, email: users.email });
    for (const task of due) {
      // Send the email here, for example with @nestjs/mail.
      this.logger.log(`Reminder to ${task.email}: "${task.title}" is due ${task.dueAt?.toISOString()}`);
    }
    return due.length;
  }
}

```

- **该作业在查找任务的陈述中声明了任务。** `UPDATE ... SET reminded_at = now() WHERE reminded_at IS NULL ... RETURNING` 同时选择到期任务并标记它们，因此在两个重叠的运行中，每个任务只被返回给其中一个。一个 `SELECT` 后面跟着一个 `UPDATE` 会将相同的任务分配给两者，而末尾的测试显示了这一点：该版本的三个重叠运行为单个任务发送了三次提醒。
- **`@OnOneInstance()` 将扫描限制在一个实例上。** 第一个触发作业的调度器的实例获取其租约，而其他实例跳过其滴答。当该实例停止时，另一个实例将在其下一个滴答时接管作业（参见 [Run each job on one instance](/reliability/locks#run-each-job-on-one-instance)）。声明本身就使重复不可能；租约则为其他实例节省了工作，并将作业的运行及其日志保留在一个地方。
- **在发送之前声明提醒。** 如果发送失败，该提醒会丢失而不是发送两次。对于电子邮件，使用 [`@nestjs/mail`](/application/mail) 发送，来自一个会重试的 [queue](/techniques/queues)。
- **错过的滴答会自动追赶。** 该作业获取所有到期的任务，而不是“最后一分钟的”任务，因此未运行的滴答会被下一个滴答覆盖。

[last step of Try it](/tutorials/project-management-api#try-it) 显示了一个提醒正在发出。

#### 试用

启动应用程序：

```bash
$ npm run start:dev

```

像 JWT 教程中那样注册 Ada、Bob 和 Eve，并将它们的访问令牌保存在变量中（此处和下方缩短了令牌和长主体）：

```bash
$ curl localhost:3000/auth/sign-up --json '{"email":"ada@example.com","password":"correct horse battery"}'
{"accessToken":"eyJhbGciOiJIUzI1NiIs...","refreshToken":"...","expiresIn":900}
$ ADA="Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
$ BOB="Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
$ EVE="Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."

```

Ada 创建了一个项目，她是其管理员。Eve 不在该项目中，因此会收到 404 错误。Ada 添加了 Bob，Bob 可以查看成员但不能自己添加任何人：

```bash
$ curl localhost:3000/projects -H "$ADA" --json '{"name":"Website relaunch"}'
{"id":"b1dddeba-0a00-4997-9ed4-eec8e255e2fa","name":"Website relaunch","createdAt":"2026-11-19T22:15:10.624Z","role":"admin"}
$ PROJECT=b1dddeba-0a00-4997-9ed4-eec8e255e2fa
$ curl -i localhost:3000/projects/$PROJECT/tasks -H "$EVE"
HTTP/1.1 404 Not Found
{"message":"Project not found","error":"Not Found","statusCode":404}
$ curl localhost:3000/projects/$PROJECT/members -H "$ADA" --json '{"email":"bob@example.com"}'
{"userId":"c1ffc2db-5cf3-4835-b05a-1e0daf80903b","email":"bob@example.com","role":"member"}
$ curl -i localhost:3000/projects/$PROJECT/members -H "$BOB" --json '{"email":"eve@example.com"}'
HTTP/1.1 403 Forbidden
{"message":"Forbidden","statusCode":403}
$ curl localhost:3000/projects/$PROJECT/members -H "$BOB"
[{"userId":"8290d579-c516-4f78-9688-7bae25ba082c","email":"ada@example.com","role":"admin"},{"userId":"c1ffc2db-5cf3-4835-b05a-1e0daf80903b","email":"bob@example.com","role":"member"}]

```

任务不能分配给非成员 Eve。Ada 改为分配给 Bob，然后 Bob 添加了属于他自己的任务之一：

```bash
$ curl localhost:3000/projects/$PROJECT/tasks -H "$ADA" --json '{"title":"Write the launch post","assigneeId":"8e73d73c-58e6-419a-a717-c77d845a6b9c"}'
{"message":"The assignee is not a member of this project","error":"Bad Request","statusCode":400}
$ curl localhost:3000/projects/$PROJECT/tasks -H "$ADA" --json '{"title":"Write the launch post","assigneeId":"c1ffc2db-5cf3-4835-b05a-1e0daf80903b","dueAt":"2026-12-01T17:00:00+01:00"}'
{"id":"b9690f26-f034-4985-b635-2bd112d5b132","projectId":"b1dddeba-...","title":"Write the launch post","description":"","status":"todo","assigneeId":"c1ffc2db-...","dueAt":"2026-12-01T16:00:00.000Z","remindedAt":null,"createdAt":"2026-11-19T22:15:10.951Z","updatedAt":"2026-11-19T22:15:10.951Z"}
$ curl localhost:3000/projects/$PROJECT/tasks -H "$BOB" --json '{"title":"Fix the footer links"}'
{"id":"a77318f3-3f27-4bb0-bc4b-fe8c0c12057b",...,"title":"Fix the footer links","description":"","status":"todo","assigneeId":null,...}

```

Bob 创建了第二个任务，但没有分配任何人，且 Bob 不是管理员，因此他无法更改它。状态也不是更新的字段：

```bash
$ curl -i -X PATCH localhost:3000/tasks/a77318f3-3f27-4bb0-bc4b-fe8c0c12057b -H "$BOB" --json '{"title":"Fix footer links"}'
HTTP/1.1 403 Forbidden
{"message":"Forbidden","statusCode":403}
$ curl -X PATCH localhost:3000/tasks/b9690f26-f034-4985-b635-2bd112d5b132 -H "$BOB" --json '{"status":"done"}'
{"message":["Unrecognized key: \"status\""],"error":"Bad Request","statusCode":400}

```

Bob 开始执行他的任务。Ada 的看板仍然在 `todo` 中显示该任务，她尝试从那里关闭它，但被告知需要再次查看：

```bash
$ curl -X POST localhost:3000/tasks/b9690f26-f034-4985-b635-2bd112d5b132/status -H "$BOB" --json '{"from":"todo","to":"in_progress"}'
{"id":"b9690f26-f034-4985-b635-2bd112d5b132",...,"status":"in_progress",...,"updatedAt":"2026-11-19T22:15:11.149Z"}
$ curl -X POST localhost:3000/tasks/b9690f26-f034-4985-b635-2bd112d5b132/status -H "$ADA" --json '{"from":"todo","to":"done"}'
{"message":"Task is no longer todo","error":"Conflict","statusCode":409}

```

列表、过滤后，然后按页显示：

```bash
$ curl "localhost:3000/projects/$PROJECT/tasks?status=in_progress&assigneeId=c1ffc2db-5cf3-4835-b05a-1e0daf80903b" -H "$ADA"
{"items":[{"id":"b9690f26-f034-4985-b635-2bd112d5b132",...,"title":"Write the launch post",...,"status":"in_progress",...}],"nextCursor":null}
$ curl "localhost:3000/projects/$PROJECT/tasks?limit=1" -H "$ADA"
{"items":[{"id":"a77318f3-3f27-4bb0-bc4b-fe8c0c12057b",...,"title":"Fix the footer links",...}],"nextCursor":"WyIyMDI2LTExLTE5VDIyOjE1OjExLjAzOVoiLCJhNzczMThmMy0zZjI3LTRiYjAtYmM0Yi1mZThjMGMxMjA1N2IiXQ"}
$ curl "localhost:3000/projects/$PROJECT/tasks?limit=1&after=WyIyMDI2LTExLTE5VDIyOjE1OjExLjAzOVoiLCJhNzczMThmMy0zZjI3LTRiYjAtYmM0Yi1mZThjMGMxMjA1N2IiXQ" -H "$ADA"
{"items":[{"id":"b9690f26-f034-4985-b635-2bd112d5b132",...,"title":"Write the launch post",...}],"nextCursor":null}
$ curl "localhost:3000/projects/$PROJECT/tasks?dueBefore=2026-12-24&after=abc" -H "$ADA"
{"message":["dueBefore: Invalid ISO datetime","after: Invalid cursor"],"error":"Bad Request","statusCode":400}

```

Bob 评论。Ada 是管理员，但仍然无法编辑他的评论：

```bash
$ curl localhost:3000/tasks/b9690f26-f034-4985-b635-2bd112d5b132/comments -H "$BOB" --json '{"body":"First draft is in the doc."}'
{"id":"022d3d18-54e4-41ec-936e-8ab377731af8","taskId":"b9690f26-...","authorId":"c1ffc2db-...","body":"First draft is in the doc.","createdAt":"2026-11-19T22:15:11.352Z","updatedAt":"2026-11-19T22:15:11.352Z"}
$ curl -X PATCH localhost:3000/comments/022d3d18-54e4-41ec-936e-8ab377731af8 -H "$ADA" --json '{"body":"Rewritten"}'
{"message":"Forbidden","statusCode":403}

```

流以纯 404 响应 Eve，在任何流开始之前，无令牌的请求返回 401：Ada 打开它（`-N` 关闭了 curl 的缓冲），在另一个终端中 Bob 关闭了他的任务并对其发表评论：

```bash
$ curl -i localhost:3000/projects/$PROJECT/events -H "$EVE"
HTTP/1.1 404 Not Found
Content-Type: application/json; charset=utf-8
{"message":"Project not found","error":"Not Found","statusCode":404}
$ curl -N localhost:3000/projects/$PROJECT/events -H "$ADA"
: connected

event: task.updated
id: 1
data: {"id":"b9690f26-f034-4985-b635-2bd112d5b132",...,"status":"done",...,"updatedAt":"2026-11-19T22:15:12.507Z"}

event: comment.created
id: 2
data: {"id":"8970ada9-2ce4-4a7f-9144-e12069fbd9a0","taskId":"b9690f26-...","authorId":"c1ffc2db-...","body":"Published.",...}

```

任何成员都会按时间顺序（最旧优先）读取任务评论，Eve 收到 404 错误：

```bash
$ curl localhost:3000/tasks/b9690f26-f034-4985-b635-2bd112d5b132/comments -H "$BOB"
[{"id":"022d3d18-54e4-41ec-936e-8ab377731af8",...,"body":"First draft is in the doc.",...},{"id":"8970ada9-2ce4-4a7f-9144-e12069fbd9a0",...,"body":"Published.",...}]
$ curl -i localhost:3000/tasks/b9690f26-f034-4985-b635-2bd112d5b132/comments -H "$EVE"
HTTP/1.1 404 Not Found
{"message":"Task not found","error":"Not Found","statusCode":404}

```

最后，一个将在一天内到期的任务。启动后的第一个滴答时，实例获取了作业的租约；在任务存在后的第一个滴答时，作业会提醒 Bob 一次：

```bash
$ curl localhost:3000/projects/$PROJECT/tasks -H "$ADA" --json '{"title":"Send the newsletter","assigneeId":"c1ffc2db-5cf3-4835-b05a-1e0daf80903b","dueAt":"2026-11-20T01:00:00Z"}'
{"id":"e0b29e6d-cc14-4251-a64e-61fbe530e072",...,"title":"Send the newsletter",...,"dueAt":"2026-11-20T01:00:00.000Z","remindedAt":null,...}

```

日志显示租约被获取以及提醒信息：

```bash
LOG [Locks] RemindersJob.sendReminders runs on this instance (lease "tasks:due-reminders:owner", fencing token 1)
LOG [RemindersJob] Reminder to bob@example.com: "Send the newsletter" is due 2026-11-20T01:00:00.000Z

```

#### 测试

像电子商务教程中那样，这里重要的保证是关于并发的，而像 PGlite 这样的进程内数据库只有一个连接，请求不会真正竞争。因此，测试是针对真实的 PostgreSQL 服务器通过连接池运行的。流测试读取真实的 HTTP 响应，所以应用程序监听一个空闲端口，而其他测试使用 `app.inject()` 发送请求：

```typescript title="test/projects.e2e-spec.ts"
import { fileURLToPath } from 'node:url';
import { PasswordHasher } from '@nestjs/authentication';
import { getDrizzleToken } from '@nestjs/drizzle';
import { NodeAdapter, type NestNodeApplication } from '@nestjs/platform-node';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { onTestFinished } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { tasks } from '../src/database/schema.js';
import { RemindersJob } from '../src/tasks/reminders.job.js';

// A real PostgreSQL with a pool, so concurrent requests really race.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('Project management API (e2e)', () => {
  const db = drizzle({ client: new Pool({ connectionString: url, max: 20 }) });
  let app: NestNodeApplication;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
    await db.execute(sql`TRUNCATE users, projects, refresh_tokens, locks CASCADE`);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDrizzleToken())
      .useValue(db)
      // scrypt at the default cost takes 128 MiB and a few hundred ms per hash.
      .overrideProvider(PasswordHasher)
      .useValue(new PasswordHasher({ logN: 10 }))
      .compile();
    app = moduleRef.createNestApplication<NestNodeApplication>(new NodeAdapter());
    // The stream test reads a real response, so the application listens.
    await app.listen(0, '127.0.0.1');
    // The test runs the reminder job itself.
    app.get(SchedulerRegistry).getCronJob('task-reminders').stop();
  });

  afterAll(() => app.close()); // closes the pool too

  let clients = 0;

  /** Signs a user up. Each user has an address of their own: requests are rate-limited per IP address. */
  async function signUp(name: string) {
    const remoteAddress = `10.0.0.${++clients}`;
    const payload = { email: `${name}@example.com`, password: 'correct horse battery' };
    const res = await app.inject({ method: 'POST', url: '/auth/sign-up', payload, remoteAddress });
    const headers = { authorization: `Bearer ${res.json<{ accessToken: string }>().accessToken}` };
    const me = await app.inject({ method: 'GET', url: '/me', headers, remoteAddress });
    return { id: me.json<{ id: string }>().id, headers, remoteAddress };
  }
  type Client = Awaited<ReturnType<typeof signUp>>;

  const call = ({ headers, remoteAddress }: Client, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) =>
    app.inject({ method, url, headers, remoteAddress, payload });

  /** A project of `admin`'s, with `members` added. */
  async function createProject(admin: Client, ...members: string[]) {
    const { id } = (await call(admin, 'POST', '/projects', { name: 'Website relaunch' })).json<{ id: string }>();
    for (const name of members) {
      await call(admin, 'POST', `/projects/${id}/members`, { email: `${name}@example.com` });
    }
    return id;
  }

  async function createTask(client: Client, projectId: string, payload: object = {}) {
    const res = await call(client, 'POST', `/projects/${projectId}/tasks`, { title: 'Write the launch post', ...payload });
    return res.json<{ id: string }>().id;
  }

  let ada: Client, bob: Client, carol: Client, eve: Client;
  beforeAll(async () => {
    [ada, bob, carol, eve] = await Promise.all(['ada', 'bob', 'carol', 'eve'].map(signUp));
  });

  it('checks every request against the project, the task or the comment', async () => {
    const projectId = await createProject(ada, 'bob', 'carol');
    const taskId = await createTask(ada, projectId, { assigneeId: bob.id });
    const rename = (client: Client) => call(client, 'PATCH', `/tasks/${taskId}`, { title: 'Write the launch post, v2' });

    expect((await call(eve, 'GET', `/projects/${projectId}/tasks`)).statusCode).toBe(404); // not a member
    expect((await call(bob, 'POST', `/projects/${projectId}/members`, { email: 'eve@example.com' })).statusCode).toBe(403);
    expect((await rename(eve)).statusCode).toBe(404);
    expect((await rename(carol)).statusCode).toBe(403); // a member, but not the assignee
    expect((await rename(bob)).statusCode).toBe(200);
    expect((await rename(ada)).statusCode).toBe(200); // an admin
    expect((await call(ada, 'PATCH', `/tasks/${taskId}`, { assigneeId: eve.id })).statusCode).toBe(400);

    const comment = await call(carol, 'POST', `/tasks/${taskId}/comments`, { body: 'Looks good' });
    const commentUrl = `/comments/${comment.json<{ id: string }>().id}`;
    expect((await call(bob, 'GET', `/tasks/${taskId}/comments`)).json()).toHaveLength(1);
    expect((await call(eve, 'GET', `/tasks/${taskId}/comments`)).statusCode).toBe(404);
    expect((await call(ada, 'PATCH', commentUrl, { body: 'Edited by an admin' })).statusCode).toBe(403);
    expect((await call(carol, 'PATCH', commentUrl, { body: 'Looks great' })).statusCode).toBe(200);
  });

  it('moves a task once when ten moves from the same status race', async () => {
    const projectId = await createProject(ada, 'bob');
    const taskId = await createTask(ada, projectId, { assigneeId: bob.id });

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        call(i % 2 ? ada : bob, 'POST', `/tasks/${taskId}/status`, { from: 'todo', to: i % 2 ? 'in_progress' : 'done' }),
      ),
    );

    expect(results.map((res) => res.statusCode).sort()).toEqual([200, ...Array(9).fill(409)]);
  });

  it('pages through tasks created at the same instant without gaps or repeats', async () => {
    const projectId = await createProject(ada);
    // One statement: all five rows get the same created_at.
    await db.insert(tasks).values(Array.from({ length: 5 }, (_, i) => ({ projectId, title: `Task ${i}`, description: '' })));

    const seen: string[] = [];
    let after = '';
    do {
      const res = await call(ada, 'GET', `/projects/${projectId}/tasks?limit=2${after && `&after=${after}`}`);
      const page = res.json<{ items: { id: string }[]; nextCursor: string | null }>();
      seen.push(...page.items.map((task) => task.id));
      after = page.nextCursor ?? '';
    } while (after);

    expect(new Set(seen).size).toBe(5);
    expect(seen).toHaveLength(5);
  });

  it("streams a project's changes to its members, and nobody else's", async () => {
    const [projectA, projectB] = [await createProject(ada, 'bob'), await createProject(ada)];
    const [taskA, taskB] = [await createTask(ada, projectA), await createTask(ada, projectB)];

    expect((await fetch(`${await app.getUrl()}/projects/${projectA}/events`, { headers: eve.headers })).status).toBe(404);

    const stream = await openStream(bob, projectA);
    await stream.readUntil(': connected');
    // A change in a project Bob isn't in, then one in his.
    await call(ada, 'PATCH', `/tasks/${taskB}`, { title: 'Not for Bob' });
    await call(ada, 'PATCH', `/tasks/${taskA}`, { title: 'For Bob' });

    const received = await stream.readUntil(`"id":"${taskA}"`);
    expect(received).toContain('event: task.updated');
    expect(received).not.toContain(taskB);
  });

  it('reminds each assignee once, however many runs overlap', async () => {
    const job = app.get(RemindersJob);
    await job.sendReminders(); // takes the job's lease: from here on, every call on this instance runs
    const projectId = await createProject(ada, 'bob');
    const dueAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await createTask(ada, projectId, { assigneeId: bob.id, dueAt });
    const doneTask = await createTask(ada, projectId, { assigneeId: bob.id, dueAt });
    await call(bob, 'POST', `/tasks/${doneTask}/status`, { from: 'todo', to: 'done' });

    const sent = await Promise.all([1, 2, 3].map(() => job.sendReminders()));

    expect(sent.reduce((sum, count) => sum + count, 0)).toBe(1);
    expect(await job.sendReminders()).toBe(0);
  });

  /** Opens a project's event stream as `client`. */
  async function openStream(client: Client, projectId: string) {
    const controller = new AbortController();
    // Closed when the test ends, pass or fail: an open response would keep app.close() waiting.
    onTestFinished(() => controller.abort());
    const url = `${await app.getUrl()}/projects/${projectId}/events`;
    const res = await fetch(url, { headers: client.headers, signal: controller.signal });
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let received = '';
    return {
      /** Reads until `text` has arrived, and returns everything received. */
      async readUntil(text: string) {
        while (!received.includes(text)) {
          const { value, done } = await reader.read();
          if (done) {
            throw new Error('The stream ended');
          }
          received += value;
        }
        return received;
      },
    };
  }
});

```

- **每个用户都从自己的地址发送请求**，就像生产环境一样：注册限制为每 IP 地址每小时 10 次，每个路由限制为每分钟 100 次。
- **通过 `SchedulerRegistry` 停止 cron**（参见 [Dynamic cron jobs](/techniques/task-scheduling#dynamic-cron-jobs)），因此测试在选择时调用作业，并且在分钟交界处的滴答不能优先获取测试任务。第一次调用获取了作业的租约；之后，该实例上的每次调用都会运行，因此这三次调用确实是重叠的。
- **当测试结束时关闭流**，无论通过还是失败：打开的响应会使 `app.close()` 等待。

为测试创建一个数据库，因为它们会截断表，并按照 JWT 教程的刷新令牌存储测试，一个接一个地运行：

```bash
$ docker exec projects-db psql -U postgres -c "CREATE DATABASE projects_test"
$ TEST_DATABASE_URL=postgres://postgres:projects@localhost:5432/projects_test npm run test:e2e -- --no-file-parallelism

 Test Files  2 passed (2)
      Tests  10 passed (10)

```

将 `move()` 中的状态条件替换为检查 `load()` 读取的状态，此时“一次移动任务”失败：在尝试的运行中，十次移动中有三次成功。使用 PostgreSQL 的默认精度存储 `created_at`，分页测试看到五个任务中的两个。

#### 生产检查清单

JWT 教程的 [checklist](/tutorials/rest-api-jwt-authentication#production-checklist) 中的所有内容都适用。对于此 API 而言：

- **在实例之间扇出事件。** `EventEmitter2` 是进程内的：有两个实例时，在一个实例上保存的变更仅到达在该实例上打开的流。在服务和流之间放置一个共享通道，例如 PostgreSQL 的 `LISTEN`/`NOTIFY` 或 Redis pub/sub，并保持每个实例的 `Subject`。
- **让客户端在重新连接后重新加载。** 事件只发送一次，发送到当时打开的流，并且不存储，因此断开连接一分钟的客户端会错过那分钟的事件。`EventSource` 会自动重新连接；在重新连接时，客户端会再次获取任务列表。
- **检查流前的代理。** Nest 发送 `X-Accel-Buffering: no`，并且每 20 秒的保持活动注释会保持空闲连接打开，但具有更短空闲超时或缓冲响应的负载均衡器仍会切断或延迟流。每个打开的流也是一个打开的连接：根据每个打开的浏览器标签页设置代理和服务器的连接限制。
- **将 `NODE_ENV` 设置为 `production`**，如 JWT 教程的检查清单所述。然后 `LocksModule` 会拒绝启动，因为它没有注册的锁存储，这与认证模块没有刷新令牌存储不同，而不是在每个实例上运行每个作业。
- **在 CI 中运行锁存储的契约套件。** `lockStoreContract()` 从 `@nestjs/locks/testing` 检查 [the store contract](/reliability/locks#the-store-contract) 的每条规则，包括与 `concurrent: true` 的竞争情况，针对您运行的 PostgreSQL 版本。
- **小心移除成员。** 指派人外键拒绝删除成员资格，前提是该成员有分配的任务。在与移除相同的事务中取消分配他们，并关闭该成员打开的流，因为他们在打开时检查了成员资格。
- **为生产环境提供自己的 Observe 密钥对**，来自项目的 **API 密钥** 页面，如平台环境中的 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET`：`start:prod` 不加载 `.env`。然后 [NestJS Observe](/observability/overview) 报告每个路由的延迟、平均值和 p95，因此错过索引的过滤器组合会显示为一个慢速 `GET /projects/:projectId/tasks`。它将 cron 运行报告为作业，包括其持续时间和结果，当提醒作业停止报告时会触发作业静默警报，而崩溃的调度器本身不会告知您这一点（参见 [Knowing a cron job actually ran](/techniques/task-scheduling#knowing-a-cron-job-actually-ran)）。

#### 下一步

- 通过电子邮件邀请尚未拥有账户的人员：[Mail](/application/mail)，使用一次性令牌。
- 通过电子邮件发送带重试的提醒：[Mail](/application/mail) 和 [Queues](/techniques/queues)。
- 允许用户在列内重新排序任务，或在项目间移动任务；两者都是像 `move()` 这样的条件更新。
- 按请求查看生产环境中哪些路由和任务运行缓慢：[Observability](/observability/overview)。
- 在相同的基础之上构建电子商务后端：[Build an e-commerce backend](/tutorials/ecommerce-backend)。