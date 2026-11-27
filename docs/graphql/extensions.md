<!-- 此文件从 content/graphql/extensions.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:06:42.375Z -->
<!-- 源文件: content/graphql/extensions.md -->
<!-- 源哈希: 9514e8600d1a624938b94dacfe68e1b5 -->

### 扩展

> 警告 **警告** 本章仅适用于代码优先方法。

扩展是一个**高级、底层特性**，允许您在类型配置中定义任意数据。将自定义元数据附加到特定字段上，可以帮助您构建更复杂、更通用的解决方案。例如，使用扩展，您可以定义访问特定字段所需的角色。您的代码可以在运行时读取这些角色，以确定调用者是否有足够的权限检索特定字段。

#### 添加自定义元数据

要将自定义元数据附加到字段上，请使用从 `@nestjs/graphql` 包导出的 `@Extensions()` 装饰器：

```typescript
@Field()
@Extensions({ role: Role.ADMIN })
password: string;

```

在上面的示例中，我们将值 `Role.ADMIN` 分配给了 `role` 元数据属性。`Role` 是一个 TypeScript 枚举，用于分组我们系统中所有可用的用户角色。

除了字段，您还可以在类级别和方法级别（例如，在查询处理器上）使用 `@Extensions()` 装饰器。

#### 使用自定义元数据

使用自定义元数据的逻辑可以像需要的那样复杂。例如，您可以创建一个拦截器，按方法调用存储或记录事件，或者一个 [field middleware](/graphql/field-middleware)，它将检索字段所需的角色与调用者的权限进行匹配（字段级别的权限系统）。

为了说明目的，我们定义一个 `checkRoleMiddleware`，用于比较用户的角色（此处硬编码）与访问目标字段所需的角色：

```typescript
export const checkRoleMiddleware: FieldMiddleware = async (
  ctx: MiddlewareContext,
  next: NextFn,
) => {
  const info = ctx.info!;
  const { extensions } = info.parentType.getFields()[info.fieldName];

  /**
   * In a real-world application, the "userRole" variable
   * should represent the caller's (user) role (e.g., read from "ctx.context").
   */
  const userRole = Role.USER;
  if (userRole !== extensions.role) {
    // or "return null" to hide the value instead
    throw new ForbiddenException(
      `User does not have sufficient permissions to access "${info.fieldName}" field.`,
    );
  }
  return next();
};

```

设置好后，为 `password` 字段注册中间件：

```typescript
@Field({ middleware: [checkRoleMiddleware] })
@Extensions({ role: Role.ADMIN })
password: string;

```