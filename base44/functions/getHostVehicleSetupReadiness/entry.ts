import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const LIVE_STATUSES = new Set(['Available', 'Booked', 'Active Rental', 'Reserved', 'Payment Due', 'Grace Period']);
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);
const PAID_MODES = new Set(['fleetos_professional', 'hybrid_growth']);

function status(label, detail = '') {
  return { status: label, detail };
}

function hasValidDoc(docs, docType) {
  const today = new Date().toISOString().slice(0, 10);
  return docs.some((doc) => {
    if (doc.doc_type !== docType) return false;
    if (!['valid', 'expiring_soon'].includes(doc.status)) return false;
    if (doc.expiry_date && doc.expiry_date < today) return false;
    return true;
  });
}

function vehicleDetailsComplete(vehicle) {
  if (!vehicle) return false;
  return !!(vehicle.vin && vehicle.year && vehicle.make && vehicle.model && (vehicle.weekly_rate || vehicle.monthly_rate || vehicle.daily_rate) && vehicle.city && vehicle.state);
}

function modeLabel(mode) {
  if (mode === 'fleetos_professional') return 'FleetOS';
  if (mode === 'hybrid_growth') return 'Hybrid Growth';
  return 'Marketplace Partner';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { host_id, vehicle_id } = await req.json();
    if (!host_id) return Response.json({ error: 'host_id is required' }, { status: 400 });

    const hosts = await base44.asServiceRole.entities.Host.filter({ id: host_id });
    const host = hosts[0];
    if (!host) return Response.json({ error: 'Host not found' }, { status: 404 });
    if (user.role !== 'admin' && host.email !== user.email && host.user_id !== user.id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [brands, plans, subscriptions, commerceProfiles, paymentSettings, allVehicles, allDocs, devices] = await Promise.all([
      base44.asServiceRole.entities.HostBrandSettings.filter({ host_id }, '-updated_date', 1),
      base44.asServiceRole.entities.OperatorPlanConfiguration.filter({ host_id }, '-updated_date', 1),
      base44.asServiceRole.entities.HostPlatformSubscription.filter({ host_id }, '-updated_date', 1),
      base44.asServiceRole.entities.HostCommerceProfile.filter({ host_id }, '-updated_date', 1),
      base44.asServiceRole.entities.HostPaymentSettings.filter({ host_id }, '-updated_date', 1),
      base44.asServiceRole.entities.Vehicle.filter({ host_id }),
      base44.asServiceRole.entities.HostVehicleCompliance.filter({ host_id }),
      base44.asServiceRole.entities.TelematicsDevice.filter({ host_id }),
    ]);

    const brand = brands[0] || null;
    const plan = plans[0] || null;
    const subscription = subscriptions[0] || null;
    const commerce = commerceProfiles[0] || null;
    const payment = paymentSettings[0] || null;
    const liveVehicles = allVehicles.filter((v) => LIVE_STATUSES.has(v.status) && v.approval_status === 'approved');
    const vehicle = vehicle_id ? allVehicles.find((v) => v.id === vehicle_id) : allVehicles.find((v) => !liveVehicles.some((live) => live.id === v.id)) || allVehicles[0] || null;
    const vehicleDocs = vehicle ? allDocs.filter((doc) => doc.vehicle_id === vehicle.id) : [];

    const planMode = plan?.selected_mode || plan?.active_mode || commerce?.plan_type || 'marketplace_partner';
    const subscriptionStatus = subscription?.subscription_status || subscription?.status || plan?.status || 'not_required';
    const paidMode = PAID_MODES.has(planMode);
    const subscriptionDone = !paidMode || ACTIVE_SUBSCRIPTION_STATUSES.has(subscriptionStatus);
    const paymentRequired = paidMode || plan?.uses_own_payments || commerce?.host_checkout_enabled;
    const paymentDone = !!(host.stripe_onboarding_complete || payment?.payment_mode || payment?.uride_payments_enabled || commerce?.payment_processor === 'uride_stripe');
    const gpsRequired = !!(vehicle?.contactless_pickup || vehicle?.deployment_type === 'av' || vehicle?.rent_to_own_eligible);
    const gpsDone = !!(vehicle?.telematics_device_id || vehicle?.moovetrax_device_id || devices.some((device) => device.vehicle_id === vehicle?.id));
    const identityDone = host.verification_status === 'verified';
    const identityFailed = host.verification_status === 'failed';
    const registrationDone = hasValidDoc(vehicleDocs, 'registration');
    const insuranceDone = hasValidDoc(vehicleDocs, 'insurance');
    const detailsDone = vehicleDetailsComplete(vehicle);
    const storefrontDone = brand?.published_status === 'live' && !!brand?.business_slug;

    const missing = [];
    if (!storefrontDone) missing.push('Storefront live');
    if (!vehicle) missing.push('Add vehicle');
    if (vehicle && !detailsDone) missing.push('Vehicle details');
    if (vehicle && !registrationDone) missing.push('Vehicle registration');
    if (vehicle && !insuranceDone) missing.push('Vehicle insurance');
    if (!identityDone) missing.push('Host ID verification');
    if (!subscriptionDone) missing.push(`${modeLabel(planMode)} trial`);
    if (paymentRequired && !paymentDone) missing.push('Stripe setup');
    if (gpsRequired && !gpsDone) missing.push('GPS setup');

    const publishReady = !!vehicle && missing.length === 0;
    const nextAction = !vehicle ? 'add_vehicle'
      : !detailsDone ? 'complete_vehicle_details'
      : !registrationDone ? 'upload_registration'
      : !insuranceDone ? 'upload_insurance'
      : !identityDone ? 'verify_identity'
      : !subscriptionDone ? 'start_trial'
      : paymentRequired && !paymentDone ? 'connect_stripe'
      : gpsRequired && !gpsDone ? 'assign_gps'
      : publishReady ? 'publish_vehicle'
      : 'review_requirements';

    return Response.json({
      storefront_status: storefrontDone ? status('Done') : status('Needed'),
      storefront_url: brand?.business_slug ? `/host/${brand.business_slug}` : '',
      live_vehicle_count: liveVehicles.length,
      vehicle_details_status: vehicle ? (detailsDone ? status('Done') : status('Needed')) : status('Needed'),
      registration_status: vehicle ? (registrationDone ? status('Done') : status('Needed')) : status('Needed'),
      insurance_status: vehicle ? (insuranceDone ? status('Done') : status('Needed')) : status('Needed'),
      host_identity_status: identityDone ? status('Done', 'Identity Verified On File') : identityFailed ? status('Needed', host.verification_notes || 'Verification failed') : status('Needed'),
      subscription_status: subscriptionDone ? status('Done', paidMode ? `${modeLabel(planMode)} ${subscriptionStatus}` : 'Marketplace Partner has no monthly subscription') : status('Needed', `Start ${modeLabel(planMode)} 14-Day Trial`),
      payment_setup_status: paymentDone ? status('Done', 'Payments Connected') : paymentRequired ? status('Needed', 'Connect Stripe') : status('Optional'),
      gps_status: gpsDone ? status('Done', 'GPS Connected') : gpsRequired ? status('Needed') : status('Optional'),
      publish_status: publishReady ? status('Done') : status('Blocked'),
      publish_ready: publishReady,
      missing_requirements: missing,
      next_recommended_action: nextAction,
      plan_mode: planMode,
      payment_required: !!paymentRequired,
      gps_required: !!gpsRequired,
      vehicle_id: vehicle?.id || '',
    });
  } catch (error) {
    console.error('[getHostVehicleSetupReadiness] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});