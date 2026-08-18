import { useState } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/use-session";
import { REPORT_REASONS, submitReport, type ReportReason, type ReportTarget } from "@/lib/moderation";

interface ReportDialogProps {
  targetType: ReportTarget;
  targetId: string;
  communityId?: string | null | undefined;
  label?: string | undefined;
}

export function ReportDialog({ targetType, targetId, communityId, label }: ReportDialogProps) {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to report content.");
      await submitReport({
        reporterId: user.id,
        targetType,
        targetId,
        communityId: communityId ?? null,
        reason,
        details,
      });
    },
    onSuccess: () => {
      toast.success("Report sent to the moderation queue");
      setOpen(false);
      setDetails("");
    },
    onError: (error: Error) => toast.error(error.message || "Could not send report"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Report this ${targetType}`}>
          <Flag className="h-4 w-4" />
          {label ? <span className="ml-1.5">{label}</span> : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report {targetType}</DialogTitle>
          <DialogDescription>
            Reports go to this community&apos;s moderators and the platform team. Abuse of reporting
            is itself moderated.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="report-reason">Reason</Label>
            <Select value={reason} onValueChange={(value) => setReason(value as ReportReason)}>
              <SelectTrigger id="report-reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORT_REASONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-details">Details (optional)</Label>
            <Textarea
              id="report-details"
              value={details}
              maxLength={1000}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="What should moderators know?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="brand"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Sending…" : "Submit report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
