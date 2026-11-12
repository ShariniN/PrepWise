import React from "react";

const CircularProgress = ({ percentage, label, colorIndex = 0, unavailable = false }) => {
  const colors = [
    { primary: "#4f46e5", secondary: "#e0e7ff", gradient: "from-primary-500 to-primary-600" },
    { primary: "#059669", secondary: "#d1fae5", gradient: "from-success-500 to-success-600" },
    { primary: "#d97706", secondary: "#fef3c7", gradient: "from-sun-500 to-sun-600" },
    { primary: "#dc2626", secondary: "#fee2e2", gradient: "from-danger-500 to-danger-600" },
    { primary: "#4338ca", secondary: "#ede9fe", gradient: "from-primary-500 to-primary-600" },
    { primary: "#0891b2", secondary: "#cffafe", gradient: "from-primary-500 to-primary-600" },
  ];
  const color = colors[colorIndex % colors.length];
  const strokeDasharray = 2 * Math.PI * 50;
  const strokeDashoffset = strokeDasharray - (strokeDasharray * percentage) / 100;

  return (
    <div className="flex flex-col items-center p-4 md:p-6 bg-surface rounded-3xl border border-line hover:shadow-card transition-all shadow-soft transform hover:scale-105">
      <div className="relative w-24 md:w-28 h-24 md:h-28 mb-4">
        <svg className="transform -rotate-90 w-full h-full">
          <circle
            cx="56"
            cy="56"
            r="50"
            stroke={color.secondary}
            strokeWidth="8"
            fill="none"
          />
          <circle
            cx="56"
            cy="56"
            r="50"
            stroke={color.primary}
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl md:text-2xl font-bold" style={{ color: color.primary }}>
            {unavailable ? '-' : `${percentage}%`}
          </span>
        </div>
      </div>
      <span className="text-sm font-semibold text-ink-2 text-center">{label}</span>
    </div>
  );
};

export default CircularProgress;
