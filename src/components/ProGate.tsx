import { Link } from "@tanstack/react-router";
import { Lock, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePro } from "@/hooks/usePro";

/**
 * Envoltório de gating. Use ao redor de UIs que só usuários Pro veem.
 *
 *   <ProGate feature="multiple_resumes" title="Múltiplos currículos">
 *     <CurriculosManager />
 *   </ProGate>
 *
 * Quando o usuário não tem a feature, exibe um card de upgrade que não vaza
 * absolutamente nada do conteúdo gateado.
 */
export function ProGate({
  feature,
  title,
  description,
  children,
}: {
  feature: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const { has, isLoading } = usePro();

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (has(feature)) return <>{children}</>;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-8 sm:p-10 text-center space-y-4">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary mx-auto">
          <Lock className="h-6 w-6" />
        </div>
        <div className="space-y-1 max-w-md mx-auto">
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">
            {description ?? "Esta funcionalidade está disponível no plano Pro."}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <Link to="/precos">
            <Button className="h-11 px-6">
              <Sparkles className="mr-2 h-4 w-4" /> Ver planos Pro
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
