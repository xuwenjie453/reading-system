// daemon.mjs — ReadingDaemon 组装与生命周期（dev.mac_lifecycle）
// 启动顺序：Store → transaction recovery → integrity → schema/migration → core services →
// Bridge → device sync → session reconcile → READY。
import { existsSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Config, machineId } from './config.mjs';
import { bootstrapWorkspace, markCleanShutdown } from './workspace.mjs';
import { CanonicalStore } from './store/canonical-store.mjs';
import { StateDB } from './store/state-db.mjs';
import { GraphService } from './core/graph-service.mjs';
import { ReadingCore } from './core/reading-core.mjs';
import { PromptRegistry } from './ai/prompt-registry.mjs';
import { ContextBuilders } from './ai/context-builders.mjs';
import { AiModules } from './ai/modules.mjs';
import { QaTurnEngine } from './ai/qa-turn.mjs';
import { ParserEnricher } from './ai/parser-enricher.mjs';
import { LlmClient } from './ai/llm-client.mjs';
import { ParserPipeline } from './parser/pipeline.mjs';
import { InterestEngine, TimingEngine, Scheduler } from './interest/engines.mjs';
import { ReadingBridge } from './bridge/bridge-server.mjs';
import { SemanticService } from './semantic/semantic-service.mjs';
import { newId, nowIso } from './util.mjs';

class Logger {
  constructor(logDir) {
    this.logDir = logDir;
    mkdirSync(logDir, { recursive: true });
    this.file = path.join(logDir, `daemon-${new Date().toISOString().slice(0, 10)}.log`);
  }
  write(level, msg) {
    const line = `${nowIso()} [${level}] ${msg}`;
    if (level === 'error') console.error(line);
    else console.log(line);
    try { appendFileSync(this.file, line + '\n'); } catch { /* ignore */ }
  }
  info(m) { this.write('info', m); }
  warn(m) { this.write('warn', m); }
  error(m, e) { this.write('error', e ? `${m} ${e.stack || e}` : m); }
}

export class ReadingDaemon {
  constructor(workspace, opts = {}) {
    this.config = workspace instanceof Config ? workspace : new Config(workspace);
    this.opts = opts;
    this.bootId = `boot_${randomUUID().slice(0, 12)}`;
    this.log = new Logger(this.config.logsDir);
    this.startedAt = null;
  }

