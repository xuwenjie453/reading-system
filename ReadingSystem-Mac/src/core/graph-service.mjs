// graph-service.mjs — Graph mutation：CREATE / EXTEND 的确定性事务执行
// 职责（tools.graph_api / INV-C1..C6 / 02_EXTEND_WORKFLOW / 03_CREATE_WORKFLOW）：
//   Core 重新验证 parent/focus/depth/revision/one-action/append-only；
//   AI 不得要求 delete/merge/reparent；CREATE 原子 commit；EXTEND 后不导航。
import { newId, nowIso, sha256 } from '../util.mjs';
import { err } from '../errors.mjs';
import { deriveFocus } from './focus.mjs';

/** CREATE depth gate（parser 无关，module.graph_curator 数值；Core 强制执行） */
export const DEPTH_GATE = { 1: 60, 2: 68, 3: 76, 4: 85, 5: 94 };

export class GraphService {
  constructor({ store, db, bridge }) {
    this.store = store;
    this.db = db;
    this.bridge = bridge; // 可为 null（离线/测试）；用于发 GraphPatch 与 conditional nav
  }

  /**
   * create_node — 至少需要（tools.graph_api）：
   * graph_id、frozen parent id/type、title、anchor_summary、first_segment、
   * qa_turn/TurnContext、curator decision、expected revision、idempotency key、provenance
   */
  createNode(cmd) {
    const {
      graph_id, parent_entity, title, anchor_summary, first_segment,
      turn_context, curator_decision, expected_revision, idempotency_key, provenance,
    } = cmd;

    // --- 幂等（08_TOOL_FAILURE_HANDLING：重试复用 idempotency key 返回原结果） ---
    const prior = this.db.getIdempotentResult(idempotency_key);
    if (prior) return { ...prior.result, idempotent_replay: true };

    // --- Preflight（03_PRE_FLIGHT_STATE_CHECK 八项） ---
    this.checkSystemWriteReady();
    if (!graph_id || !parent_entity) throw err.validation('MISSING_TARGET', '缺少 graph_id 或 parent');
    const graph = this.store.getGraph(graph_id);
    if (!graph) throw err.notFound('GRAPH_NOT_FOUND', `graph ${graph_id} 不存在`);
    if (graph.graph_revision !== expected_revision) {
      throw err.conflict('REVISION_MISMATCH',
        `expected revision ${expected_revision}, actual ${graph.graph_revision}`,
        'REVALIDATE_WITH_SNAPSHOT');
    }
    if (!turn_context || !turn_context.qa_turn_id) {
      throw err.policy('NO_FROZEN_TURN_CONTEXT', 'CREATE 需要 frozen TurnContext');
    }
    // parent 必须等于 frozen focus（03_GRAPH_CURATOR 禁止项）
    if (turn_context.focus_type === 'NODE') {
      if (parent_entity.type !== 'NODE' || parent_entity.id !== turn_context.focus_entity_id) {
        throw err.policy('PARENT_NOT_FROZEN_FOCUS', 'CREATE parent 必须是 frozen TurnContext focus');
      }
    } else if (turn_context.focus_type === 'BLOCK') {
      if (parent_entity.type !== 'BLOCK') {
        throw err.policy('PARENT_NOT_FROZEN_FOCUS', 'Block focus 下 CREATE 的 parent 是 root Block');
      }
    } else {
      throw err.policy('FOCUS_UNCONFIRMED', '无合法 Focus authority', 'RESPOND_WITHOUT_GRAPH_MUTATION');
    }
    // 一轮 QA 最多一个结构动作（INV-C3，Core 级强制：turn_mutations 是 Core 自己的真源）
    const turnMutation = this.db.getTurnMutation(turn_context.qa_turn_id);
    if (turnMutation) {
      throw err.policy('ONE_ACTION_PER_TURN', `qa_turn ${turn_context.qa_turn_id} 已执行过 ${turnMutation.action}`);
    }
    // depth gate（内容质量门槛由 Curator 给出；Core 强制下限）
    const parentDepth = parent_entity.type === 'BLOCK' ? 0 : graph.nodes[parent_entity.id]?.depth;
    if (parentDepth == null) throw err.notFound('PARENT_NOT_FOUND', 'parent 不存在或已删除');
    const newDepth = parentDepth + 1;
    if (newDepth > 5) throw err.policy('DEPTH_LIMIT', 'depth > 5 禁止 CREATE');
    const q = curator_decision?.content_quality ?? 0;
    if (q < (DEPTH_GATE[newDepth] ?? Infinity)) {
      throw err.policy('DEPTH_GATE_FAILED', `depth ${newDepth} 需要 content_quality >= ${DEPTH_GATE[newDepth]}`);
    }
    if (!title || !anchor_summary || !first_segment) {
      throw err.validation('MISSING_CONTENT', 'CREATE 需要 title/anchor_summary/first_segment');
    }

    // --- 原子事务 ---
    const nodeId = newId('node');
    const newRevision = graph.graph_revision + 1;
    const txId = newId('tx');
    this.store.journalPending(txId, 'CREATE_NODE', {
      graphId: graph_id, nodeId, expected_new_revision: newRevision,
      qa_turn_id: turn_context.qa_turn_id,
    });

    const node = {
      node_id: nodeId, graph_id, parent_id: parent_entity.type === 'NODE' ? parent_entity.id : null,
      parent_type: parent_entity.type, depth: newDepth,
      title, anchor_summary, complexity: curator_decision?.node_complexity ?? null,
      segment_count: 0, // appendSegment 会写入 segment 1 并置为 1
      created_at: nowIso(), created_by_turn: turn_context.qa_turn_id,
    };
    this.store.writeNode(graph_id, node);
    this.store.appendSegment(graph_id, nodeId, first_segment);

    graph.nodes[nodeId] = { parent_id: node.parent_id, depth: newDepth, created_at: node.created_at };
    graph.edges.push({
      child_node_id: nodeId, parent_id: node.parent_id, parent_type: parent_entity.type,
      created_at: nowIso(), created_by_turn: turn_context.qa_turn_id,
    });
    graph.graph_revision = newRevision;
    this.store.writeGraph(graph); // 最后写 graph.json = commit marker
    this.store.journalCommit(txId);

    const result = {
      ok: true, node_id: nodeId, graph_id, depth: newDepth, new_revision: newRevision,
      tx_id: txId, title, committed_at: nowIso(),
    };
    this.db.putIdempotentResult(idempotency_key, 'create_node', result);
    this.db.recordTurnMutation(turn_context.qa_turn_id, 'CREATE', nodeId);
    this.db.completeQaTurn(turn_context.qa_turn_id, { decision: 'CREATE' });
    this.db.audit('core.graph', 'CREATE_NODE', 'node', nodeId, {
      graph_id, depth: newDepth, qa_turn_id: turn_context.qa_turn_id, provenance,
    });
    this.afterMutation(graph, { type: 'NODE_CREATED', node_id: nodeId, title, depth: newDepth });
    return result;
  }

