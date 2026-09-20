<!-- 此文件从 content/recipes/router-module.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-13T10:20:11.132Z -->
<!-- 源文件: content/recipes/router-module.md -->
<!-- 源哈希: 5779943cc9764644a66841795c7e438f -->

### 路由模块

> 信息 **提示** 本章仅适用于基于 HTTP 的应用程序。

在 HTTP 应用程序（例如 REST API）中，处理程序的路由路径由控制器（在 `@Controller` 装饰器内）声明的（可选）前缀与方法装饰器中指定的任何路径（例如 `@Get('users')`）拼接而成。您可以在 [this section](/overview/controllers#路由) 中了解更多信息。此外，您可以为应用程序中注册的所有路由定义 [global prefix](/faq/global-prefix)，或启用 [versioning](/techniques/versioning)。

另外，在某些边缘情况下，在模块级别定义前缀（因此对于该模块内注册的所有控制器）可能会很有用。例如，设想一个 REST 应用程序，它公开了多个不同的端点，这些端点被应用程序中称为“Dashboard”的特定部分使用。在这种情况下，与其在每个控制器中重复 `/dashboard` 前缀，不如使用一个工具 `RouterModule` 模块，如下所示：

```typescript
@Module({
  imports: [
    DashboardModule,
    RouterModule.register([
      {
        path: 'dashboard',
        module: DashboardModule,
      },
    ]),
  ],
})
export class AppModule {}

```

> 信息 **提示** `RouterModule` 类从 `@nestjs/core` 包中导出。

此外，您可以定义层次结构。这意味着每个模块可以有 `children` 模块。子模块将继承其父模块的前缀。在下面的示例中，我们将 `AdminModule` 注册为 `DashboardModule` 和 `MetricsModule` 的父模块。

```typescript
@Module({
  imports: [
    AdminModule,
    DashboardModule,
    MetricsModule,
    RouterModule.register([
      {
        path: 'admin',
        module: AdminModule,
        children: [
          {
            path: 'dashboard',
            module: DashboardModule,
          },
          {
            path: 'metrics',
            module: MetricsModule,
          },
        ],
      },
    ])
  ],
});

```

> 信息 **提示** 此功能应谨慎使用，因为过度使用可能会使代码难以长期维护。

在上面的示例中，在 `DashboardModule` 内注册的任何控制器都将有一个额外的 `/admin/dashboard` 前缀（因为模块从顶部到底部递归地拼接路径，从父级到子级）。同样，在 `MetricsModule` 内定义的每个控制器都将有一个额外的模块级前缀 `/admin/metrics`。