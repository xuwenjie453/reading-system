// credentials.mjs — Phase E：External 凭证（Keychain/secret store only）
// 规则（06_PhaseE/03_Credentials.md）：
//   - Keychain/secret store only；不进 Prompt、不进普通 config、不进 log。
//   - Prompt 只看 provider availability。
// 环境变量仅作为测试/无 Keychain 环境的显式注入（不落盘）。
import { execFileSync } from 'node:child_process';

const SERVICE = 'cn.readingsystem.external';
const ACCOUNT = 'external-api-key';
const ENV_KEYS = ['READINGSYSTEM_EXTERNAL_API_KEY', 'READINGSYSTEM_LLM_API_KEY', 'ZHIPU_API_KEY'];

export class CredentialsStore {
  constructor({ logger, keychain } = {}) {
    this.log = logger;
    // 默认使用 Keychain；测试/CI 通过 READINGSYSTEM_TEST_NO_KEYCHAIN=1 禁用（不落任何持久 secret）
    const disabled = process.env.READINGSYSTEM_TEST_NO_KEYCHAIN === '1';
    this.useKeychain = !disabled && (keychain ?? true) && process.platform === 'darwin';
  }

  save(key, { source = 'migration' } = {}) {
    if (!this.useKeychain) return { ok: false, reason: 'NO_KEYCHAIN' };
    try {
      execFileSync('security', ['add-generic-password', '-a', ACCOUNT, '-s', SERVICE, '-w', key, '-U'], { stdio: 'ignore' });
      this.log?.info?.(`External 凭证已存入 macOS Keychain（${source}）`);
      return { ok: true, store: 'keychain' };
    } catch (e) {
      this.log?.warn?.(`Keychain 写入失败：${e.message}`);
      return { ok: false, reason: 'KEYCHAIN_WRITE_FAILED' };
    }
  }

  /** 读取凭证；返回 null = 未配置。key 只在本模块内流转，绝不进入 Prompt/日志。 */
  load() {
    // 1) 环境变量显式注入（测试/无 Keychain 场景；不落盘，允许）
    for (const k of ENV_KEYS) {
      const v = process.env[k];
      if (v) return { key: v, source: 'env' };
    }
    // 2) macOS Keychain
    if (this.useKeychain) {
      try {
        const key = execFileSync('security', ['find-generic-password', '-a', ACCOUNT, '-s', SERVICE, '-w'], { stdio: ['ignore', 'pipe', 'ignore'] })
          .toString().trim();
        if (key) return { key, source: 'keychain' };
      } catch { /* not found */ }
    }
    return null;
  }

  delete() {
    if (!this.useKeychain) return;
    try {
      execFileSync('security', ['delete-generic-password', '-a', ACCOUNT, '-s', SERVICE], { stdio: 'ignore' });
    } catch { /* not found */ }
  }

  hasCredential() { return this.load() !== null; }
}
