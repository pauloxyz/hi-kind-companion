import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard, User, FileText, Image as ImageIcon, Video, Briefcase,
  Send, Bell, Building2, Stamp, LogOut, Menu, X, Sparkles, GraduationCap,
  Sun, Moon, Monitor, Shield, Settings,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useTheme, type Theme } from "@/lib/theme";
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
  {
    label: "Conta",
    items: [
      { to: "/app/configuracoes", labelKey: "settings", icon: Settings },
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
  const { theme, setTheme } = useTheme();
  const logAccount = useServerFn(logAccountEvent);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [unreadReplies, setUnreadReplies] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.from("my_profile").select("onboarding_completed_at").maybeSingle().then(({ data }) => {
      if (!cancelled) setShowOnboarding(!data?.onboarding_completed_at);
    });
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase.rpc("has_role", { _user_id: data.user.id, _role: "admin" }).then(({ data: ok }) => {
        if (!cancelled) setIsAdmin(!!ok);
      });
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
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="lg:hidden text-muted-foreground hover:text-foreground rounded-md p-1 min-h-11 min-w-11 inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Fechar menu"
        >
          <X className="size-5" aria-hidden />
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

        {isAdmin && (
          <div className="mt-5">
            <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Admin
            </p>
            <div className="space-y-0.5">
              {renderItem({ to: "/app/auditoria", labelKey: "Auditoria", icon: Shield })}
            </div>
          </div>
        )}
      </nav>

      <div className="border-t bg-card/40 p-3 space-y-3">
        <div>
          <p id="a11y-section-label" className="px-2 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Acessibilidade
          </p>
          <div
            role="radiogroup"
            aria-label="Idioma"
            className="grid grid-cols-3 gap-1 px-1"
          >
            {LANG_OPTIONS.map((opt) => {
              const selected = lang === opt.code;
              return (
                <button
                  key={opt.code}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`Idioma ${opt.label}`}
                  onClick={() => setLang(opt.code)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 rounded-md border py-1.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-background text-foreground/70 hover:bg-accent hover:text-foreground",
                  )}
                >
                  <span className="text-base leading-none" aria-hidden>{opt.flag}</span>
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
          <div
            role="radiogroup"
            aria-label="Tema visual"
            className="mt-2 grid grid-cols-3 gap-1 px-1"
          >
            {(
              [
                { code: "light", label: "Claro", Icon: Sun },
                { code: "dark", label: "Escuro", Icon: Moon },
                { code: "system", label: "Auto", Icon: Monitor },
              ] as { code: Theme; label: string; Icon: typeof Sun }[]
            ).map(({ code, label, Icon }) => {
              const selected = theme === code;
              return (
                <button
                  key={code}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`Tema ${label}`}
                  onClick={() => setTheme(code)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 rounded-md border py-1.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-background text-foreground/70 hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-foreground/75 hover:text-foreground"
          onClick={onLogout}
        >
          <LogOut className="size-4 text-muted-foreground" aria-hidden />
          <span className="flex-1 text-left">{t("logout")}</span>
        </Button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-dvh bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Pular para o conteúdo
      </a>
      <div className="hidden lg:block">{Sidebar}</div>
      {open && (
        <div className="fixed inset-0 z-40 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Menu de navegação">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
          <div className="relative z-50">{Sidebar}</div>
        </div>
      )}
      <main id="main-content" className="flex-1 min-w-0">
        <header className="flex items-center gap-3 border-b bg-card p-3 lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-foreground inline-flex items-center justify-center rounded-md min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Abrir menu"
          >
            <Menu className="size-5" aria-hidden />
          </button>
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
