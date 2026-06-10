/**
 * dealer360HostAction
 *
 * Host-side actions for Dealer360:
 *   accept_uride_offer     — host accepts uRide direct purchase offer
 *   reject_uride_offer     — host declines
 *   submit_offer_response  — host responds to buyer offer on public listing
 *   submit_ai_valuation    — host triggers AI valuation on their sell request
 *   create_public_listing  — host creates a public listing from a sell request
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action } = body;
    const now = new Date().toISOString();

    if (action === 'accept_uride_offer') {
      const { sell_request_id } = body;
      const sells = await base44.asServiceRole.entities.DealerSellRequest.filter({ id: sell_request_id });
      const sr = sells[0];
      if (!sr) return Response.json({ error: 'Not found' }, { status: 404 });
      if (sr.host_id !== user.id && sr.host_email !== user.email && user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }

      await base44.asServiceRole.entities.DealerSellRequest.update(sell_request_id, {
        uride_offer_status: 'accepted',
        host_accepted_at: now,
        status: 'accepted',
        activity_log: [...(sr.activity_log || []), { action: 'uride_offer_accepted', actor: user.email, note: `Host accepted offer of $${sr.uride_offer_amount}`, at: now }],
      });

      await base44.asServiceRole.entities.Notification.create({
        user_email: 'admin',
        title: `✅ Host Accepted uRide Direct Offer`,
        body: `${sr.host_email} accepted the $${sr.uride_offer_amount} offer for ${sr.year} ${sr.make} ${sr.model} (VIN: ${sr.vin}). Ready to proceed with purchase agreement.`,
        type: 'payment',
      });

      return Response.json({ ok: true });
    }

    if (action === 'reject_uride_offer') {
      const { sell_request_id } = body;
      const sells = await base44.asServiceRole.entities.DealerSellRequest.filter({ id: sell_request_id });
      const sr = sells[0];
      if (!sr) return Response.json({ error: 'Not found' }, { status: 404 });
      if (sr.host_id !== user.id && sr.host_email !== user.email && user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }

      await base44.asServiceRole.entities.DealerSellRequest.update(sell_request_id, {
        uride_offer_status: 'rejected',
        status: 'submitted',
        activity_log: [...(sr.activity_log || []), { action: 'uride_offer_rejected', actor: user.email, note: 'Host declined uRide direct offer', at: now }],
      });

      return Response.json({ ok: true });
    }

    if (action === 'respond_to_buyer_offer') {
      const { offer_id, response_type, counter_amount, host_response } = body;
      const offers = await base44.asServiceRole.entities.DealerOffer.filter({ id: offer_id });
      const offer = offers[0];
      if (!offer) return Response.json({ error: 'Not found' }, { status: 404 });

      // Verify host owns this listing
      const listings = await base44.asServiceRole.entities.DealerPublicListing.filter({ id: offer.listing_id });
      const listing = listings[0];
      if (!listing) return Response.json({ error: 'Listing not found' }, { status: 404 });
      if (listing.host_id !== user.id && user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }

      const newStatus = response_type === 'accept' ? 'accepted' : response_type === 'counter' ? 'countered' : 'rejected';

      await base44.asServiceRole.entities.DealerOffer.update(offer_id, {
        status: newStatus,
        counter_amount: counter_amount || null,
        host_response: host_response || '',
        responded_at: now,
      });

      await base44.asServiceRole.entities.Notification.create({
        user_email: offer.buyer_email,
        title: `Dealer360 Offer Update — ${offer.vehicle_label}`,
        body: newStatus === 'accepted'
          ? `Your offer of $${offer.offer_amount} was accepted! The seller will contact you to complete the transaction.`
          : newStatus === 'countered'
          ? `The seller countered your offer with $${counter_amount}. Check Dealer360 to respond.`
          : `Your offer on ${offer.vehicle_label} was not accepted.`,
        type: 'payment',
      });

      return Response.json({ ok: true, status: newStatus });
    }

    if (action === 'create_public_listing') {
      const { sell_request_id, asking_price, description, color } = body;
      const sells = await base44.asServiceRole.entities.DealerSellRequest.filter({ id: sell_request_id });
      const sr = sells[0];
      if (!sr) return Response.json({ error: 'Not found' }, { status: 404 });
      if (sr.host_id !== user.id && sr.host_email !== user.email && user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }

      // Check for existing listing
      const existing = await base44.asServiceRole.entities.DealerPublicListing.filter({ sell_request_id });
      if (existing.length) return Response.json({ error: 'Listing already exists for this sell request', listing_id: existing[0].id }, { status: 409 });

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 60);

      const listing = await base44.asServiceRole.entities.DealerPublicListing.create({
        host_id: sr.host_id,
        host_name: sr.host_name || sr.host_email,
        sell_request_id,
        vin: sr.vin,
        year: sr.year,
        make: sr.make,
        model: sr.model,
        trim: sr.trim,
        mileage: sr.mileage,
        color,
        condition: sr.condition,
        condition_notes: sr.condition_notes,
        title_status: sr.title_status,
        asking_price,
        location: sr.location,
        photos: sr.photos || [],
        description,
        status: 'draft',
        admin_approved: false,
        expires_at: expiresAt.toISOString(),
      });

      await base44.asServiceRole.entities.DealerSellRequest.update(sell_request_id, {
        listing_id: listing.id,
        status: 'listed',
        activity_log: [...(sr.activity_log || []), { action: 'public_listing_created', actor: user.email, note: `Listing created — asking $${asking_price}`, at: now }],
      });

      // Notify admin to approve
      await base44.asServiceRole.entities.Notification.create({
        user_email: 'admin',
        title: '📋 Dealer360 Public Listing Pending Approval',
        body: `${sr.host_email} created a public listing for ${sr.year} ${sr.make} ${sr.model} (VIN: ${sr.vin}) at $${asking_price}. Needs admin approval.`,
        type: 'booking',
      });

      return Response.json({ ok: true, listing_id: listing.id });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });

  } catch (error) {
    console.error('[dealer360HostAction]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});