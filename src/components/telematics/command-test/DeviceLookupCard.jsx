import React from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function DeviceLookupCard({ identifier, setIdentifier, onLookup, loading, error }) {
  return (
    <Card className="glass border-white/10">
      <CardContent className="p-5">
        <div className="flex flex-col gap-3 md:flex-row">
          <Input
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="Enter device ID, IMEI, provider ID, Traccar ID, or MooveTrax ID"
            className="h-12 bg-white/5 text-white placeholder:text-white/35"
            onKeyDown={(event) => event.key === 'Enter' && onLookup()}
          />
          <Button onClick={onLookup} disabled={loading || !identifier.trim()} className="h-12 min-w-36">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Find Device
          </Button>
        </div>
        {error && <p className="mt-3 text-sm font-semibold text-red-300">{error}</p>}
        <p className="mt-3 text-xs text-white/45">Search by device ID, IMEI, provider device ID, Traccar ID, or MooveTrax ID.</p>
      </CardContent>
    </Card>
  );
}