#!/usr/bin/env bun
/**
 * 文档翻译工具 - 统一 CLI 入口
 *
 * 子命令:
 *   translate   翻译文档 (content/ → docs/)
 *   check       检查翻译质量 (占位符/代码块/链接/完整性)
 *   fix         修复代码块和链接格式
 *   post-process  翻译后处理 (锚点映射/链接修正)
 */

import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import type { ValidationIssue } from './lib/types.js';
import {
  countCodeBlockDelimiters,
  countCodeBlocks,
  hasChineseContent,
  countChineseChars,
} from './lib/markdown.js';

// ============================================================================
// CLI 路由
// ============================================================================

const [subcommand, ...subArgs] = process.argv.slice(2);

const HELP = `
文档翻译工具 CLI

用法: bun scripts/cli.ts <command> [options]

命令:
  translate      翻译文档 (content/ → docs/)
  check          检查翻译质量
  fix            修复代码块和链接格式
  post-process   翻译后处理

示例:
  bun scripts/cli.ts translate --verbose
  bun scripts/cli.ts translate --resume
  bun scripts/cli.ts check
  bun scripts/cli.ts fix
  bun scripts/cli.ts post-process --verbose

使用 bun scripts/cli.ts <command> --help 查看各命令详细选项
`;

if (!subcommand || subcommand === '--help' || subcommand === '-h') {
  console.log(HELP);
  process.exit(0);
}

// ============================================================================
// check 子命令
// ============================================================================

