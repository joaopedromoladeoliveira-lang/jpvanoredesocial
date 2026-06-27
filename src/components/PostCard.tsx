import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { resolveMedia } from "@/lib/storage";
import { Link } from "@tanstack/react-router";
import { Heart, MessageCircle, Bookmark, Send, Trash2, BadgeCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "./ui/button";
import { toast } from "sonner";

export function PostCard({ post, onDeleted }: { post: any; onDeleted?: () => void }) {
  const { user, isAdmin } = useAuth();
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(post.likes_count || 0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState("");
  const [idx, setIdx] = useState(0);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string>("");

  useEffect(() => {
    if (post.media_urls) Promise.all(post.media_urls.map((p: string) => resolveMedia(p))).then(setMediaUrls);
    if (post.profile?.avatar_url) resolveMedia(post.profile.avatar_url).then(setAvatarUrl);
  }, [post.media_urls, post.profile?.avatar_url]);

  const loadLikes = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("post_likes")
      .select("*")
      .eq("post_id", post.id)
      .eq("user_id", user.id)
      .maybeSingle();
    setLiked(!!data);
  }, [post.id, user]);

  const loadComments = useCallback(async () => {
    const { data } = await supabase.from("comments")
      .select("*, profile:profiles!comments_user_id_fkey(username, avatar_url)")
      .eq("post_id", post.id)
      .order("created_at", { ascending: true });
    setComments(data || []);
  }, [post.id]);

  useEffect(() => {
    loadLikes();
    if (showComments) loadComments();

    const ch = supabase.channel(`post-${post.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `post_id=eq.${post.id}` }, () => loadComments())
      .on("postgres_changes", { event: "*", schema: "public", table: "post_likes", filter: `post_id=eq.${post.id}` }, async () => {
        const { data } = await supabase.from("posts").select("likes_count").eq("id", post.id).single();
        if (data) setLikes(data.likes_count);
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [post.id, loadLikes, loadComments, showComments]);

  const toggleLike = async () => {
    if (!user) return;
    if (liked) {
      setLiked(false);
      setLikes((l: number) => l - 1);
      await supabase.from("post_likes").delete().eq("post_id", post.id).eq("user_id", user.id);
    } else {
      setLiked(true);
      setLikes((l: number) => l + 1);
      await supabase.from("post_likes").insert({ post_id: post.id, user_id: user.id } as any);
      if (post.user_id !== user.id) {
        await supabase.from("notifications").insert({ user_id: post.user_id, actor_id: user.id, kind: "like", entity_id: post.id } as any);
      }
    }
  };

  const sendComment = async () => {
    if (!user || !commentText.trim()) return;
    const text = commentText.trim();
    setCommentText("");
    await supabase.from("comments").insert({ post_id: post.id, user_id: user.id, content: text } as any);
    if (post.user_id !== user.id) {
      await supabase.from("notifications").insert({ user_id: post.user_id, actor_id: user.id, kind: "comment", entity_id: post.id, content: text.slice(0, 50) } as any);
    }
  };

  const sharePost = async () => {
    const url = `${window.location.origin}/post/${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ url, title: "JPvano", text: post.caption || "" });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copiado!");
      }
    } catch { /* user cancelled */ }
    if (user && post.user_id !== user.id) {
      await supabase.from("notifications").insert({ user_id: post.user_id, actor_id: user.id, kind: "share", entity_id: post.id } as any);
    }
  };

  const canDelete = user?.id === post.user_id || isAdmin;

  return (
    <article className="rounded-2xl border border-border bg-card overflow-hidden shadow-elegant transition hover:shadow-glow-soft">
      <header className="flex items-center justify-between p-4">
        <Link to="/profile/$username" params={{ username: post.profile?.username || "" }} className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-brand p-[2px]">
            <div className="h-full w-full rounded-full bg-card overflow-hidden">
              <img src={avatarUrl || ""} alt="" className="h-full w-full object-cover" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1 text-sm font-bold">
              {post.profile?.display_name || post.profile?.username}
              {post.profile?.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-[var(--brand-pink)]" />}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              {formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: ptBR })}
            </div>
          </div>
        </Link>
        {canDelete && (
          <button onClick={async () => { if(confirm("Deletar?")) { await supabase.from("posts").delete().eq("id", post.id); onDeleted?.(); } }} className="text-muted-foreground hover:text-destructive p-2">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </header>

      {mediaUrls.length > 0 && (
        <div className="relative bg-black aspect-square flex items-center justify-center">
          {mediaUrls[idx]?.match(/\.(mp4|webm|mov)/i) ? (
            <video src={mediaUrls[idx]} controls className="max-h-full max-w-full" />
          ) : (
            <img src={mediaUrls[idx]} alt="" className="h-full w-full object-cover" />
          )}
          {mediaUrls.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 bg-black/20 backdrop-blur-md p-1.5 rounded-full">
              {mediaUrls.map((_, i) => (
                <button key={i} onClick={() => setIdx(i)} className={`h-1.5 rounded-full transition-all ${i === idx ? "w-4 bg-white" : "w-1.5 bg-white/50"}`} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <button onClick={toggleLike} className="p-2 hover:scale-110 transition"><Heart className={`h-7 w-7 ${liked ? "fill-[var(--brand-pink)] text-[var(--brand-pink)]" : ""}`} /></button>
          <button onClick={() => setShowComments(!showComments)} className="p-2 hover:scale-110 transition"><MessageCircle className="h-7 w-7" /></button>
          <button onClick={sharePost} className="p-2 hover:scale-110 transition" aria-label="Compartilhar"><Send className="h-7 w-7" /></button>
          <button className="ml-auto p-2 hover:scale-110 transition"><Bookmark className="h-7 w-7" /></button>
        </div>
        
        <div className="text-sm font-bold">{likes.toLocaleString("pt-BR")} curtidas</div>
        
        {post.caption && (
          <p className="text-sm leading-relaxed">
            <Link to="/profile/$username" params={{ username: post.profile?.username || "" }} className="font-bold mr-2">@{post.profile?.username}</Link>
            {post.caption}
          </p>
        )}

        {showComments && (
          <div className="space-y-4 border-t border-border pt-4 animate-in fade-in duration-300">
            <div className="max-h-60 overflow-y-auto space-y-3 pr-2">
              {comments.map(c => (
                <div key={c.id} className="text-sm flex gap-2">
                  <span className="font-bold shrink-0">@{c.profile?.username}</span>
                  <span className="text-muted-foreground">{c.content}</span>
                </div>
              ))}
              {comments.length === 0 && <p className="text-xs text-muted-foreground italic">Nenhum comentário ainda.</p>}
            </div>
            <div className="flex gap-2 bg-muted/50 rounded-xl p-2">
              <input 
                value={commentText} 
                onChange={e => setCommentText(e.target.value)} 
                onKeyDown={e => e.key === "Enter" && sendComment()} 
                placeholder="Escreva um comentário..." 
                className="flex-1 bg-transparent text-sm outline-none px-2" 
              />
              <Button size="sm" onClick={sendComment} className="bg-gradient-brand text-white border-0 rounded-lg h-8">Postar</Button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