  async start({ withBridge = true } = {}) {
    const t0 = Date.now();
    this.log.info(`ReadingDaemon 启动 boot=${this.bootId} workspace=${this.config.workspace}`);
    this.config.systemState = 'STARTING';

    // 1. workspace + manifest
    bootstrapWorkspace(this.config, { bootId: this.bootId });
    this.writePid();

    // 2. Store + recovery + integrity
    this.store = new CanonicalStore(this.config);
    const recovered = this.store.recoverPendingTransactions();
    if (recovered.length) this.log.info(`事务恢复：${JSON.stringify(recovered)}`);
    const integrity = this.store.fastIntegrityCheck();

    // 3. State DB
    this.db = new StateDB(this.config);
    this.db.setMeta('boot_id', this.bootId);
    this.db.setMeta('machine_id', machineId());

    // 4. Semantic Service（v2：模式/执行者解耦；Prompt runtime）
    this.semantic = new SemanticService({ config: this.config, db: this.db, logger: this.log });
    this.llm = this.semantic.externalClient;   // EXTERNAL_API 通道（可用性由 semantic 状态决定）
    this.promptRegistry = new PromptRegistry({ config: this.config, db: this.db, logger: this.log });
    let promptState = 'OK';
    try {
      this.activeSnapshot = this.promptRegistry.ensureActiveSnapshot();
    } catch (e) {
      promptState = `DEGRADED: ${e.message}`;
      this.log.warn(`Prompt snapshot 编译失败：${e.message}`);
    }

    // 5. Engines
    this.interest = new InterestEngine({ db: this.db, logger: this.log });
    this.timing = new TimingEngine({ db: this.db, logger: this.log });
    this.scheduler = new Scheduler({ db: this.db, core: this, timing: this.timing, interest: this.interest, logger: this.log });

    // 6. Core + graph service + parser + AI modules
    this.graphService = new GraphService({ store: this.store, db: this.db, bridge: null });
    this.core = new ReadingCore({
      config: this.config, store: this.store, db: this.db, graphService: this.graphService,
      promptRuntime: this.promptRegistry, parser: null, engines: {
        interest: this.interest, timing: this.timing, scheduler: this.scheduler,
      },
      bridge: null, logger: this.log,
    });
    this.builders = new ContextBuilders({ core: this.core, store: this.store, db: this.db });
    this.modules = new AiModules({ llm: this.llm, registry: this.promptRegistry, builders: this.builders, core: this.core, logger: this.log });
    this.syncSemanticChannel();   // route → modules/enricher.useExternal
    this.qaTurn = new QaTurnEngine({ core: this.core, modules: this.modules, builders: this.builders, db: this.db, llm: this.llm, logger: this.log, semantic: this.semantic });
    this.enricher = new ParserEnricher({ modules: this.modules, builders: this.builders, registry: this.promptRegistry, logger: this.log, semantic: this.semantic });
    // parser 的语义通道与 semantic 状态联动
    this.semantic.enricherSync = () => { this.enricher.useExternal = this.semantic.executionRoute().executor === 'EXTERNAL_API'; };
    this.qaTurn.enricherSync = () => this.semantic.enricherSync();

    // graphInitializer：每 Block 唯一创建初始 ContentGraph
    const graphInitializer = (block) => {
      const graphId = `graph_${block.block_id.replace('blk_', '')}`;
      const existing = this.store.getGraph(graphId);
      if (existing) return existing;
      return this.store.createGraph({ graphId, rootBlockId: block.block_id, documentId: block.document_id });
    };
    this.parser = new ParserPipeline({
      config: this.config, store: this.store, db: this.db,
      enricher: this.enricher, graphInitializer, logger: this.log,
    });
    this.core.parser = this.parser;

    // 7. Bridge
    this.bridge = null;
    if (withBridge) {
      try {
        this.bridge = new ReadingBridge({ config: this.config, core: this.core, store: this.store, db: this.db, logger: this.log });
        await this.bridge.start();
        this.bridge.advertise();
        this.core.bridge = this.bridge;
        this.graphService.bridge = this.bridge;
      } catch (e) {
        this.log.warn(`Bridge 启动失败（无碍 Mac 本机使用）: ${e.message}`);
      }
    }

    // 8. session reconcile + READY
    const session = this.db.getSession();
    if (session.status === 'READING' && session.active_graph_id) {
      // 中断的 Episode 不视为 SKIP：重开为 RETURN
      this.log.info('恢复上次阅读会话（Episode 标记 RETURN 继续）');
    }
    if (!integrity.ok) {
      this.core.degraded.push({ kind: 'CANONICAL', problems: integrity.problems });
      this.core.setSystemState(integrity.problems.length > 3 ? 'SAFE_MODE' : 'DEGRADED');
      this.log.warn(`integrity 问题：${integrity.problems.join('; ')}`);
    } else {
      this.core.setSystemState('READY');
    }
    this.core.capabilities = {
      core_query: true, core_command: true, graph_mutation: this.core.systemState !== 'SAFE_MODE',
      parse: true, bridge: Boolean(this.bridge),
      semantic: this.semantic.overview(),
    };
    this.core.semantic = this.semantic;   // Core API 注册用
    this.core.daemonSync = () => this.syncSemanticChannel();
    this.startedAt = Date.now();
    const sem = this.semantic.state();
    this.log.info(`READY（${Date.now() - t0}ms）。Semantic: ${sem.requested_mode} → ${sem.runtime_status}（executor: ${sem.active_executor ?? 'none'}）；Prompt: ${promptState}`);
    return this;
  }

  writePid() {
    try {
      writeFileSync(path.join(this.config.runtimeDir, 'daemon.pid'), String(process.pid));
      writeFileSync(path.join(this.config.runtimeDir, 'daemon.json'), JSON.stringify({
        pid: process.pid, boot_id: this.bootId, started_at: nowIso(),
        bridge_port: this.config.bridgePort, core_port: this.config.daemonPort,
      }));
    } catch { /* ignore */ }
  }

  async stop() {
    this.log.info('ReadingDaemon 停止');
    this.semantic?.stop?.();
    this.bridge?.stopAdvertise?.();
    await this.bridge?.stop?.();
    this.db?.close();
    markCleanShutdown(this.config, this.bootId);
    try { existsSync(path.join(this.config.runtimeDir, 'daemon.pid')) && (await import('node:fs')).rmSync(path.join(this.config.runtimeDir, 'daemon.pid')); } catch { /* ignore */ }
  }

  /** 按 semantic 执行路由同步外部执行通道（EXTERNAL_API → useExternal=true） */
  syncSemanticChannel() {
    const route = this.semantic?.executionRoute?.();
    const useExternal = route?.executor === 'EXTERNAL_API';
    if (this.modules) this.modules.useExternal = useExternal;
    if (this.enricher) { this.enricher.useExternal = useExternal; this.enricher.syncChannel?.(); }
  }

  /** 生成一次性配对码 */
  createPairing(deviceId, deviceName) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    this.db.upsertDevice({ device_id: deviceId, name: deviceName, pairing_code: code, trusted: false });
    this.db.audit('cli', 'CREATE_PAIRING', 'device', deviceId, {});
    return { device_id: deviceId, pairing_code: code, note: '在 iPad 端输入此 6 位配对码' };
  }
}
