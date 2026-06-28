/**
 * Client-side TOTP MFA helpers. Wraps supabase.auth.mfa for ergonomics.
 */
import { supabase } from "@/integrations/supabase/client";

export type TotpEnrollment = {
  factor_id: string;
  qr_code: string; // SVG data URI
  secret: string;  // base32 secret for manual entry
  uri: string;     // otpauth:// URI
};

export type MfaFactorSummary = {
  id: string;
  friendly_name: string | null;
  status: "verified" | "unverified";
  created_at: string;
};

export async function listMfaFactors(): Promise<MfaFactorSummary[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return (data?.totp ?? []).map((f) => ({
    id: f.id,
    friendly_name: f.friendly_name ?? null,
    status: f.status as "verified" | "unverified",
    created_at: f.created_at,
  }));
}

export async function startTotpEnrollment(friendly_name?: string): Promise<TotpEnrollment> {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: friendly_name,
  });
  if (error) throw error;
  if (!data) throw new Error("Falha ao iniciar MFA");
  return {
    factor_id: data.id,
    qr_code: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
}

export async function verifyTotpEnrollment(factor_id: string, code: string): Promise<void> {
  const challenge = await supabase.auth.mfa.challenge({ factorId: factor_id });
  if (challenge.error) throw challenge.error;
  const verify = await supabase.auth.mfa.verify({
    factorId: factor_id,
    challengeId: challenge.data.id,
    code,
  });
  if (verify.error) throw verify.error;
}

export async function removeMfaFactor(factor_id: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId: factor_id });
  if (error) throw error;
}
