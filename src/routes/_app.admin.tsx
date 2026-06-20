import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Shield, Users, FileCheck, BarChart3, BadgeCheck, Ban, Eye, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { resolveMedia, getSignedUrl } from "@/lib/storage";

export const Route = createFileRoute("/_app/admin")({
  component: Admin,
  head: () => ({ meta: [{ title: "Admin — JPvano" }] }),
});

function Admin() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"stats" | "users" | "verifications">("stats");

  useEffect(() => { if (!loading && !isAdmin) navigate({ to: "/feed", replace: true }); }, [isAdmin, loading, navigate]);
  if (!isAdmin) return null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-gradient-brand flex items-center justify-center shadow-glow"><Shield className="h-6 w-6 text-white" /></div>
        <div><h1 className="font-display text-3xl font-bold">Painel Admin</h1><p className="text-sm text-muted-foreground">Gerencie a plataforma JPvano</p></div>
      </header>
      <div className="flex gap-2 mb-6 border-b border-border">
        {[
          { k: "stats", l: "Estatísticas", I: BarChart3 },
          { k: "users", l: "Usuários", I: Users },
          { k: "verifications", l: "Verificações", I: FileCheck },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as never)} className={`px-4 py-3 text-sm font-medium flex items-center gap-2 border-b-2 transition ${tab === t.k ? "border-[var(--brand-pink)] text-foreground" : "border-transparent text-muted-foreground"}`}>
            <t.I className="h-4 w-4" /> {t.l}
          </button>
        ))}
      </div>
      {tab === "stats" && <Stats />}
      {tab === "users" && <UsersTab />}
      {tab === "verifications" && <Verifications />}
    </div>
  );
}

