<!-- 此文件从 content/security/authentication.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:44:08.374Z -->
<!-- 源文件: content/security/authentication.md -->
<!-- 源哈希: 376209150d7760f905de738b59e0b3ba -->

### 认证

`@nestjs/authentication` 用于用户登录，并告知您的应用程序其他部分用户的身份。它注册一个全局守卫，提供装饰器和一个可注入的上下文来读取当前用户，并提供每个登录流程所需的组件：服务器端会话、密码哈希、电子邮件验证和密码重置链接、TOTP 双因素认证、魔术链接、OpenID Connect、访问和刷新令牌以及 API 密钥。所有这些都基于 Node.js 内置功能构建，并通过您针对文档化接口编写的存储在您的数据库中保持状态，并使用包的测试进行检查。您编写的是只有您的应用程序才知道的内容：如何加载用户、哪些路由是公开的以及您登录流程的端点。

> info **提示** 要构建一个基于令牌登录的完整 API，从空项目到生产环境，请遵循 [Build a REST API with JWT authentication in Node.js](/tutorials/rest-api-jwt-authentication)。

在本教程中，您将为在线猫粮和用品商店的 API 添加登录功能。到最后，它将实现：

- 使用密码、Google 或通过电子邮件发送的链接登录客户，并使用会话 Cookie 使 Web 应用程序保持登录状态。
- 确认客户的电子邮件地址，并允许他们重置忘记的密码。
- 为移动应用程序提供短期存续的 Bearer 令牌和轮换刷新令牌。
- 提供使用身份验证器应用的双因素认证，并要求更改账户的电子邮件地址。
- 允许客户查看他们登录的位置，并在所有地方注销。
- 限制任何人猜测密码的速度。
- 将会话、令牌和待处理链接保存在 PostgreSQL 中，通过 Drizzle（或 TypeORM）。
- 允许合作伙伴系统和客户脚本使用客户创建和撤销的密钥调用 API。

您将构建的端点及其添加每个端点的部分如下：

