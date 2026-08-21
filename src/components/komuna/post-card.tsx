import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EyeOff, MessageSquare, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toggleReaction, type FeedPost } from "@/lib/queries";
import { ReportDialog } from "@/components/komuna/report-dialog";
import { cn } from "@/lib/utils";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

interface PostCardProps {
  post: FeedPost;
  userId?: string | null | undefined;
  showCommunity?: boolean | undefined;

}

export function PostCard({ post, userId, showCommunity = true }: PostCardProps) {
  const [revealed, setRevealed] = useState(!post.is_spoiler);
  const queryClient = useQueryClient();

  const react = useMutation({
    mutationFn: (type: "like" | "dislike") => {
      if (!userId) throw new Error("sign-in-required");
      return toggleReaction(post.id, userId, type, post.my_reaction);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posts"] }),
    onError: (error: Error) => {
      toast.error(
        error.message === "sign-in-required" ? "Sign in to react to posts" : "Could not react",
      );
    },
  });

  const initials = (post.author?.display_name || post.author?.username || "K")
    .slice(0, 2)
    .toUpperCase();

  return (
    <article className="surface-panel p-4">
      <header className="flex items-center gap-2.5">
        <Avatar className="h-8 w-8">
          <AvatarImage src={post.author?.avatar_url ?? undefined} alt="" />
          <AvatarFallback className="bg-accent text-[11px]">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 text-xs">
          <div className="flex flex-wrap items-center gap-x-1.5">
            {post.author ? (
              <Link
                to="/u/$username"
                params={{ username: post.author.username }}
                className="hover:text-primary font-semibold"
              >
                {post.author.display_name || post.author.username}
              </Link>
            ) : (
              <span className="font-semibold">Unknown</span>
            )}
            <span className="text-muted-foreground">@{post.author?.username}</span>
            <span className="text-muted-foreground">· {timeAgo(post.created_at)}</span>
          </div>
          {showCommunity && post.community ? (
            <Link
              to="/communities/$slug"
              params={{ slug: post.community.slug }}
              className="text-muted-foreground hover:text-secondary"
            >
              in {post.community.name}
            </Link>
          ) : null}
        </div>
        <div className="ml-auto flex gap-1.5">
          {post.is_nsfw ? <Badge variant="destructive">18+</Badge> : null}
          {post.type !== "text" ? (
            <Badge variant="outline" className="capitalize">
              {post.type}
            </Badge>
          ) : null}
        </div>
      </header>

      <Link to="/posts/$id" params={{ id: post.id }} className="hover:text-primary block">
        <h3 className="font-display mt-3 text-base font-semibold">{post.title}</h3>
      </Link>

      {post.body ? (
        revealed ? (
          <p className="text-muted-foreground mt-1.5 text-sm whitespace-pre-wrap">{post.body}</p>
        ) : (
          <button
            onClick={() => setRevealed(true)}
            className="bg-muted/60 text-muted-foreground hover:text-foreground mt-2 flex w-full items-center justify-center gap-2 rounded-lg py-4 text-xs font-medium"
          >
            <EyeOff className="h-4 w-4" /> Spoiler — tap to reveal
          </button>
        )
      ) : null}

      <footer className="mt-3 flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => react.mutate("like")}
          className={cn(post.my_reaction === "like" && "text-success")}
        >
          <ThumbsUp className="h-4 w-4" /> {post.likes}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => react.mutate("dislike")}
          className={cn(post.my_reaction === "dislike" && "text-destructive")}
        >
          <ThumbsDown className="h-4 w-4" /> {post.dislikes}
        </Button>
        <Link
          to="/posts/$id"
          params={{ id: post.id }}
          className="text-muted-foreground hover:text-foreground ml-2 flex items-center gap-1.5 text-xs"
        >
          <MessageSquare className="h-4 w-4" /> {post.comment_count}
        </Link>
        <div className="ml-auto">
          <ReportDialog targetType="post" targetId={post.id} communityId={post.community_id} />
        </div>
      </footer>
    </article>
  );
}
