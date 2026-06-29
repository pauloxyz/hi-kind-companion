import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, RefreshCw, MapPin, Calendar, Mail, Phone, ExternalLink, Send, Sparkles, AlertTriangle, Star, Inbox, GitCompare, X, Bell, Plus, Trash2, Eye } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";

import { supabase } from "@/integrations/supabase/client";
import { triggerDolImport } from "@/lib/jobs.functions";
import { generateCoverLetter, recordApplication } from "@/lib/applications.functions";
import { sendApplicationEmail } from "@/lib/gmail.functions";
import { ApplyDialog } from "@/components/ApplyDialog";
import { useActionFeedback } from "@/components/ActionFeedback";
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
  if (d <= 3) return <Badge className="bg-success hover:bg-success">Nova ({d}d)</Badge>;
  if (d <= 10) return <Badge className="bg-warning hover:bg-warning text-black">Recente ({d}d)</Badge>;
  return <Badge variant="secondary">{d}d atrás</Badge>;
}

function matchBadge(score: number) {
  if (score >= 80) return <Badge className="bg-success">Match {score}%</Badge>;
  if (score >= 60) return <Badge className="bg-info">Match {score}%</Badge>;
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
    gold: { emoji: "🥇", label: "Top Pick", cls: "bg-warning hover:bg-warning text-black border-warning/40" },
    silver: { emoji: "🥈", label: "Recomendada", cls: "bg-slate-300 hover:bg-slate-300 text-black border-slate-400" },
    bronze: { emoji: "🥉", label: "Boa opção", cls: "bg-warning hover:bg-warning text-warning-foreground border-warning/40" },
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
  const { confirm } = useActionFeedback();
  const [jobs, setJobs] = useState<Job[]>([]);
  type ProfileRow = Database["public"]["Tables"]["my_profile"]["Row"];
  type ResumeRow = Database["public"]["Tables"]["resumes"]["Row"];
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [resume, setResume] = useState<ResumeRow | null>(null);
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
  const bulkAbortRef = useRef(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);
  const MAX_COMPARE = 3;

  type JobAlert = {
    id: string; name: string; state: string | null; category: string | null;
    min_wage: number | null; min_match: number | null; last_seen_at: string;
  };
  const [alerts, setAlerts] = useState<JobAlert[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [newAlert, setNewAlert] = useState<{ name: string; state: string; category: string; min_wage: string; min_match: string }>(
    { name: "", state: "", category: "all", min_wage: "", min_match: "" },
  );

  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const importFn = useServerFn(triggerDolImport);
  const genFn = useServerFn(generateCoverLetter);
  const recordFn = useServerFn(recordApplication);
  const sendFn = useServerFn(sendApplicationEmail);

  async function load() {
    setLoading(true);
    const [jobsRes, appsRes, profRes, resRes, empRes, savedRes, alertsRes] = await Promise.all([
      supabase.from("jobs").select("*").order("posted_date", { ascending: false, nullsFirst: false }).limit(500),
      supabase.from("applications").select("job_id"),
      supabase.from("my_profile").select("*").maybeSingle(),
      supabase.from("resumes").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("employers").select("employer_name").eq("is_flagged_suspicious", true),
      supabase.from("saved_jobs").select("job_id"),
      supabase.from("job_alerts").select("*").order("created_at", { ascending: false }),
    ]);
    if (jobsRes.error) toast.error("Erro ao carregar vagas: " + jobsRes.error.message);
    setJobs(jobsRes.data ?? []);
    setAppliedJobIds(new Set((appsRes.data ?? []).map((a) => a.job_id).filter(Boolean) as string[]));
    setProfile(profRes.data);
    setResume(resRes.data);
    setSuspiciousEmployers(new Set((empRes.data ?? []).map((e) => e.employer_name)));
    setSavedJobIds(new Set((savedRes.data ?? []).map((s) => s.job_id).filter(Boolean) as string[]));
    setAlerts((alertsRes.data ?? []) as JobAlert[]);
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
        // Verbose, descriptive confirmation: includes job title + state so
        // screen-reader users hear *which* job was saved, not just "salvo".
        const job = jobs.find((j) => j.id === jobId);
        const title = job?.job_title?.trim() || "vaga";
        const state = job?.worksite_state ? `, ${job.worksite_state}` : "";
        confirm({
          title: "Vaga salva",
          detail: `${title}${state} — disponível em Favoritos no menu Vagas.`,
        });
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

  function toggleCompare(id: string) {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (next.size >= MAX_COMPARE) { toast.error(`Máx. ${MAX_COMPARE} vagas para comparar`); return prev; }
        next.add(id);
      }
      return next;
    });
  }

  const compareJobs = useMemo(
    () => enriched.filter((e) => compareIds.has(e.job.id)),
    [enriched, compareIds],
  );

  function alertMatchesJob(a: JobAlert, e: typeof enriched[number]) {
    const j = e.job;
    if (a.state && (j.worksite_state ?? "").toUpperCase() !== a.state.toUpperCase()) return false;
    if (a.category && a.category !== "all" && e.category !== a.category) return false;
    if (a.min_wage != null && !(j.wage_offered && j.wage_offered >= a.min_wage)) return false;
    if (a.min_match != null && e.score < a.min_match) return false;
    return true;
  }

  const alertMatches = useMemo(() => {
    const map = new Map<string, { total: number; fresh: number }>();
    for (const a of alerts) {
      const seen = new Date(a.last_seen_at).getTime();
      let total = 0, fresh = 0;
      for (const e of enriched) {
        if (!alertMatchesJob(a, e)) continue;
        total++;
        const pd = e.job.posted_date ? new Date(e.job.posted_date).getTime() : 0;
        if (pd > seen) fresh++;
      }
      map.set(a.id, { total, fresh });
    }
    return map;
  }, [alerts, enriched]);

  const totalFreshAlerts = useMemo(
    () => Array.from(alertMatches.values()).reduce((s, x) => s + x.fresh, 0),
    [alertMatches],
  );

  async function createAlert() {
    if (!newAlert.name.trim()) { toast.error("Dê um nome ao alerta"); return; }
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const payload = {
      owner_id: u.user.id,
      name: newAlert.name.trim(),
      state: newAlert.state || null,
      category: newAlert.category && newAlert.category !== "all" ? newAlert.category : null,
      min_wage: newAlert.min_wage ? parseFloat(newAlert.min_wage) : null,
      min_match: newAlert.min_match ? parseInt(newAlert.min_match) : null,
    };
    const { error } = await supabase.from("job_alerts").insert(payload);
    if (error) { toast.error("Falha ao criar alerta: " + error.message); return; }
    toast.success("Alerta criado");
    setNewAlert({ name: "", state: "", category: "all", min_wage: "", min_match: "" });
    await load();
  }

  async function deleteAlert(id: string) {
    const { error } = await supabase.from("job_alerts").delete().eq("id", id);
    if (error) { toast.error("Falha ao remover"); return; }
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  async function markAlertSeen(id: string) {
    const now = new Date().toISOString();
    const { error } = await supabase.from("job_alerts").update({ last_seen_at: now }).eq("id", id);
    if (error) { toast.error("Falha ao marcar como visto"); return; }
    setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, last_seen_at: now } : a));
  }

  function applyAlertAsFilter(a: JobAlert) {
    setStateFilter(a.state ?? "");
    setCategoryFilter(((a.category as JobCategory | null) ?? "all"));
    setMinWage(a.min_wage != null ? String(a.min_wage) : "");
    setStartAfter("");
    setSearch("");
    setHasEmailOnly(false); setHideApplied(false); setSavedOnly(false);
    setSortBy("fresh");
    setAlertsOpen(false);
    toast.success(`Filtros do alerta "${a.name}" aplicados`);
  }


  async function runBulk() {
    const targets = filtered.filter(({ job: j, isSuspicious }) =>
      selected.has(j.id) && j.recruitment_email && !appliedJobIds.has(j.id) && !isSuspicious,
    ).map((x) => x.job);
    if (targets.length === 0) { toast.error("Nenhuma vaga selecionada válida (sem e-mail, suspeita ou já aplicada)."); return; }
    setBulkRunning(true);
    let success = 0, failed = 0;
    const progressToast = toast.loading(`Gerando ${targets.length} cartas em paralelo…`);
    const results = await Promise.allSettled(targets.map((j) => genFn({ data: { jobId: j.id } })));
    toast.loading(`Enviando 0/${targets.length} pelo seu Gmail…`, { id: progressToast });
    for (let i = 0; i < targets.length; i++) {
      const job = targets[i]; const r = results[i];
      if (r.status !== "fulfilled") { failed++; continue; }
      try {
        const subject = `H-2A Application — ${job.job_title ?? "H-2A position"}`;
        const sent = await sendFn({ data: { jobId: job.id, to: job.recruitment_email!, subject, body: r.value.text } });
        await recordFn({ data: {
          jobId: job.id, coverLetterEn: r.value.text, contactMethod: "email",
          attachedMediaIds: r.value.attachedMediaIds, attachedVideoId: r.value.attachedVideoId,
          gmailThreadId: sent.threadId ?? null, gmailMessageId: sent.gmailMessageId ?? null,
        } });
        success++;
        // Reflect in UI immediately so the user sees progress
        setAppliedJobIds((prev) => new Set(prev).add(job.id));
        toast.loading(`Enviando ${success + failed}/${targets.length} pelo seu Gmail…`, { id: progressToast });
        // Small delay to avoid Gmail per-user rate limit (250 quota units/sec)
        await new Promise((res) => setTimeout(res, 400));
      } catch (e) {
        failed++;
        console.error("Bulk send failed for", job.id, e);
      }
    }
    toast.dismiss(progressToast);
    if (failed === 0) {
      toast.success(`${success} candidaturas enviadas pelo Gmail.`);
      confirm({
        title: success === 1 ? "Candidatura enviada" : `${success} candidaturas enviadas`,
        detail:
          success === 1
            ? "A vaga foi marcada como ‘Candidatado’. Acompanhe respostas em Candidaturas."
            : `${success} vagas marcadas como ‘Candidatado’. Acompanhe respostas em Candidaturas.`,
      });
    } else toast.warning(`${success} enviadas, ${failed} falharam. Veja o console para detalhes.`);
    setBulkRunning(false); setSelected(new Set()); setBulkMode(false);
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Vagas H-2A</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setAlertsOpen(true)} className="relative">
            <Bell className="mr-2 h-4 w-4" />
            Alertas
            {totalFreshAlerts > 0 && (
              <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                {totalFreshAlerts}
              </span>
            )}
          </Button>
          <Button variant={bulkMode ? "default" : "outline"} size="sm"
            onClick={() => { setBulkMode((b) => !b); setSelected(new Set()); if (!bulkMode) { setCompareMode(false); setCompareIds(new Set()); } }}>
            {bulkMode ? `Cancelar (${selected.size})` : "Modo seleção"}
          </Button>
          {bulkMode && (
            <Button size="sm" onClick={runBulk} disabled={selected.size === 0 || bulkRunning}>
              {bulkRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Candidatar em massa ({selected.size})
            </Button>
          )}
          <Button variant={compareMode ? "default" : "outline"} size="sm"
            onClick={() => { setCompareMode((c) => !c); setCompareIds(new Set()); if (!compareMode) { setBulkMode(false); setSelected(new Set()); } }}>
            <GitCompare className="mr-2 h-4 w-4" />
            {compareMode ? `Cancelar (${compareIds.size}/${MAX_COMPARE})` : "Comparar"}
          </Button>
          {compareMode && compareIds.size >= 2 && (
            <Button size="sm" onClick={() => setCompareOpen(true)}>
              Ver comparação ({compareIds.size})
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
            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as "all" | JobCategory)}>
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
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
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
        {loading ? "Carregando…" : `${filtered.length} vagas · ${appliedJobIds.size} candidatada(s) · ${savedJobIds.size} favorita(s)`}
      </div>

      <div className="grid gap-3">
        {loading && (
          <>
            {[0, 1, 2].map((i) => (
              <Card key={i}><CardContent className="pt-4 space-y-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-8 w-32" />
              </CardContent></Card>
            ))}
          </>
        )}
        {!loading && filtered.map(({ job: j, score, isSuspicious, fraudReasons, employerFlagged, quality, category }) => {
          const applied = appliedJobIds.has(j.id);
          const isSaved = savedJobIds.has(j.id);
          return (
            <Card key={j.id} className={`${applied ? "opacity-60" : ""} ${isSuspicious ? "border-destructive" : ""} ${isSaved ? "ring-1 ring-yellow-500/40" : ""} ${compareIds.has(j.id) ? "ring-2 ring-primary" : ""}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    {bulkMode && (
                      <Checkbox checked={selected.has(j.id)} onCheckedChange={() => toggleSelect(j.id)}
                        disabled={applied || !j.recruitment_email || isSuspicious} className="mt-1" />
                    )}
                    {compareMode && (
                      <Checkbox checked={compareIds.has(j.id)} onCheckedChange={() => toggleCompare(j.id)} className="mt-1" />
                    )}
                    <div>
                      <CardTitle className="text-base">{j.job_title ?? "Sem título"}</CardTitle>
                      <div className="text-sm text-muted-foreground">{j.employer_name ?? "—"}</div>
                      <Badge variant="secondary" className="mt-1 text-xs">{CATEGORY_LABELS[category]}</Badge>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleSaved(j.id)}
                      aria-label={isSaved ? "Remover dos favoritos" : "Salvar nos favoritos"}>
                      <Star className={`h-4 w-4 ${isSaved ? "fill-warning text-warning" : "text-muted-foreground"}`} />
                    </Button>
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
                  <div className="pt-1 flex gap-2">
                    <Button size="sm" onClick={() => setActiveJob(j)} disabled={applied}>
                      <Send className="mr-2 h-3.5 w-3.5" />{applied ? "Já candidatado" : "Candidatar"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => toggleSaved(j.id)}>
                      <Star className={`mr-2 h-3.5 w-3.5 ${isSaved ? "fill-warning text-warning" : ""}`} />
                      {isSaved ? "Salvo" : "Salvar"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {!loading && filtered.length === 0 && (
          <Card><CardContent className="pt-10 pb-10 text-center space-y-3">
            <Inbox className="h-10 w-10 mx-auto text-muted-foreground" />
            <div className="text-sm font-medium">Nenhuma vaga encontrada</div>
            <div className="text-xs text-muted-foreground max-w-sm mx-auto">
              {filtersActive
                ? "Tente ajustar os filtros ou clique em Resetar filtros."
                : "Importe as vagas mais recentes para começar."}
            </div>
            <div className="flex gap-2 justify-center">
              {filtersActive && (
                <Button size="sm" variant="outline" onClick={resetFilters}>
                  <RefreshCw className="mr-2 h-3.5 w-3.5" /> Resetar filtros
                </Button>
              )}
              {!filtersActive && (
                <Button size="sm" onClick={() => runImport(2, "daily")} disabled={importing !== null}>
                  <RefreshCw className="mr-2 h-3.5 w-3.5" /> Buscar agora
                </Button>
              )}
            </div>
          </CardContent></Card>
        )}
      </div>


      <ApplyDialog job={activeJob} open={!!activeJob} onOpenChange={(o) => !o && setActiveJob(null)} onSent={load} />

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Comparar vagas ({compareJobs.length})</DialogTitle>
            <DialogDescription>Lado-a-lado para você decidir qual aplicar primeiro.</DialogDescription>
          </DialogHeader>
          {compareJobs.length === 0 ? (
            <div className="text-sm text-muted-foreground">Selecione vagas para comparar.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Critério</TableHead>
                  {compareJobs.map(({ job }) => (
                    <TableHead key={job.id} className="align-top">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-foreground">{job.job_title ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{job.employer_name ?? "—"}</div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleCompare(job.id)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Qualidade</TableCell>
                  {compareJobs.map(({ job, quality }) => (
                    <TableCell key={job.id}>{quality.level ? `${quality.level === "gold" ? "🥇" : quality.level === "silver" ? "🥈" : "🥉"} ${quality.score}/100` : `${quality.score}/100`}</TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Match c/ perfil</TableCell>
                  {compareJobs.map(({ job, score }) => (<TableCell key={job.id}>{score}%</TableCell>))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Salário</TableCell>
                  {compareJobs.map(({ job }) => (
                    <TableCell key={job.id}>{job.wage_offered != null ? `$${job.wage_offered}/${job.wage_unit ?? "hr"}` : "—"}</TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Estado / Cidade</TableCell>
                  {compareJobs.map(({ job }) => (
                    <TableCell key={job.id}>{[job.worksite_city, job.worksite_state].filter(Boolean).join(", ") || "—"}</TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Período</TableCell>
                  {compareJobs.map(({ job }) => (
                    <TableCell key={job.id}>{job.start_date ? `${job.start_date} → ${job.end_date ?? "?"}` : "—"}</TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Vagas abertas</TableCell>
                  {compareJobs.map(({ job }) => (<TableCell key={job.id}>{job.total_openings ?? "—"}</TableCell>))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Postada há</TableCell>
                  {compareJobs.map(({ job }) => {
                    const d = daysAgo(job.posted_date);
                    return (<TableCell key={job.id}>{d == null ? "—" : `${d}d`}</TableCell>);
                  })}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Categoria</TableCell>
                  {compareJobs.map(({ job, category }) => (
                    <TableCell key={job.id} className="text-xs">{CATEGORY_LABELS[category]}</TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Contato</TableCell>
                  {compareJobs.map(({ job }) => (
                    <TableCell key={job.id} className="text-xs">
                      {job.recruitment_email && <div>✉️ {job.recruitment_email}</div>}
                      {job.recruitment_phone && <div>📞 {job.recruitment_phone}</div>}
                      {!job.recruitment_email && !job.recruitment_phone && "—"}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Sinal de fraude</TableCell>
                  {compareJobs.map(({ job, isSuspicious }) => (
                    <TableCell key={job.id}>{isSuspicious ? <span className="text-destructive">⚠️ Suspeita</span> : "✓ Ok"}</TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Status</TableCell>
                  {compareJobs.map(({ job }) => (
                    <TableCell key={job.id}>
                      {appliedJobIds.has(job.id) ? <Badge variant="outline">✓ Candidatado</Badge> : <Badge variant="secondary">Não aplicada</Badge>}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell />
                  {compareJobs.map(({ job }) => (
                    <TableCell key={job.id}>
                      <Button size="sm" disabled={appliedJobIds.has(job.id)}
                        onClick={() => { setActiveJob(job); setCompareOpen(false); }}>
                        <Send className="mr-2 h-3.5 w-3.5" /> Candidatar
                      </Button>
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={alertsOpen} onOpenChange={setAlertsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Meus alertas de vagas</DialogTitle>
            <DialogDescription>
              Configure critérios e veja, ao abrir o app, quantas vagas novas combinam com você.
              Por enquanto os avisos aparecem aqui dentro (em breve por e-mail).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              {alerts.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-4">
                  Nenhum alerta criado. Crie um abaixo.
                </div>
              )}
              {alerts.map((a) => {
                const m = alertMatches.get(a.id) ?? { total: 0, fresh: 0 };
                return (
                  <Card key={a.id}>
                    <CardContent className="pt-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold">{a.name}</div>
                          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                            {a.state && <span>📍 {a.state}</span>}
                            {a.category && <span>{CATEGORY_LABELS[a.category as JobCategory] ?? a.category}</span>}
                            {a.min_wage != null && <span>💵 ≥ ${a.min_wage}/hr</span>}
                            {a.min_match != null && <span>🎯 match ≥ {a.min_match}%</span>}
                            {!a.state && !a.category && a.min_wage == null && a.min_match == null && <span>Sem filtros</span>}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {m.fresh > 0 ? (
                            <Badge className="bg-destructive hover:bg-destructive">{m.fresh} nova(s)</Badge>
                          ) : (
                            <Badge variant="outline">sem novidades</Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground">{m.total} no total</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button size="sm" variant="default" onClick={() => applyAlertAsFilter(a)}>
                          <Eye className="mr-2 h-3.5 w-3.5" /> Ver vagas
                        </Button>
                        {m.fresh > 0 && (
                          <Button size="sm" variant="outline" onClick={() => markAlertSeen(a.id)}>
                            Marcar como visto
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteAlert(a.id)}>
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Remover
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><Plus className="h-4 w-4" /> Novo alerta</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">Nome</Label>
                    <Input placeholder="ex.: Colheita na Califórnia" value={newAlert.name}
                      onChange={(e) => setNewAlert((p) => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Estado</Label>
                    <Select value={newAlert.state || "any"} onValueChange={(v) => setNewAlert((p) => ({ ...p, state: v === "any" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="Qualquer" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Qualquer estado</SelectItem>
                        {availableStates.map(([st]) => (<SelectItem key={st} value={st}>{st}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Categoria</Label>
                    <Select value={newAlert.category} onValueChange={(v) => setNewAlert((p) => ({ ...p, category: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Qualquer tipo</SelectItem>
                        {(Object.keys(CATEGORY_LABELS) as JobCategory[]).map((k) => (
                          <SelectItem key={k} value={k}>{CATEGORY_LABELS[k]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Salário mín ($/hr)</Label>
                    <Input type="number" placeholder="ex.: 16" value={newAlert.min_wage}
                      onChange={(e) => setNewAlert((p) => ({ ...p, min_wage: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Match mínimo (%)</Label>
                    <Input type="number" placeholder="ex.: 60" value={newAlert.min_match}
                      onChange={(e) => setNewAlert((p) => ({ ...p, min_match: e.target.value }))} />
                  </div>
                </div>
                <Button onClick={createAlert} className="w-full">
                  <Plus className="mr-2 h-4 w-4" /> Criar alerta
                </Button>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
