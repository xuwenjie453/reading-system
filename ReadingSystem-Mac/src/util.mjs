// util.mjs — 原子文件写入、ID、时间等基础工具
// Canonical 写入顺序（设计稿 02_CanonicalStore）：
//   write temp → flush → atomic rename → metadata → commit marker → journal
import { createHash, randomUUID } from 'node:crypto';
import { openSync, writeSync, fsyncSync, closeSync, renameSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

export function newId(prefix) {
  return `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
}

/** 原子写文件：temp → fsync → rename（同目录，保证同文件系统） */
export function atomicWriteFile(filePath, data) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const fd = openSync(tmp, 'w');
  try {
    writeSync(fd, data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, filePath);
}

export function atomicWriteJson(filePath, obj) {
  atomicWriteFile(filePath, JSON.stringify(obj, null, 2) + '\n');
}

export function readJson(filePath, fallback = undefined) {
  if (!existsSync(filePath)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing file: ${filePath}`);
  }
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

/** 深比较（用于 deterministic revalidate） */
export function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function nowIso() {
  return new Date().toISOString();
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** segment 文件名：000001.md */
export function segmentFileName(ordinal) {
  return String(ordinal).padStart(6, '0') + '.md';
}

/** 简易 token 估计：中文≈1字1token，英文≈4字符1token */
export function estimateTokens(text) {
  let cjk = 0, other = 0;
  for (const ch of text) {
    if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch)) cjk++;
    else other++;
  }
  return cjk + Math.ceil(other / 4);
}
