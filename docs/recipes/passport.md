<!-- 此文件从 content/recipes/passport.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:37:08.842Z -->
<!-- 源文件: content/recipes/passport.md -->
<!-- 源哈希: 06bd2b9315fd157b5382fbb6ebf1c66e -->

### Passport (认证)

[Passport](https://github.com/jaredhanson/passport) 是最流行的 Node.js 认证库，在社区中广为人知，并被许多生产应用使用。您可以使用 `@nestjs/passport` 模块将其集成到 **Nest** 应用中。从高层次来看，Passport 执行一系列步骤来：

- 通过验证用户的“凭据”（如用户名/密码、JSON Web Token ([JWT](https://jwt.io/)) 或来自身份提供者的身份令牌）来认证用户
- 管理已认证状态（通过颁发可移植令牌，如 JWT，或创建 [Express session](https://github.com/expressjs/session)）
- 将有关已认证用户的信息附加到 `Request` 对象上，供路由处理器进一步使用

Passport 拥有丰富的 [strategies](http://www.passportjs.org/) 生态系统，实现了各种认证机制。虽然概念简单，但可供选择的 Passport 策略集庞大且多样。Passport 将这些不同的步骤抽象为标准模式，而 `@nestjs/passport` 模块将此模式封装在熟悉的 Nest 构造中。

在本章中，我们将使用这些模块为 RESTful API 服务器实现一个完整的端到端认证解决方案。您可以遵循本章的步骤来构建完整的示例，并将相同的概念应用于实现任何 Passport 策略和自定义您的认证方案。

#### 认证要求

对于此用例，客户端首先使用用户名和密码进行认证。一旦认证成功，服务器会颁发一个 JWT，客户端可以在后续请求中将其作为 [bearer token in an authorization header](https://tools.ietf.org/html/rfc6750) 发送以证明认证。我们还将创建一个受保护的路由，该路由仅对包含有效 JWT 的请求可访问。

我们将从第一个要求开始：认证用户。然后扩展到颁发 JWT。最后，我们将创建一个检查请求中是否存在有效 JWT 的受保护路由。

首先，安装所需的包。Passport 提供了一个名为 [passport-local](https://github.com/jaredhanson/passport-local) 的策略，它实现了用户名/密码认证机制，适用于我们用例的这部分。

```bash
$ npm install --save @nestjs/passport passport passport-local
$ npm install --save-dev @types/passport-local

```

> 警告 **注意** 对于您选择的**任何** Passport 策略，您始终需要 `@nestjs/passport` 和 `passport` 包。您还需要实现您正在构建的认证策略的特定策略包（例如 `passport-jwt` 或 `passport-local`）。您还可以安装策略的类型定义，如上文使用 `@types/passport-local` 所示，以便在编写 TypeScript 代码时获得类型检查和编辑器辅助。

#### 实现 Passport 策略

现在我们准备实现认证功能。我们将从**任何** Passport 策略所使用的流程概述开始。将 Passport 视为一个微框架本身会很有帮助。它将认证过程抽象为几个基本步骤，您可以根据正在实现的策略进行自定义。它像一个框架，因为您通过提供自定义参数（作为纯 JSON 对象）和回调函数形式的自定义代码进行配置，Passport 在适当的时间调用这些回调。`@nestjs/passport` 模块将此框架封装在 Nest 风格的包中，使其自然地集成到 Nest 应用中。我们将在下面使用 `@nestjs/passport`，但首先，让我们了解**原生 Passport** 的工作原理。

在原生 Passport 中，您通过提供两件事来配置一个策略：

1. 一组特定于该策略的选项。例如，在 JWT 策略中，您可能提供一个用于签名令牌的密钥。
2. 一个“验证回调”，您在此告诉 Passport 如何与您的用户存储（您管理用户账户的地方）交互。在这里，您验证用户是否存在（和/或创建新用户），以及他们的凭据是否有效。Passport 期望此回调在验证成功时返回完整用户，如果失败则返回 `null`（失败意味着用户未找到，或者在 passport-local 的情况下，密码不匹配）。

使用 `@nestjs/passport`，您通过扩展 `PassportStrategy` 类来配置 Passport 策略。您通过在子类的构造函数中调用 `super()` 来传递策略选项（上述第 1 点），可以选择带有一个选项对象。您通过在子类中实现 `validate()` 方法来提供验证回调（上述第 2 点）。

我们将从生成一个 `AuthModule` 开始，并在其中生成一个 `AuthService`：

```bash
$ nest g module auth
$ nest g service auth

```

`AuthService` 将依赖于一个封装用户操作的 `UsersService`，因此也生成该模块和服务：

```bash
$ nest g module users
$ nest g service users

```

如以下所示，替换这些生成文件的默认内容。在此示例应用中，`UsersService` 保留了一个硬编码的内存用户列表，并暴露了一个 `findOne()` 方法，该方法按用户名查找用户。在实际应用中，您将使用所选库（例如 TypeORM、Sequelize、Mongoose）构建您的用户模型和持久化层。

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

在 `UsersModule` 中，所需的唯一更改是将 `UsersService` 添加到 `@Module()` 装饰器的 `exports` 数组中，使其在模块外部可见（我们稍后将在我们的 `AuthService` 中使用它）。

```typescript title="users/users.module.ts"
import { Module } from '@nestjs/common';
import { UsersService } from './users.service.js';

@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

```

我们的 `AuthService` 检索用户并验证密码。我们为此创建了一个 `validateUser()` 方法。在下面的代码中，我们使用对象解构语法从用户对象中剥离 `password` 属性后再返回它。我们的 Passport local 策略稍后将调用 `validateUser()` 方法。

```typescript title="auth/auth.service.ts"
import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class AuthService {
  constructor(private usersService: UsersService) {}

  async validateUser(username: string, pass: string): Promise<any> {
    const user = await this.usersService.findOne(username);
    if (user && user.password === pass) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }
}

```

> 警告 **警告** 在实际应用中，切勿以明文形式存储密码。相反，请使用像 [bcrypt](https://github.com/kelektiv/node.bcrypt.js#readme) 这样的库和加盐单向哈希算法。采用这种方法，您只存储哈希密码，并将存储的哈希与**传入**密码的哈希版本进行比较，因此用户密码绝不会以明文形式存储或暴露。为了保持示例应用的简单性，我们违反了该规则并使用了明文。**在您的实际应用中不要这样做。**

现在，更新 `AuthModule` 以导入 `UsersModule`。

```typescript title="auth/auth.module.ts"
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [UsersModule],
  providers: [AuthService],
})
export class AuthModule {}

```

#### 实现 Passport local

现在我们可以实现我们的 Passport **local 认证策略**。在 `auth` 文件夹中创建一个名为 `local.strategy.ts` 的文件，并添加以下代码：

```typescript title="auth/local.strategy.ts"
import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super();
  }

  async validate(username: string, password: string): Promise<any> {
    const user = await this.authService.validateUser(username, password);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}

```

我们遵循了前面描述的所有 Passport 策略的配方。我们对 passport-local 的使用不需要配置选项，因此构造函数调用 `super()` 时不带选项对象。

> info **提示** 您可以在调用 `super()` 时传递一个选项对象，以自定义 Passport 策略的行为。在此示例中，passport-local 策略默认期望请求体中包含名为 `username` 和 `password` 的属性。传递一个选项对象以指定不同的属性名称，例如：`super({ usernameField: 'email' })`。有关更多信息，请参阅 [Passport documentation](http://www.passportjs.org/docs/configure/)。

我们还实现了 `validate()` 方法。对于每种策略，Passport 都会使用策略特定的参数调用 verify 函数（在 `@nestjs/passport` 中的 `validate()` 方法实现）。对于 local 策略，Passport 期望一个具有以下签名的 `validate()` 方法：`validate(username: string, password: string): any`。

大部分验证工作在我们的 `AuthService` 中完成（借助我们的 `UsersService`），因此此方法很短。**任何** Passport 策略的 `validate()` 方法遵循相似的模式，仅在凭证的表示方式上有所不同。如果找到用户且凭证有效，则该方法返回用户，以便 Passport 可以完成其任务（例如，在 `Request` 对象上创建 `user` 属性），请求处理管道可以继续。如果不是，它会抛出异常，并由我们的 [exceptions layer](/overview/exception-filters) 处理。

通常，每种策略的 `validate()` 方法中唯一重要的区别是**如何**确定用户是否存在且有效。例如，在 JWT 策略中，根据要求，我们可能检查解码令牌中携带的 `userId` 是否与我们用户数据库中的记录匹配，或是否出现在被撤销令牌的列表中。这种子类化和实现特定策略验证的模式是一致且可扩展的。

接下来，配置 `AuthModule` 以使用我们刚刚定义的 Passport 功能。更新 `auth.module.ts` 使其如下所示：

```typescript title="auth/auth.module.ts"
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { UsersModule } from '../users/users.module.js';
import { PassportModule } from '@nestjs/passport';
import { LocalStrategy } from './local.strategy.js';

@Module({
  imports: [UsersModule, PassportModule],
  providers: [AuthService, LocalStrategy],
})
export class AuthModule {}

```

#### 内置 Passport 守卫

[Guards](/overview/guards) 章描述了守卫的主要功能：确定请求是否将由路由处理器处理。这一点仍然成立，我们很快将使用这一标准功能。然而，`@nestjs/passport` 模块还引入了一个初看可能令人困惑的新细节，所以我们现在讨论一下。从认证角度来看，您的应用程序可能处于以下两种状态之一：

1. 用户/客户端**未**登录（未认证）
2. 用户/客户端**已**登录（已认证）

在第一种情况（用户未登录）中，我们需要执行两个不同的功能：

- 限制未认证用户可以访问的路由（即拒绝访问受限制的路由）。我们将使用守卫的熟悉能力来处理此功能，方法是将守卫放置在受保护的路由上。此守卫检查有效 JWT 的存在性，因此我们将在颁发 JWT 后再构建它。

- 当先前未认证的用户尝试登录时，启动**认证步骤**本身。这是我们向有效用户**颁发** JWT 的步骤。客户端需要提供用户名/密码凭证来启动认证，因此我们将设置一个 `POST /auth/login` 路由来处理此请求。剩下的问题是如何在该路由中调用 passport-local 策略。

答案是另一种略有不同的类型的守卫。`@nestjs/passport` 模块提供了一个内置守卫，它会调用 Passport 策略并启动上述步骤（检索凭证、运行 verify 函数、创建 `user` 属性等）。

第二种情况（已登录用户）依赖于上述讨论的标准类型的守卫来允许访问受保护的路由。

<app-banner-courses-auth></app-banner-courses-auth>

#### 登录路由

有了策略到位后，我们现在可以实现一个基础的 `/auth/login` 路由，并应用内置守卫来启动 passport-local 流程。

打开 `app.controller.ts` 文件，并用以下内容替换其内容：

```typescript title="app.controller.ts"
import { Controller, Request, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Controller()
export class AppController {
  @UseGuards(AuthGuard('local'))
  @Post('auth/login')
  async login(@Request() req: any) {
    return req.user;
  }
}

```

`AuthGuard('local')` 创建了一个调用注册在 `'local'` 下的 Passport 策略的守卫。当我们扩展 passport-local 策略时，`@nestjs/passport` 使用来自 `passport-local` 包的默认名称，将我们的 `LocalStrategy` 注册到 Passport 中。该名称告诉守卫，当应用有多个 Passport 策略时应调用哪个策略。到目前为止我们只有一个策略，但我们很快会添加第二个。

为了测试该路由，我们暂时让 `/auth/login` 返回用户。这也演示了另一个功能：守卫获取 `validate()` 方法返回的值，并将其作为 `req.user` 赋值给 `Request` 对象。之后，我们将用创建和返回 JWT 的代码替换此部分。

由于这些是 API 路由，我们将使用广泛可用的 [cURL](https://curl.se/) 命令行工具进行测试。您可以使用硬编码在 `UsersService` 中的任何 `user` 对象进行测试。

```bash
$ # POST to /auth/login
$ curl -X POST http://localhost:3000/auth/login -d '{"username": "john", "password": "changeme"}' -H "Content-Type: application/json"
$ # result -> {"userId":1,"username":"john"}

```

虽然这样可行，但将策略名称直接传递给 `AuthGuard()` 会在代码库中引入魔术字符串。相反，我们建议创建自己的类，如下所示：

```typescript title="auth/local-auth.guard.ts"
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}

```

现在，更新 `/auth/login` 路由处理器以使用 `LocalAuthGuard`：

```typescript
@UseGuards(LocalAuthGuard)
@Post('auth/login')
async login(@Request() req: any) {
  return req.user;
}

```

#### 注销路由

要注销，可以创建一个额外的路由来调用 `req.logout()` 以清除用户的会话。这种方法适用于基于会话的认证，但不适用于 JWT。它需要 Passport 的会话支持（`express-session` 连同 `passport.initialize()` 和 `passport.session()` 中间件），而本示例中没有设置这些。自 Passport 0.6 起，`req.logout()` 是异步的，需要回调，因此将其包装在 promise 中：

```typescript
@UseGuards(LocalAuthGuard)
@Post('auth/logout')
async logout(@Request() req: any) {
  await new Promise<void>((resolve, reject) =>
    req.logout((err: any) => (err ? reject(err) : resolve())),
  );
}

```

#### JWT 功能

我们准备进入认证系统的 JWT 部分。让我们回顾和完善我们的要求：

- 允许用户使用用户名/密码进行认证，并返回一个 JWT 用于后续调用受保护的 API 端点。我们已接近满足此要求。要完成它，我们需要编写颁发 JWT 的代码。
- 创建受保护的 API 路由，基于是否存在有效的 JWT 作为 bearer token。

安装额外的包以支持 JWT 要求：

```bash
$ npm install --save @nestjs/jwt passport-jwt
$ npm install --save-dev @types/passport-jwt

```

[`@nestjs/jwt`](https://github.com/nestjs/jwt) 包是一个用于 JWT 操作的实用程序包。`passport-jwt` 包是实现 JWT 策略的 Passport 包，而 `@types/passport-jwt` 提供了其 TypeScript 类型定义。

让我们仔细看看如何处理一个 `POST /auth/login` 请求。我们使用 `LocalAuthGuard` 装饰了该路由，它调用 passport-local 策略。这意味着：

1. **只有在用户经过验证后** 路由处理程序才会被调用
2. `req` 参数将包含一个 `user` 属性（由 Passport 在 passport-local 认证流程期间填充）

考虑到这一点，我们现在可以生成一个真实的 JWT 并从该路由中返回它。为了保持服务的清晰模块化，我们将在 `AuthService` 中生成 JWT。在 `auth` 文件夹中打开 `auth.service.ts` 文件，注入 `JwtService`，并添加 `login()` 方法，如下所示：

```typescript title="auth/auth.service.ts"
import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService
  ) {}

  async validateUser(username: string, pass: string): Promise<any> {
    const user = await this.usersService.findOne(username);
    if (user && user.password === pass) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any) {
    const payload = { username: user.username, sub: user.userId };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}

```

来自 `@nestjs/jwt` 的 `JwtService` 提供了一个 `sign()` 方法，该方法从 `user` 对象属性的子集生成我们的 JWT。我们将其作为具有单个 `access_token` 属性的简单对象返回。我们使用 `sub` 声明来保存我们的 `userId` 值，以符合 JWT 标准。

接下来，更新 `AuthModule` 以导入新的依赖项并配置 `JwtModule`。

首先，在 `auth` 文件夹中创建 `constants.ts` 并添加以下代码：

```typescript title="auth/constants.ts"
export const jwtConstants = {
  secret: 'DO NOT USE THIS VALUE. INSTEAD, CREATE A COMPLEX SECRET AND KEEP IT SAFE OUTSIDE OF THE SOURCE CODE.',
};

```

我们将使用此来在 JWT 签名和验证步骤之间共享密钥。

> 警告 **警告** **请勿公开此密钥**。我们在此这样做是为了清楚地说明代码的作用，但在生产系统中**您必须**使用适当的措施（例如密钥库、环境变量或配置服务）来保护此密钥。

现在，在 `auth` 文件夹中打开 `auth.module.ts` 并更新为如下所示：

```typescript title="auth/auth.module.ts"
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LocalStrategy } from './local.strategy.js';
import { UsersModule } from '../users/users.module.js';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { jwtConstants } from './constants.js';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.register({
      secret: jwtConstants.secret,
      signOptions: { expiresIn: '60s' },
    }),
  ],
  providers: [AuthService, LocalStrategy],
  exports: [AuthService],
})
export class AuthModule {}

```

我们使用 `register()` 配置 `JwtModule`，传入一个配置对象。有关 Nest `JwtModule` 的更多信息，请参阅 [`@nestjs/jwt` README](https://github.com/nestjs/jwt/blob/master/README.md)，有关可用配置选项的详细信息，请参阅 [`jsonwebtoken` usage documentation](https://github.com/auth0/node-jsonwebtoken#用法)。

现在我们可以更新 `/auth/login` 路由以返回 JWT。

```typescript title="app.controller.ts"
import { Controller, Request, Post, UseGuards } from '@nestjs/common';
import { LocalAuthGuard } from './auth/local-auth.guard.js';
import { AuthService } from './auth/auth.service.js';

@Controller()
export class AppController {
  constructor(private authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @Post('auth/login')
  async login(@Request() req: any) {
    return this.authService.login(req.user);
  }
}

```

再次使用 cURL 测试路由。您可以使用 `UsersService` 中硬编码的任何 `user` 对象。

```bash
$ # POST to /auth/login
$ curl -X POST http://localhost:3000/auth/login -d '{"username": "john", "password": "changeme"}' -H "Content-Type: application/json"
$ # result -> {"access_token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}
$ # Note: above JWT truncated

```

#### 实现 Passport JWT

我们现在可以解决最后一个要求：通过要求请求中包含有效的 JWT 来保护端点。Passport 在这方面也有帮助，它提供了 [passport-jwt](https://github.com/mikenicholson/passport-jwt) 策略，用于使用 JSON Web Tokens 保护 RESTful 端点。首先，在 `auth` 文件夹中创建一个名为 `jwt.strategy.ts` 的文件，并添加以下代码：

```typescript title="auth/jwt.strategy.ts"
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { jwtConstants } from './constants.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConstants.secret,
    });
  }

  async validate(payload: any) {
    return { userId: payload.sub, username: payload.username };
  }
}

```

有了我们的 `JwtStrategy`，我们遵循了前面描述的所有 Passport 策略的相同示例。此策略需要一些初始化，因此我们在 `super()` 调用中传入一个选项对象。有关完整列表，请参阅 [passport-jwt strategy options](https://github.com/mikenicholson/passport-jwt#configure-strategy)。在我们的情况下，这些选项是：

- `jwtFromRequest`：提供从 `Request` 中提取 JWT 的方法。我们使用在 API 请求的 `Authorization` 头部中提供 bearer token 的标准方法。有关其他选项，请参阅 [extracting the JWT from the request](https://github.com/mikenicholson/passport-jwt#extracting-the-jwt-from-the-request)。
- `ignoreExpiration`：为明确起见，我们设置了默认 `false` 值，该值将确保 JWT 未过期的责任委托给 Passport 模块。如果我们的路由接收到过期的 JWT，请求将以 `401 Unauthorized` 响应被拒绝。
- `secretOrKey`：我们使用了提供对称密钥来签名令牌的便捷选项。其他选项，例如 PEM 编码的公钥，可能更适合生产应用（有关更多信息，请参阅 [passport-jwt strategy options](https://github.com/mikenicholson/passport-jwt#configure-strategy)）。无论如何，如前警告所述，**请勿公开此密钥**。

`validate()` 方法值得讨论。对于 JWT 策略，Passport 首先验证 JWT 的签名并解码 JSON。然后它调用我们的 `validate()` 方法，将解码后的 JSON 作为其单个参数传递。根据 JWT 签名的工作方式，**我们保证会收到一个有效的令牌**，该令牌是我们先前为有效用户签发和颁发的。

因此，我们的 `validate()` 回调很简单：它返回一个包含 `userId` 和 `username` 属性的对象。请记住，从 `validate()` 返回的值成为 `user` 对象的 `Request` 属性。

您也可以返回一个数组，其中第一个值成为 `user` 对象，第二个值成为 `authInfo` 对象（`req.authInfo`）。

这种方法还为将其他业务逻辑注入到流程中留出了空间（可以理解为“钩子”）。例如，我们可以在 `validate()` 方法中执行数据库查找，以提取有关用户的更多信息，从而在我们的 `Request` 中提供一个更丰富的 `user` 对象。这也是我们可能决定执行进一步令牌验证的地方，例如在撤销令牌列表中查找 `userId`，从而使我们能够执行令牌撤销。我们在示例代码中实现的模型是一个快速的“无状态 JWT”模型，其中每次 API 调用都根据是否存在有效的 JWT 立即授权，并且关于请求者的一小部分信息（其 `userId` 和 `username`）可供我们的请求管道使用。

将新的 `JwtStrategy` 作为 `AuthModule` 中的提供者添加：

```typescript title="auth/auth.module.ts"
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LocalStrategy } from './local.strategy.js';
import { JwtStrategy } from './jwt.strategy.js';
import { UsersModule } from '../users/users.module.js';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { jwtConstants } from './constants.js';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.register({
      secret: jwtConstants.secret,
      signOptions: { expiresIn: '60s' },
    }),
  ],
  providers: [AuthService, LocalStrategy, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}

```

通过导入我们在签名 JWT 时使用的相同密钥，我们确保 Passport 执行的 **验证** 阶段和我们在 `AuthService` 中执行的 **签名** 阶段使用相同的密钥。

最后，我们定义了继承内置 `AuthGuard` 的 `JwtAuthGuard` 类：

```typescript title="auth/jwt-auth.guard.ts"
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

```

#### 实现受保护的路由和 JWT 策略守卫

我们现在可以实现受保护的路由及其相关的守卫。

打开 `app.controller.ts` 文件并按如下方式更新：

```typescript title="app.controller.ts"
import { Controller, Get, Request, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { LocalAuthGuard } from './auth/local-auth.guard.js';
import { AuthService } from './auth/auth.service.js';

@Controller()
export class AppController {
  constructor(private authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @Post('auth/login')
  async login(@Request() req: any) {
    return this.authService.login(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req: any) {
    return req.user;
  }
}

```

再次，我们应用了一个 `AuthGuard`，这次是调用注册在 passport-jwt 默认名称 `jwt` 下的策略。当我们的 `GET /profile` 路由被命中时，守卫会调用我们自定义配置的 passport-jwt 策略，验证 JWT，并将 `user` 属性分配给 `Request` 对象。

确保应用程序正在运行，并使用 cURL 测试路由。

```bash
$ # GET /profile
$ curl http://localhost:3000/profile
$ # result -> {"message":"Unauthorized","statusCode":401}

$ # POST /auth/login
$ curl -X POST http://localhost:3000/auth/login -d '{"username": "john", "password": "changeme"}' -H "Content-Type: application/json"
$ # result -> {"access_token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2Vybm... }

$ # GET /profile using access_token returned from previous step as bearer code
$ curl http://localhost:3000/profile -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2Vybm..."
$ # result -> {"userId":1,"username":"john"}

```

在 `AuthModule` 中，我们配置 JWT 在 60 秒后过期。这对于实际应用来说可能太短了，关于令牌过期和刷新的详细信息超出了本文的范围。我们选择它是为了演示 JWT 和 passport-jwt 策略的一个重要特性：如果在认证后等待 60 秒再发送 `GET /profile` 请求，您将收到一个 `401 Unauthorized` 响应。Passport 会自动检查 JWT 的过期时间，因此您的应用程序无需这样做。

这完成了我们的 JWT 认证实现。 JavaScript 客户端（如 Angular、React 或 Vue 应用）和其他客户端现在可以安全地认证并与我们的 API 服务器通信。

#### 扩展守卫

在大多数情况下，使用提供的 `AuthGuard` 类就足够了。但是，您可能希望扩展默认的错误处理或认证逻辑。为此，请继承内置类并在子类中重写其方法。

```typescript
import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    // Add your custom authentication logic here
    // for example, call super.logIn(request) to establish a session.
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    // You can throw an exception based on either "info" or "err" arguments
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    return user;
  }
}

```

除了扩展默认的错误处理和认证逻辑外，您还可以让认证通过一系列策略。第一个成功、重定向或出错的策略将中止链。认证失败会按顺序通过每个策略，只有当所有策略都失败时认证才会失败。

```typescript
export class JwtAuthGuard extends AuthGuard(['strategy_jwt_1', 'strategy_jwt_2', '...']) { ... }

```

#### 全局启用认证

如果您的大多数端点默认应该受到保护，您可以将认证守卫注册为 [global guard](/overview/guards#绑定守卫)。而不是在每个控制器上使用 `@UseGuards()` 装饰器，然后标记应为公共的路由。

首先，使用以下构造将 `JwtAuthGuard` 注册为全局守卫（在任何模块中）：

```typescript
providers: [
  {
    provide: APP_GUARD,
    useClass: JwtAuthGuard,
  },
],

```

有了这个设置，Nest 将自动将 `JwtAuthGuard` 绑定到所有端点。

接下来，提供一个声明路由为公共的机制。为此，使用 `SetMetadata` 装饰器工厂函数创建一个自定义装饰器。

```typescript
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

```

上面的文件导出了两个常量：我们的元数据键，名为 `IS_PUBLIC_KEY`，以及新的装饰器本身，名为 `Public`（您可以将其命名为 `SkipAuth`、`AllowAnon` 或适合您项目的任何名称）。

有了自定义的 `@Public()` 装饰器，您可以使用它来装饰任何方法，如下所示：

```typescript
@Public()
@Get()
findAll() {
  return [];
}

```

最后，`JwtAuthGuard` 需要在找到 `"isPublic"` 元数据时返回 `true`。为此，请使用 `Reflector` 类（参见守卫章节中的 [putting it all together](/overview/guards#putting-it-all-together)）。

```typescript
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }
}

```

#### 请求作用域策略

Passport API 基于向库的全局实例注册策略。因此，策略并非设计用于具有请求依赖的选项或按请求动态实例化（有关请求作用域提供者的更多信息，请参阅 [injection scopes](/fundamentals/provider-scopes)）。如果您配置策略为请求作用域，Nest 将永远不会实例化它，因为它不与任何特定路由相关联，并且没有方法可以确定对于给定请求应该运行哪些“请求作用域”策略。

但是，您可以在策略内部动态解析请求作用域的提供者。为此，请使用 [module reference](/fundamentals/module-reference) 功能。

首先，打开 `local.strategy.ts` 文件，以常规方式注入 `ModuleRef`：

```typescript
constructor(private moduleRef: ModuleRef) {
  super({
    passReqToCallback: true,
  });
}

```

> info **提示** `ModuleRef` 类是从 `@nestjs/core` 包导入的。

确保将 `passReqToCallback` 配置属性设置为 `true`，如上所示。

在下一步中，使用请求实例来获取当前的上下文标识符，而不是生成一个新的（有关请求上下文的更多信息，请参阅 [getting the current sub-tree](/fundamentals/module-reference#获取当前子树)）。

现在，在 `LocalStrategy` 类的 `validate()` 方法内部，使用 `ContextIdFactory` 类的 `getByRequest()` 方法基于请求对象创建上下文 ID，并将其传递给 `resolve()` 调用：

```typescript
async validate(
  request: Request,
  username: string,
  password: string,
) {
  const contextId = ContextIdFactory.getByRequest(request);
  // "AuthService" is a request-scoped provider
  const authService = await this.moduleRef.resolve(AuthService, contextId);
  ...
}

```

在上面的示例中，`resolve()` 方法异步返回了 `AuthService` 提供者的请求作用域实例（假设 `AuthService` 被标记为请求作用域提供者）。

#### 自定义 Passport

要自定义守卫如何调用 Passport，请将选项传递给 `PassportModule.register()` 方法。除了 `defaultStrategy` 和 `property`（`@nestjs/passport` 本身使用它们）之外，这些选项被传递给 Passport 的 `authenticate()` 调用，因此可用选项取决于正在实现的策略。例如：

```typescript
PassportModule.register({ session: true });

```

您也可以通过向构造函数传递选项对象来配置策略。例如，对于本地策略：

```typescript
constructor(private authService: AuthService) {
  super({
    usernameField: 'email',
    passwordField: 'password',
  });
}

```

有关可用属性名称，请参阅官方 [Passport website](http://www.passportjs.org/docs/oauth/)。

#### 命名策略

在实现策略时，可以通过向 `PassportStrategy()` 函数传递第二个参数来为其命名。否则，每个策略使用其默认名称（例如，JWT 策略的 `'jwt'`）：

```typescript
export class JwtStrategy extends PassportStrategy(Strategy, 'myjwt')

```

然后您可以使用像 `@UseGuards(AuthGuard('myjwt'))` 这样的装饰器引用它。

#### GraphQL

要使用 `AuthGuard` 与 [GraphQL](/graphql/quick-start)，请扩展内置的 `AuthGuard` 类并重写 `getRequest()` 方法。

```typescript
@Injectable()
export class GqlAuthGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext) {
    const ctx = GqlExecutionContext.create(context);
    return ctx.getContext().req;
  }
}

```

要在 GraphQL 解析器中获取当前认证用户，请定义一个 `@CurrentUser()` 装饰器：

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

export const CurrentUser = createParamDecorator(
  (data: unknown, context: ExecutionContext) => {
    const ctx = GqlExecutionContext.create(context);
    return ctx.getContext().req.user;
  },
);

```

要在解析器中使用该装饰器，请将其作为查询或变更的参数包含进去：

```typescript
@Query(() => User)
@UseGuards(GqlAuthGuard)
whoAmI(@CurrentUser() user: User) {
  return this.usersService.findById(user.id);
}

```

对于 passport-local 策略，您还需要将 GraphQL 上下文的参数添加到请求体中，以便 Passport 能够用于验证访问它们。否则，您将收到一个 `Unauthorized` 错误。

```typescript
@Injectable()
export class GqlLocalAuthGuard extends AuthGuard('local') {
  getRequest(context: ExecutionContext) {
    const gqlExecutionContext = GqlExecutionContext.create(context);
    const gqlContext = gqlExecutionContext.getContext();
    const gqlArgs = gqlExecutionContext.getArgs();

    gqlContext.req.body = { ...gqlContext.req.body, ...gqlArgs };
    return gqlContext.req;
  }
}

```