import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings")({
  component: Settings,
  head: () => ({ meta: [{ title: "Configurações — JPvano" }] }),
});

function Settings() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [isPrivate, setIsPrivate] = useState(profile?.is_private ?? false);
  const [newPass, setNewPass] = useState("");

  const togglePrivate = async (v: boolean) => {
    setIsPrivate(v);
    await supabase.from("profiles" as never).update({ is_private: v } as never).eq("id", user!.id);
    refreshProfile();
  };

  const changePassword = async () => {
    if (newPass.length < 6) { toast.error("Mínimo 6 caracteres"); return; }
    const { error } = await supabase.auth.updateUser({ password: newPass });
    if (error) toast.error(error.message); else { toast.success("Senha atualizada"); setNewPass(""); }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <h1 className="font-display text-3xl font-bold">Configurações</h1>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-display font-bold">Privacidade</h2>
        <div className="flex items-center justify-between">
          <div><div className="font-medium text-sm">Conta privada</div><div className="text-xs text-muted-foreground">Apenas seguidores aprovados verão seus posts</div></div>
          <Switch checked={isPrivate} onCheckedChange={togglePrivate} />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <h2 className="font-display font-bold">Segurança</h2>
        <div><label className="text-xs">Nova senha</label><Input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} /></div>
        <Button onClick={changePassword} className="bg-gradient-brand text-white border-0">Atualizar senha</Button>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <Button variant="destructive" onClick={async () => { await signOut(); navigate({ to: "/auth", replace: true }); }}>Sair da conta</Button>
      </section>
    </div>
  );
}
