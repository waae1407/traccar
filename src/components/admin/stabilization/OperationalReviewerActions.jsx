import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardCheck, Lock } from "lucide-react";

const DEFAULT_ACTION = {
  system_area: "operational_monitoring",
  action_type: "operational_note",
  review_status: "pending_review",
  confidence_label: "not_applicable",
  assigned_reviewer: "",
  remediation_owner: "",
  target_label: "",
  target_reference: "",
  operational_notes: "",
  export_certified: false,
  execution_locked: true,
  rollback_required: true,
};

export default function OperationalReviewerActions({ systemArea = "operational_monitoring" }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ ...DEFAULT_ACTION, system_area: systemArea });

  const { data: actions = [] } = useQuery({
    queryKey: ["operational-review-actions", systemArea],
    queryFn: () => base44.entities.OperationalReviewAction.filter({ system_area: systemArea }, "-created_date", 12),
  });

  const createAction = useMutation({
    mutationFn: (payload) => base44.entities.OperationalReviewAction.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operational-review-actions", systemArea] });
      setForm({ ...DEFAULT_ACTION, system_area: systemArea });
    },
  });

  return (
    <div className="glass rounded-2xl p-4 space-y-4">
      <div className="flex items-start gap-3">
        <ClipboardCheck className="h-5 w-5 text-primary mt-0.5" />
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold">Operational reviewer actions</p>
          <p className="text-sm text-white/55 mt-1">Assignments, confidence classifications, ownership, certification approvals, and notes only. No financial execution permissions.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Select value={form.action_type} onValueChange={(value) => setForm({ ...form, action_type: value })}>
          <SelectTrigger><SelectValue placeholder="Action" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="reviewer_assignment">Reviewer assignment</SelectItem>
            <SelectItem value="confidence_classification">Confidence classification</SelectItem>
            <SelectItem value="approval_staging">Approval staging</SelectItem>
            <SelectItem value="remediation_ownership">Remediation ownership</SelectItem>
            <SelectItem value="certification_approval">Certification approval</SelectItem>
            <SelectItem value="operational_note">Operational note</SelectItem>
          </SelectContent>
        </Select>
        <Select value={form.review_status} onValueChange={(value) => setForm({ ...form, review_status: value })}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending_review">Pending review</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="in_review">In review</SelectItem>
            <SelectItem value="staged_approval">Staged approval</SelectItem>
            <SelectItem value="certified_read_only">Certified read-only</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
          </SelectContent>
        </Select>
        <Select value={form.confidence_label} onValueChange={(value) => setForm({ ...form, confidence_label: value })}>
          <SelectTrigger><SelectValue placeholder="Confidence" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="trusted">Trusted</SelectItem>
            <SelectItem value="partially_trusted">Partially trusted</SelectItem>
            <SelectItem value="unresolved">Unresolved</SelectItem>
            <SelectItem value="excluded">Excluded</SelectItem>
            <SelectItem value="not_applicable">Not applicable</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="Assigned reviewer" value={form.assigned_reviewer} onChange={(e) => setForm({ ...form, assigned_reviewer: e.target.value })} />
        <Input placeholder="Remediation owner" value={form.remediation_owner} onChange={(e) => setForm({ ...form, remediation_owner: e.target.value })} />
        <Input placeholder="Target / export / blocker" value={form.target_label} onChange={(e) => setForm({ ...form, target_label: e.target.value })} />
        <Input className="md:col-span-3" placeholder="Reference ID or report name" value={form.target_reference} onChange={(e) => setForm({ ...form, target_reference: e.target.value })} />
        <Textarea className="md:col-span-3" placeholder="Operational notes" value={form.operational_notes} onChange={(e) => setForm({ ...form, operational_notes: e.target.value })} />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs text-white/45 flex items-center gap-2"><Lock className="h-3 w-3" /> Execution locked · rollback required · staging only</div>
        <Button onClick={() => createAction.mutate(form)} disabled={createAction.isPending}>Save reviewer action</Button>
      </div>

      <div className="space-y-2">
        {actions.map((action) => (
          <div key={action.id} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-white/70">
              <span className="font-semibold capitalize">{String(action.action_type).replaceAll("_", " ")}</span>
              <span className="text-white/35">·</span>
              <span className="capitalize">{String(action.review_status).replaceAll("_", " ")}</span>
              <span className="text-white/35">·</span>
              <span className="capitalize">{String(action.confidence_label).replaceAll("_", " ")}</span>
            </div>
            <p className="text-xs text-white/45 mt-1">{action.target_label || "General operations"} {action.assigned_reviewer ? `· Reviewer: ${action.assigned_reviewer}` : ""}</p>
          </div>
        ))}
      </div>
    </div>
  );
}