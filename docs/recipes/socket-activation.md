<!-- 此文件从 content/recipes/socket-activation.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:37:04.062Z -->
<!-- 源文件: content/recipes/socket-activation.md -->
<!-- 源哈希: 2e1f2b8c90badc15946d76155878a9b9 -->

### Socket 激活

使用 socket 激活时，服务管理器会打开监听应用程序的 socket。[systemd](https://systemd.io/) 在端口上监听，在收到第一个连接时启动应用程序，并将 socket 交给应用程序。在应用程序启动或重启期间到达的连接会等待内核队列，而不是被拒绝。

这对于很少被调用的服务（例如内部工具、管理面板或开发/暂存机器上的许多服务）非常有用。如果应用程序在一段时间内没有请求而退出，则此类服务在无人使用时不会占用内存。代价是冷启动：在暂停后收到的第一个请求需要等待 Node.js 加载应用程序并启动 Nest。

> info **提示** 由服务管理器传递的 socket 上的监听是 Node.js [`server.listen()`](https://nodejs.org/api/net.html#serverlistenhandle-backlog-callback) 的特性。它不支持 Windows。

#### systemd 单元

创建一个 socket 单元，例如 `/etc/systemd/system/my-app.socket`：

```bash
[Socket]
ListenStream=3000

[Install]
WantedBy=sockets.target

```

旁边创建一个同名服务单元，`/etc/systemd/system/my-app.service`：

```bash
[Service]
WorkingDirectory=/srv/my-app
ExecStart=/usr/bin/node dist/main.js
Restart=on-failure

```

然后只启用 socket。systemd 在收到第一个连接时启动 `my-app.service`：

```bash
$ sudo systemctl daemon-reload
$ sudo systemctl enable --now my-app.socket

```

> warning **警告** 不要直接在 `ExecStart` 中启动 `node`。systemd 将 socket 作为文件描述符 `3` 传递，并设置 `LISTEN_FDS` 和 `LISTEN_PID` 环境变量，其中 `LISTEN_PID` 是它启动的进程的 ID。如果中间有 `npm start`、`nest start` 或 shell 脚本，`LISTEN_PID` 不匹配应用程序的进程。下面的引导过程将回退到监听端口，这会因为 systemd 已经持有该端口而失败，出现 `EADDRINUSE`。

> info **提示** 要尝试不使用单元文件，请运行 `systemd-socket-activate --listen=3000 node dist/main.js`。它以相同的方式传递 socket，但只启动应用程序一次。除非使用 `--setenv=NODE_ENV` 命名，否则它也不会转发诸如 `NODE_ENV` 这样的变量。

#### 引导

在您的 `main.ts` 文件中，当应用程序以这种方式启动时，监听传递的 socket；否则监听端口：

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  // Set by systemd when it passes the listening socket to this process
  const activated =
    process.env.LISTEN_FDS === '1' &&
    process.env.LISTEN_PID === String(process.pid);

  if (activated) {
    await app.listen({ fd: 3 } as any);
  } else {
    await app.listen(process.env.PORT ?? 3000);
  }
}

await bootstrap();

```

Express 和 Node 适配器将选项对象原样传递给 Node.js 的 `server.listen()`，但它们的 `listen()` 类型定义只接受端口，因此需要类型转换。Fastify 适配器在其类型化的监听选项中接受 `fd`：

```typescript
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter(),
);
// ...
await app.listen({ fd: 3 });

```

#### 空闲时退出

systemd 不会自动停止应用程序。要释放其内存，让应用程序在一段时间没有请求的情况下退出，systemd 会在下一次连接时重新启动它。以下辅助函数计算底层 HTTP 服务器上的在途请求，因此它适用于所有适配器，并且也能看到未到达路由处理程序的请求：

```typescript title="exit-when-idle.ts"
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';

export function exitWhenIdle(app: INestApplication, idleMs: number) {
  const server: Server = app.getHttpServer();
  let inFlight = 0;
  let timer: NodeJS.Timeout | undefined;

  const scheduleExit = () => {
    timer = setTimeout(async () => {
      await app.close();
      process.exit(0);
    }, idleMs);
  };

  server.on('request', (req, res) => {
    inFlight++;
    clearTimeout(timer);
    res.once('close', () => {
      if (--inFlight === 0) {
        scheduleExit();
      }
    });
  });
  scheduleExit();
}

```

在应用程序开始监听传递的 socket 后调用它：

```typescript
if (activated) {
  await app.listen({ fd: 3 } as any);
  exitWhenIdle(app, 5 * 60_000); // Exit after 5 minutes without requests
}

```

`app.close()` 执行与 systemd 使用 `SIGTERM` 停止服务时 `enableShutdownHooks()` 执行相同的 [shutdown hooks](/fundamentals/lifecycle-events#application-shutdown)。退出代码 `0` 告诉 systemd 服务已干净停止，因此 `Restart=on-failure` 不会再次启动它。systemd 会保持自己的 socket 副本打开，因此在应用程序退出期间到达的连接会等待下一次启动。

该辅助函数仅计算 HTTP 请求。服务端推送事件流会一直计数直到客户端断开连接，但打开的 WebSocket 连接不会。如果您的应用程序使用 WebSocket，请也计算服务器 `upgrade` 事件的 socket 直到它们关闭。

#### 需要注意的事项

- 使用 `Restart=on-failure`，而不是 `Restart=always`。使用 `always`，systemd 会在应用程序空闲退出后立即重新启动它。
- 向应用程序发送请求的健康检查和正常运行时间监控会启动并保持应用程序运行。
- 计划任务（参见 [Task scheduling](/techniques/task-scheduling)）和队列消费者在应用程序停止时不会运行。请在保持运行的进程中运行它们。
- 暂停后收到的第一个请求需要等待整个引导过程，包括由 [async providers](/fundamentals/async-components) 打开的数据库连接。[Serverless](/faq/serverless) 章展示了缩短此过程的方法。Node.js 也可以在启动之间重用其 [compile cache](https://nodejs.org/api/module.html#module-compile-cache)：将 `Environment=NODE_COMPILE_CACHE=/var/cache/my-app` 和 `CacheDirectory=my-app` 添加到服务单元中。Node.js 在进程退出时写入缓存，而进程被 `SIGTERM` 杀死且没有 `enableShutdownHooks()` 时不会写入。