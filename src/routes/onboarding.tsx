import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Logo } from "@/components/komuna/logo";
import { INTEREST_OPTIONS } from "@/lib/platform-defaults";
import { usePlatform } from "@/hooks/use-platform";
import { useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up your profile — Komuna" },
      {
        name: "description",
        content: "Tell Komuna a little about yourself and pick the interests you want to follow.",
      },
      { property: "og:title", content: "Set up your profile — Komuna" },
      { property: "og:description", content: "Pick your interests and personalize your feed." },
    ],
  }),
  component: OnboardingPage,
});

const schema = z.object({
  display_name: z.string().trim().min(2, "Add a display name").max(48),
  bio: z.string().trim().max(280, "Bio must be under 280 characters"),
  birth_date: z.string().min(1, "Add your date of birth"),
});

function OnboardingPage() {
  const platform = usePlatform();
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [user, loading, navigate]);

  function toggleInterest(value: string) {
    setInterests((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    const parsed = schema.safeParse({ display_name: displayName, bio, birth_date: birthDate });
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
        birth_date: parsed.data.birth_date,
        interests,
        onboarded: true,
      })
      .eq("id", user.id);
    setBusy(false);
    if (error) {
      toast.error("Could not save your profile. Please try again.");
      return;
    }
    toast.success("Welcome to Komuna!");
    navigate({ to: "/explore" });
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: "var(--gradient-glow)" }}
      />
      <div className="surface-panel relative w-full max-w-lg p-6">
        <Logo name={platform.general.platform_name} logoUrl={platform.general.logo_url} />
        <h1 className="font-display mt-5 text-2xl font-bold">Set up your profile</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          This helps us personalize your feed and recommendations.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="display_name">Display name</Label>
            <Input
              id="display_name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={48}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="birth_date">Date of birth</Label>
            <Input
              id="birth_date"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              required
            />
            <p className="text-muted-foreground text-xs">
              Used only to gate age-restricted communities.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={280}
              rows={3}
              placeholder="Tell people what you're into"
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
          <Button type="submit" variant="brand" className="w-full" disabled={busy}>
            Finish setup
          </Button>
        </form>
      </div>
    </div>
  );
}