| 端点 | 部分 |
| --- | --- |
| `POST /auth/sign-up`, `POST /auth/sign-in` | [Add sign-up and sign-in](/security/authentication#add-sign-up-and-sign-in) |
| `POST /auth/email/verify`, `POST /auth/email/verification` | [Verify email addresses](/security/authentication#verify-email-addresses) |
| `POST /auth/password/forgot`, `POST /auth/password/reset` | [Reset forgotten passwords](/security/authentication#reset-forgotten-passwords) |
| `GET /me`, `GET /orders`, `POST /orders` | [Read the current user](/security/authentication#read-the-current-user) |
| `POST /auth/token`, `POST /auth/token/refresh` | [Issue tokens to the mobile app](/security/authentication#issue-tokens-to-the-mobile-app) |
| `POST /auth/mfa/enroll`, `POST /auth/mfa/replace`, `POST /auth/mfa/confirm`, `POST /auth/mfa/verify`, `PATCH /me/email` | [Add two-factor authentication](/security/authentication#add-two-factor-authentication) |
| `GET /auth/oidc/google/login`, `GET /auth/oidc/google/callback` | [Add "Sign in with Google"](/security/authentication#add-sign-in-with-google) |
| `POST /auth/magic-link`, `POST /auth/magic-link/consume` | [Add magic-link sign-in](/security/authentication#add-magic-link-sign-in) |
| `GET /auth/sessions`, `DELETE /auth/sessions/:id`, `POST /auth/sign-out`, `POST /auth/sign-out-everywhere`, `POST /auth/token/revoke` | [Let customers manage their sessions](/security/authentication#let-customers-manage-their-sessions) |
| `POST /auth/api-keys`, `GET /auth/api-keys`, `DELETE /auth/api-keys/:id` | [Issue API keys to partners](/security/authentication#issue-api-keys-to-partners) |

#### 安装

安装包：

```bash
$ npm i --save @nestjs/authentication

```

请求体使用您的应用程序已使用的任何方式进行验证。本页面上的每个 DTO 都出现两次：一次是带有装饰器的类，一次是 Zod 模式，因此请选择您已有的风格并跳过另一个列表。

本教程将用户保存在内存中，在一个 `UsersRepository` 类后面。用 Prisma、Drizzle、TypeORM 或您的应用程序使用的任何内容替换其方法体；其余代码只看到纯 `User` 对象。认证状态（会话、令牌、身份验证器、待处理链接）在 [Keep sessions and tokens in your database](/security/authentication#keep-sessions-and-tokens-in-your-database) 中移动到 PostgreSQL。

从电子邮件验证开始，应用程序从环境变量中读取设置和密钥。在开发期间将它们保存在 `.env` 文件中，并使用它启动应用程序：

```bash
$ npm run start:dev -- --env-file .env

```

#### 注册认证模块

该包从不读取您的用户表。它要求您的代码根据 ID 提供用户，而您的代码决定了什么是用户。这是存储中的用户。`emailVerified` 记录客户是否证明拥有该地址；电子邮件验证设置它，而下订单、Google 登录和魔术链接都依赖于此：

```typescript title="src/users/user.ts"
export type Role = 'customer' | 'staff' | 'admin';

export interface User {
  id: string;
  email: string;
  /** Whether the owner proved the address to us, e.g. by using a magic link. */
  emailVerified: boolean;
  roles: Role[];
}

```

仓储将密码哈希保密。它返回的所有内容都是一个没有哈希的 `User`，因此用户可以从路由返回或写入日志而不会泄露哈希：

```typescript title="src/users/users.repository.ts"
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { User } from './user.js';

interface UserRow extends User {
  passwordHash: string | null;
}

/**
 * In-memory stand-in for your data layer (Prisma, Drizzle, TypeORM, ...).
 * Only `User` objects leave this class: password hashes stay inside.
 */
@Injectable()
export class UsersRepository {
  private readonly rows = new Map<string, UserRow>();

  async create(
    email: string,
    { passwordHash = null, emailVerified = false }: { passwordHash?: string | null; emailVerified?: boolean } = {},
  ): Promise<User> {
    const row: UserRow = { id: randomUUID(), email: normalize(email), emailVerified, roles: ['customer'], passwordHash };
    this.rows.set(row.id, row);
    return toUser(row);
  }

  async findById(id: string): Promise<User | null> {
    const row = this.rows.get(id);
    return row ? toUser(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = this.findRow(email);
    return row ? toUser(row) : null;
  }

  /** For password sign-in only. */
  async findCredentials(email: string): Promise<{ user: User; passwordHash: string | null } | null> {
    const row = this.findRow(email);
    return row ? { user: toUser(row), passwordHash: row.passwordHash } : null;
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    const row = this.rows.get(id);
    if (row) {
      row.passwordHash = passwordHash;
    }
  }

  async updateEmail(id: string, email: string): Promise<User | null> {
    const row = this.rows.get(id);
    if (!row) {
      return null;
    }
    row.email = normalize(email);
    row.emailVerified = false; // nobody has proven the new address yet
    return toUser(row);
  }

  private findRow(email: string) {
    const normalized = normalize(email);
    return [...this.rows.values()].find((row) => row.email === normalized);
  }
}

// As the package passes addresses to handlers: an accent typed as two code points matches the stored one.
const normalize = (email: string) => email.trim().normalize('NFC').toLowerCase();
const toUser = ({ id, email, emailVerified, roles }: UserRow): User => ({ id, email, emailVerified, roles: [...roles] });

```

```typescript title="src/users/users.module.ts"
import { Module } from '@nestjs/common';
import { UsersRepository } from './users.repository.js';

@Module({
  providers: [UsersRepository],
  exports: [UsersRepository],
})
export class UsersModule {}

```

接下来是**凭证提供者**。一个提供者查看传入的请求，并返回请求证明的用户，或者当请求不包含它理解的凭证时返回 `null`。`SessionCookieProvider` 读取会话 Cookie，加载会话，并将其传递给您的 `validate()` 方法，该方法加载用户：

```typescript title="src/auth/session-auth.provider.ts"
import { Injectable } from '@nestjs/common';
import { AuthenticationRegistry, SessionCookieProvider, type SessionRecord } from '@nestjs/authentication';
import type { User } from '../users/user.js';
import { UsersRepository } from '../users/users.repository.js';

@Injectable()
export class SessionAuth extends SessionCookieProvider<User> {
  constructor(
    private readonly usersRepository: UsersRepository,
    registry: AuthenticationRegistry,
  ) {
    super();
    // Adds this provider to the chain the guard runs for every request.
    registry.registerProvider(this);
  }

  // Called for every request with a live session cookie.
  // Returning null (the user was deleted) ends the session.
  validate(session: SessionRecord) {
    return this.usersRepository.findById(session.userId);
  }
}

```

提供者是普通的 `@Injectable()` 类，因此它们注入所需的任何内容，并注册自身：构造函数将 `this` 传递给 `AuthenticationRegistry`，即包提供的提供者列表，守卫会查询此列表。基类通过基于属性的注入接收 `SessionService`，这就是构造函数只列出 `UsersRepository` 和注册表的原因。由于 `validate()` 在每个已认证的请求上运行，被删除的用户会立即失去访问权限，而不是在会话过期时。当用户与会话位于同一数据库中时，存储可以在同一查询中读取用户并将其作为 `session.extra` 传递给 `validate()`，因此一个请求只需一次读取而不是两次；[Keep sessions and tokens in your database](/security/authentication#keep-sessions-and-tokens-in-your-database) 展示了如何实现。

在您自己的模块中提供它。`AuthModule` 将在 `src/auth` 下包含本教程添加的所有内容：

```typescript title="src/auth/auth.module.ts"
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { SessionAuth } from './session-auth.provider.js';

@Module({
  imports: [UsersModule],
  providers: [SessionAuth],
})
export class AuthModule {}

```

现在将 `AuthenticationModule` 注册到根模块中，紧邻 `AuthModule`：

```typescript title="src/app.module.ts"
import { Module } from '@nestjs/common';
import { AuthenticationModule } from '@nestjs/authentication';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    AuthenticationModule.forRoot({
      session: {
        absoluteTtl: '14d', // signed out after 14 days, however active
        idleTtl: '3d', // or after 3 days without a request
      },
    }),
    UsersModule,
    AuthModule,
  ],
})
export class AppModule {}

```

`forRoot()` 只接受值：生命周期、密钥、客户端 ID 以及电子邮件链接的页面。选项中不包含任何类。凭证提供者、后续部分添加的处理程序以及 [database store](/security/authentication#keep-sessions-and-tokens-in-your-database) 都是您自己模块的提供者，每个都从其构造函数注册自身，因此它与它注入的内容相邻，并且模块的选项保持纯数据。生命周期是毫秒，或诸如 `'15m'` 和 `'14d'` 这样的字符串，最长可达 100 年。`@nestjs/jwt` 计数的是秒，因此小于一分钟的数字生命周期会在启动时记录警告：`3600` 在此处是 3.6 秒，而不是一小时。

在启动时，每个提供者的构造函数运行完毕后，注册表会锁定并记录它将尝试的链：

```bash
LOG [AuthenticationModule] AuthenticationRegistry: providers SessionAuth

```

该模块还会注册一个全局守卫。从现在起，**每个路由都需要已登录用户**，而对其他任何人则返回 `401 Unauthorized`。如果您的应用程序已经有必须保持开放的路由，例如健康检查或产品目录，请使用 `@Public()` 进行标记，下一节将介绍此功能。

> info **提示** 会话存储在内存中，直到提供者注册一个存储为止，如果将 `NODE_ENV` 设置为 `production`，模块将拒绝以这种方式启动。一个 [later section](/security/authentication#keep-sessions-and-tokens-in-your-database) 会将它们移动到您的数据库。

#### 添加注册和登录

首先验证请求体。注册强制要求最小密码长度；登录则不强制，这样使用旧规则设置的密码仍然有效：

```typescript title="src/auth/auth.dto.ts"
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class SignUpDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password: string;
}

export class SignInDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

```

与 Zod 模式相同，其推断的类型会替换类。Nest 12.1 通过 `StandardSchemaValidationPipe` 验证任何来自 Zod、Valibot 或 ArkType 的 [Standard Schema](https://standardschema.dev/) 对象：

```typescript title="src/auth/auth.schemas.ts"
import { z } from 'zod';

export const signUpSchema = z.object({
  email: z.email(),
  password: z.string().min(12).max(128),
});
export type SignUpDto = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.email(),
  password: z.string(),
});
export type SignInDto = z.infer<typeof signInSchema>;

```

`PasswordHasher` 使用 scrypt（在 libuv 线程池上，因此不阻塞事件循环）使用 OWASP 推荐的参数默认对密码进行哈希。一个服务封装了控制器所需的两个东西：

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
    if (await this.usersRepository.findByEmail(email)) {
      throw new ConflictException('Email already registered');
    }
    // The address is unverified: anyone can type any email into a sign-up form.
    return this.usersRepository.create(email, { passwordHash: await this.passwordHasher.hash(password) });
  }

  /** The user, or `null` when the email or the password is wrong. */
  async verify(email: string, password: string): Promise<User | null> {
    const found = await this.usersRepository.findCredentials(email);
    // With no account (or no password), verify() checks a dummy hash, so the
    // response time does not reveal which emails are registered.
    const valid = await this.passwordHasher.verify(password, found?.passwordHash);
    if (!valid || !found?.passwordHash) {
      return null;
    }
    // The cost settings changed since this hash was stored: upgrade it now,
    // while we have the plaintext.
    if (this.passwordHasher.needsRehash(found.passwordHash)) {
      await this.usersRepository.updatePasswordHash(found.user.id, await this.passwordHasher.hash(password));
    }
    return found.user;
  }
}

```

- `verify()` 没有存储的哈希会根据虚拟哈希检查密码。未知电子邮件和错误的密码耗时相同并产生相同的结果，因此两者都不会泄露哪些电子邮件有账户。
- 密码使用 scrypt 从 `node:crypto` 进行哈希，使用 OWASP 推荐的参数（N=2^17, r=8, p=1：每个哈希约 128 MiB 内存），在 libuv 线程池上。这是一个内存密集型函数，bcrypt 不是，并且不需要原生依赖。每个哈希都会记录其生成时使用的参数（`$scrypt$ln=17,r=8,p=1$...`）。当您使用 `password` 选项提高成本时，`needsRehash()` 会告诉您需要升级哪些存储的哈希，而唯一可以执行此操作的时机是在用户登录时。在此之前，`verify()` 会将旧的、成本较低的哈希检查提升到新参数的工作量，因此仍然耗时与未知电子邮件相同。不能通过这种方式隐藏降低成本：使用成本更高的参数生成的哈希在升级之前需要更长时间进行检查。成本有一个上限，即 1 GiB 内存和默认工作量的 16 倍，因此当 `r` 为 8 时，`logN` 停止在 20。超出此范围的参数在启动时失败，并且使用这些参数创建的存储哈希永远无法验证。
- `register()` 保持地址未验证状态。在注册表单中输入电子邮件并不能证明您拥有它。

控制器将验证的密码转换为会话：

```typescript title="src/auth/auth.controller.ts"
import { Body, Controller, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { Public, SignInService } from '@nestjs/authentication';
import { SignInDto, SignUpDto } from './auth.dto.js';
import { CredentialsService } from './credentials.service.js';

@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly signInService: SignInService,
  ) {}

  @Post('sign-up')
  async signUp(@Body() body: SignUpDto) {
    const user = await this.credentialsService.register(body.email, body.password);
    await this.signInService.signIn(user.id, { method: 'password' });
    return user;
  }

  @Post('sign-in')
  @HttpCode(200)
  async signIn(@Body() body: SignInDto) {
    const user = await this.credentialsService.verify(body.email, body.password);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const { session } = await this.signInService.signIn(user.id, { method: 'password' });
    return { mfaRequired: session.mfa === 'pending' };
  }
}

```

`@Public()` 在类上跳过了两个路由的认证。`SignInService.signIn()` 是第一个因子变为会话的唯一地方：此步骤在密码之后调用它，Google 和魔术链接步骤也会经过它。它创建会话，并在响应本身上设置会话 Cookie，无论是在 Express 还是 Fastify 上，因此控制器不需要 `@Req()` 也不需要 `@Res()`：

- Cookie `__Host-sid` 包含一个随机的 256 位令牌，并且是 `HttpOnly`、`Secure` 和 `SameSite=Lax`。`__Host-` 前缀告诉浏览器仅从该主机接受它，因此另一个子域上的页面不能植入自己的会话 Cookie。只存储令牌的 SHA-256 哈希，因此泄露的会话存储无法被重放为 Cookie。
- 它会删除该浏览器之前拥有的会话，这防御了会话固定攻击。
- 它会拒绝来自其他网站页面的登录请求，返回 403。否则该页面可能会将客户的浏览器登录到攻击者选择的账户（登录 CSRF）。
- `method` 会记录在审计跟踪中，该部分在 [managing sessions](/security/authentication#let-customers-manage-their-sessions) 中提到。
- `mfaRequired` 在您 [add a second factor](/security/authentication#add-two-factor-authentication) 之前保持 `false`。

使用 Zod 模式时，主体参数声明其模式而不是类：

```typescript title="src/auth/auth.controller.ts"
import { signInSchema, signUpSchema, type SignInDto, type SignUpDto } from './auth.schemas.js';
// ...
@Post('sign-up')
async signUp(@Body({ schema: signUpSchema }) body: SignUpDto) {
  // ...
}

@Post('sign-in')
@HttpCode(200)
async signIn(@Body({ schema: signInSchema }) body: SignInDto) {
  // ...
}

```

在 `AuthModule` 中注册控制器：

```typescript title="src/auth/auth.module.ts"
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { CredentialsService } from './credentials.service.js';
import { SessionAuth } from './session-auth.provider.js';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [SessionAuth, CredentialsService],
})
export class AuthModule {}

```

> info **提示** DTO 仅由验证管道强制执行：全局绑定 `ValidationPipe`，作为 `APP_PIPE` 类型的 `AppModule` 提供者或在 `main.ts` 中使用 `useGlobalPipes()`。使用 Zod 模式时，以相同方式绑定 `StandardSchemaValidationPipe`：应用程序使用其中一个。[validation](/techniques/validation) 页面提供了每种选项。

> info **提示** Chrome、Firefox 和 curl 将 `http://localhost` 视为安全源，并接受来自该源的 `Secure` 和 `__Host-` Cookie，因此在开发过程中不需要 HTTPS。在另一个通过纯 HTTP 的主机上，例如局域网地址，请在 `session` 选项中将 `cookie.secure` 设置为 `false`；此时 Cookie 的名称为 `sid`。

会话 Cookie 也受到跨站请求伪造的保护。除了 `SameSite=Lax`，该模块还会忽略来自其他源的 `POST`、`PUT`、`PATCH` 和 `DELETE` 请求以及 WebSocket 握手上的 Cookie，判断依据是 `Sec-Fetch-Site`、`Origin` 和 `Host` 标头，因此这些请求是匿名的。发送了 `Sec-Fetch-Site` 和 `Origin` 的客户端（例如 curl 和您的移动应用）不受影响。如果您的 Web 应用程序运行在与 API 不同的源上，请在 `session.trustedOrigins` 中列出它。

在 Nest 12.1 或更高版本上，还在 `main.ts` 中调用 `app.enableCsrfProtection()`。它对每个路由做出相同的决定，包括没有会话保护的公共路由，返回 403。将与 `session` 选项相同的 `trustedOrigins` 传递给它。

#### 验证电子邮件地址

任何人都可以将任何地址输入到注册表单中。直到客户通过打开发送到该地址的链接来证明该地址属于他们之前，商店将其视为未验证：它不会接收收据会发送到该地址的订单，也不会允许 Google 账户或魔术链接进入该账户，如下文所示。该包创建和检查链接。您的应用程序使用您选择的邮件库发送它们；商店使用 `@nestjs/mail`：

```bash
$ npm i --save @nestjs/mail

```

从这一步开始，应用程序从环境变量中读取设置。将应用程序的公共 URL 添加到 `.env`。电子邮件中的链接指向 Web 应用的页面：

```bash
APP_URL=http://localhost:3000

```

> info **提示** 教程直接读取 `process.env` 以保持简洁。在应用程序中，请通过 [`@nestjs/config`](/application/configuration) 使用验证模式加载环境，这样缺失或格式错误的变量会在启动时而不是在第一个请求时停止应用程序，然后从 `ConfigService` 读取值。

在 `AppModule` 中注册 `MailModule`。这两个模块现在都读取环境变量，因此 `AuthenticationModule` 切换到 `forRootAsync()`：其工厂在引导时运行，而 `forRoot()` 的参数在导入文件时求值，这在所有值都是字面量时是可行的。使用 `@nestjs/config`，添加 `inject: [ConfigService]` 并从注入的服务中读取值。在开发中，`LogMailTransport` 将每封电子邮件打印到应用程序日志中，因此您可以跟踪链接；将 `SMTP_URL` 设置为发送真实电子邮件。`FileTemplateEngine` 从 `src/mail/templates` 中的 HTML 文件渲染电子邮件正文，每封邮件一个文件：

```typescript title="src/app.module.ts"
import { FileTemplateEngine, LogMailTransport, MailModule, SmtpTransport } from '@nestjs/mail';
// ...
import { join } from 'node:path';
// ...

@Module({
  imports: [
    MailModule.forRootAsync({
      useFactory: () => ({
        // Your provider in production. In development, each email (links
        // included) is printed to the log.
        transport: process.env.SMTP_URL ? new SmtpTransport({ url: process.env.SMTP_URL }) : new LogMailTransport(),
        // The emails' HTML: the templates in mail/templates, next to this file
        templates: new FileTemplateEngine({ dir: join(import.meta.dirname, 'mail/templates') }),
        from: 'Accounts <accounts@example.com>',
      }),
    }),
    AuthenticationModule.forRootAsync({
      // ...

```

TypeScript 编译器不会将 HTML 文件复制到 `dist`：如 [Mail](/application/mail#register-the-mail-module) 教程所示，将模板添加到 `nest-cli.json` 中的资源中；它也涵盖了模板语法。

验证电子邮件是一个模板。链接位于双大括号之间，这会转义它：

```html
<p>Confirm the email address of your store account:</p>
<p><a href="{{ url }}">Confirm my address</a></p>
<p>If you didn't create an account, ignore this email.</p>

```

一个邮件类从模板渲染电子邮件，将链接作为其上下文，并且一个 `EmailVerificationHandler` 将该包连接到它：`send()` 递送一个链接，而 `markVerified()` 在您的用户表中记录一个已验证的地址。像一个凭证提供者一样，一个处理器会根据其服务的特性名称进行自我注册：

```typescript title="src/auth/email-verification.mailer.ts"
import { Injectable } from '@nestjs/common';
import { AuthenticationRegistry, EmailVerificationHandler, type EmailVerificationLink } from '@nestjs/authentication';
import { Mailer, type Mailable } from '@nestjs/mail';
import { UsersRepository } from '../users/users.repository.js';

@Injectable()
export class VerifyEmailMail implements Mailable<EmailVerificationLink> {
  render({ url }: EmailVerificationLink) {
    return {
      subject: 'Confirm your email address',
      template: 'verify-email',
      context: { url },
    };
  }
}

@Injectable()
export class EmailVerificationMailer extends EmailVerificationHandler {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly mailer: Mailer,
    registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerHandler('emailVerification', this);
  }

  async send(link: EmailVerificationLink) {
    await this.mailer.send(VerifyEmailMail, { to: link.email, data: link });
  }

  // Runs when the link is used. It verifies nothing if the address changed since.
  markVerified(userId: string, email: string) {
    return this.usersRepository.markEmailVerified(userId, email);
  }
}

```

`markVerified()` 仅标记链接发送到的地址。如果客户自那时起更改了地址，该链接不会验证任何内容。仓储仅在地址匹配时更新行，在 SQL 中这是一个条件更新（`UPDATE users SET email_verified = true WHERE id = $1 AND email = $2`）：

```typescript title="src/users/users.repository.ts"
/** Only if `email` is still the user's address: a link sent to an old one verifies nothing. */
async markEmailVerified(id: string, email: string): Promise<boolean> {
  const row = this.rows.get(id);
  if (!row || row.email !== normalize(email)) {
    return false;
  }
  row.emailVerified = true;
  return true;
}

```

一个特性有两个部分：其处理器和其选项。在 `AuthModule` 中提供处理器，并配置链接打开的页面。缺少其中一个部分会在启动时失败，并以一个命名缺失部分的消息显示：

```typescript title="src/auth/auth.module.ts"
providers: [
  SessionAuth,
  CredentialsService,
  EmailVerificationMailer,
],

```

```typescript title="src/app.module.ts"
AuthenticationModule.forRootAsync({
  useFactory: () => ({
    session: {
      // ...
    },
    emailVerification: { url: `${process.env.APP_URL}/verify-email` },
  }),
}),

```

在客户注册时发送链接：

```typescript title="src/auth/auth.controller.ts"
import { EmailVerificationService, Public, SignInService } from '@nestjs/authentication';
// ...
constructor(
  private readonly credentialsService: CredentialsService,
  private readonly signInService: SignInService,
  private readonly emailVerificationService: EmailVerificationService,
) {}

@Post('sign-up')
async signUp(@Body() body: SignUpDto) {
  const user = await this.credentialsService.register(body.email, body.password);
  await this.signInService.signIn(user.id, { method: 'password' });
  // The link in this email proves the customer owns the address.
  await this.emailVerificationService.send(user);
  return user;
}

```

然后添加端点。链接打开 Web 应用的页面，该页面将 URL 中的令牌 POST 回 API：电子邮件扫描器和链接预览会使用 GET 请求跟踪电子邮件中的链接，并且在客户点击之前就会用完。

```typescript title="src/auth/email-verification.controller.ts"
import { BadRequestException, Body, ConflictException, Controller, HttpCode, Post } from '@nestjs/common';
import { CurrentUser, EmailVerificationService, Public } from '@nestjs/authentication';
import type { User } from '../users/user.js';

@Controller('auth/email')
export class EmailVerificationController {
  constructor(private readonly emailVerificationService: EmailVerificationService) {}

  // Called by the page the link opens, which POSTs the token from its URL.
  @Public()
  @Post('verify')
  @HttpCode(200)
  async verify(@Body('token') token: string) {
    const verified = await this.emailVerificationService.verify(token);
    if (!verified) {
      throw new BadRequestException('Invalid or expired link');
    }
    return { email: verified.email, emailVerified: true };
  }

  // "Send the link again", to the signed-in customer's current address.
  @Post('verification')
  @HttpCode(202)
  async resend(@CurrentUser() user: User) {
    if (user.emailVerified) {
      throw new ConflictException('Email address already verified');
    }
    await this.emailVerificationService.send(user);
  }
}

```

- `EmailVerificationService.send()` 存储随机 256 位令牌的 SHA-256 哈希值，以及客户 ID 和地址，并将链接传递给您的处理器。令牌本身只存在于电子邮件中。
- 链接只有效一次，有效期为 24 小时（`emailVerification.ttl`），并且仅对发送到的地址有效。`verify()` 对未知、已使用或已过期的令牌，以及自那时起已更改的地址返回 `null`，路由返回 400。
- `resend` 不是 `@Public()`：只有已登录的客户才能请求新链接，并且只能针对自己的地址，因此该路由不会泄露关于其他账户的任何信息。

注册控制器：

```typescript title="src/auth/auth.module.ts"
controllers: [
  AuthController,
  EmailVerificationController,
],

```

该包也可以在路由上要求已验证的地址：`@Authenticate()` 配合 `verifiedEmail: true` 会对未验证地址的已登录客户返回 403。[Read the current user](/security/authentication#read-the-current-user) 使用它来下订单。

> info **提示** `LogMailTransport` 在 `debug` 级别记录每封电子邮件的文本，包括链接，因此切勿在日志被传输的地方使用它。在生产环境中，设置 `SMTP_URL`，或传递另一个传输器，例如 `ResendTransport`。[Mail](/application/mail) 教程涵盖了选项。

#### 重置忘记的密码

忘记密码的客户会请求一个链接，并在打开的页面上选择新密码。发送链接的电子邮件是另一个模板：

```html
<p>Someone asked to reset the password of your store account.</p>
<p><a href="{{ url }}">Choose a new password</a></p>
<p>The link works once, for an hour. If it wasn't you, ignore this email: your password stays as it is.</p>

```

该包拥有令牌；一个 `PasswordResetHandler` 查找账户，发送电子邮件，并存储新密码的哈希：

```typescript title="src/auth/password-reset.mailer.ts"
import { Injectable } from '@nestjs/common';
import { AuthenticationRegistry, PasswordResetHandler, type PasswordResetLink } from '@nestjs/authentication';
import { Mailer, type Mailable } from '@nestjs/mail';
import { UsersRepository } from '../users/users.repository.js';

@Injectable()
export class PasswordResetMail implements Mailable<PasswordResetLink> {
  render({ url }: PasswordResetLink) {
    return {
      subject: 'Reset your password',
      template: 'password-reset',
      context: { url },
    };
  }
}

@Injectable()
export class PasswordResetMailer extends PasswordResetHandler {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly mailer: Mailer,
    registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerHandler('passwordReset', this);
  }

  // The link goes to the address the account has stored, and works only while
  // the account keeps that address and this hash: any change invalidates it.
  async findUser(email: string) {
    const found = await this.usersRepository.findCredentials(email);
    return found && { id: found.user.id, email: found.user.email, passwordHash: found.passwordHash };
  }

  async send(link: PasswordResetLink) {
    await this.mailer.send(PasswordResetMail, { to: link.email, data: link });
  }

  updatePassword(userId: string, passwordHash: string) {
    return this.usersRepository.updatePasswordHash(userId, passwordHash);
  }
}

```

`findUser()` 返回账户 ID、其存储的地址和其存储的密码哈希，对于没有密码的账户返回 `null`。链接会发送到存储的地址，而不是输入表单的地址：查找忽略重音或点的操作，就像 MySQL 的默认排序规则所做的那样，否则会将一个客户的链接发送给输入了相似地址的任何人。链接仅在地址和哈希未更改时有效，因此任何方式的密码更改都会使之前发送的链接失效。省略地址或哈希是一个错误，该包会记录该错误而不是发送链接。

如果您的应用程序使用除 `PasswordHasher` 以外的（例如 argon2 或 bcrypt）方法对密码进行哈希，请给处理器一个 `hashPassword()` 方法。然后 `reset()` 存储它返回的哈希而不是 scrypt 哈希，因此新密码的格式与您的登录检查一致：

```typescript title="src/auth/password-reset.mailer.ts"
import * as argon2 from 'argon2';
// ...
hashPassword(password: string) {
  return argon2.hash(password);
}

```

它接收客户输入的密码，前提是 `reset()` 已接受它：不为空且最多 4 KiB。您的哈希器的更严格限制，例如 bcrypt 的 72 字节，由您检查。当 `hashPassword()` 抛出时，密码和登录状态保持不变，链接再次有效。

在电子邮件验证旁边启用密码重置，在 `AuthModule` 中的处理器和选项中的页面：

```typescript title="src/auth/auth.module.ts"
providers: [
  SessionAuth,
  CredentialsService,
  EmailVerificationMailer,
  PasswordResetMailer,
],

```

```typescript title="src/app.module.ts"
AuthenticationModule.forRootAsync({
  useFactory: () => ({
    // ...
    emailVerification: { url: `${process.env.APP_URL}/verify-email` },
    passwordReset: { url: `${process.env.APP_URL}/reset-password` },
  }),
}),

```

一个端点接收地址，另一个端点接收令牌和新密码，后者遵循注册规则：

```typescript title="src/auth/auth.dto.ts"
// ...

export class EmailDto {
  @IsEmail()
  email: string;
}

/** The token from the reset link, and the new password, under the sign-up rules. */
export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password: string;
}

```

```typescript title="src/auth/auth.schemas.ts"
export const emailSchema = z.object({
  email: z.email(),
});
export type EmailDto = z.infer<typeof emailSchema>;

/** The token from the reset link, and the new password, under the sign-up rules. */
export const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(12).max(128),
});
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

```

```typescript title="src/auth/password-reset.controller.ts"
import { BadRequestException, Body, Controller, HttpCode, Post } from '@nestjs/common';
import { PasswordResetService, Public } from '@nestjs/authentication';
import { EmailDto, ResetPasswordDto } from './auth.dto.js';

@Public()
@Controller('auth/password')
export class PasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  // The same answer, as fast, whether or not the address has an account:
  // request() returns before it looks the address up.
  @Post('forgot')
  @HttpCode(202)
  forgot(@Body() body: EmailDto) {
    this.passwordResetService.request(body.email);
  }

  // Called by the page the link opens, with the token from its URL and the new password.
  @Post('reset')
  @HttpCode(200)
  async reset(@Body() body: ResetPasswordDto) {
    const result = await this.passwordResetService.reset(body.token, body.password, { signIn: true });
    if (!result) {
      throw new BadRequestException('Invalid or expired link');
    }
    return { mfaRequired: result.signedIn?.session.mfa === 'pending' };
  }
}

```

- 在查找地址之前，`request()` 返回。找到账户、存储令牌和发送电子邮件发生在响应之后，因此一个未注册地址的请求会得到与客户相同的 202 响应，路由无法告知任何人是否有账户。这就是为什么 `forgot` 不做 `await` 任何事情。响应之后的失败，例如邮件服务器宕机，会被记录下来。
- 一个链接只有效一次，持续一小时（`passwordReset.ttl`），并且仅在账户仍拥有发送链接时所拥有的地址和密码时有效。
- `reset()` 存储新密码的哈希，使客户的其他重置链接失效，并在应用程序 [issues them](/security/authentication#issue-tokens-to-the-mobile-app) 时结束该账户的所有会话和所有刷新令牌，因此知道旧密码的人在所有地方都会被登出。[API keys](/security/authentication#issue-api-keys-to-partners) 存在于您自己的表中并保持有效：要切断它们，请在 `password-reset` 事件上撤销它们。如果密码为空或超过 4 KiB，则会 `null`，而不会消耗链接，这样客户就可以重试。使用 `signIn: true`，它会通过 `SignInService` 在此浏览器上登录客户，因此拥有 [two-factor authentication](/security/authentication#add-two-factor-authentication) 的客户仍需要输入代码。
- 该链接也验证了地址，因此 `reset()` 通过您的 `markVerified()` 标记其已验证。这也拯救了其他人使用客户地址注册的账户：重置会替换陌生人的密码并将其登出。

使用 Zod 模式时：

```typescript title="src/auth/password-reset.controller.ts"
import { emailSchema, resetPasswordSchema, type EmailDto, type ResetPasswordDto } from './auth.schemas.js';
// ...
@Post('forgot')
@HttpCode(202)
forgot(@Body({ schema: emailSchema }) body: EmailDto) {
  this.passwordResetService.request(body.email);
}

@Post('reset')
@HttpCode(200)
async reset(@Body({ schema: resetPasswordSchema }) body: ResetPasswordDto) {
  // ...
}

```

注册控制器：

```typescript title="src/auth/auth.module.ts"
controllers: [
  AuthController,
  EmailVerificationController,
  PasswordResetController,
],

```

#### 读取当前用户

`@CurrentUser()` 注入了 `validate()` 加载的用户：

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

`@CurrentUser('id')` 注入单个属性。`@CurrentSession()` 注入提供者认为的会话内容：在这里是存储的会话记录。

> info **提示** 可选：一次告诉包您的用户类型，其类型将随之确定。在 `declare module` 块中增强 `@nestjs/authentication` 的 `AuthenticationTypes` 接口，使用 `user: User`（教程将其保留在 `src/auth/auth-types.ts`）。从那时起，`@CurrentUser('key')` 只接受 `User` 的键，并被类型化为返回该属性，并且 `AuthenticationContext.user` 和 `.session` 也被类型化。一个 `sessionExtra` 键类型 `SessionRecord.extra`，即会话存储在每次会话中读取的内容（导出为 `SessionExtra`、`unknown`，不包含键）。它不类型化参数本身：参数装饰器对注解没有发言权，因此 `user: User` 保持在参数上。它是整个应用程序的单一用户类型，因此具有两种主体类型的应用程序会保留注解。相同的接口对一个 [turns refresh tokens off](/security/authentication#issue-tokens-to-the-mobile-app) 的应用程序使用 `refreshTokens: false`。

```typescript title="src/users/users.module.ts"
@Module({
  controllers: [MeController],
  providers: [UsersRepository],
  exports: [UsersRepository],
})
export class UsersModule {}

```

控制器不是唯一需要用户的代码。订单属于下订单的客户，而 `OrdersService` 从 `AuthenticationContext` 读取该客户，因此控制器不向下传递用户：

```typescript title="src/orders/order.ts"
export interface OrderItem {
  productId: string;
  quantity: number;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  /** In cents. */
  total: number;
  status: 'pending' | 'paid' | 'shipped' | 'refunded';
}

```

```typescript title="src/orders/orders.service.ts"
import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthenticationContext } from '@nestjs/authentication';
import type { Order, OrderItem } from './order.js';

// Stand-in for the products table: product id → price in cents.
const PRICES = new Map([
  ['salmon-kibble-2kg', 2499],
  ['clumping-litter-10l', 1599],
]);

@Injectable()
export class OrdersService {
  private readonly orders: Order[] = [];

  constructor(private readonly authenticationContext: AuthenticationContext) {}

  findMine(): Order[] {
    const { id } = this.authenticationContext.requireUser();
    return this.orders.filter((order) => order.userId === id);
  }

  place(items: OrderItem[]): Order {
    const { id: userId } = this.authenticationContext.requireUser();
    const total = items.reduce((sum, item) => sum + this.price(item.productId) * item.quantity, 0);
    const order: Order = { id: randomUUID(), userId, items, total, status: 'pending' };
    this.orders.push(order);
    return order;
  }

  private price(productId: string): number {
    const price = PRICES.get(productId);
    if (price === undefined) {
      throw new BadRequestException(`Unknown product ${productId}`);
    }
    return price;
  }
}

```

```typescript title="src/orders/orders.controller.ts"
import { Body, Controller, Get, Post } from '@nestjs/common';
import { Authenticate } from '@nestjs/authentication';
import type { OrderItem } from './order.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findMine() {
    return this.ordersService.findMine();
  }

  // Receipts and shipping updates go to the customer's email address,
  // so it must be one they proved.
  @Authenticate({ verifiedEmail: true })
  @Post()
  place(@Body('items') items: OrderItem[]) {
    return this.ordersService.place(items);
  }
}

```

`@Authenticate()` 配合 `verifiedEmail: true` 仅允许拥有已验证地址的客户下订单。任何其他已登录用户都会收到 403 错误，其 `error` 为 `email_unverified`，告诉 Web 应用程序要求客户打开 [verification link](/security/authentication#verify-email-addresses) 或重新发送。这是 403 而不是 401：再次登录无济于事。`GET /orders` 没有此要求。默认情况下，守卫从 `validate()` 加载的用户中读取 `emailVerified`；如果您的用户类型以不同的方式存储它，则您的 `EmailVerificationHandler` 可以覆盖 `isVerified(user)`。

```typescript title="src/orders/orders.module.ts"
import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}

```

将 `OrdersModule` 添加到 `AppModule` 的 `imports` 中：

```typescript title="src/app.module.ts"
UsersModule,
AuthModule,
OrdersModule,

```

`AuthenticationContext` 是单例。它从模块围绕每个处理器打开的 `AsyncLocalStorage` 中读取当前 ⟦Request⟧ 的用户，因此无论处理器调用或等待多少次，它在任何地方都是正确的。`requireUser()` 返回用户，或抛出 `AuthenticationError`，模块对任何传输都以 401 响应。在请求外部，在队列消费者或定时任务中，`AuthenticationContext` 为空，其 `run()` 方法将一个函数作为给定用户运行。它在在处理器外部运行的中间件、守卫和异常过滤器中也是空的。

#### 向移动应用程序颁发令牌

存储的移动应用程序使用持有者令牌而不是 Cookie 进行认证。它在 `Authorization` 头部发送一个短期 JWT 访问令牌，并使用长期刷新令牌进行续订。

向 `.env` 添加一个签名密钥。它必须至少为 32 字节。如果没有它，应用程序将拒绝启动，将该选项命名为：需要 `accessToken.key`。

```bash
# Generate with: openssl rand -base64 32
JWT_SECRET=

```

应用程序同时颁发和验证访问令牌，因此使用 `accessToken` 选项描述它们一次。该密钥对其进行签名，而颁发者、受众和生命周期被包含在每个令牌中并在每次请求时检查：

```typescript title="src/app.module.ts"
AuthenticationModule.forRootAsync({
  useFactory: () => ({
    session: {
      // ...
    },
    accessToken: {
      key: process.env.JWT_SECRET!,
      issuer: 'https://api.example.com',
      audience: 'mobile-app',
      ttl: '15m',
    },
  }),
}),

```

使用密钥作为密钥，令牌使用 HS256 进行签名。第二个凭证提供者验证它们。`JwtBearerProvider` 读取 `Authorization` 头部，将签名与 `accessToken` 密钥进行检查，并 `exp`、`iss` 和 `aud`，然后将验证的声明传递给您的 `validate()`：

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
    super({ realm: 'store' });
    // Second in the chain, after SessionAuth (order 0).
    registry.registerProvider(this, { order: 1 });
  }

  // Called after the signature and claims checked out.
  // Returning null (the user was deleted) rejects the token.
  validate({ sub }: JwtClaims) {
    return sub ? this.usersRepository.findById(sub) : null;
  }
}

```

> info **提示** 使用共享密钥的 HS256 适用于同时颁发和验证令牌的 API。如果其他服务也验证它们，请将 `accessToken` 密钥设置为 ES256 私钥：`JwtAuth` 然后使用其公钥部分验证，它们也可以这样做。要接受来自另一个颁发者的令牌，请将 `super()` 传递其 `jwks` URL，该 URL 必须是 https（localhost 上仅限纯 http），或其公钥 `key`，使用 `issuer` 和 `audience`：两者都必需的，因为身份提供者使用相同的密钥对所有客户端的令牌进行签名。对于没有受众的令牌，请传递 `audience: false` 并检查在 `validate()` 中命名您的客户端的声明。添加 `clockTolerance: '30s'` 用于另一个颁发者的时钟，并添加 `maxAge: '1h'` 以拒绝签发时间更早的令牌。一个 `jwks` 默认接受 `RS256` 和 `ES256`：如果您的颁发者使用其他算法签名，请在 `algorithms` 中列出，例如 `['PS256']`。使用 `HS` 算法将使用 `jwks` 拒绝。要在一个密钥集中共享多个提供者，请将 `JwksClient` 作为 `jwks` 而不是 URL 传递；它接受 `cacheTtl`（默认 `'10m'`）、`cooldown`（默认 `'30s'`）和 `timeout`（默认 `'5s'`）。密钥是 PEM 文本或 `KeyObject`；使用 `createPublicKey()` 从 `node:crypto` 导入 JWK，将 JWK 作为 `key`，将 `'jwk'` 作为 `format`。空的 `key` 或 `jwks`，例如未设置的环境变量，会在启动时失败，而不是回退到 `accessToken` 选项。一个仅验证令牌的服务可以完全省略 `accessToken` 并向 `super()` 提供其验证所使用的内容：共享的 `key`，或带有 `issuer` 和 `audience` 的 `jwks`。

在 `AuthModule` 中提供它：

```typescript title="src/auth/auth.module.ts"
providers: [
  SessionAuth,
  JwtAuth,
  CredentialsService,
],

```

对于每个 ⟦Request⟧，守卫按升序询问提供者，第一个返回用户的获胜。使用默认顺序注册的 `order`、`SessionAuth` 和请求 `0` 寻求 `JwtAuth`，因此带有会话 Cookie 的请求由 `1` 登录，而带有无 Cookie 的持有者令牌的请求从 `SessionAuth` 获得 `null` 并由 `SessionAuth` 处理。顺序是在注册时给出的，而不是留给 Nest 构建提供者的顺序：后者遵循模块图，当提供者移动到另一个模块或添加导入时会更改。要求相同顺序的两个提供者在启动时失败，并命名两者。没有其中任何一个的请求会收到带有 `JwtAuth` 作为其 `missing_credentials` 的 401；其 `errorCode` 头部列出了提供者接受的内容：`WWW-Authenticate`。验证失败的令牌会收到一个说明原因的 401，如 RFC 6750 所述，例如 `Bearer realm="store"`。这告诉移动应用程序刷新。

现在颁发令牌的端点：

```typescript title="src/auth/tokens.controller.ts"
import { Body, Controller, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { Public, TokenService } from '@nestjs/authentication';
import { SignInDto } from './auth.dto.js';
import { CredentialsService } from './credentials.service.js';

@Public()
@Controller('auth/token')
export class TokensController {
  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly tokenService: TokenService,
  ) {}

  @Post()
  @HttpCode(200)
  async issue(@Body() body: SignInDto) {
    const user = await this.credentialsService.verify(body.email, body.password);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.tokenService.issue(user.id, {
      method: 'password',
      // `amr` goes into this access token and into every refreshed one.
      claims: { amr: ['pwd'] },
    });
  }

  // An unknown, expired or reused refresh token gets a 401.
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body('refreshToken') refreshToken: string) {
    return this.tokenService.refresh(refreshToken);
  }
}

```

`TokenService.issue()` 使用 `accessToken` 选项签署访问令牌，启动刷新令牌，并返回两者，同时返回 `expiresIn`，即访问令牌的生命周期（秒）。刷新令牌是不透明的，并以哈希形式存储。每个令牌只使用一次：`refresh()` 消耗它并返回其后继令牌，以及一个新的访问令牌。一个签入的后继令牌构成一个家族。如果返回一个已消耗的令牌，则意味着两个方持有它——一个窃贼和一个应用，因此服务撤销整个家族，双方都必须重新签入。未知、过期或重用的刷新令牌会抛出 `RefreshTokenError`，一个 `AuthenticationError`，模块对此作出响应 401，因此 `refresh` 无需自行进行错误处理。

`amr` 声明记录了用户如何签入，而 [two-factor authentication](/security/authentication#add-two-factor-authentication) 依赖于此。`issue()` 将 `claims` 与刷新令牌家族一起存储，而 `refresh()` 将它们放入它签发的每个访问令牌中，因此刷新后的令牌描述的是相同的签入过程。将可能更改的事实（如角色）排除在 `claims` 之外：它们将保留在令牌中，直到家族生命周期结束。`validate()` 在每个请求上加载当前用户。

一些声明描述的是会话而不是用户，例如多租户应用所在的工作空间。要更改其中一个，请将 `refresh()` 传递给一个 `claims` 函数。它接收家族声明的副本和用户 ID，并返回新访问令牌以及家族后续每次刷新的声明。它可以是异步的，并且可以抛出以拒绝更改，这会使刷新令牌未被消耗：

```typescript
@Post('workspace')
@HttpCode(200)
switchWorkspace(@Body() { refreshToken, workspaceId }: SwitchWorkspaceDto) {
  return this.tokenService.refresh(refreshToken, {
    claims: async (claims, userId) => {
      if (!(await this.workspacesService.isMember(userId, workspaceId))) {
        throw new ForbiddenException();
      }
      return { ...claims, workspace: workspaceId };
    },
  });
}

```

服务忽略函数返回中的 `amr`、`auth_time` 以及注册的 JWT 声明（`sub`、`iss`、`exp` 及其他声明）：`amr` 和 `auth_time` 保留签入时的值，而服务在每次刷新时将其他声明设置为固定值，因此切换操作不能更改用户或添加第二因素。与同一个令牌的两次刷新一样，同时发送的切换和刷新被视为重用，因此客户端应等待其中一个完成后再开始另一个。

一个签发短期访问令牌且客户端需要重新签入的服务可以关闭刷新令牌。当 `refreshToken` 设置为 `false` 时，`issue()` 只返回 `accessToken` 和 `expiresIn`，不存储任何内容，因此应用不需要 `RefreshTokenStore`。令牌端点的响应中不包含刷新令牌：当访问令牌过期时，客户端重新签入。`refresh()` 和 `revoke()` 抛出异常，说明刷新令牌已禁用，而 `revokeAll()` 不执行任何操作。第二因素和 `amr` 声明按原样工作。也在 `AuthenticationTypes` 上声明 `refreshTokens: false`，以便 `issue()` 被类型化为返回 `AccessTokenResult` 而不是 `TokenPair`：

```typescript title="src/app.module.ts"
AuthenticationModule.forRootAsync({
  useFactory: () => ({
    accessToken: {
      key: process.env.JWT_SECRET!,
      // ...
    },
    refreshToken: false,
  }),
}),

```

```typescript title="src/auth/auth-types.ts"
declare module '@nestjs/authentication' {
  interface AuthenticationTypes {
    // ...
    refreshTokens: false;
  }
}

```

执行的是选项；声明仅告知编译器。一个设置了选项但没有声明的应用在运行时不会获得刷新令牌，其类型为字符串，并且 `refresh()` 会在其上抛出异常。`refreshToken` 设置为 `false` 但没有 `accessToken` 不会改变任何内容，并在启动时记录警告。

注册控制器：

```typescript title="src/auth/auth.module.ts"
controllers: [
  AuthController,
  EmailVerificationController,
  PasswordResetController,
  TokensController,
],

```

#### 添加双因素认证

客户可以使用身份验证器应用（基于时间的一次性密码，或 TOTP）保护其账户。在 `AppModule` 中配置 `mfa`：

```typescript title="src/app.module.ts"
AuthenticationModule.forRootAsync({
  useFactory: () => ({
    // ...
    mfa: {
      issuer: 'example.com',
      encryption: { keys: [process.env.TOTP_ENCRYPTION_KEY!] },
    },
  }),
}),

```

服务器必须读取 TOTP 密钥才能检查代码，因此与密码不同，它不能被哈希。`MfaService` 在密钥到达存储之前使用 AES-256-GCM 加密每个密钥，将其绑定到其用户，并且仅在验证代码时解密。任何持有数据库副本但没有密钥的人都无法生成代码。需要密钥：在没有 `encryption` 的情况下配置 `mfa` 会在启动时抛出异常。（`encryption: false` 故意存储明文，用于测试。）少于 128 位的密钥永远无法验证：`enroll()` 生成 160 位，但从其他系统导入的密钥可能更短，其用户需要重新注册。

将密钥添加到 `.env`。字符串密钥必须至少包含 32 个随机字符的数据：

```bash
# Generate with: openssl rand -base64 32
TOTP_ENCRYPTION_KEY=

```

> info **提示** 要轮换密钥，首先将新密钥放入 `keys`，并在其后保留旧密钥。第一个密钥负责加密，所有列出的密钥负责解密，并且在使用时会使用新密钥重新加密密钥。一旦没有任何内容使用旧密钥，即可移除旧密钥。密钥不需要名称：每个加密的密钥都会记录一个从其密钥派生的 ID。

除非配置了 `mfa`，否则双因素认证是关闭的。如果没有它，`MfaService.isEnrolled()` 会在不读取存储的情况下响应 `false`，因此签入过程从不要求代码，并且所有其他 `MfaService` 方法在触及存储之前都会抛出 `MFA is not configured`。从选项中移除 `mfa` 会为每位客户关闭双因素认证，包括那些已经注册了身份验证器的客户。

MFA 端点用于注册身份验证器、确认它并完成签入：

```typescript title="src/auth/mfa.controller.ts"
import { Body, Controller, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { Authenticate, CurrentUser, MfaService, Public, SignInService } from '@nestjs/authentication';
import type { User } from '../users/user.js';

@Controller('auth/mfa')
export class MfaController {
  constructor(
    private readonly mfaService: MfaService,
    private readonly signInService: SignInService,
  ) {}

  // Returns the otpauth:// URI for the web app to show as a QR code,
  // and the secret for people who type it in instead.
  @Post('enroll')
  enroll(@CurrentUser() user: User) {
    return this.mfaService.enroll(user.id, user.email);
  }

  // A new phone. The current authenticator keeps working until /confirm
  // receives a code from the new one.
  @Authenticate({ mfa: true })
  @Post('replace')
  replace(@CurrentUser() user: User) {
    return this.mfaService.enroll(user.id, user.email, { replace: true });
  }

  // The first code proves the authenticator works, and that this browser has
  // it: the session passes the second factor from here on, under a new cookie.
  // Recovery codes are shown once.
  @Post('confirm')
  @HttpCode(200)
  async confirm(@CurrentUser('id') userId: string, @Body('code') code: string) {
    if (!(await this.signInService.confirmMfa(userId, code))) {
      throw new UnauthorizedException('Invalid code');
    }
    return { recoveryCodes: await this.mfaService.generateRecoveryCodes(userId) };
  }

  // Second step of signing in. A pending session counts as signed in
  // nowhere, so the route is public: completeMfa() reads the session cookie.
  @Public()
  @Post('verify')
  @HttpCode(200)
  async verify(@Body('code') code: string | undefined, @Body('recoveryCode') recoveryCode: string | undefined) {
    const issued = await this.signInService.completeMfa({ code, recoveryCode });
    if (!issued) {
      throw new UnauthorizedException('Invalid code');
    }
    return { mfa: issued.session.mfa };
  }
}

```

- `enroll()` 存储一个新的、未确认的密钥，并返回一个 `otpauth://` URI，该 URI 由 Web 应用显示为二维码。一旦身份验证器被确认，`enroll()` 会拒绝覆盖它并抛出 `MfaAlreadyEnrolledError`，模块对此作出响应 409，`Authenticator already enrolled`。覆盖它将关闭双因素认证，直到新密钥被确认。
- `replace` 处理新电话。`enroll()` 配合 `replace: true` 暂存第二个密钥，并且当前身份验证器会继续工作，直到 `confirm()` 从新密钥接收到代码。`@Authenticate()` 配合 `mfa: true` 使路由要求经过验证的第二因素，因此仅凭被盗密码无法替换成别人的身份验证器。
- `SignInService.confirmMfa()` 在身份验证器生成有效代码后激活它，因此错误的密钥不会锁定任何人。该代码还证明了此浏览器拥有身份验证器，因此会话变为已验证状态，使用新的 Cookie：客户可以立即使用需要第二因素的路由，而无需再次签入。使用不含会话的 bearer 令牌发送的确认仅激活身份验证器。该路由返回的十个恢复代码仅显示一次，并以使用客户 ID 加盐的慢速哈希存储，因此数据库副本不会泄露它们。
- 一旦身份验证器被确认，`SignInService.signIn()` 会为该用户创建**待定**会话。待定会话在任何地方都没有签入：需要用户响应的路由会响应 401 和 `"errorCode": "mfa_required"`，指示 Web 应用要求输入代码。这就是 `verify` 为 `@Public()` 的原因。`completeMfa()` 从此浏览器的 Cookie 中读取会话，检查代码或恢复代码，并使用 `mfa: 'verified'` 将会话轮换到新的 ID，设置新的 Cookie。待定会话在 10 分钟后（`mfa.pendingTtl`）过期，而不是 `session.absoluteTtl` 的 14 天：待定 Cookie 仅是凭证的一半。验证代码会赋予会话完整的生命周期。
- `completeMfa()` 只作用于会话 Cookie。带有 bearer 令牌且无 Cookie 的请求会收到 401。
- 代码在当前时间前后 30 秒内有效，每个代码只使用一次。在 15 分钟内输入 5 次错误代码后，账户将拒绝所有代码（包括正确的），直到时间窗口过去。每次尝试在检查之前都会被计数，因此并行发送猜测不会绕过限制。

也可以为单个路由要求经过验证的第二因素，这称为升级认证。存储要求它来更改电子邮件地址，因为这是恢复账户的方式。新地址会出现在 [Reset forgotten passwords](/security/authentication#reset-forgotten-passwords) 的 `EmailDto` 中。添加路由，使用 `@Authenticate()`：

```typescript title="src/users/me.controller.ts"
import { Body, ConflictException, Controller, Get, Patch } from '@nestjs/common';
import { Authenticate, CurrentUser, EmailVerificationService } from '@nestjs/authentication';
import { EmailDto } from '../auth/auth.dto.js';
import type { User } from './user.js';
import { UsersRepository } from './users.repository.js';

@Controller('me')
export class MeController {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  @Get()
  me(@CurrentUser() user: User) {
    return user;
  }

  // The email address is how an account is recovered: changing it needs a
  // session (or token) that passed the second factor.
  @Authenticate({ mfa: true })
  @Patch('email')
  async changeEmail(@CurrentUser('id') userId: string, @Body() body: EmailDto) {
    if (await this.usersRepository.findByEmail(body.email)) {
      throw new ConflictException('Email already registered');
    }
    const user = await this.usersRepository.updateEmail(userId, body.email);
    if (user) {
      // The new address is unverified until the customer uses this link.
      await this.emailVerificationService.send(user);
    }
    return user;
  }
}

```

使用 Zod 模式：

```typescript title="src/users/me.controller.ts"
import { emailSchema, type EmailDto } from '../auth/auth.schemas.js';
// ...
@Authenticate({ mfa: true })
@Patch('email')
async changeEmail(@CurrentUser('id') userId: string, @Body({ schema: emailSchema }) body: EmailDto) {
  // ...
}

```

每个路由都要求已登录用户；`@Authenticate()` 调整了实现方式。使用 `mfa: true`，验证后会通过 Cookie 会话。尚未注册身份验证器的客户无法通过此验证，因此 Web 应用程序会提示他们先注册。

新地址未经验证，因此路由会向其发送验证链接，客户在使用该链接之前无法下订单。发送到旧地址的链接将失效：它们仅验证发送到的地址。

移动应用程序不得成为绕过第二因子的途径，也不能是：像 `signIn()` 和 `TokenService.issue()` 那样，不带代码的已确认身份验证器的客户不会获得令牌。它以 `"errorCode": "mfa_required"` 响应 401，提示应用程序要求提供代码。应用程序随后再次发送密码，并附带代码。将代码添加到请求体中：

```typescript title="src/auth/auth.dto.ts"
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// ...

/** The mobile app's sign-in: a password, and a code once the customer has an authenticator. */
export class TokenRequestDto extends SignInDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  recoveryCode?: string;
}

```

```typescript title="src/auth/auth.schemas.ts"
/** The mobile app's sign-in: a password, and a code once the customer has an authenticator. */
export const tokenRequestSchema = signInSchema.extend({
  code: z.string().optional(),
  recoveryCode: z.string().optional(),
});
export type TokenRequestDto = z.infer<typeof tokenRequestSchema>;

```

并作为 `secondFactor` 传递：

```typescript title="src/auth/tokens.controller.ts"
@Post()
@HttpCode(200)
async issue(@Body() body: TokenRequestDto) {
  const user = await this.credentialsService.verify(body.email, body.password);
  if (!user) {
    throw new UnauthorizedException('Invalid email or password');
  }
  return this.tokenService.issue(user.id, {
    method: 'password',
    // `amr` goes into this access token and into every refreshed one.
    claims: { amr: ['pwd'] },
    // Checked only for customers with an authenticator.
    secondFactor: { code: body.code, recoveryCode: body.recoveryCode },
  });
}

```

```typescript title="src/auth/tokens.controller.ts"
import { tokenRequestSchema, type TokenRequestDto } from './auth.schemas.js';
// ...
@Post()
@HttpCode(200)
async issue(@Body({ schema: tokenRequestSchema }) body: TokenRequestDto) {
  // ...
}

```

没有代码的请求不计为失败尝试，因此应用程序可以判断是否需要代码。验证后的代码将向 `amr` 声明添加 `mfa`。`JwtBearerProvider` 将包含 `mfa`、`otp` 或 `hwk` 的令牌视为已验证，从而通过 `mfa: true` 路由。刷新令牌携带与启动其家族的登录相同的 `amr`，因此使用代码登录的移动应用程序会保持验证状态，直到其刷新令牌过期或被撤销。`issue()` 绝不会从您自己的 `claims` 中获取这三个值：它会丢弃它们，并在日志中发出警告，仅在验证了代码后才添加 `mfa`，因此应用程序不会意外地铸造一个已验证的令牌。

注册控制器：

```typescript title="src/auth/auth.module.ts"
controllers: [
  // ...
  TokensController,
  MfaController,
],

```

##### 关闭双因素认证

`MfaService.disable()` 会移除客户的身份验证器及其恢复代码，并发出 `mfa-disabled`。将路由添加到 `MfaController`，并在其构造函数中注入 `SessionService` 和 `TokenService`：

```typescript title="src/auth/mfa.controller.ts"
// Takes a verified session and a fresh code: a session left signed in on a
// shared computer isn't enough.
@Authenticate({ mfa: true })
@Post('disable')
@HttpCode(204)
async disable(
  @CurrentUser('id') userId: string,
  @CurrentSession() current: SessionRecord,
  @Body('code') code: string,
) {
  if (!(await this.mfaService.verifyTotp(userId, code))) {
    throw new UnauthorizedException('Invalid code');
  }
  await this.mfaService.disable(userId);
  // The other sessions and refresh tokens passed the second factor, and still would.
  await this.sessionService.revokeAll(userId, { except: current.id });
  await this.tokenService.revokeAll(userId);
}

```

- `@Authenticate()` 配合 `mfa: true` 是最基本的：没有它，仅凭被盗密码就可能关闭第二因子。API 密钥永远不会通过它。但这并不能证明客户当前在键盘前：会话会保持验证状态直到其整个生命周期结束。因此，该路由也要求提供代码。`verifyTotp()` 对错误的代码解析 `false`，计入与登录相同的锁定次数，并且每个代码仅使用一次。
- `disable()` 会删除所有恢复代码以及身份验证器，并丢弃由 `replace` 暂存但从未确认的替换项。重新注册将从头开始，并获得新批次的恢复代码。
- `disable()` 不动会话和令牌。客户的其他已验证会话将继续通过 `mfa: true` 路由，其刷新令牌家族也会如此，因为其 `amr` 在每次刷新时都会保留 `mfa`。该路由会终止它们，但保留当前浏览器的会话。已签发的访问令牌在过期前保持有效。通过 bearer 令牌发送的请求没有会话 ID 需要保留：所有会话都结束了，并且 `TokenService.revokeAll()` 也会使该客户端登出。
- 仍在等待第二因子的会话无法完成验证，因为没有身份验证器可以检查代码。`revokeAll()` 会与其它会话一起终止它。
- 尚未确认注册的客户没有已验证的会话，因此此路由会拒绝他们。要取消此类注册，请在没有该路由的情况下调用 `disable()`，同时 `isEnrolled()` 为 `false`，或者再次调用 `enroll()`。

#### 添加“使用 Google 登录”

> info **提示** 此部分使用会话 Cookie 为浏览器登录。对于使用 bearer 令牌的 API，即 Web 或移动应用程序从 Google 自身的登录库获取 ID 令牌，然后 API 将其交换为自己的 JWT，请遵循 [Add Google login to a Node.js API](/tutorials/google-login)。

在 Google Cloud 控制台中，创建一个类型为 **Web application** 的 OAuth 客户端 ID，并添加此授权重定向 URI（以及部署时的生产 URI）：

```bash
http://localhost:3000/auth/oidc/google/callback

```

将客户端凭据添加到 `.env`，紧邻 `APP_URL`：

```bash
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

```

首次使用 Google 登录时，您的应用程序必须决定该 Google 账户属于哪个本地账户。将链接存储为 (provider, subject) 对，其中 subject 是 Google 为该账户的稳定 ID。电子邮件会改变；subject 不会。向仓储添加一个身份表：

```typescript title="src/users/users.repository.ts"
@Injectable()
export class UsersRepository {
  private readonly rows = new Map<string, UserRow>();
  /** `provider:subject` → user id, e.g. `google:1098...` */
  private readonly identities = new Map<string, string>();

  // ...

  async findByIdentity(provider: string, subject: string): Promise<User | null> {
    const id = this.identities.get(`${provider}:${subject}`);
    return id ? this.findById(id) : null;
  }

  async linkIdentity(id: string, provider: string, subject: string): Promise<User | null> {
    this.identities.set(`${provider}:${subject}`, id);
    return this.findById(id);
  }

```

该包向一个 `OidcAccountResolver` 请求该决策：

```typescript title="src/auth/account-linker.ts"
import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  AuthenticationRegistry,
  OidcAccountResolver,
  type OAuthTokens,
  type OidcProfile,
  type OidcResolveContext,
} from '@nestjs/authentication';
import { UsersRepository } from '../users/users.repository.js';

@Injectable()
export class AccountLinker extends OidcAccountResolver {
  constructor(
    private readonly usersRepository: UsersRepository,
    registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerHandler('oidc', this);
  }

  async resolveUser(profile: OidcProfile, _tokens: OAuthTokens, { linkTo }: OidcResolveContext) {
    const linked = await this.usersRepository.findByIdentity(profile.provider, profile.subject);

    // "Connect Google" from the account page: link to the signed-in customer.
    if (linkTo) {
      if (linked && linked.id !== linkTo.id) {
        throw new ConflictException('This Google account belongs to another customer');
      }
      return this.usersRepository.linkIdentity(linkTo.id, profile.provider, profile.subject);
    }

    // A returning Google account: sign in the user it is linked to.
    if (linked) {
      return linked;
    }

    // First visit. Trust only an address Google verified, or anyone could
    // claim any account.
    if (!profile.email || !profile.emailVerified) {
      return null; // 403
    }
    const existing = await this.usersRepository.findByEmail(profile.email);
    if (!existing) {
      const user = await this.usersRepository.create(profile.email, { emailVerified: true });
      return this.usersRepository.linkIdentity(user.id, profile.provider, profile.subject);
    }
    // Link by email only if the account's owner proved the address to us too.
    // Otherwise whoever signed up with it, with a password of their choosing,
    // would share the account with the customer.
    if (!existing.emailVerified) {
      throw new ForbiddenException('Sign in with your password, then connect Google from your account');
    }
    return this.usersRepository.linkIdentity(existing.id, profile.provider, profile.subject);
  }
}

```

通过电子邮件关联需要双方验证地址：

- **Google 必须已验证**（`profile.emailVerified`）。否则，任何人都可以使用客户的地址创建一个 Google 账户，并在商店接管其账户。返回 `null` 会以 403 拒绝登录。
- **商店账户也必须已验证**（`existing.emailVerified`）。否则，有人可以先使用客户的地址和选择的密码注册，并在客户使用 Google 登录后保持访问权限。这称为账户预劫持。使用密码创建的账户在所有者打开 [verification link](/security/authentication#verify-email-addresses) 或 [resets the password](/security/authentication#reset-forgotten-passwords) 之前未经验证。在此之前，它会收到 403 错误，要求客户使用密码登录并从其账户连接 Google。

将 Google 连接到客户已登录的账户完全不需要电子邮件匹配。该包称之为链接流程：Web 应用程序的“使用 Google 登录”按钮指向 `GET /auth/oidc/google/login?link=true`。该包仅对完全已登录的会话启动它，而不是从其他网站的页面启动，后者会收到 403：链接会附加当前浏览器中已登录的任何 Google 账户。在回调时，它会检查同一会话是否仍然有效，然后使用 `linkTo`（已登录用户）调用 `resolveUser()`。解析器将 Google 账户链接到该用户，除非它已属于另一个客户。会话保持不变，浏览器被重定向到 `redirectTo`。

使用 `google()` 预设和 Google 发送回浏览器的 URL 启用 OpenID Connect。`:provider` 代表提供者的名称，因此一个回调路由服务于您添加的每个提供者：

```typescript title="src/app.module.ts"
AuthenticationModule.forRootAsync({
  useFactory: () => ({
    // ...
    oidc: {
      // The callback route of OidcController, registered with Google.
      callbackUrl: `${process.env.APP_URL}/auth/oidc/:provider/callback`,
      providers: {
        google: google({
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
      },
    },
  }),
}),

```

路由归您所有，因此它们位于您的其他路由之下，在您的前缀、版本和节流设置中。`OidcService.start()` 构建重定向到 Google，`finish()` 处理回调；一个控制器暴露这两个：

```typescript title="src/auth/oidc.controller.ts"
import { Controller, Get, Param, Query, Redirect } from '@nestjs/common';
import { OidcService, Public } from '@nestjs/authentication';

@Public()
@Controller('auth/oidc')
export class OidcController {
  constructor(private readonly oidcService: OidcService) {}

  // "Sign in with Google" links here. With ?link=true, "Connect Google"
  // links the Google account to the signed-in customer instead.
  @Get(':provider/login')
  @Redirect()
  login(@Param('provider') provider: string, @Query('redirectTo') redirectTo?: string, @Query('link') link?: string) {
    return this.oidcService.start(provider, { redirectTo, link: link === 'true' });
  }

  // Where Google sends the browser back.
  @Get(':provider/callback')
  @Redirect()
  callback(@Param('provider') provider: string, @Query() query: Record<string, string>) {
    return this.oidcService.finish(provider, query);
  }
}

```

- `GET /auth/oidc/google/login?redirectTo=/orders` 将浏览器重定向到 Google。Web 应用程序的“使用 Google 登录”按钮是一个指向它的纯链接。`start()` 使用带 PKCE 的授权码流程，一个 `state` 和一个 `nonce`。登录交易存储在服务器端，位于 `state` 下，浏览器获得一个秘密，其 SHA-256 哈希是 `state`，存储在名为 `__Host-oidc_tx` 的 `HttpOnly` Cookie 中，有效期 10 分钟。
- `GET /auth/oidc/google/callback` 是 Google 将浏览器重定向回来的地方。`finish()` 检查查询中的 `state` 是否是浏览器 Cookie 中秘密的哈希值（这样即使从日志或浏览器历史记录中读取回调 URL，也无法完成未在当前浏览器中开始的登录），交换代码，根据 Google 公布的密钥验证 ID 令牌的签名，并检查其发行者、受众、过期时间和 nonce。如果无法访问 Google 或返回的端点不是 https，则响应是 502，而不是 401。然后它调用 `resolveUser()`，通过 `SignInService` 为用户登录（这样拥有身份验证器的客户会获得一个待定会话），并返回重定向到 `redirectTo` 或 `/`。仅接受相对路径作为 `redirectTo`，因此登录不能变成开放重定向。
- 两者都通过 Nest 的 HTTP 适配器读取请求并设置其 Cookie，并返回 `@Redirect()` 所期望的内容，因此控制器在 Express 和 Fastify 上都能工作，而无需 `@Req()` 或 `@Res()`。

在 `AuthModule` 中注册控制器和解析器：

```typescript title="src/auth/auth.module.ts"
controllers: [
  // ...
  MfaController,
  OidcController,
],
providers: [
  // ...
  PasswordResetMailer,
  AccountLinker,
],

```

`github()` 预设也以相同方式工作。`microsoft()` 还将您目录的租户 ID 作为其 `tenant` 选项，与 `clientId` 和 `clientSecret` 并列：来自 Microsoft Entra 管理中心概览页的 GUID，例如 `process.env.ENTRA_TENANT_ID`。域名或多租户 `common`、`organizations` 和 `consumers` 在启动时会失败：对于这些情况，Microsoft 会发布一个与请求的不同的发行者，因此每次登录都会失败。将它们添加到 `google` 中的 `providers`，并使用名称替换 `google` 将回调 URL 注册到每一个中。

在多个域名下提供服务的应用程序，例如每个客户一个域名，无法指定单个回调 URL：在一个域名上开始的登录必须返回到该域名。请将请求的函数作为 `callbackUrl` 传递。`start()` 在登录时调用它，`finish()` 在回调时再次调用它，因此必须为两者返回相同的 URL。请将主机与您自己的域名列表进行比较，而不是信任头部，并为它可能返回的每个 URL 注册到每个提供者：

```typescript title="src/app.module.ts"
oidc: {
  callbackUrl: ({ headers }) => {
    const host = CUSTOMER_DOMAINS.find((domain) => domain === headers.host);
    if (!host) {
      throw new NotFoundException();
    }
    return `https://${host}/auth/oidc/:provider/callback`;
  },
  providers: {
    // ...
  },
},

```

该函数也可以是 `async`，用于在您的数据库中查找域名。它抛出的任何内容都是登录的答案，例如上面针对应用程序未服务的域的 404，以及一个非绝对 URL 会因一个命名该函数的错误而导致登录失败。`__Host-oidc_tx` Cookie 属于设置它的域名，因此登录在开始的域名上完成。如果该函数在回调时返回了另一个 URL，提供者将拒绝代码，回调将收到 401。在重写主机的代理后面，请读取它转发的头部，例如 `X-Forwarded-Host`，并且仅来自您信任的代理。

有些应用程序仅在运行时了解其提供者。销售给企业的应用程序可能为每个客户提供自己的 OIDC 客户端，或者允许他们带来自己的身份提供者，该提供者通过管理页面设置并在您的数据库中存储。请将提供者名称的函数作为 `providers` 传递。`start()` 在登录时调用它，`finish()` 在回调时再次调用它。返回提供者的配置，或者对于您不服务的名称返回 `undefined`，这将返回 404：

```typescript title="src/app.module.ts"
AuthenticationModule.forRootAsync({
  imports: [TenantsModule],
  inject: [TenantsRepository],
  useFactory: (tenantsRepository: TenantsRepository) => ({
    // ...
    oidc: {
      callbackUrl: `${process.env.APP_URL}/auth/oidc/:provider/callback`,
      // GET /auth/oidc/acme/login signs in through Acme's own client.
      providers: async (name) => {
        const tenant = await tenantsRepository.findByKey(name);
        return tenant ? { issuer: tenant.issuer, clientId: tenant.clientId, clientSecret: tenant.clientSecret } : undefined;
      },
    },
  }),
}),

```

配置是在回调时再次查找的，而不是与登录一起存储的，因此即使在正在进行的登录中，也会使用您在数据库中轮换的密钥从下一次调用开始使用。该函数返回的每个配置都会经过对象形式在启动时获得的检查：缺少 `clientId` 或缺少 `clientSecret`，除非其 `tokenEndpointAuthMethod` 是 `'none'`，否则会因一个命名该函数的错误而导致登录失败。该函数在每次登录和回调时运行，因此如果查找缓慢，请进行缓存。该包按发行者缓存每个提供者的发现文档和密钥，因此通过同一提供者登录的客户会共享它们。

身份通过 (提供者, 主体) 关联，提供者是名称，因此每个名称必须代表一个提供者的一个客户端。请像上面 `acme` 那样在名称中放入客户信息，而不是为每个客户的提供者使用一个名称，例如 `okta`：两个客户的提供者可以提供相同的主体。当客户带来自己的身份提供者时，还有两点变化：

- **其提供者会认可其喜欢的任何地址。** 它可以将任何地址标记为已验证，包括另一个客户用户的地址。上述解析器通过已验证的电子邮件链接账户。对于客户控制的提供者，仅按电子邮件链接到该客户自己的账户，或者不链接。
- **发行者是用户输入。** 该包从配置命名的 URL 获取发现文档、密钥和令牌，没有任何请求会离开您自己的网络。在存储之前，请将客户输入的发行者与您支持的提供者进行检查。

#### 添加魔术链接登录

魔术链接允许客户从收件箱登录，无需密码。该包创建和检查链接；交付取决于您，通过 `MagicLinkHandler`。存储会像验证链接一样通过电子邮件发送给他们，使用自己的模板和邮件类：

```html
<p><a href="{{ url }}">Sign in to the store</a></p>
<p>The link works once, for 15 minutes. If you didn't ask for it, ignore this email.</p>

```

```typescript title="src/auth/magic-link.mailer.ts"
import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticationRegistry, MagicLinkHandler, type MagicLink } from '@nestjs/authentication';
import { Mailer, type Mailable } from '@nestjs/mail';
import { UsersRepository } from '../users/users.repository.js';

@Injectable()
export class MagicLinkMail implements Mailable<MagicLink> {
  render({ url }: MagicLink) {
    return {
      subject: 'Your sign-in link',
      template: 'magic-link',
      context: { url },
    };
  }
}

@Injectable()
export class MagicLinkMailer extends MagicLinkHandler {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly mailer: Mailer,
    registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerHandler('magicLink', this);
  }

  async send(link: MagicLink) {
    await this.mailer.send(MagicLinkMail, { to: link.email, data: link });
  }

  // Runs when the link is used, which proves the address. The account returned
  // carries its stored `email`, and signs in only if the link went to that address.
  async resolveUser(email: string) {
    const user = await this.usersRepository.findByEmail(email);
    if (!user) {
      // Passwordless sign-up. Return null instead to refuse unknown addresses.
      return this.usersRepository.create(email, { emailVerified: true });
    }
    // A password account whose address nobody confirmed: whoever chose that
    // password may not own the address. Resetting the password proves both.
    if (!user.emailVerified) {
      throw new ForbiddenException('Sign in with your password, or reset it');
    }
    return user;
  }
}

```

启用魔术链接：在 `AuthModule` 中的处理程序，以及选项中链接指向的 URL：

```typescript title="src/auth/auth.module.ts"
providers: [
  // ...
  AccountLinker,
  MagicLinkMailer,
],

```

```typescript title="src/app.module.ts"
AuthenticationModule.forRootAsync({
  useFactory: () => ({
    // ...
    magicLink: { url: `${process.env.APP_URL}/sign-in/magic` },
  }),
}),

```

`MagicLinkService.create()` 生成一个随机的 256 位令牌，有效期 15 分钟，只能使用一次，并将链接传递给您的处理程序。它存储令牌的 SHA-256 哈希值，该哈希值与仅此浏览器交易 Cookie 持有的密钥（见下文）结合，因此从日志中读取或转发的链接不会找到任何内容，即使使用了伪造的 Cookie。使用 `bindToBrowser: false` 时，它只存储令牌的哈希值。该令牌作为 `token` 查询参数添加到 URL 中，否则您的代码永远不会看到它。

将链接指向您 Web 应用的页面，而不是 API。该页面从其 URL 读取令牌并将其 POST 回去。邮件扫描器和链接预览会使用 GET 请求跟踪邮件中的链接，从而在客户点击之前用完令牌。该页面必须与 API 在同一站点：请求链接会设置一个 Cookie，浏览器会随令牌将其传回。

```typescript title="src/auth/magic-link.controller.ts"
import { Body, Controller, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { MagicLinkService, Public } from '@nestjs/authentication';
import { EmailDto } from './auth.dto.js';

@Public()
@Controller('auth/magic-link')
export class MagicLinkController {
  constructor(private readonly magicLinkService: MagicLinkService) {}

  @Post()
  @HttpCode(202)
  async request(@Body() body: EmailDto, @Body('redirectTo') redirectTo?: string) {
    await this.magicLinkService.create(body.email, { redirectTo });
  }

  // Called by the page the link opens, which POSTs the token from its URL.
  @Post('consume')
  @HttpCode(200)
  async consume(@Body('token') token: string) {
    // A link opened in another browser throws MagicLinkError, which the module
    // answers: a 401 telling the customer to open it where they asked for it.
    const result = await this.magicLinkService.consume(token);
    if (!result) {
      throw new UnauthorizedException('Invalid or expired link');
    }
    return { redirectTo: result.redirectTo ?? '/', mfaRequired: result.session.mfa === 'pending' };
  }
}

```

- 请求路由会返回 202，无论地址是否有账户，账户仅在链接被使用后才创建。从其他站点页面发出的请求会收到 403，类似于登录：否则该页面可以为链接到其作者地址设置此浏览器的交易 Cookie，然后让客户打开它（登录 CSRF）。
- `consume()` 消耗令牌，调用 `resolveUser()`，并通过 `SignInService` 为用户登录，后者设置了 Cookie，因此仍然适用双因素认证。`resolveUser()` 返回带有其存储的 `email` 的账户，并且只有当链接发送到的地址与该地址匹配（经过修剪、小写化和 Unicode NFC 比较）时，链接才会登录该账户。忽略重音或点的查找（如 MySQL 的默认排序规则）不能将一个邮箱分配给另一个客户的账户：`consume()` 返回 `null`。
- 链接仅在请求它的浏览器中有效。`create()` 设置一个交易 Cookie，`__Host-magic_link_tx`，`consume()` 在查找任何内容之前拒绝没有该 Cookie 的令牌：它抛出一个 `MagicLinkError`，模块以 401 响应，其 `error` 是 `not_this_browser`，消息告知客户在请求它的浏览器中打开最新链接，或在此处请求新链接。否则，任何人都可以请求其自己的地址的链接，并让客户打开它，这将使客户的浏览器登录到攻击者的账户（登录 CSRF）。被拒绝的链接在请求它的浏览器中保持有效，并且响应不会透露任何关于令牌的信息，因为伪造的令牌也会得到相同的响应。该 Cookie 保留了浏览器请求的最近五个链接，因此点击“重新发送”然后打开第一封邮件的客户仍然已登录；早于这五个的链接将获得相同的 401。因此，在笔记本电脑上请求链接并在手机上打开邮件的客户将被告知在笔记本电脑上打开，或在手机上请求新链接，然后该链接在手机上有效；一个更希望链接本身在手机上生效的应用程序将在 `magicLink` 选项中设置 `bindToBrowser: false`。未知的、已使用和已过期的链接，以及处理程序拒绝的地址，都会获得控制器的一个通用响应：`consume()` 对所有这些返回 `null`，只有 `magic-link-refused` 事件会说明是哪一个。
- 使用链接证明了地址，因此由链接创建的账户已验证。使用密码创建的账户不同，但其地址未经验证：链接证明了谁现在拥有该地址，而不是谁选择了密码，因此处理程序会以 403 拒绝它，而不是将其预先劫持的账户交给其所有者。一旦所有者使用了 [verification link](/security/authentication#verify-email-addresses) 或 [reset the password](/security/authentication#reset-forgotten-passwords)，魔术链接对该账户也有效。
- `redirectTo` 仅在是相对路径（例如 `/orders`）时才能在往返中存活。

使用 Zod 模式：

```typescript title="src/auth/magic-link.controller.ts"
import { emailSchema, type EmailDto } from './auth.schemas.js';
// ...
@Post()
@HttpCode(202)
async request(@Body({ schema: emailSchema }) body: EmailDto, @Body('redirectTo') redirectTo?: string) {
  // ...
}

```

注册控制器：

```typescript title="src/auth/auth.module.ts"
controllers: [
  // ...
  OidcController,
  MagicLinkController,
],

```

#### 让客户管理会话

会话存储在服务器上，因此客户可以看到他们登录了哪里，并结束任何会话。为了区分这些会话，请记录每个会话所属的浏览器。`session.metadata` 在客户使用密码、Google 或魔术链接登录时运行，其返回值与新会话一起存储：

```typescript title="src/app.module.ts"
AuthenticationModule.forRootAsync({
  useFactory: () => ({
    session: {
      absoluteTtl: '14d', // signed out after 14 days, however active
      idleTtl: '3d', // or after 3 days without a request
      // Stored with every new session, whichever way the customer signed in.
      metadata: (request) => ({ userAgent: request.headers['user-agent'] }),
    },
    // ...
  }),
}),

```

然后列出会话并结束它们：

```typescript title="src/auth/sessions.controller.ts"
import { Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, UnauthorizedException } from '@nestjs/common';
import {
  CurrentSession,
  CurrentUser,
  Public,
  SessionService,
  SignInService,
  type SessionRecord,
} from '@nestjs/authentication';

@Controller('auth')
export class SessionsController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly signInService: SignInService,
  ) {}

  @Get('sessions')
  async list(@CurrentUser('id') userId: string, @CurrentSession() current: SessionRecord) {
    const sessions = await this.sessionService.list(userId);
    return sessions.map(({ id, createdAt, lastActiveAt, metadata }) => ({
      id,
      createdAt,
      lastActiveAt,
      userAgent: metadata?.userAgent ?? null,
      current: id === current.id,
    }));
  }

  // revoke() only ends a session of this user: another customer's id is a 404.
  @Delete('sessions/:id')
  @HttpCode(204)
  async revoke(@CurrentUser('id') userId: string, @Param('id') id: string) {
    if (!(await this.sessionService.revoke(id, { userId }))) {
      throw new NotFoundException();
    }
  }

  // Public, so that a session still waiting for its second factor can sign
  // out too. signOut() ends the session in this browser's cookie.
  @Public()
  @Post('sign-out')
  @HttpCode(204)
  async signOut() {
    if (!(await this.signInService.signOut())) {
      throw new UnauthorizedException(); // no session cookie, e.g. a bearer token
    }
  }

  @Post('sign-out-everywhere')
  @HttpCode(204)
  async signOutEverywhere(@CurrentUser('id') userId: string) {
    await this.signInService.signOutEverywhere(userId);
  }
}

```

- 会话 ID 是 Cookie 令牌的 SHA-256 哈希值。将其显示给所有者是安全的，因为不能从一个 Cookie 推导出另一个。`revoke()` 接收用户和 ID，并且只结束属于他们的会话，因此 URL 中的 ID 不能结束另一个客户的会话。
- `sign-out` 是 `@Public()`，类似于 [two-factor authentication](/security/authentication#add-two-factor-authentication) 中的 `verify`，因此从未完成第二因子的客户仍可以注销。`signOut()` 在此浏览器 Cookie 中结束会话并清除 Cookie。如果没有会话，它返回 `false`，并且路由返回 401：这里的 bearer 令牌不会注销任何内容。
- `signOutEverywhere()` 结束所有会话，并在应用程序颁发时，结束用户的每个刷新令牌，并清除此浏览器的 Cookie。已颁发的访问令牌在过期前保持有效，这就是它们只持续 15 分钟的原因。

移动应用通过撤销其刷新令牌注销一个设备。向 `TokensController` 添加一个路由。`TokenService.revoke()` 结束令牌的家族：令牌、其前驱和其后继：

```typescript title="src/auth/tokens.controller.ts"
// Signs the mobile app out on this device. Unknown tokens get the same
// answer, as in RFC 7009.
@Post('revoke')
@HttpCode(204)
async revoke(@Body('refreshToken') refreshToken: string) {
  await this.tokenService.revoke(refreshToken);
}

```

注册控制器。这是教程中所有凭证提供者和处理程序的完成模块：

```typescript title="src/auth/auth.module.ts"
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { AccountLinker } from './account-linker.js';
import { AuthController } from './auth.controller.js';
import { CredentialsService } from './credentials.service.js';
import { EmailVerificationController } from './email-verification.controller.js';
import { EmailVerificationMailer } from './email-verification.mailer.js';
import { JwtAuth } from './jwt-auth.provider.js';
import { MagicLinkController } from './magic-link.controller.js';
import { MagicLinkMailer } from './magic-link.mailer.js';
import { MfaController } from './mfa.controller.js';
import { OidcController } from './oidc.controller.js';
import { PasswordResetController } from './password-reset.controller.js';
import { PasswordResetMailer } from './password-reset.mailer.js';
import { SessionAuth } from './session-auth.provider.js';
import { SessionsController } from './sessions.controller.js';
import { TokensController } from './tokens.controller.js';

@Module({
  imports: [UsersModule],
  controllers: [
    AuthController,
    EmailVerificationController,
    PasswordResetController,
    TokensController,
    MfaController,
    OidcController,
    MagicLinkController,
    SessionsController,
  ],
  providers: [
    SessionAuth,
    JwtAuth,
    CredentialsService,
    EmailVerificationMailer,
    PasswordResetMailer,
    AccountLinker,
    MagicLinkMailer,
  ],
})
export class AuthModule {}

```

每当权限发生变化时（例如密码更改或客户成为工作人员后），都轮换会话：`SignInService.rotateSession()` 为此浏览器的会话分配一个新 ID 并设置新 Cookie；`completeMfa()` 已经执行此操作。当浏览器没有会话或在此期间丢失会话时，它解析 `null`，并且不设置 Cookie：全局注销、密码重置或先轮换的另一个请求。

#### 速率限制登录

`@nestjs/authentication` 不限制请求速率。这是 `@nestjs/throttler` 的工作，这是一个单独的包：

```bash
$ npm i --save @nestjs/throttler

```

仅按 IP 地址限制是不够精细的，因为同一网络地址后的客户会共享该限制，因此无法设置足够低的限制来阻止一个客户端猜测一个账户。请使用两个 [throttler definitions](/security/rate-limiting#多重限流器定义)；每个请求都计入两者。`default` 按 IP 地址在每个路由上计数。`account` 按电子邮件和 IP 地址在请求体中指定账户的任何位置计数：

```typescript title="src/auth/account-email.ts"
/** The address the request body names, trimmed, lowercased and in Unicode NFC, or `''`. */
export function accountEmail(req: { body?: { email?: unknown } }): string {
  const email = req.body?.email;
  return typeof email === 'string' ? email.trim().normalize('NFC').toLowerCase() : '';
}

```

将 `ThrottlerModule` 与两个定义一起注册，并将 `ThrottlerGuard` 作为全局守卫：

```typescript title="src/app.module.ts"
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, minutes, normalizeIp } from '@nestjs/throttler';
import { accountEmail } from './auth/account-email.js';
// ...

@Module({
  imports: [
    ThrottlerModule.forRoot([
      // Per IP address, on every route: 100 requests a minute.
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
    // ...
  ],
  providers: [
    { provide: APP_PIPE, useValue: new ValidationPipe({ whitelist: true }) },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

```

该守卫在验证之前运行，因此 `accountEmail()` 检查 `email` 是否为字符串。`normalizeIp()` 按其 `/64` 前缀分组 IPv6 地址，就像节流器自身的跟踪器所做的那样，这样客户端就不能为其子网中的每个地址获得一个新的计数器。

该守卫在根模块中注册，因此它在认证守卫之前运行。全局守卫按模块顺序运行，根模块排在最前面。这意味着猜测的 bearer token 也会计入限制，而不仅仅是返回 401 错误。

最后，收紧检查密码或发送电子邮件的路由的限制。每个 `@Throttle()` 按路由计数，并设置两个限制：按 IP 地址和按账户：

```typescript title="src/auth/auth.controller.ts"
@Throttle({
  default: { limit: 30, ttl: minutes(15) },
  account: { limit: 5, ttl: minutes(15) },
})
@Post('sign-in')
// ...

@SkipThrottle({ account: true })
@Throttle({ default: { limit: 10, ttl: hours(1) } })
@Post('sign-up')

```

```typescript title="src/auth/tokens.controller.ts"
@Throttle({
  default: { limit: 30, ttl: minutes(15) },
  account: { limit: 5, ttl: minutes(15) },
})
@Post()

```

```typescript title="src/auth/magic-link.controller.ts"
@Throttle({
  default: { limit: 10, ttl: minutes(15) },
  account: { limit: 3, ttl: minutes(15) },
})
@Post()

```

```typescript title="src/auth/password-reset.controller.ts"
import { accountEmail } from './account-email.js';
// ...

@Throttle({
  default: { limit: 10, ttl: minutes(15) },
  // Per address, from any IP address.
  account: { limit: 3, ttl: minutes(15), getTracker: accountEmail },
})
@Post('forgot')

```

`Throttle`、`SkipThrottle`、`minutes` 和 `hours` 从 `@nestjs/throttler` 导入。按 IP 地址的限制是一个判断，因为办公室和移动运营商会将许多客户置于一个地址后。`account` 限制适用于请求体包含 `email` 的每个路由，限制为每 15 分钟 5 个请求，除非该路由设置了自己的限制；`@SkipThrottle({ account: true })` 会排除某个路由。

- `forgot` 按地址计数，无论 IP 地址如何，这样任何人都不能从一个 IP 地址或多个 IP 地址向客户的收件箱中填充重置链接。消耗该限制的人只会延迟客户自己的请求：他们引起的链接已发送到客户，任何一个都有效。
- 魔术链接请求将电子邮件和 IP 地址绑定在一起。链接仅在请求它的浏览器中有效，因此仅按地址的限制会允许任何人从自己的浏览器使用客户的链接，从而阻止客户登录。
- 注册时会为新地址命名，因此会跳过 `account` 限制，而按 IP 地址的限制会起到作用。否则，几次密码验证失败的客户将被拒绝。

双因素代码不需要单独的节流：该包在任何 IP 地址、路由或传输中，在 5 次失败后锁定账户代码。`POST /auth/password/reset` 也是如此：猜测的 token 消耗一次查找，而其组合有 2^256 种。

> info **提示** 在负载均衡器或反向代理后，每个请求似乎都来自代理。启用 `trust proxy`，如节流器 [Proxies](/security/rate-limiting#代理) 部分所述，以便跟踪器可以看到客户端地址。

#### 将会话和 token 保存在数据库中

该包存储的所有内容到目前为止都存在于内存中：会话、刷新令牌、认证器和恢复代码，以及待处理的链接和登录。重启时会丢失，并且 API 的第二个实例看不到它。该包本身不与您的数据库通信。它描述了其存储的内容为六个接口：`SessionStore`、`RefreshTokenStore`、`MfaStore`、`MagicLinkStore`、`OidcStateStore` 和 `EmailTokenStore`，您的应用程序使用已有的数据库访问来实现它们，然后注册该实现。

此步骤展示了两次实现，用于该系列教程使用的两个 ORM：首先是 Drizzle（教程的路径），然后在步骤末尾的“使用 TypeORM”下，为 ORM 是 TypeORM 的应用程序使用相同的存储。选择其中一个。

该存储使用 Drizzle 通过 [`@nestjs/drizzle`](https://docs.nestjs.com/data/drizzle) 与 PostgreSQL 配合使用，此步骤假设您的应用程序已具备此功能。`DrizzleModule` 从数据库 URL 打开一个 `pg` 池并提供 Drizzle 数据库，并在应用程序关闭时关闭该池，前提是该包已完成其仍在进行中的工作（例如，一个重置链接正在发送中）。将 URL 添加到 `.env`，并在 `AppModule` 中注册模块：

```bash
DATABASE_URL=postgres://localhost:5432/store

```

```typescript title="src/app.module.ts"
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
// ...
@Module({
  imports: [
    // The Drizzle database, on a pg pool the module closes when the application shuts down.
    DrizzleModule.forRootAsync({
      useFactory: () => ({ drizzle, connection: process.env.DATABASE_URL! }),
    }),
    // ...
  ],
})
export class AppModule {}

```

从表开始。它们是应用程序模式中的普通 Drizzle 表，与您自己的表相邻：

```typescript title="src/database/schema.ts"
// The store's Drizzle tables. drizzle-kit generates the migrations from this file.
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

// Authentication state: what DrizzleAuthenticationStore (src/auth) keeps for @nestjs/authentication.
// Tokens, links and sessions are stored by their SHA-256; TOTP secrets arrive encrypted.

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    createdAt: at('created_at').notNull(),
    expiresAt: at('expires_at').notNull(),
    lastActiveAt: at('last_active_at').notNull(),
    mfa: text('mfa', { enum: ['pending', 'verified'] }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  (table) => [
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
);

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
    // A family is revoked when any of its tokens is: that covers a successor saved after the revocation.
    revoked: boolean('revoked').notNull().default(false),
    claims: jsonb('claims').$type<Record<string, unknown>>(),
  },
  (table) => [
    index('refresh_tokens_family_id_idx').on(table.familyId),
    index('refresh_tokens_user_id_idx').on(table.userId),
    index('refresh_tokens_family_expires_at_idx').on(table.familyExpiresAt),
  ],
);

export const mfaAuthenticators = pgTable('mfa_authenticators', {
  userId: text('user_id').primaryKey(),
  secret: text('secret').notNull(),
  confirmed: boolean('confirmed').notNull(),
  pendingSecret: text('pending_secret'),
  lastUsedStep: integer('last_used_step'),
});

export const mfaRecoveryCodes = pgTable(
  'mfa_recovery_codes',
  {
    userId: text('user_id').notNull(),
    codeHash: text('code_hash').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.codeHash] })],
);

export const mfaFailures = pgTable(
  'mfa_failures',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    userId: text('user_id').notNull(),
    failedAt: at('failed_at').notNull(),
  },
  (table) => [
    index('mfa_failures_user_id_failed_at_idx').on(table.userId, table.failedAt),
    index('mfa_failures_failed_at_idx').on(table.failedAt),
  ],
);

export const magicLinks = pgTable(
  'magic_links',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    createdAt: at('created_at').notNull(),
    expiresAt: at('expires_at').notNull(),
    redirectTo: text('redirect_to'),
  },
  (table) => [index('magic_links_expires_at_idx').on(table.expiresAt)],
);

export const oidcLogins = pgTable(
  'oidc_logins',
  {
    state: text('state').primaryKey(),
    provider: text('provider').notNull(),
    codeVerifier: text('code_verifier').notNull(),
    nonce: text('nonce'),
    redirectTo: text('redirect_to'),
    // Set for "connect your Google account" from a signed-in session.
    linkUserId: text('link_user_id'),
    linkSessionId: text('link_session_id'),
    createdAt: at('created_at').notNull(),
    expiresAt: at('expires_at').notNull(),
  },
  (table) => [index('oidc_logins_expires_at_idx').on(table.expiresAt)],
);

export const emailTokens = pgTable(
  'email_tokens',
  {
    id: text('id').primaryKey(),
    purpose: text('purpose', { enum: ['password-reset', 'email-verification'] }).notNull(),
    userId: text('user_id').notNull(),
    email: text('email').notNull(),
    fingerprint: text('fingerprint'),
    createdAt: at('created_at').notNull(),
    expiresAt: at('expires_at').notNull(),
  },
  (table) => [
    index('email_tokens_user_id_purpose_idx').on(table.userId, table.purpose),
    index('email_tokens_expires_at_idx').on(table.expiresAt),
  ],
);

```

- 会话、令牌和链接以 Cookie 和电子邮件值的 SHA-256 哈希形式存储；TOTP 密钥以您的密钥加密到达（参见 [two-factor authentication](/security/authentication#add-two-factor-authentication)）；恢复代码以 scrypt 哈希到达。这些表中的任何内容都不能被重放。
- `revoked` 位于每个刷新令牌上，而不是在家族表中：当其任何令牌被撤销时，该家族即被视为已撤销。这涵盖了在撤销后通过丢失竞速的刷新保存的令牌。

从模式生成迁移，并应用它：

```bash
$ npx drizzle-kit generate --name=authentication
No config path provided, using default 'drizzle.config.ts'
Reading config file '/store/drizzle.config.ts'
8 tables
email_tokens 7 columns 2 indexes 0 fks
magic_links 5 columns 1 indexes 0 fks
mfa_authenticators 5 columns 0 indexes 0 fks
mfa_failures 3 columns 2 indexes 0 fks
mfa_recovery_codes 2 columns 0 indexes 0 fks
oidc_logins 9 columns 1 indexes 0 fks
refresh_tokens 9 columns 3 indexes 0 fks
sessions 7 columns 2 indexes 0 fks

[✓] Your SQL migration file ➜ drizzle/0000_authentication.sql 🚀
$ npx drizzle-kit migrate
No config path provided, using default 'drizzle.config.ts'
Reading config file '/store/drizzle.config.ts'
Using 'pg' driver for database querying
[✓] migrations applied successfully!

```

现在是存储。它像任何其他提供者一样：它注入 Drizzle 数据库，使用 Drizzle 的查询构建器实现六个接口，并通过其构造函数向该包的 `AuthenticationStorage` 注册自身：

```typescript title="src/auth/drizzle-authentication.store.ts"
import { Injectable } from '@nestjs/common';
import {
  AuthenticationStorage,
  type EmailTokenPurpose,
  type EmailTokenRecord,
  type EmailTokenStore,
  type MagicLinkRecord,
  type MagicLinkStore,
  type MfaStore,
  type OidcStateStore,
  type OidcTransaction,
  type RefreshTokenRecord,
  type RefreshTokenStore,
  type SessionRecord,
  type SessionStore,
  type TotpRecord,
} from '@nestjs/authentication';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, desc, eq, gt, isNull, lt, lte, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  emailTokens,
  magicLinks,
  mfaAuthenticators,
  mfaFailures,
  mfaRecoveryCodes,
  oidcLogins,
  refreshTokens,
  sessions,
} from '../database/schema.js';

/**
 * Keeps sessions, refresh tokens, authenticators and pending links in
 * PostgreSQL, through Drizzle. Every method that decides whether something
 * works once is a single conditional statement, so the guarantees hold with
 * any number of API instances.
 */
@Injectable()
export class DrizzleAuthenticationStore
  implements SessionStore, RefreshTokenStore, MfaStore, MagicLinkStore, OidcStateStore, EmailTokenStore
{
  /** Pending links and logins kept per table: anyone can create them. */
  protected readonly maxPending: number = 100_000;

  constructor(
    @InjectDrizzle() private readonly db: NodePgDatabase,
    storage: AuthenticationStorage,
  ) {
    storage.registerSource({
      sessions: this,
      refreshTokens: this,
      mfa: this,
      magicLinks: this,
      oidcStates: this,
      emailTokens: this,
    });
  }

  // Sessions

  async getSession(id: string): Promise<SessionRecord | undefined> {
    const [row] = await this.db.select().from(sessions).where(eq(sessions.id, id));
    return row && withoutNulls(row);
  }

  async createSession(record: SessionRecord): Promise<void> {
    await this.db.insert(sessions).values(record);
    await this.db.delete(sessions).where(lte(sessions.expiresAt, record.createdAt));
  }

  async touchSession(id: string, lastActiveAt: Date): Promise<void> {
    // Conditional: a session deleted by a sign-out stays deleted.
    await this.db
      .update(sessions)
      .set({ lastActiveAt })
      .where(and(eq(sessions.id, id), lt(sessions.lastActiveAt, lastActiveAt)));
  }

  // Whether this call deleted it: of two rotations of a session, or a rotation and a sign-out, one wins.
  async deleteSession(id: string): Promise<boolean> {
    const deleted = await this.db.delete(sessions).where(eq(sessions.id, id)).returning({ id: sessions.id });
    return deleted.length > 0;
  }

  async listUserSessions(userId: string): Promise<SessionRecord[]> {
    const rows = await this.db.select().from(sessions).where(eq(sessions.userId, userId));
    return rows.map(withoutNulls);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.userId, userId));
  }

  // Refresh tokens

  async getRefreshToken(id: string): Promise<RefreshTokenRecord | undefined> {
    const [row] = await this.db.select().from(refreshTokens).where(eq(refreshTokens.id, id));
    if (!row) {
      return undefined;
    }
    const { revoked: _, ...token } = row;
    return withoutNulls(token);
  }

  async saveRefreshToken(record: RefreshTokenRecord): Promise<void> {
    await this.db.insert(refreshTokens).values(record);
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

  // Authenticators, recovery codes and failed attempts

  async getTotp(userId: string): Promise<TotpRecord | undefined> {
    const [row] = await this.db.select().from(mfaAuthenticators).where(eq(mfaAuthenticators.userId, userId));
    if (!row) {
      return undefined;
    }
    const { userId: _, ...totp } = row;
    return withoutNulls(totp);
  }

  async saveTotp(userId: string, record: TotpRecord | null): Promise<void> {
    if (!record) {
      await this.db.delete(mfaAuthenticators).where(eq(mfaAuthenticators.userId, userId));
      return;
    }
    const values = { secret: record.secret, confirmed: record.confirmed, pendingSecret: record.pendingSecret ?? null };
    await this.db
      .insert(mfaAuthenticators)
      .values({ userId, ...values, lastUsedStep: record.lastUsedStep })
      .onConflictDoUpdate({
        target: mfaAuthenticators.userId,
        // Never lower the claimed step: the record may have been read before a claim.
        set: { ...values, lastUsedStep: sql`greatest(${mfaAuthenticators.lastUsedStep}, excluded.last_used_step)` },
      });
  }

  async claimTotpStep(userId: string, step: number): Promise<boolean> {
    // Conditional: a code's time step is accepted once.
    const claimed = await this.db
      .update(mfaAuthenticators)
      .set({ lastUsedStep: step })
      .where(
        and(
          eq(mfaAuthenticators.userId, userId),
          or(isNull(mfaAuthenticators.lastUsedStep), lt(mfaAuthenticators.lastUsedStep, step)),
        ),
      )
      .returning({ userId: mfaAuthenticators.userId });
    return claimed.length === 1;
  }

  async saveRecoveryCodes(userId: string, hashes: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
      if (hashes.length > 0) {
        await tx.insert(mfaRecoveryCodes).values([...new Set(hashes)].map((codeHash) => ({ userId, codeHash })));
      }
    });
  }

  async consumeRecoveryCode(userId: string, hash: string): Promise<boolean> {
    // Conditional: of two requests with the same code, one deletes the row.
    const consumed = await this.db
      .delete(mfaRecoveryCodes)
      .where(and(eq(mfaRecoveryCodes.userId, userId), eq(mfaRecoveryCodes.codeHash, hash)))
      .returning({ userId: mfaRecoveryCodes.userId });
    return consumed.length === 1;
  }

  countRecoveryCodes(userId: string): Promise<number> {
    return this.db.$count(mfaRecoveryCodes, eq(mfaRecoveryCodes.userId, userId));
  }

  async recordMfaFailure(userId: string, windowMs: number, now: number): Promise<number> {
    // Insert, then count, each committed on its own (no transaction): every attempt
    // counts itself and all those recorded before it.
    await this.db.insert(mfaFailures).values({ userId, failedAt: new Date(now) });
    const failures = await this.countMfaFailures(userId, windowMs, now);
    await this.db.delete(mfaFailures).where(lte(mfaFailures.failedAt, new Date(now - windowMs)));
    return failures;
  }

  countMfaFailures(userId: string, windowMs: number, now: number): Promise<number> {
    return this.db.$count(
      mfaFailures,
      and(eq(mfaFailures.userId, userId), gt(mfaFailures.failedAt, new Date(now - windowMs))),
    );
  }

  async clearMfaFailures(userId: string): Promise<void> {
    await this.db.delete(mfaFailures).where(eq(mfaFailures.userId, userId));
  }

  // Magic links

  async saveMagicLink(record: MagicLinkRecord): Promise<void> {
    await this.db.insert(magicLinks).values(record);
    await this.trim(magicLinks, record.createdAt);
  }

  async consumeMagicLink(id: string): Promise<MagicLinkRecord | undefined> {
    // DELETE … RETURNING: of two requests with the same link, one gets the row.
    const [row] = await this.db.delete(magicLinks).where(eq(magicLinks.id, id)).returning();
    return row && withoutNulls(row);
  }

  // Sign-ins with Google in progress

  async saveOidcState({ link, ...login }: OidcTransaction): Promise<void> {
    await this.db.insert(oidcLogins).values({ ...login, linkUserId: link?.userId, linkSessionId: link?.sessionId });
    await this.trim(oidcLogins, login.createdAt);
  }

  async consumeOidcState(state: string): Promise<OidcTransaction | undefined> {
    const [row] = await this.db.delete(oidcLogins).where(eq(oidcLogins.state, state)).returning();
    if (!row) {
      return undefined;
    }
    const { linkUserId, linkSessionId, ...login } = withoutNulls(row);
    return linkUserId && linkSessionId ? { ...login, link: { userId: linkUserId, sessionId: linkSessionId } } : login;
  }

  // Password reset and email verification links

  async saveEmailToken(record: EmailTokenRecord): Promise<void> {
    await this.db.insert(emailTokens).values(record);
    await this.trim(emailTokens, record.createdAt);
  }

  async consumeEmailToken(id: string, purpose: EmailTokenPurpose): Promise<EmailTokenRecord | undefined> {
    const [row] = await this.db
      .delete(emailTokens)
      .where(and(eq(emailTokens.id, id), eq(emailTokens.purpose, purpose)))
      .returning();
    return row && withoutNulls(row);
  }

  async deleteUserEmailTokens(userId: string, purpose: EmailTokenPurpose): Promise<void> {
    await this.db.delete(emailTokens).where(and(eq(emailTokens.userId, userId), eq(emailTokens.purpose, purpose)));
  }

  /** Deletes what expired, and past `maxPending`, what expires first. */
  private async trim(table: typeof magicLinks | typeof oidcLogins | typeof emailTokens, now: Date) {
    await this.db.delete(table).where(lte(table.expiresAt, now));
    const [cutoff] = await this.db
      .select({ expiresAt: table.expiresAt })
      .from(table)
      .orderBy(desc(table.expiresAt))
      .limit(1)
      .offset(this.maxPending);
    if (cutoff) {
      await this.db.delete(table).where(lte(table.expiresAt, cutoff.expiresAt));
    }
  }
}

/** A row without its NULL columns: the package's records leave optional fields out. */
type WithoutNulls<T> = { [K in keyof T as null extends T[K] ? never : K]: T[K] } & {
  [K in keyof T as null extends T[K] ? K : never]?: Exclude<T[K], null>;
};

function withoutNulls<T extends object>(row: T): WithoutNulls<T> {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null)) as WithoutNulls<T>;
}

```

将其添加到 `AuthModule` 的提供者中，就像凭证提供者和处理器一样。在构造函数中注册就足够了：Nest 在启动时创建提供者，在第一个请求之前。

```typescript title="src/auth/auth.module.ts"
import { DrizzleAuthenticationStore } from './drizzle-authentication.store.js';
// ...
providers: [
  // ...
  MagicLinkMailer,
  DrizzleAuthenticationStore,
],

```

启动时，在提供者链和处理程序之后，模块会记录每种状态的存储位置：

```bash
LOG [AuthenticationModule] AuthenticationRegistry: providers SessionAuth, JwtAuth; handlers EmailVerificationMailer (emailVerification), PasswordResetMailer (passwordReset), MagicLinkMailer (magicLink), AccountLinker (oidc)
LOG [AuthenticationModule] AuthenticationStorage: DrizzleAuthenticationStore

```

- **一个提供者或多个。** `registerSource()` 按名称接收接口，因此一个类可以实现所有六个，如此处所示，或者多个类可以拆分它们：一个 `RedisSessionStore` 注册 `sessions`，而该类注册其余五个。对同一名称的第二个存储在启动时失败，并命名这两个类。
- **某些方法必须是单个语句。** 决定某事只执行一次的逻辑是一个单一的条件语句，绝不是先读取后写入。`touchSession()` 只更新仍然存在的会话，因此一个请求与登出竞争时不会恢复会话。`deleteSession()` 解析是否删除了行，因此对于一个会话的两次轮换，或一次轮换和一次登出，恰好有一个获胜。`markRefreshTokenUsed()`、`claimTotpStep()` 和 `consumeRecoveryCode()` 计数它们更改的行，这三个 `consume` 方法是一个 `DELETE … RETURNING`。`saveTotp()` 与 `greatest()` 保留更大的时间步长，这是存储手动写入 SQL 的唯一地方。`recordMfaFailure()` 先插入后计数，不在事务中，因此并行猜测的突发无法全部看到低计数。存储接口的每个方法都在其文档注释中说明了其规则以及它防止的竞争。
- **记录活动是尽力而为的。** 如果 `touchSession()` 失败（锁超时、只读副本），请求和登出仍然成功。会话被保留，`lastActiveAt` 不移动，除非后续请求记录活动，否则会话在之前的截止日期时处于空闲状态。每次失败都会发出一个 `session-touch-failed` 事件；日志在失败开始时记录一个警告，在持续期间不记录任何内容，在下一次成功触达时记录一行及其计数。
- **表保持有界。** 任何人都可以请求一个魔术链接或重置链接，因此每次保存都会删除已过期的记录，并且在表中超过 100,000 条待处理记录时，先过期的记录会被删除。已过期的会话和刷新令牌家族会在写入新记录时被清除。
- **密码重置和电子邮件验证保持不变地工作。** 它们的链接现在是 `email_tokens` 中的行，并且它们的邮件发送仍然通过 `@nestjs/mail` 发送。
- **生产环境拒绝内存。** 当 `NODE_ENV` 设置为 `production` 时，如果配置的功能使用的存储未注册，模块将不会启动，并且会命名需要实现的接口。每个功能只需要它使用的存储：`MfaStore` 仅使用 `mfa`，而当刷新令牌开启时，`RefreshTokenStore` 仅使用 `accessToken`。[The store contract](/security/authentication#the-store-contract) 列出了它们。一个未被任何配置功能使用的存储会在第一次读取时失败。模块选项中的 `allowInMemoryStorage: true` 无论如何都在内存中运行，但每次重启或部署都会使所有用户登出并忘记已注册的认证器，实例之间互不共享任何信息。

如果您的用户位于同一数据库中，`getSession()` 可以在同一个查询中读取每个会话的用户，并将其作为 `extra` 传递，该 `SessionAuth` 的 `validate()` 接收：每个请求一次读取而不是两次。使用 `sessionExtra` 键放在 `user` 旁边（`users` 和 `toUser()` 分别代表您的表和排除密码哈希的映射）：

```typescript title="src/auth/auth-types.ts"
import type { User } from '../users/user.js';

declare module '@nestjs/authentication' {
  interface AuthenticationTypes {
    user: User;
    sessionExtra: { user: User };
  }
}

```

```typescript title="src/auth/drizzle-authentication.store.ts"
async getSession(id: string): Promise<SessionRecord | undefined> {
  // Joined fresh on every read. A session whose user is gone reads as unknown.
  const [row] = await this.db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id));
  return row && { ...withoutNulls(row.session), extra: { user: toUser(row.user) } };
}

