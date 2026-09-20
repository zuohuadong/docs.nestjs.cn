<!-- 此文件从 content/techniques/sql.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T08:51:41.861Z -->
<!-- 源文件: content/techniques/sql.md -->
<!-- 源哈希: 45de9c47b883ad9c00234d5ca7b08f28 -->

### 数据库

Nest 与数据库无关，使您可以轻松地与任何 SQL 或 NoSQL 数据库集成。根据您的偏好，您有多种选择。在最一般的层面上，将 Nest 连接到数据库只需为数据库加载适当的 Node.js 驱动程序，就像您使用 [Express](https://expressjs.com/en/guide/database-integration.html) 或 Fastify 时一样。

您也可以直接使用任何通用的 Node.js 数据库集成**库**或 ORM，例如 [MikroORM](https://mikro-orm.io/)（参见 [MikroORM recipe](/recipes/mikroorm)）、[Sequelize](https://sequelize.org/)（参见 [Sequelize integration](/techniques/sql#sequelize-集成)）、[Knex.js](https://knexjs.org/)（参见 [Knex.js tutorial](https://dev.to/nestjs/build-a-nestjs-module-for-knex-js-or-other-resource-based-libraries-in-5-minutes-12an)）、[TypeORM](https://github.com/typeorm/typeorm) 和 [Prisma](https://www.github.com/prisma/prisma)（参见 [Prisma recipe](/recipes/prisma)），以在更高的抽象级别上操作。

为方便起见，Nest 通过 `@nestjs/typeorm` 和 `@nestjs/sequelize` 包分别提供了与 TypeORM 和 Sequelize 的开箱即用的紧密集成，我们将在本章中介绍这些内容，以及通过 `@nestjs/mongoose` 与 Mongoose 的集成，这将在 [this chapter](/techniques/mongodb) 中介绍。这些集成提供了额外的 NestJS 特定功能，例如模型/仓储注入、可测试性和异步配置，使访问您选择的数据库更加容易。

### TypeORM 集成

为了与 SQL 和 NoSQL 数据库集成，Nest 提供了 `@nestjs/typeorm` 包。[TypeORM](https://github.com/typeorm/typeorm) 是可用于 TypeScript 的最成熟的对象关系映射器（ORM）。由于它是用 TypeScript 编写的，因此可以与 Nest 框架很好地集成。

要开始使用它，我们首先安装所需的依赖项。在本章中，我们将演示使用流行的 [MySQL](https://www.mysql.com/) 关系型数据库管理系统，但 TypeORM 支持许多关系型数据库，例如 PostgreSQL、Oracle、Microsoft SQL Server、SQLite，甚至像 MongoDB 这样的 NoSQL 数据库。我们在本章中介绍的步骤对于 TypeORM 支持的任何数据库都是相同的。您只需要为您选择的数据库安装相关的客户端 API 库。

```bash
$ npm install --save @nestjs/typeorm typeorm mysql2

```

安装过程完成后，我们可以将 `TypeOrmModule` 导入到根 `AppModule` 中。

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: 'root',
      database: 'test',
      entities: [],
      synchronize: true,
    }),
  ],
})
export class AppModule {}

```

> warning **警告** 设置 `synchronize: true` 不应在生产环境中使用 - 否则您可能会丢失生产数据。

`forRoot()` 方法支持 [TypeORM](https://typeorm.io/data-source-options#common-data-source-options) 包中 `DataSource` 构造函数暴露的所有配置属性。此外，还有几个额外的配置属性，如下所述。

<table>
  <tr>
    <td><code>retryAttempts</code></td>
    <td>连接数据库的尝试次数（默认：<code>10</code>）</td>
  </tr>
  <tr>
    <td><code>retryDelay</code></td>
    <td>连接重试之间的延迟（毫秒）（默认：<code>3000</code>）</td>
  </tr>
  <tr>
    <td><code>autoLoadEntities</code></td>
    <td>如果为 <code>true</code>，实体将被自动加载（默认：<code>false</code>）</td>
  </tr>
</table>

> info **提示** 了解更多关于数据源选项的信息，请参阅 [here](https://typeorm.io/data-source-options)。

完成此操作后，TypeORM 的 `DataSource` 和 `EntityManager` 对象将可在整个项目中注入（无需导入任何模块），例如：

```typescript title="app.module.ts"
import { DataSource } from 'typeorm';

