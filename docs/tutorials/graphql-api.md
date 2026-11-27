<!-- 此文件从 content/tutorials/graphql-api.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:52:17.427Z -->
<!-- 源文件: content/tutorials/graphql-api.md -->
<!-- 源哈希: ab78fffd5b398629647ab1718d307aea -->

### 在 Node.js 中构建 GraphQL API

使用 NestJS、Apollo 和 PostgreSQL 在 Node.js 和 TypeScript 中构建一个 GraphQL API：批量解析器、登录、错误代码和订阅。

该 API 服务一个博客：用户撰写帖子，将其作为草稿保存直到发布，并互相评论帖子。一个用于此的 GraphQL 服务器启动只需几分钟，但大多数示例就止步于此。本教程关注它们忽略的内容：嵌套字段引起的 N+1 查询、一个被无人注意的草稿泄露、客户端无法区分的错误，以及一个跳过每次 HTTP 请求检查的 WebSocket。

到最后，该 API 将：

- 从 TypeScript 类生成其模式（[code first](/graphql/quick-start#代码优先)），由 Apollo Server 在 Node 适配器上提供服务。
- 通过 [Drizzle](https://docs.nestjs.com/data/drizzle) 在 PostgreSQL 中保存用户、帖子和评论，并使用游标进行帖子分页。
- 批量加载嵌套字段，因此 SQL 查询数量不会随着列表的增长而增长。
- 使用变更（mutation）和 [`@nestjs/authentication`](/security/authentication) 登录用户：访问令牌和轮换的刷新令牌。
- 仅向其作者显示草稿，通过所有路径，仅向其所有者显示电子邮件地址。
- 以客户端可操作的代码（`UNAUTHENTICATED`, `FORBIDDEN`, `BAD_USER_INPUT`, `NOT_FOUND`）响应，并在生产环境中隐藏意外错误。
- 通过 `graphql-ws` 将新评论推送到已登录的订阅者。
- 在针对 PostgreSQL、HTTP 和真实 WebSocket 的测试中证明这一点。

这些是操作，以及添加每个操作的部分：

| 操作 | 部分 |
| --- | --- |
| `posts`, `post`, `createPost`, `updatePost`, `publishPost`, `addComment` | [Read and write posts](/tutorials/graphql-api#read-and-write-posts) |
| `Post.author`, `Post.comments`, `User.posts`, `User.email`, `me` | [Batch nested fields with DataLoader](/tutorials/graphql-api#batch-nested-fields-with-dataloader) |
| `signUp`, `signIn`, `refreshToken` | [Sign users in with mutations](/tutorials/graphql-api#sign-users-in-with-mutations) |
| `commentAdded` | [Push new comments with subscriptions](/tutorials/graphql-api#push-new-comments-with-subscriptions) |

> info **提示** 完成的应用在 GitHub 上是 [nestjs/example-graphql-api](https://github.com/nestjs/example-graphql-api)，其中包含其测试和 CI 工作流。

您需要 Node.js 22.18 或更高版本，它直接运行订阅脚本的 TypeScript 并且内置了 WebSocket 客户端，还需要 Docker 来在本地运行 PostgreSQL。

#### 创建项目

使用 [Nest CLI](/cli/overview) 创建项目。`--minimal` 生成一个代码为单个文件的应用程序，本教程替换了它。它还安装了 [NestJS Observe SDK](/observability/sdk)、`@nestjs/observe`，并将其集成到该文件中；应用程序自己的文件保留了它：

```bash
$ npm i -g @nestjs/cli
$ nest new blog-api --minimal
$ cd blog-api

```

安装 [Node adapter](/techniques/performance#node-adapter) 来替代 Express、GraphQL 包、DataLoader、class-validator 以及用于配置、数据库、登录和速率限制的包：

```bash
$ npm uninstall @nestjs/platform-express @types/express
$ npm i --save @nestjs/platform-node @nestjs/graphql @nestjs/apollo @apollo/server @as-integrations/express5 graphql graphql-ws graphql-subscriptions dataloader class-validator class-transformer zod @nestjs/config @nestjs/drizzle drizzle-orm@rc pg @nestjs/authentication @nestjs/throttler
$ npm i --save-dev drizzle-kit@rc @types/pg @nestjs/testing vitest vite

```

Apollo driver 也在 Node 适配器上通过 Apollo Server 的 Express 集成提供 GraphQL，其请求和响应具有 Express API：没有 `@as-integrations/express5`，应用程序在启动时会因 `The "@as-integrations/express5" package is missing` 而停止。`@nestjs/graphql` 依赖于已有的 `graphql-ws`；测试和脚本导入了其客户端。

删除 `src/main.ts`：[Assemble the application](/tutorials/graphql-api#assemble-the-application) 会写入一个新的。在容器中启动 PostgreSQL：

```bash
$ docker run -d --name blog-db -e POSTGRES_PASSWORD=blog -e POSTGRES_DB=blog -p 5432:5432 postgres:17

```

在项目根目录中创建一个 `.env` 文件，由 `ConfigModule` 和 `drizzle-kit` 读取：

```bash
DATABASE_URL=postgres://postgres:blog@localhost:5432/blog
# Generate with: openssl rand -base64 32
JWT_SECRET=

```

配置是一个 Zod 模式，它在启动时由 `ConfigModule` 验证，如 [other tutorials](/tutorials/rest-api-jwt-authentication#store-notes-in-postgresql) 所示。当变量缺失或格式不正确时，应用程序拒绝启动：

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

#### 在 PostgreSQL 中存储博客

表，使用 Drizzle 的模式语言。`refresh_tokens` 是 `@nestjs/authentication` 用于刷新令牌的，如 [tutorial 1](/tutorials/rest-api-jwt-authentication#store-the-refresh-tokens) 所示：

```typescript title="src/database/schema.ts"
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Milliseconds, like a JavaScript Date: a cursor holds the exact value it compares with.
const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date', precision: 3 });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: at('created_at').notNull().defaultNow(),
});

export const posts = pgTable(
  'posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    // Null while the post is a draft.
    publishedAt: at('published_at'),
    createdAt: at('created_at').notNull().defaultNow(),
    updatedAt: at('updated_at').notNull().defaultNow(),
  },
  (table) => [
    // The published list, newest first, with the id as the tiebreaker.
    index('posts_published_at_id_idx').on(table.publishedAt.desc(), table.id.desc()),
    index('posts_author_id_created_at_idx').on(table.authorId, table.createdAt),
  ],
);

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (table) => [index('comments_post_id_created_at_idx').on(table.postId, table.createdAt)],
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

export type UserRow = typeof users.$inferSelect;
export type PostRow = typeof posts.$inferSelect;
export type CommentRow = typeof comments.$inferSelect;

```

草稿是没有 `publishedAt` 的帖子。PostgreSQL 默认保留微秒，而 JavaScript `Date` 毫秒，因此时间戳的精度是 3：游标则精确地持有其比较的值。在项目根目录中添加一个 `drizzle.config.ts`：

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
$ npx drizzle-kit generate --name=init
$ npx drizzle-kit migrate

```

#### 在 TypeScript 中定义模式

在代码优先的方法中，Nest 从类及其装饰器生成 GraphQL 模式（参见 [Object types](/graphql/resolvers-map#对象类型)）。一个用户：

```typescript title="src/users/user.model.ts"
import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class User {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;

  // Not a @Field: UsersResolver adds it to the schema, for the user themselves only.
  email: string;

  @Field()
  createdAt: Date;
}

```

`email` 是一个属性，但不是一个字段：只有检查谁在提问的字段解析器会检查 [puts it in the schema](/tutorials/graphql-api#batch-nested-fields-with-dataloader)。一个帖子，以及帖子列表的连接，Relay 和大多数客户端分页的形状是：

```typescript title="src/posts/post.model.ts"
import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class Post {
  @Field(() => ID)
  id: string;

  @Field()
  title: string;

  @Field()
  body: string;

  @Field(() => Date, { nullable: true, description: 'Null while the post is a draft.' })
  publishedAt: Date | null;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;

  // Resolved by PostsResolver as `author`.
  authorId: string;
}

@ObjectType()
export class PostEdge {
  @Field()
  cursor: string;

  @Field(() => Post)
  node: Post;
}

@ObjectType()
export class PageInfo {
  @Field()
  hasNextPage: boolean;

  @Field(() => String, { nullable: true })
  endCursor: string | null;
}

@ObjectType()
export class PostConnection {
  @Field(() => [PostEdge])
  edges: PostEdge[];

  @Field(() => PageInfo)
  pageInfo: PageInfo;
}

```

一个评论：

```typescript title="src/posts/comment.model.ts"
import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class Comment {
  @Field(() => ID)
  id: string;

  @Field()
  body: string;

  @Field()
  createdAt: Date;

  postId: string;
  // Resolved by CommentsResolver as `author`.
  authorId: string;
}

```

帖子的作者和评论不是这些类的属性：它们是具有自身解析器的字段，这些解析器以批次加载它们。

##### 使用 class-validator 验证参数

参数是带有 class-validator 规则的 `@ArgsType()` 和 `@InputType()` 类，全局 `ValidationPipe` 在解析器运行之前进行检查（参见 [Validation](/techniques/validation)）。一个类定义了 GraphQL 类型及其规则，因此两者不会偏离。GraphQL 会拒绝错误类型的值；规则检查其余部分，例如 UUID 的格式或标题的长度：

```typescript title="src/posts/posts.inputs.ts"
import { ArgsType, Field, ID, InputType, Int } from '@nestjs/graphql';
import { IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, ValidateIf } from 'class-validator';

// Optional, but never null: @IsOptional() would let a null through to a NOT NULL column.
const ifSent = ValidateIf((_object, value) => value !== undefined);

@ArgsType()
export class PostArgs {
  @Field(() => ID)
  @IsUUID()
  id: string;
}

/** The size of a list, such as a post's comments. */
@ArgsType()
export class FirstArgs {
  @Field(() => Int, { defaultValue: 10 })
  @Min(1)
  @Max(50)
  first: number;
}

@ArgsType()
export class PostsArgs extends FirstArgs {
  @Field(() => String, { nullable: true, description: 'The endCursor of the previous page.' })
  @IsOptional()
  @MaxLength(100)
  after?: string | null;
}

@InputType()
export class CreatePostInput {
  @Field()
  @Length(1, 200)
  title: string;

  @Field()
  @MaxLength(50_000)
  body: string;
}

@InputType()
export class UpdatePostInput {
  @Field(() => ID)
  @IsUUID()
  id: string;

  @Field(() => String, { nullable: true })
  @ifSent
  @IsString()
  @Length(1, 200)
  title?: string;

  @Field(() => String, { nullable: true })
  @ifSent
  @IsString()
  @MaxLength(50_000)
  body?: string;
}

@InputType()
export class AddCommentInput {
  @Field(() => ID)
  @IsUUID()
  postId: string;

  @Field()
  @Length(1, 5_000)
  body: string;
}

@ArgsType()
export class CommentAddedArgs {
  @Field(() => ID)
  @IsUUID()
  postId: string;
}

```

- **可选，永不为 null。** 客户端可以为任何可为空的参数发送 `null`。`@IsOptional()` 也跳过 `null` 的规则，因此 `title: null` 将到达 `NOT NULL` 列并在那里失败，作为一个内部错误。`ifSent` 仅在字段缺失时跳过它们。
- **每个列表都有最大值**，并且 id 必须是 UUID：PostgreSQL 会拒绝任何其他字符串并带有其自身的错误。

#### 读取和写入帖子

读取帖子的每个查询都会增加一个条件，因此草稿是否可见在一个地方决定：

```typescript title="src/posts/visibility.ts"
import { eq, isNotNull, or, type SQL } from 'drizzle-orm';
import { posts } from '../database/schema.js';

/** The posts a viewer may see: every published post, and their own drafts. Every query that reads posts uses it. */
export function visibleTo(viewerId: string | null): SQL {
  const published = isNotNull(posts.publishedAt);
  return viewerId ? or(published, eq(posts.authorId, viewerId))! : published;
}

```

Nest 的 GraphQL driver 将一个 `HttpException` 转换为带有代码的错误：400 变为 `BAD_REQUEST`，401 变为 `UNAUTHENTICATED`，403 变为 `FORBIDDEN`，422 变为 `BAD_USER_INPUT`，而所有其他状态码，包括 404 和 409，变为 `INTERNAL_SERVER_ERROR`，这没有告诉客户端任何信息。其他响应是带有自身代码的 `GraphQLError`：

```typescript title="src/graphql/errors.ts"
import { Catch, type ValidationError } from '@nestjs/common';
import type { GqlExceptionFilter } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';

export function notFound(what: string): never {
  throw new GraphQLError(`${what} not found`, { extensions: { code: 'NOT_FOUND' } });
}

/** The validation pipe's errors: BAD_USER_INPUT, with every message, by field. */
export function badUserInput(errors: ValidationError[]): GraphQLError {
  const fields = Object.fromEntries(errors.map((error) => [error.property, Object.values(error.constraints ?? {})]));
  return new GraphQLError(Object.values(fields).flat().join('; '), {
    extensions: { code: 'BAD_USER_INPUT', fields },
  });
}

/** A GraphQLError is an answer the code chose: pass it on. Nest would log it as an unexpected error. */
@Catch(GraphQLError)
export class GraphQLErrorFilter implements GqlExceptionFilter {
  catch(error: GraphQLError) {
    return error;
  }
}

```

- **`badUserInput()`** 用 `ValidationPipe` 的默认异常（400）替换了驱动程序报告的 `BAD_REQUEST`，并使用 `extensions.originalError` 中的消息。
- **`GraphQLErrorFilter`** 是一个 [exception filter](/graphql/guards-interceptors#异常过滤器)。Nest 将任何不是 `HttpException` 的错误记录为意外错误，并附带其堆栈跟踪：如果没有过滤器，每个 `NOT_FOUND` 都会是这种情况。

服务读取和写入帖子和评论：

```typescript title="src/posts/posts.service.ts"
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { isUUID } from 'class-validator';
import { and, desc, eq, isNotNull, lt, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { GraphQLError } from 'graphql';
import { PubSub } from 'graphql-subscriptions';
import { comments, posts, type CommentRow, type PostRow } from '../database/schema.js';
import { notFound } from '../graphql/errors.js';
import type { AddCommentInput, CreatePostInput, PostsArgs, UpdatePostInput } from './posts.inputs.js';
import { visibleTo } from './visibility.js';

export const PUB_SUB = Symbol('PUB_SUB');
// One topic per post: a comment wakes the subscribers of its own post only.
export const commentAddedTopic = (postId: string) => `commentAdded.${postId}`;

@Injectable()
export class PostsService {
  constructor(
    @InjectDrizzle() private readonly db: NodePgDatabase,
    @Inject(PUB_SUB) private readonly pubSub: PubSub,
  ) {}

  /** Published posts, newest first, one page at a time. */
  async list({ first, after }: PostsArgs) {
    const cursor = after ? decodeCursor(after) : undefined;
    const rows = await this.db
      .select()
      .from(posts)
      .where(
        and(
          isNotNull(posts.publishedAt),
          // After the cursor: published earlier, or in the same millisecond with a smaller id.
          cursor &&
            or(
              lt(posts.publishedAt, cursor.publishedAt),
              and(eq(posts.publishedAt, cursor.publishedAt), lt(posts.id, cursor.id)),
            ),
        ),
      )
      .orderBy(desc(posts.publishedAt), desc(posts.id))
      // One more than a page: if it comes back, there's a next page.
      .limit(first + 1);
    const edges = rows.slice(0, first).map((node) => ({ node, cursor: encodeCursor(node) }));
    return { edges, pageInfo: { hasNextPage: rows.length > first, endCursor: edges.at(-1)?.cursor ?? null } };
  }

  /** The post, if the viewer may see it: someone else's draft is as missing as an unknown id. */
  async findVisible(id: string, viewerId: string | null): Promise<PostRow | null> {
    const [post] = await this.db
      .select()
      .from(posts)
      .where(and(eq(posts.id, id), visibleTo(viewerId)));
    return post ?? null;
  }

  async create(authorId: string, input: CreatePostInput): Promise<PostRow> {
    const [post] = await this.db
      .insert(posts)
      .values({ ...input, authorId })
      .returning();
    return post;
  }

  async update(authorId: string, { id, ...changes }: UpdatePostInput): Promise<PostRow> {
    // The author is part of the statement: no window between a check and the write.
    const [post] = await this.db
      .update(posts)
      .set({ ...changes, updatedAt: new Date() })
      .where(and(eq(posts.id, id), eq(posts.authorId, authorId)))
      .returning();
    return post ?? this.refuse(id, authorId);
  }

  async publish(authorId: string, id: string): Promise<PostRow> {
    // coalesce(): publishing a published post again keeps its date.
    const [post] = await this.db
      .update(posts)
      .set({ publishedAt: sql`coalesce(${posts.publishedAt}, now())` })
      .where(and(eq(posts.id, id), eq(posts.authorId, authorId)))
      .returning();
    return post ?? this.refuse(id, authorId);
  }

  async addComment(authorId: string, { postId, body }: AddCommentInput): Promise<CommentRow> {
    // Published posts only: to anyone, the author included, a draft takes no comments.
    if (!(await this.findVisible(postId, null))) {
      notFound('Post');
    }
    const [comment] = await this.db.insert(comments).values({ postId, authorId, body }).returning();
    await this.pubSub.publish(commentAddedTopic(postId), { commentAdded: comment });
    return comment;
  }

  /** Why a write matched nothing: someone else's post is FORBIDDEN, if the user may see it. */
  private async refuse(id: string, userId: string): Promise<never> {
    if (await this.findVisible(id, userId)) {
      throw new ForbiddenException('Only the author can change this post');
    }
    notFound('Post');
  }
}

// The cursor is the last post's publication time and id: opaque to clients,
// but client input all the same, checked before it reaches a query.
function encodeCursor(post: PostRow): string {
  return Buffer.from(`${post.publishedAt!.getTime()}:${post.id}`).toString('base64url');
}

function decodeCursor(cursor: string): { publishedAt: Date; id: string } {
  const [, time, id] = /^(\d{1,15}):([0-9a-f-]{36})$/.exec(Buffer.from(cursor, 'base64url').toString()) ?? [];
  if (!time || !isUUID(id)) {
    throw new GraphQLError('Invalid cursor', { extensions: { code: 'BAD_USER_INPUT' } });
  }
  return { publishedAt: new Date(Number(time)), id };
}

```

- **带游标的列表页面**：最后一个帖子的发布时间和 ID，其中 ID 作为排序中的次要排序依据，以及索引和条件。与偏移量不同，当有人阅读第 1 页时，如果发布了帖子，游标不会移动。它仍然是客户端输入，在到达查询之前会进行检查。
- **写入是单个语句，作者在 `WHERE` 子句中**。当它不匹配任何内容时，`refuse()` 会找出原因：用户可能看到的帖子是别人的，是 `FORBIDDEN`。其他任何内容，包括另一个用户的草稿，是 `NOT_FOUND`，与不存在的 ID 相同。

解析器将 `Post` 的查询、变更和字段映射到服务（参见 [Resolvers](/graphql/resolvers-map) 和 [Mutations](/graphql/mutations)）：

```typescript title="src/posts/posts.resolver.ts"
import { Authenticate, CurrentUser } from '@nestjs/authentication';
import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { User } from '../users/user.model.js';
import { UsersLoader } from '../users/users.loader.js';
import { CommentsLoader } from './comments.loader.js';
import { Comment } from './comment.model.js';
import { Post, PostConnection } from './post.model.js';
import { CreatePostInput, FirstArgs, PostArgs, PostsArgs, UpdatePostInput } from './posts.inputs.js';
import { PostsService } from './posts.service.js';

// Anyone may read; a signed-in viewer also sees their own drafts.
@Authenticate({ optional: true })
@Resolver(() => Post)
export class PostsResolver {
  constructor(
    private readonly postsService: PostsService,
    private readonly usersLoader: UsersLoader,
    private readonly commentsLoader: CommentsLoader,
  ) {}

  @Query(() => PostConnection)
  posts(@Args() args: PostsArgs) {
    return this.postsService.list(args);
  }

  @Query(() => Post, { nullable: true })
  post(@Args() { id }: PostArgs, @CurrentUser('id') viewerId: string | null) {
    return this.postsService.findVisible(id, viewerId ?? null);
  }

  @ResolveField(() => User)
  author(@Parent() post: Post) {
    return this.usersLoader.load(post.authorId);
  }

  @ResolveField(() => [Comment])
  comments(@Parent() post: Post, @Args() { first }: FirstArgs) {
    return this.commentsLoader.load(post.id, first);
  }

  @Authenticate({ optional: false })
  @Mutation(() => Post)
  createPost(@CurrentUser('id') userId: string, @Args('input') input: CreatePostInput) {
    return this.postsService.create(userId, input);
  }

  @Authenticate({ optional: false })
  @Mutation(() => Post)
  updatePost(@CurrentUser('id') userId: string, @Args('input') input: UpdatePostInput) {
    return this.postsService.update(userId, input);
  }

  @Authenticate({ optional: false })
  @Mutation(() => Post)
  publishPost(@CurrentUser('id') userId: string, @Args() { id }: PostArgs) {
    return this.postsService.publish(userId, id);
  }
}

```

- **读取对所有人开放**。`@nestjs/authentication` 的全局守卫要求每次操作都有用户，除非另有说明。有了 `optional`，匿名读者可以通过，并且当请求具有有效令牌时，`@CurrentUser()` 仍然获取用户，因此作者可以看到他们的草稿。一个 `@Public()` 操作不进行认证，并且 `@CurrentUser()` 总是存在于那里，是 `null`。
- **变更再次需要用户**，将 `optional` 设置为 `false`：方法选项会合并到类的选项之上。
- **`author` 和 `comments` 通过 `UsersLoader` 和 `CommentsLoader`**，下一节将介绍。

#### 使用 DataLoader 批处理嵌套字段

查询 50 个帖子及其作者会运行 `author` 解析器 50 次，如果每次都发送自己的查询，请求将发送 51 个：N+1 问题。[DataLoader](https://github.com/graphql/dataloader) 是 GraphQL 项目中的一个小库，本文档未涵盖，它在一个时间片内收集解析器请求的键，并使用一次批处理函数调用加载它们。每个表都有自己的加载器，在其功能文件夹中：新字段会向它读取的表的加载器添加一个方法，而不是向共享类添加。按 ID 查询用户：

```typescript title="src/users/users.loader.ts"
import { Injectable, Scope } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import DataLoader from 'dataloader';
import { getColumns, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { users } from '../database/schema.js';
import type { User } from './user.model.js';

const { passwordHash: _, ...columns } = getColumns(users);

/** Users by id, for one request. */
@Injectable({ scope: Scope.REQUEST })
export class UsersLoader {
  // Batching without a cache: a subscription is one request for as long as it runs,
  // and each of its events must see the rows as they are now.
  private readonly byId = new DataLoader<string, User | undefined>(
    async (ids) => {
      const rows = await this.db.select(columns).from(users).where(inArray(users.id, [...ids]));
      return ids.map((id) => rows.find((row) => row.id === id));
    },
    { cache: false },
  );

  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  load(id: string): Promise<User | undefined> {
    return this.byId.load(id);
  }
}

```

- **请求作用域**。Nest 为每次请求创建新实例（参见 [Injection scopes](/fundamentals/provider-scopes)），因此一个请求的批处理永远不会与其他查看者混合，它加载的任何内容都不会在其生命周期结束后保留。作用域向上冒泡：注入加载器的解析器也是请求作用域的。在 GraphQL 中，一个请求是一个操作，一个订阅在运行期间是一个请求，无论其 Socket 携带其他什么。
- **无缓存**。开启 DataLoader 的缓存后，订阅的后续事件将使用其第一个事件加载的行：在作者发布帖子后到达的评论仍然会列出作者发布时的帖子。

每个帖子的第一个评论：`row_number()` 分别为每个帖子的评论编号，而 `LIMIT` 会将所有评论一起计数，并且每个 `first` 都有自己的 DataLoader，因为它改变了查询：

```typescript title="src/posts/comments.loader.ts"
import { Injectable, Scope } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import DataLoader from 'dataloader';
import { getColumns, inArray, lte, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { comments, type CommentRow } from '../database/schema.js';

/** The first comments of each post, oldest first, for one request. */
@Injectable({ scope: Scope.REQUEST })
export class CommentsLoader {
  // One DataLoader per `first`.
  private readonly byFirst = new Map<number, DataLoader<string, CommentRow[]>>();

  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  load(postId: string, first: number): Promise<CommentRow[]> {
    let loader = this.byFirst.get(first);
    if (!loader) {
      // No cache, as in UsersLoader.
      loader = new DataLoader((postIds) => this.firstOfEach([...postIds], first), { cache: false });
      this.byFirst.set(first, loader);
    }
    return loader.load(postId);
  }

  private async firstOfEach(postIds: string[], first: number): Promise<CommentRow[][]> {
    const ranked = this.db
      .select({
        ...getColumns(comments),
        rank: sql<number>`row_number() over (partition by ${comments.postId} order by ${comments.createdAt}, ${comments.id})`.as('rank'),
      })
      .from(comments)
      .where(inArray(comments.postId, postIds))
      .as('ranked');
    const rows = await this.db.select().from(ranked).where(lte(ranked.rank, first)).orderBy(ranked.rank);
    return postIds.map((id) => rows.filter((row) => row.postId === id));
  }
}

```

查看者可能看到的每个作者的最新帖子。一个请求有一个查看者，所以键会排除它；一个单例会保留它看到的第一个查看者：

```typescript title="src/posts/posts.loader.ts"
import { Injectable, Scope } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import DataLoader from 'dataloader';
import { and, getColumns, inArray, lte, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { posts, type PostRow } from '../database/schema.js';
import { visibleTo } from './visibility.js';

/** The latest posts of each author that the viewer may see, for one request. */
@Injectable({ scope: Scope.REQUEST })
export class PostsLoader {
  // One DataLoader per `first`; a request has one viewer.
  private readonly byFirst = new Map<number, DataLoader<string, PostRow[]>>();

  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  load(authorId: string, first: number, viewerId: string | null): Promise<PostRow[]> {
    let loader = this.byFirst.get(first);
    if (!loader) {
      // No cache, as in UsersLoader.
      loader = new DataLoader((authorIds) => this.latestOfEach([...authorIds], first, viewerId), { cache: false });
      this.byFirst.set(first, loader);
    }
    return loader.load(authorId);
  }

  private async latestOfEach(authorIds: string[], first: number, viewerId: string | null): Promise<PostRow[][]> {
    const ranked = this.db
      .select({
        ...getColumns(posts),
        rank: sql<number>`row_number() over (partition by ${posts.authorId} order by ${posts.publishedAt} desc nulls first, ${posts.id} desc)`.as('rank'),
      })
      .from(posts)
      .where(and(inArray(posts.authorId, authorIds), visibleTo(viewerId)))
      .as('ranked');
    const rows = await this.db.select().from(ranked).where(lte(ranked.rank, first)).orderBy(ranked.rank);
    return authorIds.map((id) => rows.filter((row) => row.authorId === id));
  }
}

```

`User.posts` 读取帖子，因此其解析器位于 posts 文件夹中：`PostsModule` 导入 `UsersModule` 以实现 `UsersLoader`，并且绝不反之，因此模块之间不相互导入：

```typescript title="src/posts/user-posts.resolver.ts"
import { Authenticate, CurrentUser } from '@nestjs/authentication';
import { Args, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { User } from '../users/user.model.js';
import { Post } from './post.model.js';
import { FirstArgs } from './posts.inputs.js';
import { PostsLoader } from './posts.loader.js';

// A field of User, resolved here, in the posts feature: PostsModule imports UsersModule, never the reverse.
@Authenticate({ optional: true })
@Resolver(() => User)
export class UserPostsResolver {
  constructor(private readonly postsLoader: PostsLoader) {}

  @ResolveField(() => [Post])
  posts(@Parent() user: User, @Args() { first }: FirstArgs, @CurrentUser('id') viewerId: string | null) {
    return this.postsLoader.load(user.id, first, viewerId ?? null);
  }
}

```

用户解析器具有 `me` 和 `email`：

```typescript title="src/users/users.resolver.ts"
import { Authenticate, CurrentUser } from '@nestjs/authentication';
import { Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { User } from './user.model.js';

@Authenticate({ optional: true })
@Resolver(() => User)
export class UsersResolver {
  @Authenticate({ optional: false })
  @Query(() => User)
  me(@CurrentUser() user: User) {
    return user;
  }

  // Only the user themselves sees their address; anyone else gets null.
  @ResolveField(() => String, { nullable: true })
  email(@Parent() user: User, @CurrentUser('id') viewerId: string | null) {
    return user.id === viewerId ? user.email : null;
  }
}

```

`email` 是一个字段解析器，而不是 [field middleware](/graphql/field-middleware)：中间件只有上下文，其 `req.user` 覆盖 `graphql-ws` 是 Socket 上最后一次认证操作（参见 [GraphQL and WebSockets](/security/authentication#graphql-and-websockets)），而 `@CurrentUser()` 是本次操作。

#### 使用变更签署用户

注册、登录和刷新工作方式与 [tutorial 1](/tutorials/rest-api-jwt-authentication#sign-users-in-with-jwts) 相同：一个有效期为 15 分钟的访问令牌和一个每次使用都会轮换的刷新令牌。这里它们是变更，并且有三个文件与教程 1 不同：用户有名称，用户类型是 GraphQL 模型，领域是博客的。用户仓储是唯一看到密码哈希的代码：

```typescript title="src/users/users.repository.ts"
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { users } from '../database/schema.js';
import type { User } from './user.model.js';

const columns = { id: users.id, email: users.email, name: users.name, createdAt: users.createdAt };

/** Only `User` objects leave this class: password hashes stay inside. */
@Injectable()
export class UsersRepository {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  /** The new user, or `null` when the email is taken. */
  async create(email: string, name: string, passwordHash: string): Promise<User | null> {
    // One statement: two sign-ups with the same email can't both succeed.
    const [user] = await this.db
      .insert(users)
      .values({ email: normalize(email), name, passwordHash })
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
}

export const normalize = (email: string) => email.trim().normalize('NFC').toLowerCase();

```

用户模块将其提供给认证代码，并提供 `UsersLoader` 给帖子功能：

```typescript title="src/users/users.module.ts"
import { Module } from '@nestjs/common';
import { UsersLoader } from './users.loader.js';
import { UsersRepository } from './users.repository.js';
import { UsersResolver } from './users.resolver.js';

@Module({
  providers: [UsersRepository, UsersLoader, UsersResolver],
  exports: [UsersRepository, UsersLoader],
})
export class UsersModule {}

```

`PasswordHasher` 使用 scrypt 哈希密码。当没有此类账户时，`verify()` 会检查一个虚拟哈希，因此响应时间不会泄露哪些电子邮件已注册：

```typescript title="src/auth/credentials.service.ts"
import { Injectable } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import { GraphQLError } from 'graphql';
import type { User } from '../users/user.model.js';
import { UsersRepository } from '../users/users.repository.js';

@Injectable()
export class CredentialsService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async register(email: string, name: string, password: string): Promise<User> {
    const user = await this.usersRepository.create(email, name, await this.passwordHasher.hash(password));
    if (!user) {
      throw new GraphQLError('Email already registered', { extensions: { code: 'EMAIL_TAKEN' } });
    }
    return user;
  }

  /** The user, or `null` when the email or the password is wrong. */
  async verify(email: string, password: string): Promise<User | null> {
    const found = await this.usersRepository.findCredentials(email);
    // With no account, verify() checks a dummy hash, so the response
    // time doesn't reveal which emails are registered.
    const valid = await this.passwordHasher.verify(password, found?.passwordHash);
    return valid && found ? found.user : null;
  }
}

```

`JwtBearerProvider` 读取 `Authorization` 头部，检查令牌的签名、过期时间、发行者和受众，并将其声明传递给 `validate()`：

```typescript title="src/auth/jwt-auth.provider.ts"
import { Injectable } from '@nestjs/common';
import { AuthenticationRegistry, JwtBearerProvider, type JwtClaims } from '@nestjs/authentication';
import type { User } from '../users/user.model.js';
import { UsersRepository } from '../users/users.repository.js';

@Injectable()
export class JwtAuth extends JwtBearerProvider<User> {
  constructor(
    private readonly usersRepository: UsersRepository,
    registry: AuthenticationRegistry,
  ) {
    // The key, issuer and audience come from the `accessToken` options.
    super({ realm: 'blog' });
    registry.registerProvider(this);
  }

  // Called once the signature, `exp`, `iss` and `aud` checked out.
  // Returning null (the user was deleted) rejects the token.
  validate({ sub }: JwtClaims) {
    return sub ? this.usersRepository.findById(sub) : null;
  }
}

```

有两个文件是教程 1 的。原样复制 `src/auth/drizzle-refresh-token.store.ts` 来自 [Store the refresh tokens](/tutorials/rest-api-jwt-authentication#store-the-refresh-tokens)：它将刷新令牌保存在 PostgreSQL 中，并且其条件 `UPDATE` 允许两个使用相同令牌的刷新中恰好有一个获胜。从 [Users](/tutorials/rest-api-jwt-authentication#users) 复制 `src/auth/auth-types.ts`，将 `User` 从 `../users/user.model.js` 导入而不是从 `../users/user.js`，因此 `@CurrentUser('id')` 只接受 `User` 的键。

变更的输入及其返回内容：

```typescript title="src/auth/auth.inputs.ts"
import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import { IsEmail, IsNotEmpty, Length, MaxLength } from 'class-validator';

@InputType()
export class SignUpInput {
  @Field()
  @IsEmail()
  email: string;

  @Field()
  @Length(1, 100)
  name: string;

  @Field()
  @Length(12, 128)
  password: string;
}

@InputType()
export class SignInInput {
  @Field()
  @IsEmail()
  email: string;

  // No minimum here: a password set under an older rule still signs in.
  @Field()
  @MaxLength(128)
  password: string;
}

@InputType()
export class RefreshTokenInput {
  @Field()
  @IsNotEmpty()
  refreshToken: string;
}

@ObjectType()
export class AuthPayload {
  @Field()
  accessToken: string;

  @Field()
  refreshToken: string;

  @Field(() => Int, { description: "The access token's lifetime, in seconds." })
  expiresIn: number;
}

```

解析器使用 `TokenService` 发出令牌。重复使用的刷新令牌意味着两个方持有它，因此 `TokenService` 撤销其家族，并抛出 `AuthenticationError`，客户端接收到的是 `UNAUTHENTICATED`（参见 [Issue tokens to the mobile app](/security/authentication#issue-tokens-to-the-mobile-app)）：

```typescript title="src/auth/auth.resolver.ts"
import { Logger, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Public, TokenService } from '@nestjs/authentication';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { SkipThrottle, Throttle, hours, minutes } from '@nestjs/throttler';
import { AuthPayload, RefreshTokenInput, SignInInput, SignUpInput } from './auth.inputs.js';
import { CredentialsService } from './credentials.service.js';
import { GqlThrottlerGuard } from './gql-throttler.guard.js';

@Public()
@UseGuards(GqlThrottlerGuard)
@Resolver()
export class AuthResolver {
  private readonly logger = new Logger(AuthResolver.name);

  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly tokenService: TokenService,
  ) {}

  @SkipThrottle({ account: true })
  @Throttle({ default: { limit: 10, ttl: hours(1) } })
  @Mutation(() => AuthPayload)
  async signUp(@Args('input') { email, name, password }: SignUpInput) {
    const user = await this.credentialsService.register(email, name, password);
    return this.tokenService.issue(user.id, { method: 'password', claims: { amr: ['pwd'] } });
  }

  @Throttle({
    default: { limit: 30, ttl: minutes(15) },
    account: { limit: 5, ttl: minutes(15) },
  })
  @Mutation(() => AuthPayload)
  async signIn(@Args('input') { email, password }: SignInInput) {
    const user = await this.credentialsService.verify(email, password);
    if (!user) {
      this.logger.warn('Sign-in failed', { email });
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.tokenService.issue(user.id, { method: 'password', claims: { amr: ['pwd'] } });
  }

  // An unknown, expired or reused refresh token is UNAUTHENTICATED; reuse revokes the family.
  @Mutation(() => AuthPayload)
  refreshToken(@Args('input') { refreshToken }: RefreshTokenInput) {
    return this.tokenService.refresh(refreshToken);
  }
}

```

认证模块：

```typescript title="src/auth/auth.module.ts"
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { AuthResolver } from './auth.resolver.js';
import { CredentialsService } from './credentials.service.js';
import { DrizzleRefreshTokenStore } from './drizzle-refresh-token.store.js';
import { JwtAuth } from './jwt-auth.provider.js';

@Module({
  imports: [UsersModule],
  providers: [AuthResolver, JwtAuth, CredentialsService, DrizzleRefreshTokenStore],
})
export class AuthModule {}

```

##### 速率限制登录

限制在 [tutorial 1's](/tutorials/rest-api-jwt-authentication#rate-limit-sign-in)。`GqlThrottlerGuard` 在 `src/auth/gql-throttler.guard.ts` 中是来自 [GraphQL](/security/rate-limiting#graphql) 的守卫，仅应用于 `AuthResolver`，因为有了 `fieldResolverEnhancers`，全局守卫会计算每个解析的字段。它还覆盖了 `throwThrottlingException()` 以抛出带有代码 `TOO_MANY_REQUESTS` 和 `retryAfter` 的 `GraphQLError`，即阻塞解除前的秒数（`timeToBlockExpire`）：429 会作为 `INTERNAL_SERVER_ERROR` 到达客户端。该应用自己的是 `account` 跟踪器，它由 `AppModule` 配置，并且它从变更的参数中读取电子邮件，而不是请求体，并使用用户仓储的 `normalize()` 进行标准化。同一文件导出了它：

```typescript title="src/auth/gql-throttler.guard.ts"
// ...

/** The address the mutation's `input` names, normalized as the users table stores it, or `''`. */
export function accountEmail(context: ExecutionContext): string {
  const email = GqlExecutionContext.create(context).getArgs<{ input?: { email?: unknown } }>().input?.email;
  return typeof email === 'string' ? normalize(email) : '';
}

```

#### 配置 GraphQL 模块

GraphQL 模块的选项来自一个类，Nest 会使用其依赖项创建该类（参见 [Async configuration](/graphql/quick-start#异步配置)）：

```typescript title="src/graphql/graphql.config.ts"
import type { IncomingMessage } from 'node:http';
import type { ApolloDriverConfig } from '@nestjs/apollo';
import { Injectable } from '@nestjs/common';
import { WsAuthenticator } from '@nestjs/authentication';
import type { GqlOptionsFactory } from '@nestjs/graphql';
import { GraphQLError, getOperationAST, parse } from 'graphql';
import type { Context, SubscribePayload } from 'graphql-ws';
import type { Extra } from 'graphql-ws/use/ws';

type SocketContext = Context<Record<string, unknown> | undefined, Extra>;

@Injectable()
export class GraphqlConfig implements GqlOptionsFactory<ApolloDriverConfig> {
  constructor(private readonly wsAuthenticator: WsAuthenticator) {}

  createGqlOptions(): ApolloDriverConfig {
    const production = process.env.NODE_ENV === 'production';
    return {
      autoSchemaFile: true,
      sortSchema: true,
      subscriptions: {
        'graphql-ws': {
          onConnect: (context) => this.authenticateSocket(context as SocketContext),
          onSubscribe: (_context, _id, payload) => this.checkSocketOperation(payload),
        },
      },
      // Called for every operation. Over graphql-ws, the socket's upgrade request stands in for `req`.
      context: ({ req, res, extra }: { req?: IncomingMessage; res?: unknown; extra?: Extra }) => ({
        req: req ?? extra?.request,
        res,
      }),
      fieldResolverEnhancers: ['guards', 'interceptors', 'filters'],
      formatError: (error) =>
        // In production, an error nobody threw on purpose tells the client nothing.
        production && error.extensions?.code === 'INTERNAL_SERVER_ERROR'
          ? { message: 'Internal server error', path: error.path, extensions: { code: 'INTERNAL_SERVER_ERROR' } }
          : error,
    };
  }

  /** Runs once per socket: `false` closes it with 4403 Forbidden. */
  private async authenticateSocket({ connectionParams, extra }: SocketContext) {
    // Browsers can't set headers on a WebSocket: the token comes in connectionParams,
    // and goes on the upgrade request, where the guard reads it for every operation.
    if (typeof connectionParams?.authorization === 'string') {
      extra.request.headers.authorization = connectionParams.authorization;
    }
    const result = await this.wsAuthenticator.authenticateConnection(extra.socket, extra.request, { required: false });
    return result !== null;
  }

  /**
   * graphql-ws runs operations outside Apollo Server, whose plugins don't apply to them.
   * The socket serves subscriptions only; queries and mutations go over HTTP.
   */
  private checkSocketOperation({ query, operationName }: SubscribePayload) {
    let document;
    try {
      document = parse(query);
    } catch (error) {
      return [error as GraphQLError];
    }
    if (getOperationAST(document, operationName)?.operation !== 'subscription') {
      return [new GraphQLError('Only subscriptions are served over WebSocket: send queries and mutations over HTTP')];
    }
    return undefined;
  }
}

```

- **`context` 是一个函数**，因为 [GraphQL and WebSockets](/security/authentication#graphql-and-websockets) 要求：守卫读取上下文的 `req` 头部。
- **`fieldResolverEnhancers`** 使 Nest 在字段解析器上也运行守卫、拦截器和过滤器（参见 [Execute enhancers at the field resolver level](/graphql/guards-interceptors#在字段解析器级别执行增强器)）。守卫为它们提供 `@CurrentUser()`。过滤器记录它们抛出的内容：如果没有它们，`Post.author` 中的错误会直接到达客户端，而日志中没有相应的行。
- **`formatError` 在生产环境中隐藏意外错误。** Apollo Server 在那里省略了堆栈跟踪，但保留了消息，例如数据库错误中命名的主机。
- **Socket 在打开时进行一次认证。** 浏览器不能在 WebSocket 上设置头部，因此客户端将令牌发送在 `connectionParams` 中。`authenticateSocket()` 将其复制到升级请求中，并使用 `WsAuthenticator` 进行检查，该检查运行守卫的提供者。`false` 在任何操作之前使用 4403 关闭 Socket。
- **Socket 仅用于订阅。** `graphql-ws` 在 Apollo Server 外部执行接收到的内容，因此 Apollo Server 的插件永远看不到它，并且它像订阅一样容易运行查询或变更。自 `@nestjs/apollo` 14.2.2 以来，Apollo 驱动程序将 `introspection` 设置应用于 Socket；在此之前，即使在生产环境中，内省查询也会通过 Socket 获取模式。`checkSocketOperation()` 拒绝所有内容，只允许订阅，因此发送查询或变更的唯一方式是通过 HTTP，并经过 Apollo Server 的检查。

#### 使用订阅推送新评论

两个解析器用于服务评论：一个用于 `author` 字段，它注入了 `UsersLoader`；另一个用于 `addComment` 变更和 `commentAdded` 订阅（参见 [Subscriptions](/graphql/subscriptions)）。Nest 要求带有 `@Subscription()` 的解析器是单例，因此它不能注入请求作用域的提供者：

```typescript title="src/posts/comments.resolver.ts"
import { Inject } from '@nestjs/common';
import { Authenticate, CurrentUser } from '@nestjs/authentication';
import { Args, Mutation, Parent, ResolveField, Resolver, Subscription } from '@nestjs/graphql';
import { PubSub } from 'graphql-subscriptions';
import { notFound } from '../graphql/errors.js';
import { User } from '../users/user.model.js';
import { UsersLoader } from '../users/users.loader.js';
import { Comment } from './comment.model.js';
import { AddCommentInput, CommentAddedArgs } from './posts.inputs.js';
import { PostsService, PUB_SUB, commentAddedTopic } from './posts.service.js';

// Request-scoped, since it injects UsersLoader.
@Authenticate({ optional: true })
@Resolver(() => Comment)
export class CommentAuthorResolver {
  constructor(private readonly usersLoader: UsersLoader) {}

  @ResolveField(() => User)
  author(@Parent() comment: Comment) {
    return this.usersLoader.load(comment.authorId);
  }
}

// A singleton: Nest requires one for a resolver with a @Subscription().
@Resolver(() => Comment)
export class CommentsResolver {
  constructor(
    private readonly postsService: PostsService,
    @Inject(PUB_SUB) private readonly pubSub: PubSub,
  ) {}

  @Mutation(() => Comment)
  addComment(@CurrentUser('id') userId: string, @Args('input') input: AddCommentInput) {
    return this.postsService.addComment(userId, input);
  }

  @Subscription(() => Comment)
  async commentAdded(@Args() { postId }: CommentAddedArgs, @CurrentUser('id') userId: string) {
    // Subscribing to someone else's draft is the same as to a post that doesn't exist.
    if (!(await this.postsService.findVisible(postId, userId))) {
      notFound('Post');
    }
    // One topic per post: a comment wakes only the subscribers of its own post.
    return this.pubSub.asyncIterableIterator(commentAddedTopic(postId));
  }
}

```

- **每次操作认证。** 守卫针对订阅运行，使用 Socket 打开时的令牌。
- **别人的草稿是 `NOT_FOUND`。** 草稿不包含评论，但任何其他答案都会告诉客户端草稿存在。
- **每篇帖子一个主题**，而不是一个主题和 [`filter`](/graphql/subscriptions#filtering-subscriptions)，后者将针对每篇帖子上的每个评论的每个订阅者运行。

posts 模块提供了四个解析器、服务、两个加载器和 `PubSub`：

```typescript title="src/posts/posts.module.ts"
import { Module } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import { UsersModule } from '../users/users.module.js';
import { CommentAuthorResolver, CommentsResolver } from './comments.resolver.js';
import { CommentsLoader } from './comments.loader.js';
import { PostsLoader } from './posts.loader.js';
import { PostsResolver } from './posts.resolver.js';
import { PostsService, PUB_SUB } from './posts.service.js';
import { UserPostsResolver } from './user-posts.resolver.js';

@Module({
  // For UsersLoader. UsersModule imports nothing of the posts feature.
  imports: [UsersModule],
  providers: [
    PostsResolver,
    CommentsResolver,
    CommentAuthorResolver,
    UserPostsResolver,
    PostsService,
    PostsLoader,
    CommentsLoader,
    // In memory, in this process: see the production checklist.
    { provide: PUB_SUB, useValue: new PubSub() },
  ],
  exports: [PostsLoader, CommentsLoader],
})
export class PostsModule {}

```

#### 组装应用程序

根模块注册配置、数据库、认证、GraphQL 和速率限制，以及应用于每个操作的管道和过滤器：

```typescript title="src/app.module.ts"
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AuthenticationModule } from '@nestjs/authentication';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DrizzleModule } from '@nestjs/drizzle';
import { GraphQLModule } from '@nestjs/graphql';
import { createObserveModule } from '@nestjs/observe';
import { ThrottlerModule, minutes, normalizeIp } from '@nestjs/throttler';
import { drizzle } from 'drizzle-orm/node-postgres';
import { AuthModule } from './auth/auth.module.js';
import { accountEmail } from './auth/gql-throttler.guard.js';
import { envSchema, type Env } from './config.js';
import { badUserInput, GraphQLErrorFilter } from './graphql/errors.js';
import { GraphqlConfig } from './graphql/graphql.config.js';
import { PostsModule } from './posts/posts.module.js';
import { UsersModule } from './users/users.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // First, so it shuts down last and still sends what the other modules did.
    ObserveModule.forRoot({
      // Empty until `npx @nestjs/observe link` writes the key pair into .env: the SDK then sends nothing.
      appKey: process.env.OBSERVE_APP_KEY ?? '',
      appSecret: process.env.OBSERVE_APP_SECRET ?? '',
      serviceId: 'blog-api',
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
          issuer: 'blog-api',
          audience: 'blog-api',
          ttl: '15m',
        },
        refreshToken: { ttl: '30d', absoluteTtl: '90d' },
      }),
    }),
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      useClass: GraphqlConfig,
    }),
    ThrottlerModule.forRoot([
      // Per IP address, on the mutations that sign users in.
      { name: 'default', ttl: minutes(1), limit: 100 },
      // Per email and IP address, wherever the mutation's input names an account.
      {
        name: 'account',
        ttl: minutes(15),
        limit: 5,
        skipIf: (context) => !accountEmail(context),
        getTracker: (req, context) => `${accountEmail(context)}|${normalizeIp(req.ip)}`,
      },
    ]),
    UsersModule,
    AuthModule,
    PostsModule,
  ],
  providers: [
    { provide: APP_PIPE, useValue: new ValidationPipe({ transform: true, exceptionFactory: badUserInput }) },
    { provide: APP_FILTER, useClass: GraphQLErrorFilter },
  ],
})
export class AppModule {}

```

- **`ObserveModule` 在 `imports` 中最先出现**，因为 [SDK's quick start](/observability/sdk#quick-start) 这样做：模块按相反顺序关闭，因此它最后停止，并发送其他模块记录的内容（参见 [Shutdown](/observability/sdk#shutdown)）。`createObserveModule()` 使用 `ObserveInstrument` 返回它，而 `main.ts` 将其传递给 Nest。
- **键值对在链接项目之前是空的。** 没有它，SDK 不发送任何内容，并在启动时报告这一点。`npx @nestjs/observe link` 将 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET` 写入 `.env`，并将 `--env-file .env` 添加到 `start` 脚本中，因此在导入 `AppModule` 时它们在环境中，此时 SDK 读取它们（参见 [Linking from the terminal](/observability/sdk#linking-from-the-terminal)）。
- **`transform: true`** 使参数实例为其类的实例，这是 class-validator 所需要的。管道和过滤器是 `AppModule` 的提供者，因此测试也会获得它们。

`main.ts` 在 Node 适配器上创建应用程序，并将选项，其中包含 `instrument`，作为第三个参数：

```typescript title="src/main.ts"
import { ConsoleLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NodeAdapter, type NestNodeApplication } from '@nestjs/platform-node';
import { AppModule, ObserveInstrument } from './app.module.js';
import type { Env } from './config.js';

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
app.useSecurityHeaders({
  // GraphiQL, served outside production only, loads its scripts from unpkg.com.
  contentSecurityPolicy: production
    ? true
    : { directives: { scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'] } },
});
app.enableShutdownHooks();

const config = app.get<ConfigService<Env, true>>(ConfigService);
app.enableCors({ origin: config.get('CORS_ORIGINS', { infer: true }) });

await app.listen(config.get('PORT', { infer: true }));

```

生产环境中的日志是 JSON 格式，密码和令牌被屏蔽（参见 [JSON logging](/application/logger#json-logging)）。安全策略在生产环境之外对 GraphiQL 进行了放宽，GraphiQL 从 `unpkg.com` 加载其脚本（参见 [Swagger UI and GraphQL IDEs](/security/helmet#swagger-ui-and-graphql-ides)）。CORS 仅允许 `CORS_ORIGINS`（参见 [Default allowed origins](/security/cors#default-allowed-origins)）。

#### 播种数据库

一个脚本为博客提供了两个用户、十二篇已发布帖子、每篇一个草稿和评论：

```typescript title="src/database/seed.ts"
import { PasswordHasher } from '@nestjs/authentication';
import { drizzle } from 'drizzle-orm/node-postgres';
import { envSchema } from '../config.js';
import { comments, posts, users } from './schema.js';

// Development data: empties the tables, then adds two users, their posts and comments.
const { NODE_ENV, DATABASE_URL } = envSchema.parse(process.env);
if (NODE_ENV === 'production') {
  throw new Error('Refusing to seed a production database');
}
const db = drizzle(DATABASE_URL);
const passwordHash = await new PasswordHasher().hash('correct horse battery');
await db.execute('TRUNCATE users, posts, comments, refresh_tokens');

const [ada, bob] = await db
  .insert(users)
  .values([
    { email: 'ada@example.com', name: 'Ada', passwordHash },
    { email: 'bob@example.com', name: 'Bob', passwordHash },
  ])
  .returning();
// Twelve published posts, an hour apart, by Ada and Bob in turn, and a draft each.
const published = await db
  .insert(posts)
  .values(
    Array.from({ length: 12 }, (_, i) => ({
      authorId: [ada, bob][i % 2].id,
      title: `Post ${i + 1}`,
      body: `The body of post ${i + 1}.`,
      publishedAt: new Date(Date.now() - (12 - i) * 3_600_000),
    })),
  )
  .returning();
await db.insert(posts).values([
  { authorId: ada.id, title: "Ada's draft", body: 'Not ready yet.' },
  { authorId: bob.id, title: "Bob's draft", body: 'Not ready either.' },
]);
// A comment on each post, by the other user.
await db
  .insert(comments)
  .values(published.map((post) => ({ postId: post.id, authorId: post.authorId === ada.id ? bob.id : ada.id, body: `About ${post.title}` })));

console.log(`Seeded 2 users, ${published.length} published posts and 2 drafts`);
await db.$client.end();

```

向 `package.json` 添加一个脚本：

```json
"db:seed": "node --env-file-if-exists=.env dist/database/seed.js"

```

构建应用程序并播种：

```bash
$ npm run build
$ npm run db:seed
...
Seeded 2 users, 12 published posts and 2 drafts

```

#### 试用

启动应用程序：

```bash
$ npm run start

```

在开发环境中，GraphiQL 在 `http://localhost:3000/graphql`，即 API 的自有 URL：在其头部编辑器中添加一个 `Authorization` 头部，以用户身份运行操作。使用 curl，以 Ada 和 Bob 登录，并保留它们的访问令牌：

```bash
$ curl localhost:3000/graphql --json '{"query":"mutation ($input: SignInInput!) { signIn(input: $input) { accessToken refreshToken expiresIn } }","variables":{"input":{"email":"ada@example.com","password":"correct horse battery"}}}'
{"data":{"signIn":{"accessToken":"eyJhbGciOiJIUzI1NiIs...","refreshToken":"I-NorWBT--e6Jkit...","expiresIn":900}}}
$ ADA=eyJhbGciOiJIUzI1NiIs...
$ BOB=eyJhbGciOiJIUzI1NiIs... # the same, with bob@example.com

```

已发布帖子的第一页，然后是下一页，该页从 `endCursor` 之后开始：

```bash
$ curl localhost:3000/graphql --json '{"query":"{ posts(first: 2) { edges { node { title author { name email } comments(first: 1) { body } } } pageInfo { hasNextPage endCursor } } }"}'
{"data":{"posts":{"edges":[{"node":{"title":"Post 12","author":{"name":"Bob","email":null},"comments":[{"body":"About Post 12"}]}},...],"pageInfo":{"hasNextPage":true,"endCursor":"MTc5NTY3Njg0NzQzMTo3NTYwM2RiNC0xZjJlLTQ1MDYtOTVjNy0wNzM3MmY0NjdiMzc"}}}}
$ curl localhost:3000/graphql --json '{"query":"query ($after: String) { posts(first: 2, after: $after) { edges { node { title } } } }","variables":{"after":"MTc5NTY3Njg0NzQzMTo3NTYwM2RiNC0xZjJlLTQ1MDYtOTVjNy0wNzM3MmY0NjdiMzc"}}'
{"data":{"posts":{"edges":[{"node":{"title":"Post 10"}},{"node":{"title":"Post 9"}}]}}}

```

Ada 的列表以她的草稿开始。Bob 为它获得 `null`，因为该 ID 不存在：

```bash
$ curl localhost:3000/graphql -H "Authorization: Bearer $ADA" --json '{"query":"{ me { posts(first: 2) { id title publishedAt } } }"}'
{"data":{"me":{"posts":[{"id":"5761230b-00cd-4fbd-aedc-7a751770daa9","title":"Ada's draft","publishedAt":null},{"id":"75603db4-1f2e-4506-95c7-07372f467b37","title":"Post 11",...}]}}}
$ curl localhost:3000/graphql -H "Authorization: Bearer $BOB" --json '{"query":"query ($id: ID!) { post(id: $id) { title } }","variables":{"id":"5761230b-00cd-4fbd-aedc-7a751770daa9"}}'
{"data":{"post":null}}

```

错误带有代码：Bob 不能更改 Ada 的帖子，标题不能是 `null`。在开发环境中，`extensions` 也带有堆栈跟踪：

```bash
$ curl localhost:3000/graphql -H "Authorization: Bearer $BOB" --json '{"query":"mutation ($id: ID!) { updatePost(input: { id: $id, title: \"Mine now\" }) { title } }","variables":{"id":"75603db4-1f2e-4506-95c7-07372f467b37"}}'
{"errors":[{"message":"Only the author can change this post",...,"extensions":{"code":"FORBIDDEN",...}}],"data":null}
$ curl localhost:3000/graphql -H "Authorization: Bearer $ADA" --json '{"query":"mutation ($id: ID!) { updatePost(input: { id: $id, title: null }) { title } }","variables":{"id":"75603db4-1f2e-4506-95c7-07372f467b37"}}'
{"errors":[{"message":"title must be longer than or equal to 1 characters; title must be a string",...,"extensions":{"code":"BAD_USER_INPUT","fields":{"title":[...]},...}}],"data":null}

```

一个简短的脚本监控帖子的评论，使用提供的令牌：

```typescript title="scripts/watch-comments.ts"
// Prints the comments added to a post as they arrive: node scripts/watch-comments.ts <postId> <accessToken>
import { createClient } from 'graphql-ws';

const [postId, accessToken] = process.argv.slice(2);
const client = createClient({
  url: process.env.WS_URL ?? 'ws://localhost:3000/graphql',
  // Sent once, when the socket opens. Node.js 22 has a WebSocket client built in, as browsers do.
  connectionParams: { authorization: `Bearer ${accessToken}` },
  retryAttempts: 0,
});

try {
  const comments = client.iterate({
    query: 'subscription ($postId: ID!) { commentAdded(postId: $postId) { body author { name } } }',
    variables: { postId },
  });
  for await (const result of comments) {
    console.log(JSON.stringify(result));
  }
} catch (error) {
  // The server closed the socket: 4403 when it refused the token.
  const { code, reason } = error as CloseEvent;
  console.error(`Closed: ${code} ${reason}`);
}

```

在第二个终端中运行它，使用 Ada 的 `Post 11` ID 和 Bob 的令牌，并在第一个终端中以 Ada 的身份添加评论。脚本打印它，如果令牌错误，服务器会在任何订阅之前关闭 Socket：

```bash
$ node scripts/watch-comments.ts 75603db4-1f2e-4506-95c7-07372f467b37 $BOB
{"data":{"commentAdded":{"body":"Thanks for reading!","author":{"name":"Ada"}}}}
$ node scripts/watch-comments.ts 75603db4-1f2e-4506-95c7-07372f467b37 not-a-token
Closed: 4403 Forbidden

```

从第一个终端以 Ada 的身份添加的评论：

```bash
$ curl localhost:3000/graphql -H "Authorization: Bearer $ADA" --json '{"query":"mutation ($input: AddCommentInput!) { addComment(input: $input) { id } }","variables":{"input":{"postId":"75603db4-1f2e-4506-95c7-07372f467b37","body":"Thanks for reading!"}}}'
{"data":{"addComment":{"id":"c7ca2df6-811b-4292-9b9b-067281eab611"}}}

```

#### 测试

测试在 PostgreSQL 测试数据库上启动真实的 `AppModule`，该数据库使用一个计算其发送的 SQL 语句的连接，并使用更便宜的 scrypt 成本。大多数发送操作使用 `app.inject()`，这是 Node 适配器提供的；WebSocket 测试监听一个端口：

```typescript title="test/test-app.ts"
import { fileURLToPath } from 'node:url';
import { PasswordHasher } from '@nestjs/authentication';
import { getDrizzleToken } from '@nestjs/drizzle';
import { NodeAdapter, type NestNodeApplication } from '@nestjs/platform-node';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

export interface TestApp {
  app: NestNodeApplication;
  /** How many SQL statements the application has sent so far. */
  sqlCount: () => number;
  close: () => Promise<void>;
}

/** The real AppModule on the database in TEST_DATABASE_URL, emptied first. */
export async function createTestApp(): Promise<TestApp> {
  // Imported here, so a test file can set NODE_ENV before the module reads it.
  const { AppModule } = await import('../src/app.module.js');
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  let count = 0;
  const db = drizzle({ client: pool, logger: { logQuery: () => void count++ } });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
  await db.execute(sql`TRUNCATE users, posts, comments, refresh_tokens CASCADE`);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(getDrizzleToken())
    .useValue(db)
    // scrypt at the default cost takes 128 MiB and a few hundred ms per hash.
    .overrideProvider(PasswordHasher)
    .useValue(new PasswordHasher({ logN: 10 }))
    .compile();
  const app = moduleRef.createNestApplication<NestNodeApplication>(new NodeAdapter());
  await app.init();
  return {
    app,
    sqlCount: () => count,
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
}

export interface GqlResult {
  data?: any;
  errors?: { message: string; path?: string[]; extensions: { code: string; [key: string]: unknown } }[];
}

let clients = 0;

/** Sends an operation with app.inject(), from an address of its own. */
export async function gql(
  app: NestNodeApplication,
  query: string,
  { variables, token }: { variables?: Record<string, unknown>; token?: string } = {},
): Promise<GqlResult> {
  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload: { query, variables },
    // Sign-up is limited per IP address: each test client gets an address of its own.
    remoteAddress: `10.0.0.${++clients}`,
  });
  return res.json();
}

export async function signUp(app: NestNodeApplication, name: string): Promise<{ accessToken: string; refreshToken: string }> {
  const { data } = await gql(app, 'mutation ($input: SignUpInput!) { signUp(input: $input) { accessToken refreshToken } }', {
    variables: { input: { email: `${name.toLowerCase()}@example.com`, name, password: 'correct horse battery' } },
  });
  return data.signUp;
}

/** Creates a post, and publishes it unless it's to stay a draft. */
export async function createPost(app: NestNodeApplication, token: string, title: string, publish = true): Promise<string> {
  const create = 'mutation ($input: CreatePostInput!) { createPost(input: $input) { id } }';
  const { id } = (await gql(app, create, { token, variables: { input: { title, body: '' } } })).data.createPost;
  if (publish) {
    await gql(app, 'mutation ($id: ID!) { publishPost(id: $id) { id } }', { token, variables: { id } });
  }
  return id;
}

```

```typescript title="vitest.config.e2e.ts"
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Node.js loads graphql's CommonJS build for @nestjs/graphql and Apollo Server; without this,
    // Vite would give the tested code its ES module build, a second copy that rejects the schema.
    alias: [{ find: /^graphql$/, replacement: 'graphql/index.js' }],
  },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // The files share one test database, which each one empties first.
    fileParallelism: false,
    env: {
      // Validated at startup; the tests replace the connection with their own.
      DATABASE_URL: 'postgres://unused-in-tests',
      JWT_SECRET: 'test-only-jwt-secret-of-at-least-32-bytes',
    },
  },
});

```

测试配置为应用程序提供环境，并按顺序运行文件，因为它们共享数据库：

```typescript title="test/blog.e2e-spec.ts"
import type { AddressInfo } from 'node:net';
import { createClient } from 'graphql-ws';
import { createPost, createTestApp, gql, signUp, type GqlResult, type TestApp } from './test-app.js';

describe.skipIf(!process.env.TEST_DATABASE_URL)('Blog API (e2e)', () => {
  let t: TestApp;
  let wsUrl: string;
  let ada: string;
  let bob: string;

  beforeAll(async () => {
    t = await createTestApp();
    // Port 0: the OS picks a free one.
    await t.app.listen(Number(process.env.TEST_PORT ?? 0), '127.0.0.1');
    wsUrl = `ws://127.0.0.1:${(t.app.getHttpServer().address() as AddressInfo).port}/graphql`;
    ada = (await signUp(t.app, 'Ada')).accessToken;
    bob = (await signUp(t.app, 'Bob')).accessToken;
  });
  afterAll(() => t.close());

  const post = (token: string, title: string, publish?: boolean) => createPost(t.app, token, title, publish);
  const code = (result: GqlResult) => result.errors?.[0].extensions.code;
  const ids = (list: { id: string }[]) => list.map((item) => item.id);

  it('hides a draft from everyone but its author, through every path', async () => {
    const draft = await post(ada, 'Draft', false);
    const published = await post(ada, 'Published');
    const byId = 'query ($id: ID!) { post(id: $id) { id author { posts(first: 50) { id } } } }';
    expect((await gql(t.app, byId, { token: ada, variables: { id: draft } })).data.post.id).toBe(draft);

    for (const token of [bob, undefined]) {
      expect((await gql(t.app, byId, { token, variables: { id: draft } })).data.post).toBeNull();
      const list = await gql(t.app, '{ posts(first: 50) { edges { node { id } } } }', { token });
      expect(list.data.posts.edges.map((edge: any) => edge.node.id)).not.toContain(draft);
      const viaAuthor = await gql(t.app, byId, { token, variables: { id: published } });
      expect(ids(viaAuthor.data.post.author.posts)).toContain(published);
      expect(ids(viaAuthor.data.post.author.posts)).not.toContain(draft);
    }
    // Writes answer NOT_FOUND, as for an unknown id: nobody learns the draft exists.
    for (const mutation of [
      'mutation ($id: ID!) { updatePost(input: { id: $id, title: "Mine now" }) { id } }',
      'mutation ($id: ID!) { publishPost(id: $id) { id } }',
      'mutation ($id: ID!) { addComment(input: { postId: $id, body: "First!" }) { id } }',
    ]) {
      expect(code(await gql(t.app, mutation, { token: bob, variables: { id: draft } }))).toBe('NOT_FOUND');
    }
    expect(ids((await gql(t.app, '{ me { posts(first: 50) { id } } }', { token: ada })).data.me.posts)).toContain(draft);
  });

  it('batches nested fields: the number of SQL queries stays flat as the posts grow', async () => {
    const queriesFor = async () => {
      const before = t.sqlCount();
      const query = '{ posts(first: 50) { edges { node { author { name posts(first: 2) { id } } comments(first: 5) { author { name } } } } } }';
      const { data } = await gql(t.app, query);
      return { posts: data.posts.edges.length, queries: t.sqlCount() - before };
    };
    const addPosts = async (count: number) => {
      for (let i = 0; i < count; i++) {
        const postId = await post(i % 2 ? ada : bob, `Post ${i}`);
        await gql(t.app, 'mutation ($postId: ID!) { addComment(input: { postId: $postId, body: "Nice" }) { id } }', {
          token: i % 2 ? bob : ada,
          variables: { postId },
        });
      }
    };
    await addPosts(3);
    const few = await queriesFor();
    await addPosts(20);
    const many = await queriesFor();

    expect(many.posts).toBe(few.posts + 20);
    expect(many.queries).toBe(few.queries);
    // At most the posts, their authors, the authors' posts, the comments and their authors.
    expect(many.queries).toBeLessThanOrEqual(5);
  });

  it('refuses a WebSocket without a valid token, before any operation', async () => {
    const postId = await post(ada, 'Guarded');
    for (const token of [undefined, 'not-a-jwt', `${ada}x`]) {
      const client = createClient({ url: wsUrl, connectionParams: { authorization: `Bearer ${token}` }, retryAttempts: 0 });
      const comments = client.iterate({ query: 'subscription ($postId: ID!) { commentAdded(postId: $postId) { body } }', variables: { postId } });
      // The client rejects with the CloseEvent: 4403 Forbidden.
      await expect(comments.next()).rejects.toMatchObject({ code: 4403 });
    }
  });
});

```

Vite 将 `graphql` 解析为其 ES 模块构建，而 Node.js 为 `@nestjs/graphql` 和 Apollo Server 提供 CommonJS 构建：两个副本，并且 `graphql-ws` 以 "Cannot use GraphQLSchema ... from another module or realm" 失败。别名也为测试代码提供了 CommonJS 构建。完整的三个测试包括：一个在所有路径上隐藏的草稿、一个随着帖子增长而保持不变的 SQL 计数，以及一个没有有效令牌的 WebSocket 被拒绝：

[example repository](https://github.com/nestjs/example-graphql-api) 中的另外三个文件证明了其他保证：

- `test/errors.e2e-spec.ts`：一个匿名变更是 `UNAUTHENTICATED`，非作者的更新是 `FORBIDDEN`，电子邮件只到达其所有者，无效参数是 `BAD_USER_INPUT` 带有可读消息，并且重复使用的刷新令牌被拒绝，以及其后续操作。
- `test/subscriptions.e2e-spec.ts`：一个订阅者收到其帖子的评论而不是其他人的评论，另一个用户的草稿是 `NOT_FOUND`，并且 socket 拒绝了内省和变更。
- `test/production.e2e-spec.ts`：在导入 `AppModule` 之前将 `NODE_ENV` 设置为 `production`，意外错误被掩盖，而故意抛出的错误保留了其消息而没有堆栈跟踪。

向 `package.json` 添加一个脚本：

```json
"test:e2e": "vitest run --config ./vitest.config.e2e.ts"

```

先创建测试数据库一次，然后针对它运行文件：

```bash
$ docker exec blog-db psql -U postgres -c "CREATE DATABASE blog_test"
$ TEST_DATABASE_URL=postgres://postgres:blog@localhost:5432/blog_test npm run test:e2e

 Test Files  4 passed (4)
      Tests  12 passed (12)

```

没有受保护的代码，每个测试都会失败。如果没有三个加载器中的 DataLoader，SQL 计数会随着帖子的增加而增长。如果没有 `onConnect`，一个没有令牌的 socket 就会打开。如果没有 `onSubscribe`，一个内省查询和一个变更会在 socket 上运行。

#### 生产检查清单

- **将 `NODE_ENV` 设置为 `production`。** 认证模块随后在没有刷新令牌存储的情况下拒绝启动，并且：
  - 内省被拒绝，通过 Apollo Server 的 HTTP 方式（`GRAPHQL_VALIDATION_FAILED`），以及通过仅提供订阅的 socket 方式。
  - `/graphql` 不提供 GraphiQL，并且 Apollo Server 的 CSRF 防护对来自另一个网站页面的请求（例如 `text/plain` 帖子）的预检请求不发送 400 响应。
  - 错误不携带堆栈跟踪，并且 `formatError` 用 `Internal server error` 替换了意外错误的消息。
- **将 `JWT_SECRET` 保存在平台的密钥存储中**，在运行时注入，并在新版本启动之前作为发布步骤运行 `drizzle-kit migrate`。
- **在运行第二个实例之前替换内存中的 `PubSub`**：在一个实例上添加的评论永远不会到达连接到另一个实例的订阅者。使用由 Redis 或其他代理支持的（参见 [`PubSub` implementations](https://github.com/apollographql/graphql-subscriptions#pubsub-implementations)），为节流器提供共享的 [storage](/security/rate-limiting#存储)，并确保负载均衡器在 `/graphql` 上转发 WebSocket 升级。
- **在负载均衡器后，将 `trustProxy` 传递给 `NodeAdapter`**（参见 [Node adapter options](/techniques/performance#node-adapter-options)），以便节流器能看到客户端的地址。
- **将 `CORS_ORIGINS` 设置为您的 Web 应用程序的源**，如果没有浏览器调用 API，则留空。
- **使用平台的日志驱动从 stdout 收集 JSON 日志**。
- **为生产环境提供自己的 Observe 密钥对**，从项目的 **API Keys** 页面获取，作为平台环境中的 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET`：`start:prod` 不加载 `.env`。然后 [NestJS Observe](/observability/overview) 显示按操作细分的 GraphQL 请求（参见 [Telemetry views](/observability/dashboard#telemetry-views)），记录每个解析器，并捕获从其中传播出的错误（参见 [Error monitoring](https://docs.nestjs.com/observability/error-monitoring)）。它需要 `@nestjs/graphql` 13.4.4 或更高版本，并且其 `graphql` 选项标签可以忽略或命名操作的用户（参见 [Shaping what is recorded](/observability/sdk#shaping-what-is-recorded)）。

#### 后续步骤

- 决定用户可以根据权限而不是所有权执行什么操作：[Authorization](/security/authorization)。
- 在服务之间拆分模式：[Federation](/graphql/federation)。
- 让构建从 TypeScript 类型中添加 `@Field()` 元数据：[CLI plugin](/graphql/cli-plugin)。
- 使用 REST 构建相同类型的 API：[Build a REST API with JWT authentication](/tutorials/rest-api-jwt-authentication)。