import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const { style_prompt, logo_type } = payload;
    
    if (!style_prompt) {
      return Response.json({ error: "style_prompt required" }, { status: 400 });
    }

    const hosts = await base44.asServiceRole.entities.Host.filter({ user_id: user.id });
    const host = hosts[0];
    if (!host) return Response.json({ error: 'Host not found' }, { status: 404 });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: "2023-10-16" });
    const generationsUsed = host.logo_generations_used || 0;
    
    // FREE LIMIT = 2
    if (generationsUsed >= 2) {
      if (!payload.payment_intent_id) {
        let stripeCustomerId = host.logo_stripe_customer_id;
        if (!stripeCustomerId) {
          const customer = await stripe.customers.create({ email: user.email, name: host.business_name });
          stripeCustomerId = customer.id;
          await base44.asServiceRole.entities.Host.update(host.id, { logo_stripe_customer_id: stripeCustomerId });
        }
        const intent = await stripe.paymentIntents.create({
          amount: 500, // $5.00
          currency: 'usd',
          customer: stripeCustomerId,
          description: `AI Generation - ${logo_type === "icon" ? "App Icon" : "Business Logo"}`,
          automatic_payment_methods: { enabled: true },
        });
        return Response.json({ requires_payment: true, client_secret: intent.client_secret });
      }

      const intent = await stripe.paymentIntents.retrieve(payload.payment_intent_id);
      if (intent.status !== "succeeded") {
        return Response.json({ error: "Payment not completed" }, { status: 400 });
      }
    }

    const businessName = host.business_name || "Rental Business";
    let prompt = "";
    
    if (logo_type === "icon") {
      prompt = `A minimalist, modern, premium iOS app icon for a car rental business. 
Style: ${style_prompt}. 
Solid background. No text, no letters, no words. Just a clean vector-style icon symbol suitable for an app. Center aligned, balanced padding.`;
    } else {
      prompt = `A professional, premium logo for a vehicle rental business called "${businessName}". 
Style: ${style_prompt}. 
Clean, modern, vector-style corporate logo on a white background.`;
    }

    // Call custom generateImage
    const { data: result } = await base44.asServiceRole.functions.invoke("generateImage", { prompt });

    if (!result || !result.url) {
      throw new Error("Invalid response from generateImage");
    }

    const logoObject = {
      url: result.url,
      prompt: prompt,
      style: style_prompt,
      model: result.model || "imagen-4.0-generate-001",
      provider: result.provider || "google",
      storage_provider: result.storage_provider || "cloudflare_r2",
      created_at: new Date().toISOString()
    };

    if (logo_type === "icon") {
      const generated_icons = host.generated_icons || [];
      generated_icons.push(logoObject);
      await base44.asServiceRole.entities.Host.update(host.id, {
        generated_icons,
        logo_generations_used: generationsUsed + 1
      });
    } else {
      const generated_logos = host.generated_logos || [];
      generated_logos.push(logoObject);
      await base44.asServiceRole.entities.Host.update(host.id, {
        generated_logos,
        logo_generations_used: generationsUsed + 1
      });
    }

    await base44.asServiceRole.entities.AIUsageLog.create({
      provider: "google",
      model: result.model || "imagen-4.0-generate-001",
      function_name: "generateHostLogo",
      image_count: 1,
      estimated_cost: 0.03,
      user_id: user.id,
      success: true
    });

    return Response.json({ 
      url: result.url, 
      logoObject: logoObject 
    });

  } catch (error) {
    console.error("generateHostLogo error:", error);
    await base44.asServiceRole.entities.AIUsageLog.create({
      provider: "google",
      model: "imagen-4.0-generate-001",
      function_name: "generateHostLogo",
      success: false,
      error_message: error.message
    });
    return Response.json({ error: error.message }, { status: 500 });
  }
});