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
import { Loader2, Sun, Moon, Monitor, AlertTriangle, ShieldAlert, LogOut, Download } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { logAccountEvent } from "@/lib/security-audit.functions";
import { changeEmailWithReauth, deleteOwnAccount } from "@/lib/account-security.functions";
import { signOutEverywhere } from "@/lib/account-sessions.functions";
import { exportMyData } from "@/lib/account-export.functions";
import { useQueryClient } from "@tanstack/react-query";
import { MfaCard } from "@/components/MfaCard";

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
  const logEvent = useServerFn(logAccountEvent);
  const changeEmailFn = useServerFn(changeEmailWithReauth);
  const deleteAccountFn = useServerFn(deleteOwnAccount);
  const signOutAllFn = useServerFn(signOutEverywhere);
  const exportDataFn = useServerFn(exportMyData);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [signingOutAll, setSigningOutAll] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExportData = async () => {
    setExporting(true);
    try {
      const data = await exportDataFn();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `meus-dados-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Dados exportados com sucesso");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar dados");
    } finally {
      setExporting(false);
    }
  };

  const handleSignOutEverywhere = async () => {
    if (!confirm("Encerrar todas as outras sessões? Você precisará fazer login novamente em todos os dispositivos.")) return;
    setSigningOutAll(true);
    try {
      await signOutAllFn();
      toast.success("Todas as sessões foram encerradas. Faça login novamente.");
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      navigate({ to: "/auth", replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao encerrar sessões");
    } finally {
      setSigningOutAll(false);
    }
  };

  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // change password
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  // change email — re-auth required
  const [newEmail, setNewEmail] = useState("");
  const [emailReauthPwd, setEmailReauthPwd] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  // delete account — re-auth required
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteReauthPwd, setDeleteReauthPwd] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setEmail(data.user?.email ?? "");
      setUserId(data.user?.id ?? null);
      setLoading(false);
    });
    // audit: settings opened
    logEvent({ data: { event_type: "settings_viewed" } }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }
    if (!isPasswordAcceptable(newPassword)) {
      toast.error("Senha muito fraca — escolha uma mais forte.");
      logEvent({ data: { event_type: "password_change_failed", metadata: { reason: "weak" } } }).catch(() => {});
      return;
    }
    setSavingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPwd(false);
    if (error) {
      const leaked = /pwned|leaked|compromised|breach/i.test(error.message);
      toast.error(leaked ? "Esta senha apareceu em vazamentos públicos. Escolha outra." : error.message);
      logEvent({
        data: {
          event_type: "password_change_failed",
          metadata: { reason: leaked ? "hibp" : "auth_error", message: error.message.slice(0, 200) },
        },
      }).catch(() => {});
      return;
    }
    toast.success("Senha atualizada com sucesso.");
    setNewPassword("");
    setConfirmPassword("");
    logEvent({ data: { event_type: "password_changed" } }).catch(() => {});
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || newEmail === email || !emailReauthPwd) return;
    setSavingEmail(true);
    try {
      await changeEmailFn({ data: { password: emailReauthPwd, new_email: newEmail } });
      toast.success("Enviamos um link de confirmação para o novo e-mail.");
      setNewEmail("");
      setEmailReauthPwd("");
      logEvent({ data: { event_type: "email_change_requested" } }).catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao atualizar e-mail";
      toast.error(msg);
      logEvent({
        data: { event_type: "email_change_failed", metadata: { message: msg.slice(0, 200) } },
      }).catch(() => {});
    } finally {
      setSavingEmail(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== "EXCLUIR") {
      toast.error('Digite "EXCLUIR" para confirmar.');
      return;
    }
    if (!deleteReauthPwd) {
      toast.error("Confirme sua senha atual.");
      return;
    }
    setDeleting(true);
    try {
      logEvent({ data: { event_type: "account_deletion_requested" } }).catch(() => {});
      await deleteAccountFn({ data: { password: deleteReauthPwd } });
      toast.success("Conta excluída. Até logo.");
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      navigate({ to: "/auth", replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao excluir conta";
      toast.error(msg);
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
              <Label htmlFor="new-email">Novo e-mail</Label>
              <Input
                id="new-email"
                type="email"
                placeholder="novo@exemplo.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-reauth-pwd" className="flex items-center gap-1.5">
                <ShieldAlert className="size-3.5" /> Confirme sua senha atual
              </Label>
              <Input
                id="email-reauth-pwd"
                type="password"
                value={emailReauthPwd}
                onChange={(e) => setEmailReauthPwd(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
              />
              <p className="text-[11px] text-muted-foreground">
                Por segurança, exigimos a senha atual para alterar o e-mail. Um link de confirmação será enviado ao novo endereço.
              </p>
            </div>
            <Button type="submit" disabled={savingEmail || !newEmail || !emailReauthPwd}>
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

      {/* 2FA */}
      <MfaCard />

      {/* Sessões */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LogOut className="size-5" /> Sessões ativas
          </CardTitle>
          <CardDescription>
            Encerre o acesso em todos os dispositivos onde você está logado. Será necessário fazer login novamente em todos eles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            disabled={signingOutAll}
            onClick={handleSignOutEverywhere}
          >
            {signingOutAll && <Loader2 className="size-4 animate-spin" />}
            Encerrar todas as outras sessões
          </Button>
        </CardContent>
      </Card>

      {/* Exportar dados */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="size-5" /> Exportar meus dados
          </CardTitle>
          <CardDescription>
            Baixe uma cópia em JSON de todos os dados associados à sua conta (LGPD/GDPR).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" disabled={exporting} onClick={handleExportData}>
            {exporting && <Loader2 className="size-4 animate-spin" />}
            Baixar meus dados (JSON)
          </Button>
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
                    onClick={() => {
                      if (lang !== opt.code) {
                        setLang(opt.code);
                        logEvent({ data: { event_type: "language_changed", metadata: { to: opt.code, from: lang } } }).catch(() => {});
                      }
                    }}
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
                    onClick={() => {
                      if (theme !== code) {
                        setTheme(code);
                        logEvent({ data: { event_type: "theme_changed", metadata: { to: code, from: theme } } }).catch(() => {});
                      }
                    }}
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
            A exclusão da conta remove permanentemente seus dados, candidaturas e perfil público. Esta ação é irreversível.
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
          <div className="space-y-1.5">
            <Label htmlFor="delete-reauth-pwd" className="flex items-center gap-1.5">
              <ShieldAlert className="size-3.5" /> Confirme sua senha atual
            </Label>
            <Input
              id="delete-reauth-pwd"
              type="password"
              value={deleteReauthPwd}
              onChange={(e) => setDeleteReauthPwd(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>
          <Button
            variant="destructive"
            onClick={handleDeleteAccount}
            disabled={deleting || deleteConfirm !== "EXCLUIR" || !deleteReauthPwd}
          >
            {deleting && <Loader2 className="size-4 animate-spin" />}
            Excluir minha conta
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
