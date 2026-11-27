<!-- 此文件从 content/security/authorization.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:40:08.235Z -->
<!-- 源文件: content/security/authorization.md -->
<!-- 源哈希: 4bab3db5b628dd0a2c3d2972c9e9a6c3 -->

### 授权

`@nestjs/authorization` 将权限表示为**策略**：其方法回答“此用户是否可以执行此操作？”的类。策略是一个普通的提供者，因此它可以注入服务，并且每次检查都会根据其调用的策略方法进行类型检查。策略适用于任何数据形状，包括 Prisma、Drizzle 和 Kysely 返回的纯对象。

> info **提示** 要在完整应用程序中查看策略，请遵循 [Build an e-commerce backend in Node.js](/tutorials/ecommerce-backend)，其中只有员工可以编辑目录，或遵循 [Build a project-management API in Node.js](/tutorials/project-management-api)，其中权限是逐条记录检查的。

在本教程中，您将为在线商店的猫粮和用品 API 添加权限：

- 访客和客户浏览已发布的商品。员工也可见草稿，只有员工编辑目录。
- 客户只能看到自己的订单。员工可以看到所有订单。
- 只有员工才能退款，并且仅限于财务为每人设定的限额，且仅针对已付款的订单。已发货的订单不允许退款。
- 管理员无限制地管理目录。

在此过程中，您将了解每种检查应属于何处（在路由上还是在服务中），何时拒绝是 401 还是 403，以及如何测试策略。

#### 先决条件

本教程承接 [Authentication](/security/authentication) 教程：商店使用 `@nestjs/authentication` 为用户登录，而本页面决定他们可以做什么。安装该包：

```bash
$ npm i --save @nestjs/authorization

```

如果您是全新开始，以下文件是本页面依赖的登录代码：认证教程的应用在 [issues tokens to the mobile app](/security/authentication#issue-tokens-to-the-mobile-app) 后简化为移动应用的登录，即用于持有者令牌的密码。用户是与您的 ORM 返回的相同纯对象：

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

四个演示账户代表用户表：两个客户（Alice 和 Bob），一名员工（Sam），以及 Ada，她既是员工又是管理员。它们的 id 是固定的，因此演示订单和测试可以引用它们：

```typescript title="src/users/demo-users.ts"
import type { User } from './user.js';

/**
 * The demo accounts. They all sign in with the password "catnip4all", and the
 * seeded orders refer to their ids.
 */
export const alice: User = {
  id: '1f794c55-472e-42b9-8913-4114964ed6fb',
  email: 'alice@example.com',
  emailVerified: true,
  roles: ['customer'],
};

export const bob: User = {
  id: 'fc27b5c1-62b5-494e-9924-28a66d387fd1',
  email: 'bob@example.com',
  emailVerified: true,
  roles: ['customer'],
};

export const sam: User = {
  id: '208a223b-3503-4255-83e7-22d290e331c3',
  email: 'sam@example.com',
  emailVerified: true,
  roles: ['staff'],
};

export const ada: User = {
  id: 'ae34ca97-f82b-49ab-b332-8808f3b0e240',
  email: 'ada@example.com',
  emailVerified: true,
  roles: ['staff', 'admin'],
};

export const demoUsers = [alice, bob, sam, ada];

```

`UsersRepository` 是认证教程的一部分，包含本页面所需的两个方法。它在启动时播种演示账户，并且只有 `User` 对象会离开它：密码哈希保持在内部。

```typescript title="src/users/users.repository.ts"
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import { demoUsers } from './demo-users.js';
import type { User } from './user.js';

interface UserRow extends User {
  passwordHash: string | null;
}

/**
 * In-memory stand-in for your data layer (Prisma, Drizzle, TypeORM, ...).
 * Only `User` objects leave this class: password hashes stay inside.
 */
@Injectable()
export class UsersRepository implements OnModuleInit {
  private readonly rows = new Map<string, UserRow>();

  constructor(private readonly passwordHasher: PasswordHasher) {}

  async onModuleInit() {
    // Seeds the demo accounts, all with the password "catnip4all".
    const passwordHash = await this.passwordHasher.hash('catnip4all');
    for (const user of demoUsers) {
      this.rows.set(user.id, { ...user, passwordHash });
    }
  }

  async findById(id: string): Promise<User | null> {
    const row = this.rows.get(id);
    return row ? toUser(row) : null;
  }

  /** For password sign-in only. */
  async findCredentials(email: string): Promise<{ user: User; passwordHash: string | null } | null> {
    const row = this.findRow(email);
    return row ? { user: toUser(row), passwordHash: row.passwordHash } : null;
  }

  private findRow(email: string) {
    const normalized = normalize(email);
    return [...this.rows.values()].find((row) => row.email === normalized);
  }
}

const normalize = (email: string) => email.trim().toLowerCase();
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

令牌是认证教程为其移动应用颁发的：短期 JWT 访问令牌，由根模块传递给下面的 `AuthenticationModule` 的 `accessToken` 选项描述。签名密钥是认证教程的 `.env` 文件中的 `JWT_SECRET`，至少 32 字节：

```bash
# Generate with: openssl rand -base64 32
JWT_SECRET=

```

> info **提示** 教程直接读取 `process.env` 以保持简洁。在应用程序中，请通过 [`@nestjs/config`](/application/configuration) 使用验证模式加载环境变量，这样缺少密钥会阻止应用程序在启动时运行，并从 `ConfigService` 读取它。

`JwtAuth` 使用 `accessToken` 选项验证持有者令牌，并加载令牌的用户。它通过构造函数向 `AuthenticationRegistry` 注册自身，这就是守卫了解它的方式：

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
    // Adds this provider to the chain the guard runs for every request.
    registry.registerProvider(this);
  }

  // Called after the signature and claims checked out.
  // Returning null (the user was deleted) rejects the token.
  validate({ sub }: JwtClaims) {
    return sub ? this.usersRepository.findById(sub) : null;
  }
}

```

`CredentialsService` 使用包的 `PasswordHasher` 检查密码是否与存储的哈希匹配，并同时对未知电子邮件和错误的密码回答 `null`：

```typescript title="src/auth/credentials.service.ts"
import { Injectable } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import type { User } from '../users/user.js';
import { UsersRepository } from '../users/users.repository.js';

@Injectable()
export class CredentialsService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  /** The user, or `null` when the email or the password is wrong. */
  async verify(email: string, password: string): Promise<User | null> {
    const found = await this.usersRepository.findCredentials(email);
    // With no account (or no password), verify() checks a dummy hash, so the
    // response time does not reveal which emails are registered.
    const valid = await this.passwordHasher.verify(password, found?.passwordHash);
    if (!valid || !found?.passwordHash) {
      return null;
    }
    return found.user;
  }
}

```

`TokensController` 用电子邮件和密码交换令牌。其请求体使用您的应用程序已有的任何方式进行验证。本页面上的每个 DTO 都出现两次，一次是带有装饰器的类，一次是 Zod 模式，因此请选择您已有的风格并跳过另一个列表：

```typescript title="src/auth/auth.dto.ts"
import { IsEmail, IsString } from 'class-validator';

export class SignInDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

```

```typescript title="src/auth/auth.schemas.ts"
import { z } from 'zod';

export const signInSchema = z.object({
  email: z.email(),
  password: z.string(),
});
export type SignInDto = z.infer<typeof signInSchema>;

```

`TokenService.issue()` 使用相同的 `accessToken` 选项对访问令牌进行签名，并返回访问令牌和刷新令牌：

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
}

