<!-- 此文件从 content/tutorials/realtime-chat.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:55:27.002Z -->
<!-- 源文件: content/tutorials/realtime-chat.md -->
<!-- 源哈希: a53e4e963fb641735479f6262704f6fc -->

### 构建 Node.js 实时聊天后端

使用 NestJS 和 Socket.IO 在 Node.js 中构建一个实时聊天后端：经过认证的 WebSocket、房间、PostgreSQL 中的消息历史和在线状态。

该聊天具有包含成员的房间、通过 WebSocket 实时到达并存储在 PostgreSQL 中的消息、客户端通过 REST 页面浏览的历史记录，以及在线状态和输入指示器。一个聊天后端看起来很简单，直到你问到边缘情况：一个用户离开一个仍打开标签页的房间、一次广播的消息在重启后丢失、连接中途过期的令牌、每秒发送一千条消息的客户端。本教程专注于这些问题。

到最后，API 将：

- 接受使用与 REST 路由相同的访问令牌签入的 [Socket.IO](https://socket.io/) 连接，并在令牌过期时关闭每个连接。
- 在广播消息之前将每条消息存储到 PostgreSQL，并在存储消息的同一语句中检查发送者是否是房间的成员。
- 使用 Zod 模式验证客户端发送的每条消息，并以客户端可操作的状态码回答拒绝。
- 通过 REST 以分页方式提供房间历史记录，使用键集分页。
- 显示谁打开了某个房间，以及谁正在输入。
- 限制每个用户发送消息的速度。
- 使用真实的 Socket.IO 客户端和监听服务器进行端到端测试来证明所有这些功能。

它从 [Build a REST API with JWT authentication](/tutorials/rest-api-jwt-authentication) 的 API 开始，该 API 使用访问和刷新令牌签入用户，使用 Zod 验证请求，并通过 Drizzle 将数据保存在 PostgreSQL 中。本教程不再解释这些部分。

以下是端点和 WebSocket 事件，以及添加每个事件的章节：

| 端点或事件 | 章节 |
| --- | --- |
| `POST /auth/sign-up`, `POST /auth/token`, `POST /auth/token/refresh`, `POST /auth/token/revoke`, `GET /me`, `GET /health/live`, `GET /health/ready` | [Start from the JWT API](/tutorials/realtime-chat#start-from-the-jwt-api) |
| `POST /rooms`, `GET /rooms`, `POST /rooms/:id/members`, `DELETE /rooms/:id/members/me`, `GET /rooms/:id/messages` | [Expose rooms and history over REST](/tutorials/realtime-chat#expose-rooms-and-history-over-rest) |
| `join`, `leave`, `message` 和 `typing` 事件（由客户端发送）；`message`, `presence`, `typing` 和 `exception` 事件（由服务器发送） | [Add the WebSocket gateway](/tutorials/realtime-chat#add-the-websocket-gateway) |

> info **提示** 完成的应用在 GitHub 上是 [nestjs/example-realtime-chat](https://github.com/nestjs/example-realtime-chat)，其中包含其测试和 CI 工作流。

#### 从 JWT API 开始

创建项目，并安装本教程使用的所有内容。这些是 JWT 教程的包，加上带有 Socket.IO 平台的 [`@nestjs/websockets`](/websockets/gateways)，以及用于测试的 `socket.io-client`：

```bash
$ npm i -g @nestjs/cli
$ nest new chat-api --minimal
$ cd chat-api
$ npm uninstall @nestjs/platform-express @types/express
$ npm i --save @nestjs/platform-node zod @nestjs/config @nestjs/drizzle drizzle-orm@rc pg @nestjs/authentication @nestjs/throttler @nestjs/swagger @nestjs/terminus @nestjs/websockets @nestjs/platform-socket.io socket.io
$ npm i --save-dev drizzle-kit@rc @types/pg @nestjs/testing vitest vite @electric-sql/pglite socket.io-client

```

然后从 [finished JWT tutorial](/tutorials/rest-api-jwt-authentication#sign-users-in-with-jwts) 复制这些文件，保持原样：

- `src/config.ts`, `src/main.ts`, `drizzle.config.ts` 和 `vitest.config.e2e.ts`
- `src/auth/`, `src/users/` 和 `src/health/` 下的所有内容
- `test/refresh-token.store.e2e-spec.ts`

排除 `src/notes/` 和 JWT 教程的 `drizzle/` 文件夹：该应用程序的第一个迁移来自其自身的模式，见下一节。将笔记重命名为聊天中的名称：`JwtAuth` 中的 `realm`（`'chat'`）以及 `main.ts` 中 OpenAPI 文档的标题。将测试脚本添加到 `package.json`：

```json
"test:e2e": "vitest run --config ./vitest.config.e2e.ts"

```

最后，像 JWT 教程中那样，在 `.env` 中添加数据库 URL 和一个 `JWT_SECRET`，但使用聊天自己的数据库：

```bash
$ docker run -d --name chat-db -e POSTGRES_PASSWORD=chat -e POSTGRES_DB=chat -p 5432:5432 postgres:17

```

其 URL 放在 `.env` 中，紧邻签名密钥：

```bash
DATABASE_URL=postgres://postgres:chat@localhost:5432/chat
# Generate with: openssl rand -base64 32
JWT_SECRET=

```

#### 设计模式

整个模式在一个文件中。用户和刷新令牌是 JWT 教程的：

```typescript title="src/database/schema.ts"
import { bigint, boolean, index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: at('created_at').notNull().defaultNow(),
});

export const rooms = pgTable('rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: at('created_at').notNull().defaultNow(),
});

export const roomMembers = pgTable(
  'room_members',
  {
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: at('joined_at').notNull().defaultNow(),
  },
  (table) => [
    // Leads with the room: "is this user a member of this room?" is one index lookup.
    primaryKey({ columns: [table.roomId, table.userId] }),
    // For "the rooms of this user".
    index('room_members_user_id_idx').on(table.userId),
  ],
);

export const messages = pgTable(
  'messages',
  {
    // From a sequence, not a UUID: ids grow with time, so "before id X" is a page of history.
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  // Serves the history query: one room's messages, newest first, from any id.
  (table) => [index('messages_room_id_id_idx').on(table.roomId, table.id)],
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

export type Room = typeof rooms.$inferSelect;
export type Message = typeof messages.$inferSelect;

```

- **房间的成员是一个表，以房间和用户为键。** 每条消息都会检查它，因此检查是主键上的一次查找，该主键以房间开头。第二个索引用于“此用户的所有房间”。
- **消息 ID 来自一个序列**，而不是 `gen_random_uuid()`。它们随着消息的存储而增长，因此“ID 早于 120 的消息”是一个明确定义的页面，按 ID 排序就是按数据库存储的顺序排序。UUID 不会以这种方式排序。
- **`(room_id, id)` 是一起索引的。** 历史记录查询从给定 ID 向下读取一个房间的消息，这是对该索引的扫描，无论房间历史记录增长多长。

生成迁移并应用它（参见 [Migrations](https://docs.nestjs.com/data/drizzle#迁移)）：

```bash
$ npx drizzle-kit generate --name=chat
$ npx drizzle-kit migrate

```

#### 管理房间和成员

客户端通过 REST 和 Socket 发送的所有内容的模式：

```typescript title="src/chat/chat.schemas.ts"
import { z } from 'zod';

// Over REST

export const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type CreateRoomDto = z.infer<typeof createRoomSchema>;

export const addMemberSchema = z.object({
  email: z.email(),
});
export type AddMemberDto = z.infer<typeof addMemberSchema>;

export const historyQuerySchema = z.object({
  // The oldest message id the client has; omit it for the newest page.
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type HistoryQuery = z.infer<typeof historyQuerySchema>;

// Over the socket

export const roomRefSchema = z.object({
  roomId: z.uuid(),
});
export type RoomRef = z.infer<typeof roomRefSchema>;

export const sendMessageSchema = z.object({
  roomId: z.uuid(),
  body: z.string().trim().min(1).max(4_000),
});
export type SendMessageDto = z.infer<typeof sendMessageSchema>;

```

房间的任何成员都可以通过电子邮件将其他用户添加到房间中，任何成员都可以离开。该服务将签入用户的 ID 作为第一个参数，就像 JWT 教程的笔记服务所做的那样：

```typescript title="src/chat/rooms.service.ts"
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { roomMembers, rooms, users, type Room } from '../database/schema.js';

@Injectable()
export class RoomsService {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  /** Creates a room with its creator as the first member. */
  create(userId: string, name: string): Promise<Room> {
    return this.db.transaction(async (tx) => {
      const [room] = await tx.insert(rooms).values({ name }).returning();
      await tx.insert(roomMembers).values({ roomId: room.id, userId });
      return room;
    });
  }

  findMine(userId: string): Promise<Room[]> {
    return this.db
      .select({ id: rooms.id, name: rooms.name, createdAt: rooms.createdAt })
      .from(rooms)
      .innerJoin(roomMembers, eq(roomMembers.roomId, rooms.id))
      .where(eq(roomMembers.userId, userId))
      .orderBy(asc(rooms.name), asc(rooms.id));
  }

  /** A member adds another user, by email. Adding a member twice changes nothing. */
  async addMember(userId: string, roomId: string, email: string): Promise<void> {
    // One statement: the caller must be a member, and the user must exist.
    const added = await this.db
      .insert(roomMembers)
      .select((qb) =>
        qb
          .select({ roomId: roomMembers.roomId, userId: users.id })
          .from(roomMembers)
          .innerJoin(users, eq(users.email, normalize(email)))
          .where(this.membership(userId, roomId)),
      )
      .onConflictDoNothing()
      .returning({ userId: roomMembers.userId });
    if (added.length === 0) {
      // Not added: find out why, for the status code.
      await this.assertMember(userId, roomId);
      const [user] = await this.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, normalize(email)));
      if (!user) {
        throw new NotFoundException('User not found');
      }
      // Otherwise, they were a member already.
    }
  }

  async leave(userId: string, roomId: string): Promise<void> {
    const left = await this.db
      .delete(roomMembers)
      .where(this.membership(userId, roomId))
      .returning({ userId: roomMembers.userId });
    if (left.length === 0) {
      notFound();
    }
  }

  /** 404 unless the user is a member: other people's rooms are as missing as rooms that don't exist. */
  async assertMember(userId: string, roomId: string): Promise<void> {
    const [member] = await this.db
      .select({ one: sql`1` })
      .from(roomMembers)
      .where(this.membership(userId, roomId));
    if (!member) {
      notFound();
    }
  }

  private membership(userId: string, roomId: string) {
    return and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId));
  }
}

function notFound(): never {
  throw new NotFoundException('Room not found');
}

const normalize = (email: string) => email.trim().normalize('NFC').toLowerCase();

```

- **添加成员是一次 `INSERT ... SELECT`。** 它插入的行来自调用者自身的成员资格，与电子邮件命名的用户进行连接。当调用者不是成员或不存在该用户时，`SELECT` 不会找到任何内容，因此不会插入任何内容，这样在检查和写入之间就不会有答案可能改变的时刻。`ON CONFLICT DO NOTHING` 使重复添加某人成为一个无操作（no-op）而不是 500 错误。
- **只有失败的插入才需要第二次查询。** 当没有插入任何内容时，`addMember()` 再次查询以选择状态码：如果调用者不在房间内则为 404，如果电子邮件未知则为 404，如果用户已经是成员则为 204。
- **别人的房间是 404**，与不存在的房间返回相同的答案，因此不会泄露房间 ID。
- **离开是一个带有成员资格在其 `WHERE` 子句中的 `DELETE`**，其结果指示是否存在需要结束的成员资格。

#### 存储和分页消息

消息通过其自己的**服务**。发布时会检查成员资格，存储时也是相同的声明：

```typescript title="src/chat/messages.service.ts"
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { messages, roomMembers, type Message } from '../database/schema.js';
import type { HistoryQuery } from './chat.schemas.js';
import { RoomsService } from './rooms.service.js';

export interface MessagePage {
  /** Newest first. */
  messages: Message[];
  /** Pass as `before` for the next, older page; `null` on the oldest page. */
  nextBefore: number | null;
}

@Injectable()
export class MessagesService {
  constructor(
    @InjectDrizzle() private readonly db: NodePgDatabase,
    private readonly roomsService: RoomsService,
  ) {}

  /** Stores a message, if its author is a member of the room. */
  async post(authorId: string, roomId: string, body: string): Promise<Message> {
    // The membership row is the source of the insert: a non-member's message,
    // or one sent the moment its author left, inserts nothing.
    const [message] = await this.db
      .insert(messages)
      .select((qb) =>
        qb
          .select({ roomId: roomMembers.roomId, authorId: roomMembers.userId, body: sql<string>`${body}`.as('body') })
          .from(roomMembers)
          .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, authorId))),
      )
      .returning();
    if (!message) {
      throw new NotFoundException('Room not found');
    }
    return message;
  }

  /** A page of a room's history, older than `before`. */
  async history(userId: string, roomId: string, { before, limit }: HistoryQuery): Promise<MessagePage> {
    await this.roomsService.assertMember(userId, roomId);
    const rows = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.roomId, roomId), before ? lt(messages.id, before) : undefined))
      .orderBy(desc(messages.id))
      // One more than asked for: whether it comes back says if there's an older page.
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    return { messages: page, nextBefore: rows.length > limit ? page[page.length - 1].id : null };
  }
}

```

- **成员资格行是插入的来源。** `INSERT INTO messages ... SELECT ... FROM room_members WHERE room_id = $1 AND user_id = $2` 为每位成员插入一行，为其他人不插入。如果用户在消息途中离开房间，则在 `DELETE` 提交之前发布，或者不插入任何内容：没有刚刚通过但现在已过时的检查。
- **历史记录是键集分页。** `WHERE room_id = $1 AND id < $before ORDER BY id DESC LIMIT n` 从客户端已有的最旧消息开始，然后沿着 `(room_id, id)` 索引进行遍历。`OFFSET` 会先读取并丢弃所有更新的消息，每次有人发布时，滚动回退时都会偏移一位。
- **它请求比页面多一行。** 是否返回该行决定了是否存在更早的页面，因此 `nextBefore` 在最后一页上是 `null`，而不是指向一个空页面。
- **读取历史记录首先检查成员资格**，作为一个单独的**查询**。这是一个读取操作：在检查和**查询**之间没有可以撤销的写入。

#### 添加 WebSocket **网关**

一个 [gateway](/websockets/gateways) 处理客户端通过套接字发送的消息。本教程使用 Socket.IO，通过 `@nestjs/platform-socket.io`，而不是 `ws` **库**：

- **访问令牌在握手中传递。** 浏览器不能在 WebSocket 连接上设置 `Authorization` **装饰器**。Socket.IO 客户端在握手的 `auth` **请求**负载中发送令牌，而 `JwtBearerProvider` 从那里读取它，因此**网关**使用与 REST 路由相同的令牌和相同的 `JwtAuth` **提供者**进行用户登录。
- **房间是构建好的。** Socket.IO 为每个房间维护一组套接字，并向其中一个广播，这正是聊天室所需要的。
- **确认是构建好的。** 发送消息的客户端会收到服务器对该消息的答复，这里是带有其 id 的已存储消息。
- **它通过适配器进行扩展**，如 [Run more than one instance](/tutorials/realtime-chat#run-more-than-one-instance) 所述。

安装了 `@nestjs/platform-socket.io` 后，Nest 在 HTTP 服务器的端口上，在 `/socket.io/` 下，使用 Node 适配器为 Socket.IO 提供服务。`main.ts` 中没有任何变化。

谁打开了房间会保存在内存中，按套接字划分，因此用户打开两个标签页时，关闭第二个标签页时会离线：

```typescript title="src/chat/presence.service.ts"
import { Injectable } from '@nestjs/common';

/** Who has each room open, on this instance: room id, then socket id, then user id. */
@Injectable()
export class PresenceService {
  private readonly rooms = new Map<string, Map<string, string>>();

  /** Whether this is the user's first socket in the room. */
  add(roomId: string, socketId: string, userId: string): boolean {
    const sockets = this.rooms.get(roomId) ?? new Map<string, string>();
    this.rooms.set(roomId, sockets);
    const first = !this.has(sockets, userId);
    sockets.set(socketId, userId);
    return first;
  }

  /** Removes one socket. Returns its user if that was their last socket in the room. */
  remove(roomId: string, socketId: string): string | undefined {
    const sockets = this.rooms.get(roomId);
    const userId = sockets?.get(socketId);
    if (!sockets || !userId) {
      return undefined;
    }
    sockets.delete(socketId);
    this.prune(roomId, sockets);
    return this.has(sockets, userId) ? undefined : userId;
  }

  /** Removes every socket of a user. Returns whether they had one. */
  removeUser(roomId: string, userId: string): boolean {
    const sockets = this.rooms.get(roomId);
    if (!sockets || !this.has(sockets, userId)) {
      return false;
    }
    for (const [socketId, user] of sockets) {
      if (user === userId) {
        sockets.delete(socketId);
      }
    }
    this.prune(roomId, sockets);
    return true;
  }

  online(roomId: string): string[] {
    return [...new Set(this.rooms.get(roomId)?.values())];
  }

  private has(sockets: Map<string, string>, userId: string): boolean {
    return [...sockets.values()].includes(userId);
  }

  private prune(roomId: string, sockets: Map<string, string>) {
    if (sockets.size === 0) {
      this.rooms.delete(roomId);
    }
  }
}

```

**网关**：

```typescript title="src/chat/chat.gateway.ts"
import { UseFilters } from '@nestjs/common';
import { CurrentUser, WsAuthenticator, type JwtClaims } from '@nestjs/authentication';
import { Throttle, seconds } from '@nestjs/throttler';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { User } from '../users/user.js';
import { ChatExceptionFilter } from './chat-exception.filter.js';
import { roomRefSchema, sendMessageSchema, type RoomRef, type SendMessageDto } from './chat.schemas.js';
import { MessagesService } from './messages.service.js';
import { PresenceService } from './presence.service.js';
import { RoomsService } from './rooms.service.js';

/** The socket.io room of a chat room: its open sockets, which receive its messages. */
const roomChannel = (roomId: string) => `room:${roomId}`;
/** Every socket of one user, on every instance. */
const userChannel = (userId: string) => `user:${userId}`;

@UseFilters(new ChatExceptionFilter())
@WebSocketGateway()
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  private readonly server: Server;

  constructor(
    private readonly wsAuthenticator: WsAuthenticator,
    private readonly roomsService: RoomsService,
    private readonly messagesService: MessagesService,
    private readonly presence: PresenceService,
  ) {}

  async handleConnection(client: Socket) {
    // Registered first: socket.io empties `client.rooms` before "disconnect".
    client.on('disconnecting', () => this.closeRooms(client));
    // Closes the connection (and returns null) unless the handshake carries a valid access token.
    const auth = await this.wsAuthenticator.authenticateConnection(client);
    if (!auth) {
      return;
    }
    const { id } = auth.user as User;
    client.data.userId = id;
    await client.join(userChannel(id));
    // A connection lasts as long as its access token. The client then
    // reconnects with a fresh one, as it would send one with a request.
    const { exp } = auth.session as JwtClaims;
    if (exp) {
      const expiry = setTimeout(() => client.disconnect(true), exp * 1000 - Date.now());
      client.on('disconnect', () => clearTimeout(expiry));
    }
  }

  /** Opens a room: the socket receives its messages, typing and presence. */
  @SubscribeMessage('join')
  async join(
    @CurrentUser('id') userId: string,
    @ConnectedSocket() client: Socket,
    @MessageBody({ schema: roomRefSchema }) { roomId }: RoomRef,
  ) {
    await this.roomsService.assertMember(userId, roomId);
    await client.join(roomChannel(roomId));
    if (this.presence.add(roomId, client.id, userId)) {
      client.to(roomChannel(roomId)).emit('presence', { roomId, userId, online: true });
    }
    return { roomId, online: this.presence.online(roomId) };
  }

  /** Closes a room on this socket. The user stays a member. */
  @SubscribeMessage('leave')
  async leave(@ConnectedSocket() client: Socket, @MessageBody({ schema: roomRefSchema }) { roomId }: RoomRef) {
    await client.leave(roomChannel(roomId));
    this.wentAway(roomId, this.presence.remove(roomId, client.id));
    return { roomId };
  }

  @Throttle({ default: { limit: 10, ttl: seconds(10) } })
  @SubscribeMessage('message')
  async message(
    @CurrentUser('id') userId: string,
    @ConnectedSocket() client: Socket,
    @MessageBody({ schema: sendMessageSchema }) { roomId, body }: SendMessageDto,
  ) {
    // Stored first, then broadcast: nobody sees a message that a restart could lose.
    const message = await this.messagesService.post(userId, roomId, body);
    client.to(roomChannel(roomId)).emit('message', message);
    // The acknowledgment: the sender learns the message's id.
    return message;
  }

  @SubscribeMessage('typing')
  typing(
    @CurrentUser('id') userId: string,
    @ConnectedSocket() client: Socket,
    @MessageBody({ schema: roomRefSchema }) { roomId }: RoomRef,
  ) {
    // Only from a socket that opened the room, which checked the membership.
    if (client.rooms.has(roomChannel(roomId))) {
      client.to(roomChannel(roomId)).emit('typing', { roomId, userId });
    }
  }

  /** After a user leaves a room over REST: their open sockets stop receiving it. */
  removeFromRoom(roomId: string, userId: string) {
    this.server.in(userChannel(userId)).socketsLeave(roomChannel(roomId));
    if (this.presence.removeUser(roomId, userId)) {
      this.wentAway(roomId, userId);
    }
  }

  private closeRooms(client: Socket) {
    for (const channel of client.rooms) {
      if (channel.startsWith('room:')) {
        const roomId = channel.slice('room:'.length);
        this.wentAway(roomId, this.presence.remove(roomId, client.id));
      }
    }
  }

  private wentAway(roomId: string, userId: string | undefined) {
    if (userId) {
      this.server.to(roomChannel(roomId)).emit('presence', { roomId, userId, online: false });
    }
  }
}

```

- **握手通过 `WsAuthenticator` 进行**认证。Nest 不在 `handleConnection()` 上运行**守卫**。`authenticateConnection()` 运行与**守卫**相同的凭证**提供者**，并在没有有效访问令牌的情况下断开套接字。参见 [GraphQL and WebSockets](/security/authentication#graphql-and-websockets)。客户端会看到其 `connect` 事件，然后是带有原因 `io server disconnect` 的 `disconnect`。
- **每条消息都会再次进行**认证**。** 全局**认证**守卫**对每个 `@SubscribeMessage()` **控制器**处理程序运行，对每个路由都运行，并且 `@CurrentUser('id')` 读取该消息的用户。Nest 不等待 `handleConnection()` 之后才处理套接字的**请求**消息，因此握手本身不是一个**守卫**：**守卫**才是。
- **连接持续时间取决于其访问令牌。** 令牌在握手时检查了一次，套接字可以保持打开状态数天。当令牌的 `exp` 过期时，计时器会断开它，客户端会使用新的令牌重新连接，如 [Try it](/tutorials/realtime-chat#try-it) 所示。如果没有这个机制，令牌过期的套接字发送每条消息都会收到 401 错误，并且会一直接收房间的消息，直到它保持打开状态。
- **成员资格在每条消息上检查，而不仅仅在 `join` 上。** `join` 在套接字进入房间通道之前检查它，因此只有成员才能接收房间的消息。但客户端可以向任何房间 id 发送一个 `message`，无论是否加入，因此 `post()` 在存储消息的声明中再次检查。
- **先存储消息，后广播。** 如果在这两者之间进程死亡，消息会存在于历史记录中，当客户端重新连接时会找到它。相反的顺序会向房间显示一个重启可能会丢失的消息。
- **发送者收到确认；其他人收到广播。** `client.to(channel)` 会到达房间中的每个套接字，除了发送者之外，包括发送者的其他标签页。两者都携带相同的消息及其 id。
- **输入状态不是存储的，而是中继的。** 输入事件几秒钟后就没有价值了，因此它永远不会到达数据库。它只从已加入房间并通过成员资格检查的套接字中中继。
- **通过 REST 离开会使用户的套接字从房间中清空。** 每个套接字在连接时都会加入其用户的通道，因此 `removeFromRoom()` 可以到达用户的所有套接字，并且通过适配器，在每个实例上。

Nest 的 WebSocket **异常过滤器**只向客户端发送 `WsException` 的消息。其他任何内容都作为“内部服务器错误”发送给客户端：服务为 REST 路由抛出的 `NotFoundException`，以及**管道**的 `BadRequestException`。携带对象的 `WsException`，例如**认证****守卫**的 401，会发送而没有说明其对应消息的 `cause`。**网关**的**过滤器**为每一次拒绝提供相同的形状（参见 [Exception filters](/websockets/exception-filters)）：

```typescript title="src/chat/chat-exception.filter.ts"
import { type ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';

/**
 * Sends each refusal to the client as an "exception" event with its status code, its message,
 * and the event and payload it refuses, so the client can tell which message failed.
 */
@Catch(HttpException, WsException)
export class ChatExceptionFilter extends BaseWsExceptionFilter {
  catch(exception: HttpException | WsException, host: ArgumentsHost) {
    const ws = host.switchToWs();
    const cause = { pattern: ws.getPattern(), data: ws.getData() };
    super.catch(new WsException({ status: 'error', ...bodyOf(exception), cause }), host);
  }
}

function bodyOf(exception: HttpException | WsException): object {
  if (exception instanceof WsException) {
    const error = exception.getError();
    return typeof error === 'string' ? { message: error } : error;
  }
  // The services' exceptions, and the validation pipe's, which the client
  // would otherwise get as "Internal server error".
  const response = exception.getResponse();
  return typeof response === 'string' ? { statusCode: exception.getStatus(), message: response } : response;
}

```

来自 JWT 教程的全局 `StandardSchemaValidationPipe` 针对其 `schema` 验证 `@MessageBody()`，因为它验证了 `@Body()`，因此格式错误的**请求**消息永远不会到达**控制器**处理程序。被拒绝的消息不会收到确认。客户端会收到一个 `exception` 事件，其 `cause` 命名了它拒绝的事件和负载：

```json
{
  "status": "error",
  "message": ["body: Too small: expected string to have >=1 characters"],
  "error": "Bad Request",
  "statusCode": 400,
  "cause": { "pattern": "message", "data": { "roomId": "5122632a-7885-4d6a-a7b8-8f03f54a4a98", "body": "   " } }
}

```

#### 通过 REST 暴露房间和历史记录

创建房间、添加成员和读取历史记录是普通请求，保持在 REST 协议下：它们不需要打开连接，并且保留了 JWT 教程的验证、速率限制和 OpenAPI 文档。

```typescript title="src/chat/rooms.controller.ts"
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { z } from 'zod';
import { ChatGateway } from './chat.gateway.js';
import {
  addMemberSchema,
  createRoomSchema,
  historyQuerySchema,
  type AddMemberDto,
  type CreateRoomDto,
  type HistoryQuery,
} from './chat.schemas.js';
import { MessagesService } from './messages.service.js';
import { RoomsService } from './rooms.service.js';

const roomId = { schema: z.uuid() };

@Controller('rooms')
export class RoomsController {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly messagesService: MessagesService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Post()
  create(@CurrentUser('id') userId: string, @Body({ schema: createRoomSchema }) { name }: CreateRoomDto) {
    return this.roomsService.create(userId, name);
  }

  @Get()
  findMine(@CurrentUser('id') userId: string) {
    return this.roomsService.findMine(userId);
  }

  @Post(':id/members')
  @HttpCode(204)
  addMember(
    @CurrentUser('id') userId: string,
    @Param('id', roomId) id: string,
    @Body({ schema: addMemberSchema }) { email }: AddMemberDto,
  ) {
    return this.roomsService.addMember(userId, id, email);
  }

  @Delete(':id/members/me')
  @HttpCode(204)
  async leave(@CurrentUser('id') userId: string, @Param('id', roomId) id: string) {
    await this.roomsService.leave(userId, id);
    this.chatGateway.removeFromRoom(id, userId);
  }

  @Get(':id/messages')
  history(
    @CurrentUser('id') userId: string,
    @Param('id', roomId) id: string,
    @Query({ schema: historyQuerySchema }) query: HistoryQuery,
  ) {
    return this.messagesService.history(userId, id, query);
  }
}

```

`POST /rooms/:id/members` 和 `DELETE /rooms/:id/members/me` 回答了 `204 No Content`：客户端已经知道发生了什么变化。离开调用**网关**，因此用户的打开的 **Socket** 不会立即停止接收房间，而是在下次重新连接时停止。

```typescript title="src/chat/chat.module.ts"
import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway.js';
import { MessagesService } from './messages.service.js';
import { PresenceService } from './presence.service.js';
import { RoomsController } from './rooms.controller.js';
import { RoomsService } from './rooms.service.js';

@Module({
  controllers: [RoomsController],
  providers: [ChatGateway, RoomsService, MessagesService, PresenceService],
})
export class ChatModule {}

```

#### 速率限制消息

JWT 教程的全局 `ThrottlerGuard` 也适用于**网关**消息，其 `default` **节流**器也是如此。在 WebSocket 上，它计数的“**请求**”是 **Socket**，**Socket** 没有 `ip`，因此每个客户端的消息会共享一个计数器：一个吵闹的用户会阻止所有人。给 `default` **节流**器一个按用户统计**网关**消息的跟踪器。速率限制章节的 [WebSockets](/security/rate-limiting#websockets) 部分使用**守卫**的一个子类来实现这一点；接收 `ExecutionContext` 的 `getTracker` 选项（参见 [Configuration](/security/rate-limiting#配置)）则在没有该跟踪器的情况下实现：

```typescript title="src/chat/throttler-tracker.ts"
import type { ExecutionContext } from '@nestjs/common';
import { normalizeIp } from '@nestjs/throttler';

/**
 * What the throttler counts by. Over WebSockets, `req` is the socket, which has no `ip`:
 * without this, every client's messages would share one counter.
 */
export function tracker(req: Record<string, any>, context: ExecutionContext): string {
  if (context.getType() === 'ws') {
    // The user that the handshake signed in, or the address until it has.
    return req.data.userId ?? normalizeIp(req.handshake.address);
  }
  return normalizeIp(req.ip);
}

```

在握手经过**认证**后，设置 `client.data.userId` 在 `handleConnection()` 中。有了这个跟踪器，每个**网关**事件都会根据每用户每分钟 100 的 `default` 限制进行计数：包括 `join`、`leave` 和 `typing`。`message` 有其更严格的限制，即每 10 秒 10 次，来自其处理程序上的 `@Throttle()`。第 11 条消息会收到一个带有状态码 429 的 `exception` 事件，该**过滤器**会将其与**节流**器的消息一起传递。

根**模块**、聊天**模块**和跟踪器：

```typescript title="src/app.module.ts"
import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthenticationModule } from '@nestjs/authentication';
import { DrizzleModule } from '@nestjs/drizzle';
import { createObserveModule } from '@nestjs/observe';
import { ThrottlerGuard, ThrottlerModule, minutes, normalizeIp } from '@nestjs/throttler';
import { drizzle } from 'drizzle-orm/node-postgres';
import { accountEmail } from './auth/account-email.js';
import { AuthModule } from './auth/auth.module.js';
import { ChatModule } from './chat/chat.module.js';
import { tracker } from './chat/throttler-tracker.js';
import { envSchema, type Env } from './config.js';
import { HealthModule } from './health/health.module.js';
import { UsersModule } from './users/users.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // First, so it shuts down last and still sends what the other modules did.
    ObserveModule.forRoot({
      // Empty until `npx @nestjs/observe link` writes the key pair into .env: the SDK then sends nothing.
      appKey: process.env.OBSERVE_APP_KEY ?? '',
      appSecret: process.env.OBSERVE_APP_SECRET ?? '',
      serviceId: 'chat-api',
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
          issuer: 'chat-api',
          audience: 'chat-api',
          ttl: '15m',
        },
        refreshToken: { ttl: '30d', absoluteTtl: '90d' },
      }),
    }),
    ThrottlerModule.forRoot([
      // Per IP address on every route, and per user on the chat gateway.
      { name: 'default', ttl: minutes(1), limit: 100, getTracker: tracker },
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

#### 运行多个实例

以上所有内容都在一个实例上运行。在负载均衡器后部署多个实例时，每个进程的以下三点就不够了：

- **广播**。`client.to(channel).emit()` 只到达连接到此实例的 **Socket**。[Redis adapter](/websockets/adapter#extend-socketio) 共享广播，并在实例之间进行 `socketsLeave()`，因此 `removeFromRoom()` 会到达用户无论连接在哪里。正如该章节警告的，仅使用 Redis 是不够的：Socket.IO 客户端以 HTTP 长轮询开始，其**请求**必须全部到达同一个实例。要么在负载均衡器上使用粘性会话，要么像本教程的客户端那样使用 `transports: ['websocket']` 连接。
- **在线状态**。`PresenceService` 知道其自身实例的 **Socket**。要显示跨实例的在线用户，请在 Redis 中保留相同的映射，并为每个实例设置过期时间，以便崩溃实例的 **Socket** 消失，或者使用 Socket.IO 的 `fetchSockets()` 向每个实例查询，Redis **提供者**支持此功能。
- **速率限制**。**节流**器在内存中计数，因此每个实例都有自己的计数。使用共享的 [storage](/security/rate-limiting#存储)，例如 Redis。

消息本身不需要任何东西：它们存储在 PostgreSQL 中，每个实例读取相同的历史记录。

#### 试用

Socket.IO 在 WebSocket 上使用自己的协议，因此 curl 无法加入房间。`scripts/` 中的一个小客户端可以。它使用访问令牌连接，加入房间，打印服务器发送的内容，并将您输入的每一行作为消息发送：

```typescript title="scripts/chat.ts"
// A terminal client for trying the chat: TOKEN=<access token> node scripts/chat.ts <room id>
import { createInterface } from 'node:readline';
import { io } from 'socket.io-client';

const roomId = process.argv[2];
const socket = io(process.env.CHAT_URL ?? 'http://localhost:3000', {
  // The access token, which JwtBearerProvider reads from the handshake.
  auth: { token: process.env.TOKEN },
  // Straight to a WebSocket, without long-polling first.
  transports: ['websocket'],
});

const print = (event: string) => (data: unknown) => console.log(event, JSON.stringify(data));

socket.on('connect', () => {
  // Rooms are opened per connection: open it again after every reconnect.
  socket.emit('join', { roomId }, print('joined'));
});
socket.on('message', print('message'));
socket.on('presence', print('presence'));
socket.on('typing', print('typing'));
socket.on('exception', print('exception'));
socket.on('disconnect', print('disconnect'));

// Each line is a message.
for await (const body of createInterface({ input: process.stdin })) {
  socket.emit('typing', { roomId });
  try {
    print('sent')(await socket.timeout(5000).emitWithAck('message', { roomId, body }));
  } catch {
    // Refused: the "exception" event says why.
  }
}
socket.close();

```

Node.js 22.18 及更高版本可以直接运行这样的 TypeScript 文件。启动应用程序：

```bash
$ npm run start

```

注册 Ada 和 Bob，以及不会在房间中的 Eve。Ada 创建一个房间并添加 Bob（令牌、ID 和时间戳在此和下方缩短）：

```bash
$ curl localhost:3000/auth/sign-up --json '{"email":"ada@example.com","password":"correct horse battery"}'
{"accessToken":"eyJhbGciOiJIUzI1NiIs...","refreshToken":"hpJMLcGsMXSATrZ2...","expiresIn":900}
$ ADA=eyJhbGciOiJIUzI1NiIs...
$ BOB=eyJhbGciOiJIUzI1NiIs...
$ EVE=eyJhbGciOiJIUzI1NiIs...
$ curl localhost:3000/rooms -H "Authorization: Bearer $ADA" --json '{"name":"general"}'
{"id":"5122632a-7885-4d6a-a7b8-8f03f54a4a98","name":"general","createdAt":"2026-11-19T22:08:55.613Z"}
$ ROOM=5122632a-7885-4d6a-a7b8-8f03f54a4a98
$ curl -i localhost:3000/rooms/$ROOM/members -H "Authorization: Bearer $ADA" --json '{"email":"bob@example.com"}'
HTTP/1.1 204 No Content
$ curl localhost:3000/rooms -H "Authorization: Bearer $BOB"
[{"id":"5122632a-7885-4d6a-a7b8-8f03f54a4a98","name":"general","createdAt":"2026-11-19T22:08:55.613Z"}]

```

在第二个终端中，Bob 打开房间。在第一个终端中，Ada 也打开它，并输入一条消息，Bob 回复（没有事件名称的行是他们各自输入的）：

Bob 的终端：

```bash
$ TOKEN=$BOB node scripts/chat.ts $ROOM
joined {"roomId":"5122632a-...","online":["7154be3b-..."]}
presence {"roomId":"5122632a-...","userId":"092e1b0b-...","online":true}
typing {"roomId":"5122632a-...","userId":"092e1b0b-..."}
message {"id":1,"roomId":"5122632a-...","authorId":"092e1b0b-...","body":"Hi Bob","createdAt":"2026-11-19T22:08:58.259Z"}
Hi Ada
sent {"id":2,"roomId":"5122632a-...","authorId":"7154be3b-...","body":"Hi Ada","createdAt":"2026-11-19T22:08:59.252Z"}

```

Ada 的终端：

```bash
$ TOKEN=$ADA node scripts/chat.ts $ROOM
joined {"roomId":"5122632a-...","online":["7154be3b-...","092e1b0b-..."]}
Hi Bob
sent {"id":1,"roomId":"5122632a-...","authorId":"092e1b0b-...","body":"Hi Bob","createdAt":"2026-11-19T22:08:58.259Z"}
typing {"roomId":"5122632a-...","userId":"7154be3b-..."}
message {"id":2,"roomId":"5122632a-...","authorId":"7154be3b-...","body":"Hi Ada","createdAt":"2026-11-19T22:08:59.252Z"}

```

每条消息都作为发送者在确认中收到的相同对象到达另一端，包括 ID。

Eve 不是成员。她可以连接，因为她的令牌有效，但她不能打开房间或发布到其中：

```bash
$ TOKEN=$EVE node scripts/chat.ts $ROOM
exception {"status":"error","message":"Room not found","error":"Not Found","statusCode":404,"cause":{"pattern":"join","data":{"roomId":"5122632a-..."}}}
Let me in
exception {"status":"error","message":"Room not found","error":"Not Found","statusCode":404,"cause":{"pattern":"message","data":{"roomId":"5122632a-...","body":"Let me in"}}}

```

历史记录，每页一条消息，最新的在前。`nextBefore` 是下一页的 `before`，`null` 是最后一页的：

```bash
$ curl "localhost:3000/rooms/$ROOM/messages?limit=1" -H "Authorization: Bearer $ADA"
{"messages":[{"id":2,"roomId":"5122632a-...","authorId":"7154be3b-...","body":"Hi Ada","createdAt":"2026-11-19T22:08:59.252Z"}],"nextBefore":2}
$ curl "localhost:3000/rooms/$ROOM/messages?limit=1&before=2" -H "Authorization: Bearer $ADA"
{"messages":[{"id":1,"roomId":"5122632a-...","authorId":"092e1b0b-...","body":"Hi Bob","createdAt":"2026-11-19T22:08:58.259Z"}],"nextBefore":null}
$ curl "localhost:3000/rooms/$ROOM/messages?limit=1" -H "Authorization: Bearer $EVE"
{"message":"Room not found","error":"Not Found","statusCode":404}

```

Bob 通过 REST 离开房间，而他的客户端仍在运行。Ada 的客户端看到他离开，Bob 的下一条消息被存储消息的同一个 `INSERT ... SELECT` 拒绝：

```bash
$ curl -i -X DELETE localhost:3000/rooms/$ROOM/members/me -H "Authorization: Bearer $BOB"
HTTP/1.1 204 No Content

```

在 Ada 的终端中：

```bash
presence {"roomId":"5122632a-...","userId":"7154be3b-...","online":false}

```

在 Bob 的终端中：

```bash
Still here?
exception {"status":"error","message":"Room not found","error":"Not Found","statusCode":404,"cause":{"pattern":"message","data":{"roomId":"5122632a-...","body":"Still here?"}}}

```

真实客户端也会处理连接的结束：当访问令牌过期时，服务器会断开 **Socket**，客户端通过 REST 刷新令牌并重新连接。使用 `auth` 作为函数，Socket.IO 在每次连接尝试前请求令牌：

```typescript
const socket = io('https://chat.example.com', {
  // Called before every connection attempt, so a reconnect sends the current token.
  auth: (send) => send({ token: accessToken }),
  transports: ['websocket'],
});

socket.on('disconnect', async (reason) => {
  // The server ends the connection when its access token expires.
  if (reason === 'io server disconnect') {
    await refreshTokens(); // POST /auth/token/refresh, which sets accessToken
    socket.connect();
  }
});

```

重新连接后，`connect` 处理程序再次运行，并重新打开房间：每个连接加入一个房间，而不是每个用户。消息到达的顺序可能与其 ID 不同，因此客户端按 ID 排序显示它们，并丢弃已有的消息，例如从历史记录中获取然后实时接收的消息。

#### 测试

测试在空闲端口上启动真实应用程序，使用 `app.listen(0)`，并像浏览器那样使用 `socket.io-client` 连接到它。数据库是 PGlite，与 JWT 教程的测试中一样：聊天保证来自单个语句，而不是并发事务的交错方式，因此单个连接可以忠实地测试它。

```typescript title="test/chat.e2e-spec.ts"
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { PasswordHasher } from '@nestjs/authentication';
import { getDrizzleToken } from '@nestjs/drizzle';
import { NodeAdapter, type NestNodeApplication } from '@nestjs/platform-node';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { io, type Socket } from 'socket.io-client';
import { AppModule, ObserveInstrument } from '../src/app.module.js';

describe('Chat (e2e)', () => {
  const pglite = new PGlite(); // PostgreSQL in-process: no server to start
  let app: NestNodeApplication;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    const db = drizzle({ client: pglite });
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
    // Instrumented as in main.ts, so NestJS Observe sees the gateway's handlers.
    const moduleRef = await Test.createTestingModule(
      { imports: [AppModule] },
      { instrument: ObserveInstrument },
    )
      .overrideProvider(getDrizzleToken())
      .useValue(db)
      // scrypt at the default cost takes 128 MiB and a few hundred ms per hash.
      .overrideProvider(PasswordHasher)
      .useValue(new PasswordHasher({ logN: 10 }))
      .compile();
    app = moduleRef.createNestApplication<NestNodeApplication>(new NodeAdapter());
    // A real server on a free port: the sockets connect to it like any client.
    await app.listen(0);
    url = await app.getUrl();
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) {
      socket.disconnect();
    }
  });

  afterAll(async () => {
    await app.close();
    await pglite.close();
  });

  let clients = 0;

  /** Signs a user up, and returns their id, the headers of their requests, and their access token. */
  async function signUp(name: string) {
    const signedUp = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email: `${name}@example.com`, password: 'correct horse battery' },
      // Sign-up is rate-limited per IP address: each user signs up from their own.
      remoteAddress: `10.0.0.${++clients}`,
    });
    const { accessToken } = signedUp.json<{ accessToken: string }>();
    const headers = { authorization: `Bearer ${accessToken}` };
    const { id } = (await app.inject({ method: 'GET', url: '/me', headers })).json<{ id: string }>();
    return { id, headers, accessToken };
  }

  /** A room with its creator and the other users as members. */
  async function createRoom(creator: Awaited<ReturnType<typeof signUp>>, ...members: string[]) {
    const res = await app.inject({
      method: 'POST',
      url: '/rooms',
      headers: creator.headers,
      payload: { name: 'general' },
    });
    const { id } = res.json<{ id: string }>();
    for (const name of members) {
      const added = await app.inject({
        method: 'POST',
        url: `/rooms/${id}/members`,
        headers: creator.headers,
        payload: { email: `${name}@example.com` },
      });
      expect(added.statusCode).toBe(204);
    }
    return id;
  }

  /** An access token like the API's own, that expires within two seconds. */
  function shortLivedToken(sub: string) {
    const now = Math.floor(Date.now() / 1000);
    const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString('base64url');
    const claims = { sub, iss: 'chat-api', aud: 'chat-api', iat: now, exp: now + 2 };
    const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}`;
    return `${unsigned}.${createHmac('sha256', process.env.JWT_SECRET!).update(unsigned).digest('base64url')}`;
  }

  /** A socket.io client, as a browser would open it, with the access token in the handshake. */
  function open(token: string): Socket {
    const socket = io(url, { auth: { token }, transports: ['websocket'] });
    sockets.push(socket);
    return socket;
  }

  function connect(token: string): Promise<Socket> {
    const socket = open(token);
    return new Promise((resolve) => socket.on('connect', () => resolve(socket)));
  }

  /** The next `event` the socket receives. */
  function next<T = any>(socket: Socket, event: string): Promise<T> {
    return new Promise((resolve) => socket.once(event, resolve));
  }

  /** Sends a message and waits for the server's acknowledgment. */
  function send(socket: Socket, event: string, data: unknown) {
    return socket.timeout(2000).emitWithAck(event, data);
  }

  it('disconnects a client without a valid access token', async () => {
    const socket = open('not-a-token');
    expect(await next(socket, 'disconnect')).toBe('io server disconnect');
  });

  it('stores a message, then delivers it to the room', async () => {
    const ada = await signUp('ada');
    const bob = await signUp('bob');
    const roomId = await createRoom(ada, 'bob');
    const adaSocket = await connect(ada.accessToken);
    const bobSocket = await connect(bob.accessToken);
    await send(adaSocket, 'join', { roomId });
    const joined = await send(bobSocket, 'join', { roomId });
    expect(joined.online.sort()).toEqual([ada.id, bob.id].sort());

    const received = next(bobSocket, 'message');
    const ack = await send(adaSocket, 'message', { roomId, body: 'Hi Bob' });

    expect(await received).toEqual(ack);
    expect(ack).toMatchObject({ roomId, authorId: ada.id, body: 'Hi Bob' });
    const history = await app.inject({ method: 'GET', url: `/rooms/${roomId}/messages`, headers: bob.headers });
    expect(history.json().messages).toEqual([ack]);
  });

  it("refuses a non-member's message, and stores nothing", async () => {
    const carol = await signUp('carol');
    const eve = await signUp('eve');
    const roomId = await createRoom(carol);
    const eveSocket = await connect(eve.accessToken);

    const refused = next(eveSocket, 'exception');
    eveSocket.emit('message', { roomId, body: 'Let me in' });

    expect(await refused).toEqual({
      status: 'error',
      statusCode: 404,
      message: 'Room not found',
      error: 'Not Found',
      cause: { pattern: 'message', data: { roomId, body: 'Let me in' } },
    });
    const history = await app.inject({ method: 'GET', url: `/rooms/${roomId}/messages`, headers: carol.headers });
    expect(history.json().messages).toEqual([]);
    expect(
      (await app.inject({ method: 'GET', url: `/rooms/${roomId}/messages`, headers: eve.headers })).statusCode,
    ).toBe(404);
  });

  it('checks the membership on every message, not only on join', async () => {
    const dan = await signUp('dan');
    const fay = await signUp('fay');
    const roomId = await createRoom(dan, 'fay');
    const danSocket = await connect(dan.accessToken);
    const faySocket = await connect(fay.accessToken);
    await send(danSocket, 'join', { roomId });
    const cameOnline = next(danSocket, 'presence');
    await send(faySocket, 'join', { roomId });
    expect(await cameOnline).toEqual({ roomId, userId: fay.id, online: true });

    const wentOffline = next(danSocket, 'presence');
    const left = await app.inject({ method: 'DELETE', url: `/rooms/${roomId}/members/me`, headers: fay.headers });
    expect(left.statusCode).toBe(204);
    expect(await wentOffline).toEqual({ roomId, userId: fay.id, online: false });

    // Fay's socket is still connected, and still names the room.
    const refused = next(faySocket, 'exception');
    faySocket.emit('message', { roomId, body: 'Still here?' });
    expect(await refused).toMatchObject({ statusCode: 404 });

    // And it no longer receives the room's messages.
    const delivered: unknown[] = [];
    faySocket.on('message', (message) => delivered.push(message));
    await send(danSocket, 'message', { roomId, body: 'Bye Fay' });
    await send(faySocket, 'leave', { roomId }); // a round trip on Fay's connection
    expect(delivered).toEqual([]);
  });

  it('disconnects a client when its access token expires', async () => {
    const kim = await signUp('kim');
    const socket = open(shortLivedToken(kim.id));

    await next(socket, 'connect');
    expect(await next(socket, 'disconnect')).toBe('io server disconnect');
  });

  it('validates messages with the Zod schema', async () => {
    const gus = await signUp('gus');
    const roomId = await createRoom(gus);
    const socket = await connect(gus.accessToken);

    const refused = next(socket, 'exception');
    socket.emit('message', { roomId, body: '   ' });

    expect(await refused).toMatchObject({
      statusCode: 400,
      message: ['body: Too small: expected string to have >=1 characters'],
    });
  });

  it('pages through the history, newest first', async () => {
    const hal = await signUp('hal');
    const roomId = await createRoom(hal);
    const socket = await connect(hal.accessToken);
    const sent: number[] = [];
    for (const body of ['one', 'two', 'three', 'four', 'five']) {
      sent.push((await send(socket, 'message', { roomId, body })).id);
    }

    const ids: number[] = [];
    let before: number | null | undefined;
    do {
      const query = before ? `?limit=2&before=${before}` : '?limit=2';
      const page = await app.inject({ method: 'GET', url: `/rooms/${roomId}/messages${query}`, headers: hal.headers });
      const { messages, nextBefore } = page.json<{ messages: { id: number }[]; nextBefore: number | null }>();
      ids.push(...messages.map((message) => message.id));
      before = nextBefore;
    } while (before);

    expect(ids).toEqual(sent.reverse());
  });

  it('limits how fast each user sends messages', async () => {
    const ivy = await signUp('ivy');
    const jon = await signUp('jon');
    const roomId = await createRoom(ivy, 'jon');
    const ivySocket = await connect(ivy.accessToken);
    const jonSocket = await connect(jon.accessToken);

    const refused = next(ivySocket, 'exception');
    for (let i = 1; i <= 11; i++) {
      ivySocket.emit('message', { roomId, body: `Message ${i}` });
    }

    expect(await refused).toMatchObject({ statusCode: 429 });
    // Another user's messages are counted separately.
    expect(await send(jonSocket, 'message', { roomId, body: 'Hello' })).toMatchObject({ body: 'Hello' });
  });
});

```

- `createTestingModule()` 使用 `instrument` 选项（在 `@nestjs/testing` 12.6.3 及更高版本中），就像 `NestFactory.create()` 在 `main.ts` 中所做的那样。没有它，**网关**的处理程序以未插桩的方式运行，NestJS Observe 会为它无法跟踪的每个事件记录一个错误。
- `open()` 在连接之前返回 **Socket**，因此第一个测试从一开始就监听 `disconnect`。服务器拒绝的 **Socket** 可以在 `connect` 上的 `await` 代码运行之前获得其 `disconnect`。
- `send()` 在确认上设置了超时。被拒绝的消息永远不会收到超时，因此如果没有超时，期望收到超时的测试将挂起而不是失败。
- `shortLivedToken()` 以 API 的 `accessToken` 选项的方式签署令牌（HS256，`chat-api` 发行者和受众，测试的 `JWT_SECRET`），该令牌在握手后的两秒内过期。

使用 JWT 教程的刷新令牌存储测试，针对其自己的数据库运行：

```bash
$ docker exec chat-db psql -U postgres -c "CREATE DATABASE chat_test"
$ TEST_DATABASE_URL=postgres://postgres:chat@localhost:5432/chat_test npm run test:e2e

 Test Files  2 passed (2)
      Tests  13 passed (13)

```

使用纯 `insert(messages).values()` 而不是 `INSERT ... SELECT` 存储消息，两个测试失败：非成员的消息被存储和广播，离开用户的消息也被存储。移除节流器的跟踪器，速率限制测试失败：Jon 的第一条消息被拒绝，因为 Ivy 用完了它们共享的计数器。

#### 生产环境检查清单

JWT 教程的 [checklist](/tutorials/rest-api-jwt-authentication#production-checklist) 中的所有内容都适用。特别是对于聊天：

- **提前规划多个实例。** 从 [Run more than one instance](/tutorials/realtime-chat#run-more-than-one-instance) 中提到的 Redis 适配器、共享存在和共享节流器存储，在第二个实例之前添加比之后更容易。
- **预期每次部署时所有客户端都会重新连接。** 关机钩子已启用，因此部署的 `SIGTERM` 会关闭与应用程序的打开连接。客户端看到 `transport close`，而不是 `io server disconnect`，Socket.IO 会自动将它们重新连接到仍在运行的实例，在那里它们会重新打开房间。为这种握手突发流量配置实例大小。
- **自行终止被封禁或已删除用户的连接。** 守卫会拒绝其下一条消息，但打开的 socket 会持续接收其房间的消息，直到其访问令牌过期，最长可达 15 分钟。像 `removeFromRoom()` 清空房间一样，在用户频道中断开 socket 连接。
- **限制单个客户端可以发送的内容。** Zod 模式将消息限制在 4,000 个字符，节流器限制了速率。`IoAdapter` 还限制了同时处理来自单个客户端的消息数量（参见 [Limits](/websockets/adapter#limits)）。
- **如果 Web 应用程序使用长轮询，请允许其源。** WebSocket 连接不受 CORS 限制，但 Socket.IO 的长轮询请求是：如果客户端不使用 `transports: ['websocket']` 连接，请将 Web 应用程序的源作为 `cors` 选项传递给 `@WebSocketGateway()`。
- **保持历史查询在其索引上。** `messages_room_id_id_idx` 为每一页提供服务。任何基于其他内容的历史记录，例如作者或搜索，需要自己的索引或搜索引擎。
- **为生产环境提供自己的 Observe 密钥对**，来自项目**API 密钥**页面，在平台的环境中如 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET` 中，因为 `start:prod` 不加载 `.env`。然后 [NestJS Observe](/observability/overview) 将由 `@SubscribeMessage()` 处理的每条消息报告为一个具有网关类和模式的操作 ID 的请求，使用 `ws` 协议，例如 `ChatGateway:message`。连接和断开连接不会被报告（参见 [WebSocket gateways](/observability/sdk#websocket-gateways)）。

#### 后续步骤

- 在请求外部通知未连接的成员，通过电子邮件或推送：[Mail](/application/mail) 和 [Queues](/techniques/queues)。
- 为房间所有者和版主提供权限，按房间检查权限：[Authorization](/security/authorization)。
- 在实例之间共享广播：[Adapters](/websockets/adapter#extend-socketio)。
- 在生产环境中查看慢速历史页面和被拒绝的消息：[Observability](/observability/overview)。
- 在同一基础上构建电子商务后端：[Build an e-commerce backend](/tutorials/ecommerce-backend)。