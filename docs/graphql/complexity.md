<!-- 此文件从 content/graphql/complexity.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T10:07:58.063Z -->
<!-- 源文件: content/graphql/complexity.md -->
<!-- 源哈希: 177ebb41b692047608413b1d880dfd90 -->

### 复杂度

> warning **警告** 本章仅适用于代码优先（code first）方式。

查询复杂度允许你定义某些字段的复杂程度，并通过**最大复杂度**来限制查询。其核心思想是将每个字段的复杂度表示为一个数字。一个常见的默认做法是给每个字段赋予 `1` 的复杂度。你还可以通过复杂度估算器（complexity estimator）自定义 GraphQL 查询复杂度的计算方式。复杂度估算器是一个用于计算字段复杂度的函数。你可以向规则中添加任意数量的估算器，它们会依次执行。第一个返回数值的估算器将决定该字段的复杂度。

`@nestjs/graphql` 包集成了诸如 [graphql-query-complexity](https://github.com/slicknode/graphql-query-complexity) 之类的工具，后者提供了一种基于成本分析的解决方案。借助该库，你可以拒绝执行成本过高的查询。

#### 安装

首先，安装所需的依赖：

```bash
$ npm install --save graphql-query-complexity

```

#### 快速开始

安装完成后，定义 `ComplexityPlugin` 类：

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

出于演示目的，允许的最大复杂度被设置为 `20`。上面的示例使用了两个估算器：`fieldExtensionsEstimator` 和 `simpleEstimator`：

- `fieldExtensionsEstimator`：提取为模式中每个字段定义的复杂度值（通过字段的 `extensions`）
- `simpleEstimator`：为每个字段返回固定的复杂度（用作未定义复杂度的字段的回退值）

> info **提示** 记得将该类添加到模块的 `providers` 数组中。

#### 字段级复杂度

有了这个插件，你可以通过在传递给 `@Field()` 装饰器的选项对象中指定 `complexity` 属性来定义任意字段的复杂度：

```typescript
@Field({ complexity: 3 })
title: string;

```

或者，你也可以定义一个估算器函数：

```typescript
@Field({ complexity: (options: ComplexityEstimatorArgs) => ... })
title: string;

```

#### 查询/变更级复杂度

`@Query()` 和 `@Mutation()` 装饰器在其选项对象中也接受 `complexity` 属性：

```typescript
@Query(() => [Item], {
  complexity: (options: ComplexityEstimatorArgs) =>
    options.args.count * options.childComplexity,
})
items(@Args('count') count: number) {
  return this.itemsService.getItems({ count });
}

```