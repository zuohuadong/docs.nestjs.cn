<!-- 此文件从 content/data/mikroorm.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:33:25.178Z -->
<!-- 源文件: content/data/mikroorm.md -->
<!-- 源哈希: 1f3d92d97205fbbbe597bef08880e06b -->

### MikroORM

[MikroORM](https://mikro-orm.io) 是一个基于数据映射器、工作单元和身份映射模式的用于 Node.js 的 TypeScript ORM。它支持 MongoDB、MySQL、MariaDB、PostgreSQL、SQLite、Microsoft SQL Server 和 Oracle。`@mikro-orm/nestjs` 包将其与 Nest 集成：它将 ORM 及其 `EntityManager` 注册为提供者，提供仓储注入，为每个 HTTP 请求创建请求上下文，并在应用程序关闭时关闭数据库连接。

本章涵盖了与 Nest 相关的集成部分。有关 ORM 本身的完整覆盖，请参阅 [MikroORM documentation](https://mikro-orm.io/docs)。

> info **注意** `@mikro-orm/nestjs` 是第三方包，不由 NestJS 核心团队管理。有关库的任何问题，请在 [mikro-orm/nestjs repository](https://github.com/mikro-orm/nestjs) 报告。

> info **提示** 本章针对 MikroORM v7 和 `@mikro-orm/nestjs` v7。如果您是从 MikroORM v6 升级，请参阅 [MikroORM v6 to v7 upgrading guide](https://mikro-orm.io/docs/upgrading-v6-to-v7)。

#### 安装

将 Nest 模块与 MikroORM、其装饰器包以及数据库的驱动程序一起安装。本章使用 SQLite：

```bash
$ npm i @mikro-orm/nestjs @mikro-orm/core @mikro-orm/decorators @mikro-orm/sqlite

```

MikroORM 为每个支持的数据库提供驱动程序包，例如 `@mikro-orm/postgresql`、`@mikro-orm/mysql` 和 `@mikro-orm/mongodb`。有关完整列表，请参阅 [MikroORM quick start guide](https://mikro-orm.io/docs/quick-start#安装)。

> info **提示** 自 MikroORM v7 起，装饰器不再从 `@mikro-orm/core` 导出。Nest 项目使用遗留（实验性）装饰器，因此请从 `@mikro-orm/decorators/legacy` 导入诸如 `@Entity()` 和 `@Property()` 的装饰器。请从您的驱动程序包（例如 `@mikro-orm/sqlite`）导入 `EntityManager`、`EntityRepository` 和 `MikroORM`，以及其他类型（例如 `EntityRepositoryType` 符号）从 `@mikro-orm/core`。本章中的代码片段包含相关的导入语句。

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

`forRoot()` 方法接受与 `MikroORM.init()` 相同的配置对象。有关选项的完整列表，请参阅 [MikroORM configuration documentation](https://mikro-orm.io/docs/configuration)。`entities` 和 `entitiesTs` glob 模式告诉 MikroORM 在哪里找到实体文件：当从 TypeScript 源代码运行时，它使用 `entitiesTs`；当从编译后的 JavaScript 运行时，它使用 `entities`（参见 [folder-based discovery](https://mikro-orm.io/docs/folder-based-discovery)）。

> info **提示** 自 MikroORM v7 起，`ReflectMetadataProvider` 不再是默认元数据提供者。如上所示，明确设置它，以便 MikroORM 从 TypeScript 为遗留装饰器发出的元数据中推断属性类型。

此外，`forRoot()` 支持以下 Nest 特定的选项，所有选项将在本章稍后描述：

<table>
  <tr>
    <td><code>autoLoadEntities</code></td>
    <td>如果 <code>true</code>，通过 <code>forFeature() 注册的实体会自动添加到配置中（默认值：<code>false</code>）</td>
  </tr>
  <tr>
    <td><code>registerRequestContext</code></td>
    <td>如果 <code>true</code>，则注册一个中间件，为每个 HTTP 请求创建请求上下文（默认值：<code>true</code>）</td>
  </tr>
  <tr>
    <td><code>forRoutesPath</code></td>
    <td>请求上下文中间件适用的路由路径（默认值：所有路由）</td>
  </tr>
  <tr>
    <td><code>scope</code></td>
    <td><a href="/fundamentals/provider-scopes">EntityManager</a>提供者的 <code>依赖注入 </code>作用域（默认值：<code>Scope.DEFAULT</code>）</td>
  </tr>
  <tr>
    <td><code>contextName</code></td>
    <td>连接的名称，当连接到 <a href="/data/mikroorm#多个数据库">多个数据库时需要（</a></td>）
  </tr>
</table>

或者，您可以将配置保留在单独的 `mikro-orm.config.ts` 文件中，[MikroORM CLI](https://mikro-orm.io/docs/quick-start#setting-up-the-commandline-tool) 也会使用它。您的驱动程序包导出的 `defineConfig()` 辅助函数会为您设置 `driver` 选项：

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

然后将配置传递给 `forRoot()`。自 MikroORM v7 起，`forRoot()` 不再接受空参数列表，因此您必须显式传递配置：

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

之后，`MikroORM` 和 `EntityManager` 对象可以在整个项目中进行注入，而无需在其他地方导入任何模块：

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

> info **注意** 从 `@mikro-orm/<driver>` 包导入 `EntityManager` 和 `MikroORM`，其中 `<driver>` 是您使用的 `sqlite`、`postgresql`、`mysql` 或任何驱动程序，以获取特定于驱动的 API。如果您已将 `@mikro-orm/sql` 作为依赖项安装，也可以从那里导入 `EntityManager`。由 `@mikro-orm/core` 导出的通用类也被注册为注入令牌。

#### 仓储

MikroORM 支持仓储设计模式，因此每个实体都有自己的仓储。有关详细信息，请参阅 [MikroORM repositories documentation](https://mikro-orm.io/docs/repositories)。为继续示例，定义一个 `Photo` 实体：

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

> info **提示** 除了装饰器外，MikroORM 还可以使用 `defineEntity()` 辅助函数或 `EntitySchema` 类来定义实体。更多信息请参阅 [MikroORM defining entities guide](https://mikro-orm.io/docs/defining-entities)。

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

> info **注意** 不要通过 `forFeature()` 注册您的基础实体，因为它们没有仓储。但是，基础实体需要作为 ORM 配置的一部分（例如 `entities` 的 `forRoot()` 选项）。

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

您现在可以使用 `@InjectRepository()` 装饰器将 `Photo` 仓储注入到 `PhotoService` 中：

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

仓储没有 `persist()` 或 `flush()` 方法，因此写入操作通过 `EntityManager` 进行，该方法实现了 [Unit of Work](https://mikro-orm.io/docs/unit-of-work) 模式。仓储的 `create()` 方法将新实体标记为持久化，而 `em.flush()` 在单个事务中将所有待处理的变更写入数据库。

#### 使用自定义仓储

要添加自己的查询方法，请扩展 `EntityRepository`，并通过 `repository` 选项将实体指向您的类：

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

当您将 `Author` 实体传递给 `forFeature()` 时，模块也会将自定义仓储类本身注册为一个提供者。因此，您可以不使用 `@InjectRepository()` 装饰器通过其类注入它：

```typescript
@Injectable()
export class AuthorService {
  constructor(private readonly authorRepository: AuthorRepository) {}
}

```

#### 自动加载实体

手动将实体添加到配置的 `entities` 数组中可能很繁琐。此外，从根模块引用实体会破坏应用程序的领域边界，并将实现细节泄露给应用程序的其他部分。Glob 路径解决了这个问题，但在您打包应用程序时（例如在 [monorepo](/cli/workspaces) 中）不适用：MikroORM 在运行时查找匹配的文件，而打包文件不包含它们作为独立文件。

作为替代方案，您可以将配置对象（传递给 `forRoot()` 方法）的 `autoLoadEntities` 属性设置为 `true`，从而自动加载实体，如下所示：

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

> info **注意** 未通过 `forFeature()` 方法注册，但仅通过实体（通过关系）引用的实体不会被 `autoLoadEntities` 设置包含。

> info **注意** `autoLoadEntities` 对 MikroORM CLI 没有影响，CLI 仍然需要包含完整实体列表的 CLI 配置。但是，您可以在那里使用 glob 模式，因为 CLI 不运行您的打包文件。

#### 请求上下文

MikroORM 将已加载的实体保存在一个 [identity map](https://mikro-orm.io/docs/identity-map) 中，此缓存不应在并发请求之间共享。每个请求都需要其 `EntityManager` 的独立副本，并具有干净的身份映射。`MikroOrmModule` 为您处理了这一点：它为所有路由注册了一个中间件，该中间件将每个 HTTP 请求封装在一个 `RequestContext` 中。在该上下文中，您注入的全局 `EntityManager`（以及所有依赖它的仓储）会透明地委托给请求的副本。

在请求上下文之外，MikroORM 拒绝对依赖身份映射的操作（例如 `find()` 或 `flush()`）使用全局 `EntityManager`，并抛出 `ValidationError`。[next section](/data/mikroorm#request-scoped-handlers-in-queues) 展示了如何为不作为 HTTP 请求一部分的代码创建上下文。

要仅将中间件应用于子集路由，请设置 `forRoutesPath` 选项。要禁用它，请将 `registerRequestContext` 设置为 `false`。例如，不是使用中间件，您可以让 Nest 为每个请求创建一个 `EntityManager` 副本，方法是将 `EntityManager` 提供者设置为 [request-scoped](/fundamentals/provider-scopes)：

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

> warning **警告** 使用 `scope: Scope.REQUEST` 时，所有依赖于 `EntityManager` 的提供者（包括仓储）也会成为请求作用域。这会影响性能，如 [injection scopes chapter](/fundamentals/provider-scopes#性能) 所述。

#### 队列中的请求作用域处理器

中间件仅对 HTTP 请求运行。该流程之外的代码，例如 [queue](/techniques/queues) 消费者和 [scheduled tasks](/techniques/task-scheduling)，没有请求上下文，因此您需要自己创建它。

对于这些方法，请使用 `@CreateRequestContext()` 装饰器。它会为 `EntityManager` 派生副本，并在新上下文中运行被装饰的 `async` 方法。该装饰器通过类的 `EntityManager` 属性（一个 `MikroORM` 实例）或 `orm` 属性（一个 `em`）查找 `EntityManager`，因此请按该名称注入其中一个：

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

> warning **警告** 将 `@CreateRequestContext()` 直接放置在方法上方，位于其他方法装饰器（如 `@Cron()`）的下方。该装饰器用一个包装器替换了方法。在其上列出的装饰器将其元数据附加到该包装器上，但在其下列出的装饰器将其元数据附加到原始方法上，Nest 永远不会看到（在此示例中，定时任务不会被注册）。

> info **注意** 如名称所示，此装饰器始终创建新上下文，不同的是其替代方案 `@EnsureRequestContext()`，后者仅在方法尚未在另一个上下文中运行时才创建。在 MikroORM v6 之前，`@CreateRequestContext()` 被称为 `@UseRequestContext()`，在 v7 之前，它从 `@mikro-orm/core` 导出。

#### 事务

MikroORM 会将所有写入操作排队，直到您调用 `em.flush()`，然后将其包装在一个单独的事务中。要自行控制事务边界，例如多次刷新或将变更与其他查询组合，请使用 `em.transactional()` 方法：

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

回调接收一个在事务内部运行的派生 `EntityManager`。当回调完成时，MikroORM 会刷新该副本并提交事务。如果回调抛出异常，MikroORM 会回滚事务并重新抛出错误。

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

与 `@CreateRequestContext()` 类似，该装饰器通过类的 `EntityManager` 或 `em`/`orm` 属性查找 `em`，如果类中两者都没有，则回退到当前上下文。当在另一个事务内部调用时，`em.transactional()` 会启动一个嵌套事务（一个保存点），而 `@Transactional()` 默认会加入现有事务。有关传播选项、隔离级别和锁定，请参阅 [MikroORM transactions documentation](https://mikro-orm.io/docs/transactions)。

#### 序列化

MikroORM 实体有一个 `toJSON()` 方法，该方法应用了 MikroORM 的 [serialization rules](https://mikro-orm.io/docs/serializing)：它会省略隐藏属性，应用自定义属性序列化器，并将已填充的关系序列化为嵌套对象，未填充的关系序列化为它们的主键。当路由处理程序返回一个实体时，Nest 会将其转换为 JSON，因此这些规则会自动应用。

> 警告 **警告** 不要将 [Nest's built-in serializer](/application/serialization)（`ClassSerializerInterceptor`）与 MikroORM 实体一起使用。它依赖于 `class-transformer`，而后者不理解 MikroORM 用于关系的包装器：它序列化了 `Reference` 的内部结构，而遍历一个 `Collection` 会导致无限递归（“Maximum call stack size exceeded”错误）。

相反，使用 MikroORM 的选项在实体上配置序列化：

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

> 信息 **提示** 当实体相互引用时，请将关系类型包装在 `Rel<T>`（或使用 `Ref<T>`）中，来自 `@mikro-orm/core`，并将目标实体传递给关系装饰器，如上所示。否则，TypeScript 会发出引用相关类的装饰器元数据。在 ESM 项目中，实体文件之间的循环导入在启动时会因 `ReferenceError`（例如，“Cannot access 'Author' before initialization”）而失败。

要控制单个路由处理程序的序列化，请使用由您的驱动程序包和 `@mikro-orm/core` 导出的 `serialize()` 函数进行显式转换。它接受诸如 `populate`、`exclude`、`fields` 和 `groups` 等选项：

```typescript
@Get(':id')
async findOne(@Param('id', ParseIntPipe) id: number) {
  const book = await this.em.findOneOrFail(Book, { id }, { populate: ['author'] });
  return serialize(book, { fields: ['title', 'author'] }); // { title: '...', authorName: '...' }
}

```

要获取应用默认规则的纯对象，请调用 `wrap(entity).toObject()`。

#### 多数据库

要连接到多个数据库，请为每个数据库调用 `MikroOrmModule.forRoot()` 一次，并为每个连接提供唯一的 `contextName`。在此设置中，请在每个连接上将 `registerRequestContext` 设置为 `false`，因为默认中间件仅适用于单个、未命名的连接。相反，只导入 `MikroOrmModule.forMiddleware()` 一次。其中间件会创建一个覆盖所有连接的请求上下文：

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

> 警告 **注意** 如果您使用 `MikroOrmModule.forRootAsync()`，请将 `contextName` 放在 `useFactory` 旁边，而不是放在工厂返回的选项对象内部。

在此设置中，将上下文名称传递给 `forFeature()` 方法和 `@InjectRepository()` 装饰器：

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

在单元测试应用程序时，通常希望避免数据库连接，这可以保持测试套件的独立性和速度。但是，您的类可能依赖于仓储和 `EntityManager`。要解析这些类，请使用 [custom providers](/fundamentals/dependency-injection) 提供模拟实现。

`@mikro-orm/nestjs` 包暴露了一个 `getRepositoryToken()` 函数，该函数根据给定的实体（例如，用于 `Photo` 实体的 `'PhotoRepository'`）返回一个准备好的注入令牌，从而允许您模拟仓储。对于自定义仓储，请使用其类作为令牌：

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

现在，无论此模块中的哪个类使用 `@InjectRepository(Photo)` 装饰器请求 `Photo` 仓储，都会注入 `mockedRepository` 对象。对于 [multiple databases](/data/mikroorm#多个数据库)，请将上下文名称作为第二个参数传递，例如 `getRepositoryToken(Album, 'albums')`。

#### 异步配置

当您需要异步而不是静态地传递模块选项时，请使用 `forRootAsync()` 方法。与大多数动态模块一样，Nest 提供了几种异步配置技术。

一种技术是使用工厂函数。像其他 [factory providers](/fundamentals/dependency-injection#工厂提供者usefactory) 一样，工厂函数可以是 `async`，并且可以通过 `inject` 注入依赖项：

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

> 警告 **警告** 像上面所示，将 `driver` 选项放在 `useFactory` 旁边。模块在调用工厂之前需要知道驱动程序，以便将驱动程序特定的 `EntityManager` 和 `MikroORM` 类注册为注入令牌。如果没有这个选项，从您的驱动程序包注入 `EntityManager` 将因依赖解析错误而失败。

或者，您可以像下面所示，使用类而不是工厂来配置 `MikroOrmModule`：

```typescript
MikroOrmModule.forRootAsync({
  useClass: MikroOrmConfigService,
  driver: SqliteDriver,
});

```

上述构造在 `MikroOrmModule` 内部实例化 `MikroOrmConfigService`，使用它来创建所需的选项对象。在此示例中，`MikroOrmConfigService` 必须实现 `MikroOrmOptionsFactory` 接口，如下所示。`MikroOrmModule` 调用所提供类的实例化对象上的 `createMikroOrmOptions()` 方法。

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

要重用现有的选项提供者而不是在 `MikroOrmModule` 内部创建私有副本，请使用 `useExisting` 语法。提供者必须实现 `MikroOrmOptionsFactory` 接口，并且在 `imports` 中列出的模块必须导出它：

```typescript
MikroOrmModule.forRootAsync({
  imports: [DatabaseConfigModule],
  useExisting: MikroOrmConfigService,
  driver: SqliteDriver,
});

```

#### 应用程序关闭

`MikroOrmModule` 在 `onApplicationShutdown()` 生命周期钩子中关闭 ORM 及其数据库连接，Nest 在您调用 `app.close()` 时调用此钩子。然而，默认情况下，Nest 不监听进程终止信号，例如 `SIGTERM`，因此在进程终止时连接不会关闭。在这种情况下也需要关闭连接，请启用 [shutdown hooks](/fundamentals/lifecycle-events#application-shutdown)：

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

#### 可观测性

[NestJS Observe](https://www.observe.nestjs.com/?ref=docs-mikroorm 'NestJS Observe') 是我们的官方可观测性平台，它在没有任何配置的情况下记录 MikroORM 查询。在 PostgreSQL、MySQL 和 MongoDB 上，SDK 会在底层仪器驱动程序（`pg`、`mysql2` 或 `mongodb`，包括 MikroORM 在版本不一致时安装的嵌套副本），因此每条语句都是在运行它的提供者方法下的一个跨度，其中值已被移除，慢速请求会显示它正在等待哪个查询。MariaDB、SQLite 和 SQL Server 尚未覆盖。请参阅 [Database queries and outbound HTTP](/observability/sdk#database-queries-and-outbound-http)。

<figure><img src="https://www.observe.nestjs.com/docs/telemetry/sql.webp" alt="A query opened in the waterfall" /></figure>

#### 示例

对于使用 NestJS 与 MikroORM 的完整应用程序，请参阅 [nestjs-realworld-example-app](https://github.com/mikro-orm/nestjs-realworld-example-app) 和 [nestjs-example-app](https://github.com/mikro-orm/nestjs-example-app) 仓库。