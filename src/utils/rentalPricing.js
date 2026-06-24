/**
 * Smart rental pricing utility.
 * Calculates price for a given number of days based on vehicle rate settings.
 * Falls back intelligently if certain rates aren't set.
 */

/**
 * Calculate total rental price for a given number of days.
 * @param {object} vehicle - Vehicle entity
 * @param {number} days - Number of rental days
 * @returns {{ total: number, rate: number, unit: string, label: string } | null}
 */
export function calculateRentalPrice(vehicle, days) {
  if (!vehicle || !days || days <= 0) return null;

  const {
    daily_rate,
    weekly_rate,
    monthly_rate,
    allow_daily_booking,
    allow_weekly_booking,
    allow_monthly_booking,
  } = vehicle;

  // Monthly: 28+ days and monthly booking enabled
  if (days >= 28 && allow_monthly_booking && monthly_rate) {
    const months = Math.ceil(days / 30);
    return {
      total: months * monthly_rate,
      rate: monthly_rate,
      unit: "month",
      label: `${months} month${months > 1 ? "s" : ""} @ $${monthly_rate}/mo`,
    };
  }

  // Weekly: 7+ days and weekly booking enabled
  if (days >= 7 && allow_weekly_booking !== false && weekly_rate) {
    const weeks = Math.ceil(days / 7);
    return {
      total: weeks * weekly_rate,
      rate: weekly_rate,
      unit: "week",
      label: `${weeks} week${weeks > 1 ? "s" : ""} @ $${weekly_rate}/wk`,
    };
  }

  // Daily: daily booking enabled with explicit daily rate
  if (allow_daily_booking && daily_rate) {
    return {
      total: days * daily_rate,
      rate: daily_rate,
      unit: "day",
      label: `${days} day${days > 1 ? "s" : ""} @ $${daily_rate}/day`,
    };
  }

  // Fallback: derive daily rate from weekly rate
  if (weekly_rate) {
    const derivedDaily = weekly_rate / 7;
    let total = Math.round(days * derivedDaily * 100) / 100;

    // HARD CAP: For rentals under 7 days, never charge more than one weekly rate.
    // This prevents the weekly_rate from being used as a per-day rate.
    if (days < 7 && total > weekly_rate) {
      total = weekly_rate;
    }

    return {
      total,
      rate: Math.round(derivedDaily * 100) / 100,
      unit: "day",
      label: `${days} day${days > 1 ? "s" : ""} @ $${derivedDaily.toFixed(2)}/day (from weekly rate)`,
      derived: true,
    };
  }

  return null;
}

/**
 * Validate pricing integrity — catches overcharges and misuse of weekly rate as daily rate.
 *
 * RULE 1: Never use weekly_rate as a daily rate (e.g. $300/wk × 3 days = $900 is INVALID).
 * RULE 2: Never charge more than weekly_rate for rentals under 7 days.
 * RULE 3: Never charge more than monthly_rate for rentals under 28 days.
 *
 * @param {object} vehicle - Vehicle entity (or booking with weekly_rate/monthly_rate)
 * @param {number} days - Rental days
 * @param {number} chargedAmount - Actual amount charged or to be charged
 * @returns {{ valid: boolean, issues: string[] }}
 */
export function validatePricingIntegrity(vehicle, days, chargedAmount) {
  const issues = [];

  if (!vehicle || !chargedAmount || !days || days <= 0) return { valid: true, issues };

  const weeklyRate = vehicle.weekly_rate;
  const monthlyRate = vehicle.monthly_rate;

  // RULE 1: Never use weekly_rate as a daily rate
  if (weeklyRate && days > 1) {
    const perDayRate = chargedAmount / days;
    if (Math.abs(perDayRate - weeklyRate) < 0.01) {
      issues.push(`CRITICAL: Weekly rate ($${weeklyRate}) was used as daily rate for ${days} days = $${chargedAmount}`);
    }
  }

  // RULE 2: Never charge more than weekly_rate for rentals under 7 days
  if (days < 7 && weeklyRate && chargedAmount > weeklyRate) {
    issues.push(`OVERCHARGE: $${chargedAmount} for ${days} days exceeds weekly rate of $${weeklyRate}`);
  }

  // RULE 3: Never charge more than monthly_rate for rentals under 28 days
  if (days < 28 && monthlyRate && chargedAmount > monthlyRate) {
    issues.push(`OVERCHARGE: $${chargedAmount} for ${days} days exceeds monthly rate of $${monthlyRate}`);
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Get the primary display price for a vehicle card.
 * Returns the best available rate and unit.
 */
export function getDisplayPrice(vehicle) {
  if (!vehicle) return null;

  if (vehicle.allow_daily_booking && vehicle.daily_rate) {
    return { rate: vehicle.daily_rate, unit: "day", label: `$${vehicle.daily_rate}/day` };
  }
  if (vehicle.weekly_rate) {
    return { rate: vehicle.weekly_rate, unit: "week", label: `$${vehicle.weekly_rate}/wk` };
  }
  if (vehicle.allow_monthly_booking && vehicle.monthly_rate) {
    return { rate: vehicle.monthly_rate, unit: "month", label: `$${vehicle.monthly_rate}/mo` };
  }
  return null;
}

/**
 * Get minimum rental days for a vehicle (defaults to 7).
 */
export function getMinRentalDays(vehicle) {
  return vehicle?.minimum_rental_days || 7;
}

/**
 * Validate booking duration against vehicle constraints.
 * Returns null if valid, or an error string.
 */
export function validateRentalDuration(vehicle, days) {
  const min = getMinRentalDays(vehicle);
  if (days < min) {
    return `This vehicle requires a minimum rental period of ${min} day${min > 1 ? "s" : ""}.`;
  }
  if (vehicle?.maximum_rental_days && days > vehicle.maximum_rental_days) {
    return `This vehicle allows a maximum rental period of ${vehicle.maximum_rental_days} days.`;
  }
  return null;
}