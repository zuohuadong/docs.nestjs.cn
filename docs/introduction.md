<!-- 此文件从 content/introduction.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:33:01.753Z -->
<!-- 源文件: content/introduction.md -->
<!-- 源哈希: f9117e2b2079efd6d00729f08da37c5d -->

### 简介

Nest (NestJS) 是一个用于构建高效、可扩展的 [Node.js](https://nodejs.org/) 服务器端应用程序的框架，从单个文件的小型 API 到拥有多个团队的企业级系统均可支持。它使用渐进式 JavaScript，使用并完全支持 [TypeScript](https://www.typescriptlang.org/)（同时仍允许您编写纯 JavaScript），并结合了 OOP（面向对象编程）、FP（函数式编程）和 FRP（函数式响应式编程）的元素。

在底层，Nest 使用健壮的 HTTP 服务器框架，如 [Express](https://expressjs.com/)（默认），并且可以选择配置为使用 [Fastify](https://github.com/fastify/fastify) 或 Node.js 自身的 `node:http`（参见 [HTTP adapters](/techniques/performance)）。要将 Nest 与这些框架以及 Hono 进行比较，请参阅 [Nest vs Fastify, Express and Hono](/faq/nest-vs-fastify-express-hono)。

在 `node:http` 上，通过 [`NodeAdapter`](/techniques/performance#node-adapter)，Nest 每秒处理的请求比纯 Fastify 少约 3%，比 Express 多约 50%（[benchmark](/faq/nest-vs-fastify-express-hono#性能)）。

Nest 在这些常见的 Node.js 框架（Express 和 Fastify）之上提供了一层抽象，同时也将它们的 API 直接暴露给开发者。这为您提供了自由，可以使用底层平台提供的无数第三方模块。

#### 理念

近年来，得益于 Node.js，JavaScript 已成为前端和后端应用程序的“通用语言”。这催生了诸如 [Angular](https://angular.dev/)、[React](https://github.com/facebook/react) 和 [Vue](https://github.com/vuejs/core) 等项目，它们提高了开发人员的生产力，并支持创建快速、可测试和可扩展的前端应用程序。然而，尽管存在大量优秀的库、辅助工具和 Node.js（和服务器端 JavaScript）工具，但没有一个能有效解决**架构**这一核心问题。

Nest 提供了一个开箱即用的应用程序架构，使开发人员和团队能够创建高度可测试、可扩展、松耦合和可维护的应用程序。该架构深受 Angular 的启发。

#### 安装

要开始，您可以使用 [Nest CLI](/cli/overview) 或 [clone a starter project](#alternatives) 来脚手架项目。两者产生相同的结果。

使用 Nest CLI 脚手架项目，运行以下命令。它们会创建一个新的项目目录，并用初始核心 Nest 文件和支持模块填充它，为您的项目提供一个常规的基础结构。我们推荐首次使用的用户使用 **Nest CLI**，[First steps](/first-steps) 章将继续使用此方法。

```bash
$ npm i -g @nestjs/cli
$ nest new project-name

```

对于小型项目或第一个版本，`nest new project-name --minimal` 会生成一个代码为 [one file](/cli/usages#one-file-projects) 的应用程序。

Nest 还拥有针对大多数后端所需的第一方包，例如 [authentication](/security/authentication)、[mail](/application/mail)、[file storage](/application/file-storage)、[webhooks](/http/webhooks)、[queues](/techniques/queues)、[AI](/ai/overview) 和 [MCP](/mcp/overview)，因此在添加其他库之前请检查它们。

#### 替代方案

或者，您可以使用 **Git** 安装 TypeScript 启动项目：

```bash
$ git clone https://github.com/nestjs/typescript-starter.git project
$ cd project
$ npm install
$ npm run start

```

> info **提示** 要克隆仓库而不包含其 Git 历史记录，请使用 [degit](https://github.com/Rich-Harris/degit)。

打开您的浏览器并导航到 [`http://localhost:3000/`](http://localhost:3000/)。

要安装启动项目的 JavaScript 版本，请在上述命令序列中使用 `javascript-starter.git`。

您也可以通过自行安装核心和支持包从零开始启动新项目。在这种情况下，您需要自己设置项目样板文件。最少需要这些依赖项：`@nestjs/core`、`@nestjs/common`、`rxjs` 和 `reflect-metadata`。要了解如何以这种方式创建完整项目的操作指南，请参阅 [5 steps to create a bare minimum NestJS app from scratch](https://dev.to/micalevisk/5-steps-to-create-a-bare-minimum-nestjs-app-from-scratch-5c3b)。