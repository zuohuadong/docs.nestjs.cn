<!-- 此文件从 content/tutorials/ai-chat-backend.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:58:58.066Z -->
<!-- 源文件: content/tutorials/ai-chat-backend.md -->
<!-- 源哈希: eb202faefb908b056b32741769698caf -->

### 构建一个在 Node.js 中流式传输答案的 AI 聊天后端

使用 NestJS 在 Node.js 中构建一个 AI 聊天机器人后端：工具仅读取用户自己的数据，答案流式传输到浏览器，并保存对话。

该助手通过一个笔记 API 工作：已登录用户询问他们的笔记，模型使用作为该用户的工具查找它们，答案在模型写入时流式传输到浏览器。调用模型只需几行代码。工作在于围绕该调用的部分：模型绝不能读取其他用户的笔记，浏览器在答案中途关闭时必须停止付费调用，发送给模型的历史记录必须在预算内，并且双击发送不能启动两个答案。本教程花费时间在这些部分。

到最后，API 将：

- 通过 [`@nestjs/ai`](/ai/overview) 配置一次模型，该配置来自环境变量：包含超时、重试、每个模型调用的输出令牌上限以及每个答案的令牌预算。
- 为笔记提供三个工具，这些工具作为已登录用户运行，无法访问任何其他人的笔记。
- 将每个答案作为服务端推送事件流式传输，遵循 AI SDK 的 UI 消息流协议，该协议由 `useChat()` 读取，并在浏览器离开时中止模型调用。
- 将对话保存在 PostgreSQL 中，每次对话一次处理一条消息，并向模型发送符合预算的最新历史记录。
- 限制每个用户每小时发送的消息数量。
- 使用一个假模型而不是一个提供者来运行端到端测试和开发服务器，因此两者都不需要 API 密钥。

它从 [Build a REST API with JWT authentication](/tutorials/rest-api-jwt-authentication) 的 API 开始，该 API 使用访问令牌和刷新令牌登录用户，使用 Zod 验证请求，并通过 Drizzle 在 PostgreSQL 中保存笔记。本教程不再解释这些部分。

这些是端点，以及添加每个端点的部分：

| 端点 | 部分 |
| --- | --- |
| `POST /auth/sign-up`, `POST /auth/token`, `POST /auth/token/refresh`, `POST /auth/token/revoke`, `GET /me`, `GET /notes`, `GET /notes/:id`, `POST /notes`, `PATCH /notes/:id`, `DELETE /notes/:id`, `GET /health/live`, `GET /health/ready` | [Start from the JWT API](/tutorials/ai-chat-backend#start-from-the-jwt-api) |
| `POST /conversations`, `GET /conversations`, `GET /conversations/:id`, `DELETE /conversations/:id` | [Store conversations](/tutorials/ai-chat-backend#store-conversations) |
| `POST /conversations/:id/messages` | [Stream the answer](/tutorials/ai-chat-backend#stream-the-answer) |

> info **提示** 完成的应用在 GitHub 上是 [nestjs/example-ai-chat-backend](https://github.com/nestjs/example-ai-chat-backend)，其中包含其测试和 CI 工作流。

您需要 Node.js 22 或更高版本以及一个 PostgreSQL 服务器。对于真实答案，您还需要一个模型提供者的 API 密钥；本教程使用 Anthropic 的，正如 [AI chapter](/ai/overview) 所做的那样。本页面上的每个模型答案都来自 `FakeModel`，即 `@nestjs/ai/testing` 的脚本化模型：真实模型会生成不同的文本，并自行决定调用哪些工具，但围绕工具、流、历史记录和限制的代码是相同的。

#### 从 JWT API 开始

创建项目，并安装本教程使用的所有内容。这些是 JWT 教程的包以及 `@nestjs/ai`、`@nestjs/resilience`（模型调用运行的策略），[AI SDK](https://ai-sdk.dev)（`ai`）及其 Anthropic 提供者：

```bash
$ npm i -g @nestjs/cli
$ nest new notes-assistant --minimal
$ cd notes-assistant
$ npm uninstall @nestjs/platform-express @types/express
$ npm i --save @nestjs/platform-node zod @nestjs/config @nestjs/drizzle drizzle-orm@rc pg @nestjs/authentication @nestjs/throttler @nestjs/swagger @nestjs/terminus @nestjs/ai @nestjs/resilience ai @ai-sdk/anthropic
$ npm i --save-dev drizzle-kit@rc @types/pg @nestjs/testing vitest vite

```

然后从 [finished JWT tutorial](/tutorials/rest-api-jwt-authentication#sign-users-in-with-jwts) 复制以下文件，保持原样：

- `src/main.ts`、`src/database/schema.ts` 和 `drizzle.config.ts`
- `src/auth/`、`src/users/`、`src/health/` 和 `src/notes/` 下的所有内容
- `test/refresh-token.store.e2e-spec.ts`

忽略 JWT 教程的 `drizzle/` 文件夹，因为本应用的第一个迁移来自其自身的模式，以及在 PGlite 上运行的 `test/notes.e2e-spec.ts`：本教程的测试需要一个 PostgreSQL 服务器。`src/config.ts`、`src/app.module.ts` 和 `vitest.config.e2e.ts` 在下面完整展示。将测试脚本添加到 `package.json`：

```json
"test:e2e": "vitest run --config ./vitest.config.e2e.ts"

```

启动数据库，并在 `.env` 中添加其 URL 和一个 `JWT_SECRET`，就像 JWT 教程中那样。在没有 API 密钥的情况下，设置 `AI_MODEL=fake`，如下节所述：

```bash
$ docker run -d --name assistant-db -e POSTGRES_PASSWORD=assistant -e POSTGRES_DB=assistant -p 5432:5432 postgres:17

```

其 URL 放入 `.env`，包括签名密钥和模型设置：

```bash
DATABASE_URL=postgres://postgres:assistant@localhost:5432/assistant
# Generate with: openssl rand -base64 32
JWT_SECRET=
# Either your Anthropic API key...
# ANTHROPIC_API_KEY=
# ...or the scripted model, which needs none (development only).
AI_MODEL=fake

```

#### 配置模型

`@nestjs/ai` 按名称注册模型，并且所有通过 `AiService` 的调用都将在其模型和模块的超时、重试和限制下运行（参见 [Models](/ai/models)）。从环境变量中配置模型一次。配置模式获得了三个变量：

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
    // An Anthropic model id, or `fake` for a scripted model that needs no API key.
    AI_MODEL: z.string().min(1).default('claude-opus-5-5'),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    // The most output tokens of one model call: an answer makes up to `maxSteps` of them.
    AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1).max(8_000).default(1_000),
  })
  .superRefine((env, ctx) => {
    if (env.AI_MODEL === 'fake' && env.NODE_ENV === 'production') {
      ctx.addIssue({ code: 'custom', path: ['AI_MODEL'], message: 'The fake model is for development and tests' });
    }
    if (env.AI_MODEL !== 'fake' && !env.ANTHROPIC_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['ANTHROPIC_API_KEY'], message: `Required for the model ${env.AI_MODEL}` });
    }
  });

export type Env = z.infer<typeof envSchema>;

```

- `AI_MODEL` 是 Anthropic 上的模型 ID，默认为 `claude-opus-5-5`，除非您设置了其他值。`fake` 选择一个脚本化模型，用于开发和测试，而在生产环境中模式会拒绝它。
- `ANTHROPIC_API_KEY` 对于任何其他模型都是必需的，因此缺少此密钥会在启动时而不是在第一个问题时停止应用程序。
- `AI_MAX_OUTPUT_TOKENS` 限制每个模型调用的输出。一个答案最多包含五个（如下文 `maxSteps`），因此它最多写入五倍的量。

根模块从 `ConfigService` 在一个工厂中构建模型，如 [Async configuration](/ai/overview#异步配置) 所述。随着本教程添加的模块，它如下所示：

```typescript title="src/app.module.ts"
import { createAnthropic } from '@ai-sdk/anthropic';
import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { AiModule } from '@nestjs/ai';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthenticationModule } from '@nestjs/authentication';
import { DrizzleModule } from '@nestjs/drizzle';
import { createObserveModule } from '@nestjs/observe';
import { ThrottlerGuard, ThrottlerModule, hours, minutes, normalizeIp } from '@nestjs/throttler';
import { drizzle } from 'drizzle-orm/node-postgres';
import { accountEmail } from './auth/account-email.js';
import { AuthModule } from './auth/auth.module.js';
import { ChatModule } from './chat/chat.module.js';
import { envSchema, type Env } from './config.js';
import { HealthModule } from './health/health.module.js';
import { NotesModule } from './notes/notes.module.js';
import { UsersModule } from './users/users.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // First, so it shuts down last and still sends what the other modules did.
    ObserveModule.forRoot({
      // Empty until `npx @nestjs/observe link` writes the key pair into .env: the SDK then sends nothing.
      appKey: process.env.OBSERVE_APP_KEY ?? '',
      appSecret: process.env.OBSERVE_APP_SECRET ?? '',
      serviceId: 'notes-assistant',
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
    AiModule.forRootAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: async (config: ConfigService<Env, true>) => {
        const modelId = config.get('AI_MODEL', { infer: true });
        const model =
          modelId === 'fake'
            ? // Loaded only when configured: production never imports the testing entry point.
              (await import('./chat/fake-model.js')).createFakeModel()
            : createAnthropic({ apiKey: config.get('ANTHROPIC_API_KEY', { infer: true }) })(modelId);
        return {
          models: {
            default: { model, maxOutputTokens: config.get('AI_MAX_OUTPUT_TOKENS', { infer: true }) },
          },
          defaults: {
            timeout: '30s',
            retry: { attempts: 3 },
            // Model calls per answer: the tools' results each take one more.
            maxSteps: 5,
            // Input and output tokens over all the model calls of one answer.
            budget: { maxTokens: 60_000 },
          },
        };
      },
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
      // Per user, on the chat route: counted by ChatThrottlerGuard, once the user is known.
      {
        name: 'chat',
        ttl: hours(1),
        limit: 30,
        skipIf: (context) => !context.switchToHttp().getRequest().user,
        getTracker: (req) => req.user.id,
      },
    ]),
    UsersModule,
    AuthModule,
    NotesModule,
    ChatModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: StandardSchemaValidationPipe },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

