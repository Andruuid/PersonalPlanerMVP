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
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const ADMIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/planning", label: "Wochenplanung", icon: CalendarDays },
  { href: "/employees", label: "Mitarbeitende", icon: Users },
  { href: "/services", label: "Dienste", icon: ClipboardList },
  { href: "/absences", label: "Abwesenheiten", icon: FileClock },
  { href: "/accounts", label: "Zeitkonten", icon: Wallet },
  { href: "/settings", label: "Einstellungen", icon: Settings },
  {
    href: "/compensation-cases",
    label: "Sonn-/Feiertagskomp.",
    icon: CalendarHeart,
  },
  { href: "/privacy", label: "Datenschutz", icon: ShieldCheck },
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
  { id: "new-service", label: "+ Dienstvorlage erstellen", icon: ClipboardList },
  { id: "new-employee", label: "+ Mitarbeitenden hinzufügen", icon: UserPlus },
  { id: "manual-booking", label: "+ Manuelle Buchung", icon: Coins },
];
