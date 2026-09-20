<!-- 此文件从 content/techniques/mongo.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T08:37:22.522Z -->
<!-- 源文件: content/techniques/mongo.md -->
<!-- 源哈希: 8699fe7a000362e226a0c78896e9f02a -->

### Mongo

Nest 支持两种方式与 [MongoDB](https://www.mongodb.com/) 数据库集成。你可以使用 [here](/techniques/sql) 中描述的内置 [TypeORM](https://github.com/typeorm/typeorm) 模块（该模块带有 MongoDB 连接器），或者使用 [Mongoose](https://mongoosejs.com)（最流行的 MongoDB 对象建模工具）。在本章中，我们将介绍后者，使用专用的 `@nestjs/mongoose` 包。

首先安装 [required dependencies](https://github.com/Automattic/mongoose)：

```bash
$ npm i @nestjs/mongoose mongoose

```

安装过程完成后，我们可以将 `MongooseModule` 导入到根 `AppModule` 中。

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [MongooseModule.forRoot('mongodb://localhost/nest')],
})
export class AppModule {}

```

`forRoot()` 方法接受与 Mongoose 包中的 `mongoose.connect()` 相同的配置对象，如 [here](https://mongoosejs.com/docs/connections.html) 所述。

#### 模型注入

使用 Mongoose 时，一切都源自于 [Schema](http://mongoosejs.com/docs/guide.html)。每个模式映射到一个 MongoDB 集合，并定义该集合中文档的形状。模式用于定义 [Models](https://mongoosejs.com/docs/models.html)。模型负责从底层 MongoDB 数据库中创建和读取文档。

模式可以使用 NestJS 装饰器创建，也可以手动使用 Mongoose 本身创建。使用装饰器创建模式可以大大减少样板代码，并提高整体代码可读性。

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

> info **提示** 请注意，你也可以使用 `DefinitionsFactory` 类（来自 `nestjs/mongoose`）生成原始模式定义。这允许你手动修改基于所提供的元数据生成的模式定义。这对于某些难以用装饰器表示所有内容的边缘情况非常有用。

`@Schema()` 装饰器将一个类标记为模式定义。它将我们的 `Cat` 类映射到同名的 MongoDB 集合，但末尾会额外添加一个 "s" - 因此最终的 mongo 集合名称将是 `cats`。该装饰器接受一个可选参数，即模式选项对象。可以将其视为通常作为 `mongoose.Schema` 类构造函数第二个参数传递的对象（例如，`new mongoose.Schema(_, options)`）。要了解更多可用的模式选项，请参阅 [this](https://mongoosejs.com/docs/guide.html#选项) 章节。

`@Prop()` 装饰器定义文档中的属性。例如，在上面的模式定义中，我们定义了三个属性：`name`、`age` 和 `breed`。这些属性的 [schema types](https://mongoosejs.com/docs/schematypes.html) 借助 TypeScript 元数据（和反射）能力自动推断。然而，在无法隐式反映类型的更复杂场景中（例如，数组或嵌套对象结构），必须显式指定类型，如下所示：

```typescript
@Prop([String])
tags: string[];

```

或者，`@Prop()` 装饰器接受一个选项对象参数（关于可用选项的 [read more](https://mongoosejs.com/docs/schematypes.html#schematype-options)）。这样，你可以指示属性是否为必填、指定默认值，或将其标记为不可变。例如：

```typescript
@Prop({ required: true })
name: string;

```

如果你想指定与其他模型的关系，以便后续进行填充，你也可以使用 `@Prop()` 装饰器。例如，如果 `Cat` 有一个存储在名为 `owners` 的不同集合中的 `Owner`，则该属性应具有类型和引用。例如：

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

如果你不打算总是填充对另一个集合的引用，请考虑改用 `mongoose.Types.ObjectId` 作为类型：

```typescript
@Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Owner' })
// This ensures the field is not confused with a populated reference
owner: mongoose.Types.ObjectId;

```

然后，当你需要稍后有选择地填充它时，可以使用指定正确类型的仓储函数：

```typescript
import { Owner } from './schemas/owner.schema.js';

// e.g. inside a service or repository
async findAllPopulated() {
  return this.catModel.find().populate<{ owner: Owner }>("owner");
}

```

> info **提示** 如果没有外部文档可填充，则类型可能是 `Owner | null`，具体取决于你的 [Mongoose configuration](https://mongoosejs.com/docs/populate.html#doc-not-found)。或者，它可能会抛出错误，在这种情况下类型将是 `Owner`。

最后，**原始**模式定义也可以传递给装饰器。例如，当属性表示一个未定义为类的嵌套对象时，这非常有用。为此，使用 `@nestjs/mongoose` 包中的 `raw()` 函数，如下所示：

```typescript
@Prop(raw({
  firstName: { type: String },
  lastName: { type: String }
}))
details: Record<string, any>;

