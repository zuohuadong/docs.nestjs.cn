<!-- 此文件从 content/data/mongo.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T08:12:00.184Z -->
<!-- 源文件: content/data/mongo.md -->
<!-- 源哈希: 06688bce05f7fd155c00b86eb4b08edf -->

### Mongo

Nest 支持两种与 [MongoDB](https://www.mongodb.com/) 数据库集成的方法。你可以使用 [TypeORM chapter](/data/typeorm) 中描述的 [TypeORM](https://github.com/typeorm/typeorm) 模块（它带有 MongoDB 连接器），或者使用 [Mongoose](https://mongoosejs.com)——最流行的 MongoDB 对象建模工具。本章介绍后者，使用专用的 `@nestjs/mongoose` 包。

首先安装所需的依赖：

```bash
$ npm i @nestjs/mongoose mongoose

```

安装过程完成后，将 `MongooseModule` 导入到根 `AppModule` 中：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [MongooseModule.forRoot('mongodb://localhost/nest')],
})
export class AppModule {}

```

`forRoot()` 方法接受与 Mongoose 包中的 `mongoose.connect()` 相同的配置对象，如 [Mongoose connections guide](https://mongoosejs.com/docs/connections.html) 中所述。

#### 模型注入

在 Mongoose 中，一切都派生自 [Schema](https://mongoosejs.com/docs/guide.html)。每个模式映射到一个 MongoDB 集合，并定义该集合中文档的结构。模式用于定义 [Models](https://mongoosejs.com/docs/models.html)。模型负责从底层 MongoDB 数据库创建和读取文档。

你可以使用 NestJS 装饰器创建模式，也可以直接使用 Mongoose 手动创建。使用装饰器创建模式可以大大减少样板代码，并提高整体代码的可读性。

让我们定义 `CatSchema`：

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

> info **提示** 你也可以使用 `DefinitionsFactory` 类（来自 `@nestjs/mongoose` 包）生成原始模式定义。这允许你手动修改根据所提供元数据生成模式定义，这在某些难以用装饰器表示所有内容的边缘情况下非常有用。

`@Schema()` 装饰器将类标记为模式定义。它将 `Cat` 类映射到同名的 MongoDB 集合，但在末尾额外添加一个 "s"，因此最终的集合名称为 `cats`。该装饰器接受一个可选参数，即模式选项对象。可以把它看作你通常作为 `mongoose.Schema` 类构造函数第二个参数传入的对象（例如 `new mongoose.Schema(_, options)`）。要了解有关可用模式选项的更多信息，请参阅 [Mongoose schema options](https://mongoosejs.com/docs/guide.html#选项) 文档。

`@Prop()` 装饰器定义文档中的一个属性。例如，上面的模式定义定义了三个属性：`name`、`age` 和 `breed`。借助 TypeScript 元数据（和反射）能力，这些属性的 [schema types](https://mongoosejs.com/docs/schematypes.html) 会被自动推断。然而，在更复杂的场景中，类型无法被隐式反射（例如数组或嵌套对象结构），你必须显式指明类型，如下所示：

```typescript
@Prop([String])
tags: string[];

```

或者，`@Prop()` 装饰器接受一个选项对象参数（阅读更多关于 [available schema type options](https://mongoosejs.com/docs/schematypes.html#schematype-options) 的内容）。使用它，你可以指明属性是否为必需、指定默认值，或将其标记为不可变。例如：

```typescript
@Prop({ required: true })
name: string;

```

要指定与另一个模型的关系（以便后续填充），也请使用 `@Prop()` 装饰器。例如，如果 `Cat` 有一个 `Owner`，它存储在另一个名为 `owners` 的集合中，那么该属性应具有 `type` 和 `ref` 选项：

```typescript
import mongoose from 'mongoose';
import { Owner } from '../owners/schemas/owner.schema.js';

// inside the class definition
@Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Owner' })
owner: Owner;

```

如果有多个所有者，你的属性配置应如下所示：

```typescript
@Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Owner' }] })
owners: Owner[];

```

如果你不打算总是填充对另一个集合的引用，可以考虑改用 `mongoose.Types.ObjectId` 作为类型：

```typescript
@Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Owner' })
// This ensures the field is not confused with a populated reference
owner: mongoose.Types.ObjectId;

```

然后，当你稍后需要有选择地填充它时，使用指定正确类型的仓储函数：

```typescript
import { Owner } from './schemas/owner.schema.js';

// e.g. inside a service or repository
async findAllPopulated() {
  return this.catModel.find().populate<{ owner: Owner }>("owner");
}

```

> info **提示** 如果没有要填充的外部文档，类型可能是 `Owner | null`，具体取决于你的 [Mongoose configuration](https://mongoosejs.com/docs/populate.html#doc-not-found)。或者，它可能会抛出错误，在这种情况下类型为 `Owner`。

最后，你也可以将**原始**模式定义传递给装饰器。例如，当某个属性表示未定义为类的嵌套对象时，这很有用。为此，使用 `@nestjs/mongoose` 包中的 `raw()` 函数，如下所示：

```typescript
@Prop(raw({
  firstName: { type: String },
  lastName: { type: String }
}))
details: Record<string, any>;

