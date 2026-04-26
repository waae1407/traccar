import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SLOT_LABELS = [
  "Interior Front (Driver Side)",
  "Interior Rear (Driver Side)",
  "Front Left Corner (Driver Side)",
  "Rear Left Corner (Driver Side)",
  "Front Right Corner (Passenger Side)",
  "Rear Right Corner (Passenger Side)",
  "Vehicle Keys",
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { booking_request_id, inspection_type } = body;
    // inspection_type: "pickup" | "dropoff"

    if (!booking_request_id || !inspection_type) {
      return Response.json({ error: "Missing booking_request_id or inspection_type" }, { status: 400 });
    }

    const booking = await base44.asServiceRole.entities.BookingRequest.get(booking_request_id);
    if (!booking) {
      return Response.json({ error: "Booking not found" }, { status: 404 });
    }

    // Build vehicle label from vehicle_name (BookingRequest field) with optional vehicle lookup for color
    let vehicleLabel = booking.vehicle_name || "the rental vehicle";
    if (booking.vehicle_id) {
      try {
        const vehicle = await base44.asServiceRole.entities.Vehicle.get(booking.vehicle_id);
        if (vehicle) {
          vehicleLabel = `the ${vehicle.year || ""} ${vehicle.make || ""} ${vehicle.model || ""} (${vehicle.color || "unknown color"})`.replace(/\s+/g, " ").trim();
        }
      } catch { /* use vehicle_name fallback */ }
    }
    const photos = inspection_type === "pickup"
      ? (booking.pickup_photos || [])
      : (booking.return_exterior_photos || []);

    if (!photos.length) {
      return Response.json({ error: "No photos to inspect" }, { status: 400 });
    }

    // ── PASS 1: Vehicle Identity Verification ────────────────────────────────
    console.log(`Pass 1: Verifying ${photos.length} ${inspection_type} photos are of ${vehicleLabel}`);

    const identityPrompt = `You are a vehicle photo fraud detector for a car rental company.

The renter is supposed to submit photos of ${vehicleLabel}.

Review each of the ${photos.length} photos provided and determine:
1. Is each photo actually showing a vehicle (not a room, person, wall, random object, etc.)?
2. Does each vehicle photo appear to match ${vehicleLabel} in terms of vehicle type, size, color?

Return a JSON object with this exact structure:
{
  "all_valid": true or false,
  "invalid_slots": [list of 0-based indices of photos that fail],
  "rejection_messages": {
    "0": "message for slot 0 if invalid",
    "2": "message for slot 2 if invalid"
  },
  "summary": "brief overall summary"
}

For rejection_messages, write naturally like: "Photo {n} does not appear to show ${vehicleLabel} — it looks like [what it actually shows]. Please retake this photo of ${vehicleLabel}."

Be strict. If a photo is clearly not of the subject vehicle, flag it.`;

    const identityResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: identityPrompt,
      file_urls: photos,
      model: "claude_sonnet_4_6",
      response_json_schema: {
        type: "object",
        properties: {
          all_valid: { type: "boolean" },
          invalid_slots: { type: "array", items: { type: "number" } },
          rejection_messages: { type: "object" },
          summary: { type: "string" },
        },
      },
    });

    console.log("Pass 1 result:", JSON.stringify(identityResult));

    if (!identityResult.all_valid && identityResult.invalid_slots?.length > 0) {
      // Build slot-specific feedback for the customer
      const slotFeedback = identityResult.invalid_slots.map((idx) => ({
        slot_index: idx,
        slot_label: SLOT_LABELS[idx] || `Photo ${idx + 1}`,
        message: identityResult.rejection_messages?.[String(idx)] ||
          `Photo ${idx + 1} does not appear to show ${vehicleLabel}. Please retake this photo of ${vehicleLabel}.`,
      }));

      // Reset the photos and notify customer to resubmit
      const resetField = inspection_type === "pickup"
        ? { pickup_photos: [], pickup_submitted_at: null, pickup_location_label: null, pickup_location_lat: null, pickup_location_lon: null }
        : { return_exterior_photos: [], dropoff_submitted_at: null, dropoff_location_label: null, dropoff_location_lat: null, dropoff_location_lon: null, clean_return_status: "not_returned" };

      await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
        ...resetField,
        booking_status: inspection_type === "dropoff" ? booking.booking_status : booking.booking_status, // keep status
        admin_notes: `[AI Fraud Detection] ${inspection_type} photo submission rejected: ${identityResult.summary}`,
      });

      // Notify customer
      const slotMessages = slotFeedback.map((s) => `• ${s.slot_label}: ${s.message}`).join("\n");
      await base44.asServiceRole.entities.Notification.create({
        user_email: booking.user_email,
        title: `⚠️ ${inspection_type === "pickup" ? "Pickup" : "Drop-off"} Photos Rejected — Please Retake`,
        body: `Your ${inspection_type} photos could not be verified for ${vehicleLabel}.\n\n${slotMessages}\n\nPlease retake the flagged photos and resubmit.`,
        type: "alert",
        booking_request_id,
      });

      // Alert admin
      await base44.asServiceRole.entities.Notification.create({
        user_email: booking.company_id ? undefined : "admin",
        title: `🚨 Possible Fraud: ${booking.customer_full_name} — ${inspection_type} photos rejected`,
        body: `AI detected that ${inspection_type} photos submitted by ${booking.customer_full_name} for ${vehicleLabel} may not be of the correct vehicle. Booking: ${booking_request_id}\n\nSummary: ${identityResult.summary}`,
        type: "alert",
        booking_request_id,
      });

      return Response.json({
        pass: "identity_check",
        result: "rejected",
        slot_feedback: slotFeedback,
        summary: identityResult.summary,
      });
    }

    // ── PASS 2: Damage Comparison (dropoff only) ─────────────────────────────
    if (inspection_type === "dropoff") {
      const pickupPhotos = booking.pickup_photos || [];
      if (!pickupPhotos.length) {
        console.log("No pickup photos to compare against — skipping damage check, auto-completing.");
        await _completeRental(base44, booking, booking_request_id);
        return Response.json({ pass: "damage_check", result: "auto_completed", reason: "no_pickup_reference" });
      }

      console.log("Pass 2: Comparing dropoff photos vs pickup photos for damage...");

      const damagePrompt = `You are an AI vehicle damage inspector for a car rental company.

The vehicle is ${vehicleLabel}.

You are given two sets of photos:
- First ${pickupPhotos.length} images: PICKUP photos (reference state when customer took the vehicle)
- Next ${photos.length} images: DROP-OFF photos (current state when customer returned the vehicle)

Both sets follow the same slot order:
${SLOT_LABELS.map((l, i) => `Slot ${i + 1}: ${l}`).join("\n")}

Compare each corresponding slot carefully. Look for:
- New scratches, dents, dings, cracks, or chips
- Stains, burns, or tears on interior
- Missing items (e.g. keys not present in keys photo)
- Any significant new damage not visible at pickup

Return a JSON object:
{
  "damage_detected": true or false,
  "damage_findings": [
    {
      "slot_index": 0,
      "slot_label": "Interior Front (Driver Side)",
      "finding": "description of damage found"
    }
  ],
  "clean_return": true or false,
  "summary": "overall assessment in 2-3 sentences"
}

If no damage is found, set damage_detected to false and clean_return to true.
Be objective and thorough.`;

      const allPhotoUrls = [...pickupPhotos, ...photos];

      const damageResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: damagePrompt,
        file_urls: allPhotoUrls,
        model: "claude_sonnet_4_6",
        response_json_schema: {
          type: "object",
          properties: {
            damage_detected: { type: "boolean" },
            damage_findings: { type: "array", items: { type: "object" } },
            clean_return: { type: "boolean" },
            summary: { type: "string" },
          },
        },
      });

      console.log("Pass 2 result:", JSON.stringify(damageResult));

      if (damageResult.damage_detected) {
        // Flag for admin review
        const findingsText = (damageResult.damage_findings || []).map((f) => `• ${f.slot_label}: ${f.finding}`).join("\n");

        await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
          clean_return_status: "not_clean",
          booking_status: "pending_review",
          pending_review_alert_active: true,
          viewed_by_admin: false,
          admin_notes: `[AI Damage Report]\n${damageResult.summary}\n\nFindings:\n${findingsText}`,
        });

        await base44.asServiceRole.entities.Notification.create({
          user_email: booking.user_email,
          title: "⚠️ Vehicle Damage Detected — Under Review",
          body: `Our AI inspection detected possible damage on ${vehicleLabel} during your drop-off. Our team is reviewing the photos and will follow up with you shortly.\n\nFindings:\n${findingsText}`,
          type: "alert",
          booking_request_id,
        });

        return Response.json({
          pass: "damage_check",
          result: "damage_flagged",
          findings: damageResult.damage_findings,
          summary: damageResult.summary,
        });

      } else {
        // Clean return — auto complete rental
        await _completeRental(base44, booking, booking_request_id);
        return Response.json({ pass: "damage_check", result: "auto_completed", summary: damageResult.summary });
      }
    }

    // Pickup pass 1 passed — all good
    return Response.json({ pass: "identity_check", result: "passed" });

  } catch (error) {
    console.error("aiInspectPhotos error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function _completeRental(base44, booking, booking_request_id) {
  await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
    booking_status: "completed",
    clean_return_status: "approved_clean",
    rental_ended_at: new Date().toISOString(),
    rental_ended_by: "ai_inspection",
    autopay_enabled: false,
  });

  // Set vehicle to Out of Service
  if (booking.vehicle_id) {
    await base44.asServiceRole.entities.Vehicle.update(booking.vehicle_id, { status: "Out of Service" });
  }

  await base44.asServiceRole.entities.Notification.create({
    user_email: booking.user_email,
    title: "✅ Rental Completed — Clean Return Confirmed",
    body: `Our AI inspection confirmed a clean return of ${booking.vehicle_name}. Your rental is now complete. Thank you for renting with uRide!`,
    type: "booking",
    booking_request_id,
  });
}