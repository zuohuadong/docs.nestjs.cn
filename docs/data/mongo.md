<!-- 此文件从 content/data/mongo.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:33:02.340Z -->
<!-- 源文件: content/data/mongo.md -->
<!-- 源哈希: fb1497ec026b065b642703e769a36065 -->

### Mongo

Nest 支持两种方法与 [MongoDB](https://www.mongodb.com/) 数据库集成。您可以使用 [TypeORM chapter](/recipes/sql-typeorm) 中描述的具有 MongoDB 连接器的 [TypeORM](https://github.com/typeorm/typeorm) 模块，或者使用 [Mongoose](https://mongoosejs.com)，这是最流行的 MongoDB 对象建模工具。本章描述后者，使用专用的 `@nestjs/mongoose` 包。

> info **提示** 对于带有验证 ID、重复键错误、游标分页和永不丢失的更新的完整 CRUD REST API，请遵循 [Build a CRUD REST API with Node.js and MongoDB](/tutorials/mongodb-crud-api)。

首先安装所需的依赖项：

```bash
$ npm i @nestjs/mongoose mongoose

```

安装过程完成后，将 `MongooseModule` 导入到根 `AppModule`：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [MongooseModule.forRoot('mongodb://localhost/nest')],
})
export class AppModule {}

```

`forRoot()` 方法接受与 Mongoose 包中 [Mongoose connections guide](https://mongoosejs.com/docs/connections.html) 描述的 `mongoose.connect()` 相同的配置对象。

#### 模型注入

使用 Mongoose 时，一切都源于一个 [Schema](https://mongoosejs.com/docs/guide.html)。每个模式映射到一个 MongoDB 集合，并定义了该集合中文档的形状。模式用于定义 [Models](https://mongoosejs.com/docs/models.html)。模型负责从底层 MongoDB 数据库创建和读取文档。

您可以使用 NestJS 装饰器创建模式，也可以使用 Mongoose 本身手动创建。使用装饰器创建模式可以大大减少样板代码并提高整体代码可读性。

我们来定义 `CatSchema`：

```typescript title="schemas/cat.schema.ts"
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CatDocument = HydratedDocument<Cat>;

@Schema()
export class Cat {
  @Prop()
  name: string;

  @Prop()
  age: number;

  @Prop()
  breed: string;
}

export const CatSchema = SchemaFactory.createForClass(Cat);

```

> info **提示** 您也可以使用 `DefinitionsFactory` 类（来自 `@nestjs/mongoose` 包）生成原始模式定义。这允许您手动修改从您提供的元数据生成的模式定义，这对于使用装饰器难以表示的所有边缘情况非常有用。

`@Schema()` 装饰器将一个类标记为模式定义。它将 `Cat` 类映射到同名的 MongoDB 集合，但末尾会额外添加一个 "s"，因此最终的集合名称是 `cats`。此装饰器接受一个可选的单个参数，即模式选项对象。可以将其视为您通常作为 `mongoose.Schema` 类构造函数第二个参数传递的对象（例如 `new mongoose.Schema(_, options)`）。要了解有关可用模式选项的更多信息，请参阅 [Mongoose schema options](https://mongoosejs.com/docs/guide.html#选项) 文档。

`@Prop()` 装饰器定义文档中的一个属性。例如，上述模式定义了三个属性：`name`、`age` 和 `breed`。由于 TypeScript 元数据（和反射）的能力，这些属性的 [schema types](https://mongoosejs.com/docs/schematypes.html) 会自动推断出来。然而，在类型无法隐式反射的更复杂场景中（例如数组或嵌套对象结构），您必须像下面这样明确指定类型：

```typescript
@Prop([String])
tags: string[];

```

或者，`@Prop()` 装饰器接受一个选项对象参数（有关 [available schema type options](https://mongoosejs.com/docs/schematypes.html#schematype-options) 的更多信息请阅读）。使用它，您可以指定属性是否必需、指定默认值或将其标记为不可变。例如：

```typescript
@Prop({ required: true })
name: string;