```

- `isGlobal: true` 允许聊天模块注入 `AiService`。
- `maxOutputTokens` 在 `default` 模型定义中会随每次模型调用发送。到达该模型的模型调用将在那里停止，完成原因为 `'length'`。
- `defaults` 应用于每次调用。尝试可能需要 30 秒，对于流式答案来说，这是直到第一个数据块出现的时间。提供者标记为可重试的响应（408、409、429 和 5xx）以及连接失败，将获得三次尝试，带有退避（参见 [Retries, timeouts and fallback](/ai/models#retries-timeouts-and-fallback)）。`maxSteps` 限制一个答案的模型调用次数：每轮工具结果模型读取会额外增加一次。`budget` 在模型调用达到 60,000 个令牌（输入和输出）之前停止答案的下一次模型调用。它在每次模型调用前检查，因此最后一个调用可以使答案略微超出限制（参见 [Usage, cost and budgets](/ai/models#usage-cost-and-budgets)）。
- 只有当 `AI_MODEL` 为 `fake` 时才导入假模型，因此生产流程绝不会加载 `@nestjs/ai/testing`。
- 节流器 `chat` 的定义在 [Limit each user](/tutorials/ai-chat-backend#limit-each-user) 中解释，而 `ChatModule` 在它之前的部分中解释。

一个无法工作的配置会在服务请求之前停止应用程序：

```bash
$ NODE_ENV=production AI_MODEL=fake npm run start
ERROR [ExceptionHandler] Error: Config validation error: AI_MODEL: The fake model is for development and tests
$ AI_MODEL=claude-opus-5-5 npm run start
ERROR [ExceptionHandler] Error: Config validation error: ANTHROPIC_API_KEY: Required for the model claude-opus-5-5

```

##### 无需 API 密钥进行开发

`FakeModel` 对每次调用以脚本定义的内容进行回答，并记录收到的调用（参见 [The fake model](/ai/testing#the-fake-model)）。它对 AI SDK 来说是一个真实的语言模型，因此应用程序像使用提供者时一样运行：模型的工具调用作为已登录用户运行真实工具，并且其答案以词大小的块流式传输。此功能会搜索问题中的最后一个词的笔记，然后列出找到的笔记：

```typescript title="src/chat/fake-model.ts"
import { FakeModel } from '@nestjs/ai/testing';

/**
 * A scripted model, for development without an API key: it searches the notes for the last word
 * of the question, with the real search-notes tool, then streams the titles it found.
 */
export function createFakeModel() {
  return new FakeModel((call) => {
    if (call.toolResults.length === 0) {
      const words = call.lastUserMessage?.match(/[\p{L}\p{N}]+/gu) ?? ['note'];
      return { toolCalls: [{ name: 'search-notes', input: { query: words[words.length - 1] } }] };
    }
    const found = call.toolResults[0].output;
    if (!Array.isArray(found)) {
      return `The search failed: ${String(found)}`;
    }
    const titles = found.map((note: { title: string }) => `"${note.title}"`).join(', ');
    const text = found.length === 0 ? 'None of your notes mention that.' : `Your notes mention it in ${titles}.`;
    return { text, chunkDelay: 40 };
  });
}

```

开发服务器、前端和测试因此无需 API 密钥，且不产生费用。

#### 存储对话

像 AI 章节的 [chat route](/ai/agents#streaming-to-the-browser) 那样，浏览器可以随每条消息发送整个对话。客户端随后决定模型读取的内容，包括工具结果，并且可以编造这些内容。在这里，服务器保留每个对话，客户端只发送其新消息。

两个表连接了 JWT 教程的模式，需要在导入中包含 `bigint` 和 `integer`：

```typescript title="src/database/schema.ts"
import type { ModelMessage } from 'ai';
import { bigint, boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
// ...

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    // Set while an answer is being written: one answer at a time per conversation.
    answeringUntil: at('answering_until'),
    createdAt: at('created_at').notNull().defaultNow(),
    updatedAt: at('updated_at').notNull().defaultNow(),
  },
  (table) => [index('conversations_owner_id_updated_at_idx').on(table.ownerId, table.updatedAt)],
);

