<!-- 此文件从 content/recipes/crud-generator.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:07:33.057Z -->
<!-- 源文件: content/recipes/crud-generator.md -->
<!-- 源哈希: 9a1cbad593f00fe073b34171d6494d8f -->

### CRUD 生成器 (仅限 TypeScript)

在项目的生命周期中，构建新功能通常意味着向应用程序添加新资源。每个新资源通常需要一组重复的操作。

#### 简介

考虑一个现实场景，你需要为两个 **User** 和 **Product** 实体暴露 CRUD 端点。遵循最佳实践，你需要为每个实体执行多个操作：

- 生成一个 **模块** (`nest g mo`)，以保持代码的组织性并建立清晰的边界（分组相关组件）
- 生成一个 **控制器** (`nest g co`)，用于定义 CRUD 路由（或 GraphQL 应用程序的查询/变更）
- 生成一个 **服务** (`nest g s`)，用于实现和隔离业务逻辑
- 生成一个 **实体** 类/接口来表示资源数据的形状
- 生成 **数据传输对象**（或 GraphQL 应用程序的输入）来定义数据如何在网络上传输

为了加速这个重复的过程，[Nest CLI](/cli/overview) 提供了一个生成器（示意图），可自动生成所有这些样板代码。

> info **注意** 该示意图支持生成 **HTTP** **控制器**、**微服务** **控制器**、**GraphQL** **解析器**（代码优先和模式优先）以及 **WebSocket** **网关**。

#### 生成新资源

要创建新资源，请在项目的根目录运行以下命令：

```shell
$ nest g resource

```

`nest g resource` 命令不仅生成 NestJS 构建块（**模块**、**服务** 和 **控制器** 类），还生成**实体**类、**DTO** 类和测试 (`.spec`) 文件。

这是生成的 **控制器** 文件（用于 REST API）：

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

该命令还为所有 CRUD 端点创建占位符：REST API 的路由、GraphQL 的查询和变更，以及微服务和 **WebSocket** **网关**的消息处理器。

> info **注意** 生成的 **服务** 类**不**与任何特定的 **ORM**（或数据源）绑定，这使得该生成器足够通用，可以满足任何项目的需求。默认情况下，所有方法都包含占位符，您可以将其填充为特定于您项目的**数据源**。

同样，要为 GraphQL 应用程序生成**解析器**，请选择 `GraphQL (code first)`（或 `GraphQL (schema first)`）作为您的传输层。

在这种情况下，Nest 生成一个**解析器**类而不是 REST API **控制器**：

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

> info **提示** 要跳过生成测试文件，请传递 `--no-spec` 标志，如下所示：`nest g resource users --no-spec`。

> info **提示** 要选择选项来回答问题，请传递 `--type`（`rest`、`graphql-code-first`、`graphql-schema-first`、`microservice` 或 `ws`）以及 `--crud` 或 `--no-crud`，例如 `nest g resource users --type rest --crud`。在没有终端、在 CI 环境下或使用 `--no-interactive` 时，CLI 不会提问：它使用默认值（`--type rest`、`--crud`）并打印它们。

如下所示，该命令不仅创建了所有样板**变更**和**查询**，还将所有内容连接起来，使用 `UsersService`、**实体** `User` 和 **DTO**。

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