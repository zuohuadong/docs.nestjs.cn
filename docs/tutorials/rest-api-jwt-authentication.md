<!-- 此文件从 content/tutorials/rest-api-jwt-authentication.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:50:17.212Z -->
<!-- 源文件: content/tutorials/rest-api-jwt-authentication.md -->
<!-- 源哈希: 2844ff75e87cd6a947ad67eb967a01dc -->

### 使用 JWT 认证构建 Node.js REST API

使用 NestJS 和 PostgreSQL，从单个文件构建一个生产就绪的、带有 JWT 认证的 Node.js 和 TypeScript REST API，并使其可部署。

该 API 存储个人笔记。用户通过电子邮件和密码注册，获得一个短期 JWT 访问令牌和一个轮换刷新令牌，并且只能读写自己的笔记。每个构建块在该文档中有自己的章节；本教程按照真实项目所需的顺序将它们组合起来，并在需要详细信息时链接到相应章节。

完成时，API 将具备以下功能：

- 使用 [Zod](https://zod.dev/) 模式验证每个请求体、查询字符串和路由参数，同时为处理器提供类型。
- 使用 [`@nestjs/authentication`](/security/authentication) 进行用户登录：密码使用 scrypt 哈希，访问令牌使用 HS256，刷新令牌在每次使用时轮换，并且当一个令牌被重用时会撤销其整个家族。
- 通过 [Drizzle](https://docs.nestjs.com/data/drizzle) 在 PostgreSQL 中存储用户、笔记和刷新令牌。
- 在配置缺失或格式错误时拒绝启动。
- 限制任何人猜测密码的速度。
- 在每个响应中发送安全标头，并且只接受来自您列出的源的浏览器请求。
- 使用 Swagger UI 在 OpenAPI 文档中描述自身。
- 回答健康检查和就绪检查，并在 `SIGTERM` 时干净地关闭。
- 在生产环境中以 JSON 格式写入日志，同时屏蔽密码和令牌。
- 在没有数据库服务器的情况下运行端到端测试。

这些是端点以及添加每个端点的章节：

| Endpoint | Section |
| --- | --- |
| `GET /notes`, `GET /notes/:id`, `POST /notes`, `PATCH /notes/:id`, `DELETE /notes/:id` | [Start with one file](/tutorials/rest-api-jwt-authentication#start-with-one-file) |
| `POST /auth/sign-up`, `POST /auth/token`, `POST /auth/token/refresh`, `POST /auth/token/revoke`, `GET /me` | [Sign users in with JWTs](/tutorials/rest-api-jwt-authentication#sign-users-in-with-jwts) |
| `GET /docs` | [Describe the API with OpenAPI](/tutorials/rest-api-jwt-authentication#describe-the-api-with-openapi) |
| `GET /health/live`, `GET /health/ready` | [Add health checks](/tutorials/rest-api-jwt-authentication#add-health-checks) |

> info **提示** 完成的应用在 GitHub 上是 [nestjs/example-rest-api-jwt-authentication](https://github.com/nestjs/example-rest-api-jwt-authentication)，其中包含其测试和 CI 工作流。

您需要 Node.js 22 或更高版本，从第二部分开始需要 PostgreSQL 服务器。

#### 从单个文件开始

使用 [Nest CLI](/cli/overview) 创建项目。`--minimal` 生成一个代码为单个文件的应用程序，`src/main.ts`（参见 [One-file projects](/cli/usages#one-file-projects)）。它还安装了 [NestJS Observe SDK](/observability/sdk)、`@nestjs/observe`，并将其集成到该文件中；应用程序自身的文件保持如下：

```bash
$ npm i -g @nestjs/cli
$ nest new notes-api --minimal
$ cd notes-api

```

安装 [Node adapter](/techniques/performance#node-adapter)，它直接在 `node:http` 上运行 Nest，是三者中最快的，以及 Zod。CLI 安装的 Express 适配器不再需要：

```bash
$ npm i --save @nestjs/platform-node zod
$ npm uninstall @nestjs/platform-express @types/express

```

用 API 的第一个版本替换 `src/main.ts`。目前它将笔记保存在内存中：

```typescript title="src/main.ts"
import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createObserveModule } from '@nestjs/observe';
import { NodeAdapter } from '@nestjs/platform-node';
import { z } from 'zod';

const { ObserveModule, ObserveInstrument } = createObserveModule();

const title = z.string().trim().min(1).max(200);
const body = z.string().max(10_000);

const createNoteSchema = z.object({ title, body: body.default('') });
type CreateNoteDto = z.infer<typeof createNoteSchema>;

// Every field optional, none nullable: a null title is a 400.
const updateNoteSchema = z.object({ title, body }).partial();
type UpdateNoteDto = z.infer<typeof updateNoteSchema>;

interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
class NotesService {
  private readonly notes = new Map<string, Note>();

  findAll(): Note[] {
    return [...this.notes.values()];
  }

  findOne(id: string): Note {
    const note = this.notes.get(id);
    if (!note) {
      throw new NotFoundException();
    }
    return note;
  }

  create(dto: CreateNoteDto): Note {
    const now = new Date();
    const note: Note = { id: randomUUID(), ...dto, createdAt: now, updatedAt: now };
    this.notes.set(note.id, note);
    return note;
  }

  update(id: string, dto: UpdateNoteDto): Note {
    const note = this.findOne(id);
    Object.assign(note, dto, { updatedAt: new Date() });
    return note;
  }

  remove(id: string): void {
    if (!this.notes.delete(id)) {
      throw new NotFoundException();
    }
  }
}

const noteId = { schema: z.uuid() };

@Controller('notes')
class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  findAll() {
    return this.notesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', noteId) id: string) {
    return this.notesService.findOne(id);
  }

  @Post()
  create(@Body({ schema: createNoteSchema }) dto: CreateNoteDto) {
    return this.notesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', noteId) id: string, @Body({ schema: updateNoteSchema }) dto: UpdateNoteDto) {
    return this.notesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', noteId) id: string) {
    this.notesService.remove(id);
  }
}

const app = await NestFactory.create(
  {
    imports: [
      ObserveModule.forRoot({
        // Empty until `npx @nestjs/observe link` writes the key pair into .env: the SDK then sends nothing.
        appKey: process.env.OBSERVE_APP_KEY ?? '',
        appSecret: process.env.OBSERVE_APP_SECRET ?? '',
        serviceId: 'notes-api',
      }),
    ],
    controllers: [NotesController],
    providers: [NotesService],
  },
  new NodeAdapter(),
  { instrument: ObserveInstrument },
);
app.useGlobalPipes(new StandardSchemaValidationPipe());
await app.listen(process.env.PORT ?? 3000);

```

- 没有模块类：`NestFactory.create()` 直接获取根模块的元数据（参见 [Root module from metadata](/modules#root-module-from-metadata)）。当应用程序有自己的模块需要导入时，该类将在下一部分出现。使用适配器时，应用程序选项（包括 `instrument`）是第三个参数。
- `StandardSchemaValidationPipe` 使用 Zod 或任何其他 [Standard Schema](https://standardschema.dev/) 库验证声明了 `schema` 的每个参数，并将模式的输出传递给处理器，因此 `body` 默认为空字符串，而 `title` 接收到的是修剪后的字符串。每个模式推断的类型即为参数的类型，因此无需维护 DTO 类。参见 [Schema-based validation](/techniques/validation#使用内置的-standardschemavalidationpipe)。
- `updateNoteSchema` 是从相同的字段模式构建的，而不是使用 `createNoteSchema.partial()`。Zod 仍在 `partial()` 内部应用默认值，因此一个仅重命名笔记的 `PATCH` 会将其主体重置为空字符串。
- 可选字段不是可空的。一个带有 `null` 标题的 `PATCH` 会返回 400 错误，而不是像 500 那样达到数据库的 `NOT NULL` 约束。

启动应用程序，然后从另一个终端尝试（`--json`，curl 7.82 或更高版本，发送带有 JSON 主体的 `POST`）：

```bash
$ npm run start:dev

```

创建一个笔记，然后尝试一些验证失败的请求：

```bash
$ curl localhost:3000/notes --json '{"title":"Buy milk"}'
{"id":"d90a31d3-2df2-447d-8d5e-c2b2e241a8eb","title":"Buy milk","body":"","createdAt":"2026-11-19T19:42:46.765Z","updatedAt":"2026-11-19T19:42:46.765Z"}
$ curl localhost:3000/notes --json '{"title":""}'
{"message":["title: Too small: expected string to have >=1 characters"],"error":"Bad Request","statusCode":400}
$ curl -X PATCH localhost:3000/notes/d90a31d3-2df2-447d-8d5e-c2b2e241a8eb --json '{"title":null}'
{"message":["title: Invalid input: expected string, received null"],"error":"Bad Request","statusCode":400}
$ curl localhost:3000/notes/not-a-uuid
{"message":["Invalid UUID"],"error":"Bad Request","statusCode":400}

```

#### 将笔记存储在 PostgreSQL 中

笔记在每次重启时都会丢失。通过 [`@nestjs/drizzle`](https://docs.nestjs.com/data/drizzle) 将它们移动到 PostgreSQL，并使用 [`@nestjs/config`](/application/configuration) 从环境变量中读取数据库 URL：

```bash
$ npm i --save @nestjs/config @nestjs/drizzle drizzle-orm@rc pg
$ npm i --save-dev drizzle-kit@rc @types/pg

```

对于本地数据库，一个容器就足够了：

```bash
$ docker run -d --name notes-db -e POSTGRES_PASSWORD=notes -e POSTGRES_DB=notes -p 5432:5432 postgres:17

```

将其 URL 添加到项目根目录中的 `.env` 文件。`ConfigModule` 在启动时加载该文件，而 `drizzle-kit` 也会读取它：

```bash
DATABASE_URL=postgres://postgres:notes@localhost:5432/notes

```

该文件变得很长，所以现在是给它一些结构的好时机。每个部分都移动到 `src/` 下的单独文件中，根模块再次成为一个类，因为它现在导入了其他模块：

<div class="file-tree">
  <div class="item">src</div>
  <div class="children">
    <div class="item">database</div>
    <div class="children">
      <div class="item">schema.ts</div>
    </div>
    <div class="item">notes</div>
    <div class="children">
      <div class="item">notes.controller.ts</div>
      <div class="item">notes.module.ts</div>
      <div class="item">notes.schemas.ts</div>
      <div class="item">notes.service.ts</div>
    </div>
    <div class="item">app.module.ts</div>
    <div class="item">config.ts</div>
    <div class="item">main.ts</div>
  </div>
</div>

配置本身也是一个 Zod 模式。`ConfigModule` 在启动时根据它验证环境变量，并提供模式返回的值，因此 `PORT` 是一个数字：

```typescript title="src/config.ts"
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.url(),
});

export type Env = z.infer<typeof envSchema>;

```

在 Drizzle 的模式语言中的表：

```typescript title="src/database/schema.ts"
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const notes = pgTable('notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  createdAt: at('created_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
});

export type Note = typeof notes.$inferSelect;

```

模式移动到自己的文件。列表现在接受页面大小和偏移量，并有上限，因此没有请求会读取整个表：

```typescript title="src/notes/notes.schemas.ts"
import { z } from 'zod';

const title = z.string().trim().min(1).max(200);
const body = z.string().max(10_000);

export const createNoteSchema = z.object({ title, body: body.default('') });
export type CreateNoteDto = z.infer<typeof createNoteSchema>;

// Every field optional, none nullable: a null title is a 400.
// Not createNoteSchema.partial(): the default would reset `body` on every update.
export const updateNoteSchema = z.object({ title, body }).partial();
export type UpdateNoteDto = z.infer<typeof updateNoteSchema>;

export const listNotesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListNotesQuery = z.infer<typeof listNotesQuerySchema>;

```

服务查询数据库，该数据库由 `@InjectDrizzle()` 注入：

```typescript title="src/notes/notes.service.ts"
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { notes, type Note } from '../database/schema.js';
import type { CreateNoteDto, ListNotesQuery, UpdateNoteDto } from './notes.schemas.js';

@Injectable()
export class NotesService {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  findAll({ limit, offset }: ListNotesQuery): Promise<Note[]> {
    return this.db
      .select()
      .from(notes)
      .orderBy(desc(notes.createdAt), desc(notes.id))
      .limit(limit)
      .offset(offset);
  }

  async findOne(id: string): Promise<Note> {
    const [note] = await this.db.select().from(notes).where(eq(notes.id, id));
    return note ?? notFound();
  }

  async create(dto: CreateNoteDto): Promise<Note> {
    const [note] = await this.db.insert(notes).values(dto).returning();
    return note;
  }

  async update(id: string, dto: UpdateNoteDto): Promise<Note> {
    // One statement, no read before the write: a concurrent DELETE can't be undone.
    const [note] = await this.db
      .update(notes)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(notes.id, id))
      .returning();
    return note ?? notFound();
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.db.delete(notes).where(eq(notes.id, id)).returning({ id: notes.id });
    if (deleted.length === 0) {
      notFound();
    }
  }
}

function notFound(): never {
  throw new NotFoundException('Note not found');
}

```

`update()` 和 `remove()` 通过语句更改的内容了解笔记是否存在。先读取行再保存的服务之间存在一个时间差，在此期间另一个请求可以删除笔记；然后保存会将其写回。

```typescript title="src/notes/notes.controller.ts"
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  createNoteSchema,
  listNotesQuerySchema,
  updateNoteSchema,
  type CreateNoteDto,
  type ListNotesQuery,
  type UpdateNoteDto,
} from './notes.schemas.js';
import { NotesService } from './notes.service.js';

const noteId = { schema: z.uuid() };

@Controller('notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  findAll(@Query({ schema: listNotesQuerySchema }) query: ListNotesQuery) {
    return this.notesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', noteId) id: string) {
    return this.notesService.findOne(id);
  }

  @Post()
  create(@Body({ schema: createNoteSchema }) dto: CreateNoteDto) {
    return this.notesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', noteId) id: string, @Body({ schema: updateNoteSchema }) dto: UpdateNoteDto) {
    return this.notesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', noteId) id: string) {
    return this.notesService.remove(id);
  }
}

```

```typescript title="src/notes/notes.module.ts"
import { Module } from '@nestjs/common';
import { NotesController } from './notes.controller.js';
import { NotesService } from './notes.service.js';

@Module({
  controllers: [NotesController],
  providers: [NotesService],
})
export class NotesModule {}

```

笔记模块注册了控制器和服务：

```typescript title="src/app.module.ts"
import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DrizzleModule } from '@nestjs/drizzle';
import { createObserveModule } from '@nestjs/observe';
import { drizzle } from 'drizzle-orm/node-postgres';
import { envSchema, type Env } from './config.js';
import { NotesModule } from './notes/notes.module.js';

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
    NotesModule,
  ],
  providers: [{ provide: APP_PIPE, useClass: StandardSchemaValidationPipe }],
})
export class AppModule {}

```

根模块注册了配置、数据库和验证管道。`DrizzleModule.forRootAsync()` 从 `ConfigService` 读取 URL，打开一个 `pg` 连接池，并在应用程序关闭时关闭它：

- **`ObserveModule` 先于** `imports`，正如 [SDK's quick start](/observability/sdk#quick-start) 所做的那样：模块按相反顺序关闭，因此它最后停止，并发送其他模块记录的内容（参见 [Shutdown](/observability/sdk#shutdown)）。`createObserveModule()` 使用 `ObserveInstrument` 返回它，然后由 `main.ts` 传递给 Nest。
- **键值对在链接项目之前是空的。** 没有它，SDK 不发送任何内容，并在启动时报告这一点。`npx @nestjs/observe link` 将 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET` 写入 `.env`，并将 `--env-file .env` 添加到 `start` 脚本中，因此在导入 `AppModule` 之前它们就存在于环境中，此时 SDK 读取它们：`ConfigModule` 加载文件太晚了（参见 [Linking from the terminal](/observability/sdk#linking-from-the-terminal)）。空值会回退到环境变量，就像 `nest new` 写入的那样（参见 [Reading the key pair from the environment](/observability/sdk#reading-the-key-pair-from-the-environment)）。

该管道已从 `main.ts` 移动到一个 `APP_PIPE` 提供者。它仍然适用于每个路由，现在是 `AppModule` 的一部分，因此本教程末尾的端到端测试也会包含它，而无需重复 `main.ts` 设置。`main.ts` 从根模块导入 `ObserveInstrument`，并将其传递给应用程序选项：

```typescript title="src/main.ts"
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NodeAdapter, type NestNodeApplication } from '@nestjs/platform-node';
import { AppModule, ObserveInstrument } from './app.module.js';
import type { Env } from './config.js';

const app = await NestFactory.create<NestNodeApplication>(AppModule, new NodeAdapter(), {
  instrument: ObserveInstrument,
});
app.enableShutdownHooks();

const config = app.get<ConfigService<Env, true>>(ConfigService);
await app.listen(config.get('PORT', { infer: true }));

```

`enableShutdownHooks()` 在 `SIGTERM` 时使应用程序关闭，这正是容器平台在每次部署时发送的：HTTP 服务器停止接受连接，连接池被关闭。没有它，进程只会结束。

在项目的根目录添加一个 `drizzle.config.ts`：

```typescript title="drizzle.config.ts"
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});

```

从模式生成第一个迁移，并应用它（参见 [Migrations](https://docs.nestjs.com/data/drizzle#迁移)）：

```bash
$ npx drizzle-kit generate --name=notes
$ npx drizzle-kit migrate

```

重启应用程序。现在笔记可以存活重启，并且配置错误会在服务请求之前停止应用程序：

```bash
$ DATABASE_URL=not-a-url npm run start
ERROR [ExceptionHandler] Error: Config validation error: DATABASE_URL: Invalid URL

```

#### 使用 JWT 登录用户

任何人都可以读取和更改每条笔记。接下来，用户注册、登录以获取令牌，并且只能看到自己的笔记。[`@nestjs/authentication`](/security/authentication) 负责安全敏感部分：哈希密码、签名和验证令牌以及轮换刷新令牌。它还注册了一个全局守卫，因此除非标记为公共，否则每个路由都需要已登录用户：

```bash
$ npm i --save @nestjs/authentication

```

将一个签名密钥添加到 `.env`。它必须至少为 32 字节：

```bash
# Generate with: openssl rand -base64 32
JWT_SECRET=

```

配置模式要求它：

```typescript title="src/config.ts"
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.url(),
  // Signs the access tokens: at least 32 bytes.
  JWT_SECRET: z.string().min(32),
});

export type Env = z.infer<typeof envSchema>;

```

模式连接了三个表：用户表、用于包刷新令牌的 `refresh_tokens` 表，以及每条笔记的所有者：

```typescript title="src/database/schema.ts"
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: at('created_at').notNull().defaultNow(),
});

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    createdAt: at('created_at').notNull().defaultNow(),
    updatedAt: at('updated_at').notNull().defaultNow(),
  },
  (table) => [index('notes_owner_id_created_at_idx').on(table.ownerId, table.createdAt)],
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

export type Note = typeof notes.$inferSelect;

```

生成迁移并应用它。需要 `owner_id`，并且您在上一节创建的笔记没有所有者，所以首先清空该表（在开发环境中）：

```bash
$ docker exec notes-db psql -U postgres -d notes -c "TRUNCATE notes"
$ npx drizzle-kit generate --name=users
$ npx drizzle-kit migrate

```

##### 用户

该包从不读取您的用户表。它向您的代码请求一个用户，您的代码决定了什么是用户：

```typescript title="src/users/user.ts"
export interface User {
  id: string;
  email: string;
  createdAt: Date;
}

```

仓储是唯一看到密码哈希的代码。它返回的所有内容都是一个不带哈希的 `User`，因此可以从路由返回用户或记录用户而不会泄露哈希：

```typescript title="src/users/users.repository.ts"
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { users } from '../database/schema.js';
import type { User } from './user.js';

const columns = { id: users.id, email: users.email, createdAt: users.createdAt };

/** Only `User` objects leave this class: password hashes stay inside. */
@Injectable()
export class UsersRepository {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  /** The new user, or `null` when the email is taken. */
  async create(email: string, passwordHash: string): Promise<User | null> {
    // One statement: two sign-ups with the same email can't both succeed.
    const [user] = await this.db
      .insert(users)
      .values({ email: normalize(email), passwordHash })
      .onConflictDoNothing({ target: users.email })
      .returning(columns);
    return user ?? null;
  }

  async findById(id: string): Promise<User | null> {
    const [user] = await this.db.select(columns).from(users).where(eq(users.id, id));
    return user ?? null;
  }

  /** For password sign-in only. */
  async findCredentials(email: string): Promise<{ user: User; passwordHash: string } | null> {
    const [row] = await this.db.select().from(users).where(eq(users.email, normalize(email)));
    if (!row) {
      return null;
    }
    const { passwordHash, ...user } = row;
    return { user, passwordHash };
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.db.update(users).set({ passwordHash }).where(eq(users.id, id));
  }
}

const normalize = (email: string) => email.trim().normalize('NFC').toLowerCase();

```

`GET /me` 返回已登录用户。`@CurrentUser()` 注入了认证守卫为请求加载的用户：

```typescript title="src/users/me.controller.ts"
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

用户模块注册了控制器和仓储，并为认证代码导出了仓储：

```typescript title="src/users/users.module.ts"
import { Module } from '@nestjs/common';
import { MeController } from './me.controller.js';
import { UsersRepository } from './users.repository.js';

@Module({
  controllers: [MeController],
  providers: [UsersRepository],
  exports: [UsersRepository],
})
export class UsersModule {}

```

只需告诉包一次您的用户类型，`@CurrentUser('id')` 仅接受 `User` 的键：

```typescript title="src/auth/auth-types.ts"
import type { User } from '../users/user.js';

declare module '@nestjs/authentication' {
  interface AuthenticationTypes {
    user: User;
  }
}

```

##### 密码和令牌

`PasswordHasher` 使用来自 `node:crypto` 的 scrypt 对密码进行哈希，遵循 OWASP 推荐的参数，在 libuv 线程池上。一个服务封装了控制器所需的两个东西：

```typescript title="src/auth/credentials.service.ts"
import { ConflictException, Injectable } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import type { User } from '../users/user.js';
import { UsersRepository } from '../users/users.repository.js';

@Injectable()
export class CredentialsService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async register(email: string, password: string): Promise<User> {
    const user = await this.usersRepository.create(email, await this.passwordHasher.hash(password));
    if (!user) {
      throw new ConflictException('Email already registered');
    }
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

`verify()` 始终调用 `passwordHasher.verify()`，即使没有这样的用户。提前返回未知电子邮件将花费几毫秒，而错误的密码则需要几百毫秒，任何人都可以从响应时间判断哪些电子邮件有账户。

一个**凭证提供者**将请求转换为用户。`JwtBearerProvider` 读取 `Authorization` 头部，检查令牌签名、`exp`、`iss` 和 `aud`，并将验证后的声明传递给您的 `validate()`，该 `validate()` 加载用户：

```typescript title="src/auth/jwt-auth.provider.ts"
import { Injectable } from '@nestjs/common';
import { AuthenticationRegistry, JwtBearerProvider, type JwtClaims } from '@nestjs/authentication';
import type { User } from '../users/user.js';
import { UsersRepository } from '../users/users.repository.js';

@Injectable()
export class JwtAuth extends JwtBearerProvider<User> {
  constructor(
    private readonly usersRepository: UsersRepository,
    registry: AuthenticationRegistry,
  ) {
    // The key, issuer and audience come from the `accessToken` options.
    super({ realm: 'notes' });
    registry.registerProvider(this);
  }

  // Called once the signature, `exp`, `iss` and `aud` checked out.
  // Returning null (the user was deleted) rejects the token.
  validate({ sub }: JwtClaims) {
    return sub ? this.usersRepository.findById(sub) : null;
  }
}

```

登录路由的请求体：

```typescript title="src/auth/auth.schemas.ts"
import { z } from 'zod';

export const signUpSchema = z.object({
  email: z.email(),
  password: z.string().min(12).max(128),
});
export type SignUpDto = z.infer<typeof signUpSchema>;

// No minimum here: a password set under an older rule still signs in.
export const signInSchema = z.object({
  email: z.email(),
  password: z.string().max(128),
});
export type SignInDto = z.infer<typeof signInSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;

```

控制器使用 `TokenService` 发出令牌：

```typescript title="src/auth/auth.controller.ts"
import { Body, Controller, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { Public, TokenService } from '@nestjs/authentication';
import {
  refreshTokenSchema,
  signInSchema,
  signUpSchema,
  type RefreshTokenDto,
  type SignInDto,
  type SignUpDto,
} from './auth.schemas.js';
import { CredentialsService } from './credentials.service.js';

@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly tokenService: TokenService,
  ) {}

  @Post('sign-up')
  async signUp(@Body({ schema: signUpSchema }) body: SignUpDto) {
    const user = await this.credentialsService.register(body.email, body.password);
    return this.tokenService.issue(user.id, { method: 'password', claims: { amr: ['pwd'] } });
  }

  @Post('token')
  @HttpCode(200)
  async token(@Body({ schema: signInSchema }) body: SignInDto) {
    const user = await this.credentialsService.verify(body.email, body.password);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.tokenService.issue(user.id, { method: 'password', claims: { amr: ['pwd'] } });
  }

  // An unknown, expired or reused refresh token gets a 401.
  @Post('token/refresh')
  @HttpCode(200)
  refresh(@Body({ schema: refreshTokenSchema }) body: RefreshTokenDto) {
    return this.tokenService.refresh(body.refreshToken);
  }

  // Signs this device out. Unknown tokens get the same answer, as in RFC 7009.
  @Post('token/revoke')
  @HttpCode(204)
  async revoke(@Body({ schema: refreshTokenSchema }) body: RefreshTokenDto) {
    await this.tokenService.revoke(body.refreshToken);
  }
}

```

- `@Public()` 在类上跳过了这四个路由的认证。应用程序的其他所有路由都需要有效的访问令牌。
- `POST` 路由默认回答 `201 Created`。为现有账户颁发令牌不会创建任何内容，因此 `token` 和 `refresh` 设置 `@HttpCode(200)`。
- `issue()` 返回一个使用下一步骤的 `accessToken` 选项签名的访问令牌、一个刷新令牌和 `expiresIn`（访问令牌的生命周期，单位为秒）。`refresh()` 使用刷新令牌并返回其后继者以及一个新的访问令牌。如果返回了一个已使用的刷新令牌，则两个方（窃贼和客户端）都持有它，因此该包撤销整个家族，双方都必须重新登录。参见 [Issue tokens to the mobile app](/security/authentication#issue-tokens-to-the-mobile-app)。

##### 存储刷新令牌

刷新令牌是状态，该包通过您注册的存储来保持状态。如果没有存储，它将将它们保存在内存中，重启时会丢失，并且实例之间不会共享，而当 `NODE_ENV` 设置为 `production` 时，它会拒绝以这种方式启动。该存储使用 Drizzle 实现 `RefreshTokenStore`，并从其构造函数中注册自身：

```typescript title="src/auth/drizzle-refresh-token.store.ts"
import { Injectable } from '@nestjs/common';
import { AuthenticationStorage, type RefreshTokenRecord, type RefreshTokenStore } from '@nestjs/authentication';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, isNull, lte } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { refreshTokens } from '../database/schema.js';

/** Refresh tokens in PostgreSQL, shared by every instance of the API. */
@Injectable()
export class DrizzleRefreshTokenStore implements RefreshTokenStore {
  constructor(
    @InjectDrizzle() private readonly db: NodePgDatabase,
    storage: AuthenticationStorage,
  ) {
    storage.registerSource({ refreshTokens: this });
  }

  async getRefreshToken(id: string): Promise<RefreshTokenRecord | undefined> {
    const [row] = await this.db.select().from(refreshTokens).where(eq(refreshTokens.id, id));
    if (!row) {
      return undefined;
    }
    const { revoked: _, usedAt, claims, ...token } = row;
    return { ...token, usedAt: usedAt ?? undefined, claims: claims ?? undefined };
  }

  async saveRefreshToken(record: RefreshTokenRecord): Promise<void> {
    await this.db.insert(refreshTokens).values(record);
    // Families past their absolute lifetime can go.
    await this.db.delete(refreshTokens).where(lte(refreshTokens.familyExpiresAt, record.createdAt));
  }

  async markRefreshTokenUsed(id: string, at: Date): Promise<boolean> {
    // Conditional: of two refreshes with the same token, one updates the row.
    const updated = await this.db
      .update(refreshTokens)
      .set({ usedAt: at })
      .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.usedAt)))
      .returning({ id: refreshTokens.id });
    return updated.length === 1;
  }

  async revokeRefreshTokenFamily(familyId: string): Promise<void> {
    await this.db.update(refreshTokens).set({ revoked: true }).where(eq(refreshTokens.familyId, familyId));
  }

  async isRefreshTokenFamilyRevoked(familyId: string): Promise<boolean> {
    const revoked = await this.db
      .select({ id: refreshTokens.id })
      .from(refreshTokens)
      .where(and(eq(refreshTokens.familyId, familyId), eq(refreshTokens.revoked, true)))
      .limit(1);
    return revoked.length > 0;
  }

  async revokeUserRefreshTokens(userId: string): Promise<void> {
    await this.db.update(refreshTokens).set({ revoked: true }).where(eq(refreshTokens.userId, userId));
  }
}

