import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Lang = "pt" | "en" | "es";
type Dict = Record<string, { pt: string; en: string; es: string }>;

const dict: Dict = {
  app_name: { pt: "VaiPraLá", en: "VaiPraLá", es: "VaiPraLá" },
  comecar: { pt: "Começar aqui", en: "Start here", es: "Comenzar aquí" },
  dashboard: { pt: "Painel", en: "Dashboard", es: "Tablero" },
  profile: { pt: "Meu Perfil", en: "My Profile", es: "Mi Perfil" },
  resume: { pt: "Currículo", en: "Resume", es: "Currículum" },
  media: { pt: "Mídia de Trabalho", en: "Work Media", es: "Fotos del Trabajo" },
  intro_video: { pt: "Vídeo de Apresentação", en: "Intro Video", es: "Video de Presentación" },
  english_course: { pt: "Inglês", en: "English", es: "Inglés" },
  jobs: { pt: "Vagas", en: "Jobs", es: "Vacantes" },
  applications: { pt: "Candidaturas", en: "Applications", es: "Postulaciones" },
  followups: { pt: "Follow-ups", en: "Follow-ups", es: "Seguimientos" },
  employers: { pt: "Empregadores", en: "Employers", es: "Empleadores" },
  visa: { pt: "Checklist do Visto", en: "Visa Checklist", es: "Lista de la Visa" },
  settings: { pt: "Configurações", en: "Settings", es: "Configuración" },
  logout: { pt: "Sair", en: "Sign out", es: "Cerrar sesión" },
  login: { pt: "Entrar", en: "Sign in", es: "Iniciar sesión" },
  email: { pt: "E-mail", en: "Email", es: "Correo electrónico" },
  password: { pt: "Senha", en: "Password", es: "Contraseña" },
  quality_score: { pt: "Score de Qualidade da Candidatura", en: "Application Quality Score", es: "Puntuación de Calidad de la Postulación" },
  strategy_banner: {
    pt: "Rapidez + Volume + Clareza + Confiabilidade aumentam sua chance de resposta. Aplique em vagas novas, todos os dias, com prova visual do seu trabalho.",
    en: "Speed + Volume + Clarity + Reliability boost your reply rate. Apply to fresh jobs daily, with visual proof of your work.",
    es: "Rapidez + Volumen + Claridad + Confiabilidad aumentan tu tasa de respuesta. Postúlate a vacantes nuevas cada día, con pruebas visuales de tu trabajo.",
  },
  fraud_banner: {
    pt: "Nunca pague para conseguir uma vaga H-2A. Isso é ilegal e é sinal de fraude.",
    en: "Never pay to get an H-2A job. It is illegal and a fraud sign.",
    es: "Nunca pagues por conseguir una vacante H-2A. Es ilegal y es señal de fraude.",
  },
  save: { pt: "Salvar", en: "Save", es: "Guardar" },
  saved: { pt: "Salvo", en: "Saved", es: "Guardado" },
  loading: { pt: "Carregando...", en: "Loading...", es: "Cargando..." },
  total_sent: { pt: "Candidaturas enviadas", en: "Applications sent", es: "Postulaciones enviadas" },
  response_rate: { pt: "Taxa de resposta", en: "Response rate", es: "Tasa de respuesta" },
  followups_sent: { pt: "Follow-ups enviados", en: "Follow-ups sent", es: "Seguimientos enviados" },
  hired: { pt: "Contratações", en: "Hired", es: "Contrataciones" },
  apply: { pt: "Candidatar-se", en: "Apply", es: "Postularme" },
  mass_apply: { pt: "Aplicação em massa", en: "Bulk apply", es: "Postulación masiva" },
  refresh_jobs: { pt: "🔄 Buscar vagas agora", en: "🔄 Fetch jobs now", es: "🔄 Buscar vacantes ahora" },
  backfill_jobs: { pt: "Backfill últimos 15 dias", en: "Backfill last 15 days", es: "Recargar últimos 15 días" },

  // Audit panel
  audit_title: { pt: "Auditoria de Segurança", en: "Security Audit", es: "Auditoría de Seguridad" },
  audit_window: { pt: "Janela", en: "Window", es: "Ventana" },
  audit_retention: { pt: "Retenção automática", en: "Auto retention", es: "Retención automática" },
  audit_days: { pt: "dias", en: "days", es: "días" },
  audit_export_csv: { pt: "Exportar CSV", en: "Export CSV", es: "Exportar CSV" },
  audit_export_pdf: { pt: "Exportar PDF", en: "Export PDF", es: "Exportar PDF" },
  audit_generating: { pt: "Gerando…", en: "Generating…", es: "Generando…" },
  audit_tab_alerts: { pt: "Alertas de Risco", en: "Risk Alerts", es: "Alertas de Riesgo" },
  audit_tab_events: { pt: "Eventos", en: "Events", es: "Eventos" },
  audit_tab_trend: { pt: "Tendência", en: "Trend", es: "Tendencia" },
  audit_tab_retention: { pt: "Retenção", en: "Retention", es: "Retención" },
  audit_show_acked: { pt: "Mostrar tratados", en: "Show acknowledged", es: "Mostrar tratados" },
  audit_hide_acked: { pt: "Ocultar tratados", en: "Hide acknowledged", es: "Ocultar tratados" },
  audit_search_placeholder: { pt: "Buscar por IP, recurso, user_id, hash, metadata…", en: "Search by IP, resource, user_id, hash, metadata…", es: "Buscar por IP, recurso, user_id, hash, metadata…" },
  audit_kpi_hibp: { pt: "HIBP bloqueados", en: "HIBP blocks", es: "HIBP bloqueados" },
  audit_kpi_weak: { pt: "Senhas fracas", en: "Weak passwords", es: "Contraseñas débiles" },
  audit_kpi_auth_fail: { pt: "Falhas auth", en: "Auth failures", es: "Fallos de auth" },
  audit_kpi_pii: { pt: "Acessos PII", en: "PII accesses", es: "Accesos PII" },
  audit_action: { pt: "Ação", en: "Action", es: "Acción" },
  audit_reopen: { pt: "Reabrir", en: "Reopen", es: "Reabrir" },
  audit_acknowledge: { pt: "Tratar", en: "Acknowledge", es: "Tratar" },

  // Settings
  settings_title: { pt: "Configurações", en: "Settings", es: "Configuración" },
  settings_language: { pt: "Idioma", en: "Language", es: "Idioma" },
  settings_theme: { pt: "Tema", en: "Theme", es: "Tema" },
  settings_security: { pt: "Segurança", en: "Security", es: "Seguridad" },
  settings_export_data: { pt: "Exportar meus dados", en: "Export my data", es: "Exportar mis datos" },
  settings_delete_account: { pt: "Excluir conta", en: "Delete account", es: "Eliminar cuenta" },
  settings_change_email: { pt: "Alterar e-mail", en: "Change email", es: "Cambiar correo" },

  // Common
  cancel: { pt: "Cancelar", en: "Cancel", es: "Cancelar" },
  close: { pt: "Fechar", en: "Close", es: "Cerrar" },
  copy: { pt: "Copiar", en: "Copy", es: "Copiar" },
};

type I18nCtx = { lang: Lang; setLang: (l: Lang) => void; t: (k: keyof typeof dict | string) => string };
const Ctx = createContext<I18nCtx>({ lang: "pt", setLang: () => {}, t: (k) => k as string });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("pt");
  useEffect(() => {
    const saved = typeof window !== "undefined" ? (localStorage.getItem("lang") as Lang | null) : null;
    const initial: Lang = saved === "pt" || saved === "en" || saved === "es" ? saved : "pt";
    setLangState(initial);
    if (typeof document !== "undefined") document.documentElement.lang = initial;
  }, []);
  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") localStorage.setItem("lang", l);
    if (typeof document !== "undefined") document.documentElement.lang = l;
  };
  const t = (k: string) => (dict[k] ? dict[k][lang] : k);
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
