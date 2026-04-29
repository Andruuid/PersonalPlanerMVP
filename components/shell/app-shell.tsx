import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { APP_VERSION } from "@/lib/version";

interface AppShellProps {
  variant: "admin" | "employee";
  email: string;
  showRoleToggle: boolean;
  employeeHeadingName?: string | null;
  rightRail?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({
  variant,
  email,
  showRoleToggle,
  employeeHeadingName,
  rightRail,
  children,
}: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[#F6F7FB]">
      <Topbar
        variant={variant}
        email={email}
        showRoleToggle={showRoleToggle}
        employeeHeadingName={employeeHeadingName}
      />

      <div className="mx-auto flex w-full max-w-[1480px] flex-1 gap-6 px-4 py-6 md:px-6">
        <aside className="hidden w-64 shrink-0 md:block">
          <div className="sticky top-[88px]">
            <Sidebar variant={variant} className="rounded-2xl border" />
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-6 lg:flex-row">
          <div className="min-w-0 flex-1 space-y-6">{children}</div>
          {rightRail ? (
            <aside className="w-full shrink-0 space-y-4 lg:w-80 xl:w-96">
              {rightRail}
            </aside>
          ) : null}
        </main>
      </div>

      <footer className="border-t border-neutral-200 bg-white px-4 py-3 text-center text-xs text-neutral-500 md:px-6">
        PersonalPlanerMVP · v{APP_VERSION}
      </footer>
    </div>
  );
}
