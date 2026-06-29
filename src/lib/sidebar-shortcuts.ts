// Pure helpers for the global "G _" keyboard shortcuts used by AppShell.
// Kept framework-free so the matcher can be unit-tested without a DOM.

export type ShortcutDestination = {
  to: string;
  label: string;
};

export const SHORTCUTS: Record<string, ShortcutDestination> = {
  v: { to: "/app/vagas", label: "Vagas" },
  c: { to: "/app/curriculo", label: "Currículo" },
  j: { to: "/app", label: "Jornada" },
};

export type ShortcutKeyEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
};

/**
 * Returns true when the event target is an editable surface where typing
 * single letters must not be hijacked as a global shortcut.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const node = target as (HTMLElement & { isContentEditable?: boolean }) | null;
  if (!node || typeof node.tagName !== "string") return false;
  const tag = node.tagName.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (node.isContentEditable) return true;
  // Radix combobox / listbox surfaces accept typeahead input
  const role = node.getAttribute?.("role");
  if (role === "textbox" || role === "searchbox" || role === "combobox") return true;
  return false;
}

export type ShortcutMatcher = {
  /** Feed a keydown-like event; returns a destination when a full "G X" combo lands. */
  handle: (e: ShortcutKeyEvent, target?: EventTarget | null) => ShortcutDestination | null;
  /** Reset internal state (e.g. on unmount or focus loss). */
  reset: () => void;
};

/**
 * Builds a stateful matcher for the "press G, then a letter" sequence.
 * `now` is injected so tests can advance time deterministically.
 */
export function createShortcutMatcher(opts: {
  windowMs?: number;
  now?: () => number;
} = {}): ShortcutMatcher {
  const windowMs = opts.windowMs ?? 900;
  const now = opts.now ?? (() => Date.now());
  let armedAt: number | null = null;

  return {
    handle(e, target = null) {
      if (e.metaKey || e.ctrlKey || e.altKey) return null;
      if (isTypingTarget(target)) {
        armedAt = null;
        return null;
      }
      const k = (e.key ?? "").toLowerCase();
      if (k.length !== 1) return null;
      const t = now();
      if (armedAt == null || t - armedAt > windowMs) {
        armedAt = k === "g" ? t : null;
        return null;
      }
      armedAt = null;
      return SHORTCUTS[k] ?? null;
    },
    reset() {
      armedAt = null;
    },
  };
}
