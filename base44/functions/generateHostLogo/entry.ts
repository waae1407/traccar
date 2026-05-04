import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
const FREE_GENERATIONS = 2;
const CHARGE_AMOUNT_CENTS = 500; // $5.00

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { host_id, type, business_name, brand_color, style_hint, logo_prompt, payment_method_id } = await req.json();
    // type: "logo" | "icon"

    if (!host_id || !type) return Response.json({ error: 'Missing host_id or type' }, { status: 400 });

    const hosts = await base44.asServiceRole.entities.Host.filter({ id: host_id });
    const host = hosts[0];
    if (!host) return Response.json({ error: 'Host not found' }, { status: 404 });

    const generationsUsed = host.logo_generations_used || 0;
    const isPaid = generationsUsed >= FREE_GENERATIONS;

    // Handle payment for paid generations
    if (isPaid) {
      if (!payment_method_id) {
        return Response.json({ error: 'payment_required', message: 'First 2 generations are free. A $5.00 charge is required for additional generations.' }, { status: 402 });
      }

      // Ensure Stripe customer exists
      let stripeCustomerId = host.logo_stripe_customer_id;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: host.email,
          name: host.full_name,
          metadata: { host_id: host.id },
        });
        stripeCustomerId = customer.id;
        await base44.asServiceRole.entities.Host.update(host_id, { logo_stripe_customer_id: stripeCustomerId });
      }

      // Charge $5
      const pi = await stripe.paymentIntents.create({
        amount: CHARGE_AMOUNT_CENTS,
        currency: 'usd',
        payment_method: payment_method_id,
        customer: stripeCustomerId,
        confirm: true,
        off_session: false,
        description: `uRide Logo Generation — ${business_name || host.business_name}`,
        metadata: { host_id: host.id, type },
      });

      if (pi.status !== 'succeeded') {
        return Response.json({ error: 'Payment failed', status: pi.status }, { status: 402 });
      }
    }

    // Build AI prompt
    const name = business_name || host.business_name || host.full_name;
    const color = brand_color || '#e91e8c';
    const hint = style_hint || 'professional, modern, car rental';

    let prompt;
    if (logo_prompt) {
      // Use the host's own custom description as the core of the prompt
      if (type === 'logo') {
        prompt = `Design a professional, high-quality business logo. The host describes it as: "${logo_prompt}". Style: ${hint}. Primary color: ${color}. Include the business name as text. Clean and modern, works on white or dark backgrounds. Square format, vector-style, transparent or white background.`;
      } else {
        prompt = `Design a minimalist app icon/favicon. The host describes it as: "${logo_prompt}". Style: ${hint}. Primary color: ${color}. Symbol or monogram only — NO text. Clean, geometric, square format, white or transparent background.`;
      }
    } else if (type === 'logo') {
      prompt = `Design a professional, high-quality business logo for a car rental company called "${name}". Style: ${hint}. Primary color: ${color}. The logo should include the business name as text, be clean and modern, work on white or dark backgrounds. Square format, clean vector-style illustration, no gradients on text, professional typography. Transparent or white background.`;
    } else {
      prompt = `Design a minimalist app icon / favicon for a car rental company called "${name}". Style: ${hint}. Primary color: ${color}. Should be a bold symbol or monogram only — NO text. Clean, geometric, works as a small icon, app icon, or favicon. White or transparent background. Square format.`;
    }

    const result = await base44.asServiceRole.integrations.Core.GenerateImage({ prompt });
    const imageUrl = result.url;

    // Save to host record
    const currentList = type === 'logo' ? (host.generated_logos || []) : (host.generated_icons || []);
    const updatedList = [...currentList, imageUrl];
    const updatePayload = {
      logo_generations_used: generationsUsed + 1,
      ...(type === 'logo' ? { generated_logos: updatedList } : { generated_icons: updatedList }),
    };
    await base44.asServiceRole.entities.Host.update(host_id, updatePayload);

    return Response.json({
      success: true,
      image_url: imageUrl,
      generations_used: generationsUsed + 1,
      was_free: !isPaid,
    });
  } catch (error) {
    console.error('[GenerateHostLogo] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});