export const messages = pgTable(
  'messages',
  {
    // Increasing, so the messages of a turn keep the order they were inserted in.
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    // A message as the model reads it: the user's text, the model's answer and tool calls, or the tools' results.
    content: jsonb('content').$type<ModelMessage>().notNull(),
    // An estimate of its size in tokens, which the history is trimmed by.
    tokens: integer('tokens').notNull(),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (table) => [index('messages_conversation_id_id_idx').on(table.conversationId, table.id)],
);

// ...

export type Note = typeof notes.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;

```

- **消息按模型读取时存储**：一个 AI SDK `ModelMessage`，在 `jsonb` 中。这包括用户的提问、模型的回答和工具调用以及工具的结果，因此发送历史记录就是回读行。
- **`id` 是一个身份列**。一个回合的消息由一个语句插入，因此它们共享其 `created_at`；它们的 id 使它们保持顺序。
- **`tokens` 是每条消息大小的估计**，大约每个 token 四个字符，历史记录的预算是这些大小的总和。确切的计数由提供者决定，因模型而异；预算为差异留出余地。
- **`answering_until` 在写入答案时设置**，因此一个对话一次只回答一条消息。

生成迁移并应用它（参见 [Migrations](https://docs.nestjs.com/data/drizzle#迁移)）：

```bash
$ npx drizzle-kit generate --name=chat
$ npx drizzle-kit migrate

```

请求体：

```typescript title="src/chat/chat.schemas.ts"
import { z } from 'zod';

export const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(200).default('New conversation'),
});
export type CreateConversationDto = z.infer<typeof createConversationSchema>;

export const sendMessageSchema = z.object({
  text: z.string().trim().min(1).max(4_000),
});
export type SendMessageDto = z.infer<typeof sendMessageSchema>;

```

`ConversationsService` 读取和写入对话，语句中始终包含其所有者，就像 `NotesService` 对笔记所做的那样：

```typescript title="src/chat/conversations.service.ts"
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { ModelMessage } from 'ai';
import { and, asc, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { conversations, messages, type Conversation } from '../database/schema.js';

/** The most an answer may take, tools included: then its call is aborted, and the conversation freed. */
export const ANSWER_TIMEOUT_MS = 120_000;
/** A claim outlives its answer, so only a process that died mid-answer leaves one behind. */
const CLAIM_SECONDS = ANSWER_TIMEOUT_MS / 1000 + 30;
/** The history sent to the model, at most, in estimated tokens. */
const HISTORY_BUDGET = 8_000;

/** About four characters per token, for English text and JSON: an estimate, not the model's count. */
const estimateTokens = (message: ModelMessage) => Math.ceil(JSON.stringify(message.content).length / 4);

@Injectable()
export class ConversationsService {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  async create(ownerId: string, title: string): Promise<Conversation> {
    const [conversation] = await this.db.insert(conversations).values({ ownerId, title }).returning();
    return conversation;
  }

  findAll(ownerId: string): Promise<Conversation[]> {
    return this.db
      .select()
      .from(conversations)
      .where(eq(conversations.ownerId, ownerId))
      .orderBy(desc(conversations.updatedAt))
      .limit(100);
  }

  async findOne(ownerId: string, id: string) {
    const [conversation] = await this.db.select().from(conversations).where(this.owned(ownerId, id));
    if (!conversation) {
      notFound();
    }
    const rows = await this.db
      .select({ content: messages.content, createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.id));
    return { ...conversation, messages: rows.map(({ content, createdAt }) => ({ ...content, createdAt })) };
  }

  async remove(ownerId: string, id: string): Promise<void> {
    const deleted = await this.db
      .delete(conversations)
      .where(this.owned(ownerId, id))
      .returning({ id: conversations.id });
    if (deleted.length === 0) {
      notFound();
    }
  }

  /** Marks the conversation as answering, or throws: 404 if it isn't the owner's, 409 while another answer runs. */
  async claim(ownerId: string, id: string): Promise<void> {
    // One conditional statement: of two messages sent at once, one claims the conversation.
    const claimed = await this.db
      .update(conversations)
      .set({ answeringUntil: sql`now() + make_interval(secs => ${CLAIM_SECONDS})` })
      .where(
        and(
          this.owned(ownerId, id),
          // A claim past its time was left by a process that died mid-answer.
          or(isNull(conversations.answeringUntil), lt(conversations.answeringUntil, sql`now()`)),
        ),
      )
      .returning({ id: conversations.id });
    if (claimed.length === 0) {
      const [exists] = await this.db.select({ id: conversations.id }).from(conversations).where(this.owned(ownerId, id));
      if (!exists) {
        notFound();
      }
      throw new ConflictException('The assistant is still answering in this conversation');
    }
  }

  /** The latest messages that fit the budget, starting at a question of the user. */
  async history(id: string): Promise<ModelMessage[]> {
    const rows = await this.db
      .select({ content: messages.content, tokens: messages.tokens })
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(desc(messages.id))
      .limit(200);
    const kept: ModelMessage[] = [];
    let total = 0;
    for (const { content, tokens } of rows) {
      if (total + tokens > HISTORY_BUDGET) {
        break;
      }
      total += tokens;
      kept.push(content);
    }
    // Cut at a user message: a tool result whose tool call was trimmed away is refused by providers.
    while (kept.length > 0 && kept[kept.length - 1].role !== 'user') {
      kept.pop();
    }
    return kept.reverse();
  }

  /** Saves a whole turn, the question and everything the call added, and frees the conversation. */
  async saveTurn(id: string, turn: ModelMessage[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      // One statement for the turn: its messages are stored together, in order, or not at all.
      await tx
        .insert(messages)
        .values(turn.map((content) => ({ conversationId: id, content, tokens: estimateTokens(content) })));
      await tx
        .update(conversations)
        .set({ answeringUntil: null, updatedAt: new Date() })
        .where(eq(conversations.id, id));
    });
  }

  /** Frees the conversation after an answer that failed or was cancelled. Nothing of the turn is kept. */
  async release(id: string): Promise<void> {
    await this.db.update(conversations).set({ answeringUntil: null }).where(eq(conversations.id, id));
  }

  private owned(ownerId: string, id: string) {
    return and(eq(conversations.id, id), eq(conversations.ownerId, ownerId));
  }
}

function notFound(): never {
  throw new NotFoundException('Conversation not found');
}

```

- **`claim()` 是一个条件 `UPDATE`**。双击发送或第二个标签页会在同一时刻向一个对话发布两条消息。两者都会读取相同的历史记录，都会启动一次付费模型调用，并且第二个答案不知道第一个。PostgreSQL 在更新行时会锁定该行，因此在同一时刻的两个请求中，第二个等待第一个，然后发现 `answering_until` 已设置，不进行任何更改，并返回 409。如下一节所示，答案在 `ANSWER_TIMEOUT_MS` 后中止，并且一个声明的有效期比预定时间长 30 秒，因此一个在答案过程中死亡的进程留下的过期声明会被接管。一个 [test](/tutorials/ai-chat-backend#test-it) 一次发送十条消息；一个读取行、在 JavaScript 中检查然后写入的声明在每次运行时允许五到六个通过。
- **`history()` 从最新消息回溯**，直到预算用尽，然后从最旧的末尾删除消息，直到历史记录以一个问题开始。以工具结果开始、其工具调用被预算截断的历史记录会被提供者拒绝。
- **`saveTurn()` 使用一个语句插入整个回合**，并在同一事务中释放对话。一个回合要么完整保存，要么完全不保存，因此历史记录永远不会包含没有答案的问题，也不会包含没有结果的工具调用。

#### 为模型提供工具

代理函数是您的提供者之一的方法，模型可以调用它，并使用它填写的参数（参见 [Tools](/ai/tools)）。助手获得三个，通过 `NotesService`，需要搜索第一个：

```typescript title="src/notes/notes.service.ts"
import { and, desc, eq, ilike, or } from 'drizzle-orm';
// ...

