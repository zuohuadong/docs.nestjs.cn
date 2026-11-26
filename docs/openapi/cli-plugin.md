<!-- 此文件从 content/openapi/cli-plugin.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:59:19.495Z -->
<!-- 源文件: content/openapi/cli-plugin.md -->
<!-- 源哈希: d4e8e11f6f65512369d44fde0204760b -->

### CLI 插件

[TypeScript](https://www.typescriptlang.org/docs/handbook/decorators.html) 的元数据反射系统存在一些限制。例如，它无法确定一个类包含哪些属性，或者某个给定属性是可选的还是必需的。然而，其中一些约束可以在编译时解决。Nest 提供了一个插件，用于增强 TypeScript 编译过程，以减少所需的样板代码量。

> info **提示** 此插件是**可选的**。如果愿意，您可以手动声明所有装饰器，或者仅在需要它们的地方声明特定的装饰器。

#### 概述

Swagger 插件会自动执行以下操作：

- 除非使用 `@ApiHideProperty()`，否则用 `@ApiProperty()` 注解所有 DTO 属性
- 根据问号设置 `required` 属性（例如，`name?: string` 设置 `required: false`）
- 根据类型设置 `type` 或 `enum` 属性（也支持数组）
- 根据分配的默认值设置 `default` 属性
- 根据 `class-validator` 装饰器设置多个验证规则（如果 `classValidatorShim` 设置为 `true`）
- 为每个端点添加响应装饰器，包含适当的状态和 `type`（响应模型）
- 根据注释生成属性和端点的描述（如果 `introspectComments` 设置为 `true`）
- 根据注释生成属性的示例值（如果 `introspectComments` 设置为 `true`）

为了让插件分析 DTO 文件，其文件名**必须包含**以下任一后缀：`['.dto.ts', '.entity.ts']`（例如，`create-user.dto.ts`）。

如果您使用不同的后缀，请使用 `dtoFileNameSuffix` 选项调整插件的行为（见下文）。

如果没有该插件，要使用 Swagger UI 提供交互式体验，意味着需要复制大量代码来告诉包如何声明您的模型/组件的规范。例如，您可以像下面这样定义一个简单的 `CreateUserDto` 类：

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

虽然在中型项目中这不是一个大问题，但一旦拥有大量类，就会变得冗长且难以维护。

使用 [Swagger plugin enabled](/openapi/cli-plugin#使用-cli-插件)，您可以不使用任何装饰器来声明上述类：

```typescript
export class CreateUserDto {
  email: string;
  password: string;
  roles: RoleEnum[] = [];
  isEnabled?: boolean = true;
}

```

> info **注意** Swagger 插件从 TypeScript 类型和 `class-validator` 装饰器中推导出 `@ApiProperty()` 注解，这些注解描述了生成的 Swagger UI 文档中的 API。然而，运行时验证仍由 `class-validator` 装饰器处理，因此您仍必须继续使用 `IsEmail()`、`IsNumber()` 等验证器。

换句话说，如果您依赖自动注解进行文档说明，但仍需要运行时验证，您仍然需要 `class-validator` 装饰器。

> info **提示** 当您在 DTO 中使用 [mapped type utilities](/openapi/mapped-types)（如 `PartialType`）时，请从 `@nestjs/swagger` 而不是 `@nestjs/mapped-types` 导入它们，以便插件拾取模式。

该插件基于**抽象语法树**即时添加适当的装饰器，因此您不必在代码中分散 `@ApiProperty()` 装饰器。

> info **提示** 插件会生成任何缺失的 Swagger 属性。要覆盖其中一个，请通过 `@ApiProperty()` 明确设置它。

#### 注释内省

启用注释内省功能后，CLI 插件会根据注释为属性生成描述和示例值。

例如，考虑一个 `roles` 属性：

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

您必须重复描述和示例值。启用 `introspectComments` 后，CLI 插件会提取这些注释，并自动为属性提供描述（以及如果定义了则提供示例）。上述属性可以像下面这样声明：

```typescript
/**
 * A list of user's roles
 * @example ['admin']
 */
roles: RoleEnum[] = [];

```

`dtoKeyOfComment` 和 `controllerKeyOfComment` 插件选项分别自定义插件如何将注释值分配给 `ApiProperty` 和 `ApiOperation` 装饰器。参见下面的示例：

```typescript
export class SomeController {
  /**
   * Create some resource
   */
  @Post()
  create() {}
}

```

这等同于以下内容：

```typescript
@ApiOperation({ summary: "Create some resource" })

```

> info **提示** 对于模型，适用相同逻辑，但使用 `ApiProperty` 装饰器。

对于控制器，您可以提供摘要，也可以提供描述（备注）、标签（如 `@deprecated`）和响应示例，如下所示：

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

从 `@nestjs/swagger` v12 开始，插件（启用 `introspectComments`）还会拾取 `@param` 标签，因此路由参数描述可以来自相同的文档注释：

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

插件为可选 `@Query()` 参数生成的 `@ApiQuery()` 添加 `description`，为已记录的必需查询参数生成 `@ApiQuery({ name, description &#125;)`，并为已记录的 `@Param()` 参数生成 `@ApiParam({ name, description &#125;)`。

描述是根据**变量名**匹配的，这是 `@param` 文档的内容。因此，`@Query('order_by') orderBy: string` 被文档化为 `@param orderBy ...`，而不是 `@param order_by ...`。明确的 `@ApiQuery()` / `@ApiParam()` 装饰器始终优先，绝不会被覆盖。

#### 使用 CLI 插件

要启用插件，请打开 `nest-cli.json`（如果您使用 [Nest CLI](/cli/overview)）并添加以下 `plugins` 配置：

```javascript
{
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "plugins": ["@nestjs/swagger"]
  }
}

```

使用 `options` 属性来自定义插件的行为：

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

`options` 属性接受以下选项（以及其他选项）：

```typescript
export interface PluginOptions {
  dtoFileNameSuffix?: string | string[];
  controllerFileNameSuffix?: string | string[];
  classValidatorShim?: boolean;
  classTransformerShim?: boolean | 'exclusive';
  dtoKeyOfComment?: string;
  controllerKeyOfComment?: string;
  introspectComments?: boolean;
  skipAutoHttpCode?: boolean;
  skipDefaultValues?: boolean;
  autoFillEnumName?: boolean;
  esmCompatible?: boolean;
}

```

<table>
  <tr>
    <th>Option</th>
    <th>Default</th>
    <th>Description</th>
  </tr>
  <tr>
    <td><code>dtoFileNameSuffix</code></td>
    <td><code>['.dto.ts', '.entity.ts']</code></td>
    <td>DTO (数据传输对象) 文件后缀</td>
  </tr>
  <tr>
    <td><code>controllerFileNameSuffix</code></td>
    <td><code>['.controller.ts']</code></td>
    <td>控制器文件后缀</td>
  </tr>
  <tr>
    <td><code>classValidatorShim</code></td>
    <td><code>true</code></td>
    <td>如果设置为<code>true</code>，则插件重用<code>class-validator</code> 验证装饰器（例如，<code>@Max(10)</code> 会在模式定义中添加 <code>max: 10</code>）</td>
  </tr>
  <tr>
    <td><code>classTransformerShim</code></td>
    <td><code>false</code></td>
    <td>如果设置为<code>true</code>，则插件会跳过使用<code>class-transformer</code> 的 <code>@Exclude()</code> 装饰的属性。如果设置为<code>'exclusive'</code>，则仅记录使用 <code>@Expose()</code> 或 <code>@ApiProperty()</code> 装饰的属性</td>
  </tr>
  <tr>
    <td><code>dtoKeyOfComment</code></td>
    <td><code>'description'</code></td>
    <td>用于在 <code>ApiProperty</code> 上设置注释文本的属性键</td>
  </tr>
  <tr>
    <td><code>controllerKeyOfComment</code></td>
    <td><code>'summary'</code></td>
    <td>用于在 <code>ApiOperation</code> 上设置注释文本的属性键</td>
  </tr>
  <tr>
    <td><code>introspectComments</code></td>
    <td><code>false</code></td>
    <td>如果设置为<code>true</code>，则插件会根据注释为属性生成描述和示例值</td>
  </tr>
  <tr>
    <td><code>skipAutoHttpCode</code></td>
    <td><code>false</code></td>
    <td>禁用控制器中自动添加 <code>@HttpCode()</code> 的功能</td>
  </tr>
  <tr>
    <td><code>skipDefaultValues</code></td>
    <td><code>false</code></td>
    <td>如果设置为<code>true</code>，则插件不会从属性初始化器中设置 <code>default</code> 属性</td>
  </tr>
  <tr>
    <td><code>autoFillEnumName</code></td>
    <td><code>false</code></td>
    <td>如果设置为<code>true</code>，则插件会将 <code>enumName</code> 设置为未声明该属性的枚举类型的名称</td>
  </tr>
  <tr>
    <td><code>esmCompatible</code></td>
    <td>按文件检测</td>
    <td>使生成的代码与 ESM（<code>&#123; "type": "module" &#125;</code>）兼容。如果省略，插件会检测每个文件是否从编译器选项以 ESM 形式发出，以及 <code>package.json</code></td>
  </tr>
</table>

更新插件选项时，请删除 `/dist` 文件夹并重建您的应用程序。

如果您不使用 CLI，而是使用自定义 `webpack` 配置，则可以与 `ts-loader` 结合使用此插件：

```javascript
getCustomTransformers: (program: any) => ({
  before: [require('@nestjs/swagger/plugin').before({}, program)]
}),

```

#### SWC 构建器

对于标准（非 Monorepo）设置，使用 SWC 构建器和 CLI 插件需要启用类型检查，如 [SWC recipe](/recipes/swc#类型检查) 所述。

```bash
$ nest start -b swc --type-check

```

对于 Monorepo 设置，请遵循 [monorepo and CLI plugins](/recipes/swc#monorepo-and-cli-plugins) 的说明创建 `generate-metadata.ts` 文件，然后运行它：

```bash
$ npx ts-node src/generate-metadata.ts
# OR npx ts-node apps/{YOUR_APP}/src/generate-metadata.ts

```

然后使用 `SwaggerModule#loadPluginMetadata()` 方法加载序列化的元数据文件，如下所示：

```typescript
import metadata from './metadata.js'; // <-- file auto-generated by the "PluginMetadataGenerator"

await SwaggerModule.loadPluginMetadata(metadata); // <-- here
const document = SwaggerModule.createDocument(app, config);

```

#### 与 `ts-jest` (e2e 测试) 的集成

要运行 e2e 测试，`ts-jest` 会在内存中即时编译您的源代码文件。这意味着它不使用 Nest CLI 编译器，也不应用任何插件或执行 AST 转换。

要启用此插件，请在 e2e 测试目录中创建以下文件：

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

设置好后，在您的 `jest` 配置文件中导入 AST 转换器。默认情况下（在启动应用程序中），e2e 测试配置文件位于 `test` 文件夹中，名称为 `jest-e2e.json`。

如果您使用 `jest@<29`，请使用以下代码片段：

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

如果您使用 `jest@^29`，请使用以下代码片段，因为以前的方法已被弃用：

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

#### 故障排除 `jest` (e2e 测试)

如果 `jest` 似乎没有拾取您的配置更改，Jest 可能**缓存**了构建结果。要应用新配置，请在 NestJS 项目文件夹中运行以下命令清除 Jest 的缓存目录：

```bash
$ npx jest --clearCache

```

如果自动清除缓存失败，请使用以下命令手动删除缓存文件夹：

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