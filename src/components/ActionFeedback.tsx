import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Accessible confirmation feedback for key actions ("vaga salva",
 * "candidatura enviada", etc).
 *
 * - Visual: a brief checkmark badge animates in/out (respects
 *   `prefers-reduced-motion`). Doesn't block interaction.
 * - A11y: a polite aria-live region announces a verbose, descriptive
 *   message ("Vaga salva: Colheita de laranja, Florida — disponível
 *   nos favoritos"). Distinct from sonner toasts so screen readers
 *   get a single, canonical confirmation per action.
 */
export type ActionConfirmation = {
  /** Short title shown in the visual badge ("Vaga salva"). */
  title: string;
  /** Verbose detail announced to assistive tech ("Colheita de laranja, Florida — disponível em Favoritos"). */
  detail?: string;
  /** Optional override icon (defaults to a check). */
  icon?: ReactNode;
  /** Milliseconds the visual badge stays mounted. Defaults to 1800ms. */
  durationMs?: number;
};

type Ctx = {
  confirm: (c: ActionConfirmation) => void;
};

const ActionFeedbackContext = createContext<Ctx | null>(null);

export function useActionFeedback(): Ctx {
  const ctx = useContext(ActionFeedbackContext);
  if (!ctx) {
    // Soft fallback so unit-tested components don't explode when the
    // provider isn't mounted; logs the announcement instead.
    return {
      confirm: (c) => {
        if (typeof console !== "undefined") {
          console.debug("[ActionFeedback] (no provider)", c.title, c.detail ?? "");
        }
      },
    };
  }
  return ctx;
}

type Visual = (ActionConfirmation & { id: number }) | null;

export function ActionFeedbackProvider({ children }: { children: ReactNode }) {
  const [visual, setVisual] = useState<Visual>(null);
  const [liveMessage, setLiveMessage] = useState<string>("");
  const timerRef = useRef<number | null>(null);
  const counterRef = useRef(0);

  const confirm = useCallback((c: ActionConfirmation) => {
    counterRef.current += 1;
    const id = counterRef.current;
    setVisual({ ...c, id });

    // aria-live: assistive tech reads `${title}. ${detail}` once.
    // Reset to empty between announcements so identical consecutive
    // messages are still re-announced.
    const message = c.detail ? `${c.title}. ${c.detail}` : c.title;
    setLiveMessage("");
    // Two-tick gap forces the region to re-render with the new text.
    if (typeof window !== "undefined") {
      window.setTimeout(() => setLiveMessage(message), 30);
    }

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    if (typeof window !== "undefined") {
      timerRef.current = window.setTimeout(
        () => setVisual((current) => (current?.id === id ? null : current)),
        c.durationMs ?? 1800,
      );
    }
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <ActionFeedbackContext.Provider value={{ confirm }}>
      {children}
      {/* Polite, atomic live region — verbose and descriptive on purpose. */}
      <div
        aria-live="polite"
        aria-atomic="true"
        data-testid="action-feedback-live"
        className="sr-only"
      >
        {liveMessage}
      </div>
      {/* Visual confirmation badge. Pointer-events: none so it never
          blocks the underlying UI (toaster lives in the bottom-right). */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex justify-center"
      >
        {visual && (
          <div
            key={visual.id}
            className={cn(
              "flex items-center gap-2 rounded-full border border-primary/30 bg-card px-4 py-2 shadow-elevated",
              "animate-[confirm-pop_0.4s_ease-out] motion-reduce:animate-none",
            )}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
              {visual.icon ?? <Check className="h-3.5 w-3.5" />}
            </span>
            <span className="text-sm font-semibold">{visual.title}</span>
          </div>
        )}
      </div>
    </ActionFeedbackContext.Provider>
  );
}
