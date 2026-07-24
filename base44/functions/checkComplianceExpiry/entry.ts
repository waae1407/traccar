import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const isCronCompliance = !!(Deno.env.get('CRON_SECRET') && req.headers.get('x-cron-secret') === Deno.env.get('CRON_SECRET'));
    const isScheduledCompliance = req.headers.get('x-base44-scheduled-function') === 'true';
    if (!isCronCompliance && !isScheduledCompliance) {
      const user = await base44.auth.me().catch(() => null);
      if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden: cron-secret, scheduled, or admin required' }, { status: 403 });
    }

    const today = new Date();
    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);

    const todayStr = today.toISOString().split("T")[0];
    const in30Str = in30Days.toISOString().split("T")[0];

    // ── 1. COMPLIANCE DOCS ───────────────────────────────────────────────────
    const docs = await base44.asServiceRole.entities.HostVehicleCompliance.list("-created_date", 500);

    let docsUpdated = 0;
    const alerts = [];
    const suspendedVehicles = [];
    const reinstatedVehicles = [];

    // Track which vehicles changed compliance status
    const vehicleComplianceMap = {};

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
        docsUpdated++;

        // Track per vehicle
        if (!vehicleComplianceMap[doc.vehicle_id]) vehicleComplianceMap[doc.vehicle_id] = [];
        vehicleComplianceMap[doc.vehicle_id].push({ ...doc, status: newStatus });

        // Get host info to notify
        const hosts = await base44.asServiceRole.entities.Host.filter({ id: doc.host_id });
        const host = hosts[0];
        if (host) {
          const docTypeLabels = { insurance: "Insurance", registration: "Registration", inspection: "Inspection", title: "Title" };
          const label = docTypeLabels[doc.doc_type] || doc.doc_type;
          const isRequired = doc.doc_type === "insurance" || doc.doc_type === "registration";

          if (newStatus === "expiring_soon") {
            const daysLeft = Math.ceil((new Date(doc.expiry_date) - today) / (1000 * 60 * 60 * 24));
            await base44.asServiceRole.integrations.Core.SendEmail({
              to: host.email,
              subject: `⚠️ ${label} Expiring in ${daysLeft} Days — ${doc.vehicle_name}`,
              body: `Your ${label} for ${doc.vehicle_name} expires on ${doc.expiry_date} (${daysLeft} days from now).\n\n${isRequired ? "This is a REQUIRED document. If not renewed before expiry, your vehicle will automatically be taken out of service." : "Please upload a renewal at your earliest convenience."}\n\nLog in to upload a renewal: https://uridehub.com/host/compliance\n\nuRide Compliance Team`,
            });
            await base44.asServiceRole.entities.Notification.create({
              user_email: host.email,
              title: `⚠️ ${label} Expiring in ${daysLeft} Days — ${doc.vehicle_name}`,
              body: `Expires ${doc.expiry_date}. ${isRequired ? "Required — vehicle will go offline if not renewed." : "Please renew soon."}`,
              type: "alert",
            });
            alerts.push({ host_email: host.email, doc_type: doc.doc_type, vehicle: doc.vehicle_name, status: newStatus, days_left: daysLeft });
          }

          if (newStatus === "expired" && isRequired) {
            // Auto-suspend the vehicle
            const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: doc.vehicle_id });
            const vehicle = vehicles[0];
            if (vehicle && !['Out of Service', 'Compliance Hold'].includes(vehicle.status)) {
              await base44.asServiceRole.entities.Vehicle.update(doc.vehicle_id, { status: 'Compliance Hold' });
              suspendedVehicles.push(doc.vehicle_id);

              // Fire critical notification to host (SMS + Email + In-App with dedup)
              await base44.asServiceRole.functions.invoke('sendCriticalNotification', {
                event_type: 'compliance_expired_host',
                host: { id: host.id, email: host.email, full_name: host.full_name, phone: host.phone },
                vehicle: { id: vehicle.id, year: vehicle.year, make: vehicle.make, model: vehicle.model, display_name: doc.vehicle_name },
                doc_type: doc.doc_type,
                expiry_date: doc.expiry_date,
              }).catch(e => console.error('[ComplianceCheck] host notification failed:', e.message));

              // Log compliance expiry ActivityEvent
              await base44.asServiceRole.entities.ActivityEvent.create({
                event_type: 'compliance.expired',
                actor_id: 'compliance_automation',
                actor_email: 'automation@uridehub.com',
                actor_role: 'automation',
                target_entity: 'Vehicle',
                target_id: doc.vehicle_id,
                target_label: doc.vehicle_name || doc.vehicle_id,
                host_id: doc.host_id || '',
                vehicle_id: doc.vehicle_id || '',
                summary: `Compliance EXPIRED: ${label} for ${doc.vehicle_name} — vehicle placed on Compliance Hold`,
                metadata: { doc_type: doc.doc_type, expiry_date: doc.expiry_date, vehicle_name: doc.vehicle_name, host_email: host.email },
                source: 'automation',
                event_status: 'error',
              });

              // Check for active bookings affected by this compliance hold
              const allBookingsForVehicle = await base44.asServiceRole.entities.BookingRequest.filter({ vehicle_id: doc.vehicle_id });
              const affectedBookings = allBookingsForVehicle.filter(b =>
                ['active', 'confirmed', 'approved'].includes(b.booking_status)
              );
              for (const affectedBooking of affectedBookings) {
                // Notify active customer their rental vehicle is on compliance hold
                await base44.asServiceRole.functions.invoke('sendCriticalNotification', {
                  event_type: 'compliance_hold_active_booking',
                  booking: {
                    id: affectedBooking.id,
                    user_email: affectedBooking.user_email,
                    customer_full_name: affectedBooking.customer_full_name,
                    customer_phone: affectedBooking.customer_phone,
                    vehicle_name: doc.vehicle_name,
                  },
                  vehicle: { id: vehicle.id, year: vehicle.year, make: vehicle.make, model: vehicle.model, display_name: doc.vehicle_name },
                  doc_type: doc.doc_type,
                }).catch(e => console.error('[ComplianceCheck] customer compliance notification failed:', e.message));

                await base44.asServiceRole.entities.ActivityEvent.create({
                  event_type: 'compliance.booking_blocked',
                  actor_id: 'compliance_automation',
                  actor_email: 'automation@uridehub.com',
                  actor_role: 'automation',
                  target_entity: 'BookingRequest',
                  target_id: affectedBooking.id,
                  target_label: `${affectedBooking.vehicle_name} — ${affectedBooking.user_email}`,
                  host_id: affectedBooking.host_id || '',
                  booking_id: affectedBooking.id,
                  vehicle_id: doc.vehicle_id || '',
                  customer_id: affectedBooking.user_email || '',
                  summary: `Compliance hold affects ACTIVE booking: ${label} expired for ${doc.vehicle_name}`,
                  metadata: { doc_type: doc.doc_type, expiry_date: doc.expiry_date, booking_status: affectedBooking.booking_status, customer_email: affectedBooking.user_email },
                  source: 'automation',
                  event_status: 'warning',
                });
                console.log(`[ComplianceCheck] BOOKING AFFECTED: ${affectedBooking.id} — ${label} expired for ${doc.vehicle_name}`);
              }

              await base44.asServiceRole.integrations.Core.SendEmail({
                to: host.email,
                subject: `🚨 Vehicle Suspended — ${doc.vehicle_name} (${label} Expired)`,
                body: `Your ${doc.vehicle_name} has been automatically placed on Compliance Hold because its ${label} expired on ${doc.expiry_date}.\n\nTo reinstate the vehicle:\n1. Renew your ${label}\n2. Upload the new document at https://uridehub.com/host/compliance\n3. Our AI will verify the document and automatically reinstate your vehicle\n\nWe apologize for any inconvenience.\n\nuRide Compliance Team`,
              });
              await base44.asServiceRole.entities.Notification.create({
                user_email: host.email,
                title: `🚨 Vehicle on Compliance Hold — ${doc.vehicle_name}`,
                body: `${label} expired. Upload renewal to reinstate automatically.`,
                type: 'alert',
              });
            }
            alerts.push({ host_email: host.email, doc_type: doc.doc_type, vehicle: doc.vehicle_name, status: newStatus });
          }
        }
      }

      // Check if a previously suspended vehicle now has valid docs — reinstate it
      if (doc.doc_type === "insurance" || doc.doc_type === "registration") {
        if (!vehicleComplianceMap[doc.vehicle_id]) vehicleComplianceMap[doc.vehicle_id] = [];
        vehicleComplianceMap[doc.vehicle_id].push(doc);
      }
    }

    // Reinstate check: vehicles that are Out of Service but now have valid insurance + registration
    const allVehicleIds = [...new Set(docs.map(d => d.vehicle_id).filter(Boolean))];
    for (const vehicleId of allVehicleIds) {
      const vehicleDocs = await base44.asServiceRole.entities.HostVehicleCompliance.filter({ vehicle_id: vehicleId });
      const hasValidInsurance = vehicleDocs.some(d => d.doc_type === "insurance" && (d.status === "valid" || d.status === "expiring_soon"));
      const hasValidRegistration = vehicleDocs.some(d => d.doc_type === "registration" && (d.status === "valid" || d.status === "expiring_soon"));

      if (hasValidInsurance && hasValidRegistration) {
        const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: vehicleId });
        const vehicle = vehicles[0];
        if (vehicle && ['Out of Service', 'Compliance Hold'].includes(vehicle.status) && vehicle.approval_status === 'approved') {
          await base44.asServiceRole.entities.Vehicle.update(vehicleId, { status: 'Available' });
          reinstatedVehicles.push(vehicleId);

          // Log compliance reinstatement ActivityEvent
          await base44.asServiceRole.entities.ActivityEvent.create({
            event_type: 'compliance.approved',
            actor_id: 'compliance_automation',
            actor_email: 'automation@uridehub.com',
            actor_role: 'automation',
            target_entity: 'Vehicle',
            target_id: vehicleId,
            target_label: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
            vehicle_id: vehicleId,
            summary: `Compliance REINSTATED: ${vehicle.year} ${vehicle.make} ${vehicle.model} — all required docs valid`,
            metadata: { vehicle_id: vehicleId, previous_status: vehicle.status },
            source: 'automation',
            event_status: 'success',
          });

          const vehicleDomain = vehicleDocs[0];
          if (vehicleDomain) {
            const hosts = await base44.asServiceRole.entities.Host.filter({ id: vehicleDomain.host_id });
            const host = hosts[0];
            if (host) {
              await base44.asServiceRole.integrations.Core.SendEmail({
                to: host.email,
                subject: `✅ Vehicle Reinstated — ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
                body: `Great news! Your ${vehicle.year} ${vehicle.make} ${vehicle.model} has been automatically reinstated and is now available for booking.\n\nAll required compliance documents (insurance and registration) are up to date.\n\nuRide Compliance Team`,
              });
              await base44.asServiceRole.entities.Notification.create({
                user_email: host.email,
                title: `✅ Vehicle Reinstated — ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
                body: `All compliance docs are valid. Vehicle is now live and accepting bookings!`,
                type: "success",
              });
            }
          }
        }
      }
    }

    // ── 2. MAINTENANCE ALERTS ────────────────────────────────────────────────
    const maintenance = await base44.asServiceRole.entities.HostMaintenanceLog.list("-created_date", 500);
    let maintenanceAlerts = 0;

    for (const log of maintenance) {
      if (log.status !== "scheduled") continue;

      let alertNeeded = false;
      let alertMsg = "";

      // Date-based check
      if (log.next_service_date) {
        const daysUntil = Math.ceil((new Date(log.next_service_date) - today) / (1000 * 60 * 60 * 24));
        if (daysUntil <= 14 && daysUntil > 0) {
          alertNeeded = true;
          alertMsg = `Service due in ${daysUntil} days (${log.next_service_date})`;
        } else if (daysUntil <= 0) {
          alertNeeded = true;
          alertMsg = `Service is OVERDUE (was due ${log.next_service_date})`;
          await base44.asServiceRole.entities.HostMaintenanceLog.update(log.id, { status: "overdue" });
        }
      }

      // Mileage-based check
      if (log.next_service_mileage && log.vehicle_id) {
        const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: log.vehicle_id });
        const vehicle = vehicles[0];
        if (vehicle && vehicle.mileage) {
          const milesLeft = log.next_service_mileage - vehicle.mileage;
          if (milesLeft <= 500 && milesLeft > 0) {
            alertNeeded = true;
            alertMsg = alertMsg ? alertMsg + ` and within ${milesLeft} miles of service` : `Only ${milesLeft} miles until service is due`;
          } else if (milesLeft <= 0) {
            alertNeeded = true;
            alertMsg = alertMsg ? alertMsg + " (mileage exceeded)" : `Mileage service overdue by ${Math.abs(milesLeft)} miles`;
          }
        }
      }

      if (alertNeeded) {
        const serviceLabels = { oil_change: "Oil Change", tire_rotation: "Tire Rotation", brake_service: "Brake Service", inspection: "Inspection", wash: "Detailing", tire_replacement: "Tire Replacement", battery: "Battery", ac_service: "A/C Service", other: "Service" };
        const serviceLabel = serviceLabels[log.service_type] || "Service";

        const hosts = await base44.asServiceRole.entities.Host.filter({ id: log.host_id });
        const host = hosts[0];
        if (host) {
          await base44.asServiceRole.entities.Notification.create({
            user_email: host.email,
            title: `🔧 ${serviceLabel} Due — ${log.vehicle_name}`,
            body: alertMsg,
            type: "alert",
          });
          maintenanceAlerts++;
        }
      }
    }

    console.log(`[ComplianceCheck] Docs updated: ${docsUpdated}, Alerts: ${alerts.length}, Suspended: ${suspendedVehicles.length}, Reinstated: ${reinstatedVehicles.length}, Maintenance alerts: ${maintenanceAlerts}`);
    return Response.json({
      ok: true,
      docs_checked: docs.length,
      docs_updated: docsUpdated,
      alerts_sent: alerts.length,
      vehicles_suspended: suspendedVehicles.length,
      vehicles_reinstated: reinstatedVehicles.length,
      maintenance_alerts: maintenanceAlerts,
    });
  } catch (error) {
    console.error("[ComplianceCheck] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});