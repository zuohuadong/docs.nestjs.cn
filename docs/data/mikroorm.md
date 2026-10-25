<!-- 此文件从 content/data/mikroorm.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T08:05:52.435Z -->
<!-- 源文件: content/data/mikroorm.md -->
<!-- 源哈希: 0f7e36c189860fa04a3acb5e97546aae -->

### MikroORM

[MikroORM](https://mikro-orm.io) 是一个基于 Data Mapper、Unit of Work 和 Identity Map 模式的 Node.js TypeScript ORM。它支持 MongoDB、MySQL、MariaDB、PostgreSQL、SQLite、Microsoft SQL Server 和 Oracle。`@mikro-orm/nestjs` 包将其与 Nest 集成：它注册 ORM 及其 `EntityManager` 作为提供者，提供仓储注入，为每个 HTTP 请求创建请求上下文，并在应用程序关闭时关闭数据库连接。

本章介绍集成中 Nest 特有的部分。有关 ORM 本身的完整介绍，请参阅 [MikroORM documentation](https://mikro-orm.io/docs)。

> info **注意** `@mikro-orm/nestjs` 是一个第三方包，不由 NestJS 核心团队维护。如果该库有任何问题，请在 [mikro-orm/nestjs repository](https://github.com/mikro-orm/nestjs) 中报告。

> info **提示** 本章针对 MikroORM v7 和 `@mikro-orm/nestjs` v7。如果你正在从 MikroORM v6 升级，请参阅 [MikroORM v6 to v7 upgrading guide](https://mikro-orm.io/docs/upgrading-v6-to-v7)。

#### 安装

将 Nest 模块与 MikroORM、其装饰器包以及适用于你的数据库的驱动程序一起安装。本章使用 SQLite：

```bash
$ npm i @mikro-orm/nestjs @mikro-orm/core @mikro-orm/decorators @mikro-orm/sqlite

```

MikroORM 为每个受支持的数据库提供了一个驱动程序包，例如 `@mikro-orm/postgresql`、`@mikro-orm/mysql` 和 `@mikro-orm/mongodb`。完整列表请参阅 [MikroORM quick start guide](https://mikro-orm.io/docs/quick-start#安装)。

> info **提示** 自 MikroORM v7 起，装饰器不再从 `@mikro-orm/core` 中导出。Nest 项目使用旧式（实验性）装饰器，因此请从 `@mikro-orm/decorators/legacy` 导入诸如 `@Entity()` 和 `@Property()` 之类的装饰器。从你的驱动程序包（例如 `@mikro-orm/sqlite`）导入 `EntityManager`、`EntityRepository` 和 `MikroORM`，并从 `@mikro-orm/core` 导入其他类型（例如 `EntityRepositoryType` 符号）。本章中的代码片段包含了相关的导入语句。

安装完成后，将 `MikroOrmModule` 导入到根 `AppModule` 中：

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';
import { SqliteDriver } from '@mikro-orm/sqlite';

@Module({
  imports: [
    MikroOrmModule.forRoot({
      driver: SqliteDriver,
      dbName: 'my-db-name.sqlite3',
      entities: ['./dist/**/*.entity.js'],
      entitiesTs: ['./src/**/*.entity.ts'],
      metadataProvider: ReflectMetadataProvider,
    }),
  ],
})
export class AppModule {}

```

`forRoot()` 方法接受与 `MikroORM.init()` 相同的配置对象。完整选项列表请参阅 [MikroORM configuration documentation](https://mikro-orm.io/docs/configuration)。`entities` 和 `entitiesTs` 的 glob 模式告诉 MikroORM 在哪里查找你的实体文件：当它从 TypeScript 源码运行时使用 `entitiesTs`，当它从编译后的 JavaScript 运行时使用 `entities`（参见 [folder-based discovery](https://mikro-orm.io/docs/folder-based-discovery)）。

> info **提示** 自 MikroORM v7 起，`ReflectMetadataProvider` 不再是默认的元数据提供者。请像上面所示那样显式设置它，以便让 MikroORM 从 TypeScript 为旧式装饰器生成的元数据中推断属性类型。

此外，`forRoot()` 支持以下 Nest 特有的选项，这些选项将在本章后面逐一介绍：

<table>
  <tr>
    <td><code>autoLoadEntities</code></td>
    <td>如果为 <code>true</code>，则通过 <code>forFeature()</code> 注册的实体会自动添加到配置中（默认值：<code>false</code>）</td>
  </tr>
  <tr>
    <td><code>registerRequestContext</code></td>
    <td>如果为 <code>true</code>，则注册一个中间件，为每个 HTTP 请求创建请求上下文（默认值：<code>true</code>）</td>
  </tr>
  <tr>
    <td><code>forRoutesPath</code></td>
    <td>请求上下文中间件所应用的路由路径（默认值：所有路由）</td>
  </tr>
  <tr>
    <td><code>scope</code></td>
    <td><code>EntityManager</code> 提供者的 <a href="/fundamentals/injection-scopes">注入作用域</a>（默认值：<code>Scope.DEFAULT</code>）</td>
  </tr>
  <tr>
    <td><code>contextName</code></td>
    <td>连接名称，当你连接到 <a href="/data/mikroorm#多个数据库">多个数据库</a> 时为必填项</td>
  </tr>
</table>

或者，你可以将配置保存在单独的 `mikro-orm.config.ts` 文件中，[MikroORM CLI](https://mikro-orm.io/docs/quick-start#setting-up-the-commandline-tool) 也会使用该文件。由你的驱动程序包导出的 `defineConfig()` 辅助函数会为你设置 `driver` 选项：

```typescript
// mikro-orm.config.ts
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';
import { defineConfig } from '@mikro-orm/sqlite';

export default defineConfig({
  dbName: 'my-db-name.sqlite3',
  entities: ['./dist/**/*.entity.js'],
  entitiesTs: ['./src/**/*.entity.ts'],
  metadataProvider: ReflectMetadataProvider,
});

```

然后将配置传递给 `forRoot()`。自 MikroORM v7 起，`forRoot()` 不再接受空参数列表，因此你必须显式传递配置：

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import config from './mikro-orm.config.js';

@Module({
  imports: [MikroOrmModule.forRoot(config)],
})
export class AppModule {}

```

之后，`MikroORM` 和 `EntityManager` 对象便可在整个项目中注入使用，而无需在其他任何地方导入模块：

```typescript
import { Injectable } from '@nestjs/common';
import { EntityManager, MikroORM } from '@mikro-orm/sqlite';

@Injectable()
export class AppService {
  constructor(
    private readonly orm: MikroORM,
    private readonly em: EntityManager,
  ) {}
}

```

> info **注意** 从 `@mikro-orm/<driver>` 包中导入 `EntityManager` 和 `MikroORM`，其中 `<driver>` 为 `sqlite`、`postgresql`、`mysql` 或你所使用的任意驱动程序，以获取特定于驱动程序的 API。如果你已将 `@mikro-orm/sql` 作为依赖项安装，也可以从那里导入 `EntityManager`。由 `@mikro-orm/core` 导出的通用类也会被注册为注入令牌。

#### 仓储

MikroORM 支持仓储设计模式，因此每个实体都有自己的仓储。详情请参阅 [MikroORM repositories documentation](https://mikro-orm.io/docs/repositories)。继续前面的示例，定义一个 `Photo` 实体：

```typescript
// photo/photo.entity.ts
import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';

@Entity()
export class Photo {
  @PrimaryKey()
  id: number;

  @Property()
  name: string;
}

```

> info **提示** 除了装饰器之外，MikroORM 还可以使用 `defineEntity()` 辅助函数或 `EntitySchema` 类来定义实体。在 [MikroORM defining entities guide](https://mikro-orm.io/docs/defining-entities) 中了解更多。

要定义在当前作用域中注册哪些仓储，请使用 `forFeature()` 方法：

```typescript
// photo/photo.module.ts
import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Photo } from './photo.entity.js';
import { PhotoService } from './photo.service.js';
import { PhotoController } from './photo.controller.js';

@Module({
  imports: [MikroOrmModule.forFeature([Photo])],
  providers: [PhotoService],
  controllers: [PhotoController],
})
export class PhotoModule {}

```

> info **注意** 不要通过 `forFeature()` 注册你的基类实体，因为它们没有仓储。不过，基类实体需要成为 ORM 配置的一部分（例如 `forRoot()` 的 `entities` 选项）。

然后将 `PhotoModule` 导入到根 `AppModule` 中：

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import config from './mikro-orm.config.js';
import { PhotoModule } from './photo/photo.module.js';

@Module({
  imports: [MikroOrmModule.forRoot(config), PhotoModule],
})
export class AppModule {}

```

现在你可以使用 `@InjectRepository()` 装饰器将 `Photo` 仓储注入到 `PhotoService` 中：

```typescript
// photo/photo.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/sqlite';
import { Photo } from './photo.entity.js';

@Injectable()
export class PhotoService {
  constructor(
    @InjectRepository(Photo)
    private readonly photoRepository: EntityRepository<Photo>,
    private readonly em: EntityManager,
  ) {}

  findAll(): Promise<Photo[]> {
    return this.photoRepository.findAll();
  }

  findOne(id: number): Promise<Photo | null> {
    return this.photoRepository.findOne({ id });
  }

  async create(name: string): Promise<Photo> {
    const photo = this.photoRepository.create({ name });
    await this.em.flush();
    return photo;
  }

  async remove(id: number): Promise<void> {
    const photo = await this.photoRepository.findOneOrFail({ id });
    await this.em.remove(photo).flush();
  }
}

```

仓储没有 `persist()` 或 `flush()` 方法，因此写操作通过 `EntityManager` 进行，它实现了 [Unit of Work](https://mikro-orm.io/docs/unit-of-work) 模式。仓储的 `create()` 方法将新实体标记为待持久化，而 `em.flush()` 会在单个事务中将所有待处理的更改写入数据库。

#### 使用自定义仓储

要添加自己的查询方法，请扩展 `EntityRepository` 并通过 `repository` 选项将实体指向你的类：

```typescript
// author/author.entity.ts
import { EntityRepositoryType } from '@mikro-orm/core';
import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import { AuthorRepository } from './author.repository.js';

@Entity({ repository: () => AuthorRepository })
export class Author {
  // enables type inference in `em.getRepository()`
  [EntityRepositoryType]?: AuthorRepository;

  @PrimaryKey()
  id: number;

  @Property()
  name: string;
}

```

```typescript
// author/author.repository.ts
import { EntityRepository } from '@mikro-orm/sqlite';
import { Author } from './author.entity.js';

export class AuthorRepository extends EntityRepository<Author> {
  findByName(name: string): Promise<Author | null> {
    return this.findOne({ name });
  }
}

```

当你将 `Author` 实体传递给 `forFeature()` 时，该模块还会将自定义仓储类本身注册为提供者。因此，你可以直接通过其类来注入它，而无需使用 `@InjectRepository()` 装饰器：

```typescript
@Injectable()
export class AuthorService {
  constructor(private readonly authorRepository: AuthorRepository) {}
}

```

#### 自动加载实体

手动将实体添加到配置的 `entities` 数组中可能很繁琐。此外，从根模块引用实体会破坏应用程序的领域边界，并将实现细节泄漏到应用程序的其他部分。Glob 路径可以解决这个问题，但当你打包应用程序时（例如在 [monorepo](/cli/workspaces) 中）它们就不起作用了：MikroORM 在运行时查找匹配的文件，而打包产物不会将它们作为单独的文件包含在内。

作为替代方案，你可以通过将配置对象（传递给 `forRoot()` 方法）的 `autoLoadEntities` 属性设置为 `true` 来自动加载实体，如下所示：

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';
import { SqliteDriver } from '@mikro-orm/sqlite';

@Module({
  imports: [
    MikroOrmModule.forRoot({
      driver: SqliteDriver,
      dbName: 'my-db-name.sqlite3',
      metadataProvider: ReflectMetadataProvider,
      autoLoadEntities: true,
    }),
  ],
})
export class AppModule {}

```

启用此选项后，通过 `forFeature()` 方法注册的每个实体都会自动添加到配置对象的 `entities` 数组中。

> info **注意** 未通过 `forFeature()` 方法注册、而仅从某个实体（通过关系）引用的实体，不会被 `autoLoadEntities` 设置包含。

> info **注意** `autoLoadEntities` 对 MikroORM CLI 没有影响，它仍然需要一个包含完整实体列表的 CLI 配置。不过，你可以在那里使用 glob，因为 CLI 不会运行你的打包产物。

#### 请求上下文

MikroORM 将已加载的实体保存在 [identity map](https://mikro-orm.io/docs/identity-map) 中，该对象不能在并发请求之间共享。每个请求都需要自己的 `EntityManager` 分支，并具有干净的身份映射。`MikroOrmModule` 会为你处理这一点：它为所有路由注册一个中间件，在 `RequestContext` 内运行每个 HTTP 请求。在该上下文中，你注入的全局 `EntityManager`（以及依赖它的每个仓储）会透明地委托给该请求的分支。

在请求上下文之外，MikroORM 拒绝将全局 `EntityManager` 用于依赖身份映射的操作，例如 `find()` 或 `flush()`，并抛出 `ValidationError`。[next section](/data/mikroorm#request-scoped-handlers-in-queues) 展示了如何为不作为 HTTP 请求一部分运行的代码创建上下文。

要仅将中间件应用于部分路由，请设置 `forRoutesPath` 选项。要禁用它，请将 `registerRequestContext` 设置为 `false`。例如，你可以不使用中间件，而是通过将 `EntityManager` 提供者设为 [request-scoped](/fundamentals/provider-scopes)，让 Nest 为每个请求创建一个 `EntityManager` 分支：

```typescript
// app.module.ts
import { Module, Scope } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import config from './mikro-orm.config.js';

@Module({
  imports: [
    MikroOrmModule.forRoot({
      ...config,
      registerRequestContext: false,
      scope: Scope.REQUEST,
    }),
  ],
})
export class AppModule {}

```

> warning **警告** 使用 `scope: Scope.REQUEST` 时，每个依赖 `EntityManager` 的提供者（包括仓储）也会变为请求作用域。这会影响性能，如 [injection scopes chapter](/fundamentals/provider-scopes#性能) 中所述。

#### 队列中的请求作用域处理器

中间件仅对 HTTP 请求运行。该流程之外的代码，例如 [queue](/application/queues) 消费者和 [scheduled tasks](/application/task-scheduling)，没有请求上下文，因此你需要自己创建一个。

对于这些方法，请使用 `@CreateRequestContext()` 装饰器。它会分叉 `EntityManager` 并在新上下文中运行被装饰的 `async` 方法。该装饰器通过类的 `orm` 属性（一个 `MikroORM` 实例）或 `em` 属性（一个 `EntityManager`）来查找 `EntityManager`，因此请以该名称注入其中之一：

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CreateRequestContext } from '@mikro-orm/decorators/legacy';
import { MikroORM } from '@mikro-orm/sqlite';
import { Photo } from './photo.entity.js';

@Injectable()
export class PhotoStatsService {
  private readonly logger = new Logger(PhotoStatsService.name);

  constructor(private readonly orm: MikroORM) {}

  @Cron(CronExpression.EVERY_HOUR)
  @CreateRequestContext()
  async logPhotoCount() {
    // runs in a separate context, with its own identity map
    const count = await this.orm.em.count(Photo);
    this.logger.log(`Found ${count} photos`);
  }
}

```

> warning **警告** 将 `@CreateRequestContext()` 直接放在方法上方，位于其他方法装饰器（例如 `@Cron()`）的下方。该装饰器会用包装器替换该方法。列在它上方的装饰器会将其元数据附加到该包装器上，而列在它下方的装饰器会将其元数据附加到原始方法上，Nest 永远看不到这些元数据（在此示例中，定时任务将不会被注册）。

> info **注意** 顾名思义，该装饰器始终创建一个新上下文，而它的替代品 `@EnsureRequestContext()` 仅在方法尚未在另一个上下文中运行时才会创建一个。在 MikroORM v6 之前，`@CreateRequestContext()` 被称为 `@UseRequestContext()`，而在 v7 之前，它是从 `@mikro-orm/core` 导出的。

#### 事务

MikroORM 会排队所有写操作，直到你调用 `em.flush()`，然后它会将它们包装在单个事务中。要自己控制事务边界，例如多次刷新或将更改与其他查询组合，请使用 `em.transactional()` 方法：

```typescript
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/sqlite';
import { Photo } from './photo.entity.js';

@Injectable()
export class PhotoService {
  constructor(private readonly em: EntityManager) {}

  async createMany(names: string[]): Promise<void> {
    await this.em.transactional(async (em) => {
      for (const name of names) {
        em.create(Photo, { name });
      }
    });
  }
}

```

回调接收一个在事务内运行的分叉 `EntityManager`。当回调完成时，MikroORM 会刷新该分支并提交事务。如果回调抛出异常，MikroORM 会回滚事务并重新抛出错误。

或者，使用 `@Transactional()` 装饰器，它将被装饰的 `async` 方法包装在 `em.transactional()` 中：

```typescript
import { Injectable } from '@nestjs/common';
import { Transactional } from '@mikro-orm/decorators/legacy';
import { EntityManager } from '@mikro-orm/sqlite';
import { Photo } from './photo.entity.js';

@Injectable()
export class PhotoService {
  constructor(private readonly em: EntityManager) {}

  @Transactional()
  async createMany(names: string[]): Promise<void> {
    for (const name of names) {
      this.em.create(Photo, { name });
    }
  }
}

```

与 `@CreateRequestContext()` 一样，该装饰器通过类的 `em` 或 `orm` 属性查找 `EntityManager`，如果类两者都没有，则回退到当前上下文。当在另一个事务内调用时，`em.transactional()` 会启动一个嵌套事务（保存点），而 `@Transactional()` 默认加入现有事务。有关传播选项、隔离级别和锁定，请参阅 [MikroORM transactions documentation](https://mikro-orm.io/docs/transactions)。

#### 序列化

MikroORM 实体有一个 `toJSON()` 方法，它会应用 MikroORM 的 [serialization rules](https://mikro-orm.io/docs/serializing)：它会省略隐藏属性、应用自定义属性序列化器，并将已填充的关系序列化为嵌套对象，将未填充的关系序列化为其主键。当路由处理器返回实体时，Nest 会将其转换为 JSON，因此这些规则会自动生效。

> warning **警告** 不要将 [Nest's built-in serializer](/application/serialization)（即 `ClassSerializerInterceptor`）与 MikroORM 实体一起使用。它依赖于 `class-transformer`，而后者无法理解 MikroORM 用于关系的包装器：它会序列化 `Reference` 的内部结构，而遍历 `Collection` 会导致无限递归（"Maximum call stack size exceeded" 错误）。

相反，应使用 MikroORM 的选项在实体上配置序列化：

```typescript
// book/book.entity.ts
import { type Rel } from '@mikro-orm/core';
import { Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import { Author } from '../author/author.entity.js';

@Entity()
export class Book {
  @PrimaryKey()
  id: number;

  @Property()
  title: string;

  @Property({ hidden: true }) // Equivalent of class-transformer's `@Exclude()`
  hiddenField: number = Date.now();

  @Property({ persist: false }) // Similar to class-transformer's `@Expose()`. Only exists in memory, but is serialized.
  count?: number;

  @ManyToOne(() => Author, {
    serializer: (author: Author) => author.name,
    serializedName: 'authorName',
  }) // Equivalent of class-transformer's `@Transform()`
  author: Rel<Author>;
}

```

> info **提示** 当实体相互引用时，请将关系类型包装在 `Rel<T>` 中（或使用来自 `@mikro-orm/core` 的 `Ref<T>`），并将目标实体传递给关系装饰器，如上所示。否则，TypeScript 会生成直接引用相关类的装饰器元数据。在 ESM 项目中，实体文件之间的循环导入随后会在启动时失败，并抛出 `ReferenceError`（例如 "Cannot access 'Author' before initialization"）。

要为单个路由处理器控制序列化，请使用 `serialize()` 函数显式转换实体，该函数由你的驱动包和 `@mikro-orm/core` 导出。它接受诸如 `populate`、`exclude`、`fields` 和 `groups` 等选项：

```typescript
@Get(':id')
async findOne(@Param('id', ParseIntPipe) id: number) {
  const book = await this.em.findOneOrFail(Book, { id }, { populate: ['author'] });
  return serialize(book, { fields: ['title', 'author'] }); // { title: '...', authorName: '...' }
}

```

要获取应用了默认规则的普通对象，请调用 `wrap(entity).toObject()`。

#### 多个数据库

要连接到多个数据库，请为每个数据库调用一次 `MikroOrmModule.forRoot()`，并为每个连接指定唯一的 `contextName`。在此设置中，请在每个连接上将 `registerRequestContext` 设置为 `false`，因为默认中间件仅适用于单个未命名连接。相反，请导入一次 `MikroOrmModule.forMiddleware()`。它的中间件会创建一个覆盖所有连接的请求上下文：

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';
import { SqliteDriver } from '@mikro-orm/sqlite';
import { Album } from './album/album.entity.js';
import { Photo } from './photo/photo.entity.js';

@Module({
  imports: [
    MikroOrmModule.forRoot({
      contextName: 'photos',
      registerRequestContext: false,
      driver: SqliteDriver,
      dbName: 'photos.sqlite3',
      entities: [Photo],
      metadataProvider: ReflectMetadataProvider,
    }),
    MikroOrmModule.forRoot({
      contextName: 'albums',
      registerRequestContext: false,
      driver: SqliteDriver,
      dbName: 'albums.sqlite3',
      entities: [Album],
      metadataProvider: ReflectMetadataProvider,
    }),
    MikroOrmModule.forMiddleware(),
  ],
})
export class AppModule {}

```

> warning **注意** 如果你使用 `MikroOrmModule.forRootAsync()`，请将 `contextName` 设置在 `useFactory` 旁边，而不是放在工厂返回的选项对象内部。

使用此设置，请将上下文名称传递给 `forFeature()` 方法和 `@InjectRepository()` 装饰器：

```typescript
// album/album.module.ts
@Module({
  imports: [MikroOrmModule.forFeature([Album], 'albums')],
  providers: [AlbumService],
})
export class AlbumModule {}

```

要注入特定连接的 `MikroORM` 或 `EntityManager`，请使用 `@InjectMikroORM()` 和 `@InjectEntityManager()` 装饰器：

```typescript
// album/album.service.ts
import { Injectable } from '@nestjs/common';
import { InjectEntityManager, InjectMikroORM, InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository, MikroORM } from '@mikro-orm/sqlite';
import { Album } from './album.entity.js';

@Injectable()
export class AlbumService {
  constructor(
    @InjectRepository(Album, 'albums')
    private readonly albumRepository: EntityRepository<Album>,
    @InjectEntityManager('albums')
    private readonly em: EntityManager,
    @InjectMikroORM('albums')
    private readonly orm: MikroORM,
  ) {}
}

```

要将所有已注册的 `MikroORM` 实例作为数组注入，请使用 `@InjectMikroORMs()` 装饰器。

#### 测试

在对应用程序进行单元测试时，你通常希望避免数据库连接，这可以保持测试套件独立且快速。但是，你的类可能依赖于仓储和 `EntityManager`。要解析这些类，请使用 [custom providers](/fundamentals/dependency-injection) 提供模拟实现。

`@mikro-orm/nestjs` 包暴露了一个 `getRepositoryToken()` 函数，它根据给定的实体返回一个准备好的注入令牌（例如，对于 `Photo` 实体返回 `'PhotoRepository'`），从而允许你模拟仓储。对于自定义仓储，请使用其类作为令牌：

```typescript
import { Module } from '@nestjs/common';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { EntityManager } from '@mikro-orm/sqlite';
import { Photo } from './photo.entity.js';
import { PhotoService } from './photo.service.js';

@Module({
  providers: [
    PhotoService,
    {
      // or, for a custom repository: `provide: PhotoRepository`
      provide: getRepositoryToken(Photo),
      useValue: mockedRepository,
    },
    {
      provide: EntityManager,
      useValue: mockedEntityManager,
    },
  ],
})
export class PhotoModule {}

```

现在，只要此模块中的类使用 `@InjectRepository(Photo)` 装饰器请求 `Photo` 仓储，就会注入 `mockedRepository` 对象。对于 [multiple databases](/data/mikroorm#多个数据库)，请将上下文名称作为第二个参数传递，例如 `getRepositoryToken(Album, 'albums')`。

#### 异步配置

当你需要以异步方式而非静态方式传递模块选项时，请使用 `forRootAsync()` 方法。与大多数动态模块一样，Nest 提供了多种异步配置技术。

一种技术是使用工厂函数。与其他 [factory providers](/fundamentals/dependency-injection#工厂提供者usefactory) 一样，工厂函数可以是 `async`，并可以通过 `inject` 注入依赖：

```typescript
MikroOrmModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (configService: ConfigService) => ({
    dbName: configService.getOrThrow<string>('DB_NAME'),
    autoLoadEntities: true,
    metadataProvider: ReflectMetadataProvider,
  }),
  inject: [ConfigService],
  driver: SqliteDriver,
});

```

> warning **警告** 请将 `driver` 选项设置在 `useFactory` 旁边，如上所示。模块需要在调用工厂之前知道驱动程序，以便将驱动程序特定的 `EntityManager` 和 `MikroORM` 类注册为注入令牌。否则，从你的驱动包注入 `EntityManager` 会因依赖解析错误而失败。

或者，你可以使用类而不是工厂来配置 `MikroOrmModule`，如下所示：

```typescript
MikroOrmModule.forRootAsync({
  useClass: MikroOrmConfigService,
  driver: SqliteDriver,
});

```

上面的构造在 `MikroOrmModule` 内部实例化 `MikroOrmConfigService`，并使用它来创建所需的选项对象。在此示例中，`MikroOrmConfigService` 必须实现 `MikroOrmOptionsFactory` 接口，如下所示。`MikroOrmModule` 会在所提供类的实例化对象上调用 `createMikroOrmOptions()` 方法。

```typescript
import { Injectable } from '@nestjs/common';
import { MikroOrmModuleOptions, MikroOrmOptionsFactory } from '@mikro-orm/nestjs';
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';

@Injectable()
export class MikroOrmConfigService implements MikroOrmOptionsFactory {
  createMikroOrmOptions(): MikroOrmModuleOptions {
    return {
      dbName: 'my-db-name.sqlite3',
      autoLoadEntities: true,
      metadataProvider: ReflectMetadataProvider,
    };
  }
}

```

要重用现有的选项提供者，而不是在 `MikroOrmModule` 内部创建私有副本，请使用 `useExisting` 语法。该提供者必须实现 `MikroOrmOptionsFactory` 接口，并且 `imports` 中列出的模块必须导出它：

```typescript
MikroOrmModule.forRootAsync({
  imports: [DatabaseConfigModule],
  useExisting: MikroOrmConfigService,
  driver: SqliteDriver,
});

```

#### 应用程序关闭

`MikroOrmModule` 会在 `onApplicationShutdown()` 生命周期钩子中关闭 ORM 及其数据库连接，当你调用 `app.close()` 时 Nest 会调用该钩子。但是，默认情况下，Nest 不会监听诸如 `SIGTERM` 之类的进程终止信号，因此当进程终止时连接不会被关闭。要在这种情况下也关闭它，请启用 [shutdown hooks](/fundamentals/lifecycle-events#application-shutdown)：

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

#### 示例

有关使用 NestJS 和 MikroORM 的完整应用程序，请参阅 [nestjs-realworld-example-app](https://github.com/mikro-orm/nestjs-realworld-example-app) 和 [nestjs-example-app](https://github.com/mikro-orm/nestjs-example-app) 仓库。