@Injectable()
export class NotesService {
  // ...

  /** The owner's notes whose title or body contains `query`, newest first. */
  search(ownerId: string, query: string, limit = 10): Promise<Note[]> {
    const pattern = `%${escapeLike(query)}%`;
    return this.db
      .select()
      .from(notes)
      .where(and(eq(notes.ownerId, ownerId), or(ilike(notes.title, pattern), ilike(notes.body, pattern))))
      .orderBy(desc(notes.updatedAt), desc(notes.id))
      .limit(limit);
  }

  // ...
}

// ...

/** `%` and `_` in the search are literal characters, not wildcards. */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

```

模型根据名称和描述选择一个工具，并从其 `.describe()` 文本中填充参数：

```typescript title="src/notes/notes.tools.ts"
import { Injectable } from '@nestjs/common';
import { AgentFunction, type AgentFunctionContext } from '@nestjs/ai';
import { CurrentUser } from '@nestjs/authentication';
import { SkipThrottle } from '@nestjs/throttler';
import { z } from 'zod';
import type { Note } from '../database/schema.js';
import { createNoteSchema, type CreateNoteDto } from './notes.schemas.js';
import { NotesService } from './notes.service.js';

/** What the model reads about a note: no owner, no internal columns. */
const view = ({ id, title, body, updatedAt }: Note) => ({ id, title, body, updatedAt });

// Global guards run on agent function calls too, and the throttler's would count
// every call of every user as one client: the chat route is limited instead.
@SkipThrottle({ default: true, account: true, chat: true })
@Injectable()
export class NotesTools {
  constructor(private readonly notesService: NotesService) {}

  @AgentFunction({
    name: 'search-notes',
    description: "Search the user's notes for a word or phrase, in titles and bodies. Returns up to 10, newest first.",
    inputSchema: z.object({
      query: z.string().trim().min(1).max(100).describe('A word or phrase to look for, such as "dentist"'),
    }),
  })
  async search({ query }: { query: string }, _ctx: AgentFunctionContext, @CurrentUser('id') userId: string) {
    const found = await this.notesService.search(userId, query);
    return found.map(view);
  }

  @AgentFunction({
    name: 'read-note',
    description: "Read one of the user's notes in full, by its id.",
    inputSchema: z.object({ noteId: z.uuid().describe('The id of a note, from search-notes') }),
  })
  async read({ noteId }: { noteId: string }, _ctx: AgentFunctionContext, @CurrentUser('id') userId: string) {
    // Someone else's note is "Note not found", as on GET /notes/:id.
    return view(await this.notesService.findOne(userId, noteId));
  }

  @AgentFunction({
    name: 'create-note',
    description: 'Save a new note for the user, when they ask you to remember or write something down.',
    inputSchema: createNoteSchema,
  })
  async create(dto: CreateNoteDto, _ctx: AgentFunctionContext, @CurrentUser('id') userId: string) {
    return view(await this.notesService.create(userId, dto));
  }
}

```

在笔记模块中注册工具，紧邻它们调用的服务：

```typescript title="src/notes/notes.module.ts"
import { Module } from '@nestjs/common';
import { NotesController } from './notes.controller.js';
import { NotesService } from './notes.service.js';
import { NotesTools } from './notes.tools.js';

@Module({
  controllers: [NotesController],
  providers: [NotesService, NotesTools],
})
export class NotesModule {}

```

- **所有者绝不来自模型**。没有输入模式包含用户 id。`@CurrentUser('id')` 读取认证守卫为调用运行的请求加载的用户（参见 [With @nestjs/authentication and @nestjs/authorization](/ai/tools#with-nestjsauthentication-and-nestjsauthorization)），并且 `NotesService` 将其放入每个语句的 `WHERE` 子句中，就像路由一样。模型传递的任何 id 都只能访问用户自己的笔记：别人的笔记是 `Note not found`，模型将其读取为工具的错误。文本告诉模型执行操作的笔记可以使其调用工具，但仍然只是作为同一用户。
- **全局守卫也对代理函数调用运行**。这就是认证能够到达它们的方式，这也是该类跳过所有三个节流器定义的原因：全局 `ThrottlerGuard` 读取工具调用不具备的 HTTP 请求，并将每个用户的每次工具调用都算作一个客户端。如果没有它，在每分钟 100 次工具调用后，所有用户的每个工具都会以 `ThrottlerException: Too Many Requests` 失败。聊天路由是按用户限制的。
- **模型读取方法返回的内容**，格式为 JSON。`view()` 省略了所有者的 id，因为模型没有使用它。
- **`create-note` 重用路由的模式**。它拒绝的参数永远不会到达方法：模型被告知哪里出了问题，然后可以重试。

`AiModule` 查找应用程序中每个模块的代理函数，因此将 `NotesTools` 注册为 `NotesModule` 的提供者就足够了。

#### 流式传输答案

`ChatService` 声明对话，将历史记录和新问题发送给模型，并以流的形式返回答案：

```typescript title="src/chat/chat.service.ts"
import { Injectable, Logger } from '@nestjs/common';
import { AiModelError, AiService } from '@nestjs/ai';
import type { ModelMessage } from 'ai';
import { NotesTools } from '../notes/notes.tools.js';
import { ANSWER_TIMEOUT_MS, ConversationsService } from './conversations.service.js';

const instructions =
  "You are the assistant of a notes app. Answer from the user's notes: search them before you answer " +
  'a question about them, and say so when nothing matches. Save a note only when the user asks you to. ' +
  'Keep answers short.';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly ai: AiService,
    private readonly conversationsService: ConversationsService,
  ) {}

  /** Streams the answer to `text` as the AI SDK's UI message stream, and saves the turn once it's complete. */
  async answer(userId: string, conversationId: string, text: string, request: unknown): Promise<Response> {
    await this.conversationsService.claim(userId, conversationId);
    try {
      return await this.stream(conversationId, text, request);
    } catch (error) {
      await this.conversationsService.release(conversationId);
      throw error;
    }
  }

  private async stream(conversationId: string, text: string, request: unknown): Promise<Response> {
    const question: ModelMessage = { role: 'user', content: text };
    const history = await this.conversationsService.history(conversationId);
    const answer = this.ai.streamText({
      label: 'chat',
      instructions,
      messages: [...history, question],
      tools: [NotesTools],
      // The agent functions run as the user who sent the request.
      caller: { request },
      abortSignal: AbortSignal.timeout(ANSWER_TIMEOUT_MS),
    });

    // When the call ends, the whole turn is saved; when it fails or is cancelled, none of it is.
    const settled = answer.responseMessages
      .then(
        (added) => this.conversationsService.saveTurn(conversationId, [question, ...added]),
        () => this.conversationsService.release(conversationId),
      )
      .catch((error: unknown) => this.logger.error(`Could not save the turn of ${conversationId}`, error));

    const response = answer.toUIMessageStreamResponse({
      errorText: (error) =>
        error instanceof AiModelError ? 'The assistant is unavailable. Try again in a minute.' : 'Something went wrong.',
    });
    // The stream ends once the turn is saved, so the client's next message finds it in the history.
    const body = response.body!.pipeThrough(new TransformStream({ flush: () => settled }));
    return new Response(body, response);
  }
}

