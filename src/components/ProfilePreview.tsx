import { Video, MessageCircle, Check } from "lucide-react";

export type ProfilePreviewProps = {
  /** Iniciais (2 chars). Default JS. */
  initials?: string;
  /** Linha principal: "Joelson S., 34". */
  name?: string;
  /** Cidade/UF + disponibilidade. */
  location?: string;
  /** Tags de experiência (vem do checklist do onboarding). */
  tags?: string[];
  /** Rodapé de status. Default: "Enviado para 3 recrutadores via WhatsApp". */
  statusText?: React.ReactNode;
  /** Mostrar placeholder de vídeo. Default true. */
  showVideo?: boolean;
  /** Duração exibida sobre o player (mock). */
  videoDuration?: string;
};

/**
 * Mockup compacto da página pública do candidato. Usado:
 *  - na landing para vender o produto antes do cadastro;
 *  - na última tela do onboarding como "prévia do que o recrutador vai ver".
 *
 * Tudo configurável por props para que o onboarding preencha com os dados
 * reais do usuário (nome, cidade, tags marcadas) enquanto a landing usa
 * valores fictícios.
 */
export function ProfilePreview({
  initials = "JS",
  name = "Joelson S., 34",
  location = "Minas Gerais · Disponível ago/2026",
  tags = ["Colheita laranja", "Trator", "Irrigação", "Plantio"],
  statusText,
  showVideo = true,
  videoDuration = "0:58",
}: ProfilePreviewProps) {
  return (
    <aside aria-label="Pré-visualização de perfil" className="relative">
      <div className="absolute -inset-4 bg-primary/5 rounded-3xl rotate-2" aria-hidden />
      <div className="relative rounded-2xl border-2 border-primary/20 bg-card p-5 sm:p-6 shadow-elevated">
        <div className="flex items-center gap-2 mb-5">
          <span className="inline-flex h-2 w-2 rounded-full bg-success animate-pulse" aria-hidden />
          <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground">
            Perfil ativo · visível para recrutadores
          </span>
        </div>

        <div className="flex items-center gap-3 mb-5">
          <div className="h-14 w-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-black text-lg">
            {initials.slice(0, 2).toUpperCase() || "?"}
          </div>
          <div className="min-w-0">
            <p className="font-bold leading-tight truncate">{name}</p>
            <p className="text-xs text-muted-foreground truncate">{location}</p>
          </div>
        </div>

        {showVideo && (
          <div className="relative aspect-video rounded-lg bg-foreground/90 mb-4 overflow-hidden flex items-center justify-center group cursor-pointer">
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/30 to-accent-red/20" />
            <div className="relative h-12 w-12 rounded-full bg-white/95 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <Video className="h-5 w-5 text-primary translate-x-0.5" />
            </div>
            <span className="absolute bottom-2 right-2 text-[10px] font-bold text-white bg-black/50 px-1.5 py-0.5 rounded">
              {videoDuration}
            </span>
          </div>
        )}

        <div className="space-y-2 mb-5">
          <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Experiência</p>
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-1 rounded-md bg-primary/10 text-primary font-semibold"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">Nenhuma marcada ainda.</p>
          )}
        </div>

        <div className="pt-4 border-t flex items-center gap-2">
          {statusText ? (
            <>
              <Check className="h-4 w-4 text-success shrink-0" />
              <p className="text-xs">{statusText}</p>
            </>
          ) : (
            <>
              <MessageCircle className="h-4 w-4 text-success shrink-0" />
              <p className="text-xs">
                <strong>Enviado para 3 recrutadores</strong>{" "}
                <span className="text-muted-foreground">via WhatsApp</span>
              </p>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
