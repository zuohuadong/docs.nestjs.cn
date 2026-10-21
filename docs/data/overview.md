<!-- 此文件从 content/data/overview.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T07:39:34.028Z -->
<!-- 源文件: content/data/overview.md -->
<!-- 源哈希: f686fd291657cf0f12c974c89951e768 -->

### 概述

Nest 与数据库无关，因此你可以将其与任何 SQL 或 NoSQL 数据库集成。在最基本的层面上，将 Nest 连接到数据库意味着为该数据库加载相应的 Node.js 驱动程序，就像使用 [Express](https://expressjs.com/en/guide/database-integration.html) 或 Fastify 时一样，并通过 [provider](/overview/providers) 使客户端可供应用程序的其余部分使用。

大多数应用程序在更高的抽象层次上工作，使用 ORM 或查询构建器。本类别中的章节涵盖以下集成：

- **[TypeORM](/data/typeorm)**（`@nestjs/typeorm`）：一个 ORM，具有基于装饰器的实体和仓储模式。它支持大多数 SQL 数据库以及 MongoDB。
- **[Drizzle](/data/drizzle)**（`@nestjs/drizzle`）：一个轻量级、TypeScript 优先的 ORM。你使用普通函数声明表，并使用类似 SQL 的查询构建器编写查询，Drizzle 会从模式中推断出每一种结果类型。
- **[MongoDB](/data/mongodb)**（`@nestjs/mongoose`）：用于 MongoDB 的 [Mongoose](https://mongoosejs.com/) 模式和模型。
- **[Prisma](/data/prisma)**：一个从模式文件生成类型安全客户端的 ORM。它没有 Nest 专用的包：你通过提供者暴露生成的客户端。
- **[MikroORM](/data/mikroorm)**（`@mikro-orm/nestjs`，由 MikroORM 团队维护）：一个基于数据映射器（Data Mapper）、工作单元（Unit of Work）和标识映射（Identity Map）模式的 ORM。
- **[Sequelize](/data/sequelize)**（`@nestjs/sequelize`）：一个用于 SQL 数据库的基于 Promise 的 ORM。使用 `sequelize-typescript` 包，你可以通过装饰器声明模型。

Nest 团队维护 `@nestjs/typeorm`、`@nestjs/drizzle`、`@nestjs/mongoose` 和 `@nestjs/sequelize` 包。它们添加了 Nest 特有的功能，例如仓储或模型注入、可测试性以及异步配置。

你也可以直接使用任何其他库。例如，了解如何 [build a Nest module for Knex.js](https://dev.to/nestjs/build-a-nestjs-module-for-knex-js-or-other-resource-based-libraries-in-5-minutes-12an)。要缓存查询结果，请参阅 [Caching](/data/caching)。