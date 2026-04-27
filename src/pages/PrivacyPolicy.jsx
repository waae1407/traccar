import React from "react";
import { Link } from "react-router-dom";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <Link to="/" className="font-bold text-lg" style={{ fontFamily: "var(--font-syne, sans-serif)" }}>← uRide</Link>
      </nav>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-black mb-2" style={{ fontFamily: "var(--font-syne, sans-serif)" }}>Privacy Policy</h1>
        <p className="text-white/40 text-sm mb-10">Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>

        <div className="space-y-8 text-white/70 leading-relaxed">
          <section>
            <h2 className="text-white font-bold text-lg mb-2">1. Information We Collect</h2>
            <p>We collect information you provide directly to us, such as when you create an account, make a booking, or contact us for support. This includes:</p>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li>Name, email address, and phone number</li>
              <li>Driver's license and identity verification documents</li>
              <li>Payment information (processed securely via Stripe)</li>
              <li>GPS location data at the time of vehicle pickup and drop-off</li>
              <li>Vehicle inspection photos submitted through the app</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-bold text-lg mb-2">2. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li>Process and manage your vehicle rental bookings</li>
              <li>Verify your identity and driver's license</li>
              <li>Process payments and send receipts</li>
              <li>Send notifications about your rental status</li>
              <li>Improve our services and customer experience</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-bold text-lg mb-2">3. Google Sign-In</h2>
            <p>We offer sign-in via Google. When you use Google Sign-In, we receive your name and email address from Google. We do not receive your Google password. We use this information solely to create and manage your uRide account.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-lg mb-2">4. Information Sharing</h2>
            <p>We do not sell your personal information. We may share your information with:</p>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li>Stripe for payment processing</li>
              <li>Law enforcement if required by law</li>
              <li>Service providers who assist in our operations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-bold text-lg mb-2">5. Data Retention</h2>
            <p>We retain your information for as long as your account is active or as needed to provide services. You may request deletion of your account by contacting us.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-lg mb-2">6. Security</h2>
            <p>We implement industry-standard security measures to protect your personal information. All payment data is encrypted and handled by Stripe, a PCI-compliant payment processor.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-lg mb-2">7. Your Rights</h2>
            <p>You have the right to access, correct, or delete your personal information. To exercise these rights, please contact us at the email below.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-lg mb-2">8. Contact Us</h2>
            <p>If you have questions about this Privacy Policy, please contact us at:<br />
            <a href="mailto:support@uride.app" className="text-pink-400 hover:text-pink-300">support@uride.app</a></p>
          </section>
        </div>
      </div>
    </div>
  );
}