```

要指定与其他模型的关联（以便稍后填充），也使用 `@Prop()` 装饰器。例如，如果 `Cat` 有一个存储在名为 `owners` 的不同集合中的 `Owner`，则该属性应具有 `type` 和 `ref` 选项：

```typescript
import mongoose from 'mongoose';
import { Owner } from '../owners/schemas/owner.schema.js';

// inside the class definition
@Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Owner' })
owner: Owner;

```

如果有多个所有者，您的属性配置应如下所示：

```typescript
@Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Owner' }] })
owners: Owner[];

```

如果您不打算始终填充到另一个集合的引用，请考虑使用 `mongoose.Types.ObjectId` 作为类型：

```typescript
@Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Owner' })
// This ensures the field is not confused with a populated reference
owner: mongoose.Types.ObjectId;

```

然后，当您需要稍后选择性地填充它时，请使用指定正确类型的仓储函数：

```typescript
import { Owner } from './schemas/owner.schema.js';

// e.g. inside a service or repository
async findAllPopulated() {
  return this.catModel.find().populate<{ owner: Owner }>("owner");
}

```

> info **提示** 如果没有外键文档需要填充，则类型可以是 `Owner | null`，这取决于您的 [Mongoose configuration](https://mongoosejs.com/docs/populate.html#doc-not-found)。或者，它可能会抛出错误，在这种情况下类型是 `Owner`。

最后，您也可以将**原始**模式定义传递给装饰器。当例如某个属性代表一个未定义为类的嵌套对象时，这非常有用。为此，请使用来自 `@nestjs/mongoose` 包的 `raw()` 函数，如下所示：

```typescript
@Prop(raw({
  firstName: { type: String },
  lastName: { type: String }
}))
details: Record<string, any>;

```

或者，如果您**不使用装饰器**，可以手动定义模式。例如：

```typescript
export const CatSchema = new mongoose.Schema({
  name: String,
  age: Number,
  breed: String,
});

```

`cat.schema` 文件位于 `cats` 目录下的 `schemas` 文件夹中，其中也定义了 `CatsModule`。虽然您可以将模式文件存储在任何您喜欢的位置，但我们建议将其存储在其相关的**领域**对象附近，在适当的模块目录中。

我们来看一下 `CatsModule`：

```typescript title="cats.module.ts"
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CatsController } from './cats.controller.js';
import { CatsService } from './cats.service.js';
import { Cat, CatSchema } from './schemas/cat.schema.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: Cat.name, schema: CatSchema }])],
  controllers: [CatsController],
  providers: [CatsService],
})
export class CatsModule {}

```

`MongooseModule` 提供 `forFeature()` 方法来配置模块，包括定义应在当前作用域中注册哪些模型。要将模型用在另一个模块中，请将 `MongooseModule` 添加到 `exports` 数组的 `CatsModule` 中，并在另一个模块中导入 `CatsModule`。

注册模式后，您可以使用 `@InjectModel()` 装饰器将 `Cat` 模型注入到 `CatsService` 中：

```typescript title="cats.service.ts"
import { Model } from 'mongoose';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cat } from './schemas/cat.schema.js';
import { CreateCatDto } from './dto/create-cat.dto.js';

@Injectable()
export class CatsService {
  constructor(@InjectModel(Cat.name) private catModel: Model<Cat>) {}

  async create(createCatDto: CreateCatDto): Promise<Cat> {
    const createdCat = new this.catModel(createCatDto);
    return createdCat.save();
  }

  async findAll(): Promise<Cat[]> {
    return this.catModel.find().exec();
  }
}

```

#### 等待索引

当 Mongoose 编译模型时，它会在后台创建模型的集合并构建其模式声明的索引。Nest 不会等待该工作完成：在唯一索引存在之前应用程序就可以响应请求，并且构建失败（例如集合已包含重复项）的情况不会被察觉。应用程序仍然启动，并接受索引本应拒绝的重复项。要使每个模型提供者在解析前等待 `model.init()`，请设置 `waitForModelInit`（在 `@nestjs/mongoose` 12.0.2 及更高版本中可用）：

```typescript
@Module({
  imports: [MongooseModule.forRoot('mongodb://localhost/nest', { waitForModelInit: true })],
})
export class AppModule {}

