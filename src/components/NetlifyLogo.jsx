import React from 'react';

// Netlify Spark mark — teal gradient square with dark N letterform
export default function NetlifyLogo({ size = 32 }) {
  const id = 'ntl-spark-grad';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Netlify"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#32e6e2" />
          <stop offset="100%" stopColor="#00c7b7" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="9" fill={`url(#${id})`} />
      <path
        d="M13 27 L13 13 L20 23 L27 13 L27 27"
        stroke="#0a0c10"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
