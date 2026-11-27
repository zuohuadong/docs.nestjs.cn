<!-- 此文件从 content/tutorials/google-login.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:57:58.952Z -->
<!-- 源文件: content/tutorials/google-login.md -->
<!-- 源哈希: 4f24636516ab46deb58137d1d7b7d94b -->

### 为 Node.js API 添加 Google 登录

使用 NestJS 在 TypeScript 中为 Node.js API 添加“使用 Google 登录”：验证 Google ID 令牌、安全地关联账户并颁发 API 自身的 JWT。

[Build a REST API with JWT authentication](/tutorials/rest-api-jwt-authentication) 的笔记 API 使用密码进行用户登录。本教程添加了 Google 登录：Web 或移动应用从 Google 的登录库获取一个 **ID 令牌**，然后 API 验证该令牌，并返回与密码登录相同的访问令牌和刷新令牌。验证是容易的部分。困难的部分是决定 Google 登录属于哪个账户。

到最后，API 将：

- 使用来自 [`@nestjs/authentication`](/security/authentication) 的 `JwtVerifier` 验证 Google ID 令牌：验证 Google 公布的密钥、签发者、受众和有效期。
- 在首次登录时创建账户，通过 Google 的账户 ID 再次找到该账户，绝不通过其电子邮件。
- 绝不将密码账户提供给使用 Google 登录的用户及其地址，而是让其所有者连接 Google。
- 绝不切断账户的最后一种登录方式。
- 证明，针对 PostgreSQL 和 Google 的模拟器，十次并发的首次登录只会创建一个账户。

本教程添加的端点如下：

