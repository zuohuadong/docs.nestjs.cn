#!/usr/bin/env tsx

/**
 * 链接修复脚本
 *
 * 修复文档中的链接格式问题：
 * - 移除链接中多余的反斜杠转义
 * - 修复空链接文本 [](path) -> [链接](path)
 * - 清理链接路径中的多余空格
 * - 标准化内部链接格式
 */

import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';

const DOCS_DIR = path.resolve(process.cwd(), 'docs');

function fixLinks(content: string): string {
  let result = content;

  // 1. 修复空链接文本 [](path) - 用路径最后一段作为文本
  result = result.replace(
    /\[]\(([^)]+)\)/g,
    (_match, linkPath: string) => {
      // 提取路径最后一部分作为链接文本
      const cleanPath = linkPath.split('#')[0];
      const segments = cleanPath.split('/').filter(Boolean);
      const lastSegment = segments[segments.length - 1] || linkPath;
      // 将 kebab-case 转为可读文本
      const text = lastSegment
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c: string) => c.toUpperCase());
      return `[${text}](${linkPath})`;
    }
  );

  // 2. 移除链接路径中多余的反斜杠转义 (例如 \\* -> *)
  result = result.replace(
    /\[([^\]]*)\]\(([^)]*\\[^)]*)\)/g,
    (_match, text: string, linkPath: string) => {
      const cleanPath = linkPath.replace(/\\([#*_])/g, '$1');
      if (cleanPath !== linkPath) {
        return `[${text}](${cleanPath})`;
      }
      return _match;
    }
  );

  // 3. 清理链接路径首尾空格
  result = result.replace(
    /\[([^\]]*)\]\(\s+([^)]*?)\s*\)/g,
    '[$1]($2)'
  );

  // 4. 修复链接路径末尾多余的空格
  result = result.replace(
    /\[([^\]]*)\]\(([^)\s]+)\s+\)/g,
    '[$1]($2)'
  );

  // 5. 官方分版本文档链接（/v11、/v10/migration-guide 等）在本站不存在，
  //    属于英文原文中指向 docs.nestjs.com 版本站点的路径，改写为绝对地址。
  //    兼容模型把绝对地址改写成相对路径的情况（./v11 -> https://.../v11）。
  result = result.replace(
    /\]\((?:\/|\.\/)(v\d+(?:\/[^)\s]*)?)\)/g,
    '](https://docs.nestjs.com/$1)'
  );

  // 6. 上游改版后的重定向路径：英文原文仍指向旧路由，本站没有这些页面。
  //    - /fundamentals/testing -> /fundamentals/unit-testing（旧锚点一并去掉）
  //    - /http/session -> /http/sessions
  //    - /faq/common-errors -> /faq/errors
  //    - /llms.txt 由 docs.nestjs.com 提供，本站没有该静态文件
  result = result
    .replace(/\]\(\/fundamentals\/testing(?:#[^)\s]*)?\)/g, '](/fundamentals/unit-testing)')
    .replace(/\]\(\/http\/session(#[^)\s]*)?\)/g, '](/http/sessions$1)')
    .replace(/\]\(\/faq\/common-errors(?:#[^)\s]*)?\)/g, '](/faq/errors)')
    .replace(/\]\(\/llms\.txt\)/g, '](https://docs.nestjs.com/llms.txt)');

  return result;
}

async function fixAllLinks(): Promise<void> {
  console.log('🔗 Fixing links in documentation...');

  const files = await glob(path.join(DOCS_DIR, '**/*.md').replace(/\\/g, '/'));

  let fixedCount = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const fixed = fixLinks(content);

    if (fixed !== content) {
      fs.writeFileSync(file, fixed, 'utf8');
      fixedCount++;
      console.log(`   Fixed: ${path.relative(process.cwd(), file)}`);
    }
  }

  console.log(`\n✅ Fixed links in ${fixedCount} files`);
}

// CLI 入口
async function main() {
  try {
    await fixAllLinks();
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to fix links:', (error as Error).message);
    process.exit(1);
  }
}

main();
