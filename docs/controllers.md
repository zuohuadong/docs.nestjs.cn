<!-- 此文件从 content/controllers.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T07:32:38.600Z -->
<!-- 源文件: content/controllers.md -->
<!-- 源哈希: 4250fba50f7234e57108dc8a0b1fe63c -->

### 控制器

控制器负责处理传入的**请求**并将**响应**返回给客户端。

<figure><img class="illustrative-image" src="/assets/Controllers_1.png" /></figure>

控制器的目的是处理应用程序的特定请求。**路由**机制决定了哪个控制器处理每个请求。一个控制器通常有多个路由，每个路由可以执行不同的操作。

要创建一个基本控制器，你需要使用类和**装饰器**。装饰器将类与所需的元数据关联起来，Nest 使用这些元数据来构建路由映射，将请求连接到对应的控制器。

> info **提示** 要使用内置的 [validation](/techniques/validation) 创建 CRUD 控制器，请使用 CLI 的 [CRUD generator](/recipes/crud-generator#crud-生成器)：`nest g resource [name]`。

#### 路由

以下示例使用了 `@Controller()` 装饰器，它是定义基本控制器**必需**的，并带有一个可选的路由路径前缀 `cats`。`@Controller()` 装饰器中的路径前缀可以将相关路由分组，并减少重复代码。例如，要将管理猫实体的路由分组到 `/cats` 路径下，请在 `@Controller()` 装饰器中指定 `cats` 前缀。这样你就不需要在文件中为每个路由重复该部分路径了。

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

放置在 `findAll()` 方法之前的 `@Get()` HTTP 请求方法装饰器告诉 Nest 为特定端点创建处理程序。端点由 HTTP 请求方法（本例中为 GET）和路由路径定义。处理程序的路由路径结合了为控制器声明的（可选）前缀**以及**方法装饰器中指定的任何路径。由于示例设置了前缀（`cats`）且方法装饰器中未指定路径，Nest 会将 `GET /cats` 请求映射到此处理程序。

如果方法装饰器还指定了路径，例如 `@Get('breed')`，则生成的路由将是 `GET /cats/breed`。

当 `GET /cats` 请求到达时，Nest 会将其路由到用户定义的 `findAll()` 方法。方法名称是任意的：你必须声明一个方法来绑定路由，但 Nest 对其名称没有任何特殊含义。

此方法返回 200 状态码以及相关响应，在本例中是一个字符串。为了解释原因，我们需要介绍 Nest 提供的用于操作响应的两种**不同**选项：

<table>
  <tr>
    <td>标准（推荐）</td>
    <td>
      使用这种内置方法，当路由处理程序返回 JavaScript 对象或数组时，它会<strong>自动</strong>
      序列化为 JSON。当它返回 JavaScript 原始类型（例如 <code>string</code>、<code>number</code>、<code>boolean</code>）时，Nest 会直接发送该值，而不尝试对其进行序列化。因此响应处理非常直接：返回值，Nest 会处理其余的事情。
      <br />
      <br /> 响应的 <strong>状态码</strong> 默认为 200，但 POST
      请求除外，它使用 201。你可以通过在处理程序级别添加 <code>@HttpCode(...)</code>
      装饰器来更改此行为（参见 <a href='controllers#status-code'>状态码</a>）。
    </td>
  </tr>
  <tr>
    <td>特定于库</td>
    <td>
      你可以使用特定于库（例如 Express）的 <a href="https://expressjs.com/en/api.html#res" rel="nofollow" target="_blank">响应对象</a>，通过路由处理程序签名中的 <code>@Res()</code> 装饰器注入（例如 <code>findAll(@Res() response)</code>）。这种方法让你可以使用该对象暴露的原生响应处理方法。例如，使用 Express 时，你可以通过类似 <code>response.status(200).send()</code> 的代码来构造响应。
    </td>
  </tr>
</table>

> warning **警告** 当处理程序使用 `@Res()` 或 `@Next()` 时，Nest 会检测到，这表明你选择了特定于库的选项。如果同时使用两种方法，标准方法将在该路由上被**自动禁用**，并且不再按预期工作。要将它们结合使用（例如，仅注入响应对象以设置 cookie 或标头，而将其他部分留给框架处理），请在 `@Res({ passthrough: true })` 装饰器中将 `passthrough` 选项设置为 `true`。

<app-banner-observe></app-banner-observe>

#### 请求对象

处理程序通常需要访问客户端的**请求**详细信息。Nest 提供了对底层平台（默认为 Express）的 [request object](https://expressjs.com/en/api.html#req) 的访问。要访问它，请在处理程序签名中添加 `@Req()` 装饰器，这会指示 Nest 注入它。

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

> info **提示** 要利用 `express` 类型（如上面的 `request: Request` 参数），请安装 `@types/express` 包。

请求对象表示 HTTP 请求，并具有查询字符串、路由参数、HTTP 标头和正文（参见 [Express documentation](https://expressjs.com/en/api.html#req)）等属性。在大多数情况下，你不需要手动访问这些属性。相反，请使用开箱即用的专用装饰器，例如 `@Body()` 或 `@Query()`。下表列出了提供的装饰器及其所代表的平台特定对象。

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
      <td>请求 cookie / 名为 <code>name</code> 的 cookie（参见 <a routerLink="/techniques/cookies">Cookies</a>）</td>
    </tr>
    <tr>
      <td><code>@SignedCookies(name?: string)</code></td>
      <td>已验证的签名 cookie / 名为 <code>name</code> 的签名 cookie</td>
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

<sup>\* </sup>为了与底层 HTTP 平台（例如 Express 和 Fastify）的类型兼容，Nest 提供了 `@Res()` 和 `@Response()` 装饰器。`@Res()` 是 `@Response()` 的别名。两者都直接暴露底层平台的原生 `response` 对象。使用它们时，还请安装底层库的类型定义（例如 `@types/express`）以充分利用它们。当你在路由处理程序中注入 `@Res()` 或 `@Response()` 时，你会让 Nest 对该处理程序进入**特定于库模式**，并且你需要负责管理响应。然后你必须通过调用 `response` 对象上的方法来发送响应（例如 `res.json(...)` 或 `res.send(...)`）；否则，请求将挂起。

`@Body()`、`@Query()`、`@Param()` 和 `@RawBody()` 也接受带有 `schema` 和 `pipes` 属性的选项对象。这让你可以将 [Standard Schema](https://standardschema.dev/) 兼容的模式（例如使用 Zod、Valibot 或 ArkType 创建的模式）直接附加到路由参数上。

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

这些装饰器本身只将模式作为元数据附加。要基于它进行验证，请注册内置的 `StandardSchemaValidationPipe` 或读取 `metadata.schema` 的自定义管道。

> info **提示** 要了解如何创建你自己的装饰器，请参阅 [Custom route decorators](/custom-decorators) 章节。

#### 资源

之前，我们定义了一个用于获取 cats 资源的端点（**GET** 路由）。通常，我们还想要一个用于创建新记录的端点。让我们添加一个 **POST** 处理程序：

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

Nest 为所有标准 HTTP 方法提供了装饰器：`@Get()`、`@Post()`、`@Put()`、`@Delete()`、`@Patch()`、`@Options()`、`@Head()` 和 `@QueryMethod()`。最后一个映射到 `QUERY` 方法；它被命名为 `QueryMethod`，以避免与 `@Query()` 参数装饰器冲突。此外，`@All()` 定义了一个处理所有这些方法的端点。

#### 路由通配符

Nest 还支持基于模式的路由。例如，路径末尾的星号（`*`）充当通配符，匹配任意字符组合。在下面的示例中，对于任何以 `abcd/` 开头的路由，都会执行 `findAll()` 方法，无论后面有多少个字符。

```typescript
@Get('abcd/*')
findAll() {
  return 'This route uses a wildcard';
}

```

`'abcd/*'` 路由路径匹配 `abcd/`、`abcd/123`、`abcd/abc` 等。在基于字符串的路径中，连字符（`-`）和点（`.`）按字面解释。

这种方法在 Express 和 Fastify 中都适用。不过，Express v5 使其路由更加严格：在原生 Express 中，通配符必须命名，路由才能正常工作（例如 `abcd/{*splat&#125;`，其中 `splat` 是通配符参数的任意名称，没有特殊含义）。由于 Nest 为 Express 提供了兼容层，你仍然可以使用未命名的星号（`*`）作为通配符。

对于**路由中间**的星号，Express 要求使用命名通配符（例如 `ab{*splat&#125;cd`），而 Fastify 完全不支持它们。

#### 路由冲突与解析顺序

Nest 按声明顺序注册路由。因此，在顺序敏感的适配器（例如默认的 Express 适配器）上，参数化路由可能会悄无声息地遮蔽更具体的路由：

```typescript
@Controller('users')
export class UsersController {
  @Get(':id')
  findOne() {}

  @Get('me') // never reached: `:id` matches "me" first
  findMe() {}
}

```

这很容易被忽略：应用程序启动时没有任何警告，问题只在运行时才显现出来，即请求被分发到错误的处理程序时。像 `ParseIntPipe` 这样的管道在这里无济于事，因为路由会在任何管道运行*之前*选择处理程序。

NestJS v12 新增了两个可选的 `NestApplicationOptions` 属性来防止这种情况。两者默认都保持之前的行为，因此除非你设置它们，否则现有应用程序不受影响。

**`routeConflictPolicy`** 启用启动时诊断。对于每种冲突，它可以取 `'off'`（默认值）、`'warn'` 或 `'error'` 严重级别：

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
    <td>两个路由模式可以匹配同一个请求（例如 <code>/users/me</code> 和 <code>/users/:id</code>）。</td>
  </tr>
</table>

使用 `'error'` 时，所有有问题的路由对会被聚合到一个 `RouteConflictException` 中，在应用程序初始化时抛出（在 `app.init()` 中，或者如果你没有显式调用 `init()`，则在 `app.listen()` 中）。这样，你可以一次性看到所有冲突，而不是每次重启只看到一个。

**`routeResolutionStrategy`** 控制注册顺序。将其设置为 `'specificity'` 会优先注册最具体的路由（字面量段优先于参数段，参数段优先于通配符），因此上面的示例无论声明顺序如何都能正常工作：

```typescript
const app = await NestFactory.create(AppModule, {
  routeResolutionStrategy: 'specificity',
});

```

默认值为 `'declaration'`，它保持之前的行为。

> info **提示** 除了 `duplicate` 策略之外，这些选项只在注册顺序会影响匹配的适配器上才有意义。`ExpressAdapter` 是顺序敏感的；`FastifyAdapter` 则不是，因为它的路由器（`find-my-way`）已经按具体程度对路由进行了排序。在 Fastify 上，`shadow` 策略是空操作，`'specificity'` 排序没有效果，而 `duplicate` 策略在两个适配器上都会生效。`RouteConflictPolicy`、`RouteConflictPolicyLevel` 和 `RouteResolutionStrategy` 类型从 `@nestjs/common` 导出。

#### 状态码

如前所述，默认响应**状态码**是 **200**，但 POST 请求除外，其默认为 **201**。你可以在处理程序级别使用 `@HttpCode(...)` 装饰器来更改此行为。

```typescript
@Post()
@HttpCode(204)
create() {
  return 'This action adds a new cat';
}

```

> info **提示** 从 `@nestjs/common` 包中导入 `HttpCode`。

通常，状态码不是静态的，而是取决于各种因素。在这种情况下，请使用特定于库的**响应**对象（通过 `@Res()` 注入），或者在出错时抛出异常。

#### 响应头

要设置自定义响应头，请使用 `@Header()` 装饰器或特定于库的响应对象（并直接调用 `res.header()`）。

```typescript
@Post()
@Header('Cache-Control', 'no-store')
create() {
  return 'This action adds a new cat';
}

```

> info **提示** 从 `@nestjs/common` 包中导入 `Header`。

#### 重定向

要将响应重定向到特定 URL，请使用 `@Redirect()` 装饰器或特定于库的响应对象（并直接调用 `res.redirect()`）。

`@Redirect()` 接受两个可选参数，`url` 和 `statusCode`。如果省略，`statusCode` 默认为 `302`（`Found`）。

```typescript
@Get()
@Redirect('https://nestjs.com', 301)

```

> info **提示** 要动态确定 HTTP 状态码或重定向 URL，请返回一个遵循 `HttpRedirectResponse` 接口的对象（从 `@nestjs/common` 导出）。

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

当需要接受**动态数据**作为请求的一部分时（例如，`GET /cats/1` 获取 id 为 `1` 的猫），具有静态路径的路由就不起作用了。要定义带参数的路由，请在路由路径中添加路由参数**令牌**，以从 URL 中捕获动态值，如下例中的 `@Get()` 装饰器所示。然后，你可以使用添加到方法签名中的 `@Param()` 装饰器来访问这些路由参数。

> info **提示** 请将带参数的路由声明在任何静态路径之后，这样参数化路径就不会拦截发往静态路径的流量。有关在启动时检测此问题或为你解决此问题的选项，请参阅 [Route conflicts and resolution order](/overview/controllers#路由冲突与解析顺序)。

```typescript
@Get(':id')
findOne(@Param() params: any): string {
  console.log(params.id);
  return `This action returns a #${params.id} cat`;
}

```

`@Param()` 装饰器装饰一个方法参数（上例中的 `params`），使**路由**参数在该方法内部作为该参数的属性可用。如代码所示，你可以通过 `params.id` 访问 `id` 参数。或者，向装饰器传递特定的参数令牌，并在方法体中按名称直接引用路由参数。

> info **提示** 从 `@nestjs/common` 包中导入 `Param`。

```typescript
@Get(':id')
findOne(@Param('id') id: string): string {
  return `This action returns a #${id} cat`;
}

```

#### 子域路由

`@Controller()` 装饰器可以接受一个 `host` 选项，要求传入请求的 HTTP 主机与特定值匹配。

```typescript title="admin.controller.ts"
@Controller({ host: 'admin.example.com' })
export class AdminController {
  @Get()
  index(): string {
    return 'Admin page';
  }
}

```

> warning **警告** 由于 **Fastify** 不支持嵌套路由器，如果你依赖子域路由，请使用默认的 Express 适配器。

与路由 `path` 类似，`host` 选项可以使用令牌来捕获主机名中该位置的动态值，如下面 `@Controller()` 装饰器中的主机参数令牌所示。你可以使用添加到方法签名中的 `@HostParam()` 装饰器来访问以这种方式声明的主机参数。

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

来自其他编程语言的开发者可能会惊讶地发现，在 Nest 中，几乎所有内容都在传入请求之间共享。这包括数据库连接池、具有全局状态的单例服务等资源。Node.js 不遵循请求/响应多线程无状态模型，在该模型中每个请求由单独的线程处理。因此，在 Nest 中使用单例实例是完全**安全**的。

话虽如此，某些边缘情况可能需要控制器具有基于请求的生命周期，例如 GraphQL 应用程序中的按请求缓存、请求跟踪或多租户。要了解如何控制这一点，请参阅 [Injection scopes](/fundamentals/provider-scopes)。

#### 异步性

现代 JavaScript 严重依赖**异步**数据处理，Nest 完全支持 `async` 函数。`async` 函数总是返回一个 `Promise`，因此路由处理程序可以返回一个延迟值，Nest 会自动解析它：

```typescript title="cats.controller.ts"
@Get()
async findAll(): Promise<any[]> {
  return [];
}

```

路由处理程序也可以返回 RxJS [observable streams](https://rxjs.dev/guide/observable)。Nest 在内部订阅该流，并在流完成后解析最后发出的值。

```typescript title="cats.controller.ts"
@Get()
findAll(): Observable<any[]> {
  return of([]);
}

```

两种方法都是有效的；选择最适合你需求的一种。

#### 请求负载

上一个示例中的 POST 路由处理程序没有接受任何客户端参数。让我们通过添加 `@Body()` 装饰器来解决这个问题。

在继续之前（如果你使用 TypeScript），我们需要定义 **DTO**（数据传输对象）模式。DTO 是一个定义通过网络发送的数据形状的对象。你可以使用 **TypeScript** 接口或普通类来定义 DTO 模式，但推荐使用**类**。类是 JavaScript ES6 标准的一部分，因此在编译后的 JavaScript 中会作为真实实体保留下来。相比之下，TypeScript 接口在转译过程中会被移除，因此 Nest 无法在运行时引用它们。这一点很重要，因为**管道**等功能依赖于在运行时访问变量的元类型，而这只有使用类才能实现。

创建 `CreateCatDto` 类：

```typescript title="create-cat.dto.ts"
export class CreateCatDto {
  name: string;
  age: number;
  breed: string;
}

```

它有三个基本属性。现在我们可以在 `CatsController` 中使用新的 DTO：

```typescript title="cats.controller.ts"
@Post()
async create(@Body() createCatDto: CreateCatDto) {
  return 'This action adds a new cat';
}

```

> info **提示** `ValidationPipe` 可以过滤掉路由处理程序不应接收的属性。你将可接受的属性列入白名单，任何不在白名单中的属性都会自动从结果对象中剥离。在 `CreateCatDto` 示例中，白名单由 `name`、`age` 和 `breed` 属性组成。在 [Stripping properties](/techniques/validation#剥离属性) 中了解更多。

#### 查询参数

要从传入请求中提取查询参数，请使用 `@Query()` 装饰器。

考虑一个根据查询参数（如 `age` 和 `breed`）过滤猫列表的路由。首先，在 `CatsController` 中定义查询参数：

```typescript title="cats.controller.ts"
@Get()
async findAll(@Query('age') age: number, @Query('breed') breed: string) {
  return `This action returns all cats filtered by age: ${age} and breed: ${breed}`;
}

```

在此示例中，`@Query()` 装饰器从查询字符串中提取 `age` 和 `breed` 的值。例如，对以下地址的请求：

```plaintext
GET /cats?age=2&breed=Persian

```

会导致 `age` 为 `'2'`，`breed` 为 `'Persian'`。查询参数值以字符串形式到达，仅靠 `number` 类型注解不会转换它们。要接收数字，请应用诸如 `ParseIntPipe` 之类的管道（参见 [Pipes](/pipes)）。

如果你的应用程序需要处理更复杂的查询参数，例如嵌套对象或数组：

```plaintext
?filter[where][name]=John&filter[where][age]=30
?item[]=1&item[]=2

```

请配置你的 HTTP 适配器（Express 或 Fastify）以使用合适的查询解析器。在 Express 中，使用 `extended` 解析器，它支持丰富的查询对象：

```typescript title="main.ts"
const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.set('query parser', 'extended');

```

在 Fastify 中，使用 `querystringParser` 选项：

```typescript title="main.ts"
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({
    querystringParser: (str) => qs.parse(str),
  }),
);

```

> info **提示** `qs` 是一个支持嵌套和数组的查询字符串解析器。使用 `npm install qs` 安装它。

#### 处理错误

错误处理（即处理异常）在 [Exception filters](/overview/exception-filters) 章节中介绍。

#### 在生产环境中观测路由

在你的机器上表现完美的控制器，在真实流量下可能表现截然不同。在生产环境中，问题从来不是"这条路由能工作吗？"，而是"为什么在周二部署之后 `GET /cats/:id` 从 40 ms 变成了 900 ms，是所有请求都这样，还是只有某个倒霉的租户？"

路由处理器是回答这个问题的天然单元，而 [NestJS Observe](https://www.observe.nestjs.com/ 'NestJS Observe') 正是以该单元为粒度进行报告的。由于 `@nestjs/observe` SDK 接入的是 Nest 自身的请求生命周期，而不是包装 HTTP 服务器，因此每次测量都会用你声明的路由模式进行标记（`GET /cats/:id`，而不是 10,000 个不同的 URL）。因此，每条路由都是一行记录，你可以对其进行排序、绘制图表并设置告警：

```typescript
const app = await NestFactory.create(AppModule, {
  instrument: ObserveInstrument,
});

```

再加上将 `ObserveModule.forRoot()` 导入到你的根模块，这就是整个集成过程。从那里开始，找到一条慢路由只需三次点击：按 p95 对路由列表排序；打开该操作，查看性能退化是持续性的还是突发性的，以及它是否从某个版本开始出现；然后打开一次慢执行，阅读其瀑布图，看看是哪个控制器、服务方法或查询占用了时间。时间按**类和方法**归属，并减去等待时间，因此 `CatsService.findOne()` 在自己的代码中花费 800 ms，与 `CatsService.findOne()` 在数据库上等待 800 ms 可以立即区分开来。

请参阅 [Observability](/observability/overview) 章节进行设置，并参阅 [Dashboard](/observability/dashboard) 了解从告警一直到单个请求的完整流程。

#### 完整资源示例

以下示例使用若干可用的装饰器来创建一个基本控制器。该控制器暴露了几个方法来访问和操作内部数据。

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

> info **提示** Nest CLI 提供了一个生成器（schematic），可以自动创建**所有样板代码**，因此你无需手动编写。在 [CRUD generator](/recipes/crud-generator) 章节中了解更多。

#### 启动并运行

即使 `CatsController` 已完全定义，Nest 仍然不知道它的存在，也不会创建该类的实例。

控制器必须始终属于某个模块，这就是我们在 `@Module()` 装饰器中包含 `controllers` 数组的原因。由于除了根 `AppModule` 之外我们还没有定义任何模块，我们将使用它来注册 `CatsController`：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { CatsController } from './cats/cats.controller.js';

@Module({
  controllers: [CatsController],
})
export class AppModule {}

```

通过 `@Module()` 装饰器将这一元数据附加到模块类上，Nest 就能确定要挂载哪些控制器。

#### 特定于库的方式

到目前为止，我们已经介绍了操作响应的标准 Nest 方式。另一种方式是使用特定于库的 [response object](https://expressjs.com/en/api.html#res)，通过 `@Res()` 装饰器注入。为了突出差异，让我们将 `CatsController` 重写如下：

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

这种方式通过完全控制响应对象（例如操作响应头以及访问特定于库的功能）提供了更大的灵活性，但应谨慎使用。它通常不够清晰，并且有一些缺点。主要缺点是你的代码会变得依赖于平台，因为不同的底层库可能在响应对象上暴露不同的 API。它还会使测试更加困难，因为除其他事项外，你需要模拟响应对象。

此外，这种方式会失去与依赖标准响应处理的 Nest 特性（例如拦截器和 `@HttpCode()` / `@Header()` 装饰器）的兼容性。为解决这个问题，请启用 `passthrough` 选项：

```typescript
@Get()
findAll(@Res({ passthrough: true }) res: Response) {
  res.status(HttpStatus.OK);
  return [];
}

```

这样，你就可以与原生响应对象交互（例如，根据特定条件设置 Cookie 或响应头），同时将其他部分交给框架处理。