| 端点 | 章节 |
| --- | --- |
| `POST /auth/google` | [Sign in with a Google ID token](/tutorials/google-login#sign-in-with-a-google-id-token) |
| `GET /me/identities`, `POST /me/identities/google`, `DELETE /me/identities/google` | [Connect Google to an existing account](/tutorials/google-login#connect-google-to-an-existing-account) |

> info **提示** 完成的应用在 GitHub 上是 [nestjs/example-google-login](https://github.com/nestjs/example-google-login)，其中包含其测试和 CI 工作流。

#### 从笔记 API 开始

本教程延续了 JWT 教程的完成应用，包括笔记：这些是用户登录的凭证。如果您已经构建了它，请继续在该项目及其数据库中工作。否则，使用 JWT 教程的包创建项目：

```bash
$ npm i -g @nestjs/cli
$ nest new notes-api --minimal
$ cd notes-api
$ npm uninstall @nestjs/platform-express @types/express
$ npm i --save @nestjs/platform-node zod @nestjs/config @nestjs/drizzle drizzle-orm@rc pg @nestjs/authentication @nestjs/throttler @nestjs/swagger @nestjs/terminus
$ npm i --save-dev drizzle-kit@rc @types/pg @nestjs/testing vitest vite @electric-sql/pglite

```

然后从 [finished JWT tutorial](/tutorials/rest-api-jwt-authentication) 中获取以下内容，保持原样：

- 所有 `src/`（包括 `src/notes/`）和所有 `test/`
- 包含其两个迁移 `drizzle.config.ts` 和 `vitest.config.e2e.ts` 的 `drizzle/` 文件夹
- `package.json` 中的 `test:e2e` 脚本，以及 `.env` 及其 `DATABASE_URL` 和 `JWT_SECRET`，用于 JWT 教程的 PostgreSQL 容器

保留迁移：本教程会向同一数据库添加第三个迁移。在新数据库上，请先应用它们。如果 `drizzle-kit` 回答该 `snapshot.json`“不是最新版本”，则迁移是由其较旧的候选版本生成的：`drizzle-kit up` 会升级它们。

```bash
$ npx drizzle-kit up
$ npx drizzle-kit migrate

```

#### API 如何工作 Google 登录

Google 的库在客户端执行用户登录：Web 上的 [Google Identity Services](https://developers.google.com/identity/gsi/web/guides/overview)，Android 上的 [Credential Manager](https://developer.android.com/identity/sign-in/credential-manager-siwg)，iOS 上的 Google Sign-In。它们会提供一个 ID 令牌：一个由 Google 签名的 JWT，其中包含 Google 账户（`sub`）、其电子邮件、Google 是否验证了它（`email_verified`）以及签发给的 OAuth 客户端（`aud`）。客户端只发送一次给 API，然后使用 API 的令牌。API 仅获取 Google 的公钥，不需要客户端密钥。

> info **提示** 对于保持用户在会话 Cookie 中的服务器渲染 Web 应用，更适合使用认证章节的 [redirect flow](/security/authentication#add-sign-in-with-google)，其中浏览器会访问 Google 然后返回。它始终通过会话登录，这就是为什么这个携带令牌的 API 不使用它。

#### 设置 Google OAuth 客户端

ID 令牌是签发给您在 [Google Cloud console](https://console.cloud.google.com/) 中的 OAuth 客户端的：

1. 在 **Google Auth Platform** 中，填写 **Branding** 页面：应用的名称、支持电子邮件、主页和隐私政策。
2. 在 **Clients** 页面，创建一个类型为 **Web application** 的客户端。
3. 在 **Authorized JavaScript origins** 下，添加显示按钮的 Web 应用的来源，例如 `https://app.example.com`。对于本地开发，添加 `http://localhost` 和 `http://localhost:5173`，并包含您的 Web 应用端口。按钮在 JavaScript 中回调，因此不需要重定向 URI。
4. 复制以 `.apps.googleusercontent.com` 结尾的客户端 ID。API 不需要密钥。

移动应用在同一项目中获取自己的客户端，如 Google 为每个平台提供的指南所述。Android 的 Credential Manager 会为 **web** 客户端 ID（`setServerClientId()`）请求令牌，因此他们将 Web 客户端命名为其受众。在 Web 客户端旁边列出您的应用令牌签发给的任何其他客户端 ID。

> warning **警告** 本教程是使用模拟的 Google 登录编写和测试的，而非真实的 Google 登录。下面所有的 ID 令牌都是由 Google 的模拟器使用 Google 的声明签名的，如 [tests](/tutorials/google-login#test-it) 所示。控制台步骤遵循撰写时的 Google 文档。验证器也针对 Google 的真实密钥集运行，但拒绝了模拟器的令牌。

客户端 ID 放入 `.env`，逗号分隔：

```bash
# Every OAuth client whose ID tokens the API accepts: the web client, then any mobile ones.
GOOGLE_CLIENT_IDS=1234567890-web.apps.googleusercontent.com

```

配置模式要求至少有一个，因此缺少 ID 会在启动时停止应用程序。Google 密钥的 URL 有默认值，只有测试会更改它：

```typescript title="src/config.ts"
// ...
export const envSchema = z.object({
  // ...
  // The OAuth client IDs whose Google ID tokens the API accepts, comma-separated.
  GOOGLE_CLIENT_IDS: z
    .string()
    .transform((value) => value.split(',').map((id) => id.trim()).filter(Boolean))
    .pipe(z.array(z.string()).min(1)),
  // Google's signing keys. The tests serve their own.
  GOOGLE_JWKS_URL: z.url().default('https://www.googleapis.com/oauth2/v3/certs'),
});
// ...

```

#### 存储身份，而非电子邮件

Google 通过其 `sub` 声明来识别账户，该声明永不重复使用。账户的电子邮件可能会更改，地址稍后可能属于另一个 Google 账户。因此，Google 账户与用户的关联是一个独立的行，由提供者及其账户 ID 作为键。由 Google 创建的用户没有密码：

```typescript title="src/database/schema.ts"
import { boolean, index, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  // Null for an account created by signing in with Google.
  passwordHash: text('password_hash'),
  createdAt: at('created_at').notNull().defaultNow(),
});

// The accounts at other providers that sign a user in, found by the provider's id for them.
export const identities = pgTable(
  'identities',
  {
    provider: text('provider').notNull(),
    // Google's `sub`: stable for the life of the Google account, unlike its email.
    subject: text('subject').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // The address the provider reported, for display only.
    email: text('email'),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (table) => [
    // One user per provider account: two first sign-ins can't create two users.
    primaryKey({ columns: [table.provider, table.subject] }),
    // One account per provider for each user.
    unique('identities_user_id_provider_key').on(table.userId, table.provider),
  ],
);

// ...
export type Note = typeof notes.$inferSelect;
export type Identity = typeof identities.$inferSelect;

```

主键意味着 PostgreSQL 绝不会允许一个 Google 账户登录两个用户，无论代码如何操作。唯一约束确保每个用户最多只有一个 Google 账户，因此 `DELETE /me/identities/google` 命名了一个关联。`identities` 中的电子邮件仅显示哪个账户已连接到该用户；不会根据它进行查找。

生成迁移并应用它。这使 `password_hash` 可为空并创建了表；现有用户保留其密码：

```bash
$ npx drizzle-kit generate --name=identities
$ npx drizzle-kit migrate

```

用户仓储通过身份查找用户，并在一个事务中用其身份创建 Google 用户：

```typescript title="src/users/users.repository.ts"
import { and, eq } from 'drizzle-orm';
import { identities, users } from '../database/schema.js';
// ...

  /** For password sign-in only. `passwordHash` is null for an account created with Google. */
  async findCredentials(email: string): Promise<{ user: User; passwordHash: string | null } | null> {
    // ...
  }

  /** The user that a provider's account signs in. */
  async findByIdentity(provider: string, subject: string): Promise<User | null> {
    const [user] = await this.db
      .select(columns)
      .from(identities)
      .innerJoin(users, eq(users.id, identities.userId))
      .where(and(eq(identities.provider, provider), eq(identities.subject, subject)));
    return user ?? null;
  }

  /** A new user without a password, linked to a provider's account, or `null` when the email is taken. */
  createWithIdentity(email: string, provider: string, subject: string): Promise<User | null> {
    return this.db.transaction(async (tx) => {
      // A concurrent insert of the same email makes this wait for its transaction,
      // and then insert nothing if that one committed.
      const [user] = await tx
        .insert(users)
        .values({ email: normalize(email) })
        .onConflictDoNothing({ target: users.email })
        .returning(columns);
      if (!user) {
        return null;
      }
      await tx.insert(identities).values({ provider, subject, userId: user.id, email });
      return user;
    });
  }

```

对于已使用的电子邮件，`ON CONFLICT DO NOTHING` 不返回任何行，调用者决定其含义。唯一性违规将中止事务，并返回 500。

没有密码的用户绝不应使用密码登录。`PasswordHasher.verify()` 已经处理了缺失的哈希：它检查一个虚拟哈希并返回 `false`，就像电子邮件未知一样。`CredentialsService.verify()` 只需要 TypeScript 现在要求的检查：

```typescript title="src/auth/credentials.service.ts"
  async verify(email: string, password: string): Promise<User | null> {
    const found = await this.usersRepository.findCredentials(email);
    // With no account, verify() checks a dummy hash, so the response
    // time doesn't reveal which emails are registered.
    // The same goes for an account created with Google, which has no password.
    const valid = await this.passwordHasher.verify(password, found?.passwordHash);
    if (!valid || !found?.passwordHash) {
      return null;
    }
    // ...
  }

```

使用 Google 账户的密码登录会得到与未注册地址的 401 相同的响应。

#### 验证 Google ID token

Google 将其签名密钥发布为 JSON Web Key Set (JWKS)。`JwksClient` 获取并缓存它，当一个 token 命名的密钥是它不认识的（Google 会轮换其密钥）时，会重新获取它。`JwtVerifier` 将签名与它一起，以及签发者、受众和过期时间进行检查。这是验证者 `JwtBearerProvider` 用于另一个签发者 token 的方式（参见 [Issue tokens to the mobile app](/security/authentication#issue-tokens-to-the-mobile-app)）：

```typescript title="src/auth/google-id-token.verifier.ts"
import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwksClient, JwtError, JwtVerifier } from '@nestjs/authentication';
import type { Env } from '../config.js';

/** What the API takes from a verified Google ID token. */
export interface GoogleAccount {
  /** Google's id for the account: stable, never reused. */
  subject: string;
  email?: string;
  /** Whether Google verified that the account owns `email`. */
  emailVerified: boolean;
}

// Google documents both values of `iss` for its ID tokens.
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

@Injectable()
export class GoogleIdTokenVerifier {
  private readonly logger = new Logger(GoogleIdTokenVerifier.name);
  private readonly verifier: JwtVerifier;

  constructor(config: ConfigService<Env, true>) {
    this.verifier = new JwtVerifier({
      jwks: new JwksClient(config.get('GOOGLE_JWKS_URL', { infer: true })),
      // A token must name one of them.
      issuer: GOOGLE_ISSUERS,
      // Tokens issued to any other client of Google's are refused.
      audience: config.get('GOOGLE_CLIENT_IDS', { infer: true }),
      required: ['exp', 'sub'],
      // Google's clock and this server's are never quite the same.
      clockTolerance: '30s',
    });
  }

  async verify(idToken: string): Promise<GoogleAccount> {
    try {
      const claims = await this.verifier.verify(idToken);
      return {
        subject: claims.sub!,
        email: typeof claims.email === 'string' ? claims.email : undefined,
        emailVerified: claims.email_verified === true,
      };
    } catch (error) {
      if (error instanceof JwtError) {
        throw new UnauthorizedException(`Invalid Google ID token: ${error.message}`);
      }
      // Google's keys couldn't be fetched: not the client's fault, and worth retrying.
      this.logger.error('Google ID token verification failed', error);
      throw new ServiceUnavailableException('Google sign-in is unavailable');
    }
  }
}

```

- **受众是您的客户端 ID。** Google 使用相同的密钥对每个应用程序的 ID token 进行签名。如果没有此检查，用户浏览器提供给另一个站点的 token 会在这里签入他们，这就是为什么 `JwtVerifier` 会拒绝没有 `audience` 的 `jwks`。
- **Google 的两个签发者。** Google 将 `https://accounts.google.com` 和 `accounts.google.com` 都记录为 ID token 的 `iss`。`issuer` 选项接受一个接受值的列表（在 `@nestjs/authentication` 0.1.8 及更高版本中），如果 token 命名了任何其他签发者，则会被拒绝。
- **错误的 token 是 401，中断是 503。** `JwtError` 说明了 token 失败的原因。当无法获取 Google 密钥时，客户端应稍后重试，而不是登出用户。

> info **提示** ID token 有大约一小时的有效期，在有效期内，复制它的人可以在此处兑换。Google 的库会在 token 中放入您的 `nonce`（Web `initialize()` 调用中的 `nonce` 选项，Android 上的 `setNonce()`）。一个每登录生成随机 nonce 并在每次接受一次的 API 可以阻止重放；`verify()` 返回每个声明，因此检查是 `claims.nonce` 的比较。它需要一个端点和自己的表，因此本教程省略了它。

#### 使用 Google ID token 登录

验证后的 token 会导致三种情况之一：Google 账户已链接到现有用户；未链接且其地址可用；或未链接但该地址属于一个账户：

```typescript title="src/auth/google-sign-in.service.ts"
import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type { User } from '../users/user.js';
import { UsersRepository } from '../users/users.repository.js';
import type { GoogleAccount } from './google-id-token.verifier.js';

@Injectable()
export class GoogleSignInService {
  constructor(private readonly usersRepository: UsersRepository) {}

  /** The user a Google account signs in, created on its first sign-in. */
  async signIn(google: GoogleAccount): Promise<User> {
    const linked = await this.usersRepository.findByIdentity('google', google.subject);
    if (linked) {
      return linked;
    }
    // A first sign-in. The email becomes the account's, so it must be one Google verified.
    if (!google.email || !google.emailVerified) {
      throw new ForbiddenException('Google has not verified the email address of this account');
    }
    const created = await this.usersRepository.createWithIdentity(google.email, 'google', google.subject);
    if (created) {
      return created;
    }
    // The email is taken. A concurrent first sign-in with this Google account may have
    // just taken it, and then that user is this one.
    const raced = await this.usersRepository.findByIdentity('google', google.subject);
    if (raced) {
      return raced;
    }
    // Someone signed up with this email and a password. Linking now would let them in too.
    throw new ConflictException({
      message: 'An account with this email exists: sign in with its password, then connect Google',
      error: 'Conflict',
      statusCode: 409,
      errorCode: 'link_required',
    });
  }
}

```

返回的 Google 账户将登录到其用户，无论其电子邮件当前显示什么。首次登录仅创建具有 Google 验证的地址的用户；未经验证的地址可能是别人的，因此返回 403。

##### 防止账户预先劫持

通过地址链接会将账户交给攻击者，因为 JWT 教程从未检查用户是否拥有他们注册的地址。有人首先使用 `ada@gmail.com` 和他们选择的密码注册。当 Ada 稍后使用 Google 登录时，她会进入该账户，在其账户中保留她的笔记，而攻击者仍然拥有密码。这就是账户预先劫持。

因此，该登录会返回 409，并将 `errorCode` 设置为 `link_required`：客户端要求用户使用密码登录，然后连接 Google。响应显示该地址有一个账户，但仅对 Google 验证了该地址的人有效。如果所有者从未设置该密码，则由其他人设置，而 [password reset](/security/authentication#reset-forgotten-passwords) 会将账户交还给他们。一个可以链接双方都验证了地址的账户的 API [verifies email addresses](/security/authentication#verify-email-addresses)，就像认证章节所做的那样。

##### 同时进行两次首次登录

双击会为同一个 Google 账户发送两次首次登录。两者都找不到身份并插入一个具有相同电子邮件的用户；PostgreSQL 使第二次插入等待第一次事务，然后不插入任何内容。第二次请求再次读取身份并登录到第一个创建的用户。如果没有这次读取，它将返回 409，就像一个陌生人拥有该地址一样。

##### 路由

请求体将 ID token 作为 `credential` 携带，这是 Google Web 库使用的名称：

```typescript title="src/auth/auth.schemas.ts"
// ...
// What Google's sign-in libraries hand the client: a signed JWT, a little over 1 KB.
const credential = z.string().min(1).max(4096);

export const googleSignInSchema = z.object({ credential });
export type GoogleSignInDto = z.infer<typeof googleSignInSchema>;

export const connectGoogleSchema = z.object({ credential, password: z.string().max(128) });
export type ConnectGoogleDto = z.infer<typeof connectGoogleSchema>;

```

控制器验证 token，找到用户，并使用 `TokenService` 发出 token，就像 `POST /auth/token` 所做的那样：

```typescript title="src/auth/google-auth.controller.ts"
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Public, TokenService } from '@nestjs/authentication';
import { ApiSecurity } from '@nestjs/swagger';
import { Throttle, minutes } from '@nestjs/throttler';
import { googleSignInSchema, type GoogleSignInDto } from './auth.schemas.js';
import { GoogleIdTokenVerifier } from './google-id-token.verifier.js';
import { GoogleSignInService } from './google-sign-in.service.js';

@Public()
@ApiSecurity({})
@Controller('auth/google')
export class GoogleAuthController {
  constructor(
    private readonly googleIdTokenVerifier: GoogleIdTokenVerifier,
    private readonly googleSignInService: GoogleSignInService,
    private readonly tokenService: TokenService,
  ) {}

  // The same tokens as POST /auth/token, for a Google ID token.
  @Throttle({ default: { limit: 30, ttl: minutes(15) } })
  @Post()
  @HttpCode(200)
  async signIn(@Body({ schema: googleSignInSchema }) body: GoogleSignInDto) {
    const google = await this.googleIdTokenVerifier.verify(body.credential);
    const user = await this.googleSignInService.signIn(google);
    return this.tokenService.issue(user.id, { method: 'oidc:google' });
  }
}

```

这些 token 是 API 自己的，因此笔记路由和 `POST /auth/token/refresh` 不关心用户如何登录。该路由有自己的速率限制，因为 `account` 限制是按请求体中的电子邮件计数，而该体中没有电子邮件。ID token 是一种凭证，因此在 `main.ts` 的 logger 的 `redact` 列表中添加 `credential`：

```typescript title="src/main.ts"
// ...
  logger: new ConsoleLogger({
    // ...
    redact: ['password', 'authorization', 'accessToken', 'refreshToken', 'credential'],
  }),
// ...

```

模块注册在下一节中。

#### 将 Google 连接到现有账户

已登录用户从其账户页面连接 Google：Web 应用程序显示相同的按钮，并将 ID token 发送到 `POST /me/identities/google`。不需要电子邮件匹配，因为访问 token 证明了账户，而 ID token 证明了 Google 账户。密码是：连接添加了一种持久的入口，而为期 15 分钟的访问 token 不应足以让窃贼的 Google 账户被添加。仓储进行列表、链接和解除链接：

```typescript title="src/users/identities.repository.ts"
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, asc, eq, exists, isNotNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { identities, users, type Identity } from '../database/schema.js';

export type ConnectedAccount = Pick<Identity, 'provider' | 'email' | 'createdAt'>;

const columns = { provider: identities.provider, email: identities.email, createdAt: identities.createdAt };

/** The provider accounts connected to a user. */
@Injectable()
export class IdentitiesRepository {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase) {}

  list(userId: string): Promise<ConnectedAccount[]> {
    return this.db.select(columns).from(identities).where(eq(identities.userId, userId)).orderBy(asc(identities.provider));
  }

  /** Whose the provider account is: the user it is linked to, or `undefined`. */
  async ownerOf(provider: string, subject: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ userId: identities.userId })
      .from(identities)
      .where(and(eq(identities.provider, provider), eq(identities.subject, subject)));
    return row?.userId;
  }

  /** Whether the link was made: not when the provider account, or the user's account at the provider, is linked already. */
  async link(userId: string, provider: string, subject: string, email?: string): Promise<boolean> {
    // The constraints decide, so of two concurrent links of one account, one succeeds.
    const linked = await this.db
      .insert(identities)
      .values({ userId, provider, subject, email })
      .onConflictDoNothing()
      .returning({ provider: identities.provider });
    return linked.length > 0;
  }

  /** Whether the link was removed. Never the user's last way to sign in: a user without a password keeps it. */
  async unlink(userId: string, provider: string): Promise<boolean> {
    const hasPassword = this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), isNotNull(users.passwordHash)));
    // One statement: the check and the delete can't be separated by another request.
    const removed = await this.db
      .delete(identities)
      .where(and(eq(identities.userId, userId), eq(identities.provider, provider), exists(hasPassword)))
      .returning({ provider: identities.provider });
    return removed.length > 0;
  }
}

```

`UsersModule` 提供它，并使用 `UsersRepository` 导出它：

```typescript title="src/users/users.module.ts"
import { Module } from '@nestjs/common';
import { IdentitiesRepository } from './identities.repository.js';
import { MeController } from './me.controller.js';
import { UsersRepository } from './users.repository.js';

@Module({
  controllers: [MeController],
  providers: [UsersRepository, IdentitiesRepository],
  exports: [UsersRepository, IdentitiesRepository],
})
export class UsersModule {}

```

服务检查密码，并将陈述更改为答案：

```typescript title="src/auth/identities.service.ts"
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { User } from '../users/user.js';
import { IdentitiesRepository } from '../users/identities.repository.js';
import { CredentialsService } from './credentials.service.js';
import type { GoogleAccount } from './google-id-token.verifier.js';

@Injectable()
export class IdentitiesService {
  constructor(
    private readonly identitiesRepository: IdentitiesRepository,
    private readonly credentialsService: CredentialsService,
  ) {}

  /** Links a Google account to a signed-in user who confirmed their password. */
  async connectGoogle(user: User, password: string, google: GoogleAccount): Promise<void> {
    if (!(await this.credentialsService.verify(user.email, password))) {
      throw new ForbiddenException('Wrong password');
    }
    if (await this.identitiesRepository.link(user.id, 'google', google.subject, google.email)) {
      return;
    }
    // Not linked: the Google account is this user's already (a retry), someone else's,
    // or this user has another one.
    const owner = await this.identitiesRepository.ownerOf('google', google.subject);
    if (owner !== user.id) {
      throw new ConflictException(
        owner ? 'This Google account is connected to another account' : 'Disconnect your other Google account first',
      );
    }
  }

  async disconnectGoogle(userId: string): Promise<void> {
    if (await this.identitiesRepository.unlink(userId, 'google')) {
      return;
    }
    const accounts = await this.identitiesRepository.list(userId);
    if (!accounts.some(({ provider }) => provider === 'google')) {
      throw new NotFoundException('Google is not connected');
    }
    throw new ConflictException('Google is the only way to sign in to this account');
  }
}

```

- **插入决定一切。** 两个用户同时连接同一个 Google 账户时，都会通过第一个读取检查；主键允许其中一个插入。在拒绝插入后读取的结果只选择答案。
- **错误的密码是 403。** 401 会告知客户端其访问令牌无效，并要求用户登出。
- **最后一种登录方式保留。** 如果用户没有密码而断开与 Google 的连接，他们将被锁定在笔记之外。该条件是 `DELETE` 的一部分，因此中间不会有任何变化，此类用户将收到 409。

控制器位于全局认证守卫之后，如下所示：

```typescript title="src/auth/identities.controller.ts"
import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Throttle, minutes } from '@nestjs/throttler';
import type { User } from '../users/user.js';
import { IdentitiesRepository } from '../users/identities.repository.js';
import { connectGoogleSchema, type ConnectGoogleDto } from './auth.schemas.js';
import { GoogleIdTokenVerifier } from './google-id-token.verifier.js';
import { IdentitiesService } from './identities.service.js';

@Controller('me/identities')
export class IdentitiesController {
  constructor(
    private readonly identitiesRepository: IdentitiesRepository,
    private readonly googleIdTokenVerifier: GoogleIdTokenVerifier,
    private readonly identitiesService: IdentitiesService,
  ) {}

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.identitiesRepository.list(userId);
  }

  // It checks a password, so it's limited like sign-in.
  @Throttle({ default: { limit: 5, ttl: minutes(15) } })
  @Post('google')
  @HttpCode(204)
  async connect(@CurrentUser() user: User, @Body({ schema: connectGoogleSchema }) body: ConnectGoogleDto) {
    const google = await this.googleIdTokenVerifier.verify(body.credential);
    await this.identitiesService.connectGoogle(user, body.password, google);
  }

  @Delete('google')
  @HttpCode(204)
  disconnect(@CurrentUser('id') userId: string) {
    return this.identitiesService.disconnectGoogle(userId);
  }
}

```

在 `AuthModule` 中注册两个控制器和新的提供者：

```typescript title="src/auth/auth.module.ts"
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { CredentialsService } from './credentials.service.js';
import { DrizzleRefreshTokenStore } from './drizzle-refresh-token.store.js';
import { GoogleAuthController } from './google-auth.controller.js';
import { GoogleIdTokenVerifier } from './google-id-token.verifier.js';
import { GoogleSignInService } from './google-sign-in.service.js';
import { IdentitiesController } from './identities.controller.js';
import { IdentitiesService } from './identities.service.js';
import { JwtAuth } from './jwt-auth.provider.js';

@Module({
  imports: [UsersModule],
  controllers: [AuthController, GoogleAuthController, IdentitiesController],
  providers: [
    JwtAuth,
    CredentialsService,
    DrizzleRefreshTokenStore,
    GoogleIdTokenVerifier,
    GoogleSignInService,
    IdentitiesService,
  ],
})
export class AuthModule {}

```

#### 添加使用 Google 登录按钮

在 Web 端，Google Identity Services 渲染按钮，登录用户，并使用 ID 令牌调用您的函数。一个最小的 Web 应用页面将其发布到 API：

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Notes: sign in</title>
    <script src="https://accounts.google.com/gsi/client" async></script>
  </head>
  <body>
    <div id="google-button"></div>
    <p id="status"></p>
    <script>
      const API_URL = 'http://localhost:3000';
      const GOOGLE_CLIENT_ID = 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';
      const status = document.getElementById('status');

      // Google calls this with the ID token, as `credential`, once the user picks an account.
      async function signIn({ credential }) {
        const res = await fetch(`${API_URL}/auth/google`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ credential }),
        });
        const body = await res.json();
        if (!res.ok) {
          // 409 with errorCode "link_required": show the password form, then connect Google.
          status.textContent = body.message;
          return;
        }
        // Keep the tokens in memory, and send the access token as a bearer token.
        const me = await fetch(`${API_URL}/me`, { headers: { authorization: `Bearer ${body.accessToken}` } });
        status.textContent = `Signed in as ${(await me.json()).email}`;
      }

      window.onload = () => {
        google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: signIn });
        google.accounts.id.renderButton(document.getElementById('google-button'), { theme: 'outline', size: 'large' });
      };
    </script>
  </body>
</html>

```

该页面属于 Web 应用，在其自身的源上：API 的 [security headers](/tutorials/rest-api-jwt-authentication#set-security-headers-and-cors) 只允许 API 自身的脚本，而 Google 的脚本和弹出窗口都不是。使用任何静态文件服务器，在 Google 客户端列出的源上提供它：

```bash
$ python3 -m http.server 5173 -d web

```

API 只接受来自 `CORS_ORIGINS` 的浏览器请求，因此将该源添加到 `.env`：

```bash
CORS_ORIGINS=http://localhost:5173

```

#### 试用

启动应用程序：

```bash
$ npm run start

```

此会话中的 ID 令牌是由一个小型脚本铸造的，该脚本执行了测试中的操作：它在本地端口上提供了其密钥集，该端口由 `GOOGLE_JWKS_URL` 指向，并使用 Google 的声明签署了令牌，其中一些故意是错误的。使用真实客户端时，请在按钮的回调中记录 `credential`。首次登录会创建账户并以 API 的令牌（此处和下方缩短）作答：

```bash
$ ADA_ID_TOKEN=eyJhbGciOiJSUzI1NiIs...
$ curl localhost:3000/auth/google --json "{\"credential\":\"$ADA_ID_TOKEN\"}"
{"accessToken":"eyJhbGciOiJIUzI1NiIs...","refreshToken":"0-dGAu7qrLSPwU-J...","expiresIn":900}

```

访问令牌的行为类似于密码登录。该账户没有密码，并且不能从其断开 Google 连接：

```bash
$ ADA="Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
$ curl localhost:3000/notes -H "$ADA" --json '{"title":"Signed in with Google"}'
{"id":"b17693fc-a303-4e64-9367-76fa453ad921","ownerId":"8fe2d2a6-8f15-4398-8356-e6360603446d","title":"Signed in with Google","body":"","createdAt":"2026-11-23T18:50:09.352Z","updatedAt":"2026-11-23T18:50:09.352Z"}
$ curl localhost:3000/me/identities -H "$ADA"
[{"provider":"google","email":"ada@gmail.com","createdAt":"2026-11-23T18:50:09.289Z"}]
$ curl localhost:3000/auth/token --json '{"email":"ada@gmail.com","password":"correct horse battery"}'
{"message":"Invalid email or password","error":"Unauthorized","statusCode":401}
$ curl -X DELETE localhost:3000/me/identities/google -H "$ADA"
{"message":"Google is the only way to sign in to this account","error":"Conflict","statusCode":409}

```

Bob 使用密码注册。他第一次使用相同地址的 Google 登录并未链接到他的账户。一旦使用密码登录，他连接 Google，从那时起就使用 Google 登录：

```bash
$ BOB_ID_TOKEN=eyJhbGciOiJSUzI1NiIs...
$ curl -i localhost:3000/auth/google --json "{\"credential\":\"$BOB_ID_TOKEN\"}"
HTTP/1.1 409 Conflict
{"message":"An account with this email exists: sign in with its password, then connect Google","error":"Conflict","statusCode":409,"errorCode":"link_required"}
$ BOB="Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
$ curl localhost:3000/me/identities/google -H "$BOB" --json "{\"credential\":\"$BOB_ID_TOKEN\",\"password\":\"wrong\"}"
{"message":"Wrong password","error":"Forbidden","statusCode":403}
$ curl -i localhost:3000/me/identities/google -H "$BOB" --json "{\"credential\":\"$BOB_ID_TOKEN\",\"password\":\"correct horse battery\"}"
HTTP/1.1 204 No Content
$ curl localhost:3000/auth/google --json "{\"credential\":\"$BOB_ID_TOKEN\"}"
{"accessToken":"eyJhbGciOiJIUzI1NiIs...","refreshToken":"i0yexhWtKTqHsjxJ...","expiresIn":900}

```

颁发给另一个客户端的令牌，一个伪造的令牌，以及一个 Google 未验证地址的令牌：

```bash
$ curl localhost:3000/auth/google --json "{\"credential\":\"$OTHER_CLIENTS_ID_TOKEN\"}"
{"message":"Invalid Google ID token: unexpected audience","error":"Unauthorized","statusCode":401}
$ curl localhost:3000/auth/google --json "{\"credential\":\"$FORGED_ID_TOKEN\"}"
{"message":"Invalid Google ID token: invalid signature","error":"Unauthorized","statusCode":401}
$ curl localhost:3000/auth/google --json "{\"credential\":\"$UNVERIFIED_EMAIL_ID_TOKEN\"}"
{"message":"Google has not verified the email address of this account","error":"Forbidden","statusCode":403}

```

使用默认的 `GOOGLE_JWKS_URL` 重启，使用 Google 的真实密钥集，API 拒绝了替代令牌，该令牌指定了一个 Google 不拥有的密钥：

```bash
$ curl localhost:3000/auth/google --json "{\"credential\":\"$ADA_ID_TOKEN\"}"
{"message":"Invalid Google ID token: no matching key","error":"Unauthorized","statusCode":401}

```

对于无法获取的密钥集，在没有监听的端口上，得到一个 `GOOGLE_JWKS_URL`，答案是 503：

```bash
$ curl localhost:3000/auth/google --json "{\"credential\":\"$ADA_ID_TOKEN\"}"
{"message":"Google sign-in is unavailable","error":"Service Unavailable","statusCode":503}

```

API 同时记录了原因：

```bash
ERROR [GoogleIdTokenVerifier] Google ID token verification failed
ERROR [GoogleIdTokenVerifier] Error: JWKS http://127.0.0.1:3359/certs is unavailable: fetch failed

```

#### 测试

测试模拟 Google：它们生成一个 RSA 密钥对，作为 JWKS 从本地 HTTP 服务器提供其公钥部分，并使用 `JwtSigner` 从 `@nestjs/authentication` 签署 ID 令牌。应用程序使用其真实验证器针对该密钥集运行；`JwksClient` 仅在环回地址上接受纯 `http`。将设置添加到测试环境，PGlite 测试也需要这些设置：

```typescript title="vitest.config.e2e.ts"
// ...
    env: {
      DATABASE_URL: 'postgres://unused-in-tests',
      JWT_SECRET: 'test-only-jwt-secret-of-at-least-32-bytes',
      GOOGLE_CLIENT_IDS: 'web-client.apps.googleusercontent.com,mobile-client.apps.googleusercontent.com',
      // The key set test/google-login.e2e-spec.ts serves.
      GOOGLE_JWKS_URL: 'http://127.0.0.1:3351/certs',
    },
// ...

```

竞态条件需要一个真实的 PostgreSQL 服务器和一个连接池，如 [e-commerce tutorial](/tutorials/ecommerce-backend#test-it) 所示：

```typescript title="test/google-login.e2e-spec.ts"
import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { JwtSigner, PasswordHasher } from '@nestjs/authentication';
import { getDrizzleToken } from '@nestjs/drizzle';
import { NodeAdapter, type NestNodeApplication } from '@nestjs/platform-node';
import { Test } from '@nestjs/testing';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module.js';
import { identities, users } from '../src/database/schema.js';

// A real PostgreSQL with a pool, so concurrent sign-ins really race.
const url = process.env.TEST_DATABASE_URL;

// Stands in for Google: a key pair, and its public half served as a JWKS.
const google = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-key';

/** An ID token shaped like Google's, signed with the test key unless `key` says otherwise. */
function idToken(
  claims: { sub: string; email?: string; email_verified?: boolean },
  { key = google.privateKey as KeyObject, issuer = 'https://accounts.google.com', audience = 'web-client.apps.googleusercontent.com', now = Date.now } = {},
) {
  return new JwtSigner({ key, kid: KID, issuer, audience, ttl: '1h', now }).sign({ email_verified: true, ...claims });
}

describe.skipIf(!url)('Google login (e2e)', () => {
  const pool = new Pool({ connectionString: url, max: 20 });
  const db = drizzle({ client: pool });
  const jwks = createServer((_req, res) => {
    const jwk = google.publicKey.export({ format: 'jwk' });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [{ ...jwk, kid: KID, alg: 'RS256', use: 'sig' }] }));
  });
  let app: NestNodeApplication;

  beforeAll(async () => {
    await new Promise<void>((resolve) => jwks.listen(3351, '127.0.0.1', resolve));
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
    await db.execute(sql`TRUNCATE users, identities, refresh_tokens CASCADE`);
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
    await app.close(); // closes the pool too
    jwks.close();
  });

  let clients = 0;
  // Each request from an address of its own: sign-in and sign-up are rate-limited per IP address.
  const from = () => `10.0.0.${++clients}`;

  const signInWithGoogle = (credential: string) =>
    app.inject({ method: 'POST', url: '/auth/google', payload: { credential }, remoteAddress: from() });

  /** The user that a sign-in's access token belongs to. */
  async function me(signIn: { json<T>(): T }) {
    const { accessToken } = signIn.json<{ accessToken: string }>();
    const res = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${accessToken}` } });
    return res.json<{ id: string; email: string }>();
  }

  it('signs a new Google user up, then back in', async () => {
    const first = await signInWithGoogle(idToken({ sub: 'google-ada', email: 'Ada@gmail.com' }));
    expect(first.statusCode).toBe(200);
    const ada = await me(first);
    expect(ada.email).toBe('ada@gmail.com');

    // The other documented issuer, and another of the API's client IDs, work too.
    const again = await signInWithGoogle(
      idToken({ sub: 'google-ada' }, { issuer: 'accounts.google.com', audience: 'mobile-client.apps.googleusercontent.com' }),
    );
    expect(await me(again)).toEqual(ada);
  });

  it('refuses ID tokens that are not for this API', async () => {
    const tokens = {
      'unexpected audience': idToken({ sub: 'google-eve' }, { audience: 'someone-elses.apps.googleusercontent.com' }),
      'unexpected issuer': idToken({ sub: 'google-eve' }, { issuer: 'https://accounts.example.com' }),
      'token expired': idToken({ sub: 'google-eve' }, { now: () => Date.now() - 2 * 60 * 60 * 1000 }),
      'invalid signature': idToken({ sub: 'google-eve' }, { key: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey }),
    };
    for (const [reason, token] of Object.entries(tokens)) {
      const res = await signInWithGoogle(token);
      expect(res.json()).toMatchObject({ statusCode: 401, message: `Invalid Google ID token: ${reason}` });
    }
    const unverified = idToken({ sub: 'google-eve', email: 'mallory@example.com', email_verified: false });
    expect((await signInWithGoogle(unverified)).statusCode).toBe(403);
  });

  /** Signs up with a password, and returns the headers that authenticate as the new user. */
  async function signUp(email: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email, password: 'correct horse battery' },
      remoteAddress: from(),
    });
    return { authorization: `Bearer ${res.json<{ accessToken: string }>().accessToken}` };
  }

  it('never links a Google account to a password account by email', async () => {
    const headers = await signUp('bob@gmail.com');
    const credential = idToken({ sub: 'google-bob', email: 'bob@gmail.com' });

    const refused = await signInWithGoogle(credential);
    expect(refused.json()).toMatchObject({ statusCode: 409, errorCode: 'link_required' });

    const connect = (as: Record<string, string>, token: string, password = 'correct horse battery') =>
      app.inject({ method: 'POST', url: '/me/identities/google', headers: as, payload: { credential: token, password }, remoteAddress: from() });
    expect((await connect(headers, credential, 'a wrong guess')).statusCode).toBe(403);
    expect((await connect(headers, credential)).statusCode).toBe(204);
    expect((await connect(headers, credential)).statusCode).toBe(204); // a retry
    expect((await me(await signInWithGoogle(credential))).email).toBe('bob@gmail.com');

    // Bob's Google account is his, and he has one already.
    const taken = await connect(await signUp('dan@gmail.com'), credential);
    expect(taken.json().message).toBe('This Google account is connected to another account');
    const second = await connect(headers, idToken({ sub: 'google-bob-2' }));
    expect(second.json().message).toBe('Disconnect your other Google account first');

    // Bob has a password, so Google can go, once. Ada has nothing else.
    const disconnect = (as: Record<string, string>) => app.inject({ method: 'DELETE', url: '/me/identities/google', headers: as });
    expect((await disconnect(headers)).statusCode).toBe(204);
    expect((await disconnect(headers)).statusCode).toBe(404);
    const ada = await signInWithGoogle(idToken({ sub: 'google-ada' }));
    const asAda = { authorization: `Bearer ${ada.json<{ accessToken: string }>().accessToken}` };
    expect((await disconnect(asAda)).statusCode).toBe(409);
  });

  it('refuses a password sign-in to an account created with Google', async () => {
    const signIn = (email: string) =>
      app.inject({ method: 'POST', url: '/auth/token', payload: { email, password: 'any password at all' }, remoteAddress: from() });
    const created = await signIn('ada@gmail.com');
    expect(created.statusCode).toBe(401);
    expect(created.json()).toEqual((await signIn('nobody@gmail.com')).json());
  });

  it('creates one user when the same Google account signs in twice at once', async () => {
    const credential = idToken({ sub: 'google-carol', email: 'carol@gmail.com' });
    // Opens the pool's connections first, or the first request finishes while the others wait for theirs.
    await Promise.all(Array.from({ length: 10 }, () => pool.query('SELECT 1')));

    const results = await Promise.all(Array.from({ length: 10 }, () => signInWithGoogle(credential)));

    expect(results.map((res) => res.statusCode)).toEqual(Array(10).fill(200));
    const ids = new Set((await Promise.all(results.map(me))).map(({ id }) => id));
    expect(ids.size).toBe(1);
    expect(await db.$count(users, eq(users.email, 'carol@gmail.com'))).toBe(1);
    expect(await db.$count(identities, eq(identities.subject, 'google-carol'))).toBe(1);
  });
});

```

竞态测试特意先打开连接池的连接。如果没有这样做，第一个请求会占用一个打开的连接并在其他连接建立之前完成，因此不会发生竞态：从 `signIn()` 中移除第二个读取后测试通过。有了它，所有十个都找不到身份，移除该读取后有九个返回 409。

一次创建测试数据库，然后按顺序运行测试文件，因为其中两个会截断同一数据库的表：

```bash
$ docker exec notes-db psql -U postgres -c "CREATE DATABASE notes_test"
$ TEST_DATABASE_URL=postgres://postgres:notes@localhost:5432/notes_test npm run test:e2e -- --no-file-parallelism

 Test Files  3 passed (3)
      Tests  13 passed (13)

```

#### 生产检查清单

JWT 教程的 [checklist](/tutorials/rest-api-jwt-authentication#production-checklist) 中的所有内容都适用。对于 Google 登录：

- 在 Google 客户端和 `CORS_ORIGINS` 中，仅在 `GOOGLE_CLIENT_IDS` 中列出您自己的生产客户端 ID 和生产源，并使用 `https://`。
- 允许 API 通过 HTTPS 访问 `www.googleapis.com`。密钥缓存 10 分钟，刷新失败时保留最后获取的密钥；如果没有密钥，路由将返回 503。
- **在发布前添加密码重置**，以便由其他人注册的地址的所有者可以收回账户，并且 Google 用户可以设置密码。参见 [Reset forgotten passwords](/security/authentication#reset-forgotten-passwords)。
- **为生产环境提供自己的观察密钥对**，来自项目的 **API 密钥** 页面，作为平台环境中的 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET`：`start:prod` 不加载 `.env`。然后观察路由的失败情况：一个要求 Google 为 API 未列出的客户端 ID 获取令牌的移动发布版本，在 `POST /auth/google` 上显示为 401，而 [NestJS Observe](/observability/overview) 会记录每个路由的请求及其失败率，因此可以观察到上升趋势。

#### 后续步骤

- 使用 nonce 停止重放 ID 令牌，如 [Verify a Google ID token](/tutorials/google-login#verify-a-google-id-token) 中的提示所述。
- 只允许您公司的 Google Workspace 账户：它们的令牌携带域作为 `hd`，而 `verify()` 会将该域与其他声明一起返回。
- 通过会话 Cookie 使用 Google 登录服务器渲染的 Web 应用：[Add "Sign in with Google"](/security/authentication#add-sign-in-with-google)。
- 在注册时验证电子邮件地址：[Verify email addresses](/security/authentication#verify-email-addresses)。
- 在生产环境中查看登录及其失败情况：[Observability](/observability/overview)。