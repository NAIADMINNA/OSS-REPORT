import React from 'react';

interface DOELogoProps {
  className?: string;
  size?: number;
  customLogoUrl?: string | null;
}

export const DOELogo: React.FC<DOELogoProps> = ({
  className = '',
  size = 64,
  customLogoUrl,
}) => {
  if (customLogoUrl) {
    return (
      <img
        src={customLogoUrl}
        alt="ตราสัญลักษณ์ประจำศูนย์"
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={`inline-block select-none object-contain rounded-xl ${className}`}
      />
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`inline-block select-none ${className}`}
      aria-label="ตรากรมการจัดหางาน"
    >
      <defs>
        <radialGradient id="doeGoldGrad" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#FFF2A3" />
          <stop offset="35%" stopColor="#E5B232" />
          <stop offset="70%" stopColor="#C98F17" />
          <stop offset="100%" stopColor="#966107" />
        </radialGradient>
        <radialGradient id="doeBlueGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1E40AF" />
          <stop offset="70%" stopColor="#172554" />
          <stop offset="100%" stopColor="#0B1329" />
        </radialGradient>
        <filter id="doeShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* Outer lotus petal ring */}
      <circle cx="60" cy="60" r="56" fill="url(#doeGoldGrad)" filter="url(#doeShadow)" />
      
      {/* Ornate petal accents */}
      {Array.from({ length: 16 }).map((_, i) => {
        const angle = (i * 360) / 16;
        return (
          <path
            key={i}
            d="M60 4 Q63 12 60 16 Q57 12 60 4Z"
            fill="#FFE885"
            transform={`rotate(${angle} 60 60)`}
          />
        );
      })}

      {/* Inner blue ring */}
      <circle cx="60" cy="60" r="46" fill="url(#doeBlueGrad)" stroke="#FFEAA7" strokeWidth="2.5" />

      {/* Inner gold decorative circle */}
      <circle cx="60" cy="60" r="41" fill="none" stroke="#E5B232" strokeWidth="1" strokeDasharray="3 2" />

      {/* Stylized Airavata Elephant / Labour Emblem Figure */}
      <g transform="translate(60, 58) scale(0.85)">
        {/* Ornate Thai Crown / Chada */}
        <path
          d="M0 -34 L3 -22 L-3 -22 Z"
          fill="#FFF2A3"
        />
        <path
          d="M-4 -22 C-5 -15 5 -15 4 -22 Z"
          fill="#F59E0B"
        />
        <ellipse cx="0" cy="-14" rx="6" ry="6" fill="#FCD34D" stroke="#B45309" strokeWidth="0.8" />
        
        {/* Radiant flame aura */}
        <path
          d="M-10 -25 Q-16 -12 -9 -5 Q-15 -3 -12 6 Q-6 3 -4 -2"
          stroke="#FDE047"
          strokeWidth="1.2"
          fill="none"
        />
        <path
          d="M10 -25 Q16 -12 9 -5 Q15 -3 12 6 Q6 3 4 -2"
          stroke="#FDE047"
          strokeWidth="1.2"
          fill="none"
        />

        {/* Central Deity / Labourer Figure */}
        <path
          d="M-8 -6 C-12 4 -10 16 0 17 C10 16 12 4 8 -6 Z"
          fill="#FFFBEB"
          stroke="#D97706"
          strokeWidth="1"
        />
        {/* Chest Sash / Thai traditional cloth */}
        <path
          d="M-6 -2 Q0 8 6 14 L4 16 Q-2 10 -8 0 Z"
          fill="#DC2626"
        />
        {/* Lotus base */}
        <path
          d="M-18 16 C-12 24 12 24 18 16 C12 20 -12 20 -18 16 Z"
          fill="#F59E0B"
          stroke="#B45309"
          strokeWidth="1"
        />
        <path
          d="M-14 18 C-8 27 8 27 14 18 C8 23 -8 23 -14 18 Z"
          fill="#FDE047"
        />
      </g>

      {/* Small stars around */}
      <circle cx="28" cy="60" r="1.5" fill="#FFEAA7" />
      <circle cx="92" cy="60" r="1.5" fill="#FFEAA7" />
      <circle cx="60" cy="24" r="1.5" fill="#FFEAA7" />
      <circle cx="60" cy="96" r="1.5" fill="#FFEAA7" />
    </svg>
  );
};
