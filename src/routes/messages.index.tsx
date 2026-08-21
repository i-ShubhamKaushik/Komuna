import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MessageCircle, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/komuna/app-shell";
import { EmptyState } from "@/components/komuna/empty-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/use-session";
import { fetchConversations, searchPeople, startDirectConversation } from "@/lib/messages";

export const Route = createFileRoute("/messages/")({
  head: () => ({
    meta: [
      { title: "Messages | Komuna" },
      {
        name: "description",
        content: "Private, real-time direct messages with other members of your Komuna spaces.",
      },
      { property: "og:title", content: "Messages | Komuna" },
      { property: "og:description", content: "Real-time direct messages on Komuna." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MessagesPage,
});

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function MessagesPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");

  const conversations = useQuery({
    queryKey: ["conversations", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchConversations(user!.id),
    refetchInterval: 20000,
  });

  const people = useQuery({
    queryKey: ["people-search", term, user?.id],
    enabled: Boolean(user?.id) && term.trim().length > 1,
    queryFn: () => searchPeople(term, user!.id),
  });

  const start = useMutation({
    mutationFn: (otherId: string) => startDirectConversation(user!.id, otherId),
    onSuccess: (id) => navigate({ to: "/messages/$id", params: { id } }),
    onError: (error: Error) => toast.error(error.message),
  });

  if (!loading && !user) {
    return (
      <AppShell>
        <EmptyState
          icon={MessageCircle}
          title="Sign in to use messages"
          description="Direct messages are private to signed-in members."
          action={
            <Button asChild variant="brand">
              <Link to="/auth">Sign in</Link>
            </Button>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Private conversations, delivered in real time.
      </p>

      <div className="relative mt-5">
        <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search people by username or name"
          className="pl-9"
        />
      </div>

      {term.trim().length > 1 ? (
        <div className="surface-panel mt-3 divide-y">
          {people.isLoading ? (
            <div className="p-4">
              <Skeleton className="h-10 w-full" />
            </div>
          ) : people.data && people.data.length > 0 ? (
            people.data.map((person) => (
              <button
                key={person.id}
                onClick={() => start.mutate(person.id)}
                disabled={start.isPending}
                className="hover:bg-accent/40 flex w-full items-center gap-3 p-3 text-left transition-colors"
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage src={person.avatar_url ?? undefined} alt="" />
                  <AvatarFallback className="text-xs">
                    {person.display_name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{person.display_name}</p>
                  <p className="text-muted-foreground truncate text-xs">@{person.username}</p>
                </div>
              </button>
            ))
          ) : (
            <p className="text-muted-foreground p-4 text-sm">No people found.</p>
          )}
        </div>
      ) : null}

      <div className="mt-5 space-y-2">
        {conversations.isLoading ? (
          <>
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </>
        ) : conversations.data && conversations.data.length > 0 ? (
          conversations.data.map((convo) => (
            <Link
              key={convo.id}
              to="/messages/$id"
              params={{ id: convo.id }}
              className="surface-panel hover:bg-accent/30 flex items-center gap-3 p-3 transition-colors"
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={convo.other?.avatar_url ?? undefined} alt="" />
                <AvatarFallback className="text-xs">
                  {(convo.other?.display_name ?? convo.title ?? "K").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold">
                    {convo.other?.display_name ?? (convo.title || "Conversation")}
                  </p>
                  <span className="text-muted-foreground ml-auto text-[11px]">
                    {timeAgo(convo.last_message_at)}
                  </span>
                </div>
                <p
                  className={
                    convo.unread
                      ? "text-foreground truncate text-xs font-medium"
                      : "text-muted-foreground truncate text-xs"
                  }
                >
                  {convo.preview}
                </p>
              </div>
              {convo.unread ? <span className="bg-primary h-2 w-2 rounded-full" /> : null}
            </Link>
          ))
        ) : (
          <EmptyState
            icon={MessageCircle}
            title="No conversations yet"
            description="Search for a member above to start your first direct message."
          />
        )}
      </div>
    </AppShell>
  );
}
