<!-- 此文件从 content/ai/embeddings.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:35:40.588Z -->
<!-- 源文件: content/ai/embeddings.md -->
<!-- 源哈希: c41e0aeb62f36fb04b232ee01d189dcf -->

### 嵌入 (Embeddings)

嵌入模型将文本转换为向量，这样应用程序就可以根据文本的含义进行比较：`AiService` 调用按名称注册的嵌入模型，并包含超时、重试和使用事件，就像调用语言模型一样。

客户搜索“我的猫不吃东西”，但搜索没有找到任何结果：没有产品说明这一点，而他们想要的是“挑食者的温和食欲支持”。将两者作为向量进行比较，它们是接近的。商店会一次性嵌入其产品的描述，将向量保存在产品旁边，并对每次传入的搜索进行嵌入。

该包仅处理向量。您的应用程序将其存储在 PostgreSQL 中，使用 `pgvector`，或在向量数据库中，如果需要，还会将长文档分割成块。

#### 注册模型

嵌入模型有自己的注册表，`embeddingModels`，位于 `models` 旁边。商店的模型来自 OpenAI，通过其提供者包：

```bash
$ npm i --save @ai-sdk/openai

```

```typescript title="app.module.ts"
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { Module } from '@nestjs/common';
import { AiModule } from '@nestjs/ai';
import { CatalogModule } from './catalog/catalog.module.js';

@Module({
  imports: [
    AiModule.forRoot({
      isGlobal: true,
      models: { default: anthropic('claude-opus-5-5') },
      embeddingModels: {
        default: openai.embeddingModel('text-embedding-3-small'),
      },
    }),
    CatalogModule,
  ],
})
export class AppModule {}

```

