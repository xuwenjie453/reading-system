// bridge-server.mjs — Reading Bridge：Bonjour + WebSocket + 配对 + 可靠双向流（dev.bridge）
// Authority 不对称：Mac = CONTENT source；iPad = Presentation/Annotation/View origin。
// 可靠性：durable before emit/ACK；at-least-once + message_id dedup；session epoch；
// Content Snapshot 只替换 CONTENT（不清 Ink/Layout）；iPad 永远不能调 Core mutation。
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { WsServer } from './ws-server.mjs';
import { newId, nowIso } from '../util.mjs';
import { err } from '../errors.mjs';

export const PROTOCOL_VERSION = 1;

export class ReadingBridge {
  constructor({ config, core, store, db, logger }) {
    this.config = config;
    this.core = core;
    this.store = store;
    this.db = db;
    this.log = logger;
    this.server = null;
    this.ws = null;
    this.connections = new Map(); // ws conn → { deviceId, authenticated, epoch }
    this.port = config.bridgePort;
  }

  async start() {
    this.server = createServer((req, res) => {
      res.writeHead(404);
      res.end('Reading Bridge: WebSocket only at /bridge');
    });
    this.server.on('connection', (socket) => {
      const remote = `${socket.remoteAddress}:${socket.remotePort}`;
      this.log?.info?.(`TCP 入站连接: ${remote}`);
      socket.on('close', () => this.log?.info?.(`TCP 断开: ${remote}`));
      socket.on('error', () => {});
    });
    this.ws = new WsServer({ httpServer: this.server, path: '/bridge', logger: this.log });
    this.ws.on('connection', (conn, req) => this.onConnection(conn, req));
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, '0.0.0.0', () => resolve());
    });
    this.log?.info?.(`Reading Bridge listening on ws://0.0.0.0:${this.port}/bridge`);
  }

  async stop() {
    for (const conn of this.connections.keys()) conn.close();
    if (this.server) await new Promise((r) => this.server.close(r));
  }

  // ---------- Bonjour ----------
  advertise() {
    // 用 macOS 自带 dns-sd 子进程广播 _readingsystem._tcp（零依赖）
    try {
      this.dnssd = spawn('dns-sd', ['-R', this.config.serviceName, this.config.serviceType, 'local', String(this.port)], { stdio: 'ignore' });
      this.log?.info?.(`Bonjour: ${this.config.serviceType} 已广播（dns-sd）`);
    } catch (e) {
      this.log?.warn?.(`Bonjour 广播失败（iPad 可手动输入 Mac IP 连接）: ${e.message}`);
    }
  }

  stopAdvertise() {
    try { this.dnssd?.kill?.(); } catch { /* ignore */ }
  }

  // ---------- 连接生命周期 ----------
  onConnection(conn) {
    const state = { deviceId: null, authenticated: false, epoch: null };
    this.connections.set(conn, state);
    conn.on('message', async (text) => {
      let envelope;
      try {
        envelope = JSON.parse(text);
      } catch {
        this.sendError(conn, 'VALIDATION', '消息不是合法 JSON');
        return;
      }
      try {
        await this.handleMessage(conn, state, envelope);
      } catch (e) {
        this.log?.warn?.(`bridge 消息处理失败: ${e.code || e.message}`);
        this.sendError(conn, e.category || 'INTERNAL', e.userMessage || e.message, envelope?.message_id);
      }
    });
    conn.on('close', () => {
      this.connections.delete(conn);
      this.log?.info?.('iPad 连接断开');
    });
  }

  hasConnectedDevice() {
    for (const [, s] of this.connections) {
      if (s.authenticated) return true;
    }
    return false;
  }

  // ---------- 消息处理 ----------
  async handleMessage(conn, state, env) {
    const { type, payload = {} } = env;
    // 客户端 → Mac 方向的 message_id 去重：重复投递不产生第二次效果
    if (['VIEW_COMMITTED', 'LAYOUT_PATCH', 'ANNOTATION_SNAPSHOT'].includes(type)) {
      if (this.db.isDuplicateClientMessage(env.message_id)) {
        this.log?.info?.(`重复消息已忽略（dedup）: ${env.message_id} ${type}`);
        return;
      }
    }
    switch (type) {
      case 'PAIR_REQUEST': return this.onPairRequest(conn, state, payload);
      case 'SESSION_CONNECT': return this.onSessionConnect(conn, state, payload);
      case 'VIEW_COMMITTED': return this.onViewCommitted(conn, payload, env);
      case 'VIEW_SNAPSHOT': return this.onViewSnapshot(payload);
      case 'LAYOUT_PATCH': return this.onLayoutPatch(payload, env);
      case 'ANNOTATION_SNAPSHOT': return this.onAnnotationSnapshot(payload, env);
      case 'ACK': return this.onAck(payload);
      default:
        this.sendError(conn, 'VALIDATION', `未知消息类型 ${type}`, env.message_id);
    }
  }

  /** 配对：v1 用 6 位 SAS 风格数字码；`readingsystem pair` 生成并展示给用户。
   *  按配对码匹配（码是唯一凭证；App 端的 device_id 是随机生成、Mac 无法预知）。 */
  onPairRequest(conn, state, payload) {
    const { device_id, pairing_code, device_name } = payload;
    if (!device_id || !pairing_code) {
      this.sendError(conn, 'VALIDATION', 'PAIR_REQUEST 缺少 device_id/pairing_code');
      return;
    }
    const devices = this.db.listDevices();
    const matched = devices.find((d) => d.pairing_code && safeEqual(String(pairing_code), String(d.pairing_code)));
    if (!matched) {
      this.sendError(conn, 'AUTH', '配对码无效或已过期');
      return;
    }
    this.db.upsertDevice({
      device_id, name: device_name ?? matched.name, paired_at: nowIso(),
      pairing_code: null, trusted: true, last_seen_at: nowIso(),
    });
    state.deviceId = device_id;
    state.authenticated = true;
    const session = this.core.db.bumpSessionEpoch();
    state.epoch = session.session_epoch;
    this.send(conn, 'PAIR_OK', {
      device_id,
      session_epoch: session.session_epoch,
      mac_device_id: this.config.serviceName,
      protocol_version: PROTOCOL_VERSION,
    });
    this.log?.info?.(`iPad 已配对：${device_name ?? device_id}`);
  }

  /** 重连：新 session epoch → replay 未 ACK 消息 → 等待 VIEW_SNAPSHOT 建 baseline */
  onSessionConnect(conn, state, payload) {
    const { device_id, client_seq = 0, since_server_seq = 0 } = payload;
    const device = this.db.getDevice(device_id);
    if (!device?.trusted) {
      this.sendError(conn, 'AUTH', '设备未配对');
      return;
    }
    state.deviceId = device_id;
    state.authenticated = true;
    const session = this.core.db.bumpSessionEpoch();
    state.epoch = session.session_epoch;
    this.db.setClientSeq(device_id, client_seq);

    this.send(conn, 'SESSION_READY', {
      device_id,
      session_epoch: session.session_epoch,
      server_seq_head: this.seqHead(),
      resume: { since_server_seq },
      protocol_version: PROTOCOL_VERSION,
    });
    // replay pending（at-least-once；iPad dedup）
    for (const row of this.db.pendingMessages(since_server_seq)) {
      conn.send(JSON.stringify({
        protocol_version: PROTOCOL_VERSION,
        message_id: row.message_id,
        server_seq: row.server_seq,
        domain: row.domain,
        type: row.type,
        sent_at: row.created_at,
        payload: JSON.parse(row.payload_json),
      }));
    }
    this.log?.info?.(`iPad 重连：${device.name ?? device_id}，epoch=${session.session_epoch}，replay 自 ${since_server_seq}`);
  }

  async onViewCommitted(conn, payload, env) {
    const state = this.connections.get(conn);
    const result = await this.core.command('view_committed', {
      graph_id: payload.graph_id,
      view_kind: payload.view_kind,
      entity_id: payload.entity_id ?? null,
      view_revision: payload.view_revision,
      session_epoch: state?.epoch ?? payload.session_epoch,
      cause_command_id: payload.cause_command_id ?? null,
    }, { actor: `ipad:${state?.deviceId ?? 'unknown'}` });
    this.send(conn, 'VIEW_COMMITTED_RESULT', { ...result, message_id: env.message_id });

    // LastKnown 同步更新由 Core 完成； acknowledged at durable（SQLite FULL sync）
    if (payload.client_seq != null && state?.deviceId) {
      this.db.setClientSeq(state.deviceId, payload.client_seq);
    }
  }

  /** reconnect 尾步：iPad 上报当前 View snapshot → Mac 接受 baseline 并派生 Focus */
  async onViewSnapshot(payload) {
    const session = this.core.db.getSession();
    if (payload.session_epoch !== session.session_epoch) {
      return; // 旧 epoch 作废
    }
    await this.core.command('view_committed', {
      graph_id: payload.graph_id,
      view_kind: payload.view_kind,
      entity_id: payload.entity_id ?? null,
      view_revision: payload.view_revision,
      session_epoch: payload.session_epoch,
    }, { actor: 'ipad:view_snapshot' });
  }

  onLayoutPatch(payload, env) {
    // PRESENTATION domain：Mac durable 接收；USER_PINNED 不被自动 layout 移动
    const { graph_id, base_layout_revision, new_layout_revision, positions } = payload;
    const layout = this.store.getLayout(graph_id);
    if (base_layout_revision !== layout.layout_revision) {
      throw err.conflict('REVISION_MISMATCH', `layout revision 不匹配（${base_layout_revision} vs ${layout.layout_revision}）`, 'REQUEST_LAYOUT_SNAPSHOT');
    }
    const next = {
      layout_revision: new_layout_revision ?? layout.layout_revision + 1,
      nodes: { ...layout.nodes },
      updated_at: nowIso(),
    };
    for (const [nodeId, pos] of Object.entries(positions || {})) {
      next.nodes[nodeId] = { ...next.nodes[nodeId], ...pos, pin: pos.pin || 'USER_PINNED' };
    }
    this.store.writeLayout(graph_id, next);
    this.db.appendSyncMessage({ domain: 'PRESENTATION', message_id: env.message_id ?? newId('msg'), type: 'LAYOUT_PATCH_APPLIED', payload: { graph_id, layout_revision: next.layout_revision } });
  }

  onAnnotationSnapshot(payload, env) {
    // ANNOTATION domain：Mac durable backup；conflict preserve-both（lineage）
    const { annotation_id, graph_id, entity_id, base_revision, new_revision, writer, drawing_data } = payload;
    const existing = this.store.getAnnotation(annotation_id);
    if (existing && existing.revision > base_revision) {
      // preserve-both：保留远端副本，不覆盖
      const bothId = `${annotation_id}_remote_${new_revision}`;
      this.store.saveAnnotation({
        annotation_id: bothId, graph_id, entity_id, revision: new_revision,
        lineage: 'CONFLICT_REMOTE_COPY', original_id: annotation_id, writer,
        updated_at: nowIso(),
      }, drawing_data ? Buffer.from(drawing_data, 'base64') : null);
      this.sendAll('ANNOTATION_CONFLICT', { annotation_id, kept: bothId });
      return;
    }
    this.store.saveAnnotation({
      annotation_id, graph_id, entity_id, revision: new_revision,
      lineage: 'CLEAN', writer, updated_at: nowIso(),
    }, drawing_data ? Buffer.from(drawing_data, 'base64') : null);
    this.db.appendSyncMessage({ domain: 'ANNOTATION', message_id: env.message_id ?? newId('msg'), type: 'ANNOTATION_STORED', payload: { annotation_id, revision: new_revision } });
  }

  onAck(payload) {
    if (payload?.server_seq != null) {
      this.db.markAcked(payload.server_seq);
    }
  }

  // ---------- Mac → iPad 推送 ----------
  /** CONTENT 推送：full snapshot（首次/激活时）。durable before emit：先写 journal 再发送。 */
  pushGraph(graphId, { push_mode = 'FRESH' } = {}) {
    const snapshot = this.buildContentSnapshot(graphId);
    if (!snapshot) return false;
    const seq = this.db.appendSyncMessage({
      domain: 'CONTENT', message_id: newId('msg'), type: 'CONTENT_SNAPSHOT',
      payload: { push_mode, snapshot },
    });
    if (seq == null) return true; // dedup：已发过
    this.broadcast({
      domain: 'CONTENT', type: 'CONTENT_SNAPSHOT', server_seq: seq,
      message_id: null, payload: { push_mode, snapshot },
    });
    return true;
  }

  /** GraphPatch（CREATE/EXTEND 后）；Content Snapshot 不能覆盖 Ink/Layout（payload 只含 CONTENT） */
  broadcastGraphPatch(graph, event) {
    const patch = {
      patch_id: newId('patch'),
      graph_id: graph.graph_id,
      base_revision: graph.graph_revision - 1,
      new_revision: graph.graph_revision,
      operations: [event],
      graph: this.buildContentSnapshot(graph.graph_id),
    };
    const seq = this.db.appendSyncMessage({
      domain: 'CONTENT', message_id: newId('msg'), type: 'GRAPH_PATCH', payload: patch,
    });
    if (seq == null) return;
    this.broadcast({ domain: 'CONTENT', type: 'GRAPH_PATCH', server_seq: seq, message_id: null, payload: patch });
  }

  sendNavigationCommand(nav) {
    const seq = this.db.appendSyncMessage({
      domain: 'SESSION', message_id: nav.command_id, type: 'NAVIGATION_COMMAND',
      payload: {
        command_id: nav.command_id,
        epoch: nav.epoch,
        mode: nav.mode,
        target: nav.target,
        basis_view_revision: nav.basis_view_revision,
      },
    });
    if (seq == null) return true; // dedup replay
    this.broadcast({ domain: 'SESSION', type: 'NAVIGATION_COMMAND', server_seq: seq, message_id: nav.command_id, payload: {
      command_id: nav.command_id, epoch: nav.epoch, mode: nav.mode,
      target: nav.target, basis_view_revision: nav.basis_view_revision,
    } });
    return true;
  }

  buildContentSnapshot(graphId) {
    const graph = this.store.getGraph(graphId);
    if (!graph) return null;
    const nodes = this.store.listNodes(graphId).map((n) => {
      const segments = [];
      for (let i = 1; i <= n.segment_count; i++) {
        segments.push({ ordinal: i, text: this.store.getSegment(graphId, n.node_id, i) });
      }
      return {
        node_id: n.node_id, parent_id: n.parent_id, depth: n.depth, title: n.title,
        anchor_summary: n.anchor_summary, segment_count: n.segment_count, created_at: n.created_at,
        segments,
      };
    });
    const rootBlock = this.core.findBlock(graph.root_block_id);
    return {
      snapshot_id: newId('snap'),
      graph_id: graphId,
      graph_revision: graph.graph_revision,
      root_block: rootBlock
        ? { block_id: rootBlock.block_id, title: rootBlock.title, anchor_summary: rootBlock.anchor_summary, ordinal: rootBlock.ordinal, content: rootBlock.content }
        : { block_id: graph.root_block_id },
      nodes,
      layout: this.store.getLayout(graphId), // layout 属 PRESENTATION；snapshot 中仅参考，不覆盖 iPad Ink
    };
  }

  // ---------- 低层发送 ----------
  broadcast({ domain, type, server_seq, message_id, payload }, onSent) {
    const envelope = {
      protocol_version: PROTOCOL_VERSION,
      message_id: message_id ?? randomUUID(),
      server_seq,
      domain,
      type,
      sent_at: nowIso(),
      payload,
    };
    const text = JSON.stringify(envelope);
    for (const [conn, state] of this.connections) {
      if (!state.authenticated) continue;
      if (conn.send(text) && onSent) onSent();
    }
  }

  send(conn, type, payload) {
    conn.send(JSON.stringify({
      protocol_version: PROTOCOL_VERSION,
      message_id: newId('msg'),
      type,
      sent_at: nowIso(),
      payload,
    }));
  }

  sendError(conn, category, message, correlationId) {
    this.send(conn, 'ERROR', {
      error: { category, message, retryable: category === 'SYNC' || category === 'STORAGE' },
      correlation_id: correlationId ?? null,
    });
  }

  seqHead() {
    const row = this.db.db.prepare('SELECT MAX(server_seq) AS m FROM sync_journal').get();
    return row?.m ?? 0;
  }
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
