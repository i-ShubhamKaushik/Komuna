import { supabase } from "@/integrations/supabase/client";

export interface ConversationSummary {
  id: string;
  is_group: boolean;
  title: string;
  last_message_at: string;
  last_read_at: string;
  other: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
  preview: string;
  unread: boolean;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  is_removed: boolean;
  created_at: string;
}

export async function fetchConversations(userId: string): Promise<ConversationSummary[]> {
  const { data: mine, error } = await supabase
    .from("conversation_participants")
    .select("conversation_id, last_read_at")
    .eq("user_id", userId);
  if (error) throw error;

  const ids = (mine ?? []).map((row) => row.conversation_id);
  if (ids.length === 0) return [];

  const [{ data: convos }, { data: participants }, { data: messages }] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, is_group, title, last_message_at")
      .in("id", ids)
      .order("last_message_at", { ascending: false }),
    supabase.from("conversation_participants").select("conversation_id, user_id").in("conversation_id", ids),
    supabase
      .from("messages")
      .select("conversation_id, body, created_at, is_removed")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false }),
  ]);

  const otherIds = Array.from(
    new Set((participants ?? []).filter((p) => p.user_id !== userId).map((p) => p.user_id)),
  );
  const profiles: Record<string, ConversationSummary["other"]> = {};
  if (otherIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", otherIds);
    for (const p of data ?? []) profiles[p.id] = p;
  }

  const lastRead = new Map((mine ?? []).map((row) => [row.conversation_id, row.last_read_at]));
  const latest = new Map<string, { body: string; created_at: string; is_removed: boolean }>();
  for (const m of messages ?? []) {
    if (!latest.has(m.conversation_id)) latest.set(m.conversation_id, m);
  }

  return (convos ?? []).map((c) => {
    const otherId = (participants ?? []).find(
      (p) => p.conversation_id === c.id && p.user_id !== userId,
    )?.user_id;
    const last = latest.get(c.id);
    const read = lastRead.get(c.id) ?? c.last_message_at;
    return {
      id: c.id,
      is_group: c.is_group,
      title: c.title,
      last_message_at: c.last_message_at,
      last_read_at: read,
      other: otherId ? (profiles[otherId] ?? null) : null,
      preview: last ? (last.is_removed ? "Message removed" : last.body) : "No messages yet",
      unread: Boolean(last && new Date(last.created_at) > new Date(read)),
    };
  });
}

export async function fetchMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_id, body, is_removed, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) throw error;
  return data ?? [];
}

export async function fetchConversationHeader(conversationId: string, userId: string) {
  const { data: convo, error } = await supabase
    .from("conversations")
    .select("id, is_group, title")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw error;
  if (!convo) return null;

  const { data: participants } = await supabase
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", conversationId);
  const otherId = (participants ?? []).find((p) => p.user_id !== userId)?.user_id;
  let other = null as {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  if (otherId) {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .eq("id", otherId)
      .maybeSingle();
    other = data ?? null;
  }
  return { ...convo, other };
}

export async function sendMessage(conversationId: string, senderId: string, body: string) {
  const trimmed = body.trim();
  if (!trimmed) return;
  const { error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: senderId, body: trimmed });
  if (error) throw error;
}

export async function markRead(conversationId: string, userId: string) {
  await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
}

/** Finds an existing 1:1 conversation with the given user, or creates one. */
export async function startDirectConversation(userId: string, otherUserId: string) {
  if (userId === otherUserId) throw new Error("You cannot message yourself");

  const { data: mine } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", userId);
  const ids = (mine ?? []).map((r) => r.conversation_id);
  if (ids.length > 0) {
    const { data: shared } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", otherUserId)
      .in("conversation_id", ids);
    const existing = shared?.[0]?.conversation_id;
    if (existing) return existing;
  }

  const { data: convo, error } = await supabase
    .from("conversations")
    .insert({ created_by: userId, is_group: false })
    .select("id")
    .single();
  if (error) throw error;

  const { error: partError } = await supabase.from("conversation_participants").insert([
    { conversation_id: convo.id, user_id: userId },
    { conversation_id: convo.id, user_id: otherUserId },
  ]);
  if (partError) throw partError;
  return convo.id;
}

export async function searchPeople(term: string, excludeId: string) {
  const q = term.trim();
  if (!q) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .neq("id", excludeId)
    .limit(10);
  if (error) throw error;
  return data ?? [];
}
