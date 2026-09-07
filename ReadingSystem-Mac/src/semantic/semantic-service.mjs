// semantic-service.mjs — Semantic 运行服务：状态 + Host 注册 + Work Broker + External
// 这是 daemon 语义层的统一门面；qa-turn / parser / core API 都通过它取模式并分派。
// v2 不变量：FULL ≠ API Key；HEURISTIC 独立；无 executor → WAITING（除非用户 ALLOW_HEURISTIC）。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { SemanticConfigStore, deriveSemanticState, SemanticMode, RuntimeStatus } from './semantic-state.mjs';
import { HostRegistry } from './host-registry.mjs';
import { WorkBroker } from './work-broker.mjs';
import { CredentialsStore } from './credentials.mjs';
import { LlmClient } from '../ai/llm-client.mjs';
import { err } from '../errors.mjs';

export class SemanticService {
  constructor({ config, db, logger, llmFactory }) {
    this.config = config;
    this.db = db;
    this.log = logger;
    this.configStore = new SemanticConfigStore(config);
    this.credentials = new CredentialsStore({ logger });
    this.hosts = new HostRegistry({ db, logger });
    this.broker = new WorkBroker({ db, logger });
    this.settings = this.migrateLegacyConfig();   // Phase E：旧 llm 配置迁移（幂等）
    this.externalClient = llmFactory
      ? llmFactory(this.settings.external)
      : this.buildExternalClient();
    this.resultAppliers = {}; // work_type → async (work, session) => void 由装配方注册
    this._state = null;
    this.recomputeState();
    this.heartbeatTimer = setInterval(() => this.tick(), 15_000);
    this.heartbeatTimer.unref?.();
  }

  // ================= Phase E：config migration =================
  /** 幂等迁移旧 llm 配置 → semantic 配置；key 移入 Keychain；绝不自动启用外部计费 */
  migrateLegacyConfig() {
    const store = this.configStore;
    let cfg = store.load();
    const legacy = this.config.loadUserConfig().llm;
    if (!legacy || typeof legacy !== 'object') return cfg; // 无旧配置：保持默认

    const alreadyMigrated = cfg.updated_at && cfg.schema_version === 2;
    if (alreadyMigrated && !cfg._migrated_from) return cfg;

    const oldKey = legacy.apiKey || process.env.READINGSYSTEM_LLM_API_KEY || '';
    const hadExplicitKey = Boolean(oldKey && oldKey.length > 8);

    cfg = { ...store.defaults(), ...cfg };
    if (hadExplicitKey) {
      // 过去明确配置过 external（v1 llm.apiKey=启用标志）→ 迁移凭证（inactive 存储），
      // external.enabled 仅当 key 成功入 Keychain 才置 true；否则保持 inactive（NoSurpriseBilling）。
      const res = this.credentials.save(oldKey, { source: 'config-migration' });
      cfg.external = {
        enabled: res.ok,
        base_url: legacy.baseUrl || null,
        model: legacy.model || null,
        credentials_ref: res.ok ? 'keychain:cn.readingsystem.external' : null,
      };
      cfg.requested_mode = SemanticMode.FULL;   // 旧行为=用户要完整语义 → FULL
      cfg.execution_policy = res.ok ? 'AUTO' : 'HOST_ONLY'; // 旧直连启用过 → AUTO；凭证失败不自动启用
      cfg.fallback_policy = 'WAIT_FOR_EXECUTOR';
      cfg._migrated_from = 'v1.llm';
      cfg._migration_note = res.ok ? null : '旧 Key 迁移失败，external 保持未激活（不产生任何外部调用）';
    } else if (legacy.baseUrl || legacy.model) {
      // 配置过 provider 但没有可用 key → HOST_ONLY + configured inactive（验收 H 用例）
      cfg.requested_mode = SemanticMode.FULL;
      cfg.execution_policy = 'HOST_ONLY';
      cfg.external = { enabled: false, base_url: legacy.baseUrl || null, model: legacy.model || null, credentials_ref: null };
      cfg._migrated_from = 'v1.llm';
    }
    // 旧启发式（无 llm 段或空）→ 保持 HEURISTIC（不改动）
    store.save(cfg);
    // 从普通 config 移除 apiKey（secret 不落普通文件）
    this.stripLegacyKeyFromConfig();
    return cfg;
  }

  stripLegacyKeyFromConfig() {
    const userCfgPath = this.config.configPath;
    if (!existsSync(userCfgPath)) return;
    try {
      const raw = JSON.parse(readFileSync(userCfgPath, 'utf8'));
      let changed = false;
      if (raw.llm) {
        for (const k of ['apiKey', 'baseUrl', 'model']) {
          if (raw.llm[k] !== undefined) { delete raw.llm[k]; changed = true; }
        }
        if (Object.keys(raw.llm).length === 0) { delete raw.llm; changed = true; } // 段清空后整体移除
      }
      if (changed) {
        // 备份一次后写回
        const backup = `${userCfgPath}.bak-v2`;
        if (!existsSync(backup)) writeFileSync(backup, readFileSync(userCfgPath));
        writeFileSync(userCfgPath, JSON.stringify(raw, null, 2) + '\n');
        this.log?.info?.(`已从 readingsystem.config.json 移除旧 llm.apiKey（备份: readingsystem.config.json.bak-v2）`);
      }
    } catch (e) {
      this.log?.warn?.(`config 清理失败：${e.message}`);
    }
  }

