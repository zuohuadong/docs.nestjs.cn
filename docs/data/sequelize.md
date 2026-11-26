<!-- 此文件从 content/data/sequelize.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:33:37.999Z -->
<!-- 源文件: content/data/sequelize.md -->
<!-- 源哈希: 32a9930c5c622bd1ab76f0316bb05087 -->

### Sequelize

`@nestjs/sequelize` 包将 [Sequelize](https://sequelize.org/) ORM 与 Nest 集成。它还使用了 [sequelize-typescript](https://github.com/RobinBuschmann/sequelize-typescript) 包，该包提供装饰器以声明式地定义模型。

要开始使用它，我们首先安装所需的依赖项。在本章中，我们将演示如何使用流行的 [MySQL](https://www.mysql.com/) 关系型 DBMS，但 Sequelize 支持许多关系型数据库，例如 PostgreSQL、MySQL、Microsoft SQL Server、SQLite 和 MariaDB。本章中介绍的步骤对于 Sequelize 支持的任何数据库都是相同的。您只需为所选数据库安装相应的客户端 API 库即可。

```bash
$ npm install --save @nestjs/sequelize sequelize sequelize-typescript mysql2
$ npm install --save-dev @types/sequelize

```

安装过程完成后，我们可以将 `SequelizeModule` 导入到根 `AppModule` 中。

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

@Module({
  imports: [
    SequelizeModule.forRoot({
      dialect: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: 'root',
      database: 'test',
      models: [],
    }),
  ],
})
export class AppModule {}

```

`forRoot()` 方法支持 Sequelize 构造器暴露的所有配置属性（[read more](https://sequelize.org/docs/v6/getting-started/#connecting-to-a-database)）。此外，还有一些额外的配置属性如下所述。

<table>
  <tr>
    <td><code>retryAttempts</code></td>
    <td>连接到数据库的尝试次数（默认值：<code>10</code>）</td>
  </tr>
  <tr>
    <td><code>retryDelay</code></td>
    <td>连接重试尝试之间的延迟（毫秒）（默认值：<code>3000</code>）</td>
  </tr>
  <tr>
    <td><code>autoLoadModels</code></td>
    <td>如果为 <code>true</code>，模型将自动加载（默认值：<code>false</code>）</td>
  </tr>
  <tr>
    <td><code>autoCloseConnection</code></td>
    <td>如果为 <code>true</code>，应用程序关闭时连接将被关闭（默认值：<code>true</code>）</td>
  </tr>
  <tr>
    <td><code>synchronize</code></td>
    <td>如果为 <code>true</code>，将同步自动加载的模型（默认值：<code>true</code>）</td>
  </tr>
</table>

完成此操作后，`Sequelize` 对象将可用于整个项目注入（无需导入任何 模块），例如：

```typescript title="app.service.ts"
import { Injectable } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';

@Injectable()
export class AppService {
  constructor(private sequelize: Sequelize) {}
}

```

#### 模型

Sequelize 实现了 Active Record 模式。使用此模式，您直接使用模型类与数据库交互。为了继续示例，我们需要至少一个模型。让我们定义 `User` 模型。

```typescript title="user.model.ts"
import { Column, Model, Table } from 'sequelize-typescript';

@Table
export class User extends Model {
  @Column
  firstName: string;

  @Column
  lastName: string;

  @Column({ defaultValue: true })
  isActive: boolean;
}

```

> info **提示** 了解有关可用装饰器 [here](https://github.com/RobinBuschmann/sequelize-typescript#column) 的更多信息。

`User` 模型文件位于 `users` 目录中。此目录包含所有与 `UsersModule` 相关的文件。但是，您可以决定将模型文件保存在哪里，我们建议将其创建在其**领域**附近，在相应的 模块 目录中。

要开始使用 `User` 模型，我们需要通过将其插入到 模块 `forRoot()` 方法选项中的 `models` 数组中来告知 Sequelize：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { User } from './users/user.model.js';

@Module({
  imports: [
    SequelizeModule.forRoot({
      dialect: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: 'root',
      database: 'test',
      models: [User],
    }),
  ],
})
export class AppModule {}

```

接下来，让我们看看 `UsersModule`：

```typescript title="users.module.ts"
import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { User } from './user.model.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [SequelizeModule.forFeature([User])],
  providers: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}

```

此 模块 使用 `forFeature()` 方法定义当前 作用域中注册了哪些模型。设置好后，我们可以使用 `@InjectModel()` 装饰器将 `UserModel` 注入到 `UsersService` 中：

```typescript title="users.service.ts"
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { User } from './user.model.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User)
    private userModel: typeof User,
  ) {}

  async findAll(): Promise<User[]> {
    return this.userModel.findAll();
  }

  findOne(id: string): Promise<User> {
    return this.userModel.findOne({
      where: {
        id,
      },
    });
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await user.destroy();
  }
}

```

> warning **注意** 别忘了将 `UsersModule` 导入到根 `AppModule` 中。

如果您想在导入 `SequelizeModule.forFeature` 的 模块之外使用该模型，则需要重新导出由其生成的提供者。
您可以通过导出整个 模块 来实现，如下所示：

```typescript title="users.module.ts"
import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { User } from './user.entity.js';

@Module({
  imports: [SequelizeModule.forFeature([User])],
  exports: [SequelizeModule]
})
export class UsersModule {}

```

现在，如果我们在 `UserHttpModule` 中导入 `UsersModule`，我们可以在后者 模块 的提供者中使用 `@InjectModel(User)`。

```typescript title="users-http.module.ts"
import { Module } from '@nestjs/common';
import { UsersModule } from './users.module.js';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';

@Module({
  imports: [UsersModule],
  providers: [UsersService],
  controllers: [UsersController]
})
export class UserHttpModule {}

```

#### 关系

关系是在两个或多个表之间建立的关联。关系基于每个表中的公共字段，通常涉及主键和外键。

有三种关系类型：

<table>
  <tr>
    <td><code>一对一</code></td>
    <td>主表中每一行在外表中都有且仅有一个关联行</td>
  </tr>
  <tr>
    <td><code>一对多/多对一</code></td>
    <td>主表中每一行在外表中有一个或多个相关行</td>
  </tr>
  <tr>
    <td><code>多对多</code></td>
    <td>主表中每一行在外表中有多行相关行，且外表中的每一记录在主表中都有多行相关行</td>
  </tr>
</table>

在模型中定义关系时，请使用相应的**装饰器**。例如，要定义每个 `User` 可以有多个照片，请使用 `@HasMany()` 装饰器。

```typescript title="user.model.ts"
import { Column, Model, Table, HasMany } from 'sequelize-typescript';
import { Photo } from '../photos/photo.model.js';

@Table
export class User extends Model {
  @Column
  firstName: string;

  @Column
  lastName: string;

  @Column({ defaultValue: true })
  isActive: boolean;

  @HasMany(() => Photo)
  photos: Photo[];
}

```

> info **提示** 要了解有关 Sequelize 中关联的更多信息，请阅读 [this](https://github.com/RobinBuschmann/sequelize-typescript#model-association) 章。

#### 自动加载模型

手动将模型添加到连接选项的 `models` 数组可能会很繁琐。此外，从根 模块 引用模型会破坏应用程序的领域边界，并将实现细节泄露到应用程序的其他部分。为解决此问题，请将配置对象（传递给 `forRoot()` 方法）的 `autoLoadModels` 和 `synchronize` 属性都设置为 `true`，如下所示：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';

@Module({
  imports: [
    SequelizeModule.forRoot({
      ...
      autoLoadModels: true,
      synchronize: true,
    }),
  ],
})
export class AppModule {}

```

指定了该选项后，通过 `forFeature()` 方法注册的每个模型都将自动添加到配置对象的 `models` 数组中。

> warning **警告** 请注意，未通过 `forFeature()` 方法注册，但仅通过模型（通过关联）引用的模型将不被包含。

#### Sequelize 事务

数据库事务象征着在数据库管理系统内针对数据库执行的工作单元，并被作为一个连贯和可靠的单元对待，独立于其他事务。一个事务通常代表数据库中的任何变更（[learn more](https://en.wikipedia.org/wiki/Database_transaction)）。

有许多不同的策略来处理 [Sequelize transactions](https://sequelize.org/docs/v6/other-topics/transactions/)。下面是一个受管事务（自动回调）的示例实现。

首先，我们以常规方式将 `Sequelize` 对象注入到类中：

```typescript
@Injectable()
export class UsersService {
  constructor(private sequelize: Sequelize) {}
}

```

> info **提示** `Sequelize` 类是从 `sequelize-typescript` 包导入的。

现在，我们可以使用此对象来创建事务。

```typescript
async createMany() {
  try {
    await this.sequelize.transaction(async t => {
      const transactionHost = { transaction: t };

      await this.userModel.create(
          { firstName: 'Abraham', lastName: 'Lincoln' },
          transactionHost,
      );
      await this.userModel.create(
          { firstName: 'John', lastName: 'Boothe' },
          transactionHost,
      );
    });
  } catch (err) {
    // Transaction has been rolled back
    // err is whatever rejected the promise chain returned to the transaction callback
  }
}

```

> info **提示** 请注意，`Sequelize` 实例仅用于启动事务。但是，要测试此类需要模拟整个 `Sequelize` 对象（该对象暴露了多个方法）。因此，我们建议使用一个辅助工厂类（例如 `TransactionRunner`），并定义一个具有有限方法的接口，以维护事务。此技术使模拟这些方法变得非常简单。

#### 迁移

[Migrations](https://sequelize.org/docs/v6/other-topics/migrations/) 提供了一种增量更新数据库模式的方法，使其与应用程序的数据模型保持同步，同时保留数据库中现有数据。要生成、运行和回滚迁移，Sequelize 提供了一个专用的 [CLI](https://sequelize.org/docs/v6/other-topics/migrations/#installing-the-cli)。

迁移类与 Nest 应用程序的源代码是分离的。它们的生命周期由 Sequelize CLI 维护。因此，您无法在迁移中使用依赖注入和其他 Nest 特定功能。要了解有关迁移的更多信息，请遵循 [Sequelize documentation](https://sequelize.org/docs/v6/other-topics/migrations/#installing-the-cli) 中的指南。

<app-banner-courses></app-banner-courses>

#### 多个数据库

某些项目需要多个数据库连接。使用此模块也可以实现这一点。要处理多个连接，首先创建连接。在这种情况下，连接命名变得**强制**。

假设您有一个存储在自己数据库中的 `Album` 实体。

```typescript
const defaultOptions = {
  dialect: 'postgres',
  port: 5432,
  username: 'user',
  password: 'password',
  database: 'db',
  synchronize: true,
};

@Module({
  imports: [
    SequelizeModule.forRoot({
      ...defaultOptions,
      host: 'user_db_host',
      models: [User],
    }),
    SequelizeModule.forRoot({
      ...defaultOptions,
      name: 'albumsConnection',
      host: 'album_db_host',
      models: [Album],
    }),
  ],
})
export class AppModule {}

```

> warning **注意** 如果您未为连接设置 `name`，则其名称设置为 `default`。请注意，不应该有多个没有名称或名称相同的连接，否则它们将被覆盖。

此时，您已注册了具有自己连接的 `User` 和 `Album` 模型。在此设置下，您必须告诉 `SequelizeModule.forFeature()` 方法和 `@InjectModel()` 装饰器应该使用哪个连接。如果您不传递任何连接名称，则使用 `default` 连接。

```typescript
@Module({
  imports: [
    SequelizeModule.forFeature([User]),
    SequelizeModule.forFeature([Album], 'albumsConnection'),
  ],
})
export class AppModule {}

```

您也可以为给定连接注入 `Sequelize` 实例：

```typescript
@Injectable()
export class AlbumsService {
  constructor(
    @InjectConnection('albumsConnection')
    private sequelize: Sequelize,
  ) {}
}

```

还可以将任何 `Sequelize` 实例注入到提供者中：

```typescript
@Module({
  providers: [
    {
      provide: AlbumsService,
      useFactory: (albumsSequelize: Sequelize) => {
        return new AlbumsService(albumsSequelize);
      },
      inject: [getConnectionToken('albumsConnection')],
    },
  ],
})
export class AlbumsModule {}

```

#### 测试

在对应用程序进行单元测试时，我们通常希望避免建立数据库连接，使测试套件保持独立，并使执行过程尽可能快。但我们的类可能依赖于从连接实例中拉取的模型。我们如何处理这个问题？解决方案是创建模拟模型。为了实现这一点，我们设置了 [custom providers](/fundamentals/dependency-injection)。每个注册的模型都自动由一个 `<ModelName>Model` 令牌表示，其中 `ModelName` 是您的模型类的名称。

`@nestjs/sequelize` 包暴露了 `getModelToken()` 函数，该函数根据给定的模型返回一个准备好的令牌。

```typescript
@Module({
  providers: [
    UsersService,
    {
      provide: getModelToken(User),
      useValue: mockModel,
    },
  ],
})
export class UsersModule {}

```

现在，一个替代的 `mockModel` 将用作 `UserModel`。每当任何类使用 `@InjectModel()` 装饰器请求 `UserModel` 时，Nest 将使用已注册的 `mockModel` 对象。

#### 异步配置

您可能希望异步而不是静态地传递您的 `SequelizeModule` 选项。在这种情况下，请使用 `forRootAsync()` 方法，它提供了几种处理异步配置的方法。

一种方法是使用工厂函数：

```typescript
SequelizeModule.forRootAsync({
  useFactory: () => ({
    dialect: 'mysql',
    host: 'localhost',
    port: 3306,
    username: 'root',
    password: 'root',
    database: 'test',
    models: [],
  }),
});

```

我们的工厂表现得像任何其他 [asynchronous provider](/fundamentals/async-components)（例如，它可以是 `async` 并且能够通过 `inject` 注入依赖项）。

```typescript
SequelizeModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (configService: ConfigService) => ({
    dialect: 'mysql',
    host: configService.get('HOST'),
    port: +configService.get('PORT'),
    username: configService.get('USERNAME'),
    password: configService.get('PASSWORD'),
    database: configService.get('DATABASE'),
    models: [],
  }),
  inject: [ConfigService],
});

```

或者，您可以使用 `useClass` 语法：

```typescript
SequelizeModule.forRootAsync({
  useClass: SequelizeConfigService,
});

```

上述构造将在 `SequelizeModule` 内部实例化 `SequelizeConfigService`，并使用它通过调用 `createSequelizeOptions()` 来提供一个选项对象。请注意，这意味着 `SequelizeConfigService` 必须实现 `SequelizeOptionsFactory` 接口，如下所示：

```typescript
@Injectable()
class SequelizeConfigService implements SequelizeOptionsFactory {
  createSequelizeOptions(): SequelizeModuleOptions {
    return {
      dialect: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: 'root',
      database: 'test',
      models: [],
    };
  }
}

```

为了防止在 `SequelizeModule` 内部创建 `SequelizeConfigService` 并使用从不同模块导入的提供者，您可以使用 `useExisting` 语法。

```typescript
SequelizeModule.forRootAsync({
  imports: [ConfigModule],
  useExisting: ConfigService,
});

```

此构造与 `useClass` 相同，但有一个关键区别——`SequelizeModule` 将查找导入的模块以重用现有的 `ConfigService`，而不是实例化一个新的。

#### 可观测性

[NestJS Observe](https://www.observe.nestjs.com/?ref=docs-sequelize 'NestJS Observe')，我们的官方可观测性平台，在没有任何配置的情况下记录 Sequelize 查询。在 PostgreSQL 和 MySQL 上，SDK 会在底层仪器驱动程序（`pg` 或 `mysql2`），因此每条语句都是在运行它的提供者方法下的一个跨度，其中值被移除，慢速请求会显示它正在等待哪个查询。MariaDB、SQLite 和 SQL Server 方言运行在尚未被仪器化的驱动程序上（`mariadb`、`sqlite3` 和 `tedious`）。请参阅 [Database queries and outbound HTTP](/observability/sdk#database-queries-and-outbound-http)。

<figure><img src="https://www.observe.nestjs.com/docs/telemetry/sql.webp" alt="A query opened in the waterfall" /></figure>

#### 示例

一个可工作的示例可在 [here](https://github.com/nestjs/nest/tree/master/sample/07-sequelize) 找到。