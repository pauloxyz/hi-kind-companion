import { createFileRoute } from "@tanstack/react-router";
import { CropPage } from "./vagas-h2a.colheita-maca";

const PATH = "/vagas-h2a/tabaco";
const ESTADOS = [
  { code: "NC", name: "Carolina do Norte", note: "maior produtor — Wilson, Pitt, Nash" },
  { code: "KY", name: "Kentucky", note: "tabaco burley" },
  { code: "TN", name: "Tennessee", note: "tabaco burley e dark fire" },
  { code: "VA", name: "Virgínia", note: "Pittsylvania County" },
];

export const Route = createFileRoute("/vagas-h2a/tabaco")({
  head: () => ({
    meta: [
      { title: "Vagas H-2A colheita de tabaco nos EUA 2025 | VaiPraLá" },
      { name: "description", content: "Trabalho na colheita e cura de tabaco na Carolina do Norte, Kentucky e Tennessee com visto H-2A. Salário US$ 15,81/h, safra de maio a novembro." },
      { property: "og:title", content: "Vagas H-2A colheita de tabaco EUA" },
      { property: "og:description", content: "Como trabalhar na colheita de tabaco nos Estados Unidos via H-2A — estados, salário e empregadores." },
      { property: "og:url", content: PATH },
    ],
    links: [{ rel: "canonical", href: PATH }],
  }),
  component: () => <CropPage crop="tabaco" path={PATH} estados={ESTADOS} salario="US$ 15,81–16,50/h" temporada="Maio a novembro (pico em agosto–setembro)" descricao="A Carolina do Norte é o maior produtor de tabaco dos EUA e a NC Growers Association contrata mais de 10 mil trabalhadores H-2A por temporada — em grande parte brasileiros. O trabalho inclui plantio, capação, colheita e cura em estufas. Pagamento por hora ou por produção." />,
});
