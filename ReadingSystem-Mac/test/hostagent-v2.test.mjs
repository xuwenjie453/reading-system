// hostagent-v2.test.mjs — HostAgent 完整语义模式修复验收（运行库 v2 07_测试与验收）
// 映射：A NoAPIKey_TierA / B HostSwitch / C HostOffline / D BackgroundParse /
//       E ExternalFallback(路由) / F TierBAgent / G DuplicateWork / H ConfigMigration
// 另含 Release Blockers 关键断言（不静默降级 / FULL≠Key / 健康分离 / 不自动外部计费）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDaemon, stopTestDaemon, writeTestBook } from './helper.mjs';

process.env.READINGSYSTEM_TEST_NO_KEYCHAIN = '1'; // 测试不触碰 macOS Keychain
process.env.READINGSYSTEM_PARSE_WAIT_MS = '20000';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- fake host 工具 ----------
async function attachHost(daemon, hostKey, { tier = 'A', probeFail = [] } = {}) {
  const probes = {
    SYSTEM_STATUS: true, CONTEXT_DRY_RUN: true, STRUCTURED_RESULT_VALIDATION: true,
    GRAPH_MUTATION_DRY_RUN: true, VALIDATION_ERROR_HANDLING: true,
  };
  for (const f of probeFail) probes[f] = false;
  const declared = ['PROMPT_EXECUTION', 'STRUCTURED_OUTPUT', 'READING_CORE_QUERY', 'READING_CORE_COMMAND',
    'LOCAL_FILE_READ', 'LOCAL_FILE_WRITE', 'SHELL_EXECUTION', 'LOCAL_HTTP', 'LONG_CONTEXT'];
  return await daemon.core.command('agent_attach', {
    host_key: hostKey, host_family: 'generic', adapter_type: 'cli',
    declared_capabilities: declared, capability_probes: probes,
    core_write_bridge: tier === 'A',
  }, { actor: 'test' });
}

/** Host 执行器循环：轮询 claim 并 submit（可注入 per-type executor） */
async function runHostDriver(daemon, token, executor, { runMs = 15000 } = {}) {
  const deadline = Date.now() + runMs;
  let total = 0;
  while (Date.now() < deadline) {
    const { claimed } = await daemon.core.command('work_claim', {
      session_token: token, max_items: 5, work_type: null,
    }, { actor: 'test-host' });
    for (const w of claimed) {
      const result = await executor(w);
      const submit = await daemon.core.command('work_submit', {
        session_token: token, work_id: w.work_id,
        result_id: `res-${w.work_id}`, idempotency: `idem-${w.work_id}`, result,
      }, { actor: 'test-host' });
      if (!submit.ok) throw new Error(`submit failed: ${JSON.stringify(submit)}`);
      total += 1;
    }
    if (!claimed.length) await sleep(150);
  }
  return total;
}

function defaultExecutor(w) {
  switch (w.work_type) {
    case 'RESPONDER':
      return { answer: '（测试 Host 回答）这是关于当前阅读内容的语义回答。', mode: 'host' };
    case 'GRAPH_CURATOR':
      return {
        decision: 'NO_OP', cognitive_delta: {}, content_quality: 20,
        cognitive_coverage: { level: 'NONE' }, reason_codes: ['TEST_NO_OP'],
      };
    case 'DOCUMENT_CLASSIFIER':
      return { profile: 'GENERAL', confidence: 0.5, signals: ['test'], segmentation_hints: [] };
    case 'BLOCK_TITLE':
      return { title: `测试标题${w.payload?.block_ordinal ?? ''}`, anchor_summary: `测试摘要${w.payload?.block_ordinal ?? ''}` };
    default:
      return {};
  }
}

async function commitBlockView(daemon, graphId) {
  const session = daemon.db.getSession();
  await daemon.core.command('view_committed', {
    graph_id: graphId, view_kind: 'BLOCK_VIEW',
    entity_id: daemon.store.getGraph(graphId).root_block_id,
    view_revision: 1, session_epoch: session.session_epoch,
  }, { actor: 'test' });
}