```

```typescript title="src/auth/session-auth.provider.ts"
validate(session: SessionRecord) {
  return session.extra?.user ?? null;
}

```

`extra` 绝不存储：`createSession()` 从未接收它，轮换时会排除它，`listUserSessions()` 不应设置它。它也不会暴露：`@CurrentSession()`、`request.session` 和 `AuthenticationContext.session` 在不包含它的情况下携带会话，因此处理程序所需的任何内容都包含在用户 `validate()` 返回中。不要将用户复制到会话行，而是进行连接：当用户更改时，复制的数据会过期。

该包以测试的形式提供其规则。`authenticationStoreContract()` 从 `@nestjs/authentication/testing` 返回可与任何测试运行器配合工作的测试用例，而 `concurrent: true` 添加了竞争条件：一个令牌的并行刷新、一个代码或链接的并行使用、失败代码的突发、一个登出与请求竞争、一个会话的并行删除，以及一次轮换与登出或另一次轮换竞争。在 PGlite 上运行它们，在调用真正竞争的地方在 PostgreSQL 上运行：

```typescript title="test/drizzle-authentication.store.e2e-spec.ts"
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { AuthenticationStorage } from '@nestjs/authentication';
import { authenticationStoreContract } from '@nestjs/authentication/testing';
import { sql } from 'drizzle-orm';
import { drizzle as nodePostgres, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate as migrateNodePostgres } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as pglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { Pool } from 'pg';
import { DrizzleAuthenticationStore } from '../src/auth/drizzle-authentication.store.js';
import { startPostgres } from './support/postgres.js';

