import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { uploadToMedia, resolveMedia } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { createNexanoPixPayment } from "@/lib/nexano.functions";
import { Megaphone, Eye, MousePointerClick, Copy } from "lucide-react";

export const Route = createFileRoute("/_app/ads")({
  component: AdsDashboard,
  head: () => ({ meta: [{ title: "Anúncios — JPvano" }] }),
});

type Advertiser = { id: string; brand_name: string; email: string; tax_id: string | null; logo_url: string | null };
type Campaign = {
  id: string; title: string; caption: string | null; media_url: string;
  cta_label: string | null; cta_url: string; budget_cents: number; amount_paid_cents: number;
  status: string; impressions: number; clicks: number; created_at: string;
};

function AdsDashboard() {
  const { user } = useAuth();
  const [advertiser, setAdvertiser] = useState<Advertiser | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    const { data: adv } = await supabase.from("advertisers" as never)
      .select("id, brand_name, email, tax_id, logo_url")
      .eq("user_id", user.id).maybeSingle();
    setAdvertiser(adv as Advertiser | null);
    if (adv) {
      const { data: cs } = await supabase.from("ad_campaigns" as never)
        .select("*").eq("advertiser_id", (adv as Advertiser).id)
        .order("created_at", { ascending: false });
      setCampaigns((cs as Campaign[]) || []);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [user?.id]);

  if (loading) return <div className="p-10 text-center text-muted-foreground">Carregando...</div>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <Megaphone className="h-7 w-7 text-[var(--brand-pink)]" /> Central de Anúncios
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Crie campanhas patrocinadas e alcance toda a comunidade JPvano.</p>
        </div>
        <Link to="/feed" className="text-sm text-muted-foreground hover:text-foreground">Ver no feed →</Link>
      </header>

      {!advertiser ? (
        <CreateAdvertiserForm onCreated={load} />
      ) : (
        <>
          <CreateCampaignForm advertiser={advertiser} onCreated={load} />
          <section>
            <h2 className="font-display text-xl font-bold mb-4">Suas campanhas</h2>
            {campaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-2xl border border-border bg-card p-6 text-center">Nenhuma campanha ainda.</p>
            ) : (
              <div className="space-y-4">
                {campaigns.map(c => <CampaignRow key={c.id} c={c} onUpdated={load} />)}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function CreateAdvertiserForm({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const [brand, setBrand] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [taxId, setTaxId] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!user) return;
    if (brand.trim().length < 2) { toast.error("Informe o nome da marca"); return; }
    setSaving(true);
    const { error } = await supabase.from("advertisers" as never).insert({
      user_id: user.id, brand_name: brand.trim(), email: email.trim(), tax_id: taxId.trim() || null,
    } as never);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Perfil de anunciante criado!");
    onCreated();
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
      <h2 className="font-display text-xl font-bold">Crie seu perfil de anunciante</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <div><label className="text-xs">Nome da marca *</label><Input value={brand} onChange={e => setBrand(e.target.value)} /></div>
        <div><label className="text-xs">E-mail de contato *</label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div className="md:col-span-2"><label className="text-xs">CPF/CNPJ (opcional, usado no Pix)</label><Input value={taxId} onChange={e => setTaxId(e.target.value)} /></div>
      </div>
      <Button disabled={saving} onClick={save} className="bg-gradient-brand text-white border-0">{saving ? "Salvando..." : "Criar perfil de anunciante"}</Button>
    </section>
  );
}

function CreateCampaignForm({ advertiser, onCreated }: { advertiser: Advertiser; onCreated: () => void }) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [ctaLabel, setCtaLabel] = useState("Saiba mais");
  const [ctaUrl, setCtaUrl] = useState("");
  const [budgetReais, setBudgetReais] = useState("50");
  const [mediaPath, setMediaPath] = useState<string | null>(null);
  const [mediaPreview, setMediaPreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const onFile = async (f: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const path = await uploadToMedia(f, user.id, "ads");
      setMediaPath(path);
      setMediaPreview(await resolveMedia(path));
    } catch (e) { toast.error((e as Error).message); }
    setUploading(false);
  };

  const save = async () => {
    if (!mediaPath) { toast.error("Faça upload da imagem do anúncio"); return; }
    if (!ctaUrl.startsWith("http")) { toast.error("URL do botão precisa começar com http(s)"); return; }
    const cents = Math.round(parseFloat(budgetReais) * 100);
    if (!cents || cents < 1000) { toast.error("Orçamento mínimo R$ 10,00"); return; }
    setSaving(true);
    const { data: pub } = await supabase.storage.from("media").createSignedUrl(mediaPath, 60 * 60 * 24 * 365);
    const finalMediaUrl = pub?.signedUrl ?? mediaPath;
    const { error } = await supabase.from("ad_campaigns" as never).insert({
      advertiser_id: advertiser.id,
      title: title.slice(0, 80),
      caption: caption.slice(0, 280) || null,
      media_url: finalMediaUrl,
      cta_label: ctaLabel.slice(0, 30),
      cta_url: ctaUrl,
      budget_cents: cents,
      status: "draft",
    } as never);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Campanha criada! Agora pague via Pix para ativar.");
    setTitle(""); setCaption(""); setCtaUrl(""); setMediaPath(null); setMediaPreview("");
    onCreated();
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
      <h2 className="font-display text-xl font-bold">Nova campanha</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-3 md:col-span-2">
          <label className="text-xs">Imagem do anúncio (1080×1080 recomendado)</label>
          <label className="cursor-pointer block rounded-xl border-2 border-dashed border-border p-6 text-center text-sm hover:bg-accent">
            {mediaPreview ? <img src={mediaPreview} alt="" className="mx-auto max-h-64 rounded-lg" /> : (uploading ? "Enviando..." : "Clique para enviar imagem")}
            <input type="file" hidden accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
          </label>
        </div>
        <div><label className="text-xs">Título *</label><Input value={title} onChange={e => setTitle(e.target.value)} maxLength={80} /></div>
        <div><label className="text-xs">URL do botão *</label><Input placeholder="https://..." value={ctaUrl} onChange={e => setCtaUrl(e.target.value)} /></div>
        <div><label className="text-xs">Texto do botão</label><Input value={ctaLabel} onChange={e => setCtaLabel(e.target.value)} maxLength={30} /></div>
        <div><label className="text-xs">Orçamento total (R$) *</label><Input type="number" min="10" step="0.01" value={budgetReais} onChange={e => setBudgetReais(e.target.value)} /></div>
        <div className="md:col-span-2"><label className="text-xs">Descrição</label><Textarea rows={3} value={caption} onChange={e => setCaption(e.target.value)} maxLength={280} /></div>
      </div>
      <Button disabled={saving || uploading} onClick={save} className="bg-gradient-brand text-white border-0">{saving ? "Criando..." : "Criar campanha"}</Button>
    </section>
  );
}

function CampaignRow({ c, onUpdated }: { c: Campaign; onUpdated: () => void }) {
  const [paying, setPaying] = useState(false);
  const [pix, setPix] = useState<{ qr: string | null; image: string | null; expires: string | null } | null>(null);
  const createPix = useServerFn(createNexanoPixPayment);

  const pay = async () => {
    setPaying(true);
    try {
      const res = await createPix({ data: { campaignId: c.id } });
      setPix({ qr: (res as { pix_qr_code: string | null }).pix_qr_code, image: (res as { pix_qr_image: string | null }).pix_qr_image, expires: (res as { expires_at: string | null }).expires_at });
      toast.success("Pix gerado! Escaneie ou copie o código.");
      onUpdated();
    } catch (e) { toast.error((e as Error).message); }
    setPaying(false);
  };

  const statusBadge = {
    draft: "bg-muted text-muted-foreground",
    pending_payment: "bg-yellow-500/20 text-yellow-600",
    active: "bg-green-500/20 text-green-600",
    paused: "bg-orange-500/20 text-orange-600",
    completed: "bg-blue-500/20 text-blue-600",
    rejected: "bg-red-500/20 text-red-600",
  }[c.status] ?? "bg-muted";
  const statusLabel = { draft: "Rascunho", pending_payment: "Aguardando Pix", active: "Ativa", paused: "Pausada", completed: "Concluída", rejected: "Rejeitada" }[c.status] ?? c.status;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex flex-col md:flex-row gap-4">
      <img src={c.media_url} alt="" className="w-full md:w-32 h-32 object-cover rounded-lg" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-display font-bold">{c.title}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge}`}>{statusLabel}</span>
        </div>
        {c.caption && <p className="text-sm text-muted-foreground line-clamp-2">{c.caption}</p>}
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {c.impressions} views</span>
          <span className="flex items-center gap-1"><MousePointerClick className="h-3 w-3" /> {c.clicks} cliques</span>
          <span>R$ {(c.budget_cents / 100).toFixed(2)}</span>
        </div>
        {c.status === "draft" && (
          <Button size="sm" onClick={pay} disabled={paying} className="bg-gradient-brand text-white border-0">
            {paying ? "Gerando Pix..." : `Pagar R$ ${(c.budget_cents / 100).toFixed(2)} via Pix`}
          </Button>
        )}
        {pix?.qr && (
          <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            {pix.image && <img src={pix.image} alt="QR Pix" className="h-44 w-44 mx-auto" />}
            <div className="flex gap-2">
              <Input value={pix.qr} readOnly className="text-xs font-mono" />
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(pix.qr!); toast.success("Copiado!"); }}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
            {pix.expires && <p className="text-xs text-muted-foreground text-center">Expira em {new Date(pix.expires).toLocaleString("pt-BR")}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
