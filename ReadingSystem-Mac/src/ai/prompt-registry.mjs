// prompt-registry.mjs — Prompt Registry / Snapshot / Profile（dev.mac_prompt_runtime）
// 链路：Prompt Source（提示词迭代库）→ validate/compile/hash → immutable Snapshot → active Profile pointer。
// 规则（tools.prompt_api / INV-A3）：已注册 version immutable；activation 是 profile pointer switch；
// QA/ParseJob 启动时冻结 snapshot id；激活失败保留当前 stable profile；rollback 只切 pointer。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { newId, nowIso, sha256, atomicWriteJson, readJson } from '../util.mjs';
import { err } from '../errors.mjs';

/** 逻辑 Prompt ID → 运行库文件映射（PROMPT_MANIFEST 的实现面） */
export const MODULE_FILES = {
  'runtime.master': '00_启动/00_MASTER_SYSTEM_PROMPT.md',
  'runtime.bootstrap': '00_启动/01_RUNTIME_BOOTSTRAP.md',
  'runtime.task_router': '00_启动/02_TASK_ROUTER.md',
  'runtime.pre_flight': '00_启动/03_PRE_FLIGHT_STATE_CHECK.md',
  'runtime.response_policy': '00_启动/04_USER_VISIBLE_RESPONSE_POLICY.md',
  'runtime.status_narrator': '00_启动/05_SYSTEM_STATUS_NARRATOR.md',
  'runtime.prompt_loader': '00_启动/06_PROMPT_LOADER_POLICY.md',
  'policy.invariants': '01_全局政策/01_GLOBAL_INVARIANTS.md',
  'policy.focus': '01_全局政策/02_AUTHORITY_FOCUS_POLICY.md',
  'policy.write_boundary': '01_全局政策/03_CANONICAL_WRITE_BOUNDARY.md',
  'policy.v1_scope': '01_全局政策/04_V1_SCOPE_GUARD.md',
  'policy.source_trust': '01_全局政策/05_SOURCE_TRUST_AND_INJECTION.md',
  'policy.provenance': '01_全局政策/06_PROVENANCE_AUDIT_POLICY.md',
  'policy.fail_safe': '01_全局政策/07_FAIL_SAFE_POLICY.md',
  'policy.user_intent': '01_全局政策/08_USER_INTENT_PRIORITY.md',
  'context.router': '02_上下文构建/01_CONTEXT_ROUTER.md',
  'context.responder': '02_上下文构建/02_RESPONDER_CONTEXT.md',
  'context.curator': '02_上下文构建/03_CURATOR_CONTEXT.md',
  'context.parser': '02_上下文构建/04_PARSER_CONTEXT.md',
  'context.summary': '02_上下文构建/05_SUMMARY_CONTEXT.md',
  'context.digest': '02_上下文构建/06_CONVERSATION_DIGEST.md',
  'context.budget': '02_上下文构建/07_CONTEXT_BUDGET_RETRIEVAL.md',
  'module.responder': '03_认知模块/01_RESPONDER.md',
  'module.graph_curator': '03_认知模块/02_GRAPH_CURATOR.md',
  'module.segment_writer': '03_认知模块/03_COGNITIVE_SEGMENT_WRITER.md',
  'module.node_title': '03_认知模块/04_NODE_TITLE_GENERATOR.md',
  'module.node_summary': '03_认知模块/05_NODE_ANCHOR_SUMMARY.md',
  'module.block_title': '03_认知模块/06_BLOCK_TITLE_GENERATOR.md',
  'module.block_summary': '03_认知模块/07_BLOCK_ANCHOR_SUMMARY.md',
  'module.curator_explainer': '03_认知模块/08_CURATOR_DECISION_EXPLAINER.md',
  'module.source_guard': '03_认知模块/09_SOURCE_VS_BACKGROUND_GUARD.md',
  'parser.genre': '04_解析模块/01_DOCUMENT_PROFILE_CLASSIFIER.md',
  'parser.structure': '04_解析模块/02_STRUCTURE_RECOVERY_ASSISTANT.md',
  'parser.boundary': '04_解析模块/03_BOUNDARY_SEGMENTER.md',
  'parser.block_reviewer': '04_解析模块/04_BLOCK_QUALITY_REVIEWER.md',
  'parser.semantic_validator': '04_解析模块/05_PARSE_SEMANTIC_VALIDATOR.md',
  'parser.failure_diagnoser': '04_解析模块/06_PARSE_FAILURE_DIAGNOSER.md',
  'reading.nav_intent': '05_阅读控制/01_NAVIGATION_INTENT_PARSER.md',
  'reading.target_resolver': '05_阅读控制/02_TARGET_RESOLVER.md',
  'reading.command_router': '05_阅读控制/03_READING_COMMAND_ROUTER.md',
  'reading.session_policy': '05_阅读控制/04_SESSION_POLICY_INTERPRETER.md',
  'reading.temporal_request': '05_阅读控制/05_TEMPORAL_REQUEST_INTERPRETER.md',
  'reading.offline_guard': '05_阅读控制/06_OFFLINE_FOCUS_GUARD.md',
  'interest.semantic_features': '06_兴趣与时序/01_INTEREST_SEMANTIC_FEATURE_EXTRACTOR.md',
  'interest.evidence_normalizer': '06_兴趣与时序/02_EPISODE_EVIDENCE_NORMALIZER.md',
  'interest.guardrails': '06_兴趣与时序/03_INTEREST_GUARDRAILS.md',
  'interest.scheduler_explainer': '06_兴趣与时序/04_SCHEDULER_DECISION_EXPLAINER.md',
};

