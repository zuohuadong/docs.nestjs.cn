<!-- 此文件从 content/graphql/extensions.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-03T11:03:07.308Z -->
<!-- 源文件: content/graphql/extensions.md -->

### 扩展

> warning **警告** 本章仅适用于代码优先方法。

扩展是一项**高级、底层功能**，允许您在类型配置中定义任意数据。将自定义元数据附加到特定字段，可以让您创建更复杂、通用的解决方案。例如，使用扩展，您可以定义访问特定字段所需的字段级角色。这些角色可以在运行时反映出来，以确定调用者是否有足够的权限检索特定字段。

#### 添加自定义元数据

要为字段附加自定义元数据，请使用从 `@nestjs/graphql` 包导出的 `@Extensions()` 装饰器。

```typescript
@Field()
@Extensions({ role: Role.ADMIN })
password: string;

```

在上面的示例中，我们将 `role` 元数据属性分配为 `Role.ADMIN` 的值。`Role` 是一个简单的 TypeScript 枚举，它对我们系统中所有可用的用户角色进行了分组。

请注意，除了在字段上设置元数据外，您还可以在类级别和方法级别（例如，在查询处理器上）使用 `@Extensions()` 装饰器。

#### 使用自定义元数据

利用自定义元数据的逻辑可以根据需要变得复杂。例如，您可以创建一个简单的拦截器，用于存储/记录每次方法调用的事件，或者创建一个 [field middleware](/graphql/field-middleware)，将检索字段所需的角色与调用者的权限进行匹配（字段级权限系统）。

为了说明目的，让我们定义一个 `checkRoleMiddleware`，它将用户的角色（此处硬编码）与访问目标字段所需的角色进行比较：

```typescript
export const checkRoleMiddleware: FieldMiddleware = async (
  ctx: MiddlewareContext,
  next: NextFn,
) => {
  const { info } = ctx;
  const { extensions } = info.parentType.getFields()[info.fieldName];

  /**
   * In a real-world application, the "userRole" variable
   * should represent the caller's (user) role (for example, "ctx.user.role").
   */
  const userRole = Role.USER;
  if (userRole === extensions.role) {
    // or just "return null" to ignore
    throw new ForbiddenException(
      `User does not have sufficient permissions to access "${info.fieldName}" field.`,
    );
  }
  return next();
};

```

有了这个，我们可以为 `password` 字段注册一个中间件，如下所示：

```typescript
@Field({ middleware: [checkRoleMiddleware] })
@Extensions({ role: Role.ADMIN })
password: string;

```