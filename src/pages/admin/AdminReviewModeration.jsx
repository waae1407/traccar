import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, CheckCircle2, EyeOff, Flag, MessageSquareText } from "lucide-react";

const STATUSES = ["pending", "approved", "flagged", "hidden", "rejected"];

export default function AdminReviewModeration() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("pending");
  const [notes, setNotes] = useState({});

  const { data: reviews = [] } = useQuery({
    queryKey: ["admin-review-moderation"],
    queryFn: () => base44.entities.HostReview.list("-created_date", 500),
  });

  const filtered = useMemo(() => reviews.filter((r) => filter === "all" || r.moderation_status === filter), [reviews, filter]);

  const updateMutation = useMutation({
    mutationFn: async ({ review, moderation_status, visibility_status }) => {
      await base44.entities.HostReview.update(review.id, {
        moderation_status,
        visibility_status,
        status: visibility_status === "public" ? "published" : moderation_status,
        moderation_notes: notes[review.id] || review.moderation_notes || "",
      });
      await base44.entities.ReputationEventLog.create({
        event_type: "review_moderated",
        entity_type: "review",
        entity_id: review.id,
        host_id: review.host_id,
        vehicle_id: review.vehicle_id,
        booking_request_id: review.booking_request_id,
        source_entity: "HostReview",
        source_entity_id: review.id,
        score_impact: 0,
        subscores_affected: ["reviews", "public_visibility"],
        reason: `Review moderation set to ${moderation_status}; visibility ${visibility_status}.`,
        processed_by: "admin_review_moderation",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-review-moderation"] });
      qc.invalidateQueries({ queryKey: ["reputation-event-log"] });
    },
  });

  const actions = [
    { label: "Approve public", icon: CheckCircle2, moderation_status: "approved", visibility_status: "public", cls: "bg-emerald-500 text-white" },
    { label: "Hide", icon: EyeOff, moderation_status: "hidden", visibility_status: "hidden", cls: "bg-gray-600 text-white" },
    { label: "Flag", icon: Flag, moderation_status: "flagged", visibility_status: "hidden", cls: "bg-orange-500 text-white" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Internal only</p>
        <h1 className="text-2xl font-black text-white font-syne">Review Moderation</h1>
        <p className="text-white/40 text-sm mt-1">Approve, hide, or flag verified booking reviews before any public display.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {["all", ...STATUSES].map((status) => (
          <button key={status} onClick={() => setFilter(status)} className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${filter === status ? "bg-primary text-white border-primary" : "bg-white/[0.04] text-white/50 border-white/[0.08]"}`}>{status}</button>
        ))}
      </div>

      <div className="grid gap-3">
        {filtered.map((review) => (
          <div key={review.id} className="glass rounded-2xl border border-white/[0.08] p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="text-sm font-bold text-white">{review.vehicle_name || "Review"}</p>
                <p className="text-xs text-white/35">{review.reviewer_name} · {review.reviewer_email}</p>
              </div>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-white/[0.06] text-white/50">{review.moderation_status} · {review.visibility_status}</span>
            </div>
            <div className="grid md:grid-cols-6 gap-2 mb-3">
              {["overall_rating", "host_experience_rating", "vehicle_condition_rating", "cleanliness_rating", "communication_rating", "pickup_dropoff_rating"].map((field) => (
                <div key={field} className="rounded-xl bg-white/[0.03] p-2 border border-white/[0.06]"><p className="text-[9px] text-white/30 uppercase">{field.replace(/_rating|_/g, " ")}</p><p className="text-lg font-black text-white">{review[field] || "—"}</p></div>
              ))}
            </div>
            {review.review_text && <p className="text-sm text-white/60 mb-3">“{review.review_text}”</p>}
            {review.host_response && <p className="text-xs text-white/45 mb-3 border-l-2 border-primary/40 pl-3">Host response: {review.host_response}</p>}
            {(review.severe_dispute_flag || review.fake_review_flag) && (
              <div className="mb-3 rounded-xl bg-orange-500/10 border border-orange-500/20 p-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-300" />
                <p className="text-xs text-orange-200">Dispute-linked or suspicious review — keep hidden unless validated.</p>
              </div>
            )}
            <textarea value={notes[review.id] ?? review.moderation_notes ?? ""} onChange={(e) => setNotes({ ...notes, [review.id]: e.target.value })} placeholder="Admin notes / abusive content / off-platform request details..." className="w-full mb-3 rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 text-sm text-white outline-none" />
            <div className="flex gap-2 flex-wrap">
              {actions.map(({ label, icon: Icon, moderation_status, visibility_status, cls }) => (
                <button key={label} disabled={updateMutation.isPending} onClick={() => updateMutation.mutate({ review, moderation_status, visibility_status })} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50 ${cls}`}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="glass rounded-2xl border border-white/[0.08] p-8 text-center"><MessageSquareText className="h-8 w-8 text-white/20 mx-auto mb-2" /><p className="text-sm text-white/40">No reviews in this queue.</p></div>}
      </div>
    </div>
  );
}