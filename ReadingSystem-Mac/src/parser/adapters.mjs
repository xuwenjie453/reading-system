// adapters.mjs — Format Adapter：统一输出 NormalizedDocument(metadata, ordered_units, structural_tree)
// PDF 采用尽力而为的文本层抽取；失败时返回结构化诊断（failure isolation，不拖垮 ParseJob）。
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { readZipEntries } from './zip.mjs';
import { htmlToUnits, decodeEntities } from './html-text.mjs';

export const SUPPORTED_EXTENSIONS = ['.epub', '.md', '.markdown', '.txt', '.pdf'];

/** @returns {{ ok: true, document: NormalizedDocument } | { ok: false, failure: {code, category, message, recovery_hint} }} */
export function extractDocument(filePath, format) {
  try {
    switch (format) {
      case '.epub': return extractEpub(filePath);
      case '.md': case '.markdown': return extractMarkdown(filePath);
      case '.txt': return extractText(filePath);
      case '.pdf': return extractPdf(filePath);
      default:
        return failure('UNSUPPORTED_FORMAT', 'DEPENDENCY', `不支持的格式 ${format}`, '等待格式支持或转换为 EPUB/TXT/MD');
    }
  } catch (e) {
    return failure('EXTRACTION_FAILED', 'STORAGE', `${filePath}: ${e.message}`, '可重试；若持续失败请检查文件是否损坏');
  }
}

function failure(code, category, message, hint) {
  return { ok: false, failure: { code, category, message, recovery_hint: hint } };
}

function ok(meta, units) {
  if (!units.length) return failure('EMPTY_TEXT_LAYER', 'VALIDATION', '没有抽取到文本内容', '扫描版 PDF 需要 OCR；v1 不做 OCR');
  return {
    ok: true,
    document: {
      metadata: meta,
      ordered_units: units.map((u, i) => ({ unit_id: `u${i + 1}`, ...u })),
    },
  };
}

function extractEpub(filePath) {
  const zip = readZipEntries(filePath);
  const containerXml = zip.read('META-INF/container.xml')?.toString('utf8');
  let opfPath = null;
  if (containerXml) {
    const m = containerXml.match(/full-path="([^"]+)"/);
    if (m) opfPath = m[1];
  }
  let title = filePath.split('/').pop().replace(/\.[^.]+$/, '');
  let spineFiles = [];
  let metaTitle = null;
  if (opfPath && zip.entries.includes(opfPath)) {
    const opf = zip.read(opfPath).toString('utf8');
    metaTitle = opf.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/)?.[1];
    if (metaTitle) title = decodeEntities(metaTitle).trim();
    // manifest id → href
    const manifest = new Map();
    for (const m of opf.matchAll(/<item\b[^>]*id="([^"]+)"[^>]*href="([^"]+)"[^>]*\/?>/gi)) {
      manifest.set(m[1], m[2]);
    }
    // 也兼容属性顺序不同的写法
    for (const m of opf.matchAll(/<item\b[^>]*href="([^"]+)"[^>]*id="([^"]+)"[^>]*\/?>/gi)) {
      if (!manifest.has(m[2])) manifest.set(m[2], m[1]);
    }
    for (const m of opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"/gi)) {
      const href = manifest.get(m[1]);
      if (href) spineFiles.push(href);
    }
  }
  if (!spineFiles.length) {
    spineFiles = zip.entries.filter((e) => /\.x?html?$/i.test(e)).sort();
  }
  const opfDir = opfPath ? opfPath.split('/').slice(0, -1).join('/') : '';
  const units = [];
  for (const href of spineFiles) {
    const full = opfDir ? `${opfDir}/${href}` : href;
    let data = zip.read(full) || zip.read(decodeURIComponent(full));
    if (!data && !href.includes('/')) {
      // 有时 href 带 url 编码目录
      for (const e of zip.entries) {
        if (e.endsWith(href.split('/').pop())) { data = zip.read(e); break; }
      }
    }
    if (!data) continue;
    const html = data.toString('utf8');
    units.push(...htmlToUnits(html));
  }
  return ok({ format: 'epub', title, container: filePath }, units);
}

