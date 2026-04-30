"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  changeAdminUserRoleAction,
  resetAdminUserPasswordAction,
  setAdminUserLockAction,
  type AdminUserRow,
} from "@/server/users-admin";
import type { Role } from "@/lib/generated/prisma/enums";

interface Props {
  users: AdminUserRow[];
  currentUserId: string;
}

export function UsersTable({ users, currentUserId }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function runForUser(userId: string, fn: () => Promise<void>) {
    setPendingId(userId);
    startTransition(async () => {
      try {
        await fn();
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <section className="space-y-4">
      <p className="text-sm text-neutral-600">
        {users.length} Benutzerkonten im Mandanten. Neue Konten entstehen nur bei
        der Mitarbeitenden-Anlage.
      </p>
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">E-Mail</th>
                <th className="px-4 py-3">Rolle</th>
                <th className="px-4 py-3">Aktiv</th>
                <th className="px-4 py-3">Verknuepft mit Mitarbeitenden</th>
                <th className="px-4 py-3">Letzter Login</th>
                <th className="px-4 py-3 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-neutral-500">
                    Keine Benutzerkonten vorhanden.
                  </td>
                </tr>
              ) : null}
              {users.map((user) => {
                const isSelf = user.id === currentUserId;
                const disabled = pending && pendingId === user.id;
                const roleOptions: Role[] = ["ADMIN", "EMPLOYEE"];
                return (
                  <tr key={user.id} className="hover:bg-neutral-50/60">
                    <td className="px-4 py-3">
                      <div className="font-medium text-neutral-900">{user.email}</div>
                      {user.role === "ADMIN" && !user.linkedEmployeeName ? (
                        <Badge className="mt-1 bg-violet-100 text-violet-800 hover:bg-violet-100">
                          Admin ohne Mitarbeitenden-Profil
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <RoleEditor
                        currentRole={user.role}
                        disabled={isSelf || disabled}
                        options={roleOptions}
                        onApply={(role) =>
                          runForUser(user.id, async () => {
                            const result = await changeAdminUserRoleAction(user.id, role);
                            if (result.ok) {
                              toast.success("Rolle aktualisiert.");
                            } else {
                              toast.error(result.error);
                            }
                          })
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      {user.isActive ? (
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                          Aktiv
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                          Gesperrt
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      {user.linkedEmployeeName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      {user.lastLoginAtIso
                        ? new Date(user.lastLoginAtIso).toLocaleString("de-CH")
                        : "noch nie"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isSelf || disabled}
                          onClick={() =>
                            runForUser(user.id, async () => {
                              const result = await setAdminUserLockAction(
                                user.id,
                                user.isActive,
                              );
                              if (result.ok) {
                                toast.success(
                                  user.isActive
                                    ? "Benutzerkonto gesperrt."
                                    : "Benutzerkonto entsperrt.",
                                );
                              } else {
                                toast.error(result.error);
                              }
                            })
                          }
                        >
                          {user.isActive ? "Sperren" : "Entsperren"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isSelf || disabled}
                          onClick={() =>
                            runForUser(user.id, async () => {
                              const result = await resetAdminUserPasswordAction(user.id);
                              if (!result.ok) {
                                toast.error(result.error);
                                return;
                              }
                              toast.success("Temporäres Passwort wurde neu gesetzt.");
                              window.alert(
                                `Einmalig angezeigtes Passwort:\n\n${result.data?.temporaryPassword ?? ""}\n\nHinweis: Mitarbeiter:in muss neu gesetztes Passwort sofort ändern.`,
                              );
                            })
                          }
                        >
                          Passwort-Reset
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function RoleEditor({
  currentRole,
  options,
  disabled,
  onApply,
}: {
  currentRole: Role;
  options: Role[];
  disabled: boolean;
  onApply: (role: Role) => void;
}) {
  const [selected, setSelected] = useState<Role>(currentRole);
  return (
    <div className="flex items-center gap-2">
      <select
        value={selected}
        disabled={disabled}
        onChange={(e) => setSelected(e.target.value as Role)}
        className="flex h-8 rounded-md border border-neutral-300 bg-white px-2 text-xs"
      >
        {options.map((role) => (
          <option key={role} value={role}>
            {role}
          </option>
        ))}
      </select>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || selected === currentRole}
        onClick={() => onApply(selected)}
      >
        Rolle setzen
      </Button>
    </div>
  );
}
