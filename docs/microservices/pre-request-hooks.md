<!-- 此文件从 content/microservices/pre-request-hooks.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T09:39:18.653Z -->
<!-- 源文件: content/microservices/pre-request-hooks.md -->
<!-- 源哈希: 63bf077c8c53b4d41b6c7d9539f0822f -->

### 请求前钩子

请求前钩子是在每次调用模式处理器时，于所有增强器（守卫、拦截器和管道）之前运行的函数。它们相当于微服务中的 HTTP 中间件：一个用于建立每请求上下文的地方，该上下文必须对守卫以及管道的其余部分可见。

> info **提示** `PreRequestHook` 接口从 `@nestjs/common` 包中导出。

钩子在以下序列的开头运行：

```

Incoming message
  └─ Pre-request hooks  (registration order)
       └─ Guards
            └─ Interceptors
                 └─ Pipes
                      └─ Handler

```

钩子内部抛出的异常会被覆盖管道其余部分的同一个包装器捕获，因此你现有的 [exception filters](/microservices/exception-filters) 无需额外配置即可处理它们。

#### 绑定钩子

在微服务初始化之前（即在调用 `app.listen()` 或 `app.init()` 之前），使用 `registerPreRequestHook()` 方法在微服务实例上注册钩子。初始化之后注册的钩子会被忽略，并且 Nest 会记录一条警告。多次调用会按注册顺序累积钩子。

每个钩子接收一个 `ExecutionContext` 和一个 `next` 函数。调用 `next()` 会前进到下一个钩子，或者在没有剩余钩子时，前进到守卫 → 拦截器 → 管道 → 处理器管道。钩子必须返回一个 `Observable`：要么是 `next()` 产生的那个，要么是包装它的那个。

> warning **警告** 如果钩子不调用 `next()`，处理器将永远不会运行。这与 HTTP 中间件的约定相同。

> info **注意** 在 [hybrid application](/faq/hybrid-application) 中，`connectMicroservice()` 会立即初始化所连接的微服务（除非你在其第二个参数中传入 `deferInitialization: true`），因此之后在返回的实例上注册的钩子不会被应用。

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    { transport: Transport.TCP },
  );

  app.registerPreRequestHook((ctx, next) => {
    return next();
  });

  await app.listen();
}
await bootstrap();

```

#### AsyncLocalStorage 传播

一个常见的用例是在守卫运行之前初始化 `AsyncLocalStorage`，这会使存储在整个管道中都可用：

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { Observable } from 'rxjs';
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import { AppModule } from './app.module.js';

export const als = new AsyncLocalStorage<{ correlationId: string }>();

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    { transport: Transport.TCP },
  );

  app.registerPreRequestHook((ctx, next) => {
    return new Observable(subscriber => {
      als.run({ correlationId: randomUUID() }, () => {
        next().subscribe(subscriber);
      });
    });
  });

  await app.listen();
}
await bootstrap();

```

由于钩子在守卫之前运行，`als.getStore()` 会在任何守卫、拦截器或处理器中返回已初始化的存储：

```typescript title="correlation.guard.ts"
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { als } from './main.js';

@Injectable()
export class CorrelationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { correlationId } = als.getStore()!;
    return true;
  }
}

```

#### 日志与指标

你可以对 `next()` 返回的 `Observable` 应用 RxJS 操作符，以观察完整的处理器生命周期：

```typescript title="main.ts"
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

app.registerPreRequestHook((ctx, next) => {
  const handler = ctx.getHandler().name;
  const start = Date.now();

  return next().pipe(
    tap(() => console.log(`[${handler}] completed in ${Date.now() - start}ms`)),
    catchError(err => {
      console.error(`[${handler}] failed:`, err.message);
      return throwError(() => err);
    }),
  );
});

```

> info **提示** 请求前钩子是全局的：你无法为单个模式注册它们。当没有注册任何钩子时，Nest 会完全跳过钩子链，因此该特性不会带来额外开销。请求前钩子不适用于 WebSocket 网关。