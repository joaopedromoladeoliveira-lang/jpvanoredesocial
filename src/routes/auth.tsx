import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/lib/auth-context";
import { Logo, Wordmark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({ meta: [{ title: "Entrar — JPvano" }] }),
});

const schema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(72),
});

function AuthPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (user) navigate({ to: "/feed", replace: true }); }, [user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Conta criada! Verifique seu e-mail se a confirmação estiver ativa.");
      } else {
        const { error } = await supabase.auth.signInWithPassword(parsed.data);
        if (error) throw error;
        toast.success("Bem-vindo de volta!");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally { setLoading(false); }
  };

  const google = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) { toast.error("Falha ao entrar com Google"); setLoading(false); return; }
    if (!result.redirected) navigate({ to: "/feed", replace: true });
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-gradient-brand opacity-20 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-gradient-brand opacity-15 blur-3xl" />
      </div>

      <div className="grid min-h-screen lg:grid-cols-2">
        <div className="hidden lg:flex flex-col justify-between p-12">
          <Logo size={48} withText />
          <div className="space-y-4">
            <h1 className="font-display text-5xl font-bold leading-tight">
              <span className="text-gradient-brand">Conecte.</span><br />
              <span className="text-gradient-brand">Compartilhe.</span><br />
              <span className="text-gradient-brand">Evolua.</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-md">
              A nova rede social brasileira premium. Crie, conecte e cresça sem limites.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} JPvano</p>
        </div>

        <div className="flex items-center justify-center p-6 lg:p-12">
          <div className="w-full max-w-md space-y-6 glass rounded-2xl border border-border p-8 shadow-elegant">
            <div className="lg:hidden flex justify-center"><Logo size={56} withText /></div>
            <div>
              <h2 className="font-display text-2xl font-bold">{mode === "signin" ? "Entrar" : "Criar conta"}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {mode === "signin" ? "Bem-vindo de volta ao " : "Junte-se ao "}
                <Wordmark />
              </p>
            </div>

            <Button onClick={google} variant="outline" className="w-full h-11" disabled={loading}>
              <svg viewBox="0 0 24 24" className="h-5 w-5 mr-2"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
              Continuar com Google
            </Button>

            <div className="flex items-center gap-3"><div className="h-px flex-1 bg-border" /><span className="text-xs text-muted-foreground">ou</span><div className="h-px flex-1 bg-border" /></div>

            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2"><Label htmlFor="email">E-mail</Label><Input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@email.com" /></div>
              <div className="space-y-2"><Label htmlFor="password">Senha</Label><Input id="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" /></div>
              <Button type="submit" disabled={loading} className="w-full h-11 bg-gradient-brand text-white font-semibold shadow-glow hover:opacity-90 border-0">
                {loading ? "Carregando..." : mode === "signin" ? "Entrar" : "Criar conta"}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              {mode === "signin" ? "Novo por aqui? " : "Já tem conta? "}
              <button type="button" className="text-gradient-brand font-semibold" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
                {mode === "signin" ? "Criar conta" : "Entrar"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
