import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { requireAdminAccess } from "@/lib/admin-guard.functions";
import {
  listProFeatures,
  updateProFeature,
  listProOverrides,
  upsertProOverride,
  deleteProOverride,
} from "@/lib/pro-features.functions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { toastError } from "@/lib/toast-error";
import { Trash2, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/pro-features")({
  beforeLoad: async () => {
    try {
      await requireAdminAccess({ data: { route: "admin/pro-features" } });
    } catch {
      throw redirect({ to: "/app" });
    }
  },
  component: AdminProFeaturesPage,
});

function AdminProFeaturesPage() {
  const fetchFeatures = useServerFn(listProFeatures);
  const fetchOverrides = useServerFn(listProOverrides);
  const updateFeature = useServerFn(updateProFeature);
  const upsertOverride = useServerFn(upsertProOverride);
  const removeOverride = useServerFn(deleteProOverride);
  const qc = useQueryClient();

  const featuresQ = useQuery({
    queryKey: ["admin", "pro-features"],
    queryFn: () => fetchFeatures(),
  });
  const overridesQ = useQuery({
    queryKey: ["admin", "pro-overrides"],
    queryFn: () => fetchOverrides(),
  });

  const toggleMut = useMutation({
    mutationFn: (vars: { feature_key: string; enabled_for_pro: boolean }) =>
      updateFeature({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "pro-features"] });
      toast.success("Feature atualizada.");
    },
    onError: toastError,
  });

  const overrideMut = useMutation({
    mutationFn: (vars: { user_id: string; feature_key: string; enabled: boolean; note?: string | null }) =>
      upsertOverride({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "pro-overrides"] });
      toast.success("Override aplicado.");
    },
    onError: toastError,
  });

  const removeMut = useMutation({
    mutationFn: (vars: { user_id: string; feature_key: string }) => removeOverride({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "pro-overrides"] });
      toast.success("Override removido.");
    },
    onError: toastError,
  });

  // formulário override
  const [oUser, setOUser] = useState("");
  const [oKey, setOKey] = useState("");
  const [oEnabled, setOEnabled] = useState(true);
  const [oNote, setONote] = useState("");

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Funcionalidades Pro"
        description="Liga/desliga features globalmente para assinantes Pro e gerencia overrides por usuário."
      />

      <Card>
        <CardHeader>
          <CardTitle>Catálogo global</CardTitle>
          <CardDescription>
            Quando ligada, a feature fica disponível para todos os assinantes Pro.
            Override individual sempre vence essa flag.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {featuresQ.isLoading && <Skeleton className="h-40" />}
          {featuresQ.data && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead className="hidden sm:table-cell">Chave</TableHead>
                  <TableHead className="text-right">Ligada p/ Pro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {featuresQ.data.map((f) => (
                  <TableRow key={f.feature_key}>
                    <TableCell>
                      <div className="font-semibold">{f.label}</div>
                      {f.description && (
                        <div className="text-xs text-muted-foreground">{f.description}</div>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell font-mono text-xs">
                      {f.feature_key}
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={f.enabled_for_pro}
                        onCheckedChange={(v) =>
                          toggleMut.mutate({ feature_key: f.feature_key, enabled_for_pro: v })
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Overrides por usuário</CardTitle>
          <CardDescription>
            Libera ou bloqueia uma feature para um usuário específico (beta, suporte).
            Vence a flag global.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="o-user">User ID (UUID)</Label>
              <Input
                id="o-user"
                value={oUser}
                onChange={(e) => setOUser(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-key">Feature</Label>
              <select
                id="o-key"
                value={oKey}
                onChange={(e) => setOKey(e.target.value)}
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">— escolher —</option>
                {(featuresQ.data ?? []).map((f) => (
                  <option key={f.feature_key} value={f.feature_key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Permitir?</Label>
              <div className="flex items-center gap-2 h-10">
                <Switch checked={oEnabled} onCheckedChange={setOEnabled} />
                <span className="text-sm text-muted-foreground">
                  {oEnabled ? "Liberar" : "Bloquear"}
                </span>
              </div>
            </div>
            <div className="space-y-1.5 lg:col-span-3">
              <Label htmlFor="o-note">Nota (opcional)</Label>
              <Input
                id="o-note"
                value={oNote}
                onChange={(e) => setONote(e.target.value)}
                placeholder="Beta tester, ticket #1234..."
              />
            </div>
            <Button
              className="h-10"
              disabled={!oUser || !oKey || overrideMut.isPending}
              onClick={() =>
                overrideMut.mutate(
                  { user_id: oUser, feature_key: oKey, enabled: oEnabled, note: oNote || null },
                  {
                    onSuccess: () => {
                      setOUser("");
                      setOKey("");
                      setONote("");
                      setOEnabled(true);
                    },
                  },
                )
              }
            >
              <Plus className="mr-1.5 h-4 w-4" /> Aplicar override
            </Button>
          </div>

          {overridesQ.isLoading && <Skeleton className="h-32" />}
          {overridesQ.data && overridesQ.data.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum override ativo.</p>
          )}
          {overridesQ.data && overridesQ.data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Feature</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Nota</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overridesQ.data.map((o) => (
                  <TableRow key={`${o.user_id}:${o.feature_key}`}>
                    <TableCell className="font-mono text-xs">{o.user_id.slice(0, 8)}…</TableCell>
                    <TableCell className="font-mono text-xs">{o.feature_key}</TableCell>
                    <TableCell>
                      {o.enabled ? (
                        <Badge className="bg-success/15 text-success border border-success/30">
                          Liberada
                        </Badge>
                      ) : (
                        <Badge variant="outline">Bloqueada</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                      {o.note ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          removeMut.mutate({ user_id: o.user_id, feature_key: o.feature_key })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
