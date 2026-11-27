<!-- 此文件从 content/ai/agents.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:35:09.175Z -->
<!-- 源文件: content/ai/agents.md -->
<!-- 源哈希: 35c0d54294a1ae0b6a1703d20975eeee -->

### 代理 (Agents)

代理是一个循环调用工具的模型：它读取每个工具的返回值，然后调用更多工具或给出答案，直到它给出答案或达到模型调用的限制。

每次使用 [tools](/ai/tools) 调用 `AiService` 时，您的代理函数会在您的进程内运行该循环：无需部署其他内容。本页面涵盖了随之而来的内容：循环及其限制、对话、像书写一样流式传输到浏览器的答案，以及能存活于重启并等待人工批准的持久化运行。

#### 代理循环

带工具的调用会进行一次模型调用，运行模型请求的工具，然后使用其结果进行下一次模型调用，直到模型在不请求工具的情况下给出答案。每次模型调用是一个**步骤**，结果列表了这些步骤：

```typescript title="assistant/assistant.service.ts"
import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '@nestjs/ai';

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(private readonly ai: AiService) {}

  async answer(question: string, request: unknown) {
    const result = await this.ai.generateText({
      label: 'assistant',
      prompt: question,
      tools: ['find-order', 'change-address'],
      caller: { request },
      maxSteps: 5,
    });
    for (const step of result.steps) {
      const tools = step.toolCalls.map((call) => call.toolName).join(', ');
      this.logger.log(
        `Step ${step.index}: ${tools || 'answered'}, ` +
          `${step.usage.totalTokens} tokens, ${step.attempts} attempt(s)`,
      );
    }
    return result.text;
  }
}

```

每个步骤都有其 `text`、`toolCalls`、`toolResults`（每个工具返回的 `output`，或模型被告知的 `error`）、`finishReason`、`usage`、`cost`、给出答案的 `model` 以及所采取的 `attempts`。

`maxSteps` 限制了单次调用的模型调用次数，默认为 10（`defaults.maxSteps` 可为每次调用更改）。当达到限制而模型仍请求工具时，`generateText()` 以当前结果解析，其 `finishReason` 为 `'tool-calls'`；`generateObject()` 以 `AiOutputError` 拒绝，因为它没有可返回的对象。工具在各自的步骤内运行：它们的时间不计入模型的 `timeout` 限制，并且已启动工具的步骤绝不会重试，因此不会出现工具重复运行的情况。

`toolChoice` 作为 AI SDK 的：`'auto'` 传递给模型，默认设置允许模型选择，而 `'none'` 提供工具但允许模型不调用任何工具。`'required'` 和 `{ type: 'tool', toolName }` 使其调用一个工具，但这并非所有模型都接受。

`abortSignal` 取消调用：取消正在进行的模型调用、重试前的等待以及代理函数通过其上下文的 `signal` 运行。一个不应超过两分钟的任务会传递 `abortSignal: AbortSignal.timeout(120_000)`，调用将以信号的原因拒绝，不进行重试或回退。

#### 对话

`messages` 接收完整的对话，作为 AI SDK 的 `ModelMessage` 对象，替代 `prompt`。调用的 `responseMessages` 是它添加的消息：模型的答案和工具调用，以及工具的结果。将它们追加到对话中，并与客户的下一条消息一起发送：

```typescript title="assistant/conversations.service.ts"
import { Injectable } from '@nestjs/common';
import { AiService } from '@nestjs/ai';
import type { ModelMessage } from 'ai';

@Injectable()
export class ConversationsService {
  // Keep conversations in your database: this one is lost on a restart.
  private readonly conversations = new Map<string, ModelMessage[]>();

  constructor(private readonly ai: AiService) {}

  async reply(conversationId: string, message: string, request: unknown) {
    const messages: ModelMessage[] = [
      ...(this.conversations.get(conversationId) ?? []),
      { role: 'user', content: message },
    ];
    const { text, responseMessages } = await this.ai.generateText({
      instructions: 'You help customers of the cat store with their orders.',
      messages,
      tools: ['find-order', 'change-address'],
      caller: { request },
    });
    this.conversations.set(conversationId, [...messages, ...responseMessages]);
    return text;
  }
}

```