@Module({
  imports: [TypeOrmModule.forRoot(), UsersModule],
})
export class AppModule {
  constructor(private dataSource: DataSource) {}
}

```

#### 仓储模式

[TypeORM](https://github.com/typeorm/typeorm) 支持**仓储设计模式**，因此每个实体都有自己的仓储。这些仓储可以从数据库数据源中获取。

为了继续示例，我们至少需要一个实体。让我们定义 `User` 实体。

```typescript title="user.entity.ts"
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ default: true })
  isActive: boolean;
}

```

> info **提示** 在 [TypeORM documentation](https://typeorm.io/docs/entity/entities/) 中了解更多关于实体的信息。

`User` 实体文件位于 `users` 目录中。此目录包含与 `UsersModule` 相关的所有文件。您可以决定将模型文件放在哪里，但是，我们建议将它们放在其**领域**附近，即相应的模块目录中。

要开始使用 `User` 实体，我们需要通过将其插入到模块 `forRoot()` 方法选项中的 `entities` 数组中来让 TypeORM 知道它（除非您使用静态 glob 路径）：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './users/user.entity.js';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: 'root',
      database: 'test',
      entities: [User],
      synchronize: true,
    }),
  ],
})
export class AppModule {}

```

接下来，让我们看一下 `UsersModule`：

```typescript title="users.module.ts"
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { User } from './user.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}

```

此模块使用 `forFeature()` 方法来定义在当前作用域中注册了哪些仓储。完成此操作后，我们可以使用 `@InjectRepository()` 装饰器将 `UsersRepository` 注入到 `UsersService` 中：

```typescript title="users.service.ts"
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  findAll(): Promise<User[]> {
    return this.usersRepository.find();
  }

  findOne(id: number): Promise<User | null> {
    return this.usersRepository.findOneBy({ id });
  }

  async remove(id: number): Promise<void> {
    await this.usersRepository.delete(id);
  }
}

```

> warning **注意** 不要忘记将 `UsersModule` 导入到根 `AppModule` 中。

如果您想在导入 `TypeOrmModule.forFeature` 的模块之外使用仓储，您需要重新导出它生成的提供者。
您可以通过导出整个模块来实现这一点，如下所示：

```typescript title="users.module.ts"
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  exports: [TypeOrmModule]
})
export class UsersModule {}

```

现在，如果我们在 `UserHttpModule` 中导入 `UsersModule`，我们就可以在后者的提供者中使用 `@InjectRepository(User)`。

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

关系是两个或多个表之间建立的关联。关系基于每个表中的公共字段，通常涉及主键和外键。

有三种类型的关系：

<table>
  <tr>
    <td><code>一对一</code></td>
    <td>主表中的每一行在外表中都有一行且仅有一行关联行。使用 <code>@OneToOne()</code> 装饰器来定义这种类型的关系。</td>
  </tr>
  <tr>
    <td><code>一对多 / 多对一</code></td>
    <td>主表中的每一行在外表中都有一个或多个关联行。使用 <code>@OneToMany()</code> 和 <code>@ManyToOne()</code> 装饰器来定义这种类型的关系。</td>
  </tr>
  <tr>
    <td><code>多对多</code></td>
    <td>主表中的每一行在外表中都有许多关联行，并且外表中的每条记录在主表中都有许多关联行。使用 <code>@ManyToMany()</code> 装饰器来定义这种类型的关系。</td>
  </tr>
</table>

要在实体中定义关系，请使用相应的**装饰器**。例如，要定义每个 `User` 可以有多个照片，请使用 `@OneToMany()` 装饰器。

```typescript title="user.entity.ts"
import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { Photo } from '../photos/photo.entity.js';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(type => Photo, photo => photo.user)
  photos: Photo[];
}

```

> info **提示** 要了解有关 TypeORM 中关系的更多信息，请访问 [TypeORM documentation](https://typeorm.io/docs/relations/relations)。

#### 自动加载实体

手动将实体添加到数据源选项的 `entities` 数组中可能很繁琐。此外，从根模块引用实体会破坏应用领域边界，并导致实现细节泄露到应用的其他部分。为了解决这个问题，提供了另一种解决方案。要自动加载实体，请将配置对象（传递给 `forRoot()` 方法）的 `autoLoadEntities` 属性设置为 `true`，如下所示：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      ...
      autoLoadEntities: true,
    }),
  ],
})
export class AppModule {}

