import React from "react";

export default function ImmutableAuditPreparationPanel({ snapshots = [] }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Immutable Audit Preparation Layer</p>
      <p className="text-sm text-white/45 mb-3">Prepared snapshot previews only — no immutable persistence or execution trace writes are enabled.</p>
      <div className="overflow-x-auto rounded-xl border border-white/[0.06] max-h-80">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03]"><tr>{["Snapshot", "Case", "Approval chain", "Trace", "Rollback snapshot", "Delta locked"].map((h) => <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-white/40">{h}</th>)}</tr></thead>
          <tbody>
            {snapshots.map((item) => (
              <tr key={item.stagedRemediationSnapshotId} className="border-t border-white/[0.05]">
                <td className="px-3 py-2 font-mono text-xs text-white/55">{item.stagedRemediationSnapshotId}</td>
                <td className="px-3 py-2 text-white/60">{item.caseId}</td>
                <td className="px-3 py-2 text-white/45">{item.approvalChainPreview}</td>
                <td className="px-3 py-2 text-white/45">{item.futureExecutionTracePlaceholder}</td>
                <td className="px-3 py-2 text-white/45">{item.rollbackSnapshotPreview}</td>
                <td className="px-3 py-2 text-primary">Prepared</td>
              </tr>
            ))}
            {snapshots.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-white/35">No audit snapshots prepared.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}