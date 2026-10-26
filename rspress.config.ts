import * as path from 'node:path';
import { defineConfig, UserConfig } from '@rspress/core';
import { pluginClientRedirects } from '@rspress/plugin-client-redirects';

const config: UserConfig = {
  root: path.join(__dirname, 'docs'),
  outDir: path.join(__dirname, 'doc_build'),
  lang: 'zh',
  builderConfig: {
    dev: {
      assetPrefix: '/',
    },
    output: {
      assetPrefix: '/',
      distPath: {
        root: path.join(__dirname, 'doc_build'),
      },
    }
  },
  title: 'NestJS 中文文档',
  description: 'NestJS 是一个用于构建高效、可扩展的 Node.js 服务器端应用程序的开发框架',
  icon: '/favicon.ico',
  logo: {
    light: '/rspress-light-logo.png',
    dark: '/rspress-dark-logo.png',
  },
  route: {
    cleanUrls: true,
  },
  plugins: [
    pluginClientRedirects({
      redirects: [
        {
          from: '/fundamentals/custom-providers',
          to: '/fundamentals/dependency-injection',
        },
        {
          from: '/fundamentals/custom-providers/:path*',
          to: '/fundamentals/dependency-injection',
        },
        {
          from: '/fundamentals/async-providers',
          to: '/fundamentals/async-components',
        },
        {
          from: '/fundamentals/injection-scopes',
          to: '/fundamentals/provider-scopes',
        },
        {
          from: '^/fundamentals/module-ref$',
          to: '/fundamentals/module-reference',
        },
        {
          from: '/techniques/database',
          to: '/techniques/sql',
        },
        {
          from: '^/providers$',
          to: '/overview/providers',
        },
        {
          from: '^/graphql/resolvers$',
          to: '/graphql/resolvers-map',
        },
        {
          from: '/graphql/other-features',
          to: '/graphql/guards-interceptors',
        },
        {
          from: '/cli/monorepo',
          to: '/cli/workspaces',
        },
        {
          from: '/techniques/mongodb',
          to: '/recipes/mongodb',
        },
      ],
    }),
  ],
  i18nSource: {
    outlineTitle: {
      zh: '目录',
      en: 'Table of Contents',
    },
    lastUpdatedText: {
      zh: '最后更新于',
      en: 'Last Updated',
    },
    prevPageText: {
      zh: '上一页',
      en: 'Previous',
    },
    nextPageText: {
      zh: '下一页',
      en: 'Next',
    },
    editLinkText: {
      zh: '在 GitHub 上编辑此页',
      en: 'Edit this page on GitHub',
    },
  },
  head: [
    [
      'meta',
      {
        name: 'google-adsense-account',
        content: 'ca-pub-3319999205844901',
      },
    ],
    [
      'meta',
      {
        name: 'theme-color',
        content: '#ffffff',
      },
    ],
    [
      'script',
      {
        async: '',
        src: 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3319999205844901',
        crossorigin: 'anonymous',
      },
    ],
  ],
  themeConfig: {
    nav: [
      {
        text: '文档仓库',
        link: 'https://github.com/nestcn/docs.nestjs.cn',
      },
      {
        text: '报告错误',
        link: 'https://github.com/nestcn/docs.nestjs.cn/issues/new?template=bug_report.md',
      },
    ],
    editLink: {
      docRepoBaseUrl: 'https://github.com/nestcn/docs.nestjs.cn/tree/main/docs',
    },
    footer: {
      message: `
        <a href="https://github.com/nestcn/docs.nestjs.cn/issues/new" target="_blank" rel="noopener noreferrer"
           onclick="event.preventDefault(); window.open('https://github.com/nestcn/docs.nestjs.cn/issues/new?title=Translation+Feedback&body=Page: ' + window.location.href, '_blank');"
           style="display: inline-flex; align-items: center; gap: 0.5rem; color: var(--rp-c-brand); font-weight: 500; text-decoration: none; margin-bottom: 1rem;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          报告翻译错误
        </a><br/>
        Copyright © 2024 NestJS CN
      `,
    },
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/nestjs/nest',
      },
    ],
    lastUpdated: true,
    sidebar: {
      '/': [
        {
          text: '开始',
          link: '/introduction'
        },
        {
          text: '概述',
          collapsible: true,
          collapsed: true,
          items: [
            { text: '第一步', link: '/overview/first-steps' },
            { text: '控制器', link: '/overview/controllers' },
            { text: '提供者', link: '/overview/providers' },
            { text: '模块', link: '/overview/modules' },
            { text: '中间件', link: '/overview/middlewares' },
            { text: '异常过滤器', link: '/overview/exception-filters' },
            { text: '管道', link: '/overview/pipes' },
            { text: '守卫', link: '/overview/guards' },
            { text: '拦截器', link: '/overview/interceptors' },
            { text: '自定义装饰器', link: '/overview/custom-decorators' },
          ],
        },
        {
          text: '基础',
          collapsible: true,
          collapsed: true,
          items: [
            { text: '自定义提供程序', link: '/fundamentals/dependency-injection' },
            { text: '异步提供者', link: '/fundamentals/async-components' },
            { text: '动态模块', link: '/fundamentals/dynamic-modules' },
            { text: '注入作用域', link: '/fundamentals/provider-scopes' },
            { text: '循环依赖', link: '/fundamentals/circular-dependency' },
            { text: '模块引用', link: '/fundamentals/module-reference' },
            { text: '懒加载模块', link: '/fundamentals/lazy-loading-modules' },
            { text: '执行上下文', link: '/fundamentals/execution-context' },
            { text: '生命周期事件', link: '/fundamentals/lifecycle-events' },
            { text: '发现服务', link: '/fundamentals/discovery-service' },
            { text: '平台无关', link: '/fundamentals/platform-agnosticism' },
            { text: '单元测试', link: '/fundamentals/unit-testing' },
          ],
        },
        {
          text: '技术',
          collapsible: true,
          collapsed: true,
          items: [
            { text: '配置', link: '/techniques/configuration' },
            { text: 'SQL', link: '/techniques/sql' },
            { text: 'Mongo', link: '/techniques/mongo' },
            { text: '验证', link: '/techniques/validation' },
            { text: '缓存', link: '/techniques/caching' },
            { text: '序列化', link: '/techniques/serialization' },
            { text: '版本控制', link: '/techniques/versioning' },
            { text: '任务调度', link: '/techniques/task-scheduling' },
            { text: '队列', link: '/techniques/queues' },
            { text: '日志', link: '/techniques/logger' },
            { text: 'Cookies', link: '/techniques/cookies' },
            { text: '事件', link: '/techniques/events' },
            { text: '压缩', link: '/techniques/compression' },
            { text: '文件上传', link: '/techniques/file-upload' },
            { text: '文件流', link: '/techniques/streaming-files' },
            { text: 'HTTP 模块', link: '/techniques/http-module' },
            { text: 'Session', link: '/techniques/sessions' },
            { text: 'MVC', link: '/techniques/mvc' },
            { text: '性能(Fastify)', link: '/techniques/performance' },
            { text: 'SSE', link: '/techniques/server-sent-events' },
          ],
        },
        {
          text: '安全',
          collapsible: true,
          collapsed: true,
          items: [
            { text: '认证', link: '/security/authentication' },
            { text: '授权', link: '/security/authorization' },
            { text: '加密与哈希', link: '/security/encryption-hashing' },
            { text: 'Helmet', link: '/security/helmet' },
            { text: 'CORS', link: '/security/cors' },
            { text: 'CSRF', link: '/security/csrf' },
            { text: '速率限制', link: '/security/rate-limiting' },
          ],
        },
        {
          text: 'GraphQL',
          collapsible: true,
          collapsed: true,
          items: [
            { text: '快速开始', link: '/graphql/quick-start' },
            { text: '解析器', link: '/graphql/resolvers-map' },
            { text: '变更', link: '/graphql/mutations' },
            { text: '订阅', link: '/graphql/subscriptions' },
            { text: '标量', link: '/graphql/scalars' },
            { text: '指令', link: '/graphql/directives' },
            { text: '接口', link: '/graphql/interfaces' },
            { text: '联合与枚举', link: '/graphql/unions-and-enums' },
            { text: '字段中间件', link: '/graphql/field-middleware' },
            { text: '类型映射', link: '/graphql/mapped-types' },
            { text: '插件', link: '/graphql/plugins' },
            { text: '复杂度', link: '/graphql/complexity' },
            { text: '扩展', link: '/graphql/extensions' },
            { text: 'CLI 插件', link: '/graphql/cli-plugin' },
            { text: '生成SDL', link: '/graphql/schema-generator' },
            { text: '共享模型', link: '/graphql/sharing-models' },
            { text: '其他功能', link: '/graphql/guards-interceptors' },
            { text: '联邦', link: '/graphql/federation' },
          ],
        },
        {
          text: 'WebSocket',
          collapsible: true,
          collapsed: true,
          items: [
            { text: '网关', link: '/websockets/gateways' },
            { text: '异常过滤器', link: '/websockets/exception-filters' },
            { text: '管道', link: '/websockets/pipes' },
            { text: '守卫', link: '/websockets/guards' },
            { text: '拦截器', link: '/websockets/interceptors' },
            { text: '适配器', link: '/websockets/adapter' },
          ],
        },
        {
          text: '微服务',
          collapsible: true,
          collapsed: true,
          items: [
            { text: '基础', link: '/microservices/basics' },
            { text: 'Redis', link: '/microservices/redis' },
            { text: 'MQTT', link: '/microservices/mqtt' },
            { text: 'NATS', link: '/microservices/nats' },
            { text: 'RabbitMQ', link: '/microservices/rabbitmq' },
            { text: 'Kafka', link: '/microservices/kafka' },
            { text: 'gRPC', link: '/microservices/grpc' },
            { text: '自定义传输', link: '/microservices/custom-transport' },
            { text: '异常过滤器', link: '/microservices/exception-filters' },
            { text: '管道', link: '/microservices/pipes' },
            { text: '守卫', link: '/microservices/guards' },
            { text: '拦截器', link: '/microservices/interceptors' },
          ],
        },
        {
          text: '部署',
          link: '/deployment'
        },
        {
          text: '独立应用程序',
          link: '/standalone-applications'
        },
        {
          text: 'CLI',
          collapsible: true,
          collapsed: true,
          items: [
            { text: '概述', link: '/cli/overview' },
            { text: '工作区', link: '/cli/workspaces' },
            { text: '库', link: '/cli/libraries' },
            { text: '用法', link: '/cli/usages' },
            { text: '脚本', link: '/cli/scripts' },
          ],
        },
        {
          text: 'OpenAPI',
          collapsible: true,
          collapsed: true,
          items: [
            { text: '介绍', link: '/openapi/introduction' },
            { text: '装饰器', link: '/openapi/decorators' },
            { text: '类型映射', link: '/openapi/mapped-types' },
            { text: '操作', link: '/openapi/operations' },
            { text: '其他特性', link: '/openapi/other-features' },
            { text: '安全', link: '/openapi/security' },
            { text: '类型与参数', link: '/openapi/types-and-parameters' },
            { text: 'CLI 插件', link: '/openapi/cli-plugin' },
          ],
        },
        {
          text: '实用示例',
          collapsible: true,
          collapsed: true,
          items: [
            { text: 'REPL', link: '/recipes/repl' },
            { text: 'CRUD生成器', link: '/recipes/crud-generator' },
            { text: 'SWC', link: '/recipes/swc' },
            { text: 'Passport(认证)', link: '/recipes/passport' },
            { text: '热重载', link: '/recipes/hot-reload' },
            { text: 'MikroORM', link: '/recipes/mikroorm' },
            { text: 'TypeORM', link: '/recipes/sql-typeorm' },
            { text: 'Mongoose', link: '/recipes/mongodb' },
            { text: 'Sequelize', link: '/recipes/sql-sequelize' },
            { text: '路由模块', link: '/recipes/router-module' },
            { text: 'Swagger', link: '/openapi/introduction' },
            { text: '健康检查', link: '/recipes/terminus' },
            { text: 'CQRS', link: '/recipes/cqrs' },
            { text: 'Compodoc', link: '/recipes/documentation' },
            { text: 'Prisma', link: '/recipes/prisma' },
            { text: 'Sentry', link: '/recipes/sentry' },
            { text: '静态资源', link: '/recipes/serve-static' },
            { text: 'Commander', link: '/recipes/nest-commander' },
            { text: '异步本地存储', link: '/recipes/async-local-storage' },
            { text: 'Necord', link: '/recipes/necord' },
            { text: '套件(原Automock)', link: '/recipes/suites' },
          ],
        },
        {
          text: '常见问题',
          collapsible: true,
          collapsed: true,
          items: [
            { text: 'Serverless', link: '/faq/serverless' },
            { text: 'HTTP 适配器', link: '/faq/http-adapter' },
            { text: '长连接', link: '/faq/keep-alive-connections' },
            { text: '全局前缀', link: '/faq/global-prefix' },
            { text: '原始请求体', link: '/faq/raw-body' },
            { text: '混合应用', link: '/faq/hybrid-application' },

            { text: 'HTTPS & 多服务器', link: '/faq/multiple-servers' },
            { text: '请求生命周期', link: '/faq/request-lifecycle' },
            { text: '错误', link: '/faq/errors' },
          ],
        },
        {
          text: '开发工具',
          collapsible: true,
          collapsed: true,
          items: [
            { text: '概述', link: '/devtools/overview' },
            { text: 'CI/CD', link: '/devtools/ci-cd' },
          ],
        },
        {
          text: '可观测性',
          collapsible: true,
          collapsed: true,
          items: [
            { text: '概述', link: '/observability/overview' },
            { text: 'SDK', link: '/observability/sdk' },
            { text: '手动插桩', link: '/observability/manual-instrumentation' },
            { text: '分布式追踪', link: '/observability/distributed-tracing' },
            { text: '仪表盘', link: '/observability/dashboard' },
            { text: 'MCP 服务器', link: '/observability/mcp-server' },
          ],
        },
        {
          text: '迁移指南',
          link: '/migration-guide'
        },
        {
          text: 'API参考(官方)',
          link: 'https://api-references-nestjs.netlify.app/api'
        },
        {
          text: '生态与案例',
          collapsible: true,
          collapsed: true,
          items: [
            { text: '谁在用', link: '/discover/who-uses' },
            { text: '精彩资源', link: '/awesome' },
          ],
        },
        {
          text: '支持',
          collapsible: true,
          collapsed: true,
          items: [
            { text: '支持', link: '/support/index' },
          ],
        },
        {
          text: '社区',
          collapsible: true,
          collapsed: true,
          items: [
            { text: '贡献者', link: '/contributors' },
          ],
        },
      ],
    },
  },
  mediumZoom: {
    selector: '.rspress-doc img',
  },
  globalStyles: path.join(__dirname, 'styles/styles.css')
};
export default defineConfig(config);
