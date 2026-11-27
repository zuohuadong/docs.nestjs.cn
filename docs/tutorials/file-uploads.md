<!-- 此文件从 content/tutorials/file-uploads.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:57:17.985Z -->
<!-- 源文件: content/tutorials/file-uploads.md -->
<!-- 源哈希: 9e9488ceb9e6c069470d01c91e260fda -->

### 构建一个 Node.js 文件上传服务

使用 NestJS 在 Node.js 中构建一个文件上传服务：带类型和大小检查的流式上传、S3 存储、每用户配额和可过期下载链接。

用户上传图片和 PDF 文档，通过 API 或在五分钟后过期的链接下载它们，并删除它们，每个用户都在自己的存储配额内。上传文件看起来像一行代码，而大多数出错的地方都围绕着它：一个声称是 PNG 但实际上是 HTML 页面的文件、一个驻留在内存中的 2 GB 上传、两个都恰好能装进最后一个可用兆字节的上传，以及磁盘上没有指向的剩余字节。本教程处理了所有这些问题，代码在笔记本文件夹和 S3 上是相同的。

到最后，API 将：

- 将每个上传直接流式传输到存储中，使用 [`@nestjs/storage`](/application/file-storage)，在检查其首字节类型和计算其大小的同时完成，因此内存中或临时文件中不进行缓冲或写入。
- 在开发环境中将文件保留在本地文件夹中，在生产环境中保留在 S3、R2 或 MinIO 中，仅通过配置实现。
- 在 PostgreSQL 中记录每个文件，只有所有者才能查看。
- 使用一个条件 `UPDATE` 约束每个用户遵守存储配额，因此同时运行的上传不能超过该配额。
- 使用正确的 `Content-Type` 和 `Content-Disposition` 流式传输下载，并提供在五分钟后过期的签名链接。
- 在删除文件字节之前删除文件记录，确保记录永不指向缺失的文件。

它从 [Build a REST API with JWT authentication](/tutorials/rest-api-jwt-authentication) 的 API 开始，该 API 使用访问和刷新令牌为用户签名，使用 Zod 验证请求，并通过 Drizzle 在 PostgreSQL 中保存数据。本教程不再解释这些部分。

这些是端点，以及添加每个端点的部分：

