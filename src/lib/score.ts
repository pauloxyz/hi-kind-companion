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

// ---------- Top Pick / Quality medal ----------
// Ranking baseado em dados oficiais:
// • AEWR 2025 por estado (DOL/OFLC, flag.dol.gov, vigente desde 16/dez/2024)
// • Volume de certificações FY24 (DOL OFLC Selected Statistics FY24 Q4)
// • Top empregadores FY24 (UC Davis Rural Migration News, jan/2025)
// • Histórico de fiscalização (debarments DOL WHD 2024)
//
// Filosofia: melhor vaga = salário acima do piso + empregador estabelecido +
// estado com proteções trabalhistas + housing fiscalizado + recrutamento ativo.
// Estados Midwest (IL, IN, OH, IA, NE) têm AEWR alto ($18-19.57/h) e operações
// de seed corn de multinacionais (Bayer, Corteva) — historicamente
// subestimados pelos candidatos, mas pagam muito acima da média do Sul.

type StateTier = "S" | "A" | "B" | "C";
const TOP_STATES: Record<string, { tier: StateTier; note: string }> = {
  // Tier S — AEWR ≥ $19/h E programa estabelecido / proteções estaduais fortes
  HAWAII: { tier: "S", note: "HI: maior AEWR do país ($20.08/h), porém custo de vida alto e poucas vagas" },
  CALIFORNIA: { tier: "S", note: "CA: AEWR $19.97/h (2º maior), lei estadual de hora extra após 8h/dia, calor regulado" },
  OREGON: { tier: "S", note: "OR: AEWR $19.82/h, leis estaduais fortes de proteção ao trabalhador rural" },
  WASHINGTON: { tier: "S", note: "WA: AEWR $19.82/h, programa maduro (WAFLA), housing regulado pelo estado" },
  ILLINOIS: { tier: "S", note: "IL: AEWR $19.57/h — Bayer e Corteva contratam para detasseling de milho semente; programa pequeno mas empregadores multinacionais sérios (ex: Flamm Orchards desde 2007)" },
  INDIANA: { tier: "S", note: "IN: AEWR $19.57/h, perfil similar a IL (seed corn, melões), Midwest estável" },
  OHIO: { tier: "S", note: "OH: AEWR $19.57/h, viveiros e frutas, baixo volume e baixa concorrência" },
  KANSAS: { tier: "S", note: "KS: AEWR $19.21/h, gado e grãos, empregadores recorrentes" },
  NEBRASKA: { tier: "S", note: "NE: AEWR $19.21/h, seed corn (Bayer/Corteva) e gado" },
  "NORTH DAKOTA": { tier: "S", note: "ND: AEWR $19.21/h, temporada curta, alta remuneração por hora extra" },
  "SOUTH DAKOTA": { tier: "S", note: "SD: AEWR $19.21/h, gado e grãos" },

  // Tier A — AEWR $18-$18.99/h ou programa grande e maduro
  "NEW YORK": { tier: "A", note: "NY: AEWR $18.83/h, maçãs e laticínios, lei estadual de hora extra ag (>40h)" },
  CONNECTICUT: { tier: "A", note: "CT: AEWR $18.83/h, viveiros e tabaco premium" },
  VERMONT: { tier: "A", note: "VT: AEWR $18.83/h, laticínios e maple" },
  MASSACHUSETTS: { tier: "A", note: "MA: AEWR $18.83/h, hortaliças, leis fortes" },
  MAINE: { tier: "A", note: "ME: AEWR $18.83/h, mirtilos e batata" },
  IOWA: { tier: "A", note: "IA: AEWR $18.65/h, seed corn (Pioneer/DEKALB), milho/soja" },
  MISSOURI: { tier: "A", note: "MO: AEWR $18.65/h, milho/soja e gado" },
  MICHIGAN: { tier: "A", note: "MI: AEWR $18.15/h, top-10 em volume FY24, maçãs/cerejas/mirtilos" },
  WISCONSIN: { tier: "A", note: "WI: AEWR $18.15/h, cranberry e laticínios" },
  MINNESOTA: { tier: "A", note: "MN: AEWR $18.15/h, seed corn e açúcar de beterraba" },

  // Tier B — AEWR $16-$17.99/h, programas grandes em volume
  "NEW JERSEY": { tier: "B", note: "NJ: AEWR $17.96/h, hortaliças, próximo a comunidades brasileiras" },
  DELAWARE: { tier: "B", note: "DE: AEWR $17.96/h, hortaliças e milho doce" },
  MARYLAND: { tier: "B", note: "MD: AEWR $17.96/h, mariscos e hortaliças" },
  PENNSYLVANIA: { tier: "B", note: "PA: AEWR $17.96/h, frutas e cogumelos" },
  COLORADO: { tier: "B", note: "CO: AEWR $17.84/h, pêssegos e cebolas (atenção: investigações recentes em algumas fazendas)" },
  ARIZONA: { tier: "B", note: "AZ: AEWR $17.04/h, top-10 em volume FY24, hortaliças de inverno" },
  "NEW MEXICO": { tier: "B", note: "NM: AEWR $17.04/h, chile e pecan" },
  IDAHO: { tier: "B", note: "ID: AEWR $16.83/h, batata e laticínios" },
  FLORIDA: { tier: "B", note: "FL: 12% de todas as vagas H-2A do país (#1 em volume), AEWR $16.23/h, housing fiscalizado, forte comunidade brasileira em Orlando/Pompano" },
  "NORTH CAROLINA": { tier: "B", note: "NC: 7% das vagas (#5), AEWR $16.16/h, NCGA é a maior associação H-2A do país (~10.400 vagas/ano) e referência mundial em housing" },
  VIRGINIA: { tier: "B", note: "VA: AEWR $16.16/h, tabaco e maçãs" },
  GEORGIA: { tier: "B", note: "GA: 11% das vagas (#2), AEWR $16.08/h, mirtilos e cebola Vidalia, operações enormes" },
  "SOUTH CAROLINA": { tier: "B", note: "SC: AEWR $16.08/h, lar da Titan Farms (2ª maior produtora de pêssegos do país)" },
  ALABAMA: { tier: "B", note: "AL: AEWR $16.08/h, hortaliças e batata-doce" },

  // Tier C — AEWR < $16/h (alerta de remuneração mais baixa)
  KENTUCKY: { tier: "C", note: "KY: AEWR $15.87/h, tabaco e feno (atenção: salário mais baixo do Tier)" },
  TENNESSEE: { tier: "C", note: "TN: AEWR $15.87/h, tabaco e tomate" },
  "WEST VIRGINIA": { tier: "C", note: "WV: AEWR $15.87/h, maçãs" },
  TEXAS: { tier: "C", note: "TX: 4% das vagas (top-10), AEWR $15.79/h, cebola e cítricos" },
  OKLAHOMA: { tier: "C", note: "OK: AEWR $15.79/h, gado e melão" },
  LOUISIANA: { tier: "C", note: "LA: 4% das vagas (top-10), AEWR $14.83/h — mais baixo do país junto com AR/MS, cana e crawfish" },
  ARKANSAS: { tier: "C", note: "AR: AEWR $14.83/h, arroz e mirtilo" },
  MISSISSIPPI: { tier: "C", note: "MS: AEWR $14.83/h, algodão e batata-doce" },
};

