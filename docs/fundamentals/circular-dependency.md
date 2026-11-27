<!-- 此文件从 content/fundamentals/circular-dependency.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:34:49.170Z -->
<!-- 源文件: content/fundamentals/circular-dependency.md -->
<!-- 源哈希: 0843af483de0b7b78bbfee1a121b010c -->

### 循环依赖

当两个类相互依赖时，就会发生循环依赖。例如，类 A 需要类 B，而类 B 也需要类 A。在 Nest 中，循环依赖可能发生在模块之间以及提供者之间。

尽可能避免循环依赖，但并非总能做到。在这种情况下，Nest 允许你通过两种方式解决提供者之间的循环依赖：使用**前向引用**，或者使用 **ModuleRef** 类从依赖注入容器中检索提供者实例。本章描述了这两种技术，以及如何解决模块之间的循环依赖。

> warning **警告** 使用“桶文件”（`index.ts` 文件）来分组导入也会导致循环依赖。请避免对模块和提供者类使用桶文件。特别是，不要使用桶文件导入与桶文件在同一目录中的文件，即 `cats/cats.controller` 不应导入 `cats` 以导入 `cats/cats.service` 文件。更多详情请参阅 [this GitHub issue on barrel files and circular dependencies](https://github.com/nestjs/nest/issues/1181#issuecomment-430197191)。

#### 前向引用

使用 `forwardRef()` 实用函数创建的**前向引用**允许 Nest 引用尚未定义的类。例如，如果 `CatsService` 和 `CommonService` 相互依赖，关系的两侧都可以使用 `@Inject()` 和 `forwardRef()` 实用函数来解决循环依赖。否则，Nest 不会实例化它们，因为所有必要的元数据都不可用。这是一个示例：

```typescript title="cats.service.ts"
@Injectable()
export class CatsService {
  constructor(
    @Inject(forwardRef(() => CommonService))
    private commonService: CommonService,
  ) {}
}

```

> info **提示** `forwardRef()` 函数是从 `@nestjs/common` 包导入的。

这涵盖了关系的一侧。现在对 `CommonService` 做同样的操作：

```typescript title="common.service.ts"
@Injectable()
export class CommonService {
  constructor(
    @Inject(forwardRef(() => CatsService))
    private catsService: CatsService,
  ) {}
}

```

> warning **警告** 实例化顺序是不确定的。请确保你的代码不依赖于哪个构造函数先被调用。依赖于具有 `Scope.REQUEST` 的提供者的循环依赖可能导致未定义的依赖。有关更多信息，请参阅 [this GitHub issue on request-scoped circular dependencies](https://github.com/nestjs/nest/issues/5778)。

#### ModuleRef 类替代方案

替代 `forwardRef()` 的方法是重构代码，并使用 `ModuleRef` 类在（否则）循环关系的一侧检索提供者。在 [module reference](/fundamentals/module-reference) 章了解有关 `ModuleRef` 实用类的更多信息。

#### 模块前向引用

要解决模块之间的循环依赖，请在模块关联的两侧都使用相同的 `forwardRef()` 实用函数。例如：

```typescript title="common.module.ts"
@Module({
  imports: [forwardRef(() => CatsModule)],
})
export class CommonModule {}

```

这涵盖了关系的一侧。现在对 `CatsModule` 做同样的操作：

```typescript title="cats.module.ts"
@Module({
  imports: [forwardRef(() => CommonModule)],
})
export class CatsModule {}

```