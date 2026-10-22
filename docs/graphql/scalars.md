<!-- 此文件从 content/graphql/scalars.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-22T10:08:36.874Z -->
<!-- 源文件: content/graphql/scalars.md -->
<!-- 源哈希: e6fba11070a41ddea178519941f4a328 -->

### 标量

GraphQL 对象类型有名称和字段，但归根结底，这些字段必须解析为某些具体数据。标量类型提供了这些数据：它们表示查询的叶子节点（参见 GraphQL 文档中的 [scalar types](https://graphql.org/learn/schema/#scalar-types)）。GraphQL 包含以下内置标量类型：`Int`、`Float`、`String`、`Boolean` 和 `ID`。除此之外，你可能还需要支持自定义的原子数据类型（例如 `Date`）。

#### 代码优先

代码优先方式内置了五个标量，其中三个是现有 GraphQL 类型的别名：

- `ID`（`GraphQLID` 的别名）：唯一标识符，通常用于重新获取对象或作为缓存的键
- `Int`（`GraphQLInt` 的别名）：有符号 32 位整数
- `Float`（`GraphQLFloat` 的别名）：有符号双精度浮点值
- `GraphQLISODateTime`：UTC 格式的日期时间字符串（默认用于表示 `Date` 类型）
- `GraphQLTimestamp`：有符号整数，表示自 Unix 纪元开始以来的毫秒数形式的日期和时间

默认情况下，`GraphQLISODateTime`（例如 `2019-12-03T09:54:33Z`）表示 `Date` 类型。若要改用 `GraphQLTimestamp`，请将 `buildSchemaOptions` 对象的 `dateScalarMode` 属性设置为 `'timestamp'`：

```typescript
GraphQLModule.forRoot({
  buildSchemaOptions: {
    dateScalarMode: 'timestamp',
  }
}),

```

同样，`GraphQLFloat` 默认表示 `number` 类型。若要改用 `GraphQLInt`，请将 `buildSchemaOptions` 对象的 `numberScalarMode` 属性设置为 `'integer'`：

```typescript
GraphQLModule.forRoot({
  buildSchemaOptions: {
    numberScalarMode: 'integer',
  }
}),

```

你也可以创建自定义标量。

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

完成之后，将 `DateScalar` 注册为提供者：

```typescript
@Module({
  providers: [DateScalar],
})
export class CommonModule {}

```

现在你可以在你的类中使用 `Date` 类型：

```typescript
@Field()
creationDate: Date;

```

#### 导入自定义标量

要使用自定义标量，请导入它并将其注册为解析器。为了演示，我们将使用 `graphql-type-json` 包，它定义了一个 `JSON` GraphQL 标量类型。

首先安装该包：

```bash
$ npm i --save graphql-type-json

```

包安装完成后，向 `forRoot()` 方法传入一个自定义解析器：

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

现在你可以在你的类中使用 `JSON` 类型：

```typescript
@Field(() => GraphQLJSON)
info: JSON;

```

如需一套现成的标量，请参见 [graphql-scalars](https://www.npmjs.com/package/graphql-scalars) 包。

#### 创建自定义标量

要定义自定义标量，请创建一个新的 `GraphQLScalarType` 实例。以下示例创建了一个自定义的 `UUID` 标量：

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

然后向 `forRoot()` 方法传入一个自定义解析器：

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

现在你可以在你的类中使用 `UUID` 类型：

```typescript
@Field(() => CustomUuidScalar)
uuid: string;

```

#### 模式优先

要定义自定义标量（参见 GraphQL Tools 文档中的 [custom scalars](https://www.apollographql.com/docs/graphql-tools/scalars.html)），请创建一个类型定义和一个专用的解析器。与官方文档一样，我们将使用 `graphql-type-json` 包，它定义了一个 `JSON` GraphQL 标量类型。

首先安装该包：

```bash
$ npm i --save graphql-type-json

```

包安装完成后，向 `forRoot()` 方法传入一个自定义解析器：

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

定义标量类型的另一种方式是创建一个类。假设你想向模式中添加一个 `Date` 类型：

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

完成之后，将 `DateScalar` 注册为提供者：

```typescript
@Module({
  providers: [DateScalar],
})
export class CommonModule {}

```

现在你可以在你的类型定义中使用 `Date` 标量：

```graphql
scalar Date

```

默认情况下，为每个自定义标量生成的 TypeScript 定义都是 `any`，这并不是类型安全的。你可以在指定如何生成类型时，配置 Nest 为你的自定义标量生成类型的方式：

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

> info **提示** 或者，你可以使用类型引用，例如 `DateTime: Date`。在这种情况下，`GraphQLDefinitionsFactory` 会使用指定类型（`Date.name`）的 `name` 属性来生成 TypeScript 定义。对于自定义（非内置）类型，你还必须添加一条 import 语句。

现在，给定以下 GraphQL 自定义标量类型：

```graphql
scalar DateTime
scalar BigNumber
scalar Payload

```

Nest 会在 `src/graphql.ts` 中生成以下 TypeScript 定义：

```typescript
import _BigNumber from 'bignumber.js';

export type DateTime = Date;
export type BigNumber = _BigNumber;
export type Payload = unknown;

```

这里，`customScalarTypeMapping` 属性将每个自定义标量映射到要为它声明的 TypeScript 类型。`additionalHeader` 属性会添加这些类型定义所需的任何导入。最后，将 `defaultScalarType` 设置为 `'unknown'` 会将所有未列在 `customScalarTypeMapping` 中的自定义标量都别名到 `unknown`，而不是 `any`，后者自 3.0 版本起被 [TypeScript recommends](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-0.html#new-unknown-top-type)，以提升类型安全性。

> info **提示** 该示例从 `bignumber.js` 中以别名方式导入 `_BigNumber`，以避免 [circular type references](https://github.com/Microsoft/TypeScript/issues/12525#issuecomment-263166239)。