// Empregadores reconhecidos — baseado em DOL FY24 e histórico do programa.
// NCGA, Foothill, Fresh Harvest e WAFLA juntos respondem por 10% de todas
// as certificações H-2A do país (Rural Migration News, jan/2025).
const RENOWNED_EMPLOYERS: Array<{ rx: RegExp; note: string }> = [
  { rx: /(north\s+carolina\s+growers|\bncga\b)/i, note: "NCGA — maior empregador H-2A dos EUA (~10.400 vagas/ano), referência em housing" },
  { rx: /\bfoothill\s+packing/i, note: "Foothill Packing — 2º maior empregador H-2A do país (~5.400 vagas/ano)" },
  { rx: /\bfresh\s+harvest\b/i, note: "Fresh Harvest — 3º maior empregador H-2A (~5.300 vagas/ano)" },
  { rx: /\bwafla\b|washington\s+(farm|growers)/i, note: "WAFLA — associação líder em WA (~5.000 vagas/ano), housing regulado" },
  { rx: /\bzirkle\b/i, note: "Zirkle Fruit (WA) — top-10 H-2A, contratação direta, maçãs/cerejas" },
  { rx: /\bperi\s*(&|and)?\s*sons\b/i, note: "Peri & Sons (NV) — top-10 H-2A, contratação direta, cebolas" },
  { rx: /\bgebbers\s+farms?\b/i, note: "Gebbers Farms (WA) — uma das maiores produtoras de maçã/cereja do mundo" },
  { rx: /\bstemilt\b/i, note: "Stemilt (WA) — referência em frutas premium" },
  { rx: /\btitan\s+farms\b/i, note: "Titan Farms (SC) — 2ª maior produtora de pêssegos dos EUA" },
  { rx: /\b(bayer|monsanto)\b/i, note: "Bayer/Monsanto — multinacional, programa de seed corn no Midwest" },
  { rx: /\b(corteva|pioneer|dekalb)\b/i, note: "Corteva/Pioneer — multinacional de seed corn, contratos sérios" },
  { rx: /\bdriscoll/i, note: "Driscoll's — maior marca de berries do mundo" },
  { rx: /\bwonderful\b/i, note: "Wonderful Company (CA) — pistache, romã, citros (Halos)" },
  { rx: /\bdole\b/i, note: "Dole — multinacional consolidada de frutas" },
  { rx: /\bmastronardi\b/i, note: "Mastronardi (Sunset) — líder em hortaliças de estufa" },
  { rx: /\bsun[\s-]?belle\b/i, note: "Sun Belle — grande produtora de berries" },
  { rx: /\bflamm\s+orchards\b/i, note: "Flamm Orchards (IL) — H-2A desde 2007, pomar familiar consolidado" },
  { rx: /\b(naturipe|california\s+giant)\b/i, note: "Cooperativa berries premium" },
];

