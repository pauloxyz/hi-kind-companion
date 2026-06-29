import type { ReactNode } from "react";

type Props = {
  /** Pre-formatted announcement text emitted by the debouncer. */
  message: string;
};

/**
 * Visually-hidden aria-live region for the Jornada H-2A.
 *
 * Kept in its own component so it can be rendered in isolation by unit
 * tests (`renderToStaticMarkup`) without spinning up the full AppShell or
 * a jsdom environment. AppShell wires the debounced `journeyAnnouncement`
 * string into `message`.
 */
export function JourneyLiveRegion({ message }: Props): ReactNode {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="journey-live-region"
      className="sr-only"
    >
      {message}
    </div>
  );
}
