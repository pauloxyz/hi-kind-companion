import { test, expect } from "@playwright/test";

/**
 * Theme + language preferences must persist across full reloads and across
 * SSR-rendered navigations (e.g. /auth → / → /auth). Both layers are stored:
 *   - localStorage (client-only)
 *   - cookie (survives navigation through server-rendered routes)
 */

test("theme + language preferences persist across reload and route changes", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("theme", "dark");
    localStorage.setItem("lang", "en");
    document.cookie = "theme=dark; path=/; SameSite=Lax";
    document.cookie = "lang=en; path=/; SameSite=Lax";
  });

  // Navigate through an SSR-rendered route.
  await page.goto("/auth");
  await page.waitForLoadState("domcontentloaded");
  // The boot script in __root.tsx applies lang/dark from cookie/localStorage
  // synchronously before React hydrates; the I18nProvider keeps it in sync after.
  await page.waitForFunction(
    () => document.documentElement.lang === "en" && document.documentElement.classList.contains("dark"),
    null,
    { timeout: 5_000 },
  );
  const afterAuth = await page.evaluate(() => ({
    theme: localStorage.getItem("theme"),
    lang: localStorage.getItem("lang"),
    htmlLang: document.documentElement.lang,
    hasDark: document.documentElement.classList.contains("dark"),
    cookie: document.cookie,
  }));
  expect(afterAuth.theme).toBe("dark");
  expect(afterAuth.lang).toBe("en");
  expect(afterAuth.htmlLang).toBe("en");
  expect(afterAuth.hasDark).toBe(true);
  expect(afterAuth.cookie).toContain("theme=dark");
  expect(afterAuth.cookie).toContain("lang=en");

  // Full reload preserves the choices.
  await page.reload();
  await page.waitForFunction(
    () => document.documentElement.lang === "en" && document.documentElement.classList.contains("dark"),
    null,
    { timeout: 5_000 },
  );
  const afterReload = await page.evaluate(() => ({
    theme: localStorage.getItem("theme"),
    lang: localStorage.getItem("lang"),
    htmlLang: document.documentElement.lang,
    hasDark: document.documentElement.classList.contains("dark"),
  }));
  expect(afterReload).toEqual({
    theme: "dark",
    lang: "en",
    htmlLang: "en",
    hasDark: true,
  });

  // Navigating to a protected route (which redirects to /auth) preserves them.
  await page.goto("/app/auditoria");
  await page.waitForURL(/\/auth/);
  const afterProtected = await page.evaluate(() => ({
    theme: localStorage.getItem("theme"),
    lang: localStorage.getItem("lang"),
  }));
  expect(afterProtected).toEqual({ theme: "dark", lang: "en" });
});