async function runCheck() {
  if (subArgs.includes('--help') || subArgs.includes('-h')) {
    console.log(`
用法: bun scripts/cli.ts check [options]

检查项:
  - 占位符泄漏 (__CODE_BLOCK_N__, ⟦CB_N⟧ 等)
  - 代码块数量与源文件匹配
  - AI 幻觉内容
  - 死链接
  - 翻译完整性

选项:
  --docs-dir <dir>    文档目录 (默认: docs)
  --content-dir <dir> 源文件目录 (默认: content)
  --verbose, -v       详细输出
`);
    process.exit(0);
  }

  const docsDir = getArg('--docs-dir') || 'docs';
  const contentDir = getArg('--content-dir') || 'content';
  const verbose = subArgs.includes('--verbose') || subArgs.includes('-v');

  console.log('🔍 Running all translation quality checks...\n');

  const allIssues: ValidationIssue[] = [];

  const docFiles = await glob(path.join(docsDir, '**/*.md').replace(/\\/g, '/'));
  console.log(`📄 Found ${docFiles.length} translated files\n`);

  for (const docFile of docFiles) {
    const relativePath = path.relative(docsDir, docFile);
    const content = fs.readFileSync(docFile, 'utf8');

    // 1. 占位符泄漏
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      // 新格式占位符
      const newMatches = lines[i].match(/⟦\w+_\d+⟧/g);
      if (newMatches) {
        for (const m of newMatches) {
          allIssues.push({
            file: relativePath,
            type: 'placeholder',
            severity: 'error',
            message: `Unresolved placeholder: ${m}`,
            line: i + 1,
          });
        }
      }
      // 旧格式占位符
      const oldMatches = lines[i].match(/__(?:CODE_BLOCK|INLINE_CODE|LINK|HTML_TAG)_\d+__/g);
      if (oldMatches) {
        for (const m of oldMatches) {
          allIssues.push({
            file: relativePath,
            type: 'placeholder',
            severity: 'error',
            message: `Unresolved placeholder (legacy): ${m}`,
            line: i + 1,
          });
        }
      }
    }

    // 2. 代码块数量对比
    const sourcePath = path.join(contentDir, relativePath);
    if (fs.existsSync(sourcePath)) {
      const sourceContent = fs.readFileSync(sourcePath, 'utf8');
      let cleanedSource = sourceContent;
      cleanedSource = cleanedSource.replace(/@@switch\s*\r?\n```[\s\S]*?```\s*\r?\n/g, '');
      cleanedSource = cleanedSource.replace(/@@switch\s*\r?\n(?:(?!@@filename|```|##)[\s\S])*/g, '');

      const sourceCount = countCodeBlockDelimiters(cleanedSource);
      const targetCount = countCodeBlockDelimiters(content);
      const diff = Math.abs(sourceCount - targetCount);

      if (diff > 2) {
        allIssues.push({
          file: relativePath,
          type: 'codeblock',
          severity: 'error',
          message: `Code block mismatch: source=${sourceCount}, target=${targetCount} (diff=${diff})`,
        });
      } else if (diff > 0) {
        allIssues.push({
          file: relativePath,
          type: 'codeblock',
          severity: 'warning',
          message: `Code block slightly off: source=${sourceCount}, target=${targetCount} (diff=${diff})`,
        });
      }

      // 3. 翻译完整性
      const sourceLines = sourceContent.split('\n').filter((l) => l.trim().length > 0);
      const targetLines = content.split('\n').filter((l) => l.trim().length > 0);
      const ratio = targetLines.length / sourceLines.length;

      if (ratio < 0.5) {
        allIssues.push({
          file: relativePath,
          type: 'integrity',
          severity: 'error',
          message: `Line ratio too low: ${(ratio * 100).toFixed(1)}%`,
        });
      }

      const chineseCount = countChineseChars(content);
      if (chineseCount < 50 && sourceLines.length > 20) {
        allIssues.push({
          file: relativePath,
          type: 'integrity',
          severity: 'error',
          message: `Insufficient Chinese: ${chineseCount} chars (threshold: 50)`,
        });
      }
    }

    // 4. AI 幻觉检测
    const hallucinationPatterns = [
      { pattern: /new NestApplication\(\)/g, desc: 'NestApplication is not a constructor' },
      { pattern: /app\.registerModule\(/g, desc: 'registerModule is not a NestJS API' },
    ];
    for (let i = 0; i < lines.length; i++) {
      for (const { pattern, desc } of hallucinationPatterns) {
        pattern.lastIndex = 0;
        if (pattern.test(lines[i])) {
          allIssues.push({
            file: relativePath,
            type: 'hallucination',
            severity: 'warning',
            message: `Possible AI hallucination: ${desc}`,
            line: i + 1,
          });
        }
      }
    }

    // 5. 死链检查
    const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(content)) !== null) {
      const link = linkMatch[2];
      if (link.startsWith('http') || link.startsWith('mailto:') || link.startsWith('#')) continue;
      if (link.toLowerCase() === 'todo') {
        allIssues.push({
          file: relativePath,
          type: 'dead-link',
          severity: 'warning',
          message: `TODO link found`,
        });
        continue;
      }
      const cleanLink = link.split('#')[0];
      if (!cleanLink || cleanLink === './') continue;

      let targetPath: string;
      if (cleanLink.startsWith('/')) {
        targetPath = path.join(docsDir, `${cleanLink}.md`);
      } else {
        targetPath = path.resolve(
          path.dirname(docFile),
          cleanLink.endsWith('.md') ? cleanLink : `${cleanLink}.md`,
        );
      }

      if (!fs.existsSync(targetPath)) {
        allIssues.push({
          file: relativePath,
          type: 'dead-link',
          severity: 'warning',
          message: `Dead link: ${link}`,
        });
      }
    }
  }

  // 输出结果
  let errorCount = 0;
  let warningCount = 0;

  if (allIssues.length === 0) {
    console.log('✅ No translation quality issues found\n');
    process.exit(0);
  }

  const grouped = new Map<string, ValidationIssue[]>();
  for (const issue of allIssues) {
    const existing = grouped.get(issue.file) || [];
    existing.push(issue);
    grouped.set(issue.file, existing);
    if (issue.severity === 'error') errorCount++;
    else warningCount++;
  }

  for (const [file, issues] of grouped) {
    if (!verbose && issues.every((i) => i.severity === 'warning')) continue;
    console.log(`📄 ${file}`);
    for (const issue of issues) {
      const icon = issue.severity === 'error' ? '❌' : '⚠️';
      const lineInfo = issue.line ? `:${issue.line}` : '';
      console.log(`  ${icon} [${issue.type}${lineInfo}] ${issue.message}`);
    }
    console.log('');
  }

  console.log('📊 Summary:');
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log(`   ⚠️ Warnings: ${warningCount}`);
  console.log(`   📄 Files with issues: ${grouped.size}`);

  if (errorCount > 0) {
    console.log('\n❌ Translation quality check FAILED');
    process.exit(1);
  }

  console.log('\n✅ Translation quality check passed (with warnings)');
}

// ============================================================================
// fix 子命令
// ============================================================================

async function runFix() {
  if (subArgs.includes('--help') || subArgs.includes('-h')) {
    console.log(`
用法: bun scripts/cli.ts fix [options]

修复项:
  - 代码块格式 (@@filename/@@switch 转换)
  - 链接格式 (空文本/转义/空格)

选项:
  --docs-dir <dir>  文档目录 (默认: docs)
`);
    process.exit(0);
  }

  const docsDir = getArg('--docs-dir') || 'docs';
  const files = await glob(path.join(docsDir, '**/*.md').replace(/\\/g, '/'));

  console.log('🔧 Fixing code blocks and links...\n');

  let fixedCount = 0;

  for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    const original = content;

    // --- 代码块修复 ---
    // 还原 Nunjucks 转义的花括号
    content = content.replace(/\{\{ '\{' \}\}/g, '{');
    content = content.replace(/\{\{ '\}' \}\}/g, '}');
    // 移除 @@switch 分支
    content = content.replace(/@@switch\s*\r?\n```[\s\S]*?```\s*\r?\n/g, '');
    content = content.replace(/@@switch\s*\r?\n(?:(?!@@filename|```|##)[\s\S])*/g, '');
    // 转换 @@filename
    content = content.replace(/@@filename\s*\(([^)]+)\)\s*\r?\n```(\w+)/g, '\n```$2 title="$1"');
    content = content.replace(/^@@filename\s*\([^)]*\)\s*\r?\n/gm, '');
    // 代码块空行修复
    content = content.replace(/```\s*\n\s*```/g, '```\n```');
    content = content.replace(/([^\n])\n```/g, '$1\n\n```');
    content = content.replace(/```\n([^\n])/g, '```\n\n$1');
    // 多余空行
    content = content.replace(/\n{3,}/g, '\n\n');
    // 代码块语言标记小写（Shiki 语言 ID 区分大小写）
    content = content.replace(/^```([A-Za-z][\w+#-]*)/gm, (_m, lang: string) => `\`\`\`${lang.toLowerCase()}`);

    // --- 链接修复 ---
    // 空链接文本
    content = content.replace(/\[]\(([^)]+)\)/g, (_m, linkPath: string) => {
      const clean = linkPath.split('#')[0];
      const segs = clean.split('/').filter(Boolean);
      const last = segs[segs.length - 1] || linkPath;
      const text = last.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      return `[${text}](${linkPath})`;
    });
    // 反斜杠转义
    content = content.replace(/\[([^\]]*)\]\(([^)*\\[^)]*)\)/g, (_m, text: string, lp: string) => {
      const clean = lp.replace(/\\([#*_])/g, '$1');
      return clean !== lp ? `[${text}](${clean})` : _m;
    });
    // 链接路径空格
    content = content.replace(/\[([^\]]*)\]\(\s+([^)]*?)\s*\)/g, '[$1]($2)');
    content = content.replace(/\[([^\]]*)\]\(([^)\s]+)\s+\)/g, '[$1]($2)');

    if (content !== original) {
      fs.writeFileSync(file, content, 'utf8');
      fixedCount++;
      console.log(`   Fixed: ${path.relative(process.cwd(), file)}`);
    }
  }

  console.log(`\n✅ Fixed ${fixedCount} files`);
}

