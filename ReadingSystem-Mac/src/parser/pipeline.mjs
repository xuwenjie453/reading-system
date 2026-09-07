// pipeline.mjs — 解析流水线（dev.mac_parser）：
// scan → identity → extract → normalize → structure → segmentation → AI enrichment → validation →
// atomic ParseRun commit → derived indexes
//
// 规则：
// - deterministic first：fingerprint/格式/抽取/normalize/明显结构不交 LLM。
// - ParseKey = source_version + parser_profile_version + segmentation_profile_version；已成功默认 skip（除非 force）。
// - 单文件失败不拖垮 ParseJob；正式 ParseRun 不半发布；index failure 不回滚 canonical。
// - 每个 ContentBlock 唯一创建初始 ContentGraph（root = block，INV-C4）。
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { newId, nowIso, sha256, atomicWriteJson } from '../util.mjs';
import { err } from '../errors.mjs';
import { SUPPORTED_EXTENSIONS, extractDocument } from './adapters.mjs';
import { segmentDraftBlocks, draftToContent, SEGMENTATION_PROFILE_VERSION } from './segmenter.mjs';

export const PARSER_PROFILE_VERSION = 'v1';

export class ParserPipeline {
  constructor({ config, store, db, enricher, graphInitializer, logger }) {
    this.config = config;
    this.store = store;
    this.db = db;
    this.enricher = enricher; // ai 层提供：genre/boundaryReview/blockReview/titles/validate
    this.graphInitializer = graphInitializer; // 为每个 block 建 initial graph（core 提供）
    this.log = logger;
  }