```

使用 `forRootAsync()`，从工厂返回选项，紧邻 `uri`。启用此选项后，注入的模型已经拥有其集合和索引，并且失败的 `init()` 会以 MongoDB 错误（唯一索引下的重复键（`E11000`）、冲突的索引选项或创建索引的权限缺失）导致应用程序启动失败。启动也会等待构建本身，因此大型集合上的新索引会延迟启动。

此选项也可以在单个模型上设置，在 `forFeature()` 或 `forFeatureAsync()` 条目中，其中它会覆盖连接中的设置，无论方向如何。模型的判别器会遵循此设置：

```typescript
MongooseModule.forFeature([{ name: Cat.name, schema: CatSchema, waitForModelInit: true }]),

```

> info **提示** 当连接尚未打开时，会跳过等待，就像 `lazyConnection: true` 一样。使用 `autoIndex: false`，`model.init()` 不会构建索引，因此没有需要等待的。在生产环境中，通常有发布步骤来构建它们，请使用 `Model.diffIndexes()` 检查是否有遗漏。

#### 连接

有时您需要访问原生的 [Mongoose Connection](https://mongoosejs.com/docs/api.html#Connection) 对象，例如在其上执行原生 API 调用。像下面这样使用 `@InjectConnection()` 装饰器注入 Mongoose 连接：

```typescript
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class CatsService {
  constructor(@InjectConnection() private connection: Connection) {}
}

```

#### 会话

要使用 Mongoose 启动会话，请使用 `@InjectConnection()` 注入数据库连接，而不是直接调用 `mongoose.startSession()`。这与 Nest 的依赖注入系统集成，并确保会话在 Nest 管理的连接上启动。

以下是启动会话的示例：

```typescript
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class CatsService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async startTransaction() {
    const session = await this.connection.startSession();
    session.startTransaction();
    // Your transaction logic here
  }
}

```

在此示例中，`@InjectConnection()` 将 Mongoose 连接注入到服务中。然后您可以调用 `connection.startSession()` 来开始一个新的会话，并使用它来管理数据库事务，确保跨多个查询的原子操作。开始事务后，请根据您的逻辑记住提交或中止它，并在完成后结束会话。

#### 多个数据库

某些项目需要多个数据库连接，本模块也支持此功能。要处理多个连接，首先创建这些连接。在这种情况下，**必须**为连接命名。

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forRoot('mongodb://localhost/test', {
      connectionName: 'cats',
    }),
    MongooseModule.forRoot('mongodb://localhost/users', {
      connectionName: 'users',
    }),
  ],
})
export class AppModule {}

```

> warning **注意** 不要创建没有名称或名称相同的多个连接，否则它们会相互覆盖。

使用此设置，您必须告诉 `MongooseModule.forFeature()` 方法使用哪个连接：

```typescript
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Cat.name, schema: CatSchema }], 'cats'),
  ],
})
export class CatsModule {}

```

您也可以为给定连接注入 `Connection` 对象：

```typescript
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class CatsService {
  constructor(@InjectConnection('cats') private connection: Connection) {}
}

```

要将给定的 `Connection` 注入到自定义提供者中（例如，工厂提供者），请使用 `getConnectionToken()` 函数，并将连接名称作为参数传递：

```typescript
{
  provide: CatsService,
  useFactory: (catsConnection: Connection) => {
    return new CatsService(catsConnection);
  },
  inject: [getConnectionToken('cats')],
}

```

要从命名连接中注入模型，请将连接名称作为 `@InjectModel()` 装饰器的第二个参数传递：

```typescript title="cats.service.ts"
@Injectable()
export class CatsService {
  constructor(@InjectModel(Cat.name, 'cats') private catModel: Model<Cat>) {}
}

```