| 端点 | 部分 |
| --- | --- |
| `POST /auth/sign-up`, `POST /auth/token`, `POST /auth/token/refresh`, `POST /auth/token/revoke`, `GET /me`, `GET /health/live`, `GET /health/ready` | [Start from the JWT API](/tutorials/file-uploads#start-from-the-jwt-api) |
| `POST /files`, `GET /files`, `GET /files/:id` | [Accept uploads](/tutorials/file-uploads#accept-uploads) |
| `GET /me/storage` | [Stay within the quota](/tutorials/file-uploads#stay-within-the-quota) |
| `GET /files/:id/content`, `GET /files/:id/link`, `GET /downloads` | [Download files](/tutorials/file-uploads#download-files) |
| `DELETE /files/:id` | [Delete files](/tutorials/file-uploads#delete-files) |

> info **提示** 完成的应用在 GitHub 上是 [nestjs/example-file-uploads](https://github.com/nestjs/example-file-uploads)，包含其测试和 CI 工作流。

#### 从 JWT API 开始

创建项目，并安装本教程使用的所有内容。这些是 JWT 教程的包加上 `@nestjs/storage`：

```bash
$ npm i -g @nestjs/cli
$ nest new files-api --minimal
$ cd files-api
$ npm uninstall @nestjs/platform-express @types/express
$ npm i --save @nestjs/platform-node zod @nestjs/config @nestjs/drizzle drizzle-orm@rc pg @nestjs/authentication @nestjs/storage @nestjs/throttler @nestjs/swagger @nestjs/terminus
$ npm i --save-dev drizzle-kit@rc @types/pg @nestjs/testing vitest vite

```

然后从 [finished JWT tutorial](/tutorials/rest-api-jwt-authentication#sign-users-in-with-jwts) 复制这些文件，保持原样：

- `src/main.ts` 和 `drizzle.config.ts`
- `src/auth/`、`src/users/` 和 `src/health/` 下的所有内容
- `test/refresh-token.store.e2e-spec.ts`

排除 `src/notes/` 和 JWT 教程的 `drizzle/` 文件夹：该应用程序的第一个迁移来自其自身的模式，在下一节中。将注释重命名为文件中的名称：`JwtAuth` 中的 `realm`（`'files'`）以及 `main.ts` 中 OpenAPI 文档的标题。本教程中 `src/config.ts`、`src/app.module.ts` 和 `vitest.config.e2e.ts` 发生变化，并在下面完整展示。将测试脚本添加到 `package.json`：

```json
"test:e2e": "vitest run --config ./vitest.config.e2e.ts"

```

最后，像 JWT 教程中那样，在 `.env` 中添加数据库 URL 和一个 `JWT_SECRET`，使用应用程序自己的数据库：

```bash
$ docker run -d --name files-db -e POSTGRES_PASSWORD=files -e POSTGRES_DB=files -p 5432:5432 postgres:17

```

其 URL 放在 `.env` 中，紧邻签名密钥：

```bash
DATABASE_URL=postgres://postgres:files@localhost:5432/files
# Generate with: openssl rand -base64 32
JWT_SECRET=

```

该应用程序通过 `@nestjs/platform-node` 的上传拦截器使用 multer，该拦截器依赖于它，因此无需安装其他内容。它也不需要 `@types/multer`：上传文件的类型来自 `@nestjs/storage`。

#### 设计模式

整个模式在一个文件中。刷新令牌是 JWT 教程的。用户获得了两个列，并且一个表记录了文件：

```typescript title="src/database/schema.ts"
import { sql } from 'drizzle-orm';
import { bigint, boolean, check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
// Byte counts: a 32-bit integer stops at 2 GiB.
const bytes = (name: string) => bigint(name, { mode: 'number' });

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    // What the user's files take up, and how much they may store: 100 MiB unless changed.
    storageUsed: bytes('storage_used').notNull().default(0),
    storageQuota: bytes('storage_quota')
      .notNull()
      .default(100 * 1024 * 1024),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (table) => [check('users_storage_used_not_negative', sql`${table.storageUsed} >= 0`)],
);

export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Where the bytes are on the disk. The server picks it, never the client.
    key: text('key').notNull().unique(),
    // The client's file name, for downloads only.
    name: text('name').notNull(),
    // Detected from the bytes, not taken from the client.
    contentType: text('content_type').notNull(),
    size: bytes('size').notNull(),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (table) => [index('files_owner_id_created_at_idx').on(table.ownerId, table.createdAt)],
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

export type StoredFile = typeof files.$inferSelect;

```

- **字节存储在磁盘上；行记录了它们属于谁。** `key` 是文件在磁盘上的位置，没有通过具有正确 `owner_id` 的行记录是无法到达它的。客户端永远看不到键。
- **字节计数是 `bigint`。** PostgreSQL `integer` 止于 2 GiB，这很容易被一个用户的文件通过。`mode: 'number'` 将它们返回为 JavaScript 数字，精确到 8 PiB。
- **配额是一个列，而不是一个常量。** 拥有更大套餐的用户会获得更大的数字，而测试设置了一个较小的数字。
- **`storage_used` 不能低于零。** 服务从不尝试这样做，但如果未来的更改两次减去一个文件，PostgreSQL 会拒绝写入，而不是存储负使用量。
- **`content_type` 是字节的内容**，在上传时检测到。客户端的声明根本不被存储。

生成迁移并应用它（参见 [Migrations](https://docs.nestjs.com/data/drizzle#迁移)）：

```bash
$ npx drizzle-kit generate --name=files
$ npx drizzle-kit migrate

```

#### 配置存储

[`@nestjs/storage`](/application/file-storage) 将文件保存在命名的**磁盘**上，并提供一个用于所有磁盘的 API：`put()`、`get()`、`delete()`、`signedUrl()` 及其他。该应用程序有一个磁盘，即 `files`。在开发环境中它是一个文件夹；在生产环境中它是一个存储桶，因为容器在每次部署时都会丢失文件系统，并且 API 的实例不共享一个。

配置说明了哪些，并验证了每个所需的内容。本地磁盘会为其自身的下载链接签名，因此需要一个签名密钥；S3 磁盘需要一个存储桶：

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
    // Where clients reach the API: local download links point here.
    APP_URL: z.url().default('http://localhost:3000'),
    // 'local' in development, 's3' in production (AWS S3, Cloudflare R2, MinIO...).
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_ROOT: z.string().default('storage'),
    // Signs the local disk's download links: at least 32 characters.
    STORAGE_SIGNING_KEY: z.string().min(32).optional(),
    S3_BUCKET: z.string().min(1).optional(),
    S3_REGION: z.string().min(1).optional(),
    // For S3-compatible stores only; AWS S3 needs none.
    S3_ENDPOINT: z.url().optional(),
    S3_FORCE_PATH_STYLE: z.stringbool().default(false),
  })
  .refine((env) => env.STORAGE_DRIVER !== 'local' || env.STORAGE_SIGNING_KEY, {
    path: ['STORAGE_SIGNING_KEY'],
    message: 'Required when STORAGE_DRIVER is local',
  })
  .refine((env) => env.STORAGE_DRIVER !== 's3' || env.S3_BUCKET, {
    path: ['S3_BUCKET'],
    message: 'Required when STORAGE_DRIVER is s3',
  });

export type Env = z.infer<typeof envSchema>;

```

将密钥添加到 `.env`：

```bash
# Generate with: openssl rand -hex 32
STORAGE_SIGNING_KEY=

```

一个工厂根据配置构建磁盘：

```typescript title="src/storage/storage.config.ts"
import type { ConfigService } from '@nestjs/config';
import { LocalDisk, S3Disk, type StorageModuleOptions } from '@nestjs/storage';
import type { Env } from '../config.js';

/** One private disk, `files`: a local folder in development, a bucket in production. */
export function createStorageOptions(config: ConfigService<Env, true>): StorageModuleOptions {
  if (config.get('STORAGE_DRIVER', { infer: true }) === 's3') {
    return {
      disks: {
        // Credentials come from AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.
        files: new S3Disk({
          bucket: config.get('S3_BUCKET', { infer: true })!,
          region: config.get('S3_REGION', { infer: true }),
          endpoint: config.get('S3_ENDPOINT', { infer: true }),
          forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
        }),
      },
    };
  }
  return {
    disks: {
      files: new LocalDisk({
        root: config.get('STORAGE_ROOT', { infer: true }),
        // A folder can't sign URLs the way S3 does: the app signs them, and serves them at /downloads.
        signedUrls: {
          baseUrl: `${config.get('APP_URL', { infer: true })}/downloads`,
          keys: [config.get('STORAGE_SIGNING_KEY', { infer: true })!],
        },
      }),
    },
  };
}

```

- **本地磁盘将文件保留在项目目录下的 `STORAGE_ROOT`、`storage/` 中**，并在启动时创建它。将其添加到 `.gitignore`。
- **文件夹不能像 S3 那样预签名 URL**，因此使用 `signedUrls`，本地磁盘使用 HMAC-SHA256 在 `baseUrl` 下签名其自己的链接。应用程序在 [Download files](/tutorials/file-uploads#download-files) 的 `/downloads` 处提供它们。
- **S3 磁盘对于 AWS S3、Cloudflare R2 和 MinIO 使用相同的类。** [Use S3 in production](/tutorials/file-uploads#use-s3-in-production) 设置了它。

在根模块中注册 `StorageModule`，使用工厂。它是全局的，因此任何提供者都可以注入该磁盘。有了下一节的文件模块，根模块如下所示：

```typescript title="src/app.module.ts"
import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthenticationModule } from '@nestjs/authentication';
import { DrizzleModule } from '@nestjs/drizzle';
import { createObserveModule } from '@nestjs/observe';
import { StorageModule } from '@nestjs/storage';
import { ThrottlerGuard, ThrottlerModule, minutes, normalizeIp } from '@nestjs/throttler';
import { drizzle } from 'drizzle-orm/node-postgres';
import { accountEmail } from './auth/account-email.js';
import { AuthModule } from './auth/auth.module.js';
import { envSchema, type Env } from './config.js';
import { FilesModule } from './files/files.module.js';
import { HealthModule } from './health/health.module.js';
import { createStorageOptions } from './storage/storage.config.js';
import { UsersModule } from './users/users.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // First, so it shuts down last and still sends what the other modules did.
    ObserveModule.forRoot({
      // Empty until `npx @nestjs/observe link` writes the key pair into .env: the SDK then sends nothing.
      appKey: process.env.OBSERVE_APP_KEY ?? '',
      appSecret: process.env.OBSERVE_APP_SECRET ?? '',
      serviceId: 'files-api',
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
          issuer: 'files-api',
          audience: 'files-api',
          ttl: '15m',
        },
        refreshToken: { ttl: '30d', absoluteTtl: '90d' },
      }),
    }),
    StorageModule.forRootAsync({
      inject: [ConfigService],
      useFactory: createStorageOptions,
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
    FilesModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: StandardSchemaValidationPipe },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

```

#### 接受上传

用户可以上传 JPEG、PNG、WebP 和 GIF 图像以及 PDF 文档，每个文件最大为 10 MiB：

```typescript title="src/files/file-rules.ts"
/** What users may upload: images and PDF documents, recognized by their bytes. */
export const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MiB

```

上传路由使用 `FileInterceptor()`，这与 Nest 中的任何上传一样。在 Node 适配器上，它来自 `@nestjs/platform-node`（参见 [Other packages](/techniques/performance#other-packages)）。特别的是它的 `storage` 选项：`uploadToDisk()` 是一个 multer 存储引擎，它在文件到达时将其流式传输到磁盘，而不是（multer 的默认设置）到内存或临时文件夹中。控制器包含本教程的所有路由；接下来的部分解释 `findOne()` 之后的路由：

```typescript title="src/files/files.controller.ts"
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { FileInterceptor, type NodeRequest, type NodeResponse } from '@nestjs/platform-node';
import { uploadToDisk, type StoredUpload } from '@nestjs/storage';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import { z } from 'zod';
import type { User } from '../users/user.js';
import { FILE_TYPES, MAX_FILE_SIZE } from './file-rules.js';
import { listFilesQuerySchema, type ListFilesQuery } from './files.schemas.js';
import { FilesService } from './files.service.js';

const fileId = { schema: z.uuid() };

@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(
    FileInterceptor('file', {
      // Streams the file onto the disk as it arrives, after checking its first bytes.
      storage: uploadToDisk({
        contentTypes: FILE_TYPES,
        // The authentication guard has run: the key starts with the owner's id.
        key: (file, req: { user: User }) => `${req.user.id}/${randomUUID()}${file.extension}`,
      }),
      limits: { fileSize: MAX_FILE_SIZE, files: 1 },
      // File names in UTF-8, as browsers send them, rather than multer's default latin1.
      defParamCharset: 'utf8',
    }),
  )
  upload(@CurrentUser('id') userId: string, @UploadedFile() file: StoredUpload | undefined) {
    if (!file) {
      throw new BadRequestException('Attach the file as the "file" field');
    }
    return this.filesService.create(userId, file);
  }

  @Get()
  findAll(@CurrentUser('id') userId: string, @Query({ schema: listFilesQuerySchema }) query: ListFilesQuery) {
    return this.filesService.findAll(userId, query);
  }

  @Get(':id')
  findOne(@CurrentUser('id') userId: string, @Param('id', fileId) id: string) {
    return this.filesService.findOne(userId, id);
  }

  @Get(':id/content')
  content(
    @CurrentUser('id') userId: string,
    @Param('id', fileId) id: string,
    @Req() req: NodeRequest,
    @Res({ passthrough: true }) res: NodeResponse,
  ) {
    return this.filesService.content(userId, id, req, res);
  }

  @Get(':id/link')
  link(@CurrentUser('id') userId: string, @Param('id', fileId) id: string) {
    return this.filesService.link(userId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser('id') userId: string, @Param('id', fileId) id: string) {
    return this.filesService.remove(userId, id);
  }
}

```

当 `upload()` 运行时，文件已在磁盘上，并且这些检查已通过：

- **守卫首先运行。** 没有有效令牌的请求在读取任何主体字节之前就会收到 401，因此当 `key()` 构建以所有者 ID 开头的键时，会设置 `req.user`。
- **类型是字节的类型，而不是客户端声称的类型。** 浏览器发送它从文件名猜测的类型，脚本可以发送任何内容。`uploadToDisk()` 读取文件的前几个字节，根据其签名检测类型，并在写入任何字节之前，拒绝不在 `FILE_TYPES` 中的任何内容，并返回 `415 Unsupported Media Type`。因此，以 `image/png` 发送的文本文件被拒绝，而重命名为 `.png` 的 PDF 会作为 PDF 存储。
- **大小在文件流时计数。** multer 在 `limits.fileSize` 停止读取，而 `uploadToDisk()` 拒绝保留收到的内容：客户端收到 `413 Payload Too Large`（如 [File size limit](/techniques/file-upload#file-size-limit) 所述），并且没有内容被存储。`files: 1` 以 `400 Too many files` 拒绝同一请求中的第二个文件，第一个文件也不会被保留。
- **键是服务器的。** 包括所有者 ID、一个随机 UUID 和检测到的类型的扩展名。客户端的文件名绝不会成为路径的一部分。

`ParseFilePipe` 及其验证器（如 [file upload chapter](/techniques/file-upload#file-validation) 所述）在拦截器之后运行，此时流式文件已存储，而 `FileTypeValidator` 需要文件在内存中。使用 `uploadToDisk()` 时，该引擎同时执行这两个检查。然后 `@UploadedFile()` 返回一个 `StoredUpload`：`key`、`size` 和 `contentType`（检测到的类型），以及 multer 的 `originalname` 和 `mimetype`（客户端的声明）。

`defParamCharset: 'utf8'` 对非纯 ASCII 名称很重要，例如带有变音符号的德语发票名称。浏览器和 curl 以 UTF-8 发送文件名，而 multer 默认将其解码为 Latin-1，因此每个非 ASCII 字符都会被错误地存储为两个字符。

#### 保持在配额内

文件已存储；记录它和配额是服务的职责。明显的版本读取用户的用量，检查新文件是否合适，然后写入新的用量。同时到达的两次上传都读取相同的用量，都通过了检查，并且都被记录了。本教程末尾的测试一次性发送了五个 3,000 字节的上传，配额为 10,000 字节：该版本在每次运行中都接受了所有五个。

下面的服务在一个语句中检查并处理配额：

```typescript title="src/files/files.service.ts"
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { StorageDisk, type StoredUpload } from '@nestjs/storage';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { files, users } from '../database/schema.js';
import type { ListFilesQuery } from './files.schemas.js';

// What the API returns: everything but the storage key.
const columns = {
  id: files.id,
  name: files.name,
  contentType: files.contentType,
  size: files.size,
  createdAt: files.createdAt,
};

@Injectable()
export class FilesService {
  constructor(
    @InjectDrizzle() private readonly db: NodePgDatabase,
    // The default disk: the only one, `files`.
    private readonly disk: StorageDisk,
  ) {}

  /** Records an upload that `uploadToDisk()` has already stored, if it fits in the owner's quota. */
  async create(ownerId: string, upload: StoredUpload) {
    try {
      return await this.db.transaction(async (tx) => {
        // Checks and takes the quota in one statement: two uploads can't both fit in the last free bytes.
        const [owner] = await tx
          .update(users)
          .set({ storageUsed: sql`${users.storageUsed} + ${upload.size}` })
          .where(and(eq(users.id, ownerId), sql`${users.storageUsed} + ${upload.size} <= ${users.storageQuota}`))
          .returning({ id: users.id });
        if (!owner) {
          throw new ConflictException('Storage quota exceeded');
        }
        const [file] = await tx
          .insert(files)
          .values({
            ownerId,
            key: upload.key,
            name: displayName(upload.originalname),
            // Detected from the bytes: `upload.mimetype` is only what the client claimed.
            contentType: upload.contentType,
            size: upload.size,
          })
          .returning(columns);
        return file;
      });
    } catch (error) {
      // The bytes are stored already: don't leave them behind for a file that doesn't exist.
      await this.disk.delete(upload.key);
      throw error;
    }
  }

  findAll(ownerId: string, { limit, offset }: ListFilesQuery) {
    return this.db
      .select(columns)
      .from(files)
      .where(eq(files.ownerId, ownerId))
      .orderBy(desc(files.createdAt), desc(files.id))
      .limit(limit)
      .offset(offset);
  }

  async findOne(ownerId: string, id: string) {
    const [file] = await this.db.select(columns).from(files).where(this.owned(ownerId, id));
    return file ?? notFound();
  }

  async usage(ownerId: string) {
    const [usage] = await this.db
      .select({ used: users.storageUsed, quota: users.storageQuota })
      .from(users)
      .where(eq(users.id, ownerId));
    return usage;
  }

  // content(), link() and remove() follow in the next sections.

  private owned(ownerId: string, id: string) {
    return and(eq(files.id, id), eq(files.ownerId, ownerId));
  }
}

function notFound(): never {
  throw new NotFoundException('File not found');
}

/** The client's file name, without control characters, at most 255 characters. */
function displayName(originalname: string): string {
  const name = originalname.replace(/[\x00-\x1f\x7f]/g, '').trim();
  return name.slice(0, 255) || 'file';
}

```

- **`UPDATE` 仅在总和保持在配额内时才增加文件大小。** PostgreSQL 在更新用户行时会锁定该行，因此第二个上传的 `UPDATE` 会等待第一个事务完成，然后看到它留下的用量。当文件不合适时，该语句不更改任何行并返回空值，服务则抛出异常。
- **行和用量一起更改。** 插入在同一个 [transaction](https://docs.nestjs.com/data/drizzle#drizzle-transactions) 中，通过 `tx`，因此失败的插入会返回配额。
- **被拒绝上传的字节被删除。** `uploadToDisk()` 在处理程序运行之前存储了它们。无论之后发生什么错误，是配额错误还是数据库错误，`catch` 都会删除它们，因此被拒绝的上传不会占用未计入配额的空间。
- **配额的响应是 409，而不是 413。** `413` 告诉客户端该文件太大，无法接受。`409 Conflict` 告诉客户端请求本身没问题，但账户状态拒绝了它：删除一些文件，相同的上传就会成功。
- **大小和类型来自上传本身，即存储的：** `upload.size` 是写入的字节，`upload.contentType` 是检测到的类型。

列表接受页大小和偏移量，如 JWT 教程中所述：

```typescript title="src/files/files.schemas.ts"
import { z } from 'zod';

export const listFilesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListFilesQuery = z.infer<typeof listFilesQuerySchema>;

```

了解用量的客户端可以在上传被拒绝前发出警告：

```typescript title="src/files/storage-usage.controller.ts"
import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { FilesService } from './files.service.js';

@Controller('me/storage')
export class StorageUsageController {
  constructor(private readonly filesService: FilesService) {}

  // Bytes used and allowed, so a client can warn before an upload is refused.
  @Get()
  usage(@CurrentUser('id') userId: string) {
    return this.filesService.usage(userId);
  }
}

```

#### 下载文件

下载通过服务，服务根据 ID 和所有者找到文件，因此别人的文件会返回 404，与不存在的文件返回的答案相同。有两种方式交付文件：

```typescript title="src/files/files.service.ts"
import type { NodeRequest, NodeResponse } from '@nestjs/platform-node';
import { serveFile, StorageDisk, type StoredUpload } from '@nestjs/storage';
// ...

  /** Streams the file as the response, with its type, length and name. */
  async content(ownerId: string, id: string, req: NodeRequest, res: NodeResponse) {
    const { key, name } = await this.stored(ownerId, id);
    return serveFile(this.disk, key, { req, res, filename: name });
  }

  /** A link that downloads the file without a token, for the next five minutes. */
  async link(ownerId: string, id: string) {
    const { key, name } = await this.stored(ownerId, id);
    const url = await this.disk.signedUrl(key, { expiresIn: '5m', filename: name });
    return { url, expiresIn: 300 };
  }
  // ...

  private async stored(ownerId: string, id: string) {
    const [file] = await this.db
      .select({ key: files.key, name: files.name })
      .from(files)
      .where(this.owned(ownerId, id));
    return file ?? notFound();
  }
  // ...
}

```

- **`content()` 通过 API 流式传输文件。** `serveFile()` 返回磁盘流的 `StreamableFile`，因此文件永远不会完整地存储在内存中，同时包含 `Content-Type`（检测到的类型）、`Content-Length`、包含原始文件名的 `Content-Disposition: attachment`、`ETag` 和 `Cache-Control: private`，因此没有共享缓存会保留一个用户的文件，并且包含 `X-Content-Type-Options: nosniff`，这样浏览器就不会对类型产生疑虑。它以 `Range` 请求响应 `206`，允许下载恢复。有关详细信息，请参阅 [File storage](/application/file-storage#upload-product-photos)，有关 `StreamableFile` 本身，请参阅 [Response headers](/techniques/file-upload#response-headers)。
- **`link()` 返回一个签名 URL**，该 URL 在接下来的五分钟内无需令牌即可下载文件。网页可以将它放入链接或 `<img>` 标签中，该标签不能发送 `Authorization` 标头，并且在使用 S3 时，下载根本不经过 API。持有该链接的任何人都可以使用，直到它过期，并且不能撤销，因此应保持短期有效。在签发链接时会检查所有者；链接本身无需检查。
- **原始名称是客户端的**，按接收到的方式存储，不含控制字符。它只作为下载的名称返回：`serveFile()` 将其放入 `Content-Disposition` 并使用 ASCII 备用方案，`filename*` 用于其余部分。

使用 S3 时，签名链接指向存储桶，存储桶自行验证它们。使用本地磁盘时，它们指向应用程序，应用程序需要一个验证这些链接并提供文件的路由：

```typescript title="src/files/downloads.controller.ts"
import { Controller, Get, Req, Res } from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import type { NodeRequest, NodeResponse } from '@nestjs/platform-node';
import { serveSignedUrl, StorageDisk } from '@nestjs/storage';
import { ApiSecurity } from '@nestjs/swagger';

/**
 * Serves the local disk's signed links. They carry their own permission, so the route is
 * public. With S3, the links point at the bucket, and this route answers 404.
 */
@Public()
@ApiSecurity({})
@Controller('downloads')
export class DownloadsController {
  constructor(private readonly disk: StorageDisk) {}

  @Get()
  download(@Req() req: NodeRequest, @Res({ passthrough: true }) res: NodeResponse) {
    return serveSignedUrl(this.disk, { req, res });
  }
}

```

该路由是 `@Public()`：否则，认证守卫会要求令牌，而链接的签名即是权限。`serveSignedUrl()` 检查签名和过期时间，对于被更改或已过期的链接，返回 `403`。

```typescript title="src/files/files.module.ts"
import { Module } from '@nestjs/common';
import { DownloadsController } from './downloads.controller.js';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';
import { StorageUsageController } from './storage-usage.controller.js';

@Module({
  controllers: [FilesController, StorageUsageController, DownloadsController],
  providers: [FilesService],
})
export class FilesModule {}

```

#### 删除文件

文件是行和一些字节，在两个无法共享事务的系统中。其中一个先执行，无论哪一个，两个系统之间的崩溃都会留下残留物：

- **先字节后行：** 崩溃会留下行，但其字节已丢失。用户在列表中看到文件，但下载失败。
- **先行后字节：** 崩溃会留下没有行指向的字节，即一个**孤儿**。用户看不到任何问题；代价是存储空间。

因此，先执行行：

```typescript title="src/files/files.service.ts"
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
// ...

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  // ...

  async remove(ownerId: string, id: string): Promise<void> {
    // The row first, and the quota with it, in one transaction.
    const { key } = await this.db.transaction(async (tx) => {
      const [deleted] = await tx
        .delete(files)
        .where(this.owned(ownerId, id))
        .returning({ key: files.key, size: files.size });
      if (!deleted) {
        notFound();
      }
      await tx
        .update(users)
        .set({ storageUsed: sql`${users.storageUsed} - ${deleted.size}` })
        .where(eq(users.id, ownerId));
      return deleted;
    });
    // Then the bytes. If this fails, they're an orphan, which the cleanup job removes;
    // the file is gone for the user either way.
    try {
      await this.disk.delete(key);
    } catch (error) {
      this.logger.warn(`Could not delete ${key}: ${String(error)}`);
    }
  }
  // ...
}

```

行和使用变更在一个事务中进行，一旦提交，字节才被删除。对同一文件的两次 `DELETE` 请求不会两次释放其空间：第二次请求的 `DELETE` 会等待第一个事务对行的锁，然后发现没有内容，并返回 404。如果删除字节失败，请求仍然成功，因为文件对用户来说已经消失了，而字节变成了孤儿。

孤儿来自三个地方：一个进程在存储上传和记录它之间停止；字节删除失败；以及一个被删除的用户，外键的 `ON DELETE CASCADE` 会移除其行，但无法移除其字节。清理任务会移除它们。每天一次，它使用 `listAll()` 列出磁盘，该方法返回每个文件的 `key` 和 `lastModified`，以批次形式在 `files` 表中查找键，并删除没有对应行且超过一小时的文件。年龄检查可以防止尚未记录但已存储的上传被清理。使用 [`@nestjs/schedule`](/techniques/task-scheduling) 运行它，每次只在一个实例上使用 [`@nestjs/locks`](/reliability/locks#run-each-job-on-one-instance)。当用户删除账户时，键以其 ID 开头，因此使用带有该 `prefix` 的 `listAll()` 可以立即找到其文件。

#### 在生产环境中使用 S3

在生产环境中，磁盘即为存储桶。只有环境发生变化：每个服务、控制器和签名链接都能继续工作。`S3Disk` 从标准的 `AWS_ACCESS_KEY_ID` 和 `AWS_SECRET_ACCESS_KEY` 变量中读取其凭证。对于 AWS S3：

```bash
STORAGE_DRIVER=s3
S3_BUCKET=files-api-production
S3_REGION=eu-central-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

```

对于 S3 兼容的存储，添加 `S3_ENDPOINT`：对于 Cloudflare R2 使用 `https://<account id>.r2.cloudflarestorage.com` 及其 `S3_REGION=auto`，或使用带有 `S3_FORCE_PATH_STYLE=true` 的 MinIO 服务器 URL。缺少设置会在应用程序启动时阻止其接受上传：

```bash
$ STORAGE_DRIVER=s3 npm run start
ERROR [ExceptionHandler] Error: Config validation error: S3_BUCKET: Required when STORAGE_DRIVER is s3
$ STORAGE_DRIVER=s3 S3_BUCKET=files-api-production npm run start
ERROR [ExceptionHandler] TypeError: S3Disk needs credentials: pass `credentials: { accessKeyId, secretAccessKey }` (or a function returning them), or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY

```

使用 S3 磁盘时，`GET /files/:id/link` 向存储桶返回一个预签名 URL，该 URL 在 300 秒后过期，并携带下载的名称，应用程序的 `/downloads` 路由返回 404（此处针对存储在 `localhost:9000`、存储桶 `files-dev`、路径风格的存储）：

```json
{"url":"http://localhost:9000/files-dev/d4614e84-dc0c-4539-a0af-3c7131b2a11a/dae1b7a8-0e79-429e-9c69-e572cdf20174.png?response-content-disposition=attachment%3B%20filename%3D%22avatar2.png%22&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=...&X-Amz-Date=20261119T224101Z&X-Amz-Expires=300&X-Amz-SignedHeaders=host&X-Amz-Signature=0323f9039100...","expiresIn":300}

```

当无法访问存储桶时，上传会以 500 失败，且没有任何记录。

上传像上传到文件夹一样流式传输到 S3：单个请求可上传高达 8 MiB 的文件，更长或长度不确定的流则作为分段上传，如果任何部分失败则中止，因此失败的上传永远不会成为文件。`S3Disk` 通过 `fetch` 与 S3 通信，使用来自 `node:crypto` 的签名版本 4，因此无需安装 AWS SDK。有关重试、超时和其他服务，请参阅 [Use S3 or R2 in production](/application/file-storage#use-s3-or-r2-in-production)。

#### 试用

启动应用程序：

```bash
$ npm run start

```

注册，并保留访问令牌（令牌和长值在此和下方被缩短）：

```bash
$ curl localhost:3000/auth/sign-up --json '{"email":"ada@example.com","password":"correct horse battery"}'
{"accessToken":"eyJhbGciOiJIUzI1NiIs...","refreshToken":"...","expiresIn":900}
$ ADA="Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."

```

上传一张图片，来自一个包含 `avatar.png`（以及一个副本 `avatar2.png`）的目录，一个名为 `Rechnung März "Q1".pdf` 的小型 PDF，一个 `notes.txt` 和一个 11 MiB 的 `video.png`。声明为图片的文本文件被拒绝，超过 10 MiB 的文件也被拒绝，两者均未存储：

```bash
$ curl localhost:3000/files -H "$ADA" -F file=@avatar.png
{"id":"e48f0fb4-2033-43e3-82d7-0070d56aac80","name":"avatar.png","contentType":"image/png","size":80,"createdAt":"2026-11-19T22:32:19.415Z"}
$ curl localhost:3000/files -H "$ADA" -F 'file=@notes.txt;type=image/png'
{"message":"File type not allowed. Allowed types: image/jpeg, image/png, image/webp, image/gif, application/pdf","error":"Unsupported Media Type","statusCode":415}
$ curl localhost:3000/files -H "$ADA" -F file=@video.png
{"message":"File too large","error":"Payload Too Large","statusCode":413}

```

上传一个名称不是纯 ASCII 的 PDF，并按最新顺序列出文件：

```bash
$ curl localhost:3000/files -H "$ADA" -F 'file=@Rechnung März "Q1".pdf'
{"id":"c45d329d-3130-47b6-bf1e-07b5a5d4cb50","name":"Rechnung März \"Q1\".pdf","contentType":"application/pdf","size":30,"createdAt":"2026-11-19T22:32:19.517Z"}
$ curl localhost:3000/files -H "$ADA"
[{"id":"c45d329d-3130-47b6-bf1e-07b5a5d4cb50","name":"Rechnung März \"Q1\".pdf",...},{"id":"e48f0fb4-2033-43e3-82d7-0070d56aac80","name":"avatar.png",...}]

```

通过 API 下载图片，并查看头部。PDF 的名称会获得 ASCII 备用方案，以及 `filename*` 中的确切名称。范围请求会获得一个 `206`：

```bash
$ curl -sD - -o avatar-copy.png localhost:3000/files/e48f0fb4-2033-43e3-82d7-0070d56aac80/content -H "$ADA" | grep -iE '^(HTTP|content-|cache-control|x-content|etag)'
HTTP/1.1 200 OK
X-Content-Type-Options: nosniff
ETag: "50-660a8b34ff823"
Cache-Control: private
Content-Type: image/png
Content-Disposition: attachment; filename="avatar.png"
Content-Length: 80
$ curl -sD - -o /dev/null localhost:3000/files/c45d329d-3130-47b6-bf1e-07b5a5d4cb50/content -H "$ADA" | grep -i content-disposition
Content-Disposition: attachment; filename="Rechnung M_rz _Q1_.pdf"; filename*=UTF-8''Rechnung%20M%C3%A4rz%20%22Q1%22.pdf
$ curl -s -o /dev/null -w '%{http_code}\n' -r 0-7 localhost:3000/files/e48f0fb4-2033-43e3-82d7-0070d56aac80/content -H "$ADA"
206

```

获取一个签名链接，并使用它下载文件，无需令牌。更改的链接将被拒绝：

```bash
$ curl localhost:3000/files/e48f0fb4-2033-43e3-82d7-0070d56aac80/link -H "$ADA"
{"url":"http://localhost:3000/downloads?key=d4614e84-dc0c-4539-a0af-3c7131b2a11a%2F8758a3d5-f18a-4cc2-a65c-970825c0de30.png&expires=1795127846&disposition=attachment%3B+filename%3D%22avatar.png%22&signature=PgRNmG5AH1hf...","expiresIn":300}
$ LINK="http://localhost:3000/downloads?key=...&signature=PgRNmG5AH1hf..."
$ curl -sD - -o /dev/null "$LINK" | grep -iE '^(HTTP|content-)'
HTTP/1.1 200 OK
Content-Type: image/png
Content-Disposition: attachment; filename="avatar.png"
Content-Length: 80
$ curl "${LINK/avatar/secret}"
{"message":"Invalid signed URL","error":"Forbidden","statusCode":403}

```

第二个用户注册，其令牌在 `BOB` 中，无论他们请求 Ada 的文件、其内容还是链接，都会收到 404 错误：

```bash
$ curl localhost:3000/files/e48f0fb4-2033-43e3-82d7-0070d56aac80/link -H "$BOB"
{"message":"File not found","error":"Not Found","statusCode":404}

```

给 Ada 分配 200 字节的配额，并填满它。删除文件会释放其空间，但不足以容纳另外 80 字节：

```bash
$ docker exec files-db psql -U postgres -d files -c "UPDATE users SET storage_quota = 200 WHERE email = 'ada@example.com'"
$ curl localhost:3000/files -H "$ADA" -F file=@avatar2.png
{"id":"19b1b81b-7513-4dd2-b116-c1f556deb190","name":"avatar2.png","contentType":"image/png","size":80,"createdAt":"2026-11-19T22:32:36.780Z"}
$ curl localhost:3000/me/storage -H "$ADA"
{"used":190,"quota":200}
$ curl -i -X DELETE localhost:3000/files/c45d329d-3130-47b6-bf1e-07b5a5d4cb50 -H "$ADA"
HTTP/1.1 204 No Content
$ curl localhost:3000/me/storage -H "$ADA"
{"used":160,"quota":200}
$ curl localhost:3000/files -H "$ADA" -F file=@avatar2.png
{"message":"Storage quota exceeded","error":"Conflict","statusCode":409}

```

文件位于 `storage/`，每个用户一个文件夹，位于服务器选择的键下。被拒绝的上传没有留下任何残留物：

```bash
$ find storage -type f
storage/d4614e84-dc0c-4539-a0af-3c7131b2a11a/dae1b7a8-0e79-429e-9c69-e572cdf20174.png
storage/d4614e84-dc0c-4539-a0af-3c7131b2a11a/8758a3d5-f18a-4cc2-a65c-970825c0de30.png

```

#### 测试

这里重要的保证是关于并发的，像 PGlite 这样的进程内数据库只有一个连接，请求永远不会真正竞争。因此，测试是针对真实的 PostgreSQL 服务器运行的，通过连接池，如 [e-commerce tutorial](/tutorials/ecommerce-backend#test-it) 所示。文件存储在 `InMemoryDisk` 中，它表现得像其他磁盘一样，允许测试看到已存储的内容，使用 `keys()`。覆盖 `STORAGE_MODULE_OPTIONS` 会替换工厂将返回的内容（参见 [Testing](/application/file-storage#测试)）。配置仍然需要一个签名密钥，因此将一个添加到测试环境中：

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
      STORAGE_SIGNING_KEY: 'test-only-signing-key-0123456789abcdef',
    },
  },
});

