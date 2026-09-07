// state-db.mjs — SQLite（WAL）：reading/temporal/sync/catalog/audit 等高频确定性状态
// 分工原则（02_CanonicalStore）：长期内容在文件 Canonical Store；高频状态、索引、同步在 SQLite。
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { nowIso } from '../util.mjs';

export class StateDB {
  constructor(config) {
    mkdirSync(config.stateDir, { recursive: true });
    this.db = new DatabaseSync(config.stateDbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = FULL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.migrate();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

      CREATE TABLE IF NOT EXISTS documents_catalog (
        document_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        active_source_version TEXT,
        active_parse_run TEXT,
        block_count INTEGER DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS blocks_index (
        block_id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        parse_run_id TEXT NOT NULL,
        graph_id TEXT,
        ordinal INTEGER NOT NULL,
        title TEXT,
        fingerprint TEXT,
        UNIQUE (parse_run_id, ordinal)
      );
      CREATE INDEX IF NOT EXISTS idx_blocks_doc ON blocks_index(document_id);

      CREATE TABLE IF NOT EXISTS sources_catalog (
        fingerprint TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        source_version_id TEXT NOT NULL,
        original_path TEXT NOT NULL,
        format TEXT,
        status TEXT DEFAULT 'ACTIVE'
      );

      CREATE TABLE IF NOT EXISTS reading_session (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        active_graph_id TEXT,
        session_epoch INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'IDLE',
        continuation_graph_id TEXT,
        temporal_enabled INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS view_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        graph_id TEXT,
        view_kind TEXT,
        entity_id TEXT,
        view_revision INTEGER DEFAULT 0,
        session_epoch INTEGER DEFAULT 1,
        confirmed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS last_known_view (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        graph_id TEXT,
        view_kind TEXT,
        entity_id TEXT,
        view_revision INTEGER DEFAULT 0,
        session_epoch INTEGER DEFAULT 1,
        seen_at TEXT
      );

      CREATE TABLE IF NOT EXISTS qa_turns (
        turn_id TEXT PRIMARY KEY,
        graph_id TEXT,
        focus_entity_id TEXT,
        focus_type TEXT,
        basis_view_revision INTEGER,
        session_epoch INTEGER,
        profile_snapshot_id TEXT,
        question TEXT,
        status TEXT DEFAULT 'FROZEN',
        decision TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS command_dedup (
        idempotency_key TEXT PRIMARY KEY,
        command_type TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_journal (
        server_seq INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        message_id TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        acked INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_sync_domain ON sync_journal(domain);

      CREATE TABLE IF NOT EXISTS client_seq (
        device_id TEXT PRIMARY KEY,
        client_seq INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS devices (
        device_id TEXT PRIMARY KEY,
        name TEXT,
        paired_at TEXT,
        pairing_code TEXT,
        trusted INTEGER DEFAULT 0,
        last_seen_at TEXT,
        last_view_json TEXT
      );

      CREATE TABLE IF NOT EXISTS interest_state (
        graph_id TEXT PRIMARY KEY,
        current_interest REAL DEFAULT 40,
        peak_interest REAL DEFAULT 40,
        historical_importance REAL DEFAULT 0,
        interest_confidence REAL DEFAULT 0.2,
        temporal_class TEXT DEFAULT 'COLD',
        explicit_policy TEXT DEFAULT 'DEFAULT',
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS difficulty_state (
        graph_id TEXT PRIMARY KEY,
        repetition REAL DEFAULT 0,
        friction REAL DEFAULT 0,
        cognitive_progress REAL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS timing_state (
        graph_id TEXT PRIMARY KEY,
        class TEXT DEFAULT 'COLD',
        base_interval_days REAL,
        effective_interval_days REAL,
        last_episode_at TEXT,
        last_temporal_push_at TEXT,
        next_eligible_at TEXT,
        cooldown_until TEXT,
        due_strength REAL DEFAULT 0,
        exposure INTEGER DEFAULT 0,
        skip_streak INTEGER DEFAULT 0,
        timing_generation INTEGER DEFAULT 0,
        model_version INTEGER DEFAULT 2,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS episodes (
        episode_id TEXT PRIMARY KEY,
        graph_id TEXT NOT NULL,
        entry_reason TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        outcome TEXT,
        evidence_json TEXT,
        applied INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_episodes_graph ON episodes(graph_id);

      CREATE TABLE IF NOT EXISTS parse_jobs (
        job_id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        status TEXT DEFAULT 'RUNNING',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        stats_json TEXT DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS parse_files (
        job_id TEXT NOT NULL,
        path TEXT NOT NULL,
        fingerprint TEXT,
        status TEXT DEFAULT 'DISCOVERED',
        parse_run_id TEXT,
        error_json TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (job_id, path)
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        object_type TEXT,
        object_id TEXT,
        details_json TEXT
      );

      CREATE TABLE IF NOT EXISTS decisions (
        decision_id TEXT PRIMARY KEY,
        qa_turn_id TEXT,
        graph_id TEXT,
        focus_entity_id TEXT,
        focus_type TEXT,
        decision TEXT NOT NULL,
        record_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS turn_mutations (
        qa_turn_id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        node_id TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS client_message_dedup (
        message_id TEXT PRIMARY KEY,
        processed_at TEXT NOT NULL
      );
    `);
  }

  // ---- meta ----
  getMeta(key, fallback = null) {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
    return row ? row.value : fallback;
  }
  setMeta(key, value) {
    this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
  }

  // ---- session ----
  getSession() {
    const row = this.db.prepare('SELECT * FROM reading_session WHERE id = 1').get();
    if (row) return row;
    this.db.prepare(`INSERT INTO reading_session (id, session_epoch, status, updated_at)
      VALUES (1, 1, 'IDLE', ?)`).run(nowIso());
    return this.db.prepare('SELECT * FROM reading_session WHERE id = 1').get();
  }
  updateSession(fields) {
    const cur = this.getSession();
    const next = { ...cur, ...fields, updated_at: nowIso() };
    this.db.prepare(`UPDATE reading_session SET active_graph_id=?, session_epoch=?, status=?,
      continuation_graph_id=?, temporal_enabled=?, updated_at=? WHERE id=1`)
      .run(next.active_graph_id ?? null, next.session_epoch, next.status,
        next.continuation_graph_id ?? null, next.temporal_enabled ? 1 : 0, next.updated_at);
    return this.getSession();
  }
  bumpSessionEpoch() {
    const cur = this.getSession();
    return this.updateSession({ session_epoch: cur.session_epoch + 1 });
  }

  // ---- view state（ConfirmedViewState / LastKnownViewState 两态分离）----
  getConfirmedView() { return this.db.prepare('SELECT * FROM view_state WHERE id = 1').get() || null; }
  setConfirmedView(v) {
    this.db.prepare(`INSERT INTO view_state (id, graph_id, view_kind, entity_id, view_revision, session_epoch, confirmed_at)
      VALUES (1, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET graph_id=excluded.graph_id, view_kind=excluded.view_kind,
        entity_id=excluded.entity_id, view_revision=excluded.view_revision,
        session_epoch=excluded.session_epoch, confirmed_at=excluded.confirmed_at`)
      .run(v.graph_id, v.view_kind, v.entity_id, v.view_revision, v.session_epoch, nowIso());
  }
  getLastKnownView() { return this.db.prepare('SELECT * FROM last_known_view WHERE id = 1').get() || null; }
  setLastKnownView(v) {
    this.db.prepare(`INSERT INTO last_known_view (id, graph_id, view_kind, entity_id, view_revision, session_epoch, seen_at)
      VALUES (1, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET graph_id=excluded.graph_id, view_kind=excluded.view_kind,
        entity_id=excluded.entity_id, view_revision=excluded.view_revision,
        session_epoch=excluded.session_epoch, seen_at=excluded.seen_at`)
      .run(v.graph_id, v.view_kind, v.entity_id, v.view_revision, v.session_epoch, nowIso());
  }

  // ---- qa turns ----
  insertQaTurn(t) {
    this.db.prepare(`INSERT INTO qa_turns (turn_id, graph_id, focus_entity_id, focus_type, basis_view_revision,
      session_epoch, profile_snapshot_id, question, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'FROZEN', ?)`)
      .run(t.turn_id, t.graph_id, t.focus_entity_id, t.focus_type, t.basis_view_revision,
        t.session_epoch, t.profile_snapshot_id, t.question, nowIso());
  }
  completeQaTurn(turnId, { decision, status = 'COMPLETED' }) {
    this.db.prepare('UPDATE qa_turns SET status=?, decision=?, completed_at=? WHERE turn_id=?')
      .run(status, decision, nowIso(), turnId);
  }
  getQaTurn(turnId) {
    return this.db.prepare('SELECT * FROM qa_turns WHERE turn_id = ?').get(turnId) || null;
  }

  // ---- idempotency ----
  getIdempotentResult(key) {
    const row = this.db.prepare('SELECT command_type, result_json FROM command_dedup WHERE idempotency_key = ?').get(key);
    return row ? { command_type: row.command_type, result: JSON.parse(row.result_json) } : null;
  }
  putIdempotentResult(key, commandType, result) {
    this.db.prepare('INSERT INTO command_dedup (idempotency_key, command_type, result_json, created_at) VALUES (?, ?, ?, ?)')
      .run(key, commandType, JSON.stringify(result), nowIso());
  }

  // ---- sync journal ----
  appendSyncMessage({ domain, message_id, type, payload }) {
    try {
      this.db.prepare('INSERT INTO sync_journal (domain, message_id, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(domain, message_id, type, JSON.stringify(payload), nowIso());
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return null; // dedup: at-least-once + dedup = one effect
      throw e;
    }
    const row = this.db.prepare('SELECT server_seq FROM sync_journal WHERE message_id = ?').get(message_id);
    return row.server_seq;
  }
  markAcked(serverSeq) {
    this.db.prepare('UPDATE sync_journal SET acked = 1 WHERE server_seq <= ?').run(serverSeq);
  }
  pendingMessages(sinceSeq = 0, domain = null) {
    if (domain) {
      return this.db.prepare('SELECT * FROM sync_journal WHERE server_seq > ? AND domain = ? ORDER BY server_seq')
        .all(sinceSeq, domain);
    }
    return this.db.prepare('SELECT * FROM sync_journal WHERE server_seq > ? ORDER BY server_seq').all(sinceSeq);
  }

  // ---- devices ----
  upsertDevice(d) {
    this.db.prepare(`INSERT INTO devices (device_id, name, paired_at, pairing_code, trusted, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET name=excluded.name, pairing_code=excluded.pairing_code,
        trusted=excluded.trusted, last_seen_at=excluded.last_seen_at`)
      .run(d.device_id, d.name ?? null, d.paired_at ?? null, d.pairing_code ?? null,
        d.trusted ? 1 : 0, d.last_seen_at ?? null);
  }
  getDevice(deviceId) {
    return this.db.prepare('SELECT * FROM devices WHERE device_id = ?').get(deviceId) || null;
  }
  listDevices() { return this.db.prepare('SELECT * FROM devices').all(); }
  getClientSeq(deviceId) {
    const row = this.db.prepare('SELECT client_seq FROM client_seq WHERE device_id = ?').get(deviceId);
    return row ? row.client_seq : 0;
  }
  setClientSeq(deviceId, seq) {
    this.db.prepare(`INSERT INTO client_seq (device_id, client_seq) VALUES (?, ?)
      ON CONFLICT(device_id) DO UPDATE SET client_seq = excluded.client_seq`).run(deviceId, seq);
  }

  // ---- interest / difficulty / timing ----
  ensureInterest(graphId) {
    this.db.prepare('INSERT OR IGNORE INTO interest_state (graph_id, updated_at) VALUES (?, ?)').run(graphId, nowIso());
    return this.db.prepare('SELECT * FROM interest_state WHERE graph_id = ?').get(graphId);
  }
  ensureDifficulty(graphId) {
    this.db.prepare('INSERT OR IGNORE INTO difficulty_state (graph_id, updated_at) VALUES (?, ?)').run(graphId, nowIso());
    return this.db.prepare('SELECT * FROM difficulty_state WHERE graph_id = ?').get(graphId);
  }
  ensureTiming(graphId) {
    this.db.prepare('INSERT OR IGNORE INTO timing_state (graph_id, updated_at) VALUES (?, ?)').run(graphId, nowIso());
    return this.db.prepare('SELECT * FROM timing_state WHERE graph_id = ?').get(graphId);
  }
  saveInterest(graphId, f) {
    this.db.prepare(`UPDATE interest_state SET current_interest=?, peak_interest=?, historical_importance=?,
      interest_confidence=?, temporal_class=?, explicit_policy=?, updated_at=? WHERE graph_id=?`)
      .run(f.current_interest, f.peak_interest, f.historical_importance, f.interest_confidence,
        f.temporal_class, f.explicit_policy, nowIso(), graphId);
  }
  saveDifficulty(graphId, f) {
    this.db.prepare(`UPDATE difficulty_state SET repetition=?, friction=?, cognitive_progress=?, updated_at=? WHERE graph_id=?`)
      .run(f.repetition, f.friction, f.cognitive_progress, nowIso(), graphId);
  }
  saveTiming(graphId, f) {
    this.db.prepare(`UPDATE timing_state SET class=?, base_interval_days=?, effective_interval_days=?,
      last_episode_at=?, last_temporal_push_at=?, next_eligible_at=?, cooldown_until=?, due_strength=?,
      exposure=?, skip_streak=?, timing_generation=?, model_version=?, updated_at=? WHERE graph_id=?`)
      .run(f.class, f.base_interval_days, f.effective_interval_days, f.last_episode_at, f.last_temporal_push_at,
        f.next_eligible_at, f.cooldown_until, f.due_strength, f.exposure, f.skip_streak,
        f.timing_generation, f.model_version, nowIso(), graphId);
  }
  listTemporalCandidates() {
    return this.db.prepare(`SELECT i.*, t.* FROM interest_state i JOIN timing_state t ON i.graph_id = t.graph_id`).all();
  }

  // ---- episodes ----
  openEpisode(episodeId, graphId, entryReason) {
    this.db.prepare('INSERT INTO episodes (episode_id, graph_id, entry_reason, started_at) VALUES (?, ?, ?, ?)')
      .run(episodeId, graphId, entryReason, nowIso());
  }
  closeEpisode(episodeId, outcome, evidence) {
    this.db.prepare('UPDATE episodes SET ended_at=?, outcome=?, evidence_json=?, applied=1 WHERE episode_id=?')
      .run(nowIso(), outcome, JSON.stringify(evidence), episodeId);
  }
  getOpenEpisode(graphId) {
    return this.db.prepare('SELECT * FROM episodes WHERE graph_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1')
      .get(graphId) || null;
  }
  getEpisode(episodeId) {
    return this.db.prepare('SELECT * FROM episodes WHERE episode_id = ?').get(episodeId) || null;
  }

  // ---- parse jobs ----
  createParseJob(jobId, scope) {
    this.db.prepare('INSERT INTO parse_jobs (job_id, scope, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(jobId, JSON.stringify(scope), 'RUNNING', nowIso(), nowIso());
  }
  upsertParseFile(jobId, p) {
    this.db.prepare(`INSERT INTO parse_files (job_id, path, fingerprint, status, parse_run_id, error_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(job_id, path) DO UPDATE SET fingerprint=excluded.fingerprint, status=excluded.status,
        parse_run_id=excluded.parse_run_id, error_json=excluded.error_json, updated_at=excluded.updated_at`)
      .run(jobId, p.path, p.fingerprint ?? null, p.status, p.parse_run_id ?? null,
        p.error ? JSON.stringify(p.error) : null, nowIso());
  }
  finishParseJob(jobId, status, stats) {
    this.db.prepare('UPDATE parse_jobs SET status=?, stats_json=?, updated_at=? WHERE job_id=?')
      .run(status, JSON.stringify(stats), nowIso(), jobId);
  }
  getParseJob(jobId) {
    const job = this.db.prepare('SELECT * FROM parse_jobs WHERE job_id = ?').get(jobId);
    if (!job) return null;
    job.scope = JSON.parse(job.scope);
    job.stats = JSON.parse(job.stats_json || '{}');
    job.files = this.db.prepare('SELECT * FROM parse_files WHERE job_id = ? ORDER BY path').all(jobId)
      .map((f) => ({ ...f, error: f.error_json ? JSON.parse(f.error_json) : null, error_json: undefined }));
    return job;
  }

  // ---- catalog ----
  upsertDocumentCatalog(c) {
    this.db.prepare(`INSERT INTO documents_catalog (document_id, title, active_source_version, active_parse_run, block_count, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(document_id) DO UPDATE SET title=excluded.title, active_source_version=excluded.active_source_version,
        active_parse_run=excluded.active_parse_run, block_count=excluded.block_count, updated_at=excluded.updated_at`)
      .run(c.document_id, c.title, c.active_source_version, c.active_parse_run, c.block_count, nowIso());
  }
  upsertBlockIndex(b) {
    this.db.prepare(`INSERT INTO blocks_index (block_id, document_id, parse_run_id, graph_id, ordinal, title, fingerprint)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(block_id) DO UPDATE SET graph_id=excluded.graph_id, title=excluded.title`)
      .run(b.block_id, b.document_id, b.parse_run_id, b.graph_id, b.ordinal, b.title, b.fingerprint ?? null);
  }
  upsertSourceCatalog(s) {
    this.db.prepare(`INSERT INTO sources_catalog (fingerprint, document_id, source_version_id, original_path, format, status)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(fingerprint) DO UPDATE SET original_path=excluded.original_path, status=excluded.status`)
      .run(s.fingerprint, s.document_id, s.source_version_id, s.original_path, s.format, s.status);
  }

  // ---- audit / decisions ----
  audit(actor, action, objectType, objectId, details) {
    this.db.prepare('INSERT INTO audit_log (ts, actor, action, object_type, object_id, details_json) VALUES (?, ?, ?, ?, ?, ?)')
      .run(nowIso(), actor, action, objectType, objectId, JSON.stringify(details ?? {}));
  }
  saveDecision(d) {
    this.db.prepare('INSERT INTO decisions (decision_id, qa_turn_id, graph_id, focus_entity_id, focus_type, decision, record_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(d.decision_id, d.qa_turn_id, d.graph_id, d.focus_entity_id, d.focus_type, d.decision,
        JSON.stringify(d.record), nowIso());
  }
  getDecision(decisionId) {
    const row = this.db.prepare('SELECT * FROM decisions WHERE decision_id = ?').get(decisionId);
    return row ? { ...row, record: JSON.parse(row.record_json) } : null;
  }
  getDecisionByTurn(qaTurnId) {
    const row = this.db.prepare('SELECT * FROM decisions WHERE qa_turn_id = ?').get(qaTurnId);
    return row ? { ...row, record: JSON.parse(row.record_json) } : null;
  }

  /** 客户端消息去重（at-least-once + dedup = one effect）；返回 true 表示重复消息 */
  isDuplicateClientMessage(messageId) {
    if (!messageId) return false;
    try {
      this.db.prepare('INSERT INTO client_message_dedup (message_id, processed_at) VALUES (?, ?)').run(messageId, nowIso());
      return false;
    } catch {
      return true;
    }
  }

  getTurnMutation(qaTurnId) {
    return this.db.prepare('SELECT * FROM turn_mutations WHERE qa_turn_id = ?').get(qaTurnId) || null;
  }

  recordTurnMutation(qaTurnId, action, nodeId) {
    this.db.prepare('INSERT INTO turn_mutations (qa_turn_id, action, node_id, created_at) VALUES (?, ?, ?, ?)')
      .run(qaTurnId, action, nodeId, nowIso());
  }

  close() {
    try { this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch { /* ignore */ }
    this.db.close();
  }
}
