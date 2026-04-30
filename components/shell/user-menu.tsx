"use client";

import { LogOut, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logoutAction, switchTenantAction } from "./actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UserMenuProps {
  email: string;
  canSwitchTenant: boolean;
}

export function UserMenu({ email, canSwitchTenant }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="gap-2 rounded-full px-2 text-sm text-neutral-700"
          aria-label="Benutzermenü"
        >
          <UserCircle2 className="h-5 w-5" />
          <span className="hidden max-w-[160px] truncate sm:inline">{email}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {canSwitchTenant ? (
          <DropdownMenuItem asChild>
            <form action={switchTenantAction} className="w-full">
              <button type="submit" className="w-full text-left">
                Mandant wechseln
              </button>
            </form>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <form action={logoutAction} className="w-full">
            <button type="submit" className="flex w-full items-center text-left">
              <LogOut className="mr-2 h-4 w-4" />
              Abmelden
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