```

或者，如果你更喜欢**不使用装饰器**，也可以手动定义模式。例如：

```typescript
export const CatSchema = new mongoose.Schema({
  name: String,
  age: Number,
  breed: String,
});

```

`cat.schema` 文件位于 `cats` 目录下的一个文件夹中，我们也在那里定义 `CatsModule`。虽然你可以将模式文件存储在任何你喜欢的位置，但我们建议将它们存储在其相关的**领域**对象附近，放在相应的模块目录中。

让我们看一下 `CatsModule`：

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

`MongooseModule` 提供 `forFeature()` 方法来配置模块，包括定义哪些模型应在当前作用域中注册。如果你还想在另一个模块中使用这些模型，请将 MongooseModule 添加到 `CatsModule` 的 `exports` 部分，并在另一个模块中导入 `CatsModule`。

一旦你注册了模式，就可以使用 `@InjectModel()` 装饰器将 `Cat` 模型注入到 `CatsService` 中：

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

有时你可能需要访问原生的 [Mongoose Connection](https://mongoosejs.com/docs/api.html#Connection) 对象。例如，你可能希望在连接对象上进行原生 API 调用。你可以使用 `@InjectConnection()` 装饰器注入 Mongoose 连接，如下所示：

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

要使用 Mongoose 启动会话，建议使用 `@InjectConnection` 注入数据库连接，而不是直接调用 `mongoose.startSession()`。这种方法可以更好地与 NestJS 依赖注入系统集成，确保正确的连接管理。

以下是一个如何启动会话的示例：

```typescript
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

在此示例中，`@InjectConnection()` 用于将 Mongoose 连接注入到服务中。一旦注入了连接，就可以使用 `connection.startSession()` 开始新会话。此会话可用于管理数据库事务，确保跨多个查询的原子操作。启动会话后，请记得根据你的逻辑提交或中止事务。

#### 多数据库

某些项目需要多个数据库连接。此模块也可以实现这一点。要使用多个连接，首先创建连接。在这种情况下，连接命名变得**强制**。

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

> warning **注意** 请注意，你不应该拥有多个未命名或同名的连接，否则它们将被覆盖。

通过此设置，你必须告诉 `MongooseModule.forFeature()` 函数应使用哪个连接。

```typescript
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Cat.name, schema: CatSchema }], 'cats'),
  ],
})
export class CatsModule {}

```

你还可以为给定的连接注入 `Connection`：

```typescript
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class CatsService {
  constructor(@InjectConnection('cats') private connection: Connection) {}
}

```

要将给定的 `Connection` 注入到自定义提供者（例如，工厂提供者），请使用 `getConnectionToken()` 函数并将连接名称作为参数传递。

```typescript
{
  provide: CatsService,
  useFactory: (catsConnection: Connection) => {
    return new CatsService(catsConnection);
  },
  inject: [getConnectionToken('cats')],
}

```

如果你只是想从命名数据库注入模型，可以将连接名称作为第二个参数传递给 `@InjectModel()` 装饰器。

```typescript title="cats.service.ts"
@Injectable()
export class CatsService {
  constructor(@InjectModel(Cat.name, 'cats') private catModel: Model<Cat>) {}
}

```

#### 钩子（中间件）

中间件（也称为前置和后置钩子）是在异步函数执行期间获得控制权的函数。中间件在模式级别指定，对于编写插件（[source](https://mongoosejs.com/docs/middleware.html)）非常有用。在 Mongoose 中，编译模型后调用 `pre()` 或 `post()` 是无效的。要在模型注册**之前**注册钩子，请使用 `MongooseModule` 的 `forFeatureAsync()` 方法以及工厂提供者（即 `useFactory`）。使用此技术，你可以访问模式对象，然后使用 `pre()` 或 `post()` 方法在该模式上注册钩子。请参见下面的示例：

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

与其他 [factory providers](/fundamentals/dependency-injection#工厂提供者usefactory) 一样，我们的工厂函数可以是 `async`，并且可以通过 `inject` 注入依赖。

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

要为给定的模式注册 [plugin](https://mongoosejs.com/docs/plugins.html)，请使用 `forFeatureAsync()` 方法。

```typescript
@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      {
        name: Cat.name,
        useFactory: () => {
          const schema = CatSchema;
          schema.plugin(require('mongoose-autopopulate'));
          return schema;
        },
      },
    ]),
  ],
})
export class AppModule {}

```

要一次为所有模式注册插件，请调用 `Connection` 对象的 `.plugin()` 方法。你应该在创建模型之前访问连接；为此，请使用 `connectionFactory`：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forRoot('mongodb://localhost/test', {
      connectionFactory: (connection) => {
        connection.plugin(require('mongoose-autopopulate'));
        return connection;
      }
    }),
  ],
})
export class AppModule {}

