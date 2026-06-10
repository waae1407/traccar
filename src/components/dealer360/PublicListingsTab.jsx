import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Globe, Eye, MessageSquare, CheckCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const fmt = (n) => n != null ? `$${Number(n).toLocaleString()}` : '—';
const STATUS_COLORS = { draft: 'bg-muted text-muted-foreground', active: 'bg-green-500/20 text-green-400', pending_sale: 'bg-yellow-500/20 text-yellow-400', sold: 'bg-purple-500/20 text-purple-400', removed: 'bg-red-500/20 text-red-400' };

export default function PublicListingsTab({ hostId, isAdmin }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [offerDrawer, setOfferDrawer] = useState(null);
  const [offerForm, setOfferForm] = useState({ offer_amount: '', message: '' });
  const [submittingOffer, setSubmittingOffer] = useState(false);

  const { data: listings = [], isLoading } = useQuery({
    queryKey: ['dealer_listings', hostId, isAdmin],
    queryFn: async () => {
      if (isAdmin) return base44.entities.DealerPublicListing.list('-created_date', 100);
      return base44.entities.DealerPublicListing.filter({ host_id: hostId });
    }
  });

  const { data: offers = [] } = useQuery({
    queryKey: ['dealer_offers', selected?.id],
    queryFn: () => base44.entities.DealerOffer.filter({ listing_id: selected?.id }),
    enabled: !!selected?.id && isAdmin,
  });

  const adminApprove = async (listingId) => {
    await base44.functions.invoke('dealer360AdminAction', { action: 'approve_listing', listing_id: listingId });
    toast({ title: 'Listing approved and published' });
    qc.invalidateQueries(['dealer_listings']);
  };

  const submitInquiry = async (listing) => {
    setSubmittingOffer(true);
    const user = await base44.auth.me();
    await base44.entities.DealerOffer.create({
      listing_id: listing.id, host_id: listing.host_id,
      buyer_user_id: user?.id, buyer_email: user?.email, buyer_name: user?.full_name,
      offer_type: offerForm.offer_amount ? 'offer' : 'inquiry',
      offer_amount: offerForm.offer_amount ? parseFloat(offerForm.offer_amount) : null,
      message: offerForm.message,
      vin: listing.vin, vehicle_label: `${listing.year} ${listing.make} ${listing.model}`,
      status: 'pending',
    });
    setSubmittingOffer(false);
    setOfferDrawer(null);
    setOfferForm({ offer_amount: '', message: '' });
    toast({ title: 'Your inquiry has been sent to the seller.' });
  };

  const respondToOffer = async (offer, responseType) => {
    await base44.functions.invoke('dealer360HostAction', { action: 'respond_to_buyer_offer', offer_id: offer.id, response_type: responseType });
    toast({ title: 'Response sent' });
    qc.invalidateQueries(['dealer_offers']);
  };

  return (
    <div className="space-y-4">
      {isLoading && <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading listings…</div>}

      {!isLoading && listings.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Globe className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No public listings yet.</p>
          <p className="text-xs mt-1">Create a sell request with the "Dealer360 Public Listing" route to get started.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {listings.map(listing => (
          <Card key={listing.id} className="bg-card/60 border-border/50 hover:border-primary/30 transition-colors cursor-pointer" onClick={() => setSelected(listing)}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-sm">{listing.year} {listing.make} {listing.model}</p>
                  <p className="text-xs text-muted-foreground">{listing.trim || ''} · {listing.mileage?.toLocaleString() || '?'} mi</p>
                </div>
                <Badge className={`text-xs ${STATUS_COLORS[listing.status]}`}>{listing.status}</Badge>
              </div>

              {listing.photos?.[0] && (
                <img src={listing.photos[0]} alt="" className="w-full h-32 object-cover rounded-lg" />
              )}

              <div className="flex items-center justify-between">
                <span className="text-xl font-bold text-primary">{fmt(listing.asking_price)}</span>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{listing.views || 0}</span>
                  <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{listing.inquiry_count || 0}</span>
                </div>
              </div>

              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="capitalize">{listing.condition}</span> · <span className="capitalize">{listing.title_status} title</span>
                {listing.location && <> · {listing.location}</>}
              </div>

              <div className="flex gap-2">
                {isAdmin && !listing.admin_approved && (
                  <Button size="sm" className="gradient-primary flex-1" onClick={(e) => { e.stopPropagation(); adminApprove(listing.id); }}>
                    <CheckCircle className="h-3 w-3 mr-1" /> Approve
                  </Button>
                )}
                {listing.status === 'active' && (
                  <Button size="sm" variant="outline" className="flex-1" onClick={(e) => { e.stopPropagation(); setOfferDrawer(listing); }}>
                    Make Offer / Inquire
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Offer/Inquiry Drawer */}
      <Sheet open={!!offerDrawer} onOpenChange={() => setOfferDrawer(null)}>
        <SheetContent className="bg-card border-border space-y-5">
          <SheetHeader>
            <SheetTitle>Inquire / Make Offer</SheetTitle>
          </SheetHeader>
          {offerDrawer && (
            <div className="space-y-4">
              <div className="rounded-xl bg-secondary/30 p-3 text-sm">
                <p className="font-semibold">{offerDrawer.year} {offerDrawer.make} {offerDrawer.model}</p>
                <p className="text-muted-foreground text-xs">Asking: {fmt(offerDrawer.asking_price)}</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Your Offer (optional — leave blank for inquiry only)</Label>
                <Input type="number" value={offerForm.offer_amount} onChange={e => setOfferForm(f => ({ ...f, offer_amount: e.target.value }))} placeholder={fmt(offerDrawer.asking_price)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Message to Seller *</Label>
                <Textarea value={offerForm.message} onChange={e => setOfferForm(f => ({ ...f, message: e.target.value }))} placeholder="Tell the seller about yourself, your interest, or any questions…" rows={4} />
              </div>
              <p className="text-xs text-muted-foreground">You must be logged in to contact the seller. Your email will be shared with the listing host.</p>
              <Button className="w-full gradient-primary" disabled={submittingOffer || !offerForm.message} onClick={() => submitInquiry(offerDrawer)}>
                {submittingOffer ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Inquiry'}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Offers on Selected Listing (host/admin) */}
      {selected && isAdmin && offers.length > 0 && (
        <div className="space-y-3 border-t border-border/50 pt-4">
          <p className="text-sm font-semibold">Offers on {selected.year} {selected.make} {selected.model}</p>
          {offers.map(o => (
            <div key={o.id} className="rounded-xl border border-border/40 bg-card/40 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{o.buyer_name || o.buyer_email}</span>
                <Badge className="text-xs capitalize">{o.status}</Badge>
              </div>
              {o.offer_amount && <p className="text-primary font-bold text-lg">{fmt(o.offer_amount)}</p>}
              {o.message && <p className="text-xs text-muted-foreground">{o.message}</p>}
              {o.status === 'pending' && (
                <div className="flex gap-2">
                  <Button size="sm" className="gradient-primary" onClick={() => respondToOffer(o, 'accept')}>Accept</Button>
                  <Button size="sm" variant="outline" onClick={() => respondToOffer(o, 'reject')}>Decline</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}