type Database = NodePgDatabase;

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

/** The store with a cap of 3 pending entries per table, so the suite can check it. */
class CappedStore extends DrizzleAuthenticationStore {
  protected override readonly maxPending = 3;
}

/** The store on empty tables, registered nowhere: the suite builds its own registry. */
async function emptyStore(db: Database) {
  await db.execute(
    sql`TRUNCATE sessions, refresh_tokens, mfa_authenticators, mfa_recovery_codes, mfa_failures, magic_links, oidc_logins, email_tokens`,
  );
  const store = new CappedStore(db, new AuthenticationStorage());
  return { sessions: store, refreshTokens: store, mfa: store, magicLinks: store, oidcStates: store, emailTokens: store };
}

describe('DrizzleAuthenticationStore on PGlite', () => {
  const client = new PGlite();
  const db = pglite({ client }) as unknown as Database;
  beforeAll(() => migratePglite(pglite({ client }), { migrationsFolder }));
  afterAll(() => client.close());

  for (const c of authenticationStoreContract(() => emptyStore(db), { concurrent: true, maxPending: 3 })) {
    it(c.name, c.run);
  }
});

// PostgreSQL on a pool of connections: the concurrency cases race for real.
const { postgres, reason } = await startPostgres();

describe.skipIf(!postgres)(`DrizzleAuthenticationStore on PostgreSQL${reason ? ` (skipped: ${reason})` : ''}`, () => {
  let pool: Pool;
  let db: Database;
  beforeAll(async () => {
    pool = new Pool({ connectionString: await postgres!.createDatabase('authentication_tutorial_store'), max: 10 });
    db = nodePostgres({ client: pool });
    await migrateNodePostgres(db, { migrationsFolder });
  });
  afterAll(async () => {
    await pool?.end();
    postgres!.stop();
  });

  for (const c of authenticationStoreContract(() => emptyStore(db), { concurrent: true, maxPending: 3 })) {
    it(c.name, c.run);
  }
});