function extractMarkdown(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const title = raw.match(/^#\s+(.+)$/m)?.[1]?.trim()
    || filePath.split('/').pop().replace(/\.[^.]+$/, '');
  const units = [];
  for (const line of raw.split(/\r?\n/)) {
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      units.push({ type: 'heading', level: h[1].length, text: h[2].trim() });
    } else if (line.trim() === '') {
      continue;
    } else {
      const text = line.replace(/[*_`]+/g, (s) => (s.length % 2 === 0 ? '' : s)).trim();
      units.push({ type: 'paragraph', level: 0, text });
    }
  }
  // 合并连续段落行为逻辑段
  const merged = [];
  for (const u of units) {
    const prev = merged[merged.length - 1];
    if (u.type === 'paragraph' && prev?.type === 'paragraph') prev.text += '\n' + u.text;
    else merged.push({ ...u });
  }
  return ok({ format: 'markdown', title, container: filePath }, merged);
}

function extractText(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const title = filePath.split('/').pop().replace(/\.[^.]+$/, '');
  const paras = raw.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, '\n').trim()).filter(Boolean);
  const units = paras.map((text) => {
    const firstLine = text.split('\n')[0];
    const looksHeading = firstLine.length <= 40 && !/[。！？.!?]$/.test(firstLine) && text.split('\n').length === 1;
    return { type: looksHeading ? 'heading' : 'paragraph', level: looksHeading ? 1 : 0, text };
  });
  return ok({ format: 'text', title, container: filePath }, units);
}

// ---------- PDF：尽力而为的文本层抽取 ----------
function decodePdfString(s) {
  // 处理转义与八进制
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      const n = s[++i];
      if (n === 'n') out += '\n';
      else if (n === 'r') out += '';
      else if (n === 't') out += '\t';
      else if (n === '(') out += '(';
      else if (n === ')') out += ')';
      else if (n === '\\') out += '\\';
      else if (/[0-7]/.test(n)) {
        let oct = n;
        while (oct.length < 3 && /[0-7]/.test(s[i + 1])) oct += s[++i];
        out += String.fromCharCode(parseInt(oct, 8));
      } else out += n;
    } else out += c;
  }
  return out;
}

function extractPdf(filePath) {
  const raw = readFileSync(filePath);
  const latin = raw.toString('latin1');
  const title = filePath.split('/').pop().replace(/\.[^.]+$/, '');

  // 1) 尝试 /Info 里的 Title
  let metaTitle = latin.match(/\/Title\s*\(([\s\S]*?)\)/)?.[1];
  const docTitle = metaTitle ? decodePdfString(metaTitle).trim() : title;

  // 2) 展开 FlateDecode 流，收集文本操作
  const chunks = [];
  const streamRe = /stream\r?\n?/g;
  let m;
  while ((m = streamRe.exec(latin)) !== null) {
    const start = m.index + m[0].length;
    const end = latin.indexOf('endstream', start);
    if (end < 0) break;
    const header = latin.slice(Math.max(0, m.index - 600), m.index);
    if (!/FlateDecode/.test(header)) continue;
    const data = raw.slice(start, end);
    try {
      const inflated = inflateSync(data).toString('latin1');
      if (/Tj|TJ|Td|TD|Tm/.test(inflated)) chunks.push(inflated);
    } catch { /* 非 flate 或损坏流，跳过 */ }
    streamRe.lastIndex = end;
  }

  if (!chunks.length) {
    return failure('MISSING_TEXT_LAYER', 'DEPENDENCY', 'PDF 没有可抽取的文本层（可能为扫描版）', '需要 OCR；v1 不做 OCR');
  }

  const lines = [];
  for (const content of chunks) {
    // 按文本定位操作符切行：Tj/TJ 输出文本；Td/TD/Tm*/TL 换行
    const tokenRe = /\((?:\\.|[^\\()])*\)|TJ|Tj|T\*|Td|TD|ET|BT|'|"/g;
    let cur = '';
    let tm;
    let lastY = null;
    const flush = () => { if (cur.trim()) lines.push(cur.replace(/\s+/g, ' ').trim()); cur = ''; };
    while ((tm = tokenRe.exec(content)) !== null) {
      const t = tm[0];
      if (t.startsWith('(')) {
        cur += decodePdfString(t.slice(1, -1));
      } else if (t === 'T*' || t === 'TD' || t === 'ET' || t === "'" || t === '"') {
        flush();
      } else if (t === 'Td' || t === 'TD') {
        // 读取前面的数字对，检测纵向移动
        const nums = [...content.slice(Math.max(0, tm.index - 60), tm.index).matchAll(/-?[\d.]+/g)];
        const y = nums.length >= 2 ? parseFloat(nums[nums.length - 1][0]) : null;
        if (y !== null && lastY !== null && Math.abs(y) > 0.1) flush();
        lastY = y;
        flush();
      }
    }
    flush();
  }

  // 3) 合并成段落：空行（连续短行）或长度恢复为段
  const units = [];
  let para = [];
  const flushPara = () => {
    if (!para.length) return;
    const text = para.join('');
    if (text.trim()) units.push({ type: 'paragraph', level: 0, text: text.trim() });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    para.push(line);
    const next = lines[i + 1];
    const lineEndsSentence = /[。！？”"']$/.test(line) || /[.!?]$/.test(line);
    const nextIsShort = next != null && next.length < 25;
    if (lineEndsSentence && (nextIsShort || !next)) flushPara();
    if (para.join('').length > 1500) flushPara();
  }
  flushPara();

  // 页眉页脚清理：只出现 ≥5 次且很短的行
  const freq = new Map();
  for (const u of units) freq.set(u.text, (freq.get(u.text) || 0) + 1);
  let filtered = units.filter((u) => !(u.text.length <= 30 && (freq.get(u.text) || 0) >= 5));
  // 去掉纯空白 unit
  filtered = filtered.filter((u) => /[\u4e00-\u9fffA-Za-z0-9]/.test(u.text));
  if (!filtered.length) {
    return failure('MISSING_TEXT_LAYER', 'DEPENDENCY', 'PDF 没有可抽取的文本内容（可能为扫描版）', '需要 OCR；v1 不做 OCR');
  }

  // 文本质量闸门：嵌入子集字体的 PDF 用 raw char codes 抽出来是乱码（CID 编码无 ToUnicode 映射不可用）。
  // 诚实诊断：质量过低时明确失败，绝不把乱码写入 Canonical。
  const allText = filtered.map((u) => u.text).join('');
  const cjk = (allText.match(/[\u4e00-\u9fff]/g) || []).length;
  const asciiLetters = (allText.match(/[A-Za-z]/g) || []).length;
  const meaningful = cjk + asciiLetters;
  const ratio = meaningful / allText.length;
  if (ratio < 0.5) {
    return failure('PDF_TEXT_ENCODING_UNSUPPORTED', 'DEPENDENCY',
      `该 PDF 使用嵌入式字体编码（CID），直接抽取的文本不可读（有效字符占比 ${(ratio * 100).toFixed(0)}%）`,
      '等待支持 ToUnicode CMap 的解析增强，或换用 EPUB 版本');
  }
  return ok({ format: 'pdf', title: docTitle, container: filePath }, filtered);
}
