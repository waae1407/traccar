import { format } from "date-fns";

const TYPE_LABELS = {
  weekly_rental: "Weekly Rental Agreement",
  monthly_rental: "Monthly Rental Agreement",
  rent_to_own: "Rent-to-Own Agreement",
  commercial_fleet: "Commercial Fleet Agreement",
};

function money(value) {
  return `$${Number(value || 0).toLocaleString()}`;
}

export function generateContractDocument({ booking, contractType, isFleetOS, hostName }) {
  const label = TYPE_LABELS[contractType] || TYPE_LABELS.weekly_rental;
  const isRTO = contractType === "rent_to_own";
  const vehicleOwner = hostName || "Host Business";

  // FleetOS: host is the merchant/owner; uRide is software only.
  // Marketplace Partner: uRide is the payment processor/platform; host owns the vehicle
  // and (for RTO) is the seller responsible for title transfer and repossession.
  const provider = isFleetOS ? vehicleOwner : "uRide";
  const platformNote = isFleetOS
    ? "uRide provides software, booking records, and platform tools only. uRide is not the rental merchant, payment owner, lessor, seller, or payout recipient for this FleetOS agreement."
    : isRTO
      ? `uRide is the rental platform and payment processor for this agreement. uRide processes payments on behalf of ${vehicleOwner}. ${vehicleOwner} is the vehicle owner and is solely responsible for rent-to-own terms, title transfer, repossession, and forfeiture.`
      : `uRide is the rental platform and merchant for this agreement. Payments are processed by uRide on behalf of ${vehicleOwner}, the vehicle owner.`;
  const cadence = contractType === "monthly_rental" ? "monthly" : contractType === "commercial_fleet" ? "commercial fleet" : "weekly";
  const primaryAmount = contractType === "monthly_rental" ? booking?.monthly_rate || booking?.total_due_now || booking?.weekly_rate : booking?.weekly_rate;
  const rtoValue = Number(booking?.weekly_rate || 0) * 52;

  // For Marketplace Partner, split the provider header into platform vs. vehicle owner
  const providerHeader = isFleetOS
    ? `<p><strong>Provider / Contract Owner:</strong> ${provider}</p>`
    : `<p><strong>Platform &amp; Payment Processor:</strong> uRide</p>
       <p><strong>Vehicle Owner${isRTO ? " / RTO Provider" : ""}:</strong> ${vehicleOwner}</p>
       <p><strong>Payments Processed By:</strong> uRide on behalf of ${vehicleOwner}</p>`;

  // For Marketplace Partner RTO, ownership transfer is controlled by the host (vehicle owner)
  const ownershipEntity = isFleetOS ? provider : vehicleOwner;

  return `
<div style="font-family: Arial, sans-serif; color: #111; line-height: 1.7; max-width: 620px;">
  <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e91e8c;">
    <h1 style="color: #e91e8c; font-size: 22px; margin: 0;">${isFleetOS ? provider : "uRide"}</h1>
    <h2 style="font-size: 16px; margin-top: 8px; color: #333;">${label}</h2>
    <p style="font-size: 12px; color: #666;">Agreement Date: ${format(new Date(), "MMMM d, yyyy")}</p>
  </div>

  ${providerHeader}
  <p><strong>Customer:</strong> ${booking?.customer_full_name || "—"}</p>
  <p><strong>Vehicle:</strong> ${booking?.vehicle_name || "—"}</p>
  <p><strong>City:</strong> ${booking?.city || "—"}</p>
  <p><strong>Agreement Type:</strong> ${label}</p>
  ${booking?.start_date ? `<p><strong>Start Date:</strong> ${booking.start_date}</p>` : ""}
  ${booking?.end_date ? `<p><strong>End Date:</strong> ${booking.end_date}</p>` : ""}

  <hr style="margin: 16px 0; border-color: #eee;" />
  <h3 style="color: #333;">1. Payment Terms</h3>
  <p><strong>${contractType === "monthly_rental" ? "Monthly" : "Weekly"} Amount:</strong> ${money(primaryAmount)}</p>
  <p><strong>Total Due Today:</strong> ${money(booking?.total_due_now)}</p>
  <p>Payments are processed by uRide${isFleetOS ? "" : ` on behalf of ${vehicleOwner}`}. Payment timing, failed-payment handling, and collection requirements follow the provider policies included in this agreement.</p>
  ${isRTO ? `<p><strong>Total Rent-to-Own Program Value:</strong> ${money(rtoValue)} across 52 consecutive weekly payments. Ownership transfer terms are controlled by ${ownershipEntity}.</p>` : ""}

  <hr style="margin: 16px 0; border-color: #eee;" />
  <h3 style="color: #333;">2. Vehicle Use & Responsibilities</h3>
  <p>The vehicle must be used only for lawful purposes and according to ${isFleetOS ? provider : `${vehicleOwner}'s rental rules as enforced through the uRide platform`}, including geographic limits, maintenance requirements, and return procedures.</p>
  <p>Customer is responsible for tickets, tolls, misuse, cleaning issues, and damage beyond normal wear unless the provider policy states otherwise.</p>

  <hr style="margin: 16px 0; border-color: #eee;" />
  <h3 style="color: #333;">3. Insurance, Damage & Additional Charges</h3>
  <p>Customer must satisfy the insurance and eligibility requirements set by ${isFleetOS ? provider : vehicleOwner}. Additional charges may apply for damage, cleaning, missing items, tolls, or policy violations.</p>

  <hr style="margin: 16px 0; border-color: #eee;" />
  <h3 style="color: #333;">4. ${contractType === "commercial_fleet" ? "Commercial Fleet Operations" : "Return & Inspection"}</h3>
  <p>${contractType === "commercial_fleet" ? `${provider} controls authorized drivers, operating limits, vehicle swaps, downtime, inspections, and return standards.` : `Customer must complete pickup and return inspections as required. Return approval is based on provider review of photos and condition evidence.`}</p>

  <hr style="margin: 16px 0; border-color: #eee;" />
  <h3 style="color: #333;">5. Platform Role</h3>
  <p>${platformNote}</p>

  <hr style="margin: 16px 0; border-color: #eee;" />
  <p style="font-size: 12px; color: #666;">By signing below, customer confirms they have read, understood, and agreed to this ${cadence} agreement. This electronic signature is legally binding.</p>
</div>`;
}