```

`CappedStore` 降低了待处理行的上限，以便 `maxPending: 3` 可以检查它。`startPostgres()` 是一个测试辅助函数，它在 PostgreSQL 服务器上创建一个临时数据库，或者在没有 PostgreSQL 的情况下跳过 PostgreSQL 测试用例。一个读取行然后写回该行的存储会通过其他测试但会失败这些测试。

**使用 TypeORM。** 针对 ORM 为 TypeORM 的应用程序，使用相同的存储和相同的八个表。Drizzle 保持教程的路径：使用此存储而不是上面那个，而不是旁边那个。表是实体，每个列都声明了其类型，因此 TypeORM CLI 在不加载装饰器元数据的情况下，看到的模式与应用程序的模式相同：

```typescript title="src/typeorm/authentication.entities.ts"
import type { EmailTokenPurpose, MfaState } from '@nestjs/authentication';
import { Column, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';

// The authentication tables, read and written by TypeOrmAuthenticationStore: the same
// tables as the Drizzle schema in src/database/schema.ts. Every column states its type, so
// the entities load the same with or without emitted decorator metadata (the TypeORM CLI
// runs them through tsx, which emits none). Tokens, links and sessions are stored by their
// SHA-256; TOTP secrets arrive encrypted.

/** What a `jsonb` column holds: a column typed `unknown` doesn't fit TypeORM's insert types. */
export type Json = object | string | number | boolean | null;

@Entity('sessions')
@Index('sessions_user_id_idx', ['userId'])
@Index('sessions_expires_at_idx', ['expiresAt'])
export class SessionEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'text', name: 'user_id' })
  userId: string;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', name: 'last_active_at' })
  lastActiveAt: Date;

  @Column({ type: 'text', nullable: true })
  mfa: MfaState | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, Json> | null;
}

@Entity('refresh_tokens')
@Index('refresh_tokens_family_id_idx', ['familyId'])
@Index('refresh_tokens_user_id_idx', ['userId'])
@Index('refresh_tokens_family_expires_at_idx', ['familyExpiresAt'])
export class RefreshTokenEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'text', name: 'family_id' })
  familyId: string;

  @Column({ type: 'text', name: 'user_id' })
  userId: string;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', name: 'family_expires_at' })
  familyExpiresAt: Date;

  @Column({ type: 'timestamptz', name: 'used_at', nullable: true })
  usedAt: Date | null;

  // A family is revoked when any of its tokens is: that covers a successor saved after the revocation.
  @Column({ type: 'boolean', default: false })
  revoked: boolean;

  @Column({ type: 'jsonb', nullable: true })
  claims: Record<string, Json> | null;
}

@Entity('mfa_authenticators')
export class MfaAuthenticatorEntity {
  @PrimaryColumn({ type: 'text', name: 'user_id' })
  userId: string;

  @Column({ type: 'text' })
  secret: string;

  @Column({ type: 'boolean' })
  confirmed: boolean;

  @Column({ type: 'text', name: 'pending_secret', nullable: true })
  pendingSecret: string | null;

  @Column({ type: 'integer', name: 'last_used_step', nullable: true })
  lastUsedStep: number | null;
}

@Entity('mfa_recovery_codes')
export class MfaRecoveryCodeEntity {
  @PrimaryColumn({ type: 'text', name: 'user_id' })
  userId: string;

  @PrimaryColumn({ type: 'text', name: 'code_hash' })
  codeHash: string;
}

@Entity('mfa_failures')
@Index('mfa_failures_user_id_failed_at_idx', ['userId', 'failedAt'])
@Index('mfa_failures_failed_at_idx', ['failedAt'])
export class MfaFailureEntity {
  @PrimaryGeneratedColumn('identity', { type: 'integer', generatedIdentity: 'ALWAYS' })
  id: number;

  @Column({ type: 'text', name: 'user_id' })
  userId: string;

  @Column({ type: 'timestamptz', name: 'failed_at' })
  failedAt: Date;
}

@Entity('magic_links')
@Index('magic_links_expires_at_idx', ['expiresAt'])
export class MagicLinkEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'text' })
  email: string;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'text', name: 'redirect_to', nullable: true })
  redirectTo: string | null;
}

@Entity('oidc_logins')
@Index('oidc_logins_expires_at_idx', ['expiresAt'])
export class OidcLoginEntity {
  @PrimaryColumn({ type: 'text' })
  state: string;

  @Column({ type: 'text' })
  provider: string;

  @Column({ type: 'text', name: 'code_verifier' })
  codeVerifier: string;

  @Column({ type: 'text', nullable: true })
  nonce: string | null;

  @Column({ type: 'text', name: 'redirect_to', nullable: true })
  redirectTo: string | null;

  // Set for "connect your Google account" from a signed-in session.
  @Column({ type: 'text', name: 'link_user_id', nullable: true })
  linkUserId: string | null;

