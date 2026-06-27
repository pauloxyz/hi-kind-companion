import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/perfil")({
  component: PerfilPage,
});

function PerfilPage() {
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    country: "Brazil",
    birth_date: "",
    has_prior_h2_experience: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("my_profile").select("*").maybeSingle().then(({ data }) => {
      if (data) {
        setForm({
          full_name: data.full_name ?? "",
          phone: data.phone ?? "",
          country: data.country ?? "Brazil",
          birth_date: data.birth_date ?? "",
          has_prior_h2_experience: !!data.has_prior_h2_experience,
        });
      }
      setLoading(false);
    });
  }, []);

  const save = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase
      .from("my_profile")
      .upsert(
        { owner_id: u.user.id, ...form, birth_date: form.birth_date || null, updated_at: new Date().toISOString() },
        { onConflict: "owner_id" },
      );
    if (error) toast.error(error.message);
    else toast.success("Salvo");
  };

  if (loading) return <p>Carregando...</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Meu Perfil</h1>
      <Card>
        <CardHeader><CardTitle>Dados pessoais</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1"><Label>Nome completo</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div className="space-y-1"><Label>Telefone (com DDI, ex: +55...)</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="space-y-1"><Label>País</Label>
            <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
          <div className="space-y-1"><Label>Data de nascimento</Label>
            <Input type="date" value={form.birth_date ?? ""} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label>Já participei de programa H-2 antes</Label>
            <Switch checked={form.has_prior_h2_experience}
              onCheckedChange={(v) => setForm({ ...form, has_prior_h2_experience: v })} />
          </div>
          <Button onClick={save}>Salvar</Button>
        </CardContent>
      </Card>
    </div>
  );
}
