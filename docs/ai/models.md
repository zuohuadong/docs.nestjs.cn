<!-- 此文件从 content/ai/models.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:35:43.602Z -->
<!-- 源文件: content/ai/models.md -->
<!-- 源哈希: 1b36ccebecc8faa7e198c278e2cc159d -->

### 模型

每个模型调用都在超时、重试和备用模型下运行，这些设置来自调用的设置、其模型的设置以及模块的设置，并报告其使用的令牌及其成本。

#### 模型设置

`forRoot({ models })` 中的一个模型是从提供者包中的一个 `LanguageModel`，或者是一个定义，其 `LanguageModel` 是其 `model`，并具有自身的设置。存储的 Claude 模型有其价格，默认模型是从另一个提供者获取的备用模型：

```typescript title="app.module.ts"
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { Module } from '@nestjs/common';
import { AiModule } from '@nestjs/ai';

@Module({
  imports: [
    AiModule.forRoot({
      isGlobal: true,
      models: {
        default: {
          model: anthropic('claude-opus-5-5'),
          pricing: { input: 4, output: 20, cachedInput: 0.2 },
          maxOutputTokens: 4_000,
          fallback: 'backup',
        },
        fast: {
          model: anthropic('claude-haiku-5-5'),
          pricing: { input: 0.1, output: 0.5 },
          timeout: '15s',
        },
        backup: openai('gpt-5'),
      },
      defaults: { timeout: '45s', maxOutputTokens: 1_000 },
    }),
  ],
})
export class AppModule {}

```

每个设置来自调用，否则来自模型的定义，否则来自模块的 `defaults`。对 `default` 的调用被发送到 `maxOutputTokens: 4000`，而对 `fast` 或 `backup` 的调用被发送到 `maxOutputTokens: 1000`；设置了 `maxOutputTokens: 200` 的调用发送该调用，由哪个模型回答决定。`fast` 给予 15 秒的尝试时间，其他模型给予 45 秒。

| 设置 | 设置位置 |
| --- | --- |
| `timeout`, `retry`, `resilience` | 调用、模型、`defaults` |
| `maxOutputTokens`, `temperature`, `providerOptions`, `headers` | 调用、模型、`defaults` |
| `maxSteps`, `budget` | 调用、`defaults` |
| `fallback` | 调用、模型 |
| `pricing` | 模型 |
| `onUsage` | 调用和模块：两者都调用 |
| `topP`, `topK`, `seed`, `stopSequences`, `presencePenalty`, `frequencyPenalty`, `toolChoice`, `fallbackIf`, `abortSignal` | 调用 |

`providerOptions` 是提供者包自身的选项，按提供者名称键入，而 `headers` 是随每次发送给提供者的请求发送的 HTTP 头部。