```

- **`streamText()` 启动调用并立即返回。** `tools` 向模型提供 `NotesTools` 的所有代理函数，而 `caller` 传递 ⟦Request⟧，这就是代理函数知道用户的方式。
- **`abortSignal` 结束运行时间超过 `ANSWER_TIMEOUT_MS` 的答案**，包括工具调用。这就是声明比接管更早失效的原因。
- **`toUIMessageStreamResponse()` 以 Web 标准的 `Response` 形式返回答案**，在 AI SDK 的 UI 消息流协议中，带有 `x-accel-buffering: no` 头部，告知 nginx 不要缓冲。在 15 秒内没有数据块时，因为工具正在工作会发送一个 `: keep-alive` 注释，因此代理不会因空闲而关闭连接。
- **当调用结束时，轮次被保存**，从 `responseMessages` 开始。如果失败或被取消，对话将被释放，轮次中没有任何内容被保留：浏览器仍然显示问题，可以再次发送。
- **流在此完成后结束。** `TransformStream` 的 `flush()` 在轮次保存之前持有流的结束。如果没有它，流在模型完成时立即结束，即保存前一刻，立即发送下一条消息的客户端可能会收到 409 错误，或者收到缺少最后一轮次的历史记录。

处理程序返回 `Response`，Nest 将其作为模型写入时发送（参见 [Streaming responses](/http/streaming-responses)）。当浏览器关闭时，Nest 会取消 ⟦Response⟧ 的主体。取消通过 `pipeThrough()` 传播到 `streamText()` 的流，取消该流会中止模型调用和任何正在运行的代理函数的 `signal`，因此没有人为没人阅读的答案付费（参见 [Client disconnection](/http/streaming-responses#client-disconnection)）。

响应的状态 200 在流开始时发出，因此失败的模型调用会以流的形式到达浏览器：一个 `error` 数据块，其中包含文本 `errorText`。一个 `AiModelError` 表示所有尝试都失败了，因为提供者宕机、超过重试后仍然过载或拒绝 API 密钥，因此要求用户重试。任何其他错误，例如已用完预算的答案，都会收到不提及服务器的消息。AI 章节的 `pipeUIMessageStreamToResponse()` 等待第一个数据块，以便异常过滤器可以以错误状态回答早期失败，但它会终止响应本身，这在结束前没有保存轮次的地方。

控制器：

```typescript title="src/chat/chat.controller.ts"
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import type { NodeRequest } from '@nestjs/platform-node';
import { z } from 'zod';
import { ChatThrottlerGuard } from './chat-throttler.guard.js';
import {
  createConversationSchema,
  sendMessageSchema,
  type CreateConversationDto,
  type SendMessageDto,
} from './chat.schemas.js';
import { ChatService } from './chat.service.js';
import { ConversationsService } from './conversations.service.js';

const conversationId = { schema: z.uuid() };

@Controller('conversations')
export class ChatController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly chatService: ChatService,
  ) {}

  @Post()
  create(@CurrentUser('id') userId: string, @Body({ schema: createConversationSchema }) dto: CreateConversationDto) {
    return this.conversationsService.create(userId, dto.title);
  }

  @Get()
  findAll(@CurrentUser('id') userId: string) {
    return this.conversationsService.findAll(userId);
  }

  @Get(':id')
  findOne(@CurrentUser('id') userId: string, @Param('id', conversationId) id: string) {
    return this.conversationsService.findOne(userId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser('id') userId: string, @Param('id', conversationId) id: string) {
    return this.conversationsService.remove(userId, id);
  }

  // Answers with a stream of server-sent events, which Nest sends as the model writes them.
  @Post(':id/messages')
  @UseGuards(ChatThrottlerGuard)
  send(
    @CurrentUser('id') userId: string,
    @Param('id', conversationId) id: string,
    @Body({ schema: sendMessageSchema }) { text }: SendMessageDto,
    @Req() request: NodeRequest,
  ) {
    return this.chatService.answer(userId, id, text, request);
  }
}

```

聊天模块注册控制器，以及维护对话和运行代理的服务：

```typescript title="src/chat/chat.module.ts"
import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { ConversationsService } from './conversations.service.js';

@Module({
  controllers: [ChatController],
  providers: [ConversationsService, ChatService],
})
export class ChatModule {}

```

> info **提示** 从处理程序返回 `Response` 需要 `@nestjs/core` 12.4.0 或更高版本。其状态始终是 `Response` 本身的，因此 `POST` 路由返回 200 而不是 201，且 `@HttpCode()` 对其没有影响。

##### 在浏览器中

`useChat()` 从 `@ai-sdk/react` 读取此流，就像读取 AI 章节一样（参见 [Streaming to the browser](/ai/agents#streaming-to-the-browser)）。默认情况下，它会发布整个对话。此服务器保留对话，因此请给 `useChat()` 一个仅发送新消息文本的传输器：

```typescript
import { DefaultChatTransport } from 'ai';

const transport = new DefaultChatTransport({
  api: `/conversations/${conversationId}/messages`,
  headers: { Authorization: `Bearer ${accessToken}` },
  // The server keeps the history: send the new message's text alone.
  prepareSendMessagesRequest: ({ messages }) => ({
    body: {
      text: messages
        .at(-1)!
        .parts.filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join(''),
    },
  }),
});

```

答案作为一个消息到达，其 `parts` 包含文本，其工具调用作为 `tool-search-notes` 部分，带有其 `input` 和 `output`。要显示过去的对话，请从 `GET /conversations/:id` 读取。

#### 限制每个用户

每条消息都会消耗模型调用，因此限制每个用户发送的消息数量。像登录路由上的那样按 IP 地址限制，会在办公室地址后所有用户之间共享一个配额，并允许单个用户消耗它。`chat` [throttler definition](/security/rate-limiting#多重限流器定义) 在 `AppModule` 中按用户计数，每小时 30 条消息，使用用户 ID 作为跟踪器。

全局 `ThrottlerGuard` 在认证守卫之前运行，这使得它能够计算猜测令牌的请求，但这意味着在运行时用户尚未被识别。因此它跳过 `chat`，其 `skipIf` 未找到用户，而绑定到聊天路由的守卫在认证后会计算它：

```typescript title="src/chat/chat-throttler.guard.ts"
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerRequest } from '@nestjs/throttler';

/**
 * Counts the `chat` limit per signed-in user. Bound to the chat route, it runs after the global
 * guards, authentication's included, so the user is known; the global throttler guard skips
 * `chat` (it runs before authentication), and this one counts nothing else.
 */
@Injectable()
export class ChatThrottlerGuard extends ThrottlerGuard {
  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    return requestProps.throttler.name === 'chat' ? super.handleRequest(requestProps) : true;
  }
}

```

路由上的 `@UseGuards(ChatThrottlerGuard)` 在全局守卫之后运行。该守卫仅计算 `chat`，因为全局守卫已经计算了其他定义。每小时第 31 条消息将收到 429 错误，其 `Retry-After-chat` 头部是用户可以再次发送前的秒数，其他用户不受影响。

有了上限和预算，这限制了一个用户在一小时内可以花费的量：30 个答案，每个答案最多包含五个模型调用，每个模型调用最多 1,000 个输出令牌，并且一旦使用了 60,000 个令牌，则不会启动模型调用。

> info **提示** 节流器默认在内存中计数，因此每个 API 实例允许自己每小时 30 条消息。如果有多个实例，请使用共享 [storage](/security/rate-limiting#存储)。

#### 试用

使用 `AI_MODEL=fake` 在 `.env` 中启动应用程序。下面的答案是模拟模型的，工具调用是它脚本化的；其他所有内容都是应用程序的：

```bash
$ npm run start

