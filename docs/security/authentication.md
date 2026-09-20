<!-- 此文件从 content/security/authentication.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-13T07:55:42.909Z -->
<!-- 源文件: content/security/authentication.md -->
<!-- 源哈希: b3c2fe084b892708cb6818a5d333b64c -->

### 认证

认证是大多数应用中**必不可少**的一部分。处理认证有许多不同的方法和策略。任何项目所采用的方法都取决于其特定的应用需求。本章介绍了几种可以适应各种不同需求的认证方法。

让我们来细化我们的需求。对于这个用例，客户端将首先使用用户名和密码进行认证。认证通过后，服务器将签发一个 JWT，可以在后续请求的授权头中作为 [bearer token](https://tools.ietf.org/html/rfc6750) 发送，以证明认证状态。我们还将创建一个受保护的路由，只有包含有效 JWT 的请求才能访问。

我们将从第一个需求开始：认证用户。然后通过签发 JWT 来扩展它。最后，我们将创建一个受保护的路由，用于检查请求中是否包含有效的 JWT。

#### 创建认证模块

我们首先生成一个 `AuthModule`，并在其中生成一个 `AuthService` 和一个 `AuthController`。我们将使用 `AuthService` 来实现认证逻辑，并使用 `AuthController` 来暴露认证端点。

```bash
$ nest g module auth
$ nest g controller auth
$ nest g service auth

```

在实现 `AuthService` 时，我们会发现将用户操作封装在 `UsersService` 中会很有用，所以现在让我们生成该模块和服务：

```bash
$ nest g module users
$ nest g service users

```

如下所示替换这些生成文件的默认内容。对于我们的示例应用，`UsersService` 仅维护一个硬编码的内存用户列表，以及一个按用户名检索用户的 find 方法。在真实应用中，这里就是您使用所选择的库（例如 TypeORM、Sequelize、Mongoose 等）构建用户模型和持久化层的地方。

```typescript title="users/users.service.ts"
import { Injectable } from '@nestjs/common';

// This should be a real class/interface representing a user entity
export type User = any;

@Injectable()
export class UsersService {
  private readonly users = [
    {
      userId: 1,
      username: 'john',
      password: 'changeme',
    },
    {
      userId: 2,
      username: 'maria',
      password: 'guess',
    },
  ];

  async findOne(username: string): Promise<User | undefined> {
    return this.users.find(user => user.username === username);
  }
}

```

在 `UsersModule` 中，唯一需要的更改是将 `UsersService` 添加到 `@Module` 装饰器的 exports 数组中，以便在该模块外部可见（我们很快将在 `AuthService` 中使用它）。

```typescript title="users/users.module.ts"
import { Module } from '@nestjs/common';
import { UsersService } from './users.service.js';

@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

```

#### 实现"登录"端点

我们的 `AuthService` 负责检索用户并验证密码。我们为此创建一个 `signIn()` 方法。在下面的代码中，我们使用方便的 ES6 展开运算符在返回用户对象之前从用户对象中剥离 password 属性。这是在返回用户对象时的常见做法，因为您不希望暴露敏感字段，如密码或其他安全密钥。

```typescript title="auth/auth.service.ts"
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}

  async signIn(username: string, pass: string): Promise<any> {
    const user = await this.usersService.findOne(username);
    if (user?.password !== pass) {
      throw new UnauthorizedException();
    }
    const { password, ...result } = user;
    // TODO: Generate a JWT and return it here
    // instead of the user object
    return result;
  }
}

```

> 警告 **警告** 当然，在真实应用中，您不会以纯文本形式存储密码。您应该使用像 [bcrypt](https://github.com/kelektiv/node.bcrypt.js#readme) 这样的库，采用加盐的单向哈希算法。使用这种方法，您只存储哈希后的密码，然后将存储的密码与**传入**密码的哈希版本进行比较，从而永远不会以纯文本形式存储或暴露用户密码。为了保持示例应用的简单性，我们违反了这一绝对要求并使用纯文本。**请不要在您的真实应用中这样做！**

现在，我们更新 `AuthModule` 以导入 `UsersModule`。

```typescript title="auth/auth.module.ts"
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [UsersModule],
  providers: [AuthService],
  controllers: [AuthController],
})
export class AuthModule {}

```

有了这些基础，让我们打开 `AuthController` 并向其中添加一个 `signIn()` 方法。客户端将调用此方法来认证用户。它将在请求体中接收用户名和密码，如果用户通过认证，则返回一个 JWT 令牌。

```typescript title="auth/auth.controller.ts"
import { Body, Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  signIn(@Body() signInDto: Record<string, any>) {
    return this.authService.signIn(signInDto.username, signInDto.password);
  }
}

```

> 信息 **提示** 理想情况下，我们应该使用 DTO 类来定义请求体的形状，而不是使用 `Record<string, any>` 类型。更多信息请参阅 [validation](/techniques/validation) 章节。

<app-banner-courses-auth></app-banner-courses-auth>

#### JWT 令牌

我们准备继续处理认证系统中的 JWT 部分。让我们回顾并细化我们的需求：

- 允许用户使用用户名/密码进行认证，并返回一个 JWT 用于后续调用受保护的 API 端点。我们正在逐步满足这一需求。为了完成它，我们需要编写签发 JWT 的代码。
- 创建基于有效 JWT 作为 bearer 令牌的存在来保护的 API 路由

我们需要安装一个额外的包来支持我们的 JWT 需求：

```bash
$ npm install --save @nestjs/jwt

```

> 信息 **提示** `@nestjs/jwt` 包（更多信息请参阅 [here](https://github.com/nestjs/jwt)）是一个有助于 JWT 操作的工具包。这包括生成和验证 JWT 令牌。

为了保持我们的服务模块化清晰，我们将在 `authService` 中处理 JWT 的生成。打开 `auth` 文件夹中的 `auth.service.ts` 文件，注入 `JwtService`，并更新 `signIn` 方法以生成 JWT 令牌，如下所示：

```typescript title="auth/auth.service.ts"
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService
  ) {}

  async signIn(
    username: string,
    pass: string,
  ): Promise<{ access_token: string }> {
    const user = await this.usersService.findOne(username);
    if (user?.password !== pass) {
      throw new UnauthorizedException();
    }
    const payload = { sub: user.userId, username: user.username };
    return {
      // 💡 Here the JWT secret key that's used for signing the payload 
      // is the key that was passed in the JwtModule
      access_token: await this.jwtService.signAsync(payload),
    };
  }
}

```

我们使用 `@nestjs/jwt` 库，它提供了 `signAsync()` 函数来从 `user` 对象属性的子集生成我们的 JWT，然后我们将其作为具有单个 `access_token` 属性的简单对象返回。注意：我们选择属性名 `sub` 来保存我们的 `userId` 值，以符合 JWT 标准。

我们现在需要更新 `AuthModule` 以导入新的依赖项并配置 `JwtModule`。

首先，在 `auth` 文件夹中创建 `constants.ts`，并添加以下代码：

```typescript title="auth/constants.ts"
export const jwtConstants = {
  secret: 'DO NOT USE THIS VALUE. INSTEAD, CREATE A COMPLEX SECRET AND KEEP IT SAFE OUTSIDE OF THE SOURCE CODE.',
};

```

我们将使用它来在我们的 JWT 签名和验证步骤之间共享密钥。

> 警告 **警告** **请勿公开此密钥**。我们在此公开是为了说明代码的作用，但在生产系统中，**您必须通过适当措施保护此密钥**，例如使用密钥保管库、环境变量或配置服务。

现在，打开 `auth.module.ts` 文件夹中的 `auth`，并将其更新为如下所示：

```typescript title="auth/auth.module.ts"
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { UsersModule } from '../users/users.module.js';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { jwtConstants } from './constants.js';

@Module({
  imports: [
    UsersModule,
    JwtModule.register({
      global: true,
      secret: jwtConstants.secret,
      signOptions: { expiresIn: '60s' },
    }),
  ],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}

```

> 提示 **提示** 我们将 `JwtModule` 注册为全局的，以便简化操作。这意味着我们无需在应用程序的其他任何地方导入 `JwtModule`。

我们使用 `register()` 配置 `JwtModule`，并传入一个配置对象。有关 Nest `JwtModule` 的更多信息，请参阅 [here](https://github.com/nestjs/jwt/blob/master/README.md)；有关可用配置选项的更多详细信息，请参阅 [here](https://github.com/auth0/node-jsonwebtoken#用法)。

让我们再次使用 cURL 测试我们的路由。您可以使用 `UsersService` 中硬编码的任何 `user` 对象进行测试。

```bash
$ # POST to /auth/login
$ curl -X POST http://localhost:3000/auth/login -d '{"username": "john", "password": "changeme"}' -H "Content-Type: application/json"
{"access_token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}
$ # Note: above JWT truncated

```

#### 实现认证守卫

现在我们可以处理最后一个需求：通过在请求上要求有效的 JWT 来保护端点。我们将通过创建一个 `AuthGuard` 来实现这一点，用它来保护我们的路由。

```typescript title="auth/auth.guard.ts"
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException();
    }
    try {
      // 💡 Here the JWT secret key that's used for verifying the payload 
      // is the key that was passed in the JwtModule
      const payload = await this.jwtService.verifyAsync(token);
      // 💡 We're assigning the payload to the request object here
      // so that we can access it in our route handlers
      request['user'] = payload;
    } catch {
      throw new UnauthorizedException();
    }
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}

```

现在我们可以实现受保护的路由，并注册我们的 `AuthGuard` 来保护它。

打开 `auth.controller.ts` 文件，并按如下所示更新：

```typescript title="auth.controller.ts"
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards
} from '@nestjs/common';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  signIn(@Body() signInDto: Record<string, any>) {
    return this.authService.signIn(signInDto.username, signInDto.password);
  }

  @UseGuards(AuthGuard)
  @Get('profile')
  getProfile(@Request() req) {
    return req.user;
  }
}

```

我们将刚刚创建的 `AuthGuard` 应用于 `GET /profile` 路由，以便对其进行保护。

确保应用正在运行，并使用 `cURL` 测试路由。

```bash
$ # GET /profile
$ curl http://localhost:3000/auth/profile
{"statusCode":401,"message":"Unauthorized"}

$ # POST /auth/login
$ curl -X POST http://localhost:3000/auth/login -d '{"username": "john", "password": "changeme"}' -H "Content-Type: application/json"
{"access_token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2Vybm..."}

$ # GET /profile using access_token returned from previous step as bearer code
$ curl http://localhost:3000/auth/profile -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2Vybm..."
{"sub":1,"username":"john","iat":...,"exp":...}

```

请注意，在 `AuthModule` 中，我们将 JWT 的过期时间配置为 `60 seconds`。这个过期时间太短，处理令牌过期和刷新的细节超出了本文的范围。然而，我们选择这个值是为了演示 JWT 的一个重要特性。如果您在认证后等待 60 秒再尝试 `GET /auth/profile` 请求，您将收到 `401 Unauthorized` 响应。这是因为 `@nestjs/jwt` 会自动检查 JWT 的过期时间，省去了您在应用程序中手动检查的麻烦。

我们现在已经完成了 JWT 认证的实现。JavaScript 客户端（如 Angular/React/Vue）以及其他 JavaScript 应用现在可以安全地认证并与我们的 API 服务器通信。

#### 全局启用认证

如果您的绝大多数端点默认都应受保护，您可以将认证守卫注册为 [global guard](/overview/guards#绑定守卫)，而不是在每个控制器上使用 `@UseGuards()` 装饰器，只需标记哪些路由应为公共的即可。

首先，使用以下构造将 `AuthGuard` 注册为全局守卫（在任何模块中，例如在 `AuthModule` 中）：

```typescript
providers: [
  {
    provide: APP_GUARD,
    useClass: AuthGuard,
  },
],

```

这样，Nest 将自动将 `AuthGuard` 绑定到所有端点。

现在，我们必须提供一种将路由声明为公共的机制。为此，我们可以使用 `SetMetadata` 装饰器工厂函数创建自定义装饰器。

```typescript
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

```

在上面的文件中，我们导出了两个常量。一个是我们的元数据键，名为 `IS_PUBLIC_KEY`，另一个是我们新创建的装饰器本身，我们将其命名为 `Public`（您也可以将其命名为 `SkipAuth` 或 `AllowAnon`，只要适合您的项目即可）。

现在，我们有了自定义的 `@Public()` 装饰器，可以将其用于装饰任何方法，如下所示：

```typescript
@Public()
@Get()
findAll() {
  return [];
}

```

最后，我们需要 `AuthGuard` 在找到 `"isPublic"` 元数据时返回 `true`。为此，我们将使用 `Reflector` 类（更多信息请参阅 [here](/overview/guards#putting-it-all-together)）。

```typescript
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService, private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      // 💡 See this condition
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException();
    }
    try {
      // 💡 Here the JWT secret key that's used for verifying the payload 
      // is the key that was passed in the JwtModule
      const payload = await this.jwtService.verifyAsync(token);
      // 💡 We're assigning the payload to the request object here
      // so that we can access it in our route handlers
      request['user'] = payload;
    } catch {
      throw new UnauthorizedException();
    }
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}

```

#### Passport 集成

[Passport](https://github.com/jaredhanson/passport) 是最流行的 node.js 认证库，广受社区认可，并已在许多生产应用程序中成功使用。使用 `@nestjs/passport` 模块可以轻松地将该库与 **Nest** 应用程序集成。

要了解如何将 Passport 与 NestJS 集成，请查看此 [chapter](/recipes/passport)。

#### 示例

您可以在 [here](https://github.com/nestjs/nest/tree/master/sample/19-auth-jwt) 中找到本章代码的完整版本。