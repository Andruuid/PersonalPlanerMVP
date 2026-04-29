import bcrypt from "bcryptjs";
import { z } from "zod";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { writeAuditCore } from "@/lib/audit/core";

function readOptionalString(
  value: FormDataEntryValue | null,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

const DEFAULT_SERVICES: readonly {
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  comment: string;
}[] = [
  {
    code: "FRUEH",
    name: "Frühdienst",
    startTime: "07:00",
    endTime: "15:30",
    breakMinutes: 30,
    comment: "Kasse / Öffnung",
  },
  {
    code: "SPAET",
    name: "Spätdienst",
    startTime: "12:30",
    endTime: "21:00",
    breakMinutes: 30,
    comment: "Schliessdienst",
  },
  {
    code: "SAMSTAG",
    name: "Samstagsdienst",
    startTime: "08:00",
    endTime: "17:00",
    breakMinutes: 45,
    comment: "Wochenend-Verkauf",
  },
];

export const signupSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(1, "Betriebsname erforderlich")
    .max(200, "Maximal 200 Zeichen"),
  slug: z
    .string()
    .trim()
    .min(2, "Mind. 2 Zeichen")
    .max(64, "Maximal 64 Zeichen")
    .transform((s) => s.toLowerCase())
    .refine((s) => /^[a-z0-9-]+$/.test(s), {
      message: "Nur Kleinbuchstaben, Zahlen und Bindestriche.",
    }),
  adminEmail: z.string().email("Gültige Admin-E-Mail erforderlich"),
  adminPassword: z.string().min(6, "Mind. 6 Zeichen"),
});

export type SignupParsed = z.infer<typeof signupSchema>;

export function rawSignupFromForm(formData: FormData): Record<string, unknown> {
  return {
    businessName: readOptionalString(formData.get("businessName")) ?? "",
    slug: readOptionalString(formData.get("slug")) ?? "",
    adminEmail: readOptionalString(formData.get("adminEmail")) ?? "",
    adminPassword:
      typeof formData.get("adminPassword") === "string"
        ? formData.get("adminPassword")
        : "",
  };
}

export async function provisionNewTenant(
  db: PrismaClient,
  input: SignupParsed,
): Promise<
  | { ok: true; tenantId: string; slug: string }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string>;
    }
> {
  const slugNorm = input.slug;
  const emailLower = input.adminEmail.toLowerCase();

  const slugTaken = await db.tenant.findUnique({
    where: { slug: slugNorm },
    select: { id: true },
  });
  if (slugTaken) {
    return {
      ok: false,
      error: "Dieser Betrieb-Slug ist bereits vergeben.",
      fieldErrors: { slug: "Dieser Betrieb-Slug ist bereits vergeben." },
    };
  }

  const passwordHash = await bcrypt.hash(input.adminPassword, 10);

  try {
    const result = await db.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: input.businessName, slug: slugNorm },
      });

      const adminUser = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: emailLower,
          passwordHash,
          role: "ADMIN",
          isActive: true,
        },
      });

      await tx.location.create({
        data: {
          tenantId: tenant.id,
          name: "Hauptstandort",
          holidayRegionCode: "EVANGELISCH",
        },
      });

      for (const s of DEFAULT_SERVICES) {
        await tx.serviceTemplate.create({
          data: {
            tenantId: tenant.id,
            code: s.code,
            name: s.name,
            startTime: s.startTime,
            endTime: s.endTime,
            breakMinutes: s.breakMinutes,
            comment: s.comment,
          },
        });
      }

      await writeAuditCore(tx, {
        tenantId: tenant.id,
        userId: adminUser.id,
        action: "CREATE",
        entity: "Tenant",
        entityId: tenant.id,
        newValue: {
          name: tenant.name,
          slug: tenant.slug,
        },
      });

      return { tenantId: tenant.id, slug: tenant.slug };
    });

    return { ok: true, ...result };
  } catch (err: unknown) {
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code?: string }).code)
        : "";
    if (code === "P2002") {
      return {
        ok: false,
        error: "Registrierung nicht möglich (Konflikt). Bitte Slug prüfen.",
        fieldErrors: { slug: "Slug bereits vergeben." },
      };
    }
    throw err;
  }
}
