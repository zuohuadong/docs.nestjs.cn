<!-- 此文件从 content/devtools/ci-cd.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-10-21T09:24:05.595Z -->
<!-- 源文件: content/devtools/ci-cd.md -->
<!-- 源哈希: 891db94e020dc05875c0b6a7a8d9b4aa -->

### CI/CD 集成

> info **提示** 本章介绍 Nest Devtools 与 Nest 框架的集成。如果你正在寻找 Devtools 应用程序，请访问 [Devtools](https://devtools.nestjs.com) 网站。CI/CD 集成在 **[Enterprise](https://devtools.nestjs.com/settings)** 计划中可用。

在本地使用 Devtools 非常适合在构建应用程序时进行探索，但真正的价值在于当 Devtools 成为你交付流水线的一部分时。CI/CD 集成会在每次构建时发布应用程序图的快照。你可以获得架构演进过程的运行历史，更重要的是，每个拉取请求都会自动生成一份报告，准确展示结构上发生了什么变化。这就是"希望重构没有破坏任何东西"与"知道它没有破坏任何东西"之间的区别。

看看为什么团队依赖 CI/CD 集成来在架构漂移发布之前捕获它：

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

首先，将应用程序引导文件（`main.ts`）接入使用 `GraphPublisher` 类，该类从 `@nestjs/devtools-integration` 导出（如果你还没有安装它，请参阅 [Devtools overview](/devtools/overview)）：

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

在这里，`GraphPublisher` 将你序列化后的图推送到集中式注册表。`PUBLISH_GRAPH` 是一个自定义环境变量，用于区分 CI/CD 发布运行与常规应用程序引导。将 `preview` 设置为 `true` 会以预览模式引导应用程序，这意味着你的控制器、增强器和提供者的构造函数和生命周期钩子不会执行。这并非**必需**，但它能让 CI 运行保持快速和简单（例如，无需数据库连接）。

`publishOptions` 的形式取决于你的 CI/CD 提供商。以下各节涵盖了最流行的几种。如果你的提供商未列出，底层字段在各处都是相同的，因此你可以在几分钟内调整配置。

一旦你的图成功发布，你将在工作流日志中看到类似以下的输出：

<figure><img src="/assets/devtools/graph-published-terminal.png" /></figure>

每个已发布的图都会作为项目页面上的一个新条目出现：

<figure><img src="/assets/devtools/project.png" /></figure>

#### 报告

Devtools 会为每次构建生成一份报告，**前提是**注册表中已经存在匹配的快照。如果你针对 `master` 打开一个拉取请求，并且 `master` 的图已经发布过，Devtools 会检测到差异并自动构建一份报告。否则，还没有可供比较的内容。

在项目页面上查找你的报告（参见 [organizations](https://devtools.nestjs.com/organizations)）。

<figure><img src="/assets/devtools/report.png" /></figure>

这正是 Devtools 真正发挥价值的地方：捕获那些从代码审查中溜走的变更。假设有人悄悄更改了一个**深度嵌套的提供者**的作用域。这在 diff 中很容易被忽略，而在报告中则不可能被忽略。从某个端点移除一个守卫，它会立即作为受影响的变更显示出来。如果集成测试或 e2e 测试没有覆盖该路由，你可能直到为时已晚才会注意到。Devtools 会在审查时捕获它。

**大型代码库**也是如此：将一个模块设为全局，你会立即看到有多少新边落在图上，这通常是一个强烈的信号，表明某些东西需要再次审视。

报告也是一个非常适合链接到拉取请求描述中的产物。与其要求审查者相信"这只涉及计费模块"，你可以直接指向发生变更的确切节点和边集合，将架构上的断言转化为他们可以在几秒钟内验证的东西。

#### 构建预览

你可以回放每一个已发布的图：点击 **Preview** 即可查看它在那个时间点的确切样子。当有报告可用时，差异会直接在图上高亮显示：

- 绿色节点表示新增的元素
- 浅白色节点表示更新的元素
- 红色节点表示删除的元素

它看起来是这样的：

<figure><img src="/assets/devtools/nodes-selection.png" /></figure>

能够回退并比较图使得故障排查变得简单直接，不再需要猜测发生了什么变化以及何时发生变化。进行设置，使每个拉取请求（甚至每次提交）都在注册表中拥有自己的快照，你就总能拥有一条清晰的追踪线索。把 Devtools 想象成一种版本控制，它理解 Nest 如何组装你的应用程序，并且能够**向你展示**差异，而不仅仅是描述它。

#### 集成：GitHub Actions

在 `.github/workflows` 中创建一个新的工作流文件（例如 `publish-graph.yml`），内容如下：

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
    if: github.actor != 'dependabot[bot]'
    name: Publish graph
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
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

> info **提示** 为了更好的安全性，请将 `DEVTOOLS_API_KEY` 存储为 GitHub secret，而不是硬编码它。参见 [Creating secrets for a repository](https://docs.github.com/en/actions/security-guides/encrypted-secrets#creating-encrypted-secrets-for-a-repository)。

此工作流会在每个拉取请求以及直接推送到 `master` 时运行。根据你项目的需要进行调整；唯一的要求是提供 `GraphPublisher` 所依赖的环境变量。

在工作流可以运行之前，填写剩下的一个变量：`DEVTOOLS_API_KEY`。在 **[API keys page](https://devtools.nestjs.com/settings/manage-api-keys)** 上为你的项目生成一个专用的 API 密钥。

最后，回到 `main.ts` 并填写我们之前留空的 `publishOptions` 对象：

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

为了获得最流畅的体验，我们还建议通过点击 "Integrate GitHub app"（见下文）为你的项目安装 **GitHub 应用程序**。这是可选的，但非常值得。

<figure><img src="/assets/devtools/integrate-github-app.png" /></figure>

安装该应用程序后，你可以直接在拉取请求中看到预览和报告生成的状态：

<figure><img src="/assets/devtools/actions-preview.png" /></figure>

#### 集成：Gitlab Pipelines

在项目根目录中创建一个 `.gitlab-ci.yml` 文件，内容定义如下：

```yaml
image: node:22

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

> info **提示** 与 GitHub 一样，我们建议将 `DEVTOOLS_API_KEY` 存储为 CI/CD secret，而不是将其提交到仓库中。

此流水线会在每个合并请求以及直接推送到 `master` 时运行。根据你的项目需要进行调整，但要确保 `GraphPublisher` 所需的环境变量始终存在。

此定义中还有一个变量需要填入真实值：`DEVTOOLS_API_KEY`。在 **[API keys page](https://devtools.nestjs.com/settings/manage-api-keys)** 上为你的项目生成一个专用的 API 密钥。

最后，回到 `main.ts` 并填写我们之前留空的 `publishOptions` 对象：

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

该集成并不依赖于 GitHub 或 GitLab。`GraphPublisher` 只需要少量描述当前构建的值（由什么触发、哪个提交、哪个分支），因此它可以与任何提供者配合使用，包括 [Bitbucket Pipelines](https://bitbucket.org/product/features/pipelines)、[CircleCI](https://circleci.com/) 等。

以下是完整的 `publishOptions` 结构以及每个字段所代表的含义，以便你可以接入任何流水线：

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

这些值大多可以在你的 CI/CD 提供者的内置环境变量中找到。可以参考 [CircleCI built-in environment variables](https://circleci.com/docs/variables/#built-in-environment-variables) 和 [Bitbucket variables and secrets](https://support.atlassian.com/bitbucket-cloud/docs/variables-and-secrets/) 作为起点。

对于流水线触发器，我们推荐以下设置：

- `push`：仅用于代表部署环境的分支，例如 `master`、`main`、`staging` 或 `production`。
- `pull request`：始终触发，或至少在**目标分支**是部署环境时触发（见上文）。

这种组合可以让你的注册表始终保存 `master` 每个可部署状态的快照，同时仍然会为每个针对它的拉取请求生成报告。正是这种配对才让报告真正有用。