#### 钩子（中间件）

中间件（也称为预钩子和后钩子）是传递控制权给异步函数执行过程的函数。中间件在模式级别指定，可用于编写插件（参见 [Mongoose middleware documentation](https://mongoosejs.com/docs/middleware.html)）。在编译模型后调用 `pre()` 或 `post()` 在 Mongoose 中无效。要在模型注册**之前**注册钩子，请使用 `MongooseModule` 的 `forFeatureAsync()` 方法，并结合工厂提供者（即 `useFactory`）。通过此技术，您可以访问模式对象，然后使用其 `pre()` 或 `post()` 方法在该模式上注册钩子。例如：

```typescript
@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      {
        name: Cat.name,
        useFactory: () => {
          const schema = CatSchema;
          schema.pre('save', function () {
            console.log('Hello from pre save');
          });
          return schema;
        },
      },
    ]),
  ],
})
export class AppModule {}

```

与其他 [factory providers](/fundamentals/dependency-injection#工厂提供者usefactory) 一样，工厂函数可以是 `async` 并且可以通过 `inject` 注入依赖项。

```typescript
@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      {
        name: Cat.name,
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => {
          const schema = CatSchema;
          schema.pre('save', function() {
            console.log(
              `${configService.get('APP_NAME')}: Hello from pre save`,
            );
          });
          return schema;
        },
        inject: [ConfigService],
      },
    ]),
  ],
})
export class AppModule {}

```

#### 插件

要为给定模式注册 [plugin](https://mongoosejs.com/docs/plugins.html)，请使用 `forFeatureAsync()` 方法：

```typescript
import autopopulate from 'mongoose-autopopulate';

@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      {
        name: Cat.name,
        useFactory: () => {
          const schema = CatSchema;
          schema.plugin(autopopulate);
          return schema;
        },
      },
    ]),
  ],
})
export class AppModule {}

```

要一次性为所有模式注册插件，请调用 `Connection` 对象的 `.plugin()` 方法。您必须在模型创建之前访问连接；为此，请使用 `connectionFactory` 选项：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import autopopulate from 'mongoose-autopopulate';

@Module({
  imports: [
    MongooseModule.forRoot('mongodb://localhost/test', {
      connectionFactory: (connection) => {
        connection.plugin(autopopulate);
        return connection;
      }
    }),
  ],
})
export class AppModule {}

```

#### 判别器

[Discriminators](https://mongoosejs.com/docs/discriminators.html) 是一种模式继承机制。它允许您在同一底层 MongoDB 集合上拥有具有重叠模式的多个模型。

假设您想在一个集合中跟踪不同类型的事件。每个事件都有一个时间戳。

```typescript title="event.schema.ts"
@Schema({ discriminatorKey: 'kind' })
export class Event {
  @Prop({
    type: String,
    required: true,
    enum: [ClickedLinkEvent.name, SignUpEvent.name],
  })
  kind: string;

  @Prop({ type: Date, required: true })
  time: Date;
}

export const EventSchema = SchemaFactory.createForClass(Event);

```

> info **提示** Mongoose 通过“判别器键”区分判别器模型，默认是 `__t`。Mongoose 会向您的模式添加一个名为 `__t` 的字符串路径，并使用它来跟踪文档是哪个判别器的实例。
> 您也可以使用 `discriminatorKey` 选项来定义判别路径。

`SignUpEvent` 和 `ClickedLinkEvent` 实例将存储在与通用事件相同的集合中。

现在，我们像下面这样定义 `ClickedLinkEvent` 类：

```typescript title="click-link-event.schema.ts"
@Schema()
export class ClickedLinkEvent {
  kind: string;
  time: Date;

  @Prop({ type: String, required: true })
  url: string;
}

export const ClickedLinkEventSchema = SchemaFactory.createForClass(ClickedLinkEvent);

```

以及 `SignUpEvent` 类：

```typescript title="sign-up-event.schema.ts"
@Schema()
export class SignUpEvent {
  kind: string;
  time: Date;

  @Prop({ type: String, required: true })
  user: string;
}

export const SignUpEventSchema = SchemaFactory.createForClass(SignUpEvent);

```

有了这些设置，请使用 `discriminators` 选项为给定模式注册判别器。它与 `MongooseModule.forFeature()` 和 `MongooseModule.forFeatureAsync()` 都兼容：

```typescript title="event.module.ts"
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Event.name,
        schema: EventSchema,
        discriminators: [
          { name: ClickedLinkEvent.name, schema: ClickedLinkEventSchema },
          { name: SignUpEvent.name, schema: SignUpEventSchema },
        ],
      },
    ]),
  ]
})
export class EventsModule {}

