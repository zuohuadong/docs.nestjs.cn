<!-- 此文件从 content/openapi/cli-plugin.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T08:06:10.116Z -->
<!-- 源文件: content/openapi/cli-plugin.md -->
<!-- 源哈希: 14f350655203f9035f97f9117029c464 -->

### CLI 插件

[TypeScript](https://www.typescriptlang.org/docs/handbook/decorators.html) 的元数据反射系统存在一些限制，例如无法确定类包含哪些属性，或无法识别给定属性是可选还是必填。然而，其中一些限制可以在编译时解决。Nest 提供了一个插件，用于增强 TypeScript 编译过程，以减少所需的样板代码量。

> info **提示** 此插件是**可选**的。如果你愿意，可以手动声明所有装饰器，或者仅在你需要的地方声明特定的装饰器。

#### 概述

Swagger 插件将自动：

- 为所有 DTO 属性添加 `@ApiProperty` 注解，除非使用了 `@ApiHideProperty`
- 根据问号设置 `required` 属性（例如 `name?: string` 将设置 `required: false`）
- 根据类型设置 `type` 或 `enum` 属性（也支持数组）
- 根据分配的默认值设置 `default` 属性
- 根据 `class-validator` 装饰器设置多个验证规则（如果 `classValidatorShim` 设置为 `true`）
- 为每个端点添加一个带有适当状态和 `type`（响应模型）的响应装饰器
- 根据注释为属性和端点生成描述（如果 `introspectComments` 设置为 `true`）
- 根据注释为属性生成示例值（如果 `introspectComments` 设置为 `true`）

请注意，你的文件名**必须**具有以下后缀之一：`['.dto.ts', '.entity.ts']`（例如 `create-user.dto.ts`），以便插件进行分析。

如果你使用不同的后缀，可以通过指定 `dtoFileNameSuffix` 选项来调整插件的行为（见下文）。

以前，如果你想提供 Swagger UI 的交互式体验，你必须复制大量代码，让包知道你的模型/组件应如何在规范中声明。例如，你可以定义一个简单的 `CreateUserDto` 类，如下所示：

```typescript
export class CreateUserDto {
  @ApiProperty()
  email: string;

  @ApiProperty()
  password: string;

  @ApiProperty({ enum: RoleEnum, default: [], isArray: true })
  roles: RoleEnum[] = [];

  @ApiProperty({ required: false, default: true })
  isEnabled?: boolean = true;
}

```

虽然对于中型项目来说这不是一个重大问题，但一旦你拥有大量类，它就会变得冗长且难以维护。

通过 [enabling the Swagger plugin](/openapi/cli-plugin#使用-cli-插件)，上述类定义可以简单地声明为：

```typescript
export class CreateUserDto {
  email: string;
  password: string;
  roles: RoleEnum[] = [];
  isEnabled?: boolean = true;
}

```

> info **注意** Swagger 插件将从 TypeScript 类型和 class-validator 装饰器中推导出 @ApiProperty() 注解。这有助于为生成的 Swagger UI 文档清晰地描述你的 API。然而，运行时的验证仍将由 class-validator 装饰器处理。因此，需要继续使用诸如 `IsEmail()`、`IsNumber()` 等验证器。

因此，如果你打算依赖自动注解来生成文档，并且仍然希望进行运行时验证，那么 class-validator 装饰器仍然是必需的。

> info **提示** 当在 DTO 中使用 [mapped types utilities](/openapi/mapped-types)（如 `PartialType`）时，请从 `@nestjs/swagger` 导入它们，而不是从 `@nestjs/mapped-types` 导入，以便插件能够获取模式。

插件会根据**抽象语法树**动态添加适当的装饰器。因此，你无需处理散布在代码中的 `@ApiProperty` 装饰器。

> info **提示** 插件会自动生成任何缺失的 swagger 属性，但如果你需要覆盖它们，只需通过 `@ApiProperty()` 显式设置即可。

#### 注释内省

启用注释内省功能后，CLI 插件将根据注释为属性生成描述和示例值。

例如，给定一个示例 `roles` 属性：

```typescript
/**
 * A list of user's roles
 * @example ['admin']
 */
@ApiProperty({
  description: `A list of user's roles`,
  example: ['admin'],
})
roles: RoleEnum[] = [];