  @Column({ type: 'text', name: 'link_session_id', nullable: true })
  linkSessionId: string | null;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;
}

@Entity('email_tokens')
@Index('email_tokens_user_id_purpose_idx', ['userId', 'purpose'])
@Index('email_tokens_expires_at_idx', ['expiresAt'])
export class EmailTokenEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'text' })
  purpose: EmailTokenPurpose;

  @Column({ type: 'text', name: 'user_id' })
  userId: string;

  @Column({ type: 'text' })
  email: string;

  @Column({ type: 'text', nullable: true })
  fingerprint: string | null;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;
}

```

TypeORM CLI 和 `TypeOrmModule` 在数据源文件中共享一组选项：

```typescript title="src/typeorm/data-source.ts"
import { DataSource, type DataSourceOptions } from 'typeorm';
import {
  EmailTokenEntity,
  MagicLinkEntity,
  MfaAuthenticatorEntity,
  MfaFailureEntity,
  MfaRecoveryCodeEntity,
  OidcLoginEntity,
  RefreshTokenEntity,
  SessionEntity,
} from './authentication.entities.js';
import { Authentication1790235914534 } from './migrations/1790235914534-Authentication.js';

/** What the application's TypeOrmModule and the TypeORM CLI share. */
export const dataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    SessionEntity,
    RefreshTokenEntity,
    MfaAuthenticatorEntity,
    MfaRecoveryCodeEntity,
    MfaFailureEntity,
    MagicLinkEntity,
    OidcLoginEntity,
    EmailTokenEntity,
  ],
  migrations: [Authentication1790235914534],
} satisfies DataSourceOptions;

// The TypeORM CLI's data source: `migration:generate` compares the entities with this database.
export default new DataSource(dataSourceOptions);

```

从实体生成迁移，针对已应用了先前迁移的数据库，应用它，并检查实体和数据库是否一致。CLI 需要一个用于数据源文件的 TypeScript 加载器；这使用了 `tsx`：

```bash
$ npx tsx ./node_modules/typeorm/cli.js migration:generate src/typeorm/migrations/Authentication -d src/typeorm/data-source.ts --pretty
Migration /store/src/typeorm/migrations/1790235914534-Authentication.ts has been generated successfully.
$ npx tsx ./node_modules/typeorm/cli.js migration:run -d src/typeorm/data-source.ts
$ npx tsx ./node_modules/typeorm/cli.js migration:generate src/typeorm/migrations/Check -d src/typeorm/data-source.ts --check
No changes in database schema were found

```

它编写的迁移 `1790235914534-Authentication.ts` 是上面八个表的 `CREATE TABLE` 和 `CREATE INDEX` 语句，并且数据源中的 `migrations` 列出了它。现在，存储遵循与 Drizzle 相同的规则：

```typescript title="src/typeorm/typeorm-authentication.store.ts"
import { Injectable } from '@nestjs/common';
import {
  AuthenticationStorage,
  type EmailTokenPurpose,
  type EmailTokenRecord,
  type EmailTokenStore,
  type MagicLinkRecord,
  type MagicLinkStore,
  type MfaStore,
  type OidcStateStore,
  type OidcTransaction,
  type RefreshTokenRecord,
  type RefreshTokenStore,
  type SessionRecord,
  type SessionStore,
  type TotpRecord,
} from '@nestjs/authentication';
import {
  DataSource,
  IsNull,
  LessThan,
  LessThanOrEqual,
  MoreThan,
  Or,
  type EntityTarget,
  type FindOptionsWhere,
  type ObjectLiteral,
} from 'typeorm';
import {
  EmailTokenEntity,
  MagicLinkEntity,
  MfaAuthenticatorEntity,
  MfaFailureEntity,
  MfaRecoveryCodeEntity,
  OidcLoginEntity,
  RefreshTokenEntity,
  SessionEntity,
  type Json,
} from './authentication.entities.js';

/**
 * Keeps sessions, refresh tokens, authenticators and pending links in
 * PostgreSQL, through TypeORM: the Drizzle store above, on the same
 * tables. Every method that decides whether something works once is a
 * single conditional statement, so the guarantees hold with any number of
 * API instances.
 */
@Injectable()
export class TypeOrmAuthenticationStore
  implements SessionStore, RefreshTokenStore, MfaStore, MagicLinkStore, OidcStateStore, EmailTokenStore
{
  /** Pending links and logins kept per table: anyone can create them. */
  protected readonly maxPending: number = 100_000;

  constructor(
    private readonly dataSource: DataSource,
    storage: AuthenticationStorage,
  ) {
    storage.registerSource({
      sessions: this,
      refreshTokens: this,
      mfa: this,
      magicLinks: this,
      oidcStates: this,
      emailTokens: this,
    });
  }

  private get manager() {
    return this.dataSource.manager;
  }

  // Sessions

  async getSession(id: string): Promise<SessionRecord | undefined> {
    const row = await this.manager.findOneBy(SessionEntity, { id });
    return row ? withoutNulls(row) : undefined;
  }

  async createSession(record: SessionRecord): Promise<void> {
    // JSON-safe: the package stores what `session.metadata` returned, as JSON.
    const metadata = (record.metadata ?? null) as Record<string, Json> | null;
    await this.manager.insert(SessionEntity, { ...record, mfa: record.mfa ?? null, metadata });
    await this.manager.delete(SessionEntity, { expiresAt: LessThanOrEqual(record.createdAt) });
  }

  async touchSession(id: string, lastActiveAt: Date): Promise<void> {
    // Conditional: a session deleted by a sign-out stays deleted.
    await this.manager.update(SessionEntity, { id, lastActiveAt: LessThan(lastActiveAt) }, { lastActiveAt });
  }

  // Whether this call deleted it: of two rotations of a session, or a rotation and a sign-out, one wins.
  async deleteSession(id: string): Promise<boolean> {
    const { affected } = await this.manager.delete(SessionEntity, { id });
    return (affected ?? 0) > 0;
  }

  async listUserSessions(userId: string): Promise<SessionRecord[]> {
    const rows = await this.manager.findBy(SessionEntity, { userId });
    return rows.map(withoutNulls);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await this.manager.delete(SessionEntity, { userId });
  }

  // Refresh tokens

  async getRefreshToken(id: string): Promise<RefreshTokenRecord | undefined> {
    const row = await this.manager.findOneBy(RefreshTokenEntity, { id });
    if (!row) {
      return undefined;
    }
    const { revoked: _, ...token } = row;
    return withoutNulls(token);
  }

  async saveRefreshToken(record: RefreshTokenRecord): Promise<void> {
    const claims = (record.claims ?? null) as Record<string, Json> | null;
    await this.manager.insert(RefreshTokenEntity, { ...record, usedAt: record.usedAt ?? null, claims });
    await this.manager.delete(RefreshTokenEntity, { familyExpiresAt: LessThanOrEqual(record.createdAt) });
  }

  async markRefreshTokenUsed(id: string, at: Date): Promise<boolean> {
    // Conditional: of two refreshes with the same token, one updates the row.
    const { affected } = await this.manager.update(RefreshTokenEntity, { id, usedAt: IsNull() }, { usedAt: at });
    return affected === 1;
  }

  async revokeRefreshTokenFamily(familyId: string): Promise<void> {
    await this.manager.update(RefreshTokenEntity, { familyId }, { revoked: true });
  }

  isRefreshTokenFamilyRevoked(familyId: string): Promise<boolean> {
    return this.manager.existsBy(RefreshTokenEntity, { familyId, revoked: true });
  }

  async revokeUserRefreshTokens(userId: string): Promise<void> {
    await this.manager.update(RefreshTokenEntity, { userId }, { revoked: true });
  }

  // Authenticators, recovery codes and failed attempts

  async getTotp(userId: string): Promise<TotpRecord | undefined> {
    const row = await this.manager.findOneBy(MfaAuthenticatorEntity, { userId });
    if (!row) {
      return undefined;
    }
    const { userId: _, ...totp } = row;
    return withoutNulls(totp);
  }

  async saveTotp(userId: string, record: TotpRecord | null): Promise<void> {
    if (!record) {
      await this.manager.delete(MfaAuthenticatorEntity, { userId });
      return;
    }
    // An upsert that never lowers the claimed step: the record may have been read before a
    // claim. GREATEST() over the conflicting row is beyond the upsert API, so this one is SQL.
    await this.manager.query(
      `INSERT INTO mfa_authenticators (user_id, secret, confirmed, pending_secret, last_used_step)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         secret = EXCLUDED.secret,
         confirmed = EXCLUDED.confirmed,
         pending_secret = EXCLUDED.pending_secret,
         last_used_step = GREATEST(mfa_authenticators.last_used_step, EXCLUDED.last_used_step)`,
      [userId, record.secret, record.confirmed, record.pendingSecret ?? null, record.lastUsedStep ?? null],
    );
  }

  async claimTotpStep(userId: string, step: number): Promise<boolean> {
    // Conditional: a code's time step is accepted once.
    const { affected } = await this.manager.update(
      MfaAuthenticatorEntity,
      { userId, lastUsedStep: Or(IsNull(), LessThan(step)) },
      { lastUsedStep: step },
    );
    return affected === 1;
  }

  async saveRecoveryCodes(userId: string, hashes: string[]): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(MfaRecoveryCodeEntity, { userId });
      if (hashes.length > 0) {
        await manager.insert(MfaRecoveryCodeEntity, [...new Set(hashes)].map((codeHash) => ({ userId, codeHash })));
      }
    });
  }

  async consumeRecoveryCode(userId: string, hash: string): Promise<boolean> {
    // Conditional: of two requests with the same code, one deletes the row.
    const { affected } = await this.manager.delete(MfaRecoveryCodeEntity, { userId, codeHash: hash });
    return affected === 1;
  }

  countRecoveryCodes(userId: string): Promise<number> {
    return this.manager.countBy(MfaRecoveryCodeEntity, { userId });
  }

  async recordMfaFailure(userId: string, windowMs: number, now: number): Promise<number> {
    // Insert, then count, each committed on its own (no transaction): every attempt
    // counts itself and all those recorded before it.
    await this.manager.insert(MfaFailureEntity, { userId, failedAt: new Date(now) });
    const failures = await this.countMfaFailures(userId, windowMs, now);
    await this.manager.delete(MfaFailureEntity, { failedAt: LessThanOrEqual(new Date(now - windowMs)) });
    return failures;
  }

  countMfaFailures(userId: string, windowMs: number, now: number): Promise<number> {
    return this.manager.countBy(MfaFailureEntity, { userId, failedAt: MoreThan(new Date(now - windowMs)) });
  }

  async clearMfaFailures(userId: string): Promise<void> {
    await this.manager.delete(MfaFailureEntity, { userId });
  }

  // Magic links

  async saveMagicLink(record: MagicLinkRecord): Promise<void> {
    await this.manager.insert(MagicLinkEntity, { ...record, redirectTo: record.redirectTo ?? null });
    await this.trim(MagicLinkEntity, record.createdAt);
  }

  async consumeMagicLink(id: string): Promise<MagicLinkRecord | undefined> {
    // DELETE … RETURNING: of two requests with the same link, one gets the row.
    const [row] = await this.deleteReturning(MagicLinkEntity, { id });
    return row && withoutNulls(row);
  }

  // Sign-ins with Google in progress

  async saveOidcState({ link, ...login }: OidcTransaction): Promise<void> {
    await this.manager.insert(OidcLoginEntity, {
      ...login,
      nonce: login.nonce ?? null,
      redirectTo: login.redirectTo ?? null,
      linkUserId: link?.userId ?? null,
      linkSessionId: link?.sessionId ?? null,
    });
    await this.trim(OidcLoginEntity, login.createdAt);
  }

  async consumeOidcState(state: string): Promise<OidcTransaction | undefined> {
    const [row] = await this.deleteReturning(OidcLoginEntity, { state });
    if (!row) {
      return undefined;
    }
    const { linkUserId, linkSessionId, ...login } = withoutNulls(row);
    return linkUserId && linkSessionId ? { ...login, link: { userId: linkUserId, sessionId: linkSessionId } } : login;
  }

  // Password reset and email verification links

  async saveEmailToken(record: EmailTokenRecord): Promise<void> {
    await this.manager.insert(EmailTokenEntity, { ...record, fingerprint: record.fingerprint ?? null });
    await this.trim(EmailTokenEntity, record.createdAt);
  }

  async consumeEmailToken(id: string, purpose: EmailTokenPurpose): Promise<EmailTokenRecord | undefined> {
    const [row] = await this.deleteReturning(EmailTokenEntity, { id, purpose });
    return row && withoutNulls(row);
  }

  async deleteUserEmailTokens(userId: string, purpose: EmailTokenPurpose): Promise<void> {
    await this.manager.delete(EmailTokenEntity, { userId, purpose });
  }

  /** `DELETE … RETURNING *`, as rows of the entity: the query builder returns raw column names. */
  private async deleteReturning<T extends ObjectLiteral>(entity: EntityTarget<T>, where: FindOptionsWhere<T>): Promise<T[]> {
    const { raw } = await this.manager.createQueryBuilder().delete().from(entity).where(where).returning('*').execute();
    const columns = this.dataSource.getMetadata(entity).columns;
    return (raw as Record<string, unknown>[]).map(
      (row) => Object.fromEntries(columns.map((column) => [column.propertyName, row[column.databaseName]])) as T,
    );
  }

  /** Deletes what expired, and past `maxPending`, what expires first. */
  private async trim<T extends { expiresAt: Date }>(entity: EntityTarget<T>, now: Date) {
    await this.manager.delete(entity, { expiresAt: LessThanOrEqual(now) } as FindOptionsWhere<T>);
    const [cutoff] = await this.manager.find(entity, {
      select: { expiresAt: true } as never,
      order: { expiresAt: 'DESC' } as never,
      skip: this.maxPending,
      take: 1,
    });
    if (cutoff) {
      await this.manager.delete(entity, { expiresAt: LessThanOrEqual(cutoff.expiresAt) } as FindOptionsWhere<T>);
    }
  }
}

/** A row without its NULL columns: the package's records leave optional fields out. */
type WithoutNulls<T> = { [K in keyof T as null extends T[K] ? never : K]: T[K] } & {
  [K in keyof T as null extends T[K] ? K : never]?: Exclude<T[K], null>;
};

function withoutNulls<T extends object>(row: T): WithoutNulls<T> {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null)) as WithoutNulls<T>;
}

```

- **条件更新和删除** 将条件放在 `update()` 和 `delete()` 的标准中，使用 `LessThan()`、`IsNull()` 和 `Or()`，并读取 `affected`。绝不使用 `save()`：那样会写回一个刚刚被登出删除的会话。
- **`saveTotp()`** 使用 `GREATEST()` 保留冲突行中更大的时间步长，upsert API 无法表达这一点，因此它通过 `manager.query()` 以 SQL 形式写入单个语句。
- **`consume` 方法** 是带有 `returning('*')` 的删除查询构建器。它返回数据库列名称下的原始行，因此 `deleteReturning()` 通过实体元数据将其映射回实体属性。
- **`recordMfaFailure()`** 在 `dataSource.manager` 上是两个语句，每个语句单独提交，而 `saveRecoveryCodes()` 是 `dataSource.transaction()` 中的唯一方法。
- **使用它** 代替 Drizzle 存储：在 `AppModule` 中使用 `TypeOrmModule.forRoot(dataSourceOptions)` 而不是 `DrizzleModule`，在 `AuthModule` 的提供者中使用 `TypeOrmAuthenticationStore` 而不是 `DrizzleAuthenticationStore`。它注入了 `DataSource`，该 `TypeOrmModule` 提供。

契约套件在不更改的情况下运行。TypeORM 通过 `pg` 连接，因此该套件需要一个 PostgreSQL 服务器，否则会被跳过。另外两个案例检查实体和迁移是否一致（`migration:generate --check` 检查的内容），以及当在模块中提供时，存储是否注册了所有六个契约：

```typescript title="test/typeorm-authentication.store.e2e-spec.ts"
/**
 * TypeOrmAuthenticationStore against the package's contract suite
 * (`@nestjs/authentication/testing`), on PostgreSQL (the server in
 * SQL_TEST_PG_URL, else a throwaway local cluster; see test/support/postgres.ts),
 * with the migration the TypeORM CLI generated. A pool, so the concurrency
 * cases race for real. Skipped, with the reason, without a server.
 */
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthenticationModule, AuthenticationStorage } from '@nestjs/authentication';
import { authenticationStoreContract } from '@nestjs/authentication/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/typeorm/data-source.js';
import { TypeOrmAuthenticationStore } from '../src/typeorm/typeorm-authentication.store.js';
import { startPostgres } from './support/postgres.js';

/** The store with a cap of 3 pending entries per table, so the suite can check it. */
class CappedStore extends TypeOrmAuthenticationStore {
  protected override readonly maxPending = 3;
}

const { postgres, reason } = await startPostgres();

describe.skipIf(!postgres)(`TypeOrmAuthenticationStore on PostgreSQL${reason ? ` (skipped: ${reason})` : ''}`, () => {
  let dataSource: DataSource;
  let url: string;

  beforeAll(async () => {
    url = await postgres!.createDatabase('authentication_tutorial_typeorm_store');
    dataSource = await new DataSource({ ...dataSourceOptions, url, poolSize: 10 }).initialize();
    await dataSource.runMigrations();
  });
  afterAll(async () => {
    await dataSource?.destroy();
    postgres!.stop();
  });

  /** The store on empty tables, registered nowhere: the suite builds its own registry. */
  async function emptyStore() {
    await dataSource.query(
      'TRUNCATE sessions, refresh_tokens, mfa_authenticators, mfa_recovery_codes, mfa_failures, magic_links, oidc_logins, email_tokens',
    );
    const store = new CappedStore(dataSource, new AuthenticationStorage());
    return { sessions: store, refreshTokens: store, mfa: store, magicLinks: store, oidcStates: store, emailTokens: store };
  }

  for (const c of authenticationStoreContract(emptyStore, { concurrent: true, maxPending: 3 })) {
    it(c.name, c.run);
  }

  it('has a migration that matches the entities (what `migration:generate --check` checks)', async () => {
    const { upQueries } = await dataSource.driver.createSchemaBuilder().log();
    expect(upQueries.map((query) => query.query)).toEqual([]);
  });

  it('registers itself for every contract when provided in a module', async () => {
    const log = vi.spyOn(Logger.prototype, 'log');
    const app = await Test.createTestingModule({
      imports: [TypeOrmModule.forRoot({ ...dataSourceOptions, url }), AuthenticationModule.forRoot()],
      providers: [TypeOrmAuthenticationStore],
    }).compile();
    await app.init();
    const storage = app.get(AuthenticationStorage);
    const store = app.get(TypeOrmAuthenticationStore);
    expect([storage.sessions, storage.refreshTokens, storage.mfa, storage.magicLinks, storage.oidcStates, storage.emailTokens]).toEqual(
      Array(6).fill(store),
    );
    expect(log).toHaveBeenCalledWith('AuthenticationStorage: TypeOrmAuthenticationStore');
    log.mockRestore();
    await app.close();
  });
});

```

> info **提示** 使用 Prisma？[The store contract](/security/authentication#the-store-contract)，在教程之后，列出了每个契约必须保证的内容以及 Prisma 如何表达原子方法。请使用相同的案例测试您的存储。

#### 向合作伙伴颁发 API 密钥

猫咪收容所和宠物店从自己的库存系统中批量补货，有些客户使用脚本重新订购。脚本无法填写登录表单，而每次使用都会更改的刷新令牌不适合夜间任务。请给他们 API 密钥：客户在 Web 应用程序中创建的、具有长期有效性的秘密，并在不再需要时撤销。脚本将密钥作为 bearer token 发送，并充当创建该密钥的客户。

该包会检查密钥，您的数据库会保存它们。向模式添加一个表：

```typescript title="src/database/schema.ts"
// API keys (src/auth/api-key-auth.provider.ts): the SHA-256 of each key, never the key.
export const apiKeys = pgTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    hash: text('hash').notNull(),
    createdAt: at('created_at').notNull(),
    expiresAt: at('expires_at').notNull(),
  },
  (table) => [index('api_keys_user_id_idx').on(table.userId)],
);

```

生成其迁移并应用（输出已截断）：

```bash
$ npx drizzle-kit generate --name=api_keys
...
9 tables
api_keys 5 columns 1 indexes 0 fks
...
[✓] Your SQL migration file ➜ drizzle/0001_api_keys.sql 🚀
$ npx drizzle-kit migrate
...
[✓] migrations applied successfully!

```

第三个凭证提供者扩展了 `ApiKeyProvider`，它只做一件事：根据其 id 查找密钥。

```typescript title="src/auth/api-key-auth.provider.ts"
import { Injectable } from '@nestjs/common';
import { ApiKeyProvider, AuthenticationRegistry } from '@nestjs/authentication';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { apiKeys } from '../database/schema.js';
import type { User } from '../users/user.js';
import { UsersRepository } from '../users/users.repository.js';

@Injectable()
export class ApiKeyAuth extends ApiKeyProvider<User> {
  constructor(
    @InjectDrizzle() private readonly db: NodePgDatabase,
    private readonly usersRepository: UsersRepository,
    registry: AuthenticationRegistry,
  ) {
    // Keys look like cat_<id>_<secret>. The prefix tells secret scanners what they found.
    super({ prefix: 'cat', realm: 'store' });
    // Third in the chain, after SessionAuth and JwtAuth.
    registry.registerProvider(this, { order: 2 });
  }

  // Called with the id part of a key; the provider then checks the hash and the expiry.
  // Returning null (no such key, or its owner was deleted) rejects the key.
  async findKey(id: string) {
    const [key] = await this.db.select().from(apiKeys).where(eq(apiKeys.id, id));
    const user = key && (await this.usersRepository.findById(key.userId));
    return user ? { hash: key.hash, user, expiresAt: key.expiresAt } : null;
  }
}

```

一个密钥读取 `cat_<id>_<secret>`：前缀、一个 16 个十六进制字符的公有 id 和一个 256 个随机位的秘密。`findKey()` 查找 id，提供者完成其余工作。它以恒定时间和对不存在的 id 做相同的工作来比较整个密钥的 SHA-256 与存储的 `hash`，并拒绝来自 `expiresAt` 的密钥。像密码的 scrypt 这样的慢速哈希在这里没有任何作用，因为没有人会猜测 256 个随机位，而且它会减慢每个请求。错误的、过期的或已撤销的密钥会收到 401 响应，如错误的访问令牌。

`JwtAuth` 读取相同的 `Authorization` 头部。JWT 总是包含两个点，而密钥不包含任何点，因此 `JwtAuth` 将密钥留给 `ApiKeyAuth`，先运行哪一个都行。没有凭证的请求仍然会收到一个挑战，`Bearer realm="store"`，因为两个提供者都使用相同的领域。

现在是创建、列出和撤销密钥的端点：

```typescript title="src/auth/api-keys.controller.ts"
import { Controller, Delete, Get, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { Authenticate, CurrentUser } from '@nestjs/authentication';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { apiKeys } from '../database/schema.js';
import { ApiKeyAuth } from './api-key-auth.provider.js';
import { SessionAuth } from './session-auth.provider.js';

const ONE_YEAR = 365 * 24 * 60 * 60 * 1000;

// Managed from the web app, signed in with a session: a key can't create or revoke keys.
@Authenticate({ providers: [SessionAuth] })
@Controller('auth/api-keys')
export class ApiKeysController {
  constructor(
    @InjectDrizzle() private readonly db: NodePgDatabase,
    private readonly apiKeyAuth: ApiKeyAuth,
  ) {}

  // The only response that contains the key: the table keeps its hash.
  @Post()
  async create(@CurrentUser('id') userId: string) {
    const { key, id, hash } = this.apiKeyAuth.generate();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + ONE_YEAR);
    await this.db.insert(apiKeys).values({ id, userId, hash, createdAt, expiresAt });
    return { id, key, createdAt, expiresAt };
  }

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.db
      .select({ id: apiKeys.id, createdAt: apiKeys.createdAt, expiresAt: apiKeys.expiresAt })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId));
  }

  // Revoked from the next request on. Another customer's key is a 404.
  @Delete(':id')
  @HttpCode(204)
  async revoke(@CurrentUser('id') userId: string, @Param('id') id: string) {
    const revoked = await this.db
      .delete(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
      .returning();
    if (revoked.length === 0) {
      throw new NotFoundException();
    }
  }
}

