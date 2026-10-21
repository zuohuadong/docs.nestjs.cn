<!-- 此文件从 content/deployment.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T07:38:31.659Z -->
<!-- 源文件: content/deployment.md -->
<!-- 源哈希: b38e416e4f50317a50e3d0bb75a2c332 -->

### 部署

当你准备将 NestJS 应用程序部署到生产环境时，可以采取一些关键步骤来确保它以最高效的方式运行。本指南涵盖了成功部署 NestJS 应用程序的基本技巧和最佳实践。

如果你不想自己管理基础设施，[Mau](https://mau.nestjs.com/ 'Deploy Nest')（我们的官方部署平台）可以通过一条命令将你的应用部署到 AWS 生产环境。你可以直接跳转到 [Easy deployment with Mau](/deployment#easy-deployment-with-mau)，或者继续阅读以了解适用于任何托管选择的基本概念。

#### 前置条件

在部署 NestJS 应用程序之前，请确保你具备以下条件：

- 一个可正常运行且已准备好部署的 NestJS 应用程序。
- 对可以托管应用程序的部署平台或服务器的访问权限。
- 为应用程序设置好所有必要的环境变量。
- 任何所需的服务（如数据库）已设置好并准备就绪。
- 在部署平台上安装了 Node.js 20.19 或更高版本（22.x 系列为 22.12 或更高版本），如 [Prerequisites](/first-steps#prerequisites) 中所述。优先使用仍处于活跃 LTS 阶段的 Node.js 版本。

> info **提示** 使用 [Mau](https://mau.nestjs.com/ 'Deploy Nest')，上述列表中的大部分内容都会为你处理：它会配置服务器、应用程序所需的数据库和代理，以及环境变量，因此唯一剩下的前置条件就是应用程序本身。

#### 构建应用程序

要构建 NestJS 应用程序，需要将 TypeScript 代码编译为 JavaScript。此过程会生成一个包含编译后文件的 `dist` 目录。通过运行以下命令来构建应用程序：

```bash
$ npm run build

```

此命令通常在底层运行 `nest build`，它是对 TypeScript 编译器的封装，并带有一些附加功能（例如复制资源文件）。如果你有自定义构建脚本，可以直接运行它。对于 Nest CLI monorepo，请将要构建的项目名称作为参数传入（`npm run build my-app`）。

编译成功后，你应该会在项目根目录中看到一个包含编译后文件的 `dist` 目录，其中 `main.js` 是入口点。如果你的项目根目录中有任何 `.ts` 文件（并且你的 `tsconfig.json` 配置为编译它们），它们也会被编译到 `dist` 目录中，这会改变目录结构：你将得到 `dist/src/main.js` 而不是 `dist/main.js`。在配置服务器时请记住这一点。

#### 生产环境

生产环境是你的应用程序可供外部用户访问的地方。它可以是基于云的平台，如 [AWS](https://aws.amazon.com/)（使用 EC2、ECS 等）、[Azure](https://azure.microsoft.com/) 或 [Google Cloud](https://cloud.google.com/)，也可以是你自己管理的专用服务器，例如 [Hetzner](https://www.hetzner.com/)。

为了简化部署过程并避免手动设置，你可以使用 [Mau](https://mau.nestjs.com/ 'Deploy Nest')，这是我们用于在 AWS 上部署 NestJS 应用程序的官方平台。它让你无需自行配置即可享受下面列出的 AWS 优势。详情请参阅 [Easy deployment with Mau](/deployment#easy-deployment-with-mau)。

使用**基于云的平台**或类似 [Mau](https://mau.nestjs.com/ 'Deploy Nest') 的服务的部分优点包括：

- 可扩展性：随着用户群的增长扩展你的应用程序。
- 安全性：受益于内置的安全功能和合规认证。
- 监控：实时监控应用程序的性能和健康状况。
- 可靠性：通过高正常运行时间保证确保应用程序始终可用。

另一方面，基于云的平台通常比自托管更昂贵，而且你对底层基础设施的控制可能更少。如果你正在寻找更具成本效益的解决方案，并且具备自行管理服务器的技术能力，那么简单的 VPS 可能是一个不错的选择。请记住，你需要手动处理服务器维护、安全和备份等任务。

#### NODE_ENV=production

虽然在 Node.js 和 NestJS 中，开发环境和生产环境在技术上没有区别，但在生产环境中运行应用程序时，将 `NODE_ENV` 环境变量设置为 `production` 是一种良好的实践，因为生态系统中的一些库会根据此变量表现出不同的行为（例如启用或禁用调试输出）。

你可以在启动应用程序时设置 `NODE_ENV` 环境变量：

```bash
$ NODE_ENV=production node dist/main.js

```

或者，在你的云服务提供商或 Mau 的控制面板中设置它。

#### 运行应用程序

要在生产环境中运行 NestJS 应用程序，请使用以下命令：

```bash
$ node dist/main.js # Adjust this based on your entry point location

```

此命令会启动应用程序，它会监听传递给 `app.listen()` 的端口（在新生成的项目中为 `3000`，除非设置了 `PORT` 环境变量）。确保你的部署平台将流量路由到该端口。

或者，你可以使用 `nest start` 命令。它是对 `node dist/main.js` 的封装，有一个关键区别：它会在启动应用程序之前运行 `nest build`，因此你无需手动运行 `npm run build`。

#### 健康检查

健康检查对于监控生产环境中 NestJS 应用程序的健康状况和状态至关重要。通过健康检查端点，你可以定期验证应用程序是否按预期运行，并在问题变得严重之前做出响应。

在 NestJS 中，你可以使用 **@nestjs/terminus** 包来实现健康检查，它支持对数据库连接、外部服务以及自定义指标的检查。

请参阅 [health checks (Terminus)](/reliability/terminus) 章节，了解如何在 NestJS 应用程序中实现健康检查。

#### 日志记录

日志记录对于任何生产就绪的应用程序都至关重要。它可以帮助你跟踪错误、监控行为并排查问题。在 NestJS 中，你可以使用 [built-in logger](/application/logger) 来管理日志，或者如果你需要更高级的功能，可以选择外部库。

日志记录的最佳实践：

- 记录错误，而非异常：专注于记录详细的错误消息，以加快调试和问题解决的速度。
- 避免敏感数据：切勿记录密码或令牌等敏感信息。
- 使用关联 ID：在分布式系统中，在日志中包含唯一标识符（如关联 ID），以便跨服务追踪请求。
- 使用日志级别：按严重程度对日志进行分类（例如 `info`、`warn`、`error`），并在生产环境中禁用 debug 或 verbose 日志以减少噪音。

> info **提示** 如果你使用 [AWS](https://aws.amazon.com/)（配合 [Mau](https://mau.nestjs.com/ 'Deploy Nest') 或直接使用），可以考虑使用 JSON 日志，以便更轻松地解析和分析日志。

对于分布式应用程序，集中式日志服务（如 Elasticsearch、Loggly 或 Datadog）非常有用。这些工具提供日志聚合、搜索和可视化功能，使你能够更轻松地监控和分析应用程序的性能和行为。

#### 可观测性

健康检查和日志只能告诉你应用程序是否在运行；它们无法告诉你上次部署后哪条路由变慢了、哪个类在消耗时间，或者哪一行抛出了错误。为此，可以使用 [NestJS Observe](https://www.observe.nestjs.com/ 'NestJS Observe')（我们的官方可观测性平台）对应用程序进行埋点：安装 `@nestjs/observe` SDK，传入 API 密钥，请求、任务、错误、日志和追踪就会开始流式传输到仪表板，无需手动连接 span 或运行收集器。

```typescript
const app = await NestFactory.create(AppModule, {
  instrument: ObserveInstrument,
});

```

请参阅 [Observability](/observability/overview) 章节了解完整设置，包括使用 `serviceVersion` 对部署进行版本控制，以便将每个版本与上一个版本进行比较。

#### 纵向扩展或横向扩展

有效地扩展 NestJS 应用程序对于处理增加的流量和确保最佳性能至关重要。扩展主要有两种策略：**垂直扩展**和**水平扩展**。理解这两种策略有助于你设计应用程序以高效地管理负载。

**垂直扩展**，通常称为"向上扩展"，是指增加单台服务器的资源以提升其性能。这可能意味着为现有机器添加更多的 CPU、RAM 或存储。需要考虑的关键点：

- 简单性：垂直扩展通常更易于实现，因为你只需升级现有服务器，而无需管理多个实例。
- 局限性：单台机器的扩展存在物理限制。一旦达到最大容量，你可能需要考虑其他方案。
- 成本效益：对于流量适中的应用，垂直扩展可能具有成本效益，因为它减少了对额外基础设施的需求。

示例：如果你的 NestJS 应用托管在虚拟机上，并且你注意到它在高峰时段运行缓慢，你可以将 VM 升级为资源更丰富的大型实例，通常是在你的提供商仪表板中选择更大的实例类型。

**水平扩展**，或称"向外扩展"，是指添加更多服务器或实例来分散负载。这种策略在云环境中被广泛使用，对于预期会有高流量的应用程序至关重要。优势与注意事项：

- 容量提升：通过添加更多应用程序实例，你可以处理更多的并发用户，而不会降低性能。
- 冗余：一台服务器发生故障不会导致整个应用程序宕机，因为流量可以在其余服务器之间重新分配。
- 负载均衡：为了有效地管理多个实例，请使用负载均衡器（如 Nginx 或 AWS Elastic Load Balancing）将传入流量均匀地分配到各台服务器上。

示例：对于流量较高的 NestJS 应用程序，你可以在云环境中部署多个应用实例，并使用负载均衡器来路由请求，确保没有单个实例成为瓶颈。

像 [Docker](https://www.docker.com/) 这样的容器化技术以及诸如 [Kubernetes](https://kubernetes.io/) 这样的容器编排平台使这一过程变得简单直接。你也可以使用特定于云的负载均衡器（如 [AWS Elastic Load Balancing](https://aws.amazon.com/elasticloadbalancing/) 或 [Azure Load Balancer](https://azure.microsoft.com/en-us/services/load-balancer/)）将流量分配到应用程序的各个实例。

> info **提示** [Mau](https://mau.nestjs.com/ 'Deploy Nest') 在 AWS 上提供对水平扩展的内置支持，因此你可以部署多个 NestJS 应用程序实例，只需点击几下即可管理它们。

#### 其他一些提示

在部署 NestJS 应用程序时，请记住以下额外提示：

- **安全性**：保护你的应用程序免受 SQL 注入和 XSS 等常见威胁。详情请参阅"安全性"类别中的章节，例如 [Helmet](/security/helmet) 和 [CORS](/security/cors)。
- **监控**：使用 [Prometheus](https://prometheus.io/) 或 [New Relic](https://newrelic.com/) 等监控工具来跟踪应用程序的性能和健康状况。云提供商和 Mau 可能提供内置的监控服务（例如 [AWS CloudWatch](https://aws.amazon.com/cloudwatch/)）。
- **不要硬编码环境变量**：避免在代码中硬编码 API 密钥、密码或令牌等敏感信息。使用环境变量或密钥管理器来安全地存储和访问这些值。
- **备份**：定期备份数据，以防发生事故时造成数据丢失。
- **自动化部署**：使用 CI/CD 流水线自动化部署流程，并确保各环境之间的一致性。
- **速率限制**：实施速率限制以防止滥用并保护你的应用程序免受 DDoS 攻击。详情请参阅 [rate limiting](/security/rate-limiting) 章节，或使用 [AWS WAF](https://aws.amazon.com/waf/) 等服务获得高级保护。

#### 将应用程序 Docker 化

[Docker](https://www.docker.com/) 是一个使用容器化技术的平台，让开发者能够将应用程序及其依赖打包成一个称为容器的标准化单元。容器轻量、可移植且相互隔离，这使得它们非常适合在各种环境中部署应用程序，从本地开发到生产环境皆可。

将 NestJS 应用程序 Docker 化的好处：

- 一致性：Docker 确保你的应用程序在任何机器上都能以相同的方式运行，从而消除“在我机器上能跑”的问题。
- 隔离性：每个容器都在自己隔离的环境中运行，防止依赖之间发生冲突。
- 可扩展性：你可以通过在不同机器或云实例上运行多个容器来扩展应用程序。
- 可移植性：容器无需修改即可在不同环境之间迁移，因此你可以将应用程序部署到不同的平台上。

要安装 Docker，请按照 [Docker website](https://www.docker.com/get-started) 上的说明操作。安装好 Docker 后，在你的 NestJS 项目中创建一个 `Dockerfile`。它是一个文本文件，包含 Docker 用于构建容器镜像的指令。

以下是一个 NestJS 应用程序的 `Dockerfile` 示例：

```bash
# Use the official Node.js image as the base image
FROM node:24

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install the application dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

# Build the NestJS application
RUN npm run build

# Expose the application port
EXPOSE 3000

# Command to run the application
CMD ["node", "dist/main"]

```

> info **提示** 将 `node:24` 替换为你的项目所使用的 Node.js 版本（NestJS v12 要求 Node.js 20.19 或更高版本，或者 22.x 系列中的 22.12 或更高版本）。你可以在 [official Docker Hub repository](https://hub.docker.com/_/node) 中找到可用的 Node.js Docker 镜像。

这个基础的 `Dockerfile` 会搭建 Node.js 环境、安装应用程序依赖、构建 NestJS 应用程序并运行它。你可以根据项目需求对其进行自定义（例如，使用不同的基础镜像、优化构建过程，或仅安装生产依赖）。

接下来，在项目根目录中创建一个 `.dockerignore` 文件，用于指定 Docker 在构建镜像时应忽略哪些文件和目录：

```bash
node_modules
dist
*.log
*.md
.git

```

该文件会将不必要的文件排除在容器镜像之外，使其保持轻量。有了 `Dockerfile` 之后，你就可以构建 Docker 镜像了。打开终端，导航到你的项目目录，然后运行以下命令：

```bash
docker build -t my-nestjs-app .

```

在此命令中：

- `-t my-nestjs-app`：使用名称 `my-nestjs-app` 为镜像打标签。
- `.`：将当前目录指定为构建上下文。

构建镜像后，将其作为容器运行：

```bash
docker run -p 3000:3000 my-nestjs-app

```

在此命令中：

- `-p 3000:3000`：将主机上的 3000 端口映射到容器中的 3000 端口。
- `my-nestjs-app`：指定要运行的镜像。

你的 NestJS 应用程序现在应该已经在 Docker 容器中运行了。

要将 Docker 镜像部署到云提供商或与他人共享，请将其推送到容器注册表（例如 [Docker Hub](https://hub.docker.com/)、[Amazon ECR](https://aws.amazon.com/ecr/) 或 [Google Artifact Registry](https://cloud.google.com/artifact-registry)）。

选定注册表后，推送你的镜像：

```bash
docker login # Log in to your Docker registry
docker tag my-nestjs-app your-dockerhub-username/my-nestjs-app # Tag your image
docker push your-dockerhub-username/my-nestjs-app # Push your image

```

将 `your-dockerhub-username` 替换为你的 Docker Hub 用户名或相应的注册表 URL。推送镜像后，你可以在任何机器上拉取它并作为容器运行。

AWS、Azure 和 Google Cloud 等云提供商提供托管的容器服务，可简化大规模部署和管理容器的工作。这些服务为你的 NestJS 应用程序在生产环境中提供自动扩缩容、负载均衡和监控等功能。

#### 使用 Mau 轻松部署

[Mau](https://mau.nestjs.com/ 'Deploy Nest') 是我们在 [AWS](https://aws.amazon.com/) 上部署 NestJS 应用程序的官方平台。它处理了前面几节所描述的一切工作（配置服务器、连接数据库和消息代理、管理环境变量、扩缩容、监控以及 CI/CD），因此你无需自己动手拼装。

##### 部署

从 NestJS v12 开始，Nest CLI 自带了一个 `deploy` 命令。在项目根目录下运行它：

```bash
$ nest deploy

```

如果尚未安装 Mau，该命令会提示将 `@nestjs/mau` 添加为开发依赖，然后继续执行。你传入的任何选项都会被转发给 `mau deploy`。详情请参阅 [nest deploy](/cli/usages#nest-deploy)。

你也可以全局安装 Mau CLI 并直接调用它。对于无法使用交互式提示的 CI 环境来说，这是正确的选择：

```bash
$ npm install -g @nestjs/mau
$ mau deploy

```

部署完成后，你的应用程序就会在 AWS 上线，通常在你首次运行的几分钟内即可完成。

##### 为什么选择 Mau

使用 Mau，配置和维护基础设施只需点击几下即可完成。在底层，Mau 使用 **Amazon Web Services** 为你提供强大而可靠的平台，同时将 AWS 的复杂性抽象掉。你无需学习和管理 AWS 的细节，就能享受到它的优势，这使得 Mau 非常适合初创公司、中小型企业、大型企业，以及任何宁愿发布产品也不愿配置基础设施的开发者。

<figure><img src="https://www.mau.nestjs.com/docs/applications/dashboard.png" /></figure>

使用 [Mau](https://mau.nestjs.com/ 'Deploy Nest')，你可以：

- 只需点击几下即可部署你的 NestJS 应用程序（API、微服务等）。
- 配置 **数据库**，例如：
  - PostgreSQL
  - MySQL
  - MongoDB (DocumentDB)
  - Redis
  - 以及更多
- 设置消息代理服务，例如：
  - RabbitMQ
  - Kafka
  - NATS
- 部署定时任务（**CRON 任务**）和后台工作进程。
- 部署 lambda 函数和无服务器应用程序。
- 设置 **CI/CD 流水线**以实现自动化部署。
- 以及更多功能。

##### Mau 如何映射到本指南

本章前面介绍的每个主题在 Mau 中都有对应的托管方案：

<table>
  <tr>
    <td><a href="/deployment#node_envproduction">环境变量</a></td>
    <td>在 Mau 仪表板中设置 <code>NODE_ENV</code> 和你的密钥，而不是在服务器上管理它们。</td>
  </tr>
  <tr>
    <td><a href="/deployment#logging">日志记录</a></td>
    <td>日志会被收集并可在仪表板中查看。JSON 日志记录在这里特别有用；请参阅 <a href="/application/logger">Logger 章节</a>。</td>
  </tr>
  <tr>
    <td><a href="/deployment#scaling-up-or-out">扩缩容</a></td>
    <td>内置支持水平扩缩容：运行应用程序的多个实例，并从仪表板中管理它们。</td>
  </tr>
  <tr>
    <td><a href="/deployment#health-checks">健康检查</a></td>
    <td>让 Mau 指向你通过 <a href="/reliability/terminus">Terminus</a> 暴露的端点，不健康的实例会为你处理。</td>
  </tr>
  <tr>
    <td><a href="/deployment#some-other-tips">监控与备份</a></td>
    <td>指标来自 AWS CloudWatch，托管数据库会自动备份。</td>
  </tr>
</table>

立即注册并[deploy with Mau](https://mau.nestjs.com/ 'Deploy Nest')，让你的 NestJS 应用程序在几分钟内就在 AWS 上运行起来。