```

#### 测试

在单元测试应用程序时，通常希望避免任何数据库连接，这样可以使测试套件更容易设置和执行更快。但是，您的类可能依赖于从连接实例中拉取的模型。要解析这些类，请创建模拟模型。

为了使此过程更简单，`@nestjs/mongoose` 包提供了一个 `getModelToken()` 函数，该函数根据模型名称返回一个准备好的 [injection token](/fundamentals/dependency-injection#di-fundamentals)。使用此令牌，您可以使用任何标准的 [custom provider](/fundamentals/dependency-injection) 技术提供模拟实现，包括 `useClass`、`useValue` 和 `useFactory`。例如：

```typescript
@Module({
  providers: [
    CatsService,
    {
      provide: getModelToken(Cat.name),
      useValue: catModel,
    },
  ],
})
export class CatsModule {}

```

在此示例中，每当任何消费者使用 `@InjectModel()` 装饰器注入 `Model<Cat>` 时，都会提供硬编码的 `catModel`（对象实例）。

<app-banner-courses></app-banner-courses>

#### 异步配置

当您需要异步而不是静态地传递模块选项时，请使用 `forRootAsync()` 方法。与大多数动态模块一样，Nest 提供了几种异步配置技术。

一种技术是使用工厂函数：

```typescript
MongooseModule.forRootAsync({
  useFactory: () => ({
    uri: 'mongodb://localhost/nest',
  }),
});

```

与其他 [factory providers](/fundamentals/dependency-injection#工厂提供者usefactory) 一样，工厂函数可以是 `async` 并且可以通过 `inject` 注入依赖项。

```typescript
MongooseModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    uri: configService.get<string>('MONGODB_URI'),
  }),
  inject: [ConfigService],
});

```

或者，您可以像下面所示使用类而不是工厂来配置 `MongooseModule`：

```typescript
MongooseModule.forRootAsync({
  useClass: MongooseConfigService,
});

```

上述构造在 `MongooseModule` 内部实例化了 `MongooseConfigService`，使用它来创建所需的选项对象。在此示例中，`MongooseConfigService` 必须实现 `MongooseOptionsFactory` 接口，如下所示。`MongooseModule` 调用所提供类实例化对象上的 `createMongooseOptions()` 方法。

```typescript
@Injectable()
export class MongooseConfigService implements MongooseOptionsFactory {
  createMongooseOptions(): MongooseModuleOptions {
    return {
      uri: 'mongodb://localhost/nest',
    };
  }
}

```

要重用现有的选项提供者而不是在 `MongooseModule` 内部创建私有副本，请使用 `useExisting` 语法。该提供者必须实现 `MongooseOptionsFactory` 接口：

```typescript
MongooseModule.forRootAsync({
  imports: [ConfigModule],
  useExisting: ConfigService,
});

```

#### 连接事件

您可以使用 `onConnectionCreate` 配置选项监听 Mongoose [connection events](https://mongoosejs.com/docs/connections.html#connection-events)。Nest 在连接创建后、打开前，会使用此函数通知每个连接，因此您可以注册对 `connected`、`open`、`disconnected`、`reconnected` 和 `disconnecting` 事件的监听器，如下所示：

```typescript
MongooseModule.forRoot('mongodb://localhost/test', {
  onConnectionCreate: (connection: Connection) => {
    connection.on('connected', () => console.log('connected'));
    connection.on('open', () => console.log('open'));
    connection.on('disconnected', () => console.log('disconnected'));
    connection.on('reconnected', () => console.log('reconnected'));
    connection.on('disconnecting', () => console.log('disconnecting'));

    return connection;
  },
}),

