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
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/90">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">
              Internal Console
            </p>
            <h1 className="text-lg font-semibold">PersonalPlaner System-Admin</h1>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link className="text-cyan-200 hover:text-cyan-100" href="/system-admin/tenants">
              Mandanten
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
