import React from "react";
import FlyerIcon from "./FlyerIcon";

/**
 * The four-benefit strip: white line icon, label beneath, hairline separators
 * between columns. Column geometry is the master's (160 + i * 245).
 */
export default function BenefitRow({ benefits = [] }) {
  const cols = benefits.slice(0, 4);

  return (
    <g fontFamily="Arial, Helvetica, sans-serif">
      {cols.map((benefit, i) => {
        const cx = 160 + i * 245;
        return (
          <g key={`${benefit.label}-${i}`}>
            <FlyerIcon name={benefit.icon} cx={cx} cy={910} size={46} />
            <text
              x={cx}
              y={986}
              fill="#ffffff"
              textAnchor="middle"
              fontSize="25"
              fontWeight="bold"
            >
              {benefit.label}
            </text>
            {i < cols.length - 1 && (
              <line
                x1={cx + 122.5}
                y1={874}
                x2={cx + 122.5}
                y2={946}
                stroke="#ffffff"
                strokeOpacity="0.34"
                strokeWidth="1.5"
              />
            )}
          </g>
        );
      })}
    </g>
  );
}