import type { Role } from "@/lib/generated/prisma/enums";

export function homePathForRole(role: Role | "ANON"): string {
  if (role === "ADMIN") return "/dashboard";
  if (role === "EMPLOYEE") return "/my-week";
  if (role === "SYSTEM_ADMIN") return "/forbidden";
  return "/login";
}
