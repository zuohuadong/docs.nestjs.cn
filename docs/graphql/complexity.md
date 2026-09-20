<!-- 此文件从 content/graphql/complexity.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:32:04.892Z -->
<!-- 源文件: content/graphql/complexity.md -->
<!-- 源哈希: 54c542d4149e461c466cabfede1f65fc -->

### 复杂度

> warning **警告** 本章仅适用于代码优先方法。

查询复杂度允许你定义某些字段的复杂程度，并通过**最大复杂度**来限制查询。其思路是使用一个简单的数字来定义每个字段的复杂度。常见的默认做法是给每个字段分配一个复杂度为 `1`。此外，GraphQL 查询的复杂度计算可以通过所谓的复杂度估算器进行自定义。复杂度估算器是一个简单的函数，用于计算字段的复杂度。你可以向规则中添加任意数量的复杂度估算器，它们会依次执行。第一个返回数值复杂度值的估算器将决定该字段的复杂度。

`@nestjs/graphql` 包与诸如 [graphql-query-complexity](https://github.com/slicknode/graphql-query-complexity) 之类的工具集成得很好，这些工具提供了基于成本分析的解决方案。使用这个库，你可以拒绝那些被认为执行成本过高的查询发送到你的 GraphQL 服务器。

#### 安装

要开始使用它，我们首先安装所需的依赖。

```bash
$ npm install --save graphql-query-complexity

```

#### 入门

安装过程完成后，我们可以定义 `ComplexityPlugin` 类：

```typescript
import { GraphQLSchemaHost } from '@nestjs/graphql';
import { Plugin } from '@nestjs/apollo';
import {
  ApolloServerPlugin,
  BaseContext,
  GraphQLRequestListener,
} from '@apollo/server';
import { GraphQLError } from 'graphql';
import {
  fieldExtensionsEstimator,
  getComplexity,
  simpleEstimator,
} from 'graphql-query-complexity';

@Plugin()
export class ComplexityPlugin implements ApolloServerPlugin {
  constructor(private gqlSchemaHost: GraphQLSchemaHost) {}

  async requestDidStart(): Promise<GraphQLRequestListener<BaseContext>> {
    const maxComplexity = 20;
    const { schema } = this.gqlSchemaHost;

    return {
      async didResolveOperation({ request, document }) {
        const complexity = getComplexity({
          schema,
          operationName: request.operationName,
          query: document,
          variables: request.variables,
          estimators: [
            fieldExtensionsEstimator(),
            simpleEstimator({ defaultComplexity: 1 }),
          ],
        });
        if (complexity > maxComplexity) {
          throw new GraphQLError(
            `Query is too complex: ${complexity}. Maximum allowed complexity: ${maxComplexity}`,
          );
        }
        console.log('Query Complexity:', complexity);
      },
    };
  }
}

```

为了演示目的，我们将最大允许复杂度指定为 `20`。在上面的示例中，我们使用了 2 个估算器，即 `simpleEstimator` 和 `fieldExtensionsEstimator`。

- `simpleEstimator`：简单估算器为每个字段返回一个固定的复杂度
- `fieldExtensionsEstimator`：字段扩展估算器从你的模式中提取每个字段的复杂度值

> info **提示** 请记得将此类添加到任何模块的提供者数组中。

#### 字段级复杂度

有了这个插件，我们现在可以通过在传递给 `@Field()` 装饰器的选项对象中指定 `complexity` 属性来定义任何字段的复杂度，如下所示：

```typescript
@Field({ complexity: 3 })
title: string;

```

或者，你可以定义估算器函数：

```typescript
@Field({ complexity: (options: ComplexityEstimatorArgs) => ... })
title: string;

```

#### 查询/变更级复杂度

此外，`@Query()` 和 `@Mutation()` 装饰器可以指定 `complexity` 属性，如下所示：

```typescript
@Query({ complexity: (options: ComplexityEstimatorArgs) => options.args.count * options.childComplexity })
items(@Args('count') count: number) {
  return this.itemsService.getItems({ count });
}

```