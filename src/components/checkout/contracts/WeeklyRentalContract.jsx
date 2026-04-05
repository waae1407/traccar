import { format } from "date-fns";

export function generateWeeklyContract(booking) {
  const date = format(new Date(), "MMMM d, yyyy");
  return `
<div style="font-family: Arial, sans-serif; color: #111; line-height: 1.7; max-width: 620px;">
  <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e91e8c;">
    <h1 style="color: #e91e8c; font-size: 22px; margin: 0;">uRide</h1>
    <h2 style="font-size: 16px; margin-top: 8px; color: #333;">Weekly Vehicle Rental Agreement</h2>
    <p style="font-size: 12px; color: #666;">Agreement Date: ${date} · Version: WR-v2.0</p>
  </div>

  <p><strong>Customer:</strong> ${booking?.customer_full_name || "—"}</p>
  <p><strong>Vehicle:</strong> ${booking?.vehicle_name || "—"}</p>
  <p><strong>City:</strong> ${booking?.city || "—"}</p>
  <p><strong>Rental Type:</strong> Weekly Rental</p>
  ${booking?.start_date ? `<p><strong>Start Date:</strong> ${booking.start_date}</p>` : ""}
  ${booking?.end_date ? `<p><strong>End Date:</strong> ${booking.end_date}</p>` : ""}

  <hr style="margin: 16px 0; border-color: #eee;" />
  <h3 style="color: #333;">1. Payment Terms</h3>
  <p><strong>Weekly Rate:</strong> $${booking?.weekly_rate || 0}</p>
  <p><strong>Security Deposit:</strong> $${booking?.deposit_amount || 0}</p>
  <p><strong>Total Due Today:</strong> $${booking?.total_due_now || 0}</p>
  <p>Payments are due each week on the same day as the start date. Late payments may incur a fee and may result in suspension of rental privileges.</p>
  ${booking?.auto_renew ? "<p>This rental is set to <strong>auto-renew weekly</strong> until cancelled by either party.</p>" : "<p>This rental does <strong>not</strong> auto-renew. Customer must manually renew before the end date to continue renting.</p>"}

  <hr style="margin: 16px 0; border-color: #eee;" />
  <h3 style="color: #333;">2. Vehicle Use & Responsibilities</h3>
  <p>The vehicle must be used only for lawful purposes and within the agreed city of rental. Use outside the agreed city requires prior written consent from uRide.</p>
  <p>Customer is responsible for all traffic violations, tolls, and parking fines incurred during the rental period.</p>
  <p>Smoking, pets, and unauthorized modifications to the vehicle are strictly prohibited.</p>
  <p>The vehicle must be returned with a full tank of fuel. Failure to do so will result in a refueling fee charged to the customer.</p>

  <hr style="margin: 16px 0; border-color: #eee;" />
  <h3 style="color: #333;">3. Damage & Insurance</h3>
  <p>Customer is responsible for any damage to the vehicle not covered by provided insurance. uRide will document vehicle condition at pickup via photos.</p>
  <p>Any damage discovered at return that was not present at pickup will be assessed and billed to the customer's payment method on file.</p>

  <hr style="margin: 16px 0; border-color: #eee;" />
  <h3 style="color: #2e7d32; background: #f1f8e9; padding: 10px; border-left: 4px solid #66bb6a; border-radius: 4px;">4. Clean Return Incentive — $50 Credit</h3>
  <p>Customer may receive a <strong>$50 refund or credit</strong> if the vehicle is returned in a clean, detailed condition comparable to its condition at pickup.</p>
  <p>Eligibility requires:</p>
  <ul>
    <li>Interior free of trash, food debris, and stains</li>
    <li>Exterior reasonably clean with no new dirt accumulation beyond normal use</li>
    <li>Customer must upload interior and exterior return photos via the app</li>
  </ul>
  <p>uRide will compare return photos against baseline pickup photos. The $50 credit is issued at uRide's discretion and applied via Stripe to the original payment method within 5–7 business days of return approval.</p>

  <hr style="margin: 16px 0; border-color: #eee;" />
  <h3 style="color: #333;">5. Photo Verification</h3>
  <p>At pickup, uRide staff will photograph the vehicle interior and exterior to establish a baseline condition record.</p>
  <p>At return, customer is required to upload photos of the vehicle's interior and exterior through the uRide app before the return is finalized. Failure to submit return photos forfeits eligibility for the Clean Return Incentive.</p>

  <hr style="margin: 16px 0; border-color: #eee;" />
  <h3 style="color: #333;">6. Cancellation</h3>
  <p>Customer may request cancellation at any time through their uRide account. Cancellations are subject to review and approval by uRide. Prepaid weeks are non-refundable unless cancellation is requested before the rental period begins.</p>

  <hr style="margin: 16px 0; border-color: #eee;" />
  <p style="font-size: 12px; color: #666;">By signing below, you confirm you have read, understood, and agree to all terms of this Weekly Rental Agreement. This electronic signature is legally binding.</p>
</div>`;
}