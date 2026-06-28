import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard, User, FileText, Image as ImageIcon, Video, Briefcase,
  Send, Bell, Building2, Stamp, LogOut, Languages, Menu, X, Sparkles, GraduationCap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FraudBanner } from "./StrategyBanner";
import { OnboardingTour } from "./OnboardingTour";
import logoUrl from "@/assets/vaiprala-logo.png";

type NavItem = {
  to: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  highlight?: boolean;
  badgeKey?: "unreadReplies";
};
type NavGroup = { label: string; items: NavItem[] };

// Top-level (no group label)
const topItems: NavItem[] = [
  { to: "/app", labelKey: "dashboard", icon: LayoutDashboard, exact: true },
];

const groups: NavGroup[] = [
  {
    label: "Preparação",
    items: [
      { to: "/app/perfil", labelKey: "profile", icon: User },
      { to: "/app/curriculo", labelKey: "resume", icon: FileText },
      { to: "/app/midia", labelKey: "media", icon: ImageIcon },
      { to: "/app/video", labelKey: "intro_video", icon: Video },
      { to: "/app/ingles", labelKey: "english_course", icon: GraduationCap },
      { to: "/app/visto", labelKey: "visa", icon: Stamp },
    ],
  },
  {
    label: "Busca de vagas",
    items: [
      { to: "/app/vagas", labelKey: "jobs", icon: Briefcase },
      { to: "/app/candidaturas", labelKey: "applications", icon: Send, badgeKey: "unreadReplies" },
      { to: "/app/followups", labelKey: "followups", icon: Bell },
      { to: "/app/empregadores", labelKey: "employers", icon: Building2 },
    ],
  },
];

const LANG_OPTIONS: { code: "pt" | "en" | "es"; label: string; flag: string }[] = [
  { code: "pt", label: "PT", flag: "🇧🇷" },
  { code: "en", label: "EN", flag: "🇺🇸" },
  { code: "es", label: "ES", flag: "🇪🇸" },
];

export function AppShell({ children }: { children?: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [unreadReplies, setUnreadReplies] = useState(0);

  useEffect(() => {
    let cancelled = false;
    supabase.from("my_profile").select("onboarding_completed_at").maybeSingle().then(({ data }) => {
      if (!cancelled) setShowOnboarding(!data?.onboarding_completed_at);
    });
    const lastSeen = typeof window !== "undefined" ? window.localStorage.getItem("lastSeenRespondedAt") : null;
    const since = lastSeen ? new Date(Number(lastSeen)).toISOString() : new Date(0).toISOString();
    supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .not("responded_at", "is", null)
      .gte("responded_at", since)
      .then(({ count }) => {
        if (!cancelled) setUnreadReplies(count ?? 0);
      });
    return () => { cancelled = true; };
  }, [pathname]);

  const topItemsFinal: NavItem[] = showOnboarding
    ? [{ to: "/app/comecar", labelKey: "comecar", icon: Sparkles, highlight: true }, ...topItems]
    : topItems;

  const onLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const renderItem = (it: NavItem) => {
    const active = it.exact ? pathname === it.to : pathname.startsWith(it.to);
    const Icon = it.icon;
    const badge = it.badgeKey === "unreadReplies" ? unreadReplies : 0;
    return (
      <Link
        key={it.to}
        to={it.to}
        onClick={() => setOpen(false)}
        className={cn(
          "group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
          active
            ? "bg-primary text-primary-foreground shadow-sm"
            : it.highlight
              ? "bg-accent-gold/15 text-foreground font-semibold hover:bg-accent-gold/25"
              : "text-foreground/75 hover:bg-accent hover:text-foreground",
        )}
      >
        <Icon className={cn("size-4 shrink-0", active ? "" : "text-muted-foreground group-hover:text-foreground")} />
        <span className="flex-1 truncate">{t(it.labelKey)}</span>
        {badge > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-red px-1.5 text-[10px] font-bold text-white">
            {badge}
          </span>
        )}
      </Link>
    );
  };

  const Sidebar = (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-sidebar">
      <div className="flex items-center justify-between p-4">
        <Link to="/app" className="flex items-center gap-2">
          <img src={logoUrl} alt="VaiPraLá" className="h-8 w-auto" />
        </Link>
        <button onClick={() => setOpen(false)} className="lg:hidden text-muted-foreground hover:text-foreground">
          <X className="size-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <div className="space-y-0.5">
          {topItemsFinal.map(renderItem)}
        </div>

        {groups.map((g) => (
          <div key={g.label} className="mt-5">
            <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {g.label}
            </p>
            <div className="space-y-0.5">{g.items.map(renderItem)}</div>
          </div>
        ))}
      </nav>

      <div className="border-t bg-card/40 p-3">
        <p className="px-2 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Conta
        </p>
        <div className="space-y-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-foreground/75 hover:text-foreground"
            onClick={() => setLang(lang === "pt" ? "en" : "pt")}
          >
            <Languages className="size-4 text-muted-foreground" />
            <span className="flex-1 text-left">{lang === "pt" ? "Idioma · EN" : "Language · PT"}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-foreground/75 hover:text-foreground"
            onClick={onLogout}
          >
            <LogOut className="size-4 text-muted-foreground" />
            <span className="flex-1 text-left">{t("logout")}</span>
          </Button>
        </div>
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
      <main className="flex-1 min-w-0">
        <header className="flex items-center gap-3 border-b bg-card p-3 lg:hidden">
          <button onClick={() => setOpen(true)} className="text-foreground"><Menu className="size-5" /></button>
          <img src={logoUrl} alt="VaiPraLá" className="h-6 w-auto" />
        </header>
        <div className="mx-auto max-w-6xl p-4 lg:p-6">
          {children ?? <Outlet />}
          <FraudBanner />
        </div>
      </main>
      <OnboardingTour />
    </div>
  );
}