/** stable-runtime-v1 Profile（09_Profiles/00_STABLE_RUNTIME_PROFILE.md） */
export const STABLE_PROFILE_MODULES = {
  master: 'runtime.master',
  responder: 'module.responder',
  graph_curator: 'module.graph_curator',
  segment_writer: 'module.segment_writer',
  node_title: 'module.node_title',
  node_summary: 'module.node_summary',
  block_title: 'module.block_title',
  block_summary: 'module.block_summary',
  parser_genre: 'parser.genre',
  parser_boundary: 'parser.boundary',
  parser_block_reviewer: 'parser.block_reviewer',
  parser_semantic_validator: 'parser.semantic_validator',
  navigation_intent: 'reading.nav_intent',
  target_resolver: 'reading.target_resolver',
  interest_semantic_features: 'interest.semantic_features',
  context_policy: 'context.budget',
  policy_set: ['policy.invariants', 'policy.focus', 'policy.write_boundary', 'policy.v1_scope',
    'policy.source_trust', 'policy.provenance', 'policy.fail_safe', 'policy.user_intent'],
};

const PROFILE_ID = 'stable-runtime-v1';

export class PromptRegistry {
  constructor({ config, db, logger }) {
    this.config = config;
    this.db = db;
    this.log = logger;
    this.libraryRoot = config.promptLibraryRoot();
    this.moduleCache = new Map();
  }

  listModules() {
    return Object.entries(MODULE_FILES).map(([id, rel]) => {
      const p = path.join(this.libraryRoot, rel);
      let status = 'MISSING';
      let hash = null;
      if (existsSync(p)) {
        hash = sha256(readFileSync(p));
        status = 'OK';
      }
      return { prompt_id: id, file: rel, status, content_hash: hash };
    });
  }

  /** 按 Prompt ID 精确加载（runtime.prompt_loader：不做全库塞入） */
  loadModule(promptId) {
    if (this.moduleCache.has(promptId)) return this.moduleCache.get(promptId);
    const rel = MODULE_FILES[promptId];
    if (!rel) throw err.notFound('PROMPT_NOT_FOUND', `未知 Prompt ID: ${promptId}`);
    const p = path.join(this.libraryRoot, rel);
    if (!existsSync(p)) throw err.dependency('PROMPT_FILE_MISSING', `运行库文件缺失: ${rel}`, '检查 提示词迭代库 是否完整');
    const content = readFileSync(p, 'utf8');
    const hash = sha256(content);
    const mod = { prompt_id: promptId, file: rel, content, hash };
    this.moduleCache.set(promptId, mod);
    return mod;
  }

