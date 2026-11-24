import React from "react";

/** Shared iOS-style shell for every flyer screen: 310x560, dark, magenta-accented. */
export default function ScreenChrome({ title, children }) {
  return (
    <div
      style={{
        position: "relative",
        width: 310,
        height: 560,
        background: "#0a0b0f",
        color: "#F5F5F7",
        fontFamily: "Inter, -apple-system, 'Segoe UI', sans-serif",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 6,
          left: "50%",
          transform: "translateX(-50%)",
          width: 74,
          height: 15,
          borderRadius: 8,
          background: "#000000",
        }}
      />

      <div
        style={{
          height: 30,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          fontSize: 10.5,
          fontWeight: 700,
        }}
      >
        <span>9:41</span>
        <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ display: "flex", gap: 2, alignItems: "flex-end" }}>
            {[4, 6, 8, 10].map((h) => (
              <i
                key={h}
                style={{
                  display: "block",
                  width: 2.5,
                  height: h,
                  background: "#ffffff",
                  borderRadius: 1,
                  opacity: 0.9,
                }}
              />
            ))}
          </span>
          <span
            style={{
              position: "relative",
              width: 17,
              height: 8,
              border: "1px solid rgba(255,255,255,0.5)",
              borderRadius: 2,
            }}
          >
            <i
              style={{
                position: "absolute",
                inset: 1.5,
                width: 9,
                background: "#ffffff",
                borderRadius: 1,
                display: "block",
              }}
            />
          </span>
        </span>
      </div>

      {title && (
        <div
          style={{
            flexShrink: 0,
            padding: "2px 16px 9px",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#8E8E93",
          }}
        >
          {title}
        </div>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          padding: "0 13px 13px",
          display: "flex",
          flexDirection: "column",
          gap: 9,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function ScreenRow({ label, value, tone = "#F5F5F7" }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "rgba(255,255,255,0.045)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 11,
        padding: "9px 11px",
      }}
    >
      <span style={{ fontSize: 10.5, color: "#8E8E93" }}>{label}</span>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: tone }}>{value}</span>
    </div>
  );
}