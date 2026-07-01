export type AuthMode = "signin" | "signup" | "forgot";

const TITLES: Record<AuthMode, { title: string; subtitle: string }> = {
  signin: { title: "Bem-vindo de volta", subtitle: "Entre para acompanhar suas candidaturas." },
  signup: { title: "Comece sua jornada", subtitle: "Crie sua conta gratuita em menos de um minuto." },
  forgot: { title: "Recuperar senha", subtitle: "Enviaremos um link para você criar uma nova senha." },
};

/** Mode-driven h1 + description block for the auth card. */
export function AuthHeading({ mode }: { mode: AuthMode }) {
  const { title, subtitle } = TITLES[mode];
  return (
    <div className="space-y-1.5">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}
