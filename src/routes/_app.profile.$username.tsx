import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { resolveMedia, uploadToMedia } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { BadgeCheck, Camera, MessageCircle, Settings } from "lucide-react";
import { toast } from "sonner";
import { PostCard } from "@/components/PostCard";

type Profile = { id: string; username: string; display_name: string | null; bio: string | null; website: string | null;
  avatar_url: string | null; cover_url: string | null; is_verified: boolean; is_private: boolean;
  followers_count: number; following_count: number; posts_count: number };

export const Route = createFileRoute("/_app/profile/$username")({
  component: ProfilePage,
  head: ({ params }) => ({ meta: [{ title: `@${params.username} — JPvano` }] }),
});

function ProfilePage() {
  const { username } = Route.useParams();
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<never[]>([]);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [following, setFollowing] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = async () => {
    const { data: p } = await supabase.from("profiles" as never).select("*").eq("username", username).maybeSingle();
    if (!p) { setProfile(null); return; }
    const prof = p as unknown as Profile;
    setProfile(prof);
    if (prof.avatar_url) resolveMedia(prof.avatar_url).then(setAvatarUrl);
    if (prof.cover_url) resolveMedia(prof.cover_url).then(setCoverUrl);
    const { data: ps } = await supabase.from("posts" as never).select("*, profile:profiles!posts_user_id_fkey(username,display_name,avatar_url,is_verified)").eq("user_id", prof.id).order("created_at", { ascending: false });
    setPosts((ps as never[]) || []);
    if (user) {
      const { data: f } = await supabase.from("follows" as never).select("follower_id").eq("follower_id", user.id).eq("following_id", prof.id).maybeSingle();
      setFollowing(!!f);
    }
  };
  useEffect(() => { load(); }, [username, user?.id]);

  if (!profile) return <div className="p-10 text-center text-muted-foreground">Carregando perfil...</div>;
  const isOwn = user?.id === profile.id;

  const toggleFollow = async () => {
    if (!user) return;
    if (following) { setFollowing(false); await supabase.from("follows" as never).delete().eq("follower_id", user.id).eq("following_id", profile.id); }
    else { setFollowing(true); await supabase.from("follows" as never).insert({ follower_id: user.id, following_id: profile.id } as never);
      await supabase.from("notifications" as never).insert({ user_id: profile.id, actor_id: user.id, kind: "follow" } as never); }
    load();
  };

  const startDM = async () => {
    if (!user || isOwn) return;
    navigate({ to: "/messages", search: { u: profile.id } });
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="relative">
        <div className="h-48 md:h-64 bg-gradient-brand-soft relative overflow-hidden">
          {coverUrl && <img src={coverUrl} alt="" className="h-full w-full object-cover" />}
          {isOwn && <CoverUpload onUploaded={async (path) => { await supabase.from("profiles" as never).update({ cover_url: path } as never).eq("id", user!.id); load(); refreshProfile(); }} />}
        </div>
        <div className="px-6 -mt-16 relative">
          <div className="flex items-end justify-between">
            <div className="relative">
              <div className="h-32 w-32 rounded-full bg-gradient-brand p-[3px] shadow-glow">
                <div className="h-full w-full rounded-full bg-card overflow-hidden">
                  {avatarUrl && <img src={avatarUrl} alt="" className="h-full w-full object-cover" />}
                </div>
              </div>
              {isOwn && <AvatarUpload onUploaded={async (path) => { await supabase.from("profiles" as never).update({ avatar_url: path } as never).eq("id", user!.id); load(); refreshProfile(); }} />}
            </div>
            <div className="flex gap-2 mt-4">
              {isOwn ? (
                <>
                  <Button variant="outline" onClick={() => setEditing(true)}><Settings className="h-4 w-4 mr-1" /> Editar</Button>
                </>
              ) : (
                <>
                  <Button onClick={toggleFollow} className={following ? "" : "bg-gradient-brand text-white border-0"}>{following ? "Seguindo" : "Seguir"}</Button>
                  <Button variant="outline" onClick={startDM}><MessageCircle className="h-4 w-4 mr-1" /> Mensagem</Button>
                </>
              )}
            </div>
          </div>

          <div className="mt-4">
            <h1 className="font-display text-2xl font-bold flex items-center gap-1">{profile.display_name || profile.username}{profile.is_verified && <BadgeCheck className="h-5 w-5 text-[var(--brand-pink)]" />}</h1>
            <p className="text-sm text-muted-foreground">@{profile.username}</p>
            {profile.bio && <p className="mt-3 text-sm">{profile.bio}</p>}
            {profile.website && <a href={profile.website} target="_blank" rel="noreferrer" className="text-sm text-gradient-brand">{profile.website}</a>}
            <div className="mt-4 flex gap-6 text-sm">
              <div><span className="font-bold">{profile.posts_count}</span> <span className="text-muted-foreground">posts</span></div>
              <div><span className="font-bold">{profile.followers_count}</span> <span className="text-muted-foreground">seguidores</span></div>
              <div><span className="font-bold">{profile.following_count}</span> <span className="text-muted-foreground">seguindo</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 px-6">
        <div className="border-t border-border pt-6">
          {posts.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">Nenhum post ainda</p>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {posts.map((p: never) => <GridThumb key={(p as { id: string }).id} post={p} />)}
            </div>
          )}
        </div>
      </div>

      {editing && profile && <EditProfileDialog profile={profile} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); refreshProfile(); }} />}
    </div>
  );
}

