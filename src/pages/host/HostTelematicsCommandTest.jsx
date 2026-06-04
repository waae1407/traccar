import React from 'react';
import CommandTestWorkspace from '@/components/telematics/command-test/CommandTestWorkspace';

export default function HostTelematicsCommandTest() {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.25em] text-pink-600">Host Telematics</p>
        <h1 className="mt-2 text-3xl font-black text-gray-950">Command Test</h1>
        <p className="mt-2 text-sm text-gray-500">Search and manage command tests for devices assigned to your vehicles only.</p>
      </div>
      <CommandTestWorkspace mode="host" showHeader={false} />
    </div>
  );
}