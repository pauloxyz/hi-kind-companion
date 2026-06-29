import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, Calendar, Download, RefreshCw, Loader2, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { checkApplicationReplies } from "@/lib/applications.functions";

export const Route = createFileRoute("/_authenticated/app/candidaturas")({ component: Page });

type Row = {
  id: string;
  status: string | null;
  sent_at: string | null;
  follow_up_due_at: string | null;
  follow_up_sent_at: string | null;
  responded_at: string | null;
  cover_letter_en: string | null;
  reply_snippet: string | null;
  reply_from: string | null;
  reply_received_at: string | null;
  jobs: { job_title: string | null; employer_name: string | null; worksite_state: string | null; worksite_city: string | null; recruitment_email: string | null; external_case_number: string | null } | null;
};

function statusBadge(r: Row) {
  const s = r.status ?? "";
  if (s === "hired" || s === "offer") return <Badge className="bg-emerald-600">🎉 Oferta / Contratado</Badge>;
  if (s === "interview") return <Badge className="bg-violet-600">📅 Entrevista marcada</Badge>;
  if (s === "rejected") return <Badge variant="destructive">Rejeitada</Badge>;
  if (r.responded_at) return <Badge className="bg-green-600">Respondeu</Badge>;
  if (r.follow_up_sent_at) return <Badge className="bg-blue-600">Follow-up enviado</Badge>;
  if (r.follow_up_due_at && new Date(r.follow_up_due_at) < new Date()) return <Badge className="bg-orange-500">Follow-up devido</Badge>;
  return <Badge variant="secondary">Enviado</Badge>;
}