```

注册并写下几条笔记（令牌和响应主体在此和下方被缩短）：

```bash
$ curl localhost:3000/auth/sign-up --json '{"email":"ada@example.com","password":"correct horse battery"}'
{"accessToken":"eyJhbGciOiJIUzI1NiIs...","refreshToken":"...","expiresIn":900}
$ ADA="Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
$ curl localhost:3000/notes -H "$ADA" --json '{"title":"Buy milk","body":"Oat milk, 2 litres"}'
$ curl localhost:3000/notes -H "$ADA" --json '{"title":"Dentist on Tuesday","body":"9:00, and ask about the milk teeth"}'
$ curl localhost:3000/notes -H "$ADA" --json '{"title":"Book club","body":"Finish chapter 3"}'

```

开始对话并提问。`-N` 关闭了 curl 的缓冲，因此事件会随着服务器发送而出现：工具调用、工具返回的内容、然后是答案，逐词显示：

```bash
$ curl localhost:3000/conversations -H "$ADA" --json '{"title":"Errands"}'
{"id":"a399d467-1c20-4927-9361-365e90dee98a","ownerId":"861e2960-fd51-4e00-aa97-6fa35d805417","title":"Errands","answeringUntil":null,"createdAt":"2026-11-19T22:14:15.991Z","updatedAt":"2026-11-19T22:14:15.991Z"}
$ curl -N -i localhost:3000/conversations/a399d467-1c20-4927-9361-365e90dee98a/messages -H "$ADA" --json '{"text":"What did I write about milk?"}'
HTTP/1.1 200 OK
X-RateLimit-Limit-chat: 30
X-RateLimit-Remaining-chat: 29
content-type: text/event-stream; charset=utf-8
x-accel-buffering: no
x-vercel-ai-ui-message-stream: v1

data: {"type":"start"}

data: {"type":"start-step"}

data: {"type":"tool-input-available","toolCallId":"call-1","toolName":"search-notes","input":{"query":"milk"}}

data: {"type":"tool-output-available","toolCallId":"call-1","output":[{"id":"def5fe96-8183-4db4-aa7e-e37a6a95dcc0","title":"Dentist on Tuesday","body":"9:00, and ask about the milk teeth","updatedAt":"2026-11-19T22:14:15.960Z"},{"id":"9e1ac526-c3b4-46b1-8941-fef441506ddc","title":"Buy milk","body":"Oat milk, 2 litres","updatedAt":"2026-11-19T22:14:15.942Z"}]}

data: {"type":"finish-step"}

data: {"type":"start-step"}

data: {"type":"text-start","id":"text-0"}

data: {"type":"text-delta","id":"text-0","delta":"Your "}

data: {"type":"text-delta","id":"text-0","delta":"notes "}

data: {"type":"text-delta","id":"text-0","delta":"mention "}

...

data: {"type":"text-delta","id":"text-0","delta":"milk\"."}

data: {"type":"text-end","id":"text-0"}

data: {"type":"finish-step"}

data: {"type":"finish","finishReason":"stop"}

data: [DONE]

```

搜索找到了提及“milk”的两个笔记（在标题或正文中），而遗漏了第三个。同一时刻向一个对话发送了两个消息，这里来自两个同时启动的 curl 命令，得到一个答案和一个 409 错误：

```bash
$ curl localhost:3000/conversations/a399d467-1c20-4927-9361-365e90dee98a/messages -H "$ADA" --json '{"text":"And the book club?"}'
{"message":"The assistant is still answering in this conversation","error":"Conflict","statusCode":409}

```

每个已回答的消息都保存为一个轮次：问题、工具调用、工具结果和答案，按顺序排列：

```bash
$ curl localhost:3000/conversations/a399d467-1c20-4927-9361-365e90dee98a -H "$ADA"
{"id":"a399d467-...","title":"Errands","answeringUntil":null,...,"messages":[{"role":"user","content":"What did I write about milk?","createdAt":"2026-11-19T22:14:16.753Z"},{"role":"assistant","content":[{"type":"tool-call","input":{"query":"milk"},"toolName":"search-notes","toolCallId":"call-1"}],...},{"role":"tool","content":[{"type":"tool-result","output":{"type":"json","value":[...]},"toolName":"search-notes","toolCallId":"call-1"}],...},{"role":"assistant","content":[{"text":"Your notes mention it in \"Dentist on Tuesday\", \"Buy milk\".","type":"text"}],...},{"role":"user","content":"And the book club?",...},...]}

```

另一个用户在读取和发送到 Ada 的对话时收到 404 错误：

```bash
$ BOB="Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
$ curl localhost:3000/conversations/a399d467-1c20-4927-9361-365e90dee98a/messages -H "$BOB" --json '{"text":"Hi"}'
{"message":"Conversation not found","error":"Not Found","statusCode":404}

```

一小时内发送 30 条消息后，Ada 的下一条消息收到 429 错误。删除对话会删除其消息：

```bash
$ curl -i localhost:3000/conversations/a399d467-1c20-4927-9361-365e90dee98a/messages -H "$ADA" --json '{"text":"One more about milk?"}'
HTTP/1.1 429 Too Many Requests
Retry-After-chat: 3600
{"statusCode":429,"message":"ThrottlerException: Too Many Requests"}
$ curl -X DELETE localhost:3000/conversations/a399d467-1c20-4927-9361-365e90dee98a -H "$ADA"
$ curl localhost:3000/conversations/a399d467-1c20-4927-9361-365e90dee98a -H "$ADA"
{"message":"Conversation not found","error":"Not Found","statusCode":404}

```

#### 试用

端到端测试启动真实的 `AppModule`，使用 `FakeModel` 代替配置的模型。`overrideModels()` 按名称替换它，并保留其其余定义：`maxOutputTokens`，超时和重试（参见 [Overriding models in end-to-end tests](/ai/testing#overriding-models-in-end-to-end-tests)）。代理函数在真实的 PostgreSQL 服务器上运行，通过连接池，其守卫是真实的，两个对话的声明确实竞争。并且应用程序监听一个端口，因为测试会像流式传输一样读取答案，并在答案中间挂起，而 `app.inject()`（一次性返回整个响应）做不到这一点。

测试配置将 `AI_MODEL` 设置为 `fake`，因此测试也不需要 API 密钥：

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
      // The tests put fake models in place of this one: no API key needed.
      AI_MODEL: 'fake',
    },
  },
});

```

测试会注册用户，脚本化假模型的答案，并检查工具、流、中止、历史记录预算和限制：

