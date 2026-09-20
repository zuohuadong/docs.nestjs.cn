<!-- 此文件从 content/microservices/pre-request-hooks.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:05:16.890Z -->
<!-- 源文件: content/microservices/pre-request-hooks.md -->
<!-- 源哈希: 99f499459dadabfa3fd7d8475cda3ffa -->

### 请求前钩子

请求前钩子是在每个传入的模式处理器调用之前，在所有增强器（守卫、拦截器、管道）之前运行的函数。它们是微服务中与 HTTP 中间件等价的概念：用于建立每个请求的上下文，该上下文必须对守卫和管道的其余部分可见。

> info **提示** `PreRequestHook` 接口从 `@nestjs/common` 包中导出。

钩子按以下顺序执行：

```

Incoming message
  └─ Pre-request hooks  (registration order)
       └─ Guards
            └─ Interceptors
                 └─ Pipes
                      └─ Handler

```

钩子内部抛出的异常由覆盖整个管道的同一个 `RpcProxy` 包装器捕获，因此现有的 [exception filters](/microservices/exception-filters) 无需额外配置即可处理它们。

#### 绑定钩子

在调用 `app.listen()` 之前，使用 `registerPreRequestHook` 在应用实例上注册钩子。多次调用会按注册顺序累积钩子。

每个钩子接收一个 `ExecutionContext` 和一个 `next` 函数。调用 `next()` 会前进到下一个钩子，或者当没有剩余钩子时，前进到守卫 → 拦截器 → 管道 → 处理器管道。钩子必须返回由 `next()` 产生的 `Observable`。

> warning **警告** 如果钩子不调用 `next()`，处理器将永远不会执行——这与 HTTP 中间件的约定相同。

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';

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
bootstrap();

```

#### AsyncLocalStorage 传播

一个常见的用例是在守卫运行之前初始化 `AsyncLocalStorage`，使存储在整个管道中可用。

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { Observable } from 'rxjs';
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import { AppModule } from './app.module';

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
bootstrap();

```

由于钩子在守卫之前运行，`als.getStore()` 会在任何守卫、拦截器或处理器中返回已初始化的存储：

```typescript title="correlation.guard.ts"
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { als } from './main';

@Injectable()
export class CorrelationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { correlationId } = als.getStore()!;
    return true;
  }
}

```

#### 日志记录和指标

可以将 RxJS 操作符应用于由 `next()` 返回的 `Observable`，以观察完整的处理器生命周期：

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

> info **提示** `registerPreRequestHook` 仅支持全局——不支持按模式注册。当没有注册钩子时，管道会走与引入此功能之前相同的快速路径。WebSocket 网关支持有意不在范围内。