```

#### 判别器

[Discriminators](https://mongoosejs.com/docs/discriminators.html) 是一种模式继承机制。它们使你可以基于同一个底层 MongoDB 集合拥有多个具有重叠模式的模型。

假设你想要在单个集合中跟踪不同类型的事件。每个事件都会有一个时间戳。

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

> info **提示** mongoose 区分不同判别器模型的方式是通过"判别器键"，默认情况下为 `__t`。Mongoose 会向你的模式添加一个名为 `__t` 的 String 路径，用于跟踪此文档是哪个判别器的实例。
> 你也可以使用 `discriminatorKey` 选项来定义判别路径。

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

有了这些，使用 `discriminators` 选项为给定的模式注册判别器。它适用于 `MongooseModule.forFeature` 和 `MongooseModule.forFeatureAsync`：

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

在对应用程序进行单元测试时，我们通常希望避免任何数据库连接，使我们的测试套件更易于设置且执行更快。但我们的类可能依赖于从连接实例中获取的模型。我们如何解析这些类？解决方案是创建模拟模型。

为简化此过程，`@nestjs/mongoose` 包公开了一个 `getModelToken()` 函数，该函数根据令牌名称返回准备好的 [injection token](/fundamentals/dependency-injection#di-fundamentals)。使用此令牌，你可以使用任何标准的 [custom provider](/fundamentals/dependency-injection) 技术轻松提供模拟实现，包括 `useClass`、`useValue` 和 `useFactory`。例如：

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

在此示例中，只要任何消费者使用 `@InjectModel()` 装饰器注入 `Model<Cat>`，就会提供硬编码的 `catModel`（对象实例）。

<app-banner-courses></app-banner-courses>

#### 异步配置

当你需要异步而不是静态地传递模块选项时，请使用 `forRootAsync()` 方法。与大多数动态模块一样，Nest 提供了几种处理异步配置的技术。

一种技术是使用工厂函数：

```typescript
MongooseModule.forRootAsync({
  useFactory: () => ({
    uri: 'mongodb://localhost/nest',
  }),
});

```

与其他 [factory providers](/fundamentals/dependency-injection#工厂提供者usefactory) 一样，我们的工厂函数可以是 `async`，并且可以通过 `inject` 注入依赖。

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

上面的构造在 `MongooseModule` 内部实例化 `MongooseConfigService`，使用它来创建所需的选项对象。请注意，在此示例中，`MongooseConfigService` 必须实现 `MongooseOptionsFactory` 接口，如下所示。`MongooseModule` 将在所提供类的实例化对象上调用 `createMongooseOptions()` 方法。

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

如果你想重用现有的选项提供者，而不是在 `MongooseModule` 内部创建私有副本，请使用 `useExisting` 语法。

```typescript
MongooseModule.forRootAsync({
  imports: [ConfigModule],
  useExisting: ConfigService,
});

```

#### 连接事件

你可以通过使用 `onConnectionCreate` 配置选项来监听 Mongoose [connection events](https://mongoosejs.com/docs/connections.html#connection-events)。这允许你在建立连接时实现自定义逻辑。例如，你可以为 `connected`、`open`、`disconnected`、`reconnected` 和 `disconnecting` 事件注册事件监听器，如下所示：

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

在此代码片段中，我们正在建立到 `mongodb://localhost/test` 的 MongoDB 数据库连接。`onConnectionCreate` 选项使你能够设置特定的事件监听器来监控连接状态：

- `connected`：当连接成功建立时触发。
- `open`：当连接完全打开并准备好进行操作时触发。
- `disconnected`：当连接丢失时调用。
- `reconnected`：当连接断开后重新建立时调用。
- `disconnecting`：当连接正在关闭时发生。

你还可以将 `onConnectionCreate` 属性合并到使用 `MongooseModule.forRootAsync()` 创建的异步配置中：

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

这提供了一种灵活的方式来管理连接事件，使你能够有效地处理连接状态的变化。

#### 子文档

要在父文档中嵌套子文档，你可以如下定义你的模式：

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

如果你想包含多个子文档，可以使用子文档数组。相应地覆盖属性的类型是很重要的：

```typescript title="name.schema.ts"
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

在 Mongoose 中，**虚拟属性**是存在于文档上但不会持久化到 MongoDB 的属性。它不存储在数据库中，而是在每次访问时动态计算。虚拟属性通常用于派生或计算的值，比如组合字段（例如，通过拼接 `firstName` 和 `lastName` 创建 `fullName` 属性），或用于创建依赖于文档中现有数据的属性。

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

> info **提示** `@Virtual()` 装饰器从 `@nestjs/mongoose` 包中导入。

在此示例中，`fullName` 虚拟属性由 `firstName` 和 `lastName` 派生而来。尽管它在访问时表现得像普通属性，但它永远不会保存到 MongoDB 文档中。

#### 示例

[here](https://github.com/nestjs/nest/tree/master/sample/06-mongoose) 提供了一个可用的示例。