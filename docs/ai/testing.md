<!-- 此文件从 content/ai/testing.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:11:28.041Z -->
<!-- 源文件: content/ai/testing.md -->
<!-- 源哈希: 0e3b9a7b33885a9661a8818d1de5dc3a -->

### 测试

调用模型的代码测试不调用模型提供者：`FakeModel`，来自`@nestjs/ai/testing`，是一个语言模型，它会用你给它的下一个答案来回答每一次调用，并记录它收到的每一次调用。

伪模型是一个真实的`LanguageModel`，因此其周围的一切都像生产环境一样运行：模块的设置、重试、超时和回退模型、模式、代理函数及其增强器和流式传输。只有网络部分被排除在外。

#### 伪模型

一个`FakeModel`按顺序接收其答案：

```typescript
import { FakeModel, providerError } from '@nestjs/ai/testing';

const model = new FakeModel([
  // 1. Text
  'Your order has shipped.',
  // 2. A tool call, and the answer after it, a function of the call
  { toolCalls: [{ name: 'find-order', input: { orderId: 'ord_123' } }] },
  (call) => `The order is ${JSON.stringify(call.toolResults[0].output)}`,
  // 3. An object, for generateObject()
  { object: { category: 'shipping', orderId: 'ord_123', urgent: false } },
  // 4. A provider's error: overloaded
  providerError(529),
]);

```

| 答案 | 模型执行的操作 |
| --- | --- |
| 一个字符串 | 用该文本回答 |
| `{ text }` | 相同，带有以下选项 |
| `{ toolCalls }` | 调用工具，每个工具都有其`name`、`input`（默认为`{}`）和`id`（默认为`call-1`、`call-2`，...） |
| `{ object }` | 以 JSON 对象形式回答，该对象由`generateObject()` 读取 |
| 一个`Error` | 像提供者的请求一样以其失败 |
| 调用的一个函数 | 用其返回的值回答，以上任何一种，或其的 promise |

一个答案对象还包含：

| 选项 | 执行的操作 |
| --- | --- |
| `usage` | 答案报告的 token：`inputTokens` 和 `outputTokens`（默认各 10 个），`cachedInputTokens`，`reasoningTokens` |
| `finishReason` | 带有工具调用的默认`'tool-calls'`，否则是`'stop'` |
| `delay` | 回答前或流打开前的毫秒数。调用的中止和超时会提前终止它 |
| `chunkDelay` | 流块之间的毫秒数，它以单词大小的块发送文本 |
| `streamError` | 流在文本后失败的错误，类似于连接中断 |

如果提供一个函数而不是一个列表，`new FakeModel((call) => ...)` 会用该函数回答每一次调用。`reply(...answers)` 在尚未使用的答案之后添加答案，而`fakeModel(...answers)` 是`new FakeModel(answers)`。对于没有剩余答案的调用，它会失败：`FakeModel: no answer left for call 4. Give it more answers.`

`providerError(status, { message, retryAfter })` 是一个`@ai-sdk/*` 提供者对 HTTP 错误的抛出错误：一个`APICallError`，对于 408、409、429 和 5xx 是可重试的，当设置了`retry-after` 头部时（以秒为单位），会包含该头部。

`calls` 列出了模型接收到的内容，而`lastCall` 是最后一个：

| 属性 | 含义 |
| --- | --- |
| `instructions` | 系统提示 |
| `lastUserMessage` | 上一个用户消息的文本 |
| `toolResults` | 上一步工具的返回内容，模型读取时如下：`toolName`、`toolCallId` 和 `output`，后者是工具失败的错误消息 |
| `tools` | 模型被提供的工具名称 |
| `stream` | 调用是否被流式传输 |
| `options` | 模型接收到的所有内容，作为 AI SDK 的提供者级别调用选项：`prompt`、`tools`、`responseFormat`、`maxOutputTokens`、`headers` 以及其余部分 |

#### 测试服务

在测试模块中注册`AiModule`，并使用服务使用的名称作为伪模型：

```typescript title="support/triage.service.spec.ts"
import { Test } from '@nestjs/testing';
import { AiModule } from '@nestjs/ai';
import { FakeModel } from '@nestjs/ai/testing';
import { TriageService } from './triage.service.js';

describe('TriageService', () => {
  it('sorts an email', async () => {
    const fast = new FakeModel([
      { object: { category: 'shipping', orderId: 'ord_123', urgent: true } },
    ]);
    const moduleRef = await Test.createTestingModule({
      imports: [
        AiModule.forRoot({ models: { default: new FakeModel(), fast } }),
      ],
      providers: [TriageService],
    }).compile();

    const triage = await moduleRef
      .get(TriageService)
      .triage('Where is ord_123? It was due on Monday.');

    expect(triage).toEqual({
      category: 'shipping',
      orderId: 'ord_123',
      urgent: true,
    });
    expect(fast.lastCall?.instructions).toContain('support email');
    expect(fast.lastCall?.lastUserMessage).toBe(
      'Where is ord_123? It was due on Monday.',
    );
    expect(fast.lastCall?.options.responseFormat).toMatchObject({
      type: 'json',
    });
  });
});

```

