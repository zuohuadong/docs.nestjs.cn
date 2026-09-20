<!-- 此文件从 content/openapi/operations.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T07:55:20.679Z -->
<!-- 源文件: content/openapi/operations.md -->
<!-- 源哈希: 0eaf26bfb184213e5fab9f0e5346497e -->

### 操作

在 OpenAPI 术语中，路径是 API 暴露的端点（资源），例如 `/users` 或 `/reports/summary`，而操作是用于操作这些路径的 HTTP 方法，例如 `GET`、`POST` 或 `DELETE`。

#### 标签

要将控制器附加到特定标签，请使用 `@ApiTags(...tags)` 装饰器。

```typescript
@ApiTags('cats')
@Controller('cats')
export class CatsController {}

```

OpenAPI 3.2 扩展了 Tag Object，以便标签可以组织成层次结构，并附上关于如何呈现它们的提示。要声明这些关系，请使用 `DocumentBuilder` 预先定义标签，并将 `parent` 和 `kind` 选项传递给 `addTag()`：

```typescript
const config = new DocumentBuilder()
  .setOpenAPIVersion('3.2.0')
  .addTag('Animals', 'Everything about animals', undefined, { kind: 'nav' })
  .addTag('Cats', 'Cat operations', undefined, { parent: 'Animals' })
  .addTag('Dogs', 'Dog operations', undefined, { parent: 'Animals' })
  .build();

```

`parent` 选项通过名称引用另一个标签，而 `kind` 是一个自由格式的机器可读字符串，提示标签的用法——通常是 `nav`、`badge` 或 `audience`。

> warning **警告** `parent` 和 `kind` 字段属于 OpenAPI 3.2 Tag Object。您必须调用 `setOpenAPIVersion('3.2.0')`，否则生成的文档仍会声明 `openapi: 3.0.0`，并且严格的验证器将拒绝这些字段。层次结构字段只能通过 `DocumentBuilder.addTag()` 定义；在 `@ApiTags()` 装饰器上设置它们无效。

#### 请求头

要定义请求中预期的自定义请求头，请使用 `@ApiHeader()`。

```typescript
@ApiHeader({
  name: 'X-MyHeader',
  description: 'Custom header',
})
@Controller('cats')
export class CatsController {}

```

#### 响应

要定义自定义 HTTP 响应，请使用 `@ApiResponse()` 装饰器。

```typescript
@Post()
@ApiResponse({ status: 201, description: 'The record has been successfully created.'})
@ApiResponse({ status: 403, description: 'Forbidden.'})
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}

```

Nest 提供了一组继承自 `@ApiResponse` 装饰器的简写 **API 响应** 装饰器：

- `@ApiOkResponse()`
- `@ApiCreatedResponse()`
- `@ApiAcceptedResponse()`
- `@ApiNoContentResponse()`
- `@ApiMovedPermanentlyResponse()`
- `@ApiFoundResponse()`
- `@ApiBadRequestResponse()`
- `@ApiUnauthorizedResponse()`
- `@ApiNotFoundResponse()`
- `@ApiForbiddenResponse()`
- `@ApiMethodNotAllowedResponse()`
- `@ApiNotAcceptableResponse()`
- `@ApiRequestTimeoutResponse()`
- `@ApiConflictResponse()`
- `@ApiPreconditionFailedResponse()`
- `@ApiTooManyRequestsResponse()`
- `@ApiGoneResponse()`
- `@ApiPayloadTooLargeResponse()`
- `@ApiUnsupportedMediaTypeResponse()`
- `@ApiUnprocessableEntityResponse()`
- `@ApiInternalServerErrorResponse()`
- `@ApiNotImplementedResponse()`
- `@ApiBadGatewayResponse()`
- `@ApiServiceUnavailableResponse()`
- `@ApiGatewayTimeoutResponse()`
- `@ApiDefaultResponse()`

```typescript
@Post()
@ApiCreatedResponse({ description: 'The record has been successfully created.'})
@ApiForbiddenResponse({ description: 'Forbidden.'})
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}

```

要为请求指定返回模型，我们必须创建一个类，并使用 `@ApiProperty()` 装饰器注释所有属性。

```typescript
export class Cat {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  age: number;

  @ApiProperty()
  breed: string;
}

```

然后可以将 `Cat` 模型与响应装饰器的 `type` 属性结合使用。

```typescript
@ApiTags('cats')
@Controller('cats')
export class CatsController {
  @Post()
  @ApiCreatedResponse({
    description: 'The record has been successfully created.',
    type: Cat,
  })
  async create(@Body() createCatDto: CreateCatDto): Promise<Cat> {
    return this.catsService.create(createCatDto);
  }
}

```

让我们打开浏览器并验证生成的 `Cat` 模型：

<figure><img src="/assets/swagger-response-type.png" /></figure>

您可以使用 `DocumentBuilder` 类为所有端点定义全局响应，而不是为每个端点或控制器单独定义响应。当您希望为应用程序中的所有端点定义全局响应（例如，对于像 `401 Unauthorized` 或 `500 Internal Server Error` 这样的错误）时，这种方法非常有用。

```typescript
const config = new DocumentBuilder()
  .addGlobalResponse({
    status: 500,
    description: 'Internal server error',
  })
  // other configurations
  .build();

```

#### 文件上传

