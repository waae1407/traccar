import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { doc_url, doc_type, vehicle_vin, host_id, vehicle_id, compliance_id } = await req.json();

    if (!doc_url || !doc_type) {
      return Response.json({ error: 'doc_url and doc_type are required' }, { status: 400 });
    }

    // Ask AI to read the document and extract key info
    const prompt = `You are a compliance document reader for a vehicle rental platform.

Analyze this ${doc_type} document image/PDF and extract the following information:

1. expiry_date: The expiration/renewal date of the document (format: YYYY-MM-DD). Look for "Expires", "Expiration Date", "Valid Until", "Renewal Date", "Policy Period End", "Effective Through", etc.
2. vin: Any Vehicle Identification Number found (17-character alphanumeric string). May appear as "VIN", "Vehicle Identification Number", "VIN No.", etc.
3. policy_number: Insurance policy number or registration number if present.
4. insured_name: Name of insured or registered owner.
5. confidence: Your confidence level in the extraction: "high", "medium", or "low"
6. needs_review: true if the document is unclear, expired already, VIN doesn't match, or you cannot confidently extract the expiry date. false if everything looks valid.
7. review_notes: Brief explanation if needs_review is true, otherwise null.
8. document_valid: true if this appears to be a legitimate ${doc_type} document, false if it looks wrong or unrelated.

${vehicle_vin ? `The vehicle's VIN on file is: ${vehicle_vin}. Flag if the document VIN doesn't match.` : ""}

Be strict about document validity. If you cannot read an expiry date with reasonable confidence, set needs_review to true.`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      file_urls: [doc_url],
      response_json_schema: {
        type: "object",
        properties: {
          expiry_date: { type: "string" },
          vin: { type: "string" },
          policy_number: { type: "string" },
          insured_name: { type: "string" },
          confidence: { type: "string" },
          needs_review: { type: "boolean" },
          review_notes: { type: "string" },
          document_valid: { type: "boolean" },
        }
      }
    });

    // Update the compliance record with AI-extracted data
    if (compliance_id) {
      const updateData = {
        status: result.needs_review ? "pending_review" : "valid",
        verified_by_admin: false,
        notes: result.review_notes || null,
      };

      if (result.expiry_date) {
        updateData.expiry_date = result.expiry_date;
        // Check if already expiring soon
        const today = new Date();
        const in30Days = new Date(today);
        in30Days.setDate(in30Days.getDate() + 30);
        const expiryDate = new Date(result.expiry_date);
        if (expiryDate < today) {
          updateData.status = "expired";
        } else if (expiryDate <= in30Days) {
          updateData.status = "expiring_soon";
        } else if (!result.needs_review) {
          updateData.status = "valid";
        }
      }

      await base44.asServiceRole.entities.HostVehicleCompliance.update(compliance_id, updateData);

      // If insurance AND registration are now valid, approve the vehicle
      if (!result.needs_review && result.document_valid && vehicle_id) {
        const allDocs = await base44.asServiceRole.entities.HostVehicleCompliance.filter({ vehicle_id });
        const hasValidInsurance = allDocs.some(d => d.doc_type === "insurance" && (d.status === "valid" || d.status === "expiring_soon"));
        const hasValidRegistration = allDocs.some(d => d.doc_type === "registration" && (d.status === "valid" || d.status === "expiring_soon"));

        if (hasValidInsurance && hasValidRegistration) {
          const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: vehicle_id });
          const vehicle = vehicles[0];
          if (vehicle && vehicle.approval_status === "pending") {
            await base44.asServiceRole.entities.Vehicle.update(vehicle_id, { approval_status: "approved", status: "Available" });

            // Notify host
            const hosts = await base44.asServiceRole.entities.Host.filter({ id: host_id });
            const host = hosts[0];
            if (host) {
              await base44.asServiceRole.integrations.Core.SendEmail({
                to: host.email,
                subject: `✅ Vehicle Approved — ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
                body: `Great news! Your ${vehicle.year} ${vehicle.make} ${vehicle.model} has been verified and is now LIVE on your storefront. Renters can book it immediately.\n\nInsurance and registration documents have been verified by our AI compliance system.\n\nuRide Host Team`,
              });
              await base44.asServiceRole.entities.Notification.create({
                user_email: host.email,
                title: `✅ Vehicle Live — ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
                body: `Insurance and registration verified. Your vehicle is now live and accepting bookings!`,
                type: "success",
              });
            }
          }
        }
      }
    }

    return Response.json({ ok: true, result });
  } catch (error) {
    console.error('[aiReadComplianceDoc] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});