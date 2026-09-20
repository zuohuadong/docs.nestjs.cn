<!-- 此文件从 content/openapi/introduction.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T07:50:15.809Z -->
<!-- 源文件: content/openapi/introduction.md -->
<!-- 源哈希: aaf84f81a536fc7c8e61c27afb98854d -->

### 介绍

[OpenAPI](https://swagger.io/specification/) 规范是一种与语言无关的定义格式，用于描述 RESTful API。Nest 提供了一个专用的 [module](https://github.com/nestjs/swagger)，允许你通过利用装饰器来生成此类规范。

#### 安装

要开始使用它，我们首先安装所需的依赖。

```bash
$ npm install --save @nestjs/swagger

```

> warning **警告** 当使用 `fastify` 时，你还需要安装 `@fastify/static`：
>
> ```bash
> $ npm install --save @fastify/static
> ```

#### 引导

安装过程完成后，打开 `main.ts` 文件，并使用 `SwaggerModule` 类初始化 Swagger：

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

> info **提示** 工厂方法 `SwaggerModule.createDocument()` 专门用于在你请求时生成 Swagger 文档。这种方法有助于节省一些初始化时间，生成的文档是一个可序列化的对象，符合 [OpenAPI Document](https://swagger.io/specification/#openapi-document) 规范。除了通过 HTTP 提供文档外，你还可以将其保存为 JSON 或 YAML 文件，并以各种方式使用。

> warning **警告** 如果你急切地调用 `createDocument()`（而不是像上面那样在工厂函数中调用），请确保 `app.enableVersioning()` 先运行——否则生成的 `paths` 将缺少版本前缀。工厂模式不受影响，因为文档在首次请求之前不会被构建。

`DocumentBuilder` 有助于构建符合 OpenAPI 规范的基础文档。它提供了多种方法，允许你设置诸如标题、描述和版本等属性。为了创建完整的文档（包含所有 HTTP 路由），我们使用 `createDocument()` 类的 `SwaggerModule` 方法。此方法接受两个参数：一个应用程序实例和一个 Swagger 选项对象。或者，我们可以提供第三个参数，其类型应为 `SwaggerDocumentOptions`。更多信息请参阅 [Document options section](/openapi/introduction#文档选项)。

创建文档后，我们可以调用 `setup()` 方法。它接受：

1. 挂载 Swagger UI 的路径
2. 应用程序实例
3. 上面实例化的文档对象
4. 可选的配置参数（更多信息请参阅 [here](/openapi/introduction#设置选项)）

现在你可以运行以下命令来启动 HTTP 服务器：

```bash
$ npm run start

```

当应用程序运行时，打开浏览器并导航到 `http://localhost:3000/api`。你应该会看到 Swagger UI。

<figure><img src="/assets/swagger1.png" /></figure>

如你所见，`SwaggerModule` 会自动反映你的所有端点。

> info **提示** 要生成并下载 Swagger JSON 文件，请导航到 `http://localhost:3000/api-json`（假设你的 Swagger 文档在 `http://localhost:3000/api` 下可用）。
> 也可以仅使用 `@nestjs/swagger` 中的 setup 方法将其暴露在你选择的路由上，如下所示：
>
> ```typescript
> SwaggerModule.setup('swagger', app, documentFactory, {
>   jsonDocumentUrl: 'swagger/json',
> });
> ```

>
> 这将使其暴露在 `http://localhost:3000/swagger/json` 下

> warning **警告** 当使用 `fastify` 和 `helmet` 时，可能会存在 [CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP) 的问题，要解决此冲突，请按如下所示配置 CSP：
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

创建文档时，可以提供一些额外的选项来微调库的行为。这些选项的类型应为 `SwaggerDocumentOptions`，可以是以下内容：

```TypeScript
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
}

```

例如，如果你想确保库生成类似 `createUser` 的操作名称而不是 `UsersController_createUser`，可以设置以下内容：

```TypeScript
const options: SwaggerDocumentOptions =  {
  operationIdFactory: (
    controllerKey: string,
    methodKey: string
  ) => methodKey
};
const documentFactory = () => SwaggerModule.createDocument(app, config, options);

```

#### 标准模式（Zod、Valibot）

Nest 路由参数装饰器通过其 `schema` 选项接受与 [Standard Schema](https://standardschema.dev/) 兼容的模式（请参阅 [Controllers chapter](/overview/controllers#请求对象)）：

```typescript title="cats.controller.ts"
import { z } from 'zod';

const createCatSchema = z.object({
  name: z.string(),
  age: z.number().int().positive(),
  breed: z.string(),
});

@Controller('cats')
export class CatsController {
  @Post()
  create(@Body({ schema: createCatSchema }) createCatDto: CreateCatDto) {
    return this.catsService.create(createCatDto);
  }
}

```

Swagger 模块会获取这些模式，并将其转换为生成的文档中的请求体和参数。

##### 无需配置的库

如果你的验证库实现了 **标准 JSON Schema** 扩展——即其模式暴露了 `~standard.jsonSchema`——Nest 会自行转换它们，无需任何配置。它会请求 `openapi-3.0` 目标，并根据模式描述的是请求还是响应来使用 `input` 或 `output` 变体。

##### 提供转换器

对于未暴露该扩展的库，请在 `SwaggerDocumentOptions` 中提供 `standardSchemaConverter`。它接收原始模式以及正在生成的 `schemaType`，并返回转换后的 OpenAPI 模式：

```typescript
standardSchemaConverter?: (
  schema: unknown,
  options: { schemaType: 'input' | 'output' },
) => { schema: unknown; components?: Record<string, any> } | undefined;

```

返回 `undefined` 告诉 Nest 转换器不处理此模式，因此它会回退到上述的原生转换。这就是为什么从一个转换器支持多个库是安全的原因。

对于 **Zod**，使用 [zod-openapi](https://github.com/samchungy/zod-openapi)：

```bash
$ npm i --save-dev zod-openapi

```

```typescript title="main.ts"
import { SwaggerDocumentOptions } from '@nestjs/swagger';
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

对于 **Valibot**，使用 [@valibot/to-json-schema](https://github.com/fabian-hiller/valibot/tree/main/packages/to-json-schema)：

```bash
$ npm i --save-dev @valibot/to-json-schema

```

```typescript title="main.ts"
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

注意两者之间的区别：`createSchema()` 可以提升可复用的定义，因此其结果带有 `components` 映射，你可以将其传递出去，Nest 会将其合并到文档的共享组件中。`toJsonSchema()` 返回单个自包含的模式，因此 `components` 被简单地省略。

##### 同时支持多个库

由于转换器将模式作为 `unknown` 接收，你可以根据模式的供应商进行分支，并在同一应用程序中支持多个库。每个标准模式都在 `~standard.vendor` 处暴露它：

```typescript title="main.ts"
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

> warning **警告** 在调用特定库的转换器之前，务必先按供应商进行收窄。将 Valibot 模式传递给 `createSchema()`（或反之）会在文档生成时抛出异常，而不是优雅地失败。

> info **提示** 当你的模式执行转换时，`schemaType` 很重要：`input` 形状是客户端发送的内容，而 `output` 形状是解析后你的处理器接收到的内容。Nest 会根据所记录的位置请求相应的内容，因此请将值直接传递给你的转换器，而不是硬编码。

#### 设置选项

你可以通过传递满足 `SwaggerCustomOptions` 接口的选项对象作为 `SwaggerModule#设置` 方法的第四个参数来配置 Swagger UI。

```TypeScript
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
   * If omitted or set to an empty array, no definitions (JSON or YAML) will be served.
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
   */
  patchDocumentOnRequest?: <TRequest = any, TResponse = any>(
    req: TRequest,
    res: TResponse,
    document: OpenAPIObject
  ) => OpenAPIObject;

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

> info **提示** `ui` 和 `raw` 是独立的选项。禁用 Swagger UI（`ui: false`）不会禁用 API 定义（JSON/YAML）。相反，禁用 API 定义（`raw: []`）不会禁用 Swagger UI。
>
> 例如，以下配置将禁用 Swagger UI，但仍允许访问 API 定义：
>
> ```typescript
> const options: SwaggerCustomOptions = {
>   ui: false, // Swagger UI is disabled
>   raw: ['json'], // JSON API definition is still accessible (YAML is disabled)
> };
> SwaggerModule.setup('api', app, options);
> ```

>
> 在这种情况下，http://localhost:3000/api-json 仍然可以访问，但 http://localhost:3000/api（Swagger UI）将无法访问。

#### 示例

一个可用的示例可在 [here](https://github.com/nestjs/nest/tree/master/sample/11-swagger) 获取。