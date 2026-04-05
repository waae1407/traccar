import { format } from "date-fns";

export function generateRTOContract(booking) {
  const date = format(new Date(), "MMMM d, yyyy");
  const totalPayments = 52; // 52 weekly payments
  const totalContractValue = (booking?.weekly_rate || 0) * totalPayments;

  return `
<div style="font-family: Arial, sans-serif; color: #111; line-height: 1.7; max-width: 620px;">
  <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #7c3aed;">
    <h1 style="color: #7c3aed; font-size: 22px; margin: 0;">uRide</h1>
    <h2 style="font-size: 16px; margin-top: 8px; color: #333;">Rent-to-Own Agreement</h2>
    <p style="font-size: 12px; color: #666;">Agreement Date: ${date} · Version: RTO-v2.0</p>
  </div>

  <p><strong>Customer:</strong> ${booking?.customer_full_name || "—"}</p>
  <p><strong>Vehicle:</strong> ${booking?.vehicle_name || "—"}</p>
  <p><strong>City:</strong> ${booking?.city || "—"}</p>
  <p><strong>Agreement Type:</strong> Rent-to-Own (52-Week Ownership Program)</p>
  ${booking?.start_date ? `<p><strong>Start Date:</strong> ${booking.start_date}</p>` : ""}

  <hr style="margin: 16px 0; border-color: #eee;" />
  <h3 style="color: #333;">1. Payment Terms</h3>
  <p><strong>Weekly Payment:</strong> $${booking?.weekly_rate || 0}</p>
  <p><strong>Total Payments Required:</strong> ${totalPayments} consecutive weekly payments</p>
  <p><strong>Total Contract Value:</strong> $${totalContractValue.toLocaleString()}</p>
  <p><strong>Due Today:</strong> $${booking?.total_due_now || 0}</p>
  <p>Payments are automatically charged weekly on the same day as the start date. It is the customer's responsibility to ensure their payment method remains valid and funded.</p>

  <hr style="margin: 16px 0; border-color: #eee;" />
  <h3 style="color: #7c3aed; background: #f5f3ff; padding: 10px; border-left: 4px solid #7c3aed; border-radius: 4px;">2. Ownership Transfer Terms</h3>
  <p><strong>Ownership transfer occurs ONLY after all ${totalPayments} consecutive weekly payments have been successfully completed.</strong></p>
  <p>Upon successful completion of all required payments, uRide will initiate the title transfer process. The customer will receive the vehicle title within 30 days of the final payment confirmation.</p>
  <p>Partial completion of payments does not confer any ownership rights to the vehicle.</p>

  <hr style="margin: 16px 0; border-color: #eee;" />
  <h3 style="color: #c62828; background: #ffebee; padding: 10px; border-left: 4px solid #ef5350; border-radius: 4px;">3. Default, Missed Payments & Repossession</h3>
  <p><strong>Consecutive payment requirement:</strong> All ${totalPayments} payments must be made consecutively without interruption. Any missed, failed, or returned payment breaks the consecutive streak.</p>
  <p><strong>Upon missed payment:</strong></p>
  <ul>
    <li>Account status changes to "At Risk" immediately</li>
    <li>Customer will be notified by email and/or phone</li>
    <li>A 3-day grace period is provided to cure the default</li>
  </ul>
  <p><strong>Upon default (failure to cure within grace period):</strong></p>
  <ul>
    <li>uRide reserves the right to repossess the vehicle without further notice</li>
    <li>All prior payments made under this agreement are <strong>forfeited</strong> and non-refundable</li>
    <li>Customer is responsible for any repossession costs incurred by uRide</li>
    <li>Customer may be barred from future rentals or RTO programs</li>
  </ul>

  <hr style="margin: 16px 0; border-color: #eee;" />
  <h3 style="color: #333;">4. Vehicle Use & Maintenance</h3>
  <p>Customer is responsible for all routine maintenance of the vehicle throughout the contract period, including oil changes, tire rotations, and fluid top-offs. Failure to maintain the vehicle may void the ownership transfer.</p>
  <p>Vehicle must remain within the agreed city of rental unless prior written consent is obtained from uRide.</p>
  <p>Unauthorized modifications, subletting, or use of the vehicle for commercial rideshare purposes is strictly prohibited.</p>

  <hr style="margin: 16px 0; border-color: #eee;" />
  <h3 style="color: #2e7d32; background: #f1f8e9; padding: 10px; border-left: 4px solid #66bb6a; border-radius: 4px;">5. Clean Return Incentive — $50 Credit</h3>
  <p>If the RTO program is terminated (for any reason other than default) before completion, customer may receive a <strong>$50 credit</strong> if the vehicle is returned in clean, detailed condition comparable to its pickup condition.</p>
  <p>Customer must upload interior and exterior return photos via the uRide app. uRide will compare against baseline pickup photos and issue the credit at its discretion.</p>

  <hr style="margin: 16px 0; border-color: #eee;" />
  <h3 style="color: #333;">6. Photo Verification</h3>
  <p>At program start, uRide will photograph the vehicle to establish a baseline condition record. Upon return (if applicable), customer must submit interior and exterior photos through the app for condition comparison.</p>

  <hr style="margin: 16px 0; border-color: #eee;" />
  <h3 style="color: #333;">7. Early Payoff</h3>
  <p>Customer may request early payoff of the remaining balance at any time. Contact uRide support for the early payoff amount and process. Early payoff does not affect the title transfer entitlement.</p>

  <hr style="margin: 16px 0; border-color: #eee;" />
  <p style="font-size: 12px; color: #666; background: #fff8e1; padding: 10px; border-radius: 4px;"><strong>⚠️ Important Notice:</strong> This is a legally binding Rent-to-Own agreement. By signing, you acknowledge that missed payments will result in forfeiture of all prior payments and potential repossession of the vehicle. Please ensure you can meet all payment obligations before signing.</p>
  <p style="font-size: 12px; color: #666;">By signing below, you confirm you have read, understood, and agree to all terms of this Rent-to-Own Agreement. This electronic signature is legally binding.</p>
</div>`;
}