```

- `generate()` 返回密钥、其 id 和其哈希。表存储 id 和哈希，因此 `create` 是唯一有人看到密钥的时候。丢失密钥的客户会撤销它并创建另一个。
- 控制器只接受 `SessionAuth`，因此密钥由 Web 应用程序管理。在 `providers` 下，任何其他提供者的凭证都视为无：泄露的密钥不能创建更多密钥或撤销其所有者。
- 密钥在一年后过期，因此忘记的密钥不会永远有效。删除密钥的行会使其从下一个请求开始被撤销。

在 `AuthModule` 中注册两者：

```typescript title="src/auth/auth.module.ts"
import { ApiKeyAuth } from './api-key-auth.provider.js';
import { ApiKeysController } from './api-keys.controller.js';
// ...
controllers: [
  // ...
  SessionsController,
  ApiKeysController,
],
providers: [
  // ...
  DrizzleAuthenticationStore,
  ApiKeyAuth,
],

```

一个密钥会在不指定其提供者的所有路由上签入其所有者，包括 `POST /orders`。它永远不被算作第二因素：`PATCH /me/email` 以 `mfa_required` 回答，因为它回答的是尚未通过代码的会话。要将某个路由保留给密钥或排除密钥，请在 `@Authenticate()` 中列出该路由接受的提供者。在处理程序中，`@CurrentSession()` 包含密钥的 `keyId`，其中 `method` 设置为 `api-key`，这样审计日志就可以说明是哪个密钥下了订单。可能只能读取或只能订购的密钥是权限问题，这就是 [`@nestjs/authorization`](/security/authorization) 的用途。

**使用 TypeORM。** 该表是一个实体，与存储的实体并列：

```typescript title="src/typeorm/api-key.entity.ts"
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

// The api_keys table of src/database/schema.ts, for an application on TypeORM.
@Entity('api_keys')
@Index('api_keys_user_id_idx', ['userId'])
export class ApiKeyEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'text', name: 'user_id' })
  userId: string;

  @Column({ type: 'text' })
  hash: string;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;
}

```

在数据源的 `entities` 中列出它，其迁移像存储表的迁移一样生成在 `migrations` 中。`findKey()` 通过实体的仓储读取行，使用 `findOneBy()`，而控制器使用 `insert()` 和 `delete()` 写入它。

#### 试用

应用 [migrations](/security/authentication#keep-sessions-and-tokens-in-your-database)，并使用前几节中的 `.env` 文件启动应用程序：

```bash
$ npm run start:dev -- --env-file .env

```

在另一个终端中注册。`-c` 标志将会话 Cookie 保存到文件，而 `-b` 将其随后续请求发送。`--json` (curl 7.82 或更高版本) 使用带有 JSON 主体的 `POST` 发送。响应头在此和下方截断：

```bash
$ curl -i localhost:3000/auth/sign-up -c ada.txt --json '{"email":"ada@example.com","password":"correct horse battery"}'
HTTP/1.1 201 Created
Set-Cookie: __Host-sid=q0L7c...; Max-Age=1209600; Path=/; HttpOnly; Secure; SameSite=Lax
{"id":"7b5d3c2e-...","email":"ada@example.com","emailVerified":false,"roles":["customer"]}

```

会话和待验证链接现在是 PostgreSQL 中的行。会话的 id 是 Cookie 的 SHA-256 哈希，而链接的令牌根本不存储：

```bash
$ psql "$DATABASE_URL" -c "SELECT user_id, mfa, metadata FROM sessions" -c "SELECT purpose, email FROM email_tokens"
               user_id                | mfa |          metadata
--------------------------------------+-----+-----------------------------
 7b5d3c2e-...                         |     | {"userAgent": "curl/8.7.1"}
(1 row)

      purpose       |      email
--------------------+-----------------
 email-verification | ada@example.com
(1 row)

```

验证电子邮件出现在应用程序日志中（`LogMailTransport` 打印每封电子邮件的文本）：

```bash
LOG [LogMailTransport] "Confirm your email address" to ada@example.com
DEBUG [LogMailTransport] Confirm the email address of your store account:

Confirm my address (http://localhost:3000/verify-email?token=Vb3x...)

If you didn't create an account, ignore this email.

```

Cookie 签入了 Ada，但她的地址未经验证，所以她还不能下订单。将令牌返回，就像验证页面会做的那样，订单就会通过。没有 Cookie，API 返回 401：

```bash
$ curl localhost:3000/me -b ada.txt
{"id":"7b5d3c2e-...","email":"ada@example.com","emailVerified":false,"roles":["customer"]}

$ curl localhost:3000/orders -b ada.txt --json '{"items":[{"productId":"salmon-kibble-2kg","quantity":1}]}'
{"message":"Email address not verified","error":"email_unverified","statusCode":403,"errorCode":"email_unverified"}

$ curl localhost:3000/auth/email/verify --json '{"token":"Vb3x..."}'
{"email":"ada@example.com","emailVerified":true}

$ curl localhost:3000/orders -b ada.txt --json '{"items":[{"productId":"salmon-kibble-2kg","quantity":1}]}'
{"id":"f3a1...","userId":"7b5d3c2e-...","items":[{"productId":"salmon-kibble-2kg","quantity":1}],"total":2499,"status":"pending"}

$ curl -i localhost:3000/orders
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="store"
{"message":"Unauthorized","statusCode":401,"errorCode":"missing_credentials"}

```

以移动应用程序身份登录，并使用访问令牌。下面的命令使用 [jq](https://jqlang.org/) 来提取令牌：

```bash
$ TOKENS=$(curl -s localhost:3000/auth/token --json '{"email":"ada@example.com","password":"correct horse battery"}')
$ echo $TOKENS
{"accessToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...","refreshToken":"Qm4x...","expiresIn":900}
$ ACCESS=$(echo $TOKENS | jq -r .accessToken) REFRESH=$(echo $TOKENS | jq -r .refreshToken)

$ curl localhost:3000/orders -H "Authorization: Bearer $ACCESS"
[{"id":"f3a1...","userId":"7b5d3c2e-...","items":[{"productId":"salmon-kibble-2kg","quantity":1}],"total":2499,"status":"pending"}]

```

刷新令牌只工作一次。使用相同令牌的第二次尝试被视为盗窃，并撤销整个家族：

```bash
$ curl localhost:3000/auth/token/refresh --json "{\"refreshToken\":\"$REFRESH\"}"
{"accessToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...","refreshToken":"n8Vb...","expiresIn":900}

$ curl localhost:3000/auth/token/refresh --json "{\"refreshToken\":\"$REFRESH\"}"
{"message":"Refresh token reused","error":"Unauthorized","statusCode":401}

```

开启双因素认证。将密钥添加到身份验证器应用中，并使用显示的代码进行确认。该代码证明此浏览器具有身份验证器，因此会话从那时起得到验证，使用新的 Cookie（`-c` 保存它）：

```bash
$ curl -X POST localhost:3000/auth/mfa/enroll -b ada.txt
{"secret":"MZXW6YTBOI3DGNJS...","uri":"otpauth://totp/example.com:ada%40example.com?secret=MZXW6YTBOI3DGNJS...&issuer=example.com&algorithm=SHA1&digits=6&period=30"}

$ curl -i localhost:3000/auth/mfa/confirm -b ada.txt -c ada.txt --json '{"code":"492039"}'
HTTP/1.1 200 OK
Set-Cookie: __Host-sid=Kp4w...; Max-Age=1209571; Path=/; HttpOnly; Secure; SameSite=Lax
{"recoveryCodes":["7KQ2M-XR4PB","HT9WC-3MDNA","..."]}

```

> info **提示** 安装了 [oath-toolkit](https://www.nongnu.org/oath-toolkit/) 后，`oathtool --totp -b` 加上密钥会在终端打印当前代码。

再次登录。新会话在通过第二因素之前处于待定状态，验证会替换 Cookie：

```bash
$ curl localhost:3000/auth/sign-in -b ada.txt -c ada.txt --json '{"email":"ada@example.com","password":"correct horse battery"}'
{"mfaRequired":true}

$ curl localhost:3000/me -b ada.txt
{"message":"Second factor required","error":"mfa_required","statusCode":401,"errorCode":"mfa_required"}

$ curl localhost:3000/auth/mfa/verify -b ada.txt -c ada.txt --json '{"code":"815224"}'
{"mfa":"verified"}

$ curl -X PATCH localhost:3000/me/email -b ada.txt --json '{"email":"ada.lovelace@example.com"}'
{"id":"7b5d3c2e-...","email":"ada.lovelace@example.com","emailVerified":false,"roles":["customer"]}

```

新地址未经验证，会发送验证电子邮件到该地址：

```bash
LOG [LogMailTransport] "Confirm your email address" to ada.lovelace@example.com

```

移动应用程序也被要求提供代码：

```bash
$ curl localhost:3000/auth/token --json '{"email":"ada.lovelace@example.com","password":"correct horse battery"}'
{"message":"Second factor required","error":"mfa_required","statusCode":401,"errorCode":"mfa_required"}

```

开始 Google 登录。curl 显示重定向；在浏览器中打开相同的 URL 以完成它，然后您会到达 `/orders`，已登录：

```bash
$ curl -i 'localhost:3000/auth/oidc/google/login?redirectTo=/orders'
HTTP/1.1 302 Found
Set-Cookie: __Host-oidc_tx=Zq8...; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax
Location: https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=...&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Foidc%2Fgoogle%2Fcallback&scope=openid+email+profile&state=pW4c...&code_challenge=...&code_challenge_method=S256&nonce=...

```

请求为新客户 Grace 发送一个魔术链接。该链接仅在发起请求的浏览器中有效，因此请保留响应设置的 Cookie。电子邮件出现在应用程序日志中：

```bash
$ curl -i localhost:3000/auth/magic-link -c grace.txt --json '{"email":"grace@example.com"}'
HTTP/1.1 202 Accepted
Set-Cookie: __Host-magic_link_tx=Vn3p...; Max-Age=900; Path=/; HttpOnly; Secure; SameSite=Lax

```

```bash
LOG [LogMailTransport] "Your sign-in link" to grace@example.com
DEBUG [LogMailTransport] Sign in to the store (http://localhost:3000/sign-in/magic?token=Hq2x...)

The link works once, for 15 minutes. If you didn't ask for it, ignore this email.

```

像页面做的那样，带着该 Cookie 将令牌返回。Grace 获得一个已验证地址和会话的账户：

```bash
$ curl localhost:3000/auth/magic-link/consume -b grace.txt -c grace.txt --json '{"token":"Hq2x..."}'
{"redirectTo":"/","mfaRequired":false}

$ curl localhost:3000/me -b grace.txt
{"id":"c41e9a07-...","email":"grace@example.com","emailVerified":true,"roles":["customer"]}

```

Grace 经营一个猫咪收容所，其库存系统会重新订购猫砂。从她的会话中为其创建一个密钥，并使用该密钥下订单。该密钥不能创建密钥，一旦 Grace 撤销它，它就停止工作：

```bash
$ API_KEY=$(curl -s -X POST localhost:3000/auth/api-keys -b grace.txt)
$ echo $API_KEY
{"id":"d2cb7a64f3279c6b","key":"cat_d2cb7a64f3279c6b_QiBr...","createdAt":"2026-09-22T10:02:41.067Z","expiresAt":"2027-09-22T10:02:41.067Z"}
$ KEY=$(echo $API_KEY | jq -r .key) KEY_ID=$(echo $API_KEY | jq -r .id)

$ curl localhost:3000/orders -H "Authorization: Bearer $KEY" --json '{"items":[{"productId":"clumping-litter-10l","quantity":20}]}'
{"id":"db8a...","userId":"c41e9a07-...","items":[{"productId":"clumping-litter-10l","quantity":20}],"total":31980,"status":"pending"}

$ curl -X POST localhost:3000/auth/api-keys -H "Authorization: Bearer $KEY"
{"message":"Unauthorized","statusCode":401,"errorCode":"missing_credentials"}

$ curl -i -X DELETE localhost:3000/auth/api-keys/$KEY_ID -b grace.txt
HTTP/1.1 204 No Content

$ curl -i localhost:3000/orders -H "Authorization: Bearer $KEY"
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="store", error="invalid_token", error_description="invalid api key"
{"message":"invalid api key","error":"Unauthorized","statusCode":401}

```

列出 Ada 的会话，然后让她在所有地方登出。她的旧 Cookie 停止工作：

```bash
$ curl localhost:3000/auth/sessions -b ada.txt
[{"id":"eT0r...","createdAt":"2026-09-22T10:02:11.042Z","lastActiveAt":"2026-09-22T10:03:30.518Z","userAgent":"curl/8.7.1","current":true}]

$ curl -i -X POST localhost:3000/auth/sign-out-everywhere -b ada.txt
HTTP/1.1 204 No Content
Set-Cookie: __Host-sid=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax

$ curl localhost:3000/me -b ada.txt
{"message":"Unauthorized","statusCode":401,"errorCode":"missing_credentials"}

```

Ada 忘记了密码。为其地址请求重置链接，并为未注册的地址请求链接：两者都返回相同的空 202 状态码，只有 Ada 收到电子邮件：

```bash
$ curl -i localhost:3000/auth/password/forgot --json '{"email":"ada.lovelace@example.com"}'
HTTP/1.1 202 Accepted

$ curl -i localhost:3000/auth/password/forgot --json '{"email":"nobody@example.com"}'
HTTP/1.1 202 Accepted

```

```bash
LOG [LogMailTransport] "Reset your password" to ada.lovelace@example.com
DEBUG [LogMailTransport] Someone asked to reset the password of your store account.

Choose a new password (http://localhost:3000/reset-password?token=Rt7k...)

The link works once, for an hour. If it wasn't you, ignore this email: your password stays as it is.

```

像重置页面做的那样，使用令牌设置新密码。Ada 再次登录，处于待定状态（待定会话持续十分钟，`mfa.pendingTtl`，因此有 `Max-Age`），旧密码不再有效：

```bash
$ curl -i localhost:3000/auth/password/reset -c ada.txt --json '{"token":"Rt7k...","password":"a brand new passphrase"}'
HTTP/1.1 200 OK
Set-Cookie: __Host-sid=Yb2d...; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax
{"mfaRequired":true}

$ curl localhost:3000/auth/sign-in --json '{"email":"ada.lovelace@example.com","password":"correct horse battery"}'
{"message":"Invalid email or password","error":"Unauthorized","statusCode":401}

```

最后，猜测 Grace 的密码。在 15 分钟内第六次尝试在检查密码之前被拒绝：

```bash
$ for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w '%{http_code} ' localhost:3000/auth/sign-in --json '{"email":"grace@example.com","password":"password123"}'; done
401 401 401 401 401 429

```

#### GraphQL 和 WebSocket

全局守卫 `@Public()`、`@CurrentUser()` 和 `AuthenticationContext` 也适用于 GraphQL 解析器和 WebSocket 网关。该守卫读取携带这些信息的请求中的 Cookie 和头部。

在 GraphQL 中，它位于 GraphQL 上下文的 `req`，因此 `context` 选项必须是一个为每个请求构建上下文的函数。作为对象的 `context` 将为每个请求提供一个对象，并且应用程序在启动时失败。Nest 只在根解析器上运行全局守卫和拦截器：要保护字段解析器，并为它们提供 `AuthenticationContext`，请添加 `fieldResolverEnhancers: ['guards', 'interceptors']`。

```typescript title="src/app.module.ts"
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: true,
  subscriptions: { 'graphql-ws': true },
  // Over graphql-ws there is no request per operation: the upgrade request stands in for it.
  context: ({ req, res, extra }) => ({ req: req ?? extra?.request, res }),
  fieldResolverEnhancers: ['guards', 'interceptors'],
}),

```

通过 `graphql-ws`，对套接字的每次操作共享该升级请求，并且需要用户的每次操作都会使用其 Cookie 再次进行认证，因此“在所有地方登出”会阻止下一次操作。`@CurrentUser()` 为每次操作提供自己的用户，而 `null` 则为 `@Public()` 操作提供一个用户。`req.user`（模块也为读取请求的代码设置的）保存最后一次认证的操作的用户：请读取 `@CurrentUser()`。

Nest 不在网关的 `handleConnection()` 上运行守卫，因此使用 `WsAuthenticator` 认证握手：

```typescript title="src/orders/orders.gateway.ts"
import type { IncomingMessage } from 'node:http';
import { WebSocketGateway, type OnGatewayConnection } from '@nestjs/websockets';
import { WsAuthenticator } from '@nestjs/authentication';
import type { WebSocket } from 'ws';

@WebSocketGateway()
export class OrdersGateway implements OnGatewayConnection {
  constructor(private readonly wsAuthenticator: WsAuthenticator) {}

  async handleConnection(client: WebSocket, request: IncomingMessage) {
    await this.wsAuthenticator.authenticateConnection(client, request);
  }
}

```

它会以代码 1008 或 socket.io 的 `disconnect()` 关闭未登录的连接；要保留访客，请将 `authenticateConnection()` 传递一个第三个参数，其 `required` 选项为 `false`。对于 socket.io，它读取握手的头部，因此 `request` 参数可以省略。来自其他站点页面的握手是匿名的，因为 [cross-origin write](/security/authentication#add-sign-up-and-sign-in) 也是如此。然后守卫会再次认证每条消息，因此撤销的会话会在连接中途停止工作。`@CurrentUser()` 是每条消息的，`null` 是每 `@Public()` 的。`client.user` 保存最后一条已认证消息的用户，一旦消息因凭据被拒绝，它就会被清除。

[`@nestjs/authorization`](/security/authorization) 将 `@Can()` 与每条消息和每个操作的用户进行比较，而不是套接字的用户。

#### 测试

端到端测试启动真实的 `AppModule`，并更改了三件事。数据库是 [PGlite](https://pglite.dev)，PostgreSQL 编译为 WebAssembly，应用了您的真实迁移，因此测试不需要服务器。邮件发送到 `InMemoryMailTransport`，该邮件类会保留每封邮件供测试读取。并且 scrypt 故意很慢，默认成本下每哈希耗时几百毫秒和 128 MiB 内存，因此测试用更便宜的选项覆盖了 `PasswordHasher`。应用程序在启动时也读取其设置，因此测试需要为其提供测试值：

```typescript title="vitest.config.e2e.ts"
export default defineConfig({
  // ...
  test: {
    // ...
    env: {
      APP_URL: 'http://localhost:3000',
      JWT_SECRET: 'test-only-jwt-secret-of-at-least-32-bytes',
      TOTP_ENCRYPTION_KEY: 'test-only-totp-key-of-at-least-32-chars',
      GOOGLE_CLIENT_ID: 'store.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'test-only-google-secret',
    },
  },
});

```

```typescript title="test/auth.e2e-spec.ts"
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PGlite } from '@electric-sql/pglite';
import { PasswordHasher } from '@nestjs/authentication';
import { getDrizzleToken } from '@nestjs/drizzle';
import { InMemoryMailTransport, MailTransport } from '@nestjs/mail';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { VerifyEmailMail } from '../src/auth/email-verification.mailer.js';
import { PasswordResetMail } from '../src/auth/password-reset.mailer.js';

describe('Authentication (e2e)', () => {
  const pglite = new PGlite(); // PostgreSQL in-process: no server to start
  const mailbox = new InMemoryMailTransport();
  let app: INestApplication;
  const ada = { email: 'ada@example.com', password: 'correct horse battery' };

  beforeAll(async () => {
    const db = drizzle({ client: pglite });
    // The app's migrations, the authentication tables included.
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDrizzleToken()) // the database DrizzleModule provides
      .useValue(db)
      .overrideProvider(MailTransport)
      .useValue(mailbox)
      .overrideProvider(PasswordHasher)
      .useValue(new PasswordHasher({ logN: 10 }))
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
    await pglite.close();
  });

  it('signs up, verifies the address, then reads the profile with the session cookie', async () => {
    const res = await request(app.getHttpServer()).post('/auth/sign-up').send(ada).expect(201);
    const cookie = res.headers['set-cookie'][0].split(';')[0];

    const mail = mailbox.assertSent({ to: ada.email, mail: VerifyEmailMail });
    const token = mail.link('/verify-email').searchParams.get('token');
    await request(app.getHttpServer()).post('/auth/email/verify').send({ token }).expect(200);

    await request(app.getHttpServer())
      .get('/me')
      .set('Cookie', cookie)
      .expect(200, { id: res.body.id, email: ada.email, emailVerified: true, roles: ['customer'] });
  });

  it('issues bearer tokens to the mobile app', async () => {
    const res = await request(app.getHttpServer()).post('/auth/token').send(ada).expect(200);

    await request(app.getHttpServer())
      .get('/orders')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200, []);
  });

  it('resets a forgotten password', async () => {
    await request(app.getHttpServer()).post('/auth/password/forgot').send({ email: ada.email }).expect(202);
    // The email goes out after the response, which doesn't wait for it.
    const mail = await vi.waitFor(() => mailbox.assertSent({ to: ada.email, mail: PasswordResetMail }));
    const token = mail.link('/reset-password').searchParams.get('token');

    await request(app.getHttpServer())
      .post('/auth/password/reset')
      .send({ token, password: 'a brand new passphrase' })
      .expect(200);
    await request(app.getHttpServer()).post('/auth/sign-in').send(ada).expect(401);
  });

  it('rejects anonymous requests and wrong passwords', async () => {
    await request(app.getHttpServer()).get('/orders').expect(401);
    await request(app.getHttpServer())
      .post('/auth/sign-in')
      .send({ ...ada, password: 'not the password' })
      .expect(401);
  });
});

