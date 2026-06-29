import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { logAccountEvent } from "@/lib/security-audit.functions";
import {
  LayoutDashboard, User, FileText, Image as ImageIcon, Video, Briefcase,
  Send, Bell, Building2, Stamp, LogOut, Menu, X, Sparkles, GraduationCap,
  Sun, Moon, Monitor, Shield, Settings, Search,
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
  const [fullName, setFullName] = useState<string>("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [appsCount, setAppsCount] = useState(0);
  const [respondedCount, setRespondedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("my_profile")
      .select("onboarding_completed_at, full_name, photo_url")
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setShowOnboarding(!data?.onboarding_completed_at);
        setFullName(data?.full_name ?? "");
        setPhotoUrl(data?.photo_url ?? null);
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
    supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .then(({ count }) => {
        if (!cancelled) setAppsCount(count ?? 0);
      });
    supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .not("responded_at", "is", null)
      .then(({ count }) => {
        if (!cancelled) setRespondedCount(count ?? 0);
      });
    return () => { cancelled = true; };
  }, [pathname]);

  // Journey stages: Cadastro · Currículo · Candidaturas · Respostas
  const stages = [
    { key: "cadastro", label: "Cadastro", done: true },
    { key: "curriculo", label: "Currículo", done: !showOnboarding },
    { key: "candidaturas", label: "Candidaturas", done: appsCount > 0 },
    { key: "respostas", label: "Entrevistas", done: respondedCount > 0 },
  ];
  const doneCount = stages.filter((s) => s.done).length;
  const progressPct = Math.round((doneCount / stages.length) * 100);
  const currentStage = stages.find((s) => !s.done)?.label ?? "Embarque";
  const initials = (fullName || "Você")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();


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
          "group flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm transition-all",
          active
            ? "bg-emerald-800/30 text-white border border-emerald-700/30 shadow-inner"
            : it.highlight
              ? "bg-[#b56d2d]/15 text-[#f0c08a] font-semibold hover:bg-[#b56d2d]/25"
              : "text-emerald-100/60 hover:text-white hover:bg-emerald-800/15",
        )}
      >
        <Icon
          className={cn(
            "size-[18px] shrink-0 transition-colors",
            active ? "text-[#b56d2d]" : "opacity-70 group-hover:opacity-100",
          )}
        />
        <span className="flex-1 truncate font-medium">{t(it.labelKey)}</span>
        {badge > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white border-2 border-[#1a2e24]">
            {badge}
          </span>
        )}
      </Link>
    );
  };

  const Sidebar = (
    <aside className="flex h-full w-72 shrink-0 flex-col bg-[#1a2e24] text-stone-200 overflow-hidden">
      {/* Header */}
      <div className="p-5 pb-2">
        <div className="flex items-center justify-between mb-6">
          <Link to="/app" className="flex items-center gap-3" onClick={() => setOpen(false)}>
            <div className="w-10 h-10 bg-[#b56d2d] rounded-xl flex items-center justify-center shadow-lg shadow-black/30">
              <Sparkles className="size-5 text-white" aria-hidden />
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight tracking-tight text-white uppercase italic">
                Jornada <span className="text-[#b56d2d] not-italic">H-2A</span>
              </h1>
              <p className="text-[10px] text-emerald-500 font-bold tracking-widest leading-none mt-0.5">
                TRABALHO RURAL
              </p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="lg:hidden text-emerald-300/60 hover:text-white rounded-md p-1 min-h-11 min-w-11 inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56d2d]"
            aria-label="Fechar menu"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {/* Journey Progress Card */}
        <div className="bg-emerald-900/30 border border-emerald-800/40 rounded-2xl p-4 mb-2">
          <div className="flex items-center gap-3 mb-3">
            <div className="relative shrink-0">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt=""
                  className="w-10 h-10 rounded-full border-2 border-[#b56d2d] object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full border-2 border-[#b56d2d] bg-emerald-950 flex items-center justify-center text-[#b56d2d] text-xs font-bold">
                  {initials}
                </div>
              )}
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-[#1a2e24] rounded-full" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-white truncate">
                {fullName || "Olá!"}
              </div>
              <div className="text-[10px] text-emerald-400/80 font-bold truncate uppercase tracking-tighter">
                Fase: {currentStage}
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] font-bold">
              <span className="text-emerald-500/90 uppercase tracking-tighter">Progresso</span>
              <span className="text-[#b56d2d]">{progressPct}%</span>
            </div>
            <div
              className="h-1.5 w-full bg-emerald-950 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progresso da jornada H-2A"
            >
              <div
                className="h-full bg-[#b56d2d] shadow-[0_0_10px_rgba(181,109,45,0.4)] transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-2 space-y-5">
        <div className="space-y-0.5">
          {topItemsFinal.map(renderItem)}
        </div>

        {groups.map((g) => (
          <section key={g.label}>
            <h3 className="px-4 mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-600/70">
              {g.label}
            </h3>
            <div className="space-y-0.5">{g.items.map(renderItem)}</div>
          </section>
        ))}

        {isAdmin && (
          <section>
            <h3 className="px-4 mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-600/70">
              Admin
            </h3>
            <div className="space-y-0.5">
              {renderItem({ to: "/app/auditoria", labelKey: "Auditoria", icon: Shield })}
              {renderItem({ to: "/admin/seo", labelKey: "SEO scans", icon: Search })}
            </div>
          </section>
        )}
      </nav>

      {/* Footer */}
      <div className="mt-auto p-4 bg-black/20 border-t border-emerald-900/50 space-y-2">
        <div role="radiogroup" aria-label="Idioma" className="flex items-center gap-1 bg-emerald-950/40 rounded-lg p-1">
          {LANG_OPTIONS.map((opt) => {
            const selected = lang === opt.code;
            return (
              <button
                key={opt.code}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`Idioma ${opt.label}`}
                onClick={() => {
                  if (lang !== opt.code) {
                    setLang(opt.code);
                    logAccount({ data: { event_type: "language_changed", metadata: { to: opt.code, from: lang, source: "appshell" } } }).catch(() => {});
                  }
                }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56d2d]",
                  selected ? "bg-[#b56d2d] text-white shadow" : "text-emerald-200/60 hover:text-white",
                )}
              >
                <span aria-hidden className="text-sm leading-none">{opt.flag}</span>
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        <div role="radiogroup" aria-label="Tema visual" className="flex items-center gap-1 bg-emerald-950/40 rounded-lg p-1">
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
                onClick={() => {
                  if (theme !== code) {
                    setTheme(code);
                    logAccount({ data: { event_type: "theme_changed", metadata: { to: code, from: theme, source: "appshell" } } }).catch(() => {});
                  }
                }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b56d2d]",
                  selected ? "bg-[#b56d2d] text-white shadow" : "text-emerald-200/60 hover:text-white",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2 mt-1 rounded-lg text-red-400/70 hover:text-red-300 hover:bg-red-500/10 transition-colors text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          <LogOut className="size-4" aria-hidden />
          <span className="flex-1 text-left">{t("logout")}</span>
        </button>
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
