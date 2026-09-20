<!-- 此文件从 content/fundamentals/module-reference.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:14:11.483Z -->
<!-- 源文件: content/fundamentals/module-reference.md -->
<!-- 源哈希: 3c516e41377a81cf90e2b23704a3fddc -->

### 模块引用

Nest 提供了 `ModuleRef` 类来导航内部提供者列表，并使用其注入令牌作为查找键来获取任何提供者的引用。`ModuleRef` 类还提供了一种动态实例化静态和作用于提供者的方法。`ModuleRef` 可以以常规方式注入到类中：

```typescript title="cats.service.ts"
@Injectable()
export class CatsService {
  constructor(private moduleRef: ModuleRef) {}
}

```

> info **提示** `ModuleRef` 类从 `@nestjs/core` 包中导入。

#### 检索实例

`ModuleRef` 实例（以下简称**模块引用**）具有一个 `get()` 方法。默认情况下，此方法返回已在*当前模块*中注册并实例化的提供者、控制器或可注入对象（例如守卫、拦截器等），使用其注入令牌/类名进行查找。如果未找到实例，将抛出异常。

```typescript title="cats.service.ts"
@Injectable()
export class CatsService implements OnModuleInit {
  private service: Service;
  constructor(private moduleRef: ModuleRef) {}

  onModuleInit() {
    this.service = this.moduleRef.get(Service);
  }
}

```

> warning **警告** 你不能使用 `get()` 方法检索作用域提供者（瞬态或请求作用域）。相反，请使用 <a href="/fundamentals/module-ref#解析作用域提供者">下方</a>描述的技术。了解如何控制作用域 [here](/fundamentals/provider-scopes)。

要从全局上下文中检索提供者（例如，如果提供者已在不同的模块中被注入），请将 `{ strict: false }` 选项作为第二个参数传递给 `get()`。

```typescript
this.moduleRef.get(Service, { strict: false });

```

#### 解析作用域提供者

要动态解析作用域提供者（瞬态或请求作用域），请使用 `resolve()` 方法，将提供者的注入令牌作为参数传递。

```typescript title="cats.service.ts"
@Injectable()
export class CatsService implements OnModuleInit {
  private transientService: TransientService;
  constructor(private moduleRef: ModuleRef) {}

  async onModuleInit() {
    this.transientService = await this.moduleRef.resolve(TransientService);
  }
}

```

`resolve()` 方法从提供者自身的 **DI 容器子树** 返回一个唯一的实例。每个子树都有一个唯一的**上下文标识符**。因此，如果你多次调用此方法并比较实例引用，你会发现它们不相等。

```typescript title="cats.service.ts"
@Injectable()
export class CatsService implements OnModuleInit {
  constructor(private moduleRef: ModuleRef) {}

  async onModuleInit() {
    const transientServices = await Promise.all([
      this.moduleRef.resolve(TransientService),
      this.moduleRef.resolve(TransientService),
    ]);
    console.log(transientServices[0] === transientServices[1]); // false
  }
}

```

要在多次 `resolve()` 调用中生成单个实例，并确保它们共享相同的生成的 DI 容器子树，你可以将上下文标识符传递给 `resolve()` 方法。使用 `ContextIdFactory` 类生成上下文标识符。此类提供了一个 `create()` 方法，返回适当的唯一标识符。

```typescript title="cats.service.ts"
@Injectable()
export class CatsService implements OnModuleInit {
  constructor(private moduleRef: ModuleRef) {}

  async onModuleInit() {
    const contextId = ContextIdFactory.create();
    const transientServices = await Promise.all([
      this.moduleRef.resolve(TransientService, contextId),
      this.moduleRef.resolve(TransientService, contextId),
    ]);
    console.log(transientServices[0] === transientServices[1]); // true
  }
}

```

> info **提示** `ContextIdFactory` 类从 `@nestjs/core` 包中导入。

#### 注册 `REQUEST` 提供者

手动生成的上下文标识符（使用 `ContextIdFactory.create()`）表示 DI 子树，其中 `REQUEST` 提供者是 `undefined`，因为它们不是由 Nest 依赖注入系统实例化和管理的。

要为手动创建的 DI 子树注册自定义的 `REQUEST` 对象，请使用 `ModuleRef#registerRequestByContextId()` 方法，如下所示：

```typescript
const contextId = ContextIdFactory.create();
this.moduleRef.registerRequestByContextId(/* YOUR_REQUEST_OBJECT */, contextId);

```

#### 获取当前子树

有时，你可能希望在**请求上下文**中解析请求作用域提供者的实例。假设 `CatsService` 是请求作用域的，并且你想解析同样标记为请求作用域提供者的 `CatsRepository` 实例。为了共享相同的 DI 容器子树，你必须获取当前的上下文标识符，而不是生成新的标识符（例如，使用上述的 `ContextIdFactory.create()` 函数）。要获取当前的上下文标识符，首先使用 `@Inject()` 装饰器注入请求对象。

```typescript title="cats.service.ts"
@Injectable()
export class CatsService {
  constructor(
    @Inject(REQUEST) private request: Record<string, unknown>,
  ) {}
}

```

> info **提示** 了解更多关于请求提供者 [here](/fundamentals/provider-scopes#请求提供者) 的信息。

现在，使用 `ContextIdFactory` 类的 `getByRequest()` 方法基于请求对象创建上下文 ID，并将其传递给 `resolve()` 调用：

```typescript
const contextId = ContextIdFactory.getByRequest(this.request);
const catsRepository = await this.moduleRef.resolve(CatsRepository, contextId);

```

#### 动态实例化自定义类

要动态实例化一个**之前未注册**为**提供者**的类，请使用模块引用的 `create()` 方法。

```typescript title="cats.service.ts"
@Injectable()
export class CatsService implements OnModuleInit {
  private catsFactory: CatsFactory;
  constructor(private moduleRef: ModuleRef) {}

  async onModuleInit() {
    this.catsFactory = await this.moduleRef.create(CatsFactory);
  }
}

```

此技术使您能够在框架容器之外有条件地实例化不同的类。

<app-banner-devtools></app-banner-devtools>