import React, { useState } from 'react';
import { Loader2, LocateFixed, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function InstallerSearchControls({ query, setQuery, radius, setRadius, onSearch, onCurrentLocation, loading }) {
  const [localQuery, setLocalQuery] = useState(query || '');
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={localQuery} onChange={e => setLocalQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && onSearch(localQuery)} placeholder="Search ZIP or city/state" className="h-12 rounded-2xl border-slate-200 bg-white pl-11 text-slate-950" />
        </div>
        <select value={radius} onChange={e => setRadius(Number(e.target.value))} className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700">
          {[5, 10, 25, 50].map(miles => <option key={miles} value={miles}>{miles} miles</option>)}
        </select>
        <div className="flex gap-2">
          <Button type="button" onClick={() => { setQuery(localQuery); onSearch(localQuery); }} className="h-12 rounded-2xl bg-slate-950 font-black">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}</Button>
          <Button type="button" variant="outline" onClick={onCurrentLocation} className="h-12 rounded-2xl border-slate-200 bg-white font-black text-slate-700"><LocateFixed className="h-4 w-4" /> Use Current</Button>
        </div>
      </div>
    </div>
  );
}