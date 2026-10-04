import React from "react";

// Animation + utility CSS used by the Classic My Vehicle screen.
const CSS = `
  @keyframes weatherPulse {
    0% { box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 10px 28px rgba(0,0,0,0.28), 0 0 0px var(--weather-glow); }
    50% { box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 10px 28px rgba(0,0,0,0.28), 0 0 16px var(--weather-glow); }
    100% { box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 10px 28px rgba(0,0,0,0.28), 0 0 0px var(--weather-glow); }
  }
  .weather-card-animated { animation: weatherPulse 4s ease-in-out infinite; }

  @keyframes borderSpin {
    from { transform: translate(-50%, -50%) rotate(0deg); }
    to { transform: translate(-50%, -50%) rotate(360deg); }
  }
  .btn-loading-spin {
    border-color: transparent !important;
    box-shadow: 0 0 18px rgba(47,128,255,0.35) !important;
  }
  .btn-loading-spin::before {
    content: '';
    position: absolute;
    top: 50%; left: 50%;
    width: 250%; height: 250%;
    background: conic-gradient(from 0deg, transparent 70%, rgba(47,128,255,0.9) 100%);
    animation: borderSpin 0.8s linear infinite;
    z-index: 0;
  }
  .btn-loading-spin::after {
    content: '';
    position: absolute;
    inset: 2px;
    background: inherit;
    border-radius: inherit;
    z-index: 1;
  }
  .btn-loading-content {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    height: 100%;
  }
  @keyframes spinRays {
    0% { transform: scale(2.5) rotate(0deg); opacity: 0.8; }
    50% { transform: scale(2.5) rotate(180deg); opacity: 1; }
    100% { transform: scale(2.5) rotate(360deg); opacity: 0.8; }
  }
  .sun-rays-active { transform-origin: 100% 0%; animation: spinRays 120s linear infinite; }
  @keyframes pulseBeams {
    0% { transform: scale(2.5) rotate(0deg); opacity: 0.7; }
    50% { transform: scale(2.5) rotate(5deg); opacity: 1; }
    100% { transform: scale(2.5) rotate(0deg); opacity: 0.7; }
  }
  .moon-beams-active { transform-origin: 100% 0%; animation: pulseBeams 12s ease-in-out infinite; }
  @keyframes ambientGlow {
    0% { opacity: 0.7; transform: scale(1.5); }
    50% { opacity: 1; transform: scale(1.55); }
    100% { opacity: 0.7; transform: scale(1.5); }
  }
  .cloud-glow-active { transform-origin: 100% 0%; animation: ambientGlow 8s ease-in-out infinite; }

  @keyframes rainFall {
    0% { background-position: 0 0, 0px 0px, 0px 0px; }
    100% { background-position: 0 0, -20px 100px, -40px 200px; }
  }
  .rain-glow-active {
    background-image: radial-gradient(circle at 100% 0%, rgba(137,180,248,0.3) 0%, transparent 70%),
                      repeating-linear-gradient(20deg, transparent, transparent 15px, rgba(255,255,255,0.15) 15px, rgba(255,255,255,0.15) 16px),
                      repeating-linear-gradient(20deg, transparent, transparent 25px, rgba(255,255,255,0.08) 25px, rgba(255,255,255,0.08) 27px) !important;
    background-size: 100% 100%, 200% 200%, 200% 200%;
    animation: rainFall 1.2s linear infinite;
  }
  .storm-glow-active {
    background-image: radial-gradient(circle at 100% 0%, rgba(196,167,231,0.3) 0%, transparent 70%),
                      repeating-linear-gradient(25deg, transparent, transparent 10px, rgba(255,255,255,0.2) 10px, rgba(255,255,255,0.2) 11px),
                      repeating-linear-gradient(25deg, transparent, transparent 20px, rgba(255,255,255,0.1) 20px, rgba(255,255,255,0.1) 22px) !important;
    background-size: 100% 100%, 200% 200%, 200% 200%;
    animation: rainFall 0.8s linear infinite;
  }

  @keyframes snowFall {
    0% { background-position: 0 0, 0px 0px, 0px 0px; }
    100% { background-position: 0 0, -15px 50px, 20px 80px; }
  }
  .snow-glow-active {
    background-image: radial-gradient(circle at 100% 0%, rgba(167,228,242,0.3) 0%, transparent 70%),
                      radial-gradient(circle, rgba(255,255,255,0.6) 1.5px, transparent 1.5px),
                      radial-gradient(circle, rgba(255,255,255,0.3) 2.5px, transparent 2.5px) !important;
    background-size: 100% 100%, 30px 30px, 50px 50px;
    animation: snowFall 4s linear infinite;
  }
  @keyframes vehicleGlint {
    0%, 80% { transform: translateX(-150%) skewX(-20deg); opacity: 0; }
    85% { opacity: 0.15; }
    90% { transform: translateX(150%) skewX(-20deg); opacity: 0; }
    100% { transform: translateX(150%) skewX(-20deg); opacity: 0; }
  }
  .vehicle-glint {
    position: absolute;
    top: 0; bottom: 0; left: 0; right: 0;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent);
    animation: vehicleGlint 10s ease-in-out infinite;
    pointer-events: none;
    z-index: 5;
    mix-blend-mode: overlay;
  }
  @keyframes cherryPulse {
    0% { opacity: 0.5; transform: scale(0.9); }
    100% { opacity: 1; transform: scale(1.2); }
  }
  @keyframes smokeRise1 {
    0% { opacity: 0; transform: translateY(2px) translateX(0); }
    50% { opacity: 0.8; }
    100% { opacity: 0; transform: translateY(-6px) translateX(2px); }
  }
  @keyframes smokeRise2 {
    0% { opacity: 0; transform: translateY(4px) translateX(0); }
    50% { opacity: 0.5; }
    100% { opacity: 0; transform: translateY(-4px) translateX(-2px); }
  }
  .smoke-line-1 { animation: smokeRise1 2.5s infinite ease-out; }
  .smoke-line-2 { animation: smokeRise2 3s infinite ease-out; animation-delay: 1s; }
  @keyframes textMonitorPulse {
    0% { opacity: 0.6; text-shadow: 0 0 2px transparent; }
    50% { opacity: 1; text-shadow: 0 0 10px currentColor; }
    100% { opacity: 0.6; text-shadow: 0 0 2px transparent; }
  }
  .text-monitor-pulse { animation: textMonitorPulse 2.5s ease-in-out infinite; }

  /* ── Security Ticket Carousel ── */
  @keyframes ticketScroll {
    0% { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }
  .ticket-scroll-track {
    animation: ticketScroll 28s linear infinite;
  }
  .ticket-scroll-container:hover .ticket-scroll-track {
    animation-play-state: paused;
  }
  @keyframes postItAppear {
    0% { opacity: 0; transform: translateX(-50%) rotate(-2deg) scale(0.7) translateY(10px); }
    60% { opacity: 1; transform: translateX(-50%) rotate(-2deg) scale(1.05) translateY(-2px); }
    100% { opacity: 1; transform: translateX(-50%) rotate(-2deg) scale(1) translateY(0); }
  }
  .post-it-note { animation: postItAppear 0.4s ease-out; }
  @keyframes postItFade {
    0% { opacity: 1; }
    100% { opacity: 0; transform: translateX(-50%) rotate(-2deg) scale(0.9) translateY(-10px); }
  }
  .post-it-fade { animation: postItFade 0.3s ease-in forwards; }
  @keyframes alertBadgeShake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-2px); }
    75% { transform: translateX(2px); }
  }
  .alert-shake { animation: alertBadgeShake 0.3s ease-in-out 3; }
`;

export default function MyVehicleClassicStyles() {
  return <style>{CSS}</style>;
}