<!-- 此文件从 content/exception-filters.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T07:39:16.726Z -->
<!-- 源文件: content/exception-filters.md -->
<!-- 源哈希: a556a5b22d7fe572f4c3859db21ecbd5 -->

### 异常过滤器

Nest 内置了一个**异常层**，负责处理整个应用中所有未处理的异常。当应用代码未处理某个异常时，该异常会被此层捕获，然后自动发送一个适当的、用户友好的响应。

<figure>
  <img class="illustrative-image" src="/assets/Filter_1.png" />
</figure>

默认情况下，此操作由内置的**全局异常过滤器**执行，它处理类型为 `HttpException`（及其子类）的异常。当异常**无法识别**（既不是 `HttpException`，也不是继承自 `HttpException` 的类）时，内置异常过滤器会生成以下默认的 JSON 响应：

```json
{
  "statusCode": 500,
  "message": "Internal server error"
}

```

> info **提示** 全局异常过滤器部分支持 `http-errors` 库。基本上，任何包含 `statusCode` 和 `message` 属性的抛出异常都会被正确填充并作为响应发送回去（而不是对无法识别的异常使用默认的 `InternalServerErrorException`）。

#### 抛出标准异常

Nest 提供了一个内置的 `HttpException` 类，从 `@nestjs/common` 包中导出。对于典型的基于 HTTP REST/GraphQL API 的应用程序，最佳实践是在某些错误条件发生时发送标准的 HTTP 响应对象。

例如，在 `CatsController` 中，我们有一个 `findAll()` 方法（一个 `GET` 路由处理器）。假设此路由处理器因某种原因抛出异常。为了演示，我们将其硬编码如下：

```typescript title="cats.controller.ts"
@Get()
async findAll() {
  throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
}

```

> info **提示** 我们在这里使用了 `HttpStatus`。这是从 `@nestjs/common` 包导入的辅助枚举。

当客户端调用此端点时，响应如下所示：

```json
{
  "statusCode": 403,
  "message": "Forbidden"
}

```

`HttpException` 构造函数接受两个必需参数，用于确定响应：

- `response` 参数定义 JSON 响应体。它可以是一个 `string` 或一个 `object`，如下所述。
- `status` 参数定义 [HTTP status code](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)。

默认情况下，JSON 响应体包含两个属性：

- `statusCode`：默认为 `status` 参数中提供的 HTTP 状态码
- `message`：基于 `status` 的 HTTP 错误的简短描述

要仅覆盖 JSON 响应体中的消息部分，请在 `response` 参数中提供一个字符串。要覆盖整个 JSON 响应体，请在 `response` 参数中传递一个对象。Nest 将序列化该对象并将其作为 JSON 响应体返回。

第二个构造函数参数 - `status` - 应为有效的 HTTP 状态码。最佳实践是使用从 `@nestjs/common` 导入的 `HttpStatus` 枚举。

