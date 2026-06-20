import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { resolveMedia } from "@/lib/storage";
import { Link } from "@tanstack/react-router";
import { Heart, MessageCircle, Bookmark, BadgeCheck, Send, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "./ui/button";

type Post = {
  id: string;
  user_id: string;
  kind: string;
  caption: string | null;
  media_urls: string[];
  likes_count: number;
  comments_count: number;
  created_at: string;
  profile?: { username: string; display_name: string | null; avatar_url: string | null; is_verified: boolean };
};

export function PostCard({ post, onDeleted }: { post: Post; onDeleted?: () => void }) {
  const { user, isAdmin } = useAuth();
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [likes, setLikes] = useState(post.likes_count);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<{ id: string; content: string; user_id: string; created_at: string; profile?: { username: string; avatar_url: string | null } }[]>([]);
  const [commentText, setCommentText] = useState("");
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    Promise.all(post.media_urls.map(p => resolveMedia(p))).then(setMediaUrls);
    if (post.profile?.avatar_url) resolveMedia(post.profile.avatar_url).then(setAvatarUrl);
  }, [post.media_urls, post.profile?.avatar_url]);

  useEffect(() => {
    if (!user) return;
    supabase.from("post_likes" as never).select("post_id").eq("post_id", post.id).eq("user_id", user.id).maybeSingle().then(({ data }) => setLiked(!!data));
    supabase.from("saved_posts" as never).select("post_id").eq("post_id", post.id).eq("user_id", user.id).maybeSingle().then(({ data }) => setSaved(!!data));
  }, [user, post.id]);

  const toggleLike = async () => {
    if (!user) return;
    if (liked) {
      setLiked(false); setLikes(l => l - 1);
      await supabase.from("post_likes" as never).delete().eq("post_id", post.id).eq("user_id", user.id);
    } else {
      setLiked(true); setLikes(l => l + 1);
      await supabase.from("post_likes" as never).insert({ post_id: post.id, user_id: user.id } as never);
      if (post.user_id !== user.id) {
        await supabase.from("notifications" as never).insert({ user_id: post.user_id, actor_id: user.id, kind: "like", entity_id: post.id } as never);
      }
    }
  };

  const toggleSave = async () => {
    if (!user) return;
    if (saved) {
      setSaved(false);
      await supabase.from("saved_posts" as never).delete().eq("post_id", post.id).eq("user_id", user.id);
    } else {
      setSaved(true);
      await supabase.from("saved_posts" as never).insert({ post_id: post.id, user_id: user.id } as never);
    }
  };

  const loadComments = useCallback(async () => {
    const { data } = await supabase.from("comments" as never).select("*, profile:profiles!comments_user_id_fkey(username,avatar_url)").eq("post_id", post.id).order("created_at", { ascending: true });
    setComments((data as never[]) || []);
  }, [post.id]);

  useEffect(() => {
    if (showComments) loadComments();
  }, [showComments, loadComments]);

  const sendComment = async () => {
    if (!user || !commentText.trim()) return;
    const text = commentText.trim().slice(0, 2000);
    setCommentText("");
    await supabase.from("comments" as never).insert({ post_id: post.id, user_id: user.id, content: text } as never);
    loadComments();
    if (post.user_id !== user.id) {
      await supabase.from("notifications" as never).insert({ user_id: post.user_id, actor_id: user.id, kind: "comment", entity_id: post.id, content: text.slice(0, 100) } as never);
    }
  };

  const deletePost = async () => {
    if (!confirm("Deletar este post?")) return;
    const { error } = await supabase.from("posts" as never).delete().eq("id", post.id);
    if (error) toast.error(error.message); else { toast.success("Post deletado"); onDeleted?.(); }
  };

  const canDelete = user?.id === post.user_id || isAdmin;

  return (
    <article className="rounded-2xl border border-border bg-card overflow-hidden shadow-elegant">
      <header className="flex items-center justify-between p-4">
        <Link to="/profile/$username" params={{ username: post.profile?.username || "" }} className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-brand p-[2px]">
            <div className="h-full w-full rounded-full bg-card overflow-hidden">
              {avatarUrl && <img src={avatarUrl} alt="" className="h-full w-full object-cover" />}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1 text-sm font-semibold">
              {post.profile?.display_name || post.profile?.username}
              {post.profile?.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-[var(--brand-pink)]" />}
            </div>
            <div className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: ptBR })}</div>
          </div>
        </Link>
        {canDelete && (
          <button onClick={deletePost} className="text-muted-foreground hover:text-destructive p-2" aria-label="Deletar">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </header>

      {mediaUrls.length > 0 && (
        <div className="relative bg-black aspect-square">
          {mediaUrls[idx]?.match(/\.(mp4|webm|mov)/i) ? (
            <video src={mediaUrls[idx]} controls className="h-full w-full object-contain" />
          ) : (
            <img src={mediaUrls[idx]} alt="" className="h-full w-full object-cover" />
          )}
          {mediaUrls.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
              {mediaUrls.map((_, i) => (
                <button key={i} onClick={() => setIdx(i)} className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-white" : "w-1.5 bg-white/50"}`} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="p-4 space-y-3">
        <div className="flex items-center gap-1">
          <button onClick={toggleLike} className="p-2 hover:scale-110 transition" aria-label="Curtir"><Heart className={`h-6 w-6 ${liked ? "fill-[var(--brand-pink)] text-[var(--brand-pink)]" : ""}`} /></button>
          <button onClick={() => setShowComments(s => !s)} className="p-2" aria-label="Comentar"><MessageCircle className="h-6 w-6" /></button>
          <button onClick={toggleSave} className="ml-auto p-2" aria-label="Salvar"><Bookmark className={`h-6 w-6 ${saved ? "fill-foreground" : ""}`} /></button>
        </div>

        <div className="text-sm font-semibold">{likes.toLocaleString("pt-BR")} curtida{likes === 1 ? "" : "s"}</div>
        {post.caption && (
          <p className="text-sm">
            <Link to="/profile/$username" params={{ username: post.profile?.username || "" }} className="font-semibold mr-2">{post.profile?.username}</Link>
            {post.caption}
          </p>
        )}

        {showComments && (
          <div className="space-y-3 border-t border-border pt-3">
            {comments.length === 0 && <p className="text-xs text-muted-foreground">Seja o primeiro a comentar</p>}
            {comments.map(c => (
              <div key={c.id} className="text-sm">
                <Link to="/profile/$username" params={{ username: c.profile?.username || "" }} className="font-semibold mr-2">{c.profile?.username}</Link>
                {c.content}
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <input value={commentText} onChange={e => setCommentText(e.target.value)} onKeyDown={e => e.key === "Enter" && sendComment()} placeholder="Adicione um comentário..." className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" maxLength={2000} />
              <Button size="sm" onClick={sendComment} className="bg-gradient-brand text-white border-0"><Send className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
