// modules.mjs — AI 模块执行器：每个 role 保持独立 contract（即使合并模型调用也保持逻辑边界）
// 输出验证顺序（02_MacBook端系统/04）：schema validation → deterministic policy validation → commit。
// 无 LLM 时进入启发式模式：保守、可解释、边界情况一律向 NO_OP 退让（policy.fail_safe）。
import { extractJson, validateSchema } from './llm-client.mjs';
import { estimateTokens } from '../util.mjs';
import { err } from '../errors.mjs';

export const CURATOR_SCHEMA = {
  type: 'object',
  required: ['decision', 'cognitive_delta', 'content_quality', 'reason_codes'],
  properties: {
    decision: { type: 'string', enum: ['NO_OP', 'EXTEND', 'CREATE'] },
    cognitive_delta: {
      type: 'object',
      properties: {
        user_increment: { type: 'string' },
        system_increment: { type: 'string' },
        correction_or_deepening: { type: 'string' },
        new_question_opened: { type: 'string' },
      },
    },
    content_quality: { type: 'number' },
    scope_fit: { type: 'any' },
    branch_independence: { type: 'any' },
    cognitive_coverage: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['NONE', 'PARTIAL', 'FULL'] },
        covered_by_node_id: { type: 'any' },
        note: { type: 'string' },
      },
    },
    node_complexity: { type: 'any' },
    proposed_action_target: { type: 'object' },
    segment_seed: { type: 'string' },
    reason_codes: { type: 'array' },
  },
};

export class AiModules {
  constructor({ llm, registry, builders, core, logger }) {
    this.llm = llm;
    this.registry = registry;
    this.builders = builders;
    this.core = core;
    this.log = logger;
  }

  module(promptId) {
    return this.registry.loadModule(promptId).content;
  }

  // ================= Responder =================
  async responder({ context, question }) {
    if (this.llm.enabled) {
      const system = [
        this.module('runtime.master'),
        this.module('module.responder'),
      ].join('\n\n---\n\n');
      const text = await this.llm.chat({ system, user: context, maxTokens: 2000, temperature: 0.5 });
      return { answer: text.trim(), mode: 'llm' };
    }
    return { answer: heuristicResponder(context, question), mode: 'heuristic' };
  }

  // ================= Graph Curator =================
  curatorThresholds(depthGate) {
    return {
      quality: { below45: 'NO_OP', between45and55: '通常 NO_OP', above55: '可考虑 EXTEND', create: '>=60' },
      depth_gate: depthGate,
      ties: 'NO_OP vs EXTEND → NO_OP；EXTEND vs CREATE → EXTEND',
      focus_block: 'Focus=Block 时只允许 NO_OP/CREATE，绝不 EXTEND Block',
    };
  }

  async curator({ context, turnContext, graphCatalog, question, answer }) {
    if (!this.llm.enabled) {
      return heuristicCurator({ turnContext, question, answer, focusEntity: null, graphCatalog, thresholds: this.curatorThresholds() });
    }
    const system = [
      this.module('module.graph_curator'),
      `输出契约：只输出一个 JSON 对象，字段：decision(NO_OP|EXTEND|CREATE)、cognitive_delta{user_increment,system_increment,correction_or_deepening,new_question_opened}、content_quality(0-100)、scope_fit(0-1或null)、branch_independence(0-1或null)、cognitive_coverage{level(NONE|PARTIAL|FULL),covered_by_node_id,note}、node_complexity(null或0-100)、proposed_action_target{graph_id,focus_entity_id}、segment_seed(仅EXTEND/CREATE)、reason_codes[]。不要输出其他文字。`,
    ].join('\n\n');
    const raw = await this.llm.chatJson({ system, user: context, maxTokens: 1200, temperature: 0.2 });
    return this.validateCuratorOutput(raw, { turnContext, graphCatalog });
  }

