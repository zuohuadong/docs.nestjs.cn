<!-- 此文件从 content/devtools/ci-cd.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T10:15:59.711Z -->
<!-- 源文件: content/devtools/ci-cd.md -->
<!-- 源哈希: ae2f050982527dbaed9001c55eae3607 -->

### CI/CD 集成

> info **提示** 本章介绍 Nest Devtools 与 Nest 框架的集成。如果您正在寻找 Devtools 应用，请访问 [Devtools](https://devtools.nestjs.com) 网站。CI/CD 集成在 **[Enterprise](https://devtools.nestjs.com/settings)** 计划中可用。

本地使用非常适合在构建应用时进行探索，但真正的价值在于当 Devtools 成为交付流水线的一部分时。CI/CD 集成会在每次构建时发布应用图的快照，因此您可以获得架构演进的运行历史——更重要的是，每次拉取请求都会自动生成报告，精确显示结构上发生了什么变化。这就像是“希望重构没有破坏任何东西”与“确信没有破坏任何东西”之间的区别。

了解团队为何依赖 CI/CD 集成来在架构漂移发布之前捕获它：

<figure>
  <iframe
    width="1000"
    height="565"
    src="https://www.youtube.com/embed/r5RXcBrnEQ8"
    title="YouTube video player"
    frameBorder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowFullScreen
  ></iframe>
</figure>

#### 发布图

首先，让我们将应用引导文件（`main.ts`）配置为使用从 `@nestjs/devtools-integration` 导出的 `GraphPublisher` 类（如果您尚未安装，请参阅 [previous chapter](/devtools/overview)）：

```typescript
async function bootstrap() {
  const shouldPublishGraph = process.env.PUBLISH_GRAPH === 'true';

  const app = await NestFactory.create(AppModule, {
    snapshot: true,
    preview: shouldPublishGraph,
  });

  if (shouldPublishGraph) {
    await app.init();

    const publishOptions = { ... } // NOTE: this options object will vary depending on the CI/CD provider you're using
    const graphPublisher = new GraphPublisher(app);
    await graphPublisher.publish(publishOptions);

    await app.close();
  } else {
    await app.listen(3000);
  }
}

```

在这里，`GraphPublisher` 会将序列化图推送到集中式注册表。`PUBLISH_GRAPH` 是一个自定义环境变量，用于区分 CI/CD 发布运行与常规应用引导。将 `preview` 设置为 `true` 会使应用以预览模式引导，这意味着控制器、增强器和提供者的构造函数及生命周期钩子不会实际执行。这不是**必需的**，但它能让 CI 运行快速且简单——例如，无需数据库连接。

`publishOptions` 的结构取决于您使用的 CI/CD 提供者——我们将在下面介绍最流行的几种。如果您的提供者未列出，请不要担心：底层字段在所有地方都是相同的，因此您可以在几分钟内调整配置。

一旦您的图成功发布，您将在工作流日志中看到类似这样的输出：

<figure><img src="/assets/devtools/graph-published-terminal.png" /></figure>

每个发布的图都会在项目页面上显示为新条目：

<figure><img src="/assets/devtools/project.png" /></figure>

#### 报告

Devtools 会为每次构建生成报告，**只要**注册表中已存在匹配的快照。因此，如果您针对 `master` 打开拉取请求，并且已经发布了 `master` 的图，Devtools 会自动检测差异并生成报告。否则，就没有可比较的对象——目前还没有。

在项目页面上查找您的报告（参见 [organizations](https://devtools.nestjs.com/organizations)）。

<figure><img src="/assets/devtools/report.png" /></figure>

这正是 Devtools 真正发挥价值的地方：捕获那些从代码审查中溜走的更改。假设有人悄悄更改了**深层嵌套提供者**的作用域——这在差异中很容易被忽略，但在报告中却不可能被忽略。从端点移除守卫，它会立即显示为受影响的变化。如果该路由未被集成测试或端到端测试覆盖，您可能直到为时已晚才会注意到——而 Devtools 会在审查时捕获它。

对于**大型代码库**也是如此：将模块设为全局，您会立即看到图中新增了多少条边——这通常是一个强烈的信号，表明某些内容需要再次检查。

报告也是直接链接到拉取请求描述中的绝佳产物。与其要求审查者相信“这只涉及计费模块”，不如直接指向发生变化的精确节点和边集合——将架构声明转化为他们可以在几秒钟内实际验证的内容。

#### 构建预览

每个发布的图都可以重放——点击 **预览** 以查看它在那个时间点的确切样子。当报告可用时，差异会直接在图上高亮显示：

- 绿色节点表示新增元素
- 浅白色节点表示更新元素
- 红色节点表示删除的元素

效果如下：

<figure><img src="/assets/devtools/nodes-selection.png" /></figure>

能够回退并比较图使故障排查变得简单——不再需要猜测什么发生了变化以及何时变化。设置好一切，让每次拉取请求（甚至每次提交）都在注册表中获得自己的快照，您将始终有一条清晰的轨迹可循。将 Devtools 视为真正理解 Nest 如何组装应用的版本控制——并且能够**向您展示**差异，而不仅仅是描述它。

#### 集成：GitHub Actions

在 `.github/workflows` 中创建一个新的工作流文件——我们将其命名为 `publish-graph.yml`——并放入以下内容：

```yaml
name: Devtools

on:
  push:
    branches:
      - master
  pull_request:
    branches:
      - '*'

jobs:
  publish:
    if: github.actor!= 'dependabot[bot]'
    name: Publish graph
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '16'
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Setup Environment (PR)
        if: {{ '${{' }} github.event_name == 'pull_request' {{ '}}' }}
        shell: bash
        run: |
          echo "COMMIT_SHA={{ '${{' }} github.event.pull_request.head.sha {{ '}}' }}" >>\${GITHUB_ENV}
      - name: Setup Environment (Push)
        if: {{ '${{' }} github.event_name == 'push' {{ '}}' }}
        shell: bash
        run: |
          echo "COMMIT_SHA=\${GITHUB_SHA}" >> \${GITHUB_ENV}
      - name: Publish
        run: PUBLISH_GRAPH=true npm run start
        env:
          DEVTOOLS_API_KEY: CHANGE_THIS_TO_YOUR_API_KEY
          REPOSITORY_NAME: {{ '${{' }} github.event.repository.name {{ '}}' }}
          BRANCH_NAME: {{ '${{' }} github.head_ref || github.ref_name {{ '}}' }}
          TARGET_SHA: {{ '${{' }} github.event.pull_request.base.sha {{ '}}' }}

```

> info **提示** 为了更好的安全性，请从 GitHub Secrets 中获取 `DEVTOOLS_API_KEY`，而不是硬编码——了解更多 [here](https://docs.github.com/en/actions/security-guides/encrypted-secrets#creating-encrypted-secrets-for-a-repository)。

此工作流会在每次针对 `master` 的拉取请求以及直接推送到 `master` 时运行。您可以根据项目需求进行调整——唯一不可妥协的是提供 `GraphPublisher` 所依赖的环境变量。

不过，在此工作流运行之前，还有一个变量需要填写：`DEVTOOLS_API_KEY`。在 **[API keys page](https://devtools.nestjs.com/settings/manage-api-keys)** 上为您的项目生成专用的 API 密钥。

最后，返回 `main.ts` 并填写我们之前留空的 `publishOptions` 对象：

```typescript
const publishOptions = {
  apiKey: process.env.DEVTOOLS_API_KEY,
  repository: process.env.REPOSITORY_NAME,
  owner: process.env.GITHUB_REPOSITORY_OWNER,
  sha: process.env.COMMIT_SHA,
  target: process.env.TARGET_SHA,
  trigger: process.env.GITHUB_BASE_REF ? 'pull' : 'push',
  branch: process.env.BRANCH_NAME,
};

```

为了获得最流畅的体验，我们也建议为您的项目安装 **GitHub 应用** —— 只需点击下方的 "Integrate GitHub app" 即可。这是可选的，但非常值得。

<figure><img src="/assets/devtools/integrate-github-app.png" /></figure>

安装应用后，您可以直接在拉取请求中看到预览/报告生成的状态：

<figure><img src="/assets/devtools/actions-preview.png" /></figure>

#### 集成：GitLab Pipelines

在项目根目录创建一个 `.gitlab-ci.yml` 文件，内容如下：

```yaml
image: node:16

stages:
  - build

cache:
  key:
    files:
      - package-lock.json
  paths:
    - node_modules/

workflow:
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
      when: always
    - if: $CI_COMMIT_BRANCH == "master" && $CI_PIPELINE_SOURCE == "push"
      when: always
    - when: never

install_dependencies:
  stage: build
  script:
    - npm ci

publish_graph:
  stage: build
  needs:
    - install_dependencies
  script: npm run start
  variables:
    PUBLISH_GRAPH: 'true'
    DEVTOOLS_API_KEY: 'CHANGE_THIS_TO_YOUR_API_KEY'

```

> info **提示** 与 GitHub 一样，我们建议从 CI/CD 密钥中获取 `DEVTOOLS_API_KEY`，而不是直接提交它。

此流水线会在每次针对 `master` 的拉取请求以及直接推送到 `master` 时运行。您可以根据项目需求进行调整——只需确保 `GraphPublisher` 所需的环境变量始终存在。

此定义中有一个变量仍需要真实值：`DEVTOOLS_API_KEY`。请在 **[API keys page](https://devtools.nestjs.com/settings/manage-api-keys)** 上为您的项目生成专用的 API 密钥。

最后，返回 `main.ts` 并填写我们之前留空的 `publishOptions` 对象：

```typescript
const publishOptions = {
  apiKey: process.env.DEVTOOLS_API_KEY,
  repository: process.env.CI_PROJECT_NAME,
  owner: process.env.CI_PROJECT_ROOT_NAMESPACE,
  sha: process.env.CI_COMMIT_SHA,
  target: process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA,
  trigger: process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA ? 'pull' : 'push',
  branch:
    process.env.CI_COMMIT_BRANCH ??
    process.env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME,
};

```

#### 其他 CI/CD 工具

不在 GitHub 或 GitLab 上？没问题——该集成实际上并不依赖这两个平台。`GraphPublisher` 只需要少量描述当前构建的值（谁触发的、哪个提交、哪个分支），因此它可以与您使用的任何提供者配合使用，包括 [Bitbucket Pipelines](https://bitbucket.org/product/features/pipelines)、[CircleCI](https://circleci.com/) 等。

以下是 `publishOptions` 的完整结构以及每个字段的含义，以便您可以接入任何流水线：

```typescript
const publishOptions = {
  apiKey: process.env.DEVTOOLS_API_KEY, // This is your Nest Devtools API key
  repository: '?', // This is your repository name, for example, "my-api-repository"
  owner: '?', // This is your organization/team name, for example, "nestjs" OR in case of personal projects - your username
  sha: '?', // This represents the "current" commit SHA that triggered the workflow/pipeline
  target: '?', // This represents the "target" commit SHA (e.g., the last commit SHA of the "master" branch)
  // New build will be compared to the "target" build to generate a report
  // NOTE: Some CI/CD tools don't provide you with this information so instead, you can use the "targetBranch" property.
  // NOTE: In this case, the "target" commit SHA will be automatically resolved to the last commit SHA of the "targetBranch" stored in the database.
  // targetBranch: "master",
  trigger: isPr ? 'pull' : 'push', // Depending on whether the pipeline is triggered by a pull request or a regular push commit, you should set "pull" or "push"
  branch: '?', // This is the current branch name, for example, "develop" OR "feat/my-new-feature"
};

```

这些值中的大多数已经存在于您的 CI/CD 提供者的内置环境变量中——请参阅 [CircleCI's environment variable reference](https://circleci.com/docs/variables/#built-in-environment-variables) 和 [Bitbucket's](https://support.atlassian.com/bitbucket-cloud/docs/variables-and-secrets/) 作为起点。

对于流水线触发器，我们建议以下设置：

- `push` —— 仅针对代表部署环境的分支，例如 `master`、`main`、`staging` 或 `production`。
- `pull request` —— 始终运行，或至少在**目标分支**是部署环境时运行（见上文）。

这种组合确保您的注册表中为 `master` 的每个可部署状态保留快照，同时仍然为每个针对它的拉取请求生成报告——这正是让报告真正有用的组合方式。