<!-- 此文件从 content/fundamentals/platform-agnosticism.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:35:32.134Z -->
<!-- 源文件: content/fundamentals/platform-agnosticism.md -->
<!-- 源哈希: 92e583f427225be6ca577cb2f49267e8 -->

### 平台无关性

Nest 是一个平台无关的框架。您可以开发**可重用的逻辑部分**，并在不同类型的应用程序中使用它们。例如，大多数组件可以在不同的底层 HTTP 服务器框架（例如 Express 和 Fastify）之间，甚至在不同_类型_的应用程序（例如 HTTP 服务器、具有不同传输层的微服务和 WebSocket）之间无需更改地重用。

#### 构建一次，随处使用

文档的**概述**部分主要展示了使用 HTTP 服务器框架的编码技术（例如提供 REST API 或 MVC 风格服务器端渲染的应用程序）。然而，所有这些构建块都可以基于不同的传输层（[microservices](/microservices/basics) 或 [WebSockets](/websockets/gateways)）使用。

Nest 还提供了一个专用的 [GraphQL](/graphql/quick-start) 模块。您可以将 GraphQL 作为 API 层与 REST API 互换使用。

此外，[application context](/standalone-applications) 功能允许您在 Nest 之上构建任何类型的 Node.js 应用程序，包括定时任务和 CLI 应用程序。

Nest 旨在成为一个成熟的 Node.js 应用程序平台，为您的应用程序带来更高层次的模块化和可重用性。构建一次，随处使用。