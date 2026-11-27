<!-- 此文件从 content/data/typeorm.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:44:01.976Z -->
<!-- 源文件: content/data/typeorm.md -->
<!-- 源哈希: 23eea8feefea5765dca9868b3ea71901 -->

### TypeORM

`@nestjs/typeorm` 包将 [TypeORM](https://github.com/typeorm/typeorm) 与 Nest 集成。TypeORM 是 TypeScript 可用的最成熟的**对象关系映射器** (ORM) 之一。因为它是用 TypeScript 编写的，所以与 Nest 集成良好。

要开始使用，请安装所需的依赖项。本章使用 [MySQL](https://www.mysql.com/)，但 TypeORM 支持许多其他关系型数据库，例如 PostgreSQL、Oracle、Microsoft SQL Server 和 SQLite，以及 MongoDB 等 NoSQL 数据库。本章中的步骤对 TypeORM 支持的每种数据库都是相同的；您只需要安装对应数据库的客户端库即可。

```bash
$ npm install --save @nestjs/typeorm typeorm mysql2

```

安装完成后，将 `TypeOrmModule` 导入到根 `AppModule` 中：

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

> warning **警告** 不要在生产环境中使用 `synchronize: true`；否则，您可能会丢失生产数据。例如，使用 `synchronize: process.env.NODE_ENV !== 'production'` 关闭它是不够的：生产环境将没有任何表。请使用 [migrations](/recipes/sql-typeorm#迁移) 来创建其**模式**。

`forRoot()` 方法接受 TypeORM [`DataSource` constructor](https://typeorm.io/docs/data-source/data-source-options#common-data-source-options) 支持的所有配置属性。它还接受以下额外属性：

<table>
  <tr>
    <td><code>retryAttempts</code></td>
    <td>连接到数据库的尝试次数（默认值：<code>10</code>）</td>
  </tr>
  <tr>
    <td><code>retryDelay</code></td>
    <td>连接重试尝试之间的延迟时间，单位为毫秒（默认值：<code>3000</code>）</td>
  </tr>
  <tr>
    <td><code>toRetry</code></td>
    <td>接收连接错误并返回是否重试的函数。默认情况下，所有错误都会重试</td>
  </tr>
  <tr>
    <td><code>verboseRetryLog</code></td>
    <td>如果为 <code>true</code>，则在每次连接重试的日志条目中包含错误消息（默认值：<code>false</code>）</td>
  </tr>
  <tr>
    <td><code>autoLoadEntities</code></td>
    <td>如果为 <code>true</code>，则实体会自动加载（默认值：<code>false</code>）。参见 <a href="/recipes/sql-typeorm#自动加载实体">自动加载实体</a></td>
  </tr>
  <tr>
    <td><code>manualInitialization</code></td>
    <td>如果为 <code>true</code>，则数据源在**模块**初始化期间不会初始化，因此不会建立连接，也不会运行**迁移**。您必须自行调用 <code>DataSource.initialize()</code> 并根据需要处理重试（默认值：<code>false</code>）</td>
  </tr>
</table>

> info **提示** 了解有关 [TypeORM data source options](https://typeorm.io/docs/data-source/data-source-options) 文档中可用选项的更多信息。

完成此操作后，您可以在项目的任何地方注入 TypeORM `DataSource` 和 `EntityManager` 对象，而无需导入任何**模块**。例如：

```typescript title="app.module.ts"
import { DataSource } from 'typeorm';

@Module({
  imports: [TypeOrmModule.forRoot(), UsersModule],
})
export class AppModule {
  constructor(private dataSource: DataSource) {}
}

```

#### **仓储**模式

[TypeORM](https://github.com/typeorm/typeorm) 支持**仓储设计模式**，因此每个**实体**都有自己的**仓储**。您从数据源获取这些**仓储**。

为了继续示例，我们需要至少一个**实体**。让我们定义 `User` **实体**。

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

> info **提示** 在 [TypeORM documentation](https://typeorm.io/docs/entity/entities/) 中了解有关**实体**的更多信息。

`User` **实体**文件位于 `users` 目录中，该目录包含所有与 `UsersModule` 相关的文件。您可以将模型文件放在任何您喜欢的位置，但我们建议将其放置在其**领域**附近，在相应的**模块**目录中。

要开始使用 `User` **实体**，请通过将其添加到 `forRoot()` 选项中的 `entities` 数组来告知 TypeORM（除非您使用静态 glob 路径）：

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

接下来，我们来看 `UsersModule`：

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

该**模块**使用 `forFeature()` 方法来定义当前**作用域**中注册了哪些**仓储**。设置好后，您可以使用 `@InjectRepository()` **装饰器**将 `User` **仓储**注入到 `UsersService` 中：

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

> warning **注意** 别忘了将 `UsersModule` 导入到根 `AppModule` 中。

要在导入了 `TypeOrmModule.forFeature()` 的**模块**外部使用**仓储**，请重新导出它生成的**提供者**。您可以通过导出整个**模块**来实现：

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

现在，如果您将 `UsersModule` 导入到 `UserHttpModule` 中，您可以在后者**模块**的**提供者**中使用 `@InjectRepository(User)`：

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

关系是两个或多个表之间的关联，基于每个表中的共同字段，通常涉及主键和外键。

有三种关系类型：

<table>
  <tr>
    <td><code>一对一</code></td>
    <td>主表中每一行在外表中都有且仅有一个关联行。使用 <code>@OneToOne()</code> **装饰器**来定义此类关系。</td>
  </tr>
  <tr>
    <td><code>一对多/多对一</code></td>
    <td>主表中每一行在外表中有一个或多个相关行。使用 <code>@OneToMany()</code> 和 <code>@ManyToOne()</code> **装饰器**来定义此类关系。</td>
  </tr>
  <tr>
    <td><code>多对多</code></td>
    <td>主表中每一行在外表中有多行相关行，外表中每一行在主表中也有多行相关行。使用 <code>@ManyToMany()</code> **装饰器**来定义此类关系。</td>
  </tr>
</table>

在**实体**中定义关系时，请使用相应的**装饰器**。例如，要定义每个 `User` 可以有多个照片，请使用 `@OneToMany()` **装饰器**。

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

> info **提示** 有关 TypeORM 中关系的更多信息，请访问 [TypeORM documentation](https://typeorm.io/docs/relations/relations)。

#### 自动加载实体

手动将实体添加到数据源选项的 `entities` 数组中可能很繁琐。此外，从根模块引用实体会破坏应用程序的领域边界，并将实现细节泄露给应用程序的其他部分。为避免这种情况，请将传递给 `forRoot()` 的选项对象的 `autoLoadEntities` 属性设置为 `true`：

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

启用此选项后，通过 `forFeature()` 方法注册的每个实体都会自动添加到数据源选项的 `entities` 数组中。

> warning **警告** 未通过 `forFeature()` 注册，仅通过另一个实体（通过关系）引用的实体不会被 `autoLoadEntities` 设置包含。

#### 分离实体定义

您可以使用 **装饰器** 直接在模型类中定义实体及其列。或者，您可以使用 [entity schemas](https://typeorm.io/docs/entity/separating-entity-definition) 在单独的文件中定义实体及其列。

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

> warning **警告** 如果您提供了 `target` 选项，则 `name` 选项必须与目标类的名称匹配。如果您不提供 `target`，则可以使用任何名称。

Nest 允许您在预期实体类的任何地方使用一个 `EntitySchema` 实例。例如：

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

[database transaction](https://en.wikipedia.org/wiki/Database_transaction) 是针对数据库执行的工作单元，以一致和可靠的方式处理，独立于其他事务。一个事务通常代表数据库中的任何更改。

处理 [TypeORM transactions](https://typeorm.io/docs/advanced-topics/transactions/) 有几种策略。我们推荐使用 `QueryRunner` 类，因为它为您提供了对事务的完全控制。

首先，像往常一样将 `DataSource` 对象注入到类中：

```typescript
@Injectable()
export class UsersService {
  constructor(private dataSource: DataSource) {}
}

```

> info **提示** `DataSource` 类是从 `typeorm` 包导入的。

然后使用它来创建事务：

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
    // since we have errors, roll back the changes we made
    await queryRunner.rollbackTransaction();
  } finally {
    // you need to release a manually instantiated query runner
    await queryRunner.release();
  }
}

```

> info **提示** `dataSource` 仅用于创建 `QueryRunner`。但是，测试此类需要模拟整个 `DataSource` 对象，这会暴露许多方法。相反，我们推荐一个辅助工厂类（例如 `QueryRunnerFactory`），该类实现了一个仅包含管理事务所需方法的接口。这使得这些方法易于模拟。

<app-banner-observe></app-banner-observe>

或者，您可以使用 `DataSource` 对象的回调式 `transaction()` 方法（在 TypeORM 文档的 [Creating and using transactions](https://typeorm.io/docs/advanced-topics/transactions/#creating-and-using-transactions) 中查看）：

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

[Migrations](https://typeorm.io/docs/advanced-topics/migrations/) 提供了一种增量更新数据库模式的方法，以使其与应用程序的数据模型保持同步，同时保留数据库中现有数据。要生成、运行和回滚迁移，TypeORM 提供了一个专用的 [CLI](https://typeorm.io/docs/advanced-topics/migrations/#creating-a-new-migration)。

要在应用程序启动时应用待处理的迁移，请将 `migrations` 指向编译后的迁移文件，并设置 `migrationsRun`，同时关闭 `synchronize`：

```typescript
TypeOrmModule.forRoot({
  // ...connection options
  entities: [User],
  migrations: ['dist/migrations/*.js'],
  migrationsRun: true,
  synchronize: false,
}),

```

或者，将其作为新版本启动之前的部署步骤，使用 TypeORM CLI（`typeorm migration:run`）运行它们。

迁移类与 Nest 应用程序源代码是分离的，TypeORM 管理它们的生命周期。因此，您不能在迁移中使用依赖注入或其他 Nest 特定的功能。要了解更多信息，请参阅 TypeORM 文档中的 [migrations guide](https://typeorm.io/docs/advanced-topics/migrations/)。

#### 多个数据库

某些项目需要多个数据库连接，此模块也支持。要处理多个连接，首先创建它们。在这种情况下，除默认数据源外的每个数据源都必须有一个唯一的 **名称**。

假设您有一个存储在其自己的数据库中的 `Album` 实体。

```typescript
const defaultOptions = {
  type: 'postgres' as const,
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

> warning **注意** 如果您没有为数据源设置 `name`，则其名称为 `default`。不要注册没有名称或具有相同名称的多个数据源；否则它们会相互覆盖。

> warning **注意** 如果您使用 `TypeOrmModule.forRootAsync()`，则**也**必须在 `useFactory` 外部设置数据源名称。例如：
>
> ```typescript
> TypeOrmModule.forRootAsync({
>   name: 'albumsConnection',
>   useFactory: ...,
>   inject: ...,
> }),
> ```

>
> 更多详细信息，请参阅 [nestjs/typeorm issue #86](https://github.com/nestjs/typeorm/issues/86)。

此时，`User` 和 `Album` 实体分别注册到各自的数据源。在此设置下，您必须告诉 `TypeOrmModule.forFeature()` 方法和 `@InjectRepository()` **装饰器** 使用哪个数据源。如果不传递数据源名称，则使用 `default` 数据源。

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    TypeOrmModule.forFeature([Album], 'albumsConnection'),
  ],
})
export class AppModule {}

```

您也可以为给定数据源注入 `DataSource` 或 `EntityManager`：

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

您还可以使用 `getDataSourceToken()` 函数将任何 `DataSource` 注入到工厂提供者中：

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

在单元测试应用程序时，通常希望避免连接到数据库，以保持测试套件的独立性和尽可能快的速度。然而，您的类可能依赖于从数据源实例获取的仓储。解决方案是使用 [custom providers](/fundamentals/dependency-injection) 创建模拟仓储。每个注册的仓储都由一个 `<EntityName>Repository` 令牌自动表示，其中 `EntityName` 是您的实体类的名称。

`@nestjs/typeorm` 包导出了 `getRepositoryToken()` 函数，该函数为给定实体返回此令牌。对于命名数据源，请将数据源名称作为第二个参数传递。

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

现在 `mockRepository` 被用作 `User` 仓储。每当一个类使用 `@InjectRepository(User)` 注入它时，Nest 都会提供已注册的 `mockRepository` 对象。

#### 异步配置

您可能希望异步而不是静态地传递模块选项。在这种情况下，请使用 `forRootAsync()` 方法，它支持提供异步配置的多种方式。

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

该工厂行为类似于任何其他 [asynchronous provider](/fundamentals/async-components)（例如，它可以是 `async`，并且可以通过 `inject` 注入依赖项）。

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

上述构造在 `TypeOrmModule` 内部实例化 `TypeOrmConfigService`，并通过调用 `createTypeOrmOptions()` 来创建选项对象。这意味着 `TypeOrmConfigService` 必须实现 `TypeOrmOptionsFactory` 接口：

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

为了重用从不同模块导入的提供者，而不是在 `TypeOrmModule` 内部创建 `TypeOrmConfigService`，请使用 `useExisting` 语法：

```typescript
TypeOrmModule.forRootAsync({
  imports: [ConfigModule],
  useExisting: ConfigService,
});

```

这与 `useClass` 相同，但有一个关键区别：`TypeOrmModule` 会查找导入的模块以重用现有的 `ConfigService`，而不是实例化一个新的。

> info **提示** 在与 `useFactory`、`useClass` 或 `useExisting` 属性相同的级别定义 `name` 属性。这允许 Nest 在适当的注入令牌下注册数据源。

#### 自定义 DataSource 工厂

与异步配置（`useFactory`、`useClass` 或 `useExisting`）一起，您可以选择指定一个 `dataSourceFactory` 函数，以提供您自己的 TypeORM 数据源，而不是让 `TypeOrmModule` 创建它。

`dataSourceFactory` 接收由异步配置解析的 TypeORM `DataSourceOptions`，并返回一个 `Promise`，该 `Promise` 解析为一个 TypeORM `DataSource`。如果返回的数据源尚未初始化，`TypeOrmModule` 将其初始化（除非设置了 `manualInitialization`）。

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
  // dataSourceFactory receives the configured DataSourceOptions
  // and returns a Promise<DataSource>.
  dataSourceFactory: async (options) => {
    const dataSource = await new DataSource(options!).initialize();
    return dataSource;
  },
});

```

> info **提示** `DataSource` 类是从 `typeorm` 包导入的。

#### 示例

一个可工作的示例可在 NestJS 仓库的 [TypeORM sample application](https://github.com/nestjs/nest/tree/master/sample/05-sql-typeorm) 中找到。

<app-banner-enterprise></app-banner-enterprise>