```

使用 Zod 模式时，body 参数声明其模式而不是一个类：

```typescript title="src/auth/tokens.controller.ts"
import { signInSchema, type SignInDto } from './auth.schemas.js';
// ...
@Post()
@HttpCode(200)
async issue(@Body({ schema: signInSchema }) body: SignInDto) {
  // ...
}

```

> info **提示** DTO 仅由验证管道强制执行：全局绑定 `ValidationPipe`，作为 `APP_PIPE` 提供者提供 `AppModule`，或在 `main.ts` 中使用 `useGlobalPipes()`。使用 Zod 模式时，以相同方式绑定 `StandardSchemaValidationPipe`。应用程序使用其中一种。[validation](/techniques/validation) 页面包含每种选项。

```typescript title="src/auth/auth.module.ts"
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { CredentialsService } from './credentials.service.js';
import { JwtAuth } from './jwt-auth.provider.js';
import { TokensController } from './tokens.controller.js';

@Module({
  imports: [UsersModule],
  controllers: [TokensController],
  providers: [JwtAuth, CredentialsService],
})
export class AuthModule {}

```

认证将已登录的 `User` 放在 `request.user` 上，然后 `@CurrentUser()` 将其注入到处理程序中。这就是授权需要的全部。

#### 注册授权模块

在根模块中将 `AuthorizationModule` 导入到 `AuthenticationModule` 旁边。`AuthenticationModule` 像认证教程中那样注册，使用 `accessToken` 选项；`JwtAuth` 是 `AuthModule` 的提供者：

```typescript title="src/app.module.ts"
import { Module } from '@nestjs/common';
import { AuthenticationModule } from '@nestjs/authentication';
import { AuthorizationModule } from '@nestjs/authorization';
import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [
    // Authentication first: its guard sets request.user, which authorization reads.
    AuthenticationModule.forRootAsync({
      useFactory: () => ({
        accessToken: {
          key: process.env.JWT_SECRET!,
          issuer: 'https://api.example.com',
          audience: 'mobile-app',
          ttl: '15m',
        },
      }),
    }),
    AuthorizationModule.forRoot(),
    AuthModule,
  ],
})
export class AppModule {}

```

`forRoot()` 全局注册该模块。它做三件事：

- 它提供 `AuthorizationService`，您可以在任何需要检查权限的代码中注入它。
- 它将 `AuthorizationGuard` 注册为全局守卫。该守卫强制执行您在下一步中添加的 `@Can()` 装饰器，并且**默认拒绝**：只有当处理程序声明了检查，并使用 `@Can()`、使用 `@Can.Anyone()` 或使用来自 `@nestjs/authentication` 的 `@Public()` 时才会运行，这算作 `@Can.Anyone()`。`POST /auth/token` 是 `@Public()`，所以它继续工作。
- 它将服务报告的拒绝转换为 401 或 403，如 [Tell guests from forbidden users, and expose permissions](/security/authorization#tell-guests-from-forbidden-users-and-expose-permissions) 所述。

因此，忘记了 `@Can()` 的路由是关闭的，而不是开放的。在启动时，模块会记录它将以这种方式拒绝的每个处理程序，因此该列表是迁移的起点。[reference](/security/authorization#what-a-route-declares) 包含完整的规则。

两个包都注册了一个全局守卫，**导入顺序很重要**。Nest 按照扫描模块的顺序运行全局守卫，因此 `AuthenticationModule` 必须先出现。反向顺序，授权守卫将在任何设置 `request.user` 之前运行，因此每个 `@Can()` 检查都会看到访客，而已登录的员工在员工专用路由上会收到 401。`AuthorizationModule` 在启动时检查订单：它通过守卫携带的标记识别 `AuthenticationGuard`，当该守卫排在第二位时，应用程序拒绝启动，并带有命名了两个守卫和修复的错误。

> warning **警告** 其他认证守卫，例如 Passport `AuthGuard()` 的子类，不携带此类标记，因此检查只能通过它们的类名进行。顺序错误时，它会记录错误，应用程序启动，并且每个 `@Can()` 检查都将已登录用户视为访客。请使用 `APP_GUARD` 注册此类守卫，而不是使用 `app.useGlobalGuards()`：Nest 在每次 `APP_GUARD` 后运行添加的守卫，因此它们总是排在授权守卫之后，检查无法看到它们。

> info **提示** 守卫从 `request.user` 读取用户，并从 WebSocket、微服务和 GraphQL 的等效位置读取。使用 `@nestjs/authentication`，在 WebSocket 或 `graphql-ws` socket 上，它是每个消息或操作的用户，而不是 socket 的用户，如 [reference](/security/authorization#reference) 所述。如果您的认证将用户存储在其他地方，请将一个 `getUser` 函数传递给 `forRoot()`，或者在需要提供者时从 `forRootAsync()` 工厂返回一个。如果您使用 `@UseGuards()` 而不是全局守卫进行认证，请传递 `globalGuard: false` 并将 `AuthorizationGuard` 放在您的认证守卫之后。

#### 为产品编写策略

产品也是纯对象，通过 slug 标识，并以分（cents）计价，如认证教程所示：

```typescript title="src/products/product.ts"
export interface Product {
  /** A slug, such as `salmon-kibble-2kg`. */
  id: string;
  name: string;
  /** In cents. */
  price: number;
  published: boolean;
}

export type ProductInput = Omit<Product, 'id'>;

```

策略是一个用 `@Policy()` 装饰的类。其第一个参数是用户并返回 `boolean` 或 `Promise<boolean>` 的每个方法都是一个**能力**。只有字面量 `true` 才允许。任何其他值都拒绝，即使是真值。

```typescript title="src/products/product.policy.ts"
import { Policy } from '@nestjs/authorization';
import type { User } from '../users/user.js';
import type { Product } from './product.js';

const isStaff = (user: User | null) => !!user?.roles.includes('staff');

@Policy()
export class ProductPolicy {
  // `null` is a guest. Everyone sees published products; staff also see drafts.
  view(user: User | null, product: Product) {
    return product.published || isStaff(user);
  }

  viewDrafts(user: User | null) {
    return isStaff(user);
  }

  create(user: User | null) {
    return isStaff(user);
  }

  update(user: User | null) {
    return isStaff(user);
  }
}

```

用户参数的类型是一个决策。`User | null` 意味着该能力也对访客运行，访客以 `null` 的形式到达。访客可以浏览目录，因此这里的每个能力都接受 `null`，而 `view` 和 `viewDrafts` 为访客提供真实答案。

`ProductsService` 以两种方式使用策略。`can()` 解析为 `true` 或 `false`；在这里它决定列表是否包含草稿。`authorize()` 在能力拒绝时抛出，因此 `findOne()` 绝不会向可能看不到草稿的人返回草稿。

```typescript title="src/products/products.service.ts"
import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthorizationService } from '@nestjs/authorization';
import type { User } from '../users/user.js';
import type { Product, ProductInput } from './product.js';
import { ProductPolicy } from './product.policy.js';

