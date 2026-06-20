import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PostCard } from "@/components/PostCard";
import { CreatePostDialog } from "@/components/CreatePostDialog";
import { Wordmark } from "@/components/Logo";
import { StoryBar } from "@/components/StoryBar";

export const Route = createFileRoute("/_app/feed")({
  component: Feed,
  head: () => ({ meta: [{ title: "Feed — JPvano" }] }),
});

function Feed() {
  const [posts, setPosts] = useState<never[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from("posts" as never)
      .select("*, profile:profiles!posts_user_id_fkey(username,display_name,avatar_url,is_verified)")
      .neq("kind", "reel")
      .order("created_at", { ascending: false })
      .limit(50);
    setPosts((data as never[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase.channel("feed-posts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, () => load())
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "posts" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <header className="flex items-center justify-between mb-6 md:hidden">
        <Wordmark className="text-2xl" />
        <CreatePostDialog onCreated={load} />
      </header>
      <div className="hidden md:flex justify-end mb-6"><CreatePostDialog onCreated={load} /></div>

      <StoryBar />

      <div className="space-y-6 mt-6">
        {loading && <div className="text-center text-muted-foreground py-10">Carregando...</div>}
        {!loading && posts.length === 0 && (
          <div className="text-center py-20 rounded-2xl border border-border bg-card">
            <h3 className="font-display text-xl font-bold mb-2">Seu feed está vazio</h3>
            <p className="text-sm text-muted-foreground mb-4">Comece publicando algo!</p>
          </div>
        )}
        {posts.map(p => <PostCard key={(p as { id: string }).id} post={p as never} onDeleted={load} />)}
      </div>
    </div>
  );
}
