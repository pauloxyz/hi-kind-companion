import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { logAccountEvent } from "@/lib/security-audit.functions";
import {
  LayoutDashboard, User, FileText, Image as ImageIcon, Video, Briefcase,
  Send, Bell, Building2, Stamp, LogOut, Menu, X, Sparkles, GraduationCap,
  Sun, Moon, Monitor, Shield, Settings, Search, Mail,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

import { FraudBanner } from "./StrategyBanner";
import { JourneyLiveRegion } from "./JourneyLiveRegion";
import { OnboardingTour } from "./OnboardingTour";
import { ActionFeedbackProvider } from "./ActionFeedback";
import logoUrl from "@/assets/vaiprala-logo.png";
import { computeJourney } from "@/lib/h2a-journey";
import { createShortcutMatcher } from "@/lib/sidebar-shortcuts";
import { createAnnouncementDebouncer, shouldAnnounceJourney } from "@/lib/journey-announcement";

type NavItem = {
  to: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  highlight?: boolean;
  badgeKey?: "unreadReplies";
  countKey?: "savedJobs" | "applications";
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
      { to: "/app/vagas", labelKey: "jobs", icon: Briefcase, countKey: "savedJobs" },
      { to: "/app/candidaturas", labelKey: "applications", icon: Send, badgeKey: "unreadReplies", countKey: "applications" },
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
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [unreadReplies, setUnreadReplies] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [fullName, setFullName] = useState<string>("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [appsCount, setAppsCount] = useState<number | null>(null);
  const [savedJobsCount, setSavedJobsCount] = useState<number | null>(null);
  const [visaSteps, setVisaSteps] = useState<Record<string, boolean>>({});

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
        setProfileLoaded(true);
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
      .from("saved_jobs")
      .select("id", { count: "exact", head: true })
      .then(({ count }) => {
        if (!cancelled) setSavedJobsCount(count ?? 0);
      });
    supabase
      .from("visa_checklist_items")
      .select("step_key, is_completed")
      .then(({ data }) => {
        if (cancelled || !data) return;
        const m: Record<string, boolean> = {};
        for (const r of data) m[r.step_key] = !!r.is_completed;
        setVisaSteps(m);
      });
    return () => { cancelled = true; };
  }, [pathname]);

  // Jornada H-2A: derivada de onboarding + candidaturas + checklist de visto
  const journey = computeJourney({
    onboardingDone: !showOnboarding,
    appsCount: appsCount ?? 0,
    visaSteps,
  });
  const { stages, doneCount, progressPct, currentStage } = journey;
  const initials = (fullName || "Você")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Aria-live: anuncia mudanças de fase/progresso da Jornada H-2A.
  // Coalescemos mudanças em rajada (ex.: vários fetches resolvendo juntos)
  // em uma única mensagem, sempre com o snapshot mais recente.
  const [journeyAnnouncement, setJourneyAnnouncement] = useState<string>("");
  const prevJourneyRef = useRef<{ doneCount: number; total: number; currentStage: string } | null>(null);
  const debouncerRef = useRef<ReturnType<typeof createAnnouncementDebouncer> | null>(null);
  if (debouncerRef.current === null && typeof window !== "undefined") {
    debouncerRef.current = createAnnouncementDebouncer((msg) => setJourneyAnnouncement(msg), 600);
  }
  useEffect(() => {
    if (appsCount === null) return; // dados ainda carregando
    const next = { doneCount, total: stages.length, currentStage };
    const prev = prevJourneyRef.current;
    prevJourneyRef.current = next;
    if (!shouldAnnounceJourney(prev, next)) return;
    debouncerRef.current?.schedule(next);
  }, [doneCount, currentStage, stages.length, appsCount]);
  useEffect(() => () => debouncerRef.current?.cancel(), []);

  // Drawer mobile: trap focus, fecha com Escape e bloqueia scroll do body.
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const getFocusables = (): HTMLElement[] => {
      const root = drawerRef.current;
      if (!root) return [];
      const sel =
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      return Array.from(root.querySelectorAll<HTMLElement>(sel)).filter(
        (el) => !el.hasAttribute("aria-hidden") && el.offsetParent !== null,
      );
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const items = getFocusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      // Focus trap: ciclar Tab dentro do drawer.
      if (e.shiftKey && (active === first || !drawerRef.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => closeBtnRef.current?.focus(), 30);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      window.clearTimeout(focusTimer);
      menuTriggerRef.current?.focus();
    };
  }, [open]);

  // Atalhos globais: G seguido de V (vagas), C (currículo), J (jornada/dashboard).
  // Bloqueia disparo enquanto o usuário está digitando em input/textarea/contenteditable.
  useEffect(() => {
    const matcher = createShortcutMatcher();
    const onKey = (e: KeyboardEvent) => {
      const hit = matcher.handle(e, e.target);
      if (!hit) return;
      e.preventDefault();
      navigate({ to: hit.to });
      toast.success(`Atalho: ${hit.label}`, {
        description: `Pressionou G + ${e.key.toUpperCase()}`,
        duration: 1600,
      });
    };
    const onBlur = () => matcher.reset();
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [navigate]);




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
    const badge = it.badgeKey === "unreadReplies" ? unreadReplies : null;
    const count =
      it.countKey === "savedJobs" ? savedJobsCount :
      it.countKey === "applications" ? appsCount : null;
    const countLoading = it.countKey != null && count === null;
    const badgeLoading = it.badgeKey != null && badge === null;
    const hasCount = typeof count === "number" && count > 0;
    const hasBadge = typeof badge === "number" && badge > 0;
    return (
      <Link
        key={it.to}
        to={it.to}
        id={`nav-${it.labelKey}`}
        onClick={() => setOpen(false)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground border border-sidebar-border shadow-inner"
            : it.highlight
              ? "bg-sidebar-primary/15 text-sidebar-primary font-semibold hover:bg-sidebar-primary/25"
              : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60",
        )}
      >
        <Icon
          className={cn(
            "size-[18px] shrink-0 transition-colors",
            active ? "text-sidebar-primary" : "opacity-70 group-hover:opacity-100",
          )}
        />
        <span className="flex-1 truncate font-medium">{t(it.labelKey)}</span>
        {(countLoading || badgeLoading) && (
          <span
            className="h-3 w-6 rounded-full bg-sidebar-foreground/10 animate-pulse"
            aria-label="Carregando"
          />
        )}
        {!badgeLoading && !hasBadge && hasCount && (
          <span className="text-[10px] font-bold tabular-nums text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70">
            {count}
          </span>
        )}
        {hasBadge && (
          <span
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-red px-1.5 text-[10px] font-bold text-accent-red-foreground border-2 border-sidebar"
            aria-label={`${badge} respostas novas`}
          >
            {badge}
          </span>
        )}
      </Link>
    );
  };

  const Sidebar = (
    <nav
      className="flex h-full w-72 max-w-[85vw] shrink-0 flex-col bg-sidebar text-sidebar-foreground overflow-hidden"
      aria-label="Navegação principal"
    >
      {/* Header */}
      <div className="p-5 pb-2">
        <div className="flex items-center justify-between mb-6">
          <Link to="/app" className="flex items-center gap-3 min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring rounded-md" onClick={() => setOpen(false)}>
            <div className="w-10 h-10 shrink-0 bg-sidebar-primary rounded-xl flex items-center justify-center shadow-lg shadow-black/30">
              <Sparkles className="size-5 text-sidebar-primary-foreground" aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-base leading-tight tracking-tight text-sidebar-foreground uppercase italic truncate">
                Jornada <span className="text-sidebar-primary not-italic">H-2A</span>
              </h1>
              <p className="text-[10px] text-sidebar-primary/80 font-bold tracking-widest leading-none mt-0.5">
                TRABALHO RURAL
              </p>
            </div>
          </Link>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={() => setOpen(false)}
            className="lg:hidden text-sidebar-foreground/60 hover:text-sidebar-foreground rounded-md p-1 min-h-11 min-w-11 shrink-0 inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            aria-label="Fechar menu"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {/* Journey Progress Card */}
        <div className="bg-sidebar-accent/50 border border-sidebar-border rounded-2xl p-4 mb-2">
          <div className="flex items-center gap-3 mb-3">
            <div className="relative shrink-0">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt={fullName ? `Foto de ${fullName}` : "Foto do perfil"}
                  className="w-10 h-10 rounded-full border-2 border-sidebar-primary object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full border-2 border-sidebar-primary bg-sidebar flex items-center justify-center text-sidebar-primary text-xs font-bold">
                  {initials}
                </div>
              )}
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-sidebar rounded-full" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-sidebar-foreground truncate">
                {fullName || "Olá!"}
              </div>
              <div className="text-[10px] text-sidebar-primary/90 font-bold truncate uppercase tracking-tighter">
                Fase: {currentStage}
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] font-bold">
              <span className="text-sidebar-foreground/60 uppercase tracking-tighter">
                Progresso · {doneCount}/{stages.length}
              </span>
              <span className="text-sidebar-primary">{progressPct}%</span>
            </div>
            <div
              className="h-1.5 w-full bg-sidebar rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progresso da jornada H-2A: ${progressPct}%, fase atual ${currentStage}`}
            >
              <div
                className="h-full bg-sidebar-primary shadow-[0_0_10px_rgba(181,109,45,0.4)] transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 pt-2 space-y-5" role="navigation" aria-label="Seções do app">
        <div className="space-y-0.5">
          {topItemsFinal.map(renderItem)}
        </div>

        {groups.map((g) => (
          <section key={g.label} aria-label={g.label}>
            <h3 className="px-4 mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-sidebar-foreground/40">
              {g.label}
            </h3>
            <div className="space-y-0.5">{g.items.map(renderItem)}</div>
          </section>
        ))}


        {isAdmin && (
          <section aria-label="Admin">
            <h3 className="px-4 mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-sidebar-foreground/40">
              Admin
            </h3>
            <div className="space-y-0.5">
              {renderItem({ to: "/app/auditoria", labelKey: "Auditoria", icon: Shield })}
              {renderItem({ to: "/admin/seo", labelKey: "SEO scans", icon: Search })}
              {renderItem({ to: "/app/admin/emails", labelKey: "E-mails", icon: Mail })}
            </div>
          </section>
        )}
      </div>

      {/* Footer */}
      <div className="mt-auto p-4 bg-sidebar-foreground/5 border-t border-sidebar-border space-y-2">
        <div role="radiogroup" aria-label="Idioma" className="flex items-center gap-1 bg-sidebar/60 rounded-lg p-1">
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
                  "flex-1 flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  selected ? "bg-sidebar-primary text-sidebar-primary-foreground shadow" : "text-sidebar-foreground/60 hover:text-sidebar-foreground",
                )}
              >
                <span aria-hidden className="text-sm leading-none">{opt.flag}</span>
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        <div role="radiogroup" aria-label="Tema visual" className="flex items-center gap-1 bg-sidebar/60 rounded-lg p-1">
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
                  "flex-1 flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  selected ? "bg-sidebar-primary text-sidebar-primary-foreground shadow" : "text-sidebar-foreground/60 hover:text-sidebar-foreground",
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
          className="w-full flex items-center gap-3 px-3 py-2 mt-1 rounded-lg text-accent-red/80 hover:text-accent-red hover:bg-accent-red/10 transition-colors text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-red"
        >
          <LogOut className="size-4" aria-hidden />
          <span className="flex-1 text-left">{t("logout")}</span>
        </button>
      </div>
    </nav>
  );


  return (
    <ActionFeedbackProvider>
      <div className="flex min-h-dvh bg-background">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
        >
          Pular para o conteúdo
        </a>
        <div className="hidden lg:block">{Sidebar}</div>
        {open && (
          <div
            id="app-mobile-sidebar"
            className="fixed inset-0 z-40 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navegação"
          >
            {/* Translucent backdrop: keeps the underlying page visible
                (~70% opacity) so the user keeps context of where they were. */}
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px] motion-safe:animate-fade-in"
            />
            {/* Drawer panel: 85% width capped at sm, slides in from the
                left, leaving ~15% of the page visible on the right. */}
            <div
              ref={drawerRef}
              className="absolute inset-y-0 left-0 w-[85vw] max-w-sm shadow-2xl shadow-black/40 motion-safe:animate-[drawer-slide-in_240ms_ease-out] focus:outline-none"
            >
              {Sidebar}
              <button
                ref={closeBtnRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
                className="absolute top-3 right-3 inline-flex items-center justify-center rounded-md min-h-11 min-w-11 text-sidebar-foreground/80 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
          </div>
        )}
        <main id="main-content" className="flex-1 min-w-0">
          <header className="flex items-center gap-3 border-b bg-card p-3 lg:hidden">
            <button
              ref={menuTriggerRef}
              type="button"
              onClick={() => setOpen(true)}
              aria-expanded={open}
              aria-controls="app-mobile-sidebar"
              className="text-foreground inline-flex items-center justify-center rounded-md min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Abrir menu"
              data-testid="drawer-trigger"
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
        {profileLoaded && showOnboarding && <OnboardingTour />}
        {/* Anúncio acessível das mudanças de fase/progresso da Jornada H-2A */}
        <JourneyLiveRegion message={journeyAnnouncement} />
      </div>
    </ActionFeedbackProvider>
  );
}
