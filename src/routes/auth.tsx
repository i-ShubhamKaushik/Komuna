import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Logo } from "@/components/komuna/logo";
import { usePlatform } from "@/hooks/use-platform";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in or join — Komuna" },
      {
        name: "description",
        content: "Create your Komuna account or sign in to join communities, post and connect.",
      },
      { property: "og:title", content: "Sign in or join — Komuna" },
      { property: "og:description", content: "Create your Komuna account or sign in." },
    ],
  }),
  component: AuthPage,
});

const signupSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(24, "Username must be under 24 characters")
    .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers and underscores only"),
  displayName: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name must be under 50 characters"),
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

function AuthPage() {
  const platform = usePlatform();
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/", replace: true });
  }, [user, loading, navigate]);

  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [accepted, setAccepted] = useState(false);

  async function handleGoogle() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setBusy(false);
      toast.error("Google sign-in failed. Please try again.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/" });
  }

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    let emailToUse = loginId.trim();
    if (!emailToUse.includes("@")) {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", emailToUse)
        .maybeSingle();
      if (!data) {
        setBusy(false);
        toast.error("No account found with that username");
        return;
      }
      setBusy(false);
      toast.error("Please sign in with your email address");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: emailToUse,
      password: loginPassword,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: "/" });
  }

  async function handleSignup(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    if (!accepted) {
      toast.error("Please accept the terms to continue");
      return;
    }
    const parsed = signupSchema.safeParse({
      username: username.toLowerCase(),
      displayName,
      email,
      password,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check your details");
      return;
    }

    setBusy(true);
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .ilike("username", parsed.data.username)
      .maybeSingle();
    if (existing) {
      setBusy(false);
      toast.error("That username is already taken");
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { username: parsed.data.username, display_name: parsed.data.displayName },
      },
    });
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }

    if (data.session && data.user) {
      const { error: profileError } = await supabase.from("profiles").insert({
        id: data.user.id,
        username: parsed.data.username,
        display_name: parsed.data.displayName,
      });
      setBusy(false);
      if (profileError) {
        toast.error("Account created, but the profile could not be saved.");
        return;
      }
      navigate({ to: "/onboarding" });
      return;
    }

    setBusy(false);
    toast.error("Registration completed, but automatic sign-in failed. Please ensure 'Confirm email' is disabled in your Supabase Auth settings.");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: "var(--gradient-glow)" }}
      />
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex">
            <Logo name={platform.general.platform_name} logoUrl={platform.general.logo_url} />
          </Link>
          <p className="text-muted-foreground mt-3 text-sm">{platform.general.tagline}</p>
        </div>

        <div className="surface-panel p-6">
          <Tabs defaultValue="login">
            <TabsList className="bg-muted mb-5 grid w-full grid-cols-2">
              <TabsTrigger value="login">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="loginId">Email</Label>
                  <Input
                    id="loginId"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="username"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="loginPassword">Password</Label>
                  <Input
                    id="loginPassword"
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>
                <Button type="submit" variant="brand" className="w-full" disabled={busy}>
                  Sign in
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    placeholder="username"
                    maxLength={24}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="displayName">Name</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your full name"
                    maxLength={50}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    maxLength={255}
                    required
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="confirm">Confirm</Label>
                    <Input
                      id="confirm"
                      type="password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </div>
                <label className="text-muted-foreground flex items-start gap-2 text-xs">
                  <Checkbox
                    checked={accepted}
                    onCheckedChange={(value) => setAccepted(value === true)}
                    className="mt-0.5"
                  />
                  I accept the Terms of Service and Privacy Policy.
                </label>
                <Button type="submit" variant="brand" className="w-full" disabled={busy}>
                  Create account
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="my-5 flex items-center gap-3">
            <span className="bg-border h-px flex-1" />
            <span className="text-muted-foreground text-[11px] tracking-wider uppercase">or</span>
            <span className="bg-border h-px flex-1" />
          </div>

          <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={busy}>
            Continue with Google
          </Button>
        </div>
      </div>
    </div>
  );
}
