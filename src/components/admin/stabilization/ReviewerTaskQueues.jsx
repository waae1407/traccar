import React from "react";

export default function ReviewerTaskQueues({ queues = [] }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Reviewer Task Management</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {queues.map((queue) => (
          <div key={queue.name} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-white">{queue.name}</p>
                <p className="text-xs text-white/40 mt-1">{queue.owner}</p>
              </div>
              <span className="text-2xl font-black text-white">{queue.count}</span>
            </div>
            <p className="text-sm text-white/55 mt-3">{queue.description}</p>
            <p className="text-xs text-primary mt-2">Non-executing review queue</p>
          </div>
        ))}
      </div>
    </div>
  );
}