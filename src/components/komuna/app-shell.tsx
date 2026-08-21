import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  Compass,
  Home,
  LogOut,
  MessageCircle,
  Plus,
  Settings,
  ShieldAlert,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Logo } from "@/components/komuna/logo";
import { usePlatform } from "@/hooks/use-platform";
import { useProfile } from "@/hooks/use-session";
import { fetchModerationScope } from "@/lib/moderation";
import { cn } from "@/lib/utils";

const primaryNav = [
  { to: "/", label: "Home", icon: Home },
  { to: "/explore", label: "Explore", icon: Compass },
  { to: "/communities", label: "Communities", icon: Users },
  { to: "/messages", label: "Messages", icon: MessageCircle },
] as const;

const soonNav = [{ label: "Notifications", icon: Bell }] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const platform = usePlatform();
  const { data: profile, user } = useProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const scope = useQuery({
    queryKey: ["moderation-scope", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchModerationScope(user!.id),
  });
  const canModerate = Boolean(
    scope.data && (scope.data.isPlatformAdmin || scope.data.communities.length > 0),
  );

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const initials = (profile?.display_name || profile?.username || "K").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-border/70 bg-background/80 sticky top-0 z-40 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link to="/" className="shrink-0">
            <Logo name={platform.general.platform_name} logoUrl={platform.general.logo_url} />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <>
                <Button asChild variant="ghost" size="icon" className="hidden sm:inline-flex">
                  <Link to="/communities/new" aria-label="Request a community">
                    <Plus className="h-5 w-5" />
                  </Link>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="ring-offset-background focus-visible:ring-ring rounded-full focus-visible:ring-2 focus-visible:outline-none">
                      <Avatar className="border-border h-9 w-9 border">
                        <AvatarImage src={profile?.avatar_url ?? undefined} alt="" />
                        <AvatarFallback className="bg-accent text-xs">{initials}</AvatarFallback>
                      </Avatar>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    {profile?.username ? (
                      <DropdownMenuItem asChild>
                        <Link to="/u/$username" params={{ username: profile.username }}>
                          <User className="mr-2 h-4 w-4" /> My profile
                        </Link>
                      </DropdownMenuItem>
                    ) : null}
                    {canModerate ? (
                      <DropdownMenuItem asChild>
                        <Link to="/moderation">
                          <ShieldAlert className="mr-2 h-4 w-4" /> Moderation
                        </Link>
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem asChild>
                      <Link to="/settings">
                        <Settings className="mr-2 h-4 w-4" /> Settings
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => void signOut()}>
                      <LogOut className="mr-2 h-4 w-4" /> Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <Button asChild variant="brand" size="sm">
                <Link to="/auth">Sign in</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl gap-6 px-4 pb-24 md:pb-10">
        <aside className="sticky top-24 hidden h-fit w-56 shrink-0 py-6 md:block">
          <nav className="space-y-1">
            {primaryNav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                className="text-muted-foreground hover:bg-sidebar-accent hover:text-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:text-foreground flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
            {soonNav.map((item) => (
              <span
                key={item.label}
                className="text-muted-foreground/60 flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium"
                title="Coming soon"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                <span className="bg-muted text-muted-foreground ml-auto rounded px-1.5 py-0.5 text-[10px]">
                  soon
                </span>
              </span>
            ))}
          </nav>

          <div className="surface-panel mt-6 p-4">
            <Sparkles className="text-secondary mb-2 h-4 w-4" />
            <p className="text-sm font-semibold">{platform.general.tagline}</p>
            <p className="text-muted-foreground mt-1 text-xs">{platform.general.description}</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 py-6">{children}</main>
      </div>

      <nav className="border-border/70 bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-xl md:hidden">
        <div className="mx-auto flex max-w-md items-center justify-around px-2 py-2">
          {primaryNav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              className={cn(
                "text-muted-foreground data-[status=active]:text-foreground flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 text-[11px] font-medium",
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          ))}
          <Link
            to={user ? "/communities/new" : "/auth"}
            className="text-muted-foreground flex flex-1 flex-col items-center gap-1 py-1.5 text-[11px] font-medium"
          >
            <Plus className="h-5 w-5" />
            Create
          </Link>
        </div>
      </nav>
    </div>
  );
}
