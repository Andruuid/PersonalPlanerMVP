import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Authenticated layout — opt out of static generation and fetch caching so
// no per-user HTML is ever cached at the CDN edge.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function SystemAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== "SYSTEM_ADMIN") {
    redirect("/forbidden");
  }

  return (
    <div className="min-h-screen bg-[#F6F7FB] text-neutral-900">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">
              Internal Console
            </p>
            <h1 className="text-lg font-semibold text-neutral-900">
              PersonalPlaner System-Admin
            </h1>
          </div>
          <nav className="flex items-center gap-3 text-sm">
            <Link
              className="rounded-md px-2 py-1 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
              href="/system-admin/tenants"
            >
              Mandanten
            </Link>
            <form action="/api/logout" method="post">
              <button
                type="submit"
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
              >
                Abmelden (zur Login-Seite)
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
