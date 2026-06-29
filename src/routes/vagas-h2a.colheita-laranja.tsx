import { createFileRoute } from "@tanstack/react-router";
import { CropPage } from "./vagas-h2a.colheita-maca";

const PATH = "/vagas-h2a/colheita-laranja";
const ESTADOS = [
  { code: "FL", name: "Flórida", note: "85% da produção dos EUA — Polk, Hendry, DeSoto" },
  { code: "CA", name: "Califórnia", note: "Central Valley — Tulare, Kern" },
  { code: "TX", name: "Texas", note: "Rio Grande Valley" },
];

export const Route = createFileRoute("/vagas-h2a/colheita-laranja")({
  head: () => ({
    meta: [
      { title: "Vagas H-2A colheita de laranja nos EUA 2025 | VaiPraLá" },
      { name: "description", content: "Trabalho de colheita de laranja na Flórida e Califórnia com visto H-2A: salário US$ 14-20/h, safra de outubro a junho, empregadores certificados pelo DOL." },
      { property: "og:title", content: "Vagas H-2A colheita de laranja EUA" },
      { property: "og:description", content: "Como trabalhar na colheita de laranja nos Estados Unidos via H-2A — estados, salário e como se candidatar." },
      { property: "og:url", content: PATH },
    ],
    links: [{ rel: "canonical", href: PATH }],
  }),
  component: () => <CropPage crop="laranja" path={PATH} estados={ESTADOS} salario="US$ 14,77–19,97/h" temporada="Outubro a junho (pico em janeiro–abril)" descricao="A colheita de laranja na Flórida é uma das maiores operações H-2A do mundo — milhares de brasileiros trabalham ali todo ano. O trabalho é manual, com sacos de coleta, escadas e jornada de 8-9h/dia. A Cutrale (maior empresa de suco de laranja do mundo) é uma das maiores contratantes." />,
});
