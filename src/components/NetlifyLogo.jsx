import React from 'react';

// Netlify Spark — the converging-lines N mark
// Simplified SVG interpretation of the official Spark logo
export default function NetlifyLogo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ntl-grad" x1="0" y1="0" x2="40" y2="40">
          <stop offset="0%" stopColor="#32e6e2" />
          <stop offset="100%" stopColor="#00c7b7" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="9" fill="url(#ntl-grad)" />
      {/* Stylized N with converging lines */}
      <path
        d="M12 28V12l6.5 10.5L25 12v16"
        stroke="#0e1e25"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <line x1="28" y1="14" x2="28" y2="26" stroke="#0e1e25" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}