function Stats() {
  const [s, setS] = useState({ users: 0, posts: 0, comments: 0, msgs: 0, pending: 0 });
  useEffect(() => {
    (async () => {
      const [u, p, c, m, v] = await Promise.all([
        supabase.from("profiles" as never).select("*", { count: "exact", head: true }),
        supabase.from("posts" as never).select("*", { count: "exact", head: true }),
        supabase.from("comments" as never).select("*", { count: "exact", head: true }),
        supabase.from("messages" as never).select("*", { count: "exact", head: true }),
        supabase.from("verification_requests" as never).select("*", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      setS({ users: u.count || 0, posts: p.count || 0, comments: c.count || 0, msgs: m.count || 0, pending: v.count || 0 });
    })();
  }, []);
  const cards = [
    { l: "Usuários", v: s.users, c: "from-pink-500 to-purple-500" },
    { l: "Posts", v: s.posts, c: "from-orange-500 to-pink-500" },
    { l: "Comentários", v: s.comments, c: "from-purple-500 to-pink-500" },
    { l: "Mensagens", v: s.msgs, c: "from-pink-500 to-orange-500" },
    { l: "Verificações pendentes", v: s.pending, c: "from-purple-500 to-orange-500" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {cards.map(c => (
        <div key={c.l} className="rounded-2xl border border-border bg-card p-5">
          <div className={`h-1 w-10 rounded-full bg-gradient-to-r ${c.c} mb-3`} />
          <div className="text-3xl font-display font-bold">{c.v.toLocaleString("pt-BR")}</div>
          <div className="text-xs text-muted-foreground mt-1">{c.l}</div>
        </div>
      ))}
      <div className="col-span-full rounded-2xl border border-border bg-gradient-brand-soft p-6">
        <h3 className="font-display font-bold mb-2">Receita da plataforma</h3>
        <div className="text-3xl font-display font-bold text-gradient-brand">R$ 0,00</div>
        <p className="text-xs text-muted-foreground mt-2">O sistema de monetização (anúncios pagos, assinaturas premium, vendas) será habilitado em uma próxima fase. Receita atual: zero (dados reais — sem informações fictícias).</p>
      </div>
    </div>
  );
}

function UsersTab() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<{ id: string; username: string; display_name: string | null; is_verified: boolean; followers_count: number; banned?: boolean }[]>([]);
  const [q, setQ] = useState("");

  const load = async () => {
    const query = supabase.from("profiles" as never).select("id,username,display_name,is_verified,followers_count").order("followers_count", { ascending: false }).limit(100);
    const { data } = q ? await query.ilike("username", `%${q}%`) : await query;
    const list = (data as never[]) || [];
    const { data: bans } = await supabase.from("user_bans" as never).select("user_id");
    const banSet = new Set(((bans as { user_id: string }[]) || []).map(b => b.user_id));
    setUsers((list as { id: string }[]).map(u => ({ ...(u as never), banned: banSet.has(u.id) })));
  };
  useEffect(() => { load(); }, [q]);

  const toggleVerify = async (id: string, v: boolean) => {
    const { error } = await supabase.from("profiles" as never).update({ is_verified: !v } as never).eq("id", id);
    if (error) toast.error(error.message); else { toast.success(!v ? "Verificado" : "Selo removido"); load(); }
  };
  const toggleBan = async (id: string, banned: boolean) => {
    if (banned) { await supabase.from("user_bans" as never).delete().eq("user_id", id); toast.success("Reativado"); }
    else { await supabase.from("user_bans" as never).insert({ user_id: id, banned_by: me?.id } as never); toast.success("Banido"); }
    load();
  };

  return (
    <div className="space-y-3">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por username..." className="w-full rounded-lg border border-input bg-input px-4 py-2 text-sm" />
      <div className="rounded-2xl border border-border bg-card divide-y divide-border">
        {users.map(u => (
          <div key={u.id} className="flex items-center gap-3 p-4">
            <div className="flex-1 min-w-0">
              <Link to="/profile/$username" params={{ username: u.username }} className="font-semibold flex items-center gap-1">@{u.username}{u.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-[var(--brand-pink)]" />}{u.banned && <span className="text-xs text-destructive ml-2">BANIDO</span>}</Link>
              <div className="text-xs text-muted-foreground">{u.display_name} • {u.followers_count} seguidores</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => toggleVerify(u.id, u.is_verified)}><BadgeCheck className="h-3 w-3 mr-1" />{u.is_verified ? "Remover" : "Verificar"}</Button>
            <Button size="sm" variant={u.banned ? "outline" : "destructive"} onClick={() => toggleBan(u.id, !!u.banned)}><Ban className="h-3 w-3 mr-1" />{u.banned ? "Reativar" : "Banir"}</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Verifications() {
  const { user: me } = useAuth();
  const [reqs, setReqs] = useState<{ id: string; user_id: string; full_name: string; document_type: string; document_path: string; selfie_path: string | null; status: string; review_notes: string | null; created_at: string; profile?: { username: string; avatar_url: string | null } }[]>([]);
  const [viewing, setViewing] = useState<{ docUrl: string; selfieUrl?: string } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = async () => {
    const { data } = await supabase.from("verification_requests" as never).select("*, profile:profiles!verification_requests_user_id_fkey(username,avatar_url)").order("created_at", { ascending: false });
    setReqs(((data as never[]) || []) as never);
  };
  useEffect(() => { load(); }, []);

  const view = async (docPath: string, selfiePath: string | null) => {
    const docUrl = await getSignedUrl("verification-docs", docPath, 600);
    const selfieUrl = selfiePath ? await getSignedUrl("verification-docs", selfiePath, 600) : undefined;
    setViewing({ docUrl, selfieUrl });
  };

  const decide = async (r: typeof reqs[number], status: "approved" | "rejected") => {
    const { error } = await supabase.from("verification_requests" as never).update({
      status, reviewed_by: me?.id, reviewed_at: new Date().toISOString(), review_notes: notes[r.id] || null
    } as never).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    if (status === "approved") {
      await supabase.from("profiles" as never).update({ is_verified: true } as never).eq("id", r.user_id);
    }
    await supabase.from("notifications" as never).insert({ user_id: r.user_id, actor_id: me?.id, kind: "verification", content: status === "approved" ? "Sua conta foi verificada!" : "Sua solicitação foi rejeitada" } as never);
    toast.success(status === "approved" ? "Aprovado" : "Rejeitado");
    load();
  };

  return (
    <div className="space-y-3">
      {reqs.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhuma solicitação</p>}
      {reqs.map(r => (
        <div key={r.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Link to="/profile/$username" params={{ username: r.profile?.username || "" }} className="font-semibold">@{r.profile?.username}</Link>
              <div className="text-xs text-muted-foreground">{r.full_name} • {r.document_type.toUpperCase()} • {new Date(r.created_at).toLocaleString("pt-BR")}</div>
            </div>
            <span className={`text-xs rounded-full px-2 py-1 ${r.status === "pending" ? "bg-yellow-500/20 text-yellow-300" : r.status === "approved" ? "bg-green-500/20 text-green-300" : "bg-destructive/20 text-destructive"}`}>{r.status}</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => view(r.document_path, r.selfie_path)}><Eye className="h-3 w-3 mr-1" /> Ver documentos</Button>
          {r.status === "pending" && (
            <>
              <Textarea placeholder="Notas (opcional)" value={notes[r.id] || ""} onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value }))} rows={2} />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => decide(r, "approved")} className="bg-gradient-brand text-white border-0"><CheckCircle2 className="h-3 w-3 mr-1" /> Aprovar</Button>
                <Button size="sm" variant="destructive" onClick={() => decide(r, "rejected")}><XCircle className="h-3 w-3 mr-1" /> Rejeitar</Button>
              </div>
            </>
          )}
          {r.review_notes && <p className="text-xs text-muted-foreground">Nota: {r.review_notes}</p>}
        </div>
      ))}

      {viewing && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setViewing(null)}>
          <div className="max-w-3xl space-y-3" onClick={e => e.stopPropagation()}>
            <img src={viewing.docUrl} alt="Documento" className="max-h-[70vh] rounded-xl" />
            {viewing.selfieUrl && <img src={viewing.selfieUrl} alt="Selfie" className="max-h-[40vh] rounded-xl" />}
          </div>
        </div>
      )}
    </div>
  );
}