@Injectable()
export class ProductsService {
  // Stands in for your products table.
  private readonly products: Product[] = [
    { id: 'salmon-kibble-2kg', name: 'Salmon kibble, 2 kg', price: 2499, published: true },
    { id: 'clumping-litter-10l', name: 'Clumping litter, 10 l', price: 1599, published: true },
    { id: 'heated-cat-bed', name: 'Heated cat bed', price: 5499, published: false },
  ];

  constructor(private readonly authorizationService: AuthorizationService) {}

  async findAll(user: User | null) {
    const withDrafts = await this.authorizationService.can(ProductPolicy, 'viewDrafts', user);
    return withDrafts ? this.products : this.products.filter((product) => product.published);
  }

  async findOne(user: User | null, id: string) {
    const product = this.find(id);
    await this.authorizationService.authorize(ProductPolicy, 'view', user, product);
    return product;
  }

  create(input: ProductInput) {
    const product = { ...input, id: slug(input.name) };
    this.products.push(product);
    return product;
  }

  update(id: string, changes: Partial<ProductInput>) {
    return Object.assign(this.find(id), changes);
  }

  remove(id: string) {
    this.products.splice(this.products.indexOf(this.find(id)), 1);
  }

  private find(id: string) {
    const product = this.products.find((product) => product.id === id);
    if (!product) {
      throw new NotFoundException();
    }
    return product;
  }
}

/** `Sisal scratching post` → `sisal-scratching-post`. */
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

```

创建和更新产品不依赖于特定记录，因此这些检查放在路由上。这些路由的体是 DTO，可以是类或 Zod 模式；更新接受新产品字段的任何子集：

```typescript title="src/products/products.dto.ts"
import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsPositive, IsString, MinLength } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsPositive()
  price: number;

  @IsBoolean()
  published: boolean;
}

/** Any subset of the fields above. */
export class UpdateProductDto extends PartialType(CreateProductDto) {}

```

```typescript title="src/products/products.schemas.ts"
import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().min(1),
  price: z.number().positive(),
  published: z.boolean(),
});
export type CreateProductDto = z.infer<typeof createProductSchema>;

/** Any subset of the fields above. */
export const updateProductSchema = createProductSchema.partial();
export type UpdateProductDto = z.infer<typeof updateProductSchema>;

```

`@Can(ProductPolicy, 'create')` 在处理程序运行前调用 `create(user)`：

```typescript title="src/products/products.controller.ts"
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Authenticate, CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import type { User } from '../users/user.js';
import { ProductPolicy } from './product.policy.js';
import { CreateProductDto, UpdateProductDto } from './products.dto.js';
import { ProductsService } from './products.service.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Authenticate({ optional: true })
  @Can.Anyone()
  findAll(@CurrentUser() user: User | null) {
    return this.productsService.findAll(user);
  }

  @Get(':id')
  @Authenticate({ optional: true })
  @Can.Anyone()
  findOne(@CurrentUser() user: User | null, @Param('id') id: string) {
    return this.productsService.findOne(user, id);
  }

  @Post()
  @Can(ProductPolicy, 'create')
  create(@Body() input: CreateProductDto) {
    return this.productsService.create(input);
  }

  @Patch(':id')
  @Can(ProductPolicy, 'update')
  update(@Param('id') id: string, @Body() changes: UpdateProductDto) {
    return this.productsService.update(id, changes);
  }
}

```

使用 Zod 模式时，体参数声明其模式而不是类：

```typescript title="src/products/products.controller.ts"
import { createProductSchema, updateProductSchema, type CreateProductDto, type UpdateProductDto } from './products.schemas.js';
// ...
@Post()
@Can(ProductPolicy, 'create')
create(@Body({ schema: createProductSchema }) input: CreateProductDto) {
  return this.productsService.create(input);
}

@Patch(':id')
@Can(ProductPolicy, 'update')
update(@Param('id') id: string, @Body({ schema: updateProductSchema }) changes: UpdateProductDto) {
  return this.productsService.update(id, changes);
}

```

路由是否允许访客是认证的决定，而不是策略的决定。读取路由使用 `@Authenticate()` 和 `optional: true`：带有有效令牌的 ⟦Request⟧ 会获取其用户，而没有令牌的 ⟦Request⟧ 继续使用 `null`，这是 `@CurrentUser()` 注入的内容。如果没有装饰器，在任何策略运行之前访客将收到 401。使用 `@Public()` 代替，认证将完全忽略令牌，因此 Sam 将作为访客浏览，永远看不到草稿。

读取路由在 ⟦Service⟧ 中检查，因此它们声明 `@Can.Anyone()`：任何认证允许通过的人都可以调用它们，而 `ProductsService` 决定每个调用者看到什么。没有它，守卫会拒绝他们。

`@Can()` 经过类型检查。拼写错误的能力不会编译：

```typescript
@Post()
@Can(ProductPolicy, 'craete')
// error TS2345: Argument of type '"craete"' is not assignable to parameter of type '"create" | "update" | "view" | "viewDrafts"'.
create(@Body() input: CreateProductDto) {}

```

错误会列出在路由上有效的能力：其用户参数接受 `null` 的能力，因为守卫不知道路由是否有用户。`view` 是其中之一，但 `@Can(ProductPolicy, 'view')` 仍然不会编译（`Expected 3 arguments, but got 2`）：`view` 也接收产品，而守卫没有可传递的。需要记录的检查应放在 ⟦Service⟧ 中，如 `findOne()` 所示。仅需要 URL 中的 id 的检查可以保留在路由上，如 [Check a route parameter](/security/authorization#check-a-route-parameter) 所示。

最后，将策略注册为其功能 ⟦Module⟧ 的 ⟦Provider⟧：

```typescript title="src/products/products.module.ts"
import { Module } from '@nestjs/common';
import { ProductPolicy } from './product.policy.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ProductPolicy],
})
export class ProductsModule {}

```

将 `ProductsModule` 添加到 `AppModule` 的 `imports` 中。`@Policy()` 也使该类可注入，并且授权 ⟦Module⟧ 会发现应用中注册的每个策略 ⟦Provider⟧，无论它在哪里注册。或者，在 `AuthorizationModule.forRoot()` 的 `policies` 选项中列出策略。

> info **提示** 如果 `@Can()` 指向未注册的策略，应用将拒绝启动，并且错误会命名处理程序。

#### 按记录检查订单

订单是认证教程中的：它属于一个客户，通过 `userId`，并经历几个状态：

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

Alice 是否可以查看 Bob 的订单之一取决于该订单，因此这些能力将订单作为第二个参数：

```typescript title="src/orders/order.policy.ts"
import { Policy } from '@nestjs/authorization';
import type { User } from '../users/user.js';
import type { Order } from './order.js';

@Policy()
export class OrderPolicy {
  viewAll(user: User) {
    return user.roles.includes('staff');
  }

  // Customers see their own orders; staff see everyone's.
  view(user: User, order: Order) {
    return order.userId === user.id || user.roles.includes('staff');
  }

  // Staff refund paid orders. Pending, shipped and refunded orders
  // can't be refunded by anyone.
  refund(user: User, order: Order) {
    return user.roles.includes('staff') && order.status === 'paid';
  }
}

