<!-- 此文件从 content/recipes/cqrs.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:36:44.583Z -->
<!-- 源文件: content/recipes/cqrs.md -->
<!-- 源哈希: 3af8222d261bcdfbb006185a4bd0222d -->

### CQRS

简单 [CRUD](https://en.wikipedia.org/wiki/Create,_read,_update_and_delete) (创建、读取、更新和删除) 应用程序的流程描述如下：

1. 控制器层处理 HTTP ⟦请求⟧，并将任务委托给服务层。
2. 服务层是大部分业务逻辑所在的地方。
3. 服务使用 仓储 或 DAO 来变更和持久化 实体。
4. 实体充当值的容器，具有设置器和获取器。

虽然此模式通常足以满足小型和中型应用程序的需求，但对于更大、更复杂的应用程序来说，它可能不是最佳选择。在这种情况下，根据应用程序的要求，**CQRS** (命令和查询职责分离) 模型可能更合适且更具可扩展性。该模型的优势包括：

- **关注点分离**。读操作和写操作由独立的模型处理。
- **可扩展性**。读操作和写操作可以独立扩展。
- **灵活性**。读和写可以使用不同的数据存储。
- **性能**。每个数据存储都可以针对其工作负载（读或写）进行优化。

为了支持此模型，Nest 提供了一个轻量级的 [CQRS module](https://github.com/nestjs/cqrs)。本章描述了如何使用它。

#### 安装

首先，安装所需的包：

```bash
$ npm install --save @nestjs/cqrs

```

安装完成后，打开应用程序的根 模块（通常是 `AppModule`）并导入 `CqrsModule.forRoot()`：

```typescript
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

@Module({
  imports: [CqrsModule.forRoot()],
})
export class AppModule {}

```

`forRoot()` 接受一个可选的配置对象。要异步提供选项（例如，来自配置服务），请使用 `CqrsModule.forRootAsync()` 代替。可用的选项如下：

| 属性 | 描述 | 默认值 |
| :--- | :--- | :--- |
| `commandPublisher` | 负责将命令分派到系统的发布者。 | `DefaultCommandPubSub` |
| `eventPublisher` | 用于发布事件的发布者，允许事件被广播或处理。 | `DefaultPubSub` |
| `queryPublisher` | 用于发布查询的发布者，可以触发数据检索操作。 | `DefaultQueryPubSub` |
| `unhandledExceptionPublisher` | 用于将未处理的 ⟦异常⟧ 发布到 `UnhandledExceptionBus` 的发布者。 | `DefaultUnhandledExceptionPubSub` |
| `eventIdProvider` | 从事件实例中检索唯一事件 ID 的服务。 | `DefaultEventIdProvider` |
| `rethrowUnhandled` | 事件处理器和 saga 抛出的 ⟦异常⟧ 是重新抛出还是发布到 `UnhandledExceptionBus`。 | `false` |
| `sagaErrorStrategy` | saga 在其流抛出时执行的操作：`'complete'` 停止它，`'resubscribe'` 再次订阅它。 | `'complete'` |

#### 命令

命令会改变应用程序状态。它们应该是基于任务的，而不是基于数据的。当分派一个命令时，它由相应的 **命令处理器** 处理，该处理器负责更新应用程序状态。

```typescript title="heroes-game.service.ts"
@Injectable()
export class HeroesGameService {
  constructor(private commandBus: CommandBus) {}

  async killDragon(heroId: string, killDragonDto: KillDragonDto) {
    return this.commandBus.execute(
      new KillDragonCommand(heroId, killDragonDto.dragonId)
    );
  }
}

```

上面的代码实例化了 `KillDragonCommand` 类，并将其传递给 `CommandBus` 的 `execute()` 方法。这是命令类：

```typescript title="kill-dragon.command.ts"
export class KillDragonCommand extends Command<{
  actionId: string // This type represents the command execution result
}> {
  constructor(
    public readonly heroId: string,
    public readonly dragonId: string,
  ) {
    super();
  }
}

```

`KillDragonCommand` 类继承自 `Command` 类，该工具类从 `@nestjs/cqrs` 包导出，允许您定义命令的返回类型。在这种情况下，返回类型是一个具有 `actionId` 属性的对象。每当 `KillDragonCommand` 命令被分派时，`CommandBus#execute()` 方法的返回类型都被推断为 `Promise<{ actionId: string }>`。当命令处理器向调用者返回数据时，这非常有用。

> info **提示** 继承 `Command` 类是可选的。您只需要它来定义命令的返回类型。

`CommandBus` 代表命令的**流**。它将命令分派到适当的处理器。`execute()` 方法返回一个 ⟦Promise⟧，该 ⟦Promise⟧ 解析为处理器返回的值。

让我们为 `KillDragonCommand` 命令创建一个处理器。

```typescript title="kill-dragon.handler.ts"
@CommandHandler(KillDragonCommand)
export class KillDragonHandler implements ICommandHandler<KillDragonCommand> {
  constructor(private repository: HeroesRepository) {}

  async execute(command: KillDragonCommand) {
    const { heroId, dragonId } = command;
    const hero = this.repository.findOneById(+heroId);

    hero.killEnemy(dragonId);
    await this.repository.persist(hero);

    // "ICommandHandler<KillDragonCommand>" forces you to return a value that matches the command's return type
    return {
      actionId: crypto.randomUUID(), // This value will be returned to the caller
    }
  }
}

```

此处理器从 仓储 中检索 `Hero` 实体，调用其 `killEnemy()` 方法，然后持久化更改。`KillDragonHandler` 类实现了 `ICommandHandler` 接口，该接口要求一个 `execute()` 方法。`execute()` 方法接收命令对象作为参数。

`ICommandHandler<KillDragonCommand>` 要求 `execute()` 返回一个与命令返回类型匹配的值（此处是一个具有 `actionId` 属性的对象）。这仅适用于继承自 `Command` 类的命令。对于其他命令，返回类型没有约束。

最后，将 `KillDragonHandler` 注册为模块中的一个提供者：

```typescript
providers: [KillDragonHandler];

```

#### 查询

查询从应用程序状态检索数据。它们应该以数据为中心，而不是以任务为中心。当分派一个查询时，它由相应的**查询处理器**处理，该处理器负责检索数据。

`QueryBus` 遵循与 `CommandBus` 相同的模式。查询处理器实现 `IQueryHandler` 接口，并使用 `@QueryHandler()` 装饰器进行注解。从查询类开始：

```typescript
export class GetHeroQuery extends Query<Hero> {
  constructor(public readonly heroId: string) {
    super();
  }
}

```

与 `Command` 类一样，`Query` 类是从 `@nestjs/cqrs` 包导出的工具类，允许您定义查询的返回类型。在这种情况下，返回类型是一个 `Hero` 对象。每当分派 `GetHeroQuery` 查询时，`QueryBus#execute()` 方法的返回类型被推断为 `Promise<Hero>`。

要检索英雄，创建一个查询处理器：

```typescript title="get-hero.handler.ts"
@QueryHandler(GetHeroQuery)
export class GetHeroHandler implements IQueryHandler<GetHeroQuery> {
  constructor(private repository: HeroesRepository) {}

  async execute(query: GetHeroQuery) {
    return this.repository.findOneById(query.heroId);
  }
}

```

`GetHeroHandler` 类实现了 `IQueryHandler` 接口，该接口要求一个 `execute()` 方法。`execute()` 方法接收查询对象作为参数，并且必须返回与查询返回类型匹配的数据（在这种情况下，一个 `Hero` 对象）。

最后，将 `GetHeroHandler` 注册为模块中的一个提供者：

```typescript
providers: [GetHeroHandler];

```

要分派查询，请使用 `QueryBus`：

```typescript
const hero = await this.queryBus.execute(new GetHeroQuery(heroId)); // "hero" will be auto-inferred as "Hero" type

```

#### 事件

事件通知应用程序的其他部分关于应用程序状态的更改。它们由**模型**分派或直接通过 `EventBus` 分派。当事件被分派时，它由相应的**事件处理器**处理，例如更新读取模型。

为了演示目的，我们创建一个事件类：

```typescript title="hero-killed-dragon.event.ts"
export class HeroKilledDragonEvent {
  constructor(
    public readonly heroId: string,
    public readonly dragonId: string,
  ) {}
}

```

虽然您可以使用 `EventBus.publish()` 方法直接分派事件，但也可以从模型中分派它们。让我们更新 `Hero` 模型，以便在调用 `killEnemy()` 方法时分派 `HeroKilledDragonEvent` 事件。

```typescript title="hero.model.ts"
export class Hero extends AggregateRoot {
  constructor(private id: string) {
    super();
  }

  killEnemy(enemyId: string) {
    // Business logic
    this.apply(new HeroKilledDragonEvent(this.id, enemyId));
  }
}

```

`apply()` 方法分派事件。它接受一个事件对象作为参数。然而，模型不了解 `EventBus`，因此需要将两者连接起来。`EventPublisher` 类完成了这项工作：

```typescript title="kill-dragon.handler.ts"
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

    return {
      actionId: crypto.randomUUID(),
    };
  }
}

```

`EventPublisher#mergeObjectContext` 方法将事件发布者合并到提供的对象中。该对象必须实现 `IAggregateRoot` 接口（或扩展 `AggregateRoot` 类）。合并后，该对象可以向事件流发布事件。

使用 `apply()` 应用的事件会被排队，直到您调用模型的 `commit()` 方法，该方法分派所有未处理的事件。要使事件在应用后立即分派，请将 `autoCommit` 属性设置为 `true`：

```typescript
export class Hero extends AggregateRoot {
  constructor(private id: string) {
    super();
    this.autoCommit = true;
  }
}

```

要将事件发布者合并到类中而不是现有对象中，请使用 `EventPublisher#mergeClassContext` 方法：

```typescript
const HeroModel = this.publisher.mergeClassContext(Hero);
const hero = new HeroModel('id'); // <-- HeroModel is a class

```

`HeroModel` 类的每个实例现在都可以发布事件，而无需调用 `mergeObjectContext()` 方法。

截至 `@nestjs/cqrs` 12.1，模型的 `commit()`、`publish()` 和 `publishAll()` 返回事件总线返回的内容，即事件发布者返回的内容。默认的内存发布者不返回任何内容，因为它不会等待事件处理器。对于异步发布者（例如写入消息代理的发布者），`await hero.commit()` 会等待它并在失败时抛出错误。

这三者也接受一个分派器上下文，事件发布者在此处接收到它，而不是模型。命令处理器可以通过这种方式传递其事务，以便发布者通过它写入：

```typescript
await hero.commit({ transaction: tx });

```

`commit()` 在将事件交给事件总线后立即清除模型的事件，而无需等待发布者，因此再次调用它永远不会两次发布相同的事件。如果等待的 `commit()` 失败，则回滚并使用新加载的模型重新运行命令。

#### 灵活的聚合根

`AggregateRoot` 类是一个基类，您可以扩展它为您的领域模型添加事件驱动功能。然而，这种方法要求领域实体直接扩展 `AggregateRoot`，如果您的应用程序已经有既定的实体继承层次结构（例如，一个基础 `Entity` 类或像 `Monster` 或 `Vehicle` 这样的领域特定基类），这可能是一个限制。

为了获得更大的灵活性，`@nestjs/cqrs` 包支持三种实现聚合根的方法：

**方法 1：传统（类继承）**

这是前一个示例中展示的标准方法。它适用于简单场景和绿地项目。

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

**方法 2：混入（针对现有层次结构）**

如果您已经有基类但不能直接扩展 `AggregateRoot`，请使用 `WithAggregateRoot<EventBase, TBase>()` 混入函数。它将聚合根行为应用于任何现有基类。

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
    this.apply(new DragonDiedEvent(this.id)); // Provided by the mixin
  }
}

