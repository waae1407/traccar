import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

const PLATFORM_LABEL = { instagram: "Instagram", facebook_pages: "Facebook", x: "X" };

const STATUS_STYLE = {
  published: "bg-green-500/15 text-green-400 border-green-500/30",
  failed: "bg-red-500/15 text-red-400 border-red-500/30",
  quality_check_failed: "bg-red-500/15 text-red-400 border-red-500/30",
  awaiting_approval: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  approved: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  scheduled: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  publishing: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  cancelled: "bg-muted text-muted-foreground border-border",
  draft: "bg-muted text-muted-foreground border-border",
  generated: "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

function Row({ publication, onOpen }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold">{PLATFORM_LABEL[publication.platform]}</span>
          <Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[publication.status] || STATUS_STYLE.draft}`}>
            {String(publication.status).replace(/_/g, " ")}
          </Badge>
          <span className="text-[11px] text-muted-foreground">{publication.campaign_date}</span>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-1">{String(publication.caption || "").split("\n")[0]}</p>
        {publication.last_error && <p className="text-[11px] text-red-400 mt-1">{publication.last_error}</p>}
      </div>
      {publication.post_url && (
        <a href={publication.post_url} target="_blank" rel="noreferrer" className="text-primary">
          <ExternalLink className="w-4 h-4" />
        </a>
      )}
      <Button size="sm" variant="outline" onClick={() => onOpen(publication)}>
        Open
      </Button>
    </div>
  );
}

export default function PublicationQueue({ state, onOpen }) {
  const groups = [
    { title: "Today", items: state.publications || [] },
    { title: "Awaiting approval", items: state.pending_approvals || [] },
    { title: "Failed", items: state.failed_publications || [] },
  ];

  return (
    <div className="glass rounded-2xl p-5">
      <h2 className="font-syne text-lg font-bold mb-4">Publishing control centre</h2>
      <div className="space-y-5">
        {groups.map((group) => (
          <div key={group.title}>
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              {group.title} ({group.items.length})
            </h3>
            {group.items.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing here.</p>
            ) : (
              <div className="space-y-2">
                {group.items.slice(0, 6).map((publication) => (
                  <Row key={publication.id} publication={publication} onOpen={onOpen} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}