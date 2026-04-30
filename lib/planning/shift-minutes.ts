/**
 * Planned work minutes from shift start/end (HH:MM) and break.
 * Shared by plan-entry upserts and ShiftWish approval.
 */
export function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map((p) => Number.parseInt(p, 10));
  return h * 60 + m;
}

export function shiftMinutes(
  start: string,
  end: string,
  breakMinutes: number,
): number {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  const span = e >= s ? e - s : 24 * 60 - s + e;
  return Math.max(0, span - breakMinutes);
}
