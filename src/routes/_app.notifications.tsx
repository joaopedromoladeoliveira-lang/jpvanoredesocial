import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Heart, MessageCircle, UserPlus, BadgeCheck, Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_app/notifications")({
  component: Notifications,
  head: () => ({ meta: [{ title: "Notificações — JPvano" }] }),
});

type Notif = { id: string; kind: string; content: string | null; entity_id: string | null; created_at: string; read_at: string | null;
  actor?: { username: string; avatar_url: string | null; is_verified: boolean } };

function Notifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("notifications" as never).select("*, actor:profiles!notifications_actor_id_fkey(username,avatar_url,is_verified)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
    setItems(((data as never[]) || []) as Notif[]);
    await supabase.from("notifications" as never).update({ read_at: new Date().toISOString() } as never).eq("user_id", user.id).is("read_at", null);
  };
  useEffect(() => { load(); }, [user?.id]);
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("notifs").on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const iconFor = (k: string) => k === "like" ? <Heart className="h-4 w-4 text-[var(--brand-pink)]" /> : k === "comment" ? <MessageCircle className="h-4 w-4" /> : k === "follow" ? <UserPlus className="h-4 w-4" /> : k === "verification" ? <BadgeCheck className="h-4 w-4 text-[var(--brand-pink)]" /> : <Bell className="h-4 w-4" />;
  const textFor = (n: Notif) => n.kind === "like" ? "curtiu seu post" : n.kind === "comment" ? `comentou: ${n.content}` : n.kind === "follow" ? "começou a seguir você" : n.kind === "message" ? `enviou uma mensagem: ${n.content}` : n.content || "";

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="font-display text-3xl font-bold mb-6">Notificações</h1>
      <div className="rounded-2xl border border-border bg-card divide-y divide-border">
        {items.length === 0 && <p className="p-8 text-center text-muted-foreground text-sm">Nada por aqui ainda</p>}
        {items.map(n => (
          <div key={n.id} className="flex items-center gap-3 p-4">
            <div className="h-9 w-9 rounded-full bg-accent flex items-center justify-center">{iconFor(n.kind)}</div>
            <div className="flex-1 min-w-0 text-sm">
              {n.actor?.username && <Link to="/profile/$username" params={{ username: n.actor.username }} className="font-semibold mr-1">@{n.actor.username}</Link>}
              <span>{textFor(n)}</span>
              <div className="text-xs text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
