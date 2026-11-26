<!-- 此文件从 content/graphql/scalars.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:06:58.235Z -->
<!-- 源文件: content/graphql/scalars.md -->
<!-- 源哈希: e6fba11070a41ddea178519941f4a328 -->

### 标量类型

GraphQL 对象类型具有名称和字段，但在某个时刻，这些字段必须解析为具体的**实体**数据。标量类型提供这些数据：它们代表查询的叶子节点（参见 GraphQL 文档中的 [scalar types](https://graphql.org/learn/schema/#scalar-types)）。GraphQL 包含以下内置标量类型：`Int`, `Float`, `String`, `Boolean` 和 `ID`。除了这些之外，您可能需要支持自定义原子数据类型（例如 `Date`）。

#### 代码优先

代码优先的方法自带五个标量，其中三个是现有 GraphQL 类型的别名：

- `ID` (`GraphQLID` 的别名)：一个唯一标识符，通常用于重新获取**实体**或作为缓存的键
- `Int` (`GraphQLInt` 的别名)：一个有符号 32 位整数
- `Float` (`GraphQLFloat` 的别名)：一个有符号双精度浮点数值
- `GraphQLISODateTime`：一个 UTC 时间的日期时间字符串（默认用于表示 `Date` 类型）
- `GraphQLTimestamp`：一个有符号整数，表示自 Unix 纪元开始以毫秒为单位的日期和时间

默认情况下，`GraphQLISODateTime`（例如 `2019-12-03T09:54:33Z`）表示 `Date` 类型。要使用 `GraphQLTimestamp`，请将 `buildSchemaOptions` 对象的 `dateScalarMode` 属性设置为 `'timestamp'`：

```typescript
GraphQLModule.forRoot({
  buildSchemaOptions: {
    dateScalarMode: 'timestamp',
  }
}),

```

同样，`GraphQLFloat` 默认表示 `number` 类型。要使用 `GraphQLInt`，请将 `buildSchemaOptions` 对象的 `numberScalarMode` 属性设置为 `'integer'`：

```typescript
GraphQLModule.forRoot({
  buildSchemaOptions: {
    numberScalarMode: 'integer',
  }
}),

```

您也可以创建自定义标量。

#### 覆盖默认标量

要创建 `Date` 标量的自定义实现，请创建一个新类：

```typescript
import { Scalar, CustomScalar } from '@nestjs/graphql';
import { Kind, ValueNode } from 'graphql';

@Scalar('Date', () => Date)
export class DateScalar implements CustomScalar<number, Date> {
  description = 'Date custom scalar type';

  parseValue(value: unknown): Date {
    return new Date(value as number); // value from the client
  }

  serialize(value: unknown): number {
    return (value as Date).getTime(); // value sent to the client
  }

  parseLiteral(ast: ValueNode): Date | null {
    if (ast.kind === Kind.INT) {
      return new Date(parseInt(ast.value, 10));
    }
    return null;
  }
}

```

设置好后，将 `DateScalar` 注册为**提供者**：

```typescript
@Module({
  providers: [DateScalar],
})
export class CommonModule {}

```

现在您可以在类中使用 `Date` 类型：

```typescript
@Field()
creationDate: Date;

```

#### 导入自定义标量

要使用自定义标量，请将其导入并注册为**解析器**。为演示目的，我们将使用 `graphql-type-json` 包，它定义了一个 `JSON` GraphQL 标量类型。

首先安装该包：

```bash
$ npm i --save graphql-type-json

```

安装包后，将自定义**解析器**传递给 `forRoot()` 方法：

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

现在您可以在类中使用 `JSON` 类型：

```typescript
@Field(() => GraphQLJSON)
info: JSON;

```

有关一系列现成的标量，请参阅 [graphql-scalars](https://www.npmjs.com/package/graphql-scalars) 包。

#### 创建自定义标量

要定义自定义标量，请创建一个新的 `GraphQLScalarType` 实例。以下示例创建了一个自定义 `UUID` 标量：

```typescript
import { GraphQLScalarType, Kind } from 'graphql';

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
  parseLiteral: (ast) =>
    validate(ast.kind === Kind.STRING ? ast.value : undefined),
});

```

然后将自定义**解析器**传递给 `forRoot()` 方法：

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

现在您可以在类中使用 `UUID` 类型：

```typescript
@Field(() => CustomUuidScalar)
uuid: string;

```

#### 模式优先

要定义自定义标量（参见 GraphQL Tools 文档中的 [custom scalars](https://www.apollographql.com/docs/graphql-tools/scalars.html)），请创建一个类型定义和一个专用的**解析器**。与官方文档一样，我们将使用 `graphql-type-json` 包，它定义了一个 `JSON` GraphQL 标量类型。

首先安装该包：

```bash
$ npm i --save graphql-type-json

```

安装包后，将自定义**解析器**传递给 `forRoot()` 方法：

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

现在我们可以在类型定义中使用 `JSON` 标量：

```graphql
scalar JSON

type Foo {
  field: JSON
}

```

定义标量类型另一种方法是创建一个类。假设您想将 `Date` 类型添加到您的**模式**中：

```typescript
import { Scalar, CustomScalar } from '@nestjs/graphql';
import { Kind, ValueNode } from 'graphql';

@Scalar('Date')
export class DateScalar implements CustomScalar<number, Date> {
  description = 'Date custom scalar type';

  parseValue(value: unknown): Date {
    return new Date(value as number); // value from the client
  }

  serialize(value: unknown): number {
    return (value as Date).getTime(); // value sent to the client
  }

  parseLiteral(ast: ValueNode): Date | null {
    if (ast.kind === Kind.INT) {
      return new Date(parseInt(ast.value, 10));
    }
    return null;
  }
}

```

设置好后，将 `DateScalar` 注册为**提供者**：

```typescript
@Module({
  providers: [DateScalar],
})
export class CommonModule {}

```

现在您可以在类型定义中使用 `Date` 标量：

```graphql
scalar Date

```

默认情况下，每个自定义标量的生成 TypeScript 定义是 `any`，这不具备类型安全。当您指定如何生成类型时，可以配置 Nest 如何为自定义标量生成类型：

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

> info **提示** 此外，您可以使用类型引用，例如 `DateTime: Date`。在这种情况下，`GraphQLDefinitionsFactory` 使用指定类型（`Date.name`）的 `name` 属性来生成 TypeScript 定义。对于自定义（非内置）类型，您还必须添加导入语句。

现在，给定以下 GraphQL 自定义标量类型：

```graphql
scalar DateTime
scalar BigNumber
scalar Payload

```

Nest 在 `src/graphql.ts` 中生成以下 TypeScript 定义：

```typescript
import _BigNumber from 'bignumber.js';

export type DateTime = Date;
export type BigNumber = _BigNumber;
export type Payload = unknown;

```

在这里，`customScalarTypeMapping` 属性将每个自定义标量映射到需要声明的 TypeScript 类型。`additionalHeader` 属性添加这些类型定义所需的任何导入。最后，将 `defaultScalarType` 设置为 `'unknown'` 会将不在 `customScalarTypeMapping` 中列出的任何自定义标量别名到 `unknown`，而不是 `any`，这自 3.0 版本以来（参见 [TypeScript recommends](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-0.html#new-unknown-top-type)）已添加类型安全。

> info **提示** 示例从 `bignumber.js` 导入 `_BigNumber` 并使用别名以避免 [circular type references](https://github.com/Microsoft/TypeScript/issues/12525#issuecomment-263166239)。