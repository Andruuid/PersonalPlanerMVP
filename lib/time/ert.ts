export interface TimeInterval {
  start: Date;
  end: Date;
}

export function mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
  const sorted = [...intervals]
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  if (sorted.length === 0) return [];

  const merged: TimeInterval[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur.start <= prev.end) {
      if (cur.end > prev.end) prev.end = cur.end;
      continue;
    }
    merged.push({ start: cur.start, end: cur.end });
  }
  return merged;
}

/**
 * Returns true if there is at least one contiguous rest window with
 * `requiredMinutes` between `windowStart` and `windowEnd`, considering all
 * work `intervals` as occupied time.
 */
export function hasRestWindowMinutes(
  intervals: TimeInterval[],
  windowStart: Date,
  windowEnd: Date,
  requiredMinutes: number,
): boolean {
  if (windowEnd <= windowStart) return false;
  if (requiredMinutes <= 0) return true;

  const occupied = mergeIntervals(
    intervals
      .map((i) => ({
        start: i.start < windowStart ? windowStart : i.start,
        end: i.end > windowEnd ? windowEnd : i.end,
      }))
      .filter((i) => i.end > i.start),
  );

  const requiredMs = requiredMinutes * 60_000;
  let cursor = windowStart;
  for (const block of occupied) {
    if (block.start.getTime() - cursor.getTime() >= requiredMs) return true;
    if (block.end > cursor) cursor = block.end;
  }
  return windowEnd.getTime() - cursor.getTime() >= requiredMs;
}
