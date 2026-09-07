// helper.mjs — 测试工具：隔离临时工作区 + daemon 快速启动
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ReadingDaemon } from '../src/daemon.mjs';
import { Config } from '../src/config.mjs';

export function makeTempWorkspace() {
  const dir = mkdtempSync(path.join(tmpdir(), 'rs-test-'));
  mkdirSync(path.join(dir, '资料库'), { recursive: true });
  return dir;
}

export async function startTestDaemon(extraConfig = {}) {
  const dir = makeTempWorkspace();
  const config = new Config(dir);
  config.daemonPort = 0; // 随机端口
  config.bridgePort = 0;
  for (const [k, v] of Object.entries(extraConfig)) config[k] = v;
  const daemon = new ReadingDaemon(config);
  await daemon.start({ withBridge: extraConfig.withBridge ?? false });
  daemon._tempDir = dir;
  return daemon;
}

export async function stopTestDaemon(daemon) {
  await daemon.stop();
  try { rmSync(daemon._tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

/** 生成一本书的 markdown fixture */
export function writeTestBook(dir, name = '测试之书.md', chapterCount = 3, parasPerChapter = 6) {
  const chapters = [];
  for (let c = 1; c <= chapterCount; c++) {
    chapters.push(`# 第${c}章 测试章节${c}`);
    for (let p = 1; p <= parasPerChapter; p++) {
      chapters.push(
        `这是第${c}章第${p}段的正文内容。它讨论了概念${c}${p}的定义与性质，` +
        `并给出一个关于论证${c}${p}的例子。这个例子说明了测试文本在解析流水线中的行为，` +
        `包括段落合并、边界判定与标题生成。为了让块达到建议长度，这里再补充几句：` +
        `认知系统应当保持原文不可变，同时把用户的长期理解沉淀在内容图的节点里。` +
        `本段最后一句用于测试句界切分的完整性。`
      );
    }
  }
  const p = path.join(dir, '资料库', name);
  writeFileSync(p, chapters.join('\n\n'), 'utf8');
  return p;
}