```

`markRefreshTokenUsed()` 是最重要的方法。它是一个条件 `UPDATE`，因此当窃贼和客户端同时使用相同令牌刷新时，只有一个获胜，另一个尝试会被撤销整个家族。一个先读取行、检查 `usedAt` 然后再写入的存储将允许两者通过。[The store contract](/security/authentication#the-store-contract) 列出了每个方法的规则，本教程末尾的 [tests](/tutorials/rest-api-jwt-authentication#test-it) 进行了检查。

```typescript title="src/auth/auth.module.ts"
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { CredentialsService } from './credentials.service.js';
import { DrizzleRefreshTokenStore } from './drizzle-refresh-token.store.js';
import { JwtAuth } from './jwt-auth.provider.js';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [JwtAuth, CredentialsService, DrizzleRefreshTokenStore],
})
export class AuthModule {}

```

##### 注册模块

在根模块中注册 `AuthenticationModule`，并提供访问令牌的键、签发者、受众和有效期，以及刷新令牌的有效期：

```typescript title="src/app.module.ts"
import { AuthenticationModule } from '@nestjs/authentication';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
// ...

@Module({
  imports: [
    ObserveModule.forRoot({
      // ...
    }),
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    DrizzleModule.forRootAsync({
      // ...
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
    UsersModule,
    AuthModule,
    NotesModule,
  ],
  providers: [{ provide: APP_PIPE, useClass: StandardSchemaValidationPipe }],
})
export class AppModule {}

```

使用密钥作为键时，令牌使用 HS256 进行签名。访问令牌的有效期为 15 分钟，刷新令牌的有效期为 30 天，刷新令牌家族的有效期最长为 90 天，但会根据需要轮换。有效期可以是毫秒或字符串，例如 `'15m'`；与 `@nestjs/jwt` 不同，纯数字不是秒。

##### 笔记归其所有者所有

每个笔记查询现在都包含所有者。该服务将用户的 id 作为第一个参数：

```typescript title="src/notes/notes.service.ts"
import { and, desc, eq } from 'drizzle-orm';
// ...

@Injectable()
export class NotesService {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  findAll(ownerId: string, { limit, offset }: ListNotesQuery): Promise<Note[]> {
    return this.db
      .select()
      .from(notes)
      .where(eq(notes.ownerId, ownerId))
      .orderBy(desc(notes.createdAt), desc(notes.id))
      .limit(limit)
      .offset(offset);
  }

  async findOne(ownerId: string, id: string): Promise<Note> {
    const [note] = await this.db.select().from(notes).where(this.owned(ownerId, id));
    return note ?? notFound();
  }

  async create(ownerId: string, dto: CreateNoteDto): Promise<Note> {
    const [note] = await this.db
      .insert(notes)
      .values({ ...dto, ownerId })
      .returning();
    return note;
  }

  async update(ownerId: string, id: string, dto: UpdateNoteDto): Promise<Note> {
    // One conditional statement: no read-then-write window, and another
    // user's note is as missing as one that doesn't exist.
    const [note] = await this.db
      .update(notes)
      .set({ ...dto, updatedAt: new Date() })
      .where(this.owned(ownerId, id))
      .returning();
    return note ?? notFound();
  }

  async remove(ownerId: string, id: string): Promise<void> {
    const deleted = await this.db.delete(notes).where(this.owned(ownerId, id)).returning({ id: notes.id });
    if (deleted.length === 0) {
      notFound();
    }
  }

  private owned(ownerId: string, id: string) {
    return and(eq(notes.id, id), eq(notes.ownerId, ownerId));
  }
}

```

所有者是每个语句的 `WHERE` 子句的一部分，而不是在读取后检查的，因此没有遗漏，也没有检查和写入之间的窗口。其他人（非所有者）的笔记会返回 404，与不存在的笔记返回的答案相同，这不会泄露哪些 id 正在使用。

控制器传递已登录用户的 id，使用 `@CurrentUser('id')`：

```typescript title="src/notes/notes.controller.ts"
import { CurrentUser } from '@nestjs/authentication';
// ...

@Controller('notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  findAll(@CurrentUser('id') userId: string, @Query({ schema: listNotesQuerySchema }) query: ListNotesQuery) {
    return this.notesService.findAll(userId, query);
  }

  @Get(':id')
  findOne(@CurrentUser('id') userId: string, @Param('id', noteId) id: string) {
    return this.notesService.findOne(userId, id);
  }

  @Post()
  create(@CurrentUser('id') userId: string, @Body({ schema: createNoteSchema }) dto: CreateNoteDto) {
    return this.notesService.create(userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id', noteId) id: string,
    @Body({ schema: updateNoteSchema }) dto: UpdateNoteDto,
  ) {
    return this.notesService.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser('id') userId: string, @Param('id', noteId) id: string) {
    return this.notesService.remove(userId, id);
  }
}

```

重启应用程序。启动时，模块会记录提供者链以及刷新令牌的存储位置：

```bash
LOG [AuthenticationModule] AuthenticationRegistry: providers JwtAuth
LOG [AuthenticationModule] AuthenticationStorage: DrizzleRefreshTokenStore (refreshTokens)

```

没有令牌的请求会返回 401，说明 API 接受的内容：

```bash
$ curl -i localhost:3000/notes
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="notes"
{"message":"Unauthorized","statusCode":401,"errorCode":"missing_credentials"}

```

注册。响应中包含令牌（此处和下方缩短）：

```bash
$ curl localhost:3000/auth/sign-up --json '{"email":"ada@example.com","password":"correct horse battery"}'
{"accessToken":"eyJhbGciOiJIUzI1NiIs...","refreshToken":"6fUCXRhy1e5O-3wb...","expiresIn":900}

```

使用访问令牌访问笔记：

```bash
$ TOKEN=eyJhbGciOiJIUzI1NiIs...
$ curl localhost:3000/notes -H "Authorization: Bearer $TOKEN" --json '{"title":"Ship the guide"}'
{"id":"30694f2b-551c-40ab-b0ed-f789acd6381b","ownerId":"43bec047-ad99-4c34-b3e7-3f415127213d","title":"Ship the guide","body":"","createdAt":"2026-11-19T19:57:21.213Z","updatedAt":"2026-11-19T19:57:21.213Z"}
$ curl localhost:3000/me -H "Authorization: Bearer $TOKEN"
{"id":"43bec047-ad99-4c34-b3e7-3f415127213d","email":"ada@example.com","createdAt":"2026-11-19T19:57:21.095Z"}

```

注册的第二个用户会收到 Ada 笔记的 404 错误和一个空列表。当访问令牌过期时，客户端用刷新令牌换取新的令牌。重复使用同一个刷新令牌会撤销其家族，因此即使是后续的令牌也会失效：

```bash
$ curl localhost:3000/auth/token/refresh --json '{"refreshToken":"6fUCXRhy1e5O-3wb..."}'
{"accessToken":"eyJhbGciOiJIUzI1NiIs...","refreshToken":"6CnPc_hiBJUwDubp...","expiresIn":900}
$ curl localhost:3000/auth/token/refresh --json '{"refreshToken":"6fUCXRhy1e5O-3wb..."}'
{"message":"Refresh token reused","error":"Unauthorized","statusCode":401}
$ curl localhost:3000/auth/token/refresh --json '{"refreshToken":"6CnPc_hiBJUwDubp..."}'
{"message":"Refresh token invalid","error":"Unauthorized","statusCode":401}

```

篡改或过期的访问令牌会返回 401，并告知客户端原因，如 RFC 6750 所述：

```bash
WWW-Authenticate: Bearer realm="notes", error="invalid_token", error_description="invalid signature"

```

#### 速率限制登录

没有任何东西可以阻止脚本以服务器响应的速度尝试密码。[`@nestjs/throttler`](/security/rate-limiting) 限制请求速率：

```bash
$ npm i --save @nestjs/throttler

```

仅按 IP 地址限制过于粗略，因为位于同一办公室或运营商地址的用户会共享该限制。使用两个 [throttler definitions](/security/rate-limiting#多重限流器定义)，就像 [authentication chapter](/security/authentication#rate-limit-sign-in) 所做的那样。`default` 按每个路由的 IP 地址计数，而 `account` 在请求体中指定账户的任何地方都按电子邮件和 IP 地址计数：

```typescript title="src/auth/account-email.ts"
/** The address the request body names, trimmed, lowercased and in Unicode NFC, or `''`. */
export function accountEmail(req: { body?: { email?: unknown } }): string {
  const email = req.body?.email;
  return typeof email === 'string' ? email.trim().normalize('NFC').toLowerCase() : '';
}

```

在根模块中注册这两个定义，并将 `ThrottlerGuard` 作为全局守卫：

```typescript title="src/app.module.ts"
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, minutes, normalizeIp } from '@nestjs/throttler';
import { accountEmail } from './auth/account-email.js';
// ...

@Module({
  imports: [
    // ...
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
    NotesModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: StandardSchemaValidationPipe },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

```

节流器的守卫在根模块中注册，因此它在认证守卫之前运行，猜测令牌的请求也会计入限制。收紧登录路由：

```typescript title="src/auth/auth.controller.ts"
import { SkipThrottle, Throttle, hours, minutes } from '@nestjs/throttler';
// ...

@SkipThrottle({ account: true })
@Throttle({ default: { limit: 10, ttl: hours(1) } })
@Post('sign-up')
// ...

@Throttle({
  default: { limit: 30, ttl: minutes(15) },
  account: { limit: 5, ttl: minutes(15) },
})
@Post('token')
// ...

```

注册时每次都会生成一个新的地址，因此会跳过 `account` 限制，而是按 IP 地址限制。对于一个账户，五个错误的密码后，第六次尝试会收到 429 错误，而其他账户仍可从同一地址登录：

```bash
$ curl -i localhost:3000/auth/token --json '{"email":"dave@example.com","password":"guess 6"}'
HTTP/1.1 429 Too Many Requests
Retry-After-account: 900
{"statusCode":429,"message":"ThrottlerException: Too Many Requests"}

```

> info **提示** 节流器默认在内存中计数，因此每个实例都会独立计数。如果有多个实例，请使用共享的 [storage](/security/rate-limiting#存储)，例如 Redis。在负载均衡器后，将 `trustProxy` 选项传递给 `NodeAdapter`（参见 [Node adapter options](/techniques/performance#node-adapter-options)），以便跟踪器看到客户端的地址而不是代理的地址。

#### 设置安全标头和 CORS

另外两个设置应放在浏览器调用的任何 API 的边缘。安全标头指示浏览器开启保护措施，例如拒绝将页面嵌入框架，或猜测响应的内容类型。CORS 决定了哪些网站的脚本可以从访问者的浏览器调用 API 并读取响应。

`app.useSecurityHeaders()` 自 v12.1 起内置于 Nest，会发送 [Helmet](https://helmetjs.github.io/) 所发送的标头，默认情况下无需任何包（参见 [Security headers](/security/helmet)）。在创建应用程序后立即调用它，以便其标头包含在每个响应中，包括错误响应。CORS 从配置中获取源：

```typescript title="src/main.ts"
// ...

const app = await NestFactory.create<NestNodeApplication>(AppModule, new NodeAdapter(), {
  instrument: ObserveInstrument,
});
app.useSecurityHeaders();
app.enableShutdownHooks();

const config = app.get<ConfigService<Env, true>>(ConfigService);
app.enableCors({ origin: config.get('CORS_ORIGINS', { infer: true }) });

await app.listen(config.get('PORT', { infer: true }));

```

源是一个逗号分隔的变量，配置模式将其转换为 URL 列表，如果不是 URL 则在启动时拒绝：

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
});

export type Env = z.infer<typeof envSchema>;

```

在 `.env` 中列出您的 Web 应用程序的源：

```bash
CORS_ORIGINS=https://app.example.com

```

- **默认不允许任何源。** 如果不调用 `origin`，`enableCors()` 会向每个网站返回 `Access-Control-Allow-Origin: *`，因此已登录用户访问的任何页面都可以从其浏览器调用 API 并读取响应（参见 [Default allowed origins](/security/cors#default-allowed-origins)）。如果列表为空，则任何网站都不能；`curl`、移动应用和其他服务器不受影响，因为 CORS 由浏览器强制执行。
- **不使用 `credentials` 选项。** API 使用 bearer 令牌进行认证，Web 应用程序将其放在 `Authorization` 标头中。Cookie 和随之而来的 `credentials: true` 不涉及。
- **Swagger UI 保持工作。** 它从应用程序加载其脚本和样式表，默认的 `Content-Security-Policy` 允许此操作。但是，如果通过纯 HTTP 从任何地方提供服务，其资源将被升级到 HTTPS 并且加载失败；参见 [Swagger UI and GraphQL IDEs](/security/helmet#swagger-ui-and-graphql-ides)。

每个响应现在都携带这些标头（此处省略部分）：

```bash
$ curl -i localhost:3000/health/live
HTTP/1.1 200 OK
Content-Security-Policy: default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Referrer-Policy: no-referrer
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
...

```

浏览器在进行跨域 `PATCH` 之前会询问，并携带 `Authorization` 标头。列出的源会获得其响应：

```bash
$ curl -i -X OPTIONS localhost:3000/notes -H "Origin: https://app.example.com" -H "Access-Control-Request-Method: PATCH" -H "Access-Control-Request-Headers: authorization,content-type"
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://app.example.com
Vary: Origin, Access-Control-Request-Headers
Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE
Access-Control-Allow-Headers: authorization,content-type

```

任何其他源都不会获得 `Access-Control-Allow-Origin` 标头，因此其浏览器会拒绝发送请求：

```bash
$ curl -i -X OPTIONS localhost:3000/notes -H "Origin: https://evil.example" -H "Access-Control-Request-Method: PATCH" -H "Access-Control-Request-Headers: authorization"
HTTP/1.1 204 No Content
Vary: Origin, Access-Control-Request-Headers
Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE
Access-Control-Allow-Headers: authorization

```

#### 使用 OpenAPI 描述 API

[`@nestjs/swagger`](/openapi/introduction) 从控制器生成 OpenAPI 文档。Zod 4.2 及更高版本暴露了 JSON Schema 本身，因此请求体和查询参数来自验证它们的相同模式，无需配置（参见 [Standard Schema](/openapi/introduction#standard-schema-zod-valibot)）：

```bash
$ npm i --save @nestjs/swagger

```

构建文档并从 `main.ts` 提供 Swagger UI。`addSecurityRequirements('bearer')` 声明每个操作都需要 bearer 令牌，这就是 API 的行为方式：认证守卫是全局的，只有标记为 `@Public()` 的路由会跳过它：

```typescript title="src/main.ts"
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
// ...

const app = await NestFactory.create<NestNodeApplication>(AppModule, new NodeAdapter(), {
  instrument: ObserveInstrument,
});
app.useSecurityHeaders();
// ...

const document = new DocumentBuilder()
  .setTitle('Notes API')
  .setVersion('1.0')
  .addBearerAuth()
  .addSecurityRequirements('bearer')
  .build();
SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, document));

```

Swagger 不知道 `@Public()`，因此也要标记公共路由。使用空要求设置 `@ApiSecurity()` 会告诉 OpenAPI 该操作不需要认证，并且 Swagger UI 旁边不会显示锁：

```typescript title="src/auth/auth.controller.ts"
import { ApiSecurity } from '@nestjs/swagger';
// ...

@Public()
@ApiSecurity({})
@Controller('auth')
export class AuthController {
  // ...
}

```

Swagger UI 位于 `http://localhost:3000/docs`，文档位于 `http://localhost:3000/docs-json`。在 **Authorize** 下输入令牌，Swagger UI 会将其与每个需要令牌的请求一起发送。那里的 `POST /notes` 主体是转换后的 Zod 模式：

```json
{
  "type": "object",
  "properties": {
    "title": { "type": "string", "minLength": 1, "maxLength": 200 },
    "body": { "default": "", "type": "string", "maxLength": 10000 }
  },
  "required": ["title"]
}

```

#### 添加健康检查

容器平台会问两个问题：进程是否存活，以及当前是否可以提供请求。[`@nestjs/terminus`](/recipes/terminus) 同时回答了这两个问题：

```bash
$ npm i --save @nestjs/terminus

```

Terminus 没有 Drizzle 的指示器，因此就绪性检查会通过一个 [custom indicator](/recipes/terminus#custom-health-indicator) 执行查询：

```typescript title="src/health/database.health.ts"
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { HealthIndicatorService } from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @InjectDrizzle() private readonly db: NodePgDatabase,
  ) {}

  isHealthy(key: string) {
    return this.healthIndicatorService
      .check(key)
      .attempt(async () => {
        await this.db.execute(sql`select 1`);
      })
      .withTimeout('1s');
  }
}

```

控制器暴露了这两个检查，它们是公共的并且不受速率限制：

```typescript title="src/health/health.controller.ts"
import { Controller, Get } from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import { ApiSecurity } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { DatabaseHealthIndicator } from './database.health.js';

@Public()
@ApiSecurity({})
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
  ) {}

  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([() => this.database.isHealthy('database')]);
  }
}

```

健康模块导入 Terminus 并提供指示器：

```typescript title="src/health/health.module.ts"
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './database.health.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator],
})
export class HealthModule {}

```

将 `HealthModule` 添加到 `AppModule` 的导入中。这些检查是公共的，并且跳过速率限制，因为平台每隔几秒调用它们。存活性检查不查看数据库：重启不会修复它。当数据库停止响应时，就绪性检查在其一秒的超时内失败，平台会停止向该实例发送流量，直到它再次通过：

```bash
$ curl localhost:3000/health/ready
{"status":"ok","info":{"database":{"responseTime":2,"status":"up"}},"error":{},"details":{"database":{"responseTime":2,"status":"up"}}}
$ docker pause notes-db
$ curl -i localhost:3000/health/ready
HTTP/1.1 503 Service Unavailable
{"status":"error","info":{},"error":{"database":{"message":"timeout of 1000ms exceeded","responseTime":1001,"status":"down"}},"details":{"database":{"message":"timeout of 1000ms exceeded","responseTime":1001,"status":"down"}}}
$ docker unpause notes-db

```

#### 以 JSON 记录日志

在开发环境中，Nest 的日志记录可读的行。在生产环境中，平台收集进程写入 stdout 的内容，当每一行都是可按级别、上下文或任何字段过滤的 JSON 对象时，日志搜索会更有用。Nest 的 `ConsoleLogger` 本身写入 JSON（参见 [JSON logging](/application/logger#json-logging)）：

```typescript title="src/main.ts"
import { ConsoleLogger } from '@nestjs/common';
// ...

const production = process.env.NODE_ENV === 'production';
const app = await NestFactory.create<NestNodeApplication>(AppModule, new NodeAdapter(), {
  instrument: ObserveInstrument,
  logger: new ConsoleLogger({
    // One JSON object per line in production; readable text in development.
    json: production,
    // Masks these properties wherever they appear in a logged object.
    redact: ['password', 'authorization', 'accessToken', 'refreshToken'],
  }),
});
app.useSecurityHeaders();
// ...

```

- **在 `ConfigModule` 读取 `.env` 之前创建日志记录器**，因此它从进程环境读取 `NODE_ENV`，这是您的平台在生产环境中设置它的地方。
- **`redact` 是一个安全网。** 无论在日志对象中出现具有这些名称的属性的哪个深度和任何大小写，其值都将以 `"[REDACTED]"` 的形式写入。当有人在调试时记录整个请求体或标头时，密码和令牌将不会出现在日志中。它覆盖对象，而不是字符串：消息本身按原样打印，因此切勿将密钥插值到其中（参见 [Redacting sensitive values](/application/logger#redacting-sensitive-values)）。

值得保留的日志行：登录失败，地址作为结构化参数，而不是在消息中：

```typescript title="src/auth/auth.controller.ts"
import { Body, Controller, HttpCode, Logger, Post, UnauthorizedException } from '@nestjs/common';
// ...

export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  // ...
  async token(@Body({ schema: signInSchema }) body: SignInDto) {
    const user = await this.credentialsService.verify(body.email, body.password);
    if (!user) {
      this.logger.warn('Sign-in failed', { email: body.email });
      throw new UnauthorizedException('Invalid email or password');
    }
    // ...
  }
}

```

开发环境中的错误密码：

```bash
WARN [AuthController] Sign-in failed { email: 'ada@example.com' }

```

生产环境中的相同情况，使用 `NODE_ENV=production`：

```json
{"level":"warn","pid":19998,"timestamp":1795163181664,"message":"Sign-in failed","context":"AuthController","params":{"email":"ada@example.com"}}

```

现在日志搜索可以按地址统计登录失败次数，这是您在速率限制下发现有人猜测某个账户的方式。安装了 [NestJS Observe](/observability/overview) 后，请求期间写入的每一行都带有该请求的跟踪 ID（参见 [Logging in production](/application/logger#logging-in-production)）。

#### 测试它

端到端测试启动了真实的 `AppModule`，并进行了两个更改。数据库是 [PGlite](https://pglite.dev)，是编译为 WebAssembly 的 PostgreSQL，应用了真实的迁移，因此测试不需要服务器。并且 `PasswordHasher` 使用了更便宜的 scrypt 成本，因为默认成本需要几百毫秒和每个哈希 128 MiB 的内存，这是故意的。测试使用标准 Nest 项目的 Vitest 设置，并使用 `app.inject()` 发送请求，这是 Node 适配器提供的，因此它们也不需要监听服务器：

```bash
$ npm i --save-dev @nestjs/testing vitest vite @electric-sql/pglite

```

测试配置为应用程序提供了其在启动时验证的环境：

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
    },
  },
});

```

测试涵盖了无令牌的请求、仅所有者可见的记录以及刷新令牌轮换：

```typescript title="test/notes.e2e-spec.ts"
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { PasswordHasher } from '@nestjs/authentication';
import { getDrizzleToken } from '@nestjs/drizzle';
import { NodeAdapter, type NestNodeApplication } from '@nestjs/platform-node';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { AppModule } from '../src/app.module.js';

describe('Notes API (e2e)', () => {
  const pglite = new PGlite(); // PostgreSQL in-process: no server to start
  let app: NestNodeApplication;

  beforeAll(async () => {
    const db = drizzle({ client: pglite });
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
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

  afterAll(async () => {
    await app.close();
    await pglite.close();
  });

  async function signUp(email: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email, password: 'correct horse battery' },
    });
    expect(res.statusCode).toBe(201);
    return res.json<{ accessToken: string; refreshToken: string }>();
  }

  it('rejects requests without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/notes' });
    expect(res.statusCode).toBe(401);
  });

  it('creates, updates and lists notes for their owner only', async () => {
    const ada = await signUp('ada@example.com');
    const bob = await signUp('bob@example.com');
    const asAda = { authorization: `Bearer ${ada.accessToken}` };
    const asBob = { authorization: `Bearer ${bob.accessToken}` };

    const created = await app.inject({
      method: 'POST',
      url: '/notes',
      headers: asAda,
      payload: { title: 'Buy milk', body: '2 litres' },
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json<{ id: string }>();

    const nulled = await app.inject({ method: 'PATCH', url: `/notes/${id}`, headers: asAda, payload: { title: null } });
    expect(nulled.statusCode).toBe(400);

    const renamed = await app.inject({ method: 'PATCH', url: `/notes/${id}`, headers: asAda, payload: { title: 'Buy oat milk' } });
    expect(renamed.json()).toMatchObject({ title: 'Buy oat milk', body: '2 litres' });

    const stolen = await app.inject({ method: 'GET', url: `/notes/${id}`, headers: asBob });
    expect(stolen.statusCode).toBe(404);
    const bobsList = await app.inject({ method: 'GET', url: '/notes', headers: asBob });
    expect(bobsList.json()).toEqual([]);
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const { refreshToken } = await signUp('carol@example.com');
    const refresh = (token: string) =>
      app.inject({ method: 'POST', url: '/auth/token/refresh', payload: { refreshToken: token } });

    const first = await refresh(refreshToken);
    expect(first.statusCode).toBe(200);
    const successor = first.json<{ refreshToken: string }>().refreshToken;

    expect((await refresh(refreshToken)).statusCode).toBe(401); // reused: the family is revoked
    expect((await refresh(successor)).statusCode).toBe(401);
  });
});

```

PGlite 只有一个连接，因此两个请求在那里永远不会真正竞争。刷新令牌存储的保证是关于竞争的，因此请在真实的 PostgreSQL 服务器上，使用连接池，针对 `@nestjs/authentication/testing` 提供的案例测试存储本身。`concurrent: true` 添加了单个令牌的并行刷新，而读取后写入的存储会失败：

```typescript title="test/refresh-token.store.e2e-spec.ts"
import { fileURLToPath } from 'node:url';
import { AuthenticationStorage } from '@nestjs/authentication';
import { authenticationStoreContract } from '@nestjs/authentication/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { DrizzleRefreshTokenStore } from '../src/auth/drizzle-refresh-token.store.js';

// A real PostgreSQL with a pool, where parallel calls really race.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleRefreshTokenStore', () => {
  const pool = new Pool({ connectionString: url });
  const db = drizzle({ client: pool });

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
  });
  afterAll(() => pool.end());

  /** The store on an empty table, registered nowhere: the suite builds its own registry. */
  async function emptyStore() {
    await pool.query('TRUNCATE refresh_tokens');
    return { refreshTokens: new DrizzleRefreshTokenStore(db, new AuthenticationStorage()) };
  }

  for (const c of authenticationStoreContract(emptyStore, { contracts: ['refreshTokens'], concurrent: true })) {
    it(c.name, c.run);
  }
});

```

将脚本添加到 `package.json`，并针对它们自己的数据库运行两者（存储测试会截断其表）：

```json
"test:e2e": "vitest run --config ./vitest.config.e2e.ts"

```

先创建测试数据库一次，然后运行两个文件：

```bash
$ docker exec notes-db psql -U postgres -c "CREATE DATABASE notes_test"
$ TEST_DATABASE_URL=postgres://postgres:notes@localhost:5432/notes_test npm run test:e2e

 Test Files  2 passed (2)
      Tests  8 passed (8)

```

#### 生产检查清单

- **将 `NODE_ENV` 设置为 `production`。** 认证模块将拒绝启动，前提是它使用的功能没有存储，而不是将令牌保留在某个进程的内存中。
- **将 `JWT_SECRET` 保存在您平台的密钥存储中**，在运行时注入，而不是在镜像或已提交的 `.env` 文件中。拥有它的人可以为任何用户签署令牌。
- **将 `drizzle-kit migrate` 作为发布步骤运行**，在新版本启动之前，而不是从每个实例在启动时运行。
- **将 `CORS_ORIGINS` 设置为您的 Web 应用程序的源**，包含其方案（`https://`）且无路径。如果没有浏览器调用 API，则留空。
- **使用您平台的日志驱动从 stdout 收集 JSON 日志**，而不是从进程写入文件。
- **当运行多于一个实例时，为节流器使用共享存储**，并将 `trustProxy` 传递给负载均衡器后的 `NodeAdapter`。
- **为 scrypt 调整服务器大小。** 默认成本下的每个哈希使用 128 MiB，在 libuv 线程池上（除非您设置 `UV_THREADPOOL_SIZE`，否则为四个线程）。登录突发会排队，节流器会限制它们。
- **将平台的探针指向健康检查**：存活性在 `/health/live`，就绪性在 `/health/ready`。已启用关闭钩子，因此部署的 `SIGTERM` 会在进程退出前关闭服务器和连接池。
- **为生产环境提供自己的 Observe 密钥对**，来自项目的 **API 密钥** 页面，作为平台环境中的 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET`：`start:prod` 不加载 `.env`。然后 [NestJS Observe](/observability/overview) 会记录每个路由的请求及其延迟和失败率，记录每个请求的跟踪信息及其 SQL 查询，并将未处理的错误分组为缺陷，当出现新缺陷时发送电子邮件（参见 [Error monitoring](https://docs.nestjs.com/observability/error-monitoring)）。已启用关闭钩子，因此 SDK 在部署的 `SIGTERM` 时发送最后一批数据。
- **决定密码重置或设备被盗的终点。** `TokenService.revokeAll()` 会撤销用户的每个刷新令牌，并且已签发的访问令牌将在 15 分钟内过期。

[authentication chapter's checklist](/security/authentication#production-checklist) 涵盖了其余部分，适用于 API 为 Web 应用程序添加会话、电子邮件验证或双因素认证的情况。

#### 下一步

该 API 包含了大多数生产级 API 所需的组成部分，并且每个部分都可以从其章节中扩展：

- 允许用户重置忘记的密码并验证其电子邮件地址：[Authentication](/security/authentication#verify-email-addresses)。
- 共享笔记，并对每个记录进行权限检查：[Authorization](/security/authorization)。
- 发送电子邮件或在后台运行工作：[Mail](/application/mail) 和 [Queues](/techniques/queues)。
- 查看其在生产环境中的行为，逐个请求地查看：[Observability](/observability/overview)。
- 在相同的基础之上构建：一个 [e-commerce backend](/tutorials/ecommerce-backend)，一个 [multi-tenant SaaS backend](/tutorials/multi-tenant-saas)，一个 [project-management API](/tutorials/project-management-api)，一个 [real-time chat backend](/tutorials/realtime-chat)，一个 [booking system](/tutorials/booking-system)，[emails and background jobs](/tutorials/background-jobs)，一个 [file upload service](/tutorials/file-uploads) 或一个 [AI chat backend](/tutorials/ai-chat-backend)。