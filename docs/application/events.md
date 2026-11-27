<!-- 此文件从 content/application/events.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T01:00:46.050Z -->
<!-- 源文件: content/application/events.md -->
<!-- 源哈希: fd960916c7c8719a92593e3989529756 -->

### 事件

[Event Emitter](https://www.npmjs.com/package/@nestjs/event-emitter) 包（`@nestjs/event-emitter`）提供了一个观察者实现，允许您订阅和监听应用程序中发生的事件。事件是解耦应用程序不同部分的良好方式，因为单个事件可以有多个不相互依赖的监听器。

`EventEmitterModule` 内部使用 [eventemitter2](https://github.com/EventEmitter2/EventEmitter2) 包。

#### 入门

首先，安装所需的包：

```shell
$ npm i --save @nestjs/event-emitter

```

安装完成后，将 `EventEmitterModule` 导入到根 `AppModule` 中，并调用其 `forRoot()` 静态方法，如下所示：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    EventEmitterModule.forRoot()
  ],
})
export class AppModule {}

```

`.forRoot()` 调用初始化事件发射器，并注册应用程序中存在的任何声明式事件监听器。注册发生在 `onApplicationBootstrap` 生命周期钩子中，这确保了所有模块都已加载并声明了它们的事件监听器。默认情况下，该模块被注册为 [global module](/modules#全局模块)，因此您可以在任何地方注入事件发射器而无需再次导入 `EventEmitterModule`。要更改此行为，请将 `global` 选项设置为 `false`。

要配置底层 `EventEmitter2` 实例，请将配置对象传递给 `.forRoot()` 方法，如下所示：

```typescript
EventEmitterModule.forRoot({
  // set this to `true` to use wildcards
  wildcard: false,
  // the delimiter used to segment namespaces
  delimiter: '.',
  // set this to `true` if you want to emit the newListener event
  newListener: false,
  // set this to `true` if you want to emit the removeListener event
  removeListener: false,
  // the maximum amount of listeners that can be assigned to an event
  maxListeners: 10,
  // show event name in memory leak message when more than maximum amount of listeners is assigned
  verboseMemoryLeak: false,
  // disable throwing uncaughtException if an error event is emitted and it has no listeners
  ignoreErrors: false,
});

```

#### 派发事件

要派发（即触发）一个事件，首先通过构造函数注入 `EventEmitter2`：

```typescript
constructor(private eventEmitter: EventEmitter2) {}

```

> info **提示** 从 `@nestjs/event-emitter` 包导入 `EventEmitter2`。

然后在类中使用它，如下所示：

```typescript
this.eventEmitter.emit(
  'order.created',
  new OrderCreatedEvent({
    orderId: 1,
    payload: {},
  }),
);

```

#### 监听事件

要声明一个事件监听器，请使用 `@OnEvent()` 装饰器装饰处理该事件的方法，如下所示：

```typescript
@OnEvent('order.created')
handleOrderCreatedEvent(payload: OrderCreatedEvent) {
  // handle and process "OrderCreatedEvent" event
}

```

> info **提示** 如果事件监听器属于 [request-scoped](/fundamentals/provider-scopes) 提供者，Nest 会为它处理的每个事件创建一个新的提供者实例。事件载荷取代了请求对象，因此在该提供者中注入 `REQUEST` 可以获取载荷。如果您发出的载荷本身就是传入的请求对象（或携带了其上下文 ID），请将 `forRoot()` 的 `inheritRequestContextId` 选项设置为 `true`，以便监听器重用该请求的 DI 子树，而不是创建一个新的。

第一个参数可以是简单事件发射器的 `string` 或 `symbol`，对于通配符发射器则是 `string | symbol | Array<string | symbol>`。

可选的第二个参数是监听器选项对象：

```typescript
export type OnEventOptions = OnOptions & {
  /**
   * If "true", prepends (instead of appends) the given listener to the array of listeners.
   *
   * @see https://github.com/EventEmitter2/EventEmitter2#emitterprependlistenerevent-listener-options
   *
   * @default false
   */
  prependListener?: boolean;

  /**
   * If "true", errors thrown by the onEvent callback are logged instead of rethrown. If "false", they are rethrown.
   *
   * @default true
   */
  suppressErrors?: boolean;

  /**
   * Registration priority. Higher values run first. Listeners that omit this option use `0`, so a positive priority runs before them and a negative one after them. Listeners with the same priority keep discovery order (reverse discovery order for `prependListener: true` listeners).
   *
   * @default 0
   */
  priority?: number;
};

```

> info **提示** 有关 `OnOptions` 对象，请参阅 [`eventemitter2` documentation](https://github.com/EventEmitter2/EventEmitter2#emitteronevent-listener-options-objectboolean)。

例如，以下监听器是异步运行的：

```typescript
@OnEvent('order.created', { async: true })
handleOrderCreatedEvent(payload: OrderCreatedEvent) {
  // handle and process "OrderCreatedEvent" event
}

