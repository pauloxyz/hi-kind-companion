import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@/lib/i18n";
import { useTheme, type Theme } from "@/lib/theme";
import { PasswordStrength, isPasswordAcceptable } from "@/components/PasswordStrength";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Loader2, Sun, Moon, Monitor, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/configuracoes")({
  component: ConfiguracoesPage,
});

const LANG_OPTIONS: { code: "pt" | "en" | "es"; label: string; flag: string }[] = [
  { code: "pt", label: "Português", flag: "🇧🇷" },
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "es", label: "Español", flag: "🇪🇸" },
];

const THEME_OPTIONS: { code: Theme; label: string; Icon: typeof Sun }[] = [
  { code: "light", label: "Claro", Icon: Sun },
  { code: "dark", label: "Escuro", Icon: Moon },
  { code: "system", label: "Automático", Icon: Monitor },
];

function ConfiguracoesPage() {
  const { lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // change password
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  // change email
  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  // delete account
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setEmail(data.user?.email ?? "");
      setUserId(data.user?.id ?? null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }
    if (!isPasswordAcceptable(newPassword)) {
      toast.error("Senha muito fraca — escolha uma mais forte.");
      return;
    }
    setSavingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPwd(false);
    if (error) {
      const msg = /pwned|leaked|compromised|breach/i.test(error.message)
        ? "Esta senha apareceu em vazamentos públicos. Escolha outra."
        : error.message;
      toast.error(msg);
      return;
    }
    toast.success("Senha atualizada com sucesso.");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || newEmail === email) return;
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setSavingEmail(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Enviamos um link de confirmação para o novo e-mail.");
    setNewEmail("");
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== "EXCLUIR") {
      toast.error('Digite "EXCLUIR" para confirmar.');
      return;
    }
    setDeleting(true);
    try {
      const { error } = await supabase.rpc("request_account_deletion" as never);
      if (error) throw error;
      await supabase.auth.signOut();
      toast.success("Conta agendada para exclusão. Você foi desconectado.");
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível excluir a conta.");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie sua conta, preferências e segurança.
        </p>
      </div>

      {/* Conta */}
      <Card>
        <CardHeader>
          <CardTitle>Conta</CardTitle>
          <CardDescription>Informações de acesso à sua conta.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>E-mail atual</Label>
            <Input value={email} disabled />
            {userId && (
              <p className="text-[11px] text-muted-foreground font-mono">ID: {userId}</p>
            )}
          </div>
          <Separator />
          <form onSubmit={handleChangeEmail} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-email">Alterar e-mail</Label>
              <Input
                id="new-email"
                type="email"
                placeholder="novo@exemplo.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                autoComplete="email"
              />
              <p className="text-[11px] text-muted-foreground">
                Você receberá um link de confirmação no novo endereço.
              </p>
            </div>
            <Button type="submit" disabled={savingEmail || !newEmail}>
              {savingEmail && <Loader2 className="size-4 animate-spin" />}
              Atualizar e-mail
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Senha */}
      <Card>
        <CardHeader>
          <CardTitle>Senha</CardTitle>
          <CardDescription>
            Use uma senha forte e única. Senhas vazadas são bloqueadas automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Nova senha</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
              <PasswordStrength password={newPassword} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirmar nova senha</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
              {confirmPassword.length > 0 && confirmPassword !== newPassword && (
                <p className="text-[11px] text-destructive font-medium">
                  As senhas não coincidem.
                </p>
              )}
            </div>
            <Button
              type="submit"
              disabled={
                savingPwd ||
                !newPassword ||
                newPassword !== confirmPassword ||
                !isPasswordAcceptable(newPassword)
              }
            >
              {savingPwd && <Loader2 className="size-4 animate-spin" />}
              Atualizar senha
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Preferências */}
      <Card>
        <CardHeader>
          <CardTitle>Preferências</CardTitle>
          <CardDescription>Idioma e tema visual.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label className="mb-2 block">Idioma</Label>
            <div role="radiogroup" aria-label="Idioma" className="grid grid-cols-3 gap-2">
              {LANG_OPTIONS.map((opt) => {
                const selected = lang === opt.code;
                return (
                  <button
                    key={opt.code}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setLang(opt.code)}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-md border py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-background text-foreground/75 hover:bg-accent",
                    )}
                  >
                    <span aria-hidden>{opt.flag}</span>
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label className="mb-2 block">Tema</Label>
            <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-2">
              {THEME_OPTIONS.map(({ code, label, Icon }) => {
                const selected = theme === code;
                return (
                  <button
                    key={code}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setTheme(code)}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-md border py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-background text-foreground/75 hover:bg-accent",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Zona de perigo */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5" aria-hidden />
            Zona de perigo
          </CardTitle>
          <CardDescription>
            A exclusão da conta remove permanentemente seus dados, candidaturas e perfil público.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="delete-confirm">
              Para confirmar, digite <span className="font-mono font-bold">EXCLUIR</span>
            </Label>
            <Input
              id="delete-confirm"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="EXCLUIR"
            />
          </div>
          <Button
            variant="destructive"
            onClick={handleDeleteAccount}
            disabled={deleting || deleteConfirm !== "EXCLUIR"}
          >
            {deleting && <Loader2 className="size-4 animate-spin" />}
            Excluir minha conta
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
