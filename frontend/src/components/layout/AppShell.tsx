import type { ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  Bell,
  HelpCircle,
  Database,
  FlaskConical,
  CalendarRange,
  LogOut,
  UserCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Wordmark } from "./Logo";
import { NAV, REFERENCE_NAV } from "./nav";
import { DATE_PRESETS, useDemo, type DatePreset } from "@/lib/store";
import { DATASET_NAME } from "@/data/synthetic/dataset";
import { usd } from "@/lib/format";

function NavItems({
  items,
}: {
  items: readonly { to: string; label: string; icon: typeof Bell }[];
}) {
  const { pathname } = useLocation();
  const { setOpenMobile, isMobile } = useSidebar();
  return (
    <SidebarMenu>
      {items.map((n) => {
        const active = n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
        return (
          <SidebarMenuItem key={n.to}>
            <SidebarMenuButton
              asChild
              isActive={active}
              tooltip={n.label}
              className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:shadow-[inset_2px_0_0_var(--sidebar-primary)]"
            >
              <Link
                to={n.to}
                onClick={() => isMobile && setOpenMobile(false)}
                aria-current={active ? "page" : undefined}
              >
                <n.icon className="h-4 w-4" />
                <span>{n.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4">
        <Link to="/" aria-label="ClaimCheck home">
          <Wordmark />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50">Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <NavItems items={NAV} />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50">Reference</SidebarGroupLabel>
          <SidebarGroupContent>
            <NavItems items={REFERENCE_NAV} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3">
        <div
          className="rounded-md border border-dashed border-sidebar-primary/50 bg-sidebar-accent/60 p-2.5 group-data-[collapsible=icon]:p-1.5"
          role="status"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-sidebar-primary">
            <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="group-data-[collapsible=icon]:hidden">Synthetic Demo Mode</span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
            Fictional data. Simulated AI. No external services.
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function TopBar() {
  const { pathname } = useLocation();
  const { datePreset, setDatePreset, flagged, statusOf, settings, resetDemo } = useDemo();
  const all = [...NAV, ...REFERENCE_NAV];
  const current = all.find((n) => (n.to === "/" ? pathname === "/" : pathname.startsWith(n.to)));
  const alerts = settings.notifyHigh
    ? flagged.filter((f) => f.severity === "High" && statusOf(f.line.line_id) === "New").slice(0, 5)
    : [];
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-card/95 px-3 backdrop-blur sm:px-4">
      <SidebarTrigger aria-label="Toggle navigation" />
      <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground">
          {current?.title ?? "ClaimCheck"}
        </div>
        <div className="hidden truncate text-[11px] text-muted-foreground sm:block">
          {settings.orgName}
        </div>
      </div>
      <div
        className="hidden items-center gap-1.5 rounded-md border border-dashed border-teal/50 bg-accent px-2 py-1 text-xs text-accent-foreground lg:flex"
        title="Demo dataset"
      >
        <Database className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="font-mono text-[11px]">{DATASET_NAME}</span>
      </div>
      <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
        <SelectTrigger className="h-8 w-auto gap-1.5 text-xs" aria-label="Date range">
          <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(DATE_PRESETS).map(([k, v]) => (
            <SelectItem key={k} value={k}>
              {v.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-8 w-8"
            aria-label={`Notifications, ${alerts.length} new high-severity items`}
          >
            <Bell className="h-4 w-4" />
            {alerts.length > 0 && (
              <span
                className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-sev-high"
                aria-hidden="true"
              />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="border-b border-border px-3 py-2 text-sm font-semibold">
            New high-severity exceptions
          </div>
          <ul className="max-h-72 overflow-auto">
            {alerts.length === 0 && (
              <li className="px-3 py-4 text-xs text-muted-foreground">You're all caught up.</li>
            )}
            {alerts.map((a) => (
              <li
                key={a.line.line_id}
                className="border-b border-border px-3 py-2 text-xs last:border-0"
              >
                <span className="font-mono">{a.line.line_id}</span> · {a.line.merchant} ·{" "}
                {usd(a.line.amount_usd)}
              </li>
            ))}
          </ul>
          <div className="px-3 py-2">
            <Link to="/exceptions" className="text-xs font-medium text-teal hover:underline">
              Open Exception Queue
            </Link>
          </div>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Help">
            <HelpCircle className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 text-xs leading-relaxed">
          <p className="mb-2 text-sm font-semibold">About this prototype</p>
          <p>
            ClaimCheck flags expenses for human review using nine deterministic policy rules plus
            one description-mismatch check (offline heuristic, optional simulated AI).
          </p>
          <p className="mt-2">
            All data is synthetic. Status changes, notes and policy edits are stored only in this
            browser.
          </p>
          <p className="mt-2">
            <Link to="/rules" className="font-medium text-teal hover:underline">
              Browse the rule library
            </Link>
          </p>
        </PopoverContent>
      </Popover>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-secondary"
            aria-label="User menu"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
              DW
            </span>
            <span className="hidden text-left leading-tight md:block">
              <span className="block text-xs font-medium">Dana Whitfield</span>
              <span className="block text-[10.5px] text-muted-foreground">Expense Reviewer</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs">Mock profile · demo only</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/settings">
              <UserCircle className="mr-2 h-4 w-4" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              resetDemo();
              toast.success("Demo state reset", {
                description: "Statuses, notes, policy and settings restored.",
              });
            }}
          >
            Reset demo state
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              toast("Not available in demo", {
                description:
                  "Sign-out requires real authentication, which this prototype doesn't include.",
              })
            }
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0 bg-background">
        <TopBar />
        <main id="main" className="mx-auto w-full max-w-[1500px] flex-1 p-4 sm:p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
