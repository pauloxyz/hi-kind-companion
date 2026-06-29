import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { I18nProvider } from "@/lib/i18n";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Painel privado — VaiPraLá" },
      { name: "description", content: "Área privada para candidatos VaiPraLá acompanharem perfil, candidaturas, documentos e preparação para vagas H-2A." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: () => (
    <I18nProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </I18nProvider>
  ),
});
