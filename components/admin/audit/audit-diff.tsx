import { computeAuditDiff } from "@/lib/audit/core";
import { cn } from "@/lib/utils";

interface AuditDiffProps {
  oldValue: unknown;
  newValue: unknown;
}

function formatScalar(value: unknown): string {
  if (value === undefined) return "—";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return JSON.stringify(value);
}

export function AuditDiff({ oldValue, newValue }: AuditDiffProps) {
  const diff = computeAuditDiff(oldValue, newValue);

  if (diff.length === 0) {
    if (oldValue === null && newValue === null) {
      return (
        <p className="text-xs italic text-neutral-500">
          Kein Diff verfügbar.
        </p>
      );
    }
    return (
      <pre className="overflow-x-auto rounded-md bg-neutral-50 p-3 text-xs text-neutral-700">
        {JSON.stringify(newValue ?? oldValue, null, 2)}
      </pre>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-neutral-200">
      <table className="w-full text-xs">
        <thead className="bg-neutral-50 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="w-1/4 px-3 py-2">Feld</th>
            <th className="w-3/8 px-3 py-2">Vorher</th>
            <th className="w-3/8 px-3 py-2">Nachher</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {diff.map((d) => (
            <tr
              key={d.key}
              className={cn(
                "align-top",
                d.changed ? "bg-amber-50/40" : "bg-white",
              )}
            >
              <td className="px-3 py-2 font-medium text-neutral-800">
                {d.key}
              </td>
              <td
                className={cn(
                  "break-all px-3 py-2",
                  d.changed && d.before !== undefined
                    ? "text-rose-700"
                    : "text-neutral-600",
                )}
              >
                {formatScalar(d.before)}
              </td>
              <td
                className={cn(
                  "break-all px-3 py-2",
                  d.changed && d.after !== undefined
                    ? "text-emerald-700"
                    : "text-neutral-600",
                )}
              >
                {formatScalar(d.after)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