```

`app.inject()` 按照给定方式发送请求体，因此测试使用平台的 `FormData` 通过 `Request` 构建其 multipart 主体，后者对其进行编码并选择边界：

```typescript title="test/files.e2e-spec.ts"
import { fileURLToPath } from 'node:url';
import { PasswordHasher } from '@nestjs/authentication';
import { getDrizzleToken } from '@nestjs/drizzle';
import { NodeAdapter, type NestNodeApplication } from '@nestjs/platform-node';
import { InMemoryDisk, STORAGE_MODULE_OPTIONS } from '@nestjs/storage';
import { Test } from '@nestjs/testing';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module.js';
import { files, users } from '../src/database/schema.js';

// A real PostgreSQL with a pool, so concurrent uploads really race.
const url = process.env.TEST_DATABASE_URL;

/** A file that starts like a PNG, padded to `size` bytes. */
const png = (size: number) =>
  Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), Buffer.alloc(size - 16)]);

/** A multipart/form-data body, built by the platform's FormData. */
async function form(content: Buffer, filename: string, type = 'application/octet-stream') {
  const body = new FormData();
  body.append('file', new Blob([content], { type }), filename);
  const req = new Request('http://localhost/', { method: 'POST', body });
  return {
    payload: Buffer.from(await req.arrayBuffer()),
    headers: { 'content-type': req.headers.get('content-type')! },
  };
}