```

此代码片段在 `mongodb://localhost/test` 建立了到 MongoDB 数据库的连接。`onConnectionCreate` 选项设置了事件监听器，用于监控连接状态：

- `connected`：连接成功建立时触发。
- `open`：连接完全打开并准备好进行操作时触发。
- `disconnected`：连接丢失时调用。
- `reconnected`：连接断开后重新建立连接时调用。
- `disconnecting`：连接正在关闭过程中时发生。

您也可以在使用 `MongooseModule.forRootAsync()` 创建的异步配置中使用 `onConnectionCreate` 属性：

```typescript
MongooseModule.forRootAsync({
  useFactory: () => ({
    uri: 'mongodb://localhost/test',
    onConnectionCreate: (connection: Connection) => {
      // Register event listeners here
      return connection;
    },
  }),
}),

```

#### 子文档

要在父文档中嵌套子文档，请按如下方式定义您的模式：

```typescript title="name.schema.ts"
@Schema()
export class Name {
  @Prop()
  firstName: string;

  @Prop()
  lastName: string;
}

export const NameSchema = SchemaFactory.createForClass(Name);

```

然后在父模式中引用子文档：

```typescript title="person.schema.ts"
@Schema()
export class Person {
  @Prop(NameSchema)
  name: Name;
}

export const PersonSchema = SchemaFactory.createForClass(Person);

export type PersonDocumentOverride = {
  name: Types.Subdocument<Types.ObjectId> & Name;
};

export type PersonDocument = HydratedDocument<Person, PersonDocumentOverride>;

```

要包含多个子文档，请使用子文档数组。请相应地覆盖属性的类型：

```typescript title="person.schema.ts"
@Schema()
export class Person {
  @Prop([NameSchema])
  name: Name[];
}

export const PersonSchema = SchemaFactory.createForClass(Person);

export type PersonDocumentOverride = {
  name: Types.DocumentArray<Name>;
};

export type PersonDocument = HydratedDocument<Person, PersonDocumentOverride>;

```

#### 虚拟属性

在 Mongoose 中，**虚拟属性** 是文档上存在但不会持久化到 MongoDB 的属性。相反，每当访问它时，它都会动态计算。虚拟属性通常用于派生或计算值，例如通过连接 `firstName` 和 `lastName` 创建一个 `fullName` 属性，或者用于创建依赖于文档中现有数据的属性。

```ts
class Person {
  @Prop()
  firstName: string;

  @Prop()
  lastName: string;

  @Virtual({
    get: function (this: Person) {
      return `${this.firstName} ${this.lastName}`;
    },
  })
  fullName: string;
}

```

> info **提示** `@Virtual()` 装饰器是从 `@nestjs/mongoose` 包导入的。

在此示例中，`fullName` 虚拟属性是从 `firstName` 和 `lastName` 派生的。尽管在访问时它表现得像一个普通属性，但它绝不会被保存到 MongoDB 文档中。

#### 可观测性

[NestJS Observe](https://www.observe.nestjs.com/?ref=docs-mongo 'NestJS Observe') 是我们的官方可观测性平台，它在没有任何配置的情况下记录 Mongoose 查询。SDK 在 Mongoose 底层（包括 Mongoose 在版本不一致时安装的嵌套副本）对 `mongodb` 驱动进行了仪器化，因此每个命令都会显示为运行它的提供者方法的一个 span，慢速请求会显示它正在等待哪个查询。请参阅 [Database queries and outbound HTTP](/observability/sdk#database-queries-and-outbound-http)。

#### 示例

一个可工作的示例可在 [nestjs/nest repository](https://github.com/nestjs/nest/tree/master/sample/06-mongoose) 中找到。