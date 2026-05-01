"use client";

import { useRef } from "react";
import { LogOut, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { switchTenantAction } from "./actions";
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
  const switchTenantFormRef = useRef<HTMLFormElement>(null);
  const logoutFormRef = useRef<HTMLFormElement>(null);

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
          <DropdownMenuItem
            asChild
            onSelect={() => switchTenantFormRef.current?.requestSubmit()}
          >
            <form ref={switchTenantFormRef} action={switchTenantAction} className="w-full cursor-pointer">
              <button type="submit" className="w-full text-left">
                Mandant wechseln
              </button>
            </form>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          asChild
          onSelect={() => logoutFormRef.current?.requestSubmit()}
        >
          <form ref={logoutFormRef} action="/api/logout" method="post" className="w-full cursor-pointer">
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
