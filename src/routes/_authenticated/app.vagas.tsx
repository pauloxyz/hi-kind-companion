import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, RefreshCw, MapPin, Calendar, Mail, Phone, ExternalLink, Send, Sparkles, AlertTriangle, Star, Inbox } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

import { supabase } from "@/integrations/supabase/client";
import { triggerDolImport } from "@/lib/jobs.functions";
import { generateCoverLetter, recordApplication } from "@/lib/applications.functions";
import { ApplyDialog } from "@/components/ApplyDialog";
import { matchScore, detectFraud, jobQuality, type JobQuality } from "@/lib/score";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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

function matchBadge(score: number) {
  if (score >= 80) return <Badge className="bg-emerald-600">Match {score}%</Badge>;
  if (score >= 60) return <Badge className="bg-blue-600">Match {score}%</Badge>;
  return <Badge variant="outline">Match {score}%</Badge>;
}

type JobCategory = "machine" | "harvest" | "livestock" | "irrigation" | "supervisor" | "nursery" | "construction" | "general" | "other";

const CATEGORY_LABELS: Record<JobCategory, string> = {
  machine: "🚜 Operador de máquina",
  harvest: "🍓 Colheita / Picker",
  livestock: "🐄 Pecuária / Laticínios",
  irrigation: "💧 Irrigação",
  supervisor: "👷 Supervisor / Crew leader",
  nursery: "🌱 Viveiro / Nursery",
  construction: "🔨 Construção / Fence",
  general: "🌾 Farm worker (geral)",
  other: "❓ Outros",
};

function classifyJob(title: string | null): JobCategory {
  const t = (title ?? "").toLowerCase();
  if (!t) return "other";
  if (/(equipment|machine|tractor|combine|forklift|operator|driver|cdl|mechanic)/.test(t)) return "machine";
  if (/(supervisor|crew\s*leader|foreman|manager|coordinator)/.test(t)) return "supervisor";
  if (/(dairy|livestock|cattle|cow|herd|milker|ranch|sheep|goat|hog|swine|poultry|chicken)/.test(t)) return "livestock";
  if (/(irrigation|sprinkler)/.test(t)) return "irrigation";
  if (/(nursery|greenhouse|transplant|propagation)/.test(t)) return "nursery";
  if (/(fence|construction|builder)/.test(t)) return "construction";
  if (/(harvest|picker|picking|pruner|pruning|packer|packing|sorter|detasseler|detassel)/.test(t)) return "harvest";
  if (/(farm\s*worker|farmworker|laborer|general\s*farm|agricultural\s*worker|field\s*worker)/.test(t)) return "general";
  return "other";
}


function QualityMedal({ q }: { q: JobQuality }) {
  if (!q.level) return null;
  const cfg = {
    gold: { emoji: "🥇", label: "Top Pick", cls: "bg-yellow-500 hover:bg-yellow-500 text-black border-yellow-600" },
    silver: { emoji: "🥈", label: "Recomendada", cls: "bg-slate-300 hover:bg-slate-300 text-black border-slate-400" },
    bronze: { emoji: "🥉", label: "Boa opção", cls: "bg-amber-700 hover:bg-amber-700 text-white border-amber-800" },
  }[q.level];
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className={`cursor-help border ${cfg.cls}`}>{cfg.emoji} {cfg.label}</Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="text-xs space-y-1">
            <div className="font-semibold">Por que recomendamos ({q.score}/100):</div>
            <ul className="list-disc pl-4 space-y-0.5">
              {q.reasons_pt.map((r, i) => (<li key={i}>{r}</li>))}
            </ul>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}



