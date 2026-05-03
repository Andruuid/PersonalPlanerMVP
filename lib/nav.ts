import {
  CalendarDays,
  CalendarHeart,
  ClipboardList,
  Coins,
  FileClock,
  Home,
  ScrollText,
  Settings,
  ShieldCheck,
  ShieldUser,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Route } from "next";

export interface NavItem {
  href: Route;
  label: string;
  icon: LucideIcon;
}

export const ADMIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/planning", label: "Wochenplanung", icon: CalendarDays },
  { href: "/absences", label: "Abwesenheiten", icon: FileClock },
  { href: "/employees", label: "Mitarbeitende", icon: Users },
  { href: "/accounts", label: "Zeitkonten", icon: Wallet },
  { href: "/services", label: "Dienste", icon: ClipboardList },
  {
    href: "/compensation-cases",
    label: "Sonn-/Feiertagskomp.",
    icon: CalendarHeart,
  },
  { href: "/users", label: "Rechte und Benutzer", icon: ShieldUser },
  { href: "/privacy", label: "Datenschutz", icon: ShieldCheck },
  { href: "/settings", label: "Einstellungen", icon: Settings },
  { href: "/audit", label: "Audit-Log", icon: ScrollText },
];

export const EMPLOYEE_NAV: NavItem[] = [
  { href: "/my-week", label: "Meine Woche", icon: CalendarDays },
  { href: "/my-requests", label: "Meine Anträge", icon: FileClock },
  { href: "/my-accounts", label: "Meine Konten", icon: Coins },
];

export interface QuickAction {
  id: string;
  label: string;
  icon: LucideIcon;
}

export const ADMIN_QUICK_ACTIONS: QuickAction[] = [
  { id: "new-service", label: "+ Dienstvorlage", icon: ClipboardList },
  { id: "new-employee", label: "+ Mitarbeiter:in", icon: UserPlus },
  { id: "manual-booking", label: "+ Manuelle Buchung", icon: Coins },
];
