"use client";

import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Sidebar } from "./sidebar";
import { RoleToggle } from "./role-toggle";
import { UserMenu } from "./user-menu";

interface TopbarProps {
  variant: "admin" | "employee";
  email: string;
  showRoleToggle: boolean;
}

export function Topbar({ variant, email, showRoleToggle }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white">
      <div className="mx-auto flex w-full items-center gap-3 px-4 py-3 md:px-6">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Navigation öffnen"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Sidebar variant={variant} className="border-r-0" />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
            Prototyp
          </span>
          <h1 className="truncate text-base font-semibold text-neutral-900 md:text-lg">
            Personalplanung – Admin und Mitarbeiter
          </h1>
        </div>

        {showRoleToggle ? (
          <div className="hidden md:block">
            <RoleToggle active={variant} />
          </div>
        ) : null}

        <UserMenu email={email} />
      </div>

      {showRoleToggle ? (
        <div className="border-t border-neutral-100 px-4 py-2 md:hidden">
          <RoleToggle active={variant} />
        </div>
      ) : null}
    </header>
  );
}
