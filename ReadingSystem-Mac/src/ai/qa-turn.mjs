// qa-turn.mjs — QA Turn 硬流程（00_MASTER C / 01_QA_TURN_WORKFLOW）
// 1. 提交瞬间冻结 TurnContext → 2. Responder 回答 → 3. Focus authority 合法才运行 Curator →
// 4. Curator 最多一个动作 → 5. mutation 全部交 Reading Core → 6. EXTEND 不导航 →
// 7. CREATE 成功后最多 conditional navigation → 8. 只有 iPad VIEW_COMMITTED 后新 Focus 才成立。
import { newId, nowIso } from '../util.mjs';
import { deriveFocus, freezeTurnContext } from '../core/focus.mjs';
import { offlineGuard } from '../core/reading-core.mjs';

export class QaTurnEngine {
  constructor({ core, modules, builders, db, llm, logger, semantic }) {
    this.core = core;
    this.modules = modules;
    this.builders = builders;
    this.db = db;
    this.llm = llm;
    this.log = logger;
    this.semantic = semantic; // SemanticService（v2 路由）
    this.recentTurns = []; // WorkingConversationDigest 的简化实现（事件边界清理）
  }

  clearConversationOnEventBoundary() {
    // context.digest：Graph 切换/结束/全新阅读任务时重建，不按固定分钟过期
    this.recentTurns = [];
  }

  async submitQuestion(question, { budgetProfile = 'NORMAL', forceNoMutation = false, waitMs = 0 } = {}) {
    // v2 路由：HEURISTIC 独立模式；FULL 由 executionPolicy 决定 HOST_AGENT / EXTERNAL_API；
    // WAITING_FOR_EXECUTOR 不静默降级（除非用户显式 ALLOW_HEURISTIC → derive 已落 HEURISTIC）。
    const route = this.semantic.executionRoute();
    if (route.executor === 'HOST_AGENT') {
      return this.submitQuestionViaHost(question, { budgetProfile, waitMs });
    }
    if (route.status === 'WAITING_FOR_EXECUTOR') {
      return this.submitQuestionWaiting(question);
    }
    // HEURISTIC（独立模式）或 EXTERNAL_API（FULL 同步直连）
    this.modules.useExternal = route.executor === 'EXTERNAL_API';
    if (this.enricherSync) this.enricherSync();
    return this.submitQuestionLocal(question, { budgetProfile, forceNoMutation });
  }

