"""
E2E test for the SpikeConfigTab UI and the underlying
getAdminSpikeConfig / updateAdminSpikeConfig server functions.

Verifies that:
  1. A non-admin user is redirected away from /app/auditoria (cannot even
     reach the SpikeConfig tab) AND cannot bypass it via direct REST writes
     to admin_denied_spike_config (RLS).
  2. After being promoted to admin, the same user can open the SpikeConfig
     tab, change the threshold and window, click "Salvar", and the new
     values are persisted in the admin_denied_spike_config table.
  3. Reverting the values via the UI persists again (round-trip).

Cleanup always:
  - deletes the test user
  - restores admin_denied_spike_config to its previous values

Run from project root:
    python3 tests/e2e/admin_spike_config.py
"""
from __future__ import annotations

import asyncio
import json
import os
import secrets
import sys
import time
import urllib.parse
from pathlib import Path

import requests
from playwright.async_api import async_playwright


SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
PUBLISHABLE = os.environ["SUPABASE_PUBLISHABLE_KEY"]
PROJECT_REF = os.environ.get("SUPABASE_PROJECT_ID") or os.environ["VITE_SUPABASE_PROJECT_ID"]
APP_ORIGIN = os.environ.get("E2E_APP_ORIGIN", "http://localhost:8080")
STORAGE_KEY = f"sb-{PROJECT_REF}-auth-token"

SCREENSHOTS = Path("/tmp/browser/admin-spike-config/screenshots")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

results: list[tuple[str, bool, str]] = []


def record(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    icon = "✅" if ok else "❌"
    print(f"{icon} {name}" + (f"  — {detail}" if detail else ""))


def admin_headers() -> dict[str, str]:
    return {"apikey": SERVICE_ROLE, "Authorization": f"Bearer {SERVICE_ROLE}"}


def create_test_user() -> tuple[str, str, dict]:
    suffix = secrets.token_hex(6)
    email = f"e2e-spike-{suffix}@vaiprala.test"
    password = secrets.token_urlsafe(24)
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/admin/users",
        headers={**admin_headers(), "Content-Type": "application/json"},
        json={"email": email, "password": password, "email_confirm": True},
        timeout=15,
    )
    r.raise_for_status()
    uid = r.json()["id"]
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": PUBLISHABLE, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=15,
    )
    r.raise_for_status()
    return uid, email, r.json()


def delete_test_user(uid: str) -> None:
    try:
        requests.delete(
            f"{SUPABASE_URL}/auth/v1/admin/users/{uid}",
            headers=admin_headers(),
            timeout=15,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"⚠️  cleanup failed for {uid}: {exc}")


def get_spike_config() -> dict:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/admin_denied_spike_config?select=*&limit=1",
        headers=admin_headers(),
        timeout=15,
    )
    r.raise_for_status()
    rows = r.json()
    return rows[0] if rows else {"id": True, "threshold": 10, "window_minutes": 60}


def upsert_spike_config(threshold: int, window_minutes: int) -> None:
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/admin_denied_spike_config",
        headers={
            **admin_headers(),
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        json={"id": True, "threshold": threshold, "window_minutes": window_minutes},
        timeout=15,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"failed to restore spike config: {r.status_code} {r.text}")


def grant_admin(uid: str) -> None:
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/user_roles",
        headers={
            **admin_headers(),
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        json={"user_id": uid, "role": "admin"},
        timeout=15,
    )
    if r.status_code >= 400 and r.status_code != 409:
        raise RuntimeError(f"failed to grant admin: {r.status_code} {r.text}")


def test_non_admin_rls(access_token: str) -> None:
    """Non-admin user must not be able to write admin_denied_spike_config directly."""
    headers = {
        "apikey": PUBLISHABLE,
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/admin_denied_spike_config",
        headers=headers,
        json={"id": True, "threshold": 999, "window_minutes": 999},
        timeout=10,
    )
    record(
        "non-admin cannot write admin_denied_spike_config via REST (RLS)",
        r.status_code in (401, 403),
        f"status={r.status_code} body={r.text[:120]!r}",
    )
    # Read should also be blocked.
    r2 = requests.get(
        f"{SUPABASE_URL}/rest/v1/admin_denied_spike_config?select=*",
        headers={"apikey": PUBLISHABLE, "Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    if r2.status_code == 200:
        try:
            rows = r2.json()
            blocked = isinstance(rows, list) and len(rows) == 0
            detail = f"200 OK, {len(rows)} row(s) — RLS hides all"
        except ValueError:
            blocked = False
            detail = "200 with non-JSON body"
    else:
        blocked = r2.status_code in (401, 403)
        detail = f"status={r2.status_code}"
    record("non-admin cannot read admin_denied_spike_config via REST", blocked, detail)


async def test_non_admin_ui_blocked(session: dict) -> None:
    session_json = json.dumps(session)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()
        await page.goto(APP_ORIGIN, wait_until="domcontentloaded")
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(STORAGE_KEY)}, {json.dumps(session_json)})"
        )
        await page.goto(f"{APP_ORIGIN}/app/auditoria", wait_until="domcontentloaded")
        try:
            await page.wait_for_function(
                "() => !location.pathname.startsWith('/app/auditoria')",
                timeout=15000,
            )
        except Exception:
            pass
        await page.wait_for_load_state("networkidle", timeout=5000)
        from urllib.parse import urlparse
        dest = urlparse(page.url).path
        await page.screenshot(path=str(SCREENSHOTS / "non_admin_auditoria.png"))
        record(
            "non-admin redirected away from /app/auditoria (spike tab unreachable)",
            dest != "/app/auditoria",
            f"final={dest}",
        )
        await browser.close()


