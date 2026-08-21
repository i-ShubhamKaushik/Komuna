import { supabase } from "@/integrations/supabase/client";

export interface CommentNode {
  id: string;
  post_id: string;
  parent_id: string | null;
  author_id: string;
  body: string;
  is_spoiler: boolean;
  is_removed: boolean;
  created_at: string;
  author: { username: string; display_name: string; avatar_url: string | null } | null;
  likes: number;
  dislikes: number;
  my_reaction: "like" | "dislike" | null;
  replies: CommentNode[];
}

export async function fetchComments(
  postId: string,
  userId?: string | null,
): Promise<CommentNode[]> {
  const { data, error } = await supabase
    .from("comments")
    .select("id, post_id, parent_id, author_id, body, is_spoiler, is_removed, created_at, comment_reactions (user_id, type)")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = data ?? [];
  const authorIds = Array.from(new Set(rows.map((row) => row.author_id))).filter(Boolean);
  const authors: Record<string, CommentNode["author"]> = {};
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", authorIds);
    for (const profile of profiles ?? []) {
      authors[profile.id] = {
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
      };
    }
  }

  const nodes = new Map<string, CommentNode>();
  for (const row of rows) {
    const reactions =
      (row as unknown as { comment_reactions: { user_id: string; type: string }[] | null })
        .comment_reactions ?? [];
    nodes.set(row.id, {
      id: row.id,
      post_id: row.post_id,
      parent_id: row.parent_id,
      author_id: row.author_id,
      body: row.body,
      is_spoiler: row.is_spoiler,
      is_removed: row.is_removed,
      created_at: row.created_at,
      author: authors[row.author_id] ?? null,
      likes: reactions.filter((r) => r.type === "like").length,
      dislikes: reactions.filter((r) => r.type === "dislike").length,
      my_reaction: userId
        ? ((reactions.find((r) => r.user_id === userId)?.type as "like" | "dislike") ?? null)
        : null,
      replies: [],
    });
  }

  const roots: CommentNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent_id ? nodes.get(node.parent_id) : undefined;
    if (parent) parent.replies.push(node);
    else roots.push(node);
  }
  return roots;
}

export async function createComment(input: {
  postId: string;
  authorId: string;
  body: string;
  parentId?: string | null;
  isSpoiler?: boolean;
}) {
  const { error } = await supabase.from("comments").insert({
    post_id: input.postId,
    author_id: input.authorId,
    body: input.body,
    parent_id: input.parentId ?? null,
    is_spoiler: input.isSpoiler ?? false,
  });
  if (error) throw error;
}

export async function toggleCommentReaction(
  commentId: string,
  userId: string,
  type: "like" | "dislike",
  current: "like" | "dislike" | null,
) {
  if (current === type) {
    const { error } = await supabase
      .from("comment_reactions")
      .delete()
      .eq("comment_id", commentId)
      .eq("user_id", userId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("comment_reactions")
    .upsert({ comment_id: commentId, user_id: userId, type }, { onConflict: "comment_id,user_id" });
  if (error) throw error;
}

export async function deleteOwnComment(commentId: string) {
  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (error) throw error;
}
