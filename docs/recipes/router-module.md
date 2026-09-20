<!-- 此文件从 content/recipes/router-module.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T09:40:49.597Z -->
<!-- 源文件: content/recipes/router-module.md -->
<!-- 源哈希: 5779943cc9764644a66841795c7e438f -->

### 路由模块

> info **提示** 本章仅适用于基于 HTTP 的应用程序。

在 HTTP 应用程序（例如 REST API）中，处理程序的路由路径由控制器中声明的（可选）前缀（在 `@Controller` 装饰器内）与方法装饰器中指定的任何路径（例如 `@Get('users')`）拼接而成。您可以在 [this section](/overview/controllers#路由) 中了解更多相关信息。此外，您可以为应用程序中注册的所有路由定义 [global prefix](/faq/global-prefix)，或启用 [versioning](/techniques/versioning)。

此外，在某些边缘情况下，在模块级别定义前缀（因此对于该模块内注册的所有控制器）可能会派上用场。例如，假设一个 REST 应用程序公开了多个不同的端点，这些端点被应用程序中称为“Dashboard”的特定部分使用。在这种情况下，您可以使用一个工具 `RouterModule` 模块，而不是在每个控制器中重复 `/dashboard` 前缀，如下所示：

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

> info **提示** `RouterModule` 类从 `@nestjs/core` 包中导出。

此外，您可以定义层次结构。这意味着每个模块都可以有 `children` 模块。子模块将继承其父模块的前缀。在以下示例中，我们将 `AdminModule` 注册为 `DashboardModule` 和 `MetricsModule` 的父模块。

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

> info **提示** 应非常谨慎地使用此功能，因为过度使用可能会使代码随着时间的推移难以维护。

在上面的示例中，注册在 `DashboardModule` 内的任何控制器都将具有额外的 `/admin/dashboard` 前缀（因为模块会从顶部到底部（递归地）将路径从父级连接到子级）。同样，在 `MetricsModule` 内定义的每个控制器都将具有额外的模块级前缀 `/admin/metrics`。