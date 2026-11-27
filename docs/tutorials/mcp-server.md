<!-- 此文件从 content/tutorials/mcp-server.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:56:48.992Z -->
<!-- 源文件: content/tutorials/mcp-server.md -->
<!-- 源哈希: d21ba1600946b242d227878530528933 -->

### 在 Node.js 中构建 MCP 服务器

使用 NestJS 在 Node.js 和 TypeScript 中构建 MCP 服务器：通过 HTTP 和 stdio 的工具、资源和提示、OAuth 访问令牌以及真实测试。

一个支持团队在一个 AI 助手（Claude、ChatGPT、IDE 中的代理）中工作，希望它能与帮助台的工单协同工作：查找关于退款的工单、阅读一个线程、起草回复，并在有人批准后发送。[Model Context Protocol](https://modelcontextprotocol.io) (MCP) 是助手访问帮助台的方式：帮助台运行一个**MCP 服务器**，而助手是它的客户端。大多数示例是原始 SDK 上的单个文件，没有认证和没有测试。本教程构建了一个可部署的示例，其中包含[`@nestjs/mcp`](/mcp/overview)，其工具、资源和提示是提供者的方法。

协议是简单部分。难点在于服务器代表持有令牌的任何人操作：计费团队的代理绝不能看到运输工单，无论模型要求什么，并且只能读取的助手不应回复。

到最后，服务器将：

- 提供一个只读[tool](/mcp/primitives#tools)，用于搜索工单，以及一个用于回复的[tool](/mcp/primitives#tools)，其中包含为模型编写的 Zod 模式，以及模型可读取的错误。
- 将每个工单作为[resource](/mcp/primitives#resources)提供，以及一个用于起草回复的[prompt](/mcp/primitives#prompts)。
- 仅接受为其颁发的 JWT 访问令牌，作为 OAuth 2.1 [resource server](/mcp/primitives#authorization)，并指示没有令牌的客户端访问其受保护的资源元数据。
- 将每个查询的作用域限定到令牌中指定的团队，并要求一个`tickets:write`作用域才能回复。
- 拒绝来自其他网站网页的请求，并且不响应`Host`。
- 通过[stdio](/mcp/transports#over-stdio)提供相同的工具，供本地启动的助手使用。
- 将每次调用报告到[NestJS Observe](/observability/overview)，名称与其工具、资源或提示相关。
- 使用 SDK 自己的客户端，在内存中、通过 HTTP 和通过 stdio，针对 PostgreSQL 进行所有验证。

服务器暴露这些，下面是添加每个部分的章节：

| 原语 | 章节 |
| --- | --- |
| 工具 `search-tickets` 和 `reply-to-ticket` | [Write tools for the model](/tutorials/mcp-server#write-tools-for-the-model) |
| 工单资源模板，提示 `draft-reply` | [Serve tickets as resources](/tutorials/mcp-server#serve-tickets-as-resources) |
| `POST /mcp`, `GET /.well-known/oauth-protected-resource/mcp` | [Verify OAuth access tokens](/tutorials/mcp-server#verify-oauth-access-tokens) |
| `node dist/stdio.js` | [Serve the same tools over stdio](/tutorials/mcp-server#serve-the-same-tools-over-stdio) |

> info **提示** 完成的应用在 GitHub 上是 [nestjs/example-mcp-server](https://github.com/nestjs/example-mcp-server)，包含其测试和 CI 工作流。

需要 Node.js 22.18 或更高版本（开发令牌脚本直接运行 TypeScript），以及 Docker 来本地运行 PostgreSQL。

#### 创建项目

使用 [Nest CLI](/cli/overview) 创建项目。`--minimal` 生成一个代码为单个文件的应用程序，本教程替换了它。它还安装了 [NestJS Observe SDK](/observability/sdk)、`@nestjs/observe`，并将它们连接到该文件；应用程序自身的文件保留了这些：

```bash
$ npm i -g @nestjs/cli
$ nest new helpdesk-mcp --minimal
$ cd helpdesk-mcp

```

安装 [Node adapter](/techniques/performance#node-adapter)、`@nestjs/mcp` 以及它构建的 MCP SDK、Zod、[`@nestjs/config`](/application/configuration)、[`@nestjs/drizzle`](https://docs.nestjs.com/data/drizzle) 和用于 JWT 验证器的 [`@nestjs/authentication`](/security/authentication)，替换了 Express 适配器。SDK 的客户端用于测试：

```bash
$ npm uninstall @nestjs/platform-express @types/express
$ npm i --save @nestjs/platform-node @nestjs/mcp @modelcontextprotocol/server zod @nestjs/config @nestjs/drizzle drizzle-orm@rc pg @nestjs/authentication
$ npm i --save-dev @modelcontextprotocol/client drizzle-kit@rc @types/pg @nestjs/testing vitest vite

```

删除 `src/main.ts`：[Assemble the server](/tutorials/mcp-server#assemble-the-server) 会写入一个新的。在容器中启动 PostgreSQL：

```bash
$ docker run -d --name helpdesk-db -e POSTGRES_PASSWORD=helpdesk -e POSTGRES_DB=helpdesk -p 5432:5432 postgres:17

```

配置是一个 Zod 模式。`ConfigModule` 在启动时根据它验证环境变量，当缺少或格式错误时，服务器拒绝启动：

```typescript title="src/config.ts"
import { z } from 'zod';

const list = z
  .string()
  .transform((value) => value.split(',').map((item) => item.trim()).filter(Boolean));

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.url(),
  // The MCP server's public URL: the audience of its access tokens.
  MCP_RESOURCE: z.url(),
  // The identity provider's issuer, exactly as the tokens' `iss` claim names it.
  OIDC_ISSUER: z.url(),
  // Its signing keys: `jwks_uri` in its /.well-known/openid-configuration.
  OIDC_JWKS_URL: z.url(),
  // The tokens' `aud`, when the provider can't make it MCP_RESOURCE (Entra ID puts the API's client ID there).
  OIDC_AUDIENCE: z.string().min(1).optional(),
  // The `typ` header its access tokens carry: `at+jwt` (RFC 9068). Empty for a provider that sends none.
  OIDC_TOKEN_TYPE: z.string().default('at+jwt'),
  // The claim that names the agent's team.
  OIDC_TEAM_CLAIM: z.string().min(1).default('team'),
  // The hostnames the Host header may name, comma-separated.
  MCP_ALLOWED_HOSTS: list.default(['localhost', '127.0.0.1', '[::1]']),
  // Over stdio there is no token: the team the local user works in.
  HELPDESK_TEAM: z.string().regex(/^[a-z0-9-]+$/).optional(),
});

export type Env = z.infer<typeof envSchema>;

```

每个变量都在使用处进行了解释。在项目根目录中创建一个 `.env` 文件，包含数据库和充当身份提供者的 [development token issuer](/tutorials/mcp-server#get-a-token-for-development)：

```bash
DATABASE_URL=postgres://postgres:helpdesk@localhost:5432/helpdesk
MCP_RESOURCE=http://localhost:3000/mcp
OIDC_ISSUER=http://localhost:3001
OIDC_JWKS_URL=http://localhost:3001/jwks.json

```

#### 在 PostgreSQL 中存储工单

帮助台有团队、它们的工单以及每个工单的回复。团队的 id 是一个 slug，例如 `billing`，该 ID 包含在代理令牌的 `team` 声明中：

```typescript title="src/database/schema.ts"
import { index, integer, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const ticketStatus = pgEnum('ticket_status', ['open', 'pending', 'solved']);

export const teams = pgTable('teams', {
  // A slug such as `billing`: the value of the `team` claim in an agent's token.
  id: text('id').primaryKey(),
  name: text('name').notNull(),
});

export const tickets = pgTable(
  'tickets',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity({ startWith: 1001 }),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    customerEmail: text('customer_email').notNull(),
    status: ticketStatus('status').notNull().default('open'),
    createdAt: at('created_at').notNull().defaultNow(),
    updatedAt: at('updated_at').notNull().defaultNow(),
  },
  // Every query starts with the team: a search is a scan of one team's tickets.
  (table) => [index('tickets_team_id_updated_at_idx').on(table.teamId, table.updatedAt)],
);

export const replies = pgTable(
  'replies',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    ticketId: integer('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    // The agent who sent it, as their token names them.
    author: text('author').notNull(),
    body: text('body').notNull(),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (table) => [index('replies_ticket_id_idx').on(table.ticketId)],
);

export type Ticket = typeof tickets.$inferSelect;
export type Reply = typeof replies.$inferSelect;
export type TicketStatus = (typeof ticketStatus.enumValues)[number];

```

工单编号从 1001 开始，就像客户引用的那样，很容易猜测：不应依赖于编号是未知的。在项目根目录中添加一个 `drizzle.config.ts`：

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

生成迁移并应用它（参见 [Migrations](https://docs.nestjs.com/data/drizzle#迁移)）：

```bash
$ npx drizzle-kit generate --name=helpdesk
$ npx drizzle-kit migrate

```

`drizzle-kit` 从 `.env` 读取 `DATABASE_URL`。一个种子脚本添加了两个团队和一些工单。它首先清空表，因此仅用于开发数据库：

```typescript title="src/database/seed.ts"
// Development data: two teams and their tickets. It empties the three tables first.
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { envSchema } from '../config.js';
import { replies, teams, tickets } from './schema.js';

const { DATABASE_URL } = envSchema.pick({ DATABASE_URL: true }).parse(process.env);
const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle({ client: pool });

try {
  await db.transaction(async (tx) => {
    await tx.execute(sql`TRUNCATE replies, tickets, teams RESTART IDENTITY CASCADE`);
    await tx.insert(teams).values([
      { id: 'billing', name: 'Billing' },
      { id: 'shipping', name: 'Shipping' },
    ]);
    const created = await tx
      .insert(tickets)
      .values([
        {
          teamId: 'billing',
          subject: 'Charged twice for order 5521',
          body: 'My card shows two charges of 49.90 for the same order yesterday. Please refund one.',
          customerEmail: 'maria@example.com',
        },
        {
          teamId: 'billing',
          subject: 'Refund for a cancelled subscription',
          body: 'I cancelled on the 3rd but was charged on the 5th. I would like that refunded.',
          customerEmail: 'li@example.com',
          status: 'pending',
        },
        {
          teamId: 'shipping',
          subject: 'Parcel stuck in customs',
          body: 'Tracking for order 5498 has said "held at customs" for six days.',
          customerEmail: 'sam@example.com',
        },
        {
          teamId: 'shipping',
          subject: 'Wrong size delivered',
          body: 'I ordered the jacket in M and got an L. How do I exchange it?',
          customerEmail: 'noor@example.com',
        },
      ])
      .returning({ id: tickets.id });
    await tx.insert(replies).values({
      ticketId: created[1].id,
      author: 'grace',
      body: 'Sorry about that. Which card was charged, and on which date exactly?',
    });
  });
  console.log('Seeded 2 teams, 4 tickets and 1 reply');
} finally {
  await pool.end();
}

```

将这些脚本添加到 `package.json`。`db:seed` 运行编译后的脚本，如果存在则使用 `.env`：

```json
"db:seed": "node --env-file-if-exists=.env dist/database/seed.js",
"dev:issuer": "node --env-file=.env scripts/dev-issuer.ts",
"test:e2e": "nest build && vitest run --config ./vitest.config.e2e.ts"

```

另外两个脚本用于 [development tokens](/tutorials/mcp-server#get-a-token-for-development) 和 [tests](/tutorials/mcp-server#test-it)。构建并播种数据库：

```bash
$ npm run build
$ npm run db:seed
Seeded 2 teams, 4 tickets and 1 reply

```

#### 将每个查询的作用域限定到代理的团队

模型可以被诱导接受任何参数：“另外显示工单 1004”的客户电子邮件是它读取的文本。因此，访问永远不依赖于参数。服务中的每个方法都从调用者的令牌中获取团队，并将其放入语句中：

```typescript title="src/tickets/tickets.service.ts"
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { replies, tickets, type Reply, type Ticket, type TicketStatus } from '../database/schema.js';

export interface SearchTicketsQuery {
  text?: string;
  status?: TicketStatus;
  limit: number;
}

export type TicketSummary = Pick<Ticket, 'id' | 'subject' | 'status' | 'customerEmail' | 'updatedAt'>;
export type TicketWithReplies = Ticket & { replies: Reply[] };

/** Every method takes the agent's team, and never reads or changes another team's tickets. */
@Injectable()
export class TicketsService {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  search(team: string, { text, status, limit }: SearchTicketsQuery): Promise<TicketSummary[]> {
    const conditions: SQL[] = [eq(tickets.teamId, team)];
    if (text) {
      // The text is matched literally: % and _ in it are not wildcards.
      const pattern = `%${text.replace(/[\\%_]/g, '\\$&')}%`;
      conditions.push(or(ilike(tickets.subject, pattern), ilike(tickets.body, pattern))!);
    }
    if (status) {
      conditions.push(eq(tickets.status, status));
    }
    return this.db
      .select({
        id: tickets.id,
        subject: tickets.subject,
        status: tickets.status,
        customerEmail: tickets.customerEmail,
        updatedAt: tickets.updatedAt,
      })
      .from(tickets)
      .where(and(...conditions))
      .orderBy(desc(tickets.updatedAt), desc(tickets.id))
      .limit(limit);
  }

  /** The ticket and its replies, oldest first. Another team's ticket is as unknown as a missing one. */
  async findOne(team: string, id: number): Promise<TicketWithReplies> {
    const [ticket] = await this.db
      .select()
      .from(tickets)
      .where(and(eq(tickets.id, id), eq(tickets.teamId, team)));
    if (!ticket) {
      throw notFound(id);
    }
    const thread = await this.db
      .select()
      .from(replies)
      .where(eq(replies.ticketId, id))
      .orderBy(asc(replies.createdAt), asc(replies.id));
    return { ...ticket, replies: thread };
  }

  /** Adds a reply and, optionally, sets the status: both, or neither. */
  reply(team: string, id: number, author: string, body: string, status?: TicketStatus) {
    return this.db.transaction(async (tx) => {
      // The team is part of the statement that finds the ticket, and the row stays locked until the reply is in.
      const [ticket] = await tx
        .update(tickets)
        .set({ updatedAt: new Date(), ...(status && { status }) })
        .where(and(eq(tickets.id, id), eq(tickets.teamId, team)))
        .returning({ id: tickets.id, status: tickets.status });
      if (!ticket) {
        throw notFound(id);
      }
      const [reply] = await tx
        .insert(replies)
        .values({ ticketId: id, author, body })
        .returning({ id: replies.id });
      return { ticketId: ticket.id, replyId: reply.id, status: ticket.status };
    });
  }
}

function notFound(id: number) {
  return new NotFoundException(`Ticket ${id} not found`);
}

```

- **团队在 `WHERE` 子句中**，而不是在读取后检查的。另一个团队的工单被当作缺失的工单来处理，因此计费方甚至无法得知存在哪些运输编号。
- **回复是一个事务**。`UPDATE` 在团队内查找工单并锁定它，然后插入回复；另一个团队的工单不更新任何内容，也不插入任何内容。
- **搜索文本是字面匹配的**：`%` 和 `_` 被转义。

#### 了解谁在调用

模块在任何方法运行之前验证令牌（参见 [Verify OAuth access tokens](/tutorials/mcp-server#verify-oauth-access-tokens)）。一个参数装饰器从中读取代理：助手调用的支持代理：

```typescript title="src/tickets/agent.decorator.ts"
import { createParamDecorator, ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { McpExecutionContext } from '@nestjs/mcp';

/** Who is calling: the support agent's team, and the name their replies are signed with. */
export interface Agent {
  team: string;
  username: string;
}

/**
 * The agent a call is made for. Over HTTP, from the verified access token; over stdio, where there is
 * no token, from the environment the local client starts the server with.
 */
export const CurrentAgent = createParamDecorator((_data: unknown, context: ExecutionContext): Agent => {
  const ctx = McpExecutionContext.create(context).getContext();
  const agent =
    ctx.transport === 'stdio'
      ? { team: process.env.HELPDESK_TEAM, username: process.env.USER ?? 'local' }
      : { team: ctx.authInfo?.extra?.team, username: ctx.authInfo?.extra?.username };
  if (typeof agent.team !== 'string' || !agent.team || typeof agent.username !== 'string') {
    // The token is valid, but grants no team's tickets.
    throw new ForbiddenException(
      ctx.transport === 'stdio' ? 'Set HELPDESK_TEAM to the team to work in' : 'The access token names no team',
    );
  }
  return { team: agent.team, username: agent.username };
});

```

`McpExecutionContext.create(context)` 读取 MCP 调用的上下文，就像 `GqlExecutionContext` 对 GraphQL 所做的那样（参见 [Guards, interceptors, pipes and filters](/mcp/primitives#guards-interceptors-pipes-and-filters)）。通过 HTTP，`authInfo` 是验证器返回的内容；通过 stdio 没有令牌，团队来自环境变量。传输器决定，因此 HTTP 请求绝不会回退到环境的团队。有效的、没有团队的令牌是 403：401 会使客户端再次登录，这没有帮助。

#### 为模型编写工具

工具是一个带有`@Tool()`的方法。模型根据其名称和描述选择它，并从`.describe()`文本中填充参数，因此它说明了工具的作用、何时使用它以及每个参数的含义，并提供了一个示例。SDK 在方法运行前根据模式验证每次调用：

```typescript title="src/tickets/tickets.tools.ts"
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prompt, ResourceTemplate, Tool, type McpContext } from '@nestjs/mcp';
import type { PromptMessage } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { CurrentAgent, type Agent } from './agent.decorator.js';
import { TicketsService } from './tickets.service.js';

// The database's integer range: a larger number would be a 500, not a validation error.
const ticketId = z.number().int().min(1).max(2_147_483_647).describe('The ticket number, such as 1042');
const status = z.enum(['open', 'pending', 'solved']);

const searchTicketsSchema = z.object({
  text: z
    .string()
    .trim()
    .min(2)
    .max(200)
    .optional()
    .describe('Words to find in the subject or the description, such as "refund" or an order number'),
  status: status.optional().describe('Only tickets in this status. Leave it out to search all of them'),
  limit: z.number().int().min(1).max(50).default(10).describe('How many tickets to return, newest first'),
});

const replyToTicketSchema = z.object({
  ticketId,
  message: z
    .string()
    .trim()
    .min(1)
    .max(5000)
    .describe('The reply as the customer will read it, in plain text'),
  status: z
    .enum(['pending', 'solved'])
    .optional()
    .describe('"pending" when you asked the customer something, "solved" when nothing is left to do. Leave it out to keep the status'),
});

@Injectable()
export class TicketsTools {
  constructor(private readonly tickets: TicketsService) {}

  @Tool({
    name: 'search-tickets',
    description:
      "Search the support team's tickets by text and status. Returns each ticket's number, subject, status and customer, newest first; read a ticket's full thread as the resource tickets://{ticketId}",
    inputSchema: searchTicketsSchema,
    annotations: { readOnlyHint: true },
  })
  search(input: z.infer<typeof searchTicketsSchema>, _ctx: McpContext, @CurrentAgent() agent: Agent) {
    return this.tickets.search(agent.team, input);
  }

  @Tool({
    name: 'reply-to-ticket',
    description:
      "Reply to a ticket's customer, and optionally change the ticket's status. The customer reads the reply: only call it with text the user has approved",
    inputSchema: replyToTicketSchema,
    outputSchema: z.object({ ticketId: z.number().int(), replyId: z.number().int(), status }),
    // It adds to a ticket and removes nothing, but a retry adds a second reply.
    annotations: { destructiveHint: false, idempotentHint: false },
    scopes: ['tickets:write'],
  })
  reply(
    { ticketId, message, status }: z.infer<typeof replyToTicketSchema>,
    _ctx: McpContext,
    @CurrentAgent() agent: Agent,
  ) {
    return this.tickets.reply(agent.team, ticketId, agent.username, message, status);
  }

  @ResourceTemplate({
    uriTemplate: 'tickets://{ticketId}',
    name: 'ticket',
    description: 'A ticket with its whole thread: the description, then every reply, oldest first',
    mimeType: 'application/json',
  })
  ticket({ ticketId }: { ticketId: string }, _ctx: McpContext, @CurrentAgent() agent: Agent) {
    return this.tickets.findOne(agent.team, parseTicketId(ticketId));
  }

  @Prompt({
    name: 'draft-reply',
    description: 'Draft a reply to a ticket, for you to review before it is sent',
    argsSchema: z.object({
      ticketId: z.string().regex(/^\d+$/).describe('The ticket number, such as 1042'),
      tone: z.enum(['formal', 'friendly']).default('friendly').describe('How the reply sounds'),
    }),
  })
  async draftReply(
    { ticketId, tone }: { ticketId: string; tone: 'formal' | 'friendly' },
    _ctx: McpContext,
    @CurrentAgent() agent: Agent,
  ): Promise<PromptMessage[]> {
    const ticket = await this.tickets.findOne(agent.team, parseTicketId(ticketId));
    return [
      {
        role: 'user',
        content: {
          type: 'resource',
          resource: { uri: `tickets://${ticket.id}`, mimeType: 'application/json', text: JSON.stringify(ticket) },
        },
      },
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Draft a ${tone} reply to the customer of ticket ${ticket.id}. Answer what they asked last, and say what happens next. Show me the draft; send it with reply-to-ticket only once I approve it.`,
        },
      },
    ];
  }
}

/** A URI's variable is any string: a ticket number, or not found. */
function parseTicketId(value: string): number {
  const id = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(id) || id > 2_147_483_647) {
    throw new NotFoundException(`Ticket ${value} not found`);
  }
  return id;
}

```

- **`readOnlyHint: true` 在搜索上** 告诉客户端它不改变任何内容，因此可以不询问用户就运行。如果没有它，如`reply-to-ticket`所示，客户端可能会先询问；该工具的描述还告诉模型只发送已批准的文本。
- **`scopes: ['tickets:write']` 在回复上。** 没有它的令牌在方法运行前会收到 403，挑战指定了作用域，因此客户端可以请求用户提供（提升授权）。
- **方法获得经过验证的输入**：`text` 已修剪，`limit` 已设置默认值。模式拒绝的参数永远不会到达它；模型会收到一个说明错误的错误，并可以重试。
- **`ticketId` 具有数据库的范围。** 没有`max()`，PostgreSQL 中较大的数字会失败，模型将收到`Internal server error` 而不是可操作的消息。
- **代理是第三个参数。** MCP 方法的前两个参数是输入和调用的上下文（参见[The call context](/mcp/primitives#the-call-context)）。

工具抛出的内容成为一个带有`isError: true`的结果：一个`NotFoundException` 发送其消息、`Ticket 1003 not found` 和任何其他错误`Internal server error`（参见[Errors](/mcp/primitives#errors)）。

#### 将票据作为资源提供

资源是客户端通过 URI 读取的数据，通常是用户附加到对话中的一个。上面的`ticket` 方法在诸如`tickets://1001` 这样的 URI 上提供每个线程，该 URI 来自一个[RFC 6570](https://datatracker.ietf.org/doc/html/rfc6570) 模板，该模板将其变量作为字符串接收。不是票据编号或另一个团队的票据的，是`NotFoundException`：规范的资源未找到错误。

提示是用户在客户端选择的模板，例如斜杠命令。`draft-reply` 将票据作为嵌入式资源附加，然后给出指令。提示参数在 MCP 中是字符串，因此采用`ticketId` 模式。

模块将类注册为任何提供者：

```typescript title="src/tickets/tickets.module.ts"
import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service.js';
import { TicketsTools } from './tickets.tools.js';

@Module({
  providers: [TicketsService, TicketsTools],
})
export class TicketsModule {}

```

#### 验证 OAuth 访问令牌

在 MCP 中，网络上的服务器是一个 OAuth 2.1 **资源服务器**：客户端从您的身份提供者获取访问令牌，并随每次请求发送。服务器验证它，绝不颁发令牌（参见[Authorization](/mcp/primitives#authorization)）。验证器是一个带有`verifyAccessToken(token)` 的类。`JwtVerifier` 从`@nestjs/authentication` 检查签名是否与提供者的密钥、颁发者、受众、类型和过期时间匹配。所有提供者特定的内容都是配置：

```typescript title="src/auth/access-token.verifier.ts"
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtVerifier, type JwtClaims } from '@nestjs/authentication';
import type { McpTokenVerifier } from '@nestjs/mcp';
import type { AuthInfo } from '@modelcontextprotocol/server';
import type { Env } from '../config.js';

/** Verifies the identity provider's JWT access tokens, and reads what the tools need from them. */
@Injectable()
export class AccessTokenVerifier implements McpTokenVerifier {
  private readonly jwt: JwtVerifier;
  private readonly resource: URL;
  private readonly teamClaim: string;

  constructor(config: ConfigService<Env, true>) {
    this.resource = new URL(config.get('MCP_RESOURCE', { infer: true }));
    this.teamClaim = config.get('OIDC_TEAM_CLAIM', { infer: true });
    this.jwt = new JwtVerifier({
      jwks: config.get('OIDC_JWKS_URL', { infer: true }),
      issuer: config.get('OIDC_ISSUER', { infer: true }),
      // Only tokens issued for this server: not one the user's browser got for another API.
      audience: config.get('OIDC_AUDIENCE', { infer: true }) ?? config.get('MCP_RESOURCE', { infer: true }),
      // An access token, not an ID token or another JWT the provider signs.
      type: config.get('OIDC_TOKEN_TYPE', { infer: true }) || undefined,
      required: ['exp', 'sub'],
      // The provider's clock and this server's are never quite the same.
      clockTolerance: '30s',
    });
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    // A bad signature, another issuer or audience, or an expired token throws a JwtError: a 401.
    const claims = await this.jwt.verify(token);
    const team = claims[this.teamClaim];
    return {
      token,
      // The OAuth client the token was issued to: the assistant, not the agent.
      clientId: String(claims.azp ?? claims.client_id ?? claims.sub),
      scopes: scopesOf(claims),
      expiresAt: claims.exp,
      resource: this.resource,
      extra: {
        subject: claims.sub,
        username: typeof claims.preferred_username === 'string' ? claims.preferred_username : claims.sub,
        team: typeof team === 'string' ? team : undefined,
      },
    };
  }
}

/** `scope` is a space-separated string (RFC 9068); some providers send `scp`, as a string or a list. */
function scopesOf(claims: JwtClaims): string[] {
  const value = claims.scope ?? claims.scp;
  const scopes = Array.isArray(value) ? value : typeof value === 'string' ? value.split(' ') : [];
  return scopes.filter((scope): scope is string => typeof scope === 'string' && scope.length > 0);
}

```

- **受众是服务器的 URL。** 提供者使用相同的密钥对每个 API 进行签名：如果没有检查，用户为另一个 API 获取的令牌也会在这里有效，这就是为什么`JwtVerifier` 拒绝没有`audience` 的密钥集。MCP 客户端请求用于`MCP_RESOURCE` 的令牌；`OIDC_AUDIENCE` 适用于在`aud` 中放置其他内容的提供者。
- **`type` 默认为`at+jwt`**，即[RFC 9068](https://datatracker.ietf.org/doc/html/rfc9068) 访问令牌的头部，它会排除提供者签名的其他 JWT，例如 ID 令牌。对于不发送此头的提供者，请将`OIDC_TOKEN_TYPE` 留空。
- **被拒绝的令牌会抛出`JwtError`**（`status: 401`），模块以 401 和一个`WWW-Authenticate` 挑战来响应。无法获取的密钥会抛出纯错误，即 500，这样客户端在停机期间就不会丢弃有效的令牌。
- **`clientId` 是助手**，即颁发令牌的 OAuth 客户端，而`sub` 是代理。模块还会检查`resource` 是否是服务器的 URL，以及`expiresAt` 是否在未来。

模块提供验证器，因此`McpModule` 可以注入它：

```typescript title="src/auth/auth.module.ts"
import { Module } from '@nestjs/common';
import { AccessTokenVerifier } from './access-token.verifier.js';

@Module({
  providers: [AccessTokenVerifier],
  exports: [AccessTokenVerifier],
})
export class AuthModule {}

```

#### 组装服务器

根模块加载配置，打开数据库连接池，并使用配置中的值注册`McpModule`。`forRootAsync()` 接收验证器实例，由其工厂注入：

```typescript title="src/app.module.ts"
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DrizzleModule } from '@nestjs/drizzle';
import { McpModule } from '@nestjs/mcp';
import { createObserveModule } from '@nestjs/observe';
import { drizzle } from 'drizzle-orm/node-postgres';
import { fileURLToPath } from 'node:url';
import { AccessTokenVerifier } from './auth/access-token.verifier.js';
import { AuthModule } from './auth/auth.module.js';
import { envSchema, type Env } from './config.js';
import { TicketsModule } from './tickets/tickets.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // First, so it shuts down last and still sends what the other modules did.
    ObserveModule.forRoot({
      // Empty until `npx @nestjs/observe link` writes the key pair into .env: the SDK then sends nothing.
      appKey: process.env.OBSERVE_APP_KEY ?? '',
      appSecret: process.env.OBSERVE_APP_SECRET ?? '',
      serviceId: 'helpdesk-mcp',
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envSchema,
      // The project's .env, whichever directory a local client starts the stdio server in.
      envFilePath: fileURLToPath(new URL('../.env', import.meta.url)),
    }),
    DrizzleModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        drizzle,
        connection: config.get('DATABASE_URL', { infer: true }),
      }),
    }),
    McpModule.forRootAsync({
      imports: [AuthModule],
      inject: [ConfigService, AccessTokenVerifier],
      useFactory: (config: ConfigService<Env, true>, verifier: AccessTokenVerifier) => ({
        name: 'helpdesk',
        version: '1.0.0',
        instructions:
          "The support team's helpdesk. Find tickets with search-tickets, read one with its thread as tickets://{ticketId}, and reply with reply-to-ticket only after the user approved the text.",
        include: [TicketsModule],
        http: { allowedHosts: config.get('MCP_ALLOWED_HOSTS', { infer: true }) },
        auth: {
          verifier,
          resource: config.get('MCP_RESOURCE', { infer: true }),
          authorizationServers: [config.get('OIDC_ISSUER', { infer: true })],
          scopesSupported: ['tickets:read', 'tickets:write'],
          // Every request, from the first, needs the read scope.
          requiredScopes: ['tickets:read'],
          resourceName: 'Helpdesk',
        },
      }),
    }),
    TicketsModule,
  ],
})
export class AppModule {}

```

- **`auth`** 使每次请求都需要有效的令牌：`resource` 是服务器的规范 URL，`authorizationServers` 是它信任的颁发者，`scopesSupported` 是它所宣传的内容，而`requiredScopes` 在每个请求上添加`tickets:read`，列出包含的工具。
- **受保护的资源元数据**（[RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728)），它告诉客户端在哪里登录，由模块在`/.well-known/oauth-protected-resource/mcp` 提供。
- **`allowedHosts`** 以 403 响应其他`Host` 头部。如果没有它，其域名解析到`127.0.0.1` 的网页可以访问在`localhost` 上的服务器（DNS 重绑定）。`Origin` 检查默认开启：任何非 localhost 站点的页面都会收到 403，而发送无`Origin` 的助手和 CLI 则通过（参见[The HTTP endpoint](/mcp/transports#the-http-endpoint)）。
- **`envFilePath`** 从编译文件中找到项目的`.env`，无论桌面客户端在哪个目录启动 stdio 服务器。
- **`ObserveModule` 在`imports` 中排在第一位**，就像[SDK's quick start](/observability/sdk#quick-start) 所做的那样：模块按相反顺序关闭，因此它最后停止，并发送其他模块记录的内容（参见[Shutdown](/observability/sdk#shutdown)）。`createObserveModule()` 使用`ObserveInstrument` 返回它，而`main.ts` 和`stdio.ts` 将其传递给 Nest。
- **密钥对在链接项目之前是空的。** 没有密钥对，SDK 不发送任何内容，并在启动时说明。`npx @nestjs/observe link` 将`OBSERVE_APP_KEY` 和`OBSERVE_APP_SECRET` 写入`.env`，并将`--env-file .env` 添加到`start` 脚本中，以便在 SDK 读取它们（参见[Linking from the terminal](/observability/sdk#linking-from-the-terminal)）之前它们在环境中可用。空值和`'YOUR_APP_KEY'` 占位符`nest new` 写入的都回退到环境（参见[Reading the key pair from the environment](/observability/sdk#reading-the-key-pair-from-the-environment)）；`enabled: false` 在生产环境之外也会静音您有意链接的开发机器。

`main.ts` 在 Node 适配器上启动 HTTP 应用程序。有了适配器，应用程序选项（包括`instrument`）是第三个参数：

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
  // One JSON object per line in production; readable text in development.
  logger: new ConsoleLogger({ json: production, redact: ['authorization', 'token'] }),
});
app.useSecurityHeaders();
app.enableShutdownHooks();

const config = app.get<ConfigService<Env, true>>(ConfigService);
await app.listen(config.get('PORT', { infer: true }));

```

- **生产环境中的 JSON 日志**（参见[JSON logging](/application/logger#json-logging)），从记录的对象中屏蔽令牌，并在每个响应上使用[security headers](/security/helmet)。
- **无 CORS。** 助手不从浏览器调用。来自另一个源的基于浏览器的客户端需要在`allowedOrigins` 和您的 CORS 配置中包含其主机名（参见[The HTTP endpoint](/mcp/transports#the-http-endpoint)）。

端点位于`http://localhost:3000/mcp`，每个请求都需要令牌。在项目链接之前，服务器日志显示 Observe 没有发送任何内容：

```bash
$ npm run start
...
WARN [ObserveAgentWorker] Observe is installed but sends nothing: appKey and appSecret are not set, and the hosted collector accepts no telemetry without a key and a secret. If they come from the environment, check that OBSERVE_APP_KEY and OBSERVE_APP_SECRET reach this process, then restart it. To get a pair, run npx @nestjs/observe link or create one at https://observe.nestjs.com.
LOG [NestApplication] Nest application successfully started

```

#### 获取开发令牌

身份提供者会登录用户，并向助手颁发令牌。对于开发环境，一个脚本充当其替代品：它持有密钥对，在 `OIDC_JWKS_URL` 处作为 JSON Web Key Set (JWKS) 提供公钥，并为任何代理、团队和作用域签署访问令牌。测试也使用它：

```typescript title="scripts/dev-issuer.ts"
/**
 * A stand-in for an identity provider, for development and tests only: a key pair of its own, its
 * public key served as a JWKS, and access tokens signed with it for whatever team and scopes you ask.
 * Never deploy it: whoever can reach it can mint a token.
 */
import { generateKeyPairSync } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { JwtSigner, type Duration } from '@nestjs/authentication';

export type DevTokenClaims = { username?: string; team?: string; scope?: string };
export type DevTokenOptions = { issuer?: string; audience?: string; ttl?: Duration; type?: string; now?: () => number };

const KID = 'dev-key';

export class DevIssuer {
  private readonly keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  readonly issuer: string;
  readonly audience: string;

  constructor(issuer: string, audience: string) {
    this.issuer = issuer;
    this.audience = audience;
  }

  /** An RFC 9068 access token, as an authorization server issues one for the MCP server. */
  sign(
    { username = 'ada', team = 'billing', scope = 'tickets:read tickets:write' }: DevTokenClaims = {},
    { issuer = this.issuer, audience = this.audience, ttl = '1h', type = 'at+jwt', now = Date.now }: DevTokenOptions = {},
  ): string {
    const signer = new JwtSigner({ key: this.keys.privateKey, kid: KID, issuer, audience, ttl, type, now });
    return signer.sign({ sub: username, preferred_username: username, client_id: 'dev-issuer', scope, team });
  }

  jwks() {
    const jwk = this.keys.publicKey.export({ format: 'jwk' });
    return { keys: [{ ...jwk, kid: KID, alg: 'RS256', use: 'sig' }] };
  }

  /** Serves the JWKS, and `POST /token` with a form of `username`, `team` and `scope`. */
  listen(port: number): Promise<Server> {
    const server = createServer(async (req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.method === 'GET' && req.url === '/jwks.json') {
        res.end(JSON.stringify(this.jwks()));
      } else if (req.method === 'POST' && req.url === '/token') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const form = Object.fromEntries(new URLSearchParams(body));
        const accessToken = this.sign(form);
        res.end(JSON.stringify({ access_token: accessToken, token_type: 'Bearer', expires_in: 3600 }));
      } else {
        res.statusCode = 404;
        res.end('{"error":"not_found"}');
      }
    });
    // Loopback only: nothing outside this machine can ask it for a token.
    return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
  }
}

// `npm run dev:issuer`: serves at the port of OIDC_JWKS_URL, as the issuer and for the audience in .env.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The dev issuer mints tokens for anyone who asks: never run it in production');
  }
  const { OIDC_ISSUER, OIDC_JWKS_URL, MCP_RESOURCE } = process.env;
  if (!OIDC_ISSUER || !OIDC_JWKS_URL || !MCP_RESOURCE) {
    throw new Error('Set OIDC_ISSUER, OIDC_JWKS_URL and MCP_RESOURCE in .env');
  }
  const port = Number(new URL(OIDC_JWKS_URL).port);
  await new DevIssuer(OIDC_ISSUER, MCP_RESOURCE).listen(port);
  console.log(`Dev issuer ${OIDC_ISSUER}: keys at ${OIDC_JWKS_URL}, tokens from POST http://localhost:${port}/token`);
}

```

> 警告 **警告** 开发颁发者会向任何请求者颁发令牌。切勿部署它：它无法使用 `NODE_ENV=production` 启动，仅监听回环接口，并且存在于 `scripts/` 中，该位置不会被构建编译。它也不是授权服务器：它没有登录页面，因此通过 OAuth 登录用户的客户端无法使用它（参见 [Connect an assistant](/tutorials/mcp-server#connect-an-assistant)）。

它的令牌具有 `OIDC_ISSUER` 作为 `iss`，`MCP_RESOURCE` 作为 `aud`，`at+jwt` 作为 `typ`，并且在一小时后过期；重启会生成新密钥并使旧密钥失效。在单独的终端中启动它：

```bash
$ npm run dev:issuer
Dev issuer http://localhost:3001: keys at http://localhost:3001/jwks.json, tokens from POST http://localhost:3001/token

```

#### 尝试使用

在另一个终端中启动服务器，使用 `npm run start`。没有令牌的请求会收到 401，带有 `WWW-Authenticate` 挑战，该挑战指定了每个请求所需的作用域，并指向元数据（此处和下方省略了一些头部）：

```bash
$ curl -i localhost:3000/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
HTTP/1.1 401 Unauthorized
content-type: application/json
www-authenticate: Bearer error="invalid_token", error_description="Missing Authorization header", scope="tickets:read", resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource/mcp"
...

{"error":"invalid_token","error_description":"Missing Authorization header"}

```

元数据指定了服务器的名称、它接受的颁发者及其作用域。它不需要令牌：

```bash
$ curl -i localhost:3000/.well-known/oauth-protected-resource/mcp
HTTP/1.1 200 OK
...
Access-Control-Allow-Origin: *
Cache-Control: public, max-age=3600
Content-Type: application/json; charset=utf-8
...

{"resource":"http://localhost:3000/mcp","authorization_servers":["http://localhost:3001"],"bearer_methods_supported":["header"],"scopes_supported":["tickets:read","tickets:write"],"resource_name":"Helpdesk"}

```

向开发颁发者请求 Ada 账单团队的令牌，包含两个作用域，并将其保存在变量中，使用 `jq`：

```bash
$ curl localhost:3001/token -d username=ada -d team=billing -d 'scope=tickets:read tickets:write'
{"access_token":"eyJhbGciOiJSUzI1NiIsInR5...","token_type":"Bearer","expires_in":3600}
$ TOKEN=$(curl -s localhost:3001/token -d username=ada -d team=billing -d 'scope=tickets:read tickets:write' | jq -r .access_token)

```

使用该令牌的 `tools/call` 会搜索账单的工单。该端点不保留会话，因此不需要先有 `initialize`，它会以服务端推送事件的形式回答，客户端表示接受：

```bash
$ curl -i localhost:3000/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -H "Authorization: Bearer $TOKEN" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search-tickets","arguments":{"text":"refund"}}}'
HTTP/1.1 200 OK
content-type: text/event-stream
...

event: message
data: {"result":{"content":[{"type":"text","text":"[{\"id\":1002,\"subject\":\"Refund for a cancelled subscription\",\"status\":\"pending\",\"customerEmail\":\"li@example.com\",\"updatedAt\":\"2026-11-25T09:20:49.738Z\"},{\"id\":1001,\"subject\":\"Charged twice for order 5521\",\"status\":\"open\",\"customerEmail\":\"maria@example.com\",\"updatedAt\":\"2026-11-25T09:20:49.738Z\"}]"}]},"jsonrpc":"2.0","id":1}

```

[MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) 的命令行是一个真实的 MCP 客户端，并将令牌作为头部传递。`--method tools/list` 列出了工具及其模式，就像助手看到的那样。将工单视为资源读取，然后回复并解决它；回复的结果是其 `structuredContent`，并且与 JSON 文本相同：

```bash
$ npx @modelcontextprotocol/inspector --cli http://localhost:3000/mcp --header "Authorization: Bearer $TOKEN" --method resources/read --uri tickets://1002
{
  "contents": [
    {
      "uri": "tickets://1002",
      "mimeType": "application/json",
      "text": "{\"id\":1002,\"teamId\":\"billing\",\"subject\":\"Refund for a cancelled subscription\",\"body\":\"I cancelled on the 3rd but was charged on the 5th. I would like that refunded.\",\"customerEmail\":\"li@example.com\",\"status\":\"pending\",\"createdAt\":\"2026-11-25T09:20:49.738Z\",\"updatedAt\":\"2026-11-25T09:20:49.738Z\",\"replies\":[{\"id\":1,\"ticketId\":1002,\"author\":\"grace\",\"body\":\"Sorry about that. Which card was charged, and on which date exactly?\",\"createdAt\":\"2026-11-25T09:20:49.738Z\"}]}"
    }
  ]
}
$ npx @modelcontextprotocol/inspector --cli http://localhost:3000/mcp --header "Authorization: Bearer $TOKEN" --method tools/call --tool-name reply-to-ticket --tool-arg ticketId=1002 'message=We have refunded the charge of the 5th. It reaches your card in 3 to 5 days.' status=solved
{
  "content": [
    {
      "type": "text",
      "text": "{\"ticketId\":1002,\"replyId\":2,\"status\":\"solved\"}"
    }
  ],
  "structuredContent": {
    "ticketId": 1002,
    "replyId": 2,
    "status": "solved"
  }
}

```

Bob 在运输团队。账单的工单不属于他：

```bash
$ BOB=$(curl -s localhost:3001/token -d username=bob -d team=shipping | jq -r .access_token)
$ npx @modelcontextprotocol/inspector --cli http://localhost:3000/mcp --header "Authorization: Bearer $BOB" --method resources/read --uri tickets://1002
{"error":{"code":"error","message":"Resource not found: tickets://1002"}}

```

仅包含 `tickets:read` 的令牌可以搜索，但不能回复。403 的挑战指定了需要向用户请求的作用域：

```bash
$ READER=$(curl -s localhost:3001/token -d username=ada -d team=billing -d scope=tickets:read | jq -r .access_token)
$ curl -i localhost:3000/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -H "Authorization: Bearer $READER" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"reply-to-ticket","arguments":{"ticketId":1001,"message":"Hello"}}}'
HTTP/1.1 403 Forbidden
content-type: application/json
www-authenticate: Bearer error="insufficient_scope", error_description="Insufficient scope", scope="tickets:write", resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource/mcp"
...

{"error":"insufficient_scope","error_description":"Insufficient scope"}

```

来自另一个站点的网页请求，以及服务器不响应 `Host` 的请求，在读取任何内容之前就会收到 403：

```bash
$ curl -i localhost:3000/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -H "Authorization: Bearer $TOKEN" -H 'Origin: https://elsewhere.example' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
HTTP/1.1 403 Forbidden
...

{"jsonrpc":"2.0","error":{"code":-32000,"message":"Invalid Origin: elsewhere.example"},"id":null}
$ curl -i localhost:3000/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -H "Authorization: Bearer $TOKEN" -H 'Host: attacker.example:3000' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
HTTP/1.1 403 Forbidden
...

{"jsonrpc":"2.0","error":{"code":-32000,"message":"Invalid Host: attacker.example"},"id":null}

```

#### 通过 stdio 提供相同工具

用户机器上的助手（Claude Desktop、Claude Code、IDE）也可以将服务器作为本地进程启动，并通过 stdin 和 stdout 与其通信。`stdio.ts` 从独立应用程序上下文中提供相同的 模块：

```typescript title="src/stdio.ts"
import { NestFactory } from '@nestjs/core';
import { McpStdioLogger, McpStdioServer } from '@nestjs/mcp';
import { AppModule, ObserveInstrument } from './app.module.js';

// stdout carries the protocol: every log line goes to stderr.
const app = await NestFactory.createApplicationContext(AppModule, {
  instrument: ObserveInstrument,
  logger: new McpStdioLogger(),
});
await app.get(McpStdioServer).listen();
await app.close();

```

`McpStdioLogger` 将每个日志级别写入 stderr：stdout 携带协议，Nest 的默认日志记录器写入其中。Observe 的 SDK 通过 Nest 的日志记录器记录日志，因此其行也会发送到 stderr。`listen()` 在客户端关闭 stdin 时解析（参见 [Over stdio](/mcp/transports#over-stdio)）。

通过 stdio，该进程属于一个用户，并且规范从环境变量获取凭据，而不是 OAuth。没有令牌，因此不会检查 `scopes`，团队来自 `HELPDESK_TEAM`。`.env` 中的数据库 URL 是那里的真实访问控制：谁拥有它谁就拥有数据。

客户端接收一个命令，从他们选择的目录运行：使用构建文件的绝对路径 `node`。而不是 `npm run`，后者将自己的行打印到 stdout，即协议的通道。桌面客户端以如下配置接收它：

```json
{
  "mcpServers": {
    "helpdesk": {
      "command": "node",
      "args": ["/path/to/helpdesk-mcp/dist/stdio.js"],
      "env": { "HELPDESK_TEAM": "billing" }
    }
  }
}

```

其余的配置来自项目的 `.env`，但不是 Observe 的密钥对，SDK 在 `ConfigModule` 加载文件之前从环境变量读取它：要报告 stdio 调用，请将 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET` 添加到客户端的 `env`。测试使用此命令和环境变量启动服务器，检查器命令行也是如此，这里是针对运输团队的（stderr 上的服务器日志被省略）：

```bash
$ npx @modelcontextprotocol/inspector --cli -e HELPDESK_TEAM=shipping node dist/stdio.js --method tools/call --tool-name search-tickets
{
  "content": [
    {
      "type": "text",
      "text": "[{\"id\":1004,\"subject\":\"Wrong size delivered\",\"status\":\"open\",\"customerEmail\":\"noor@example.com\",\"updatedAt\":\"2026-11-25T09:20:49.738Z\"},{\"id\":1003,\"subject\":\"Parcel stuck in customs\",\"status\":\"open\",\"customerEmail\":\"sam@example.com\",\"updatedAt\":\"2026-11-25T09:20:49.738Z\"}]"
    }
  ]
}

```

#### 连接助手

大多数 MCP 客户端可以自行登录用户：在 401 响应中，它们读取元数据，找到身份提供者，使用它注册或使用您配置的客户端 ID，然后打开其登录页面。这需要一个真实的授权服务器，而开发颁发者不是：使用它时，将令牌作为 `Authorization` 头部提供给客户端，或者运行 stdio 命令。

> 警告 **警告** 本教程未运行此部分，该教程是使用 SDK 客户端和 MCP Inspector 命令行进行测试的。它遵循撰写时的每个客户端的文档。

| 客户端 | 带头部的远程服务器 | stdio 命令 | 使用 OAuth 登录 |
| --- | --- | --- | --- |
| Claude Code | `claude mcp add --transport http ... --header` | `claude mcp add --env ... -- node ...` | 是，使用 `/mcp` |
| Claude Desktop | 自定义连接器，从 Anthropic 的云端访问：仅公共 URL | `mcpServers` 在 `claude_desktop_config.json` 中 | 是，自定义连接器 |
| Cursor | `mcpServers` 在 `.cursor/mcp.json` 中：`url`，`headers` | 相同文件：`command`，`args`，`env` | 是 |
| VS Code (Copilot) | `servers` 在 `.vscode/mcp.json` 中：`"type": "http"`，`url`，`headers` | 相同文件：`"type": "stdio"` | 是 |
| Windsurf | `mcpServers` 在 `mcp_config.json` 中：`serverUrl`，`headers` | 相同文件 | 是 |
| Cline | `mcpServers` 在 `cline_mcp_settings.json` 中：`"type": "streamableHttp"`，`url`，`headers` | 相同文件 | 未记录 |
| Zed | 在其设置中：`context_servers` 在 `url`，`headers` | 相同密钥：`command`，`args`，`env` | 是，无需头部 |
| Gemini CLI | `gemini mcp add --transport http --header`，或 `httpUrl` 和 `headers` 在 `settings.json` 中 | `gemini mcp add -e ...` | 是 |
| Codex CLI | `[mcp_servers.helpdesk]` 在 `config.toml` 中：`url`，`bearer_token_env_var` | `codex mcp add --env ... -- node ...` | 是，使用 `codex mcp login` |
| ChatGPT | 否：它不发送自定义头部，并且需要公共 URL | 否 | 是，仅 OAuth |

Claude Code、Gemini CLI 和 Codex CLI 可以从命令行添加一个服务器。Claude Code 和 Gemini CLI 直接使用头部信息；Codex 从您指定的环境变量中读取令牌：

```bash
$ claude mcp add --transport http helpdesk http://localhost:3000/mcp --header "Authorization: Bearer $TOKEN"
$ claude mcp add --env HELPDESK_TEAM=billing --transport stdio helpdesk-local -- node /path/to/helpdesk-mcp/dist/stdio.js
$ gemini mcp add --transport http --header "Authorization: Bearer $TOKEN" helpdesk http://localhost:3000/mcp
$ codex mcp add helpdesk-local --env HELPDESK_TEAM=billing -- node /path/to/helpdesk-mcp/dist/stdio.js

```

大多数编辑器采用 `mcpServers` 形状的 [the previous section](/tutorials/mcp-server#serve-the-same-tools-over-stdio)，对于远程服务器提供 `url` 和 `headers`。在 Cursor 的 `.cursor/mcp.json` 中，头部可以从您的环境变量中读取令牌，而不是从文件：

```json
{
  "mcpServers": {
    "helpdesk": {
      "url": "http://localhost:3000/mcp",
      "headers": { "Authorization": "Bearer ${env:HELPDESK_TOKEN}" }
    }
  }
}

```

其他客户端重命名了键，如表格所示：Windsurf 的 `serverUrl`、Gemini 的 `httpUrl`（其 `url` 表示较旧的 SSE 传输）、Cline 的 `"type": "streamableHttp"`，否则会回退到 SSE。VS Code 的 `.vscode/mcp.json` 列出了 `servers`，并且可以提示一次令牌后将其保存在其密钥存储中：

```json
{
  "inputs": [{ "type": "promptString", "id": "helpdesk-token", "password": true }],
  "servers": {
    "helpdesk": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": { "Authorization": "Bearer ${input:helpdesk-token}" }
    }
  }
}

```

Codex CLI 在 `~/.codex/config.toml` 中配置远程服务器，并指定了保存令牌的变量名称：

```toml
[mcp_servers.helpdesk]
url = "http://localhost:3000/mcp"
bearer_token_env_var = "HELPDESK_TOKEN"

```

使用真实的身份提供者时，请省略头部，让客户端进行登录。开发令牌在一小时后过期：请颁发者提供新令牌，然后更新头部或变量。

#### 使用真实的身份提供者

在生产环境中，将配置指向您的身份提供者。`OIDC_JWKS_URL` 是其 `jwks_uri` 文档的 `/.well-known/openid-configuration`，而 `OIDC_ISSUER` 是其访问令牌的确切 `iss`。在提供者中创建一个标识符为 `MCP_RESOURCE` 的 API，具有范围 `tickets:read` 和 `tickets:write`，以及一个用于团队的声明（`OIDC_TEAM_CLAIM` 命名它）。与提供者文档相比的主要区别如下：

| 提供者 | 颁发者 | `aud` | `typ` | 范围 | 团队 |
| --- | --- | --- | --- | --- | --- |
| Auth0 | `https://<tenant>.auth0.com/`，带斜杠 | API 的标识符 | 带有 API RFC 9068 令牌配置的 `at+jwt` | `scope` | 由 Action 设置的自定义声明 |
| Microsoft Entra ID | `https://login.microsoftonline.com/<tenant-id>/v2.0` | API 的客户端 ID：设置 `OIDC_AUDIENCE` | `JWT`：设置 `OIDC_TOKEN_TYPE` 为空 | `scp` | 需要声明映射 |
| Okta | `https://<domain>/oauth2/<server-id>` | 授权服务器的受众 | 无：设置 `OIDC_TOKEN_TYPE` 为空 | `scp`，一个列表 | 授权服务器上的自定义声明 |
| WorkOS AuthKit | `https://<authkit-domain>` | 资源指示器 | 检查令牌 | `scope` | 一个 JWT 模板 |

> 警告 **警告** 这些行未在本次教程中运行；它们总结了撰写时每个提供者的文档。从您的提供者解码一个访问令牌（其头部和有效载荷是 base64url 编码的 JSON），并在部署前将其与配置进行比较。助手是否可以自行登录也取决于提供者：它必须允许它们通过动态客户端注册或客户端 ID 元数据文档进行注册，否则您需要为每个助手单独注册。

#### 测试它

测试使用开发颁发者的身份提供者进行模拟：为运行生成的密钥对，作为 `OIDC_JWKS_URL` 命名的 JWKS 来提供，用于签名令牌。应用程序使用其真实验证器进行验证；`JwksClient` 仅在环回地址上接受纯 `http`。数据存储在 PostgreSQL 中，因为团队作用域是关于 SQL 语句的。测试配置为应用程序提供了其启动时验证的环境：

```typescript title="vitest.config.e2e.ts"
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // The files share one database, and each empties it first.
    fileParallelism: false,
    env: {
      DATABASE_URL: 'postgres://unused-in-tests',
      MCP_RESOURCE: 'http://localhost:3000/mcp',
      OIDC_ISSUER: 'https://idp.test',
      // The key set test/helpdesk.e2e-spec.ts serves, from the dev issuer.
      OIDC_JWKS_URL: 'http://127.0.0.1:3162/jwks.json',
    },
  },
});

```

一个辅助程序迁移测试数据库，清空它，并为每个团队添加一个票据：

```typescript title="test/fixtures.ts"
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';
import { teams, tickets } from '../src/database/schema.js';

/** Migrates the test database, empties it, and adds one ticket for each of two teams. */
export async function resetDatabase(pool: Pool) {
  const db = drizzle({ client: pool });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
  await db.execute(sql`TRUNCATE replies, tickets, teams RESTART IDENTITY CASCADE`);
  await db.insert(teams).values([
    { id: 'billing', name: 'Billing' },
    { id: 'shipping', name: 'Shipping' },
  ]);
  const [billing, shipping] = await db
    .insert(tickets)
    .values([
      { teamId: 'billing', subject: 'Charged twice', body: 'Two charges for order 5521', customerEmail: 'maria@example.com' },
      { teamId: 'shipping', subject: 'Parcel stuck in customs', body: 'Order 5498', customerEmail: 'sam@example.com' },
    ])
    .returning({ id: tickets.id });
  return { db, billingTicket: billing.id, shippingTicket: shipping.id };
}

```

第一个文件将 SDK 的内存客户端与来自 `@nestjs/mcp/testing` 的 `connectMcpClient()` 连接：令牌检查、模式、范围和装饰器运行，没有 socket（参见 [The in-memory client](/mcp/testing#the-in-memory-client)）。401 错误和 `Origin` 和 `Host` 检查通过真实的 HTTP 进行测试，使用 `fetch()` 和 SDK 的 Streamable HTTP 客户端：

```typescript title="test/helpdesk.e2e-spec.ts"
import { request as httpRequest, type Server } from 'node:http';
import {
  Client,
  InsufficientScopeError,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { getDrizzleToken } from '@nestjs/drizzle';
import { connectMcpClient } from '@nestjs/mcp/testing';
import { NodeAdapter, type NestNodeApplication } from '@nestjs/platform-node';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { DevIssuer, type DevTokenClaims } from '../scripts/dev-issuer.js';
import { AppModule } from '../src/app.module.js';
import { replies, tickets } from '../src/database/schema.js';
import { resetDatabase } from './fixtures.js';

const url = process.env.TEST_DATABASE_URL;
const PORT = 3163;

// Stands in for the identity provider: its keys, served as the JWKS that OIDC_JWKS_URL names.
const issuer = new DevIssuer(process.env.OIDC_ISSUER!, process.env.MCP_RESOURCE!);

describe.skipIf(!url)('Helpdesk MCP server (e2e)', () => {
  const pool = new Pool({ connectionString: url });
  let fixtures: Awaited<ReturnType<typeof resetDatabase>>;
  let jwks: Server;
  let app: NestNodeApplication;

  beforeAll(async () => {
    jwks = await issuer.listen(Number(new URL(process.env.OIDC_JWKS_URL!).port));
    fixtures = await resetDatabase(pool);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDrizzleToken())
      .useValue(fixtures.db)
      .compile();
    app = moduleRef.createNestApplication<NestNodeApplication>(new NodeAdapter());
    // Listening, for the tests over HTTP; the in-memory client needs no socket.
    await app.listen(PORT, '127.0.0.1');
  });

  afterAll(async () => {
    await app.close(); // closes the pool too
    jwks.close();
  });

  /** An in-memory MCP client, signed in as an agent of `team` with `scope`. */
  async function as<T>(claims: DevTokenClaims, run: (client: Client) => Promise<T>): Promise<T> {
    const client = await connectMcpClient(app, { token: issuer.sign(claims) });
    try {
      return await run(client);
    } finally {
      await client.close();
    }
  }
  const billing = { username: 'ada', team: 'billing' };
  const textOf = (result: { content?: unknown }) => (result.content as { text: string }[])[0].text;

  it('lists the tools, with the search marked read-only', async () => {
    const { tools } = await as(billing, (client) => client.listTools());
    expect(tools.map((tool) => [tool.name, tool.annotations?.readOnlyHint])).toEqual([
      ['search-tickets', true],
      ['reply-to-ticket', undefined],
    ]);
  });

  it("finds only the agent's own team's tickets", async () => {
    const found = await as(billing, (client) => client.callTool({ name: 'search-tickets', arguments: {} }));
    expect(JSON.parse(textOf(found)).map((ticket: { id: number }) => ticket.id)).toEqual([fixtures.billingTicket]);
  });

  it("never reads or changes another team's ticket", async () => {
    const other = fixtures.shippingTicket;
    await as(billing, async (client) => {
      await expect(client.readResource({ uri: `tickets://${other}` })).rejects.toThrow(`Resource not found: tickets://${other}`);
      await expect(
        client.getPrompt({ name: 'draft-reply', arguments: { ticketId: String(other) } }),
      ).rejects.toThrow(`Ticket ${other} not found`);
      const reply = await client.callTool({
        name: 'reply-to-ticket',
        arguments: { ticketId: other, message: 'Hello from billing', status: 'solved' },
      });
      expect(reply).toMatchObject({ isError: true, content: [{ type: 'text', text: `Ticket ${other} not found` }] });
    });
    const [ticket] = await fixtures.db.select().from(tickets).where(eq(tickets.id, other));
    expect(ticket.status).toBe('open');
    expect(await fixtures.db.$count(replies, eq(replies.ticketId, other))).toBe(0);
  });

  it('replies, sets the status, and shows the reply in the ticket', async () => {
    const id = fixtures.billingTicket;
    await as(billing, async (client) => {
      const reply = await client.callTool({
        name: 'reply-to-ticket',
        arguments: { ticketId: id, message: 'Refunded the second charge.', status: 'solved' },
      });
      expect(reply.structuredContent).toEqual({ ticketId: id, replyId: expect.any(Number), status: 'solved' });

      const { contents } = await client.readResource({ uri: `tickets://${id}` });
      const ticket = JSON.parse((contents[0] as { text: string }).text);
      expect(ticket).toMatchObject({ id, status: 'solved', replies: [{ author: 'ada', body: 'Refunded the second charge.' }] });
    });
  });

  it('asks for tickets:write before a reply, and changes nothing without it', async () => {
    const id = fixtures.billingTicket;
    const before = await fixtures.db.$count(replies, eq(replies.ticketId, id));
    await as({ ...billing, scope: 'tickets:read' }, async (client) => {
      const search = await client.callTool({ name: 'search-tickets', arguments: { text: 'charged' } });
      expect(search.isError).toBeFalsy();
      const error = await client
        .callTool({ name: 'reply-to-ticket', arguments: { ticketId: id, message: 'Hi' } })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(InsufficientScopeError);
      expect(error).toMatchObject({ requiredScope: 'tickets:write' });
    });
    expect(await fixtures.db.$count(replies, eq(replies.ticketId, id))).toBe(before);
  });

  it('tells the model what is wrong with its arguments', async () => {
    await as(billing, async (client) => {
      for (const args of [{ ticketId: '1001', message: 'Hi' }, { ticketId: 2 ** 31, message: 'Hi' }, { ticketId: 1001, message: ' ' }]) {
        const result = await client.callTool({ name: 'reply-to-ticket', arguments: args });
        expect(result.isError).toBe(true);
        expect(textOf(result)).toMatch(/^Input validation error/);
      }
    });
  });

  describe('over HTTP', () => {
    const endpoint = `http://127.0.0.1:${PORT}/mcp`;
    const listTools = (headers: Record<string, string> = {}) =>
      fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      });

    it('challenges a request without a token, pointing at the metadata', async () => {
      const response = await listTools();
      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toContain(
        'resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource/mcp"',
      );
      const metadata = await fetch(`http://127.0.0.1:${PORT}/.well-known/oauth-protected-resource/mcp`);
      expect(await metadata.json()).toMatchObject({
        resource: 'http://localhost:3000/mcp',
        authorization_servers: ['https://idp.test'],
        scopes_supported: ['tickets:read', 'tickets:write'],
      });
    });

    it('refuses tokens for another audience, expired, wrongly signed or of another type with 401', async () => {
      const impostor = new DevIssuer(issuer.issuer, issuer.audience); // same kid, another key
      const tokens = {
        'another audience': issuer.sign(billing, { audience: 'https://other-api.example/mcp' }),
        'another issuer': issuer.sign(billing, { issuer: 'https://evil.example' }),
        expired: issuer.sign(billing, { now: () => Date.now() - 2 * 60 * 60 * 1000 }),
        'wrongly signed': impostor.sign(billing),
        'an ID token': issuer.sign(billing, { type: 'JWT' }),
      };
      for (const [reason, token] of Object.entries(tokens)) {
        const response = await listTools({ authorization: `Bearer ${token}` });
        expect(response.status, reason).toBe(401);
        expect(response.headers.get('www-authenticate'), reason).toContain('error="invalid_token"');
      }
      expect((await listTools({ authorization: `Bearer ${issuer.sign(billing)}` })).status).toBe(200);
    });

    it('refuses a page from another site, and a Host it does not answer to', async () => {
      const token = issuer.sign(billing);
      expect((await listTools({ authorization: `Bearer ${token}`, origin: 'https://elsewhere.example' })).status).toBe(403);
      // fetch() sets Host itself, so this one goes through node:http.
      const status = await new Promise<number>((resolve, reject) => {
        const req = httpRequest(endpoint, {
          method: 'POST',
          headers: {
            host: 'attacker.example:3000',
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
          },
        });
        req.on('response', (res) => resolve(res.statusCode!)).on('error', reject);
        req.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
      });
      expect(status).toBe(403);
    });

    it('serves the SDK client with a bearer token', async () => {
      const client = new Client({ name: 'helpdesk-e2e', version: '1.0.0' });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(endpoint), {
          requestInit: { headers: { authorization: `Bearer ${issuer.sign(billing)}` } },
        }),
      );
      try {
        const result = await client.callTool({ name: 'search-tickets', arguments: { text: 'charged' } });
        expect(JSON.parse(textOf(result))).toMatchObject([{ id: fixtures.billingTicket }]);
      } finally {
        await client.close();
      }
    });
  });
});

```

第二个文件像桌面客户端一样启动构建的 `stdio.js`，然后再次以原始读取 stdout 的方式启动：SDK 的客户端会跳过非 JSON 的 stdout 行，因此只有原始读取显示没有其他内容，只有 Nest 或 Observe 的日志行到达它：

```typescript title="test/stdio.e2e-spec.ts"
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { Pool } from 'pg';
import { resetDatabase } from './fixtures.js';

const url = process.env.TEST_DATABASE_URL;
const stdioJs = fileURLToPath(new URL('../dist/stdio.js', import.meta.url));

describe.skipIf(!url)('stdio entry point (e2e)', () => {
  it('serves the tools to a client that launches it, for the team in its environment', async () => {
    const pool = new Pool({ connectionString: url });
    const { billingTicket } = await resetDatabase(pool);
    await pool.end();

    // What a desktop client runs: node, the built stdio.js, and the env of its configuration.
    // The rest of the configuration comes from the project's .env; DATABASE_URL points at the test database.
    const client = new Client({ name: 'stdio-e2e', version: '1.0.0' });
    await client.connect(
      new StdioClientTransport({ command: 'node', args: [stdioJs], env: { HELPDESK_TEAM: 'billing', DATABASE_URL: url! } }),
    );
    try {
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual(['search-tickets', 'reply-to-ticket']);
      const found = await client.callTool({ name: 'search-tickets', arguments: {} });
      const ids = JSON.parse((found.content as { text: string }[])[0].text).map((ticket: { id: number }) => ticket.id);
      expect(ids).toEqual([billingTicket]);
    } finally {
      await client.close();
    }
  });

  it('writes nothing but protocol messages to stdout, from start to exit', async () => {
    // The SDK's client skips stdout lines that aren't JSON; other clients don't. So read stdout raw.
    const server = spawn('node', [stdioJs], { env: { ...process.env, HELPDESK_TEAM: 'billing', DATABASE_URL: url } });
    let stdout = '';
    let stderr = '';
    server.stderr.on('data', (chunk) => (stderr += chunk));
    server.stdout.on('data', (chunk) => {
      stdout += chunk;
      // The answer is in: close stdin, as a client does when it quits.
      if (stdout.includes('\n')) server.stdin.end();
    });
    const initialize = { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'raw', version: '1.0.0' } };
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: initialize })}\n`);
    await new Promise((resolve) => server.on('exit', resolve));

    expect(stdout.trim().split('\n').map((line) => JSON.parse(line).id)).toEqual([1]);
    // The logs went to stderr, Observe's warning about its missing key pair included.
    expect(stderr).toContain('Starting Nest application');
    expect(stderr).toContain('Observe is installed but sends nothing');
  });
});

```

仅创建一次测试数据库，然后运行这两个文件。脚本首先构建，用于 stdio 测试：

```bash
$ docker exec helpdesk-db psql -U postgres -c "CREATE DATABASE helpdesk_test"
$ TEST_DATABASE_URL=postgres://postgres:helpdesk@localhost:5432/helpdesk_test npm run test:e2e
...
 Test Files  2 passed (2)
      Tests  12 passed (12)

```

当移除代码时，每个保证都会失败其测试：`tickets:write` 范围、`search()`、`findOne()` 和 `reply()` 中的团队条件、`max()` 在 `ticketId` 上的检查、受众和 `type` 检查（使用 `audience: false`）、`allowedHosts`、`Origin` 检查（使用 `allowedOrigins: false`）以及 `McpStdioLogger`（Nest 的启动日志会出现在 stdout）。过期和签名错误的令牌会被 `JwtVerifier` 本身拒绝。

#### 生产检查清单

- **将配置指向您的身份提供者**，其中 `MCP_RESOURCE` 是服务器的公共 `https` URL。切勿部署开发颁发者或类似令牌端点。
- **将 `MCP_ALLOWED_HOSTS`** 设置为客户端访问服务器的主机名，例如 `helpdesk.example.com`。
- **列出基于浏览器的客户端（如果有）**，在 `http.allowedOrigins` 和 CORS 中：默认情况下，只有 localhost 上的页面才能通过。
- **提高 body parser 的限制**，如果工具参数可能超过 Node 适配器的 100 KB：`app.useBodyParser()` 接受一个 `limit`。
- **将 `drizzle-kit migrate` 作为发布步骤运行**，切勿运行种子脚本：它会清空表。
- **保持访问令牌的短期有效性。** 服务器在令牌过期前接受令牌，而无需询问提供者；您禁用的用户会一直保持访问权限直到那时。
- **保持描述的真实性。** 模型仅通过名称、描述和模式了解工具，而 `readOnlyHint` 决定运行哪些调用而无需询问用户。
- **为生产环境提供自己的 Observe 密钥对**，来自项目的 **API 密钥** 页面，在平台的环境中为 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET`：`start:prod` 不加载 `.env`。然后每个 MCP 调用都会在其操作下记录，使用 `tools/call search-tickets` 或带有模板的 `resources/read`，而不是 `POST /mcp`（参见 [NestJS Observe](/mcp/transports#nestjs-observe)），并且 `enableShutdownHooks()` 允许 SDK 在部署的 `SIGTERM` 上发送其最后批次。

#### 下一步

- 让策略决定每次调用，如 [Authorization](/mcp/primitives#authorization) 所述，使用来自 `@nestjs/authorization` 的 `@Can()`。
- 在工具调用内部请求用户确认回复，使用 `inputRequired()`：参见 [The call context](/mcp/primitives#the-call-context)。
- 报告长工具的进度，并在客户端取消时停止：[The call context](/mcp/primitives#the-call-context)。
- 将 MCP 服务器添加到现有 API：[MCP overview](/mcp/overview) 为订单 API 构建了一个。
- 构建带有登录和每记录权限的帮助台 API 端：[Build a REST API with JWT authentication](/tutorials/rest-api-jwt-authentication) 和 [project-management tutorial](/tutorials/project-management-api)。