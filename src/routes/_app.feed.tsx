import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PostCard } from "@/components/PostCard";
import { CreatePostDialog } from "@/components/CreatePostDialog";
import { Wordmark } from "@/components/Logo";
import { StoryBar } from "@/components/StoryBar";
import { SponsoredCard, type SponsoredAd } from "@/components/SponsoredCard";

export const Route = createFileRoute("/_app/feed")({
  component: Feed,
  head: () => ({ meta: [{ title: "Feed — JPvano" }] }),
});

function Feed() {
  const [posts, setPosts] = useState<never[]>([]);
  const [ads, setAds] = useState<SponsoredAd[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: postData }, { data: adData }] = await Promise.all([
      supabase.from("posts" as never)
        .select("*, profile:profiles!posts_user_id_fkey(username,display_name,avatar_url,is_verified)")
        .neq("kind", "reel")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("ad_campaigns" as never)
        .select("id,title,caption,media_url,cta_label,cta_url, advertiser:advertisers!ad_campaigns_advertiser_id_fkey(brand_name,logo_url)")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setPosts((postData as never[]) || []);
    setAds(((adData as unknown) as SponsoredAd[]) || []);
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

  // Interleave: 1 sponsored ad every 4 organic posts
  const items = useMemo(() => {
    const out: ({ kind: "post"; data: never } | { kind: "ad"; data: SponsoredAd })[] = [];
    let adIdx = 0;
    posts.forEach((p, i) => {
      out.push({ kind: "post", data: p });
      if (ads.length > 0 && (i + 1) % 4 === 0) {
        out.push({ kind: "ad", data: ads[adIdx % ads.length] });
        adIdx++;
      }
    });
    return out;
  }, [posts, ads]);

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
        {!loading && posts.length === 0 && ads.length === 0 && (
          <div className="text-center py-20 rounded-2xl border border-border bg-card">
            <h3 className="font-display text-xl font-bold mb-2">Seu feed está vazio</h3>
            <p className="text-sm text-muted-foreground mb-4">Comece publicando algo!</p>
          </div>
        )}
        {!loading && posts.length === 0 && ads.length > 0 && ads.map(a => <SponsoredCard key={a.id} ad={a} />)}
        {items.map((it, idx) => it.kind === "post"
          ? <PostCard key={(it.data as { id: string }).id} post={it.data} onDeleted={load} />
          : <SponsoredCard key={`ad-${it.data.id}-${idx}`} ad={it.data} />)}
      </div>
    </div>
  );
}
