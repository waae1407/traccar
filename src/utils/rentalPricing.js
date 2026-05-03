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
    return {
      total: Math.round(days * derivedDaily * 100) / 100,
      rate: Math.round(derivedDaily * 100) / 100,
      unit: "day",
      label: `${days} day${days > 1 ? "s" : ""} @ $${(derivedDaily).toFixed(2)}/day (from weekly rate)`,
      derived: true,
    };
  }

  return null;
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