```

你必须同时复制描述和示例值。启用 `introspectComments` 后，CLI 插件可以提取这些注释，并自动为属性提供描述（以及示例，如果定义了的话）。现在，上述属性可以简单地声明如下：

```typescript
/**
 * A list of user's roles
 * @example ['admin']
 */
roles: RoleEnum[] = [];

```

有 `dtoKeyOfComment` 和 `controllerKeyOfComment` 插件选项可用于自定义插件如何分别将值分配给 `ApiProperty` 和 `ApiOperation` 装饰器。请参见下面的示例：

```typescript
export class SomeController {
  /**
   * Create some resource
   */
  @Post()
  create() {}
}

```

这等同于以下指令：

```typescript
@ApiOperation({ summary: "Create some resource" })

```

> info **提示** 对于模型，同样的逻辑适用，但使用的是 `ApiProperty` 装饰器。

对于控制器，你不仅可以提供摘要，还可以提供描述（备注）、标签（例如 ` @deprecated`）和响应示例，如下所示：

```ts
/**
 * Create a new cat
 *
 * @remarks This operation allows you to create a new cat.
 *
 * @deprecated
 * @throws {500} Something went wrong.
 * @throws {400} Bad Request.
 */
@Post()
async create(): Promise<Cat> {}

```

从 `@nestjs/swagger` v12 开始，也会拾取 `@param` 标签，因此路由参数描述可以来自同一个文档注释：

```ts
/**
 * List cats
 *
 * @param breed Filter results by breed
 * @param limit Maximum number of results to return
 */
@Get()
findAll(@Query('breed') breed?: string, @Query('limit') limit?: number) {}

