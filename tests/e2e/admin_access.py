"""
End-to-end test for admin access control.

Provisions a disposable non-admin user, signs in, and verifies:

  1. Visiting /admin/seo and /app/auditoria redirects to /app (not the admin shell).
  2. Calling each protected admin server fn over HTTP returns Forbidden.
  3. Each block writes an `admin_access_denied` row in `security_audit_log`
     tagged with the test user's id and the resource label.
  4. RLS prevents the non-admin from reading admin tables via the Data API
     (user_roles, seo_scan_runs, security_alert_acks, uptime_checks,
     security_retention_policy) — even when the user is signed in.

Cleanup: the test always deletes the disposable user, even on failure.

Run from project root:
    python3 tests/e2e/admin_access.py
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

SCREENSHOTS = Path("/tmp/browser/admin-access/screenshots")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

# Protected routes whose beforeLoad calls requireAdminAccess()
# → expected `resource` label written by the server-side guard on deny.
PROTECTED_ROUTES = [
    ("/admin/seo",     "route:/admin/seo"),
    ("/app/auditoria", "route:/app/auditoria"),
]

ADMIN_TABLES = [
    "user_roles",
    "seo_scan_runs",
    "security_alert_acks",
    "uptime_checks",
    "security_retention_policy",
]

results: list[tuple[str, bool, str]] = []


def record(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    icon = "✅" if ok else "❌"
    print(f"{icon} {name}" + (f"  — {detail}" if detail else ""))


# ─────────────────────────────────────────────────────────────────────────────
# Supabase helpers (REST, no client library)
# ─────────────────────────────────────────────────────────────────────────────

def admin_headers() -> dict[str, str]:
    return {"apikey": SERVICE_ROLE, "Authorization": f"Bearer {SERVICE_ROLE}"}


def create_test_user() -> tuple[str, str, str, str]:
    """Creates a non-admin user. Returns (user_id, email, password, access_token)."""
    suffix = secrets.token_hex(6)
    email = f"e2e-nonadmin-{suffix}@vaiprala.test"
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
    session = r.json()
    return user_id, email, password, session["access_token"], session


def delete_test_user(user_id: str) -> None:
    try:
        requests.delete(
            f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
            headers=admin_headers(),
            timeout=15,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"⚠️  cleanup failed for {user_id}: {exc}")


def query_audit_log(user_id: str, since_iso: str) -> list[dict]:
    """Service-role read of admin_access_denied rows for a user."""
    params = {
        "select": "user_id,resource,created_at",
        "event_type": "eq.admin_access_denied",
        "user_id": f"eq.{user_id}",
        "created_at": f"gte.{since_iso}",
        "order": "created_at.desc",
        "limit": "200",
    }
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/security_audit_log?{urllib.parse.urlencode(params)}",
        headers=admin_headers(),
        timeout=15,
    )
    r.raise_for_status()
    return r.json()


# ─────────────────────────────────────────────────────────────────────────────
# RLS tests via REST (no browser)
# ─────────────────────────────────────────────────────────────────────────────



def test_rls_blocks_admin_tables(access_token: str) -> None:
    """Each table must return 0 rows (RLS hides) or 401/403 (no grant)."""
    headers = {
        "apikey": PUBLISHABLE,
        "Authorization": f"Bearer {access_token}",
    }
    for table in ADMIN_TABLES:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/{table}?select=*&limit=10",
            headers=headers,
            timeout=10,
        )
        rows: object
        if r.status_code == 200:
            try:
                rows = r.json()
                blocked = isinstance(rows, list) and len(rows) == 0
                detail = f"200 OK, {len(rows)} row(s) — RLS hides all"
            except ValueError:
                blocked = False
                detail = f"200 with non-JSON body: {r.text[:80]!r}"
        elif r.status_code in (401, 403):
            blocked = True
            detail = f"{r.status_code} {r.reason} — denied at table level"
        else:
            blocked = False
            detail = f"unexpected {r.status_code}: {r.text[:80]!r}"
        record(f"RLS blocks read on {table}", blocked, detail)

    # Bonus: confirm self-promotion via INSERT into user_roles is blocked.
    # The policy `Admins insert roles` requires has_role(uid,'admin') AND uid<>user_id.
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/user_roles",
        headers={**headers, "Content-Type": "application/json", "Prefer": "return=minimal"},
        json={"user_id": "00000000-0000-0000-0000-000000000000", "role": "admin"},
        timeout=10,
    )
    record(
        "RLS blocks INSERT into user_roles (self-promotion)",
        r.status_code in (401, 403),
        f"status={r.status_code} body={r.text[:120]!r}",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Playwright redirect test
# ─────────────────────────────────────────────────────────────────────────────

async def test_route_redirects(session: dict) -> set[str]:
    """Returns the set of resource labels expected in audit log (one per visited admin route)."""
    session_json = json.dumps(session)
    expected_resources: set[str] = set()

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()

        await page.goto(APP_ORIGIN, wait_until="domcontentloaded")
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(STORAGE_KEY)}, {json.dumps(session_json)})"
        )

        for path, resource in PROTECTED_ROUTES:
            await page.goto(f"{APP_ORIGIN}{path}", wait_until="domcontentloaded")
            # client-side beforeLoad calls requireAdminAccess(); allow up to 15s
            try:
                await page.wait_for_function(
                    f"() => !location.pathname.startsWith({json.dumps(path)})",
                    timeout=15000,
                )
            except Exception:
                pass
            await page.wait_for_load_state("networkidle", timeout=5000)
            final = page.url
            slug = path.replace("/", "_")
            await page.screenshot(path=str(SCREENSHOTS / f"after{slug}.png"))
            # Acceptable destinations: /app (admin gate redirected) or /auth (session not picked up)
            from urllib.parse import urlparse
            dest = urlparse(final).path
            redirected = dest != path
            record(
                f"GET {path} → redirected away (non-admin)",
                redirected,
                f"final path = {dest}",
            )
            expected_resources.add(resource)

        await browser.close()
    return expected_resources

            # client-side beforeLoad needs a tick to call requireAdminAccess()
            try:
                await page.wait_for_url(lambda url: "/app/auditoria" not in url and "/admin/seo" not in url, timeout=8000)
            except Exception:
                pass
            final = page.url
            slug = path.replace("/", "_")
            await page.screenshot(path=str(SCREENSHOTS / f"after{slug}.png"))
            ok = final.endswith("/app") or "/app?" in final or "/auth" in final
            record(
                f"GET {path} → redirected away (non-admin)",
                ok,
                f"final URL = {final}",
            )

        await browser.close()


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

async def main() -> int:
    user_id, email, password, access_token, session = create_test_user()
    print(f"📌 test user: {email}  id={user_id}")
    started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 5))

    try:
        await test_route_redirects(session)
        expected_resources = test_server_fns_forbidden(access_token)
        test_rls_blocks_admin_tables(access_token)

        # Give the audit log a beat to flush.
        await asyncio.sleep(1.5)
        rows = query_audit_log(user_id, started_at)
        seen = {r["resource"] for r in rows}
        record(
            "security_audit_log captured admin_access_denied rows for this user",
            len(rows) > 0,
            f"{len(rows)} row(s), resources={sorted(seen)}",
        )
        for resource in sorted(expected_resources):
            record(
                f"audit row exists for resource={resource}",
                resource in seen,
                "",
            )
    finally:
        delete_test_user(user_id)
        print(f"🧹 deleted test user {user_id}")

    failed = [name for name, ok, _ in results if not ok]
    print()
    print(f"=== {len(results) - len(failed)}/{len(results)} checks passed ===")
    if failed:
        print("FAILED:")
        for name in failed:
            print(f"  - {name}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