```

- `mailbox.assertSent()` 查找特定邮件类地址的最新邮件，然后 `link()` 返回包含路径的第一个链接，作为 `URL`。这就是验证、重置和魔术链接的完整流程：发送、查找链接、跟随链接。
- 重置电子邮件在响应之后发送（参见 [Reset forgotten passwords](/security/authentication#reset-forgotten-passwords)），因此测试使用 `vi.waitFor()` 等待它。其他电子邮件在路由响应之前发送。
- `DrizzleAuthenticationStore` 在 PGlite 上运行，与在 PostgreSQL 上运行的方式相同。PGlite 只有一个连接，因此两个请求在那里永远不会真正竞争；存储的 [contract tests](/security/authentication#keep-sessions-and-tokens-in-your-database) 在 PostgreSQL 上也运行，与在那里运行的方式相同。

要在不经过登录路由的情况下登录测试用户，`SessionService.create()` 返回一个会话 Cookie，`TokenService.issue()` 返回一个 bearer token（对于没有认证器的用户）。要测试不通过 HTTP 读取 `AuthenticationContext` 的代码，请将其作为用户运行：`run()` 接收一个认证结果（用户和可选的会话）和一个要运行的函数。

#### 生产检查清单

- **为模块维护的所有内容注册一个仓储**，如 [Keep sessions and tokens in your database](/security/authentication#keep-sessions-and-tokens-in-your-database) 所示，并通过迁移应用其表。应用程序的每个实例都使用它们，因此重启不会使任何人登出。当配置的特性使用的仓储未注册时，模块拒绝启动，但这仅在 `NODE_ENV` 为 `production` 时发生：设置它，或者忘记设置的部署将在内存中运行，仅有启动日志行说明这一点。使用 `concurrent: true` 在 PostgreSQL 上针对包的契约测试运行到您的仓储：它们会失败一个需要一个条件语句的读取后写入的仓储。
- **在共享用户数据库的每个应用程序中配置相同的特性**。每个应用程序根据自己的选项决定是否要求第二因素进行登录，以及在所有地方登出是否终止刷新令牌。如果任何登录用户的应用程序配置了 `mfa`，则所有应用程序都必须配置，否则通过其中一个注册的客户只能使用密码登录到另一个应用程序。同样配置 `accessToken`，在每个应用程序中开启刷新令牌，如果在一个应用程序中执行所有地方登出或密码重置，也应登出其他应用程序的令牌客户端。
- **通过真实提供者发送电子邮件**。设置 `SMTP_URL`，或传入另一个传输器。`LogMailTransport` 将每个链接写入日志，任何阅读日志的人都可能冒充客户登录。
- **通过 HTTPS 提供应用程序**，因为会话 Cookie 是 `Secure`。如果 Web 应用程序在与 API 不同的源上运行，请在 `session.trustedOrigins` 中列出它，否则其登录和魔术链接请求将被拒绝，并且其 `POST` 请求和 WebSocket 连接将是匿名的。在重写 `Host` 的代理后，也在此处列出公共源。保持 `cookie.secure` 开启：没有它的 `SameSite=None` Cookie 在启动时会失败，因为浏览器会丢弃它。
- **在 Nest 12.1 或更高版本上调用 `app.enableCsrfProtection()`**，使用相同的 `trustedOrigins`。它拒绝对所有路由进行跨域写入，而不仅仅是使用会话 Cookie 的路由。
- **将密钥保存在密钥管理器中**：JWT 密钥、TOTP 加密密钥、Google 客户端密钥和 SMTP 凭据。按照 [Add two-factor authentication](/security/authentication#add-two-factor-authentication) 描述轮换 TOTP 密钥。
- **构建验证和重置页面以 POST 令牌**，并从 `APP_URL` 提供它们。电子邮件扫描器会使用 GET 请求跟踪链接；在加载时使用令牌的页面将允许它们消耗该令牌。
- **保持 `forgot` 不泄露任何信息**。无论发生什么，都以相同的方式回答，就像 [`forgot` route](/security/authentication#reset-forgotten-passwords) 所做的那样，不要 `await` `request()`。注册仍然对已有账户的地址返回 409；如果这对您很重要，也以相同的方式回答注册，并向所有者发送电子邮件。
- **将生产重定向 URI 注册到 Google**，并将 `APP_URL` 设置为应用程序的公共源。
- **为 scrypt 调整服务器大小**。每个默认成本的哈希占用 128 MiB，在 libuv 线程池上（除非设置 `UV_THREADPOOL_SIZE`，否则为四个线程）。登录突发会排队，节流器会限制它们。
- **为节流器使用共享存储**，例如 Redis。其默认存储在每个进程的内存中计数，因此每个实例都独立计数，重启或部署会重置计数。在代理后启用 `trust proxy`。对于分散在许多 IP 地址的密码猜测，添加第三个节流器定义，其跟踪器仅为电子邮件。为其设置一个远高于客户日常输入错误次数的限制，并在除登录和令牌颁发外的路由上跳过它：任何知道地址的人都可以用完它，并且在重置之前阻止客户使用密码登录。
- **使用 `SignInService.rotateSession()` 在权限更改时轮换会话**。在登录期间更改密码，或客户开启/关闭双因素认证后，也应终止其其他会话和刷新令牌：使用当前会话作为 `except` 的 `SessionService.revokeAll()`，以及 `TokenService.revokeAll()`。知道旧密码的人仍可能登录。[password reset](/security/authentication#reset-forgotten-passwords) 会为您完成此操作。
- **将 API 密钥视为密钥**。表仅保留其哈希，并且密钥仅在创建时显示一次：泄露的数据库不会提供任何密钥，丢失的密钥将被撤销和替换，永不再次显示。密钥有效期为一年，因此提醒所有者在旧密钥仍然有效时创建新密钥。向您的密钥扫描器添加 `cat_` 模式（GitHub 密钥扫描需要自定义模式）以查找提交到仓库中的密钥并撤销它们。使用密钥发出的请求不发出任何事件：记录来自 `@CurrentSession()` 的 `keyId`，以便您知道哪个密钥做了什么。密码重置或所有地方登出不会更改密钥：如果它们也应切断密钥，则在这些事件上撤销它们。
- **保留审计跟踪**。`AuthenticationEvents` 在其 `events$` 流和 `node:diagnostics_channel` 上发布每次登录和登出、第二因素更改、重复使用的刷新令牌、密码重置和电子邮件验证事件。将它们存储在您的安全团队可以搜索到的地方。

警报重复的 `mfa-failed` 事件并带有 `locked: true`（拥有密码的人正在猜测代码），以及来自同一源的许多 `password-reset-requested` 事件但没有 `userId`（有人正在探测账户），以及 `session-touch-failed` 事件，这意味着会话存储拒绝写入。如果添加了 `@nestjs/authorization`，请在 `AuthorizationModule` 之前导入 `AuthenticationModule`。全局守卫按导入顺序运行，而授权需要认证设置的用户。其他顺序在启动时会失败。`@nestjs/authorization` 拒绝声明无检查的处理程序，并将 `@Public()` 计为一次：公共路由不需要 `@Can.Anyone()`。#### 存储契约

教程 [wrote the authentication store with Drizzle](/security/authentication#keep-sessions-and-tokens-in-your-database)。本节总结了六个契约对任何使用其他 ORM 编写的存储的要求。存储接口的每个方法在其文档注释中给出其规则，说明了该规则防止的竞态条件，并且包的契约测试会检查它们。

**注册。** 存储是一个普通的单例提供者，在其构造函数中通过契约名称在可注入的 `AuthenticationStorage` 上使用 `registerSource()` 注册：`sessions`、`refreshTokens`、`mfa`、`magicLinks`、`oidcStates` 和 `emailTokens`。方法名称在所有契约中绝不重复，因此一个类可以实现所有六个，或者多个类可以拆分它们。注册表会一次性检查每个存储的结构，除非通过 `replace: true`，否则拒绝为同一名称的第二个存储，并在 `AuthenticationModule` 初始化时锁定，记录每种状态的存储位置。没有存储的契约使用其内存默认值，在重启时会丢失所有内容，并且实例之间不共享。

**生产守卫。** 使用 `NODE_ENV=production` 时，如果配置的功能使用的契约没有存储，则在启动时失败，并列出每个缺失的接口：

| 已配置 | 契约 |
| --- | --- |
| 一个 `SessionCookieProvider` | `sessions` |
| `accessToken`，带有刷新令牌 | `refreshTokens` |
| `accessToken`，将 `refreshToken` 设置为 `false` | 无 |
| `mfa` | `mfa` |
| `magicLink` | `sessions`、`magicLinks` |
| `oidc` | `sessions`、`oidcStates` |
| `passwordReset` | `sessions`、`emailTokens` |
| `emailVerification` | `emailTokens` |

如果没有 `mfa`，则禁用双因素认证：登录不会读取 `mfa` 契约。刷新令牌仅在有 `accessToken` 时存在，因此如果没有它，或者将 `refreshToken` 设置为 `false`，则仅通过全局登出和重置密码来结束会话。一个未被任何已配置功能使用的契约会在第一次读取时失败，而不是在内存中运行。模块选项中的 `allowInMemoryStorage: true` 仍然接受内存存储，但之后每次重启或部署都会使所有用户登出并忘记已注册的认证器，并且实例之间不共享任何内容。

**必须是原子的方法。** 决定某事只发生一次的任何判断语句，绝不能是先读取后写入。其他方法是纯粹的读取、插入和删除。没有一个会获取事务：认证状态是独立写入的，绝不是作为业务事务的一部分。

| 契约 | 方法 | 必须是 | 原因 |
| --- | --- | --- | --- |
| `SessionStore` | `touchSession()` | 现有行的条件 `UPDATE`，仅将 `lastActiveAt` 推进 | 请求在登出后将会话写回会导致其恢复 |
| `SessionStore` | `deleteSession()` | 一个 `DELETE`，根据行计数确定是否删除该行 | 两个会话轮换或一次轮换和一次登出，只有一个可以获胜 |
| `RefreshTokenStore` | `markRefreshTokenUsed()` | 一个 `UPDATE ... WHERE used_at IS NULL`，计数行 | 窃贼和所有者同时刷新时不能都获胜 |
| `MfaStore` | `saveTotp()` | 一个保留更大 `lastUsedStep` 的 upsert | 保存记录不应重新打开刚刚被声称的步骤 |
| `MfaStore` | `claimTotpStep()`、`consumeRecoveryCode()` | 一个条件 `UPDATE`，一个 `DELETE`，计数行 | 重放的代码必须失败 |
| `MfaStore` | `recordMfaFailure()` | 一个插入，然后计数，每个都单独提交 | 一次并行猜测的突发不应全部看到低计数 |
| `MfaStore` | `saveRecoveryCodes()` | 一个事务：先删除，后插入 | 读取者绝不能看到一半的批次 |
| `MagicLinkStore`、`OidcStateStore`、`EmailTokenStore` | `consumeMagicLink()`、`consumeOidcState()`、`consumeEmailToken()` | 一个 `DELETE ... RETURNING` | 一个链接不应登录两个浏览器，或设置两个密码 |

一组刷新令牌在任何一个令牌被撤销时即被撤销，因此在撤销后保存的后继令牌也被撤销。待处理条目（魔术链接、OIDC 登录、电子邮件令牌）保持有界：每次保存都会删除已过期的，并且超过上限的按先过期顺序删除。

`touchSession()` 是尽力而为的：如果失败，请求将使用已读取的会话继续进行，并且一个 `session-touch-failed` 事件会报告它。`getSession()` 可以将 `extra` 设置为与会话一起查询读取的值，通常是其用户，用于 `SessionCookieProvider.validate()`。`createSession()` 从未接收到它，而 `listUserSessions()` 也没有设置它。

**使用 Prisma。** 教程中展示了使用 Drizzle 和 TypeORM 的存储，它们使用相同的表。Prisma 存储遵循相同的规则：

- **条件更新和删除**（`touchSession()`、`deleteSession()`、`markRefreshTokenUsed()`、`claimTotpStep()`、`consumeRecoveryCode()`）是带有条件在 `where` 中的 `updateMany()` 或 `deleteMany()`，并且它们的 `count`：`deleteSession()` 解析 `count > 0`。绝不应为 `touchSession()` 使用 `upsert()`：它可能会写回刚刚被删除的会话。
- **`saveTotp()`** 在其 upsert 中需要 `GREATEST(..., excluded.last_used_step)`。Prisma 的 upsert API 不接受冲突行的表达式，因此它是原始 SQL，带有 `$executeRaw`。
- **`consume` 方法**是带有每个条件在 `where` 中的 `delete()`（ID 和对于 `consumeEmailToken()` 的目的），当没有匹配项时抛出 `P2025`：将其转换为 `undefined`。
- **`recordMfaFailure()`** 是两个独立的语句：一个 `create()`，然后是一个 `count()`。而不是 `prisma.$transaction([create, count])`，后者在一个事务中运行，该事务在计数后提交。
- **`saveRecoveryCodes()`** 是需要事务的唯一方法：`$transaction()`，其数组形式也适用。

使用 `@nestjs/authentication/testing` 中的套件进行测试，就像教程中做的那样。`authenticationStoreContract()` 返回其工厂返回的契约的任何测试运行器的案例。`concurrent: true` 添加了竞态条件：一个令牌的并行刷新、一个代码或链接的并行使用、失败代码的突发、登出与请求的竞态、一个会话的并行删除，以及一次轮换与登出或另一次轮换的竞态。使用带有连接池的 PostgreSQL 进行测试，其中读取然后写入的存储会使这些测试失败。`maxPending` 检查待处理条目的上限，为测试配置了一个小的上限。该套件在比较 `getSession()` 返回的内容时忽略 `extra`，因此连接用户的存储通过测试。

#### 参考

##### 模块选项

`AuthenticationModule.forRoot()` 接受这些选项，`forRootAsync()` 工厂返回它们，但 `isGlobal` 和 `globalGuard` 保持在顶层。生命周期以毫秒或诸如 `'30s'`、`'15m'` 和 `'14d'` 的字符串表示，最长可达 100 年；更长的生命周期会在启动时失败。每个带有时钟的组还接受 `now`，一个返回纪元毫秒的函数，用于测试。

| 选项 | 默认值 | 描述 |
| --- | --- | --- |
| `isGlobal` | `true` | 全局注册该模块。 |
| `globalGuard` | `true` | 将 `AuthenticationGuard` 注册为全局守卫。使用 `false` 时，路由在使用 `@UseGuards(AuthenticationGuard)` 之前保持开放。 |
| `allowInMemoryStorage` | `false` | 在一个特征使用的契约没有存储时启动。参见 [Keep sessions and tokens in your database](/security/authentication#keep-sessions-and-tokens-in-your-database)。 |
| `session.cookieName` | `__Host-sid` | 会话 Cookie；当 `cookie` 规则排除 `__Host-` 前缀时使用。 |
| `session.absoluteTtl` | `'7d'` | 会话的最大生命周期，无论其活跃程度如何。 |
| `session.idleTtl` | `'1d'` | 空闲超时，活动会延长此时间。`0` 会禁用它。 |
| `session.touchInterval` | `'1m'` | 最多多久将活动写入存储。短于 `idleTtl`，除非是 `0`：更长的生命周期会在启动时失败，因为活跃用户将被视为空闲而登出。 |
| `session.cookie` | `secure: true`, `sameSite: 'lax'`, `path: '/'` | Cookie 属性：`secure`, `sameSite`, `path`, `domain`。`HttpOnly` 始终设置。 |
| `session.trustedOrigins` | none | 其他可能使用会话 Cookie 进行写入和登录的来源。 |
| `session.metadata` | none | 登录请求的函数，其结果会与每个新会话一起存储。参见 [Let customers manage their sessions](/security/authentication#let-customers-manage-their-sessions)。 |
| `password.logN` | `17` | scrypt 成本 N 的以 2 为底的对数，一个从 10 到 22 的整数。`r`（默认 `8`，最高 32）、`p`（`1`，最高 16）、`keyLength`（`32`）和 `saltLength`（`16`，两者从 16 到 64）设置其他参数。一个哈希最多可能占用 1 GiB 内存 (128·N·r 字节) 和默认工作量的 16 倍 (N·r·p)，因此当 `r` 为 8 时，`logN` 停止在 20。 |
| `accessToken.key` | required | 至少 32 字节的 HS256 密钥，或用于 RS256、ES256 或 EdDSA 的私钥，以 PEM 文本或 `KeyObject` 形式提供。JWK 或 DER 密钥会在启动时失败：使用 `createPrivateKey()` 导入。参见 [Issue tokens to the mobile app](/security/authentication#issue-tokens-to-the-mobile-app)。 |
| `accessToken.alg` | from the key | 签名算法：使用密钥的 HS256，使用私钥自身的算法。 |
| `accessToken.issuer`, `audience` | none | 写入和检查每个令牌的 `iss` 和 `aud` 声明。 |
| `accessToken.ttl` | `'15m'` | 访问令牌的生命周期。 |
| `accessToken.kid`, `type` | none, `JWT` | `kid` 和 `typ` 头部。 |
| `refreshToken` | on with `accessToken` | `false` 仅签发访问令牌，不包含刷新令牌和不包含 `RefreshTokenStore`。参见 [Issue tokens to the mobile app](/security/authentication#issue-tokens-to-the-mobile-app)。 |
| `refreshToken.ttl` | `'30d'` | 单个刷新令牌的生命周期。 |
| `refreshToken.absoluteTtl` | `'90d'` | 刷新令牌家族的最大生命周期，无论其旋转频率如何。 |
| `mfa.encryption` | required | `keys`，一个 AES-256-GCM 密钥列表，最新在前，加上 `migratePlaintext`（默认 `false`）；或使用 `false` 以明文存储密钥。参见 [Add two-factor authentication](/security/authentication#add-two-factor-authentication)。 |
| `mfa.issuer` | none | 认证应用显示的名称。 |
| `mfa.window` | `1` | 当前时间两侧可接受的 30 秒步长，一个从 0 到 10 的整数。 |
| `mfa.maxAttempts` | `5` | 在每次代码被拒绝之前，允许的失败代码次数，一个至少为 1 的整数。 |
| `mfa.lockoutWindow` | `'15m'` | 失败代码计数的窗口期。 |
| `mfa.recoveryCodes` | `10` | 每批次的恢复代码数量，一个至少为 1 的整数。 |
| `mfa.pendingTtl` | `'10m'` | 会话等待第二因子的最长时间。 |
| `emailVerification.url` | required | 页面验证链接打开。`ttl` 默认为 `'24h'`。参见 [Verify email addresses](/security/authentication#verify-email-addresses)。 |
| `passwordReset.url` | required | 页面重置链接打开。`ttl` 默认为 `'1h'`。参见 [Reset forgotten passwords](/security/authentication#reset-forgotten-passwords)。 |
| `magicLink.url` | required | 页面魔术链接打开。`ttl` 默认为 `'15m'`。参见 [Add magic-link sign-in](/security/authentication#add-magic-link-sign-in)。 |
| `magicLink.bindToBrowser` | `true` | 仅在请求该链接的浏览器中接受链接。 |
| `magicLink.cookie` | `secure: true` | `__Host-magic_link_tx` 交易 Cookie 的属性。 |
| `oidc.callbackUrl` | required | 公共回调 URL，其中使用 `:provider` 替换提供者名称，或一个返回该 URL 的请求函数。参见 [Add "Sign in with Google"](/security/authentication#add-sign-in-with-google)。 |
| `oidc.providers` | required | 按名称配置的提供者，例如 `google()`、`github()` 和 `microsoft()`，它还接受目录的 `tenant` id，或一个返回该名称的函数。参见 [Add "Sign in with Google"](/security/authentication#add-sign-in-with-google)。 |
| `oidc.redirectAfterLogin` | `/` | 登录没有 `redirectTo` 时到达的页面。 |
| `oidc.transactionTtl` | `'10m'` | 从重定向到回调之间登录允许花费的时间。 |
| `oidc.cookie` | `secure: true` | `__Host-oidc_tx` 交易 Cookie 的属性。 |
| `oidc.discoveryTtl`, `clockTolerance` | `'1h'`, `'30s'` | 发现文档的信任时长以及 ID 令牌时间声明的容忍度。 |

`emailVerification`、`passwordReset`、`magicLink` 和 `oidc` 功能还需要注册同名的处理程序；缺少其中任何一个都会在启动时失败。超出上述范围的值，包括 `Number()` 对未设置的环境变量的判断中的 `NaN`，也会导致启动失败。

##### 路由选项

`@Authenticate()` 在类或方法上接受这些选项：

| 选项 | 描述 |
| --- | --- |
| `optional` | 允许匿名调用者通过，用户为 `null`。凭据无效仍返回 401。 |
| `mfa` | 要求经过验证的第二因素：一个已验证的会话，或一个 `amr` 包含 `mfa`、`otp` 或 `hwk` 的 JWT。API 密钥永远不满足此要求。参见 [Add two-factor authentication](/security/authentication#add-two-factor-authentication)。 |
| `verifiedEmail` | 要求经过验证的电子邮件地址，否则返回 403 附带 `email_unverified`。参见 [Read the current user](/security/authentication#read-the-current-user)。 |
| `providers` | 只有这些提供者类或它们的子类才能认证此路由。 |

##### API 密钥

`ApiKeyProvider` 在 `super()` 中接受这些选项。参见 [Issue API keys to partners](/security/authentication#issue-api-keys-to-partners)。

| 选项 | 默认值 | 描述 |
| --- | --- | --- |
| `prefix` | required | 每个密钥都以 `cat_<id>_<secret>` 开始：1 到 16 个小写字母和数字，以字母开头。 |
| `realm` | `api` | `WWW-Authenticate` 挑战中的领域。 |

您的子类实现 `findKey(id)`，该方法返回密钥的存储的 `hash`、其 `user` 和其 `expiresAt`，或者对于不存在、已被撤销或所有者已消失的密钥返回 `null`。`generate()` 以 `key` 的形式返回一个新密钥，该密钥只显示一次，并附带 `id` 和 `hash` 以供存储。使用密钥发起的请求中，会话是该密钥的 `keyId` 和 `expiresAt`，其中 `method` 设置为 `api-key`。

##### 事件

`AuthenticationEvents` 在其 `events$` 可观察对象上发布每个事件，同时在 `nestjs:authentication:<type>` 诊断通道上发布，例如 `nestjs:authentication:sign-in`。

| 类型 | 有效载荷 | 何时 |
| --- | --- | --- |
| `sign-in` | `userId`、`sessionId` 或 `tokenFamilyId`、`method`、`mfa`、`metadata` | `SignInService.signIn()` 或 `TokenService.issue()` 登录用户 |
| `sign-out` | `userId`、`sessionId`、`tokenFamilyId` 或 `everywhere` | 会话、刷新令牌家族或全部结束 |
| `mfa-verified` | `userId`、`method` (`totp` 或 `recovery-code`) | 接受了代码 |
| `mfa-failed` | `userId`、`method`、`failures`、`locked` | 代码被拒绝，包括在锁定期间 |
| `mfa-enabled` | `userId`、`replaced` | 确认了认证器 |
| `mfa-disabled` | `userId` | 移除了认证器和恢复代码 |
| `recovery-codes-generated` | `userId`、`count` | 新的恢复代码批次替换了旧的 |
| `refresh-token-reused` | `userId`、`tokenFamilyId` | 消耗的刷新令牌返回，并且其家族已被撤销 |
| `password-reset-requested` | `email`、`userId` (对于未知地址缺失) | 有人请求重置链接 |
| `password-reset` | `userId` | 重置链接设置了新密码 |
| `email-verified` | `userId`、`email` | 使用了验证链接 |
| `magic-link-refused` | `reason` (`not-this-browser`、`unknown`、`expired` 或 `refused`)、`email` | 魔术链接未登录任何人 |
| `session-touch-failed` | `userId`、`sessionId`、`error` | `SessionStore.touchSession()` 失败；请求继续进行，会话的空闲截止时间未移动 |

##### 错误

`AuthenticationError` 是包错误的基类。它携带 `status`，并且可选地携带 `code`、`details` 和 `challenge`（`WWW-Authenticate` 头部）。从处理程序或其调用的任何地方抛出时，它成为 Nest 自己的 HTTP 异常、GraphQL `UNAUTHENTICATED`、一个 `WsException` 或一个 `RpcException`。它的 `code` 是 Nest 的 `errorCode`。在 HTTP 和 GraphQL 上，它设置在异常上，因此异常过滤器读取 `exception.errorCode`，Nest 将其放入正文，或在 GraphQL 中放入 `extensions.originalError`。ws 和 rpc 有效载荷携带相同的 `errorCode` 键。带有消息的拒绝也会像始终那样将代码作为 `error` 发送。一个纯对象 `details` 作为 `details` 发送；错误的其余部分（`cause`，堆栈）不会到达客户端。例如，使用 `too_many_attempts` 作为 `code` 并在 `details` 中使用 `retryAfter: 30` 的 `new AuthenticationError('Too many attempts', options)` 回复：

```json
{"message":"Too many attempts","error":"too_many_attempts","statusCode":401,"errorCode":"too_many_attempts","details":{"retryAfter":30}}

```

| 错误 | 状态 | `errorCode` | `error` | 何时 |
| --- | --- | --- | --- | --- |
| `AuthenticationError` | 401 | 任何 `code`，如果有 | 其 `code`；否则带有消息的 `Unauthorized`，无消息则无 | 凭据无效，或没有用户但有 `requireUser()` (无消息，无代码) |
| `JwtError` | 401 | 无 | `Unauthorized` | 令牌格式错误、签名错误、已过期或用于其他发行者或受众 |
| `RefreshTokenError` | 401 | 无 | `Unauthorized` | 刷新令牌无效、已过期或重复使用；`reason` 说明了哪个 |
| `MagicLinkError` | 401 | `not_this_browser` | `not_this_browser` | 魔术链接在请求它的浏览器之外的浏览器中打开，或在该浏览器请求了五个较新的链接之后 |
| `MfaAlreadyEnrolledError` | 409 | 无 | `Conflict` | 对于已确认认证器的用户，有 `enroll()` 但没有 `replace: true` |

当任何提供者不识别任何凭据时，守卫返回 401 附带 `missing_credentials`，且没有 `error`：

```json
{"message":"Unauthorized","statusCode":401,"errorCode":"missing_credentials"}

```

这涵盖了没有凭据的请求、陈旧或未知的会话 Cookie（这算作无，因此可选路由仍可工作），以及路由的 `providers` 不接受的凭据。守卫和 `TokenService.issue()` 在缺少第二因素时也返回 401 附带 `mfa_required`，在 `verifiedEmail` 路由上返回 403 附带 `email_unverified`，两者都作为 `errorCode` 和 `error`。OIDC 路由对错误的或伪造的回调返回 400，当提供者的回答验证失败或链接流程没有已登录会话时返回 401，当解析器拒绝账户或链接流程从其他站点启动时返回 403，对于未配置的提供者名称返回 404，当无法到达或配置错误的提供者时返回 502，例如非 https 端点或无法加载的密钥集。`SignInService.signIn()` 和 `MagicLinkService.create()` 对来自其他源的请求返回 403。