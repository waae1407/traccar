export function estimateWholesaleIntelligence(input = {}) {
  const mileagePenalty = Math.min((Number(input.mileage || 0) / 100000) * 0.18, 0.25);
  const base = Number(input.estimated_value || input.budget_max || 10000);
  const estimated_wholesale_value = Math.max(2500, Math.round(base * (1 - mileagePenalty)));
  const recommended_max_bid = Math.round(estimated_wholesale_value * 0.82);
  const suggested_hold_amount = Math.round(recommended_max_bid + 850 + 900 + 700 + 50);
  return {
    estimated_wholesale_value,
    recommended_max_bid,
    suggested_hold_amount,
    projected_rental_suitability: input.intended_use === "rental" ? "moderate" : "review_needed",
    liquidation_confidence: "placeholder_guidance_only",
    risk_level: mileagePenalty > 0.18 ? "medium" : "low",
    confidence_level: "low",
    risk_notes: ["Placeholder estimate only", "No Manheim/ACV/Copart/IAAI API call activated"],
  };
}