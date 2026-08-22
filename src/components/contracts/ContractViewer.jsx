import React from "react";
import { Download, Printer, Shield, X, FileText } from "lucide-react";
import { format } from "date-fns";

/**
 * ContractViewer — Shared component for viewing and downloading signed rental contracts.
 * Used by customers (ContractModal), hosts (HostBooking360), and admins (Booking360).
 *
 * Download uses the browser's native print-to-PDF (window.print on a new window),
 * which is the most reliable cross-platform approach and preserves the signed
 * contract HTML exactly as stored on the booking record.
 */
export default function ContractViewer({ booking, onClose, viewerRole = "customer" }) {
  if (!booking) return null;

  const handleDownload = () => {
    const contractHTML = booking.contract_html || "<p>No contract document on file.</p>";
    const vehicleName = booking.vehicle_name || "Vehicle";
    const customerName = booking.customer_full_name || "Customer";
    const signedAt = booking.signed_at ? format(new Date(booking.signed_at), "MMMM d, yyyy 'at' h:mm a") : "";
    const signatureName = booking.signature_name || "";

    const printWindow = window.open("", "_blank", "width=800,height=900");
    if (!printWindow) {
      alert("Please allow pop-ups to download the contract.");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Rental Agreement — ${vehicleName} — ${customerName}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; color: #111; line-height: 1.7; max-width: 620px; margin: 0 auto; padding: 40px 20px; }
          @media print { body { padding: 0; } }
          .print-only { display: none; }
          @media print { .print-only { display: block; } .no-print { display: none; } }
          .signature-block { margin-top: 40px; padding: 20px; border: 2px dashed #e91e8c; border-radius: 12px; background: #fdf2f8; page-break-inside: avoid; }
          .signature-block p { margin: 4px 0; }
          .law-enforcement { margin: 20px 0; padding: 16px; border: 2px solid #3b82f6; border-radius: 8px; background: #eff6ff; page-break-inside: avoid; }
          .law-enforcement h3 { color: #1e40af; margin: 0 0 8px; font-size: 14px; }
          .law-enforcement p { color: #1e3a8a; font-size: 12px; margin: 4px 0; }
          h1 { color: #e91e8c; }
          h2 { font-size: 16px; color: #333; }
          hr { border: none; border-top: 1px solid #eee; margin: 16px 0; }
        </style>
      </head>
      <body>
        <div class="no-print" style="text-align: center; margin-bottom: 24px; padding: 16px; background: #f3f4f6; border-radius: 8px;">
          <button onclick="window.print()" style="background: #e91e8c; color: white; border: none; padding: 12px 32px; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer;">
            🖨️ Save as PDF / Print
          </button>
          <p style="color: #666; font-size: 12px; margin-top: 8px;">Click the button above and choose "Save as PDF" as the destination.</p>
        </div>

        <div class="law-enforcement">
          <h3>🛡️ Law Enforcement Authorization</h3>
          <p>This signed agreement authorizes <strong>${customerName}</strong> to operate <strong>${vehicleName}</strong>
          ${booking.start_date ? `from ${format(new Date(booking.start_date), "MMM d, yyyy")}` : ""}
          ${booking.end_date ? ` through ${format(new Date(booking.end_date), "MMM d, yyyy")}` : ""}.</p>
          ${signedAt ? `<p>Electronically signed on ${signedAt}.</p>` : ""}
          <p>Booking ID: ${booking.id?.slice(-12) || ""}</p>
        </div>

        ${contractHTML}

        ${signatureName ? `
        <div class="signature-block">
          <p style="font-size: 10px; color: #16a34a; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Electronically Signed</p>
          <p style="font-size: 16px; font-weight: bold; color: #15803d;">${signatureName}</p>
          ${signedAt ? `<p style="font-size: 11px; color: #16a34a;">${signedAt}</p>` : ""}
          <p style="font-size: 10px; color: #666; margin-top: 8px;">This electronic signature is legally binding under the E-SIGN Act and applicable state law.</p>
        </div>
        ` : ""}

        <script>
          window.onload = function() { setTimeout(function() { window.print(); }, 500); };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const hasContract = booking.contract_html && booking.contract_status === "signed";

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <Shield className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900 text-base" style={{ fontFamily: "var(--font-syne)" }}>
              Rental Agreement
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {booking.vehicle_name}
              {viewerRole !== "customer" && booking.customer_full_name ? ` · ${booking.customer_full_name}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasContract && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white active:scale-[0.98] transition-transform"
              style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Download PDF</span>
              <span className="sm:hidden">PDF</span>
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center">
              <X className="h-4 w-4 text-gray-500" />
            </button>
          )}
        </div>
      </div>

      {/* Law enforcement notice */}
      {hasContract && (
        <div className="mx-4 mt-3 px-4 py-3 rounded-2xl border border-blue-200 flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #eff6ff, #dbeafe)" }}>
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-blue-800">Law Enforcement Authorization</p>
              <p className="text-[11px] text-blue-700 mt-0.5">
                This signed agreement authorizes <strong>{booking.customer_full_name || "the renter"}</strong> to operate{" "}
                <strong>{booking.vehicle_name}</strong> from{" "}
                {booking.start_date ? format(new Date(booking.start_date), "MMM d, yyyy") : "—"}
                {booking.end_date ? ` through ${format(new Date(booking.end_date), "MMM d, yyyy")}` : ""}.
                {booking.signed_at && (
                  <> Electronically signed on {format(new Date(booking.signed_at), "MMMM d, yyyy 'at' h:mm a")}.</>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Contract content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {hasContract ? (
          <div
            className="prose prose-sm max-w-none text-gray-800 text-xs leading-relaxed"
            dangerouslySetInnerHTML={{ __html: booking.contract_html }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FileText className="h-12 w-12 text-gray-200 mb-3" />
            <p className="text-gray-400 text-sm">No signed contract on file{booking.contract_status ? ` (status: ${booking.contract_status})` : ""}.</p>
          </div>
        )}
      </div>

      {/* Signature footer */}
      {hasContract && booking.signature_name && (
        <div className="border-t border-gray-100 px-4 py-4 flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #f0fdf4, #dcfce7)" }}>
          <p className="text-[10px] text-green-600 font-bold uppercase tracking-wider mb-1">Electronically Signed</p>
          <p className="text-sm font-bold text-green-800">{booking.signature_name}</p>
          {booking.signed_at && (
            <p className="text-[11px] text-green-700 mt-0.5">
              {format(new Date(booking.signed_at), "MMMM d, yyyy 'at' h:mm a")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}