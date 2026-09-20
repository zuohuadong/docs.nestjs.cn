<!-- 此文件从 content/fundamentals/circular-dependency.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:30:03.011Z -->
<!-- 源文件: content/fundamentals/circular-dependency.md -->
<!-- 源哈希: 7790e7a15c3c4beab069cdc3cc3ca072 -->

### 循环依赖

当两个类相互依赖时，就会发生循环依赖。例如，类 A 需要类 B，而类 B 也需要类 A。在 Nest 中，循环依赖可能出现在模块之间和提供者之间。

虽然应尽可能避免循环依赖，但并非总能做到。在这种情况下，Nest 允许你通过两种方式解决提供者之间的循环依赖。在本章中，我们将介绍使用**前向引用**作为一种技术，以及使用 **ModuleRef** 类从 DI 容器中检索提供者实例作为另一种技术。

我们还将介绍如何解决模块之间的循环依赖。

> warning **警告** 使用"桶文件"/index.ts 文件来分组导入时，也可能导致循环依赖。在涉及模块/提供者类时，应省略桶文件。例如，在导入与桶文件位于同一目录中的文件时，不应使用桶文件，即 `cats/cats.controller` 不应导入 `cats` 来导入 `cats/cats.service` 文件。更多详情请参阅 [this GitHub issue](https://github.com/nestjs/nest/issues/1181#issuecomment-430197191)。

#### 前向引用

**前向引用**允许 Nest 使用 `forwardRef()` 工具函数引用尚未定义的类。例如，如果 `CatsService` 和 `CommonService` 相互依赖，则关系的双方都可以使用 `@Inject()` 和 `forwardRef()` 工具来解决循环依赖。否则，Nest 将无法实例化它们，因为所有必要的元数据都不可用。以下是一个示例：

```typescript title="cats.service.ts"
@Injectable()
export class CatsService {
  constructor(
    @Inject(forwardRef(() => CommonService))
    private commonService: CommonService,
  ) {}
}

```

> info **提示** `forwardRef()` 函数从 `@nestjs/common` 包中导入。

这涵盖了关系的一侧。现在让我们对 `CommonService` 做同样的操作：

```typescript title="common.service.ts"
@Injectable()
export class CommonService {
  constructor(
    @Inject(forwardRef(() => CatsService))
    private catsService: CatsService,
  ) {}
}

```

> warning **警告** 实例化的顺序是不确定的。请确保你的代码不依赖于哪个构造函数先被调用。循环依赖依赖于具有 `Scope.REQUEST` 的提供者可能导致未定义的依赖。更多信息请参阅 [here](https://github.com/nestjs/nest/issues/5778)。

#### ModuleRef 类替代方案

使用 `forwardRef()` 的替代方案是重构代码，使用 `ModuleRef` 类在（原本）循环关系的一侧检索提供者。了解更多关于 `ModuleRef` 工具类的信息 [here](/fundamentals/module-reference)。

#### 模块前向引用

为了解决模块之间的循环依赖，请在模块关联的两侧使用相同的 `forwardRef()` 工具函数。例如：

```typescript title="common.module.ts"
@Module({
  imports: [forwardRef(() => CatsModule)],
})
export class CommonModule {}

```

这涵盖了关系的一侧。现在让我们对 `CatsModule` 做同样的操作：

```typescript title="cats.module.ts"
@Module({
  imports: [forwardRef(() => CommonModule)],
})
export class CatsModule {}

```