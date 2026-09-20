<!-- 此文件从 content/devtools/overview.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:09:34.798Z -->
<!-- 源文件: content/devtools/overview.md -->
<!-- 源哈希: ca8a874ce9c79826e5c09777650233b2 -->

### 概述

> info **提示** 本章介绍 Nest Devtools 与 Nest 框架的集成。如果您正在寻找 Devtools 应用程序，请访问 [Devtools](https://devtools.nestjs.com) 网站。

Nest Devtools 为您提供应用程序内部结构的交互式、实时更新的视图——模块、提供者、控制器，以及将它们连接在一起的路由和事件。您无需通过导入和构造函数签名来拼凑全貌，而是可以获得一个可搜索、可筛选、可点击的实时图谱。本章将引导您首次将本地应用程序连接到 Devtools。

开始使用只需不到五分钟。打开您的 `main.ts` 文件，在应用程序的选项对象中将 `snapshot` 属性设置为 `true`：

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    snapshot: true,
  });
  await app.listen(3000);
}

```

这会告诉 Nest 开始收集 Devtools 重建和可视化应用程序依赖图所需的元数据。

接下来，安装 Devtools 集成包：

```bash
$ npm i @nestjs/devtools-integration

```

安装完成后，打开 `app.module.ts` 并导入 `DevtoolsModule`：

```typescript
@Module({
  imports: [
    DevtoolsModule.register({
      http: process.env.NODE_ENV !== 'production',
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

```

> info **注意** 我们在这里检查 `NODE_ENV`，因为 `DevtoolsModule` 绝不应在生产环境中运行。

`http` 标志控制 `DevtoolsModule` 是否暴露其内省服务器——保持禁用状态时，该模块实际上不执行任何操作，这正是您希望的安全网，以防此配置意外通过审查。也无需担心有意义的运行时开销：元数据收集仅在内省服务器实际被查询时才会启动，因此应用程序的正常请求处理不受影响。

一旦导入了 `DevtoolsModule` 并且您的应用程序已启动并运行（`npm run start:dev`），请前往 [Devtools](https://devtools.nestjs.com) 观看您的内省图谱生动呈现。

<figure><img src="/assets/devtools/modules-graph.png" /></figure>

> info **提示** 请注意，每个模块都连接到 `InternalCoreModule`——这是 Nest 始终导入到根模块的全局模块。由于它是全局注册的，Nest 会自动在它和应用程序中的每个其他模块之间绘制一条边。为简化视图，请在侧边栏中切换 **隐藏全局模块** 复选框。

在底层，`DevtoolsModule` 会启动一个轻量级 HTTP 服务器（端口 8000），该仪表板使用它来实时内省您的应用程序——无需额外配置。

让我们确认一切连接正确。将图谱视图切换为"类"（Classes），您应该会看到类似这样的内容：

<figure><img src="/assets/devtools/classes-graph.png" /></figure>

点击任意节点可打开一个带有 **"聚焦"**（Focus）按钮的弹出窗口，该按钮可将其在图谱上隔离显示，或者使用侧边栏中的搜索栏直接跳转到特定节点。

> info **提示** 点击 **检查**（Inspect）将直接带您进入 `/debug` 页面，且该节点已被预选——非常适合深入查看特定的提供者或控制器。

<figure><img src="/assets/devtools/node-popup.png" /></figure>

> info **提示** 需要为文档或拉取请求保存快照？点击图谱右下角的 **导出为 PNG**（Export as PNG）。

侧边栏中的控件可让您缩小边的邻近范围——方便放大查看应用程序的特定分支：

<figure><img src="/assets/devtools/subtree-view.png" /></figure>

这是让**新团队成员**快速上手的绝佳方式——向他们准确展示应用程序是如何组合在一起的。当您要提取一个模块（例如 `TasksModule`）及其所有依赖项，以便将大型应用程序拆分为更小的服务时，它同样非常有用。

Graph Explorer 中的一切都会与您正在运行的应用程序保持同步——刷新后，您对模块或提供者所做的任何更改都会立即反映出来。无需构建步骤或单独维护文档；图谱**就是**文档。

观看 **Graph Explorer** 的实际运行：

<figure>
  <iframe
    width="1000"
    height="565"
    src="https://www.youtube.com/embed/bW8V-ssfnvM"
    title="YouTube video player"
    frameBorder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowFullScreen
  ></iframe>
</figure>

#### 调试 "Cannot resolve dependency" 错误

> info **注意** 适用于 `@nestjs/core` 9.3.10 及以上版本。

如果您使用 Nest 已有一段时间，很可能遇到过令人头疼的 **"Cannot resolve dependency"**（无法解析依赖）错误。这通常是任何新团队成员看到的第一个错误消息，在大型应用程序中，它可能真的很难追踪——堆栈跟踪告诉您缺少了什么，但没有说明原因，也没有说明在深层嵌套的提供者链中接线究竟是在哪里断开的。Devtools 将这一猜测过程转变为快速的可视化诊断。

首先更新您在 `bootstrap()` 中的 `main.ts` 调用：

```typescript
bootstrap().catch((err) => {
  writeFileSync('graph.json', PartialGraphHost.toString() ?? '');
  process.exit(1);
});

```

> info **提示** `PartialGraphHost` 从 `@nestjs/core` 中导出。

您还需要将 `abortOnError` 设置为 `false`：

```typescript
const app = await NestFactory.create(AppModule, {
  snapshot: true,
  abortOnError: false, // <--- THIS
});

```

从现在开始，每当您的应用程序因 **"Cannot resolve dependency"** 错误而无法启动时，Nest 都会在项目根目录写入一个 `graph.json` 文件——一个部分图谱。将其拖放到 Devtools 中（先切换到"预览"（Preview）模式而不是"交互"（Interactive）模式），即可准确查看问题所在：

<figure><img src="/assets/devtools/drag-and-drop.png" /></figure>

上传后，您将看到图谱以及一个总结问题情况的对话框：

<figure><img src="/assets/devtools/partial-graph-modules-view.png" /></figure>

高亮显示的 `TasksModule` 是您需要关注的对象——对话框已经为您提供了如何修复的提示。

切换到"类"（Classes）视图可以了解完整情况：

<figure><img src="/assets/devtools/partial-graph-classes-view.png" /></figure>

此图谱清晰地表明：`DiagnosticsService`——`TasksService` 所依赖的——在 `TasksModule` 的上下文中不可用。修复方法很简单：将 `DiagnosticsModule` 导入到 `TasksModule` 中即可恢复正常。

原本需要手动在多个文件中追踪导入——并希望自己没有遗漏任何一个——的缓慢过程，如今只需几次点击即可完成。这是一个小小的流程改进，但在拥有数十个模块的代码库中，效果会迅速累积。

#### 路由探索器

前往 **路由探索器** 页面，查看您的应用程序注册的所有入口点：

<figure><img src="/assets/devtools/routes.png" /></figure>

> info **提示** 此页面不仅限于 HTTP 路由——它还涵盖 WebSockets、gRPC、GraphQL 解析器等。

入口点按宿主控制器分组，您可以使用搜索栏直接跳转到目标入口点。

点击任意入口点即可展开**流程图**，显示其完整的执行路径——绑定到该路由的每个守卫、拦截器和管道。这是了解请求如何在应用程序中流转，或排查特定守卫、拦截器或管道未按预期触发原因的最快方式。

此视图在随时间自然增长的应用程序中最为实用，因为同一守卫可能在某处应用于控制器级别，而在另一处则按路由应用。您无需通读散布在代码库中的装饰器，即可获得该特定路由的实际解析执行顺序。

#### Playground

想要在不重新部署的情况下对应用程序运行代码？请前往 **Playground** 页面：

<figure><img src="/assets/devtools/sandbox.png" /></figure>

Playground 让您**实时**测试和调试端点，无需借助单独的 HTTP 客户端即可排查问题。您可以完全绕过认证层，省去额外的登录步骤或专用测试账户——对于事件驱动的应用程序，还可以直接从 Playground 触发事件，精确查看应用程序的响应方式。

您的代码记录的任何日志都会直接流式传输到 Playground 的控制台，让您随时了解底层发生的情况。

只需**即时**运行代码，即可立即查看结果——无需重新构建，无需重启服务器。

<figure><img src="/assets/devtools/sandbox-table.png" /></figure>

> info **提示** 使用 `console.table()`（或直接使用 `table()`）来美化打印对象数组。

查看 **Playground** 的实际效果：

<figure>
  <iframe
    width="1000"
    height="565"
    src="https://www.youtube.com/embed/liSxEN_VXKM"
    title="YouTube video player"
    frameBorder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowFullScreen
  ></iframe>
</figure>

#### 启动性能分析器

想知道是什么拖慢了应用程序的启动速度？**启动性能**页面列出了每个类节点——控制器、提供者、增强器等——及其实例化时间：

<figure><img src="/assets/devtools/bootstrap-performance.png" /></figure>

这是发现启动过程中最慢环节的最快捷方式，当启动时间处于关键路径上时尤为重要——想想无服务器环境，每一毫秒都至关重要。

启动缓慢通常由几个常见原因导致：构造函数中的大量同步操作、提供者在 `onModuleInit` 中等待缓慢的外部调用，或者模块实例化了远超所需的依赖。此页面按实例化时间排序，让这些异常情况一目了然，无需您在代码库中到处添加 `console.time()` 调用。

#### 审计

Devtools 会自动分析您的序列化图谱，并呈现值得关注的错误、警告和提示。您可以在**审计**页面上找到所有这些内容：

<figure><img src="/assets/devtools/audit.png" /></figure>

> info **提示** 上面的截图仅展示了可用审计规则的一部分示例。

将其视为应用程序架构的 linter——在问题找上您之前快速发现问题的有效方式。一些内置规则会标记出您原本只能通过艰难方式才能发现的问题：某个控制器承载的路由远超其相邻控制器、某个模块引入了异常大量的依赖、名为 `SomethingGuard` 的提供者从未实际注册为守卫，或者某个请求作用域的提供者非常适合改用 [Durable Providers](/fundamentals/provider-scopes#持久提供者)。这些都不是测试套件能捕获的 bug，但正是这类问题会随着时间推移拖慢代码库的速度。

#### 预览静态文件

要将序列化图谱保存到文件，请使用以下代码：

```typescript
await app.listen(3000); // OR await app.init()
writeFileSync('./graph.json', app.get(SerializedGraph).toString());

```

> info **提示** `SerializedGraph` 从 `@nestjs/core` 中导出。

然后直接拖放（或上传）该文件：

<figure><img src="/assets/devtools/drag-and-drop.png" /></figure>

当您想与同事共享图谱、将其附加到 bug 报告中，或在离线状态下进行分析时，此功能非常实用——无需保持应用程序运行。