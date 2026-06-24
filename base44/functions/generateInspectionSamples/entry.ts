import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Global cache key — we store the shared sample images on a single BookingRequest
// with a special marker, OR we use a dedicated entity record.
// Simplest approach: store on a "global_samples" key in a singleton entity.
// We'll use a Vehicle record with a sentinel ID, but cleanest is just a
// dedicated lookup in BookingRequest with booking_request_id = "global_inspection_samples".
// Instead, we store them in the FIRST booking that needs them, then copy to all others.

// LOCKED GLOBAL DIRECTIVE IMAGES - NEVER REGENERATE
// These 7 instructional images are immutable and shared across all bookings
const LOCKED_DIRECTIVE_IMAGES = {
  interior_front: "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/c67386fcc_generated_image.png",
  interior_rear: "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/ee94ed70a_generated_image.png",
  exterior_front_left: "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/f0d33145f_generated_image.png",
  exterior_rear_left: "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/0e026d674_generated_image.png",
  exterior_front_right: "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/b7007e8d8_generated_image.png",
  exterior_rear_right: "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/675d53e03_generated_image.png",
  vehicle_keys: "https://pub-ec158408d4234d31a08ca1141739c206.r2.dev/uploads/imagen-1782335459976-2580l8x9nso.jpg"
};

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

    // LOCKED: Always return the immutable global directive images - no generation ever
    console.log(`[InspectionSamples] Returning locked global directive images for booking ${bookingId}`);
    
    await base44.asServiceRole.entities.BookingRequest.update(bookingId, {
      inspection_sample_images: LOCKED_DIRECTIVE_IMAGES,
    });

    return Response.json({ 
      ok: true, 
      locked: true, 
      reason: "global_directive_images_immutable",
      images: LOCKED_DIRECTIVE_IMAGES 
    });

  } catch (error) {
    console.error("[InspectionSamples] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});