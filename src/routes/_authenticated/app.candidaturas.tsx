import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, Calendar, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/candidaturas")({ component: Page });

type Row = {
  id: string;
  status: string | null;
  sent_at: string | null;
  follow_up_due_at: string | null;
  follow_up_sent_at: string | null;
  responded_at: string | null;
  cover_letter_en: string | null;
  jobs: { job_title: string | null; employer_name: string | null; worksite_state: string | null; worksite_city: string | null; recruitment_email: string | null; external_case_number: string | null } | null;
};

function statusBadge(r: Row) {
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

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("id,status,sent_at,follow_up_due_at,follow_up_sent_at,responded_at,cover_letter_en,jobs(job_title,employer_name,worksite_state,worksite_city,recruitment_email,external_case_number)")
        .order("sent_at", { ascending: false });
      if (error) toast.error(error.message);
      setRows((data as Row[]) ?? []);
      setLoading(false);
    })();
  }, []);

  async function markResponded(id: string) {
    const { error } = await supabase.from("applications").update({ responded_at: new Date().toISOString(), status: "responded" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, responded_at: new Date().toISOString(), status: "responded" } : r));
  }

  const total = rows.length;
  const pending = rows.filter((r) => !r.responded_at).length;
  const responded = rows.filter((r) => !!r.responded_at).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Candidaturas</h1>
        <Button size="sm" variant="outline" onClick={() => exportCsv(rows)} disabled={!rows.length}>
          <Download className="h-4 w-4 mr-1" /> Exportar CSV
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold">{total}</div><div className="text-xs text-muted-foreground">Total</div></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold">{pending}</div><div className="text-xs text-muted-foreground">Aguardando</div></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-bold">{responded}</div><div className="text-xs text-muted-foreground">Responderam</div></CardContent></Card>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      <div className="grid gap-2">
        {rows.map((r) => (
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
              {!r.responded_at && (
                <div className="pt-1">
                  <Button size="sm" variant="outline" onClick={() => markResponded(r.id)}>Marcar como respondido</Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {!loading && rows.length === 0 && (
          <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground">Nenhuma candidatura ainda. Vá para <strong>Vagas</strong> e clique em "Candidatar".</CardContent></Card>
        )}
      </div>
    </div>
  );
}
