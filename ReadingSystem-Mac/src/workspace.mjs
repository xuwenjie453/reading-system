// workspace.mjs — 工作区 bootstrap：创建/校验 系统数据/ Canonical 布局与 manifest
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { atomicWriteJson, nowIso, sha256 } from './util.mjs';

export const SCHEMA_VERSION = 1;

export function bootstrapWorkspace(config, { bootId } = {}) {
  const dirs = [
    config.materialsDir,
    config.storeDir,
    config.documentsDir,
    config.graphsDir,
    config.annotationsDir,
    config.promptSnapshotsDir,
    config.stateDir,
    config.indexesDir,
    config.syncDir,
    config.decisionsDir,
    config.logsDir,
    config.migrationsDir,
    config.recoveryDir,
    config.runtimeDir,
    config.parseJobsDir,
    config.journalDir,
  ];
  for (const d of dirs) mkdirSync(d, { recursive: true });

  let manifest;
  let created = false;
  if (existsSync(config.manifestPath)) {
    manifest = JSON.parse(readFileSync(config.manifestPath, 'utf8'));
  } else {
    manifest = {
      manifest_version: SCHEMA_VERSION,
      workspace: config.workspace,
      created_at: nowIso(),
      store_schema_version: SCHEMA_VERSION,
      versions: {
        store_schema: SCHEMA_VERSION,
        protocol: 1,
        prompt_contract: 'runtime-v1.0',
        interest_model: 2,
        timing_model: 2,
      },
      last_boot_id: null,
      clean_shutdown: null,
    };
    atomicWriteJson(config.manifestPath, manifest);
    created = true;
  }
  if (bootId) {
    manifest.last_boot_id = bootId;
    manifest.clean_shutdown = false;
    atomicWriteJson(config.manifestPath, manifest);
  }
  return { manifest, created };
}

export function markCleanShutdown(config, bootId) {
  if (!existsSync(config.manifestPath)) return;
  const manifest = JSON.parse(readFileSync(config.manifestPath, 'utf8'));
  manifest.clean_shutdown = { at: nowIso(), boot_id: bootId };
  atomicWriteJson(config.manifestPath, manifest);
}

export function workspaceFingerprint(config) {
  return sha256(config.workspace).slice(0, 12);
}
