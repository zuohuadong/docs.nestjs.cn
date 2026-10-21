<!-- 此文件从 content/openapi/decorators.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T10:57:56.062Z -->
<!-- 源文件: content/openapi/decorators.md -->
<!-- 源哈希: b6d9b7e84f61237caec3143416b88cab -->

### 装饰器

所有 OpenAPI 装饰器都有一个 `Api` 前缀，以区别于核心装饰器。下表列出了导出的装饰器，以及每个装饰器可以应用到的层级。

|                           |                     |
| ------------------------- | ------------------- |
| `@ApiBasicAuth()`         | 方法 / 控制器 |
| `@ApiBearerAuth()`        | 方法 / 控制器 |
| `@ApiBody()`              | 方法              |
| `@ApiConsumes()`          | 方法 / 控制器 |
| `@ApiCookieAuth()`        | 方法 / 控制器 |
| `@ApiExcludeController()` | 控制器          |
| `@ApiExcludeEndpoint()`   | 方法              |
| `@ApiDefaultGetter()`     | 方法              |
| `@ApiExtension()`         | 方法 / 控制器 |
| `@ApiExtraModels()`       | 方法 / 控制器 / 模型 |
| `@ApiHeader()`            | 方法 / 控制器 |
| `@ApiHeaders()`           | 方法 / 控制器 |
| `@ApiHideProperty()`      | 模型               |
| `@ApiIncludeEndpoint()`   | 方法              |
| `@ApiLink()`              | 方法              |
| `@ApiOAuth2()`            | 方法 / 控制器 |
| `@ApiOperation()`         | 方法              |
| `@ApiParam()`             | 方法 / 控制器 |
| `@ApiProduces()`          | 方法 / 控制器 |
| `@ApiSchema()`            | 模型               |
| `@ApiProperty()`          | 模型               |
| `@ApiPropertyOptional()`  | 模型               |
| `@ApiQuery()`             | 方法 / 控制器 |
| `@ApiResponse()`          | 方法 / 控制器 |
| `@ApiResponseProperty()`  | 模型               |
| `@ApiSecurity()`          | 方法 / 控制器 |
| `@ApiTags()`              | 方法 / 控制器 |
| `@ApiCallbacks()`         | 方法 / 控制器 |
| `@ApiWebhook()`           | 方法              |

简写响应装饰器（例如 `@ApiOkResponse()` 和 `@ApiNotFoundResponse()`，列在 [operations](/openapi/operations#响应) 章节中）可以应用在与 `@ApiResponse()` 相同的层级上。