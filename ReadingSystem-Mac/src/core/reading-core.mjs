// reading-core.mjs — Reading Core：Query/Command 总线 + Pre-flight + 能力守卫 + 状态机
// Query 无副作用（tools.context_api）；Command 显式改状态并经 preflight 八项检查。
import path from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { newId, nowIso, sha256 } from '../util.mjs';
import { err, CoreError } from '../errors.mjs';
import { deriveFocus } from './focus.mjs';
import { GraphService, DEPTH_GATE } from './graph-service.mjs';

export const SYSTEM_STATES = ['STARTING', 'READY', 'DEVICE_OFFLINE', 'RECOVERING', 'MIGRATING', 'DEGRADED', 'SAFE_MODE'];

/** offline guard 判定（reading.offline_guard）：ALLOW / ALLOW_RESPOND_ONLY / BLOCK_MUTATION */
export function offlineGuard({ deviceConnected, confirmedView, taskKind }) {
  if (deviceConnected) return 'ALLOW';
  switch (taskKind) {
    case 'QA_ANSWER':
    case 'LIBRARY':
    case 'PROMPT_ADMIN':
    case 'SYSTEM_STATUS':
      return 'ALLOW';
    case 'QA_CURATE_WITH_TURNCONTEXT':
      return confirmedView ? 'ALLOW' : 'ALLOW_RESPOND_ONLY';
    case 'GRAPH_MUTATION_NO_TURNCONTEXT':
      return 'BLOCK_MUTATION';
    default:
      return 'ALLOW_RESPOND_ONLY';
  }
}

export class ReadingCore {
  constructor({ config, store, db, graphService, promptRuntime, parser, engines, bridge, logger }) {
    this.config = config;
    this.store = store;
    this.db = db;
    this.graphs = graphService;
    this.promptRuntime = promptRuntime;
    this.parser = parser;
    this.engines = engines; // { interest, timing, scheduler }
    this.bridge = bridge;
    this.log = logger;
    this.systemState = 'STARTING';
    this.capabilities = {};
    this.degraded = [];
    this.pendingNavigations = new Map(); // command_id → {mode, basis_view_revision, target, issued_at, stale}
  }

  // ================= 状态机 =================
  setSystemState(state) {
    if (!SYSTEM_STATES.includes(state)) throw err.internal('BAD_STATE', `未知系统状态 ${state}`);
    this.systemState = state;
    this.graphs.systemState = state;
  }

  currentDeviceState() {
    if (!this.bridge) return 'UNKNOWN';
    if (!this.db.listDevices().some((d) => d.trusted)) return 'UNPAIRED';
    return this.bridge.hasConnectedDevice() ? 'CONNECTED' : 'OFFLINE';
  }

  focusAuthority() {
    const confirmed = this.db.getConfirmedView();
    return confirmed ? 'CONFIRMED' : 'UNCONFIRMED';
  }

  get_system_status() {
    return {
      system_state: this.systemState,
      store_state: this.degraded.some((d) => d.kind === 'CANONICAL') ? 'CORRUPT' : 'OK',
      device_state: this.currentDeviceState(),
      session: this.db.getSession(),
      confirmed_view: this.db.getConfirmedView(),
      focus_authority: this.focusAuthority(),
      active_prompt_profile: this.promptRuntime?.activeProfileSummary() ?? null,
      last_parse_job: this.lastParseJobId ? this.db.getParseJob(this.lastParseJobId) : null,
      capabilities: { ...this.capabilities, semantic: this.semantic?.overview?.() ?? this.capabilities.semantic ?? null },
      degraded: this.degraded,
      time: nowIso(),
    };
  }

