<!-- 此文件从 content/devtools/overview.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T09:27:16.579Z -->
<!-- 源文件: content/devtools/overview.md -->
<!-- 源哈希: 6a3c85e59055735531c913e732c58e63 -->

### 概述

> info **提示** 本章介绍 Nest Devtools 与 Nest 框架的集成。如果你正在寻找 Devtools 应用程序，请访问 [Devtools](https://devtools.nestjs.com) 网站。

Nest Devtools 为你提供应用程序内部结构的交互式、始终最新的视图：模块、提供者、控制器，以及将它们连接在一起的路由和事件。你无需再从导入语句和构造函数签名中拼凑出这幅图景，而是获得一个可搜索、可过滤、可点击浏览的实时图谱。本章将引导你首次将本地应用程序连接到 Devtools。

入门只需不到五分钟。打开你的 `main.ts` 文件，并在应用程序选项对象中将 `snapshot` 属性设置为 `true`：

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    snapshot: true,
  });
  await app.listen(3000);
}

```

这会告诉 Nest 收集 Devtools 重建和可视化应用程序依赖图所需的元数据。

接下来，安装 Devtools 集成包：

```bash
$ npm i @nestjs/devtools-integration

```

安装好该包后，打开 `app.module.ts` 并导入 `DevtoolsModule`：

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

> info **注意** 我们在这里检查 `NODE_ENV`，因为 `DevtoolsModule` 绝不应该在生产环境中运行。

`http` 标志控制 `DevtoolsModule` 是否启动其内省服务器。当该标志被禁用时，该模块不会暴露任何内容，这是你希望拥有的安全网，以防此配置意外通过了代码审查。运行时开销可以忽略不计：启用 `snapshot` 后，Nest 会在应用程序启动时收集一次图谱元数据，因此应用程序的常规请求处理不受影响。

一旦导入了 `DevtoolsModule` 并且你的应用程序正在运行（`npm run start:dev`），打开 [Devtools](https://devtools.nestjs.com) 即可查看你内省得到的图谱。

<figure><img src="/assets/devtools/modules-graph.png" /></figure>

> info **提示** 每个模块都连接到 `InternalCoreModule`，这是一个全局模块，Nest 始终会将其导入到根模块中。由于它是全局注册的，Nest 会在它与应用程序中的其他每个模块之间绘制一条边。为了让视图更简洁，请在侧边栏中勾选 **Hide global modules**（隐藏全局模块）复选框。

在底层，`DevtoolsModule` 会启动一个轻量级 HTTP 服务器（默认端口为 8000），仪表盘使用它来实时内省你的应用程序。无需额外配置。如果端口 8000 已被占用，可以通过 `DevtoolsModule.register()` 的 `port` 选项传入其他端口。

要确认一切连接正确，请将图谱视图切换为 "Classes"。你应该会看到类似这样的内容：

<figure><img src="/assets/devtools/classes-graph.png" /></figure>

点击任意节点会打开一个弹窗，其中有一个 **"Focus"**（聚焦）按钮，可将该节点在图谱上单独隔离出来；或者使用侧边栏中的搜索栏跳转到特定节点。

> info **提示** 点击 **Inspect**（检查）会带你进入 `/debug` 页面，并预先选中该节点，这对于深入查看特定的提供者或控制器非常有用。

<figure><img src="/assets/devtools/node-popup.png" /></figure>

> info **提示** 需要为文档或拉取请求制作快照？点击图谱右下角的 **Export as PNG**（导出为 PNG）。

侧边栏控件让你可以缩小边的邻近范围，这有助于你聚焦于应用程序的特定分支：

<figure><img src="/assets/devtools/subtree-view.png" /></figure>

这是一种很好的方式，可以通过向**新团队成员**准确展示应用程序如何组合在一起来帮助他们上手。当你将某个模块（比如 `TasksModule`）及其所有依赖项提取出来，以便将大型应用程序拆分为更小的服务时，它同样有用。

Graph Explorer 中的所有内容都与你的运行中应用程序保持同步：刷新一下，你对模块或提供者所做的任何更改都会立即反映出来。没有构建步骤，也没有需要保持更新的单独文档；图谱**就是**文档。

观看 **Graph Explorer** 的实际演示：

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

如果你使用 Nest 有一段时间了，你可能遇到过 **"Cannot resolve dependency"** 错误。这通常是新团队成员看到的第一个错误，而在大型应用程序上，它可能很难追踪：堆栈跟踪会告诉你缺少什么，但不会告诉你原因，也不会告诉你在深层嵌套的提供者链中哪里出现了连接断裂。Devtools 将这一过程从猜测游戏变成了快速、可视化的诊断。

首先更新 `main.ts` 中的 `bootstrap()` 调用：

```typescript
bootstrap().catch((err) => {
  writeFileSync('graph.json', PartialGraphHost.toString() ?? '');
  process.exit(1);
});

```

> info **提示** `PartialGraphHost` 从 `@nestjs/core` 导出，而 `writeFileSync` 从 `node:fs` 导出。

你还需要将 `abortOnError` 设置为 `false`：

```typescript
const app = await NestFactory.create(AppModule, {
  snapshot: true,
  abortOnError: false, // <--- THIS
});

