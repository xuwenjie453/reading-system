// qa-turn.mjs — QA Turn 硬流程（00_MASTER C / 01_QA_TURN_WORKFLOW）
// 1. 提交瞬间冻结 TurnContext → 2. Responder 回答 → 3. Focus authority 合法才运行 Curator →
// 4. Curator 最多一个动作 → 5. mutation 全部交 Reading Core → 6. EXTEND 不导航 →
// 7. CREATE 成功后最多 conditional navigation → 8. 只有 iPad VIEW_COMMITTED 后新 Focus 才成立。
import { newId, nowIso } from '../util.mjs';
import { deriveFocus, freezeTurnContext } from '../core/focus.mjs';
import { offlineGuard } from '../core/reading-core.mjs';

export class QaTurnEngine {
  constructor({ core, modules, builders, db, llm, logger }) {
    this.core = core;
    this.modules = modules;
    this.builders = builders;
    this.db = db;
    this.llm = llm;
    this.log = logger;
    this.recentTurns = []; // WorkingConversationDigest 的简化实现（事件边界清理）
  }

  clearConversationOnEventBoundary() {
    // context.digest：Graph 切换/结束/全新阅读任务时重建，不按固定分钟过期
    this.recentTurns = [];
  }

  async submitQuestion(question, { budgetProfile = 'NORMAL', forceNoMutation = false } = {}) {
    const core = this.core;
    const session = core.db.getSession();
    const confirmed = core.db.getConfirmedView();
    const deviceConnected = core.currentDeviceState() === 'CONNECTED';

    // ---- Offline guard（reading.offline_guard）----
    const guard = offlineGuard({
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
}
