import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveMedia } from "@/lib/storage";
import { CreatePostDialog } from "@/components/CreatePostDialog";
import { Heart, MessageCircle, BadgeCheck, Volume2, VolumeX } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_app/reels")({
  component: Reels,
  head: () => ({ meta: [{ title: "Reels — JPvano" }] }),
});

type Reel = { id: string; user_id: string; caption: string | null; media_urls: string[]; likes_count: number; comments_count: number;
  profile?: { username: string; display_name: string | null; avatar_url: string | null; is_verified: boolean } };

function Reels() {
  const [reels, setReels] = useState<Reel[]>([]);
  const load = async () => {
    const { data } = await supabase.from("posts" as never)
      .select("*, profile:profiles!posts_user_id_fkey(username,display_name,avatar_url,is_verified)")
      .eq("kind", "reel").order("created_at", { ascending: false }).limit(30);
    setReels(((data as never[]) || []) as Reel[]);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const ch = supabase.channel("reels").on("postgres_changes", { event: "*", schema: "public", table: "posts", filter: "kind=eq.reel" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <div className="mx-auto max-w-md h-[calc(100vh-5rem)] md:h-screen overflow-y-auto snap-y snap-mandatory scrollbar-hide">
      <div className="flex justify-end p-4 sticky top-0 z-10"><CreatePostDialog kind="reel" onCreated={load} /></div>
      {reels.length === 0 && <div className="flex items-center justify-center h-96 text-muted-foreground">Nenhum reel ainda</div>}
      {reels.map(r => <ReelItem key={r.id} reel={r} />)}
    </div>
  );
}

function ReelItem({ reel }: { reel: Reel }) {
  const { user } = useAuth();
  const [url, setUrl] = useState("");
  const [avatar, setAvatar] = useState("");
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(reel.likes_count);
  const [muted, setMuted] = useState(true);

  useEffect(() => { if (reel.media_urls[0]) resolveMedia(reel.media_urls[0]).then(setUrl); }, [reel.media_urls]);
  useEffect(() => { if (reel.profile?.avatar_url) resolveMedia(reel.profile.avatar_url).then(setAvatar); }, [reel.profile?.avatar_url]);
  useEffect(() => {
    if (!user) return;
    supabase.from("post_likes" as never).select("post_id").eq("post_id", reel.id).eq("user_id", user.id).maybeSingle().then(({ data }) => setLiked(!!data));
  }, [user, reel.id]);

  const toggleLike = async () => {
    if (!user) return;
    if (liked) { setLiked(false); setLikes(l => l - 1); await supabase.from("post_likes" as never).delete().eq("post_id", reel.id).eq("user_id", user.id); }
    else { setLiked(true); setLikes(l => l + 1); await supabase.from("post_likes" as never).insert({ post_id: reel.id, user_id: user.id } as never); }
  };

  return (
    <div className="relative h-[calc(100vh-5rem)] md:h-screen snap-start bg-black flex items-center justify-center">
      {url && <video src={url} loop autoPlay muted={muted} playsInline className="h-full w-full object-contain" />}
      <button onClick={() => setMuted(m => !m)} className="absolute top-4 right-4 rounded-full bg-black/50 p-2 z-10">
        {muted ? <VolumeX className="h-5 w-5 text-white" /> : <Volume2 className="h-5 w-5 text-white" />}
      </button>
      <div className="absolute bottom-6 left-4 right-16 text-white space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-full bg-gradient-brand p-[2px]"><div className="h-full w-full rounded-full bg-card overflow-hidden">{avatar && <img src={avatar} alt="" className="h-full w-full object-cover" />}</div></div>
          <div className="flex items-center gap-1 font-semibold text-sm">{reel.profile?.username}{reel.profile?.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-[var(--brand-pink)]" />}</div>
        </div>
        {reel.caption && <p className="text-sm">{reel.caption}</p>}
      </div>
      <div className="absolute right-4 bottom-20 flex flex-col gap-4 items-center text-white">
        <button onClick={toggleLike} className="flex flex-col items-center"><Heart className={`h-7 w-7 ${liked ? "fill-[var(--brand-pink)] text-[var(--brand-pink)]" : ""}`} /><span className="text-xs">{likes}</span></button>
        <button className="flex flex-col items-center"><MessageCircle className="h-7 w-7" /><span className="text-xs">{reel.comments_count}</span></button>
      </div>
    </div>
  );
}