还有**第三个**构造函数参数（可选）- `options` - 可用于提供错误 [cause](https://nodejs.org/en/blog/release/v16.9.0/#error-cause)。此 `cause` 对象不会被序列化到响应对象中，但它对于日志记录目的很有用，提供有关导致 `HttpException` 被抛出的内部错误的有价值信息。

以下是一个覆盖整个响应体并提供错误原因的示例：

```typescript title="cats.controller.ts"
@Get()
async findAll() {
  try {
    await this.service.findAll()
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

使用上述代码，响应将如下所示：

```json
{
  "status": 403,
  "error": "This is a custom message"
}

```

#### 异常日志记录

默认情况下，异常过滤器不会记录内置异常，如 `HttpException`（以及任何继承自它的异常）。当这些异常被抛出时，它们不会出现在控制台中，因为它们被视为正常应用程序流程的一部分。相同的行为也适用于其他内置异常，如 `WsException` 和 `RpcException`。

这些异常都继承自基础 `IntrinsicException` 类，该类从 `@nestjs/common` 包中导出。此类有助于区分属于正常应用程序操作的异常和不属于正常操作的异常。

如果您想记录这些异常，可以创建自定义异常过滤器。我们将在下面的 [Exception filters](#异常过滤器) 部分中解释如何执行此操作。

#### 在生产环境中追踪错误

过滤器决定*客户端*看到什么。它本身不会告诉您 `TypeError` 在十二分钟前开始在 `OrdersService` 中触发，发生在 4% 的结账中，仅针对购物车中包含折扣商品的客户——而且它肯定不会告诉您是哪一行抛出的。

通常的答案是记录堆栈跟踪，并希望有人稍后 grep 它。但这很快就会失效：日志文件中的堆栈跟踪指向编译后的输出（`/var/app/current/dist/orders/orders.service.js:35`），不携带源代码上下文，并且无法让您知道这是第一次出现还是第一万次出现。

[NestJS Observe](https://www.observe.nestjs.com/ 'NestJS Observe') 将未处理的错误视为一等对象，而不是日志行。到达异常层的每个错误都会连同导致它的请求一起被捕获，并且：

- **堆栈跟踪附带源代码。** 帧通过您的源映射解析回 `src/orders/orders.service.ts:35`，并且周围的代码行会内联显示——您可以在错误卡片中直接阅读出错的代码，无需克隆任何内容。
- **出现次数被分组为缺陷。** 具有相同类和堆栈形状的错误会合并为一个带指纹的组，包含计数、首次和最后一次出现的时间戳，以及引入它的发布版本。"自 v2.4.1 起新增"是您可以直接从页面读取的事实，而不是推断出来的。
- **失败保留其上下文。** 它所属的追踪、遇到它的用户、在该请求期间写入的日志，以及在抛出之前运行的跨度都会附加在一起，因此您可以看到请求在中断时正在做什么。

<figure><img src="https://www.observe.nestjs.com/docs/telemetry/error-with-source.webp" alt="Error card with source context" /></figure>

由于错误本身已经携带了代码，一键即可将整个问题交给编码代理：**复制代理提示词**会将错误、带有源代码行的精简堆栈跟踪、慢跨度以及周围的日志打包成一个自包含的提示词，供 Claude Code、Cursor 或任何打开您仓库的工具使用。

请注意，这与本章中描述的过滤器是互补关系，而非替代关系——过滤器仍然塑造响应，而插桩则观察在到达响应过程中发生了什么。有关设置，请参阅 [Observability](/observability/overview) 章节；有关将重复出现的错误转化为可验证自身修复的跟踪问题，请参阅 [Dashboard](/observability/dashboard#问题)。

#### 自定义异常

在许多情况下，您不需要编写自定义异常，可以直接使用内置的 Nest HTTP 异常，如下一节所述。如果您确实需要创建自定义异常，最佳实践是创建您自己的**异常层次结构**，让您的自定义异常继承自基础的 `HttpException` 类。通过这种方法，Nest 将识别您的异常，并自动处理错误响应。让我们实现这样一个自定义异常：

```typescript title="forbidden.exception.ts"
export class ForbiddenException extends HttpException {
  constructor() {
    super('Forbidden', HttpStatus.FORBIDDEN);
  }
}

```

由于 `ForbiddenException` 继承了基础的 `HttpException`，它将与内置异常处理器无缝协作，因此我们可以在 `findAll()` 方法中使用它。

```typescript title="cats.controller.ts"
@Get()
async findAll() {
  throw new ForbiddenException();
}

```

#### 内置 HTTP 异常

Nest 提供了一组继承自基础 `HttpException` 的标准异常。这些异常从 `@nestjs/common` 包中导出，代表了大多数常见的 HTTP 异常：

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
- `BadGatewayException`
- `ServiceUnavailableException`
- `GatewayTimeoutException`
- `PreconditionFailedException`

所有内置异常也可以通过 `options` 参数同时提供错误 `cause` 和错误描述：

```typescript
throw new BadRequestException('Something bad happened', {
  cause: new Error(),
  description: 'Some error description',
});

```

使用上述代码，响应将如下所示：

```json
{
  "message": "Something bad happened",
  "error": "Some error description",
  "statusCode": 400
}

```

#### 机器可读的错误代码

异常的 `status` 和 `message` 对人类来说足以描述错误，但客户端难以据此进行分支判断。几种不同的失败——例如无效的电子邮件、弱密码——都可能表现为 `400 Bad Request`，这迫使客户端解析人类可读的消息字符串来区分它们。

为避免这种情况，可以通过 `options` 参数传递一个 `errorCode`。它是一个稳定的、机器可读的标识符，会被序列化到响应体中：

```typescript
throw new BadRequestException('Password is too weak', {
  errorCode: 'WEAK_PASSWORD',
});

```

响应随后会携带该代码以及常规字段：

```json
{
  "message": "Password is too weak",
  "errorCode": "WEAK_PASSWORD",
  "statusCode": 400
}

```

`errorCode` 是可选的，可以与 `cause` 和 `description` 组合使用。它也可用于 `HttpException` 本身，因此自定义异常也可以设置它：

```typescript
throw new HttpException(
  'Forbidden',
  HttpStatus.FORBIDDEN,
  { errorCode: 'ACCOUNT_SUSPENDED' },
);

```

> info **提示** 与用于日志记录且永远不会被序列化的 `cause` 不同，`errorCode` 是响应体的一部分，旨在供客户端消费。

#### 异常过滤器

虽然基础的（内置）异常过滤器可以自动为您处理许多情况，但您可能希望**完全控制**异常层。例如，您可能希望添加日志记录，或根据某些动态因素使用不同的 JSON 模式。**异常过滤器**正是为此目的而设计的。它们让您控制精确的控制流以及发送回客户端的响应内容。

让我们创建一个异常过滤器，负责捕获 `HttpException` 类的实例异常，并为它们实现自定义响应逻辑。为此，我们需要访问底层平台的 `Request` 和 `Response` 对象。我们将访问 `Request` 对象以提取原始的 `url` 并将其包含在日志信息中。我们将使用 `Response` 对象通过 `response.json()` 方法直接控制发送的响应。

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

> info **提示** 所有异常过滤器都应实现通用的 `ExceptionFilter<T>` 接口。这要求您提供具有指定签名的 `catch(exception: T, host: ArgumentsHost)` 方法。`T` 表示异常的类型。

> warning **警告** 如果您使用 `@nestjs/platform-fastify`，可以使用 `response.send()` 代替 `response.json()`。不要忘记从 `fastify` 导入正确的类型。

`@Catch(HttpException)` 装饰器将所需的元数据绑定到异常过滤器，告知 Nest 该特定过滤器只查找 `HttpException` 类型的异常，而不查找其他类型。`@Catch()` 装饰器可以接受单个参数或逗号分隔的列表。这使您可以同时为多种类型的异常设置过滤器。

#### 参数主机

让我们看一下 `catch()` 方法的参数。`exception` 参数是当前正在处理的异常对象。`host` 参数是一个 `ArgumentsHost` 对象——一个实用工具，让您可以访问传递给原始处理器的参数，无论它在什么上下文中被调用。在上面的代码示例中，我们使用其辅助方法获取异常源自的请求所属的 `Request` 和 `Response` 对象。`ArgumentsHost` 在 [execution context chapter](/fundamentals/execution-context) 中有完整介绍。

这种抽象级别的原因是 `ArgumentsHost` 适用于所有上下文——不仅是我们这里使用的 HTTP 服务器上下文，还包括微服务和 WebSockets。执行上下文章节展示了如何通过同一个对象访问**任何**上下文中的<a href="/fundamentals/execution-context#host-handler-arguments">底层参数</a>，这正是让您能够编写一个在所有上下文中都能运行的单一异常过滤器的原因。

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

> info **提示** `@UseFilters()` 装饰器从 `@nestjs/common` 包中导入。

我们在这里使用了 `@UseFilters()` 装饰器。与 `@Catch()` 装饰器类似，它可以接受单个过滤器实例，或逗号分隔的过滤器实例列表。在这里，我们直接创建了 `HttpExceptionFilter` 的实例。或者，您可以传递类（而不是实例），将实例化的责任留给框架，并启用**依赖注入**。

```typescript title="cats.controller.ts"
@Post()
@UseFilters(HttpExceptionFilter)
async create(@Body() createCatDto: CreateCatDto) {
  throw new ForbiddenException();
}

```

> info **提示** 尽可能使用类而不是实例来应用过滤器。这可以减少**内存使用**，因为 Nest 可以在整个模块中轻松重用同一类的实例。

在上面的示例中，`HttpExceptionFilter` 仅应用于单个 `create()` 路由处理器，使其成为方法作用域。异常过滤器可以在不同级别上设置作用域：控制器/解析器/网关的方法作用域、控制器作用域或全局作用域。

例如，要将过滤器设置为控制器作用域，您可以执行以下操作：

```typescript title="cats.controller.ts"
@Controller()
@UseFilters(new HttpExceptionFilter())
export class CatsController {}

```

此构造为 `CatsController` 内定义的每个路由处理器设置了 `HttpExceptionFilter`。

要创建全局作用域的过滤器，您可以执行以下操作：

```typescript title="main.ts"
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

> warning **警告** `useGlobalFilters()` 方法不会为网关或混合应用程序设置过滤器。

全局作用域的过滤器用于整个应用程序，适用于每个控制器和每个路由处理器。在依赖注入方面，从任何模块外部注册的全局过滤器（如上面的示例中使用 `useGlobalFilters()`）无法注入依赖项，因为这是在模块上下文之外完成的。为了解决这个问题，您可以使用以下构造**直接从任何模块**注册全局作用域的过滤器：

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

> info **提示** 使用此方法为过滤器执行依赖注入时，请注意，无论此构造在哪个模块中使用，过滤器实际上是全局的。应该在哪里执行此操作？选择定义过滤器（上面的示例中的 `HttpExceptionFilter`）的模块。此外，`useClass` 并不是处理自定义提供者注册的唯一方法。了解更多 [here](/fundamentals/dependency-injection)。

> info **提示** 从 [middleware](/overview/middlewares#错误处理) 抛出的异常也会由异常层处理。因为中间件在路由处理器被选择之前运行，所以只有**全局**异常过滤器适用（`app.useGlobalFilters()` 或 `APP_FILTER`）。方法作用域和控制器作用域的 `@UseFilters()` 绑定不会被调用。

您可以根据需要添加任意数量的过滤器；只需将每个过滤器添加到 providers 数组中即可。

#### 捕获所有异常

为了捕获**所有**未处理的异常（无论异常类型如何），请将 `@Catch()` 装饰器的参数列表留空，例如 `@Catch()`。

下面的示例与平台无关：它通过 [HTTP adapter](./faq/http-adapter) 传递响应，而不是直接接触特定于平台的 `Request` 和 `Response` 对象，因此相同的过滤器可以在 Express 和 Fastify 上工作。

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
    // constructor method, thus we should resolve it here.
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

> warning **警告** 当将捕获所有异常的过滤器与绑定到特定异常类型的过滤器结合使用时，请**首先**声明捕获所有异常的过滤器，以便更具体的过滤器仍然可以处理其绑定的类型。

#### 继承

通常，您会创建完全定制的异常过滤器以满足应用程序的需求。然而，在某些情况下，您可能更希望扩展内置的**全局异常过滤器**，并仅在某些条件下覆盖其行为。

为了将异常处理委托给基础过滤器，您需要扩展 `BaseExceptionFilter` 并调用继承的 `catch()` 方法。

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

> warning **警告** 扩展 `BaseExceptionFilter` 的方法作用域和控制器作用域的过滤器不应使用 `new` 实例化。相反，让框架自动实例化它们。

全局过滤器**可以**扩展基础过滤器。这可以通过两种方式之一完成。

第一种方法是在实例化自定义全局过滤器时注入 `HttpAdapter` 引用：

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new AllExceptionsFilter(httpAdapter));

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

```

第二种方法是使用 `APP_FILTER` 令牌 <a href="exception-filters#绑定过滤器">如下所示</a>。