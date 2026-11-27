<!-- 此文件从 content/data/prisma.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:42:52.665Z -->
<!-- 源文件: content/data/prisma.md -->
<!-- 源哈希: ac38e9fbb61c04ceae2be5211002dc4c -->

### Prisma

[Prisma](https://www.prisma.io) 是一个用于 Node.js 和 TypeScript 的 [open-source](https://github.com/prisma/prisma) ORM。您可以将其用作编写纯 SQL 或其他数据库访问工具（如 [knex.js](https://knexjs.org/)）或其他 ORM（如 [TypeORM](https://typeorm.io/) 和 [Sequelize](https://sequelize.org/)）的**替代方案**。Prisma 支持 PostgreSQL、MySQL、SQL Server、SQLite、CockroachDB 和 MongoDB（参见 [supported databases](https://www.prisma.io/docs/orm/reference/supported-databases)）。本章使用 Prisma ORM 7，它与 SQL 数据库一起工作；MongoDB 项目目前仍使用 Prisma ORM 6。

虽然您可以使用 Prisma 与纯 JavaScript 配合使用，但它拥抱 TypeScript，提供了超越 TypeScript 生态系统中其他 ORM 保证的类型安全级别。有关详细信息，请参阅 [comparison of the type safety guarantees of Prisma and TypeORM](https://www.prisma.io/docs/orm/more/comparisons/prisma-and-typeorm#type-safety)。

Prisma 没有特定于 Nest 的包。相反，您从 Prisma 模式生成一个类型安全的客户端（Prisma Client），将其包装在一个提供者中，并在需要数据库访问的任何地方注入该提供者。本章使用一个不需要数据库服务器的 [SQLite](https://sqlite.org/) 数据库设置了该集成，并在过程中指出了 PostgreSQL、MySQL 和 SQL Server 的差异。

> info **注意** 有关 Prisma 工作原理的概述，请遵循 [Quickstart](https://www.prisma.io/docs/getting-started/prisma-orm/quickstart/prisma-postgres) 或阅读 [Introduction](https://www.prisma.io/docs/orm/overview/introduction/what-is-prisma)（位于 [Prisma documentation](https://www.prisma.io/docs) 中）。要将 Prisma 添加到已具有数据库的项目中，请遵循 [adding Prisma to an existing project](https://www.prisma.io/docs/getting-started/setup-prisma/add-to-existing-project-typescript-postgres) 的指南。如果您是从 TypeORM 迁移，请阅读 [Migrating from TypeORM to Prisma](https://www.prisma.io/docs/guides/migrate-from-typeorm)。

#### 安装

将 [Prisma CLI](https://www.prisma.io/docs/orm/tools/prisma-cli) 和 `dotenv` 作为开发依赖项安装，然后安装 Prisma Client 和适用于您数据库的驱动适配器。对于 SQLite，`@prisma/adapter-better-sqlite3` 适配器也会安装 `better-sqlite3` 驱动：

```bash
$ npm install prisma@7 dotenv --save-dev
$ npm install @prisma/client@7 @prisma/adapter-better-sqlite3

```

> warning **警告** 明确安装 Prisma ORM 7，如上所示。在撰写本文时，npm 上的 `latest` 包的 `prisma` 标签指向 Prisma 8 的预发布版本，这是一个不同的 CLI，不提供本章中使用的 `prisma migrate` 和 `prisma generate` 命令。请保持 `prisma` 和 `@prisma/client` 在同一大版本上。

<details><summary>如果您使用 PostgreSQL、MySQL、SQL Server 或 Azure SQL，请展开 </summary>

请安装适用于您数据库的适配器，而不是 `@prisma/adapter-better-sqlite3`。每个适配器包都包含其数据库驱动。

- 对于 PostgreSQL：

```bash
$ npm install @prisma/adapter-pg

```

- 对于 MySQL（和 MariaDB）：

```bash
$ npm install @prisma/adapter-mariadb

```

- 对于 SQL Server 和 Azure SQL：

```bash
$ npm install @prisma/adapter-mssql

```

</details>

接下来，使用 `init` 命令创建初始 Prisma 设置。在 Prisma CLI 命令前加上 `npx`，以便运行项目中安装的版本：

```bash
$ npx prisma init --datasource-provider sqlite --output ../src/generated/prisma

```

此命令创建以下文件：

- `prisma/schema.prisma`：包含您的数据库模式，包括数据源提供者和 Prisma Client 生成器
- `prisma7.config.ts`：Prisma 配置文件，创建在项目根目录中。它设置模式和迁移的位置，并从 `DATABASE_URL` 环境变量中读取数据库连接 URL。Prisma ORM 7.10 之前的版本将此文件命名为 `prisma.config.ts`，Prisma 仍然识别它。
- `.env`：一个 [dotenv](https://github.com/motdotla/dotenv) 文件，在 `DATABASE_URL` 环境变量中存储数据库连接 URL

它还将 `.env` 和生成的客户端目录添加到您的 `.gitignore` 文件中。

#### 设置生成器输出路径

Prisma Client 生成到由 `output` 字段（位于 `generator` 块中）设置的目录中，该目录相对于模式文件。上面的 `--output` 选项将客户端放置在 `src` 内部，因此它会与应用程序的其余部分一起编译。如果没有此选项，`prisma init` 将路径设置为 `../generated/prisma`，该路径在 `src` 外部。您也可以直接在 Prisma 模式中设置路径：

```groovy
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

```

由于生成的客户端被排除在版本控制之外，因此在全新检出或 CI 中构建应用程序之前，请运行 `npx prisma generate`。

#### 配置模块格式

Prisma 从您的 `tsconfig.json` 文件推断生成客户端的模块格式。使用 ES 模块（新项目的默认设置）的 NestJS 项目将获得 ES 模块客户端，因此无需额外配置。

如果您的项目使用 CommonJS，请在生成器中设置 `moduleFormat` 为 `cjs`：

```groovy
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "cjs"
}

```

> info **注意** 生成的 ESM 客户端依赖于 `import.meta`，这在 CommonJS 中不可用。Prisma ORM 7.10 之前的版本在 `tsconfig.json` 设置 `module` 为 `nodenext` 时，即使在 CommonJS 项目中也会生成 ES 模块，因此请明确设置 `moduleFormat`，而不是依赖推断。

#### 设置数据库连接

您 `schema.prisma` 文件中的 `datasource` 块定义了您使用的数据库。使用 `--datasource-provider sqlite` 选项，`prisma init` 将其 `provider` 字段设置为 `sqlite`（默认是 `postgresql`）：

```groovy
datasource db {
  provider = "sqlite"
}

```

连接 URL 本身不是模式的一部分：Prisma 配置文件从 `DATABASE_URL` 环境变量中读取它，该变量由 `prisma init` 在 `.env` 中设置：

```bash
DATABASE_URL="file:./dev.db"

```

SQLite 数据库是一个纯文件，因此连接 URL 指向本地文件，而不是 _host_ 和 _port_，在本例中是项目根目录中的 `dev.db`。当您运行第一次迁移时，Prisma 会创建该文件。

Prisma CLI 通过 Prisma 配置文件的顶部 `.env` 导入加载 `dotenv/config`。但是，您的 NestJS 应用程序不会自动加载 `.env`。安装 `@nestjs/config` 包并在您的 `AppModule` 中全局注册 [`ConfigModule`](/application/configuration)，以便 `PrismaService` 可以通过 `DATABASE_URL` 读取 `ConfigService`：

```bash
$ npm install @nestjs/config

```

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
})
export class AppModule {}

```

<details><summary>如果您使用 PostgreSQL、MySQL、SQL Server 或 Azure SQL，请展开 </summary>

对于 PostgreSQL、MySQL 和 SQL Server，连接 URL 指向 _数据库服务器_。将匹配的提供者传递给 `prisma init`（例如 `--datasource-provider postgresql`），或者更改 `datasource` 块中的 `provider` 字段，并在 `.env` 中设置 `DATABASE_URL`。有关所需格式，请参阅 [connection URL reference](https://www.prisma.io/docs/orm/reference/connection-urls)。

**PostgreSQL**

```groovy
datasource db {
  provider = "postgresql"
}

```

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=SCHEMA"

```

用您的数据库凭证替换大写占位符。如果您不确定为 `SCHEMA` 占位符提供什么，它最可能是默认值 `public`。如果您还没有 PostgreSQL 服务器，请在终端中运行 `npx prisma dev` 以启动本地 Prisma Postgres 数据库。

**MySQL**

```groovy
datasource db {
  provider = "mysql"
}

```

```bash
DATABASE_URL="mysql://USER:PASSWORD@HOST:PORT/DATABASE"

```

用您的数据库凭证替换大写占位符。

**Microsoft SQL Server / Azure SQL Server**

```groovy
datasource db {
  provider = "sqlserver"
}

```

```bash
DATABASE_URL="sqlserver://HOST:PORT;database=DATABASE;user=USER;password=PASSWORD;encrypt=true"

```

用您的数据库凭证替换大写占位符。如果您不确定为 `encrypt` 选项提供什么，它最可能是默认值 `true`。

</details>

#### 模型和迁移

[Prisma Migrate](https://www.prisma.io/docs/orm/prisma-migrate/getting-started) 从 Prisma 模式中的声明式数据模型生成 SQL 迁移文件。这些迁移文件是完全可定制的，因此您可以配置底层数据库的附加功能或包含附加命令（例如，用于播种）。

本章使用两个模型。将它们添加到您的 `schema.prisma` 文件中：

```groovy
model User {
  id    Int     @default(autoincrement()) @id
  email String  @unique
  name  String?
  posts Post[]
}

model Post {
  id        Int      @default(autoincrement()) @id
  title     String
  content   String?
  published Boolean? @default(false)
  author    User?    @relation(fields: [authorId], references: [id])
  authorId  Int?
}

```

然后生成第一个迁移并将其应用于数据库：

```bash
$ npx prisma migrate dev --name init

```

`prisma migrate dev` 命令生成 SQL 文件并直接将其应用于数据库。由于数据库尚不存在，它还会创建 `dev.db` 文件。迁移文件创建在 `prisma` 目录中：

```bash
$ tree prisma
prisma
├── migrations
│   ├── 20201207100915_init
│   │   └── migration.sql
│   └── migration_lock.toml
└── schema.prisma

```

<details><summary>展开查看生成的 SQL 语句</summary>

您的 SQLite 数据库中创建了以下表：

```sql
-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "name" TEXT
);

-- CreateTable
CREATE TABLE "Post" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "published" BOOLEAN DEFAULT false,
    "authorId" INTEGER,
    CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

```

</details>

#### 生成 Prisma Client

Prisma Client 是一个类型安全的数据库客户端，它从您的 Prisma 模式中**生成**。这种方法使 Prisma Client 能够暴露**专门**针对您的模型的 [CRUD](https://www.prisma.io/docs/orm/prisma-client/queries/crud) 操作。使用 `generate` 命令生成客户端及其类型：

```bash
$ npx prisma generate

```

`prisma migrate dev` 不会为您运行此命令。每当您更改模式时，请重新运行 `prisma generate` 以保持客户端及其类型同步。

生成的 `client.ts` 文件是客户端的入口点。它导出了 `PrismaClient` 类，每个模型的类型（例如 `User` 和 `Post`），以及包含查询输入类型的 `Prisma` 命名空间（例如 `Prisma.UserCreateInput`）。与 ESM 项目中的任何其他相对导入一样，请使用 `.js` 扩展（`./generated/prisma/client.js`）导入它。

#### PrismaService

在 NestJS 应用程序中，您通过一个提供者暴露 Prisma Client。创建一个继承自 `PrismaClient` 的 `PrismaService` 类，以便服务拥有完整的 Prisma Client API，并将数据库的驱动适配器传递给 `PrismaClient` 构造函数。Prisma ORM 7 需要驱动适配器（或 Prisma Accelerate URL）才能创建客户端。

在 `src/prisma` 目录中创建一个 `prisma.service.ts` 文件：

```typescript
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    const adapter = new PrismaBetterSqlite3({
      url: configService.getOrThrow<string>('DATABASE_URL'),
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

```

构造函数在调用 `super()` 之前读取 `DATABASE_URL` 到 `ConfigService`。如果变量未设置，`getOrThrow()` 方法会抛出错误，因此缺少连接 URL 会在启动时停止应用程序。`onModuleInit()` 和 `onModuleDestroy()` 钩子管理连接，如 [Connection lifecycle](#connection-lifecycle) 所述。

> info **提示** 如果您不使用 `@nestjs/config`，请使用 `--env-file=.env` 标志启动 Node.js，并在构造函数中读取 `process.env.DATABASE_URL`。

<details><summary>如果您使用 PostgreSQL、MySQL、SQL Server 或 Azure SQL，请展开</summary>

将 `PrismaBetterSqlite3` 替换为您的数据库的适配器类（`PrismaPg`、`PrismaMariaDb` 或 `PrismaMssql`），并将其传递驱动期望的连接设置。这些适配器中的每一个也接受连接字符串。例如，对于 PostgreSQL：

```typescript
import { PrismaPg } from '@prisma/adapter-pg';

// inside the PrismaService constructor
const adapter = new PrismaPg({
  connectionString: configService.getOrThrow<string>('DATABASE_URL'),
});
super({ adapter });

```

</details>

#### 连接生命周期

Prisma Client 惰性连接，在发送第一个查询时连接。在 `onModuleInit()` 钩子中调用 `$connect()` 会在应用程序引导期间连接，而不是在第一次请求时失败，因此配置错误的连接会在启动时失败，而不是在第一次请求时失败。

在 `onModuleDestroy()` 钩子中调用 `$disconnect()` 会在应用程序关闭时关闭连接。它还会处置驱动适配器，从而关闭底层驱动连接（例如，它会终止 `PrismaPg` 创建的连接池）。当您调用 `app.close()` 时，Nest 会调用 `onModuleDestroy()`。要使其在进程接收到终止信号（例如 `SIGTERM`）时也调用它，请在 `main.ts` 文件中启用关闭钩子：

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

有关关闭钩子的更多信息，请参阅 [Application shutdown](/fundamentals/lifecycle-events#application-shutdown)。

> info **提示** Prisma ORM 7 不支持旧的 Prisma 集成用来关闭应用程序的 `beforeExit` 事件（`$on('beforeExit', ...)`）。请改用上面显示的 Nest 生命周期钩子。

#### PrismaModule

在一个专用的 模块中注册 `PrismaService` 并导出它。在服务旁边创建一个 `prisma.module.ts` 文件：

```typescript
import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

```

将 `PrismaModule` 导入到所有需要数据库访问的 模块中。提供者默认是单例，因此所有导入的 模块共享相同的 `PrismaService` 实例及其连接。

> info **提示** 如果您的大多数 模块都需要数据库访问，您可以使用 `@Global()` 装饰 `PrismaModule`，并且只在根 模块中导入它。有关权衡，请参阅 [Global modules](/modules#全局模块)。

#### 从服务中查询

有了 `PrismaModule`，将 `PrismaService` 注入到您的提供者中，并通过其模型属性（例如 `this.prisma.user`）查询数据库。以下 `UsersService` 包装了 `User` 模型的 CRUD 查询：

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma, User } from '../generated/prisma/client.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async user(where: Prisma.UserWhereUniqueInput): Promise<User | null> {
    return this.prisma.user.findUnique({ where });
  }

  async users(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.UserWhereUniqueInput;
    where?: Prisma.UserWhereInput;
    orderBy?: Prisma.UserOrderByWithRelationInput;
  }): Promise<User[]> {
    const { skip, take, cursor, where, orderBy } = params;
    return this.prisma.user.findMany({ skip, take, cursor, where, orderBy });
  }

  async createUser(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  async updateUser(params: {
    where: Prisma.UserWhereUniqueInput;
    data: Prisma.UserUpdateInput;
  }): Promise<User> {
    const { where, data } = params;
    return this.prisma.user.update({ data, where });
  }

  async deleteUser(where: Prisma.UserWhereUniqueInput): Promise<User> {
    return this.prisma.user.delete({ where });
  }
}

```

服务使用生成的类型作为其参数和返回值，因此您不需要为模型编写单独的接口。在实际应用中，服务也是您的业务逻辑所在的地方。例如，一个 `UsersService` 可以有一个 `updatePassword()` 方法，负责更新用户的密码。

控制器然后通过路由处理器暴露服务：

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import { User as UserModel } from '../generated/prisma/client.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async findAll(@Query('search') search?: string): Promise<UserModel[]> {
    return this.usersService.users({
      where: search
        ? {
            OR: [
              { name: { contains: search } },
              { email: { contains: search } },
            ],
          }
        : undefined,
      orderBy: { id: 'asc' },
    });
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<UserModel | null> {
    return this.usersService.user({ id });
  }

  @Post()
  async create(
    @Body() userData: { name?: string; email: string },
  ): Promise<UserModel> {
    return this.usersService.createUser(userData);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<UserModel> {
    return this.usersService.deleteUser({ id });
  }
}

```

> info **提示** 生成的类型仅存在于编译时，因此 `ValidationPipe` 不能使用它们来验证请求负载。要验证请求体，请声明一个 DTO 类，如 [Validation](/techniques/validation) 所述。

最后，在一个导入 `PrismaModule` 的 `UsersModule` 中注册控制器和服务，并将 `UsersModule` 导入到您的 `AppModule` 中：

```typescript
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}

```

#### 事务

Prisma Client 提供多种在事务中运行查询的方法（参见 [Transactions and batch queries](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)）：

- **嵌套写入**：在一个查询中创建或更新记录及其相关记录，会自动在事务中运行。
- **顺序操作**：将查询数组传递给 `$transaction()`。Prisma 按顺序在单个事务中运行它们，并解析为包含结果的数组。
- **交互式事务**：将一个异步函数传递给 `$transaction()`。当函数解析时，Prisma 提交事务；当函数抛出异常时，它会回滚事务。

以下方法在 `UsersService` 中展示了最后两种形式：

```typescript
async publishedPosts(skip: number, take: number) {
  const [posts, total] = await this.prisma.$transaction([
    this.prisma.post.findMany({ where: { published: true }, skip, take }),
    this.prisma.post.count({ where: { published: true } }),
  ]);
  return { posts, total };
}

async deleteUserWithPosts(id: number): Promise<User> {
  return this.prisma.$transaction(async (tx) => {
    await tx.post.deleteMany({ where: { authorId: id } });
    return tx.user.delete({ where: { id } });
  });
}

```

在交互式事务中，通过 Prisma 传递给函数的事务客户端（`tx`）发送每个查询。通过 `this.prisma` 发送的查询在事务外部运行。这两种 `$transaction()` 形式都接受一个选项对象作为第二个参数，包含 `maxWait`、`timeout` 和 `isolationLevel` 属性。

通过每个参与事务的方法传递 `tx` 会将您的服务耦合在一起。如果想使用装饰器声明事务边界，请使用 [`nestjs-cls`](/recipes/async-local-storage#nestjs-cls) 包的事务插件及其 [Prisma adapter](https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional/prisma-adapter)（`@nestjs-cls/transactional-adapter-prisma`）。它将活动的事务客户端保留在异步本地存储中，并提供一个 `@Transactional()` 装饰器和一个可注入的 `TransactionHost`。

#### 测试

当您对依赖于 `PrismaService` 的提供者进行单元测试时，通常希望避免数据库连接。由于 `PrismaService` 是一个常规的类提供者，您可以使用类本身作为注入令牌和任何标准的 [custom provider](/fundamentals/dependency-injection) 技术（例如 `useValue`）将其替换为模拟对象：

```typescript
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  let usersService: UsersService;
  const prismaMock = {
    user: {
      findUnique: vi.fn(),
    },
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    usersService = moduleRef.get(UsersService);
  });

  it('returns a user by id', async () => {
    const user = { id: 1, email: 'alice@prisma.io', name: 'Alice' };
    prismaMock.user.findUnique.mockResolvedValue(user);

    expect(await usersService.user({ id: 1 })).toEqual(user);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
    });
  });
});

```

模拟对象完全替换了 `PrismaService`，因此其 `onModuleInit()` 钩子不会运行，测试永远不会打开数据库连接。当您测试导入了 `PrismaModule` 的模块时，请用 `overrideProvider(PrismaService)` 替换提供者。有关更多测试工具，请参阅 [Testing](/fundamentals/testing)。

#### 可观测性

[NestJS Observe](https://www.observe.nestjs.com/?ref=docs-prisma 'NestJS Observe')，我们的官方可观测性平台，通过它们运行的驱动适配器记录 Prisma 查询。在 PostgreSQL（`@prisma/adapter-pg`）和 SQL Server（`@prisma/adapter-mssql`）上，每条语句都是在运行它的提供者方法下的一个跨度，但其值已被移除，因此慢速请求会显示它正在等待哪个查询，N+1 循环会显示为重复的单条语句。MySQL 和 MariaDB 适配器（`@prisma/adapter-mariadb`）以及 SQLite 适配器运行在尚未进行插桩的驱动上。请参阅 [Database queries and outbound HTTP](/observability/sdk#database-queries-and-outbound-http)。

<figure><img src="https://www.observe.nestjs.com/docs/telemetry/sql.webp" alt="A query opened in the waterfall" /></figure>

#### 示例

可直接运行的 [REST](https://github.com/prisma/prisma-examples/tree/b53fad046a6d55f0090ddce9fd17ec3f9b95cab3/orm/nest) 和 [GraphQL](https://github.com/prisma/prisma-examples/tree/b53fad046a6d55f0090ddce9fd17ec3f9b95cab3/orm/nest-graphql) 示例项目可在 [`prisma-examples`](https://github.com/prisma/prisma-examples/) 仓库中获取。有关更多资源，请参阅 Prisma 网站上的 [NestJS & Prisma](https://www.prisma.io/nestjs)。