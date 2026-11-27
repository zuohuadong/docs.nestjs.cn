<!-- 此文件从 content/recipes/nextjs.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:36:16.488Z -->
<!-- 源文件: content/recipes/nextjs.md -->
<!-- 源哈希: fe052f39c3c2342114ef259c2c8e830a -->

### Next.js

一个 Next.js 应用程序可以使用 Nest 作为其后端：一个仓库，一个浏览器源，以及两个应用程序共享的请求模式。

对于小型后端，路由处理器和 Server Actions 就足够了。随着业务的增长，例如添加后台任务、webhook、公共 API、移动客户端或独立团队，它需要 Nest 提供的结构：模块、依赖注入、守卫和每个路由上的验证。Next.js 负责渲染，而 Nest 负责其背后的所有内容：

| Next.js | Nest |
| --- | --- |
| 页面、布局和 Server Components | API 及其背后的业务规则 |
| 表单和浏览器状态 | 验证表单发送的内容 |
| 渲染所需的数据获取 | 数据库和所有其他数据源 |
| | 登录、权限、webhook、队列、定时任务 |
| | 其他客户端，如移动应用 |

本页面设置了一个 Nest 应用程序与一个 Next.js 应用程序相邻，然后将后端从一个迁移到另一个：

- 两者都存在于一个仓库中，作为 npm 工作空间。
- 浏览器调用 Next.js 源上的 `/api`，Next.js 将请求传递给 Nest，因此即使没有 CORS 也能使用 Cookie。
- 共享包中的 Zod 模式验证浏览器中的表单和 Nest 中的相同请求。
- 您已有的路由处理器继续响应，一次处理一个 [move to Nest](/recipes/nextjs#migrate-a-nextjs-backend-to-nest)。

#### 项目布局

```bash
acme/
├── apps/
│   ├── api/          # Nest
│   └── web/          # Next.js
├── packages/
│   └── contracts/    # schemas and types both apps use
└── package.json

```

根 `package.json` 声明了工作空间：

```json
{
  "name": "acme",
  "private": true,
  "workspaces": ["apps/*", "packages/*"]
}

```

在不安装包的情况下创建两个应用程序，然后从根目录一次性安装所有内容：

```bash
$ npx @nestjs/cli new api --directory apps/api --skip-git --skip-install --package-manager npm
$ npx create-next-app@latest apps/web --yes --src-dir --disable-git --skip-install
$ npm install

```

`--skip-git` 也为 Nest 应用程序留下了 `.gitignore`，因此在仓库根目录添加一个：

```bash
node_modules
dist
.env

```

Next.js 开发服务器占用端口 `3000`，因此在 `apps/api/src/main.ts` 为 Nest 分配另一个端口，并将其路由放在 `/api` 下，这是浏览器将调用的路径：

```typescript title="apps/api/src/main.ts"
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ?? 3001);
}

await bootstrap();

```

#### 将 `/api` 发送到 Nest

Next.js [rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites) 将请求传递给另一个服务器并返回其响应，而浏览器看不到重定向。在 `apps/web/next.config.ts` 中，将 Next.js 应用自身不响应的每个 `/api` 请求发送到 Nest：

```typescript title="apps/web/next.config.ts"
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      fallback: [
        {
          source: '/api/:path*',
          destination: `${process.env.API_URL}/api/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;

```

浏览器与一个源通信，即 Next.js 的源。Nest 设置的 Cookie，例如会话 Cookie，会存储在该源上，并随每次请求发送回该源，因此它能到达 Nest 和 Next.js，而 Nest 不需要 [CORS](/security/cors) 配置。

`fallback` 重写在 Next.js 检查完所有页面和路由处理器（包括动态路由）之后运行。因此，现有的路由处理器，例如 `src/app/api/orders/[id]/route.ts`，会继续响应其请求，只有其余的请求到达 Nest。任何两个应用都没有的 `/api` 路径将获得 Nest 的 `404` 响应。一个 `afterFiles` 重写将在动态路由之前运行，并将该路由处理器的请求传递给 Nest。

在 `apps/web/.env.development` 中为开发设置 `API_URL`：

```bash
API_URL=http://localhost:3001

```

> warning **警告** Next.js 在构建应用程序时读取 `rewrites()`，因此必须为 `next build` 也设置 `API_URL`：应用程序启动时的不同值不会改变重写指向的位置。

API 所做的一切都会经过重写而不被更改：Cookie、用于 [webhook](/http/webhooks) 签名的原始请求体、按其编写的 [server-sent events](/http/server-sent-events) 以及使用 `ws` 适配器时的 [WebSockets](/websockets/gateways)。两个限制都失败得很惨，一个是超过 10 MB 的请求体，另一个是响应启动时间超过 30 秒，例如调用语言模型。使用 Next.js 的两个实验性选项来提高它们：

```typescript title="apps/web/next.config.ts"
const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: '100mb',
    proxyTimeout: 120_000,
  },
  // ...
};

