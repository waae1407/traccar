import React from "react";

export default function ControlledActivationChecklist({ checklists = [] }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Controlled Activation Checklist</p>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        {checklists.map((item) => (
          <div key={item.module} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3">
            <p className="font-bold text-white">{item.module}</p>
            <p className="text-xs text-white/45 mt-1">Rollback: {item.rollbackStatus}</p>
            <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
              <div className="text-green-300">Completed: {item.completedItems}</div>
              <div className="text-red-300">Blocked: {item.blockedItems}</div>
              <div className="text-yellow-200">Signoffs: {item.reviewerSignoffs}</div>
              <div className="text-orange-300">Risks: {item.unresolvedRisks}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}