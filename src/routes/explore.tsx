import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Compass, Search } from "lucide-react";
import { AppShell } from "@/components/komuna/app-shell";
import { CommunityCard, type CommunitySummary } from "@/components/komuna/community-card";
import { EmptyState } from "@/components/komuna/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { INTEREST_OPTIONS } from "@/lib/platform-defaults";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/explore")({
  head: () => ({
    meta: [
      { title: "Explore communities — Komuna" },
      {
        name: "description",
        content:
          "Browse and search public Komuna communities by category — gaming, anime, tech, music, sports and more.",
      },
      { property: "og:title", content: "Explore communities — Komuna" },
      {
        property: "og:description",
        content: "Browse and search public Komuna communities by category.",
      },
    ],
  }),
  component: ExplorePage,
});

function ExplorePage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const communities = useQuery({
    queryKey: ["communities", "explore", search, category],
    queryFn: async (): Promise<CommunitySummary[]> => {
      let query = supabase
        .from("communities")
        .select("id, name, slug, description, category, accent_color, member_count, visibility")
        .eq("status", "approved");
      if (category) query = query.eq("category", category);
      if (search.trim()) query = query.ilike("name", `%${search.trim()}%`);
      const { data, error } = await query.order("member_count", { ascending: false }).limit(48);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold">Explore communities</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Find your people — every interest has a home here.
        </p>
      </header>

      <div className="relative mb-4">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search communities"
          className="pl-9"
          maxLength={64}
        />
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategory(null)}
          className={cn(
            "border-border text-muted-foreground rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            !category && "border-primary bg-primary/15 text-foreground",
          )}
        >
          All
        </button>
        {INTEREST_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setCategory(option)}
            className={cn(
              "border-border text-muted-foreground rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              category === option && "border-primary bg-primary/15 text-foreground",
            )}
          >
            {option}
          </button>
        ))}
      </div>

      {communities.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : communities.data && communities.data.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {communities.data.map((community) => (
            <CommunityCard key={community.id} community={community} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Compass}
          title="No communities found"
          description="Nothing matches that yet — why not start one?"
          action={
            <Button asChild variant="brand" size="sm">
              <Link to="/communities/new">Request a community</Link>
            </Button>
          }
        />
      )}
    </AppShell>
  );
}