describe.skipIf(!url)('Files API (e2e)', () => {
  const db = drizzle({ client: new Pool({ connectionString: url, max: 20 }) });
  const disk = new InMemoryDisk({
    signedUrls: { baseUrl: 'http://localhost:3000/downloads', keys: ['test-only-signing-key-0123456789abcdef'] },
  });
  let app: NestNodeApplication;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
    await db.execute(sql`TRUNCATE users, refresh_tokens CASCADE`);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDrizzleToken())
      .useValue(db)
      // scrypt at the default cost takes 128 MiB and a few hundred ms per hash.
      .overrideProvider(PasswordHasher)
      .useValue(new PasswordHasher({ logN: 10 }))
      // The files go to memory: the test checks what the disk holds with keys().
      .overrideProvider(STORAGE_MODULE_OPTIONS)
      .useValue({ disks: { files: disk } })
      .compile();
    app = moduleRef.createNestApplication<NestNodeApplication>(new NodeAdapter());
    await app.init();
  });

  afterAll(() => app.close()); // closes the pool too
  beforeEach(() => disk.clear());

  let clients = 0;

  /** Signs a user up, and returns the headers that authenticate as them. */
  async function signUp(email: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email, password: 'correct horse battery' },
      // Sign-up is rate-limited per IP address: each user gets an address of their own.
      remoteAddress: `10.0.0.${++clients}`,
    });
    return { authorization: `Bearer ${res.json<{ accessToken: string }>().accessToken}` };
  }

  async function upload(headers: Record<string, string>, content: Buffer, filename: string, type?: string) {
    const body = await form(content, filename, type);
    return app.inject({ method: 'POST', url: '/files', headers: { ...headers, ...body.headers }, payload: body.payload });
  }

  it('uploads a file and streams it back with its type and name', async () => {
    const ada = await signUp('ada@example.com');
    const content = png(2048);

    const created = await upload(ada, content, 'avatar.png', 'image/png');
    expect(created.statusCode).toBe(201);
    const file = created.json<{ id: string }>();
    expect(file).toMatchObject({ name: 'avatar.png', contentType: 'image/png', size: 2048 });

    const download = await app.inject({ method: 'GET', url: `/files/${file.id}/content`, headers: ada });
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-type']).toBe('image/png');
    expect(download.headers['content-disposition']).toBe('attachment; filename="avatar.png"');
    expect(download.rawPayload).toEqual(content);
  });

  it('refuses a file of the wrong type, or too large, and stores nothing', async () => {
    const ada = await signUp('ada-refused@example.com');

    // A text file that claims to be an image: the bytes decide.
    const text = await upload(ada, Buffer.from('<script>alert(1)</script>'), 'cat.png', 'image/png');
    expect(text.statusCode).toBe(415);
    const big = await upload(ada, png(10 * 1024 * 1024 + 1), 'big.png', 'image/png');
    expect(big.statusCode).toBe(413);

    expect(disk.keys()).toEqual([]);
    const usage = await app.inject({ method: 'GET', url: '/me/storage', headers: ada });
    expect(usage.json()).toMatchObject({ used: 0 });
  });

  it('never lets concurrent uploads exceed the quota', async () => {
    const ada = await signUp('ada-quota@example.com');
    await db.update(users).set({ storageQuota: 10_000 }).where(eq(users.email, 'ada-quota@example.com'));

    // Five uploads of 3,000 bytes at once, against 10,000 bytes of quota: three fit.
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => upload(ada, png(3_000), `${i}.png`)));

    expect(results.map((res) => res.statusCode).sort()).toEqual([201, 201, 201, 409, 409]);
    const usage = await app.inject({ method: 'GET', url: '/me/storage', headers: ada });
    expect(usage.json()).toEqual({ used: 9_000, quota: 10_000 });
    // The refused uploads' bytes were deleted again.
    expect(disk.keys()).toHaveLength(3);
  });

  it("answers 404 for someone else's file", async () => {
    const ada = await signUp('ada-owner@example.com');
    const bob = await signUp('bob@example.com');
    const { id } = (await upload(ada, png(100), 'avatar.png')).json<{ id: string }>();

    for (const path of [`/files/${id}`, `/files/${id}/content`, `/files/${id}/link`]) {
      expect((await app.inject({ method: 'GET', url: path, headers: bob })).statusCode).toBe(404);
    }
    expect((await app.inject({ method: 'DELETE', url: `/files/${id}`, headers: bob })).statusCode).toBe(404);
    expect(disk.keys()).toHaveLength(1);
  });

  it('downloads through a signed link, which works without a token', async () => {
    const ada = await signUp('ada-link@example.com');
    const { id } = (await upload(ada, png(100), 'avatar.png')).json<{ id: string }>();

    const { url: link } = (await app.inject({ method: 'GET', url: `/files/${id}/link`, headers: ada })).json<{ url: string }>();
    const { pathname, search } = new URL(link);
    const download = await app.inject({ method: 'GET', url: pathname + search });
    expect(download.statusCode).toBe(200);
    expect(download.rawPayload).toEqual(png(100));

    const tampered = await app.inject({ method: 'GET', url: pathname + search.replace('avatar', 'secret') });
    expect(tampered.statusCode).toBe(403);
  });

  it('deletes the row, then the bytes, once even when asked twice at once', async () => {
    const ada = await signUp('ada-delete@example.com');
    const { id } = (await upload(ada, png(500), 'avatar.png')).json<{ id: string }>();

    const results = await Promise.all([1, 2].map(() => app.inject({ method: 'DELETE', url: `/files/${id}`, headers: ada })));

    expect(results.map((res) => res.statusCode).sort()).toEqual([204, 404]);
    const usage = await app.inject({ method: 'GET', url: '/me/storage', headers: ada });
    expect(usage.json()).toMatchObject({ used: 0 });
    expect(disk.keys()).toEqual([]);
    expect(await db.select().from(files).where(eq(files.id, id))).toEqual([]);
  });
});

