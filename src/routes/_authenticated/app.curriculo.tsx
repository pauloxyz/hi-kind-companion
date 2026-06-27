import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Plus, Trash2, Download, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { translateToEnglish } from "@/lib/translate.functions";
import { pdf } from "@react-pdf/renderer";
import { ResumePdfDocument, type ResumePdfData } from "@/components/ResumePdfDocument";

export const Route = createFileRoute("/_authenticated/app/curriculo")({ component: Page });

type Experience = {
  id?: string;
  job_title: string;
  employer_name: string;
  location: string;
  start_date: string;
  end_date: string;
  description_pt: string;
  description_en: string;
};

function emptyExp(): Experience {
  return {
    job_title: "",
    employer_name: "",
    location: "",
    start_date: "",
    end_date: "",
    description_pt: "",
    description_en: "",
  };
}

function Page() {
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [summaryPt, setSummaryPt] = useState("");
  const [summaryEn, setSummaryEn] = useState("");
  const [availStart, setAvailStart] = useState("");
  const [availEnd, setAvailEnd] = useState("");
  const [experiences, setExperiences] = useState<Experience[]>([emptyExp()]);
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [profile, setProfile] = useState<{ full_name: string; phone: string; country: string; email: string }>({
    full_name: "",
    phone: "",
    country: "",
    email: "",
  });
  const [translating, setTranslating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const translateFn = useServerFn(translateToEnglish);

  useEffect(() => {
    void (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const email = userRes.user?.email ?? "";
      const { data: prof } = await supabase
        .from("my_profile")
        .select("full_name,phone,country")
        .maybeSingle();
      setProfile({
        full_name: prof?.full_name ?? "",
        phone: prof?.phone ?? "",
        country: prof?.country ?? "",
        email,
      });

      const { data: r } = await supabase
        .from("resumes")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (r) {
        setResumeId(r.id);
        setSummaryPt(r.summary_pt ?? "");
        setSummaryEn(r.summary_en ?? "");
        setAvailStart(r.availability_start ?? "");
        setAvailEnd(r.availability_end ?? "");

        const [{ data: exps }, { data: sks }] = await Promise.all([
          supabase
            .from("resume_experiences")
            .select("*")
            .eq("resume_id", r.id)
            .order("sort_order", { ascending: true }),
          supabase.from("resume_skills").select("*").eq("resume_id", r.id),
        ]);
        if (exps && exps.length > 0) {
          setExperiences(
            exps.map((e) => ({
              id: e.id,
              job_title: e.job_title ?? "",
              employer_name: e.employer_name ?? "",
              location: e.location ?? "",
              start_date: e.start_date ?? "",
              end_date: e.end_date ?? "",
              description_pt: e.description_pt ?? "",
              description_en: e.description_en ?? "",
            })),
          );
        }
        if (sks) setSkills(sks.map((s) => s.skill_name ?? "").filter(Boolean));
      }
    })();
  }, []);

  function updateExp(i: number, patch: Partial<Experience>) {
    setExperiences((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }

  function addExp() {
    setExperiences((prev) => [...prev, emptyExp()]);
  }

  function removeExp(i: number) {
    setExperiences((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addSkill() {
    const v = skillInput.trim();
    if (!v) return;
    setSkills((prev) => Array.from(new Set([...prev, v])));
    setSkillInput("");
  }

  async function handleTranslate() {
    setTranslating(true);
    try {
      const inputs = [summaryPt, ...experiences.map((e) => e.description_pt)];
      const filteredIdx: number[] = [];
      const filteredTexts: string[] = [];
      inputs.forEach((t, i) => {
        if (t.trim()) {
          filteredIdx.push(i);
          filteredTexts.push(t);
        }
      });
      if (filteredTexts.length === 0) {
        toast.error("Preencha pelo menos um campo em português.");
        return;
      }
      const { translations } = await translateFn({ data: { texts: filteredTexts } });
      const map = new Map<number, string>();
      filteredIdx.forEach((origIdx, k) => map.set(origIdx, translations[k] ?? ""));
      if (map.has(0)) setSummaryEn(map.get(0)!);
      setExperiences((prev) =>
        prev.map((e, i) => (map.has(i + 1) ? { ...e, description_en: map.get(i + 1)! } : e)),
      );
      toast.success("Traduzido para inglês ✓");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setTranslating(false);
    }
  }

  function calcCompletion(): number {
    let pts = 0;
    if (summaryEn.trim()) pts += 25;
    if (experiences.some((e) => e.job_title && e.description_en)) pts += 35;
    if (skills.length >= 3) pts += 20;
    if (availStart && availEnd) pts += 20;
    return pts;
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      if (!userId) throw new Error("Sem sessão");

      let id = resumeId;
      const payload = {
        owner_id: userId,
        summary_pt: summaryPt,
        summary_en: summaryEn,
        availability_start: availStart || null,
        availability_end: availEnd || null,
        template_style: "manual_labor",
        updated_at: new Date().toISOString(),
      };
      if (id) {
        const { error } = await supabase.from("resumes").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("resumes")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        id = data.id;
        setResumeId(id);
      }

      // Replace experiences and skills
      await supabase.from("resume_experiences").delete().eq("resume_id", id);
      const expRows = experiences
        .filter((e) => e.job_title.trim())
        .map((e, idx) => ({
          owner_id: userId,
          resume_id: id,
          job_title: e.job_title,
          employer_name: e.employer_name,
          location: e.location,
          start_date: e.start_date || null,
          end_date: e.end_date || null,
          description_pt: e.description_pt,
          description_en: e.description_en,
          sort_order: idx,
        }));
      if (expRows.length > 0) {
        const { error } = await supabase.from("resume_experiences").insert(expRows);
        if (error) throw error;
      }

      await supabase.from("resume_skills").delete().eq("resume_id", id);
      if (skills.length > 0) {
        const { error } = await supabase
          .from("resume_skills")
          .insert(skills.map((sk) => ({ owner_id: userId, resume_id: id, skill_name: sk })));
        if (error) throw error;
      }

      // Update profile completion
      const pct = calcCompletion();
      await supabase.from("my_profile").update({ resume_completion_pct: pct }).eq("owner_id", userId);

      toast.success("Currículo salvo ✓");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadPdf() {
    setGeneratingPdf(true);
    try {
      const data: ResumePdfData = {
        fullName: profile.full_name || "—",
        email: profile.email,
        phone: profile.phone,
        country: profile.country,
        availability: availStart && availEnd ? `${availStart} → ${availEnd}` : undefined,
        summaryEn,
        experiences: experiences
          .filter((e) => e.job_title.trim())
          .map((e) => ({
            title: e.job_title,
            employer: e.employer_name,
            location: e.location,
            startDate: e.start_date,
            endDate: e.end_date,
            descriptionEn: e.description_en,
          })),
        skills,
      };
      const blob = await pdf(<ResumePdfDocument data={data} />).toBlob();

      // Upload to storage
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      if (userId && resumeId) {
        const path = `${userId}/${resumeId}.pdf`;
        const { error: upErr } = await supabase.storage
          .from("resumes")
          .upload(path, blob, { contentType: "application/pdf", upsert: true });
        if (!upErr) {
          await supabase.from("resumes").update({ pdf_url: path }).eq("id", resumeId);
        }
      }

      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(profile.full_name || "resume").replace(/\s+/g, "_")}_H2A.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF gerado ✓");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro no PDF");
    } finally {
      setGeneratingPdf(false);
    }
  }

  const completion = calcCompletion();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Currículo (H-2A)</h1>
        <Badge variant={completion >= 80 ? "default" : "secondary"}>
          {completion}% completo
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">
        Escreva em português; a IA traduz para inglês. O PDF gerado é em inglês, estilo trabalho manual americano (ATS-friendly).
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Resumo profissional</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label>Em português</Label>
          <Textarea
            value={summaryPt}
            onChange={(e) => setSummaryPt(e.target.value)}
            placeholder="Ex: Trabalhador rural com 6 anos de experiência em colheita de café e operação de trator…"
            className="min-h-[100px]"
          />
          <Label>Em inglês (auto)</Label>
          <Textarea
            value={summaryEn}
            onChange={(e) => setSummaryEn(e.target.value)}
            placeholder="Será preenchido após clicar em 'Traduzir tudo'"
            className="min-h-[100px]"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">2. Experiências</CardTitle>
          <Button size="sm" variant="outline" onClick={addExp}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {experiences.map((e, i) => (
            <div key={i} className="space-y-2 rounded border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Experiência {i + 1}</span>
                {experiences.length > 1 && (
                  <Button size="sm" variant="ghost" onClick={() => removeExp(i)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  placeholder="Cargo (PT, ex: Trabalhador rural)"
                  value={e.job_title}
                  onChange={(ev) => updateExp(i, { job_title: ev.target.value })}
                />
                <Input
                  placeholder="Empregador (ex: Fazenda XYZ)"
                  value={e.employer_name}
                  onChange={(ev) => updateExp(i, { employer_name: ev.target.value })}
                />
                <Input
                  placeholder="Cidade/Estado"
                  value={e.location}
                  onChange={(ev) => updateExp(i, { location: ev.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="date"
                    value={e.start_date}
                    onChange={(ev) => updateExp(i, { start_date: ev.target.value })}
                  />
                  <Input
                    type="date"
                    value={e.end_date}
                    onChange={(ev) => updateExp(i, { end_date: ev.target.value })}
                  />
                </div>
              </div>
              <Textarea
                placeholder="Descrição em português (atividades, máquinas operadas, volume colhido…)"
                value={e.description_pt}
                onChange={(ev) => updateExp(i, { description_pt: ev.target.value })}
                className="min-h-[70px]"
              />
              <Textarea
                placeholder="Description in English (auto)"
                value={e.description_en}
                onChange={(ev) => updateExp(i, { description_en: ev.target.value })}
                className="min-h-[70px]"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Habilidades / Skills (em inglês)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSkill();
                }
              }}
              placeholder="ex: Tractor operation, Coffee harvest, Irrigation, Livestock handling…"
            />
            <Button onClick={addSkill} variant="outline">
              Adicionar
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {skills.map((s) => (
              <Badge key={s} variant="secondary" className="cursor-pointer" onClick={() => setSkills(skills.filter((x) => x !== s))}>
                {s} ✕
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">4. Disponibilidade</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label>De</Label>
            <Input type="date" value={availStart} onChange={(e) => setAvailStart(e.target.value)} />
          </div>
          <div>
            <Label>Até</Label>
            <Input type="date" value={availEnd} onChange={(e) => setAvailEnd(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-2 z-10 flex flex-wrap gap-2 rounded-lg border bg-background p-3 shadow">
        <Button onClick={handleTranslate} disabled={translating} variant="outline">
          {translating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Traduzir tudo para EN
        </Button>
        <Button onClick={handleSave} disabled={saving} variant="outline">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar
        </Button>
        <Button onClick={handleDownloadPdf} disabled={generatingPdf || !resumeId}>
          {generatingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Gerar PDF (EN)
        </Button>
      </div>
      {!resumeId && (
        <p className="text-xs text-muted-foreground">Salve o currículo antes de gerar o PDF.</p>
      )}
    </div>
  );
}
