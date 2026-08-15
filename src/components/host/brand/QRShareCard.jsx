import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Copy, Check, Share2, QrCode, Globe } from "lucide-react";
import QRCode from "qrcode";

export default function QRShareCard({ slug, hostId }) {
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);

  // Look up the host's verified, active custom domain. When one exists we
  // share the branded URL instead of the internal uridehub.com path.
  const { data: domains = [] } = useQuery({
    queryKey: ["qr-share-custom-domain", hostId],
    queryFn: () => base44.entities.HostCustomDomain.filter({ host_id: hostId, active: true, verification_status: "verified" }),
    enabled: !!hostId,
  });
  const customDomain = domains[0];

  // The share URL goes through the server-side preview endpoint so that
  // messaging-app crawlers (which don't execute JS) see the host's logo and
  // business name in the link preview. Human visitors are redirected to the
  // live storefront by the endpoint.
  const origin = window.location.origin;
  const previewEndpoint = `${origin}/api/functions/getStorefrontSharePreview`;
  const shareUrl = customDomain?.domain
    ? `${previewEndpoint}?domain=${encodeURIComponent(customDomain.domain)}&slug=${encodeURIComponent(slug)}`
    : `${previewEndpoint}?slug=${encodeURIComponent(slug)}`;

  // The direct storefront URL (for QR code — humans scan and land directly)
  const directUrl = customDomain?.domain
    ? `https://${customDomain.domain.replace(/^https?:\/\//, "")}`
    : `${origin}/host/${slug}`;

  useEffect(() => {
    if (canvasRef.current && directUrl) {
      QRCode.toCanvas(canvasRef.current, directUrl, { width: 120, margin: 1, color: { dark: "#0f0c29", light: "#ffffff" } });
    }
  }, [directUrl]);

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    if (navigator.share) navigator.share({ title: "My Rental Store", url: shareUrl });
    else handleCopy();
  };

  const downloadQR = () => {
    const link = document.createElement("a");
    link.download = `${slug}-qr.png`;
    link.href = canvasRef.current.toDataURL();
    link.click();
  };

  if (!slug) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <QrCode className="h-4 w-4 text-pink-500" />
        <p className="font-bold text-gray-900 text-sm">Share Your Store</p>
        {customDomain?.domain && (
          <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700">
            <Globe className="h-3 w-3" /> Custom domain
          </span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <canvas ref={canvasRef} onClick={downloadQR} className="rounded-xl cursor-pointer flex-shrink-0" title="Click to download QR" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 mb-1.5 font-medium">Your share link</p>
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 mb-3">
            <p className="text-xs font-mono text-gray-600 truncate">{shareUrl}</p>
          </div>
          <p className="text-[10px] text-gray-400 mb-3">Uses your logo in link previews on iMessage, WhatsApp &amp; social media.</p>
          <div className="flex gap-2">
            <button onClick={handleCopy} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold border-2 border-gray-200 text-gray-600 hover:border-pink-300 hover:text-pink-600 transition-all">
              {copied ? <><Check className="h-3.5 w-3.5 text-emerald-500" /><span className="text-emerald-600">Copied!</span></> : <><Copy className="h-3.5 w-3.5" />Copy</>}
            </button>
            <button onClick={handleShare} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
              <Share2 className="h-3.5 w-3.5" /> Share
            </button>
          </div>
          <p className="text-[10px] text-gray-300 text-center mt-2">Click QR to download PNG</p>
        </div>
      </div>
    </div>
  );
}