  /** schema → hard policy 双重验证；不合格 → NO_OP（fail-safe，不反复重试） */
  validateCuratorOutput(raw, { turnContext, graphCatalog }) {
    const { ok, problems } = validateSchema(raw, CURATOR_SCHEMA);
    if (!ok) {
      this.log?.warn?.(`curator 输出 schema 不合格，降级 NO_OP: ${problems.join('; ')}`);
      return { decision: 'NO_OP', cognitive_delta: {}, content_quality: 0, cognitive_coverage: { level: 'NONE' }, reason_codes: ['SCHEMA_INVALID_DOWNGRADE'], _validation: problems };
    }
    const d = raw;
    // hard policy（代码强制，与模型无关）
    d.content_quality = Math.max(0, Math.min(100, Number(d.content_quality) || 0));
    if (d.decision === 'NO_OP' && d.segment_seed) d.segment_seed = ''; // 禁止 NO_OP 伪造 Segment
    if (turnContext.focus_type === 'BLOCK' && d.decision === 'EXTEND') {
      d.reason_codes = [...(d.reason_codes || []), 'BLOCK_IMMUTABLE_DOWNGRADE'];
      d.decision = 'NO_OP';
    }
    if (d.decision === 'CREATE') {
      const parentDepth = turnContext.focus_type === 'BLOCK' ? 0
        : (graphCatalog?.nodes?.find((n) => n.node_id === turnContext.focus_entity_id)?.depth ?? 0);
      const need = { 1: 60, 2: 68, 3: 76, 4: 85, 5: 94 }[parentDepth + 1];
      if (need == null || d.content_quality < need) {
        d.reason_codes = [...(d.reason_codes || []), 'DEPTH_GATE_DOWNGRADE'];
        d.decision = 'EXTEND'; // 边界退让：EXTEND > CREATE
        if (turnContext.focus_type === 'BLOCK') d.decision = 'NO_OP';
      }
      if (!d.segment_seed) {
        d.reason_codes = [...(d.reason_codes || [])];
        d.decision = d.decision === 'CREATE' ? 'NO_OP' : d.decision;
      }
    }
    if (d.decision === 'EXTEND' && turnContext.focus_type !== 'NODE') {
      d.decision = 'NO_OP';
      d.reason_codes = [...(d.reason_codes || []), 'EXTEND_TARGET_INVALID'];
    }
    return d;
  }

  // ================= Segment Writer =================
  async segmentWriter({ decision, question, answer, focusEntity, context }) {
    if (this.llm.enabled) {
      const system = this.module('module.segment_writer');
      const user = [
        `已批准的 segment_seed：\n${decision.segment_seed ?? ''}`,
        `本轮用户提问：\n${question}`,
        `本轮回答（节选）：\n${String(answer).slice(0, 2500)}`,
      ].join('\n\n');
      const text = await this.llm.chat({ system, user, maxTokens: 1200, temperature: 0.4 });
      return text.trim();
    }
    return heuristicSegmentWriter({ decision, question, answer, focusEntity });
  }

  // ================= Node Title / Summary =================
  async nodeTitle({ decision, firstSegment, parentContext }) {
    if (this.llm.enabled) {
      const system = this.module('module.node_title');
      const user = `Cognitive Delta：\n${JSON.stringify(decision.cognitive_delta)}\n\nSegment001：\n${String(firstSegment).slice(0, 1200)}\n\n${parentContext ?? ''}\n只输出一行标题。`;
      const text = await this.llm.chat({ system, user, maxTokens: 60, temperature: 0.3 });
      return cleanTitle(text);
    }
    return heuristicTitle(decision, firstSegment);
  }

  async nodeSummary({ node, newSegment, decision, parentContext, mode }) {
    if (this.llm.enabled) {
      const system = this.module('module.node_summary');
      const user = mode === 'CREATE'
        ? `为新 Node 生成初始 Anchor Summary（60–150 中文字）。\nTitle：${node.title}\nSegment001：${String(newSegment).slice(0, 1500)}\n${parentContext ?? ''}\n输出 JSON：{"summary":"...","needs_full_reanchor":false}`
        : `依据 old Anchor Summary + new Segment 更新 Anchor Summary（不无控制扩大作用域）。\nTitle：${node.title}\nOld Summary：${node.anchor_summary}\nNew Segment：${String(newSegment).slice(0, 1500)}\n输出 JSON：{"summary":"...","needs_full_reanchor":false}`;
      const json = await this.llm.chatJson({ system, user, maxTokens: 400, temperature: 0.3 });
      return { summary: String(json.summary || node.anchor_summary), needs_full_reanchor: Boolean(json.needs_full_reanchor) };
    }
    return { summary: heuristicSummary(node, newSegment), needs_full_reanchor: false };
  }

  // ================= Block Title / Summary（parser 用） =================
  async blockTitleSummary({ content, structuralPath, docTitle, ordinal }) {
    if (this.llm.enabled) {
      const titleSys = this.module('module.block_title');
      const sumSys = this.module('module.block_summary');
      const excerpt = String(content).slice(0, 3000);
      const user = `文档：${docTitle ?? ''}\n结构路径：${structuralPath?.join(' > ') ?? ''}\nBlock #${ordinal} 正文：\n${excerpt}`;
      try {
        const title = cleanTitle(await this.llm.chat({ system: titleSys, user: `${user}\n只输出一行标题。`, maxTokens: 50, temperature: 0.3 }));
        const sum = await this.llm.chat({ system: sumSys, user, maxTokens: 300, temperature: 0.3 });
        return { title, summary: sum.trim() };
      } catch (e) {
        this.log?.warn?.(`block enrichment LLM 失败，使用启发式：${e.message}`);
      }
    }
    return { title: heuristicBlockTitle(content, structuralPath, docTitle), summary: heuristicBlockSummary(content) };
  }

