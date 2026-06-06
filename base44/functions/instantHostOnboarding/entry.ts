import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const PLAN_CONFIG = {
  marketplace_partner: {
    recommended_mode: 'marketplace_partner',
    selected_mode: 'marketplace_partner',
    active_mode: 'marketplace_partner',
    status: 'active',
    marketplace_enabled: true,
    marketplace_fee_rate: 0.08,
    monthly_subscription_amount: 0,
    payment_mode: 'uride_payments',
    uses_uride_payments: true,
    uses_own_payments: false,
    stripe_connect_required: false,
    stripe_connect_optional: true,
    platform_billing_route: 'commission',
    customer_payment_routing: 'uride_checkout',
    payment_required: false,
    billing_activation_pending: false,
    last_payment_status: 'not_required',
    activation_source: 'self_service'
  },
  fleetos_professional: {
    recommended_mode: 'fleetos_professional',
    selected_mode: 'fleetos_professional',
    active_mode: 'none',
    status: 'pending_payment',
    marketplace_enabled: false,
    marketplace_fee_rate: 0,
    monthly_subscription_amount: 29.99,
    payment_mode: 'own_payments',
    uses_uride_payments: false,
    uses_own_payments: true,
    stripe_connect_required: false,
    stripe_connect_optional: true,
    platform_billing_route: 'subscription',
    customer_payment_routing: 'host_external',
    payment_required: true,
    billing_activation_pending: true,
    last_payment_status: 'pending',
    activation_source: 'subscription_payment'
  },
  hybrid_growth: {
    recommended_mode: 'hybrid_growth',
    selected_mode: 'hybrid_growth',
    active_mode: 'none',
    status: 'pending_payment',
    marketplace_enabled: true,
    marketplace_fee_rate: 0.04,
    monthly_subscription_amount: 29.99,
    payment_mode: 'uride_payments',
    uses_uride_payments: true,
    uses_own_payments: false,
    stripe_connect_required: false,
    stripe_connect_optional: true,
    platform_billing_route: 'subscription_plus_marketplace',
    customer_payment_routing: 'uride_checkout',
    payment_required: true,
    billing_activation_pending: true,
    last_payment_status: 'pending',
    activation_source: 'subscription_payment'
  }
};

function commercePayload(host, mode) {
  const isFleetOS = mode === 'fleetos_professional';
  const isHybrid = mode === 'hybrid_growth';
  const stripeReady = !!host?.stripe_onboarding_complete && !!host?.stripe_account_id;
  return {
    host_id: host.id,
    plan_type: mode,
    marketplace_enabled: !isFleetOS,
    marketplace_visibility: !isFleetOS,
    booking_enabled: true,
    online_payments_enabled: isFleetOS ? stripeReady : true,
    payment_processor: isFleetOS ? 'host_stripe' : 'uride_stripe',
    commission_rate: isFleetOS ? 0 : isHybrid ? 0.04 : 0.08,
    subscription_rate: isFleetOS || isHybrid ? 29.99 : 0,
    stripe_account_id: host.stripe_account_id || '',
    host_checkout_enabled: isFleetOS && stripeReady
  };
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'store';
}

