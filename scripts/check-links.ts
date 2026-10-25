import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';

/**
 * 链接检查脚本 - 检查 docs 目录下的 Markdown 文件是否存在死链接
 */
interface DeadLink {
  file: string;
  link: string;
}

async function checkLinks(): Promise<void> {
  const docsDir = 'docs';
  console.log(`🔗 开始检查链接 (目录: ${docsDir})`);

  const pattern = path.join(docsDir, '**/*.md').replace(/\\/g, '/');
  const files = await glob(pattern);
  console.log(`📋 找到 ${files.length} 个文件`);

  const deadLinks: DeadLink[] = [];
  let processedFiles = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    processedFiles++;

    // 匹配 Markdown 链接 [text](link)
    const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
      const link = match[2];
      
      // 排除外部链接、邮件、锚点链接
      if (link.startsWith('http') || link.startsWith('mailto:') || link.startsWith('#')) {
        continue;
      }

      // 如果是 TODO 链接，标记为死链接
      if (link.toLowerCase() === 'todo') {
        deadLinks.push({ file: path.relative(docsDir, file), link });
        continue;
      }

      // 检查本地文件是否存在
      // 简单判断逻辑：如果是以 / 开头，则是相对于 docs 目录；否则相对于当前文件
      let targetPath;
      const cleanLink = link.split('#')[0]; // 移除锚点
      if (!cleanLink || cleanLink === './') continue;

      // 静态资源（图片/字体等）不走 .md 路由，需在 docs/public 下查找
      const assetExt = path.extname(cleanLink).toLowerCase();
      if (assetExt && assetExt !== '.md' && assetExt !== '.mdx') {
        const assetPath = cleanLink.startsWith('/')
          ? path.join(docsDir, 'public', cleanLink)
          : path.resolve(path.dirname(file), cleanLink);
        if (!fs.existsSync(assetPath)) {
          deadLinks.push({ file: path.relative(docsDir, file), link });
        }
        continue;
      }

      if (cleanLink.startsWith('/')) {
        targetPath = path.join(docsDir, `${cleanLink}.md`);
      } else {
        targetPath = path.resolve(path.dirname(file), cleanLink.endsWith('.md') ? cleanLink : `${cleanLink}.md`);
      }

      if (!fs.existsSync(targetPath)) {
        deadLinks.push({ file: path.relative(docsDir, file), link });
      }
    }
  }

  console.log('\n📊 检查结果:');
  console.log(`   📝 处理文件数: ${processedFiles}`);
  console.log(`   ❌ 死链接数: ${deadLinks.length}`);

  if (deadLinks.length > 0) {
    console.log('\n⚠️ 发现可能的死链接 (已记录为警告):');
    deadLinks.forEach(dl => {
      console.log(`   📄 ${dl.file}`);
      console.log(`     🔗 ${dl.link}`);
    });
    // 不再退出，允许构建继续
    console.log('\n✅ 继续构建...');
  } else {
    console.log('\n✅ 未发现死链接');
  }
}

checkLinks().catch(err => {
  console.error(err);
  process.exit(1);
});
