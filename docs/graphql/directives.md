<!-- 此文件从 content/graphql/directives.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T09:50:44.827Z -->
<!-- 源文件: content/graphql/directives.md -->
<!-- 源哈希: b3df52c89afcb29b0b96d81d7b9b4075 -->

### 指令

指令可以附加到字段或片段包含上，并且可以以服务器期望的任何方式影响查询的执行（参见 GraphQL 文档中的 [directives](https://graphql.org/learn/queries/#directives)）。GraphQL 规范提供了几个默认指令：

- `@include(if: Boolean)`：仅当参数为 `true` 时，才在结果中包含此字段
- `@skip(if: Boolean)`：如果参数为 `true`，则跳过此字段
- `@deprecated(reason: String)`：将该字段标记为已弃用，并附带一条消息

指令是一个标识符，前面带有一个 `@` 字符，后面可选地跟一个具名参数列表。在 GraphQL 查询语言和模式语言中，指令几乎可以出现在任何元素之后。

#### 自定义指令

要定义 Apollo 或 Mercurius 遇到你的指令时会发生什么，请创建一个转换器函数。该函数使用 `mapSchema` 函数遍历模式中的各个位置（字段定义、类型定义等），并应用相应的转换。

```typescript
import { getDirective, MapperKind, mapSchema } from '@graphql-tools/utils';
import { defaultFieldResolver, GraphQLSchema } from 'graphql';

export function upperDirectiveTransformer(
  schema: GraphQLSchema,
  directiveName: string,
) {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const upperDirective = getDirective(
        schema,
        fieldConfig,
        directiveName,
      )?.[0];

      if (upperDirective) {
        const { resolve = defaultFieldResolver } = fieldConfig;

        // Replace the original resolver with a function that *first* calls
        // the original resolver, then converts its result to upper case
        fieldConfig.resolve = async function (source, args, context, info) {
          const result = await resolve(source, args, context, info);
          if (typeof result === 'string') {
            return result.toUpperCase();
          }
          return result;
        };
        return fieldConfig;
      }
    },
  });
}

```

接下来，在 `GraphQLModule#forRoot()` 方法中使用 `transformSchema` 选项应用 `upperDirectiveTransformer` 函数：

```typescript
GraphQLModule.forRoot({
  // ...
  transformSchema: (schema) => upperDirectiveTransformer(schema, 'upper'),
});

```

注册后，就可以在模式中使用 `@upper` 指令。如何应用该指令取决于你使用的方法（代码优先还是模式优先）。

#### 代码优先

在代码优先方法中，使用 `@Directive()` 装饰器来应用该指令：

```typescript
@Directive('@upper')
@Field()
title: string;

```

> info **提示** `@Directive()` 装饰器从 `@nestjs/graphql` 包中导出。

指令可以应用于字段、字段解析器、输入类型和对象类型，以及查询、变更和订阅。下面的示例在查询处理器级别应用指令：

```typescript
@Directive('@deprecated(reason: "This query will be removed in the next version")')
@Query(() => Author, { name: 'author' })
async getAuthor(@Args({ name: 'id', type: () => Int }) id: number) {
  return this.authorsService.findOneById(id);
}

```

> warning **警告** 通过 `@Directive()` 装饰器应用的指令不会反映在生成的模式定义文件中。

最后，在 `GraphQLModule` 配置中声明这些指令：

```typescript
GraphQLModule.forRoot({
  // ...,
  transformSchema: schema => upperDirectiveTransformer(schema, 'upper'),
  buildSchemaOptions: {
    directives: [
      new GraphQLDirective({
        name: 'upper',
        locations: [DirectiveLocation.FIELD_DEFINITION],
      }),
    ],
  },
}),

```

> info **提示** `GraphQLDirective` 和 `DirectiveLocation` 都从 `graphql` 包中导出。

#### 模式优先

在模式优先方法中，直接在 SDL 中应用指令：

```graphql
directive @upper on FIELD_DEFINITION

type Post {
  id: Int!
  title: String! @upper
  votes: Int
}

```