```

Nest 也将 Next.js 服务器视为客户端，因此 `req.ip` 是其地址，任何限制每个 IP 地址请求的设置，例如 [`@nestjs/throttler`](/security/rate-limiting)，都会将所有访问者视为一个。Next.js 本身不添加 `X-Forwarded-For`，但它会传递前面负载均衡器设置的值。如果有，请在 `NestExpressApplication` 上调用 `app.set('trust proxy', 1)`。如果没有，请不设置，否则访问者可能会声称任何地址。

#### 在应用间共享模式

Nest 根据任何 [Standard Schema](https://standardschema.dev/) 模式验证请求体，例如 Zod 模式（参见 [Schema-based validation](/techniques/validation#基于模式的验证)）。将模式放在一个单独的包 `packages/contracts` 中，Next.js 应用使用与 Nest 检查请求时相同的模式验证其表单，并且两者都使用从中推断出的类型。

```json
{
  "name": "@acme/contracts",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "typescript": "^6.0.0"
  }
}

```

```json
{
  "compilerOptions": {
    "module": "nodenext",
    "target": "es2023",
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true
  },
  "include": ["src"]
}

```

```typescript title="packages/contracts/src/index.ts"
import { z } from 'zod';

export const createOrderSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(20),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const orderSchema = createOrderSchema.extend({
  id: z.string(),
  status: z.enum(['pending', 'paid', 'shipped']),
});
export type Order = z.infer<typeof orderSchema>;

```

该包被编译，因此两个应用程序导入的是纯 JavaScript 及其类型声明。将其添加到两个应用程序中并构建它（`npm run dev -w @acme/contracts` 在每次更改时都会重新构建）：

```bash
$ npm install
$ npm i --save @acme/contracts -w api -w web
$ npm run build -w @acme/contracts

```

在 Nest 中，绑定 `StandardSchemaValidationPipe` 并将模式传递给 `@Body()`：

```typescript title="apps/api/src/main.ts"
import { StandardSchemaValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  await app.listen(process.env.PORT ?? 3001);
}

await bootstrap();

```

```typescript title="apps/api/src/orders/orders.controller.ts"
import { Body, Controller, Get, Post } from '@nestjs/common';
import { createOrderSchema, type CreateOrderInput, type Order } from '@acme/contracts';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll(): Promise<Order[]> {
    return this.ordersService.findAll();
  }

  @Post()
  create(@Body({ schema: createOrderSchema }) input: CreateOrderInput): Promise<Order> {
    return this.ordersService.create(input);
  }
}

```

在 Next.js 中，表单在发送任何内容之前使用相同的模式检查其输入：

```typescript
const input = createOrderSchema.safeParse({
  productId: formData.get('productId'),
  quantity: Number(formData.get('quantity')),
});
if (!input.success) {
  setError(input.error.issues[0].message);
  return;
}
await fetch('/api/orders', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(input.data),
});

```

来自表单以外的请求，例如来自脚本或旧版本应用，仍然会被 Nest 检查：

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": [
    "productId: Too small: expected string to have >=1 characters",
    "quantity: Too big: expected number to be <=20"
  ]
}

```

要使用一个命令运行所有内容，请在根目录添加 `concurrently`，并在其 `package.json` 中添加两个脚本。共享包必须在导入它的应用程序之前构建：

```bash
$ npm i --save-dev concurrently

```

```json
{
  "scripts": {
    "dev": "npm run build -w @acme/contracts && concurrently -n contracts,api,web \"npm run dev -w @acme/contracts\" \"npm run start:dev -w api\" \"npm run dev -w web\"",
    "build": "npm run build -w @acme/contracts && npm run build -w api && npm run build -w web"
  }
}

```

#### 登录用户

登录属于 Nest，因为 API 是它保护的。[`@nestjs/authentication`](/security/authentication) 将会话保存在一个 `HttpOnly` Cookie 中，表单通过重写向 `/api/auth/sign-in` 提交以登录，就像浏览器发出的任何其他请求一样。该章节构建了它，其中一个设置是特定于在 Next.js 后面运行时。

