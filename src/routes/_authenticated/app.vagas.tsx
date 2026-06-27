import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Loader2,
  RefreshCw,
  MapPin,
  Calendar,
  Mail,
  Phone,
  ExternalLink,
  Send,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { triggerDolImport } from "@/lib/jobs.functions";
import { generateCoverLetter, recordApplication } from "@/lib/applications.functions";
import { ApplyDialog } from "@/components/ApplyDialog";
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
  if (d <= 10)
    return <Badge className="bg-yellow-500 hover:bg-yellow-500 text-black">Recente ({d}d)</Badge>;
  return <Badge variant="secondary">{d}d atrás</Badge>;
}

function Page() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<null | "daily" | "backfill">(null);
  const [stateFilter, setStateFilter] = useState("");
  const [search, setSearch] = useState("");
  const [hasEmailOnly, setHasEmailOnly] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const importFn = useServerFn(triggerDolImport);
  const genFn = useServerFn(generateCoverLetter);
  const recordFn = useServerFn(recordApplication);

  async function load() {
    setLoading(true);
    const [jobsRes, appsRes] = await Promise.all([
      supabase
        .from("jobs")
        .select("*")
        .order("posted_date", { ascending: false, nullsFirst: false })
        .limit(500),
      supabase.from("applications").select("job_id"),
    ]);
    if (jobsRes.error) toast.error("Erro ao carregar vagas: " + jobsRes.error.message);
    setJobs(jobsRes.data ?? []);
    setAppliedJobIds(new Set((appsRes.data ?? []).map((a) => a.job_id).filter(Boolean) as string[]));
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

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBulk() {
    const targets = filtered.filter(
      (j) => selected.has(j.id) && j.recruitment_email && !appliedJobIds.has(j.id),
    );
    if (targets.length === 0) {
      toast.error("Nenhuma vaga selecionada com e-mail válido (e ainda não aplicada).");
      return;
    }
    setBulkRunning(true);
    let success = 0;
    let failed = 0;
    toast.info(`Gerando ${targets.length} cartas em paralelo…`);

    // Generate all letters in parallel
    const results = await Promise.allSettled(
      targets.map((j) => genFn({ data: { jobId: j.id } })),
    );

    // Then send sequentially via mailto (browsers can't open many at once)
    for (let i = 0; i < targets.length; i++) {
      const job = targets[i];
      const r = results[i];
      if (r.status !== "fulfilled") {
        failed++;
        continue;
      }
      try {
        await recordFn({
          data: { jobId: job.id, coverLetterEn: r.value.text, contactMethod: "email" },
        });
        const subject = encodeURIComponent(
          `Application for ${job.job_title ?? "H-2A position"} (Case ${job.external_case_number ?? ""})`,
        );
        const body = encodeURIComponent(r.value.text);
        const href = `mailto:${job.recruitment_email}?subject=${subject}&body=${body}`;
        window.open(href, "_blank");
        success++;
        await new Promise((res) => setTimeout(res, 1200));
      } catch {
        failed++;
      }
    }

    toast.success(`${success} candidaturas enviadas, ${failed} falharam.`);
    setBulkRunning(false);
    setSelected(new Set());
    setBulkMode(false);
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Vagas H-2A</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={bulkMode ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setBulkMode((b) => !b);
              setSelected(new Set());
            }}
          >
            {bulkMode ? `Cancelar (${selected.size})` : "Modo seleção"}
          </Button>
          {bulkMode && (
            <Button size="sm" onClick={runBulk} disabled={selected.size === 0 || bulkRunning}>
              {bulkRunning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Candidatar em massa ({selected.size})
            </Button>
          )}
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
            Backfill 15d
          </Button>
          <Button size="sm" onClick={() => runImport(2, "daily")} disabled={importing !== null}>
            {importing === "daily" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            🔄 Buscar agora
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
            Apenas com e-mail
          </label>
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        {loading
          ? "Carregando…"
          : `${filtered.length} vagas · ${appliedJobIds.size} já candidatado(s)`}
      </div>

      <div className="grid gap-3">
        {filtered.map((j) => {
          const applied = appliedJobIds.has(j.id);
          return (
            <Card key={j.id} className={applied ? "opacity-60" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    {bulkMode && (
                      <Checkbox
                        checked={selected.has(j.id)}
                        onCheckedChange={() => toggleSelect(j.id)}
                        disabled={applied || !j.recruitment_email}
                        className="mt-1"
                      />
                    )}
                    <div>
                      <CardTitle className="text-base">{j.job_title ?? "Sem título"}</CardTitle>
                      <div className="text-sm text-muted-foreground">{j.employer_name ?? "—"}</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {freshnessBadge(j.posted_date)}
                    {applied && <Badge variant="outline">✓ Candidatado</Badge>}
                  </div>
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
                    <span className="inline-flex items-center gap-1 text-primary">
                      <Mail className="h-3.5 w-3.5" /> {j.recruitment_email}
                    </span>
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
                {!bulkMode && (
                  <div className="pt-1">
                    <Button
                      size="sm"
                      onClick={() => setActiveJob(j)}
                      disabled={applied}
                    >
                      <Send className="mr-2 h-3.5 w-3.5" />
                      {applied ? "Já candidatado" : "Candidatar"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {!loading && filtered.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-center text-sm text-muted-foreground">
              Nenhuma vaga ainda. Clique em <strong>Backfill 15d</strong> para importar do DOL.
            </CardContent>
          </Card>
        )}
      </div>

      <ApplyDialog
        job={activeJob}
        open={!!activeJob}
        onOpenChange={(o) => !o && setActiveJob(null)}
        onSent={load}
      />
    </div>
  );
}
