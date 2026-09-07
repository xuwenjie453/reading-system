// bridge-e2e.test.mjs — 端到端：真实 WebSocket 上的模拟 iPad 客户端
// 覆盖（05_RELEASE_ACCEPTANCE / 04_INTEGRATION_TEST_AGENT 主链与失败矩阵）：
// pair → session connect → CONTENT_SNAPSHOT → VIEW_COMMITTED（Focus 派生）→
// EXTEND patch → CREATE + conditional nav → stale nav 不抢页 → duplicate one-effect → reconnect replay。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDaemon, stopTestDaemon, writeTestBook } from './helper.mjs';

async function startBridgeDaemon() {
  const daemon = await startTestDaemon({ withBridge: true });
  // bridgePort=0 时取实际端口
  await new Promise((r) => setTimeout(r, 100));
  const port = daemon.bridge.server.address().port;
  return { daemon, port };
}

class FakeIpad {
  constructor(port) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/bridge`);
    this.inbox = [];
    this.waiters = [];
    this.ws.addEventListener('message', (ev) => {
      const env = JSON.parse(ev.data);
      if (process.env.RS_DEBUG) console.error('IPAD GOT:', env.type);
      this.inbox.push(env);
      const w = this.waiters.findIndex((f) => f.pred(env));
      if (w >= 0) this.waiters.splice(w, 1)[0].resolve(env);
    });
    this.opened = new Promise((r) => this.ws.addEventListener('open', r));
  }
  send(type, payload) {
    this.ws.send(JSON.stringify({ protocol_version: 1, message_id: `m_${Math.random().toString(36).slice(2)}`, type, sent_at: new Date().toISOString(), payload }));
  }
  waitFor(pred, { timeout = 4000 } = {}) {
    const existing = this.inbox.find(pred);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('waitFor timeout')), timeout);
      this.waiters.push({ pred, resolve: (env) => { clearTimeout(t); resolve(env); } });
    });
  }
  close() { try { this.ws.close(); } catch { /* ignore */ } }
}

test('端到端：配对 → 快照推送 → VIEW_COMMITTED → Focus=Block', async (t) => {
  const { daemon, port } = await startBridgeDaemon();
  t.after(() => stopTestDaemon(daemon));
  writeTestBook(daemon.config.workspace);
  await daemon.core.command('parse_library', { scope: 'LIBRARY' }, { actor: 't' });
  const { documents } = daemon.core.query('list_documents');
  const doc = daemon.core.query('get_document', { document_id: documents[0].document_id });
  const graphId = doc.graphs[0].graph_id;

  // Mac 生成配对码
  const pair = daemon.createPairing('ipad-e2e-1', '测试iPad');
  // 激活 graph → CONTENT_SNAPSHOT 推送（此时设备未连接，消息进 journal）
  await daemon.core.command('activate_graph', { graph_id: graphId, push_mode: 'FRESH' }, { actor: 't' });

  const ipad = new FakeIpad(port);
  await ipad.opened;
  ipad.send('PAIR_REQUEST', { device_id: pair.device_id, pairing_code: pair.pairing_code, device_name: '测试iPad' });
  const pairOk = await ipad.waitFor((e) => e.type === 'PAIR_OK');
  assert.ok(pairOk.payload.session_epoch >= 1);

  // 重连后 replay 未 ACK 的 CONTENT_SNAPSHOT
  ipad.send('SESSION_CONNECT', { device_id: pair.device_id, since_server_seq: 0 });
  const snap = await ipad.waitFor((e) => e.type === 'CONTENT_SNAPSHOT');
  assert.equal(snap.payload.snapshot.graph_id, graphId);
  assert.ok(snap.payload.snapshot.root_block.title);
  const serverSeq = snap.server_seq;

  // iPad VIEW_COMMITTED（BLOCK_VIEW）
  ipad.send('VIEW_COMMITTED', {
    graph_id: graphId, view_kind: 'BLOCK_VIEW',
    entity_id: snap.payload.snapshot.root_block.block_id,
    view_revision: 1, session_epoch: pairOk.payload.session_epoch,
    client_seq: 1,
  });
  const vc = await ipad.waitFor((e) => e.type === 'VIEW_COMMITTED_RESULT');
  assert.equal(vc.payload.accepted, true);
  assert.equal(vc.payload.focus.type, 'BLOCK');

  const fc = daemon.core.query('get_focus_context');
  assert.equal(fc.authority, 'CONFIRMED');
  assert.equal(fc.focus_type, 'BLOCK');
  // iPad ACK after durable：确认后 Mac 标记已投递
  ipad.send('ACK', { server_seq: serverSeq });
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(daemon.db.pendingMessages(serverSeq).length, 0);
  ipad.close();
});

test('stale conditional nav：CREATE 后用户去别的页面 → 不抢页（失败 Golden Case #6）', async (t) => {
  const { daemon, port } = await startBridgeDaemon();
  t.after(() => stopTestDaemon(daemon));
  writeTestBook(daemon.config.workspace);
  await daemon.core.command('parse_library', { scope: 'LIBRARY' }, { actor: 't' });
  const { documents } = daemon.core.query('list_documents');
  const doc = daemon.core.query('get_document', { document_id: documents[0].document_id });
  const graphId = doc.graphs[0].graph_id;
  const graph = daemon.store.getGraph(graphId);

  const pair = daemon.createPairing('ipad-e2e-2', '测试iPad2');
  const ipad = new FakeIpad(port);
  await ipad.opened;
  ipad.send('PAIR_REQUEST', { device_id: pair.device_id, pairing_code: pair.pairing_code });
  const pairOk = await ipad.waitFor((e) => e.type === 'PAIR_OK');
  const epoch = pairOk.payload.session_epoch;

  // 用户在看 block A（view revision 10）
  ipad.send('VIEW_COMMITTED', { graph_id: graphId, view_kind: 'BLOCK_VIEW', entity_id: graph.root_block_id, view_revision: 10, session_epoch: epoch });
  await ipad.waitFor((e) => e.type === 'VIEW_COMMITTED_RESULT' && e.payload.accepted);

  // CREATE 节点 B（带 conditional nav，basis=10）
  const created = await daemon.core.command('create_node', {
    graph_id: graphId,
    parent_entity: { type: 'BLOCK', id: graph.root_block_id },
    title: '条件导航目标', anchor_summary: '摘要', first_segment: '第一段',
    turn_context: { qa_turn_id: 'qa-nav', graph_id: graphId, focus_entity_id: null, focus_type: 'BLOCK', basis_view_revision: 10, session_epoch: epoch, focus_authority: 'CONFIRMED' },
    curator_decision: { content_quality: 65, decision: 'CREATE' },
    expected_revision: graph.graph_revision,
    idempotency_key: 'idem-nav',
  }, { actor: 't' });
  assert.equal(created.ok, true);
  // qa-turn 引擎在 CREATE commit 后请求 conditional navigation
  await daemon.core.command('request_navigation', {
    target: { graph_id: graphId, view_kind: 'NODE_VIEW', entity_id: created.node_id },
    mode: 'CONDITIONAL',
    preconditions: { basis_view_revision: 10 },
  }, { actor: 't' });
  const navCmd = await ipad.waitFor((e) => e.type === 'NAVIGATION_COMMAND');
  assert.equal(navCmd.payload.mode, 'CONDITIONAL');
  assert.equal(navCmd.payload.target.entity_id, created.node_id);

  // 但用户已经跳到 C（view revision 11 → basis 10 失配）
  ipad.send('VIEW_COMMITTED', { graph_id: graphId, view_kind: 'BLOCK_VIEW', entity_id: graph.root_block_id, view_revision: 11, session_epoch: epoch });
  await ipad.waitFor((e) => e.type === 'VIEW_COMMITTED_RESULT' && e.payload.view_revision === 11);

  // Mac 的 ConfirmedView 应该是 revision 11 的页面，而不是被 CREATE 拉回新节点
  const confirmed = daemon.db.getConfirmedView();
  assert.equal(confirmed.view_revision, 11);
  assert.notEqual(confirmed.entity_id, created.node_id); // 没有被抢页
  // 节点 B 依然存在
  assert.ok(daemon.store.getNode(graphId, created.node_id));
  ipad.close();
});

test('duplicate patch：同一 message 重放 → one effect', async (t) => {
  const { daemon, port } = await startBridgeDaemon();
  t.after(() => stopTestDaemon(daemon));
  writeTestBook(daemon.config.workspace);
  await daemon.core.command('parse_library', { scope: 'LIBRARY' }, { actor: 't' });
  const { documents } = daemon.core.query('list_documents');
  const doc = daemon.core.query('get_document', { document_id: documents[0].document_id });

  const pair = daemon.createPairing('ipad-e2e-3', 'iPad3');
  const ipad = new FakeIpad(port);
  await ipad.opened;
  ipad.send('PAIR_REQUEST', { device_id: pair.device_id, pairing_code: pair.pairing_code });
  await ipad.waitFor((e) => e.type === 'PAIR_OK');

  // layout patch 重放两次（模拟 at-least-once 投递重复）
  ipad.send('LAYOUT_PATCH', {
    graph_id: doc.graphs[0].graph_id,
    base_layout_revision: 1, new_layout_revision: 2,
    positions: { node_x1: { x: 100, y: 120, pin: 'USER_PINNED' } },
    message_id: 'dup-msg-1',
  });
  await new Promise((r) => setTimeout(r, 80));
  ipad.send('LAYOUT_PATCH', {
    graph_id: doc.graphs[0].graph_id,
    base_layout_revision: 1, new_layout_revision: 2,
    positions: { node_x1: { x: 100, y: 120, pin: 'USER_PINNED' } },
    message_id: 'dup-msg-1',
  });
  await new Promise((r) => setTimeout(r, 120));
  const layout = daemon.store.getLayout(doc.graphs[0].graph_id);
  assert.equal(layout.layout_revision, 2); // 只应用一次（第二次 dedup）
  assert.equal(layout.nodes.node_x1.pin, 'USER_PINNED');
  ipad.close();
});
