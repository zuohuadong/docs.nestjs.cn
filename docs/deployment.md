<!-- 此文件从 content/deployment.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-13T07:27:56.937Z -->
<!-- 源文件: content/deployment.md -->
<!-- 源哈希: ecfae1a59ba6997cd69a3accd3318021 -->

### 部署

当你准备将 NestJS 应用部署到生产环境时，可以采取一些关键步骤来确保其尽可能高效地运行。在本指南中，我们将探讨一些基本技巧和最佳实践，帮助你成功部署 NestJS 应用。

如果你不想自己管理基础设施，[Mau](https://mau.nestjs.com/ 'Deploy Nest') - 我们的官方部署平台 - 只需一条命令即可将你的应用部署到 AWS 上。直接跳转到 [Easy deployment with Mau](/deployment#easy-deployment-with-mau)，或继续阅读适用于任何托管选择的底层概念。

#### 前提条件

在部署 NestJS 应用之前，请确保你具备：

- 一个可部署的 NestJS 应用。
- 可以托管应用的部署平台或服务器的访问权限。
- 为应用设置好所有必要的环境变量。
- 任何所需的服务（如数据库）已设置并准备就绪。
- 部署平台上至少安装了 Node.js 的 LTS 版本。

> info **提示** 使用 [Mau](https://mau.nestjs.com/ 'Deploy Nest')，上述大部分内容都会为你处理：它会配置服务器、应用所需的数据库和代理，以及环境变量，因此唯一剩下的前提条件就是应用本身。

#### 构建你的应用

要构建 NestJS 应用，你需要将 TypeScript 代码编译为 JavaScript。此过程会生成一个包含编译后文件的 `dist` 目录。你可以通过运行以下命令来构建应用：

```bash
$ npm run build

```

此命令通常在底层运行 `nest build` 命令，它基本上是 TypeScript 编译器的一个包装器，并带有一些附加功能（资源复制等）。如果你有自定义的构建脚本，可以直接运行它。此外，对于 NestJS CLI monorepo，请确保将要构建的项目名称作为参数传递（`npm run build my-app`）。

编译成功后，你应该会在项目根目录中看到一个 `dist` 目录，其中包含编译后的文件，入口点为 `main.js`。如果你的项目根目录中有任何 `.ts` 文件（并且你的 `tsconfig.json` 配置为编译它们），它们也会被复制到 `dist` 目录中，这会稍微修改目录结构（不再是 `dist/main.js`，而是 `dist/src/main.js`，因此在配置服务器时请记住这一点）。

#### 生产环境

你的生产环境是应用可供外部用户访问的地方。这可以是云平台，如 [AWS](https://aws.amazon.com/)（使用 EC2、ECS 等）、[Azure](https://azure.microsoft.com/) 或 [Google Cloud](https://cloud.google.com/)，甚至是你管理的专用服务器，如 [Hetzner](https://www.hetzner.com/)。

为了简化部署过程并避免手动设置，你可以使用 [Mau](https://mau.nestjs.com/ 'Deploy Nest')，这是我们在 AWS 上部署 NestJS 应用的官方平台。它为你提供下面列出的 AWS 优势，而无需你自己配置任何内容 - 详情请参阅 [Easy deployment with Mau](/deployment#easy-deployment-with-mau)。

使用**云平台**或服务（如 [Mau](https://mau.nestjs.com/ 'Deploy Nest')）的一些优点包括：

- 可扩展性：随着用户群的增长轻松扩展应用。
- 安全性：受益于内置的安全功能和合规认证。
- 监控：实时监控应用的性能和健康状况。
- 可靠性：通过高可用性保证确保应用始终可用。

另一方面，云平台通常比自托管更昂贵，并且你对底层基础设施的控制可能更少。如果你正在寻找更具成本效益的解决方案，并且具备自己管理服务器的技术专长，那么简单的 VPS 可能是一个不错的选择，但请记住，你需要手动处理服务器维护、安全和备份等任务。

#### NODE_ENV=production

虽然 Node.js 和 NestJS 在开发和生产环境之间没有技术上的区别，但在生产环境中运行应用时，将 `NODE_ENV` 环境变量设置为 `production` 是一个好习惯，因为生态系统中的某些库可能会根据此变量表现出不同的行为（例如，启用或禁用调试输出等）。

你可以在启动应用时设置 `NODE_ENV` 环境变量，如下所示：

```bash
$ NODE_ENV=production node dist/main.js

```

或者只需在云提供商/Mau 的仪表板中设置它。

#### 运行你的应用

要在生产环境中运行 NestJS 应用，只需使用以下命令：

```bash
$ node dist/main.js # Adjust this based on your entry point location

```

此命令启动你的应用，它将监听指定的端口（通常默认为 `3000`）。确保这与你在应用中配置的端口匹配。

或者，你可以使用 `nest start` 命令。此命令是 `node dist/main.js` 的包装器，但有一个关键区别：它会在启动应用之前自动运行 `nest build`，因此你无需手动执行 `npm run build`。

#### 健康检查

健康检查对于在生产环境中监控 NestJS 应用的健康和状态至关重要。通过设置健康检查端点，你可以定期验证应用是否按预期运行，并在问题变得严重之前及时响应。

在 NestJS 中，你可以使用 **@nestjs/terminus** 包轻松实现健康检查，该包提供了添加健康检查的强大工具，包括数据库连接、外部服务和自定义检查。

查看 [this guide](/recipes/terminus) 了解如何在 NestJS 应用中实现健康检查，并确保你的应用始终处于监控和响应状态。

#### 日志记录

日志记录对于任何生产级应用都至关重要。它有助于跟踪错误、监控行为和排查问题。在 NestJS 中，你可以使用内置的日志器轻松管理日志，或者如果你需要更高级的功能，可以选择外部库。

日志记录的最佳实践：

- 记录错误而非异常：专注于记录详细的错误消息，以加快调试和问题解决的速度。
- 避免敏感数据：切勿记录密码或令牌等敏感信息，以保护安全性。
- 使用关联 ID：在分布式系统中，在日志中包含唯一标识符（如关联 ID），以便跨不同服务跟踪请求。
- 使用日志级别：按严重程度对日志进行分类（例如，`info`、`warn`、`error`），并在生产环境中禁用调试或详细日志以减少噪音。

> info **提示** 如果你使用 [AWS](https://aws.amazon.com/)（配合 [Mau](https://mau.nestjs.com/ 'Deploy Nest') 或直接使用），请考虑使用 JSON 日志记录，以便更轻松地解析和分析日志。

对于分布式应用，使用集中式日志服务（如 ElasticSearch、Loggly 或 Datadog）可能非常有用。这些工具提供了强大的功能，如日志聚合、搜索和可视化，使监控和分析应用性能和行为变得更加容易。

#### 可观测性

健康检查和日志可以告诉你应用是否正常运行；但它们无法告诉你上次部署后哪个路由变慢了、哪个类消耗了时间、或者哪一行抛出了异常。为此，请使用 [NestJS Observe](https://www.observe.nestjs.com/ 'NestJS Observe')（我们的官方可观测性平台）对应用进行插桩：安装 `@nestjs/observe` SDK，传入 API 密钥，请求、任务、错误、日志和跟踪将开始流式传输到仪表板，无需手动配置 span 或运行收集器。

```typescript
const app = await NestFactory.create(AppModule, {
  instrument: ObserveInstrument,
});

```

请参阅 [Observability](/observability/overview) 章节了解完整设置，包括使用 `serviceVersion` 对部署进行版本控制，以便将每个版本与之前的版本进行比较。

#### 向上或向外扩展

有效扩展 NestJS 应用对于处理增加的流量和确保最佳性能至关重要。扩展主要有两种策略：**垂直扩展**和**水平扩展**。了解这些方法将帮助你设计应用以有效管理负载。

**垂直扩展**，通常称为"向上扩展"，涉及增加单个服务器的资源以提升其性能。这可能意味着为现有机器添加更多 CPU、内存或存储。以下是一些需要考虑的要点：

- 简单性：垂直扩展通常实现起来更简单，因为你只需要升级现有服务器，而无需管理多个实例。
- 局限性：单台机器的扩展存在物理限制。一旦达到最大容量，你可能需要考虑其他方案。
- 成本效益：对于流量适中的应用，垂直扩展可能具有成本效益，因为它减少了对额外基础设施的需求。

示例：如果你的 NestJS 应用托管在虚拟机上，并且你注意到它在高峰时段运行缓慢，你可以将虚拟机升级为具有更多资源的更大实例。要升级虚拟机，只需导航到当前提供商的仪表板并选择更大的实例类型。

**水平扩展**，或"向外扩展"，涉及添加更多服务器或实例来分配负载。这种策略在云环境中被广泛使用，对于预期高流量的应用至关重要。以下是优点和注意事项：

- 增加容量：通过添加更多应用实例，你可以在不降低性能的情况下处理更多并发用户。
- 冗余：水平扩展提供冗余，因为单台服务器的故障不会导致整个应用宕机。流量可以在剩余服务器之间重新分配。
- 负载均衡：为了有效管理多个实例，请使用负载均衡器（如 Nginx 或 AWS Elastic Load Balancing）在服务器之间均匀分配传入流量。

示例：对于流量较高的 NestJS 应用，你可以在云环境中部署多个应用实例，并使用负载均衡器路由请求，确保没有单个实例成为瓶颈。

使用容器化技术（如 [Docker](https://www.docker.com/)）和容器编排平台（如 [Kubernetes](https://kubernetes.io/)）可以轻松实现此过程。此外，你可以利用云特定的负载均衡器（如 [AWS Elastic Load Balancing](https://aws.amazon.com/elasticloadbalancing/) 或 [Azure Load Balancer](https://azure.microsoft.com/en-us/services/load-balancer/)）在应用实例之间分配流量。

> info **提示** [Mau](https://mau.nestjs.com/ 'Deploy Nest') 在 AWS 上提供对水平扩展的内置支持，使你只需点击几下即可轻松部署多个 NestJS 应用实例并管理它们。

#### 其他一些提示

部署 NestJS 应用时，还有几个提示需要牢记：

- **安全**：确保你的应用安全，并防范常见威胁，如 SQL 注入、XSS 等。有关更多详细信息，请参阅"安全"类别。
- **监控**：使用监控工具（如 [Prometheus](https://prometheus.io/) 或 [New Relic](https://newrelic.com/)）来跟踪应用的性能和健康状况。如果你使用的是云提供商/Mau，他们可能会提供内置的监控服务（如 [AWS CloudWatch](https://aws.amazon.com/cloudwatch/) 等）。
- **不要硬编码环境变量**：避免在代码中硬编码敏感信息，如 API 密钥、密码或令牌。请使用环境变量或密钥管理器来安全地存储和访问这些值。
- **备份**：定期备份数据，以防止在发生意外时丢失数据。
- **自动化部署**：使用 CI/CD 流水线来自动化部署过程，并确保各环境之间的一致性。
- **速率限制**：实施速率限制以防止滥用，并保护你的应用免受 DDoS 攻击。有关更多详细信息，请参阅 [Rate limiting chapter](/security/rate-limiting)，或使用诸如 [AWS WAF](https://aws.amazon.com/waf/) 之类的服务以获得高级保护。

#### 使用 Docker 容器化你的应用

[Docker](https://www.docker.com/) 是一个使用容器化技术的平台，允许开发人员将应用及其依赖项打包成一个称为容器的标准化单元。容器是轻量级、可移植且隔离的，非常适合在各种环境中部署应用，从本地开发到生产环境。

将 NestJS 应用 Docker 化的好处：

- 一致性：Docker 确保你的应用在任何机器上以相同的方式运行，消除了"在我机器上可以运行"的问题。
- 隔离性：每个容器在其隔离的环境中运行，防止依赖项之间的冲突。
- 可扩展性：Docker 使你能够通过在不同机器或云实例上运行多个容器来轻松扩展应用。
- 可移植性：容器可以轻松地在环境之间移动，使你可以简单地在不同平台上部署应用。

要安装 Docker，请按照 [official website](https://www.docker.com/get-started) 上的说明进行操作。安装 Docker 后，你可以在 NestJS 项目中创建一个 `Dockerfile` 来定义构建容器镜像的步骤。

`Dockerfile` 是一个文本文件，包含 Docker 用于构建容器镜像的指令。

以下是一个 NestJS 应用的示例 Dockerfile：

```bash
# Use the official Node.js image as the base image
FROM node:20

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

> info **提示** 请确保将 `node:20` 替换为你项目中使用的相应 Node.js 版本。你可以在 [official Docker Hub repository](https://hub.docker.com/_/node) 上找到可用的 Node.js Docker 镜像。

这是一个基本的 Dockerfile，它设置了 Node.js 环境，安装了应用依赖项，构建了 NestJS 应用并运行它。你可以根据项目需求自定义此文件（例如，使用不同的基础镜像、优化构建过程、仅安装生产依赖项等）。

让我们还创建一个 `.dockerignore` 文件，以指定 Docker 在构建镜像时应忽略哪些文件和目录。在项目根目录中创建一个 `.dockerignore` 文件：

```bash
node_modules
dist
*.log
*.md
.git

```

此文件确保不必要的文件不会包含在容器镜像中，从而保持其轻量。现在你已经设置好了 Dockerfile，可以构建 Docker 镜像了。打开终端，导航到项目目录，然后运行以下命令：

```bash
docker build -t my-nestjs-app .

```

在此命令中：

- `-t my-nestjs-app`：使用名称 `my-nestjs-app` 标记镜像。
- `.`：将当前目录指定为构建上下文。

构建镜像后，你可以将其作为容器运行。执行以下命令：

```bash
docker run -p 3000:3000 my-nestjs-app

```

在此命令中：

- `-p 3000:3000`：将主机上的端口 3000 映射到容器中的端口 3000。
- `my-nestjs-app`：指定要运行的镜像。

你的 NestJS 应用现在应该正在 Docker 容器中运行。

如果你想将 Docker 镜像部署到云提供商或与他人共享，则需要将其推送到 Docker 镜像仓库（如 [Docker Hub](https://hub.docker.com/)、[AWS ECR](https://aws.amazon.com/ecr/) 或 [Google Container Registry](https://cloud.google.com/container-registry)）。

一旦你决定了镜像仓库，就可以按照以下步骤推送镜像：

```bash
docker login # Log in to your Docker registry
docker tag my-nestjs-app your-dockerhub-username/my-nestjs-app # Tag your image
docker push your-dockerhub-username/my-nestjs-app # Push your image

```

将 `your-dockerhub-username` 替换为你的 Docker Hub 用户名或相应的镜像仓库 URL。推送镜像后，你可以在任何机器上拉取它并作为容器运行。

像 AWS、Azure 和 Google Cloud 这样的云提供商提供托管容器服务，可简化大规模部署和管理容器的过程。这些服务提供自动扩展、负载均衡和监控等功能，使你更容易在生产环境中运行 NestJS 应用。

#### 使用 Mau 轻松部署

[Mau](https://mau.nestjs.com/ 'Deploy Nest') 是我们在 [AWS](https://aws.amazon.com/) 上部署 NestJS 应用的官方平台。它处理了前面各节描述的所有内容——配置服务器、连接数据库和消息代理、管理环境变量、扩展、监控和 CI/CD——因此你无需自行组装。

##### 部署

从 NestJS v12 开始，Nest CLI 附带了一个 `deploy` 命令。从项目根目录运行它：

```bash
$ nest deploy

```

如果尚未安装 Mau，该命令会提供将 `@nestjs/mau` 添加为开发依赖项，然后继续。你传递的任何选项都会直接转发给 Mau。有关详细信息，请参阅 [nest deploy](/cli/usages#nest-deploy)。

您也可以全局安装 CLI 并直接调用 Mau，这在没有交互式提示的 CI 环境中是正确选择：

```bash
$ npm install -g @nestjs/mau
$ mau deploy

```

部署完成后，您的应用程序即可在 AWS 上运行——通常首次运行后几分钟内即可完成。

##### 为什么选择 Mau

使用 Mau，配置和维护您的基础设施就像点击几个按钮一样简单。在底层，我们使用 **Amazon Web Services** 为您提供强大且可靠的平台，同时抽象掉 AWS 的复杂性。您可以获得 AWS 的优势，而无需学习和管理其细节，这使得 Mau 非常适合初创公司、中小型企业、大型企业以及任何宁愿交付产品而不愿配置基础设施的开发者。

<figure><img src="https://www.mau.nestjs.com/docs/applications/dashboard.png" /></figure>

使用 [Mau](https://mau.nestjs.com/ 'Deploy Nest')，您可以：

- 只需点击几下即可部署您的 NestJS 应用程序（API、微服务等）。
- 配置**数据库**，例如：
  - PostgreSQL
  - MySQL
  - MongoDB (DocumentDB)
  - Redis
  - 更多
- 设置代理服务，例如：
  - RabbitMQ
  - Kafka
  - NATS
- 部署定时任务（**CRON 任务**）和后台工作进程。
- 部署 lambda 函数和无服务器应用程序。
- 设置**CI/CD 流水线**以实现自动化部署。
- 以及更多功能！

##### Mau 如何对应本指南

本章前面涵盖的每个主题在 Mau 中都有对应的托管方案：

<table>
  <tr>
    <td><a href="/deployment#node_envproduction">环境变量</a></td>
    <td>在 Mau 仪表板中设置 <code>NODE_ENV</code> 和您的密钥，而无需在服务器上管理它们。</td>
  </tr>
  <tr>
    <td><a href="/deployment#logging">日志记录</a></td>
    <td>日志会被收集并可在仪表板中查看。JSON 日志记录在这里特别有用——请参阅<a href="/techniques/logger">Logger 章节</a>。</td>
  </tr>
  <tr>
    <td><a href="/deployment#scaling-up-or-out">扩展</a></td>
    <td>内置对水平扩展的支持：运行应用程序的多个实例并从仪表板管理它们。</td>
  </tr>
  <tr>
    <td><a href="/deployment#health-checks">健康检查</a></td>
    <td>将 Mau 指向您使用 <a href="/recipes/terminus">Terminus</a> 暴露的端点，不健康的实例将自动为您处理。</td>
  </tr>
  <tr>
    <td><a href="/deployment#some-other-tips">监控和备份</a></td>
    <td>指标来自 AWS CloudWatch，托管数据库会自动备份。</td>
  </tr>
</table>

立即注册并[Deploy with Mau](https://mau.nestjs.com/ 'Deploy Nest')，让您的 NestJS 应用程序在几分钟内于 AWS 上运行！