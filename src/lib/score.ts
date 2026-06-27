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
    {
      key: "media_ag",
      label_pt: "Foto/vídeo de agricultura",
      label_en: "Agriculture media",
      max: 10,
      value: i.mediaByCategory.agriculture > 0 ? 10 : 0,
      done: i.mediaByCategory.agriculture > 0,
    },
    {
      key: "media_mach",
      label_pt: "Foto/vídeo operando máquinas",
      label_en: "Machinery media",
      max: 10,
      value: i.mediaByCategory.machinery > 0 ? 10 : 0,
      done: i.mediaByCategory.machinery > 0,
    },
    {
      key: "media_an",
      label_pt: "Foto/vídeo com animais",
      label_en: "Animals media",
      max: 10,
      value: i.mediaByCategory.animals > 0 ? 10 : 0,
      done: i.mediaByCategory.animals > 0,
    },
    {
      key: "intro_video",
      label_pt: "Vídeo de apresentação em inglês",
      label_en: "Intro video in English",
      max: 15,
      value: i.hasActiveIntroVideo ? 15 : 0,
      done: i.hasActiveIntroVideo,
    },
    {
      key: "english",
      label_pt: "Resumo do currículo traduzido para inglês",
      label_en: "Resume summary in English",
      max: 10,
      value: i.hasResumeSummaryEn ? 10 : 0,
      done: i.hasResumeSummaryEn,
    },
    {
      key: "dates",
      label_pt: "Datas de disponibilidade definidas",
      label_en: "Availability dates set",
      max: 15,
      value: i.hasAvailabilityDates ? 15 : 0,
      done: i.hasAvailabilityDates,
    },
  ];
  const total = parts.reduce((s, p) => s + p.value, 0);
  const suggestions_pt: string[] = [];
  const suggestions_en: string[] = [];
  for (const p of parts) {
    if (!p.done) {
      suggestions_pt.push(`+${p.max - p.value}% → ${p.label_pt}`);
      suggestions_en.push(`+${p.max - p.value}% → ${p.label_en}`);
    }
  }
  return { total, parts, suggestions_pt, suggestions_en };
}
