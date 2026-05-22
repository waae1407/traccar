import React from "react";

function StatusPill({ value }) {
  const blocked = String(value).includes("blocked") || value === false;
  return <span className={blocked ? "text-red-300" : "text-green-300"}>{blocked ? "blocked" : "passed"}</span>;
}

export default function DryRunValidationPanel({ certification = {} }) {
  const exportFields = certification.exportCertification?.requiredFields || [];
  const audit = certification.immutableAuditCertification || {};
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <section className="glass rounded-2xl p-4">
        <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">End-to-End Validation Harness</p>
        <div className="space-y-2">
          {(certification.validationHarness || []).map((item) => (
            <div key={item.name} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3">
              <div className="flex justify-between gap-3"><p className="font-semibold text-white">{item.name}</p><StatusPill value={item.status === "passed"} /></div>
              <p className="text-xs text-white/45 mt-1">{item.evidence}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="glass rounded-2xl p-4">
        <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Exception Stress Testing</p>
        <div className="space-y-2">
          {(certification.stressTests || []).map((item) => (
            <div key={item.name} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3">
              <div className="flex justify-between gap-3"><p className="font-semibold text-white">{item.name}</p><span className="text-primary">dry-run</span></div>
              <p className="text-xs text-white/45 mt-1">{item.evidence}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="glass rounded-2xl p-4">
        <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Export Certification</p>
        <div className="grid grid-cols-2 gap-2">
          {exportFields.map((field) => <div key={field.field} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 text-sm text-white/65">{field.field}: <StatusPill value={field.present} /></div>)}
        </div>
      </section>

      <section className="glass rounded-2xl p-4">
        <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Immutable Audit Certification</p>
        <div className="grid grid-cols-2 gap-2 text-sm text-white/65">
          {Object.entries(audit).filter(([key]) => key !== "status").map(([key, value]) => <div key={key} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3">{key.replaceAll(/([A-Z])/g, " $1")}: <StatusPill value={key === "immutableWritesPerformed" ? !value : value} /></div>)}
        </div>
      </section>
    </div>
  );
}