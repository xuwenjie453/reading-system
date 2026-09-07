// graph.test.mjs — Graph 不变量与 CREATE/EXTEND 事务
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDaemon, stopTestDaemon, writeTestBook } from './helper.mjs';

async function setupWithGraph() {
  const daemon = await startTestDaemon();
  const bookPath = writeTestBook(daemon.config.workspace);
  await daemon.core.command('parse_library', { scope: 'LIBRARY' }, { actor: 'test' });
  const { documents } = daemon.core.query('list_documents');
  assert.equal(documents.length, 1);
  const doc = daemon.core.query('get_document', { document_id: documents[0].document_id });
  return { daemon, doc, bookPath };
}

function ctxForBlock(daemon, graphId, qaId) {
  return {
    qa_turn_id: qaId,
    graph_id: graphId,
    focus_entity_id: null,
    focus_type: 'BLOCK',
    basis_view_revision: 1,
    session_epoch: daemon.db.getSession().session_epoch,
    focus_authority: 'CONFIRMED',
  };
}

test('CREATE：Block focus 下创建 depth1 节点，revision +1，block 与 graph 一一对应', async () => {
  const { daemon, doc } = await setupWithGraph();
  const graphId = doc.graphs[0].graph_id;
  const graph = daemon.store.getGraph(graphId);
  const q1 = 'qa-test-1';
  const res = await daemon.core.command('create_node', {
    graph_id: graphId,
    parent_entity: { type: 'BLOCK', id: graph.root_block_id },
    title: '概念11的定义边界',
    anchor_summary: '围绕概念11的定义与例子展开的讨论。',
    first_segment: '用户询问概念11的含义。结合原文，概念11指……',
    turn_context: ctxForBlock(daemon, graphId, q1),
    curator_decision: { content_quality: 62, decision: 'CREATE' },
    expected_revision: graph.graph_revision,
    idempotency_key: `idem-${q1}`,
  }, { actor: 'test' });
  assert.equal(res.ok, true);
  assert.equal(res.depth, 1);

  const after = daemon.store.getGraph(graphId);
  assert.equal(after.graph_revision, graph.graph_revision + 1);
  assert.ok(after.nodes[res.node_id]);
  assert.equal(daemon.store.getNode(graphId, res.node_id).segment_count, 1);
  await stopTestDaemon(daemon);
});

test('幂等：同 idempotency key 重试返回原结果，不产生重复节点（失败 Golden Case #1）', async () => {
  const { daemon, doc } = await setupWithGraph();
  const graphId = doc.graphs[0].graph_id;
  const graph = daemon.store.getGraph(graphId);
  const cmd = {
    graph_id: graphId,
    parent_entity: { type: 'BLOCK', id: graph.root_block_id },
    title: '幂等测试节点',
    anchor_summary: '摘要。',
    first_segment: '第一个分段。',
    turn_context: ctxForBlock(daemon, graphId, 'qa-idem'),
    curator_decision: { content_quality: 70, decision: 'CREATE' },
    expected_revision: graph.graph_revision,
    idempotency_key: 'idem-fixed-key',
  };
  const first = await daemon.core.command('create_node', cmd, { actor: 'test' });
  // 重放（模拟 commit 响应丢失后重试）
  const second = await daemon.core.command('create_node', cmd, { actor: 'test' });
  assert.equal(second.node_id, first.node_id);
  assert.equal(second.idempotent_replay, true);
  const after = daemon.store.getGraph(graphId);
  assert.equal(Object.keys(after.nodes).length, 1); // 只有一个节点
  await stopTestDaemon(daemon);
});