```

这些能力接收 `User`，而不是 `User | null`。每个订单路由都需要已登录用户，而仅由 ⟦Service⟧ 调用的能力可以声明这一点。编译器随后会使调用者在检查之前排除缺少用户的情况。

四个演示订单代替了订单表，具有固定的 id，类似于演示账户：Alice 有一个已支付和一个已发货的订单，Bob 有一个包含五袋三文鱼幼鱼干的已支付订单（124.95，这在 [a policy injects a service](/security/authorization#inject-a-service-into-a-policy) 时很重要）和一个待处理订单：

```typescript title="src/orders/demo-orders.ts"
import { alice, bob } from '../users/demo-users.js';
import type { Order } from './order.js';

/** The demo orders: Alice has a paid and a shipped one, Bob a paid and a pending one. */
export const alicePaid: Order = {
  id: 'b69f25e7-db50-4abe-86d3-2ef2bd148009',
  userId: alice.id,
  items: [{ productId: 'salmon-kibble-2kg', quantity: 1 }],
  total: 2499,
  status: 'paid',
};

export const aliceShipped: Order = {
  id: 'd626a0c1-4122-4f83-ab7a-b009c26f35c7',
  userId: alice.id,
  items: [{ productId: 'clumping-litter-10l', quantity: 1 }],
  total: 1599,
  status: 'shipped',
};

export const bobPaid: Order = {
  id: '0ea8343b-879d-4b83-884b-6d5bb02f802f',
  userId: bob.id,
  items: [{ productId: 'salmon-kibble-2kg', quantity: 5 }],
  total: 12495,
  status: 'paid',
};

export const bobPending: Order = {
  id: '7e7023d3-cb2a-48d2-8c4e-20c07e6b8c06',
  userId: bob.id,
  items: [{ productId: 'clumping-litter-10l', quantity: 1 }],
  total: 1599,
  status: 'pending',
};

export const demoOrders = [alicePaid, aliceShipped, bobPaid, bobPending];

```

`OrdersService` 加载订单，然后根据其进行授权：

```typescript title="src/orders/orders.service.ts"
import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthorizationService } from '@nestjs/authorization';
import type { User } from '../users/user.js';
import { demoOrders } from './demo-orders.js';
import type { Order } from './order.js';
import { OrderPolicy } from './order.policy.js';

@Injectable()
export class OrdersService {
  // Stands in for your orders table: copies, since a refund changes an order's status.
  private readonly orders: Order[] = demoOrders.map((order) => ({ ...order }));

  constructor(private readonly authorizationService: AuthorizationService) {}

  async findAll(user: User) {
    // Filter lists in the query; policies check one record at a time.
    return (await this.authorizationService.can(OrderPolicy, 'viewAll', user))
      ? this.orders
      : this.orders.filter((order) => order.userId === user.id);
  }

  async findOne(user: User, id: string) {
    const order = this.find(id);
    await this.authorizationService.authorize(OrderPolicy, 'view', user, order);
    return order;
  }

  async refund(user: User, id: string) {
    const order = this.find(id);
    await this.authorizationService.authorize(OrderPolicy, 'refund', user, order);
    // Refund the payment through the payment provider here, then record it.
    order.status = 'refunded';
    return order;
  }

  private find(id: string) {
    const order = this.orders.find((order) => order.id === id);
    if (!order) {
      throw new NotFoundException();
    }
    return order;
  }
}

```

策略类之后的所有内容都根据能力的签名进行类型化：能力名称、用户和订单。拼写错误的能力、缺失的订单或不是 `Order` 的对象都不会编译，用户也可能不是 `null`：

```typescript
async show(user: User | null, order: Order) {
  await this.authorizationService.authorize(OrderPolicy, 'view', user, order);
  // error TS2345: Argument of type 'User | null' is not assignable to parameter of type 'User'.
}

```

列表不会逐个检查订单。它提出了查询可以使用的问题（此用户是否可以查看每笔订单？）并在数据库中进行过滤。在加载所有订单后检查每一行会获取过多数据并破坏分页。

在 ⟦Service⟧ 中检查而不是在 ⟦Controller⟧ 中检查意味着每个调用者都遵循相同的规则：一个 ⟦Controller⟧、一个 GraphQL ⟦Resolver⟧ 或处理退款请求的 ⟦Queue⟧ ⟦Consumer⟧。

⟦Controller⟧ 将已登录用户传递下去。认证教程中的 `OrdersService` 从 `AuthenticationContext` 读取它；在这里它是一个参数，因此 ⟦Service⟧ 的签名说明了检查是关于谁的权限，并且 ⟦Queue⟧ ⟦Consumer⟧ 可以为给定用户调用它。每个路由都在 ⟦Service⟧ 中检查，因此每个都声明 `@Can.Anyone()`：

```typescript title="src/orders/orders.controller.ts"
import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import type { User } from '../users/user.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @Can.Anyone()
  findAll(@CurrentUser() user: User) {
    return this.ordersService.findAll(user);
  }

  @Get(':id')
  @Can.Anyone()
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.ordersService.findOne(user, id);
  }

  @Post(':id/refund')
  @HttpCode(200)
  @Can.Anyone()
  refund(@CurrentUser() user: User, @Param('id') id: string) {
    return this.ordersService.refund(user, id);
  }
}

```

```typescript title="src/orders/orders.module.ts"
import { Module } from '@nestjs/common';
import { OrderPolicy } from './order.policy.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, OrderPolicy],
})
export class OrdersModule {}

```

将 `OrdersModule` 添加到 `AppModule` 的 `imports` 中。Alice 现在从 `GET /orders` 获得她的两个订单，并对 Bob 的其中一个收到 403 错误。

> info **提示** 403 确认订单存在。如果这很重要，例如当 id 是连续且可猜测的时，请使用 `can()` 进行检查，并抛出 `NotFoundException` 而不是 403。

#### 检查路由参数

某些检查需要一个参数而不是一个记录。工作人员在 `GET /customers/:customerId/orders` 查看客户订单，客户也可以在那里列出自己的订单。Alice 是否可以调用它仅取决于 URL 中的 id，因此在检查之前无需加载任何内容。添加一个使其可以 `OrderPolicy` 的能力：

```typescript title="xxx".

```

与 `OrderPolicy` 的其他能力不同，此能力接受 `User | null`，因为路由能力必须接受访客。路由使用 `@Can()` 进行检查，其第三个参数读取调用后用户的参数：

```typescript title="xxx".

```

`OrdersService` 获取一个按客户过滤的方法，没有自己的检查，因为路由已经有了：

```typescript title="xxx".

```

将控制器添加到 `OrdersModule` 的 `controllers` 中。Alice 现在从 `GET /customers/<Alice's id>/orders` 获取她的订单，而 Bob 的订单返回 403，Sam 两者都可以获取，访客返回 401。

函数由能力自身的参数进行类型定义。省略它在能力接受多于用户时不会编译，返回错误类型也不行：

```typescript title="xxx".

```

