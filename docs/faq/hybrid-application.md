<!-- 此文件从 content/faq/hybrid-application.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T07:39:03.933Z -->
<!-- 源文件: content/faq/hybrid-application.md -->
<!-- 源哈希: 6e5961de81ec580dc89eb5d715bd2947 -->

### 混合应用程序

混合应用程序是一种监听来自两个或多个不同来源的请求的应用程序。这可以将 HTTP 服务器与微服务监听器组合，甚至只是多个不同的微服务监听器。默认的 `createMicroservice` 方法不允许有多个服务器，因此在这种情况下，每个微服务必须手动创建和启动。为此，可以通过 `connectMicroservice()` 方法将 `INestApplication` 实例与 `INestMicroservice` 实例连接。

```typescript
const app = await NestFactory.create(AppModule);
const microservice = app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.TCP,
});

await app.startAllMicroservices();
await app.listen(3001);

```

> info **提示** `app.listen(port)` 方法会在指定地址启动 HTTP 服务器。如果您的应用程序不处理 HTTP 请求，则应改用 `app.init()` 方法。

> warning **注意** 这些调用的顺序很重要。如果先调用 `await app.startAllMicroservices()`（如上所述），微服务会在应用程序的生命周期钩子（如 `onModuleInit` 和 `onApplicationBootstrap`）完成之前开始消费消息。如果您的处理器必须在所有模块完全初始化后才能接收消息，请在 `startAllMicroservices()` 之前调用 `app.listen()`（或 `app.init()`）。

要连接多个微服务实例，请为每个微服务调用 `connectMicroservice()`：

```typescript
const app = await NestFactory.create(AppModule);
// microservice #1
const microserviceTcp = app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.TCP,
  options: {
    port: 3001,
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

在具有多个微服务的混合应用程序中，要将 `@MessagePattern()` 绑定到仅一种传输策略（例如 MQTT），我们可以传递第二个参数来标识传输方式。对于内置策略，这是 `Transport` 枚举的值；对于 [custom transporter](/microservices/custom-transport)，则是其服务器类的 `transportId` 符号。

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

默认情况下，混合应用程序不会继承为主（基于 HTTP 的）应用程序配置的全局管道、拦截器、守卫和过滤器。要从主应用程序继承这些配置属性，请在 `connectMicroservice()` 调用的第二个参数（一个可选的选项对象）中设置 `inheritAppConfig` 属性，如下所示：

```typescript
const microservice = app.connectMicroservice<MicroserviceOptions>(
  {
    transport: Transport.TCP,
  },
  { inheritAppConfig: true },
);

```