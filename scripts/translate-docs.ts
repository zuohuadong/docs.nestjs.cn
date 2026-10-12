#!/usr/bin/env bun
/**
 * 自动翻译脚本 - 将 content 目录的英文文档翻译并更新到 docs 目录
 * 重构版本: 使用 scripts/lib/* 公共模块
 */

import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import pLimit from 'p-limit';
import dotenv from 'dotenv';

import type { TranslatorOptions, TranslationError, GlossaryData } from './lib/types.js';
import { getErrorMessage } from './lib/types.js';
import {
  protectMarkdown,
  restoreMarkdown,
  countCodeBlockDelimiters,
  hasChineseContent,
  countChineseChars,
  splitIntoChunks,
} from './lib/markdown.js';
import { AIClient } from './lib/ai.js';
import { TranslationCache, ProgressTracker, contentHash } from './lib/cache.js';
import { loadGlossary } from './lib/glossary.js';
import { fixCodeBlocks } from './fix-code-blocks.js';

dotenv.config();

// ============================================================================
// DocumentTranslator
// ============================================================================

class DocumentTranslator {
  private contentDir: string;
  private docsDir: string;
  private verbose: boolean;
  private concurrency: number;
  private translateEnglish: boolean;
  private force: boolean;
  private resume: boolean;
  private useAI: boolean;

  private processedFiles = 0;
  private translatedFiles = 0;
  private skippedFiles = 0;
  private errors: TranslationError[] = [];

  private aiClient: AIClient;
  private glossary: GlossaryData;
  private cache: TranslationCache;
  private progress: ProgressTracker;

  constructor(options: Partial<TranslatorOptions> = {}) {
    this.contentDir = options.contentDir || 'content';
    this.docsDir = options.docsDir || 'docs';
    this.verbose = options.verbose || false;
    this.concurrency = options.concurrency || 3;
    this.translateEnglish = options.translateEnglish || false;
    this.force = options.force || false;
    this.resume = options.resume || false;
    this.useAI = options.useAI !== false;

    const scriptDir = path.dirname(new URL(import.meta.url).pathname);

    this.aiClient = new AIClient({
      apiKey: options.apiKey || process.env.NVIDIA_API_KEY,
      model: options.model || 'deepseek-ai/deepseek-v4.1-flash',
      maxTokens: options.maxTokens || 8192,
    });

    this.glossary = loadGlossary(
      path.resolve(scriptDir, '../config/glossary.json'),
      this.verbose,
    );

    this.cache = new TranslationCache(path.join(scriptDir, '.translation-cache.json'));
    this.progress = new ProgressTracker(scriptDir);

    if (this.verbose) {
      console.log(`📚 Cache: ${this.cache.size} entries`);
    }
  }

  // --------------------------------------------------------------------------
  // 翻译核心
  // --------------------------------------------------------------------------

