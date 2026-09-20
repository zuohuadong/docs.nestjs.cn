<!-- 此文件从 content/controllers.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T07:18:44.451Z -->
<!-- 源文件: content/controllers.md -->
<!-- 源哈希: 6ada402186d839cddd88135ca3795dc9 -->

### 控制器

控制器负责处理传入的**请求**，并向客户端返回**响应**。

<figure><img class="illustrative-image" src="/assets/Controllers_1.png" /></figure>

控制器的目的是处理应用程序的特定请求。**路由**机制决定了哪个控制器将处理每个请求。通常，一个控制器有多个路由，每个路由可以执行不同的操作。

要创建基本控制器，我们使用类和**装饰器**。装饰器将类与必要的元数据关联起来，使 Nest 能够创建将请求连接到相应控制器的路由映射。

> 信息 **提示** 要快速创建带有内置 [validation](/techniques/validation) 的 CRUD 控制器，可以使用 CLI 的 [CRUD generator](/recipes/crud-generator#crud-生成器)：`nest g resource [name]`。

#### 路由

在以下示例中，我们将使用 `@Controller()` 装饰器，它是定义基本控制器**必需**的。我们将指定一个可选的路由路径前缀 `cats`。在 `@Controller()` 装饰器中使用路径前缀有助于我们将相关路由分组，并减少重复代码。例如，如果我们要在 `/cats` 路径下分组管理猫实体交互的路由，可以在 `@Controller()` 装饰器中指定 `cats` 路径前缀。这样，我们就不需要在文件中的每个路由中重复该部分路径。

```typescript title="cats.controller.ts"
import { Controller, Get } from '@nestjs/common';

@Controller('cats')
export class CatsController {
  @Get()
  findAll(): string {
    return 'This action returns all cats';
  }
}

```

> 信息 **提示** 要使用 CLI 创建控制器，只需执行 `$ nest g controller [name]` 命令。

放置在 `findAll()` 方法之前的 `@Get()` HTTP 请求方法装饰器告诉 Nest 为特定端点的 HTTP 请求创建一个处理器。该端点由 HTTP 请求方法（此处为 GET）和路由路径定义。那么，路由路径是什么？处理器的路由路径由控制器声明的（可选）前缀与方法装饰器中指定的任何路径组合而成。由于我们为每个路由设置了前缀（`cats`），并且没有在方法装饰器中添加任何特定路径，Nest 会将 `GET /cats` 请求映射到此处理器。

如前所述，路由路径包括可选的控制器路径前缀**以及**方法装饰器中指定的任何路径字符串。例如，如果控制器前缀是 `cats`，方法装饰器是 `@Get('breed')`，则生成的路由将是 `GET /cats/breed`。

在上面的示例中，当对此端点发出 GET 请求时，Nest 会将请求路由到用户定义的 `findAll()` 方法。请注意，我们在此选择的方法名称完全是任意的。虽然我们必须声明一个方法来绑定路由，但 Nest 不会对方法名称附加任何特定含义。

此方法将返回 200 状态码以及关联的响应，在本例中只是一个字符串。为什么会这样？为了解释，我们首先需要介绍 Nest 使用两种**不同**的选项来处理响应：

<table>
  <tr>
    <td>标准（推荐）</td>
    <td>
      使用这种内置方法，当请求处理器返回 JavaScript 对象或数组时，它将<strong>自动</strong>
      序列化为 JSON。但是，当它返回 JavaScript 原始类型（例如 <code>string</code>、<code>number</code>、<code>boolean</code>）时，Nest 将仅发送值而不尝试序列化。这使得响应处理变得简单：只需返回值，Nest 会处理其余部分。
      <br />
      <br /> 此外，响应的<strong>状态码</strong>默认始终为 200，除了 POST
      请求使用 201。我们可以通过在处理程序级别添加 <code>@HttpCode(...)</code>
      装饰器轻松更改此行为（参见 <a href='controllers#status-code'>状态码</a>）。
    </td>
  </tr>
  <tr>
    <td>库特定</td>
    <td>
      我们可以使用库特定（例如 Express）的 <a href="https://expressjs.com/en/api.html#res" rel="nofollow" target="_blank">响应对象</a>，可以通过在方法处理程序签名中使用 <code>@Res()</code> 装饰器注入（例如 <code>findAll(@Res() response)</code>）。使用这种方法，您可以使用该对象公开的原生响应处理方法。例如，使用 Express，您可以使用类似 <code>response.status(200).send()</code> 的代码构建响应。
    </td>
  </tr>
</table>

> 警告 **警告** Nest 检测到处理程序是否使用了 `@Res()` 或 `@Next()`，表明您选择了库特定的选项。如果同时使用两种方法，标准方法将在此路由上**自动禁用**，并且不再按预期工作。要同时使用两种方法（例如，注入响应对象仅设置 Cookie/标头，但将其余部分留给框架），您必须在 `@Res({ passthrough: true })` 装饰器中将 `passthrough` 选项设置为 `true`。

<app-banner-devtools></app-banner-devtools>

#### 请求对象

处理程序通常需要访问客户端的**请求**详细信息。Nest 提供对底层平台（默认为 Express）的 [request object](https://expressjs.com/en/api.html#req) 的访问。您可以通过在处理程序签名中使用 `@Req()` 装饰器指示 Nest 注入它来访问请求对象。

```typescript title="cats.controller.ts"
import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';

@Controller('cats')
export class CatsController {
  @Get()
  findAll(@Req() request: Request): string {
    return 'This action returns all cats';
  }
}

```

> 信息 **提示** 要利用 `express` 类型（如上面的 `request: Request` 参数示例），请确保安装 `@types/express` 包。

请求对象表示 HTTP 请求，并包含查询字符串、参数、HTTP 标头和正文等属性（阅读更多 [here](https://expressjs.com/en/api.html#req)）。在大多数情况下，您不需要手动访问这些属性。相反，您可以使用诸如 `@Body()` 或 `@Query()` 之类的专用装饰器，这些装饰器开箱即用。以下是提供的装饰器及其对应的平台特定对象的列表。

<table>
  <tbody>
    <tr>
      <td><code>@Request(), @Req()</code></td>
      <td><code>req</code></td></tr>
    <tr>
      <td><code>@Response(), @Res()</code>*<span class="table-code-asterisk"></span></td>
      <td><code>res</code></td>
    </tr>
    <tr>
      <td><code>@Next()</code></td>
      <td><code>next</code></td>
    </tr>
    <tr>
      <td><code>@Session()</code></td>
      <td><code>req.session</code></td>
    </tr>
    <tr>
      <td><code>@Param(key?: string)</code></td>
      <td><code>req.params</code> / <code>req.params[key]</code></td>
    </tr>
    <tr>
      <td><code>@Body(key?: string)</code></td>
      <td><code>req.body</code> / <code>req.body[key]</code></td>
    </tr>
    <tr>
      <td><code>@Query(key?: string)</code></td>
      <td><code>req.query</code> / <code>req.query[key]</code></td>
    </tr>
    <tr>
      <td><code>@Headers(name?: string)</code></td>
      <td><code>req.headers</code> / <code>req.headers[name]</code></td>
    </tr>
    <tr>
      <td><code>@Ip()</code></td>
      <td><code>req.ip</code></td>
    </tr>
    <tr>
      <td><code>@HostParam()</code></td>
      <td><code>req.hosts</code></td>
    </tr>
  </tbody>
</table>

<sup>* </sup>为了与底层 HTTP 平台（例如 Express 和 Fastify）的类型定义保持兼容，Nest 提供了 `@Res()` 和 `@Response()` 装饰器。`@Res()` 只是 `@Response()` 的别名。两者都直接暴露底层原生平台 `response` 对象接口。使用它们时，您还应该导入底层库的类型定义（例如 `@types/express`）以充分利用。请注意，当您在方法处理器中注入 `@Res()` 或 `@Response()` 时，您将该处理器置于 **库特定模式** 下，并且您需要负责管理响应。这样做时，您必须通过对 `response` 对象进行调用来发出某种响应（例如 `res.json(...)` 或 `res.send(...)`），否则 HTTP 服务器将挂起。

`@Body()`、`@Query()`、`@Param()` 和 `@RawBody()` 也可以接受带有 `schema` 和 `pipes` 的选项对象。这使得可以将 [Standard Schema](https://standardschema.dev/) 兼容的模式直接附加到路由参数上，包括使用 Zod、Valibot 和 ArkType 等包创建的模式。

```typescript
@Post()
create(@Body({ schema: createCatSchema }) createCatDto: CreateCatDto) {
  return this.catsService.create(createCatDto);
}

@Get(':id')
findOne(@Param('id', { schema: z.coerce.number().int().positive() }) id: number) {
  return this.catsService.findOne(id);
}

```

要实际验证这些模式，请注册内置的 `StandardSchemaValidationPipe` 或使用您自己的读取 `metadata.schema` 的管道。

> info **提示** 要了解如何创建自己的自定义装饰器，请访问 [this](/custom-decorators) 章节。

#### 资源

之前，我们定义了一个端点来获取 cats 资源（**GET** 路由）。我们通常还需要提供一个创建新记录的端点。为此，让我们创建 **POST** 处理器：

```typescript title="cats.controller.ts"
import { Controller, Get, Post } from '@nestjs/common';

@Controller('cats')
export class CatsController {
  @Post()
  create(): string {
    return 'This action adds a new cat';
  }

  @Get()
  findAll(): string {
    return 'This action returns all cats';
  }
}

```

Nest 为所有标准 HTTP 方法提供了装饰器：`@Get()`、`@Post()`、`@Put()`、`@Delete()`、`@Patch()`、`@Options()`、`@Head()` 和 `@QueryMethod()`（它映射到 `QUERY` 方法，并以此命名以避免与 `@Query()` 参数装饰器冲突）。此外，`@All()` 定义了一个处理所有这些方法的端点。

#### 路由通配符

NestJS 也支持基于模式的路由。例如，星号（`*`）可以用作通配符，以匹配路径末尾路由中的任意字符组合。在以下示例中，`findAll()` 方法将针对任何以 `abcd/` 开头的路由执行，无论后面跟有多少个字符。

```typescript
@Get('abcd/*')
findAll() {
  return 'This route uses a wildcard';
}

```

`'abcd/*'` 路由路径将匹配 `abcd/`、`abcd/123`、`abcd/abc` 等。连字符（`-`）和点号（`.`）在基于字符串的路径中被按字面意义解释。

这种方法在 Express 和 Fastify 上都有效。然而，Express v5 使路由系统更加严格。在纯 Express 中，您必须使用命名通配符才能使路由生效 - 例如，`abcd/*splat`，其中 `splat` 只是通配符参数的名称，没有特殊含义。您可以随意命名。话虽如此，由于 Nest 为 Express 提供了兼容层，您仍然可以使用星号（`*`）作为通配符。

当涉及到在路由**中间**使用星号时，Express 要求使用命名通配符（例如 `ab{*splat&#125;cd`），而 Fastify 完全不支持它们。

#### 路由冲突与解析顺序

Nest 按声明顺序注册路由。在顺序敏感的适配器上 - 默认的 Express 适配器就是其中之一 - 这意味着参数化路由可能会静默地遮蔽更具体的路由：

```typescript
@Controller('users')
export class UsersController {
  @Get(':id')
  findOne() {}

  @Get('me') // never reached: `:id` matches "me" first
  findMe() {}
}

```

这很容易被忽略，因为应用程序启动时不会发出警告，问题只会在运行时出现，当请求被分发到错误的处理器时。诸如 `ParseIntPipe` 之类的管道在这里没有帮助 - 路由在任何管道运行*之前*就选择了处理器。

NestJS v12 在 `NestApplicationOptions` 上添加了两个可选选项来防止这种情况。两者都默认保持之前的行为，因此除非您设置它们，否则现有应用程序不受影响。

**`routeConflictPolicy`** 启用了启动时诊断。它接受每种类型的严重级别：`'off'`、`'warn'` 或 `'error'`：

```typescript
const app = await NestFactory.create(AppModule, {
  routeConflictPolicy: { duplicate: 'error', shadow: 'warn' },
});

```

<table>
  <tr>
    <td><code>重复</code></td>
    <td>两个路由共享相同的方法、路径、主机和版本。</td>
  </tr>
  <tr>
    <td><code>遮蔽</code></td>
    <td>两个路由模式可以匹配同一个请求，例如 <code>/users/me</code> 和 <code>/users/:id</code>。</td>
  </tr>
</table>

使用 `'error'` 时，每一对违规路由都会被聚合到单个在 `app.listen()` 期间抛出的 `RouteConflictException` 中，因此您可以一次性看到所有问题，而不是每次重启只看到一个。

**`routeResolutionStrategy`** 控制注册顺序。将其设置为 `'specificity'` 会首先注册最具体的路由 - 字面量段优先于参数段，参数段优先于通配符 - 因此上面的示例无论声明顺序如何都能正常工作：

```typescript
const app = await NestFactory.create(AppModule, {
  routeResolutionStrategy: 'specificity',
});

```

默认值为 `'declaration'`，它保留了之前的行为。

> info **提示** 这些选项仅在注册顺序影响匹配的适配器上才有意义。`ExpressAdapter` 是顺序敏感的；`FastifyAdapter` 不是，因为 `find-my-way` 已经按特异性对路由进行了排序。在 Fastify 上，`shadow` 策略是无效操作，`'specificity'` 排序没有效果，而 `duplicate` 策略在两者上都得到支持。`RouteConflictPolicy`、`RouteConflictPolicyLevel` 和 `RouteResolutionStrategy` 类型从 `@nestjs/common` 导出。

#### 状态码

如前所述，响应的默认**状态码**始终为 **200**，但 POST 请求除外，其默认为 **201**。您可以通过在处理器级别使用 `@HttpCode(...)` 装饰器轻松更改此行为。

```typescript
@Post()
@HttpCode(204)
create() {
  return 'This action adds a new cat';
}

```

> info **提示** 从 `@nestjs/common` 包中导入 `HttpCode`。

通常，您的状态码不是静态的，而是取决于各种因素。在这种情况下，您可以使用库特定的**响应**（使用 `@Res()` 注入）对象（或者在出错时抛出异常）。

#### 响应头

要指定自定义响应头，您可以使用 `@Header()` 装饰器或库特定的响应对象（并直接调用 `res.header()`）。

```typescript
@Post()
@Header('Cache-Control', 'no-store')
create() {
  return 'This action adds a new cat';
}

```

> info **提示** 从 `@nestjs/common` 包中导入 `Header`。

#### 重定向

要将响应重定向到特定 URL，您可以使用 `@Redirect()` 装饰器或库特定的响应对象（并直接调用 `res.redirect()`）。

`@Redirect()` 接受两个参数，`url` 和 `statusCode`，两者都是可选的。如果省略，`statusCode` 的默认值为 `302`（`Found`）。

```typescript
@Get()
@Redirect('https://nestjs.com', 301)

```

> info **提示** 有时您可能希望动态确定 HTTP 状态码或重定向 URL。可以通过返回遵循 `HttpRedirectResponse` 接口（来自 `@nestjs/common`）的对象来实现。

返回的值将覆盖传递给 `@Redirect()` 装饰器的任何参数。例如：

```typescript
@Get('docs')
@Redirect('./', 302)
getDocs(@Query('version') version) {
  if (version && version === '5') {
    return { url: '/v5/' };
  }
}

```

#### 路由参数

当您需要接受请求中的**动态数据**时（例如，`GET /cats/1` 获取 id 为 `1` 的猫），静态路径的路由将无法工作。要定义带参数的路由，您可以在路由路径中添加路由参数**令牌**来从 URL 中捕获动态值。下面 `@Get()` 装饰器示例中的路由参数令牌说明了这种方法。然后可以使用 `@Param()` 装饰器访问这些路由参数，该装饰器应添加到方法签名中。

> info **提示** 带参数的路由应声明在任何静态路径之后，这样参数化路径就不会拦截指向静态路径的流量。有关在启动时检测此问题或为您解决的选项，请参阅 [Route conflicts and resolution order](/overview/controllers#route-conflicts-and-resolution-order)。

```typescript
@Get(':id')
findOne(@Param() params: any): string {
  console.log(params.id);
  return `This action returns a #${params.id} cat`;
}

```

`@Param()` 装饰器用于装饰方法参数（在上面的示例中为 `params`），使**路由**参数在方法内部作为该装饰方法参数的属性可访问。如代码所示，您可以通过引用 `params.id` 来访问 `id` 参数。或者，您可以将特定的参数令牌传递给装饰器，并在方法体内直接按名称引用路由参数。

> info **提示** 从 `@nestjs/common` 包中导入 `Param`。

```typescript
@Get(':id')
findOne(@Param('id') id: string): string {
  return `This action returns a #${id} cat`;
}

```

#### 子域路由

`@Controller` 装饰器可以接受 `host` 选项，要求传入请求的 HTTP 主机匹配某个特定值。

```typescript title="admin.controller.ts"
@Controller({ host: 'admin.example.com' })
export class AdminController {
  @Get()
  index(): string {
    return 'Admin page';
  }
}

```

> warning **警告** 由于 **Fastify** 不支持嵌套路由器，如果您使用子域路由，建议改用默认的 Express 适配器。

与路由 `path` 类似，`host` 选项可以使用令牌来捕获主机名中该位置的动态值。下面 `@Controller()` 装饰器示例中的主机参数令牌演示了这种用法。以这种方式声明的主机参数可以使用 `@HostParam()` 装饰器访问，该装饰器应添加到方法签名中。

```typescript title="account.controller.ts"
@Controller({ host: ':account.example.com' })
export class AccountController {
  @Get()
  getInfo(@HostParam('account') account: string) {
    return account;
  }
}

```

#### 状态共享

对于来自其他编程语言的开发人员来说，了解到在 Nest 中几乎所有内容都在传入请求之间共享可能会感到惊讶。这包括数据库连接池、具有全局状态的单例服务等资源。重要的是要理解 Node.js 不使用请求/响应多线程无状态模型，即每个请求由单独的线程处理。因此，在 Nest 中使用单例实例对我们的应用程序来说是完全**安全**的。

话虽如此，在某些特定的边缘情况下，为控制器设置基于请求的生命周期可能是必要的。示例包括 GraphQL 应用中的每请求缓存、请求跟踪或实现多租户。您可以了解更多关于控制注入作用域的信息 [here](/fundamentals/provider-scopes)。

#### 异步性

我们热爱现代 JavaScript，尤其是它对**异步**数据处理的重视。这就是为什么 Nest 完全支持 `async` 函数。每个 `async` 函数必须返回一个 `Promise`，这允许您返回一个 Nest 可以自动解析的延迟值。以下是一个示例：

```typescript title="cats.controller.ts"
@Get()
async findAll(): Promise<any[]> {
  return [];
}

```

这段代码完全有效。但 Nest 更进一步，允许路由处理器也返回 RxJS [observable streams](https://rxjs-dev.firebaseapp.com/guide/observable)。Nest 将在内部处理订阅，并在流完成时解析最终发出的值。

```typescript title="cats.controller.ts"
@Get()
findAll(): Observable<any[]> {
  return of([]);
}

```

这两种方法都是有效的，您可以选择最适合您需求的一种。

#### 请求负载

在我们之前的示例中，POST 路由处理器没有接受任何客户端参数。让我们通过添加 `@Body()` 装饰器来解决这个问题。

在我们继续之前（如果您使用 TypeScript），我们需要定义 **DTO**（数据传输对象）模式。DTO 是一个对象，用于指定数据应如何通过网络传输。我们可以使用 **TypeScript** 接口或简单类来定义 DTO 模式。然而，我们在这里推荐使用 **类**。为什么？因为类是 JavaScript ES6 标准的一部分，因此它们在编译后的 JavaScript 中作为真实实体保持不变。相比之下，TypeScript 接口在转译过程中会被移除，这意味着 Nest 在运行时无法引用它们。这一点很重要，因为像 **管道** 这样的功能依赖于在运行时访问变量的元类型，而这只有通过类才能实现。

让我们创建 `CreateCatDto` 类：

```typescript title="create-cat.dto.ts"
export class CreateCatDto {
  name: string;
  age: number;
  breed: string;
}

```

它只有三个基本属性。我们现在可以在 `CatsController` 内部使用新创建的 DTO：

```typescript title="cats.controller.ts"
@Post()
async create(@Body() createCatDto: CreateCatDto) {
  return 'This action adds a new cat';
}

```

> info **提示** 我们的 `ValidationPipe` 可以过滤掉不应由方法处理器接收的属性。在这种情况下，我们可以将可接受的属性列入白名单，任何不在白名单中的属性都会自动从结果对象中剥离。在 `CreateCatDto` 示例中，我们的白名单是 `name`、`age` 和 `breed` 属性。了解更多 [here](/techniques/validation#剥离属性)。

#### 查询参数

在处理路由中的查询参数时，您可以使用 `@Query()` 装饰器从传入请求中提取它们。让我们看看这在实践中是如何工作的。

考虑一个路由，我们希望根据查询参数（如 `age` 和 `breed`）过滤猫的列表。首先，在 `CatsController` 中定义查询参数：

```typescript title="cats.controller.ts"
@Get()
async findAll(@Query('age') age: number, @Query('breed') breed: string) {
  return `This action returns all cats filtered by age: ${age} and breed: ${breed}`;
}

```

在此示例中，`@Query()` 装饰器用于从查询字符串中提取 `age` 和 `breed` 的值。例如，对以下请求：

```plaintext
GET /cats?age=2&breed=Persian

```

将导致 `age` 为 `2`，`breed` 为 `Persian`。

如果您的应用程序需要处理更复杂的查询参数，例如嵌套对象或数组：

```plaintext
?filter[where][name]=John&filter[where][age]=30
?item[]=1&item[]=2

```

您需要配置您的 HTTP 适配器（Express 或 Fastify）以使用适当的查询解析器。在 Express 中，您可以使用 `extended` 解析器，它支持丰富的查询对象：

```typescript title="main.ts"
const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.set('query parser', 'extended');

```

在 Fastify 中，您可以使用 `querystringParser` 选项：

```typescript title="main.ts"
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({
    querystringParser: (str) => qs.parse(str),
  }),
);

```

> info **提示** `qs` 是一个支持嵌套和数组的查询字符串解析器。您可以使用 `npm install qs` 安装它。

#### 处理错误

有一个单独的章节介绍错误处理（即处理异常）[here](/overview/exception-filters)。

#### 在生产环境中观察路由

一个在您的机器上表现完美的控制器，在真实流量下可能会有截然不同的表现。生产环境中出现的问题从来不是“这个路由是否工作？”而是“为什么 `GET /cats/:id` 在周二部署后从 40 毫秒变成了 900 毫秒，这是每个请求还是某个不幸的租户？”

路由处理器是回答这个问题的自然单元，而 [NestJS Observe](https://www.observe.nestjs.com/ 'NestJS Observe') 正是针对这个单元进行报告。因为 `@nestjs/observe` SDK 钩入 Nest 自身的请求生命周期，而不是包装 HTTP 服务器，所以每个测量值都带有您声明的路由模式标签——`GET /cats/:id`，而不是 10,000 个不同的 URL——因此一个路由就是一行，您可以排序、绘制图表和设置警报：

```typescript
const app = await NestFactory.create(AppModule, {
  instrument: ObserveInstrument,
});

```

这就是整个集成。从那里，一个慢路由只需三步：按 p95 排序路由列表，打开操作以查看回归是持续的还是突发的，以及它是否在发布时开始，然后打开一次慢执行并阅读其瀑布图——哪个控制器、哪个服务方法、哪个查询占用了时间。时间按 **类和方法** 归因，所有等待的内容都被减去，因此 `CatsService.findOne()` 自身占用 800 毫秒与 `CatsService.findOne()` 在数据库上等待 800 毫秒可以立即区分开来。

请参阅 [Observability](/observability/overview) 章节进行设置，以及 [Dashboard](/observability/dashboard) 了解从警报到单个请求的完整流程。

#### 完整资源示例

下面是一个示例，演示了使用几个可用的装饰器来创建一个基本控制器。该控制器提供了几个方法来访问和操作内部数据。

```typescript title="cats.controller.ts"
import { Controller, Get, Query, Post, Body, Put, Param, Delete } from '@nestjs/common';
import { CreateCatDto, UpdateCatDto, ListAllEntities } from './dto.js';

@Controller('cats')
export class CatsController {
  @Post()
  create(@Body() createCatDto: CreateCatDto) {
    return 'This action adds a new cat';
  }

  @Get()
  findAll(@Query() query: ListAllEntities) {
    return `This action returns all cats (limit: ${query.limit} items)`;
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return `This action returns a #${id} cat`;
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateCatDto: UpdateCatDto) {
    return `This action updates a #${id} cat`;
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return `This action removes a #${id} cat`;
  }
}

```

> info **提示** Nest CLI 提供了一个生成器（schematic），可以自动创建 **所有样板代码**，让您免于手动操作，并改善整体开发体验。了解更多此功能 [here](/recipes/crud-generator)。

#### 启动运行

即使 `CatsController` 已完全定义，Nest 还不知道它，也不会自动创建该类的实例。

控制器必须始终是模块的一部分，这就是为什么我们在 `@Module()` 装饰器中包含 `controllers` 数组。由于除了根 `AppModule` 之外我们还没有定义任何其他模块，我们将使用它来注册 `CatsController`：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { CatsController } from './cats/cats.controller.js';

@Module({
  controllers: [CatsController],
})
export class AppModule {}

```

我们使用 `@Module()` 装饰器将元数据附加到模块类，现在 Nest 可以轻松确定需要挂载哪些控制器。

#### 库特定方法

到目前为止，我们已经介绍了标准的 Nest 操作响应方式。另一种方法是使用库特定的 [response object](https://expressjs.com/en/api.html#res)。要注入特定的响应对象，我们可以使用 `@Res()` 装饰器。为了突出差异，让我们重写 `CatsController` 如下：

```typescript
import { Controller, Get, Post, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

@Controller('cats')
export class CatsController {
  @Post()
  create(@Res() res: Response) {
    res.status(HttpStatus.CREATED).send();
  }

  @Get()
  findAll(@Res() res: Response) {
     res.status(HttpStatus.OK).json([]);
  }
}

```

虽然这种方法有效，并且通过完全控制响应对象（例如操作头部和访问库特定功能）提供了更大的灵活性，但应谨慎使用。一般来说，这种方法不够清晰，并且存在一些缺点。主要缺点是您的代码会变得依赖于平台，因为不同的底层库可能对响应对象有不同的 API。此外，它会使测试更具挑战性，因为您需要模拟响应对象等。

此外，使用这种方法，您将失去与依赖标准响应处理的 Nest 功能的兼容性，例如拦截器以及 `@HttpCode()` / `@Header()` 装饰器。为了解决这个问题，您可以像这样启用 `passthrough` 选项：

```typescript
@Get()
findAll(@Res({ passthrough: true }) res: Response) {
  res.status(HttpStatus.OK);
  return [];
}

```

使用这种方法，您可以与原生响应对象进行交互（例如，根据特定条件设置 Cookie 或头部），同时仍然允许框架处理其余部分。