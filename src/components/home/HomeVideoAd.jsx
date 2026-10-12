import React, { useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";

const VIDEO_URL = "https://media.base44.com/videos/public/69cdfc01c15011a821c6ee7e/d3573de3b_Safe_Driving_Ad.mp4";

export default function HomeVideoAd() {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);

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

  return (
    <section className="relative w-full overflow-hidden bg-black">
      <div className="max-w-3xl mx-auto px-4 pt-10 pb-2">
        <div className="text-center mb-5">
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight" style={{ fontFamily: "var(--font-syne)" }}>
            Keyless. Contactless. Effortless.
          </h2>
          <p className="text-sm text-gray-500 mt-1.5 max-w-lg mx-auto">
            Real-time driving behavior monitoring — speed tracking, hard-braking detection, rapid-acceleration alerts, and weekly safety scorecards so you always know exactly how your vehicle is being driven.
          </p>
        </div>

        <div className="relative rounded-2xl overflow-hidden shadow-2xl group" style={{ aspectRatio: "16 / 9" }}>
          <video
            ref={videoRef}
            src={VIDEO_URL}
            autoPlay
            muted
            loop
            playsInline
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
        </div>
      </div>
    </section>
  );
}