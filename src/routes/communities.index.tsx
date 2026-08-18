import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { AppShell } from "@/components/komuna/app-shell";
import { CommunityCard, type CommunitySummary } from "@/components/komuna/community-card";
import { EmptyState } from "@/components/komuna/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/communities/")({
  head: () => ({
    meta: [
      { title: "My communities — Komuna" },
      {
        name: "description",
        content: "All the Komuna communities you have joined or created, in one place.",
      },
      { property: "og:title", content: "My communities — Komuna" },
      { property: "og:description", content: "The Komuna communities you belong to." },
    ],
  }),
  component: MyCommunitiesPage,
});

function MyCommunitiesPage() {
  const { user, loading } = useSession();

  const joined = useQuery({
    queryKey: ["communities", "mine", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<CommunitySummary[]> => {
      const { data, error } = await supabase
        .from("community_members")
        .select(
          "communities (id, name, slug, description, category, accent_color, member_count, visibility)",
        )
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? [])
        .map((row) => row.communities as unknown as CommunitySummary | null)
        .filter((c): c is CommunitySummary => Boolean(c));
    },
  });

  return (
    <AppShell>
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">My communities</h1>
          <p className="text-muted-foreground mt-1 text-sm">Spaces you have joined or created.</p>
        </div>
        <Button asChild variant="brand" size="sm">
          <Link to="/communities/new">New community</Link>
        </Button>
      </header>

      {!user && !loading ? (
        <EmptyState
          icon={Users}
          title="Sign in to see your communities"
          description="Once you join communities they will appear here."
          action={
            <Button asChild variant="brand" size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
          }
        />
      ) : joined.isLoading || loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : joined.data && joined.data.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {joined.data.map((community) => (
            <CommunityCard key={community.id} community={community} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Users}
          title="You haven't joined anything yet"
          description="Explore Komuna and join the communities that fit you."
          action={
            <Button asChild variant="brand" size="sm">
              <Link to="/explore">Explore communities</Link>
            </Button>
          }
        />
      )}
    </AppShell>
  );
}