```

**方法 3：自定义实现**

为了获得最大的控制权，或使您的领域层完全与框架无关，请直接实现 `IAggregateRoot` 接口：

```typescript
export class CustomEntity implements IAggregateRoot {
  autoCommit = false;
  private events: IEvent[] = [];

  getUncommittedEvents() {
    return this.events;
  }

  publish(event: IEvent, dispatcherContext?: unknown) {
    // custom logic
  }

  publishAll(events: IEvent[], dispatcherContext?: unknown) {
    // custom logic
  }

  commit(dispatcherContext?: unknown) {
    // custom logic, such as:
    // return this.publishAll(this.events.splice(0), dispatcherContext);
  }

  uncommit() {
    // custom logic
  }

  apply(event: IEvent) {
    this.events.push(event);
  }

  loadFromHistory(history: IEvent[]) {
    // custom logic
  }
}

```

所有三种方法都与 `EventPublisher` 配合使用，该类接受实现 `IAggregateRoot` 接口的任何对象。截至 `@nestjs/cqrs` 12.1，`mergeObjectContext()` 和 `mergeClassContext()` 为模型提供 `publish()` 和 `publishAll()` 方法，将分派器上下文传递给事件总线并返回其结果。自定义 `commit()` 通过将其传递给 `publishAll()` 来支持分派器上下文。参数是可选的：不包含它们的实现，其方法不返回任何内容，仍然满足接口要求。

#### 手动事件发布

要在不通过模型的情况下发布事件，请直接调用 `EventBus#publish()` 方法：

