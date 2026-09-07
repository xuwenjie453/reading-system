// engines.mjs — Interest Engine v2 + Temporal Timing Engine v2 + Scheduler
// 铁律：数值全部由确定性代码计算；AI 不得直接写 CurrentInterest / next_eligible_at（tools.temporal_api）。
// Interest ≠ mastery ≠ difficulty；precise dwell 极低权重；Current/Peak/Historical 分离；
// ExplicitTemporalPolicy 与心理分数分离；DueStrength 没有强制权；UI 不显示 due/overdue。

const DAY_MS = 24 * 60 * 60 * 1000;

/** ACTIVE 基础间隔锚点（dev.mac_interest_scheduler 原文数值） */
export const TIMING_ANCHORS = [
  { at: 100, days: 3 }, { at: 85, days: 7 }, { at: 70, days: 14 }, { at: 55, days: 30 }, { at: 40, days: 60 },
];
export const ACTIVE_MIN_DAYS = 3;
export const ACTIVE_MAX_DAYS = 90;
export const LONG_TERM_TIERS = [
  { min: 90, max: 150 }, { min: 150, max: 240 }, { min: 240, max: 365 },
];
export const DORMANT_MIN_DAYS = 365;
export const DORMANT_MAX_DAYS = 730;

/** Episode 证据初始权重（InterestEngine v2 原文） */
export const EVIDENCE_WEIGHTS = {
  voluntary_return: 0.32,
  cognitive_investment: 0.27,
  cognitive_novelty: 0.16,
  depth_persistence: 0.15,
  annotation_engagement: 0.07,
  coarse_engagement: 0.03,
};

export const TEMPORAL_CLASS = { ACTIVE_ENTER: 50, ACTIVE_EXIT: 35 };

export class InterestEngine {
  constructor({ db, logger }) {
    this.db = db;
    this.log = logger;
  }

  getState(graphId) {
    if (!graphId) return null;
    return this.db.ensureInterest(graphId);
  }

