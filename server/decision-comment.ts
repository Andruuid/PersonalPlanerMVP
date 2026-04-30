export const DECISION_COMMENT_MAX = 300;

export type ParsedDecisionComment =
  | { ok: true; text: string | null }
  | { ok: false; error: string };

export function parseDecisionComment(raw?: string | null): ParsedDecisionComment {
  if (raw == null || raw === "") {
    return { ok: true, text: null };
  }
  const t = raw.trim();
  if (t === "") {
    return { ok: true, text: null };
  }
  if (t.length > DECISION_COMMENT_MAX) {
    return {
      ok: false,
      error: `Begründung maximal ${DECISION_COMMENT_MAX} Zeichen.`,
    };
  }
  return { ok: true, text: t };
}
