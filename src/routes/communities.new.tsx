import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/komuna/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_SECTIONS, slugify } from "@/lib/queries";
import { INTEREST_OPTIONS } from "@/lib/platform-defaults";
import { useSession } from "@/hooks/use-session";
import { usePlatform } from "@/hooks/use-platform";

export const Route = createFileRoute("/communities/new")({
  head: () => ({
    meta: [
      { title: "Create a community — Komuna" },
      {
        name: "description",
        content: "Start a new Komuna community: pick a name, category, visibility and rules.",
      },
      { property: "og:title", content: "Create a community — Komuna" },
      { property: "og:description", content: "Start a new community on Komuna." },
    ],
  }),
  component: NewCommunityPage,
});

const schema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters").max(48),
  description: z.string().trim().min(10, "Add a short description").max(500),
  category: z.string().min(1, "Pick a category"),
  rules: z.string().trim().max(2000),
});

function NewCommunityPage() {
  const navigate = useNavigate();
  const platform = usePlatform();
  const { user, loading } = useSession();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("");
  const [rules, setRules] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isNsfw, setIsNsfw] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [user, loading, navigate]);

  // Community requests are always reviewed by a platform admin before going live.
  const requiresApproval = platform.communities.require_approval || true;


  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    const parsed = schema.safeParse({ name, description, category, rules });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check the form");
      return;
    }

    setBusy(true);
    const slug = slugify(parsed.data.name);
    const { data: community, error } = await supabase
      .from("communities")
      .insert({
        name: parsed.data.name,
        slug,
        description: parsed.data.description,
        category: parsed.data.category,
        rules: parsed.data.rules,
        owner_id: user.id,
        visibility: isPrivate ? "private" : "public",
        is_nsfw: isNsfw,
        status: "pending",
      })
      .select("id, slug, status")
      .single();

    if (error || !community) {
      setBusy(false);
      toast.error(
        error?.code === "23505"
          ? "A community with a similar name already exists."
          : "Could not create the community. Please try again.",
      );
      return;
    }

    await supabase
      .from("community_members")
      .insert({ community_id: community.id, user_id: user.id, role: "owner" });
    await supabase.from("community_sections").insert(
      DEFAULT_SECTIONS.map((section, index) => ({
        community_id: community.id,
        name: section.name,
        slug: section.slug,
        type: section.type,
        icon: section.icon,
        position: index,
        created_by: user.id,
      })),
    );

    setBusy(false);
    if (community.status === "pending") {
      toast.success("Request submitted — an admin will review it shortly.");
      navigate({ to: "/communities" });
      return;
    }
    toast.success("Community created!");
    navigate({ to: "/communities/$slug", params: { slug: community.slug } });
  }

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold">Create a community</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {requiresApproval
            ? "Your request is reviewed by a platform admin before it goes live."
            : "Your community goes live immediately."}
        </p>
      </header>

      <form onSubmit={handleSubmit} className="surface-panel space-y-5 p-6">
        <div className="space-y-1.5">
          <Label htmlFor="name">Community name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={48}
            placeholder="Anime Nights"
            required
          />
          {name ? (
            <p className="text-muted-foreground text-xs">komuna.app/communities/{slugify(name)}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="What is this community about?"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue placeholder="Pick a category" />
            </SelectTrigger>
            <SelectContent>
              {INTEREST_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rules">Rules (optional)</Label>
          <Textarea
            id="rules"
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="1. Be respectful..."
          />
        </div>

        <div className="border-border/70 flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Private community</p>
            <p className="text-muted-foreground text-xs">Members must be approved to join.</p>
          </div>
          <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
        </div>

        <div className="border-border/70 flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Age restricted (18+)</p>
            <p className="text-muted-foreground text-xs">
              Only verified adult accounts can view content.
            </p>
          </div>
          <Switch checked={isNsfw} onCheckedChange={setIsNsfw} />
        </div>

        <Button type="submit" variant="brand" className="w-full" disabled={busy}>
          {requiresApproval ? "Submit request" : "Create community"}
        </Button>
      </form>
    </AppShell>
  );
}