```

为测试创建一个数据库，因为测试会截断表，并且按顺序运行两个测试文件：

```bash
$ docker exec files-db psql -U postgres -c "CREATE DATABASE files_test"
$ TEST_DATABASE_URL=postgres://postgres:files@localhost:5432/files_test npm run test:e2e -- --no-file-parallelism

 Test Files  2 passed (2)
      Tests  11 passed (11)

```

第二个文件是 JWT 教程的 [refresh-token store test](/tutorials/rest-api-jwt-authentication#test-it)，保持不变。两者都截断同一数据库的表，因此 `--no-file-parallelism`。

将 `create()` 中的配额 `UPDATE` 替换为读取、JavaScript 中的检查和写入，此时“不允许并发上传超过配额”将失败：所有五个上传都返回 201。

#### 生产检查清单

JWT 教程的 [checklist](/tutorials/rest-api-jwt-authentication#production-checklist) 中的所有内容都适用。特别是对于以下文件：

- **将 `STORAGE_DRIVER` 设置为 `s3`。** 容器磁盘上的文件在下次部署时会丢失，其他实例无法读取它们。存储模块在启动时发现带有 `NODE_ENV=production` 的本地磁盘时会记录警告。
- **保持存储桶私有。** 每次下载都通过 API 或签名链接进行，因此存储桶完全不需要公共访问。仅授予应用程序 `s3:GetObject`、`s3:PutObject`、`s3:DeleteObject` 和 `s3:ListBucket` 权限，不多于此。如果没有 `s3:ListBucket`，S3 会对缺失的文件返回 `403` 而不是 `404`。
- **中止不完整的 multipart 上传。** 存储桶上的生命周期规则会在一天后中止这些上传，从而清除崩溃上传遗留的部分。清理任务会移除已完成文件的孤儿。
- **提高大文件的请求超时时间。** Node 适配器保留了 Node 的默认值 `requestTimeout`（300 秒）（参见 [Server timeouts](/techniques/performance#server-timeouts)）：在慢速移动连接上 10 MiB 的上传可以完成，但 1 GB 的上传可能不行。API 前面的代理通常也有自己的主体大小限制。
- **绝不将上传从 API 的源内联提供。** `serveFile()` 发送 `attachment`，除非您请求 `inline`，然后仅针对无法运行脚本的类型，使用 `nosniff`。保持这种方式：内联显示的上传的 HTML 或 SVG 文件会使用您网站的 Cookie 运行。
- **保持链接短期有效。** 五分钟对于页面立即使用的链接来说是充足的。在开发和 CI 中的本地磁盘，将签名密钥保存在密钥库中，并通过在 `keys` 中将新密钥放在最前面进行轮换。
- **为生产环境提供独立的 Observe 密钥对**，从项目的 **API Keys** 页面获取，并在平台的环境中作为 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET`：`start:prod` 不会加载 `.env`。然后 [NestJS Observe](/observability/overview) 将出站 `fetch` 调用记录为跨度，嵌套在发起它们的方法下，紧邻 SQL 语句（参见 [Database queries and outbound HTTP](/observability/sdk#database-queries-and-outbound-http)）。`S3Disk` 使用 `fetch`，因此慢速上传会显示是等待 S3 还是等待 PostgreSQL。

[file storage chapter's checklist](/application/file-storage#production-checklist) 涵盖了 CDN 后面的公共文件、使用您自己的 KMS 密钥的加密以及来自浏览器的上传的 CORS。

#### 后续步骤

- 允许客户端通过签名上传 URL 直接将大文件上传到存储桶，然后记录它们：[Upload straight to storage from the mobile app](/application/file-storage#upload-straight-to-storage-from-the-mobile-app)。
- 接受没有签名的 CSV 文件和其他格式：[Accept CSV and other text formats](/application/file-storage#accept-csv-and-other-text-formats)。
- 在一个实例上按计划运行孤儿清理：[Task scheduling](/techniques/task-scheduling) 和 [Distributed locks](/reliability/locks)。
- 在用户之间共享文件，并按文件检查权限：[Authorization](/security/authorization)。
- 在生产环境中按请求查看慢速上传：[Observability](/observability/overview)。