您可以使用 `@ApiBody` 装饰器与 `@ApiConsumes()` 一起为特定方法启用文件上传。以下是使用 [File Upload](/techniques/file-upload) 技术的完整示例：

```typescript
@UseInterceptors(FileInterceptor('file'))
@ApiConsumes('multipart/form-data')
@ApiBody({
  description: 'List of cats',
  type: FileUploadDto,
})
uploadFile(@UploadedFile() file: Express.Multer.File) {}

```

其中 `FileUploadDto` 定义如下：

```typescript
class FileUploadDto {
  @ApiProperty({ type: 'string', format: 'binary' })
  file: any;
}

```

要处理多个文件上传，您可以按如下方式定义 `FilesUploadDto`：

```typescript
class FilesUploadDto {
  @ApiProperty({ type: 'array', items: { type: 'string', format: 'binary' } })
  files: any[];
}

```

#### 扩展

要向请求添加扩展，请使用 `@ApiExtension()` 装饰器。扩展名称必须以 `x-` 为前缀。

```typescript
@ApiExtension('x-foo', { hello: 'world' })

```

#### 高级：泛型 `ApiResponse`

借助提供 [Raw Definitions](/openapi/types-and-parameters#原始定义) 的能力，我们可以为 Swagger UI 定义泛型模式。假设我们有以下 DTO：

```ts
export class PaginatedDto<TData> {
  @ApiProperty()
  total: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  offset: number;

  results: TData[];
}

```

我们跳过装饰 `results`，因为我们稍后将为其提供原始定义。现在，让我们定义另一个 DTO，例如命名为 `CatDto`，如下所示：

```ts
export class CatDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  age: number;

  @ApiProperty()
  breed: string;
}

```

有了这些，我们可以定义 `PaginatedDto<CatDto>` 响应，如下所示：

```ts
@ApiOkResponse({
  schema: {
    allOf: [
      { $ref: getSchemaPath(PaginatedDto) },
      {
        properties: {
          results: {
            type: 'array',
            items: { $ref: getSchemaPath(CatDto) },
          },
        },
      },
    ],
  },
})
async findAll(): Promise<PaginatedDto<CatDto>> {}

```

在此示例中，我们指定响应将具有 allOf `PaginatedDto`，并且 `results` 属性将是 `Array<CatDto>` 类型。

- `getSchemaPath()` 函数，从 OpenAPI 规范文件中返回给定模型的 OpenAPI 模式路径。
- `allOf` 是 OAS 3 提供的概念，用于涵盖各种与继承相关的用例。

最后，由于 `PaginatedDto` 未被任何控制器直接引用，`SwaggerModule` 将无法立即生成相应的模型定义。在这种情况下，我们必须将其添加为 [Extra Model](/openapi/types-and-parameters#额外模型)。例如，我们可以在控制器级别使用 `@ApiExtraModels()` 装饰器，如下所示：

```ts
@Controller('cats')
@ApiExtraModels(PaginatedDto)
export class CatsController {}

```

如果您现在运行 Swagger，生成的此特定端点的 `swagger.json` 应定义以下响应：

```json
"responses": {
  "200": {
    "description": "",
    "content": {
      "application/json": {
        "schema": {
          "allOf": [
            {
              "$ref": "#/components/schemas/PaginatedDto"
            },
            {
              "properties": {
                "results": {
                  "$ref": "#/components/schemas/CatDto"
                }
              }
            }
          ]
        }
      }
    }
  }
}

```

为了使其可重用，我们可以为 `PaginatedDto` 创建自定义装饰器，如下所示：

```ts
export const ApiPaginatedResponse = <TModel extends Type<any>>(
  model: TModel,
) => {
  return applyDecorators(
    ApiExtraModels(PaginatedDto, model),
    ApiOkResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(PaginatedDto) },
          {
            properties: {
              results: {
                type: 'array',
                items: { $ref: getSchemaPath(model) },
              },
            },
          },
        ],
      },
    }),
  );
};

```

> info **提示** `Type<any>` 接口和 `applyDecorators` 函数从 `@nestjs/common` 包中导入。

为了确保 `SwaggerModule` 为我们的模型生成定义，我们必须将其添加为额外模型，就像我们之前在控制器中使用 `PaginatedDto` 所做的那样。

有了这些，我们可以在端点上使用自定义的 `@ApiPaginatedResponse()` 装饰器：

```ts
@ApiPaginatedResponse(CatDto)
async findAll(): Promise<PaginatedDto<CatDto>> {}

```

对于客户端生成工具，这种方法在如何为客户端生成 `PaginatedResponse<TModel>` 方面存在歧义。以下片段是上述 `GET /` 端点的客户端生成器结果示例。

```typescript
// Angular
findAll(): Observable<{ total: number, limit: number, offset: number, results: CatDto[] }>

```

如您所见，这里的 **返回类型** 存在歧义。要解决此问题，您可以为 `ApiPaginatedResponse` 的 `schema` 添加 `title` 属性：

```typescript
export const ApiPaginatedResponse = <TModel extends Type<any>>(
  model: TModel,
) => {
  return applyDecorators(
    ApiOkResponse({
      schema: {
        title: `PaginatedResponseOf${model.name}`,
        allOf: [
          // ...
        ],
      },
    }),
  );
};

```

现在客户端生成器工具的结果将变为：

```ts
// Angular
findAll(): Observable<PaginatedResponseOfCatDto>

```