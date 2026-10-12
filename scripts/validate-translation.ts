#!/usr/bin/env tsx

/**
 * 翻译质量校验脚本
 *
 * CI 中使用，检查 docs/ 目录中已翻译文件的质量问题：
 * - 占位符泄漏（__CODE_BLOCK_N__, __INLINE_CODE_N__ 等）
 * - 代码块数量与源文件不匹配
 * - AI 幻觉内容（编造不存在的 API）
 * - 链接指向错误目标（如 GitHub PR/diff 页面）
 */

import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';

const DOCS_DIR = path.resolve(process.cwd(), 'docs');
const CONTENT_DIR = path.resolve(process.cwd(), 'content');

interface ValidationIssue {
  file: string;
  type: 'placeholder' | 'codeblock' | 'hallucination' | 'bad-link';
  severity: 'error' | 'warning';
  message: string;
  line?: number;
}

// AI 容易编造的 NestJS API / 不存在的模式
const HALLUCINATION_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /new NestApplication\(\)/g, description: 'NestApplication is not a constructor' },
  { pattern: /app\.registerModule\(/g, description: 'registerModule is not a NestJS API' },
  { pattern: /scope:\s*['"`]npm run/g, description: 'Likely AI hallucination mixing CLI commands into API' },
  { pattern: /tsconfig\.json.*函数/g, description: 'Likely AI hallucination confusing config with API' },
  { pattern: /dist\s+方法/g, description: 'Likely AI hallucination confusing dist directory with method' },
];

// 指向 GitHub PR/diff 页面的错误链接
const BAD_LINK_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  {
    pattern: /\]\(https:\/\/github\.com\/[^)]*\/pull\/\d+/g,
    description: 'Link points to a GitHub PR instead of docs',
  },
  {
    pattern: /\]\(https:\/\/github\.com\/[^)]*\.diff\)/g,
    description: 'Link points to a GitHub diff file',
  },
];

function countCodeBlockDelimiters(content: string): number {
  return (content.match(/```/g) || []).length;
}

function checkPlaceholderLeaks(content: string, relativePath: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const matches = line.match(/__(?:CODE_BLOCK|INLINE_CODE|LINK|HTML_TAG)_\d+__/g);
    if (matches) {
      for (const match of matches) {
        issues.push({
          file: relativePath,
          type: 'placeholder',
          severity: 'error',
          message: `Unresolved placeholder: ${match}`,
          line: i + 1,
        });
      }
    }
  }

  return issues;
}

function checkCodeBlockCount(
  sourceContent: string,
  targetContent: string,
  relativePath: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 源文件中移除 @@switch 块后再计数（翻译时会删除这些）
  let cleanedSource = sourceContent;
  // 移除 @@switch 后面的代码块
  cleanedSource = cleanedSource.replace(
    /@@switch\s*\r?\n```[\s\S]*?```\s*\r?\n/g,
    '',
  );
  // 移除 @@switch 后面没有代码块标记的内容
  cleanedSource = cleanedSource.replace(
    /@@switch\s*\r?\n(?:(?!@@filename|```|##)[\s\S])*/g,
    '',
  );

  const sourceCount = countCodeBlockDelimiters(cleanedSource);
  const targetCount = countCodeBlockDelimiters(targetContent);
  const diff = Math.abs(sourceCount - targetCount);

  if (targetCount % 2 !== 0) {
    // 目标文件存在未闭合代码块
    issues.push({
      file: relativePath,
      type: 'codeblock',
      severity: 'error',
      message: `Unclosed code block in target file (odd delimiter count: ${targetCount})`,
    });
  } else if (diff > 2) {
    // 大偏差：源文件与译文代码块数量不一致（可能源文件有未翻译的新增章节，或译文遗漏）
    issues.push({
      file: relativePath,
      type: 'codeblock',
      severity: 'warning',
      message: `Code block delimiter count mismatch: source=${sourceCount}, target=${targetCount} (diff=${diff})`,
    });
  } else if (diff > 0) {
    // 小偏差：可能是 @@switch 清理遗留，仅警告
    issues.push({
      file: relativePath,
      type: 'codeblock',
      severity: 'warning',
      message: `Code block delimiter count slightly off: source=${sourceCount}, target=${targetCount} (diff=${diff})`,
    });
  }

  return issues;
}

function checkHallucinations(content: string, relativePath: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 跳过代码块内的内容
    // 简化处理：如果行以 ``` 开头则跳过代码块区域
    for (const { pattern, description } of HALLUCINATION_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(line)) {
        issues.push({
          file: relativePath,
          type: 'hallucination',
          severity: 'warning',
          message: `Possible AI hallucination: ${description}`,
          line: i + 1,
        });
      }
    }
  }

  return issues;
}

function checkBadLinks(content: string, relativePath: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { pattern, description } of BAD_LINK_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(line)) {
        issues.push({
          file: relativePath,
          type: 'bad-link',
          severity: 'warning',
          message: description,
          line: i + 1,
        });
      }
    }
  }

  return issues;
}

async function main(): Promise<void> {
  console.log('🔍 Validating translation quality...\n');

  const docFiles = await glob(
    path.join(DOCS_DIR, '**/*.md').replace(/\\/g, '/'),
  );
  console.log(`📄 Found ${docFiles.length} translated files to check\n`);

  const allIssues: ValidationIssue[] = [];
  let errorCount = 0;
  let warningCount = 0;

  for (const docFile of docFiles) {
    const relativePath = path.relative(DOCS_DIR, docFile);
    const content = fs.readFileSync(docFile, 'utf8');

    // 1. 占位符泄漏检测
    const placeholderIssues = checkPlaceholderLeaks(content, relativePath);
    allIssues.push(...placeholderIssues);

    // 2. 代码块数量对比（与 content/ 源文件对比）
    const sourcePath = path.join(CONTENT_DIR, relativePath);
    if (fs.existsSync(sourcePath)) {
      const sourceContent = fs.readFileSync(sourcePath, 'utf8');
      const codeBlockIssues = checkCodeBlockCount(
        sourceContent,
        content,
        relativePath,
      );
      allIssues.push(...codeBlockIssues);
    }

    // 3. AI 幻觉检测
    const hallucinationIssues = checkHallucinations(content, relativePath);
    allIssues.push(...hallucinationIssues);

    // 4. 错误链接检测
    const badLinkIssues = checkBadLinks(content, relativePath);
    allIssues.push(...badLinkIssues);
  }

  // 输出结果
  if (allIssues.length === 0) {
    console.log('✅ No translation quality issues found\n');
    process.exit(0);
  }

  // 按文件分组输出
  const grouped = new Map<string, ValidationIssue[]>();
  for (const issue of allIssues) {
    const existing = grouped.get(issue.file) || [];
    existing.push(issue);
    grouped.set(issue.file, existing);
    if (issue.severity === 'error') errorCount++;
    else warningCount++;
  }

  for (const [file, fileIssues] of grouped) {
    console.log(`📄 ${file}`);
    for (const issue of fileIssues) {
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

  // 有 error 级别问题则退出码 1
  if (errorCount > 0) {
    console.log('\n❌ Translation quality check FAILED');
    process.exit(1);
  }

  console.log('\n⚠️ Translation quality check passed with warnings');
  process.exit(0);
}

main();
