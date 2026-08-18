import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, UserRound } from "lucide-react";
import { AppShell } from "@/components/komuna/app-shell";
import { EmptyState } from "@/components/komuna/empty-state";
import { PostCard } from "@/components/komuna/post-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { fetchAuthorPosts } from "@/lib/queries";

export const Route = createFileRoute("/u/$username")({
  head: ({ params }) => ({
    meta: [
      { title: `@${params.username} — Komuna profile` },
      {
        name: "description",
        content: `See @${params.username}'s posts, interests and communities on Komuna.`,
      },
      { property: "og:title", content: `@${params.username} — Komuna profile` },
      { property: "og:description", content: `Posts and communities of @${params.username}.` },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { username } = Route.useParams();
  const { user } = useSession();

  const profile = useQuery({
    queryKey: ["profile", "username", username],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_url, interests, created_at")
        .ilike("username", username)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const posts = useQuery({
    queryKey: ["posts", "author", profile.data?.id, user?.id ?? null],
    enabled: Boolean(profile.data?.id),
    queryFn: () => fetchAuthorPosts(profile.data!.id, user?.id),
  });


  if (profile.isLoading) {
    return (
      <AppShell>
        <Skeleton className="h-36 w-full rounded-xl" />
      </AppShell>
    );
  }

  if (!profile.data) {
    return (
      <AppShell>
        <EmptyState
          icon={UserRound}
          title="Profile not found"
          description={`No Komuna member goes by @${username}.`}
          action={
            <Button asChild variant="brand" size="sm">
              <Link to="/explore">Explore communities</Link>
            </Button>
          }
        />
      </AppShell>
    );
  }

  const data = profile.data;

  return (
    <AppShell>
      <section className="surface-panel p-5">
        <div className="flex items-start gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={data.avatar_url ?? undefined} alt={data.display_name} />
            <AvatarFallback>{data.username.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-bold">{data.display_name || data.username}</h1>
            <p className="text-muted-foreground text-sm">@{data.username}</p>
            {data.bio ? <p className="mt-3 text-sm">{data.bio}</p> : null}
            <p className="text-muted-foreground mt-3 flex items-center gap-1.5 text-xs">
              <CalendarDays className="h-3.5 w-3.5" />
              Joined {new Date(data.created_at).toLocaleDateString()}
            </p>
            {data.interests?.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {data.interests.map((interest) => (
                  <Badge key={interest} variant="secondary" className="text-[10px]">
                    {interest}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="mt-5 space-y-3">
        {posts.isLoading ? (
          <Skeleton className="h-32 w-full rounded-xl" />
        ) : posts.data && posts.data.length > 0 ? (
          posts.data.map((post) => <PostCard key={post.id} post={post} userId={user?.id} />)
        ) : (
          <EmptyState icon={UserRound} title="No posts yet" />
        )}
      </div>
    </AppShell>
  );
}
