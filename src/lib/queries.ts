import { supabase } from "@/integrations/supabase/client";

export interface FeedPost {
  id: string;
  title: string;
  body: string;
  type: string;
  is_spoiler: boolean;
  is_nsfw: boolean;
  created_at: string;
  author_id: string;
  community_id: string;
  section_id: string | null;
  author: { username: string; display_name: string; avatar_url: string | null } | null;
  community: { name: string; slug: string; accent_color: string } | null;
  likes: number;
  dislikes: number;
  comment_count: number;
  my_reaction: "like" | "dislike" | null;
}

const POST_SELECT = `
  id, title, body, type, is_spoiler, is_nsfw, created_at, author_id, community_id, section_id,
  community:communities (name, slug, accent_color),
  post_reactions (user_id, type),
  comments (id)
`;

type RawPost = Record<string, unknown>;
type AuthorMap = Record<string, FeedPost["author"]>;

async function fetchAuthors(rows: RawPost[]): Promise<AuthorMap> {
  const ids = Array.from(new Set(rows.map((row) => row["author_id"] as string))).filter(Boolean);
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", ids);
  if (error) return {};
  const map: AuthorMap = {};
  for (const profile of data ?? []) {
    map[profile.id] = {
      username: profile.username,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
    };
  }
  return map;
}

function shapePost(row: RawPost, authors: AuthorMap, userId?: string | null): FeedPost {
  const reactions = (row["post_reactions"] as { user_id: string; type: string }[] | null) ?? [];
  const comments = (row["comments"] as { id: string }[] | null) ?? [];
  const authorId = row["author_id"] as string;
  return {
    id: row["id"] as string,
    title: row["title"] as string,
    body: (row["body"] as string) ?? "",
    type: (row["type"] as string) ?? "text",
    is_spoiler: Boolean(row["is_spoiler"]),
    is_nsfw: Boolean(row["is_nsfw"]),
    created_at: row["created_at"] as string,
    author_id: authorId,
    community_id: row["community_id"] as string,
    section_id: (row["section_id"] as string | null) ?? null,
    author: authors[authorId] ?? null,
    community: (row["community"] as FeedPost["community"]) ?? null,
    likes: reactions.filter((r) => r.type === "like").length,
    dislikes: reactions.filter((r) => r.type === "dislike").length,
    comment_count: comments.length,
    my_reaction: userId
      ? ((reactions.find((r) => r.user_id === userId)?.type as "like" | "dislike") ?? null)
      : null,
  };
}

async function shapePosts(rows: RawPost[], userId?: string | null): Promise<FeedPost[]> {
  const authors = await fetchAuthors(rows);
  return rows.map((row) => shapePost(row, authors, userId));
}

export async function fetchGlobalFeed(userId?: string | null): Promise<FeedPost[]> {
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return shapePosts((data ?? []) as RawPost[], userId);
}

export async function fetchCommunityFeed(userId: string): Promise<FeedPost[]> {
  const { data: memberships, error: memberError } = await supabase
    .from("community_members")
    .select("community_id")
    .eq("user_id", userId);
  if (memberError) throw memberError;
  const ids = (memberships ?? []).map((m) => m.community_id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .in("community_id", ids)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return shapePosts((data ?? []) as RawPost[], userId);
}

export async function fetchSectionPosts(
  communityId: string,
  sectionId: string | null,
  userId?: string | null,
): Promise<FeedPost[]> {
  let query = supabase.from("posts").select(POST_SELECT).eq("community_id", communityId);
  if (sectionId) query = query.eq("section_id", sectionId);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return shapePosts((data ?? []) as RawPost[], userId);
}

export async function fetchAuthorPosts(
  authorId: string,
  userId?: string | null,
): Promise<FeedPost[]> {
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("author_id", authorId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return shapePosts((data ?? []) as RawPost[], userId);
}

export async function toggleReaction(
  postId: string,
  userId: string,
  type: "like" | "dislike",
  current: "like" | "dislike" | null,
) {
  if (current === type) {
    const { error } = await supabase
      .from("post_reactions")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("post_reactions")
    .upsert({ post_id: postId, user_id: userId, type }, { onConflict: "post_id,user_id" });
  if (error) throw error;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export const DEFAULT_SECTIONS = [
  { name: "General", slug: "general", type: "discussion", icon: "MessagesSquare" },
  { name: "Recommendations", slug: "recommendations", type: "recommendation", icon: "Star" },
  { name: "Spoilers", slug: "spoilers", type: "spoiler", icon: "EyeOff" },
  { name: "Debates", slug: "debates", type: "debate", icon: "Swords" },
  { name: "Polls", slug: "polls", type: "poll", icon: "BarChart3" },
];
