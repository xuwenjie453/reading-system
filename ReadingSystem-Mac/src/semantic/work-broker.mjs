// work-broker.mjs — Phase D：Semantic Work Broker
//
// 规则（05_PhaseD_*）：
//   - ReadingDaemon 不主动调用当前对话模型；方向唯一：
//     Host Agent → claim work → execute prompt → submit structured result。
//   - Work 状态机：PENDING / CLAIMED / COMPLETED / FAILED_RETRYABLE / FAILED_FINAL / EXPIRED
//   - claim/lease：PENDING → CLAIMED(agent, lease_until)；Agent 失联 lease 过期回 PENDING。
//   - 四元组：work_id / attempt_id / result_id / idempotency。
//   - Interactive work（RESPONDER/GRAPH_CURATOR）绑定 origin_agent_session，优先当前 Host。
//   - Background（parser/title/summary 类）可长期 PENDING；Host offline 不报 API_KEY_MISSING。
//   - Host 断开：Responder 已完成的结果保留；Curator 未完成可留 PENDING（frozen TurnContext 有效期内）。
//     禁止自动 heuristic CREATE；仅 AUTO + external configured 可 external fallback。
//   - 执行可重放，Canonical side effect 只能一次（幂等提交）。

import { newId, nowIso } from '../util.mjs';
import { err } from '../errors.mjs';

export const WorkStatus = Object.freeze({
  PENDING: 'PENDING',
  CLAIMED: 'CLAIMED',
  COMPLETED: 'COMPLETED',
  FAILED_RETRYABLE: 'FAILED_RETRYABLE',
  FAILED_FINAL: 'FAILED_FINAL',
  EXPIRED: 'EXPIRED',
});

export const WorkType = Object.freeze({
  RESPONDER: 'RESPONDER',
  GRAPH_CURATOR: 'GRAPH_CURATOR',
  DOCUMENT_CLASSIFIER: 'DOCUMENT_CLASSIFIER',
  BOUNDARY_REVIEW: 'BOUNDARY_REVIEW',
  BLOCK_REVIEW: 'BLOCK_REVIEW',
  BLOCK_TITLE: 'BLOCK_TITLE',
  BLOCK_ANCHOR_SUMMARY: 'BLOCK_ANCHOR_SUMMARY',
  NODE_TITLE: 'NODE_TITLE',
  NODE_ANCHOR_SUMMARY: 'NODE_ANCHOR_SUMMARY',
  INTEREST_FEATURE_EXTRACTION: 'INTEREST_FEATURE_EXTRACTION',
});

/** Background 可长期 Pending 的 work 类型（04_BackgroundWork.md） */
export const BACKGROUND_WORK_TYPES = new Set([
  WorkType.DOCUMENT_CLASSIFIER, WorkType.BOUNDARY_REVIEW, WorkType.BLOCK_REVIEW,
  WorkType.BLOCK_TITLE, WorkType.BLOCK_ANCHOR_SUMMARY,
  WorkType.NODE_TITLE, WorkType.NODE_ANCHOR_SUMMARY, WorkType.INTEREST_FEATURE_EXTRACTION,
]);

const TERMINAL = new Set([WorkStatus.COMPLETED, WorkStatus.FAILED_FINAL, WorkStatus.EXPIRED]);
export const DEFAULT_LEASE_MS = 120_000;

export class WorkBroker {
  constructor({ db, logger }) {
    this.db = db;
    this.log = logger;
    this.works = new Map();   // work_id → work（内存态；重启后 background 由 parser staging 重建）
    this.byIdempotency = new Map();
    this.byOrigin = new Map();// origin_agent_session → [work_id]
  }

