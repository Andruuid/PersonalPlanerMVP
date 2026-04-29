"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createPrivacyRequestAction } from "@/server/privacy";
import type { ActionResult } from "@/server/_shared";

export function PrivacyErasureButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("type", "ERASURE");
      try {
        const result: ActionResult = await createPrivacyRequestAction(
          undefined,
          fd,
        );
        if (result.ok) {
          toast.success(
            "Löschantrag eingereicht. Die Geschäftsleitung wird informiert.",
          );
          router.refresh();
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error("Löschantrag konnte nicht gesendet werden.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="inline-flex items-center rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
    >
      {pending ? "Wird gesendet…" : "Löschantrag stellen"}
    </button>
  );
}
