// canonical-store.mjs — Canonical Store：长期内容真源（文件式）+ 事务 + journal
//
// 身份模型（dev.mac_store）：Document / SourceVersion / ParseRun 三者分离；
// path 不是 identity；永久 Graph/Block/Node ID 不依赖 title/path。
// 不可变（INV-C1/C2/A2）：Block content.md immutable；Node 旧 Segment immutable，EXTEND 仅追加。
// 事务（dev.mac_store）：CREATE/EXTEND 短原子事务；write temp → flush → atomic rename →
//   metadata → commit marker → journal COMMITTED；未 commit 默认 rollback。
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile, atomicWriteJson, readJson, newId, nowIso, sha256, segmentFileName } from '../util.mjs';
import { err } from '../errors.mjs';

const JOURNAL_PENDING = 'PENDING';
const JOURNAL_COMMITTED = 'COMMITTED';
const JOURNAL_ROLLED_BACK = 'ROLLED_BACK';

export class CanonicalStore {
  constructor(config) {
    this.config = config;
  }

  // ---------- 路径 ----------
  documentDir(documentId) { return path.join(this.config.documentsDir, documentId); }
  documentPath(documentId) { return path.join(this.documentDir(documentId), 'document.json'); }
  sourceDir(documentId, svId) { return path.join(this.documentDir(documentId), 'sources', svId); }
  sourcePath(documentId, svId) { return path.join(this.sourceDir(documentId, svId), 'source.json'); }
  parseDir(documentId, parseRunId) { return path.join(this.documentDir(documentId), 'parses', parseRunId); }
  parsePath(documentId, parseRunId) { return path.join(this.parseDir(documentId, parseRunId), 'parse.json'); }
  parseStructurePath(documentId, parseRunId) { return path.join(this.parseDir(documentId, parseRunId), 'structure.json'); }
  blocksDir(documentId, parseRunId) { return path.join(this.parseDir(documentId, parseRunId), 'blocks'); }
  blockDir(documentId, parseRunId, blockId) { return path.join(this.blocksDir(documentId, parseRunId), blockId); }
  blockPath(documentId, parseRunId, blockId) { return path.join(this.blockDir(documentId, parseRunId, blockId), 'block.json'); }
  blockContentPath(documentId, parseRunId, blockId) { return path.join(this.blockDir(documentId, parseRunId, blockId), 'content.md'); }
  graphDir(graphId) { return path.join(this.config.graphsDir, graphId); }
  graphPath(graphId) { return path.join(this.graphDir(graphId), 'graph.json'); }
  graphNodesDir(graphId) { return path.join(this.graphDir(graphId), 'nodes'); }
  nodeDir(graphId, nodeId) { return path.join(this.graphNodesDir(graphId), nodeId); }
  nodePath(graphId, nodeId) { return path.join(this.nodeDir(graphId, nodeId), 'node.json'); }
  nodeSegmentsDir(graphId, nodeId) { return path.join(this.nodeDir(graphId, nodeId), 'segments'); }
  segmentPath(graphId, nodeId, ordinal) { return path.join(this.nodeSegmentsDir(graphId, nodeId), segmentFileName(ordinal)); }
  layoutPath(graphId) { return path.join(this.graphDir(graphId), 'presentation', 'layout.json'); }
  annotationDir(annotationId) { return path.join(this.config.annotationsDir, annotationId); }
  annotationPath(annotationId) { return path.join(this.annotationDir(annotationId), 'annotation.json'); }
  journalPath(txId) { return path.join(this.config.journalDir, `${txId}.json`); }

  // ---------- Journal ----------
  journalWrite(tx) { atomicWriteJson(this.journalPath(tx.tx_id), tx); }
  journalPending(txId, type, payload) {
    const tx = { tx_id: txId, type, state: JOURNAL_PENDING, payload, started_at: nowIso() };
    this.journalWrite(tx);
    return tx;
  }
  journalCommit(txId) {
    const tx = readJson(this.journalPath(txId));
    tx.state = JOURNAL_COMMITTED;
    tx.committed_at = nowIso();
    this.journalWrite(tx);
    return tx;
  }
  journalRollback(txId, reason) {
    const p = this.journalPath(txId);
    if (!existsSync(p)) return;
    const tx = readJson(p);
    if (tx.state === JOURNAL_COMMITTED) return;
    tx.state = JOURNAL_ROLLED_BACK;
    tx.rolled_back_at = nowIso();
    tx.rollback_reason = reason;
    this.journalWrite(tx);
  }

