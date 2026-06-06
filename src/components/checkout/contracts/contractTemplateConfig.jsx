export const CONTRACT_TEMPLATE_TYPES = {
  Weekly: {
    type: "weekly_rental",
    label: "Weekly Rental Agreement",
    version: "WR-v2.0",
  },
  Monthly: {
    type: "monthly_rental",
    label: "Monthly Rental Agreement",
    version: "MR-v1.0",
  },
  "Rent-to-Own": {
    type: "rent_to_own",
    label: "Rent-to-Own Agreement",
    version: "RTO-v2.0",
  },
  Commercial: {
    type: "commercial_fleet",
    label: "Commercial Fleet Agreement",
    version: "CF-v1.0",
  },
};

export function templateForBookingType(bookingType) {
  return CONTRACT_TEMPLATE_TYPES[bookingType] || CONTRACT_TEMPLATE_TYPES.Weekly;
}