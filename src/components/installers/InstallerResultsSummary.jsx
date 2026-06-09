import React from 'react';

export default function InstallerResultsSummary({ installers = [] }) {
  const total = installers.length;
  const preferred = installers.filter(installer => installer.installer_status === 'preferred').length;
  const verified = installers.filter(installer => installer.installer_status === 'verified').length;
  const listed = Math.max(0, total - preferred - verified);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xl font-black text-slate-950">{total} Installers Found</p>
        <div className="grid grid-cols-3 gap-2 text-center sm:min-w-80">
          <div className="rounded-2xl bg-emerald-50 px-3 py-2">
            <p className="text-lg font-black text-emerald-700">{verified}</p>
            <p className="text-xs font-bold text-emerald-700">Verified</p>
          </div>
          <div className="rounded-2xl bg-blue-50 px-3 py-2">
            <p className="text-lg font-black text-blue-700">{preferred}</p>
            <p className="text-xs font-bold text-blue-700">Preferred</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-3 py-2">
            <p className="text-lg font-black text-slate-700">{listed}</p>
            <p className="text-xs font-bold text-slate-700">Listed</p>
          </div>
        </div>
      </div>
    </div>
  );
}