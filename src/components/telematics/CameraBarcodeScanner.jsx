import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, XCircle } from "lucide-react";

const SCAN_TIMEOUT_MS = 20000;

function errorMessage(error) {
  const name = error?.name || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "Camera permission was denied. Please allow camera access or enter manually.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "No camera found on this device. Please enter manually.";
  if (name === "NotReadableError") return "Camera is already in use by another app. Please close it or enter manually.";
  return "Camera scanning is not supported on this device. Please enter manually.";
}

export default function CameraBarcodeScanner({ open, onOpenChange, title = "Scan Code", helper = "Point your camera at the code.", formats = ["qr_code", "code_128", "code_39", "ean_13"], onDetected }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const frameRef = useRef(null);
  const timeoutRef = useRef(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const stop = () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    if (!open) {
      stop();
      setStatus("idle");
      setMessage("");
      return undefined;
    }

    let cancelled = false;

    const start = async () => {
      setStatus("starting");
      setMessage("");

      if (!navigator.mediaDevices?.getUserMedia || typeof window.BarcodeDetector === "undefined") {
        setStatus("error");
        setMessage("Camera scanning is not supported on this device. Please enter manually.");
        return;
      }

      try {
        let detectorFormats = formats;
        if (typeof window.BarcodeDetector.getSupportedFormats === "function") {
          const supported = await window.BarcodeDetector.getSupportedFormats();
          detectorFormats = formats.filter((format) => supported.includes(format));
          if (detectorFormats.length === 0) {
            setStatus("error");
            setMessage("Camera scanning is not supported on this device. Please enter manually.");
            return;
          }
        }
        detectorRef.current = new window.BarcodeDetector({ formats: detectorFormats });
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStatus("scanning");

        timeoutRef.current = setTimeout(() => {
          setStatus("error");
          setMessage("Scan timed out. Please try again or enter manually.");
          stop();
        }, SCAN_TIMEOUT_MS);

        const scan = async () => {
          if (!videoRef.current || !detectorRef.current || cancelled) return;
          try {
            const codes = await detectorRef.current.detect(videoRef.current);
            const value = codes?.[0]?.rawValue;
            if (value) {
              stop();
              setStatus("success");
              onDetected(value);
              return;
            }
          } catch {
            setStatus("error");
            setMessage("Unable to read this code. Please try again or enter manually.");
            stop();
            return;
          }
          frameRef.current = requestAnimationFrame(scan);
        };
        frameRef.current = requestAnimationFrame(scan);
      } catch (error) {
        setStatus("error");
        setMessage(errorMessage(error));
        stop();
      }
    };

    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, formats, onDetected]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl bg-white text-slate-950">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="overflow-hidden rounded-3xl bg-slate-950">
            <video ref={videoRef} playsInline muted className="h-72 w-full object-cover" />
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">
            {status === "starting" && <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Opening camera…</span>}
            {status === "scanning" && <span className="flex items-center gap-2"><Camera className="h-4 w-4" />{helper}</span>}
            {status === "error" && <span className="flex items-center gap-2 text-red-600"><XCircle className="h-4 w-4" />{message}</span>}
            {status === "idle" && helper}
          </div>
          <Button variant="outline" className="w-full rounded-2xl" onClick={() => onOpenChange(false)}>Enter Manually</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}