import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Compass, Flame, Sparkles, Users } from "lucide-react";
import { AppShell } from "@/components/komuna/app-shell";
import { PostCard } from "@/components/komuna/post-card";
import { CommunityCard, type CommunitySummary } from "@/components/komuna/community-card";
import { EmptyState } from "@/components/komuna/empty-state";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { fetchCommunityFeed, fetchGlobalFeed } from "@/lib/queries";
import { useSession } from "@/hooks/use-session";
import { usePlatform } from "@/hooks/use-platform";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Komuna — One platform. Every community." },
      {
        name: "description",
        content:
          "Join Komuna: discover communities, share posts, debate, recommend and connect with people who care about what you care about.",
      },
      { property: "og:title", content: "Komuna — One platform. Every community." },
      {
        property: "og:description",
        content: "Discover communities, share posts, debate and connect on Komuna.",
      },
    ],
  }),
  component: HomePage,
});

function FeedSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-36 w-full rounded-xl" />
      ))}
    </div>
  );
}

function HomePage() {
  const { user, loading } = useSession();
  const platform = usePlatform();
  const [tab, setTab] = useState("global");

  const globalFeed = useQuery({
    queryKey: ["posts", "global", user?.id ?? null],
    queryFn: () => fetchGlobalFeed(user?.id),
  });

  const myFeed = useQuery({
    queryKey: ["posts", "communities", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchCommunityFeed(user!.id),
  });

  const trending = useQuery({
    queryKey: ["communities", "trending"],
    queryFn: async (): Promise<CommunitySummary[]> => {
      const { data, error } = await supabase
        .from("communities")
        .select("id, name, slug, description, category, accent_color, member_count, visibility")
        .eq("status", "approved")
        .order("member_count", { ascending: false })
        .limit(4);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <AppShell>
      {!user && !loading ? (
        <section className="surface-panel relative mb-6 overflow-hidden p-8">
          <div
            className="pointer-events-none absolute inset-0"
            style={{ backgroundImage: "var(--gradient-glow)" }}
          />
          <div className="relative">
            <p className="text-secondary text-xs font-semibold tracking-[0.2em] uppercase">
              {platform.general.tagline}
            </p>
            <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
              Every fandom, every crew,{" "}
              <span className="brand-gradient-text">one {platform.general.platform_name}</span>.
            </h1>
            <p className="text-muted-foreground mt-3 max-w-lg text-sm">
              {platform.general.description}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild variant="brand">
                <Link to="/auth">Create your account</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/explore">Explore communities</Link>
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-surface mb-4 grid w-full grid-cols-2 sm:w-72">
          <TabsTrigger value="global">
            <Flame className="mr-1.5 h-4 w-4" /> Global
          </TabsTrigger>
          <TabsTrigger value="communities">
            <Users className="mr-1.5 h-4 w-4" /> Communities
          </TabsTrigger>
        </TabsList>

        <TabsContent value="global" className="space-y-3">
          {globalFeed.isLoading ? (
            <FeedSkeleton />
          ) : globalFeed.data && globalFeed.data.length > 0 ? (
            globalFeed.data.map((post) => <PostCard key={post.id} post={post} userId={user?.id} />)
          ) : (
            <EmptyState
              icon={Sparkles}
              title="No posts yet"
              description="Be the first — join a community and start the conversation."
              action={
                <Button asChild variant="brand" size="sm">
                  <Link to="/explore">Find a community</Link>
                </Button>
              }
            />
          )}
        </TabsContent>

        <TabsContent value="communities" className="space-y-3">
          {!user ? (
            <EmptyState
              icon={Users}
              title="Your personalized feed"
              description="Sign in to see posts from the communities you have joined."
              action={
                <Button asChild variant="brand" size="sm">
                  <Link to="/auth">Sign in</Link>
                </Button>
              }
            />
          ) : myFeed.isLoading ? (
            <FeedSkeleton />
          ) : myFeed.data && myFeed.data.length > 0 ? (
            myFeed.data.map((post) => <PostCard key={post.id} post={post} userId={user.id} />)
          ) : (
            <EmptyState
              icon={Compass}
              title="Nothing here yet"
              description="Join communities to build your personalized feed."
              action={
                <Button asChild variant="brand" size="sm">
                  <Link to="/explore">Explore</Link>
                </Button>
              }
            />
          )}
        </TabsContent>
      </Tabs>

      {trending.data && trending.data.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase">
            Trending communities
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {trending.data.map((community) => (
              <CommunityCard key={community.id} community={community} />
            ))}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