```typescript title="test/chat.e2e-spec.ts"
import { fileURLToPath } from 'node:url';
import { PasswordHasher } from '@nestjs/authentication';
import { FakeModel, overrideModels, providerError } from '@nestjs/ai/testing';
import { getDrizzleToken } from '@nestjs/drizzle';
import { NodeAdapter, type NestNodeApplication } from '@nestjs/platform-node';
import { Test } from '@nestjs/testing';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module.js';
import { conversations } from '../src/database/schema.js';

// A real PostgreSQL with a pool, so two messages sent at once really race.
const url = process.env.TEST_DATABASE_URL;

type Chunk = { type: string; [key: string]: any };

describe.skipIf(!url)('Chat API (e2e)', () => {
  const db = drizzle({ client: new Pool({ connectionString: url, max: 10 }) });
  const model = new FakeModel();
  let app: NestNodeApplication;
  let baseUrl: string;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
    await db.execute(sql`TRUNCATE users, refresh_tokens CASCADE`);
    const moduleRef = await overrideModels(Test.createTestingModule({ imports: [AppModule] }), { default: model })
      .overrideProvider(getDrizzleToken())
      .useValue(db)
      // scrypt at the default cost takes 128 MiB and a few hundred ms per hash.
      .overrideProvider(PasswordHasher)
      .useValue(new PasswordHasher({ logN: 10 }))
      .compile();
    app = moduleRef.createNestApplication<NestNodeApplication>(new NodeAdapter());
    // A real server: the tests read the answer chunk by chunk, and hang up mid-answer.
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(() => app.close()); // closes the pool too

  let clients = 0;

  /** Signs a user up, with a note, and returns the headers that authenticate as them. */
  async function signUp(email: string, note = { title: 'Buy milk', body: 'Oat milk, 2 litres' }) {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email, password: 'correct horse battery' },
      // Sign-up is rate-limited per IP address: each user signs up from their own.
      remoteAddress: `10.0.0.${++clients}`,
    });
    const headers = { authorization: `Bearer ${res.json<{ accessToken: string }>().accessToken}` };
    const created = await app.inject({ method: 'POST', url: '/notes', headers, payload: note });
    return { headers, noteId: created.json<{ id: string }>().id };
  }

  async function startConversation(headers: Record<string, string>) {
    const res = await app.inject({ method: 'POST', url: '/conversations', headers, payload: {} });
    return res.json<{ id: string }>().id;
  }

  function send(headers: Record<string, string>, conversationId: string, text: string, signal?: AbortSignal) {
    return fetch(`${baseUrl}/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal,
    });
  }

  /** The server-sent events of a response, as UI message chunks, read as they arrive. */
  async function* events(response: Response): AsyncGenerator<Chunk> {
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const bytes of response.body!) {
      buffer += decoder.decode(bytes, { stream: true });
      let end: number;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (event.startsWith('data: {')) {
          yield JSON.parse(event.slice('data: '.length));
        }
      }
    }
  }

  async function readAll(response: Response) {
    const chunks: Chunk[] = [];
    for await (const chunk of events(response)) {
      chunks.push(chunk);
    }
    return chunks;
  }

  const textOf = (chunks: Chunk[]) =>
    chunks
      .filter((chunk) => chunk.type === 'text-delta')
      .map((chunk) => chunk.delta)
      .join('');

  it("answers from the user's own notes, and saves the turn", async () => {
    const ada = await signUp('ada@example.com');
    await signUp('bob@example.com', { title: 'Milk for the cat', body: "Bob's note" });
    const conversationId = await startConversation(ada.headers);
    model.reply({ toolCalls: [{ name: 'search-notes', input: { query: 'milk' } }] }, (call) => {
      const notes = call.toolResults[0].output as Array<{ title: string }>;
      return `You have ${notes.length} note: ${notes[0].title}.`;
    });

    const response = await send(ada.headers, conversationId, 'What did I write about milk?');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const chunks = await readAll(response);

    // Bob's note matches too, and the tool never saw it.
    const output = chunks.find((chunk) => chunk.type === 'tool-output-available')?.output;
    expect(output).toEqual([expect.objectContaining({ title: 'Buy milk' })]);
    expect(textOf(chunks)).toBe('You have 1 note: Buy milk.');
    expect(model.lastCall?.options.maxOutputTokens).toBe(1000);

    // The stream ended once the turn was saved: a message sent right away gets the history.
    model.reply('Anything else?');
    const next = await send(ada.headers, conversationId, 'Thanks!');
    expect(next.status).toBe(200);
    await readAll(next);
    expect(model.lastCall?.options.prompt.map((message) => message.role)).toEqual([
      'system',
      'user',
      'assistant',
      'tool',
      'assistant',
      'user',
    ]);
  });

  it('runs the tools as the signed-in user only', async () => {
    const carol = await signUp('carol@example.com');
    const dave = await signUp('dave@example.com', { title: "Dave's diary", body: 'Private' });
    const conversationId = await startConversation(carol.headers);
    model.reply(
      { toolCalls: [{ name: 'read-note', input: { noteId: dave.noteId } }] },
      { toolCalls: [{ name: 'create-note', input: { title: 'Call mum' } }] },
      'Saved.',
    );

    await readAll(await send(carol.headers, conversationId, `Read note ${dave.noteId}, then remind me to call mum`));

    // Dave's note is as missing as one that doesn't exist.
    expect(model.calls.at(-2)?.toolResults).toEqual([
      expect.objectContaining({ toolName: 'read-note', output: 'Note not found' }),
    ]);
    const notes = await app.inject({ method: 'GET', url: '/notes', headers: carol.headers });
    expect(notes.json().map((note: { title: string }) => note.title)).toEqual(['Call mum', 'Buy milk']);
  });

  it('streams the answer as the model writes it', async () => {
    const { headers } = await signUp('erin@example.com');
    const conversationId = await startConversation(headers);
    model.reply({ text: 'One two three four five', chunkDelay: 100 });

    const arrivals: number[] = [];
    for await (const chunk of events(await send(headers, conversationId, 'Count to five'))) {
      if (chunk.type === 'text-delta') {
        arrivals.push(performance.now());
      }
    }

    expect(arrivals).toHaveLength(5);
    // Each word arrived on its own, about 100 ms after the one before.
    expect(arrivals[4] - arrivals[0]).toBeGreaterThan(300);
  });

  it('aborts the model call when the client goes away', async () => {
    const { headers } = await signUp('frank@example.com');
    const conversationId = await startConversation(headers);
    model.reply({ text: 'A long answer that nobody reads to its end', chunkDelay: 200 });
    const client = new AbortController();

    const response = await send(headers, conversationId, 'Tell me a long story', client.signal);
    for await (const chunk of events(response)) {
      if (chunk.type === 'text-delta') {
        break;
      }
    }
    client.abort(); // the browser tab closes
    await vi.waitFor(() => expect(model.lastCall?.options.abortSignal?.aborted).toBe(true));

    // Nothing of the turn was kept, and the conversation takes the next message.
    await vi.waitFor(async () => {
      const saved = await app.inject({ method: 'GET', url: `/conversations/${conversationId}`, headers });
      expect(saved.json()).toMatchObject({ answeringUntil: null, messages: [] });
    });
    model.reply('Here is a shorter one.');
    const next = await send(headers, conversationId, 'A shorter one, then');
    expect(textOf(await readAll(next))).toBe('Here is a shorter one.');
  });

  it('answers one message at a time per conversation', async () => {
    const { headers } = await signUp('grace@example.com');
    const conversationId = await startConversation(headers);
    // One answer: only one of the messages reaches the model.
    model.reply({ text: 'First', delay: 200 });

    // Open the pool's connections first, so no request waits for one: they all race.
    await Promise.all(Array.from({ length: 10 }, () => db.execute(sql`select pg_sleep(0.05)`)));
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        app.inject({ method: 'POST', url: `/conversations/${conversationId}/messages`, headers, payload: { text: 'Hi' } }),
      ),
    );

    expect(responses.map((res) => res.statusCode).sort()).toEqual([200, ...Array(9).fill(409)]);

    // A claim left behind by a process that died, past its time, is taken over.
    await db
      .update(conversations)
      .set({ answeringUntil: new Date(Date.now() - 1_000) })
      .where(eq(conversations.id, conversationId));
    model.reply('Back.');
    expect(textOf(await readAll(await send(headers, conversationId, 'Still there?')))).toBe('Back.');
  });

  it('sends the model the latest history that fits the budget, from a question', async () => {
    // Every search returns this note: about 2,500 tokens per turn.
    const { headers } = await signUp('heidi@example.com', { title: 'Long', body: 'x'.repeat(10_000) });
    const conversationId = await startConversation(headers);
    for (let turn = 1; turn <= 4; turn++) {
      model.reply({ toolCalls: [{ name: 'search-notes', input: { query: 'long' } }] }, 'Found it.');
      await readAll(await send(headers, conversationId, `Question ${turn}`));
    }
    model.reply('Done.');

    await readAll(await send(headers, conversationId, 'Question 5'));

    const prompt = model.lastCall!.options.prompt;
    // The first turn didn't fit, and the history starts at a question, never at a tool result.
    expect(prompt[1].role).toBe('user');
    const questions = prompt.filter((message) => message.role === 'user').map((message) => message.content);
    expect(JSON.stringify(questions)).not.toContain('Question 1');
    expect(JSON.stringify(questions)).toContain('Question 2');
  });

  it('retries an overloaded provider, and tells the user when it fails', async () => {
    const { headers } = await signUp('ivan@example.com');
    const conversationId = await startConversation(headers);
    const unavailable = { type: 'error', errorText: 'The assistant is unavailable. Try again in a minute.' };
    // Overloaded, then answers: retried.
    model.reply(providerError(529), 'Back again.');
    expect(textOf(await readAll(await send(headers, conversationId, 'Hello?')))).toBe('Back again.');

    // A revoked API key: not retried, and the stream says so.
    model.reply(providerError(401, { message: 'Invalid API key' }));
    const refused = await send(headers, conversationId, 'Are you there?');
    expect(refused.status).toBe(200);
    expect(await readAll(refused)).toContainEqual(unavailable);

    // A stream that breaks after its first words ends with the same error.
    model.reply({ text: 'Your notes say', streamError: providerError(500) });
    const broken = await readAll(await send(headers, conversationId, 'What do my notes say?'));
    expect(textOf(broken)).toBe('Your notes say');
    expect(broken.at(-1)).toEqual(unavailable);

    // Only the answered turn was kept.
    const saved = await app.inject({ method: 'GET', url: `/conversations/${conversationId}`, headers });
    expect(saved.json()).toMatchObject({ answeringUntil: null });
    expect(saved.json().messages).toHaveLength(2);
  });

  it('limits how many messages each user sends', async () => {
    const { headers } = await signUp('ken@example.com');
    const conversationId = await startConversation(headers);
    model.reply(...Array.from({ length: 30 }, () => 'OK.'));
    for (let i = 0; i < 30; i++) {
      await readAll(await send(headers, conversationId, `Message ${i}`));
    }

    const limited = await send(headers, conversationId, 'One more');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after-chat')).toBeTruthy();

    // Another user isn't limited by Ken's messages.
    const other = await signUp('lena@example.com');
    model.reply('Hi Lena.');
    expect((await send(other.headers, await startConversation(other.headers), 'Hi')).status).toBe(200);
  });
});

