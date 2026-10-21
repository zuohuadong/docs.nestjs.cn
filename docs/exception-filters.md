<!-- 此文件从 content/exception-filters.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T07:39:02.083Z -->
<!-- 源文件: content/exception-filters.md -->
<!-- 源哈希: 4812f959ad3bfbb895f5ff63d63c5b5d -->

### 异常过滤器

Nest 内置了一个**异常层**，用于处理应用程序中所有未处理的异常。当你的应用程序代码未处理某个异常时，该层会捕获它，并自动发送一个恰当的、对用户友好的响应。

<figure>
  <img class="illustrative-image" src="/assets/Filter_1.png" />
</figure>

开箱即用，这是由一个内置的**全局异常过滤器**完成的，它处理 `HttpException` 类型（及其子类）的异常。当异常**无法识别**（既不是 `HttpException`，也不是继承自 `HttpException` 的类）时，内置异常过滤器会生成以下默认 JSON 响应：

```json
{
  "statusCode": 500,
  "message": "Internal server error"
}

```

> info **提示** 全局异常过滤器部分支持 `http-errors` 库。抛出的错误如果带有该库所生成的 `statusCode` 和 `message` 属性，则会连同这些值一起返回，而不是对无法识别的异常返回默认的 `InternalServerErrorException` 响应。

#### 抛出标准异常

Nest 提供了一个内置的 `HttpException` 类，从 `@nestjs/common` 包中导出。对于典型的基于 HTTP 的 REST 和 GraphQL API，当出现某些错误情况时，最佳实践是发送标准的 HTTP 响应对象。

例如，`CatsController` 有一个 `findAll()` 方法（一个 `GET` 路由处理器）。假设这个路由处理器抛出了一个异常。为了演示，我们将其硬编码如下：

```typescript title="cats.controller.ts"
@Get()
async findAll() {
  throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
}

```

> info **提示** `HttpStatus` 是从 `@nestjs/common` 包导入的辅助枚举。

当客户端调用此端点时，响应如下所示：

```json
{
  "statusCode": 403,
  "message": "Forbidden"
}

```

`HttpException` 构造函数接收两个必需参数，用于确定响应：

- `response` 参数定义 JSON 响应体。如下所述，它可以是 `string` 或 `object`。
- `status` 参数定义 [HTTP status code](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)。

默认情况下，JSON 响应体包含两个属性：

- `statusCode`：默认为 `status` 参数中提供的 HTTP 状态码
- `message`：基于 `status` 的 HTTP 错误简短描述

若要仅覆盖 JSON 响应体中的 message 部分，请在 `response` 参数中提供一个字符串。若要覆盖整个 JSON 响应体，请在 `response` 参数中传入一个对象。Nest 会序列化该对象并将其作为 JSON 响应体返回。

> info **提示** 作为 `response` 参数传入的 `Error` 实例不会被序列化到响应体中。Nest 会改为针对该状态发送默认的 `{ statusCode, message }` 响应体，因此错误的属性不会暴露给客户端。若要保留原始错误以便记录日志，请改为将其作为 `cause` 传入。

第二个构造函数参数 `status` 应该是一个有效的 HTTP 状态码。最佳实践是使用从 `@nestjs/common` 导入的 `HttpStatus` 枚举。

