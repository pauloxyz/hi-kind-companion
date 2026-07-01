/**
 * Shared CLI argument parsing for security scripts.
 *
 * Every script under scripts/ that supports flags (--verbose, --dry-run,
 * --previous, --current, --out, ...) should go through this module so
 * the flag surface stays consistent across the suite and the README docs.
 */

export type Argv = string[];

/** Returns true if `flag` is present anywhere in argv. */
export function hasFlag(argv: Argv, flag: string): boolean {
  return argv.includes(flag);
}

/**
 * Returns the value that follows `flag` (space-separated) or undefined.
 * Deliberately does not support `--flag=value` — keeps the parser trivial
 * and matches how CI workflows invoke every script.
 */
export function getFlag(argv: Argv, flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** Standard { verbose, dryRun } pair — every script accepts these. */
export function parseCommonFlags(argv: Argv = process.argv.slice(2)): {
  verbose: boolean;
  dryRun: boolean;
} {
  return { verbose: hasFlag(argv, "--verbose"), dryRun: hasFlag(argv, "--dry-run") };
}

/** Uniform "[verbose] ..." log helper — no-op unless enabled. */
export function makeVerboseLogger(enabled: boolean): (...args: unknown[]) => void {
  return enabled ? (...args) => console.log("[verbose]", ...args) : () => {};
}
