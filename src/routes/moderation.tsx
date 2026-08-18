import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/komuna/app-shell";
import { EmptyState } from "@/components/komuna/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/hooks/use-session";
import {
  ACTION_LABELS,
  createModerationAction,
  fetchActiveActions,
  fetchModerationScope,
  fetchReports,
  liftAction,
  removeContent,
  updateReportStatus,
  type ModerationActionType,
  type ReportRow,
  type ReportStatus,
} from "@/lib/moderation";

export const Route = createFileRoute("/moderation")({
  head: () => ({
    meta: [
      { title: "Moderation queue | Komuna" },
      {
        name: "description",
        content:
          "Review reports, issue warnings, mutes, bans and suspensions, and remove content — scoped to the communities you moderate.",
      },
      { property: "og:title", content: "Moderation queue | Komuna" },
      {
        property: "og:description",
        content: "Community-scoped moderation tools for Komuna staff.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ModerationPage,
});

const ACTION_TYPES: ModerationActionType[] = ["warning", "mute", "ban", "suspension"];

function ModerationPage() {
  const { user, loading } = useSession();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ReportStatus | "all">("open");

  const scope = useQuery({
    queryKey: ["moderation-scope", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchModerationScope(user!.id),
  });

  const canModerate = Boolean(
    scope.data && (scope.data.isPlatformAdmin || scope.data.communities.length > 0),
  );

  const reports = useQuery({
    queryKey: ["reports", status],
    enabled: canModerate,
    queryFn: () => fetchReports(status),
  });

  const actions = useQuery({
    queryKey: ["moderation-actions", scope.data?.communities.map((c) => c.id).join(",")],
    enabled: canModerate,
    queryFn: () =>
      fetchActiveActions(
        scope.data!.isPlatformAdmin ? [] : scope.data!.communities.map((c) => c.id),
      ),
  });

  const communityNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of scope.data?.communities ?? []) map.set(c.id, c.name);
    return map;
  }, [scope.data]);

  const resolve = useMutation({
    mutationFn: (input: { id: string; next: ReportStatus }) =>
      updateReportStatus({ reportId: input.id, status: input.next, handlerId: user!.id }),
    onSuccess: () => {
      toast.success("Report updated");
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: () => toast.error("You cannot act on this report"),
  });

  const remove = useMutation({
    mutationFn: (report: ReportRow) =>
      removeContent({
        actorId: user!.id,
        targetType: report.target_type === "comment" ? "comment" : "post",
        targetId: report.target_id,
        communityId: report.community_id,
        reason: `Report: ${report.reason}`,
        reportId: report.id,
      }),
    onSuccess: () => {
      toast.success("Content removed");
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: () => toast.error("Removal failed — you may not moderate that community"),
  });

  const lift = useMutation({
    mutationFn: (id: string) => liftAction(id, user!.id),
    onSuccess: () => {
      toast.success("Action lifted");
      queryClient.invalidateQueries({ queryKey: ["moderation-actions"] });
    },
    onError: () => toast.error("Could not lift this action"),
  });

  if (loading || scope.isLoading) {
    return (
      <AppShell>
        <p className="text-muted-foreground p-6 text-sm">Loading moderation tools…</p>
      </AppShell>
    );
  }

  if (!user || !canModerate) {
    return (
      <AppShell>
        <EmptyState
          icon={ShieldAlert}
          title="No moderation access"
          description="Only community owners, managers, moderators and platform admins can open the moderation queue."
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="font-display text-2xl font-semibold">Moderation</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {scope.data!.isPlatformAdmin
              ? "Platform admin — you can act across every community."
              : `Scoped to: ${scope.data!.communities.map((c) => c.name).join(", ")}`}
          </p>
        </header>

        <Tabs value={status} onValueChange={(value) => setStatus(value as ReportStatus | "all")}>
          <TabsList className="w-full overflow-x-auto">
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="reviewing">Reviewing</TabsTrigger>
            <TabsTrigger value="resolved">Resolved</TabsTrigger>
            <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>

        {reports.isLoading ? (
          <p className="text-muted-foreground text-sm">Loading reports…</p>
        ) : (reports.data ?? []).length === 0 ? (
          <EmptyState
            icon={ShieldAlert}
            title="Queue is clear"
            description="No reports match this filter right now."
          />
        ) : (
          <div className="space-y-3">
            {(reports.data ?? []).map((report) => (
              <ReportItem
                key={report.id}
                report={report}
                communityName={
                  report.community?.name ?? communityNames.get(report.community_id ?? "") ?? null
                }
                onStatus={(next) => resolve.mutate({ id: report.id, next })}
                onRemove={() => remove.mutate(report)}
                onAction={async (type, reason, expiresAt) => {
                  try {
                    await createModerationAction({
                      type,
                      actorId: user.id,
                      communityId: report.community_id,
                      targetType: report.target_type,
                      targetId: report.target_id,
                      reportId: report.id,
                      reason,
                      expiresAt,
                    });
                    toast.success(`${ACTION_LABELS[type]} recorded`);
                    queryClient.invalidateQueries({ queryKey: ["moderation-actions"] });
                  } catch {
                    toast.error("Not allowed in this community");
                  }
                }}
              />
            ))}
          </div>
        )}

        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">Active restrictions</h2>
          {(actions.data ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">No active warnings, mutes or bans.</p>
          ) : (
            <div className="surface-panel overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-muted-foreground text-left text-xs">
                  <tr>
                    <th className="p-3">Type</th>
                    <th className="p-3">Scope</th>
                    <th className="p-3">Reason</th>
                    <th className="p-3">Expires</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {(actions.data ?? []).map((action) => (
                    <tr key={action.id} className="border-border/60 border-t">
                      <td className="p-3 capitalize">{ACTION_LABELS[action.type]}</td>
                      <td className="p-3">
                        {action.community_id
                          ? (communityNames.get(action.community_id) ?? "Community")
                          : "Platform-wide"}
                      </td>
                      <td className="text-muted-foreground p-3">{action.reason || "—"}</td>
                      <td className="text-muted-foreground p-3">
                        {action.expires_at
                          ? new Date(action.expires_at).toLocaleDateString()
                          : "Never"}
                      </td>
                      <td className="p-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => lift.mutate(action.id)}>
                          Lift
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function ReportItem({
  report,
  communityName,
  onStatus,
  onRemove,
  onAction,
}: {
  report: ReportRow;
  communityName: string | null;
  onStatus: (next: ReportStatus) => void;
  onRemove: () => void;
  onAction: (
    type: ModerationActionType,
    reason: string,
    expiresAt: string | null,
  ) => Promise<void> | void;
}) {
  const [type, setType] = useState<ModerationActionType>("warning");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  return (
    <article className="surface-panel space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline" className="capitalize">
          {report.target_type}
        </Badge>
        <Badge variant="destructive" className="capitalize">
          {report.reason.replace("_", " ")}
        </Badge>
        <Badge variant="secondary" className="capitalize">
          {report.status}
        </Badge>
        <span className="text-muted-foreground">
          {communityName ?? "Platform"} · {new Date(report.created_at).toLocaleString()}
        </span>
      </div>

      {report.details ? <p className="text-sm">{report.details}</p> : null}
      <p className="text-muted-foreground font-mono text-xs break-all">Target: {report.target_id}</p>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => onStatus("reviewing")}>
          Reviewing
        </Button>
        <Button size="sm" variant="outline" onClick={() => onStatus("resolved")}>
          Resolve
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onStatus("dismissed")}>
          Dismiss
        </Button>
        {report.target_type === "post" || report.target_type === "comment" ? (
          <Button size="sm" variant="destructive" onClick={onRemove}>
            Remove content
          </Button>
        ) : null}
      </div>

      <div className="border-border/60 grid gap-2 border-t pt-3 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Action</Label>
          <Select value={type} onValueChange={(value) => setType(value as ModerationActionType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTION_TYPES.map((item) => (
                <SelectItem key={item} value={item}>
                  {ACTION_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">Reason</Label>
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why this action?"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Expires</Label>
          <Input
            type="date"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </div>
        <div className="sm:col-span-4">
          <Button
            size="sm"
            variant="brand"
            onClick={() =>
              onAction(type, reason, expiresAt ? new Date(expiresAt).toISOString() : null)
            }
          >
            Apply {ACTION_LABELS[type].toLowerCase()}
          </Button>
        </div>
      </div>
    </article>
  );
}
