import React from 'react';
import lightModeLogo from '../assets/logo-netlify-monogram-fullcolor-lightmode.svg';

export default function NetlifyLogo({ size = 32 }) {
  const h = size;
  const w = Math.round((128 / 112.635) * h);
  return <img src={lightModeLogo} width={w} height={h} alt="Netlify" />;
}
