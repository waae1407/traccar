import React from "react";
import { Link } from "react-router-dom";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <Link to="/" className="font-bold text-lg" style={{ fontFamily: "var(--font-syne, sans-serif)" }}>← uRide</Link>
      </nav>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-black mb-2" style={{ fontFamily: "var(--font-syne, sans-serif)" }}>Terms of Service</h1>
        <p className="text-white/40 text-sm mb-10">Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>

        <div className="space-y-8 text-white/70 leading-relaxed">
          <section>
            <h2 className="text-white font-bold text-lg mb-2">1. Acceptance of Terms</h2>
            <p>By accessing or using the uRide platform, you agree to be bound by these Terms of Service. If you do not agree, please do not use our services.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-lg mb-2">2. Eligibility</h2>
            <p>To use uRide, you must:</p>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li>Be at least 21 years of age</li>
              <li>Hold a valid driver's license</li>
              <li>Provide accurate identity and payment information</li>
              <li>Pass our identity verification process</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-bold text-lg mb-2">3. Vehicle Rentals</h2>
            <p>By booking a vehicle through uRide, you agree to:</p>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li>Use the vehicle only for lawful purposes</li>
              <li>Return the vehicle in the same condition as received</li>
              <li>Complete required pickup and drop-off photo inspections</li>
              <li>Make payments on time per your agreed schedule</li>
              <li>Not sublease or allow unauthorized drivers to operate the vehicle</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-bold text-lg mb-2">4. Payments and Billing</h2>
            <p>By providing payment information, you authorize uRide to charge your payment method on the agreed billing schedule. Late or missed payments may result in service suspension. All payments are processed securely via Stripe.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-lg mb-2">5. Cancellations</h2>
            <p>Cancellation requests are subject to admin review. Refunds, if applicable, are issued at our discretion based on the timing and circumstances of the cancellation. Active rentals require advance notice for cancellation.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-lg mb-2">6. Damage and Liability</h2>
            <p>You are responsible for any damage to the vehicle during your rental period. Damage discovered during our AI-assisted inspection process may result in additional charges. You agree to cooperate fully with any damage assessment.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-lg mb-2">7. Rent-to-Own Program</h2>
            <p>Rent-to-Own agreements are subject to additional terms outlined in your individual contract. Consistent on-time payments are required. Missed payments may result in vehicle repossession and contract termination.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-lg mb-2">8. Termination</h2>
            <p>uRide reserves the right to suspend or terminate your account for violation of these terms, non-payment, or fraudulent activity.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-lg mb-2">9. Limitation of Liability</h2>
            <p>uRide is not liable for indirect, incidental, or consequential damages arising from your use of our services. Our total liability is limited to the amount paid by you in the 30 days prior to the claim.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-lg mb-2">10. Contact Us</h2>
            <p>Questions about these Terms? Contact us at:<br />
            <a href="mailto:support@uride.app" className="text-pink-400 hover:text-pink-300">support@uride.app</a></p>
          </section>
        </div>
      </div>
    </div>
  );
}