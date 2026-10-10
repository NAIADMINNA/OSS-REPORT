import React from 'react';

export const OfficerIllustration: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <svg
      viewBox="0 0 240 320"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`select-none ${className}`}
    >
      <defs>
        <linearGradient id="suitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1E293B" />
          <stop offset="50%" stopColor="#0F172A" />
          <stop offset="100%" stopColor="#020617" />
        </linearGradient>
        <linearGradient id="skinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFE0C8" />
          <stop offset="100%" stopColor="#F5C09B" />
        </linearGradient>
        <linearGradient id="hairGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#2A3942" />
          <stop offset="100%" stopColor="#111827" />
        </linearGradient>
        <linearGradient id="tabletGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E2E8F0" />
        </linearGradient>
        <filter id="officerShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodOpacity="0.2" />
        </filter>
      </defs>

      {/* Presenting Left Hand (reaching forward towards left side) */}
      <g filter="url(#officerShadow)">
        {/* Left Arm & Sleeve extending leftward */}
        <path
          d="M100 190 Q60 215 15 220 L25 240 Q75 225 110 205 Z"
          fill="url(#suitGrad)"
        />
        {/* White shirt cuff */}
        <path d="M15 220 L10 223 L18 242 L25 240 Z" fill="#F8FAFC" />
        {/* Open hand presenting data */}
        <path
          d="M10 223 Q-2 220 2 226 Q0 231 10 236 Q5 240 18 242 Z"
          fill="url(#skinGrad)"
        />
      </g>

      {/* Main Torso & Formal Suit */}
      <g filter="url(#officerShadow)">
        {/* Suit Body */}
        <path
          d="M75 160 C65 190 70 270 70 320 L180 320 C180 270 185 190 175 160 C155 140 95 140 75 160 Z"
          fill="url(#suitGrad)"
        />
        {/* White Inner Blouse / Shirt */}
        <path
          d="M105 145 L125 185 L145 145 Q125 138 105 145 Z"
          fill="#FFFFFF"
        />
        {/* Blouse Collar */}
        <path d="M105 145 L125 165 L115 138 Z" fill="#F1F5F9" />
        <path d="M145 145 L125 165 L135 138 Z" fill="#F1F5F9" />
        {/* Suit Lapels */}
        <path
          d="M90 152 L122 220 L112 220 L80 160 Z"
          fill="#334155"
        />
        <path
          d="M160 152 L128 220 L138 220 L170 160 Z"
          fill="#334155"
        />
        {/* Suit Buttons */}
        <circle cx="125" cy="240" r="3" fill="#64748B" />
        <circle cx="125" cy="265" r="3" fill="#64748B" />
      </g>

      {/* Neck & Head */}
      <g>
        {/* Neck */}
        <path d="M115 125 L115 148 L135 148 L135 125 Z" fill="url(#skinGrad)" />
        {/* Head / Face */}
        <path
          d="M105 95 C105 130 145 130 145 95 C145 65 105 65 105 95 Z"
          fill="url(#skinGrad)"
        />
        {/* Ears */}
        <ellipse cx="103" cy="98" rx="3.5" ry="5.5" fill="url(#skinGrad)" />
        <ellipse cx="147" cy="98" rx="3.5" ry="5.5" fill="url(#skinGrad)" />

        {/* Eyes & Smile */}
        <path d="M113 93 Q118 90 122 93" stroke="#0F172A" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="118" cy="95" r="1.5" fill="#0F172A" />
        <path d="M128 93 Q132 90 137 93" stroke="#0F172A" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="132" cy="95" r="1.5" fill="#0F172A" />
        
        {/* Eyebrows */}
        <path d="M112 87 Q118 84 123 87" stroke="#334155" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M127 87 Q132 84 138 87" stroke="#334155" strokeWidth="1.2" strokeLinecap="round" />

        {/* Nose & Smile */}
        <path d="M124 97 L123 102 L126 102" stroke="#E2A177" strokeWidth="1" strokeLinecap="round" />
        <path d="M120 108 Q125 113 130 108" stroke="#E11D48" strokeWidth="1.6" strokeLinecap="round" />

        {/* Elegant Hair (DOE style formal bun) */}
        <path
          d="M102 92 C98 70 120 52 135 55 C152 58 152 75 148 92 C142 80 135 78 125 78 C115 78 108 82 102 92 Z"
          fill="url(#hairGrad)"
        />
        <circle cx="142" cy="62" r="14" fill="url(#hairGrad)" />
        {/* Hair strands and fringe */}
        <path
          d="M104 84 Q116 76 130 80 Q118 86 112 96 Z"
          fill="url(#hairGrad)"
        />
      </g>

      {/* Right Arm Holding Document Tablet / Folder */}
      <g filter="url(#officerShadow)">
        {/* Upper Arm */}
        <path
          d="M170 165 Q195 200 185 240 L165 235 Q175 200 155 175 Z"
          fill="url(#suitGrad)"
        />
        {/* Forearm angled forward */}
        <path
          d="M185 240 Q170 260 140 250 L145 235 Q165 240 165 235 Z"
          fill="url(#suitGrad)"
        />
        
        {/* Folder / Tablet held in hands */}
        <g transform="translate(118, 220) rotate(-10)">
          <rect
            x="0"
            y="0"
            width="64"
            height="50"
            rx="4"
            fill="url(#tabletGrad)"
            stroke="#94A3B8"
            strokeWidth="1.5"
          />
          {/* Header line on folder */}
          <rect x="6" y="8" width="52" height="3" rx="1.5" fill="#3B82F6" />
          <rect x="6" y="16" width="40" height="2.5" rx="1" fill="#94A3B8" />
          <rect x="6" y="22" width="48" height="2.5" rx="1" fill="#CBD5E1" />
          <rect x="6" y="28" width="34" height="2.5" rx="1" fill="#CBD5E1" />

          {/* Thai text on folder: จึงเรียนมาเพื่อโปรดทราบ */}
          <rect x="6" y="34" width="52" height="11" rx="2" fill="#FEF3C7" />
          <text
            x="32"
            y="42"
            textAnchor="middle"
            fontSize="5.5"
            fontWeight="bold"
            fill="#B45309"
            fontFamily="Sarabun, Prompt, sans-serif"
          >
            จึงเรียนมาเพื่อโปรดทราบ
          </text>

          {/* Hand fingers clasping the tablet */}
          <path
            d="M5 20 Q12 18 12 25 Q12 32 5 30 Z"
            fill="url(#skinGrad)"
          />
        </g>
      </g>
    </svg>
  );
};
