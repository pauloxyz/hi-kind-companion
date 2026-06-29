"""
E2E sweep: every route under /admin/ MUST redirect a non-admin away and
write an admin_access_denied row.

Discovers admin routes from src/routes/_authenticated/admin.*.tsx so new
routes never silently ship without a guard. Fails the build if any admin
route file exists without a corresponding redirect + audit-log entry.

Run from project root:
    python3 tests/e2e/admin_routes_sweep.py
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import secrets
import sys
import time
import urllib.parse
from pathlib import Path
from urllib.parse import urlparse

import requests
from playwright.async_api import async_playwright

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
PUBLISHABLE = os.environ["SUPABASE_PUBLISHABLE_KEY"]
PROJECT_REF = os.environ.get("SUPABASE_PROJECT_ID") or os.environ["VITE_SUPABASE_PROJECT_ID"]
APP_ORIGIN = os.environ.get("E2E_APP_ORIGIN", "http://localhost:8080")
STORAGE_KEY = f"sb-{PROJECT_REF}-auth-token"

ROUTES_DIR = Path("src/routes/_authenticated")
SCREENSHOTS = Path("/tmp/browser/admin-sweep/screenshots")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

results: list[tuple[str, bool, str]] = []


def record(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"{'✅' if ok else '❌'} {name}" + (f"  — {detail}" if detail else ""))


def discover_admin_routes() -> list[str]:
    """admin.seo.tsx -> /admin/seo ; admin.foo.bar.tsx -> /admin/foo/bar"""
    routes: list[str] = []
    for f in sorted(ROUTES_DIR.glob("admin.*.tsx")):
        stem = f.stem  # admin.seo
        parts = stem.split(".")
        if parts[0] != "admin" or len(parts) < 2:
            continue
        # skip pathless segments (none expected here, but be defensive)
        path = "/" + "/".join(parts)
        routes.append(path)
    return routes


def admin_headers() -> dict[str, str]:
    return {"apikey": SERVICE_ROLE, "Authorization": f"Bearer {SERVICE_ROLE}"}


def create_test_user() -> tuple[str, str, dict]:
    suffix = secrets.token_hex(6)
    email = f"e2e-sweep-{suffix}@vaiprala.test"
    password = secrets.token_urlsafe(24)
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/admin/users",
        headers={**admin_headers(), "Content-Type": "application/json"},
        json={"email": email, "password": password, "email_confirm": True},
        timeout=15,
    )
    r.raise_for_status()
    user_id = r.json()["id"]
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": PUBLISHABLE, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=15,
    )
    r.raise_for_status()
    return user_id, email, r.json()


def delete_test_user(user_id: str) -> None:
    try:
        requests.delete(
            f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
            headers=admin_headers(),
            timeout=15,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"⚠️  cleanup failed: {exc}")


def query_denied_resources(user_id: str, since_iso: str) -> set[str]:
    params = {
        "select": "resource",
        "event_type": "eq.admin_access_denied",
        "user_id": f"eq.{user_id}",
        "created_at": f"gte.{since_iso}",
        "limit": "500",
    }
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/security_audit_log?{urllib.parse.urlencode(params)}",
        headers=admin_headers(),
        timeout=15,
    )
    r.raise_for_status()
    return {row["resource"] for row in r.json() if row.get("resource")}


async def visit_routes(session: dict, paths: list[str]) -> None:
    session_json = json.dumps(session)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        await page.goto(APP_ORIGIN, wait_until="domcontentloaded")
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(STORAGE_KEY)}, {json.dumps(session_json)})"
        )
        # Warm the session
        await page.goto(f"{APP_ORIGIN}/app", wait_until="networkidle")

        for path in paths:
            await page.goto(f"{APP_ORIGIN}{path}", wait_until="domcontentloaded")
            try:
                await page.wait_for_function(
                    f"() => !location.pathname.startsWith({json.dumps(path)})",
                    timeout=15000,
                )
            except Exception:
                pass
            await page.wait_for_load_state("networkidle", timeout=5000)
            dest = urlparse(page.url).path
            slug = re.sub(r"[^a-z0-9]+", "_", path.lower())
            await page.screenshot(path=str(SCREENSHOTS / f"after{slug}.png"))
            record(
                f"GET {path} → redirected for non-admin",
                dest != path,
                f"final={dest}",
            )

        await browser.close()


async def main() -> int:
    paths = discover_admin_routes()
    if not paths:
        record("discovered at least one /admin/* route", False, "none found under src/routes/_authenticated/admin.*.tsx")
        print("=== 0/1 checks passed ===")
        return 1
    print(f"📌 sweeping {len(paths)} admin route(s): {paths}")

    user_id, email, session = create_test_user()
    print(f"📌 test user: {email}  id={user_id}")
    started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 5))

    try:
        await visit_routes(session, paths)
        await asyncio.sleep(1.5)
        seen = query_denied_resources(user_id, started_at)
        for path in paths:
            expected = f"route:{path}"
            record(
                f"audit row exists for resource={expected}",
                expected in seen,
                f"seen={sorted(seen)}" if expected not in seen else "",
            )
    finally:
        delete_test_user(user_id)
        print(f"🧹 deleted {user_id}")

    failed = [n for n, ok, _ in results if not ok]
    print()
    print(f"=== {len(results) - len(failed)}/{len(results)} checks passed ===")
    if failed:
        print("FAILED:")
        for n in failed:
            print(f"  - {n}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
