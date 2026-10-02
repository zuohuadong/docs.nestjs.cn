### 控制器

控制器负责处理传入的 **请求** 并将 **响应** 发送回客户端。

<figure><img class="illustrative-image" src="/assets/Controllers_1.png" /></figure>

控制器的目的是处理应用程序的特定请求。**路由** 机制决定哪个控制器将处理每个请求。通常，一个控制器有多个路由，每个路由可以执行不同的操作。

要创建基本控制器，我们使用类和 **装饰器**。装饰器将类与必要的元数据链接起来，允许 Nest 创建一个将请求连接到相应控制器的路由映射。

:::info 提示
要快速创建带有内置 [验证](/techniques/validation) 的 CRUD 控制器，您可以使用 CLI 的 [CRUD 生成器](/recipes/crud-generator#crud-生成器)：`nest g resource [name]`。
:::

#### 路由

在下面的示例中，我们将使用 `@Controller()` 装饰器，这是定义基本控制器 **必需** 的。我们将指定一个可选的路由路径前缀 `cats`。在 `@Controller()` 装饰器中使用路径前缀有助于我们将相关路由组合在一起并减少重复代码。例如，如果我们想将管理与猫实体交互的路由组合在 `/cats` 路径下，我们可以在 `@Controller()` 装饰器中指定 `cats` 路径前缀。这样，我们就不需要为文件中的每个路由重复该路径部分。

```typescript
import { Controller, Get } from '@nestjs/common';

@Controller('cats')
export class CatsController {
  @Get()
  findAll(): string {
    return 'This action returns all cats';
  }
}

@Controller('cats')
export class CatsController {
  @Get()
  findAll() {
    return 'This action returns all cats';
  }
}

```

:::info 提示
要使用 CLI 创建控制器，只需执行 `$ nest g controller [name]` 命令。
:::

放在 `findAll()` 方法之前的 `@Get()` HTTP 请求方法装饰器告诉 Nest 为 HTTP 请求的特定端点创建处理程序。此端点由 HTTP 请求方法（本例中为 GET）和路由路径定义。那么，什么是路由路径？处理程序的路由路径是通过将为控制器声明的（可选）前缀与方法装饰器中指定的任何路径组合来确定的。由于我们为每个路由设置了前缀（`cats`），并且没有在方法装饰器中添加任何特定路径，Nest 将把 `GET /cats` 请求映射到这个处理程序。

如前所述，路由路径包括可选的控制器路径前缀 **和** 方法装饰器中指定的任何路径字符串。例如，如果控制器前缀是 `cats`，方法装饰器是 `@Get('breed')`，则生成的路由将是 `GET /cats/breed`。

在我们上面的示例中，当对该端点发出 GET 请求时，Nest 会将请求路由到用户定义的 `findAll()` 方法。请注意，我们在这里选择的方法名称完全是任意的。虽然我们必须声明一个方法来绑定路由，但 Nest 不会对方法名称附加任何特定意义。

此方法将返回 200 状态码以及相关的响应，在这种情况下只是一个字符串。为什么会发生这种情况？要解释这一点，我们首先需要介绍 Nest 使用两种 **不同** 选项来操作响应的概念：

<table>
  <tr>
    <td>标准（推荐）</td>
    <td>
      使用这种内置方法，当请求处理程序返回 JavaScript 对象或数组时，它将 <strong>自动</strong>
      被序列化为 JSON。然而，当它返回 JavaScript 原始类型（例如，<code>string</code>、<code>number</code>、<code>boolean</code>）时，Nest 将只发送值而不尝试序列化它。这使响应处理变得简单：只需返回值，Nest 就会处理其余的事情。
      <br />
      <br /> 此外，响应的 <strong>状态码</strong> 默认始终为 200，除了使用 201 的 POST
      请求。我们可以通过在处理程序级别添加 <code>@HttpCode(...)</code>
      装饰器来轻松更改此行为（请参阅 <a href='controllers#status-code'>状态码</a>）。
    </td>
  </tr>
  <tr>
    <td>库特定</td>
    <td>
      我们可以使用库特定的（例如，Express）<a href="https://expressjs.com/en/api.html#res" rel="nofollow" target="_blank">响应对象</a>，可以使用方法处理程序签名中的 <code>@Res()</code> 装饰器来注入（例如，<code>findAll(@Res() response)</code>）。通过这种方法，您可以使用该对象公开的本机响应处理方法。例如，使用 Express，您可以使用 <code>response.status(200).send()</code> 这样的代码构造响应。
    </td>
  </tr>
</table>

:::warning 警告
Nest 会检测处理程序何时使用 `@Res()` 或 `@Next()`，表明您已选择库特定选项。如果同时使用两种方法，则此单个路由的标准方法会 **自动禁用**，并且将不再按预期工作。要同时使用两种方法（例如，通过注入响应对象仅设置 cookie/标头但仍将其余部分留给框架），您必须在 `@Res({ passthrough: true })` 装饰器中将 `passthrough` 选项设置为 `true`。
:::

<app-banner-devtools></app-banner-devtools>

#### 请求对象

处理程序通常需要访问客户端的 **请求** 详细信息。Nest 提供对来自底层平台（默认情况下为 Express）的 [请求对象](https://expressjs.com/en/api.html#req) 的访问。您可以通过指示 Nest 在处理程序的签名中使用 `@Req()` 装饰器注入请求对象来访问请求对象。

```typescript
import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';

@Controller('cats')
export class CatsController {
  @Get()
  findAll(@Req() request: Request): string {
    return 'This action returns all cats';
  }
}

@Controller('cats')
export class CatsController {
  @Get()
  @Bind(Req())
  findAll(request) {
    return 'This action returns all cats';
  }
}

```

:::info 提示
要利用 `express` 类型（如上面的 `request: Request` 参数示例），请确保安装 `@types/express` 包。
:::

请求对象表示 HTTP 请求，并包含查询字符串、参数、HTTP 标头和主体的属性（更多信息请阅读 [这里](https://expressjs.com/en/api.html#req)）。在大多数情况下，您不需要手动访问这些属性。相反，您可以使用开箱即用的专用装饰器，如 `@Body()` 或 `@Query()`。下面是提供的装饰器列表以及它们表示的相应平台特定对象。

<table>
  <tbody>
    <tr>
      <td><code>@Request(), @Req()</code></td>
      <td><code>req</code></td></tr>
    <tr>
      <td><code>@Response(), @Res()</code><span class="table-code-asterisk">*</span></td>
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

<sup>\* </sup>为了与底层 HTTP 平台（例如，Express 和 Fastify）的类型兼容，Nest 提供了 `@Res()` 和 `@Response()` 装饰器。`@Res()` 只是 `@Response()` 的别名。两者都直接公开底层本机平台 `response` 对象接口。使用它们时，您还应该导入底层库的类型（例如，`@types/express`）以充分利用。请注意，当您在方法处理程序中注入 `@Res()` 或 `@Response()` 时，您将 Nest 置于该处理程序的 **库特定模式**，并且您负责管理响应。这样做时，您必须通过对 `response` 对象进行调用（例如，`res.json(...)` 或 `res.send(...)`）来发出某种响应，否则 HTTP 服务器将挂起。

:::info 提示
要学习如何创建自己的自定义装饰器，请访问 [此](/custom-decorators) 章节。
:::

#### 资源

 earlier，我们定义了一个端点来获取猫资源（**GET** 路由）。我们通常还希望提供一个创建新记录的端点。为此，让我们创建 **POST** 处理程序：

```typescript
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

@Controller('cats')
export class CatsController {
  @Post()
  create() {
    return 'This action adds a new cat';
  }

  @Get()
  findAll() {
    return 'This action returns all cats';
  }
}

```

就是这么简单。Nest 为所有标准 HTTP 方法提供装饰器：`@Get()`、`@Post()`、`@Put()`、`@Delete()`、`@Patch()`、`@Options()` 和 `@Head()`。此外，`@All()` 定义了一个处理所有这些的端点。

#### 路由通配符

NestJS 也支持基于模式的路由。例如，星号（`*`）可以用作通配符，以匹配路径末尾的路由中的任何字符组合。在以下示例中，`findAll()` 方法将对任何以 `abcd/` 开头的路由执行，无论后面跟着多少字符。

```typescript
@Get('abcd/*')
findAll() {
  return 'This route uses a wildcard';
}

```

`'abcd/*'` 路由路径将匹配 `abcd/`、`abcd/123`、`abcd/abc` 等。连字符（`-`）和点（`.`）在基于字符串的路径中按字面意思解释。

这种方法在 Express 和 Fastify 上都有效。然而，随着 Express（v5）的最新版本，路由系统变得更加严格。在纯 Express 中，您必须使用命名通配符来使路由工作 - 例如，`abcd/*splat`，其中 `splat` 只是通配符参数的名称，没有特殊含义。您可以随意命名它。也就是说，由于 Nest 为 Express 提供了兼容层，您仍然可以使用星号（`*`）作为通配符。

当涉及到在路由 **中间** 使用的星号时，Express 需要命名通配符（例如，`ab{*splat&#125;cd`），而 Fastify 根本不支持它们。

#### 路由冲突与解析顺序

Nest 按声明顺序注册路由。在顺序敏感的适配器上——默认的 Express 适配器就是其一——这意味着参数化路由可能会静默地遮蔽更具体的路由：

```typescript
@Controller('users')
export class UsersController {
  @Get(':id')
  findOne() {}

  @Get('me') // 永远不会被执行：`:id` 会先匹配到 "me"
  findMe() {}
}

```

这个问题很容易被忽视，因为应用程序启动时不会发出任何警告，问题只会在运行时——当请求被分发给错误的处理器时——才显现出来。诸如 `ParseIntPipe` 之类的管道在这里无济于事——路由在选择处理器时*早于*任何管道的运行。

NestJS v12 在 `NestApplicationOptions` 上新增了两个可选选项来防范这一问题。两者默认都保持以往的行为，因此除非您显式设置，现有应用程序不受影响。

**`routeConflictPolicy`** 启用启动时的诊断。它接受按类别划分的严重级别 `'off'`、`'warn'` 或 `'error'`：

```typescript
const app = await NestFactory.create(AppModule, {
  routeConflictPolicy: { duplicate: 'error', shadow: 'warn' },
});

```

<table>
  <tr>
    <td><code>duplicate</code></td>
    <td>两个路由拥有完全相同的方法、路径、主机和版本。</td>
  </tr>
  <tr>
    <td><code>shadow</code></td>
    <td>两个路由模式可以匹配同一个请求，例如 <code>/users/me</code> 和 <code>/users/:id</code>。</td>
  </tr>
</table>

设置为 `'error'` 时，每一对冲突都会被聚合到一个单一的 `RouteConflictException` 中，并在 `app.listen()` 期间抛出，这样您能一次看到全部冲突，而不是每次重启只看到一个。

**`routeResolutionStrategy`** 控制注册顺序。将其设置为 `'specificity'` 会优先注册最具体的路由——字面量片段优先于参数化片段，参数化片段优先于通配符——因此上例无论声明顺序如何都能正常工作：

```typescript
const app = await NestFactory.create(AppModule, {
  routeResolutionStrategy: 'specificity',
});

```

默认值为 `'declaration'`，即保留以往的行为。

> info **提示** 这些选项只在注册顺序会影响匹配的适配器上才有意义。`ExpressAdapter` 是顺序敏感的；`FastifyAdapter` 则不是，因为 `find-my-way` 已经按特异性对路由排序。在 Fastify 上，`shadow` 策略是空操作，`'specificity'` 排序也不生效，而 `duplicate` 策略在两者上都有效。`RouteConflictPolicy`、`RouteConflictPolicyLevel` 和 `RouteResolutionStrategy` 类型从 `@nestjs/common` 导出。

#### 状态码

如前所述，响应的默认 **状态码** 始终为 **200**，除了 POST 请求，默认为 **201**。您可以通过在处理程序级别使用 `@HttpCode(...)` 装饰器轻松更改此行为。

```typescript
@Post()
@HttpCode(204)
create() {
  return 'This action adds a new cat';
}

```

:::info 提示
从 `@nestjs/common` 包导入 `HttpCode`。
:::

通常，您的状态码不是静态的，而是取决于各种因素。在这种情况下，您可以使用库特定的 **响应**（使用 `@Res()` 注入）对象（或者，在错误的情况下，抛出异常）。

#### 响应头

要指定自定义响应头，您可以使用 `@Header()` 装饰器或库特定的响应对象（并直接调用 `res.header()`）。

```typescript
@Post()
@Header('Cache-Control', 'no-store')
create() {
  return 'This action adds a new cat';
}

```

:::info 提示
从 `@nestjs/common` 包导入 `Header`。
:::

#### 重定向

要将响应重定向到特定 URL，您可以使用 `@Redirect()` 装饰器或库特定的响应对象（并直接调用 `res.redirect()`）。

`@Redirect()` 接受两个参数，`url` 和 `statusCode`，两者都是可选的。如果省略，`statusCode` 的默认值为 `302`（`Found`）。

```typescript
@Get()
@Redirect('https://nestjs.com', 301)

```

:::info 提示
有时您可能希望动态确定 HTTP 状态码或重定向 URL。为此，返回一个遵循 `HttpRedirectResponse` 接口（来自 `@nestjs/common`）的对象。
:::

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

当您需要接受请求的一部分 **动态数据** 时（例如，`GET /cats/1` 获取 id 为 `1` 的猫），具有静态路径的路由将不起作用。要定义带有参数的路由，您可以在路由路径中添加路由参数 **令牌**，以从 URL 捕获动态值。下面 `@Get()` 装饰器示例中的路由参数令牌说明了这种方法。然后可以使用 `@Param()` 装饰器访问这些路由参数，该装饰器应添加到方法签名中。

:::info 提示
带参数的路由应在任何静态路径之后声明。这可以防止参数化路径拦截发往静态路径的流量。
:::

```typescript
@Get(':id')
findOne(@Param() params: any): string {
  console.log(params.id);
  return `This action returns a #${params.id} cat`;
}

```

`@Param()` 装饰器用于装饰方法参数（在上面的示例中，`params`），使 **路由** 参数在方法内部作为该装饰方法参数的属性可访问。如代码所示，您可以通过引用 `params.id` 来访问 `id` 参数。或者，您可以将特定的参数令牌传递给装饰器，并在方法体中直接按名称引用路由参数。

:::info 提示
从 `@nestjs/common` 包导入 `Param`。
:::

```typescript
@Get(':id')
findOne(@Param('id') id: string): string {
  return `This action returns a #${id} cat`;
}

```

#### 子域路由

`@Controller` 装饰器可以接受 `host` 选项，要求传入请求的 HTTP 主机匹配某个特定值。

```typescript
@Controller({ host: 'admin.example.com' })
export class AdminController {
  @Get()
  index(): string {
    return 'Admin page';
  }
}

```

:::warning 警告
由于 **Fastify** 不支持嵌套路由器，如果您使用子域路由，建议使用默认的 Express 适配器。
:::

与路由 `path` 类似，`host` 选项可以使用令牌来捕获主机名中该位置的动态值。下面 `@Controller()` 装饰器示例中的主机参数令牌演示了此用法。以这种方式声明的主机参数可以使用 `@HostParam()` 装饰器访问，该装饰器应添加到方法签名中。

```typescript
@Controller({ host: ':account.example.com' })
export class AccountController {
  @Get()
  getInfo(@HostParam('account') account: string) {
    return account;
  }
}

```

#### 状态共享

对于来自其他编程语言的开发人员来说，了解 Nest 中几乎所有内容都在传入请求之间共享可能会令人惊讶。这包括数据库连接池、具有全局状态的单例服务等资源。重要的是要理解 Node.js 不使用请求/响应多线程无状态模型，其中每个请求由单独的线程处理。因此，在 Nest 中使用单例实例对我们的应用程序来说是完全 **安全** 的。

也就是说，在某些特定的边缘情况下，可能需要为控制器设置基于请求的生命周期。例如，GraphQL 应用程序中的每个请求缓存、请求跟踪或实现多租户。您可以在此处了解有关控制注入作用域的更多信息 [这里](/fundamentals/provider-scopes)。

#### 异步性

我们喜欢现代 JavaScript，尤其是它对 **异步** 数据处理的强调。这就是为什么 Nest 完全支持 `async` 函数。每个 `async` 函数都必须返回一个 `Promise`，这允许您返回 Nest 可以自动解析的延迟值。这是一个例子：

```typescript
@Get()
async findAll(): Promise<any[]> {
  return [];
}

```

这段代码完全有效。但 Nest 更进一步，允许路由处理程序也返回 RxJS [可观察流](https://rxjs-dev.firebaseapp.com/guide/observable)。Nest 将在内部处理订阅，并在流完成后解析最终发出的值。

```typescript
@Get()
findAll(): Observable<any[]> {
  return of([]);
}

```

两种方法都有效，您可以选择最适合您需求的方法。

#### 请求体

在我们之前的示例中，POST 路由处理程序不接受任何客户端参数。让我们通过添加 `@Body()` 装饰器来解决这个问题。

在我们继续之前（如果您使用 TypeScript），我们需要定义 **DTO**（数据传输对象）模式。DTO 是一个对象，指定数据应如何通过网络发送。我们可以使用 **TypeScript** 接口或简单类来定义 DTO 模式。但是，我们建议在此处使用 **类**。为什么？类是 JavaScript ES6 标准的一部分，因此它们在编译的 JavaScript 中作为真实实体保持不变。相比之下，TypeScript 接口在转译过程中被删除，这意味着 Nest 无法在运行时引用它们。这很重要，因为像 **Pipes** 这样的功能依赖于在运行时访问变量的元类型，这只有类才有可能。

让我们创建 `CreateCatDto` 类：

```typescript
export class CreateCatDto {
  name: string;
  age: number;
  breed: string;
}

```

它只有三个基本属性。之后，我们可以在 `CatsController` 中使用新创建的 DTO：

```typescript
@Post()
async create(@Body() createCatDto: CreateCatDto) {
  return 'This action adds a new cat';
}

```

:::info 提示
我们的 `ValidationPipe` 可以过滤掉方法处理程序不应接收的属性。在这种情况下，我们可以白名单可接受的属性，任何未包含在白名单中的属性都会自动从结果对象中删除。在 `CreateCatDto` 示例中，我们的白名单是 `name`、`age` 和 `breed` 属性。了解更多 [这里](/techniques/validation#剥离属性)。
:::

#### 查询参数

在处理路由中的查询参数时，您可以使用 `@Query()` 装饰器从传入请求中提取它们。让我们看看这在实践中是如何工作的。

考虑一个路由，我们希望根据 `age` 和 `breed` 等查询参数过滤猫的列表。首先，在 `CatsController` 中定义查询参数：

```typescript
@Get()
async findAll(@Query('age') age: number, @Query('breed') breed: string) {
  return `This action returns all cats filtered by age: ${age} and breed: ${breed}`;
}

```

在这个例子中，`@Query()` 装饰器用于从查询字符串中提取 `age` 和 `breed` 的值。例如，对以下请求：

```plaintext
GET /cats?age=2&breed=Persian

```

会导致 `age` 为 `2`，`breed` 为 `Persian`。

如果您的应用程序需要处理更复杂的查询参数，例如嵌套对象或数组：

```plaintext
?filter[where][name]=John&filter[where][age]=30
?item[]=1&item[]=2

```

您需要配置 HTTP 适配器（Express 或 Fastify）以使用适当的查询解析器。在 Express 中，您可以使用 `extended` 解析器，它允许丰富的查询对象：

```typescript
const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.set('query parser', 'extended');

```

在 Fastify 中，您可以使用 `querystringParser` 选项：

```typescript
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({
    querystringParser: (str) => qs.parse(str),
  }),
);

```

:::info 提示
`qs` 是一个支持嵌套和数组的查询字符串解析器。您可以使用 `npm install qs` 安装它。
:::

#### 错误处理

有关处理错误（即处理异常）的单独章节，请参阅 [这里](/overview/exception-filters)。

#### 在生产环境中观测路由

在您的机器上表现完美的控制器，在真实流量下可能表现得截然不同。生产环境中出现的问题从来不是“这个路由能不能工作？”，而是“为什么 `GET /cats/:id` 在周二部署之后从 40 毫秒变成了 900 毫秒，是每个请求都这样，还是只有一个倒霉的租户？”

路由处理器正是回答这个问题的天然单元，而 [NestJS Observe](https://www.observe.nestjs.com/ 'NestJS Observe') 报告的正是这个单元。由于 `@nestjs/observe` SDK 挂接在 Nest 自身的请求生命周期上，而不是包装 HTTP 服务器，每一项度量都会以您声明的路由模式标注——是 `GET /cats/:id`，而不是一万个不同的 URL——因此每个路由就是一行可以排序、绘图和告警的数据：

```typescript
const app = await NestFactory.create(AppModule, {
  instrument: ObserveInstrument,
});

```

这就是全部的集成工作。从这里开始，排查一个缓慢的路由只需三次点击：按 p95 对路由列表排序，打开该操作查看回归是恒定的还是突发的、是否始于某次发布，然后打开一次缓慢的执行并阅读它的瀑布图——是哪个控制器、哪个服务方法、哪个查询占用了时间。耗时按**类和方法**归因，并扣除所有被 await 等待的部分，因此 `CatsService.findOne()` 自身耗时 800 毫秒，与它在数据库上等待了 800 毫秒，可以被立刻区分开。

请参阅[可观测性](/observability/overview)章节完成接入，以及[仪表盘](/observability/dashboard)了解从告警到单个请求的完整排查路径。

#### 完整资源示例

下面是一个示例，演示了使用几个可用装饰器创建基本控制器。此控制器提供了一些方法来访问和操作内部数据。

```typescript
import { Controller, Get, Query, Post, Body, Put, Param, Delete } from '@nestjs/common';
import { CreateCatDto, UpdateCatDto, ListAllEntities } from './dto';

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

@Controller('cats')
export class CatsController {
  @Post()
  @Bind(Body())
  create(createCatDto) {
    return 'This action adds a new cat';
  }

  @Get()
  @Bind(Query())
  findAll(query) {
    console.log(query);
    return `This action returns all cats (limit: ${query.limit} items)`;
  }

  @Get(':id')
  @Bind(Param('id'))
  findOne(id) {
    return `This action returns a #${id} cat`;
  }

  @Put(':id')
  @Bind(Param('id'), Body())
  update(id, updateCatDto) {
    return `This action updates a #${id} cat`;
  }

  @Delete(':id')
  @Bind(Param('id'))
  remove(id) {
    return `This action removes a #${id} cat`;
  }
}

```

:::info 提示
Nest CLI 提供了一个生成器（schematic），可以自动创建 **所有样板代码**，为您省去手动操作的麻烦，提高整体开发体验。了解有关此功能的更多信息 [这里](/recipes/crud-generator)。
:::

#### 启动和运行

即使 `CatsController` 已完全定义，Nest 还不知道它，也不会自动创建该类的实例。

控制器必须始终是模块的一部分，这就是为什么我们在 `@Module()` 装饰器中包含 `controllers` 数组。由于除了根 `AppModule` 之外我们还没有定义任何其他模块，我们将使用它来注册 `CatsController`：

```typescript
import { Module } from '@nestjs/common';
import { CatsController } from './cats/cats.controller';

@Module({
  controllers: [CatsController],
})
export class AppModule {}

```

我们使用 `@Module()` 装饰器将元数据附加到模块类，现在 Nest 可以轻松确定需要挂载哪些控制器。

#### 库特定方法

到目前为止，我们已经介绍了操作响应的标准 Nest 方法。另一种方法是使用库特定的 [响应对象](https://expressjs.com/en/api.html#res)。要注入特定的响应对象，我们可以使用 `@Res()` 装饰器。为了突出差异，让我们像这样重写 `CatsController`：

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

@Controller('cats')
export class CatsController {
  @Post()
  @Bind(Res(), Body())
  create(res, createCatDto) {
    res.status(HttpStatus.CREATED).send();
  }

  @Get()
  @Bind(Res())
  findAll(res) {
     res.status(HttpStatus.OK).json([]);
  }
}

```

虽然这种方法有效并且通过完全控制响应对象（例如，标头操作和访问库特定功能）提供了更大的灵活性，但应谨慎使用。通常，这种方法不太清晰，并且存在一些缺点。主要缺点是您的代码变得依赖于平台，因为不同的底层库可能对响应对象有不同的 API。此外，它会使测试更具挑战性，因为您需要模拟响应对象等。

此外，通过使用这种方法，您会失去与依赖于标准响应处理的 Nest 功能的兼容性，例如拦截器和 `@HttpCode()` / `@Header()` 装饰器。要解决此问题，您可以像这样启用 `passthrough` 选项：

```typescript
@Get()
findAll(@Res({ passthrough: true }) res: Response) {
  res.status(HttpStatus.OK);
  return [];
}

```

通过这种方法，您可以与本机响应对象交互（例如，根据特定条件设置 cookie 或标头），同时仍允许框架处理其余部分。
