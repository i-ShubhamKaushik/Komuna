import { Link } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface CommunitySummary {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  accent_color: string;
  member_count: number;
  visibility: string;
  icon_url?: string | null;
}

export function CommunityCard({ community }: { community: CommunitySummary }) {
  return (
    <Link
      to="/communities/$slug"
      params={{ slug: community.slug }}
      className="group surface-panel hover:border-primary/50 block p-4 transition-colors"
    >
      <div className="flex items-start gap-3">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-bold"
          style={{
            background: `linear-gradient(135deg, ${community.accent_color}, color-mix(in oklch, ${community.accent_color} 40%, black))`,
            color: "white",
          }}
        >
          {community.name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="group-hover:text-primary truncate text-sm font-semibold transition-colors">
              {community.name}
            </h3>
            {community.visibility === "private" ? (
              <Badge variant="outline" className="text-[10px]">
                Private
              </Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
            {community.description || "No description yet."}
          </p>
          <div className="text-muted-foreground mt-2 flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" /> {community.member_count}
            </span>
            <span className="bg-muted rounded px-1.5 py-0.5 capitalize">{community.category}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