function Page() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [resume, setResume] = useState<any>(null);
  const [suspiciousEmployers, setSuspiciousEmployers] = useState<Set<string>>(new Set());
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<null | "daily" | "backfill">(null);
  const [stateFilter, setStateFilter] = useState("");
  const [search, setSearch] = useState("");
  const [hasEmailOnly, setHasEmailOnly] = useState(false);
  const [hideApplied, setHideApplied] = useState(false);
  const [minWage, setMinWage] = useState("");
  const [sortBy, setSortBy] = useState<"match" | "fresh" | "wage" | "quality">("quality");
  const [categoryFilter, setCategoryFilter] = useState<"all" | JobCategory>("all");
  const [startAfter, setStartAfter] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);

  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const importFn = useServerFn(triggerDolImport);
  const genFn = useServerFn(generateCoverLetter);
  const recordFn = useServerFn(recordApplication);

  async function load() {
    setLoading(true);
    const [jobsRes, appsRes, profRes, resRes, empRes, savedRes] = await Promise.all([
      supabase.from("jobs").select("*").order("posted_date", { ascending: false, nullsFirst: false }).limit(500),
      supabase.from("applications").select("job_id"),
      supabase.from("my_profile").select("*").maybeSingle(),
      supabase.from("resumes").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("employers").select("employer_name").eq("is_flagged_suspicious", true),
      supabase.from("saved_jobs").select("job_id"),
    ]);
    if (jobsRes.error) toast.error("Erro ao carregar vagas: " + jobsRes.error.message);
    setJobs(jobsRes.data ?? []);
    setAppliedJobIds(new Set((appsRes.data ?? []).map((a) => a.job_id).filter(Boolean) as string[]));
    setProfile(profRes.data);
    setResume(resRes.data);
    setSuspiciousEmployers(new Set((empRes.data ?? []).map((e) => e.employer_name)));
    setSavedJobIds(new Set((savedRes.data ?? []).map((s: any) => s.job_id).filter(Boolean) as string[]));
    setLoading(false);
  }

  async function toggleSaved(jobId: string) {
    const isSaved = savedJobIds.has(jobId);
    // optimistic
    setSavedJobIds((prev) => {
      const n = new Set(prev);
      if (isSaved) n.delete(jobId); else n.add(jobId);
      return n;
    });
    if (isSaved) {
      const { error } = await supabase.from("saved_jobs").delete().eq("job_id", jobId);
      if (error) { toast.error("Falha ao remover favorito"); setSavedJobIds((p) => new Set(p).add(jobId)); }
    } else {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { error } = await supabase.from("saved_jobs").insert({ job_id: jobId, owner_id: u.user.id });
      if (error) {
        toast.error("Falha ao salvar");
        setSavedJobIds((p) => { const n = new Set(p); n.delete(jobId); return n; });
      } else {
        toast.success("Vaga salva nos favoritos");
      }
    }
  }



  useEffect(() => { void load(); }, []);

  async function runImport(daysBack: number, label: "daily" | "backfill") {
    setImporting(label);
    try {
      const result = await importFn({ data: { daysBack } });
      toast.success(`Importadas ${result.imported} vagas`);
      await load();
    } catch (e) { toast.error("Falha ao importar: " + (e instanceof Error ? e.message : String(e))); }
    finally { setImporting(null); }
  }

  const enriched = useMemo(() => {
    return jobs.map((j) => {
      const fraud = detectFraud(j.job_title, j.employer_name, j.employer_address);
      const empFlag = j.employer_name ? suspiciousEmployers.has(j.employer_name) : false;
      const isSuspicious = fraud.isSuspicious || empFlag;
      const score = matchScore(j, profile, resume);
      const quality = jobQuality(j, isSuspicious);
      const category = classifyJob(j.job_title);
      return { job: j, score, isSuspicious, fraudReasons: fraud.reasons, employerFlagged: empFlag, quality, category };
    });
  }, [jobs, profile, resume, suspiciousEmployers]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of enriched) counts[e.category] = (counts[e.category] ?? 0) + 1;
    return counts;
  }, [enriched]);

  const availableStates = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { job } of enriched) {
      const s = (job.worksite_state ?? "").trim().toUpperCase();
      if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [enriched]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const st = stateFilter.trim().toUpperCase();
    const w = parseFloat(minWage) || 0;
    const startCutoff = startAfter ? new Date(startAfter).getTime() : 0;
    let arr = enriched.filter(({ job: j, category }) => {
      if (hasEmailOnly && !j.recruitment_email) return false;
      if (hideApplied && appliedJobIds.has(j.id)) return false;
      if (savedOnly && !savedJobIds.has(j.id)) return false;
      if (categoryFilter !== "all" && category !== categoryFilter) return false;
      if (st && (j.worksite_state ?? "").toUpperCase() !== st) return false;
      if (w && !(j.wage_offered && j.wage_offered >= w)) return false;
      if (startCutoff && j.start_date) {
        const sd = new Date(j.start_date).getTime();
        if (!Number.isNaN(sd) && sd < startCutoff) return false;
      }
      if (s) {
        const hay = `${j.job_title ?? ""} ${j.employer_name ?? ""} ${j.worksite_city ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
    if (sortBy === "match") arr = [...arr].sort((a, b) => b.score - a.score);
    else if (sortBy === "wage") arr = [...arr].sort((a, b) => (b.job.wage_offered ?? 0) - (a.job.wage_offered ?? 0));
    else if (sortBy === "quality") arr = [...arr].sort((a, b) => b.quality.score - a.quality.score);
    else arr = [...arr].sort((a, b) => (daysAgo(a.job.posted_date) ?? 9999) - (daysAgo(b.job.posted_date) ?? 9999));
    return arr;
  }, [enriched, search, stateFilter, hasEmailOnly, hideApplied, savedOnly, savedJobIds, minWage, startAfter, sortBy, categoryFilter, appliedJobIds]);

  const filtersActive =
    search !== "" || stateFilter !== "" || minWage !== "" || startAfter !== "" ||
    hasEmailOnly || hideApplied || savedOnly || categoryFilter !== "all" || sortBy !== "quality";

  function resetFilters() {
    setSearch(""); setStateFilter(""); setMinWage(""); setStartAfter("");
    setHasEmailOnly(false); setHideApplied(false); setSavedOnly(false);
    setCategoryFilter("all"); setSortBy("quality");
  }




  function toggleSelect(id: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  async function runBulk() {
    const targets = filtered.filter(({ job: j, isSuspicious }) =>
      selected.has(j.id) && j.recruitment_email && !appliedJobIds.has(j.id) && !isSuspicious,
    ).map((x) => x.job);
    if (targets.length === 0) { toast.error("Nenhuma vaga selecionada válida (sem e-mail, suspeita ou já aplicada)."); return; }
    setBulkRunning(true);
    let success = 0, failed = 0;
    toast.info(`Gerando ${targets.length} cartas em paralelo…`);
    const results = await Promise.allSettled(targets.map((j) => genFn({ data: { jobId: j.id } })));
    for (let i = 0; i < targets.length; i++) {
      const job = targets[i]; const r = results[i];
      if (r.status !== "fulfilled") { failed++; continue; }
      try {
        await recordFn({ data: { jobId: job.id, coverLetterEn: r.value.text, contactMethod: "email",
          attachedMediaIds: r.value.attachedMediaIds, attachedVideoId: r.value.attachedVideoId } });
        const subject = encodeURIComponent(`Application for ${job.job_title ?? "H-2A position"} (Case ${job.external_case_number ?? ""})`);
        const body = encodeURIComponent(r.value.text);
        window.open(`mailto:${job.recruitment_email}?subject=${subject}&body=${body}`, "_blank");
        success++;
        await new Promise((res) => setTimeout(res, 1200));
      } catch { failed++; }
    }
    toast.success(`${success} candidaturas enviadas, ${failed} falharam.`);
    setBulkRunning(false); setSelected(new Set()); setBulkMode(false);
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Vagas H-2A</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant={bulkMode ? "default" : "outline"} size="sm"
            onClick={() => { setBulkMode((b) => !b); setSelected(new Set()); }}>
            {bulkMode ? `Cancelar (${selected.size})` : "Modo seleção"}
          </Button>
          {bulkMode && (
            <Button size="sm" onClick={runBulk} disabled={selected.size === 0 || bulkRunning}>
              {bulkRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Candidatar em massa ({selected.size})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => runImport(15, "backfill")} disabled={importing !== null}>
            {importing === "backfill" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Backfill 15d
          </Button>
          <Button size="sm" onClick={() => runImport(2, "daily")} disabled={importing !== null}>
            {importing === "daily" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            🔄 Buscar agora
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Input placeholder="Buscar título / empregador / cidade" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={stateFilter || "all"} onValueChange={(v) => setStateFilter(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os estados ({enriched.length})</SelectItem>
                {availableStates.map(([st, n]) => (
                  <SelectItem key={st} value={st}>{st} ({n})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Salário mín ($/hr)" type="number" value={minWage} onChange={(e) => setMinWage(e.target.value)} />
            <Select value={categoryFilter} onValueChange={(v: any) => setCategoryFilter(v)}>
              <SelectTrigger><SelectValue placeholder="Tipo de vaga" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos ({enriched.length})</SelectItem>
                {(Object.keys(CATEGORY_LABELS) as JobCategory[])
                  .filter((k) => (categoryCounts[k] ?? 0) > 0)
                  .sort((a, b) => (categoryCounts[b] ?? 0) - (categoryCounts[a] ?? 0))
                  .map((k) => (
                    <SelectItem key={k} value={k}>{CATEGORY_LABELS[k]} ({categoryCounts[k]})</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Começa a partir de</label>
              <Input type="date" value={startAfter} onChange={(e) => setStartAfter(e.target.value)} />
            </div>
            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="quality">⭐ Melhores ofertas</SelectItem>
                <SelectItem value="fresh">Mais novas</SelectItem>
                <SelectItem value="match">Maior match</SelectItem>
                <SelectItem value="wage">Maior salário</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2 lg:col-span-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={hasEmailOnly} onChange={(e) => setHasEmailOnly(e.target.checked)} />
                Apenas com e-mail
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={hideApplied} onChange={(e) => setHideApplied(e.target.checked)} />
                Esconder candidatadas
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={savedOnly} onChange={(e) => setSavedOnly(e.target.checked)} />
                ⭐ Só favoritas ({savedJobIds.size})
              </label>
            </div>

          </div>
          <div className="flex items-center justify-between border-t pt-2">
            <div className="text-xs text-muted-foreground">
              {filtersActive ? "Filtros ativos" : "Nenhum filtro ativo"}
            </div>
            <Button variant="ghost" size="sm" onClick={resetFilters} disabled={!filtersActive}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Resetar filtros
            </Button>
          </div>
        </CardContent>
      </Card>


      <div className="text-sm text-muted-foreground">
        {loading ? "Carregando…" : `${filtered.length} vagas · ${appliedJobIds.size} já candidatado(s)`}
      </div>

      <div className="grid gap-3">
        {filtered.map(({ job: j, score, isSuspicious, fraudReasons, employerFlagged, quality, category }) => {
          const applied = appliedJobIds.has(j.id);
          return (
            <Card key={j.id} className={`${applied ? "opacity-60" : ""} ${isSuspicious ? "border-destructive" : ""}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    {bulkMode && (
                      <Checkbox checked={selected.has(j.id)} onCheckedChange={() => toggleSelect(j.id)}
                        disabled={applied || !j.recruitment_email || isSuspicious} className="mt-1" />
                    )}
                    <div>
                      <CardTitle className="text-base">{j.job_title ?? "Sem título"}</CardTitle>
                      <div className="text-sm text-muted-foreground">{j.employer_name ?? "—"}</div>
                      <Badge variant="secondary" className="mt-1 text-xs">{CATEGORY_LABELS[category]}</Badge>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <QualityMedal q={quality} />
                    {matchBadge(score)}
                    {freshnessBadge(j.posted_date)}
                    {applied && <Badge variant="outline">✓ Candidatado</Badge>}

                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {isSuspicious && (
                  <div className="rounded bg-destructive/10 border border-destructive p-2 text-xs">
                    <div className="flex items-start gap-1"><AlertTriangle className="h-3 w-3 mt-0.5 text-destructive" />
                      <div><strong className="text-destructive">Possível fraude:</strong>{" "}
                        {employerFlagged ? "Empregador marcado como suspeito por você. " : ""}
                        {fraudReasons.length ? fraudReasons.join(", ") + "." : ""}</div></div>
                  </div>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {(j.worksite_city || j.worksite_state) && (<span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{[j.worksite_city, j.worksite_state].filter(Boolean).join(", ")}</span>)}
                  {j.start_date && (<span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{j.start_date} → {j.end_date ?? "?"}</span>)}
                  {j.wage_offered != null && (<span>💵 ${j.wage_offered}/{j.wage_unit ?? "hr"}</span>)}
                  {j.total_openings != null && <span>👥 {j.total_openings} vagas</span>}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {j.recruitment_email && (<span className="inline-flex items-center gap-1 text-primary"><Mail className="h-3.5 w-3.5" /> {j.recruitment_email}</span>)}
                  {j.recruitment_phone && (<span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {j.recruitment_phone}</span>)}
                  {j.recruitment_website && j.recruitment_website !== "N/A" && (<a className="inline-flex items-center gap-1 text-primary hover:underline" href={j.recruitment_website} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /> Site</a>)}
                </div>
                {!bulkMode && (
                  <div className="pt-1">
                    <Button size="sm" onClick={() => setActiveJob(j)} disabled={applied}>
                      <Send className="mr-2 h-3.5 w-3.5" />{applied ? "Já candidatado" : "Candidatar"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {!loading && filtered.length === 0 && (
          <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground">
            Nenhuma vaga. Clique em <strong>Backfill 15d</strong> para importar.
          </CardContent></Card>
        )}
      </div>

      <ApplyDialog job={activeJob} open={!!activeJob} onOpenChange={(o) => !o && setActiveJob(null)} onSent={load} />
    </div>
  );
}
