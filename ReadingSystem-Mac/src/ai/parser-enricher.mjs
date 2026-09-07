// parser-enricher.mjs — 解析流水线的 AI enricher 适配层
// Parser AI 永远只接收标记为 SOURCE_DATA 的材料（context.parser）；genre/boundary/review/title。
import { estimateTokens } from '../util.mjs';

export class ParserEnricher {
  constructor({ modules, builders, registry, logger }) {
    this.modules = modules;
    this.builders = builders;
    this.registry = registry;
    this.log = logger;
  }

  promptSnapshotId() {
    return this.registry?.activeSnapshotId?.() ?? null;
  }

  classifyGenre(norm) {
    const sample = norm.ordered_units.slice(0, 40).map((u) => u.text).join('\n');
    return this.modules.classifyGenre({
      docTitle: norm.metadata.title,
      sampleText: sample,
      structuralHints: norm.ordered_units.filter((u) => u.type === 'heading').slice(0, 30).map((u) => u.text),
    });
  }

  /** LLM 边界复审是可选阶段：v1 默认信任确定性分块，返回原 drafts（KEEP）。 */
  reviewBlocks(norm, drafts) {
    // 给每个 draft 预拼接正文（供 reviewer / 写盘使用）
    const unitById = new Map(norm.ordered_units.map((u) => [u.unit_id, u]));
    return drafts.map((d) => {
      const text = d.unit_ids.map((id) => unitById.get(id)?.text ?? '').join('\n\n');
      return { ...d, joinedText: text, boundaryAfter: d.boundary_after };
    });
  }

  async blockTitleAndSummary({ content, structuralPath, genreProfile, docTitle, ordinal }) {
    void genreProfile;
    const r = await this.modules.blockTitleSummary({ content, structuralPath, docTitle, ordinal });
    return { title: r.title, summary: r.summary, token_estimate: estimateTokens(content) };
  }

  /** deterministic 校验之后的语义审查（heuristic：检查标题为空/过短等） */
  semanticValidate(blocks, genre) {
    const warnings = [];
    for (const b of blocks) {
      if (!b.title || b.title.length < 2) warnings.push({ level: 'warning', block: b.ordinal, note: '标题缺失或过短' });
      if (!b.anchor_summary) warnings.push({ level: 'warning', block: b.ordinal, note: '摘要缺失' });
    }
    return warnings;
  }
}
