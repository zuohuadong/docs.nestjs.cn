<!-- 此文件从 content/recipes/router-module.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:08:18.887Z -->
<!-- 源文件: content/recipes/router-module.md -->
<!-- 源哈希: d906186271cb9a29947baa00c4e4b182 -->

### Router 模块

> info **提示** 本章仅与基于 HTTP 的应用程序相关。

在 HTTP 应用程序（例如 REST API）中，处理程序的路由路径是通过控制器（在 `@Controller()` 装饰器内）声明的（可选）前缀与方法装饰器中指定的任何路径（例如 `@Get('users')`）连接确定的。您可以在控制器章节的 [routing](/overview/controllers#路由) 部分了解更多信息。此外，您可以为应用程序中注册的所有路由定义一个 [global prefix](/faq/global-prefix)，或者启用 [versioning](/http/versioning)。

在某些情况下，在模块级别定义前缀是有用的，该前缀将应用于该模块内注册的所有控制器。例如，想象一个 REST 应用程序，它暴露了特定应用程序部分（称为“Dashboard”）使用的多个端点。而不是在每个控制器中重复 `/dashboard` 前缀，您可以使用 `RouterModule`，如下所示：

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

> info **提示** `RouterModule` 类从 `@nestjs/core` 包导出。

您还可以定义层次结构，其中每个模块都有 `children` 模块。子模块会继承其父级的**前缀**。在以下示例中，`AdminModule` 被注册为 `DashboardModule` 和 `MetricsModule` 的父模块：

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
    ]),
  ],
})
export class AppModule {}

```

> info **提示** 请谨慎使用此功能，过度使用可能会使代码随着时间的推移难以维护。

在上面的示例中，在 `DashboardModule` 内部注册的每个控制器都会获得额外的 `/admin/dashboard` 前缀，因为模块会从上到下、从父级到子级递归地连接路径。同样，在 `MetricsModule` 内部定义的每个控制器都会获得额外的模块级别前缀 `/admin/metrics`。