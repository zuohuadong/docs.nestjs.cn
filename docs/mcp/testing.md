<!-- 此文件从 content/mcp/testing.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:05:35.550Z -->
<!-- 源文件: content/mcp/testing.md -->
<!-- 源哈希: b9351e92ffd6d38cfffa78dd6d916414 -->

### 测试

工具、资源和提示是提供者的方法，因此它们的逻辑像任何提供者一样进行测试：调用该方法。MCP 周围添加的内容，如模式、守卫、作用域和结果的形状，是通过一个真实的 MCP 客户端进行测试的，该客户端通过内存中连接到应用程序，如 `@nestjs/mcp/testing` 所示。

#### 单元测试

单元测试会调用方法并传入所需的参数和上下文：

```typescript title="orders/orders.tools.spec.ts"
import type { McpContext } from '@nestjs/mcp';
import { OrdersService } from './orders.service.js';
import { OrdersTools } from './orders.tools.js';

describe('OrdersTools', () => {
  it('changes the delivery address', async () => {
    const orders = {
      changeAddress: vi
        .fn()
        .mockResolvedValue({
          id: 'ord_123',
          address: '12 Whisker Lane, Leeds',
          status: 'pending',
        }),
    };
    const tools = new OrdersTools(orders as unknown as OrdersService);
    const ctx = { authInfo: { clientId: 'support-desk' } } as McpContext;

    const result = await tools.changeAddress(
      { orderId: 'ord_123', address: '12 Whisker Lane, Leeds' },
      ctx,
    );

    expect(result).toEqual({
      orderId: 'ord_123',
      address: '12 Whisker Lane, Leeds',
      status: 'pending',
    });
    expect(orders.changeAddress).toHaveBeenCalledWith(
      'ord_123',
      '12 Whisker Lane, Leeds',
      'support-desk',
    );
  });
});

```

直接调用会跳过模块添加的所有内容：参数不会被验证，守卫和拦截器不会运行，返回值也不会被转换为 MCP 结果。客户端负责测试这些。

#### 内存客户端

`connectMcpClient()` 将官方 MCP SDK 的客户端连接到应用程序，通过与 HTTP 端点相同的处理程序：令牌检查、模式以及每个守卫、拦截器、管道和过滤器。它不启动 HTTP 服务器。该客户端来自 `@modelcontextprotocol/client`，一个开发依赖项：

```bash
$ npm i --save-dev @modelcontextprotocol/client

```

Order API 需要令牌，因此测试用一个知道一些测试令牌的验证器替换了其验证器：

```typescript title="test/test-token.verifier.ts"
import type { McpTokenVerifier } from '@nestjs/mcp';
import type { AuthInfo } from '@modelcontextprotocol/server';

const TOKENS: Record<
  string,
  { clientId: string; scopes: string[]; team?: string }
> = {
  'support-token': {
    clientId: 'support-desk',
    scopes: ['orders:read', 'orders:write'],
    team: 'support',
  },
  'warehouse-token': {
    clientId: 'warehouse',
    scopes: ['orders:read', 'orders:write'],
    team: 'warehouse',
  },
  'reader-token': { clientId: 'reporting', scopes: ['orders:read'] },
};

export class TestTokenVerifier implements McpTokenVerifier {
  async verifyAccessToken(token: string): Promise<AuthInfo | null> {
    const found = TOKENS[token];
    if (!found) {
      return null;
    }
    return {
      token,
      clientId: found.clientId,
      scopes: found.scopes,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      resource: new URL('https://api.catstore.example/mcp'),
      extra: { team: found.team },
    };
  }
}

```

像真实的令牌一样，测试令牌将来需要一个 `expiresAt` 和服务器的 `resource`。测试会覆盖验证器类，并使用一个令牌连接：

```typescript title="test/orders.e2e-spec.ts"
import { Test, type TestingModule } from '@nestjs/testing';
import type { Client } from '@modelcontextprotocol/client';
import { connectMcpClient } from '@nestjs/mcp/testing';
import { AppModule } from '../src/app.module.js';
import { IdentityProviderTokenVerifier } from '../src/auth/identity-provider-token.verifier.js';
import { TestTokenVerifier } from './test-token.verifier.js';

describe('cat-store MCP server', () => {
  let moduleRef: TestingModule;
  let client: Client;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(IdentityProviderTokenVerifier)
      .useClass(TestTokenVerifier)
      .compile();
    client = await connectMcpClient(moduleRef, { token: 'support-token' });
  });

  afterAll(async () => {
    await client.close();
    await moduleRef.close();
  });

  it('lists the tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['find-order', 'change-address']),
    );
  });

  it('finds an order', async () => {
    const result = await client.callTool({
      name: 'find-order',
      arguments: { orderId: 'ord_123' },
    });
    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([
      { type: 'text', text: expect.stringContaining('ord_123') },
    ]);
  });
});

```

该客户端是 SDK 自身的 `Client`：`listTools()`、`callTool()`、`readResource()`、`getPrompt()`，其余部分是助手调用的内容。

#### 结果和错误

工具中出现的问题是模型读取的结果，而不是测试中的异常。`isError` 和文本说明了模型收到的信息：

