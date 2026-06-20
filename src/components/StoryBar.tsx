import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { resolveMedia, uploadToMedia } from "@/lib/storage";
import { Plus, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export function StoryBar() {
  const { user } = useAuth();
  const [stories, setStories] = useState<any[]>([]);
  const [viewing, setViewing] = useState<{ url: string; username: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("stories" as any)
      .select("*, profile:profiles!stories_user_id_fkey(username,avatar_url)")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    setStories(data || []);
  };

  useEffect(() => { load(); }, []);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !user) return;
    setUploading(true);
    try {
      const path = await uploadToMedia(f, user.id, "stories");
      await supabase.from("stories" as any).insert({ 
        user_id: user.id, 
        media_url: path, 
        media_type: f.type.startsWith("video") ? "video" : "image" 
      });
      toast.success("Story publicado!");
      load();
    } catch (err) {
      toast.error("Erro ao publicar story");
    } finally { setUploading(false); }
  };

  const openStory = async (s: any) => {
    const url = await resolveMedia(s.media_url);
    setViewing({ url, username: s.profile?.username || "" });
  };

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
        <label className="flex flex-col items-center gap-1 shrink-0 cursor-pointer group">
          <div className="h-16 w-16 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center group-hover:border-[var(--brand-pink)] transition relative">
            {uploading ? <Loader2 className="h-6 w-6 animate-spin text-[var(--brand-pink)]" /> : <Plus className="h-6 w-6 text-muted-foreground group-hover:text-[var(--brand-pink)]" />}
            <input type="file" accept="image/*,video/*" hidden onChange={handleFile} disabled={uploading} />
          </div>
          <span className="text-[10px] font-medium text-muted-foreground">Seu Story</span>
        </label>

        {stories.map((s) => (
          <div key={s.id} onClick={() => openStory(s)} className="flex flex-col items-center gap-1 shrink-0 cursor-pointer">
            <div className="h-16 w-16 rounded-full bg-gradient-brand p-[2px]">
              <div className="h-full w-full rounded-full bg-card border-2 border-background overflow-hidden">
                <StoryAvatar path={s.profile?.avatar_url} />
              </div>
            </div>
            <span className="text-[10px] font-medium truncate w-16 text-center">@{s.profile?.username}</span>
          </div>
        ))}
      </div>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-md p-0 overflow-hidden bg-black border-none">
          <DialogHeader className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/60 to-transparent">
            <DialogTitle className="text-white text-sm">@{viewing?.username}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="flex items-center justify-center h-[80vh]">
              {viewing.url.match(/\.(mp4|webm|mov)/i)
                ? <video src={viewing.url} autoPlay controls className="max-h-full" />
                : <img src={viewing.url} alt="" className="max-h-full object-contain" />
              }
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function StoryAvatar({ path }: { path: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => { if (path) resolveMedia(path).then(setUrl); }, [path]);
  return url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-muted" />;
}
