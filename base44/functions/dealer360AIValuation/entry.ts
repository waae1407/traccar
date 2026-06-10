/**
 * dealer360AIValuation
 *
 * Public-accessible AI wholesale valuation tool.
 * Can be called by hosts to get an instant estimate before submitting a sell request.
 * Also used internally by admin when running valuation on a sell request.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { vin, year, make, model, trim, mileage, condition, title_status, location, desired_minimum_price } = body;

    if (!vin && !make) return Response.json({ error: 'vin or make/model required' }, { status: 400 });

    const prompt = `You are an expert automotive wholesale valuation analyst with deep knowledge of US auction markets, dealer wholesale values, and retail pricing.

Vehicle Details:
- VIN: ${vin || 'Not provided'}
- Year: ${year || 'Unknown'}
- Make: ${make || 'Unknown'}
- Model: ${model || 'Unknown'}
- Trim: ${trim || 'Base/Unknown'}
- Mileage: ${mileage ? mileage.toLocaleString() + ' miles' : 'Unknown'}
- Condition: ${condition || 'good'} (excellent/good/fair/poor)
- Title Status: ${title_status || 'clean'}
- Location: ${location || 'USA'}
- Seller desired minimum: ${desired_minimum_price ? '$' + desired_minimum_price : 'Not specified'}

Provide a detailed wholesale automotive valuation. Consider:
1. Current US used car market conditions (2025-2026)
2. Mileage depreciation curves for this vehicle class
3. Regional market demand adjustments
4. Title status impact (salvage = 40-60% reduction, rebuilt = 20-30%)
5. Condition adjustments (excellent +10%, fair -15%, poor -30%)
6. Auction fee structures at major US auction houses

Return a JSON valuation with:
- wholesale_value: current wholesale market value in USD
- recommended_buy_price: what a wholesale buyer should pay (5-15% below wholesale)
- recommended_auction_min: minimum auction reserve to avoid loss (auction fees considered)
- recommended_public_price: recommended retail/Dealer360 public listing price  
- risk_score: "low", "medium", or "high" (based on title, condition, market demand)
- valuation_notes: 3-4 sentences with key factors driving this valuation
- uride_offer_suggested: uRide direct purchase offer (must be 12-18% below wholesale_value)
- confidence: "high", "medium", or "low" based on data available`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          wholesale_value: { type: 'number' },
          recommended_buy_price: { type: 'number' },
          recommended_auction_min: { type: 'number' },
          recommended_public_price: { type: 'number' },
          risk_score: { type: 'string' },
          valuation_notes: { type: 'string' },
          uride_offer_suggested: { type: 'number' },
          confidence: { type: 'string' },
        }
      }
    });

    return Response.json({ ok: true, valuation: result, vehicle: { vin, year, make, model, trim, mileage, condition, title_status, location } });

  } catch (error) {
    console.error('[dealer360AIValuation]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});