该模块忽略来自另一个源的 `POST` 会话 Cookie，并拒绝来自该源的登录，以防止跨站请求伪造。在重写后面，Nest 自身的宿主是 `localhost:3001`，而浏览器的 `Origin` 是 `http://localhost:3000`。发送 `Sec-Fetch-Site` 的浏览器会通过，但只发送 `Origin` 的客户端将收到 `403`。因此，将 Next.js 源命名为受信任的：

```typescript title="apps/api/src/app.module.ts"
AuthenticationModule.forRoot({
  session: {
    absoluteTtl: '14d',
    idleTtl: '3d',
    trustedOrigins: [process.env.WEB_ORIGIN ?? 'http://localhost:3000'],
  },
}),

```

来自任何其他源的请求仍然被拒绝。

#### 从 Next.js 服务器调用 Nest

Server Components 和 Server Actions 在 Next.js 服务器上运行，因此它们直接调用 Nest，而无需重写。除非您转发它们，否则浏览器的 Cookie 不会随这些请求一起发送，因此将此放入一个帮助器中：

```typescript title="apps/web/src/lib/api.ts"
import { cookies } from 'next/headers';

/** Calls Nest from the Next.js server, on behalf of the browser that made the request. */
export async function api(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('cookie', (await cookies()).toString());
  return fetch(`${process.env.API_URL}/api${path}`, { ...init, headers });
}

```

```typescript title="apps/web/src/app/orders/page.tsx.ts"
import { redirect } from 'next/navigation';
import type { Order } from '@acme/contracts';
import { api } from '@/lib/api';

export default async function OrdersPage() {
  const response = await api('/orders');
  if (response.status === 401) {
    redirect('/sign-in');
  }
  const orders: Order[] = await response.json();
  return (
    <ul>
      {orders.map((order) => (
        <li key={order.id}>
          {order.productId} × {order.quantity} ({order.status})
        </li>
      ))}
    </ul>
  );
}

```

> warning **警告** 一个不读取 Cookie 的页面可能在 `next build` 期间被渲染，因此 Nest 必须可从构建中访问，否则将以 `fetch failed` 失败。

#### 将 Next.js 后端迁移到 Nest

