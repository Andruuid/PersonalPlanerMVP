"use client";

import { useLayoutEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpIconTooltip } from "@/components/ui/help-icon-tooltip";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createAbsenceRequestAction } from "@/server/requests";
import { createShiftWishAction } from "@/server/shift-wishes";
import type { ActionResult } from "@/server/_shared";
import {
  REQUEST_TYPE_LABELS,
  type RequestType,
  type ServiceTemplateWishOption,
} from "./types";
import { isoDateString } from "@/lib/time/week";

export interface RequestDialogProps {
  open: boolean;
  absenceType: RequestType | null;
  /** Tab beim Öffnen — z. B. «wish» über den Schicht-Wunsch-Button. */
  defaultTab: "absence" | "wish";
  /** Inkrementiert beim Öffnen des Dialogs; ermöglicht frische Tabs ohne Effekt-Sync. */
  tabsResetKey: number;
  serviceTemplates: ServiceTemplateWishOption[];
  onOpenChange: (open: boolean) => void;
}

const DESCRIPTIONS: Record<RequestType, string> = {
  VACATION:
    "Ferienantrag — wird an die Geschäftsleitung übermittelt und nach Genehmigung im Ferienkonto verbucht.",
  FREE_REQUESTED:
    "Freier Tag zu Lasten des Zeitsaldos — Antrag nur möglich bei genügend Zeitsaldo. Bei Genehmigung wird der Tagessoll vom Zeitsaldo abgezogen.",
  UEZ_BEZUG:
    "Antrag, einen geplanten Arbeitstag durch UEZ zu kompensieren — verfügbar nur bei genügend UEZ-Saldo.",
  TZT: "TZT erfassen — geplante TZT-Tage zur Genehmigung beantragen.",
  FREE_DAY:
    "Freier Tag zu Lasten des Zeitsaldos — nur bei genügend Zeitsaldo möglich; bei Genehmigung wird der Tagessoll vom Zeitsaldo abgezogen.",
  PARENTAL_CARE:
    "Eltern-/Betreuungsurlaub — wird bei Genehmigung aus dem gleichnamigen Kontingentkonto bezogen.",
};

const ENTITLEMENT_HINTS: Record<RequestType, string | null> = {
  VACATION:
    "Antrag nur möglich mit genügend Ferienguthaben im betroffenen Jahr.",
  FREE_REQUESTED:
    "Antrag nur möglich mit genügend Zeitsaldo im betroffenen Jahr. Bei Genehmigung wird der Wert vom Zeitsaldo abgezogen.",
  UEZ_BEZUG:
    "Antrag nur möglich mit genügend UEZ-Minuten im betroffenen Jahr. Bei Genehmigung wird der Bezug mit der Wochenschliessung vom UEZ-Konto abgezogen (Zeitsaldo bleibt neutral).",
  TZT: "Antrag nur möglich mit genügend TZT-Guthaben.",
  FREE_DAY:
    "Antrag nur möglich mit genügend Zeitsaldo im betroffenen Jahr. Bei Genehmigung wird der Wert vom Zeitsaldo abgezogen.",
  PARENTAL_CARE:
    "Antrag nur möglich mit genügend Guthaben im Eltern-/Betreuungsurlaub-Konto.",
};