  // ---------- Document / SourceVersion ----------
  createDocument({ title, originalPath, fingerprint, format, size }) {
    const documentId = newId('doc');
    const svId = newId('sv');
    const txId = newId('tx');
    this.journalPending(txId, 'CREATE_DOCUMENT', { documentId, svId });
    atomicWriteJson(this.sourcePath(documentId, svId), {
      source_version_id: svId, document_id: documentId,
      original_path: originalPath, fingerprint, format, size,
      status: 'ACTIVE', discovered_at: nowIso(),
    });
    atomicWriteJson(this.documentPath(documentId), {
      document_id: documentId, title, created_at: nowIso(),
      source_versions: [svId], active_source_version: svId,
      active_parse_run: null,
    });
    this.journalCommit(txId);
    return this.getDocument(documentId);
  }

  getDocument(documentId) {
    const p = this.documentPath(documentId);
    return existsSync(p) ? readJson(p) : null;
  }

  listDocuments() {
    if (!existsSync(this.config.documentsDir)) return [];
    return readdirSync(this.config.documentsDir)
      .filter((d) => existsSync(this.documentPath(d)))
      .map((d) => this.getDocument(d));
  }

  /** same fingerprint 不同路径 → 只更新位置（SOURCE_VERSION_CHANGE_WORKFLOW） */
  rebindSourceLocation(documentId, svId, newPath) {
    const src = readJson(this.sourcePath(documentId, svId));
    src.original_path = newPath;
    src.rebound_at = nowIso();
    atomicWriteJson(this.sourcePath(documentId, svId), src);
  }

  markSourceMissing(documentId, svId) {
    const src = readJson(this.sourcePath(documentId, svId));
    src.status = 'MISSING';
    src.marked_missing_at = nowIso();
    atomicWriteJson(this.sourcePath(documentId, svId), src);
  }

  getSource(documentId, svId) {
    const p = this.sourcePath(documentId, svId);
    return existsSync(p) ? readJson(p) : null;
  }

  findByFingerprint(fingerprint) {
    for (const doc of this.listDocuments()) {
      for (const svId of doc.source_versions) {
        const src = this.getSource(doc.document_id, svId);
        if (src && src.fingerprint === fingerprint) return { document: doc, source: src };
      }
    }
    return null;
  }

  // ---------- ParseRun / Blocks ----------
  createParseRun({ documentId, sourceVersionId, parseKey, promptSnapshotId }) {
    const parseRunId = newId('parse');
    atomicWriteJson(this.parsePath(documentId, parseRunId), {
      parse_run_id: parseRunId, document_id: documentId, source_version_id: sourceVersionId,
      parse_key: parseKey, prompt_snapshot_id: promptSnapshotId || null,
      status: 'STAGING', created_at: nowIso(), completed_at: null,
      block_count: 0,
    });
    return this.getParseRun(documentId, parseRunId);
  }

  getParseRun(documentId, parseRunId) {
    const p = this.parsePath(documentId, parseRunId);
    return existsSync(p) ? readJson(p) : null;
  }

  listParseRuns(documentId) {
    const dir = path.join(this.documentDir(documentId), 'parses');
    if (!existsSync(dir)) return [];
    return readdirSync(dir).map((r) => this.getParseRun(documentId, r)).filter(Boolean);
  }

  writeBlock(documentId, parseRunId, block) {
    const dir = this.blockDir(documentId, parseRunId, block.block_id);
    mkdirSync(dir, { recursive: true });
    atomicWriteJson(this.blockPath(documentId, parseRunId, block.block_id), block);
    atomicWriteFile(this.blockContentPath(documentId, parseRunId, block.block_id), block.content);
  }

  getBlock(documentId, parseRunId, blockId) {
    const p = this.blockPath(documentId, parseRunId, blockId);
    if (!existsSync(p)) return null;
    const meta = readJson(p);
    meta.content = readFileSync(this.blockContentPath(documentId, parseRunId, blockId), 'utf8');
    return meta;
  }

  listBlocks(documentId, parseRunId) {
    const dir = this.blocksDir(documentId, parseRunId);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .map((b) => this.getBlock(documentId, parseRunId, b))
      .filter(Boolean)
      .sort((a, b) => a.ordinal - b.ordinal);
  }

  /** 整个 ParseRun 原子 commit：写齐 blocks → structure → parse.json COMPLETE → document.active_parse_run */
  commitParseRun(documentId, parseRunId, { blocks, structure }) {
    const txId = newId('tx');
    this.journalPending(txId, 'PARSE_COMMIT', { documentId, parseRunId, blockCount: blocks.length });
    for (const b of blocks) this.writeBlock(documentId, parseRunId, b);
    atomicWriteJson(this.parseStructurePath(documentId, parseRunId), structure);
    const pr = this.getParseRun(documentId, parseRunId);
    pr.status = 'COMPLETE';
    pr.completed_at = nowIso();
    pr.block_count = blocks.length;
    atomicWriteJson(this.parsePath(documentId, parseRunId), pr);
    const doc = this.getDocument(documentId);
    doc.active_parse_run = parseRunId;
    atomicWriteJson(this.documentPath(documentId), doc);
    this.journalCommit(txId);
    return pr;
  }