可选的**第三个**构造函数参数 `options` 可用于提供错误的 [cause](https://nodejs.org/en/blog/release/v16.9.0/#error-cause)。`cause` 对象不会被序列化到响应对象中，但它对日志记录很有用，因为它提供了导致抛出 `HttpException` 的内部错误信息。

下面是一个覆盖整个响应体并提供错误原因的示例：

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

此时响应如下所示：

```json
{
  "status": 403,
  "error": "This is a custom message"
}

```

#### 异常日志记录

默认情况下，异常过滤器不会记录诸如 `HttpException`（以及任何继承自它的异常）之类的内置异常。这些异常被视为正常应用程序流程的一部分，因此不会出现在控制台中。`WsException` 和 `RpcException` 在各自的上下文中也是如此。

`HttpException` 继承自 `IntrinsicException` 类，该类从 `@nestjs/common` 包中导出。内置异常过滤器从不记录 `IntrinsicException` 的实例，它们正是以此区分属于正常运行的异常和不属于正常运行的异常。

若要记录这些异常，请创建一个自定义异常过滤器，如下文 [Exception filters](#异常过滤器) 部分所述。

#### 在生产环境中追踪错误

异常过滤器决定*客户端*看到什么。但它本身并不会告诉你，某个 `TypeError` 十二分钟前开始在 `OrdersService` 中触发，影响了 4% 的结账，且只发生在购物车中包含折扣商品的客户身上。它也不会告诉你究竟是哪一行抛出了错误。

通常的做法是记录堆栈跟踪，事后再去搜索它，但这样做并不够：日志文件中的堆栈跟踪指向的是编译后的输出（`/var/app/current/dist/orders/orders.service.js:35`），不携带源码上下文，也无法告诉你这是第一次出现还是第一万次出现。

[NestJS Observe](https://www.observe.nestjs.com/ 'NestJS Observe') 将未处理的错误视为一等对象，而不是一行日志。每一个到达异常层的错误都会连同引发它的请求一起被捕获，并且：

- **堆栈跟踪附带源代码。** 栈帧会通过你的 source map 解析回 `src/orders/orders.service.ts:35`，并内联显示周围的代码行，因此你无需克隆任何东西，就能在错误卡片中阅读出错的代码。
- **出现次数被分组为缺陷。** 具有相同类和堆栈形态的错误会合并为一个带指纹的分组，其中包含计数、首次出现和最后出现的时间戳，以及引入它的发布版本。"自 v2.4.1 起新增" 是你从页面上直接读到的事实，而不是推断出来的。
- **故障保留其上下文。** 它所属的 trace、触发它的用户、该请求期间写入的日志，以及抛出之前运行的 span 都会一并附上，因此你可以看到请求失败时正在做什么。

<figure><img src="https://www.observe.nestjs.com/docs/telemetry/error-with-source.webp" alt="Error card with source context" /></figure>

因为错误本身已经携带了自己的代码，你可以一键把它交给编码代理：**Copy agent prompt** 会把错误、带有源码行的精简堆栈跟踪、慢 span 以及周围的日志打包成一个自包含的提示词，供 Claude Code、Cursor 或任何其他已打开你仓库的工具使用。

这是对本章所述过滤器的补充，而不是替代：过滤器塑造响应，而插桩记录到达响应之前发生了什么。关于 SDK 捕获的失败相关信息，请参阅 [Error monitoring](/observability/error-monitoring)；关于设置，请参阅 [Observability](/observability/overview) 章节；关于如何把反复出现的错误转化为一个能验证自身修复的受跟踪问题，请参阅 [Dashboard](/observability/dashboard#问题)。

#### 自定义异常

在大多数情况下，你不需要编写自定义异常，可以使用下一节介绍的内置 Nest HTTP 异常。如果你确实需要自定义异常，最佳实践是创建自己的**异常层次结构**，让你的自定义异常继承自基础的 `HttpException` 类。这样 Nest 就能识别你的异常，并自动处理错误响应。让我们实现这样一个自定义异常：

```typescript title="forbidden.exception.ts"
export class ForbiddenException extends HttpException {
  constructor() {
    super('Forbidden', HttpStatus.FORBIDDEN);
  }
}

```

由于 `ForbiddenException` 继承自基础的 `HttpException`，它能与内置的异常处理器协同工作，因此我们可以在 `findAll()` 方法中使用它。

```typescript title="cats.controller.ts"
@Get()
async findAll() {
  throw new ForbiddenException();
}

```

#### 内置 HTTP 异常

Nest 提供了一组继承自基础 `HttpException` 的标准异常。它们从 `@nestjs/common` 包中导出，涵盖了大多数最常见的 HTTP 异常：

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

所有内置异常也都可以通过 `options` 参数提供错误 `cause` 和错误描述：

```typescript
throw new BadRequestException('Something bad happened', {
  cause: new Error(),
  description: 'Some error description',
});

```

响应看起来像这样：

```json
{
  "message": "Something bad happened",
  "error": "Some error description",
  "statusCode": 400
}

```

#### 机器可读的错误代码

异常的 `status` 和 `message` 对人类来说已经足以描述错误，但客户端很难据此进行分支判断。若干不同的失败情形，例如无效的邮箱和弱密码，都可能表现为 `400 Bad Request`，这迫使客户端解析人类可读的消息字符串来区分它们。

为了避免这种情况，可以通过 `options` 参数传入一个 `errorCode`。它是一个稳定的、机器可读的标识符，会被序列化到响应体中：

```typescript
throw new BadRequestException('Password is too weak', {
  errorCode: 'WEAK_PASSWORD',
});

```

此时响应会在常规字段之外携带该代码：

```json
{
  "message": "Password is too weak",
  "errorCode": "WEAK_PASSWORD",
  "statusCode": 400
}

```

`errorCode` 是可选的，并且可以与 `cause` 和 `description` 组合使用。它同样可用于 `HttpException` 本身，因此自定义异常也可以设置它：

```typescript
throw new HttpException(
  'Forbidden',
  HttpStatus.FORBIDDEN,
  { errorCode: 'ACCOUNT_SUSPENDED' },
);

```

> info **提示** 与 `cause` 不同——后者用于日志记录且永远不会被序列化——`errorCode` 是响应体的一部分，旨在供客户端使用。

#### 异常过滤器

内置的异常过滤器会自动处理许多情况，但你可能希望对异常层拥有**完全的控制权**，例如添加日志记录，或根据动态因素使用不同的 JSON 模式。**异常过滤器**正是为此而设计的。它们让你能够控制确切的执行流程，以及返回给客户端的响应内容。

让我们创建一个异常过滤器，用于捕获 `HttpException` 类实例的异常，并为它们实现自定义的响应逻辑。为此，我们需要访问底层平台的 `Request` 和 `Response` 对象。我们将使用 `Request` 对象来提取原始的 `url` 并将其包含在响应中，并使用 `Response` 对象通过 `response.json()` 方法直接控制所发送的响应。

```typescript title="http-exception.filter.ts"
import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();

    response
      .status(status)
      .json({
        statusCode: status,
        timestamp: new Date().toISOString(),
        path: request.url,
      });
  }
}

```

> info **提示** 所有异常过滤器都应实现通用的 `ExceptionFilter<T>` 接口。这要求你提供具有指定签名的 `catch(exception: T, host: ArgumentsHost)` 方法。`T` 表示异常的类型。

> warning **警告** 如果你使用的是 `@nestjs/platform-fastify`，请使用 `response.send()` 而不是 `response.json()`，并从 `fastify` 导入相应的类型。

`@Catch(HttpException)` 装饰器会把所需的元数据绑定到异常过滤器上，告诉 Nest 这个特定的过滤器只查找 `HttpException` 类型的异常，而不处理其他任何异常。`@Catch()` 装饰器接受单个参数或以逗号分隔的列表，这让你可以一次性为多种类型的异常设置过滤器。

#### Arguments host

让我们看看 `catch()` 方法的参数。`exception` 参数是当前正在处理的异常对象。`host` 参数是一个 `ArgumentsHost` 对象，这个工具让你能够访问传递给原始处理程序的参数，无论它是在什么上下文中被调用的。在上面的代码示例中，我们使用它的辅助方法获取异常来源请求的 `Request` 和 `Response` 对象。`ArgumentsHost` 在 [execution context chapter](/fundamentals/execution-context) 中有完整介绍。

之所以采用这种抽象层级，是因为 `ArgumentsHost` 在任何上下文中都能工作：这里使用的 HTTP 服务器上下文，还有微服务和 WebSocket。执行上下文章节展示了如何通过同一个对象为**任何**上下文获取 <a href="/fundamentals/execution-context#host-handler-arguments">底层参数</a>，这让你可以编写一个能在所有这些上下文中通用的异常过滤器。

<app-banner-courses></app-banner-courses>

#### 绑定过滤器

让我们把新的 `HttpExceptionFilter` 绑定到 `CatsController` 的 `create()` 方法上。

```typescript title="cats.controller.ts"
@Post()
@UseFilters(new HttpExceptionFilter())
async create(@Body() createCatDto: CreateCatDto) {
  throw new ForbiddenException();
}

```

> info **提示** `@UseFilters()` 装饰器是从 `@nestjs/common` 包中导入的。

与 `@Catch()` 装饰器类似，`@UseFilters()` 接受单个过滤器实例，或以逗号分隔的过滤器实例列表。这里，我们直接就地创建了 `HttpExceptionFilter` 实例。或者，你也可以传入类（而不是实例），把实例化的工作交给框架，从而启用**依赖注入**。

```typescript title="cats.controller.ts"
@Post()
@UseFilters(HttpExceptionFilter)
async create(@Body() createCatDto: CreateCatDto) {
  throw new ForbiddenException();
}

```

> info **提示** 在可能的情况下，优先按类绑定过滤器，而不是按实例绑定。这样可以减少**内存占用**，因为 Nest 可以在整个模块中复用同一个类的实例。

在上面的示例中，`HttpExceptionFilter` 仅应用于 `create()` 路由处理程序，因此它的作用域是方法级的。异常过滤器可以在不同层级上设置作用域：方法级（控制器、解析器或网关的某个方法）、控制器级或全局级。例如，要设置一个控制器级过滤器，可以这样做：

```typescript title="cats.controller.ts"
@Controller()
@UseFilters(new HttpExceptionFilter())
export class CatsController {}

```

这样就会为 `CatsController` 内部定义的每个路由处理程序设置 `HttpExceptionFilter`。

要创建全局级过滤器，可以这样做：

```typescript title="main.ts"
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

> warning **警告** `useGlobalFilters()` 方法不会为网关或混合应用程序设置过滤器。

全局级过滤器会在整个应用程序中使用，作用于每个控制器和每个路由处理程序。就依赖注入而言，从任何模块外部注册的全局过滤器（使用 `useGlobalFilters()`，如上面的示例所示）无法注入依赖，因为这发生在任何模块的上下文之外。要解决这个问题，你可以使用以下构造方式**直接从任意模块**注册全局级过滤器：

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

> info **提示** 当你使用这种方式为过滤器执行依赖注入时，无论该构造方式用在哪个模块中，该过滤器都是全局的。请把它注册在定义该过滤器（上面示例中的 `HttpExceptionFilter`）的模块中。另外，`useClass` 并不是注册自定义提供者的唯一方式。可以在 [custom providers](/fundamentals/dependency-injection) 中了解更多。

> info **提示** 从 [middleware](/overview/middlewares#错误处理) 中抛出的异常也会由异常层处理。由于中间件在选定路由处理程序之前运行，因此只有**全局**异常过滤器会生效（`app.useGlobalFilters()` 或 `APP_FILTER`）。方法级和控制器级的 `@UseFilters()` 绑定不会被调用。

使用这种技术，你可以通过将每个过滤器添加到 `providers` 数组中来注册任意数量的过滤器。

#### 捕获所有异常

要捕获**所有**未处理的异常，无论其类型如何，请将 `@Catch()` 装饰器的参数列表留空，即 `@Catch()`。

下面的示例与平台无关：它通过 [HTTP adapter](./faq/http-adapter) 传递响应，而不是直接使用平台特定的 `Request` 和 `Response` 对象，因此同一个过滤器可以同时用于 Express 和 Fastify。

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

> warning **警告** 当把捕获所有异常的过滤器与绑定到特定异常类型的过滤器结合使用时，请**先**声明捕获所有异常的过滤器，这样更具体的过滤器仍然可以处理它所绑定的类型。

#### 继承

通常，你会创建完全定制的异常过滤器，以满足应用程序的需求。然而，在某些情况下，你可能希望扩展内置的**全局异常过滤器**，并仅在特定条件下覆盖其行为。

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

> warning **警告** 扩展了 `BaseExceptionFilter` 的方法级和控制器级过滤器不应使用 `new` 来实例化。相反，应让框架自动实例化它们。

全局过滤器**可以**扩展基础过滤器，有两种方式。

第一种是在实例化自定义全局过滤器时，将 `HttpAdapter` 引用传递给构造函数：

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new AllExceptionsFilter(httpAdapter));

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

第二种是使用 `APP_FILTER` 令牌注册该过滤器，<a href="exception-filters#绑定过滤器">如前所述</a>。