```

指定该选项后，通过 `forFeature()` 方法注册的每个实体将自动添加到配置对象的 `entities` 数组中。

> warning **警告** 请注意，未通过 `forFeature()` 方法注册，但仅通过关系从实体引用的实体，不会通过 `autoLoadEntities` 设置被包含。

#### 分离实体定义

您可以使用装饰器直接在模型中定义实体及其列。但有些人更倾向于使用 ["entity schemas"](https://typeorm.io/docs/entity/separating-entity-definition) 在单独的文件中定义实体及其列。

```typescript
import { EntitySchema } from 'typeorm';
import { User } from './user.entity.js';

export const UserSchema = new EntitySchema<User>({
  name: 'User',
  target: User,
  columns: {
    id: {
      type: Number,
      primary: true,
      generated: true,
    },
    firstName: {
      type: String,
    },
    lastName: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  relations: {
    photos: {
      type: 'one-to-many',
      target: 'Photo', // the name of the PhotoSchema
    },
  },
});

```

> warning error **警告** 如果提供 `target` 选项，则 `name` 选项值必须与目标类的名称相同。
> 如果不提供 `target`，则可以使用任何名称。

Nest 允许您在需要 `Entity` 的地方使用 `EntitySchema` 实例，例如：

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSchema } from './user.schema.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([UserSchema])],
  providers: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}

```

#### TypeORM 事务

数据库事务表示在数据库管理系统中对数据库执行的工作单元，并以一致且可靠的方式处理，独立于其他事务。事务通常表示数据库中的任何更改（[learn more](https://en.wikipedia.org/wiki/Database_transaction)）。

有许多不同的策略来处理 [TypeORM transactions](https://typeorm.io/docs/advanced-topics/transactions/)。我们建议使用 `QueryRunner` 类，因为它可以完全控制事务。

首先，我们需要以常规方式将 `DataSource` 对象注入到类中：

```typescript
@Injectable()
export class UsersService {
  constructor(private dataSource: DataSource) {}
}

```

> info **提示** `DataSource` 类从 `typeorm` 包导入。

现在，我们可以使用此对象创建事务。

```typescript
async createMany(users: User[]) {
  const queryRunner = this.dataSource.createQueryRunner();

  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await queryRunner.manager.save(users[0]);
    await queryRunner.manager.save(users[1]);

    await queryRunner.commitTransaction();
  } catch (err) {
    // since we have errors lets rollback the changes we made
    await queryRunner.rollbackTransaction();
  } finally {
    // you need to release a queryRunner which was manually instantiated
    await queryRunner.release();
  }
}

```

> info **提示** 请注意，`dataSource` 仅用于创建 `QueryRunner`。但是，要测试此类，需要模拟整个 `DataSource` 对象（它暴露了多个方法）。因此，我们建议使用辅助工厂类（例如 `QueryRunnerFactory`），并定义具有维护事务所需的一组有限方法的接口。这种技术使模拟这些方法变得非常简单。

<app-banner-devtools></app-banner-devtools>

或者，您可以使用 `DataSource` 对象的 `transaction` 方法的回调风格方式（[read more](https://typeorm.io/docs/advanced-topics/transactions/#creating-and-using-transactions)）。

```typescript
async createMany(users: User[]) {
  await this.dataSource.transaction(async manager => {
    await manager.save(users[0]);
    await manager.save(users[1]);
  });
}

```

#### 订阅者

使用 TypeORM [subscribers](https://typeorm.io/docs/advanced-topics/listeners-and-subscribers#what-is-a-subscriber)，您可以监听特定的实体事件。

```typescript
import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
} from 'typeorm';
import { User } from './user.entity.js';

@EventSubscriber()
export class UserSubscriber implements EntitySubscriberInterface<User> {
  constructor(dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  listenTo() {
    return User;
  }

  beforeInsert(event: InsertEvent<User>) {
    console.log(`BEFORE USER INSERTED: `, event.entity);
  }
}

```

> error **警告** 事件订阅者不能是 [request-scoped](/fundamentals/provider-scopes)。

现在，将 `UserSubscriber` 类添加到 `providers` 数组中：

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { UserSubscriber } from './user.subscriber.js';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService, UserSubscriber],
  controllers: [UsersController],
})
export class UsersModule {}

```

#### 迁移

[Migrations](https://typeorm.io/docs/advanced-topics/migrations/) 提供了一种增量更新数据库模式的方法，使其与应用的数据模型保持同步，同时保留数据库中的现有数据。为了生成、运行和回滚迁移，TypeORM 提供了专用的 [CLI](https://typeorm.io/docs/advanced-topics/migrations/#creating-a-new-migration)。

迁移类与 Nest 应用源代码是分离的。它们的生命周期由 TypeORM CLI 维护。因此，您无法在迁移中利用依赖注入和其他 Nest 特定功能。要了解有关迁移的更多信息，请遵循 [TypeORM documentation](https://typeorm.io/docs/advanced-topics/migrations/) 中的指南。

#### 多数据库

某些项目需要多个数据库连接。此模块也可以实现这一点。要使用多个连接，首先创建连接。在这种情况下，数据源命名变得**强制**。

假设您有一个存储在自身数据库中的 `Album` 实体。

```typescript
const defaultOptions = {
  type: 'postgres',
  port: 5432,
  username: 'user',
  password: 'password',
  database: 'db',
  synchronize: true,
};

@Module({
  imports: [
    TypeOrmModule.forRoot({
      ...defaultOptions,
      host: 'user_db_host',
      entities: [User],
    }),
    TypeOrmModule.forRoot({
      ...defaultOptions,
      name: 'albumsConnection',
      host: 'album_db_host',
      entities: [Album],
    }),
  ],
})
export class AppModule {}

```

> warning **注意** 如果不为数据源设置 `name`，则其名称设置为 `default`。请注意，您不应有多个未命名或同名的连接，否则它们将被覆盖。

> warning **注意** 如果您使用 `TypeOrmModule.forRootAsync`，则**还**必须在 `useFactory` 之外设置数据源名称。例如：
>
> ```typescript
> TypeOrmModule.forRootAsync({
>   name: 'albumsConnection',
>   useFactory: ...,
>   inject: ...,
> }),
> ```

>
> 有关更多详细信息，请参阅 [this issue](https://github.com/nestjs/typeorm/issues/86)。

此时，您已拥有注册了各自数据源的 `User` 和 `Album` 实体。通过此设置，您必须告知 `TypeOrmModule.forFeature()` 方法和 `@InjectRepository()` 装饰器应使用哪个数据源。如果您不传递任何数据源名称，则使用 `default` 数据源。

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    TypeOrmModule.forFeature([Album], 'albumsConnection'),
  ],
})
export class AppModule {}

```

您还可以为给定的数据源注入 `DataSource` 或 `EntityManager`：

```typescript
@Injectable()
export class AlbumsService {
  constructor(
    @InjectDataSource('albumsConnection')
    private dataSource: DataSource,
    @InjectEntityManager('albumsConnection')
    private entityManager: EntityManager,
  ) {}
}

```

也可以将任何 `DataSource` 注入到提供者中：

```typescript
@Module({
  providers: [
    {
      provide: AlbumsService,
      useFactory: (albumsConnection: DataSource) => {
        return new AlbumsService(albumsConnection);
      },
      inject: [getDataSourceToken('albumsConnection')],
    },
  ],
})
export class AlbumsModule {}

```

#### 测试

在对应用进行单元测试时，我们通常希望避免建立数据库连接，以保持测试套件独立并尽可能快地执行。但是，我们的类可能依赖于从数据源（连接）实例中获取的仓储。我们如何处理这个问题？解决方案是创建模拟仓储。为了实现这一点，我们设置 [custom providers](/fundamentals/dependency-injection)。每个注册的仓储自动由 `<EntityName>Repository` 令牌表示，其中 `EntityName` 是实体类的名称。

`@nestjs/typeorm` 包公开了 `getRepositoryToken()` 函数，该函数根据给定实体返回准备好的令牌。

```typescript
@Module({
  providers: [
    UsersService,
    {
      provide: getRepositoryToken(User),
      useValue: mockRepository,
    },
  ],
})
export class UsersModule {}

```

现在，替代的 `mockRepository` 将用作 `UsersRepository`。每当任何类使用 `@InjectRepository()` 装饰器请求 `UsersRepository` 时，Nest 将使用注册的 `mockRepository` 对象。

#### 异步配置

您可能希望以异步方式而不是静态方式传递仓储模块选项。在这种情况下，请使用 `forRootAsync()` 方法，它提供了几种处理异步配置的方式。

一种方法是使用工厂函数：

```typescript
TypeOrmModule.forRootAsync({
  useFactory: () => ({
    type: 'mysql',
    host: 'localhost',
    port: 3306,
    username: 'root',
    password: 'root',
    database: 'test',
    entities: [],
    synchronize: true,
  }),
});

```

我们的工厂函数与其他任何 [asynchronous provider](/fundamentals/async-components) 一样（例如，它可以是 `async`，并且能够通过 `inject` 注入依赖）。

```typescript
TypeOrmModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (configService: ConfigService) => ({
    type: 'mysql',
    host: configService.get('HOST'),
    port: +configService.get('PORT'),
    username: configService.get('USERNAME'),
    password: configService.get('PASSWORD'),
    database: configService.get('DATABASE'),
    entities: [],
    synchronize: true,
  }),
  inject: [ConfigService],
});

```

或者，您可以使用 `useClass` 语法：

```typescript
TypeOrmModule.forRootAsync({
  useClass: TypeOrmConfigService,
});

```

上述构造将在 `TypeOrmModule` 内部实例化 `TypeOrmConfigService`，并通过调用 `createTypeOrmOptions()` 来提供选项对象。请注意，这意味着 `TypeOrmConfigService` 必须实现 `TypeOrmOptionsFactory` 接口，如下所示：

```typescript
@Injectable()
export class TypeOrmConfigService implements TypeOrmOptionsFactory {
  createTypeOrmOptions(): TypeOrmModuleOptions {
    return {
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: 'root',
      database: 'test',
      entities: [],
      synchronize: true,
    };
  }
}

```

为了防止在 `TypeOrmModule` 内部创建 `TypeOrmConfigService`，并改用从其他模块导入的提供者，您可以使用 `useExisting` 语法。

```typescript
TypeOrmModule.forRootAsync({
  imports: [ConfigModule],
  useExisting: ConfigService,
});

```

此构造与 `useClass` 的工作方式相同，但有一个关键区别——`TypeOrmModule` 将查找导入的模块以重用现有的 `ConfigService`，而不是实例化一个新的。

> info **提示** 确保 `name` 属性与 `useFactory`、`useClass` 或 `useValue` 属性定义在同一层级。这将使 Nest 能够正确地在适当的注入令牌下注册数据源。

#### 自定义数据源工厂

结合使用 `useFactory`、`useClass` 或 `useExisting` 进行异步配置时，您可以选择指定一个 `dataSourceFactory` 函数，该函数允许您提供自己的 TypeORM 数据源，而不是让 `TypeOrmModule` 创建数据源。

`dataSourceFactory` 接收在异步配置期间通过 `useFactory`、`useClass` 或 `useExisting` 配置的 TypeORM `DataSourceOptions`，并返回一个解析为 TypeORM `DataSource` 的 `Promise`。

```typescript
TypeOrmModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  // Use useFactory, useClass, or useExisting
  // to configure the DataSourceOptions.
  useFactory: (configService: ConfigService) => ({
    type: 'mysql',
    host: configService.get('HOST'),
    port: +configService.get('PORT'),
    username: configService.get('USERNAME'),
    password: configService.get('PASSWORD'),
    database: configService.get('DATABASE'),
    entities: [],
    synchronize: true,
  }),
  // dataSource receives the configured DataSourceOptions
  // and returns a Promise<DataSource>.
  dataSourceFactory: async (options) => {
    const dataSource = await new DataSource(options).initialize();
    return dataSource;
  },
});

```

> info **提示** `DataSource` 类从 `typeorm` 包中导入。

#### 示例

[here](https://github.com/nestjs/nest/tree/master/sample/05-sql-typeorm) 提供了一个可用的示例。

<app-banner-enterprise></app-banner-enterprise>

### Sequelize 集成

TypeORM 的替代方案是使用 [Sequelize](https://sequelize.org/) ORM 与 `@nestjs/sequelize` 包。此外，我们利用 [sequelize-typescript](https://github.com/RobinBuschmann/sequelize-typescript) 包，它提供了一组额外的装饰器来声明式地定义实体。

要开始使用它，我们首先安装所需的依赖。在本章中，我们将演示使用流行的 [MySQL](https://www.mysql.com/) 关系型数据库管理系统，但 Sequelize 支持许多关系型数据库，例如 PostgreSQL、MySQL、Microsoft SQL Server、SQLite 和 MariaDB。本章中我们进行的步骤对于 Sequelize 支持的任何数据库都是相同的。您只需为所选数据库安装相应的客户端 API 库。

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

`forRoot()` 方法支持 Sequelize 构造函数（[read more](https://sequelize.org/docs/v6/getting-started/#connecting-to-a-database)）暴露的所有配置属性。此外，还有几个额外的配置属性，如下所述。

<table>
  <tr>
    <td><code>retryAttempts</code></td>
    <td>连接数据库的尝试次数（默认：<code>10</code>）</td>
  </tr>
  <tr>
    <td><code>retryDelay</code></td>
    <td>连接重试之间的延迟（毫秒）（默认：<code>3000</code>）</td>
  </tr>
  <tr>
    <td><code>autoLoadModels</code></td>
    <td>如果为 <code>true</code>，模型将自动加载（默认：<code>false</code>）</td>
  </tr>
  <tr>
    <td><code>keepConnectionAlive</code></td>
    <td>如果为 <code>true</code>，应用程序关闭时连接将不会关闭（默认：<code>false</code>）</td>
  </tr>
  <tr>
    <td><code>synchronize</code></td>
    <td>如果为 <code>true</code>，自动加载的模型将被同步（默认：<code>true</code>）</td>
  </tr>
</table>

完成此操作后，`Sequelize` 对象将可在整个项目中注入（无需导入任何模块），例如：

```typescript title="app.service.ts"
import { Injectable } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';

@Injectable()
export class AppService {
  constructor(private sequelize: Sequelize) {}
}

```

#### 模型

Sequelize 实现了 Active Record 模式。使用此模式，您可以直接使用模型类与数据库交互。为了继续示例，我们至少需要一个模型。让我们定义 `User` 模型。

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

> info **提示** 了解更多可用的装饰器，请参阅 [here](https://github.com/RobinBuschmann/sequelize-typescript#column)。

`User` 模型文件位于 `users` 目录中。此目录包含与 `UsersModule` 相关的所有文件。您可以决定将模型文件放在哪里，但我们建议将它们放在其**领域**附近，即相应的模块目录中。

要开始使用 `User` 模型，我们需要通过将其插入模块 `forRoot()` 方法选项中的 `models` 数组来让 Sequelize 知道它：

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

接下来，让我们看一下 `UsersModule`：

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

此模块使用 `forFeature()` 方法来定义在当前作用域中注册的模型。有了这些，我们可以使用 `@InjectModel()` 装饰器将 `UserModel` 注入到 `UsersService` 中：

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

如果您想在导入 `SequelizeModule.forFeature` 的模块之外使用该模型，您需要重新导出由它生成的提供者。您可以通过导出整个模块来实现，如下所示：

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

现在，如果我们在 `UserHttpModule` 中导入 `UsersModule`，我们就可以在后者的提供者中使用 `@InjectModel(User)`。

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

关系是两个或多个表之间建立的关联。关系基于每个表中的公共字段，通常涉及主键和外键。

关系有三种类型：

<table>
  <tr>
    <td><code>一对一</code></td>
    <td>主表中的每一行在外表中都有一条且仅有一条关联行</td>
  </tr>
  <tr>
    <td><code>一对多 / 多对一</code></td>
    <td>主表中的每一行在外表中都有一行或多行关联行</td>
  </tr>
  <tr>
    <td><code>多对多</code></td>
    <td>主表中的每一行在外表中都有多行关联行，外表中的每条记录在主表中也有多行关联行</td>
  </tr>
</table>

要在模型中定义关系，请使用相应的**装饰器**。例如，要定义每个 `User` 可以有多张照片，请使用 `@HasMany()` 装饰器。

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

手动将模型添加到连接选项的 `models` 数组中可能很繁琐。此外，从根模块引用模型会破坏应用程序域边界，并导致实现细节泄漏到应用程序的其他部分。要解决此问题，请将配置对象（传递给 `forRoot()` 方法）的 `autoLoadModels` 和 `synchronize` 属性都设置为 `true`，以自动加载模型，如下所示：

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

> warning **警告** 请注意，未通过 `forFeature()` 方法注册、但仅从模型（通过关联）引用的模型将不会被包含在内。

#### Sequelize 事务

数据库事务象征着在数据库管理系统中对数据库执行的一个工作单元，并以一致且可靠的方式处理，独立于其他事务。事务通常表示数据库中的任何更改（[learn more](https://en.wikipedia.org/wiki/Database_transaction)）。

有许多不同的策略来处理 [Sequelize transactions](https://sequelize.org/docs/v6/other-topics/transactions/)。以下是托管事务（自动回调）的示例实现。

首先，我们需要以常规方式将 `Sequelize` 对象注入到类中：

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

> info **提示** 请注意，`Sequelize` 实例仅用于启动事务。但是，要测试此类，需要模拟整个 `Sequelize` 对象（该对象暴露了多个方法）。因此，我们建议使用辅助工厂类（例如 `TransactionRunner`）并定义一个包含维护事务所需的一组有限方法的接口。这种技术使模拟这些方法变得非常简单。

#### 迁移

[Migrations](https://sequelize.org/docs/v6/other-topics/migrations/) 提供了一种增量更新数据库模式的方法，使其与应用程序的数据模型保持同步，同时保留数据库中的现有数据。为了生成、运行和回滚迁移，Sequelize 提供了一个专用的 [CLI](https://sequelize.org/docs/v6/other-topics/migrations/#installing-the-cli)。

迁移类与 Nest 应用程序源代码是分开的。它们的生命周期由 Sequelize CLI 维护。因此，您无法在迁移中利用依赖注入和其他 Nest 特定功能。要了解有关迁移的更多信息，请遵循 [Sequelize documentation](https://sequelize.org/docs/v6/other-topics/migrations/#installing-the-cli) 中的指南。

<app-banner-courses></app-banner-courses>

#### 多数据库

某些项目需要多个数据库连接。这也可以通过此模块实现。要使用多个连接，首先创建连接。在这种情况下，连接命名变得**强制**。

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

> warning **注意** 如果您没有为连接设置 `name`，其名称将设置为 `default`。请注意，您不应有多个未命名或同名的连接，否则它们将被覆盖。

此时，您已注册了具有各自连接的 `User` 和 `Album` 模型。使用此设置，您必须告诉 `SequelizeModule.forFeature()` 方法和 `@InjectModel()` 装饰器应使用哪个连接。如果您不传递任何连接名称，则将使用 `default` 连接。

```typescript
@Module({
  imports: [
    SequelizeModule.forFeature([User]),
    SequelizeModule.forFeature([Album], 'albumsConnection'),
  ],
})
export class AppModule {}

```

您还可以为给定的连接注入 `Sequelize` 实例：

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

在对应用程序进行单元测试时，我们通常希望避免建立数据库连接，保持测试套件的独立性并使其执行过程尽可能快。但我们的类可能依赖于从连接实例中获取的模型。我们如何处理这个问题？解决方案是创建模拟模型。为了实现这一点，我们设置 [custom providers](/fundamentals/dependency-injection)。每个注册的模型自动由一个 `<ModelName>Model` 令牌表示，其中 `ModelName` 是您的模型类的名称。

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

现在，替代的 `mockModel` 将被用作 `UserModel`。每当任何类使用 `@InjectModel()` 装饰器请求 `UserModel` 时，Nest 将使用已注册的 `mockModel` 对象。

#### 异步配置

您可能希望以异步方式而非静态方式传递您的 `SequelizeModule` 选项。在这种情况下，请使用 `forRootAsync()` 方法，它提供了多种处理异步配置的方式。

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

我们的工厂函数与其他任何 [asynchronous provider](/fundamentals/async-components) 的行为相同（例如，它可以是 `async`，并且能够通过 `inject` 注入依赖项）。

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

上述构造将在 `SequelizeModule` 内部实例化 `SequelizeConfigService`，并通过调用 `createSequelizeOptions()` 来提供选项对象。请注意，这意味着 `SequelizeConfigService` 必须实现 `SequelizeOptionsFactory` 接口，如下所示：

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

为了防止在 `SequelizeModule` 内部创建 `SequelizeConfigService` 并使用从其他模块导入的提供者，您可以使用 `useExisting` 语法。

```typescript
SequelizeModule.forRootAsync({
  imports: [ConfigModule],
  useExisting: ConfigService,
});

```

此构造与 `useClass` 的工作方式相同，但有一个关键区别 - `SequelizeModule` 将查找导入的模块以重用现有的 `ConfigService`，而不是实例化一个新的。

#### 示例

可用的工作示例位于 [here](https://github.com/nestjs/nest/tree/master/sample/07-sequelize)。