import React, { useRef, useState, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";

// All generated hero videos — the component rotates through these on each loop.
// Add new video URLs here as they're generated.
const VIDEOS = [
  {
    url: "https://media.base44.com/videos/public/69cdfc01c15011a821c6ee7e/640814b1a_Payment_Recovery_Flow.mp4",
    label: "Payment Recovery",
  },
  {
    url: "https://media.base44.com/videos/public/69cdfc01c15011a821c6ee7e/d7fe1be49_uRide_Hero_Ad_v2.mp4",
    label: "Cinematic Drive",
  },
  {
    url: "https://media.base44.com/videos/public/69cdfc01c15011a821c6ee7e/08795baff_uRide_Masterpiece_Ad.mp4",
    label: "Dashboard View",
  },
];

export default function HomeVideoAd() {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  // Advance to the next video when the current one ends.
  // `loop` is intentionally omitted — we handle cycling manually so each video
  // plays once then advances, giving a true rotation through all clips.
  const handleEnded = () => {
    setCurrentIdx((prev) => (prev + 1) % VIDEOS.length);
  };

  // Reset play state when the video source changes
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [currentIdx]);

  return (
    <section className="relative w-full overflow-hidden bg-black">
      <div className="max-w-3xl mx-auto px-4 pt-10 pb-2">
        <div className="text-center mb-5">
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight" style={{ fontFamily: "var(--font-syne)" }}>
            The Future of Car Rental
          </h2>
          <p className="text-sm text-gray-500 mt-1.5 max-w-lg mx-auto">
            One seamless experience — keyless contactless rentals, payment-protected revenue, real-time safe driving monitoring, and hold-to-confirm SOS emergency alerts. Everything connected, everything effortless.
          </p>
        </div>

        <div className="relative rounded-2xl overflow-hidden shadow-2xl group" style={{ aspectRatio: "16 / 9" }}>
          <video
            key={VIDEOS[currentIdx].url}
            ref={videoRef}
            src={VIDEOS[currentIdx].url}
            autoPlay
            muted
            playsInline
            onEnded={handleEnded}
            className="w-full h-full object-cover"
          />

          {/* Gradient overlay for controls legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />

          {/* Play/Pause control */}
          <button
            onClick={togglePlay}
            className="absolute bottom-3 left-3 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 text-white hover:bg-white/30 transition-all"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
          </button>

          {/* Mute control */}
          <button
            onClick={toggleMute}
            className="absolute bottom-3 left-16 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 text-white hover:bg-white/30 transition-all"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>

          {/* Rotation indicator dots */}
          <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5">
            {VIDEOS.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIdx(i)}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: i === currentIdx ? 20 : 6,
                  background: i === currentIdx ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
                }}
                aria-label={`Go to video ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}