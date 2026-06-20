import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { resolveMedia, uploadToMedia } from "@/lib/storage";
import { Plus, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

type Story = { id: string; user_id: string; media_url: string; expires_at: string; profile?: { username: string; avatar_url: string | null } };

export function StoryBar() {
  const { user } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [viewing, setViewing] = useState<{ url: string; username: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("stories" as never)
      .select("*, profile:profiles!stories_user_id_fkey(username,avatar_url)")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    setStories(((data as never[]) || []) as Story[]);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const ch = supabase.channel("stories-bar").on("postgres_changes", { event: "*", schema: "public", table: "stories" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !user) return;
    setUploading(true);
    try {
      const path = await uploadToMedia(f, user.id, "stories");
      const { error } = await supabase.from("stories" as never).insert({ user_id: user.id, media_url: path, media_type: f.type.startsWith("video") ? "video" : "image" } as never);
      if (error) throw error;
      toast.success("Story publicado!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally { setUploading(false); }
  };

  const openStory = async (s: Story) => {
    const url = await resolveMedia(s.media_url);
    setViewing({ url, username: s.profile?.username || "" });
  };

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        <label className="flex flex-col items-center gap-1 cursor-pointer shrink-0">
          <div className="relative h-16 w-16 rounded-full bg-gradient-brand p-[2px]">
            <div className="h-full w-full rounded-full bg-card flex items-center justify-center">
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
            </div>
          </div>
          <span className="text-xs">Seu story</span>
          <input type="file" accept="image/*,video/*" hidden onChange={handleFile} disabled={uploading} />
        </label>
        {stories.map(s => (
          <button key={s.id} onClick={() => openStory(s)} className="flex flex-col items-center gap-1 shrink-0">
            <div className="h-16 w-16 rounded-full bg-gradient-brand p-[2px]">
              <div className="h-full w-full rounded-full bg-card overflow-hidden">
                {s.profile?.avatar_url && <StoryAvatar path={s.profile.avatar_url} />}
              </div>
            </div>
            <span className="text-xs max-w-[70px] truncate">{s.profile?.username}</span>
          </button>
        ))}
      </div>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <DialogHeader className="p-3"><DialogTitle>@{viewing?.username}</DialogTitle></DialogHeader>
          {viewing && (
            viewing.url.match(/\.(mp4|webm|mov)/i)
              ? <video src={viewing.url} autoPlay controls className="w-full" />
              : <img src={viewing.url} alt="" className="w-full" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function StoryAvatar({ path }: { path: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => { resolveMedia(path).then(setUrl); }, [path]);
  return url ? <img src={url} alt="" className="h-full w-full object-cover" /> : null;
}
