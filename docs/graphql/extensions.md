<!-- 此文件从 content/graphql/extensions.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T10:00:33.541Z -->
<!-- 源文件: content/graphql/extensions.md -->
<!-- 源哈希: 9514e8600d1a624938b94dacfe68e1b5 -->

### 扩展

> warning **警告** 本章仅适用于代码优先方式。

扩展是一项**高级的底层特性**，它允许你在类型配置中定义任意数据。将自定义元数据附加到特定字段上，可以让你构建更复杂、更通用的解决方案。例如，借助扩展，你可以定义访问特定字段所需的角色。你的代码可以在运行时读取这些角色，以判断调用方是否拥有足够的权限来获取某个特定字段。

#### 添加自定义元数据

要将自定义元数据附加到字段上，请使用从 `@nestjs/graphql` 包中导出的 `@Extensions()` 装饰器：

```typescript
@Field()
@Extensions({ role: Role.ADMIN })
password: string;

```

在上面的示例中，我们将值 `Role.ADMIN` 赋给了 `role` 元数据属性。`Role` 是一个 TypeScript 枚举，它汇总了我们系统中所有可用的用户角色。

除了字段之外，你还可以在类级别和方法级别（例如，在查询处理器上）使用 `@Extensions()` 装饰器。

#### 使用自定义元数据

使用自定义元数据的逻辑可以根据需要任意复杂。例如，你可以创建一个拦截器，用于在每次方法调用时存储或记录事件；或者创建一个 [field middleware](/graphql/field-middleware)，将获取某个字段所需的角色与调用方的权限进行匹配（即字段级权限系统）。

为了便于说明，让我们定义一个 `checkRoleMiddleware`，它将用户的角色（此处为硬编码）与访问目标字段所需的角色进行比较：

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

完成上述操作后，为 `password` 字段注册该中间件：

```typescript
@Field({ middleware: [checkRoleMiddleware] })
@Extensions({ role: Role.ADMIN })
password: string;

```