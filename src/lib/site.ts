/**
 * Canonical site origin used to build absolute URLs for sitemap,
 * canonical links, og:url, og:image, and JSON-LD `url` fields.
 *
 * Must NOT include a trailing slash. Use absUrl() to safely build absolute
 * URLs from a leading-slash path.
 */
export const SITE_URL = "https://www.vaiprala.net";

export function absUrl(path: string): string {
  if (!path) return SITE_URL;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
