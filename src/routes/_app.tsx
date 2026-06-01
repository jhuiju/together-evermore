import { createFileRoute, Outlet, useNavigate, Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Heart, Calendar, Map, Settings, Loader2 } from "lucide-react";

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
    <div className="min-h-screen bg-white pb-20">
      <header className="border-b border-[#e8ddd0]/60 bg-white sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <Heart className="w-5 h-5 text-primary fill-primary" />
          <h1 className="font-semibold text-foreground">Withlog</h1>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6">
        <Outlet />
      </main>
      {hasCouple && (
        <nav className="fixed bottom-0 inset-x-0 border-t border-[#e8ddd0]/60 bg-white">
          <div className="max-w-2xl mx-auto grid grid-cols-3">
            <NavItem to="/calendar" icon={Calendar} label="캘린더" />
            <NavItem to="/map" icon={Map} label="지도" />
            <NavItem to="/settings" icon={Settings} label="설정" />
          </div>
        </nav>
      )}
    </div>
  );
}

function NavItem({ to, icon: Icon, label }: { to: string; icon: typeof Calendar; label: string }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-1 py-3 text-xs text-neutral-400 transition-colors hover:text-[#D4537E]"
      activeProps={{ className: "flex flex-col items-center gap-1 py-3 text-xs text-[#D4537E]" }}
    >
      <Icon className="w-5 h-5" />
      <span>{label}</span>
    </Link>
  );
}