  /** 创建语义 work。idempotency 相同则返回既有 work（不重复创建）。 */
  enqueue({ work_type, priority = 5, context_snapshot_ref = null, prompt_role = null,
            prompt_profile_id = null, output_schema = null, payload = null,
            origin_agent_session = null, idempotency = null, retention = 'SHORT' }) {
    if (idempotency) {
      const existing = this.byIdempotency.get(idempotency);
      if (existing && this.works.has(existing)) return this.works.get(existing);
    }
    const work = {
      work_id: newId('work'),
      work_type, priority, created_at: nowIso(),
      context_snapshot_ref, prompt_role, prompt_profile_id, output_schema,
      payload,                       // 冻结的输入（含 frozen TurnContext / 引用）
      status: WorkStatus.PENDING,
      claimed_by: null, lease_until: null,
      attempt: 0, attempt_id: null, result_id: null,
      retention,                     // SHORT(responder) | CURATOR(frozen内续做) | LONG(parser)
      origin_agent_session,
      last_error: null, completed_at: null,
      result: null,
    };
    this.works.set(work.work_id, work);
    if (idempotency) this.byIdempotency.set(idempotency, work.work_id);
    if (origin_agent_session) {
      const arr = this.byOrigin.get(origin_agent_session) || [];
      arr.push(work.work_id);
      this.byOrigin.set(origin_agent_session, arr);
    }
    return work;
  }

  claim({ session_token, session, max_items = 1, work_type = null, only_background = false }) {
    // 交互 work 优先 origin；background 全局。同 work 只允许一次 claim（CAS）。
    const now = Date.now();
    const candidates = [];
    for (const w of this.works.values()) {
      if (w.status !== WorkStatus.PENDING) continue;
      if (work_type && w.work_type !== work_type) continue;
      if (only_background && !BACKGROUND_WORK_TYPES.has(w.work_type)) continue;
      // origin 约束：interactive（responder/curator）只给 origin session；background 任意 host
      if (w.origin_agent_session && w.origin_agent_session !== session.agent_session_id
          && !BACKGROUND_WORK_TYPES.has(w.work_type)) continue;
      if (w.origin_agent_session && w.origin_agent_session !== session.agent_session_id
          && BACKGROUND_WORK_TYPES.has(w.work_type)) continue;
      candidates.push(w);
    }
    candidates.sort((a, b) => (a.priority - b.priority) || (Date.parse(a.created_at) - Date.parse(b.created_at)));
    const claimed = [];
    for (const w of candidates.slice(0, max_items)) {
      w.status = WorkStatus.CLAIMED;
      w.claimed_by = session.agent_session_id;
      w.lease_until = new Date(now + DEFAULT_LEASE_MS).toISOString();
      w.attempt += 1;
      w.attempt_id = newId('att');
      claimed.push(workView(w, { includePayload: true }));
    }
    return claimed;
  }

  /**
   * Host 提交结构化结果。幂等：同 (work_id, result_id) 或同 idempotency 只接受一次；
   * 结果经 schema 校验后交给 resultHandler（daemon 侧 applier）→ Canonical side effect 唯一。
   */
  submit({ work_id, result_id, idempotency, session, result, status = 'ok', error = null }) {
    const work = this.works.get(work_id);
    if (!work) throw err.notFound('WORK_NOT_FOUND', `work ${work_id} 不存在`);
    if (work.status === WorkStatus.COMPLETED) {
      // 重复 submit 同一 work：幂等 → 返回原结果（side effect 已发生过一次）
      if (idempotency && work.result_id === result_id) {
        return { ok: true, idempotent_replay: true, work: workView(work) };
      }
      throw err.policy('WORK_ALREADY_COMPLETED', `work ${work_id} 已完成`);
    }
    if (work.claimed_by && work.claimed_by !== session.agent_session_id) {
      throw err.policy('WORK_CLAIMED_BY_OTHER', `work ${work_id} 由 ${work.claimed_by} claim`);
    }
    if (work.status !== WorkStatus.CLAIMED && work.status !== WorkStatus.FAILED_RETRYABLE) {
      throw err.policy('WORK_NOT_CLAIMED', `work ${work_id} 当前状态 ${work.status}，无法提交`);
    }

    if (status === 'ok') {
      work.status = WorkStatus.COMPLETED;
      work.result_id = result_id || newId('res');
      work.completed_at = nowIso();
      work.result = result;
      return { ok: true, work: workView(work) };
    }
    // 失败：可重试（按 attempt 上限）或终态
    if (error && error.retryable && work.attempt < 3) {
      work.status = WorkStatus.FAILED_RETRYABLE;
      work.last_error = error.message || 'retryable';
      work.claimed_by = null;
      work.lease_until = null;
      return { ok: false, retryable: true, work: workView(work) };
    }
    work.status = WorkStatus.FAILED_FINAL;
    work.last_error = error?.message || 'final failure';
    return { ok: false, retryable: false, work: workView(work) };
  }

