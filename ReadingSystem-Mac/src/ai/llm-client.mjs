// llm-client.mjs — OpenAI 兼容 LLM 客户端 + 无 Key 启发式回退（heuristic mode）
// 安全（05_SOURCE_TRUST_AND_INJECTION / dev.mac_prompt_runtime）：
// source 数据只进入 user 内容并标记为 SOURCE_DATA，绝不进入 instruction authority；
// 输出先做 schema validation 再交 Core hard-policy validation。
import { err } from '../errors.mjs';

export class LlmClient {
  constructor({ baseUrl, apiKey, model, enabled, logger, fetchImpl = globalThis.fetch }) {
    this.baseUrl = baseUrl?.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.model = model;
    this.enabled = Boolean(enabled && apiKey);
    this.fetch = fetchImpl;
    this.log = logger;
  }

  async chat({ system, user, json = false, maxTokens = 2000, temperature = 0.4, timeoutMs = 60000 }) {
    if (!this.enabled) throw err.dependency('LLM_NOT_CONFIGURED', '未配置 LLM API Key，处于启发式模式');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await this.fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature,
          max_tokens: maxTokens,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw err.dependency('LLM_HTTP_ERROR', `LLM HTTP ${res.status}: ${body.slice(0, 200)}`, undefined);
      }
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (typeof text !== 'string') throw err.schema('LLM_BAD_RESPONSE', 'LLM 返回缺少 content');
      return text;
    } catch (e) {
      if (e.name === 'AbortError') throw err.dependency('LLM_TIMEOUT', 'LLM 请求超时', '重试或改用启发式模式');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  async chatJson(opts) {
    const text = await this.chat({ ...opts, json: true });
    try {
      return JSON.parse(extractJson(text));
    } catch (e) {
      throw err.schema('LLM_JSON_INVALID', `LLM 输出不是合法 JSON: ${e.message}`, 'limited retry，再失败则 no mutation');
    }
  }
}

/** 从模型输出中提取 JSON（容忍 ```json 围栏与前后文字） */
export function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start < 0) throw new Error('no JSON found');
  const openCh = candidate[start];
  const closeCh = openCh === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < candidate.length; i++) {
    const c = candidate[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === openCh) depth++;
    else if (c === closeCh) {
      depth--;
      if (depth === 0) return candidate.slice(start, i + 1);
    }
  }
  throw new Error('unbalanced JSON');
}

// ---------- 轻量 schema 校验 ----------
export function validateSchema(value, schema, path = '$') {
  const problems = [];
  const typeOf = (v) => Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
  const checkType = (v, t) => {
    if (t === 'number') return typeOf(v) === 'number';
    if (t === 'string') return typeOf(v) === 'string';
    if (t === 'boolean') return typeOf(v) === 'boolean';
    if (t === 'object') return typeOf(v) === 'object' && v !== null && !Array.isArray(v);
    if (t === 'array') return Array.isArray(v);
    if (t === 'any') return true;
    return true;
  };
  const walk = (v, s, p) => {
    if (!s) return;
    if (s.type && !checkType(v, s.type)) {
      problems.push(`${p}: 期望 ${s.type}，实际 ${typeOf(v)}`);
      return;
    }
    if (s.enum && !s.enum.includes(v)) problems.push(`${p}: 值 ${JSON.stringify(v)} 不在枚举 [${s.enum.join('|')}]`);
    if (s.type === 'object' && s.properties) {
      for (const [k, ps] of Object.entries(s.properties)) {
        if (v == null) { if (s.required?.includes(k)) problems.push(`${p}: 缺少 ${k}`); continue; }
        if (v[k] === undefined || v[k] === null) {
          if (s.required?.includes(k)) problems.push(`${p}.${k}: 必填字段缺失`);
          continue;
        }
        walk(v[k], ps, `${p}.${k}`);
      }
    }
    if (s.type === 'array' && s.items && Array.isArray(v)) {
      v.forEach((item, i) => walk(item, s.items, `${p}[${i}]`));
    }
  };
  walk(value, schema, path);
  return { ok: problems.length === 0, problems };
}
