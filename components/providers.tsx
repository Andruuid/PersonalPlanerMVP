"use client";

import { SessionProvider } from "next-auth/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <TooltipProvider delayDuration={300}>
        {children}
        <Toaster richColors closeButton position="top-right" />
      </TooltipProvider>
    </SessionProvider>
  );
}
