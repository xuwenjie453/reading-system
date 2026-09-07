// ws-server.mjs — 极简 RFC6455 WebSocket 服务器（零依赖；两端都由我们控制）
// 支持：握手、文本帧收发、ping/pong、close；服务端帧不掩码，容忍客户端分片。
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export class WsServer extends EventEmitter {
  constructor({ httpServer, path = '/bridge', logger }) {
    super();
    this.path = path;
    this.log = logger;
    this.sockets = new Set();
    httpServer.on('upgrade', (req, socket, head) => this.onUpgrade(req, socket, head));
  }

  onUpgrade(req, socket, head) {
    const url = req.url.split('?')[0];
    if (url !== this.path) {
      socket.destroy();
      return;
    }
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }
    const accept = createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    socket.setNoDelay(true);

    const client = new WsConnection(socket, this.log);
    this.sockets.add(client);
    client.on('close', () => this.sockets.delete(client));
    if (head?.length) client.feed(head);
    this.emit('connection', client, req);
  }

  broadcast(text) {
    for (const c of this.sockets) {
      if (c.open) c.send(text);
    }
  }
}

export class WsConnection extends EventEmitter {
  constructor(socket, log) {
    super();
    this.socket = socket;
    this.log = log;
    this.buffer = Buffer.alloc(0);
    this.open = true;
    this.fragments = null;
    this.missedPings = 0;

    socket.on('data', (d) => this.feed(d));
    socket.on('error', () => this.close());
    socket.on('close', () => this.onClosed());
    socket.on('end', () => this.onClosed());

    // 服务端心跳：25s ping 一次；连续 2 次无响应判定死连接并清理
    this.pingTimer = setInterval(() => {
      if (!this.open) return;
      if (this.missedPings >= 2) {
        this.log?.info?.('心跳超时，清理死连接');
        this.close();
        return;
      }
      this.missedPings += 1;
      this.sendFrame(0x9, Buffer.alloc(0));
    }, 25000);
  }

  onClosed() {
    if (!this.open) return;
    this.open = false;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.emit('close');
  }

  feed(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    while (true) {
      const frame = this.tryReadFrame();
      if (!frame) break;
      this.handleFrame(frame);
    }
  }

  tryReadFrame() {
    const buf = this.buffer;
    if (buf.length < 2) return null;
    const fin = (buf[0] & 0x80) !== 0;
    const opcode = buf[0] & 0x0f;
    const masked = (buf[1] & 0x80) !== 0;
    let len = buf[1] & 0x7f;
    let offset = 2;
    if (len === 126) {
      if (buf.length < 4) return null;
      len = buf.readUInt16BE(2);
      offset = 4;
    } else if (len === 127) {
      if (buf.length < 10) return null;
      len = Number(buf.readBigUInt64BE(2));
      offset = 10;
    }
    let mask = null;
    if (masked) {
      if (buf.length < offset + 4) return null;
      mask = buf.slice(offset, offset + 4);
      offset += 4;
    }
    if (buf.length < offset + len) return null;
    let payload = buf.slice(offset, offset + len);
    if (mask) {
      payload = Buffer.from(payload);
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    }
    this.buffer = buf.slice(offset + len);
    return { fin, opcode, payload };
  }

  handleFrame({ fin, opcode, payload }) {
    switch (opcode) {
      case 0xA: // pong：心跳正常
        this.missedPings = 0;
        break;
      case 0x0: // continuation
        if (this.fragments) {
          this.fragments.push(payload);
          if (fin) {
            const full = Buffer.concat(this.fragments);
            this.fragments = null;
            this.emit('message', full.toString('utf8'));
          }
        }
        break;
      case 0x1: // text
      case 0x2: // binary
        if (fin) this.emit('message', payload.toString('utf8'));
        else this.fragments = [payload];
        break;
      case 0x8: // close
        this.sendFrame(0x8, payload.slice(0, 2));
        this.close();
        break;
      case 0x9: // ping
        this.sendFrame(0xA, payload);
        break;
      case 0xA: // pong
        break;
      default:
        break;
    }
  }

  send(text) {
    if (!this.open) return false;
    this.sendFrame(0x1, Buffer.from(text, 'utf8'));
    return true;
  }

  sendFrame(opcode, payload) {
    if (this.socket.destroyed) return;
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.from([0x80 | opcode, len]);
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    try {
      this.socket.write(Buffer.concat([header, payload]));
    } catch { this.close(); }
  }

  close() {
    if (!this.open) return;
    try { this.sendFrame(0x8, Buffer.from([0x03, 0xe8])); } catch { /* ignore */ }
    this.open = false;
    if (this.pingTimer) clearInterval(this.pingTimer);
    try { this.socket.end(); } catch { /* ignore */ }
    this.emit('close');
  }
}