```typescript
this.eventBus.publish(new HeroKilledDragonEvent(heroId, dragonId));

```

> info **提示** `EventBus` 是一个可注入的类。

每个事件可以有多个**事件处理器**。

```typescript title="hero-killed-dragon.handler.ts"
@EventsHandler(HeroKilledDragonEvent)
export class HeroKilledDragonHandler implements IEventHandler<HeroKilledDragonEvent> {
  constructor(private repository: HeroesRepository) {}

  handle(event: HeroKilledDragonEvent) {
    // Business logic
  }
}

```

> info **提示** 事件处理器在传统的 HTTP **请求** **执行上下文** 之外运行：
>
> - 在命令处理器中抛出的错误仍可被内置的 [exception filters](/overview/exception-filters) 捕获。
> - 在事件处理器中抛出的错误不能被**异常过滤器**捕获，因此您必须自行处理：使用 `try/catch` 块、使用触发补偿事件的 [saga](/recipes/cqrs#sagas)，或使用您选择的其他方法。
> - 命令处理器返回的值仍可发送回 HTTP **响应** 给客户端。
> - 事件处理器不能发送 HTTP **响应**。要向客户端发送信息，请使用 [WebSockets](/websockets/gateways)、[server-sent events](/http/server-sent-events) 或其他机制。

与命令和**查询**一样，将 `HeroKilledDragonHandler` 注册为 **模块** 中的 **提供者**：

```typescript
providers: [HeroKilledDragonHandler];

```

#### Saga

Saga 是一个长期运行的进程，它监听事件并可能触发新的命令。Saga 通常用于管理复杂的工作流。例如，当用户注册时，Saga 可能会监听 `UserRegisteredEvent` 并向用户发送欢迎邮件。

单个 Saga 可以监听 1..\* 个事件。使用 [RxJS](https://github.com/ReactiveX/rxjs) **库**，您可以过滤、映射、分叉和合并事件流来构建复杂的**工作流**。每个 Saga 返回一个 `Observable`，该对象会发射命令实例。然后，每个发射的命令由 `CommandBus` **异步** 分派。

> info **提示** Saga 在内存中运行。对于必须在重启后存活的进程，请参阅 [Durable sagas](/recipes/cqrs#durable-sagas)。

让我们创建一个监听 `HeroKilledDragonEvent` 并分派 `DropAncientItemCommand` 命令的 Saga。

```typescript title="heroes-game.saga.ts"
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

> info **提示** `ofType` **操作符** 和 `@Saga()` **装饰器** 从 `@nestjs/cqrs` **包** 中导出。

`@Saga()` **装饰器** 将属性标记为 Saga。`events$` 参数是所有事件的 `Observable` 流。`ofType` **操作符** 根据指定的事件类型过滤流，而 `map` **操作符** 将每个事件映射到新的命令实例。

在此示例中，每个 `HeroKilledDragonEvent` 都被映射到 `DropAncientItemCommand` 命令，然后由 `CommandBus` 自动分派。

与**查询**、命令和事件处理器一样，将 `HeroesGameSagas` 注册为 **模块** 中的 **提供者**：

```typescript
providers: [HeroesGameSagas];

```

#### 持久 Saga

Saga 和事件处理器在内存中运行。如果在事件和 Saga 分派的命令之间进程停止，该命令将永远不会被分派。一个组合了多个事件的 Saga（例如，等待订单后的支付，并在一小时后放弃）在重启时会丢失已看到的事件。在它背后的事务回滚前发布的事件仍然会到达它们。

当进程必须在重启和部署后存活时，让事件启动并发出一个 [durable workflow](/reliability/workflows) 信号。`@nestjs/workflows/cqrs` 入口点将事件映射到**工作流**，因此您的代码会继续执行命令和发布事件：

```bash
$ npm i --save @nestjs/workflows

```

```typescript title="app.module.ts"
import { CqrsModule } from '@nestjs/cqrs';
import { WorkflowsModule } from '@nestjs/workflows';
import { WorkflowsCqrsModule } from '@nestjs/workflows/cqrs';

@Module({
  imports: [CqrsModule.forRoot(), WorkflowsModule.forRoot(), WorkflowsCqrsModule],
  providers: [PlaceOrderHandler, OrderFulfilmentWorkflow],
})
export class AppModule {}

```

在注册存储之前，`WorkflowsModule` 将**工作流**保留在内存中。在 PostgreSQL 或 MySQL 上，将 **包** 的 `PostgresWorkflowStore` 或 `MySqlWorkflowStore` 注册为 **提供者**，在您已使用的数据库客户端上，如 [Keep workflows in your database](/reliability/workflows#keep-workflows-in-your-database) 所示：**工作流**随后存储在您的数据库中，并且它们的启动和信号可以加入您的事务。

`@StartOn()` 在事件发布时启动**工作流**，而 `@SignalOn()` 唤醒等待另一个事件的实例：

```typescript title="order-fulfilment.workflow.ts"
@Workflow('order-fulfilment')
@StartOn(OrderPlacedEvent, {
  id: (event) => `order-${event.order.id}`,
  input: (event) => event.order,
})
@SignalOn(OrderDeliveredEvent, {
  signal: shipmentDelivered,
  key: (event) => event.delivery.reference,
})
export class OrderFulfilmentWorkflow implements WorkflowRunner<Order, FulfilmentResult> {
  constructor(private readonly commandBus: CommandBus) {}

  async run(ctx: WorkflowContext, order: Order): Promise<FulfilmentResult> {
    const charge = await ctx.step('charge-payment', ({ idempotencyKey }) =>
      this.commandBus.execute(new ChargePaymentCommand(order, idempotencyKey)),
    );

    const delivery = await ctx.waitForSignal('await-delivery', shipmentDelivered, {
      key: order.id,
      timeout: '3d',
    });
    // ...
  }
}

```

命令处理器将其事务作为 `publish()`（CQRS 的分派器 **执行上下文**）的第二个参数传递。然后在该事务中创建**工作流**，因此只有在订单被保存时它才存在：

```typescript title="place-order.handler.ts"
return this.db.transaction(async (tx) => {
  await tx.insert(orders).values(order);
  await this.eventBus.publish(new OrderPlacedEvent(order), { transaction: tx });
  return order;
});

```

聚合的事件也是如此。截至 `@nestjs/cqrs` 12.1，请在同一回调中将事务传递给聚合的 `commit()`，并等待它：一旦**工作流**启动和发出信号，它就会解析。

```typescript
await order.commit({ transaction: tx });

```

**工作流**的状态存储在您的数据库中，因此它能存活于重启和部署之后。已完成的步骤永不再次运行，进程死亡的步骤会使用相同的幂等性键再次运行，该键由命令传递给支付**提供者**。重复的事件会找到第一个实例启动的实例。您的事件处理器和 Saga 仍然会接收到每个事件，在**工作流**之后。有关发布每种方式的保证以及聚合，请参阅 [Durable workflows with CQRS](/reliability/workflows#with-cqrs)。

#### 未处理的异常

事件处理器是**异步**执行的，因此它们必须始终正确处理异常，以防止应用程序进入不一致的状态。如果未处理异常，`EventBus` 会记录它，创建一个 `UnhandledExceptionInfo` 对象，并将其推送到 `UnhandledExceptionBus` 流。Saga 抛出的异常以及 Saga 分派的命令处理器执行命令时抛出的异常也适用。`UnhandledExceptionBus` 是一个 `Observable`，您可以**订阅**它来处理未处理的异常。如果将 `rethrowUnhandled` 选项设置为 `true`，则这些异常会被重新抛出，而不是发布到 `UnhandledExceptionBus`。

```typescript
private destroy$ = new Subject<void>();

constructor(private unhandledExceptionsBus: UnhandledExceptionBus) {
  this.unhandledExceptionsBus
    .pipe(takeUntil(this.destroy$))
    .subscribe((exceptionInfo) => {
      // Handle exception here
      // e.g. send it to external service, terminate process, or publish a new event
    });
}

onModuleDestroy() {
  this.destroy$.next();
  this.destroy$.complete();
}

```

要仅处理特定异常类型，请使用 `UnhandledExceptionBus.ofType()` **操作符**，它过滤具有 `instanceof` 的异常：

```typescript
this.unhandledExceptionsBus
  .pipe(
    takeUntil(this.destroy$),
    UnhandledExceptionBus.ofType(TransactionNotAllowedException),
  )
  .subscribe((exceptionInfo) => {
    // Handle exception here
  });

```

在这里，只有是 `TransactionNotAllowedException` 实例的异常才能到达**订阅者**。

`UnhandledExceptionInfo` 对象包含以下属性：

```typescript
export interface UnhandledExceptionInfo<
  Cause = IEvent | ICommand,
  Exception = any,
> {
  /**
   * The exception that was thrown.
   */
  exception: Exception;
  /**
   * The cause of the exception (event or command reference).
   */
  cause: Cause;
}

```

除非设置了 `rethrowUnhandled`，否则其流抛出异常的 Saga 默认停止：错误被发布和记录，Saga 忽略所有后续事件。要重新**订阅** Saga 的流，请将 `sagaErrorStrategy` 选项设置为 `'resubscribe'`：

```typescript
CqrsModule.forRoot({ sagaErrorStrategy: 'resubscribe' });

```

第一次重新**订阅**发生在 100 ms 后，并且每次出错后延迟会加倍，最高达 30 秒。当错误发生在上次错误一分钟或更长时间后时，它会从 100 ms 重新开始；成功的事件不会重置它。在 Saga 等待期间发布的事件会被错过，而像 `startWith` 这样在**订阅**时发射的**操作符**会在每次重新**订阅**时再次运行。如果设置了 `rethrowUnhandled`，则会重新抛出错误，Saga 不会被重新**订阅**。

无论采用哪种策略，Saga 抛出时仍在 Saga 内部**飞行**的事件（例如，在 `delay` 或**异步** `mergeMap` 中等待）都将被丢弃而不会报告。为防止一个坏事件影响其他事件，请在内部 `mergeMap` 中按事件捕获错误：

```typescript
@Saga()
dragonKilled = (events$: Observable<any>): Observable<ICommand> => {
  return events$.pipe(
    ofType(HeroKilledDragonEvent),
    mergeMap((event) =>
      of(event).pipe(
        map((event) => new DropAncientItemCommand(event.heroId, fakeItemID)),
        catchError((error) => {
          // Handle the error for this event only
          return EMPTY;
        }),
      ),
    ),
  );
}

```

#### 订阅所有事件

`CommandBus`、`QueryBus` 和 `EventBus` 都是 **Observable**。这意味着您可以订阅整个流，例如处理所有事件：将它们记录到控制台或保存到事件存储中。

```typescript
private destroy$ = new Subject<void>();

constructor(private eventBus: EventBus) {
  this.eventBus
    .pipe(takeUntil(this.destroy$))
    .subscribe((event) => {
      // Save events to database
    });
}

onModuleDestroy() {
  this.destroy$.next();
  this.destroy$.complete();
}

```

#### 请求作用域

如果您来自其他编程语言，您可能会惊讶地发现，在 Nest 中，大多数事物在传入的 **请求** 之间是共享的：数据库的连接池、具有全局状态的单例 **服务** 等。Node.js 不遵循请求/响应多线程无状态模型，在这种模型中，每个 **请求** 由一个单独的线程处理。因此，使用单例实例对您的应用程序是**安全**的。

然而，在某些边缘情况下，需要处理程序的基于 **请求** 的生命周期，例如 GraphQL 应用程序中的每 **请求** 缓存、**请求** 跟踪或多租户。请参阅 [injection scopes](/fundamentals/provider-scopes) 章节了解如何控制 **作用域**。

将 **请求作用域** 的 **提供者** 与 CQRS 结合使用可能很复杂，因为 `CommandBus`、`QueryBus` 和 `EventBus` 是单例。`@nestjs/cqrs` 包通过为每个处理的命令、**查询** 或事件自动创建 **请求作用域** 处理器的新实例来处理这个问题。

要使处理器具有 **请求作用域**，可以：

1. 依赖于 **请求作用域** 的 **提供者**。
2. 在 `@CommandHandler()`、`@QueryHandler()` 或 `@EventsHandler()` **装饰器** 中明确将其 **作用域** 设置为 `REQUEST`，如下所示：

```typescript
@CommandHandler(KillDragonCommand, {
  scope: Scope.REQUEST,
})
export class KillDragonHandler {
  // Implementation here
}

```

要将 **请求** 有效载荷注入到 **请求作用域** 的 **提供者** 中，请使用 `@Inject(REQUEST)` **装饰器**（`REQUEST` 从 `@nestjs/core` 导出）。但在 CQRS 中，**请求** 有效载荷取决于 **执行上下文**：它可以是 HTTP **请求**、定时 **任务** 或触发命令的任何其他操作。

该有效载荷必须是 `AsyncContext`（从 `@nestjs/cqrs` 导出）的实例或继承自它的类的实例。它充当 **请求** **执行上下文**，并包含在整个 **请求生命周期** 中可访问的数据。

```typescript
import { AsyncContext } from '@nestjs/cqrs';

export class MyRequest extends AsyncContext {
  constructor(public readonly user: User) {
    super();
  }
}

```

在执行命令时，将自定义 **请求** **执行上下文** 作为 `CommandBus#execute()` 方法的第二个参数传递：

```typescript
const myRequest = new MyRequest(user);
await this.commandBus.execute(
  new KillDragonCommand(heroId, killDragonDto.dragonId),
  myRequest,
);

```

这使得 `MyRequest` 实例可作为相应处理器的 `REQUEST` **提供者** 可用：

```typescript
@CommandHandler(KillDragonCommand, {
  scope: Scope.REQUEST,
})
export class KillDragonHandler {
  constructor(
    @Inject(REQUEST) private request: MyRequest, // Inject the request context
  ) {}

  // Handler implementation here
}

```

**查询** 也是相同的方式工作：

```typescript
const myRequest = new MyRequest(user);
const hero = await this.queryBus.execute(new GetHeroQuery(heroId), myRequest);

```

在 **查询** 处理程序中：

```typescript
@QueryHandler(GetHeroQuery, {
  scope: Scope.REQUEST,
})
export class GetHeroHandler {
  constructor(
    @Inject(REQUEST) private request: MyRequest, // Inject the request context
  ) {}

  // Handler implementation here
}

```

对于事件，您可以将 **请求** **执行上下文** 传递给 `EventBus#publish()`，但这不常见。相反，请使用 `EventPublisher` 将 **请求** **执行上下文** 合并到模型中：

```typescript
const hero = this.publisher.mergeObjectContext(
  await this.repository.findOneById(+heroId),
  this.request, // Inject the request context here
);

```

处理这些事件的 **请求作用域** 事件处理器可以访问 **请求** **执行上下文**。

Saga 始终是单例，因为它们管理长期运行的进程（在非单例 **提供者** 中注册 saga 会抛出异常）。但是，您可以从事件对象中检索 **请求** **执行上下文**：

```typescript
@Saga()
dragonKilled = (events$: Observable<any>): Observable<ICommand> => {
  return events$.pipe(
    ofType(HeroKilledDragonEvent),
    map((event) => {
      const request = AsyncContext.of(event); // Retrieve the request context
      const command = new DropAncientItemCommand(event.heroId, fakeItemID);

      AsyncContext.merge(request, command); // Merge the request context into the command
      return command;
    }),
  );
}

```

或者，调用 `request.attachTo(command)` 方法将 **请求** **执行上下文** 附加到命令上。

#### 示例

可在 [nest-cqrs-example repository](https://github.com/kamilmysliwiec/nest-cqrs-example) 查看一个可工作的示例。