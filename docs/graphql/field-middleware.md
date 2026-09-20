<!-- 此文件从 content/graphql/field-middleware.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:52:29.091Z -->
<!-- 源文件: content/graphql/field-middleware.md -->
<!-- 源哈希: e6b8bca0b327c5751779bb51b84f1155 -->

### 字段中间件

> warning **警告** 本章仅适用于代码优先方法。

字段中间件允许您在字段被解析**之前或之后**运行任意代码。字段中间件可用于转换字段的结果、验证字段的参数，甚至检查字段级别的角色（例如，需要访问执行中间件函数的目标字段）。

您可以将多个中间件函数连接到字段。在这种情况下，它们将沿着链依次调用，前一个中间件决定调用下一个。`middleware` 数组中中间件函数的顺序很重要。第一个解析器是"最外层"层，因此它最先执行，也最后执行（类似于 `graphql-middleware` 包）。第二个解析器是"第二外层"层，因此它第二个执行，也倒数第二个执行。

#### 入门

让我们首先创建一个简单的中间件，在字段值发送回客户端之前记录该值：

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

> info **提示** `MiddlewareContext` 是一个对象，包含通常由 GraphQL 解析器函数（`{ source, args, context, info }`）接收的相同参数，而 `NextFn` 是一个函数，允许您执行堆栈中的下一个中间件（绑定到此字段）或实际的字段解析器。

> warning **警告** 字段中间件函数无法注入依赖项，也无法访问 Nest 的 DI 容器，因为它们被设计为非常轻量级，不应执行任何潜在耗时的操作（如从数据库检索数据）。如果您需要调用外部服务/从数据源查询数据，您应该在绑定到根查询/变更处理程序的守卫/拦截器中执行此操作，并将其分配给 `context` 对象，您可以从字段中间件内部访问该对象（具体来说，从 `MiddlewareContext` 对象中）。

请注意，字段中间件必须匹配 `FieldMiddleware` 接口。在上面的示例中，我们首先运行 `next()` 函数（该函数执行实际的字段解析器并返回字段值），然后将此值记录到终端。此外，中间件函数返回的值完全覆盖先前的值，由于我们不想进行任何更改，我们只需返回原始值。

有了这个，我们可以直接在 `@Field()` 装饰器中注册我们的中间件，如下所示：

```typescript
@ObjectType()
export class Recipe {
  @Field({ middleware: [loggerMiddleware] })
  title: string;
}

```

现在，每当我们请求 `Recipe` 对象类型的 `title` 字段时，原始字段的值将被记录到控制台。

> info **提示** 要了解如何使用 [extensions](/graphql/extensions) 功能实现字段级权限系统，请查看此 [section](/graphql/extensions#使用自定义元数据)。

> warning **警告** 字段中间件只能应用于 `ObjectType` 类。有关更多详细信息，请查看此 [issue](https://github.com/nestjs/graphql/issues/2446)。

此外，如上所述，我们可以从中间件函数内部控制字段的值。出于演示目的，让我们将食谱的标题大写（如果存在）：

```typescript
const value = await next();
return value?.toUpperCase();

```

在这种情况下，每个标题在请求时都会自动大写。

同样，您可以将字段中间件绑定到自定义字段解析器（使用 `@ResolveField()` 装饰器注解的方法），如下所示：

```typescript
@ResolveField(() => String, { middleware: [loggerMiddleware] })
title() {
  return 'Placeholder';
}

```

> warning **警告** 如果在字段解析器级别启用了增强器（[read more](/graphql/guards-interceptors#在字段解析器级别执行增强器)），字段中间件函数将在任何拦截器、守卫等**绑定到方法**之前运行（但在为查询或变更处理程序注册的根级增强器之后）。

#### 全局字段中间件

除了将中间件直接绑定到特定字段之外，您还可以全局注册一个或多个中间件函数。在这种情况下，它们将自动连接到对象类型的所有字段。

```typescript
GraphQLModule.forRoot({
  autoSchemaFile: 'schema.gql',
  buildSchemaOptions: {
    fieldMiddleware: [loggerMiddleware],
  },
}),

```

> info **提示** 全局注册的字段中间件函数将在本地注册的（直接绑定到特定字段的）**之前**执行。