  openEpisode(graphId, entryReason) {
    // entry_reason: FRESH | TEMPORAL | MANUAL | RETURN | CONTINUATION
    const episodeId = `ep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    this.db.openEpisode(episodeId, graphId, entryReason);
    return episodeId;
  }

  /** Episode 结束：归一化证据 → 确定性 Interest 更新（一次性，episode-level） */
  closeOpenEpisode(graphId, outcome, evidence = {}) {
    const open = this.db.getOpenEpisode(graphId);
    if (!open) return null;
    const norm = normalizeEvidence(evidence, outcome, open.entry_reason);
    this.db.closeEpisode(open.episode_id, outcome, norm);
    this.applyEvidence(graphId, norm, outcome);
    return { episode_id: open.episode_id, evidence: norm };
  }

  applyEvidence(graphId, evidence, outcome) {
    const cur = this.db.ensureInterest(graphId);
    const diff = this.db.ensureDifficulty(graphId);

    // 正向证据得分 [0,1]
    let positive = 0;
    for (const [k, w] of Object.entries(EVIDENCE_WEIGHTS)) {
      positive += w * (evidence[k] ?? 0);
    }
    positive = Math.max(0, Math.min(1, positive));

    // 负向：Temporal SKIP / Dismissal 是清晰负向；crash/interruption 不算 SKIP
    let negative = 0;
    if (outcome === 'SKIP') negative = evidence.entry_reason === 'TEMPORAL' ? 0.22 : 0.12;

    // Difficulty 分离：EffectiveFriction = Friction × (1 - CognitiveProgress)
    diff.repetition = clamp01(diff.repetition + (evidence.repetition ?? 0) * 0.2 - 0.02);
    diff.friction = clamp01(diff.friction + (evidence.friction ?? 0) * 0.15 - 0.02);
    diff.cognitive_progress = clamp01(diff.cognitive_progress + (evidence.cognitive_progress ?? 0) * 0.25 - 0.01);
    const effectiveFriction = diff.friction * (1 - diff.cognitive_progress);
    this.db.saveDifficulty(graphId, diff);

    // Current 更新（带惯性）
    const delta = (positive - negative) * 30 - effectiveFriction * 4;
    let current = cur.current_interest + delta * 0.6; // 惯性：不一步到位
    // lazy decay：时间衰减按天半衰约 45d（可调），只在更新时刻计算
    const lastUpdate = Date.parse(cur.updated_at || new Date().toISOString());
    const days = Math.max(0, (Date.now() - lastUpdate) / DAY_MS);
    current = decay(current, days, 45);
    current = clamp(current, 0, 100);

    const peak = Math.max(cur.peak_interest, current);
    // Historical：跨时间 meaningful return + 实质加工缓慢增长；v1 不普通衰减
    let historical = cur.historical_importance;
    if (evidence.voluntary_return > 0.5 || evidence.depth_persistence > 0.5) historical = clamp01(historical + 0.03);
    if (positive > 0.6) historical = clamp01(historical + 0.02);
    const confidence = clamp01(cur.interest_confidence + (positive > 0 ? 0.05 : 0));

    // TemporalClass：进入 ACTIVE >=50；退出 <35；35–49 保持
    let tClass = cur.temporal_class;
    const explicit = cur.explicit_policy;
    if (explicit !== 'SUPPRESS') {
      if (tClass !== 'ACTIVE' && current >= TEMPORAL_CLASS.ACTIVE_ENTER) tClass = 'ACTIVE';
      else if (tClass === 'ACTIVE' && current < TEMPORAL_CLASS.ACTIVE_EXIT) tClass = current >= 20 ? 'LONG_TERM' : 'COLD';
      else if (tClass === 'COLD' && current >= 20) tClass = 'LONG_TERM';
    }

    this.db.saveInterest(graphId, {
      current_interest: round2(current),
      peak_interest: round2(peak),
      historical_importance: round2(clamp01(historical)),
      interest_confidence: round2(confidence),
      temporal_class: tClass,
      explicit_policy: explicit,
    });
  }
}

export class TimingEngine {
  constructor({ db, logger, rng = Math.random }) {
    this.db = db;
    this.log = logger;
    this.rng = rng;
  }

  getState(graphId) {
    if (!graphId) return null;
    return this.db.ensureTiming(graphId);
  }

  baseIntervalDays(currentInterest) {
    // 锚点插值：100→3d, 85→7d, 70→14d, 55→30d, 40→60d
    const pts = TIMING_ANCHORS;
    if (currentInterest >= pts[0].at) return pts[0].days;
    for (let i = 0; i < pts.length - 1; i++) {
      const hi = pts[i], lo = pts[i + 1];
      if (currentInterest <= hi.at && currentInterest >= lo.at) {
        const t = (hi.at - currentInterest) / (hi.at - lo.at);
        return round2(hi.days + t * (lo.days - hi.days));
      }
    }
    return pts[pts.length - 1].days;
  }

  onEpisodeEnd(graphId, outcome, evidence = {}) {
    const t = this.db.ensureTiming(graphId);
    const i = this.db.ensureInterest(graphId);
    const now = new Date();

    let class_ = t.class;
    let baseInterval = t.base_interval_days;
    let nextEligible = null;
    let cooldownUntil = t.cooldown_until;
    let skipStreak = t.skip_streak;

    if (outcome === 'SKIP') {
      // Temporal skip 显著延长；skip streak 递增
      skipStreak = (t.skip_streak || 0) + 1;
      const extend = evidence.entry_reason === 'TEMPORAL' ? 21 : 7; // 天
      cooldownUntil = new Date(now.getTime() + extend * DAY_MS).toISOString();
    } else if (outcome === 'END' || outcome === 'END_AND_NEXT' || outcome === 'SWITCHED_AWAY') {
      skipStreak = 0;
      // Manual return：主动回访后旧 cycle 作废，Episode 完成后重生成
      class_ = i.temporal_class;
      baseInterval = this.baseIntervalDays(i.current_interest);
      let days = clamp(baseInterval, ACTIVE_MIN_DAYS, ACTIVE_MAX_DAYS);
      // modifiers
      if (i.historical_importance > 0.6) days *= 0.85; // historical high 略缩短
      if (i.interest_confidence < 0.35) days *= 1.2; // confidence low 延长
      if (evidence.entry_reason === 'TEMPORAL') days *= 1.1 + 0.1 * (this.rng() > 0.5 ? 1 : 0); // first temporal cycle ×1.1–1.2 近似
      if (evidence.entry_reason === 'MANUAL' || evidence.entry_reason === 'RETURN') {
        // manual return 不计系统 exposure：避免系统近期再推
        days = Math.max(days, 5);
      }
      // cooldown（skip 后）
      if (cooldownUntil && Date.parse(cooldownUntil) > now.getTime()) {
        const cdDays = (Date.parse(cooldownUntil) - now.getTime()) / DAY_MS;
        days = Math.max(days, cdDays);
      }
      // jitter ±10%（每 generation 固定一次）
      const jitter = 1 + (this.rng() * 0.2 - 0.1);
      days = clamp(days * jitter, ACTIVE_MIN_DAYS, ACTIVE_MAX_DAYS);
      nextEligible = new Date(now.getTime() + days * DAY_MS).toISOString();
      // LONG_TERM tier 生成
      if (class_ === 'LONG_TERM' || class_ === 'DORMANT') {
        days = this.longTermInterval(class_, i);
        nextEligible = new Date(now.getTime() + days * DAY_MS).toISOString();
      }
    }

    const dueStrength = computeDueStrength(i, t, now);
    this.db.saveTiming(graphId, {
      class: class_, base_interval_days: baseInterval, effective_interval_days: baseInterval,
      last_episode_at: now.toISOString(), last_temporal_push_at: t.last_temporal_push_at,
      next_eligible_at: nextEligible ?? t.next_eligible_at, cooldown_until: cooldownUntil,
      due_strength: dueStrength, exposure: t.exposure, skip_streak: skipStreak,
      timing_generation: (t.timing_generation || 0) + 1, model_version: 2,
    });
  }

  longTermInterval(class_, interest) {
    if (class_ === 'DORMANT') return clamp(randBetween(this.rng, DORMANT_MIN_DAYS, DORMANT_MAX_DAYS), DORMANT_MIN_DAYS, DORMANT_MAX_DAYS);
    // 多次拒绝升级 tier 的近似：peak 高 → 短 tier
    const peak = interest?.peak_interest ?? 40;
    const tierIdx = peak > 80 ? 0 : peak > 60 ? 1 : 2;
    const tier = LONG_TERM_TIERS[tierIdx];
    return round2(randBetween(this.rng, tier.min, tier.max));
  }

  activeDueCandidates() {
    const now = new Date().toISOString();
    const rows = this.db.listTemporalCandidates();
    return rows
      .filter((r) => r.explicit_policy !== 'SUPPRESS')
      .filter((r) => (r.class === 'ACTIVE'))
      .filter((r) => r.next_eligible_at && r.next_eligible_at <= now && (!r.cooldown_until || r.cooldown_until <= now))
      .map((r) => ({ graph_id: r.graph_id, due_strength: r.due_strength, current_interest: r.current_interest }));
  }

  longTermCandidates() {
    const now = new Date().toISOString();
    return this.db.listTemporalCandidates()
      .filter((r) => r.explicit_policy !== 'SUPPRESS' && (r.class === 'LONG_TERM' || r.class === 'DORMANT'))
      .filter((r) => r.next_eligible_at && r.next_eligible_at <= now)
      .map((r) => ({ graph_id: r.graph_id, class: r.class, due_strength: r.due_strength }));
  }

  setTemporalPolicy({ graph_id, policy }) {
    // reading.temporal_request：SUPPRESS | BOOST | DEFAULT；严禁输出 CurrentInterest=100/0
    const i = this.db.ensureInterest(graph_id);
    this.db.saveInterest(graph_id, { ...i, explicit_policy: policy });
    this.db.audit('timing-engine', 'SET_TEMPORAL_POLICY', 'graph', graph_id, { policy });
    return { graph_id, explicit_policy: policy };
  }

  markTemporalPush(graphId) {
    const t = this.db.ensureTiming(graphId);
    // Temporal burst = 1：推送后立即重新生成 next_eligible_at，之后回 continuation anchor
    this.db.saveTiming(graphId, { ...t, last_temporal_push_at: new Date().toISOString(), exposure: (t.exposure || 0) + 1 });
  }
}

export class Scheduler {
  constructor({ db, core, timing, interest, logger }) {
    this.db = db;
    this.core = core;
    this.timing = timing;
    this.interest = interest;
    this.log = logger;
  }

  /** 只在 Graph boundary 调用。优先级：MANUAL > plan > continuation/temporal > discovery */
  pickNext({ cause, skipTemporal = false }) {
    const session = this.db.getSession();
    // continuation：文档下一 block 的 graph
    const continuation = this.pickContinuation(session);
    if (cause === 'CONTINUATION' || skipTemporal) return continuation;

    if (session.temporal_enabled) {
      const due = this.timing.activeDueCandidates();
      if (due.length) {
        due.sort((a, b) => b.due_strength - a.due_strength);
        return { kind: 'TEMPORAL', graph_id: due[0].graph_id };
      }
    }
    if (continuation?.graph_id) return continuation;
    return this.pickDiscovery();
  }

  pickContinuation(session) {
    // continuation anchor 的文档中，active graph 的下一个 block
    const anchor = session.continuation_graph_id || session.active_graph_id;
    if (!anchor) return { kind: 'CONTINUATION', graph_id: null };
    const graph = this.core.store.getGraph(anchor);
    if (!graph) return { kind: 'CONTINUATION', graph_id: null };
    const nextBlock = this.core.db.db.prepare(
      `SELECT * FROM blocks_index WHERE document_id = ? AND ordinal > (SELECT ordinal FROM blocks_index WHERE block_id = ?) ORDER BY ordinal LIMIT 1`
    ).get(graph.document_id, graph.root_block_id);
    if (!nextBlock?.graph_id) return { kind: 'CONTINUATION', graph_id: null, note: '文档已到末尾' };
    return { kind: 'CONTINUATION', graph_id: nextBlock.graph_id, block_id: nextBlock.block_id };
  }

  pickDiscovery() {
    // discovery：随机选一个未读/低 exposed 的 graph（无 due/overdue UI）
    const rows = this.core.db.db.prepare(
      'SELECT b.block_id, b.graph_id FROM blocks_index b LEFT JOIN interest_state i ON i.graph_id = b.graph_id WHERE b.graph_id IS NOT NULL ORDER BY COALESCE(i.current_interest, 40) DESC LIMIT 10'
    ).all();
    if (!rows.length) return { kind: 'DISCOVERY', graph_id: null };
    const pick = rows[Math.floor(this.core.db.getSession().session_epoch % rows.length)];
    return { kind: 'DISCOVERY', graph_id: pick.graph_id, block_id: pick.block_id };
  }

  manualTemporalOne() {
    const due = [...this.timing.activeDueCandidates(), ...this.timing.longTermCandidates()];
    if (!due.length) return null;
    due.sort((a, b) => b.due_strength - a.due_strength);
    const graphId = due[0].graph_id;
    this.timing.markTemporalPush(graphId); // burst=1
    return graphId;
  }
}

// ---------- helpers ----------
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function clamp01(v) { return clamp(v, 0, 1); }
function round2(v) { return Math.round(v * 100) / 100; }
function randBetween(rng, lo, hi) { return lo + rng() * (hi - lo); }
function decay(value, days, halfLifeDays) {
  if (days <= 0) return value;
  return value * Math.pow(0.5, days / halfLifeDays);
}

/** 归一化 Episode 证据（02_EPISODE_EVIDENCE_NORMALIZER 的确定性实现） */
export function normalizeEvidence(evidence, outcome, entryReason) {
  const coarse = evidence.coarse_engagement; // NONE/BRIEF/ENGAGED
  const annotation = evidence.annotation_engagement; // NONE/LIGHT/MODERATE/HEAVY
  return {
    entry_reason: evidence.entry_reason || entryReason,
    voluntary_return: evidence.voluntary_return ? 1 : 0,
    cognitive_investment: clamp01(evidence.cognitive_investment ?? (outcome === 'END' || outcome === 'END_AND_NEXT' ? 0.6 : 0.2)),
    cognitive_novelty: clamp01(evidence.cognitive_novelty ?? 0.4),
    depth_persistence: clamp01(evidence.depth_persistence ?? (outcome === 'END' ? 0.5 : 0.2)),
    annotation_engagement: { NONE: 0, LIGHT: 0.33, MODERATE: 0.66, HEAVY: 1 }[annotation] ?? 0,
    coarse_engagement: { NONE: 0, BRIEF: 0.4, ENGAGED: 1 }[coarse] ?? 0,
    repetition: clamp01(evidence.repetition ?? 0),
    friction: clamp01(evidence.friction ?? 0),
    cognitive_progress: clamp01(evidence.cognitive_progress ?? 0),
    explicit_skip: outcome === 'SKIP',
    interrupted: outcome === 'INTERRUPTED',
  };
}

/** DueStrength = 0.50 overdue urgency + 0.30 current + 0.15 historical + 0.05 confidence（±adjustment） */
export function computeDueStrength(interest, timing, now = new Date()) {
  let overdueUrgency = 0;
  if (timing.next_eligible_at) {
    const overdueDays = (now.getTime() - Date.parse(timing.next_eligible_at)) / DAY_MS;
    overdueUrgency = clamp01(overdueDays / 30);
  }
  return round2(
    0.50 * overdueUrgency +
    0.30 * clamp01((interest.current_interest ?? 0) / 100) +
    0.15 * clamp01(interest.historical_importance ?? 0) +
    0.05 * clamp01(interest.interest_confidence ?? 0)
  );
}
