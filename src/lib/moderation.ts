import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ReportTarget = Database["public"]["Enums"]["report_target"];
export type ReportReason = Database["public"]["Enums"]["report_reason"];
export type ReportStatus = Database["public"]["Enums"]["report_status"];
export type ModerationActionType = Database["public"]["Enums"]["moderation_action_type"];

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "nsfw", label: "NSFW" },
  { value: "hate_speech", label: "Hate Speech" },
  { value: "copyright", label: "Copyright" },
  { value: "scam", label: "Scam" },
  { value: "other", label: "Other" },
];

export const ACTION_LABELS: Record<ModerationActionType, string> = {
  warning: "Warning",
  mute: "Mute",
  ban: "Ban",
  suspension: "Suspension",
  content_removal: "Content removal",
};

export interface ReportRow {
  id: string;
  reporter_id: string;
  target_type: ReportTarget;
  target_id: string;
  community_id: string | null;
  reason: ReportReason;
  details: string;
  status: ReportStatus;
  resolution_note: string;
  created_at: string;
  community: { name: string; slug: string } | null;
}

export interface ModerationScope {
  /** Communities the signed-in user staffs. */
  communities: { id: string; name: string; slug: string }[];
  isPlatformAdmin: boolean;
}

export async function submitReport(input: {
  reporterId: string;
  targetType: ReportTarget;
  targetId: string;
  communityId?: string | null;
  reason: ReportReason;
  details?: string;
}) {
  const { error } = await supabase.from("reports").insert({
    reporter_id: input.reporterId,
    target_type: input.targetType,
    target_id: input.targetId,
    community_id: input.communityId ?? null,
    reason: input.reason,
    details: input.details?.trim() ?? "",
  });
  if (error) {
    if (error.code === "23505") throw new Error("You already reported this.");
    throw error;
  }
}

export async function fetchModerationScope(userId: string): Promise<ModerationScope> {
  const [{ data: roles }, { data: memberships }, { data: owned }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase
      .from("community_members")
      .select("role, community:communities (id, name, slug)")
      .eq("user_id", userId)
      .in("role", ["owner", "manager", "moderator"]),
    supabase.from("communities").select("id, name, slug").eq("owner_id", userId),
  ]);

  const isPlatformAdmin = (roles ?? []).some(
    (r) => r.role === "super_admin" || r.role === "platform_admin",
  );

  const map = new Map<string, { id: string; name: string; slug: string }>();
  for (const row of memberships ?? []) {
    const c = row.community as { id: string; name: string; slug: string } | null;
    if (c) map.set(c.id, c);
  }
  for (const c of owned ?? []) map.set(c.id, c);

  return { communities: [...map.values()], isPlatformAdmin };
}

export async function fetchReports(status: ReportStatus | "all"): Promise<ReportRow[]> {
  let query = supabase
    .from("reports")
    .select(
      "id, reporter_id, target_type, target_id, community_id, reason, details, status, resolution_note, created_at, community:communities (name, slug)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as ReportRow[];
}

export async function updateReportStatus(input: {
  reportId: string;
  status: ReportStatus;
  handlerId: string;
  note?: string;
}) {
  const { error } = await supabase
    .from("reports")
    .update({
      status: input.status,
      handled_by: input.handlerId,
      handled_at: new Date().toISOString(),
      resolution_note: input.note ?? "",
    })
    .eq("id", input.reportId);
  if (error) throw error;
  await writeAuditLog({
    actorId: input.handlerId,
    action: `report.${input.status}`,
    targetType: "report",
    targetId: input.reportId,
  });
}

export async function createModerationAction(input: {
  type: ModerationActionType;
  actorId: string;
  communityId: string | null;
  targetUserId?: string | null;
  targetType?: ReportTarget | null;
  targetId?: string | null;
  reportId?: string | null;
  reason: string;
  expiresAt?: string | null;
}) {
  const { error } = await supabase.from("moderation_actions").insert({
    type: input.type,
    community_id: input.communityId,
    target_user_id: input.targetUserId ?? null,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    report_id: input.reportId ?? null,
    reason: input.reason,
    expires_at: input.expiresAt ?? null,
    created_by: input.actorId,
  });
  if (error) throw error;
  await writeAuditLog({
    actorId: input.actorId,
    action: `moderation.${input.type}`,
    communityId: input.communityId,
    targetType: input.targetType ?? "user",
    targetId: input.targetId ?? input.targetUserId ?? null,
    details: { reason: input.reason, expires_at: input.expiresAt ?? null },
  });
}

/** Soft-removes a post or comment. RLS restricts this to authors and community staff. */
export async function removeContent(input: {
  actorId: string;
  targetType: "post" | "comment";
  targetId: string;
  communityId: string | null;
  reason: string;
  reportId?: string | null;
}) {
  const table = input.targetType === "post" ? "posts" : "comments";
  const { error } = await supabase.from(table).update({ is_removed: true }).eq("id", input.targetId);
  if (error) throw error;
  await createModerationAction({
    type: "content_removal",
    actorId: input.actorId,
    communityId: input.communityId,
    targetType: input.targetType,
    targetId: input.targetId,
    reportId: input.reportId ?? null,
    reason: input.reason,
  });
}

export async function fetchAuditLogs(communityId?: string | null) {
  let query = supabase
    .from("audit_logs")
    .select("id, actor_id, action, community_id, target_type, target_id, details, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (communityId) query = query.eq("community_id", communityId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchActiveActions(communityIds: string[]) {
  let query = supabase
    .from("moderation_actions")
    .select("id, type, community_id, target_user_id, reason, expires_at, is_active, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(100);
  if (communityIds.length > 0) query = query.in("community_id", communityIds);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function liftAction(actionId: string, actorId: string) {
  const { error } = await supabase
    .from("moderation_actions")
    .update({ is_active: false })
    .eq("id", actionId);
  if (error) throw error;
  await writeAuditLog({
    actorId,
    action: "moderation.lifted",
    targetType: "moderation_action",
    targetId: actionId,
  });
}

export async function writeAuditLog(input: {
  actorId: string;
  action: string;
  communityId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, unknown>;
}) {
  await supabase.from("audit_logs").insert({
    actor_id: input.actorId,
    action: input.action,
    community_id: input.communityId ?? null,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    details: (input.details ?? {}) as never,
  });
}