```

或者，如果你更倾向于**不使用装饰器**，可以手动定义模式。例如：

```typescript
export const CatSchema = new mongoose.Schema({
  name: String,
  age: Number,
  breed: String,
});

```

`cat.schema` 文件位于 `cats` 目录中的 `schemas` 文件夹内，`CatsModule` 也在那里定义。虽然你可以将模式文件存储在任意位置，但我们建议将它们存储在相关**领域**对象附近，即相应的模块目录中。

让我们看看 `CatsModule`：

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

`MongooseModule` 提供了 `forFeature()` 方法来配置模块，包括定义哪些模型应在当前作用域中注册。如果还要在其他模块中使用这些模型，请将 `MongooseModule` 添加到 `CatsModule` 的 `exports` 数组中，并在另一个模块中导入 `CatsModule`。

注册模式后，你可以使用 `@InjectModel()` 装饰器将 `Cat` 模型注入到 `CatsService` 中：

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

#### 连接

有时，你可能需要访问原生的 [Mongoose Connection](https://mongoosejs.com/docs/api.html#Connection) 对象，例如，在其上进行原生 API 调用。使用 `@InjectConnection()` 装饰器注入 Mongoose 连接，如下所示：

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

要使用 Mongoose 启动会话，请使用 `@InjectConnection()` 注入数据库连接，而不是直接调用 `mongoose.startSession()`。这会与 Nest 依赖注入系统集成，并确保会话在 Nest 管理的连接上启动。

以下是如何启动会话的示例：

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

在此示例中，`@InjectConnection()` 将 Mongoose 连接注入到服务中。然后你可以调用 `connection.startSession()` 开始一个新会话，并使用它来管理数据库事务，确保跨多个查询的原子操作。启动事务后，请记住根据你的逻辑提交或中止它，并在完成后结束会话。

#### 多个数据库

有些项目需要多个数据库连接，本模块也支持这种情况。要使用多个连接，首先创建这些连接。在这种情况下，为连接命名是**强制性的**。

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

> warning **注意** 不要创建多个没有名称或名称相同的连接，否则它们会相互覆盖。

完成此设置后，你必须告诉 `MongooseModule.forFeature()` 方法要使用哪个连接：

```typescript
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Cat.name, schema: CatSchema }], 'cats'),
  ],
})
export class CatsModule {}

```

你也可以为给定的连接注入 `Connection` 对象：

```typescript
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class CatsService {
  constructor(@InjectConnection('cats') private connection: Connection) {}
}

```

要将给定的 `Connection` 注入到自定义提供者（例如工厂提供者）中，请使用 `getConnectionToken()` 函数，并将连接名称作为参数传入：

```typescript
{
  provide: CatsService,
  useFactory: (catsConnection: Connection) => {
    return new CatsService(catsConnection);
  },
  inject: [getConnectionToken('cats')],
}

```

要从命名连接注入模型，请将连接名称作为第二个参数传给 `@InjectModel()` 装饰器：

```typescript title="cats.service.ts"
@Injectable()
export class CatsService {
  constructor(@InjectModel(Cat.name, 'cats') private catModel: Model<Cat>) {}
}