export type JobQuality = {
  level: "gold" | "silver" | "bronze" | null;
  score: number; // 0-100
  reasons_pt: string[];
};

type QualityJob = {
  worksite_state: string | null;
  wage_offered: number | null;
  posted_date: string | null;
  recruitment_email: string | null;
  recruitment_phone: string | null;
  employer_name: string | null;
  total_openings: number | null;
  start_date: string | null;
};

const STATE_TIER_POINTS: Record<StateTier, number> = { S: 30, A: 22, B: 15, C: 6 };

export function jobQuality(job: QualityJob, isSuspicious: boolean): JobQuality {
  if (isSuspicious) return { level: null, score: 0, reasons_pt: [] };

  let score = 0;
  const reasons: string[] = [];

  const stateKey = (job.worksite_state ?? "").trim().toUpperCase();
  const stateInfo = TOP_STATES[stateKey];
  if (stateInfo) {
    score += STATE_TIER_POINTS[stateInfo.tier];
    reasons.push(stateInfo.note);
  }

  // Salário: comparado ao AEWR (piso legal). Acima de $19 é elite, $17+ é alto.
  if (job.wage_offered != null) {
    if (job.wage_offered >= 19) { score += 25; reasons.push(`Salário elite: $${job.wage_offered}/h (≥ piso dos estados mais bem pagos)`); }
    else if (job.wage_offered >= 17) { score += 18; reasons.push(`Salário alto: $${job.wage_offered}/h`); }
    else if (job.wage_offered >= 15) { score += 10; reasons.push(`Salário acima da média nacional: $${job.wage_offered}/h`); }
    else if (job.wage_offered >= 13) { score += 4; }
  }

  if (job.recruitment_email) { score += 12; reasons.push("Contato direto por e-mail (resposta mais rápida)"); }
  else if (job.recruitment_phone) { score += 4; }

  const emp = job.employer_name ?? "";
  const renowned = RENOWNED_EMPLOYERS.find((e) => e.rx.test(emp));
  if (renowned) {
    score += 22;
    reasons.push(renowned.note);
  }

  if (job.total_openings != null) {
    if (job.total_openings >= 100) { score += 12; reasons.push(`Operação enorme (${job.total_openings} vagas) — estrutura corporativa consolidada`); }
    else if (job.total_openings >= 30) { score += 7; reasons.push(`Operação grande (${job.total_openings} vagas)`); }
    else if (job.total_openings >= 10) { score += 3; }
  }

  if (job.posted_date) {
    const days = (Date.now() - new Date(job.posted_date).getTime()) / 86400000;
    if (days <= 3) { score += 10; reasons.push("Publicada nos últimos 3 dias — empregador ativo agora"); }
    else if (days <= 10) { score += 5; }
  }

  let level: JobQuality["level"] = null;
  if (score >= 75) level = "gold";
  else if (score >= 55) level = "silver";
  else if (score >= 38) level = "bronze";

  return { level, score: Math.min(100, score), reasons_pt: reasons };
}
