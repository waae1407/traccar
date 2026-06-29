import React, { useState, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const PRESETS = [
  { key: 'weekly', label: 'Last Week', days: 7 },
  { key: 'monthly', label: 'Last Month', days: 30 },
  { key: 'yearly', label: 'Last Year', days: 365 },
];

function formatDateInput(date) {
  if (!date) return '';
  return date.toISOString().split('T')[0];
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export default function ReportDateRangeSelector({ onChange }) {
  const [preset, setPreset] = useState('monthly');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  useEffect(() => {
    if (preset === 'custom') {
      if (customStart && customEnd) {
        onChange?.({ date_from: customStart, date_to: customEnd });
      } else {
        onChange?.({ date_from: null, date_to: null });
      }
      return;
    }
    const found = PRESETS.find(p => p.key === preset);
    if (!found) return;
    const today = new Date();
    const start = addDays(today, -found.days);
    onChange?.({ date_from: start.toISOString().split('T')[0], date_to: today.toISOString().split('T')[0] });
  }, [preset, customStart, customEnd]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => { setPreset(p.key); setCustomStart(''); setCustomEnd(''); }}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
              preset === p.key
                ? 'border-primary bg-primary/15 text-primary'
                : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary/60'
            )}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setPreset('custom')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
            preset === 'custom'
              ? 'border-primary bg-primary/15 text-primary'
              : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary/60'
          )}
        >
          Custom Range
        </button>
      </div>

      {preset === 'custom' && (
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <span className="text-muted-foreground text-xs">to</span>
          <div className="flex-1">
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      )}

      {preset !== 'custom' && (
        <p className="text-[11px] text-muted-foreground">
          {(() => {
            const found = PRESETS.find(p => p.key === preset);
            if (!found) return null;
            const today = new Date();
            const start = addDays(today, -found.days);
            return `${start.toLocaleDateString()} — ${today.toLocaleDateString()}`;
          })()}
        </p>
      )}
    </div>
  );
}