  // ================= Genre（parser 用） =================
  async classifyGenre({ docTitle, sampleText, structuralHints }) {
    if (this.llm.enabled) {
      try {
        const system = this.module('parser.genre');
        const user = `只输出 JSON：{"profile":"THEORETICAL|ACADEMIC|TEXTBOOK|FICTION|ESSAY|POETRY|GENERAL","confidence":0-1,"signals":[],"segmentation_hints":[]}\n文档：${docTitle ?? ''}\n样本：\n${String(sampleText).slice(0, 2000)}`;
        return await this.llm.chatJson({ system, user, maxTokens: 300, temperature: 0.2 });
      } catch { /* 落入启发式 */ }
    }
    return { profile: 'GENERAL', confidence: 0.4, signals: ['heuristic'], segmentation_hints: [] };
  }

  /** Block Reviewer（parser 用）：heuristic 只做 KEEP + 明显合并超短块 */
  reviewBlocks(drafts) {
    const out = [];
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i];
      const prev = out[out.length - 1];
      const tokens = estimateTokens(d.joinedText ?? '');
      // 超短且非标题边界的块并入前块（MERGE）
      if (prev && tokens < 60 && d.boundaryAfter !== 'STRONG' && prev.boundaryAfter !== 'STRONG') {
        prev.unit_ids.push(...d.unit_ids);
        prev.boundaryAfter = d.boundaryAfter;
        continue;
      }
      out.push({ ...d, decision: 'KEEP' });
    }
    return out;
  }
}

// ============================================================
// 启发式实现（无 LLM fallback）：保守、可解释
// ============================================================

export function splitSentences(text) {
  return String(text).split(/(?<=[。！？!?；;])/).map((s) => s.trim()).filter((s) => s.length > 1);
}

function keywords(text, n = 80) {
  // 中文无空格：用 2/3 字 gram 保证跨文本对齐；英文取整词
  const grams = new Set();
  for (const m of String(text).matchAll(/[\u4e00-\u9fff]+|[A-Za-z][A-Za-z-]+/g)) {
    const w = m[0];
    if (/^[A-Za-z]/.test(w)) { grams.add(w.toLowerCase()); continue; }
    for (let i = 0; i < w.length - 1; i++) grams.add(w.slice(i, i + 2));
    for (let i = 0; i < w.length - 2; i++) grams.add(w.slice(i, i + 3));
  }
  return [...grams].slice(0, n);
}

export function overlapScore(a, b) {
  const ka = new Set(keywords(a, 120));
  const kb = [...new Set(keywords(b, 120))];
  if (!ka.size || !kb.length) return 0;
  const kaArr = [...ka];
  const hit = (w) => ka.has(w) || kaArr.some((x) => (x.includes(w) || w.includes(x)) && Math.min(x.length, w.length) >= 2);
  let n = 0;
  for (const w of kb) if (hit(w)) n++;
  // 归一化：短文本的 gram 决定上限，避免长句稀释
  return n / Math.min(kb.length, 40);
}