  /** 同步本地执行路径（EXTERNAL_API 直连 或 HEURISTIC 独立模式）——v1 流程 */
  async submitQuestionLocal(question, { budgetProfile = 'NORMAL', forceNoMutation = false } = {}) {
    const core = this.core;
    const session = core.db.getSession();
    const confirmed = core.db.getConfirmedView();
    const deviceConnected = core.currentDeviceState() === 'CONNECTED';

    // ---- Offline guard（reading.offline_guard）----
    offlineGuard({
      deviceConnected,
      confirmedView: confirmed,
      taskKind: 'QA_ANSWER',
    });
    const canCurate = confirmed && confirmed.view_kind !== undefined;

    // ---- 1. 冻结 TurnContext ----
    const turnId = newId('qa');
    const profileSnapshotId = core.promptRuntime.activeSnapshotId();
    const turnContext = freezeTurnContext({
      turnId,
      confirmedView: canCurate ? confirmed : null,
      session,
      graphRevision: confirmed ? core.store.getGraph(confirmed.graph_id)?.graph_revision : null,
      profileSnapshotId,
      question,
    });
    core.db.insertQaTurn({
      turn_id: turnId, graph_id: turnContext.graph_id, focus_entity_id: turnContext.focus_entity_id,
      focus_type: turnContext.focus_type, basis_view_revision: turnContext.basis_view_revision,
      session_epoch: turnContext.session_epoch, profile_snapshot_id: profileSnapshotId, question,
    });

    // ---- 2. Responder ----
    const focusContext = core.query('get_focus_context');
    const context = this.builders.buildResponderContext({
      question, turnContext, focusContext, budgetProfile,
      recentTurns: this.recentTurns.slice(-3),
    });
    const { answer, mode } = await this.modules.responder({ context, question });

    const result = {
      turn_id: turnId,
      answer,
      mode,
      turn_context: turnContext,
      curator: null,
      mutation: null,
      navigation: null,
      notes: [],
    };

    // ---- 3-5. Curator + mutation（Focus authority 合法才运行）----
    if (canCurate && !forceNoMutation && turnContext.focus_type) {
      try {
        const graphCatalog = turnContext.graph_id ? core.query('get_graph_catalog', { graph_id: turnContext.graph_id }) : null;
        const curatorContext = this.builders.buildCuratorContext({
          turnContext, question, answer, focusEntity: focusContext.focus_entity, graphCatalog,
          duplicates: this.findDuplicateCandidates(turnContext.graph_id, question, answer),
          thresholds: this.modules.curatorThresholds(),
        });
        const decision = await this.modules.curator({
          context: curatorContext, turnContext, graphCatalog, question, answer,
        });
        result.curator = decision;
        core.command('record_curator_decision', { decision: { ...decision, qa_turn_id: turnId } }, { actor: 'ai.curator' });

        if (decision.decision !== 'NO_OP') {
          const mutation = await this.executeMutation(decision, turnContext, { question, answer });
          result.mutation = mutation;
          if (mutation?.type === 'CREATE') {
            // ---- 7. CREATE：conditional navigation（可 stale，不抢页）----
            const nav = core.command('request_navigation', {
              target: {
                graph_id: mutation.graph_id,
                view_kind: 'NODE_VIEW',
                entity_id: mutation.node_id,
              },
              mode: 'CONDITIONAL',
              preconditions: { basis_view_revision: turnContext.basis_view_revision },
            }, { actor: 'ai.create' });
            result.navigation = nav;
            result.notes.push(`已形成新节点：${mutation.title}`);
          } else if (mutation?.type === 'EXTEND') {
            result.notes.push('已更新当前节点');
          }
        }
      } catch (e) {
        // 失败安全：保留用户回答；不做不确定 mutation；结构化记录
        this.log?.warn?.(`curator 阶段失败（回答保留）：${e.code || e.message}`);
        result.notes.push('（结构更新本次未执行，回答不受影响）');
        result.curator_error = { code: e.code || 'INTERNAL', category: e.category, retryable: e.retryable, recovery_hint: e.recovery_hint };
      }
    } else {
      if (forceNoMutation) result.notes.push('（本轮按要求不更新内容图）');
      else if (!canCurate) result.notes.push('（iPad 未连接或没有已确认页面，本轮不更新内容图）');
    }

    core.db.completeQaTurn(turnId, { decision: result.curator?.decision ?? 'ANSWER_ONLY' });

    // ---- Working digest（临时工作记忆）----
    this.recentTurns.push({ question, answer: String(answer), graph_id: turnContext.graph_id, at: nowIso() });
    if (this.recentTurns.length > 8) this.recentTurns = this.recentTurns.slice(-8);

    result.provenance = {
      qa_turn_id: turnId,
      prompt_snapshot_id: profileSnapshotId,
      answer_mode: mode,
      module_ids: ['module.responder', 'module.graph_curator', 'module.segment_writer', 'module.node_title', 'module.node_summary'],
    };
    return result;
  }

