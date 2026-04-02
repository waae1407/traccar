import React from "react";
import { cn } from "@/lib/utils";

export default function CheckoutProgress({ steps, currentIndex }) {
  return (
    <div className="px-4 pb-3 pt-1">
      <div className="flex items-center gap-1">
        {steps.map((label, i) => (
          <React.Fragment key={i}>
            <div className="flex flex-col items-center gap-0.5">
              <div className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i < currentIndex ? "bg-pink-500" : i === currentIndex ? "bg-pink-500" : "bg-gray-200"
              )} style={{ width: i === currentIndex ? 24 : 12 }} />
            </div>
            {i < steps.length - 1 && <div className="flex-1 h-0.5 rounded-full bg-gray-100" />}
          </React.Fragment>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-1.5">
        Step {currentIndex + 1}: <span className="font-semibold text-gray-700">{steps[currentIndex]}</span>
      </p>
    </div>
  );
}