```

#### 钩子（中间件）

中间件（也称为前置和后置钩子）是在异步函数执行过程中获得控制权的函数。中间件在模式级别指定，对于编写插件很有用（参见 [Mongoose middleware documentation](https://mongoosejs.com/docs/middleware.html)）。在 Mongoose 中，编译模型后调用 `pre()` 或 `post()` 不起作用。要在模型注册**之前**注册钩子，请使用 `MongooseModule` 的 `forFeatureAsync()` 方法以及工厂提供者（即 `useFactory`）。通过这种技术，你可以访问模式对象，然后使用其 `pre()` 或 `post()` 方法在该模式上注册钩子。例如：

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

与其他 [factory providers](/fundamentals/dependency-injection#工厂提供者usefactory) 一样，工厂函数可以是 `async`，并且可以通过 `inject` 注入依赖项。

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

要一次性为所有模式注册插件，请调用 `Connection` 对象的 `.plugin()` 方法。你必须在创建模型之前访问连接；为此，请使用 `connectionFactory` 选项：

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

#### 鉴别器

[Discriminators](https://mongoosejs.com/docs/discriminators.html) 是一种模式继承机制。它们使你能够在同一个底层 MongoDB 集合上拥有多个具有重叠模式的模型。

假设你想在单个集合中跟踪不同类型的事件。每个事件都有一个时间戳。

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

> info **提示** Mongoose 通过“鉴别器键”来区分鉴别器模型，默认情况下该键为 `__t`。Mongoose 会向你的模式添加一个名为 `__t` 的 String 路径，并使用它来跟踪文档是哪个鉴别器的实例。
> 你也可以使用 `discriminatorKey` 选项来定义用于鉴别的路径。

`SignUpEvent` 和 `ClickedLinkEvent` 实例将与通用事件存储在同一个集合中。

现在，让我们定义 `ClickedLinkEvent` 类，如下所示：

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

完成这些后，使用 `discriminators` 选项为给定模式注册鉴别器。它同时适用于 `MongooseModule.forFeature()` 和 `MongooseModule.forFeatureAsync()`：

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

在对应用程序进行单元测试时，你通常希望避免任何数据库连接，这会使测试套件的设置更简单、执行更快。但是，你的类可能依赖于从连接实例中获取的模型。要解析这些类，请创建模拟模型。

为了简化这一过程，`@nestjs/mongoose` 包公开了一个 `getModelToken()` 函数，该函数会根据模型名称返回一个准备好的 [injection token](/fundamentals/dependency-injection#di-fundamentals)。使用这个令牌，你可以使用任何标准的 [custom provider](/fundamentals/dependency-injection) 技术来提供模拟实现，包括 `useClass`、`useValue` 和 `useFactory`。例如：

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

在此示例中，只要任何消费者使用 `@InjectModel()` 装饰器注入 `Model<Cat>`，就会提供一个硬编码的 `catModel`（对象实例）。

<app-banner-courses></app-banner-courses>

#### 异步配置

当你需要异步而不是静态地传递模块选项时，请使用 `forRootAsync()` 方法。与大多数动态模块一样，Nest 提供了多种异步配置技术。

一种技术是使用工厂函数：

```typescript
MongooseModule.forRootAsync({
  useFactory: () => ({
    uri: 'mongodb://localhost/nest',
  }),
});

```

与其他 [factory providers](/fundamentals/dependency-injection#工厂提供者usefactory) 一样，工厂函数可以是 `async`，并且可以通过 `inject` 注入依赖项。

```typescript
MongooseModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    uri: configService.get<string>('MONGODB_URI'),
  }),
  inject: [ConfigService],
});

```

或者，你可以使用类而不是工厂来配置 `MongooseModule`，如下所示：

```typescript
MongooseModule.forRootAsync({
  useClass: MongooseConfigService,
});

```

上述构造会在 `MongooseModule` 内实例化 `MongooseConfigService`，并使用它来创建所需的选项对象。在此示例中，`MongooseConfigService` 必须实现 `MongooseOptionsFactory` 接口，如下所示。`MongooseModule` 会调用所提供类的实例对象上的 `createMongooseOptions()` 方法。

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

要重用现有的选项提供者，而不是在 `MongooseModule` 内创建私有副本，请使用 `useExisting` 语法。该提供者必须实现 `MongooseOptionsFactory` 接口：

```typescript
MongooseModule.forRootAsync({
  imports: [ConfigModule],
  useExisting: ConfigService,
});

```

#### 连接事件

你可以使用 `onConnectionCreate` 配置选项监听 Mongoose [connection events](https://mongoosejs.com/docs/connections.html#connection-events)。Nest 会在每个连接创建后、打开之前立即调用此函数，因此你可以为 `connected`、`open`、`disconnected`、`reconnected` 和 `disconnecting` 事件注册监听器，如下所示：

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

此代码片段建立了到位于 `mongodb://localhost/test` 的 MongoDB 数据库的连接。`onConnectionCreate` 选项设置了用于监控连接状态的事件监听器：

- `connected`：连接成功建立时触发。
- `open`：连接完全打开并准备好进行操作时触发。
- `disconnected`：连接丢失时调用。
- `reconnected`：断开连接后重新建立连接时调用。
- `disconnecting`：连接正在关闭时发生。

你也可以在通过 `MongooseModule.forRootAsync()` 创建的异步配置中使用 `onConnectionCreate` 属性：

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

要在父文档中嵌套子文档，请按如下方式定义你的模式：

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

然后在父模式中引用该子文档：

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

要包含多个子文档，请使用子文档数组。请确保相应地覆盖该属性的类型：

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

在 Mongoose 中，**虚拟属性**（virtual）是存在于文档上但不会持久化到 MongoDB 的属性。相反，它会在每次被访问时动态计算。虚拟属性通常用于派生值或计算值，例如组合字段（比如通过拼接 `firstName` 和 `lastName` 来创建 `fullName` 属性），或者用于创建依赖于文档中已有数据的属性。

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

> info **提示** `@Virtual()` 装饰器是从 `@nestjs/mongoose` 包中导入的。

在此示例中，`fullName` 虚拟属性由 `firstName` 和 `lastName` 派生而来。尽管它在被访问时表现得像普通属性一样，但它永远不会被保存到 MongoDB 文档中。

#### 示例

一个可运行的示例可在 [nestjs/nest repository](https://github.com/nestjs/nest/tree/master/sample/06-mongoose) 中找到。