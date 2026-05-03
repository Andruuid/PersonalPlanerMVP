import type { Route } from "next";
import type { Role } from "@/lib/generated/prisma/enums";

type HomeRoute =
  | Route<"/dashboard">
  | Route<"/my-week">
  | Route<"/system-admin/tenants">
  | Route<"/login">;

export function homePathForRole(role: Role | "ANON"): HomeRoute {
  if (role === "ADMIN") return "/dashboard";
  if (role === "EMPLOYEE") return "/my-week";
  if (role === "SYSTEM_ADMIN") return "/system-admin/tenants";
  return "/login";
}
