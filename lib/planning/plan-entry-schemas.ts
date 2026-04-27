import { z } from "zod";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const shiftSchema = z.object({
  kind: z.literal("SHIFT"),
  serviceTemplateId: z.string().min(1, "Dienstvorlage wählen"),
});

const oneTimeSchema = z.object({
  kind: z.literal("ONE_TIME_SHIFT"),
  oneTimeStart: z.string().regex(TIME_RE, "Format HH:MM"),
  oneTimeEnd: z.string().regex(TIME_RE, "Format HH:MM"),
  oneTimeBreakMinutes: z.coerce
    .number()
    .int()
    .min(0, "Mindestens 0")
    .max(240, "Maximal 240"),
  oneTimeLabel: z.string().min(1, "Bezeichnung erforderlich").max(60),
});

const absenceSchema = z.object({
  kind: z.literal("ABSENCE"),
  absenceType: z.enum([
    "VACATION",
    "SICK",
    "ACCIDENT",
    "FREE_REQUESTED",
    "UNPAID",
    "TZT",
    "PARENTAL_CARE",
    "MILITARY_SERVICE",
    "CIVIL_PROTECTION_SERVICE",
    "CIVIL_SERVICE",
    "HOLIDAY_AUTO",
  ]),
});

const baseSchema = z.object({
  weekId: z.string().min(1),
  employeeId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum ungültig"),
  comment: z.string().max(200).optional().nullable(),
});

export const upsertSchema = z.discriminatedUnion("kind", [
  shiftSchema.merge(baseSchema),
  oneTimeSchema.merge(baseSchema),
  absenceSchema.merge(baseSchema),
]);

export type UpsertPlanEntryInput = z.infer<typeof upsertSchema>;

export const moveSchema = z.object({
  entryId: z.string().min(1),
  toEmployeeId: z.string().min(1),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const QUICK_SHIFT_CODES = ["FRUEH", "SPAET", "SAMSTAG"] as const;

export type QuickPickKey =
  | (typeof QUICK_SHIFT_CODES)[number]
  | "VACATION"
  | "FREE_REQUESTED"
  | "TZT"
  | "SICK";
