import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveMedia } from "@/lib/storage";
import { BadgeCheck, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_app/explore")({
  component: Explore,
  head: () => ({ meta: [{ title: "Explorar — JPvano" }] }),
});

function Explore() {
  const [posts, setPosts] = useState<{ id: string; media_urls: string[]; likes_count: number }[]>([]);
  const [people, setPeople] = useState<{ id: string; username: string; display_name: string | null; avatar_url: string | null; is_verified: boolean }[]>([]);
  const [q, setQ] = useState("");

  const loadPosts = () => supabase.from("posts" as never).select("id,media_urls,likes_count").neq("kind", "reel").order("likes_count", { ascending: false }).limit(30).then(({ data }) => setPosts(((data as never[]) || []) as never));

  useEffect(() => { loadPosts(); }, []);
  useEffect(() => {
    const ch = supabase.channel("explore-posts").on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => loadPosts()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);
  useEffect(() => {
    if (!q) { setPeople([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from("profiles" as never).select("id,username,display_name,avatar_url,is_verified").ilike("username", `%${q}%`).limit(20);
      setPeople(((data as never[]) || []) as never);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar pessoas..." className="pl-9" />
      </div>
      {people.length > 0 && (
        <div className="rounded-2xl border border-border bg-card divide-y divide-border mb-6">
          {people.map(p => <PersonRow key={p.id} p={p} />)}
        </div>
      )}
      <h2 className="font-display text-xl font-bold mb-4">Em alta</h2>
      <div className="grid grid-cols-3 gap-1">
        {posts.map(p => <Thumb key={p.id} path={p.media_urls[0]} />)}
      </div>
    </div>
  );
}

function PersonRow({ p }: { p: { id: string; username: string; display_name: string | null; avatar_url: string | null; is_verified: boolean } }) {
  const [url, setUrl] = useState("");
  useEffect(() => { if (p.avatar_url) resolveMedia(p.avatar_url).then(setUrl); }, [p.avatar_url]);
  return (
    <Link to="/profile/$username" params={{ username: p.username }} className="flex items-center gap-3 p-3 hover:bg-accent">
      <div className="h-10 w-10 rounded-full bg-gradient-brand p-[2px]"><div className="h-full w-full rounded-full bg-card overflow-hidden">{url && <img src={url} alt="" className="h-full w-full object-cover" />}</div></div>
      <div><div className="font-semibold text-sm flex items-center gap-1">@{p.username}{p.is_verified && <BadgeCheck className="h-3 w-3 text-[var(--brand-pink)]" />}</div><div className="text-xs text-muted-foreground">{p.display_name}</div></div>
    </Link>
  );
}
function Thumb({ path }: { path?: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => { if (path) resolveMedia(path).then(setUrl); }, [path]);
  return <div className="aspect-square bg-muted overflow-hidden">{url && <img src={url} alt="" className="h-full w-full object-cover" />}</div>;
}
