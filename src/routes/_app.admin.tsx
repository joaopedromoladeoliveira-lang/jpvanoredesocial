import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { 
  Users, 
  Image as ImageIcon, 
  MessageSquare, 
  Shield, 
  TrendingUp, 
  Ban, 
  BadgeCheck, 
  Eye, 
  CheckCircle2, 
  XCircle,
  BarChart3,
  Activity,
  Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/admin")({
  component: AdminPanel,
  head: () => ({ meta: [{ title: "Painel Admin — JPvano" }] }),
});

function AdminPanel() {
  const { user: me, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"stats" | "users" | "verifications">("stats");

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate({ to: "/feed", replace: true });
    }
  }, [isAdmin, authLoading, navigate]);

  if (authLoading || !isAdmin) return null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-brand flex items-center justify-center shadow-glow">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold">Painel Administrativo</h1>
            <p className="text-sm text-muted-foreground">Gerenciamento em tempo real do JPVANO.</p>
          </div>
        </div>
        <div className="flex bg-muted p-1 rounded-xl">
          <button onClick={() => setTab("stats")} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === "stats" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>Estatísticas</button>
          <button onClick={() => setTab("users")} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === "users" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>Usuários</button>
          <button onClick={() => setTab("verifications")} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === "verifications" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>Verificações</button>
        </div>
      </header>

      {tab === "stats" && <StatsTab />}
      {tab === "users" && <UsersTab />}
      {tab === "verifications" && <VerificationsTab />}
    </div>
  );
}

function StatsTab() {
  const [stats, setStats] = useState({ users: 0, posts: 0, comments: 0, msgs: 0, likes: 0 });
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    const [u, p, c, m, l] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase.from("posts").select("*", { count: "exact", head: true }),
      supabase.from("comments").select("*", { count: "exact", head: true }),
      supabase.from("messages").select("*", { count: "exact", head: true }),
      supabase.from("post_likes").select("*", { count: "exact", head: true }),
    ]);

    setStats({
      users: u.count || 0,
      posts: p.count || 0,
      comments: c.count || 0,
      msgs: m.count || 0,
      likes: l.count || 0
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStats();
    const ch = supabase.channel("admin-stats").on("postgres_changes", { event: "*", schema: "public" }, () => loadStats()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadStats]);

  const cards = [
    { label: "Usuários", value: stats.users, icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Publicações", value: stats.posts, icon: ImageIcon, color: "text-pink-500", bg: "bg-pink-500/10" },
    { label: "Comentários", value: stats.comments, icon: MessageSquare, color: "text-purple-500", bg: "bg-purple-500/10" },
    { label: "Mensagens", value: stats.msgs, icon: Activity, color: "text-orange-500", bg: "bg-orange-500/10" },
    { label: "Curtidas", value: stats.likes, icon: TrendingUp, color: "text-green-500", bg: "bg-green-500/10" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map(c => (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className={`h-10 w-10 rounded-xl ${c.bg} flex items-center justify-center mb-4`}>
              <c.icon className={`h-5 w-5 ${c.color}`} />
            </div>
            <div className="text-3xl font-display font-bold">{loading ? "..." : c.value.toLocaleString("pt-BR")}</div>
            <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wider font-semibold">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-gradient-brand-soft p-8">
        <div className="flex items-center gap-3 mb-4">
          <BarChart3 className="h-6 w-6 text-[var(--brand-pink)]" />
          <h3 className="font-display text-xl font-bold">Saúde da Plataforma</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-6">Dados reais baseados na atividade atual dos usuários. O crescimento é monitorado em tempo real.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="text-xs text-muted-foreground uppercase mb-1">Engajamento Médio</div>
            <div className="text-2xl font-bold">{(stats.posts > 0 ? (stats.likes + stats.comments) / stats.posts : 0).toFixed(2)}</div>
            <div className="text-[10px] text-green-500 mt-1">Interações por post</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase mb-1">Mensagens por Usuário</div>
            <div className="text-2xl font-bold">{(stats.users > 0 ? stats.msgs / stats.users : 0).toFixed(1)}</div>
            <div className="text-[10px] text-blue-500 mt-1">Frequência de chat</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase mb-1">Receita Real</div>
            <div className="text-2xl font-bold text-gradient-brand">R$ 0,00</div>
            <div className="text-[10px] text-muted-foreground mt-1">Sem dados simulados</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function UsersTab() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("profiles").select("*").order("created_at", { ascending: false });
    if (q) query = query.ilike("username", `%${q}%`);
    const { data } = await query.limit(50);
    setUsers(data || []);
    setLoading(false);
  }, [q]);

  useEffect(() => { load(); }, [load]);

  const toggleVerify = async (id: string, current: boolean) => {
    const { error } = await supabase.from("profiles").update({ is_verified: !current } as any).eq("id", id);
    if (!error) {
      toast.success(current ? "Selo removido" : "Usuário verificado");
      load();
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrar por username..." className="pl-9 bg-muted/50 border-none rounded-xl" />
      </div>
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="text-left p-4 font-semibold">Usuário</th>
              <th className="text-left p-4 font-semibold">Seguidores</th>
              <th className="text-right p-4 font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-accent/30 transition">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-muted overflow-hidden">
                      <img src={u.avatar_url || ""} alt="" className="h-full w-full object-cover" />
                    </div>
                    <div>
                      <div className="font-bold flex items-center gap-1">
                        @{u.username}
                        {u.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-[var(--brand-pink)]" />}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{u.display_name}</div>
                    </div>
                  </div>
                </td>
                <td className="p-4 font-medium">{u.followers_count}</td>
                <td className="p-4 text-right">
                  <Button size="sm" variant="outline" onClick={() => toggleVerify(u.id, u.is_verified)} className="rounded-lg">
                    {u.is_verified ? "Remover Selo" : "Verificar"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="p-8 text-center text-muted-foreground animate-pulse">Sincronizando banco de dados...</div>}
      </div>
    </div>
  );
}

function VerificationsTab() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center bg-card rounded-2xl border border-border">
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <CheckCircle2 className="h-8 w-8 text-muted-foreground opacity-20" />
      </div>
      <h3 className="font-bold">Nenhuma solicitação pendente</h3>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-2">Novas solicitações de verificação de identidade aparecerão aqui para análise manual.</p>
    </div>
  );
}