  // ---- Stage 1: scan ----
  scanLibrary() {
    const files = [];
    const walk = (dir) => {
      if (!existsSync(dir)) return;
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        let st;
        try { st = statSync(p); } catch { continue; }
        if (st.isDirectory()) { walk(p); continue; }
        const ext = path.extname(name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext)) files.push({ path: p, format: ext, size: st.size });
      }
    };
    walk(this.config.materialsDir);
    files.sort((a, b) => a.path.localeCompare(b.path));
    return files;
  }

  startJob({ scope, force = false }) {
    const jobId = newId('job');
    this.db.createParseJob(jobId, scope);
    // 不自动后台解析整库（MASTER A.5）：同步执行、按文件 checkpoint
    return this.runJob(jobId, scope, force).then(() => {
      const finished = this.db.getParseJob(jobId);
      return { job_id: jobId, status: finished.status, stats: finished.stats };
    });
  }

  async runJob(jobId, scope, force) {
    let files = [];
    if (scope === 'LIBRARY' || scope?.type === 'LIBRARY') {
      files = this.scanLibrary();
    } else if (scope?.type === 'DOCUMENT') {
      const doc = this.store.getDocument(scope.document_id);
      if (!doc) throw err.notFound('DOCUMENT_NOT_FOUND', `document ${scope.document_id} 不存在`);
      const src = this.store.getSource(scope.document_id, doc.active_source_version);
      files = [{ path: src.original_path, format: path.extname(src.original_path).toLowerCase(), size: src.size }];
    } else if (scope?.type === 'PATH') {
      const st = statSync(scope.path);
      files = [{ path: scope.path, format: path.extname(scope.path).toLowerCase(), size: st.size }];
    } else if (scope?.type === 'FILES') {
      files = scope.files;
    }

    const stats = { discovered: files.length, parsed: 0, skipped: 0, failed: 0, blocks: 0, graphs: 0 };
    this.db.finishParseJob(jobId, 'RUNNING', stats); // checkpoint 可见

    for (const f of files) {
      try {
        const r = await this.processFile(jobId, f, force);
        const status = typeof r === 'string' ? r : r?.status;
        if (status === 'PARSED') { stats.parsed++; stats.blocks += r?.blocks ?? 0; stats.graphs += r?.graphs ?? 0; }
        else if (status === 'SKIPPED') { stats.skipped++; }
      } catch (e) {
        stats.failed++;
        this.db.upsertParseFile(jobId, { path: f.path, status: 'FAILED', error: { code: 'FILE_FAILED', message: e.message } });
        this.log?.warn?.(`parse failed for ${f.path}: ${e.message}`);
      }
      const cur = this.db.getParseJob(jobId);
      this.db.finishParseJob(jobId, 'RUNNING', { ...cur.stats, ...stats }); // checkpoint
    }
    this.db.finishParseJob(jobId, 'COMPLETE', stats);
    return stats;
  }

  async processFile(jobId, file, force) {
    // Stage 2: identity — fingerprint；path 不是 identity
    const bytes = readFileSync(file.path);
    const fingerprint = sha256(bytes);

    const existing = this.store.findByFingerprint(fingerprint);
    if (existing) {
      if (existing.source.original_path !== file.path) {
        this.store.rebindSourceLocation(existing.document.document_id, existing.source.source_version_id, file.path);
      }
      const doc = existing.document;
      const pr = doc.active_parse_run ? this.store.getParseRun(doc.document_id, doc.active_parse_run) : null;
      if (pr?.status === 'COMPLETE' && !force) {
        this.db.upsertParseFile(jobId, { path: file.path, fingerprint, status: 'SKIPPED_ALREADY_PARSED', parse_run_id: pr.parse_run_id });
        return 'SKIPPED';
      }
      return this.parseVersion(jobId, existing.document, existing.source, bytes, file, force);
    }

    // 新文件：Document + SourceVersion
    const document = this.store.createDocument({
      title: null, originalPath: file.path, fingerprint, format: file.format, size: file.size,
    });
    const source = this.store.getSource(document.document_id, document.active_source_version);
    return this.parseVersion(jobId, document, source, bytes, file, force);
  }

  async parseVersion(jobId, document, source, bytes, file, force) {
    const parseKey = `${source.fingerprint}:${PARSER_PROFILE_VERSION}:${SEGMENTATION_PROFILE_VERSION}`;
    // ParseKey 幂等
    const runs = this.store.listParseRuns(document.document_id);
    if (!force) {
      const done = runs.find((r) => r.parse_key === parseKey && r.status === 'COMPLETE');
      if (done) {
        this.db.upsertParseFile(jobId, { path: file.path, fingerprint: source.fingerprint, status: 'SKIPPED_ALREADY_PARSED', parse_run_id: done.parse_run_id });
        return 'SKIPPED';
      }
    }

    this.db.upsertParseFile(jobId, { path: file.path, fingerprint: source.fingerprint, status: 'EXTRACTING' });
    const extracted = extractDocument(file.path, file.format);
    if (!extracted.ok) {
      this.db.upsertParseFile(jobId, { path: file.path, fingerprint: source.fingerprint, status: 'FAILED', error: extracted.failure });
      throw new Error(`${extracted.failure.code}: ${extracted.failure.message}`);
    }
    const norm = extracted.document;

    // document title
    const doc = this.store.getDocument(document.document_id);
    if (!doc.title && norm.metadata.title) {
      doc.title = norm.metadata.title;
      atomicWriteJson(this.store.documentPath(doc.document_id), doc);
    }

    // Stage 3-5: extract(normalized above) → structure tree → segmentation
    const structure = buildStructuralTree(norm.ordered_units);
    const genre = await this.enricher.classifyGenre(norm); // AI role: parser.genre（v2 路由）
    const drafts = segmentDraftBlocks(norm.ordered_units, { genreProfile: genre.profile });
    const reviewed = this.enricher.reviewBlocks(norm, drafts); // AI role: parser.block_reviewer（KEEP/MERGE/RESPLIT）

    // Stage 7: AI enrichment — title + summary
    const parseRun = this.store.createParseRun({
      documentId: doc.document_id, sourceVersionId: source.source_version_id, parseKey,
      promptSnapshotId: this.enricher.promptSnapshotId?.() ?? null,
    });
    this.db.upsertParseFile(jobId, { path: file.path, fingerprint: source.fingerprint, status: 'ENRICHING', parse_run_id: parseRun.parse_run_id });

    const blocks = [];
    let ordinal = 0;
    const unitById = new Map(norm.ordered_units.map((u) => [u.unit_id, u]));
    for (const draft of reviewed) {
      ordinal += 1;
      const content = draftToContent(norm.ordered_units, draft);
      const structuralPath = draft.unit_ids
        .map((id) => unitById.get(id))
        .filter((u) => u?.type === 'heading')
        .map((u) => u.text);
      const enriched = await this.enricher.blockTitleAndSummary({ content, ordinal, structuralPath, genreProfile: genre.profile, docTitle: doc.title });
      blocks.push({
        block_id: newId('blk'),
        document_id: doc.document_id,
        parse_run_id: parseRun.parse_run_id,
        ordinal,
        title: enriched.title,
        anchor_summary: enriched.summary,
        source_range: {
          unit_start: draft.unit_ids[0], unit_end: draft.unit_ids[draft.unit_ids.length - 1],
          units: draft.unit_ids, container: file.path,
        },
        structural_path: structuralPath,
        content,
        token_estimate: enriched.token_estimate ?? null,
      });
    }

    // Stage 8: validation（deterministic coverage/order/non-overlap + AI semantic validation）
    validateBlocks(norm.ordered_units, blocks);
    const semanticWarnings = this.enricher.semanticValidate(blocks, genre);

    // Stage 9: atomic ParseRun commit
    this.store.commitParseRun(doc.document_id, parseRun.parse_run_id, {
      blocks, structure: { tree: structure, genre, semantic_warnings: semanticWarnings },
    });

    // Stage 10: derived indexes（失败不回滚 canonical）
    try {
      this.buildDerivedIndexes(doc, source, parseRun, blocks);
    } catch (e) {
      this.log?.warn?.(`derived index failure (canonical commit 保留): ${e.message}`);
      this.db.upsertParseFile(jobId, { path: file.path, fingerprint: source.fingerprint, status: 'COMPLETE_INDEX_DEGRADED', parse_run_id: parseRun.parse_run_id });
      return { status: 'PARSED', blocks: blocks.length, graphs: 0 };
    }
    this.db.upsertParseFile(jobId, { path: file.path, fingerprint: source.fingerprint, status: 'COMPLETE', parse_run_id: parseRun.parse_run_id });
    return { status: 'PARSED', blocks: blocks.length, graphs: blocks.length };
  }

  buildDerivedIndexes(doc, source, parseRun, blocks) {
    this.db.upsertDocumentCatalog({
      document_id: doc.document_id, title: doc.title ?? '(未命名)',
      active_source_version: doc.active_source_version, active_parse_run: parseRun.parse_run_id,
      block_count: blocks.length,
    });
    this.db.upsertSourceCatalog({
      fingerprint: source.fingerprint, document_id: doc.document_id,
      source_version_id: source.source_version_id, original_path: source.original_path,
      format: source.format, status: source.status,
    });
    for (const b of blocks) {
      this.db.upsertBlockIndex({
        block_id: b.block_id, document_id: b.document_id, parse_run_id: b.parse_run_id,
        graph_id: null, ordinal: b.ordinal, title: b.title, fingerprint: source.fingerprint,
      });
      // 每 Block 唯一创建初始 ContentGraph
      const graph = this.graphInitializer(b);
      this.db.upsertBlockIndex({
        block_id: b.block_id, document_id: b.document_id, parse_run_id: b.parse_run_id,
        graph_id: graph.graph_id, ordinal: b.ordinal, title: b.title, fingerprint: source.fingerprint,
      });
    }
  }
}