  /** 编译当前 profile 为 immutable snapshot（Activation Gate：hash 可生成 + rollback target 存在） */
  compileActiveSnapshot() {
    const modules = {};
    for (const [role, promptId] of Object.entries(STABLE_PROFILE_MODULES)) {
      if (Array.isArray(promptId)) {
        modules[role] = promptId.map((pid) => {
          const m = this.loadModule(pid);
          return { prompt_id: pid, hash: m.hash };
        });
      } else {
        const m = this.loadModule(promptId);
        modules[role] = { prompt_id: promptId, hash: m.hash };
      }
    }
    const snapshot = {
      snapshot_id: newId('snap'),
      profile_id: PROFILE_ID,
      compiled_at: nowIso(),
      library_root: this.libraryRoot,
      modules,
      content_hash: null,
    };
    snapshot.content_hash = sha256(JSON.stringify(modules));
    atomicWriteJson(path.join(this.config.promptSnapshotsDir, `${snapshot.snapshot_id}.json`), snapshot);
    return snapshot;
  }

  getSnapshot(snapshotId) {
    const p = path.join(this.config.promptSnapshotsDir, `${snapshotId}.json`);
    return existsSync(p) ? readJson(p) : null;
  }

  /** 原子切换 active pointer */
  activateSnapshot(snapshotId) {
    const snap = this.getSnapshot(snapshotId);
    if (!snap) throw err.notFound('SNAPSHOT_NOT_FOUND', `snapshot ${snapshotId} 不存在`);
    // Activation Gate 最小集：required modules 存在 + hash 校验 + rollback target 存在
    const prev = this.activeSnapshotId();
    for (const [role, info] of Object.entries(snap.modules)) {
      const ids = Array.isArray(info) ? info.map((x) => x.prompt_id) : [info.prompt_id];
      for (const pid of ids) {
        const m = this.loadModule(pid); // throws if missing
        const hash = Array.isArray(info) ? info.find((x) => x.prompt_id === pid)?.hash : info.hash;
        if (hash && hash !== m.hash) {
          throw err.validation('SNAPSHOT_HASH_MISMATCH', `${role}/${pid} 内容与 snapshot hash 不一致`);
        }
      }
    }
    this.db.setMeta('active_prompt_snapshot', snapshotId);
    this.db.audit('prompt-registry', 'ACTIVATE_PROFILE', 'snapshot', snapshotId, { previous: prev });
    return { activated: snapshotId, previous: prev, rollback_target: prev };
  }

  activeSnapshotId() {
    return this.db.getMeta('active_prompt_snapshot');
  }

  /** 启动时确保存在 active snapshot（首个 boot 自动编译并激活） */
  ensureActiveSnapshot() {
    const current = this.activeSnapshotId();
    if (current && this.getSnapshot(current)) return this.getSnapshot(current);
    const snap = this.compileActiveSnapshot();
    this.activateSnapshot(snap.snapshot_id);
    return snap;
  }

  /** rollback：只切 pointer 到已存在 immutable snapshot；不回滚历史产物 */
  rollback(snapshotId) {
    const snap = this.getSnapshot(snapshotId);
    if (!snap) throw err.notFound('SNAPSHOT_NOT_FOUND', `rollback 目标 ${snapshotId} 不存在`);
    const prev = this.activeSnapshotId();
    this.db.setMeta('active_prompt_snapshot', snapshotId);
    this.db.audit('prompt-registry', 'ROLLBACK_PROFILE', 'snapshot', snapshotId, { previous: prev });
    return { rolled_back_to: snapshotId, previous: prev };
  }

  activeProfileSummary() {
    const id = this.activeSnapshotId();
    if (!id) return { profile_id: PROFILE_ID, snapshot_id: null, status: 'NOT_COMPILED' };
    const snap = this.getSnapshot(id);
    return {
      profile_id: PROFILE_ID,
      snapshot_id: id,
      content_hash: snap?.content_hash,
      compiled_at: snap?.compiled_at,
      module_count: snap ? Object.keys(snap.modules).length : 0,
    };
  }
}
