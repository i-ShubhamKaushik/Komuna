import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/komuna/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { INTEREST_OPTIONS } from "@/lib/platform-defaults";
import { useProfile } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Account settings — Komuna" },
      {
        name: "description",
        content: "Update your Komuna display name, bio, avatar and interests.",
      },
      { property: "og:title", content: "Account settings — Komuna" },
      { property: "og:description", content: "Manage your Komuna profile and preferences." },
    ],
  }),
  component: SettingsPage,
});

const schema = z.object({
  display_name: z.string().trim().min(2, "Add a display name").max(48),
  bio: z.string().trim().max(280, "Bio must be under 280 characters"),
  avatar_url: z.string().trim().max(500).url("Enter a valid URL").or(z.literal("")),
});

function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile, isLoading, user, authLoading } = useProfile();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth", replace: true });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? "");
    setBio(profile.bio ?? "");
    setAvatarUrl(profile.avatar_url ?? "");
    setInterests(profile.interests ?? []);
  }, [profile]);

  function toggleInterest(value: string) {
    setInterests((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    const parsed = schema.safeParse({ display_name: displayName, bio, avatar_url: avatarUrl });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check your details");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: parsed.data.display_name,
        bio: parsed.data.bio,
        avatar_url: parsed.data.avatar_url || null,
        interests,
      })
      .eq("id", user.id);
    setBusy(false);
    if (error) {
      toast.error("Could not save your changes.");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["profile"] });
    toast.success("Profile updated");
  }

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">Manage your profile and preferences.</p>
      </header>

      {isLoading || authLoading ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : (
        <form onSubmit={handleSubmit} className="surface-panel space-y-5 p-6">
          <div className="space-y-1.5">
            <Label>Username</Label>
            <Input value={profile?.username ?? ""} disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="display_name">Display name</Label>
            <Input
              id="display_name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={48}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="avatar_url">Avatar URL</Label>
            <Input
              id="avatar_url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://..."
              maxLength={500}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={280}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Interests</Label>
            <div className="flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => toggleInterest(option)}
                  className={cn(
                    "border-border text-muted-foreground rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    interests.includes(option) && "border-primary bg-primary/15 text-foreground",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="brand" disabled={busy}>
              Save changes
            </Button>
            <Button type="button" variant="outline" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        </form>
      )}
    </AppShell>
  );
}
