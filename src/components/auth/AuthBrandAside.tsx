import logo from "@/assets/vaiprala-logo.png";

/**
 * Marketing/brand column shown on the left of /auth at lg+ breakpoints.
 * Contains logo, headline, feature chips and flag stripe. Hidden on mobile.
 */
export function AuthBrandAside() {
  const chips = ["Vagas DOL ao vivo", "Carta em inglês com IA", "Vídeo + galeria", "Checklist do visto"];
  return (
    <aside className="hidden lg:flex flex-col justify-between p-12 text-white">
      <div className="flex items-center gap-3">
        <img src={logo} alt="VaiPraLá" width={56} height={56} className="h-14 w-14 drop-shadow-lg" />
        <div>
          <div className="text-2xl font-bold tracking-tight">VaiPraLá</div>
          <div className="text-xs uppercase tracking-[0.18em] text-white/80">Brasil → USA · H-2A</div>
        </div>
      </div>

      <div className="space-y-6 max-w-lg">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-[#ffdf00]" />
          <span className="text-[11px] uppercase tracking-[0.18em] text-white/90">Vagas reais · DOL</span>
        </div>
        <p className="text-5xl xl:text-6xl font-bold leading-[1.05] tracking-tight drop-shadow-md">
          Da roça brasileira <br />
          <span className="italic font-light text-[#ffdf00]">para a fazenda</span> <br />
          americana.
        </p>
        <p className="text-lg text-white/90 leading-relaxed max-w-md">
          Encontre vagas H-2A reais do Departamento do Trabalho, gere cartas em inglês,
          grave seu vídeo de apresentação e acompanhe cada passo do visto.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          {chips.map((tag) => (
            <span key={tag} className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/15 backdrop-blur-sm border border-white/25">
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="text-xs text-white/80 flex items-center gap-2">
        <span className="inline-block h-1.5 w-8 rounded-full bg-[#ffdf00]" />
        <span className="inline-block h-1.5 w-8 rounded-full bg-white" />
        <span className="inline-block h-1.5 w-8 rounded-full bg-[#b22234]" />
        <span className="ml-2">Feito por brasileiros, para brasileiros.</span>
      </div>
    </aside>
  );
}
