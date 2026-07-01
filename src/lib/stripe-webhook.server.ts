/**
 * Verificação de assinatura de webhook Stripe usando HMAC-SHA256 nativo
 * (Web Crypto), sem depender do SDK do Stripe.
 *
 * Isolado em arquivo próprio para que rotas de webhook (importadas pelo
 * routeTree.gen.ts na avaliação de módulos) não puxem o SDK completo,
 * o que quebra o grafo de imports do TanStack Router em dev.
 */

const getEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not configured`);
  return value;
};

export type StripeEnv = "sandbox" | "live";

export async function verifyStripeWebhook(
  req: Request,
  env: StripeEnv,
): Promise<{ type: string; data: { object: Record<string, unknown> } }> {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  const secret =
    env === "sandbox"
      ? getEnv("PAYMENTS_SANDBOX_WEBHOOK_SECRET")
      : getEnv("PAYMENTS_LIVE_WEBHOOK_SECRET");

  if (!signature || !body) throw new Error("Missing signature or body");

  let timestamp: string | undefined;
  const v1Signatures: string[] = [];
  for (const part of signature.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t") timestamp = value;
    if (key === "v1") v1Signatures.push(value);
  }
  if (!timestamp || v1Signatures.length === 0) {
    throw new Error("Invalid signature format");
  }

  // 5 min de tolerância (padrão Stripe)
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) throw new Error("Webhook timestamp too old");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  const expected = Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (!v1Signatures.includes(expected)) {
    throw new Error("Invalid webhook signature");
  }

  return JSON.parse(body);
}
