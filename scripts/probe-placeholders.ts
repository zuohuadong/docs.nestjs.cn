#!/usr/bin/env bun
/**
 * 临时诊断脚本：统计各模型在真实文档上的占位符还原成功率。
 * 与 translate-docs 使用同一 protect/chunk/restore 路径，但只做诊断，不写文件。
 *
 * 用法: bun scripts/probe-placeholders.ts --models a,b --files content/x.md,content/y.md
 */

import fs from 'node:fs';
import { protectMarkdown, restoreMarkdown, splitIntoChunks } from './lib/markdown.js';
import { AIClient } from './lib/ai.js';
import { getErrorMessage } from './lib/types.js';

const getArg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const models = getArg('--models', 'nvidia/nemotron-3.5-bolt-e4b,nvidia/nemotron-3-ultra-550b-a55b')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

const files = getArg(
  '--files',
  'content/introduction.md,content/first-steps.md,content/migration.md,content/security/rate-limiting.md',
)
  .split(',')
  .map((f) => f.trim())
  .filter(Boolean);

const apiKey = process.env.NVIDIA_API_KEY;
if (!apiKey) {
  console.error('NVIDIA_API_KEY 未配置');
  process.exit(2);
}

console.log(`models: ${models.join(', ')}`);
console.log(`files: ${files.join(', ')}`);

for (const model of models) {
  const client = new AIClient({ apiKey, model, maxTokens: 8192 });
  let ok = 0;
  let failed = 0;
  let totalSecs = 0;

  console.log(`\n=== ${model} ===`);

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const { text, map } = protectMarkdown(source);
    const chunks = text.length > 5000 ? splitIntoChunks(text, 5000) : [text];
    const started = Date.now();
    let outcome = 'ok';
    let detail = '';

    try {
      const out: string[] = [];
      for (const chunk of chunks) {
        const { content } = await client.translate(chunk);
        out.push(content);
      }
      restoreMarkdown(out.join('\n\n'), map);
      ok++;
    } catch (err) {
      failed++;
      outcome = 'FAIL';
      detail = getErrorMessage(err).slice(0, 120);
    }

    const secs = (Date.now() - started) / 1000;
    totalSecs += secs;
    console.log(
      `${outcome.padEnd(4)} ${(secs.toFixed(1) + 's').padStart(8)} chunks=${chunks.length} ${file} ${detail}`,
    );
  }

  console.log(
    `summary model=${model} ok=${ok} failed=${failed} avg=${(totalSecs / files.length).toFixed(1)}s`,
  );
}