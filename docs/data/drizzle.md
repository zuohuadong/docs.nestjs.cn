<!-- 此文件从 content/data/drizzle.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:43:36.277Z -->
<!-- 源文件: content/data/drizzle.md -->
<!-- 源哈希: 772e5c0332bdb94d4274f4dd913c5940 -->

### Drizzle

作为 TypeORM 的替代方案，您可以使用 [Drizzle ORM](https://orm.drizzle.team/) 和 `@nestjs/drizzle` 包。Drizzle 是一个轻量级、TypeScript 优先的 ORM。您使用纯函数声明表，并使用类似 SQL 的查询构建器（或用于嵌套读取的关系查询 API）编写查询，Drizzle 会从模式推断出所有结果类型。没有实体类、装饰器或代码生成步骤。

要开始使用，请安装所需的依赖项。本章使用 [PostgreSQL](https://www.postgresql.org/) 和 `node-postgres` 驱动程序，但 Drizzle 支持许多其他数据库，包括 MySQL、SQLite 和 Microsoft SQL Server，以及 Neon、Turso 和 Cloudflare D1 等无服务器数据库。本章中的步骤对 Drizzle 支持的每种数据库都是相同的：安装您数据库的驱动程序，并从匹配的 [entry point](https://orm.drizzle.team/docs/connect-overview)（例如 `drizzle-orm/mysql2` 或 `drizzle-orm/libsql`）导入 `drizzle()`，而不是 `drizzle-orm/node-postgres`。

```bash
$ npm install --save @nestjs/drizzle drizzle-orm@rc pg
$ npm install --save-dev drizzle-kit@rc @types/pg

```

> info **提示** 本章使用 Drizzle ORM v1，目前发布于 `rc` 标签下。Drizzle 文档是为该版本编写的。`@nestjs/drizzle` 也支持 Drizzle v0.35 及更高版本。在 v0.x 中，只有关系和关系查询与本章不同（参见 [Upgrading to v1](https://orm.drizzle.team/docs/upgrade-v1)）。

#### 模式 (Schema)

使用 Drizzle，您使用 TypeScript 编写数据库模式。您使用诸如 `pgTable()` 这样的函数声明每个表，并将其从模式文件中导出。我们定义 `users` 表：

```typescript title="db/schema.ts"
import { boolean, integer, pgTable, text } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

```

`$inferSelect` 和 `$inferInsert` 辅助函数从表定义派生行类型，因此没有单独的模型类需要与模式保持同步。有关可用列类型，请参阅 Drizzle 文档中的 [Schema declaration](https://orm.drizzle.team/docs/sql-schema-declaration)。

#### 注册数据库

安装依赖项并定义模式后，将 `DrizzleModule` 导入到根 `AppModule` 中：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';

@Module({
  imports: [
    DrizzleModule.forRoot({
      drizzle,
      connection: process.env.DATABASE_URL!,
    }),
  ],
})
export class AppModule {}

```

`drizzle` 选项接受您驱动程序的 `drizzle()` 函数。`DrizzleModule` 会为每个应用程序实例调用它，传入 `connection` 和其他 Drizzle 选项。因此，每个应用程序（包括每个 e2e 测试创建的应用程序）都拥有自己的连接池，当该应用程序关闭时，连接池也会关闭。由于您传递的是函数，Drizzle 支持的每个驱动程序都以相同的方式工作，并且 TypeScript 会根据该驱动程序的 `drizzle()` 签名检查 `connection` 和其他选项。

`forRoot()` 方法支持以下选项：

<table>
  <tr>
    <td><code>drizzle</code></td>
    <td>您驱动程序的 <code>drizzle()</code> 函数，例如由 <code>drizzle-orm/node-postgres</code></td> 导出的函数
  </tr>
  <tr>
    <td><code>connection</code></td>
    <td>一个连接字符串，或驱动程序的连接选项（例如 <code>pg</code> 池配置）
  </tr>
  <tr>
    <td><code>db</code></td>
    <td>一个您创建的数据库实例，替代使用 <code>drizzle</code> 和 <code>connection</code>（见下文）
  </tr>
  <tr>
    <td><code>autoCloseConnection</code></td>
    <td>如果设置为 <code>true</code>，当应用程序关闭时，数据库的客户端（<code>db.$client</code>）将被关闭（默认为 <code>true</code>）
  </tr>
</table>

其他选项，如 `relations`、`logger` 或 `casing`，也会传递给 `drizzle()`。

> info **提示** 与任何模块的选项一样，`forRoot()` 选项在导入 `AppModule` 文件时进行评估，因此此时 `process.env.DATABASE_URL` 必须已经设置（例如，通过使用 `--env-file=.env` 标志启动 Node.js）。如果想通过 `ConfigService` 读取连接字符串，请使用 `forRootAsync()`，该方法在下文“异步配置”部分描述。

> info **提示** 当调用 `app.close()` 或进程接收到终止信号时（如果启用了 [shutdown hooks](/fundamentals/lifecycle-events#application-shutdown)），客户端将被关闭。基于池的客户端（例如 `node-postgres`、`postgres.js`、`mysql2`）使用 `end()` 关闭，而其他客户端（例如 `better-sqlite3`、`libsql`、PGlite）使用 `close()` 关闭。对于使用 Drizzle 的 [`withReplicas()`](https://orm.drizzle.team/docs/read-replicas) 函数创建的数据库，主数据库和所有副本数据库的客户端都会被关闭（Drizzle v0.44.6 及更高版本；早期版本不暴露副本，因此仅关闭主数据库的客户端）。注册了多个名称的客户端只会被关闭一次。

一旦模块被注册，您就可以使用 `@InjectDrizzle()` 装饰器在项目的任何地方（无需导入任何模块）注入数据库。例如：

```typescript title="app.service.ts"
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class AppService {
  constructor(
    @InjectDrizzle()
    private readonly db: NodePgDatabase,
  ) {}
}

```

要注册您自己创建的数据库，例如使用 Drizzle 的 `withReplicas()` 函数将读取路由到副本的数据库，请将其作为 `db` 传递。在 `forRootAsync()` 工厂中创建它，该工厂为每个应用程序运行一次：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import { withReplicas } from 'drizzle-orm/pg-core';

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      useFactory: () => ({
        db: withReplicas(drizzle(process.env.DATABASE_URL!), [
          drizzle(process.env.REPLICA_DATABASE_URL!),
        ]),
      }),
    }),
  ],
})
export class AppModule {}

```

> warning **警告** 您也可以将 `db` 实例传递给 `forRoot()`，例如由您的种子脚本也导入的 `db` 文件导出的实例。此类实例在文件首次导入时创建一次。从 `AppModule` 创建的每个应用程序共享它，并且第一个关闭的应用程序会关闭它，这会破坏为每个测试创建新应用程序的 e2e 测试套件。在这种情况下，请将 `autoCloseConnection` 设置为 `false` 并自行关闭客户端。

#### 查询

与 TypeORM 集成不同，Drizzle 没有 `forFeature()` 步骤。Drizzle 表是纯对象，您可以在构建查询的任何地方导入它们，并且数据库是全局注册的，因此任何提供者都可以注入它。让我们实现 `UsersService`：

```typescript title="users.service.ts"
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { users, type NewUser, type User } from '../db/schema.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectDrizzle()
    private readonly db: NodePgDatabase,
  ) {}

  findAll(): Promise<User[]> {
    return this.db.select().from(users);
  }

  async findOne(id: number): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async create(user: NewUser): Promise<User> {
    const [createdUser] = await this.db.insert(users).values(user).returning();
    return createdUser;
  }

  async remove(id: number): Promise<void> {
    await this.db.delete(users).where(eq(users.id, id));
  }
}

```

Drizzle 查询在被 `await`（或从 `async` 函数返回）时运行，其结果类型从它选择的列推断出来。Drizzle 文档详细介绍了 [selecting](https://orm.drizzle.team/docs/select)、[inserting](https://orm.drizzle.team/docs/insert)、[updating](https://orm.drizzle.team/docs/update) 和 [deleting](https://orm.drizzle.team/docs/delete) 行。

#### 关系

关系是两个或多个表之间的关联，基于共同的字段，通常是主键和外键。Drizzle 的 [relational queries](https://orm.drizzle.team/docs/rqb-v2) 使用它们来获取嵌套数据，例如用户及其照片，而无需手动编写连接。

让我们添加一个 `photos` 表，其 `userId` 列引用 `users` 表：

```typescript title="db/schema.ts"
export const photos = pgTable('photos', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  url: text().notNull(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
});

```

您使用 `defineRelations()` 函数一次性声明整个模式的关系。例如，每个用户可以有许多照片，每张照片属于一个用户：

```typescript title="db/relations.ts"
import { defineRelations } from 'drizzle-orm';
import * as schema from './schema.js';

export const relations = defineRelations(schema, (r) => ({
  users: {
    photos: r.many.photos(),
  },
  photos: {
    user: r.one.users({
      from: r.photos.userId,
      to: r.users.id,
    }),
  },
}));

```

要使关系可用于关系查询，请使用 `drizzle()` 并带有 `relations` 选项将其传递：

```typescript
DrizzleModule.forRoot({
  drizzle,
  connection: process.env.DATABASE_URL!,
  relations,
}),

```

现在数据库类型取决于关系，因此只需声明一次，在您注入数据库的任何地方重用它：

```typescript title="db/database.ts"
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { relations } from './relations.js';

export type Database = NodePgDatabase<typeof relations>;

```

有了这些，`db.query` API 具有完整的类型：

```typescript title="users.service.ts"
@Injectable()
export class UsersService {
  constructor(
    @InjectDrizzle()
    private readonly db: Database,
  ) {}

  findOneWithPhotos(id: number) {
    return this.db.query.users.findFirst({
      where: { id },
      with: { photos: true },
    });
  }
}

```

> info **提示** 关系仅驱动关系查询。外键约束来自表定义中的 `references()`。要了解更多信息，请参阅 Drizzle 文档中的 [Relations](https://orm.drizzle.team/docs/relations-v2)。

#### Drizzle 事务

数据库事务是一个工作单元，数据库管理系统将其视为一个整体，独立于其他事务：要么应用其所有更改，要么不应用任何更改。要了解更多信息，请参阅维基百科上的 [Database transaction](https://en.wikipedia.org/wiki/Database_transaction)。

要启动一个 [Drizzle transaction](https://orm.drizzle.team/docs/transactions)，请调用注入数据库的 `transaction()` 方法。回调接收一个事务对象（`tx`），该对象暴露与数据库相同的查询 API：

```typescript
async deactivate(id: number) {
  await this.db.transaction(async (tx) => {
    await tx.update(users).set({ isActive: false }).where(eq(users.id, id));
    await tx.delete(photos).where(eq(photos.userId, id));
  });
}

```

如果回调抛出或调用 `tx.rollback()`，则事务回滚，并且 `transaction()` 以错误拒绝。否则，事务提交，并且 `transaction()` 以回调返回的值解析。属于事务的查询必须通过 `tx` 运行，而不是通过注入的数据库。

> info **提示** 要在一个事务中从多个提供者运行代码而无需传递 `tx`，请使用 `AsyncLocalStorage` 传播事务。[`nestjs-cls`](/recipes/async-local-storage#nestjs-cls) 包提供了一个带有 [Drizzle adapter](https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional/drizzle-orm-adapter) 的事务插件来实现此功能。

#### 自定义仓储

Drizzle 没有仓储层：您从注入的数据库和表定义构建查询。为了将某个表的查询保持在同一位置，并使使用它们的类易于单元测试，您可以将仓储作为常规提供者自己编写：

```typescript title="users.repository.ts"
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { users, type User } from '../db/schema.js';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectDrizzle()
    private readonly db: Database,
  ) {}

  findActive(): Promise<User[]> {
    return this.db.select().from(users).where(eq(users.isActive, true));
  }

  async deactivate(id: number): Promise<void> {
    await this.db.update(users).set({ isActive: false }).where(eq(users.id, id));
  }
}

```

在 `UsersModule` 的 `providers` 数组中注册 `UsersRepository`，并在 `UsersService` 中注入它，而不是注入数据库。在单元测试中，用一个 [custom provider](/fundamentals/dependency-injection) 替换它，该 `useValue` 是一个实现您的服务调用的方法的对象，例如 `findActive()`。

> warning **警告** 仓储方法查询注入的数据库，而不是事务的 `tx`。使用连接池时，它们在与使用 `db.transaction()` 在别处启动的事务不同的连接上运行，因此不属于该事务。要将它们在事务中运行，请将 `tx` 作为参数接受，或如上所述使用 `nestjs-cls` 传播事务。

#### 迁移

[Migrations](https://orm.drizzle.team/docs/migrations) 增量更新数据库模式，使其与应用程序的数据模型保持同步，同时保留现有数据。要生成和运行迁移，Drizzle 提供了一个专用的 CLI，[Drizzle Kit](https://orm.drizzle.team/docs/kit-overview)，它从项目根目录中的 `drizzle.config.ts` 文件读取其设置：

```typescript title="drizzle.config.ts"
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});

```

有了该文件，`npx drizzle-kit generate` 会从您的模式更改创建 SQL 迁移文件，而 `npx drizzle-kit migrate` 会将它们应用于数据库。

Drizzle Kit 在您的 Nest 应用程序外部运行，因此迁移不能使用依赖注入或其他 Nest 特定功能。Drizzle Kit 从您运行它的目录加载 `.env` 文件，因此在 `drizzle.config.ts` 中可以访问 `process.env.DATABASE_URL` 而无需 `ConfigModule`。环境变量中已设置的变量优先于文件。

如果希望在应用程序启动时应用待处理的迁移，请在 `forRootAsync()` 工厂中创建数据库并在那里应用它们。该工厂可以是 `async`，并且 Nest 在解析之前不会创建注入数据库的提供者：

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

DrizzleModule.forRootAsync({
  useFactory: async () => {
    const db = drizzle(process.env.DATABASE_URL!, { relations });
    await migrate(db, { migrationsFolder: './drizzle' });
    return { db };
  },
}),

```

> warning **警告** 当您的应用程序的多个实例同时启动时，每个实例都会尝试应用迁移。在这种部署中，请将 `drizzle-kit migrate` 作为发布过程的单独步骤运行。

<app-banner-courses></app-banner-courses>

#### 多个数据库

某些项目需要多个数据库连接，`DrizzleModule` 也支持此功能。使用各自的 `DrizzleModule` 导入注册每个数据库。在这种情况下，除一个数据库外，每个数据库都必须有一个名称：

```typescript
@Module({
  imports: [
    DrizzleModule.forRoot({
      drizzle,
      connection: process.env.DATABASE_URL!,
      relations,
    }),
    DrizzleModule.forRoot({
      name: 'analytics',
      drizzle,
      connection: process.env.ANALYTICS_DATABASE_URL!,
    }),
  ],
})
export class AppModule {}

```

> warning **注意** 未注册名称的数据库名称为 `default`。不要注册多个没有名称或名称相同的数据库：它们将共享一个注入令牌，并且只有一个会被注入。

数据库不必共享驱动程序：`analytics` 也可以是使用 `drizzle-orm/better-sqlite3` 中的 `drizzle()` 函数打开的 SQLite 文件。要注入除默认数据库外的数据库，请将其名称传递给 `@InjectDrizzle()` 装饰器：

```typescript
@Injectable()
export class ReportsService {
  constructor(
    @InjectDrizzle('analytics')
    private readonly analyticsDb: NodePgDatabase,
  ) {}
}

```

您还可以使用 `getDrizzleToken()` 函数将任何数据库注入到工厂提供者中，该函数返回给定名称的数据库的注入令牌：

```typescript
@Module({
  providers: [
    {
      provide: ReportsService,
      useFactory: (analyticsDb: NodePgDatabase) => {
        return new ReportsService(analyticsDb);
      },
      inject: [getDrizzleToken('analytics')],
    },
  ],
})
export class ReportsModule {}

```

#### 测试

在单元测试应用程序时，通常希望避免连接到数据库，以保持测试套件的独立性和速度。然而，您的类依赖于使用 `@InjectDrizzle()` 注入的数据库。为解决此问题，请使用 [custom provider](/fundamentals/dependency-injection) 将数据库替换为模拟对象。`getDrizzleToken()` 函数返回默认数据库（或您传入名称的数据库）的注入令牌：

```typescript
@Module({
  providers: [
    UsersService,
    {
      provide: getDrizzleToken(),
      useValue: mockDb,
    },
  ],
})
export class UsersModule {}

```

Nest 现在会在任何类使用 `@InjectDrizzle()` 装饰器请求数据库的地方注入 `mockDb` 对象。Drizzle 的查询构建器是可链式调用的（例如 `select().from().where()`），因此模拟对象必须实现代码调用的链中的每个方法。对于超出简单查询的任何情况，请将查询移至 [custom repositories](https://docs.nestjs.com/data/drizzle#custom-repositories) 中并模拟它们，或者针对真实数据库运行这些测试。

#### 异步配置

要异步而不是静态地传递 `DrizzleModule` 选项，请使用 `forRootAsync()` 方法。它支持多种提供选项的方式。

一种方法是工厂函数。该工厂的行为类似于任何其他 [asynchronous provider](/fundamentals/async-components)：它可以是 `async`，并且可以通过 `inject` 注入依赖项。它返回与 `forRoot()` 相同的选项（除了 `name`），要么是 `drizzle` 和 `connection`，要么是一个 `db` 实例：

```typescript
DrizzleModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (configService: ConfigService) => ({
    drizzle,
    connection: configService.getOrThrow<string>('DATABASE_URL'),
    relations,
  }),
  inject: [ConfigService],
});

```

或者，您可以使用 `useClass` 语法：

```typescript
DrizzleModule.forRootAsync({
  imports: [ConfigModule],
  useClass: DrizzleConfigService,
});

```

通过此构造，`DrizzleModule` 实例化 `DrizzleConfigService`，从 `imports` 中的模块解析其依赖项，并调用其 `createDrizzleOptions()` 方法以获取选项。因此，`DrizzleConfigService` 必须实现 `DrizzleOptionsFactory` 接口：

```typescript
@Injectable()
class DrizzleConfigService implements DrizzleOptionsFactory {
  constructor(private readonly configService: ConfigService) {}

  createDrizzleOptions(): DrizzleModuleFactoryOptions {
    return {
      drizzle,
      connection: this.configService.getOrThrow<string>('DATABASE_URL'),
      relations,
    };
  }
}

```

> info **提示** `createDrizzleOptions()` 接收正在注册的数据库的名称（默认数据库为 `undefined`），因此单个类可以配置多个数据库。

为了重用来自另一个模块的提供者而不是在 `DrizzleModule` 内部实例化 `DrizzleConfigService`，请使用 `useExisting` 语法：

```typescript
DrizzleModule.forRootAsync({
  imports: [DatabaseConfigModule],
  useExisting: DrizzleConfigService,
});

```

这类似于 `useClass`，但有一个关键区别：`DrizzleModule` 重用导入模块导出的 `DrizzleConfigService` 实例（此处为 `DatabaseConfigModule`），而不是创建新实例。