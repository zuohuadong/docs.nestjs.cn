<!-- 此文件从 content/graphql/guards-interceptors.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:33:37.500Z -->
<!-- 源文件: content/graphql/guards-interceptors.md -->
<!-- 源哈希: ba4559281e4a9be51c8410e127af39ef -->

### 其他特性

在 GraphQL 世界中，关于处理**认证**或操作**副作用**等问题存在很多争论。有些在业务逻辑内部处理，有些使用高阶函数来用授权逻辑增强查询和变更，还有些使用[schema directives](https://www.apollographql.com/docs/apollo-server/schema/directives/)。不存在一刀切的答案。

Nest 通过其跨平台特性，如[guards](/overview/guards)和[interceptors](/overview/interceptors)，来解决这些问题。目标是减少冗余，并提供工具来帮助您创建结构良好、可读且一致的应用程序。

#### 概述

您可以像处理任何 RESTful 应用程序一样，将标准的[guards](/overview/guards)、[interceptors](/overview/interceptors)、[filters](/overview/exception-filters)和[pipes](/pipes)与 GraphQL 一起使用。您还可以使用[custom decorators](/custom-decorators)特性创建自己的装饰器。考虑以下 GraphQL 查询处理器：

```typescript
@Query('author')
@UseGuards(AuthGuard)
async getAuthor(@Args('id', ParseIntPipe) id: number) {
  return this.authorsService.findOneById(id);
}

```

GraphQL 的工作方式与 HTTP REST 处理器一样，使用守卫和管道。这意味着您可以将认证逻辑移动到守卫中，甚至可以在 REST 和 GraphQL API 之间重用相同的守卫类。拦截器在这两种应用程序类型中工作方式相同：

```typescript
@Mutation()
@UseInterceptors(EventsInterceptor)
async upvotePost(@Args('postId') postId: number) {
  return this.postsService.upvoteById({ id: postId });
}

```

#### 执行上下文

由于 GraphQL 在传入的**请求**中接收不同类型的数据，守卫和拦截器接收的[execution context](/fundamentals/execution-context)在 GraphQL 和 REST 之间是不同的。GraphQL 解析器具有一组独特的参数：`root`、`args`、`context`和`info`。因此，守卫和拦截器必须将通用的`ExecutionContext`转换为`GqlExecutionContext`：

```typescript
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const ctx = GqlExecutionContext.create(context);
    return true;
  }
}

```

由`GqlExecutionContext.create()`返回的对象为每个 GraphQL 解析器参数暴露一个**get**方法（例如，`getArgs()`、`getContext()` 等）。转换上下文后，您可以获取当前**请求**的任何 GraphQL 参数。

#### 异常过滤器

标准的 Nest [exception filters](/overview/exception-filters) 也与 GraphQL 应用程序兼容。与`ExecutionContext`一样，GraphQL 应用应将`ArgumentsHost` 对象转换为`GqlArgumentsHost` 对象：

```typescript
@Catch(HttpException)
export class HttpExceptionFilter implements GqlExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const gqlHost = GqlArgumentsHost.create(host);
    return exception;
  }
}

```

> info **提示** `GqlExceptionFilter` 和 `GqlArgumentsHost` 都从 `@nestjs/graphql` 包导入。

与 REST 案例不同，您不使用原生的`response` 对象来生成**响应**。

#### 自定义装饰器

如前所述，[custom decorators](/custom-decorators) 特性与 GraphQL 解析器协同工作：

```typescript
export const User = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) =>
    GqlExecutionContext.create(ctx).getContext().user,
);

```

按如下方式使用`@User()` 自定义装饰器：

```typescript
@Mutation()
async upvotePost(
  @User() user: UserEntity,
  @Args('postId') postId: number,
) {}

```

> info **提示** 上述示例假设 `user` 对象已分配到您的 GraphQL 应用程序的上下文。

#### 在字段解析器级别执行增强器

在 GraphQL 上下文中，Nest 默认不会在字段级别运行**增强器**（拦截器、守卫和过滤器的通用名称）（参见[this GitHub issue](https://github.com/nestjs/graphql/issues/320#issuecomment-511193229)）：它们只对顶层`@Query()`/`@Mutation()` 方法运行。要使 Nest 为用`@ResolveField()` 装饰的方法执行拦截器、守卫或过滤器，请在`GqlModuleOptions`中设置`fieldResolverEnhancers`选项。根据需要传递一个`'interceptors'`、`'guards'` 和/或 `'filters'` 列表：

```typescript
GraphQLModule.forRoot({
  fieldResolverEnhancers: ['interceptors']
}),

```

> warning **警告** 为字段解析器启用增强器可能会在您返回大量记录且字段解析器运行数千次时导致性能问题。因此，当您启用`fieldResolverEnhancers`时，请跳过对字段解析器不严格必需的增强器。您可以使用以下辅助函数来实现：

```typescript
export function isResolvingGraphQLField(context: ExecutionContext): boolean {
  if (context.getType<GqlContextType>() === 'graphql') {
    const gqlContext = GqlExecutionContext.create(context);
    const info = gqlContext.getInfo();
    const parentType = info.parentType.name;
    return parentType !== 'Query' && parentType !== 'Mutation';
  }
  return false;
}

```

#### 创建自定义驱动

Nest 开箱即用提供了两个官方驱动，`@nestjs/apollo` 和 `@nestjs/mercurius`，以及一个用于构建新**自定义提供者**的 API。使用自定义驱动，您可以集成任何 GraphQL 库，或使用额外功能扩展现有集成。

例如，要集成[`graphql-http`](https://github.com/graphql/graphql-http) 包，您可以创建以下驱动类。当调用`start()` 时，Nest 已经生成了**模式**并将其传递到选项对象的`schema` 属性中：

```typescript
import { AbstractGraphQLDriver, GqlModuleOptions } from '@nestjs/graphql';
import { createHandler } from 'graphql-http/lib/use/express';

class ExpressGraphQLDriver extends AbstractGraphQLDriver {
  async start(options: GqlModuleOptions<any>): Promise<void> {
    const { httpAdapter } = this.httpAdapterHost;
    httpAdapter.use('/graphql', createHandler({ schema: options.schema! }));
  }

  async stop() {}
}

```

然后按如下方式使用它：

```typescript
GraphQLModule.forRoot({
  driver: ExpressGraphQLDriver,
});

```