它在守卫中运行，在任何管道之前，因此它获得的是传输交付的值：路由参数是字符串，尚未进行任何验证。在 `customerId` 上的 `ParseUUIDPipe` 在检查后运行，用户可能看不到的 id 会返回 403，而不是 400。函数抛出的错误，例如缺少参数的 `BadRequestException`，会原样到达 HTTP 客户端。在 WebSockets 和微服务中，Nest 会将任何守卫（包括此函数）报告为内部错误，因此应在那里抛出 `WsException` 或 `RpcException`。拒绝事件携带函数在其 `args` 中读取的内容。

传递标识符和作用域，而不是记录。在守卫中加载订单将加载两次，一次用于检查，一次在处理程序中，并且在处理程序有机会返回 404 之前就返回 403。这就是为什么 `GET /orders/:id` 在服务中进行检查。

在一个单独声明的函数返回数组而不是能力参数描述的元组，因此以 `as const` 结尾。这使得一个小助手可以在路由之间重用：

```typescript title="xxx".

```

```typescript title="xxx".

```

在其他传输中，从它们自己的上下文中读取参数：GraphQL 操作参数使用 `GqlExecutionContext.create(context).getArgs()`，WebSocket 消息使用 `context.switchToWs().getData()`，微服务消息使用 `context.switchToRpc().getData()`。

#### 让管理员通过 `before()`

管理员可以对目录执行任何操作，包括删除产品，这是其他人不能做的。与其在每个能力中添加管理员检查，不如给策略一个 `before()` 钩子：

```typescript title="xxx".

```

`before()` 在其策略的每个能力之前运行，无论对于路由检查还是服务检查。它接收用户、能力名称和能力参数。返回 `true` 以允许，`false` 以拒绝，或不返回以让能力决定。访客也会到达 `before()`，因此其用户参数必须接受 `null`。无论类是否实现 `PolicyBefore<User>`，`before(user: User)` 都不会编译。

将使用新能力的路由添加到 `ProductsController`，并从 `@nestjs/common` 导入 `Delete` 和 `HttpCode`：

```typescript title="xxx".

```

Sam 现在从 `DELETE /products/clumping-litter-10l` 收到 403，Ada 收到 204。

> warning **警告** `before()` 会跳过其策略的每个能力，包括应约束所有人的规则。这就是为什么 `OrderPolicy` 没有管理员绕过：“没有人退还已发货的订单”也必须对 Ada 成立。如果一个策略需要两者，请检查 `before()` 接收的能力名称，并对它不应跳过的能力不返回任何内容。实现 `PolicyBefore<User, Ability<OrderPolicy>>` 并将名称类型化为 `Ability<OrderPolicy>`，这样拼写错误的排除就不会编译。

#### 将服务注入到策略中

财务部门限制每位工作人员可以退还的金额：默认 100.00，部分人员更高。这些限制存在于策略之外，存在于一个会读取表或配置服务的服务中：

```typescript title="xxx".

```

因为策略是一个提供者，它通过构造函数注入该服务。`refund` 能力变为 `async`：

```typescript title="xxx".

```

`authorize()`、`can()` 和守卫都等待异步能力，因此 `OrdersService` 不变。将服务注册在策略旁边：

```typescript title="xxx".

```

由于 `OrderPolicy` 在 `OrdersModule` 中注册，它可以注入该模块的提供者。在 `forRoot()` 的 `policies` 选项中列出的策略位于授权模块中，需要 `imports` 选项才能访问其依赖项。

Bob 的付费订单达到 124.95。Sam（限制 100.00）现在尝试退款时收到 403，而 Ada（限制 1,000.00）成功了。

> warning **警告** 策略必须是单例。请求作用域或瞬态策略，或依赖于请求作用域提供者的策略，会在启动时抛出错误。将每次请求的状态排除在策略之外，并将能力所需的项作为参数传递。

#### 告知访客是禁止用户，并暴露权限

被拒绝的请求会返回 401 或 403，具体取决于请求者和位置：

| 调用者 | 路由 | 状态 | 来自 |
| :--- | :--- | :--- | :--- |
| 访客 | 需要登录（默认），例如 `POST /products` 或 `GET /orders` | 401，带有 `WWW-Authenticate: Bearer realm="store"` | 认证，在任何策略运行之前 |
| 访客 | 可选认证，且策略拒绝 `null`，例如草稿产品 | 401 | 授权 |
| 已登录用户 | 策略拒绝，例如 Alice 在 `POST /products` 或 Bob 的订单之一上 | 403 | 授权 |

授权从不决定某个路由是否需要用户；那是认证的工作。当策略拒绝访客时，该包返回 401（“请登录再试”）而不是 403（“永不”），因为登录可能会改变答案。

`authorize()` 本身抛出一个 `AuthorizationError`，其 `reason` 是 `unauthenticated` 或 `forbidden`，其 `status` 是匹配的 401 或 403。这不是一个 HTTP 异常，因为相同的服务也运行在队列工作者和 WebSocket 网关中。当错误离开处理程序时，`AuthorizationModule` 会将其转换为守卫抛出的 `UnauthorizedException` 或 `ForbiddenException`，具有相同的主体，因此异常过滤器和客户端都像处理任何其他 HTTP 错误一样处理它。在 WebSocket 网关和微服务处理程序中，它变成一个 `WsException` 或一个 `RpcException`。403 主体不包含能力名称。

`can()` 从不因拒绝而抛出。它为访客和被禁止的用户都解析为 `false`，这使其成为塑造响应的工具。为每个订单设置一个 `canRefund` 标志，这样前端就可以显示退款按钮而无需重复规则：

```typescript title="src/orders/orders.service.ts"
import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthorizationService } from '@nestjs/authorization';
import type { User } from '../users/user.js';
import { demoOrders } from './demo-orders.js';
import type { Order } from './order.js';
import { OrderPolicy } from './order.policy.js';

export type OrderView = Order & { canRefund: boolean };

@Injectable()
export class OrdersService {
  // Stands in for your orders table: copies, since a refund changes an order's status.
  private readonly orders: Order[] = demoOrders.map((order) => ({ ...order }));

  constructor(private readonly authorizationService: AuthorizationService) {}

  async findAll(user: User): Promise<OrderView[]> {
    // Filter lists in the query; policies check one record at a time.
    const orders = (await this.authorizationService.can(OrderPolicy, 'viewAll', user))
      ? this.orders
      : this.orders.filter((order) => order.userId === user.id);
    return Promise.all(orders.map((order) => this.toView(user, order)));
  }

  async findOne(user: User, id: string): Promise<OrderView> {
    const order = this.find(id);
    await this.authorizationService.authorize(OrderPolicy, 'view', user, order);
    return this.toView(user, order);
  }

  async refund(user: User, id: string): Promise<OrderView> {
    const order = this.find(id);
    await this.authorizationService.authorize(OrderPolicy, 'refund', user, order);
    // Refund the payment through the payment provider here, then record it.
    order.status = 'refunded';
    return this.toView(user, order);
  }

  private async toView(user: User, order: Order): Promise<OrderView> {
    return { ...order, canRefund: await this.authorizationService.can(OrderPolicy, 'refund', user, order) };
  }

  private find(id: string) {
    const order = this.orders.find((order) => order.id === id);
    if (!order) {
      throw new NotFoundException();
    }
    return order;
  }
}

```

