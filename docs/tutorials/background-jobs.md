<!-- 此文件从 content/tutorials/background-jobs.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:58:28.876Z -->
<!-- 源文件: content/tutorials/background-jobs.md -->
<!-- 源哈希: ba4b21a6a4ad5a05171fae0651bb66a9 -->

### 在 Node.js 中发送邮件和运行后台任务

使用 NestJS 和 BullMQ 在 Node.js 中发送邮件和运行后台任务：重试、不会重复发送的邮件、定时任务和干净关闭。

它将邮件添加到 JWT 教程的笔记 API 中：注册后的欢迎邮件，以及用户当天修改的笔记的晚间摘要，这些邮件从 BullMQ 队列发送，因此没有请求会等待邮件服务器。发送邮件是一个调用。可靠地从后台发送它才是关键：任务在数据库和队列之间不能丢失，运行两次的任务不能重复发送，定时任务无论 API 有多少实例都只运行一次，部署也不能中断发送过程。

到最后，API 将实现：

- 使用 [`@nestjs/mail`](/application/mail) 发送邮件：渲染了转义 HTML 的邮件类，在开发环境中写入控制台，在生产环境中通过 SMTP 发送。
- 从 [BullMQ](/techniques/queues) 队列发送每封邮件，带有重试和指数退避，并在您设置的计划上移除已完成的任务。
- 将注册事务中的欢迎邮件交给 [transactional outbox](/reliability/outbox)，这样即使崩溃或 Redis 宕机也不会丢失，并且在 Redis 宕机时注册也不会失败。
- 确保每封邮件只发送一次，即使其任务在同一时刻运行了两次。
- 使用 [`@nestjs/schedule`](/techniques/task-scheduling) 将晚间摘要放入队列，在应用程序的一个实例上，使用 [`@nestjs/locks`](/reliability/locks)。
- 当部署停止进程时，完成正在进行的邮件，并在需要时以独立进程运行工作进程。
- 使用针对 PostgreSQL 和 Redis 的测试证明所有这些功能。

它从 [Build a REST API with JWT authentication](/tutorials/rest-api-jwt-authentication) 的 API 开始，该 API 通过 Drizzle 在 PostgreSQL 中签入用户并保存他们的笔记。本教程不再次解释这些部分。它不添加任何端点；这些是邮件，以及添加每封邮件的部分：

