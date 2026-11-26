<!-- 此文件从 content/exception-filters.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:04:16.878Z -->
<!-- 源文件: content/exception-filters.md -->
<!-- 源哈希: 83801dedcce801de76e2663e37610872 -->

### 异常过滤器

Nest 内置了一个**异常层**，用于处理在处理传入的 **请求** 或消息过程中抛出的所有未处理的异常。当应用程序代码未处理异常时，该层会捕获它并自动发送一个适当的、用户友好的 **响应**。

<figure>
  <img class="illustrative-image" src="/assets/Filter_1.png" />
</figure>

开箱即用时，这是由内置的**全局异常过滤器**完成的，它处理类型为 `HttpException`（及其子类）的异常。当异常是**未识别**的（既不是 `HttpException` 也不是继承自 `HttpException` 的类）时，内置异常过滤器会生成以下默认 JSON **响应**：

```json
{
  "statusCode": 500,
  "message": "Internal server error"
}

```

> info **提示** 全局异常过滤器部分支持 `http-errors` 库。如果抛出的错误携带了该库产生的形状的 `statusCode` 和 `message` 属性，则会返回这些值，而不是未识别异常的默认 `InternalServerErrorException` **响应**。从 NestJS v12.2 开始，如果错误的 `expose` 属性是 `false`，则 **响应** 会携带其状态码的标准原因短语（例如 `Bad Gateway`），而不是错误的 **请求** 消息。`http-errors` 为 500 及以上状态码设置 `expose` 为 `false`，因此当 5xx 错误的 **请求** 消息是为客户端准备时，请将 `expose: true` 传递给 `createError()`。

#### 抛出标准异常

Nest 提供了一个内置的 `HttpException` 类，从 `@nestjs/common` 包中暴露。对于典型的基于 HTTP 的 REST 和 GraphQL API，当发生特定错误条件时，最佳实践是发送标准的 HTTP **响应** 对象。

例如，`CatsController` 有一个 `findAll()` 方法（一个 `GET` **控制器** 路由处理程序）。假设此路由处理程序抛出了一个异常。为演示此功能，我们将其硬编码如下：

```typescript title="cats.controller.ts"
@Get()
async findAll() {
  throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
}

```

> info **提示** `HttpStatus` 是从 `@nestjs/common` 包导入的辅助枚举。

当客户端调用此端点时，**响应** 如下所示：

```json
{
  "statusCode": 403,
  "message": "Forbidden"
}

```

`HttpException` 构造函数接受两个必需的参数来确定 **响应**：

- `response` 参数定义 JSON **响应** 主体。它可以是 `string` 或 `object`，如下文所述。
- `status` 参数定义 [HTTP status code](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)。

默认情况下，JSON **响应** 主体包含两个属性：

- `statusCode`：默认为 `status` 参数中提供的 HTTP 状态码
- `message`：基于 `status` 的 HTTP 错误的简短描述

要仅覆盖 JSON **响应** 主体的消息部分，请在 `response` 参数中提供一个字符串。要覆盖整个 JSON **响应** 主体，请在 `response` 参数中传递一个对象。Nest 会对该对象进行 **序列化** 并将其作为 JSON **响应** 主体返回。

> info **提示** 作为 `response` 参数传递的 `Error` 实例不会被 **序列化** 到 **响应** 主体中。Nest 会为状态发送默认的 `{ statusCode, message }` 主体，因此不会向客户端暴露错误的属性。为保留原始错误以供记录，请将其作为 `cause` 传递。

第二个构造函数参数 `status` 应该是一个有效的 HTTP 状态码。最佳实践是使用从 `@nestjs/common` 导入的 `HttpStatus` 枚举。

