<!-- 此文件从 content/faq/errors.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T01:04:00.101Z -->
<!-- 源文件: content/faq/errors.md -->
<!-- 源哈希: 015b168071acce2b7c4b29c5d6285bdb -->

### 常见错误

在学习和使用 NestJS 时，您可能会遇到本页面描述的错误。

#### "Cannot resolve dependency" 错误

> info **提示** [NestJS Devtools](/devtools/overview#debugging-cannot-resolve-dependency-errors) 可以帮助您解决 "Cannot resolve dependency" 错误。

最常见的错误消息是 Nest 无法解析提供者的依赖。它通常如下所示：

```bash
Nest can't resolve dependencies of the <provider> (?). Please make sure that the argument <unknown_token> at index [<index>] is available in the <module> module.

Potential solutions:
- Is <module> a valid NestJS module?
- If <unknown_token> is a provider, is it part of the current <module>?
- If <unknown_token> is exported from a separate @Module, is that module imported within <module>?
  @Module({
    imports: [ /* the Module containing <unknown_token> */ ]
  })

For more common dependency resolution issues, see: /faq/common-errors

```

最常见的原因是 `<unknown_token>` 在 `<module>` 中不可用：它既没有在模块的 `providers` 数组中列出，也没有被其 `imports` 数组中模块之一导出。请确保提供者已注册并遵循 [standard NestJS provider practices](/fundamentals/dependency-injection#di-fundamentals)。

另一个常见的错误是将提供者放在模块的 `imports` 数组中。如果类使用了 `@Injectable()` 装饰器，Nest 会在启动时检测到这一点并抛出错误，指出该类不能出现在 "imports" 数组中；请将其移动到 `providers` 数组中。

当您遇到此错误时，请打开错误消息中命名的模块并检查其 `providers`。对于 `providers` 数组中的每个提供者，请确保该模块可以访问其所有依赖项。提供者经常在功能模块和根模块中重复，这会导致 Nest 尝试实例化提供者两次。在大多数情况下，您应该删除重复项，而是将包含 `<provider>` 的模块添加到根模块的 `imports` 数组中。

还要确保您没有将提供者注入到自身：NestJS 不允许自注入。发生这种情况时，`<unknown_token>` 通常等于 `<provider>`。

如果报告的索引处的依赖在运行时解析为 `undefined` 或 `Object`，错误消息将省略令牌名称，引用**当前**模块，并列出不同的潜在解决方案：

```bash
Nest can't resolve dependencies of the <provider> (?). Please make sure that the argument at index [<index>] is available in the current module.

Potential solutions:
- The dependency at index [<index>] appears to be undefined at runtime
- This commonly occurs when using 'import type' instead of 'import' for injectable classes
...

```

这通常有以下原因之一：

1. **循环文件导入。** 与下面描述的 [circular dependency](/faq/common-errors#循环依赖错误) 不同，提供者在构造函数中不相互依赖；而是两个文件相互导入。例如，一个模块文件声明一个令牌并导入一个提供者，而该提供者从模块文件导入该令牌常量。如果您使用桶文件（barrel files），请确保您的桶导入不会创建此类循环导入。
2. **按类型或接口注入。** 类型和接口在运行时不存在，因此 Nest 无法将它们用作注入令牌。请注入类引用，或使用带有 `@Inject()` 装饰器的自定义令牌（参见 [custom providers](/fundamentals/dependency-injection)）。
3. **仅类型导入。** 对于基于类的提供者，请使用 [`import type ...`](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export) 语法导入具体的类，而不是仅导入其类型。

<app-banner-observe></app-banner-observe>

在 **monorepo 设置**中，您可能会看到核心 `ModuleRef` 提供者出现与 `<unknown_token>` 相同的错误：

```bash
Nest can't resolve dependencies of the <provider> (?).
Please make sure that the argument ModuleRef at index [<index>] is available in the <module> module.
...

```

这通常发生在您的项目加载了两个 `@nestjs/core` 包的副本时，如下所示：

```text
.
├── package.json
├── apps
│   └── api
│       └── node_modules
│           └── @nestjs/bull
│               └── node_modules
│                   └── @nestjs/core
└── node_modules
    ├── (other packages)
    └── @nestjs/core

```

解决方案：

- 对于 **Yarn** 工作区，使用 [nohoist feature](https://classic.yarnpkg.com/blog/2018/02/15/nohoist) 以防止提升 `@nestjs/core` 包。
- 对于 **pnpm** 工作区，在其他模块中将 `@nestjs/core` 声明为对等依赖，并在导入该模块的应用的 package.json 中设置 `"dependenciesMeta": {"other-module-name": {"injected": true &#125;&#125;`。请参阅 pnpm 文档中的 [dependenciesMeta.injected](https://pnpm.io/package_json#dependenciesmetainjected)。

#### "Circular dependency" 错误

偶尔，您会发现难以避免应用中的 [circular dependencies](/fundamentals/circular-dependency)，需要帮助 Nest 解析它们。由循环依赖引起的错误如下所示：

```bash
Nest cannot create the <module> instance.
The module at index [<index>] of the <module> "imports" array is undefined.

Potential causes:
- A circular dependency between modules. Use forwardRef() to avoid it. Read more: /fundamentals/circular-dependency
- The module at index [<index>] is of type "undefined". Check your import statements and the type of the module.

Scope [<module_import_chain>]
# example chain AppModule -> FooModule

```

循环依赖可能源于相互依赖的提供者，也可能源于相互依赖的 TypeScript 文件（例如，一个模块文件导出一个常量，而一个服务文件导入该常量）。在后一种情况下，请将常量移动到单独的文件中。在前一种情况下，请遵循 [circular dependency](/fundamentals/circular-dependency) 指南，并确保模块**和**提供者都用 `forwardRef()` 包装起来。

#### 调试依赖错误

除了手动验证依赖项外，您可以设置 `NEST_DEBUG` 环境变量为任何非空字符串，以便在 Nest 解析应用程序依赖项时获得额外的日志记录。

<figure><img src="/assets/injector_logs.png" /></figure>

在上面的图像中，黄色字符串是正在注入的依赖的宿主类，蓝色字符串是注入依赖的名称（或注入令牌），紫色字符串是 Nest 搜索依赖的模块。有了此输出，您通常可以跟踪依赖解析过程并找出注入失败的原因。

#### "File change detected" 无限循环

使用 TypeScript 4.9 或更高版本的 Windows 用户可能会遇到此问题。当您以监视模式运行应用程序时（例如，`npm run start:dev`），您会看到以下日志消息的无限循环：

```bash
XX:XX:XX AM - File change detected. Starting incremental compilation...
XX:XX:XX AM - Found 0 errors. Watching for file changes.

```

当您使用 Nest CLI 以监视模式启动应用程序时，它会以监视模式运行 TypeScript 编译器（相当于 `tsc --watch`）。TypeScript 4.9 引入了用于检测文件更改的 [new strategy](https://devblogs.microsoft.com/typescript/announcing-typescript-4-9/#file-watching-now-uses-file-system-events)，这可能是此问题的原因。
要修复此问题，请在 `tsconfig.json` 文件中，在 `"compilerOptions"` 选项之后添加以下设置：

```json
  "watchOptions": {
    "watchFile": "fixedPollingInterval"
  }

```

这告诉 TypeScript 轮询文件更改而不是使用文件系统事件（自 4.9 以来的默认设置），这在某些机器上可能会导致问题。
要了解更多信息，请参阅 TypeScript 文档中的 [`watchFile` option](https://www.typescriptlang.org/tsconfig#watch-watchFile)。