  /**
   * extend_node — 至少需要：graph_id、node_id=frozen focus、new_segment、
   * new_anchor_summary、TurnContext、expected revision、idempotency/provenance
   */
  extendNode(cmd) {
    const {
      graph_id, node_id, new_segment, new_anchor_summary,
      turn_context, expected_revision, idempotency_key, provenance,
    } = cmd;

    const prior = this.db.getIdempotentResult(idempotency_key);
    if (prior) return { ...prior.result, idempotent_replay: true };

    this.checkSystemWriteReady();
    const graph = this.store.getGraph(graph_id);
    if (!graph) throw err.notFound('GRAPH_NOT_FOUND', `graph ${graph_id} 不存在`);
    if (graph.graph_revision !== expected_revision) {
      throw err.conflict('REVISION_MISMATCH',
        `expected revision ${expected_revision}, actual ${graph.graph_revision}`,
        'REVALIDATE_WITH_SNAPSHOT');
    }
    if (!turn_context?.qa_turn_id) throw err.policy('NO_FROZEN_TURN_CONTEXT', 'EXTEND 需要 frozen TurnContext');
    // target 必须是 Node 且 = frozen focus（Block immutable：绝不 EXTEND Block）
    const info = graph.nodes[node_id];
    if (!info) throw err.notFound('NODE_NOT_FOUND', `node ${node_id} 不存在`);
    if (turn_context.focus_type !== 'NODE' || turn_context.focus_entity_id !== node_id) {
      throw err.policy('TARGET_NOT_FROZEN_FOCUS', 'EXTEND target 必须是 frozen TurnContext focus Node');
    }
    const existing = this.db.getDecisionByTurn(turn_context.qa_turn_id);
    if (existing && existing.decision !== 'NO_OP') {
      throw err.policy('ONE_ACTION_PER_TURN', `qa_turn ${turn_context.qa_turn_id} 已执行过 ${existing.decision}`);
    }
    const turnMutation = this.db.getTurnMutation(turn_context.qa_turn_id);
    if (turnMutation) {
      throw err.policy('ONE_ACTION_PER_TURN', `qa_turn ${turn_context.qa_turn_id} 已执行过 ${turnMutation.action}`);
    }
    if (!new_segment) throw err.validation('MISSING_SEGMENT', 'EXTEND 缺少 new_segment');

    const node = this.store.getNode(graph_id, node_id);
    const txId = newId('tx');
    this.store.journalPending(txId, 'EXTEND_NODE', {
      graphId: graph_id, nodeId: node_id, expected_new_revision: graph.graph_revision + 1,
      prev_segment_count: node.segment_count, prev_anchor_summary: node.anchor_summary,
      qa_turn_id: turn_context.qa_turn_id,
    });

    const ordinal = this.store.appendSegment(graph_id, node_id, new_segment);
    node.anchor_summary = new_anchor_summary ?? node.anchor_summary; // Summary 更新，不改旧 Segment
    this.store.writeNode(graph_id, node);

    graph.graph_revision += 1;
    this.store.writeGraph(graph);
    this.store.journalCommit(txId);

    const result = {
      ok: true, node_id, graph_id, appended_segment_ordinal: ordinal,
      new_revision: graph.graph_revision, tx_id: txId, committed_at: nowIso(),
    };
    this.db.putIdempotentResult(idempotency_key, 'extend_node', result);
    this.db.recordTurnMutation(turn_context.qa_turn_id, 'EXTEND', node_id);
    this.db.completeQaTurn(turn_context.qa_turn_id, { decision: 'EXTEND' });
    this.db.audit('core.graph', 'EXTEND_NODE', 'node', node_id, {
      graph_id, segment_ordinal: ordinal, qa_turn_id: turn_context.qa_turn_id, provenance,
    });
    this.afterMutation(graph, { type: 'NODE_EXTENDED', node_id, segment_ordinal: ordinal });
    // EXTEND 不导航（INV：EXTEND 只 append；无任何 NavigationCommand）
    return result;
  }

  /** commit 后广播 GraphPatch（at-least-once；durable before emit：journal 已 COMMITTED 才发） */
  afterMutation(graph, event) {
    if (!this.bridge) return;
    try {
      this.bridge.broadcastGraphPatch(graph, event);
    } catch {
      // derived/sync 失败不回滚 canonical commit
    }
  }

  checkSystemWriteReady() {
    const state = this.systemState || 'READY';
    if (state === 'SAFE_MODE') {
      throw err.policy('SAFE_MODE', '安全模式下禁止 Graph mutation', 'READ_ONLY');
    }
    if (state === 'RECOVERING' || state === 'MIGRATING') {
      throw err.policy('SYSTEM_NOT_READY', `系统处于 ${state}，暂不接受写命令`, 'RETRY_LATER');
    }
  }
}