嵌入模型是提供者包返回的内容，如上所示，或者是一个定义，其中包含它作为 `model` 和 [settings of its own](/ai/embeddings#embedding-settings)。一个模型 ID 字符串，例如 `'openai/text-embedding-3-small'`，通过 [AI Gateway](https://vercel.com/docs/ai-gateway) 发送，如 `models` 所示。

调用名称不匹配的模型使用 `default`，并且第一个注册的模型永远不会被选中。两个注册表不共享名称：`default` 上是一个用于 `generateText()` 的模型，另一个用于 `embed()`。一个仅进行嵌入的应用程序会排除 `models`，而一个在两者中都没有模型的应用程序会在启动时失败。

#### 调用嵌入模型

`embed()` 嵌入一个文本，而 `embedMany()` 嵌入一个文本列表：

```typescript title="catalog/search.service.ts"
import { Injectable } from '@nestjs/common';
import { AiService } from '@nestjs/ai';
import { ProductsRepository, type Product } from './products.repository.js';

@Injectable()
export class SearchService {
  constructor(
    private readonly ai: AiService,
    private readonly products: ProductsRepository,
  ) {}

  async index(products: Product[]): Promise<void> {
    const { embeddings } = await this.ai.embedMany({
      label: 'index-products',
      values: products.map((product) => product.description),
    });
    await this.products.saveEmbeddings(products, embeddings);
  }

  async search(query: string): Promise<Product[]> {
    const { embedding } = await this.ai.embed({
      label: 'search-products',
      value: query,
    });
    return this.products.findNearest(embedding, 10);
  }
}

```

`model` 指定 `embeddingModels` 中的一个，如果未指定则使用 `default`，并且 `label` 在 [usage events](/ai/embeddings#usage-and-cost) 和其策略事件中命名该调用。调用还可以将一个 `EmbeddingModel` 作为其 `model`：它没有自己的设置，结果的 `model.name` 是 `undefined`。结果包含比向量更多的信息：

| 属性 | 含义 |
| --- | --- |
| `embedding`, `embeddings` | `embed()` 的向量，以及 `embedMany()` 的向量，顺序与 `values` 一致 |
| `value`, `values` | 被嵌入的文本 |
| `usage` | 提供者报告的 token 总数：`tokens` |
| `cost` | 模型的调用成本，对于具有 `pricing` 的模型 |
| `attempts` | 提供者请求的调用，包括重试 |
| `model` | 回答的模型：其 `name`、`provider` 和 `modelId` |
| `warnings`, `providerMetadata` | 提供者添加到其响应中的内容 |
| `response`, `responses` | 提供者对 `embed()` 的 HTTP 响应，以及针对 `embedMany()` 中每个请求的响应 |

如果传入的值不是字符串，或者模块未配置的模型，则在发送任何内容之前会使用 `AiConfigurationError` 拒绝。

要在内存中比较两个向量，`cosineSimilarity()` 从 `ai` 中获取它们，并返回一个介于 -1 到 1 之间的数字。超过几百个文本后，应让数据库使用索引找到最近的向量。

#### 嵌入设置

一个定义为模型提供自己的设置，而 `embeddingDefaults` 将设置应用于每次嵌入调用。每个设置的来源是调用，否则是模型的定义，否则是 `embeddingDefaults`：

```typescript title="app.module.ts"
import { openai } from '@ai-sdk/openai';
import { Module } from '@nestjs/common';
import { AiModule } from '@nestjs/ai';

@Module({
  imports: [
    AiModule.forRoot({
      isGlobal: true,
      embeddingModels: {
        default: openai.embeddingModel('text-embedding-3-small'),
        documents: {
          model: openai.embeddingModel('text-embedding-3-large'),
          providerOptions: { openai: { dimensions: 1024 } },
          maxParallelCalls: 2,
        },
      },
      embeddingDefaults: { timeout: '30s', retry: { attempts: 5 } },
    }),
  ],
})
export class AppModule {}

```

| 设置 | 设置位置 |
| --- | --- |
| `timeout`, `retry`, `resilience` | 调用、模型、`embeddingDefaults` |
| `maxParallelCalls`, `providerOptions`, `headers` | 调用、模型、`embeddingDefaults` |
| `pricing` | 模型 |
| `onEmbeddingUsage` | 调用和模块：两者都会被调用 |
| `abortSignal`, `label` | 调用 |

模块的 `defaults` 是针对语言模型的，其中没有内容会到达嵌入调用：包括它们的超时、头部或提供者选项。`budget` 和 `fallback` 仅是语言模型的设置。

`providerOptions` 是提供者包自身的选项，按提供者名称键入，而 `headers` 是与每次请求到提供者一起发送的 HTTP 头部。向量的维度数量是此类选项，对于允许选择它的模型，如 `documents` 上所示。

#### 批次

`embedMany()` 接受任意数量的值。AI SDK 将它们分割成提供者请求，每个请求中的值数量不超过提供者允许的，并一次发送 `maxParallelCalls` 个：默认 4 个，或者对于不能进行并行调用的模型一次一个。哪个请求先响应，`embeddings` 保持 `values` 的顺序。

#### 重试、超时和取消

每个提供者请求都在由与 [a language model's](/ai/models#retries-timeouts-and-fallback) 相同的设置构建的 [`@nestjs/resilience`](/reliability/resilience) 的策略下运行：默认是 `timeout`、`'60s'`，以及默认的 `retry` 次尝试，它会重试提供者标记为可重试的内容，并遵守 `retry-after` 头部。

这些策略应用于每个请求，而不是整个调用。`timeout` 是单个请求可能花费的时间，因此一个包含 20,000 个值的调用可以运行所需的时间，而失败的请求会单独重试，而不会重新发送其他请求。

当一个请求用尽尝试次数时，调用会使用 [`AiModelError`](/ai/models#when-a-call-fails) 拒绝，其 `attempts` 是该请求的，并且仍在运行的请求将被中止。`embedMany()` 返回所有向量或不返回任何向量，因此已完成请求嵌入的内容会随之丢失。为保持大任务的进度，应分批发送并保存每个批次，在一个队列任务或 [workflow](/reliability/workflows) 的步骤中：

```typescript
const GROUP_SIZE = 500;

for (let start = 0; start < products.length; start += GROUP_SIZE) {
  await this.search.index(products.slice(start, start + GROUP_SIZE));
}

```

传递给调用的 `abortSignal` 会取消正在进行的请求和重试的退避，调用将使用信号的原因拒绝。由于 `timeout` 覆盖单个请求，这也是为整个调用设置截止时间的方法：

```typescript
const { embeddings } = await this.ai.embedMany({
  values: descriptions,
  abortSignal: AbortSignal.timeout(300_000),
});

```

在有 `@Timeout()`（来自 `@nestjs/resilience`）的弹性路由内部，路由的尝试也会以相同的方式停止请求。

嵌入调用没有回退模型。不同模型的向量不可比较，即使它们具有相同的维度数量，因此用一个模型编写的搜索索引也无法用另一个模型读取。

#### 您自己的策略

`resilience` 接收一个策略，或 `ResilienceService` 的预设名称，替换 `retry` 和 `timeout`，就像 [for a language model](/ai/models#policies-of-your-own) 所做的那样。它围绕每个提供者请求运行，因此出站速率限制或舱壁会计算跨所有共享它的调用的请求。存储在提供者处的该策略会将其嵌入请求保持在其配额内：

```typescript title="app.module.ts"
import { openai } from '@ai-sdk/openai';
import { Module } from '@nestjs/common';
import { AiModule } from '@nestjs/ai';
import { ResilienceModule } from '@nestjs/resilience';

@Module({
  imports: [
    ResilienceModule.forRoot({
      presets: {
        embeddings: {
          retry: { attempts: 3 },
          timeout: '30s',
          outboundRateLimit: { limit: 3_000, interval: '1m', maxWait: '1m' },
        },
      },
    }),
    AiModule.forRoot({
      isGlobal: true,
      embeddingModels: {
        default: {
          model: openai.embeddingModel('text-embedding-3-small'),
          resilience: 'embeddings',
        },
      },
    }),
  ],
})
export class AppModule {}

```

为该策略预留时间，以便调用的请求等待。一个未找到令牌的请求在等待了 `maxWait`（默认为 0）后，会使用 `OutboundRateLimitError` 拒绝整个调用；而一个找到已满舱壁的请求，除非该舱壁有 `maxQueue` 来容纳它，否则会使用 `BulkheadFullError` 拒绝。

这些策略会在 `nestjs:resilience:<type>` 诊断通道上发布 `@nestjs/resilience` 事件，通道名称以模型（`ai:embedding:default retry`）命名，调用的 `label` 作为它们的 `source`。

#### 用法和成本

一个成功的调用会发出一个使用事件，其中包含其请求报告的令牌数。对于模型的 `pricing`，其每百万输入令牌的价格以您选择的单位表示，该事件还包含一个 `cost`，单位相同。`onEmbeddingUsage` 接收它们：

```typescript title="app.module.ts"
import { openai } from '@ai-sdk/openai';
import { Logger, Module } from '@nestjs/common';
import { AiModule } from '@nestjs/ai';

const usage = new Logger('Embeddings');

@Module({
  imports: [
    AiModule.forRoot({
      isGlobal: true,
      embeddingModels: {
        default: {
          model: openai.embeddingModel('text-embedding-3-small'),
          // Your provider's price, per million input tokens
          pricing: { input: 0.02 },
        },
      },
      onEmbeddingUsage: (event) =>
        usage.log(
          `${event.label ?? 'call'}: ${event.inputCount} values, ` +
            `${event.usage.tokens} tokens, $${event.cost?.toFixed(6)}`,
        ),
    }),
  ],
})
export class AppModule {}

```

| 属性 | 含义 |
| --- | --- |
| `operation` | `'embed'` 或 `'embedMany'` |
| `label` | 调用的 `label`，用于区分调用 |
| `model` | 响应的模型：`name`, `provider`, `modelId` |
| `inputCount` | 调用嵌入的数值数量 |
| `usage` | 提供者报告的令牌数：`tokens` |
| `attempts` | 提供者请求的调用次数，包括重试 |
| `durationMs` | 调用所需的时间，包括其重试和退避 |
| `cost` | 在 `pricing.input` 的令牌数；在没有 `pricing` 的情况下 `undefined` |

一个调用也可以有自己的 `onEmbeddingUsage`，该钩子在模块的钩子之后调用。`onUsage` 适用于语言模型，不会被调用。监听器抛出的错误会被记录，但绝不会导致调用失败。该事件不携带文本或向量，因此记录是安全的。

这些事件不是计费账本：提供者可能会对超时请求进行计费，而失败的调用不会发出任何事件，即使是已完成的请求也是如此。

#### 自行调用 AI SDK

要自行调用 AI SDK，请注入模型。`@InjectEmbeddingModel('documents')` 注入了 `EmbeddingModel`，该 `documents` 命名，而 `@InjectEmbeddingModel()` 注入了 `default`：

```typescript title="catalog/documents.service.ts"
import { Injectable } from '@nestjs/common';
import { InjectEmbeddingModel } from '@nestjs/ai';
import { embed, type EmbeddingModel } from 'ai';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectEmbeddingModel('documents')
    private readonly model: EmbeddingModel,
  ) {}

  async vectorOf(text: string): Promise<number[]> {
    const { embedding } = await embed({ model: this.model, value: text });
    return embedding;
  }
}

```

模块未配置的名称在启动时失败，并命名了请求它的类。模型是提供者的原始 `EmbeddingModel`，因此使用它的调用不会获得 `AiService` 添加的任何内容：没有策略或使用事件，也没有 AI SDK 自身的重试（`maxRetries`，默认为 2）。`AiEmbeddingModels` 列出了已配置的模型，包括 `names()`、`has(name)` 和 `get(name)`。

在 `forRootAsync()` 下，其工厂返回 `embeddingModels`，因为它返回 `models`，而 `@InjectEmbeddingModel()` 需要 [`@InjectModel()` does](/ai/overview#异步配置)：在模块定义后加载的类在其顶层在 `embeddingModelNames` 中列出其名称。

> info **提示** [Testing](/ai/testing#testing-embeddings) 描述了 `FakeEmbeddingModel`，一个用于测试的嵌入模型，它不调用任何提供者。