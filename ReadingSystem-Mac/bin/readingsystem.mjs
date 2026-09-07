#!/usr/bin/env node
// readingsystem.mjs — CLI 入口
// 用法：readingsystem <command>
//   init                     初始化/检查工作区
//   start [--no-bridge]      启动守护进程（前台）
//   pair [deviceName]        生成 iPad 配对码
//   status                   状态（启动一次性实例查询后退出）
//   scan                     扫描资料库
//   parse [path|all] [--force]  解析
//   documents                列出文档
//   chat                     QA 交互（ stdin 问题；/next /end /open N 等命令）
//   ask "<question>"         单条 QA
//   serve-core               启动 loopback HTTP API（调试用）
import { ReadingDaemon } from '../src/daemon.mjs';
import { Config, DEFAULT_WORKSPACE } from '../src/config.mjs';
import { bootstrapWorkspace } from '../src/workspace.mjs';

const args = process.argv.slice(2);
const command = args[0] || 'help';
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.slice(1).filter((a) => !a.startsWith('--'));
const workspace = process.env.READINGSYSTEM_WORKSPACE || DEFAULT_WORKSPACE;

function daemonSingleton() {
  // CLI 辅助命令通过短生命周期 daemon 实例访问 Core（单进程写安全由 SQLite + journal 保证）
  return new ReadingDaemon(workspace);
}

