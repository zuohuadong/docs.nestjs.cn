<!-- 此文件从 content/ai/tools.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:35:20.489Z -->
<!-- 源文件: content/ai/tools.md -->
<!-- 源哈希: 599d3944c3fd30dadeace345e4b64940 -->

### 工具

代理函数是您提供者中的一个方法，模型可以调用它，并传入它填充的参数，用于查找信息或更改信息：模型读取该方法返回的内容，然后调用更多函数或给出回答。您编写一个代理函数；模型将其作为工具提供给它。

商店助手的助手回答有关订单的问题，因此其模型必须查找订单。在 `@nestjs/ai` 中，执行此操作的方法使用 `@AgentFunction()` 进行装饰，并且它会像模型代表的用户一样，经过其类和方法的守卫、拦截器、管道和异常过滤器。它只需要 `@nestjs/ai` 以外的任何东西。

#### 定义代理函数

`inputSchema` 描述了函数的参数：模型会收到其 JSON Schema，并且在方法运行前，每次调用都会根据该 Schema 进行验证。模型根据函数名称和描述选择一个函数，并从其 `.describe()` 文本中填充参数：

```typescript title="orders/orders.tools.ts"
import { Injectable, NotFoundException } from '@nestjs/common';
import { AgentFunction } from '@nestjs/ai';
import * as z from 'zod';
import { OrdersService } from './orders.service.js';

@Injectable()
export class OrdersTools {
  constructor(private readonly orders: OrdersService) {}

  @AgentFunction({
    name: 'find-order',
    description: 'Find an order by its id, with its status',
    inputSchema: z.object({
      orderId: z.string().describe('The order id, such as ord_123'),
    }),
  })
  async find({ orderId }: { orderId: string }) {
    const order = await this.orders.findById(orderId);
    if (!order) {
      throw new NotFoundException(`There is no order ${orderId}`);
    }
    return { id: order.id, status: order.status, total: order.total };
  }
}

```

`@AgentFunction()` 接受四个可选选项：

