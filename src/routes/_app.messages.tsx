import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { resolveMedia } from "@/lib/storage";
import { Send, MessageCircle, BadgeCheck, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { z } from "zod";

type Conversation = { id: string; user_a: string; user_b: string; last_message: string | null; last_message_at: string | null;
  other?: { id: string; username: string; display_name: string | null; avatar_url: string | null; is_verified: boolean } };
type Message = { id: string; conversation_id: string; sender_id: string; content: string | null; created_at: string; read_at: string | null };

export const Route = createFileRoute("/_app/messages")({
  component: Messages,
  validateSearch: (s) => ({ c: typeof s.c === "string" ? s.c : undefined, u: typeof s.u === "string" ? s.u : undefined }),
  head: () => ({ meta: [{ title: "Mensagens — JPvano" }] }),
});

function Messages() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ from: "/_app/messages" });
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(search.c);

  useEffect(() => { setActiveId(search.c); }, [search.c]);

  // open conversation with user (?u=userId)
  useEffect(() => {
    if (!search.u || !user) return;
    (async () => {
      const { data } = await supabase.rpc("get_or_create_conversation" as never, { _other: search.u } as never);
      const cid = data as unknown as string;
      navigate({ to: "/messages", search: { c: cid }, replace: true });
    })();
  }, [search.u, user, navigate]);

  const loadConvs = async () => {
    if (!user) return;
    const { data } = await supabase.from("conversations" as never).select("*").order("last_message_at", { ascending: false, nullsFirst: false });
    const list = ((data as never[]) || []) as Conversation[];
    const otherIds = list.map(c => c.user_a === user.id ? c.user_b : c.user_a);
    if (otherIds.length === 0) { setConvs([]); return; }
    const { data: profs } = await supabase.from("profiles" as never).select("id,username,display_name,avatar_url,is_verified").in("id", otherIds);
    const profMap = new Map(((profs as never[]) || []).map((p: { id: string }) => [p.id, p]));
    setConvs(list.map(c => ({ ...c, other: profMap.get(c.user_a === user.id ? c.user_b : c.user_a) as Conversation["other"] })));
  };

  useEffect(() => { loadConvs(); }, [user]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("conv-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, loadConvs)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, loadConvs)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const active = convs.find(c => c.id === activeId);

  return (
    <div className="h-screen md:h-screen flex">
      <aside className={`${activeId ? "hidden md:flex" : "flex"} flex-col w-full md:w-80 border-r border-border`}>
        <header className="p-4 border-b border-border"><h1 className="font-display text-xl font-bold">Mensagens</h1></header>
        <div className="flex-1 overflow-y-auto">
          {convs.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm"><MessageCircle className="h-10 w-10 mx-auto mb-2 opacity-50" />Nenhuma conversa ainda</div>}
          {convs.map(c => (
            <button key={c.id} onClick={() => navigate({ to: "/messages", search: { c: c.id } })}
              className={`w-full flex items-center gap-3 p-3 hover:bg-accent transition text-left ${activeId === c.id ? "bg-accent" : ""}`}>
              <ConvAvatar path={c.other?.avatar_url} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 font-semibold text-sm truncate">{c.other?.display_name || c.other?.username}{c.other?.is_verified && <BadgeCheck className="h-3 w-3 text-[var(--brand-pink)]" />}</div>
                <div className="text-xs text-muted-foreground truncate">{c.last_message || "Sem mensagens"}</div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className={`${activeId ? "flex" : "hidden md:flex"} flex-col flex-1`}>
        {active ? <Thread conv={active} onBack={() => navigate({ to: "/messages", search: {} })} /> : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center"><MessageCircle className="h-16 w-16 mx-auto mb-3 opacity-40" /><p>Selecione uma conversa</p></div>
          </div>
        )}
      </section>
    </div>
  );
}

function ConvAvatar({ path }: { path: string | null | undefined }) {
  const [url, setUrl] = useState("");
  useEffect(() => { if (path) resolveMedia(path).then(setUrl); else setUrl(""); }, [path]);
  return (
    <div className="h-12 w-12 rounded-full bg-gradient-brand p-[2px] shrink-0">
      <div className="h-full w-full rounded-full bg-card overflow-hidden">{url && <img src={url} alt="" className="h-full w-full object-cover" />}</div>
    </div>
  );
}

const msgSchema = z.string().trim().min(1).max(4000);

function Thread({ conv, onBack }: { conv: Conversation; onBack: () => void }) {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const typingCh = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async () => {
    const { data } = await supabase.from("messages" as never).select("*").eq("conversation_id", conv.id).order("created_at", { ascending: true }).limit(200);
    setMsgs(((data as never[]) || []) as Message[]);
    // mark as read
    if (user) {
      await supabase.from("messages" as never).update({ read_at: new Date().toISOString() } as never)
        .eq("conversation_id", conv.id).neq("sender_id", user.id).is("read_at", null);
    }
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };
  useEffect(() => { load(); }, [conv.id]);

  useEffect(() => {
    const ch = supabase.channel(`thread-${conv.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conv.id}` }, load)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conv.id}` }, load)
      .on("broadcast", { event: "typing" }, (p) => {
        if ((p.payload as { user: string }).user !== user?.id) {
          setTyping(true);
          if (typingTimer.current) clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => setTyping(false), 2500);
        }
      })
      .subscribe();
    typingCh.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [conv.id, user?.id]);

  const send = async () => {
    if (!user) return;
    const parsed = msgSchema.safeParse(text);
    if (!parsed.success) return;
    setText("");
    await supabase.from("messages" as never).insert({ conversation_id: conv.id, sender_id: user.id, content: parsed.data } as never);
    const otherId = conv.user_a === user.id ? conv.user_b : conv.user_a;
    await supabase.from("notifications" as never).insert({ user_id: otherId, actor_id: user.id, kind: "message", entity_id: conv.id, content: parsed.data.slice(0, 100) } as never);
  };

  const emitTyping = () => {
    typingCh.current?.send({ type: "broadcast", event: "typing", payload: { user: user?.id } });
  };

  return (
    <>
      <header className="p-3 border-b border-border flex items-center gap-3">
        <button onClick={onBack} className="md:hidden p-2"><ArrowLeft className="h-5 w-5" /></button>
        <ConvAvatar path={conv.other?.avatar_url} />
        <div>
          <div className="flex items-center gap-1 font-semibold text-sm">{conv.other?.display_name || conv.other?.username}{conv.other?.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-[var(--brand-pink)]" />}</div>
          <div className="text-xs text-muted-foreground">@{conv.other?.username}</div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {msgs.map(m => {
          const mine = m.sender_id === user?.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${mine ? "bg-gradient-brand text-white" : "bg-card border border-border"}`}>
                <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                {mine && <div className="text-[10px] text-white/70 text-right mt-0.5">{m.read_at ? "Lida" : "Enviada"}</div>}
              </div>
            </div>
          );
        })}
        {typing && <div className="text-xs text-muted-foreground italic">Digitando...</div>}
        <div ref={endRef} />
      </div>
      <div className="p-3 border-t border-border flex gap-2">
        <Input value={text} onChange={e => { setText(e.target.value); emitTyping(); }} onKeyDown={e => e.key === "Enter" && send()} placeholder="Mensagem..." maxLength={4000} />
        <Button onClick={send} className="bg-gradient-brand text-white border-0"><Send className="h-4 w-4" /></Button>
      </div>
    </>
  );
}