async function main() {
  switch (command) {
    case 'init': {
      const config = new Config(workspace);
      const { created } = bootstrapWorkspace(config);
      console.log(created ? '✅ 已初始化系统数据目录' : 'ℹ️ 系统数据目录已存在');
      console.log(`   工作区: ${config.workspace}`);
      console.log(`   资料库: ${config.materialsDir}`);
      console.log(`   运行库: ${config.promptLibraryRoot()}`);
      console.log('\n配置 LLM（可选）：编辑 readingsystem.config.json：');
      console.log(JSON.stringify({ llm: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: 'YOUR_KEY', model: 'glm-4-flash' } }, null, 2));
      break;
    }

    case 'start': {
      const daemon = new ReadingDaemon(workspace);
      await daemon.start({ withBridge: !flags.has('--no-bridge') });
      const exit = async () => { await daemon.stop(); process.exit(0); };
      process.on('SIGINT', exit);
      process.on('SIGTERM', exit);
      console.log('\n按 Ctrl+C 停止。CLI 提问请用另一终端：node bin/readingsystem.mjs ask "问题"');
      setInterval(() => {}, 60_000); // keep alive
      break;
    }

    case 'pair': {
      const daemon = daemonSingleton();
      await daemon.start({ withBridge: false });
      const deviceId = positional[1] || `ipad-${Date.now().toString(36)}`;
      const { pairing_code } = daemon.createPairing(deviceId, positional[0] || 'iPad');
      console.log(`\n📱 配对码：${pairing_code}`);
      console.log(`   device_id: ${deviceId}`);
      console.log('在 iPad App 的配对界面输入此码。配对码一次性有效。');
      await daemon.stop();
      break;
    }

    case 'status': {
      const daemon = daemonSingleton();
      await daemon.start({ withBridge: false });
      const s = daemon.core.query('get_system_status');
      console.log(JSON.stringify(s, null, 2));
      await daemon.stop();
      break;
    }

    case 'scan': {
      const daemon = daemonSingleton();
      await daemon.start({ withBridge: false });
      const files = daemon.parser.scanLibrary();
      console.log(`资料库共 ${files.length} 个可解析文件：`);
      for (const f of files) console.log(`  ${f.format.padEnd(10)} ${f.path}`);
      await daemon.stop();
      break;
    }

    case 'parse': {
      const daemon = daemonSingleton();
      await daemon.start({ withBridge: false });
      const target = positional[0] || 'all';
      const force = flags.has('--force');
      console.log(`开始解析（${target}${force ? '，强制重解析' : ''}）…`);
      const job = target === 'all'
        ? await daemon.core.command('parse_library', { force })
        : await daemon.core.command('parse_document', { path: target, force });
      const detail = daemon.db.getParseJob(job.job_id);
      console.log(`Job ${job.job_id}: ${job.status}`);
      console.log(JSON.stringify(job.stats, null, 2));
      for (const f of detail.files) {
        console.log(`  [${f.status}] ${f.path}${f.error ? ` — ${f.error.code}: ${f.error.message}` : ''}`);
      }
      await daemon.stop();
      break;
    }

    case 'documents': {
      const daemon = daemonSingleton();
      await daemon.start({ withBridge: false });
      const { documents } = daemon.core.query('list_documents');
      if (!documents.length) console.log('（空）还没有解析过任何文档。先运行 parse。');
      for (const d of documents) {
        console.log(`${d.document_id}  ${d.title}  (${d.block_count} blocks, parse=${d.active_parse_run})`);
      }
      await daemon.stop();
      break;
    }

    case 'ask': {
      const question = positional.join(' ');
      if (!question) { console.error('用法: ask "<问题>"'); process.exit(1); }
      const daemon = daemonSingleton();
      await daemon.start({ withBridge: false });
      const r = await daemon.qaTurn.submitQuestion(question);
      console.log(`\n${r.answer}\n`);
      for (const n of r.notes) console.log(`— ${n}`);
      if (r.curator) console.log(`— 结构决策: ${r.curator.decision}${r.mutation ? `（已 commit: ${r.mutation.type} ${r.mutation.node_id ?? r.mutation.node_id}）` : ''}`);
      await daemon.stop();
      break;
    }

    case 'chat': {
      const daemon = daemonSingleton();
      await daemon.start({ withBridge: false });
      console.log('阅读系统 QA（输入 exit 退出；/next /end /skip /temporal /open <关键词>）');
      const rl = await import('node:readline');
      const iface = rl.createInterface({ input: process.stdin, output: process.stdout });
      const handle = async (line) => {
        const text = line.trim();
        if (!text) return true;
        if (text === 'exit' || text === 'quit') return false;
        try {
          if (text === '/next') {
            const r = await daemon.core.command('end_and_next', {}, { actor: 'cli' });
            console.log(JSON.stringify(r, null, 2));
          } else if (text === '/end') {
            console.log(JSON.stringify(await daemon.core.command('end_current_graph', {}, { actor: 'cli' }), null, 2));
          } else if (text === '/skip') {
            console.log(JSON.stringify(await daemon.core.command('skip_current_graph', {}, { actor: 'cli' }), null, 2));
          } else if (text === '/temporal') {
            const g = daemon.scheduler.manualTemporalOne();
            console.log(g ? `Temporal push: ${g}` : '当前没有到期候选。');
          } else if (text.startsWith('/open')) {
            const q = text.replace('/open', '').trim();
            const s = daemon.core.getSession();
            const found = daemon.core.query('search_current_graph', { query: q, graph_id: s.active_graph_id });
            console.log(JSON.stringify(found, null, 2));
          } else {
            const r = await daemon.qaTurn.submitQuestion(text);
            console.log(`\n${r.answer}\n`);
            for (const n of r.notes) console.log(`— ${n}`);
          }
        } catch (e) {
          console.error(`错误: ${e.code ?? ''} ${e.message}`);
        }
        return true;
      };
      const loop = () => iface.question('> ', async (line) => {
        const cont = await handle(line);
        if (!cont) { await daemon.stop(); process.exit(0); }
        loop();
      });
      loop();
      break;
    }

    case 'serve-core': {
      const daemon = new ReadingDaemon(workspace);
      await daemon.start({ withBridge: true });
      const { createServer } = await import('node:http');
      const server = createServer(async (req, res) => {
        res.setHeader('content-type', 'application/json');
        if (req.method !== 'POST') {
          res.end(JSON.stringify(daemon.core.query('get_system_status')));
          return;
        }
        let body = '';
        for await (const chunk of req) body += chunk;
        try {
          const { kind, name, params } = JSON.parse(body || '{}');
          const result = kind === 'command'
            ? daemon.core.command(name, params ?? {}, { actor: 'http' })
            : daemon.core.query(name, params ?? {});
          res.end(JSON.stringify({ ok: true, result }));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, ...(e.toJSON ? e.toJSON() : { error: e.message }) }));
        }
      });
      server.listen(daemon.config.daemonPort, '127.0.0.1', () => {
        console.log(`Reading Core HTTP API: http://127.0.0.1:${daemon.config.daemonPort} （loopback only）`);
        console.log('POST {"kind":"query","name":"get_focus_context"} 或 {"kind":"command","name":"...", "params":{...}}');
      });
      const exit = async () => { await daemon.stop(); process.exit(0); };
      process.on('SIGINT', exit);
      break;
    }

    default:
      console.log(`阅读系统 Mac 运行包 — ReadingDaemon CLI

用法：node bin/readingsystem.mjs <command>
  init                  初始化工作区（系统数据目录）
  start                 启动 ReadingDaemon（Reading Core + Bridge + Bonjour）
  pair [name]           生成 iPad 配对码
  status                查询系统状态
  scan                  扫描资料库
  parse [all|文件路径]  解析（--force 强制重解析）
  documents             已解析文档列表
  ask "<问题>"          单条 QA（含 Curator 结构更新）
  chat                  QA 交互模式（/next /end /skip /temporal）
  serve-core            守护进程 + loopback HTTP API

工作区: ${workspace}`);
  }
  process.exitCode = 0;
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