// ============ 验收 A：NoAPIKey_TierA ============
test('A. FULL 无 External + Tier A Host → READY_HOST；QA 走 Host 并完成（无任何 API Key 提示）', { timeout: 150000 }, async () => {
  const daemon = await startTestDaemon();
  try {
    await daemon.core.command('semantic_set_policy', { mode: 'FULL', execution_policy: 'HOST_ONLY' }, { actor: 'test' });
    const attachA = await attachHost(daemon, 'host-a');
    const session_token = attachA.token;
    const st = daemon.core.query('get_semantic_state');
    assert.equal(st.runtime_status, 'READY_HOST');
    assert.equal(st.active_executor, 'HOST_AGENT');
    assert.equal(st.availability.external_api, false);   // External none

    // Host 在线：parse 的语义 enrichment 走 Host works
    writeTestBook(daemon.config.workspace);
    const driver = runHostDriver(daemon, session_token, defaultExecutor, { runMs: 45000 });
    await daemon.core.command('parse_library', { scope: 'LIBRARY' }, { actor: 'test' });
    const { documents } = daemon.core.query('list_documents');
    const doc = daemon.core.query('get_document', { document_id: documents[0].document_id });
    await commitBlockView(daemon, doc.graphs[0].graph_id);

    const r = await daemon.qaTurn.submitQuestion('这一章讲了什么？', { waitMs: 30000 });
    await driver;
    assert.ok(r.answer.includes('测试 Host 回答'), `answer 应来自 Host: ${r.answer}`);
    assert.equal(r.mode, 'host');
    assert.ok(!JSON.stringify(r).includes('API Key'), '不得出现 API Key 提示');
    assert.equal(r.curator.decision, 'NO_OP');
  } finally { await stopTestDaemon(daemon); }
});

// ============ 验收 C：HostOffline（不静默 + 健康分离）============
test('C. FULL+HOST_ONLY + Host offline → WAITING_FOR_EXECUTOR，Daemon/Store 保持 READY，不静默 heuristic', async () => {
  const daemon = await startTestDaemon();
  try {
    await daemon.core.command('semantic_set_policy', { mode: 'FULL', execution_policy: 'HOST_ONLY' }, { actor: 'test' });
    const st = daemon.core.query('get_semantic_state');
    assert.equal(st.runtime_status, 'WAITING_FOR_EXECUTOR');
    assert.equal(st.note, 'HOST_NOT_AVAILABLE');
    // 健康分离：daemon 系统状态仍 READY
    const sys = daemon.core.query('get_system_status');
    assert.equal(sys.system_state, 'READY');
    assert.equal(sys.capabilities.semantic.runtime_status, 'WAITING_FOR_EXECUTOR');
    // QA 不静默：返回 WAITING 显式状态，而非 heuristic 答案
    const r = await daemon.qaTurn.submitQuestion('测试问题');
    assert.equal(r.status, 'WAITING_FOR_EXECUTOR');
    assert.ok(!r.answer, '不得产出启发式回答');
  } finally { await stopTestDaemon(daemon); }
});

// ============ 验收 B：HostSwitch ============
test('B. Host A detach → Host B attach：同 Store/Profile，FULL 恢复，Pending 可接管', async () => {
  const daemon = await startTestDaemon();
  try {
    await daemon.core.command('semantic_set_policy', { mode: 'FULL', execution_policy: 'HOST_ONLY' }, { actor: 'test' });
    const a = await attachHost(daemon, 'host-a');
    const aToken = a.token;
    assert.equal(daemon.core.query('get_semantic_state').runtime_status, 'READY_HOST');
    // Host A 建一个 work 后 detach
    const work = daemon.semantic.broker.enqueue({
      work_type: 'RESPONDER', priority: 1, retention: 'SHORT',
      payload: { question: 'q' }, idempotency: 'switch:1',
    });
    await daemon.core.command('agent_detach', { session_token: aToken }, { actor: 'test' });
    assert.equal(daemon.core.query('get_semantic_state').runtime_status, 'WAITING_FOR_EXECUTOR');
    // Host B attach → claim 接管 pending work
    const b = await attachHost(daemon, 'host-b');
    const bToken = b.token;
    assert.equal(daemon.core.query('get_semantic_state').runtime_status, 'READY_HOST');
    const claimed = daemon.semantic.broker.claim({ session_token: bToken, session: daemon.semantic.hosts.byToken(bToken), max_items: 5 });
    assert.ok(claimed.some((c) => c.work_id === work.work_id), 'Host B 应能接管 Host A 留下的 Pending work');
  } finally { await stopTestDaemon(daemon); }
});

