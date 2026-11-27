<!-- 此文件从 content/openapi/operations.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:58:53.452Z -->
<!-- 源文件: content/openapi/operations.md -->
<!-- 源哈希: acf9de53d57cd77797e7d64e357517c2 -->

### 操作

在 OpenAPI 术语中，路径是您的 API 暴露的端点（资源），例如 `/users` 或 `/reports/summary`。操作是用于操作这些路径的 HTTP 方法，例如 `GET`、`POST` 或 `DELETE`。

#### 标签

要将控制器附加到特定标签，请使用 `@ApiTags(...tags)` 装饰器：

```typescript
@ApiTags('cats')
@Controller('cats')
export class CatsController {}

```

OpenAPI 3.2 扩展了 Tag Object，以便标签可以组织成层次结构并用提示来注解它们应该如何呈现。要声明这些关系，请使用 `DocumentBuilder` 预先定义标签，并将 `parent` 和 `kind` 选项传递给 `addTag()`：

```typescript
const config = new DocumentBuilder()
  .setOpenAPIVersion('3.2.0')
  .addTag('Animals', 'Everything about animals', undefined, { kind: 'nav' })
  .addTag('Cats', 'Cat operations', undefined, { parent: 'Animals' })
  .addTag('Dogs', 'Dog operations', undefined, { parent: 'Animals' })
  .build();

```

`parent` 选项引用另一个标签的名称。`kind` 选项是一个自由格式的、机器可读的字符串，提示标签应如何使用，通常是 `nav`、`badge` 或 `audience`。相同的选项对象还接受 `summary`，这是另一个 OpenAPI 3.2 Tag Object 字段。

> 警告 **警告** `parent` 和 `kind` 字段属于 OpenAPI 3.2 Tag Object。您必须调用 `setOpenAPIVersion('3.2.0')`。否则，生成的文档仍然声明 `openapi: 3.0.0`，严格验证器会拒绝这些字段。层次结构字段只能通过 `DocumentBuilder.addTag()` 定义。`@ApiTags()` 装饰器会忽略它们并记录警告。

#### 头部

要定义作为请求一部分所期望的自定义头部，请使用 `@ApiHeader()`：

```typescript
@ApiHeader({
  name: 'X-MyHeader',
  description: 'Custom header',
})
@Controller('cats')
export class CatsController {}

```

#### 响应

要定义自定义 HTTP 响应，请使用 `@ApiResponse()` 装饰器：

```typescript
@Post()
@ApiResponse({ status: 201, description: 'The record has been successfully created.'})
@ApiResponse({ status: 403, description: 'Forbidden.'})
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}

```

Nest 提供了一组基于 `@ApiResponse()` 构建的简写 **API 响应** 装饰器，为每个常见状态码提供一个。它们包括：

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

要为请求指定返回模型，请创建一个类，并使用 `@ApiProperty()` 装饰器注解其所有属性：

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

然后您可以使用响应装饰器的 `Cat` 模型和 `type` 属性：

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

打开浏览器验证生成的 `Cat` 模型：

<figure><img src="/assets/swagger-response-type.png" /></figure>

与为每个端点或控制器单独定义响应不同，您可以使用 `DocumentBuilder` 类为所有端点定义全局响应。这对于应用程序中所有端点可能返回的响应（例如 `401 Unauthorized` 或 `500 Internal Server Error` 等错误）非常有用。

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

要为特定方法记录文件上传，请将 `@ApiBody()` 装饰器与 `@ApiConsumes()` 结合使用。以下是使用 [file upload](/techniques/file-upload) 技术的一个完整示例：

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

要处理多个文件上传，请按如下方式定义 `FilesUploadDto`：

```typescript
class FilesUploadDto {
  @ApiProperty({ type: 'array', items: { type: 'string', format: 'binary' } })
  files: any[];
}

```

#### 扩展

要向操作添加扩展，请使用 `@ApiExtension()` 装饰器。扩展名称必须以 `x-` 为前缀（否则，装饰器会抛出错误）。

```typescript
@ApiExtension('x-foo', { hello: 'world' })

```

#### 高级：通用 `ApiResponse`

使用 [raw definitions](/openapi/types-and-parameters#原始定义)，您可以为 Swagger UI 定义通用的模式。假设您有以下 DTO：

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

我们跳过装饰 `results`，因为稍后将为其提供原始定义。现在，按如下方式定义另一个 DTO，例如 `CatDto`：

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

有了这个设置，您可以定义一个 `PaginatedDto<CatDto>` 响应：

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

在这个示例中，响应结合了 `PaginatedDto`（通过 `allOf`）和一个类型为 `Array<CatDto>` 的 `results` 属性。

- `getSchemaPath()` 返回 OpenAPI 文档中给定模型的 OpenAPI 模式路径。
- `allOf` 是一个覆盖各种继承相关用例的 OAS 3 关键字。

最后，由于没有控制器直接引用 `PaginatedDto`，因此 `SwaggerModule` 尚不能生成相应的模型定义。在这种情况下，您必须将其作为 [extra model](/openapi/types-and-parameters#额外模型) 添加。例如，在控制器级别使用 `@ApiExtraModels()` 装饰器：

```ts
@Controller('cats')
@ApiExtraModels(PaginatedDto)
export class CatsController {}

```

现在运行 Swagger，为该端点生成的 `swagger.json` 定义了以下响应：

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
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/CatDto"
                  }
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

要使其可重用，请为 `PaginatedDto` 创建一个自定义装饰器：

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

> 信息 **提示** `Type<any>` 接口和 `applyDecorators()` 函数是从 `@nestjs/common` 包导入的。

为确保 `SwaggerModule` 为模型生成定义，该装饰器将其注册为带有 `ApiExtraModels()` 的额外模型，就像我们之前在控制器中对 `PaginatedDto` 所做的那样。

有了这个设置，您可以在端点上使用自定义 `@ApiPaginatedResponse()` 装饰器：

```ts
@ApiPaginatedResponse(CatDto)
async findAll(): Promise<PaginatedDto<CatDto>> {}

```

对于客户端生成工具，这种方法使得如何为客户端生成 `PaginatedDto<TModel>` 变得模糊。以下代码片段是针对上述 `GET /` 端点的客户端生成结果示例：

```typescript
// Angular
findAll(): Observable<{ total: number, limit: number, offset: number, results: CatDto[] }>

```

这里的**返回类型**是模糊的。为解决此问题，请在 `ApiPaginatedResponse` 中的 `schema` 上添加一个 `title` 属性：

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

客户端生成器的结果现在变为：

```ts
// Angular
findAll(): Observable<PaginatedResponseOfCatDto>

```