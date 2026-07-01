"""
E2E test: dispara um evento checkout.session.completed assinado no webhook local
e verifica que a assinatura é aceita.

Uso:
  USER_ID=<uuid> python3 scripts/webhook-e2e-checkout.py

Requer PAYMENTS_SANDBOX_WEBHOOK_SECRET no ambiente. O dev server deve estar rodando
em http://localhost:8080. Depois, valide no banco:

  SELECT public.is_pro('<user-id>'::uuid);
  SELECT * FROM public.stripe_webhook_events ORDER BY received_at DESC LIMIT 5;
"""
import os, json, time, hmac, hashlib, urllib.request, urllib.error, uuid, sys

SECRET = os.environ["PAYMENTS_SANDBOX_WEBHOOK_SECRET"]
USER_ID = os.environ.get("USER_ID")
if not USER_ID:
    sys.exit("set USER_ID env var to an auth.users.id")

SESSION_ID = f"cs_test_e2e_{uuid.uuid4().hex[:16]}"
EVENT_ID = f"evt_test_e2e_{uuid.uuid4().hex[:16]}"

event = {
    "id": EVENT_ID,
    "object": "event",
    "type": "checkout.session.completed",
    "data": {
        "object": {
            "id": SESSION_ID,
            "object": "checkout.session",
            "mode": "payment",
            "payment_status": "paid",
            "customer": f"cus_test_{uuid.uuid4().hex[:12]}",
            "amount_total": 4990,
            "currency": "brl",
            "metadata": {"userId": USER_ID},
        }
    },
}
body = json.dumps(event)
ts = str(int(time.time()))
sig = hmac.new(SECRET.encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()

req = urllib.request.Request(
    "http://localhost:8080/api/public/payments/webhook?env=sandbox",
    data=body.encode(),
    headers={"Content-Type": "application/json", "stripe-signature": f"t={ts},v1={sig}"},
    method="POST",
)
try:
    with urllib.request.urlopen(req) as r:
        print("HTTP", r.status, r.read().decode())
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode())
    sys.exit(1)

print("session_id:", SESSION_ID)
print("event_id:  ", EVENT_ID)
print("user_id:   ", USER_ID)
