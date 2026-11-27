<!-- 此文件从 content/ai/overview.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:36:00.579Z -->
<!-- 源文件: content/ai/overview.md -->
<!-- 源哈希: 57affdf06a8b0b3cac80bda447dd6081 -->

### AI

`@nestjs/ai` 将语言模型引入 Nest 应用程序：按名称注册和注入模型，带有超时、重试和备用模型的调用，由模式验证的答案，以及提供者的方法作为代理函数，模型将其作为工具调用。

> info **提示** 要实现一个流式传输答案并调用应用程序自身数据的完整聊天机器人后端，请遵循 [Build an AI chat backend in Node.js](/tutorials/ai-chat-backend)。

一家猫粮和用品的在线商店每天收到一百封支持邮件，其客户更愿意在网站上询问订单而不是写邮件。这两者都是语言模型的工作，在订单 API 内部：对邮件进行分类并起草回复，或者根据 API 了解的订单信息在聊天中回答客户。

该包建立在 [AI SDK](https://ai-sdk.dev) (`ai`) 及其提供者包之上，因此它支持的任何模型都可以工作：Claude、GPT、Gemini、Mistral 或网关后的模型。模型调用在 [`@nestjs/resilience`](/reliability/resilience) 的策略上运行。您编写一个代理函数，一个带有 `@AgentFunction()` 的方法，模型将其作为工具提供给它：每次调用都会经过您的路由使用的守卫、拦截器、管道和异常过滤器，就像模型代表的用户一样。

在本章中，您将为商店的订单 API 提供：

- 将支持邮件 [triage](/ai/overview#structured-output) 成一个类型化的对象，并提供一个起草的回复，使用快速且廉价的模型。
- 在每次调用周围添加 [Retries, timeouts and a fallback model](/ai/models#retries-timeouts-and-fallback)，每次调用添加一个 [budget](/ai/models#usage-cost-and-budgets)，以及记录每次调用的成本。
- [Agent functions](/ai/tools) 模型作为已登录客户调用，其中包括商店的 MCP 服务器也提供的 `find-order`：一个方法，两个消费者。
- 一个 [chat assistant](/ai/agents#streaming-to-the-browser)，其答案会随着书写实时流式传输到浏览器。
- 一个 [refund agent](/ai/agents#durable-agent-runs)，作为持久化工作流等待支持团队的批准。
- 其产品描述的 [Embeddings](/ai/embeddings)，用于按含义查找产品的搜索。
- [Tests](/ai/testing)，在没有模型提供者的情况下运行。

#### 安装

安装该包，`@nestjs/resilience`，模型调用的策略运行在该包上，AI SDK、一个提供者包和用于模式的 Zod：

```bash
$ npm i --save @nestjs/ai @nestjs/resilience ai @ai-sdk/anthropic zod

```

> info **提示** 每个 `@ai-sdk/*` 提供者包都以相同的方式工作：`@ai-sdk/openai`、`@ai-sdk/google`、`@ai-sdk/mistral`、`@ai-sdk/amazon-bedrock` 以及其他包。模式可以来自任何生成 JSON Schema 的 [Standard Schema](https://standardschema.dev) 库，例如 `@nestjs/mcp`：Zod 4.2 或更高版本和 ArkType 保持原样，通过 `toStandardJsonSchema()` 使用 Valibot。`@nestjs/ai` 的每个主要版本支持 AI SDK 的一个主要版本，此版本为 `ai` 7，并且需要 Node.js 22 或更高版本，因为 AI SDK 也需要。

#### 注册模型

在根模块中导入 `AiModule`，按名称导入应用程序使用的模型。不指定模型的调用使用 `default`：

```typescript title="app.module.ts"
import { anthropic } from '@ai-sdk/anthropic';
import { Module } from '@nestjs/common';
import { AiModule } from '@nestjs/ai';
import { SupportModule } from './support/support.module.js';

@Module({
  imports: [
    AiModule.forRoot({
      isGlobal: true,
      models: {
        default: anthropic('claude-opus-5-5'),
        fast: {
          model: anthropic('claude-haiku-5-5'),
          fallback: 'default',
        },
      },
      defaults: { timeout: '30s', retry: { attempts: 3 } },
    }),
    SupportModule,
  ],
})
export class AppModule {}

```

模型是提供者包返回的内容，例如 `anthropic('claude-opus-5-5')`，或者一个带有该模型作为 `model` 的定义及其自身的设置：`fallback`，失败时尝试的模型，`pricing`，`timeout`，`retry`，以及诸如 `maxOutputTokens` 的生成设置。`defaults` 应用于每次调用：这里，尝试可能需要 30 秒，每个模型有三次尝试。[Models](/ai/models) 描述了每个设置。

提供者包从环境变量读取其 API 密钥，对于 `@ai-sdk/anthropic` 使用 `ANTHROPIC_API_KEY`。如果想从 `ConfigService` 传递它，请在工厂中创建提供者：参见 [Async configuration](/ai/overview#异步配置)。

`isGlobal: true` 允许应用程序的每个模块注入 `AiService`。没有它，该模块不是全局的：`AiService` 只在导入 `AiModule.forRoot()` 的模块中注入。要仅与某些模块共享一个配置，请在您自己的模块中导入它并导出它，然后在调用模型的模块中导入该模块：

```typescript title="llm/llm.module.ts"
import { anthropic } from '@ai-sdk/anthropic';
import { Module } from '@nestjs/common';
import { AiModule } from '@nestjs/ai';

@Module({
  imports: [
    AiModule.forRoot({ models: { default: anthropic('claude-opus-5-5') } }),
  ],
  exports: [AiModule],
})
export class LlmModule {}

```

#### 调用模型

`AiService` 执行调用。`generateText()` 发送一个提示，包含 `instructions`（系统提示），并以答案解析：

```typescript title="support/replies.service.ts"
import { Injectable } from '@nestjs/common';
import { AiService } from '@nestjs/ai';

@Injectable()
export class RepliesService {
  constructor(private readonly ai: AiService) {}

  async draft(email: string): Promise<string> {
    const { text } = await this.ai.generateText({
      model: 'fast',
      label: 'draft-reply',
      instructions:
        'Draft a short, friendly reply to the customer. ' +
        'Sign it "The Cat Store".',
      prompt: email,
      maxOutputTokens: 400,
    });
    return text;
  }
}

```

`model` 指定模块中的一个模型，未指定时使用 `default`，而 `label` 在 [usage events](/ai/models#usage-cost-and-budgets) 和其策略的事件中命名该调用。`prompt` 是用户的消息；`messages` 则接收整个对话，作为 AI SDK 的 `ModelMessage` 对象（参见 [Conversations](/ai/agents#conversations)）。结果包含文本以外的内容：

| 属性 | 含义 |
| --- | --- |
| `text` | 答案：最后一次模型调用的文本 |
| `finishReason` | 模型停止的原因：达到 `'stop'`、达到 `'length'` 时，或在 `maxOutputTokens` 次模型调用后仍请求工具时是 `'tool-calls'` |
| `usage` | 所有模型调用的 token 总和：`inputTokens`、`outputTokens`、`totalTokens`、`cachedInputTokens` 和 `reasoningTokens` |
| `cost` | 模型具有 `pricing` 时的调用成本 |
| `steps` | 每次模型调用的一个记录，包含其文本、工具调用、用量和尝试次数 |
| `toolCalls`, `toolResults` | 模型调用的工具，包括其输入，以及每个返回的内容或失败原因 |
| `responseMessages` | 调用的助手和工具消息，用于追加到对话中 |
| `model` | 回答的模型：其 `name`、`provider` 和 `modelId` |

如果调用指定了模块未配置的模型、不存在的代理函数，或两者都存在 `prompt` 和 `messages`，则在发送任何内容之前会拒绝，并返回 `AiConfigurationError`。

#### 结构化输出

对邮件进行分类是 `generateObject()` 的工作。模型接收到模式的 JSON Schema，其答案由该模式解析和验证，因此 `object` 由其类型化：

```typescript title="support/triage.service.ts"
import { Injectable } from '@nestjs/common';
import { AiService } from '@nestjs/ai';
import * as z from 'zod';

export const Triage = z.object({
  category: z
    .enum(['shipping', 'billing', 'product', 'other'])
    .describe('What the email is about'),
  orderId: z
    .string()
    .nullable()
    .describe('The order id it mentions, such as ord_123, or null'),
  urgent: z.boolean().describe('Whether the customer needs an answer today'),
});

@Injectable()
export class TriageService {
  constructor(private readonly ai: AiService) {}

  async triage(email: string) {
    const { object } = await this.ai.generateObject({
      model: 'fast',
      label: 'triage',
      schema: Triage,
      instructions:
        'You sort the support email of a store for cat food and supplies.',
      prompt: email,
    });
    return object; // { category, orderId, urgent }
  }
}

```

模型读取 `.describe()` 文本，就像读取代理函数一样：说明每个字段的含义，并提供一个示例值。`schemaName` 和 `schemaDescription` 为提供者传递给模型的对象命名和描述。除了 `object`，结果包含 `generateText()` 所拥有的所有内容：`usage`、`cost`、`steps` 和其余部分。

非 JSON 或不匹配模式的答案会拒绝，并返回 `AiOutputError`，其中包含模型的 `text`。它不会被重试，也不会尝试备用模型：模型确实给出了答案。

模式的转换在答案上运行，而模型接收到其输入侧的 JSON Schema。商店还提取了供应商发票的行，并希望到期日是一个 `Date`；模型被要求提供一个 ISO 日期字符串：

```typescript title="suppliers/invoices.service.ts"
import { Injectable } from '@nestjs/common';
import { AiService } from '@nestjs/ai';
import * as z from 'zod';

const Invoice = z.object({
  number: z.string().describe('The invoice number, such as INV-2041'),
  total: z.number().describe('The total, in cents'),
  dueDate: z.iso.date().transform((value) => new Date(`${value}T00:00:00Z`)),
  lines: z.array(
    z.object({
      description: z.string(),
      amount: z.number().describe('In cents'),
    }),
  ),
});

@Injectable()
export class InvoicesService {
  constructor(private readonly ai: AiService) {}

  async extract(email: string) {
    const { object } = await this.ai.generateObject({
      label: 'invoice',
      schema: Invoice,
      schemaName: 'invoice',
      instructions: 'Extract the invoice from the email of a supplier.',
      prompt: email,
    });
    return object; // object.dueDate is a Date
  }
}

```

相同的调用在队列任务中也有效，其中存储读取其供应商的邮箱：调用模型的代码不随运行位置而改变。

使用 [tools](/ai/tools)，模型可以在回答之前查找信息，对象是其最后一次模型调用的答案。在 `maxSteps` 次模型调用后仍在调用工具的模型没有给出对象，因此调用也会以 `AiOutputError` 拒绝。

#### 异步配置

`forRootAsync()` 从工厂、一个 `useClass` 或一个 `useExisting` **提供者**获取选项。在这里，工厂使用来自 `ConfigService` 的 API 密钥创建 **提供者**：

```typescript title="app.module.ts"
import { createAnthropic } from '@ai-sdk/anthropic';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AiModule } from '@nestjs/ai';

@Module({
  imports: [
    ConfigModule.forRoot(),
    AiModule.forRootAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const anthropic = createAnthropic({
          apiKey: config.getOrThrow<string>('ANTHROPIC_API_KEY'),
        });
        return {
          models: {
            default: anthropic('claude-opus-5-5'),
            fast: { model: anthropic('claude-haiku-5-5'), fallback: 'default' },
          },
          defaults: { timeout: '30s' },
        };
      },
    }),
  ],
})
export class AppModule {}

```

一个 `useClass` **提供者**实现了 `AiOptionsFactory`，其 `createAiOptions()` 返回选项。`isGlobal` 保持在顶层，`modelNames` 和 `embeddingModelNames` 也是如此。

`@InjectModel()` (参见 [Models](/ai/models#calling-the-ai-sdk-yourself)) 需要为它注入的每个模型名称提供一个 **提供者**，而 `forRootAsync()` 在其工厂运行之前创建它们：对于在 **模块** 定义时被看到的名称 `@InjectModel()`，是在应用程序导入的类中看到的。稍后加载的类，例如一个 [lazily loaded module](/fundamentals/lazy-loading-modules)，在其 `modelNames: ['fast']` 中列出其名称。任何未配置的名称都会在启动时失败，并显示请求它的类的名称。

#### 一个包支持多个 **提供者**

每个 `@ai-sdk/*` **提供者**包都是需要安装和与 `ai` 保持同步的额外依赖项。大多数 **提供者** 和 **网关** (OpenAI, Groq, Together, Fireworks, DeepSeek, OpenRouter, LiteLLM, Ollama, vLLM 等) 也提供 OpenAI API，因此单个包 `@ai-sdk/openai-compatible` 可以访问所有这些：

```bash
$ npm i --save @ai-sdk/openai-compatible

```

然后 **提供者** 成为数据而不是依赖项：将它们的基 URL、API 密钥和模型 ID 保存在数据库表或配置中，并在 `forRootAsync()` 工厂中构建模型：

```typescript title="app.module.ts"
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { Module } from '@nestjs/common';
import { AiModule } from '@nestjs/ai';
import { ProvidersModule } from './providers/providers.module.js';
import { ProvidersService } from './providers/providers.service.js';

@Module({
  imports: [
    AiModule.forRootAsync({
      isGlobal: true,
      imports: [ProvidersModule],
      inject: [ProvidersService],
      useFactory: async (providers: ProvidersService) => {
        // e.g. rows of { name, baseURL, apiKey, modelId }
        const rows = await providers.findAll();
        const models = Object.fromEntries(
          rows.map((row) => [
            row.name,
            createOpenAICompatible({
              name: row.name,
              baseURL: row.baseURL,
              apiKey: row.apiKey,
            })(row.modelId),
          ]),
        );
        return { models };
      },
    }),
  ],
})
export class AppModule {}

```

工厂在启动时运行一次，因此新行在应用程序重启时生效。对于没有指定模型的调用，必须命名一行 `default`，否则空表会导致启动失败。要在使用不重启的情况下使用一行，请在调用时构建模型并将其作为调用的 `model` 传递，该调用具有 [no settings of its own](/ai/models#model-settings)。

`createOpenAICompatible()` 假设服务器最少的功能。对于接受 JSON **模式** 的模型，设置 `supportsStructuredOutputs: true`，否则 [structured output](/ai/overview#structured-output) 不会向其发送 **模式**，并设置 `includeUsage: true` 以在流式调用中请求用法，这依赖于 [budgets](/ai/models#usage-cost-and-budgets)。

当需要 OpenAI API 未暴露的功能时，例如 Anthropic 的提示缓存或 Google 的接地设置，请使用专用的 `@ai-sdk/*` 包。

#### **模块** 选项

| 选项 | 默认值 | 描述 |
| --- | --- | --- |
| `models` | | 模型名称：一个 `LanguageModel`，或带有下面设置的 `{ model, ... }`。除非 `embeddingModels` 指定了模型名称，否则必需 |
| `models.*.fallback` | | 当此模型失败时尝试的模型的名称顺序 |
| `models.*.pricing` | | `input`、`output` 和 `cachedInput`：每百万个 token 的价格 |
| `models.*.timeout`, `retry`, `resilience` | | 模型自身的策略，它们会胜过 `defaults`，因为它们是其生成设置 |
| `defaults.timeout` | `'60s'` | 尝试可能花费的时间；无限制为 `false` |
| `defaults.retry` | 3 次尝试，从 `'1s'` 开始 | `RetryPolicy` 的选项：`attempts`、`backoff` (`delay`、`factor`、`maxDelay`、`jitter` 或一个函数)，`retryIf`；无为 `false` |
| `defaults.resilience` | | 一个策略，或一个 `ResilienceService` 预设的名称，代替 `retry` 和 `timeout` |
| `defaults.maxSteps` | `10` | 模型在请求工具时进行的单次调用，以及一次持久运行（其默认值为 `25`） |
| `defaults.budget` | | 每调用和每次持久运行的 `maxTokens` 和 `maxCost` |
| `defaults.maxOutputTokens`, `temperature`, `providerOptions`, `headers` | | 传递给模型 |
| `onUsage` | | 在每次成功回答的模型调用后调用 |
| `embeddingModels` | | [embedding models](/ai/embeddings)，按名称：一个 `EmbeddingModel`，或具有自身设置的 `{ model, ... }` |
| `embeddingDefaults` | | [settings of embedding calls](/ai/embeddings#embedding-settings)，这些不会到达 `defaults` |
| `onEmbeddingUsage` | | 在每次成功的嵌入调用后调用 |
| `include` | 每个 **模块** | 搜索代理功能的 **提供者** 的 **模块** |
| `isGlobal` | `false` | **模块** 是否为全局的。`forRootAsync()` 的顶层 |
| `modelNames` | | 更多模型名称 `@InjectModel()` 可能注入，适用于在 **模块** 定义后加载的类。`forRootAsync()` 的顶层 |
| `embeddingModelNames` | | `@InjectEmbeddingModel()` 也是如此。`forRootAsync()` 的顶层 |

`defaults` 的每个选项也是每次调用的选项，后者优先。`timeout`、`retry`、`resilience` 和生成设置也是模型定义的设置，它们优先于 `defaults`。

#### 示例

可参考 [here](https://github.com/nestjs/ai/tree/master/sample) 获取一个可工作的示例。