  // ================= Queries（无副作用） =================
  query(name, params = {}) {
    switch (name) {
      case 'get_system_status': return this.get_system_status();
      case 'get_view_state': return this.viewStateSnapshot();
      case 'get_focus_context': return this.getFocusContext();
      case 'get_graph': return this.getGraphFull(params.graph_id);
      case 'get_node': return this.getNodeFull(params.graph_id, params.node_id);
      case 'get_graph_catalog': return this.getGraphCatalog(params.graph_id);
      case 'search_current_graph': return this.searchCurrentGraph(params.query, params.graph_id);
      case 'list_documents': return this.listDocuments();
      case 'get_document': return this.getDocument(params.document_id);
      case 'get_parse_job': return this.db.getParseJob(params.job_id);
      case 'get_interest_state': return this.engines.interest.getState(params.graph_id);
      case 'get_temporal_state': return this.engines.timing.getState(params.graph_id);
      case 'get_active_due_candidates': return this.engines.timing.activeDueCandidates();
      case 'get_long_term_due_candidates': return this.engines.timing.longTermCandidates();
      case 'list_prompt_modules': return this.promptRuntime.listModules();
      case 'get_active_profile': return this.promptRuntime.activeProfileSummary();
      case 'list_devices': return { devices: this.db.listDevices() };
      case 'get_decision': {
        const d = params.decision_id
          ? this.db.getDecision(params.decision_id)
          : this.db.getDecisionByTurn(params.qa_turn_id);
        if (!d) throw err.notFound('DECISION_NOT_FOUND', '未找到该决策记录');
        return d;
      }
      case 'get_semantic_state': return this.semantic.overview();
      case 'list_host_sessions': return { sessions: this.semantic.hosts.listSessions() };
      case 'work_list': return { works: this.semantic.broker.list(params) };
      case 'work_get': return { work: this.semantic.broker.get(params.work_id) };
      case 'external_provider_status': return this.semantic.providerAvailability();
      default:
        throw err.validation('UNKNOWN_QUERY', `未知 Query: ${name}`);
    }
  }

  viewStateSnapshot() {
    return {
      confirmed_view_state: this.db.getConfirmedView(),
      last_known_view_state: this.db.getLastKnownView(),
      focus: deriveFocus(this.db.getConfirmedView()),
      focus_authority: this.focusAuthority(),
      session: this.db.getSession(),
    };
  }

  getFocusContext() {
    // tools.context_api：至少 session status/epoch、active graph、view kind/revision、
    // focus entity/type、authority confirmed/unconfirmed
    const session = this.db.getSession();
    const confirmed = this.db.getConfirmedView();
    const last = this.db.getLastKnownView();
    const focus = deriveFocus(confirmed);
    let focusEntity = null;
    if (focus?.type === 'BLOCK' && focus.entity_id) {
      focusEntity = this.findBlock(focus.entity_id);
    } else if (focus?.type === 'NODE' && focus.entity_id && confirmed.graph_id) {
      focusEntity = this.store.getNode(confirmed.graph_id, focus.entity_id);
    }
    return {
      session_status: session.status,
      session_epoch: session.session_epoch,
      active_graph_id: session.active_graph_id,
      view_kind: confirmed?.view_kind ?? null,
      view_revision: confirmed?.view_revision ?? null,
      focus_entity: focusEntity,
      focus_type: focus?.type ?? null,
      focus_entity_id: focus?.entity_id ?? null,
      authority: this.focusAuthority(),
      device_state: this.currentDeviceState(),
      last_known_view: last,
    };
  }

  findBlock(blockId) {
    const row = this.db.db.prepare('SELECT * FROM blocks_index WHERE block_id = ?').get(blockId);
    if (!row) return null;
    const block = this.store.getBlock(row.document_id, row.parse_run_id, blockId);
    return block;
  }