/** structural tree：由 headings 层级构建（保留 source 顺序） */
function buildStructuralTree(units) {
  const root = { title: '(root)', level: 0, children: [] };
  const stack = [root];
  for (const u of units) {
    if (u.type !== 'heading') continue;
    const node = { title: u.text, level: u.level || 1, unit_id: u.unit_id, children: [] };
    while (stack.length > 1 && stack[stack.length - 1].level >= node.level) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return root;
}

/** deterministic validation：coverage / order / non-overlap / source traceability */
function validateBlocks(units, blocks) {
  const unitIds = units.map((u) => u.unit_id);
  const idSet = new Set(unitIds);
  const seen = [];
  for (const b of blocks) {
    for (const uid of b.source_range?.units ?? []) {
      if (!idSet.has(uid)) throw err.validation('BLOCK_UNIT_UNKNOWN', `block ${b.ordinal} 引用了不存在的 unit ${uid}`);
      seen.push(uid);
    }
  }
  if (seen.length !== unitIds.length) {
    const seenSet = new Set(seen);
    const missing = unitIds.filter((u) => !seenSet.has(u));
    if (missing.length > Math.max(2, unitIds.length * 0.05)) {
      throw err.validation('COVERAGE_INCOMPLETE', `blocks 未覆盖 ${missing.length} 个 source units`);
    }
  }
  for (let i = 1; i < blocks.length; i++) {
    if (blocks[i].ordinal !== blocks[i - 1].ordinal + 1) {
      throw err.validation('ORDER_BROKEN', 'block ordinal 不连续');
    }
  }
}
