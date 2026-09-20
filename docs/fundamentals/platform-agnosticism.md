<!-- 此文件从 content/fundamentals/platform-agnosticism.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:18:29.687Z -->
<!-- 源文件: content/fundamentals/platform-agnosticism.md -->
<!-- 源哈希: 617ff56f370807f6a50e879433307aa7 -->

### 平台无关性

Nest 是一个平台无关的框架。这意味着您可以开发**可复用的逻辑部分**，这些部分可以用于不同类型的应用程序。例如，大多数组件可以在不同的底层 HTTP 服务器框架（如 Express 和 Fastify）之间无需修改地复用，甚至可以在不同类型的应用程序（如 HTTP 服务器框架、具有不同传输层的微服务以及 Web Sockets）之间复用。

#### 一次构建，随处使用

文档的**概述**部分主要展示了使用 HTTP 服务器框架的编码技术（例如，提供 REST API 或提供 MVC 风格的服务端渲染应用的应用程序）。然而，所有这些构建模块都可以在不同的传输层（[microservices](/microservices/basics) 或 [websockets](/websockets/gateways)）之上使用。

此外，Nest 附带了一个专用的 [GraphQL](/graphql/quick-start) 模块。您可以将 GraphQL 作为您的 API 层，与提供 REST API 互换使用。

另外，[application context](/application-context) 功能有助于在 Nest 之上创建任何类型的 Node.js 应用程序——包括 CRON 任务和 CLI 应用等。

Nest 致力于成为 Node.js 应用程序的功能完备平台，为您的应用程序带来更高级别的模块化和可复用性。一次构建，随处使用！