function escapeCsv(v: any): string {
  if (v == null) return "";
  const s = String(v).replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

function exportCsv(rows: Row[]) {
  const headers = ["Enviado em", "Status", "Vaga", "Empregador", "Cidade", "Estado", "Email", "Case", "Follow-up devido", "Follow-up enviado", "Respondido em"];
  const lines = rows.map((r) => [
    r.sent_at ?? "", r.responded_at ? "responded" : (r.follow_up_sent_at ? "followed_up" : r.status ?? ""),
    r.jobs?.job_title ?? "", r.jobs?.employer_name ?? "", r.jobs?.worksite_city ?? "", r.jobs?.worksite_state ?? "",
    r.jobs?.recruitment_email ?? "", r.jobs?.external_case_number ?? "",
    r.follow_up_due_at ?? "", r.follow_up_sent_at ?? "", r.responded_at ?? "",
  ].map(escapeCsv).join(","));
  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `candidaturas-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

function Page() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "responded" | "interview" | "offer" | "rejected">("all");
  const checkReplies = useServerFn(checkApplicationReplies);

  async function loadRows() {
    const { data, error } = await supabase
      .from("applications")
      .select("id,status,sent_at,follow_up_due_at,follow_up_sent_at,responded_at,cover_letter_en,reply_snippet,reply_from,reply_received_at,jobs(job_title,employer_name,worksite_state,worksite_city,recruitment_email,external_case_number)")
      .order("sent_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as Row[]) ?? []);
  }

  useEffect(() => {
    void (async () => {
      await loadRows();
      setLoading(false);
      // Mark replies as "seen" so the sidebar badge clears on next nav
      if (typeof window !== "undefined") {
        window.localStorage.setItem("lastSeenRespondedAt", String(Date.now()));
      }
      // Background auto-check for replies (silent). Only if it hasn't run in the last 30 min.
      const KEY = "lastReplyCheckAt";
      const last = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
      const stale = !last || Date.now() - Number(last) > 30 * 60 * 1000;
      if (!stale) return;
      try {
        const r = await checkReplies({ data: {} });
        if (typeof window !== "undefined") window.localStorage.setItem(KEY, String(Date.now()));
        if (r && r.newReplies > 0) {
          toast.success(`${r.newReplies} nova(s) resposta(s) detectada(s) no Gmail!`);
          await loadRows();
        }
      } catch { /* silent */ }
    })();
  }, []);

  async function markResponded(id: string) {
    const { error } = await supabase.from("applications").update({ responded_at: new Date().toISOString(), status: "responded" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, responded_at: new Date().toISOString(), status: "responded" } : r));
  }

  async function setStatus(id: string, status: "interview" | "offer" | "rejected") {
    const nowIso = new Date().toISOString();
    const current = rows.find((r) => r.id === id);
    const patch: { status: string; responded_at?: string } = { status };
    if (!current?.responded_at) patch.responded_at = nowIso;
    const { error } = await supabase.from("applications").update(patch as never).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, ...patch } : r));
    toast.success("Status atualizado");
  }

  async function handleCheckReplies() {
    setChecking(true);
    try {
      const r = await checkReplies({ data: {} });
      if (r.error) { toast.error(r.error); return; }
      if (r.newReplies > 0) {
        toast.success(`${r.newReplies} nova(s) resposta(s) detectada(s)!`);
        await loadRows();
      } else {
        toast.message(`Verificado ${r.checked} candidatura(s) — nenhuma resposta nova ainda.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao verificar respostas");
    } finally { setChecking(false); }
  }

  const total = rows.length;
  const pending = rows.filter((r) => !r.responded_at).length;
  const responded = rows.filter((r) => !!r.responded_at).length;
  const interview = rows.filter((r) => r.status === "interview").length;
  const offer = rows.filter((r) => r.status === "offer" || r.status === "hired").length;
  const rejected = rows.filter((r) => r.status === "rejected").length;

  const visible = rows.filter((r) => {
    if (filter === "all") return true;
    if (filter === "pending") return !r.responded_at;
    if (filter === "responded") return !!r.responded_at && !["interview", "offer", "hired", "rejected"].includes(r.status ?? "");
    if (filter === "offer") return r.status === "offer" || r.status === "hired";
    return r.status === filter;
  });

  const chip = (key: typeof filter, label: string, count: number, cls = "") => (
    <button
      onClick={() => setFilter(key)}
      className={`rounded-full border px-3 py-1 text-xs transition ${filter === key ? `bg-primary text-primary-foreground border-primary` : `hover:bg-accent ${cls}`}`}
    >
      {label} <span className="opacity-70">({count})</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Candidaturas</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleCheckReplies} disabled={checking || pending === 0}>
            {checking ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Verificar respostas no Gmail
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportCsv(rows)} disabled={!rows.length}>
            <Download className="h-4 w-4 mr-1" /> Exportar CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {chip("all", "Todas", total)}
        {chip("pending", "Aguardando", pending)}
        {chip("responded", "Responderam", responded)}
        {chip("interview", "📅 Entrevista", interview)}
        {chip("offer", "🎉 Oferta", offer)}
        {chip("rejected", "Rejeitada", rejected)}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      <div className="grid gap-2">
        {visible.map((r) => (
          <Card key={r.id}>
            <CardContent className="pt-4 space-y-1 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{r.jobs?.job_title ?? "—"}</div>
                  <div className="text-muted-foreground text-xs">{r.jobs?.employer_name} · {r.jobs?.worksite_city}, {r.jobs?.worksite_state}</div>
                </div>
                {statusBadge(r)}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />Enviado: {r.sent_at ? new Date(r.sent_at).toLocaleString("pt-BR") : "—"}</span>
                {r.follow_up_due_at && (<span>Follow-up: {new Date(r.follow_up_due_at).toLocaleDateString("pt-BR")}</span>)}
                {r.jobs?.recruitment_email && (<a href={`mailto:${r.jobs.recruitment_email}`} className="inline-flex items-center gap-1 text-primary hover:underline"><Mail className="h-3 w-3" />{r.jobs.recruitment_email}</a>)}
              </div>
              {r.reply_snippet && (
                <div className="mt-2 rounded-md border-l-4 border-green-600 bg-green-600/5 p-2 text-xs">
                  <div className="font-medium text-green-700 dark:text-green-400">
                    📩 Resposta {r.reply_from ? `de ${r.reply_from}` : ""}
                    {r.reply_received_at && <span className="ml-1 text-muted-foreground">· {new Date(r.reply_received_at).toLocaleString("pt-BR")}</span>}
                  </div>
                  <div className="mt-1 text-foreground/80 line-clamp-3">{r.reply_snippet}</div>
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                {!r.responded_at && (
                  <Button size="sm" variant="outline" onClick={() => markResponded(r.id)}>Marcar como respondido</Button>
                )}
                {r.status !== "interview" && (
                  <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "interview")}>📅 Entrevista</Button>
                )}
                {r.status !== "offer" && (
                  <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "offer")}>🎉 Oferta</Button>
                )}
                {r.status !== "rejected" && (
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setStatus(r.id, "rejected")}>Rejeitada</Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {!loading && rows.length === 0 && (
          <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground">Nenhuma candidatura ainda. Vá para <strong>Vagas</strong> e clique em "Candidatar".</CardContent></Card>
        )}
        {!loading && rows.length > 0 && visible.length === 0 && (
          <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground">Nenhuma candidatura nesse filtro.</CardContent></Card>
        )}
      </div>
    </div>
  );
}
