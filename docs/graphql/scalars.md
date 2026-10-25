<!-- 此文件从 content/graphql/scalars.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-03T10:59:41.805Z -->
<!-- 源文件: content/graphql/scalars.md -->

### 标量类型

GraphQL 对象类型具有名称和字段，但这些字段最终必须解析为具体的数据。这时标量类型就派上了用场：它们代表查询的叶子节点（更多信息请参阅 [here](https://graphql.org/learn/schema/#scalar-types)）。GraphQL 包含以下默认类型：`Int`、`Float`、`String`、`Boolean` 和 `ID`。除了这些内置类型之外，您可能还需要支持自定义的原子数据类型（例如，`Date`）。

#### 代码优先

代码优先方法提供了五个标量，其中三个是现有 GraphQL 类型的简单别名。

- `ID`（`GraphQLID` 的别名）- 表示唯一标识符，通常用于重新获取对象或作为缓存的键
- `Int`（`GraphQLInt` 的别名）- 有符号 32 位整数
- `Float`（`GraphQLFloat` 的别名）- 有符号双精度浮点值
- `GraphQLISODateTime` - UTC 日期时间字符串（默认用于表示 `Date` 类型）
- `GraphQLTimestamp` - 有符号整数，表示从 UNIX 纪元开始以毫秒为单位的日期和时间

默认使用 `GraphQLISODateTime`（例如 `2019-12-03T09:54:33Z`）来表示 `Date` 类型。要改用 `GraphQLTimestamp`，请将 `buildSchemaOptions` 对象的 `dateScalarMode` 设置为 `'timestamp'`，如下所示：

```typescript
GraphQLModule.forRoot({
  buildSchemaOptions: {
    dateScalarMode: 'timestamp',
  }
}),

```

同样，默认使用 `GraphQLFloat` 来表示 `number` 类型。要改用 `GraphQLInt`，请将 `buildSchemaOptions` 对象的 `numberScalarMode` 设置为 `'integer'`，如下所示：

```typescript
GraphQLModule.forRoot({
  buildSchemaOptions: {
    numberScalarMode: 'integer',
  }
}),

```

此外，您还可以创建自定义标量。

#### 覆盖默认标量

要为 `Date` 标量创建自定义实现，只需创建一个新类。

```typescript
import { Scalar, CustomScalar } from '@nestjs/graphql';
import { Kind, ValueNode } from 'graphql';

@Scalar('Date', () => Date)
export class DateScalar implements CustomScalar<number, Date> {
  description = 'Date custom scalar type';

  parseValue(value: number): Date {
    return new Date(value); // value from the client
  }

  serialize(value: Date): number {
    return value.getTime(); // value sent to the client
  }

  parseLiteral(ast: ValueNode): Date {
    if (ast.kind === Kind.INT) {
      return new Date(ast.value);
    }
    return null;
  }
}

```

完成此操作后，将 `DateScalar` 注册为提供者。

```typescript
@Module({
  providers: [DateScalar],
})
export class CommonModule {}

```

现在，我们可以在类中使用 `Date` 类型了。

```typescript
@Field()
creationDate: Date;

```

#### 导入自定义标量

要使用自定义标量，请将其导入并注册为解析器。我们将使用 `graphql-type-json` 包进行演示。这个 npm 包定义了一个 `JSON` GraphQL 标量类型。

首先安装该包：

```bash
$ npm i --save graphql-type-json

```

安装完成后，我们将自定义解析器传递给 `forRoot()` 方法：

```typescript
import GraphQLJSON from 'graphql-type-json';

@Module({
  imports: [
    GraphQLModule.forRoot({
      resolvers: { JSON: GraphQLJSON },
    }),
  ],
})
export class AppModule {}

```

现在，我们可以在类中使用 `JSON` 类型了。

```typescript
@Field(() => GraphQLJSON)
info: JSON;

```

如需一系列有用的标量，请查看 [graphql-scalars](https://www.npmjs.com/package/graphql-scalars) 包。

#### 创建自定义标量

要定义自定义标量，请创建一个新的 `GraphQLScalarType` 实例。我们将创建一个自定义的 `UUID` 标量。

```typescript
const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validate(uuid: unknown): string | never {
  if (typeof uuid !== 'string' || !regex.test(uuid)) {
    throw new Error('invalid uuid');
  }
  return uuid;
}

export const CustomUuidScalar = new GraphQLScalarType({
  name: 'UUID',
  description: 'A simple UUID parser',
  serialize: (value) => validate(value),
  parseValue: (value) => validate(value),
  parseLiteral: (ast) => validate(ast.value),
});

```

我们将自定义解析器传递给 `forRoot()` 方法：

```typescript
@Module({
  imports: [
    GraphQLModule.forRoot({
      resolvers: { UUID: CustomUuidScalar },
    }),
  ],
})
export class AppModule {}

```

现在，我们可以在类中使用 `UUID` 类型了。

```typescript
@Field(() => CustomUuidScalar)
uuid: string;

```

#### 模式优先

要定义自定义标量（更多关于标量的信息请参阅 [here](https://www.apollographql.com/docs/graphql-tools/scalars.html)），请创建类型定义和专用的解析器。这里（与官方文档一样），我们将使用 `graphql-type-json` 包进行演示。这个 npm 包定义了一个 `JSON` GraphQL 标量类型。

首先安装该包：

```bash
$ npm i --save graphql-type-json

```

安装完成后，我们将自定义解析器传递给 `forRoot()` 方法：

```typescript
import GraphQLJSON from 'graphql-type-json';

@Module({
  imports: [
    GraphQLModule.forRoot({
      typePaths: ['./**/*.graphql'],
      resolvers: { JSON: GraphQLJSON },
    }),
  ],
})
export class AppModule {}

```

现在，我们可以在类型定义中使用 `JSON` 标量了：

```graphql
scalar JSON

type Foo {
  field: JSON
}

```

另一种定义标量类型的方法是创建一个简单的类。假设我们想用 `Date` 类型来增强我们的模式。

```typescript
import { Scalar, CustomScalar } from '@nestjs/graphql';
import { Kind, ValueNode } from 'graphql';

@Scalar('Date')
export class DateScalar implements CustomScalar<number, Date> {
  description = 'Date custom scalar type';

  parseValue(value: number): Date {
    return new Date(value); // value from the client
  }

  serialize(value: Date): number {
    return value.getTime(); // value sent to the client
  }

  parseLiteral(ast: ValueNode): Date {
    if (ast.kind === Kind.INT) {
      return new Date(ast.value);
    }
    return null;
  }
}

```

完成此操作后，将 `DateScalar` 注册为提供者。

```typescript
@Module({
  providers: [DateScalar],
})
export class CommonModule {}

```

现在，我们可以在类型定义中使用 `Date` 标量了。

```graphql
scalar Date

```

默认情况下，所有标量生成的 TypeScript 定义都是 `any` - 这并不特别类型安全。
但是，当您指定如何生成类型时，可以配置 Nest 如何为您的自定义标量生成类型定义：

```typescript
import { GraphQLDefinitionsFactory } from '@nestjs/graphql';
import { join } from 'node:path';

const definitionsFactory = new GraphQLDefinitionsFactory();

definitionsFactory.generate({
  typePaths: ['./src/**/*.graphql'],
  path: join(process.cwd(), 'src/graphql.ts'),
  outputAs: 'class',
  defaultScalarType: 'unknown',
  customScalarTypeMapping: {
    DateTime: 'Date',
    BigNumber: '_BigNumber',
  },
  additionalHeader: "import _BigNumber from 'bignumber.js'",
});

```

> 信息 **提示** 或者，您可以使用类型引用来代替，例如：`DateTime: Date`。在这种情况下，`GraphQLDefinitionsFactory` 将提取指定类型（`Date.name`）的 name 属性来生成 TS 定义。注意：需要为非内置类型（自定义类型）添加 import 语句。

现在，给定以下 GraphQL 自定义标量类型：

```graphql
scalar DateTime
scalar BigNumber
scalar Payload

```

我们将在 `src/graphql.ts` 中看到以下生成的 TypeScript 定义：

```typescript
import _BigNumber from 'bignumber.js';

export type DateTime = Date;
export type BigNumber = _BigNumber;
export type Payload = unknown;

```

在这里，我们使用了 `customScalarTypeMapping` 属性来提供我们希望为自定义标量声明的类型映射。我们还提供了 `additionalHeader` 属性，以便为这些类型定义添加所需的任何导入。最后，我们添加了一个值为 `'unknown'` 的 `defaultScalarType`，这样任何未在 `customScalarTypeMapping` 中指定的自定义标量都将被别名为 `unknown` 而不是 `any`（[TypeScript recommends](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-0.html#new-unknown-top-type) 自 3.0 起使用以增加类型安全性）。

> 信息 **提示** 请注意，我们从 `bignumber.js` 导入了 `_BigNumber`；这是为了避免 [circular type references](https://github.com/Microsoft/TypeScript/issues/12525#issuecomment-263166239)。