可选的**第三**构造函数参数 `options` 可用于提供错误 [cause](https://nodejs.org/en/blog/release/v16.9.0/#error-cause)。`cause` 对象不会被 **序列化** 到 **响应** 对象中，但它对记录很有用，因为它提供了导致 `HttpException` 抛出的内部错误的**信息**。

这是一个覆盖整个 **响应** 主体并提供错误原因的示例：

```typescript title="cats.controller.ts"
@Get()
async findAll() {
  try {
    await this.service.findAll();
  } catch (error) {
    throw new HttpException({
      status: HttpStatus.FORBIDDEN,
      error: 'This is a custom message',
    }, HttpStatus.FORBIDDEN, {
      cause: error
    });
  }
}

```

**响应** 随后如下所示：

```json
{
  "status": 403,
  "error": "This is a custom message"
}

```

#### 异常日志记录

默认情况下，异常过滤器不会记录内置异常，例如 `HttpException`（以及任何继承自它的异常）。这些异常被视为正常应用程序流程的一部分，因此不会出现在控制台中。同样适用于其各自上下文中的 `WsException` 和 `RpcException`。

`HttpException` 继承自 `IntrinsicException` 类，该类从 `@nestjs/common` 包中导出。内置异常过滤器从不记录 `IntrinsicException` 实例，这是它们区分正常操作的一部分异常和非正常操作异常的方法。

要记录这些异常，请按照下面 [Exception filters](#异常过滤器) 部分所述创建一个自定义异常过滤器。

#### 在生产环境中跟踪错误

异常过滤器决定了*客户端*看到什么。仅凭自身，它不会告诉你 `TypeError` 在 `OrdersService` 十二分钟前开始触发，发生在 4% 的结账流程中，仅针对购物车包含折扣商品的客户。它也不会告诉你哪一行抛出了错误。

通常的方法是记录堆栈跟踪然后稍后搜索，但这是不够的：日志文件中的堆栈跟踪指向编译后的输出（`/var/app/current/dist/orders/orders.service.js:35`），不携带源代码上下文，并且无法告诉你这是第一次发生还是第**一**万次。

[NestJS Observe](https://www.observe.nestjs.com/ 'NestJS Observe') 将未处理的错误视为一等公民对象，而不是日志行。到达异常层的每个错误都会被捕获，同时捕获导致它的 **请求**，并且：

- **堆栈跟踪包含源代码。** 帧通过您的源码映射解析回 `src/orders/orders.service.ts:35`，并显示周围的行，因此您无需克隆任何内容即可在错误卡中阅读失败的代码。
- **发生情况被分组到缺陷中。** 具有相同类和堆栈形状的错误会合并到一个带有指纹、计数、首次出现和最后出现时间戳以及引入它的版本的组中。“自 v2.4.1 以来新增”是一个您可以从页面上读取的事实，而不是推断出来的。
- **失败保留其上下文。** 它所属的跟踪、触发它的用户、该 **请求** 期间写入的日志以及抛出前运行的跨度都会被附加，因此您可以查看 **请求** 在失败时正在做什么。

<figure><img src="https://www.observe.nestjs.com/docs/telemetry/error-with-source.webp" alt="Error card with source context" /></figure>

由于错误本身已经携带了代码，您可以一键将其交给编码代理：**复制代理提示** 将错误、带有源代码行的修剪后的堆栈跟踪、慢速跨度和周围日志打包成一个自包含的提示，供 Claude Code、Cursor 或任何已打开您代码仓库的工具使用。

这补充了本章中描述的过滤器，而不是取代它们：过滤器塑造响应，而仪器化记录了到达过程中的情况。有关 SDK 捕获的有关错误的全部信息，请参阅 [Error monitoring](https://docs.nestjs.com/observability/error-monitoring)，有关设置，请参阅 [Observability](/observability/overview)，有关将重复错误转变为可验证其修复的跟踪问题，请参阅 [Dashboard](/observability/dashboard#问题)。

#### 自定义异常

在大多数情况下，您不需要编写自定义异常，可以使用下一节中描述的内置 Nest HTTP 异常。如果您确实需要自定义异常，最佳实践是创建自己的**异常层级**，其中您的自定义异常继承自基础 `HttpException` 类。然后 Nest 就会识别您的异常并自动处理错误响应。让我们实现这样一个自定义异常：

```typescript title="CB_5".

```

由于 `ForbiddenException` 继承自基础 `HttpException`，它与内置异常处理器协同工作，因此我们可以在 `findAll()` 方法中使用它。

```typescript title="CB_6".

```

#### 内置 HTTP 异常

Nest 提供了一组继承自基础 `HttpException` 的标准异常。它们从 `@nestjs/common` 包中暴露，代表了许多最常见的 HTTP 异常：

- `BadRequestException`
- `UnauthorizedException`
- `NotFoundException`
- `ForbiddenException`
- `NotAcceptableException`
- `RequestTimeoutException`
- `ConflictException`
- `GoneException`
- `HttpVersionNotSupportedException`
- `PayloadTooLargeException`
- `UnsupportedMediaTypeException`
- `UnprocessableEntityException`
- `InternalServerErrorException`
- `NotImplementedException`
- `ImATeapotException`
- `MethodNotAllowedException`
- `MisdirectedException`
- `BadGatewayException`
- `ServiceUnavailableException`
- `GatewayTimeoutException`
- `PreconditionFailedException`

所有内置异常还可以通过 `options` 参数提供错误 `cause` 和错误描述：

```typescript title="CB_7".

```

响应如下所示：

```typescript title="CB_8".

```

#### 机器可读的错误代码

异常的 `status` 和 `message` 对人类来说描述了足够的错误信息，但对客户端来说不方便进行分支判断。几个不同的故障，例如无效的电子邮件和弱密码，都可能表现为 `400 Bad Request`，这迫使客户端解析人类可读的消息字符串来区分它们。

为避免这种情况，请通过 `options` 参数传递一个 `errorCode`。这是一个稳定的、机器可读的标识符，会被序列化到响应体中：

```typescript title="CB_9".

```

响应随后会携带代码以及常规字段：

```typescript title="CB_10".

```

`errorCode` 是可选的，可以与 `cause` 和 `description` 结合使用。它也存在于 `HttpException` 本身，因此自定义异常也可以设置它：

```typescript title="CB_11".

```

> info **提示** 与用于日志记录且永不序列化的 `cause` 不同，`errorCode` 是响应体的一部分，旨在被客户端消费。

#### 异常过滤器

内置的异常过滤器会自动处理许多情况，但您可能希望对异常层拥有**完全控制**，例如添加日志或基于动态因素使用不同的 JSON 模式。**异常过滤器**就是为此目的设计的。它们让您可以控制执行的精确流程以及发送回客户端的响应内容。

让我们创建一个异常过滤器，用于捕获 `HttpException` 类的实例异常，并为其实现自定义响应逻辑。为此，我们需要访问底层平台 `Request` 和 `Response` 对象。我们将使用 `Request` 对象来提取原始 `url` 并将其包含在响应中，使用 `Response` 对象来直接控制发送的响应，利用 `response.json()` 方法。

```typescript title="CB_12".

```

> info **提示** 所有异常过滤器都应实现通用的 `ExceptionFilter<T>` 接口。这要求您提供具有指定签名的 `catch(exception: T, host: ArgumentsHost)` 方法。`T` 指示异常的类型。

> warning **警告** 如果您使用的是 `@nestjs/platform-fastify`，请使用 `response.send()` 而不是 `response.json()`，并从 `fastify` 导入相应的类型。

`@Catch(HttpException)` 装饰器将所需的元数据绑定到异常过滤器，告诉 Nest 这个特定的过滤器正在查找类型为 `HttpException` 的异常，仅此而已。`@Catch()` 装饰器接受单个参数或逗号分隔的列表，这允许您一次为多种类型的异常设置过滤器。

#### 参数宿主

让我们看一下 `catch()` 方法的参数。`exception` 参数是当前正在处理的异常对象。`host` 参数是一个 `ArgumentsHost` 对象，一个实用工具，可让您访问传递给原始处理器的参数，无论它在何种上下文中被调用。在上面的代码示例中，我们使用其辅助方法来获取异常起源的 **请求** 的 `Request` 和 `Response` 对象。`ArgumentsHost` 在 [execution context chapter](/fundamentals/execution-context) 中有完整介绍。

实现这种抽象级别的原因是 `ArgumentsHost` 在每种上下文中都有效：此处使用的 HTTP 服务器上下文，但也包括微服务和 WebSocket。执行上下文章节展示了如何通过同一个对象访问**任何**上下文的 <a href="/fundamentals/execution-context#host-handler-arguments">底层参数</a>，这使您能够编写一个跨所有这些上下文运行的单一异常过滤器。

<app-banner-courses></app-banner-courses>

#### 绑定过滤器

让我们将新的 `HttpExceptionFilter` 绑定到 `CatsController` 的 `create()` 方法上。

```typescript title="cats.controller.ts"
@Post()
@UseFilters(new HttpExceptionFilter())
async create(@Body() createCatDto: CreateCatDto) {
  throw new ForbiddenException();
}

```

> info **提示** `@UseFilters()` 装饰器是从 `@nestjs/common` 包导入的。

与 `@Catch()` 装饰器一样，`@UseFilters()` 接受单个过滤器实例或逗号分隔的过滤器实例列表。在这里，我们就地创建了 `HttpExceptionFilter` 实例。或者，您可以传递类（而不是实例），让框架负责实例化，从而启用**依赖注入**。

```typescript title="cats.controller.ts"
@Post()
@UseFilters(HttpExceptionFilter)
async create(@Body() createCatDto: CreateCatDto) {
  throw new ForbiddenException();
}

```

> info **提示** 尽可能通过类而不是实例来绑定过滤器。这减少了**内存使用量**，因为 Nest 可以在整个模块中重用相同类的实例。

在上面的示例中，`HttpExceptionFilter` 仅应用于 `create()` 路由处理器，使其具有方法作用域。异常过滤器可以在不同级别设置作用域：方法作用域（控制器、解析器或网关的一个方法）、控制器作用域或全局作用域。例如，要设置控制器作用域的过滤器，请执行以下操作：

```typescript title="cats.controller.ts"
@Controller()
@UseFilters(new HttpExceptionFilter())
export class CatsController {}

```

这为 `CatsController` 内定义的每个路由处理器设置了 `HttpExceptionFilter`。

要创建全局作用域的过滤器，请执行以下操作：

```typescript title="main.ts"
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

> warning **警告** `useGlobalFilters()` 方法不为网关或**混合应用程序**设置过滤器。

全局作用域的过滤器用于整个应用程序，适用于每个控制器和每个路由处理器。在依赖注入方面，从任何模块外部注册的全局过滤器（使用 `useGlobalFilters()`，如上例所示）无法注入依赖项，因为这发生在任何模块的上下文之外。要解决此问题，您可以使用以下构造**直接从任何模块**注册全局作用域的过滤器：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}

```

> info **提示** 当您使用此方法为过滤器执行依赖注入时，无论此构造在哪个模块中使用，过滤器都是全局的。请在定义该过滤器（上例中的 `HttpExceptionFilter`）的模块中注册它。此外，`useClass` 不是注册**自定义提供者**的唯一方法。了解更多关于 [custom providers](/fundamentals/dependency-injection) 的信息。

> info **提示** 从 [middleware](/overview/middlewares#错误处理) 抛出的异常也会被异常层处理。由于中间件在选择路由处理器之前运行，只有**全局**异常过滤器才适用（`app.useGlobalFilters()` 或 `APP_FILTER`）。方法作用域和控制器作用域的 `@UseFilters()` 绑定不会被调用。

通过将每个过滤器添加到 `providers` 数组中，您可以使用此技术注册所需的任意数量的过滤器。

#### 捕获所有

要捕获**所有**未处理的异常，无论其类型如何，请将 `@Catch()` 装饰器的参数列表留空，即 `@Catch()`。

> warning **警告** 此处的“所有未处理的异常”意味着从**请求**的处理器链中传播出的每个异常：中间件、守卫、拦截器、管道和路由处理器本身。异常层包装了该调用，因此它只能看到反向传播的错误。捕获所有过滤器**不是** `process.on('uncaughtException')` 和 `process.on('unhandledRejection')` 的替代品。从 `setTimeout` 回调、从处理器外部发射的事件的监听器或从从未等待的 promise 中抛出的错误会离开启动它的**请求**，因此不会调用任何过滤器。这些错误仍然会使进程崩溃或不稳定，必须在进程级别处理，如 [Node.js documentation](https://nodejs.org/api/process.html#event-uncaughtexception) 所述。

下面的示例与平台无关：它通过 [HTTP adapter](./faq/http-adapter) 而不是直接使用平台特定的 `Request` 和 `Response` 对象来传递**响应**，因此相同的过滤器可与 Express 和 Fastify 配合使用。

```typescript
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Catch()
export class CatchEverythingFilter implements ExceptionFilter {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    // In certain situations `httpAdapter` might not be available in the
    // constructor, so resolve it here.
    const { httpAdapter } = this.httpAdapterHost;

    const ctx = host.switchToHttp();

    const httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const responseBody = {
      statusCode: httpStatus,
      timestamp: new Date().toISOString(),
      path: httpAdapter.getRequestUrl(ctx.getRequest()),
    };

    httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus);
  }
}

```

> warning **警告** 当将捕获所有过滤器与绑定到特定异常类型的过滤器结合使用时，请**首先**声明捕获所有过滤器，这样更具体的过滤器仍可以处理其绑定的类型。

#### 继承

通常，您会创建针对应用程序需求的完全定制的异常过滤器。然而，在某些情况下，您可能希望扩展内置的**全局异常过滤器**，仅在特定条件下覆盖其行为。

要将异常处理委托给基础过滤器，请扩展 `BaseExceptionFilter` 并调用继承的 `catch()` 方法。

```typescript title="all-exceptions.filter.ts"
import { Catch, ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    super.catch(exception, host);
  }
}

```

> warning **警告** 扩展 `BaseExceptionFilter` 的方法作用域和控制器作用域的过滤器不应使用 `new` 进行实例化。相反，应让框架自动实例化它们。

全局过滤器**可以**扩展基础过滤器，有两种方式。

第一种方式是在实例化自定义全局过滤器时，将 `HttpAdapter` 引用传递给构造函数：

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new AllExceptionsFilter(httpAdapter));

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

第二种方式是使用 `APP_FILTER` 令牌注册过滤器，如前面所示 <a href="exception-filters#绑定过滤器"></a>。