<!-- 此文件从 content/data/sequelize.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T07:46:00.700Z -->
<!-- 源文件: content/data/sequelize.md -->
<!-- 源哈希: e649efa748b6ef3a07aac6b57983530e -->

### Sequelize

`@nestjs/sequelize` 包将 [Sequelize](https://sequelize.org/) ORM 与 Nest 集成。它还使用了 [sequelize-typescript](https://github.com/RobinBuschmann/sequelize-typescript) 包，该包提供了用于以声明方式定义模型的装饰器。

要开始使用它，我们首先安装所需的依赖项。在本章中，我们将演示使用流行的 [MySQL](https://www.mysql.com/) 关系型数据库管理系统，但 Sequelize 支持许多关系型数据库，例如 PostgreSQL、MySQL、Microsoft SQL Server、SQLite 和 MariaDB。我们在本章中介绍的过程对于 Sequelize 支持的任何数据库都是相同的。你只需为所选数据库安装相关的客户端 API 库即可。

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

`forRoot()` 方法支持 Sequelize 构造函数（[read more](https://sequelize.org/docs/v6/getting-started/#connecting-to-a-database)）公开的所有配置属性。此外，还有几个额外的配置属性，如下所述。

<table>
  <tr>
    <td><code>retryAttempts</code></td>
    <td>连接数据库的尝试次数（默认值：<code>10</code>）</td>
  </tr>
  <tr>
    <td><code>retryDelay</code></td>
    <td>连接重试尝试之间的延迟（毫秒）（默认值：<code>3000</code>）</td>
  </tr>
  <tr>
    <td><code>autoLoadModels</code></td>
    <td>如果为 <code>true</code>，模型将被自动加载（默认值：<code>false</code>）</td>
  </tr>
  <tr>
    <td><code>keepConnectionAlive</code></td>
    <td>如果为 <code>true</code>，连接在应用程序关闭时不会被关闭（默认值：<code>false</code>）</td>
  </tr>
  <tr>
    <td><code>synchronize</code></td>
    <td>如果为 <code>true</code>，自动加载的模型将被同步（默认值：<code>true</code>）</td>
  </tr>
</table>

完成此操作后，`Sequelize` 对象将可以在整个项目中注入（无需导入任何模块），例如：

```typescript title="app.service.ts"
import { Injectable } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';

@Injectable()
export class AppService {
  constructor(private sequelize: Sequelize) {}
}

```

#### 模型

Sequelize 实现了 Active Record 模式。使用此模式，你可以直接使用模型类与数据库交互。为了继续这个示例，我们至少需要一个模型。让我们定义 `User` 模型。

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

> info **提示** 在 [here](https://github.com/RobinBuschmann/sequelize-typescript#column) 中了解更多关于可用装饰器的信息。

`User` 模型文件位于 `users` 目录中。此目录包含与 `UsersModule` 相关的所有文件。你可以决定将模型文件保存在何处，但我们建议将它们创建在其 **领域** 附近，即相应的模块目录中。

要开始使用 `User` 模型，我们需要通过将其插入到模块 `forRoot()` 方法选项中的 `models` 数组来让 Sequelize 知道它：

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

此模块使用 `forFeature()` 方法定义在当前作用域中注册哪些模型。完成这些后，我们可以使用 `@InjectModel()` 装饰器将 `UserModel` 注入到 `UsersService` 中：

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

> warning **注意** 不要忘记将 `UsersModule` 导入到根 `AppModule` 中。

如果你想在导入 `SequelizeModule.forFeature` 的模块之外使用该模型，你需要重新导出由它生成的提供者。
你可以通过导出整个模块来实现这一点，如下所示：

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

现在，如果我们在 `UserHttpModule` 中导入 `UsersModule`，我们就可以在后者模块的提供者中使用 `@InjectModel(User)`。

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

关系是在两个或多个表之间建立的关联。关系基于每个表的公共字段，通常涉及主键和外键。

关系有三种类型：

<table>
  <tr>
    <td><code>一对一</code></td>
    <td>主表中的每一行在外表中都有一个且仅有一个关联行</td>
  </tr>
  <tr>
    <td><code>一对多 / 多对一</code></td>
    <td>主表中的每一行在外表中都有一个或多个相关行</td>
  </tr>
  <tr>
    <td><code>多对多</code></td>
    <td>主表中的每一行在外表中都有许多相关行，而外表中的每条记录在主表中也有许多相关行</td>
  </tr>
</table>

要在模型中定义关系，请使用相应的 **装饰器**。例如，要定义每个 `User` 可以有多个照片，请使用 `@HasMany()` 装饰器。

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

> info **提示** 要了解有关 Sequelize 中关联的更多信息，请阅读 [this](https://github.com/RobinBuschmann/sequelize-typescript#model-association) 章节。

#### 自动加载模型

手动将模型添加到连接选项的 `models` 数组可能会很繁琐。此外，从根模块引用模型会破坏应用程序的领域边界，并导致实现细节泄漏到应用程序的其他部分。要解决此问题，请通过将配置对象（传递给 `forRoot()` 方法）的 `autoLoadModels` 和 `synchronize` 属性都设置为 `true` 来自动加载模型，如下所示：

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

指定该选项后，通过 `forFeature()` 方法注册的每个模型都将自动添加到配置对象的 `models` 数组中。

> warning **警告** 请注意，未通过 `forFeature()` 方法注册，而仅从模型（通过关联）引用的模型将不会被包含在内。

#### Sequelize 事务

数据库事务象征着在数据库管理系统内针对数据库执行的一个工作单元，并以一种连贯且可靠的方式处理，独立于其他事务。事务通常表示数据库中的任何变更（[learn more](https://en.wikipedia.org/wiki/Database_transaction)）。

处理 [Sequelize transactions](https://sequelize.org/docs/v6/other-topics/transactions/) 有许多不同的策略。下面是一个托管事务（自动回调）的示例实现。

首先，我们需要以常规方式将 `Sequelize` 对象注入到类中：

```typescript
@Injectable()
export class UsersService {
  constructor(private sequelize: Sequelize) {}
}

```

> info **提示** `Sequelize` 类是从 `sequelize-typescript` 包中导入的。

现在，我们可以使用这个对象来创建事务。

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

> info **提示** 请注意，`Sequelize` 实例仅用于启动事务。然而，要测试这个类，就需要模拟整个 `Sequelize` 对象（它暴露了多个方法）。因此，我们建议使用一个辅助工厂类（例如 `TransactionRunner`），并定义一个接口，其中包含维护事务所需的有限方法集合。这种技巧使得模拟这些方法变得非常简单。

#### 迁移

[Migrations](https://sequelize.org/docs/v6/other-topics/migrations/) 提供了一种增量更新数据库模式的方式，使其与应用程序的数据模型保持同步，同时保留数据库中的现有数据。为了生成、运行和回滚迁移，Sequelize 提供了一个专用的 [CLI](https://sequelize.org/docs/v6/other-topics/migrations/#installing-the-cli)。

迁移类与 Nest 应用程序源代码是分离的。它们的生命周期由 Sequelize CLI 维护。因此，你无法在迁移中利用依赖注入和其他 Nest 特有的功能。要了解有关迁移的更多信息，请遵循 [Sequelize documentation](https://sequelize.org/docs/v6/other-topics/migrations/#installing-the-cli) 中的指南。

<app-banner-courses></app-banner-courses>

#### 多个数据库

有些项目需要多个数据库连接。这也可以通过本模块实现。要使用多个连接，首先创建这些连接。在这种情况下，连接命名就变得**强制**了。

假设你有一个 `Album` 实体存储在其自己的数据库中。

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

> warning **注意** 如果你没有为连接设置 `name`，其名称将被设置为 `default`。请注意，你不应该拥有多个没有名称的连接，或者具有相同名称的连接，否则它们将被覆盖。

此时，你已经注册了 `User` 和 `Album` 模型，它们各自拥有自己的连接。在这种设置下，你必须告诉 `SequelizeModule.forFeature()` 方法和 `@InjectModel()` 装饰器应该使用哪个连接。如果你不传递任何连接名称，则使用 `default` 连接。

```typescript
@Module({
  imports: [
    SequelizeModule.forFeature([User]),
    SequelizeModule.forFeature([Album], 'albumsConnection'),
  ],
})
export class AppModule {}

```

你也可以为给定的连接注入 `Sequelize` 实例：

```typescript
@Injectable()
export class AlbumsService {
  constructor(
    @InjectConnection('albumsConnection')
    private sequelize: Sequelize,
  ) {}
}

```

也可以将任何 `Sequelize` 实例注入到提供者中：

```typescript
@Module({
  providers: [
    {
      provide: AlbumsService,
      useFactory: (albumsSequelize: Sequelize) => {
        return new AlbumsService(albumsSequelize);
      },
      inject: [getDataSourceToken('albumsConnection')],
    },
  ],
})
export class AlbumsModule {}

```

#### 测试

在对应用程序进行单元测试时，我们通常希望避免建立数据库连接，以保持测试套件的独立性，并使其执行过程尽可能快。但我们的类可能依赖于从连接实例中拉取的模型。我们该如何处理呢？解决方案是创建模拟模型。为了实现这一点，我们设置 [custom providers](/fundamentals/dependency-injection)。每个注册的模型都会自动由一个 `<ModelName>Model` 令牌表示，其中 `ModelName` 是你的模型类的名称。

`@nestjs/sequelize` 包暴露了 `getModelToken()` 函数，它基于给定的模型返回一个准备好的令牌。

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

现在，一个替代的 `mockModel` 将被用作 `UserModel`。每当任何类通过 `@InjectModel()` 装饰器请求 `UserModel` 时，Nest 将使用已注册的 `mockModel` 对象。

#### 异步配置

你可能希望异步地传递 `SequelizeModule` 选项，而不是静态地传递。在这种情况下，请使用 `forRootAsync()` 方法，它提供了多种处理异步配置的方式。

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

我们的工厂的行为与任何其他 [asynchronous provider](/fundamentals/async-components) 一样（例如，它可以是 `async`，并且能够通过 `inject` 注入依赖）。

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

或者，你可以使用 `useClass` 语法：

```typescript
SequelizeModule.forRootAsync({
  useClass: SequelizeConfigService,
});

```

上面的构造将在 `SequelizeModule` 内部实例化 `SequelizeConfigService`，并通过调用 `createSequelizeOptions()` 来使用它提供一个选项对象。请注意，这意味着 `SequelizeConfigService` 必须实现 `SequelizeOptionsFactory` 接口，如下所示：

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

为了防止在 `SequelizeModule` 内部创建 `SequelizeConfigService`，并使用从不同模块导入的提供者，你可以使用 `useExisting` 语法。

```typescript
SequelizeModule.forRootAsync({
  imports: [ConfigModule],
  useExisting: ConfigService,
});

```

这个构造与 `useClass` 的工作方式相同，但有一个关键区别——`SequelizeModule` 将查找已导入的模块，以重用现有的 `ConfigService`，而不是实例化一个新的。

#### 示例

一个可运行的示例可在 [here](https://github.com/nestjs/nest/tree/master/sample/07-sequelize) 中找到。