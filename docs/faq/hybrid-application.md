<!-- 此文件从 content/faq/hybrid-application.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T23:14:19.535Z -->
<!-- 源文件: content/faq/hybrid-application.md -->
<!-- 源哈希: bcc2d9c95123f8f7a41fa99a41f40f25 -->

### 混合应用程序

混合应用程序会监听来自两个或更多不同来源的请求。它可以将 HTTP 服务器与微服务监听器结合，或者结合多个不同的微服务监听器。`createMicroservice()` 方法不支持多个服务器，因此在这种情况下，您需要手动创建并启动每个微服务。为此，使用 `connectMicroservice()` 方法将 `INestMicroservice` 实例连接到 `INestApplication` 实例。

```typescript
const app = await NestFactory.create(AppModule);
const microservice = app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.TCP,
});

await app.startAllMicroservices();
await app.listen(3001);

```

> info **提示** `app.listen(port)` 方法在指定的端口上启动一个 HTTP 服务器。如果您的应用程序不处理 HTTP 请求，请使用 `app.init()` 方法。

> warning **注意** 这些调用的顺序很重要。如果先调用 `await app.startAllMicroservices()`（如上所示），微服务将在应用程序的生命周期钩子（如 `onModuleInit` 和 `onApplicationBootstrap`）完成**之前**开始消费消息。如果您的处理器必须在每个模块完全初始化后才能接收消息，请在 `startAllMicroservices()` 之前调用 `app.listen()`（或 `app.init()`）。

要连接多个微服务实例，对每个微服务调用 `connectMicroservice()` 一次：

```typescript
const app = await NestFactory.create(AppModule);
// microservice #1
const microserviceTcp = app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.TCP,
  options: {
    port: 3002,
  },
});
// microservice #2
const microserviceRedis = app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.REDIS,
  options: {
    host: 'localhost',
    port: 6379,
  },
});

await app.startAllMicroservices();
await app.listen(3001);

```

在具有多个微服务的混合应用程序中，可以通过传递一个标识传输的第二个参数，将 `@MessagePattern()` 绑定到单个传输策略（例如 NATS）。对于内置策略，这是 `Transport` 枚举的一个值；对于 [custom transporter](/microservices/custom-transport)，它是其服务器类的 `transportId` 符号。

```typescript
@MessagePattern('time.us.*', Transport.NATS)
getDate(@Payload() data: number[], @Ctx() context: NatsContext) {
  console.log(`Subject: ${context.getSubject()}`); // e.g. "time.us.east"
  return new Date().toLocaleTimeString(...);
}
@MessagePattern({ cmd: 'time.us' }, Transport.TCP)
getTCPDate(@Payload() data: number[]) {
  return new Date().toLocaleTimeString(...);
}
@MessagePattern('topic.time.us', XYZServer.Transport) // XYZServer is a custom transporter
getXYZDate(@Payload() data: number[]) {
  return new Date().toLocaleTimeString(...);
}

```

> info **提示** `@Payload()`、`@Ctx()`、`Transport` 和 `NatsContext` 从 `@nestjs/microservices` 导入。这里的 `XYZServer.Transport` 代表自定义传输器暴露的 `transportId` 符号。

#### 共享配置

默认情况下，连接的微服务不会继承为主（基于 HTTP）应用程序配置的全局 管道、拦截器、守卫和过滤器。这同时适用于使用 `useGlobal*()` 方法注册的增强器以及使用 `APP_PIPE`、`APP_INTERCEPTOR`、`APP_GUARD` 和 `APP_FILTER` 令牌作为提供者注册的增强器。
要继承此配置，请在作为 `connectMicroservice()` 第二个参数传递的选项对象中设置 `inheritAppConfig` 属性：

```typescript
const microservice = app.connectMicroservice<MicroserviceOptions>(
  {
    transport: Transport.TCP,
  },
  { inheritAppConfig: true },
);

```

> info **提示** 当调用 `connectMicroservice()` 时，连接的微服务会注册其消息处理器。当您使用 `inheritAppConfig` 时，请在 `connectMicroservice()` **之前**调用 `app.useGlobalPipes()`、`app.useGlobalGuards()` 和其他 `useGlobal*()` 方法，否则它们注册的增强器不会应用于微服务的处理器。