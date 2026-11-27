/**
 * Markdown 解析与占位符保护
 *
 * 使用 Unicode delimiter ⟦TYPE_N⟧ 替代 __TYPE_N__，降低 AI 误删概率。
 * 保护范围：代码块、行内代码、链接、图片、HTML 标签、frontmatter、admonition。
 */

import type { PlaceholderMap } from './types.js';

// ============================================================================
// 占位符保护 / 还原
// ============================================================================

const OPEN = '⟦';
const CLOSE = '⟧';

function makePlaceholder(type: string, id: number): string {
  return `${OPEN}${type}_${id}${CLOSE}`;
}

/**
 * 保护 Markdown 中不应翻译的结构，返回处理后的文本和占位符映射。
 */
export function protectMarkdown(content: string): {
  text: string;
  map: PlaceholderMap;
} {
  const map: PlaceholderMap = { placeholders: new Map(), counter: 0 };

  const replace = (type: string, match: string): string => {
    const ph = makePlaceholder(type, map.counter++);
    map.placeholders.set(ph, match);
    return ph;
  };

  let text = content;

  // 1. Frontmatter (必须在最开头)
  text = text.replace(/^---\n[\s\S]*?\n---/m, (m) => replace('FM', m));

  // 2. 代码块 (``` ... ```)
  text = text.replace(/```[\s\S]*?```/g, (m) => replace('CB', m));

  // 3. 行内代码 (`...`)
  text = text.replace(/`[^`\n]+`/g, (m) => replace('IC', m));

  // 4. 图片 ![alt](src)
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, (m) => replace('IMG', m));

  // 5. 链接 [text](url)
  text = text.replace(/\[[^\]]*\]\([^)]*\)/g, (m) => replace('LN', m));

  // 6. HTML 标签
  text = text.replace(/<[^>]+>/g, (m) => replace('HT', m));

  // 7. Admonition (:::tip / :::warning 等，只保护起止标记)
  text = text.replace(/^:::[\w\s]*$/gm, (m) => replace('AD', m));

  return { text, map };
}

/**
 * 还原占位符。如果有未还原的占位符则抛出错误。
 *
 * 注意占位符可能嵌套：后一步保护（如链接）可能把先一步已保护的片段
 * （如行内代码）整体包进自己的原文，例如
 * `[⟦IC_2⟧](http://localhost:3000/)` 被链接占位符收录。
 * 因此必须按与保护相反的顺序还原，让外层先展开、内层后还原；
 * 同时多做几轮直至稳定，以覆盖多层嵌套。
 */
export function restoreMarkdown(content: string, map: PlaceholderMap): string {
  let result = content;

  // 逆序：外层占位符在 map 中更靠后
  const entries = [...map.placeholders.entries()].reverse();

  // 多轮还原，处理嵌套占位符；无进展即退出
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    for (const [ph, original] of entries) {
      if (!result.includes(ph)) continue;
      // 用 split/join 而非 replace，避免原文中的 $& / $1 被当作替换模式
      result = result.split(ph).join(original);
      changed = true;
    }
    if (!changed) break;
  }

  // 检检查未还原的占位符（兼容新旧格式）
  const unresolvedNew = result.match(/⟦\w+_\d+⟧/g);
  const unresolvedOld = result.match(/__(?:CODE_BLOCK|INLINE_CODE|LINK|HTML_TAG)_\d+__/g);
  const unresolved = [...(unresolvedNew || []), ...(unresolvedOld || [])];

  if (unresolved.length > 0) {
    const unique = [...new Set(unresolved)];
    throw new Error(
      `Placeholder restoration failed: ${unique.length} unresolved placeholder(s): ${unique.slice(0, 5).join(', ')}`,
    );
  }

  return result;
}

// ============================================================================
// Markdown 工具函数
// ============================================================================

/**
 * 统计代码块 ``` 定界符数量
 */
export function countCodeBlockDelimiters(content: string): number {
  return (content.match(/```/g) || []).length;
}

/**
 * 统计代码块（成对的 ```...```）数量
 */
export function countCodeBlocks(content: string): number {
  return (content.match(/```[\s\S]*?```/g) || []).length;
}

/**
 * 检测内容是否包含中文字符（排除 HTML 注释）
 */
export function hasChineseContent(content: string): boolean {
  const withoutComments = content.replace(/<!--[\s\S]*?-->/g, '');
  return /[\u4e00-\u9fa5]/.test(withoutComments);
}

/**
 * 统计中文字符数（排除 HTML 注释）
 */
export function countChineseChars(content: string): number {
  const withoutComments = content.replace(/<!--[\s\S]*?-->/g, '');
  const matches = withoutComments.match(/[\u4e00-\u9fa5]/g);
  return matches ? matches.length : 0;
}

/**
 * 按段落边界切分文本，避免在占位符内部切割。
 */
export function splitIntoChunks(text: string, maxSize: number): string[] {
  const placeholderPattern = /⟦\w+_\d+⟧/;
  const chunks: string[] = [];
  let current = '';
  const paragraphs = text.split('\n\n');

  for (const para of paragraphs) {
    if (current.length + para.length + 2 <= maxSize) {
      current += para + '\n\n';
    } else {
      // 如果段落包含占位符且合并后不超过 1.5 倍限制，则合并
      if (
        placeholderPattern.test(para) &&
        current.length + para.length + 2 <= maxSize * 1.5
      ) {
        current += para + '\n\n';
        continue;
      }

      if (current) chunks.push(current.trimEnd());

      if (para.length > maxSize) {
        // 超长段落按句子切分
        const sentences = para.split(/(?<=[.!?。！？])\s+/);
        let sentenceChunk = '';
        for (const sentence of sentences) {
          if (sentenceChunk.length + sentence.length + 1 <= maxSize) {
            sentenceChunk += sentence + ' ';
          } else {
            if (sentenceChunk) chunks.push(sentenceChunk.trimEnd());
            sentenceChunk = sentence + ' ';
          }
        }
        current = sentenceChunk;
      } else {
        current = para + '\n\n';
      }
    }
  }

  if (current.trim()) chunks.push(current.trimEnd());
  return chunks;
}
