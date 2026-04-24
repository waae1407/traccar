import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// The same slot definitions as the frontend — keep in sync
const PHOTO_SLOTS = [
  {
    id: "interior_front",
    aiPrompt: "Cartoon illustration showing the interior of this vehicle photographed from outside through the open driver (left) door. The camera angle looks inward diagonally showing the steering wheel on the left, dashboard ahead, driver seat in the foreground, and front passenger seat to the right. Realistic interior detail in the same cartoon illustration style as the exterior vehicle image.",
    mirrorX: false,
  },
  {
    id: "interior_rear",
    aiPrompt: "Cartoon illustration showing the interior of this vehicle photographed from outside through the open rear driver-side (left) door. The camera angle looks inward diagonally showing the full rear bench seat, center armrest with cupholders, seat belts, rear floor, and headrests. Realistic interior detail in the same cartoon illustration style as the exterior vehicle image.",
    mirrorX: false,
  },
  {
    id: "exterior_front_left",
    aiPrompt: "Cartoon illustration of this vehicle shot from the FRONT-LEFT corner. The camera is positioned at the front-left of the car. You can see: the front headlights and front bumper facing toward you on the left, and the entire LEFT side of the car (driver side) stretching away to the right. The rear of the car is NOT visible. Same cartoon style as the reference image.",
    mirrorX: false,
  },
  {
    id: "exterior_rear_left",
    aiPrompt: "Cartoon illustration of this vehicle shot from the REAR-LEFT corner. The camera is positioned at the rear-left of the car. You can see: the rear tail lights and rear bumper facing toward you on the right, and the entire LEFT side of the car (driver side) stretching away to the left. The front of the car is NOT visible. Same cartoon style as the reference image.",
    mirrorX: false,
  },
  {
    id: "exterior_front_right",
    aiPrompt: "Cartoon illustration of this vehicle shot from the FRONT-LEFT corner. The camera is positioned at the front-left of the car. You can see: the front headlights and front bumper facing toward you on the left, and the entire LEFT side of the car stretching away to the right. The rear of the car is NOT visible. Same cartoon style as the reference image.",
    mirrorX: true,
  },
  {
    id: "exterior_rear_right",
    aiPrompt: "Cartoon illustration of this vehicle shot from the REAR-LEFT corner. The camera is positioned at the rear-left of the car. You can see: the rear tail lights and rear bumper facing toward you on the right, and the entire LEFT side of the car stretching away to the left. The front of the car is NOT visible. Same cartoon style as the reference image.",
    mirrorX: true,
  },
  {
    id: "vehicle_keys",
    aiPrompt: "Cartoon illustration of this vehicle's car key fob and physical key held up in a hand in front of the car. Show the key fob and metal key clearly visible, with the cartoon-style vehicle blurred in the background. Bold, vibrant cartoon style matching the reference vehicle's color and style.",
    mirrorX: false,
  },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    // Support both direct calls and entity automation payloads
    const bookingId = body.booking_id || body.event?.entity_id || body.data?.id;
    const vehicleImage = body.vehicle_image || body.data?.vehicle_image;

    if (!bookingId) {
      return Response.json({ error: "booking_id required" }, { status: 400 });
    }

    // Fetch the booking if we don't have vehicle_image already
    let vehicleImageUrl = vehicleImage;
    if (!vehicleImageUrl) {
      const booking = await base44.asServiceRole.entities.BookingRequest.get(bookingId);
      vehicleImageUrl = booking?.vehicle_image;
    }

    if (!vehicleImageUrl) {
      console.log(`[InspectionSamples] No vehicle image for booking ${bookingId}, skipping`);
      return Response.json({ ok: true, skipped: true, reason: "no_vehicle_image" });
    }

    // Check if already generated
    const existing = await base44.asServiceRole.entities.BookingRequest.get(bookingId);
    const existingSamples = existing?.inspection_sample_images || {};
    const alreadyDone = PHOTO_SLOTS.every(s => !!existingSamples[s.id]);
    if (alreadyDone) {
      console.log(`[InspectionSamples] Already generated for booking ${bookingId}, skipping`);
      return Response.json({ ok: true, skipped: true, reason: "already_generated" });
    }

    console.log(`[InspectionSamples] Generating 6 inspection sample images for booking ${bookingId}`);

    // Generate all 6 in parallel
    const results = await Promise.allSettled(
      PHOTO_SLOTS.map(async (slot) => {
        // Skip if already exists
        if (existingSamples[slot.id]) return { id: slot.id, url: existingSamples[slot.id] };

        const result = await base44.asServiceRole.integrations.Core.GenerateImage({
          prompt: `${slot.aiPrompt} The vehicle should match the style and color of the reference image exactly.`,
          existing_image_urls: [vehicleImageUrl],
        });
        return { id: slot.id, url: result.url };
      })
    );

    // Build the images map from successful results
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

    // Save to booking
    await base44.asServiceRole.entities.BookingRequest.update(bookingId, {
      inspection_sample_images: images,
    });

    console.log(`[InspectionSamples] ✓ Saved ${successCount}/6 images for booking ${bookingId}`);
    return Response.json({ ok: true, generated: successCount, images });

  } catch (error) {
    console.error("[InspectionSamples] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});