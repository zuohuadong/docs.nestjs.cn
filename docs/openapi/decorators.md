<!-- 此文件从 content/openapi/decorators.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T08:01:09.161Z -->
<!-- 源文件: content/openapi/decorators.md -->
<!-- 源哈希: a8dbb18613eb3fb2d6089ba826b28e39 -->

### 装饰器

所有可用的 OpenAPI 装饰器都有一个 `Api` 前缀，以区别于核心装饰器。以下是导出的装饰器的完整列表，以及装饰器可应用级别的指定。

|                           |                     |
| ------------------------- | ------------------- |
| `@ApiBasicAuth()`         | 方法 / 控制器 |
| `@ApiBearerAuth()`        | 方法 / 控制器 |
| `@ApiBody()`              | 方法              |
| `@ApiConsumes()`          | 方法 / 控制器 |
| `@ApiCookieAuth()`        | 方法 / 控制器 |
| `@ApiExcludeController()` | 控制器          |
| `@ApiExcludeEndpoint()`   | 方法              |
| `@ApiExtension()`         | 方法              |
| `@ApiExtraModels()`       | 方法 / 控制器 |
| `@ApiHeader()`            | 方法 / 控制器 |
| `@ApiHideProperty()`      | 模型               |
| `@ApiOAuth2()`            | 方法 / 控制器 |
| `@ApiOperation()`         | 方法              |
| `@ApiParam()`             | 方法 / 控制器 |
| `@ApiProduces()`          | 方法 / 控制器 |
| `@ApiSchema()`            | 模型               |
| `@ApiProperty()`          | 模型               |
| `@ApiPropertyOptional()`  | 模型               |
| `@ApiQuery()`             | 方法 / 控制器 |
| `@ApiResponse()`          | 方法 / 控制器 |
| `@ApiSecurity()`          | 方法 / 控制器 |
| `@ApiTags()`              | 方法 / 控制器 |
| `@ApiCallbacks()`         | 方法 / 控制器 |