| 邮件 | 发送时机 | 部分 |
| --- | --- | --- |
| 欢迎邮件 | `POST /auth/sign-up` 提交时 | [Hand the welcome email to the queue](/tutorials/background-jobs#hand-the-welcome-email-to-the-queue) |
| 摘要 | 每天 UTC 18:00 发送给当天修改过笔记的每位用户 | [Send the digest from one instance](/tutorials/background-jobs#send-the-digest-from-one-instance) |

> info **提示** 完成的应用在 GitHub 上是 [nestjs/example-background-jobs](https://github.com/nestjs/example-background-jobs)，包含其测试和 CI 工作流。

#### 从 JWT API 开始

创建项目，并安装 JWT 教程的包，再加上本教程添加的五个包：邮件发送器、带有 Nest 模块和 Redis 客户端的 BullMQ、出库（outbox）、调度器和锁：

```bash
$ npm i -g @nestjs/cli
$ nest new notes-api --minimal
$ cd notes-api
$ npm uninstall @nestjs/platform-express @types/express
$ npm i --save @nestjs/platform-node zod @nestjs/config @nestjs/drizzle drizzle-orm@rc pg @nestjs/authentication @nestjs/throttler @nestjs/swagger @nestjs/terminus
$ npm i --save @nestjs/mail @nestjs/bullmq bullmq ioredis @nestjs/outbox @nestjs/schedule @nestjs/locks
$ npm i --save-dev drizzle-kit@rc @types/pg @nestjs/testing vitest vite

```

然后从 [finished JWT tutorial](/tutorials/rest-api-jwt-authentication#test-it) 复制这些文件，保持原样：

- `src/main.ts` 和 `drizzle.config.ts`
- `src/auth/`、`src/users/`、`src/notes/` 和 `src/health/` 下的所有内容，以及 `src/database/schema.ts`
- `test/refresh-token.store.e2e-spec.ts`

忽略 JWT 教程的 `drizzle/` 文件夹，因为接下来的步骤会更改模式并为所有内容生成一个迁移，同时忽略运行应用程序在 PGlite 上的 `test/notes.e2e-spec.ts`：从现在起，应用程序还需要 Redis，并且本教程末尾的测试会针对这两个服务器运行。将测试脚本添加到 `package.json`：

```json
"test:e2e": "vitest run --config ./vitest.config.e2e.ts"

```

BullMQ 将其任务保存在 [Redis](https://redis.io)。在一个与 JWT 教程的 PostgreSQL 容器相邻的容器中运行它：

```bash
$ docker run -d --name notes-redis -p 6379:6379 redis:7

```

将其 URL 添加到 `.env`，紧邻 `DATABASE_URL` 和 `JWT_SECRET`：

```bash
REDIS_URL=redis://localhost:6379

```

配置模式获得了 Redis URL 和邮件设置。缺少 `SMTP_URL` 会在启动时停止应用程序（当需要时），而不是在第一封邮件发送时失败：

```typescript title="src/config.ts"
import { z } from 'zod';

export const envSchema = z
  .object({
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
    // The queue's jobs and the locks. A database number in the path: redis://host:6379/1
    REDIS_URL: z.url(),
    // `log` writes each mail to the console instead of sending it.
    MAIL_TRANSPORT: z.enum(['log', 'smtp']).default('log'),
    SMTP_URL: z.url().optional(),
    MAIL_FROM: z.string().default('Notes <notes@example.com>'),
  })
  .refine((env) => env.MAIL_TRANSPORT !== 'smtp' || env.SMTP_URL, {
    message: 'SMTP_URL is required when MAIL_TRANSPORT is "smtp"',
    path: ['SMTP_URL'],
  });

export type Env = z.infer<typeof envSchema>;

```

一个表连接到模式，在 `notes` 之后。每一行是工作进程发送的邮件，由使其唯一的键标识，接下来的部分解释了其列：

```typescript title="src/database/schema.ts"
// ...

// One row per email the workers send, keyed by what makes it unique:
// `welcome-<user id>`, or `digest-<user id>-<day>`.
export const sentEmails = pgTable('sent_emails', {
  key: text('key').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // When a worker took the email on; another one may take it over 5 minutes later.
  claimedAt: at('claimed_at').notNull().defaultNow(),
  // Null until the mail server accepted it.
  sentAt: at('sent_at'),
});

```

像 JWT 教程中一样生成并应用迁移：

```bash
$ npx drizzle-kit generate --name=notes
$ npx drizzle-kit migrate

```

根模块注册了本教程添加的所有内容。每个部分都在使用它的部分中进行解释：

```typescript title="src/app.module.ts"
import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthenticationModule } from '@nestjs/authentication';
import { BullModule } from '@nestjs/bullmq';
import { DrizzleModule, getDrizzleToken } from '@nestjs/drizzle';
import { LocksModule } from '@nestjs/locks';
import { MailModule } from '@nestjs/mail';
import { createObserveModule } from '@nestjs/observe';
import { OutboxModule, OutboxStorage } from '@nestjs/outbox';
import { fromDrizzle, PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule, minutes, normalizeIp } from '@nestjs/throttler';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { accountEmail } from './auth/account-email.js';
import { AuthModule } from './auth/auth.module.js';
import { envSchema, type Env } from './config.js';
import { EmailsModule } from './emails/emails.module.js';
import { mailTransport } from './emails/mail-transport.js';
import { HealthModule } from './health/health.module.js';
import { NotesModule } from './notes/notes.module.js';
import { RedisLockStore } from './redis/redis-lock.store.js';
import { RedisModule } from './redis/redis.module.js';
import { UsersModule } from './users/users.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // First, so it shuts down last and still sends what the other modules did.
    ObserveModule.forRoot({
      // Empty until `npx @nestjs/observe link` writes the key pair into .env: the SDK then sends nothing.
      appKey: process.env.OBSERVE_APP_KEY ?? '',
      appSecret: process.env.OBSERVE_APP_SECRET ?? '',
      serviceId: 'notes-api',
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
          issuer: 'notes-api',
          audience: 'notes-api',
          ttl: '15m',
        },
        refreshToken: { ttl: '30d', absoluteTtl: '90d' },
      }),
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
    MailModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        transport: mailTransport(config.get('MAIL_TRANSPORT', { infer: true }), config.get('SMTP_URL', { infer: true })),
        from: config.get('MAIL_FROM', { infer: true }),
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: { url: config.get('REDIS_URL', { infer: true }) },
      }),
    }),
    OutboxModule.forRoot(),
    ScheduleModule.forRoot(),
    LocksModule.forRoot(),
    RedisModule,
    UsersModule,
    AuthModule,
    NotesModule,
    EmailsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: StandardSchemaValidationPipe },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    {
      // The outbox's messages, in the application's database, in a schema of their own (nest_outbox).
      provide: PostgresOutboxStore,
      inject: [getDrizzleToken(), OutboxStorage],
      useFactory: (db: NodePgDatabase, outboxStorage: OutboxStorage) =>
        new PostgresOutboxStore({ executor: fromDrizzle(db) }, outboxStorage),
    },
    // The locks of @OnOneInstance(), in Redis.
    RedisLockStore,
  ],
})
export class AppModule {}

```

- `MailModule` 发送邮件（[Write the emails](/tutorials/background-jobs#write-the-emails)）。
- `BullModule.forRootAsync()` 将 BullMQ 连接到 Redis，来自 `REDIS_URL`。URL 路径中的数据库编号，例如 `redis://localhost:6379/1`，将任务与其他服务器上的任何内容隔离开来。
- `OutboxModule` 和 `PostgresOutboxStore` 将欢迎邮件从注册事务交给队列（[Hand the welcome email to the queue](/tutorials/background-jobs#hand-the-welcome-email-to-the-queue)）。
- `ScheduleModule`、`LocksModule`、`RedisModule` 和 `RedisLockStore` 在一个实例上运行摘要（[Send the digest from one instance](/tutorials/background-jobs#send-the-digest-from-one-instance)）。

#### 编写邮件

`MailModule` 接收一个**传输器**，这是邮件离开应用程序的方式，以及一个默认发件人。从环境变量中选择传输器，这样相同的构建可以在任何地方运行：

```typescript title="src/emails/mail-transport.ts"
import { LogMailTransport, SmtpTransport, type MailTransport } from '@nestjs/mail';

/** `log` in development: every mail goes to the console. `smtp` in production. */
export function mailTransport(kind: 'log' | 'smtp', smtpUrl?: string): MailTransport {
  return kind === 'smtp'
    ? new SmtpTransport({ url: smtpUrl!, pool: true }) // smtp://user:password@smtp.example.com:587
    : new LogMailTransport();
}

```

`LogMailTransport` 将每封邮件写入控制台，收件人和主题在 `log` 级别，正文在 `debug` 级别，不发送任何内容，这正是您在开发时想要的。`SmtpTransport` 本身支持 SMTP，要求在 587 端口上使用 STARTTLS，并且使用 `pool: true` 重用连接。[Send in production](/application/mail#send-in-production) 涵盖了其选项以及 HTTP 提供者的传输器（Resend、Postmark、SendGrid、SES），其中任何一个都可以替代它。

一封邮件是一个**邮件类**：一个提供者，其 `render()` 将类型化数据转换为主题和正文。欢迎邮件获取用户：

```typescript title="src/emails/welcome.mail.ts"
import { Injectable } from '@nestjs/common';
import { html, type Mailable } from '@nestjs/mail';
import type { User } from '../users/user.js';

@Injectable()
export class WelcomeMail implements Mailable<User> {
  render(user: User) {
    return {
      subject: 'Welcome to Notes',
      // `html` escapes every value it inserts.
      html: html`
        <p>Hi ${user.email},</p>
        <p>your account is ready. On the days you change notes, we'll send you a digest of them in the evening.</p>
      `,
    };
  }
}

```

摘要获取当天和当天修改的笔记的标题：

```typescript title="src/emails/digest.mail.ts"
import { Injectable } from '@nestjs/common';
import { html, type Mailable } from '@nestjs/mail';

export interface Digest {
  /** The UTC day, as YYYY-MM-DD. */
  day: string;
  titles: string[];
}

@Injectable()
export class DigestMail implements Mailable<Digest> {
  render({ day, titles }: Digest) {
    return {
      subject: `Your notes on ${day}`,
      // Titles are user input: `html` escapes them, so a title can't inject markup.
      html: html`
        <p>You changed ${titles.length} ${titles.length === 1 ? 'note' : 'notes'} today:</p>
        <ul>
          ${titles.map((title) => html`<li>${title}</li>`)}
        </ul>
      `,
    };
  }
}

```

`html` 标记的模板会转义它插入的每个值，因此标题为 `<script>` 的笔记会作为 `&lt;script&gt;` 发送到邮件中，而嵌套的 `html` 模板数组，如列表项，则按原样插入。邮件发送器从 HTML 派生纯文本部分。更长的邮件可以存在于模板文件中，由 `FileTemplateEngine` 在每封邮件共享的布局中渲染：参见 [Write the order confirmation mail](/application/mail#write-the-order-confirmation-mail)。

#### 队列邮件

邮件服务器接受消息需要几百毫秒，有时需要几秒，有时甚至不可用。这些都不应该发生在请求中。API 而是将一个 **任务** 添加到队列中，然后一个 **工作者** 在后台发送邮件，并在服务器失败时重试。

生产者是一个小的提供者。每个任务携带的是 id，而不是电子邮件地址，因此工作者在运行时读取用户，并始终发送到当前地址：

```typescript title="src/emails/email.jobs.ts"
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { JobsOptions, Queue } from 'bullmq';

export const EMAILS_QUEUE = 'emails';

// What each kind of job carries: ids, not the user's email address, which may change before the job runs.
export interface WelcomeJob {
  userId: string;
}
export interface DigestJob {
  userId: string;
  /** The UTC day, as YYYY-MM-DD. */
  day: string;
}

/** What makes an email unique: its job id, its row in `sent_emails`, and its idempotency key. */
export const welcomeKey = (userId: string) => `welcome-${userId}`;
export const digestKey = (userId: string, day: string) => `digest-${userId}-${day}`;

const jobOptions = {
  // 10 attempts, 2 s apart and doubling: the last one runs about 17 minutes after the first.
  attempts: 10,
  backoff: { type: 'exponential', delay: 2_000 },
  // Finished jobs stay for inspection, for a day if they completed and a week if they failed.
  // Without these, Redis keeps every job forever.
  removeOnComplete: { age: 24 * 3600, count: 10_000 },
  removeOnFail: { age: 7 * 24 * 3600 },
} satisfies JobsOptions;

@Injectable()
export class EmailJobs {
  constructor(@InjectQueue(EMAILS_QUEUE) private readonly queue: Queue) {}

  async welcome(userId: string): Promise<void> {
    const data: WelcomeJob = { userId };
    // A job whose id exists already isn't added again.
    await this.queue.add('welcome', data, { ...jobOptions, jobId: welcomeKey(userId) });
  }

  async digests(day: string, userIds: string[]): Promise<void> {
    await this.queue.addBulk(
      userIds.map((userId) => ({
        name: 'digest',
        data: { userId, day } satisfies DigestJob,
        opts: { ...jobOptions, jobId: digestKey(userId, day) },
      })),
    );
  }
}

```

- **`attempts` 和 `backoff`。** 当工作者抛出异常时，任务失败，BullMQ 会在退避时间后再次运行它：2 秒，然后是 4、8 等，总共十次尝试，耗时约 17 分钟。根据邮件提供商的预期中断情况来设置大小。在最后一次尝试后，任务会移动到失败集合。
- **`removeOnComplete` 和 `removeOnFail`。** 默认情况下，BullMQ 将每个已完成的任务永久保存在 Redis 中。在这里，已完成的任务在一天后（或超过最近的 10,000 个）被移除，失败的任务在一周后被移除，足够查看。时间单位是秒。
- **`jobId`。** 每封邮件都有一个键，例如 `welcome-<user id>`。它用作任务的 id，在第一个任务仍在 Redis 中时，防止重复添加同一封邮件的操作无效。一旦 `removeOnComplete` 移除它，就可以再次添加相同的 id，因此仅靠任务 id 不能保证邮件的唯一性：`sent_emails` 表在 [Send each email once](/tutorials/background-jobs#send-each-email-once) 中保证了这一点。BullMQ 不接受整数 id，大多数包含 `:` 的 id 也不被接受，因此使用连字符。

选项是在每次 `add()` 时传递的，而不是作为队列的默认值，因此它们与适用的任务相邻。[Job options](/techniques/queues#job-options) 列出了其他选项，例如 `delay` 和 `priority`。

功能 **模块** 注册队列，以及以下部分的 **提供者**：

```typescript title="src/emails/emails.module.ts"
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { UsersModule } from '../users/users.module.js';
import { DigestMail } from './digest.mail.js';
import { DigestRepository } from './digest.repository.js';
import { DigestScheduler } from './digest.scheduler.js';
import { EMAILS_QUEUE, EmailJobs } from './email.jobs.js';
import { EmailProcessor } from './email.processor.js';
import { SentEmailsRepository } from './sent-emails.repository.js';
import { WelcomeMail } from './welcome.mail.js';
import { WelcomeMailHandler } from './welcome-mail.handler.js';

@Module({
  imports: [BullModule.registerQueue({ name: EMAILS_QUEUE }), UsersModule],
  providers: [
    EmailJobs,
    // With MAIL_WORKER=off, this process adds jobs and leaves running them to others.
    ...(process.env.MAIL_WORKER === 'off' ? [] : [EmailProcessor]),
    WelcomeMail,
    DigestMail,
    DigestRepository,
    SentEmailsRepository,
    DigestScheduler,
    WelcomeMailHandler,
  ],
  exports: [EmailJobs],
})
export class EmailsModule {}

```

#### 将欢迎邮件交给队列

注册时插入用户。应该在哪里添加欢迎任务？

- **在数据库事务内，提交前：** Redis 不属于事务的一部分。工作者可能在提交前拾取任务，发现没有用户。或者，在任务被添加后事务回滚，导致一个不存在的账户收到了欢迎邮件。
- **提交后：** 任务总是能找到用户。但两次写入仍然是发送到两个系统，两者之间没有关联。在提交和 `queue.add()` 之间发生崩溃或部署会导致邮件丢失；当 Redis 宕机时，注册会以 500 错误失败，尽管账户已创建，用户可能会重试。

对于欢迎邮件，捕获并记录错误的第二种选项可能就足够了。当任务不能丢失时，请使用 [transactional outbox](/reliability/outbox)。`outbox.add()` 将消息写入同一数据库的表中，**在与用户相同的事务中**，因此两者要么都提交，要么都不提交。然后一个中继将已提交的消息交给一个处理程序，并使用退避时间重试，直到成功：

```typescript title="src/auth/credentials.service.ts"
import { ConflictException, Injectable } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import { InjectDrizzle } from '@nestjs/drizzle';
import { Outbox } from '@nestjs/outbox';
import type { NodePgDatabase, NodePgTransaction } from 'drizzle-orm/node-postgres';
import type { UserSignedUp } from '../emails/welcome-mail.handler.js';
import type { User } from '../users/user.js';
import { UsersRepository } from '../users/users.repository.js';

@Injectable()
export class CredentialsService {
  constructor(
    @InjectDrizzle() private readonly db: NodePgDatabase,
    private readonly usersRepository: UsersRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly outbox: Outbox<NodePgTransaction<{}>>,
  ) {}

  async register(email: string, password: string): Promise<User> {
    const passwordHash = await this.passwordHasher.hash(password);
    const user = await this.db.transaction(async (tx) => {
      const user = await this.usersRepository.create(email, passwordHash, tx);
      if (!user) {
        throw new ConflictException('Email already registered');
      }
      // Same transaction: the message commits with the user, or neither does.
      await this.outbox.add<UserSignedUp>(tx, { topic: 'user.signed-up', payload: { userId: user.id } });
      return user;
    });
    this.outbox.notify(); // hand it to the queue now, not at the next poll
    return user;
  }

  /** The user, or `null` when the email or the password is wrong. */
  async verify(email: string, password: string): Promise<User | null> {
    const found = await this.usersRepository.findCredentials(email);
    // With no account, verify() checks a dummy hash, so the response
    // time doesn't reveal which emails are registered.
    const valid = await this.passwordHasher.verify(password, found?.passwordHash);
    if (!valid || !found) {
      return null;
    }
    if (this.passwordHasher.needsRehash(found.passwordHash)) {
      await this.usersRepository.updatePasswordHash(found.user.id, await this.passwordHasher.hash(password));
    }
    return found.user;
  }
}

```

`UsersRepository.create()` 捕获事务，因此插入在其中运行：

```typescript title="src/users/users.repository.ts"
// ...
  /** The new user, or `null` when the email is taken. Pass a transaction as `db` to insert in it. */
  async create(email: string, passwordHash: string, db: Pick<NodePgDatabase, 'insert'> = this.db): Promise<User | null> {
    // One statement: two sign-ups with the same email can't both succeed.
    const [user] = await db
      .insert(users)
      .values({ email: normalize(email), passwordHash })
      .onConflictDoNothing({ target: users.email })
      .returning(columns);
    return user ?? null;
  }

```

处理程序在提交后运行，并添加任务：

```typescript title="src/emails/welcome-mail.handler.ts"
import { Injectable } from '@nestjs/common';
import { OnOutboxMessage } from '@nestjs/outbox';
import { EmailJobs } from './email.jobs.js';

export interface UserSignedUp {
  userId: string;
}

@Injectable()
export class WelcomeMailHandler {
  constructor(private readonly emailJobs: EmailJobs) {}

  // Runs once the sign-up committed. If Redis is down, the outbox retries with backoff.
  @OnOutboxMessage('user.signed-up', { consumer: 'welcome-mail' })
  async queueWelcome({ userId }: UserSignedUp) {
    await this.emailJobs.welcome(userId);
  }
}

```

- **无需创建。** `PostgresOutboxStore` 在根 **模块** 中注册，将消息保留在其自己的 **模式** `nest_outbox` 中，该 **模式** 在生产环境之外启动时创建和 **迁移**。在生产环境中，将其 **迁移** 作为发布步骤应用，与 `npx @nestjs/outbox migrate` 并列（参见 [Keep messages in your database](/reliability/outbox#keep-messages-in-your-database)）。
- **传递事务，绝不传递数据库。** `outbox.add()` 拒绝整个数据库，因为数据库本身的写入会自行提交。
- **`notify()`** 在提交后立即唤醒中继。如果没有它，消息将在下一次轮询时发出，延迟一秒。
- **Redis 宕机是延迟，不是错误。** 当 `queue.add()` 失败或挂起时，中继将每次尝试都计为失败，并使用退避时间重试，默认情况下在 30 到 60 分钟内尝试 20 次。注册操作已经返回了 201。一个永远不成功的消息会移动到出库的死信队列（参见 [Retries and the dead-letter queue](/reliability/outbox#retries-and-the-dead-letter-queue)）。
- **重复无害。** 中继至少交付一次，而处理程序的收件箱（`consumer`）会跳过大多数重复项。如果漏过一个，它会添加一个 id 已存在的任务，而 BullMQ 会忽略它。

#### 确保每封邮件只发送一次

一个任务可以运行多次。BullMQ 会重试失败的任务，即使其邮件在失败前已经发送出去了；当工作者停止续订锁后（例如在崩溃或长时间事件循环停滞后），也会再次运行任务。生产者也可以重复添加同一封邮件：出库至少交付一次，并且摘要可以在其任务被移除后再次入队。所有这些情况都不能以第二封邮件的形式到达用户。

`sent_emails` 表通过其键记录每封邮件。在工作者发送之前，它使用一个条件语句**声明**该邮件，并在邮件服务器接受后将其记录为已发送：

```typescript title="src/emails/sent-emails.repository.ts"
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sentEmails } from '../database/schema.js';

export class EmailInProgressError extends Error {}

@Injectable()
export class SentEmailsRepository {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  /**
   * Runs `send` unless the email with this key was sent already. Of two workers that run the
   * same email at once, one sends it; the other throws EmailInProgressError, and its retry
   * finds it sent.
   */
  async sendOnce(key: string, userId: string, send: () => Promise<unknown>): Promise<'sent' | 'already sent'> {
    if (!(await this.claim(key, userId))) {
      const [row] = await this.db.select({ sentAt: sentEmails.sentAt }).from(sentEmails).where(eq(sentEmails.key, key));
      if (row?.sentAt) {
        return 'already sent';
      }
      throw new EmailInProgressError(`Email ${key} is being sent by another worker`);
    }
    try {
      await send();
    } catch (error) {
      // Give the claim back, so the job's retry can take it again.
      await this.db.delete(sentEmails).where(and(eq(sentEmails.key, key), isNull(sentEmails.sentAt)));
      throw error;
    }
    await this.db.update(sentEmails).set({ sentAt: sql`now()` }).where(eq(sentEmails.key, key));
    return 'sent';
  }

  /** One statement: inserts the claim, or takes over one that a crashed worker left behind. */
  private async claim(key: string, userId: string): Promise<boolean> {
    const claimed = await this.db
      .insert(sentEmails)
      .values({ key, userId })
      .onConflictDoUpdate({
        target: sentEmails.key,
        set: { claimedAt: sql`now()` },
        setWhere: sql`${sentEmails.sentAt} is null and ${sentEmails.claimedAt} < now() - interval '5 minutes'`,
      })
      .returning({ key: sentEmails.key });
    return claimed.length === 1;
  }
}

```

- **声明是一个语句。** `INSERT ... ON CONFLICT DO UPDATE ... WHERE` 插入行，或者接管一个在 5 分钟内无人完成的声明。在两个竞争同一封邮件的工作者中，PostgreSQL 允许其中一个插入行；另一个语句等待该插入提交后，不改变任何内容。使用 `SELECT` 检查行后跟 `INSERT` 会让两者都通过：本教程末尾的测试表明了这一点。
- **失败者不发送。** 如果邮件被标记为已发送，其任务将以 `already sent` 完成。如果仍在发送中，任务会抛出异常，BullMQ 在几秒后重试时会发现其已发送。
- **失败的发送会释放声明。** 任务的下一次尝试会再次声明它。如果没有这个步骤，拒绝了第一次尝试的邮件服务器会留下一个声明，阻止接下来的 5 分钟内所有重试。
- **发送期间不持有事务。** 声明会自行提交，因此发送不会持有数据库连接或行锁，不受邮件服务器所需时间的影响。
- **仍存在一个窗口期。** 一个在邮件服务器接受邮件后、但在 `UPDATE` 之前崩溃的工作者，会留下一个没有 `sent_at` 的声明。五分钟后，重试会再次发送它，使用相同的 `idempotencyKey`（如下所示），因此重复项携带相同的 `Message-ID`，Gmail 和其他接收方使用此键来丢弃它。在使用 Resend 时，该键是提供者强制执行的幂等性键。这已是邮件能达到的最接近一次的保证。

工作者是一个**处理器**：一个扩展了 `WorkerHost` 的 **提供者**，BullMQ 对每个任务调用其 `process()`（参见 [Consumers](/techniques/queues#消费者)）：

```typescript title="src/emails/email.processor.ts"
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { MailError, Mailer } from '@nestjs/mail';
import { UnrecoverableError, type Job } from 'bullmq';
import { UsersRepository } from '../users/users.repository.js';
import { DigestMail } from './digest.mail.js';
import { DigestRepository } from './digest.repository.js';
import { digestKey, EMAILS_QUEUE, welcomeKey, type DigestJob, type WelcomeJob } from './email.jobs.js';
import { SentEmailsRepository } from './sent-emails.repository.js';
import { WelcomeMail } from './welcome.mail.js';

const sendOptions = (key: string) => ({
  // BullMQ retries the job: one attempt per run.
  retry: false as const,
  // A resend of the same email keeps its Message-ID.
  idempotencyKey: key,
  // Well under the 5-minute claim, so no send outlives it.
  signal: AbortSignal.timeout(60_000),
});

// Up to 5 jobs at once, in each process that runs the worker.
@Processor(EMAILS_QUEUE, { concurrency: 5 })
export class EmailProcessor extends WorkerHost {
  constructor(
    private readonly mailer: Mailer,
    private readonly usersRepository: UsersRepository,
    private readonly digestRepository: DigestRepository,
    private readonly sentEmails: SentEmailsRepository,
  ) {
    super();
  }

  async process(job: Job): Promise<string> {
    try {
      switch (job.name) {
        case 'welcome':
          return await this.welcome(job.data);
        case 'digest':
          return await this.digest(job.data);
        default:
          throw new UnrecoverableError(`Unknown job ${job.name}`);
      }
    } catch (error) {
      // A refused address won't be accepted on the next attempt: fail the job now.
      if (error instanceof MailError && error.permanent) {
        throw new UnrecoverableError(error.message);
      }
      throw error;
    }
  }

  private async welcome({ userId }: WelcomeJob) {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      return 'user deleted';
    }
    const key = welcomeKey(userId);
    return this.sentEmails.sendOnce(key, userId, () =>
      this.mailer.send(WelcomeMail, { to: user.email, data: user, ...sendOptions(key) }),
    );
  }

  private async digest({ userId, day }: DigestJob) {
    const user = await this.usersRepository.findById(userId);
    const titles = await this.digestRepository.titlesOn(userId, day);
    if (!user || titles.length === 0) {
      return 'nothing to send';
    }
    const key = digestKey(userId, day);
    return this.sentEmails.sendOnce(key, userId, () =>
      this.mailer.send(DigestMail, { to: user.email, data: { day, titles }, ...sendOptions(key) }),
    );
  }
}

```

- **`retry: false`。** 邮件发送器默认会重试瞬态失败三次。BullMQ 已经按分钟而不是秒重试任务；两个层级的重试会使次数成倍增加。
- **`idempotencyKey`** 是邮件的键。邮件发送器从中派生出 `Message-ID` 头部，因此重新发送同一封邮件会携带相同的头部。
- **`signal`** 在一分钟后中止发送，任务的重试会再次尝试。声明持续 5 分钟，因此必须超过最长的发送时间：否则 SMTP 交换仅消息数据可能需要长达 5 分钟，而第二个工作者会在第一个仍在发送时接管声明。
- **`UnrecoverableError`** 是 BullMQ 的：如果一个任务抛出异常，它会立即失败，不会进行剩余的尝试。如果邮件错误设置了 `permanent` 标志，例如 5xx SMTP 响应（`550 User unknown`），则下一次尝试也不会成功。其他所有错误，如 4xx 响应、超时或连接丢失，都会使用退避时间重试。
- **`concurrency: 5`** 允许一个进程同时发送五封邮件。运行工作者的每个进程都会增加五封。
- **用户在任务运行时被读取。** 期间被删除的用户将收不到邮件，而更改了地址的用户将在新地址收到邮件。

#### 从一个实例发送摘要

每天 UTC 时间 18:00，当天修改过笔记的每个用户都会收到一份摘要。需要两个查询：一个用于确定谁会收到摘要，另一个用于获取摘要内容：

```typescript title="src/emails/digest.repository.ts"
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { notes } from '../database/schema.js';

/** The UTC day of `date`, as YYYY-MM-DD. */
export const utcDay = (date: Date) => date.toISOString().slice(0, 10);

@Injectable()
export class DigestRepository {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  /** The users who changed a note on `day`. */
  async authorsOn(day: string): Promise<string[]> {
    const rows = await this.db.selectDistinct({ ownerId: notes.ownerId }).from(notes).where(changedOn(day));
    return rows.map((row) => row.ownerId);
  }

  /** The titles of the notes a user changed on `day`, oldest first. */
  async titlesOn(userId: string, day: string): Promise<string[]> {
    const rows = await this.db
      .select({ title: notes.title })
      .from(notes)
      .where(and(eq(notes.ownerId, userId), changedOn(day)))
      .orderBy(asc(notes.updatedAt))
      .limit(50);
    return rows.map((row) => row.title);
  }
}

function changedOn(day: string) {
  const start = new Date(`${day}T00:00:00Z`);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return and(gte(notes.updatedAt, start), lt(notes.updatedAt, end));
}

```

一个定时任务为每个用户排队一个邮件任务。排队操作很快，每个摘要都有自己的重试机制：拒绝一个地址的邮件服务器不会延迟其他任何摘要：

```typescript title="src/emails/digest.scheduler.ts"
import { Injectable, Logger } from '@nestjs/common';
import { OnOneInstance } from '@nestjs/locks';
import { Cron } from '@nestjs/schedule';
import { DigestRepository, utcDay } from './digest.repository.js';
import { EmailJobs } from './email.jobs.js';

@Injectable()
export class DigestScheduler {
  private readonly logger = new Logger(DigestScheduler.name);

  constructor(
    private readonly digestRepository: DigestRepository,
    private readonly emailJobs: EmailJobs,
  ) {}

  // Every evening at 18:00 UTC, on one instance of the application.
  @Cron(process.env.DIGEST_CRON ?? '0 18 * * *', { name: 'daily-digest', timeZone: 'UTC' })
  @OnOneInstance({ key: 'mail:daily-digest' })
  async enqueueDigests(): Promise<number> {
    const day = utcDay(new Date());
    const userIds = await this.digestRepository.authorsOn(day);
    // One job per user: a slow or failing send delays nobody else's digest.
    await this.emailJobs.digests(day, userIds);
    this.logger.log(`Digests of ${day}: ${userIds.length} queued`);
    return userIds.length;
  }
}

```

`@nestjs/schedule` 在应用程序的每个实例上运行该方法。如果有三个实例，其中三个都会查询笔记并排队相同的任务。任务 ID 会使额外的任务成为无操作（no-ops），但工作仍然会运行三次，而一个没有自然键（natural key）的操作，例如调用另一个服务，也会执行三次。`@OnOneInstance()` 只在一个实例上运行该方法：第一个触发调度器的实例会获取任务的租约（lease），在租约有效期间续期，并在每次滴答（tick）时运行，其他实例则跳过自己的滴答。如果所有者死亡，另一个实例在租约过期后的第一个滴答时接管，即 30 秒后。[Run each job on one instance](/reliability/locks#run-each-job-on-one-instance) 解释了租约以及为什么不会补齐滴答。

cron 表达式来自 `process.env.DIGEST_CRON`，在加载文件时读取，这早于 `ConfigModule` 读取 `.env`。将其设置在进程的环境中，如 [Try it](/tutorials/background-jobs#try-it) 部分所示，即可在傍晚前看到摘要。

这些实例通过它们共享的**锁存储**达成一致。`@nestjs/locks` 定义了契约，`LockStore`，并将锁保留在内存中，直到注册一个锁，这仅排除了同一进程中的调用者：当 `NODE_ENV` 设置为 `production` 时，它会拒绝以这种方式启动。 API 已经有 Redis，因此存储是来自 [The store on Redis](/reliability/locks#the-store-on-redis) 的，使用其独立的 ioredis 客户端：

```typescript title="src/redis/redis.module.ts"
import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../config.js';

export const REDIS = Symbol('REDIS');

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => new Redis(config.get('REDIS_URL', { infer: true })),
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  // After onModuleDestroy(), where running jobs finish and hand their locks back.
  async onApplicationShutdown() {
    await this.redis.quit();
  }
}

```

锁存储在该客户端上实现了 `LockStore`：

```typescript title="src/redis/redis-lock.store.ts"
import { Inject, Injectable } from '@nestjs/common';
import { LocksStorage, type LockAcquireResult, type LockStore } from '@nestjs/locks';
import type { Redis } from 'ioredis';
import { REDIS } from './redis.module.js';

// Takes the lock if nobody holds it, expiring on Redis's clock, and draws a fencing token
// from a counter that never goes back. Returns the token, or 0.
const ACQUIRE = `
if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[2]) then
  return redis.call('INCR', KEYS[2])
end
return 0
`;

// Renews the lock, if it is still ours.
const RENEW = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`;

// Deletes the lock, if it is still ours.
const RELEASE = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

/** Where the fencing counter lives; no lock key can be named like it. */
const FENCING_COUNTER = 'locks:fencing-token';

@Injectable()
export class RedisLockStore implements LockStore {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    storage: LocksStorage,
  ) {
    storage.registerSource(this);
  }

  async acquire(key: string, owner: string, ttl: number): Promise<LockAcquireResult> {
    const token = Number(await this.redis.eval(ACQUIRE, 2, this.key(key), FENCING_COUNTER, owner, ttl));
    return token > 0 ? { acquired: true, fencingToken: token } : { acquired: false };
  }

  async renew(key: string, owner: string, ttl: number): Promise<boolean> {
    return (await this.redis.eval(RENEW, 1, this.key(key), owner, ttl)) === 1;
  }

  async release(key: string, owner: string): Promise<boolean> {
    return (await this.redis.eval(RELEASE, 1, this.key(key), owner)) === 1;
  }

  private key(key: string) {
    return `locks:key:${key}`;
  }
}

```

每个方法是一个 Lua 脚本，Redis 原子性地运行它：无论有多少实例同时尝试获取租约，只有一个会成功。给 Redis 持久性以及 `maxmemory-policy noeviction`：被驱逐的锁即是丢失的锁，且围栏计数器（fencing counter）绝不能倒退。`RedisLockStore` 注册在根模块中，与出件箱（outbox）的存储相邻。

#### 不丢失邮件地关闭

部署使用 `SIGTERM` 停止每个旧实例。`main.ts` 已经调用了来自 JWT 教程的 `app.enableShutdownHooks()`，本教程的每个部分都使用了它启用的钩子：

1. 在第一阶段，BullMQ 的工作者关闭：它们不再接收新任务，并等待正在运行的任务完成。摘要的租约返回，因此另一个实例的下一个滴答无需等待 30 秒即可获取它，并且出件箱中继完成其发布的工作。
2. 在最后阶段，队列关闭其 Redis 连接，锁存储的客户端退出，数据库连接池结束。任何正在完成的任务所需的资源都不会在它完成前被关闭。

平台会等待这个过程，但不会永远等待：Kubernetes 默认在 `SIGTERM` 之后 30 秒发送 `SIGKILL`（`terminationGracePeriodSeconds`）。将其设置得比最长的任务时间更长。在任务进行中被杀死的进程不会丢失任何内容：BullMQ 会注意到任务的锁已过期，并在另一个工作者上重新运行它（参见 BullMQ 文档中的 [stalled jobs](https://docs.bullmq.io/guide/workers/stalled-jobs)），在那里 `sent_emails` 会处理可能已发送的邮件。

##### 在自己的进程中运行工作者

到目前为止，所有内容都在一个进程中运行：API、工作者、中继和调度器。这是一个好的开始。一旦发送邮件与请求争夺 CPU 资源，或者您希望将两者分开扩展，请将工作者运行在自己的进程中。应用程序上下文运行相同的模块，但不包含 HTTP 服务器：

```typescript title="src/worker.ts"
import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';

// The same application without the HTTP server: it runs the email jobs, the outbox relay and the digest.
const app = await NestFactory.createApplicationContext(AppModule, { instrument: ObserveInstrument });
app.enableShutdownHooks();

```

添加一个脚本到 `package.json`：

```json
"start:worker": "node dist/worker"

```

然后使用 `MAIL_WORKER=off` 启动 API 实例，这会将 `EmailProcessor` 排除在 `EmailsModule` 之外（它在模块文件加载时读取，类似于 `DIGEST_CRON`，因此将其设置在环境中），并使用 `npm run start:worker` 启动工作者。API 实例添加任务，工作者进程发送它们。出件箱中继和摘要调度器可以在任一类型的进程中运行：中继通过 PostgreSQL 中的租约共享其工作，而摘要在任何实例上运行。

#### 试用

构建应用程序并启动它，将摘要设置为每十秒而不是每天一次（六字段表达式以秒开始）：

```bash
$ npm run build
$ DIGEST_CRON='*/10 * * * * *' npm run start:prod

```

启动时，出件箱和锁记录其存储，在首次启动时，出件箱的存储会创建其模式：

```bash
LOG [OutboxModule] OutboxStorage: PostgresOutboxStore
LOG [LocksModule] LocksStorage: RedisLockStore
LOG [OutboxModule] PostgresOutboxStore: migrated schema "nest_outbox" to version 1.

```

注册。响应在发送任何邮件之前返回（令牌已缩短）：

```bash
$ curl localhost:3000/auth/sign-up --json '{"email":"ada@example.com","password":"correct horse battery"}'
{"accessToken":"eyJhbGciOiJIUzI1NiIs...","refreshToken":"...","expiresIn":900}

```

片刻后，工作者发送欢迎邮件，日志传输将其写入控制台：

```bash
LOG [LogMailTransport] "Welcome to Notes" to ada@example.com
DEBUG [LogMailTransport] Hi ada@example.com,

your account is ready. On the days you change notes, we'll send you a digest of them in the evening.

```

添加两条笔记，其中一条的标题包含标记：

```bash
$ TOKEN=eyJhbGciOiJIUzI1NiIs...
$ curl localhost:3000/notes -H "Authorization: Bearer $TOKEN" --json '{"title":"Plan the trip"}'
$ curl localhost:3000/notes -H "Authorization: Bearer $TOKEN" --json '{"title":"Fix the <script> tag"}'

```

在下一个滴答时，实例获取摘要的租约并排队 Ada 的摘要。文本部分显示了 Ada 撰写的标题；在 HTML 部分，它被转义了：

```bash
LOG [Locks] DigestScheduler.enqueueDigests runs on this instance (lease "mail:daily-digest:owner", fencing token 1)
LOG [DigestScheduler] Digests of 2026-11-19: 1 queued
LOG [LogMailTransport] "Your notes on 2026-11-19" to ada@example.com
DEBUG [LogMailTransport] You changed 2 notes today:

- Plan the trip
- Fix the <script> tag

```

从另一个终端启动第二个实例。由于第一个实例持有租约，它的滴答被跳过：

```bash
$ PORT=3001 DIGEST_CRON='*/10 * * * * *' npm run start:prod
DEBUG [Locks] Skipped DigestScheduler.enqueueDigests: it runs on another instance
DEBUG [Locks] Skipped DigestScheduler.enqueueDigests: it runs on another instance

```

第一个实例每十秒继续排队 Ada 的摘要，没有第二个摘要发出：该任务的 id 仍在 Redis 中，因此 BullMQ 不会再次添加它，任务只运行了一次。每封邮件只发送了一次：

```bash
$ docker exec notes-db psql -U postgres -d notes -c "SELECT key, sent_at FROM sent_emails"
                          key                           |            sent_at
--------------------------------------------------------+-------------------------------
 welcome-43a07bfa-3964-429c-b940-1d592c4d0f6a           | 2026-11-19 22:15:13.292295+00
 digest-43a07bfa-3964-429c-b940-1d592c4d0f6a-2026-11-19 | 2026-11-19 22:15:20.026325+00

```

最后，停止 Redis 并重新注册。注册仍然成功，速度和以前一样快：

```bash
$ docker stop notes-redis
$ curl -s -o /dev/null -w '%{http_code} in %{time_total}s\n' localhost:3000/auth/sign-up --json '{"email":"grace@example.com","password":"correct horse battery"}'
201 in 0.434314s

```

出件箱无法将消息交给队列，并重试。摘要的滴答也失败了，因为锁存储没有响应，因此被跳过；ioredis 也记录了被拒绝的连接。重新启动 Redis，欢迎邮件发出：

```bash
WARN [OutboxRelay] Retrying user.signed-up 01a1f5e1-0d77-7110-8846-f7efc7ed9ad8 in 772ms (attempt 1 of 20 failed): OutboxPublishTimeoutError: Publish did not settle within 10000ms
ERROR [Scheduler] Error: DigestScheduler.enqueueDigests did not run: the lock store failed (RedisLockStore.acquire() for the lock "mail:daily-digest:owner" did not answer within 10000ms (storeTimeout))
$ docker start notes-redis
LOG [LogMailTransport] "Welcome to Notes" to grace@example.com

```

#### 测试它

测试使用真实的 PostgreSQL 服务器通过连接池运行真实应用程序，其中两个相同任务的运行确实竞争，并使用真实的 Redis，其中 BullMQ 运行任务。只替换了投递：`InMemoryMailTransport` 来自 `@nestjs/mail` 保留了收到的每封邮件，带有查找邮件的辅助函数，并且 `failNext()` 使下一次发送失败（参见 [Testing](/application/mail#测试)）。一个小子类也可以保持下一次发送处于打开状态，就像慢邮件服务器会做的那样。

Vitest 配置将应用程序指向测试自己的 Redis 数据库，并将摘要的调度时间移动到一个测试运行期间永远不会到来的日期，因为测试会自行调用它：

```typescript title="vitest.config.e2e.ts"
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    env: {
      DATABASE_URL: 'postgres://unused-in-tests',
      JWT_SECRET: 'test-only-jwt-secret-of-at-least-32-bytes',
      // A Redis database of the tests' own: they empty it.
      REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15',
      // February 29th, 3 AM: the tests run the digest themselves.
      DIGEST_CRON: '0 3 29 2 *',
    },
  },
});

```

测试检查欢迎邮件、同时运行三次的任务、重试和拒绝、两个实例上的摘要以及关机：

```typescript title="test/emails.e2e-spec.ts"
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { PasswordHasher } from '@nestjs/authentication';
import { getQueueToken } from '@nestjs/bullmq';
import { getDrizzleToken } from '@nestjs/drizzle';
import { InMemoryMailTransport, MailSmtpError, MailTransport, type MailMessage } from '@nestjs/mail';
import { NodeAdapter, type NestNodeApplication } from '@nestjs/platform-node';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module.js';
import { sentEmails, users } from '../src/database/schema.js';
import { DigestMail } from '../src/emails/digest.mail.js';
import { DigestScheduler } from '../src/emails/digest.scheduler.js';
import { EMAILS_QUEUE, EmailJobs, welcomeKey } from '../src/emails/email.jobs.js';
import { WelcomeMail } from '../src/emails/welcome.mail.js';

/** Keeps the mails, and can hold the next send open, as a slow mail server would. */
class Mailbox extends InMemoryMailTransport {
  private gate?: { started: () => void; released: Promise<void> };

  holdNext() {
    let started!: () => void;
    let release!: () => void;
    const sending = new Promise<void>((resolve) => (started = resolve));
    this.gate = { started, released: new Promise((resolve) => (release = resolve)) };
    return { sending, release };
  }

  override async send(message: MailMessage) {
    const gate = this.gate;
    this.gate = undefined;
    gate?.started();
    await gate?.released;
    return super.send(message);
  }
}

// A real PostgreSQL with a pool, so two runs of one job really race.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('Emails (e2e)', () => {
  const db = drizzle({ client: new Pool({ connectionString: url, max: 20 }) });
  const mailbox = new Mailbox();
  let app: NestNodeApplication;
  let queue: Queue;

  /** An instance of the application, on a pool of its own. Several share the queue and the locks. */
  async function start() {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDrizzleToken())
      .useValue(drizzle({ client: new Pool({ connectionString: url }) }))
      .overrideProvider(PasswordHasher)
      .useValue(new PasswordHasher({ logN: 10 }))
      .overrideProvider(MailTransport)
      .useValue(mailbox)
      .compile();
    const instance = moduleRef.createNestApplication<NestNodeApplication>(new NodeAdapter());
    await instance.init();
    return instance;
  }

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
    await db.execute(sql`TRUNCATE users, refresh_tokens CASCADE`);
    await db.execute(sql`DROP SCHEMA IF EXISTS nest_outbox CASCADE`); // the store creates it again
    // Jobs and locks left over from an earlier run would be processed at startup.
    const redis = new Redis(process.env.REDIS_URL!);
    await redis.flushdb();
    await redis.quit();
    app = await start();
    queue = app.get<Queue>(getQueueToken(EMAILS_QUEUE));
  });

  afterAll(() => db.$client.end());
  beforeEach(() => mailbox.clear());

  let clients = 0;

  async function signUp(email: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email, password: 'correct horse battery' },
      remoteAddress: `10.0.0.${++clients}`, // sign-up is rate-limited per IP address
    });
    expect(res.statusCode).toBe(201);
    return { authorization: `Bearer ${res.json<{ accessToken: string }>().accessToken}` };
  }

  /** A user inserted directly, so no welcome job is queued for them. */
  async function createUser(email: string) {
    const [user] = await db.insert(users).values({ email, passwordHash: 'unused' }).returning();
    return user.id;
  }

  /** Waits for a job to finish, and returns it. */
  function finished(id: string) {
    return vi.waitUntil(
      async () => {
        const job = await queue.getJob(id);
        return job?.finishedOn ? job : undefined;
      },
      { timeout: 10_000 },
    );
  }

  it('sends a welcome email after sign-up, outside the request', async () => {
    await signUp('ada@example.com');

    const mail = await vi.waitUntil(() => mailbox.find({ to: 'ada@example.com', mail: WelcomeMail }));
    expect(mail.subject).toBe('Welcome to Notes');
  });

  it('sends one email, however many times its job runs at once', async () => {
    const userId = await createUser('bob@example.com');
    const { sending, release } = mailbox.holdNext(); // the first send takes a moment
    const options = { attempts: 3, backoff: { type: 'fixed', delay: 500 } };

    // Three copies of the job: a redelivery, or a job added again after the first was removed.
    const jobs = await Promise.all([1, 2, 3].map(() => queue.add('welcome', { userId }, options)));
    await sending;
    await sleep(200); // the other two copies run meanwhile
    release();
    const results = await Promise.all(jobs.map((job) => finished(job.id!)));

    expect(results.map((job) => job.returnvalue).sort()).toEqual(['already sent', 'already sent', 'sent']);
    expect(results.map((job) => job.attemptsMade).sort()).toEqual([1, 2, 2]); // the copies waited for the first
    expect(mailbox.filter({ to: 'bob@example.com' })).toHaveLength(1);
  });

  it('retries a send that failed', async () => {
    mailbox.failNext(new MailSmtpError('DATA', { code: 451, text: 'Try again later' }));
    const userId = await createUser('carol@example.com');

    await app.get(EmailJobs).welcome(userId);
    const job = await finished(welcomeKey(userId));

    expect(job.attemptsMade).toBe(2); // the second attempt, 2 seconds later, sent it
    mailbox.assertSent({ to: 'carol@example.com', mail: WelcomeMail });
  });

  it('fails a send that the mail server refuses, without retrying', async () => {
    mailbox.failNext(new MailSmtpError('RCPT TO', { code: 550, text: 'User unknown' }));
    const userId = await createUser('nobody@example.com');

    await app.get(EmailJobs).welcome(userId);
    const job = await finished(welcomeKey(userId));

    expect(await job.getState()).toBe('failed');
    expect(job.attemptsMade).toBe(1);
    const claims = await db.select().from(sentEmails).where(eq(sentEmails.userId, userId));
    expect(claims).toEqual([]); // released: sending it again later is possible
  });

  it('queues the digests on one instance, and escapes what users wrote', async () => {
    const dave = await signUp('dave@example.com');
    await app.inject({ method: 'POST', url: '/notes', headers: dave, payload: { title: 'Fix <script> tag' } });
    const other = await start();

    // Both instances' schedulers fire at the same moment.
    const runs = await Promise.all([app, other].map((instance) => instance.get(DigestScheduler).enqueueDigests()));
    await other.close();

    expect(runs.filter((run) => run !== undefined)).toEqual([1]); // the other instance skipped it
    const mail = await vi.waitUntil(() => mailbox.find({ to: 'dave@example.com', mail: DigestMail }));
    expect(mail.html).toContain('<li>Fix &lt;script&gt; tag</li>');
  });

  it('finishes the email in flight before it shuts down', async () => {
    const { sending, release } = mailbox.holdNext();
    const userId = await createUser('erin@example.com');
    await app.get(EmailJobs).welcome(userId);
    await sending;

    let closed = false;
    const closing = app.close().then(() => (closed = true));
    await sleep(500);
    expect(closed).toBe(false); // waiting for the worker's job
    release();
    await closing;

    mailbox.assertSent({ to: 'erin@example.com' });
    const [claim] = await db.select().from(sentEmails).where(eq(sentEmails.userId, userId));
    expect(claim.sentAt).not.toBeNull();
  });
});

```

- **任务副本竞争。** 第一个副本的发送被保持打开状态，因此其他两个在它飞行过程中运行：它们找到声明，第一次尝试失败，而它们的重试找到了已发送的邮件。`attemptsMade` 显示了竞争的发生。
- **重试测试使用应用程序自身的任务选项。** 451 响应是瞬态的，因此任务在 2 秒的退避后再次运行，第二次尝试发送邮件。
- **两个实例，一个摘要运行。** 两个实例的调度器同时触发，只有其中一个调用运行；另一个在不运行的情况下解析。
- **关机等待飞行中的任务**，并且在 `close()` 解析之前标记了邮件的行已发送。

创建测试数据库，并使用自己的 Redis 数据库运行测试，因为它们会清空它。两个测试文件使用相同的数据库，所以它们一个接一个地运行：

```bash
$ docker exec notes-db psql -U postgres -c "CREATE DATABASE notes_test"
$ TEST_DATABASE_URL=postgres://postgres:notes@localhost:5432/notes_test TEST_REDIS_URL=redis://localhost:6379/1 npm run test:e2e -- --no-file-parallelism

 Test Files  2 passed (2)
      Tests  11 passed (11)

```

将 `sendOnce()` 中的声明替换为行上的 `SELECT` 和发送后的 `INSERT`，则“一次只发送一封邮件，无论任务同时运行多少次”失败：三个副本中有两个发送了邮件。

#### 生产检查清单

JWT 教程中的 [checklist](/tutorials/rest-api-jwt-authentication#production-checklist) 中的所有内容都适用。特别是对于邮件和任务：

- **通过真实的传输发送。** 设置 `MAIL_TRANSPORT=smtp` 和 `SMTP_URL`，或者换入 HTTP 提供者的传输器。使用 `NODE_ENV=production`，邮件模块在启动时警告 `LogMailTransport` 不投递邮件。为发送域配置 SPF、DKIM 和 DMARC；[mail chapter's checklist](/application/mail#production-checklist) 涵盖其余部分。
- **为 Redis 提供持久性和 `maxmemory-policy noeviction`。** 队列中的任务和锁都存储在那里。被驱逐的任务是一封永远不会发送的邮件，被驱逐的锁允许第二个实例运行摘要。
- **在部署时应用出件箱的迁移**，使用 `npx @nestjs/outbox migrate` 紧邻 `npx drizzle-kit migrate`。使用 `NODE_ENV=production`，存储在启动时不会迁移，并且在模式落后时拒绝启动。`npx @nestjs/outbox status` 在 CI 中检查它。
- **将宽限期设置得比最长的任务更长**，这样部署的 `SIGTERM` 才能让飞行中的邮件完成。
- **监控失败集和死信。** 用尽尝试的任务在 BullMQ 的失败集中保留一周，出件箱无法处理的消息会移动到其死信中。对两者进行警报。
- **清理增长的部分。** `sent_emails` 每封邮件增加一行，出件箱的收件箱每条消息增加一行：从已调度任务中删除旧行，保留多于任何重投窗口的时间。一旦笔记增长，为摘要的查询索引 `notes.updated_at`。
- **以提供者允许的速率发送。** BullMQ 的工作者可以接受速率限制（参见 BullMQ 文档中的 [Rate limiting](https://docs.bullmq.io/guide/rate-limiting)）；仅 `concurrency` 限制并行发送，而不是每秒发送次数。
- **为生产环境提供自己的 Observe 密钥对**，来自项目的 **API Keys** 页面，因为 API 和工作进程的环境中 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET` 不加载 `.env`。然后 [NestJS Observe](/observability/dashboard) 将邮件任务和摘要的 cron 运行记录为任务，记录其队列等待时间、尝试次数和失败原因，并将其与持续时间并列，以及一个 **任务静默** 规则在命名任务（如摘要）未报告超过允许时间时发出警报。`ObserveModule` 在 `imports` 中位于 `BullModule` 之前，因此在部署的 `SIGTERM` 仍在运行的任务也会被报告（参见 [Shutdown](/observability/sdk#shutdown)）。

#### 后续步骤

- 验证电子邮件地址并重置密码，使用本教程设置的邮件：[Authentication](/security/authentication#verify-email-addresses)。
- 将邮件翻译成每位用户的语言：[Send it in the customer's language](/application/mail#send-it-in-the-customers-language)。
- 在 PostgreSQL 而不是 Redis 上运行任务：[Pluggable backends](/techniques/queues#pluggable-backends-postgresql)。
- 了解出件箱的保证，以及其中继如何在实例之间共享工作：[Outbox](/reliability/outbox#delivery-guarantees)。
- 阻止长时间运行的任务相互重叠，并保护其写入：[Distributed locks](/reliability/locks#dont-let-a-long-run-overlap-itself)。