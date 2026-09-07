// config.mjs — 工作区布局与运行配置
// Canonical 布局（设计稿 02_MacBook端系统/02_CanonicalStore）：
//   阅读系统/
//     资料库/          用户控制：原始文件
//     提示词迭代库/     用户控制：Prompt source packages
//     系统数据/         系统控制：Canonical Store + State + Derived + Runtime
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const DEFAULT_WORKSPACE = '/Users/xuwenjie/Documents/阅读系统';

export class Config {
  constructor(workspace) {
    this.workspace = workspace;
    this.materialsDir = path.join(workspace, '资料库');
    this.promptLibraryDir = path.join(workspace, '提示词迭代库');
    this.systemDataDir = path.join(workspace, '系统数据');

    const sd = this.systemDataDir;
    this.storeDir = path.join(sd, 'store');
    this.documentsDir = path.join(this.storeDir, 'documents');
    this.graphsDir = path.join(this.storeDir, 'graphs');
    this.annotationsDir = path.join(this.storeDir, 'annotations');
    this.promptSnapshotsDir = path.join(this.storeDir, 'prompt-snapshots');
    this.stateDir = path.join(sd, 'state');
    this.indexesDir = path.join(sd, 'indexes');
    this.syncDir = path.join(sd, 'sync');
    this.decisionsDir = path.join(sd, 'decisions');
    this.logsDir = path.join(sd, 'logs');
    this.migrationsDir = path.join(sd, 'migrations');
    this.recoveryDir = path.join(sd, 'recovery');
    this.runtimeDir = path.join(sd, 'runtime');
    this.parseJobsDir = path.join(this.runtimeDir, 'parse-jobs');
    this.manifestPath = path.join(sd, 'manifest.json');
    this.stateDbPath = path.join(this.stateDir, 'reading-state.db');
    this.journalDir = path.join(sd, 'journals');

    this.configPath = path.join(workspace, 'readingsystem.config.json');
    this.daemonSocketPath = path.join(this.runtimeDir, 'reading-core.sock');
    this.daemonPort = 8731; // loopback HTTP for Reading Core API（本机 AI/CLI 使用）
    this.bridgePort = 8732; // WebSocket for iPad（Reading Bridge protocol）
    this.serviceName = 'ReadingSystem';
    this.serviceType = '_readingsystem._tcp';
    this.libraryRootId = 'library-root'; // Library Graph 固定 id
  }

  loadUserConfig() {
    if (!existsSync(this.configPath)) return {};
    try {
      return JSON.parse(readFileSync(this.configPath, 'utf8'));
    } catch (e) {
      return {};
    }
  }

  static discover(explicit) {
    let ws = explicit || process.env.READINGSYSTEM_WORKSPACE || null;
    if (!ws) {
      // 从当前目录向上查找包含 系统数据 或 资料库 的工作区
      let dir = process.cwd();
      for (let i = 0; i < 6; i++) {
        if (
          existsSync(path.join(dir, '资料库')) ||
          existsSync(path.join(dir, '系统数据', 'manifest.json'))
        ) {
          ws = dir;
          break;
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    }
    return new Config(ws || DEFAULT_WORKSPACE);
  }

  llmConfig() {
    const user = this.loadUserConfig();
    const env = process.env;
    const baseUrl =
      user?.llm?.baseUrl || env.READINGSYSTEM_LLM_BASE_URL || env.ZHIPU_BASE_URL ||
      'https://open.bigmodel.cn/api/paas/v4';
    const apiKey = user?.llm?.apiKey || env.READINGSYSTEM_LLM_API_KEY || env.ZHIPU_API_KEY || '';
    const model = user?.llm?.model || env.READINGSYSTEM_LLM_MODEL || 'glm-4-flash';
    return { baseUrl, apiKey, model, enabled: Boolean(apiKey) };
  }

  promptLibraryRoot() {
    // 运行库 v1 固定子目录；若用户替换了库，允许 config 覆盖
    const user = this.loadUserConfig();
    return user?.promptLibrary?.root || path.join(this.promptLibraryDir, '阅读系统_AI提示词运行库_v1');
  }
}

export function machineId() {
  return os.hostname().replaceAll('.', '-') + '-' + os.userInfo().username;
}
