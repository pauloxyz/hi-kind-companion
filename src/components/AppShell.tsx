import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard, User, FileText, Image as ImageIcon, Video, Briefcase,
  Send, Bell, Building2, Stamp, LogOut, Languages, Menu, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FraudBanner } from "./StrategyBanner";

type NavItem = { to: string; labelKey: string; icon: typeof LayoutDashboard; exact?: boolean };
const items: NavItem[] = [
  { to: "/app", labelKey: "dashboard", icon: LayoutDashboard, exact: true },
  { to: "/app/perfil", labelKey: "profile", icon: User },
  { to: "/app/curriculo", labelKey: "resume", icon: FileText },
  { to: "/app/midia", labelKey: "media", icon: ImageIcon },
  { to: "/app/video", labelKey: "intro_video", icon: Video },
  { to: "/app/vagas", labelKey: "jobs", icon: Briefcase },
  { to: "/app/candidaturas", labelKey: "applications", icon: Send },
  { to: "/app/followups", labelKey: "followups", icon: Bell },
  { to: "/app/empregadores", labelKey: "employers", icon: Building2 },
  { to: "/app/visto", labelKey: "visa", icon: Stamp },
];

export function AppShell({ children }: { children?: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const onLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const Sidebar = (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r bg-card">
      <div className="flex items-center justify-between p-4">
        <Link to="/app" className="text-lg font-bold text-primary">VaiPraLá</Link>
        <button onClick={() => setOpen(false)} className="lg:hidden"><X className="size-5" /></button>
      </div>
      <nav className="flex-1 space-y-1 px-2">
        {items.map((it) => {
          const active = it.exact ? pathname === it.to : pathname.startsWith(it.to);
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                active ? "bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              <Icon className="size-4" />
              <span>{t(it.labelKey)}</span>
            </Link>
          );
        })}
      </nav>
      <div className="space-y-2 border-t p-3">
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => setLang(lang === "pt" ? "en" : "pt")}>
          <Languages className="size-4" /> {lang === "pt" ? "EN" : "PT"}
        </Button>
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onLogout}>
          <LogOut className="size-4" /> {t("logout")}
        </Button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">{Sidebar}</div>
      {open && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative z-50">{Sidebar}</div>
        </div>
      )}
      <main className="flex-1">
        <header className="flex items-center gap-3 border-b bg-card p-3 lg:hidden">
          <button onClick={() => setOpen(true)}><Menu className="size-5" /></button>
          <span className="font-semibold">VaiPraLá</span>
        </header>
        <div className="mx-auto max-w-6xl p-4 lg:p-6">
          {children ?? <Outlet />}
          <FraudBanner />
        </div>
      </main>
    </div>
  );
}
