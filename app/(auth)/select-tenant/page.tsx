import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { homePathForRole } from "@/lib/auth-home-path";
import { selectTenantAction } from "./actions";

export const metadata = {
  title: "Mandant wählen · PersonalPlaner",
};

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function SelectTenantPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  if (!session.user.pendingTenantSelection && session.user.tenantId) {
    redirect(homePathForRole(session.user.role));
  }

  const email = session.user.email?.trim().toLowerCase();
  if (!email) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const lastSelectedTenantId = cookieStore.get("lastSelectedTenantId")?.value ?? null;

  const [params, memberships] = await Promise.all([
    searchParams,
    // Cross-tenant by design: lists all tenant memberships for one email.
    // eslint-disable-next-line tenant/require-tenant-scope
    prisma.user.findMany({
      where: { email, isActive: true },
      select: {
        id: true,
        role: true,
        tenantId: true,
        tenant: { select: { name: true, slug: true } },
      },
      orderBy: [{ tenant: { name: "asc" } }],
    }),
  ]);
  if (memberships.length === 0) {
    redirect("/login");
  }
  const sortedMemberships = [...memberships].sort((a, b) => {
    const aLast = a.tenantId === lastSelectedTenantId;
    const bLast = b.tenantId === lastSelectedTenantId;
    if (aLast === bLast) return 0;
    return aLast ? -1 : 1;
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F6F7FB] px-4 py-10">
      <div className="w-full max-w-lg rounded-xl border bg-white p-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          PersonalPlaner
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-900">Mandant auswählen</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Bitte wählen Sie den Betrieb, in dem Sie weiterarbeiten möchten.
        </p>
        {params.error ? (
          <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
            Die Auswahl war ungültig. Bitte erneut versuchen.
          </p>
        ) : null}
        <div className="mt-6 space-y-3">
          {sortedMemberships.map((item) => (
            <form key={item.id} action={selectTenantAction}>
              <input type="hidden" name="selectedUserId" value={item.id} />
              <button
                type="submit"
                className="flex w-full items-center justify-between rounded-lg border border-neutral-200 px-4 py-3 text-left transition hover:border-neutral-300 hover:bg-neutral-50"
              >
                <span>
                  <span className="block text-sm font-medium text-neutral-900">
                    {item.tenant.name}
                    {item.tenantId === lastSelectedTenantId ? (
                      <span className="ml-2 inline-block rounded bg-neutral-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-600">
                        Zuletzt gewählt
                      </span>
                    ) : null}
                  </span>
                  <span className="block text-xs text-neutral-500">{item.tenant.slug}</span>
                </span>
                <span className="text-xs uppercase tracking-wide text-neutral-500">
                  {item.role === "ADMIN"
                    ? "Admin"
                    : item.role === "EMPLOYEE"
                      ? "Mitarbeiter"
                      : "System"}
                </span>
              </button>
            </form>
          ))}
        </div>
      </div>
    </div>
  );
}
