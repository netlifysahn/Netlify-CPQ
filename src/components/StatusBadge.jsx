import React from 'react';

const VALID_TONES = new Set([
  'grey',
  'blue',
  'green',
  'red',
  'muted',
  'gold',
  'teal',
  'purple',
  'darkgreen',
]);

export default function StatusBadge({ label, tone = 'grey', className = '' }) {
  const resolvedTone = VALID_TONES.has(tone) ? tone : 'grey';
  const classes = ['status-badge', `status-${resolvedTone}`, className].filter(Boolean).join(' ');
  return <span className={classes}>{label}</span>;
}
