// parser-enricher.mjs — 解析流水线的 AI enricher 适配层
// Parser AI 永远只接收标记为 SOURCE_DATA 的材料（context.parser）；genre/boundary/review/title。
// v2 路由：HEURISTIC（独立模式）与 EXTERNAL_API 就地执行；HOST_AGENT → Background Works
// （doc classifier / block title+summary 入 Work Broker，由 Host claim 执行后回填）。
import { estimateTokens } from '../util.mjs';
import { err } from '../errors.mjs';

export class ParserEnricher {
  constructor({ modules, builders, registry, logger, semantic }) {
    this.modules = modules;
    this.builders = builders;
    this.registry = registry;
    this.log = logger;
    this.semantic = semantic;      // SemanticService（v2：host works 通道）
    this.useExternal = false;      // 与 AiModules 同步注入（semantic route）
    this.parseWaitMs = Number(process.env.READINGSYSTEM_PARSE_WAIT_MS || 300_000);
  }

  /** 语义 enrichment 是否由外部执行者提供（否则 heuristic 独立模式执行） */
  syncChannel() { this.modules.useExternal = this.useExternal; }

  /** 当前 enrichment 是否应走 Host background works（FULL + READY_HOST） */
  hostRoute() {
    const route = this.semantic?.executionRoute?.();
    return route?.executor === 'HOST_AGENT';
  }

  /** FULL 无执行者时不静默（v2：解析语义 enrichment 也适用 no_silent_fallback） */
  ensureExecutorAvailable() {
    if (!this.semantic) return;                       // 无 semantic（纯单测）不拦截
    const route = this.semantic.executionRoute();
    if (route.status === 'WAITING_FOR_EXECUTOR') {
      throw err.policy('WAITING_FOR_EXECUTOR',
        'Semantic Mode=FULL 但没有合格执行者：解析的语义 enrichment（体裁/标题/摘要）不会静默降级为 HEURISTIC。' +
        '请 attach Host Agent（rs-agent attach）或配置 External Provider；或显式 semantic mode heuristic 后重试。');
    }
  }

  /** 轮询 broker work 至终态并返回 result */
  async pollWork(work, waitMs = this.parseWaitMs) {
    const broker = this.semantic.broker;
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
      const w = broker.get(work.work_id);
      if (!w) return null;
      if (w.status === 'COMPLETED') return w.result ?? null;
      if (w.status === 'FAILED_FINAL' || w.status === 'EXPIRED') return null;
      await new Promise((r) => setTimeout(r, 400));
    }
    this.log?.warn?.(`enrichment work ${work.work_id} 等待超时（状态 ${w?.status ?? 'gone'}）`);
    return null;
  }

  promptSnapshotId() {
    return this.registry?.activeSnapshotId?.() ?? null;
  }

  classifyGenre(norm) {
    this.ensureExecutorAvailable();
    const sample = norm.ordered_units.slice(0, 40).map((u) => u.text).join('\n');
    if (this.hostRoute()) {
      const payload = {
        doc_title: norm.metadata.title,
        sample_text: sample.slice(0, 3000),
        structural_hints: norm.ordered_units.filter((u) => u.type === 'heading').slice(0, 30).map((u) => u.text),
      };
      return this.enqueueAndPoll('DOCUMENT_CLASSIFIER', payload, `parse:${norm.metadata.container}:genre`).then((r) => r ?? { profile: 'GENERAL', confidence: 0, signals: ['HOST_UNAVAILABLE'], segmentation_hints: [] });
    }
    return this.modules.classifyGenre({
      docTitle: norm.metadata.title,
      sampleText: sample,
      structuralHints: norm.ordered_units.filter((u) => u.type === 'heading').slice(0, 30).map((u) => u.text),
    });
  }

  /** Host background work：enqueue + 等待完成（幂等键防重放） */
  async enqueueAndPoll(workType, payload, idempotency) {
    const broker = this.semantic.broker;
    const work = broker.enqueue({
      work_type: workType, priority: 6, retention: 'LONG',
      context_snapshot_ref: `parse:${idempotency}`,
      prompt_role: workType === 'DOCUMENT_CLASSIFIER' ? 'parser.genre' : 'parser.block_enrich',
      payload,
      idempotency,
    });
    return this.pollWork(work);
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
    this.ensureExecutorAvailable();
    if (this.hostRoute()) {
      const r = await this.enqueueAndPoll('BLOCK_TITLE', {
        block_ordinal: ordinal,
        doc_title: docTitle,
        structural_path: structuralPath,
        content: content.slice(0, 4000),
      }, `parse:${docTitle}:block:${ordinal}`);
      if (r?.title || r?.anchor_summary) {
        return { title: r.title || fallbackTitle(content, structuralPath), summary: r.anchor_summary || '', token_estimate: estimateTokens(content) };
      }
      return { title: fallbackTitle(content, structuralPath), summary: '', token_estimate: estimateTokens(content) };
    }
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

function fallbackTitle(content, structuralPath) {
  const firstHeading = structuralPath?.[structuralPath.length - 1];
  if (firstHeading && firstHeading.length <= 30) return firstHeading;
  const m = String(content || '').split(/[。！？!?\n]/).find((s) => s.trim().length > 4);
  return (m || '文档片段').replace(/[#\s]/g, '').slice(0, 24);
}
