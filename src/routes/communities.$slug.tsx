import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, MessagesSquare, Shield, Users } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/komuna/app-shell";
import { PostCard } from "@/components/komuna/post-card";
import { PostComposer } from "@/components/komuna/post-composer";
import { EmptyState } from "@/components/komuna/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { fetchSectionPosts } from "@/lib/queries";
import { useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/communities/$slug")({
  head: ({ params }) => {
    const label = params.slug.replace(/-/g, " ");
    return {
      meta: [
        { title: `${label} — Komuna community` },
        {
          name: "description",
          content: `Posts, sections and members of the ${label} community on Komuna.`,
        },
        { property: "og:title", content: `${label} — Komuna community` },
        {
          property: "og:description",
          content: `Join the ${label} community on Komuna and start posting.`,
        },
      ],
    };
  },
  component: CommunityPage,
});

interface SectionRow {
  id: string;
  name: string;
  slug: string;
  type: string;
  description: string;
}

function CommunityPage() {
  const { slug } = Route.useParams();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const community = useQuery({
    queryKey: ["community", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("communities")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data;
    },
  });

  const communityId = community.data?.id;

  const sections = useQuery({
    queryKey: ["sections", communityId],
    enabled: Boolean(communityId),
    queryFn: async (): Promise<SectionRow[]> => {
      const { data, error } = await supabase
        .from("community_sections")
        .select("id, name, slug, type, description")
        .eq("community_id", communityId!)
        .eq("is_active", true)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  const membership = useQuery({
    queryKey: ["membership", communityId, user?.id],
    enabled: Boolean(communityId && user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_members")
        .select("role")
        .eq("community_id", communityId!)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const posts = useQuery({
    queryKey: ["posts", "community", communityId, activeSection, user?.id ?? null],
    enabled: Boolean(communityId),
    queryFn: () => fetchSectionPosts(communityId!, activeSection, user?.id),
  });

  const joinMutation = useMutation({
    mutationFn: async () => {
      if (!user || !communityId) throw new Error("not-signed-in");
      if (membership.data) {
        const { error } = await supabase
          .from("community_members")
          .delete()
          .eq("community_id", communityId)
          .eq("user_id", user.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("community_members")
        .insert({ community_id: communityId, user_id: user.id, role: "member" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["membership", communityId, user?.id] });
      queryClient.invalidateQueries({ queryKey: ["community", slug] });
      queryClient.invalidateQueries({ queryKey: ["communities"] });
    },
    onError: () => toast.error("Could not update your membership."),
  });

  if (community.isLoading) {
    return (
      <AppShell>
        <Skeleton className="h-40 w-full rounded-xl" />
      </AppShell>
    );
  }

  if (!community.data) {
    return (
      <AppShell>
        <EmptyState
          icon={Users}
          title="Community not found"
          description="It may have been removed or is still awaiting approval."
          action={
            <Button asChild variant="brand" size="sm">
              <Link to="/explore">Explore communities</Link>
            </Button>
          }
        />
      </AppShell>
    );
  }

  const data = community.data;
  const isMember = Boolean(membership.data);

  return (
    <AppShell>
      <section className="surface-panel relative overflow-hidden">
        <div
          className="h-28 w-full"
          style={{
            background: `linear-gradient(120deg, ${data.accent_color}, color-mix(in oklch, ${data.accent_color} 30%, black))`,
          }}
        />
        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-bold">{data.name}</h1>
                {data.visibility === "private" ? (
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    <Lock className="h-3 w-3" /> Private
                  </Badge>
                ) : null}
                {data.is_nsfw ? (
                  <Badge variant="destructive" className="text-[10px]">
                    18+
                  </Badge>
                ) : null}
                {data.status !== "approved" ? (
                  <Badge variant="secondary" className="text-[10px] capitalize">
                    {data.status}
                  </Badge>
                ) : null}
              </div>
              <p className="text-muted-foreground mt-2 max-w-xl text-sm">{data.description}</p>
              <p className="text-muted-foreground mt-3 flex items-center gap-1.5 text-xs">
                <Users className="h-3.5 w-3.5" />
                {data.member_count} members · {data.category}
              </p>
            </div>
            {user ? (
              <Button
                variant={isMember ? "outline" : "brand"}
                size="sm"
                onClick={() => joinMutation.mutate()}
                disabled={joinMutation.isPending}
              >
                {isMember ? "Leave" : "Join community"}
              </Button>
            ) : (
              <Button asChild variant="brand" size="sm">
                <Link to="/auth">Sign in to join</Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveSection(null)}
          className={cn(
            "border-border text-muted-foreground rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            !activeSection && "border-primary bg-primary/15 text-foreground",
          )}
        >
          All posts
        </button>
        {(sections.data ?? []).map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => setActiveSection(section.id)}
            className={cn(
              "border-border text-muted-foreground rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              activeSection === section.id && "border-primary bg-primary/15 text-foreground",
            )}
          >
            {section.name}
          </button>
        ))}
      </div>

      {data.rules ? (
        <div className="surface-panel mt-5 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Shield className="text-secondary h-4 w-4" /> Community rules
          </p>
          <p className="text-muted-foreground mt-2 text-xs whitespace-pre-line">{data.rules}</p>
        </div>
      ) : null}

      {user && isMember ? (
        <div className="mt-5">
          <PostComposer
            communityId={data.id}
            userId={user.id}
            sections={(sections.data ?? []).map((section) => ({
              id: section.id,
              name: section.name,
            }))}
            defaultSectionId={activeSection}
          />
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {posts.isLoading ? (
          <>
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </>
        ) : posts.data && posts.data.length > 0 ? (
          posts.data.map((post) => (
            <PostCard key={post.id} post={post} userId={user?.id} showCommunity={false} />
          ))
        ) : (
          <EmptyState
            icon={MessagesSquare}
            title="No posts yet"
            description={
              isMember
                ? "Start the first conversation in this community."
                : "Join this community to start posting."
            }
          />
        )}
      </div>
    </AppShell>
  );
}