  getGraphFull(graphId) {
    const graph = this.store.getGraph(graphId);
    if (!graph) throw err.notFound('GRAPH_NOT_FOUND', `graph ${graphId} 不存在`);
    const nodes = this.store.listNodes(graphId);
    const rootBlock = this.findBlock(graph.root_block_id);
    return {
      graph_id: graph.graph_id,
      graph_revision: graph.graph_revision,
      root_block: rootBlock
        ? { block_id: rootBlock.block_id, title: rootBlock.title, anchor_summary: rootBlock.anchor_summary, ordinal: rootBlock.ordinal }
        : { block_id: graph.root_block_id, title: null },
      document_id: graph.document_id,
      nodes: nodes.map((n) => ({
        node_id: n.node_id, parent_id: n.parent_id, depth: n.depth, title: n.title,
        anchor_summary: n.anchor_summary, segment_count: n.segment_count, created_at: n.created_at,
      })),
      edges: graph.edges,
      layout: this.store.getLayout(graphId),
    };
  }

  getNodeFull(graphId, nodeId) {
    const node = this.store.getNode(graphId, nodeId);
    if (!node) throw err.notFound('NODE_NOT_FOUND', `node ${nodeId} 不存在`);
    const segments = [];
    for (let i = 1; i <= node.segment_count; i++) {
      segments.push({ ordinal: i, text: this.store.getSegment(graphId, nodeId, i) });
    }
    return { ...node, segments };
  }

  getGraphCatalog(graphId) {
    const graph = this.store.getGraph(graphId);
    if (!graph) throw err.notFound('GRAPH_NOT_FOUND', `graph ${graphId} 不存在`);
    const nodes = this.store.listNodes(graphId);
    const rootBlock = this.findBlock(graph.root_block_id);
    return {
      graph_id: graphId,
      graph_revision: graph.graph_revision,
      root: { block_id: graph.root_block_id, title: rootBlock?.title ?? null },
      node_count: nodes.length,
      max_depth: nodes.reduce((m, n) => Math.max(m, n.depth), 0),
      nodes: nodes.map((n) => ({ node_id: n.node_id, parent_id: n.parent_id, depth: n.depth, title: n.title, anchor_summary: n.anchor_summary })),
    };
  }

