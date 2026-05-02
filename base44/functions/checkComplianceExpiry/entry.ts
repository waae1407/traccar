import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const today = new Date();
    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);

    const todayStr = today.toISOString().split("T")[0];
    const in30Str = in30Days.toISOString().split("T")[0];

    // Get all compliance docs
    const docs = await base44.asServiceRole.entities.HostVehicleCompliance.list("-created_date", 500);

    let updated = 0;
    const alerts = [];

    for (const doc of docs) {
      if (!doc.expiry_date) continue;

      let newStatus = "valid";
      if (doc.expiry_date < todayStr) {
        newStatus = "expired";
      } else if (doc.expiry_date <= in30Str) {
        newStatus = "expiring_soon";
      }

      if (newStatus !== doc.status) {
        await base44.asServiceRole.entities.HostVehicleCompliance.update(doc.id, { status: newStatus });
        updated++;

        if (newStatus === "expiring_soon" || newStatus === "expired") {
          // Get host info to notify
          const hosts = await base44.asServiceRole.entities.Host.filter({ id: doc.host_id });
          const host = hosts[0];
          if (host) {
            const docTypeLabels = { insurance: "Insurance", registration: "Registration", inspection: "Inspection", title: "Title" };
            const label = docTypeLabels[doc.doc_type] || doc.doc_type;

            await base44.asServiceRole.entities.Notification.create({
              user_email: host.email,
              title: newStatus === "expired" ? `⚠️ ${label} EXPIRED — ${doc.vehicle_name}` : `📅 ${label} Expiring Soon — ${doc.vehicle_name}`,
              body: newStatus === "expired"
                ? `Your ${label.toLowerCase()} for ${doc.vehicle_name} has expired. Please upload a renewal immediately to avoid vehicle suspension.`
                : `Your ${label.toLowerCase()} for ${doc.vehicle_name} expires on ${doc.expiry_date}. Please upload a renewal soon.`,
              type: "alert",
            });

            alerts.push({ host_email: host.email, doc_type: doc.doc_type, vehicle: doc.vehicle_name, status: newStatus });
          }
        }
      }
    }

    console.log(`[ComplianceCheck] Updated ${updated} docs, sent ${alerts.length} alerts`);
    return Response.json({ ok: true, docs_checked: docs.length, updated, alerts_sent: alerts.length });
  } catch (error) {
    console.error("[ComplianceCheck] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});