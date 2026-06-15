import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), { apiVersion: '2023-10-16' });
const TRIAL_DAYS = 14;
const HOST_SUBSCRIPTION_CONTEXT = 'host_platform_subscription';

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
    active_mode: 'fleetos_professional',
    status: 'setup_pending',
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
    payment_required: false,
    billing_activation_pending: false,
    subscription_required_later: true,
    subscription_activation_stage: 'post_onboarding',
    last_payment_status: 'not_required',
    activation_source: 'self_service',
    onboarding_complete: true
  },
  hybrid_growth: {
    recommended_mode: 'hybrid_growth',
    selected_mode: 'hybrid_growth',
    active_mode: 'hybrid_growth',
    status: 'setup_pending',
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
    payment_required: false,
    billing_activation_pending: false,
    subscription_required_later: true,
    subscription_activation_stage: 'post_onboarding',
    last_payment_status: 'not_required',
    activation_source: 'self_service',
    onboarding_complete: true
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

// Subscription activation is deferred to post-onboarding (Business Operations).
// No Stripe checkout is created during onboarding for any plan.

async function getOrCreateStripePrice(config, mode) {
  const existing = await stripe.prices.list({ lookup_keys: [config.lookupKey], active: true, limit: 1 });
  if (existing.data?.[0]) return existing.data[0];

  const product = await stripe.products.create({
    name: config.productName,
    metadata: { billing_context: HOST_SUBSCRIPTION_CONTEXT, plan_mode: mode }
  });

  return stripe.prices.create({
    currency: 'usd',
    unit_amount: Math.round(config.monthlyAmount * 100),
    recurring: { interval: 'month' },
    product: product.id,
    lookup_key: config.lookupKey,
    metadata: { billing_context: HOST_SUBSCRIPTION_CONTEXT, plan_mode: mode }
  });
}

const STOREFRONT_THEMES = [
  { primary: '#e91e8c', secondary: '#7c3aed', style: 'bold', template: 'modern', font: 'syne', inventory: 'spotlight' },
  { primary: '#0f766e', secondary: '#2563eb', style: 'executive', template: 'prestige', font: 'inter', inventory: 'clean_grid' },
  { primary: '#ea580c', secondary: '#111827', style: 'street', template: 'street', font: 'syne', inventory: 'editorial' },
  { primary: '#16a34a', secondary: '#0891b2', style: 'local', template: 'family', font: 'inter', inventory: 'compact' },
  { primary: '#4f46e5', secondary: '#db2777', style: 'premium', template: 'prestige', font: 'syne', inventory: 'spotlight' },
  { primary: '#334155', secondary: '#f59e0b', style: 'utility', template: 'modern', font: 'inter', inventory: 'clean_grid' }
];

const HERO_IMAGES = [
  'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=1400&q=80',
  'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1400&q=80',
  'https://images.unsplash.com/photo-1511918984145-48de785d4c4e?w=1400&q=80',
  'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=1400&q=80',
  'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=1400&q=80',
  'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?w=1400&q=80'
];

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

function pick(list, seed, offset = 0) {
  return list[(seed + offset) % list.length];
}

function storefrontIdentity(mode, storeName, slug, email) {
  const seed = hashString(`${storeName}|${slug}|${email}|${mode}`);
  const theme = pick(STOREFRONT_THEMES, seed);
  const headlinePatterns = mode === 'fleetos_professional'
    ? [`${storeName} Direct Fleet Rentals`, `Reserve Direct With ${storeName}`, `${storeName} Fleet Access`]
    : [`Drive With ${storeName}`, `${storeName} Rental Fleet`, `Find Your Ride With ${storeName}`];
  const subheadlinePatterns = [
    'Flexible vehicles, fast reservations, and a local team behind every trip.',
    'A curated rental experience built around reliability, speed, and service.',
    'Simple booking, trusted vehicles, and support from a real fleet operator.',
    'Reserve confidently with a fleet experience designed for working drivers.'
  ];
  const aboutPatterns = [
    `${storeName} helps drivers get moving with practical vehicle options, straightforward booking, and responsive local service.`,
    `${storeName} is built for renters who value clear pricing, dependable vehicles, and a smoother way to reserve transportation.`,
    `At ${storeName}, every listing is presented with a focus on convenience, transparency, and getting customers on the road quickly.`,
    `${storeName} gives customers a direct path to reserve vehicles from a host-operated fleet with a personal, business-owned feel.`
  ];
  const ctas = ['Reserve Your Ride', 'Start Booking', 'View Available Vehicles', 'Get on the Road'];

  return {
    brand_color: theme.primary,
    secondary_color: theme.secondary,
    font_style: theme.font,
    layout_template: theme.template,
    default_branding_style: theme.style,
    inventory_presentation_style: theme.inventory,
    cover_image_url: pick(HERO_IMAGES, seed, 2),
    hero_title: pick(headlinePatterns, seed, 1),
    hero_subtitle: pick(subheadlinePatterns, seed, 3),
    about_text: pick(aboutPatterns, seed, 5),
    cta_button_text: pick(ctas, seed, 7)
  };
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
    const identity = storefrontIdentity(mode, storeName, slug, user.email);
    const brandPayload = {
      host_id: host.id,
      business_slug: slug,
      business_display_name: storeName,
      logo_url: existingBrands?.[0]?.logo_url || '',
      cover_image_url: existingBrands?.[0]?.cover_image_url || identity.cover_image_url,
      brand_color: existingBrands?.[0]?.brand_color || identity.brand_color,
      secondary_color: existingBrands?.[0]?.secondary_color || identity.secondary_color,
      font_style: existingBrands?.[0]?.font_style || identity.font_style,
      layout_template: existingBrands?.[0]?.layout_template || identity.layout_template,
      default_branding_style: existingBrands?.[0]?.default_branding_style || identity.default_branding_style,
      inventory_presentation_style: existingBrands?.[0]?.inventory_presentation_style || identity.inventory_presentation_style,
      hero_title: existingBrands?.[0]?.hero_title || identity.hero_title,
      hero_subtitle: existingBrands?.[0]?.hero_subtitle || identity.hero_subtitle,
      about_text: existingBrands?.[0]?.about_text || identity.about_text,
      cta_button_text: existingBrands?.[0]?.cta_button_text || identity.cta_button_text,
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

    // Subscription activation is deferred — host goes straight to success screen for ALL plans.
    // They can activate FleetOS/Hybrid billing from Business Operations whenever they are ready.

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
      storefront_url: `${origin}/host/${slug}`,
      billing_recommended: ['fleetos_professional', 'hybrid_growth'].includes(mode)
    });
  } catch (error) {
    console.error('[InstantHostOnboarding] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});