```

插件会为可选的 `@Query()` 参数添加一个 `description` 到它已经生成的 `@ApiQuery()` 中，为文档化的必需查询参数生成 `@ApiQuery({ name, description &#125;)`，并为文档化的 `@Param()` 参数生成 `@ApiParam({ name, description &#125;)`。

描述通过**变量名**进行匹配，这正是 `@param` 所记录的 - 因此 `@Query('order_by') orderBy: string` 被记录为 `@param orderBy ...`，而不是 `@param order_by ...`。显式的 `@ApiQuery()` / `@ApiParam()` 装饰器始终优先，并且永远不会被覆盖。

#### 使用 CLI 插件

要启用插件，请打开 `nest-cli.json`（如果你使用 [Nest CLI](/cli/overview)）并添加以下 `plugins` 配置：

```javascript
{
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "plugins": ["@nestjs/swagger"]
  }
}

```

你可以使用 `options` 属性来自定义插件的行为。

```javascript
{
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "plugins": [
      {
        "name": "@nestjs/swagger",
        "options": {
          "classValidatorShim": false,
          "introspectComments": true,
          "skipAutoHttpCode": true
        }
      }
    ]
  }
}

```

`options` 属性必须满足以下接口：

```typescript
export interface PluginOptions {
  dtoFileNameSuffix?: string[];
  controllerFileNameSuffix?: string[];
  classValidatorShim?: boolean;
  dtoKeyOfComment?: string;
  controllerKeyOfComment?: string;
  introspectComments?: boolean;
  skipAutoHttpCode?: boolean;
  esmCompatible?: boolean;
}

```

<table>
  <tr>
    <th>选项</th>
    <th>默认值</th>
    <th>描述</th>
  </tr>
  <tr>
    <td><code>dtoFileNameSuffix</code></td>
    <td><code>['.dto.ts', '.entity.ts']</code></td>
    <td>DTO（数据传输对象）文件后缀</td>
  </tr>
  <tr>
    <td><code>controllerFileNameSuffix</code></td>
    <td><code>.controller.ts</code></td>
    <td>控制器文件后缀</td>
  </tr>
  <tr>
    <td><code>classValidatorShim</code></td>
    <td><code>true</code></td>
    <td>如果设置为 true，模块将重用 <code>class-validator</code> 验证装饰器（例如 <code>@Max(10)</code> 将向模式定义添加 <code>max: 10</code>）</td>
  </tr>
  <tr>
    <td><code>dtoKeyOfComment</code></td>
    <td><code>'description'</code></td>
    <td>在 <code>ApiProperty</code> 上设置注释文本的属性键。</td>
  </tr>
  <tr>
    <td><code>controllerKeyOfComment</code></td>
    <td><code>'summary'</code></td>
    <td>在 <code>ApiOperation</code> 上设置注释文本的属性键。</td>
  </tr>
  <tr>
    <td><code>introspectComments</code></td>
    <td><code>false</code></td>
    <td>如果设置为 true，插件将根据注释为属性生成描述和示例值</td>
  </tr>
  <tr>
    <td><code>skipAutoHttpCode</code></td>
    <td><code>false</code></td>
    <td>禁用控制器中自动添加 <code>@HttpCode()</code></td>
  </tr>
  <tr>
    <td><code>esmCompatible</code></td>
    <td><code>false</code></td>
    <td>如果设置为 true，则解决使用 ESM（<code>&#123; "type": "module" &#125;</code>）时遇到的语法错误。</td>
  </tr>
</table>

确保在更新插件选项时删除 `/dist` 文件夹并重新构建应用程序。

如果你不使用 CLI，而是有自定义的 `webpack` 配置，你可以将此插件与 `ts-loader` 结合使用：

```javascript
getCustomTransformers: (program: any) => ({
  before: [require('@nestjs/swagger/plugin').before({}, program)]
}),

```

#### SWC 构建器

对于标准设置（非 monorepo），要在 SWC 构建器中使用 CLI 插件，你需要启用类型检查，如 [here](/recipes/swc#类型检查) 所述。

```bash
$ nest start -b swc --type-check

```

对于 monorepo 设置，请遵循 [here](/recipes/swc#monorepo-and-cli-plugins) 中的说明。

```bash
$ npx ts-node src/generate-metadata.ts
# OR npx ts-node apps/{YOUR_APP}/src/generate-metadata.ts

```

现在，序列化的元数据文件必须由 `SwaggerModule#loadPluginMetadata` 方法加载，如下所示：

```typescript
import metadata from './metadata.js'; // <-- file auto-generated by the "PluginMetadataGenerator"

await SwaggerModule.loadPluginMetadata(metadata); // <-- here
const document = SwaggerModule.createDocument(app, config);

```

#### 与 `ts-jest` 的集成（e2e 测试）

要运行 e2e 测试，`ts-jest` 会在内存中即时编译你的源代码文件。这意味着，它不使用 Nest CLI 编译器，也不会应用任何插件或执行 AST 转换。

要启用插件，请在 e2e 测试目录中创建以下文件：

```javascript
const transformer = require('@nestjs/swagger/plugin');

module.exports.name = 'nestjs-swagger-transformer';
// you should change the version number anytime you change the configuration below - otherwise, jest will not detect changes
module.exports.version = 1;

module.exports.factory = (cs) => {
  return transformer.before(
    {
      // @nestjs/swagger/plugin options (can be empty)
    },
    cs.program, // "cs.tsCompiler.program" for older versions of Jest (<= v27)
  );
};

```

有了这个，在你的 `jest` 配置文件中导入 AST 转换器。默认情况下（在入门应用程序中），e2e 测试配置文件位于 `test` 文件夹下，名为 `jest-e2e.json`。

如果你使用 `jest@<29`，则使用下面的代码片段。

```json
{
  ... // other configuration
  "globals": {
    "ts-jest": {
      "astTransformers": {
        "before": ["<path to the file created above>"]
      }
    }
  }
}

```

如果你使用 `jest@^29`，则使用下面的代码片段，因为之前的方法已被弃用。

```json
{
  ... // other configuration
  "transform": {
    "^.+\\.(t|j)s$": [
      "ts-jest",
      {
        "astTransformers": {
          "before": ["<path to the file created above>"]
        }
      }
    ]
  }
}

```

#### 故障排除 `jest`（e2e 测试）

如果 `jest` 似乎没有获取你的配置更改，可能是因为 Jest 已经**缓存**了构建结果。要应用新配置，你需要清除 Jest 的缓存目录。

要清除缓存目录，请在 NestJS 项目文件夹中运行以下命令：

```bash
$ npx jest --clearCache

```

如果自动清除缓存失败，你仍然可以使用以下命令手动删除缓存文件夹：

```bash
# Find jest cache directory (usually /tmp/jest_rs)
# by running the following command in your NestJS project root
$ npx jest --showConfig | grep cache
# ex result:
#   "cache": true,
#   "cacheDirectory": "/tmp/jest_rs"

# Remove or empty the Jest cache directory
$ rm -rf  <cacheDirectory value>
# ex:
# rm -rf /tmp/jest_rs

```