// ============================================================================
// post-process 子命令
// ============================================================================

async function runPostProcess() {
  if (subArgs.includes('--help') || subArgs.includes('-h')) {
    console.log(`
用法: bun scripts/cli.ts post-process [options]

功能:
  - 应用锚点映射
  - 修正内部链接路径
  - 翻译代码注释

选项:
  --docs-dir <dir>  文档目录 (默认: docs)
  --verbose, -v     详细输出
`);
    process.exit(0);
  }

  const { runPostTranslateProcessor } = await import('./post-translate-processor.js');
  await runPostTranslateProcessor({
    docsDir: getArg('--docs-dir') || 'docs',
    verbose: subArgs.includes('--verbose') || subArgs.includes('-v'),
  });
}

// ============================================================================
// translate 子命令 (转发到 translate-docs.ts)
// ============================================================================

async function runTranslate() {
  // 直接复用 translate-docs.ts 的 CLI 逻辑
  process.argv = ['bun', 'scripts/translate-docs.ts', ...subArgs];
  await import('./translate-docs.js');
}

// ============================================================================
// 工具函数
// ============================================================================

function getArg(flag: string): string | undefined {
  const idx = subArgs.indexOf(flag);
  return idx !== -1 ? subArgs[idx + 1] : undefined;
}

// ============================================================================
// 路由执行
// ============================================================================

switch (subcommand) {
  case 'translate':
    runTranslate();
    break;
  case 'check':
    runCheck();
    break;
  case 'fix':
    runFix();
    break;
  case 'post-process':
    runPostProcess();
    break;
  default:
    console.error(`❌ Unknown command: ${subcommand}`);
    console.log(HELP);
    process.exit(1);
}