```

要使用命名空间和通配符，请将 `wildcard` 选项传递给 `EventEmitterModule#forRoot()` 方法。当启用命名空间和通配符时，事件可以是分隔符分隔的字符串（`foo.bar`）或数组（`['foo', 'bar']`）。您可以使用 `delimiter` 选项配置分隔符。启用命名空间后，您可以使用通配符订阅事件：

```typescript
@OnEvent('order.*')
handleOrderEvents(payload: OrderCreatedEvent | OrderRemovedEvent | OrderUpdatedEvent) {
  // handle and process an event
}

```

单个通配符匹配恰好一个片段。例如，`order.*` 匹配事件 `order.created` 和 `order.shipped`，但不匹配 `order.delayed.out_of_stock`。要监听此类事件，请使用多级通配符模式（即 `**`），该模式在 [EventEmitter2 documentation on multi-level wildcards](https://github.com/EventEmitter2/EventEmitter2#multi-level-wildcards) 中描述。

使用此模式，您可以例如创建一个捕获所有事件的事件监听器：

```typescript
@OnEvent('**')
handleEverything(payload: any) {
  // handle and process an event
}

```

> info **提示** `EventEmitter2` 类提供了与事件交互的几个有用方法，例如 `waitFor()` 和 `onAny()`。有关详细信息，请参阅 [EventEmitter2 documentation](https://github.com/EventEmitter2/EventEmitter2)。

#### 监听器优先级

在 `@OnEvent()` 选项中传递 `priority`，以选择相同事件的监听器调用的顺序。Nest 会收集每个 `@OnEvent` 监听器，按优先级（最高优先）排序，然后才进行注册。省略 `priority` 的监听器使用 `0`：正优先级在它们之前运行，负优先级在它们之后运行。允许使用 `Infinity` 和 `-Infinity`，而 `NaN` 会回退到 `0`。

```typescript
@OnEvent('order.created', { priority: 10 })
checkInventory(payload: OrderCreatedEvent) {
  // runs first
}

@OnEvent('order.created')
notifyWarehouse(payload: OrderCreatedEvent) {
  // priority 0, runs after the check
}

@OnEvent('order.created', { priority: -5 })
recordAnalytics(payload: OrderCreatedEvent) {
  // runs last
}

```

带有 `prependListener: true` 的监听器会排在其他没有优先级的 `@OnEvent` 监听器之前。Nest 会分别按优先级对这两个组进行排序，因此，一个前置监听器仍然在具有更高优先级的后置监听器之前运行。具有相同优先级的监听器保持它们没有优先级时的顺序：后置监听器的发现顺序，前置监听器的反向发现顺序。

优先级仅在相同事件名称的 `@OnEvent` 监听器之间起作用。它保持直接添加到 `EventEmitter2` 上的监听器在其添加时的位置。它还保持通配符监听器（`order.*`）和精确匹配监听器（`order.created`）在 [EventEmitter2](https://github.com/EventEmitter2/EventEmitter2) 调用它们的顺序。

优先级仅对在事件发出时同步开始工作的监听器有效：

- 使用 `async: true`、`nextTick: true` 或 `promisify: true` 注册的监听器是延迟的，因此它们在所有同步监听器之后运行，无论其优先级如何。例如，`@OnEvent('order.created', { priority: 10, async: true })` 仍然在上面的 `notifyWarehouse()` 之后运行。
- 位于 [request-scoped](/fundamentals/provider-scopes) 或持久提供者上的监听器在其主体运行之前解析其实例，因此其主体可以在低优先级监听器之后开始。优先级对它们不适用。

优先级决定了监听器调用的顺序，而不是下一个监听器是否运行。在每种模式下，包括普通的 `emit()`，抛出或拒绝的更高优先级的监听器仍然会允许其后的监听器运行。高优先级的安全检查不能依赖于抛出的错误来跳过后续监听器，例如上面的 `notifyWarehouse()`。

#### 防止事件丢失

在 `onApplicationBootstrap` 生命周期钩子之前或期间（例如，来自构造函数或 `onModuleInit()` 方法）发出的事件可能会丢失，因为监听器可能尚未注册。

为避免这种情况，请使用 `@nestjs/event-emitter` 导出的 `EventEmitterReadinessWatcher` 的 `waitUntilReady()` 方法。它返回一个 promise，该 promise 在所有监听器都已注册后解析。在提供者的 `onApplicationBootstrap` 生命周期钩子中调用它，然后再发出事件：

```typescript
await this.eventEmitterReadinessWatcher.waitUntilReady();
this.eventEmitter.emit(
  'order.created',
  new OrderCreatedEvent({ orderId: 1, payload: {} }),
);

```

> info **注意** 这仅对在 `onApplicationBootstrap` 生命周期钩子完成之前发出的事件是必需的。

#### 示例

可用的工作示例在 [event emitter sample](https://github.com/nestjs/nest/tree/master/sample/30-event-emitter) 中。