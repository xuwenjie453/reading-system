// host-registry.mjs — Phase B：HostAgent 能力发现、Compatibility Tier、AgentSession
//
// 规则（03_PhaseB_*）：
//   - capability 必须实际 probe，五项 probe 全过才 verified；声明不算数。
//   - Tier 判定基于能力，不基于品牌（无 if zcode / if codex 分支）。
//   - AgentSession 是短期状态：detach/重启不影响 ReadingDaemon/iPad。
//   - Host 身份 token：short-lived session capability token（仅本机传输）。

import { newId, nowIso } from '../util.mjs';
import { err } from '../errors.mjs';

export const HOST_CAPABILITIES = Object.freeze([
  'PROMPT_EXECUTION', 'STRUCTURED_OUTPUT', 'READING_CORE_QUERY', 'READING_CORE_COMMAND',
  'LOCAL_FILE_READ', 'LOCAL_FILE_WRITE', 'SHELL_EXECUTION', 'MCP_CLIENT', 'LOCAL_HTTP',
  'LONG_CONTEXT', 'PARALLEL_TASK', 'BACKGROUND_TASK',
]);

/** Tier A FULL 最低能力（02_最低FULL能力.md）：无任何 API Key 字样 */
export const MIN_TIER_A_CAPABILITIES = Object.freeze([
  'PROMPT_EXECUTION', 'STRUCTURED_OUTPUT', 'READING_CORE_QUERY', 'READING_CORE_COMMAND',
]);

export const CompatibilityTier = Object.freeze({
  TIER_A_EXECUTING_HOST: 'TIER_A_EXECUTING_HOST',   // FULL READY
  TIER_B_SEMANTIC_HOST: 'TIER_B_SEMANTIC_HOST',     // 可分析，无安全 Core write bridge
  TIER_C_UNSUPPORTED: 'TIER_C_UNSUPPORTED',         // 不能作为 semantic executor
});

/** CapabilityProbe 五项（03_CapabilityProbe.md）：必须实际 probe，通过才 verified */
export const PROBE_CHECKS = Object.freeze([
  'SYSTEM_STATUS', 'CONTEXT_DRY_RUN', 'STRUCTURED_RESULT_VALIDATION', 'GRAPH_MUTATION_DRY_RUN', 'VALIDATION_ERROR_HANDLING',
]);

export class HostRegistry {
  constructor({ db, coreQuery, logger }) {
    this.db = db;
    this.coreQuery = coreQuery;      // () => system status 快照
    this.log = logger;
    this.sessions = new Map();       // session_id → AgentSession
    this.tokenToSession = new Map(); // session_token → session_id
    this.tokensByDevice = new Map(); // host_key → token（单一活跃会话）
  }

