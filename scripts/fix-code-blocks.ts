#!/usr/bin/env tsx

/**
 * 代码块修复脚本
 * 
 * 修复文档中的代码块格式：
 * - 转换 @@filename 语法
 * - 移除 @@switch 分支（只保留 TypeScript 版本）
 * - 修复缩进问题
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { glob } from 'glob';

const DOCS_DIR = path.resolve(process.cwd(), 'docs');

export function fixCodeBlocks(content: string): string {
  let result = content;

  // 0. 还原 Nunjucks 转义的花括号: {{ '{' }} -> {, {{ '}' }} -> }
  // 这些是 Nunjucks/Jinja2 模板语法，RSPress (MDX) 不需要这种转义
  result = result.replace(/\{\{ '\{' \}\}/g, '{');
  result = result.replace(/\{\{ '\}' \}\}/g, '}');

  // 1. 移除 @@switch 分支及其后面的代码块
  // 匹配 @@switch 后面跟着的整个代码块（直到下一个 ```）
  result = result.replace(
    /@@switch\s*\r?\n```[\s\S]*?```\s*\r?\n/g,
    ''
  );

  // 2. 移除 @@switch 分支及其后面的代码（直到下一个 @@filename 或文件结束）
  // 这处理 @@switch 后面没有代码块标记的情况
  result = result.replace(
    /@@switch\s*\r?\n(?:(?!@@filename|```)[\s\S])*/g,
    ''
  );

  // 3. 转换 @@filename 语法
  // @@filename(main.ts) 后面跟着 ```typescript
  result = result.replace(
    /@@filename\s*\(([^)]+)\)\s*\r?\n```(\w+)/g,
    '\n```$2 title="$1"'
  );

  // 3.5 转换代码块内部的 @@filename 行（官方文档将 @@filename 作为代码块首行）。
  // 此前仅靠规则 4 删除该行，导致代码块丢失文件名标签（title）。
  // TypeScript/JavaScript 块自动补全 .ts/.js 扩展名，其余保留原样。
  result = result.replace(
    /```(typescript|javascript)[ \t]*\r?\n(?:[ \t]*\r?\n)*@@filename[ \t]*\(([^)]+)\)[ \t]*\r?\n/g,
    (_m: string, lang: string, name: string) => {
      const file = /\.(ts|js|json|md|yml|yaml|html|css|txt|sh|env)$/i.test(name)
        ? name
        : `${name}.${lang === 'javascript' ? 'js' : 'ts'}`;
      return `\`\`\`${lang} title="${file}"\n`;
    },
  );

  // 4. 移除独立的 @@filename 行
  result = result.replace(/^@@filename\s*\([^)]*\)\s*\r?\n/gm, '');

  // 5. 修复代码块中的空行
  result = result.replace(/```\s*\n\s*```/g, '```\n```');

  // 6. 确保代码块前后有空行
  result = result.replace(/([^\n])\n```/g, '$1\n\n```');
  result = result.replace(/```\n([^\n])/g, '```\n\n$1');

  // 7. 清理多余的空行（超过 2 个连续空行）
  result = result.replace(/\n{3,}/g, '\n\n');

  // 8. 代码块语言标记统一小写。Shiki 语言 ID 区分大小写，
  //    官方原文里的 ```TypeScript 会让 rspress 构建直接失败。
  result = result.replace(/^```([A-Za-z][\w+#-]*)/gm, (_m, lang: string) => `\`\`\`${lang.toLowerCase()}`);

  return result;
}

async function fixAllCodeBlocks(): Promise<void> {
  console.log('🔧 Fixing code blocks in documentation...');

  const files = await glob(path.join(DOCS_DIR, '**/*.md').replace(/\\/g, '/'));

  let fixedCount = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const fixed = fixCodeBlocks(content);

    if (fixed !== content) {
      fs.writeFileSync(file, fixed, 'utf8');
      fixedCount++;
      console.log(`   Fixed: ${path.relative(process.cwd(), file)}`);
    }
  }

  console.log(`\n✅ Fixed code blocks in ${fixedCount} files`);
}

// CLI 入口
async function main() {
  try {
    await fixAllCodeBlocks();
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to fix code blocks:', (error as Error).message);
    process.exit(1);
  }
}

// 仅在直接执行本脚本时运行 CLI 入口。
// 重要：本文件被 translate-docs.ts 等 模块 import 复用 fixCodeBlocks 函数，
// 顶层执行 main() 会在宿主进程翻译过程中触发 process.exit()，导致翻译被静默终止。
const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main();
}