```

从现在起，每当你的应用程序因 **"Cannot resolve dependency"** 错误而启动失败时，它都会在项目根目录写入一个 `graph.json` 文件（一个部分图谱）。将该文件拖放到 Devtools 中（先切换从 "Interactive" 到 "Preview" 模式），即可准确查看哪里出了问题：

<figure><img src="/assets/devtools/drag-and-drop.png" /></figure>

上传后，你会看到图谱以及一个总结所发生情况的对话框：

<figure><img src="/assets/devtools/partial-graph-modules-view.png" /></figure>

高亮显示的 `TasksModule` 就是需要排查的那个，对话框会为你提供修复它的指引。

切换到 "Classes" 视图可以了解完整的情况：

<figure><img src="/assets/devtools/partial-graph-classes-view.png" /></figure>

图谱清楚地表明：`TasksService` 所依赖的 `DiagnosticsService` 在 `TasksModule` 上下文中不可用。修复方法是将 `DiagnosticsModule` 导入到 `TasksModule` 中。

原本需要在多个文件中手动追踪导入、还得祈祷没有遗漏的缓慢过程，如今只需点击几下即可完成。这只是工作流程上的一点小变化，但在拥有数十个模块的代码库中，它会迅速累积出可观的收益。

#### Routes explorer

**Routes explorer** 页面展示了你的应用程序注册的每一个入口点：

<figure><img src="/assets/devtools/routes.png" /></figure>

> info **提示** 此页面并不局限于 HTTP 路由。它还涵盖 WebSocket、gRPC、GraphQL 解析器等。

入口点按其宿主控制器分组，你可以使用搜索栏快速跳转到目标入口点。

点击任意入口点即可展开其完整执行路径的**流程图**：绑定到该路由的每一个守卫、拦截器和管道。这是理解请求如何流经应用程序的最快方式，也能帮你查明为什么某个守卫、拦截器或管道没有按预期运行。

这种视图在那些自然生长起来的应用程序中收益最大——同一个守卫可能在一处应用于控制器级别，在另一处则按路由应用。你无需通读散落在代码库各处的装饰器，就能得到该路由实际解析后的执行顺序。

#### Playground

要在不重新部署的情况下针对应用程序运行代码，请打开 **Playground** 页面：

<figure><img src="/assets/devtools/sandbox.png" /></figure>

Playground 让你能够**实时**测试和调试端点，因此无需借助单独的 HTTP 客户端即可定位问题。你可以完全绕过认证层，省去额外的登录步骤或专用的测试账号。对于事件驱动的应用程序，你可以直接从 Playground 触发事件，准确观察应用程序如何响应。

你的代码所记录的任何内容都会流式传输到 Playground 的控制台，因此你始终能了解底层发生了什么。

**即时**运行代码并立即查看结果，无需重新构建，也无需重启服务器。

> info **提示** Playground 请求通过沙箱会话令牌进行认证。`DevtoolsModule` 会在应用程序每次启动时生成一个新令牌并将其打印到控制台（`Sandbox session token: ...`）。将此令牌提供给 Devtools 即可在 Playground 中运行代码。

<figure><img src="/assets/devtools/sandbox-table.png" /></figure>

> info **提示** 使用 `console.table()`（或 `table()`）可以美化打印对象数组。

观看 **Playground** 的实际演示：

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

#### Bootstrap performance analyzer

要查明是什么拖慢了应用程序的启动速度，请打开 **Bootstrap performance** 页面。它列出了每一个类节点（控制器、提供者、增强器等）及其实例化时间：

<figure><img src="/assets/devtools/bootstrap-performance.png" /></figure>

这是发现引导过程中最慢环节的最快方式。当启动时间处于关键路径上时，这一点尤为重要，例如在每一毫秒都至关重要的无服务器环境中。

启动缓慢通常有几个常见原因：构造函数中繁重的同步工作、某个提供者在 `onModuleInit` 中等待缓慢的外部调用，或者某个模块实例化了远超其所需的依赖项。按实例化时间排序后，此页面能让这些异常项一目了然，而无需在代码库中到处撒 `console.time()` 调用。

#### Audit

Devtools 会自动分析你序列化后的图谱，并呈现出值得你关注的错误、警告和提示。你可以在 **Audit** 页面中找到它们：

<figure><img src="/assets/devtools/audit.png" /></figure>

> info **提示** 上面的截图仅展示了可用审计规则中的一部分。

可以把它看作应用程序架构的 linter：一种在问题找上你之前就快速捕获它们的方式。一些内置规则会标记出那些否则你只能以痛苦方式才发现的问题：某个控制器承载的路由数量远超其同类、某个模块引入了异常大量的依赖项、某个名为 `SomethingGuard` 的提供者从未被注册为守卫，或者某个请求作用域的提供者极有可能是 [durable providers](/fundamentals/provider-scopes#持久提供者) 的候选对象。你的测试套件不会捕获这些问题中的任何一个，但它们恰恰是那种会随着时间推移拖慢代码库的东西。

#### Preview static files

要将序列化后的图谱保存到文件，请使用以下代码：

```typescript
await app.listen(3000); // OR await app.init()
writeFileSync('./graph.json', app.get(SerializedGraph).toString());

```

> info **提示** `SerializedGraph` 从 `@nestjs/core` 中导出。

然后拖放（或上传）该文件：

<figure><img src="/assets/devtools/drag-and-drop.png" /></figure>

当你想与同事分享图谱、将其附加到 bug 报告中，或者在不运行应用程序的情况下离线分析它时，这会非常有用。