  failParseRun(documentId, parseRunId, reason) {
    const pr = this.getParseRun(documentId, parseRunId);
    if (!pr || pr.status === 'COMPLETE') return;
    pr.status = 'FAILED';
    pr.failed_reason = reason;
    pr.completed_at = nowIso();
    atomicWriteJson(this.parsePath(documentId, parseRunId), pr);
  }

  // ---------- Graph / Node ----------
  createGraph({ graphId, rootBlockId, documentId }) {
    atomicWriteJson(this.graphPath(graphId), {
      graph_id: graphId, root_block_id: rootBlockId, document_id: documentId,
      graph_revision: 1, created_at: nowIso(), nodes: {}, edges: [],
    });
    mkdirSync(path.join(this.graphDir(graphId), 'presentation'), { recursive: true });
    this.writeLayout(graphId, { layout_revision: 1, nodes: {}, updated_at: nowIso() });
    return this.getGraph(graphId);
  }

  getGraph(graphId) {
    const p = this.graphPath(graphId);
    return existsSync(p) ? readJson(p) : null;
  }

  writeGraph(graph) {
    atomicWriteJson(this.graphPath(graph.graph_id), graph);
  }

  listGraphs() {
    if (!existsSync(this.config.graphsDir)) return [];
    return readdirSync(this.config.graphsDir)
      .map((g) => this.getGraph(g))
      .filter(Boolean);
  }

  getBlockRootGraph(blockId) {
    // INV-C4：一个 Block 对一 Graph
    for (const g of this.listGraphs()) {
      if (g.root_block_id === blockId) return g;
    }
    return null;
  }

  writeNode(graphId, node) {
    mkdirSync(this.nodeSegmentsDir(graphId, node.node_id), { recursive: true });
    atomicWriteJson(this.nodePath(graphId, node.node_id), node);
  }

  getNode(graphId, nodeId) {
    const p = this.nodePath(graphId, nodeId);
    return existsSync(p) ? readJson(p) : null;
  }

  listNodes(graphId) {
    const dir = this.graphNodesDir(graphId);
    if (!existsSync(dir)) return [];
    return readdirSync(dir).map((n) => this.getNode(graphId, n)).filter(Boolean);
  }

  /** 读 Segment（immutable）。ordinal 从 1 开始。 */
  getSegment(graphId, nodeId, ordinal) {
    const p = this.segmentPath(graphId, nodeId, ordinal);
    return existsSync(p) ? readFileSync(p, 'utf8') : null;
  }

  /** 旧 Segment 永不重写（INV-C2）；此方法只在 CREATE（segment 1）与 EXTEND append 时被事务调用。 */
  appendSegment(graphId, nodeId, text) {
    const node = this.getNode(graphId, nodeId);
    if (!node) throw err.notFound('NODE_NOT_FOUND', `node ${nodeId} 不存在`);
    const ordinal = node.segment_count + 1;
    const p = this.segmentPath(graphId, nodeId, ordinal);
    if (existsSync(p)) throw err.internal('SEGMENT_EXISTS', `segment ${ordinal} 已存在，append-only 被违反`);
    atomicWriteFile(p, text);
    node.segment_count = ordinal;
    atomicWriteJson(this.nodePath(graphId, nodeId), node);
    return ordinal;
  }

  writeLayout(graphId, layout) {
    atomicWriteJson(this.layoutPath(graphId), layout);
  }

  getLayout(graphId) {
    return readJson(this.layoutPath(graphId), { layout_revision: 1, nodes: {} });
  }

  // ---------- Annotation ----------
  saveAnnotation(annotation, pkDrawingData) {
    mkdirSync(this.annotationDir(annotation.annotation_id), { recursive: true });
    atomicWriteJson(this.annotationPath(annotation.annotation_id), annotation);
    if (pkDrawingData) {
      atomicWriteFile(path.join(this.annotationDir(annotation.annotation_id), 'current.pkdrawing'), pkDrawingData);
    }
  }

  getAnnotation(annotationId) {
    const p = this.annotationPath(annotationId);
    return existsSync(p) ? readJson(p) : null;
  }