test('EXTEND：只追加新 segment，旧 segment 不变；EXTEND 不产生导航', async () => {
  const { daemon, doc } = await setupWithGraph();
  const graphId = doc.graphs[0].graph_id;
  const graph = daemon.store.getGraph(graphId);
  const created = await daemon.core.command('create_node', {
    graph_id: graphId,
    parent_entity: { type: 'BLOCK', id: graph.root_block_id },
    title: 'EXTEND 目标节点',
    anchor_summary: '初始摘要。',
    first_segment: 'SEG-ONE 原文内容。',
    turn_context: ctxForBlock(daemon, graphId, 'qa-e1'),
    curator_decision: { content_quality: 65, decision: 'CREATE' },
    expected_revision: graph.graph_revision,
    idempotency_key: 'idem-e1',
  }, { actor: 'test' });

  // 冻结在 NODE focus 的 TurnContext
  const ctx = {
    qa_turn_id: 'qa-e2',
    graph_id: graphId,
    focus_entity_id: created.node_id,
    focus_type: 'NODE',
    basis_view_revision: 2,
    session_epoch: daemon.db.getSession().session_epoch,
    focus_authority: 'CONFIRMED',
  };
  const before = daemon.store.getSegment(graphId, created.node_id, 1);
  const res = await daemon.core.command('extend_node', {
    graph_id: graphId,
    node_id: created.node_id,
    new_segment: 'SEG-TWO 追加内容。',
    new_anchor_summary: '更新后的摘要。',
    turn_context: ctx,
    expected_revision: daemon.store.getGraph(graphId).graph_revision,
    idempotency_key: 'idem-e2',
  }, { actor: 'test' });
  assert.equal(res.ok, true);
  assert.equal(res.appended_segment_ordinal, 2);
  assert.equal(daemon.store.getSegment(graphId, created.node_id, 1), before); // 旧 segment immutable
  assert.equal(daemon.store.getNode(graphId, created.node_id).anchor_summary, '更新后的摘要。');
  await stopTestDaemon(daemon);
});

test('DEPTH_GATE：depth2 需要 Q>=68；不足则拒绝', async () => {
  const { daemon, doc } = await setupWithGraph();
  const graphId = doc.graphs[0].graph_id;
  const graph = daemon.store.getGraph(graphId);
  const n1 = await daemon.core.command('create_node', {
    graph_id: graphId,
    parent_entity: { type: 'BLOCK', id: graph.root_block_id },
    title: '一级节点', anchor_summary: '摘要', first_segment: '段',
    turn_context: ctxForBlock(daemon, graphId, 'qa-d1'),
    curator_decision: { content_quality: 61, decision: 'CREATE' },
    expected_revision: graph.graph_revision,
    idempotency_key: 'idem-d1',
  }, { actor: 'test' });

  const g2 = daemon.store.getGraph(graphId);
  const ctxNode = {
    qa_turn_id: 'qa-d2', graph_id: graphId, focus_entity_id: n1.node_id, focus_type: 'NODE',
    basis_view_revision: 2, session_epoch: daemon.db.getSession().session_epoch, focus_authority: 'CONFIRMED',
  };
  await assert.rejects(() => daemon.core.command('create_node', {
    graph_id: graphId,
    parent_entity: { type: 'NODE', id: n1.node_id },
    title: '二级但质量不足', anchor_summary: '摘要', first_segment: '段',
    turn_context: ctxNode,
    curator_decision: { content_quality: 60, decision: 'CREATE' }, // 需要 68
    expected_revision: g2.graph_revision,
    idempotency_key: 'idem-d2',
  }, { actor: 'test' }), (e) => e.code === 'DEPTH_GATE_FAILED');

  // Q=68 应通过
  const g3 = daemon.store.getGraph(graphId);
  const okRes = await daemon.core.command('create_node', {
    graph_id: graphId,
    parent_entity: { type: 'NODE', id: n1.node_id },
    title: '合格的二级节点', anchor_summary: '摘要', first_segment: '段',
    turn_context: ctxNode,
    curator_decision: { content_quality: 68, decision: 'CREATE' },
    expected_revision: g3.graph_revision,
    idempotency_key: 'idem-d2b',
  }, { actor: 'test' });
  assert.equal(okRes.depth, 2);
  await stopTestDaemon(daemon);
});

