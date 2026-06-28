import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Lang = "pt" | "en";
type Dict = Record<string, { pt: string; en: string }>;

const dict: Dict = {
  app_name: { pt: "VaiPraLá", en: "VaiPraLá" },
  comecar: { pt: "Começar aqui", en: "Start here" },
  dashboard: { pt: "Dashboard", en: "Dashboard" },
  profile: { pt: "Meu Perfil", en: "My Profile" },
  resume: { pt: "Currículo", en: "Resume" },
  media: { pt: "Mídia de Trabalho", en: "Work Media" },
  intro_video: { pt: "Vídeo de Apresentação", en: "Intro Video" },
  jobs: { pt: "Vagas", en: "Jobs" },
  applications: { pt: "Candidaturas", en: "Applications" },
  followups: { pt: "Follow-ups", en: "Follow-ups" },
  employers: { pt: "Empregadores", en: "Employers" },
  visa: { pt: "Checklist do Visto", en: "Visa Checklist" },
  logout: { pt: "Sair", en: "Sign out" },
  login: { pt: "Entrar", en: "Sign in" },
  email: { pt: "E-mail", en: "Email" },
  password: { pt: "Senha", en: "Password" },
  quality_score: { pt: "Score de Qualidade da Candidatura", en: "Application Quality Score" },
  strategy_banner: {
    pt: "Rapidez + Volume + Clareza + Confiabilidade aumentam sua chance de resposta. Aplique em vagas novas, todos os dias, com prova visual do seu trabalho.",
    en: "Speed + Volume + Clarity + Reliability boost your reply rate. Apply to fresh jobs daily, with visual proof of your work.",
  },
  fraud_banner: {
    pt: "Nunca pague para conseguir uma vaga H-2A. Isso é ilegal e é sinal de fraude.",
    en: "Never pay to get an H-2A job. It is illegal and a fraud sign.",
  },
  save: { pt: "Salvar", en: "Save" },
  saved: { pt: "Salvo", en: "Saved" },
  loading: { pt: "Carregando...", en: "Loading..." },
  total_sent: { pt: "Candidaturas enviadas", en: "Applications sent" },
  response_rate: { pt: "Taxa de resposta", en: "Response rate" },
  followups_sent: { pt: "Follow-ups enviados", en: "Follow-ups sent" },
  hired: { pt: "Contratações", en: "Hired" },
  apply: { pt: "Candidatar-se", en: "Apply" },
  mass_apply: { pt: "Aplicação em massa", en: "Bulk apply" },
  refresh_jobs: { pt: "🔄 Buscar vagas agora", en: "🔄 Fetch jobs now" },
  backfill_jobs: { pt: "Backfill últimos 15 dias", en: "Backfill last 15 days" },
};

type I18nCtx = { lang: Lang; setLang: (l: Lang) => void; t: (k: keyof typeof dict | string) => string };
const Ctx = createContext<I18nCtx>({ lang: "pt", setLang: () => {}, t: (k) => k as string });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("pt");
  useEffect(() => {
    const saved = typeof window !== "undefined" ? (localStorage.getItem("lang") as Lang | null) : null;
    if (saved === "pt" || saved === "en") setLangState(saved);
  }, []);
  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") localStorage.setItem("lang", l);
  };
  const t = (k: string) => (dict[k] ? dict[k][lang] : k);
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
