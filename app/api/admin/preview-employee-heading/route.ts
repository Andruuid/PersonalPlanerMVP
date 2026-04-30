import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** Liefert den Anzeigenamen für die Topbar, wenn ein Admin die Mitarbeiter-Vorschau nutzt (?employee=…). */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const employeeId = new URL(req.url).searchParams.get("employeeId")?.trim();
  if (!employeeId) {
    return NextResponse.json({ error: "Missing employeeId" }, { status: 400 });
  }

  const emp = await prisma.employee.findFirst({
    where: {
      id: employeeId,
      tenantId: session.user.tenantId,
      deletedAt: null,
    },
    select: { firstName: true, lastName: true },
  });

  if (!emp) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const heading = `${emp.firstName} ${emp.lastName}`.trim();
  return NextResponse.json({ heading: heading || null });
}