Next.js 自身的 [backend guide](https://nextjs.org/docs/app/guides/backend-for-frontend) 声明其后端功能“不是完整的后端替代品”。Next.js 后端工作良好，直到它必须成为一个后端，超过这一点，一个单独的后端可能是两者中更简单的。

##### 为什么它可能更简单

代码量没有减少。相同的四个端点（列出、创建、读取和取消订单，针对已登录用户）在路由处理程序中的行数与 Nest 控制器和服务中的行数大致相同。改变的是您需要记住的内容：

| | 路由处理程序 | Nest |
| --- | --- | --- |
| 检查会话 | 在每个处理程序中，这里四次。忘记的处理器是公开的 | 一次，在 [global guard](/security/authentication) 中。新路由回答 `401`，直到您将其标记为 `@Public()` |
| 验证主体 | 每个处理程序解析它并构建自己的 `400` | `@Body({ schema })`，并且处理器仅在输入有效时运行 |
| 缺少记录 | 每个处理程序构建自己的 `404`，帮助器无法为其终止请求 | 可从任何地方，例如服务中，通过 `throw new NotFoundException()` |
| 测试逻辑 | 处理程序读取 `cookies()`，该读取会抛出 `was called outside a request scope`，因此测试必须模拟 `next/headers` | 服务是一个类：`new OrdersService()`，没有 HTTP 也没有框架模拟 |
| 查找端点 | 每个路径一个文件，路径在文件夹名称中 | 每个资源一个控制器 |
| 定时任务 | 没有内置功能，因此平台必须调用 URL | `@Cron()`，在与应用程序其余部分相同的进程中 |
| WebSockets | 相同的指南说，在处理程序作为 lambda 函数部署的地方将无法工作 | [Gateways](/websockets/gateways) |

以下是两者中的这四个端点之一。作为路由处理程序：

```typescript title="apps/web/src/app/api/orders/[id]/cancel/route.ts"
import { NextResponse } from 'next/server';
import { db, getSession } from '@/lib/backend';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const order = db.find(id);
  if (!order || order.userId !== session.userId) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  order.status = 'cancelled';
  return NextResponse.json(order);
}

```

其他处理程序重复了它的前几行。在 Nest 中，守卫已经检查了会话，服务持有规则，其他方法可以重用它，测试也可以访问它：

```typescript title="apps/api/src/orders/orders.controller.ts"
@Post(':id/cancel')
@HttpCode(200)
cancel(@CurrentUser() user: User, @Param('id') id: string) {
  return this.ordersService.cancel(user.id, id);
}

```

```typescript title="apps/api/src/orders/orders.service.ts"
findOne(userId: string, id: string) {
  const order = this.rows.get(id);
  if (!order || order.userId !== userId) {
    throw new NotFoundException();
  }
  return order;
}

cancel(userId: string, id: string) {
  const order = this.findOne(userId, id);
  order.status = 'cancelled';
  return order;
}

```

```typescript title="apps/api/src/orders/orders.service.spec.ts"
it("doesn't let another user cancel an order", () => {
  const orders = new OrdersService();
  const { id } = orders.create('u1', { productId: 'kibble', quantity: 1 });
  expect(() => orders.cancel('u2', id)).toThrow(NotFoundException);
});

```

您可以通过帮助器取得部分进展：一个 `withSession()` 包装器，然后一个用于验证的包装器，然后一个将错误转换为响应的包装器。这是一个合理的步骤，它也是编写您自己的守卫、管道和异常过滤器的过程。

但这需要付出代价。需要部署第二个应用程序，需要配置重写，并且在 Server Component 和其数据之间存在网络跳跃。如果您的后端只是带有单个客户端的几个处理程序，没有后台工作，请继续使用路由处理程序。

##### 放在哪里

在 Nest 中编写新端点，并在下次更改现有端点时移动它们。Next.js 后端中的每个部分都有去处：

| 在 Next.js 中 | 在 Nest 中 |
| --- | --- |
| 一个路由处理程序 | 一个 [controller](/overview/controllers) 方法 |
| Server Component 或 Server Action 中的数据库查询 | 一个位于端点后面的 [service](/overview/providers)，通过 `api()` 调用 |
| 每个处理程序顶部的 `getSession()` | [`@nestjs/authentication`](/security/authentication) 的全局守卫，以及 `@CurrentUser()` |
| 手动检查 `request.json()` | `@Body({ schema })` |
| 处理程序内的角色检查 | [`@nestjs/authorization`](/security/authorization) |
| 读取 `request.text()` 的 Webhook 路由处理程序 | 来自 [`@nestjs/webhooks`](/http/webhooks) 的 `@VerifyWebhook()` |
| 平台调用的 cron 路由 | 来自 [`@nestjs/schedule`](/techniques/task-scheduling) 的 `@Cron()` |
| 使用 `after()` 开始的工作，例如发送电子邮件 | 一个 [queue](/techniques/queues)，以及 [`@nestjs/mail`](/application/mail) |

##### 移动一个路由

在 Nest 中使用相同的路径编写端点，然后删除路由处理程序。URL 不变，因此客户端也不变。由于路由处理程序在重写之前执行，直到您删除路由处理程序之前，两者都可以存在于代码中。

然后检查客户端能看到什么：

- **状态码。** `NextResponse.json()` 在 `POST` 上回答 `200`，而 Nest `POST` 在没有添加 `@HttpCode(200)` 的情况下回答 `201`。
- **错误的形状**，现在是 `{ statusCode, message, error }`。如果客户端依赖于旧的形状，则 [global exception filter](/migrating/express#keep-what-would-change-without-an-error) 会保持旧的形状。
- **动态段。** `[id]` 变为 `:id`，一个捕获所有 `[...path]` 变为 `*path`，其 `@Param('path')` 是一个段数组。

##### 将查询移出页面

直接查询数据库的 Server Component 或 Server Action 会发起一个请求，查询会移动到 Nest 服务中：

```typescript title="apps/web/src/app/orders/actions.ts"
'use server';

import { revalidatePath } from 'next/cache';
import { createOrderSchema } from '@acme/contracts';
import { api } from '@/lib/api';

export async function placeOrder(formData: FormData) {
  const input = createOrderSchema.parse({
    productId: formData.get('productId'),
    quantity: Number(formData.get('quantity')),
  });
  const response = await api('/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error('The order was refused.');
  }
  revalidatePath('/orders');
}

```

当 `apps/web` 中不再导入数据库客户端时，请将其从 Next.js 应用程序中删除，这样页面就无法绕过 API。

#### 部署

两个应用程序是单独部署的。无论平台如何，顺序相同：构建 `@acme/contracts`，然后应用程序，将 `API_URL` 设置为 `next build`。

Nest 可以在 Node.js 运行的任何地方运行（参见 [Deployment](/deployment)）。如果将 Next.js 应用程序部署在 Vercel 上，请在其环境中设置 `API_URL` 为 Nest 的地址。Vercel 也可以 [deploy Nest](https://vercel.com/docs/frameworks/backend/nestjs)，作为一个独立项目。其他客户端，例如移动应用程序，直接调用 Nest 的地址，并且只有当它们在另一个源的浏览器中运行时才需要 [CORS](/security/cors) 配置。