  listAnnotationsByEntity(graphId, entityId) {
    if (!existsSync(this.config.annotationsDir)) return [];
    return readdirSync(this.config.annotationsDir)
      .map((a) => this.getAnnotation(a))
      .filter((a) => a && a.graph_id === graphId && a.entity_id === entityId);
  }

  // ---------- 恢复（dev.mac_store / dev.mac_lifecycle） ----------
  /**
   * 启动恢复：扫描 journal，PENDING 且无 COMMITTED marker 的事务按类型回滚。
   * 不要让 AI“看文件猜恢复”——这里只做确定性检查。
   */
  recoverPendingTransactions() {
    const results = [];
    if (!existsSync(this.config.journalDir)) return results;
    for (const f of readdirSync(this.config.journalDir)) {
      if (!f.endsWith('.json')) continue;
      const tx = readJson(path.join(this.config.journalDir, f));
      if (tx.state !== JOURNAL_PENDING) continue;
      const p = tx.payload || {};
      if (tx.type === 'PARSE_COMMIT') {
        const pr = this.getParseRun(p.documentId, p.parseRunId);
        if (pr && pr.status === 'COMPLETE') {
          this.journalCommit(tx.tx_id); // 已完成但 marker 丢失 → 幂等补记
          results.push({ tx_id: tx.tx_id, type: tx.type, action: 'COMMITTED' });
        } else {
          this.journalRollback(tx.tx_id, 'incomplete parse commit');
          results.push({ tx_id: tx.tx_id, type: tx.type, action: 'ROLLED_BACK' });
        }
      } else if (tx.type === 'CREATE_DOCUMENT') {
        const doc = this.getDocument(p.documentId);
        if (doc) { this.journalCommit(tx.tx_id); results.push({ tx_id: tx.tx_id, type: tx.type, action: 'COMMITTED' }); }
        else {
          rmSync(this.documentDir(p.documentId), { recursive: true, force: true });
          this.journalRollback(tx.tx_id, 'incomplete document');
          results.push({ tx_id: tx.tx_id, type: tx.type, action: 'ROLLED_BACK' });
        }
      } else if (tx.type === 'CREATE_NODE' || tx.type === 'EXTEND_NODE') {
        // graph.json 是最后一个 canonical 写入：revision 未包含该 tx → 回滚孤儿文件
        const graph = this.getGraph(p.graphId);
        const applied = graph && p.expected_new_revision
          ? graph.graph_revision >= p.expected_new_revision
          : false;
        if (applied) {
          this.journalCommit(tx.tx_id);
          results.push({ tx_id: tx.tx_id, type: tx.type, action: 'COMMITTED' });
        } else {
          if (p.nodeId) {
            rmSync(this.nodeDir(p.graphId, p.nodeId), { recursive: true, force: true });
          }
          if (graph && p.expected_new_revision) {
            graph.graph_revision = Math.max(1, p.expected_new_revision - 1);
            if (tx.type === 'CREATE_NODE' && p.nodeId) {
              delete graph.nodes[p.nodeId];
              graph.edges = graph.edges.filter((e) => e.child_node_id !== p.nodeId);
            }
            if (tx.type === 'EXTEND_NODE' && p.nodeId) {
              const node = this.getNode(p.graphId, p.nodeId);
              if (node && p.prev_segment_count != null) {
                node.segment_count = p.prev_segment_count;
                node.anchor_summary = p.prev_anchor_summary;
                this.writeNode(p.graphId, node);
              }
            }
            this.writeGraph(graph);
          }
          this.journalRollback(tx.tx_id, 'incomplete graph mutation');
          results.push({ tx_id: tx.tx_id, type: tx.type, action: 'ROLLED_BACK' });
        }
      }
    }
    return results;
  }

  /** fast integrity：manifest + 每个 graph.json 可读、root block 文件存在、node parent 存在 */
  fastIntegrityCheck() {
    const problems = [];
    for (const g of this.listGraphs()) {
      try {
        const rootGraph = this.getGraph(g.graph_id);
        if (!rootGraph.root_block_id) problems.push(`graph ${g.graph_id} 缺 root_block_id`);
        for (const [nodeId, info] of Object.entries(rootGraph.nodes || {})) {
          if (!existsSync(this.nodePath(g.graph_id, nodeId))) problems.push(`graph ${g.graph_id} node ${nodeId} 文件缺失`);
          if (info.depth > 0 && !rootGraph.nodes[info.parent_id]) problems.push(`node ${nodeId} parent ${info.parent_id} 不存在`);
        }
      } catch (e) {
        problems.push(`graph ${g.graph_id} 不可读: ${e.message}`);
      }
    }
    return { ok: problems.length === 0, problems };
  }
}
