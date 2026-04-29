"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * MVP / Demo: kurzes Intervall, damit neue Anträge im Admin fast „live“ wirken.
 * Für Produktion mit vielen gleichzeitigen Admins eher 15–30s oder env-gesteuert,
 * sonst unnötig Server/DB-Last.
 */
const INTERVAL_MS = 1_000;

/**
 * Ruft router.refresh() periodisch auf (nur wenn der Tab sichtbar ist),
 * beim Zurückkehren zum Tab (visibilitychange) und wenn das Browserfenster
 * wieder den Fokus erhält — bei zwei Fenstern nebeneinander bleibt visibilityState
 * oft "visible", ohne dass visibilitychange feuert.
 */
export function AbsencesLiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;

    function clearPoll() {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    }

    function startPollIfVisible() {
      clearPoll();
      if (document.visibilityState !== "visible") return;
      intervalId = setInterval(() => {
        router.refresh();
      }, INTERVAL_MS);
    }

    function refreshAndPoll() {
      router.refresh();
      startPollIfVisible();
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        refreshAndPoll();
      } else {
        clearPoll();
      }
    }

    /** Zwei Fenster (Admin | Mitarbeiter): Tab kann „visible“ bleiben — Fokus wechselt trotzdem. */
    function onWindowFocus() {
      refreshAndPoll();
    }

    startPollIfVisible();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onWindowFocus);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onWindowFocus);
      clearPoll();
    };
  }, [router]);

  return null;
}