export function heuristicResponder(context, question) {
  // 从 SOURCE/COGNITIVE_RECORD 段落中抽取最相关句子；明确边界，不伪装
  const sourceSections = [...context.matchAll(/【SOURCE】([^\n]*)\n([\s\S]*?)(?=\n【|$)/g)];
  const cognitiveSections = [...context.matchAll(/【COGNITIVE_RECORD】([^\n]*)\n([\s\S]*?)(?=\n【|$)/g)];
  const scored = [];
  for (const [, title, body] of [...sourceSections, ...cognitiveSections]) {
    for (const sent of splitSentences(body)) {
      scored.push({ sent, score: overlapScore(question, sent), kind: sourceSections.includes(title) ? 'SOURCE' : 'RECORD' });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter((s) => s.score > 0.08).slice(0, 4);
  if (!top.length) {
    return `我在当前阅读上下文中没有找到与这个问题直接相关的内容。如果你在问书里的具体内容，可以翻到相关页面后再问，或者换个说法引用一下原文关键词。`;
  }
  const lines = top.map((t) => `- ${t.sent}`);
  return `根据当前阅读内容，与你的问题相关的部分是：\n${lines.join('\n')}\n\n（当前为启发式摘要模式：以上摘自原文/认知记录的相关句子；配置 LLM API Key 后可获得完整语义回答。）`;
}

export function heuristicCurator({ turnContext, question, answer, focusEntity, graphCatalog, thresholds }) {
  // 保守启发式：只有明确高质量信号才 EXTEND；CREATE 需要 Block focus + 高新颖度 + depth gate
  const qTokens = estimateTokens(question);
  const aTokens = estimateTokens(answer);
  const qaLen = qTokens + aTokens;
  const reasons = ['HEURISTIC_MODE'];

  // ContentQuality Q 的保守代理：长度 + 问答相关度
  let q = 0;
  if (qaLen > 600) q += 35;
  else if (qaLen > 300) q += 25;
  else if (qaLen > 120) q += 12;

  const anchorText = focusEntity?.anchor_summary || focusEntity?.title || '';
  const novelty = 1 - Math.min(1, overlapScore(anchorText || question, answer));
  q += Math.round(novelty * 30);

  // 全图 duplicate：标题/摘要词重叠强 → 视为覆盖
  let coverage = { level: 'NONE', covered_by_node_id: null };
  if (graphCatalog?.nodes?.length) {
    let best = null;
    for (const n of graphCatalog.nodes) {
      const s = overlapScore(`${n.title} ${n.anchor_summary}`, `${question} ${String(answer).slice(0, 800)}`);
      if (!best || s > best.s) best = { s, n };
    }
    if (best && best.s > 0.55) coverage = { level: 'FULL', covered_by_node_id: best.n.node_id };
    else if (best && best.s > 0.35) coverage = { level: 'PARTIAL', covered_by_node_id: best.n.node_id };
  }

  let decision = 'NO_OP';
  if (q >= 55 && turnContext.focus_type === 'NODE' && coverage.level !== 'FULL') {
    decision = 'EXTEND'; // 边界保守：启发式永不 CREATE
    reasons.push('Q>=55_AND_SCOPE_FIT_HEURISTIC');
  } else {
    reasons.push(q < 45 ? 'Q_BELOW_45' : 'CONSERVATIVE_TIE_BREAK_NO_OP');
  }
  if (coverage.level === 'FULL') reasons.push('DUPLICATE_SUPPRESS');

  return {
    decision,
    cognitive_delta: {
      user_increment: qaLen > 120 ? question.slice(0, 200) : '',
      system_increment: aTokens > 200 ? String(answer).slice(0, 300) : '',
      correction_or_deepening: '',
      new_question_opened: '',
    },
    content_quality: q,
    scope_fit: turnContext.focus_type === 'NODE' ? Math.round((1 - novelty) * 100) / 100 : null,
    branch_independence: null,
    cognitive_coverage: coverage,
    node_complexity: null,
    proposed_action_target: { graph_id: turnContext.graph_id, focus_entity_id: turnContext.focus_entity_id },
    segment_seed: decision === 'EXTEND'
      ? `围绕「${question.slice(0, 60)}」，当前认知记录新增了以下要点：${String(answer).slice(0, 400)}`
      : '',
    reason_codes: reasons,
  };
}

export function heuristicSegmentWriter({ decision, question, answer, focusEntity }) {
  const parts = [];
  if (question?.trim()) parts.push(`这一段认知围绕「${question.trim().slice(0, 80)}」展开。`);
  const seed = decision.segment_seed?.trim();
  if (seed) parts.push(seed);
  else if (answer) parts.push(String(answer).replace(/\n+/g, ' ').slice(0, 500));
  parts.push(`（承接「${focusEntity?.title ?? '当前焦点'}」的既有讨论。）`);
  return parts.join('');
}

export function heuristicTitle(decision, firstSegment) {
  const kw = keywords(`${JSON.stringify(decision.cognitive_delta || {})} ${firstSegment ?? ''}`, 4);
  const base = kw.slice(0, 3).join('与');
  let title = base ? `${base}的问题` : '新的认知讨论';
  if (title.length > 18) title = title.slice(0, 18);
  return title;
}

export function heuristicSummary(node, newSegment) {
  const base = String(newSegment || '').slice(0, 120);
  return `围绕「${node.title}」：${base}${(newSegment || '').length > 120 ? '…' : ''}`;
}

export function heuristicBlockTitle(content, structuralPath, docTitle) {
  const firstHeading = structuralPath?.[structuralPath.length - 1];
  if (firstHeading && firstHeading.length <= 30) return firstHeading;
  const sent = splitSentences(content)[0] || '';
  const t = sent.replace(/[#\s]/g, '').slice(0, 24);
  return t || `${docTitle ?? '文档'}片段`;
}

export function heuristicBlockSummary(content) {
  const sents = splitSentences(content);
  return sents.slice(0, 3).join('').slice(0, 200);
}

function cleanTitle(text) {
  let t = String(text).trim().split('\n')[0];
  t = t.replace(/^["'「『]|["'」』]$/g, '').replace(/^(标题|title)[:：]\s*/i, '').trim();
  return t.slice(0, 24);
}