  async executeMutation(decision, turnContext, { question, answer }) {
    const core = this.core;
    const graph = core.store.getGraph(turnContext.graph_id);
    if (!graph) return null;
    const idempotencyKey = `qa:${turnContext.qa_turn_id}:action`; // 一轮一个动作 + 重试幂等
    const parentRevision = graph.graph_revision;

    if (decision.decision === 'EXTEND') {
      const node = core.store.getNode(turnContext.graph_id, turnContext.focus_entity_id);
      const segmentText = await this.modules.segmentWriter({ decision, question, answer, focusEntity: node });
      const summaryUpdate = await this.modules.nodeSummary({ node, newSegment: segmentText, decision, mode: 'EXTEND' });
      const res = core.command('extend_node', {
        graph_id: turnContext.graph_id,
        node_id: turnContext.focus_entity_id,
        new_segment: segmentText,
        new_anchor_summary: summaryUpdate.summary,
        turn_context: turnContext,
        expected_revision: parentRevision,
        idempotency_key: idempotencyKey,
      }, { actor: 'ai.curator' });
      return { type: 'EXTEND', ...res };
    }

    if (decision.decision === 'CREATE') {
      // CREATE：segment_writer → title → summary → create_node（parent = frozen focus）
      const segmentText = await this.modules.segmentWriter({ decision, question, answer, focusEntity: null });
      const graphCatalog = core.query('get_graph_catalog', { graph_id: turnContext.graph_id });
      const parentNode = turnContext.focus_type === 'NODE'
        ? core.store.getNode(turnContext.graph_id, turnContext.focus_entity_id) : null;
      const parentCtx = parentNode ? `parent Title：${parentNode.title}\nparent Summary：${parentNode.anchor_summary}` : '';
      const title = await this.modules.nodeTitle({ decision, firstSegment: segmentText, parentContext: parentCtx });
      const provisional = { title };
      const summaryUpdate = await this.modules.nodeSummary({
        node: { ...provisional, anchor_summary: '' }, newSegment: segmentText, decision, mode: 'CREATE', parentContext: parentCtx,
      });
      const res = core.command('create_node', {
        graph_id: turnContext.graph_id,
        parent_entity: turnContext.focus_type === 'NODE'
          ? { type: 'NODE', id: turnContext.focus_entity_id }
          : { type: 'BLOCK', id: graph.root_block_id },
        title,
        anchor_summary: summaryUpdate.summary,
        first_segment: segmentText,
        turn_context: turnContext,
        curator_decision: decision,
        expected_revision: parentRevision,
        idempotency_key: idempotencyKey,
      }, { actor: 'ai.curator' });
      return { type: 'CREATE', title, ...res };
    }
    return null;
  }

  /** 全图 duplicate 候选：v1 由 Curator Context 中的 graph catalog 承担（见 buildCuratorContext） */
  findDuplicateCandidates(graphId, question, answer) {
    void graphId; void question; void answer;
    return [];
  }

  // ================= v2：FULL + HOST_AGENT（Work Broker 编排） =================

