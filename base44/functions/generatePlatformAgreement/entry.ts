/**
 * generatePlatformAgreement — Generates and/or signs the Host ↔ uRide Platform Services Agreement
 *
 * Two modes:
 *   GET (no body / { host_id }) → Returns the current agreement HTML for the host's plan
 *   POST { host_id, action: 'sign', signature_name } → Signs the agreement, stores evidence,
 *      supersedes any prior agreement, and marks the host as having accepted the platform terms.
 *
 * The agreement defines:
 *   - Plan tier, commission rate, subscription amount
 *   - uRide's role: payment processing, telematics, marketplace, enforcement
 *   - Host's role: vehicle ownership, insurance, maintenance, compliance
 *   - Liability allocation and mutual indemnification
 *   - Term, termination, payout schedule
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const AGREEMENT_VERSION = 'v1.0';
const APP_URL = 'https://uridehub.com';

const PLAN_LABELS = {
  marketplace_partner: 'Marketplace Partner',
  fleetos_professional: 'FleetOS Professional',
  hybrid_growth: 'Hybrid Growth',
};

const PLAN_DETAILS = {
  marketplace_partner: {
    label: 'Marketplace Partner',
    commissionRate: 0.08,
    monthlyAmount: 0,
    paymentRoute: 'uRide processes all customer payments via uRide\'s Stripe account. Host receives net payouts (gross minus platform fee minus Stripe processing fees) on the configured payout schedule.',
    platformRole: 'uRide acts as the marketplace platform and payment processor. uRide lists the Host\'s vehicles on the uRide marketplace, processes customer payments, remits net payouts to the Host, and provides telematics infrastructure (GPS tracking, starter interrupt) for enforcement. uRide is NOT the vehicle owner, lessor, or insurer.',
    hostRole: 'Host owns all vehicles listed on the marketplace, maintains valid insurance and registration for every vehicle, ensures vehicles are roadworthy and compliant with all applicable laws, handles all customer-facing vehicle issues, and retains title and tort liability for the vehicles at all times.',
  },
  fleetos_professional: {
    label: 'FleetOS Professional',
    commissionRate: 0,
    monthlyAmount: 29.99,
    paymentRoute: 'Host processes customer payments through their own Stripe Connect account or external payment method. uRide charges a monthly SaaS subscription fee of $29.99. Host retains 100% of rental revenue.',
    platformRole: 'uRide acts as a SaaS fleet management provider. uRide provides the booking dashboard, telematics infrastructure (GPS tracking, starter interrupt), and operational tooling. uRide does NOT process customer payments, does NOT list vehicles on the uRide marketplace, and is NOT a party to the rental agreement between the Host and the Host\'s customers.',
    hostRole: 'Host owns all vehicles, processes all customer payments directly, maintains valid insurance and registration, ensures vehicles are roadworthy and compliant, handles all customer-facing issues, and retains full title and tort liability for vehicles and rental transactions. Host uses uRide solely as fleet management software.',
  },
  hybrid_growth: {
    label: 'Hybrid Growth',
    commissionRate: 0.05,
    monthlyAmount: 29.99,
    paymentRoute: 'uRide processes marketplace customer payments via uRide\'s Stripe account with a 5% commission. Host may also process direct bookings through their own Stripe Connect account. uRide charges a monthly subscription of $29.99 plus 5% commission on marketplace bookings.',
    platformRole: 'uRide acts as both a SaaS fleet management provider and a marketplace platform. For marketplace bookings, uRide processes payments and remits net payouts. For direct bookings, the Host processes payments independently. uRide provides telematics infrastructure for enforcement on all bookings.',
    hostRole: 'Host owns all vehicles, maintains valid insurance and registration, ensures vehicles are roadworthy and compliant, handles all customer-facing vehicle issues, and retains title and tort liability for the vehicles at all times.',
  },
};

function generateAgreementHTML(host, planType, commissionRate, monthlyAmount) {
  const details = PLAN_DETAILS[planType] || PLAN_DETAILS.marketplace_partner;
  const hostName = host.business_name || host.full_name || host.email;
  const hostLegalName = host.business_legal_name || host.business_name || host.full_name || hostName;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const commissionPct = (commissionRate * 100).toFixed(1);

  return `
<div style="font-family: 'Inter', sans-serif; color: #1a1a1a; max-width: 800px; margin: 0 auto; line-height: 1.7;">
  <h1 style="text-align: center; font-size: 24px; margin-bottom: 4px; color: #1a1a1a;">uRide Platform Services Agreement</h1>
  <p style="text-align: center; color: #666; font-size: 13px; margin-bottom: 24px;">Version ${AGREEMENT_VERSION} · Effective ${today}</p>

  <p style="margin-bottom: 16px;">This Platform Services Agreement ("Agreement") is entered into between <strong>uRide, Inc.</strong> ("uRide," "Platform," or "Company") and <strong>${hostLegalName}</strong> ("Host") as of the date of electronic acceptance below.</p>

  <h2 style="font-size: 16px; border-bottom: 2px solid #e91e8c; padding-bottom: 4px; margin-top: 24px;">1. Plan Selection &amp; Fees</h2>
  <p style="margin-bottom: 12px;">Host has selected the <strong>${details.label}</strong> plan. The fee structure is as follows:</p>
  <ul style="margin-bottom: 12px; padding-left: 20px;">
    <li><strong>Commission Rate:</strong> ${commissionPct}% per marketplace booking ${commissionRate === 0 ? '(no commission — SaaS model)' : ''}</li>
    <li><strong>Monthly Subscription:</strong> $${monthlyAmount.toFixed(2)}${monthlyAmount === 0 ? ' (no monthly fee)' : ''}</li>
    <li><strong>Payment Processing:</strong> ${details.paymentRoute}</li>
  </ul>
  <p style="margin-bottom: 12px; font-size: 13px; color: #666;">Host acknowledges that uRide may update commission rates or subscription fees with 30 days written notice. Existing bookings at the time of a fee change will be honored at the rate in effect when the booking was placed.</p>

  <h2 style="font-size: 16px; border-bottom: 2px solid #e91e8c; padding-bottom: 4px; margin-top: 24px;">2. uRide's Role &amp; Responsibilities</h2>
  <p style="margin-bottom: 12px;">${details.platformRole}</p>
  <p style="margin-bottom: 12px;">Specifically, uRide's responsibilities include:</p>
  <ul style="margin-bottom: 12px; padding-left: 20px;">
    <li>Providing and maintaining the booking platform, storefront, and marketplace infrastructure</li>
    <li>Processing customer payments where applicable to the selected plan</li>
    <li>Remitting net payouts to the Host on the agreed schedule (weekly, biweekly, or monthly)</li>
    <li>Providing telematics infrastructure (GPS tracking, starter interrupt) for vehicle enforcement</li>
    <li>Providing customer support tooling and communication infrastructure</li>
    <li>Conducting identity verification and compliance checks on marketplace customers</li>
  </ul>

  <h2 style="font-size: 16px; border-bottom: 2px solid #e91e8c; padding-bottom: 4px; margin-top: 24px;">3. Host's Role &amp; Responsibilities</h2>
  <p style="margin-bottom: 12px;">${details.hostRole}</p>
  <p style="margin-bottom: 12px;">Specifically, Host's responsibilities include:</p>
  <ul style="margin-bottom: 12px; padding-left: 20px;">
    <li>Maintaining valid insurance, registration, and inspection for every vehicle listed on the platform</li>
    <li>Ensuring all vehicles are roadworthy, safe, and compliant with all applicable federal, state, and local laws</li>
    <li>Retaining clear title and ownership of all vehicles at all times</li>
    <li>Maintaining proper business licensing and permits required to operate a vehicle rental business in Host's jurisdiction</li>
    <li>Handling all vehicle maintenance, repairs, and recalls</li>
    <li>Providing accurate vehicle information, photos, and availability to the platform</li>
    <li>Responding to customer issues related to vehicle condition, availability, or performance</li>
    <li>Complying with all tax obligations related to rental income</li>
  </ul>

  <h2 style="font-size: 16px; border-bottom: 2px solid #e91e8c; padding-bottom: 4px; margin-top: 24px;">4. Liability Allocation &amp; Indemnification</h2>
  <p style="margin-bottom: 12px;"><strong>4.1 Vehicle Liability.</strong> Host retains all tort liability, product liability, and regulatory liability for the vehicles. uRide is not the vehicle owner, lessor, or insurer and shall not be held liable for any accident, injury, damage, or regulatory violation arising from the use, condition, or operation of any vehicle.</p>
  <p style="margin-bottom: 12px;"><strong>4.2 Host Indemnification.</strong> Host agrees to indemnify, defend, and hold harmless uRide, its officers, directors, employees, and agents from and against any and all claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys' fees) arising out of or related to: (a) the condition, operation, or use of any vehicle; (b) any accident or injury involving a vehicle; (c) Host's failure to maintain insurance, registration, or compliance; (d) any breach of this Agreement by Host; or (e) any negligence or willful misconduct by Host or Host's employees or agents.</p>
  <p style="margin-bottom: 12px;"><strong>4.3 uRide Indemnification.</strong> uRide agrees to indemnify, defend, and hold harmless Host from and against any and all claims arising out of: (a) errors in payment processing attributable to uRide; (b) uRide's negligence or willful misconduct; or (c) uRide's breach of this Agreement.</p>
  <p style="margin-bottom: 12px;"><strong>4.4 No Agency.</strong> Nothing in this Agreement creates a partnership, joint venture, employment, or agency relationship between uRide and Host. Host is an independent business operator using uRide as a platform and service provider.</p>

  <h2 style="font-size: 16px; border-bottom: 2px solid #e91e8c; padding-bottom: 4px; margin-top: 24px;">5. Payouts &amp; Payment Processing</h2>
  <p style="margin-bottom: 12px;">Where uRide processes customer payments, uRide will remit net payouts to the Host on the schedule selected by Host (weekly, biweekly, or monthly). Net payout is calculated as: Gross booking amount minus uRide platform fee minus Stripe processing fees minus any receivable offsets or holds.</p>
  <p style="margin-bottom: 12px;">uRide reserves the right to hold payouts for: (a) active disputes or chargebacks; (b) compliance violations; (c) chargeback protection windows (up to 48 hours after confirmed vehicle pickup); or (d) admin override for suspected fraud or regulatory issues.</p>

  <h2 style="font-size: 16px; border-bottom: 2px solid #e91e8c; padding-bottom: 4px; margin-top: 24px;">6. Telematics &amp; Enforcement</h2>
  <p style="margin-bottom: 12px;">Host authorizes uRide to install, monitor, and control telematics devices (GPS trackers, starter interrupts) on Host's vehicles for the purposes of: (a) vehicle location tracking; (b) theft recovery; (c) payment enforcement (starter disable for non-payment); and (d) safety monitoring. Host acknowledges that starter interrupt commands may be sent on Host's vehicles for payment enforcement purposes in accordance with uRide's rental policies.</p>

  <h2 style="font-size: 16px; border-bottom: 2px solid #e91e8c; padding-bottom: 4px; margin-top: 24px;">7. Term &amp; Termination</h2>
  <p style="margin-bottom: 12px;">This Agreement is effective upon electronic acceptance and continues until terminated by either party with 30 days written notice. Upon termination: (a) Host's vehicles will be removed from the marketplace; (b) uRide will remit all final payouts within 14 days; (c) Host must return any uRide-owned telematics devices; (d) Host remains liable for all obligations accrued before termination.</p>
  <p style="margin-bottom: 12px;">uRide may suspend or terminate this Agreement immediately for: (a) fraud or misrepresentation; (b) regulatory violations; (c) repeated customer complaints; (d) failure to maintain insurance or compliance; or (e) breach of this Agreement.</p>

  <h2 style="font-size: 16px; border-bottom: 2px solid #e91e8c; padding-bottom: 4px; margin-top: 24px;">8. Customer Rental Agreements</h2>
  <p style="margin-bottom: 12px;">For Marketplace Partner and Hybrid Growth plans, the rental agreement between Host and Host's customers is a separate agreement. uRide acts as the payment processor and platform facilitator for those agreements but is not a party to them. Host is the lessor and vehicle owner in all customer rental agreements. uRide's role in customer contracts is limited to payment processing, identity verification, and enforcement (GPS/starter) on Host's behalf.</p>

  <h2 style="font-size: 16px; border-bottom: 2px solid #e91e8c; padding-bottom: 4px; margin-top: 24px;">9. Electronic Signature &amp; Acceptance</h2>
  <p style="margin-bottom: 12px;">By typing your legal name below and clicking "Sign Agreement," you acknowledge that you have read, understood, and agreed to all terms of this Agreement. Your typed name constitutes your electronic signature, which is legally binding under the Electronic Signatures in Global and National Commerce Act (E-SIGN) and applicable state law. Your signature timestamp, IP address, and device information will be recorded as evidence of acceptance.</p>

  <div style="margin-top: 32px; padding: 16px; border: 2px dashed #e91e8c; border-radius: 12px; background: #fdf2f8;">
    <p style="margin: 0 0 8px; font-size: 13px; color: #666;">Host (Signer):</p>
    <p style="margin: 0; font-size: 18px; font-weight: 600; color: #1a1a1a;">${hostLegalName}</p>
    <p style="margin: 4px 0 0; font-size: 13px; color: #666;">${host.email}</p>
  </div>
</div>
`;
}

async function authorize(base44, req) {
  const user = await base44.auth.me().catch(() => null);
  if (!user) return { ok: false, response: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  return { ok: true, user };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const auth = await authorize(base44, req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const body = await req.json().catch(() => ({}));
    const { host_id, action, signature_name } = body;

    if (!host_id) return Response.json({ error: 'host_id is required' }, { status: 400 });

    const host = await base44.asServiceRole.entities.Host.get(host_id);
    if (!host) return Response.json({ error: 'Host not found' }, { status: 404 });

    const isOwner = host.email === user.email || host.user_id === user.id;
    if (!isOwner && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Resolve plan type from commerce profile or operator plan
    const commerceProfiles = await base44.asServiceRole.entities.HostCommerceProfile.filter({ host_id }, '-updated_date', 1).catch(() => []);
    const plans = await base44.asServiceRole.entities.OperatorPlanConfiguration.filter({ host_id }, '-updated_date', 1).catch(() => []);
    const planType = commerceProfiles[0]?.plan_type || plans[0]?.active_mode || plans[0]?.selected_mode || 'marketplace_partner';
    const details = PLAN_DETAILS[planType] || PLAN_DETAILS.marketplace_partner;
    const commissionRate = commerceProfiles[0]?.commission_rate ?? details.commissionRate;
    const monthlyAmount = details.monthlyAmount;

    // Check for existing agreement
    const existing = await base44.asServiceRole.entities.HostPlatformAgreement.filter({ host_id }, '-updated_date', 1).catch(() => []);
    const currentAgreement = existing[0];

    // ── SIGN action ──
    if (action === 'sign') {
      if (!signature_name || signature_name.trim().length < 2) {
        return Response.json({ error: 'Full legal name is required to sign' }, { status: 400 });
      }

      const agreementHTML = generateAgreementHTML(host, planType, commissionRate, monthlyAmount);
      const now = new Date().toISOString();
      const deviceInfo = req.headers.get('user-agent') || 'unknown';
      const forwarded = req.headers.get('x-forwarded-for');
      const ipAddress = forwarded ? forwarded.split(',')[0].trim() : null;

      // Supersede any prior signed agreement
      if (currentAgreement?.id && currentAgreement.status === 'signed') {
        await base44.asServiceRole.entities.HostPlatformAgreement.update(currentAgreement.id, {
          status: 'superseded',
          superseded_at: now,
        }).catch(() => {});
      }

      // Create or update the agreement record as signed
      const signedPayload = {
        host_id,
        host_email: host.email,
        host_name: host.business_name || host.full_name || host.email,
        plan_type: planType,
        plan_label: details.label,
        commission_rate: commissionRate,
        monthly_subscription_amount: monthlyAmount,
        agreement_version: AGREEMENT_VERSION,
        agreement_html: agreementHTML,
        status: 'signed',
        signed_at: now,
        signature_name: signature_name.trim(),
        signature_user_id: user.id,
        signature_email: user.email,
        signature_ip_address: ipAddress,
        signature_device_info: deviceInfo,
        signed_via: currentAgreement?.signed_via === 'backfill' ? 'backfill' : (currentAgreement ? 'plan_change' : 'onboarding'),
      };

      let agreement;
      if (currentAgreement?.id && currentAgreement.status === 'pending_signature') {
        agreement = await base44.asServiceRole.entities.HostPlatformAgreement.update(currentAgreement.id, signedPayload);
      } else {
        agreement = await base44.asServiceRole.entities.HostPlatformAgreement.create(signedPayload);
      }

      // Log activity
      await base44.asServiceRole.entities.ActivityEvent.create({
        event_type: 'host.platform_agreement_signed',
        actor_id: user.id,
        actor_email: user.email,
        actor_role: user.role || 'host',
        target_entity: 'HostPlatformAgreement',
        target_id: agreement.id,
        host_id,
        summary: `Platform Services Agreement signed by ${signature_name.trim()} (${details.label}, ${AGREEMENT_VERSION})`,
        metadata: { plan_type: planType, commission_rate: commissionRate, agreement_version: AGREEMENT_VERSION, signed_via: signedPayload.signed_via },
        source: 'host_action',
        event_status: 'success',
      }).catch(() => {});

      return Response.json({
        ok: true,
        agreement_id: agreement.id,
        status: 'signed',
        signed_at: now,
        plan_type: planType,
        plan_label: details.label,
        agreement_version: AGREEMENT_VERSION,
      });
    }

    // ── GET action (return agreement for review) ──
    const agreementHTML = generateAgreementHTML(host, planType, commissionRate, monthlyAmount);

    return Response.json({
      ok: true,
      host_id,
      host_name: host.business_name || host.full_name || host.email,
      plan_type: planType,
      plan_label: details.label,
      commission_rate: commissionRate,
      monthly_subscription_amount: monthlyAmount,
      agreement_version: AGREEMENT_VERSION,
      agreement_html: agreementHTML,
      current_status: currentAgreement?.status || 'pending_signature',
      signed_at: currentAgreement?.signed_at || null,
      signature_name: currentAgreement?.signature_name || null,
    });
  } catch (error) {
    console.error('[generatePlatformAgreement] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});