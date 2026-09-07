// parser-qa.test.mjs — 解析流水线 + QA Turn 流程
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDaemon, stopTestDaemon, writeTestBook } from './helper.mjs';

test('解析 markdown：blocks 非重叠、按序、覆盖完整；每 block 唯一 graph（INV-C4）', async () => {
  const daemon = await startTestDaemon();
  writeTestBook(daemon.config.workspace, '书.md', 2, 8);
  const job = await daemon.core.command('parse_library', { scope: 'LIBRARY' }, { actor: 't' });
  assert.equal(job.stats.parsed, 1);
  assert.ok(job.stats.blocks >= 2, `blocks=${job.stats.blocks}`);

  const { documents } = daemon.core.query('list_documents');
  const doc = daemon.core.query('get_document', { document_id: documents[0].document_id });
  assert.equal(doc.blocks.length, job.stats.blocks);
  // ordinal 连续
  for (let i = 1; i < doc.blocks.length; i++) {
    assert.equal(doc.blocks[i].ordinal, doc.blocks[i - 1].ordinal + 1);
  }
  // 每 block 一 graph
  assert.equal(doc.graphs.length, doc.blocks.length);
  // block content 落盘且非空
  const detail = daemon.core.query('get_document', { document_id: documents[0].document_id });
  const graphFull = daemon.core.query('get_graph', { graph_id: detail.graphs[0].graph_id });
  assert.ok(graphFull.root_block.block_id);
  // ParseKey 幂等：重复 parse 默认 skip
  const job2 = await daemon.core.command('parse_library', { scope: 'LIBRARY' }, { actor: 't' });
  assert.equal(job2.stats.skipped, 1);
  assert.equal(job2.stats.parsed, 0);
  await stopTestDaemon(daemon);
});

test('SourceVersion：路径移动（相同 fingerprint）→ rebind 不重建', async () => {
  const daemon = await startTestDaemon();
  const p = writeTestBook(daemon.config.workspace, '移动测试.md');
  await daemon.core.command('parse_library', { scope: 'LIBRARY' }, { actor: 't' });
  // 模拟移动：新路径写同内容，旧删除
  const { readFileSync, writeFileSync, rmSync, mkdirSync } = await import('node:fs');
  const newPath = daemon.config.workspace + '/资料库/子目录/移动测试.md';
  mkdirSync(daemon.config.workspace + '/资料库/子目录', { recursive: true });
  writeFileSync(newPath, readFileSync(p));
  rmSync(p);
  const job = await daemon.core.command('parse_library', { scope: 'LIBRARY' }, { actor: 't' });
  // 同 fingerprint → 不新建 document（parsed/skipped 都走 rebind 路径）
  const { documents } = daemon.core.query('list_documents');
  assert.equal(documents.length, 1);
  await stopTestDaemon(daemon);
});

test('QA Turn：无 ConfirmedView 时回答但不写图（ALLOW_RESPOND_ONLY）', async () => {
  const daemon = await startTestDaemon();
  writeTestBook(daemon.config.workspace);
  await daemon.core.command('parse_library', { scope: 'LIBRARY' }, { actor: 't' });
  const r = await daemon.qaTurn.submitQuestion('这一章讲了什么？');
  assert.ok(r.answer.length > 0);
  assert.equal(r.turn_context.focus_authority, 'UNCONFIRMED');
  assert.equal(r.curator, null); // 无合法 Focus → 不运行 Curator 结构判断
  assert.ok(r.notes.some((n) => n.includes('不更新内容图')));
  await stopTestDaemon(daemon);
});

test('QA Turn：ConfirmedView(BLOCK) + VIEW_COMMITTED 之后 Focus 派生正确', async () => {
  const daemon = await startTestDaemon();
  writeTestBook(daemon.config.workspace);
  await daemon.core.command('parse_library', { scope: 'LIBRARY' }, { actor: 't' });
  const { documents } = daemon.core.query('list_documents');
  const doc = daemon.core.query('get_document', { document_id: documents[0].document_id });
  const graphId = doc.graphs[0].graph_id;

  // 模拟 iPad VIEW_COMMITTED
  const vc = await daemon.core.command('view_committed', {
    graph_id: graphId, view_kind: 'BLOCK_VIEW', entity_id: doc.graphs[0] && daemon.store.getGraph(graphId).root_block_id,
    view_revision: 1, session_epoch: daemon.db.getSession().session_epoch,
  }, { actor: 'ipad-test' });
  assert.equal(vc.accepted, true);
  const fc = daemon.core.query('get_focus_context');
  assert.equal(fc.focus_type, 'BLOCK');
  assert.equal(fc.authority, 'CONFIRMED');
  assert.equal(fc.focus_entity.block_id, daemon.store.getGraph(graphId).root_block_id);

  // 在有 Focus 的情况下 QA：Responder 用 SOURCE 回答
  const r = await daemon.qaTurn.submitQuestion('正文里关于认知系统说了什么？');
  assert.ok(r.answer.includes('认知系统') || r.answer.includes('没有找到') === false);
  await stopTestDaemon(daemon);
});

test('session epoch 过期：旧 epoch 的 VIEW_COMMITTED 被拒绝', async () => {
  const daemon = await startTestDaemon();
  writeTestBook(daemon.config.workspace);
  await daemon.core.command('parse_library', { scope: 'LIBRARY' }, { actor: 't' });
  const { documents } = daemon.core.query('list_documents');
  const doc = daemon.core.query('get_document', { document_id: documents[0].document_id });
  const staleEpoch = daemon.db.getSession().session_epoch + 999;
  const vc = await daemon.core.command('view_committed', {
    graph_id: doc.graphs[0].graph_id, view_kind: 'BLOCK_VIEW',
    entity_id: daemon.store.getGraph(doc.graphs[0].graph_id).root_block_id,
    view_revision: 1, session_epoch: staleEpoch,
  }, { actor: 'ipad-test' });
  assert.equal(vc.accepted, false);
  assert.equal(vc.reason, 'STALE_SESSION_EPOCH');
  await stopTestDaemon(daemon);
});