  /**
   * 方向唯一（ReadingDaemon 不主动调用当前对话模型）：
   *   daemon 创建 RESPONDER work → Host claim → 执行 prompt → submit structured result
   *   → daemon 创建 GRAPH_CURATOR work（携带 Responder 结果）→ Host claim → submit curator JSON
   *   → daemon 校验并执行 Canonical mutation（create/extend，走原 idempotency/revision gate）
   */
  async submitQuestionViaHost(question, { budgetProfile = 'NORMAL', waitMs = 180_000 } = {}) {
    const core = this.core;
    const session = core.db.getSession();
    const confirmed = core.db.getConfirmedView();
    const canCurate = confirmed && confirmed.view_kind !== undefined;

    // 冻结 TurnContext（同一不变量）
    const turnId = newId('qa');
    const profileSnapshotId = core.promptRuntime.activeSnapshotId();
    const turnContext = freezeTurnContext({
      turnId,
      confirmedView: canCurate ? confirmed : null,
      session,
      graphRevision: confirmed ? core.store.getGraph(confirmed.graph_id)?.graph_revision : null,
      profileSnapshotId,
      question,
    });
    core.db.insertQaTurn({
      turn_id: turnId, graph_id: turnContext.graph_id, focus_entity_id: turnContext.focus_entity_id,
      focus_type: turnContext.focus_type, basis_view_revision: turnContext.basis_view_revision,
      session_epoch: turnContext.session_epoch, profile_snapshot_id: profileSnapshotId, question,
    });

    // Context 由 daemon 正式 Context Builder 生成并绑定（Agent 无自由漫游权）
    const focusContext = canCurate ? core.query('get_focus_context') : null;
    const context = this.builders.buildResponderContext({
      question, turnContext, focusContext, budgetProfile,
      recentTurns: this.recentTurns.slice(-3),
    });

    const broker = this.semantic.broker;
    const responderWork = broker.enqueue({
      work_type: 'RESPONDER', priority: 1, retention: 'SHORT',
      prompt_role: 'module.responder',
      prompt_profile_id: profileSnapshotId,
      context_snapshot_ref: `qa:${turnId}:responder`,
      payload: { question, context, turn_context: turnContext },
      idempotency: `qa:${turnId}:responder`,
    });

    const responderResult = await this.pollWork(responderWork.work_id, waitMs);
    if (!responderResult) {
      return {
        turn_id: turnId, status: 'WAITING_FOR_EXECUTOR',
        answer: null,
        note: `Responder work 已入队（${responderWork.work_id}）。当前执行者（Host Agent）未在等待窗口内完成；完成后可通过 rs-agent work get ${responderWork.work_id} 查看。`,
        turn_context: turnContext,
      };
    }
    const answer = responderResult.answer ?? '';
    this.recentTurns.push({ question, answer: String(answer), graph_id: turnContext.graph_id, at: nowIso() });

    const result = {
      turn_id: turnId, answer, mode: 'host', turn_context: turnContext,
      curator: null, mutation: null, navigation: null, notes: [],
    };

    // Curator 仅在合法 Focus authority 下运行（与本地路径一致）
    if (canCurate && turnContext.focus_type && !this._forceNoMutation) {
      const graphCatalog = turnContext.graph_id ? core.query('get_graph_catalog', { graph_id: turnContext.graph_id }) : null;
      const curatorContext = this.builders.buildCuratorContext({
        turnContext, question, answer, focusEntity: focusContext?.focus_entity ?? null,
        graphCatalog, duplicates: [],
        thresholds: this.modules.curatorThresholds(),
      });
      const curatorWork = broker.enqueue({
        work_type: 'GRAPH_CURATOR', priority: 1, retention: 'CURATOR',
        prompt_role: 'module.graph_curator',
        prompt_profile_id: profileSnapshotId,
        context_snapshot_ref: `qa:${turnId}:curator`,
        payload: { question, context: curatorContext, turn_context: turnContext, graph_catalog: graphCatalog },
        idempotency: `qa:${turnId}:curator`,
      });
      const curatorResult = await this.pollWork(curatorWork.work_id, waitMs);
      if (curatorResult) {
        const decision = this.modules.validateCuratorOutput(curatorResult, { turnContext, graphCatalog });
        result.curator = decision;
        core.command('record_curator_decision', { decision: { ...decision, qa_turn_id: turnId } }, { actor: 'host.curator' });
        if (decision.decision !== 'NO_OP') {
          const mutation = await this.executeMutation(decision, turnContext, { question, answer });
          result.mutation = mutation;
          if (mutation?.type === 'CREATE') {
            const nav = core.command('request_navigation', {
              target: { graph_id: mutation.graph_id, view_kind: 'NODE_VIEW', entity_id: mutation.node_id },
              mode: 'CONDITIONAL',
              preconditions: { basis_view_revision: turnContext.basis_view_revision },
            }, { actor: 'host.create' });
            result.navigation = nav;
            result.notes.push(`已形成新节点：${mutation.title}`);
          } else if (mutation?.type === 'EXTEND') {
            result.notes.push('已更新当前节点');
          }
        }
      } else {
        result.notes.push('Curator work 未在等待窗口内完成，可稍后接管（frozen TurnContext 有效期内）');
      }
    }
    core.db.completeQaTurn(turnId, { decision: result.curator?.decision ?? 'ANSWER_ONLY' });
    result.provenance = { qa_turn_id: turnId, prompt_snapshot_id: profileSnapshotId, answer_mode: 'host' };
    return result;
  }

  /** FULL 请求但无合格执行者（WAITING_FOR_EXECUTOR）：不静默降级，返回显式状态 */
  async submitQuestionWaiting(question) {
    void question;
    const st = this.semantic.state();
    return {
      status: 'WAITING_FOR_EXECUTOR',
      note: '当前 Semantic Mode=FULL 但没有合格执行者（HOST_AGENT 离线 / EXTERNAL_API 未配置）。' +
            '不会自动降级为 HEURISTIC。可用以下方式继续：' +
            '① attach Host Agent（rs-agent attach）；② 配置 External Provider 并选择 Automatic/External；' +
            '③ 显式切换 Semantic Mode 为 Heuristic（semantic mode heuristic）。',
      semantic: { runtime_status: st.runtime_status, execution_policy: st.execution_policy },
    };
  }

  /** 轮询 work 至终态；waitMs<=0 表示不等待立即返回 null */
  async pollWork(workId, waitMs = 180_000) {
    const broker = this.semantic.broker;
    const deadline = Date.now() + Math.max(0, waitMs);
    while (Date.now() < deadline) {
      const w = broker.get(workId);
      if (!w) return null;
      if (w.status === 'COMPLETED') return w.result ?? null;
      if (w.status === 'FAILED_FINAL' || w.status === 'EXPIRED') return null;
      await new Promise((r) => setTimeout(r, 500));
    }
    return null; // 超时：work 仍在 PENDING/CLAIMED
  }
}
