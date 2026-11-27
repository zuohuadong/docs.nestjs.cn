<!-- 此文件从 content/faq/versions.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T23:14:14.202Z -->
<!-- 源文件: content/faq/versions.md -->
<!-- 源哈希: b2fd9afc5f7b05ed0df6679ea5903f27 -->

### 版本兼容性

本页面列出了 Nest 的每个主要版本支持的 Node.js 和 RxJS 版本，并解释了如何将项目从一个主要版本迁移到下一个主要版本。

要检查项目使用的版本，请在项目根目录下运行 `nest info`，或查看 `package.json` 中的 `@nestjs/core` 版本。

#### 兼容性表

| Nest | Node.js | RxJS | 发布时间 |
| --- | --- | --- | --- |
| 12.x | v20.19+，或 22.x 系列上的 v22.12+ | 7.1+ | 2026年8月 |
| 11.x | v20+ | 7.1+ | 2025年1月 |
| 10.x | v16+ | 7.1+ | 2023年6月 |
| 9.x | v12+，但排除 v13 | 7.1+ | 2022年7月 |
| 8.x | v10.13+，但排除 v13 | 7.1+ | 2021年7月 |

**Node.js** 列显示了每个主要版本的文档要求的运行应用程序的版本。在 Nest 12 中，CLI 的生成器（`nest new`、`nest generate` 和 `nest upgrade`）需要比该版本更新的发布版本。有关详细信息，请参阅 [migration guide](/migration-guide) 中的 Node.js 要求。

**RxJS** 列显示了 `@nestjs/core` 和 `@nestjs/common` 的 `rxjs` 对等依赖范围，在所有这些版本中都是 `^7.1.0`。

伴随包，如 `@nestjs/config` 或 `@nestjs/swagger`，遵循其自身的发布线。请使用接受您的项目所在主要版本 `@nestjs/core` 和 `@nestjs/common` 的发布版本。

#### 跨主要版本迁移

每个迁移指南涵盖一个步骤，即从一个主要版本到下一个主要版本。本站始终显示最新步骤的指南。早期步骤的指南保留在它们升级到的版本的存档文档中：

| 从 | 到 | 迁移指南 |
| --- | --- | --- |
| v11 | v12 | [Migration guide](/migration-guide) |
| v10 | v11 | [docs.nestjs.com/v11/migration-guide](./v11/migration-guide) |
| v9 | v10 | [docs.nestjs.com/v10/migration-guide](./v10/migration-guide) |
| v8 | v9 | [docs.nestjs.com/v9/migration-guide](./v9/migration-guide) |
| v7 | v8 | [docs.nestjs.com/v8/migration-guide](./v8/migration-guide) |

由于每个指南仅描述两个相邻主要版本之间的更改，请**一次一个主要版本**升级落后多个版本的项目。按顺序遵循指南，并在开始下一步之前确保应用程序构建成功且测试通过。在每一步之前，请检查您的 Node.js 版本是否与上表的目标行匹配。

对于从 v11 到 v12 的步骤，CLI 提供了 `nest upgrade` 命令，该命令会更新您的包并应用迁移的机械部分。有关详细信息，请参阅 [nest upgrade](/cli/usages#nest-upgrade)。该命令不适用于早于 v11 的项目，因此请先将此类项目升级到 v11。

对于早期步骤，请自行更新包。框架包（`@nestjs/core`、`@nestjs/common`、`@nestjs/testing` 以及您使用的 `@nestjs/platform-*`、`@nestjs/microservices` 和 `@nestjs/websockets` 包），以及 `@nestjs/cli` 和 `@nestjs/schematics`，共享 Nest 的主要版本号。在一个命令中将它们移动到目标主要版本，以便 npm 一起解析它们的对等依赖。npm 会将每个包保留在其已所在的 `package.json` 部分。例如，从 v10 到 v11：

```bash
$ npm i @nestjs/core@11 @nestjs/common@11 @nestjs/platform-express@11 @nestjs/testing@11 @nestjs/cli@11 @nestjs/schematics@11

```

> info **提示** 如果您项目中的另一个包，例如 `@nestjs/config` 或 `@nestjs/swagger`，在其 `peerDependencies` 中不接受目标主要版本，npm 会报告对等依赖冲突。将该包添加到同一命令中，使用接受目标主要版本的发布版本。要查看某个发布版本接受什么，请运行 `npm view <package>@<version> peerDependencies`。

#### 旧主要版本

先前主要版本（回溯到 v4）的文档在其自己的路径下仍然可用，例如 [docs.nestjs.com/v11](./v11) 或 [docs.nestjs.com/v10](./v10)。