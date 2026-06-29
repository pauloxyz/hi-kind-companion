/**
 * Per-US-state SEO metadata for /vagas-h2a/{state} pages.
 * AEWR = Adverse Effect Wage Rate (DOL 2025 reference). Update yearly.
 */
export interface StateInfo {
  name: string; // Portuguese display name
  shortName?: string; // Used in slugs / breadcrumbs
  aewr2025: number; // USD/hour
  crops: string[]; // top crops hiring H-2A
  peakSeason: string; // e.g. "Mar–Out"
  employers?: string[]; // example known employers
  intro: string; // 150-200 word SEO intro paragraph
}

export const STATE_INFO: Record<string, StateInfo> = {
  FL: {
    name: "Flórida",
    aewr2025: 14.77,
    crops: ["laranja", "tomate", "morango", "melancia"],
    peakSeason: "Out–Jun",
    employers: ["Cutrale-Citrus", "Lipman Family Farms", "DLF Pickers"],
    intro:
      "A Flórida é o maior empregador H-2A dos EUA fora da Geórgia, com milhares de vagas abertas todo ano em colheita de laranja, tomate, morango e melancia. A safra principal vai de outubro a junho, com pico entre janeiro e abril. O salário mínimo H-2A 2025 na Flórida (AEWR) é US$ 14,77/hora, e o empregador é obrigado a oferecer alojamento, transporte e mínimo de 35 horas semanais. As maiores contratações estão no centro do estado — Polk, Hardee, Hendry e DeSoto — e em fazendas próximas a Immokalee e Plant City. Brasileiros com experiência em colheita rural costumam ter alta taxa de aprovação para vagas H-2A na Flórida, especialmente em laranja e tomate.",
  },
  GA: {
    name: "Geórgia",
    aewr2025: 14.68,
    crops: ["pêssego", "blueberry", "pecan", "vidalia onion", "melancia"],
    peakSeason: "Abr–Out",
    employers: ["Lewis Taylor Farms", "Southern Valley Fruit & Vegetable"],
    intro:
      "A Geórgia é o estado com mais vagas H-2A dos EUA, liderando em colheita de pêssego, blueberry, cebola Vidalia e pecan. A safra principal vai de abril a outubro, com pico de contratação entre maio e agosto. O AEWR 2025 da Geórgia é US$ 14,68/hora, com alojamento e transporte por conta do empregador. Os maiores polos H-2A são Tifton, Moultrie, Vidalia e o sul do estado. A Geórgia tem mais de 30 mil posições H-2A certificadas por ano, o que torna esse estado a porta de entrada mais provável para brasileiros que buscam o primeiro visto agrícola nos EUA.",
  },
  NC: {
    name: "Carolina do Norte",
    shortName: "carolina-do-norte",
    aewr2025: 15.81,
    crops: ["tabaco", "batata-doce", "pepino", "maçã"],
    peakSeason: "Mai–Nov",
    employers: ["NC Growers Association"],
    intro:
      "A Carolina do Norte é o segundo maior empregador H-2A dos EUA, com forte presença em colheita de tabaco, batata-doce, pepino e maçã. A safra concentra-se entre maio e novembro. O AEWR 2025 da Carolina do Norte é US$ 15,81/hora — um dos mais altos da costa leste — e o empregador cobre moradia e transporte. A NC Growers Association sozinha contrata mais de 10 mil trabalhadores H-2A por temporada. As fazendas estão concentradas em Wilson, Sampson, Nash, Pitt e Henderson (maçã, oeste do estado).",
  },
  CA: {
    name: "Califórnia",
    aewr2025: 19.97,
    crops: ["uva", "morango", "alface", "amêndoa", "tomate"],
    peakSeason: "Mar–Nov",
    intro:
      "A Califórnia paga o segundo maior AEWR H-2A do país — US$ 19,97/hora em 2025 — e tem alta concentração de vagas em colheita de uva (Napa, Sonoma, Central Valley), morango (Salinas, Watsonville), alface e amêndoa. A safra vai de março a novembro. Embora o número de vagas H-2A na Califórnia seja menor do que na Geórgia e Carolina do Norte (porque há grande mão de obra local), a remuneração compensa: trabalhadores reportam ganhos médios de US$ 800–1.100/semana com horas extras pagas a 1,5x.",
  },
  WA: {
    name: "Washington",
    aewr2025: 19.25,
    crops: ["maçã", "cereja", "pera", "lúpulo"],
    peakSeason: "Mai–Out",
    employers: ["Stemilt", "WAFLA"],
    intro:
      "Washington é o maior produtor de maçã, cereja e pera dos EUA — e o estado de maior salário H-2A da costa oeste depois da Califórnia, com AEWR 2025 de US$ 19,25/hora. A colheita de cereja começa em maio/junho e a de maçã estende-se de agosto a outubro. A WAFLA, maior associação de empregadores agrícolas do estado, contrata milhares de trabalhadores H-2A por temporada. As fazendas concentram-se no Yakima Valley, Wenatchee e Tri-Cities. Brasileiros experientes em colheita de frutas têm boa procura nesses três polos.",
  },
  MI: {
    name: "Michigan",
    aewr2025: 18.50,
    crops: ["maçã", "cereja", "blueberry", "aspargo"],
    peakSeason: "Mai–Out",
    intro:
      "Michigan combina salário H-2A acima da média (AEWR 2025 US$ 18,50/h) com forte demanda em colheita de maçã, cereja, blueberry e aspargo. A safra vai de maio a outubro, com pico na colheita de maçã em setembro. As fazendas concentram-se em Traverse City, Grand Rapids e oeste do estado.",
  },
  NY: {
    name: "Nova York",
    aewr2025: 17.80,
    crops: ["maçã", "uva", "cebola", "repolho"],
    peakSeason: "Mai–Nov",
    intro:
      "Nova York é o segundo maior produtor de maçã dos EUA e tem milhares de vagas H-2A em colheita e packing. O AEWR 2025 é US$ 17,80/hora e a safra vai de maio (frutas vermelhas) a novembro (maçã tardia). Fazendas concentram-se no oeste do estado (Wayne County) e Hudson Valley.",
  },
  TX: {
    name: "Texas",
    aewr2025: 15.97,
    crops: ["cebola", "melão", "cítricos", "algodão", "pecuária"],
    peakSeason: "Out–Jun",
    intro:
      "O Texas tem programa H-2A diversificado: cebola e melão no Rio Grande Valley, cítricos no sul, pecuária e algodão no oeste. AEWR 2025: US$ 15,97/hora. A safra de inverno (cebola, cítricos) vai de outubro a junho, oposta à maioria dos estados — boa opção para quem quer trabalhar fora do verão.",
  },
};

/**
 * Resolve state code/slug from URL param to canonical 2-letter code.
 * Accepts "fl", "florida", "carolina-do-norte", etc.
 */
export function resolveStateCode(slug: string): string | null {
  const norm = slug.toLowerCase();
  if (norm.length === 2 && STATE_INFO[norm.toUpperCase()]) return norm.toUpperCase();
  for (const [code, info] of Object.entries(STATE_INFO)) {
    if (info.shortName === norm) return code;
    if (info.name.toLowerCase().replace(/[ç]/g, "c").replace(/[óôõ]/g, "o").replace(/[áâã]/g, "a") === norm) return code;
  }
  return null;
}
