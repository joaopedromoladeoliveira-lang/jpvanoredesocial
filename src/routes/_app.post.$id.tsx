import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PostCard } from "@/components/PostCard";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_app/post/$id")({
  component: PostDetail,
  head: () => ({ meta: [{ title: "Post — JPvano" }] }),
});

function PostDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState<never | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.from("posts" as never)
      .select("*, profile:profiles!posts_user_id_fkey(username,display_name,avatar_url,is_verified)")
      .eq("id", id).maybeSingle()
      .then(({ data }) => { if (mounted) { setPost(data as never); setLoading(false); } });
    return () => { mounted = false; };
  }, [id]);

  if (loading) return <div className="p-10 text-center text-muted-foreground">Carregando...</div>;
  if (!post) return <div className="p-10 text-center text-muted-foreground">Post não encontrado</div>;

  const username = (post as { profile?: { username?: string } }).profile?.username || "";

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => history.length > 1 ? history.back() : navigate({ to: "/feed" })} className="p-2 rounded-full hover:bg-accent" aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></button>
        {username && <Link to="/profile/$username" params={{ username }} className="text-sm text-muted-foreground hover:text-foreground">Perfil de @{username}</Link>}
      </div>
      <PostCard post={post} onDeleted={() => navigate({ to: "/feed" })} />
    </div>
  );
}
