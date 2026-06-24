import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Global cache key — we store the shared sample images on a single BookingRequest
// with a special marker, OR we use a dedicated entity record.
// Simplest approach: store on a "global_samples" key in a singleton entity.
// We'll use a Vehicle record with a sentinel ID, but cleanest is just a
// dedicated lookup in BookingRequest with booking_request_id = "global_inspection_samples".
// Instead, we store them in the FIRST booking that needs them, then copy to all others.

const GLOBAL_SAMPLES_MARKER = "global_inspection_samples";

const PHOTO_SLOTS = [
  {
    id: "interior_front",
    aiPrompt: "Clear instructional illustration showing how to photograph a car interior from outside through the open driver door. Camera angle looks inward diagonally showing steering wheel, dashboard, driver seat, and front passenger seat. Simple, clean illustration style with bright lighting.",
  },
  {
    id: "interior_rear",
    aiPrompt: "Clear instructional illustration showing how to photograph a car rear interior from outside through the open rear driver-side door. Shows full rear bench seat, center armrest, seat belts, and rear floor. Simple, clean illustration style.",
  },
  {
    id: "exterior_front_left",
    aiPrompt: "Clear instructional illustration showing how to photograph the front-left corner of a generic sedan. Camera at front-left, showing front bumper/headlights and the entire left side of car. Simple flat illustration style, bright background.",
  },
  {
    id: "exterior_rear_left",
    aiPrompt: "Clear instructional illustration showing how to photograph the rear-left corner of a generic sedan. Camera at rear-left, showing rear bumper/taillights and entire left side. Simple flat illustration style, bright background.",
  },
  {
    id: "exterior_front_right",
    aiPrompt: "Clear instructional illustration showing how to photograph the front-right corner of a generic sedan. Camera at front-right, showing front bumper/headlights and entire right side. Simple flat illustration style, bright background.",
  },
  {
    id: "exterior_rear_right",
    aiPrompt: "Clear instructional illustration showing how to photograph the rear-right corner of a generic sedan. Camera at rear-right, showing rear bumper/taillights and entire right side. Simple flat illustration style, bright background.",
  },
  {
    id: "vehicle_keys",
    aiPrompt: "Clear instructional illustration showing how to photograph car keys for a rental inspection. A hand holds up a car key fob and metal key clearly visible against a plain background. Simple flat illustration style.",
  },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const bookingId = body.booking_id || body.event?.entity_id || body.data?.id;

    if (!bookingId) {
      return Response.json({ error: "booking_id required" }, { status: 400 });
    }

    // Check if this booking already has samples
    const booking = await base44.asServiceRole.entities.BookingRequest.get(bookingId);
    const existingSamples = booking?.inspection_sample_images || {};
    const alreadyDone = PHOTO_SLOTS.every(s => !!existingSamples[s.id]);
    if (alreadyDone) {
      console.log(`[InspectionSamples] Already have all samples for booking ${bookingId}, skipping`);
      return Response.json({ ok: true, skipped: true, reason: "already_generated" });
    }

    // Merge partial caches across ALL bookings — collect first available URL for each missing slot
    console.log(`[InspectionSamples] Looking for cached sample images across all bookings...`);
    const allBookings = await base44.asServiceRole.entities.BookingRequest.list("-created_date", 200);
    const mergedCache = { ...existingSamples };
    for (const b of allBookings) {
      if (b.id === bookingId) continue;
      const samples = b.inspection_sample_images || {};
      for (const slot of PHOTO_SLOTS) {
        if (!mergedCache[slot.id] && samples[slot.id]) {
          mergedCache[slot.id] = samples[slot.id];
        }
      }
    }

    const stillMissing = PHOTO_SLOTS.filter(s => !mergedCache[s.id]);
    if (stillMissing.length === 0) {
      // All slots resolved from cache — save and return
      console.log(`[InspectionSamples] All slots resolved from cross-booking cache merge`);
      await base44.asServiceRole.entities.BookingRequest.update(bookingId, {
        inspection_sample_images: mergedCache,
      });
      return Response.json({ ok: true, reused: true, images: mergedCache });
    }

    // Save the merged cache so far (partial), then generate only still-missing slots
    if (Object.keys(mergedCache).length > Object.keys(existingSamples).length) {
      await base44.asServiceRole.entities.BookingRequest.update(bookingId, {
        inspection_sample_images: mergedCache,
      });
    }

    const slotsToGenerate = stillMissing;
    console.log(`[InspectionSamples] Generating ${slotsToGenerate.length} missing slot(s): ${slotsToGenerate.map(s => s.id).join(', ')}`);

    const results = await Promise.allSettled(
      slotsToGenerate.map(async (slot) => {
        const { data: result } = await base44.asServiceRole.functions.invoke('generateImage', {
          prompt: slot.aiPrompt,
        });
        return { id: slot.id, url: result.url };
      })
    );

    // Merge existing + newly generated
    const images = { ...existingSamples };
    let successCount = 0;
    for (const result of results) {
      if (result.status === "fulfilled" && result.value?.url) {
        images[result.value.id] = result.value.url;
        successCount++;
      } else if (result.status === "rejected") {
        console.error(`[InspectionSamples] Slot generation failed:`, result.reason);
      }
    }

    await base44.asServiceRole.entities.BookingRequest.update(bookingId, {
      inspection_sample_images: images,
    });

    console.log(`[InspectionSamples] ✓ Generated ${successCount}/7 global sample images, saved to booking ${bookingId}`);
    return Response.json({ ok: true, generated: successCount, images });

  } catch (error) {
    console.error("[InspectionSamples] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});