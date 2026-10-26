#!/usr/bin/env tsx

/**
 * Clean URLs 后处理脚本
 *
 * 将 rspress 构建输出的 foo.html 转换为 foo/index.html 目录结构，
 * 使得 /foo 路径在任何静态文件服务器上都能正确访问。
 *
 * 例如：
 *   doc_build/introduction.html → doc_build/introduction/index.html
 *   doc_build/overview/first-steps.html → doc_build/overview/first-steps/index.html
 *
 * 跳过的文件：
 *   - index.html（已经是目录入口）
 *   - 404.html（特殊错误页面）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outDir = path.join(__dirname, '..', 'doc_build');

function processDirectory(dir: string): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // 递归处理子目录
      processDirectory(fullPath);
    } else if (
      entry.name.endsWith('.html') &&
      entry.name !== 'index.html' &&
      entry.name !== '404.html'
    ) {
      // 将 foo.html → foo/index.html
      const baseName = entry.name.replace(/\.html$/, '');
      const newDir = path.join(dir, baseName);
      const newPath = path.join(newDir, 'index.html');

      // 如果目标目录已存在 index.html，跳过
      if (fs.existsSync(newPath)) {
        console.log(`  ⏭️ 跳过 ${path.relative(outDir, fullPath)}（目标已存在）`);
        continue;
      }

      // 创建目录并移动文件
      fs.mkdirSync(newDir, { recursive: true });
      fs.renameSync(fullPath, newPath);
      console.log(`  ✅ ${path.relative(outDir, fullPath)} → ${path.relative(outDir, newPath)}`);
    }
  }
}

console.log('🔗 Converting HTML files to clean URL directory structure...');
processDirectory(outDir);
console.log('✅ Clean URLs conversion complete!');

// 404.html 由 Rspress 单独生成，不会应用 config.head 中的标签，
// 这里补充 AdSense 站点验证所需的 meta 标记。
const adsenseMeta =
  '<meta name="google-adsense-account" content="ca-pub-3319999205844901">';
const notFoundPath = path.join(outDir, '404.html');
if (fs.existsSync(notFoundPath)) {
  const html = fs.readFileSync(notFoundPath, 'utf-8');
  if (!html.includes('google-adsense-account')) {
    fs.writeFileSync(
      notFoundPath,
      html.replace(/<head>/i, `<head>\n${adsenseMeta}`),
      'utf-8',
    );
    console.log('✅ Injected AdSense meta tag into 404.html');
  }
}