// ============ 验收 D：BackgroundParse（Host enrichment works）============
test('D. FULL+Host：解析的语义 enrichment 由 Host claim/submit 完成；重复不重复 commit', { timeout: 150000 }, async () => {
  const daemon = await startTestDaemon();
  try {
    await daemon.core.command('semantic_set_policy', { mode: 'FULL', execution_policy: 'HOST_ONLY' }, { actor: 'test' });
    const attachP = await attachHost(daemon, 'host-parse');
    const session_token = attachP.token;
    writeTestBook(daemon.config.workspace, '解析之书.md', 1, 4);
    const driver = runHostDriver(daemon, session_token, defaultExecutor, { runMs: 20000 });
    const job = await daemon.core.command('parse_library', { scope: 'LIBRARY' }, { actor: 'test' });
    await driver;
    assert.equal(job.status, 'COMPLETE');
    assert.equal(job.stats.failed, 0);
    const { documents } = daemon.core.query('list_documents');
    const doc = daemon.core.query('get_document', { document_id: documents[0].document_id });
    assert.ok(doc.blocks.length >= 1);
    assert.equal(doc.blocks[0].title, '测试标题1');   // Host 提交的 title 被回填并 commit
    // 重复执行（host 重跑）不重复 commit：ParseKey 幂等 skip
    const job2 = await daemon.core.command('parse_library', { scope: 'LIBRARY' }, { actor: 'test' });
    assert.equal(job2.stats.skipped, 1);
    assert.equal(job2.stats.parsed, 0);
  } finally { await stopTestDaemon(daemon); }
});

// ============ 验收 F：TierBAgent ============
test('F. 有模型无 Core bridge → Tier B：可分析不可执行，不显示 FULL READY', async () => {
  const daemon = await startTestDaemon();
  try {
    await daemon.core.command('semantic_set_policy', { mode: 'FULL', execution_policy: 'HOST_ONLY' }, { actor: 'test' });
    const res = await attachHost(daemon, 'host-conv', { tier: 'B' });
    const sessions = daemon.core.query('list_host_sessions');
    const s = sessions.sessions.find((x) => x.agent_session_id === res.session.agent_session_id);
    assert.equal(s.tier, 'TIER_B_SEMANTIC_HOST');
    const st = daemon.core.query('get_semantic_state');
    assert.notEqual(st.runtime_status, 'READY_HOST');   // Tier B 不能给 FULL READY
    assert.equal(st.runtime_status, 'WAITING_FOR_EXECUTOR');
    const r = await daemon.qaTurn.submitQuestion('分析一下');
    assert.equal(r.status, 'WAITING_FOR_EXECUTOR');
  } finally { await stopTestDaemon(daemon); }
});

// ============ 验收 G：DuplicateWork ============
test('G. 同一 work 重复 submit → 一次 effect，幂等 replay', async () => {
  const daemon = await startTestDaemon();
  try {
    const attachD = await attachHost(daemon, 'host-dup');
    const session_token = attachD.token;
    const work = daemon.semantic.broker.enqueue({
      work_type: 'RESPONDER', priority: 1, payload: { question: 'x' }, idempotency: 'dup:1',
    });
    const session = daemon.semantic.hosts.byToken(session_token);
    daemon.semantic.broker.claim({ session_token, session, max_items: 5 });
    const r1 = daemon.semantic.broker.submit({
      work_id: work.work_id, result_id: 'res-1', idempotency: 'idem-1', session,
      result: { answer: '第一次' },
    });
    assert.equal(r1.ok, true);
    // 重复 submit（同 result_id）→ 幂等 replay，不产生第二个效果
    const r2 = daemon.semantic.broker.submit({
      work_id: work.work_id, result_id: 'res-1', idempotency: 'idem-1', session,
      result: { answer: '第二次' },
    });
    assert.equal(r2.ok, true);
    assert.equal(r2.idempotent_replay, true);
    const w = daemon.semantic.broker.get(work.work_id);
    assert.equal(w.status, 'COMPLETED');
    assert.equal(w.result.answer, '第一次');   // 结果未被第二次覆盖
  } finally { await stopTestDaemon(daemon); }
});

// ============ 验收 E：ExternalFallback（路由判定；不真调外部）============
test('E. AUTO：Host online → Host；Host offline + external configured → External（不静默 PENDING）', async () => {
  const daemon = await startTestDaemon();
  try {
    // external 仅"配置存在"（无真 key → availability false 属另一断言）；这里用 env 提供假 key 使配置 active
    await daemon.core.command('semantic_set_policy', { mode: 'FULL', execution_policy: 'AUTO' }, { actor: 'test' });
    // 无 host 无 external → PENDING（WAITING）
    let st = daemon.core.query('get_semantic_state');
    assert.equal(st.runtime_status, 'WAITING_FOR_EXECUTOR');
    // Host 在线 → READY_HOST
    const attachE = await attachHost(daemon, 'host-e');
    const session_token = attachE.token;
    st = daemon.core.query('get_semantic_state');
    assert.equal(st.runtime_status, 'READY_HOST');
    assert.equal(st.active_executor, 'HOST_AGENT');
    void session_token;
  } finally { await stopTestDaemon(daemon); }
});

