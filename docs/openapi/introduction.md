<!-- 此文件从 content/openapi/introduction.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T10:43:25.123Z -->
<!-- 源文件: content/openapi/introduction.md -->
<!-- 源哈希: 1aac9a63751cc39304b50f868ac26896 -->

### 简介

[OpenAPI](https://swagger.io/specification/) 规范是描述 RESTful API 的语言无关的定义格式。Nest 提供了一个专用的 [module](https://github.com/nestjs/swagger)，它能从代码中的 装饰器 生成此类规范。

#### 安装

首先，安装所需的依赖项：

```bash
$ npm install --save @nestjs/swagger

```

> 警告 **警告** 如果您使用 Fastify，也请安装 `@fastify/static`：
>
> ```bash
> $ npm install --save @fastify/static
> ```

#### 引导

安装完成后，打开 `main.ts` 文件，使用 `SwaggerModule` 类初始化 Swagger：

```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('Cats example')
    .setDescription('The cats API description')
    .setVersion('1.0')
    .addTag('cats')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

> 信息 **提示** 将 `SwaggerModule.createDocument()` 包装在工厂函数中，会延迟文档生成直到首次请求文档时，从而节省初始化时间。生成的文档是一个符合 [OpenAPI Document](https://swagger.io/specification/#openapi-document) 规范的可序列化对象。您不一定需要通过 HTTP 提供它，也可以将其保存为 JSON 或 YAML 文件并在其他地方使用。

> 警告 **警告** 如果您急切地调用 `createDocument()`（而不是像上面所示的工厂函数），请确保 `app.enableVersioning()` 先运行。否则，生成的 `paths` 将缺少版本前缀。工厂模式不受影响，因为文档直到首次请求时才构建。

`DocumentBuilder` 结构化了一个符合 OpenAPI 规范的基础文档。其方法允许您设置标题、描述和版本等属性。要创建完整的文档（定义所有 HTTP 路由），请使用 `SwaggerModule` 类的 `createDocument()` 方法。它接受两个参数：一个应用程序实例和由 `DocumentBuilder#build()` 返回的基础文档配置。一个可选的第三个参数，类型为 `SwaggerDocumentOptions`，在 [document options](/openapi/introduction#文档选项) 部分介绍。

接下来，调用 `setup()` 方法。它接受：

1. 挂载 Swagger UI 的路径
2. 一个应用程序实例
3. 文档对象，或返回该对象的工厂函数（如上所示）
4. 一个可选的配置对象（参见 [setup options](/openapi/introduction#设置选项)）

现在运行以下命令启动 HTTP 服务器：

```bash
$ npm run start

```

应用程序运行时，打开浏览器并导航到 `http://localhost:3000/api`。您应该能看到 Swagger UI。

<figure><img src="/assets/swagger1.png" /></figure>

`SwaggerModule` 会自动反映您的所有端点。

> 信息 **提示** 要生成和下载 Swagger JSON 文件，请导航到 `http://localhost:3000/api-json`（假设您的 Swagger 文档在 `http://localhost:3000/api` 下可用）。
> 您也可以使用 `setup()` 方法的 `jsonDocumentUrl` 选项将其暴露在您选择的路由上：
>
> ```typescript
> SwaggerModule.setup('swagger', app, documentFactory, {
>   jsonDocumentUrl: 'swagger/json',
> });
> ```

>
> 这将其暴露在 `http://localhost:3000/swagger/json`。

> 警告 **警告** `setup()` 在 `/api` 处提供 Swagger UI，在 `/api-json` 和 `/api-yaml`（或您使用 `jsonDocumentUrl` 和 `yamlDocumentUrl` 设置的路径）提供文档，对任何可以访问应用程序的人，在所有环境中都是如此。[Guards](/overview/guards) 不对这些路由运行，因此全局 守卫 不会保护它们；在使用 Express 和 Node 适配器时，只有在调用 `setup()` 之前注册时，[middleware](/overview/middlewares) 才会对它们运行。仅在非生产环境中注册 `setup()`，或者在所有三个路径前放置您自己的中间件，因为仅有 `app.use('/api', ...)` 会使另外两个路径开放：
>
> ```typescript
> if (process.env.NODE_ENV !== 'production') {
>   SwaggerModule.setup('api', app, documentFactory);
> }
> ```

> 信息 **提示** Swagger UI 与 Nest 内置 [security headers](/security/helmet) 的默认 [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP) 配合使用。如果您通过 `customJs`/`customJsStr` 添加脚本，或者在本地开发外部通过纯 HTTP 提供 Swagger UI，请参阅 [Swagger UI and GraphQL IDEs](/security/helmet#swagger-ui-and-graphql-ides) 以了解调整的指令。

> 警告 **警告** 如果您直接使用 Fastify 注册 `helmet`，其 [CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP) 可能会阻止 Swagger UI。要解决此冲突，请按如下所示配置 CSP：
>
> ```typescript
> app.register(helmet, {
>   contentSecurityPolicy: {
>     directives: {
>       defaultSrc: [`'self'`],
>       styleSrc: [`'self'`, `'unsafe-inline'`],
>       imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
>       scriptSrc: [`'self'`, `https:`, `'unsafe-inline'`],
>     },
>   },
> });
>
> // If you are not going to use CSP at all, you can use this:
> app.register(helmet, {
>   contentSecurityPolicy: false,
> });
> ```

#### 文档选项

创建文档时，您可以传递额外的选项来微调库的行为。这些选项的类型是 `SwaggerDocumentOptions`：

```typescript
export interface SwaggerDocumentOptions {
  /**
   * List of modules to include in the specification
   */
  include?: Function[];

  /**
   * Additional, extra models that should be inspected and included in the specification
   */
  extraModels?: Function[];

  /**
   * If `true`, swagger will ignore the global prefix set through `setGlobalPrefix()` method
   */
  ignoreGlobalPrefix?: boolean;

  /**
   * If `true`, swagger will also load routes from the modules imported by `include` modules
   */
  deepScanRoutes?: boolean;

  /**
   * Custom operationIdFactory that will be used to generate the `operationId`
   * based on the `controllerKey`, `methodKey`, and version.
   * @default () => controllerKey_methodKey_version
   */
  operationIdFactory?: OperationIdFactory;

  /**
   * Custom linkNameFactory that will be used to generate the name of links
   * in the `links` field of responses
   *
   * @see [Link objects](https://swagger.io/docs/specification/links/)
   *
   * @default () => `${controllerKey}_${methodKey}_from_${fieldKey}`
   */
  linkNameFactory?: (
    controllerKey: string,
    methodKey: string,
    fieldKey: string
  ) => string;

  /*
   * Generate tags automatically based on the controller name.
   * If `false`, you must use the `@ApiTags()` decorator to define tags.
   * Otherwise, the controller name without the suffix `Controller` will be used.
   * @default true
   */
  autoTagControllers?: boolean;

  /**
   * If `true`, swagger will only include routes that are decorated with the `@ApiIncludeEndpoint()` decorator
   * @default false
   */
  onlyIncludeDecoratedEndpoints?: boolean;

  /**
   * If `true`, `default` values that are non-plain objects at runtime
   * (e.g., `new Date()` or class instances) are omitted from the document,
   * so the document doesn't change on every restart.
   * @default false
   */
  excludeDynamicDefaults?: boolean;

  /**
   * If set, `example` and `examples` values on component schemas are
   * truncated once their nested object/array depth exceeds this number.
   * Per-property `@ApiProperty({ exampleMaxDepth })` overrides it.
   * @default undefined
   */
  exampleMaxDepth?: number;

  /**
   * Converts Standard Schema instances passed to route parameter decorators
   * into OpenAPI schemas (see "Standard Schema (Zod, Valibot)" below).
   */
  standardSchemaConverter?: StandardSchemaConverter;
}

```

例如，要生成像 `createUser` 这样的操作名称而不是 `UsersController_createUser`，请设置以下内容：

```typescript
const options: SwaggerDocumentOptions =  {
  operationIdFactory: (
    controllerKey: string,
    methodKey: string
  ) => methodKey
};
const documentFactory = () => SwaggerModule.createDocument(app, config, options);

```

#### 标准模式 (Zod, Valibot)

Nest 路由参数装饰器通过其 `schema` 选项接受兼容 [Standard Schema](https://standardschema.dev/) 的模式（参见 [controllers](/overview/controllers#请求对象) 章）：

```typescript title="cats.controller.ts"
import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';

const createCatSchema = z.object({
  name: z.string(),
  age: z.number().int().positive(),
  breed: z.string(),
});
type CreateCatDto = z.infer<typeof createCatSchema>;

@Controller('cats')
export class CatsController {
  @Post()
  create(@Body({ schema: createCatSchema }) createCatDto: CreateCatDto) {
    return this.catsService.create(createCatDto);
  }
}

```

Swagger 模块会拾取这些模式，并将其转换为生成文档中的请求体和参数。

##### 无需配置的库

如果您的验证库实现了 **标准 JSON Schema** 扩展（即其模式暴露了 `~standard.jsonSchema`），Nest 会自行转换模式，无需配置。例如，Zod 4.2 及更高版本实现了此扩展。Nest 请求 `openapi-3.0` 目标，并根据模式描述请求还是响应使用 `input` 或 `output` 变体。

##### 提供转换器

对于不暴露该扩展的库（或当您希望自己控制转换时），请在 `SwaggerDocumentOptions` 中提供一个 `standardSchemaConverter`。它接收原始模式和正在生成的 `schemaType`，并返回转换后的 OpenAPI 模式：

```typescript
standardSchemaConverter?: (
  schema: unknown,
  options: { schemaType: 'input' | 'output' },
) => { schema: unknown; components?: Record<string, any> } | undefined;

```

Nest 在尝试原生转换之前调用转换器。返回 `undefined` 告诉 Nest 该转换器不处理此模式，因此 Nest 会回退到上述原生转换。这使得一个转换器可以安全地支持多个库。

对于 **Zod**，您可以使用 [zod-openapi](https://github.com/samchungy/zod-openapi)：

```bash
$ npm i --save-dev zod-openapi

```

```typescript title="main.ts"
import { SwaggerDocumentOptions, SwaggerModule } from '@nestjs/swagger';
import { createSchema } from 'zod-openapi';

const documentOptions: SwaggerDocumentOptions = {
  standardSchemaConverter: (schema, { schemaType }) => {
    const converted = createSchema(schema as never, {
      io: schemaType,
      openapiVersion: '3.0.0',
    });
    return { schema: converted.schema, components: converted.components };
  },
};

const documentFactory = () =>
  SwaggerModule.createDocument(app, config, documentOptions);

```

对于 **Valibot**，请使用 [@valibot/to-json-schema](https://github.com/fabian-hiller/valibot/tree/main/packages/to-json-schema)：

```bash
$ npm i --save-dev @valibot/to-json-schema

```

```typescript title="main.ts"
import { SwaggerDocumentOptions } from '@nestjs/swagger';
import { toJsonSchema } from '@valibot/to-json-schema';

const documentOptions: SwaggerDocumentOptions = {
  standardSchemaConverter: (schema, { schemaType }) => ({
    schema: toJsonSchema(schema as never, {
      target: 'openapi-3.0',
      typeMode: schemaType,
    }),
  }),
};

```

这两个转换器在一个方面不同。`createSchema()` 可以提升可重用定义，因此其结果携带一个 `components` 映射，您将其传递，Nest 会将其合并到文档的共享组件中。`toJsonSchema()` 返回一个单一的自包含模式，因此 Valibot 转换器省略了 `components`。

##### 同时支持多个库

因为转换器接收的模式是 `unknown`，所以您可以根据模式的 vendor 进行分支，从而在同一个应用程序中支持多个库。每个 Standard Schema 都在 `~standard.vendor` 暴露其 vendor：

```typescript title="main.ts"
import { SwaggerDocumentOptions } from '@nestjs/swagger';
import { toJsonSchema } from '@valibot/to-json-schema';
import { createSchema } from 'zod-openapi';

function hasVendor(schema: unknown, vendor: string) {
  return (
    !!schema &&
    typeof schema === 'object' &&
    (schema as { '~standard'?: { vendor?: string } })['~standard']?.vendor ===
      vendor
  );
}

const documentOptions: SwaggerDocumentOptions = {
  standardSchemaConverter: (schema, { schemaType }) => {
    if (hasVendor(schema, 'zod')) {
      const converted = createSchema(schema as never, {
        io: schemaType,
        openapiVersion: '3.0.0',
      });
      return { schema: converted.schema, components: converted.components };
    }

    if (hasVendor(schema, 'valibot')) {
      return {
        schema: toJsonSchema(schema as never, {
          target: 'openapi-3.0',
          typeMode: schemaType,
        }),
      };
    }

    // Not handled here - let Nest fall back to native conversion
    return undefined;
  },
};

```

> warning **警告** 调用特定于库的转换器之前，务必先按 vendor 缩小范围。将 Valibot 模式传递给 `createSchema()`（反之亦然）会在文档生成时抛出错误，而不是优雅地失败。

> info **提示** 当您的模式执行转换时，`schemaType` 很重要：`input` 形状是客户端发送的，而 `output` 形状是您的处理器在解析后接收到的。Nest 会请求适合正在被文档化的位置的变体，因此请将值直接传递给您的转换器，而不是硬编码一个。

#### 设置选项

您可以通过将实现 `SwaggerCustomOptions` 接口的选项对象作为 `SwaggerModule#设置()` 方法的第四个参数来配置 Swagger UI。

```typescript
export interface SwaggerCustomOptions {
  /**
   * If `true`, Swagger resources paths will be prefixed by the global prefix set through `setGlobalPrefix()`.
   * Default: `false`.
   * @see /faq/global-prefix
   */
  useGlobalPrefix?: boolean;

  /**
   * If `false`, the Swagger UI will not be served. Only API definitions (JSON and YAML)
   * will be accessible (on `/{path}-json` and `/{path}-yaml`). To fully disable both the Swagger UI and API definitions, use `raw: false`.
   * Default: `true`.
   * @deprecated Use `ui` instead.
   */
  swaggerUiEnabled?: boolean;

  /**
   * If `false`, the Swagger UI will not be served. Only API definitions (JSON and YAML)
   * will be accessible (on `/{path}-json` and `/{path}-yaml`). To fully disable both the Swagger UI and API definitions, use `raw: false`.
   * Default: `true`.
   */
  ui?: boolean;

  /**
   * If `true`, raw definitions for all formats will be served.
   * Alternatively, you can pass an array to specify the formats to be served, e.g., `raw: ['json']` to serve only JSON definitions.
   * If set to `false` or an empty array, no definitions (JSON or YAML) will be served.
   * Use this option to control the availability of Swagger-related endpoints.
   * Default: `true`.
   */
  raw?: boolean | Array<'json' | 'yaml'>;

  /**
   * Url point the API definition to load in Swagger UI.
   */
  swaggerUrl?: string;

  /**
   * Path of the JSON API definition to serve.
   * Default: `<path>-json`.
   */
  jsonDocumentUrl?: string;

  /**
   * Path of the YAML API definition to serve.
   * Default: `<path>-yaml`.
   */
  yamlDocumentUrl?: string;

  /**
   * Hook allowing to alter the OpenAPI document before being served.
   * It's called after the document is generated and before it is served as JSON & YAML.
   * The hook can return either a plain `OpenAPIObject` or a `Promise<OpenAPIObject>`.
   */
  patchDocumentOnRequest?: <TRequest = any, TResponse = any>(
    req: TRequest,
    res: TResponse,
    document: OpenAPIObject
  ) => OpenAPIObject | Promise<OpenAPIObject>;

  /**
   * If `true`, the selector of OpenAPI definitions is displayed in the Swagger UI interface.
   * Default: `false`.
   */
  explorer?: boolean;

  /**
   * Additional Swagger UI options
   */
  swaggerOptions?: SwaggerUiOptions;

  /**
   * Custom CSS styles to inject in Swagger UI page.
   */
  customCss?: string;

  /**
   * URL(s) of a custom CSS stylesheet to load in Swagger UI page.
   */
  customCssUrl?: string | string[];

  /**
   * URL(s) of custom JavaScript files to load in Swagger UI page.
   */
  customJs?: string | string[];

  /**
   * Custom JavaScript scripts to load in Swagger UI page.
   */
  customJsStr?: string | string[];

  /**
   * Custom favicon for Swagger UI page.
   */
  customfavIcon?: string;

  /**
   * Custom title for Swagger UI page.
   */
  customSiteTitle?: string;

  /**
   * File system path (ex: ./node_modules/swagger-ui-dist) containing static Swagger UI assets.
   */
  customSwaggerUiPath?: string;

  /**
   * @deprecated This property has no effect.
   */
  validatorUrl?: string;

  /**
   * @deprecated This property has no effect.
   */
  url?: string;

  /**
   * @deprecated This property has no effect.
   */
  urls?: Record<'url' | 'name', string>[];
}

```

> info **提示** `ui` 和 `raw` 是独立的选项。禁用 Swagger UI（`ui: false`）不禁用 API 定义（JSON/YAML）。反之，禁用 API 定义（`raw: []`）不禁用 Swagger UI。
>
> 例如，以下配置禁用了 Swagger UI，但保留了 JSON API 定义可用：
>
> ```typescript
> const options: SwaggerCustomOptions = {
>   ui: false, // Swagger UI is disabled
>   raw: ['json'], // JSON API definition is still accessible (YAML is disabled)
> };
> SwaggerModule.setup('api', app, documentFactory, options);
> ```

>
> 在这种情况下，`http://localhost:3000/api-json` 仍然可访问，但 `http://localhost:3000/api`（Swagger UI）不可用。

#### 示例

可用的工作示例在 [Nest repository](https://github.com/nestjs/nest/tree/master/sample/11-swagger) 中。