import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessagesSquare } from "lucide-react";
import { AppShell } from "@/components/komuna/app-shell";
import { PostCard } from "@/components/komuna/post-card";
import { EmptyState } from "@/components/komuna/empty-state";
import { CommentForm, CommentThread } from "@/components/komuna/comment-thread";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchComments } from "@/lib/comments";
import { fetchPost } from "@/lib/queries";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/posts/$id")({
  head: () => ({
    meta: [
      { title: "Post — Komuna" },
      {
        name: "description",
        content: "Read the full post and join the discussion with the Komuna community.",
      },
      { property: "og:title", content: "Post — Komuna" },
      {
        property: "og:description",
        content: "Read the full post and join the discussion with the Komuna community.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PostPage,
});

function PostPage() {
  const { id } = Route.useParams();
  const { user } = useSession();

  const post = useQuery({
    queryKey: ["posts", "detail", id, user?.id ?? null],
    queryFn: () => fetchPost(id, user?.id),
  });

  const comments = useQuery({
    queryKey: ["comments", id, user?.id ?? null],
    queryFn: () => fetchComments(id, user?.id),
  });

  if (post.isLoading) {
    return (
      <AppShell>
        <Skeleton className="h-40 w-full rounded-xl" />
      </AppShell>
    );
  }

  if (!post.data) {
    return (
      <AppShell>
        <EmptyState
          icon={MessagesSquare}
          title="Post not found"
          description="It may have been removed by its author or by moderators."
          action={
            <Button asChild variant="brand" size="sm">
              <Link to="/">Back to feed</Link>
            </Button>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PostCard post={post.data} userId={user?.id} />

      <section className="surface-panel mt-5 p-4">
        <h2 className="font-display text-sm font-semibold">
          Comments ({post.data.comment_count})
        </h2>

        {user ? (
          <CommentForm postId={id} userId={user.id} />
        ) : (
          <p className="text-muted-foreground mt-3 text-sm">
            <Link to="/auth" className="text-primary font-medium">
              Sign in
            </Link>{" "}
            to join the discussion.
          </p>
        )}

        <div className="mt-5">
          {comments.isLoading ? (
            <Skeleton className="h-24 w-full rounded-lg" />
          ) : comments.data && comments.data.length > 0 ? (
            <CommentThread
              postId={id}
              comments={comments.data}
              userId={user?.id}
              communityId={post.data.community_id}
            />
          ) : (
            <p className="text-muted-foreground text-sm">No comments yet — be the first.</p>
          )}
        </div>
      </section>
    </AppShell>
  );
}
