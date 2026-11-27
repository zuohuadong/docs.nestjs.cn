<!-- 此文件从 content/fundamentals/module-reference.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:34:11.335Z -->
<!-- 源文件: content/fundamentals/module-reference.md -->
<!-- 源哈希: 2673e438a37292bd22778019866f8065 -->

### 模块引用

Nest 提供 `ModuleRef` 类来导航内部提供者列表，并使用其注入令牌作为查找键获取任何提供者的引用。`ModuleRef` 还允许您动态实例化静态和作用域提供者。像注入任何其他依赖项一样将 `ModuleRef` 注入到类中：

```typescript title="cats.service.ts"
@Injectable()
export class CatsService {
  constructor(private moduleRef: ModuleRef) {}
}

```

> info **提示** `ModuleRef` 类是从 `@nestjs/core` 包导入的。

#### 获取实例

`ModuleRef` 实例（下文称为**模块引用**）有一个 `get()` 方法。默认情况下，此方法使用注入令牌或类名来返回在*当前模块*中注册和实例化的提供者、控制器或可注入项（例如，守卫或拦截器）。如果未找到实例，则会抛出异常。

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

> warning **警告** 您不能使用 `get()` 方法检索作用域提供者（瞬态或请求作用域，包括通过其依赖项隐式成为请求作用域的提供者）。相反，请使用下文 <a href="/fundamentals/module-reference#解析作用域提供者">解析作用域提供者</a> 中描述的技术。在 [injection scopes](/fundamentals/provider-scopes) 章了解如何控制作用域。

要从全局上下文检索提供者（例如，如果提供者是在不同模块中注册的），请将 `{ strict: false }` 选项作为第二个参数传递给 `get()`。

```typescript
this.moduleRef.get(Service, { strict: false });

```

#### 解析作用域提供者

要动态解析作用域提供者（瞬态或请求作用域），请使用 `resolve()` 方法，并将提供者的注入令牌作为参数传递。

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

`resolve()` 方法从其自身的**DI 容器子树**中返回提供者的唯一实例。每个子树都有一个唯一的**上下文标识符**，因此如果您调用此方法多次并比较实例引用，您会发现它们不相等。

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

要跨多次 `resolve()` 调用获取单个实例，并确保它们共享相同的生成的 DI 容器子树，请将上下文标识符传递给 `resolve()` 方法。使用 `ContextIdFactory` 类来生成上下文标识符：其 `create()` 方法返回一个新的唯一标识符。

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

> info **提示** `ContextIdFactory` 类是从 `@nestjs/core` 包导入的。

#### 注册 `REQUEST` 提供者

手动生成的上下文标识符（使用 `ContextIdFactory.create()` 创建）代表 DI 子树，其中 `REQUEST` 提供者是**非实例化**和**非由 Nest 依赖注入系统管理**的，因此它们代表 DI 子树。

要为手动创建的 DI 子树注册自定义 `REQUEST` 对象，请使用 `ModuleRef#registerRequestByContextId()` 方法：

```typescript
const contextId = ContextIdFactory.create();
this.moduleRef.registerRequestByContextId(/* YOUR_REQUEST_OBJECT */, contextId);

```

#### 获取当前子树

偶尔，您可能需要在**请求上下文**中解析请求作用域提供者的实例。假设 `CatsService` 是请求作用域的，而您想解析 `CatsRepository` 实例，它也是一个请求作用域的提供者。为了共享相同的 DI 容器子树，您必须获取当前上下文标识符，而不是生成一个新的（例如，如上所示使用 `ContextIdFactory.create()` 函数）。要获取当前上下文标识符，首先使用 `@Inject()` 装饰器将请求对象注入：

```typescript title="cats.service.ts"
@Injectable()
export class CatsService {
  constructor(
    @Inject(REQUEST) private request: Record<string, unknown>,
  ) {}
}

```

> info **提示** 在注入作用域章节的 [Request provider](/fundamentals/provider-scopes#请求提供者) 部分了解有关请求提供者的更多信息。

现在使用 `ContextIdFactory` 类的 `getByRequest()` 方法获取与请求对象关联的上下文标识符，并将其传递给 `resolve()` 调用：

```typescript
const contextId = ContextIdFactory.getByRequest(this.request);
const catsRepository = await this.moduleRef.resolve(CatsRepository, contextId);

```

#### 动态实例化自定义类

要动态实例化**先前未注册**为**提供者**的类，请使用模块引用的 `create()` 方法：

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

此技术允许您在框架容器外部有条件地实例化不同的类。

<app-banner-observe></app-banner-observe>