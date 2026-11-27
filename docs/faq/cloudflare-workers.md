<!-- 此文件从 content/faq/cloudflare-workers.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T23:13:30.662Z -->
<!-- 源文件: content/faq/cloudflare-workers.md -->
<!-- 源哈希: 1dadf474fdd38ce424d7c15f34b0c832 -->

### Cloudflare Workers

Cloudflare Workers 和 Nest 解决不同的问题，许多系统同时使用两者。Workers 在 Cloudflare 的网络上运行小型函数，靠近每个用户，无需保持运行的服务器。Nest 组织后端，通常是一个长时间运行的 Node.js 进程。本页面帮助您做出选择。

#### 何时使用哪个

| 构建内容 | 更好选择 | 原因 |
| --- | --- | --- |
| 网站或 API 前的逻辑：重定向、A/B 测试、重写头部、检查令牌 | Workers | 它在每个用户之前运行，在请求到达您的源站之前 |
| 具有少量路由的小型 API，且流量呈尖峰或几乎没有 | Workers | 空闲时不产生费用，且无需运行服务器 |
| 具有多个模块的后端，或有多个开发人员协作 | Nest | 模块、依赖注入、守卫和管道提供了结构，并且服务易于测试 |
| 具有事务和连接池的关系型数据库 | Nest | 长时间运行的进程会保持其连接池。Worker 通过 Hyperdrive 或 D1 访问数据库 |
| 运行数分钟的后台任务或队列消费者 | Nest | [Queues](/techniques/queues) 和 [scheduled jobs](/techniques/task-scheduling) 在您的进程中运行。Workers 拥有 Cloudflare 自己的队列、Cron 触发器和工作流 |
| 繁重的 CPU 或内存工作，或原生 Node.js 模块 | Nest | Worker 的隔离环境有限制，如下所述 |
| 具有多个房间的 WebSocket | 任意 | Nest 拥有 [gateways](/websockets/gateways)，而 Workers 拥有持久化对象 |
| 必须在其他云或您自己的服务器上运行的组件 | Nest | 它可以在 Node.js 运行的任何地方运行，而 KV 和 D1 等 Worker 绑定将代码与 Cloudflare 绑定 |

Cloudflare [lists its limits](https://developers.cloudflare.com/workers/platform/limits/)，可能会有变化。在撰写本文时，一个隔离环境获得 128 MB 内存和一秒的启动时间，默认情况下，一个请求获得 30 秒的 CPU 时间，付费计划可达 5 分钟。

#### 同时使用两者

Worker 可以部署在 Nest 应用程序的前面：它在边缘处理它能处理的部分，并将其余部分传递下去。Cookie、头部和主体保持不变：

```typescript title="worker.ts"
interface Env {
  API_ORIGIN: string;
}

export default {
  fetch(request: Request, env: Env) {
    const { pathname, search } = new URL(request.url);
    if (pathname.startsWith('/api/')) {
      return fetch(`${env.API_ORIGIN}${pathname}${search}`, request);
    }
    return new Response(`Hello from ${request.cf?.colo ?? 'the edge'}`);
  },
};

```

然后 Nest 在任何 Node.js 主机上运行（参见 [Deployment](/deployment)），包括 [Cloudflare Containers](https://developers.cloudflare.com/containers/)，这些环境在您的 Worker 旁边运行容器镜像。

#### Nest 能否在 Worker 上运行？

可以，但 Nest 官方不支持，而且很少是最佳选择。Workers 实现 `node:http`，因此 Express 适配器在 `workerd` 中启动。一个包含控制器和提供者的应用程序压缩后约为 500 KB。预期情况：

- **依赖注入需要 `@Inject()`。** Workers 使用 esbuild 打包，它不发出装饰器元数据，因此依赖项需要像 `constructor(@Inject(TodosService) todos: TodosService)` 那样命名其令牌。
- **可选包必须进行别名化。** Nest 仅在安装了的情况下加载诸如 `class-validator` 和 `@nestjs/microservices` 等包，但打包器仍会尝试解析它们。
- **应用程序在每个新的隔离环境中启动**，而该时间计入启动限制。内存中的状态在隔离环境之间不共享。
- **某些功能不可用**，例如 [WebSocket gateways](/websockets/gateways)、[shutdown hooks](/fundamentals/lifecycle-events) 和 TCP [microservice transports](/microservices/basics)。

如果您希望后端大部分使用 Workers，那么为它们编写的框架更合适。如果您想要 Nest，请在它能获得长时间运行进程的地方运行它，并在前面放置一个 Worker。