import React, { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, XCircle } from "lucide-react";

const SCAN_TIMEOUT_MS = 30000;

const initialDiagnostics = {
  secureContext: typeof window !== "undefined" ? window.isSecureContext : false,
  mediaDevices: typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
  getUserMedia: "not started",
  cameraLabel: "unknown",
  scannerInitialized: false,
};

function cameraErrorMessage(error) {
  const name = error?.name || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "Camera permission denied. Please allow camera access in Safari settings or enter manually.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "Camera unavailable. No usable camera was found on this device.";
  if (name === "NotReadableError" || name === "TrackStartError") return "Camera unavailable. It may already be in use by another app.";
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") return "Camera unavailable with the requested rear-camera setting. Please try manually.";
  if (name === "NotSupportedError") return "Unsupported browser camera mode. Please try Safari/Chrome over HTTPS or enter manually.";
  if (name === "SecurityError") return "Insecure context. Camera scanning requires HTTPS.";
  return "Camera unavailable. Please try again or enter manually.";
}

function scannerErrorMessage(error) {
  if (!window.isSecureContext) return "Insecure context. Camera scanning requires HTTPS.";
  if (!navigator.mediaDevices?.getUserMedia) return "Unsupported browser. Camera access is not available in this browser.";
  return `Scanner library failed${error?.message ? `: ${error.message}` : "."}`;
}

function isExpectedNoScanError(error) {
  const name = error?.name || "";
  const message = error?.message || "";
  return name.includes("NotFound") || name.includes("Checksum") || name.includes("Format") || message.includes("No MultiFormat Readers");
}

export default function CameraBarcodeScanner({ open, onOpenChange, title = "Scan Code", helper = "Point your camera at the code.", onDetected }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const controlsRef = useRef(null);
  const timeoutRef = useRef(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [diagnostics, setDiagnostics] = useState(initialDiagnostics);

  const updateDiagnostics = (patch) => setDiagnostics((current) => ({ ...current, ...patch }));

  const stop = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    controlsRef.current?.stop?.();
    controlsRef.current = null;
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => {
    if (!open) {
      stop();
      setStatus("idle");
      setMessage("");
      setDiagnostics(initialDiagnostics);
      return undefined;
    }

    let cancelled = false;

    const start = async () => {
      setStatus("starting");
      setMessage("");
      setDiagnostics(initialDiagnostics);

      if (!window.isSecureContext) {
        setStatus("error");
        setMessage("Insecure context. Camera scanning requires HTTPS.");
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setMessage("Unsupported browser. Camera access is not available in this browser.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const [track] = stream.getVideoTracks();
        streamRef.current = stream;
        updateDiagnostics({
          getUserMedia: "success",
          cameraLabel: track?.label || "permission granted, label unavailable",
        });

        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        videoRef.current.setAttribute("webkit-playsinline", "true");
        await videoRef.current.play();

        const reader = new BrowserMultiFormatReader();
        updateDiagnostics({ scannerInitialized: true });
        setStatus("scanning");
        setMessage("No barcode detected yet.");

        timeoutRef.current = setTimeout(() => {
          setStatus("error");
          setMessage("No barcode detected yet. Please try again or enter manually.");
          stop();
        }, SCAN_TIMEOUT_MS);

        controlsRef.current = await reader.decodeFromVideoElement(videoRef.current, (result, error) => {
          if (cancelled) return;
          if (result?.getText?.()) {
            const value = result.getText();
            stop();
            setStatus("success");
            onDetected(value);
            return;
          }
          if (error && !isExpectedNoScanError(error)) {
            setStatus("error");
            setMessage(scannerErrorMessage(error));
            stop();
          }
        });
      } catch (error) {
        updateDiagnostics({ getUserMedia: "failure" });
        setStatus("error");
        setMessage(error?.name?.includes("Not") || error?.name?.includes("Security") || error?.name?.includes("Constraint") ? cameraErrorMessage(error) : scannerErrorMessage(error));
        stop();
      }
    };

    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, onDetected]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl bg-white text-slate-950">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-3xl bg-slate-950">
            <video ref={videoRef} playsInline muted autoPlay className="h-72 w-full object-cover" />
            {status === "starting" && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 text-white">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Opening camera…
              </div>
            )}
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">
            {status === "starting" && <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Opening camera…</span>}
            {status === "scanning" && <span className="flex items-center gap-2"><Camera className="h-4 w-4" />{message || helper}</span>}
            {status === "error" && <span className="flex items-center gap-2 text-red-600"><XCircle className="h-4 w-4" />{message}</span>}
            {status === "idle" && helper}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <p className="mb-2 font-bold text-slate-800">Scanner diagnostics</p>
            <p>Secure context: {diagnostics.secureContext ? "yes" : "no"}</p>
            <p>mediaDevices available: {diagnostics.mediaDevices ? "yes" : "no"}</p>
            <p>getUserMedia: {diagnostics.getUserMedia}</p>
            <p>Camera: {diagnostics.cameraLabel}</p>
            <p>Scanner initialized: {diagnostics.scannerInitialized ? "yes" : "no"}</p>
          </div>
          <Button variant="outline" className="w-full rounded-2xl" onClick={() => onOpenChange(false)}>Enter Manually</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}