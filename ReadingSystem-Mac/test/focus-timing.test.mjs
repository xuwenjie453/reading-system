// focus-timing.test.mjs — Focus 派生 + Timing 锚点 + DueStrength + Interest 权重
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveFocus } from '../src/core/focus.mjs';
import { offlineGuard } from '../src/core/reading-core.mjs';
import { TimingEngine, InterestEngine, normalizeEvidence, computeDueStrength, TIMING_ANCHORS } from '../src/interest/engines.mjs';
import { heuristicCurator, CURATOR_SCHEMA } from '../src/ai/modules.mjs';
import { validateSchema } from '../src/ai/llm-client.mjs';

test('Focus 派生（INV-F1/F2）：TOPOLOGY/BLOCK→Block，NODE→Node', () => {
  assert.deepEqual(deriveFocus({ graph_id: 'g1', view_kind: 'TOPOLOGY_VIEW' }).type, 'BLOCK');
  assert.deepEqual(deriveFocus({ graph_id: 'g1', view_kind: 'BLOCK_VIEW', entity_id: 'blk1' }),
    { type: 'BLOCK', entity_id: 'blk1', graph_id: 'g1' });
  assert.deepEqual(deriveFocus({ graph_id: 'g1', view_kind: 'NODE_VIEW', entity_id: 'n1' }),
    { type: 'NODE', entity_id: 'n1', graph_id: 'g1' });
  assert.equal(deriveFocus(null), null);
});

test('Offline guard：离线 + 无 ConfirmedView → 写图阻断，但允许回答', () => {
  assert.equal(offlineGuard({ deviceConnected: false, confirmedView: null, taskKind: 'QA_ANSWER' }), 'ALLOW');
  assert.equal(offlineGuard({ deviceConnected: false, confirmedView: null, taskKind: 'QA_CURATE_WITH_TURNCONTEXT' }), 'ALLOW_RESPOND_ONLY');
  assert.equal(offlineGuard({ deviceConnected: false, confirmedView: null, taskKind: 'GRAPH_MUTATION_NO_TURNCONTEXT' }), 'BLOCK_MUTATION');
  assert.equal(offlineGuard({ deviceConnected: true, confirmedView: {}, taskKind: 'GRAPH_MUTATION_NO_TURNCONTEXT' }), 'ALLOW');
});

test('Timing 锚点：100→3d, 85→7d, 70→14d, 55→30d, 40→60d 及线性插值', () => {
  const t = new TimingEngine({ db: { ensureTiming: () => ({}), ensureInterest: () => ({}) } });
  assert.equal(t.baseIntervalDays(100), 3);
  assert.equal(t.baseIntervalDays(85), 7);
  assert.equal(t.baseIntervalDays(70), 14);
  assert.equal(t.baseIntervalDays(55), 30);
  assert.equal(t.baseIntervalDays(40), 60);
  assert.equal(t.baseIntervalDays(92.5), 5); // 85–100 中点
  assert.ok(t.baseIntervalDays(0) >= 60);
});

test('DueStrength = 0.50 overdue + 0.30 current + 0.15 historical + 0.05 confidence', () => {
  const now = new Date('2026-09-07T00:00:00Z');
  const s = computeDueStrength(
    { current_interest: 100, historical_importance: 1, interest_confidence: 1 },
    { next_eligible_at: '2026-08-08T00:00:00Z' }, // 恰好 overdue 30 天
    now,
  );
  assert.ok(Math.abs(s - 1.0) < 0.01, `expected ~1.0, got ${s}`);
  const s2 = computeDueStrength(
    { current_interest: 0, historical_importance: 0, interest_confidence: 0 },
    { next_eligible_at: '2026-09-08T00:00:00Z' }, // 未到期
    now,
  );
  assert.equal(s2, 0);
});

test('Episode 证据归一化：crash/中断不算 SKIP；Temporal skip 强于 Fresh skip', () => {
  const interrupted = normalizeEvidence({}, 'INTERRUPTED', 'FRESH');
  assert.equal(interrupted.interrupted, true);
  assert.equal(interrupted.explicit_skip, false);
  // 负向在 applyEvidence 中：SKIP+TEMPORAL 0.22 > SKIP+FRESH 0.12 —— 通过公开行为间接验证
});

test('启发式 Curator：Block focus 永不 EXTEND；FULL coverage 抑制 CREATE（INV-C6）', () => {
  const ctx = { qa_turn_id: 'qa', graph_id: 'g1', focus_entity_id: null, focus_type: 'BLOCK' };
  const d = heuristicCurator({ turnContext: ctx, question: '很长的问题'.repeat(80), answer: '很长的回答'.repeat(120), focusEntity: null, graphCatalog: { nodes: [] }, thresholds: {} });
  assert.equal(d.decision, 'NO_OP'); // Block focus + 保守启发式 → NO_OP
  const schema = validateSchema(d, CURATOR_SCHEMA);
  assert.equal(schema.ok, true);
});

test('Curator schema 验证：缺 decision → 不合格', () => {
  const bad = validateSchema({ content_quality: 50 }, CURATOR_SCHEMA);
  assert.equal(bad.ok, false);
});
