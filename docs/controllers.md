<!-- 此文件从 content/controllers.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:05:11.398Z -->
<!-- 源文件: content/controllers.md -->
<!-- 源哈希: 0d1d47379315b91022460ca8c6f14153 -->

### 控制器

控制器负责处理传入的**请求**并将**响应**发送回客户端。

<figure><img class="illustrative-image" src="/assets/Controllers_1.png" /></figure>

控制器的目的是处理应用程序的特定请求。**路由**机制决定了哪个控制器处理每个请求。一个控制器通常有多个路由，每个路由可以执行不同的操作。

要创建一个基本的控制器，您使用类和**装饰器**。装饰器将类与所需的元数据关联起来，Nest 使用这些元数据来构建一个路由映射，将请求连接到相应的控制器。

> info **提示** 要使用内置的 [validation](/techniques/validation) 创建一个 CRUD 控制器，请使用 CLI 的 [CRUD generator](/recipes/crud-generator#crud-生成器)：`nest g resource [name]`。

#### 路由

以下示例使用了 `@Controller()` 装饰器，该装饰器是定义基本控制器的**必需**项，并带有可选的路由路径前缀 `cats`。在 `@Controller()` 装饰器中设置路径前缀可以对相关路由进行分组，减少重复代码。例如，要将管理 cat 实体的路由分组到 `/cats` 路径下，请在 `@Controller()` 装饰器中指定 `cats` 前缀。然后，您无需在文件中的每个路由中重复该路径部分。

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

> info **提示** 要使用 CLI 创建控制器，请运行 `$ nest g controller [name]` 命令。

放置在 `findAll()` 方法之前的 `@Get()` HTTP 请求方法装饰器告诉 Nest 为特定端点创建处理器。端点由 HTTP 请求方法（此处为 GET）和路由路径定义。处理器的路由路径结合了控制器声明的（可选）前缀**和**方法装饰器中指定的任何路径。由于示例设置了前缀（`cats`）但方法装饰器中未指定路径，Nest 将 `GET /cats` 请求映射到此处理器。

如果方法装饰器还指定了路径，例如 `@Get('breed')`，则生成的路由将是 `GET /cats/breed`。

当收到 `GET /cats` 请求时，Nest 会将其路由到用户定义的 `findAll()` 方法。方法名称是任意的：您必须声明一个方法来绑定路由，但 Nest 不对其名称赋予任何意义。

此方法返回 200 状态码以及相关的**响应**，在本例中是一个字符串。为了解释原因，我们需要介绍 Nest 提供用于操作响应的两个**不同**选项：

<table>
  <tr>
    <td>标准（推荐）</td>
    <td>
      使用此内置方法时，当路由处理器返回 JavaScript 对象或数组时，它会自动被 <strong>序列化</strong>为 JSON。当它返回 JavaScript 原始类型（例如 <code>string</code>、<code>number</code>、<code>boolean</code>）时，Nest 会在不尝试序列化的情况下发送该值。因此，响应处理很简单：返回值，Nest 会处理其余部分。
      <br />
      <br /> 响应的 <strong>状态码</strong> 默认为 200，但对于 POST 请求使用 201。您可以通过在处理器级别添加 <code>@HttpCode(...)</code> 装饰器来更改此行为（参见 <a href='controllers#status-code'>状态码</a>）。
    </td>
  </tr>
  <tr>
    <td>库特定</td>
    <td>
      您可以在路由处理器签名中注入库特定的（例如 Express）<a href="https://expressjs.com/en/api.html#res" rel="nofollow" target="_blank">response 对象</a>，使用 <code>@Res()</code> 装饰器（例如 <code>findAll(@Res() response)</code>）。这种方法允许您使用该对象暴露的原生响应处理方法。例如，在使用 Express 时，您可以使用类似 <code>response.status(200).send()</code> 的代码来构建响应。
    </td>
  </tr>
</table>

> warning **警告** Nest 检测到处理器使用了 `@Res()` 或 `@Next()` 时，表明您选择了库特定选项。如果同时使用这两种方法，标准方法将**自动禁用**该路由，不再按预期工作。要将它们结合使用（例如，仅注入响应对象以设置 Cookie 或头部，而其余部分由框架处理），请在 `@Res({ passthrough: true })` 装饰器中将 `passthrough` 选项设置为 `true`。

<app-banner-observe></app-banner-observe>

#### Request 对象

处理器通常需要访问客户端的**请求**详情。Nest 提供了对底层平台（默认为 Express）[request object](https://expressjs.com/en/api.html#req) 的访问。要访问它，请将 `@Req()` 装饰器添加到处理器的签名中，该装饰器指示 Nest 注入它。

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

> info **提示** 要利用 `express` 类型（如上文 `request: Request` 参数所示），请安装 `@types/express` 包。

请求对象代表 HTTP 请求，具有查询字符串、路由参数、HTTP 头部和主体等属性（参见 [Express documentation](https://expressjs.com/en/api.html#req)）。在大多数情况下，您不需要手动访问这些属性。相反，请使用专用的装饰器，例如 `@Body()` 或 `@Query()`，这些装饰器开箱即用。下表列出了提供的装饰器及其代表的平台特定对象。

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
      <td><code>@Cookies(name?: string)</code></td>
      <td>request cookies / the cookie named <code>name</code> (see <a routerLink="/techniques/cookies">Cookies</a>)</td>
    </tr>
    <tr>
      <td><code>@SignedCookies(name?: string)</code></td>
      <td>verified signed cookies / the signed cookie named <code>name</code></td>
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

<sup>\* </sup>为与底层 HTTP 平台（例如 Express 和 Fastify）的类型兼容性，Nest 提供了 `@Res()` 和 `@Response()` 装饰器。`@Res()` 是 `@Response()` 的别名。两者直接暴露底层平台的原生 `response` 对象。在使用它们时，还应安装底层库的类型（例如 `@types/express`）以充分利用它们。当您在路由处理器中注入 `@Res()` 或 `@Response()` 时，您将 Nest 置于该处理器的**库特定模式**，并且您需要负责管理响应。然后，您必须通过调用 `response` 对象上的方法来发送响应（例如 `res.json(...)` 或 `res.send(...)`）；否则，请求将挂起。

`@Body()`、`@Query()`、`@Param()` 和 `@RawBody()` 也接受一个包含 `schema` 和 `pipes` 属性的选项对象。这允许您将与 Zod、Valibot 或 ArkType 等创建的 [Standard Schema](https://standardschema.dev/) 兼容的模式直接附加到路由参数上。

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

单独使用时，这些装饰器仅将模式作为元数据附加。要根据其进行验证，请注册内置的 `StandardSchemaValidationPipe` 或读取 `metadata.schema` 的自定义 管道。

> info **提示** 要了解如何创建自己的装饰器，请参阅 [Custom route decorators](/custom-decorators) 章。

#### 资源

之前，我们定义了一个获取猫资源（**GET** 路由）的端点。通常，我们还需要一个创建新记录的端点。让我们添加一个 **POST** 处理程序：

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

Nest 为所有标准 HTTP 方法提供了装饰器：`@Get()`、`@Post()`、`@Put()`、`@Delete()`、`@Patch()`、`@Options()`、`@Head()` 和 `@QueryMethod()`。最后一个映射到 `QUERY` 方法；它命名为 `QueryMethod` 以避免与 `@Query()` 参数装饰器冲突。此外，`@All()` 定义了一个处理所有这些方法的端点。

#### 路由通配符

Nest 还支持基于模式的路由。例如，路径末尾的星号（`*`）充当通配符，匹配任何字符组合。在以下示例中，对于任何以 `abcd/` 开头的路由，无论后面跟多少字符，都会执行 `findAll()` 方法。

```typescript
@Get('abcd/*')
findAll() {
  return 'This route uses a wildcard';
}

```

`'abcd/*'` 路由路径匹配 `abcd/`、`abcd/123`、`abcd/abc` 等。在基于字符串的路径中，连字符（`-`）和点（`.`）被视为字面量。

这种方法适用于 Express 和 Fastify。然而，Express v5 使其路由更严格：在纯 Express 中，路由必须命名通配符才能工作（例如 `abcd/{*splat&#125;`，其中 `splat` 是一个没有特殊含义的通配符参数的任意名称）。由于 Nest 为 Express 提供了兼容层，您仍然可以使用未命名的星号（`*`）作为通配符。

对于**路由中间的星号**，Express 要求命名通配符（例如 `ab{*splat&#125;cd`），而 Fastify 完全不支持。

#### 路由冲突和解析顺序

Nest 按照声明顺序注册路由。在对顺序敏感的适配器上，例如默认的 Express 适配器，参数化路由可能会静默地遮盖更具体的路由：

```typescript
@Controller('users')
export class UsersController {
  @Get(':id')
  findOne() {}

  @Get('me') // never reached: `:id` matches "me" first
  findMe() {}
}

```

这很容易遗漏：应用程序启动时没有警告，问题仅在运行时出现，即当请求被分发到错误的处理器时。诸如 `ParseIntPipe` 这样的 管道对此无帮助，因为路由在任何管道运行**之前**选择处理器。

NestJS v12 添加了两个可选的 `NestApplicationOptions` 属性来防止这种情况。两者都默认为先前行为，因此现有应用程序不受影响，除非您设置它们。

**`routeConflictPolicy`** 启用启动时诊断。对于每种冲突，它接受 `'off'`（默认）、`'warn'` 或 `'error'` 的严重性：

```typescript
const app = await NestFactory.create(AppModule, {
  routeConflictPolicy: { duplicate: 'error', shadow: 'warn' },
});

```

<table>
  <tr>
    <td><code>duplicate</code></td>
    <td>两个路由共享相同的方法、路径、主机和版本。</td>
  </tr>
  <tr>
    <td><code>shadow</code></td>
    <td>两个路由模式可以匹配相同的请求（例如 <code>/users/me</code> 和 <code>/users/:id</code>）。</td>
  </tr>
</table>

使用 `'error'`，所有冲突对都聚合到一个单一的 `RouteConflictException` 中，在应用程序初始化时抛出（在 `app.init()` 中，或者如果您不显式调用 `app.listen()` 时在 `init()` 中）。这样，您一次性看到所有冲突，而不是每次重启一个。

**`routeResolutionStrategy`** 控制注册顺序。将其设置为 `'specificity'` 会首先注册最具体的路由（字面量段优先于参数段，参数段优先于通配符），因此上述示例无论声明顺序如何都有效：

```typescript
const app = await NestFactory.create(AppModule, {
  routeResolutionStrategy: 'specificity',
});

```

默认值是 `'declaration'`，这保留了先前的行为。

> info **提示** 除了 `duplicate` 策略外，这些选项仅在注册顺序影响匹配的适配器上才重要。`ExpressAdapter` 是顺序敏感的；`FastifyAdapter` 不是，因为其路由器（`find-my-way`）已经按具体性对路由进行排序。在 Fastify 上，`shadow` 策略是无操作的，而 `'specificity'` 排序没有效果，同时 `duplicate` 策略在两个适配器上都得到遵守。`RouteConflictPolicy`、`RouteConflictPolicyLevel` 和 `RouteResolutionStrategy` 类型从 `@nestjs/common` 导出。

#### 状态码

如前所述，默认响应**状态码**是 **200**，POST 请求除外，默认是 **201**。您可以在处理程序级别使用 `@HttpCode(...)` 装饰器更改此行为。

```typescript
@Post()
@HttpCode(204)
create() {
  return 'This action adds a new cat';
}

```

> info **提示** 从 `@nestjs/common` 包导入 `HttpCode`。

通常，状态码不是静态的，而是取决于各种因素。在这种情况下，请使用库特定的**响应**对象（通过 `@Res()` 注入），或者在发生错误时抛出异常。

#### 响应头

要设置自定义响应头，请使用 `@Header()` 装饰器或库特定的响应对象（并直接调用 `res.header()`）。

```typescript
@Post()
@Header('Cache-Control', 'no-store')
create() {
  return 'This action adds a new cat';
}

```

> info **提示** 从 `@nestjs/common` 包导入 `Header`。

#### 重定向

要将响应重定向到特定 URL，请使用 `@Redirect()` 装饰器或库特定的响应对象（并直接调用 `res.redirect()`）。

`@Redirect()` 接受两个可选参数，`url` 和 `statusCode`。如果省略，`statusCode` 默认为 `302`（`Found`）。

```typescript
@Get()
@Redirect('https://nestjs.com', 301)

```

> info **提示** 要动态确定 HTTP 状态码或重定向 URL，请返回遵循 `HttpRedirectResponse` 接口的对象（从 `@nestjs/common` 导出）。

返回的值会覆盖传递给 `@Redirect()` 装饰器的任何参数。例如：

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

静态路径的路由在需要接受**动态数据**作为请求的一部分时无法工作（例如，使用 `GET /cats/1` 获取 id 为 `1` 的猫）。要定义带有参数的路由，请在路由路径中添加路由参数**令牌**，以捕获来自 URL 的动态值，如下例所示的 `@Get()` **装饰器**所示。然后，您可以通过在方法签名中添加 `@Param()` **装饰器**来访问这些路由参数。

> info **提示** 在任何静态路径之后声明带有参数的路由，以防止参数化路径拦截发往静态路径的流量。有关在引导时检测此行为或为您解析此行为的选项，请参阅 [Route conflicts and resolution order](/overview/controllers#路由冲突与解析顺序)。

```typescript
@Get(':id')
findOne(@Param() params: any): string {
  console.log(params.id);
  return `This action returns a #${params.id} cat`;
}

```

`@Param()` **装饰器**装饰一个方法参数（如上例中的 `params`），使**路由**参数作为该参数的属性在方法内部可用。如代码所示，您通过 `params.id` 访问 `id` 参数。或者，将特定的参数令牌传递给 **装饰器**，并在方法体中直接按名称引用路由参数。

> info **提示** 从 `@nestjs/common` 包导入 `Param`。

```typescript
@Get(':id')
findOne(@Param('id') id: string): string {
  return `This action returns a #${id} cat`;
}

```

#### 子域名路由

`@Controller()` **装饰器**可以接受一个 `host` 选项，要求传入请求的 HTTP 主机匹配特定值。

```typescript title="admin.controller.ts"
@Controller({ host: 'admin.example.com' })
export class AdminController {
  @Get()
  index(): string {
    return 'Admin page';
  }
}

```

> warning **警告** 由于 **Fastify** 不支持嵌套路由，如果依赖子域名路由，请使用默认的 Express **中间件**适配器或 Node 适配器。

与路由 `path` 类似，`host` 选项可以使用令牌来捕获主机名中该位置的动态值，如下例中 `@Controller()` **装饰器**中的主机参数令牌所示。您可以通过在方法签名中添加 `@HostParam()` **装饰器**来访问这样声明的主机参数。

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

来自其他编程语言的开发者可能会惊讶地发现，在 Nest 中，几乎所有内容都在传入请求之间共享。这包括数据库连接池、具有全局状态的单例 **服务** 等资源。Node.js 没有请求/响应多线程无状态模型，即每个请求由一个单独的线程处理。因此，在 Nest 中使用单例实例是完全**安全**的。

话虽如此，某些边缘情况可能需要控制器基于请求的生命周期，例如 GraphQL 应用程序中的每次请求缓存、请求跟踪或多租户。要了解如何控制这一点，请参阅 [Injection scopes](/fundamentals/provider-scopes)。

#### 异步性

现代 JavaScript 严重依赖**异步**数据处理，Nest 完全支持 `async` 函数。一个 `async` 函数总是返回一个 `Promise`，因此路由处理程序可以返回一个由 Nest 自动解析的延迟值：

```typescript title="cats.controller.ts"
@Get()
async findAll(): Promise<any[]> {
  return [];
}

```

路由处理程序也可以返回 RxJS [observable streams](https://rxjs.dev/guide/observable)。Nest 在内部订阅流，并在流完成时解析最后一个发射的值。

```typescript title="cats.controller.ts"
@Get()
findAll(): Observable<any[]> {
  return of([]);
}

```

这两种方法都是有效的；选择最适合您需求的方案。

#### 请求载荷

上一个示例中的 POST 路由处理程序不接受任何客户端参数。我们通过添加 `@Body()` **装饰器**来修复它。

在继续之前（如果您使用 TypeScript），我们需要定义 **DTO**（数据传输对象）的 **模式**。DTO 是定义通过网络发送的数据形状的对象。您可以使用 **TypeScript** 接口或普通类来定义 DTO **模式**，但**类**是推荐的选择。类是 JavaScript ES6 标准的一部分，因此在编译后的 JavaScript 中被保留为真实实体。相比之下，TypeScript 接口在转译过程中被移除，因此 Nest 无法在运行时引用它们。这很重要，因为诸如 **管道** 等功能依赖于运行时对变量元类型的访问，而这仅可通过类实现。

创建 `CreateCatDto` 类：

```typescript title="create-cat.dto.ts"
export class CreateCatDto {
  name: string;
  age: number;
  breed: string;
}

```

它具有三个基本属性。现在我们可以在 `CatsController` 中使用新的 DTO：

```typescript title="cats.controller.ts"
@Post()
async create(@Body() createCatDto: CreateCatDto) {
  return 'This action adds a new cat';
}

```

> info **提示** `ValidationPipe` 可以过滤掉路由处理程序不应接收的属性。您白名单化可接受的属性，任何不在白名单中的属性都会自动从结果对象中剥离。在 `CreateCatDto` 示例中，白名单包括 `name`、`age` 和 `breed` 属性。更多信息请参阅 [Stripping properties](/techniques/validation#剥离属性)。

#### 查询参数

要从传入请求中提取查询参数，请使用 `@Query()` **装饰器**。

考虑一个根据查询参数（如 `age` 和 `breed`）过滤猫列表的路由。首先，在 `CatsController` 中定义查询参数：

```typescript title="cats.controller.ts"
@Get()
async findAll(@Query('age') age: number, @Query('breed') breed: string) {
  return `This action returns all cats filtered by age: ${age} and breed: ${breed}`;
}

```

在此示例中，`@Query()` **装饰器**从查询字符串中提取 `age` 和 `breed` 的值。例如，对以下请求：

```plaintext
GET /cats?age=2&breed=Persian

```

结果是 `age` 为 `'2'`，`breed` 为 `'Persian'`。查询参数值以字符串形式到达，仅有 `number` 类型注解无法将其转换为数字。要接收数字，请应用一个 **管道**，例如 `ParseIntPipe`（参见 [Pipes](/pipes)）。

如果您的应用程序需要处理更复杂的查询参数，例如嵌套对象或数组：

```plaintext
?filter[where][name]=John&filter[where][age]=30
?item[]=1&item[]=2

```

请配置您的 HTTP **提供者**（Express、Fastify 或 Node）以使用适当的查询解析器。在 Express 中，请使用 `extended` 解析器，它支持丰富的查询对象：

```typescript title="main.ts"
const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.set('query parser', 'extended');

```

在 Fastify 中，请使用 `querystringParser` 路由选项：

```typescript title="main.ts"
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({
    routerOptions: {
      querystringParser: (str) => qs.parse(str),
    },
  }),
);

```

Node **提供者**直接接受 `querystringParser` 选项：

```typescript title="main.ts"
const app = await NestFactory.create<NestNodeApplication>(
  AppModule,
  new NodeAdapter({
    querystringParser: (str) => qs.parse(str),
  }),
);

```

> info **提示** `qs` 是一个支持嵌套和数组的查询字符串解析器。使用 `npm install qs` 安装它。

#### 处理错误

错误处理（即处理异常）在 [Exception filters](/overview/exception-filters) 章中介绍。

#### 在生产环境中观察路由

在您的机器上表现完美的 **控制器** 在真实流量下可能会表现出很大不同。在生产环境中，问题从来都不是“这个路由是否工作？”，而是“为什么在周二部署后，`GET /cats/:id` 从 40 毫秒增加到 900 毫秒，是所有 **请求** 还是某个不幸运的租户？”

路由处理程序是回答该问题的自然单元，而 [NestJS Observe](https://www.observe.nestjs.com/ 'NestJS Observe') 报告了确切的该单元。由于 `@nestjs/observe` SDK 钩入 Nest 自身的 **请求生命周期** 而不是包装 HTTP 服务器，每个度量都带有您声明的路由模式标签（`GET /cats/:id`，而不是 10,000 个不同的 URL）。因此，每个路由都是一个单独的行，您可以对其进行排序、图表化和设置警报：

```typescript
const app = await NestFactory.create(AppModule, {
  instrument: ObserveInstrument,
});

```

将 `ObserveModule.forRoot()` 导入到根 **模块** 中，即完成整个集成。从那里，一个慢路由只需点击三次即可找到：按 p95 对路由列表进行排序；打开操作以查看回归是恒定的还是尖峰状，以及它是否始于某个发布；然后打开一个慢执行并阅读其瀑布图，以查看是哪个 **控制器**、**服务** 方法或 **查询** 占用了时间。时间是按**类和方法**分配的，并减去等待时间，因此 `CatsService.findOne()` 在自己的代码中花费 800 毫秒与 `CatsService.findOne()` 等待数据库 800 毫秒是可立即区分的。

请参阅 [Observability](/observability/overview) 章进行设置，并参阅 [Dashboard](/observability/dashboard) 获取从警报到单个 **请求** 的完整流程。

#### 完整资源示例

以下示例使用多个可用 **装饰器** 来创建一个基本的 **控制器**。该 **控制器** 暴露了几个方法来访问和操作内部数据。

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

> info **提示** Nest CLI 提供了一个生成器（schematic），可以自动创建**所有样板代码**，因此您无需手动编写。在 [CRUD generator](/recipes/crud-generator) 食谱中了解更多信息。

#### 启动运行

即使 `CatsController` 已完全定义，Nest 也不知道它，也不会创建该类的实例。

**控制器** 必须始终属于一个 **模块**，这就是我们在 `@Module()` **装饰器**中包含 `controllers` 数组的原因。由于我们除了根 `AppModule` 之外没有定义其他 **模块**，我们将使用它来注册 `CatsController`：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { CatsController } from './cats/cats.controller.js';

@Module({
  controllers: [CatsController],
})
export class AppModule {}

```

通过 `@Module()` **装饰器**将此元数据附加到 **模块** 类上，Nest 就可以确定要挂载哪些 **控制器**。

#### 库特定方法

到目前为止，我们介绍了操作 **响应** 的标准 Nest 方式。另一种方法是使用库特定的 [response object](https://expressjs.com/en/api.html#res)，并使用 `@Res()` **装饰器**进行注入。为了突出差异，我们按如下方式重写 `CatsController`：

```typescript
import { Controller, Get, Post, Res, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

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

这种方法通过完全控制 **响应** 对象（例如，**Header** 操作和访问库特定功能）提供了更大的灵活性，但应谨慎使用。它通常不够清晰，并且有一些缺点。主要缺点是您的代码变得平台依赖，因为不同的底层库可能在 **响应** 对象上暴露不同的 API。它还使测试更困难，因为您需要模拟 **响应** 对象等等。

此外，这种方法会失去与依赖标准 **响应** 处理的 Nest 功能的兼容性，例如 **拦截器** 和 `@HttpCode()` / `@Header()` **装饰器**。为解决此问题，请启用 `passthrough` 选项：

```typescript
@Get()
findAll(@Res({ passthrough: true }) res: Response) {
  res.status(HttpStatus.OK);
  return [];
}

```

通过这种方式，您可以与原生 **响应** 对象进行交互（例如，根据特定条件设置 **Cookie** 或 **Header**），同时将其余部分留给框架处理。