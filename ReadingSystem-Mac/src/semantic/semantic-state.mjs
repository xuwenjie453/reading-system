// semantic-state.mjs — Phase A：SemanticRuntimeState（语义模式解耦）
//
// v2 核心不变量（HostAgent修复运行库 01_全局架构约束/00_HARD_CONSTRAINTS）：
//   FULL 的前置是合格 Semantic Executor，不是 API Key。
//   HEURISTIC 是独立模式，不是 FULL 的静默 fallback。
//   FULL requested + 无合格 executor → WAITING_FOR_EXECUTOR（禁止自动降级）。
//   只有用户显式设置 ALLOW_HEURISTIC 才可回退到 HEURISTIC。
//   状态与执行者/策略全部解耦：requestedMode / effectiveMode / runtimeStatus /
//   activeExecutor / executionPolicy / fallbackPolicy / availability。
import { err } from '../errors.mjs';
import { readJson, atomicWriteJson, nowIso } from '../util.mjs';
import path from 'node:path';

export const SemanticMode = Object.freeze({ HEURISTIC: 'HEURISTIC', FULL: 'FULL' });
export const SemanticExecutorType = Object.freeze({ HOST_AGENT: 'HOST_AGENT', EXTERNAL_API: 'EXTERNAL_API' });
export const SemanticExecutionPolicy = Object.freeze({
  HOST_ONLY: 'HOST_ONLY',
  HOST_PREFERRED: 'HOST_PREFERRED',
  AUTO: 'AUTO',
  EXTERNAL_ONLY: 'EXTERNAL_ONLY',
});
export const FallbackPolicy = Object.freeze({ WAIT_FOR_EXECUTOR: 'WAIT_FOR_EXECUTOR', ALLOW_HEURISTIC: 'ALLOW_HEURISTIC' });
export const RuntimeStatus = Object.freeze({
  READY_HOST: 'READY_HOST',
  READY_EXTERNAL: 'READY_EXTERNAL',
  WAITING_FOR_EXECUTOR: 'WAITING_FOR_EXECUTOR',
  HEURISTIC: 'HEURISTIC',
  DEGRADED: 'DEGRADED',
});

/**
 * Phase A 状态机：
 * - 计算 effectiveMode 与 runtimeStatus，执行者优先序依 executionPolicy：
 *     HOST_ONLY       : host online → HOST_AGENT；否则 Pending
 *     HOST_PREFERRED  : host online → HOST_AGENT；否则 Pending
 *     AUTO            : host online → HOST_AGENT；external active → EXTERNAL_API；否则 Pending
 *     EXTERNAL_ONLY   : external active → EXTERNAL_API；否则 Pending
 * - requestedMode=HEURISTIC → HEURISTIC（独立模式，直行内置执行器）
 * - requestedMode=FULL：
 *     executor 合格 → READY_HOST / READY_EXTERNAL
 *     无合格 executor → WAITING_FOR_EXECUTOR；仅当 fallbackPolicy=ALLOW_HEURISTIC 且
 *     用户显式设置时才落到 HEURISTIC。
 */
export function deriveSemanticState({ requestedMode, executionPolicy, fallbackPolicy, hostAvailable, hostTierA, externalAvailable }) {
  const s = {
    requested_mode: requestedMode,
    effective_mode: requestedMode, // 默认同请求；FULL 无 executor 时仍显式为 FULL（不降级）
    runtime_status: null,
    active_executor: null,
    execution_policy: executionPolicy,
    fallback_policy: fallbackPolicy,
    availability: { host_agent: false, external_api: false },
    note: null,
  };

  const hostOK = hostAvailable && hostTierA;
  s.availability = { host_agent: hostOK, external_api: Boolean(externalAvailable) };

  if (requestedMode === SemanticMode.HEURISTIC) {
    s.runtime_status = RuntimeStatus.HEURISTIC;
    return s;
  }

  // FULL：先按 policy 找执行者
  let executor = null;
  switch (executionPolicy) {
    case SemanticExecutionPolicy.HOST_ONLY:
    case SemanticExecutionPolicy.HOST_PREFERRED:
      if (hostOK) executor = SemanticExecutorType.HOST_AGENT;
      break;
    case SemanticExecutionPolicy.AUTO:
      if (hostOK) executor = SemanticExecutorType.HOST_AGENT;
      else if (externalAvailable) executor = SemanticExecutorType.EXTERNAL_API;
      break;
    case SemanticExecutionPolicy.EXTERNAL_ONLY:
      if (externalAvailable) executor = SemanticExecutorType.EXTERNAL_API;
      break;
    default:
      throw err.validation('BAD_EXECUTION_POLICY', `未知 executionPolicy: ${executionPolicy}`);
  }

  if (executor === SemanticExecutorType.HOST_AGENT) {
    s.runtime_status = RuntimeStatus.READY_HOST;
    s.active_executor = executor;
  } else if (executor === SemanticExecutorType.EXTERNAL_API) {
    s.runtime_status = RuntimeStatus.READY_EXTERNAL;
    s.active_executor = executor;
  } else if (fallbackPolicy === FallbackPolicy.ALLOW_HEURISTIC) {
    // 唯一合法回退路径：用户显式 ALLOW_HEURISTIC
    s.effective_mode = SemanticMode.HEURISTIC;
    s.runtime_status = RuntimeStatus.HEURISTIC;
    s.note = 'FULL 无合格执行者；用户显式 ALLOW_HEURISTIC → HEURISTIC';
  } else {
    // 默认：等待执行者，绝不静默降级
    s.runtime_status = RuntimeStatus.WAITING_FOR_EXECUTOR;
    s.note = hostOK ? null : (executionPolicy === SemanticExecutionPolicy.EXTERNAL_ONLY
      ? 'EXTERNAL_PROVIDER_NOT_CONFIGURED' : 'HOST_NOT_AVAILABLE');
    if (!hostOK && executionPolicy !== SemanticExecutionPolicy.EXTERNAL_ONLY && !externalAvailable
        && executionPolicy === SemanticExecutionPolicy.AUTO) s.note = 'EXTERNAL_PROVIDER_NOT_CONFIGURED';
  }
  return s;
}

/**
 * 持久化 Semantic 配置（模式/策略/回退），位于系统数据 state/semantic-config.json。
 * 这是用户/系统对语义运行方式的唯一配置真源（External 凭证不在此文件）。
 */
export class SemanticConfigStore {
  constructor(config) {
    this.path = path.join(config.stateDir, 'semantic-config.json');
  }

  defaults() {
    return {
      schema_version: 2,
      requested_mode: SemanticMode.HEURISTIC,      // 全新安装默认 HEURISTIC（显式默认，非降级）
      execution_policy: SemanticExecutionPolicy.HOST_ONLY,
      fallback_policy: FallbackPolicy.WAIT_FOR_EXECUTOR,
      external: { enabled: false, base_url: null, model: null, credentials_ref: null },
      updated_at: null,
    };
  }

  load() {
    try {
      const cur = readJson(this.path);
      return { ...this.defaults(), ...cur };
    } catch {
      return this.defaults();
    }
  }

  save(cfg) {
    cfg.updated_at = nowIso();
    atomicWriteJson(this.path, cfg);
    return cfg;
  }
}
