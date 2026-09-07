// errors.mjs — 结构化错误模型
// 契约（08_工具接口契约/08_TOOL_FAILURE_HANDLING）：
// 每个错误至少含 error code / category / retryable / recovery_hint 四字段。
// 错误类别枚举：VALIDATION POLICY CONFLICT NOT_FOUND AUTH STORAGE SYNC DEPENDENCY SCHEMA INTERNAL

export const ERROR_CATEGORIES = [
  'VALIDATION', 'POLICY', 'CONFLICT', 'NOT_FOUND', 'AUTH',
  'STORAGE', 'SYNC', 'DEPENDENCY', 'SCHEMA', 'INTERNAL',
];

export class CoreError extends Error {
  /**
   * @param {string} code 机器可读错误码（如 REVISION_MISMATCH）
   * @param {object} opts { category, retryable, recoveryHint, userMessage, details }
   */
  constructor(code, opts = {}) {
    super(opts.userMessage || code);
    this.name = 'CoreError';
    this.code = code;
    this.category = opts.category || 'INTERNAL';
    this.retryable = Boolean(opts.retryable);
    this.recovery_hint = opts.recoveryHint || null;
    this.userMessage = opts.userMessage || null;
    this.details = opts.details || {};
  }

  toJSON() {
    return {
      error: this.code,
      category: this.category,
      retryable: this.retryable,
      recovery_hint: this.recovery_hint,
      user_message: this.userMessage,
      details: this.details,
    };
  }
}

export const err = {
  validation: (code, msg, hint) => new CoreError(code, { category: 'VALIDATION', userMessage: msg, recoveryHint: hint }),
  policy: (code, msg, hint) => new CoreError(code, { category: 'POLICY', userMessage: msg, recoveryHint: hint }),
  conflict: (code, msg, hint) => new CoreError(code, { category: 'CONFLICT', userMessage: msg, recoveryHint: hint, retryable: false }),
  notFound: (code, msg, hint) => new CoreError(code, { category: 'NOT_FOUND', userMessage: msg, recoveryHint: hint }),
  auth: (code, msg, hint) => new CoreError(code, { category: 'AUTH', userMessage: msg, recoveryHint: hint }),
  storage: (code, msg, hint) => new CoreError(code, { category: 'STORAGE', userMessage: msg, recoveryHint: hint, retryable: true }),
  sync: (code, msg, hint) => new CoreError(code, { category: 'SYNC', userMessage: msg, recoveryHint: hint, retryable: true }),
  dependency: (code, msg, hint) => new CoreError(code, { category: 'DEPENDENCY', userMessage: msg, recoveryHint: hint }),
  schema: (code, msg, hint) => new CoreError(code, { category: 'SCHEMA', userMessage: msg, recoveryHint: hint }),
  internal: (code, msg, hint) => new CoreError(code, { category: 'INTERNAL', userMessage: msg, recoveryHint: hint }),
};