  buildExternalClient() {
    const { base_url, model } = this.settings.external;
    const cred = this.credentials.load();
    return new LlmClient({
      baseUrl: base_url,
      model: model,
      apiKey: cred?.key || '',
      enabled: Boolean(this.settings.external.enabled && cred),
      logger: this.log,
    });
  }

  // ================= 状态机 =================
  recomputeState() {
    const s = this.settings;
    this._state = deriveSemanticState({
      requestedMode: s.requested_mode,
      executionPolicy: s.execution_policy,
      fallbackPolicy: s.fallback_policy,
      hostAvailable: this.hosts.anyHost(),
      hostTierA: this.hosts.hasTierAHost(),
      externalAvailable: this.externalClient.enabled,
    });
    return this._state;
  }

  state() { return this.recomputeState(); }

  setMode({ mode, execution_policy, fallback_policy }) {
    const s = this.settings;
    if (mode && ![SemanticMode.FULL, SemanticMode.HEURISTIC].includes(mode)) {
      throw err.validation('BAD_MODE', `mode 必须是 FULL|HEURISTIC`);
    }
    if (execution_policy) {
      if (!['HOST_ONLY', 'HOST_PREFERRED', 'AUTO', 'EXTERNAL_ONLY'].includes(execution_policy)) {
        throw err.validation('BAD_EXECUTION_POLICY', `execution_policy 非法`);
      }
    }
    if (fallback_policy && !['WAIT_FOR_EXECUTOR', 'ALLOW_HEURISTIC'].includes(fallback_policy)) {
      throw err.validation('BAD_FALLBACK_POLICY', `fallback_policy 必须是 WAIT_FOR_EXECUTOR|ALLOW_HEURISTIC`);
    }
    if (mode) s.requested_mode = mode;
    if (execution_policy) s.execution_policy = execution_policy;
    if (fallback_policy) s.fallback_policy = fallback_policy;
    this.configStore.save(s);
    this.recomputeState();
    this.db.audit('semantic', 'SET_SEMANTIC_POLICY', null, null, { mode: s.requested_mode, policy: s.execution_policy });
    return this.state();
  }

  setExternalEnabled({ enabled }) {
    const cred = this.credentials.load();
    const s = this.settings;
    if (enabled && !cred) {
      throw err.dependency('EXTERNAL_PROVIDER_NOT_CONFIGURED', 'External 未配置凭证（Keychain）', '先通过 semantic external configure 保存凭证');
    }
    s.external.enabled = Boolean(enabled);
    this.configStore.save(s);
    this.externalClient = this.buildExternalClient(); // 重建（availability 变化）
    this.recomputeState();
    return this.state();
  }

  /** External provider availability（供 Prompt 使用；绝不包含 key） */
  providerAvailability() {
    const s = this.settings;
    return {
      external_provider_status: this.externalClient.enabled ? 'CONFIGURED' : 'NOT_CONFIGURED',
      model: s.external.model,
    };
  }

  // ================= 执行者判断（供 qa-turn/parser 分派）=================
  /** 返回 { mode: HEURISTIC|FULL, executor: HOST_AGENT|EXTERNAL_API|null, status } */
  executionRoute() {
    const st = this.state();
    if (st.runtime_status === RuntimeStatus.READY_HOST) {
      return { mode: SemanticMode.FULL, executor: 'HOST_AGENT', status: st.runtime_status };
    }
    if (st.runtime_status === RuntimeStatus.READY_EXTERNAL) {
      return { mode: SemanticMode.FULL, executor: 'EXTERNAL_API', status: st.runtime_status };
    }
    if (st.runtime_status === RuntimeStatus.HEURISTIC) {
      return { mode: SemanticMode.HEURISTIC, executor: null, status: st.runtime_status };
    }
    return { mode: st.requested_mode, executor: null, status: st.runtime_status };
  }

  // ================= 心跳/租期维护 =================
  tick() {
    this.hosts.reapStale();
    this.broker.reapExpiredLeases();
    // Host 会话消失 → interactive work 回 PENDING（已有 CLAIMED 释放逻辑在 onHostDisconnect）
    for (const sid of [...new Set(this.broker.works.values().map((w) => w.claimed_by).filter(Boolean))]) {
      if (!this.hosts.sessions.has(sid)) {
        this.broker.onHostDisconnect(sid);
      }
    }
    this.recomputeState();
  }

  stop() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
  }

  /** 汇总视图（get_semantic_state 输出） */
  overview() {
    const st = this.state();
    return {
      semantic_mode: st.requested_mode,
      effective_mode: st.effective_mode,
      runtime_status: st.runtime_status,
      active_executor: st.active_executor,
      execution_policy: st.execution_policy,
      fallback_policy: st.fallback_policy,
      availability: st.availability,
      note: st.note,
      hosts: this.hosts.listSessions().map((h) => ({ session_id: h.agent_session_id, host_key: h.host_key, tier: h.tier, family: h.host_family, last_seen_at: h.last_seen_at })),
      works: this.broker.stats(),
      external: { configured: this.settings.external.enabled, model: this.settings.external.model },
    };
  }
}
