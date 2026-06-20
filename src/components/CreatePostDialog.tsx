import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImagePlus, Plus, X, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { uploadToMedia } from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function CreatePostDialog({ onCreated, kind = "photo" as "photo" | "reel" }: { onCreated?: () => void; kind?: "photo" | "reel" }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => { setFiles([]); setCaption(""); };

  const submit = async () => {
    if (!user) return;
    if (files.length === 0) { toast.error("Adicione mídia"); return; }
    setBusy(true);
    try {
      const paths = await Promise.all(files.map(f => uploadToMedia(f, user.id)));
      const post_kind = kind === "reel" ? "reel" : files.length > 1 ? "carousel" : files[0].type.startsWith("video") ? "video" : "photo";
      const { error } = await supabase.from("posts" as never).insert({ user_id: user.id, kind: post_kind, caption: caption.slice(0, 2200), media_urls: paths } as never);
      if (error) throw error;
      toast.success("Publicado!");
      setOpen(false);
      reset();
      onCreated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao publicar");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-brand text-white border-0 shadow-glow font-semibold">
          <Plus className="h-4 w-4 mr-1" /> {kind === "reel" ? "Novo Reel" : "Criar"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{kind === "reel" ? "Novo Reel" : "Nova publicação"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <label className="block border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:bg-accent transition">
            <input type="file" accept={kind === "reel" ? "video/*" : "image/*,video/*"} multiple={kind !== "reel"} className="hidden"
              onChange={e => setFiles(Array.from(e.target.files || []).slice(0, kind === "reel" ? 1 : 10))} />
            <ImagePlus className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
            <div className="text-sm">Clique ou arraste {kind === "reel" ? "um vídeo" : "imagens ou vídeos"}</div>
          </label>
          {files.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {files.map((f, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                  {f.type.startsWith("video") ? <video src={URL.createObjectURL(f)} className="h-full w-full object-cover" /> : <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />}
                  <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute top-1 right-1 rounded-full bg-black/60 p-1"><X className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          )}
          <Textarea value={caption} onChange={e => setCaption(e.target.value)} placeholder="Escreva uma legenda..." rows={3} maxLength={2200} />
          <Button onClick={submit} disabled={busy || files.length === 0} className="w-full bg-gradient-brand text-white border-0 font-semibold">
            {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Publicando...</> : "Publicar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
