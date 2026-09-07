// html-text.mjs — XHTML/HTML → 结构化 units（保留 heading 层级与逻辑段落）
// Normalization 红线：允许清理标记/空白；禁止改写作者句子；保留顺序。

export function htmlToUnits(html) {
  const units = [];
  // 去掉 script/style
  let src = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const blockRe = /<(h[1-6]|p|div|li|blockquote|td|figcaption)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  const pushUnit = (type, level, text) => {
    const clean = decodeEntities(text)
      .replace(/\s+/g, ' ')
      .trim();
    if (clean) units.push({ type, level, text: clean });
  };

  let lastIndex = 0;
  while ((m = blockRe.exec(src)) !== null) {
    const tag = m[1].toLowerCase();
    const inner = m[2];
    // block 元素之间的裸文本（例如 <div>直接文字<p>…</p>）
    const between = src.slice(lastIndex, m.index).replace(/<[^>]+>/g, ' ');
    if (between.trim()) pushUnit('paragraph', 0, between);
    lastIndex = blockRe.lastIndex;

    if (/^h[1-6]$/.test(tag)) {
      pushUnit('heading', Number(tag[1]), inner.replace(/<[^>]+>/g, ' '));
    } else if (tag === 'li') {
      pushUnit('paragraph', 0, '• ' + inner.replace(/<[^>]+>/g, ' '));
    } else {
      // p/div/blockquote 内部可能有 <br> 分段
      const parts = inner.split(/<br\s*\/?>/i);
      for (const part of parts) {
        const text = part.replace(/<[^>]+>/g, ' ');
        pushUnit(tag === 'blockquote' ? 'quote' : 'paragraph', 0, text);
      }
    }
  }
  const tail = src.slice(lastIndex).replace(/<[^>]+>/g, ' ');
  if (tail.trim()) pushUnit('paragraph', 0, tail);
  return units;
}

export function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
