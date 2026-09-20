<!-- 此文件从 content/security/csrf.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T07:54:50.262Z -->
<!-- 源文件: content/security/csrf.md -->
<!-- 源哈希: 6e21a26dd1a75f8963bba1a71f816e91 -->

### CSRF 保护

跨站请求伪造（CSRF 或 XSRF）是一种攻击类型，其中**未授权的**命令从受信任的用户发送到 Web 应用程序。为了帮助防止这种情况，您可以使用 [csrf-csrf](https://github.com/Psifi-Solutions/csrf-csrf) 包。

#### 与 Express 一起使用（默认）

首先安装所需的包：

```bash
$ npm i csrf-csrf

```

> warning **警告** 如 [csrf-csrf documentation](https://github.com/Psifi-Solutions/csrf-csrf?tab=readme-ov-file#入门) 中所述，此中间件需要预先初始化会话中间件或 `cookie-parser`。请参阅文档以了解更多详情。

安装完成后，将 `csrf-csrf` 中间件注册为全局中间件。

```typescript
import { doubleCsrf } from 'csrf-csrf';
// ...
// somewhere in your initialization file
const {
  invalidCsrfTokenError, // This is provided purely for convenience if you plan on creating your own middleware.
  generateToken, // Use this in your routes to generate and provide a CSRF hash, along with a token cookie and token.
  validateRequest, // Also a convenience if you plan on making your own middleware.
  doubleCsrfProtection, // This is the default CSRF protection middleware.
} = doubleCsrf(doubleCsrfOptions);
app.use(doubleCsrfProtection);

```

#### 与 Fastify 一起使用

首先安装所需的包：

```bash
$ npm i --save @fastify/csrf-protection

```

安装完成后，按如下方式注册 `@fastify/csrf-protection` 插件：

```typescript
import fastifyCsrf from '@fastify/csrf-protection';
// ...
// somewhere in your initialization file after registering some storage plugin
await app.register(fastifyCsrf);

```

> warning **警告** 如 `@fastify/csrf-protection` 文档 [here](https://github.com/fastify/csrf-protection#用法) 中所述，此插件需要先初始化存储插件。请参阅该文档以获取更多说明。