在 `models` 中，模型也可以是一个模型 ID 字符串，例如 `'openai/gpt-5'`，AI SDK 通过 [AI Gateway](https://vercel.com/docs/ai-gateway) 发送。在调用中，字符串始终是模块模型之一的名称。调用也可以将 `LanguageModel` 作为其 `model`，或在其 `fallback` 中：它没有自身的设置，并且结果的 `model.name` 是 `undefined`。

#### 自行调用 AI SDK

要自行调用 AI SDK，请注入模型。`@InjectModel('fast')` 注入了 `LanguageModel`，该 `fast` 命名，而 `@InjectModel()` 注入了 `default`：

```typescript title="support/summaries.service.ts"
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/ai';
import { generateText, type LanguageModel } from 'ai';

@Injectable()
export class SummariesService {
  constructor(@InjectModel('fast') private readonly model: LanguageModel) {}

  async summarize(thread: string): Promise<string> {
    const { text } = await generateText({
      model: this.model,
      instructions: 'Summarize the support thread in three sentences.',
      prompt: thread,
    });
    return text;
  }
}

```

模块未配置的名称在启动时失败，并命名请求它的类：`SummariesService: @InjectModel('fats') asks for a model AiModule does not configure.` 模型是提供者的原始 `LanguageModel`，因此使用它的调用不包含 `AiService` 添加的任何内容：没有超时、没有备用模型、没有预算或使用事件，而是使用 AI SDK 自身的重试（默认 `maxRetries` 次）而不是下面的策略。`AiModels` 列出了已配置的模型，带有 `names()`、`has(name)` 和 `get(name)`。

#### 重试、超时和备用

模型提供者会失败：当发送过多时返回 429，当过载时返回 529，并且偶尔需要一分钟才能响应。每个模型调用都在 [`@nestjs/resilience`](/reliability/resilience) 的策略下运行，该策略由三个设置构建：

- **`timeout`**：一个 `TimeoutPolicy`，默认是 `'60s'`，每次尝试：直到 `generateText()` 和 `generateObject()` 的完整回答，直到 `streamText()` 的第一个块。工具所需的时间不计入，因为此时模型已经回答了。`false` 关闭此功能。
- **`retry`**：一个 `RetryPolicy`，带有其选项：`attempts`（默认 3 次，包含第一次）、`backoff`（来自 `'1s'`，增加到 `'30s'`，带有完全抖动）和 `retryIf`。提供者标记为可重试的响应（408、409、429 和 5xx 响应以及连接失败）都会被重试，超时也是如此。会遵守 `retry-after` 头部，而要求时间超过 `backoff.maxDelay` 的将转到备用模型。`retry: false` 关闭重试。
- **`fallback`**：在模型的重试用尽后，按顺序尝试的模型，每个都遵循其自身的策略。调用可以设置自己的策略（使用 `fallback: ['default']`），或不设置（使用 `fallback: false`），而 `fallbackIf` 缩小了哪些失败会继续。

调用可以更改其中任何一项：

```typescript
const { text } = await this.ai.generateText({
  model: 'fast',
  prompt: email,
  timeout: '10s',
  retry: { attempts: 2, backoff: { delay: '500ms' } },
  fallback: ['default', 'backup'],
  // A request the provider refused (400) would be refused by the next one too
  fallbackIf: (error) =>
    !APICallError.isInstance(error) || error.statusCode !== 400,
});

```

只有调用的模型遵循其 `fallback`：备用模型的 `fallback` 不遵循，因此应继续到第三个模型的调用会列出两者，如上所示。`APICallError` 是 AI SDK 对提供者响应的错误，来自 `ai`。有些失败永远不会继续，无论 `fallbackIf` 如何说明：调用的中止、不匹配 `generateObject()` 模式的回答，以及 AI SDK 对无法发送的调用的错误（例如无效的提示）。

每次备用都会通过 Nest 的 `Logger` 以警告形式记录，包括失败的模型、调用转移到的模型以及原因：错误的类、其 HTTP 状态和其消息。撤销的 API 密钥或被拒绝的请求不能隐藏在有效的备用模型之后：`The model "default" failed (APICallError, 401: Invalid API key); falling back to "backup".`

一旦一个块到达浏览器，或者模型调用的工具已启动，其结果即被确认：没有超时、重试或备用模型可以替换它，因此不会发送两次回答，也不会运行两次工具。

传递给调用的 `abortSignal` 会立即取消它，不进行重试或备用，并且调用以信号的原因拒绝。在像使用 `@Timeout()` 来自 `@nestjs/resilience` 这样的弹性路由内部，路由的尝试以相同的方式停止其发起的模型调用。

#### 调用失败时

当所有尝试在所有尝试过的模型上都失败时，调用以 `AiModelError` 拒绝。其 `attempts` 列表了每个模型、尝试和错误（对于超时尝试的 `ResilienceTimeoutError`），而其 `cause` 是最后一个错误。包的错误扩展到 `AiError`：

| 错误 | 何时发生 |
| --- | --- |
| `AiModelError` | 所有尝试在所有尝试过的模型上都失败：`attempts`, `cause` |
| `AiOutputError` | `generateObject()` 的回答不是 JSON 或不匹配模式，或者模型在 `maxSteps` 之后仍调用了工具：`text` |
| `AiBudgetExceededError` | 调用在下一个模型调用之前耗尽了预算：`usage`, `cost`, `limit` |
| `AiConfigurationError` | 模型、代理函数或包无法使用的选项：在启动时，或在调用被发出之前 |
| `AiToolError` | 模型被告知的关于失败的工具调用的信息：`toolName`，代理函数的名称 |

调用模型的一个路由会以 500 响应一个 `AiModelError`，就像任何其他错误一样。异常过滤器可以改为表示助手不可用：

```typescript title="assistant/model-unavailable.filter.ts"
import {
  Catch,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { AiModelError } from '@nestjs/ai';
import type { Response } from 'express';

@Catch(AiModelError)
export class ModelUnavailableFilter implements ExceptionFilter {
  catch(_error: AiModelError, host: ArgumentsHost) {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(HttpStatus.SERVICE_UNAVAILABLE)
      .json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'The assistant is unavailable. Try again in a minute.',
      });
  }
}

```

#### 您自己的策略

`resilience` 接受一个策略，或 `ResilienceService` 的预设名称，替换 `retry` 和 `timeout`：例如，一个与应用程序其余部分共享的断路器或舱壁。仍然会尝试回退模型，因此对断路器打开的模型调用会继续到下一个模型：

```typescript title="app.module.ts"
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { Module } from '@nestjs/common';
import { AiModule } from '@nestjs/ai';
import { ResilienceModule } from '@nestjs/resilience';

@Module({
  imports: [
    ResilienceModule.forRoot({
      presets: {
        anthropic: {
          retry: { attempts: 3 },
          timeout: '30s',
          circuitBreaker: { name: 'anthropic', failureRateThreshold: 50 },
        },
      },
    }),
    AiModule.forRoot({
      isGlobal: true,
      models: {
        default: {
          model: anthropic('claude-opus-5-5'),
          resilience: 'anthropic',
          fallback: 'backup',
        },
        backup: openai('gpt-5'),
      },
    }),
  ],
})
export class AppModule {}

```

预设用自己的替换模型的 `retry` 和 `timeout`：没有 `timeout` 的预设会使模型的调用没有该设置，而预设的重试仅在其 `backoff` 满足时才遵守 `retry-after`。对此类策略的拒绝（`CircuitOpenError`，`BulkheadFullError`）如果没有任何回退，将像原样到达调用者：一个 `@nestjs/resilience` 错误，该错误在 HTTP 路由上以 503 响应。没有导入 `ResilienceModule` 的预设命名会以 `AiConfigurationError` 失败。

这些策略在 `nestjs:resilience:<type>` 诊断通道上发布 `@nestjs/resilience` 事件：`retry`、`timeout` 和 `fallback`，名称以模型命名（`ai:fast retry`，`ai:fast fallback`），调用中的 `label` 作为它们的 `source`（没有该调用的则为 `AiService`）。要记录每个模型调用的重试：

```typescript title="main.ts"
import { subscribe } from 'node:diagnostics_channel';
import { Logger } from '@nestjs/common';
import type { ResilienceRetryEvent } from '@nestjs/resilience';

const logger = new Logger('Models');

subscribe('nestjs:resilience:retry', (message) => {
  const event = message as ResilienceRetryEvent;
  logger.warn(
    `${event.source}: attempt ${event.attempt} of ${event.policy} failed, ` +
      `retrying in ${Math.round(event.delayMs)} ms`,
  );
});

```

#### 用法、成本和预算

每个响应的模型调用都会发出一个使用事件。对于模型的 `pricing`，以您选择的每百万个 token 单位，它还有一个 `cost`，单位相同。`onUsage` 接收它们：

```typescript title="app.module.ts"
import { anthropic } from '@ai-sdk/anthropic';
import { Logger, Module } from '@nestjs/common';
import { AiModule } from '@nestjs/ai';

const usage = new Logger('Usage');

@Module({
  imports: [
    AiModule.forRoot({
      isGlobal: true,
      models: {
        // US dollars per million tokens
        default: {
          model: anthropic('claude-opus-5-5'),
          pricing: { input: 4, output: 20, cachedInput: 0.2 },
        },
      },
      onUsage: (event) =>
        usage.log(
          `${event.label ?? 'call'} on ${event.model.name}: ` +
            `${event.usage.totalTokens} tokens, $${event.cost?.toFixed(4)}`,
        ),
    }),
  ],
})
export class AppModule {}

```

| 属性 | 含义 |
| --- | --- |
| `label` | 调用的 `label`，用于区分调用 |
| `model` | 响应的模型：`name`、`provider`、`modelId` |
| `step`, `attempt` | 模型调用在调用中的步骤（从 0 开始），以及该模型对此的尝试次数（从 1 开始） |
| `fallback`, `stream` | 是否有回退模型响应，以及调用是否是流式传输的 |
| `usage` | `inputTokens`（包括缓存的），`outputTokens`，`totalTokens`，`cachedInputTokens`，`reasoningTokens` |
| `cost` | 在 `input` 未从缓存读取的输入 token，在 `cachedInput` 的缓存 token（默认为 `input`），以及输出 token；没有 `pricing` 的 `undefined` |
| `durationMs`, `finishReason` | 模型调用花费的时间，以及模型停止的原因 |

一个调用也可以有自己的 `onUsage`，该调用在模块的调用之后发生。监听器抛出的错误会被记录，但绝不会导致调用失败。存储器按客户计量助手的 token：

```typescript
const { text } = await this.ai.generateText({
  label: 'assistant',
  prompt: question,
  onUsage: (event) =>
    this.metering.record(customerId, event.usage.totalTokens, event.cost),
});

```

一个 `budget` 限制一个调用：`maxTokens` 和 `maxCost`，在其所有模型调用中。使用工具的调用会进行多次调用，并且在每次调用前都会检查预算：已用完预算的调用会在下一次模型调用前以 `AiBudgetExceededError` 拒绝，其中包含已花费的量（`usage`、`cost`）和 `limit`。检查不能在模型调用中途停止，因此最后一个调用可能会超出其预算。没有 `pricing` 的模型被视为免费。`defaults.budget` 对每个调用应用预算：

```typescript
const { object } = await this.ai.generateObject({
  model: 'fast',
  schema: Triage,
  prompt: email,
  tools: ['find-order'],
  budget: { maxTokens: 20_000, maxCost: 0.01 },
});

```

> info **提示** 自 `@nestjs/observe` 0.3.20 起，[NestJS Observe](/observability/overview) 会在其出站跨度上记录每个模型调用的模型和 token，就像对任何 AI SDK 调用一样：参见 [Model calls](/observability/sdk#model-calls)。由网关 ID 命名的模型，例如 `'openai/gpt-5'`，是通过 AI 网关的主机 `ai-gateway.vercel.sh` 进行调用的：将其添加到 `outgoing.llm.hosts` 以便 Observe 也读取这些调用。