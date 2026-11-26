<!-- 此文件从 content/recipes/hot-reload.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T22:08:31.644Z -->
<!-- 源文件: content/recipes/hot-reload.md -->
<!-- 源哈希: 6297e046c5160674385b4da43617c648 -->

### 热重载

**TypeScript 编译**对应用程序的引导时间影响最大。使用 [webpack](https://github.com/webpack/webpack) HMR（热模块替换），每次发生更改时都不需要重新编译整个项目。这显著减少了实例化应用程序所需的时间，并使迭代开发速度更快。

> warning **警告** `webpack` 不会自动将您的资源（例如 `graphql` 文件）复制到 `dist` 文件夹。同样，`webpack` 不兼容静态 glob 路径（例如 `entities` 中的 `TypeOrmModule` 属性）。

> warning **警告** 从 NestJS v12 开始，webpack 构建器已**弃用**，Rspack 是 Monorepo 的默认打包器。此配方针对基于 webpack 的 CommonJS 项目，因此下面的示例使用 `module.hot` 和一个纯粹的 `bootstrap()` 调用，而不是这些文档中其他地方使用的 ESM 顶层 `await`。对于新项目，请优先使用 `--builder rspack`。

### 使用 CLI

如果使用 [Nest CLI](/cli/overview)，配置过程很简单。CLI 包装了 `webpack`，允许您使用 `HotModuleReplacementPlugin`。

#### 安装

首先，安装所需的包：

```bash
$ npm i --save-dev webpack-node-externals run-script-webpack-plugin webpack

```

> info **提示** 如果使用 **Yarn Berry**（而非经典 Yarn），请安装 `webpack-pnp-externals` 包而不是 `webpack-node-externals`。

#### 配置

安装完成后，在应用程序的根目录中创建一个 `webpack-hmr.config.js` 文件：

```typescript
const nodeExternals = require('webpack-node-externals');
const { RunScriptWebpackPlugin } = require('run-script-webpack-plugin');

module.exports = function (options, webpack) {
  return {
    ...options,
    entry: ['webpack/hot/poll?100', options.entry],
    externals: [
      nodeExternals({
        allowlist: ['webpack/hot/poll?100'],
      }),
    ],
    plugins: [
      ...options.plugins,
      new webpack.HotModuleReplacementPlugin(),
      new webpack.WatchIgnorePlugin({
        paths: [/\.js$/, /\.d\.ts$/],
      }),
      new RunScriptWebpackPlugin({ name: options.output.filename, autoRestart: false }),
    ],
  };
};

```

> info **提示** 如果使用 **Yarn Berry**（而非经典 Yarn），请不要在 `externals` 配置属性中使用 `nodeExternals`，而是使用来自 `webpack-pnp-externals` 包的 `WebpackPnpExternals`：`WebpackPnpExternals({ exclude: ['webpack/hot/poll?100'] })`。

此函数将包含默认 webpack 配置的原始对象作为第一个参数，将 Nest CLI 使用的底层 `webpack` 包的引用作为第二个参数。它返回一个带有 `HotModuleReplacementPlugin`、`WatchIgnorePlugin` 和 `RunScriptWebpackPlugin` 插件的修改后的 webpack 配置。

#### 热模块替换

要启用 **HMR**，打开应用程序入口文件（`main.ts`）并添加以下与 webpack 相关的指令：

```typescript
declare const module: any;

async function bootstrap() {
  if (module.hot?.data?.closePromise) {
    // wait for the previous application instance to fully shut down
    await module.hot.data.closePromise;
  }

  const app = await NestFactory.create(AppModule, {
    forceCloseConnections: !!module.hot,
  });
  await app.listen(process.env.PORT ?? 3000);

  if (module.hot) {
    module.hot.accept();
    module.hot.dispose((data: any) => {
      data.closePromise = app.close();
    });
  }
}
bootstrap();

```

> info **提示** `app.close()` 是异步的，但 webpack 不会等待 `dispose()` 回调。将返回的 promise 存储在 `module.hot.data` 上，允许下一个应用程序实例在重新绑定端口之前等待它，这（与 `forceCloseConnections` 一起）可防止重载时的 `EADDRINUSE` 错误。

为简化执行过程，向您的 `package.json` 文件添加一个脚本：

```json
"start:dev": "nest build --webpack --webpackPath webpack-hmr.config.js --watch"

```

然后运行以下命令：

```bash
$ npm run start:dev

```

### 不使用 CLI

如果不使用 [Nest CLI](/cli/overview)，配置会稍微复杂一些，需要更多的手动步骤。

#### 安装

首先，安装所需的包：

```bash
$ npm i --save-dev webpack webpack-cli webpack-node-externals ts-loader run-script-webpack-plugin

```

> info **提示** 如果使用 **Yarn Berry**（而非经典 Yarn），请安装 `webpack-pnp-externals` 包而不是 `webpack-node-externals`。

#### 配置

安装完成后，在应用程序的根目录中创建一个 `webpack.config.js` 文件：

```typescript
const webpack = require('webpack');
const path = require('path');
const nodeExternals = require('webpack-node-externals');
const { RunScriptWebpackPlugin } = require('run-script-webpack-plugin');

module.exports = {
  entry: ['webpack/hot/poll?100', './src/main.ts'],
  target: 'node',
  externals: [
    nodeExternals({
      allowlist: ['webpack/hot/poll?100'],
    }),
  ],
  module: {
    rules: [
      {
        test: /.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  mode: 'development',
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  plugins: [new webpack.HotModuleReplacementPlugin(), new RunScriptWebpackPlugin({ name: 'server.js', autoRestart: false })],
  output: {
    path: path.join(__dirname, 'dist'),
    filename: 'server.js',
  },
};

```

> info **提示** 如果使用 **Yarn Berry**（而非经典 Yarn），请不要在 `externals` 配置属性中使用 `nodeExternals`，而是使用来自 `webpack-pnp-externals` 包的 `WebpackPnpExternals`：`WebpackPnpExternals({ exclude: ['webpack/hot/poll?100'] })`。

此配置告诉 webpack 关于您的应用程序的一些基本信息：入口文件的位置、包含**编译**文件的目录以及用于编译源文件的加载器。即使您不完全理解所有选项，通常也可以按原样使用此文件。

#### 热模块替换

要启用 **HMR**，打开应用程序入口文件（`main.ts`）并添加以下与 webpack 相关的指令：

```typescript
declare const module: any;

async function bootstrap() {
  if (module.hot?.data?.closePromise) {
    // wait for the previous application instance to fully shut down
    await module.hot.data.closePromise;
  }

  const app = await NestFactory.create(AppModule, {
    forceCloseConnections: !!module.hot,
  });
  await app.listen(process.env.PORT ?? 3000);

  if (module.hot) {
    module.hot.accept();
    module.hot.dispose((data: any) => {
      data.closePromise = app.close();
    });
  }
}
bootstrap();

```

> info **提示** `app.close()` 是异步的，但 webpack 不会等待 `dispose()` 回调。将返回的 promise 存储在 `module.hot.data` 上，允许下一个应用程序实例在重新绑定端口之前等待它，这（与 `forceCloseConnections` 一起）可防止重载时的 `EADDRINUSE` 错误。

为简化执行过程，向您的 `package.json` 文件添加一个脚本：

```json
"start:dev": "webpack --config webpack.config.js --watch"

```

然后运行以下命令：

```bash
$ npm run start:dev

```

#### 示例

GitHub 上的 [webpack sample](https://github.com/nestjs/nest/tree/master/sample/08-webpack) 提供了可工作的示例。