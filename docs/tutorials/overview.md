<!-- 此文件从 content/tutorials/overview.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:57:08.655Z -->
<!-- 源文件: content/tutorials/overview.md -->
<!-- 源哈希: f2bb55e09ef57f84ebe92fee30239f9f -->

### Node.js 后端教程

使用 NestJS 在 TypeScript 中构建完整的 Node.js 后端的分步教程：REST 和 GraphQL API、MongoDB、微服务、MCP 服务器和 AI。

每个教程都构建了团队实际交付的应用程序，从一个空项目到可部署的代码，并链接到本文档的章节以获取每个部分的详细信息。它们使用当前的 API：使用 Zod 模式进行验证、Node 适配器、[`@nestjs/authentication`](/security/authentication)，以及在 PostgreSQL 上使用 Drizzle 或在 MongoDB 上使用 Mongoose。每个列表都来自一个已构建和测试的应用程序，页面上的每个输出都来自运行它。每个完成的应用程序也在 GitHub 上，如 `nestjs/example-<slug>`：例如 [nestjs/example-rest-api-jwt-authentication](https://github.com/nestjs/example-rest-api-jwt-authentication)。

大多数后端都是普通的 CRUD，因此教程将时间花在非普通的部分上：当两个请求同时到达时、当客户端重试时，或当令牌被盗时会发生什么。每个教程都使用真实的数据库来测试这些保证，而不是模拟数据。

#### 从哪里开始

从 [Build a REST API with JWT authentication in Node.js](/tutorials/rest-api-jwt-authentication) 开始。它从单个文件开始，然后添加请求验证、PostgreSQL 数据库、带访问和刷新令牌的注册、速率限制、安全标头、OpenAPI 文档、健康检查、JSON 日志和端到端测试。

大多数其他教程都从其完成的应用程序开始，然后添加其任务所需的组件。[Accept payments with webhooks](/tutorials/payments-webhooks) 则继续电子商务后端。

如果使用 MongoDB，请从 [Build a CRUD REST API with Node.js and MongoDB](/tutorials/mongodb-crud-api) 开始。它独立存在，从一个空项目开始。

#### 教程列表

| 教程 | 构建内容 | 解决的难题 |
| --- | --- | --- |
| [REST API with JWT authentication](/tutorials/rest-api-jwt-authentication) | 一个带有注册、访问和刷新令牌的笔记 API，使用 PostgreSQL、OpenAPI、健康检查和测试 | 刷新令牌重用、泄露账户的登录时序、竞态写入 |
| [Google login](/tutorials/google-login) | 笔记 API 的 Google 登录：来自 Web 和移动应用的 ID 令牌，兑换成 API 自身的 JWT，以及关联账户 | 绝不将账户交给第一个使用电子邮件注册的人，以及无论多少次首次登录的竞态问题 |
| [CRUD REST API with MongoDB](/tutorials/mongodb-crud-api) | 通过 Mongoose 在 MongoDB 上的产品目录：创建、列表、获取、部分更新和删除 | 格式错误的 ID 和非 500 错误的重复 SKU、操作符注入、永不重复或跳过的页面，以及不相互覆盖的编辑 |
| [GraphQL API](/tutorials/graphql-api) | 一个博客的 GraphQL API：带草稿的帖子、评论、游标分页、登录变更和评论订阅，基于 Apollo 和 PostgreSQL | 每个请求的 N+1 查询批处理、所有路径上隐藏的草稿和电子邮件、客户端可操作的错误代码，以及与 HTTP 具有相同检查的 WebSocket |
| [E-commerce backend](/tutorials/ecommerce-backend) | 仅限员工编辑的目录、购物车、结账、取消和运输 | 绝不销售超过库存量，无论多少客户同时结账 |
| [Multi-tenant SaaS backend](/tutorials/multi-tenant-saas) | 组织、角色、电子邮件邀请、租户拥有的项目、审计日志 | 确保每个查询都在其租户内部，以及绝不丢失组织最后所有者 |
| [Project-management API](/tutorials/project-management-api) | 项目、任务和评论，通过服务端推送事件进行实时更新，到期日期提醒 | 按记录检查权限，以及不相互覆盖的状态更改 |
| [Real-time chat backend](/tutorials/realtime-chat) | 一个带有房间、消息历史、在线状态和输入指示器的 WebSocket 网关 | 验证 Socket 认证，并在每条消息上检查成员资格 |
| [Booking system](/tutorials/booking-system) | 可预订资源、每日免费时段、预订和取消 | 没有重复预订，由数据库保证 |
| [Emails and background jobs](/tutorials/background-jobs) | 一封欢迎邮件和每日摘要，从 BullMQ 队列发送 | 邮件绝不丢失或发送两次，以及在单个实例上运行的定时任务 |
| [File upload service](/tutorials/file-uploads) | 上传、下载、过期链接和每用户配额，基于磁盘或 S3 | 流式传输时检查类型和大小，以及并发上传下的配额 |
| [Payments with webhooks](/tutorials/payments-webhooks) | 电子商务后端的支付，由提供者的签名 Webhook 确认 | 确保每个支付事件只应用一次，顺序不限 |
| [AI chat backend](/tutorials/ai-chat-backend) | 基于用户笔记的聊天机器人，工具和答案流式传输到浏览器 | 工具只能看到用户自己的数据，并在浏览器关闭时停止模型 |
| [MCP server](/tutorials/mcp-server) | 一个帮助台的 MCP 服务器：用于搜索和回复工单的工具、工单作为资源、回复提示，通过可流式传输的 HTTP 和 stdio | OAuth 访问令牌作为资源服务器进行验证，一个团队的令牌绝不会到达另一个团队的工单，以及模型无法绕过的写入作用域 |
| [Microservices with RabbitMQ](/tutorials/microservices-rabbitmq) | 一个单体仓库中的订单 API 和履约工作进程，通过 RabbitMQ 使用事件和请求-响应通信 | 消息绝不会因崩溃或代理中断而丢失，有毒消息被死信队列处理，每个事件只处理一次 |

#### 所需条件

- Node.js 22 或更高版本，以及 [Nest CLI](/cli/overview)。
- Docker，用于本地运行 PostgreSQL、MongoDB、RabbitMQ 和 Redis（适用于使用它们的教程）。
- `curl`，用于测试端点。每个教程还提供其 OpenAPI 文档和 Swagger UI。

AI 聊天教程无需模型提供者的 API 密钥即可运行：它使用脚本化模型，并展示了真实模型的配置。

#### 更多

- 决定 Nest 是否适合您的项目：[Nest vs Fastify, Express and Hono](/faq/nest-vs-fastify-express-hono)。
- 迁移现有应用程序：[Migrating from Express](/migrating/express) 和 [Migrating from Fastify](/migrating/fastify)。
- 查看您的 API 在生产环境中的行为：[NestJS Observe](/observability/overview)。