不匹配模式的答案会测试服务对`AiOutputError` 的处理：给模型提供`'Sure! Here it is.'`，或者提供缺少字段的对象。

#### 重试、超时和回退

`providerError()` 和 `delay` 测试提供者失败或耗时过长时会发生什么。给模块的重试设置无退避，并给其尝试设置一个短超时，这样测试就不会等待：

```typescript title="support/replies.service.spec.ts"
import { Test } from '@nestjs/testing';
import { AiModelError, AiModule } from '@nestjs/ai';
import { FakeModel, providerError } from '@nestjs/ai/testing';
import { ResilienceTimeoutError } from '@nestjs/resilience';
import { RepliesService } from './replies.service.js';

async function createReplies(fast: FakeModel, main: FakeModel) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      AiModule.forRoot({
        models: { default: main, fast: { model: fast, fallback: 'default' } },
        defaults: {
          timeout: 50,
          retry: { attempts: 2, backoff: { delay: 0 } },
        },
      }),
    ],
    providers: [RepliesService],
  }).compile();
  return moduleRef.get(RepliesService);
}

describe('RepliesService', () => {
  it('falls back to the default model when the fast one fails', async () => {
    const fast = new FakeModel([providerError(529), providerError(529)]);
    const main = new FakeModel(['Thanks for writing in!']);
    const replies = await createReplies(fast, main);

    await expect(replies.draft('Hello')).resolves.toBe(
      'Thanks for writing in!',
    );
    expect(fast.calls).toHaveLength(2);
  });

  it('gives up when every model fails', async () => {
    const fast = new FakeModel(() => providerError(500));
    const main = new FakeModel(() => ({ text: 'Too late', delay: 1_000 }));
    const replies = await createReplies(fast, main);

    const error = await replies.draft('Hello').catch((error: unknown) => error);

    expect(error).toBeInstanceOf(AiModelError);
    expect((error as AiModelError).attempts).toHaveLength(4);
    expect((error as AiModelError).cause).toBeInstanceOf(
      ResilienceTimeoutError,
    );
  });
});

```

快速模型失败两次，而默认模型在每次尝试的 50 毫秒内耗时更长，共两次：总共四次尝试，最后一次的错误是`cause`。

#### 在端到端测试中覆盖模型

`overrideModels()` 按名称将伪模型放置在应用程序自身的模型位置，并保留其其余定义：定价、回退模型、超时和重试。模块未配置的名称在测试模块编译时会失败。被`@InjectModel()` 注入的模型也会被替换：

```typescript title="test/assistant.e2e-spec.ts"
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { FakeModel, overrideModels } from '@nestjs/ai/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('the assistant', () => {
  let app: INestApplication;
  const model = new FakeModel();

  beforeAll(async () => {
    const moduleRef = await overrideModels(
      Test.createTestingModule({ imports: [AppModule] }),
      { default: model },
    ).compile();
    app = await moduleRef.createNestApplication().init();
  });

  afterAll(() => app.close());

  it('looks the order up before it answers', async () => {
    model.reply(
      { toolCalls: [{ name: 'find-order', input: { orderId: 'ord_123' } }] },
      (call) => {
        const order = call.toolResults[0].output as { status: string };
        return `Your order has ${order.status}.`;
      },
    );

    const response = await request(app.getHttpServer())
      .post('/assistant/questions')
      .send({ question: 'Where is ord_123?' })
      .expect(201);

    expect(response.body).toEqual({ answer: 'Your order has shipped.' });
    expect(model.calls.map((call) => call.tools)).toEqual([
      ['find-order'],
      ['find-order'],
    ]);
  });
});

```

代理函数以真实方式运行，带有其模式、守卫和过滤器：函数的失败会作为工具的结果到达模型，然后在下一个调用的`toolResults` 中被测试读取：

