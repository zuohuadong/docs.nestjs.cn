## 介绍

[OpenAPI](https://swagger.io/specification/) 规范是一种与语言无关的定义格式，用于描述 RESTful API。Nest 提供了一个专用[模块](https://github.com/nestjs/swagger)，可通过装饰器生成此类规范。

#### 安装

要开始使用它，我们首先需要安装所需的依赖项。

```bash
$ npm install --save @nestjs/swagger

```

#### 引导程序

安装过程完成后，打开 `main.ts` 文件并使用 `SwaggerModule` 类初始化 Swagger：

 ```typescript title="main.ts"
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

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
bootstrap();

```

:::info 提示
工厂方法 `SwaggerModule.createDocument()` 专门用于在请求时生成 Swagger 文档。这种方法有助于节省初始化时间，生成的文档是一个符合 [OpenAPI 文档](https://swagger.io/specification/#openapi-document)规范的可序列化对象。除了通过 HTTP 提供文档外，您还可以将其保存为 JSON 或 YAML 文件以多种方式使用。
:::

`DocumentBuilder` 用于构建符合 OpenAPI 规范的基础文档结构。它提供了多种方法用于设置标题、描述、版本等属性。要创建完整文档（包含所有已定义的 HTTP 路由），我们使用 `SwaggerModule` 类的 `createDocument()` 方法。该方法接收两个参数：应用实例和 Swagger 配置对象。此外，我们还可以提供第三个参数，其类型应为 `SwaggerDocumentOptions`。更多细节请参阅[文档选项章节](#文档选项)。

创建文档后，我们可以调用 `setup()` 方法。该方法接收：

1. 挂载 Swagger UI 的路径
2. 应用实例  
3. 上面实例化的文档对象
4. 可选配置参数（了解更多[请点击此处](#设置选项)）

现在可以运行以下命令启动 HTTP 服务器：

```bash
$ npm run start

```

当应用程序运行时，在浏览器中访问 `http://localhost:3000/api`，您将看到 Swagger UI。

<figure><img src="/assets/swagger1.png" /></figure>

如你所见，`SwaggerModule` 会自动反映所有端点。

:::info 提示
要生成并下载 Swagger JSON 文件，请访问 `http://localhost:3000/api-json`（假设你的 Swagger 文档位于 `http://localhost:3000/api`）。你也可以仅通过 `@nestjs/swagger` 中的 setup 方法将其暴露在你选择的路由上，如下所示：
:::

>
> ```typescript
> SwaggerModule.setup('swagger', app, documentFactory, {
>   jsonDocumentUrl: 'swagger/json',
> });
> ```

>
> 这将在 `http://localhost:3000/swagger/json` 上暴露它

:::warning 警告
当使用 `fastify` 和 `helmet` 时，可能会出现 [CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP) 问题，要解决此冲突，请按如下方式配置 CSP：
:::

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

创建文档时，可以提供一些额外选项来微调库的行为。这些选项应为 `SwaggerDocumentOptions` 类型，具体如下：

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
}

```

例如，若需确保库生成类似 `createUser` 而非 `UsersController_createUser` 的操作名称，可进行如下设置：

```typescript
const options: SwaggerDocumentOptions =  {
  operationIdFactory: (
    controllerKey: string,
    methodKey: string
  ) => methodKey
};
const documentFactory = () => SwaggerModule.createDocument(app, config, options);

```

#### Standard Schema（Zod、Valibot）

Nest 的路由参数装饰器通过其 `schema` 选项接受兼容 [Standard Schema](https://standardschema.dev/) 的模式（参见[控制器章节](/controllers#请求对象)）：

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

Swagger 模块会接这些模式，并把它们转换为生成文档中的请求体和参数。

##### 无需配置的库

如果您的验证库实现了 **Standard JSON Schema** 扩展——即其模式暴露了 `~standard.jsonSchema`——Nest 会自行完成转换，无需任何配置。它会请求 `openapi-3.0` 目标，并根据模式描述的是请求还是响应，选用 `input` 或 `output` 变体。

##### 提供转换器

对于未暴露该扩展的库，请在 `SwaggerDocumentOptions` 中提供 `standardSchemaConverter`。它会接收原始模式以及正在生成的 `schemaType`，并返回转换后的 OpenAPI 模式：

```typescript
standardSchemaConverter?: (
  schema: unknown,
  options: { schemaType: 'input' | 'output' },
) => { schema: unknown; components?: Record<string, any> } | undefined;

```

返回 `undefined` 告诉 Nest 该转换器不处理此模式，于是它会回退到上述原生转换。这正是让同一个转换器支持多个库变得安全的原因。

对于 **Zod**，请使用 [zod-openapi](https://github.com/samchungy/zod-openapi)：

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

对于 **Valibot**，请使用 [@valibot/to-json-schema](https://github.com/fabian-hiller/valibot/tree/main/packages/to-json-schema)：

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

注意两者的区别：`createSchema()` 可以提取可复用的定义，因此其结果带有 `components` 映射，您应将其透传，Nest 会合并进文档的共享组件中。而 `toJsonSchema()` 返回单个自包含的模式，因此直接省略 `components` 即可。

##### 同时支持多个库

由于转换器接收到的模式类型是 `unknown`，您可以根据模式的供应商分支处理，从而在同一个应用程序中支持多个库。每个 Standard Schema 都在 `~standard.vendor` 上暴露供应商信息：

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

    // 此处不处理 —— 让 Nest 回退到原生转换
    return undefined;
  },
};

```

> warning **警告** 在调用特定库的转换器之前，务必先按供应商进行判断。把 Valibot 模式传给 `createSchema()`（或反之）会在文档生成时抛出异常，而不是优雅地失败。

> info **提示** 当您的模式执行变换时，`schemaType` 非常重要：`input` 形状是客户端发送的内容，而 `output` 形状是解析后处理器接收到的内容。Nest 会根据被文档化的位置请求相应的形状，因此请将该值直接透传给您的转换器，而不是硬编码。

#### 设置选项

您可以通过将一个符合 `SwaggerCustomOptions` 接口的配置对象作为第四个参数传递给 `SwaggerModule#设置` 方法来配置 Swagger UI。

```typescript
export interface SwaggerCustomOptions {
  /**
   * If `true`, Swagger resources paths will be prefixed by the global prefix set through `setGlobalPrefix()`.
   * Default: `false`.
   * @see ../faq/global-prefix
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

:::info 提示
`ui` 和 `raw` 是独立选项。禁用 Swagger UI (`ui: false`) 不会禁用 API 定义 (JSON/YAML)。反之，禁用 API 定义 (`raw: []`) 也不会影响 Swagger UI 的使用。
:::

>
> 例如，以下配置将禁用 Swagger UI 但仍允许访问 API 定义：
>
> ```typescript
> const options: SwaggerCustomOptions = {
>   ui: false, // Swagger UI is disabled
>   raw: ['json'], // JSON API definition is still accessible (YAML is disabled)
> };
> SwaggerModule.setup('api', app, documentFactory, options);
> ```

>
> 在这种情况下，`http://localhost:3000/api-json` 仍可访问，但 `http://localhost:3000/api`（Swagger UI）将不可用。

#### 示例

一个可用的示例[在此处](https://github.com/nestjs/nest/tree/master/sample/11-swagger)查看。
