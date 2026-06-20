import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { uploadVerificationDoc } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BadgeCheck, ShieldCheck, Clock, XCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type VR = { id: string; status: string; created_at: string; reviewed_at: string | null; review_notes: string | null; full_name: string; document_type: string };

export const Route = createFileRoute("/_app/verification")({
  component: Verification,
  head: () => ({ meta: [{ title: "Verificação — JPvano" }] }),
});

function Verification() {
  const { user, profile, refreshProfile } = useAuth();
  const [existing, setExisting] = useState<VR | null>(null);
  const [fullName, setFullName] = useState("");
  const [docType, setDocType] = useState("rg");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("verification_requests" as never).select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    setExisting((data as VR | null) ?? null);
  };
  useEffect(() => { load(); refreshProfile(); }, [user?.id]);

  const submit = async () => {
    if (!user || !docFile) { toast.error("Envie pelo menos um documento"); return; }
    if (fullName.trim().length < 3) { toast.error("Informe seu nome completo"); return; }
    setBusy(true);
    try {
      const docPath = await uploadVerificationDoc(docFile, user.id);
      const selfiePath = selfieFile ? await uploadVerificationDoc(selfieFile, user.id) : null;
      const { error } = await supabase.from("verification_requests" as never).insert({
        user_id: user.id, full_name: fullName.trim().slice(0, 120), document_type: docType,
        document_path: docPath, selfie_path: selfiePath, status: "pending"
      } as never);
      if (error) throw error;
      toast.success("Solicitação enviada! Aguarde a análise.");
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-8 text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-brand shadow-glow mb-4"><ShieldCheck className="h-8 w-8 text-white" /></div>
        <h1 className="font-display text-3xl font-bold">Verificação de conta</h1>
        <p className="text-muted-foreground mt-2">Obtenha o selo <BadgeCheck className="inline h-4 w-4 text-[var(--brand-pink)]" /> verificado do JPvano.</p>
      </header>

      {profile?.is_verified ? (
        <div className="rounded-2xl border border-border bg-gradient-brand-soft p-6 text-center">
          <BadgeCheck className="h-12 w-12 mx-auto text-[var(--brand-pink)]" />
          <h2 className="font-display text-xl font-bold mt-2">Você é verificado!</h2>
        </div>
      ) : existing && existing.status !== "rejected" ? (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
          <div className="flex items-center gap-2">
            {existing.status === "approved" ? <CheckCircle2 className="h-5 w-5 text-green-400" /> : <Clock className="h-5 w-5 text-yellow-400" />}
            <h2 className="font-semibold">Status: {{ pending: "Pendente", reviewing: "Em análise", approved: "Aprovado", rejected: "Rejeitado" }[existing.status]}</h2>
          </div>
          <p className="text-sm text-muted-foreground">Enviado em {new Date(existing.created_at).toLocaleString("pt-BR")}</p>
          {existing.review_notes && <p className="text-sm">Nota: {existing.review_notes}</p>}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          {existing?.status === "rejected" && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm flex gap-2">
              <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div>Solicitação anterior rejeitada. {existing.review_notes && `Nota: ${existing.review_notes}`}</div>
            </div>
          )}
          <p className="text-sm text-muted-foreground">Documentos pessoais são criptografados e acessíveis apenas pela equipe de moderação.</p>
          <div><label className="text-xs">Nome completo (como no documento)</label><Input value={fullName} onChange={e => setFullName(e.target.value)} maxLength={120} /></div>
          <div>
            <label className="text-xs">Tipo de documento</label>
            <select value={docType} onChange={e => setDocType(e.target.value)} className="w-full mt-1 rounded-md border border-input bg-input px-3 py-2 text-sm">
              <option value="rg">RG / Carteira de identidade</option>
              <option value="cnh">CNH (Carteira de Motorista)</option>
              <option value="passport">Passaporte</option>
            </select>
          </div>
          <div><label className="text-xs">Foto do documento (obrigatório)</label><Input type="file" accept="image/*,.pdf" onChange={e => setDocFile(e.target.files?.[0] || null)} /></div>
          <div><label className="text-xs">Selfie segurando o documento (opcional)</label><Input type="file" accept="image/*" onChange={e => setSelfieFile(e.target.files?.[0] || null)} /></div>
          <Button onClick={submit} disabled={busy} className="w-full bg-gradient-brand text-white border-0">{busy ? "Enviando..." : "Enviar solicitação"}</Button>
        </div>
      )}
    </div>
  );
}
