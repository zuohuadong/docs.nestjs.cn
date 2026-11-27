<!-- 此文件从 content/graphql/field-middleware.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:06:53.259Z -->
<!-- 源文件: content/graphql/field-middleware.md -->
<!-- 源哈希: 01e1975fe213607aeba82aa82125f3fe -->

### 字段中间件

> 警告 **警告** 本章仅适用于代码优先方法。

字段中间件允许您在字段解析的**之前或之后**运行任意代码。您可以使用字段中间件来转换字段结果、验证字段参数或检查字段级别的角色（例如，中间件函数运行所需的访问该字段的角色）。

您可以将多个中间件函数连接到一个字段。在这种情况下，它们沿着链顺序调用，每个中间件决定是否调用下一个。`middleware` 数组中函数的顺序很重要。第一个是最外层，因此它最先运行，最后完成（类似于 `graphql-middleware` 包）。第二个是内一层，因此它第二次运行，倒数第二次完成。

#### 入门

让我们从创建一个简单中间件开始，该中间件在字段值返回给客户端之前记录该字段值：

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

> 信息 **提示** `MiddlewareContext` 是一个包含 GraphQL 解析器函数通常接收的相同参数（`{ source, args, context, info }`）的对象，而 `NextFn` 是一个执行堆栈中下一个中间件（绑定到此字段）或实际字段解析器的函数。

> 警告 **警告** 字段中间件函数不能注入依赖项或访问 Nest 的依赖注入容器。它们被设计为轻量级的，不应执行可能耗时的操作（例如从数据库检索数据）。如果需要调用外部服务或查询数据源，请在绑定到根查询或变更处理程序的守卫或拦截器中执行，并将结果分配给 `context` 对象。然后您可以从字段中间件内部（通过 `MiddlewareContext` 对象）访问它。

字段中间件必须匹配 `FieldMiddleware` 接口。在上面的示例中，我们首先调用 `next()` 函数（该函数执行实际的字段解析器并返回字段值），然后将此值记录到终端。从中间件函数返回的值会替换字段值（如果中间件返回 `undefined`，则使用 `next()` 的值）。由于我们不希望更改任何内容，我们返回原始值。

设置好后，直接在 `@Field()` 装饰器中注册中间件：

```typescript
@ObjectType()
export class Recipe {
  @Field({ middleware: [loggerMiddleware] })
  title: string;
}

```

现在，每当您请求 `Recipe` 对象类型的 `title` 字段时，该字段的原始值都会记录到控制台。

> 信息 **提示** 要了解如何使用 [extensions](/graphql/extensions) 功能实现字段级别的权限系统，请参阅 [using custom metadata](/graphql/extensions#使用自定义元数据)。

> 警告 **警告** 字段中间件只能应用于 `ObjectType` 类。有关更多详细信息，请参阅 [this GitHub issue](https://github.com/nestjs/graphql/issues/2446)。

如上所述，您可以在中间件函数内部控制字段的值。为了演示目的，让我们将食谱的标题（如果存在）转换为大写：

```typescript
const value = await next();
return value?.toUpperCase();

```

在这种情况下，每次请求时标题都会自动大写。

同样，您可以将字段中间件绑定到自定义字段解析器（一个用 `@ResolveField()` 装饰器注解的方法）：

```typescript
@ResolveField(() => String, { middleware: [loggerMiddleware] })
title() {
  return 'Placeholder';
}

```

> 警告 **警告** 如果在字段解析器级别启用了增强器（参见 [executing enhancers at the field resolver level](/graphql/guards-interceptors#在字段解析器级别执行增强器)），字段中间件函数在任何**绑定到方法**的拦截器、守卫等之前运行（但在为查询或变更处理程序注册的根级别增强器之后）。

#### 使用装饰器应用中间件

或者，使用 `@UseFieldMiddleware()` 装饰器应用字段中间件。它适用于字段和字段解析器，可以放置在 `@Field()` 或 `@ResolveField()` 装饰器之上或之下：

```typescript
@ObjectType()
export class Recipe {
  @Field()
  @UseFieldMiddleware(loggerMiddleware)
  title: string;
}

@ResolveField(() => String)
@UseFieldMiddleware(loggerMiddleware)
description() {
  return 'Placeholder';
}

```

因为它是一个独立的装饰器，您可以将其与其它装饰器组合成复合装饰器：

```typescript
export function Auth(...roles: Role[]) {
  return applyDecorators(
    Extensions({ roles }),
    UseFieldMiddleware(checkRoleMiddleware),
  );
}

```

#### 全局字段中间件

除了将中间件直接绑定到特定字段外，您还可以全局注册一个或多个中间件函数。全局中间件会自动连接到您对象类型的所有字段。

```typescript
GraphQLModule.forRoot({
  autoSchemaFile: 'schema.gql',
  buildSchemaOptions: {
    fieldMiddleware: [loggerMiddleware],
  },
}),

```

> 信息 **提示** 全局注册的字段中间件函数在**本地**注册的函数**之前**运行。通过 `@Field()` 或 `@ResolveField()` 的 `middleware` 选项传递的本地中间件在用 `@UseFieldMiddleware()` 应用的中间件之前运行，后者按给定顺序运行（当装饰器堆叠时，最低的先运行，类似于 `@UseGuards()`）。