  searchCurrentGraph(query, graphId) {
    const gid = graphId || this.db.getSession().active_graph_id;
    if (!gid) return { results: [] };
    const q = String(query || '').trim().toLowerCase();
    if (!q) return { results: [] };
    const nodes = this.store.listNodes(gid);
    const results = [];
    for (const n of nodes) {
      let score = 0;
      if ((n.title || '').toLowerCase().includes(q)) score += 5;
      if ((n.anchor_summary || '').toLowerCase().includes(q)) score += 2;
      for (let i = 1; i <= Math.min(n.segment_count, 8); i++) {
        const seg = this.store.getSegment(gid, n.node_id, i) || '';
        if (seg.toLowerCase().includes(q)) { score += 1; break; }
      }
      if (score > 0) results.push({ node_id: n.node_id, title: n.title, depth: n.depth, score });
    }
    // 当前 graph 内全文检索 block 正文（SOURCE 层）
    const session = this.db.getSession();
    const rootGraph = this.store.getGraph(gid);
    if (rootGraph) {
      const block = this.findBlock(rootGraph.root_block_id);
      if (block?.content && block.content.toLowerCase().includes(q)) {
        results.push({ block_id: block.block_id, title: block.title, kind: 'SOURCE', score: 3 });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return { results: results.slice(0, 20) };
  }

  listDocuments() {
    const rows = this.db.db.prepare('SELECT * FROM documents_catalog ORDER BY updated_at DESC').all();
    return { documents: rows };
  }

  getDocument(documentId) {
    const doc = this.store.getDocument(documentId);
    if (!doc) throw err.notFound('DOCUMENT_NOT_FOUND', `document ${documentId} 不存在`);
    const source = this.store.getSource(documentId, doc.active_source_version);
    const blocks = this.store.listBlocks(documentId, doc.active_parse_run);
    const graphs = this.store.listGraphs().filter((g) => g.document_id === documentId);
    return {
      document: { ...doc, source_path: source?.original_path, source_status: source?.status, fingerprint: source?.fingerprint },
      block_count: blocks.length,
      blocks: blocks.map((b) => ({ block_id: b.block_id, ordinal: b.ordinal, title: b.title, anchor_summary: b.anchor_summary })),
      graphs: graphs.map((g) => ({ graph_id: g.graph_id, root_block_id: g.root_block_id, graph_revision: g.graph_revision })),
    };
  }

  // ================= Commands =================
  async command(name, params = {}, meta = {}) {
    const commandId = meta.command_id || newId('cmd');
    const actor = meta.actor || 'ai';
    try {
      const result = await this.dispatchCommand(name, params, { commandId, actor });
      this.db.audit(actor, `COMMAND:${name}`, null, commandId, { ok: true });
      return { ok: true, command_id: commandId, ...result };
    } catch (e) {
      if (e instanceof CoreError) {
        this.db.audit(actor, `COMMAND:${name}`, null, commandId, { error: e.code });
        throw e;
      }
      this.log?.error?.(`command ${name} failed`, e);
      throw err.internal('COMMAND_FAILED', e.message);
    }
  }

  dispatchCommand(name, p, ctx) {
    switch (name) {
      // --- Graph mutations ---
      case 'create_node': return this.graphs.createNode({ ...p, provenance: p.provenance ?? { actor: ctx.actor } });
      case 'extend_node': return this.graphs.extendNode({ ...p, provenance: p.provenance ?? { actor: ctx.actor } });
      case 'record_curator_decision': return this.recordCuratorDecision(p);

      // --- Reading session ---
      case 'activate_graph': return this.activateGraph(p, ctx);
      case 'end_current_graph': return this.endCurrentGraph(p, ctx);
      case 'skip_current_graph': return this.skipCurrentGraph(p, ctx);
      case 'end_and_next': return this.endAndNext(p, ctx);
      case 'continue_document': return this.continueDocument(p, ctx);
      case 'start_from_graph': return this.startFromGraph(p, ctx);
      case 'request_navigation': return this.requestNavigation(p, ctx);
      case 'set_session_policy': return this.setSessionPolicy(p);
      case 'view_committed': return this.viewCommitted(p); // iPad 事件经 Core 入口统一处理

      // --- Library ---
      case 'scan_library': return this.parser.scanLibrary();
      case 'parse_library': return this.parseLibrary(p, ctx);
      case 'parse_document': return this.parseDocument(p, ctx);
      case 'reparse_document': return this.parseDocument(p, ctx, { force: true });

      // --- Temporal ---
      case 'commit_reading_episode': return this.engines.interest.commitEpisode(p);
      case 'set_temporal_policy': return this.engines.timing.setTemporalPolicy(p);
      case 'temporal_one': return this.engines.scheduler.manualTemporalOne(ctx);

      // --- Prompt registry ---
      case 'compile_profile_snapshot': return this.promptRuntime.compileActiveSnapshot();
      case 'activate_profile_snapshot': return this.promptRuntime.activateSnapshot(p.snapshot_id);
      case 'rollback_profile': return this.promptRuntime.rollback(p.snapshot_id);

      // --- v2 Semantic（Host Agent 一等化）---
      case 'semantic_set_policy': return this.semantic.setMode(p);
      case 'semantic_external_configure': return this.configureExternal(p);
      case 'semantic_external_enable': return this.semantic.setExternalEnabled({ enabled: true });
      case 'semantic_external_disable': return this.semantic.setExternalEnabled({ enabled: false });
      case 'agent_attach': return this.agentAttach(p);
      case 'agent_heartbeat': return this.semantic.hosts.heartbeat(p.session_token);
      case 'agent_detach': return this.agentDetach(p);
      case 'work_claim': return this.workClaim(p);
      case 'work_submit': return this.workSubmit(p);

      default:
        throw err.validation('UNKNOWN_COMMAND', `未知 Command: ${name}`);
    }
  }

  // ---- v2 Semantic handlers ----
  configureExternal(p) {
    if (p.api_key) {
      const saved = this.semantic.credentials.save(p.api_key, { source: 'cli' });
      if (!saved.ok) throw err.dependency('KEYCHAIN_WRITE_FAILED', '无法将凭证写入 Keychain', '检查 macOS 钥匙串访问权限');
    }
    const st = this.semantic.setExternalEnabled({ enabled: p.enabled ?? this.semantic.credentials.hasCredential() });
    this.syncChannelAfterSemanticChange();
    return { credential_stored: Boolean(p.api_key), semantic: st };
  }

  agentAttach(p) {
    // probe 五项的缺省视为 host 已回传（由 rs-agent probe 实际执行后 attach 携带）
    const res = this.semantic.hosts.attach(p);
    this.syncChannelAfterSemanticChange();
    return res;
  }

  agentDetach(p) {
    const res = p.session_token
      ? this.semantic.hosts.detach({ session_id: this.semantic.hosts.byToken(p.session_token).agent_session_id, reason: p.reason || 'DETACH' })
      : this.semantic.hosts.detach({ session_id: p.session_id, reason: p.reason || 'DETACH' });
    this.syncChannelAfterSemanticChange();
    return res;
  }

  workClaim(p) {
    const session = this.semantic.hosts.byToken(p.session_token);
    const claimed = this.semantic.broker.claim({ session_token: p.session_token, session, max_items: p.max_items ?? 1, work_type: p.work_type ?? null, only_background: Boolean(p.only_background) });
    if (!claimed.length) return { claimed: [], note: '没有可 claim 的 PENDING work' };
    return { claimed };
  }

  workSubmit(p) {
    const session = this.semantic.hosts.byToken(p.session_token);
    return this.semantic.broker.submit({
      work_id: p.work_id, result_id: p.result_id, idempotency: p.idempotency,
      session, result: p.result, status: p.status || 'ok', error: p.error ?? null,
    });
  }

  syncChannelAfterSemanticChange() {
    if (this.daemonSync) this.daemonSync();
  }

  recordCuratorDecision(p) {
    const record = p.decision || p;
    const decisionId = newId('dec');
    this.db.saveDecision({
      decision_id: decisionId,
      qa_turn_id: record.qa_turn_id ?? null,
      graph_id: record.proposed_action_target?.graph_id ?? null,
      focus_entity_id: record.proposed_action_target?.focus_entity_id ?? null,
      focus_type: null,
      decision: record.decision,
      record,
    });
    return { decision_id: decisionId };
  }

  // ---- session commands ----
  activateGraph({ graph_id, push_mode = 'FRESH', reason }, ctx) {
    const graph = this.store.getGraph(graph_id);
    if (!graph) throw err.notFound('GRAPH_NOT_FOUND', `graph ${graph_id} 不存在`);
    this.checkWriteReadyForSession();
    const session = this.db.getSession();

    // 关闭旧 Episode（若切换到不同 graph）
    if (session.active_graph_id && session.active_graph_id !== graph_id) {
      this.engines.interest.closeOpenEpisode(session.active_graph_id, 'SWITCHED_AWAY');
    }
    const blockRow = this.db.db.prepare('SELECT block_id FROM blocks_index WHERE block_id = ?').get(graph.root_block_id);
    this.db.updateSession({ active_graph_id: graph_id, status: 'READING' });
    this.db.ensureInterest(graph_id);
    this.db.ensureTiming(graph_id);
    this.db.ensureDifficulty(graph_id);
    this.engines.interest.openEpisode(graph_id, push_mode);

    if (push_mode === 'FRESH' || push_mode === 'MANUAL') {
      this.pushGraphToDevices(graph_id, { push_mode });
    }
    this.db.audit(ctx.actor, 'ACTIVATE_GRAPH', 'graph', graph_id, { push_mode, reason });
    return { activated: graph_id, push_mode };
  }

  endCurrentGraph(p, ctx) {
    const session = this.db.getSession();
    if (!session.active_graph_id) throw err.policy('NO_ACTIVE_GRAPH', '当前没有阅读中的 Graph');
    const graphId = session.active_graph_id;
    this.engines.interest.closeOpenEpisode(graphId, 'END');
    this.engines.timing.onEpisodeEnd(graphId, 'END');
    this.db.updateSession({ active_graph_id: null, status: 'IDLE' });
    // END：Scheduler 可自由选择 continuation / temporal / discovery
    const next = this.engines.scheduler.pickNext({ cause: 'END' });
    return { ended: graphId, scheduler_next: next };
  }

  skipCurrentGraph(p, ctx) {
    const session = this.db.getSession();
    if (!session.active_graph_id) throw err.policy('NO_ACTIVE_GRAPH', '当前没有阅读中的 Graph');
    const graphId = session.active_graph_id;
    this.engines.interest.closeOpenEpisode(graphId, 'SKIP');
    this.engines.timing.onEpisodeEnd(graphId, 'SKIP');
    this.db.updateSession({ active_graph_id: null, status: 'IDLE' });
    return { skipped: graphId };
  }

  endAndNext(p, ctx) {
    // NEXT = explicit continuation：关闭 Episode、正常更新 Interest/Timing，
    // 但跳过 Temporal competition，直接 continuation Graph（07_END_GRAPH_WORKFLOW）
    const session = this.db.getSession();
    const graphId = session.active_graph_id;
    if (graphId) {
      this.engines.interest.closeOpenEpisode(graphId, 'END_AND_NEXT');
      this.engines.timing.onEpisodeEnd(graphId, 'END_AND_NEXT');
    }
    const next = this.engines.scheduler.pickNext({ cause: 'CONTINUATION', skipTemporal: true });
    if (next?.graph_id) {
      this.activateGraph({ graph_id: next.graph_id, push_mode: 'CONTINUATION', reason: 'end_and_next' }, ctx);
      return { next_graph: next.graph_id, next_block: next.block_id ?? null, pushed: true };
    }
    return { next_graph: null, note: '没有可继续的 Graph' };
  }

  continueDocument(p, ctx) {
    const session = this.db.getSession();
    const gid = session.continuation_graph_id || session.active_graph_id;
    if (!gid) return { continued: false, note: '没有 continuation anchor' };
    return this.endAndNext(p, ctx);
  }

  startFromGraph({ graph_id }, ctx) {
    // START_FROM：更新 continuation anchor 到该 graph 的后续
    this.db.updateSession({ continuation_graph_id: graph_id });
    return { continuation_anchor: graph_id };
  }

  requestNavigation({ target, mode = 'EXPLICIT', preconditions }, ctx) {
    // tools.session_api：导航成功判定以 iPad View commit 为准
    this.checkWriteReadyForSession();
    const session = this.db.getSession();
    const commandId = newId('nav');
    const nav = {
      command_id: commandId,
      mode, // EXPLICIT | CONDITIONAL
      target, // { graph_id, view_kind: BLOCK_VIEW|NODE_VIEW|TOPOLOGY_VIEW, entity_id }
      basis_view_revision: preconditions?.basis_view_revision ?? this.db.getConfirmedView()?.view_revision ?? null,
      issued_at: nowIso(),
      epoch: session.session_epoch,
      stale: false,
    };
    this.pendingNavigations.set(commandId, nav);
    const delivered = this.bridge?.sendNavigationCommand(nav);
    this.db.audit(ctx.actor, 'REQUEST_NAVIGATION', 'navigation', commandId, { mode, target, delivered });
    return { navigation_command_id: commandId, mode, delivered: Boolean(delivered) };
  }

  setSessionPolicy(p) {
    // reading.session_policy：scope = SESSION | DOCUMENT | GRAPH_EXPLICIT_POLICY
    const session = this.db.getSession();
    const scope = p.scope || 'SESSION';
    const changes = {};
    if (typeof p.temporal_enabled === 'boolean') {
      if (scope === 'SESSION') {
        this.db.updateSession({ temporal_enabled: p.temporal_enabled });
        changes.temporal_enabled = p.temporal_enabled;
      } else if (scope === 'GRAPH_EXPLICIT_POLICY' && p.graph_id) {
        this.engines.timing.setTemporalPolicy({
          graph_id: p.graph_id, policy: p.temporal_enabled ? 'DEFAULT' : 'SUPPRESS',
        });
        changes.graph_policy = p.graph_id;
      }
    }
    if (p.continuation_graph_id) {
      this.db.updateSession({ continuation_graph_id: p.continuation_graph_id });
      changes.continuation_anchor = p.continuation_graph_id;
    }
    return { applied: changes, scope };
  }

  /** iPad VIEW_COMMITTED（唯一合法 Focus 更新入口；无独立 FOCUS_CHANGED） */
  viewCommitted(p) {
    const { graph_id, view_kind, entity_id, view_revision, session_epoch, cause_command_id } = p;
    const session = this.db.getSession();
    if (session_epoch !== session.session_epoch) {
      // 旧 epoch 事件全部作废（SESSION Domain 不变量）
      return { accepted: false, reason: 'STALE_SESSION_EPOCH' };
    }
    const graph = this.store.getGraph(graph_id);
    if (!graph) throw err.notFound('GRAPH_NOT_FOUND', `view_committed 引用了不存在的 graph ${graph_id}`);

    const prevRevision = this.db.getConfirmedView()?.view_revision ?? 0;
    if (view_revision <= prevRevision) {
      return { accepted: false, reason: 'STALE_VIEW_REVISION' };
    }
    this.db.setConfirmedView({
      graph_id, view_kind, entity_id: entity_id ?? null,
      view_revision, session_epoch,
    });
    this.db.setLastKnownView({ graph_id, view_kind, entity_id: entity_id ?? null, view_revision, session_epoch });

    // conditional nav 到达即消耗
    if (cause_command_id && this.pendingNavigations.has(cause_command_id)) {
      this.pendingNavigations.delete(cause_command_id);
    }
    // 同 epoch 的其他 CONDITIONAL nav：与新 view 不匹配的标记 stale（用户已主动移动）
    for (const [id, nav] of this.pendingNavigations) {
      if (nav.mode === 'CONDITIONAL' && nav.basis_view_revision != null && nav.basis_view_revision < view_revision) {
        nav.stale = true;
      }
    }
    const focus = deriveFocus({ graph_id, view_kind, entity_id });
    this.db.audit('ipad', 'VIEW_COMMITTED', 'view', `${graph_id}/${view_kind}/${entity_id ?? ''}`, { focus });
    return { accepted: true, view_revision, focus };
  }

  pushGraphToDevices(graphId, { push_mode }) {
    if (!this.bridge) return false;
    return this.bridge.pushGraph(graphId, { push_mode });
  }

  checkWriteReadyForSession() {
    if (this.systemState === 'SAFE_MODE') throw err.policy('SAFE_MODE', '安全模式：暂不允许改变阅读会话');
  }

  // ---- parse commands ----
  parseLibrary(p, ctx) {
    const job = this.parser.startJob({ scope: p?.scope || 'LIBRARY', force: Boolean(p?.force) });
    this.lastParseJobId = job.job_id;
    return job;
  }

  parseDocument(p, ctx, { force = false } = {}) {
    if (!p.document_id && !p.path) throw err.validation('MISSING_TARGET', 'parse_document 需要 document_id 或 path');
    const job = this.parser.startJob({
      scope: p.document_id ? { type: 'DOCUMENT', document_id: p.document_id } : { type: 'PATH', path: p.path },
      force: force || Boolean(p.force),
    });
    this.lastParseJobId = job.job_id;
    return job;
  }
}