function GridThumb({ post }: { post: never }) {
  const p = post as { id: string; media_urls: string[]; kind: string };
  const [url, setUrl] = useState("");
  useEffect(() => { if (p.media_urls[0]) resolveMedia(p.media_urls[0]).then(setUrl); }, [p.media_urls]);
  return (
    <div className="aspect-square bg-muted overflow-hidden">
      {url && (url.match(/\.(mp4|webm|mov)/i) ? <video src={url} className="h-full w-full object-cover" /> : <img src={url} alt="" className="h-full w-full object-cover" />)}
    </div>
  );
}

function CoverUpload({ onUploaded }: { onUploaded: (path: string) => void }) {
  const { user } = useAuth();
  return (
    <label className="absolute bottom-3 right-3 cursor-pointer rounded-full bg-black/60 p-2">
      <Camera className="h-4 w-4 text-white" />
      <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f || !user) return; const path = await uploadToMedia(f, user.id, "covers"); onUploaded(path); }} />
    </label>
  );
}
function AvatarUpload({ onUploaded }: { onUploaded: (path: string) => void }) {
  const { user } = useAuth();
  return (
    <label className="absolute bottom-1 right-1 cursor-pointer rounded-full bg-gradient-brand p-2 shadow-glow">
      <Camera className="h-3.5 w-3.5 text-white" />
      <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f || !user) return; const path = await uploadToMedia(f, user.id, "avatars"); onUploaded(path); }} />
    </label>
  );
}

function EditProfileDialog({ profile, onClose, onSaved }: { profile: Profile; onClose: () => void; onSaved: () => void }) {
  const [display, setDisplay] = useState(profile.display_name || "");
  const [bio, setBio] = useState(profile.bio || "");
  const [website, setWebsite] = useState(profile.website || "");
  const [username, setUsername] = useState(profile.username);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const u = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (u.length < 3) { toast.error("Username precisa ter 3+ caracteres"); setSaving(false); return; }
    const { error } = await supabase.from("profiles" as never).update({ display_name: display.slice(0, 60), bio: bio.slice(0, 300), website: website.slice(0, 200), username: u } as never).eq("id", profile.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Perfil atualizado!");
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="font-display text-xl font-bold">Editar perfil</h2>
        <div><label className="text-xs">Nome de usuário</label><Input value={username} onChange={e => setUsername(e.target.value)} /></div>
        <div><label className="text-xs">Nome de exibição</label><Input value={display} onChange={e => setDisplay(e.target.value)} maxLength={60} /></div>
        <div><label className="text-xs">Bio</label><Textarea value={bio} onChange={e => setBio(e.target.value)} maxLength={300} rows={3} /></div>
        <div><label className="text-xs">Website</label><Input value={website} onChange={e => setWebsite(e.target.value)} maxLength={200} /></div>
        <div className="flex gap-2 justify-end"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={saving} onClick={save} className="bg-gradient-brand text-white border-0">{saving ? "Salvando..." : "Salvar"}</Button></div>
      </div>
    </div>
  );
}
