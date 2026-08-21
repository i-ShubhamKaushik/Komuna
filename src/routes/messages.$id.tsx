import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessageCircle, SendHorizonal } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/komuna/app-shell";
import { EmptyState } from "@/components/komuna/empty-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { fetchConversationHeader, fetchMessages, markRead, sendMessage } from "@/lib/messages";

export const Route = createFileRoute("/messages/$id")({
  head: () => ({
    meta: [
      { title: "Conversation | Komuna" },
      {
        name: "description",
        content: "A private, real-time direct message conversation on Komuna.",
      },
      { property: "og:title", content: "Conversation | Komuna" },
      { property: "og:description", content: "Private real-time messaging on Komuna." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConversationPage,
});

function ConversationPage() {
  const { id } = Route.useParams();
  const { user, loading } = useSession();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const header = useQuery({
    queryKey: ["conversation", id, user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchConversationHeader(id, user!.id),
  });

  const messages = useQuery({
    queryKey: ["messages", id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchMessages(id),
  });

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`messages-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["messages", id] });
          void queryClient.invalidateQueries({ queryKey: ["conversations", user.id] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, user?.id, queryClient]);

  useEffect(() => {
    if (user?.id) void markRead(id, user.id);
  }, [id, user?.id, messages.data?.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.data?.length]);

  const send = useMutation({
    mutationFn: (body: string) => sendMessage(id, user!.id, body),
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({ queryKey: ["messages", id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!loading && !user) {
    return (
      <AppShell>
        <EmptyState
          icon={MessageCircle}
          title="Sign in to view this conversation"
          description="Direct messages are private to their participants."
          action={
            <Button asChild variant="brand">
              <Link to="/auth">Sign in</Link>
            </Button>
          }
        />
      </AppShell>
    );
  }

  const other = header.data?.other;

  return (
    <AppShell>
      <div className="border-border/70 flex items-center gap-3 border-b pb-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/messages" aria-label="Back to messages">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <Avatar className="h-9 w-9">
          <AvatarImage src={other?.avatar_url ?? undefined} alt="" />
          <AvatarFallback className="text-xs">
            {(other?.display_name ?? "K").slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {other?.display_name ?? header.data?.title ?? "Conversation"}
          </p>
          {other ? (
            <Link
              to="/u/$username"
              params={{ username: other.username }}
              className="text-muted-foreground text-xs hover:underline"
            >
              @{other.username}
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-4 min-h-[50vh] space-y-2">
        {messages.isLoading ? (
          <>
            <Skeleton className="h-10 w-2/3 rounded-xl" />
            <Skeleton className="ml-auto h-10 w-1/2 rounded-xl" />
          </>
        ) : messages.data && messages.data.length > 0 ? (
          messages.data.map((message) => {
            const mine = message.sender_id === user?.id;
            return (
              <div
                key={message.id}
                className={cn(
                  "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                  mine
                    ? "bg-primary text-primary-foreground ml-auto rounded-br-sm"
                    : "bg-muted text-foreground rounded-bl-sm",
                )}
              >
                <p className="break-words whitespace-pre-wrap">
                  {message.is_removed ? "Message removed" : message.body}
                </p>
                <p className="mt-1 text-[10px] opacity-60">
                  {new Date(message.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            );
          })
        ) : (
          <EmptyState
            icon={MessageCircle}
            title="No messages yet"
            description="Say hello to start the conversation."
          />
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="bg-background/95 sticky bottom-16 mt-4 flex items-center gap-2 py-2 backdrop-blur md:bottom-0"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim()) send.mutate(draft);
        }}
      >
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write a message…"
          maxLength={2000}
        />
        <Button type="submit" variant="brand" size="icon" disabled={send.isPending || !draft.trim()}>
          <SendHorizonal className="h-4 w-4" />
        </Button>
      </form>
    </AppShell>
  );
}
