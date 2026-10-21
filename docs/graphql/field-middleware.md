<!-- 此文件从 content/graphql/field-middleware.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T10:06:58.315Z -->
<!-- 源文件: content/graphql/field-middleware.md -->
<!-- 源哈希: 97c367b43dde4499ba0df81d349b071c -->

### 字段中间件

> warning **警告** 本章节仅适用于代码优先（code first）方式。

字段中间件允许你在字段被解析**之前或之后**运行任意代码。你可以使用字段中间件来转换字段的结果、验证字段的参数，或检查字段级别的角色（例如，访问中间件函数所运行的字段所需的角色）。

你可以将多个中间件函数连接到一个字段。在这种情况下，它们会沿着一条链依次被调用，其中每个中间件决定是否调用下一个。函数在 `middleware` 数组中的顺序很重要。第一个是最外层，因此它最先运行、最后结束（类似于 `graphql-middleware` 包）。第二个是往里的下一层，因此它第二个运行、倒数第二个结束。

#### 快速开始

让我们先创建一个简单的中间件，在字段值被发送回客户端之前记录它：

```typescript
import { FieldMiddleware, MiddlewareContext, NextFn } from '@nestjs/graphql';

const loggerMiddleware: FieldMiddleware = async (
  ctx: MiddlewareContext,
  next: NextFn,
) => {
  const value = await next();
  console.log(value);
  return value;
};

```

> info **提示** `MiddlewareContext` 是一个对象，它由 GraphQL 解析器函数通常接收的相同参数组成（`{ source, args, context, info }`），而 `NextFn` 是一个函数，用于执行栈中的下一个中间件（绑定到该字段）或实际的字段解析器。

> warning **警告** 字段中间件函数无法注入依赖，也无法访问 Nest 的 DI 容器。它们被设计为轻量级的，不应执行可能耗时的操作（例如从数据库检索数据）。如果你需要调用外部服务或查询数据源，请在绑定到根查询或变更处理器的守卫或拦截器中进行，并将结果赋值给 `context` 对象。然后你可以在字段中间件内部（通过 `MiddlewareContext` 对象）访问它。

字段中间件必须匹配 `FieldMiddleware` 接口。在上面的示例中，我们首先调用 `next()` 函数（它执行实际的字段解析器并返回字段值），然后将该值记录到终端。中间件函数返回的值会替换字段值（如果中间件返回 `undefined`，则使用来自 `next()` 的值）。由于我们不想改变任何东西，因此返回原始值。

完成这些后，直接在 `@Field()` 装饰器中注册该中间件：

```typescript
@ObjectType()
export class Recipe {
  @Field({ middleware: [loggerMiddleware] })
  title: string;
}

```

现在，每当你请求 `Recipe` 对象类型的 `title` 字段时，该字段的原始值就会被记录到控制台。

> info **提示** 要了解如何使用 [extensions](/graphql/extensions) 功能实现字段级权限系统，请参阅 [using custom metadata](/graphql/extensions#使用自定义元数据)。

> warning **警告** 字段中间件只能应用于 `ObjectType` 类。更多详情，请参阅 [this GitHub issue](https://github.com/nestjs/graphql/issues/2446)。

如上所述，你可以在中间件函数内部控制字段的值。为了演示，让我们将食谱的标题转换为大写（如果存在）：

```typescript
const value = await next();
return value?.toUpperCase();

```

在这种情况下，每个标题在被请求时都会自动转换为大写。

同样，你可以将字段中间件绑定到自定义字段解析器（一个用 `@ResolveField()` 装饰器标注的方法）：

```typescript
@ResolveField(() => String, { middleware: [loggerMiddleware] })
title() {
  return 'Placeholder';
}

```

> warning **警告** 如果在字段解析器级别启用了增强器（参见 [executing enhancers at the field resolver level](/graphql/guards-interceptors#在字段解析器级别执行增强器)），字段中间件函数会在**绑定到该方法**的任何拦截器、守卫等之前运行（但在为查询或变更处理器注册的根级增强器之后运行）。

#### 全局字段中间件

除了将中间件直接绑定到特定字段外，你还可以全局注册一个或多个中间件函数。全局中间件会自动连接到对象类型的所有字段。

```typescript
GraphQLModule.forRoot({
  autoSchemaFile: 'schema.gql',
  buildSchemaOptions: {
    fieldMiddleware: [loggerMiddleware],
  },
}),

```

> info **提示** 全局注册的字段中间件函数会在本地注册的中间件函数（直接绑定到特定字段的那些）**之前**运行。