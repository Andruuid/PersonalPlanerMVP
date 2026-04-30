type LogLevel = "error" | "debug";

type LogMeta = Record<string, unknown>;

const SENSITIVE_KEY_RE =
  /(password|pass|pwd|token|secret|authorization|auth|cookie|set-cookie|apikey|api-key|bearer|session)/i;

function resolvedLogLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (raw === "debug") return "debug";
  if (raw === "error") return "error";
  return process.env.NODE_ENV === "production" ? "error" : "debug";
}

function shouldLog(level: LogLevel): boolean {
  const configured = resolvedLogLevel();
  if (configured === "debug") return true;
  return level === "error";
}

function redactValue(value: unknown): unknown {
  if (value == null) return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  if (Array.isArray(value)) return value.map(redactValue);
  if (typeof value === "object") return redactObject(value as LogMeta);
  return value;
}

function redactObject(meta: LogMeta): LogMeta {
  const out: LogMeta = {};
  for (const [key, value] of Object.entries(meta)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      out[key] = "[REDACTED]";
      continue;
    }
    out[key] = redactValue(value);
  }
  return out;
}

function emit(level: LogLevel, scope: string, message: string, meta?: LogMeta): void {
  if (!shouldLog(level)) return;
  const payload = {
    ts: new Date().toISOString(),
    level,
    scope,
    message,
    env: process.env.NODE_ENV ?? "unknown",
    runtime: process.env.NETLIFY ? "netlify" : "unknown-host",
    meta: meta ? redactObject(meta) : undefined,
  };

  if (level === "error") {
    console.error(JSON.stringify(payload));
    return;
  }
  console.log(JSON.stringify(payload));
}

export function logError(scope: string, message: string, meta?: LogMeta): void {
  emit("error", scope, message, meta);
}

export function logDebug(scope: string, message: string, meta?: LogMeta): void {
  emit("debug", scope, message, meta);
}

export function currentLogLevel(): LogLevel {
  return resolvedLogLevel();
}