function initials(name) {
  const parts = String(name || 'Store').replace(/[^a-zA-Z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || 'S') + (parts[1]?.[0] || parts[0]?.[1] || '');
}

function heroTitle(mode, storeName) {
  if (mode === 'fleetos_professional') return `Reserve Vehicles Directly From ${storeName}`;
  if (mode === 'hybrid_growth') return 'Browse Our Rental Fleet';
  return 'Find Your Next Rental Vehicle';
}

async function uniqueSlug(base44, requestedSlug) {
  const base = slugify(requestedSlug);
  let candidate = base;
  for (let i = 2; i < 25; i++) {
    const existing = await base44.asServiceRole.entities.HostBrandSettings.filter({ business_slug: candidate });
    if (!existing?.length) return candidate;
    candidate = `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { store_name, selected_mode, requested_slug } = await req.json();
    const storeName = String(store_name || '').trim();
    const mode = PLAN_CONFIG[selected_mode] ? selected_mode : 'marketplace_partner';
    if (!storeName) return Response.json({ error: 'Store name is required' }, { status: 400 });

    const now = new Date().toISOString();
    const existingHosts = await base44.asServiceRole.entities.Host.filter({ email: user.email });
    let host = existingHosts?.[0];

    if (host?.id) {
      host = await base44.asServiceRole.entities.Host.update(host.id, {
        user_id: host.user_id || user.id,
        business_name: host.business_name || storeName,
        full_name: host.full_name || user.full_name || storeName,
        status: 'approved',
        approved_at: host.approved_at || now,
        approved_by: host.approved_by || 'instant_onboarding',
        verification_status: host.verification_status || 'not_started'
      });
    } else {
      host = await base44.asServiceRole.entities.Host.create({
        user_id: user.id,
        full_name: user.full_name || storeName,
        email: user.email,
        business_name: storeName,
        status: 'approved',
        approved_at: now,
        approved_by: 'instant_onboarding',
        verification_status: 'not_started',
        store_published: true,
        total_vehicles: 0
      });
    }

    const users = await base44.asServiceRole.entities.User.filter({ email: user.email });
    if (users?.[0] && users[0].role !== 'admin') {
      await base44.asServiceRole.entities.User.update(users[0].id, { role: 'host' });
    }

    const planPayload = {
      ...PLAN_CONFIG[mode],
      host_id: host.id,
      user_id: user.id,
      fee_structure_acknowledged: true,
      fee_structure_acknowledged_at: now,
      fee_structure_acknowledged_by: user.email,
      fee_structure_summary: mode === 'fleetos_professional'
        ? 'FleetOS is SaaS fleet management. Host owns customer payments and rental revenue.'
        : 'Package controls marketplace exposure and platform fees. Existing marketplace billing logic remains unchanged.',
      effective_date: now.slice(0, 10),
      last_updated_at: now,
      status_audit_log: [{ from_status: 'created', to_status: PLAN_CONFIG[mode].status, changed_by: user.email, changed_at: now, reason: 'Instant storefront onboarding selected package.', source: 'self_service' }]
    };

    const existingPlans = await base44.asServiceRole.entities.OperatorPlanConfiguration.filter({ host_id: host.id }, '-updated_date', 1);
    const plan = existingPlans?.[0]?.id
      ? await base44.asServiceRole.entities.OperatorPlanConfiguration.update(existingPlans[0].id, planPayload)
      : await base44.asServiceRole.entities.OperatorPlanConfiguration.create(planPayload);

    const commerce = commercePayload(host, mode);
    const existingCommerce = await base44.asServiceRole.entities.HostCommerceProfile.filter({ host_id: host.id }, '-updated_date', 1);
    if (existingCommerce?.[0]?.id) await base44.asServiceRole.entities.HostCommerceProfile.update(existingCommerce[0].id, commerce);
    else await base44.asServiceRole.entities.HostCommerceProfile.create(commerce);

    const paymentPayload = {
      host_id: host.id,
      user_id: user.id,
      payment_mode: PLAN_CONFIG[mode].payment_mode,
      uride_payments_enabled: false,
      booking_confirmation_mode: 'manual_host_approval',
      manual_payment_proof_required: false,
      last_updated_at: now
    };
    const settings = await base44.asServiceRole.entities.HostPaymentSettings.filter({ host_id: host.id }, '-updated_date', 1);
    if (settings?.[0]?.id) await base44.asServiceRole.entities.HostPaymentSettings.update(settings[0].id, paymentPayload);
    else await base44.asServiceRole.entities.HostPaymentSettings.create(paymentPayload);

    const existingBrands = await base44.asServiceRole.entities.HostBrandSettings.filter({ host_id: host.id }, '-updated_date', 1);
    const slug = existingBrands?.[0]?.business_slug || await uniqueSlug(base44, requested_slug || storeName);
    const brandPayload = {
      host_id: host.id,
      business_slug: slug,
      business_display_name: storeName,
      brand_color: '#e91e8c',
      secondary_color: '#7c3aed',
      font_style: 'inter',
      layout_template: 'modern',
      hero_title: heroTitle(mode, storeName),
      hero_subtitle: '',
      about_text: '',
      cta_button_text: 'Book Now',
      show_reviews: true,
      show_rto_options: true,
      show_weekly_pricing: true,
      show_rent_for_free: true,
      show_marketplace_vehicles: false,
      show_activity_tab: true,
      show_support_tab: true,
      published_status: 'live',
      store_score: 100,
      ai_builder_enabled: true,
      last_published_at: now,
      moderation_status: 'active'
    };
    const brand = existingBrands?.[0]?.id
      ? await base44.asServiceRole.entities.HostBrandSettings.update(existingBrands[0].id, brandPayload)
      : await base44.asServiceRole.entities.HostBrandSettings.create(brandPayload);

    await base44.asServiceRole.entities.Host.update(host.id, { store_published: true, brand_builder_token: null });

    const existingTemplates = await base44.asServiceRole.entities.ContractTemplate.filter({ host_id: host.id }, '-updated_date', 20);
    const existingTemplateTypes = new Set((existingTemplates || []).map((template) => template.template_type));
    const templateDefaults = [
      ['weekly_rental', 'Weekly Rental'],
      ['monthly_rental', 'Monthly Rental'],
      ['rent_to_own', 'Rent-To-Own'],
      ['commercial_fleet', 'Commercial Fleet']
    ];
    for (const [template_type, name] of templateDefaults) {
      if (!existingTemplateTypes.has(template_type)) {
        await base44.asServiceRole.entities.ContractTemplate.create({
          host_id: host.id,
          template_type,
          name,
          status: 'active',
          deposit: 0,
          late_fees: 'Late fees may apply according to the host payment policy.',
          mileage_rules: 'Mileage limits and overage fees are set by the host.',
          insurance_requirements: 'Customer must maintain valid insurance and comply with all rental requirements.',
          smoking_fees: 'Smoking is prohibited and cleaning fees may apply.',
          return_policies: 'Vehicle must be returned on time, clean, fueled, and in the same condition.',
          version: 'v1'
        });
      }
    }

    await base44.asServiceRole.entities.OperatorRecommendationHistory.create({ 
      host_id: host.id,
      user_id: user.id,
      new_mode: mode,
      reason: 'Host selected package during instant storefront onboarding.',
      changed_by: user.email,
      changed_at: now,
      source: 'user_selection'
    });

    const origin = req.headers.get('origin') || 'https://uridehub.com';
    return Response.json({
      ok: true,
      host_id: host.id,
      plan_id: plan.id,
      brand_id: brand.id,
      selected_mode: mode,
      store_name: storeName,
      initials: initials(storeName).toUpperCase(),
      business_slug: slug,
      storefront_path: `/host/${slug}`,
      storefront_url: `${origin}/host/${slug}`
    });
  } catch (error) {
    console.error('[InstantHostOnboarding] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});