```typescript
it('tells the model when there is no such order', async () => {
  model.reply(
    { toolCalls: [{ name: 'find-order', input: { orderId: 'ord_999' } }] },
    'I could not find that order.',
  );

  await request(app.getHttpServer())
    .post('/assistant/questions')
    .send({ question: 'Where is ord_999?' })
    .expect(201);

  expect(model.lastCall?.toolResults).toEqual([
    expect.objectContaining({
      toolName: 'find-order',
      output: 'There is no order ord_999',
    }),
  ]);
});

```

#### 测试代理函数

`callTool()` 像模型工具调用一样运行代理函数，但没有模型：根据其模式验证参数，检查其作用域，然后是其守卫、拦截器、管道和过滤器以及方法。它以模型会读取的内容解析，并以模型会读取的失败信息`AiToolError` 拒绝：

```typescript title="assistant/assistant.tools.spec.ts"
import { Test, type TestingModule } from '@nestjs/testing';
import { AiModule } from '@nestjs/ai';
import { callTool, FakeModel } from '@nestjs/ai/testing';
import { OrdersModule } from '../orders/orders.module.js';
import { AssistantModule } from './assistant.module.js';

describe('change-address', () => {
  let moduleRef: TestingModule;
  const alice = { request: { user: { id: 'cus_alice' } } };
  const bob = { request: { user: { id: 'cus_bob' } } };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        AiModule.forRoot({
          isGlobal: true,
          models: { default: new FakeModel() },
        }),
        OrdersModule,
        AssistantModule,
      ],
    }).compile();
  });

  afterAll(() => moduleRef.close());

  it("changes the address of the customer's own order", async () => {
    const address = { orderId: 'ord_123', address: '12 Whisker Lane, Leeds' };
    await expect(
      callTool(moduleRef, 'change-address', address, { caller: alice }),
    ).resolves.toEqual({ id: 'ord_123', address: '12 Whisker Lane, Leeds' });
  });

  it("refuses another customer's order", async () => {
    const address = { orderId: 'ord_123', address: '12 Whisker Lane, Leeds' };
    await expect(
      callTool(moduleRef, 'change-address', address, { caller: bob }),
    ).rejects.toThrow('Forbidden resource');
  });

  it('validates the address', async () => {
    const address = { orderId: 'ord_123', address: 'Leeds' };
    await expect(
      callTool(moduleRef, 'change-address', address, { caller: alice }),
    ).rejects.toThrow('Too small');
  });
});

```

`caller` 是一个调用的`caller`：一个路由的`request`，或一个`user` 和 `scopes`。`callTool()` 如果尚未初始化则初始化测试模块。也为 MCP 客户端提供服务的函数被测试为 MCP 工具，使用[in-memory client](/mcp/testing) 的`@nestjs/mcp/testing`，其调用具有上下文类型`'mcp'`。

