// Cálculo do Application Quality Score (0-100)
// Currículo (30) + 1 foto por categoria principal (10x3=30) + vídeo (15) + EN preenchido (10) + datas (15)

export type ScoreInput = {
  hasResumeSummaryPt: boolean;
  hasResumeSummaryEn: boolean;
  hasAvailabilityDates: boolean;
  experiencesCount: number;
  mediaByCategory: { agriculture: number; machinery: number; animals: number; general: number };
  hasActiveIntroVideo: boolean;
};

export type ScoreBreakdown = {
  total: number;
  parts: Array<{ key: string; label_pt: string; label_en: string; value: number; max: number; done: boolean }>;
  suggestions_pt: string[];
  suggestions_en: string[];
};

export function computeScore(i: ScoreInput): ScoreBreakdown {
  const parts = [
    {
      key: "resume",
      label_pt: "Currículo (resumo + 1 experiência)",
      label_en: "Resume (summary + 1 experience)",
      max: 30,
      value: (i.hasResumeSummaryPt ? 15 : 0) + (i.experiencesCount > 0 ? 15 : 0),
      done: i.hasResumeSummaryPt && i.experiencesCount > 0,
    },
    { key: "media_ag", label_pt: "Foto/vídeo de agricultura", label_en: "Agriculture media", max: 10,
      value: i.mediaByCategory.agriculture > 0 ? 10 : 0, done: i.mediaByCategory.agriculture > 0 },
    { key: "media_mach", label_pt: "Foto/vídeo operando máquinas", label_en: "Machinery media", max: 10,
      value: i.mediaByCategory.machinery > 0 ? 10 : 0, done: i.mediaByCategory.machinery > 0 },
    { key: "media_an", label_pt: "Foto/vídeo com animais", label_en: "Animals media", max: 10,
      value: i.mediaByCategory.animals > 0 ? 10 : 0, done: i.mediaByCategory.animals > 0 },
    { key: "intro_video", label_pt: "Vídeo de apresentação em inglês", label_en: "Intro video in English",
      max: 15, value: i.hasActiveIntroVideo ? 15 : 0, done: i.hasActiveIntroVideo },
    { key: "english", label_pt: "Resumo do currículo traduzido para inglês", label_en: "Resume summary in English",
      max: 10, value: i.hasResumeSummaryEn ? 10 : 0, done: i.hasResumeSummaryEn },
    { key: "dates", label_pt: "Datas de disponibilidade definidas", label_en: "Availability dates set",
      max: 15, value: i.hasAvailabilityDates ? 15 : 0, done: i.hasAvailabilityDates },
  ];
  const total = parts.reduce((s, p) => s + p.value, 0);
  const suggestions_pt: string[] = [];
  const suggestions_en: string[] = [];
  for (const p of parts) if (!p.done) { suggestions_pt.push(`Completar: ${p.label_pt} (+${p.max - p.value} pts)`); suggestions_en.push(`Complete: ${p.label_en} (+${p.max - p.value} pts)`); }
  return { total, parts, suggestions_pt, suggestions_en };
}

// ---------- Match score: vaga ↔ perfil ----------
type JobLike = {
  posted_date: string | null;
  recruitment_email: string | null;
  wage_offered: number | null;
  start_date: string | null;
  worksite_state: string | null;
  job_title: string | null;
};
type ProfileLike = { has_prior_h2_experience?: boolean | null } | null | undefined;
type ResumeLike = { availability_start?: string | null; availability_end?: string | null } | null | undefined;

export function matchScore(job: JobLike, profile: ProfileLike, resume: ResumeLike): number {
  let s = 50;
  if (profile?.has_prior_h2_experience) s += 15;
  if (job.recruitment_email) s += 10;
  if (resume?.availability_start && job.start_date) {
    const av = new Date(resume.availability_start).getTime();
    const js = new Date(job.start_date).getTime();
    if (!Number.isNaN(av) && !Number.isNaN(js) && av <= js) s += 15;
  }
  if (job.wage_offered && job.wage_offered >= 15) s += 5;
  if (job.posted_date) {
    const days = (Date.now() - new Date(job.posted_date).getTime()) / 86400000;
    if (days <= 3) s += 10; else if (days <= 10) s += 5; else if (days > 30) s -= 5;
  }
  return Math.max(0, Math.min(100, Math.round(s)));
}

// ---------- Fraud detection ----------
const FRAUD_PATTERNS: Array<{ rx: RegExp; pt: string }> = [
  { rx: /\b(fee|fees)\b/i, pt: "menção a 'fee'" },
  { rx: /\b(taxa|taxas)\b/i, pt: "menção a 'taxa'" },
  { rx: /\b(pague|pagar|payment\s+required|pay\s+(to|us|me|in\s+advance))/i, pt: "pedido de pagamento" },
  { rx: /\b(deposit|depósito|deposito)\b/i, pt: "pedido de depósito" },
  { rx: /\b(western\s*union|moneygram|bitcoin|crypto|pix|gift\s*card)\b/i, pt: "método de pagamento suspeito" },
  { rx: /\bvisa\s+(processing|application|sponsor(ship)?)\s+fee\b/i, pt: "cobrança por visto/sponsorship" },
  { rx: /\b(processing\s+fee|recruitment\s+fee|placement\s+fee)\b/i, pt: "taxa de processamento/recrutamento" },
];

export function detectFraud(...texts: Array<string | null | undefined>): { isSuspicious: boolean; reasons: string[] } {
  const blob = texts.filter(Boolean).join(" \n ");
  const reasons: string[] = [];
  for (const p of FRAUD_PATTERNS) if (p.rx.test(blob)) reasons.push(p.pt);
  return { isSuspicious: reasons.length > 0, reasons: Array.from(new Set(reasons)) };
}