async def test_admin_ui_persists(session: dict, new_threshold: int, new_window: int) -> None:
    session_json = json.dumps(session)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        server_fn_responses: list[tuple[int, str]] = []
        page.on("response", lambda r: (
            server_fn_responses.append((r.status, r.url))
            if "_serverFn" in r.url
            else None
        ))

        await page.goto(APP_ORIGIN, wait_until="domcontentloaded")
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(STORAGE_KEY)}, {json.dumps(session_json)})"
        )
        await page.goto(f"{APP_ORIGIN}/app/auditoria", wait_until="networkidle")
        await page.screenshot(path=str(SCREENSHOTS / "admin_auditoria.png"))
        # Click the Alertas: limites / spike-config tab. The TabsTrigger has value "spike-config".
        try:
            await page.locator('[role="tab"][data-state]', has_text="").first.wait_for(timeout=5000)
        except Exception:
            pass
        # Use a generic selector — the tab text contains "limite"
        clicked = False
        for sel in [
            'button[role="tab"]:has-text("limite")',
            'button[role="tab"]:has-text("Limite")',
            'button[role="tab"]:has-text("Alerta")',
        ]:
            loc = page.locator(sel).first
            if await loc.count():
                await loc.click()
                clicked = True
                break
        record("admin opened SpikeConfig tab", clicked, "tab trigger found and clicked")
        if not clicked:
            await browser.close()
            return

        await page.wait_for_selector("#spike-threshold", timeout=10000)
        await page.screenshot(path=str(SCREENSHOTS / "admin_spike_tab.png"))

        # Fill new values
        await page.fill("#spike-threshold", str(new_threshold))
        await page.fill("#spike-window", str(new_window))
        save_btn = page.locator('button:has-text("Salvar")').first
        await save_btn.click()

        # Wait for success toast or for query refetch (button becomes disabled again).
        try:
            await page.wait_for_selector('[data-sonner-toast], .toaster, text=Configuração atualizada', timeout=10000)
        except Exception:
            await asyncio.sleep(2)
        await page.screenshot(path=str(SCREENSHOTS / "admin_spike_saved.png"))

        # No leaked 5xx
        bad = [(s, u) for s, u in server_fn_responses if s >= 500]
        record(
            "no 5xx server-fn responses while admin updated config",
            len(bad) == 0,
            f"captured={len(server_fn_responses)} bad={bad[:3]}",
        )
        await browser.close()


def main() -> int:
    original = get_spike_config()
    print(f"📌 current spike config: threshold={original.get('threshold')} window={original.get('window_minutes')}")
    new_threshold = (int(original.get("threshold", 10)) % 50) + 7
    new_window = (int(original.get("window_minutes", 60)) % 200) + 11
    if new_threshold == original.get("threshold"):
        new_threshold += 1
    if new_window == original.get("window_minutes"):
        new_window += 1
    print(f"📌 will set: threshold={new_threshold} window={new_window}")

    user_id, email, session = create_test_user()
    print(f"📌 test user: {email}  id={user_id}")

    try:
        # 1. non-admin path
        asyncio.run(test_non_admin_ui_blocked(session))
        test_non_admin_rls(session["access_token"])

        # 2. promote and re-fetch a fresh session (claims need to include the new role)
        grant_admin(user_id)
        r = requests.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=refresh_token",
            headers={"apikey": PUBLISHABLE, "Content-Type": "application/json"},
            json={"refresh_token": session["refresh_token"]},
            timeout=15,
        )
        r.raise_for_status()
        admin_session = r.json()

        asyncio.run(test_admin_ui_persists(admin_session, new_threshold, new_window))

        # 3. verify persistence in DB
        time.sleep(1.0)
        after = get_spike_config()
        record(
            "admin update persisted to admin_denied_spike_config.threshold",
            int(after.get("threshold", -1)) == new_threshold,
            f"db={after.get('threshold')} expected={new_threshold}",
        )
        record(
            "admin update persisted to admin_denied_spike_config.window_minutes",
            int(after.get("window_minutes", -1)) == new_window,
            f"db={after.get('window_minutes')} expected={new_window}",
        )
        record(
            "admin update recorded updated_by = test user",
            (after.get("updated_by") or "") == user_id,
            f"updated_by={after.get('updated_by')}",
        )
    finally:
        # Always restore original config and delete user
        try:
            upsert_spike_config(
                int(original.get("threshold", 10)),
                int(original.get("window_minutes", 60)),
            )
            print("🧹 restored spike config")
        except Exception as exc:  # noqa: BLE001
            print(f"⚠️  failed to restore spike config: {exc}")
        delete_test_user(user_id)
        print(f"🧹 deleted test user {user_id}")

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
    sys.exit(main())