  private async translateWithAI(text: string, filePath: string): Promise<string> {
    if (!this.useAI) return text;

    const hash = contentHash(text);
    const cached = this.cache.get(filePath, hash);
    if (cached) {
      if (this.verbose) console.log(`  📚 Using cached translation for ${filePath}`);
      return cached;
    }

    // 文件级重试：占位符还原失败、代码块数量不匹配等质量校验错误发生在
    // AI 调用之后的本地校验阶段，ai.ts 内部的请求级重试覆盖不到。
    // 对整个文件最多重试 1 次；最终失败时由调用方保留旧译文。
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.translateOnce(text, filePath);
      } catch (err: unknown) {
        if (attempt >= 2) throw err;
        console.warn(
          `  ⚠️ Translation of ${filePath} failed (attempt ${attempt}), retrying: ${getErrorMessage(err)}`,
        );
      }
    }
  }

  private async translateOnce(text: string, filePath: string): Promise<string> {
    const sourceCodeBlockCount = countCodeBlockDelimiters(text);
    const { text: protectedText, map } = protectMarkdown(text);

    let translatedText: string;

    if (protectedText.length > 5000) {
      console.log(`  📝 Text too long (${protectedText.length} chars), splitting into chunks...`);
      const chunks = splitIntoChunks(protectedText, 5000);
      const translatedChunks: string[] = [];

      for (let i = 0; i < chunks.length; i++) {
        console.log(`  🤖 Translating chunk ${i + 1}/${chunks.length}...`);
        const prev = translatedChunks.length > 0
          ? translatedChunks[translatedChunks.length - 1]
          : undefined;
        const { content } = await this.aiClient.translate(chunks[i], {
          glossary: this.glossary,
          previousContext: prev,
          verbose: this.verbose,
        });
        translatedChunks.push(content);
      }
      translatedText = translatedChunks.join('\n\n');
    } else {
      const { content } = await this.aiClient.translate(protectedText, {
        glossary: this.glossary,
        verbose: this.verbose,
      });
      translatedText = content;
    }

    const finalText = restoreMarkdown(translatedText, map);

    // 质量校验 1: 中文字符数
    const chineseCount = countChineseChars(finalText);
    if (!filePath.includes('index.md') && chineseCount < 20) {
      throw new Error(`Translation quality check failed: only ${chineseCount} Chinese characters found.`);
    }

    // 质量校验 2: 代码块数量一致性
    const translatedCodeBlockCount = countCodeBlockDelimiters(finalText);
    if (sourceCodeBlockCount !== translatedCodeBlockCount) {
      console.warn(
        `  ⚠️ Code block count mismatch: source=${sourceCodeBlockCount}, translated=${translatedCodeBlockCount}`,
      );
      throw new Error(
        `Code block count mismatch: source=${sourceCodeBlockCount}, translated=${translatedCodeBlockCount}`,
      );
    }

    this.cache.set(filePath, contentHash(text), finalText);
    if (this.verbose) console.log(`  🤖 AI translated: ${filePath}`);
    return finalText;
  }

  // --------------------------------------------------------------------------
  // 文件处理
  // --------------------------------------------------------------------------

  private needsUpdate(sourcePath: string, targetPath: string): boolean {
    if (this.force) {
      console.log(`  🔄 Force mode: will re-translate`);
      return true;
    }

    if (!fs.existsSync(targetPath)) return true;

    const sourceContent = fs.readFileSync(sourcePath, 'utf8');
    const targetContent = fs.readFileSync(targetPath, 'utf8');

    // 源内容哈希判定：译文文件头记录了翻译时所依据的源内容哈希。
    // 哈希一致且译文结构完整即可跳过——不依赖 mtime（CI 中 checkout/cp
    // 的时间戳不可靠，此前导致每次同步都全量重翻全部文件）。
    const sourceHash = contentHash(fixCodeBlocks(sourceContent));
    const targetHash = targetContent.match(/<!-- 源哈希: ([a-f0-9]{32}) -->/);
    if (
      targetHash &&
      targetHash[1] === sourceHash &&
      this.isTranslationComplete(sourceContent, targetContent)
    ) {
      return false;
    }

    if (!this.isTranslationComplete(sourceContent, targetContent)) {
      console.log(`  ⚠️ Incomplete translation detected, will re-translate`);
      return true;
    }

    if (this.translateEnglish && !hasChineseContent(targetContent)) return true;

    const sourceStats = fs.statSync(sourcePath);
    const targetStats = fs.statSync(targetPath);
    if (sourceStats.mtime.getTime() !== targetStats.mtime.getTime()) return true;

    return false;
  }

  private isTranslationComplete(sourceContent: string, targetContent: string): boolean {
    const sourceLines = sourceContent.split('\n').filter((l) => l.trim().length > 0);
    const targetLines = targetContent.split('\n').filter((l) => l.trim().length > 0);

    const sourceCodeBlocks = countCodeBlockDelimiters(sourceContent);
    const targetCodeBlocks = countCodeBlockDelimiters(targetContent);
    if (sourceCodeBlocks !== targetCodeBlocks) return false;

    if (targetLines.length / sourceLines.length < 0.5) return false;

    const chineseCount = countChineseChars(targetContent);
    if (chineseCount < 50 && sourceLines.length > 20) return false;

    return true;
  }

  private processContent(content: string, filePath: string, sourceHash?: string): string {
    let processed = content;

    if (!filePath.includes('index.md')) {
      processed = processed.replace(/https:\/\/docs\.nestjs\.com\//g, '/');
    }
    processed = processed.replace(/\n{3,}/g, '\n\n');

    if (!processed.startsWith('<!--')) {
      const timestamp = new Date().toISOString();
      const hashLine = sourceHash ? `<!-- 源哈希: ${sourceHash} -->\n` : '';
      const header = `<!-- 此文件从 content/${filePath} 自动生成，请勿直接修改此文件 -->\n<!-- 生成时间: ${timestamp} -->\n<!-- 源文件: content/${filePath} -->\n${hashLine}\n`;

      if (processed.startsWith('---')) {
        const secondDash = processed.indexOf('---', 3);
        if (secondDash !== -1) {
          const end = secondDash + 3;
          processed = processed.slice(0, end) + '\n' + header + processed.slice(end);
        } else {
          processed = header + processed;
        }
      } else {
        processed = header + processed;
      }
    }

    return processed;
  }

  async translateFile(contentPath: string): Promise<boolean> {
    try {
      const relativePath = path.relative(this.contentDir, contentPath);
      const outputPath = path.resolve(this.docsDir, relativePath);

      // 断点续传检查
      if (this.resume && this.progress.isCompleted(relativePath)) {
        if (this.verbose) console.log(`⏭️ Resuming: skip completed ${relativePath}`);
        this.skippedFiles++;
        return false;
      }

      // 安全检查
      const absoluteContentDir = path.resolve(this.contentDir);
      if (outputPath.startsWith(absoluteContentDir)) {
        throw new Error(`CRITICAL: Attempted to write to source directory! Target: ${outputPath}`);
      }

      this.processedFiles++;

      if (!this.needsUpdate(contentPath, outputPath)) {
        if (this.verbose) console.log(`Skipped (up to date): ${relativePath}`);
        this.skippedFiles++;
        return false;
      }

      let content = fs.readFileSync(contentPath, 'utf8');
      content = fixCodeBlocks(content);
      const sourceHash = contentHash(content);

      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      let translatedContent: string;

      if (this.useAI) {
        console.log(`🤖 Translating: ${relativePath}`);
        translatedContent = await this.translateWithAI(content, relativePath);
      } else if (fs.existsSync(outputPath)) {
        const existingContent = fs.readFileSync(outputPath, 'utf8');
        const sourceHash = contentHash(content);
        const cached = this.cache.get(relativePath, sourceHash);
        if (cached) {
          console.log(`  Cached (no-ai), keeping existing: ${relativePath}`);
          translatedContent = existingContent;
        } else {
          console.log(`  Source changed (no-ai), using new source: ${relativePath}`);
          translatedContent = content;
          this.cache.set(relativePath, sourceHash, '__no-ai__');
        }
      } else {
        translatedContent = content;
      }

      const finalContent = this.processContent(translatedContent, relativePath, sourceHash);
      fs.writeFileSync(outputPath, finalContent, 'utf8');

      const sourceStats = fs.statSync(contentPath);
      fs.utimesSync(outputPath, sourceStats.atime, sourceStats.mtime);

      console.log(`✅ Processed: ${relativePath}`);
      this.translatedFiles++;

      // 记录完成
      this.progress.markCompleted(relativePath);
      return true;
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      this.errors.push({ file: contentPath, error: message });
      console.error(`❌ Translation failed for ${contentPath}: ${message}`);
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // 入口
  // --------------------------------------------------------------------------

  async run(): Promise<boolean> {
    console.log('🔍 Starting document translation process...');
    console.log(`📁 Source: ${path.resolve(this.contentDir)}`);
    console.log(`📁 Target: ${path.resolve(this.docsDir)}`);

    if (!this.resume) {
      this.progress.clear();
    } else {
      const completed = this.progress.completedFiles.length;
      if (completed > 0) {
        console.log(`🔄 Resuming: ${completed} files already completed`);
      }
    }

    try {
      if (!fs.existsSync(this.contentDir)) {
        throw new Error(`Source directory '${this.contentDir}' does not exist`);
      }

      const pattern = path.join(this.contentDir, '**', '*.md').replace(/\\/g, '/');
      const files = await glob(pattern);
      console.log(`📄 Found ${files.length} markdown files to process`);
      if (files.length === 0) return false;

      let hasChanges = false;
      const limit = pLimit(this.concurrency);
      const tasks = files.map((file) =>
        limit(async () => {
          const changed = await this.translateFile(file);
          if (changed) hasChanges = true;
          return changed;
        }),
      );

      await Promise.all(tasks);
      this.cache.save();

      console.log('\n📊 Translation Summary:');
      console.log(`✅ Processed: ${this.processedFiles} files`);
      console.log(`🔄 Translated: ${this.translatedFiles} files`);
      console.log(`⏭️ Skipped: ${this.skippedFiles} files`);
      console.log(`❌ Errors: ${this.errors.length} files`);

      if (hasChanges) {
        console.log('\n🔄 Running post-translation processing...');
        try {
          const { runPostTranslateProcessor } = await import('./post-translate-processor.js');
          await runPostTranslateProcessor({
            docsDir: this.docsDir,
            verbose: this.verbose,
          });
        } catch (err: unknown) {
          console.warn('⚠️ Post-processing failed:', getErrorMessage(err));
        }
      }

      return hasChanges;
    } catch (err: unknown) {
      console.error('❌ Translation process failed:', getErrorMessage(err));
      throw err;
    }
  }
}

// ============================================================================
// CLI
// ============================================================================

const args = process.argv.slice(2);

const getArgValue = (flag: string): string | undefined => {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : undefined;
};

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
使用方法: bun scripts/translate-docs.ts [选项]

选项:
  --content-dir <dir>     源文件目录 (默认: content)
  --docs-dir <dir>        目标文件目录 (默认: docs)
  --model <model>         NVIDIA NIM 模型 (默认: deepseek-ai/deepseek-v4.1-flash)
  --concurrency <num>     并发请求数 (默认: 3, 受 40 RPM 限速)
  --api-key <key>         NVIDIA API Key (或设置 NVIDIA_API_KEY 环境变量)
  --no-ai                 禁用 AI 翻译，仅处理格式
  --translate-english     翻译 docs 目录下的英文文件
  --force                 强制重新翻译所有文件
  --resume                从上次中断点继续翻译
  --verbose, -v           显示详细信息
  --help, -h              显示帮助信息
`);
  process.exit(0);
}

const concurrencyValue = getArgValue('--concurrency');

const options: Partial<TranslatorOptions> = {
  verbose: args.includes('--verbose') || args.includes('-v'),
  contentDir: getArgValue('--content-dir') || 'content',
  docsDir: getArgValue('--docs-dir') || 'docs',
  useAI: !args.includes('--no-ai'),
  model: getArgValue('--model') || 'deepseek-ai/deepseek-v4.1-flash',
  concurrency: concurrencyValue ? parseInt(concurrencyValue, 10) : 3,
  translateEnglish: args.includes('--translate-english'),
  force: args.includes('--force'),
  resume: args.includes('--resume'),
  apiKey: getArgValue('--api-key'),
};

const translator = new DocumentTranslator(options);
translator.run().catch((err) => {
  console.error(err);
  process.exit(1);
});
