import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/visto")({
  component: VistoPage,
});

const links: Record<string, string> = {
  ds160: "https://ceac.state.gov/genniv/",
  mrv_paid: "https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/fees/fees-visa-services.html",
  interview_scheduled: "https://ais.usvisa-info.com/",
  i129_filed: "https://www.uscis.gov/i-129",
  visa_issued: "https://travel.state.gov/content/travel/en/us-visas/employment/temporary-worker-visas.html",
};

function VistoPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["visa-checklist"],
    queryFn: async () => {
      const { data } = await supabase
        .from("visa_checklist_items")
        .select("*")
        .order("sort_order");
      return data ?? [];
    },
  });

  const toggle = async (id: string, current: boolean) => {
    await supabase.from("visa_checklist_items")
      .update({ is_completed: !current, completed_at: !current ? new Date().toISOString() : null })
      .eq("id", id);
    qc.invalidateQueries({ queryKey: ["visa-checklist"] });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Checklist do Visto H-2A</h1>
      <Card>
        <CardHeader><CardTitle>Etapas do processo</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {data?.map((it) => (
            <div key={it.id} className="flex items-center gap-3 rounded-md border p-3">
              <Checkbox checked={!!it.is_completed} onCheckedChange={() => toggle(it.id, !!it.is_completed)} />
              <div className="flex-1">
                <div className={it.is_completed ? "line-through text-muted-foreground" : "font-medium"}>
                  {it.step_label}
                </div>
              </div>
              {links[it.step_key] && (
                <a href={links[it.step_key]} target="_blank" rel="noreferrer"
                   className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                  Abrir <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