export function RequestDialog({
  open,
  absenceType,
  defaultTab,
  tabsResetKey,
  serviceTemplates,
  onOpenChange,
}: RequestDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
        }}
      >
        {open ? (
          <>
            <Tabs
              key={`request-dialog-${tabsResetKey}-${defaultTab}`}
              defaultValue={defaultTab}
            >
              <TabsList className="grid w-full grid-cols-2" variant="default">
                <TabsTrigger value="absence">Abwesenheit</TabsTrigger>
                <TabsTrigger value="wish">Schicht-Wunsch</TabsTrigger>
              </TabsList>
              <TabsContent value="absence" className="mt-4">
                {absenceType ? (
                  <RequestForm
                    key={absenceType}
                    type={absenceType}
                    onClose={() => onOpenChange(false)}
                  />
                ) : (
                  <div className="space-y-2 py-2">
                    <DialogHeader>
                      <DialogTitle>Abwesenheitsantrag</DialogTitle>
                      <DialogDescription>
                        Wähle einen der Antrags-Buttons im Bereich darüber, um
                        Ferien, Frei, TZT oder UEZ zu beantragen.
                      </DialogDescription>
                    </DialogHeader>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="wish" className="mt-4">
                <ShiftWishForm
                  serviceTemplates={serviceTemplates}
                  onClose={() => onOpenChange(false)}
                />
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface RequestFormProps {
  type: RequestType;
  onClose: () => void;
}

function todayIso(): string {
  return isoDateString(new Date());
}

function RequestForm({ type, onClose }: RequestFormProps) {
  const [startDate, setStartDate] = useState<string>(todayIso());
  const [endDate, setEndDate] = useState<string>(todayIso());
  const [comment, setComment] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const entitlementHint = ENTITLEMENT_HINTS[type];

  useLayoutEffect(() => {
    document.getElementById("startDate")?.focus({ preventScroll: true });
  }, [type]);

  function handleStartChange(value: string) {
    setStartDate(value);
    if (value > endDate) setEndDate(value);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setGlobalError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("type", type);
    startTransition(async () => {
      const result: ActionResult = await createAbsenceRequestAction(
        undefined,
        formData,
      );
      if (result.ok) {
        toast.success("Antrag eingereicht.");
        onClose();
        return;
      }
      setGlobalError(result.error);
      setErrors(result.fieldErrors ?? {});
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <DialogHeader>
        <DialogTitle>{REQUEST_TYPE_LABELS[type]}</DialogTitle>
        <DialogDescription>{DESCRIPTIONS[type]}</DialogDescription>
        {entitlementHint ? (
          <div className="pt-1 text-xs text-neutral-600">
            <span className="inline-flex items-center gap-1.5">
              <span>Hinweis zur Anspruchspruefung</span>
              <HelpIconTooltip text={entitlementHint} />
            </span>
          </div>
        ) : null}
      </DialogHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <LabelWithHelp
            htmlFor="startDate"
            label="Von"
            tooltip="Startdatum des beantragten Zeitraums."
          />
          <Input
            id="startDate"
            name="startDate"
            type="date"
            value={startDate}
            onChange={(e) => handleStartChange(e.target.value)}
            required
          />
          {errors.startDate ? (
            <p className="text-xs text-rose-700">{errors.startDate}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <LabelWithHelp
            htmlFor="endDate"
            label="Bis"
            tooltip="Enddatum des beantragten Zeitraums (inklusive)."
          />
          <Input
            id="endDate"
            name="endDate"
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
          />
          {errors.endDate ? (
            <p className="text-xs text-rose-700">{errors.endDate}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <LabelWithHelp
          htmlFor="comment"
          label="Kommentar (optional)"
          tooltip="Hilft bei der Entscheidung und erscheint in der Antragshistorie."
        />
        <textarea
          id="comment"
          name="comment"
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={500}
          className="flex w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
          placeholder="z. B. Familienferien"
        />
        {errors.comment ? (
          <p className="text-xs text-rose-700">{errors.comment}</p>
        ) : null}
      </div>

      {globalError ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
          {globalError}
        </p>
      ) : null}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost" disabled={pending}>
            Abbrechen
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Senden..." : "Antrag senden"}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface ShiftWishFormProps {
  serviceTemplates: ServiceTemplateWishOption[];
  onClose: () => void;
}

function ShiftWishForm({ serviceTemplates, onClose }: ShiftWishFormProps) {
  const [wishKind, setWishKind] = useState<"template" | "one_time">(
    serviceTemplates.length > 0 ? "template" : "one_time",
  );
  const [date, setDate] = useState(todayIso());
  const [templateId, setTemplateId] = useState(
    serviceTemplates[0]?.id ?? "",
  );
  const [label, setLabel] = useState("");
  const [oneStart, setOneStart] = useState("07:00");
  const [oneEnd, setOneEnd] = useState("15:30");
  const [oneBreak, setOneBreak] = useState("30");
  const [comment, setComment] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const effectiveTemplateId = useMemo(() => {
    if (wishKind !== "template" || serviceTemplates.length === 0) {
      return templateId;
    }
    return serviceTemplates.some((s) => s.id === templateId)
      ? templateId
      : serviceTemplates[0]!.id;
  }, [wishKind, serviceTemplates, templateId]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setGlobalError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("wishKind", wishKind);
    fd.set("date", date);
    if (wishKind === "template") {
      fd.set("preferredServiceTemplateId", effectiveTemplateId);
    } else {
      fd.set("preferredOneTimeLabel", label.trim());
      fd.set(
        "oneTimeStart",
        oneStart.length >= 8 ? oneStart.slice(0, 5) : oneStart,
      );
      fd.set("oneTimeEnd", oneEnd.length >= 8 ? oneEnd.slice(0, 5) : oneEnd);
      fd.set("oneTimeBreakMinutes", oneBreak);
    }
    startTransition(async () => {
      const result: ActionResult = await createShiftWishAction(undefined, fd);
      if (result.ok) {
        toast.success("Schicht-Wunsch eingereicht.");
        onClose();
        return;
      }
      setGlobalError(result.error);
      setErrors(result.fieldErrors ?? {});
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <DialogHeader>
        <DialogTitle>Schicht-Wunsch</DialogTitle>
        <DialogDescription>
          Wunschtermin und gewünschte Schicht — nach Genehmigung erscheint der
          Eintrag in der Wochenplanung.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <Label className="text-neutral-800">Art des Wunsches</Label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={wishKind === "template" ? "default" : "outline"}
            disabled={serviceTemplates.length === 0}
            onClick={() => setWishKind("template")}
          >
            Dienstvorlage
          </Button>
          <Button
            type="button"
            size="sm"
            variant={wishKind === "one_time" ? "default" : "outline"}
            onClick={() => setWishKind("one_time")}
          >
            Einmal-Schicht
          </Button>
        </div>
        {serviceTemplates.length === 0 && wishKind === "template" ? (
          <p className="text-xs text-amber-800">
            Keine Dienstvorlagen verfügbar — bitte «Einmal-Schicht» wählen.
          </p>
        ) : null}
      </div>

      <input type="hidden" name="wishKind" value={wishKind} />

      <div className="space-y-1.5">
        <Label htmlFor="wishDate">Datum</Label>
        <Input
          id="wishDate"
          name="date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
        {errors.date ? (
          <p className="text-xs text-rose-700">{errors.date}</p>
        ) : null}
      </div>

      {wishKind === "template" && serviceTemplates.length > 0 ? (
        <div className="space-y-1.5">
          <Label htmlFor="preferredServiceTemplateId">Dienstvorlage</Label>
          <select
            id="preferredServiceTemplateId"
            name="preferredServiceTemplateId"
            value={effectiveTemplateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
            required={wishKind === "template"}
          >
            {serviceTemplates.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code}) · {s.startTime}–{s.endTime}
              </option>
            ))}
          </select>
          {errors.preferredServiceTemplateId ? (
            <p className="text-xs text-rose-700">
              {errors.preferredServiceTemplateId}
            </p>
          ) : null}
        </div>
      ) : null}

      {wishKind === "one_time" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="preferredOneTimeLabel">Bezeichnung</Label>
            <Input
              id="preferredOneTimeLabel"
              name="preferredOneTimeLabel"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={60}
              placeholder="z. B. Frühdienst Büro"
              required
            />
            {errors.preferredOneTimeLabel ? (
              <p className="text-xs text-rose-700">
                {errors.preferredOneTimeLabel}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="oneTimeStart">Beginn</Label>
            <Input
              id="oneTimeStart"
              name="oneTimeStart"
              type="time"
              value={oneStart}
              onChange={(e) => setOneStart(e.target.value)}
              required
            />
            {errors.oneTimeStart ? (
              <p className="text-xs text-rose-700">{errors.oneTimeStart}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="oneTimeEnd">Ende</Label>
            <Input
              id="oneTimeEnd"
              name="oneTimeEnd"
              type="time"
              value={oneEnd}
              onChange={(e) => setOneEnd(e.target.value)}
              required
            />
            {errors.oneTimeEnd ? (
              <p className="text-xs text-rose-700">{errors.oneTimeEnd}</p>
            ) : null}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="oneTimeBreakMinutes">Pause (Minuten)</Label>
            <Input
              id="oneTimeBreakMinutes"
              name="oneTimeBreakMinutes"
              type="number"
              min={0}
              max={240}
              value={oneBreak}
              onChange={(e) => setOneBreak(e.target.value)}
              required
            />
            {errors.oneTimeBreakMinutes ? (
              <p className="text-xs text-rose-700">
                {errors.oneTimeBreakMinutes}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="wishComment">Kommentar (optional)</Label>
        <textarea
          id="wishComment"
          name="comment"
          rows={2}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={500}
          className="flex w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
        />
        {errors.comment ? (
          <p className="text-xs text-rose-700">{errors.comment}</p>
        ) : null}
      </div>

      {globalError ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
          {globalError}
        </p>
      ) : null}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost" disabled={pending}>
            Abbrechen
          </Button>
        </DialogClose>
        <Button
          type="submit"
          disabled={
            pending ||
            (wishKind === "template" && serviceTemplates.length === 0)
          }
        >
          {pending ? "Senden..." : "Wunsch senden"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function LabelWithHelp({
  htmlFor,
  label,
  tooltip,
}: {
  htmlFor: string;
  label: string;
  tooltip: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      <HelpIconTooltip text={tooltip} />
    </div>
  );
}
