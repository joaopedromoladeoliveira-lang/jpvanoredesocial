import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Logo } from "@/components/Logo";
import { Home, Compass, Film, MessageCircle, Bell, User, Settings, Shield, BadgeCheck, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading, profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: s => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center"><Logo size={48} /></div>;
  }

  const navItems = [
    { to: "/feed", icon: Home, label: "Início" },
    { to: "/explore", icon: Compass, label: "Explorar" },
    { to: "/reels", icon: Film, label: "Reels" },
    { to: "/messages", icon: MessageCircle, label: "Mensagens" },
    { to: "/notifications", icon: Bell, label: "Notificações" },
  ] as const;

  return (
    <div className="min-h-screen">
      {/* Sidebar desktop */}
      <aside className="fixed left-0 top-0 hidden h-screen w-64 flex-col border-r border-border glass p-4 md:flex z-40">
        <div className="px-2 py-4"><Logo size={36} withText /></div>
        <nav className="mt-4 flex flex-1 flex-col gap-1">
          {navItems.map(item => (
            <Link key={item.to} to={item.to} className={cn("flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all hover:bg-accent",
              pathname.startsWith(item.to) && "bg-gradient-brand-soft text-foreground")}>
              <item.icon className="h-5 w-5" /> {item.label}
            </Link>
          ))}
          <Link to="/verification" className={cn("flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium hover:bg-accent", pathname.startsWith("/verification") && "bg-gradient-brand-soft")}>
            <BadgeCheck className="h-5 w-5" /> Verificação
          </Link>
          {isAdmin && (
            <Link to="/admin" className={cn("flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium hover:bg-accent", pathname.startsWith("/admin") && "bg-gradient-brand-soft")}>
              <Shield className="h-5 w-5" /> Admin
            </Link>
          )}
        </nav>
        <div className="mt-auto space-y-1 border-t border-border pt-3">
          {profile && (
            <Link to="/profile/$username" params={{ username: profile.username }} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-accent">
              <div className="h-9 w-9 rounded-full bg-gradient-brand p-[2px]">
                <div className="h-full w-full rounded-full bg-card flex items-center justify-center overflow-hidden">
                  {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : <User className="h-4 w-4" />}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold flex items-center gap-1">
                  {profile.display_name || profile.username}
                  {profile.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-[var(--brand-pink)]" />}
                </div>
                <div className="truncate text-xs text-muted-foreground">@{profile.username}</div>
              </div>
            </Link>
          )}
          <Link to="/settings" className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-accent"><Settings className="h-4 w-4" /> Configurações</Link>
          <button onClick={() => signOut()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-accent text-destructive"><LogOut className="h-4 w-4" /> Sair</button>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex justify-around border-t border-border glass py-2 md:hidden">
        {navItems.map(item => (
          <Link key={item.to} to={item.to} className={cn("flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5",
            pathname.startsWith(item.to) && "text-gradient-brand")}>
            <item.icon className="h-5 w-5" />
          </Link>
        ))}
        {profile && (
          <Link to="/profile/$username" params={{ username: profile.username }} className="flex flex-col items-center gap-0.5 px-3 py-1.5">
            <div className="h-6 w-6 rounded-full bg-gradient-brand p-[1.5px]">
              <div className="h-full w-full rounded-full bg-card overflow-hidden">
                {profile.avatar_url && <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />}
              </div>
            </div>
          </Link>
        )}
      </nav>

      <main className="md:ml-64 pb-20 md:pb-0 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