`instructions` 不属于对话的一部分：每次调用都会发送自己的。浏览器中的聊天会保留对话本身，并随每条消息发送：参见 [Streaming to the browser](/ai/agents#streaming-to-the-browser)。

#### 流式传输到浏览器

助手会随着思考而回答，因此浏览器会像书写一样显示答案。`streamText()` 启动调用并立即返回其流，而 `pipeUIMessageStreamToResponse()` 以 AI SDK 的 UI 消息流协议中的服务端推送事件形式发送它，该事件注入于 `@Res()` 的响应中：

```typescript title="assistant/assistant.controller.ts"
import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { AiService } from '@nestjs/ai';
import { convertToModelMessages, type UIMessage } from 'ai';
import type { Request, Response } from 'express';

@Controller('assistant')
export class AssistantController {
  constructor(private readonly ai: AiService) {}

  @Post('chat')
  async chat(
    @Body() { messages }: { messages: UIMessage[] },
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const answer = this.ai.streamText({
      label: 'assistant',
      instructions:
        'You help customers of the cat store with their orders. ' +
        'Look an order up before you answer about it.',
      messages: await convertToModelMessages(messages),
      tools: ['find-order', 'change-address'],
      caller: { request },
    });
    await answer.pipeUIMessageStreamToResponse(response);
  }
}

```

该路由在 Fastify 和 Node 适配器上工作方式相同：`pipeUIMessageStreamToResponse()` 接收平台的响应，在 Fastify 上是一个 `FastifyReply`，其在流开始前设置的头部（例如 CORS 头部）会被保留。`convertToModelMessages()` 从 `ai` 将浏览器 POST 的 `UIMessage` 对象转换为调用所使用的模型消息。

在浏览器中，来自 `@ai-sdk/react` 的 `useChat()` 或 AI SDK 针对 Vue、Svelte 和 Angular 的包，将对话发布到路由，并在接收到时构建答案：

```typescript
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

const { messages, sendMessage, status } = useChat({
  transport: new DefaultChatTransport({ api: '/assistant/chat' }),
});

```

每条消息的 `parts` 包含其文本（`type: 'text'`）以及模型所做的工具调用，这些调用作为 `tool-find-order` 的部分，带有其 `state`、`input` 和 `output`。该调用中每个模型调用的答案都作为一条消息流式传输，包括其工具调用及其结果。

- **错误。** 在第一个数据块之前失败的调用将拒绝，不发送任何内容，因此路由的异常过滤器会处理它。在此之前，流会重试，并像任何调用一样回退到另一个模型。在以包含错误块的错误块结束流后失败，该块显示 `An error occurred.`，以防止服务器细节泄露：`errorText` 选项提供了更多信息。
- **保持活动。** 当 15 秒内没有数据块时，例如工具正在运行时，会发送一条注释行（`: keep-alive`），以防止代理和负载均衡器因空闲而关闭连接。`useChat()` 会跳过它。`keepAlive` 选项设置间隔，或 `false` 关闭它。
- **浏览器关闭。** 当浏览器关闭连接时，模型调用被中止，正在运行的代理函数的 `signal` 也被中止。
- **头部。** 响应是 `text/event-stream` 带有 `x-accel-buffering: no`，告诉 nginx 不要缓冲它。`status` 和 `headers` 添加您自己的头部。

```typescript
await answer.pipeUIMessageStreamToResponse(response, {
  keepAlive: '10s',
  errorText: (error) =>
    error instanceof AiModelError
      ? 'The assistant is unavailable. Try again in a minute.'
      : 'Something went wrong.',
});

```

代理函数的 `ctx.reportProgress()` 作为瞬态 `data-tool-progress` 数据块到达浏览器，该块由 `useChat()` 传递给其 `onData` 回调，而不会将其添加到消息中：

```typescript title="catalog/catalog.tools.ts"
@AgentFunction({
  name: 'check-stock',
  description: 'Check the stock of a product in every warehouse',
  inputSchema: z.object({
    sku: z.string().describe('The product SKU, such as SKU-1042'),
  }),
})
async checkStock({ sku }: { sku: string }, ctx: AgentFunctionContext) {
  const warehouses = await this.stock.warehouses();
  const counts: Record<string, number> = {};
  for (const [index, warehouse] of warehouses.entries()) {
    counts[warehouse.name] = await this.stock.count(warehouse.id, sku, {
      signal: ctx.signal,
    });
    await ctx.reportProgress(index + 1, warehouses.length, warehouse.name);
  }
  return counts;
}

```

```typescript
const { messages, sendMessage } = useChat({
  transport: new DefaultChatTransport({ api: '/assistant/chat' }),
  onData: (part) => {
    if (part.type === 'data-tool-progress') {
      // { toolCallId, toolName, progress, total, message }
      console.log(part.data);
    }
  },
});

```

该流有其他读取者。`pipeTextStreamToResponse(response)` 仅发送文本，作为 `text/plain`；`textStream` 迭代它；`toUIMessageStream()` 是 UI 消息流作为 `ReadableStream`，而 `toUIMessageStreamResponse()` 是作为 Web 标准的 `Response`。`text`、`usage`、`steps`、`finishReason` 和 `responseMessages` 是当调用结束时解决的 promise，而 `result` 拥有所有这些；它们以调用的错误拒绝。调用只运行一次，无论哪个读取者接收它，每个读取者都从开始接收整个流。`abort()` 取消它。选项中的错误，例如不存在的代理函数，会立即从 `streamText()` 抛出。

```typescript
@Post('summary')
async summary(
  @Body() { thread }: { thread: string },
  @Res() response: Response,
) {
  const answer = this.ai.streamText({
    model: 'fast',
    instructions: 'Summarize the support thread in three sentences.',
    prompt: thread,
  });
  await answer.pipeTextStreamToResponse(response);
}

```

#### 持久化代理运行

退款请求需要一个人：代理查找订单并请求退款，然后支持团队中的某人批准，可能是第二天早上，也可能是部署之后。`@nestjs/ai/workflows` 在 [`@nestjs/workflows`](/reliability/workflows) 上运行代理循环，每次模型调用作为一个步骤，每次工具调用作为一个步骤。被重启中断的运行会从中断处恢复，其日志中保存的内容会被读回，不会重复执行。安装包：

```bash
$ npm i --save @nestjs/workflows

```

在工作流的模块中导入 `AiWorkflowsModule`。应用程序导入 `WorkflowsModule`，其中数据库中的存储如 [Durable workflows](/reliability/workflows#keep-workflows-in-your-database) 所述，以及像往常一样导入 `AiModule`：

```typescript title="refunds/refunds.module.ts"
import { Module } from '@nestjs/common';
import { AiWorkflowsModule } from '@nestjs/ai/workflows';
import { OrdersModule } from '../orders/orders.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { ApprovalsController } from './approvals.controller.js';
import { RefundRequest } from './refund-request.workflow.js';
import { RefundTools } from './refund.tools.js';
import { RefundsService } from './refunds.service.js';

@Module({
  imports: [AiWorkflowsModule, OrdersModule, PaymentsModule],
  controllers: [ApprovalsController],
  providers: [RefundRequest, RefundTools, RefundsService],
})
export class RefundsModule {}

```

使用您的工作流从工作流中运行代理，使用 `AiAgents`：

```typescript title="refunds/refund-request.workflow.ts"
import { AiAgents } from '@nestjs/ai/workflows';
import { Workflow, type WorkflowContext } from '@nestjs/workflows';

export interface RefundRequestInput {
  email: string;
  customerId: string;
}

@Workflow('refund-request')
export class RefundRequest {
  constructor(private readonly agents: AiAgents) {}

  run(ctx: WorkflowContext, input: RefundRequestInput) {
    return this.agents.run(ctx, {
      label: 'refund-request',
      instructions:
        'You handle the refund requests of the cat store. Look the order ' +
        'up, and refund it when the customer is right.',
      prompt: input.email,
      tools: ['find-order', 'refund'],
      approve: ['refund'],
      caller: { user: { id: input.customerId } },
    });
  }
}

```

将其作为任何工作流启动，使用来自工单的 id，这样再次为其相同的工单启动时，会返回已存在的运行：

```typescript title="refunds/refunds.service.ts"
import { Injectable } from '@nestjs/common';
import { WorkflowClient } from '@nestjs/workflows';
import { RefundRequest } from './refund-request.workflow.js';

@Injectable()
export class RefundsService {
  constructor(private readonly workflows: WorkflowClient) {}

  async request(ticket: { id: string; body: string; customerId: string }) {
    await this.workflows.start(
      RefundRequest,
      { email: ticket.body, customerId: ticket.customerId },
      { id: `refund-${ticket.id}` },
    );
  }
}

```

在 `approve` 中命名的代理函数调用在运行前会等待一个人，直到所需时间过去；`approvalTimeout` 限制了等待时间。`pendingApprovals(runId)` 列出了等待的调用，每个调用都有其 `key`、`toolName` 和 `input`，而 `approve(key)` 或 `reject(key, { reason })` 从支持团队工作的任何地方回答其中一个：

```typescript title="refunds/approvals.controller.ts"
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AiAgents } from '@nestjs/ai/workflows';

@Controller('refunds')
export class ApprovalsController {
  constructor(private readonly agents: AiAgents) {}

  @Get(':runId/approvals')
  pending(@Param('runId') runId: string) {
    return this.agents.pendingApprovals(runId);
  }

  @Post('approvals/:key')
  answer(
    @Param('key') key: string,
    @Body() body: { approved: boolean; reason?: string },
  ) {
    return body.approved
      ? this.agents.approve(key)
      : this.agents.reject(key, { reason: body.reason });
  }
}

```

被拒绝的调用不会运行：模型被告知它被拒绝了以及原因，然后回答客户。在 `approvalTimeout` 内无人回答的调用也不会运行。对一个调用的第一次回答有效，并且 `approve()` 和 `reject()` 记录了 `by`、谁回答了，该信息与回答一起保存。在运行等待期间，其工作流实例被挂起，不占用进程。

运行需要恢复所需的内容与其一起存储，因此其选项是数据：按名称的模型、按名称或按提供者类的代理函数，运行将其存储为名称，以及代理函数所需的 `caller` 作为 `user` 和 `scopes`，因为重启后没有读取请求。代理函数以 `ctx.user` 和 `ctx.scopes` 接收它们；使用 `@nestjs/authentication`，它们的提供者是 [`@Public()`](/ai/tools#with-nestjsauthentication-and-nestjsauthorization)，对于没有请求的任何调用也是如此。运行的模型调用使用其模型和模块的 `timeout`、`retry` 和生成设置，其 `maxSteps` 和 `budget` 遵循模块的 `defaults`，就像调用的那样。

代理函数调用至少运行一次：在运行期间死亡的进程会在重启后再次运行，使用相同的 `ctx.idempotencyKey`。更改某物的函数会传递键，因此更改只发生一次：

```typescript title="refunds/refund.tools.ts"
import { Injectable, NotFoundException } from '@nestjs/common';
import { AgentFunction, type AgentFunctionContext } from '@nestjs/ai';
import * as z from 'zod';
import { OrdersService } from '../orders/orders.service.js';
import { PaymentsService } from '../payments/payments.service.js';

@Injectable()
export class RefundTools {
  constructor(
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
  ) {}

  @AgentFunction({
    name: 'refund',
    description: 'Refund an order to the card it was paid with',
    inputSchema: z.object({ orderId: z.string() }),
  })
  async refund({ orderId }: { orderId: string }, ctx: AgentFunctionContext) {
    const order = await this.orders.findById(orderId);
    if (!order) {
      throw new NotFoundException(`There is no order ${orderId}`);
    }
    await this.payments.refund(order.paymentId, order.total, {
      idempotencyKey: ctx.idempotencyKey,
    });
    return { refunded: order.id, amount: order.total };
  }
}

```

代理函数的失败是模型读取的结果，就像任何调用一样，而不是其步骤的失败。模型调用保留其重试、超时和备用模型；仍然失败的调用作为工作流的步骤进行重试，在尝试之间持久等待（默认三次尝试）。在 `stepsPerInstance` 个模型调用（10）之后，运行在一个子工作流中继续，这样任何实例的日志就不会增长过长：每次恢复都会完整重放它，并且是有限制的。`maxSteps` (25) 限制了运行的模型调用次数。

运行以 `generateText()` 解决的结果解决，以及 `text`、`steps`、`toolResults` 和其余部分作为 JSON：它是工作流的输出，`WorkflowClient` 的 `getStatus(runId)` 也会读取它。

`run()` 的选项：

| 选项 | 默认值 | 描述 |
| --- | --- | --- |
| `model`, `fallback` | `'default'`，模型的 | 按名称的模型 |
| `instructions`, `prompt`, `messages` | | 对于一个调用 |
| `tools` | | 存储为名称的代理函数名称和提供者类 |
| `approve` | `[]` | 代理函数，包括 `tools`，其调用等待人员批准 |
| `approvalTimeout` | 直到回答 | 调用等待批准的时间长度 |
| `caller` | | 代理函数运行的 `user` 和 `scopes` |
| `maxSteps` | `defaults.maxSteps`，否则 `25` | 运行的模型调用 |
| `stepsPerInstance` | `10` | 一个工作流实例的模型调用次数，在运行进入子工作流之前 |
| `budget` | `defaults.budget` | 跨运行的 `maxTokens` 和 `maxCost` |
| `label`, `toolChoice`, `maxOutputTokens`, `temperature`, `providerOptions` | | 对于一个调用 |