该标志来自 `refund` 能力，该能力由 `POST /orders/:id/refund` 执行，因此按钮和端点不会出现分歧。Sam 在 Alice 的已付款订单上看到 `canRefund: true`，在 Bob 的订单上看到 `false`（超过了他的限制）。Ada 在两者上都看到 `true`。

#### 试用

使用包含签名密钥的 `.env` 文件启动应用程序：

```bash
$ npm run start:dev -- --env-file .env

```

在另一个终端中，以 Alice、Sam 和 Ada 的身份登录。`--json` (curl 7.82 或更高版本) 发送一个带有 JSON 主体的 `POST`，而 `token` 辅助函数使用 [jq](https://jqlang.org/) 来提取访问令牌：

```bash
$ token() { curl -s localhost:3000/auth/token --json "{\"email\":\"$1@example.com\",\"password\":\"catnip4all\"}" | jq -r .accessToken; }
$ ALICE=$(token alice) SAM=$(token sam) ADA=$(token ada)

```

访客看到已发布的产品。工作人员也能看到草稿：

```bash
$ curl localhost:3000/products
[{"id":"salmon-kibble-2kg","name":"Salmon kibble, 2 kg","price":2499,"published":true},{"id":"clumping-litter-10l","name":"Clumping litter, 10 l","price":1599,"published":true}]

$ curl -s localhost:3000/products -H "Authorization: Bearer $SAM" | jq -c '.[] | {id, published}'
{"id":"salmon-kibble-2kg","published":true}
{"id":"clumping-litter-10l","published":true}
{"id":"heated-cat-bed","published":false}

```

草稿本身对访客是 401，对客户是 403。响应头在此处和下方被修剪：

```bash
$ curl -i localhost:3000/products/heated-cat-bed
HTTP/1.1 401 Unauthorized
{"message":"Unauthorized","statusCode":401}

$ curl -i localhost:3000/products/heated-cat-bed -H "Authorization: Bearer $ALICE"
HTTP/1.1 403 Forbidden
{"message":"Forbidden","statusCode":403}

```

只有工作人员可以添加产品。认证阻止了访客，而 `@Can()` 阻止了 Alice：

```bash
$ curl -i localhost:3000/products --json '{"name":"Sisal scratching post","price":3999,"published":false}'
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="store"
{"message":"Unauthorized","statusCode":401}

$ curl -i localhost:3000/products -H "Authorization: Bearer $ALICE" --json '{"name":"Sisal scratching post","price":3999,"published":false}'
HTTP/1.1 403 Forbidden
{"message":"Forbidden","statusCode":403}

$ curl localhost:3000/products -H "Authorization: Bearer $SAM" --json '{"name":"Sisal scratching post","price":3999,"published":false}'
{"name":"Sisal scratching post","price":3999,"published":false,"id":"sisal-scratching-post"}

```

Alice 看到自己的订单，但无法退款。Sam 看到所有订单，带有他自己的 `canRefund` 标志。Bob 的已付款订单对 Alice 是禁止的：

```bash
$ curl -s localhost:3000/orders -H "Authorization: Bearer $ALICE" | jq -c '.[] | {id, status, canRefund}'
{"id":"b69f25e7-db50-4abe-86d3-2ef2bd148009","status":"paid","canRefund":false}
{"id":"d626a0c1-4122-4f83-ab7a-b009c26f35c7","status":"shipped","canRefund":false}

$ curl -s localhost:3000/orders -H "Authorization: Bearer $SAM" | jq -c '.[] | {id, status, total, canRefund}'
{"id":"b69f25e7-db50-4abe-86d3-2ef2bd148009","status":"paid","total":2499,"canRefund":true}
{"id":"d626a0c1-4122-4f83-ab7a-b009c26f35c7","status":"shipped","total":1599,"canRefund":false}
{"id":"0ea8343b-879d-4b83-884b-6d5bb02f802f","status":"paid","total":12495,"canRefund":false}
{"id":"7e7023d3-cb2a-48d2-8c4e-20c07e6b8c06","status":"pending","total":1599,"canRefund":false}

$ curl -i localhost:3000/orders/0ea8343b-879d-4b83-884b-6d5bb02f802f -H "Authorization: Bearer $ALICE"
HTTP/1.1 403 Forbidden
{"message":"Forbidden","statusCode":403}

```

Sam 退款了 Alice 的已付款订单，但没有退款她的已发货订单，也没有退款 Bob 的订单（超过了他的限制）。Ada 也不能退款已发货的订单，但 Bob 的订单在她的限制内：

```bash
$ curl -s -X POST localhost:3000/orders/b69f25e7-db50-4abe-86d3-2ef2bd148009/refund -H "Authorization: Bearer $SAM" | jq -c '{id, status, canRefund}'
{"id":"b69f25e7-db50-4abe-86d3-2ef2bd148009","status":"refunded","canRefund":false}

$ curl -i -X POST localhost:3000/orders/d626a0c1-4122-4f83-ab7a-b009c26f35c7/refund -H "Authorization: Bearer $SAM"
HTTP/1.1 403 Forbidden
{"message":"Forbidden","statusCode":403}

$ curl -i -X POST localhost:3000/orders/0ea8343b-879d-4b83-884b-6d5bb02f802f/refund -H "Authorization: Bearer $SAM"
HTTP/1.1 403 Forbidden
{"message":"Forbidden","statusCode":403}

$ curl -i -X POST localhost:3000/orders/d626a0c1-4122-4f83-ab7a-b009c26f35c7/refund -H "Authorization: Bearer $ADA"
HTTP/1.1 403 Forbidden
{"message":"Forbidden","statusCode":403}

$ curl -s -X POST localhost:3000/orders/0ea8343b-879d-4b83-884b-6d5bb02f802f/refund -H "Authorization: Bearer $ADA" | jq -c '{id, status, canRefund}'
{"id":"0ea8343b-879d-4b83-884b-6d5bb02f802f","status":"refunded","canRefund":false}

```

只有管理员才能删除产品：

```bash
$ curl -i -X DELETE localhost:3000/products/clumping-litter-10l -H "Authorization: Bearer $SAM"
HTTP/1.1 403 Forbidden
{"message":"Forbidden","statusCode":403}

$ curl -i -X DELETE localhost:3000/products/clumping-litter-10l -H "Authorization: Bearer $ADA"
HTTP/1.1 204 No Content

```

#### 测试

端到端测试启动整个应用程序，通过真实端点登录，并通过 HTTP 检查规则。与认证教程一样，scrypt 是故意慢的，因此测试用更便宜的选项覆盖 `PasswordHasher`，并且应用程序在启动时读取 `JWT_SECRET`，因此测试配置提供了一个：

```typescript title="vitest.config.ts"
export default defineConfig({
  // ...
  test: {
    // ...
    env: {
      JWT_SECRET: 'test-only-jwt-secret-of-at-least-32-bytes',
    },
  },
});

```

```typescript title="test/orders.e2e-spec.ts"
import type { INestApplication } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { alicePaid, aliceShipped, bobPaid } from '../src/orders/demo-orders.js';

describe('Orders (e2e)', () => {
  let app: INestApplication;

  const signIn = async (email: string) => {
    const { body } = await request(app.getHttpServer())
      .post('/auth/token')
      .send({ email, password: 'catnip4all' })
      .expect(200);
    return `Bearer ${body.accessToken}`;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // scrypt is slow on purpose; the tests don't need it to be.
      .overrideProvider(PasswordHasher)
      .useValue(new PasswordHasher({ logN: 11 }))
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
  });

  afterAll(() => app.close());

  it('asks guests to sign in', async () => {
    await request(app.getHttpServer()).get('/orders').expect(401);
  });

  it('shows customers only their own orders', async () => {
    const alice = await signIn('alice@example.com');
    const { body } = await request(app.getHttpServer())
      .get('/orders')
      .set('Authorization', alice)
      .expect(200);
    expect(body.map((order: { id: string }) => order.id)).toEqual([alicePaid.id, aliceShipped.id]);

    await request(app.getHttpServer()).get(`/orders/${bobPaid.id}`).set('Authorization', alice).expect(403);
  });

  it('lets staff refund a paid order once, within their limit', async () => {
    const sam = await signIn('sam@example.com');
    const refund = (id: string) =>
      request(app.getHttpServer()).post(`/orders/${id}/refund`).set('Authorization', sam);

    await refund(alicePaid.id).expect(200);
    await refund(alicePaid.id).expect(403); // already refunded
    await refund(aliceShipped.id).expect(403); // shipped
    await refund(bobPaid.id).expect(403); // over Sam's limit
  });
});

```

策略是一个纯类，因此其规则易于在没有 Nest 的情况下进行单元测试。自行构建策略并控制其依赖项；演示账户和订单可作为夹具使用：

```typescript title="src/orders/order.policy.spec.ts"
import { vi } from 'vitest';
import { alice, sam } from '../users/demo-users.js';
import { alicePaid, bobPaid } from './demo-orders.js';
import { OrderPolicy } from './order.policy.js';
import { RefundLimitsService } from './refund-limits.service.js';

describe('OrderPolicy', () => {
  // No Nest here: a policy is a class, so construct it yourself.
  const refundLimits = new RefundLimitsService();
  const policy = new OrderPolicy(refundLimits);

  it('shows customers only their own orders', () => {
    expect(policy.view(alice, alicePaid)).toBe(true);
    expect(policy.view(alice, bobPaid)).toBe(false);
    expect(policy.view(sam, bobPaid)).toBe(true);
  });

  it('lets staff refund paid orders up to their limit', async () => {
    vi.spyOn(refundLimits, 'maxRefundFor').mockResolvedValue(5000);

    expect(await policy.refund(sam, { ...alicePaid, total: 5000 })).toBe(true);
    expect(await policy.refund(sam, { ...alicePaid, total: 5001 })).toBe(false);
    expect(await policy.refund(alice, alicePaid)).toBe(false);
  });

  it('refuses refunds on orders that are not paid', async () => {
    for (const status of ['pending', 'shipped', 'refunded'] as const) {
      expect(await policy.refund(sam, { ...alicePaid, status })).toBe(false);
    }
  });
});

```

直接调用能力会跳过 `before()`。该钩子只是另一个方法，因此以相同的方式测试它，例如 `expect(new ProductPolicy().before(ada)).toBe(true)`。要同时测试钩子和能力，请通过 `AuthorizationService` 进行，要测试 401/403 映射，也请通过 HTTP 进行，就像端到端测试一样。

服务测试位于两者之间：真实的策略和 `AuthorizationModule`，没有 HTTP 或登录。在处理程序外部，拒绝仍然是一个 `AuthorizationError`：

```typescript title="src/orders/orders.service.spec.ts"
import { Test } from '@nestjs/testing';
import { AuthorizationError, AuthorizationModule } from '@nestjs/authorization';
import { alice, sam } from '../users/demo-users.js';
import { alicePaid, bobPaid } from './demo-orders.js';
import { OrderPolicy } from './order.policy.js';
import { OrdersService } from './orders.service.js';
import { RefundLimitsService } from './refund-limits.service.js';

describe('OrdersService', () => {
  let orders: OrdersService;

  beforeEach(async () => {
    // The real policy and module, no HTTP and no sign-in.
    const moduleRef = await Test.createTestingModule({
      imports: [AuthorizationModule.forRoot()],
      providers: [OrdersService, OrderPolicy, RefundLimitsService],
    }).compile();
    orders = moduleRef.get(OrdersService);
  });

  it("keeps Bob's order from Alice", async () => {
    await expect(orders.findOne(alice, bobPaid.id)).rejects.toThrow(AuthorizationError);
  });

  it('refunds within the limit only', async () => {
    await expect(orders.refund(sam, bobPaid.id)).rejects.toMatchObject({ reason: 'forbidden', ability: 'refund' });
    expect((await orders.refund(sam, alicePaid.id)).status).toBe('refunded');
  });
});

```

要在更大的测试中替换策略，像替换任何提供者一样覆盖它，例如 `.overrideProvider(OrderPolicy).useValue(...)`：所有检查（在路由和服务中）都针对覆盖项运行。

#### 生产检查清单

- **将认证置于授权之前。** 使用 `AuthenticationModule`，错误的导入顺序会在启动时停止应用程序。使用另一个认证守卫时，它只会记录错误，因此请进行端到端测试，使其登录并调用一个 `@Can()` 路由。无论导入顺序如何，两个注册操作总是在授权守卫之后运行：一个请求作用域的 `APP_GUARD`（启动检查如此说明）和 `app.useGlobalGuards()`（不能）。将认证注册为单例 `APP_GUARD`。
- **审查每个 `@Can.Anyone()`。** 该守卫拒绝声明无检查的处理程序，并在启动时记录每个检查，因此遗漏的 `@Can()` 会关闭一个路由。`@Can.Anyone()` 会将其对所有通过认证的人开放：检查其服务是否授权，或者该路由是否不需要权限。URL 中的 ID 检查可以放在路由上，使用 `@Can()` 的第三个参数，这样后续对处理程序的编辑就不能删除它。
- **使用 `inheritAppConfig: true` 连接微服务。** 在混合应用程序中，当 `connectMicroservice()` 获得该选项时，Nest 仅在消息处理程序上运行应用程序的全局守卫和拦截器。如果没有它，消息处理程序上的 `@Can()` 不会被强制执行，来自 `authorize()` 的拒绝会作为内部错误而不是 401 或 403 到达客户端。
- **将记录检查放在服务中**，在加载记录之后，以便控制器、解析器和队列工作者共享它们。
- **不要在检查记录的路由上按 URL 缓存响应。** 像 Nest 的 `CacheInterceptor` 这样的缓存会在处理程序运行之前回答，因此它会向 Alice 提供 Bob 的订单，而无需询问 `OrderPolicy`。缓存应放在检查之下，或按用户进行。
- **使用查询可用的问题在查询中过滤列表**，例如 `viewAll`，而不是加载每一行并检查每一行。
- **写入时重新检查状态。** 授权在退款之前读取订单，并且两个并发请求都可能看到 `paid`。使写入有条件（仅在状态仍为 `paid` 时更新），并向支付提供者发送幂等性密钥，这样重试永远不会重复退款。
- **对于存在敏感性的记录（例如，当 ID 是顺序时，其他客户的订单），选择 403 还是 404。**
- **保持策略无状态。** 它们是所有请求共享的单例。
- **注意 `can()` 标志的成本。** 每个标志对每行执行能力一次，包括任何异步工作。缓存缓慢的查找（如退款限制），或按请求加载一次。
- **从配置加载密钥。** 从密钥管理器或 `ConfigService` 读取 JWT 密钥（至少 32 字节），而不是从代码中读取。
- **在您自己的守卫和中间件中使用 `can()` 进行检查。** 它们在任何处理程序之前运行，因此在那里抛出的 `AuthorizationError` 不会被转换为 401 或 403。它变成 500。
- **审计拒绝。** 响应不说明哪个检查拒绝了调用者。订阅 `AuthorizationEvents` 以记录每次拒绝的策略、能力和用户 ID。每个事件都携带了策略看到的用户和记录，因此请记录所需的字段而不是整个事件。

#### 参考

##### 模块选项

`AuthorizationModule.forRoot()` 接受这些选项。`forRootAsync()` 在顶层接受 `policies`、`imports`、`globalGuard` 和 `isGlobal`，紧邻 `useFactory`，其工厂返回 `getUser`。

| 选项 | 默认值 | 描述 |
| --- | --- | --- |
| `getUser` | `defaultGetUser` | 一个接收 `ExecutionContext` 并返回当前用户或其 Promise 的函数。参见 [Register the authorization module](/security/authorization#register-the-authorization-module)。 |
| `policies` | none | 在授权模块本身注册的策略。任何模块的 `@Policy()` 提供者在未列出时也会被找到。 |
| `imports` | none | `policies` 注入其导出提供者的模块。 |
| `globalGuard` | `true` | 将 `AuthorizationGuard` 注册为全局守卫。使用 `false`，在认证守卫之后使用 `@UseGuards()` 应用它。 |
| `isGlobal` | `true` | 全局注册该模块。 |

`defaultGetUser` 从这些位置读取用户。`null`、`undefined` 和 `false` 都表示访客。

| 上下文 | 来源 |
| --- | --- |
| HTTP | `request.user` |
| GraphQL | 此操作记录的用户认证，否则在 GraphQL 上下文中是 `req.user` |
| WebSockets | 此消息记录的用户认证，否则是 `client.user`，然后是 `client.data.user` |
| 微服务 | 传输上下文中的 `user`，绝不是消息负载 |

WebSocket 客户端是连接，而不是消息，在 `graphql-ws` 上，GraphQL 上下文中的 `req` 是套接字的升级请求，所有套接字上的操作都共享此请求。因此 `client.user` 和 `req.user` 存储最后认证的消息或操作。`@nestjs/authentication` 还在客户端和 `req` 的 `Symbol.for('nestjs.authentication.userOf')` 下留下一个函数，该函数接收 `ExecutionContext` 并以该消息或操作的用户作答：对于匿名用户是 `null`，因为所有 `@Public()` 用户都是如此，或者在没有答案时是 `undefined`。`defaultGetUser` 首先询问它。因此，一个 `@Public()` 消息或操作对于 `@Can()` 来说是访客，即使在握手已登录的套接字上，并且一个在所有地方被注销撤销的会话不再计数。您自己的 `getUser` 读取这些传输上的 `client.user` 或 `req.user` 时，会看到套接字的最后用户；其他认证包也可以留下相同的函数供询问。

##### 路由声明的内容

守卫根据处理程序及其类声明的内容来决定：

| 声明 | 守卫行为 |
| --- | --- |
| `@Can()` | 运行类的所有要求，然后是方法的要求。所有要求都必须通过。 |
| `@Can.Anyone()` | 允许任何通过认证的人通过。 |
| `@Public()` 来自 `@nestjs/authentication` (0.1.0 或更高版本) | 与 `@Can.Anyone()` 相同。 |
| 无 | 拒绝：对用户返回 403，对访客返回 401。启动日志会列出处理程序。 |

在方法上，`@Can.Anyone()` 或 `@Public()` 会提升类的 `@Can()`，因为 `@Public()` 会提升类的认证。方法本身上的 `@Can()` 仍然适用，因此一个带有 `@Public()` 的方法配合 `@Can()` 会为访客执行检查。在类上，两者都不会提升方法的 `@Can()`。一个在 `@Public()` 类内部使用 `@Authenticate()` 重新置于认证下的方法不是公共的，需要有自己的声明。

当 Nest 没有全局守卫运行时，不会有任何拒绝：在 GraphQL 字段解析器上，除非 `fieldResolverEnhancers` 包含 `'guards'`，以及在未连接 `inheritAppConfig: true` 的混合应用程序的消息处理程序上。有了增强器，每个 `@ResolveField()` 也需要声明。类级别的声明可以覆盖它们。

##### 事件

`AuthorizationEvents` 在其 `events$` 可观察对象上暴露每次拒绝，并将其发布到诊断通道。`can()` 解析到 `false` 不是拒绝，不发出任何事件。

| 事件类型 | 通道 | 何时 |
| --- | --- | --- |
| `denied` | `nestjs:authorization:denied` | `@Can()` 或 `authorize()` 拒绝了调用者 |

`AuthorizationDeniedEvent` 负载具有以下字段：

- `type`：`'denied'`。
- `policy` 和 `ability`：策略类名和拒绝的能力，例如 `OrderPolicy` 和 `refund`。当守卫拒绝一个未声明检查的处理程序时，两者都是 `null`。
- `reason`：访客是 `'unauthenticated'`，已登录用户是 `'forbidden'`。
- `user`：策略看到的用户，访客是 `null`。
- `args`：用户之后的能力参数，例如记录。对于 `@Can()`，读取其第三个参数，如果没有则为空。
- `handler`：被 `@Can()` 保护的处理程序，例如 `ProductsController.create`。对于 `authorize()` 则缺失。

##### 错误

`authorize()` 抛出一个带有 `AuthorizationError`、`reason`、`status` 和 `policy` 的 `ability`。守卫拒绝一个未声明检查的处理程序会携带相同的错误，其中 `policy` 和 `ability` 设置为 `null`。当它离开一个处理程序，或者当 `@Can()` 拒绝时，调用者会获得传输自身的错误，其主体绝不会命名策略或能力。参见 [Tell guests from forbidden users, and expose permissions](/security/authorization#tell-guests-from-forbidden-users-and-expose-permissions)。

| `reason` | `status` | HTTP | GraphQL `extensions.code` | WebSockets 和微服务 |
| --- | --- | --- | --- | --- |
| `unauthenticated` | 401 | `UnauthorizedException` | `UNAUTHENTICATED` | `WsException` 或 `RpcException` 带有 `statusCode: 401` |
| `forbidden` | 403 | `ForbiddenException` | `FORBIDDEN` | `WsException` 或 `RpcException` 带有 `statusCode: 403` |

在 `graphql-ws` 上，客户端会收到错误的消息，是 `Unauthorized` 或 `Forbidden`，不包含 `extensions.code`：Apollo 驱动程序在其错误格式化中添加了代码，但这在该传输上不会运行。

在处理程序外部抛出的 `AuthorizationError`，例如在您自己的守卫或中间件中，不会被映射，而是变成 500。