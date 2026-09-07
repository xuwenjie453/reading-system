// zip.mjs — 最小 ZIP 读取器（EPUB 容器）：central directory + stored/deflate
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

export function readZipEntries(filePath) {
  const buf = readFileSync(filePath);
  // 定位 EOCD
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65536); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP: end of central directory not found');
  const entryCount = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);

  const entries = new Map();
  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const uncompressedSize = buf.readUInt32LE(offset + 24);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.slice(offset + 46, offset + 46 + nameLen).toString('utf8');
    entries.set(name, { method, compressedSize, uncompressedSize, localOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }

  const read = (name) => {
    const e = entries.get(name);
    if (!e) return null;
    const lo = e.localOffset;
    if (buf.readUInt32LE(lo) !== 0x04034b50) throw new Error(`ZIP: bad local header for ${name}`);
    const nameLen = buf.readUInt16LE(lo + 26);
    const extraLen = buf.readUInt16LE(lo + 28);
    const dataStart = lo + 30 + nameLen + extraLen;
    const data = buf.slice(dataStart, dataStart + e.compressedSize);
    if (e.method === 0) return data;
    if (e.method === 8) return inflateRawSync(data);
    throw new Error(`ZIP: unsupported compression method ${e.method} for ${name}`);
  };
  return { entries: [...entries.keys()], read, stat: (n) => entries.get(n) || null };
}