  // ---- attach（Phase B/C：Host 通过 adapter 建立会话）----
  /**
   * @param {object} opts { host_key(设备/宿主唯一标识), host_family('generic'), adapter_type,
   *   declared_capabilities: string[], capability_probes: {SYSTEM_STATUS: ok,...} }
   */
  attach(opts) {
    const hostKey = opts.host_key;
    if (!hostKey) throw err.validation('MISSING_HOST_KEY', 'attach 需要 host_key');

    // 单宿主单活跃会话：旧会话 token 作废（session 短期）
    const oldToken = this.tokensByDevice.get(hostKey);
    if (oldToken) {
      const oldSession = this.sessions.get(this.tokenToSession.get(oldToken));
      if (oldSession) this.detach({ session_id: oldSession.agent_session_id, reason: 'REPLACED' });
    }

    // probe 评估（Host 侧逐项实测回传；verified 依据 probe 而非声明）
    const probeResults = opts.capability_probes || {};
    const verified = Object.entries(PROBE_CHECKS).reduce((acc, [, check]) => {
      acc[check] = Boolean(probeResults[check]);
      return acc;
    }, {});
    const allProbesPassed = PROBE_CHECKS.every((c) => verified[c]);

    const declared = new Set(opts.declared_capabilities || []);
    const hasMinTierA = MIN_TIER_A_CAPABILITIES.every((c) => declared.has(c) || allProbesPassed);
    const hasCoreWriteBridge = Boolean(opts.core_write_bridge); // 声明有安全 Core bridge（adapter 提供）

    let tier;
    if (hasMinTierA && allProbesPassed && hasCoreWriteBridge) tier = CompatibilityTier.TIER_A_EXECUTING_HOST;
    else if (declared.has('PROMPT_EXECUTION') || declared.has('STRUCTURED_OUTPUT')) tier = CompatibilityTier.TIER_B_SEMANTIC_HOST;
    else tier = CompatibilityTier.TIER_C_UNSUPPORTED;

    const sessionToken = newId('tok');
    const session = {
      agent_session_id: newId('sess'),
      host_key: hostKey,
      host_family: opts.host_family || 'generic',   // 仅 diagnostics，不参与判定
      adapter_type: opts.adapter_type || 'cli',
      declared_capabilities: [...declared],
      verified_capabilities: verified,
      tier,
      core_write_bridge: Boolean(hasCoreWriteBridge),
      connected_at: nowIso(),
      last_seen_at: nowIso(),
      session_token: sessionToken,
      semantic_status: tier === CompatibilityTier.TIER_A_EXECUTING_HOST ? 'FULL_READY' : tier,
    };
    this.sessions.set(session.agent_session_id, session);
    this.tokenToSession.set(sessionToken, session.agent_session_id);
    this.tokensByDevice.set(hostKey, sessionToken);
    this.log?.info?.(`Host 会话建立: family=${session.host_family} tier=${tier} session=${session.agent_session_id}`);
    return { session: publicSession(session), token: sessionToken };
  }

  heartbeat(sessionToken) {
    const session = this.byToken(sessionToken);
    session.last_seen_at = nowIso();
    return publicSession(session);
  }

  detach({ session_id, reason = 'DETACH' }) {
    const session = this.sessions.get(session_id);
    if (!session) throw err.notFound('SESSION_NOT_FOUND', `session ${session_id} 不存在`);
    this.sessions.delete(session_id);
    this.tokenToSession.delete(session.session_token);
    if (this.tokensByDevice.get(session.host_key) === session.session_token) {
      this.tokensByDevice.delete(session.host_key);
    }
    this.log?.info?.(`Host 会话结束: ${session_id} reason=${reason}`);
    return { detached: session_id };
  }

  byToken(token) {
    const sid = this.tokenToSession.get(token);
    if (!sid) throw err.auth('INVALID_SESSION_TOKEN', 'session token 无效或已过期', 'REATTACH');
    const session = this.sessions.get(sid);
    if (!session) throw err.auth('SESSION_EXPIRED', '会话已结束，请重新 attach', 'REATTACH');
    session.last_seen_at = nowIso();
    return session;
  }

  /** 当前是否有合格 Tier A Host 在线（供 Semantic State 判定） */
  hasTierAHost() {
    for (const s of this.sessions.values()) {
      if (s.tier === CompatibilityTier.TIER_A_EXECUTING_HOST) return true;
    }
    return false;
  }

  /** 是否有任何 Host 会话（Tier B 也算 availability 但不算 executor） */
  anyHost() { return this.sessions.size > 0; }

  listSessions() {
    return [...this.sessions.values()].map(publicSession);
  }

  /** 清理失联会话（lease/heartbeat 过期） */
  reapStale(maxAgeMs = 90_000) {
    const now = Date.now();
    for (const s of [...this.sessions.values()]) {
      if (now - Date.parse(s.last_seen_at) > maxAgeMs) {
        this.detach({ session_id: s.agent_session_id, reason: 'STALE_HEARTBEAT' });
      }
    }
  }
}

function publicSession(s) {
  return {
    agent_session_id: s.agent_session_id,
    host_key: s.host_key,
    host_family: s.host_family,
    adapter_type: s.adapter_type,
    tier: s.tier,
    connected_at: s.connected_at,
    last_seen_at: s.last_seen_at,
    semantic_status: s.semantic_status,
    verified_capabilities: s.verified_capabilities,
  };
}
