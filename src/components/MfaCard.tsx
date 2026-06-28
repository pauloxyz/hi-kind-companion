import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  listMfaFactors,
  removeMfaFactor,
  startTotpEnrollment,
  verifyTotpEnrollment,
  type MfaFactorSummary,
  type TotpEnrollment,
} from "@/lib/account-mfa";

export function MfaCard() {
  const [factors, setFactors] = useState<MfaFactorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      setFactors(await listMfaFactors());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleStart = async () => {
    setBusy(true);
    try {
      setEnrollment(await startTotpEnrollment("Authenticator"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao iniciar MFA");
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    if (!enrollment || code.length !== 6) return;
    setBusy(true);
    try {
      await verifyTotpEnrollment(enrollment.factor_id, code);
      toast.success("MFA ativado com sucesso");
      setEnrollment(null);
      setCode("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Código inválido");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm("Remover este fator MFA?")) return;
    setBusy(true);
    try {
      await removeMfaFactor(id);
      toast.success("Fator removido");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao remover");
    } finally {
      setBusy(false);
    }
  };

  const verified = factors.filter((f) => f.status === "verified");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5" /> Autenticação em dois fatores (2FA)
          {verified.length > 0 && <Badge variant="default">Ativa</Badge>}
        </CardTitle>
        <CardDescription>
          Use um app autenticador (Google Authenticator, 1Password, Authy) para gerar códigos temporários no login.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <>
            {factors.length > 0 && (
              <ul className="space-y-2 text-sm">
                {factors.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between border rounded-md px-3 py-2"
                  >
                    <div>
                      <div className="font-medium">{f.friendly_name ?? "TOTP"}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {f.status === "verified" ? "Verificado" : "Não verificado"} ·{" "}
                        {new Date(f.created_at).toLocaleDateString("pt-BR")}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => handleRemove(f.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {enrollment ? (
              <div className="space-y-3 border rounded-md p-4 bg-muted/30">
                <p className="text-sm">
                  1. Escaneie o QR code com seu app autenticador.<br />
                  2. Digite o código de 6 dígitos exibido.
                </p>
                <div
                  className="flex justify-center bg-white p-3 rounded"
                  dangerouslySetInnerHTML={{ __html: enrollment.qr_code }}
                />
                <div className="text-[11px] text-muted-foreground">
                  Ou digite manualmente:{" "}
                  <code className="font-mono">{enrollment.secret}</code>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="totp-code">Código de 6 dígitos</Label>
                  <Input
                    id="totp-code"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    autoComplete="one-time-code"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleVerify}
                    disabled={busy || code.length !== 6}
                  >
                    {busy && <Loader2 className="size-4 animate-spin" />}
                    Confirmar e ativar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEnrollment(null);
                      setCode("");
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              verified.length === 0 && (
                <Button onClick={handleStart} disabled={busy}>
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  Ativar 2FA
                </Button>
              )
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
