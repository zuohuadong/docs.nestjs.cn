<!-- 此文件从 content/faq/multiple-servers.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T07:38:55.457Z -->
<!-- 源文件: content/faq/multiple-servers.md -->
<!-- 源哈希: 661549589cb03a0e0f0dd9b46eaf76e8 -->

### HTTPS

要创建使用 HTTPS 协议的应用程序，请在传递给 `NestFactory` 类的 `create()` 方法的选项对象中设置 `httpsOptions` 属性：

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

如果您使用 `FastifyAdapter`，请按如下方式创建应用程序：

```typescript
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({ https: httpsOptions }),
);

```

#### 多服务器同时运行

以下示例演示如何实例化一个同时监听多个端口（例如，一个非 HTTPS 端口和一个 HTTPS 端口）的 Nest 应用程序。

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

因为我们自己调用了 `http.createServer` / `https.createServer`，NestJS 在调用 `app.close` / 终止信号时不会关闭它们。我们需要自己完成此操作：

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

> info **提示** `ExpressAdapter` 从 `@nestjs/platform-express` 包中导入。`http` 和 `https` 包是 Node.js 原生包。

> **警告** 此示例不适用于 [GraphQL Subscriptions](/graphql/subscriptions)。