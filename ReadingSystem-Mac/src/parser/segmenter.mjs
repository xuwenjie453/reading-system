// segmenter.mjs — 确定性分块（structure-first）
// 数值（10_解析流水线详细规范）：soft min ~250 / preferred 500–1200 / soft max 1800 / hard max 3000 tokens。
// 概念公式：StructureShift + TopicShift + DiscourseCompletion + LengthPressure - dependencies。
// 完整性优先于长度；默认原子单位 = 逻辑段落；不为凑 token 切自然短段。
import { estimateTokens } from '../util.mjs';

export const SEGMENTATION_PROFILE_VERSION = 'v1';

const SOFT_MIN = 250;
const PREFERRED_MIN = 500;
const PREFERRED_MAX = 1200;
const SOFT_MAX = 1800;
const HARD_MAX = 3000;

/**
 * @param {Array<{unit_id,type,level,text}>} orderedUnits
 * @returns {Array<{draft_id, unit_ids, boundary_after}>} DraftBlocks
 */
export function segmentDraftBlocks(orderedUnits, { genreProfile = 'GENERAL' } = {}) {
  const drafts = [];
  let current = [];
  let currentTokens = 0;

  const flush = (strengthAfter) => {
    if (!current.length) return;
    drafts.push({
      draft_id: `d${drafts.length + 1}`,
      unit_ids: current.map((u) => u.unit_id),
      boundary_after: strengthAfter,
    });
    current = [];
    currentTokens = 0;
  };

  for (let i = 0; i < orderedUnits.length; i++) {
    const u = orderedUnits[i];
    const uTokens = estimateTokens(u.text);

    // Heading 永远开启新块（StructureShift = STRONG）
    if (u.type === 'heading') {
      flush('STRONG');
      current.push(u);
      currentTokens = uTokens;
      // heading 单独不是块：它是下一块的起点，除非下一 unit 也是 heading
      const next = orderedUnits[i + 1];
      if (next?.type === 'heading') flush('STRONG');
      continue;
    }

    // 超过硬上限的超长自然段：内部硬切（仅此时允许）
    if (uTokens > HARD_MAX) {
      flush('MEDIUM');
      for (const piece of splitLongUnit(u, HARD_MAX)) {
        drafts.push({ draft_id: `d${drafts.length + 1}`, unit_ids: [piece.unit_id], boundary_after: 'MEDIUM' });
      }
      continue;
    }

    current.push(u);
    currentTokens += uTokens;

    const next = orderedUnits[i + 1];
    const nextIsHeading = next?.type === 'heading';
    const lastIsComplete = /["'”』」）)\.\!\?。！？]$/.test(u.text);

    if (nextIsHeading) { flush('STRONG'); continue; }

    // 长度压力判定：达到 preferred 区间且语义完成 → MEDIUM 边界
    if (currentTokens >= PREFERRED_MIN && currentTokens <= PREFERRED_MAX && lastIsComplete) {
      // 轻微 lookahead：若下一段会让本段超出 soft max，且下一段自身较大，则切
      const nextTokens = next ? estimateTokens(next.text) : 0;
      if (!next || currentTokens + nextTokens > SOFT_MAX) { flush('MEDIUM'); continue; }
    }
    if (currentTokens > SOFT_MAX) { flush('MEDIUM'); continue; }
    // 完整性保护：低于 soft min 时不切（discourse 未完成）
  }
  flush('STRONG');
  return drafts;
}

function splitLongUnit(unit, hardMax) {
  // 按句子切分再聚合；保持 source 顺序与原文（不重写）
  const sentences = unit.text.split(/(?<=[。！？!?．.])/);
  const pieces = [];
  let buf = '';
  let idx = 0;
  for (const s of sentences) {
    if (estimateTokens(buf + s) > hardMax && buf) {
      pieces.push({ unit_id: `${unit.unit_id}_p${++idx}`, type: 'paragraph', level: 0, text: buf });
      buf = s;
    } else {
      buf += s;
    }
  }
  if (buf.trim()) pieces.push({ unit_id: `${unit.unit_id}_p${++idx}`, type: 'paragraph', level: 0, text: buf });
  return pieces;
}

/** DraftBlocks → 正式 Block 正文（normalized-but-not-rewritten 拼接） */
export function draftToContent(orderedUnits, draft) {
  const byId = new Map(orderedUnits.map((u) => [u.unit_id, u]));
  const parts = [];
  for (const uid of draft.unit_ids) {
    const u = byId.get(uid);
    if (!u) continue;
    if (u.type === 'heading') parts.push(`## ${u.text}`);
    else parts.push(u.text);
  }
  return parts.join('\n\n');
}