  /** lease 过期清理：CLAIMED → PENDING（可被其他 Host 接管） */
  reapExpiredLeases() {
    const now = Date.now();
    let released = 0;
    for (const w of this.works.values()) {
      if (w.status === WorkStatus.CLAIMED && w.lease_until && Date.parse(w.lease_until) < now) {
        w.status = WorkStatus.PENDING;
        w.claimed_by = null;
        w.lease_until = null;
        released++;
        this.log?.info?.(`work ${w.work_id} lease 过期回 PENDING`);
      }
      // background 长期 PENDING 不过期；interactive responder 超过 retention 窗口且无 origin host → EXPIRED
      if (w.status === WorkStatus.PENDING && w.retention === 'SHORT') {
        const age = now - Date.parse(w.created_at);
        if (age > 10 * 60_000 && !w.origin_agent_session) {
          // responder 短期：无人认领 10 分钟后作废（origin 会话下线后）
          w.status = WorkStatus.EXPIRED;
        }
      }
    }
    return released;
  }

  /** Host 会话断开：其 interactive（responder/curator）work 处理 */
  onHostDisconnect(sessionId) {
    const ids = this.byOrigin.get(sessionId) || [];
    for (const id of ids) {
      const w = this.works.get(id);
      if (!w) continue;
      if (w.status === WorkStatus.CLAIMED) {
        // Curator 未完成：允许留 PENDING（frozen TurnContext 有效期内可续做）；Responder 同理由新 host 接管
        w.status = WorkStatus.PENDING;
        w.claimed_by = null;
        w.lease_until = null;
        this.log?.info?.(`Host 断开：work ${w.work_id}（${w.work_type}）回 PENDING 等待接管`);
      }
    }
  }

  list({ status = null, work_type = null, session = null, limit = 50 } = {}) {
    const out = [];
    for (const w of this.works.values()) {
      if (status && w.status !== status) continue;
      if (work_type && w.work_type !== work_type) continue;
      if (session && w.claimed_by !== session.agent_session_id && w.origin_agent_session !== session.agent_session_id) continue;
      out.push(workView(w));
      if (out.length >= limit) break;
    }
    out.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return out;
  }

  get(workId) {
    const w = this.works.get(workId);
    return w ? workView(w, { includePayload: true }) : null;
  }

  stats() {
    const by = {};
    for (const w of this.works.values()) by[w.status] = (by[w.status] || 0) + 1;
    return { total: this.works.size, by_status: by };
  }
}

function workView(w, { includePayload = false } = {}) {
  const v = {
    work_id: w.work_id, work_type: w.work_type, priority: w.priority,
    status: w.status, created_at: w.created_at,
    claimed_by: w.claimed_by, lease_until: w.lease_until,
    attempt: w.attempt, attempt_id: w.attempt_id, result_id: w.result_id,
    retention: w.retention, origin_agent_session: w.origin_agent_session,
    context_snapshot_ref: w.context_snapshot_ref, prompt_role: w.prompt_role,
    prompt_profile_id: w.prompt_profile_id, output_schema: w.output_schema,
    completed_at: w.completed_at, last_error: w.last_error, result: w.result,
  };
  if (includePayload) v.payload = w.payload;
  return v;
}
