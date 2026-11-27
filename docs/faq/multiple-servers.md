<!-- 此文件从 content/faq/multiple-servers.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T23:13:21.239Z -->
<!-- 源文件: content/faq/multiple-servers.md -->
<!-- 源哈希: fd3102f425759128c9f61864109b9350 -->

### HTTPS

要创建一个使用 HTTPS 协议的应用程序，请在传递给 `NestFactory.create()` 方法的选项对象中设置 `httpsOptions` 属性：

```typescript
const httpsOptions = {
  key: fs.readFileSync('./secrets/private-key.pem'),
  cert: fs.readFileSync('./secrets/public-certificate.pem'),
};
const app = await NestFactory.create(AppModule, {
  httpsOptions,
});
await app.listen(process.env.PORT ?? 3000);

```

如果你使用 `FastifyAdapter`，请按如下方式创建应用程序：

```typescript
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({ https: httpsOptions }),
);

```

#### 多个同时运行的服务器

以下示例展示了如何创建一个在多个端口上同时监听的 Nest 应用程序（例如，在 HTTP 端口和 HTTPS 端口上）：

```typescript
const httpsOptions = {
  key: fs.readFileSync('./secrets/private-key.pem'),
  cert: fs.readFileSync('./secrets/public-certificate.pem'),
};

const server = express();
const app = await NestFactory.create(AppModule, new ExpressAdapter(server));
await app.init();

const httpServer = http.createServer(server).listen(3000);
const httpsServer = https.createServer(httpsOptions, server).listen(443);

```

因为我们使用 `http.createServer()` 和 `https.createServer()` 自己创建了服务器，所以当你调用 `app.close()` 或进程接收到终止信号时，Nest 不会自动关闭它们。你需要自己关闭它们，例如使用实现 `OnApplicationShutdown` 钩子的提供者：

```typescript
@Injectable()
export class ShutdownObserver implements OnApplicationShutdown {
  private httpServers: http.Server[] = [];

  public addHttpServer(server: http.Server): void {
    this.httpServers.push(server);
  }

  public async onApplicationShutdown(): Promise<void> {
    await Promise.all(
      this.httpServers.map(
        (server) =>
          new Promise((resolve, reject) => {
            server.close((error) => {
              if (error) {
                reject(error);
              } else {
                resolve(null);
              }
            });
          }),
      ),
    );
  }
}

const shutdownObserver = app.get(ShutdownObserver);
shutdownObserver.addHttpServer(httpServer);
shutdownObserver.addHttpServer(httpsServer);

```

> info **提示** `ExpressAdapter` 从 `@nestjs/platform-express` 包导入。`http` 和 `https` 模块内置于 Node.js。

> warning **警告** 此示例不适用于 [GraphQL subscriptions](/graphql/subscriptions)。