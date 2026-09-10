import React from "react";

export function CapriSunIcon({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Capri Sun Pouch"
    >
      {/* Straw */}
      <path
        d="M26 14L33 4H37"
        stroke="#F97316"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="26" cy="14" r="2.5" fill="#C2410C" />
      {/* Pouch body */}
      <path
        d="M13 14C13 13 14 12 15 12H33C34 12 35 13 35 14L37 42C37 43.5 35.5 45 34 45H14C12.5 45 11 43.5 11 42L13 14Z"
        fill="url(#foilGradient)"
        stroke="#94A3B8"
        strokeWidth="1.5"
      />
      {/* Pouch crease / reflection highlights */}
      <path
        d="M17 14L15 42M31 14L33 42"
        stroke="#FFFFFF"
        strokeOpacity="0.6"
        strokeWidth="1.2"
        strokeDasharray="2 3"
      />
      {/* Label center */}
      <rect x="16" y="20" width="16" height="14" rx="3" fill="#E11D48" />
      <text
        x="24"
        y="29"
        textAnchor="middle"
        fontSize="6.5"
        fontWeight="bold"
        fill="#FFFFFF"
        fontFamily="sans-serif"
      >
        PUNCH
      </text>
      <defs>
        <linearGradient id="foilGradient" x1="11" y1="12" x2="37" y2="45" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F1F5F9" />
          <stop offset="0.3" stopColor="#CBD5E1" />
          <stop offset="0.5" stopColor="#FFFFFF" />
          <stop offset="0.75" stopColor="#94A3B8" />
          <stop offset="1" stopColor="#E2E8F0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function LifeSaverIcon({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="White Life Saver"
    >
      {/* Outer ring */}
      <circle
        cx="24"
        cy="24"
        r="18"
        fill="url(#mintGradient)"
        stroke="#CBD5E1"
        strokeWidth="1.5"
      />
      {/* Inner hole */}
      <circle cx="24" cy="24" r="7.5" fill="#0F172A" />
      {/* Embossed text ring effect */}
      <circle
        cx="24"
        cy="24"
        r="13"
        stroke="#FFFFFF"
        strokeWidth="1"
        strokeOpacity="0.8"
        strokeDasharray="4 2"
      />
      <text
        x="24"
        y="14.5"
        textAnchor="middle"
        fontSize="4"
        fontWeight="800"
        fill="#94A3B8"
        fontFamily="sans-serif"
        letterSpacing="0.8"
      >
        LIFE
      </text>
      <text
        x="24"
        y="37.5"
        textAnchor="middle"
        fontSize="4"
        fontWeight="800"
        fill="#94A3B8"
        fontFamily="sans-serif"
        letterSpacing="0.8"
      >
        SAVER
      </text>
      <defs>
        <linearGradient id="mintGradient" x1="10" y1="10" x2="38" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="0.4" stopColor="#F8FAFC" />
          <stop offset="0.8" stopColor="#E2E8F0" />
          <stop offset="1" stopColor="#CBD5E1" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function JohnnyBrandLogo({ size = 36 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2 select-none">
      <div className="flex items-center -space-x-2">
        <CapriSunIcon size={size} />
        <LifeSaverIcon size={size * 0.9} />
      </div>
      <div className="flex flex-col text-left leading-tight">
        <span className="font-extrabold tracking-tight text-white uppercase text-lg">
          Johnny’s Jerks
        </span>
        <span className="text-[10px] font-semibold text-rose-300 uppercase tracking-widest">
          Redraft Post-Draft Desk
        </span>
      </div>
    </div>
  );
}
