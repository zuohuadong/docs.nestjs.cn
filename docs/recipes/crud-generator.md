<!-- 此文件从 content/recipes/crud-generator.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T09:28:19.523Z -->
<!-- 源文件: content/recipes/crud-generator.md -->
<!-- 源哈希: 7f433a848faa1a8ade900ca55d15f955 -->

### CRUD 生成器（仅 TypeScript）

在项目的整个生命周期中，当我们构建新功能时，经常需要向应用程序添加新资源。这些资源通常需要多次重复操作，每次定义新资源时我们都必须重复这些操作。

#### 简介

让我们设想一个真实场景，我们需要为 2 个实体暴露 CRUD 端点，比如 **User** 和 **Product** 实体。按照最佳实践，对于每个实体，我们需要执行以下多项操作：

- 生成一个模块（`nest g mo`）来保持代码组织有序并建立清晰的边界（对相关组件进行分组）
- 生成一个控制器（`nest g co`）来定义 CRUD 路由（或 GraphQL 应用程序的查询/变更）
- 生成一个服务（`nest g s`）来实现并隔离业务逻辑
- 生成一个实体类/接口来表示资源的数据形状
- 生成数据传输对象（或 GraphQL 应用程序的输入）来定义数据如何通过网络发送

这步骤可真多！

为了加速这一重复过程，[Nest CLI](/cli/overview) 提供了一个生成器（schematic），自动生成所有样板代码，帮助我们避免手动完成所有这些工作，并让开发者体验更加简单。

> info **注意** 该 schematic 支持生成 **HTTP** 控制器、**微服务**控制器、**GraphQL** 解析器（包括代码优先和模式优先）以及 **WebSocket** 网关。

#### 生成新资源

要创建新资源，只需在项目根目录下运行以下命令：

```shell
$ nest g resource

```

`nest g resource` 命令不仅生成所有 NestJS 构建块（模块、服务、控制器类），还生成实体类、DTO 类以及测试（`.spec`）文件。

下面你可以看到生成的控制器文件（针对 REST API）：

```typescript
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(+id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(+id);
  }
}

```

此外，它会自动为所有 CRUD 端点创建占位符（REST API 的路由、GraphQL 的查询和变更、微服务和 WebSocket 网关的消息订阅）——无需你动手。

> warning **注意** 生成的服务类**不**绑定到任何特定的 **ORM（或数据源）**。这使得生成器足够通用，能满足任何项目的需求。默认情况下，所有方法都包含占位符，你可以根据项目的具体数据源进行填充。

同样，如果你想为 GraphQL 应用程序生成解析器，只需选择 `GraphQL (code first)`（或 `GraphQL (schema first)`）作为传输层。

在这种情况下，NestJS 将生成一个解析器类，而不是 REST API 控制器：

```shell
$ nest g resource users

> ? What transport layer do you use? GraphQL (code first)
> ? Would you like to generate CRUD entry points? Yes
> CREATE src/users/users.module.ts (224 bytes)
> CREATE src/users/users.resolver.spec.ts (525 bytes)
> CREATE src/users/users.resolver.ts (1109 bytes)
> CREATE src/users/users.service.spec.ts (453 bytes)
> CREATE src/users/users.service.ts (625 bytes)
> CREATE src/users/dto/create-user.input.ts (195 bytes)
> CREATE src/users/dto/update-user.input.ts (281 bytes)
> CREATE src/users/entities/user.entity.ts (187 bytes)
> UPDATE src/app.module.ts (312 bytes)

```

> info **提示** 要避免生成测试文件，你可以传递 `--no-spec` 标志，如下所示：`nest g resource users --no-spec`

我们可以在下面看到，不仅创建了所有样板变更和查询，而且一切都紧密连接在一起。我们使用了 `UsersService`、`User` 实体以及我们的 DTO。

```typescript
import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UsersService } from './users.service.js';
import { User } from './entities/user.entity.js';
import { CreateUserInput } from './dto/create-user.input.js';
import { UpdateUserInput } from './dto/update-user.input.js';

@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @Mutation(() => User)
  createUser(@Args('createUserInput') createUserInput: CreateUserInput) {
    return this.usersService.create(createUserInput);
  }

  @Query(() => [User], { name: 'users' })
  findAll() {
    return this.usersService.findAll();
  }

  @Query(() => User, { name: 'user' })
  findOne(@Args('id', { type: () => Int }) id: number) {
    return this.usersService.findOne(id);
  }

  @Mutation(() => User)
  updateUser(@Args('updateUserInput') updateUserInput: UpdateUserInput) {
    return this.usersService.update(updateUserInput.id, updateUserInput);
  }

  @Mutation(() => User)
  removeUser(@Args('id', { type: () => Int }) id: number) {
    return this.usersService.remove(id);
  }
}

```