test('一轮 QA 最多一个结构动作（INV-C3）', async () => {
  const { daemon, doc } = await setupWithGraph();
  const graphId = doc.graphs[0].graph_id;
  const graph = daemon.store.getGraph(graphId);
  daemon.core.command('create_node', {
    graph_id: graphId,
    parent_entity: { type: 'BLOCK', id: graph.root_block_id },
    title: '第一动作', anchor_summary: '摘要', first_segment: '段',
    turn_context: ctxForBlock(daemon, graphId, 'qa-one'),
    curator_decision: { content_quality: 61, decision: 'CREATE' },
    expected_revision: graph.graph_revision,
    idempotency_key: 'idem-one',
  }, { actor: 'test' });
  // 同一 qa_turn 再来一个 CREATE → 应拒绝
  const g2 = daemon.store.getGraph(graphId);
  await assert.rejects(() => daemon.core.command('create_node', {
    graph_id: graphId,
    parent_entity: { type: 'BLOCK', id: g2.root_block_id },
    title: '第二动作', anchor_summary: '摘要', first_segment: '段',
    turn_context: ctxForBlock(daemon, graphId, 'qa-one'),
    curator_decision: { content_quality: 61, decision: 'CREATE' },
    expected_revision: g2.graph_revision,
    idempotency_key: 'idem-two',
  }, { actor: 'test' }), (e) => e.code === 'ONE_ACTION_PER_TURN');
  await stopTestDaemon(daemon);
});

test('REVISION_MISMATCH：expected revision 不匹配时拒绝且不盲写', async () => {
  const { daemon, doc } = await setupWithGraph();
  const graphId = doc.graphs[0].graph_id;
  await assert.rejects(() => daemon.core.command('create_node', {
    graph_id: graphId,
    parent_entity: { type: 'BLOCK', id: daemon.store.getGraph(graphId).root_block_id },
    title: '过期修订', anchor_summary: '摘要', first_segment: '段',
    turn_context: ctxForBlock(daemon, graphId, 'qa-stale'),
    curator_decision: { content_quality: 61, decision: 'CREATE' },
    expected_revision: 9999,
    idempotency_key: 'idem-stale',
  }, { actor: 'test' }), (e) => e.code === 'REVISION_MISMATCH');
  await stopTestDaemon(daemon);
});

test('EXTEND 目标必须是 frozen focus Node；Block focus 拒绝 EXTEND（Block immutable）', async () => {
  const { daemon, doc } = await setupWithGraph();
  const graphId = doc.graphs[0].graph_id;
  const graph = daemon.store.getGraph(graphId);
  const n1 = await daemon.core.command('create_node', {
    graph_id: graphId,
    parent_entity: { type: 'BLOCK', id: graph.root_block_id },
    title: '目标', anchor_summary: '摘要', first_segment: '段',
    turn_context: ctxForBlock(daemon, graphId, 'qa-x1'),
    curator_decision: { content_quality: 61, decision: 'CREATE' },
    expected_revision: graph.graph_revision,
    idempotency_key: 'idem-x1',
  }, { actor: 'test' });
  // focus 是 BLOCK 却想 EXTEND node → 拒绝
  const g2 = daemon.store.getGraph(graphId);
  await assert.rejects(() => daemon.core.command('extend_node', {
    graph_id: graphId, node_id: n1.node_id,
    new_segment: 'x', turn_context: ctxForBlock(daemon, graphId, 'qa-x2'),
    expected_revision: g2.graph_revision, idempotency_key: 'idem-x2',
  }, { actor: 'test' }), (e) => e.code === 'TARGET_NOT_FROZEN_FOCUS');
  await stopTestDaemon(daemon);
});

test('journal 恢复：CREATE 中断（graph.json 未更新）→ 孤儿节点文件回滚', async () => {
  const { daemon, doc } = await setupWithGraph();
  const graphId = doc.graphs[0].graph_id;
  // 手工制造一个 PENDING journal + 孤儿 node 文件，不更新 graph.json
  const txId = 'tx-crash-test';
  daemon.store.journalPending(txId, 'CREATE_NODE', {
    graphId, nodeId: 'node_orphan', expected_new_revision: 99, qa_turn_id: 'qa-crash',
  });
  daemon.store.writeNode(graphId, { node_id: 'node_orphan', segment_count: 0 });
  const results = daemon.store.recoverPendingTransactions();
  const r = results.find((x) => x.tx_id === txId);
  assert.equal(r.action, 'ROLLED_BACK');
  assert.equal(daemon.store.getNode(graphId, 'node_orphan'), null);
  await stopTestDaemon(daemon);
});