单元测试调用方法本身，使用所需的上下文。直接调用会跳过方法周围的一切：模式、作用域和增强器。[durable run](/ai/agents#durable-agent-runs) 的退款将其调用的`idempotencyKey` 传递给支付提供者：

```typescript title="refunds/refund.tools.spec.ts"
import type { AgentFunctionContext } from '@nestjs/ai';
import { OrdersService } from '../orders/orders.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { RefundTools } from './refund.tools.js';

describe('RefundTools', () => {
  const orders = {
    findById: vi.fn().mockResolvedValue({
      id: 'ord_123',
      paymentId: 'pay_123',
      total: 4200,
    }),
  };
  const payments = { refund: vi.fn() };
  const tools = new RefundTools(
    orders as unknown as OrdersService,
    payments as unknown as PaymentsService,
  );
  const ctx = {
    idempotencyKey: 'refund-1:tool-1-call-2',
    signal: new AbortController().signal,
  } as AgentFunctionContext;

  it("refunds the order with the call's idempotency key", async () => {
    await expect(tools.refund({ orderId: 'ord_123' }, ctx)).resolves.toEqual({
      refunded: 'ord_123',
      amount: 4200,
    });
    expect(payments.refund).toHaveBeenCalledWith('pay_123', 4200, {
      idempotencyKey: 'refund-1:tool-1-call-2',
    });
  });

  it("doesn't refund an order that doesn't exist", async () => {
    orders.findById.mockResolvedValueOnce(undefined);
    await expect(tools.refund({ orderId: 'ord_999' }, ctx)).rejects.toThrow(
      'There is no order ord_999',
    );
  });
});

```

#### 测试流

伪模型以单词大小的块流式传输其文本，因此流的读取方式与来自提供者的读取方式相同。在端到端测试中，聊天路由的响应是一个服务端推送事件体，其事件是 UI 消息流的块：

```typescript
it('streams the answer, with the tool call', async () => {
  model.reply(
    { toolCalls: [{ name: 'find-order', input: { orderId: 'ord_123' } }] },
    'Your order has shipped.',
  );

  const response = await request(app.getHttpServer())
    .post('/assistant/chat')
    .send({
      messages: [
        {
          id: 'msg_1',
          role: 'user',
          parts: [{ type: 'text', text: 'Where is ord_123?' }],
        },
      ],
    })
    .expect(200)
    .expect('content-type', 'text/event-stream');

  const chunks = response.text
    .split('\n\n')
    .filter((event) => event.startsWith('data: {'))
    .map((event) => JSON.parse(event.slice('data: '.length)));
  expect(chunks).toContainEqual(
    expect.objectContaining({
      type: 'tool-output-available',
      output: { id: 'ord_123', status: 'shipped', total: 4200 },
    }),
  );
  const text = chunks
    .filter((chunk) => chunk.type === 'text-delta')
    .map((chunk) => chunk.delta)
    .join('');
  expect(text).toBe('Your order has shipped.');
});

```

`streamError` 测试一个在第一个块后中断的流，`{ text: 'Your order', streamError: providerError(500) }`：该体随后以一个消息块`error` 结束，内容为`An error occurred.`。在 HTTP 之外，读取`streamText()` 本身的流，作为`textStream`，或其`text` promise。

#### 测试持久化运行

使用工作流引擎在测试中运行，使用其内存存储，并关闭 `ManualWorkflowClock` 和其工作者来测试持久化运行：`WorkflowWorker.drain()` 会运行到到期的实例，直到没有可运行的实例为止，因此测试决定何时继续运行：

```typescript title="refunds/refund-request.workflow.spec.ts"
import { Test, type TestingModule } from '@nestjs/testing';
import { AiModule } from '@nestjs/ai';
import { FakeModel } from '@nestjs/ai/testing';
import { AiAgents } from '@nestjs/ai/workflows';
import {
  ManualWorkflowClock,
  WorkflowClient,
  WorkflowsModule,
  WorkflowWorker,
} from '@nestjs/workflows';
import { PaymentsService } from '../payments/payments.service.js';
import { RefundRequest } from './refund-request.workflow.js';
import { RefundsModule } from './refunds.module.js';

describe('RefundRequest', () => {
  let moduleRef: TestingModule;
  const payments = { refund: vi.fn() };
  const model = new FakeModel([
    { toolCalls: [{ name: 'find-order', input: { orderId: 'ord_123' } }] },
    { toolCalls: [{ name: 'refund', input: { orderId: 'ord_123' } }] },
    'Your order ord_123 is refunded.',
  ]);

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        WorkflowsModule.forRoot({
          clock: new ManualWorkflowClock(),
          worker: false,
        }),
        AiModule.forRoot({ isGlobal: true, models: { default: model } }),
        RefundsModule,
      ],
    })
      .overrideProvider(PaymentsService)
      .useValue(payments)
      .compile();
    await moduleRef.init();
  });

  afterAll(() => moduleRef.close());

  it('refunds the order once the support team approves', async () => {
    const workflows = moduleRef.get(WorkflowClient);
    const worker = moduleRef.get(WorkflowWorker);
    const agents = moduleRef.get(AiAgents);

    await workflows.start(
      RefundRequest,
      { email: 'Please refund ord_123', customerId: 'cus_alice' },
      { id: 'refund-1' },
    );
    await worker.drain();

    const [pending] = await agents.pendingApprovals('refund-1');
    expect(pending).toMatchObject({
      toolName: 'refund',
      input: { orderId: 'ord_123' },
    });
    expect(payments.refund).not.toHaveBeenCalled();

    await agents.approve(pending.key);
    await worker.drain();

    expect(payments.refund).toHaveBeenCalledTimes(1);
    expect(await workflows.getStatus('refund-1')).toMatchObject({
      status: 'completed',
      output: { text: 'Your order ord_123 is refunded.' },
    });
  });
});

```

当恢复时，模型调用和工具调用从日志中读取在批准之前的运行：虚假模型总共被调用了三次。要测试重启，请在同一存储上启动第二个应用程序，如 [Test crash recovery](/reliability/workflows#test-crash-recovery) 所示，适用于任何工作流。

#### 测试嵌入

`FakeEmbeddingModel` 是 [embedding calls](/ai/embeddings) 的虚假模型：一个真实的 `EmbeddingModel`，它根据你给它的下一个答案来响应每个提供者请求，并记录请求。它不生成向量：一个答案为请求的每个值提供一个。

```typescript title="catalog/search.service.spec.ts"
import { Test } from '@nestjs/testing';
import { AiModule } from '@nestjs/ai';
import { FakeEmbeddingModel, providerError } from '@nestjs/ai/testing';
import { ProductsRepository } from './products.repository.js';
import { SearchService } from './search.service.js';

describe('SearchService', () => {
  const products = { saveEmbeddings: vi.fn(), findNearest: vi.fn() };

  async function createSearch(model: FakeEmbeddingModel) {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AiModule.forRoot({
          embeddingModels: { default: model },
          embeddingDefaults: {
            retry: { attempts: 2, backoff: { delay: 0 } },
          },
        }),
      ],
      providers: [
        SearchService,
        { provide: ProductsRepository, useValue: products },
      ],
    }).compile();
    return moduleRef.get(SearchService);
  }

  it('finds the products nearest to the search', async () => {
    const model = new FakeEmbeddingModel([{ embeddings: [[0.1, 0.2]] }]);
    const search = await createSearch(model);

    await search.search("my cat won't eat");

    expect(model.lastCall?.values).toEqual(["my cat won't eat"]);
    expect(products.findNearest).toHaveBeenCalledWith([0.1, 0.2], 10);
  });

  it('sends a failed request again, and only that one', async () => {
    const model = new FakeEmbeddingModel(
      [{ embeddings: [[1]] }, providerError(429), { embeddings: [[2]] }],
      { maxEmbeddingsPerCall: 1, supportsParallelCalls: false },
    );
    const search = await createSearch(model);
    const catalog = [
      { id: 'prd_1', description: 'Salmon pate' },
      { id: 'prd_2', description: 'Catnip mouse' },
    ];

    await search.index(catalog);

    expect(model.calls.map((call) => call.values)).toEqual([
      ['Salmon pate'],
      ['Catnip mouse'],
      ['Catnip mouse'],
    ]);
    expect(products.saveEmbeddings).toHaveBeenCalledWith(catalog, [[1], [2]]);
  });
});

```

第二个参数说明 AI SDK 如何像提供者的模型那样分割值：在这里，每个值都是一个单独的请求，它们一次发送一个，因此测试知道它们的顺序。它还接受 `provider` 和 `modelId`。没有它，模型没有限制，而 `embedMany()` 只进行一个请求。

| 答案 | 模型执行的操作 |
| --- | --- |
| `{ embeddings }` | 使用向量回答，每个值对应一个向量 |
| 一个 `Error` | 像提供者的请求那样失败 |
| 调用函数 | 使用其返回的内容回答，可以是以上任何一种，或其 promise |

答案对象还接受：

| 选项 | 作用 |
| --- | --- |
| `usage` | 答案报告的令牌数：`{ tokens }`，默认每个值 10 个 |
| `delay` | 回答前的毫秒数。调用的中止和超时会提前终止它 |
| `warnings`, `providerMetadata`, `response` | 提供者添加到其向量中的内容 |

如果提供函数而不是列表，`new FakeEmbeddingModel((call) => ...)` 会用该函数回答每个请求，这适用于不关心值如何分割的测试。`reply(...answers)` 在尚未使用的答案之后添加答案，而 `fakeEmbeddingModel(...answers)` 是 `new FakeEmbeddingModel(answers)`。对于没有剩余答案的请求会失败：`FakeEmbeddingModel: no answer left for call 3. Give it more answers.`

`calls` 列出了模型接收到的内容，每个内容都有其 `values` 和 `options`，AI SDK 的提供者级别调用选项，例如 `abortSignal`、`headers` 和 `providerOptions`，而 `lastCall` 是最后一个。

`overrideEmbeddingModels()` 对嵌入模型执行的操作与 `overrideModels()` 对语言模型执行的操作相同：它根据名称将虚假模型替换应用程序自身的模型，并保留其其余的定义、设置和定价。模块未配置的名称在测试模块编译时会失败。注入的模型 `@InjectEmbeddingModel()` 也会被替换：

```typescript title="test/search.e2e-spec.ts"
import { Test } from '@nestjs/testing';
import {
  FakeEmbeddingModel,
  overrideEmbeddingModels,
} from '@nestjs/ai/testing';
import { AppModule } from '../src/app.module.js';

const model = new FakeEmbeddingModel(({ values }) => ({
  embeddings: values.map(() => [0.1, 0.2]),
}));

const moduleRef = await overrideEmbeddingModels(
  Test.createTestingModule({ imports: [AppModule] }),
  { default: model },
).compile();

```

要在同一测试中替换语言模型，请将 `overrideEmbeddingModels()` 返回的内容传递给 `overrideModels()`。