```typescript title="test/orders.e2e-spec.ts"
it('tells the model about arguments the schema refuses', async () => {
  const result = await client.callTool({
    name: 'change-address',
    arguments: { orderId: 'ord_123', address: 'Leeds' },
  });
  expect(result.isError).toBe(true);
  expect(result.content).toEqual([
    { type: 'text', text: expect.stringContaining('Input validation error') },
  ]);
});

it('returns structured content, as the output schema describes it', async () => {
  const result = await client.callTool({
    name: 'change-address',
    arguments: { orderId: 'ord_123', address: '12 Whisker Lane, Leeds' },
  });
  expect(result.structuredContent).toEqual({
    orderId: 'ord_123',
    address: '12 Whisker Lane, Leeds',
    status: 'pending',
  });
});

it('answers a guard refusal with a tool error', async () => {
  const warehouse = await connectMcpClient(moduleRef, {
    token: 'warehouse-token',
  });
  try {
    const result = await warehouse.callTool({
      name: 'change-address',
      arguments: { orderId: 'ord_123', address: '12 Whisker Lane, Leeds' },
    });
    expect(result).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'Forbidden resource' }],
    });
  } finally {
    await warehouse.close();
  }
});

```

资源和提示则以 JSON-RPC 错误的形式回答，客户端会抛出这些错误：

```typescript title="test/orders.e2e-spec.ts"
it('reads an order', async () => {
  const { contents } = await client.readResource({ uri: 'orders://ord_123' });
  expect(JSON.parse((contents[0] as { text: string }).text)).toMatchObject({
    id: 'ord_123',
  });
});

it('knows no order that does not exist', async () => {
  await expect(
    client.readResource({ uri: 'orders://ord_404' }),
  ).rejects.toThrow();
});

it('drafts a reply', async () => {
  const { messages } = await client.getPrompt({
    name: 'draft-reply',
    arguments: { orderId: 'ord_123', tone: 'friendly' },
  });
  expect(messages[0].content).toMatchObject({
    type: 'text',
    text: expect.stringContaining('friendly'),
  });
});

```

#### 令牌和作用域

为测试所需的每个令牌连接一个客户端。没有其工具声明的作用域的调用在方法运行前就会失败，并返回一个告诉真实客户端要求用户提供更多访问权限的错误。没有令牌的客户端根本无法连接：

```typescript title="test/orders.e2e-spec.ts"
import {
  InsufficientScopeError,
  SdkHttpError,
} from '@modelcontextprotocol/client';

it('asks for orders:write to change an address', async () => {
  const reader = await connectMcpClient(moduleRef, { token: 'reader-token' });
  try {
    const error = await reader
      .callTool({
        name: 'change-address',
        arguments: { orderId: 'ord_123', address: '12 Whisker Lane, Leeds' },
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InsufficientScopeError);
    expect(error).toMatchObject({ requiredScope: 'orders:write' });
  } finally {
    await reader.close();
  }
});

it('refuses a client without a token', async () => {
  await expect(connectMcpClient(moduleRef)).rejects.toBeInstanceOf(
    SdkHttpError,
  );
});

```

#### 头部和协议修订

`headers` 会在每次请求中发送请求头，守卫从 `ctx.request.headers`（小写）中读取这些头。`era: 'legacy'` 作为 2025 协议修订的客户端连接，以检查服务器对两者都有效：

```typescript title="test/orders.e2e-spec.ts"
it('serves clients of the 2025 revisions', async () => {
  const legacy = await connectMcpClient(moduleRef, {
    token: 'support-token',
    era: 'legacy',
  });
  try {
    expect(legacy.getProtocolEra()).toBe('legacy');
    expect(
      (
        await legacy.callTool({
          name: 'find-order',
          arguments: { orderId: 'ord_123' },
        })
      ).isError,
    ).toBeFalsy();
  } finally {
    await legacy.close();
  }
});

```

> info **提示** 内存客户端从端点的路由结束的地方开始：中间件和模块中提供的守卫不会运行，而 `ctx.request` 是一个纯粹的 `{ method, url, headers }` 对象。测试通过 HTTP 上的路由发生的情况。

#### 一次性所有原始类型

`McpRegistry` 存储了模块在启动时找到的内容。测试可以按照您自己的规则持有所有工具，例如模型可以使用的描述：

```typescript title="test/orders.e2e-spec.ts"
import { McpRegistry } from '@nestjs/mcp';

it('describes every tool for the model', () => {
  for (const tool of moduleRef.get(McpRegistry).tools) {
    expect(
      tool.options.description?.length,
      `${tool.name} needs a description`,
    ).toBeGreaterThan(20);
  }
});

```

当应用程序初始化时，注册表被填充，这由 `connectMcpClient()` 完成；如果没有它，请先调用 `moduleRef.init()`。

#### 通过 HTTP

路由本身、全局前缀、中间件、CORS 和 `Origin` 检查是通过套接字进行测试的。在空闲端口上启动应用程序，然后向其发送请求：

```typescript title="test/mcp-endpoint.e2e-spec.ts"
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';

describe('MCP endpoint', () => {
  let app: INestApplication;
  let url: URL;

  const listTools = (headers: Record<string, string> = {}) =>
    fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...headers,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    url = new URL('/mcp', await app.getUrl());
  });

  afterAll(() => app.close());

  it('points a client without a token at the metadata', async () => {
    const response = await listTools();
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain(
      'resource_metadata=',
    );
  });

  it('refuses a page from another site', async () => {
    const response = await listTools({ origin: 'https://elsewhere.example' });
    expect(response.status).toBe(403);
  });
});

```

#### stdio 入口点

要以客户端启动的方式测试 `stdio.ts`，请构建应用程序，并使用 SDK 的 stdio 传输器启动它：

```typescript title="test/stdio.e2e-spec.ts"
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

it('serves the tools over stdio', async () => {
  const client = new Client({ name: 'stdio-e2e', version: '1.0.0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ['dist/stdio.js'],
    }),
  );
  try {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain('find-order');
  } finally {
    await client.close();
  }
});

```

关闭客户端会关闭进程的 stdin，应用程序也会像助手退出时那样关闭。