```

- **一个 `FakeModel` 为每个测试服务**，它使用 `reply()` 将每个测试所需的答案放入队列。一个未使用的答案会被传递给下一个测试，因此竞争测试队列了一个答案：其十条消息中只有一条到达了模型。
- **竞争测试首先打开连接池的连接**。否则，第一个请求会获得连接池已打开的连接，而其他请求等待新连接，并且它在它们到达之前就声明了对话。然后它回溯声明，因为一个死亡的进程会留下该声明，下一个消息会接管它。
- **发送给模型的是 `model.lastCall`**：`options.prompt` 是历史记录和问题，就像提供者会获得的那样，而 `options.maxOutputTokens` 是限制。工具的失败在下一个调用的 `toolResults` 中，因为模型会读取它。
- **`providerError()` 是提供者包为 HTTP 状态抛出的错误**（参见 [Retries, timeouts and fallback](/ai/testing#retries-timeouts-and-fallback)）。401 不会重试，而 529 会在最多一秒的回退后重试，因此测试会等待这么久。

由于两者都会截断表，请将它们针对自己的数据库逐个文件运行：

```bash
$ docker exec assistant-db psql -U postgres -c "CREATE DATABASE assistant_test"
$ TEST_DATABASE_URL=postgres://postgres:assistant@localhost:5432/assistant_test npm run test:e2e -- --no-file-parallelism

 Test Files  2 passed (2)
      Tests  13 passed (13)

```

将 `claim()` 中的条件 `UPDATE` 替换为读取、JavaScript 中的检查和写入，"每个对话一次回答一条消息" 将失败：十条消息中有五到六条通过了声明。将 `preventCancel: true` 传递给 `pipeThrough()`，以便取消在包装器处停止，"客户端断开连接时中止模型调用" 将失败：模型调用从未被中止。

#### 生产检查清单

JWT 教程中的 [checklist](/tutorials/rest-api-jwt-authentication#production-checklist) 中的所有内容都适用。特别是对于助手：

- **将 `ANTHROPIC_API_KEY` 保存在您平台的安全存储中**，在运行时注入，并将 `NODE_ENV` 设置为 `production`，该设置会拒绝假模型。
- **让流通过**。API 前的代理或负载均衡器必须像接收到时一样传递 `text/event-stream` 响应，并保持连接打开直到答案所需的时间。`x-accel-buffering` 标头适用于 nginx，而 keep-alive 注释适用于 15 秒或更长时间的空闲超时。不要将 [compression](/http/compression) 中间件放在聊天路由上：它会缓冲。
- **共享节流器的存储**，一旦运行多于一个实例，否则每个实例允许每用户每小时 30 条消息。
- **计量每个用户花费的量**。为模型提供其 `pricing`，并记录每个用户每次调用的使用事件，包括调用的 `onUsage`（参见 [Usage, cost and budgets](/ai/models#usage-cost-and-budgets)）。
- **决定对话的生命周期**。一个轮次会保留其工具返回的内容，因此被删除的笔记会保留在读取它的对话中，直到它们也被删除。删除超过保留期的对话，并在用户提问时进行清理。
- **将工具限制在用户可能做的事情上**。用户编写的或从任何地方粘贴到笔记中的文本会到达模型并可以引导它。工具作为用户运行，所以它最坏的情况是用户能做到的。排除会销毁数据或需要等待人员批准的工具，就像 [Durable agent runs](/ai/agents#durable-agent-runs) 所做的那样。
- **为生产环境提供自己的 Observe 密钥对**，来自项目的 **API Keys** 页面，作为平台环境中的 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET`：`start:prod` 不会加载 `.env`。然后 [NestJS Observe](/observability/overview) 会在其出站跨度中记录对模型提供者的每次调用，记录模型、输入、输出和缓存的令牌，对于流则记录到第一个事件的时间；提示和答案绝不会发送到 Observe（参见 [Model calls](/observability/sdk#model-calls)）。一个 [production rule](/observability/production-rules) 可以限制一个请求执行的模型调用次数。

#### 后续计划

- 按含义而非仅按词语查找笔记：[Embeddings](/ai/embeddings)。
- 向 MCP 客户端（如桌面助手）提供相同的工具：[Serving MCP clients too](/ai/tools#serving-mcp-clients-too)。
- 允许代理在重启后等待人员批准：[Durable agent runs](/ai/agents#durable-agent-runs)。
- 独立测试代理函数和结构化输出：[Testing](/ai/testing)。
- 在生产环境中查看每个请求的模型调用：[Observability](/observability/overview)。