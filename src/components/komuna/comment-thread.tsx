import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EyeOff, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ReportDialog } from "@/components/komuna/report-dialog";
import {
  createComment,
  deleteOwnComment,
  toggleCommentReaction,
  type CommentNode,
} from "@/lib/comments";
import { cn } from "@/lib/utils";

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

interface ThreadProps {
  postId: string;
  comments: CommentNode[];
  userId?: string | null | undefined;
  communityId: string;
}

export function CommentThread({ postId, comments, userId, communityId }: ThreadProps) {
  return (
    <div className="space-y-4">
      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          postId={postId}
          userId={userId}
          communityId={communityId}
          depth={0}
        />
      ))}
    </div>
  );
}

function CommentItem({
  comment,
  postId,
  userId,
  communityId,
  depth,
}: {
  comment: CommentNode;
  postId: string;
  userId?: string | null | undefined;
  communityId: string;
  depth: number;
}) {
  const [replying, setReplying] = useState(false);
  const [revealed, setRevealed] = useState(!comment.is_spoiler);
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["comments", postId] });

  const react = useMutation({
    mutationFn: (type: "like" | "dislike") => {
      if (!userId) throw new Error("sign-in-required");
      return toggleCommentReaction(comment.id, userId, type, comment.my_reaction);
    },
    onSuccess: invalidate,
    onError: (error: Error) =>
      toast.error(
        error.message === "sign-in-required" ? "Sign in to react" : "Could not react to comment",
      ),
  });

  const remove = useMutation({
    mutationFn: () => deleteOwnComment(comment.id),
    onSuccess: () => {
      toast.success("Comment deleted");
      invalidate();
    },
    onError: () => toast.error("Could not delete comment"),
  });

  const initials = (comment.author?.display_name || comment.author?.username || "K")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={cn(depth > 0 && "border-border/70 ml-4 border-l pl-4 md:ml-6")}>
      <div className="flex gap-2.5">
        <Avatar className="h-7 w-7">
          <AvatarImage src={comment.author?.avatar_url ?? undefined} alt="" />
          <AvatarFallback className="bg-accent text-[10px]">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 text-xs">
            {comment.author ? (
              <Link
                to="/u/$username"
                params={{ username: comment.author.username }}
                className="hover:text-primary font-semibold"
              >
                {comment.author.display_name || comment.author.username}
              </Link>
            ) : (
              <span className="font-semibold">Unknown</span>
            )}
            <span className="text-muted-foreground">· {timeAgo(comment.created_at)}</span>
          </div>

          {comment.is_removed ? (
            <p className="text-muted-foreground mt-1 text-sm italic">
              This comment was removed by moderators.
            </p>
          ) : revealed ? (
            <p className="mt-1 text-sm whitespace-pre-wrap">{comment.body}</p>
          ) : (
            <button
              onClick={() => setRevealed(true)}
              className="bg-muted/60 text-muted-foreground hover:text-foreground mt-1.5 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-xs font-medium"
            >
              <EyeOff className="h-3.5 w-3.5" /> Spoiler — tap to reveal
            </button>
          )}

          <div className="mt-1 flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => react.mutate("like")}
              className={cn("h-7 px-2 text-xs", comment.my_reaction === "like" && "text-success")}
            >
              <ThumbsUp className="h-3.5 w-3.5" /> {comment.likes}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => react.mutate("dislike")}
              className={cn(
                "h-7 px-2 text-xs",
                comment.my_reaction === "dislike" && "text-destructive",
              )}
            >
              <ThumbsDown className="h-3.5 w-3.5" /> {comment.dislikes}
            </Button>
            {userId ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setReplying((value) => !value)}
              >
                Reply
              </Button>
            ) : null}
            {userId === comment.author_id ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            <div className="ml-auto">
              <ReportDialog targetType="comment" targetId={comment.id} communityId={communityId} />
            </div>
          </div>

          {replying && userId ? (
            <CommentForm
              postId={postId}
              userId={userId}
              parentId={comment.id}
              onDone={() => setReplying(false)}
              compact
            />
          ) : null}
        </div>
      </div>

      {comment.replies.length > 0 ? (
        <div className="mt-3 space-y-3">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              postId={postId}
              userId={userId}
              communityId={communityId}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CommentForm({
  postId,
  userId,
  parentId,
  onDone,
  compact,
}: {
  postId: string;
  userId: string;
  parentId?: string | null;
  onDone?: () => void;
  compact?: boolean;
}) {
  const [body, setBody] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      createComment({ postId, authorId: userId, body: body.trim(), parentId: parentId ?? null }),
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["comments", postId] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      onDone?.();
    },
    onError: (error: Error) => toast.error(error.message || "Could not post your comment"),
  });

  return (
    <form
      className={cn("mt-2 space-y-2", compact && "mt-3")}
      onSubmit={(event) => {
        event.preventDefault();
        if (body.trim().length < 2) return;
        mutation.mutate();
      }}
    >
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={compact ? 2 : 3}
        placeholder={parentId ? "Write a reply…" : "Add a comment…"}
        maxLength={3000}
      />
      <div className="flex justify-end gap-2">
        {onDone ? (
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" variant="brand" size="sm" disabled={mutation.isPending}>
          {parentId ? "Reply" : "Comment"}
        </Button>
      </div>
    </form>
  );
}
