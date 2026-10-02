<!-- 此文件从 content/recipes/cqrs.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-03-12T13:42:20.321Z -->
<!-- 源文件: content/recipes/cqrs.md -->

### CQRS

简单 [CRUD](https://en.wikipedia.org/wiki/Create,_read,_update_and_delete)（创建、读取、更新和删除）应用程序的流程可以描述如下：

1. 控制器层处理 HTTP 请求并将任务委托给服务层。
2. 服务层是大部分业务逻辑所在的地方。
3. 服务使用存储库/DAO 来更改/持久化实体。
4. 实体充当值的容器，具有 setter 和 getter。

虽然这种模式通常对于中小型应用程序来说已经足够，但对于更大、更复杂的应用程序来说可能不是最佳选择。在这种情况下，**CQRS**（命令查询职责分离）模型可能更合适且更具可扩展性（取决于应用程序的需求）。此模型的好处包括：

- **关注点分离**。该模型将读取和写入操作分离到不同的模型中。
- **可扩展性**。读取和写入操作可以独立扩展。
- **灵活性**。该模型允许为读取和写入操作使用不同的数据存储。
- **性能**。该模型允许为读取和写入操作使用优化的不同数据存储。

为了促进该模型，Nest 提供了一个轻量级的 [CQRS 模块](https://github.com/nestjs/cqrs)。本章介绍如何使用它。

#### 安装

首先安装所需的包：

```bash
$ npm install --save @nestjs/cqrs

```

安装完成后，导航到应用程序的根模块（通常是 `AppModule`），并导入 `CqrsModule.forRoot()`：

```typescript
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

@Module({
  imports: [CqrsModule.forRoot()],
})
export class AppModule {}

```

此模块接受一个可选的配置对象。以下选项可用：

| 属性                           | 描述                                                                                         | 默认值                            |
| ----------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------- |
| `commandPublisher`            | 负责将命令分派到系统的发布者。                                                                 | `DefaultCommandPubSub`            |
| `eventPublisher`              | 用于发布事件的发布者，允许它们被广播或处理。                                                   | `DefaultPubSub`                   |
| `queryPublisher`              | 用于发布查询的发布者，可以触发数据检索操作。                                                   | `DefaultQueryPubSub`              |
| `unhandledExceptionPublisher` | 负责处理未处理异常的发布者，确保它们被跟踪和报告。                                              | `DefaultUnhandledExceptionPubSub` |
| `eventIdProvider`             | 通过生成或从事件实例检索来提供唯一事件 ID 的服务。                                              | `DefaultEventIdProvider`          |
| `rethrowUnhandled`            | 确定未处理的异常是否应在处理后重新抛出，对调试和错误管理很有用。                                 | `false`                           |

#### 命令

命令用于更改应用程序状态。它们应该是基于任务的，而不是以数据为中心的。当分派命令时，它由相应的**命令处理程序**处理。处理程序负责更新应用程序状态。

```typescript
@Injectable()
export class HeroesGameService {
  constructor(private commandBus: CommandBus) {}

  async killDragon(heroId: string, killDragonDto: KillDragonDto) {
    return this.commandBus.execute(
      new KillDragonCommand(heroId, killDragonDto.dragonId)
    );
  }
}

  async killDragon(heroId, killDragonDto) {
    return this.commandBus.execute(
      new KillDragonCommand(heroId, killDragonDto.dragonId)
    );
  }
}

```

在上面的代码片段中，我们实例化 `KillDragonCommand` 类并将其传递给 `CommandBus` 的 `execute()` 方法。这是演示的命令类：

```typescript
export class KillDragonCommand extends Command<{
  actionId: string // 此类型表示命令执行结果
}> {
  constructor(
    public readonly heroId: string,
    public readonly dragonId: string,
  ) {
    super();
  }
}

```

如你所见，`KillDragonCommand` 类扩展了 `Command` 类。`Command` 类是从 `@nestjs/cqrs` 包导出的简单实用类，允许你定义命令的返回类型。在这种情况下，返回类型是具有 `actionId` 属性的对象。现在，每当分派 `KillDragonCommand` 命令时，`CommandBus#execute()` 方法的返回类型将被推断为 `Promise<{ actionId: string }>`。当你想从命令处理程序返回一些数据时，这很有用。

:::info 提示
从 `Command` 类继承是可选的。只有在你想要定义命令的返回类型时才需要。
:::

`CommandBus` 表示命令的**流**。它负责将命令分派到适当的处理程序。`execute()` 方法返回一个 promise，该 promise 解析为处理程序返回的值。

让我们为 `KillDragonCommand` 命令创建一个处理程序。

```typescript
@CommandHandler(KillDragonCommand)
export class KillDragonHandler implements ICommandHandler<KillDragonCommand> {
  constructor(private repository: HeroesRepository) {}

  async execute(command: KillDragonCommand) {
    const { heroId, dragonId } = command;
    const hero = this.repository.findOneById(+heroId);

    hero.killEnemy(dragonId);
    await this.repository.persist(hero);

    // "ICommandHandler<KillDragonCommand>" 强制你返回与命令返回类型匹配的值
    return {
      actionId: crypto.randomUUID(), // 此值将返回给调用者
    }
  }
}

  async execute(command) {
    const { heroId, dragonId } = command;
    const hero = this.repository.findOneById(+heroId);

    hero.killEnemy(dragonId);
    await this.repository.persist(hero);

    // "ICommandHandler<KillDragonCommand>" 强制你返回与命令返回类型匹配的值
    return {
      actionId: crypto.randomUUID(), // 此值将返回给调用者
    }
  }
}

```

此处理程序从存储库检索 `Hero` 实体，调用 `killEnemy()` 方法，然后持久化更改。`KillDragonHandler` 类实现 `ICommandHandler` 接口，该接口需要实现 `execute()` 方法。`execute()` 方法接收命令对象作为参数。

请注意，`ICommandHandler<KillDragonCommand>` 强制你返回与命令返回类型匹配的值。在这种情况下，返回类型是具有 `actionId` 属性的对象。这仅适用于从 `Command` 类继承的命令。否则，你可以返回任何你想要的内容。

最后，确保在模块中将 `KillDragonHandler` 注册为提供者：

```typescript
providers: [KillDragonHandler];

```

#### 查询

查询用于从应用程序状态检索数据。它们应该是以数据为中心的，而不是基于任务的。当分派查询时，它由相应的**查询处理程序**处理。处理程序负责检索数据。

`QueryBus` 遵循与 `CommandBus` 相同的模式。查询处理程序应该实现 `IQueryHandler` 接口并使用 `@QueryHandler()` 装饰器进行注释。请参阅以下示例：

```typescript
export class GetHeroQuery extends Query<Hero> {
  constructor(public readonly heroId: string) {}
}

```

与 `Command` 类类似，`Query` 类是从 `@nestjs/cqrs` 包导出的简单实用类，允许你定义查询的返回类型。在这种情况下，返回类型是 `Hero` 对象。现在，每当分派 `GetHeroQuery` 查询时，`QueryBus#execute()` 方法的返回类型将被推断为 `Promise<Hero>`。

要检索英雄，我们需要创建一个查询处理程序：

```typescript
@QueryHandler(GetHeroQuery)
export class GetHeroHandler implements IQueryHandler<GetHeroQuery> {
  constructor(private repository: HeroesRepository) {}

  async execute(query: GetHeroQuery) {
    return this.repository.findOneById(query.heroId);
  }
}

  async execute(query) {
    return this.repository.findOneById(query.hero);
  }
}

```

`GetHeroHandler` 类实现 `IQueryHandler` 接口，该接口需要实现 `execute()` 方法。`execute()` 方法接收查询对象作为参数，并且必须返回与查询返回类型匹配的数据（在这种情况下是 `Hero` 对象）。

最后，确保在模块中将 `GetHeroHandler` 注册为提供者：

```typescript
providers: [GetHeroHandler];

```

现在，要分派查询，请使用 `QueryBus`：

```typescript
const hero = await this.queryBus.execute(new GetHeroQuery(heroId)); // "hero" 将自动推断为 "Hero" 类型

```

#### 事件

事件用于通知应用程序的其他部分关于应用程序状态的更改。它们由**模型**分派或直接使用 `EventBus` 分派。当分派事件时，它由相应的**事件处理程序**处理。处理程序可以例如更新读取模型。

出于演示目的，让我们创建一个事件类：

```typescript
export class HeroKilledDragonEvent {
  constructor(
    public readonly heroId: string,
    public readonly dragonId: string,
  ) {}
}

```

虽然可以使用 `EventBus.publish()` 方法直接分派事件，但我们也可以从模型中分派它们。让我们更新 `Hero` 模型，以便在调用 `killEnemy()` 方法时分派 `HeroKilledDragonEvent` 事件。

```typescript
export class Hero extends AggregateRoot {
  constructor(private id: string) {
    super();
  }

  killEnemy(enemyId: string) {
    // 业务逻辑
    this.apply(new HeroKilledDragonEvent(this.id, enemyId));
  }
}

  killEnemy(enemyId) {
    // 业务逻辑
    this.apply(new HeroKilledDragonEvent(this.id, enemyId));
  }
}

```

`apply()` 方法用于分派事件。它接受一个事件对象作为参数。但是，由于我们的模型不知道 `EventBus`，我们需要将其与模型关联。我们可以使用 `EventPublisher` 类来实现这一点。

```typescript
@CommandHandler(KillDragonCommand)
export class KillDragonHandler implements ICommandHandler<KillDragonCommand> {
  constructor(
    private repository: HeroesRepository,
    private publisher: EventPublisher,
  ) {}

  async execute(command: KillDragonCommand) {
    const { heroId, dragonId } = command;
    const hero = this.publisher.mergeObjectContext(
      await this.repository.findOneById(+heroId),
    );
    hero.killEnemy(dragonId);
    hero.commit();
  }
}

  async execute(command) {
    const { heroId, dragonId } = command;
    const hero = this.publisher.mergeObjectContext(
      await this.repository.findOneById(+heroId),
    );
    hero.killEnemy(dragonId);
    hero.commit();
  }
}

```

`EventPublisher#mergeObjectContext` 方法将事件发布者合并到提供的对象中，这意味着该对象现在将能够向事件流发布事件。

请注意，在这个例子中，我们还调用了模型上的 `commit()` 方法。此方法用于分派任何未完成的事件。要自动分派事件，我们可以将 `autoCommit` 属性设置为 `true`：

```typescript
export class Hero extends AggregateRoot {
  constructor(private id: string) {
    super();
    this.autoCommit = true;
  }
}

```

如果我们想将事件发布者合并到非现有对象中，而是合并到类中，我们可以使用 `EventPublisher#mergeClassContext` 方法：

```typescript
const HeroModel = this.publisher.mergeClassContext(Hero);
const hero = new HeroModel('id'); // <-- HeroModel 是一个类

```

现在，`HeroModel` 类的每个实例都将能够发布事件，而无需使用 `mergeObjectContext()` 方法。

#### 灵活的聚合根

`AggregateRoot` 类是一个具体实现，您可以扩展它来为您的领域模型添加事件驱动能力。然而，这种方式要求领域实体直接继承 `AggregateRoot`，如果您的应用程序已经有既定的实体继承层次（例如基础的 `Entity` 类，或者诸如 `Monster`、`Vehicle` 等领域特定的基类），这可能会成为一种限制。

为了提供更大的灵活性，`@nestjs/cqrs` 包提供了三种不同的聚合根实现方式：

**方式 1：传统方式（类继承）**

这是前面示例中展示的标准方式。它非常适合简单场景或全新项目。

```typescript
export class Hero extends AggregateRoot {
  constructor(private id: string) {
    super();
  }

  killEnemy(enemyId: string) {
    this.apply(new HeroKilledDragonEvent(this.id, enemyId));
  }
}
```

**方式 2：Mixin（适用于已有继承层次）**

如果您已经有一个基类，无法直接继承 `AggregateRoot`，可以使用 `WithAggregateRoot<EventBase, TBase>()` mixin 函数。它允许您将聚合根行为应用到任何现有的基类上。

```typescript title="dragon.model.ts"
abstract class Monster {
  constructor(protected readonly id: string) {}
  abstract roar(): void;
}

export class Dragon extends WithAggregateRoot(Monster) {
  roar(): void {
    console.log('Roarrrr!');
  }

  die(): void {
    this.roar();
    this.apply(new DragonDiedEvent(this.id)); // 通过 mixin 即可使用！
  }
}
```

**方式 3：自定义实现**

如果需要最大程度的控制，或者您希望领域层完全与框架解耦，可以直接实现 `IAggregateRoot` 接口。`EventPublisher` 接受任何实现了该接口的对象。

```typescript
export class CustomEntity implements IAggregateRoot {
  private events: IEvent[] = [];

  getUncommittedEvents() {
    return this.events;
  }

  publish(event: IEvent) {
    // 自定义逻辑
  }

  commit() {
    // 自定义逻辑
  }

  uncommit() {
    // 自定义逻辑
  }

  apply(event: IEvent) {
    this.events.push(event);
  }

  loadFromHistory(history: IEvent[]) {
    // 自定义逻辑
  }
}
```

这三种方式都能与 `EventPublisher` 无缝协作，它接受任何实现了 `IAggregateRoot` 接口的对象。

#### 手动发布事件

此外，我们可以使用 `EventBus` 手动发出事件：

```typescript
this.eventBus.publish(new HeroKilledDragonEvent());

```

:::info 提示
`EventBus` 是一个可注入的类。
:::

每个事件可以有多个**事件处理程序**。

```typescript
@EventsHandler(HeroKilledDragonEvent)
export class HeroKilledDragonHandler implements IEventHandler<HeroKilledDragonEvent> {
  constructor(private repository: HeroesRepository) {}

  handle(event: HeroKilledDragonEvent) {
    // 业务逻辑
  }
}

```

:::info 提示
请注意，当你开始使用事件处理程序时，你将脱离传统的 HTTP Web 上下文。
:::
>
> - `CommandHandlers` 中的错误仍然可以被内置的[异常过滤器](/overview/exception-filters)捕获。
> - `EventHandlers` 中的错误无法被异常过滤器捕获：你必须手动处理它们。可以通过简单的 `try/catch`，使用 [Sagas](/recipes/cqrs#sagas) 触发补偿事件，或你选择的任何其他解决方案。
> - `CommandHandlers` 中的 HTTP 响应仍然可以发送回客户端。
> - `EventHandlers` 中的 HTTP 响应无法发送。如果你想向客户端发送信息，可以使用 [WebSocket](/websockets/gateways)、[SSE](/techniques/server-sent-events) 或你选择的任何其他解决方案。

与命令和查询一样，确保在模块中将 `HeroKilledDragonHandler` 注册为提供者：

```typescript
providers: [HeroKilledDragonHandler];

```

#### Sagas

Saga 是一个长期运行的过程，它监听事件并可能触发新命令。它通常用于管理应用程序中的复杂工作流。例如，当用户注册时，saga 可能会监听 `UserRegisteredEvent` 并向用户发送欢迎电子邮件。

Sagas 是一个非常强大的功能。单个 saga 可以监听 1..* 个事件。使用 [RxJS](https://github.com/ReactiveX/rxjs) 库，我们可以过滤、映射、分叉和合并事件流以创建复杂的工作流。每个 saga 返回一个 Observable，它产生一个命令实例。然后，该命令由 `CommandBus` **异步**分派。

让我们创建一个 saga，它监听 `HeroKilledDragonEvent` 并分派 `DropAncientItemCommand` 命令。

```typescript
@Injectable()
export class HeroesGameSagas {
  @Saga()
  dragonKilled = (events$: Observable<any>): Observable<ICommand> => {
    return events$.pipe(
      ofType(HeroKilledDragonEvent),
      map((event) => new DropAncientItemCommand(event.heroId, fakeItemID)),
    );
  }
}

```

:::info 提示
`ofType` 操作符和 `@Saga()` 装饰器从 `@nestjs/cqrs` 包导出。
:::

`@Saga()` 装饰器将方法标记为 saga。`events$` 参数是所有事件的 Observable 流。`ofType` 操作符按指定的事件类型过滤流。`map` 操作符将事件映射到新的命令实例。

在这个例子中，我们将 `HeroKilledDragonEvent` 映射到 `DropAncientItemCommand` 命令。然后，`DropAncientItemCommand` 命令由 `CommandBus` 自动分派。

与查询、命令和事件处理程序一样，确保在模块中将 `HeroesGameSagas` 注册为提供者：

```typescript
providers: [HeroesGameSagas];

```

#### 未处理的异常

事件处理程序异步执行，因此它们必须始终正确处理异常，以防止应用程序进入不一致状态。如果未处理异常，`EventBus` 将创建一个 `UnhandledExceptionInfo` 对象并将其推送到 `UnhandledExceptionBus` 流。此流是一个 `Observable`，可用于处理未处理的异常。

```typescript
private destroy$ = new Subject<void>();

constructor(private unhandledExceptionsBus: UnhandledExceptionBus) {
  this.unhandledExceptionsBus
    .pipe(takeUntil(this.destroy$))
    .subscribe((exceptionInfo) => {
      // 在这里处理异常
      // 例如，将其发送到外部服务、终止进程或发布新事件
    });
}

onModuleDestroy() {
  this.destroy$.next();
  this.destroy$.complete();
}

```

要过滤掉异常，我们可以使用 `ofType` 操作符，如下所示：

```typescript
this.unhandledExceptionsBus
  .pipe(
    takeUntil(this.destroy$),
    UnhandledExceptionBus.ofType(TransactionNotAllowedException),
  )
  .subscribe((exceptionInfo) => {
    // 在这里处理异常
  });

```

其中 `TransactionNotAllowedException` 是我们要过滤掉的异常。

`UnhandledExceptionInfo` 对象包含以下属性：

```typescript
export interface UnhandledExceptionInfo<
  Cause = IEvent | ICommand,
  Exception = any,
> {
  /**
   * 抛出的异常。
   */
  exception: Exception;
  /**
   * 异常的原因（事件或命令引用）。
   */
  cause: Cause;
}

```

#### 订阅所有事件

`CommandBus`、`QueryBus` 和 `EventBus` 都是 **Observables**。这意味着我们可以订阅整个流，例如，处理所有事件。例如，我们可以将所有事件记录到控制台，或将它们保存到事件存储。

```typescript
private destroy$ = new Subject<void>();

constructor(private eventBus: EventBus) {
  this.eventBus
    .pipe(takeUntil(this.destroy$))
    .subscribe((event) => {
      // 将事件保存到数据库
    });
}

onModuleDestroy() {
  this.destroy$.next();
  this.destroy$.complete();
}

```

#### 请求作用域

对于来自不同编程语言背景的人来说，可能会惊讶地发现，在 Nest 中，大多数东西都在传入请求之间共享。这包括到数据库的连接池、具有全局状态的单例服务等。请记住，Node.js 不遵循请求/响应多线程无状态模型，其中每个请求由单独的线程处理。因此，使用单例实例对我们的应用程序来说是**安全**的。

但是，在某些边缘情况下，可能需要基于请求的处理程序生命周期。这可能包括 GraphQL 应用程序中的每请求缓存、请求跟踪或多租户等场景。你可以在[这里](/fundamentals/provider-scopes)了解更多关于如何控制作用域的信息。

将请求作用域的提供者与 CQRS 一起使用可能很复杂，因为 `CommandBus`、`QueryBus` 和 `EventBus` 都是单例。幸运的是，`@nestjs/cqrs` 包通过为每个处理的命令、查询或事件自动创建请求作用域处理程序的新实例来简化这一点。

要使处理程序成为请求作用域，你可以：

1. 依赖请求作用域的提供者。
2. 使用 `@CommandHandler`、`@QueryHandler` 或 `@EventsHandler` 装饰器显式将其作用域设置为 `REQUEST`，如下所示：

```typescript
@CommandHandler(KillDragonCommand, {
  scope: Scope.REQUEST,
})
export class KillDragonHandler {
  // 实现在这里
}

```

要将请求负载注入任何请求作用域的提供者，请使用 `@Inject(REQUEST)` 装饰器。但是，CQRS 中请求负载的性质取决于上下文——它可能是 HTTP 请求、计划作业或任何其他触发命令的操作。

负载必须是扩展 `AsyncContext`（由 `@nestjs/cqrs` 提供）的类的实例，它充当请求上下文并保存在整个请求生命周期中可访问的数据。

```typescript
import { AsyncContext } from '@nestjs/cqrs';

export class MyRequest extends AsyncContext {
  constructor(public readonly user: User) {
    super();
  }
}

```

执行命令时，将自定义请求上下文作为第二个参数传递给 `CommandBus#execute` 方法：

```typescript
const myRequest = new MyRequest(user);
await this.commandBus.execute(
  new KillDragonCommand(heroId, killDragonDto.dragonId),
  myRequest,
);

```

这使得 `MyRequest` 实例作为 `REQUEST` 提供者可用于相应的处理程序：

```typescript
@CommandHandler(KillDragonCommand, {
  scope: Scope.REQUEST,
})
export class KillDragonHandler {
  constructor(
    @Inject(REQUEST) private request: MyRequest, // 注入请求上下文
  ) {}

  // 处理程序实现在这里
}

```

你可以对查询遵循相同的方法：

```typescript
const myRequest = new MyRequest(user);
const hero = await this.queryBus.execute(new GetHeroQuery(heroId), myRequest);

```

在查询处理程序中：

```typescript
@QueryHandler(GetHeroQuery, {
  scope: Scope.REQUEST,
})
export class GetHeroHandler {
  constructor(
    @Inject(REQUEST) private request: MyRequest, // 注入请求上下文
  ) {}

  // 处理程序实现在这里
}

```

对于事件，虽然你可以将请求提供者传递给 `EventBus#publish`但这不太常见。相反，使用 `EventPublisher` 将请求提供者合并到模型中：

```typescript
const hero = this.publisher.mergeObjectContext(
  await this.repository.findOneById(+heroId),
  this.request, // 在这里注入请求上下文
);

```

订阅这些事件的请求作用域事件处理程序将能够访问请求提供者。

Sagas 始终是单例实例，因为它们管理长期运行的过程。但是，你可以从事件对象中检索请求提供者：

```typescript
@Saga()
dragonKilled = (events$: Observable<any>): Observable<ICommand> => {
  return events$.pipe(
    ofType(HeroKilledDragonEvent),
    map((event) => {
      const request = AsyncContext.of(event); // 检索请求上下文
      const command = new DropAncientItemCommand(event.heroId, fakeItemID);

      AsyncContext.merge(request, command); // 将请求上下文合并到命令中
      return command;
    }),
  );
}

```

或者，使用 `request.attachTo(command)` 方法将请求上下文绑定到命令。

#### 示例

一个可用的示例可在[这里](https://github.com/kamilmysliwiec/nest-cqrs-example)找到。