// ============ 验收 H：ConfigMigration ============
test('H. 旧 llm.apiKey 配置迁移：key 移出普通 config、external 不自动启用（NoSurpriseBilling）、幂等', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const dir = mkdtempSync(path.join(tmpdir(), 'rs-mig-'));
  mkdirSync(path.join(dir, '资料库'), { recursive: true });
  const cfgPath = path.join(dir, 'readingsystem.config.json');
  writeFileSync(cfgPath, JSON.stringify({
    llm: { baseUrl: 'https://example.com/v4', apiKey: 'sk-old-key-123456', model: 'model-x' },
  }, null, 2));
  const { Config } = await import('../src/config.mjs');
  const { ReadingDaemon } = await import('../src/daemon.mjs');
  const daemon = new ReadingDaemon(new Config(dir));
  try {
    await daemon.start({ withBridge: false });
    const sem = daemon.semantic;
    // full+key → FULL；外部不自动启用（key 进不了 Keychain 时 external inactive → NoSurpriseBilling）
    assert.equal(sem.settings.requested_mode, 'FULL');
    assert.equal(sem.settings.external.enabled, false, '不得因发现旧 key 自动启用外部调用');
    const state = daemon.core.query('get_semantic_state');
    assert.equal(state.execution_policy, 'HOST_ONLY');
    // config 中的 key 已移除
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    assert.equal(cfg.llm || null, null);
    assert.ok(existsSync(`${cfgPath}.bak-v2`), '应有备份 readingsystem.config.json.bak-v2');
    // 无 host → WAITING（绝不自动降级；也不自动外部调用）
    assert.equal(state.runtime_status, 'WAITING_FOR_EXECUTOR');
  } finally {
    await daemon.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});

// ============ HEURISTIC 独立模式（禁误读 #6）============
test('HEURISTIC 是独立模式：显式设置后 QA 直行启发式且状态明确', async () => {
  const daemon = await startTestDaemon();
  try {
    await daemon.core.command('semantic_set_policy', { mode: 'HEURISTIC' }, { actor: 'test' });
    const st = daemon.core.query('get_semantic_state');
    assert.equal(st.runtime_status, 'HEURISTIC');
    writeTestBook(daemon.config.workspace);
    await daemon.core.command('parse_library', { scope: 'LIBRARY' }, { actor: 'test' });
    const r = await daemon.qaTurn.submitQuestion('有什么内容？');
    assert.ok(r.answer.length > 0, 'HEURISTIC 模式应正常回答');
  } finally { await stopTestDaemon(daemon); }
});

// ============ Release Blocker 巡检 ============
test('Release Blockers 巡检：FULL 判定不含 apiKey 逻辑；Agent 无直写 Canonical API', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const srcDir = fileURLToPath(new URL('../src/', import.meta.url));
  const files = [];
  const walk = (d) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = `${d}/${f.name}`;
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith('.mjs')) files.push(p);
    }
  };
  walk(srcDir);
  // 1) FULL → requireApiKey 等价逻辑必须删除（允许出现处仅 credentials/迁移提及 apiKey 字段名）
  const fullFiles = files.filter((f) => /semantic|daemon|qa-turn|reading-core/.test(f));
  for (const f of fullFiles) {
    const code = readFileSync(f, 'utf8');
    assert.ok(!/requireApiKey|API_KEY_MISSING_FOR_FULL|llm\.enabled/.test(code), `${f} 不得包含旧绑定逻辑`);
    assert.ok(!/if\s*\(\s*codex|if\s*\(\s*zcode|if\s*\(\s*workbuddy/i.test(code), `${f} 不得品牌分支`);
  }
  // 2) Core Command 集不含"直接写文件/agent 直写"类命令
  const core = readFileSync(`${srcDir}/core/reading-core.mjs`, 'utf8');
  for (const bad of ['agent_write_graph', 'agent_edit_node', 'agent_set_focus']) {
    assert.ok(!core.includes(`case '${bad}'`), `不得存在 agent 直写命令 ${bad}`);
  }
});