- **`name`**: 调用者如何列出该函数，以及模型如何调用它。默认为方法的名称，并且必须是 1 到 64 个字符，来自 `A-Z a-z 0-9 _ -`，这是模型提供者接受的工具名称。
- **`description`**: 对模型而言，该函数的作用。
- **`inputSchema`**: 作为一个对象 Schema 的其参数。如果没有，则函数不接受任何参数。
- **`scopes`**: 调用者必须持有的作用域：参见 [Who the agent acts for](/ai/tools#who-the-agent-acts-for)。

像其他任何一样将类注册为提供者：

```typescript title="orders/orders.module.ts"
@Module({
  providers: [OrdersService, OrdersTools],
  exports: [OrdersService],
})
export class OrdersModule {}

```

`AiModule` 查找应用程序中每个模块的代理函数；其自身的 `include` 选项将搜索限制在其列出的模块内。

#### 为调用提供工具

一个调用在 `tools` 中列出了其模型可使用的代理函数，按名称或按提供者类（该类的每个代理函数）列出，并使用 `caller` 说明它代表谁：

```typescript title="assistant/assistant.controller.ts"
import { Body, Controller, Post, Req } from '@nestjs/common';
import { AiService } from '@nestjs/ai';
import type { Request } from 'express';

@Controller('assistant')
export class AssistantController {
  constructor(private readonly ai: AiService) {}

  @Post('questions')
  async ask(@Body() body: { question: string }, @Req() request: Request) {
    const { text } = await this.ai.generateText({
      instructions:
        'You help customers of the cat store with their orders. ' +
        'Look an order up before you answer about it.',
      prompt: body.question,
      tools: ['find-order'],
      caller: { request },
    });
    return { answer: text };
  }
}

```

模型被提供调用中列出的函数作为工具，没有其他。当它调用其中一个时，参数会根据函数的 Schema 进行验证，方法运行，其返回的内容被发送回模型，模型接着调用更多函数或给出回答。模型的每个回答是一个模型调用，而 `maxSteps`，默认为 10，限制了每次调用可以执行的次数：参见 [The agent loop](/ai/agents#the-agent-loop)。Schema 拒绝的参数永远不会到达方法或其守卫：模型会被告知哪里出错，然后可以重试。

错误尽早失败：

- 调用列出了不存在的代理函数，或列出了没有代理函数的类，在发送任何内容之前就会被拒绝：`There is no agent function named "find-orders". Agent functions: find-order, change-address.`
- 模型提供者拒绝的名称在启动时失败，命名该方法。具有相同名称的两个代理函数以及在请求作用域提供者上的代理函数也会如此：请通过 `caller` 传递调用所需的内容。
- 同样，如果 Schema 不是具有 JSON Schema 的标准 Schema，或者没有描述一个对象，也会失败。

模型将方法返回的内容读取为 JSON：一个 ISO 字符串形式的 `Date`，以及 `undefined` 作为 `null`。也为 MCP 客户端提供服务的​​方法可能返回一个 MCP `CallToolResult`：模型读取其 `structuredContent`，否则读取其连接的文本块。图像、音频和其他块不会到达模型，日志中会发出警告。带有 `isError: true` 的结果是一个工具错误，附带其文本。

#### 调用上下文

代理函数会与其参数和一个来自 `@nestjs/ai` 的 `AgentFunctionContext` 一起被调用：

| 属性 | 含义 |
| --- | --- |
| `name` | 代理函数的名称 |
| `request` | 调用运行的 HTTP 请求，`caller.request`，带有其头部以及您设置的 `user` 认证信息 |
| `user`, `scopes` | `caller.user` 和 `caller.scopes`：在没有请求的情况下调用代表谁，例如队列任务 |
| `toolCallId` | 模型用于此工具调用的 ID，用于将函数日志与对话关联起来 |
| `idempotencyKey` | 在 [durable run](/ai/agents#durable-agent-runs) 中，对本次调用的每次尝试都相同；在其他地方则不同 |
| `messages` | 模型在调用函数时所阅读的对话，不包括系统提示 |
| `signal` | 一个 `AbortSignal`，当调用被中止时，将其传递给 `fetch()` 和您的数据库 |
| `reportProgress(progress, total?, message?)` | 在 [streamed answer](/ai/agents#streaming-to-the-browser) 中，向浏览器发送调用的进度；在其他地方，不执行任何操作 |

`change-address` 允许助手更改订单的配送地址。它将调用的 `signal` 传递给数据库，一个守卫会检查订单是否属于该客户：

```typescript title="assistant/assistant.tools.ts"
import { Injectable, UseGuards } from '@nestjs/common';
import { AgentFunction, type AgentFunctionContext } from '@nestjs/ai';
import * as z from 'zod';
import { OrdersService } from '../orders/orders.service.js';
import { OrderOwnerGuard } from './order-owner.guard.js';

@Injectable()
export class AssistantTools {
  constructor(private readonly orders: OrdersService) {}

  @AgentFunction({
    name: 'change-address',
    description:
      'Change the delivery address of an order that has not shipped yet',
    inputSchema: z.object({
      orderId: z.string().describe('The order id, such as ord_123'),
      address: z.string().min(10).describe('The full new address'),
    }),
  })
  @UseGuards(OrderOwnerGuard)
  async changeAddress(
    { orderId, address }: { orderId: string; address: string },
    ctx: AgentFunctionContext,
  ) {
    const order = await this.orders.changeAddress(orderId, address, {
      signal: ctx.signal,
    });
    return { id: order.id, address: order.address };
  }
}

```

#### 代理代表谁

`caller` 说明了调用代表谁，代理函数、其守卫和认证包从上下文中读取它：

- **`request`**: 在路由中，Express、Fastify 或 Node 适配器的 HTTP 请求，由 `@Req()` 注入。函数将其视为 `ctx.request`，带有您设置的 `user` 认证信息，就像路由的守卫所做的那样。
- **`user`** 和 **`scopes`**: 在没有请求的情况下，例如队列任务或定时任务，调用代表谁以及他们可以做什么。它们是 `ctx.user` 和 `ctx.scopes`。

其 `@AgentFunction()` 声明需要 `scopes` 的代理函数，仅对持有这些权限的调用者运行：否则，在任何守卫运行之前调用就会被拒绝，模型会读取 `Forbidden: this tool needs the scope(s) orders:refund`。一个夜间任务会审查没有人回答的退款请求，就像商店的退款机器人一样：

```typescript title="refunds/refund-review.service.ts"
import { Injectable } from '@nestjs/common';
import { AiService } from '@nestjs/ai';

@Injectable()
export class RefundReviewService {
  constructor(private readonly ai: AiService) {}

  review(ticket: { body: string }) {
    return this.ai.generateText({
      label: 'refund-review',
      instructions:
        'Decide whether the refund request is justified, and refund the ' +
        'order if it is.',
      prompt: ticket.body,
      tools: ['find-order', 'refund'],
      caller: {
        user: { id: 'refund-bot', team: 'support' },
        scopes: ['orders:refund'],
      },
    });
  }
}

```

调用者缺少任何内容都不会被补足：没有 `caller` 的调用将以没有请求、没有用户和没有作用域的方式运行其代理函数。

#### 守卫、拦截器、管道和过滤器

每个代理函数调用都会经过绑定在类上、方法上或全局的 Nest 的增强器，就像路由一样。其执行上下文的类型是 `'ai'`，而 `AiExecutionContext` 读取该调用。客户只能更改自己的订单：

```typescript title="assistant/order-owner.guard.ts"
import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { AiExecutionContext, type AiContextType } from '@nestjs/ai';
import { OrdersService } from '../orders/orders.service.js';

@Injectable()
export class OrderOwnerGuard implements CanActivate {
  constructor(private readonly orders: OrdersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType<AiContextType>() !== 'ai') {
      return false;
    }
    const call = AiExecutionContext.create(context);
    const { orderId } = call.getInput<{ orderId: string }>();
    const order = await this.orders.findById(orderId);
    return order?.customerId === call.getRequest()?.user?.id;
  }
}

```

`AiExecutionContext.create(context)` 具有 `getType()`、`getInput()`（参数，也是 `switchToRpc().getData()`）、`getContext()`（`AgentFunctionContext`）、`getName()` 和 `getRequest()`。一个代理函数调用按以下顺序经过这些：

1. 参数根据函数的模式进行验证。
2. 函数的 `scopes` 与调用者的进行检查。
3. 守卫运行，先是全局的，然后是拦截器和管道，类似于路由处理程序周围的执行。
4. 方法运行，带有参数和上下文。

管道将参数视为调用的 `body`，因此一个 `ValidationPipe` 会验证您用其定义的 DTO 类，在函数模式之后；它们将上下文视为一个 `custom` 参数，该参数由 `ValidationPipe` 跳过。使用 `createParamDecorator()` 创建的自定义参数装饰器在参数和上下文之后工作：`changeAddress(input, ctx, @CurrentUser() user)`。

拦截器在模型执行之前看到方法的返回值。此拦截器记录每次调用，包括模型工具调用的 id：

```typescript title="common/tool-audit.interceptor.ts"
import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { AiExecutionContext } from '@nestjs/ai';
import { tap, type Observable } from 'rxjs';

@Injectable()
export class ToolAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AgentFunctions');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const call = AiExecutionContext.create(context);
    const { toolCallId } = call.getContext();
    return next
      .handle()
      .pipe(tap(() => this.logger.log(`${call.getName()} (${toolCallId})`)));
  }
}

```

代理函数抛出的任何内容都会作为模型可以恢复的错误到达模型，并告知用户：守卫的拒绝作为 `Forbidden resource`，`HttpException`（一个 `BadRequestException('The address has no postcode')`）的消息，以及任何其他错误的 `Internal server error`，Nest 的异常处理器会记录该错误，且其消息永远不会到达模型。异常过滤器可以提供替代答案：它返回的是函数的结果。

> 警告 **警告** 全局守卫、拦截器和过滤器（`APP_GUARD`、`app.useGlobalGuards()`）也会在代理函数调用上运行，就像在 MCP 调用上一样。为 HTTP 路由编写的读取 `context.switchToHttp()` 的增强器应首先检查 `context.getType() === 'http'`。

#### 同时为 MCP 客户端服务

Order API 已经有一个 [MCP server](/mcp/overview)，其客户端（支持团队的助手）也会调用 `find-order`。一个方法为两个消费者提供服务：它从 [`@nestjs/mcp`](/mcp/primitives#tools) 携带 MCP 客户端的 `@Tool()`，以及应用程序代理的 `@AgentFunction()`，每个都有自己的选项。没有一个装饰器会读取另一个的：仅带有 `@Tool()` 的方法不是代理函数，仅带有 `@AgentFunction()` 的方法不是 MCP 工具。一个模式常量可以避免重复编写模式：

```typescript title="orders/orders.tools.ts"
import { Injectable, NotFoundException, UseGuards } from '@nestjs/common';
import { AgentFunction } from '@nestjs/ai';
import { Tool } from '@nestjs/mcp';
import * as z from 'zod';
import { OrderVisibilityGuard } from './order-visibility.guard.js';
import { OrdersService } from './orders.service.js';

const FindOrderInput = z.object({
  orderId: z.string().describe('The order id, such as ord_123'),
});

@Injectable()
export class OrdersTools {
  constructor(private readonly orders: OrdersService) {}

  @Tool({
    name: 'find-order',
    description: 'Find an order by its id, with its status',
    inputSchema: FindOrderInput,
    annotations: { readOnlyHint: true },
  })
  @AgentFunction({
    name: 'find-order',
    description: 'Find an order by its id, with its status',
    inputSchema: FindOrderInput,
  })
  @UseGuards(OrderVisibilityGuard)
  async find({ orderId }: { orderId: string }) {
    const order = await this.orders.findById(orderId);
    if (!order) {
      throw new NotFoundException(`There is no order ${orderId}`);
    }
    return { id: order.id, status: order.status, total: order.total };
  }
}

```

每个消费者找到自己的装饰器：`McpModule` 为其 `include` 列出的模块的 `@Tool()` 方法提供服务，而 `AiModule` 找到 `@AgentFunction()` 方法：

```typescript title="app.module.ts"
@Module({
  imports: [
    AiModule.forRoot({
      isGlobal: true,
      models: { default: anthropic('claude-opus-5-5') },
    }),
    McpModule.forRoot({
      name: 'cat-store',
      version: '1.0.0',
      include: [OrdersModule],
    }),
    OrdersModule,
    AssistantModule,
  ],
})
export class AppModule {}

```

MCP 客户端获得 `find-order`，助手可以调用 `find-order` 和 `change-address`，后者没有 `@Tool()`。

这两种调用的上下文类型不同：MCP 客户端调用的上下文是 `'mcp'`，由 `McpExecutionContext` 读取；代理调用的上下文是 `'ai'`，由 `AiExecutionContext` 读取。服务于这两种调用的方法的守卫、拦截器和过滤器都会看到两者，并使用 `context.getType()` 将它们区分开来。`find-order` 通过助手仅向客户显示其自己的订单，而向支持团队的 MCP 客户端显示所有订单：

```typescript title="orders/order-visibility.guard.ts"
import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { AiExecutionContext, type AiContextType } from '@nestjs/ai';
import type { McpContextType } from '@nestjs/mcp';
import { OrdersService } from './orders.service.js';

@Injectable()
export class OrderVisibilityGuard implements CanActivate {
  constructor(private readonly orders: OrdersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    switch (context.getType<AiContextType | McpContextType>()) {
      case 'mcp':
        return true;
      case 'ai': {
        const call = AiExecutionContext.create(context);
        const { orderId } = call.getInput<{ orderId: string }>();
        const order = await this.orders.findById(orderId);
        return !order || order.customerId === call.getRequest()?.user?.id;
      }
      default:
        return false;
    }
  }
}

```

方法的第二个参数是 MCP 客户端调用的 `McpContext`，是代理调用的 `AgentFunctionContext`。使用 `createParamDecorator()` 创建的自定义参数装饰器也对这两种调用运行，它们收到的 `ExecutionContext` 的类型取决于它们运行的调用类型。

#### 使用 `@nestjs/authentication` 和 `@nestjs/authorization`

[`@nestjs/authentication`](/security/authentication) 和 [`@nestjs/authorization`](/security/authorization) 像读取 MCP 客户端调用一样读取代理函数调用：从其参数中，并带有调用运行的请求。在路由中，全局认证守卫会认证其运行的请求中的每次调用（一次：路由的结果被重用），`@CurrentUser()` 和 `AuthenticationContext` 在代理函数中工作，而 `@Can()` 策略决定每次调用。声明了没有 `@Can()` 的代理函数将被拒绝，就像路由一样，模型读取 `Forbidden`：

```typescript title="orders/orders.tools.ts"
@AgentFunction({
  name: 'cancel-order',
  description: 'Cancel an order that has not shipped yet',
  inputSchema: z.object({ orderId: z.string() }),
})
@Can(OrderPolicy, 'cancel')
cancel(
  { orderId }: { orderId: string },
  ctx: AgentFunctionContext,
  @CurrentUser() customer: Customer,
) {
  return this.orders.cancel(orderId, customer.id);
}

```

在任务中，没有请求。`@Can()` 在上下文中找到调用者的 `user`，认证守卫将该调用视为匿名，就像在 stdio 上一样，因此标记调用任务的代理函数的提供者 `@Public()`：

```typescript title="refunds/refund.tools.ts"
@Injectable()
@Public()
export class RefundTools {
  constructor(private readonly orders: OrdersService) {}

  @AgentFunction({
    name: 'refund',
    description: 'Refund an order to the card it was paid with',
    inputSchema: z.object({ orderId: z.string() }),
    scopes: ['orders:refund'],
  })
  @Can(OrderPolicy, 'refund')
  refund({ orderId }: { orderId: string }) {
    return this.orders.refund(orderId);
  }
}

```

拒绝是 Nest 的 `UnauthorizedException` 或 `ForbiddenException`，就像在路由上一样，模型将其读取为工具的错误：`Unauthorized` 或 `Forbidden`。

> 信息 **提示** 这需要 `@nestjs/authentication` 0.1.4 和 `@nestjs/authorization` 0.1.2 或更高版本，这些是了解 `'ai'` 上下文类型的第一个版本。

#### 在您自己的 AI SDK 调用中的工具

`AiTools` 将代理函数转换为 AI SDK 的工具：`select()` 接收调用 `tools` 的相同列表，以及它们调用的 `caller`，用于调用 AI SDK 的代码。函数保留其模式、作用域和增强器：

```typescript title="support/summaries.service.ts"
@Injectable()
export class SummariesService {
  constructor(
    @InjectModel('fast') private readonly model: LanguageModel,
    private readonly tools: AiTools,
  ) {}

  summarize(thread: string, request: Request) {
    return generateText({
      model: this.model,
      prompt: thread,
      tools: this.tools.select(['find-order'], { caller: { request } }),
      stopWhen: stepCountIs(3),
    });
  }
}

```

`stopWhen` 和 `stepCountIs()` 是 AI SDK 的：它在这里运行自己的循环，就像运行其任何调用一样。