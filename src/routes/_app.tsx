import { createFileRoute, Outlet, useNavigate, Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Heart, Calendar, Map, Settings, Loader2, Library } from "lucide-react";
import { PushPermissionPrompt } from "@/components/push-permission-prompt";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [coupleChecked, setCoupleChecked] = useState(false);
  const [hasCouple, setHasCouple] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    supabase
      .from("users")
      .select("couple_id")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const connected = !!data?.couple_id;
        setHasCouple(connected);
        setCoupleChecked(true);
        if (!connected && location.pathname !== "/connect" && location.pathname !== "/settings") {
          navigate({ to: "/connect" });
        }
      });
  }, [user, loading, navigate, location.pathname]);

  if (loading || !user || !coupleChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div
      className="bg-[var(--app-bg)] min-h-screen-dvh"
      style={{
        ["--app-header-h" as any]: "49px",
        ["--app-bottom-nav-h" as any]: "64px",
      }}
    >
      <header
        className="border-b border-[var(--app-divider)] bg-[var(--app-bg)] sticky top-0 z-10"
        style={{ height: "var(--app-header-h)" }}
      >
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <Heart className="w-5 h-5 text-[var(--app-pink)] fill-[var(--app-pink)]" />
          <h1 className="font-semibold text-[var(--app-text)]">Withlog</h1>
        </div>
      </header>
      <main
        className="max-w-2xl mx-auto px-4 py-6"
        style={{
          paddingBottom: hasCouple
            ? "calc(var(--app-bottom-nav-h) + env(safe-area-inset-bottom) + 1rem)"
            : "calc(env(safe-area-inset-bottom) + 1.5rem)",
        }}
      >
        <Outlet />
      </main>
      {hasCouple && (
        <nav
          className="fixed bottom-0 inset-x-0 border-t border-[var(--app-divider)] bg-[var(--app-bg)]"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="max-w-2xl mx-auto grid grid-cols-4">
            <NavItem to="/calendar" icon={Calendar} label="Calendar" />
            <NavItem to="/archive" icon={Library} label="Archive" />
            <NavItem to="/map" icon={Map} label="Map" />
            <NavItem to="/settings" icon={Settings} label="Settings" />
          </div>
        </nav>
      )}
      {hasCouple && <PushPermissionPrompt />}
    </div>
  );
}

function NavItem({ to, icon: Icon, label }: { to: string; icon: typeof Calendar; label: string }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-1 py-3 text-xs text-[var(--app-nav-inactive)] transition-colors hover:text-[var(--app-pink)]"
      activeProps={{ className: "flex flex-col items-center gap-1 py-3 text-xs text-[var(--app-pink)]" }}
    >
      <Icon className="w-5 h-5" />
      <span>{label}</span>
    </Link>
  );
}