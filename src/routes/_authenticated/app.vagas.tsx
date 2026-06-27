import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, RefreshCw, MapPin, Calendar, Mail, Phone, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { triggerDolImport } from "@/lib/jobs.functions";
import type { Database } from "@/integrations/supabase/types";

type Job = Database["public"]["Tables"]["jobs"]["Row"];

export const Route = createFileRoute("/_authenticated/app/vagas")({ component: Page });

function daysAgo(date: string | null): number | null {
  if (!date) return null;
  const d = new Date(date).getTime();
  if (Number.isNaN(d)) return null;
  return Math.floor((Date.now() - d) / 86400000);
}

function freshnessBadge(date: string | null) {
  const d = daysAgo(date);
  if (d == null) return <Badge variant="outline">sem data</Badge>;
  if (d <= 3) return <Badge className="bg-green-600 hover:bg-green-600">Nova ({d}d)</Badge>;
  if (d <= 10) return <Badge className="bg-yellow-500 hover:bg-yellow-500 text-black">Recente ({d}d)</Badge>;
  return <Badge variant="secondary">{d}d atrás</Badge>;
}

function Page() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<null | "daily" | "backfill">(null);
  const [stateFilter, setStateFilter] = useState("");
  const [search, setSearch] = useState("");
  const [hasEmailOnly, setHasEmailOnly] = useState(false);
  const importFn = useServerFn(triggerDolImport);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .order("posted_date", { ascending: false, nullsFirst: false })
      .limit(500);
    if (error) toast.error("Erro ao carregar vagas: " + error.message);
    setJobs(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function runImport(daysBack: number, label: "daily" | "backfill") {
    setImporting(label);
    try {
      const result = await importFn({ data: { daysBack } });
      toast.success(`Importadas ${result.imported} vagas`);
      await load();
    } catch (e) {
      toast.error("Falha ao importar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setImporting(null);
    }
  }

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const st = stateFilter.trim().toLowerCase();
    return jobs.filter((j) => {
      if (hasEmailOnly && !j.recruitment_email) return false;
      if (st && !(j.worksite_state ?? "").toLowerCase().includes(st)) return false;
      if (s) {
        const hay = `${j.job_title ?? ""} ${j.employer_name ?? ""} ${j.worksite_city ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [jobs, search, stateFilter, hasEmailOnly]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Vagas H-2A</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => runImport(15, "backfill")}
            disabled={importing !== null}
          >
            {importing === "backfill" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Backfill 15 dias
          </Button>
          <Button
            size="sm"
            onClick={() => runImport(2, "daily")}
            disabled={importing !== null}
          >
            {importing === "daily" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            🔄 Buscar vagas agora
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 grid gap-2 sm:grid-cols-3">
          <Input
            placeholder="Buscar título / empregador / cidade"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Input
            placeholder="Estado (ex: FLORIDA)"
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hasEmailOnly}
              onChange={(e) => setHasEmailOnly(e.target.checked)}
            />
            Apenas com e-mail de contato
          </label>
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        {loading
          ? "Carregando…"
          : `${filtered.length} vagas (de ${jobs.length} importadas) — ordenadas por data de publicação`}
      </div>

      <div className="grid gap-3">
        {filtered.map((j) => (
          <Card key={j.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{j.job_title ?? "Sem título"}</CardTitle>
                  <div className="text-sm text-muted-foreground">{j.employer_name ?? "—"}</div>
                </div>
                {freshnessBadge(j.posted_date)}
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {(j.worksite_city || j.worksite_state) && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {[j.worksite_city, j.worksite_state].filter(Boolean).join(", ")}
                  </span>
                )}
                {j.start_date && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {j.start_date} → {j.end_date ?? "?"}
                  </span>
                )}
                {j.wage_offered != null && (
                  <span>
                    💵 ${j.wage_offered}/{j.wage_unit ?? "hr"}
                  </span>
                )}
                {j.total_openings != null && <span>👥 {j.total_openings} vagas</span>}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {j.recruitment_email && (
                  <a
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                    href={`mailto:${j.recruitment_email}`}
                  >
                    <Mail className="h-3.5 w-3.5" /> {j.recruitment_email}
                  </a>
                )}
                {j.recruitment_phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> {j.recruitment_phone}
                  </span>
                )}
                {j.recruitment_website && j.recruitment_website !== "N/A" && (
                  <a
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                    href={j.recruitment_website}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Site
                  </a>
                )}
              </div>
              {j.external_case_number && (
                <div className="text-xs text-muted-foreground">Case: {j.external_case_number}</div>
              )}
            </CardContent>
          </Card>
        ))}
        {!loading && filtered.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-center text-sm text-muted-foreground">
              Nenhuma vaga ainda. Clique em <strong>Backfill 15 dias</strong> para importar do DOL.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
