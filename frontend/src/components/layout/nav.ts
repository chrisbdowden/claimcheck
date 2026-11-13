import {
  LayoutDashboard,
  FileSearch,
  ListChecks,
  ClipboardCheck,
  BarChart3,
  Target,
  SlidersHorizontal,
  Sparkles,
  History,
  Settings,
  BookOpen,
} from "lucide-react";

export const NAV = [
  { to: "/", label: "Overview", title: "Expense Controls Overview", icon: LayoutDashboard },
  { to: "/analysis", label: "Expense Analysis", title: "Expense Analysis", icon: FileSearch },
  { to: "/exceptions", label: "Exception Queue", title: "Exception Queue", icon: ListChecks },
  { to: "/review", label: "Review Workspace", title: "Review Workspace", icon: ClipboardCheck },
  { to: "/analytics", label: "Analytics", title: "Analytics", icon: BarChart3 },
  { to: "/accuracy", label: "Detection Accuracy", title: "Detection Accuracy", icon: Target },
  {
    to: "/policy",
    label: "Policy Configuration",
    title: "Policy Configuration",
    icon: SlidersHorizontal,
  },
  { to: "/ai-review", label: "AI Review", title: "AI Review", icon: Sparkles },
  {
    to: "/activity",
    label: "Activity & Audit Trail",
    title: "Activity & Audit Trail",
    icon: History,
  },
  { to: "/settings", label: "Settings", title: "Settings", icon: Settings },
] as const;

export const REFERENCE_NAV = [
  { to: "/rules", label: "Rule Library", title: "Detection Rule Library", icon: BookOpen },
] as const;
